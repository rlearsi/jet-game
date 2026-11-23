import * as THREE from 'three';
import { getTerrainHeight, WATER_LEVEL } from './world.js?v=36';
import { SHIP_IDS, SHIP_CATALOG, buildJetVisualRig, buildAirfoilSurface } from './jets/index.js?v=36';
import { DitheredParticlePool } from './particles.js?v=36';

export { SHIP_IDS, SHIP_CATALOG, buildJetVisualRig, buildAirfoilSurface };

const COL_YELLOW = new THREE.Color(0xffef7a);
const COL_ORANGE = new THREE.Color(0xf28836);
const COL_SMOKE = new THREE.Color(0xb6b0c8);
const COL_FIRE_HOT = new THREE.Color(0xfff066);
const COL_FIRE_WARM = new THREE.Color(0xff962e);
const COL_FIRE_RED = new THREE.Color(0xf2461c);
const COL_SOOT_DARK = new THREE.Color(0x2d2834);
const COL_SOOT_MID = new THREE.Color(0x4a4456);

const TMP_COLOR = new THREE.Color();
const TMP_VEC_A = new THREE.Vector3();
const TMP_VEC_B = new THREE.Vector3();
const TMP_FWD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_EULER = new THREE.Euler();

function pushExhaustPuffsForJet(jetObj, maxPuffs, backSpeed, abLife, cruiseLife, abSize, cruiseSize) {
  const nx = Number.isFinite(jetObj.nozzleX) ? jetObj.nozzleX : 0.40;
  const ny = jetObj.nozzleY || 0.0;
  const nz = (jetObj.nozzleZ || 2.60) + 0.85;
  const xs = jetObj.engineCount === 1 ? [0] : [-nx, nx];

  TMP_EULER.set(jetObj.pitch, jetObj.yaw, 0, 'YXZ');
  TMP_FWD.set(0, 0, -1).applyEuler(TMP_EULER).normalize().multiplyScalar(-backSpeed);

  const initSize = jetObj.afterburner ? abSize : cruiseSize;
  const maxAge = jetObj.afterburner ? abLife : cruiseLife;

  for (const sx of xs) {
    if (jetObj.puffs.length >= maxPuffs) jetObj.puffs.shift();
    jetObj.getWorldPoint(sx, ny, nz, TMP_VEC_A);
    jetObj.puffs.push({
      x: TMP_VEC_A.x,
      y: TMP_VEC_A.y,
      z: TMP_VEC_A.z,
      vx: TMP_FWD.x + (Math.random() - 0.5) * 3.0,
      vy: TMP_FWD.y + (Math.random() - 0.5) * 3.0,
      vz: TMP_FWD.z + (Math.random() - 0.5) * 3.0,
      age: 0,
      maxAge,
      initSize,
      ab: jetObj.afterburner,
      isDamageFire: false,
      dmg: 0,
    });
  }
}

function pushDamageFirePuffsForJet(jetObj, dmgRatio, maxPuffs, backSpeed, baseLife) {
  if (jetObj.puffs.length >= maxPuffs) return;
  TMP_EULER.set(jetObj.pitch, jetObj.yaw, 0, 'YXZ');
  TMP_FWD.set(0, 0, -1).applyEuler(TMP_EULER).normalize().multiplyScalar(-backSpeed);

  const count = dmgRatio > 0.72 ? 3 : dmgRatio > 0.42 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    if (jetObj.puffs.length >= maxPuffs) break;
    const ox = (Math.random() - 0.5) * (1.2 + dmgRatio * 1.4);
    const oy = (Math.random() - 0.3) * 0.45;
    const oz = 1.2 + Math.random() * 1.8;
    jetObj.getWorldPoint(ox, oy, oz, TMP_VEC_A);
    const initSize = (0.40 + dmgRatio * 0.62) * (0.8 + Math.random() * 0.45);

    jetObj.puffs.push({
      x: TMP_VEC_A.x,
      y: TMP_VEC_A.y,
      z: TMP_VEC_A.z,
      vx: TMP_FWD.x + (Math.random() - 0.5) * 4.5,
      vy: TMP_FWD.y + 3.0 + Math.random() * 5.0,
      vz: TMP_FWD.z + (Math.random() - 0.5) * 4.5,
      age: 0,
      maxAge: baseLife + dmgRatio * 0.62,
      initSize,
      ab: false,
      isDamageFire: true,
      dmg: dmgRatio,
    });
  }
}

function updateJetPuffPool(puffs, puffPool, dt, abGrow = 3.6, cruiseGrow = 2.4) {
  puffPool.beginFrame();
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.age += dt;
    if (p.age >= p.maxAge) {
      puffs.splice(i, 1);
      continue;
    }

    const t = p.age / p.maxAge;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.vz *= 0.95;

    let scale;
    let alpha;
    if (p.isDamageFire) {
      scale = p.initSize * (1.0 + t * (2.6 + p.dmg * 2.2));
      if (t < 0.24) {
        TMP_COLOR.copy(p.dmg > 0.5 ? COL_FIRE_HOT : COL_FIRE_WARM);
        alpha = 1.0;
      } else if (t < 0.52) {
        TMP_COLOR.copy(COL_FIRE_RED);
        alpha = 1.0 - (t - 0.24) * 0.45;
      } else {
        const sootT = (t - 0.52) / 0.48;
        TMP_COLOR.copy(COL_SOOT_DARK).lerp(COL_SOOT_MID, sootT);
        alpha = Math.max(0, 1.0 - sootT) * (0.65 + p.dmg * 0.3);
      }
    } else {
      // Pequeno foguinho amarelo do motor (~1/3 da nave), sem gerar fumaça
      scale = p.initSize * (1.0 - t * 0.65);
      TMP_COLOR.copy(COL_YELLOW);
      alpha = Math.max(0, 1.0 - t * 0.9);
    }

    puffPool.push(p.x, p.y, p.z, scale, TMP_COLOR.r, TMP_COLOR.g, TMP_COLOR.b, alpha);
  }
  puffPool.endFrame();
}

function assignRigToJet(target, rig) {
  target.group = rig.group;
  target.visual = rig.visual;
  target.hullGroup = rig.hullGroup;
  target.flameL = rig.flameL;
  target.flameR = rig.flameR;
  target.muzzleFlash = rig.muzzleFlash;
  target.wingtipPoint = rig.wingtipPoint;
  target.nozzleX = rig.nozzleX;
  target.nozzleY = rig.nozzleY || 0.0;
  target.nozzleZ = rig.nozzleZ;
  target.engineCount = rig.engineCount ?? 2;
}

class RibbonTrail {
  constructor(scene, maxPoints = 82, width = 0.14, color = 0xffffff) {
    this.maxPoints = maxPoints;
    this.width = width;
    this.points = [];

    const positions = new Float32Array(maxPoints * 2 * 3);
    const indices = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geo.setIndex(indices);

    this.mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  push(worldPos, rightVec) {
    this.points.unshift({ pos: worldPos.clone(), right: rightVec.clone() });
    if (this.points.length > this.maxPoints) {
      this.points.pop();
    }
    this.rebuild();
  }

  rebuild() {
    const posArr = this.geo.attributes.position.array;
    const count = this.points.length;
    if (count < 2) return;

    for (let i = 0; i < this.maxPoints; i++) {
      const pt = this.points[Math.min(i, count - 1)];
      const taper = 1.0 - (i / this.maxPoints) * 0.58;
      const hw = this.width * 0.5 * taper;

      const idx = i * 6;
      posArr[idx] = pt.pos.x - pt.right.x * hw;
      posArr[idx + 1] = pt.pos.y - pt.right.y * hw;
      posArr[idx + 2] = pt.pos.z - pt.right.z * hw;
      posArr[idx + 3] = pt.pos.x + pt.right.x * hw;
      posArr[idx + 4] = pt.pos.y + pt.right.y * hw;
      posArr[idx + 5] = pt.pos.z + pt.right.z * hw;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  clear() {
    this.points.length = 0;
    this.geo.attributes.position.array.fill(0);
    this.geo.attributes.position.needsUpdate = true;
  }

  setVisible(v) {
    this.mesh.visible = v;
  }
}

function lerpAngle(a, b, t) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

export class FighterJet {
  constructor(scene, shipId = 'striker') {
    this.scene = scene;
    this.shipId = SHIP_CATALOG[shipId] ? shipId : 'striker';
    this.stats = SHIP_CATALOG[this.shipId];
    assignRigToJet(this, buildJetVisualRig(this.shipId));
    scene.add(this.group);

    this.visual.scale.setScalar(0.74);

    this.leftTrail = new RibbonTrail(scene, 84, 0.14, 0xffffff);
    this.rightTrail = new RibbonTrail(scene, 84, 0.14, 0xffffff);
    this.trailTimer = 0;

    this.puffs = [];
    this.puffPool = new DitheredParticlePool(scene, 180);
    this.puffTimer = 0;
    this.damageTrailTimer = 0;

    // Start over the central bay facing islands, ships, lighthouses & sky balloons
    this.position = new THREE.Vector3(-85, 86, 195);
    this.yaw = 0.18;
    this.pitch = -0.05;
    this.bank = 0;
    this.rollAnim = 0;
    this.rollDir = 1;
    this.rollExtra = 0;

    this.speed = this.stats.cruiseSpeed;
    this.throttle = 0.65;
    this.afterburner = false;
    this.gForce = 1.0;
    this.vsi = 0;
    this.radarAlt = 86;
    this.lowAltWarning = false;

    this.maxHp = this.stats.maxHp;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.staminaExhausted = false;
    this.maxStamina = 100;
    this.stamina = 100;
    this.staminaExhausted = false;
    this.alive = true;
    this.respawnTimer = 0;
    this.spawnProtection = 2.0;
    this.damageCooldown = 0;
    this.scrapeCooldown = 0;

    this.velocity = new THREE.Vector3(0, 0, -this.speed);
    this.prevPitch = this.pitch;
    this.prevYaw = this.yaw;

    this.group.position.copy(this.position);
  }

  setShip(shipId) {
    const id = SHIP_CATALOG[shipId] ? shipId : 'striker';
    const prevScale = this.visual ? this.visual.scale.x : 0.74;
    const prevVisible = this.group ? this.group.visible : true;
    const prevRatio = this.maxHp > 0 ? this.hp / this.maxHp : 1;

    if (this.group) {
      this.scene.remove(this.group);
    }

    this.shipId = id;
    this.stats = SHIP_CATALOG[id];
    assignRigToJet(this, buildJetVisualRig(id));

    this.hullGroup.traverse((obj) => {
      if (obj.isMesh) obj.layers.enable(1);
    });

    this.visual.scale.setScalar(prevScale);
    this.group.position.copy(this.position);
    this.group.visible = prevVisible;
    this.scene.add(this.group);

    this.maxHp = this.stats.maxHp;
    this.hp = Math.max(1, Math.min(this.maxHp, Math.round(prevRatio * this.maxHp)));
    this.leftTrail.clear();
    this.rightTrail.clear();
  }

  clearPuffs() {
    this.puffs.length = 0;
    this.puffPool.clear();
  }

  respawn(offsetIndex = 0) {
    this.position.set(
      -85 + (offsetIndex % 4) * 32,
      86 + (offsetIndex % 2) * 14,
      195 + Math.floor(offsetIndex / 4) * 32
    );
    this.yaw = 0.18;
    this.pitch = -0.04;
    this.bank = 0;
    this.rollAnim = 0;
    this.rollExtra = 0;
    this.speed = this.stats.cruiseSpeed;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.staminaExhausted = false;
    this.alive = true;
    this.respawnTimer = 0;
    this.spawnProtection = 2.0;
    this.damageTrailTimer = 0;
    this.damageCooldown = 0;
    const fwd = this.getForwardDirection(TMP_FWD);
    this.velocity.copy(fwd).multiplyScalar(this.speed);
    this.leftTrail.clear();
    this.rightTrail.clear();
    this.clearPuffs();
    this.group.position.copy(this.position);
    this.group.visible = true;
  }

  triggerRoll(dir = 1) {
    if (this.rollAnim <= 0) {
      this.rollAnim = 1.0;
      this.rollDir = dir >= 0 ? 1 : -1;
    }
  }

  setMuzzleFlash(active) {
    this.muzzleFlash.visible = active;
    if (active) {
      const s = 0.75 + Math.random() * 0.75;
      this.muzzleFlash.scale.set(s, s, s * 1.8);
      this.muzzleFlash.rotation.z = Math.random() * Math.PI;
    }
  }

  setVisible(visible) {
    this.group.visible = visible;
    this.leftTrail.setVisible(visible);
    this.rightTrail.setVisible(visible);
  }

  getWorldPoint(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyMatrix4(this.visual.matrixWorld);
  }

  getForwardDirection(out = new THREE.Vector3()) {
    TMP_EULER.set(this.pitch, this.yaw, 0, 'YXZ');
    return out.set(0, 0, -1).applyEuler(TMP_EULER).normalize();
  }

  spawnExhaustPuffs() {
    pushExhaustPuffsForJet(this, 180, 10, 0.16, 0.10, 0.24, 0.16);
  }

  spawnDamageFirePuffs(dmgRatio) {
    pushDamageFirePuffsForJet(this, dmgRatio, 180, 9.5, 0.65);
  }

  updatePuffs(dt) {
    updateJetPuffPool(this.puffs, this.puffPool, dt, 3.6, 2.4);
  }

  update(dt, input, isCockpit) {
    const sens = input.sensitivity ?? 1.0;
    const ySign = input.invertY ? -1 : 1;
    const joyYSign = input.gamepadInvertY ? -1 : 1;
    let steerX;
    let steerY;
    if (input.touchActive) {
      steerX = THREE.MathUtils.clamp((input.touchX || 0) * sens, -1, 1);
      steerY = THREE.MathUtils.clamp((input.touchY || 0) * sens * ySign, -1, 1);
    } else if (input.gamepadActive) {
      steerX = THREE.MathUtils.clamp((input.joyX || 0) * sens, -1, 1);
      steerY = THREE.MathUtils.clamp((input.joyY || 0) * sens * joyYSign, -1, 1);
    } else {
      steerX = THREE.MathUtils.clamp((input.mouseX || 0) * sens, -1, 1);
      steerY = THREE.MathUtils.clamp((input.mouseY || 0) * sens * ySign, -1, 1);
      const dead = 0.04;
      if (Math.abs(steerX) < dead) steerX = 0;
      if (Math.abs(steerY) < dead) steerY = 0;
    }

    const keys = input.keys || {};
    if (keys.KeyA || keys.ArrowLeft) steerX = -0.85;
    if (keys.KeyD || keys.ArrowRight) steerX = 0.85;
    if (keys.KeyW || keys.ArrowUp) steerY = -0.7 * ySign;
    if (keys.KeyS || keys.ArrowDown) steerY = 0.7 * ySign;

    const rawSharpTurnDir = input.joySharpTurn
      ? Math.sign(input.joySharpTurn)
      : (input.sharpTurnHeld && Math.abs(steerX) > 0.12 ? Math.sign(steerX) : 0);
    if (input.joySharpTurn) {
      steerX = rawSharpTurnDir;
    }

    const abKey = input.afterburnerKey || 'ShiftLeft';
    const wantsBoost = Boolean(
      input.boost || input.joyBoost || input.touchBoost || keys[abKey] || (abKey === 'ShiftLeft' && keys.ShiftRight)
    );
    const wantsSharpTurn = rawSharpTurnDir !== 0;
    const wantsTurbo = wantsBoost || wantsSharpTurn;

    if (this.staminaExhausted && this.stamina >= 18) {
      this.staminaExhausted = false;
    }
    const canUseTurbo = !this.staminaExhausted && this.stamina > 0;
    this.afterburner = wantsTurbo && canUseTurbo;
    const sharpTurnDir = (wantsSharpTurn && canUseTurbo) ? rawSharpTurnDir : 0;

    if (this.afterburner) {
      const drainRate = wantsSharpTurn ? 28 : 18;
      this.stamina = Math.max(0, this.stamina - drainRate * dt);
      if (this.stamina <= 0) {
        this.staminaExhausted = true;
        this.afterburner = false;
      }
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + 11.5 * dt);
    }

    const targetThrottle = this.afterburner ? 1.0 : 0.64;
    this.throttle = THREE.MathUtils.lerp(this.throttle, targetThrottle, 1 - Math.exp(-5.0 * dt));

    // Ângulo de inclinação (bank): 90° (PI/2) na virada súbita com turbo, ~70° no turbo, ~55° na curva normal
    const bankLimit = sharpTurnDir !== 0
      ? Math.PI * 0.5
      : (this.afterburner ? 1.22 : 0.96);
    const bankRate = sharpTurnDir !== 0 ? 11.5 : 6.5;
    const targetBank = -steerX * bankLimit;
    const targetPitch = THREE.MathUtils.clamp(-steerY * 0.68, -0.62, 0.62);

    this.bank = THREE.MathUtils.lerp(this.bank, targetBank, 1 - Math.exp(-bankRate * dt));
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, 1 - Math.exp(-5.2 * dt));

    // Curva normal sem turbo é 30% menos eficiente (abre mais a curva)
    const baseTurnSpeed = this.afterburner ? this.stats.abTurnRate : this.stats.turnRate * 0.7;
    const turnSpeed = sharpTurnDir !== 0 ? baseTurnSpeed * 1.75 : baseTurnSpeed;
    this.yaw += Math.sin(this.bank) * turnSpeed * dt;
    if (sharpTurnDir !== 0) {
      this.yaw += -sharpTurnDir * baseTurnSpeed * 0.35 * dt;
    }

    const climbDrag = -Math.sin(this.pitch) * 14.0;
    const targetSpeed = (this.afterburner ? this.stats.abSpeed : this.stats.cruiseSpeed) + climbDrag;
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, 1 - Math.exp(-2.6 * dt));

    const fwd = this.getForwardDirection(TMP_FWD);
    this.velocity.copy(fwd).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);

    if (this.spawnProtection > 0) this.spawnProtection = Math.max(0, this.spawnProtection - dt);
    if (this.scrapeCooldown > 0) this.scrapeCooldown = Math.max(0, this.scrapeCooldown - dt);
    const groundY = Math.max(WATER_LEVEL, getTerrainHeight(this.position.x, this.position.z));
    this.radarAlt = Math.max(0, this.position.y - groundY);
    this.lowAltWarning = this.radarAlt < 16;

    if (this.spawnProtection > 0 && this.position.y < groundY + 6.5) {
      this.position.y = groundY + 6.5;
      if (this.pitch < 0.06) this.pitch = THREE.MathUtils.lerp(this.pitch, 0.18, 0.25);
    }
    if (this.position.y > 420) {
      this.position.y = 420;
      if (this.pitch > 0) this.pitch *= 0.85;
    }

    const dPitch = (this.pitch - this.prevPitch) / Math.max(dt, 0.001);
    const dYaw = (this.yaw - this.prevYaw) / Math.max(dt, 0.001);
    const rawG = 1.0 + Math.abs(dPitch) * 2.4 + Math.abs(dYaw) * 1.6 + Math.abs(Math.sin(this.bank)) * 0.85;
    this.gForce = THREE.MathUtils.lerp(this.gForce, Math.min(9.0, rawG), 1 - Math.exp(-6 * dt));
    this.vsi = this.velocity.y;
    this.prevPitch = this.pitch;
    this.prevYaw = this.yaw;

    let extraRoll = 0;
    if (this.rollAnim > 0) {
      this.rollAnim = Math.max(0, this.rollAnim - dt * 1.85);
      extraRoll = (1.0 - this.rollAnim) * Math.PI * 2 * this.rollDir;
    }
    this.rollExtra = extraRoll;

    this.group.position.copy(this.position);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = this.pitch;
    this.visual.rotation.z = this.bank + extraRoll;

    this.group.updateMatrixWorld(true);

    // Animate twin afterburner cones
    const flicker = 0.85 + Math.random() * 0.34;
    const fLen = (this.afterburner ? 1.65 : 0.72) * flicker;
    const fRad = this.afterburner ? 1.18 : 0.78;
    this.flameL.scale.set(fRad, fRad, fLen);
    this.flameR.scale.set(fRad, fRad, fLen);

    // Update crisp white wingtip contrails right from sculpted wingtips
    this.trailTimer += dt;
    if (this.trailTimer >= 0.018) {
      this.trailTimer = 0;
      TMP_EULER.set(this.pitch, this.yaw, this.bank + extraRoll, 'YXZ');
      TMP_QUAT.setFromEuler(TMP_EULER);
      TMP_RIGHT.set(1, 0, 0).applyQuaternion(TMP_QUAT);
      const [wx, wy, wz] = this.wingtipPoint;
      const tipL = this.getWorldPoint(-wx, wy, wz, TMP_VEC_A);
      const tipR = this.getWorldPoint(wx, wy, wz, TMP_VEC_B);
      this.leftTrail.push(tipL, TMP_RIGHT);
      this.rightTrail.push(tipR, TMP_RIGHT);
    }

    if (!isCockpit) {
      this.puffTimer += dt;
      const interval = this.afterburner ? 0.046 : 0.085;
      if (this.puffTimer >= interval) {
        this.puffTimer = 0;
        this.spawnExhaustPuffs();
      }
    }
    if (this.alive) {
      const dmgRatio = 1.0 - Math.max(0, Math.min(1, this.hp / Math.max(1, this.maxHp)));
      if (dmgRatio > 0.12) {
        this.damageTrailTimer += dt;
        const dmgInterval = THREE.MathUtils.lerp(0.14, 0.018, Math.pow(dmgRatio, 0.85));
        if (this.damageTrailTimer >= dmgInterval) {
          this.damageTrailTimer = 0;
          this.spawnDamageFirePuffs(dmgRatio);
        }
      }
    }
    this.updatePuffs(dt);
  }
}

/**
 * Network-controlled remote player fighter jet with smooth dead-reckoning interpolation,
 * squadron accent colors, wingtip contrails, and instanced dithered exhaust puffs.
 */
export class RemoteJet {
  constructor(scene, id, name = 'PILOT', colorHex = '#36d6ff', shipId = 'striker') {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.label = name;
    this.colorHex = colorHex;
    this.shipId = SHIP_CATALOG[shipId] ? shipId : 'striker';
    this.type = 'player';
    this.r = 8.5;
    this.h = 5.0;

    assignRigToJet(this, buildJetVisualRig(this.shipId, colorHex));

    this.hullGroup.traverse((obj) => {
      if (obj.isMesh) obj.layers.enable(1);
    });

    this.visual.scale.setScalar(0.74);
    scene.add(this.group);

    this.leftTrail = new RibbonTrail(scene, 72, 0.14, 0xffffff);
    this.rightTrail = new RibbonTrail(scene, 72, 0.14, 0xffffff);
    this.trailTimer = 0;

    this.puffs = [];
    this.puffPool = new DitheredParticlePool(scene, 140);
    this.puffTimer = 0;
    this.damageTrailTimer = 0;

    this.position = new THREE.Vector3(-85, 96, 225);
    this.targetPos = this.position.clone();
    this.velocity = new THREE.Vector3(0, 0, -64);

    this.x = this.position.x;
    this.y = this.position.y;
    this.z = this.position.z;

    this.yaw = 0.18;
    this.targetYaw = 0.18;
    this.pitch = -0.04;
    this.targetPitch = -0.04;
    this.bank = 0;
    this.targetBank = 0;
    this.rollExtra = 0;
    this.targetRollExtra = 0;

    this.afterburner = false;
    this.maxHp = SHIP_CATALOG[this.shipId].maxHp;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.staminaExhausted = false;
    this.alive = true;
    this.muzzleTimer = 0;
    this.hasReceivedState = false;
  }

  setShip(shipId) {
    const id = SHIP_CATALOG[shipId] ? shipId : 'striker';
    if (id === this.shipId) return;
    const prevScale = this.visual ? this.visual.scale.x : 0.74;
    const prevVisible = this.visual ? this.visual.visible : true;

    this.scene.remove(this.group);
    this.shipId = id;
    this.maxHp = SHIP_CATALOG[id].maxHp;

    assignRigToJet(this, buildJetVisualRig(id, this.colorHex));

    this.hullGroup.traverse((obj) => {
      if (obj.isMesh) obj.layers.enable(1);
    });
    this.visual.scale.setScalar(prevScale);
    this.visual.visible = prevVisible;
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this.leftTrail.clear();
    this.rightTrail.clear();
  }

  applyNetworkState(st) {
    if (st.sh && st.sh !== this.shipId) {
      this.setShip(st.sh);
    }
    if (!this.hasReceivedState) {
      this.position.set(st.x, st.y, st.z);
      this.yaw = st.yw;
      this.pitch = st.pt;
      this.bank = st.bk;
      this.rollExtra = st.rl || 0;
      this.hasReceivedState = true;
    }
    this.targetPos.set(st.x, st.y, st.z);
    this.velocity.set(st.vx || 0, st.vy || 0, st.vz || 0);
    this.targetYaw = st.yw;
    this.targetPitch = st.pt;
    this.targetBank = st.bk;
    this.targetRollExtra = st.rl || 0;
    this.afterburner = Boolean(st.ab);
    if (typeof st.hp === 'number') this.hp = st.hp;

    const wasAlive = this.alive;
    this.alive = st.al !== false && this.hp > 0;
    if (wasAlive && !this.alive) {
      this.visual.visible = false;
      this.leftTrail.setVisible(false);
      this.rightTrail.setVisible(false);
    } else if (!wasAlive && this.alive) {
      this.position.copy(this.targetPos);
      this.leftTrail.clear();
      this.rightTrail.clear();
      this.visual.visible = true;
      this.leftTrail.setVisible(true);
      this.rightTrail.setVisible(true);
    }
  }

  triggerMuzzleFlash() {
    this.muzzleTimer = 0.07;
  }

  getWorldPoint(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyMatrix4(this.visual.matrixWorld);
  }

  spawnExhaustPuffs() {
    pushExhaustPuffsForJet(this, 140, 12, 0.72, 0.44, 0.50, 0.32);
  }

  spawnDamageFirePuffs(dmgRatio) {
    pushDamageFirePuffsForJet(this, dmgRatio, 140, 9.5, 0.62);
  }

  updatePuffs(dt) {
    updateJetPuffPool(this.puffs, this.puffPool, dt, 3.5, 2.2);
  }

  update(dt, localJetPos) {
    // Dead-reckoning prediction + smooth catchup
    this.targetPos.addScaledVector(this.velocity, dt);
    const posBlend = 1 - Math.exp(-12 * dt);
    this.position.lerp(this.targetPos, posBlend);

    const rotBlend = 1 - Math.exp(-14 * dt);
    this.yaw = lerpAngle(this.yaw, this.targetYaw, rotBlend);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, rotBlend);
    this.bank = THREE.MathUtils.lerp(this.bank, this.targetBank, rotBlend);
    this.rollExtra = lerpAngle(this.rollExtra, this.targetRollExtra, rotBlend);

    this.x = this.position.x;
    this.y = this.position.y;
    this.z = this.position.z;

    this.group.position.copy(this.position);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = this.pitch;
    this.visual.rotation.z = this.bank + this.rollExtra;
    this.group.updateMatrixWorld(true);

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      this.muzzleFlash.visible = true;
      const s = 0.75 + Math.random() * 0.75;
      this.muzzleFlash.scale.set(s, s, s * 1.8);
      this.muzzleFlash.rotation.z = Math.random() * Math.PI;
    } else {
      this.muzzleFlash.visible = false;
    }

    if (this.alive) {
      const flicker = 0.85 + Math.random() * 0.34;
      const fLen = (this.afterburner ? 1.65 : 0.72) * flicker;
      const fRad = this.afterburner ? 1.18 : 0.78;
      this.flameL.scale.set(fRad, fRad, fLen);
      this.flameR.scale.set(fRad, fRad, fLen);

      this.trailTimer += dt;
      if (this.trailTimer >= 0.022) {
        this.trailTimer = 0;
        TMP_EULER.set(this.pitch, this.yaw, this.bank + this.rollExtra, 'YXZ');
        TMP_QUAT.setFromEuler(TMP_EULER);
        TMP_RIGHT.set(1, 0, 0).applyQuaternion(TMP_QUAT);
        const [wx, wy, wz] = this.wingtipPoint;
        const tipL = this.getWorldPoint(-wx, wy, wz, TMP_VEC_A);
        const tipR = this.getWorldPoint(wx, wy, wz, TMP_VEC_B);
        this.leftTrail.push(tipL, TMP_RIGHT);
        this.rightTrail.push(tipR, TMP_RIGHT);
      }

      const dist = localJetPos ? this.position.distanceTo(localJetPos) : 0;
      if (dist < 550) {
        this.puffTimer += dt;
        const interval = this.afterburner ? 0.052 : 0.095;
        if (this.puffTimer >= interval) {
          this.puffTimer = 0;
          this.spawnExhaustPuffs();
        }
        const dmgRatio = 1.0 - Math.max(0, Math.min(1, this.hp / Math.max(1, this.maxHp)));
        if (dmgRatio > 0.12) {
          this.damageTrailTimer += dt;
          const dmgInterval = THREE.MathUtils.lerp(0.15, 0.022, Math.pow(dmgRatio, 0.85));
          if (this.damageTrailTimer >= dmgInterval) {
            this.damageTrailTimer = 0;
            this.spawnDamageFirePuffs(dmgRatio);
          }
        }
      }
    }

    this.updatePuffs(dt);
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.leftTrail.mesh);
    this.scene.remove(this.rightTrail.mesh);
    this.leftTrail.geo.dispose();
    this.leftTrail.mat.dispose();
    this.rightTrail.geo.dispose();
    this.rightTrail.mat.dispose();
    this.puffs.length = 0;
    this.puffPool.dispose();
  }
}

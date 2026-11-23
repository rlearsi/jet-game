import * as THREE from 'three';
import { getTerrainHeight, WATER_LEVEL } from './world.js?v=36';
import { DitheredParticlePool } from './particles.js?v=36';

const _tmpColor = new THREE.Color();
const _tmpVel = new THREE.Vector3();
const _tmpPos = new THREE.Vector3();

export class MissileSystem {
  constructor(scene, sound, world) {
    this.scene = scene;
    this.sound = sound;
    this.world = world;

    // Missiles (F / Enter / Middle click) — strictly limited; refill via map crates!
    this.maxAmmo = 4;
    this.ammo = 4;
    this.cooldown = 0;
    this.nextSide = -1;
    this.fox2Timer = 0;

    // Rapid-fire Autocannon (Right click)
    this.cannonCooldown = 0;
    this.cannonRate = 0.068;
    this.cannonDamage = 16;
    this.cannonSide = 1;
    this.cannonActive = false;
    this.muzzleTimer = 0;

    this.shake = 0;
    this.destroyed = 0;
    this.hitMarkerTimer = 0;
    this.killBannerText = '';
    this.killBannerTimer = 0;
    this.lockedTarget = null;
    this.incomingMissile = null;

    this.missiles = [];
    this.bullets = [];
    this.particles = [];
    this.burners = []; // persistent smoking wreck plumes after destroying targets!

    this.missileGeo = new THREE.BoxGeometry(0.32, 0.32, 2.3);
    this.missileMat = new THREE.MeshBasicMaterial({ color: 0xfff3a8 });

    this.shipMissileGeo = new THREE.BoxGeometry(0.62, 0.62, 3.8);
    this.shipMissileMat = new THREE.MeshBasicMaterial({ color: 0xff5a26 });

    this.bulletGeo = new THREE.BoxGeometry(0.18, 0.18, 4.8);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff59e });

    this.particlePool = new DitheredParticlePool(scene, 380);
    this.netHooks = {};
  }

  addBurner(x, y, z, life, big) {
    if (this.burners.length >= 18) {
      this.burners.shift();
    }
    this.burners.push({
      pos: new THREE.Vector3(x, y, z),
      life,
      acc: 0,
      big,
    });
  }

  setNetHooks(hooks = {}) {
    this.netHooks = hooks || {};
  }

  setShipStats(stats) {
    if (!stats) return;
    const prevMax = this.maxAmmo;
    this.maxAmmo = stats.maxMissiles || 4;
    this.cannonRate = stats.cannonCd || 0.068;
    this.cannonDamage = stats.cannonDmg || 16;
    if (this.maxAmmo !== prevMax) {
      this.ammo = this.maxAmmo;
    } else {
      this.ammo = Math.min(this.ammo, this.maxAmmo);
    }
  }

  refillMissiles(amount = 4) {
    const before = this.ammo;
    this.ammo = Math.min(this.maxAmmo, this.ammo + amount);
    return this.ammo - before;
  }

  resetAmmo() {
    this.ammo = this.maxAmmo;
  }

  // Destroy all destructible world objects within radius and spawn unmistakable fireball + wreck smoke!
  destroyAt(pos, radius, time, silentNet = false) {
    const killed = this.world.damage(pos, radius);
    if (!killed.length) return 0;

    let majorHit = false;
    let bestLabel = '';
    let droppedMedkit = false;
    let spawnedMissileDrop = false;

    for (const o of killed) {
      const cy = o.type === 'balloon' ? o.y + 6 : o.y + Math.min(4, (o.h || 6) * 0.4);
      const p = new THREE.Vector3(o.x, cy, o.z);
      const isMajor = o.type !== 'tree';
      if (isMajor) majorHit = true;

      if (o.label) bestLabel = o.label;
      else if (!bestLabel) bestLabel = o.type === 'tree' ? 'TREE' : 'TARGET';

      const count = isMajor ? 22 : 10;
      for (let i = 0; i < count; i++) {
        const spread = isMajor ? 28 : 16;
        _tmpVel.set(
          (Math.random() - 0.5) * spread,
          6 + Math.random() * (isMajor ? 26 : 16),
          (Math.random() - 0.5) * spread
        );
        const r = Math.random();
        const col = r < 0.3 ? 0xfff28c : r < 0.62 ? 0xf57a2e : r < 0.82 ? o.color : 0x4b4658;
        this.spawnParticle(
          p,
          _tmpVel,
          (isMajor ? 2.0 : 1.1) + Math.random() * 1.6,
          0.75 + Math.random() * 0.65,
          col,
          2.6,
          true
        );
      }

      if (o.type === 'ship' || o.type === 'boat') {
        this.world.addWaterRipple(o.x, o.z, time);
      }

      // Add persistent rising smoke & fire plume on destroyed structures/ships
      if (o.type !== 'balloon') {
        this.addBurner(o.x, Math.max(WATER_LEVEL + 0.8, o.y + 1.0), o.z, isMajor ? 10.0 : 3.5, isMajor);
      }

      if (!silentNet) {
        this.netHooks.onTargetKilled?.(o);

        // 1. Rare sky balloons drop a falling PINK-CROSS full-heal medkit crate!
        if (o.type === 'balloon') {
          const drop = this.world.spawnDroppedPickup('health', o.x, o.y + 6, o.z);
          if (drop) {
            droppedMedkit = true;
            this.netHooks.onSpawnDrop?.(drop);
          }
        } else if (!spawnedMissileDrop && o.type === 'ship') {
          // 2. ONLY destroyed naval ships have a rare chance to drop a sea-skim missile crate (never houses, boats or ground targets)!
          const chance = this.ammo === 0 ? 0.35 : 0.22;
          if (Math.random() < chance) {
            const drop = this.world.spawnDroppedPickup('missile', o.x, WATER_LEVEL + 5.0, o.z);
            if (drop) {
              spawnedMissileDrop = true;
              this.netHooks.onSpawnDrop?.(drop);
            }
          }
        }
      }
    }

    this.destroyed += killed.length;
    this.hitMarkerTimer = 0.28;
    if (droppedMedkit) {
      this.killBannerText = 'BALÃO ABATIDO! CAIXA MÉDICA ROSA CAIU!';
    } else if (spawnedMissileDrop) {
      this.killBannerText = `${bestLabel} DESTRUÍDO! CAIXA DE MÍSSEIS NO MAR!`;
    } else {
      this.killBannerText =
        killed.length > 1
          ? `${bestLabel} +${killed.length - 1} DESTROYED!`
          : `${bestLabel} DESTROYED!`;
    }
    this.killBannerTimer = 1.8;

    this.shake = Math.max(this.shake, majorHit ? 0.55 : 0.22);
    this.sound.playImpact(false);
    if (!silentNet) {
      this.netHooks.onDamage?.(pos.x, pos.y, pos.z, radius, pos.y <= WATER_LEVEL + 1.5);
    }
    return killed.length;
  }

  tryFireCannon(jet) {
    this.cannonActive = true;
    if (this.cannonCooldown > 0) return false;

    this.cannonCooldown = this.cannonRate;
    this.muzzleTimer = 0.045;
    this.cannonSide *= -1;

    const origin = jet.getWorldPoint(this.cannonSide * 0.72, 0.0, -1.7);
    const dir = jet.getForwardDirection();
    dir.x += (Math.random() - 0.5) * 0.012;
    dir.y += (Math.random() - 0.5) * 0.012;
    dir.z += (Math.random() - 0.5) * 0.012;
    dir.normalize();

    const speed = Math.max(340, jet.speed + 270);
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);

    this.bullets.push({
      mesh,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(speed),
      life: 2.4,
      isRemote: false,
    });

    this.shake = Math.max(this.shake, 0.08);
    this.sound.playCannon();
    this.netHooks.onCannon?.({ origin, dir, speed });
    return true;
  }

  tryFireMissile(jet) {
    if (this.cooldown > 0) return false;
    if (this.ammo <= 0) {
      this.cooldown = 0.25;
      this.sound.playEmpty();
      this.killBannerText = 'SEM MÍSSEIS! DESTRUA NAVIOS P/ DROPAR';
      this.killBannerTimer = 1.5;
      return false;
    }

    this.ammo--;
    this.cooldown = 0.22;
    this.fox2Timer = 1.5;
    this.nextSide *= -1;

    const origin = jet.getWorldPoint(this.nextSide * 1.95, -0.28, -0.2);
    const dir = jet.getForwardDirection();
    const speed = Math.max(155, jet.speed + 85);

    const mesh = new THREE.Mesh(this.missileGeo, this.missileMat);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);

    const targetId = this.lockedTarget?.isPlayer ? this.lockedTarget.id : null;
    this.missiles.push({
      mesh,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(speed),
      speed,
      target: this.lockedTarget && this.lockedTarget.alive ? this.lockedTarget : null,
      targetsLocalPlayer: false,
      evaded: false,
      life: 7.5,
      smokeAcc: 0,
      isRemote: false,
    });

    this.shake = Math.max(this.shake, 0.3);
    this.sound.playMissile();
    this.netHooks.onMissile?.({ origin, dir, speed, targetId });
    return true;
  }

  spawnRemoteCannon(origin, dir, speed) {
    const o = new THREE.Vector3(origin.x, origin.y, origin.z);
    const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.copy(o);
    mesh.lookAt(o.clone().add(d));
    this.scene.add(mesh);

    this.bullets.push({
      mesh,
      pos: o,
      vel: d.multiplyScalar(speed),
      life: 2.4,
      isRemote: true,
    });
  }

  spawnRemoteMissile(origin, dir, speed, targetId = null, _fromId = null, localJet = null, localId = null) {
    const o = new THREE.Vector3(origin.x, origin.y, origin.z);
    const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    const mesh = new THREE.Mesh(this.missileGeo, this.missileMat);
    mesh.position.copy(o);
    mesh.lookAt(o.clone().add(d));
    this.scene.add(mesh);

    const locksLocal = Boolean(targetId && localId && targetId === localId && localJet && localJet.alive);
    this.missiles.push({
      mesh,
      pos: o,
      vel: d.multiplyScalar(speed),
      speed,
      target: locksLocal ? localJet : null,
      targetsLocalPlayer: locksLocal,
      evaded: false,
      life: 7.5,
      smokeAcc: 0,
      isRemote: true,
    });
  }

  spawnTestThreat(jet) {
    const fwd = jet.getForwardDirection();
    const origin = jet.position.clone().addScaledVector(fwd, -360).add(new THREE.Vector3(45, 22, 0));
    const dir = jet.position.clone().sub(origin).normalize();
    const speed = Math.max(155, jet.speed + 80);
    const mesh = new THREE.Mesh(this.missileGeo, this.missileMat);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);

    this.missiles.push({
      mesh,
      pos: origin,
      vel: dir.multiplyScalar(speed),
      speed,
      target: jet,
      targetsLocalPlayer: true,
      isTestThreat: true,
      evaded: false,
      life: 7.5,
      smokeAcc: 0,
      isRemote: true,
    });
  }

  spawnShipMissile(sh, jet) {
    const origin = new THREE.Vector3(sh.x, 18.0, sh.z);
    const dir = jet.position.clone().sub(origin).normalize();
    if (dir.y < 0.25) {
      dir.y = 0.25;
      dir.normalize();
    }
    const speed = Math.max(185, (jet.speed || 100) + 70);
    const mesh = new THREE.Mesh(this.shipMissileGeo, this.shipMissileMat);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);

    this.missiles.push({
      mesh,
      pos: origin,
      vel: dir.multiplyScalar(speed),
      speed,
      target: jet,
      targetsLocalPlayer: true,
      isShipMissile: true,
      homingTimer: 1.0,
      evaded: false,
      life: 9.0,
      smokeAcc: 0,
      isRemote: true,
    });
  }

  spawnPickupBurst(pos, isHealth) {
    _tmpPos.set(pos.x, pos.y, pos.z);
    const colA = isHealth ? 0xff4fa3 : 0xffb842;
    const colB = isHealth ? 0xffcbe6 : 0xfff08a;
    for (let i = 0; i < 16; i++) {
      _tmpVel.set(
        (Math.random() - 0.5) * 24,
        (Math.random() - 0.3) * 22,
        (Math.random() - 0.5) * 24
      );
      this.spawnParticle(_tmpPos, _tmpVel, 1.1 + Math.random() * 0.9, 0.55 + Math.random() * 0.35, i % 2 === 0 ? colA : colB, 2.2, true);
    }
  }

  applyRemoteDeform(x, z, r, d, dx, dz) {
    this.world.deformTerrain(x, z, r, d, dx, dz);
  }

  applyRemoteDamage(x, y, z, r, isWater, time) {
    if (isWater) {
      this.world.addWaterRipple(x, z, time);
    }
    this.destroyAt(_tmpPos.set(x, y, z), r, time, true);
  }

  spawnJetExplosion(pos, time) {
    this.shake = Math.max(this.shake, 0.9);
    this.sound.playImpact(false);
    _tmpPos.set(pos.x, pos.y, pos.z);
    for (let i = 0; i < 36; i++) {
      _tmpVel.set(
        (Math.random() - 0.5) * 46,
        (Math.random() - 0.3) * 40,
        (Math.random() - 0.5) * 46
      );
      const r = Math.random();
      const col = r < 0.28 ? 0xfff49a : r < 0.62 ? 0xf57428 : r < 0.85 ? 0xd93c26 : 0x4b4658;
      this.spawnParticle(_tmpPos, _tmpVel, 1.8 + Math.random() * 2.2, 0.9 + Math.random() * 0.7, col, 3.0, true);
    }
    if (_tmpPos.y <= WATER_LEVEL + 6) {
      this.world.addWaterRipple(_tmpPos.x, _tmpPos.z, time);
    }
  }

  spawnParticle(pos, vel, size, maxLife, hex, grow, dithered = true) {
    if (this.particles.length >= 380) {
      this.particles.shift();
    }
    _tmpColor.setHex(hex);
    this.particles.push({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      vx: vel.x,
      vy: vel.y,
      vz: vel.z,
      size,
      life: maxLife,
      maxLife,
      grow,
      dithered,
      r: _tmpColor.r,
      g: _tmpColor.g,
      b: _tmpColor.b,
    });
  }

  spawnCannonImpact(pos, isWater, time) {
    if (isWater) {
      if (Math.random() < 0.5) this.world.addWaterRipple(pos.x, pos.z, time);
      for (let i = 0; i < 4; i++) {
        _tmpVel.set(
          (Math.random() - 0.5) * 9,
          8 + Math.random() * 14,
          (Math.random() - 0.5) * 9
        );
        this.spawnParticle(pos, _tmpVel, 0.55 + Math.random() * 0.5, 0.36 + Math.random() * 0.2, 0xeef9fc, 1.8, true);
      }
    } else {
      for (let i = 0; i < 7; i++) {
        _tmpVel.set(
          (Math.random() - 0.5) * 18,
          7 + Math.random() * 16,
          (Math.random() - 0.5) * 18
        );
        const r = Math.random();
        const col = r < 0.4 ? 0xfff088 : r < 0.72 ? 0xf27d30 : 0x56485c;
        this.spawnParticle(pos, _tmpVel, 0.75 + Math.random() * 0.75, 0.4 + Math.random() * 0.3, col, 2.0, true);
      }
    }
  }

  spawnImpact(pos, isWater, time) {
    this.shake = Math.max(this.shake, isWater ? 0.3 : 0.85);
    this.sound.playImpact(isWater);

    if (isWater) {
      this.world.addWaterRipple(pos.x, pos.z, time);
      for (let i = 0; i < 16; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spread = 3 + Math.random() * 14;
        _tmpVel.set(
          Math.cos(angle) * spread,
          14 + Math.random() * 24,
          Math.sin(angle) * spread
        );
        const col = Math.random() < 0.65 ? 0xf2fafc : 0x7cd6db;
        this.spawnParticle(pos, _tmpVel, 0.9 + Math.random() * 1.2, 0.65 + Math.random() * 0.45, col, 2.2, true);
      }
    } else {
      // Big mountain-carving fireball + flying rock chunks
      for (let i = 0; i < 28; i++) {
        _tmpVel.set(
          (Math.random() - 0.5) * 42,
          12 + Math.random() * 34,
          (Math.random() - 0.5) * 42
        );
        const r = Math.random();
        const col = r < 0.25 ? 0xfff08a : r < 0.55 ? 0xf27d30 : r < 0.75 ? 0xd94126 : r < 0.9 ? 0x5c5064 : 0xaba3ba;
        this.spawnParticle(pos, _tmpVel, 1.6 + Math.random() * 2.4, 0.8 + Math.random() * 0.65, col, 2.9, true);
      }
    }
  }

  update(dt, time, jet) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.cannonCooldown > 0) this.cannonCooldown -= dt;
    if (this.hitMarkerTimer > 0) this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    if (this.killBannerTimer > 0) this.killBannerTimer = Math.max(0, this.killBannerTimer - dt);
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      jet.setMuzzleFlash(true);
    } else {
      jet.setMuzzleFlash(false);
    }
    if (this.fox2Timer > 0) this.fox2Timer = Math.max(0, this.fox2Timer - dt);
    this.shake = Math.max(0, this.shake - dt * 2.4);

    // Update target lock-on in front of jet (world destructibles + remote players)
    const fwdDir = jet.getForwardDirection();
    let bestTarget = this.world.findLockTarget(jet.position, fwdDir, 520);
    let bestScore = Infinity;
    if (bestTarget) {
      const ty = bestTarget.y + (bestTarget.h || 6) * 0.5;
      const v = new THREE.Vector3(bestTarget.x - jet.position.x, ty - jet.position.y, bestTarget.z - jet.position.z);
      const d = v.length() || 1;
      const dot = v.divideScalar(d).dot(fwdDir);
      bestScore = d + (1.0 - dot) * 900;
    }

    const remoteJets = this.netHooks.getRemoteJets?.();
    if (remoteJets) {
      const toP = new THREE.Vector3();
      for (const rj of remoteJets.values()) {
        if (!rj.alive) continue;
        toP.subVectors(rj.position, jet.position);
        const dist = toP.length();
        if (dist < 18 || dist > 780) continue;
        toP.divideScalar(dist);
        const dot = toP.dot(fwdDir);
        if (dot < 0.88) continue;
        const score = dist + (1.0 - dot) * 900 - 40; // slight priority for PvP pilot lock
        if (score < bestScore) {
          bestScore = score;
          bestTarget = {
            id: rj.id,
            type: 'player',
            label: rj.name,
            isPlayer: true,
            get x() { return rj.position.x; },
            get y() { return rj.position.y - 2.5; },
            get z() { return rj.position.z; },
            get rollExtra() { return rj.rollExtra; },
            h: 5.0,
            get alive() { return rj.alive; },
          };
        }
      }
    }
    this.lockedTarget = bestTarget;

    // Update cannon tracer rounds (sweep segment + splash damage on ground/water impact!)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.vel.y -= 10.0 * dt;
      const bPrev = b.pos.clone();
      b.pos.addScaledVector(b.vel, dt);

      let hitObj = false;
      if (!b.isRemote) {
        if (remoteJets) {
          for (const rj of remoteJets.values()) {
            if (!rj.alive) continue;
            if (rj.position.distanceTo(b.pos) < 9.5) {
              hitObj = true;
              this.hitMarkerTimer = 0.28;
              this.spawnCannonImpact(b.pos, false, time);
              this.netHooks.onHitPlayer?.(rj.id, this.cannonDamage, 'cannon');
              break;
            }
          }
        }
        if (!hitObj) {
          for (let k = 1; k <= 5; k++) {
            const sp = bPrev.clone().lerp(b.pos, k / 5);
            if (this.destroyAt(sp, 5.5, time) > 0) {
              hitObj = true;
              b.pos.copy(sp);
              break;
            }
          }
        }
      }
      if (hitObj) {
        this.spawnCannonImpact(b.pos, false, time);
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        continue;
      }

      b.mesh.position.copy(b.pos);
      b.mesh.lookAt(b.pos.clone().add(b.vel));

      let hit = false;
      let isWater = false;
      // Sweep segment against terrain & water so fast rounds bite into steep mountain peaks!
      for (let k = 1; k <= 5; k++) {
        const sp = bPrev.clone().lerp(b.pos, k / 5);
        if (sp.y <= WATER_LEVEL) {
          hit = true;
          isWater = true;
          b.pos.set(sp.x, WATER_LEVEL + 0.35, sp.z);
          break;
        }
        const th = getTerrainHeight(sp.x, sp.z);
        if (sp.y <= th) {
          hit = true;
          b.pos.set(sp.x, th + 0.4, sp.z);
          break;
        }
      }

      if (hit || b.life <= 0) {
        if (hit) {
          this.spawnCannonImpact(b.pos, isWater, time);
          if (!b.isRemote) {
            if (!isWater) {
              const hl = Math.hypot(b.vel.x, b.vel.z) || 1;
              const dx = b.vel.x / hl;
              const dz = b.vel.z / hl;
              if (this.world.deformTerrain(b.pos.x, b.pos.z, 10, 0, dx, dz)) {
                this.netHooks.onDeform?.(b.pos.x, b.pos.z, 10, 0, dx, dz);
              }
            }
            this.destroyAt(b.pos, isWater ? 8.5 : 16, time);
          }
        }
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }

    // Ship SAM missile launchers (fire at player within range, player hears RWR & can evade)
    const ships = this.world.getShips ? this.world.getShips() : null;
    if (ships && jet && jet.alive) {
      for (let sIdx = 0; sIdx < ships.length; sIdx++) {
        const sh = ships[sIdx];
        if (!sh.alive) continue;
        if (sh._fireCooldown === undefined) sh._fireCooldown = 1.0 + Math.random() * 2.0;
        sh._fireCooldown -= dt;
        if (sh._fireCooldown <= 0) {
          const dx = jet.position.x - sh.x;
          const dz = jet.position.z - sh.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= 8100 && d2 <= 313600) { // 90m to 560m
            this.spawnShipMissile(sh, jet);
            sh._fireCooldown = 10.0;
          } else {
            sh._fireCooldown = 1.0;
          }
        }
      }
    }

    // Update missiles (heat-seeking homing + evasion + proximity blast + incoming RWR alert!)
    let closestIncoming = null;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      if (m.homingTimer !== undefined && m.target) {
        m.homingTimer -= dt;
        if (m.homingTimer <= 0) {
          m.target = null;
          m.evaded = true;
        }
      }

      if (m.target && m.target.alive) {
        const tx = m.target.position ? m.target.position.x : m.target.x;
        const ty = m.target.position ? m.target.position.y : m.target.y + (m.target.h || 6) * 0.5;
        const tz = m.target.position ? m.target.position.z : m.target.z;
        const desiredVec = new THREE.Vector3(tx - m.pos.x, ty - m.pos.y, tz - m.pos.z);
        const dist = desiredVec.length() || 1;
        const desiredDir = desiredVec.divideScalar(dist);
        const curDir = m.vel.clone().normalize();
        const dot = curDir.dot(desiredDir);
        const targetRoll = m.target.rollExtra || 0;

        // Barrel roll, afterburner or sharp turn breaks seeker lock!
        const evadedByManeuver = m.isShipMissile
          ? (Math.abs(targetRoll) > 0.25 || !!m.target.afterburner || (dot < 0.65 && dist < 240))
          : ((Math.abs(targetRoll) > 0.35 && dist < 150) || (dot < 0.36 && dist < 220));
        if (evadedByManeuver) {
          m.target = null;
          m.evaded = true;
          if (m.targetsLocalPlayer) {
            this.killBannerText = 'MISSILE EVADED!';
            this.killBannerTimer = 1.6;
          }
        } else {
          const turnRate = m.isShipMissile ? 4.5 : 2.65;
          curDir.lerp(desiredDir, Math.min(1, dt * turnRate)).normalize();
          m.vel.copy(curDir).multiplyScalar(m.speed);
          if (m.targetsLocalPlayer && (!closestIncoming || dist < closestIncoming.dist)) {
            closestIncoming = { missile: m, dist, pos: m.pos.clone() };
          }
        }
      } else {
        m.vel.y -= 5.5 * dt;
      }

      const mPrev = m.pos.clone();
      m.pos.addScaledVector(m.vel, dt);

      if (m.isTestThreat && m.target && m.target.alive && m.pos.distanceTo(jet.position) < 16.0) {
        this.spawnImpact(m.pos, false, time);
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
        continue;
      }

      if (m.isShipMissile && jet && jet.alive) {
        let hitPlayer = false;
        for (let k = 0; k <= 4; k++) {
          const sp = mPrev.clone().lerp(m.pos, k / 4);
          if (sp.distanceTo(jet.position) < 26.0) {
            hitPlayer = true;
            break;
          }
        }
        if (hitPlayer) {
          this.spawnImpact(m.pos, false, time);
          this.scene.remove(m.mesh);
          this.missiles.splice(i, 1);
          if (this.netHooks?.onLocalDamage) {
            this.netHooks.onLocalDamage(35, 'MÍSSIL NAVAL');
          } else if (typeof jet.hp === 'number') {
            jet.hp = Math.max(0, jet.hp - 35);
          }
          continue;
        }
      }

      let directHit = false;
      let hitRemotePlayer = false;
      if (!m.isRemote) {
        if (remoteJets) {
          for (const rj of remoteJets.values()) {
            if (!rj.alive) continue;
            if (rj.position.distanceTo(m.pos) < 19.0) {
              directHit = true;
              hitRemotePlayer = true;
              this.hitMarkerTimer = 0.32;
              this.netHooks.onHitPlayer?.(rj.id, 65, 'missile');
              break;
            }
          }
        }
        if (!directHit) {
          for (let k = 1; k <= 6; k++) {
            const sp = mPrev.clone().lerp(m.pos, k / 6);
            if (this.destroyAt(sp, 5.0, time) > 0) {
              directHit = true;
              m.pos.copy(sp);
              break;
            }
          }
        }
      }
      if (directHit) {
        this.spawnImpact(m.pos, false, time);
        if (!hitRemotePlayer) {
          const hl = Math.hypot(m.vel.x, m.vel.z) || 1;
          const dx = m.vel.x / hl;
          const dz = m.vel.z / hl;
          if (m.pos.y < getTerrainHeight(m.pos.x, m.pos.z) + 22) {
            if (this.world.deformTerrain(m.pos.x, m.pos.z, 46, 32, dx, dz)) {
              this.netHooks.onDeform?.(m.pos.x, m.pos.z, 46, 32, dx, dz);
            }
          }
          this.destroyAt(m.pos, 46, time);
        }
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
        continue;
      }

      m.mesh.position.copy(m.pos);
      m.mesh.lookAt(m.pos.clone().add(m.vel));

      m.smokeAcc += dt;
      if (m.smokeAcc >= 0.015) {
        m.smokeAcc = 0;
        _tmpVel.set(
          (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.5) * 1.4
        );
        this.spawnParticle(
          m.pos,
          _tmpVel,
          0.42 + Math.random() * 0.22,
          1.1 + Math.random() * 0.4,
          0xf7f5f2,
          2.1,
          true
        );
      }

      let hit = false;
      let isWater = false;

      // Sweep segment against mountain walls & ocean surface
      for (let k = 1; k <= 6; k++) {
        const sp = mPrev.clone().lerp(m.pos, k / 6);
        if (sp.y <= WATER_LEVEL) {
          hit = true;
          isWater = true;
          m.pos.set(sp.x, WATER_LEVEL + 0.5, sp.z);
          break;
        }
        const th = getTerrainHeight(sp.x, sp.z);
        if (sp.y <= th) {
          hit = true;
          m.pos.set(sp.x, th + 0.6, sp.z);
          break;
        }
      }

      if (hit || m.life <= 0) {
        if (hit) {
          this.spawnImpact(m.pos, isWater, time);
          if (!isWater) {
            this.addBurner(
              m.pos.x,
              Math.max(WATER_LEVEL + 0.8, getTerrainHeight(m.pos.x, m.pos.z) + 1.0),
              m.pos.z,
              8.5,
              true
            );
          }
          if (!m.isRemote) {
            if (!isWater) {
              const hl = Math.hypot(m.vel.x, m.vel.z) || 1;
              const dx = m.vel.x / hl;
              const dz = m.vel.z / hl;
              if (this.world.deformTerrain(m.pos.x, m.pos.z, 52, 38, dx, dz)) {
                this.netHooks.onDeform?.(m.pos.x, m.pos.z, 52, 38, dx, dz);
              }
            }
            this.destroyAt(m.pos, 48, time);
          }
        }
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }

    this.incomingMissile = closestIncoming;
    this.sound.updateMissileAlert(dt, closestIncoming ? closestIncoming.dist : 0);

    // Update persistent burning wreck smoke columns
    for (let i = this.burners.length - 1; i >= 0; i--) {
      const br = this.burners[i];
      br.life -= dt;
      if (br.life <= 0) {
        this.burners.splice(i, 1);
        continue;
      }
      br.acc += dt;
      if (br.acc >= 0.14) {
        br.acc = 0;
        _tmpVel.set((Math.random() - 0.5) * 3.5, 9 + Math.random() * 7, (Math.random() - 0.5) * 3.5);
        const col = Math.random() < 0.28 ? 0xf58434 : 0x454052;
        this.spawnParticle(br.pos, _tmpVel, br.big ? 1.8 : 1.0, 1.5, col, 2.2, true);
      }
    }

    // Update particles in single InstancedMesh draw call
    this.particlePool.beginFrame();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 9.8 * dt * 0.35;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.vz *= 0.95;

      const t = 1 - p.life / p.maxLife;
      const sc = Math.max(0.08, p.size * (1 + t * p.grow));
      const alpha = p.dithered ? Math.max(0, 1.0 - t * 1.05) : 1.0;
      this.particlePool.push(p.x, p.y, p.z, sc, p.r, p.g, p.b, alpha);
    }
    this.particlePool.endFrame();
  }
}

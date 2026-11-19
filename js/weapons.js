import * as THREE from 'three';
import { getTerrainHeight, WATER_LEVEL } from './world.js?v=5';

function createDitherExplosionMat(hex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(hex) },
      uAlpha: { value: 1.0 },
    },
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uAlpha;
      float bayer4(vec2 pos) {
        int x = int(mod(pos.x, 4.0));
        int y = int(mod(pos.y, 4.0));
        int idx = y * 4 + x;
        if (idx == 0) return 0.0 / 16.0;
        if (idx == 1) return 8.0 / 16.0;
        if (idx == 2) return 2.0 / 16.0;
        if (idx == 3) return 10.0 / 16.0;
        if (idx == 4) return 12.0 / 16.0;
        if (idx == 5) return 4.0 / 16.0;
        if (idx == 6) return 14.0 / 16.0;
        if (idx == 7) return 6.0 / 16.0;
        if (idx == 8) return 3.0 / 16.0;
        if (idx == 9) return 11.0 / 16.0;
        if (idx == 10) return 1.0 / 16.0;
        if (idx == 11) return 9.0 / 16.0;
        if (idx == 12) return 15.0 / 16.0;
        if (idx == 13) return 7.0 / 16.0;
        if (idx == 14) return 13.0 / 16.0;
        return 5.0 / 16.0;
      }
      void main() {
        if (uAlpha < bayer4(floor(gl_FragCoord.xy))) discard;
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
  });
}

export class MissileSystem {
  constructor(scene, sound, world) {
    this.scene = scene;
    this.sound = sound;
    this.world = world;

    // Missiles (F / Enter / Middle click)
    this.maxAmmo = 4;
    this.ammo = 4;
    this.rechargeTimer = 0;
    this.rechargeInterval = 1.15;
    this.cooldown = 0;
    this.nextSide = -1;
    this.fox2Timer = 0;

    // Rapid-fire Autocannon (Right click)
    this.cannonCooldown = 0;
    this.cannonSide = 1;
    this.cannonActive = false;
    this.muzzleTimer = 0;

    this.shake = 0;
    this.destroyed = 0;
    this.hitMarkerTimer = 0;
    this.killBannerText = '';
    this.killBannerTimer = 0;
    this.lockedTarget = null;

    this.missiles = [];
    this.bullets = [];
    this.particles = [];
    this.burners = []; // persistent smoking wreck plumes after destroying targets!

    this.missileGeo = new THREE.BoxGeometry(0.32, 0.32, 2.3);
    this.missileMat = new THREE.MeshBasicMaterial({ color: 0xfff3a8 });

    this.bulletGeo = new THREE.BoxGeometry(0.18, 0.18, 4.8);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff59e });

    this.sphereGeo = new THREE.IcosahedronGeometry(1.0, 1);
    this.smokeMatWhite = new THREE.MeshBasicMaterial({ color: 0xf7f4f0 });
  }

  // Destroy all destructible world objects within radius and spawn unmistakable fireball + wreck smoke!
  destroyAt(pos, radius, time) {
    const killed = this.world.damage(pos, radius);
    if (!killed.length) return 0;

    let majorHit = false;
    let bestLabel = '';

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
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          6 + Math.random() * (isMajor ? 26 : 16),
          (Math.random() - 0.5) * spread
        );
        const r = Math.random();
        const col = r < 0.3 ? 0xfff28c : r < 0.62 ? 0xf57a2e : r < 0.82 ? o.color : 0x4b4658;
        this.spawnParticle(
          p,
          vel,
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

      // Add persistent rising smoke & fire plume on destroyed structures/ships/balloons
      if (o.type !== 'balloon') {
        this.burners.push({
          pos: new THREE.Vector3(o.x, Math.max(WATER_LEVEL + 0.8, o.y + 1.0), o.z),
          life: isMajor ? 10.0 : 3.5,
          acc: 0,
          big: isMajor,
        });
      }
    }

    this.destroyed += killed.length;
    this.hitMarkerTimer = 0.28;
    this.killBannerText =
      killed.length > 1
        ? `${bestLabel} +${killed.length - 1} DESTROYED!`
        : `${bestLabel} DESTROYED!`;
    this.killBannerTimer = 1.6;

    this.shake = Math.max(this.shake, majorHit ? 0.55 : 0.22);
    this.sound.playImpact(false);
    return killed.length;
  }

  tryFireCannon(jet) {
    this.cannonActive = true;
    if (this.cannonCooldown > 0) return false;

    this.cannonCooldown = 0.068;
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
      vel: dir.multiplyScalar(speed),
      life: 2.4,
    });

    this.shake = Math.max(this.shake, 0.08);
    this.sound.playCannon();
    return true;
  }

  tryFireMissile(jet) {
    if (this.ammo <= 0 || this.cooldown > 0) return false;

    this.ammo--;
    this.cooldown = 0.22;
    this.fox2Timer = 1.5;
    this.nextSide *= -1;

    const origin = jet.getWorldPoint(this.nextSide * 1.95, -0.28, -0.2);
    const dir = jet.getForwardDirection();
    const speed = Math.max(205, jet.speed + 145);

    const mesh = new THREE.Mesh(this.missileGeo, this.missileMat);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);

    this.missiles.push({
      mesh,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(speed),
      speed,
      target: this.lockedTarget && this.lockedTarget.alive ? this.lockedTarget : null,
      life: 6.5,
      smokeAcc: 0,
    });

    this.shake = Math.max(this.shake, 0.3);
    this.sound.playMissile();
    return true;
  }

  spawnParticle(pos, vel, size, maxLife, hex, grow, dithered = true) {
    const mat = dithered ? createDitherExplosionMat(hex) : this.smokeMatWhite;
    const mesh = new THREE.Mesh(this.sphereGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(size);
    this.scene.add(mesh);

    this.particles.push({
      mesh,
      mat,
      dithered,
      vel: vel.clone(),
      size,
      life: maxLife,
      maxLife,
      grow,
    });
  }

  spawnCannonImpact(pos, isWater, time) {
    if (isWater) {
      if (Math.random() < 0.5) this.world.addWaterRipple(pos.x, pos.z, time);
      for (let i = 0; i < 4; i++) {
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          8 + Math.random() * 14,
          (Math.random() - 0.5) * 9
        );
        this.spawnParticle(pos, vel, 0.55 + Math.random() * 0.5, 0.36 + Math.random() * 0.2, 0xeef9fc, 1.8, true);
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          5 + Math.random() * 12,
          (Math.random() - 0.5) * 14
        );
        const col = Math.random() < 0.55 ? 0xfff088 : 0xf27d30;
        this.spawnParticle(pos, vel, 0.65 + Math.random() * 0.6, 0.32 + Math.random() * 0.22, col, 2.0, true);
      }
    }
  }

  spawnImpact(pos, isWater, time) {
    this.shake = Math.max(this.shake, isWater ? 0.3 : 0.72);
    this.sound.playImpact(isWater);

    if (isWater) {
      this.world.addWaterRipple(pos.x, pos.z, time);
      for (let i = 0; i < 16; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spread = 3 + Math.random() * 14;
        const vel = new THREE.Vector3(
          Math.cos(angle) * spread,
          14 + Math.random() * 24,
          Math.sin(angle) * spread
        );
        const col = Math.random() < 0.65 ? 0xf2fafc : 0x7cd6db;
        this.spawnParticle(pos, vel, 0.9 + Math.random() * 1.2, 0.65 + Math.random() * 0.45, col, 2.2, true);
      }
    } else {
      for (let i = 0; i < 20; i++) {
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 32,
          8 + Math.random() * 26,
          (Math.random() - 0.5) * 32
        );
        const r = Math.random();
        const col = r < 0.3 ? 0xfff08a : r < 0.65 ? 0xf27d30 : r < 0.85 ? 0xd94126 : 0xaba3ba;
        this.spawnParticle(pos, vel, 1.4 + Math.random() * 1.8, 0.7 + Math.random() * 0.55, col, 2.8, true);
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

    // Update target lock-on in front of jet
    this.lockedTarget = this.world.findLockTarget(jet.position, jet.getForwardDirection(), 520);

    if (this.ammo < this.maxAmmo) {
      this.rechargeTimer += dt;
      if (this.rechargeTimer >= this.rechargeInterval) {
        this.rechargeTimer = 0;
        this.ammo++;
      }
    } else {
      this.rechargeTimer = 0;
    }

    // Update cannon tracer rounds (sweep segment + splash damage on ground/water impact!)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.vel.y -= 10.0 * dt;
      const bPrev = b.pos.clone();
      b.pos.addScaledVector(b.vel, dt);

      let hitObj = false;
      for (let k = 1; k <= 5; k++) {
        const sp = bPrev.clone().lerp(b.pos, k / 5);
        if (this.destroyAt(sp, 5.5, time) > 0) {
          hitObj = true;
          b.pos.copy(sp);
          break;
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
      if (b.pos.y <= WATER_LEVEL) {
        hit = true;
        isWater = true;
        b.pos.y = WATER_LEVEL + 0.35;
      } else {
        const th = getTerrainHeight(b.pos.x, b.pos.z);
        if (b.pos.y <= th) {
          hit = true;
          b.pos.y = th + 0.4;
        }
      }

      if (hit || b.life <= 0) {
        if (hit) {
          this.spawnCannonImpact(b.pos, isWater, time);
          // Splash destruction even if hitting the ground/water right beside a tree, house, or ship!
          this.destroyAt(b.pos, 7.5, time);
        }
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }

    // Update missiles (gentle heat-seeking homing + proximity blast + water/ground blast!)
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;

      if (m.target && m.target.alive) {
        const ty = m.target.y + (m.target.h || 6) * 0.5;
        const desiredDir = new THREE.Vector3(m.target.x - m.pos.x, ty - m.pos.y, m.target.z - m.pos.z).normalize();
        const curDir = m.vel.clone().normalize();
        curDir.lerp(desiredDir, Math.min(1, dt * 4.8)).normalize();
        m.vel.copy(curDir).multiplyScalar(m.speed);
      } else {
        m.vel.y -= 5.5 * dt;
      }

      const mPrev = m.pos.clone();
      m.pos.addScaledVector(m.vel, dt);

      let directHit = false;
      for (let k = 1; k <= 6; k++) {
        const sp = mPrev.clone().lerp(m.pos, k / 6);
        if (this.destroyAt(sp, 5.0, time) > 0) {
          directHit = true;
          m.pos.copy(sp);
          break;
        }
      }
      if (directHit) {
        this.spawnImpact(m.pos, false, time);
        this.destroyAt(m.pos, 36, time);
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
        continue;
      }

      m.mesh.position.copy(m.pos);
      m.mesh.lookAt(m.pos.clone().add(m.vel));

      m.smokeAcc += dt;
      if (m.smokeAcc >= 0.015) {
        m.smokeAcc = 0;
        const drift = new THREE.Vector3(
          (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.5) * 1.4
        );
        this.spawnParticle(
          m.pos,
          drift,
          0.42 + Math.random() * 0.22,
          1.1 + Math.random() * 0.4,
          0xf7f5f2,
          2.1,
          true
        );
      }

      let hit = false;
      let isWater = false;

      if (m.pos.y <= WATER_LEVEL) {
        hit = true;
        isWater = true;
        m.pos.y = WATER_LEVEL + 0.5;
      } else {
        const th = getTerrainHeight(m.pos.x, m.pos.z);
        if (m.pos.y <= th) {
          hit = true;
          m.pos.y = th + 0.6;
        }
      }

      if (hit || m.life <= 0) {
        if (hit) {
          this.spawnImpact(m.pos, isWater, time);
          // Always blast nearby ships, boats, trees, houses & structures on BOTH water & land!
          this.destroyAt(m.pos, 36, time);
        }
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }

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
        const vel = new THREE.Vector3((Math.random() - 0.5) * 3.5, 9 + Math.random() * 7, (Math.random() - 0.5) * 3.5);
        const col = Math.random() < 0.28 ? 0xf58434 : 0x454052;
        this.spawnParticle(br.pos, vel, br.big ? 1.8 : 1.0, 1.5, col, 2.2, true);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.dithered) p.mat.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 9.8 * dt * 0.35;
      p.vel.multiplyScalar(0.95);

      const t = 1 - p.life / p.maxLife;
      const sc = p.size * (1 + t * p.grow);
      p.mesh.scale.setScalar(Math.max(0.08, sc));
      if (p.dithered) {
        p.mat.uniforms.uAlpha.value = Math.max(0, 1.0 - t * 1.05);
      }
    }
  }
}

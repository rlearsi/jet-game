import * as THREE from 'three';
import { getTerrainHeight, WATER_LEVEL, SUN_DIR } from './world.js';

/**
 * Generates crisp pixel-art splinter camouflage & panel-line texture
 * matching the bright light-silver / lavender-slate / orange-accent fighter in the reference screenshots.
 */
function createJetCamoTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');

  // Bright silver-white base
  ctx.fillStyle = '#e6ebf7';
  ctx.fillRect(0, 0, 64, 64);

  // Subtle light-blue-gray panel variation
  ctx.fillStyle = '#d4dced';
  ctx.fillRect(0, 0, 64, 18);
  ctx.fillRect(20, 34, 24, 30);

  // Geometric pixel-art splinter camo patches (lavender-slate midtone)
  ctx.fillStyle = '#9aa3be';
  ctx.beginPath();
  ctx.moveTo(8, 10);
  ctx.lineTo(30, 4);
  ctx.lineTo(24, 28);
  ctx.lineTo(4, 24);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(38, 22);
  ctx.lineTo(62, 16);
  ctx.lineTo(58, 44);
  ctx.lineTo(34, 38);
  ctx.closePath();
  ctx.fill();

  // Deeper slate camo accent
  ctx.fillStyle = '#737c98';
  ctx.beginPath();
  ctx.moveTo(14, 42);
  ctx.lineTo(36, 38);
  ctx.lineTo(28, 58);
  ctx.lineTo(10, 54);
  ctx.closePath();
  ctx.fill();

  // Crisp subtle pixel-art panel seam lines
  ctx.fillStyle = '#5c647e';
  ctx.fillRect(0, 18, 64, 1);
  ctx.fillRect(0, 46, 64, 1);
  ctx.fillRect(31, 0, 1, 64);

  // Small red-orange intake/wing squadron accent stripe
  ctx.fillStyle = '#eb5836';
  ctx.fillRect(46, 6, 12, 4);
  ctx.fillRect(6, 52, 8, 3);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCanopyTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 32;
  const ctx = c.getContext('2d');

  // Rich bright golden canopy with crisp specular glint & dark frame border
  ctx.fillStyle = '#f8d64c';
  ctx.fillRect(0, 0, 16, 32);
  ctx.fillStyle = '#fff5b3';
  ctx.fillRect(4, 4, 8, 12);
  ctx.fillStyle = '#e5a42e';
  ctx.fillRect(0, 22, 16, 10);
  // Thin canopy bow lines
  ctx.fillStyle = '#242738';
  ctx.fillRect(0, 0, 16, 2);
  ctx.fillRect(0, 18, 16, 1);
  ctx.fillRect(0, 30, 16, 2);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Bright cel-shaded material that keeps the jet crisp, luminous, and clearly textured
 * from every viewing angle (matching the reference screenshots).
 */
function createBrightJetMaterial(tex, tintHex = 0xffffff) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uTint: { value: new THREE.Color(tintHex) },
      uSunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uTint;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying vec3 vNormal;

      void main() {
        vec3 texCol = texture2D(uMap, vUv).rgb * uTint;
        vec3 N = normalize(vNormal);
        float ndl = dot(N, normalize(uSunDir));
        float topBoost = clamp(N.y * 0.35 + 0.65, 0.55, 1.05);

        // Crisp 2-band bright sunset cel lighting (never dark or muddy!)
        float band = step(-0.08, ndl);
        vec3 shadeCol = vec3(0.82, 0.81, 0.92);
        vec3 litCol   = vec3(1.08, 1.05, 1.00);
        vec3 col = texCol * mix(shadeCol, litCol, band) * topBoost;

        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `,
  });
}

function createDitherPuffMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffea78) },
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
        float threshold = bayer4(floor(gl_FragCoord.xy));
        if (uAlpha < threshold) discard;
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
  });
}

class RibbonTrail {
  constructor(scene, maxPoints = 78, width = 0.16, color = 0xffffff) {
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
      const taper = 1.0 - (i / this.maxPoints) * 0.6;
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

  setVisible(v) {
    this.mesh.visible = v;
  }
}

export class FighterJet {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.visual = new THREE.Group();
    this.hullGroup = new THREE.Group(); // meshes included in the crisp 1px screen-space ink outline mask
    this.visual.add(this.hullGroup);
    this.group.add(this.visual);
    scene.add(this.group);

    this.buildMesh();
    // Sleek authentic size matching the screenshots
    this.visual.scale.setScalar(0.76);

    // Wingtip contrails
    this.leftTrail = new RibbonTrail(scene, 82, 0.16, 0xffffff);
    this.rightTrail = new RibbonTrail(scene, 82, 0.16, 0xffffff);
    this.trailTimer = 0;

    // Dithered spherical exhaust puffs
    this.puffs = [];
    this.puffGeo = new THREE.IcosahedronGeometry(1.0, 1);
    this.puffTimer = 0;

    // Start higher & wider over the archipelago bay for an expansive panoramic vista
    this.position = new THREE.Vector3(-90, 96, 210);
    this.yaw = 0.25;
    this.pitch = -0.05;
    this.bank = 0;
    this.rollAnim = 0;
    this.rollDir = 1;

    this.speed = 64;
    this.throttle = 0.65;
    this.afterburner = false;
    this.gForce = 1.0;
    this.vsi = 0;
    this.radarAlt = 96;
    this.lowAltWarning = false;

    this.velocity = new THREE.Vector3(0, 0, -this.speed);
    this.prevPitch = this.pitch;
    this.prevYaw = this.yaw;

    this.group.position.copy(this.position);
  }

  buildMesh() {
    const camoTex = createJetCamoTexture();
    const canopyTex = createCanopyTexture();

    const brightCamo = createBrightJetMaterial(camoTex, 0xffffff);
    const wingCamo = createBrightJetMaterial(camoTex, 0xf6f8ff);
    const tailCamo = createBrightJetMaterial(camoTex, 0xe4e8f5);
    const canopyMat = new THREE.MeshBasicMaterial({ map: canopyTex });
    const nozzleMat = new THREE.MeshBasicMaterial({ color: 0x383c52 });
    const accentMat = new THREE.MeshBasicMaterial({ color: 0xee5b38 });
    const edgeLineMat = new THREE.LineBasicMaterial({ color: 0x1d2033 });

    const addPart = (geo, mat, pos, rot = [0, 0, 0], addEdgeLines = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(pos[0], pos[1], pos[2]);
      m.rotation.set(rot[0], rot[1], rot[2]);
      this.hullGroup.add(m);

      // Crisp dark ink border lines along wing edges, fins & panel silhouettes
      if (addEdgeLines) {
        const edges = new THREE.EdgesGeometry(geo, 28);
        const line = new THREE.LineSegments(edges, edgeLineMat);
        line.position.copy(m.position);
        line.rotation.copy(m.rotation);
        this.visual.add(line);
      }
      return m;
    };

    // Normalize UVs on ExtrudeGeometry so camo texture maps cleanly across wings
    const normalizePlanarUV = (geo, scale = 0.22) => {
      const pos = geo.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = pos.getX(i) * scale + 0.5;
        uv[i * 2 + 1] = pos.getZ(i) * scale + 0.5;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    };

    // Main central fuselage
    addPart(new THREE.BoxGeometry(1.06, 0.46, 4.15), brightCamo, [0, 0.0, 0.15]);

    // Tapered sleek nose
    const noseGeo = new THREE.ConeGeometry(0.52, 2.35, 4);
    noseGeo.rotateX(-Math.PI / 2);
    noseGeo.rotateZ(Math.PI / 4);
    addPart(noseGeo, brightCamo, [0, -0.02, -3.05]);

    // Dark pointed radome tip
    const tipGeo = new THREE.ConeGeometry(0.18, 0.65, 4);
    tipGeo.rotateX(-Math.PI / 2);
    tipGeo.rotateZ(Math.PI / 4);
    addPart(tipGeo, nozzleMat, [0, -0.02, -4.18], [0, 0, 0], false);

    // Bright golden-yellow cockpit canopy
    const canopyGeo = new THREE.BoxGeometry(0.54, 0.38, 1.55);
    addPart(canopyGeo, canopyMat, [0, 0.34, -1.35], [0.07, 0, 0]);

    // Sleek LERX / engine nacelles
    addPart(new THREE.BoxGeometry(0.42, 0.40, 2.35), tailCamo, [-0.66, -0.04, 0.35]);
    addPart(new THREE.BoxGeometry(0.42, 0.40, 2.35), tailCamo, [0.66, -0.04, 0.35]);

    // Bright orange squadron accent panels
    addPart(new THREE.BoxGeometry(0.24, 0.06, 0.68), accentMat, [-0.64, 0.19, 0.55], [0, 0, 0], false);
    addPart(new THREE.BoxGeometry(0.24, 0.06, 0.68), accentMat, [0.64, 0.19, 0.55], [0, 0, 0], false);

    // Swept main wings (exact agile fighter planform from screenshots 2, 5, 6, 7!)
    const wingRShape = new THREE.Shape();
    wingRShape.moveTo(0.45, -1.25);
    wingRShape.lineTo(1.25, -0.55);
    wingRShape.lineTo(4.05, 0.88);
    wingRShape.lineTo(4.05, 1.38);
    wingRShape.lineTo(0.48, 1.05);
    wingRShape.closePath();

    const wingRGeo = new THREE.ExtrudeGeometry(wingRShape, { depth: 0.11, bevelEnabled: false });
    wingRGeo.rotateX(Math.PI / 2);
    normalizePlanarUV(wingRGeo);
    addPart(wingRGeo, wingCamo, [0, 0.04, 0.0]);

    const wingLShape = new THREE.Shape();
    wingLShape.moveTo(-0.45, -1.25);
    wingLShape.lineTo(-1.25, -0.55);
    wingLShape.lineTo(-4.05, 0.88);
    wingLShape.lineTo(-4.05, 1.38);
    wingLShape.lineTo(-0.48, 1.05);
    wingLShape.closePath();

    const wingLGeo = new THREE.ExtrudeGeometry(wingLShape, { depth: 0.11, bevelEnabled: false });
    wingLGeo.rotateX(Math.PI / 2);
    normalizePlanarUV(wingLGeo);
    addPart(wingLGeo, wingCamo, [0, 0.04, 0.0]);

    // Wingtip missile rails
    addPart(new THREE.BoxGeometry(0.11, 0.10, 0.95), nozzleMat, [-4.06, 0.0, 1.15]);
    addPart(new THREE.BoxGeometry(0.11, 0.10, 0.95), nozzleMat, [4.06, 0.0, 1.15]);

    // Rear horizontal stabilizers
    const elevRShape = new THREE.Shape();
    elevRShape.moveTo(0.58, 1.55);
    elevRShape.lineTo(2.15, 2.32);
    elevRShape.lineTo(2.15, 2.68);
    elevRShape.lineTo(0.58, 2.42);
    elevRShape.closePath();
    const elevRGeo = new THREE.ExtrudeGeometry(elevRShape, { depth: 0.08, bevelEnabled: false });
    elevRGeo.rotateX(Math.PI / 2);
    normalizePlanarUV(elevRGeo);
    addPart(elevRGeo, tailCamo, [0, 0.02, 0.0]);

    const elevLShape = new THREE.Shape();
    elevLShape.moveTo(-0.58, 1.55);
    elevLShape.lineTo(-2.15, 2.32);
    elevLShape.lineTo(-2.15, 2.68);
    elevLShape.lineTo(-0.58, 2.42);
    elevLShape.closePath();
    const elevLGeo = new THREE.ExtrudeGeometry(elevLShape, { depth: 0.08, bevelEnabled: false });
    elevLGeo.rotateX(Math.PI / 2);
    normalizePlanarUV(elevLGeo);
    addPart(elevLGeo, tailCamo, [0, 0.02, 0.0]);

    // Twin canted vertical tail fins
    const finGeo = new THREE.BoxGeometry(0.10, 1.05, 1.0);
    addPart(finGeo, tailCamo, [-0.62, 0.56, 1.85], [-0.26, 0, 0.22]);
    addPart(finGeo, tailCamo, [0.62, 0.56, 1.85], [-0.26, 0, -0.22]);

    // Twin engine exhaust nozzles
    const nozGeo = new THREE.CylinderGeometry(0.24, 0.30, 0.65, 6);
    nozGeo.rotateX(Math.PI / 2);
    addPart(nozGeo, nozzleMat, [-0.38, -0.02, 2.35]);
    addPart(nozGeo, nozzleMat, [0.38, -0.02, 2.35]);

    // Twin animated afterburner flame cones (excluded from ink outline mask so they glow brightly!)
    const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff8329 });
    const flameInnerMat = new THREE.MeshBasicMaterial({ color: 0xfff599 });
    const outerConeGeo = new THREE.ConeGeometry(0.24, 2.1, 6);
    outerConeGeo.rotateX(Math.PI / 2);
    outerConeGeo.translate(0, 0, 1.05);

    const innerConeGeo = new THREE.ConeGeometry(0.14, 1.35, 6);
    innerConeGeo.rotateX(Math.PI / 2);
    innerConeGeo.translate(0, 0, 0.68);

    this.flameL = new THREE.Group();
    this.flameL.position.set(-0.38, -0.02, 2.62);
    this.flameL.add(new THREE.Mesh(outerConeGeo, flameOuterMat), new THREE.Mesh(innerConeGeo, flameInnerMat));
    this.visual.add(this.flameL);

    this.flameR = new THREE.Group();
    this.flameR.position.set(0.38, -0.02, 2.62);
    this.flameR.add(new THREE.Mesh(outerConeGeo, flameOuterMat), new THREE.Mesh(innerConeGeo, flameInnerMat));
    this.visual.add(this.flameR);

    // Cannon muzzle flash (near starboard wing root)
    const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xfff39e });
    this.muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), muzzleMat);
    this.muzzleFlash.position.set(0.66, -0.04, -1.6);
    this.muzzleFlash.visible = false;
    this.visual.add(this.muzzleFlash);
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

  getWorldPoint(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.visual.matrixWorld);
  }

  getForwardDirection() {
    const fwd = new THREE.Vector3(0, 0, -1);
    fwd.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return fwd.normalize();
  }

  spawnExhaustPuffs() {
    for (const sx of [-0.38, 0.38]) {
      const origin = this.getWorldPoint(sx, -0.02, 3.2);
      const mat = createDitherPuffMaterial();
      const mesh = new THREE.Mesh(this.puffGeo, mat);
      mesh.position.copy(origin);
      const initSize = this.afterburner ? 0.50 : 0.32;
      mesh.scale.setScalar(initSize);
      this.scene.add(mesh);

      const backDir = this.getForwardDirection().multiplyScalar(-12);
      this.puffs.push({
        mesh,
        mat,
        vel: backDir.add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3.2,
            (Math.random() - 0.5) * 3.2,
            (Math.random() - 0.5) * 3.2
          )
        ),
        age: 0,
        maxAge: this.afterburner ? 0.74 : 0.48,
        initSize,
        ab: this.afterburner,
      });
    }
  }

  updatePuffs(dt) {
    const colYellow = new THREE.Color(0xffef7a);
    const colOrange = new THREE.Color(0xf28836);
    const colSmoke = new THREE.Color(0xb6b0c8);

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.scene.remove(p.mesh);
        p.mat.dispose();
        this.puffs.splice(i, 1);
        continue;
      }

      const t = p.age / p.maxAge;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(0.95);

      const scale = p.initSize * (1.0 + t * (p.ab ? 3.5 : 2.3));
      p.mesh.scale.setScalar(scale);

      if (t < 0.25) {
        p.mat.uniforms.uColor.value.copy(colYellow);
        p.mat.uniforms.uAlpha.value = 1.0;
      } else if (t < 0.55) {
        p.mat.uniforms.uColor.value.copy(colOrange);
        p.mat.uniforms.uAlpha.value = 1.0 - (t - 0.25) * 0.6;
      } else {
        p.mat.uniforms.uColor.value.copy(colSmoke);
        p.mat.uniforms.uAlpha.value = Math.max(0, (1.0 - t) / 0.45) * 0.85;
      }
    }
  }

  update(dt, input, isCockpit) {
    let steerX = input.mouseX;
    let steerY = input.mouseY;
    const dead = 0.04;
    if (Math.abs(steerX) < dead) steerX = 0;
    if (Math.abs(steerY) < dead) steerY = 0;

    if (input.keys.KeyA || input.keys.ArrowLeft) steerX = -0.85;
    if (input.keys.KeyD || input.keys.ArrowRight) steerX = 0.85;
    if (input.keys.KeyW || input.keys.ArrowUp) steerY = -0.7;
    if (input.keys.KeyS || input.keys.ArrowDown) steerY = 0.7;

    this.afterburner = input.boost || input.keys.ShiftLeft || input.keys.ShiftRight;

    const targetThrottle = this.afterburner ? 1.0 : 0.64;
    this.throttle = THREE.MathUtils.lerp(this.throttle, targetThrottle, 1 - Math.exp(-5.0 * dt));

    const targetBank = -steerX * 1.15;
    const targetPitch = THREE.MathUtils.clamp(-steerY * 0.68, -0.62, 0.62);

    this.bank = THREE.MathUtils.lerp(this.bank, targetBank, 1 - Math.exp(-6.5 * dt));
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, 1 - Math.exp(-5.2 * dt));

    const turnSpeed = this.afterburner ? 1.05 : 1.32;
    this.yaw += Math.sin(this.bank) * turnSpeed * dt;

    const climbDrag = -Math.sin(this.pitch) * 14.0;
    const targetSpeed = (this.afterburner ? 98 : 64) + climbDrag;
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, 1 - Math.exp(-2.6 * dt));

    const fwd = this.getForwardDirection();
    this.velocity.copy(fwd).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);

    // Spacious boundary for the expanded 2800x2800 world
    const limit = 1220;
    if (Math.abs(this.position.x) > limit || Math.abs(this.position.z) > limit) {
      const toCenter = Math.atan2(-this.position.x, -this.position.z);
      const diff = Math.atan2(Math.sin(toCenter - this.yaw), Math.cos(toCenter - this.yaw));
      this.yaw += diff * 1.8 * dt;
      this.position.x = THREE.MathUtils.clamp(this.position.x, -1300, 1300);
      this.position.z = THREE.MathUtils.clamp(this.position.z, -1300, 1300);
    }

    const groundY = Math.max(WATER_LEVEL, getTerrainHeight(this.position.x, this.position.z));
    this.radarAlt = Math.max(0, this.position.y - groundY);
    this.lowAltWarning = this.radarAlt < 16;

    if (this.position.y < groundY + 6.5) {
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

    this.group.position.copy(this.position);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = this.pitch;
    this.visual.rotation.z = this.bank + extraRoll;

    this.group.updateMatrixWorld(true);

    // Animate afterburner flames
    const flicker = 0.85 + Math.random() * 0.32;
    const fLen = (this.afterburner ? 1.55 : 0.62) * flicker;
    const fRad = this.afterburner ? 1.15 : 0.72;
    this.flameL.scale.set(fRad, fRad, fLen);
    this.flameR.scale.set(fRad, fRad, fLen);

    // Update crisp white wingtip contrails
    this.trailTimer += dt;
    if (this.trailTimer >= 0.018) {
      this.trailTimer = 0;
      const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.bank + extraRoll, 'YXZ'))
      );
      const tipL = this.getWorldPoint(-4.05, 0.04, 1.32);
      const tipR = this.getWorldPoint(4.05, 0.04, 1.32);
      this.leftTrail.push(tipL, rightVec);
      this.rightTrail.push(tipR, rightVec);
    }

    if (!isCockpit) {
      this.puffTimer += dt;
      const interval = this.afterburner ? 0.048 : 0.088;
      if (this.puffTimer >= interval) {
        this.puffTimer = 0;
        this.spawnExhaustPuffs();
      }
    }
    this.updatePuffs(dt);
  }
}

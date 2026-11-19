import * as THREE from 'three';
import { getTerrainHeight, WATER_LEVEL, SUN_DIR } from './world.js?v=7';

/**
 * Custom top-down pixel-art texture mapped directly onto the sculpted 3D fighter planform.
 * Matches the bright silver-white wings, jagged lavender-slate dorsal camo, orange-red
 * intake/wingtip accents, and dark nose tip seen in the reference screenshots.
 * UV convention: u = x / 8.4 + 0.5 (left=-4.2..right=+4.2), v = (z + 4.1) / 7.0 (nose=-4.1..tail=+2.9)
 */
function createPlanformTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const toU = (x) => Math.round((x / 8.4 + 0.5) * S);
  const toV = (z) => Math.round(((z + 4.1) / 7.0) * S);

  // 1. Bright icy silver-white base across entire aircraft
  ctx.fillStyle = '#e5eaf6';
  ctx.fillRect(0, 0, S, S);

  // 2. Soft cool-silver shading toward wing trailing edges & tailplanes
  ctx.fillStyle = '#cfd7ea';
  ctx.fillRect(0, toV(0.65), S, S - toV(0.65));

  // 3. Signature jagged dorsal camouflage pattern (matches screenshots 2, 5, 6, 7!)
  ctx.fillStyle = '#8b93ae';
  ctx.beginPath();
  ctx.moveTo(toU(0.0), toV(-2.2));
  ctx.lineTo(toU(0.75), toV(-1.1));
  ctx.lineTo(toU(1.55), toV(-0.35));
  ctx.lineTo(toU(0.95), toV(0.15));
  ctx.lineTo(toU(1.85), toV(0.75));
  ctx.lineTo(toU(1.05), toV(1.15));
  ctx.lineTo(toU(1.35), toV(2.1));
  ctx.lineTo(toU(0.0), toV(2.45));
  ctx.lineTo(toU(-1.35), toV(2.1));
  ctx.lineTo(toU(-1.05), toV(1.15));
  ctx.lineTo(toU(-1.85), toV(0.75));
  ctx.lineTo(toU(-0.95), toV(0.15));
  ctx.lineTo(toU(-1.55), toV(-0.35));
  ctx.lineTo(toU(-0.75), toV(-1.1));
  ctx.closePath();
  ctx.fill();

  // Deeper slate-lavender inner spine & twin-engine valley
  ctx.fillStyle = '#6c7490';
  ctx.beginPath();
  ctx.moveTo(toU(0.0), toV(-1.0));
  ctx.lineTo(toU(0.62), toV(-0.2));
  ctx.lineTo(toU(0.45), toV(0.55));
  ctx.lineTo(toU(0.95), toV(1.25));
  ctx.lineTo(toU(0.78), toV(2.35));
  ctx.lineTo(toU(-0.78), toV(2.35));
  ctx.lineTo(toU(-0.95), toV(1.25));
  ctx.lineTo(toU(-0.45), toV(0.55));
  ctx.lineTo(toU(-0.62), toV(-0.2));
  ctx.closePath();
  ctx.fill();

  // Crisp light-silver dorsal highlight ridge down the center spine
  ctx.fillStyle = '#dde3f2';
  ctx.fillRect(toU(-0.24), toV(-0.7), toU(0.24) - toU(-0.24), toV(0.65) - toV(-0.7));

  // Subtle wing splinter patches on outer wings
  ctx.fillStyle = '#aeb6ce';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(toU(side * 1.9), toV(0.15));
    ctx.lineTo(toU(side * 3.1), toV(0.55));
    ctx.lineTo(toU(side * 2.7), toV(0.92));
    ctx.lineTo(toU(side * 1.65), toV(0.62));
    ctx.closePath();
    ctx.fill();
  }

  // Subtle pixel panel lines along wing roots & flaps
  ctx.strokeStyle = '#5d6580';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(toU(side * 1.1), toV(-0.75));
    ctx.lineTo(toU(side * 1.15), toV(1.05));
    ctx.moveTo(toU(side * 1.45), toV(0.88));
    ctx.lineTo(toU(side * 3.55), toV(0.92));
  }
  ctx.stroke();

  // Signature red-orange squadron flashes on wing roots & wingtip rails (visible in photos!)
  ctx.fillStyle = '#e55238';
  for (const side of [-1, 1]) {
    const x1 = toU(side * 0.92);
    const x2 = toU(side * 1.28);
    ctx.fillRect(Math.min(x1, x2), toV(0.15), Math.abs(x2 - x1), Math.max(2, toV(0.68) - toV(0.15)));

    const wx1 = toU(side * 3.65);
    const wx2 = toU(side * 4.05);
    ctx.fillRect(Math.min(wx1, wx2), toV(0.62), Math.abs(wx2 - wx1), Math.max(2, toV(0.96) - toV(0.62)));
  }

  // Dark pointed radome tip at the nose
  ctx.fillStyle = '#2d3146';
  ctx.fillRect(toU(-0.55), 0, toU(0.55) - toU(-0.55), toV(-3.32));

  // Dark metallic rear engine cowling band
  ctx.fillStyle = '#383d54';
  ctx.fillRect(toU(-0.95), toV(2.22), toU(0.95) - toU(-0.95), S - toV(2.22));

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = false; // v=0 at top (nose z=-4.1), v=1 at bottom (tail z=+2.9)
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCanopyTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 32;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#f8d84e';
  ctx.fillRect(0, 0, 16, 32);
  ctx.fillStyle = '#fff7c4';
  ctx.fillRect(4, 5, 8, 13);
  ctx.fillStyle = '#e3a12a';
  ctx.fillRect(0, 23, 16, 9);
  ctx.fillStyle = '#222638';
  ctx.fillRect(0, 0, 16, 2);
  ctx.fillRect(0, 29, 16, 3);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFinTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Light silver tail fin with slate lower patch, crisp red-orange top tip & dark ink border
  ctx.fillStyle = '#dce3f2';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#7e86a2';
  ctx.fillRect(0, 9, 16, 7);
  ctx.fillStyle = '#e65238';
  ctx.fillRect(1, 1, 14, 3);
  // Crisp thin dark border around fin edges so twin tails pop against bright fuselage
  ctx.fillStyle = '#222538';
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillRect(15, 0, 1, 16);
  ctx.fillRect(0, 0, 16, 1);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Bright, crisp sunset cel-shaded material that preserves the luminous silver-white
 * pixel-art look of the jet without muddy dark shading.
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
        float upLit = clamp(N.y * 0.25 + 0.82, 0.72, 1.06);

        // Clean 2-step cel light (high ambient so wings stay bright icy-silver!)
        float band = step(-0.14, ndl);
        vec3 shadeCol = vec3(0.84, 0.83, 0.94);
        vec3 litCol   = vec3(1.07, 1.04, 1.00);
        vec3 col = texCol * mix(shadeCol, litCol, band) * upLit;

        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `,
  });
}

/**
 * Builds a single continuous sculpted blended-wing-body fuselage (no stacked boxes!).
 * Cross-sections are lofted smoothly from the needle nose to twin engine nacelles.
 */
function buildSculptedFuselage() {
  // Each station: { z, w (half-width), top, midY, bot, chineW }
  const stations = [
    { z: -3.95, w: 0.03, chineW: 0.03, top: 0.02, midY: 0.0, bot: -0.02 },
    { z: -3.25, w: 0.24, chineW: 0.30, top: 0.16, midY: 0.01, bot: -0.12 },
    { z: -2.30, w: 0.48, chineW: 0.62, top: 0.28, midY: 0.02, bot: -0.18 },
    { z: -1.25, w: 0.72, chineW: 1.06, top: 0.34, midY: 0.04, bot: -0.22 }, // LERX shoulders
    { z: 0.15, w: 0.88, chineW: 1.18, top: 0.34, midY: 0.04, bot: -0.22 },
    { z: 1.30, w: 0.86, chineW: 1.08, top: 0.30, midY: 0.02, bot: -0.20 },
    { z: 2.25, w: 0.76, chineW: 0.90, top: 0.22, midY: 0.0, bot: -0.16 },
    { z: 2.52, w: 0.60, chineW: 0.68, top: 0.14, midY: 0.0, bot: -0.12 },
  ];

  // 8-point octagonal airfoil cross-section per station (CW from top-center looking from +Z)
  const rings = stations.map((s) => [
    [0, s.top, s.z],
    [s.w * 0.68, s.top * 0.82, s.z],
    [s.chineW, s.midY, s.z],
    [s.w * 0.72, s.bot * 0.85, s.z],
    [0, s.bot, s.z],
    [-s.w * 0.72, s.bot * 0.85, s.z],
    [-s.chineW, s.midY, s.z],
    [-s.w * 0.68, s.top * 0.82, s.z],
  ]);

  const positions = [];
  const uvs = [];

  const pushTri = (a, b, c) => {
    for (const v of [a, b, c]) {
      positions.push(v[0], v[1], v[2]);
      uvs.push(v[0] / 8.4 + 0.5, (v[2] + 4.1) / 7.0);
    }
  };

  for (let r = 0; r < rings.length - 1; r++) {
    const ringA = rings[r];
    const ringB = rings[r + 1];
    const n = ringA.length;
    for (let i = 0; i < n; i++) {
      const ni = (i + 1) % n;
      const a0 = ringA[i];
      const a1 = ringA[ni];
      const b0 = ringB[i];
      const b1 = ringB[ni];
      pushTri(a0, b0, b1);
      pushTri(a0, b1, a1);
    }
  }

  // Close rear bulkhead
  const backRing = rings[rings.length - 1];
  const backCenter = [0, 0, stations[stations.length - 1].z];
  for (let i = 0; i < backRing.length; i++) {
    const ni = (i + 1) % backRing.length;
    pushTri(backCenter, backRing[ni], backRing[i]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a sleek tapered airfoil surface (used for swept main wings & horizontal tailplanes)
 * with sharp leading/trailing edges and exact top-down planform UV mapping.
 */
function buildAirfoilSurface(side, rootLE, rootTE, tipLE, tipTE, rootThick, tipThick, yOff = 0.02) {
  const s = side; // -1 left, +1 right
  const rMidZ = (rootLE[1] + rootTE[1]) * 0.5;
  const tMidZ = (tipLE[1] + tipTE[1]) * 0.5;

  // Root & tip diamond-airfoil 4 vertices (LE, TopMid, TE, BotMid)
  const rLE = [s * rootLE[0], yOff, rootLE[1]];
  const rTop = [s * rootLE[0], yOff + rootThick * 0.65, rMidZ];
  const rTE = [s * rootTE[0], yOff, rootTE[1]];
  const rBot = [s * rootLE[0], yOff - rootThick * 0.45, rMidZ];

  const tLE = [s * tipLE[0], yOff, tipLE[1]];
  const tTop = [s * tipLE[0], yOff + tipThick * 0.6, tMidZ];
  const tTE = [s * tipTE[0], yOff, tipTE[1]];
  const tBot = [s * tipLE[0], yOff - tipThick * 0.4, tMidZ];

  const positions = [];
  const uvs = [];

  const pushTri = (a, b, c) => {
    const verts = s > 0 ? [a, b, c] : [a, c, b];
    for (const v of verts) {
      positions.push(v[0], v[1], v[2]);
      uvs.push(v[0] / 8.4 + 0.5, (v[2] + 4.1) / 7.0);
    }
  };

  // Top front & top rear panels (CCW looking from +Y -> outward +Y normals!)
  pushTri(rLE, rTop, tTop);
  pushTri(rLE, tTop, tLE);
  pushTri(rTop, rTE, tTE);
  pushTri(rTop, tTE, tTop);

  // Bottom front & bottom rear panels (outward -Y normals!)
  pushTri(rLE, tBot, rBot);
  pushTri(rLE, tLE, tBot);
  pushTri(rBot, tTE, rTE);
  pushTri(rBot, tBot, tTE);

  // Wingtip cap (outward +/-X normals!)
  pushTri(tLE, tTop, tTE);
  pushTri(tLE, tTE, tBot);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a sleek canted trapezoidal vertical tail fin (twin stabilizers).
 */
function buildVerticalFin(side) {
  const s = side;
  const shape = new THREE.Shape();
  shape.moveTo(-0.62, 0.0);
  shape.lineTo(0.45, 0.0);
  shape.lineTo(0.62, 1.02);
  shape.lineTo(0.08, 1.02);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  geo.translate(0, 0, -0.04);
  geo.rotateY(Math.PI / 2); // now lies in YZ plane (length along Z, height along Y)

  // Map UVs [0..1] neatly across fin height so red tip sits on top
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const y = pos.getY(i);
    uv[i * 2] = (z + 0.65) / 1.3;
    uv[i * 2 + 1] = 1.0 - y / 1.02;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();

  // Cant outward slightly like F-22 / Su-27 twin tails
  geo.rotateZ(-s * 0.28);
  return geo;
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

  setVisible(v) {
    this.mesh.visible = v;
  }
}

export class FighterJet {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.visual = new THREE.Group();
    this.hullGroup = new THREE.Group(); // meshes included in the crisp 1px silhouette outline pass
    this.visual.add(this.hullGroup);
    this.group.add(this.visual);
    scene.add(this.group);

    this.buildMesh();
    this.visual.scale.setScalar(0.74);

    this.leftTrail = new RibbonTrail(scene, 84, 0.14, 0xffffff);
    this.rightTrail = new RibbonTrail(scene, 84, 0.14, 0xffffff);
    this.trailTimer = 0;

    this.puffs = [];
    this.puffGeo = new THREE.IcosahedronGeometry(1.0, 1);
    this.puffTimer = 0;

    // Start over the central bay facing islands, ships, lighthouses & sky balloons
    this.position = new THREE.Vector3(-85, 86, 195);
    this.yaw = 0.18;
    this.pitch = -0.05;
    this.bank = 0;
    this.rollAnim = 0;
    this.rollDir = 1;

    this.speed = 64;
    this.throttle = 0.65;
    this.afterburner = false;
    this.gForce = 1.0;
    this.vsi = 0;
    this.radarAlt = 86;
    this.lowAltWarning = false;

    this.velocity = new THREE.Vector3(0, 0, -this.speed);
    this.prevPitch = this.pitch;
    this.prevYaw = this.yaw;

    this.group.position.copy(this.position);
  }

  buildMesh() {
    const planTex = createPlanformTexture();
    const canopyTex = createCanopyTexture();
    const finTex = createFinTexture();

    const bodyMat = createBrightJetMaterial(planTex, 0xffffff);
    const finMat = createBrightJetMaterial(finTex, 0xffffff);
    const canopyMat = new THREE.MeshBasicMaterial({ map: canopyTex });
    const nozzleMat = new THREE.MeshBasicMaterial({ color: 0x2c3044 });

    // 1. Continuous sculpted blended-wing-body fuselage
    const fuselage = new THREE.Mesh(buildSculptedFuselage(), bodyMat);
    this.hullGroup.add(fuselage);

    // 2. Sculpted swept main delta-arrow wings (matches exact planform in screenshots!)
    for (const side of [-1, 1]) {
      const wingGeo = buildAirfoilSurface(
        side,
        [0.85, -1.25], // root leading edge
        [0.85, 1.08],  // root trailing edge
        [3.95, 0.56],  // swept wingtip leading edge
        [3.95, 0.98],  // wingtip trailing edge
        0.24,
        0.07,
        0.03
      );
      this.hullGroup.add(new THREE.Mesh(wingGeo, bodyMat));

      // Sleek rear horizontal tailplanes with clear notch behind main wings
      const tailGeo = buildAirfoilSurface(
        side,
        [0.72, 1.38],
        [0.72, 2.28],
        [2.22, 1.98],
        [2.22, 2.46],
        0.14,
        0.06,
        0.01
      );
      this.hullGroup.add(new THREE.Mesh(tailGeo, bodyMat));

      // Twin canted vertical tail fins with red-orange tips
      const fin = new THREE.Mesh(buildVerticalFin(side), finMat);
      fin.position.set(side * 0.64, 0.20, 1.66);
      this.hullGroup.add(fin);

      // Twin tapered engine exhaust nozzles
      const nozGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.58, 7);
      nozGeo.rotateX(Math.PI / 2);
      const noz = new THREE.Mesh(nozGeo, nozzleMat);
      noz.position.set(side * 0.40, 0.0, 2.60);
      this.hullGroup.add(noz);
    }

    // 3. Sculpted teardrop golden-yellow bubble canopy
    const canopyGeo = new THREE.SphereGeometry(1.0, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.scale.set(0.32, 0.30, 1.05);
    canopy.position.set(0, 0.24, -1.62);
    this.hullGroup.add(canopy);

    // 4. Twin animated afterburner flames (excluded from outline mask so they glow!)
    const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff8026 });
    const flameInnerMat = new THREE.MeshBasicMaterial({ color: 0xfff6a0 });
    const outerConeGeo = new THREE.ConeGeometry(0.23, 2.25, 6);
    outerConeGeo.rotateX(Math.PI / 2);
    outerConeGeo.translate(0, 0, 1.12);

    const innerConeGeo = new THREE.ConeGeometry(0.13, 1.45, 6);
    innerConeGeo.rotateX(Math.PI / 2);
    innerConeGeo.translate(0, 0, 0.72);

    this.flameL = new THREE.Group();
    this.flameL.position.set(-0.40, 0.0, 2.82);
    this.flameL.add(new THREE.Mesh(outerConeGeo, flameOuterMat), new THREE.Mesh(innerConeGeo, flameInnerMat));
    this.visual.add(this.flameL);

    this.flameR = new THREE.Group();
    this.flameR.position.set(0.40, 0.0, 2.82);
    this.flameR.add(new THREE.Mesh(outerConeGeo, flameOuterMat), new THREE.Mesh(innerConeGeo, flameInnerMat));
    this.visual.add(this.flameR);

    // 5. Cannon muzzle flash at starboard wing-root gun port
    const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xfff49e });
    this.muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), muzzleMat);
    this.muzzleFlash.position.set(0.75, 0.0, -1.55);
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
    for (const sx of [-0.40, 0.40]) {
      const origin = this.getWorldPoint(sx, 0.0, 3.45);
      const mat = createDitherPuffMaterial();
      const mesh = new THREE.Mesh(this.puffGeo, mat);
      mesh.position.copy(origin);
      const initSize = this.afterburner ? 0.52 : 0.34;
      mesh.scale.setScalar(initSize);
      this.scene.add(mesh);

      const backDir = this.getForwardDirection().multiplyScalar(-12);
      this.puffs.push({
        mesh,
        mat,
        vel: backDir.add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3.0,
            (Math.random() - 0.5) * 3.0,
            (Math.random() - 0.5) * 3.0
          )
        ),
        age: 0,
        maxAge: this.afterburner ? 0.76 : 0.48,
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

      const scale = p.initSize * (1.0 + t * (p.ab ? 3.6 : 2.4));
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
      const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.bank + extraRoll, 'YXZ'))
      );
      const tipL = this.getWorldPoint(-3.95, 0.03, 0.96);
      const tipR = this.getWorldPoint(3.95, 0.03, 0.96);
      this.leftTrail.push(tipL, rightVec);
      this.rightTrail.push(tipR, rightVec);
    }

    if (!isCockpit) {
      this.puffTimer += dt;
      const interval = this.afterburner ? 0.046 : 0.085;
      if (this.puffTimer >= interval) {
        this.puffTimer = 0;
        this.spawnExhaustPuffs();
      }
    }
    this.updatePuffs(dt);
  }
}

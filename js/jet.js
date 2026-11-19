import * as THREE from 'three';
import { getTerrainHeight, WATER_LEVEL, SUN_DIR } from './world.js?v=13';

export const SHIP_IDS = ['striker', 'viper', 'phantom', 'hornet', 'starfire', 'sakura'];

export const SHIP_CATALOG = {
  striker: {
    id: 'striker',
    name: 'F-22 STRIKER',
    role: 'BALANCED MULTIROLE',
    cruiseSpeed: 64,
    abSpeed: 98,
    turnRate: 1.32,
    abTurnRate: 1.05,
    bankMax: 1.15,
    maxHp: 100,
    maxMissiles: 4,
    cannonCd: 0.068,
    cannonDmg: 16,
    palette: {
      base: '#e5eaf6',
      shade: '#cfd7ea',
      camo1: '#8b93ae',
      camo2: '#6c7490',
      wingPatch: '#aeb6ce',
      accent: '#e55238',
      canopyTop: '#f8d84e',
      canopyHi: '#fff7c4',
      canopyBot: '#e3a12a',
    },
  },
  viper: {
    id: 'viper',
    name: 'X-29 VIPER',
    role: 'AGILE INTERCEPTOR',
    cruiseSpeed: 72,
    abSpeed: 112,
    turnRate: 1.62,
    abTurnRate: 1.32,
    bankMax: 1.30,
    maxHp: 80,
    maxMissiles: 4,
    cannonCd: 0.056,
    cannonDmg: 15,
    palette: {
      base: '#eef4ff',
      shade: '#d4e2f8',
      camo1: '#5272b8',
      camo2: '#39528f',
      wingPatch: '#7e9ee0',
      accent: '#28c4ff',
      canopyTop: '#76f0ff',
      canopyHi: '#dcffff',
      canopyBot: '#29b4d4',
    },
  },
  phantom: {
    id: 'phantom',
    name: 'B-17 PHANTOM',
    role: 'STEALTH MISSILE BOAT',
    cruiseSpeed: 56,
    abSpeed: 86,
    turnRate: 1.06,
    abTurnRate: 0.84,
    bankMax: 0.96,
    maxHp: 150,
    maxMissiles: 8,
    cannonCd: 0.082,
    cannonDmg: 22,
    palette: {
      base: '#707892',
      shade: '#59607a',
      camo1: '#495069',
      camo2: '#33384d',
      wingPatch: '#838ba6',
      accent: '#ffb842',
      canopyTop: '#ffb842',
      canopyHi: '#ffe59c',
      canopyBot: '#d97a24',
    },
  },
  hornet: {
    id: 'hornet',
    name: 'F-14 HORNET',
    role: 'HEAVY GUNSHIP',
    cruiseSpeed: 60,
    abSpeed: 94,
    turnRate: 1.22,
    abTurnRate: 0.96,
    bankMax: 1.08,
    maxHp: 125,
    maxMissiles: 6,
    cannonCd: 0.064,
    cannonDmg: 18,
    palette: {
      base: '#eee0b8',
      shade: '#d8c79b',
      camo1: '#88866c',
      camo2: '#64634c',
      wingPatch: '#b4ad86',
      accent: '#e8682c',
      canopyTop: '#f8d84e',
      canopyHi: '#fff7c4',
      canopyBot: '#e3a12a',
    },
  },
  starfire: {
    id: 'starfire',
    name: 'SU-47 STARFIRE',
    role: 'SUPERSONIC STRIKER',
    cruiseSpeed: 76,
    abSpeed: 118,
    turnRate: 1.44,
    abTurnRate: 1.15,
    bankMax: 1.22,
    maxHp: 90,
    maxMissiles: 6,
    cannonCd: 0.066,
    cannonDmg: 16,
    palette: {
      base: '#f2eef7',
      shade: '#dcd4eb',
      camo1: '#7e7596',
      camo2: '#564e6d',
      wingPatch: '#b6add1',
      accent: '#d94438',
      canopyTop: '#ffe266',
      canopyHi: '#fff9cc',
      canopyBot: '#eb9e28',
    },
  },
  sakura: {
    id: 'sakura',
    name: 'F-15 SAKURA',
    role: 'ROSE ACE INTERCEPTOR',
    cruiseSpeed: 70,
    abSpeed: 108,
    turnRate: 1.52,
    abTurnRate: 1.24,
    bankMax: 1.26,
    maxHp: 110,
    maxMissiles: 6,
    cannonCd: 0.060,
    cannonDmg: 17,
    palette: {
      base: '#ffb8dc',
      shade: '#f295c4',
      camo1: '#e0589c',
      camo2: '#b33476',
      wingPatch: '#ffd8ec',
      accent: '#ff2e88',
      canopyTop: '#fff0a8',
      canopyHi: '#ffffff',
      canopyBot: '#f082b8',
    },
  },
};

/**
 * Custom top-down pixel-art texture mapped directly onto the sculpted 3D fighter planform.
 * UV convention: u = x / 8.4 + 0.5 (left=-4.2..right=+4.2), v = (z + 4.1) / 7.0 (nose=-4.1..tail=+2.9)
 */
function createPlanformTexture(accentHex = '#e55238', pal = SHIP_CATALOG.striker.palette) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const toU = (x) => Math.round((x / 8.4 + 0.5) * S);
  const toV = (z) => Math.round(((z + 4.1) / 7.0) * S);

  // 1. Bright base across entire aircraft
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, S, S);

  // 2. Soft shading toward wing trailing edges & tailplanes
  ctx.fillStyle = pal.shade;
  ctx.fillRect(0, toV(0.65), S, S - toV(0.65));

  // 3. Signature jagged dorsal camouflage pattern
  ctx.fillStyle = pal.camo1;
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

  // Deeper inner spine & twin-engine valley
  ctx.fillStyle = pal.camo2;
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

  // Crisp light dorsal highlight ridge down the center spine
  ctx.fillStyle = pal.base;
  ctx.fillRect(toU(-0.24), toV(-0.7), toU(0.24) - toU(-0.24), toV(0.65) - toV(-0.7));

  // Subtle wing splinter patches on outer wings
  ctx.fillStyle = pal.wingPatch;
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

  // Signature squadron flashes on wing roots & wingtip rails (visible in photos!)
  ctx.fillStyle = accentHex;
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

function createCanopyTexture(pal = SHIP_CATALOG.striker.palette) {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 32;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = pal.canopyTop;
  ctx.fillRect(0, 0, 16, 32);
  ctx.fillStyle = pal.canopyHi;
  ctx.fillRect(4, 5, 8, 13);
  ctx.fillStyle = pal.canopyBot;
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

function createFinTexture(accentHex = '#e65238', pal = SHIP_CATALOG.striker.palette) {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Tail fin with ship palette lower patch, crisp squadron top tip & dark ink border
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = pal.camo1;
  ctx.fillRect(0, 9, 16, 7);
  ctx.fillStyle = accentHex;
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

const DEFAULT_FUSELAGE_STATIONS = [
  { z: -3.95, w: 0.03, chineW: 0.03, top: 0.02, midY: 0.0, bot: -0.02 },
  { z: -3.25, w: 0.24, chineW: 0.30, top: 0.16, midY: 0.01, bot: -0.12 },
  { z: -2.30, w: 0.48, chineW: 0.62, top: 0.28, midY: 0.02, bot: -0.18 },
  { z: -1.25, w: 0.72, chineW: 1.06, top: 0.34, midY: 0.04, bot: -0.22 },
  { z: 0.15, w: 0.88, chineW: 1.18, top: 0.34, midY: 0.04, bot: -0.22 },
  { z: 1.30, w: 0.86, chineW: 1.08, top: 0.30, midY: 0.02, bot: -0.20 },
  { z: 2.25, w: 0.76, chineW: 0.90, top: 0.22, midY: 0.0, bot: -0.16 },
  { z: 2.52, w: 0.60, chineW: 0.68, top: 0.14, midY: 0.0, bot: -0.12 },
];

/**
 * Builds a single continuous sculpted blended-wing-body fuselage (no stacked boxes!).
 * Cross-sections are lofted smoothly from the needle nose to twin engine nacelles.
 */
function buildSculptedFuselage(stations = DEFAULT_FUSELAGE_STATIONS) {

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
 * Builds a sleek tapered airfoil surface (used for swept main wings, canards & tailplanes)
 * with sharp leading/trailing edges and exact top-down planform UV mapping.
 */
export function buildAirfoilSurface(side, rootLE, rootTE, tipLE, tipTE, rootThick, tipThick, yOff = 0.02) {
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

  clear() {
    this.points.length = 0;
    this.geo.attributes.position.array.fill(0);
    this.geo.attributes.position.needsUpdate = true;
  }

  setVisible(v) {
    this.mesh.visible = v;
  }
}

/**
 * Shared sculpted 3D fighter jet visual rig supporting 5 distinct ship varieties.
 */
function buildJetVisualRig(shipId = 'striker', accentOverride = null) {
  const spec = SHIP_CATALOG[shipId] || SHIP_CATALOG.striker;
  const pal = spec.palette;
  const accentHex = accentOverride || pal.accent;

  const group = new THREE.Group();
  const visual = new THREE.Group();
  const hullGroup = new THREE.Group(); // meshes included in the crisp 1px silhouette outline pass
  visual.add(hullGroup);
  group.add(visual);

  const planTex = createPlanformTexture(accentHex, pal);
  const canopyTex = createCanopyTexture(pal);
  const finTex = createFinTexture(accentHex, pal);

  const bodyMat = createBrightJetMaterial(planTex, 0xffffff);
  const finMat = createBrightJetMaterial(finTex, 0xffffff);
  const canopyMat = new THREE.MeshBasicMaterial({ map: canopyTex });
  const nozzleMat = new THREE.MeshBasicMaterial({ color: 0x2c3044 });
  const podMat = new THREE.MeshBasicMaterial({ color: 0x3b4157 });

  // Ship-specific fuselage profiles
  let stations = DEFAULT_FUSELAGE_STATIONS;
  if (shipId === 'phantom') {
    stations = [
      { z: -3.45, w: 0.06, chineW: 0.08, top: 0.02, midY: 0.0, bot: -0.02 },
      { z: -2.40, w: 0.65, chineW: 0.95, top: 0.22, midY: 0.02, bot: -0.14 },
      { z: -1.10, w: 1.05, chineW: 1.65, top: 0.30, midY: 0.04, bot: -0.18 },
      { z: 0.35, w: 1.25, chineW: 1.85, top: 0.30, midY: 0.04, bot: -0.18 },
      { z: 1.65, w: 1.15, chineW: 1.60, top: 0.24, midY: 0.02, bot: -0.16 },
      { z: 2.38, w: 0.82, chineW: 1.05, top: 0.14, midY: 0.0, bot: -0.12 },
    ];
  } else if (shipId === 'starfire') {
    stations = [
      { z: -4.35, w: 0.03, chineW: 0.03, top: 0.02, midY: 0.0, bot: -0.02 },
      { z: -3.35, w: 0.24, chineW: 0.32, top: 0.16, midY: 0.01, bot: -0.12 },
      { z: -2.20, w: 0.50, chineW: 0.66, top: 0.28, midY: 0.02, bot: -0.18 },
      { z: -1.05, w: 0.74, chineW: 1.08, top: 0.34, midY: 0.04, bot: -0.22 },
      { z: 0.25, w: 0.88, chineW: 1.18, top: 0.34, midY: 0.04, bot: -0.22 },
      { z: 1.40, w: 0.86, chineW: 1.08, top: 0.28, midY: 0.02, bot: -0.20 },
      { z: 2.38, w: 0.72, chineW: 0.86, top: 0.18, midY: 0.0, bot: -0.14 },
      { z: 2.62, w: 0.58, chineW: 0.66, top: 0.12, midY: 0.0, bot: -0.10 },
    ];
  } else if (shipId === 'viper') {
    stations = [
      { z: -3.85, w: 0.03, chineW: 0.03, top: 0.02, midY: 0.0, bot: -0.02 },
      { z: -3.05, w: 0.22, chineW: 0.28, top: 0.15, midY: 0.01, bot: -0.11 },
      { z: -2.05, w: 0.42, chineW: 0.54, top: 0.26, midY: 0.02, bot: -0.16 },
      { z: -0.95, w: 0.62, chineW: 0.86, top: 0.32, midY: 0.04, bot: -0.20 },
      { z: 0.30, w: 0.72, chineW: 0.94, top: 0.32, midY: 0.04, bot: -0.20 },
      { z: 1.50, w: 0.66, chineW: 0.82, top: 0.26, midY: 0.02, bot: -0.18 },
      { z: 2.45, w: 0.48, chineW: 0.58, top: 0.16, midY: 0.0, bot: -0.12 },
    ];
  } else if (shipId === 'sakura') {
    stations = [
      { z: -4.10, w: 0.03, chineW: 0.03, top: 0.02, midY: 0.0, bot: -0.02 },
      { z: -3.30, w: 0.23, chineW: 0.30, top: 0.16, midY: 0.01, bot: -0.12 },
      { z: -2.25, w: 0.46, chineW: 0.60, top: 0.28, midY: 0.02, bot: -0.17 },
      { z: -1.15, w: 0.70, chineW: 1.04, top: 0.34, midY: 0.04, bot: -0.21 },
      { z: 0.20, w: 0.86, chineW: 1.16, top: 0.34, midY: 0.04, bot: -0.21 },
      { z: 1.35, w: 0.84, chineW: 1.06, top: 0.29, midY: 0.02, bot: -0.19 },
      { z: 2.30, w: 0.74, chineW: 0.88, top: 0.21, midY: 0.0, bot: -0.15 },
      { z: 2.55, w: 0.60, chineW: 0.68, top: 0.14, midY: 0.0, bot: -0.11 },
    ];
  }

  // 1. Continuous sculpted fuselage
  hullGroup.add(new THREE.Mesh(buildSculptedFuselage(stations), bodyMat));

  let wingtipPoint = [3.95, 0.03, 0.96];
  let canopyPos = [0, 0.24, -1.62];
  let nozzleX = 0.40;
  let nozzleZ = 2.60;

  if (shipId === 'viper') {
    // Forward-swept main wings + front canards + single tall central vertical fin
    wingtipPoint = [3.85, 0.04, -0.58];
    canopyPos = [0, 0.24, -1.55];
    nozzleX = 0.28;
    nozzleZ = 2.52;
    for (const side of [-1, 1]) {
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.72, -0.10], [0.72, 1.35], [3.85, -1.05], [3.85, -0.55], 0.22, 0.06, 0.03),
        bodyMat
      ));
      // Agile front canards
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.46, -2.55], [0.46, -2.02], [1.62, -2.18], [1.62, -1.78], 0.12, 0.05, 0.03),
        bodyMat
      ));
      // Compact tailplane
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.58, 1.48], [0.58, 2.25], [1.75, 1.92], [1.75, 2.38], 0.12, 0.05, 0.01),
        bodyMat
      ));
    }
    const centerFin = new THREE.Mesh(buildVerticalFin(0), finMat);
    centerFin.scale.set(1.0, 1.25, 1.1);
    centerFin.position.set(0, 0.24, 1.65);
    hullGroup.add(centerFin);
  } else if (shipId === 'phantom') {
    // Broad stealth flying-wing delta (no rear horizontal stabilizers)
    wingtipPoint = [4.65, 0.03, 1.72];
    canopyPos = [0, 0.22, -1.35];
    nozzleX = 0.56;
    nozzleZ = 2.48;
    for (const side of [-1, 1]) {
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [1.05, -1.75], [1.05, 1.52], [4.65, 0.92], [4.65, 1.75], 0.26, 0.08, 0.03),
        bodyMat
      ));
      const fin = new THREE.Mesh(buildVerticalFin(side), finMat);
      fin.scale.set(1.0, 0.78, 1.15);
      fin.position.set(side * 1.15, 0.16, 1.48);
      hullGroup.add(fin);
    }
  } else if (shipId === 'hornet') {
    // Broad high-aspect wings + wide twin tails + twin underwing missile pods
    wingtipPoint = [4.35, 0.04, 0.42];
    canopyPos = [0, 0.25, -1.58];
    nozzleX = 0.46;
    nozzleZ = 2.62;
    for (const side of [-1, 1]) {
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.88, -1.32], [0.88, 1.10], [4.35, -0.18], [4.35, 0.46], 0.25, 0.08, 0.03),
        bodyMat
      ));
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.78, 1.40], [0.78, 2.34], [2.42, 1.96], [2.42, 2.48], 0.15, 0.06, 0.01),
        bodyMat
      ));
      const fin = new THREE.Mesh(buildVerticalFin(side), finMat);
      fin.scale.set(1.0, 1.1, 1.05);
      fin.position.set(side * 0.88, 0.20, 1.66);
      hullGroup.add(fin);

      // Underwing missile/gun pod
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 6), podMat);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(side * 1.85, -0.18, 0.12);
      hullGroup.add(pod);
    }
  } else if (shipId === 'starfire') {
    // Double-delta supersonic fighter with front canards & extra-long nose
    wingtipPoint = [4.10, 0.03, 1.24];
    canopyPos = [0, 0.24, -1.85];
    nozzleX = 0.40;
    nozzleZ = 2.68;
    for (const side of [-1, 1]) {
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.85, -1.25], [0.85, 1.25], [4.10, 0.72], [4.10, 1.26], 0.24, 0.07, 0.03),
        bodyMat
      ));
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.50, -2.55], [0.50, -1.85], [1.75, -1.85], [1.75, -1.42], 0.13, 0.05, 0.03),
        bodyMat
      ));
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.72, 1.42], [0.72, 2.36], [2.25, 2.04], [2.25, 2.52], 0.14, 0.06, 0.01),
        bodyMat
      ));
      const fin = new THREE.Mesh(buildVerticalFin(side), finMat);
      fin.position.set(side * 0.66, 0.20, 1.72);
      hullGroup.add(fin);
    }
  } else if (shipId === 'sakura') {
    // Sleek rose-pink interceptor with swept wings, twin tails & compact wingtip winglets
    wingtipPoint = [4.15, 0.05, 0.90];
    canopyPos = [0, 0.24, -1.68];
    nozzleX = 0.42;
    nozzleZ = 2.60;
    for (const side of [-1, 1]) {
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.84, -1.18], [0.84, 1.16], [4.15, 0.34], [4.15, 0.92], 0.23, 0.07, 0.03),
        bodyMat
      ));
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.72, 1.38], [0.72, 2.30], [2.32, 1.94], [2.32, 2.46], 0.14, 0.06, 0.01),
        bodyMat
      ));
      const fin = new THREE.Mesh(buildVerticalFin(side), finMat);
      fin.position.set(side * 0.68, 0.20, 1.66);
      hullGroup.add(fin);

      const winglet = new THREE.Mesh(buildVerticalFin(side), finMat);
      winglet.scale.set(0.7, 0.42, 0.48);
      winglet.position.set(side * 4.05, 0.03, 0.64);
      hullGroup.add(winglet);
    }
  } else {
    // Default 'striker' (F-22 Striker)
    for (const side of [-1, 1]) {
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.85, -1.25], [0.85, 1.08], [3.95, 0.56], [3.95, 0.98], 0.24, 0.07, 0.03),
        bodyMat
      ));
      hullGroup.add(new THREE.Mesh(
        buildAirfoilSurface(side, [0.72, 1.38], [0.72, 2.28], [2.22, 1.98], [2.22, 2.46], 0.14, 0.06, 0.01),
        bodyMat
      ));
      const fin = new THREE.Mesh(buildVerticalFin(side), finMat);
      fin.position.set(side * 0.64, 0.20, 1.66);
      hullGroup.add(fin);
    }
  }

  // Twin tapered engine exhaust nozzles
  for (const side of [-1, 1]) {
    const nozGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.58, 7);
    nozGeo.rotateX(Math.PI / 2);
    const noz = new THREE.Mesh(nozGeo, nozzleMat);
    noz.position.set(side * nozzleX, 0.0, nozzleZ);
    hullGroup.add(noz);
  }

  // Sculpted teardrop bubble canopy
  const canopyGeo = new THREE.SphereGeometry(1.0, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.scale.set(0.32, 0.30, 1.05);
  canopy.position.set(canopyPos[0], canopyPos[1], canopyPos[2]);
  hullGroup.add(canopy);

  // Twin animated afterburner flames
  const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff8026 });
  const flameInnerMat = new THREE.MeshBasicMaterial({ color: 0xfff6a0 });
  const outerConeGeo = new THREE.ConeGeometry(0.23, 2.25, 6);
  outerConeGeo.rotateX(Math.PI / 2);
  outerConeGeo.translate(0, 0, 1.12);

  const innerConeGeo = new THREE.ConeGeometry(0.13, 1.45, 6);
  innerConeGeo.rotateX(Math.PI / 2);
  innerConeGeo.translate(0, 0, 0.72);

  const flameL = new THREE.Group();
  flameL.position.set(-nozzleX, 0.0, nozzleZ + 0.22);
  flameL.add(new THREE.Mesh(outerConeGeo, flameOuterMat), new THREE.Mesh(innerConeGeo, flameInnerMat));
  visual.add(flameL);

  const flameR = new THREE.Group();
  flameR.position.set(nozzleX, 0.0, nozzleZ + 0.22);
  flameR.add(new THREE.Mesh(outerConeGeo, flameOuterMat), new THREE.Mesh(innerConeGeo, flameInnerMat));
  visual.add(flameR);

  // Cannon muzzle flash at starboard wing-root gun port
  const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xfff49e });
  const muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), muzzleMat);
  muzzleFlash.position.set(0.75, 0.0, -1.55);
  muzzleFlash.visible = false;
  visual.add(muzzleFlash);

  return { group, visual, hullGroup, flameL, flameR, muzzleFlash, wingtipPoint, nozzleX, nozzleZ, spec };
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
    const rig = buildJetVisualRig(this.shipId);
    this.group = rig.group;
    this.visual = rig.visual;
    this.hullGroup = rig.hullGroup;
    this.flameL = rig.flameL;
    this.flameR = rig.flameR;
    this.muzzleFlash = rig.muzzleFlash;
    this.wingtipPoint = rig.wingtipPoint;
    this.nozzleX = rig.nozzleX;
    this.nozzleZ = rig.nozzleZ;
    scene.add(this.group);

    this.visual.scale.setScalar(0.74);

    this.leftTrail = new RibbonTrail(scene, 84, 0.14, 0xffffff);
    this.rightTrail = new RibbonTrail(scene, 84, 0.14, 0xffffff);
    this.trailTimer = 0;

    this.puffs = [];
    this.puffGeo = new THREE.IcosahedronGeometry(1.0, 1);
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
    const rig = buildJetVisualRig(id);
    this.group = rig.group;
    this.visual = rig.visual;
    this.hullGroup = rig.hullGroup;
    this.flameL = rig.flameL;
    this.flameR = rig.flameR;
    this.muzzleFlash = rig.muzzleFlash;
    this.wingtipPoint = rig.wingtipPoint;
    this.nozzleX = rig.nozzleX;
    this.nozzleZ = rig.nozzleZ;

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
    this.alive = true;
    this.respawnTimer = 0;
    this.spawnProtection = 2.0;
    this.damageTrailTimer = 0;
    this.damageCooldown = 0;
    const fwd = this.getForwardDirection();
    this.velocity.copy(fwd).multiplyScalar(this.speed);
    this.leftTrail.clear();
    this.rightTrail.clear();
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

  getWorldPoint(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.visual.matrixWorld);
  }

  getForwardDirection() {
    const fwd = new THREE.Vector3(0, 0, -1);
    fwd.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return fwd.normalize();
  }

  spawnExhaustPuffs() {
    const nx = this.nozzleX || 0.40;
    const nz = (this.nozzleZ || 2.60) + 0.85;
    for (const sx of [-nx, nx]) {
      const origin = this.getWorldPoint(sx, 0.0, nz);
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

  spawnDamageFirePuffs(dmgRatio) {
    if (this.puffs.length >= 180) return;
    const count = dmgRatio > 0.72 ? 3 : dmgRatio > 0.42 ? 2 : 1;
    const backDir = this.getForwardDirection().multiplyScalar(-9.5);
    for (let i = 0; i < count; i++) {
      if (this.puffs.length >= 180) break;
      const ox = (Math.random() - 0.5) * (1.2 + dmgRatio * 1.4);
      const oy = (Math.random() - 0.3) * 0.45;
      const oz = 1.2 + Math.random() * 1.8;
      const origin = this.getWorldPoint(ox, oy, oz);
      const mat = createDitherPuffMaterial();
      const mesh = new THREE.Mesh(this.puffGeo, mat);
      mesh.position.copy(origin);
      const initSize = (0.42 + dmgRatio * 0.65) * (0.8 + Math.random() * 0.45);
      mesh.scale.setScalar(initSize);
      this.scene.add(mesh);

      this.puffs.push({
        mesh,
        mat,
        isDamageFire: true,
        dmg: dmgRatio,
        vel: backDir.clone().add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 4.5,
            3.0 + Math.random() * 5.0,
            (Math.random() - 0.5) * 4.5
          )
        ),
        age: 0,
        maxAge: 0.65 + dmgRatio * 0.65,
        initSize,
        ab: false,
      });
    }
  }

  updatePuffs(dt) {
    const colYellow = new THREE.Color(0xffef7a);
    const colOrange = new THREE.Color(0xf28836);
    const colSmoke = new THREE.Color(0xb6b0c8);
    const colFireHot = new THREE.Color(0xfff066);
    const colFireWarm = new THREE.Color(0xff962e);
    const colFireRed = new THREE.Color(0xf2461c);
    const colSootDark = new THREE.Color(0x2d2834);
    const colSootMid = new THREE.Color(0x4a4456);

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

      if (p.isDamageFire) {
        const scale = p.initSize * (1.0 + t * (2.6 + p.dmg * 2.2));
        p.mesh.scale.setScalar(scale);

        if (t < 0.24) {
          p.mat.uniforms.uColor.value.copy(p.dmg > 0.5 ? colFireHot : colFireWarm);
          p.mat.uniforms.uAlpha.value = 1.0;
        } else if (t < 0.52) {
          p.mat.uniforms.uColor.value.copy(colFireRed);
          p.mat.uniforms.uAlpha.value = 1.0 - (t - 0.24) * 0.45;
        } else {
          const sootT = (t - 0.52) / 0.48;
          p.mat.uniforms.uColor.value.copy(colSootDark).lerp(colSootMid, sootT);
          p.mat.uniforms.uAlpha.value = Math.max(0, 1.0 - sootT) * (0.65 + p.dmg * 0.3);
        }
        continue;
      }

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
    const sens = input.sensitivity ?? 1.0;
    const ySign = input.invertY ? -1 : 1;
    const joyYSign = input.gamepadInvertY ? -1 : 1;
    let steerX;
    let steerY;
    if (input.gamepadActive) {
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

    const abKey = input.afterburnerKey || 'ShiftLeft';
    this.afterburner = Boolean(
      input.boost || input.joyBoost || keys[abKey] || (abKey === 'ShiftLeft' && keys.ShiftRight)
    );

    const targetThrottle = this.afterburner ? 1.0 : 0.64;
    this.throttle = THREE.MathUtils.lerp(this.throttle, targetThrottle, 1 - Math.exp(-5.0 * dt));

    const targetBank = -steerX * this.stats.bankMax;
    const targetPitch = THREE.MathUtils.clamp(-steerY * 0.68, -0.62, 0.62);

    this.bank = THREE.MathUtils.lerp(this.bank, targetBank, 1 - Math.exp(-6.5 * dt));
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, 1 - Math.exp(-5.2 * dt));

    const turnSpeed = this.afterburner ? this.stats.abTurnRate : this.stats.turnRate;
    this.yaw += Math.sin(this.bank) * turnSpeed * dt;

    const climbDrag = -Math.sin(this.pitch) * 14.0;
    const targetSpeed = (this.afterburner ? this.stats.abSpeed : this.stats.cruiseSpeed) + climbDrag;
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
      const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.bank + extraRoll, 'YXZ'))
      );
      const [wx, wy, wz] = this.wingtipPoint;
      const tipL = this.getWorldPoint(-wx, wy, wz);
      const tipR = this.getWorldPoint(wx, wy, wz);
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
 * squadron accent colors, wingtip contrails, and dithered exhaust puffs.
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

    const rig = buildJetVisualRig(this.shipId, colorHex);
    this.group = rig.group;
    this.visual = rig.visual;
    this.hullGroup = rig.hullGroup;
    this.flameL = rig.flameL;
    this.flameR = rig.flameR;
    this.muzzleFlash = rig.muzzleFlash;
    this.wingtipPoint = rig.wingtipPoint;
    this.nozzleX = rig.nozzleX;
    this.nozzleZ = rig.nozzleZ;

    this.hullGroup.traverse((obj) => {
      if (obj.isMesh) obj.layers.enable(1);
    });

    this.visual.scale.setScalar(0.74);
    scene.add(this.group);

    this.leftTrail = new RibbonTrail(scene, 72, 0.14, 0xffffff);
    this.rightTrail = new RibbonTrail(scene, 72, 0.14, 0xffffff);
    this.trailTimer = 0;

    this.puffs = [];
    this.puffGeo = new THREE.IcosahedronGeometry(1.0, 1);
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

    const rig = buildJetVisualRig(id, this.colorHex);
    this.group = rig.group;
    this.visual = rig.visual;
    this.hullGroup = rig.hullGroup;
    this.flameL = rig.flameL;
    this.flameR = rig.flameR;
    this.muzzleFlash = rig.muzzleFlash;
    this.wingtipPoint = rig.wingtipPoint;
    this.nozzleX = rig.nozzleX;
    this.nozzleZ = rig.nozzleZ;

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

  getWorldPoint(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.visual.matrixWorld);
  }

  spawnExhaustPuffs() {
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const nx = this.nozzleX || 0.40;
    const nz = (this.nozzleZ || 2.60) + 0.85;
    for (const sx of [-nx, nx]) {
      const origin = this.getWorldPoint(sx, 0.0, nz);
      const mat = createDitherPuffMaterial();
      const mesh = new THREE.Mesh(this.puffGeo, mat);
      mesh.position.copy(origin);
      const initSize = this.afterburner ? 0.50 : 0.32;
      mesh.scale.setScalar(initSize);
      this.scene.add(mesh);

      this.puffs.push({
        mesh,
        mat,
        vel: fwd.clone().multiplyScalar(-12).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3.0,
            (Math.random() - 0.5) * 3.0,
            (Math.random() - 0.5) * 3.0
          )
        ),
        age: 0,
        maxAge: this.afterburner ? 0.72 : 0.44,
        initSize,
        ab: this.afterburner,
      });
    }
  }

  spawnDamageFirePuffs(dmgRatio) {
    if (this.puffs.length >= 160) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const count = dmgRatio > 0.72 ? 3 : dmgRatio > 0.42 ? 2 : 1;
    const backDir = fwd.multiplyScalar(-9.5);
    for (let i = 0; i < count; i++) {
      if (this.puffs.length >= 160) break;
      const ox = (Math.random() - 0.5) * (1.2 + dmgRatio * 1.4);
      const oy = (Math.random() - 0.3) * 0.45;
      const oz = 1.2 + Math.random() * 1.8;
      const origin = this.getWorldPoint(ox, oy, oz);
      const mat = createDitherPuffMaterial();
      const mesh = new THREE.Mesh(this.puffGeo, mat);
      mesh.position.copy(origin);
      const initSize = (0.40 + dmgRatio * 0.62) * (0.8 + Math.random() * 0.45);
      mesh.scale.setScalar(initSize);
      this.scene.add(mesh);

      this.puffs.push({
        mesh,
        mat,
        isDamageFire: true,
        dmg: dmgRatio,
        vel: backDir.clone().add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 4.5,
            3.0 + Math.random() * 5.0,
            (Math.random() - 0.5) * 4.5
          )
        ),
        age: 0,
        maxAge: 0.62 + dmgRatio * 0.60,
        initSize,
        ab: false,
      });
    }
  }

  updatePuffs(dt) {
    const colYellow = new THREE.Color(0xffef7a);
    const colOrange = new THREE.Color(0xf28836);
    const colSmoke = new THREE.Color(0xb6b0c8);
    const colFireHot = new THREE.Color(0xfff066);
    const colFireWarm = new THREE.Color(0xff962e);
    const colFireRed = new THREE.Color(0xf2461c);
    const colSootDark = new THREE.Color(0x2d2834);
    const colSootMid = new THREE.Color(0x4a4456);

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

      if (p.isDamageFire) {
        p.mesh.scale.setScalar(p.initSize * (1.0 + t * (2.6 + p.dmg * 2.2)));
        if (t < 0.24) {
          p.mat.uniforms.uColor.value.copy(p.dmg > 0.5 ? colFireHot : colFireWarm);
          p.mat.uniforms.uAlpha.value = 1.0;
        } else if (t < 0.52) {
          p.mat.uniforms.uColor.value.copy(colFireRed);
          p.mat.uniforms.uAlpha.value = 1.0 - (t - 0.24) * 0.45;
        } else {
          const sootT = (t - 0.52) / 0.48;
          p.mat.uniforms.uColor.value.copy(colSootDark).lerp(colSootMid, sootT);
          p.mat.uniforms.uAlpha.value = Math.max(0, 1.0 - sootT) * (0.65 + p.dmg * 0.3);
        }
        continue;
      }

      p.mesh.scale.setScalar(p.initSize * (1.0 + t * (p.ab ? 3.5 : 2.2)));

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
        const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.bank + this.rollExtra, 'YXZ'))
        );
        const [wx, wy, wz] = this.wingtipPoint;
        const tipL = this.getWorldPoint(-wx, wy, wz);
        const tipR = this.getWorldPoint(wx, wy, wz);
        this.leftTrail.push(tipL, rightVec);
        this.rightTrail.push(tipR, rightVec);
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
    for (const p of this.puffs) {
      this.scene.remove(p.mesh);
      p.mat.dispose();
    }
    this.puffs.length = 0;
    this.puffGeo.dispose();
  }
}

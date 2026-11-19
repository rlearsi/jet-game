import * as THREE from 'three';

export const WORLD_SIZE = 2800;
export const WATER_LEVEL = 0.0;
export const SUN_DIR = new THREE.Vector3(-0.62, 0.34, -0.71).normalize();

export const TERRAIN_THEMES = ['sunset', 'tropical', 'volcanic', 'alpine'];
export const TERRAIN_DEFORM_MODES = ['normal', 'deep', 'off'];
export const TERRAIN_CLOUD_MODES = ['full', 'light', 'clear'];
export const DEFAULT_TERRAIN_OPTIONS = {
  theme: 'sunset',
  deformMode: 'normal',
  clouds: 'full',
};

// Live deformable terrain grid state (shared so flight collision, missiles, radar & water stay in sync!)
const TERRAIN_SEGS = 280;
const TERRAIN_STRIDE = TERRAIN_SEGS + 1;
const CELL_SIZE = WORLD_SIZE / TERRAIN_SEGS;
let liveHeights = null;
let baseHeights = null;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function noise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x, z, octaves = 4) {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise2D(x * freq, z * freq);
    freq *= 2.04;
    amp *= 0.5;
  }
  return val;
}

function ridgeNoise(x, z) {
  return 1.0 - Math.abs(noise2D(x, z) * 2.0 - 1.0);
}

/**
 * Procedural base heightmap before player craters / mountain excavations.
 */
export function getBaseTerrainHeight(x, z) {
  const nLarge = fbm(x * 0.0017 + 3.1, z * 0.0017 - 1.7, 4);
  const nMed = fbm(x * 0.0052 - 5.2, z * 0.0052 + 4.3, 3);
  const nDetail = fbm(x * 0.015 + 1.4, z * 0.015 + 2.8, 2);
  const ridge = ridgeNoise(x * 0.0048 + 2.0, z * 0.0048 - 1.2);

  // Scenic interconnected turquoise bays
  const bay1 = Math.exp(-((x + 25) * (x + 25) + (z - 15) * (z - 15)) / (310 * 310));
  const bay2 = Math.exp(-((x - 270) * (x - 270) + (z - 220) * (z - 220)) / (245 * 245));
  const bay3 = Math.exp(-((x + 360) * (x + 360) + (z + 80) * (z + 80)) / (220 * 220));
  const bay4 = Math.exp(-((x - 80) * (x - 80) + (z + 420) * (z + 420)) / (230 * 230));

  let base = (nLarge * 0.72 + nMed * 0.28 - 0.45) * 105.0;
  base -= bay1 * 54.0 + bay2 * 40.0 + bay3 * 36.0 + bay4 * 38.0;

  // Dramatic mountain ranges, volcanic peaks, mesas & scenic island chains
  const mountains = [
    // --- Central Autumn & Emerald Headlands ---
    { x: -310, z: -155, r: 210, h: 68, p: 1.45, ridged: true },
    { x: -145, z: -310, r: 195, h: 64, p: 1.5, ridged: true },
    { x: 245, z: -185, r: 215, h: 74, p: 1.4, ridged: false },
    { x: 45, z: 330, r: 235, h: 52, p: 1.45, ridged: false },
    { x: -245, z: 245, r: 190, h: 48, p: 1.5, ridged: false },

    // --- Massive Eastern & Northeastern Snow-Capped Alpine Range ---
    { x: 540, z: -360, r: 290, h: 198, p: 1.45, ridged: true },
    { x: 640, z: -120, r: 285, h: 225, p: 1.5, ridged: true },
    { x: 590, z: 140, r: 260, h: 184, p: 1.45, ridged: true },
    { x: 470, z: 380, r: 250, h: 158, p: 1.5, ridged: true },
    { x: 350, z: -540, r: 270, h: 190, p: 1.5, ridged: true },
    { x: 760, z: -260, r: 270, h: 212, p: 1.55, ridged: true },

    // --- Northern Fjord Peaks ---
    { x: 40, z: -690, r: 265, h: 162, p: 1.5, ridged: true },
    { x: -290, z: -660, r: 250, h: 148, p: 1.45, ridged: true },
    { x: -560, z: -510, r: 255, h: 135, p: 1.45, ridged: true },

    // --- Northwestern Volcanic Caldera & Basalt Spires ---
    { x: -720, z: -280, r: 255, h: 185, p: 1.35, volcano: true },
    { x: -840, z: -50, r: 215, h: 128, p: 1.55, ridged: true },
    { x: -640, z: 110, r: 195, h: 102, p: 1.5, ridged: true },

    // --- Southwestern Terracotta Canyon Mesas (stepped plateaus!) ---
    { x: -580, z: 480, r: 255, h: 105, p: 1.25, mesa: true },
    { x: -340, z: 640, r: 235, h: 96, p: 1.25, mesa: true },
    { x: -760, z: 680, r: 240, h: 118, p: 1.25, mesa: true },

    // --- Southern Mountain Islands ---
    { x: 120, z: 710, r: 265, h: 146, p: 1.5, ridged: true },
    { x: 430, z: 690, r: 245, h: 132, p: 1.5, ridged: true },

    // --- Scenic Bay Islets & Sea Stacks ---
    { x: -72, z: 52, r: 52, h: 22, p: 1.75, ridged: false },
    { x: 118, z: -38, r: 58, h: 26, p: 1.65, ridged: true },
    { x: 145, z: 140, r: 44, h: 34, p: 1.9, ridged: true },
    { x: -160, z: -45, r: 36, h: 28, p: 2.0, ridged: true },
  ];

  for (const m of mountains) {
    const dx = x - m.x;
    const dz = z - m.z;
    const d = Math.sqrt(dx * dx + dz * dz) / m.r;
    if (d < 1.0) {
      let falloff = Math.pow(1.0 - d * d, m.p);
      if (m.volcano) {
        // Carve dramatic crater into volcano summit
        const crater = d < 0.22 ? Math.pow(1.0 - d / 0.22, 1.5) * 0.42 : 0;
        base += (falloff - crater) * m.h * (0.82 + 0.34 * nMed);
      } else if (m.mesa) {
        // Stepped flat-topped terracotta canyon plateaus
        const raw = falloff * m.h;
        const stepped = Math.floor(raw / 24.0) * 24.0 + Math.min(1.0, (raw % 24.0) / 7.0) * 24.0;
        base += THREE.MathUtils.lerp(raw, stepped, 0.72);
      } else if (m.ridged) {
        base += falloff * m.h * (0.68 + 0.56 * ridge);
      } else {
        base += falloff * m.h * (0.75 + 0.45 * nMed);
      }
    }
  }

  // Detail crags & rolling dunes
  if (base > 0) {
    base += (nDetail - 0.5) * 12.0 * Math.min(1, base / 20.0);
  }

  // Flat coastal island airstrip terrace near (-215, 225)
  const airDx = (x + 215) / 48;
  const airDz = (z - 225) / 96;
  const airD = Math.max(Math.abs(airDx), Math.abs(airDz));
  if (airD < 1.35) {
    const t = 1.0 - THREE.MathUtils.smoothstep(airD, 0.75, 1.35);
    base = THREE.MathUtils.lerp(base, 8.5, t);
  }

  // Smooth ocean drop-off near world boundaries
  const edgeDist = Math.max(Math.abs(x), Math.abs(z)) / (WORLD_SIZE * 0.5);
  if (edgeDist > 0.84) {
    const t = Math.min(1, (edgeDist - 0.84) / 0.16);
    base = THREE.MathUtils.lerp(base, -22.0, t * t);
  }

  return base;
}

/**
 * Live terrain elevation at (x, z) with bilinear interpolation over the deformable height grid.
 * Reflects all holes, trenches, and craters blasted into mountains in real time!
 */
export function getTerrainHeight(x, z) {
  if (!liveHeights) return getBaseTerrainHeight(x, z);
  const gx = ((x / WORLD_SIZE) + 0.5) * TERRAIN_SEGS;
  const gz = ((z / WORLD_SIZE) + 0.5) * TERRAIN_SEGS;
  if (gx < 0 || gx >= TERRAIN_SEGS || gz < 0 || gz >= TERRAIN_SEGS) {
    return getBaseTerrainHeight(x, z);
  }
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const row0 = iz * TERRAIN_STRIDE;
  const row1 = row0 + TERRAIN_STRIDE;
  const h00 = liveHeights[row0 + ix];
  const h10 = liveHeights[row0 + ix + 1];
  const h01 = liveHeights[row1 + ix];
  const h11 = liveHeights[row1 + ix + 1];
  const top = h00 + (h10 - h00) * fx;
  const bot = h01 + (h11 - h01) * fx;
  return top + (bot - top) * fz;
}

function buildHeightTexture() {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let iz = 0; iz < size; iz++) {
    const z = ((iz / (size - 1)) - 0.5) * WORLD_SIZE;
    for (let ix = 0; ix < size; ix++) {
      const x = ((ix / (size - 1)) - 0.5) * WORLD_SIZE;
      const h = getTerrainHeight(x, z);
      const norm = THREE.MathUtils.clamp((h + 50.0) / 300.0, 0.0, 1.0);
      const v = Math.round(norm * 255);
      const idx = (iz * size + ix) * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, data, size };
}

export function buildWorld(scene) {
  const rand = mulberry32(90210);
  const terrainOptions = { ...DEFAULT_TERRAIN_OPTIONS };
  let deformScale = 1.0;

  // Initialize live deformable heightmap arrays first so buildHeightTexture & objects align cleanly
  liveHeights = new Float32Array(TERRAIN_STRIDE * TERRAIN_STRIDE);
  baseHeights = new Float32Array(TERRAIN_STRIDE * TERRAIN_STRIDE);
  const scorchData = new Float32Array(TERRAIN_STRIDE * TERRAIN_STRIDE);
  for (let iz = 0; iz <= TERRAIN_SEGS; iz++) {
    const z = ((iz / TERRAIN_SEGS) - 0.5) * WORLD_SIZE;
    for (let ix = 0; ix <= TERRAIN_SEGS; ix++) {
      const x = ((ix / TERRAIN_SEGS) - 0.5) * WORLD_SIZE;
      const h = getBaseTerrainHeight(x, z);
      const idx = iz * TERRAIN_STRIDE + ix;
      liveHeights[idx] = h;
      baseHeights[idx] = h;
    }
  }

  const heightTexObj = buildHeightTexture();
  const heightTex = heightTexObj.tex;

  const MAX_CLOUDS = 24;
  const cloudShadowUniforms = [];
  for (let i = 0; i < MAX_CLOUDS; i++) {
    cloudShadowUniforms.push(new THREE.Vector4(9999, 9999, 1, 0));
  }

  const MAX_RIPPLES = 10;
  const rippleUniforms = [];
  for (let i = 0; i < MAX_RIPPLES; i++) {
    rippleUniforms.push(new THREE.Vector4(0, 0, -999, 0));
  }
  let nextRippleIdx = 0;

  // =========================================================================
  // 1. SUNSET SKY DOME (lavender -> peach -> apricot -> cream + dramatic cirrus streaks)
  // =========================================================================
  const skyGeo = new THREE.SphereGeometry(2600, 36, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uTime: { value: 0 },
      uTerrainTheme: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform float uTerrainTheme;
      varying vec3 vDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm2(vec2 p) {
        float v = 0.0;
        v += 0.55 * noise(p);
        v += 0.30 * noise(p * 2.1 + vec2(2.3, 1.7));
        v += 0.15 * noise(p * 4.3 - vec2(1.1, 3.4));
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);

        vec3 cCream   = vec3(0.96, 0.89, 0.74);
        vec3 cApricot = vec3(0.97, 0.75, 0.57);
        vec3 cPeach   = vec3(0.93, 0.63, 0.58);
        vec3 cMauve   = vec3(0.74, 0.58, 0.69);
        vec3 cZenith  = vec3(0.56, 0.48, 0.68);
        if (uTerrainTheme > 0.5 && uTerrainTheme < 1.5) {
          cCream   = vec3(0.99, 0.94, 0.78);
          cApricot = vec3(0.99, 0.82, 0.52);
          cPeach   = vec3(0.58, 0.85, 0.84);
          cMauve   = vec3(0.32, 0.70, 0.86);
          cZenith  = vec3(0.18, 0.50, 0.78);
        } else if (uTerrainTheme >= 1.5 && uTerrainTheme < 2.5) {
          cCream   = vec3(0.96, 0.52, 0.24);
          cApricot = vec3(0.84, 0.31, 0.20);
          cPeach   = vec3(0.58, 0.21, 0.26);
          cMauve   = vec3(0.34, 0.16, 0.28);
          cZenith  = vec3(0.16, 0.11, 0.22);
        } else if (uTerrainTheme >= 2.5) {
          cCream   = vec3(0.95, 0.88, 0.92);
          cApricot = vec3(0.88, 0.74, 0.84);
          cPeach   = vec3(0.66, 0.68, 0.84);
          cMauve   = vec3(0.44, 0.54, 0.78);
          cZenith  = vec3(0.26, 0.38, 0.64);
        }

        vec3 col = mix(cCream, cApricot, smoothstep(0.0, 0.10, h));
        col = mix(col, cPeach, smoothstep(0.08, 0.28, h));
        col = mix(col, cMauve, smoothstep(0.26, 0.52, h));
        col = mix(col, cZenith, smoothstep(0.48, 0.86, h));

        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        vec3 sunGlowCol = uTerrainTheme >= 1.5 && uTerrainTheme < 2.5
          ? vec3(1.0, 0.55, 0.22)
          : vec3(1.0, 0.88, 0.64);
        col += sunGlowCol * pow(sunDot, 7.0) * 0.32;
        col = mix(col, vec3(1.0, 0.97, 0.86), smoothstep(0.992, 0.996, sunDot));

        if (d.y > 0.015) {
          vec2 proj = d.xz / (d.y + 0.18);
          float ca = 0.55, sa = 0.835;
          vec2 rot = vec2(proj.x * ca - proj.y * sa, proj.x * sa + proj.y * ca);
          vec2 streakUv = vec2(rot.x * 0.42 + uTime * 0.004, rot.y * 2.35);

          float n1 = fbm2(streakUv);
          float n2 = fbm2(streakUv * 1.9 + vec2(4.2, -1.5));
          float bandMask = smoothstep(0.47, 0.58, n1 * 0.72 + n2 * 0.28);
          float fade = smoothstep(0.02, 0.13, d.y) * (1.0 - smoothstep(0.68, 0.95, d.y));

          float highlight = smoothstep(0.53, 0.68, n1 + sunDot * 0.18);
          vec3 streakLow = vec3(0.78, 0.56, 0.66);
          vec3 streakHigh = vec3(0.99, 0.79, 0.64);
          vec3 streakBright = vec3(1.0, 0.90, 0.74);
          if (uTerrainTheme > 0.5 && uTerrainTheme < 1.5) {
            streakLow = vec3(0.76, 0.86, 0.92);
            streakHigh = vec3(1.0, 0.94, 0.78);
            streakBright = vec3(1.0, 0.97, 0.86);
          } else if (uTerrainTheme >= 1.5 && uTerrainTheme < 2.5) {
            streakLow = vec3(0.42, 0.20, 0.26);
            streakHigh = vec3(0.92, 0.44, 0.24);
            streakBright = vec3(1.0, 0.68, 0.36);
          } else if (uTerrainTheme >= 2.5) {
            streakLow = vec3(0.64, 0.68, 0.82);
            streakHigh = vec3(0.96, 0.84, 0.88);
            streakBright = vec3(0.99, 0.94, 0.97);
          }
          vec3 streakShade = mix(streakLow, streakHigh, highlight);
          vec3 streakCol = mix(streakShade, streakBright, smoothstep(0.62, 0.78, n1) * 0.65);

          col = mix(col, streakCol, bandMask * fade * 0.86);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // =========================================================================
  // 2. DEFORMABLE MULTI-BIOME TERRAIN SHADER
  //    (Supports blasting real craters & holes through mountains with scorched rock!)
  // =========================================================================
  const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setY(i, liveHeights[i]);
  }
  const scorchAttr = new THREE.BufferAttribute(scorchData, 1);
  terrainGeo.setAttribute('aScorch', scorchAttr);
  terrainGeo.computeVertexNormals();
  const normAttr = terrainGeo.attributes.normal;

  const terrainMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uCamPos: { value: new THREE.Vector3() },
      uClouds: { value: cloudShadowUniforms },
      uTime: { value: 0 },
      uTerrainGrain: { value: 0.35 },
      uTerrainTheme: { value: 0.0 },
    },
    vertexShader: `
      attribute float aScorch;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vScorch;
      void main() {
        vScorch = aScorch;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uCamPos;
      uniform vec4 uClouds[${MAX_CLOUDS}];
      uniform float uTime;
      uniform float uTerrainGrain;
      uniform float uTerrainTheme;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vScorch;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0;
        v += 0.50 * noise(p);
        v += 0.25 * noise(p * 2.07 + vec2(3.1, 1.7));
        v += 0.15 * noise(p * 4.13 - vec2(2.4, 5.2));
        return v;
      }

      void main() {
        vec2 p = vWorldPos.xz;
        float h = vWorldPos.y;
        vec3 N = normalize(vNormal);
        float slope = 1.0 - clamp(N.y, 0.0, 1.0);

        // Crisp world-space pixel stippling (controlled by uTerrainGrain so HD/Anime styles look clean!)
        vec2 pixCell = floor(p * 0.72);
        float rawStipple = hash(pixCell);
        float smoothCluster = noise(p * 0.14);
        float fineCluster = mix(smoothCluster, noise(floor(p * 0.30) * 0.55), uTerrainGrain);
        float stipple = mix(smoothCluster, rawStipple, uTerrainGrain);

        // Regional biome weights
        float biomeA = fbm(p * 0.0085 + vec2(2.1, -4.3));
        float biomeB = fbm(p * 0.013 - vec2(6.4, 1.9));
        float forestPatch = fbm(p * 0.018 + vec2(0.5, 3.7));

        // Regional masks: SW Terracotta Canyon & NW Volcanic Caldera
        float canyonMask = smoothstep(-140.0, -390.0, p.x) * smoothstep(200.0, 440.0, p.y);
        float volcanoMask = smoothstep(-320.0, -560.0, p.x) * smoothstep(100.0, -160.0, p.y);

        // Palette matched to sunset screenshots + expanded biome harmony
        vec3 colSandLight   = vec3(0.90, 0.86, 0.58);
        vec3 colSandShade   = vec3(0.79, 0.75, 0.49);
        vec3 colGoldLeaf    = vec3(0.92, 0.72, 0.24);
        vec3 colOrangeLeaf  = vec3(0.88, 0.44, 0.17);
        vec3 colRedLeaf     = vec3(0.78, 0.21, 0.16);
        vec3 colDeepRed     = vec3(0.56, 0.15, 0.15);
        vec3 colGreenLight  = vec3(0.32, 0.62, 0.32);
        vec3 colGreenDark   = vec3(0.18, 0.43, 0.24);
        vec3 colMeadow      = vec3(0.64, 0.74, 0.36);
        vec3 colFlower      = vec3(0.95, 0.76, 0.82);
        vec3 colRockLight   = vec3(0.74, 0.70, 0.68);
        vec3 colRockDark    = vec3(0.44, 0.40, 0.50);
        vec3 colSnow        = vec3(0.96, 0.94, 0.96);

        // Terracotta canyon bands
        vec3 colCanyonSand  = vec3(0.88, 0.65, 0.43);
        vec3 colCanyonRed   = vec3(0.74, 0.34, 0.24);
        vec3 colCanyonOchre = vec3(0.84, 0.50, 0.28);

        // Volcanic basalt & magma glow
        vec3 colBasalt      = vec3(0.30, 0.26, 0.36);
        vec3 colAsh         = vec3(0.46, 0.42, 0.50);
        vec3 colLava        = vec3(1.00, 0.46, 0.14);

        if (uTerrainTheme > 0.5 && uTerrainTheme < 1.5) {
          colSandLight  = vec3(0.96, 0.91, 0.68);
          colSandShade  = vec3(0.86, 0.80, 0.56);
          colGreenLight = vec3(0.24, 0.74, 0.38);
          colGreenDark  = vec3(0.12, 0.50, 0.26);
          colMeadow     = vec3(0.54, 0.82, 0.34);
          colGoldLeaf   = vec3(0.94, 0.80, 0.26);
        } else if (uTerrainTheme >= 1.5 && uTerrainTheme < 2.5) {
          colSandLight  = vec3(0.42, 0.34, 0.36);
          colSandShade  = vec3(0.28, 0.22, 0.26);
          colGreenLight = vec3(0.44, 0.32, 0.22);
          colGreenDark  = vec3(0.28, 0.20, 0.18);
          colMeadow     = vec3(0.50, 0.34, 0.22);
          colGoldLeaf   = vec3(0.76, 0.42, 0.16);
          colOrangeLeaf = vec3(0.78, 0.30, 0.14);
          colRedLeaf    = vec3(0.64, 0.18, 0.14);
          colRockLight  = vec3(0.52, 0.42, 0.44);
          colRockDark   = vec3(0.26, 0.20, 0.28);
        } else if (uTerrainTheme >= 2.5) {
          colSandLight  = vec3(0.72, 0.75, 0.78);
          colSandShade  = vec3(0.56, 0.60, 0.66);
          colGreenLight = vec3(0.24, 0.50, 0.38);
          colGreenDark  = vec3(0.14, 0.34, 0.28);
          colMeadow     = vec3(0.46, 0.62, 0.48);
          colRockLight  = vec3(0.70, 0.74, 0.80);
          colRockDark   = vec3(0.38, 0.44, 0.56);
          colSnow       = vec3(0.96, 0.98, 1.00);
        }

        // 1. Coastal sandy beaches & dunes
        vec3 baseCol = mix(colSandShade, colSandLight, step(0.42, stipple * 0.6 + fineCluster * 0.4));

        // 2. Forests & Wildflower Meadows above beach shelf
        float treeMask = smoothstep(4.0, 10.5, h + (forestPatch - 0.5) * 9.0) * (1.0 - smoothstep(68.0, 92.0, h));
        if (treeMask > 0.05) {
          vec3 foliage;
          if (biomeA > 0.63) {
            // Emerald pine forests
            foliage = mix(colGreenDark, colGreenLight, step(0.46, stipple * 0.55 + fineCluster * 0.45));
            if (biomeB > 0.66 && stipple > 0.75) foliage = colGoldLeaf;
          } else if (biomeA > 0.49 && biomeB < 0.44) {
            // Sunlit wildflower meadows & golden savanna
            foliage = mix(colMeadow, colGoldLeaf, step(0.62, fineCluster));
            if (stipple > 0.89) foliage = colFlower;
          } else if (biomeB > 0.48) {
            // Crimson & tangerine autumn woods
            float rMix = stipple * 0.6 + fineCluster * 0.4;
            if (rMix < 0.28) foliage = colDeepRed;
            else if (rMix < 0.62) foliage = colRedLeaf;
            else if (rMix < 0.85) foliage = colOrangeLeaf;
            else foliage = colGoldLeaf;
          } else {
            // Golden-amber groves
            float gMix = stipple * 0.6 + fineCluster * 0.4;
            if (gMix < 0.34) foliage = colOrangeLeaf;
            else if (gMix < 0.78) foliage = colGoldLeaf;
            else foliage = colRedLeaf;
          }
          float ditherCut = step(1.0 - treeMask, stipple * 0.7 + 0.15);
          baseCol = mix(baseCol, foliage, ditherCut);
        }

        // 3. Southwestern Terracotta Canyon Biome (stratified sedimentary bands!)
        if (canyonMask > 0.05 && h > 2.5) {
          float strata = fract(h * 0.085 + fineCluster * 0.25);
          vec3 canyonCol = strata < 0.35 ? colCanyonRed : strata < 0.72 ? colCanyonOchre : colCanyonSand;
          if (slope < 0.14 && stipple > 0.84) canyonCol = colGoldLeaf; // desert scrub dots
          baseCol = mix(baseCol, canyonCol, canyonMask * 0.92);
        }

        // 4. Northwestern Volcanic Basalt & Glowing Caldera Biome
        if (volcanoMask > 0.05 && h > 4.0) {
          vec3 volcCol = mix(colBasalt, colAsh, step(0.54, fineCluster * 0.6 + stipple * 0.4));
          // Subtle glowing magma veins near volcano caldera (-720, -280)
          float dCaldera = length(p - vec2(-720.0, -280.0));
          float lavaPulse = 0.75 + 0.25 * sin(uTime * 2.2 + dCaldera * 0.15);
          if (dCaldera < 62.0 && h > 85.0 && stipple > 0.55) {
            volcCol = mix(volcCol, colLava * lavaPulse, smoothstep(62.0, 22.0, dCaldera));
          }
          baseCol = mix(baseCol, volcCol, volcanoMask * smoothstep(4.0, 22.0, h));
        }

        // 5. Exposed rocky alpine cliffs & ridges
        float rockMask = smoothstep(66.0, 96.0, h) + smoothstep(0.28, 0.46, slope) * smoothstep(18.0, 36.0, h);
        rockMask = clamp(rockMask, 0.0, 1.0) * (1.0 - canyonMask * 0.8) * (1.0 - volcanoMask * 0.75);
        if (rockMask > 0.05) {
          vec3 rock = mix(colRockDark, colRockLight, step(0.45, fineCluster * 0.65 + stipple * 0.35));
          baseCol = mix(baseCol, rock, smoothstep(0.2, 0.7, rockMask));
        }

        // 6. Snow-capped Alpine summits (excluding volcanic & canyon zones unless Alpine theme)
        float snowLine = 112.0 + (biomeA - 0.5) * 22.0 - slope * 24.0;
        float snowZoneMask = (1.0 - volcanoMask * 0.9) * (1.0 - canyonMask);
        if (uTerrainTheme >= 2.5) {
          snowLine = 26.0 + (biomeA - 0.5) * 14.0 - slope * 14.0;
          snowZoneMask = 1.0;
        } else if (uTerrainTheme >= 1.5) {
          snowLine = 152.0 + (biomeA - 0.5) * 18.0 - slope * 20.0;
        }
        float snowMask = smoothstep(snowLine, snowLine + 16.0, h) * snowZoneMask;
        baseCol = mix(baseCol, colSnow, snowMask);

        // 7. Blasted craters & excavated mountain holes (charred fractured rock + glowing embers!)
        if (vScorch > 0.04) {
          vec3 craterRock = mix(vec3(0.24, 0.20, 0.28), vec3(0.46, 0.36, 0.38), step(0.45, stipple * 0.65 + fineCluster * 0.35));
          float scorchEdge = step(1.0 - clamp(vScorch * 1.15, 0.0, 1.0), stipple * 0.55 + 0.25);
          baseCol = mix(baseCol, craterRock, clamp(vScorch * 0.85 + scorchEdge * 0.35, 0.0, 1.0));
          // Hot embers deep inside freshly blasted rock craters
          if (vScorch > 0.68 && stipple > 0.76) {
            float emberPulse = 0.7 + 0.3 * sin(uTime * 4.5 + p.x * 0.2);
            baseCol = mix(baseCol, vec3(1.0, 0.45, 0.14) * emberPulse, (vScorch - 0.68) * 2.2);
          }
        }

        // Stepped sunset cel-lighting with theme shadows
        float ndl = dot(N, normalize(uSunDir));
        float lit = smoothstep(-0.18, 0.08, ndl) * 0.5 + smoothstep(0.18, 0.45, ndl) * 0.5;
        vec3 shadowTint = vec3(0.56, 0.52, 0.68);
        vec3 sunTint    = vec3(1.06, 0.99, 0.90);
        vec3 fogCol     = vec3(0.94, 0.83, 0.72);
        if (uTerrainTheme > 0.5 && uTerrainTheme < 1.5) {
          shadowTint = vec3(0.54, 0.60, 0.72);
          sunTint    = vec3(1.10, 1.05, 0.94);
          fogCol     = vec3(0.92, 0.89, 0.78);
        } else if (uTerrainTheme >= 1.5 && uTerrainTheme < 2.5) {
          shadowTint = vec3(0.38, 0.26, 0.36);
          sunTint    = vec3(1.12, 0.86, 0.74);
          fogCol     = vec3(0.56, 0.32, 0.28);
        } else if (uTerrainTheme >= 2.5) {
          shadowTint = vec3(0.48, 0.56, 0.78);
          sunTint    = vec3(1.04, 1.02, 1.06);
          fogCol     = vec3(0.84, 0.86, 0.95);
        }
        vec3 col = baseCol * mix(shadowTint, sunTint, lit);

        // Cloud shadows on terrain
        float cloudDark = 0.0;
        for (int i = 0; i < ${MAX_CLOUDS}; i++) {
          vec2 cd = p - uClouds[i].xy;
          float r = uClouds[i].z;
          float d2 = dot(cd, cd) / (r * r);
          cloudDark = max(cloudDark, 1.0 - smoothstep(0.55, 1.05, d2));
        }
        col = mix(col, col * vec3(0.58, 0.56, 0.74), cloudDark * 0.65);

        // Atmospheric horizon fog (pushed back for epic long vistas!)
        float dist = length(uCamPos - vWorldPos);
        float fog = smoothstep(420.0, 1850.0, dist);
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(terrainGeo, terrainMat));

  // =========================================================================
  // 3. SUNSET OCEAN WITH SHORELINE FOAM, CORAL SHOALS, CLOUD SHADOWS & RIPPLES
  // =========================================================================
  const waterGeo = new THREE.PlaneGeometry(4200, 4200, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
      uCamPos: { value: new THREE.Vector3() },
      uHeightTex: { value: heightTex },
      uWorldSize: { value: WORLD_SIZE },
      uClouds: { value: cloudShadowUniforms },
      uRipples: { value: rippleUniforms },
      uTerrainTheme: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uCamPos;
      uniform sampler2D uHeightTex;
      uniform float uWorldSize;
      uniform vec4 uClouds[${MAX_CLOUDS}];
      uniform vec4 uRipples[${MAX_RIPPLES}];
      uniform float uTerrainTheme;
      varying vec3 vWorldPos;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        vec2 p = vWorldPos.xz;
        vec2 uv = (p / uWorldSize) + 0.5;

        float hNorm = 0.0;
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
          hNorm = texture2D(uHeightTex, uv).r;
        }
        float seabedH = hNorm * 300.0 - 50.0;
        float depth = max(0.0, -seabedH);

        vec3 cFoam    = vec3(0.94, 0.97, 0.96);
        vec3 cCoral   = vec3(0.45, 0.85, 0.78);
        vec3 cShallow = vec3(0.35, 0.76, 0.77);
        vec3 cMid     = vec3(0.18, 0.51, 0.65);
        vec3 cDeep    = vec3(0.20, 0.35, 0.54);
        vec3 fogCol   = vec3(0.94, 0.83, 0.72);
        if (uTerrainTheme > 0.5 && uTerrainTheme < 1.5) {
          cCoral   = vec3(0.36, 0.95, 0.86);
          cShallow = vec3(0.22, 0.86, 0.84);
          cMid     = vec3(0.10, 0.64, 0.78);
          cDeep    = vec3(0.10, 0.42, 0.68);
          fogCol   = vec3(0.92, 0.89, 0.78);
        } else if (uTerrainTheme >= 1.5 && uTerrainTheme < 2.5) {
          cFoam    = vec3(0.88, 0.74, 0.66);
          cCoral   = vec3(0.46, 0.30, 0.34);
          cShallow = vec3(0.34, 0.22, 0.32);
          cMid     = vec3(0.18, 0.15, 0.28);
          cDeep    = vec3(0.10, 0.09, 0.20);
          fogCol   = vec3(0.56, 0.32, 0.28);
        } else if (uTerrainTheme >= 2.5) {
          cCoral   = vec3(0.54, 0.82, 0.88);
          cShallow = vec3(0.36, 0.68, 0.80);
          cMid     = vec3(0.18, 0.44, 0.66);
          cDeep    = vec3(0.14, 0.28, 0.50);
          fogCol   = vec3(0.84, 0.86, 0.95);
        }

        // Coral reef shoal tint in shallow turquoise lagoons
        float reefN = noise(p * 0.035);
        vec3 shallowBase = mix(cShallow, cCoral, smoothstep(0.55, 0.78, reefN) * smoothstep(10.0, 2.0, depth));

        vec3 col = mix(shallowBase, cMid, smoothstep(2.0, 14.0, depth));
        col = mix(col, cDeep, smoothstep(12.0, 32.0, depth));

        // Crisp coastal foam ribbon
        float shoreWave = sin(depth * 2.0 - uTime * 2.4 + noise(p * 0.07) * 4.5);
        float foamEdge = smoothstep(2.6, 0.25, depth);
        float foamRibbon = smoothstep(0.45, 0.85, shoreWave) * smoothstep(6.0, 1.2, depth) * 0.55;
        col = mix(col, cFoam, clamp(foamEdge * 0.92 + foamRibbon, 0.0, 1.0));

        // Oval cloud shadows on ocean
        float cloudShadow = 0.0;
        for (int i = 0; i < ${MAX_CLOUDS}; i++) {
          vec2 cd = p - uClouds[i].xy;
          float r = uClouds[i].z;
          float d2 = dot(cd, cd) / (r * r);
          cloudShadow = max(cloudShadow, 1.0 - smoothstep(0.68, 0.98, d2));
        }
        col = mix(col, vec3(0.22, 0.27, 0.45), cloudShadow * 0.64);

        // Twinkling white pixel sun-sparkles
        vec2 sparkGrid = floor(p * 0.32);
        float tStep = floor(uTime * 3.5 + hash(sparkGrid) * 10.0);
        float sp = hash(sparkGrid + vec2(tStep * 1.31, tStep * 0.73));
        float distCam = length(uCamPos - vWorldPos);
        float sparkFade = 1.0 - smoothstep(280.0, 920.0, distCam);
        float sparkle = step(0.978, sp) * sparkFade;
        col = mix(col, vec3(0.96, 0.98, 0.95), sparkle * 0.92);

        // Short white wave flecks
        vec2 waveCell = floor(vec2(p.x * 0.13 + uTime * 0.35, p.y * 0.26));
        if (hash(waveCell) > 0.989 && distCam < 520.0) {
          col = mix(col, vec3(0.84, 0.94, 0.96), 0.72);
        }

        // Expanding white concentric water impact ripples
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec4 rip = uRipples[i];
          if (rip.w > 0.5) {
            float age = uTime - rip.z;
            if (age >= 0.0 && age < 4.5) {
              float d = length(p - rip.xy);
              float r1 = age * 14.0;
              float r2 = max(0.0, (age - 0.35) * 11.0);
              float ring1 = 1.0 - smoothstep(0.4, 1.5, abs(d - r1));
              float ring2 = (age > 0.35 ? 1.0 : 0.0) * (1.0 - smoothstep(0.4, 1.4, abs(d - r2)));
              float fadeR = 1.0 - smoothstep(1.8, 4.5, age);
              float ringVal = clamp(ring1 + ring2 * 0.75, 0.0, 1.0) * fadeR;
              col = mix(col, vec3(0.95, 0.98, 1.0), ringVal * 0.92);
            }
          }
        }

        float fog = smoothstep(450.0, 1920.0, distCam);
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = WATER_LEVEL;
  scene.add(waterMesh);

  // =========================================================================
  // 4. 3D WORLD DETAILS (Biome Trees, Lighthouses, Coastal Villages, Sailboats, Airstrip!)
  // =========================================================================
  const dummy = new THREE.Object3D();

  // ---- Destructible object registry (spatial hash grid + priority target list) ----
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  const GRID = 48;
  const grid = new Map();
  const dirtyMeshes = new Set();
  const lockableTargets = []; // ships, balloons, lighthouses, towers, hangars, fuel tanks, houses
  function registerDestructible(obj, lockable = false) {
    obj.alive = true;
    const key = Math.floor(obj.x / GRID) + ',' + Math.floor(obj.z / GRID);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(obj);
    if (lockable) lockableTargets.push(obj);
  }

  // 4a. Instanced Biome Trees (1800 stylized trees: autumn crimson/gold/orange + emerald pines + desert scrub)
  const treeCount = 1800;
  const treeGeo = new THREE.ConeGeometry(2.8, 7.6, 5);
  const treeMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);

  const autumnCols = [0xc93b26, 0xe36c28, 0xebba38, 0xa82820];
  const pineCols = [0x2d683b, 0x3b7d45, 0x224f31];
  const scrubCols = [0x7e8a42, 0xb8863c, 0x62733a];

  let placedTrees = 0;
  let treeAttempts = 0;
  while (placedTrees < treeCount && treeAttempts < 9000) {
    treeAttempts++;
    const tx = (rand() - 0.5) * 2150;
    const tz = (rand() - 0.5) * 2150;
    // Skip airstrip plateau
    if (Math.abs(tx + 215) < 58 && Math.abs(tz - 225) < 110) continue;

    const ty = getTerrainHeight(tx, tz);
    if (ty < 5.5 || ty > 78.0) continue;

    const isCanyon = tx < -240 && tz > 260;
    const isVolcano = tx < -420 && tz < -40;
    if (isVolcano && ty > 25) continue;

    const s = isCanyon ? 0.55 + rand() * 0.5 : 0.75 + rand() * 1.25;
    dummy.position.set(tx, ty + 3.0 * s, tz);
    dummy.scale.set(s, s * (0.9 + rand() * 0.55), s);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.updateMatrix();
    trees.setMatrixAt(placedTrees, dummy.matrix);

    let hex;
    if (isCanyon) {
      hex = scrubCols[Math.floor(rand() * scrubCols.length)];
    } else if (ty > 42 || fbm(tx * 0.0085 + 2.1, tz * 0.0085 - 4.3, 3) > 0.6) {
      hex = pineCols[Math.floor(rand() * pineCols.length)];
    } else {
      hex = autumnCols[Math.floor(rand() * autumnCols.length)];
    }
    trees.setColorAt(placedTrees, new THREE.Color(hex));
    {
      const ti = placedTrees;
      registerDestructible({
        type: 'tree', x: tx, y: ty, z: tz, r: 3.2 * s, h: 9 * s, color: hex,
        kill() { trees.setMatrixAt(ti, ZERO_M); dirtyMeshes.add(trees); },
      });
    }
    placedTrees++;
  }
  trees.count = placedTrees;
  trees.instanceMatrix.needsUpdate = true;
  if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  scene.add(trees);

  // 4b. Coastal Villages (tiny warm cream houses with terracotta roofs nestled along flat bays!)
  const houseWallsGeo = new THREE.BoxGeometry(4.4, 3.2, 4.4);
  const houseRoofGeo = new THREE.ConeGeometry(3.6, 2.2, 4);
  houseRoofGeo.rotateY(Math.PI / 4);
  const houseWallMat = new THREE.MeshLambertMaterial({ color: 0xf2e4cc, flatShading: true });
  const houseRoofMat = new THREE.MeshLambertMaterial({ flatShading: true });

  const villageCenters = [
    { x: 196, z: -112 },
    { x: 252, z: -84 },
    { x: -252, z: -168 },
    { x: -140, z: -252 },
    { x: -168, z: 224 },
    { x: -252, z: 140 },
  ];
  const maxHouses = 140;
  const houseWalls = new THREE.InstancedMesh(houseWallsGeo, houseWallMat, maxHouses);
  const houseRoofs = new THREE.InstancedMesh(houseRoofGeo, houseRoofMat, maxHouses);
  const roofPalette = [0xc94d34, 0xb83e2e, 0xd46a3b, 0x4b5c78];

  let placedHouses = 0;
  for (const vc of villageCenters) {
    for (let k = 0; k < 28 && placedHouses < maxHouses; k++) {
      const hx = vc.x + (rand() - 0.5) * 95;
      const hz = vc.z + (rand() - 0.5) * 95;
      const hy = getTerrainHeight(hx, hz);
      if (hy < 2.2 || hy > 16.0) continue;
      // Check flatness
      if (Math.abs(getTerrainHeight(hx + 4, hz) - hy) > 2.2) continue;

      const s = 0.75 + rand() * 0.55;
      const rotY = rand() * Math.PI * 2;
      dummy.position.set(hx, hy + 1.4 * s, hz);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      houseWalls.setMatrixAt(placedHouses, dummy.matrix);

      dummy.position.set(hx, hy + 3.9 * s, hz);
      dummy.updateMatrix();
      houseRoofs.setMatrixAt(placedHouses, dummy.matrix);
      houseRoofs.setColorAt(placedHouses, new THREE.Color(roofPalette[Math.floor(rand() * roofPalette.length)]));
      {
        const hi = placedHouses;
        registerDestructible({
          type: 'house', label: 'HOUSE', x: hx, y: hy, z: hz, r: 5.2 * s, h: 7.5 * s, color: 0xf2e4cc,
          kill() {
            houseWalls.setMatrixAt(hi, ZERO_M);
            houseRoofs.setMatrixAt(hi, ZERO_M);
            dirtyMeshes.add(houseWalls); dirtyMeshes.add(houseRoofs);
          },
        }, true);
      }
      placedHouses++;
    }
  }
  houseWalls.count = placedHouses;
  houseRoofs.count = placedHouses;
  houseWalls.instanceMatrix.needsUpdate = true;
  houseRoofs.instanceMatrix.needsUpdate = true;
  if (houseRoofs.instanceColor) houseRoofs.instanceColor.needsUpdate = true;
  scene.add(houseWalls, houseRoofs);

  // 4c. Coastal Lighthouses with glowing sunset beacons on scenic headlands!
  const lighthouseBeacons = [];
  const lhCoords = [
    [168, -140],
    [224, -84],
    [-196, 140],
    [-168, -224],
    [-280, -84],
    [-112, 280],
    [196, -224],
    [-84, -308],
  ];
  const lhWhiteMat = new THREE.MeshLambertMaterial({ color: 0xf7f2e8, flatShading: true });
  const lhRedMat = new THREE.MeshLambertMaterial({ color: 0xd94534, flatShading: true });
  const lhLampMat = new THREE.MeshBasicMaterial({ color: 0xfff08a });

  for (const [lx, lz] of lhCoords) {
    const ly = getTerrainHeight(lx, lz);
    if (ly < 2.0) continue;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 7.5, 6), lhWhiteMat);
    base.position.y = 3.75;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.6, 4.5, 6), lhRedMat);
    stripe.position.y = 9.75;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), lhLampMat);
    lamp.position.y = 13.0;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.0, 6), lhRedMat);
    cap.position.y = 14.8;
    g.add(base, stripe, lamp, cap);
    g.position.set(lx, ly - 0.5, lz);
    scene.add(g);
    lighthouseBeacons.push({ lamp, phase: rand() * Math.PI * 2, group: g });
    registerDestructible({
      type: 'lighthouse', label: 'LIGHTHOUSE', x: lx, y: ly, z: lz, r: 5.0, h: 18, color: 0xf7f2e8,
      kill() { g.visible = false; },
    }, true);
  }

  // 4d. Coastal Island Airstrip at (-215, 225) for epic low flybys!
  const stripY = getTerrainHeight(-215, 225) + 0.35;
  const runway = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.4, 132),
    new THREE.MeshLambertMaterial({ color: 0x343746 })
  );
  runway.position.set(-215, stripY, 225);
  scene.add(runway);

  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf7efe0 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb84a });
  for (let dz = -54; dz <= 54; dz += 14) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.48, 6.5), dashMat);
    dash.position.set(-215, stripY + 0.05, 225 + dz);
    scene.add(dash);

    for (const sx of [-10.5, 10.5]) {
      const rl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), lightMat);
      rl.position.set(-215 + sx, stripY + 0.5, 225 + dz);
      scene.add(rl);
    }
  }
  // Control tower beside airstrip
  const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 13, 6), lhWhiteMat);
  tower.position.set(-196, stripY + 6.5, 215);
  const towerCab = new THREE.Mesh(new THREE.BoxGeometry(7.8, 3.2, 7.8), lhLampMat);
  towerCab.position.set(-196, stripY + 14.5, 215);
  scene.add(tower, towerCab);
  registerDestructible({
    type: 'tower', label: 'CONTROL TOWER', x: -196, y: stripY, z: 215, r: 7.5, h: 19, color: 0xf7f2e8,
    kill() { tower.visible = false; towerCab.visible = false; },
  }, true);

  // Destructible hangars & red fuel tanks beside the airstrip
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0x7e889c, flatShading: true });
  const tankMat = new THREE.MeshLambertMaterial({ color: 0xdf4b36, flatShading: true });
  for (const hz of [185, 248]) {
    const hg = new THREE.Group();
    const hBody = new THREE.Mesh(new THREE.BoxGeometry(15, 7.5, 20), hangarMat);
    hBody.position.y = 3.75;
    const hRoof = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 20, 6, 1, false, 0, Math.PI), lhWhiteMat);
    hRoof.rotation.z = Math.PI / 2;
    hRoof.rotation.y = Math.PI / 2;
    hRoof.position.y = 7.5;
    hg.add(hBody, hRoof);
    hg.position.set(-237, stripY, hz);
    scene.add(hg);
    registerDestructible({
      type: 'hangar', label: 'HANGAR', x: -237, y: stripY, z: hz, r: 11.0, h: 14, color: 0xc4cad6,
      kill() { hg.visible = false; },
    }, true);
  }
  for (const [tx, tz] of [[-194, 192], [-194, 240], [-184, 202]]) {
    const tk = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 7.2, 8), tankMat);
    tk.position.set(tx, stripY + 3.6, tz);
    scene.add(tk);
    registerDestructible({
      type: 'tank', label: 'FUEL TANK', x: tx, y: stripY, z: tz, r: 5.5, h: 9.0, color: 0xff6e38,
      kill() { tk.visible = false; },
    }, true);
  }

  // 4f. Large Naval Ships cruising the central bays (24 ships for 20-ship objective!)
  const ships = [];
  const shipHullMat = new THREE.MeshLambertMaterial({ color: 0x4b556b, flatShading: true });
  const shipDeckMat = new THREE.MeshLambertMaterial({ color: 0xb84735, flatShading: true });
  const shipPositions = [
    [-40, 85, 0.3],
    [35, 30, -0.8],
    [-110, -15, 1.1],
    [70, -90, 2.2],
    [-15, -120, -1.6],
    [160, 75, 0.7],
    [-190, 65, -0.4],
    [25, 175, 1.8],
    [220, 195, -2.1],
    [-280, -20, 0.5],
    [-95, -455, -3.14],
    [85, -455, -1.97],
    [130, -365, 0.37],
    [40, -320, 1.54],
    [-455, -275, 2.71],
    [85, -230, -1.23],
    [-500, -140, 1.11],
    [-185, -95, 2.28],
    [355, -50, 0.68],
    [-455, 40, 3.02],
    [-365, 85, -2.09],
    [310, 85, -0.92],
    [130, 175, 2.59],
    [85, 265, -0.18],
  ];
  for (const [sx, sz, ang] of shipPositions) {
    if (getTerrainHeight(sx, sz) > -3.5) continue;
    const sg = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.8, 24.0), shipHullMat);
    hull.position.y = 1.6;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.8, 21.5), shipDeckMat);
    deck.position.y = 3.6;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(4.8, 5.2, 6.2), lhWhiteMat);
    bridge.position.set(0, 6.2, 3.5);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 4.4, 6), lhRedMat);
    funnel.position.set(0, 6.8, -3.5);
    sg.add(hull, deck, bridge, funnel);
    sg.position.set(sx, WATER_LEVEL, sz);
    sg.rotation.y = ang;
    scene.add(sg);

    const shipObj = {
      type: 'ship', label: 'NAVAL SHIP', x: sx, y: WATER_LEVEL, z: sz,
      originX: sx, originZ: sz, originAng: ang,
      r: 12.5, h: 12.0, color: 0xd9563c,
      group: sg, angle: ang, speed: 4.5 + rand() * 3.0, phase: rand() * Math.PI * 2,
      alive: true, respawnTimer: 0,
      kill() { sg.visible = false; this.respawnTimer = 38.0; },
    };
    ships.push(shipObj);
    lockableTargets.push(shipObj);
  }

  // 4g. Rare Sky Balloons carrying Pink-Cross Full-Heal Medkits (only 3 rare balloons in the sky!)
  const balloons = [];
  const balRoseMat = new THREE.MeshLambertMaterial({ color: 0xe84b86, flatShading: true });
  const balCreamMat = new THREE.MeshLambertMaterial({ color: 0xfff2dc, flatShading: true });
  const balBasketMat = new THREE.MeshLambertMaterial({ color: 0x7a4b36, flatShading: true });
  const balloonSpawnPool = [
    [-68, 78, 85],
    [135, 95, -95],
    [-205, 84, -55],
    [215, 98, 20],
    [-165, 82, 125],
    [85, 80, 65],
    [-55, 88, -80],
    [55, 90, 155],
    [-10, 102, -195],
    [-112, 74, 25],
  ];
  for (let bi = 0; bi < 3; bi++) {
    const [bx, by, bz] = balloonSpawnPool[bi];
    const bg = new THREE.Group();
    const env1 = new THREE.Mesh(new THREE.IcosahedronGeometry(6.8, 1), balRoseMat);
    env1.scale.set(1.0, 1.18, 1.0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(6.9, 6.9, 3.2, 8), balCreamMat);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 2.8), balBasketMat);
    basket.position.y = -10.5;
    bg.add(env1, band, basket);
    bg.position.set(bx, by, bz);
    scene.add(bg);

    const balObj = {
      type: 'balloon', label: 'MEDKIT BALLOON', x: bx, y: by - 6, z: bz, r: 10.5, h: 16.0, color: 0xff62a8,
      group: bg, baseY: by, phase: rand() * Math.PI * 2, spotIdx: bi,
      driftX: (rand() - 0.5) * 3.2, driftZ: (rand() - 0.5) * 3.2,
      alive: true, respawnTimer: 0,
      kill() { bg.visible = false; this.respawnTimer = 70.0 + Math.random() * 40.0; },
    };
    balloons.push(balObj);
    lockableTargets.push(balObj);
  }

  // 4e. Sailboats drifting across the turquoise bays (great sense of scale!)
  const boatCount = 46;
  const hullGeo = new THREE.BoxGeometry(1.6, 0.8, 4.2);
  const sailGeo = new THREE.ConeGeometry(1.8, 5.2, 3);
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x7a4b36, flatShading: true });
  const sailMat = new THREE.MeshBasicMaterial({ color: 0xfdf8ef });

  const boatHulls = new THREE.InstancedMesh(hullGeo, hullMat, boatCount);
  const boatSails = new THREE.InstancedMesh(sailGeo, sailMat, boatCount);
  const boats = [];

  let bAttempts = 0;
  while (boats.length < boatCount && bAttempts < 1500) {
    bAttempts++;
    const bx = (rand() - 0.5) * 1800;
    const bz = (rand() - 0.5) * 1800;
    const bh = getTerrainHeight(bx, bz);
    if (bh > -4.5) continue; // open water only
    boats.push({
      x: bx,
      z: bz,
      angle: rand() * Math.PI * 2,
      speed: 1.4 + rand() * 1.8,
      phase: rand() * Math.PI * 2,
      alive: true,
    });
  }
  boatHulls.count = boats.length;
  boatSails.count = boats.length;
  scene.add(boatHulls, boatSails);

  // =========================================================================
  // 5. PUFFY 3D CUMULUS CLOUDS (flat lavender base + dithered pink mid + bright cream dome)
  // =========================================================================
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uCamPos: { value: new THREE.Vector3() },
      uTerrainTheme: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uCamPos;
      uniform float uTerrainTheme;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      float bayer2(vec2 p) {
        int x = int(mod(p.x, 2.0));
        int y = int(mod(p.y, 2.0));
        if (x == 0 && y == 0) return 0.25;
        if (x == 1 && y == 1) return 0.50;
        if (x == 1 && y == 0) return 0.75;
        return 1.0;
      }

      void main() {
        vec3 N = normalize(vNormal);
        float ndl = dot(N, normalize(uSunDir)) * 0.5 + 0.5;
        float topness = clamp(N.y * 0.65 + 0.45, 0.0, 1.0);
        float lightVal = ndl * 0.5 + topness * 0.5;

        vec3 cCream    = vec3(0.99, 0.96, 0.93);
        vec3 cPink     = vec3(0.93, 0.78, 0.79);
        vec3 cLavender = vec3(0.56, 0.51, 0.66);
        vec3 fogCol    = vec3(0.94, 0.83, 0.72);
        if (uTerrainTheme > 0.5 && uTerrainTheme < 1.5) {
          cCream    = vec3(1.00, 0.99, 0.96);
          cPink     = vec3(0.96, 0.92, 0.84);
          cLavender = vec3(0.68, 0.74, 0.84);
          fogCol    = vec3(0.92, 0.89, 0.78);
        } else if (uTerrainTheme >= 1.5 && uTerrainTheme < 2.5) {
          cCream    = vec3(0.84, 0.62, 0.52);
          cPink     = vec3(0.58, 0.36, 0.38);
          cLavender = vec3(0.32, 0.22, 0.30);
          fogCol    = vec3(0.56, 0.32, 0.28);
        } else if (uTerrainTheme >= 2.5) {
          cCream    = vec3(0.98, 0.98, 1.00);
          cPink     = vec3(0.86, 0.86, 0.94);
          cLavender = vec3(0.54, 0.60, 0.78);
          fogCol    = vec3(0.84, 0.86, 0.95);
        }

        float d = bayer2(floor(gl_FragCoord.xy));
        vec3 col;
        if (N.y < -0.25) {
          col = cLavender;
        } else if (lightVal + (d - 0.5) * 0.18 > 0.64) {
          col = cCream;
        } else if (lightVal + (d - 0.5) * 0.18 > 0.42) {
          col = cPink;
        } else {
          col = cLavender;
        }

        float dist = length(uCamPos - vWorldPos);
        float fog = smoothstep(580.0, 2050.0, dist);
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  function createDomeGeo(radius) {
    const geo = new THREE.SphereGeometry(radius, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      if (pa.getY(i) < 0) pa.setY(i, 0);
    }
    geo.computeVertexNormals();
    const cap = new THREE.CircleGeometry(radius * Math.sin(Math.PI * 0.56), 12);
    cap.rotateX(Math.PI / 2);
    return { dome: geo, cap };
  }

  const baseDome = createDomeGeo(1.0);
  const cloudGroup = new THREE.Group();
  scene.add(cloudGroup);
  const clouds = [];

  for (let i = 0; i < 54; i++) {
    const cg = new THREE.Group();
    const isShadowCaster = i < MAX_CLOUDS;
    const scaleBase = isShadowCaster ? 32 + rand() * 44 : 22 + rand() * 32;
    const puffs = 3 + Math.floor(rand() * 3);

    for (let p = 0; p < puffs; p++) {
      const r = scaleBase * (p === 0 ? 1.0 : 0.52 + rand() * 0.44);
      const hScale = 0.45 + rand() * 0.25;
      const ox = p === 0 ? 0 : (rand() - 0.5) * scaleBase * 1.45;
      const oz = p === 0 ? 0 : (rand() - 0.5) * scaleBase * 1.15;

      const domeMesh = new THREE.Mesh(baseDome.dome, cloudMat);
      domeMesh.scale.set(r, r * hScale, r * (0.8 + rand() * 0.35));
      domeMesh.position.set(ox, 0, oz);
      cg.add(domeMesh);

      const capMesh = new THREE.Mesh(baseDome.cap, cloudMat);
      capMesh.scale.set(r, 1, r * (0.8 + rand() * 0.35));
      capMesh.position.set(ox, 0.02, oz);
      cg.add(capMesh);
    }

    const cx = (rand() - 0.5) * 2350;
    const cz = (rand() - 0.5) * 2350;
    const cy = isShadowCaster ? 85 + rand() * 65 : 185 + rand() * 95;
    cg.position.set(cx, cy, cz);
    cloudGroup.add(cg);

    clouds.push({
      mesh: cg,
      speed: 2.2 + rand() * 2.4,
      shadowRadius: scaleBase * 1.15,
      shadowIndex: isShadowCaster ? i : -1,
    });
  }

  function damage(pos, blast) {
    const killed = [];
    const range = Math.ceil((blast + 12) / GRID);
    const cx = Math.floor(pos.x / GRID);
    const cz = Math.floor(pos.z / GRID);
    for (let ix = cx - range; ix <= cx + range; ix++) {
      for (let iz = cz - range; iz <= cz + range; iz++) {
        const list = grid.get(ix + ',' + iz);
        if (!list) continue;
        for (const o of list) {
          if (!o.alive) continue;
          const dx = o.x - pos.x;
          const dz = o.z - pos.z;
          const reach = o.r + blast;
          if (dx * dx + dz * dz > reach * reach) continue;
          if (pos.y < o.y - 3 - blast * 0.5 || pos.y > o.y + o.h + 3 + blast * 0.5) continue;
          o.alive = false;
          o.kill();
          killed.push(o);
        }
      }
    }
    for (const b of boats) {
      if (!b.alive) continue;
      const dx = b.x - pos.x;
      const dz = b.z - pos.z;
      const reach = 5.5 + blast;
      if (dx * dx + dz * dz < reach * reach && pos.y < 10 + blast * 0.6) {
        b.alive = false;
        killed.push({ type: 'boat', label: 'SAILBOAT', x: b.x, y: WATER_LEVEL + 1, z: b.z, color: 0xfdf8ef });
      }
    }
    for (const sh of ships) {
      if (!sh.alive) continue;
      const dx = sh.x - pos.x;
      const dz = sh.z - pos.z;
      const reach = sh.r + blast;
      if (dx * dx + dz * dz < reach * reach && pos.y < sh.h + 5 + blast * 0.6) {
        sh.alive = false;
        sh.kill();
        killed.push(sh);
      }
    }
    for (const bl of balloons) {
      if (!bl.alive) continue;
      const dx = bl.x - pos.x;
      const dy = (bl.y + 6) - pos.y;
      const dz = bl.z - pos.z;
      const reach = bl.r + blast;
      if (dx * dx + dy * dy + dz * dz < reach * reach) {
        bl.alive = false;
        bl.kill();
        killed.push(bl);
      }
    }
    for (const m of dirtyMeshes) m.instanceMatrix.needsUpdate = true;
    dirtyMeshes.clear();
    return killed;
  }

  // Find best destructible target inside forward aiming cone for HUD lock-on & missile homing
  function findLockTarget(origin, fwdDir, maxRange = 460) {
    let best = null;
    let bestScore = Infinity;
    const toTarget = new THREE.Vector3();
    for (const t of lockableTargets) {
      if (!t.alive) continue;
      const ty = t.y + (t.h || 6) * 0.5;
      toTarget.set(t.x - origin.x, ty - origin.y, t.z - origin.z);
      const dist = toTarget.length();
      if (dist < 18 || dist > maxRange) continue;
      toTarget.divideScalar(dist);
      const dot = toTarget.dot(fwdDir);
      if (dot < 0.90) continue; // ~25 deg cone
      const anglePenalty = (1.0 - dot) * 900;
      const score = dist + anglePenalty;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  // Real-time terrain deformation: carves craters, trenches & holes right through mountains!
  // Updates local vertex heights, local normals (fast 60fps), scorch shader mask, and ocean heightTex!
  function deformTerrain(wx, wz, radius, depth, dirX = 0, dirZ = 0) {
    if (deformScale <= 0.001) return false;
    const effRadius = deformScale > 1.0 ? radius * 1.15 : radius;
    const effDepth = depth * deformScale;

    // Push excavation slightly inward along projectile direction so shooting mountain walls bites deep!
    const cxWorld = wx + dirX * effRadius * 0.25;
    const czWorld = wz + dirZ * effRadius * 0.25;

    const gxCenter = ((cxWorld / WORLD_SIZE) + 0.5) * TERRAIN_SEGS;
    const gzCenter = ((czWorld / WORLD_SIZE) + 0.5) * TERRAIN_SEGS;
    const cellRadius = Math.ceil(effRadius / CELL_SIZE) + 1;

    const ixMin = Math.max(1, Math.floor(gxCenter - cellRadius));
    const ixMax = Math.min(TERRAIN_SEGS - 1, Math.ceil(gxCenter + cellRadius));
    const izMin = Math.max(1, Math.floor(gzCenter - cellRadius));
    const izMax = Math.min(TERRAIN_SEGS - 1, Math.ceil(gzCenter + cellRadius));

    if (ixMin > ixMax || izMin > izMax) return false;

    let changed = false;
    const rSq = effRadius * effRadius;

    for (let iz = izMin; iz <= izMax; iz++) {
      const vz = ((iz / TERRAIN_SEGS) - 0.5) * WORLD_SIZE;
      const dz = vz - czWorld;
      const row = iz * TERRAIN_STRIDE;
      for (let ix = ixMin; ix <= ixMax; ix++) {
        const vx = ((ix / TERRAIN_SEGS) - 0.5) * WORLD_SIZE;
        const dx = vx - cxWorld;
        const dSq = dx * dx + dz * dz;
        if (dSq >= rSq) continue;

        const t = Math.sqrt(dSq) / effRadius;
        const idx = row + ix;
        const cragVar = 0.84 + 0.32 * hash2(ix * 1.7, iz * 2.3);
        const carve = Math.pow(1.0 - t * t, 1.35) * effDepth * cragVar;

        const newH = Math.max(-34.0, liveHeights[idx] - carve);
        if (newH < liveHeights[idx] - 0.01) {
          liveHeights[idx] = newH;
          posAttr.setY(idx, newH);
          scorchData[idx] = Math.min(1.0, scorchData[idx] + Math.pow(1.0 - t, 0.72) * 1.18);
          changed = true;
        }
      }
    }

    if (!changed) return false;

    // Fast local normal recalculation around the crater only (~0.05ms)
    const nxMin = Math.max(1, ixMin - 1);
    const nxMax = Math.min(TERRAIN_SEGS - 1, ixMax + 1);
    const nzMin = Math.max(1, izMin - 1);
    const nzMax = Math.min(TERRAIN_SEGS - 1, izMax + 1);
    const twoCell = CELL_SIZE * 2.0;

    for (let iz = nzMin; iz <= nzMax; iz++) {
      const row = iz * TERRAIN_STRIDE;
      for (let ix = nxMin; ix <= nxMax; ix++) {
        const idx = row + ix;
        const hL = liveHeights[idx - 1];
        const hR = liveHeights[idx + 1];
        const hU = liveHeights[idx - TERRAIN_STRIDE];
        const hD = liveHeights[idx + TERRAIN_STRIDE];
        const nx = hL - hR;
        const ny = twoCell;
        const nz = hU - hD;
        const invLen = 1.0 / Math.hypot(nx, ny, nz);
        normAttr.setXYZ(idx, nx * invLen, ny * invLen, nz * invLen);
      }
    }

    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
    scorchAttr.needsUpdate = true;

    // Update ocean heightTex patch locally so deep holes below sea level flood with foam & turquoise water!
    const tSize = heightTexObj.size;
    const tData = heightTexObj.data;
    const txMin = Math.max(0, Math.floor((((cxWorld - effRadius - CELL_SIZE) / WORLD_SIZE) + 0.5) * (tSize - 1)));
    const txMax = Math.min(tSize - 1, Math.ceil((((cxWorld + effRadius + CELL_SIZE) / WORLD_SIZE) + 0.5) * (tSize - 1)));
    const tzMin = Math.max(0, Math.floor((((czWorld - effRadius - CELL_SIZE) / WORLD_SIZE) + 0.5) * (tSize - 1)));
    const tzMax = Math.min(tSize - 1, Math.ceil((((czWorld + effRadius + CELL_SIZE) / WORLD_SIZE) + 0.5) * (tSize - 1)));

    for (let tz = tzMin; tz <= tzMax; tz++) {
      const z = ((tz / (tSize - 1)) - 0.5) * WORLD_SIZE;
      for (let tx = txMin; tx <= txMax; tx++) {
        const x = ((tx / (tSize - 1)) - 0.5) * WORLD_SIZE;
        const h = getTerrainHeight(x, z);
        const norm = THREE.MathUtils.clamp((h + 50.0) / 300.0, 0.0, 1.0);
        const v = Math.round(norm * 255);
        const off = (tz * tSize + tx) * 4;
        tData[off] = v;
        tData[off + 1] = v;
        tData[off + 2] = v;
      }
    }
    heightTex.needsUpdate = true;
    return true;
  }

  // Restore all mountains and terrain back to original state
  function resetTerrain() {
    liveHeights.set(baseHeights);
    scorchData.fill(0);
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setY(i, liveHeights[i]);
    }
    terrainGeo.computeVertexNormals();
    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
    scorchAttr.needsUpdate = true;

    const tSize = heightTexObj.size;
    const tData = heightTexObj.data;
    for (let tz = 0; tz < tSize; tz++) {
      const z = ((tz / (tSize - 1)) - 0.5) * WORLD_SIZE;
      for (let tx = 0; tx < tSize; tx++) {
        const x = ((tx / (tSize - 1)) - 0.5) * WORLD_SIZE;
        const h = getTerrainHeight(x, z);
        const norm = THREE.MathUtils.clamp((h + 50.0) / 300.0, 0.0, 1.0);
        const v = Math.round(norm * 255);
        const off = (tz * tSize + tx) * 4;
        tData[off] = v;
        tData[off + 1] = v;
        tData[off + 2] = v;
      }
    }
    heightTex.needsUpdate = true;
  }

  // =========================================================================
  // 6. DYNAMIC DROPPED PICKUPS: PINK-CROSS MEDKITS (BALLOONS) & SEA-SKIM MISSILE CRATES
  // =========================================================================
  const pickups = [];
  let dropCounter = 0;

  const healthMat = new THREE.MeshBasicMaterial({ color: 0xff4fa3 });
  const healthBoxMat = new THREE.MeshLambertMaterial({ color: 0xfff6fa, flatShading: true });
  const healthRingMat = new THREE.MeshBasicMaterial({ color: 0xff78be, side: THREE.DoubleSide });
  const healthBeamMat = new THREE.MeshBasicMaterial({
    color: 0xff4fa3,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const chuteMat = new THREE.MeshLambertMaterial({ color: 0xffe4f0, flatShading: true, side: THREE.DoubleSide });
  const chuteGeo = new THREE.SphereGeometry(4.2, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);

  const crateBodyMat = new THREE.MeshLambertMaterial({ color: 0xf2932e, flatShading: true });
  const crateTrimMat = new THREE.MeshLambertMaterial({ color: 0x34384a, flatShading: true });
  const crateTipMat = new THREE.MeshBasicMaterial({ color: 0xfff08a });
  const crateRingMat = new THREE.MeshBasicMaterial({ color: 0xffc64a, side: THREE.DoubleSide });
  const crateBeamMat = new THREE.MeshBasicMaterial({
    color: 0xffa638,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });

  const healthBeamGeo = new THREE.CylinderGeometry(0.9, 1.5, 85, 6);
  const crateBeamGeo = new THREE.CylinderGeometry(0.9, 1.5, 42, 6);
  const ringGeo = new THREE.RingGeometry(5.8, 7.2, 16);
  ringGeo.rotateX(-Math.PI / 2);

  function spawnDroppedPickup(type, x, y, z, customId = null) {
    if (customId && pickups.some((item) => item.id === customId)) {
      return null;
    }
    const id = customId || `drop_${type}_${++dropCounter}_${Math.floor(Math.random() * 9999)}`;
    const groundH = getTerrainHeight(x, z);
    const overWater = groundH < WATER_LEVEL - 0.5;

    let startY = y;
    let targetY = y;
    let fallSpeed = 0;
    let falling = false;
    let isSeaSkim = false;

    if (type === 'health') {
      targetY = Math.max(WATER_LEVEL + 10, groundH + 12);
      startY = Math.max(targetY, y);
      falling = startY > targetY + 0.5;
      fallSpeed = 9.5;
    } else {
      isSeaSkim = overWater;
      targetY = overWater ? WATER_LEVEL + 3.2 : groundH + 4.5;
      startY = Math.max(targetY, y);
      falling = startY > targetY + 0.4;
      fallSpeed = 24.0;
    }

    const g = new THREE.Group();
    const core = new THREE.Group();
    let chute = null;

    if (type === 'health') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(5.4, 5.4, 5.4), healthBoxMat);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.8, 5.8), healthMat);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(1.8, 6.2, 5.8), healthMat);
      const crossZ = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.8, 6.2), healthMat);
      const crossZV = new THREE.Mesh(new THREE.BoxGeometry(5.8, 6.2, 1.8), healthMat);
      const crossTopX = new THREE.Mesh(new THREE.BoxGeometry(4.2, 5.9, 1.6), healthMat);
      const crossTopZ = new THREE.Mesh(new THREE.BoxGeometry(1.6, 5.9, 4.2), healthMat);
      core.add(box, crossH, crossV, crossZ, crossZV, crossTopX, crossTopZ);

      chute = new THREE.Mesh(chuteGeo, chuteMat);
      chute.position.y = 6.2;
      chute.visible = falling;
      g.add(chute);
    } else {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.4, 5.0), crateBodyMat);
      const band = new THREE.Mesh(new THREE.BoxGeometry(7.1, 1.2, 5.3), crateTrimMat);
      core.add(crate, band);
      for (const ox of [-1.8, 0, 1.8]) {
        const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.2, 5), crateTipMat);
        warhead.position.set(ox, 3.1, 0);
        core.add(warhead);
      }
    }

    const ring = new THREE.Mesh(ringGeo, type === 'health' ? healthRingMat : crateRingMat);
    const beam = new THREE.Mesh(
      type === 'health' ? healthBeamGeo : crateBeamGeo,
      type === 'health' ? healthBeamMat : crateBeamMat
    );
    beam.position.y = type === 'health' ? 35 : 18;

    g.add(core, ring, beam);
    g.position.set(x, startY, z);
    scene.add(g);

    const record = {
      id,
      type,
      x,
      y: startY,
      z,
      baseY: targetY,
      targetY,
      falling,
      fallSpeed,
      isSeaSkim,
      chute,
      life: 95.0,
      active: true,
      group: g,
      core,
      ring,
      phase: rand() * Math.PI * 2,
    };
    pickups.push(record);
    return record;
  }

  function getPickups() {
    return pickups;
  }

  function collectPickup(jetPos, canCollectFn) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (!p.active) continue;
      if (canCollectFn && !canCollectFn(p)) continue;

      const dx = jetPos.x - p.x;
      const dy = jetPos.y - p.y;
      const dz = jetPos.z - p.z;
      let hit = false;
      if (p.type === 'missile') {
        // Sea-skimming / low pass collection requirement!
        hit = dx * dx + dz * dz <= 22 * 22 && jetPos.y <= p.y + 12.5 && jetPos.y >= p.y - 8.0;
      } else {
        hit = dx * dx + dy * dy + dz * dz <= 24 * 24;
      }
      if (hit) {
        p.active = false;
        scene.remove(p.group);
        pickups.splice(i, 1);
        return p;
      }
    }
    return null;
  }

  function consumePickupById(id) {
    const idx = pickups.findIndex((item) => item.id === id);
    if (idx < 0) return null;
    const p = pickups[idx];
    p.active = false;
    scene.remove(p.group);
    pickups.splice(idx, 1);
    return p;
  }

  function respawnSunkShips() {
    for (const sh of ships) {
      if (!sh.alive) {
        sh.alive = true;
        sh.respawnTimer = 0;
        sh.x = sh.originX;
        sh.z = sh.originZ;
        sh.angle = sh.originAng;
        sh.group.position.set(sh.x, WATER_LEVEL, sh.z);
        sh.group.rotation.y = sh.angle;
        sh.group.visible = true;
      }
    }
  }

  function checkObstacleCollision(pos, jetRadius = 2.6) {
    const th = getTerrainHeight(pos.x, pos.z);
    if (th > WATER_LEVEL - 0.5 && pos.y <= th + 2.2) {
      return { hit: true, type: 'mountain', reason: th > 38 ? 'MONTANHA' : 'TERRENO' };
    }
    if (pos.y <= WATER_LEVEL + 1.4) {
      return { hit: true, type: 'ocean', reason: 'OCEANO' };
    }

    const cx = Math.floor(pos.x / GRID);
    const cz = Math.floor(pos.z / GRID);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const list = grid.get(ix + ',' + iz);
        if (!list) continue;
        for (const o of list) {
          if (!o.alive) continue;
          const dx = o.x - pos.x;
          const dz = o.z - pos.z;
          const rad = (o.r || 3) * 0.85 + jetRadius;
          if (dx * dx + dz * dz > rad * rad) continue;
          if (pos.y >= o.y - 1.5 && pos.y <= o.y + (o.h || 6) + 1.2) {
            return {
              hit: true,
              type: o.type,
              reason: o.type === 'tree' ? 'ÁRVORE' : o.label || o.type.toUpperCase(),
              obj: o,
            };
          }
        }
      }
    }

    for (const sh of ships) {
      if (!sh.alive) continue;
      const dx = sh.x - pos.x;
      const dz = sh.z - pos.z;
      const rad = sh.r * 0.78 + jetRadius;
      if (dx * dx + dz * dz <= rad * rad && pos.y <= sh.h + 1.0) {
        return { hit: true, type: 'ship', reason: 'NAVIO', obj: sh };
      }
    }

    for (const bl of balloons) {
      if (!bl.alive) continue;
      const dx = bl.x - pos.x;
      const dy = bl.y + 6 - pos.y;
      const dz = bl.z - pos.z;
      const rad = bl.r * 0.78 + jetRadius;
      if (dx * dx + dy * dy + dz * dz <= rad * rad) {
        return { hit: true, type: 'balloon', reason: 'BALÃO', obj: bl };
      }
    }
    return null;
  }

  function applyCloudDensity(mode) {
    if (mode === 'clear') {
      cloudGroup.visible = false;
      for (let i = 0; i < MAX_CLOUDS; i++) {
        cloudShadowUniforms[i].set(99999, 99999, 1, 0);
      }
      return;
    }
    cloudGroup.visible = true;
    const light = mode === 'light';
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const vis = !light || (i % 2 === 0);
      c.mesh.visible = vis;
      if (!vis && c.shadowIndex >= 0) {
        cloudShadowUniforms[c.shadowIndex].set(99999, 99999, 1, 0);
      }
    }
  }

  function applyTerrainOptions(opts = {}) {
    const theme = TERRAIN_THEMES.includes(opts.theme) ? opts.theme : DEFAULT_TERRAIN_OPTIONS.theme;
    const deformMode = TERRAIN_DEFORM_MODES.includes(opts.deformMode) ? opts.deformMode : DEFAULT_TERRAIN_OPTIONS.deformMode;
    const cloudsMode = TERRAIN_CLOUD_MODES.includes(opts.clouds) ? opts.clouds : DEFAULT_TERRAIN_OPTIONS.clouds;

    terrainOptions.theme = theme;
    terrainOptions.deformMode = deformMode;
    terrainOptions.clouds = cloudsMode;

    const themeIdx = TERRAIN_THEMES.indexOf(theme);
    skyMat.uniforms.uTerrainTheme.value = themeIdx;
    terrainMat.uniforms.uTerrainTheme.value = themeIdx;
    waterMat.uniforms.uTerrainTheme.value = themeIdx;
    cloudMat.uniforms.uTerrainTheme.value = themeIdx;

    deformScale = deformMode === 'off' ? 0.0 : deformMode === 'deep' ? 1.5 : 1.0;
    applyCloudDensity(cloudsMode);

    return { ...terrainOptions };
  }

  function getTerrainOptions() {
    return { ...terrainOptions };
  }

  return {
    damage,
    deformTerrain,
    resetTerrain,
    applyTerrainOptions,
    getTerrainOptions,
    findLockTarget,
    getPickups,
    spawnDroppedPickup,
    collectPickup,
    consumePickupById,
    checkObstacleCollision,
    respawnSunkShips,
    getShips: () => ships,
    setTerrainGrain(v) {
      terrainMat.uniforms.uTerrainGrain.value = THREE.MathUtils.clamp(v, 0, 1);
    },
    addWaterRipple(x, z, time) {
      rippleUniforms[nextRippleIdx].set(x, z, time, 1.0);
      nextRippleIdx = (nextRippleIdx + 1) % MAX_RIPPLES;
    },
    update(time, camPos, dt) {
      skyMat.uniforms.uTime.value = time;
      terrainMat.uniforms.uCamPos.value.copy(camPos);
      terrainMat.uniforms.uTime.value = time;
      waterMat.uniforms.uTime.value = time;
      waterMat.uniforms.uCamPos.value.copy(camPos);
      cloudMat.uniforms.uCamPos.value.copy(camPos);

      // Drift clouds & update shadow casters
      for (const c of clouds) {
        c.mesh.position.x += c.speed * dt;
        if (c.mesh.position.x > 1250) c.mesh.position.x = -1250;
        if (c.shadowIndex >= 0 && cloudGroup.visible && c.mesh.visible) {
          const offX = -SUN_DIR.x * (c.mesh.position.y * 0.25);
          const offZ = -SUN_DIR.z * (c.mesh.position.y * 0.25);
          cloudShadowUniforms[c.shadowIndex].set(
            c.mesh.position.x + offX,
            c.mesh.position.z + offZ,
            c.shadowRadius,
            1.0
          );
        }
      }

      // Gently animate sailboats on the water
      for (let i = 0; i < boats.length; i++) {
        const b = boats[i];
        if (!b.alive) {
          boatHulls.setMatrixAt(i, ZERO_M);
          boatSails.setMatrixAt(i, ZERO_M);
          continue;
        }
        const nx = b.x + Math.sin(b.angle) * b.speed * dt;
        const nz = b.z + Math.cos(b.angle) * b.speed * dt;
        if (getTerrainHeight(nx, nz) < -4.0 && Math.abs(nx) < 1150 && Math.abs(nz) < 1150) {
          b.x = nx;
          b.z = nz;
        } else {
          b.angle += 1.6;
        }
        const bob = Math.sin(time * 2.1 + b.phase) * 0.22;
        dummy.position.set(b.x, WATER_LEVEL + 0.35 + bob, b.z);
        dummy.rotation.set(0, b.angle, Math.sin(time * 1.6 + b.phase) * 0.08);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        boatHulls.setMatrixAt(i, dummy.matrix);

        dummy.position.set(b.x, WATER_LEVEL + 3.1 + bob, b.z);
        dummy.updateMatrix();
        boatSails.setMatrixAt(i, dummy.matrix);
      }
      boatHulls.instanceMatrix.needsUpdate = true;
      boatSails.instanceMatrix.needsUpdate = true;

      // Animate & slowly respawn naval ships cruising the bay
      for (const sh of ships) {
        if (!sh.alive) {
          sh.respawnTimer -= dt;
          if (sh.respawnTimer <= 0) {
            sh.alive = true;
            sh.respawnTimer = 0;
            sh.x = sh.originX;
            sh.z = sh.originZ;
            sh.angle = sh.originAng;
            sh.group.position.set(sh.x, WATER_LEVEL, sh.z);
            sh.group.rotation.y = sh.angle;
            sh.group.visible = true;
          }
          continue;
        }
        const nx = sh.x + Math.sin(sh.angle) * sh.speed * dt;
        const nz = sh.z + Math.cos(sh.angle) * sh.speed * dt;
        if (getTerrainHeight(nx, nz) < -4.0 && Math.abs(nx) < 950 && Math.abs(nz) < 950) {
          sh.x = nx;
          sh.z = nz;
        } else {
          sh.angle += 1.4;
        }
        sh.group.position.set(sh.x, WATER_LEVEL + Math.sin(time * 1.5 + sh.phase) * 0.3, sh.z);
        sh.group.rotation.y = sh.angle;
      }

      // Rare floating target balloons: gentle drift + rare respawn in another spot
      for (const bl of balloons) {
        if (!bl.alive) {
          bl.respawnTimer -= dt;
          if (bl.respawnTimer <= 0) {
            const nextIdx = (bl.spotIdx + 3 + Math.floor(Math.random() * 5)) % balloonSpawnPool.length;
            const [bx, by, bz] = balloonSpawnPool[nextIdx];
            bl.spotIdx = nextIdx;
            bl.x = bx;
            bl.baseY = by;
            bl.y = by - 6;
            bl.z = bz;
            bl.group.position.set(bx, by, bz);
            bl.group.visible = true;
            bl.alive = true;
          }
          continue;
        }
        bl.x += bl.driftX * dt;
        bl.z += bl.driftZ * dt;
        if (Math.abs(bl.x) > 520) bl.driftX *= -1;
        if (Math.abs(bl.z) > 520) bl.driftZ *= -1;
        const by = bl.baseY + Math.sin(time * 1.1 + bl.phase) * 3.0;
        bl.y = by - 6;
        bl.group.position.set(bl.x, by, bl.z);
        bl.group.rotation.y += 0.25 * dt;
      }

      // Pulse lighthouse lamps
      for (const lb of lighthouseBeacons) {
        const pulse = 0.8 + 0.35 * Math.sin(time * 3.0 + lb.phase);
        lb.lamp.scale.setScalar(pulse);
      }

      // Animate & descend dropped pickups (pink-cross medkits & sea-skim missile crates)
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        p.life -= dt;
        if (!p.active || p.life <= 0) {
          scene.remove(p.group);
          pickups.splice(i, 1);
          continue;
        }
        if (p.falling) {
          p.y -= p.fallSpeed * dt;
          if (p.y <= p.targetY) {
            p.y = p.targetY;
            p.baseY = p.targetY;
            p.falling = false;
            if (p.chute) p.chute.visible = false;
          }
          p.group.position.y = p.y;
        } else {
          const bobAmp = p.type === 'missile' ? 0.65 : 1.6;
          p.y = p.baseY + Math.sin(time * 2.2 + p.phase) * bobAmp;
          p.group.position.y = p.y;
        }
        p.core.rotation.y += 1.4 * dt;
        p.ring.rotation.z -= 1.8 * dt;
      }
    },
  };
}

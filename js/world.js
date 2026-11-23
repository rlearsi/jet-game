import * as THREE from 'three';
import { SHIP_STYLES, createNavalFleetMeshes } from './ships/index.js?v=35';

export const WORLD_SIZE = 2800;
export const WATER_LEVEL = 0.0;
export const SUN_DIR = new THREE.Vector3(-0.62, 0.34, -0.71).normalize();

export const CHUNK_SIZE = 960;
export const CHUNK_SEGS = 96;
export const CHUNK_STRIDE = CHUNK_SEGS + 1;
export const CELL_SIZE = CHUNK_SIZE / CHUNK_SEGS; // 10m exact grid spacing
export const ACTIVE_CHUNK_RADIUS = 2; // 5x5 chunks loaded around camera/player (4800m x 4800m window)
export const DEFAULT_WORLD_SEED = 'SUNSET-2026';

export const TERRAIN_THEMES = ['sunset', 'tropical', 'volcanic', 'alpine'];
export const TERRAIN_DEFORM_MODES = ['normal', 'deep', 'off'];
export const TERRAIN_CLOUD_MODES = ['full', 'light', 'clear'];
export const DEFAULT_TERRAIN_OPTIONS = {
  theme: 'sunset',
  deformMode: 'normal',
  clouds: 'full',
  seed: DEFAULT_WORLD_SEED,
};

export function sanitizeSeedString(raw) {
  const s = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 16);
  return s || DEFAULT_WORLD_SEED;
}

export function seedToNumber(seedStr) {
  const clean = sanitizeSeedString(seedStr);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

export function generateRandomSeed() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) p1 += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) p2 += chars[Math.floor(Math.random() * chars.length)];
  return `${p1}-${p2}`;
}

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

function chunkSeedHash(seedNum, cx, cz, salt = 0) {
  let h = (seedNum ^ Math.imul(cx, 374761393) ^ Math.imul(cz, 668265263) ^ Math.imul(salt, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Active seed state & active chunk registry for fast global height queries
let currentSeedStr = DEFAULT_WORLD_SEED;
let currentSeedNum = seedToNumber(DEFAULT_WORLD_SEED);
let seedOffsetX = 0;
let seedOffsetZ = 0;
let activeWorldChunks = null; // Map<'cx,cz', ChunkRecord>
let globalDeformHistory = []; // Array<{ x, z, r, d, dx, dz }> so unloaded chunks re-apply craters when revisited!

function updateSeedOffsets(seedStr) {
  currentSeedStr = sanitizeSeedString(seedStr);
  currentSeedNum = seedToNumber(currentSeedStr);
  if (currentSeedStr === DEFAULT_WORLD_SEED) {
    seedOffsetX = 0;
    seedOffsetZ = 0;
  } else {
    const rng = mulberry32(currentSeedNum);
    seedOffsetX = (rng() - 0.5) * 20000.0;
    seedOffsetZ = (rng() - 0.5) * 20000.0;
  }
}
updateSeedOffsets(DEFAULT_WORLD_SEED);

export function getWorldSeed() {
  return currentSeedStr;
}

function writeTSMatrix(arr, index, x, y, z, sx, sy, sz) {
  const o = index * 16;
  arr[o] = sx;
  arr[o + 1] = 0;
  arr[o + 2] = 0;
  arr[o + 3] = 0;
  arr[o + 4] = 0;
  arr[o + 5] = sy;
  arr[o + 6] = 0;
  arr[o + 7] = 0;
  arr[o + 8] = 0;
  arr[o + 9] = 0;
  arr[o + 10] = sz;
  arr[o + 11] = 0;
  arr[o + 12] = x;
  arr[o + 13] = y;
  arr[o + 14] = z;
  arr[o + 15] = 1;
}

function writeYRotTransMatrix(arr, index, x, y, z, sinA, cosA) {
  const o = index * 16;
  arr[o] = cosA;
  arr[o + 1] = 0;
  arr[o + 2] = -sinA;
  arr[o + 3] = 0;
  arr[o + 4] = 0;
  arr[o + 5] = 1;
  arr[o + 6] = 0;
  arr[o + 7] = 0;
  arr[o + 8] = sinA;
  arr[o + 9] = 0;
  arr[o + 10] = cosA;
  arr[o + 11] = 0;
  arr[o + 12] = x;
  arr[o + 13] = y;
  arr[o + 14] = z;
  arr[o + 15] = 1;
}

function writeZeroMatrix(arr, index) {
  const o = index * 16;
  arr.fill(0, o, o + 16);
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function hash2Seed(x, z, sOff) {
  const s = Math.sin((x + sOff) * 127.1 + (z - sOff * 0.73) * 311.7) * 43758.5453123;
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
 * Deterministic macro-biome classifier shared between the terrain shader and 3D tree placement.
 * Separates the world into large, cohesive regions:
 *  - 'desert'  : golden/amber desert dunes & mesas (no trees)
 *  - 'jungle'  : lush green fields with layered shades of green (dense trees)
 *  - 'canyon'  : warm ochre/sandstone plateaus (no trees)
 *  - 'volcano' : dark basalt & ash caldera (no trees)
 *  - 'alpine'  : high mountain range with snow peaks
 */
export function getBiomeWeightsAt(x, z) {
  const dist = Math.hypot(x, z);
  const originFade = 1.0 - THREE.MathUtils.smoothstep(dist, 980.0, 1420.0);
  const outerFade = THREE.MathUtils.smoothstep(dist, 880.0, 1320.0);

  // Origin archipelago dedicated biome zones (distinct islands / peninsulas):
  // - NW: Volcanic Caldera (-720, -280)
  const origVolcano =
    THREE.MathUtils.smoothstep(-280.0, -540.0, x) *
    THREE.MathUtils.smoothstep(120.0, -140.0, z) *
    originFade;

  // - SW: Canyon Mesas (-580, 480)
  const origCanyon =
    THREE.MathUtils.smoothstep(-160.0, -420.0, x) *
    THREE.MathUtils.smoothstep(180.0, 420.0, z) *
    originFade;

  // - South / SE / Central-East peninsula & island: Golden Desert
  const origDesert =
    THREE.MathUtils.smoothstep(-180.0, 140.0, x) *
    THREE.MathUtils.smoothstep(40.0, 280.0, z) *
    (1.0 - THREE.MathUtils.smoothstep(380.0, 560.0, x)) *
    originFade;

  // Low-frequency macro noises for large, well-separated outer biomes (~1200m+ regions)
  const macroTemp = fbm(x * 0.00075 + 5.2, z * 0.00075 - 3.1, 3);
  const macroMoisture = fbm(x * 0.00078 - 8.4, z * 0.00078 + 6.7, 3);

  const procVolcano = (1.0 - THREE.MathUtils.smoothstep(0.22, 0.30, macroTemp)) * outerFade;
  const procCanyon =
    THREE.MathUtils.smoothstep(0.68, 0.77, macroTemp) *
    (1.0 - THREE.MathUtils.smoothstep(0.45, 0.56, macroMoisture)) *
    outerFade;

  const volcano = Math.min(1.0, origVolcano + procVolcano);
  const canyon = Math.min(1.0, (origCanyon + procCanyon) * (1.0 - volcano));

  // Desert vs Jungle macro separation (smooth, wide regions)
  const procDesert =
    THREE.MathUtils.smoothstep(0.47, 0.59, macroTemp) *
    (1.0 - THREE.MathUtils.smoothstep(0.44, 0.56, macroMoisture)) *
    outerFade;

  const desert = Math.min(1.0, (origDesert + procDesert) * (1.0 - volcano) * (1.0 - canyon));
  const jungle = Math.max(0.0, 1.0 - Math.min(1.0, volcano + canyon + desert));

  return { jungle, desert, canyon, volcano };
}

// Central archipelago mountain chain (keeps origin area iconic with bays, volcano, canyon, alpine range & airstrip)
const ORIGIN_MOUNTAINS = [
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

function computeOriginArchipelagoHeight(x, z, sx, sz) {
  const nLarge = fbm(sx * 0.0017 + 3.1, sz * 0.0017 - 1.7, 4);
  const nMed = fbm(sx * 0.0052 - 5.2, sz * 0.0052 + 4.3, 3);
  const nDetail = fbm(sx * 0.015 + 1.4, sz * 0.015 + 2.8, 2);
  const ridge = ridgeNoise(sx * 0.0048 + 2.0, sz * 0.0048 - 1.2);

  // Scenic interconnected turquoise bays
  const bay1 = Math.exp(-((x + 25) * (x + 25) + (z - 15) * (z - 15)) / (310 * 310));
  const bay2 = Math.exp(-((x - 270) * (x - 270) + (z - 220) * (z - 220)) / (245 * 245));
  const bay3 = Math.exp(-((x + 360) * (x + 360) + (z + 80) * (z + 80)) / (220 * 220));
  const bay4 = Math.exp(-((x - 80) * (x - 80) + (z + 420) * (z + 420)) / (230 * 230));

  let base = (nLarge * 0.72 + nMed * 0.28 - 0.45) * 105.0;
  base -= bay1 * 54.0 + bay2 * 40.0 + bay3 * 36.0 + bay4 * 38.0;

  for (let i = 0; i < ORIGIN_MOUNTAINS.length; i++) {
    const m = ORIGIN_MOUNTAINS[i];
    const dx = x - m.x;
    const dz = z - m.z;
    const d = Math.sqrt(dx * dx + dz * dz) / m.r;
    if (d < 1.0) {
      const falloff = Math.pow(1.0 - d * d, m.p);
      if (m.volcano) {
        const crater = d < 0.22 ? Math.pow(1.0 - d / 0.22, 1.5) * 0.42 : 0;
        base += (falloff - crater) * m.h * (0.82 + 0.34 * nMed);
      } else if (m.mesa) {
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

  return base;
}

/**
 * Infinite procedural archipelago heightmap (seeded) beyond the central core.
 * Generates endless island chains, navigable turquoise sea channels, alpine peaks,
 * volcanic calderas, and stepped terracotta canyon mesas in every direction!
 */
function computeInfiniteProceduralHeight(x, z) {
  const sx = x + seedOffsetX;
  const sz = z + seedOffsetZ;
  const sOff = (currentSeedNum % 9973) * 0.137;

  const nContinent = fbm(sx * 0.00072 + 1.9, sz * 0.00072 - 2.4, 4);
  const nArch = fbm(sx * 0.00185 - 3.7, sz * 0.00185 + 4.1, 4);
  const nMed = fbm(sx * 0.0052 + 2.3, sz * 0.0052 - 1.8, 3);
  const nDetail = fbm(sx * 0.015 - 1.1, sz * 0.015 + 2.6, 2);
  const ridge = ridgeNoise(sx * 0.0046 + 1.4, sz * 0.0046 - 2.1);

  // Macro-continents with larger land ratio (~72% land, ~28% wider seas/rivers, fewer tiny lakes)
  let base = (nContinent * 0.72 + nArch * 0.28 - 0.39) * 125.0;

  // Carve wider, sparser sea channels & rivers between landmasses
  const channelWave = Math.abs(noise2D(sx * 0.00065 + 7.2, sz * 0.00065 - 5.4) * 2.0 - 1.0);
  if (channelWave < 0.12) {
    const chDepth = (1.0 - channelWave / 0.12);
    base -= chDepth * chDepth * 34.0;
  }

  // Deterministic regional mountain peaks, volcanoes & canyon mesas on a 550m procedural macro-grid (+50% frequency)
  const CELL = 550.0;
  const gx = Math.floor(x / CELL);
  const gz = Math.floor(z / CELL);

  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx;
      const cz = gz + dz;
      const h1 = hash2Seed(cx * 1.37, cz * 2.41, sOff);
      if (h1 < 0.16) continue; // open water / bay cell

      const h2 = hash2Seed(cx * 3.11 + 5.2, cz * 1.73 - 2.9, sOff);
      const h3 = hash2Seed(cx * 2.07 - 7.1, cz * 4.19 + 1.3, sOff);

      const mx = (cx + 0.22 + h2 * 0.56) * CELL;
      const mz = (cz + 0.22 + h3 * 0.56) * CELL;
      const mr = 185.0 + h1 * 125.0;
      const d = Math.hypot(x - mx, z - mz) / mr;
      if (d >= 1.0) continue;

      const mh = 72.0 + h2 * 155.0;
      const falloff = Math.pow(1.0 - d * d, 1.42);

      if (h3 > 0.84) {
        // Volcanic caldera island
        const crater = d < 0.23 ? Math.pow(1.0 - d / 0.23, 1.5) * 0.44 : 0;
        base += (falloff - crater) * mh * (0.82 + 0.34 * nMed);
      } else if (h3 < 0.22) {
        // Stepped terracotta canyon mesa
        const raw = falloff * (68.0 + h2 * 75.0);
        const stepped = Math.floor(raw / 24.0) * 24.0 + Math.min(1.0, (raw % 24.0) / 7.0) * 24.0;
        base += THREE.MathUtils.lerp(raw, stepped, 0.74);
      } else {
        // Alpine ridged peak
        base += falloff * mh * (0.66 + 0.58 * ridge);
      }
    }
  }

  if (base > 0) {
    base += (nDetail - 0.5) * 12.5 * Math.min(1, base / 20.0);
  }
  return Math.max(-42.0, base);
}

/**
 * Procedural base heightmap at any infinite world coordinate (x, z) before player craters.
 * Preserves the exact central archipelago around (-1080..1080) and seamlessly blends into
 * infinite seeded procedural island chains beyond!
 */
export function getBaseTerrainHeight(x, z) {
  const distFromOrigin = Math.max(Math.abs(x), Math.abs(z));
  const sx = x + seedOffsetX * 0.08;
  const sz = z + seedOffsetZ * 0.08;

  if (distFromOrigin <= 1020) {
    return computeOriginArchipelagoHeight(x, z, sx, sz);
  }
  const procH = computeInfiniteProceduralHeight(x, z);
  if (distFromOrigin >= 1420) {
    return procH;
  }
  const origH = computeOriginArchipelagoHeight(x, z, sx, sz);
  const t = THREE.MathUtils.smoothstep(distFromOrigin, 1020, 1420);
  return THREE.MathUtils.lerp(origH, procH, t);
}

/**
 * Live terrain elevation at (x, z) with bilinear interpolation over active loaded chunks.
 * Reflects all holes, trenches, and craters blasted into mountains in real time!
 */
export function getTerrainHeight(x, z) {
  if (!activeWorldChunks || activeWorldChunks.size === 0) {
    return getBaseTerrainHeight(x, z);
  }
  const cx = Math.floor((x + CHUNK_SIZE * 0.5) / CHUNK_SIZE);
  const cz = Math.floor((z + CHUNK_SIZE * 0.5) / CHUNK_SIZE);
  const chunk = activeWorldChunks.get(cx + ',' + cz);
  if (!chunk || !chunk.liveHeights) {
    return getBaseTerrainHeight(x, z);
  }

  const lx = x - (cx * CHUNK_SIZE - CHUNK_SIZE * 0.5);
  const lz = z - (cz * CHUNK_SIZE - CHUNK_SIZE * 0.5);
  const gx = THREE.MathUtils.clamp((lx / CHUNK_SIZE) * CHUNK_SEGS, 0, CHUNK_SEGS - 0.0001);
  const gz = THREE.MathUtils.clamp((lz / CHUNK_SIZE) * CHUNK_SEGS, 0, CHUNK_SEGS - 0.0001);

  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const row0 = iz * CHUNK_STRIDE;
  const row1 = row0 + CHUNK_STRIDE;
  const lh = chunk.liveHeights;
  const h00 = lh[row0 + ix];
  const h10 = lh[row0 + ix + 1];
  const h01 = lh[row1 + ix];
  const h11 = lh[row1 + ix + 1];
  const top = h00 + (h10 - h00) * fx;
  const bot = h01 + (h11 - h01) * fx;
  return top + (bot - top) * fz;
}

const HEIGHT_TEX_SPAN = CHUNK_SIZE * (ACTIVE_CHUNK_RADIUS * 2 + 1); // 4800m sliding window

function createSlidingHeightTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return { tex, data, size, centerX: 0, centerZ: 0 };
}

function rebuildHeightTextureForWindow(heightTexObj, centerX, centerZ) {
  heightTexObj.centerX = centerX;
  heightTexObj.centerZ = centerZ;
  const { size, data, tex } = heightTexObj;
  for (let iz = 0; iz < size; iz++) {
    const z = centerZ + ((iz / (size - 1)) - 0.5) * HEIGHT_TEX_SPAN;
    for (let ix = 0; ix < size; ix++) {
      const x = centerX + ((ix / (size - 1)) - 0.5) * HEIGHT_TEX_SPAN;
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
  tex.needsUpdate = true;
}

function updateHeightTexturePatch(heightTexObj, wx, wz, radius) {
  const { size, data, tex, centerX, centerZ } = heightTexObj;
  const minX = ((wx - radius - CELL_SIZE - centerX) / HEIGHT_TEX_SPAN + 0.5) * (size - 1);
  const maxX = ((wx + radius + CELL_SIZE - centerX) / HEIGHT_TEX_SPAN + 0.5) * (size - 1);
  const minZ = ((wz - radius - CELL_SIZE - centerZ) / HEIGHT_TEX_SPAN + 0.5) * (size - 1);
  const maxZ = ((wz + radius + CELL_SIZE - centerZ) / HEIGHT_TEX_SPAN + 0.5) * (size - 1);

  const txMin = Math.max(0, Math.floor(minX));
  const txMax = Math.min(size - 1, Math.ceil(maxX));
  const tzMin = Math.max(0, Math.floor(minZ));
  const tzMax = Math.min(size - 1, Math.ceil(maxZ));
  if (txMin > txMax || tzMin > tzMax) return;

  for (let tz = tzMin; tz <= tzMax; tz++) {
    const z = centerZ + ((tz / (size - 1)) - 0.5) * HEIGHT_TEX_SPAN;
    for (let tx = txMin; tx <= txMax; tx++) {
      const x = centerX + ((tx / (size - 1)) - 0.5) * HEIGHT_TEX_SPAN;
      const h = getTerrainHeight(x, z);
      const norm = THREE.MathUtils.clamp((h + 50.0) / 300.0, 0.0, 1.0);
      const v = Math.round(norm * 255);
      const off = (tz * size + tx) * 4;
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
    }
  }
  tex.needsUpdate = true;
}

export function buildWorld(scene) {
  const rand = mulberry32(90210);
  const terrainOptions = { ...DEFAULT_TERRAIN_OPTIONS };
  let deformScale = 1.0;

  // Map of currently loaded chunks in memory: key 'cx,cz' -> ChunkData
  const loadedChunks = new Map();
  activeWorldChunks = loadedChunks;
  globalDeformHistory = [];

  // Persistent destroyed state across chunk unload/reload: chunkKey -> Set<localId>
  const destroyedChunkProps = new Map();

  const heightTexObj = createSlidingHeightTexture();
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
  let lastRippleAt = -999;

  // =========================================================================
  // 1. SUNSET SKY DOME (follows camera so player never reaches the sky edge!)
  // =========================================================================
  const skyGeo = new THREE.SphereGeometry(2800, 36, 24);
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
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  // =========================================================================
  // 2. DEFORMABLE MULTI-BIOME TERRAIN SHADER (shared across all procedural chunks!)
  // =========================================================================
  const terrainMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uCamPos: { value: new THREE.Vector3() },
      uClouds: { value: cloudShadowUniforms },
      uCloudCount: { value: MAX_CLOUDS },
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
      uniform int uCloudCount;
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

        vec2 pixCell = floor(p * 0.72);
        float rawStipple = hash(pixCell);
        float smoothCluster = noise(p * 0.08);
        float fineCluster = mix(smoothCluster, noise(floor(p * 0.22) * 0.55), uTerrainGrain * 0.65);
        float stipple = mix(smoothCluster, rawStipple, uTerrainGrain * 0.55);

        // Smooth macro noises for natural, cohesive terrain contours inside each biome
        float contourNoise = fbm(p * 0.0065 + vec2(2.1, -4.3));
        float detailContour = fbm(p * 0.014 - vec2(6.4, 1.9));

        // Regional macro-biome masks (matches getBiomeWeightsAt in JS so trees only spawn in Jungle!)
        float distOrigin = length(p);
        float originFade = 1.0 - smoothstep(980.0, 1420.0, distOrigin);
        float outerFade  = smoothstep(880.0, 1320.0, distOrigin);

        float origVolcano = smoothstep(-280.0, -540.0, p.x) * smoothstep(120.0, -140.0, p.y) * originFade;
        float origCanyon  = smoothstep(-160.0, -420.0, p.x) * smoothstep(180.0, 420.0, p.y) * originFade;
        float origDesert  = smoothstep(-180.0, 140.0, p.x) * smoothstep(40.0, 280.0, p.y) * (1.0 - smoothstep(380.0, 560.0, p.x)) * originFade;

        float macroTemp     = fbm(p * 0.00075 + vec2(5.2, -3.1));
        float macroMoisture = fbm(p * 0.00078 + vec2(-8.4, 6.7));

        float procVolcano = (1.0 - smoothstep(0.22, 0.30, macroTemp)) * outerFade;
        float procCanyon  = smoothstep(0.68, 0.77, macroTemp) * (1.0 - smoothstep(0.45, 0.56, macroMoisture)) * outerFade;
        float procDesert  = smoothstep(0.47, 0.59, macroTemp) * (1.0 - smoothstep(0.44, 0.56, macroMoisture)) * outerFade;

        float volcanoMask = clamp(origVolcano + procVolcano, 0.0, 1.0);
        float canyonMask  = clamp((origCanyon + procCanyon) * (1.0 - volcanoMask), 0.0, 1.0);
        float desertMask  = clamp((origDesert + procDesert) * (1.0 - volcanoMask) * (1.0 - canyonMask), 0.0, 1.0);
        float jungleMask  = clamp(1.0 - (volcanoMask + canyonMask + desertMask), 0.0, 1.0);

        // Cohesive biome palettes (no clashing confetti patches!)
        // 1. Coastal beach sand
        vec3 colSandLight    = vec3(0.92, 0.87, 0.62);
        vec3 colSandShade    = vec3(0.82, 0.76, 0.52);

        // 2. Jungle Biome: crisp pixel-art green tones matching the Tree1..4 sprites
        vec3 colJungleMeadow = vec3(0.35, 0.72, 0.34);
        vec3 colJungleMid    = vec3(0.22, 0.56, 0.33);
        vec3 colJungleDeep   = vec3(0.14, 0.42, 0.32);
        vec3 colJungleRidge  = vec3(0.10, 0.28, 0.25);

        // 3. Desert Biome: strictly golden & warm yellow-amber tones for dune depth
        vec3 colDesertPale   = vec3(0.95, 0.86, 0.52);
        vec3 colDesertGold   = vec3(0.90, 0.76, 0.38);
        vec3 colDesertAmber  = vec3(0.81, 0.65, 0.29);
        vec3 colDesertShadow = vec3(0.70, 0.54, 0.23);

        // 4. Canyon Plateau Biome: warm sandstone & ochre strata (uniform without neon spots)
        vec3 colCanyonSand   = vec3(0.86, 0.67, 0.44);
        vec3 colCanyonOchre  = vec3(0.78, 0.53, 0.33);
        vec3 colCanyonDeep   = vec3(0.66, 0.41, 0.26);

        // 5. Volcanic Biome: dark basalt, ash & caldera lava
        vec3 colBasalt       = vec3(0.28, 0.25, 0.34);
        vec3 colAsh          = vec3(0.42, 0.39, 0.47);
        vec3 colLava         = vec3(1.00, 0.46, 0.14);

        // 6. High Mountain Rock & Alpine Snow Peaks
        vec3 colRockLight    = vec3(0.68, 0.66, 0.68);
        vec3 colRockDark     = vec3(0.44, 0.42, 0.50);
        vec3 colSnow         = vec3(0.97, 0.98, 1.00);
        vec3 colSnowShade    = vec3(0.84, 0.89, 0.96);

        if (uTerrainTheme > 0.5 && uTerrainTheme < 1.5) {
          colSandLight    = vec3(0.96, 0.91, 0.68);
          colSandShade    = vec3(0.86, 0.80, 0.56);
          colJungleMeadow = vec3(0.50, 0.80, 0.36);
          colJungleMid    = vec3(0.26, 0.70, 0.36);
          colJungleDeep   = vec3(0.15, 0.52, 0.27);
          colJungleRidge  = vec3(0.10, 0.39, 0.21);
          colDesertPale   = vec3(0.97, 0.89, 0.58);
          colDesertGold   = vec3(0.92, 0.80, 0.42);
          colDesertAmber  = vec3(0.83, 0.69, 0.32);
        } else if (uTerrainTheme >= 1.5 && uTerrainTheme < 2.5) {
          colSandLight    = vec3(0.42, 0.34, 0.36);
          colSandShade    = vec3(0.28, 0.22, 0.26);
          colJungleMeadow = vec3(0.42, 0.48, 0.28);
          colJungleMid    = vec3(0.32, 0.38, 0.23);
          colJungleDeep   = vec3(0.22, 0.27, 0.18);
          colJungleRidge  = vec3(0.16, 0.20, 0.14);
          colDesertPale   = vec3(0.78, 0.62, 0.34);
          colDesertGold   = vec3(0.68, 0.50, 0.26);
          colDesertAmber  = vec3(0.56, 0.39, 0.20);
          colDesertShadow = vec3(0.44, 0.30, 0.16);
          colRockLight    = vec3(0.52, 0.44, 0.46);
          colRockDark     = vec3(0.28, 0.22, 0.28);
        } else if (uTerrainTheme >= 2.5) {
          colSandLight    = vec3(0.76, 0.79, 0.82);
          colSandShade    = vec3(0.62, 0.66, 0.72);
          colJungleMeadow = vec3(0.42, 0.62, 0.46);
          colJungleMid    = vec3(0.26, 0.50, 0.38);
          colJungleDeep   = vec3(0.17, 0.37, 0.29);
          colJungleRidge  = vec3(0.12, 0.28, 0.22);
          colRockLight    = vec3(0.70, 0.74, 0.80);
          colRockDark     = vec3(0.38, 0.44, 0.56);
        }

        // Crisp pixel-art stepped shoreline sand (no smooth gradient)
        float sandVal = contourNoise * 0.55 + rawStipple * 0.45;
        vec3 sandCol = mix(colSandShade, colSandLight, step(0.48, sandVal));

        // Build crisp Jungle Biome color (hard pixel-art steps matching tree greens, no smooth gradient)
        float jElevation = clamp((h - 4.0) / 62.0, 0.0, 1.0);
        float jPix = hash(floor(p * 0.45));
        float jDepth = clamp(contourNoise * 0.48 + detailContour * 0.24 + jElevation * 0.30 + (jPix - 0.5) * 0.22, 0.0, 1.0);
        vec3 jungleCol = mix(colJungleMeadow, colJungleMid, step(0.32, jDepth));
        jungleCol = mix(jungleCol, colJungleDeep, step(0.56, jDepth));
        jungleCol = mix(jungleCol, colJungleRidge, step(0.78, jDepth + slope * 0.30));

        // Build crisp Desert Biome color (stepped golden & amber pixel bands, no gradient)
        float duneWave = sin(p.x * 0.022 + p.y * 0.016 + contourNoise * 4.5) * 0.5 + 0.5;
        float dDepth = clamp(contourNoise * 0.45 + duneWave * 0.32 + slope * 0.40 + (rawStipple - 0.5) * 0.18, 0.0, 1.0);
        vec3 desertCol = mix(colDesertPale, colDesertGold, step(0.30, dDepth));
        desertCol = mix(desertCol, colDesertAmber, step(0.55, dDepth));
        desertCol = mix(desertCol, colDesertShadow, step(0.78, dDepth));

        // Build crisp Canyon Biome color (stepped sandstone strata)
        float strata = sin(h * 0.22 + contourNoise * 2.4) * 0.5 + 0.5;
        float cVal = clamp(strata + (rawStipple - 0.5) * 0.16, 0.0, 1.0);
        vec3 canyonCol = mix(colCanyonSand, colCanyonOchre, step(0.38, cVal));
        canyonCol = mix(canyonCol, colCanyonDeep, step(0.70, cVal + slope * 0.25));

        // Build crisp Volcanic Biome color
        float vVal = clamp(contourNoise * 0.65 + rawStipple * 0.35, 0.0, 1.0);
        vec3 volcCol = mix(colBasalt, colAsh, step(0.52, vVal));
        float dCaldera = length(p - vec2(-720.0, -280.0));
        float lavaPulse = 0.75 + 0.25 * sin(uTime * 2.2 + dCaldera * 0.15);
        if ((dCaldera < 62.0 || (volcanoMask > 0.6 && h > 115.0 && slope < 0.28)) && h > 85.0 && stipple > 0.52) {
          volcCol = mix(volcCol, colLava * lavaPulse, 0.78);
        }

        // Combine distinct biomes cleanly above the shoreline beach
        float inlandMask = step(4.8, h + (contourNoise - 0.5) * 2.5 + (rawStipple - 0.5) * 1.4);
        vec3 biomeSurface =
          jungleCol * jungleMask +
          desertCol * desertMask +
          canyonCol * canyonMask +
          volcCol * volcanoMask;
        vec3 baseCol = mix(sandCol, biomeSurface, inlandMask);

        // High mountain rock slopes & sub-peak cliffs (stepped pixel transition)
        float rockMask = smoothstep(54.0, 82.0, h) + smoothstep(0.27, 0.45, slope) * smoothstep(18.0, 36.0, h);
        rockMask = clamp(rockMask, 0.0, 1.0) * (1.0 - canyonMask * 0.75) * (1.0 - volcanoMask * 0.75) * (1.0 - desertMask * 0.45);
        if (rockMask > 0.02) {
          vec3 rock = mix(colRockDark, colRockLight, step(0.48, contourNoise * 0.6 + rawStipple * 0.4));
          baseCol = mix(baseCol, rock, step(0.42, rockMask + (rawStipple - 0.5) * 0.22));
        }

        // Snow caps on the highest mountain peaks (stepped pixel edge)
        float snowLine = 74.0 + (contourNoise - 0.5) * 14.0 - slope * 12.0;
        float snowZoneMask = (1.0 - volcanoMask * 0.92) * (1.0 - canyonMask * 0.85);
        if (uTerrainTheme >= 2.5) {
          snowLine = 26.0 + (contourNoise - 0.5) * 12.0 - slope * 10.0;
          snowZoneMask = 1.0;
        } else if (uTerrainTheme >= 1.5) {
          snowLine = 115.0 + (contourNoise - 0.5) * 14.0 - slope * 14.0;
        }
        float snowMask = step(snowLine, h + (rawStipple - 0.5) * 6.0) * step(0.5, snowZoneMask);
        vec3 snowTone = mix(colSnowShade, colSnow, step(0.48, N.y * 0.65 + rawStipple * 0.35));
        baseCol = mix(baseCol, snowTone, snowMask);

        if (vScorch > 0.04) {
          vec3 craterRock = mix(vec3(0.24, 0.20, 0.28), vec3(0.46, 0.36, 0.38), step(0.45, stipple * 0.65 + fineCluster * 0.35));
          float scorchEdge = step(1.0 - clamp(vScorch * 1.15, 0.0, 1.0), stipple * 0.55 + 0.25);
          baseCol = mix(baseCol, craterRock, clamp(vScorch * 0.85 + scorchEdge * 0.35, 0.0, 1.0));
          if (vScorch > 0.68 && stipple > 0.76) {
            float emberPulse = 0.7 + 0.3 * sin(uTime * 4.5 + p.x * 0.2);
            baseCol = mix(baseCol, vec3(1.0, 0.45, 0.14) * emberPulse, (vScorch - 0.68) * 2.2);
          }
        }

        float ndl = dot(N, uSunDir);
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

        float dist = length(uCamPos - vWorldPos);
        if (uCloudCount > 0 && dist < 1850.0) {
          float cloudDark = 0.0;
          for (int i = 0; i < ${MAX_CLOUDS}; i++) {
            if (i >= uCloudCount) break;
            vec2 cd = p - uClouds[i].xy;
            float r = uClouds[i].z;
            float d2 = dot(cd, cd) / (r * r);
            cloudDark = max(cloudDark, 1.0 - smoothstep(0.55, 1.05, d2));
          }
          col = mix(col, col * vec3(0.58, 0.56, 0.74), cloudDark * 0.65);
        }

        float fog = smoothstep(420.0, 1850.0, dist);
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  // =========================================================================
  // 3. INFINITE SUNSET OCEAN (follows camera with sliding heightTex window)
  // =========================================================================
  const waterGeo = new THREE.PlaneGeometry(5400, 5400, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
      uCamPos: { value: new THREE.Vector3() },
      uHeightTex: { value: heightTex },
      uHeightTexCenter: { value: new THREE.Vector2(0, 0) },
      uHeightTexSpan: { value: HEIGHT_TEX_SPAN },
      uClouds: { value: cloudShadowUniforms },
      uCloudCount: { value: MAX_CLOUDS },
      uRipples: { value: rippleUniforms },
      uRippleCount: { value: 0 },
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
      uniform vec2 uHeightTexCenter;
      uniform float uHeightTexSpan;
      uniform vec4 uClouds[${MAX_CLOUDS}];
      uniform int uCloudCount;
      uniform vec4 uRipples[${MAX_RIPPLES}];
      uniform int uRippleCount;
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
        vec2 uv = ((p - uHeightTexCenter) / uHeightTexSpan) + 0.5;

        float hNorm = 0.1;
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

        float reefN = noise(p * 0.035);
        vec3 shallowBase = mix(cShallow, cCoral, smoothstep(0.55, 0.78, reefN) * smoothstep(10.0, 2.0, depth));

        vec3 col = mix(shallowBase, cMid, smoothstep(2.0, 14.0, depth));
        col = mix(col, cDeep, smoothstep(12.0, 32.0, depth));

        float shoreWave = sin(depth * 2.0 - uTime * 2.4 + noise(p * 0.07) * 4.5);
        float foamEdge = smoothstep(2.6, 0.25, depth);
        float foamRibbon = smoothstep(0.45, 0.85, shoreWave) * smoothstep(6.0, 1.2, depth) * 0.55;
        col = mix(col, cFoam, clamp(foamEdge * 0.92 + foamRibbon, 0.0, 1.0));

        float distCam = length(uCamPos - vWorldPos);

        if (uCloudCount > 0 && distCam < 1920.0) {
          float cloudShadow = 0.0;
          for (int i = 0; i < ${MAX_CLOUDS}; i++) {
            if (i >= uCloudCount) break;
            vec2 cd = p - uClouds[i].xy;
            float r = uClouds[i].z;
            float d2 = dot(cd, cd) / (r * r);
            cloudShadow = max(cloudShadow, 1.0 - smoothstep(0.68, 0.98, d2));
          }
          col = mix(col, vec3(0.22, 0.27, 0.45), cloudShadow * 0.64);
        }

        if (distCam < 920.0) {
          vec2 sparkGrid = floor(p * 0.32);
          float tStep = floor(uTime * 3.5 + hash(sparkGrid) * 10.0);
          float sp = hash(sparkGrid + vec2(tStep * 1.31, tStep * 0.73));
          float sparkFade = 1.0 - smoothstep(280.0, 920.0, distCam);
          float sparkle = step(0.978, sp) * sparkFade;
          col = mix(col, vec3(0.96, 0.98, 0.95), sparkle * 0.92);

          if (distCam < 520.0) {
            vec2 waveCell = floor(vec2(p.x * 0.13 + uTime * 0.35, p.y * 0.26));
            if (hash(waveCell) > 0.989) {
              col = mix(col, vec3(0.84, 0.94, 0.96), 0.72);
            }
          }
        }

        if (uRippleCount > 0 && distCam < 1800.0) {
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            if (i >= uRippleCount) break;
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
        }

        float fog = smoothstep(450.0, 1920.0, distCam);
        col = mix(col, fogCol, fog);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = WATER_LEVEL;
  waterMesh.frustumCulled = false;
  scene.add(waterMesh);

  // =========================================================================
  // 4. SHARED GEOMETRIES, MATERIALS & SPATIAL HASH REGISTRY FOR CHUNK OBJECTS
  // =========================================================================
  const dummy = new THREE.Object3D();
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  const GRID = 48;
  const grid = new Map();
  const dirtyMeshes = new Set();
  const lockableTargets = [];
  const lighthouseBeacons = [];

  function registerDestructible(obj, lockable = false) {
    const key = Math.floor(obj.x / GRID) + ',' + Math.floor(obj.z / GRID);
    obj._gridKey = key;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(obj);
    if (lockable) lockableTargets.push(obj);
  }

  function unregisterDestructible(obj) {
    if (obj._gridKey) {
      const list = grid.get(obj._gridKey);
      if (list) {
        const idx = list.indexOf(obj);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) grid.delete(obj._gridKey);
      }
    }
    const lIdx = lockableTargets.indexOf(obj);
    if (lIdx >= 0) lockableTargets.splice(lIdx, 1);
  }

  const treeGeo = new THREE.PlaneGeometry(1, 1);
  treeGeo.translate(0, 0.45, 0);

  const spriteTexLoader = new THREE.TextureLoader();
  function loadPixelBillboardTexture(relPath) {
    const resolvedUrl = new URL(`../${relPath}`, import.meta.url).href;
    const tex = spriteTexLoader.load(resolvedUrl);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    return tex;
  }

  const billboardSpriteUniforms = [];
  function createBillboardSpriteMaterial(tex, frames = 1, fps = 8.0, alphaTest = 0.25, cloudShading = false) {
    const u = {
      uMap: { value: tex },
      uTime: { value: 0 },
      uFrames: { value: frames },
      uFps: { value: fps },
      uCamPos: { value: new THREE.Vector3() },
      uTerrainTheme: { value: 0.0 },
    };
    billboardSpriteUniforms.push(u);

    return new THREE.ShaderMaterial({
      uniforms: u,
      transparent: cloudShading,
      depthWrite: !cloudShading,
      side: THREE.DoubleSide,
      vertexShader: `
        attribute float aPhase;
        uniform vec3 uCamPos;
        varying vec2 vUv;
        varying float vPhase;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vPhase = aPhase;

          vec3 centerWorld = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);

          // Cylindrical Y-axis billboard facing camera horizontally
          vec3 toCam = uCamPos - centerWorld;
          toCam.y = 0.0;
          float len = length(toCam);
          vec3 fwd = len > 0.001 ? (toCam / len) : vec3(0.0, 0.0, 1.0);
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
          vec3 up = vec3(0.0, 1.0, 0.0);

          vec3 worldPos = centerWorld + right * (position.x * sx) + up * (position.y * sy);
          vWorldPos = worldPos;
          gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uTime;
        uniform float uFrames;
        uniform float uFps;
        uniform vec3 uCamPos;
        uniform float uTerrainTheme;
        varying vec2 vUv;
        varying float vPhase;
        varying vec3 vWorldPos;

        void main() {
          float frame = 0.0;
          if (uFrames > 1.5) {
            frame = mod(floor(uTime * uFps + vPhase * uFrames), uFrames);
          }
          vec2 uv = vec2((vUv.x + frame) / uFrames, vUv.y);
          vec4 texel = texture2D(uMap, uv);
          if (texel.a < ${alphaTest.toFixed(2)}) discard;

          vec3 col = texel.rgb;
          vec3 fogCol = vec3(0.94, 0.83, 0.72);
          vec3 themeTint = vec3(1.03, 0.98, 0.94);
          if (uTerrainTheme > 0.5 && uTerrainTheme < 1.5) {
            fogCol = vec3(0.92, 0.89, 0.78);
            themeTint = vec3(1.04, 1.03, 0.98);
          } else if (uTerrainTheme >= 1.5 && uTerrainTheme < 2.5) {
            fogCol = vec3(0.56, 0.32, 0.28);
            themeTint = vec3(1.05, 0.82, 0.72);
          } else if (uTerrainTheme >= 2.5) {
            fogCol = vec3(0.84, 0.86, 0.95);
            themeTint = vec3(0.96, 1.00, 1.06);
          }
          col *= themeTint;

          float dist = length(uCamPos - vWorldPos);
          float fog = smoothstep(${cloudShading ? '580.0, 2050.0' : '420.0, 1850.0'}, dist);
          col = mix(col, fogCol, fog);

          gl_FragColor = vec4(col, ${cloudShading ? 'texel.a' : '1.0'});
        }
      `,
    });
  }

  // 4 Animated Tree Billboards (8 frames each) + 4 Matching Stump Billboards when destroyed
  const treeDefs = [
    {
      treeMat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Trees/Tree1.png'), 8, 7.5),
      stumpMat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Trees/Stump 1.png'), 1, 0),
      aspect: 192 / 256,
      baseH: 18.5,
      color: 0x387a38,
    },
    {
      treeMat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Trees/Tree2.png'), 8, 7.5),
      stumpMat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Trees/Stump 2.png'), 1, 0),
      aspect: 192 / 256,
      baseH: 19.5,
      color: 0x438a40,
    },
    {
      treeMat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Trees/Tree3.png'), 8, 7.0),
      stumpMat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Trees/Stump 3.png'), 1, 0),
      aspect: 192 / 192,
      baseH: 16.0,
      color: 0x529947,
    },
    {
      treeMat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Trees/Tree4.png'), 8, 7.0),
      stumpMat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Trees/Stump 4.png'), 1, 0),
      aspect: 192 / 192,
      baseH: 15.8,
      color: 0xd4a438,
    },
  ];

  // 4 Animated Bush Billboards (8 frames each, 128x128 per frame)
  const bushDefs = [
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Bushes/Bushe1.png'), 8, 7.0), baseW: 11.5, baseH: 11.5, color: 0x438a40 },
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Bushes/Bushe2.png'), 8, 7.0), baseW: 10.5, baseH: 10.5, color: 0x387a38 },
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Bushes/Bushe3.png'), 8, 7.5), baseW: 11.2, baseH: 11.2, color: 0x296333 },
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Bushes/Bushe4.png'), 8, 7.5), baseW: 10.2, baseH: 10.2, color: 0x31703a },
  ];

  // 4 Land Rock Billboards (single frame 64x64)
  const rockDefs = [
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Rocks/Rock1.png'), 1, 0), baseW: 4.8, baseH: 4.8, color: 0x668488 },
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Rocks/Rock2.png'), 1, 0), baseW: 5.2, baseH: 5.2, color: 0x668488 },
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Rocks/Rock3.png'), 1, 0), baseW: 5.0, baseH: 5.0, color: 0x5c7a7e },
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Rocks/Rock4.png'), 1, 0), baseW: 5.8, baseH: 5.8, color: 0x5c7a7e },
  ];

  // 4 Animated Water Rock Billboards (16 frames each, 64x64 per frame with animated foam waves)
  const waterRockDefs = [
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Rocks in the Water/Water Rocks_01.png'), 16, 10.0), baseW: 7.5, baseH: 7.5, color: 0x729ca2 },
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Rocks in the Water/Water Rocks_02.png'), 16, 10.0), baseW: 8.2, baseH: 8.2, color: 0x729ca2 },
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Rocks in the Water/Water Rocks_03.png'), 16, 10.0), baseW: 7.9, baseH: 7.9, color: 0x729ca2 },
    { mat: createBillboardSpriteMaterial(loadPixelBillboardTexture('assets/Rocks in the Water/Water Rocks_04.png'), 16, 10.0), baseW: 9.0, baseH: 9.0, color: 0x729ca2 },
  ];

  // 8 Cloud Sprite Billboards (576x256)
  const cloudSpriteGeo = new THREE.PlaneGeometry(1, 1);
  const cloudSpriteMats = [];
  for (let ci = 1; ci <= 8; ci++) {
    const num = String(ci).padStart(2, '0');
    cloudSpriteMats.push(
      createBillboardSpriteMaterial(loadPixelBillboardTexture(`assets/Clouds/Clouds_${num}.png`), 1, 0, 0.08, true)
    );
  }

  const houseWallsGeo = new THREE.BoxGeometry(4.4, 3.2, 4.4);
  const houseRoofGeo = new THREE.ConeGeometry(3.6, 2.2, 4);
  houseRoofGeo.rotateY(Math.PI / 4);
  const houseWallMat = new THREE.MeshLambertMaterial({ color: 0xf2e4cc, flatShading: true });
  const houseRoofMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const roofPalette = [0xc94d34, 0xb83e2e, 0xd46a3b, 0x4b5c78];

  const lhWhiteMat = new THREE.MeshLambertMaterial({ color: 0xf7f2e8, flatShading: true });
  const lhRedMat = new THREE.MeshLambertMaterial({ color: 0xd94534, flatShading: true });
  const lhLampMat = new THREE.MeshBasicMaterial({ color: 0xfff08a });
  const lhBaseGeo = new THREE.CylinderGeometry(1.6, 2.4, 7.5, 6);
  const lhStripeGeo = new THREE.CylinderGeometry(1.25, 1.6, 4.5, 6);
  const lhLampGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);
  const lhCapGeo = new THREE.ConeGeometry(1.7, 2.0, 6);

  const runwayGeo = new THREE.BoxGeometry(20, 0.4, 132);
  const runwayMat = new THREE.MeshLambertMaterial({ color: 0x343746 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf7efe0 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb84a });
  const dashGeo = new THREE.BoxGeometry(1.1, 0.48, 6.5);
  const rLightGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const towerGeo = new THREE.BoxGeometry(6, 13, 6);
  const towerCabGeo = new THREE.BoxGeometry(7.8, 3.2, 7.8);
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0x7e889c, flatShading: true });
  const hangarBodyGeo = new THREE.BoxGeometry(15, 7.5, 20);
  const hangarRoofGeo = new THREE.CylinderGeometry(7.6, 7.6, 20, 6, 1, false, 0, Math.PI);
  const tankMat = new THREE.MeshLambertMaterial({ color: 0xdf4b36, flatShading: true });
  const tankGeo = new THREE.CylinderGeometry(3.8, 3.8, 7.2, 8);

  // =========================================================================
  // 4A. PROCEDURAL CHUNK BUILDER & UNLOADER (CULLS DISTANT CHUNKS FROM MEMORY!)
  // =========================================================================
  const ORIGIN_VILLAGES = [
    { x: 196, z: -112 },
    { x: 252, z: -84 },
    { x: -252, z: -168 },
    { x: -140, z: -252 },
    { x: -168, z: 224 },
    { x: -252, z: 140 },
  ];
  const ORIGIN_LIGHTHOUSES = [
    [168, -140],
    [224, -84],
    [-196, 140],
    [-168, -224],
    [-280, -84],
    [-112, 280],
    [196, -224],
    [-84, -308],
  ];

  function applyCraterToChunkData(chunk, cxWorld, czWorld, effRadius, effDepth, updateNormalsAndTex = true) {
    const rSq = effRadius * effRadius;
    if (
      cxWorld + effRadius < chunk.minX - CELL_SIZE ||
      cxWorld - effRadius > chunk.maxX + CELL_SIZE ||
      czWorld + effRadius < chunk.minZ - CELL_SIZE ||
      czWorld - effRadius > chunk.maxZ + CELL_SIZE
    ) {
      return false;
    }

    const gxCenter = ((cxWorld - chunk.minX) / CHUNK_SIZE) * CHUNK_SEGS;
    const gzCenter = ((czWorld - chunk.minZ) / CHUNK_SIZE) * CHUNK_SEGS;
    const cellRadius = Math.ceil(effRadius / CELL_SIZE) + 1;

    const ixMin = Math.max(0, Math.floor(gxCenter - cellRadius));
    const ixMax = Math.min(CHUNK_SEGS, Math.ceil(gxCenter + cellRadius));
    const izMin = Math.max(0, Math.floor(gzCenter - cellRadius));
    const izMax = Math.min(CHUNK_SEGS, Math.ceil(gzCenter + cellRadius));
    if (ixMin > ixMax || izMin > izMax) return false;

    let changed = false;
    const { liveHeights, scorchData, posAttr, normAttr, scorchAttr } = chunk;

    for (let iz = izMin; iz <= izMax; iz++) {
      const vz = chunk.minZ + (iz / CHUNK_SEGS) * CHUNK_SIZE;
      const dz = vz - czWorld;
      const row = iz * CHUNK_STRIDE;
      for (let ix = ixMin; ix <= ixMax; ix++) {
        const vx = chunk.minX + (ix / CHUNK_SEGS) * CHUNK_SIZE;
        const dx = vx - cxWorld;
        const dSq = dx * dx + dz * dz;
        if (dSq >= rSq) continue;

        const t = Math.sqrt(dSq) / effRadius;
        const idx = row + ix;
        if (effDepth <= 0.001) {
          const nextScorch = Math.min(1.0, scorchData[idx] + Math.pow(1.0 - t, 0.72) * 0.65);
          if (nextScorch > scorchData[idx] + 0.005) {
            scorchData[idx] = nextScorch;
            changed = true;
          }
          continue;
        }
        const cragVar = 0.84 + 0.32 * hash2(vx * 0.17, vz * 0.23);
        const carve = Math.pow(1.0 - t * t, 1.35) * effDepth * cragVar;

        // Nunca escava terra firme abaixo do nível da água (impede criação de novos lagos)
        const minFloor = liveHeights[idx] > WATER_LEVEL + 0.6 ? WATER_LEVEL + 0.6 : -34.0;
        const newH = Math.max(minFloor, liveHeights[idx] - carve);
        if (newH < liveHeights[idx] - 0.01) {
          liveHeights[idx] = newH;
          posAttr.setY(idx, newH);
          scorchData[idx] = Math.min(1.0, scorchData[idx] + Math.pow(1.0 - t, 0.72) * 1.18);
          changed = true;
        }
      }
    }

    if (!changed) return false;
    posAttr.needsUpdate = true;
    scorchAttr.needsUpdate = true;

    if (updateNormalsAndTex) {
      const nxMin = Math.max(0, ixMin - 1);
      const nxMax = Math.min(CHUNK_SEGS, ixMax + 1);
      const nzMin = Math.max(0, izMin - 1);
      const nzMax = Math.min(CHUNK_SEGS, izMax + 1);
      const twoCell = CELL_SIZE * 2.0;

      for (let iz = nzMin; iz <= nzMax; iz++) {
        const row = iz * CHUNK_STRIDE;
        const vz = chunk.minZ + (iz / CHUNK_SEGS) * CHUNK_SIZE;
        for (let ix = nxMin; ix <= nxMax; ix++) {
          const idx = row + ix;
          const vx = chunk.minX + (ix / CHUNK_SEGS) * CHUNK_SIZE;
          const hL = ix > 0 ? liveHeights[idx - 1] : getTerrainHeight(vx - CELL_SIZE, vz);
          const hR = ix < CHUNK_SEGS ? liveHeights[idx + 1] : getTerrainHeight(vx + CELL_SIZE, vz);
          const hU = iz > 0 ? liveHeights[idx - CHUNK_STRIDE] : getTerrainHeight(vx, vz - CELL_SIZE);
          const hD = iz < CHUNK_SEGS ? liveHeights[idx + CHUNK_STRIDE] : getTerrainHeight(vx, vz + CELL_SIZE);
          const nx = hL - hR;
          const ny = twoCell;
          const nz = hU - hD;
          const invLen = 1.0 / Math.hypot(nx, ny, nz);
          normAttr.setXYZ(idx, nx * invLen, ny * invLen, nz * invLen);
        }
      }
      normAttr.needsUpdate = true;
    }

    return true;
  }

  function createChunk(cx, cz) {
    const key = cx + ',' + cz;
    const minX = cx * CHUNK_SIZE - CHUNK_SIZE * 0.5;
    const maxX = minX + CHUNK_SIZE;
    const minZ = cz * CHUNK_SIZE - CHUNK_SIZE * 0.5;
    const maxZ = minZ + CHUNK_SIZE;
    const centerX = cx * CHUNK_SIZE;
    const centerZ = cz * CHUNK_SIZE;

    const liveHeights = new Float32Array(CHUNK_STRIDE * CHUNK_STRIDE);
    const baseHeights = new Float32Array(CHUNK_STRIDE * CHUNK_STRIDE);
    const scorchData = new Float32Array(CHUNK_STRIDE * CHUNK_STRIDE);

    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGS, CHUNK_SEGS);
    geo.rotateX(-Math.PI / 2);
    const posAttr = geo.attributes.position;

    for (let iz = 0; iz <= CHUNK_SEGS; iz++) {
      const wz = minZ + (iz / CHUNK_SEGS) * CHUNK_SIZE;
      const row = iz * CHUNK_STRIDE;
      for (let ix = 0; ix <= CHUNK_SEGS; ix++) {
        const wx = minX + (ix / CHUNK_SEGS) * CHUNK_SIZE;
        const h = getBaseTerrainHeight(wx, wz);
        const idx = row + ix;
        liveHeights[idx] = h;
        baseHeights[idx] = h;
        posAttr.setY(idx, h);
      }
    }

    const scorchAttr = new THREE.BufferAttribute(scorchData, 1);
    geo.setAttribute('aScorch', scorchAttr);

    // Compute seamless normals using analytical/world height neighbors across chunk borders
    const normArr = new Float32Array(CHUNK_STRIDE * CHUNK_STRIDE * 3);
    const twoCell = CELL_SIZE * 2.0;
    for (let iz = 0; iz <= CHUNK_SEGS; iz++) {
      const wz = minZ + (iz / CHUNK_SEGS) * CHUNK_SIZE;
      const row = iz * CHUNK_STRIDE;
      for (let ix = 0; ix <= CHUNK_SEGS; ix++) {
        const wx = minX + (ix / CHUNK_SEGS) * CHUNK_SIZE;
        const idx = row + ix;
        const hL = ix > 0 ? liveHeights[idx - 1] : getBaseTerrainHeight(wx - CELL_SIZE, wz);
        const hR = ix < CHUNK_SEGS ? liveHeights[idx + 1] : getBaseTerrainHeight(wx + CELL_SIZE, wz);
        const hU = iz > 0 ? liveHeights[idx - CHUNK_STRIDE] : getBaseTerrainHeight(wx, wz - CELL_SIZE);
        const hD = iz < CHUNK_SEGS ? liveHeights[idx + CHUNK_STRIDE] : getBaseTerrainHeight(wx, wz + CELL_SIZE);
        const nx = hL - hR;
        const ny = twoCell;
        const nz = hU - hD;
        const invLen = 1.0 / Math.hypot(nx, ny, nz);
        const nOff = idx * 3;
        normArr[nOff] = nx * invLen;
        normArr[nOff + 1] = ny * invLen;
        normArr[nOff + 2] = nz * invLen;
      }
    }
    const normAttr = new THREE.BufferAttribute(normArr, 3);
    geo.setAttribute('normal', normAttr);

    const mesh = new THREE.Mesh(geo, terrainMat);
    mesh.position.set(centerX, 0, centerZ);
    scene.add(mesh);

    const chunk = {
      key,
      cx,
      cz,
      minX,
      maxX,
      minZ,
      maxZ,
      centerX,
      centerZ,
      geo,
      mesh,
      liveHeights,
      baseHeights,
      scorchData,
      posAttr,
      normAttr,
      scorchAttr,
      propMeshes: [],
      destructibles: [],
      beacons: [],
    };

    // Re-apply any craters previously blasted in this chunk before it was unloaded
    if (globalDeformHistory.length > 0) {
      let anyCrater = false;
      for (let i = 0; i < globalDeformHistory.length; i++) {
        const d = globalDeformHistory[i];
        if (applyCraterToChunkData(chunk, d.cxWorld, d.czWorld, d.effRadius, d.effDepth, false)) {
          anyCrater = true;
        }
      }
      if (anyCrater) {
        geo.computeVertexNormals();
      }
    }

    if (!destroyedChunkProps.has(key)) {
      destroyedChunkProps.set(key, new Set());
    }
    const deadSet = destroyedChunkProps.get(key);
    const cRand = mulberry32(chunkSeedHash(currentSeedNum, cx, cz, 41));

    function markChunkPropDead(localId) {
      deadSet.add(localId);
    }

    // 1. Chunk Biome Animated Billboard Trees + Stumps (ONLY placed in Jungle biome below the snowline!)
    const maxChunkTrees = (cx === 0 && cz === 0) ? 240 : 165;
    const treeBuckets = [[], [], [], []];
    let totalPlacedTrees = 0;
    let tAttempts = 0;
    while (totalPlacedTrees < maxChunkTrees && tAttempts < maxChunkTrees * 8) {
      tAttempts++;
      const tx = minX + cRand() * CHUNK_SIZE;
      const tz = minZ + cRand() * CHUNK_SIZE;
      if (Math.abs(tx + 215) < 58 && Math.abs(tz - 225) < 110) continue; // skip airstrip
      const ty = getBaseTerrainHeight(tx, tz);
      // Trees only grow above the beach and below the rocky/snowy mountain peaks
      if (ty < 5.5 || ty > 66.0) continue;

      const biomes = getBiomeWeightsAt(tx, tz);
      // Strict biome separation: NO trees in Desert, Canyon, or Volcano biomes!
      if (biomes.jungle < 0.62) continue;

      const s = 0.85 + cRand() * 0.72;
      const phase = cRand();
      let variantIdx;
      if (ty > 42) {
        variantIdx = cRand() < 0.65 ? 0 : 1; // pines at higher elevations
      } else {
        const rVar = cRand();
        variantIdx = rVar < 0.28 ? 0 : rVar < 0.56 ? 1 : rVar < 0.84 ? 2 : 3;
      }
      const localId = `t_${totalPlacedTrees++}`;
      treeBuckets[variantIdx].push({ tx, ty, tz, s, phase, localId });
    }

    for (let vIdx = 0; vIdx < treeDefs.length; vIdx++) {
      const list = treeBuckets[vIdx];
      if (list.length === 0) continue;
      const def = treeDefs[vIdx];

      const tGeo = treeGeo.clone();
      const sGeo = treeGeo.clone();
      const phases = new Float32Array(list.length);
      for (let i = 0; i < list.length; i++) phases[i] = list[i].phase;
      tGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
      sGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1));

      const treesMesh = new THREE.InstancedMesh(tGeo, def.treeMat, list.length);
      const stumpsMesh = new THREE.InstancedMesh(sGeo, def.stumpMat, list.length);
      treesMesh.frustumCulled = false;
      stumpsMesh.frustumCulled = false;

      for (let i = 0; i < list.length; i++) {
        const tp = list[i];
        const w = def.baseH * def.aspect * tp.s;
        const h = def.baseH * tp.s;
        const isDead = deadSet.has(tp.localId);

        dummy.position.set(tp.tx, tp.ty - 0.25, tp.tz);
        dummy.scale.set(w, h, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();

        if (isDead) {
          treesMesh.setMatrixAt(i, ZERO_M);
          stumpsMesh.setMatrixAt(i, dummy.matrix);
        } else {
          treesMesh.setMatrixAt(i, dummy.matrix);
          stumpsMesh.setMatrixAt(i, ZERO_M);

          const stumpM = dummy.matrix.clone();
          const dObj = {
            type: 'tree',
            x: tp.tx,
            y: tp.ty,
            z: tp.tz,
            r: 3.2 * tp.s,
            h: h * 0.85,
            color: def.color,
            alive: true,
            kill() {
              markChunkPropDead(tp.localId);
              treesMesh.setMatrixAt(i, ZERO_M);
              stumpsMesh.setMatrixAt(i, stumpM);
              dirtyMeshes.add(treesMesh);
              dirtyMeshes.add(stumpsMesh);
            },
          };
          registerDestructible(dObj, false);
          chunk.destructibles.push(dObj);
        }
      }
      treesMesh.instanceMatrix.needsUpdate = true;
      stumpsMesh.instanceMatrix.needsUpdate = true;
      scene.add(treesMesh, stumpsMesh);
      chunk.propMeshes.push(treesMesh, stumpsMesh);
    }

    // 1B. Animated Billboard Bushes (Bushe1..4, placed in Jungle meadows & light scrub)
    const maxChunkBushes = (cx === 0 && cz === 0) ? 140 : 100;
    const bushBuckets = [[], [], [], []];
    let totalPlacedBushes = 0;
    let bAttempts = 0;
    while (totalPlacedBushes < maxChunkBushes && bAttempts < maxChunkBushes * 6) {
      bAttempts++;
      const bx = minX + cRand() * CHUNK_SIZE;
      const bz = minZ + cRand() * CHUNK_SIZE;
      if (Math.abs(bx + 215) < 56 && Math.abs(bz - 225) < 108) continue;
      const by = getBaseTerrainHeight(bx, bz);
      if (by < 3.6 || by > 58.0) continue;
      const biomes = getBiomeWeightsAt(bx, bz);
      if (biomes.jungle < 0.45) continue;

      const s = 0.80 + cRand() * 0.65;
      const phase = cRand();
      const vIdx = Math.floor(cRand() * bushDefs.length);
      const localId = `b_${totalPlacedBushes++}`;
      bushBuckets[vIdx].push({ bx, by, bz, s, phase, localId });
    }

    for (let vIdx = 0; vIdx < bushDefs.length; vIdx++) {
      const list = bushBuckets[vIdx];
      if (list.length === 0) continue;
      const def = bushDefs[vIdx];

      const bGeo = treeGeo.clone();
      const phases = new Float32Array(list.length);
      for (let i = 0; i < list.length; i++) phases[i] = list[i].phase;
      bGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));

      const bushMesh = new THREE.InstancedMesh(bGeo, def.mat, list.length);
      bushMesh.frustumCulled = false;
      for (let i = 0; i < list.length; i++) {
        const bp = list[i];
        const w = def.baseW * bp.s;
        const h = def.baseH * bp.s;
        const isDead = deadSet.has(bp.localId);
        if (isDead) {
          bushMesh.setMatrixAt(i, ZERO_M);
        } else {
          dummy.position.set(bp.bx, bp.by - 0.15, bp.bz);
          dummy.scale.set(w, h, 1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          bushMesh.setMatrixAt(i, dummy.matrix);

          const dObj = {
            type: 'bush',
            label: 'BUSH',
            x: bp.bx,
            y: bp.by,
            z: bp.bz,
            r: 2.0 * bp.s,
            h: h * 0.75,
            color: def.color,
            alive: true,
            kill() {
              markChunkPropDead(bp.localId);
              bushMesh.setMatrixAt(i, ZERO_M);
              dirtyMeshes.add(bushMesh);
            },
          };
          registerDestructible(dObj, false);
          chunk.destructibles.push(dObj);
        }
      }
      bushMesh.instanceMatrix.needsUpdate = true;
      scene.add(bushMesh);
      chunk.propMeshes.push(bushMesh);
    }

    // 1C. Land Rocks (Rock1..4) & Animated Water Rocks (Water Rocks_01..04)
    const maxLandRocks = (cx === 0 && cz === 0) ? 95 : 70;
    const rockBuckets = [[], [], [], []];
    let totalLandRocks = 0;
    let rAttempts = 0;
    while (totalLandRocks < maxLandRocks && rAttempts < maxLandRocks * 6) {
      rAttempts++;
      const rx = minX + cRand() * CHUNK_SIZE;
      const rz = minZ + cRand() * CHUNK_SIZE;
      if (Math.abs(rx + 215) < 58 && Math.abs(rz - 225) < 110) continue;
      const ry = getBaseTerrainHeight(rx, rz);
      if (ry < 1.8 || ry > 92.0) continue;

      const s = 0.75 + cRand() * 0.90;
      const vIdx = Math.floor(cRand() * rockDefs.length);
      const localId = `rk_${totalLandRocks++}`;
      rockBuckets[vIdx].push({ rx, ry, rz, s, localId });
    }

    for (let vIdx = 0; vIdx < rockDefs.length; vIdx++) {
      const list = rockBuckets[vIdx];
      if (list.length === 0) continue;
      const def = rockDefs[vIdx];

      const rGeo = treeGeo.clone();
      rGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1));
      const rockMesh = new THREE.InstancedMesh(rGeo, def.mat, list.length);
      rockMesh.frustumCulled = false;

      for (let i = 0; i < list.length; i++) {
        const rp = list[i];
        const w = def.baseW * rp.s;
        const h = def.baseH * rp.s;
        const isDead = deadSet.has(rp.localId);
        if (isDead) {
          rockMesh.setMatrixAt(i, ZERO_M);
        } else {
          dummy.position.set(rp.rx, rp.ry - 0.2, rp.rz);
          dummy.scale.set(w, h, 1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          rockMesh.setMatrixAt(i, dummy.matrix);

          const dObj = {
            type: 'rock',
            label: 'ROCHA',
            x: rp.rx,
            y: rp.ry,
            z: rp.rz,
            r: 2.3 * rp.s,
            h: h * 0.7,
            color: def.color,
            alive: true,
            kill() {
              markChunkPropDead(rp.localId);
              rockMesh.setMatrixAt(i, ZERO_M);
              dirtyMeshes.add(rockMesh);
            },
          };
          registerDestructible(dObj, false);
          chunk.destructibles.push(dObj);
        }
      }
      rockMesh.instanceMatrix.needsUpdate = true;
      scene.add(rockMesh);
      chunk.propMeshes.push(rockMesh);
    }

    const maxWaterRocks = (cx === 0 && cz === 0) ? 22 : 16;
    const waterRockBuckets = [[], [], [], []];
    let totalWaterRocks = 0;
    let wrAttempts = 0;
    while (totalWaterRocks < maxWaterRocks && wrAttempts < maxWaterRocks * 10) {
      wrAttempts++;
      const wx = minX + cRand() * CHUNK_SIZE;
      const wz = minZ + cRand() * CHUNK_SIZE;
      const wy = getBaseTerrainHeight(wx, wz);
      // Place in shallow/coastal water near islands & reefs (-9.5m to -0.4m)
      if (wy > -0.35 || wy < -9.5) continue;

      const s = 0.85 + cRand() * 0.95;
      const phase = cRand();
      const vIdx = Math.floor(cRand() * waterRockDefs.length);
      const localId = `wrk_${totalWaterRocks++}`;
      waterRockBuckets[vIdx].push({ wx, wz, s, phase, localId });
    }

    for (let vIdx = 0; vIdx < waterRockDefs.length; vIdx++) {
      const list = waterRockBuckets[vIdx];
      if (list.length === 0) continue;
      const def = waterRockDefs[vIdx];

      const wrGeo = treeGeo.clone();
      const phases = new Float32Array(list.length);
      for (let i = 0; i < list.length; i++) phases[i] = list[i].phase;
      wrGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));

      const wRockMesh = new THREE.InstancedMesh(wrGeo, def.mat, list.length);
      wRockMesh.frustumCulled = false;
      for (let i = 0; i < list.length; i++) {
        const wrp = list[i];
        const w = def.baseW * wrp.s;
        const h = def.baseH * wrp.s;
        const isDead = deadSet.has(wrp.localId);
        if (isDead) {
          wRockMesh.setMatrixAt(i, ZERO_M);
        } else {
          dummy.position.set(wrp.wx, WATER_LEVEL + 0.15, wrp.wz);
          dummy.scale.set(w, h, 1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          wRockMesh.setMatrixAt(i, dummy.matrix);

          const dObj = {
            type: 'water_rock',
            label: 'ROCHA MARINHA',
            x: wrp.wx,
            y: WATER_LEVEL,
            z: wrp.wz,
            r: 2.8 * wrp.s,
            h: h * 0.55,
            color: def.color,
            alive: true,
            kill() {
              markChunkPropDead(wrp.localId);
              wRockMesh.setMatrixAt(i, ZERO_M);
              dirtyMeshes.add(wRockMesh);
            },
          };
          registerDestructible(dObj, false);
          chunk.destructibles.push(dObj);
        }
      }
      wRockMesh.instanceMatrix.needsUpdate = true;
      scene.add(wRockMesh);
      chunk.propMeshes.push(wRockMesh);
    }

    // 2. Coastal Villages (Origin villages in chunk 0,0 + procedural coastal villages in outer chunks!)
    const chunkVillages = [];
    if (cx === 0 && cz === 0) {
      for (const vc of ORIGIN_VILLAGES) chunkVillages.push(vc);
    } else {
      for (let vAttempt = 0; vAttempt < 12 && chunkVillages.length < 2; vAttempt++) {
        const vx = minX + (0.18 + cRand() * 0.64) * CHUNK_SIZE;
        const vz = minZ + (0.18 + cRand() * 0.64) * CHUNK_SIZE;
        const vh = getBaseTerrainHeight(vx, vz);
        if (vh >= 3.2 && vh <= 15.0) {
          chunkVillages.push({ x: vx, z: vz });
        }
      }
    }

    const housePlacements = [];
    for (let vi = 0; vi < chunkVillages.length; vi++) {
      const vc = chunkVillages[vi];
      for (let k = 0; k < 24 && housePlacements.length < 96; k++) {
        const hx = vc.x + (cRand() - 0.5) * 95;
        const hz = vc.z + (cRand() - 0.5) * 95;
        if (hx < minX || hx >= maxX || hz < minZ || hz >= maxZ) continue;
        const hy = getBaseTerrainHeight(hx, hz);
        if (hy < 2.2 || hy > 16.0) continue;
        if (Math.abs(getBaseTerrainHeight(hx + 4, hz) - hy) > 2.2) continue;

        const s = 0.75 + cRand() * 0.55;
        const rotY = cRand() * Math.PI * 2;
        const roofCol = roofPalette[Math.floor(cRand() * roofPalette.length)];
        housePlacements.push({ hx, hy, hz, s, rotY, roofCol, localId: `h_${housePlacements.length}` });
      }
    }

    if (housePlacements.length > 0) {
      const houseWalls = new THREE.InstancedMesh(houseWallsGeo, houseWallMat, housePlacements.length);
      const houseRoofs = new THREE.InstancedMesh(houseRoofGeo, houseRoofMat, housePlacements.length);
      houseWalls.frustumCulled = false;
      houseRoofs.frustumCulled = false;
      for (let i = 0; i < housePlacements.length; i++) {
        const hp = housePlacements[i];
        const isDead = deadSet.has(hp.localId);
        if (isDead) {
          houseWalls.setMatrixAt(i, ZERO_M);
          houseRoofs.setMatrixAt(i, ZERO_M);
        } else {
          dummy.position.set(hp.hx, hp.hy + 1.4 * hp.s, hp.hz);
          dummy.scale.set(hp.s, hp.s, hp.s);
          dummy.rotation.set(0, hp.rotY, 0);
          dummy.updateMatrix();
          houseWalls.setMatrixAt(i, dummy.matrix);

          dummy.position.set(hp.hx, hp.hy + 3.9 * hp.s, hp.hz);
          dummy.updateMatrix();
          houseRoofs.setMatrixAt(i, dummy.matrix);
        }
        houseRoofs.setColorAt(i, new THREE.Color(hp.roofCol));

        if (!isDead) {
          const dObj = {
            type: 'house',
            label: 'HOUSE',
            x: hp.hx,
            y: hp.hy,
            z: hp.hz,
            r: 5.2 * hp.s,
            h: 7.5 * hp.s,
            color: 0xf2e4cc,
            alive: true,
            kill() {
              markChunkPropDead(hp.localId);
              houseWalls.setMatrixAt(i, ZERO_M);
              houseRoofs.setMatrixAt(i, ZERO_M);
              dirtyMeshes.add(houseWalls);
              dirtyMeshes.add(houseRoofs);
            },
          };
          registerDestructible(dObj, false);
          chunk.destructibles.push(dObj);
        }
      }
      houseWalls.instanceMatrix.needsUpdate = true;
      houseRoofs.instanceMatrix.needsUpdate = true;
      if (houseRoofs.instanceColor) houseRoofs.instanceColor.needsUpdate = true;
      scene.add(houseWalls, houseRoofs);
      chunk.propMeshes.push(houseWalls, houseRoofs);
    }

    // 3. Coastal Lighthouses (Origin lighthouses in 0,0 + procedural headland lighthouses in outer chunks!)
    const chunkLighthouses = [];
    if (cx === 0 && cz === 0) {
      for (const [lx, lz] of ORIGIN_LIGHTHOUSES) chunkLighthouses.push([lx, lz]);
    } else {
      for (let lAttempt = 0; lAttempt < 18 && chunkLighthouses.length < 2; lAttempt++) {
        const lx = minX + (0.12 + cRand() * 0.76) * CHUNK_SIZE;
        const lz = minZ + (0.12 + cRand() * 0.76) * CHUNK_SIZE;
        const ly = getBaseTerrainHeight(lx, lz);
        if (ly >= 3.2 && ly <= 18.0) {
          // Prefer coastal headlands near water
          const nearWater =
            getBaseTerrainHeight(lx + 45, lz) < 0 ||
            getBaseTerrainHeight(lx - 45, lz) < 0 ||
            getBaseTerrainHeight(lx, lz + 45) < 0 ||
            getBaseTerrainHeight(lx, lz - 45) < 0;
          if (nearWater) chunkLighthouses.push([lx, lz]);
        }
      }
    }

    for (let li = 0; li < chunkLighthouses.length; li++) {
      const [lx, lz] = chunkLighthouses[li];
      const ly = getBaseTerrainHeight(lx, lz);
      if (ly < 2.0) continue;
      const localId = `lh_${li}`;
      if (deadSet.has(localId)) continue;

      const g = new THREE.Group();
      const base = new THREE.Mesh(lhBaseGeo, lhWhiteMat);
      base.position.y = 3.75;
      const stripe = new THREE.Mesh(lhStripeGeo, lhRedMat);
      stripe.position.y = 9.75;
      const lamp = new THREE.Mesh(lhLampGeo, lhLampMat);
      lamp.position.y = 13.0;
      const cap = new THREE.Mesh(lhCapGeo, lhRedMat);
      cap.position.y = 14.8;
      g.add(base, stripe, lamp, cap);
      g.position.set(lx, ly - 0.5, lz);
      scene.add(g);
      chunk.propMeshes.push(g);

      const beaconRec = { lamp, phase: cRand() * Math.PI * 2, group: g };
      lighthouseBeacons.push(beaconRec);
      chunk.beacons.push(beaconRec);

      const dObj = {
        type: 'lighthouse',
        label: 'LIGHTHOUSE',
        x: lx,
        y: ly,
        z: lz,
        r: 5.0,
        h: 18,
        color: 0xf7f2e8,
        alive: true,
        kill() {
          markChunkPropDead(localId);
          g.visible = false;
        },
      };
      registerDestructible(dObj, false);
      chunk.destructibles.push(dObj);
    }

    // 4. Coastal Island Airstrip & Base Structures in Origin Chunk (0, 0)
    if (cx === 0 && cz === 0) {
      const stripY = getBaseTerrainHeight(-215, 225) + 0.35;
      const runway = new THREE.Mesh(runwayGeo, runwayMat);
      runway.position.set(-215, stripY, 225);
      scene.add(runway);
      chunk.propMeshes.push(runway);

      const runwayDashes = new THREE.InstancedMesh(dashGeo, dashMat, 9);
      const runwayLights = new THREE.InstancedMesh(rLightGeo, lightMat, 18);
      let dashIdx = 0;
      let lightIdx = 0;
      for (let dz = -54; dz <= 54; dz += 14) {
        dummy.position.set(-215, stripY + 0.05, 225 + dz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        runwayDashes.setMatrixAt(dashIdx++, dummy.matrix);

        for (const sx of [-10.5, 10.5]) {
          dummy.position.set(-215 + sx, stripY + 0.5, 225 + dz);
          dummy.updateMatrix();
          runwayLights.setMatrixAt(lightIdx++, dummy.matrix);
        }
      }
      runwayDashes.count = dashIdx;
      runwayLights.count = lightIdx;
      runwayDashes.instanceMatrix.needsUpdate = true;
      runwayLights.instanceMatrix.needsUpdate = true;
      scene.add(runwayDashes, runwayLights);
      chunk.propMeshes.push(runwayDashes, runwayLights);

      if (!deadSet.has('air_tower')) {
        const tower = new THREE.Mesh(towerGeo, lhWhiteMat);
        tower.position.set(-196, stripY + 6.5, 215);
        const towerCab = new THREE.Mesh(towerCabGeo, lhLampMat);
        towerCab.position.set(-196, stripY + 14.5, 215);
        scene.add(tower, towerCab);
        chunk.propMeshes.push(tower, towerCab);

        const tObj = {
          type: 'tower',
          label: 'CONTROL TOWER',
          x: -196,
          y: stripY,
          z: 215,
          r: 7.5,
          h: 19,
          color: 0xf7f2e8,
          alive: true,
          kill() {
            markChunkPropDead('air_tower');
            tower.visible = false;
            towerCab.visible = false;
          },
        };
        registerDestructible(tObj, true);
        chunk.destructibles.push(tObj);
      }

      for (const hz of [185, 248]) {
        const hId = `air_hangar_${hz}`;
        if (deadSet.has(hId)) continue;
        const hg = new THREE.Group();
        const hBody = new THREE.Mesh(hangarBodyGeo, hangarMat);
        hBody.position.y = 3.75;
        const hRoof = new THREE.Mesh(hangarRoofGeo, lhWhiteMat);
        hRoof.rotation.z = Math.PI / 2;
        hRoof.rotation.y = Math.PI / 2;
        hRoof.position.y = 7.5;
        hg.add(hBody, hRoof);
        hg.position.set(-237, stripY, hz);
        scene.add(hg);
        chunk.propMeshes.push(hg);

        const hObj = {
          type: 'hangar',
          label: 'HANGAR',
          x: -237,
          y: stripY,
          z: hz,
          r: 11.0,
          h: 14,
          color: 0xc4cad6,
          alive: true,
          kill() {
            markChunkPropDead(hId);
            hg.visible = false;
          },
        };
        registerDestructible(hObj, true);
        chunk.destructibles.push(hObj);
      }

      for (const [tx, tz] of [[-194, 192], [-194, 240], [-184, 202]]) {
        const tkId = `air_tank_${tx}_${tz}`;
        if (deadSet.has(tkId)) continue;
        const tk = new THREE.Mesh(tankGeo, tankMat);
        tk.position.set(tx, stripY + 3.6, tz);
        scene.add(tk);
        chunk.propMeshes.push(tk);

        const tkObj = {
          type: 'tank',
          label: 'FUEL TANK',
          x: tx,
          y: stripY,
          z: tz,
          r: 5.5,
          h: 9.0,
          color: 0xff6e38,
          alive: true,
          kill() {
            markChunkPropDead(tkId);
            tk.visible = false;
          },
        };
        registerDestructible(tkObj, true);
        chunk.destructibles.push(tkObj);
      }
    }

    loadedChunks.set(key, chunk);
    return chunk;
  }

  function unloadChunk(key) {
    const chunk = loadedChunks.get(key);
    if (!chunk) return;

    scene.remove(chunk.mesh);
    chunk.geo.dispose();

    for (const pm of chunk.propMeshes) {
      scene.remove(pm);
      if (pm.isInstancedMesh) {
        if (pm.geometry && pm.geometry !== treeGeo && pm.geometry !== houseWallsGeo && pm.geometry !== houseRoofGeo && pm.geometry !== dashGeo && pm.geometry !== rLightGeo) {
          pm.geometry.dispose();
        }
        pm.dispose();
      }
    }
    for (const dObj of chunk.destructibles) {
      unregisterDestructible(dObj);
    }
    for (const b of chunk.beacons) {
      const bIdx = lighthouseBeacons.indexOf(b);
      if (bIdx >= 0) lighthouseBeacons.splice(bIdx, 1);
    }

    loadedChunks.delete(key);
  }

  let lastCenterChunkX = null;
  let lastCenterChunkZ = null;

  function updateVisibleChunks(centerX, centerZ, forceRebuildTex = false) {
    const cx = Math.floor((centerX + CHUNK_SIZE * 0.5) / CHUNK_SIZE);
    const cz = Math.floor((centerZ + CHUNK_SIZE * 0.5) / CHUNK_SIZE);

    if (!forceRebuildTex && cx === lastCenterChunkX && cz === lastCenterChunkZ) {
      return false;
    }

    const neededKeys = new Set();
    let changed = false;

    for (let dz = -ACTIVE_CHUNK_RADIUS; dz <= ACTIVE_CHUNK_RADIUS; dz++) {
      for (let dx = -ACTIVE_CHUNK_RADIUS; dx <= ACTIVE_CHUNK_RADIUS; dx++) {
        const ncx = cx + dx;
        const ncz = cz + dz;
        const key = ncx + ',' + ncz;
        neededKeys.add(key);
        if (!loadedChunks.has(key)) {
          createChunk(ncx, ncz);
          changed = true;
        }
      }
    }

    // Remove and dispose any chunk outside the active visibility window!
    for (const existingKey of Array.from(loadedChunks.keys())) {
      if (!neededKeys.has(existingKey)) {
        unloadChunk(existingKey);
        changed = true;
      }
    }

    lastCenterChunkX = cx;
    lastCenterChunkZ = cz;

    if (changed || forceRebuildTex) {
      const winCenterX = cx * CHUNK_SIZE;
      const winCenterZ = cz * CHUNK_SIZE;
      rebuildHeightTextureForWindow(heightTexObj, winCenterX, winCenterZ);
      waterMat.uniforms.uHeightTexCenter.value.set(winCenterX, winCenterZ);
    }
    return changed;
  }

  // Initial load around origin (0, 0)
  updateVisibleChunks(0, 0, true);

  // =========================================================================
  // 4f. Large Naval Ships cruising the bays & endless sea channels (24 ships, 4 distinct vessel classes!)
  // =========================================================================
  const ships = [];
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

  function findNearbyDeepWater(refX, refZ, minRadius = 220, maxRadius = 1150) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = minRadius + Math.random() * (maxRadius - minRadius);
      const tx = refX + Math.cos(ang) * dist;
      const tz = refZ + Math.sin(ang) * dist;
      if (getTerrainHeight(tx, tz) < -4.2) {
        return { x: tx, z: tz, angle: Math.random() * Math.PI * 2 };
      }
    }
    return null;
  }

  const shipStyleMeshes = createNavalFleetMeshes(scene, Math.ceil(shipPositions.length / SHIP_STYLES.length) + 4);
  const styleInstanceCounts = new Array(SHIP_STYLES.length).fill(0);

  for (const [sx, sz, ang] of shipPositions) {
    if (getTerrainHeight(sx, sz) > -3.5) continue;
    const shipIdx = ships.length;
    const styleIdx = shipIdx % SHIP_STYLES.length;
    const styleDef = SHIP_STYLES[styleIdx];
    const styleInstIdx = styleInstanceCounts[styleIdx]++;

    const shipObj = {
      idx: shipIdx,
      styleIdx,
      styleInstIdx,
      styleId: styleDef.spec.id,
      type: 'ship',
      label: styleDef.spec.label || 'NAVAL SHIP',
      x: sx,
      y: WATER_LEVEL,
      z: sz,
      originX: sx,
      originZ: sz,
      originAng: ang,
      r: styleDef.spec.radius || 13.5,
      h: styleDef.spec.height || 13.0,
      color: styleDef.spec.color || 0xd9563c,
      angle: ang,
      speed: 4.5 + rand() * 3.0,
      phase: rand() * Math.PI * 2,
      alive: true,
      respawnTimer: 0,
      kill() {
        this.respawnTimer = 60.0;
        writeShipInstance(this.idx, this, WATER_LEVEL, false);
        markShipsMatricesDirty();
      },
    };
    ships.push(shipObj);
    lockableTargets.push(shipObj);
  }

  for (let s = 0; s < shipStyleMeshes.length; s++) {
    shipStyleMeshes[s].mesh.count = styleInstanceCounts[s];
  }

  function writeShipInstance(_idx, sh, baseY, visible = true) {
    const styleMesh = shipStyleMeshes[sh.styleIdx].mesh;
    const arr = styleMesh.instanceMatrix.array;
    if (!visible) {
      writeZeroMatrix(arr, sh.styleInstIdx);
      return;
    }
    const sinA = Math.sin(sh.angle);
    const cosA = Math.cos(sh.angle);
    writeYRotTransMatrix(arr, sh.styleInstIdx, sh.x, baseY - 0.15, sh.z, sinA, cosA);
  }

  function markShipsMatricesDirty() {
    for (let s = 0; s < shipStyleMeshes.length; s++) {
      shipStyleMeshes[s].mesh.instanceMatrix.needsUpdate = true;
    }
  }

  for (let i = 0; i < ships.length; i++) {
    writeShipInstance(i, ships[i], WATER_LEVEL, true);
  }
  markShipsMatricesDirty();

  // 4g. Rare Sky Balloons carrying Pink-Cross Full-Heal Medkits (3 rare balloons in the sky!)
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
      type: 'balloon',
      label: 'MEDKIT BALLOON',
      x: bx,
      y: by - 6,
      z: bz,
      r: 10.5,
      h: 16.0,
      color: 0xff62a8,
      group: bg,
      baseY: by,
      phase: rand() * Math.PI * 2,
      spotIdx: bi,
      driftX: (rand() - 0.5) * 3.2,
      driftZ: (rand() - 0.5) * 3.2,
      alive: true,
      respawnTimer: 0,
      kill() {
        bg.visible = false;
        this.respawnTimer = 70.0 + Math.random() * 40.0;
      },
    };
    balloons.push(balObj);
  }

  // 4e. Sailboats drifting across the turquoise bays
  const boatCount = 46;
  const hullGeo = new THREE.BoxGeometry(1.6, 0.8, 4.2);
  const sailGeo = new THREE.ConeGeometry(1.8, 5.2, 3);
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x7a4b36, flatShading: true });
  const sailMat = new THREE.MeshBasicMaterial({ color: 0xfdf8ef });

  const boatHulls = new THREE.InstancedMesh(hullGeo, hullMat, boatCount);
  const boatSails = new THREE.InstancedMesh(sailGeo, sailMat, boatCount);
  boatHulls.frustumCulled = false;
  boatSails.frustumCulled = false;
  const boats = [];

  let bAttempts = 0;
  while (boats.length < boatCount && bAttempts < 1500) {
    bAttempts++;
    const bx = (rand() - 0.5) * 1800;
    const bz = (rand() - 0.5) * 1800;
    const bh = getTerrainHeight(bx, bz);
    if (bh > -4.5) continue;
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
  // 5. PIXEL-ART BILLBOARD CLOUDS (8 variants from assets/Clouds/Clouds_01..08.png)
  // =========================================================================
  const cloudGroup = new THREE.Group();
  scene.add(cloudGroup);
  const clouds = [];
  const cloudBuckets = Array.from({ length: cloudSpriteMats.length }, () => []);

  for (let i = 0; i < 54; i++) {
    const isShadowCaster = i < MAX_CLOUDS;
    const scaleBase = isShadowCaster ? 42 + rand() * 52 : 28 + rand() * 38;
    const variantIdx = i % cloudSpriteMats.length;
    const instIdx = cloudBuckets[variantIdx].length;
    const cx = (rand() - 0.5) * 2500;
    const cz = (rand() - 0.5) * 2500;
    const cy = isShadowCaster ? 88 + rand() * 65 : 175 + rand() * 95;
    const width = scaleBase * 3.1;
    const height = width * (256 / 576);

    const cloudRec = {
      x: cx,
      y: cy,
      z: cz,
      w: width,
      h: height,
      variantIdx,
      instIdx,
      visible: true,
      speed: 2.2 + rand() * 2.4,
      shadowRadius: scaleBase * 1.15,
      shadowIndex: isShadowCaster ? i : -1,
    };
    clouds.push(cloudRec);
    cloudBuckets[variantIdx].push(cloudRec);
  }

  const cloudVariantMeshes = [];
  for (let vIdx = 0; vIdx < cloudSpriteMats.length; vIdx++) {
    const bucket = cloudBuckets[vIdx];
    const cGeo = cloudSpriteGeo.clone();
    cGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, bucket.length)), 1));
    const cMesh = new THREE.InstancedMesh(cGeo, cloudSpriteMats[vIdx], Math.max(1, bucket.length));
    cMesh.count = bucket.length;
    cMesh.frustumCulled = false;
    cMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cloudGroup.add(cMesh);
    cloudVariantMeshes.push(cMesh);
  }

  let cloudMatricesDirty = true;
  function syncCloudMatrices() {
    if (!cloudGroup.visible) {
      cloudMatricesDirty = false;
      return;
    }
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const mesh = cloudVariantMeshes[c.variantIdx];
      const arr = mesh.instanceMatrix.array;
      if (!c.visible) {
        writeZeroMatrix(arr, c.instIdx);
      } else {
        writeTSMatrix(arr, c.instIdx, c.x, c.y, c.z, c.w, c.h, 1);
      }
    }
    for (let vIdx = 0; vIdx < cloudVariantMeshes.length; vIdx++) {
      cloudVariantMeshes[vIdx].instanceMatrix.needsUpdate = true;
    }
    cloudMatricesDirty = false;
  }
  syncCloudMatrices();

  // =========================================================================
  // 5B. DESTRUCTION, LOCK-ON & MULTI-CHUNK TERRAIN EXCAVATION
  // =========================================================================
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
      if (dot < 0.90) continue;
      const anglePenalty = (1.0 - dot) * 900;
      const score = dist + anglePenalty;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  function deformTerrain(wx, wz, radius, depth, dirX = 0, dirZ = 0) {
    if (deformScale <= 0.001) return false;
    const effRadius = deformScale > 1.0 ? radius * 1.15 : radius;
    const effDepth = depth * deformScale;

    const cxWorld = wx + dirX * effRadius * 0.25;
    const czWorld = wz + dirZ * effRadius * 0.25;

    let anyChanged = false;
    for (const chunk of loadedChunks.values()) {
      if (applyCraterToChunkData(chunk, cxWorld, czWorld, effRadius, effDepth, true)) {
        anyChanged = true;
      }
    }

    if (!anyChanged) return false;

    globalDeformHistory.push({ cxWorld, czWorld, effRadius, effDepth });
    if (globalDeformHistory.length > 360) globalDeformHistory.shift();

    updateHeightTexturePatch(heightTexObj, cxWorld, czWorld, effRadius);
    return true;
  }

  function resetTerrain() {
    globalDeformHistory.length = 0;
    for (const chunk of loadedChunks.values()) {
      chunk.liveHeights.set(chunk.baseHeights);
      chunk.scorchData.fill(0);
      for (let i = 0; i < chunk.posAttr.count; i++) {
        chunk.posAttr.setY(i, chunk.liveHeights[i]);
      }
      chunk.geo.computeVertexNormals();
      chunk.posAttr.needsUpdate = true;
      chunk.normAttr.needsUpdate = true;
      chunk.scorchAttr.needsUpdate = true;
    }
    rebuildHeightTextureForWindow(heightTexObj, heightTexObj.centerX, heightTexObj.centerZ);
  }

  function rebuildAllChunksForSeed(newSeedStr) {
    const cleanSeed = sanitizeSeedString(newSeedStr);
    updateSeedOffsets(cleanSeed);
    terrainOptions.seed = cleanSeed;

    globalDeformHistory.length = 0;
    destroyedChunkProps.clear();

    for (const key of Array.from(loadedChunks.keys())) {
      unloadChunk(key);
    }
    const cx = lastCenterChunkX ?? 0;
    const cz = lastCenterChunkZ ?? 0;
    lastCenterChunkX = null;
    lastCenterChunkZ = null;
    updateVisibleChunks(cx * CHUNK_SIZE, cz * CHUNK_SIZE, true);

    // Reposition any ships that ended up on land after seed change
    for (const sh of ships) {
      if (getTerrainHeight(sh.x, sh.z) > -3.5) {
        const spot = findNearbyDeepWater(cx * CHUNK_SIZE, cz * CHUNK_SIZE, 120, 950);
        if (spot) {
          sh.x = spot.x;
          sh.z = spot.z;
          sh.originX = spot.x;
          sh.originZ = spot.z;
          sh.angle = spot.angle;
        }
      }
      if (sh.alive) writeShipInstance(sh.idx, sh, WATER_LEVEL, true);
    }
    markShipsMatricesDirty();
  }

  // =========================================================================
  // 6. DYNAMIC DROPPED PICKUPS: PINK-CROSS MEDKITS & SEA-SKIM MISSILE CRATES
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
      targetY = overWater ? WATER_LEVEL + 3.2 : Math.max(WATER_LEVEL + 3.2, groundH + 5.0);
      startY = Math.max(targetY, y);
      falling = startY > targetY + 0.5;
      fallSpeed = 12.0;
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

  function collectPickup(jetPos, canCollectFn, dt = 0.016) {
    const MAGNET_RADIUS = 85;
    const MAGNET_RADIUS_SQ = MAGNET_RADIUS * MAGNET_RADIUS;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (!p.active) continue;
      if (canCollectFn && !canCollectFn(p)) continue;

      let dx = jetPos.x - p.x;
      let dy = jetPos.y - p.y;
      let dz = jetPos.z - p.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < MAGNET_RADIUS_SQ && distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        const pullSpeed = 115 + (1 - dist / MAGNET_RADIUS) * 145;
        const step = Math.min(dist, pullSpeed * Math.max(0.001, dt));
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        p.z += (dz / dist) * step;
        p.baseY = p.y;
        p.falling = false;
        p.group.position.set(p.x, p.y, p.z);
        dx = jetPos.x - p.x;
        dy = jetPos.y - p.y;
        dz = jetPos.z - p.z;
      }

      let hit = false;
      if (p.type === 'missile') {
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
    let any = false;
    for (const sh of ships) {
      if (!sh.alive) {
        sh.alive = true;
        sh.respawnTimer = 0;
        sh.x = sh.originX;
        sh.z = sh.originZ;
        sh.angle = sh.originAng;
        writeShipInstance(sh.idx, sh, WATER_LEVEL, true);
        any = true;
      }
    }
    if (any) markShipsMatricesDirty();
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
      cloudMatricesDirty = true;
      terrainMat.uniforms.uCloudCount.value = 0;
      waterMat.uniforms.uCloudCount.value = 0;
      for (let i = 0; i < MAX_CLOUDS; i++) {
        cloudShadowUniforms[i].set(99999, 99999, 1, 0);
      }
      return;
    }
    cloudGroup.visible = true;
    const light = mode === 'light';
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.visible = !light || (i % 2 === 0);
    }
    cloudMatricesDirty = true;
    syncCloudMatrices();
  }

  function applyTerrainOptions(opts = {}) {
    const theme = TERRAIN_THEMES.includes(opts.theme) ? opts.theme : DEFAULT_TERRAIN_OPTIONS.theme;
    const deformMode = TERRAIN_DEFORM_MODES.includes(opts.deformMode) ? opts.deformMode : DEFAULT_TERRAIN_OPTIONS.deformMode;
    const cloudsMode = TERRAIN_CLOUD_MODES.includes(opts.clouds) ? opts.clouds : DEFAULT_TERRAIN_OPTIONS.clouds;
    const nextSeed = sanitizeSeedString(opts.seed !== undefined ? opts.seed : terrainOptions.seed);

    const seedChanged = nextSeed !== currentSeedStr;

    terrainOptions.theme = theme;
    terrainOptions.deformMode = deformMode;
    terrainOptions.clouds = cloudsMode;
    terrainOptions.seed = nextSeed;

    const themeIdx = TERRAIN_THEMES.indexOf(theme);
    skyMat.uniforms.uTerrainTheme.value = themeIdx;
    terrainMat.uniforms.uTerrainTheme.value = themeIdx;
    waterMat.uniforms.uTerrainTheme.value = themeIdx;
    for (let i = 0; i < billboardSpriteUniforms.length; i++) {
      billboardSpriteUniforms[i].uTerrainTheme.value = themeIdx;
    }

    deformScale = deformMode === 'off' ? 0.0 : deformMode === 'deep' ? 1.5 : 1.0;
    applyCloudDensity(cloudsMode);

    if (seedChanged) {
      rebuildAllChunksForSeed(nextSeed);
    }

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
    getSeed: () => currentSeedStr,
    setSeed: (s) => applyTerrainOptions({ ...terrainOptions, seed: s }),
    getLoadedChunkCount: () => loadedChunks.size,
    getLoadedChunkKeys: () => Array.from(loadedChunks.keys()),
    updateVisibleChunks,
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
      lastRippleAt = time;
    },
    update(time, camPos, dt) {
      // Keep sky dome & infinite ocean centered on camera
      skyMesh.position.set(camPos.x, 0, camPos.z);
      waterMesh.position.set(camPos.x, WATER_LEVEL, camPos.z);

      // Stream & cull procedural terrain chunks around camera position
      updateVisibleChunks(camPos.x, camPos.z, false);

      skyMat.uniforms.uTime.value = time;
      terrainMat.uniforms.uCamPos.value.copy(camPos);
      terrainMat.uniforms.uTime.value = time;
      waterMat.uniforms.uTime.value = time;
      waterMat.uniforms.uCamPos.value.copy(camPos);
      for (let i = 0; i < billboardSpriteUniforms.length; i++) {
        billboardSpriteUniforms[i].uTime.value = time;
        billboardSpriteUniforms[i].uCamPos.value.copy(camPos);
      }
      waterMat.uniforms.uRippleCount.value = lastRippleAt >= 0 && time - lastRippleAt < 4.8 ? MAX_RIPPLES : 0;

      // Drift clouds & wrap them seamlessly around the camera's active region
      let activeCloudCount = 0;
      const CLOUD_SPAN = 1450;
      if (!cloudGroup.visible) {
        terrainMat.uniforms.uCloudCount.value = 0;
        waterMat.uniforms.uCloudCount.value = 0;
      } else {
        for (let i = 0; i < clouds.length; i++) {
          const c = clouds[i];
          if (dt > 0) {
            c.x += c.speed * dt;
            if (c.x - camPos.x > CLOUD_SPAN) c.x -= CLOUD_SPAN * 2;
            else if (c.x - camPos.x < -CLOUD_SPAN) c.x += CLOUD_SPAN * 2;
            if (c.z - camPos.z > CLOUD_SPAN) c.z -= CLOUD_SPAN * 2;
            else if (c.z - camPos.z < -CLOUD_SPAN) c.z += CLOUD_SPAN * 2;
          }
          if (c.shadowIndex >= 0 && c.visible && activeCloudCount < MAX_CLOUDS) {
            const sx = c.x - SUN_DIR.x * (c.y * 0.25);
            const sz = c.z - SUN_DIR.z * (c.y * 0.25);
            const dx = sx - camPos.x;
            const dz = sz - camPos.z;
            if (dx * dx + dz * dz < 1650 * 1650) {
              cloudShadowUniforms[activeCloudCount++].set(sx, sz, c.shadowRadius, 1.0);
            }
          }
        }
        terrainMat.uniforms.uCloudCount.value = activeCloudCount;
        waterMat.uniforms.uCloudCount.value = activeCloudCount;
        if (dt > 0 || cloudMatricesDirty) {
          syncCloudMatrices();
        }
      }

      if (dt <= 0) return;

      // Gently animate sailboats on the water (relocating very distant boats into active waters)
      const hullArr = boatHulls.instanceMatrix.array;
      const sailArr = boatSails.instanceMatrix.array;
      for (let i = 0; i < boats.length; i++) {
        const b = boats[i];
        if (!b.alive) {
          writeZeroMatrix(hullArr, i);
          writeZeroMatrix(sailArr, i);
          continue;
        }
        if (Math.hypot(b.x - camPos.x, b.z - camPos.z) > 1950) {
          const spot = findNearbyDeepWater(camPos.x, camPos.z, 550, 1400);
          if (spot) {
            b.x = spot.x;
            b.z = spot.z;
            b.angle = spot.angle;
          }
        }
        const nx = b.x + Math.sin(b.angle) * b.speed * dt;
        const nz = b.z + Math.cos(b.angle) * b.speed * dt;
        if (getTerrainHeight(nx, nz) < -4.0) {
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

      // Animate & respawn naval ships across infinite sea channels
      for (const sh of ships) {
        if (!sh.alive) {
          sh.respawnTimer -= dt;
          if (sh.respawnTimer <= 0) {
            sh.alive = true;
            sh.respawnTimer = 0;
            if (Math.hypot(sh.originX - camPos.x, sh.originZ - camPos.z) > 1800) {
              const spot = findNearbyDeepWater(camPos.x, camPos.z, 350, 1150);
              if (spot) {
                sh.x = spot.x;
                sh.z = spot.z;
                sh.angle = spot.angle;
              } else {
                sh.x = sh.originX;
                sh.z = sh.originZ;
                sh.angle = sh.originAng;
              }
            } else {
              sh.x = sh.originX;
              sh.z = sh.originZ;
              sh.angle = sh.originAng;
            }
            writeShipInstance(sh.idx, sh, WATER_LEVEL, true);
          }
          continue;
        }
        // In Solo mode, if player flies far away (> 2400m), patrol ships redeploy into nearby sea channels
        if (Math.hypot(sh.x - camPos.x, sh.z - camPos.z) > 2400) {
          const spot = findNearbyDeepWater(camPos.x, camPos.z, 700, 1450);
          if (spot) {
            sh.x = spot.x;
            sh.z = spot.z;
            sh.angle = spot.angle;
          }
        }
        const nx = sh.x + Math.sin(sh.angle) * sh.speed * dt;
        const nz = sh.z + Math.cos(sh.angle) * sh.speed * dt;
        if (getTerrainHeight(nx, nz) < -4.0) {
          sh.x = nx;
          sh.z = nz;
        } else {
          sh.angle += 1.4;
        }
        writeShipInstance(sh.idx, sh, WATER_LEVEL + Math.sin(time * 1.5 + sh.phase) * 0.3, true);
      }
      markShipsMatricesDirty();

      // Rare floating target balloons: gentle drift + respawn near active region
      for (const bl of balloons) {
        if (!bl.alive) {
          bl.respawnTimer -= dt;
          if (bl.respawnTimer <= 0) {
            const nextIdx = (bl.spotIdx + 3 + Math.floor(Math.random() * 5)) % balloonSpawnPool.length;
            const [bx, by, bz] = balloonSpawnPool[nextIdx];
            bl.spotIdx = nextIdx;
            bl.x = camPos.x + bx;
            bl.baseY = Math.max(by, getTerrainHeight(bl.x, camPos.z + bz) + 42);
            bl.y = bl.baseY - 6;
            bl.z = camPos.z + bz;
            bl.group.position.set(bl.x, bl.baseY, bl.z);
            bl.group.visible = true;
            bl.alive = true;
          }
          continue;
        }
        bl.x += bl.driftX * dt;
        bl.z += bl.driftZ * dt;
        if (Math.hypot(bl.x - camPos.x, bl.z - camPos.z) > 2200) {
          const [bx, by, bz] = balloonSpawnPool[bl.spotIdx % balloonSpawnPool.length];
          bl.x = camPos.x + bx * 2.2;
          bl.z = camPos.z + bz * 2.2;
          bl.baseY = Math.max(by, getTerrainHeight(bl.x, bl.z) + 42);
        }
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

      // Animate & descend dropped pickups
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

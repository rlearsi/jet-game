import * as THREE from 'three';

export const WORLD_SIZE = 2800;
export const WATER_LEVEL = 0.0;
export const SUN_DIR = new THREE.Vector3(-0.62, 0.34, -0.71).normalize();

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
 * Vast multi-biome coastal archipelago heightmap:
 * - Sweeping central turquoise bays, coral lagoons & sea stacks
 * - Autumn-forested coastal hills & emerald pine headlands
 * - Towering Eastern & Northern snow-capped Alpine ranges
 * - Northwestern volcanic caldera peak
 * - Southwestern stepped terracotta canyon mesas
 * - Flat coastal airstrip plateau at (-175, 115)
 */
export function getTerrainHeight(x, z) {
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
  return tex;
}

export function buildWorld(scene) {
  const rand = mulberry32(90210);
  const heightTex = buildHeightTexture();

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

        vec3 col = mix(cCream, cApricot, smoothstep(0.0, 0.10, h));
        col = mix(col, cPeach, smoothstep(0.08, 0.28, h));
        col = mix(col, cMauve, smoothstep(0.26, 0.52, h));
        col = mix(col, cZenith, smoothstep(0.48, 0.86, h));

        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        col += vec3(1.0, 0.88, 0.64) * pow(sunDot, 7.0) * 0.32;
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
          vec3 streakShade = mix(vec3(0.78, 0.56, 0.66), vec3(0.99, 0.79, 0.64), highlight);
          vec3 streakBright = vec3(1.0, 0.90, 0.74);
          vec3 streakCol = mix(streakShade, streakBright, smoothstep(0.62, 0.78, n1) * 0.65);

          col = mix(col, streakCol, bandMask * fade * 0.86);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // =========================================================================
  // 2. MULTI-BIOME TERRAIN SHADER
  //    (Golden dunes, Autumn crimson/gold forests, Emerald pines, Flower meadows,
  //     Terracotta canyon mesas, Volcanic basalt + lava fissures, Alpine snow!)
  // =========================================================================
  const segs = 280;
  const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, getTerrainHeight(x, z));
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uCamPos: { value: new THREE.Vector3() },
      uClouds: { value: cloudShadowUniforms },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
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
      uniform vec4 uClouds[${MAX_CLOUDS}];
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

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

        // Crisp world-space pixel stippling for dense foliage & sand texture
        vec2 pixCell = floor(p * 0.72);
        float stipple = hash(pixCell);
        float fineCluster = noise(floor(p * 0.30) * 0.55);

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

        // 6. Snow-capped Alpine summits (excluding volcanic & canyon zones)
        float snowLine = 112.0 + (biomeA - 0.5) * 22.0 - slope * 24.0;
        float snowMask = smoothstep(snowLine, snowLine + 16.0, h) * (1.0 - volcanoMask * 0.9) * (1.0 - canyonMask);
        baseCol = mix(baseCol, colSnow, snowMask);

        // Stepped sunset cel-lighting with lavender-purple shadows
        float ndl = dot(N, normalize(uSunDir));
        float lit = smoothstep(-0.18, 0.08, ndl) * 0.5 + smoothstep(0.18, 0.45, ndl) * 0.5;
        vec3 shadowTint = vec3(0.56, 0.52, 0.68);
        vec3 sunTint    = vec3(1.06, 0.99, 0.90);
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

        // Warm creamy-peach atmospheric horizon fog (pushed back for epic long vistas!)
        float dist = length(uCamPos - vWorldPos);
        float fog = smoothstep(420.0, 1850.0, dist);
        vec3 fogCol = vec3(0.94, 0.83, 0.72);
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
        vec3 fogCol = vec3(0.94, 0.83, 0.72);
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

  // ---- Destructible object registry (spatial hash grid) ----
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  const GRID = 48;
  const grid = new Map();
  const dirtyMeshes = new Set();
  function registerDestructible(obj) {
    obj.alive = true;
    const key = Math.floor(obj.x / GRID) + ',' + Math.floor(obj.z / GRID);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(obj);
  }

  // 4a. Instanced Biome Trees (1400 stylized trees: autumn crimson/gold/orange + emerald pines + desert scrub)
  const treeCount = 1400;
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
    { x: -135, z: 245 },
    { x: 185, z: -105 },
    { x: -230, z: -85 },
    { x: 95, z: 265 },
    { x: -35, z: -230 },
  ];
  const maxHouses = 110;
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
          type: 'house', x: hx, y: hy, z: hz, r: 4.0 * s, h: 6.5 * s, color: 0xf2e4cc,
          kill() {
            houseWalls.setMatrixAt(hi, ZERO_M);
            houseRoofs.setMatrixAt(hi, ZERO_M);
            dirtyMeshes.add(houseWalls); dirtyMeshes.add(houseRoofs);
          },
        });
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
    [-72, 52],
    [118, -38],
    [145, 140],
    [-160, -45],
    [255, 25],
    [-295, 130],
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
      type: 'lighthouse', x: lx, y: ly, z: lz, r: 3.4, h: 16, color: 0xf7f2e8,
      kill() { g.visible = false; },
    });
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
    type: 'tower', x: -196, y: stripY, z: 215, r: 5.5, h: 17, color: 0xf7f2e8,
    kill() { tower.visible = false; towerCab.visible = false; },
  });

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
        col = mix(col, vec3(0.94, 0.83, 0.72), fog);

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
      const reach = 3.5 + blast;
      if (dx * dx + dz * dz < reach * reach && pos.y < 8 + blast * 0.5) {
        b.alive = false;
        killed.push({ type: 'boat', x: b.x, y: WATER_LEVEL + 1, z: b.z, color: 0xfdf8ef });
      }
    }
    for (const m of dirtyMeshes) m.instanceMatrix.needsUpdate = true;
    dirtyMeshes.clear();
    return killed;
  }

  return {
    damage,
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
        if (c.shadowIndex >= 0) {
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

      // Pulse lighthouse lamps
      for (const lb of lighthouseBeacons) {
        const pulse = 0.8 + 0.35 * Math.sin(time * 3.0 + lb.phase);
        lb.lamp.scale.setScalar(pulse);
      }
    },
  };
}

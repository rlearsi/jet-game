import * as THREE from 'three';
import { SUN_DIR } from '../world.js?v=26';

export const DEFAULT_FUSELAGE_STATIONS = [
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
 * Custom top-down pixel-art texture mapped directly onto the sculpted 3D fighter planform.
 * UV convention: u = x / 8.4 + 0.5 (left=-4.2..right=+4.2), v = (z + 4.1) / 7.0 (nose=-4.1..tail=+2.9)
 */
export function createPlanformTexture(accentHex = '#e55238', pal, textureStyle = 'classic') {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const toU = (x) => Math.round((x / 8.4 + 0.5) * S);
  const toV = (z) => Math.round(((z + 4.1) / 7.0) * S);

  if (textureStyle === 'raven') {
    // 1. Clean bright icy-silver base across wings & tailplanes
    ctx.fillStyle = pal.base;
    ctx.fillRect(0, 0, S, S);

    // Subtle cool shading near trailing edges & rear horizontal stabilizers
    ctx.fillStyle = pal.shade;
    ctx.fillRect(0, toV(0.72), S, S - toV(0.72));

    // Soft cool-grey inner-wing shadow bevels keeping outer wings crisp
    ctx.fillStyle = pal.wingPatch;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(toU(side * 1.15), toV(0.10));
      ctx.lineTo(toU(side * 2.85), toV(0.36));
      ctx.lineTo(toU(side * 2.60), toV(0.75));
      ctx.lineTo(toU(side * 1.15), toV(0.68));
      ctx.closePath();
      ctx.fill();
    }

    // 2. Bold two-tone lavender-grey dorsal camouflage blocks across central fuselage
    ctx.fillStyle = pal.camo1;
    ctx.beginPath();
    ctx.moveTo(toU(0.0), toV(-2.55));
    ctx.lineTo(toU(0.55), toV(-1.75));
    ctx.lineTo(toU(1.05), toV(-0.95));
    ctx.lineTo(toU(1.05), toV(0.55));
    ctx.lineTo(toU(0.95), toV(1.65));
    ctx.lineTo(toU(0.88), toV(2.35));
    ctx.lineTo(toU(-0.88), toV(2.35));
    ctx.lineTo(toU(-0.95), toV(1.65));
    ctx.lineTo(toU(-1.05), toV(0.55));
    ctx.lineTo(toU(-1.05), toV(-0.95));
    ctx.lineTo(toU(-0.55), toV(-1.75));
    ctx.closePath();
    ctx.fill();

    // Deeper slate-lavender camo along left shoulder/flank & rear nacelle valley
    ctx.fillStyle = pal.camo2;
    ctx.beginPath();
    ctx.moveTo(toU(-1.05), toV(-0.85));
    ctx.lineTo(toU(-0.34), toV(-0.75));
    ctx.lineTo(toU(-0.42), toV(1.10));
    ctx.lineTo(toU(-0.82), toV(2.25));
    ctx.lineTo(toU(-1.02), toV(1.50));
    ctx.closePath();
    ctx.fill();

    ctx.fillRect(toU(-0.24), toV(1.05), toU(0.24) - toU(-0.24), toV(2.35) - toV(1.05));
    ctx.fillRect(toU(0.68), toV(0.75), toU(1.00) - toU(0.68), toV(2.25) - toV(0.75));

    // 3. Signature bright light-silver vertical dorsal highlight bars along center spine & twin nacelles
    ctx.fillStyle = pal.base;
    ctx.fillRect(toU(-0.30), toV(-0.85), toU(0.30) - toU(-0.30), toV(0.85) - toV(-0.85));
    for (const side of [-1, 1]) {
      const nx1 = toU(side * 0.22);
      const nx2 = toU(side * 0.68);
      ctx.fillRect(Math.min(nx1, nx2), toV(0.55), Math.abs(nx2 - nx1), toV(1.85) - toV(0.55));
    }

    // Subtle dark panel lines along wing roots & control-surface hinges
    ctx.strokeStyle = '#535870';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(toU(side * 1.02), toV(-0.75));
      ctx.lineTo(toU(side * 1.05), toV(0.85));
      ctx.moveTo(toU(side * 1.35), toV(0.76));
      ctx.lineTo(toU(side * 3.85), toV(0.92));
    }
    ctx.stroke();

    // Dark charcoal pointed nose cone
    ctx.fillStyle = '#2a2d40';
    ctx.fillRect(toU(-0.55), 0, toU(0.55) - toU(-0.55), toV(-3.28));

    // Dark gunmetal engine cowling collar at rear
    ctx.fillStyle = '#35384d';
    ctx.fillRect(toU(-0.98), toV(2.12), toU(0.98) - toU(-0.98), S - toV(2.12));
  } else {
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

    // Signature squadron flashes on wing roots & wingtip rails
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
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCanopyTexture(pal) {
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

export function createFinTexture(accentHex = '#e65238', pal, finStyle = 'classic') {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  if (finStyle === 'raven') {
    ctx.fillStyle = pal.camo2;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = pal.camo1;
    ctx.fillRect(0, 5, 16, 6);
    ctx.fillStyle = accentHex;
    ctx.fillRect(1, 1, 14, 5);
    ctx.fillStyle = '#222538';
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);
    ctx.fillRect(0, 0, 16, 1);
  } else {
    ctx.fillStyle = pal.base;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = pal.camo1;
    ctx.fillRect(0, 9, 16, 7);
    ctx.fillStyle = accentHex;
    ctx.fillRect(1, 1, 14, 3);
    ctx.fillStyle = '#222538';
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);
    ctx.fillRect(0, 0, 16, 1);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBrightJetMaterial(tex, tintHex = 0xffffff) {
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
 */
export function buildSculptedFuselage(stations = DEFAULT_FUSELAGE_STATIONS) {
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
 * Builds a sleek tapered airfoil surface with sharp leading/trailing edges and top-down UV mapping.
 */
export function buildAirfoilSurface(side, rootLE, rootTE, tipLE, tipTE, rootThick, tipThick, yOff = 0.02) {
  const s = side;
  const rMidZ = (rootLE[1] + rootTE[1]) * 0.5;
  const tMidZ = (tipLE[1] + tipTE[1]) * 0.5;

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

  pushTri(rLE, rTop, tTop);
  pushTri(rLE, tTop, tLE);
  pushTri(rTop, rTE, tTE);
  pushTri(rTop, tTE, tTop);

  pushTri(rLE, tBot, rBot);
  pushTri(rLE, tLE, tBot);
  pushTri(rBot, tTE, rTE);
  pushTri(rBot, tBot, tTE);

  pushTri(tLE, tTop, tTE);
  pushTri(tLE, tTE, tBot);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a sleek canted trapezoidal vertical tail fin.
 */
export function buildVerticalFin(side, finShape = null) {
  const s = side;
  const hasCustomShape = finShape && Number.isFinite(finShape.zBaseFront);
  const cant = finShape && Number.isFinite(finShape.cant) ? finShape.cant : 0.28;
  const thick = finShape && Number.isFinite(finShape.thick) ? finShape.thick : 0.08;
  const height = hasCustomShape ? finShape.height : 1.02;

  const shape = new THREE.Shape();
  let zMin = -0.65;
  let zSpan = 1.3;

  if (hasCustomShape) {
    const { zBaseFront, zBaseRear, zTopFront, zTopRear } = finShape;
    // rotateY(+PI/2) sends shapeX -> -worldZ, so CCW order in 2D uses shapeX = -worldZ
    shape.moveTo(-zBaseRear, 0.0);
    shape.lineTo(-zBaseFront, 0.0);
    shape.lineTo(-zTopFront, height);
    shape.lineTo(-zTopRear, height);
    shape.closePath();

    zMin = Math.min(zBaseFront, zBaseRear, zTopFront, zTopRear);
    const zMax = Math.max(zBaseFront, zBaseRear, zTopFront, zTopRear);
    zSpan = Math.max(0.01, zMax - zMin);
  } else {
    shape.moveTo(-0.62, 0.0);
    shape.lineTo(0.45, 0.0);
    shape.lineTo(0.62, 1.02);
    shape.lineTo(0.08, 1.02);
    shape.closePath();
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  geo.translate(0, 0, -thick * 0.5);
  geo.rotateY(Math.PI / 2);

  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const y = pos.getY(i);
    uv[i * 2] = (z - zMin) / zSpan;
    uv[i * 2 + 1] = 1.0 - y / height;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();

  geo.rotateZ(-s * cant);
  return geo;
}

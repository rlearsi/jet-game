import * as THREE from 'three';
import { buildWorld, SUN_DIR } from './world.js?v=7';
import { FighterJet } from './jet.js?v=7';
import { MissileSystem } from './weapons.js?v=7';
import { FighterCockpit } from './cockpit.js?v=7';
import { JetSoundEngine } from './audio.js?v=7';

// 6 live-switchable rendering styles (V key or VIEW / RENDER panel)
const RENDER_PRESETS = {
  crisp480: {
    id: 'crisp480',
    shortLabel: 'CRISP 480P',
    resHeight: 480,
    filter: 'nearest',
    dither: 0.25,
    levels: 48,
    terrainGrain: 0.35,
    styleMode: 0,
  },
  ghibli: {
    id: 'ghibli',
    shortLabel: 'GHIBLI HD',
    resHeight: 720,
    filter: 'linear',
    dither: 0.0,
    levels: 255,
    terrainGrain: 0.06,
    styleMode: 1,
  },
  cleanHD: {
    id: 'cleanHD',
    shortLabel: 'CLEAN HD',
    resHeight: 0, // native window height
    filter: 'linear',
    dither: 0.0,
    levels: 255,
    terrainGrain: 0.0,
    styleMode: 0,
  },
  comic: {
    id: 'comic',
    shortLabel: 'COMIC INK',
    resHeight: 720,
    filter: 'linear',
    dither: 0.0,
    levels: 18,
    terrainGrain: 0.0,
    styleMode: 2,
  },
  crt: {
    id: 'crt',
    shortLabel: 'CRT 360P',
    resHeight: 360,
    filter: 'nearest',
    dither: 0.45,
    levels: 32,
    terrainGrain: 0.65,
    styleMode: 3,
  },
  pixel270: {
    id: 'pixel270',
    shortLabel: 'PIXEL 270P',
    resHeight: 270,
    filter: 'nearest',
    dither: 1.0,
    levels: 28,
    terrainGrain: 1.0,
    styleMode: 0,
  },
};
const PRESET_ORDER = ['crisp480', 'ghibli', 'cleanHD', 'comic', 'crt', 'pixel270'];

const canvas = document.getElementById('game-canvas');
const cockpitCanvas = document.getElementById('cockpit-canvas');
const aimReticle = document.getElementById('aim-reticle');
const hitMarker = document.getElementById('hit-marker');
const lockBox = document.getElementById('lock-box');
const lockLabel = document.getElementById('lock-label');
const killBanner = document.getElementById('kill-banner');
const destroyedBadge = document.getElementById('destroyed-badge');
const ammoPipsEl = document.getElementById('ammo-pips');
const camNextLabel = document.getElementById('cam-next-label');
const camSwitchBtn = document.getElementById('cam-switch-btn');
const styleCycleBtn = document.getElementById('style-cycle-btn');
const styleShortLabel = document.getElementById('style-short-label');
const cockpitToggleBtn = document.getElementById('cockpit-toggle-btn');
const soundBtn = document.getElementById('sound-btn');
const viewBtn = document.getElementById('view-btn');
const viewPanel = document.getElementById('view-panel');
const vpResetBtn = document.getElementById('vp-reset');
const styleSelect = document.getElementById('style-select');
const resSelect = document.getElementById('res-select');
const ditherSlider = document.getElementById('dither-slider');
const ditherVal = document.getElementById('dither-val');
const fovSlider = document.getElementById('fov-slider');
const fovVal = document.getElementById('fov-val');
const distSlider = document.getElementById('dist-slider');
const distVal = document.getElementById('dist-val');
const scaleSlider = document.getElementById('scale-slider');
const scaleVal = document.getElementById('scale-val');
const hudBottomLeft = document.getElementById('hud-bottom-left');
const camBadge = document.getElementById('cam-badge');
const telemBadge = document.getElementById('telem-badge');
const distBadge = document.getElementById('dist-badge');
const startHint = document.getElementById('start-hint');

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

const hemiLight = new THREE.HemisphereLight(0xfbe0ce, 0x5c6282, 1.25);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffe7b8, 1.45);
sunLight.position.copy(SUN_DIR).multiplyScalar(600);
scene.add(sunLight);

// Camera & Render settings
const DEFAULT_VIEW = {
  fov: 80,
  camDist: 1.35,
  objDist: 1.0,
};
const viewSettings = { ...DEFAULT_VIEW };

let savedStyleId = 'crisp480';
try {
  const s = localStorage.getItem('sunsetStriker_renderStyle');
  if (s && RENDER_PRESETS[s]) savedStyleId = s;
} catch (_) {
  // ignore storage errors
}
const renderSettings = { ...RENDER_PRESETS[savedStyleId] };

const camera = new THREE.PerspectiveCamera(viewSettings.fov, window.innerWidth / window.innerHeight, 0.5, 3600);

// Render targets: main scene + fighter jet silhouette mask
let rtHeight = 480;
let rtWidth = Math.max(480, Math.round(rtHeight * (window.innerWidth / window.innerHeight)));

const rtOpts = {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  format: THREE.RGBAFormat,
};
const renderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, rtOpts);
const jetMaskTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, rtOpts);
const maskWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: renderTarget.texture },
    tJetMask: { value: jetMaskTarget.texture },
    uResolution: { value: new THREE.Vector2(rtWidth, rtHeight) },
    uOutlineEnabled: { value: 1.0 },
    uDither: { value: renderSettings.dither },
    uLevels: { value: renderSettings.levels },
    uStyleMode: { value: renderSettings.styleMode }, // 0=Std, 1=Ghibli, 2=Comic Sobel, 3=CRT
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tJetMask;
    uniform vec2 uResolution;
    uniform float uOutlineEnabled;
    uniform float uDither;
    uniform float uLevels;
    uniform float uStyleMode;
    varying vec2 vUv;

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

    float luma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 texel = 1.0 / uResolution;
      vec3 col = texture2D(tDiffuse, vUv).rgb;

      // Mode 1: GHIBLI / ANIME HD (soft sunset highlight bloom + rich painterly vibrance, zero grain)
      if (uStyleMode > 0.5 && uStyleMode < 1.5) {
        vec3 blur = (
          texture2D(tDiffuse, vUv + vec2( texel.x * 2.5, 0.0)).rgb +
          texture2D(tDiffuse, vUv + vec2(-texel.x * 2.5, 0.0)).rgb +
          texture2D(tDiffuse, vUv + vec2(0.0,  texel.y * 2.5)).rgb +
          texture2D(tDiffuse, vUv + vec2(0.0, -texel.y * 2.5)).rgb
        ) * 0.25;
        vec3 bright = max(blur - vec3(0.72), vec3(0.0));
        col += bright * vec3(1.05, 0.90, 0.72) * 0.45;
        // Gentle saturation lift
        float g = luma(col);
        col = mix(vec3(g), col, 1.14);
      }

      // Mode 2: COMIC / INK (Moebius-style Sobel ink outlines across terrain, mountains, craters & clouds!)
      if (uStyleMode > 1.5 && uStyleMode < 2.5) {
        float tl = luma(texture2D(tDiffuse, vUv + vec2(-texel.x,  texel.y)).rgb);
        float t  = luma(texture2D(tDiffuse, vUv + vec2( 0.0,      texel.y)).rgb);
        float tr = luma(texture2D(tDiffuse, vUv + vec2( texel.x,  texel.y)).rgb);
        float l  = luma(texture2D(tDiffuse, vUv + vec2(-texel.x,  0.0)).rgb);
        float r  = luma(texture2D(tDiffuse, vUv + vec2( texel.x,  0.0)).rgb);
        float bl = luma(texture2D(tDiffuse, vUv + vec2(-texel.x, -texel.y)).rgb);
        float b  = luma(texture2D(tDiffuse, vUv + vec2( 0.0,     -texel.y)).rgb);
        float br = luma(texture2D(tDiffuse, vUv + vec2( texel.x, -texel.y)).rgb);

        float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
        float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
        float edge = sqrt(gx * gx + gy * gy);

        // Clean flat comic color stepping
        float comicLevels = 16.0;
        col = floor(col * comicLevels + 0.5) / comicLevels;
        float ink = smoothstep(0.18, 0.38, edge);
        col = mix(col, vec3(0.13, 0.12, 0.21), ink * 0.85);
      }

      // Optional Bayer 4x4 ordered dithering & color quantization (0% = completely smooth HD!)
      if (uDither > 0.01) {
        vec2 pix = floor(vUv * uResolution);
        float d = (bayer4(pix) - 0.5) * uDither;
        vec3 quant = floor((col + d / uLevels) * uLevels + 0.5) / uLevels;
        col = mix(col, quant, clamp(uDither * 1.15, 0.0, 1.0));
      }

      // Mode 3: CRT ARCADE (soft horizontal scanlines + warm vignette)
      if (uStyleMode > 2.5) {
        float scan = 0.90 + 0.10 * sin(vUv.y * uResolution.y * 3.14159 * 2.0);
        vec2 vigUv = vUv * 2.0 - 1.0;
        float vig = 1.0 - dot(vigUv, vigUv) * 0.16;
        col *= scan * vig;
      }

      // Crisp fighter jet silhouette ink outline (adapts thickness cleanly to resolution!)
      if (uOutlineEnabled > 0.5) {
        float stepPx = max(1.0, floor(uResolution.y / 380.0));
        vec2 oStep = texel * stepPx;
        float center = texture2D(tJetMask, vUv).r;
        if (center < 0.5) {
          float nL = texture2D(tJetMask, vUv + vec2(-oStep.x, 0.0)).r;
          float nR = texture2D(tJetMask, vUv + vec2( oStep.x, 0.0)).r;
          float nU = texture2D(tJetMask, vUv + vec2(0.0,  oStep.y)).r;
          float nD = texture2D(tJetMask, vUv + vec2(0.0, -oStep.y)).r;
          if (max(max(nL, nR), max(nU, nD)) > 0.5) {
            col = vec3(0.10, 0.11, 0.18);
          }
        }
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

// Build world, jet, weapons, cockpit, sound
const world = buildWorld(scene);
const sound = new JetSoundEngine();
const jet = new FighterJet(scene);
const weapons = new MissileSystem(scene, sound, world);
const cockpit = new FighterCockpit(cockpitCanvas);

jet.hullGroup.traverse((obj) => {
  if (obj.isMesh) obj.layers.enable(1);
});

const ammoPipEls = [];
for (let i = 0; i < weapons.maxAmmo; i++) {
  const el = document.createElement('span');
  el.className = 'ammo-pip ready';
  ammoPipsEl.appendChild(el);
  ammoPipEls.push(el);
}

// 3 Camera Modes
const CAMERA_MODES = [
  { id: 'CHASE', label: 'CHASE VIEW', nextHint: 'COCKPIT' },
  { id: 'COCKPIT', label: 'COCKPIT VIEW', nextHint: 'TOP VIEW' },
  { id: 'TOP', label: 'TOP VIEW', nextHint: 'CHASE VIEW' },
];
let camModeIdx = 0;
let lastExternalMode = 0;

const camPosSmooth = new THREE.Vector3(-85, 102, 232);
const camLookSmooth = new THREE.Vector3(-85, 86, 160);
let camRollSmooth = 0;

function setCameraMode(idx) {
  camModeIdx = (idx + CAMERA_MODES.length) % CAMERA_MODES.length;
  const mode = CAMERA_MODES[camModeIdx];
  if (mode.id !== 'COCKPIT') lastExternalMode = camModeIdx;

  camBadge.textContent = mode.label;
  camNextLabel.textContent = mode.nextHint;

  const isCockpit = mode.id === 'COCKPIT';
  jet.setVisible(!isCockpit);
  cockpit.setVisible(isCockpit);
  hudBottomLeft.classList.toggle('hidden', isCockpit);
  postMat.uniforms.uOutlineEnabled.value = isCockpit ? 0.0 : 1.0;
  sound.playSwitch();
}

function toggleCockpit() {
  if (CAMERA_MODES[camModeIdx].id === 'COCKPIT') {
    setCameraMode(lastExternalMode);
  } else {
    setCameraMode(1);
  }
}

function applyRenderSettings() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const targetH = renderSettings.resHeight === 0 ? Math.min(1080, h) : renderSettings.resHeight;
  rtHeight = Math.max(240, targetH);
  rtWidth = Math.max(320, Math.round(rtHeight * (w / h)));

  const texFilter = renderSettings.filter === 'linear' ? THREE.LinearFilter : THREE.NearestFilter;
  renderTarget.texture.magFilter = texFilter;
  renderTarget.texture.minFilter = texFilter;
  renderTarget.texture.needsUpdate = true;

  renderer.setSize(rtWidth, rtHeight, false);
  renderTarget.setSize(rtWidth, rtHeight);
  jetMaskTarget.setSize(rtWidth, rtHeight);
  postMat.uniforms.uResolution.value.set(rtWidth, rtHeight);
  postMat.uniforms.uDither.value = renderSettings.dither;
  postMat.uniforms.uLevels.value = renderSettings.levels;
  postMat.uniforms.uStyleMode.value = renderSettings.styleMode;

  canvas.style.imageRendering = renderSettings.filter === 'linear' ? 'auto' : 'pixelated';

  // Keep pixel-art cockpit crisp at 270p internal height scaled to aspect
  const cpH = 270;
  const cpW = Math.max(360, Math.round(cpH * (w / h)));
  cockpitCanvas.width = cpW;
  cockpitCanvas.height = cpH;
  cockpit.w = cpW;
  cockpit.h = cpH;

  world.setTerrainGrain(renderSettings.terrainGrain);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // Sync UI
  styleSelect.value = renderSettings.id;
  resSelect.value = String(renderSettings.resHeight);
  ditherSlider.value = renderSettings.dither.toFixed(2);
  ditherVal.textContent = `${Math.round(renderSettings.dither * 100)}%`;
  styleShortLabel.textContent = renderSettings.shortLabel;
}

function selectRenderPreset(presetId) {
  const p = RENDER_PRESETS[presetId];
  if (!p) return;
  Object.assign(renderSettings, p);
  try {
    localStorage.setItem('sunsetStriker_renderStyle', presetId);
  } catch (_) {
    // ignore
  }
  applyRenderSettings();
  sound.playSwitch();
}

function cycleRenderPreset() {
  const idx = PRESET_ORDER.indexOf(renderSettings.id);
  const nextId = PRESET_ORDER[(idx + 1) % PRESET_ORDER.length];
  selectRenderPreset(nextId);
}

function syncViewUI() {
  fovSlider.value = String(viewSettings.fov);
  fovVal.innerHTML = `${Math.round(viewSettings.fov)}&deg;`;
  distSlider.value = viewSettings.camDist.toFixed(2);
  distVal.textContent = `${viewSettings.camDist.toFixed(2)}x`;
  scaleSlider.value = viewSettings.objDist.toFixed(2);
  scaleVal.textContent = `${viewSettings.objDist.toFixed(2)}x`;
  distBadge.textContent = `FOV ${Math.round(viewSettings.fov)}° · DIST ${viewSettings.camDist.toFixed(2)}x`;

  jet.visual.scale.setScalar(0.74 / Math.sqrt(viewSettings.objDist));
}

viewBtn.addEventListener('click', () => {
  const hidden = viewPanel.classList.toggle('hidden');
  viewBtn.classList.toggle('active', !hidden);
});

styleSelect.addEventListener('change', () => {
  selectRenderPreset(styleSelect.value);
});

resSelect.addEventListener('change', () => {
  renderSettings.resHeight = Number(resSelect.value);
  renderSettings.filter = renderSettings.resHeight === 0 || renderSettings.resHeight >= 720 ? 'linear' : 'nearest';
  applyRenderSettings();
});

ditherSlider.addEventListener('input', () => {
  const v = Number(ditherSlider.value);
  renderSettings.dither = v;
  renderSettings.terrainGrain = v;
  renderSettings.levels = v > 0.05 ? Math.round(64 - v * 36) : 255;
  applyRenderSettings();
});

fovSlider.addEventListener('input', () => {
  viewSettings.fov = Number(fovSlider.value);
  syncViewUI();
});

distSlider.addEventListener('input', () => {
  viewSettings.camDist = Number(distSlider.value);
  syncViewUI();
});

scaleSlider.addEventListener('input', () => {
  viewSettings.objDist = Number(scaleSlider.value);
  syncViewUI();
});

vpResetBtn.addEventListener('click', () => {
  Object.assign(viewSettings, DEFAULT_VIEW);
  selectRenderPreset('crisp480');
  syncViewUI();
});

const rebuildTerrainBtn = document.getElementById('rebuild-terrain-btn');
if (rebuildTerrainBtn) {
  rebuildTerrainBtn.addEventListener('click', () => {
    world.resetTerrain();
    sound.playSwitch();
  });
}

// Input state
const input = {
  mouseX: 0,
  mouseY: 0,
  boost: false,
  cannonFiring: false,
  keys: {},
};

let leftDownAt = 0;
let interacted = false;

function dismissIntro() {
  if (!interacted) {
    interacted = true;
    startHint.classList.add('hidden');
  }
}

window.addEventListener('mousemove', (e) => {
  input.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  input.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
  if (Math.hypot(input.mouseX, input.mouseY) > 0.16) dismissIntro();
});

window.addEventListener('mousedown', (e) => {
  if (e.target.closest('button') || e.target.closest('select') || e.target.closest('.clickable') || e.target.closest('#view-panel')) return;
  dismissIntro();
  if (e.button === 0) {
    leftDownAt = performance.now();
    input.boost = true;
  } else if (e.button === 2) {
    input.cannonFiring = true;
    weapons.tryFireCannon(jet);
  } else if (e.button === 1) {
    e.preventDefault();
    weapons.tryFireMissile(jet);
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    input.boost = false;
    if (performance.now() - leftDownAt < 230) {
      jet.triggerRoll(input.mouseX >= 0 ? 1 : -1);
    }
  } else if (e.button === 2) {
    input.cannonFiring = false;
  }
});

window.addEventListener(
  'wheel',
  (e) => {
    if (e.target.closest('#view-panel')) return;
    const delta = Math.sign(e.deltaY) * 0.1;
    viewSettings.camDist = THREE.MathUtils.clamp(viewSettings.camDist + delta, 0.5, 2.6);
    syncViewUI();
  },
  { passive: true }
);

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  input.keys[e.code] = true;
  dismissIntro();

  if (e.code === 'KeyE') {
    e.preventDefault();
    toggleCockpit();
  } else if (e.code === 'KeyV') {
    e.preventDefault();
    cycleRenderPreset();
  } else if (e.code === 'Space' || e.code === 'KeyC') {
    e.preventDefault();
    setCameraMode(camModeIdx + 1);
  } else if (e.code === 'KeyF' || e.code === 'Enter') {
    weapons.tryFireMissile(jet);
  } else if (e.code === 'KeyM') {
    toggleSound();
  } else if (e.code === 'KeyR') {
    world.resetTerrain();
    sound.playSwitch();
  } else if (e.code === 'BracketRight' || e.code === 'Equal') {
    viewSettings.camDist = THREE.MathUtils.clamp(viewSettings.camDist + 0.12, 0.5, 2.6);
    syncViewUI();
  } else if (e.code === 'BracketLeft' || e.code === 'Minus') {
    viewSettings.camDist = THREE.MathUtils.clamp(viewSettings.camDist - 0.12, 0.5, 2.6);
    syncViewUI();
  }
});

window.addEventListener('keyup', (e) => {
  input.keys[e.code] = false;
});

function toggleSound() {
  const on = sound.toggle();
  soundBtn.textContent = on ? 'SOUND: ON' : 'SOUND: OFF';
}

soundBtn.addEventListener('click', toggleSound);
camSwitchBtn.addEventListener('click', () => setCameraMode(camModeIdx + 1));
styleCycleBtn.addEventListener('click', cycleRenderPreset);
cockpitToggleBtn.addEventListener('click', toggleCockpit);

window.addEventListener('resize', applyRenderSettings);
applyRenderSettings();
syncViewUI();
setCameraMode(0);

function updateCamera(dt) {
  const mode = CAMERA_MODES[camModeIdx].id;
  const fwd = jet.getForwardDirection();

  const objFovOffset = (viewSettings.objDist - 1.0) * 14.0;
  let targetFov = viewSettings.fov + objFovOffset + (jet.afterburner ? 8.5 : 0);
  if (mode === 'COCKPIT') {
    targetFov = THREE.MathUtils.clamp(viewSettings.fov - 4 + objFovOffset, 50, 108);
  } else if (mode === 'TOP') {
    targetFov = THREE.MathUtils.clamp(viewSettings.fov - 16 + objFovOffset * 0.8, 42, 98);
  } else {
    targetFov = THREE.MathUtils.clamp(targetFov, 45, 118);
  }

  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-6.0 * dt));
  camera.updateProjectionMatrix();

  const totalDistScale = viewSettings.camDist * viewSettings.objDist;

  if (mode === 'CHASE') {
    const baseDist = jet.afterburner ? 24.5 : 20.5;
    const dist = baseDist * totalDistScale;
    const heightOff = 7.4 * totalDistScale;

    const desiredPos = jet.position
      .clone()
      .addScaledVector(fwd, -dist)
      .add(new THREE.Vector3(0, heightOff, 0));
    const desiredLook = jet.position
      .clone()
      .addScaledVector(fwd, 34 * viewSettings.objDist)
      .add(new THREE.Vector3(0, -1.6 * viewSettings.objDist, 0));

    camPosSmooth.lerp(desiredPos, 1 - Math.exp(-8.5 * dt));
    camLookSmooth.lerp(desiredLook, 1 - Math.exp(-10.5 * dt));
    camRollSmooth = THREE.MathUtils.lerp(camRollSmooth, jet.bank * 0.34, 1 - Math.exp(-5.0 * dt));

    camera.position.copy(camPosSmooth);
    const rightAxis = new THREE.Vector3(Math.cos(jet.yaw), 0, -Math.sin(jet.yaw));
    camera.up
      .set(0, Math.cos(camRollSmooth), 0)
      .addScaledVector(rightAxis, Math.sin(-camRollSmooth))
      .normalize();
    camera.lookAt(camLookSmooth);
  } else if (mode === 'COCKPIT') {
    camera.up.set(0, 1, 0);
    const eye = jet.position.clone().addScaledVector(fwd, 1.4).add(new THREE.Vector3(0, 0.55, 0));
    camera.position.copy(eye);

    let extraRoll = 0;
    if (jet.rollAnim > 0) {
      extraRoll = (1.0 - jet.rollAnim) * Math.PI * 2 * jet.rollDir;
    }
    const euler = new THREE.Euler(jet.pitch, jet.yaw, jet.bank + extraRoll, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  } else {
    const horizFwd = new THREE.Vector3(-Math.sin(jet.yaw), 0, -Math.cos(jet.yaw));
    const desiredPos = jet.position
      .clone()
      .addScaledVector(horizFwd, -28 * totalDistScale)
      .add(new THREE.Vector3(0, 82 * totalDistScale, 0));
    const desiredLook = jet.position.clone().addScaledVector(horizFwd, 20 * viewSettings.objDist);

    camPosSmooth.lerp(desiredPos, 1 - Math.exp(-6.0 * dt));
    camLookSmooth.lerp(desiredLook, 1 - Math.exp(-9.0 * dt));

    camera.up.set(0, 1, 0);
    camera.position.copy(camPosSmooth);
    camera.lookAt(camLookSmooth);
  }

  const shakeMag = weapons.shake * 0.5 + (jet.afterburner && mode === 'CHASE' ? 0.07 : 0);
  if (shakeMag > 0.005) {
    camera.position.x += (Math.random() - 0.5) * shakeMag;
    camera.position.y += (Math.random() - 0.5) * shakeMag;
  }
}

const clock = new THREE.Clock();
const projVec = new THREE.Vector3();

function projectToScreen(worldPos) {
  projVec.copy(worldPos).project(camera);
  if (projVec.z > 1.0) return null;
  return {
    x: (projVec.x * 0.5 + 0.5) * window.innerWidth,
    y: (-projVec.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;
  const modeId = CAMERA_MODES[camModeIdx].id;
  const isCockpit = modeId === 'COCKPIT';

  jet.update(dt, input, isCockpit);

  if (input.cannonFiring) {
    weapons.tryFireCannon(jet);
  }
  weapons.update(dt, elapsed, jet);

  updateCamera(dt);
  world.update(elapsed, camera.position, dt);

  sound.updateJet(jet.throttle, jet.afterburner, isCockpit);

  for (let i = 0; i < ammoPipEls.length; i++) {
    ammoPipEls[i].classList.toggle('ready', i < weapons.ammo);
  }
  const knots = Math.round(jet.speed * 9.6);
  const altFt = Math.max(0, Math.round(jet.position.y * 3.6));
  telemBadge.textContent = `SPD ${knots} · ALT ${altFt}`;
  destroyedBadge.textContent = `DESTROYED: ${weapons.destroyed}`;

  if (weapons.killBannerTimer > 0) {
    killBanner.textContent = weapons.killBannerText;
    killBanner.classList.remove('hidden');
  } else {
    killBanner.classList.add('hidden');
  }

  if (modeId === 'CHASE') {
    const aimPt = jet.position.clone().addScaledVector(jet.getForwardDirection(), 180);
    const sp = projectToScreen(aimPt);
    if (sp) {
      aimReticle.classList.remove('hidden');
      aimReticle.style.left = `${sp.x}px`;
      aimReticle.style.top = `${sp.y}px`;
      hitMarker.classList.toggle('active', weapons.hitMarkerTimer > 0);
    } else {
      aimReticle.classList.add('hidden');
    }
  } else {
    aimReticle.classList.add('hidden');
  }

  if (weapons.lockedTarget && weapons.lockedTarget.alive && modeId !== 'TOP') {
    const t = weapons.lockedTarget;
    const tPos = new THREE.Vector3(t.x, t.y + (t.h || 6) * 0.5, t.z);
    const sp = projectToScreen(tPos);
    if (sp && sp.x > 20 && sp.x < window.innerWidth - 20 && sp.y > 30 && sp.y < window.innerHeight - 30) {
      lockBox.classList.remove('hidden');
      lockBox.style.left = `${sp.x}px`;
      lockBox.style.top = `${sp.y}px`;
      const distM = Math.round(jet.position.distanceTo(tPos));
      lockLabel.textContent = `${t.label || 'TARGET'} ${distM}M`;
    } else {
      lockBox.classList.add('hidden');
    }
  } else {
    lockBox.classList.add('hidden');
  }

  window.__GAME__ = { jet, weapons, world, setCameraMode, selectRenderPreset, renderSettings };

  // Pass 1: Render 3D scene
  camera.layers.set(0);
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  // Pass 2: Jet hull silhouette mask (Layer 1)
  if (!isCockpit) {
    camera.layers.set(1);
    scene.overrideMaterial = maskWhiteMat;
    renderer.setRenderTarget(jetMaskTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.set(0);
  }

  // Pass 3: Selected Render Style post-pass + jet outline
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);

  // Pass 4: Cockpit 2D pixel-art overlay
  if (isCockpit) {
    cockpit.render(dt, jet, weapons);
  }
}

animate();

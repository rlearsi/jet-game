import * as THREE from 'three';
import {
  buildWorld,
  SUN_DIR,
  TERRAIN_THEMES,
  TERRAIN_DEFORM_MODES,
  TERRAIN_CLOUD_MODES,
  DEFAULT_TERRAIN_OPTIONS,
  DEFAULT_WORLD_SEED,
  sanitizeSeedString,
  generateRandomSeed,
} from './world.js?v=36';
import { FighterJet, RemoteJet, SHIP_CATALOG, SHIP_IDS, buildJetVisualRig } from './jet.js?v=36';
import { MissileSystem } from './weapons.js?v=36';
import { FighterCockpit } from './cockpit.js?v=36';
import { JetSoundEngine } from './audio.js?v=36';
import { MultiplayerManager } from './multiplayer.js?v=36';
import { GamepadController, DEFAULT_GAMEPAD_DEADZONE } from './gamepad.js?v=36';
import { TouchController } from './touch.js?v=36';

// 6 live-switchable rendering styles (exclusively configurable inside Settings -> Render, plus V in flight)
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
    resHeight: 0,
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

const TERRAIN_THEME_LABELS = {
  sunset: 'Pôr do Sol Clássico',
  tropical: 'Alvorada Tropical',
  volcanic: 'Crepúsculo Vulcânico',
  alpine: 'Pico Alpino Nevado',
};
const TERRAIN_DEFORM_LABELS = {
  normal: 'Deformação Normal',
  deep: 'Crateras Profundas',
  off: 'Indestrutível',
};
const TERRAIN_CLOUD_LABELS = {
  full: 'Nuvens Densas',
  light: 'Nuvens Leves',
  clear: 'Céu Limpo',
};

const DEFAULT_AUDIO = {
  enabled: false,
  master: 0.65,
  engine: 0.85,
  sfx: 1.0,
};

const DEFAULT_BINDINGS = {
  missile: 'KeyF',
  cockpit: 'KeyE',
  camera: 'Space',
  lookBack: 'KeyB',
  afterburner: 'ShiftLeft',
  mute: 'KeyM',
  restoreTerrain: 'KeyR',
  cycleStyle: 'KeyV',
};

const BINDING_META = [
  { id: 'missile', label: 'MÍSSIL (FOX 2)' },
  { id: 'cockpit', label: 'COCKPIT 2D' },
  { id: 'camera', label: 'CICLAR CÂMERA' },
  { id: 'lookBack', label: 'OLHAR PARA TRÁS (SEGURAR)' },
  { id: 'afterburner', label: 'AFTERBURNER' },
  { id: 'mute', label: 'SOM ON/OFF' },
  { id: 'restoreTerrain', label: 'RESTAURAR MONTANHAS' },
  { id: 'cycleStyle', label: 'ESTILO VISUAL' },
];

const DEFAULT_CONTROLS = {
  invertY: false,
  gamepadInvertY: false,
  mouseSensitivity: 1.0,
  gamepadDeadzone: DEFAULT_GAMEPAD_DEADZONE,
  touchMode: 'auto',
  bindings: { ...DEFAULT_BINDINGS },
};

const DEFAULT_VIEW = {
  fov: 80,
  camDist: 1.35,
  objDist: 1.0,
};

// DOM References — Canvas & Flight HUD
const canvas = document.getElementById('game-canvas');
const cockpitCanvas = document.getElementById('cockpit-canvas');
const aimReticle = document.getElementById('aim-reticle');
const hitMarker = document.getElementById('hit-marker');
const lockBox = document.getElementById('lock-box');
const lockLabel = document.getElementById('lock-label');
const killBanner = document.getElementById('kill-banner');
const remoteLabelsEl = document.getElementById('remote-labels');
const pickupMarkersEl = document.getElementById('pickup-markers');
const missileVignette = document.getElementById('missile-vignette');
const missileAlertEl = document.getElementById('missile-alert');

const hudTopBar = document.getElementById('hud-top-bar');
const hudTopRight = document.getElementById('hud-top-right');
const hudMpPill = document.getElementById('hud-mp-pill');
const hudMpRoomLabel = document.getElementById('hud-mp-room-label');
const hudMpCopyCode = document.getElementById('hud-mp-copy-code');
const hudMpCopyLink = document.getElementById('hud-mp-copy-link');
const hudMenuBtn = document.getElementById('hud-menu-btn');
const hudEscHint = document.getElementById('hud-esc-hint');
const hudKeyMissile = document.getElementById('hud-key-missile');
const hudKeyCockpit = document.getElementById('hud-key-cockpit');
const hudKeyCam = document.getElementById('hud-key-cam');

const ammoPipsEl = document.getElementById('ammo-pips');
const camNextLabel = document.getElementById('cam-next-label');
const camSwitchBtn = document.getElementById('cam-switch-btn');
const cockpitToggleBtn = document.getElementById('cockpit-toggle-btn');

const objectiveHudEl = document.getElementById('objective-hud');
const objWinsListEl = document.getElementById('obj-wins-list');
const matchEndOverlay = document.getElementById('match-end-overlay');
const matchEndWinner = document.getElementById('match-end-winner');
const matchEndScoreboard = document.getElementById('match-end-scoreboard');
const matchEndCountdown = document.getElementById('match-end-countdown');
const matchEndRestartBtn = document.getElementById('match-end-restart-btn');
const objTitleEl = document.getElementById('obj-title');
const objCountEl = document.getElementById('obj-count');
const objBarFillEl = document.getElementById('obj-bar-fill');

const hudBottomLeft = document.getElementById('hud-bottom-left');
const camBadge = document.getElementById('cam-badge');
const telemBadge = document.getElementById('telem-badge');
const distBadge = document.getElementById('dist-badge');
const destroyedBadge = document.getElementById('destroyed-badge');
const playerHpFill = document.getElementById('player-hp-fill');
const playerHpText = document.getElementById('player-hp-text');
const playerStaminaFill = document.getElementById('player-stamina-fill');

const mobileControlsEl = document.getElementById('mobile-controls');
const touchStickZoneEl = document.getElementById('touch-stick-zone');
const touchStickKnobEl = document.getElementById('touch-stick-knob');
const touchBtnFire = document.getElementById('touch-btn-fire');
const touchBtnMissile = document.getElementById('touch-btn-missile');
const touchMissileCount = document.getElementById('touch-missile-count');
const touchBtnBoost = document.getElementById('touch-btn-boost');
const touchBtnRoll = document.getElementById('touch-btn-roll');
const touchBtnCam = document.getElementById('touch-btn-cam');
const touchBtnRear = document.getElementById('touch-btn-rear');

// DOM References — Menu Overlay & Views
const menuOverlay = document.getElementById('game-menu-overlay');
const menuViews = {
  main: document.getElementById('menu-view-main'),
  mp: document.getElementById('menu-view-mp'),
  controls: document.getElementById('menu-view-controls'),
  settings: document.getElementById('menu-view-settings'),
};
const menuModeBadge = document.getElementById('menu-mode-badge');
const menuBtnResume = document.getElementById('menu-btn-resume');
const menuBtnSolo = document.getElementById('menu-btn-solo');
const menuBtnMp = document.getElementById('menu-btn-mp');
const menuBtnControls = document.getElementById('menu-btn-controls');
const menuBtnSettings = document.getElementById('menu-btn-settings');
const menuBtnQuit = document.getElementById('menu-btn-quit');

const menuHangarBox = document.getElementById('menu-hangar-box');
const menuHangarCount = document.getElementById('menu-hangar-count');
const menuHangarList = document.getElementById('menu-hangar-list');
const menuTerrainChip = document.getElementById('menu-terrain-chip');
const menuHangarPreviewStage = document.getElementById('menu-hangar-preview-stage');
const menuHangarPreviewCanvas = document.getElementById('menu-hangar-preview-canvas');
const menuPreviewShipName = document.getElementById('menu-preview-ship-name');
const menuPreviewShipRole = document.getElementById('menu-preview-ship-role');
const menuPreviewShipMeta = document.getElementById('menu-preview-ship-meta');

const menuMatchStatusBox = document.getElementById('menu-match-status-box');
const menuLockedShipCard = document.getElementById('menu-locked-ship-card');
const menuMatchHp = document.getElementById('menu-match-hp');
const menuMatchObj = document.getElementById('menu-match-obj');
const menuMatchDestroyed = document.getElementById('menu-match-destroyed');
const menuMatchTerrain = document.getElementById('menu-match-terrain');
const menuPauseMpBox = document.getElementById('menu-pause-mp-box');
const menuPauseRoomCode = document.getElementById('menu-pause-room-code');
const menuPauseCopyCode = document.getElementById('menu-pause-copy-code');
const menuPauseCopyLink = document.getElementById('menu-pause-copy-link');
const menuPauseRoster = document.getElementById('menu-pause-roster');

// Multiplayer Menu Refs
const mpBackBtn = document.getElementById('mp-back-btn');
const mpStatusBadge = document.getElementById('mp-status-badge');
const mpHangarLockNote = document.getElementById('mp-hangar-lock-note');
const mpHangarList = document.getElementById('mp-hangar-list');
const mpHangarPreviewStage = document.getElementById('mp-hangar-preview-stage');
const mpHangarPreviewCanvas = document.getElementById('mp-hangar-preview-canvas');
const mpPreviewShipName = document.getElementById('mp-preview-ship-name');
const mpPreviewShipRole = document.getElementById('mp-preview-ship-role');
const mpPreviewShipMeta = document.getElementById('mp-preview-ship-meta');
const mpNameInput = document.getElementById('mp-name-input');
const mpSignalSelect = document.getElementById('mp-signal-select');
const mpTerrainText = document.getElementById('mp-terrain-text');
const mpEditTerrainBtn = document.getElementById('mp-edit-terrain-btn');
const mpLobbyView = document.getElementById('mp-lobby-view');
const mpRoomView = document.getElementById('mp-room-view');
const mpCreateBtn = document.getElementById('mp-create-btn');
const mpCodeInput = document.getElementById('mp-code-input');
const mpJoinBtn = document.getElementById('mp-join-btn');
const mpRoomCode = document.getElementById('mp-room-code');
const mpCopyCode = document.getElementById('mp-copy-code');
const mpCopyLink = document.getElementById('mp-copy-link');
const mpTransportInfo = document.getElementById('mp-transport-info');
const mpRoster = document.getElementById('mp-roster');
const mpLaunchBtn = document.getElementById('mp-launch-btn');
const mpLeaveBtn = document.getElementById('mp-leave-btn');
const mpMsg = document.getElementById('mp-msg');

// Controls Guide Refs
const controlsBackBtn = document.getElementById('controls-back-btn');
const controlsOpenSettingsBtn = document.getElementById('controls-open-settings-btn');
const guideKeyAfterburner = document.getElementById('guide-key-afterburner');
const guideKeyMissile = document.getElementById('guide-key-missile');
const guideKeyCockpit = document.getElementById('guide-key-cockpit');
const guideKeyCam = document.getElementById('guide-key-cam');
const guideKeyLookBack = document.getElementById('guide-key-lookback');
const guideKeyMute = document.getElementById('guide-key-mute');
const guideKeyRestore = document.getElementById('guide-key-restore');
const guideKeyStyle = document.getElementById('guide-key-style');

// Settings Refs
const settingsBackBtn = document.getElementById('settings-back-btn');
const settingsTabBtns = Array.from(document.querySelectorAll('.settings-tab'));
const settingsTabPanels = {
  audio: document.getElementById('settings-tab-audio'),
  controls: document.getElementById('settings-tab-controls'),
  render: document.getElementById('settings-tab-render'),
  terrain: document.getElementById('settings-tab-terrain'),
};

const audioEnabledBtn = document.getElementById('audio-enabled-btn');
const audioMasterSlider = document.getElementById('audio-master-slider');
const audioMasterVal = document.getElementById('audio-master-val');
const audioEngineSlider = document.getElementById('audio-engine-slider');
const audioEngineVal = document.getElementById('audio-engine-val');
const audioSfxSlider = document.getElementById('audio-sfx-slider');
const audioSfxVal = document.getElementById('audio-sfx-val');
const audioTestBtn = document.getElementById('audio-test-btn');

const ctrlTouchModeSelect = document.getElementById('ctrl-touch-mode-select');
const ctrlGamepadStatus = document.getElementById('ctrl-gamepad-status');
const ctrlGamepadInvertYBtn = document.getElementById('ctrl-gamepad-invert-y-btn');
const ctrlDeadzoneSlider = document.getElementById('ctrl-deadzone-slider');
const ctrlDeadzoneVal = document.getElementById('ctrl-deadzone-val');
const ctrlInvertYBtn = document.getElementById('ctrl-invert-y-btn');
const ctrlSensSlider = document.getElementById('ctrl-sens-slider');
const ctrlSensVal = document.getElementById('ctrl-sens-val');
const ctrlBindingsList = document.getElementById('ctrl-bindings-list');
const ctrlResetBtn = document.getElementById('ctrl-reset-btn');

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

const terrainLockBanner = document.getElementById('terrain-lock-banner');
const terrainSeedInput = document.getElementById('terrain-seed-input');
const terrainSeedApplyBtn = document.getElementById('terrain-seed-apply-btn');
const terrainSeedRandomBtn = document.getElementById('terrain-seed-random-btn');
const terrainThemeSelect = document.getElementById('terrain-theme-select');
const terrainDeformSelect = document.getElementById('terrain-deform-select');
const terrainCloudsSelect = document.getElementById('terrain-clouds-select');
const terrainChunkInfo = document.getElementById('terrain-chunk-info');
const rebuildTerrainBtn = document.getElementById('rebuild-terrain-btn');

// =========================================================================
// Three.js Renderer, Post-Process & World Setup
// =========================================================================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

const hemiLight = new THREE.HemisphereLight(0xfbe0ce, 0x5c6282, 1.25);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffe7b8, 1.45);
sunLight.position.copy(SUN_DIR).multiplyScalar(600);
scene.add(sunLight);

// Load persisted settings safely
function readJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeJsonStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (_) {}
}

let savedStyleId = 'crisp480';
let hasSavedRenderStyle = false;
try {
  const s = localStorage.getItem('sunsetStriker_renderStyle');
  if (s && RENDER_PRESETS[s]) {
    savedStyleId = s;
    hasSavedRenderStyle = true;
  }
} catch (_) {}
const renderSettings = { ...RENDER_PRESETS[savedStyleId] };
if (!hasSavedRenderStyle && TouchController.isTouchDevice()) {
  renderSettings.resHeight = 360;
}

const savedView = readJsonStorage('sunsetStriker_viewSettings');
const viewSettings = {
  fov: Number.isFinite(Number(savedView?.fov)) ? THREE.MathUtils.clamp(Number(savedView.fov), 45, 110) : DEFAULT_VIEW.fov,
  camDist: Number.isFinite(Number(savedView?.camDist)) ? THREE.MathUtils.clamp(Number(savedView.camDist), 0.5, 2.6) : DEFAULT_VIEW.camDist,
  objDist: Number.isFinite(Number(savedView?.objDist)) ? THREE.MathUtils.clamp(Number(savedView.objDist), 0.5, 2.2) : DEFAULT_VIEW.objDist,
};

const savedAudio = readJsonStorage('sunsetStriker_audioSettings');
const audioSettings = {
  enabled: Boolean(savedAudio?.enabled),
  master: Number.isFinite(Number(savedAudio?.master)) ? THREE.MathUtils.clamp(Number(savedAudio.master), 0, 1) : DEFAULT_AUDIO.master,
  engine: Number.isFinite(Number(savedAudio?.engine)) ? THREE.MathUtils.clamp(Number(savedAudio.engine), 0, 1) : DEFAULT_AUDIO.engine,
  sfx: Number.isFinite(Number(savedAudio?.sfx)) ? THREE.MathUtils.clamp(Number(savedAudio.sfx), 0, 1) : DEFAULT_AUDIO.sfx,
};

const savedControls = readJsonStorage('sunsetStriker_controls');
const controlSettings = {
  invertY: Boolean(savedControls?.invertY),
  gamepadInvertY: Boolean(savedControls?.gamepadInvertY),
  mouseSensitivity: Number.isFinite(Number(savedControls?.mouseSensitivity))
    ? THREE.MathUtils.clamp(Number(savedControls.mouseSensitivity), 0.5, 1.8)
    : DEFAULT_CONTROLS.mouseSensitivity,
  gamepadDeadzone: Number.isFinite(Number(savedControls?.gamepadDeadzone))
    ? THREE.MathUtils.clamp(Number(savedControls.gamepadDeadzone), 0.05, 0.35)
    : DEFAULT_CONTROLS.gamepadDeadzone,
  touchMode: ['auto', 'on', 'off'].includes(savedControls?.touchMode)
    ? savedControls.touchMode
    : DEFAULT_CONTROLS.touchMode,
  bindings: { ...DEFAULT_BINDINGS },
};
if (savedControls?.bindings && typeof savedControls.bindings === 'object') {
  for (const k of Object.keys(DEFAULT_BINDINGS)) {
    if (typeof savedControls.bindings[k] === 'string' && savedControls.bindings[k].length > 0) {
      controlSettings.bindings[k] = savedControls.bindings[k];
    }
  }
}

function sanitizeTerrainObj(src) {
  const obj = src && typeof src === 'object' ? src : {};
  return {
    theme: TERRAIN_THEMES.includes(obj.theme) ? obj.theme : DEFAULT_TERRAIN_OPTIONS.theme,
    deformMode: TERRAIN_DEFORM_MODES.includes(obj.deformMode) ? obj.deformMode : DEFAULT_TERRAIN_OPTIONS.deformMode,
    clouds: TERRAIN_CLOUD_MODES.includes(obj.clouds) ? obj.clouds : DEFAULT_TERRAIN_OPTIONS.clouds,
    seed: sanitizeSeedString(obj.seed !== undefined ? obj.seed : DEFAULT_WORLD_SEED),
  };
}

function getViewportSize() {
  const w = Math.max(1, Math.round(window.visualViewport?.width || window.innerWidth || 1));
  const h = Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight || 1));
  return { w, h };
}

let localSoloTerrain = sanitizeTerrainObj(readJsonStorage('sunsetStriker_terrainSettings'));
let activeTerrain = { ...localSoloTerrain };

const initVp = getViewportSize();
const camera = new THREE.PerspectiveCamera(viewSettings.fov, initVp.w / initVp.h, 0.5, 3600);

// Render targets: main scene + fighter jet silhouette mask
let rtHeight = 480;
let rtWidth = Math.max(480, Math.round(rtHeight * (initVp.w / initVp.h)));

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
    uStyleMode: { value: renderSettings.styleMode },
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

      if (uStyleMode > 0.5 && uStyleMode < 1.5) {
        vec3 blur = (
          texture2D(tDiffuse, vUv + vec2( texel.x * 2.5, 0.0)).rgb +
          texture2D(tDiffuse, vUv + vec2(-texel.x * 2.5, 0.0)).rgb +
          texture2D(tDiffuse, vUv + vec2(0.0,  texel.y * 2.5)).rgb +
          texture2D(tDiffuse, vUv + vec2(0.0, -texel.y * 2.5)).rgb
        ) * 0.25;
        vec3 bright = max(blur - vec3(0.72), vec3(0.0));
        col += bright * vec3(1.05, 0.90, 0.72) * 0.45;
        float g = luma(col);
        col = mix(vec3(g), col, 1.14);
      }

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

        float comicLevels = 16.0;
        col = floor(col * comicLevels + 0.5) / comicLevels;
        float ink = smoothstep(0.18, 0.38, edge);
        col = mix(col, vec3(0.13, 0.12, 0.21), ink * 0.85);
      }

      if (uDither > 0.01) {
        vec2 pix = floor(vUv * uResolution);
        float d = (bayer4(pix) - 0.5) * uDither;
        vec3 quant = floor((col + d / uLevels) * uLevels + 0.5) / uLevels;
        col = mix(col, quant, clamp(uDither * 1.15, 0.0, 1.0));
      }

      if (uStyleMode > 2.5) {
        float scan = 0.90 + 0.10 * sin(vUv.y * uResolution.y * 3.14159 * 2.0);
        vec2 vigUv = vUv * 2.0 - 1.0;
        float vig = 1.0 - dot(vigUv, vigUv) * 0.16;
        col *= scan * vig;
      }

      if (uOutlineEnabled > 0.5) {
        vec2 oStep = texel;
        float center = texture2D(tJetMask, vUv).r;
        if (center < 0.5) {
          float nL = texture2D(tJetMask, vUv + vec2(-oStep.x, 0.0)).r;
          float nR = texture2D(tJetMask, vUv + vec2( oStep.x, 0.0)).r;
          float nU = texture2D(tJetMask, vUv + vec2(0.0,  oStep.y)).r;
          float nD = texture2D(tJetMask, vUv + vec2(0.0, -oStep.y)).r;
          if (max(max(nL, nR), max(nU, nD)) > 0.5) {
            col = mix(col, vec3(0.12, 0.14, 0.22), 0.52);
          }
        }
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

// Build world, jet, weapons, cockpit, sound
let savedShipId = 'striker';
try {
  const sh = localStorage.getItem('sunsetStriker_shipId');
  if (sh && SHIP_CATALOG[sh]) savedShipId = sh;
} catch (_) {}

const world = buildWorld(scene);
const sound = new JetSoundEngine();
sound.setVolumes({ master: audioSettings.master, engine: audioSettings.engine, sfx: audioSettings.sfx });
sound.setPaused(true);

const jet = new FighterJet(scene, savedShipId);
const weapons = new MissileSystem(scene, sound, world);
weapons.setShipStats(jet.stats);
const cockpit = new FighterCockpit(cockpitCanvas);

jet.hullGroup.traverse((obj) => {
  if (obj.isMesh) obj.layers.enable(1);
});

// =========================================================================
// Game State & Menu Machine
// =========================================================================
let gameState = 'menu'; // 'menu' | 'playing'
let gameMode = 'menu'; // 'menu' | 'solo' | 'multiplayer'
let menuOpen = true;
let activeMenuView = 'main'; // 'main' | 'mp' | 'controls' | 'settings'
let settingsReturnView = 'main';
let activeSettingsTab = 'audio'; // 'audio' | 'controls' | 'render' | 'terrain'
let rebindingAction = null;
let showcaseOrbitAngle = 0.25;

// =========================================================================
// Ammo pips, Hangar 3D Preview Stage, Ship Cards & Hangar Locks
// =========================================================================
const HANGAR_PREVIEW_W = 380;
const HANGAR_PREVIEW_H = 148;
const hangarPreviewRT = new THREE.WebGLRenderTarget(HANGAR_PREVIEW_W, HANGAR_PREVIEW_H, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  format: THREE.RGBAFormat,
});
const hangarPreviewPixels = new Uint8Array(HANGAR_PREVIEW_W * HANGAR_PREVIEW_H * 4);
const hangarPreviewScene = new THREE.Scene();
const hangarPreviewCam = new THREE.PerspectiveCamera(34, HANGAR_PREVIEW_W / HANGAR_PREVIEW_H, 0.2, 80);

const hangarHemiLight = new THREE.HemisphereLight(0xffe8d2, 0x3a4062, 1.35);
hangarPreviewScene.add(hangarHemiLight);
const hangarKeyLight = new THREE.DirectionalLight(0xfff0c8, 1.55);
hangarKeyLight.position.set(10, 16, 12);
hangarPreviewScene.add(hangarKeyLight);
const hangarRimLight = new THREE.DirectionalLight(0xff8e52, 0.85);
hangarRimLight.position.set(-12, 5, -10);
hangarPreviewScene.add(hangarRimLight);

// Hangar turntable pedestal
const hangarTurntableGroup = new THREE.Group();
hangarTurntableGroup.position.set(0, -1.25, 0);
const pedestalBase = new THREE.Mesh(
  new THREE.CylinderGeometry(4.1, 4.45, 0.24, 24),
  new THREE.MeshBasicMaterial({ color: 0x1a2034 })
);
const pedestalRingOuter = new THREE.Mesh(
  new THREE.RingGeometry(3.82, 4.02, 28),
  new THREE.MeshBasicMaterial({ color: 0xf28c38, side: THREE.DoubleSide })
);
pedestalRingOuter.rotation.x = -Math.PI / 2;
pedestalRingOuter.position.y = 0.13;
const pedestalRingInner = new THREE.Mesh(
  new THREE.RingGeometry(2.35, 2.45, 24),
  new THREE.MeshBasicMaterial({ color: 0x58668a, side: THREE.DoubleSide })
);
pedestalRingInner.rotation.x = -Math.PI / 2;
pedestalRingInner.position.y = 0.13;
hangarTurntableGroup.add(pedestalBase, pedestalRingOuter, pedestalRingInner);
hangarPreviewScene.add(hangarTurntableGroup);

const hangarRigCache = new Map();
let activeHangarPreviewRig = null;
let activeHangarPreviewShipId = null;
let hoveredShipId = null;
let hangarPreviewYaw = 0.68;
let hangarPreviewPitch = 0.34;
let hangarDragPointerId = null;
let hangarDragLastX = 0;
let hangarDragLastY = 0;
let hangarShowcasePulse = 0;

const menuPreviewCtx = menuHangarPreviewCanvas ? menuHangarPreviewCanvas.getContext('2d') : null;
const mpPreviewCtx = mpHangarPreviewCanvas ? mpHangarPreviewCanvas.getContext('2d') : null;
const menuPreviewImgData = menuPreviewCtx ? menuPreviewCtx.createImageData(HANGAR_PREVIEW_W, HANGAR_PREVIEW_H) : null;
const mpPreviewImgData = mpPreviewCtx ? mpPreviewCtx.createImageData(HANGAR_PREVIEW_W, HANGAR_PREVIEW_H) : null;

const shipThumbDataUrls = new Map();

function getHangarPreviewRig(shipId) {
  const id = SHIP_CATALOG[shipId] ? shipId : 'striker';
  let rig = hangarRigCache.get(id);
  if (!rig) {
    rig = buildJetVisualRig(id);
    hangarRigCache.set(id, rig);
  }
  return rig;
}

function getDisplayedHangarShipId() {
  if (hoveredShipId && SHIP_CATALOG[hoveredShipId] && !isShipLocked()) {
    return hoveredShipId;
  }
  return jet.shipId;
}

function syncHangarPreviewHud() {
  const shownId = getDisplayedHangarShipId();
  const spec = SHIP_CATALOG[shownId] || SHIP_CATALOG.striker;
  const isHoverPreview = shownId !== jet.shipId;
  const titleText = isHoverPreview ? `PRÉVIA: ${spec.name}` : `SELECIONADA: ${spec.name}`;
  const metaText = `${spec.maxHp} HP · ${spec.maxMissiles} MÍSSEIS · VEL ${spec.abSpeed}`;

  for (const [stageEl, nameEl, roleEl, metaEl] of [
    [menuHangarPreviewStage, menuPreviewShipName, menuPreviewShipRole, menuPreviewShipMeta],
    [mpHangarPreviewStage, mpPreviewShipName, mpPreviewShipRole, mpPreviewShipMeta],
  ]) {
    if (stageEl) stageEl.classList.toggle('previewing', isHoverPreview);
    if (nameEl) {
      nameEl.textContent = titleText;
      nameEl.style.color = isHoverPreview ? '#9ee8ff' : '#fff2d6';
    }
    if (roleEl) roleEl.textContent = spec.role;
    if (metaEl) metaEl.textContent = metaText;
  }

  if (pedestalRingOuter && pedestalRingOuter.material) {
    pedestalRingOuter.material.color.set(spec.palette?.accent || '#f28c38');
  }
}

function attachHangarStageDrag(stageEl) {
  if (!stageEl) return;
  stageEl.addEventListener('pointerdown', (e) => {
    hangarDragPointerId = e.pointerId;
    hangarDragLastX = e.clientX;
    hangarDragLastY = e.clientY;
    try {
      stageEl.setPointerCapture(e.pointerId);
    } catch (_) {}
  });
  stageEl.addEventListener('pointermove', (e) => {
    if (hangarDragPointerId !== e.pointerId) return;
    const dx = e.clientX - hangarDragLastX;
    const dy = e.clientY - hangarDragLastY;
    hangarDragLastX = e.clientX;
    hangarDragLastY = e.clientY;
    hangarPreviewYaw += dx * 0.014;
    hangarPreviewPitch = THREE.MathUtils.clamp(hangarPreviewPitch + dy * 0.008, 0.12, 0.78);
  });
  const endDrag = (e) => {
    if (hangarDragPointerId === e.pointerId) {
      hangarDragPointerId = null;
    }
  };
  stageEl.addEventListener('pointerup', endDrag);
  stageEl.addEventListener('pointercancel', endDrag);
}

attachHangarStageDrag(menuHangarPreviewStage);
attachHangarStageDrag(mpHangarPreviewStage);

function renderHangarPreviewToContext(ctx, imgData, drawTurntable = true) {
  if (!ctx || !imgData) return;
  const prevTarget = renderer.getRenderTarget();
  const prevClearColor = renderer.getClearColor(new THREE.Color());
  const prevClearAlpha = renderer.getClearAlpha();

  hangarTurntableGroup.visible = drawTurntable;
  renderer.setRenderTarget(hangarPreviewRT);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(hangarPreviewScene, hangarPreviewCam);
  renderer.readRenderTargetPixels(hangarPreviewRT, 0, 0, HANGAR_PREVIEW_W, HANGAR_PREVIEW_H, hangarPreviewPixels);

  renderer.setClearColor(prevClearColor, prevClearAlpha);
  renderer.setRenderTarget(prevTarget);
  hangarTurntableGroup.visible = true;

  const dst = imgData.data;
  const rowBytes = HANGAR_PREVIEW_W * 4;
  for (let y = 0; y < HANGAR_PREVIEW_H; y++) {
    const srcRow = (HANGAR_PREVIEW_H - 1 - y) * rowBytes;
    const dstRow = y * rowBytes;
    dst.set(hangarPreviewPixels.subarray(srcRow, srcRow + rowBytes), dstRow);
  }
  ctx.putImageData(imgData, 0, 0);
}

function generateShipCardThumbnails() {
  if (!menuPreviewCtx || !menuPreviewImgData) return;
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 88;
  thumbCanvas.height = 64;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (!thumbCtx) return;

  for (const id of SHIP_IDS) {
    if (activeHangarPreviewRig) {
      hangarPreviewScene.remove(activeHangarPreviewRig.group);
    }
    const rig = getHangarPreviewRig(id);
    activeHangarPreviewRig = rig;
    activeHangarPreviewShipId = id;
    rig.group.position.set(0, 0.1, 0);
    rig.group.rotation.order = 'YXZ';
    rig.group.rotation.set(0.32, 0.65, 0);
    rig.visual.rotation.z = -0.18;
    rig.flameL.scale.set(0.85, 0.85, 0.9);
    rig.flameR.scale.set(0.85, 0.85, 0.9);
    hangarPreviewScene.add(rig.group);

    hangarPreviewCam.position.set(0, 3.8, 8.9);
    hangarPreviewCam.lookAt(0, 0.0, 0);

    renderHangarPreviewToContext(menuPreviewCtx, menuPreviewImgData, false);
    thumbCtx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height);
    const cropW = HANGAR_PREVIEW_W * 0.56;
    const cropH = HANGAR_PREVIEW_H * 0.78;
    const cropX = (HANGAR_PREVIEW_W - cropW) * 0.5;
    const cropY = (HANGAR_PREVIEW_H - cropH) * 0.5;
    thumbCtx.drawImage(
      menuHangarPreviewCanvas,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      thumbCanvas.width,
      thumbCanvas.height
    );
    shipThumbDataUrls.set(id, thumbCanvas.toDataURL());
  }
}

function updateHangarPreviewStage(dt, elapsed) {
  if (!menuOpen || gameState !== 'menu') return;
  if (activeMenuView !== 'main' && activeMenuView !== 'mp') return;

  const targetCtx = activeMenuView === 'mp' ? mpPreviewCtx : menuPreviewCtx;
  const targetImgData = activeMenuView === 'mp' ? mpPreviewImgData : menuPreviewImgData;
  if (!targetCtx || !targetImgData) return;

  const shownId = getDisplayedHangarShipId();
  if (activeHangarPreviewShipId !== shownId || !activeHangarPreviewRig) {
    if (activeHangarPreviewRig) {
      hangarPreviewScene.remove(activeHangarPreviewRig.group);
    }
    activeHangarPreviewRig = getHangarPreviewRig(shownId);
    activeHangarPreviewShipId = shownId;
    hangarPreviewScene.add(activeHangarPreviewRig.group);
    syncHangarPreviewHud();
  }

  if (hangarDragPointerId === null) {
    hangarPreviewYaw += dt * 0.65;
  }
  if (hangarShowcasePulse > 0) {
    hangarShowcasePulse = Math.max(0, hangarShowcasePulse - dt * 2.4);
  }

  const rig = activeHangarPreviewRig;
  const bob = Math.sin(elapsed * 2.6) * 0.12;
  const pulseScale = 1.0 + Math.sin(hangarShowcasePulse * Math.PI) * 0.10;
  rig.visual.scale.setScalar(pulseScale);
  rig.group.position.set(0, 0.15 + bob, 0);
  rig.group.rotation.order = 'YXZ';
  rig.group.rotation.y = hangarPreviewYaw;
  rig.group.rotation.x = Math.sin(elapsed * 1.5) * 0.05;
  rig.visual.rotation.z = Math.cos(hangarPreviewYaw) * 0.16;

  const flicker = 0.88 + Math.random() * 0.28;
  const fLen = (1.1 + hangarShowcasePulse * 0.6) * flicker;
  rig.flameL.scale.set(0.95, 0.95, fLen);
  rig.flameR.scale.set(0.95, 0.95, fLen);

  hangarTurntableGroup.rotation.y = hangarPreviewYaw;

  const camDist = 9.8;
  const camY = Math.sin(hangarPreviewPitch) * camDist;
  const camZ = Math.cos(hangarPreviewPitch) * camDist;
  hangarPreviewCam.position.set(0, camY, camZ);
  hangarPreviewCam.lookAt(0, -0.1, 0);

  renderHangarPreviewToContext(targetCtx, targetImgData, true);
}

const ammoPipEls = [];
function rebuildAmmoPips() {
  ammoPipsEl.innerHTML = '';
  ammoPipEls.length = 0;
  for (let i = 0; i < weapons.maxAmmo; i++) {
    const el = document.createElement('span');
    el.className = 'ammo-pip ready';
    ammoPipsEl.appendChild(el);
    ammoPipEls.push(el);
  }
}
rebuildAmmoPips();

function isShipLocked() {
  if (gameState === 'playing') return true;
  if (mp.status === 'CONNECTING') return true;
  if (mp.role === 'guest' && mp.isActive()) return true;
  return false;
}

function createShipCardEl(id, locked) {
  const spec = SHIP_CATALOG[id];
  const card = document.createElement('button');
  card.type = 'button';
  card.dataset.shipId = id;
  card.className = 'ship-card' + (jet.shipId === id ? ' selected' : '') + (locked ? ' locked' : '');
  card.disabled = locked;

  const spdPct = Math.round((spec.abSpeed / 120) * 100);
  const agiPct = Math.round((spec.turnRate / 1.65) * 100);
  const maxCatalogHp = Math.max(150, ...SHIP_IDS.map((k) => SHIP_CATALOG[k].maxHp || 150));
  const hpPct = Math.min(100, Math.round((spec.maxHp / maxCatalogHp) * 100));
  const mslPct = Math.round((spec.maxMissiles / 8) * 100);
  const thumbUrl = shipThumbDataUrls.get(id) || '';

  card.innerHTML = `
    <div class="ship-card-top-row">
      ${thumbUrl ? `<img class="ship-card-thumb" src="${thumbUrl}" alt="${spec.name}" />` : ''}
      <div class="ship-card-info">
        <div class="ship-card-head">
          <span class="ship-card-name"><span class="ship-swatch" style="background:${spec.palette.base};border-color:${spec.palette.accent}"></span>${spec.name}</span>
          <span class="ship-card-role">${spec.role}</span>
        </div>
        <div class="ship-stats">
          <div class="ship-stat-row"><span>SPD</span><div class="ship-stat-bar"><div class="ship-stat-fill" style="width:${spdPct}%"></div></div></div>
          <div class="ship-stat-row"><span>AGI</span><div class="ship-stat-bar"><div class="ship-stat-fill" style="width:${agiPct}%"></div></div></div>
          <div class="ship-stat-row"><span>HP</span><div class="ship-stat-bar"><div class="ship-stat-fill" style="width:${hpPct}%;background:#4cff88"></div></div></div>
          <div class="ship-stat-row"><span>MSL</span><div class="ship-stat-bar"><div class="ship-stat-fill" style="width:${mslPct}%;background:#ffb842"></div></div></div>
        </div>
      </div>
    </div>
  `;
  return card;
}

function renderAllHangars() {
  if (shipThumbDataUrls.size === 0) {
    generateShipCardThumbnails();
  }
  const locked = isShipLocked();
  if (locked) hoveredShipId = null;
  if (menuHangarCount) {
    menuHangarCount.textContent = String(SHIP_IDS.length);
  }
  for (const container of [menuHangarList, mpHangarList]) {
    if (!container) continue;
    container.innerHTML = '';
    for (const id of SHIP_IDS) {
      const card = createShipCardEl(id, locked);
      card.addEventListener('click', () => selectShip(id));
      card.addEventListener('pointerenter', () => {
        if (!isShipLocked() && hoveredShipId !== id) {
          hoveredShipId = id;
          syncHangarPreviewHud();
        }
      });
      card.addEventListener('pointerleave', () => {
        if (hoveredShipId === id) {
          hoveredShipId = null;
          syncHangarPreviewHud();
        }
      });
      container.appendChild(card);
    }
  }
  if (mpHangarLockNote) {
    mpHangarLockNote.textContent = locked ? '🔒 BLOQUEADO' : 'SELECIONE';
    mpHangarLockNote.className = 'mp-badge ' + (locked ? 'offline' : 'connecting');
  }
  if (menuLockedShipCard) {
    menuLockedShipCard.innerHTML = '';
    menuLockedShipCard.appendChild(createShipCardEl(jet.shipId, true));
  }
  syncHangarPreviewHud();
}

function selectShip(shipId) {
  if (!SHIP_CATALOG[shipId]) return false;
  if (isShipLocked()) {
    weapons.killBannerText = 'NAVE BLOQUEADA APÓS INICIAR!';
    weapons.killBannerTimer = 1.6;
    sound.playEmpty();
    return false;
  }
  hoveredShipId = null;
  hangarShowcasePulse = 1.0;
  jet.setShip(shipId);
  jet.visual.scale.setScalar(0.74 / Math.sqrt(viewSettings.objDist));
  weapons.setShipStats(jet.stats);
  rebuildAmmoPips();
  mp.setLocalShip(shipId);
  try {
    localStorage.setItem('sunsetStriker_shipId', shipId);
  } catch (_) {}
  renderAllHangars();
  sound.playSwitch();
  return true;
}

// =========================================================================
// Terrain Settings & Multiplayer Host Inheritance
// =========================================================================
function isTerrainLocked() {
  return gameMode === 'multiplayer' || mp.isActive() || mp.status === 'CONNECTING';
}

function formatTerrainSummary(opts) {
  const tLabel = TERRAIN_THEME_LABELS[opts.theme] || opts.theme;
  const dLabel = TERRAIN_DEFORM_LABELS[opts.deformMode] || opts.deformMode;
  const cLabel = TERRAIN_CLOUD_LABELS[opts.clouds] || opts.clouds;
  const sLabel = opts.seed || DEFAULT_WORLD_SEED;
  return `SEED ${sLabel} · ${tLabel} · ${dLabel} · ${cLabel}`;
}

function applyTerrainSettings(opts, persistSolo = true) {
  const clean = sanitizeTerrainObj(opts);
  activeTerrain = world.applyTerrainOptions(clean);
  if (persistSolo) {
    localSoloTerrain = { ...clean };
    writeJsonStorage('sunsetStriker_terrainSettings', localSoloTerrain);
  }
  syncTerrainUI();
}

function syncTerrainUI() {
  const locked = isTerrainLocked();
  if (terrainSeedInput) {
    terrainSeedInput.value = activeTerrain.seed || DEFAULT_WORLD_SEED;
    terrainSeedInput.disabled = locked;
  }
  if (terrainSeedApplyBtn) terrainSeedApplyBtn.disabled = locked;
  if (terrainSeedRandomBtn) terrainSeedRandomBtn.disabled = locked;
  terrainThemeSelect.value = activeTerrain.theme;
  terrainDeformSelect.value = activeTerrain.deformMode;
  terrainCloudsSelect.value = activeTerrain.clouds;

  terrainThemeSelect.disabled = locked;
  terrainDeformSelect.disabled = locked;
  terrainCloudsSelect.disabled = locked;
  rebuildTerrainBtn.disabled = locked;
  if (mpEditTerrainBtn) mpEditTerrainBtn.disabled = locked;

  if (terrainChunkInfo) {
    terrainChunkInfo.textContent = `MUNDO INFINITO POR CHUNKS (${world.getLoadedChunkCount()} ATIVOS) · CULLING AUTOMÁTICO`;
  }

  if (locked) {
    terrainLockBanner.classList.remove('hidden');
    terrainLockBanner.textContent = mp.role === 'guest'
      ? '🔒 Herdado do Host (seed e opções de terreno bloqueadas no Multiplayer)'
      : '🔒 Seed e opções de terreno bloqueadas durante sala/partida Multiplayer';
  } else {
    terrainLockBanner.classList.add('hidden');
  }

  const summary = formatTerrainSummary(activeTerrain);
  if (menuTerrainChip) {
    menuTerrainChip.textContent = `TERRENO: ${summary}`;
  }
  if (mpTerrainText) {
    mpTerrainText.textContent = mp.role === 'guest' && mp.isActive()
      ? `🔒 Herdado do Host: ${summary}`
      : summary;
  }
  if (menuMatchTerrain) {
    menuMatchTerrain.textContent = locked
      ? `TERRENO: 🔒 ${summary} (Host)`
      : `TERRENO: ${summary}`;
  }
}

function commitSeedFromInput(rawSeed) {
  if (isTerrainLocked()) return;
  const cleanSeed = sanitizeSeedString(rawSeed);
  if (terrainSeedInput) terrainSeedInput.value = cleanSeed;
  applyTerrainSettings({ ...activeTerrain, seed: cleanSeed }, true);
  sound.playSwitch();
}

if (terrainSeedApplyBtn) {
  terrainSeedApplyBtn.addEventListener('click', () => {
    commitSeedFromInput(terrainSeedInput ? terrainSeedInput.value : DEFAULT_WORLD_SEED);
  });
}

if (terrainSeedInput) {
  terrainSeedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitSeedFromInput(terrainSeedInput.value);
    }
  });
  terrainSeedInput.addEventListener('change', () => {
    commitSeedFromInput(terrainSeedInput.value);
  });
}

if (terrainSeedRandomBtn) {
  terrainSeedRandomBtn.addEventListener('click', () => {
    if (isTerrainLocked()) return;
    commitSeedFromInput(generateRandomSeed());
  });
}

terrainThemeSelect.addEventListener('change', () => {
  if (isTerrainLocked()) return;
  applyTerrainSettings({ ...activeTerrain, theme: terrainThemeSelect.value }, true);
  sound.playSwitch();
});

terrainDeformSelect.addEventListener('change', () => {
  if (isTerrainLocked()) return;
  applyTerrainSettings({ ...activeTerrain, deformMode: terrainDeformSelect.value }, true);
  sound.playSwitch();
});

terrainCloudsSelect.addEventListener('change', () => {
  if (isTerrainLocked()) return;
  applyTerrainSettings({ ...activeTerrain, clouds: terrainCloudsSelect.value }, true);
  sound.playSwitch();
});

rebuildTerrainBtn.addEventListener('click', () => {
  if (isTerrainLocked()) {
    syncTerrainUI();
    sound.playEmpty();
    return;
  }
  world.resetTerrain();
  sound.playSwitch();
});

// =========================================================================
// Audio Settings & Controls Settings UI
// =========================================================================
function syncAudioUI() {
  audioEnabledBtn.textContent = audioSettings.enabled ? 'SOM: LIGADO' : 'SOM: DESLIGADO';
  audioEnabledBtn.classList.toggle('active', audioSettings.enabled);
  audioMasterSlider.value = String(Math.round(audioSettings.master * 100));
  audioMasterVal.textContent = `${Math.round(audioSettings.master * 100)}%`;
  audioEngineSlider.value = String(Math.round(audioSettings.engine * 100));
  audioEngineVal.textContent = `${Math.round(audioSettings.engine * 100)}%`;
  audioSfxSlider.value = String(Math.round(audioSettings.sfx * 100));
  audioSfxVal.textContent = `${Math.round(audioSettings.sfx * 100)}%`;
}

function saveAudioSettings() {
  writeJsonStorage('sunsetStriker_audioSettings', audioSettings);
}

function setAudioEnabled(on) {
  audioSettings.enabled = Boolean(on);
  sound.setEnabled(audioSettings.enabled);
  sound.setPaused(menuOpen || gameState !== 'playing');
  saveAudioSettings();
  syncAudioUI();
}

function toggleSound() {
  setAudioEnabled(!audioSettings.enabled);
}

audioEnabledBtn.addEventListener('click', () => {
  setAudioEnabled(!audioSettings.enabled);
  if (audioSettings.enabled) sound.playSwitch();
});

audioMasterSlider.addEventListener('input', () => {
  audioSettings.master = Number(audioMasterSlider.value) / 100;
  sound.setVolumes({ master: audioSettings.master });
  saveAudioSettings();
  syncAudioUI();
});

audioEngineSlider.addEventListener('input', () => {
  audioSettings.engine = Number(audioEngineSlider.value) / 100;
  sound.setVolumes({ engine: audioSettings.engine });
  saveAudioSettings();
  syncAudioUI();
});

audioSfxSlider.addEventListener('input', () => {
  audioSettings.sfx = Number(audioSfxSlider.value) / 100;
  sound.setVolumes({ sfx: audioSettings.sfx });
  saveAudioSettings();
  syncAudioUI();
});

audioTestBtn.addEventListener('click', () => {
  audioSettings.enabled = true;
  sound.setVolumes({ master: audioSettings.master, engine: audioSettings.engine, sfx: audioSettings.sfx });
  sound.playTestTone();
  saveAudioSettings();
  syncAudioUI();
});

function formatKeyLabel(code) {
  if (!code) return '-';
  if (code === 'Space') return 'SPACE';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT';
  if (code === 'Enter' || code === 'NumpadEnter') return 'ENTER';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  return code.toUpperCase();
}

function saveControlSettings() {
  writeJsonStorage('sunsetStriker_controls', controlSettings);
}

function renderBindingsList() {
  ctrlBindingsList.innerHTML = '';
  for (const meta of BINDING_META) {
    const row = document.createElement('div');
    row.className = 'ctrl-bind-row';

    const lbl = document.createElement('span');
    lbl.textContent = meta.label;

    const btn = document.createElement('button');
    btn.type = 'button';
    const listening = rebindingAction === meta.id;
    btn.className = 'ctrl-bind-btn' + (listening ? ' listening' : '');
    btn.textContent = listening ? 'TECLA...' : formatKeyLabel(controlSettings.bindings[meta.id]);
    btn.addEventListener('click', () => {
      rebindingAction = listening ? null : meta.id;
      renderBindingsList();
    });

    row.append(lbl, btn);
    ctrlBindingsList.appendChild(row);
  }
}

function syncGamepadStatusUI(connected = gamepad.connected, id = gamepad.gamepadId) {
  if (!ctrlGamepadStatus) return;
  if (connected) {
    ctrlGamepadStatus.textContent = `CONECTADO: ${(id || 'GAMEPAD').slice(0, 26)}`;
    ctrlGamepadStatus.className = 'gamepad-status-badge connected';
  } else {
    ctrlGamepadStatus.textContent = 'NENHUM DETECTADO';
    ctrlGamepadStatus.className = 'gamepad-status-badge disconnected';
  }
}

const gamepad = new GamepadController({
  deadzone: controlSettings.gamepadDeadzone,
  onConnectionChange({ connected, id }) {
    syncGamepadStatusUI(connected, id);
    if (!connected) {
      input.gamepadActive = false;
      input.joyX = 0;
      input.joyY = 0;
      input.joyBoost = false;
      input.joyCannon = false;
      input.joyLookBack = false;
    }
    if (gameState === 'playing') {
      weapons.killBannerText = connected ? 'JOYSTICK CONECTADO' : 'JOYSTICK DESCONECTADO';
      weapons.killBannerTimer = 1.8;
    }
  },
});

let detectedTouchDevice = TouchController.isTouchDevice();
let lastTouchAt = 0;

function shouldUseTouchControls() {
  if (controlSettings.touchMode === 'on') return true;
  if (controlSettings.touchMode === 'off') return false;
  return detectedTouchDevice;
}

const touchControls = new TouchController({
  rootEl: mobileControlsEl,
  stickZoneEl: touchStickZoneEl,
  stickKnobEl: touchStickKnobEl,
  fireBtnEl: touchBtnFire,
  missileBtnEl: touchBtnMissile,
  boostBtnEl: touchBtnBoost,
  rollBtnEl: touchBtnRoll,
  camBtnEl: touchBtnCam,
  rearBtnEl: touchBtnRear,
  onMissile: () => {
    if (!menuOpen && gameState === 'playing' && jet.alive) {
      weapons.tryFireMissile(jet);
    }
  },
  onRoll: (sx) => {
    if (!menuOpen && gameState === 'playing' && jet.alive) {
      jet.triggerRoll(sx < -0.15 ? -1 : 1);
    }
  },
  onCamera: () => {
    if (!menuOpen && gameState === 'playing') {
      setCameraMode(camModeIdx + 1);
    }
  },
  onAnyTouch: () => {
    lastTouchAt = performance.now();
    detectedTouchDevice = true;
    input.touchActive = true;
    input.gamepadActive = false;
  },
});

function syncControlsUI() {
  if (ctrlTouchModeSelect) {
    ctrlTouchModeSelect.value = controlSettings.touchMode;
  }
  ctrlInvertYBtn.textContent = controlSettings.invertY ? 'SIM' : 'NÃO';
  ctrlInvertYBtn.classList.toggle('active', controlSettings.invertY);
  if (ctrlGamepadInvertYBtn) {
    ctrlGamepadInvertYBtn.textContent = controlSettings.gamepadInvertY ? 'SIM' : 'NÃO';
    ctrlGamepadInvertYBtn.classList.toggle('active', controlSettings.gamepadInvertY);
  }
  ctrlSensSlider.value = controlSettings.mouseSensitivity.toFixed(2);
  ctrlSensVal.textContent = `${controlSettings.mouseSensitivity.toFixed(2)}x`;
  if (ctrlDeadzoneSlider) {
    ctrlDeadzoneSlider.value = controlSettings.gamepadDeadzone.toFixed(2);
    ctrlDeadzoneVal.textContent = `${Math.round(controlSettings.gamepadDeadzone * 100)}%`;
  }
  gamepad.setDeadzone(controlSettings.gamepadDeadzone);
  syncGamepadStatusUI();

  const b = controlSettings.bindings;
  if (hudKeyMissile) hudKeyMissile.textContent = formatKeyLabel(b.missile);
  if (hudKeyCockpit) hudKeyCockpit.textContent = formatKeyLabel(b.cockpit);
  if (hudKeyCam) hudKeyCam.textContent = formatKeyLabel(b.camera);

  if (guideKeyAfterburner) guideKeyAfterburner.textContent = formatKeyLabel(b.afterburner);
  if (guideKeyMissile) guideKeyMissile.textContent = formatKeyLabel(b.missile);
  if (guideKeyCockpit) guideKeyCockpit.textContent = formatKeyLabel(b.cockpit);
  if (guideKeyCam) guideKeyCam.textContent = formatKeyLabel(b.camera);
  if (guideKeyLookBack) guideKeyLookBack.textContent = formatKeyLabel(b.lookBack);
  if (guideKeyMute) guideKeyMute.textContent = formatKeyLabel(b.mute);
  if (guideKeyRestore) guideKeyRestore.textContent = formatKeyLabel(b.restoreTerrain);
  if (guideKeyStyle) guideKeyStyle.textContent = formatKeyLabel(b.cycleStyle);

  input.sensitivity = controlSettings.mouseSensitivity;
  input.invertY = controlSettings.invertY;
  input.gamepadInvertY = controlSettings.gamepadInvertY;
  input.afterburnerKey = b.afterburner;

  renderBindingsList();
}

ctrlInvertYBtn.addEventListener('click', () => {
  controlSettings.invertY = !controlSettings.invertY;
  saveControlSettings();
  syncControlsUI();
  sound.playSwitch();
});

ctrlGamepadInvertYBtn.addEventListener('click', () => {
  controlSettings.gamepadInvertY = !controlSettings.gamepadInvertY;
  saveControlSettings();
  syncControlsUI();
  sound.playSwitch();
});

ctrlSensSlider.addEventListener('input', () => {
  controlSettings.mouseSensitivity = Number(ctrlSensSlider.value);
  saveControlSettings();
  syncControlsUI();
});

ctrlDeadzoneSlider.addEventListener('input', () => {
  controlSettings.gamepadDeadzone = Number(ctrlDeadzoneSlider.value);
  gamepad.setDeadzone(controlSettings.gamepadDeadzone);
  saveControlSettings();
  syncControlsUI();
});

if (ctrlTouchModeSelect) {
  ctrlTouchModeSelect.addEventListener('change', () => {
    controlSettings.touchMode = ['auto', 'on', 'off'].includes(ctrlTouchModeSelect.value)
      ? ctrlTouchModeSelect.value
      : 'auto';
    if (!shouldUseTouchControls()) {
      input.touchActive = false;
      input.touchX = 0;
      input.touchY = 0;
      input.touchBoost = false;
      input.touchCannon = false;
      input.touchLookBack = false;
      touchControls.reset();
    }
    saveControlSettings();
    syncControlsUI();
    syncHudVisibility();
    sound.playSwitch();
  });
}

ctrlResetBtn.addEventListener('click', () => {
  rebindingAction = null;
  controlSettings.invertY = DEFAULT_CONTROLS.invertY;
  controlSettings.gamepadInvertY = DEFAULT_CONTROLS.gamepadInvertY;
  controlSettings.mouseSensitivity = DEFAULT_CONTROLS.mouseSensitivity;
  controlSettings.gamepadDeadzone = DEFAULT_CONTROLS.gamepadDeadzone;
  controlSettings.touchMode = DEFAULT_CONTROLS.touchMode;
  controlSettings.bindings = { ...DEFAULT_BINDINGS };
  saveControlSettings();
  syncControlsUI();
  syncHudVisibility();
  sound.playSwitch();
});

// =========================================================================
// 3 Camera Modes & Exclusive Render Settings (Settings -> Render)
// =========================================================================
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
  const showCockpit = isCockpit && gameState === 'playing' && !menuOpen;
  jet.setVisible((!isCockpit || gameState !== 'playing' || menuOpen) && jet.alive);
  cockpit.setVisible(showCockpit);
  hudBottomLeft.classList.toggle('hidden', isCockpit || gameState !== 'playing' || menuOpen);
  postMat.uniforms.uOutlineEnabled.value = (!showCockpit || remoteJets.size > 0) ? 1.0 : 0.0;
  if (gameState === 'playing' && !menuOpen) sound.playSwitch();
}

function toggleCockpit() {
  if (CAMERA_MODES[camModeIdx].id === 'COCKPIT') {
    setCameraMode(lastExternalMode);
  } else {
    setCameraMode(1);
  }
}

function applyRenderSettings() {
  const { w, h } = getViewportSize();
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

  const cpH = 270;
  const cpW = Math.max(360, Math.round(cpH * (w / h)));
  cockpitCanvas.width = cpW;
  cockpitCanvas.height = cpH;
  cockpit.w = cpW;
  cockpit.h = cpH;

  world.setTerrainGrain(renderSettings.terrainGrain);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  styleSelect.value = renderSettings.id;
  resSelect.value = String(renderSettings.resHeight);
  ditherSlider.value = renderSettings.dither.toFixed(2);
  ditherVal.textContent = `${Math.round(renderSettings.dither * 100)}%`;
}

function selectRenderPreset(presetId) {
  const p = RENDER_PRESETS[presetId];
  if (!p) return;
  Object.assign(renderSettings, p);
  try {
    localStorage.setItem('sunsetStriker_renderStyle', presetId);
  } catch (_) {}
  applyRenderSettings();
  if (gameState === 'playing' || menuOpen) sound.playSwitch();
}

function cycleRenderPreset() {
  const idx = PRESET_ORDER.indexOf(renderSettings.id);
  const nextId = PRESET_ORDER[(idx + 1) % PRESET_ORDER.length];
  selectRenderPreset(nextId);
}

function syncViewUI(persist = true) {
  fovSlider.value = String(viewSettings.fov);
  fovVal.innerHTML = `${Math.round(viewSettings.fov)}&deg;`;
  distSlider.value = viewSettings.camDist.toFixed(2);
  distVal.textContent = `${viewSettings.camDist.toFixed(2)}x`;
  scaleSlider.value = viewSettings.objDist.toFixed(2);
  scaleVal.textContent = `${viewSettings.objDist.toFixed(2)}x`;
  distBadge.textContent = `FOV ${Math.round(viewSettings.fov)}° · DIST ${viewSettings.camDist.toFixed(2)}x`;

  const objScale = 0.74 / Math.sqrt(viewSettings.objDist);
  jet.visual.scale.setScalar(objScale);
  for (const rj of remoteJets.values()) {
    rj.visual.scale.setScalar(objScale);
  }
  if (persist) writeJsonStorage('sunsetStriker_viewSettings', viewSettings);
}

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

// =========================================================================
// WebRTC P2P Multiplayer Setup
// =========================================================================
const remoteJets = new Map();
const remoteLabelEls = new Map();

function ensureRemoteLabel(id, name, color) {
  let rec = remoteLabelEls.get(id);
  if (!rec) {
    const el = document.createElement('div');
    el.className = 'remote-tag hidden';
    const nameEl = document.createElement('div');
    const bar = document.createElement('div');
    bar.className = 'remote-tag-bar';
    const fillEl = document.createElement('div');
    fillEl.className = 'remote-tag-fill';
    fillEl.style.width = '100%';
    bar.appendChild(fillEl);
    el.append(nameEl, bar);
    remoteLabelsEl.appendChild(el);
    rec = { el, nameEl, fillEl };
    remoteLabelEls.set(id, rec);
  }
  rec.nameEl.style.color = color || '#ffffff';
  rec.nameEl.textContent = name || 'PILOT';
  return rec;
}

function removeRemotePilot(id) {
  const rj = remoteJets.get(id);
  if (rj) {
    rj.dispose();
    remoteJets.delete(id);
  }
  const rec = remoteLabelEls.get(id);
  if (rec) {
    rec.el.remove();
    remoteLabelEls.delete(id);
  }
}

function clearAllRemotePilots() {
  for (const id of Array.from(remoteJets.keys())) {
    removeRemotePilot(id);
  }
}

function spawnRemotePilot(id, name, color, shipId = 'striker') {
  if (remoteJets.has(id)) return remoteJets.get(id);
  const rj = new RemoteJet(scene, id, name, color, shipId);
  rj.visual.scale.setScalar(0.74 / Math.sqrt(viewSettings.objDist));
  remoteJets.set(id, rj);
  ensureRemoteLabel(id, name, color);
  return rj;
}

function renderRosterInto(targetEl, list) {
  if (!targetEl) return;
  targetEl.innerHTML = '';
  for (const item of list) {
    const row = document.createElement('div');
    row.className = 'mp-roster-item';

    const left = document.createElement('span');
    left.className = 'mp-roster-left';
    const dot = document.createElement('span');
    dot.className = 'mp-status-dot';
    dot.style.background = item.color || '#ffffff';

    const label = document.createElement('span');
    const tags = [];
    if (item.isHost) tags.push('HOST');
    if (item.id === mp.localId) tags.push('VOCÊ');
    label.textContent = tags.length ? `${item.name} [${tags.join(',')}]` : item.name;
    left.append(dot, label);

    const ping = document.createElement('span');
    ping.className = 'mp-roster-ping';
    ping.textContent = item.id === mp.localId ? 'LOCAL' : `${item.ping || 0}ms`;

    row.append(left, ping);
    targetEl.appendChild(row);
  }
}

const mp = new MultiplayerManager({
  onStatusChange({ status, transport, relayActive, roomCode, message }) {
    mpStatusBadge.textContent = status;
    mpStatusBadge.className = `mp-badge ${status.toLowerCase()}`;

    const inRoom = status === 'HOSTING' || status === 'CONNECTED';
    mpLobbyView.classList.toggle('hidden', inRoom);
    mpRoomView.classList.toggle('hidden', !inRoom);

    if (inRoom) {
      mpRoomCode.textContent = roomCode;
      if (menuPauseRoomCode) menuPauseRoomCode.textContent = roomCode;
      if (mpLaunchBtn) {
        const waitingHost = mp.role === 'guest' && !mp.matchStarted;
        mpLaunchBtn.disabled = waitingHost;
        mpLaunchBtn.textContent = waitingHost ? 'AGUARDANDO O HOST INICIAR...' : 'INICIAR PARTIDA (DECOLAR)';
      }
      if (transport === 'php') {
        mpTransportInfo.textContent = 'WEBRTC P2P · SIGNALING LOCAL PHP';
      } else if (transport === 'relay') {
        mpTransportInfo.textContent = 'RELAY WSS · ANTI-CGNAT';
      } else if (transport === 'peerjs' && relayActive) {
        mpTransportInfo.textContent = 'HÍBRIDO · WEBRTC P2P + RELAY WSS';
      } else {
        mpTransportInfo.textContent = 'WEBRTC P2P · SIGNALING CLOUD';
      }
    }
    if (message !== undefined) {
      mpMsg.textContent = message;
    }
    renderAllHangars();
    syncTerrainUI();
    syncHudVisibility();
  },
  onRosterChange(list) {
    renderRosterInto(mpRoster, list);
    renderRosterInto(menuPauseRoster, list);
    if (hudMpRoomLabel && mp.isActive()) {
      hudMpRoomLabel.textContent = `SALA: ${mp.roomCode} · ${list.length}P`;
    }
  },
  onTerrainConfig(cfg) {
    world.resetTerrain();
    applyTerrainSettings(cfg, false);
    if (mpMsg) {
      mpMsg.textContent = `Terreno herdado do Host: ${formatTerrainSummary(activeTerrain)}`;
    }
  },
  onPeerJoined(peer) {
    spawnRemotePilot(peer.id, peer.name, peer.color, peer.ship || 'striker');
    if (gameState === 'playing') {
      weapons.killBannerText = `${peer.name} ENTROU!`;
      weapons.killBannerTimer = 2.0;
      sound.playSwitch();
    }
  },
  onPeerLeft(peerId) {
    removeRemotePilot(peerId);
  },
  onMatchStart() {
    startMultiplayerMatch();
  },
  onRemoteState(peerId, st) {
    let rj = remoteJets.get(peerId);
    if (!rj) {
      const rInfo = mp.roster.get(peerId);
      rj = spawnRemotePilot(peerId, rInfo?.name || 'PILOT', rInfo?.color || '#36d6ff', st.sh || rInfo?.ship || 'striker');
    }
    rj.applyNetworkState(st);
    if (st.sc !== undefined && rj.shipsDestroyed !== (st.sc | 0)) {
      rj.shipsDestroyed = st.sc | 0;
      updateWinsHUD();
    }
  },
  onSyncSnapshot(deforms, damages) {
    for (const d of deforms) {
      weapons.applyRemoteDeform(d.x, d.z, d.r, d.d, d.dx, d.dz);
    }
    for (const g of damages) {
      weapons.applyRemoteDamage(g.x, g.y, g.z, g.r, g.w, clock.elapsedTime);
    }
  },
  onRemoteEvent(ev) {
    if (ev.t === 'gun') {
      weapons.spawnRemoteCannon(ev.o, ev.d, ev.sp);
      remoteJets.get(ev.from)?.triggerMuzzleFlash();
    } else if (ev.t === 'msl') {
      weapons.spawnRemoteMissile(ev.o, ev.d, ev.sp, ev.tid, ev.from, jet, mp.localId);
    } else if (ev.t === 'ship') {
      const rj = remoteJets.get(ev.id || ev.from);
      if (rj && ev.sh) rj.setShip(ev.sh);
    } else if (ev.t === 'pk') {
      if (ev.id) world.consumePickupById(ev.id);
    } else if (ev.t === 'drop') {
      world.spawnDroppedPickup(ev.kind, ev.x, ev.y, ev.z, ev.id);
    } else if (ev.t === 'def') {
      weapons.applyRemoteDeform(ev.x, ev.z, ev.r, ev.d, ev.dx, ev.dz);
    } else if (ev.t === 'win') {
      const rj = remoteJets.get(ev.from);
      if (rj) rj.wins = (rj.wins || 0) + 1;
      triggerMatchComplete(ev.winner || rj?.callsign || 'PILOTO', false);
    } else if (ev.t === 'dmg') {
      weapons.applyRemoteDamage(ev.x, ev.y, ev.z, ev.r, ev.w, clock.elapsedTime);
    } else if (ev.t === 'rst') {
      world.resetTerrain();
      weapons.killBannerText = 'MOUNTAINS RESTORED';
      weapons.killBannerTimer = 1.6;
    } else if (ev.t === 'hit') {
      if (gameState === 'playing' && ev.target === mp.localId && jet.alive) {
        jet.hp = Math.max(0, jet.hp - (ev.dmg || 20));
        jet.damageCooldown = 6.0;
        weapons.shake = Math.max(weapons.shake, 0.55);
        sound.playImpact(false);
        if (jet.hp <= 0) {
          killLocalJet('ABATIDO', ev.from);
        }
      }
    } else if (ev.t === 'down') {
      const victim = remoteJets.get(ev.id);
      if (victim) {
        weapons.spawnJetExplosion(victim.position, clock.elapsedTime);
        if (gameState === 'playing') {
          weapons.killBannerText = `${victim.name} ABATIDO!`;
          weapons.killBannerTimer = 2.0;
        }
      }
    }
  },
});

const OBJECTIVE_SHIP_GOAL = 20;
let matchEndTimer = 0;
let matchEndActive = false;

function buildMatchEndScoreboard() {
  if (!matchEndScoreboard) return;
  const rows = [];
  const localName = mp.isActive() ? (mp.localName || 'VOCÊ') : 'VOCÊ (SOLO)';
  rows.push({ name: localName, ships: objective.shipsDestroyed, total: weapons.destroyed, isLocal: true });
  if (mp.isActive() && remoteJets) {
    for (const [pid, rj] of remoteJets.entries()) {
      rows.push({
        name: rj.callsign || `PILOTO ${String(pid).slice(0, 4)}`,
        ships: rj.shipsDestroyed || 0,
        total: rj.destroyed || 0,
        isLocal: false,
      });
    }
  }
  rows.sort((a, b) => b.ships - a.ships || b.total - a.total);
  matchEndScoreboard.innerHTML = rows
    .map(
      (r, idx) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:${
          r.isLocal ? 'rgba(255,180,60,0.16)' : 'rgba(255,255,255,0.06)'
        };border:1px solid ${r.isLocal ? 'rgba(255,190,80,0.55)' : 'rgba(255,255,255,0.14)'};border-radius:6px;font-size:13px;">` +
        `<span><b>#${idx + 1}</b> ${r.name}</span>` +
        `<span><b>${r.ships}</b> navios &middot; ${r.total} alvos</span>` +
        `</div>`
    )
    .join('');
}

function triggerMatchComplete(winnerName = null, isLocalWin = true) {
  if (matchEndActive) return;
  matchEndActive = true;
  matchEndTimer = 6.0;
  const localName = mp.isActive() ? (mp.localName || 'Você') : 'Você';
  const finalWinner = winnerName || localName;
  if (isLocalWin) {
    objective.wins = (objective.wins || 0) + 1;
    if (mp.isActive()) {
      mp.sendEvent({ t: 'win', winner: localName });
    }
  }
  if (matchEndWinner) {
    matchEndWinner.textContent = `VENCEDOR: ${String(finalWinner).toUpperCase()}`;
  }
  buildMatchEndScoreboard();
  updateObjectiveHUD();
  if (matchEndCountdown) matchEndCountdown.textContent = 'Recomeçando em 6s...';
  if (matchEndOverlay) matchEndOverlay.classList.remove('hidden');
}

function restartMatchAfterComplete() {
  if (!matchEndActive) return;
  matchEndActive = false;
  matchEndTimer = 0;
  if (matchEndOverlay) matchEndOverlay.classList.add('hidden');
  resetObjective();
  weapons.destroyed = 0;
  weapons.resetAmmo();
  jet.reset();
  if (gameMode === 'solo' && !mp.isActive()) {
    world.resetTerrain();
  }
}

matchEndRestartBtn?.addEventListener('click', restartMatchAfterComplete);

const objective = {
  shipsDestroyed: 0,
  goal: OBJECTIVE_SHIP_GOAL,
  completed: false,
  wins: 0,
};

function updateWinsHUD() {
  if (!objWinsListEl) return;
  const rows = [];
  const localName = mp.isActive() ? (mp.localName || 'Você') : 'Você';
  rows.push({
    name: localName,
    score: Math.min(objective.goal, objective.shipsDestroyed || 0),
    wins: objective.wins || 0,
    isLocal: true,
  });
  if (mp.isActive() && remoteJets) {
    for (const [pid, rj] of remoteJets.entries()) {
      rows.push({
        name: rj.callsign || `Piloto ${String(pid).slice(0, 4)}`,
        score: Math.min(objective.goal, rj.shipsDestroyed || 0),
        wins: rj.wins || 0,
        isLocal: false,
      });
    }
  }
  rows.sort((a, b) => (b.score - a.score) || (b.wins - a.wins));
  const html = rows
    .map((r) => `<div>${r.isLocal ? '<b>' + r.name + '</b>' : r.name}: <b>${r.score}/${objective.goal}</b> <span style="opacity:0.75">(${r.wins} vit.)</span></div>`)
    .join('');
  if (objWinsListEl._lastHtml !== html) {
    objWinsListEl._lastHtml = html;
    objWinsListEl.innerHTML = html;
  }
}

function updateObjectiveHUD() {
  const cur = Math.min(objective.goal, objective.shipsDestroyed);
  const pct = Math.max(0, Math.min(100, (objective.shipsDestroyed / objective.goal) * 100));
  objCountEl.textContent = `${cur} / ${objective.goal}`;
  objBarFillEl.style.width = `${pct}%`;
  objectiveHudEl.classList.toggle('complete', objective.completed);
  objTitleEl.textContent = objective.completed
    ? 'OBJETIVO COMPLETO!'
    : 'OBJETIVO: DESTRUIR NAVIOS';
  updateWinsHUD();
}

function resetObjective() {
  objective.shipsDestroyed = 0;
  objective.completed = false;
  updateObjectiveHUD();
}

weapons.netHooks.onLocalDamage = (dmg = 35, reason = 'MÍSSIL NAVAL') => {
  if (gameState !== 'playing' || !jet.alive) return;
  jet.hp = Math.max(0, jet.hp - dmg);
  jet.damageCooldown = 6.0;
  weapons.shake = Math.max(weapons.shake, 0.55);
  sound.playImpact(false);
  if (jet.hp <= 0) {
    killLocalJet(reason);
  }
};

function killLocalJet(reason, killerId = null) {
  if (!jet.alive) return;
  jet.hp = 0;
  jet.alive = false;
  jet.respawnTimer = 3.0;
  jet.fallVel = jet.getForwardDirection().multiplyScalar(Math.max(55, jet.speed * 0.65));
  jet.setVisible(true);
  weapons.spawnJetExplosion(jet.position, clock.elapsedTime);
  resetObjective();
  weapons.killBannerText = killerId
    ? 'ABATIDO! OBJETIVO ZERADO (0/20)'
    : `EXPLODIU (${reason})! OBJETIVO ZERADO (0/20)`;
  weapons.killBannerTimer = 2.6;
  mp.sendEvent({ t: 'down', id: mp.localId, killer: killerId, reason });
}

updateObjectiveHUD();

weapons.setNetHooks({
  getRemoteJets: () => remoteJets,
  onLocalDamage(dmg = 35, reason = 'MÍSSIL NAVAL') {
    if (gameState !== 'playing' || !jet.alive) return;
    jet.hp = Math.max(0, jet.hp - dmg);
    jet.damageCooldown = 6.0;
    weapons.shake = Math.max(weapons.shake, 0.55);
    sound.playImpact(false);
    if (jet.hp <= 0) {
      killLocalJet(reason);
    }
  },
  onTargetKilled(o) {
    if (o.type === 'ship') {
      objective.shipsDestroyed++;
      if (!objective.completed && objective.shipsDestroyed >= objective.goal) {
        objective.completed = true;
        sound.playPickup('health');
        weapons.killBannerText = 'OBJETIVO COMPLETO! 20/20 NAVIOS DESTRUÍDOS!';
        weapons.killBannerTimer = 3.2;
        triggerMatchComplete();
      }
      updateObjectiveHUD();
    }
  },
  onSpawnDrop(drop) {
    mp.sendEvent({
      t: 'drop',
      id: drop.id,
      kind: drop.type,
      x: drop.x,
      y: drop.y,
      z: drop.z,
    });
  },
  onCannon({ origin, dir, speed }) {
    mp.sendEvent({
      t: 'gun',
      o: { x: origin.x, y: origin.y, z: origin.z },
      d: { x: dir.x, y: dir.y, z: dir.z },
      sp: speed,
    });
  },
  onMissile({ origin, dir, speed, targetId }) {
    mp.sendEvent({
      t: 'msl',
      o: { x: origin.x, y: origin.y, z: origin.z },
      d: { x: dir.x, y: dir.y, z: dir.z },
      sp: speed,
      tid: targetId || null,
    });
  },
  onDeform(x, z, r, d, dx, dz) {
    mp.sendEvent({ t: 'def', x, z, r, d, dx, dz });
  },
  onDamage(x, y, z, r, w) {
    mp.sendEvent({ t: 'dmg', x, y, z, r, w });
  },
  onHitPlayer(target, dmg, w) {
    mp.sendEvent({ t: 'hit', target, dmg, w });
  },
});

// =========================================================================
// Menu Navigation, Match Lifecycle & ESC Pause Flow
// =========================================================================
function setSettingsTab(tab) {
  if (!settingsTabPanels[tab]) return;
  activeSettingsTab = tab;
  for (const btn of settingsTabBtns) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }
  for (const [k, el] of Object.entries(settingsTabPanels)) {
    el.classList.toggle('hidden', k !== tab);
  }
  if (tab === 'terrain') syncTerrainUI();
}

function setMenuView(view) {
  if (!menuViews[view]) return;
  rebindingAction = null;
  activeMenuView = view;
  for (const [k, el] of Object.entries(menuViews)) {
    el.classList.toggle('hidden', k !== view);
  }
  syncMenuUI();
}

function syncHudVisibility() {
  const inFlight = gameState === 'playing' && !menuOpen;
  const isCockpit = CAMERA_MODES[camModeIdx].id === 'COCKPIT';
  const useTouch = shouldUseTouchControls();

  document.body.classList.toggle('touch-active', useTouch);
  touchControls.setVisible(inFlight && useTouch);
  if (hudMenuBtn) {
    hudMenuBtn.textContent = useTouch ? 'MENU' : 'MENU (ESC)';
  }

  hudTopBar.classList.toggle('hidden', !inFlight);
  hudTopRight.classList.toggle('hidden', !inFlight);
  objectiveHudEl.classList.toggle('hidden', !inFlight);
  hudBottomLeft.classList.toggle('hidden', !inFlight || isCockpit);
  remoteLabelsEl.classList.toggle('hidden', !inFlight);
  pickupMarkersEl.classList.toggle('hidden', !inFlight);

  const showMpPill = inFlight && gameMode === 'multiplayer' && mp.isActive();
  hudMpPill.classList.toggle('hidden', !showMpPill);
  if (showMpPill) {
    hudMpRoomLabel.textContent = `SALA: ${mp.roomCode} · ${mp.roster.size}P`;
  }

  if (!inFlight) {
    aimReticle.classList.add('hidden');
    lockBox.classList.add('hidden');
    killBanner.classList.add('hidden');
    missileAlertEl.classList.add('hidden');
    missileVignette.classList.add('hidden');
    cockpit.setVisible(false);
    jet.setVisible(jet.alive);
  } else {
    cockpit.setVisible(isCockpit);
    jet.setVisible(!isCockpit && jet.alive);
  }
  postMat.uniforms.uOutlineEnabled.value = (!inFlight || !isCockpit || remoteJets.size > 0) ? 1.0 : 0.0;
}

function syncMenuUI() {
  const isPlaying = gameState === 'playing';
  menuOverlay.classList.toggle('hidden', !menuOpen);

  // Main menu vs ESC Pause menu: Solo & Multiplayer disabled during match (Req 4)
  menuBtnResume.classList.toggle('hidden', !isPlaying);
  menuBtnQuit.classList.toggle('hidden', !isPlaying);
  menuBtnSolo.disabled = isPlaying;
  menuBtnMp.disabled = isPlaying;

  // Hangar available ONLY before match starts (Req 2)
  menuHangarBox.classList.toggle('hidden', isPlaying);
  menuMatchStatusBox.classList.toggle('hidden', !isPlaying);

  if (isPlaying) {
    menuModeBadge.textContent =
      gameMode === 'multiplayer' ? `PAUSADO · MULTIPLAYER (${mp.roomCode || '---'})` : 'PAUSADO · SOLO';
    menuMatchHp.textContent = `${Math.round(jet.hp)} / ${Math.round(jet.maxHp)}`;
    menuMatchObj.textContent = `${Math.min(objective.goal, objective.shipsDestroyed)} / ${objective.goal}`;
    menuMatchDestroyed.textContent = String(weapons.destroyed);
    menuPauseMpBox.classList.toggle('hidden', gameMode !== 'multiplayer' || !mp.isActive());
    if (menuPauseRoomCode && mp.roomCode) {
      menuPauseRoomCode.textContent = mp.roomCode;
    }
    renderRosterInto(menuPauseRoster, Array.from(mp.roster.values()));
  } else {
    menuModeBadge.textContent = 'MENU PRINCIPAL';
  }

  renderAllHangars();
  syncTerrainUI();
  syncAudioUI();
  syncControlsUI();
  syncHudVisibility();
}

function clearInputs() {
  input.boost = false;
  input.cannonFiring = false;
  input.joyBoost = false;
  input.joyCannon = false;
  input.joyLookBack = false;
  input.joyX = 0;
  input.joyY = 0;
  input.touchBoost = false;
  input.touchCannon = false;
  input.touchLookBack = false;
  input.touchX = 0;
  input.touchY = 0;
  input.keys = {};
  touchControls.reset();
}

function snapCameraToJet() {
  const fwd = jet.getForwardDirection();
  const totalDistScale = viewSettings.camDist * viewSettings.objDist;
  camPosSmooth.copy(jet.position).addScaledVector(fwd, -20.5 * totalDistScale).add(new THREE.Vector3(0, 7.4 * totalDistScale, 0));
  camLookSmooth.copy(jet.position).addScaledVector(fwd, 34 * viewSettings.objDist).add(new THREE.Vector3(0, -1.6 * viewSettings.objDist, 0));
  camRollSmooth = 0;
}

function startSoloMatch() {
  if (gameState === 'playing') return;
  if (mp.isActive()) mp.leaveRoom();
  clearAllRemotePilots();
  applyTerrainSettings(localSoloTerrain, false);
  world.resetTerrain();
  world.respawnSunkShips();

  gameMode = 'solo';
  gameState = 'playing';
  menuOpen = false;
  clearInputs();

  jet.respawn(0);
  weapons.setShipStats(jet.stats);
  weapons.resetAmmo();
  weapons.destroyed = 0;
  resetObjective();
  snapCameraToJet();

  if (audioSettings.enabled) sound.setEnabled(true);
  sound.setPaused(false);
  sound.playSwitch();
  syncMenuUI();
}

function startMultiplayerMatch() {
  if (gameState === 'playing') return;
  if (!mp.isActive()) {
    mpMsg.textContent = 'Crie ou entre em uma sala primeiro!';
    return;
  }
  if (mp.role === 'guest' && !mp.matchStarted) {
    mpMsg.textContent = 'Aguardando o Host iniciar a partida...';
    return;
  }
  if (mp.role === 'host') {
    mp.matchStarted = true;
    mp.sendEvent({ t: 'start' });
  }

  gameMode = 'multiplayer';
  gameState = 'playing';
  menuOpen = false;
  clearInputs();

  const spawnIdx = mp.role === 'host' ? 0 : 1 + Math.floor(Math.random() * 6);
  jet.respawn(spawnIdx);
  weapons.setShipStats(jet.stats);
  weapons.resetAmmo();
  weapons.destroyed = 0;
  resetObjective();
  snapCameraToJet();

  if (audioSettings.enabled) sound.setEnabled(true);
  sound.setPaused(false);
  sound.playSwitch();
  syncMenuUI();
}

function openPauseMenu() {
  if (gameState !== 'playing') return;
  menuOpen = true;
  rebindingAction = null;
  clearInputs();
  sound.setPaused(true);
  setMenuView('main');
}

function closeMenuToPlay() {
  if (gameState !== 'playing') return;
  menuOpen = false;
  rebindingAction = null;
  clearInputs();
  sound.setPaused(false);
  syncMenuUI();
  sound.playSwitch();
}

function returnToMainMenu() {
  if (mp.isActive() || mp.status === 'CONNECTING') {
    mp.leaveRoom();
  }
  clearAllRemotePilots();
  world.resetTerrain();
  world.respawnSunkShips();
  applyTerrainSettings(localSoloTerrain, false);

  gameState = 'menu';
  gameMode = 'menu';
  menuOpen = true;
  rebindingAction = null;
  clearInputs();
  resetObjective();
  jet.respawn(0);
  weapons.resetAmmo();
  sound.setPaused(true);
  setMenuView('main');
  sound.playSwitch();
}

// Menu Button Wiring
menuBtnResume.addEventListener('click', closeMenuToPlay);
menuBtnSolo.addEventListener('click', startSoloMatch);
menuBtnMp.addEventListener('click', () => {
  if (gameState === 'playing') return;
  setMenuView('mp');
  sound.playSwitch();
});
menuBtnControls.addEventListener('click', () => {
  setMenuView('controls');
  sound.playSwitch();
});
menuBtnSettings.addEventListener('click', () => {
  settingsReturnView = 'main';
  setMenuView('settings');
  sound.playSwitch();
});
menuBtnQuit.addEventListener('click', returnToMainMenu);

mpBackBtn.addEventListener('click', () => {
  if (mp.isActive() || mp.status === 'CONNECTING') {
    mp.leaveRoom();
  }
  setMenuView('main');
  sound.playSwitch();
});

mpEditTerrainBtn.addEventListener('click', () => {
  if (isTerrainLocked()) return;
  settingsReturnView = 'mp';
  setSettingsTab('terrain');
  setMenuView('settings');
  sound.playSwitch();
});

mpLaunchBtn.addEventListener('click', startMultiplayerMatch);

controlsBackBtn.addEventListener('click', () => {
  setMenuView('main');
  sound.playSwitch();
});

controlsOpenSettingsBtn.addEventListener('click', () => {
  settingsReturnView = 'main';
  setSettingsTab('controls');
  setMenuView('settings');
  sound.playSwitch();
});

settingsBackBtn.addEventListener('click', () => {
  setMenuView(settingsReturnView === 'mp' && gameState === 'menu' ? 'mp' : 'main');
  sound.playSwitch();
});

for (const btn of settingsTabBtns) {
  btn.addEventListener('click', () => {
    setSettingsTab(btn.dataset.tab);
    sound.playSwitch();
  });
}

hudMenuBtn.addEventListener('click', openPauseMenu);
hudEscHint.addEventListener('click', openPauseMenu);

// Multiplayer Room Creation / Joining / Copying
try {
  const savedName = localStorage.getItem('sunsetStriker_pilotName');
  if (savedName) mpNameInput.value = savedName;
} catch (_) {}

mpNameInput.addEventListener('change', () => {
  try {
    localStorage.setItem('sunsetStriker_pilotName', mpNameInput.value.trim().slice(0, 12));
  } catch (_) {}
});

mpCreateBtn.addEventListener('click', async () => {
  mpMsg.textContent = 'Criando sala...';
  try {
    world.resetTerrain();
    const code = await mp.createRoom({
      name: mpNameInput.value,
      transportPref: mpSignalSelect.value,
      ship: jet.shipId,
      terrainConfig: { ...localSoloTerrain },
    });
    mpMsg.textContent = `Sala ${code} pronta! Compartilhe e clique em INICIAR PARTIDA.`;
  } catch (err) {
    mpMsg.textContent = err?.message || 'Não foi possível criar a sala';
  }
});

async function joinFromUI() {
  const code = mpCodeInput.value.trim().toUpperCase();
  if (!code) {
    mpMsg.textContent = 'Digite o código da sala primeiro';
    return;
  }
  mpMsg.textContent = `Conectando em ${code}...`;
  try {
    await mp.joinRoom({
      code,
      name: mpNameInput.value,
      transportPref: mpSignalSelect.value,
      ship: jet.shipId,
    });
  } catch (err) {
    mpMsg.textContent = err?.message || 'Falha ao entrar na sala';
  }
}

mpJoinBtn.addEventListener('click', joinFromUI);
mpCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    joinFromUI();
  }
});

mpLeaveBtn.addEventListener('click', () => {
  mp.leaveRoom();
  clearAllRemotePilots();
  world.resetTerrain();
  applyTerrainSettings(localSoloTerrain, false);
  mpMsg.textContent = 'Você saiu da sala.';
});

async function copyRoomCode() {
  if (!mp.roomCode) return;
  try {
    await navigator.clipboard.writeText(mp.roomCode);
    mpMsg.textContent = `Código copiado: ${mp.roomCode}`;
    if (gameState === 'playing') {
      weapons.killBannerText = `CÓDIGO COPIADO: ${mp.roomCode}`;
      weapons.killBannerTimer = 1.6;
    }
  } catch (_) {
    mpMsg.textContent = `Código: ${mp.roomCode}`;
  }
}

async function copyRoomLink() {
  if (!mp.roomCode) return;
  const url = `${window.location.origin}${window.location.pathname}?room=${mp.roomCode}`;
  try {
    await navigator.clipboard.writeText(url);
    mpMsg.textContent = 'Link de convite copiado!';
    if (gameState === 'playing') {
      weapons.killBannerText = 'LINK DE CONVITE COPIADO!';
      weapons.killBannerTimer = 1.6;
    }
  } catch (_) {
    mpMsg.textContent = url;
  }
}

mpCopyCode.addEventListener('click', copyRoomCode);
mpCopyLink.addEventListener('click', copyRoomLink);
menuPauseCopyCode.addEventListener('click', copyRoomCode);
menuPauseCopyLink.addEventListener('click', copyRoomLink);
hudMpCopyCode.addEventListener('click', copyRoomCode);
hudMpCopyLink.addEventListener('click', copyRoomLink);

// =========================================================================
// Input State & Event Listeners
// =========================================================================
const input = {
  mouseX: 0,
  mouseY: 0,
  boost: false,
  cannonFiring: false,
  gamepadActive: false,
  joyX: 0,
  joyY: 0,
  joyBoost: false,
  joyCannon: false,
  joyLookBack: false,
  touchActive: false,
  touchX: 0,
  touchY: 0,
  touchBoost: false,
  touchCannon: false,
  touchLookBack: false,
  keys: {},
  sensitivity: controlSettings.mouseSensitivity,
  invertY: controlSettings.invertY,
  gamepadInvertY: controlSettings.gamepadInvertY,
  afterburnerKey: controlSettings.bindings.afterburner,
};

let leftDownAt = 0;
let lastMousePxX = null;
let lastMousePxY = null;

function isSyntheticMouseFromTouch(e) {
  return Boolean(e.sourceCapabilities?.firesTouchEvents) || performance.now() - lastTouchAt < 900;
}

window.addEventListener('mousemove', (e) => {
  if (menuOpen || gameState !== 'playing' || isSyntheticMouseFromTouch(e) || shouldUseTouchControls()) return;
  if (lastMousePxX !== null && Math.hypot(e.clientX - lastMousePxX, e.clientY - lastMousePxY) >= 4) {
    input.gamepadActive = false;
    input.touchActive = false;
  }
  lastMousePxX = e.clientX;
  lastMousePxY = e.clientY;
  const { w, h } = getViewportSize();
  input.mouseX = (e.clientX / w) * 2 - 1;
  input.mouseY = (e.clientY / h) * 2 - 1;
});

window.addEventListener('mousedown', (e) => {
  if (menuOpen || gameState !== 'playing' || isSyntheticMouseFromTouch(e) || shouldUseTouchControls()) return;
  if (
    e.target.closest('button') ||
    e.target.closest('select') ||
    e.target.closest('input') ||
    e.target.closest('.clickable') ||
    e.target.closest('#mobile-controls') ||
    e.target.closest('#game-menu-overlay') ||
    e.target.closest('#hud-top-right') ||
    e.target.closest('#hud-top-bar')
  ) {
    return;
  }
  if (!jet.alive) return;
  if (e.button === 0) {
    leftDownAt = performance.now();
    input.boost = true;
    input.sharpTurnHeld = true;
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
    input.sharpTurnHeld = false;
    if (
      !menuOpen &&
      gameState === 'playing' &&
      jet.alive &&
      !isSyntheticMouseFromTouch(e) &&
      !shouldUseTouchControls() &&
      performance.now() - leftDownAt < 230
    ) {
      jet.triggerRoll(input.mouseX >= 0 ? 1 : -1);
    }
  } else if (e.button === 2) {
    input.cannonFiring = false;
  }
});

window.addEventListener(
  'wheel',
  (e) => {
    if (menuOpen || gameState !== 'playing') return;
    if (e.target.closest('#game-menu-overlay')) return;
    const delta = Math.sign(e.deltaY) * 0.1;
    viewSettings.camDist = THREE.MathUtils.clamp(viewSettings.camDist + delta, 0.5, 2.6);
    syncViewUI();
  },
  { passive: true }
);

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  // 1. Keybind capture in Settings -> Controls
  if (rebindingAction) {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      rebindingAction = null;
      renderBindingsList();
      return;
    }
    controlSettings.bindings[rebindingAction] = e.code;
    rebindingAction = null;
    saveControlSettings();
    syncControlsUI();
    sound.playSwitch();
    return;
  }

  // 2. ESC key always navigates / toggles Pause Menu (even over select/input)
  if (e.code === 'Escape') {
    e.preventDefault();
    if (gameState === 'menu') {
      if (activeMenuView === 'mp') {
        if (mp.isActive() || mp.status === 'CONNECTING') mp.leaveRoom();
        setMenuView('main');
      } else if (activeMenuView === 'settings') {
        setMenuView(settingsReturnView === 'mp' ? 'mp' : 'main');
      } else if (activeMenuView !== 'main') {
        setMenuView('main');
      }
      sound.playSwitch();
    } else {
      if (!menuOpen) {
        openPauseMenu();
        sound.playSwitch();
      } else if (activeMenuView !== 'main') {
        setMenuView('main');
        sound.playSwitch();
      } else {
        closeMenuToPlay();
      }
    }
    return;
  }

  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  // 3. Block all flight controls & shortcuts when menu is open or not playing
  if (menuOpen || gameState !== 'playing') return;

  input.keys[e.code] = true;
  const b = controlSettings.bindings;

  if (e.code === b.cockpit) {
    e.preventDefault();
    toggleCockpit();
  } else if (e.code === b.cycleStyle) {
    e.preventDefault();
    cycleRenderPreset();
  } else if (e.code === b.camera || e.code === 'KeyC') {
    e.preventDefault();
    setCameraMode(camModeIdx + 1);
  } else if (e.code === b.missile || e.code === 'Enter') {
    if (jet.alive) weapons.tryFireMissile(jet);
  } else if (e.code === b.mute) {
    toggleSound();
  } else if (e.code === b.restoreTerrain) {
    if (isTerrainLocked()) {
      weapons.killBannerText = 'TERRENO BLOQUEADO NO MULTIPLAYER';
      weapons.killBannerTimer = 1.8;
      sound.playEmpty();
    } else {
      world.resetTerrain();
      sound.playSwitch();
      weapons.killBannerText = 'MONTANHAS RESTAURADAS';
      weapons.killBannerTimer = 1.6;
    }
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

camSwitchBtn.addEventListener('click', () => {
  if (!menuOpen && gameState === 'playing') setCameraMode(camModeIdx + 1);
});
cockpitToggleBtn.addEventListener('click', () => {
  if (!menuOpen && gameState === 'playing') toggleCockpit();
});

window.addEventListener('resize', applyRenderSettings);
window.visualViewport?.addEventListener('resize', applyRenderSettings);
window.addEventListener('orientationchange', () => setTimeout(applyRenderSettings, 120));

window.addEventListener(
  'touchstart',
  () => {
    lastTouchAt = performance.now();
    if (!detectedTouchDevice) {
      detectedTouchDevice = true;
      syncHudVisibility();
    }
  },
  { passive: true }
);

document.addEventListener(
  'touchmove',
  (e) => {
    if (menuOpen && e.target.closest('.menu-shell')) return;
    e.preventDefault();
  },
  { passive: false }
);

for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}

window.addEventListener(
  'scroll',
  () => {
    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
  },
  { passive: true }
);

// Initial startup configuration (starts in Main Menu with live 3D showcase)
applyRenderSettings();
syncViewUI();
applyTerrainSettings(localSoloTerrain, false);
setCameraMode(0);
setSettingsTab('audio');
setMenuView('main');
syncMenuUI();

// =========================================================================
// Camera, Showcase Autopilot & Main Render Loop
// =========================================================================
function updateShowcaseFlight(dt) {
  showcaseOrbitAngle += dt * 0.16;
  const radius = 185;
  const cx = Math.cos(showcaseOrbitAngle) * radius;
  const cz = Math.sin(showcaseOrbitAngle) * radius + 20;
  const cy = 112 + Math.sin(showcaseOrbitAngle * 2.0) * 6;

  jet.position.set(cx, cy, cz);
  jet.yaw = -showcaseOrbitAngle;
  jet.pitch = -0.02 + Math.cos(showcaseOrbitAngle * 2.0) * 0.03;
  jet.bank = 0.24;
  jet.afterburner = false;
  jet.throttle = 0.65;

  jet.group.position.copy(jet.position);
  jet.group.rotation.order = 'YXZ';
  jet.group.rotation.y = jet.yaw;
  jet.group.rotation.x = jet.pitch;
  jet.visual.rotation.z = jet.bank;
  jet.group.updateMatrixWorld(true);

  const flicker = 0.85 + Math.random() * 0.3;
  jet.flameL.scale.set(0.8, 0.8, 0.72 * flicker);
  jet.flameR.scale.set(0.8, 0.8, 0.72 * flicker);
  jet.updatePuffs(dt);

  const fwd = jet.getForwardDirection(_camFwd);
  _camRight.set(-fwd.z, 0, fwd.x).normalize();
  _camVec1
    .copy(jet.position)
    .addScaledVector(fwd, -16.5 * viewSettings.objDist)
    .addScaledVector(_camRight, 8.5 * viewSettings.objDist);
  _camVec1.y += 5.2 * viewSettings.objDist;
  _camVec2.copy(jet.position).addScaledVector(fwd, 12 * viewSettings.objDist);

  camera.fov = THREE.MathUtils.lerp(camera.fov, viewSettings.fov, 1 - Math.exp(-5.0 * dt));
  camera.updateProjectionMatrix();
  camera.up.set(0, 1, 0);
  camera.position.copy(_camVec1);
  camera.lookAt(_camVec2);
}

let wasLookingBack = false;

function isLookingBackActive() {
  if (menuOpen || gameState !== 'playing') return false;
  const kbKey = controlSettings.bindings.lookBack || 'KeyB';
  return Boolean(input.joyLookBack || input.touchLookBack || input.keys[kbKey]);
}

function updateCamera(dt) {
  if (!jet.alive) {
    camera.lookAt(jet.position);
    return;
  }
  const mode = CAMERA_MODES[camModeIdx].id;
  const fwd = jet.getForwardDirection(_camFwd);
  const lookingBack = isLookingBackActive();
  const flipped = lookingBack !== wasLookingBack;
  wasLookingBack = lookingBack;

  if (flipped) {
    const isCockpit = mode === 'COCKPIT';
    const showCockpit = isCockpit && !lookingBack && gameState === 'playing' && !menuOpen;
    cockpit.setVisible(showCockpit);
    jet.setVisible((!showCockpit) && jet.alive);
    hudBottomLeft.classList.toggle('hidden', showCockpit || gameState !== 'playing' || menuOpen);
    camBadge.textContent = lookingBack ? 'REAR VIEW (R3)' : CAMERA_MODES[camModeIdx].label;
  }

  const objFovOffset = (viewSettings.objDist - 1.0) * 14.0;
  let targetFov = viewSettings.fov + objFovOffset + (jet.afterburner ? 8.5 : 0);
  if (!lookingBack && mode === 'COCKPIT') {
    targetFov = THREE.MathUtils.clamp(viewSettings.fov - 4 + objFovOffset, 50, 108);
  } else if (!lookingBack && mode === 'TOP') {
    targetFov = THREE.MathUtils.clamp(viewSettings.fov - 16 + objFovOffset * 0.8, 42, 98);
  } else {
    targetFov = THREE.MathUtils.clamp(targetFov, 45, 118);
  }

  const lerpFactor = dt > 0 ? 1 - Math.exp(-6.0 * dt) : 1.0;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, lerpFactor);
  camera.updateProjectionMatrix();

  const totalDistScale = viewSettings.camDist * viewSettings.objDist;

  if (lookingBack || mode === 'CHASE') {
    const baseDist = jet.afterburner ? 24.5 : 20.5;
    const dist = baseDist * totalDistScale;
    const heightOff = (lookingBack ? 6.6 : 7.4) * totalDistScale;
    const dirSign = lookingBack ? 1 : -1;

    _camVec1.copy(jet.position).addScaledVector(fwd, dirSign * dist);
    _camVec1.y += heightOff;
    _camVec2.copy(jet.position).addScaledVector(fwd, -dirSign * 34 * viewSettings.objDist);
    _camVec2.y -= 1.6 * viewSettings.objDist;

    const targetRoll = (lookingBack ? -1 : 1) * jet.bank * 0.34;
    if (dt > 0 && !flipped) {
      camPosSmooth.lerp(_camVec1, 1 - Math.exp(-8.5 * dt));
      camLookSmooth.lerp(_camVec2, 1 - Math.exp(-10.5 * dt));
      camRollSmooth = THREE.MathUtils.lerp(camRollSmooth, targetRoll, 1 - Math.exp(-5.0 * dt));
    } else {
      camPosSmooth.copy(_camVec1);
      camLookSmooth.copy(_camVec2);
      camRollSmooth = targetRoll;
    }

    camera.position.copy(camPosSmooth);
    _camRight.set(Math.cos(jet.yaw), 0, -Math.sin(jet.yaw));
    camera.up
      .set(0, Math.cos(camRollSmooth), 0)
      .addScaledVector(_camRight, Math.sin(-camRollSmooth))
      .normalize();
    camera.lookAt(camLookSmooth);
  } else if (mode === 'COCKPIT') {
    camera.up.set(0, 1, 0);
    _camVec1.copy(jet.position).addScaledVector(fwd, 1.4);
    _camVec1.y += 0.55;
    camera.position.copy(_camVec1);

    let extraRoll = 0;
    if (jet.rollAnim > 0) {
      extraRoll = (1.0 - jet.rollAnim) * Math.PI * 2 * jet.rollDir;
    }
    _camEuler.set(jet.pitch, jet.yaw, jet.bank + extraRoll, 'YXZ');
    camera.quaternion.setFromEuler(_camEuler);
  } else {
    _camVec3.set(-Math.sin(jet.yaw), 0, -Math.cos(jet.yaw));
    _camVec1.copy(jet.position).addScaledVector(_camVec3, -28 * totalDistScale);
    _camVec1.y += 82 * totalDistScale;
    _camVec2.copy(jet.position).addScaledVector(_camVec3, 20 * viewSettings.objDist);

    if (dt > 0 && !flipped) {
      camPosSmooth.lerp(_camVec1, 1 - Math.exp(-6.0 * dt));
      camLookSmooth.lerp(_camVec2, 1 - Math.exp(-9.0 * dt));
    } else {
      camPosSmooth.copy(_camVec1);
      camLookSmooth.copy(_camVec2);
    }

    camera.up.set(0, 1, 0);
    camera.position.copy(camPosSmooth);
    camera.lookAt(camLookSmooth);
  }

  if (dt > 0) {
    const shakeMag = weapons.shake * 0.5 + (jet.afterburner && mode === 'CHASE' ? 0.07 : 0);
    if (shakeMag > 0.005) {
      camera.position.x += (Math.random() - 0.5) * shakeMag;
      camera.position.y += (Math.random() - 0.5) * shakeMag;
    }
  }
}

const clock = new THREE.Clock();
const projVec = new THREE.Vector3();
const _camVec1 = new THREE.Vector3();
const _camVec2 = new THREE.Vector3();
const _camVec3 = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _hudVec = new THREE.Vector3();

const pickupTagPool = [];
for (let i = 0; i < 4; i++) {
  const el = document.createElement('div');
  el.className = 'pickup-tag hidden';
  pickupMarkersEl.appendChild(el);
  pickupTagPool.push({ el, text: '', cls: 'pickup-tag hidden', opacity: '', left: '', top: '' });
}

let lastTelemText = '';
let lastDestroyedText = '';
let lastHpText = '';
let lastHpColor = '';
let lastHpFillCls = '';
let lastHpPctStr = '';
let lastMissileCountText = '';

function projectToScreen(worldPos) {
  projVec.copy(worldPos).project(camera);
  if (projVec.z > 1.0) return null;
  const { w, h } = getViewportSize();
  return {
    x: (projVec.x * 0.5 + 0.5) * w,
    y: (-projVec.y * 0.5 + 0.5) * h,
  };
}

function updatePlayingHUD(elapsed) {
  const modeId = CAMERA_MODES[camModeIdx].id;
  const { w: vpW, h: vpH } = getViewportSize();

  for (let i = 0; i < ammoPipEls.length; i++) {
    ammoPipEls[i].classList.toggle('ready', i < weapons.ammo);
  }
  if (touchMissileCount) {
    const ammoStr = String(weapons.ammo);
    if (ammoStr !== lastMissileCountText) {
      lastMissileCountText = ammoStr;
      touchMissileCount.textContent = ammoStr;
    }
  }
  if (touchBtnMissile) {
    const hasLocked = Boolean(weapons.lockedTarget && weapons.lockedTarget.alive && weapons.ammo > 0);
    touchBtnMissile.classList.toggle('locked', hasLocked);
    touchBtnMissile.classList.toggle('empty', weapons.ammo <= 0);
  }
  const knots = Math.round(jet.speed * 9.6);
  const altFt = Math.max(0, Math.round(jet.position.y * 3.6));
  const telemText = `SPD ${knots} · ALT ${altFt}`;
  if (telemText !== lastTelemText) {
    lastTelemText = telemText;
    telemBadge.textContent = telemText;
  }
  const destroyedText = `DESTROYED: ${weapons.destroyed}`;
  if (destroyedText !== lastDestroyedText) {
    lastDestroyedText = destroyedText;
    destroyedBadge.textContent = destroyedText;
  }

  const hpCur = Math.round(jet.hp);
  const hpMax = Math.round(jet.maxHp);
  const hpPct = Math.max(0, Math.min(100, (hpCur / Math.max(1, hpMax)) * 100));
  const hpPctStr = `${hpPct}%`;
  if (hpPctStr !== lastHpPctStr) {
    lastHpPctStr = hpPctStr;
    playerHpFill.style.width = hpPctStr;
  }
  const hpFillCls = 'player-hp-fill' + (hpPct <= 30 ? ' low' : hpPct <= 60 ? ' mid' : '');
  if (hpFillCls !== lastHpFillCls) {
    lastHpFillCls = hpFillCls;
    playerHpFill.className = hpFillCls;
  }
  const hpText = `${hpCur}/${hpMax}`;
  if (hpText !== lastHpText) {
    lastHpText = hpText;
    playerHpText.textContent = hpText;
  }
  const stamPct = Math.max(0, Math.min(100, (jet.stamina / Math.max(1, jet.maxStamina)) * 100));
  const stamPctStr = `${stamPct}%`;
  if (playerStaminaFill) {
    if (playerStaminaFill._lastWidth !== stamPctStr) {
      playerStaminaFill._lastWidth = stamPctStr;
      playerStaminaFill.style.width = stamPctStr;
    }
    const stamCls = 'player-stamina-fill' + (jet.staminaExhausted || stamPct <= 25 ? ' low' : '');
    if (playerStaminaFill._lastCls !== stamCls) {
      playerStaminaFill._lastCls = stamCls;
      playerStaminaFill.className = stamCls;
    }
  }
  const hpColor = hpPct <= 30 ? '#ff5a44' : hpPct <= 60 ? '#ffd066' : '#88ffa8';
  if (hpColor !== lastHpColor) {
    lastHpColor = hpColor;
    playerHpText.style.color = hpColor;
  }

  if (weapons.incomingMissile) {
    const distM = Math.round(weapons.incomingMissile.dist);
    missileAlertEl.textContent = `⚠ MISSILE ALERT · ${distM}M — CLICK ROLL / TURN TO EVADE!`;
    missileAlertEl.classList.remove('hidden');
    missileVignette.classList.remove('hidden');
  } else {
    missileAlertEl.classList.add('hidden');
    missileVignette.classList.add('hidden');
  }

  for (const [pid, rj] of remoteJets.entries()) {
    const rec = remoteLabelEls.get(pid);
    if (!rec) continue;
    if (!rj.alive) {
      rec.el.classList.add('hidden');
      continue;
    }
    _hudVec.set(rj.position.x, rj.position.y + 4.2, rj.position.z);
    const sp = projectToScreen(_hudVec);
    if (sp && sp.x > 16 && sp.x < vpW - 16 && sp.y > 24 && sp.y < vpH - 24) {
      rec.el.classList.remove('hidden');
      rec.el.style.left = `${sp.x}px`;
      rec.el.style.top = `${sp.y}px`;
      const distM = Math.round(jet.position.distanceTo(rj.position));
      rec.nameEl.textContent = `${rj.name} ${distM}M`;
      if (rec.fillEl?.parentElement) {
        rec.fillEl.parentElement.style.display = 'none';
      }
    } else {
      rec.el.classList.add('hidden');
    }
  }

  let poolIdx = 0;
  if (modeId !== 'TOP') {
    const allPickups = world.getPickups();
    let bestH1 = null;
    let bestH2 = null;
    let bestM1 = null;
    let bestM2 = null;

    for (let i = 0; i < allPickups.length; i++) {
      const pk = allPickups[i];
      if (!pk.active) continue;
      const dx = pk.x - jet.position.x;
      const dy = pk.y - jet.position.y;
      const dz = pk.z - jet.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 1100) continue;
      if (pk.type === 'health') {
        if (!bestH1 || d < bestH1.d) {
          bestH2 = bestH1;
          bestH1 = { pk, d };
        } else if (!bestH2 || d < bestH2.d) {
          bestH2 = { pk, d };
        }
      } else if (pk.type === 'missile') {
        if (!bestM1 || d < bestM1.d) {
          bestM2 = bestM1;
          bestM1 = { pk, d };
        } else if (!bestM2 || d < bestM2.d) {
          bestM2 = { pk, d };
        }
      }
    }

    const chosen = [bestH1, bestH2, bestM1, bestM2];
    for (let i = 0; i < chosen.length && poolIdx < pickupTagPool.length; i++) {
      const item = chosen[i];
      if (!item) continue;
      const { pk, d } = item;
      _hudVec.set(pk.x, pk.y + 8, pk.z);
      const sp = projectToScreen(_hudVec);
      if (!sp || sp.x < 16 || sp.x > vpW - 16 || sp.y < 24 || sp.y > vpH - 24) continue;

      const slot = pickupTagPool[poolIdx++];
      const cls = `pickup-tag ${pk.type}`;
      if (slot.cls !== cls) {
        slot.cls = cls;
        slot.el.className = cls;
      }
      const leftStr = `${sp.x.toFixed(1)}px`;
      const topStr = `${sp.y.toFixed(1)}px`;
      if (slot.left !== leftStr) {
        slot.left = leftStr;
        slot.el.style.left = leftStr;
      }
      if (slot.top !== topStr) {
        slot.top = topStr;
        slot.el.style.top = topStr;
      }
      const needed = pk.type === 'health' ? jet.hp < jet.maxHp : weapons.ammo < weapons.maxAmmo;
      const opStr = needed ? '0.96' : '0.52';
      if (slot.opacity !== opStr) {
        slot.opacity = opStr;
        slot.el.style.opacity = opStr;
      }
      const text = pk.type === 'health'
        ? `+ VIDA 100% ${Math.round(d)}M`
        : (pk.isSeaSkim ? `MSL MAR ${Math.round(d)}M` : `MSL ${Math.round(d)}M`);
      if (slot.text !== text) {
        slot.text = text;
        slot.el.textContent = text;
      }
    }
  }
  for (let i = poolIdx; i < pickupTagPool.length; i++) {
    const slot = pickupTagPool[i];
    if (slot.cls !== 'pickup-tag hidden') {
      slot.cls = 'pickup-tag hidden';
      slot.el.className = 'pickup-tag hidden';
    }
  }

  if (weapons.killBannerTimer > 0) {
    killBanner.textContent = weapons.killBannerText;
    killBanner.classList.remove('hidden');
  } else {
    killBanner.classList.add('hidden');
  }

  if (modeId === 'CHASE' && !isLookingBackActive()) {
    jet.getForwardDirection(_camFwd);
    _hudVec.copy(jet.position).addScaledVector(_camFwd, 180);
    const sp = projectToScreen(_hudVec);
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
    _hudVec.set(t.x, t.y + (t.h || 6) * 0.5, t.z);
    const sp = projectToScreen(_hudVec);
    if (sp && sp.x > 20 && sp.x < vpW - 20 && sp.y > 30 && sp.y < vpH - 30) {
      lockBox.classList.remove('hidden');
      lockBox.style.left = `${sp.x}px`;
      lockBox.style.top = `${sp.y}px`;
      const distM = Math.round(jet.position.distanceTo(_hudVec));
      lockLabel.textContent = `${t.label || 'TARGET'} ${distM}M`;
    } else {
      lockBox.classList.add('hidden');
    }
  } else {
    lockBox.classList.add('hidden');
  }
}

const NEUTRAL_INPUT = {
  mouseX: 0,
  mouseY: 0,
  boost: false,
  gamepadActive: false,
  joyX: 0,
  joyY: 0,
  joyBoost: false,
  touchActive: false,
  touchX: 0,
  touchY: 0,
  touchBoost: false,
  keys: {},
  sensitivity: 1.0,
  invertY: false,
  gamepadInvertY: false,
  afterburnerKey: 'ShiftLeft',
};

function handleGamepadFrame(dt) {
  const gp = gamepad.poll(dt);

  if (gp.pressed.pause && gameState === 'playing') {
    if (!menuOpen) {
      openPauseMenu();
      sound.playSwitch();
    } else if (activeMenuView !== 'main') {
      setMenuView('main');
      sound.playSwitch();
    } else {
      closeMenuToPlay();
    }
    return;
  }

  if (matchEndActive) {
    matchEndTimer = Math.max(0, matchEndTimer - dt);
    if (matchEndCountdown) {
      matchEndCountdown.textContent = `Recomeçando em ${Math.ceil(matchEndTimer)}s...`;
    }
    if (matchEndTimer <= 0) {
      restartMatchAfterComplete();
    }
  }

  if (gameState !== 'playing' || menuOpen) {
    input.joyX = 0;
    input.joyY = 0;
    input.joyBoost = false;
    input.joyCannon = false;
    input.joyLookBack = false;
    return;
  }

  if (!gp.connected) {
    input.gamepadActive = false;
    input.joyX = 0;
    input.joyY = 0;
    input.joyBoost = false;
    input.joyCannon = false;
    input.joyLookBack = false;
    return;
  }

  if (gp.anyInput) {
    input.gamepadActive = true;
  }

  input.joyX = gp.steerX;
  input.joyY = gp.steerY;
  input.joyBoost = gp.boostHeld;
  input.joyCannon = gp.cannonHeld;
  input.joyLookBack = gp.lookBackHeld;

  if (Math.abs(gp.camDistDelta) > 0.0001) {
    viewSettings.camDist = THREE.MathUtils.clamp(viewSettings.camDist + gp.camDistDelta, 0.5, 2.6);
    syncViewUI(false);
  }

  if (gp.pressed.missile && jet.alive) {
    weapons.tryFireMissile(jet);
  }
  if (gp.pressed.camera) {
    setCameraMode(camModeIdx + 1);
  }
  if (gp.pressed.cockpit) {
    toggleCockpit();
  }
  if (gp.pressed.renderCycle) {
    if (gameMode === 'solo' && !mp.isActive()) {
      cycleRenderPreset();
      weapons.killBannerText = `RENDER: ${renderSettings.shortLabel}`;
      weapons.killBannerTimer = 1.4;
    } else {
      weapons.killBannerText = 'RENDER VIA SELECT APENAS NO SOLO';
      weapons.killBannerTimer = 1.6;
      sound.playEmpty();
    }
  }
  if (jet.alive) {
    input.joySharpTurn = (gp.sharpTurnRightHeld ? 1 : 0) - (gp.sharpTurnLeftHeld ? 1 : 0);
    if (gp.pressed.roll) jet.triggerRoll(input.joyX >= 0 ? 1 : -1);
  } else {
    input.joySharpTurn = 0;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;
  handleGamepadFrame(dt);

  if (matchEndActive) {
    matchEndTimer = Math.max(0, matchEndTimer - dt);
    if (matchEndCountdown) {
      matchEndCountdown.textContent = `Recomeçando em ${Math.ceil(matchEndTimer)}s...`;
    }
    if (matchEndTimer <= 0) {
      restartMatchAfterComplete();
    }
  }

  if (gameState !== 'playing' || menuOpen) {
    input.touchX = 0;
    input.touchY = 0;
    input.touchBoost = false;
    input.touchCannon = false;
    input.touchLookBack = false;
  } else if (shouldUseTouchControls() && !input.gamepadActive) {
    input.touchActive = true;
    input.touchX = touchControls.steerX;
    input.touchY = touchControls.steerY;
    input.touchBoost = touchControls.boostHeld;
    input.touchCannon = touchControls.cannonHeld;
    input.touchLookBack = touchControls.lookBackHeld;
  } else {
    input.touchActive = false;
    input.touchX = 0;
    input.touchY = 0;
    input.touchBoost = false;
    input.touchCannon = false;
    input.touchLookBack = false;
  }

  const modeId = CAMERA_MODES[camModeIdx].id;
  const isCockpit = modeId === 'COCKPIT';

  if (gameState === 'menu') {
    sound.setPaused(true);
    updateShowcaseFlight(dt);
    world.update(elapsed, camera.position, dt);
    jet.setVisible(true);
  } else if (menuOpen && gameMode === 'solo') {
    sound.setPaused(true);
    updateCamera(0);
    world.update(elapsed, camera.position, 0);
  } else {
    const activeInput = menuOpen ? NEUTRAL_INPUT : input;
    const showCockpitLive = isCockpit && !menuOpen && !isLookingBackActive();
    sound.setPaused(menuOpen);

    if (jet.alive) {
      jet.update(dt, activeInput, showCockpitLive);

      if (jet.spawnProtection <= 0) {
        for (const rj of remoteJets.values()) {
          if (!rj.alive) continue;
          if (jet.position.distanceTo(rj.position) < 7.5) {
            mp.sendEvent({ t: 'hit', target: rj.id, dmg: 200, w: 'collision' });
            killLocalJet(`COLISÃO ${rj.name}`, rj.id);
            break;
          }
        }
        if (jet.alive) {
          const col = world.checkObstacleCollision(jet.position, 2.6);
          if (col && col.hit) {
            if (col.type === 'mountain') {
              if (world.deformTerrain(jet.position.x, jet.position.z, 22, 12, 0, 0)) {
                mp.sendEvent({ t: 'def', x: jet.position.x, z: jet.position.z, r: 22, d: 12, dx: 0, dz: 0 });
              }
            }
            killLocalJet(col.reason);
          }
        }
      }

      if (jet.alive) {
        if (!menuOpen && (input.cannonFiring || input.joyCannon || input.touchCannon)) {
          weapons.tryFireCannon(jet);
        }

        const picked = world.collectPickup(jet.position, (p) => {
          if (p.type === 'health') return jet.hp < jet.maxHp;
          if (p.type === 'missile') return weapons.ammo < weapons.maxAmmo;
          return false;
        }, dt);
        if (picked) {
          if (picked.type === 'health') {
            jet.hp = jet.maxHp;
            weapons.killBannerText = 'VIDA 100% RECUPERADA! (CRUZ ROSA)';
          } else {
            weapons.resetAmmo();
            weapons.killBannerText = 'TODOS OS MÍSSEIS RECARREGADOS!';
          }
          weapons.killBannerTimer = 1.8;
          sound.playPickup(picked.type);
          weapons.spawnPickupBurst(picked, picked.type === 'health');
          mp.sendEvent({ t: 'pk', id: picked.id });
        }
      }
    } else {
      if (jet.fallVel) {
        jet.fallVel.y -= 36.0 * dt;
        jet.position.addScaledVector(jet.fallVel, dt);
        jet.group.position.copy(jet.position);
        jet.group.rotation.z += 2.6 * dt;
        jet.group.rotation.x -= 0.9 * dt;
        jet.spawnDamageFirePuffs(dt, 0.05);
      }
      jet.updatePuffs(dt);
      jet.respawnTimer -= dt;
      if (jet.respawnTimer <= 0) {
        jet.fallVel = null;
        jet.respawn(Math.floor(Math.random() * 8));
        weapons.resetAmmo();
        if (!mp.isActive()) world.respawnSunkShips();
        jet.setVisible(!showCockpitLive);
      }
    }

    for (const rj of remoteJets.values()) {
      rj.update(dt, jet.position);
    }
    mp.sendLocalState(jet, objective.shipsDestroyed);
    weapons.update(dt, elapsed, jet);
    updateCamera(dt);
    world.update(elapsed, camera.position, dt);

    if (!menuOpen) {
      sound.updateJet(jet.throttle, jet.afterburner, showCockpitLive);
      updatePlayingHUD(elapsed);
    }
  }

  // Pass 1: Render 3D scene
  camera.layers.set(0);
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  // Pass 2: Jet hull silhouette mask (Layer 1)
  const renderCockpitOverlay = gameState === 'playing' && !menuOpen && isCockpit && !isLookingBackActive();
  const hasVisibleJets = (!renderCockpitOverlay && jet.alive) || remoteJets.size > 0;
  postMat.uniforms.uOutlineEnabled.value = hasVisibleJets ? 1.0 : 0.0;
  if (hasVisibleJets) {
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

  // Pass 4: Hangar 3D Preview Stage (interactive 3D turntable inside pre-flight menu)
  if (gameState === 'menu' && menuOpen) {
    updateHangarPreviewStage(dt, elapsed);
  }

  // Pass 5: Cockpit 2D pixel-art overlay (only while actively flying in Cockpit view)
  if (renderCockpitOverlay) {
    cockpit.render(dt, jet, weapons, remoteJets, world.getPickups(), world.getShips());
  }
}

window.__GAME__ = {
  jet,
  weapons,
  world,
  mp,
  gamepad,
  touchControls,
  remoteJets,
  objective,
  renderSettings,
  controlSettings,
  audioSettings,
  get state() {
    return { gameState, gameMode, menuOpen, activeMenuView, activeSettingsTab, activeTerrain };
  },
  setCameraMode,
  selectRenderPreset,
  selectShip,
  startSoloMatch,
  startMultiplayerMatch,
  openPauseMenu,
  closeMenuToPlay,
  returnToMainMenu,
  applyTerrainSettings,
  testIncomingMissile: () => weapons.spawnTestThreat(jet),
};

// Auto-open Multiplayer Lobby (pre-match hangar) if ?room=XXXXXX is present in URL
const urlParams = new URLSearchParams(window.location.search);
const autoRoom = urlParams.get('room');
if (autoRoom && /^[a-zA-Z0-9]{4,10}$/.test(autoRoom)) {
  mpCodeInput.value = autoRoom.toUpperCase();
  mpMsg.textContent = 'Escolha sua nave à esquerda e clique em ENTRAR NA SALA.';
  setMenuView('mp');
}

animate();

import * as THREE from 'three';
import { buildWorld, SUN_DIR } from './world.js';
import { FighterJet } from './jet.js';
import { MissileSystem } from './weapons.js';
import { FighterCockpit } from './cockpit.js';
import { JetSoundEngine } from './audio.js';

const PIXEL_HEIGHT = 270;

const canvas = document.getElementById('game-canvas');
const cockpitCanvas = document.getElementById('cockpit-canvas');
const ammoPipsEl = document.getElementById('ammo-pips');
const camNextLabel = document.getElementById('cam-next-label');
const camSwitchBtn = document.getElementById('cam-switch-btn');
const cockpitToggleBtn = document.getElementById('cockpit-toggle-btn');
const soundBtn = document.getElementById('sound-btn');
const viewBtn = document.getElementById('view-btn');
const viewPanel = document.getElementById('view-panel');
const vpResetBtn = document.getElementById('vp-reset');
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

// Renderer configured for crisp pixel-art
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// Bright sunset lighting
const hemiLight = new THREE.HemisphereLight(0xfbe0ce, 0x5c6282, 1.25);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffe7b8, 1.45);
sunLight.position.copy(SUN_DIR).multiplyScalar(600);
scene.add(sunLight);

// View / POV / Object Distance user-adjustable settings
const DEFAULT_VIEW = {
  fov: 80,
  camDist: 1.35,
  objDist: 1.0,
};
const viewSettings = { ...DEFAULT_VIEW };

const camera = new THREE.PerspectiveCamera(viewSettings.fov, window.innerWidth / window.innerHeight, 0.5, 3600);

// Low-res render targets: scene color + 1px jet silhouette mask for crisp ink outlines
let rtHeight = PIXEL_HEIGHT;
let rtWidth = Math.max(360, Math.round(PIXEL_HEIGHT * (window.innerWidth / window.innerHeight)));

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

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec2 pix = floor(vUv * uResolution);
      float d = bayer4(pix) - 0.5;
      float levels = 28.0;
      col = floor((col + d / levels) * levels + 0.5) / levels;

      // Exact 1-pixel crisp dark ink silhouette outline around the fighter jet
      if (uOutlineEnabled > 0.5) {
        vec2 texel = 1.0 / uResolution;
        float center = texture2D(tJetMask, vUv).r;
        if (center < 0.5) {
          float nL = texture2D(tJetMask, vUv + vec2(-texel.x, 0.0)).r;
          float nR = texture2D(tJetMask, vUv + vec2( texel.x, 0.0)).r;
          float nU = texture2D(tJetMask, vUv + vec2(0.0,  texel.y)).r;
          float nD = texture2D(tJetMask, vUv + vec2(0.0, -texel.y)).r;
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

// Put jet hull meshes on Layer 1 so we can render an exact 1px silhouette mask cleanly
jet.hullGroup.traverse((obj) => {
  if (obj.isMesh) obj.layers.enable(1);
});

// Build 4 missile pips in top bar
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

const camPosSmooth = new THREE.Vector3(-90, 108, 245);
const camLookSmooth = new THREE.Vector3(-90, 96, 175);
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
    setCameraMode(1); // COCKPIT
  }
}

// Sync View / FOV / Object Distance UI & apply object-distance scaling
function syncViewUI() {
  fovSlider.value = String(viewSettings.fov);
  fovVal.innerHTML = `${Math.round(viewSettings.fov)}&deg;`;
  distSlider.value = viewSettings.camDist.toFixed(2);
  distVal.textContent = `${viewSettings.camDist.toFixed(2)}x`;
  scaleSlider.value = viewSettings.objDist.toFixed(2);
  scaleVal.textContent = `${viewSettings.objDist.toFixed(2)}x`;
  distBadge.textContent = `FOV ${Math.round(viewSettings.fov)}° · DIST ${viewSettings.camDist.toFixed(2)}x`;

  // Adjust fighter apparent scale slightly with objDist while keeping contrails & physics consistent
  jet.visual.scale.setScalar(0.76 / Math.sqrt(viewSettings.objDist));
}

viewBtn.addEventListener('click', () => {
  const open = viewPanel.classList.toggle('hidden');
  viewBtn.classList.toggle('active', !open);
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
  syncViewUI();
});

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
  if (e.target.closest('button') || e.target.closest('.clickable') || e.target.closest('#view-panel')) return;
  dismissIntro();
  if (e.button === 0) {
    leftDownAt = performance.now();
    input.boost = true;
  } else if (e.button === 2) {
    // RIGHT CLICK = Autocannon!
    input.cannonFiring = true;
    weapons.tryFireCannon(jet);
  } else if (e.button === 1) {
    // MIDDLE CLICK = Missiles (FOX 2)
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

// Scroll wheel adjusts camera / object distance seamlessly
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
    // E toggles COCKPIT directly!
    e.preventDefault();
    toggleCockpit();
  } else if (e.code === 'Space' || e.code === 'KeyC') {
    e.preventDefault();
    setCameraMode(camModeIdx + 1);
  } else if (e.code === 'KeyF' || e.code === 'Enter') {
    weapons.tryFireMissile(jet);
  } else if (e.code === 'KeyM') {
    toggleSound();
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
cockpitToggleBtn.addEventListener('click', toggleCockpit);

function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  rtHeight = PIXEL_HEIGHT;
  rtWidth = Math.max(360, Math.round(PIXEL_HEIGHT * (w / h)));

  renderer.setSize(rtWidth, rtHeight, false);
  renderTarget.setSize(rtWidth, rtHeight);
  jetMaskTarget.setSize(rtWidth, rtHeight);
  postMat.uniforms.uResolution.value.set(rtWidth, rtHeight);

  cockpitCanvas.width = rtWidth;
  cockpitCanvas.height = rtHeight;
  cockpit.w = rtWidth;
  cockpit.h = rtHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', handleResize);
handleResize();
syncViewUI();
setCameraMode(0);

// Camera controller honoring user FOV, Cam Distance & Object Distance settings
function updateCamera(dt) {
  const mode = CAMERA_MODES[camModeIdx].id;
  const fwd = jet.getForwardDirection();

  // Dynamic FOV based on user FOV setting + objDist perspective adjustment + afterburner kick
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
    // TOP VIEW scaled cleanly with distance setting
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

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;
  const isCockpit = CAMERA_MODES[camModeIdx].id === 'COCKPIT';

  jet.update(dt, input, isCockpit);

  if (input.cannonFiring) {
    weapons.tryFireCannon(jet);
  }
  weapons.update(dt, elapsed, jet);

  updateCamera(dt);
  world.update(elapsed, camera.position, dt);

  sound.updateJet(jet.throttle, jet.afterburner, isCockpit);

  // Sync top-bar missile pips & telemetry
  for (let i = 0; i < ammoPipEls.length; i++) {
    ammoPipEls[i].classList.toggle('ready', i < weapons.ammo);
  }
  const knots = Math.round(jet.speed * 9.6);
  const altFt = Math.max(0, Math.round(jet.position.y * 3.6));
  telemBadge.textContent = `SPD ${knots} · ALT ${altFt}`;

  // Pass 1: Render main 3D scene to low-res renderTarget
  camera.layers.set(0);
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  // Pass 2: Render jet hull silhouette mask (Layer 1) for exact 1px pixel-art ink outline
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

  // Pass 3: Bayer 4x4 dithering + crisp 1px jet ink outline to screen
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);

  // Pass 4: Cockpit pixel-art overlay
  if (isCockpit) {
    cockpit.render(dt, jet, weapons);
  }
}

animate();

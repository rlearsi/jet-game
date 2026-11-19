export const DEFAULT_GAMEPAD_DEADZONE = 0.14;

const EDGE_BUTTONS = {
  missile: 0,     // A / Cross
  camera: 1,      // B / Circle
  cockpit: 2,     // X / Square
  roll: 3,        // Y / Triangle
  rollLeft: 4,    // LB / L1
  rollRight: 5,   // RB / R1
  renderCycle: 8, // Select / Back / View / Share
  pause: 9,       // Start / Options / Menu
};

function neutralState() {
  return {
    connected: false,
    id: '',
    anyInput: false,
    steerX: 0,
    steerY: 0,
    camDistDelta: 0,
    cannonHeld: false,
    boostHeld: false,
    lookBackHeld: false,
    pressed: {
      missile: false,
      camera: false,
      cockpit: false,
      roll: false,
      rollLeft: false,
      rollRight: false,
      renderCycle: false,
      pause: false,
    },
  };
}

function isBtnDown(btn, threshold = 0.5) {
  if (!btn) return false;
  return Boolean(btn.pressed) || (typeof btn.value === 'number' && btn.value >= threshold);
}

export class GamepadController {
  constructor({ deadzone = DEFAULT_GAMEPAD_DEADZONE, onConnectionChange = null } = {}) {
    this.connected = false;
    this.gamepadIndex = null;
    this.gamepadId = '';
    this.deadzone = DEFAULT_GAMEPAD_DEADZONE;
    this.setDeadzone(deadzone);
    this.onConnectionChange = onConnectionChange;
    this.prevButtons = new Map();

    if (typeof window !== 'undefined') {
      this._onConnect = (e) => {
        const gp = e?.gamepad;
        if (!gp) return;
        this.gamepadIndex = gp.index;
        this.setConnectionState(true, gp.index, gp.id || 'Gamepad');
      };
      this._onDisconnect = (e) => {
        const gp = e?.gamepad;
        if (gp && this.gamepadIndex !== null && gp.index !== this.gamepadIndex) return;
        this.prevButtons.clear();
        this.setConnectionState(false, null, '');
      };
      window.addEventListener('gamepadconnected', this._onConnect);
      window.addEventListener('gamepaddisconnected', this._onDisconnect);
    }
  }

  setDeadzone(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    this.deadzone = Math.max(0.05, Math.min(0.35, n));
  }

  applyDeadzone(val, dz = this.deadzone) {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    const abs = Math.abs(n);
    if (abs < dz) return 0;
    const scaled = (abs - dz) / Math.max(1e-5, 1.0 - dz);
    return Math.sign(n) * Math.min(1, scaled);
  }

  setConnectionState(connected, index, id) {
    const nextConn = Boolean(connected);
    const nextIdx = nextConn ? index : null;
    const nextId = nextConn ? String(id || 'Gamepad') : '';
    const changed = this.connected !== nextConn || this.gamepadIndex !== nextIdx || this.gamepadId !== nextId;
    this.connected = nextConn;
    this.gamepadIndex = nextIdx;
    this.gamepadId = nextId;
    if (changed) {
      this.onConnectionChange?.({
        connected: this.connected,
        index: this.gamepadIndex,
        id: this.gamepadId,
      });
    }
  }

  getActiveGamepad(gamepadsOverride = null) {
    const list =
      gamepadsOverride !== null
        ? gamepadsOverride
        : typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
          ? navigator.getGamepads()
          : null;

    if (!list) {
      if (this.connected) {
        this.prevButtons.clear();
        this.setConnectionState(false, null, '');
      }
      return null;
    }

    let active = null;
    if (this.gamepadIndex !== null) {
      const candidate = list[this.gamepadIndex];
      if (candidate && candidate.connected !== false) {
        active = candidate;
      }
    }
    if (!active) {
      for (let i = 0; i < list.length; i++) {
        const gp = list[i];
        if (gp && gp.connected !== false) {
          active = gp;
          break;
        }
      }
    }

    if (active) {
      this.setConnectionState(true, active.index ?? 0, active.id || 'Gamepad');
    } else if (this.connected) {
      this.prevButtons.clear();
      this.setConnectionState(false, null, '');
    }

    return active;
  }

  poll(dt = 0, gamepadsOverride = null) {
    const gp = this.getActiveGamepad(gamepadsOverride);
    if (!gp) {
      this.prevButtons.clear();
      return neutralState();
    }

    const buttons = gp.buttons || [];
    const axes = gp.axes || [];

    let steerX = this.applyDeadzone(axes[0] ?? 0, this.deadzone);
    let steerY = this.applyDeadzone(axes[1] ?? 0, this.deadzone);

    // D-Pad fallback/override (12: Up, 13: Down, 14: Left, 15: Right)
    if (isBtnDown(buttons[14])) steerX = -0.85;
    else if (isBtnDown(buttons[15])) steerX = 0.85;
    if (isBtnDown(buttons[12])) steerY = -0.7;
    else if (isBtnDown(buttons[13])) steerY = 0.7;

    const rightStickY = this.applyDeadzone(axes[3] ?? 0, 0.3);
    const camDistDelta = rightStickY * Math.max(0, dt || 0) * 1.1;

    // Continuous triggers: RT (7) = Cannon, LT (6) = Afterburner
    let cannonHeld = false;
    if (buttons.length > 7) {
      cannonHeld = isBtnDown(buttons[7], 0.22);
    } else if (axes.length > 5) {
      cannonHeld = Number(axes[5]) > 0.22;
    }
    const boostHeld = isBtnDown(buttons[6], 0.22);
    const lookBackHeld = isBtnDown(buttons[11], 0.5); // R3 (Right Stick Click)

    // Rising-edge button detections
    const pressed = {};
    let anyButtonDown = false;
    for (const [action, idx] of Object.entries(EDGE_BUTTONS)) {
      const now = isBtnDown(buttons[idx], 0.5);
      const prev = this.prevButtons.get(idx) === true;
      pressed[action] = now && !prev;
      this.prevButtons.set(idx, now);
      if (now) anyButtonDown = true;
    }

    const dpadDown =
      isBtnDown(buttons[12]) || isBtnDown(buttons[13]) || isBtnDown(buttons[14]) || isBtnDown(buttons[15]);
    const anyInput =
      Math.abs(steerX) > 0 ||
      Math.abs(steerY) > 0 ||
      Math.abs(rightStickY) > 0 ||
      cannonHeld ||
      boostHeld ||
      lookBackHeld ||
      dpadDown ||
      anyButtonDown;

    return {
      connected: true,
      id: this.gamepadId,
      anyInput,
      steerX,
      steerY,
      camDistDelta,
      cannonHeld,
      boostHeld,
      lookBackHeld,
      pressed,
    };
  }
}

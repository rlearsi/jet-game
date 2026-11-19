/**
 * Multi-touch on-screen flight controller using Pointer Events.
 * Pure DOM/event module with zero Three.js dependency.
 */
export class TouchController {
  constructor(opts = {}) {
    this.rootEl = opts.rootEl || null;
    this.stickZoneEl = opts.stickZoneEl || null;
    this.stickKnobEl = opts.stickKnobEl || null;
    this.fireBtnEl = opts.fireBtnEl || null;
    this.missileBtnEl = opts.missileBtnEl || null;
    this.boostBtnEl = opts.boostBtnEl || null;
    this.rollBtnEl = opts.rollBtnEl || null;
    this.camBtnEl = opts.camBtnEl || null;
    this.rearBtnEl = opts.rearBtnEl || null;

    this.onMissile = typeof opts.onMissile === 'function' ? opts.onMissile : null;
    this.onRoll = typeof opts.onRoll === 'function' ? opts.onRoll : null;
    this.onCamera = typeof opts.onCamera === 'function' ? opts.onCamera : null;
    this.onAnyTouch = typeof opts.onAnyTouch === 'function' ? opts.onAnyTouch : null;

    this.deadzone = 0.12;
    this.steerX = 0;
    this.steerY = 0;
    this.cannonHeld = false;
    this.boostHeld = false;
    this.lookBackHeld = false;

    this.stickPointerId = null;
    this.firePointers = new Set();
    this.boostPointers = new Set();
    this.rearPointers = new Set();
    this._tapTimers = new Map();

    this._bindStick();
    this._bindHoldButton(this.fireBtnEl, this.firePointers, (held) => {
      this.cannonHeld = held;
    });
    this._bindHoldButton(this.boostBtnEl, this.boostPointers, (held) => {
      this.boostHeld = held;
    });
    this._bindHoldButton(this.rearBtnEl, this.rearPointers, (held) => {
      this.lookBackHeld = held;
    });
    this._bindTapButton(this.missileBtnEl, () => {
      this.onMissile?.();
    });
    this._bindTapButton(this.rollBtnEl, () => {
      this.onRoll?.(this.steerX);
    });
    this._bindTapButton(this.camBtnEl, () => {
      this.onCamera?.();
    });
  }

  _updateStickFromEvent(e) {
    if (!this.stickZoneEl) return;
    const rect = this.stickZoneEl.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxRadius = Math.max(24, rect.width * 0.36);

    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);

    let clampedX = 0;
    let clampedY = 0;
    if (dist > 0.0001) {
      const clampedDist = Math.min(dist, maxRadius);
      clampedX = (dx / dist) * clampedDist;
      clampedY = (dy / dist) * clampedDist;
    }

    if (this.stickKnobEl) {
      this.stickKnobEl.style.transform = `translate3d(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px, 0)`;
    }

    const normDist = dist > 0.0001 ? Math.min(1, dist / maxRadius) : 0;
    if (normDist <= this.deadzone) {
      this.steerX = 0;
      this.steerY = 0;
    } else {
      const scaled = (normDist - this.deadzone) / (1 - this.deadzone);
      this.steerX = (dx / dist) * scaled;
      this.steerY = (dy / dist) * scaled;
    }
  }

  _clearStick() {
    this.stickPointerId = null;
    this.steerX = 0;
    this.steerY = 0;
    if (this.stickKnobEl) {
      this.stickKnobEl.style.transform = 'translate3d(0px, 0px, 0px)';
    }
    this.stickZoneEl?.classList?.remove('active');
  }

  _bindStick() {
    const zone = this.stickZoneEl;
    if (!zone) return;

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        zone.setPointerCapture?.(e.pointerId);
      } catch (_) {}
      this.stickPointerId = e.pointerId;
      zone.classList?.add('active');
      this._updateStickFromEvent(e);
      this.onAnyTouch?.();
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickPointerId) return;
      e.preventDefault();
      this._updateStickFromEvent(e);
    });

    const releaseStick = (e) => {
      if (e.pointerId !== this.stickPointerId) return;
      e.preventDefault();
      try {
        if (zone.hasPointerCapture?.(e.pointerId)) {
          zone.releasePointerCapture?.(e.pointerId);
        }
      } catch (_) {}
      this._clearStick();
    };

    zone.addEventListener('pointerup', releaseStick);
    zone.addEventListener('pointercancel', releaseStick);
    zone.addEventListener('lostpointercapture', releaseStick);
  }

  _bindHoldButton(el, pointerSet, onStateChange) {
    if (!el) return;

    const sync = () => {
      const held = pointerSet.size > 0;
      onStateChange(held);
      el.classList?.toggle('pressed', held);
    };

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch (_) {}
      pointerSet.add(e.pointerId);
      sync();
      this.onAnyTouch?.();
    });

    const release = (e) => {
      if (!pointerSet.has(e.pointerId)) return;
      e.preventDefault();
      try {
        if (el.hasPointerCapture?.(e.pointerId)) {
          el.releasePointerCapture?.(e.pointerId);
        }
      } catch (_) {}
      pointerSet.delete(e.pointerId);
      sync();
    };

    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
  }

  _bindTapButton(el, handler) {
    if (!el) return;

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList?.add('pressed');
      const prevTimer = this._tapTimers.get(el);
      if (prevTimer) clearTimeout(prevTimer);
      this._tapTimers.set(
        el,
        setTimeout(() => {
          el.classList?.remove('pressed');
          this._tapTimers.delete(el);
        }, 140)
      );
      this.onAnyTouch?.();
      handler();
    });

    const clearFlash = () => {
      el.classList?.remove('pressed');
    };
    el.addEventListener('pointerup', clearFlash);
    el.addEventListener('pointercancel', clearFlash);
  }

  reset() {
    this._clearStick();
    this.firePointers.clear();
    this.boostPointers.clear();
    this.rearPointers.clear();
    this.cannonHeld = false;
    this.boostHeld = false;
    this.lookBackHeld = false;
    for (const timer of this._tapTimers.values()) {
      clearTimeout(timer);
    }
    this._tapTimers.clear();
    for (const el of [this.fireBtnEl, this.missileBtnEl, this.boostBtnEl, this.rollBtnEl, this.camBtnEl, this.rearBtnEl]) {
      el?.classList?.remove('pressed');
    }
  }

  setVisible(visible) {
    if (this.rootEl) {
      this.rootEl.classList?.toggle('hidden', !visible);
    }
    if (!visible) {
      this.reset();
    }
  }

  static isTouchDevice() {
    if (typeof window === 'undefined') return false;
    const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const maxTouch = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 0;
    return 'ontouchstart' in window || maxTouch > 0 || coarse;
  }
}

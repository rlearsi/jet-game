export class JetSoundEngine {
  constructor() {
    this.enabled = false;
    this.initialized = false;
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;

    this.jetFilter = null;
    this.jetGain = null;
    this.abFilter = null;
    this.abGain = null;
    this.turbineOsc = null;
    this.turbineGain = null;
    this.rwrTimer = 0;
  }

  init() {
    if (this.initialized) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.ctx.destination);

    // 2s white noise buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Cruise jet wash
    const jetNoise = this.ctx.createBufferSource();
    jetNoise.buffer = this.noiseBuffer;
    jetNoise.loop = true;

    this.jetFilter = this.ctx.createBiquadFilter();
    this.jetFilter.type = 'bandpass';
    this.jetFilter.frequency.value = 420;
    this.jetFilter.Q.value = 0.85;

    this.jetGain = this.ctx.createGain();
    this.jetGain.gain.value = 0.14;

    jetNoise.connect(this.jetFilter);
    this.jetFilter.connect(this.jetGain);
    this.jetGain.connect(this.master);
    jetNoise.start();

    // Afterburner low roar
    const abNoise = this.ctx.createBufferSource();
    abNoise.buffer = this.noiseBuffer;
    abNoise.loop = true;

    this.abFilter = this.ctx.createBiquadFilter();
    this.abFilter.type = 'lowpass';
    this.abFilter.frequency.value = 210;

    this.abGain = this.ctx.createGain();
    this.abGain.gain.value = 0.0;

    abNoise.connect(this.abFilter);
    this.abFilter.connect(this.abGain);
    this.abGain.connect(this.master);
    abNoise.start();

    // High turbine whine
    this.turbineOsc = this.ctx.createOscillator();
    this.turbineOsc.type = 'sine';
    this.turbineOsc.frequency.value = 540;

    this.turbineGain = this.ctx.createGain();
    this.turbineGain.gain.value = 0.015;

    this.turbineOsc.connect(this.turbineGain);
    this.turbineGain.connect(this.master);
    this.turbineOsc.start();

    this.initialized = true;
  }

  toggle() {
    if (!this.initialized) this.init();
    this.enabled = !this.enabled;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.55 : 0.0, this.ctx.currentTime, 0.08);
    }
    return this.enabled;
  }

  updateJet(throttle, afterburner, inCockpit) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const muffle = inCockpit ? 0.68 : 1.0;

    this.jetFilter.frequency.setTargetAtTime((340 + throttle * 380) * muffle, now, 0.1);
    this.jetGain.gain.setTargetAtTime((0.11 + throttle * 0.08) * muffle, now, 0.1);

    this.abFilter.frequency.setTargetAtTime(afterburner ? 290 * muffle : 140, now, 0.12);
    this.abGain.gain.setTargetAtTime(afterburner ? 0.28 * muffle : 0.01, now, 0.12);

    this.turbineOsc.frequency.setTargetAtTime(480 + throttle * 260 + (afterburner ? 120 : 0), now, 0.1);
    this.turbineGain.gain.setTargetAtTime(inCockpit ? 0.018 : 0.012, now, 0.1);
  }

  playCannon() {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Punchy autocannon thump + metallic snap
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(210 + (Math.random() - 0.5) * 28, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.055);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.16, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(oscGain);
    oscGain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.065);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1450;
    filter.Q.value = 1.2;

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.14, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    src.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.master);
    src.start(now);
    src.stop(now + 0.05);
  }

  playMissile() {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Sharp ignition whoosh
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1900, now);
    filter.frequency.exponentialRampToValueAtTime(380, now + 0.42);
    filter.Q.value = 1.6;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + 0.48);

    // Subtle cockpit tone beep
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.setValueAtTime(1240, now + 0.045);

    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.06, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(og);
    og.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playImpact(isWater, isHeavy = true) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const dur = isHeavy ? 0.68 : 0.22;
    const filter = this.ctx.createBiquadFilter();
    filter.type = isWater ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(isWater ? 880 : isHeavy ? 360 : 520, now);
    filter.frequency.exponentialRampToValueAtTime(isWater ? 210 : isHeavy ? 46 : 95, now + dur);

    const gain = this.ctx.createGain();
    const vol = isWater ? (isHeavy ? 0.24 : 0.09) : isHeavy ? 0.48 : 0.15;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.04);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.06);
  }

  playCloudPop() {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.18);
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + 0.22);
  }

  playSwitch() {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // RWR incoming homing-missile alert tone (speeds up as missile closes in)
  updateMissileAlert(dt, minDist) {
    if (!(minDist > 0 && minDist < 650)) {
      this.rwrTimer = 0;
      return;
    }
    this.rwrTimer -= dt;
    if (this.rwrTimer > 0) return;

    const interval = minDist < 120 ? 0.10 : minDist < 320 ? 0.22 : 0.42;
    this.rwrTimer = interval;

    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 1.8;
    filter.connect(this.master);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    gain.connect(filter);

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(1180, now);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.065);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1560, now);
    osc2.connect(gain);
    osc2.start(now);
    osc2.stop(now + 0.065);
  }

  playPickup(kind) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = kind === 'health' ? [523.25, 659.25, 783.99] : [440, 659.25];
    notes.forEach((freq, i) => {
      const start = now + i * 0.065;
      const osc = this.ctx.createOscillator();
      osc.type = kind === 'health' ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(freq, start);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(kind === 'health' ? 0.14 : 0.09, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.14);

      osc.connect(g);
      g.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  }

  playEmpty() {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(190, now);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.045);
  }
}

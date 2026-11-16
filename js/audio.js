// Sound engine: every effect and the music are synthesised live with WebAudio.
// No audio files to download, so it works offline and stays small.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

export const Sound = {
  ctx: null,
  on: true,
  musicOn: true,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    let c;
    try { c = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    this.ctx = c;

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 5;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(c.destination);

    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
    this.sfx = c.createGain(); this.sfx.gain.value = this.on ? 1 : 0; this.sfx.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicOn ? 0.32 : 0; this.musicBus.connect(this.master);

    // Reverb: a generated impulse response (decaying stereo noise).
    this.reverb = c.createConvolver();
    const len = c.sampleRate * 2.6;
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb.buffer = ir;
    this.reverbOut = c.createGain(); this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut).connect(this.sfx);
    this.musicVerb = c.createGain(); this.musicVerb.gain.value = 0.25;
    this.musicVerb.connect(this.reverb);

    // Shared white noise.
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // Distortion curves.
    this.crush = this._curve(60);
    this.fuzz = this._curve(400);

    if (this.musicOn) this.startMusic();
  },

  setSfx(on) { this.on = on; if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05); },
  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.2);
    if (on) this.startMusic();
  },

  _curve(k) {
    const n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    return curve;
  },
  get t() { return this.ctx.currentTime; },
  ok() { return this.ctx && this.on; },

  // ----- building blocks -----------------------------------------------------
  /** Oscillator with an attack/decay envelope. Returns the gain node. */
  osc({ type = 'sine', f = 440, to = null, t = 0, dur = 0.2, vol = 0.2, attack = 0.005, verb = 0, dest = null, shaper = null, lp = null, detune = 0, vib = 0 }) {
    const c = this.ctx, s = this.t + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, s); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), s + dur);
    if (vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = 6; lg.gain.value = vib; l.connect(lg).connect(o.frequency);
      l.start(s); l.stop(s + dur + 0.1);
    }
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(vol, s + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    let node = o;
    if (shaper) { const w = c.createWaveShaper(); w.curve = shaper; w.oversample = '2x'; node.connect(w); node = w; }
    if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp[0], s); if (lp[1]) fl.frequency.exponentialRampToValueAtTime(lp[1], s + dur); fl.Q.value = lp[2] || 1; node.connect(fl); node = fl; }
    node.connect(g);
    g.connect(dest || this.sfx);
    if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v).connect(this.reverb); }
    o.start(s); o.stop(s + dur + 0.05);
    return g;
  },

  noise({ t = 0, dur = 0.1, vol = 0.2, type = 'bandpass', f = 2000, to = null, q = 1, attack = 0.002, verb = 0, dest = null, shaper = null }) {
    const c = this.ctx, s = this.t + t;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = rand(0.8, 1.2);
    const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, s);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, s + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(vol, s + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    let node = src;
    if (shaper) { const w = c.createWaveShaper(); w.curve = shaper; node.connect(w); node = w; }
    node.connect(fl).connect(g).connect(dest || this.sfx);
    if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v).connect(this.reverb); }
    src.start(s, rand(0, 1)); src.stop(s + dur + 0.05);
  },

  bell(f, t = 0, vol = 0.12, dur = 1.4, verb = 0.6) {
    this.osc({ f, t, dur, vol, verb });
    this.osc({ f: f * 2.76, t, dur: dur * 0.5, vol: vol * 0.35, verb });
    this.osc({ f: f * 5.4, t, dur: dur * 0.25, vol: vol * 0.15, verb });
  },

  // ----- game sounds ---------------------------------------------------------
  diceThrow() {
    if (!this.ok()) return;
    this.noise({ dur: 0.35, vol: 0.12, type: 'bandpass', f: 500, to: 3000, q: 0.8, attack: 0.08 });
  },
  /** One dice collision; strength 0..1 from the physics impact speed. */
  diceHit(strength, onFelt) {
    if (!this.ok() || strength < 0.04) return;
    const s = Math.min(1, strength);
    if (onFelt) {
      this.osc({ f: rand(140, 190), to: 70, dur: 0.08, vol: 0.35 * s });
      this.noise({ dur: 0.05, vol: 0.18 * s, type: 'bandpass', f: rand(1200, 2200), q: 2 });
    } else {
      this.noise({ dur: 0.045, vol: 0.4 * s, type: 'bandpass', f: rand(2500, 4200), q: 4, verb: 0.15 });
      this.osc({ type: 'triangle', f: rand(900, 1500), dur: 0.05, vol: 0.18 * s });
      this.osc({ f: rand(200, 260), to: 120, dur: 0.07, vol: 0.25 * s });
    }
  },
  diceResult(v) {
    if (!this.ok()) return;
    if (v === 6) return;
    this.osc({ type: 'triangle', f: mtof(72 + v), dur: 0.18, vol: 0.08, verb: 0.3 });
  },
  hop(i) {
    if (!this.ok()) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const f = mtof(67 + scale[Math.min(i, scale.length - 1)]);
    this.osc({ f: f * 0.75, to: f, dur: 0.13, vol: 0.16, attack: 0.01, verb: 0.15 });
    this.noise({ t: 0.11, dur: 0.03, vol: 0.12, type: 'highpass', f: 2500 });
    this.osc({ t: 0.11, f: 180, to: 90, dur: 0.06, vol: 0.18 });
  },
  out() {
    if (!this.ok()) return;
    this.osc({ type: 'sawtooth', f: 180, to: 900, dur: 0.35, vol: 0.09, lp: [400, 3000], attack: 0.05 });
    for (let k = 0; k < 5; k++) this.osc({ t: 0.18 + k * 0.05, f: rand(1800, 3600), dur: 0.25, vol: 0.05, verb: 0.6 });
    this.osc({ t: 0.3, f: 160, to: 70, dur: 0.12, vol: 0.3 });
  },
  six() {
    if (!this.ok()) return;
    [mtof(79), mtof(83), mtof(86)].forEach((f, k) => this.bell(f, k * 0.06, 0.1));
    this.noise({ dur: 0.6, vol: 0.05, type: 'highpass', f: 6000, verb: 0.5 });
  },
  safe() { if (this.ok()) this.bell(mtof(84), 0, 0.07, 1); },
  home() {
    if (!this.ok()) return;
    [60, 64, 67, 72, 76, 79, 84, 88].forEach((m, k) => this.osc({ type: 'triangle', f: mtof(m), t: k * 0.045, dur: 0.4, vol: 0.09, verb: 0.5 }));
    [72, 76, 79].forEach((m) => this.bell(mtof(m), 0.38, 0.1, 2));
  },
  nomove() {
    if (!this.ok()) return;
    this.osc({ type: 'sawtooth', f: mtof(55), to: mtof(54), dur: 0.35, vol: 0.1, lp: [900], vib: 6 });
    this.osc({ type: 'sawtooth', t: 0.38, f: mtof(53), to: mtof(48), dur: 0.7, vol: 0.1, lp: [800], vib: 10 });
  },
  three6() {
    if (!this.ok()) return;
    this.osc({ type: 'square', f: 220, to: 55, dur: 0.8, vol: 0.12, lp: [1500, 200] });
    this.noise({ dur: 0.5, vol: 0.2, type: 'lowpass', f: 1200, to: 100, shaper: this.crush });
  },
  pop() { if (this.ok()) this.osc({ f: 700, to: 1400, dur: 0.09, vol: 0.12 }); },
  tick() { if (this.ok()) this.osc({ type: 'triangle', f: 1400, dur: 0.04, vol: 0.06 }); },
  select() { if (this.ok()) { this.osc({ f: 880, to: 1320, dur: 0.12, vol: 0.12 }); this.osc({ t: 0.06, f: 1320, dur: 0.2, vol: 0.08, verb: 0.4 }); } },

  /** The knock-out. Heavy, distorted and loud: sub drop, crunch, metal and a doom stab. */
  capture() {
    if (!this.ok()) return;
    this.duck(3.2);
    // impact: sub-bass drop
    this.osc({ f: 160, to: 28, dur: 1.4, vol: 1.0, attack: 0.002 });
    this.osc({ f: 80, to: 30, dur: 1.0, vol: 0.6, shaper: this.crush, lp: [800, 120] });
    // crunch: distorted noise slam
    this.noise({ dur: 0.7, vol: 0.7, type: 'lowpass', f: 9000, to: 150, q: 0.7, shaper: this.fuzz, verb: 0.5 });
    this.noise({ dur: 0.12, vol: 0.6, type: 'highpass', f: 1500, shaper: this.fuzz });
    // metal clang (inharmonic partials)
    [420, 1004, 1580, 2210, 3170].forEach((f, k) => this.osc({ f: f * rand(0.98, 1.02), dur: 1.8 - k * 0.2, vol: 0.09, verb: 0.9 }));
    // doom stab: "DUN ... DUNNN" distorted power chord
    const stab = (t, root, dur, vol) => {
      [0, 7, 12, 19].forEach((iv, k) => {
        this.osc({ type: 'sawtooth', f: mtof(root + iv), t, dur, vol: vol / (k + 1.2), shaper: this.fuzz, lp: [2400, 300, 2], attack: 0.004, detune: rand(-12, 12), verb: 0.4 });
      });
      this.osc({ f: 90, to: 35, t, dur: 0.6, vol: 0.7 });
      this.noise({ t, dur: 0.25, vol: 0.35, type: 'lowpass', f: 4000, to: 200, shaper: this.crush });
    };
    stab(0.08, 28, 0.32, 0.35);
    stab(0.5, 27, 1.8, 0.42);
    // reverse-style swell into the second hit
    this.noise({ t: 0.25, dur: 0.26, vol: 0.25, type: 'bandpass', f: 400, to: 4000, attack: 0.24 });
  },
  /** The victim's sad trombone as it flies home. */
  wail() {
    if (!this.ok()) return;
    [58, 57, 56].forEach((m, k) => this.osc({ type: 'sawtooth', t: k * 0.32, f: mtof(m), dur: 0.3, vol: 0.09, lp: [1100], attack: 0.03 }));
    this.osc({ type: 'sawtooth', t: 0.96, f: mtof(55), to: mtof(53), dur: 1.1, vol: 0.1, lp: [1000, 400], attack: 0.03, vib: 9 });
  },
  danger() {
    if (!this.ok()) return;
    this.osc({ f: 70, to: 40, dur: 0.12, vol: 0.4 });
    this.osc({ t: 0.18, f: 65, to: 38, dur: 0.14, vol: 0.32 });
  },
  win() {
    if (!this.ok()) return;
    this.duck(5);
    const brass = (t, notes, dur, vol = 0.07) => notes.forEach((m) => {
      this.osc({ type: 'sawtooth', f: mtof(m), t, dur, vol, lp: [600, 2800, 1.5], attack: 0.03, detune: rand(-8, 8), verb: 0.5 });
      this.osc({ type: 'sawtooth', f: mtof(m), t, dur, vol: vol * 0.6, lp: [700, 2400], attack: 0.04, detune: rand(6, 14) });
    });
    brass(0, [67, 71, 74], 0.14); brass(0.16, [67, 71, 74], 0.14); brass(0.32, [67, 71, 74], 0.14);
    brass(0.5, [72, 76, 79, 84], 1.6, 0.08);
    [0, 0.16, 0.32].forEach((t) => this.osc({ f: 110, to: 60, t, dur: 0.25, vol: 0.4 }));
    this.osc({ f: 120, to: 45, t: 0.5, dur: 1, vol: 0.6 });
    this.noise({ t: 0.5, dur: 2.2, vol: 0.12, type: 'highpass', f: 5000, verb: 0.6 });
    [84, 88, 91, 96].forEach((m, k) => this.bell(mtof(m), 0.7 + k * 0.12, 0.06, 2));
  },

  duck(sec) {
    if (!this.ctx) return;
    const g = this.musicBus.gain, s = this.t;
    if (!this.musicOn) return;
    g.cancelScheduledValues(s);
    g.setValueAtTime(g.value, s);
    g.linearRampToValueAtTime(0.03, s + 0.05);
    g.setValueAtTime(0.03, s + sec);
    g.linearRampToValueAtTime(0.32, s + sec + 1.5);
  },

  // ----- music: a relaxed groove that loops (Am - F - C - G) ------------------
  startMusic() {
    if (!this.ctx || this._music) return;
    const bpm = 94, step = 60 / bpm / 4; // 16th notes
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const roots = [45, 41, 48, 43];
    let n = 0, next = this.t + 0.1;
    const play = (t) => {
      const bar = Math.floor(n / 16) % 4, s = n % 16;
      const ch = chords[bar], d = t - this.t;
      const M = { dest: this.musicBus };
      if (s === 0 || s === 8 || (s === 10 && bar % 2)) this.osc({ ...M, f: 130, to: 42, t: d, dur: 0.3, vol: 0.55 });
      if (s === 4 || s === 12) this.noise({ ...M, t: d, dur: 0.14, vol: 0.13, type: 'bandpass', f: 1800, q: 0.8 });
      if (s % 2 === 1) this.noise({ ...M, t: d, dur: 0.04, vol: s % 4 === 3 ? 0.06 : 0.03, type: 'highpass', f: 8000 });
      if (s === 0 || s === 6 || s === 10) this.osc({ ...M, type: 'triangle', f: mtof(roots[bar] - 12 + (s === 6 ? 12 : 0)), t: d, dur: step * 3.5, vol: 0.28, lp: [500] });
      if (s === 0) ch.forEach((m) => this.osc({ ...M, type: 'sawtooth', f: mtof(m), t: d, dur: step * 15, vol: 0.022, attack: 0.4, lp: [900, 500], detune: rand(-10, 10) }));
      if (s % 2 === 0 && Math.random() < 0.55) {
        const m = ch[Math.floor(Math.random() * 3)] + 12 + (Math.random() < 0.25 ? 12 : 0);
        const g = this.osc({ ...M, type: 'triangle', f: mtof(m), t: d, dur: 0.35, vol: 0.05 });
        g.connect(this.musicVerb);
      }
    };
    this._music = setInterval(() => {
      if (!this.musicOn) { clearInterval(this._music); this._music = null; return; }
      while (next < this.t + 0.25) { play(next); next += step; n++; }
    }, 60);
  },
};

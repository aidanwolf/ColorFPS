// Fully synthesized sound effects and a small adaptive music loop (no audio assets needed).
import { COLORS } from './colors.js';

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.music = null;
  }

  // Must be called from a user gesture.
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.32;
      this.musicBus.connect(this.master);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get t() {
    return this.ctx.currentTime;
  }

  tone({ type = 'sine', f = 440, f2 = null, dur = 0.15, gain = 0.3, attack = 0.004, bus, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.t + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, gain = 0.3, freq = 2000, q = 1, type = 'bandpass', f2 = null, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.t + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t0);
    if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(filt).connect(g).connect(this.sfxBus);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.05);
  }

  // ---- game sounds ----
  shoot(color) {
    const f = COLORS[color].freq * 4;
    this.tone({ type: 'square', f, f2: f * 0.35, dur: 0.09, gain: 0.09 });
    this.tone({ type: 'sawtooth', f: f * 0.5, f2: f * 0.2, dur: 0.12, gain: 0.07 });
    this.noise({ dur: 0.05, gain: 0.08, freq: 4000, q: 0.7 });
  }
  switchColor(color) {
    this.tone({ type: 'triangle', f: COLORS[color].freq * 2, dur: 0.06, gain: 0.12 });
  }
  hit() {
    this.tone({ type: 'square', f: 1400, f2: 700, dur: 0.06, gain: 0.08 });
  }
  immune() {
    this.tone({ type: 'triangle', f: 2400, f2: 2300, dur: 0.12, gain: 0.06 });
    this.tone({ type: 'sine', f: 3600, dur: 0.18, gain: 0.03 });
  }
  shatter() {
    this.noise({ dur: 0.45, gain: 0.35, freq: 3000, f2: 600, q: 0.8 });
    this.tone({ type: 'triangle', f: 1800, f2: 400, dur: 0.3, gain: 0.08 });
  }
  explode(big = false) {
    this.noise({ dur: big ? 1.4 : 0.6, gain: big ? 0.7 : 0.4, freq: 900, f2: 80, q: 0.5, type: 'lowpass' });
    this.tone({ type: 'sine', f: big ? 90 : 140, f2: 30, dur: big ? 1.0 : 0.4, gain: 0.5 });
  }
  enemyShoot() {
    this.tone({ type: 'sine', f: 600, f2: 200, dur: 0.18, gain: 0.08 });
  }
  hurt() {
    this.tone({ type: 'sawtooth', f: 160, f2: 60, dur: 0.22, gain: 0.25 });
    this.noise({ dur: 0.15, gain: 0.15, freq: 500, type: 'lowpass' });
  }
  jump() {
    this.tone({ type: 'sine', f: 200, f2: 320, dur: 0.08, gain: 0.05 });
  }
  land(strength = 1) {
    this.noise({ dur: 0.1, gain: 0.08 * strength, freq: 300, type: 'lowpass' });
  }
  pad() {
    this.tone({ type: 'sawtooth', f: 120, f2: 900, dur: 0.4, gain: 0.15 });
    this.noise({ dur: 0.3, gain: 0.15, freq: 600, f2: 4000 });
  }
  pickup() {
    [0, 4, 7, 12].forEach((n, i) => this.tone({ type: 'triangle', f: 523 * 2 ** (n / 12), dur: 0.18, gain: 0.12, delay: i * 0.06 }));
  }
  colorUnlocked(color) {
    const base = COLORS[color].freq;
    [0, 7, 12, 16, 19, 24].forEach((n, i) =>
      this.tone({ type: 'square', f: base * 2 ** (n / 12), dur: 0.35, gain: 0.07, delay: i * 0.08 }),
    );
  }
  secret() {
    [0, 3, 7, 10, 14].forEach((n, i) => this.tone({ type: 'sine', f: 660 * 2 ** (n / 12), dur: 0.3, gain: 0.1, delay: i * 0.07 }));
  }
  checkpoint() {
    this.tone({ type: 'sine', f: 880, dur: 0.15, gain: 0.1 });
    this.tone({ type: 'sine', f: 1320, dur: 0.25, gain: 0.1, delay: 0.1 });
  }
  door() {
    this.tone({ type: 'sawtooth', f: 60, f2: 40, dur: 0.8, gain: 0.25 });
    this.noise({ dur: 0.8, gain: 0.2, freq: 200, type: 'lowpass' });
  }
  bossRoar() {
    this.tone({ type: 'sawtooth', f: 70, f2: 45, dur: 1.6, gain: 0.4, attack: 0.1 });
    this.tone({ type: 'square', f: 105, f2: 60, dur: 1.4, gain: 0.15, attack: 0.1 });
    this.noise({ dur: 1.5, gain: 0.3, freq: 400, f2: 150, q: 2 });
  }
  charge() {
    this.tone({ type: 'sawtooth', f: 200, f2: 1600, dur: 0.8, gain: 0.08, attack: 0.3 });
  }
  sweep() {
    this.noise({ dur: 0.7, gain: 0.35, freq: 600, f2: 3000, q: 3 });
    this.tone({ type: 'sawtooth', f: 300, f2: 90, dur: 0.7, gain: 0.15 });
  }
  slam() {
    this.tone({ type: 'sine', f: 70, f2: 25, dur: 0.9, gain: 0.7 });
    this.noise({ dur: 0.8, gain: 0.5, freq: 600, f2: 60, type: 'lowpass' });
  }
  shieldBreak() {
    this.shatter();
    [12, 7, 3, 0].forEach((n, i) => this.tone({ type: 'square', f: 440 * 2 ** (n / 12), dur: 0.25, gain: 0.08, delay: i * 0.05 }));
  }
  comboTick(step) {
    this.tone({ type: 'square', f: 600 * 2 ** (step * 3 / 12), dur: 0.1, gain: 0.1 });
  }

  // ---- music: a simple bass/arp sequencer whose intensity can be raised ----
  startMusic() {
    if (!this.ctx || this.music) return;
    const ctx = this.ctx;
    const m = { step: 0, next: ctx.currentTime + 0.1, intensity: 0, timer: null, root: 0 };
    const bass = [0, 0, 12, 0, 0, 10, 0, 7, 0, 0, 12, 0, 3, 0, 5, 7];
    const arp = [0, 7, 12, 15, 12, 7, 3, 7];
    const tempo = () => (m.intensity >= 2 ? 0.105 : 0.135);
    const tick = () => {
      while (m.next < ctx.currentTime + 0.25) {
        const s = m.step % 16;
        const t = m.next - ctx.currentTime;
        const root = 55 * 2 ** (m.root / 12);
        if (bass[s] !== undefined && (s % 2 === 0 || m.intensity >= 1)) {
          this.tone({ type: 'sawtooth', f: root * 2 ** (bass[s] / 12), dur: 0.2, gain: 0.18, bus: this.musicBus, delay: t });
        }
        if (m.intensity >= 1 && s % 2 === 1) {
          this.tone({ type: 'square', f: root * 4 * 2 ** (arp[(m.step >> 1) % 8] / 12), dur: 0.09, gain: 0.05, bus: this.musicBus, delay: t });
        }
        if (s % 4 === 0) this.tone({ type: 'sine', f: 110, f2: 40, dur: 0.18, gain: 0.35, bus: this.musicBus, delay: t });
        if (m.intensity >= 2 && s % 4 === 2) this.tone({ type: 'sine', f: 110, f2: 40, dur: 0.12, gain: 0.25, bus: this.musicBus, delay: t });
        if (s % 2 === 1 && this.noiseBuf) this.hat(t, m.intensity >= 1 ? 0.05 : 0.025);
        m.step++;
        if (m.step % 64 === 0) m.root = [0, -2, 3, -4][(m.step / 64) % 4];
        m.next += tempo();
      }
    };
    m.timer = setInterval(tick, 60);
    this.music = m;
  }
  hat(delay, gain) {
    const t0 = this.t + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + 0.06);
  }
  setMusicMuted(m) {
    if (this.musicBus) this.musicBus.gain.value = m ? 0 : 0.32;
  }
  setIntensity(i) {
    if (this.music) this.music.intensity = i;
  }
  stopMusic() {
    if (this.music) clearInterval(this.music.timer);
    this.music = null;
  }
}

export const audio = new Audio();

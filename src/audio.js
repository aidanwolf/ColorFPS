// Sound: ElevenLabs-generated samples and music from public/audio/ (see tools/audio/gen.mjs),
// with synthesized fallbacks for anything that isn't there, so the game always has sound.
import { COLORS } from './colors.js';

const AUDIO_URL = `${import.meta.env.BASE_URL}audio/`;
const SFX_FILES = [
  'shoot', 'shatter', 'ricochet', 'hit', 'drone_explode', 'enemy_shot', 'hurt', 'death',
  'step_metal1', 'step_metal2', 'step_metal3', 'step_grass1', 'step_grass2', 'jump', 'land', 'switch',
  'health', 'secret', 'checkpoint', 'jump_pad', 'absorb', 'door_slam', 'door_open', 'target',
  'boss_roar', 'boss_slam', 'boss_sweep', 'boss_step', 'charge_up', 'shield_break', 'boss_death', 'fanfare',
  'shoot_red', 'shoot_yellow', 'shoot_green', 'shoot_blue', 'amb_foundry', 'amb_wind', 'amb_jungle', 'amb_core',
  'heartbeat', 'spike_hit', 'acid', 'crouch', 'respawn', 'maxhp', 'ui_click', 'game_start', 'glass_hit', 'mirror_hit',
  'barrier_reform', 'orb_pop', 'drone_alert', 'boss_land', 'boss_orbs', 'boss_charge', 'boss_limb_break', 'boss_phase',
  'boss_core_hit', 'combo_tick', 'combo_fail', 'ring_wave',
];
const SHOT_NAMES = ['shoot_red', 'shoot_yellow', 'shoot_green', 'shoot_blue'];
const MUSIC_GAIN = 1.7;

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.music = null;
    this.raw = new Map(); // name -> ArrayBuffer (prefetched before the AudioContext exists)
    this.buffers = new Map(); // name -> AudioBuffer
    this.track = null; // { name, src, gain } for the sample-based music
    this.wantTrack = null;
    this.available = null; // names listed in audio/manifest.json; null until it loads
    fetch(AUDIO_URL + 'manifest.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((names) => {
        this.available = new Set(names);
        this.prefetch(SFX_FILES);
        if (this.wantTrack) this.prefetch([this.wantTrack]);
      });
  }

  // Fetch sample files early; missing files are simply skipped (synth fallback).
  prefetch(names) {
    if (!this.available) return; // the manifest load calls back in here
    for (const n of names) {
      if (!this.available.has(n) || this.raw.has(n) || this.buffers.has(n)) continue;
      this.raw.set(n, null);
      fetch(AUDIO_URL + n + '.mp3')
        .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('audio') ? r.arrayBuffer() : null))
        .then((ab) => {
          if (!ab) return this.raw.delete(n);
          this.raw.set(n, ab);
          this.decode(n);
        })
        .catch(() => this.raw.delete(n));
    }
  }

  decode(n) {
    const ab = this.raw.get(n);
    if (!this.ctx || !ab) return;
    this.raw.set(n, null);
    this.ctx.decodeAudioData(ab).then(
      (buf) => {
        this.buffers.set(n, buf);
        if (this.wantTrack === n) this.playMusic(n);
        if (this.wantAmbient === n) this.playAmbient(n);
        if (n === 'heartbeat' && this.heartbeatOn) this.setHeartbeat(true, true);
      },
      () => {},
    );
  }

  // Play a loaded sample. Returns false if it isn't available so callers can fall back to synth.
  sample(name, { rate = 1, gain = 1, vary = 0.05, delay = 0 } = {}) {
    const buf = this.ctx && this.buffers.get(name);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfxBus);
    src.start(this.t + delay);
    return true;
  }

  pick(...names) {
    const ok = names.filter((n) => this.buffers.has(n));
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  }

  // ---- music: per-section tracks, crossfaded; synth sequencer when a track isn't available ----
  playMusic(name) {
    this.wantTrack = name;
    if (!this.ctx) return;
    if (this.track?.name === name) return;
    const buf = this.buffers.get(name);
    if (!buf) {
      if (!this.raw.has(name)) this.prefetch([name]);
      if (!this.track) this.startMusic(); // synth until the file arrives
      return;
    }
    this.stopMusic();
    const t = this.t;
    if (this.track) {
      const old = this.track;
      old.gain.gain.setTargetAtTime(0, t, 0.4);
      old.src.stop(t + 2.5);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(MUSIC_GAIN, t + 1.2);
    src.connect(g).connect(this.musicBus);
    src.start(t);
    this.track = { name, src, gain: g };
  }

  // ---- ambience: one looping bed per area, crossfaded ----
  playAmbient(name) {
    this.wantAmbient = name;
    if (!this.ctx || this.amb?.name === name) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const t = this.t;
    if (this.amb) {
      this.amb.gain.gain.setTargetAtTime(0, t, 0.6);
      this.amb.src.stop(t + 3);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 2);
    src.connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * buf.duration);
    this.amb = { name, src, gain: g };
  }

  // Low-health heartbeat loop.
  setHeartbeat(on, force = false) {
    if (on === this.heartbeatOn && !force) return;
    this.heartbeatOn = on;
    if (!this.ctx) return;
    if (on && !this.hb) {
      const buf = this.buffers.get('heartbeat');
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, this.t);
      g.gain.linearRampToValueAtTime(0.7, this.t + 0.5);
      src.connect(g).connect(this.sfxBus);
      src.start();
      this.hb = { src, gain: g };
    } else if (!on && this.hb) {
      this.hb.gain.gain.setTargetAtTime(0, this.t, 0.3);
      this.hb.src.stop(this.t + 1.5);
      this.hb = null;
    }
  }

  // A one-shot cue (the upgrade fanfare) that ducks the music, then lets it return.
  stinger(name, gain = 1.4) {
    const buf = this.ctx && this.buffers.get(name);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(this.t);
    if (this.track) {
      const tg = this.track.gain.gain;
      tg.cancelScheduledValues(this.t);
      tg.setTargetAtTime(MUSIC_GAIN * 0.15, this.t, 0.15);
      tg.setTargetAtTime(MUSIC_GAIN, this.t + buf.duration - 0.5, 0.8);
    }
    return true;
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
    for (const n of [...this.raw.keys()]) this.decode(n);
    if (this.wantTrack) this.playMusic(this.wantTrack);
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
  // every color has its own shot sound; the generic shot (pitched per color) and synth are fallbacks
  shoot(color) {
    if (this.sample(SHOT_NAMES[color], { gain: 0.6, vary: 0.06 })) return;
    if (this.sample('shoot', { rate: [1.0, 1.12, 1.25, 0.88][color], gain: 0.55 })) return;
    const f = COLORS[color].freq * 4;
    this.tone({ type: 'square', f, f2: f * 0.35, dur: 0.09, gain: 0.09 });
    this.tone({ type: 'sawtooth', f: f * 0.5, f2: f * 0.2, dur: 0.12, gain: 0.07 });
    this.noise({ dur: 0.05, gain: 0.08, freq: 4000, q: 0.7 });
  }
  switchColor(color) {
    if (this.sample('switch', { rate: 0.9 + color * 0.08, gain: 0.5 })) return;
    this.tone({ type: 'triangle', f: COLORS[color].freq * 2, dur: 0.06, gain: 0.12 });
  }
  hit() {
    if (this.sample('hit', { gain: 0.6 })) return;
    this.tone({ type: 'square', f: 1400, f2: 700, dur: 0.06, gain: 0.08 });
  }
  immune() {
    if (this.sample('ricochet', { gain: 0.6, vary: 0.12 })) return;
    this.tone({ type: 'triangle', f: 2400, f2: 2300, dur: 0.12, gain: 0.06 });
    this.tone({ type: 'sine', f: 3600, dur: 0.18, gain: 0.03 });
  }
  shatter() {
    if (this.sample('shatter', { gain: 0.7, vary: 0.1 })) return;
    this.noise({ dur: 0.45, gain: 0.35, freq: 3000, f2: 600, q: 0.8 });
    this.tone({ type: 'triangle', f: 1800, f2: 400, dur: 0.3, gain: 0.08 });
  }
  explode(big = false) {
    if (this.sample(big ? 'boss_death' : 'drone_explode', { gain: big ? 1 : 0.8 })) return;
    this.noise({ dur: big ? 1.4 : 0.6, gain: big ? 0.7 : 0.4, freq: 900, f2: 80, q: 0.5, type: 'lowpass' });
    this.tone({ type: 'sine', f: big ? 90 : 140, f2: 30, dur: big ? 1.0 : 0.4, gain: 0.5 });
  }
  enemyShoot() {
    if (this.sample('enemy_shot', { gain: 0.5, vary: 0.1 })) return;
    this.tone({ type: 'sine', f: 600, f2: 200, dur: 0.18, gain: 0.08 });
  }
  hurt() {
    if (this.sample('hurt', { gain: 0.8 })) return;
    this.tone({ type: 'sawtooth', f: 160, f2: 60, dur: 0.22, gain: 0.25 });
    this.noise({ dur: 0.15, gain: 0.15, freq: 500, type: 'lowpass' });
  }
  jump() {
    if (this.sample('jump', { gain: 0.4 })) return;
    this.tone({ type: 'sine', f: 200, f2: 320, dur: 0.08, gain: 0.05 });
  }
  land(strength = 1) {
    if (this.sample('land', { gain: Math.min(1, 0.3 + strength * 0.3) })) return;
    this.noise({ dur: 0.1, gain: 0.08 * strength, freq: 300, type: 'lowpass' });
  }
  pad() {
    if (this.sample('jump_pad', { gain: 0.8 })) return;
    this.tone({ type: 'sawtooth', f: 120, f2: 900, dur: 0.4, gain: 0.15 });
    this.noise({ dur: 0.3, gain: 0.15, freq: 600, f2: 4000 });
  }
  pickup() {
    if (this.sample('health', { gain: 0.7 })) return;
    [0, 4, 7, 12].forEach((n, i) => this.tone({ type: 'triangle', f: 523 * 2 ** (n / 12), dur: 0.18, gain: 0.12, delay: i * 0.06 }));
  }
  colorUnlocked(color) {
    const base = COLORS[color].freq;
    [0, 7, 12, 16, 19, 24].forEach((n, i) =>
      this.tone({ type: 'square', f: base * 2 ** (n / 12), dur: 0.35, gain: 0.07, delay: i * 0.08 }),
    );
  }
  secret() {
    if (this.sample('secret', { gain: 0.8, vary: 0 })) return;
    [0, 3, 7, 10, 14].forEach((n, i) => this.tone({ type: 'sine', f: 660 * 2 ** (n / 12), dur: 0.3, gain: 0.1, delay: i * 0.07 }));
  }
  checkpoint() {
    if (this.sample('checkpoint', { gain: 0.7, vary: 0 })) return;
    this.tone({ type: 'sine', f: 880, dur: 0.15, gain: 0.1 });
    this.tone({ type: 'sine', f: 1320, dur: 0.25, gain: 0.1, delay: 0.1 });
  }
  door() {
    if (this.sample('door_slam', { gain: 0.9 })) return;
    this.tone({ type: 'sawtooth', f: 60, f2: 40, dur: 0.8, gain: 0.25 });
    this.noise({ dur: 0.8, gain: 0.2, freq: 200, type: 'lowpass' });
  }
  bossRoar() {
    if (this.sample('boss_roar', { gain: 1 })) return;
    this.tone({ type: 'sawtooth', f: 70, f2: 45, dur: 1.6, gain: 0.4, attack: 0.1 });
    this.tone({ type: 'square', f: 105, f2: 60, dur: 1.4, gain: 0.15, attack: 0.1 });
    this.noise({ dur: 1.5, gain: 0.3, freq: 400, f2: 150, q: 2 });
  }
  charge() {
    if (this.sample('charge_up', { gain: 0.6 })) return;
    this.tone({ type: 'sawtooth', f: 200, f2: 1600, dur: 0.8, gain: 0.08, attack: 0.3 });
  }
  sweep() {
    if (this.sample('boss_sweep', { gain: 0.9 })) return;
    this.noise({ dur: 0.7, gain: 0.35, freq: 600, f2: 3000, q: 3 });
    this.tone({ type: 'sawtooth', f: 300, f2: 90, dur: 0.7, gain: 0.15 });
  }
  slam() {
    if (this.sample('boss_slam', { gain: 1 })) return;
    this.tone({ type: 'sine', f: 70, f2: 25, dur: 0.9, gain: 0.7 });
    this.noise({ dur: 0.8, gain: 0.5, freq: 600, f2: 60, type: 'lowpass' });
  }
  shieldBreak() {
    if (this.sample('shield_break', { gain: 1 })) return;
    this.shatter();
    [12, 7, 3, 0].forEach((n, i) => this.tone({ type: 'square', f: 440 * 2 ** (n / 12), dur: 0.25, gain: 0.08, delay: i * 0.05 }));
  }
  ricochet() {
    if (this.sample('ricochet', { gain: 0.55, vary: 0.15 })) return;
    this.tone({ type: 'triangle', f: 2600, f2: 1200, dur: 0.18, gain: 0.07 });
  }
  footstep(surface, sprint = false) {
    const name = surface === 'grass' ? this.pick('step_grass1', 'step_grass2') : this.pick('step_metal1', 'step_metal2', 'step_metal3');
    if (name && this.sample(name, { gain: sprint ? 0.45 : 0.32, vary: 0.1 })) return;
    this.noise({ dur: 0.06, gain: sprint ? 0.08 : 0.05, freq: surface === 'grass' ? 500 : 1400, q: 1.5 });
  }
  bossStep() {
    if (this.sample('boss_step', { gain: 0.9 })) return;
    this.land(2.5);
  }
  death() {
    if (this.sample('death', { gain: 1, vary: 0 })) return;
    this.tone({ type: 'sawtooth', f: 400, f2: 40, dur: 1.4, gain: 0.3 });
    this.noise({ dur: 1.2, gain: 0.35, freq: 1200, f2: 80, type: 'lowpass' });
  }
  absorb() {
    if (this.sample('absorb', { gain: 0.9, vary: 0 })) return;
    this.tone({ type: 'sawtooth', f: 110, f2: 880, dur: 2.6, gain: 0.12, attack: 0.5 });
    this.noise({ dur: 2.8, gain: 0.2, freq: 300, f2: 6000, q: 2 });
  }
  fanfare(color) {
    if (this.stinger('fanfare')) return;
    this.colorUnlocked(color);
  }
  doorOpen() {
    if (this.sample('door_open', { gain: 0.8 })) return;
    this.noise({ dur: 0.9, gain: 0.2, freq: 900, f2: 200, type: 'lowpass' });
  }
  target() {
    if (this.sample('target', { gain: 0.8, vary: 0 })) return;
    [0, 7, 12].forEach((n, i) => this.tone({ type: 'square', f: 660 * 2 ** (n / 12), dur: 0.15, gain: 0.08, delay: i * 0.05 }));
  }
  spike() {
    if (!this.sample('spike_hit', { gain: 0.9 })) this.hurt();
  }
  acid() {
    if (!this.sample('acid', { gain: 0.9 })) this.noise({ dur: 0.6, gain: 0.3, freq: 3000, f2: 800 });
  }
  crouch() {
    this.sample('crouch', { gain: 0.35 });
  }
  respawn() {
    if (!this.sample('respawn', { gain: 0.8, vary: 0 })) this.checkpoint();
  }
  maxhp() {
    if (!this.sample('maxhp', { gain: 0.9, vary: 0 })) this.secret();
  }
  uiClick() {
    this.sample('ui_click', { gain: 0.5 });
  }
  gameStart() {
    this.sample('game_start', { gain: 0.9, vary: 0 });
  }
  glassHit() {
    this.sample('glass_hit', { gain: 0.5, vary: 0.1 });
  }
  mirrorHit() {
    if (!this.sample('mirror_hit', { gain: 0.5, vary: 0.12 })) this.ricochet();
  }
  barrierReform() {
    this.sample('barrier_reform', { gain: 0.4 });
  }
  orbPop() {
    if (!this.sample('orb_pop', { gain: 0.6, vary: 0.1 })) this.hit();
  }
  droneAlert() {
    this.sample('drone_alert', { gain: 0.5, vary: 0.1 });
  }
  // ---- API used by drones / elevators (the audio agent fills these in with real samples) ----
  // A drone took a correct-color hit. gain 0..1 (distance falloff is the caller's job).
  droneHit(gain = 1) {
    if (!this.sample('drone_hit', { gain: 0.9 * gain, vary: 0.12 })) this.hit();
  }
  // A drone's been killed and is spinning out of the sky.
  droneCrash(gain = 1) {
    this.sample('drone_crash', { gain: 0.8 * gain, vary: 0.08 });
  }
  // The crashing drone hits the ground (or times out) and blows up.
  droneExplode(gain = 1) {
    if (!this.sample('drone_explode', { gain: 0.9 * gain, vary: 0.1 })) this.explode();
  }
  // A looping positional-ish sound (drone hum, elevator motor, sun hum...). Returns a handle whose
  // gain/rate the caller updates every frame; stop() fades it out. Safe to call before audio unlocks:
  // the handle starts playing once the sample is decoded.
  createLoop(name, { gain = 0, rate = 1 } = {}) {
    const h = { name, gain, rate, src: null, g: null, dead: false };
    const self = this;
    h.setGain = (v) => {
      h.gain = v;
      self._loopSync(h);
    };
    h.setRate = (v) => {
      h.rate = v;
      if (h.src) h.src.playbackRate.setTargetAtTime(v, self.t, 0.1);
    };
    h.stop = () => {
      h.dead = true;
      if (h.src) {
        h.g.gain.setTargetAtTime(0, self.t, 0.15);
        h.src.stop(self.t + 1);
        h.src = null;
      }
    };
    this.prefetch([name]);
    return h;
  }
  _loopSync(h) {
    if (h.dead || !this.ctx) return;
    if (!h.src) {
      if (h.gain <= 0.001) return;
      const buf = this.buffers.get(h.name);
      if (!buf) return;
      h.src = this.ctx.createBufferSource();
      h.src.buffer = buf;
      h.src.loop = true;
      h.src.playbackRate.value = h.rate;
      h.g = this.ctx.createGain();
      h.g.gain.value = 0;
      h.src.connect(h.g).connect(this.sfxBus);
      h.src.start(this.t, Math.random() * buf.duration);
    }
    h.g.gain.setTargetAtTime(h.gain, this.t, 0.08);
  }
  bossLand() {
    if (!this.sample('boss_land', { gain: 1, vary: 0 })) this.slam();
  }
  bossOrbs() {
    this.sample('boss_orbs', { gain: 0.8 });
  }
  bossCharge() {
    if (!this.sample('boss_charge', { gain: 0.9 })) this.charge();
  }
  bossLimbBreak() {
    if (!this.sample('boss_limb_break', { gain: 1 })) {
      this.shatter();
      this.explode();
    }
  }
  bossPhase() {
    if (!this.sample('boss_phase', { gain: 1, vary: 0 })) this.bossRoar();
  }
  bossCoreHit() {
    if (!this.sample('boss_core_hit', { gain: 0.7, vary: 0.08 })) this.hit();
  }
  comboFail() {
    if (!this.sample('combo_fail', { gain: 0.7 })) this.immune();
  }
  ringWave() {
    this.sample('ring_wave', { gain: 0.8 });
  }
  comboTick(step) {
    if (this.sample('combo_tick', { rate: 0.85 + step * 0.15, gain: 0.7, vary: 0 })) return;
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
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(m ? 0 : 0.32, this.t, 0.2);
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

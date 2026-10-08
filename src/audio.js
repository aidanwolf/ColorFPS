// Sound: ElevenLabs-generated samples and music from public/audio/ (see tools/audio/gen.mjs),
// with synthesized fallbacks for anything that isn't there, so the game always has sound.
import { COLORS } from './colors.js';
import { regionOf } from './levels/regions.js';

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
  'drone_hum', 'drone_hit', 'drone_crash', 'elevator_start', 'elevator_loop', 'elevator_stop', 'alarm', 'sun_hum',
  'amb_hub', 'amb_solar', 'amb_abyss', 'fall_wind', 'land_hard', 'impact_death',
  'step_tile1', 'step_tile2', 'step_tile3', 'step_grate1', 'step_grate2', 'step_stone1', 'step_stone2',
  'step_sand1', 'step_sand2', 'step_ice1', 'step_ice2', 'land_tile', 'land_sand',
];
const SHOT_NAMES = ['shoot_red', 'shoot_yellow', 'shoot_green', 'shoot_blue'];
const MUSIC_GAIN = 1.7;
const MUSIC_BUS = 0.32;
// Per-track loudness trims (linear), from ffmpeg's EBU R128 meter: the action tracks sit level with
// music_red (≈ -10 LUFS, trim 1), the calm hub / title / antechamber about 3 dB under it.
const MUSIC_TRIM = {
  music_title: 1.3, music_haunt: 1.3, music_red: 1, music_hub: 1.35, music_solar: 1.05, music_yellow: 1.25, music_green: 1.25,
  music_blue: 1.03, music_ascent: 1.35, music_antechamber: 1.25, music_boss: 0.97, music_boss_final: 0.97,
  music_victory: 1.05,
};
const XFADE = 3.5; // seconds for a full equal-power music crossfade
const XFADE_HUB = 5; // into or out of the hub: a slower, more deliberate breath
const XFADE_FIRST = 2.5; // fading in from silence
const MUSIC_KEEP = 4; // decoded music buffers kept (~30 MB each); older ones are re-decoded from their mp3
const AMB_GAIN = 0.35;
// The generated beds came out at very different loudness (-10 .. -39 LUFS); these even them out.
const AMB_TRIM = { amb_foundry: 1, amb_hub: 0.33, amb_solar: 2.2, amb_jungle: 2.2, amb_abyss: 2.4, amb_wind: 4, amb_core: 0.4 };
const AMB_XFADE = 3;

// Footstep materials. Every sample is played at `level` relative to its own peak (the generated takes
// came out anywhere from -30 to 0 dBFS), `layer` adds a quieter second material on top (frost on tile),
// `land` is the landing thud, `hz` the synth fallback's pitch.
const STEPS = {
  tile: { names: ['step_tile1', 'step_tile2', 'step_tile3'], level: 0.3, land: 'land_tile', hz: 2600 },
  icetile: { names: ['step_tile1', 'step_tile2', 'step_tile3'], level: 0.26, layer: 'ice', land: 'land_tile', hz: 3200 },
  grate: { names: ['step_grate1', 'step_grate2'], level: 0.26, land: 'land', hz: 1800 },
  metal: { names: ['step_metal1', 'step_metal2', 'step_metal3'], level: 0.26, land: 'land', hz: 1400 },
  stone: { names: ['step_stone1', 'step_stone2'], level: 0.26, land: 'land', hz: 900 },
  sand: { names: ['step_sand1', 'step_sand2'], level: 0.24, land: 'land_sand', hz: 3000 },
  ice: { names: ['step_ice1', 'step_ice2'], level: 0.24, land: 'land_tile', hz: 4000 },
  grass: { names: ['step_grass1', 'step_grass2'], level: 0.22, land: 'land_sand', hz: 500 },
};

// What walking on this solid sounds like: its kind (world.box), shaded by the area it's in.
function stepSurface(solid, pos) {
  const k = solid?.kind;
  const r = pos ? regionOf(pos) : 'red';
  const icy = r === 'azure';
  if (k === 'grass') return 'grass';
  if (k === 'floor') return icy ? 'icetile' : 'tile';
  if (k === 'grate') return 'grate';
  if (k === 'rock') return r === 'solar' ? 'sand' : icy ? 'ice' : 'stone';
  // standing on top of walls: masonry out in the wilds, plating indoors
  if (k === 'wall' || k === 'ceil' || k === 'door') return r === 'solar' || r === 'verdant' ? 'stone' : icy ? 'ice' : 'metal';
  return icy ? 'ice' : 'metal'; // metal, plat, lifts and elevators, anything unnamed
}

// ---- room acoustics ----
// Sound effects feed a reverb send: a short room and a long hall (procedural impulse responses in two
// ConvolverNodes, built once) and a stereo feedback delay for discrete echoes. updateSpace() measures
// the space around the camera with a fan of rays and moves only the three send levels (and the echo
// time), so walking from a corridor into the atrium blooms the tail and the echo in naturally.
const SPACE_FAR = 120;
const SPACE_RATE = 3; // full fan refreshes per second (a ray costs ~0.1-0.5 ms against every solid)
const SPACE_BATCHES = 8; // ...spread over this many small batches a second
const SPACE_DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], // horizontal 0..7: the walls
  [0.7071, 0, 0.7071], [0.7071, 0, -0.7071], [-0.7071, 0, 0.7071], [-0.7071, 0, -0.7071],
  [0, 1, 0], // 8: straight up
  [0.7071, 0.7071, 0], [-0.7071, 0.7071, 0], [0, 0.7071, 0.7071], [0, 0.7071, -0.7071], // 9..12: is there a roof?
].map(([x, y, z]) => ({ x, y, z }));
const SPANS = [[0, 1], [2, 3], [4, 7], [5, 6]]; // opposite horizontal pairs
const DOWN = { x: 0, y: -1, z: 0 };
const LOOP_SEND = 0.25; // drone hums and motors: a hint of the room, not a wash
const DRY_LOOPS = new Set(['fall_wind']); // wind in your ears has no room
const AT_MAX = 14; // positional enemy one-shots ringing at once (see at())

const smooth = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

// A procedural impulse response: decaying stereo noise (independent channels, so the tail is wide)
// that darkens as it decays, behind a pre-delay and a few discrete early reflections.
function impulse(ctx, { len, rt60, pre = 0.005, rise = 0.01, early = [], bright = 0.7 }) {
  const sr = ctx.sampleRate, n = Math.floor(len * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const p0 = Math.floor(pre * sr);
  const tap = Math.sqrt((sr * 0.01) / 3); // an early-reflection gain of 1 carries about as much as 10 ms of tail
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / sr;
      // a one-pole lowpass closing over the tail: the highs die first, like air and soft walls do;
      // the sqrt term keeps the filtered noise at the same power, so rt60 stays the decay time
      const b = Math.max(0.04, bright * Math.exp(-t / (rt60 * 0.45)));
      y += (Math.random() * 2 - 1 - y) * b;
      const env = Math.exp((-6.91 * t) / rt60) * (1 - Math.exp(-t / rise)) * Math.min(1, (n - i) / (0.03 * n));
      d[i] = y * Math.sqrt((2 - b) / b) * env;
    }
    for (const [t, g] of early) {
      const i = p0 + Math.floor(t * (c ? 1.07 : 0.94) * sr);
      if (i < n) d[i] += g * tap * (Math.random() < 0.5 ? -1 : 1);
    }
  }
  return buf;
}

// Cancel a param's pending automation, holding it at its current value (no jump back).
function hold(param, t) {
  if (param.cancelAndHoldAtTime) return param.cancelAndHoldAtTime(t);
  const v = param.value;
  param.cancelScheduledValues(t);
  param.setValueAtTime(v, t);
}

// A looping bed (a music track or an ambience). Its loudness follows an equal-power fade position
// p (0 silent .. 1 full, gain = level·sin(p·π/2)), so two beds crossing keep constant power, and a fade
// can be reversed at any moment (doorway bouncing) from exactly where it is, with no click or jump.
class Bed {
  constructor(ctx, name, buf, out, level, offset = 0) {
    this.ctx = ctx;
    this.name = name;
    this.level = level;
    this.src = ctx.createBufferSource();
    this.src.buffer = buf;
    this.src.loop = true;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.src.connect(this.out).connect(out);
    this.src.start(ctx.currentTime, offset % buf.duration);
    this.p0 = this.p1 = 0;
    this.fresh = true;
    this.t0 = ctx.currentTime;
    this.dur = 0;
    this.timer = 0;
  }

  pos(t = this.ctx.currentTime) {
    const u = this.dur > 0 ? Math.min(1, Math.max(0, (t - this.t0) / this.dur)) : 1;
    return this.p0 + (this.p1 - this.p0) * u;
  }

  remaining() {
    return Math.max(0, this.t0 + this.dur - this.ctx.currentTime);
  }

  // Fade towards p1 (0 or 1); `full` is how long a complete 0↔1 fade takes. onSilent runs once a fade
  // to 0 has landed (and wasn't reversed in the meantime).
  fadeTo(p1, full, onSilent) {
    const t = this.ctx.currentTime;
    const p0 = this.pos(t);
    const dur = Math.abs(p1 - p0) * full;
    const g = this.out.gain;
    const at = (p) => this.level * Math.sin((p * Math.PI) / 2);
    g.cancelScheduledValues(t);
    g.setValueAtTime(at(p0), t);
    // short linear segments trace the sine closely and, unlike a value curve, can be cut off anywhere
    const n = Math.max(1, Math.ceil(dur * 10));
    for (let i = 1; i <= n; i++) g.linearRampToValueAtTime(at(p0 + ((p1 - p0) * i) / n), t + (dur * i) / n);
    Object.assign(this, { p0, p1, t0: t, dur });
    clearTimeout(this.timer);
    if (p1 === 0 && onSilent) {
      const check = () => {
        if (this.p1 !== 0) return;
        if (this.pos() > 0) this.timer = setTimeout(check, (this.remaining() + 0.1) * 1000); // clock paused
        else onSilent();
      };
      this.timer = setTimeout(check, (dur + 0.1) * 1000);
    }
  }

  // Jump straight to fade position p (smoothed over ~0.1 s): for position-driven mixing.
  setLevel(p) {
    const t = this.ctx.currentTime;
    if (this.dur === 0 && Math.abs(p - this.p1) < 0.004) return;
    clearTimeout(this.timer);
    hold(this.out.gain, t);
    // a bed that has only just started (its file arrived) eases in; after that it tracks the mix closely
    this.out.gain.setTargetAtTime(this.level * Math.sin((p * Math.PI) / 2), t, this.fresh ? 0.5 : 0.06);
    this.fresh = false;
    Object.assign(this, { p0: p, p1: p, t0: t, dur: 0 });
  }

  stop() {
    clearTimeout(this.timer);
    try {
      this.src.stop();
    } catch {
      /* never started */
    }
    this.src.disconnect();
    this.out.disconnect();
  }
}

// A set of beds of which exactly one (cur) is wanted: switching fades the new one in and the rest out.
// Every name has at most one bed, so bouncing between two areas just reverses the same two fades.
class Layer {
  constructor() {
    this.cur = null;
    this.beds = new Map(); // name -> Bed
  }

  // make() builds the bed if this name isn't already playing (e.g. still fading out).
  to(name, make, full) {
    const prev = this.cur;
    let bed = name && this.beds.get(name);
    if (name && !bed) {
      bed = make();
      this.beds.set(name, bed);
    }
    for (const b of this.beds.values()) {
      if (b === bed) continue;
      const done = () => {
        b.stop();
        if (this.beds.get(b.name) === b) this.beds.delete(b.name);
      };
      // the bed we're leaving takes the full crossfade; anything older still on its way out is
      // hurried along so a quick A→B→C never leaves three tracks audible for long
      if (b === prev) b.fadeTo(0, full, done);
      else if (b.remaining() > 1.2 * b.pos()) b.fadeTo(0, 1.2, done);
    }
    if (bed) bed.fadeTo(1, full);
    this.cur = bed || null;
  }

  // Position-driven mix of two beds: a at (1 - w), b at w (equal power), everything else out quickly.
  // make(name) builds a bed, or returns null if its audio isn't ready (that side is just silent).
  blend(a, b, w, make) {
    const get = (n) => {
      if (!n) return null;
      let bed = this.beds.get(n);
      if (!bed) {
        bed = make(n);
        if (bed) this.beds.set(n, bed);
      }
      return bed;
    };
    const A = get(a), B = w > 0.001 ? get(b) : null;
    for (const bed of this.beds.values()) {
      if (bed === A || bed === B) continue;
      if (bed.p1 !== 0) bed.fadeTo(0, 1, () => {
        bed.stop();
        if (this.beds.get(bed.name) === bed) this.beds.delete(bed.name);
      });
    }
    A?.setLevel(1 - w);
    B?.setLevel(w);
    this.cur = (w < 0.5 ? A : B) || A || B || null;
  }
}

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.music = null; // the synth sequencer (fallback music)
    this.raw = new Map(); // name -> ArrayBuffer (prefetched before the AudioContext exists)
    this.buffers = new Map(); // name -> AudioBuffer (sound effects and ambient beds)
    this.musicBytes = new Map(); // name -> Promise<ArrayBuffer|null>, the compressed track (kept)
    this.musicBufs = new Map(); // name -> AudioBuffer, decoded tracks, least recently used first
    this.musicLoads = new Map(); // name -> Promise<AudioBuffer|null> while decoding
    this.musicLayer = new Layer();
    this.ambLayer = new Layer();
    this.loops = new Set(); // live createLoop handles
    this.wantTrack = null;
    this.wantAmbient = null;
    this.available = null; // names listed in audio/manifest.json; null until it loads
    this.lis = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 }; // the listener (the camera), for at()
    this.atLast = new Map(); // at()'s rate limit: key -> { t, g }
    this.atVoices = 0;
    this.manifest =fetch(AUDIO_URL + 'manifest.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((names) => {
        this.available = new Set(names);
        this.prefetch(SFX_FILES);
        // the opening track and the hub (which every world returns to) are worth having early
        for (const n of new Set([this.wantTrack, 'music_red', 'music_hub'])) if (n) this.musicFile(n);
      });
  }

  // name if its file is listed in the manifest (or the manifest hasn't loaded yet), else fallback
  musicOr(name, fallback) {
    return !this.available || this.available.has(name) ? name : fallback;
  }

  // a big moment: pull the music (and loops) down hard for a beat, then let it swell back
  slam(depth = 0.2, hold = 0.35, back = 1.4) {
    if (!this.ctx || !this.musicDuck) return;
    const t = this.ctx.currentTime;
    for (const g of [this.musicDuck.gain, this.loopBus?.gain].filter(Boolean)) {
      const v = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(v, t);
      g.linearRampToValueAtTime(v * depth, t + 0.04);
      g.setValueAtTime(v * depth, t + hold);
      g.linearRampToValueAtTime(v, t + hold + back);
    }
  }

  // a sound effect by name if its file exists, else a stand-in (for sounds still waiting to be generated)
  sfxOr(name, fallback) {
    return this.available && this.available.has(name) ? name : fallback;
  }

  // the sample-based track currently playing (or fading in)
  get track() {
    return this.musicLayer.cur;
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
        if (this.wantAmbient === n) this.playAmbient(n);
        if (n === 'heartbeat' && this.heartbeatOn) this.setHeartbeat(true, true);
        for (const h of this.loops) if (h.name === n) this._loopSync(h);
      },
      () => {},
    );
  }

  // ---- music files: fetched on demand; a 90 s track decodes to ~30 MB, so only the few most recent
  // stay decoded and the compressed bytes are kept to re-decode one quickly when its area comes back ----
  musicFile(name) {
    let p = this.musicBytes.get(name);
    if (!p) {
      p = this.manifest
        .then(() => (this.available.has(name) ? fetch(AUDIO_URL + name + '.mp3') : null))
        .then((r) => (r?.ok && (r.headers.get('content-type') || '').includes('audio') ? r.arrayBuffer() : null))
        .catch(() => null);
      p.then((ab) => ab || this.musicBytes.delete(name)); // let a failed fetch be retried later
      this.musicBytes.set(name, p);
    }
    return p;
  }

  loadMusic(name) {
    if (this.musicBufs.has(name)) return Promise.resolve(this.musicBufs.get(name));
    let p = this.musicLoads.get(name);
    if (p) return p;
    p = this.musicFile(name)
      .then((ab) => (ab && this.ctx ? this.ctx.decodeAudioData(ab.slice(0)) : null))
      .then(
        (buf) => {
          this.musicLoads.delete(name);
          if (buf) {
            this.musicBufs.set(name, buf);
            this.evictMusic();
          }
          return buf;
        },
        () => (this.musicLoads.delete(name), null),
      );
    this.musicLoads.set(name, p);
    return p;
  }

  evictMusic() {
    for (const n of [...this.musicBufs.keys()]) {
      if (this.musicBufs.size <= MUSIC_KEEP) return;
      if (n !== this.wantTrack && !this.musicLayer.beds.has(n)) this.musicBufs.delete(n);
    }
  }

  // Play a loaded sample. Returns false if it isn't available so callers can fall back to synth.
  // dry: skip the room reverb (UI and jingles).
  // cut: fade it out after this many seconds (keeps rapid footsteps crisp instead of smearing).
  sample(name, { rate = 1, gain = 1, vary = 0.05, delay = 0, dry = false, cut = 0 } = {}) {
    const buf = this.ctx && this.buffers.get(name);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dry ? this.dryBus : this.sfxBus);
    src.start(this.t + delay);
    if (cut) {
      g.gain.setTargetAtTime(0, this.t + delay + cut, 0.025);
      src.stop(this.t + delay + cut + 0.2);
    }
    return true;
  }

  // ---- positional one-shots (enemy sounds) ----
  // The game sets the listener (the camera) once a frame; at() plays a sample from a world point with a
  // distance falloff, a stereo pan from the camera's right vector, a per-key rate limit (a quieter repeat
  // inside `gap` seconds is dropped, a much louder one gets through) and a cap on how many of these ring
  // at once, so a crowd of enemies reads as a crowd and not as a wall of identical clicks.
  setListener(pos, q) {
    const L = this.lis;
    L.x = pos.x;
    L.y = pos.y;
    L.z = pos.z;
    // the camera's local +x (its right), from its quaternion
    L.rx = 1 - 2 * (q.y * q.y + q.z * q.z);
    L.ry = 2 * (q.x * q.y + q.w * q.z);
    L.rz = 2 * (q.x * q.z - q.w * q.y);
  }

  // distance from the listener to p
  distTo(p) {
    const L = this.lis;
    return Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z);
  }

  // stereo position of p for the listener, -1 (left) .. 1 (right), narrowed when it's right on top of us
  panOf(p) {
    const L = this.lis;
    const dx = p.x - L.x, dy = p.y - L.y, dz = p.z - L.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return 0;
    return ((dx * L.rx + dy * L.ry + dz * L.rz) / d) * 0.8 * Math.min(1, d / 2.5);
  }

  // o: { gain, rate, vary, near, far, delay, cut, gap, key }. Returns false if it didn't play.
  at(name, p, o) {
    if (!this.ctx) return false;
    const buf = this.buffers.get(name);
    if (!buf) return false;
    const d = this.distTo(p);
    const near = o.near ?? 4, far = o.far ?? 40;
    let k = d <= near ? 1 : d >= far ? 0 : 1 - (d - near) / (far - near);
    k *= k;
    const gain = (o.gain ?? 1) * k;
    if (gain < 0.008) return false;
    const now = this.t;
    const key = o.key || name;
    let last = this.atLast.get(key);
    if (!last) this.atLast.set(key, (last = { t: -1e9, g: 0 }));
    if (now - last.t < (o.gap ?? 0.05) && gain <= last.g * 1.6) return false;
    if (this.atVoices >= AT_MAX) return false;
    last.t = now;
    last.g = gain;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const vary = o.vary ?? 0.06;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * vary);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this.panOf(p);
    src.connect(g).connect(pan).connect(this.sfxBus);
    const t0 = now + (o.delay ?? 0);
    src.start(t0);
    if (o.cut) {
      g.gain.setTargetAtTime(0, t0 + o.cut, 0.03);
      src.stop(t0 + o.cut + 0.25);
    }
    this.atVoices++;
    src.onended = () => {
      this.atVoices--;
      pan.disconnect();
    };
    return true;
  }

  pick(...names) {
    const ok = names.filter((n) => this.buffers.has(n));
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  }

  // ---- music: per-area tracks, equal-power crossfaded; synth sequencer when a track isn't available ----
  // Moving through a doorway and straight back just reverses the two fades from where they are, so
  // tracks never stack or restart, and nothing is ever cut hard.
  playMusic(name) {
    this.wantTrack = name;
    if (!this.ctx) return void this.musicFile(name);
    const layer = this.musicLayer;
    if (layer.cur?.name === name) return;
    const buf = this.musicBufs.get(name) || (layer.beds.get(name) && layer.beds.get(name).src.buffer);
    if (!buf) {
      this.loadMusic(name).then((b) => b && this.wantTrack === name && this.playMusic(name));
      if (!layer.cur && !this.music) this.startMusic(); // synth until the file arrives
      return;
    }
    // mark it most recently used
    this.musicBufs.delete(name);
    this.musicBufs.set(name, buf);
    const from = layer.cur?.name;
    const full = !from && !this.music ? XFADE_FIRST : from === 'music_hub' || name === 'music_hub' ? XFADE_HUB : XFADE;
    this.stopMusic(full / 2);
    layer.to(name, () => new Bed(this.ctx, name, buf, this.musicDuck, MUSIC_GAIN * (MUSIC_TRIM[name] ?? 1)), full);
    this.evictMusic();
  }

  // Position-driven music: a and b mixed by w as you walk through a doorway between their areas (the
  // game calls this every frame; see Game.updateMix). Missing tracks load in the background.
  musicBlend(a, b, w) {
    this.wantTrack = w < 0.5 ? a : b;
    if (!this.ctx) return void this.musicFile(this.wantTrack);
    const make = (n) => {
      const buf = this.musicBufs.get(n);
      if (!buf) {
        this.loadMusic(n);
        return null;
      }
      return new Bed(this.ctx, n, buf, this.musicDuck, MUSIC_GAIN * (MUSIC_TRIM[n] ?? 1));
    };
    if (this.music && (this.musicBufs.has(a) || this.musicBufs.has(b))) this.stopMusic(1);
    else if (!this.music && !this.musicBufs.has(a) && !this.musicBufs.has(b) && !this.musicLayer.cur) this.startMusic();
    this.musicLayer.blend(a, b, w, make);
  }

  ambientBlend(a, b, w) {
    this.wantAmbient = w < 0.5 ? a : b;
    if (!this.ctx) return;
    const make = (n) => {
      const buf = this.buffers.get(n);
      if (!buf) {
        this.prefetch([n]);
        return null;
      }
      return new Bed(this.ctx, n, buf, this.dryBus, AMB_GAIN * (AMB_TRIM[n] ?? 1), Math.random() * buf.duration);
    };
    this.ambLayer.blend(a, b, w, make);
  }

  // ---- ambience: one looping bed per area, crossfaded the same way (null fades it out) ----
  playAmbient(name) {
    this.wantAmbient = name;
    if (!this.ctx || (this.ambLayer.cur?.name ?? null) === (name || null)) return;
    const buf = name && this.buffers.get(name);
    if (!buf) {
      // still loading: keep the old bed until decode() calls back; doesn't exist: fade to silence
      if (name) this.prefetch([name]);
      if (name && this.available && !this.available.has(name)) this.ambLayer.to(null, null, AMB_XFADE);
      return;
    }
    const level = AMB_GAIN * (AMB_TRIM[name] ?? 1);
    this.ambLayer.to(name, () => new Bed(this.ctx, name, buf, this.dryBus, level, Math.random() * buf.duration), AMB_XFADE);
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
      src.connect(g).connect(this.dryBus);
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
    // the duck sits after the crossfade, so a stinger mid-crossfade doesn't disturb it
    const dg = this.musicDuck.gain;
    hold(dg, this.t);
    dg.setTargetAtTime(0.15, this.t, 0.15);
    dg.setTargetAtTime(1, this.t + buf.duration - 0.5, 0.8);
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
      // sound effects: dry to the master plus a full send into the room reverb; the dry bus (ambience
      // beds, heartbeat, UI) skips the room
      this.buildReverb();
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.sfxBus.connect(this.verbIn);
      this.dryBus = this.ctx.createGain();
      this.dryBus.connect(this.master);
      // world loops (drone hums, motors) go through their own fader so they hush while the game is paused,
      // with only a light reverb send so a hovering drone doesn't smear into a drone of its own
      this.loopBus = this.ctx.createGain();
      this.loopBus.gain.value = this.loopsMuted ? 0 : 1;
      this.loopBus.connect(this.master);
      const loopSend = this.ctx.createGain();
      loopSend.gain.value = LOOP_SEND;
      this.loopBus.connect(loopSend).connect(this.verbIn);
      this.loopDry = this.ctx.createGain();
      this.loopDry.gain.value = this.loopsMuted ? 0 : 1;
      this.loopDry.connect(this.master);
      // music: tracks → duck (stingers) → bus (mute) → master; the synth fallback has its own fader
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = MUSIC_BUS;
      this.musicBus.connect(this.master);
      this.musicDuck = this.ctx.createGain();
      this.musicDuck.connect(this.musicBus);
      this.synthBus = this.ctx.createGain();
      this.synthBus.connect(this.musicDuck);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    for (const n of [...this.raw.keys()]) this.decode(n);
    if (this.wantTrack) this.playMusic(this.wantTrack);
    if (this.wantAmbient) this.playAmbient(this.wantAmbient);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // ---- room reverb: verbIn → [room IR, hall IR, echo delays] → master; updateSpace sets the sends ----
  buildReverb() {
    const ctx = this.ctx;
    this.verbIn = ctx.createGain();
    // keep the rumble and the fizz out of the tail
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 160;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    this.verbIn.connect(hp).connect(lp);
    const out = ctx.createGain();
    out.connect(this.master);
    const send = (dest) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      lp.connect(g).connect(dest);
      return g;
    };
    const conv = (opts) => {
      const c = ctx.createConvolver();
      c.buffer = impulse(ctx, opts);
      c.connect(out);
      return c;
    };
    // a small hard room (corridors, chambers) and a big hall whose first reflections come off far walls
    const room = conv({ len: 1, rt60: 0.6, pre: 0.003, rise: 0.004, bright: 0.85, early: [[0.006, 0.6], [0.011, 0.45], [0.019, 0.3]] });
    const hall = conv({ len: 4, rt60: 3.4, pre: 0.018, rise: 0.05, bright: 0.6, early: [[0.03, 0.6], [0.052, 0.45], [0.077, 0.4], [0.1, 0.3], [0.13, 0.22]] });
    // echo: two feedback delays a little apart (left / right), each repeat darker than the last
    const echoIn = ctx.createGain();
    const merge = ctx.createChannelMerger(2);
    const delays = [0, 1].map((ch) => {
      const d = ctx.createDelay(1.5);
      d.delayTime.value = 0.3;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 3000;
      const fb = ctx.createGain();
      fb.gain.value = 0;
      echoIn.connect(d).connect(damp);
      damp.connect(fb).connect(d);
      damp.connect(merge, 0, ch);
      return { d, fb };
    });
    merge.connect(out);
    this.verb = { room: send(room), hall: send(hall), echo: send(echoIn), delays };
  }

  // Called every frame with the camera position: measures the space around it with a fan of rays
  // (a few at a time, the whole fan three times a second) and steers the reverb sends.
  //   corridor / small room: a short tight room, low wet
  //   big enclosed hall (the Hub atrium): the long hall plus an echo off the far walls
  //   huge cavern (the Prism Core): even more hall, and an echo that keeps ringing
  //   open sky: next to no reverb, but a slapback off any walls in range (canyons)
  updateSpace(world, pos, dt) {
    const v = this.verb;
    if (!v || !world?.raycast) return;
    const N = SPACE_DIRS.length;
    const sp = (this.space ??= { dist: SPACE_DIRS.map(() => SPACE_FAR), next: 0, acc: 0, x: 0, y: 0, z: 0, down: 1.7, primed: false });
    // a teleport (respawn, dev start) re-measures everything at once and snaps the mix
    const jump = !sp.primed || (pos.x - sp.x) ** 2 + (pos.y - sp.y) ** 2 + (pos.z - sp.z) ** 2 > 64;
    Object.assign(sp, { x: pos.x, y: pos.y, z: pos.z, primed: true });
    // measured in small batches, eight a second; between them nothing changes
    sp.acc += dt;
    if (!jump && sp.acc < 1 / SPACE_BATCHES) return;
    sp.acc = 0;
    for (let n = jump ? N : Math.ceil((N * SPACE_RATE) / SPACE_BATCHES); n > 0; n--) {
      const i = sp.next;
      sp.next = (i + 1) % N;
      sp.dist[i] = world.raycast(pos, SPACE_DIRS[i], SPACE_FAR, { meshes: false })?.t ?? Infinity;
    }
    // and the floor below, every batch: how high the room is, and what a landing will sound like
    const below = world.raycast(pos, DOWN, 40, { meshes: false });
    sp.down = below ? below.t : 40;
    this.under = below ? { surface: stepSurface(below.solid, pos), t: this.t } : null;

    const d = sp.dist;
    const hz = d.slice(0, 8).map((x) => Math.min(x, SPACE_FAR)).sort((a, b) => a - b);
    // size: the cube root of a rough volume, from the two longest wall-to-wall spans (x, z and both
    // diagonals) and floor-to-ceiling height. Two spans, so a hall reads big from its middle or a corner
    // or beside a pillar, and a corridor stays small however long it is.
    const span = SPANS.map(([i, j]) => Math.min(d[i], SPACE_FAR) + Math.min(d[j], SPACE_FAR)).sort((x, y) => y - x);
    const roof = (d[8] < SPACE_FAR ? 2 : 0) + [9, 10, 11, 12].filter((i) => d[i] < SPACE_FAR).length;
    const openSides = hz.filter((x) => x >= SPACE_FAR).length / 8;
    const enc = smooth(0.35, 0.9, roof / 6) * (1 - 0.7 * openSides); // 0 open sky .. 1 roofed in
    const size = Math.cbrt(span[0] * span[1] * Math.max(2, Math.min(d[8], 80) + Math.min(sp.down, 20)));
    const big = smooth(14, 40, size); // corridor ~4, the Crucible ~27, the Hub atrium ~45-50
    // a cavern: the Prism Core's chambers (deep under the Hub) or anything vaster than the atrium
    const huge = big * Math.max(smooth(60, 90, size), regionOf(pos) === 'prism' ? 1 : 0);
    // indoors: the room for small spaces handing over to the hall (and its echo) as they grow
    let room = enc * (0.9 - 0.72 * big);
    let hall = enc * (0.05 + 0.9 * big + 0.35 * huge);
    const echoIn = enc * (0.25 * big + 0.07 * huge);
    // there and back off the farthest surface that answers (a far wall, the vault)
    const tIn = (2 * Math.max(...d.filter((x) => x < SPACE_FAR), 0)) / 343;
    // outdoors: a slapback off the walls in range, louder the more of them there are (far ones count less)
    const walls = hz.filter((x) => x > 3 && x < 90);
    const wf = walls.reduce((sum, x) => sum + 1 - 0.5 * smooth(30, 90, x), 0) / 8;
    const echoOut = (1 - enc) * 0.36 * smooth(0, 0.6, wf);
    const tOut = (2 * (walls[Math.floor(walls.length * 0.75)] || 30)) / 343;
    room += (1 - enc) * 0.08 * wf;
    hall += (1 - enc) * 0.06 * wf;
    const echo = echoIn + echoOut;
    const w = echo > 1e-3 ? echoIn / echo : enc;
    const time = Math.min(0.8, Math.max(0.1, tIn * w + tOut * (1 - w)));
    const fb = (0.35 + 0.15 * huge) * w + (0.12 + 0.12 * wf) * (1 - w);
    sp.mix = { enc, size, room, hall, echo, time, fb };

    const t = this.t, tc = jump ? 0.03 : 0.3;
    const want = (v.want ??= {});
    const set = (key, param, val, eps, k = tc) => {
      if (Math.abs((want[key] ?? -1) - val) < eps) return;
      want[key] = val;
      param.setTargetAtTime(val, t, k);
    };
    set('room', v.room.gain, room, 0.004);
    set('hall', v.hall.gain, hall, 0.004);
    set('echo', v.echo.gain, echo, 0.004);
    v.delays.forEach((line, i) => {
      // the echo time glides slowly (a quick change would warble the repeats in flight)
      set('time' + i, line.d.delayTime, time * (i ? 1.13 : 1), time * 0.04, jump ? 0.03 : 0.6);
      set('fb' + i, line.fb.gain, fb, 0.01);
    });
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
  // A landing thud on whatever is underfoot (updateSpace keeps a ray on the floor below the camera),
  // with a footstep of that material on top.
  land(strength = 1) {
    const surface = this.under && this.t - this.under.t < 1 ? this.under.surface : this.lastSurface || 'metal';
    const S = STEPS[surface];
    const name = this.buffers.has(S.land) ? S.land : 'land';
    if (this.buffers.has(name)) {
      this.sample(name, { gain: (Math.min(1, 0.3 + strength * 0.3) * 0.3) / this.peak(name) });
      this.stepSample(surface, 0.4 + 0.3 * Math.min(1, strength));
      return;
    }
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
    if (this.sample('secret', { gain: 0.8, vary: 0, dry: true })) return;
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
  // One stride on `ground` (the solid underfoot) at `pos`: its material picks the sample set (see
  // stepSurface). Sprinting hits harder and brighter. (Also takes a surface name in place of the solid.)
  footstep(ground, pos, sprint = false) {
    if (typeof pos === 'boolean') [pos, sprint] = [null, pos];
    const surface = typeof ground === 'string' ? (STEPS[ground] ? ground : 'metal') : stepSurface(ground, pos);
    this.lastSurface = surface;
    if (this.stepSample(surface, 1, sprint)) return;
    this.noise({ dur: 0.06, gain: sprint ? 0.08 : 0.05, freq: STEPS[surface].hz, q: 1.5 });
  }
  // One footstep sample of a surface at k × its level (never the same take twice running).
  stepSample(surface, k = 1, sprint = false) {
    const S = STEPS[surface];
    const last = (this.lastStep ??= {});
    const ok = S.names.filter((n) => this.buffers.has(n) && n !== last[surface]);
    const name = ok.length ? ok[Math.floor(Math.random() * ok.length)] : this.pick(...S.names);
    if (!name) return false;
    last[surface] = name;
    // every stride plays (no rate limit); each take is trimmed to its transient so a quick run stays
    // a crisp patter and the room, not the sample's own tail, carries the decay
    this.sample(name, { gain: (S.level * k * (sprint ? 1.35 : 1)) / this.peak(name), rate: sprint ? 1.05 : 1, vary: 0.08, cut: 0.2 });
    if (S.layer) this.stepSample(S.layer, k * 0.45, sprint);
    return true;
  }
  // A sample's peak level (cached), for evening out takes generated at very different loudness.
  peak(name) {
    let p = this.peaks?.get(name);
    if (p === undefined) {
      const buf = this.buffers.get(name);
      p = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
      }
      p = Math.max(0.05, p);
      (this.peaks ??= new Map()).set(name, p);
    }
    return p;
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
    if (!this.sample('respawn', { gain: 0.8, vary: 0, dry: true })) this.checkpoint();
  }
  maxhp() {
    if (!this.sample('maxhp', { gain: 0.9, vary: 0, dry: true })) this.secret();
  }
  uiClick() {
    this.sample('ui_click', { gain: 0.5, dry: true });
  }
  gameStart() {
    this.sample('game_start', { gain: 0.9, vary: 0, dry: true });
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
  // ---- drones / elevators ----
  // A drone took a correct-color hit. gain 0..1 (distance falloff is the caller's job).
  droneHit(gain = 1) {
    if (!this.ctx || gain <= 0.01) return;
    // rapid fire on one drone would stack a wall of identical clangs: keep the hits ≥ 45 ms apart
    if (this.t - (this.lastDroneHit || 0) < 0.045) return;
    this.lastDroneHit = this.t;
    if (this.sample('drone_hit', { gain: 0.95 * gain, vary: 0.1 })) {
      // a short sub thump under the clang gives the hit weight
      this.tone({ type: 'sine', f: 150, f2: 55, dur: 0.11, gain: 0.3 * gain });
      return;
    }
    this.hit();
    this.tone({ type: 'square', f: 320, f2: 120, dur: 0.08, gain: 0.12 * gain });
    this.noise({ dur: 0.07, gain: 0.25 * gain, freq: 2500, q: 0.9 });
  }
  // A drone's been killed and is spinning out of the sky.
  droneCrash(gain = 1) {
    if (!this.ctx || gain <= 0.01) return;
    if (this.sample('drone_crash', { gain: 0.85 * gain, vary: 0.08 })) return;
    this.tone({ type: 'sawtooth', f: 900, f2: 110, dur: 1.4, gain: 0.09 * gain, attack: 0.02 });
    this.noise({ dur: 1.2, gain: 0.12 * gain, freq: 3500, f2: 900, q: 2 });
  }
  // The crashing drone hits the ground (or times out) and blows up.
  droneExplode(gain = 1) {
    if (!this.ctx || gain <= 0.01) return;
    if (this.sample('drone_explode', { gain: 0.95 * gain, vary: 0.1 })) {
      this.tone({ type: 'sine', f: 95, f2: 32, dur: 0.6, gain: 0.45 * gain, attack: 0.006 });
      return;
    }
    this.noise({ dur: 0.7, gain: 0.45 * gain, freq: 1000, f2: 80, q: 0.5, type: 'lowpass' });
    this.tone({ type: 'sine', f: 140, f2: 30, dur: 0.5, gain: 0.5 * gain });
  }
  // A looping positional-ish sound (drone hum, elevator motor, sun hum...). Returns a handle whose
  // gain/rate the caller updates (typically every frame); stop() fades it out. Safe to call before audio
  // unlocks or the sample decodes: the loop starts as soon as it can, at the last gain/rate set.
  // A loop that's been silent for a couple of seconds releases its voice, so far-off drones cost nothing.
  createLoop(name, { gain = 0, rate = 1 } = {}) {
    const h = { name, gain, rate, src: null, g: null, dead: false, quiet: 0, setG: -1 };
    h.setGain = (v) => {
      h.gain = Math.max(0, v);
      this._loopSync(h);
    };
    h.setRate = (v) => {
      if (Math.abs(v - h.rate) < 1e-3) return;
      h.rate = v;
      if (h.src) h.src.playbackRate.setTargetAtTime(v, this.t, 0.1);
    };
    h.stop = () => {
      if (h.dead) return;
      h.dead = true;
      this.loops.delete(h);
      this._loopRelease(h, 0.15);
    };
    this.loops.add(h);
    this.prefetch([name]);
    this._loopSync(h);
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
      h.setG = 0;
      h.src.connect(h.g).connect(DRY_LOOPS.has(h.name) ? this.loopDry : this.loopBus);
      // a random point in the loop, so several drones humming together don't phase
      h.src.start(this.t, Math.random() * buf.duration);
    }
    if (h.gain <= 0.001) {
      if (!h.quiet) h.quiet = this.t;
      else if (this.t - h.quiet > 2) return this._loopRelease(h, 0.05);
    } else h.quiet = 0;
    if (Math.abs(h.gain - h.setG) < 0.002) return;
    h.setG = h.gain;
    h.g.gain.setTargetAtTime(h.gain, this.t, 0.08);
  }
  // Hush every createLoop sound (paused, cutscene, death screen), and bring them back.
  setLoopsMuted(m) {
    if (m === this.loopsMuted) return;
    this.loopsMuted = m;
    if (this.loopBus) for (const b of [this.loopBus, this.loopDry]) b.gain.setTargetAtTime(m ? 0 : 1, this.t, 0.12);
  }
  _loopRelease(h, tc) {
    if (!h.src) return;
    h.g.gain.setTargetAtTime(0, this.t, tc);
    h.src.stop(this.t + tc * 8);
    h.src = null;
    h.quiet = 0;
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
    if (!this.ctx) return;
    const sg = this.synthBus.gain;
    hold(sg, this.t);
    sg.setTargetAtTime(1, this.t, 0.3);
    if (this.music) {
      // it was fading out: keep it
      clearTimeout(this.music.stopTimer);
      return;
    }
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
          this.tone({ type: 'sawtooth', f: root * 2 ** (bass[s] / 12), dur: 0.2, gain: 0.18, bus: this.synthBus, delay: t });
        }
        if (m.intensity >= 1 && s % 2 === 1) {
          this.tone({ type: 'square', f: root * 4 * 2 ** (arp[(m.step >> 1) % 8] / 12), dur: 0.09, gain: 0.05, bus: this.synthBus, delay: t });
        }
        if (s % 4 === 0) this.tone({ type: 'sine', f: 110, f2: 40, dur: 0.18, gain: 0.35, bus: this.synthBus, delay: t });
        if (m.intensity >= 2 && s % 4 === 2) this.tone({ type: 'sine', f: 110, f2: 40, dur: 0.12, gain: 0.25, bus: this.synthBus, delay: t });
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
    s.connect(f).connect(g).connect(this.synthBus);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + 0.06);
  }
  setMusicMuted(m) {
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(m ? 0 : MUSIC_BUS, this.t, 0.2);
  }
  setIntensity(i) {
    if (this.music) this.music.intensity = i;
  }
  // Stop the synth, fading it out over `fade` seconds (it keeps sequencing until then).
  stopMusic(fade = 0) {
    const m = this.music;
    if (!m) return;
    const end = () => {
      clearInterval(m.timer);
      if (this.music === m) this.music = null;
    };
    clearTimeout(m.stopTimer);
    if (fade <= 0) return end();
    const sg = this.synthBus.gain;
    hold(sg, this.t);
    sg.setTargetAtTime(0, this.t, fade / 4);
    m.stopTimer = setTimeout(end, fade * 1000);
  }
}

export const audio = new Audio();

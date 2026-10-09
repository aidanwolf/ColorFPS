// Enemy body sounds: servos, hydraulics, robotic grunts, idle hums and clicks, played from where the enemy
// is (audio.at: distance falloff, stereo pan, rate limits, a voice cap). Every sound here is a new sample
// (tools/audio/sfx.json); until its mp3 exists, audio.sfxOr hands back an existing sample that's close
// enough, pitched / trimmed to stand in, so the hooks are audible today and switch over by themselves
// once the files are generated.
//   gain: level of the real sample   near/far: distance falloff   gap: seconds between repeats (all
//   enemies together; a much louder repeat still gets through)   fb: the stand-in, with its rate, level
//   and cut (seconds, so a long stand-in is trimmed to a blip)
//   floor: "break realism": the enemies' voices (pain grunts, effort, attack wind-ups) never fall below
//   floor × their level anywhere within ~80 m (audio.atFalloff), so a fight reads from across the arena;
//   servos and idle chatter keep a realistic falloff (a level full of them would be a wall of clicks)
import { audio } from '../audio.js';

// the distance floors: a death never below DEATH_FLOOR of its level within ~80 m, a grunt / telegraph /
// enraged cue never below GRUNT_FLOOR
export const DEATH_FLOOR = 0.6;
export const GRUNT_FLOOR = 0.35;
const REACH = 80, REACH_FADE = 25; // (as audio.js AT_REACH / AT_REACH_FADE)

export const ENEMY_SFX = {
  // humanoids (the Welder, the Mummy) and the Brute (their pain / effort grunts sit a few dB over the
  // area music at 10 m: they're the enemies' voices too)
  servo_heavy: { gain: 0.42, near: 3, far: 26, gap: 0.12, fb: 'crouch', fbRate: 0.78, fbGain: 0.9, cut: 0.32 },
  servo_light: { gain: 0.34, near: 3, far: 22, gap: 0.1, fb: 'crouch', fbRate: 1.3, fbGain: 0.75, cut: 0.22 },
  mummy_creak: { gain: 0.3, near: 3, far: 20, gap: 0.12, fb: 'rotor_turn', fbRate: 1.7, fbGain: 0.45, cut: 0.2 },
  hydraulic_hiss: { gain: 0.5, near: 3, far: 28, gap: 0.15, fb: 'gate_open', fbRate: 1.15, fbGain: 0.7, cut: 0.45 },
  hydraulic_land: { gain: 0.55, near: 3, far: 30, gap: 0.12, fb: 'land_hard', fbRate: 0.85, fbGain: 0.5, cut: 0.5 },
  robot_pain_heavy: { gain: 0.9, near: 4, far: 34, floor: GRUNT_FLOOR, gap: 0.22, fb: 'rotor_jam', fbRate: 0.82, fbGain: 0.75, cut: 0.42 },
  robot_pain_light: { gain: 1.3, near: 4, far: 30, floor: GRUNT_FLOOR, gap: 0.18, fb: 'combo_fail', fbRate: 1.15, fbGain: 0.55, cut: 0.4 },
  robot_effort: { gain: 0.65, near: 3, far: 28, floor: GRUNT_FLOOR, gap: 0.2, fb: 'mover_step', fbRate: 0.9, fbGain: 0.7, cut: 0.4 },
  welder_vent: { gain: 0.55, near: 3, far: 30, gap: 0.5, fb: 'elevator_stop', fbRate: 1.25, fbGain: 0.4, cut: 0.9 },
  robot_idle_click: { gain: 0.22, near: 2, far: 16, gap: 0.35, fb: 'switch_off', fbRate: 1.35, fbGain: 0.35, cut: 0.2 },
  robot_idle_hum: { gain: 0.22, near: 2, far: 16, gap: 0.6, fb: 'barrier_reform', fbRate: 0.5, fbGain: 0.25, cut: 0.8 },
  // small legged bots (blast crabs, scarabs, spider bots): a tiny servo tick per leg swing
  servo_tick: { gain: 0.2, near: 2, far: 14, gap: 0.07, fb: 'timer_tick', fbRate: 1.6, fbGain: 0.35, cut: 0.08 },
  crab_arm_whine: { gain: 0.5, near: 3, far: 28, floor: GRUNT_FLOOR, gap: 0.2, fb: 'charge_up', fbRate: 1.9, fbGain: 0.55, cut: 0.6 },
  // machines
  turret_servo: { gain: 0.26, near: 3, far: 24, gap: 0.25, fb: 'rotor_turn', fbRate: 1.5, fbGain: 0.35, cut: 0.3 },
  drone_servo: { gain: 0.3, near: 3, far: 22, gap: 0.15, fb: 'rotor_turn', fbRate: 2.1, fbGain: 0.35, cut: 0.22 },
  squid_servo: { gain: 0.26, near: 3, far: 20, gap: 0.3, fb: 'rotor_turn', fbRate: 0.75, fbGain: 0.3, cut: 0.35 },
  core_squeal: { gain: 0.45, near: 3, far: 26, floor: GRUNT_FLOOR, gap: 0.2, fb: 'combo_fail', fbRate: 1.7, fbGain: 0.5, cut: 0.3 },
  // the radio click that opens and closes an enemy voice line (combat/barks.js)
  radio_squelch: { gain: 0.3, near: 4, far: 45, gap: 0.1, fb: 'switch_off', fbRate: 1.8, fbGain: 0.35, cut: 0.15 },
};

// ---- death screams ----
// Every regular enemy family goes out with a big, clearly audible robotic death cry (tools/audio/sfx.json
// "death_*"), layered under its explosion. They're priority voices (audio.at prio: past the voice cap,
// rate-limited to one per DEATH_GAP s per name), carry across the whole arena (never under DEATH_FLOOR
// within ~80 m, still stereo-panned so you hear where it fell), are levelled by their loudest 50 ms
// (DEATH_LOUD, see loudness()) so every take lands equally loud however it came out of the generator,
// and dip the music a touch (DEATH_DUCK) so each kill pops out of the mix like a reward. Until a family's
// mp3 exists its stand-in (fb, pitched by fbRate, cut after `cut` s) plays instead.
const DEATH_LOUD = 0.38; // loudest-50 ms RMS a death plays at (× its gain) before distance: ≈ -8.4 dBFS
const DEATH_GAP = 0.12;
const DEATH_DUCK = 0.7; // music level under a death scream ...
const DEATH_DUCK_HOLD = 0.55; // ... for this long after the latest one
export const DEATH_SFX = {
  death_welder: { gain: 1.1, fb: 'warden_pain', fbRate: 0.68, cut: 1.7 }, // the Foundry grunt
  death_brute: { gain: 1.15, fb: 'titan_groan', fbRate: 1.15, cut: 1.5 },
  death_stilt: { gain: 1, fb: 'warden_pain', fbRate: 1.25, cut: 1.05 }, // the Mummy
  death_warden: { gain: 1, fb: 'warden_pain_big', fbRate: 1.35, cut: 1.5 },
  death_turret: { gain: 0.9, fb: 'reactor_powerdown', fbRate: 1.7, cut: 1.4 },
  death_mortar: { gain: 0.9, fb: 'servo_stutter', fbRate: 0.75, cut: 1.2 },
  death_drone: { gain: 0.85, fb: 'robot_pain_light', fbRate: 0.78, cut: 0.7 }, // drones and sub drones
  death_swarmer: { gain: 0.65, fb: 'robot_pain_light', fbRate: 1.5, cut: 0.35 },
  death_crab: { gain: 0.8, fb: 'seal_alarm', fbRate: 1.2, cut: 0.45 }, // the yelp before the blast
  death_scarab: { gain: 0.85, fb: 'sphinx_pain', fbRate: 1.7, cut: 0.7 }, // Solar and dune scarabs
  death_spider: { gain: 0.85, fb: 'seal_alarm', fbRate: 0.8, cut: 0.9 },
  death_slime: { gain: 0.85, fb: 'core_squeal', fbRate: 0.8, cut: 0.75 },
  death_squid: { gain: 1, fb: 'leviathan_hurt', fbRate: 1.6, cut: 0.9 },
  death_fish: { gain: 0.65, fb: 'leviathan_hurt', fbRate: 2.6, cut: 0.45 },
  death_crawler: { gain: 0.8, fb: 'core_squeal', fbRate: 1.15, cut: 0.6 },
  death_skiff: { gain: 1, fb: 'warden_pain', fbRate: 0.85, cut: 1.4 }, // the dune raiders' gunner
};

const FALLBACKS = [...new Set([...Object.values(ENEMY_SFX), ...Object.values(DEATH_SFX)].map((s) => s.fb))];
audio.manifest?.then(() => audio.prefetch([...Object.keys(ENEMY_SFX), ...Object.keys(DEATH_SFX), ...FALLBACKS]));

const O = { gain: 1, rate: 1, vary: 0.08, near: 4, far: 40, floor: 0, gap: 0.05, cut: 0, key: '', delay: 0, prio: false }; // reused

// Play enemy sound `name` from world point `pos`, at k × its level and `rate` × its pitch. `floor`
// overrides the entry's distance floor (e.g. GRUNT_FLOOR for a hiss that's a telegraph this time).
export function esfx(name, pos, k = 1, rate = 1, delay = 0, floor = null) {
  const S = ENEMY_SFX[name];
  if (!S || !audio.ctx || k <= 0.01) return false;
  const file = audio.sfxOr(name, S.fb);
  const real = file === name;
  O.gain = S.gain * k * (real ? 1 : S.fbGain);
  O.rate = rate * (real ? 1 : S.fbRate);
  O.vary = 0.08;
  O.near = S.near;
  O.far = S.far;
  O.floor = floor ?? S.floor ?? 0;
  O.gap = S.gap;
  O.cut = real ? 0 : S.cut;
  O.key = name;
  O.delay = delay;
  O.prio = false;
  return audio.at(file, pos, O);
}

let duckTimer = 0;
const LOUD = new Map(); // name -> loudest 50 ms RMS of its decoded buffer

// A sample's short-term loudness: the RMS of its loudest 50 ms window (measured once). Unlike the peak
// this tracks how loud a scream sounds whatever its crest factor (a spiky yelp vs. a dense roar).
function loudness(name) {
  let l = LOUD.get(name);
  if (l === undefined) {
    const buf = audio.buffers.get(name);
    const w = Math.max(1, Math.floor(buf.sampleRate * 0.05));
    const chans = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
    l = 0;
    for (let i0 = 0; i0 < buf.length; i0 += w) {
      let s = 0;
      const i1 = Math.min(buf.length, i0 + w);
      for (const d of chans) for (let i = i0; i < i1; i++) s += d[i] * d[i];
      l = Math.max(l, Math.sqrt(s / ((i1 - i0) * chans.length)));
    }
    LOUD.set(name, (l = Math.max(0.01, l)));
  }
  return l;
}

// An enemy's death scream `name` (DEATH_SFX) from world point `pos`, at k × its level and `rate` × its
// pitch, `delay` s from now. Returns false if it didn't play (no audio yet, rate-limited, capped).
export function edeath(name, pos, k = 1, rate = 1, delay = 0) {
  const S = DEATH_SFX[name];
  if (!S || !pos || !audio.ctx || k <= 0.01) return false;
  const file = audio.sfxOr(name, S.fb);
  if (!audio.buffers.has(file)) return false;
  const real = file === name;
  O.gain = S.gain * k * Math.min(4, Math.max(0.25, DEATH_LOUD / loudness(file)));
  O.rate = rate * (real ? 1 : S.fbRate);
  O.vary = 0.06;
  O.near = 8;
  O.far = REACH;
  O.floor = DEATH_FLOOR;
  O.gap = DEATH_GAP;
  O.cut = real ? 0 : S.cut;
  O.key = name;
  O.delay = delay;
  O.prio = true;
  if (!audio.at(file, pos, O)) return false;
  audio.duck('enemy_death', DEATH_DUCK);
  clearTimeout(duckTimer);
  duckTimer = setTimeout(() => audio.duck('enemy_death', 1), (delay + DEATH_DUCK_HOLD) * 1000);
  return true;
}

// For enemy sounds played flat (audio.sample) with their own distance gain: 1 inside `near`, fading to 0
// at `far`, but never under `floor` within ~80 m. A telegraph's gain = its level × reach(dist, near, far).
export function reach(d, near, far, floor = GRUNT_FLOOR) {
  const lin = Math.min(1, Math.max(0, 1 - (d - near) / (far - near)));
  const keep = d <= REACH ? 1 : Math.max(0, 1 - (d - REACH) / REACH_FADE);
  return Math.max(lin, floor * keep);
}

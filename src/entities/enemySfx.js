// Enemy body sounds: servos, hydraulics, robotic grunts, idle hums and clicks, played from where the enemy
// is (audio.at: distance falloff, stereo pan, rate limits, a voice cap). Every sound here is a new sample
// (tools/audio/sfx.json); until its mp3 exists, audio.sfxOr hands back an existing sample that's close
// enough, pitched / trimmed to stand in, so the hooks are audible today and switch over by themselves
// once the files are generated.
//   gain: level of the real sample   near/far: distance falloff   gap: seconds between repeats (all
//   enemies together; a much louder repeat still gets through)   fb: the stand-in, with its rate, level
//   and cut (seconds, so a long stand-in is trimmed to a blip)
import { audio } from '../audio.js';

export const ENEMY_SFX = {
  // humanoids (the Welder, the Mummy) and the Brute
  servo_heavy: { gain: 0.42, near: 3, far: 26, gap: 0.12, fb: 'crouch', fbRate: 0.78, fbGain: 0.9, cut: 0.32 },
  servo_light: { gain: 0.34, near: 3, far: 22, gap: 0.1, fb: 'crouch', fbRate: 1.3, fbGain: 0.75, cut: 0.22 },
  mummy_creak: { gain: 0.3, near: 3, far: 20, gap: 0.12, fb: 'rotor_turn', fbRate: 1.7, fbGain: 0.45, cut: 0.2 },
  hydraulic_hiss: { gain: 0.5, near: 3, far: 28, gap: 0.15, fb: 'gate_open', fbRate: 1.15, fbGain: 0.7, cut: 0.45 },
  hydraulic_land: { gain: 0.55, near: 3, far: 30, gap: 0.12, fb: 'land_hard', fbRate: 0.85, fbGain: 0.5, cut: 0.5 },
  robot_pain_heavy: { gain: 0.6, near: 4, far: 34, gap: 0.22, fb: 'rotor_jam', fbRate: 0.82, fbGain: 0.75, cut: 0.42 },
  robot_pain_light: { gain: 0.5, near: 4, far: 30, gap: 0.18, fb: 'combo_fail', fbRate: 1.15, fbGain: 0.55, cut: 0.4 },
  robot_effort: { gain: 0.5, near: 3, far: 28, gap: 0.2, fb: 'mover_step', fbRate: 0.9, fbGain: 0.7, cut: 0.4 },
  welder_vent: { gain: 0.55, near: 3, far: 30, gap: 0.5, fb: 'elevator_stop', fbRate: 1.25, fbGain: 0.4, cut: 0.9 },
  robot_idle_click: { gain: 0.22, near: 2, far: 16, gap: 0.35, fb: 'switch_off', fbRate: 1.35, fbGain: 0.35, cut: 0.2 },
  robot_idle_hum: { gain: 0.22, near: 2, far: 16, gap: 0.6, fb: 'barrier_reform', fbRate: 0.5, fbGain: 0.25, cut: 0.8 },
  // small legged bots (blast crabs, scarabs, spider bots): a tiny servo tick per leg swing
  servo_tick: { gain: 0.2, near: 2, far: 14, gap: 0.07, fb: 'timer_tick', fbRate: 1.6, fbGain: 0.35, cut: 0.08 },
  crab_arm_whine: { gain: 0.5, near: 3, far: 28, gap: 0.2, fb: 'charge_up', fbRate: 1.9, fbGain: 0.55, cut: 0.6 },
  // machines
  turret_servo: { gain: 0.26, near: 3, far: 24, gap: 0.25, fb: 'rotor_turn', fbRate: 1.5, fbGain: 0.35, cut: 0.3 },
  drone_servo: { gain: 0.3, near: 3, far: 22, gap: 0.15, fb: 'rotor_turn', fbRate: 2.1, fbGain: 0.35, cut: 0.22 },
  squid_servo: { gain: 0.26, near: 3, far: 20, gap: 0.3, fb: 'rotor_turn', fbRate: 0.75, fbGain: 0.3, cut: 0.35 },
  core_squeal: { gain: 0.45, near: 3, far: 26, gap: 0.2, fb: 'combo_fail', fbRate: 1.7, fbGain: 0.5, cut: 0.3 },
  // the radio click that opens and closes an enemy voice line (combat/barks.js)
  radio_squelch: { gain: 0.3, near: 4, far: 45, gap: 0.1, fb: 'switch_off', fbRate: 1.8, fbGain: 0.35, cut: 0.15 },
};

const FALLBACKS = [...new Set(Object.values(ENEMY_SFX).map((s) => s.fb))];
audio.manifest?.then(() => audio.prefetch([...Object.keys(ENEMY_SFX), ...FALLBACKS]));

const O = { gain: 1, rate: 1, vary: 0.08, near: 4, far: 40, gap: 0.05, cut: 0, key: '', delay: 0 }; // reused

// Play enemy sound `name` from world point `pos`, at k × its level and `rate` × its pitch.
export function esfx(name, pos, k = 1, rate = 1, delay = 0) {
  const S = ENEMY_SFX[name];
  if (!S || !audio.ctx || k <= 0.01) return false;
  const file = audio.sfxOr(name, S.fb);
  const real = file === name;
  O.gain = S.gain * k * (real ? 1 : S.fbGain);
  O.rate = rate * (real ? 1 : S.fbRate);
  O.near = S.near;
  O.far = S.far;
  O.gap = S.gap;
  O.cut = real ? 0 : S.cut;
  O.key = name;
  O.delay = delay;
  return audio.at(file, pos, O);
}

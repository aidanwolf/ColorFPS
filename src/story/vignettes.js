// What Wren's ghost acts out while each log plays (ghost.js performs these, holo.js draws her).
//
// A vignette: { props, set, dist, view, keys }.
//   props: what she holds at the start (holo.js PROPS); a key's `props` swaps them (the props flash)
//   set: holographic set pieces on the stage, name: [x, y, z, yawDeg] (the stage faces the player: +Z
//        toward you, +X her left / your right when she faces you)
//   dist: how far from the player the stage goes · view: how far it's turned from facing you (degrees)
//   keys: [time (s, the log's clock), changes]: each key lists only what changes (the rest carries over);
//        between keys every channel eases along a monotone curve. Channels: see CHANNELS in ghost.js.
//        Moving `at` walks her (the walk / run cycle comes on by itself; gait: 0 for jumps and climbs).
// Times follow the caption timings in logdata.json, so her gestures land on her words.

// ---- building blocks
const STAND = {
  hips: [0, 0.95, 0], hipsR: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  lFoot: [0.1, 0.075, 0.03, 7, 0], rFoot: [-0.1, 0.075, -0.02, -7, 0], knees: [6, 6], gait: 1,
};
const ARMS = {
  lClav: [0, 0], rClav: [0, 0], lArm: [7, 80, 0], rArm: [7, 80, 0], lFore: [12, 0], rFore: [12, 0],
  lHand: [0, 0, 0], rHand: [0, 0, 0], lIK: [0.2, 1, 0.3, 0], rIK: [-0.2, 1, 0.3, 0],
};
const NOIK = { lIK: [null, null, null, 0], rIK: [null, null, null, 0] };
const KNEEL = { hips: [0, 0.5, -0.06], hipsR: [8, 0, 0], lFoot: [0.13, 0.075, 0.3, 8, 0], rFoot: [-0.11, 0.12, -0.42, -4, -70], knees: [10, 4] };
const CROUCH = { hips: [0, 0.56, -0.1], hipsR: [30, 0, 0], spine: [12, 0, 0], chest: [6, 0, 0], head: [-34, 0, 0], lFoot: [0.13, 0.075, 0.1, 14, 0], rFoot: [-0.13, 0.075, 0.06, -14, 0], knees: [20, 20] };
const SIT = { hips: [0, 0.13, -0.18], hipsR: [-22, 0, 0], spine: [12, 0, 0], chest: [8, 0, 0], head: [-4, 0, 0], lFoot: [0.15, 0.075, 0.34, 12, 14], rFoot: [-0.15, 0.075, 0.34, -12, 14], knees: [12, 12] };
const SIT_CROSS = { hips: [0, 0.12, 0], hipsR: [-4, 0, 0], spine: [8, 0, 0], chest: [4, 0, 0], lFoot: [-0.13, 0.07, 0.24, -70, 0], rFoot: [0.15, 0.07, 0.17, 70, 0], knees: [72, 72] };
const BENT = { hips: [0, 0.88, 0.04], hipsR: [36, 0, 0], spine: [14, 0, 0], chest: [6, 0, 0], head: [-22, 0, 0], lFoot: [0.12, 0.075, 0.1, 10, 0], rFoot: [-0.12, 0.075, 0.06, -10, 0], knees: [12, 12] };
// arms
const REC_MOUTH = { rArm: [38, 18, 0], rFore: [128, 0], rHand: [0, 0, 0] }; // the recorder at her lips
const REC_CHEST = { rArm: [28, 8, 0], rFore: [112, 0], rHand: [0, 0, 0] };
const HUG = { lArm: [38, -40, 0], lFore: [112, 0], rArm: [38, -40, 0], rFore: [112, 0], lClav: [12, 6], rClav: [12, 6] };
const HANDS_MOUTH = { lArm: [42, -24, 0], lFore: [146, 0], rArm: [42, -24, 0], rFore: [146, 0], lClav: [14, 4], rClav: [14, 4] };
const HAND_EAR_L = { lArm: [62, 72, 0], lFore: [150, 0], lHand: [-10, 0, 0] };
const HAND_EAR_R = { rArm: [62, 72, 0], rFore: [150, 0], rHand: [-10, 0, 0] };
const SHRUG = { lClav: [18, 0], rClav: [18, 0], lArm: [22, 55, 0], rArm: [22, 55, 0], lFore: [75, -70], rFore: [75, -70] };
const LOOK_UP = { head: [-34, 0, 0], neck: [-14, 0, 0], chest: [-8, 0, 0] };
const LEVEL = { head: [0, 0, 0], neck: [0, 0, 0], chest: [0, 0, 0], spine: [0, 0, 0] };
const HIPS_HANDS = { lIK: [0.19, 0.97, -0.01, 1], rIK: [-0.19, 0.97, -0.01, 1] };
const p = (...o) => Object.assign({}, ...o);

export const DEFAULT_VIGNETTE = {
  props: ['recorder'],
  keys: [[0, p(REC_MOUTH)], [4, { head: [5, 20, 6] }], [8, { head: [-5, -15, -4] }], [12, { head: [0, 0, 0] }]],
};

export const VIGNETTES = {
  // ------------------------------------------------------------------ THE ATRIUM
  // 01 Hello, Atrium: recording herself, giddy; gazing up at the beating heart; "ten minutes, just a look"
  '01': {
    props: ['recorder'], dist: 3.4, view: 18,
    keys: [
      [0, { rArm: [12, 60, 0], rFore: [45, 0] }],
      [0.5, { hips: [null, 0.97], head: [-6, 0, 0] }],
      [0.8, { hips: [null, 0.93] }],
      [1.1, { hips: [null, 0.97] }],
      [1.4, { hips: [null, 0.95] }],
      [2.2, p(REC_MOUTH, { head: [6, 0, 0] })],
      [2.9, { rHand: [16, 0, 0] }],
      [3.2, { rHand: [0, 0, 0] }],
      [4.4, { chest: [-6, 0, 0], head: [-6, 0, 0], lIK: [0.19, 0.97, -0.01, 1] }],
      [7.2, {}],
      [8.6, { head: [-8, 42, 4], chest: [-6, 12, 0] }],
      [10.6, { head: [-10, -40, -4], chest: [-6, -12, 0] }],
      [12.2, { head: [0, 0, 0], chest: [0, 0, 0] }],
      [13.2, { rClav: [12, 0], lClav: [12, 0], lIK: [null, null, null, 0], lArm: [20, 60, 0], lFore: [60, 0] }],
      [13.7, { hips: [null, 0.99], lFoot: [null, 0.12, null, null, -28], rFoot: [null, 0.12, null, null, -28] }],
      [14.6, { hips: [null, 0.95], lFoot: [null, 0.075, null, null, 0], rFoot: [null, 0.075, null, null, 0], rClav: [0, 0], lClav: [0, 0] }],
      [16.3, p(LOOK_UP, { rArm: [30, 10, 0], rFore: [105, 0] })],
      [17.6, { lArm: [150, 25, 0], lFore: [8, 0], head: [-40, 8, 0] }],
      [19.4, { lArm: [140, 30, 0] }],
      [20.0, { at: [0, 0, 0, -20] }],
      [22.6, { at: [0.9, 0, 0.5, 40], lArm: [8, 80, 0], lFore: [14, 0], head: [-36, 10, 0] }],
      [23.6, { at: [0.9, 0, 0.5, 30], head: [-18, 0, 16], neck: [-6, 0, 0] }],
      [24.4, { lArm: [78, 62, 0], lFore: [128, 0], lHand: [-12, 0, 0] }],
      [26.6, { lArm: [72, 92, 0], lFore: [18, 0], lHand: [0, 0, 0], rArm: [72, 82, 0], rFore: [24, 0], chest: [-10, 0, 0], head: [-30, 0, 0] }],
      [29.8, {}],
      [31.6, p(REC_MOUTH, { lArm: [10, 70, 0], lFore: [20, 0], chest: [12, 0, 0], head: [12, 0, 0], neck: [0, 0, 0] })],
      [32.0, { head: [10, 16, 0] }],
      [32.4, { head: [10, -16, 0] }],
      [32.8, { head: [10, 10, 0] }],
      [33.4, { head: [0, 0, 0], chest: [0, 0, 0] }],
      [34.8, { lArm: [46, 28, 0], lFore: [104, 0], lHand: [0, 75, 0], head: [26, 14, 0], rArm: [20, 30, 0], rFore: [70, 0] }],
      [36.0, { head: [22, 14, 0] }],
      [36.8, { lArm: [8, 80, 0], lFore: [14, 0], lHand: [0, 0, 0], head: [-10, -6, 0], at: [0.9, 0, 0.5, 0] }],
    ],
  },

  // 02 Four Rivers: lunch, cross-legged; an ear to the warm floor; pointing out the four feeds; thinking face
  '02': {
    props: ['bar'], dist: 3.2, view: 24,
    keys: [
      [0, p(SIT_CROSS, { rArm: [30, 4, 0], rFore: [118, 0], lArm: [28, 30, 0], lFore: [40, 0], head: [6, 0, 0] })],
      [1.1, { rFore: [142, 0], head: [10, 0, 0] }],
      [1.6, { rFore: [120, 0] }],
      [2.1, { head: [4, 0, 4] }],
      [2.6, { head: [8, 0, -4] }],
      [3.8, { lArm: [62, 34, 0], lFore: [92, 0], lHand: [0, 30, 0], head: [-4, 10, 10] }],
      [5.2, { lArm: [28, 30, 0], lFore: [40, 0], lHand: [0, 0, 0], head: [10, 0, 0] }],
      [6.2, { props: [], rArm: [10, 60, 0], rFore: [20, 0], lIK: [0.32, 0.06, 0.22, 1], rIK: [-0.32, 0.06, 0.22, 1], spine: [22, 0, 0], chest: [10, 0, 0], head: [20, 0, 0] }],
      [8.3, { hipsR: [6, 0, -10], spine: [34, 0, -22], chest: [26, 0, -16], neck: [10, 0, -24], head: [10, 22, -55], lIK: [0.0, 0.3, 0.32, 1], rIK: [-0.42, 0.05, 0.22, 1] }],
      [11.6, {}],
      [12.4, { hipsR: [-4, 0, 0], spine: [6, 0, 0], chest: [2, 0, 0], neck: [0, 0, 0], head: [0, -50, 0], ...NOIK, rArm: [82, 64, 0], rFore: [6, 0], lArm: [20, 30, 0], lFore: [40, 0] }],
      [14.4, { head: [0, 55, 0], lArm: [82, 100, 0], lFore: [6, 0], rArm: [14, 50, 0], rFore: [40, 0] }],
      [16.4, p(LOOK_UP, { rArm: [150, 12, 0], rFore: [6, 0], lArm: [14, 50, 0], lFore: [40, 0] })],
      [18.4, { head: [-10, 20, 0], neck: [0, 0, 0], rArm: [14, 50, 0], rFore: [40, 0], lArm: [96, 34, 0], lFore: [8, 0] }],
      [19.8, { lArm: [148, 24, 0], head: [-30, 12, 0] }],
      [20.6, { lArm: [92, 92, 0], lFore: [10, 0], rArm: [92, 92, 0], rFore: [10, 0], head: [-12, 0, 0] }],
      [22.8, { lArm: [118, -8, 0], lFore: [32, 0], rArm: [118, -8, 0], rFore: [32, 0], head: [-32, 0, 0], chest: [-8, 0, 0] }],
      [24.4, { lArm: [28, 30, 0], lFore: [40, 0], rArm: [28, 30, 0], rFore: [40, 0], head: [6, 0, 0], chest: [4, 0, 0] }],
      [26.6, { rArm: [36, -6, 0], rFore: [142, 0], rHand: [-10, 0, 0], lArm: [30, -34, 0], lFore: [92, 0], head: [4, 12, 12] }],
      [27.2, { rHand: [-26, 0, 0] }],
      [27.6, { rHand: [-10, 0, 0] }],
      [28.0, { rHand: [-26, 0, 0] }],
      [28.4, { rHand: [-10, 0, 0] }],
      [29.8, { lClav: [12, 0], rClav: [12, 0], head: [-6, -10, -8] }],
      [30.4, { lClav: [0, 0], rClav: [0, 0] }],
    ],
  },

  // 03 Borrowed Light: the probe on the glass pipe; every light blinks (flinch, look round); "oops"; "but it worked!"
  '03': {
    props: ['probe'], dist: 3.4, view: 34, height: 2.9, set: { pipe: [0.55, 0, 0.36, 0] },
    keys: [
      [0, { lArm: [22, 168, 0], rArm: [22, 168, 0], lFore: [70, 0], rFore: [70, 0], head: [12, 30, 0] }],
      [1.6, { head: [-4, 10, 0], hips: [0, 0.95, -0.02] }],
      [2.6, { hips: [0, 0.95, 0.02], head: [8, -10, 0] }],
      [3.6, { hips: [0, 0.95, 0] }],
      [4.4, { at: [0, 0, 0, 56], head: [-14, 0, 0], lArm: [7, 80, 0], lFore: [20, 0] }],
      [5.6, { rIK: [-0.02, 1.42, 0.5, 1], lIK: [0.08, 1.18, 0.52, 1], head: [-20, 0, 0] }],
      [8.2, { lIK: [null, null, null, 0], lArm: [52, 32, 0], lFore: [102, 0], lHand: [0, 20, 0], head: [0, 40, 0] }],
      [10.0, {}],
      [11.0, { at: [-0.2, 0, -0.3, 56], rIK: [null, null, null, 0], lArm: [62, 40, 0], lFore: [124, 0], rArm: [62, 40, 0], rFore: [124, 0], lClav: [20, 0], rClav: [20, 0], head: [-30, 0, 0], hips: [0, 0.9, 0] }],
      [13.2, { head: [-30, 42, 0], lClav: [8, 0], rClav: [8, 0], hips: [0, 0.94, 0] }],
      [14.8, { head: [-30, -40, 0] }],
      [16.2, { at: [-0.2, 0, -0.3, 20], head: [0, -60, 0], chest: [0, -20, 0], lArm: [12, 70, 0], lFore: [30, 0], rArm: [12, 70, 0], rFore: [30, 0] }],
      [20.6, { rArm: [38, 40, 0], rFore: [64, 0] }],
      [21.3, { rArm: [30, 46, 0], rFore: [16, 0], rHand: [-30, 0, 0] }],
      [22.2, p(HANDS_MOUTH, { head: [10, -10, 0], chest: [0, 0, 0], rHand: [0, 0, 0] })],
      [23.2, {}],
      [23.6, { rArm: [152, 30, 0], rFore: [30, 0], lArm: [40, 30, 0], lFore: [112, 0], lClav: [0, 0], rClav: [0, 0], head: [-14, 0, 0], gait: 0, hips: [0, 1.04, 0] }],
      [23.95, { hips: [0, 0.92, 0], rArm: [44, 20, 0], rFore: [132, 0] }],
      [24.3, { hips: [0, 0.95, 0], gait: 1 }],
      [26.2, { rArm: [90, 20, 0], rFore: [10, 0], lArm: [12, 70, 0], lFore: [30, 0], head: [-6, 0, 0], at: [-0.2, 0, -0.3, 0] }],
      [27.8, { rArm: [90, 100, 0], head: [-6, -40, 0] }],
      [28.4, p(HANDS_MOUTH, { lArm: [36, -14, 0], rArm: [36, -14, 0], lFore: [152, 0], rFore: [152, 0], head: [0, 0, 0] })],
      [28.9, { hips: [0, 0.97, 0], head: [0, 10, 0] }],
      [29.3, { hips: [0, 0.94, 0], head: [0, -10, 0] }],
      [29.8, { hips: [0, 0.95, 0], head: [0, 0, 0] }],
    ],
  },

  // ------------------------------------------------------------------ SOLAR (the pit and its buried network)
  // 04 Under the Sand: kneeling, brushing sand off a glassy conduit; following it on her knees with her fingers
  '04': {
    props: ['brush'], dist: 3.4, view: 30, set: { conduit: [0.6, 0, 0.4, 0], tripod: [-1.5, 0, -0.7, 30] },
    keys: [
      [0, p(KNEEL, { spine: [22, 0, 0], head: [26, 0, 0], rIK: [-0.06, 0.16, 0.42, 1], lIK: [0.16, 0.5, 0.3, 1] })],
      [0.7, { rIK: [0.12, 0.16, 0.42, 1] }],
      [1.4, { rIK: [-0.08, 0.16, 0.42, 1], ...{ lIK: [null, null, null, 0] }, ...HAND_EAR_L, head: [4, 24, 12], spine: [10, 0, 0] }],
      [4.6, {}],
      [5.6, { lIK: [0.16, 0.5, 0.3, 1], lArm: [7, 80, 0], lFore: [12, 0], lHand: [0, 0, 0], head: [26, 0, 0], spine: [24, 0, 0] }],
      [6.3, { rIK: [0.12, 0.16, 0.42, 1] }],
      [6.9, { rIK: [-0.08, 0.16, 0.42, 1] }],
      [7.5, { rIK: [0.12, 0.16, 0.42, 1] }],
      [8.1, { rIK: [-0.08, 0.16, 0.42, 1] }],
      [8.7, { rIK: [0.14, 0.16, 0.42, 1] }],
      [9.3, { rIK: [-0.06, 0.16, 0.42, 1] }],
      [9.9, { rIK: [0.12, 0.16, 0.42, 1] }],
      [10.5, { rIK: [-0.08, 0.16, 0.42, 1] }],
      [11.1, { rIK: [0.1, 0.16, 0.42, 1] }],
      [12.4, { rIK: [null, null, null, 0], rArm: [20, 40, 0], rFore: [60, 0], lIK: [null, null, null, 0], lArm: [62, 20, 0], lFore: [84, 0], spine: [6, 0, 0], head: [6, 26, 0] }],
      [14.2, {}],
      [15.2, { props: [], rArm: [7, 80, 0], rFore: [12, 0], lArm: [7, 80, 0], lFore: [12, 0], lIK: [0.18, 0.15, 0.42, 1], spine: [26, 0, 0], head: [30, 20, 0] }],
      [16.0, { gait: 0 }],
      [20.6, { at: [0.95, 0, 0, 0], lIK: [0.22, 0.15, 0.42, 1], head: [26, 30, 0] }],
      [21.4, { head: [10, 70, 0], spine: [16, 0, 0] }],
      [22.4, { head: [34, 60, 0] }],
      [23.2, { lIK: [null, null, null, 0] }],
      [24.6, p(STAND, { gait: 1, head: [16, 30, 0], lArm: [40, 40, 0], lFore: [10, 0] })],
      [26.0, { lArm: [40, 80, 0], head: [16, 60, 0] }],
      [27.4, { lArm: [7, 80, 0], lFore: [14, 0], rArm: [40, 50, 0], rFore: [10, 0], head: [16, -30, 0] }],
      [28.8, { rArm: [40, 10, 0], head: [20, -4, 0] }],
      [30.8, { rArm: [82, 92, 0], rFore: [16, 0], lArm: [82, 92, 0], lFore: [16, 0], head: [-10, 0, 0] }],
      [33.0, {}],
      [34.0, p(HIPS_HANDS, { rArm: [7, 80, 0], lArm: [7, 80, 0], lFore: [12, 0], rFore: [12, 0], head: [6, 14, 0] })],
      [34.6, { head: [6, -14, 0] }],
      [35.2, { head: [6, 12, 0] }],
      [35.8, { head: [4, 0, 0] }],
      [37.2, { lIK: [null, null, null, 0], ...HAND_EAR_L, head: [0, 20, 10], chest: [10, 0, 0] }],
      [38.6, { ...NOIK, lArm: [52, 40, 0], lFore: [96, -60], rArm: [52, 40, 0], rFore: [96, -60], lHand: [-30, 0, 0], rHand: [-30, 0, 0], head: [-4, 0, 0], chest: [0, 0, 0] }],
      [40.6, { lArm: [7, 80, 0], lFore: [12, 0], rArm: [7, 80, 0], rFore: [12, 0], lHand: [0, 0, 0], rHand: [0, 0, 0] }],
    ],
  },

  // 04b The Ring: walking up to the dormant ring; a hand held up to it; startled back when it hums; drawn in again
  '04b': {
    props: [], dist: 4.6, view: 32, height: 3.6, set: { ring: [0, 0, -2.2, 0] },
    keys: [
      [0, { at: [0, 0, 1.0, 180], head: [-6, 0, 0] }],
      [0.6, {}],
      [5.6, { at: [0, 0, -0.5, 180], head: [-14, 0, 0] }],
      [6.4, p(LOOK_UP, { lArm: [128, 40, 0], lFore: [8, 0] })],
      [8.6, { lArm: [162, 2, 0], head: [-40, 0, 0] }],
      [10.8, { lArm: [128, -36, 0], head: [-30, -10, 0] }],
      [12.4, { lArm: [7, 80, 0], lFore: [12, 0], head: [-10, 0, 0], neck: [0, 0, 0], chest: [0, 0, 0] }],
      [13.8, { at: [0, 0, -0.5, 140], head: [0, 20, 8], lArm: [46, 30, 0], lFore: [92, -72] }],
      [15.8, { rArm: [46, 30, 0], rFore: [92, -72], lArm: [20, 60, 0], lFore: [40, 0], head: [0, 0, -8] }],
      [18.0, p(SHRUG, { head: [-4, 10, 10] })],
      [19.4, { lClav: [0, 0], rClav: [0, 0], lArm: [7, 80, 0], rArm: [7, 80, 0], lFore: [12, 0], rFore: [12, 0] }],
      [20.4, { at: [0, 0, -0.5, 180], head: [-8, 0, 0] }],
      [21.8, { at: [0, 0, -1.25, 180] }],
      [22.8, { rArm: [96, 14, 0], rFore: [10, 0], rHand: [-62, 0, 0], head: [-12, 0, 0], chest: [6, 0, 0] }],
      [24.6, { head: [-12, 0, 10] }],
      [26.2, { head: [-30, 0, 0], neck: [-8, 0, 0] }],
      [27.4, {}],
      [27.6, { gait: 0, at: [0, 0, -1.25, 180] }],
      [28.1, { at: [0, 0, -0.45, 180], hips: [0, 0.88, 0], spine: [-10, 0, 0], chest: [-6, 0, 0], head: [-6, 0, 0], neck: [0, 0, 0], rArm: [40, -18, 0], rFore: [140, 0], rHand: [0, 0, 0], lArm: [52, 40, 0], lFore: [82, 0], lClav: [24, 0], rClav: [24, 0], breath: [2.6, 1.9] }],
      [28.6, { gait: 1, hips: [0, 0.93, 0] }],
      [30.0, { lClav: [6, 0], rClav: [6, 0], lArm: [36, -20, 0], lFore: [134, 0] }],
      [31.4, { at: [0, 0, -0.8, 180], spine: [6, 0, 0], chest: [10, 0, 0], head: [-10, 0, 14], hips: [0, 0.95, 0], breath: [1.4, 1.2] }],
      [34.6, {}],
      [35.2, { hips: [0, 0.98, 0], lFoot: [null, 0.1, null, null, -20], rFoot: [null, 0.1, null, null, -20] }],
      [35.7, { hips: [0, 0.95, 0], lFoot: [null, 0.075, null, null, 0], rFoot: [null, 0.075, null, null, 0] }],
      [36.2, { hips: [0, 0.98, 0], lFoot: [null, 0.1, null, null, -20], rFoot: [null, 0.1, null, null, -20] }],
      [36.7, { hips: [0, 0.95, 0], lFoot: [null, 0.075, null, null, 0], rFoot: [null, 0.075, null, null, 0] }],
    ],
  },

  // 05 Mirrors: stomping at attempt six; angling a hand-mirror at the sun; pushing at a great buried mirror
  '05': {
    props: ['mirror'], dist: 3.6, view: 22, set: { bigMirror: [1.65, 0, -0.55, -40] },
    keys: [
      [0, { head: [-14, 0, 0], lArm: [24, 50, 0], lFore: [40, 0] }],
      [0.35, { gait: 0, lFoot: [0.1, 0.2, 0.08, 7, 10], hips: [0, 0.97, 0], rArm: [30, 40, 0], rFore: [70, 0] }],
      [0.7, { lFoot: [0.1, 0.075, 0.05, 7, 0], hips: [0, 0.92, 0], rArm: [14, 50, 0], rFore: [40, 0] }],
      [1.1, { hips: [0, 0.95, 0], gait: 1, head: [-24, 0, 0], chest: [-8, 0, 0] }],
      [2.4, { head: [0, 20, 0], chest: [0, 0, 0], rArm: [48, 24, 0], rFore: [92, -64] }],
      [4.6, { rArm: [58, 10, 0], rFore: [16, 0], head: [10, 0, 0] }],
      [6.4, { rArm: [7, 80, 0], rFore: [12, 0], head: [0, 0, 0] }],
      [7.2, { props: ['mirror', 'mirrorBeam'], lArm: [104, 42, 0], lFore: [62, 0], lHand: [0, 0, 0], head: [-22, 28, 0], rArm: [72, -8, 0], rFore: [140, 0], rHand: [-40, 0, 0] }],
      [8.6, { lHand: [10, 12, 0] }],
      [9.8, { lHand: [-8, -10, 0], at: [0.3, 0, 0, 10] }],
      [11.0, { lHand: [14, 4, 0] }],
      [12.2, { lHand: [-4, 16, 0] }],
      [13.8, { props: ['mirror'], lArm: [10, 70, 0], lFore: [22, 0], rArm: [7, 80, 0], rFore: [12, 0], rHand: [0, 0, 0], head: [22, 0, 0], chest: [12, 0, 0], lClav: [-4, 8], rClav: [-4, 8] }],
      [16.0, { head: [22, 12, 0] }],
      [16.6, { head: [22, -12, 0] }],
      [17.2, { head: [18, 0, 0], chest: [4, 0, 0], lClav: [0, 0], rClav: [0, 0] }],
      [19.4, { at: [0.3, 0, 0, 100], head: [0, 0, 0], chest: [0, 0, 0], rArm: [84, 30, 0], rFore: [8, 0] }],
      [21.0, { rArm: [7, 80, 0], rFore: [12, 0] }],
      [23.6, { at: [0.95, 0, -0.3, 108] }],
      [24.8, { lIK: [0.36, 1.05, 0.58, 1], rIK: [-0.36, 1.05, 0.58, 1], head: [-6, 0, 0] }],
      [25.6, { hips: [0, 0.92, -0.08], spine: [14, 0, 0], lFoot: [0.1, 0.075, -0.05, 7, 0], rFoot: [-0.12, 0.09, -0.32, -7, -30] }],
      [26.4, { hips: [0, 0.92, -0.04] }],
      [27.0, { hips: [0, 0.92, -0.1] }],
      [28.0, { ...NOIK, at: [0.95, 0, -0.3, 200], hips: [0, 0.95, 0], spine: [0, 0, 0], lFoot: [0.1, 0.075, 0.03, 7, 0], rFoot: [-0.1, 0.075, -0.02, -7, 0], head: [0, 0, 8], rArm: [44, 40, 0], rFore: [80, -60] }],
      [29.0, { rArm: [30, 60, 0], rFore: [40, -60], head: [4, 0, -8] }],
      [30.4, { head: [6, 14, 0], rArm: [7, 80, 0], rFore: [12, 0] }],
      [31.0, { head: [6, -14, 0] }],
      [31.6, { head: [4, 0, 0] }],
      [33.4, { at: [0.95, 0, -0.3, 140], rArm: [84, 0, 0], rFore: [6, 0], head: [-4, 0, 0] }],
      [35.0, { rArm: [80, 30, 0], head: [-4, 20, 0] }],
      [36.6, { rArm: [76, 60, 0], head: [-2, 42, 0] }],
      [38.6, { rArm: [40, 30, 0], head: [24, 20, 0] }],
      [40.2, { rArm: [7, 80, 0], rFore: [12, 0], head: [6, 0, 0] }],
    ],
  },

  // 05b Full: the probe on a capacitor bank, listening; feeling sick at the number; a look over her shoulder
  '05b': {
    props: ['probe'], dist: 3.4, view: 30, set: { bank: [0.68, 0, 0.42, 0] },
    keys: [
      [0, { at: [0, 0, 0, 58], rIK: [0, 1.0, 0.44, 1], ...HAND_EAR_L, spine: [8, 0, 0], head: [8, 0, 18] }],
      [4.4, { head: [10, 0, 22] }],
      [6.0, {}],
      [7.2, { rIK: [null, null, null, 0], ...REC_CHEST, lArm: [7, 80, 0], lFore: [12, 0], lHand: [0, 0, 0], spine: [0, 0, 0], head: [0, 50, 0] }],
      [8.8, { head: [0, -50, 0] }],
      [10.2, { head: [4, 0, 0] }],
      [11.4, { at: [-0.25, 0, -0.32, 58], lIK: [0.03, 1.02, 0.15, 1], head: [22, 0, 0], chest: [12, 0, 0] }],
      [14.6, { at: [-0.25, 0, -0.32, 20], breath: [2, 1.5] }],
      [17.4, { lIK: [null, null, null, 0], lArm: [40, 46, 0], lFore: [80, -70], rArm: [36, 40, 0], rFore: [86, -50], head: [-10, 30, 0], chest: [0, 0, 0] }],
      [19.0, { head: [-10, -30, 0] }],
      [20.4, p(HUG, { head: [10, 0, 0] })],
      [22.9, { ...HAND_EAR_R, rClav: [6, 0], head: [0, -10, 12] }],
      [25.4, { rArm: [38, -40, 0], rFore: [112, 0], rHand: [0, 0, 0], head: [6, 0, -6] }],
      [27.0, { head: [0, -82, 0], chest: [0, -26, 0], at: [-0.25, 0, -0.32, 10] }],
      [28.4, {}],
      [29.2, { head: [-10, -40, 0], chest: [0, -10, 0] }],
      [30.6, { at: [-0.45, 0, -0.75, 10], head: [-16, 30, 0], chest: [0, 6, 0] }],
      [32.2, { head: [-30, 0, 0], chest: [-4, 0, 0], shiver: 0.5 }],
    ],
  },

  // 06 Here We Go: scribbling furiously in her notebook; the probe raised to the humming ring; trembling; the countdown
  '06': {
    props: ['notebook', 'pencil'], dist: 4.6, view: 40, height: 3.6, set: { ring: [0, 0, -2.4, 0] },
    keys: [
      [0, { lArm: [36, 16, 0], lFore: [102, 70], lHand: [0, 0, 20], rArm: [40, -4, 0], rFore: [112, 0], head: [26, 0, 0], at: [0, 0, 0.3, 160] }],
      ...Array.from({ length: 12 }, (_, i) => [0.4 + i * 0.25, { rHand: [i % 2 ? 14 : -6, i % 3 ? 8 : -6, 0] }]),
      [3.6, { head: [-12, 20, 0], rHand: [0, 0, 0] }],
      [5.0, { head: [26, 0, 0] }],
      ...Array.from({ length: 16 }, (_, i) => [5.3 + i * 0.3, { rHand: [i % 2 ? 16 : -8, i % 3 ? 6 : -8, 0] }]),
      [10.8, { lHand: [0, 30, 20], rHand: [0, 0, 0] }],
      [11.4, { lHand: [0, 0, 20] }],
      ...Array.from({ length: 10 }, (_, i) => [11.8 + i * 0.22, { rHand: [i % 2 ? 18 : -10, 0, 0] }]),
      [14.4, { rFore: [100, 0], rHand: [20, 0, 0] }],
      [14.8, { rFore: [112, 0], rHand: [0, 0, 0] }],
      [15.2, { rFore: [100, 0], rHand: [20, 0, 0] }],
      [15.6, { rFore: [112, 0], rHand: [0, 0, 0] }],
      [18.9, { lArm: [7, 80, 0], lFore: [12, 0], lHand: [0, 0, 0], lIK: [-0.16, 0.98, 0.04, 1], head: [16, -20, 0] }],
      [19.6, { props: ['probe'], rArm: [20, 30, 0], rFore: [60, 0] }],
      [20.4, { lIK: [null, null, null, 0], head: [0, 0, 0] }],
      [21.2, { at: [0, 0, 0.3, 180], rArm: [96, 6, 0], rFore: [10, 0], lIK: [-0.08, 1.3, 0.42, 0.8], head: [-10, 0, 0] }],
      [22.6, { at: [0, 0, -0.2, 180] }],
      [23.8, { shiver: 1.2, rArm: [62, 10, 0], rFore: [60, 0], lIK: [null, null, null, 0], lArm: [30, 20, 0], lFore: [60, 0], head: [18, -18, 0] }],
      [26.6, { lIK: [0.05, 1.26, 0.15, 1], head: [-6, 0, 0], breath: [2.6, 1.6], shiver: 0.7 }],
      [29.8, { at: [0, 0, -0.2, 140], head: [0, 30, 8] }],
      [31.0, { head: [0, 18, -8], chest: [6, 0, 0] }],
      [32.6, { head: [10, 30, 6], chest: [0, 0, 0] }],
      [34.2, { head: [26, 10, 0], lIK: [null, null, null, 0], lArm: [7, 80, 0], lFore: [12, 0] }],
      [37.0, { at: [0, 0, -0.2, 180], head: [-4, 0, 0], lFoot: [0.16, 0.075, 0.14, 12, 0], rFoot: [-0.16, 0.075, -0.16, -12, 0], rArm: [102, 2, 0], rFore: [4, 0], lIK: [-0.06, 1.32, 0.5, 1], shiver: 0.6, breath: [2.4, 1.0] }],
      [39.4, { hips: [0, 0.93, 0] }],
    ],
  },

  // ------------------------------------------------------------------ VERDANT
  // 07 No Birds: wandering in the rain, a palm up; mum's tomatoes; a hand cupped to the silence; hugging herself
  '07': {
    props: [], dist: 3.6, view: 24,
    keys: [
      [0, { at: [-1.2, 0, -0.2, 70], lArm: [50, 42, 0], lFore: [40, -80], head: [-30, 20, 0] }],
      [0.4, {}],
      [5.0, { at: [0.3, 0, 0.2, 70] }],
      [7.4, { at: [0.3, 0, 0.2, 190], lArm: [46, 60, 0], rArm: [46, 60, 0], lFore: [30, -80], rFore: [30, -80], head: [-36, 0, 0] }],
      [8.2, p(HANDS_MOUTH, { lArm: [38, -10, 0], rArm: [38, -10, 0], lFore: [150, 0], rFore: [150, 0], lClav: [10, 0], rClav: [10, 0], head: [-4, 0, 6] })],
      [9.6, p(BENT, { hipsR: [30, 0, 0], hips: [0, 0.86, 0.02], head: [-4, 0, 14], lArm: [52, -18, 0], lFore: [88, -40], rArm: [52, -18, 0], rFore: [88, -40], lClav: [0, 0], rClav: [0, 0] })],
      [11.0, { head: [-4, 0, -10] }],
      [12.2, { head: [-2, 6, 14] }],
      [13.4, p(STAND, ARMS, HAND_EAR_R, { head: [0, 40, 0] })],
      [16.0, { head: [0, -40, 0] }],
      [18.2, { head: [0, 0, 0] }],
      [19.4, { rArm: [40, 20, 0], rFore: [100, -70], lArm: [40, 20, 0], lFore: [100, -70], rHand: [0, 0, 0], head: [28, 0, 0] }],
      [21.6, {}],
      [22.4, { at: [0.3, 0, 0.2, 120], lArm: [7, 80, 0], rArm: [7, 80, 0], lFore: [12, 0], rFore: [12, 0], head: [10, 0, 0], swing: 0.4 }],
      [24.8, { at: [1.0, 0, -0.1, 120] }],
      [25.6, p(HUG, { at: [1.0, 0, -0.1, 160], head: [18, 0, 10] })],
      [27.6, { lClav: [22, 6], rClav: [22, 6] }],
      [28.2, { lClav: [10, 6], rClav: [10, 6], head: [22, 0, 6] }],
    ],
  },

  // 08 Roots: peering down; reaching for the jacket, the trainer; lifting a bus pass; backing away
  '08': {
    props: [], dist: 3.4, view: 30,
    keys: [
      [0, p(BENT, { hipsR: [16, 0, 0], hips: [0, 0.9, 0.02], spine: [20, 0, 0], head: [34, 0, 0], lIK: [0.12, 0.54, 0.2, 1] })],
      [3.4, { rArm: [40, -20, 0], rFore: [140, 0] }],
      [6.0, p(CROUCH, { head: [10, 0, 0], rArm: [7, 80, 0], rFore: [12, 0], lIK: [null, null, null, 0] })],
      [7.0, { rIK: [-0.04, 0.12, 0.56, 1] }],
      [8.6, { rIK: [-0.02, 0.14, 0.58, 1] }],
      [9.4, { rIK: [-0.06, 0.11, 0.55, 1] }],
      [10.4, { rIK: [null, null, null, 0], rArm: [30, -10, 0], rFore: [120, 0] }],
      [13.6, { lIK: [0.06, 0.08, 0.46, 1], rArm: [7, 80, 0], rFore: [20, 0] }],
      [14.2, { props: ['pass'] }],
      [15.4, { lIK: [null, null, null, 0], lArm: [46, 12, 0], lFore: [122, 0], head: [14, 0, 0] }],
      [16.6, {}],
      [19.0, p(STAND, { head: [22, 0, 0] })],
      [19.8, { at: [0, 0, -0.45, 0], rArm: [40, -20, 0], rFore: [146, 0] }],
      [20.8, { head: [18, 14, 0] }],
      [21.4, { head: [18, -14, 0] }],
      [22.0, { head: [18, 10, 0] }],
      [23.2, { head: [0, 70, 0], chest: [0, 14, 0], at: [0, 0, -0.45, 20] }],
      [24.8, { head: [0, -70, 0], chest: [0, -14, 0], at: [0, 0, -0.45, -20] }],
      [26.2, { head: [20, 0, 0], chest: [0, 0, 0], at: [0, 0, -0.45, 0], rArm: [7, 80, 0], rFore: [12, 0] }],
      [28.9, { lArm: [16, 50, 0], lFore: [50, 0], head: [26, 0, 0], lClav: [-6, 8], rClav: [-6, 8], breath: [2, 1.5] }],
    ],
  },

  // 09 Something Follows: whispering into the recorder behind a crate; a look behind her; then she runs and leaps
  '09': {
    props: ['recorder'], dist: 3.6, view: 14, set: { crate: [0, 0, 0.52, 0] },
    keys: [
      [0, p(CROUCH, REC_MOUTH, { rArm: [30, 10, 0], rFore: [134, 0], lIK: [0.16, 0.47, 0.34, 1], head: [-6, 0, 0] })],
      [2.6, { hips: [0, 0.72, -0.06], head: [-14, 0, 0], spine: [6, 0, 0] }],
      [5.4, { hips: [0, 0.56, -0.1], head: [-30, 0, 0], spine: [12, 0, 0] }],
      [7.8, {}],
      [8.15, { chest: [0, -42, 0], head: [-10, -78, 0], neck: [0, -10, 0] }],
      [10.2, {}],
      [12.6, { chest: [6, 0, 0], head: [-30, 0, 0], neck: [0, 0, 0] }],
      [15.0, { lIK: [null, null, null, 0], lArm: [52, -14, 0], lFore: [146, 0], head: [-14, 0, 0] }],
      [17.8, { lArm: [12, 70, 0], lFore: [20, 0], head: [-46, 0, 0], neck: [-10, 0, 0] }],
      [21.4, { at: [0, 0, 0, 90], hips: [0, 0.62, 0], hipsR: [34, 0, 0], spine: [10, 0, 0], neck: [0, 0, 0], head: [-30, 0, 0], lFoot: [0.1, 0.075, 0.32, 0, 0], rFoot: [-0.1, 0.13, -0.32, 0, -42], knees: [8, 8], rArm: [20, 40, 0], rFore: [60, 0], lArm: [30, 30, 0], lFore: [60, 0] }],
      [25.0, {}],
      [25.3, { head: [-16, 0, 0] }],
      [25.7, { head: [-30, 0, 0] }],
      [26.4, { head: [-16, 0, 0] }],
      [26.8, { head: [-24, 0, 0] }],
      [27.0, p(STAND, { hips: [0, 0.9, 0], hipsR: [12, 0, 0], head: [-6, 0, 0], at: [0.2, 0, 0, 90], lArm: [7, 80, 0], rArm: [7, 80, 0], lFore: [40, 0], rFore: [40, 0] })],
      [27.75, { at: [2.4, 0, 0, 90] }],
      [27.8, { gait: 0, hips: [0, 0.95, 0], lFoot: [0.08, 0.3, 0.28, 0, 10], rFoot: [-0.08, 0.2, -0.35, 0, -30], lArm: [110, 30, 0], rArm: [80, 30, 0] }],
      [28.15, { at: [3.3, 0, 0, 90], hips: [0, 1.4, 0], lFoot: [0.08, 0.6, 0.4, 0, 20], rFoot: [-0.08, 0.5, -0.35, 0, -40], lArm: [140, 20, 0], rArm: [120, 20, 0], lFore: [20, 0], rFore: [20, 0] }],
      [28.6, { at: [4.0, 0, 0, 90], hips: [0, 0.7, 0], lFoot: [0.1, 0.075, 0.3, 0, 0], rFoot: [-0.1, 0.12, -0.25, 0, -20], hipsR: [24, 0, 0], lArm: [40, 50, 0], rArm: [40, 50, 0] }],
    ],
  },

  // ------------------------------------------------------------------ AZURE
  // 10 The Last Engine: shivering, stamping; hands on the rail over the sea; following the pipes up; counting
  //    off heat, light, life, water; fishing a granola bar out of her satchel
  '10': {
    props: [], dist: 3.6, view: 20, set: { rail: [0, 0, 0.62, 0] },
    keys: [
      [0, p(HUG, { shiver: 1.2, gait: 0 })],
      [0.6, { lFoot: [0.1, 0.16, 0.06, 7, 0] }],
      [1.0, { lFoot: [0.1, 0.075, 0.03, 7, 0] }],
      [1.4, { rFoot: [-0.1, 0.16, 0.0, -7, 0] }],
      [1.8, { rFoot: [-0.1, 0.075, -0.02, -7, 0], chest: [8, 0, 0] }],
      [2.3, { lFoot: [0.1, 0.16, 0.06, 7, 0], chest: [0, 0, 0] }],
      [2.7, { lFoot: [0.1, 0.075, 0.03, 7, 0] }],
      [3.1, { rFoot: [-0.1, 0.16, 0.0, -7, 0] }],
      [3.5, { rFoot: [-0.1, 0.075, -0.02, -7, 0], gait: 1 }],
      [6.2, { lClav: [0, 0], rClav: [0, 0], shiver: 0.4 }],
      [7.6, { at: [0, 0, 0.26, 0], lIK: [0.26, 1.05, 0.34, 1], rIK: [-0.26, 1.05, 0.34, 1], spine: [14, 0, 0], head: [28, 0, 0] }],
      [9.8, { spine: [4, 0, 0], head: [-30, 0, 0], neck: [-6, 0, 0] }],
      [12.6, { at: [0, 0, 0, 0], ...NOIK, spine: [0, 0, 0], neck: [0, 0, 0], head: [20, 10, 0], lArm: [7, 80, 0], lFore: [12, 0], rArm: [40, 30, 0], rFore: [10, 0], lClav: [0, 0], rClav: [0, 0] }],
      [16.6, { rArm: [160, 12, 0], head: [-42, 0, 0], chest: [-8, 0, 0] }],
      [18.4, { rArm: [40, -12, 0], rFore: [112, 0], lArm: [46, 12, 0], lFore: [110, -40], head: [16, 0, 0], chest: [0, 0, 0] }],
      [18.8, { rHand: [24, 0, 0], head: [20, 0, 0] }],
      [19.2, { rHand: [0, 0, 0], head: [16, 0, 0] }],
      [19.6, { rHand: [24, 0, 0], head: [20, 0, 0] }],
      [20.0, { rHand: [0, 0, 0], head: [16, 0, 0] }],
      [20.4, { rHand: [24, 0, 0], head: [20, 0, 0] }],
      [20.8, { rHand: [0, 0, 0], head: [16, 0, 0] }],
      [21.2, { rHand: [24, 0, 0], head: [20, 0, 0] }],
      [21.6, { rHand: [0, 0, 0] }],
      [23.0, { rArm: [7, 80, 0], rFore: [12, 0], lArm: [7, 80, 0], lFore: [12, 0], head: [-6, 0, 0] }],
      [26.6, {}],
      [27.4, p(HUG, { shiver: 1.0, head: [6, 0, 0] })],
      [29.8, { lArm: [7, 80, 0], lFore: [12, 0], rArm: [7, 80, 0], rFore: [12, 0], lClav: [0, 0], rClav: [0, 0], rIK: [-0.24, 0.98, -0.04, 1], head: [24, -30, 0], shiver: 0.3 }],
      [30.8, { props: ['bar'], rIK: [null, null, null, 0], rArm: [40, 14, 0], rFore: [112, 0], head: [22, -6, 0] }],
      [32.2, { lClav: [-6, 8], rClav: [-6, 8], chest: [8, 0, 0], rArm: [26, 20, 0], rFore: [80, 0] }],
    ],
  },

  // 11 Ten Minutes: slumped against a crate, knees up; a hand over her eyes; looking at the recorder; head on knees
  '11': {
    props: ['recorder'], dist: 3.2, view: 24, set: { crate: [0, 0, -0.62, 0] },
    keys: [
      [0, p(SIT, { hipsR: [-24, 0, 0], head: [-24, 0, 0], neck: [-6, 0, 0], lArm: [54, -4, 0], lFore: [50, 0], rArm: [54, -4, 0], rFore: [62, 0] })],
      [3.2, { head: [-16, 20, 6] }],
      [5.2, { head: [-20, -6, 0] }],
      [6.8, { spine: [24, 0, 0], head: [18, 0, 0], neck: [0, 0, 0], lArm: [52, -16, 0], lFore: [150, 0], lHand: [-10, 0, 0] }],
      [9.2, {}],
      [9.8, { lArm: [48, 20, 0], lFore: [92, -62], lHand: [0, 0, 0], head: [6, 10, 0] }],
      [11.4, { lArm: [50, 10, 0], lFore: [70, -62] }],
      [12.4, { lArm: [54, -4, 0], lFore: [50, 0], spine: [12, 0, 0] }],
      [13.6, { rArm: [46, 0, 0], rFore: [112, 0], head: [24, -10, 0] }],
      [17.0, { rHand: [10, 0, 0] }],
      [18.0, { rHand: [0, 0, 0] }],
      [20.2, { head: [-28, 0, 0], neck: [-6, 0, 0], spine: [6, 0, 0], rArm: [54, -4, 0], rFore: [62, 0] }],
      [20.8, { head: [-28, 14, 0] }],
      [21.3, { head: [-28, -14, 0] }],
      [21.8, { head: [-26, 0, 0] }],
      [22.8, { lFoot: [0.14, 0.075, 0.26, 12, 18], rFoot: [-0.14, 0.075, 0.26, -12, 18], lArm: [62, -16, 0], lFore: [92, 0], rArm: [62, -16, 0], rFore: [96, 0], spine: [28, 0, 0], chest: [18, 0, 0], neck: [10, 0, 0], head: [40, 0, 0], breath: [1.5, 0.8] }],
    ],
  },

  // 12 Anomaly: panting, hands on knees, headlamp on; a hand on the wall of records, tracing the entry; "that's me"
  '12': {
    props: ['lamp', 'lampBeam'], dist: 3.4, view: 68, set: { panel: [0, 0, -0.95, 0] },
    keys: [
      [0, p(BENT, { lIK: [0.13, 0.53, 0.22, 1], rIK: [-0.13, 0.53, 0.22, 1], breath: [3.6, 2.6], head: [-12, 0, 0] })],
      [3.0, { head: [26, 0, 0] }],
      [5.8, {}],
      [7.2, p(STAND, NOIK, { breath: [1.6, 1.3], head: [-10, 0, 0] })],
      [8.2, { at: [0, 0, 0, 180] }],
      [9.4, { at: [0, 0, -0.32, 180], rIK: [-0.12, 1.42, 0.46, 1], head: [-6, 0, 0] }],
      [11.8, { rIK: [-0.28, 1.5, 0.48, 1], head: [-8, -16, 0] }],
      [14.4, { rIK: [0.22, 1.5, 0.48, 1], head: [-8, 14, 0] }],
      [15.2, { rIK: [-0.26, 1.4, 0.48, 1], head: [-4, -14, 0] }],
      [17.4, { at: [0.35, 0, -0.32, 180], rIK: [0.16, 1.4, 0.48, 1], head: [-4, 10, 0] }],
      [18.9, { head: [-2, 4, 0] }],
      [20.4, { lArm: [42, -24, 0], lFore: [140, 0] }],
      [26.0, {}],
      [27.4, { rIK: [null, null, null, 0], at: [0.35, 0, 0.05, 180], lArm: [7, 80, 0], lFore: [12, 0] }],
      [28.8, { at: [0.35, 0, 0.05, 150], rIK: [-0.02, 1.25, 0.15, 1], head: [24, 0, 0], chest: [8, 0, 0] }],
      [31.2, { hips: [0, 0.91, 0], spine: [8, 0, 0], breath: [2.2, 1.6] }],
    ],
  },

  // 13 The Catalogue: swiping through the index; three names touched on the screen; turning away; sliding
  //    down to sit, head in her hands
  '13': {
    props: [], dist: 3.4, view: 62, set: { terminal: [0, 0, -0.62, 0] },
    keys: [
      [0, { at: [0, 0, 0, 180], head: [14, 0, 0], rIK: [-0.1, 1.2, 0.44, 1] }],
      [1.5, { rIK: [0.12, 1.2, 0.44, 1] }],
      [2.1, { rIK: [-0.1, 1.2, 0.44, 1] }],
      [3.4, { rIK: [0.12, 1.2, 0.44, 1] }],
      [4.0, { rIK: [-0.1, 1.2, 0.44, 1] }],
      [5.4, { spine: [10, 0, 0], head: [18, 0, 0] }],
      [6.6, { rIK: [0.12, 1.2, 0.44, 1] }],
      [7.2, { rIK: [-0.1, 1.2, 0.44, 1] }],
      [9.8, { at: [0, 0, 0.12, 180], spine: [0, 0, 0], rIK: [null, null, null, 0], lArm: [42, -24, 0], lFore: [142, 0] }],
      [12.0, { at: [0, 0, 0, 180], lArm: [7, 80, 0], lFore: [12, 0], rIK: [0.1, 1.2, 0.44, 1] }],
      [13.4, { rIK: [-0.12, 1.2, 0.44, 1] }],
      [16.8, { rIK: [0.02, 1.24, 0.42, 1], head: [12, 0, 8], shiver: 0.5 }],
      [17.3, { rIK: [0.02, 1.24, 0.47, 1] }],
      [17.7, { rIK: [0.02, 1.2, 0.42, 1] }],
      [18.4, { rIK: [-0.08, 1.2, 0.47, 1] }],
      [18.8, { rIK: [-0.08, 1.16, 0.42, 1] }],
      [19.4, { rIK: [0.1, 1.16, 0.47, 1] }],
      [19.9, { rIK: [0.1, 1.14, 0.4, 1] }],
      [21.0, { rIK: [null, null, null, 0], at: [0, 0, 0, 100], shiver: 0 }],
      [22.6, p(HUG, { at: [0.45, 0, 0.1, 100], head: [14, 0, 0] })],
      [24.4, { at: [0.45, 0, 0.1, 160], head: [-4, 0, 0] }],
      [26.2, { at: [0.15, 0, -0.18, 10], lClav: [0, 0], rClav: [0, 0] }],
      [28.6, p(SIT, { at: [0.15, 0, -0.18, 0], lArm: [54, -4, 0], lFore: [50, 0], rArm: [54, -4, 0], rFore: [60, 0], head: [10, 0, 0] })],
      [30.4, { lArm: [52, -16, 0], lFore: [146, 0], rArm: [52, -16, 0], rFore: [146, 0], spine: [24, 0, 0], head: [34, 0, 0], breath: [1.6, 0.9] }],
    ],
  },

  // ------------------------------------------------------------------ THE PRISM CORE
  // 14 The Rule: wiping her eyes; looking up at the heart; a fist closing; squaring up; then down a rope into the
  //    dark shaft, with one last nervous look up
  '14': {
    props: [], dist: 3.8, view: 46, height: 2.8, set: { shaft: [0, 0, -1.0, 0], rope: [0, 0, -1.0, 0] },
    keys: [
      [0, { head: [14, 0, 0] }],
      [0.8, p(HANDS_MOUTH, { lArm: [40, -18, 0], rArm: [40, -18, 0], lFore: [152, 0], rFore: [152, 0], head: [16, 0, 0] })],
      [2.4, { head: [-10, 0, 0] }],
      [3.0, { head: [12, 0, 0] }],
      [3.8, { lArm: [7, 80, 0], rArm: [7, 80, 0], lFore: [30, 0], rFore: [30, 0], lClav: [0, 0], rClav: [0, 0], head: [0, 0, 0] }],
      [5.0, p(LOOK_UP, { head: [-32, 30, 0], lFore: [12, 0], rFore: [12, 0] })],
      [7.4, { head: [-32, -30, 0] }],
      [9.4, p(LEVEL)],
      [11.0, { rArm: [62, 12, 0], rFore: [82, 0], rHand: [-20, 0, 0] }],
      [13.0, { rHand: [40, 0, 0] }],
      [14.6, { rHand: [-50, 0, 0], rFore: [60, 0] }],
      [16.0, { rArm: [7, 80, 0], rFore: [12, 0], rHand: [0, 0, 0] }],
      [16.6, { head: [12, 0, 0] }],
      [17.0, { head: [-4, 0, 0], rIK: [0.04, 1.3, 0.13, 1] }],
      [17.8, { rIK: [0.0, 1.18, 0.14, 1] }],
      [18.6, { rIK: [null, null, null, 0], lClav: [-4, -10], rClav: [-4, -10], chest: [-8, 0, 0] }],
      [20.4, { at: [0, 0, 0, 180], lClav: [0, 0], rClav: [0, 0], chest: [0, 0, 0] }],
      [22.4, { at: [0, 0, -0.3, 180] }],
      [24.2, p(CROUCH, { spine: [26, 0, 0], head: [10, 0, 0], lIK: [0.12, 0.5, 0.26, 1] })],
      [26.8, {}],
      [27.8, p(STAND, NOIK, { rIK: [-0.03, 1.32, 0.66, 1], lIK: [0.03, 1.12, 0.66, 1], head: [-8, 0, 0] })],
      [29.4, { gait: 0, at: [0, 0, -0.95, 180], rIK: [-0.03, 1.4, 0.04, 1], lIK: [0.03, 1.16, 0.04, 1], lFoot: [0.08, 0.1, 0.06, 7, -20], rFoot: [-0.08, 0.2, 0.0, -7, -30] }],
      [30.6, { at: [0, -0.5, -0.95, 180], lIK: [0.03, 1.48, 0.04, 1] }],
      [31.6, { at: [0, -0.9, -0.95, 180], rIK: [-0.03, 1.5, 0.04, 1], head: [-44, 0, 0], neck: [-10, 0, 0] }],
      [32.6, { at: [0, -1.4, -0.95, 180], lIK: [0.03, 1.5, 0.04, 1] }],
      [34.2, { at: [0, -2.2, -0.95, 180], rIK: [-0.03, 1.5, 0.04, 1], head: [-30, 0, 0] }],
    ],
  },

  // 15 Leave It On: listening; walking toward the door of white light, a hand reaching for it; the plan counted
  //    on her fingers; the recorder held close, then tucked away, still on; she walks into the light
  '15': {
    props: ['recorder'], dist: 4.2, view: 56, height: 2.7, set: { core: [0, 0, -2.7, 0] },
    keys: [
      [0, p(REC_CHEST, { head: [0, 0, 14], at: [0, 0, 0.7, 180] })],
      [2.4, { head: [-6, 0, 0] }],
      [3.2, {}],
      [8.8, { at: [0, 0, -1.0, 180], lArm: [92, 8, 0], lFore: [10, 0], lHand: [-50, 0, 0], head: [-8, 0, 0], swing: 0.3 }],
      [10.4, {}],
      [11.6, { at: [0, 0, -1.2, 180], lArm: [7, 80, 0], lFore: [12, 0], lHand: [0, 0, 0] }],
      [13.4, { at: [0, 0, -1.2, 148], lArm: [42, 20, 0], lFore: [100, -30], head: [4, 20, 0] }],
      [14.2, { lHand: [20, 0, 0] }],
      [14.8, { lHand: [0, 0, 0] }],
      [15.4, { lHand: [20, 0, 0] }],
      [16.2, { lHand: [0, 0, 0], lArm: [7, 80, 0], lFore: [12, 0], lIK: [-0.16, 0.98, 0.08, 1], head: [16, -10, 0] }],
      [17.4, { head: [2, 20, 8] }],
      [18.4, { lIK: [null, null, null, 0] }],
      [19.6, { rArm: [30, -10, 0], rFore: [126, 0], lIK: [-0.02, 1.2, 0.2, 1], head: [26, 0, 0], breath: [0.8, 0.7] }],
      [24.6, {}],
      [25.6, p(REC_MOUTH, { lIK: [null, null, null, 0], head: [6, 0, 0] })],
      [26.2, { rHand: [14, 0, 0] }],
      [26.9, { rHand: [0, 0, 0], head: [4, 14, 0] }],
      [27.6, { rIK: [0.07, 1.3, 0.14, 1], head: [16, 0, 0] }],
      [28.4, { props: [] }],
      [28.9, { rIK: [null, null, null, 0], rArm: [7, 80, 0], rFore: [12, 0], at: [0, 0, -1.2, 180], head: [-6, 0, 0], swing: 0.6 }],
      [31.8, { at: [0, 0, -2.6, 180] }],
    ],
  },
};

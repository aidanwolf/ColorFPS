// Shared pieces for the mechanics toolkit (mechanics.js, traps.js, shotmech.js): neon edge frames,
// color-glyph decals, the hologram and countdown shaders, player-overlap tests, easing and the sounds
// (each a generated sample when it exists, with a fallback built from the existing ones or the synth).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../colors.js';
import { glyphTex } from '../materials.js';
import { audio } from '../audio.js';

export const v3 = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(...a));
export const NEUTRAL = 0x9bf6ff;
export const AMBER = 0xffa040;
// a blaster color index → its hex (null / undefined → the neutral cyan)
export const hexOf = (color) => (color === null || color === undefined ? NEUTRAL : COLORS[color].hex);
// the neon trim each zone's platforms use (builders.js GLOW), as a hex
export const zoneHex = (zone) => ({ red: COLORS[0].hex, yellow: COLORS[1].hex, green: COLORS[2].hex, blue: COLORS[3].hex })[zone] ?? 0xdfe6ff;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOutBack = (t) => {
  const c = 1.9, u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

// An unlit glow material (bloom picks it up) in a color, k times as bright.
export function glowMat(hex, k = 2.2, opts = {}) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), ...opts });
}

// The twelve edges of a box (centered on the origin) as thin bars merged into one geometry, so a
// platform's outline reads from any angle mid-jump. Cached by size.
const edgeCache = new Map();
export function edgeGeo(sx, sy, sz, t = 0.05) {
  const key = [sx, sy, sz, t].map((n) => n.toFixed(3)).join();
  if (edgeCache.has(key)) return edgeCache.get(key);
  const parts = [];
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  for (const a of [-1, 1])
    for (const b of [-1, 1]) {
      parts.push(new THREE.BoxGeometry(sx + t, t, t).translate(0, a * hy, b * hz));
      parts.push(new THREE.BoxGeometry(t, sy + t, t).translate(a * hx, 0, b * hz));
      parts.push(new THREE.BoxGeometry(t, t, sz + t).translate(a * hx, b * hy, 0));
    }
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  edgeCache.set(key, g);
  return g;
}

// Unit normals and plane rotations for the six faces of a box. Faces are named '+x' '-x' '+y' '-y' '+z'
// '-z' ('up' / 'down' are accepted for ±y).
const FACES = {
  '+x': [new THREE.Vector3(1, 0, 0), new THREE.Euler(0, Math.PI / 2, 0)],
  '-x': [new THREE.Vector3(-1, 0, 0), new THREE.Euler(0, -Math.PI / 2, 0)],
  '+y': [new THREE.Vector3(0, 1, 0), new THREE.Euler(-Math.PI / 2, 0, 0)],
  '-y': [new THREE.Vector3(0, -1, 0), new THREE.Euler(Math.PI / 2, 0, 0)],
  '+z': [new THREE.Vector3(0, 0, 1), new THREE.Euler(0, 0, 0)],
  '-z': [new THREE.Vector3(0, 0, -1), new THREE.Euler(0, Math.PI, 0)],
};
FACES.up = FACES['+y'];
FACES.down = FACES['-y'];
export const faceNormal = (face) => (FACES[face] || FACES['+z'])[0];
export const faceEuler = (face) => (FACES[face] || FACES['+z'])[1];

// An additive glyph decal for one face of a box of `size` (Vector3) centered on the origin.
export function faceDecal(size, face, material, scale = 0.7, off = 0.012) {
  const n = faceNormal(face);
  const w = n.x ? Math.min(size.y, size.z) : n.y ? Math.min(size.x, size.z) : Math.min(size.x, size.y);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w * scale, w * scale), material);
  m.rotation.copy(faceEuler(face));
  m.position.set(n.x * (size.x / 2 + off), n.y * (size.y / 2 + off), n.z * (size.z / 2 + off));
  return m;
}

export function glyphMat(hex, k = 1.1, opacity = 1) {
  return new THREE.MeshBasicMaterial({ map: glyphTex, color: new THREE.Color(hex).multiplyScalar(k), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

// A ghostly hologram box: scanlines and a meter grid in world space. uAlpha fades it, uFlash whitens it.
const holoShader = {
  vertexShader: `
    varying vec3 vW;
    varying vec3 vN;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uAlpha;
    uniform float uFlash;
    varying vec3 vW;
    varying vec3 vN;
    void main() {
      vec3 n = abs(vN);
      vec2 p = n.x > 0.5 ? vW.zy : n.y > 0.5 ? vW.xz : vW.xy;
      vec2 g = abs(fract(p * 1.0) - 0.5);
      float grid = smoothstep(0.45, 0.5, max(g.x, g.y));
      float scan = 0.5 + 0.5 * sin(vW.y * 16.0 + vW.x * 1.5 - uTime * 6.0);
      float a = (0.22 + 0.3 * scan + grid * 0.7) * uAlpha + uFlash * 0.5;
      vec3 col = uColor * (0.7 + 0.6 * scan + grid * 1.6) + vec3(uFlash);
      gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    }`,
};
export function holoMat(hex) {
  return new THREE.ShaderMaterial({
    ...holoShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(hex) }, uTime: { value: Math.random() * 10 }, uAlpha: { value: 0.15 }, uFlash: { value: 0 } },
  });
}

// A countdown ring on a plane: the lit arc is uFrac of the circle (clockwise from the top), cut into
// segments; uBlink flashes it white (the last moments).
const ringShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uFrac;
    uniform float uBlink;
    uniform float uSegs;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float band = smoothstep(0.68, 0.72, r) * (1.0 - smoothstep(0.95, 0.99, r));
      float a01 = fract(atan(p.x, p.y) / 6.2831853 + 1.0);
      float gap = 1.0 - smoothstep(0.8, 0.9, abs(fract(a01 * uSegs) - 0.5) * 2.0);
      float on = step(a01, uFrac);
      vec3 col = mix(uColor * 0.12, uColor * 2.2 + vec3(uBlink * 1.5), on);
      float a = band * gap * mix(0.35, 1.0, on);
      if (a < 0.01) discard;
      gl_FragColor = vec4(col, a);
    }`,
};
export function ringMesh(hex, radius = 0.6, segs = 20) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.ShaderMaterial({
      ...ringShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(hex) }, uFrac: { value: 0 }, uBlink: { value: 0 }, uSegs: { value: segs } },
    }),
  );
  m.renderOrder = 4;
  return m;
}

// A horizontal countdown bar of segments (a timed gate's lintel): uFrac of it lit, from the left.
const barShader = {
  vertexShader: ringShader.vertexShader,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uFrac;
    uniform float uBlink;
    uniform float uSegs;
    varying vec2 vUv;
    void main() {
      float s = fract(vUv.x * uSegs);
      float cell = smoothstep(0.06, 0.12, s) * (1.0 - smoothstep(0.88, 0.94, s));
      float edge = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
      float on = step(floor(vUv.x * uSegs) / uSegs, uFrac - 0.0001);
      vec3 col = mix(uColor * 0.1, uColor * 2.2 + vec3(uBlink * 1.5), on);
      float a = cell * edge * mix(0.4, 1.0, on);
      if (a < 0.01) discard;
      gl_FragColor = vec4(col, a);
    }`,
};
export function barMesh(hex, w, h, segs = 10) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.ShaderMaterial({
      ...barShader,
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(hex) }, uFrac: { value: 0 }, uBlink: { value: 0 }, uSegs: { value: segs } },
    }),
  );
  m.renderOrder = 4;
  return m;
}

// Does the player's box overlap min..max (Vector3s), grown by pad?
export function overlapsPlayer(player, min, max, pad = 0.02) {
  if (!player) return false;
  const b = player.bounds();
  return b.min.x < max.x + pad && b.max.x > min.x - pad && b.min.y < max.y + pad && b.max.y > min.y - pad && b.min.z < max.z + pad && b.max.z > min.z - pad;
}

// 0..1 loudness for a sound at p: full within 5 m of the player, silent past `range`.
export function nearGain(world, p, range = 40) {
  const pl = world.game?.player;
  if (!pl) return 1;
  return clamp(1 - (pl.pos.distanceTo(p) - 5) / (range - 5), 0, 1);
}

// Countdown ticks: one per second, then four a second for the last 1.5 s. Returns true on a tick.
export function tickDue(prevLeft, left) {
  if (left <= 0 || prevLeft <= left) return false;
  const step = left < 1.5 ? 0.25 : 1;
  return Math.floor(prevLeft / step) !== Math.floor(left / step);
}

// ---------- sounds ----------
// New samples the toolkit would like (see the report that came with it); until a file exists each one
// falls back to an existing sample or the synth. Fetched once the audio manifest has loaded.
export const MECH_SOUNDS = [
  'switch_on', 'switch_off', 'timer_tick', 'phase_in', 'phase_out', 'chroma_solid', 'crumble_crack', 'crumble_break',
  'trapdoor_drop', 'mover_step', 'rotor_turn', 'rotor_lock', 'rotor_jam', 'gate_open', 'gate_slam',
];
audio.manifest?.then(() => audio.prefetch(MECH_SOUNDS));

const s = (name, o) => audio.sample(name, o);
export const sfx = {
  switchOn: (g = 1) => s('switch_on', { gain: 0.8 * g, vary: 0 }) || s('target', { gain: 0.8 * g, vary: 0 }) || audio.target(),
  switchOff: (g = 1) => s('switch_off', { gain: 0.7 * g }) || s('switch', { gain: 0.6 * g, rate: 0.55 }) || audio.tone({ type: 'square', f: 660, f2: 220, dur: 0.18, gain: 0.07 * g }),
  tick: (urgent, g = 1) => s('timer_tick', { gain: (urgent ? 0.6 : 0.45) * g, rate: urgent ? 1.3 : 1, vary: 0 }) || audio.tone({ type: 'square', f: urgent ? 1760 : 1320, dur: 0.035, gain: (urgent ? 0.06 : 0.045) * g }),
  phaseIn: (g = 1) => s('phase_in', { gain: 0.6 * g }) || s('barrier_reform', { gain: 0.6 * g, rate: 1.2 }) || audio.tone({ type: 'sine', f: 300, f2: 1200, dur: 0.3, gain: 0.06 * g }),
  phaseOut: (g = 1) => s('phase_out', { gain: 0.6 * g }) || (audio.tone({ type: 'sine', f: 1100, f2: 180, dur: 0.3, gain: 0.06 * g }), audio.noise({ dur: 0.3, gain: 0.08 * g, freq: 3000, f2: 500, q: 1.5 })),
  chroma: (g = 1) => g > 0.02 && (s('chroma_solid', { gain: 0.35 * g, vary: 0.04 }) || audio.tone({ type: 'triangle', f: 520, f2: 880, dur: 0.07, gain: 0.035 * g })),
  crack: (g = 1) => s('crumble_crack', { gain: 0.8 * g, vary: 0.12 }) || (audio.noise({ dur: 0.22, gain: 0.25 * g, freq: 1200, q: 2.5 }), audio.tone({ type: 'square', f: 140, f2: 70, dur: 0.12, gain: 0.08 * g })),
  crumble: (g = 1) => s('crumble_break', { gain: 0.9 * g, vary: 0.1 }) || (s('shatter', { gain: 0.5 * g, rate: 0.55 }), audio.noise({ dur: 0.9, gain: 0.35 * g, freq: 500, f2: 80, type: 'lowpass' })),
  trapdoor: (g = 1) => s('trapdoor_drop', { gain: 0.9 * g }) || s('door_slam', { gain: 0.8 * g, rate: 1.35 }) || audio.door(),
  clank: (g = 1) => s('mover_step', { gain: 0.7 * g, vary: 0.08 }) || s('elevator_stop', { gain: 0.5 * g, rate: 1.6 }) || audio.tone({ type: 'square', f: 180, f2: 90, dur: 0.1, gain: 0.1 * g }),
  rotorTurn: (g = 1) => s('rotor_turn', { gain: 0.7 * g }) || s('door_open', { gain: 0.6 * g, rate: 1.9 }) || audio.noise({ dur: 0.4, gain: 0.2 * g, freq: 700, f2: 1400, q: 2 }),
  rotorLock: (g = 1) => s('rotor_lock', { gain: 0.8 * g }) || s('door_slam', { gain: 0.45 * g, rate: 1.7 }) || audio.tone({ type: 'square', f: 220, f2: 110, dur: 0.12, gain: 0.1 * g }),
  jam: (g = 1) => s('rotor_jam', { gain: 0.8 * g }) || s('combo_fail', { gain: 0.5 * g, rate: 0.8 }) || audio.noise({ dur: 0.35, gain: 0.25 * g, freq: 300, q: 4 }),
  gateOpen: (g = 1) => s('gate_open', { gain: 0.8 * g }) || s('door_open', { gain: 0.7 * g, rate: 1.5 }) || audio.doorOpen(),
  gateSlam: (g = 1) => s('gate_slam', { gain: 0.9 * g }) || s('door_slam', { gain: 0.8 * g, rate: 1.15 }) || audio.door(),
};

// Procedural crack lines for crumbling slabs (white on black, drawn additively in a color).
let crackTexture = null;
export function crackTex() {
  if (crackTexture) return crackTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  const branch = (x, y, a, len, w) => {
    if (len < 10 || w < 0.6) return;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    let px = x, py = y;
    for (let i = 0; i < 4; i++) {
      a += rnd(-0.6, 0.6);
      px += Math.cos(a) * len / 4;
      py += Math.sin(a) * len / 4;
      g.lineTo(px, py);
    }
    g.stroke();
    branch(px, py, a + rnd(-0.9, -0.3), len * 0.65, w * 0.7);
    if (Math.random() < 0.7) branch(px, py, a + rnd(0.3, 0.9), len * 0.55, w * 0.65);
  };
  for (let i = 0; i < 5; i++) branch(128 + rnd(-20, 20), 128 + rnd(-20, 20), (i / 5) * Math.PI * 2 + rnd(-0.3, 0.3), rnd(60, 90), 4);
  crackTexture = new THREE.CanvasTexture(c);
  crackTexture.colorSpace = THREE.SRGBColorSpace;
  return crackTexture;
}

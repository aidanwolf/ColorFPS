// Wren's hologram: the shared hologram material and the procedural figure it's drawn with.
//
// The figure is ONE skinned mesh (one draw call): a woman in field gear (jacket with a collar and rolled
// hood, cargo trousers tucked into boots, a satchel on a cross-body strap, hair tied back in a ponytail)
// built from lathed / capsule primitives in a relaxed bind pose, every vertex weighted to a small skeleton
// (smooth blends at the knees, elbows, waist and neck). Her hand props (recorder, tablet, notebook, brush,
// torch...) and the little holographic set pieces a vignette needs (a crate, a pipe, the Solar ring...) are
// in the same mesh, each on its own bone, and switched on and off by a bit mask uniform, so a vignette costs
// nothing extra to draw. See ghost.js for the rig that poses it and vignettes.js for what she does.
//
// The look (HOLO_FRAG): additive, translucent cyan-teal with a hot fresnel rim fading to a spectral
// white-blue, fine scanlines drifting down and a brighter band sweeping up, a flicker, a faint chromatic
// split on the rims, a projection fade at the feet, glitch slices that jump sideways (vertex shader), a
// scan line that builds her from the floor up (uReveal) and a cellular dissolve into motes (uDissolve).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// prop ids (bit index + 1 in uMask / uMask2): hand props, beams, then set pieces
export const PROPS = [
  'recorder', 'tablet', 'stylus', 'notebook', 'pencil', 'brush', 'torch', 'torchBeam', 'probe', 'mirror',
  'mirrorBeam', 'bar', 'pass', 'lamp', 'lampBeam', 'crate', 'tripod', 'rope', 'panel', 'terminal', 'pipe',
  'conduit', 'ring', 'bigMirror', 'bank', 'rail', 'shaft', 'core',
];
const PID = Object.fromEntries(PROPS.map((n, i) => [n, i + 1]));
// set pieces sit on their own bone under the root, placed per vignette (ghost.js)
export const SET_PROPS = ['crate', 'tripod', 'rope', 'panel', 'terminal', 'pipe', 'conduit', 'ring', 'bigMirror', 'bank', 'rail', 'shaft', 'core'];

// ---------------------------------------------------------------- the skeleton (bind pose, metres)
// She faces +Z; her left is +X. Arms hang straight down in the bind pose, legs straight.
export const BONES = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 0.95, 0]],
  ['spine', 'hips', [0, 0.1, 0]], // 1.05
  ['chest', 'spine', [0, 0.19, 0]], // 1.24
  ['neck', 'chest', [0, 0.2, 0]], // 1.44
  ['head', 'neck', [0, 0.08, 0]], // 1.52
  ['tail', 'head', [0, 0.135, -0.1]], // the ponytail's root, at the hair tie
  ['lClav', 'chest', [0.035, 0.155, 0]], // 1.395
  ['lArm', 'lClav', [0.145, 0, 0]], // shoulder x .18
  ['lFore', 'lArm', [0, -0.27, 0]], // elbow 1.125
  ['lHand', 'lFore', [0, -0.24, 0]], // wrist .885
  ['rClav', 'chest', [-0.035, 0.155, 0]],
  ['rArm', 'rClav', [-0.145, 0, 0]],
  ['rFore', 'rArm', [0, -0.27, 0]],
  ['rHand', 'rFore', [0, -0.24, 0]],
  ['lThigh', 'hips', [0.095, -0.06, 0]], // hip joint .89
  ['lShin', 'lThigh', [0, -0.42, 0]], // knee .47
  ['lFoot', 'lShin', [0, -0.395, 0]], // ankle .075
  ['rThigh', 'hips', [-0.095, -0.06, 0]],
  ['rShin', 'rThigh', [0, -0.42, 0]],
  ['rFoot', 'rShin', [0, -0.395, 0]],
  ['glow', 'root', [0, 0.012, 0]], // the projection pool on the floor under her
  ...SET_PROPS.map((n) => ['set_' + n, 'root', [0, 0, 0]]),
];
export const LEN = { thigh: 0.42, shin: 0.395, arm: 0.27, fore: 0.24 };
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// ---------------------------------------------------------------- the material
const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
attribute vec2 aK; // x: prop id (0: always drawn), y: kind (0 body, 1 hand prop, 2 beam, 3 set piece, 4 floor pool)
attribute float aF; // beams: 0 at the lamp .. 1 at the far end; floor pool: 0 centre .. 1 rim
uniform float uTime, uGlitch, uSeed, uMask, uMask2;
uniform vec3 uGlitchDir;
varying vec3 vW;
varying vec3 vN;
varying float vKind;
varying float vF;
float gh(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float on = 1.0;
  if (aK.x > 0.5) on = aK.x < 24.5 ? mod(floor(uMask / exp2(aK.x - 1.0)), 2.0) : mod(floor(uMask2 / exp2(aK.x - 25.0)), 2.0);
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  // glitch: horizontal slices of her jump sideways for a frame or two
  float band = floor(w.y * 11.0 + uSeed * 13.0);
  float g = gh(band + uSeed * 7.31);
  w.xyz += uGlitchDir * step(1.0 - 0.5 * uGlitch, g) * (g - 0.5) * 0.3 * uGlitch;
  // and a faint constant shiver, as if the projection never quite holds still
  w.xyz += uGlitchDir * sin(w.y * 41.0 + uTime * 27.0) * 0.0022;
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * objectNormal);
  vKind = aK.y;
  vF = aF;
  gl_Position = on < 0.5 ? vec4(0.0, 0.0, 2.0, 1.0) : projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform float uTime, uAlpha, uReveal, uDissolve, uFlick, uGlitch, uBase, uHeight, uPropFlash;
uniform vec3 uColA, uColB;
varying vec3 vW;
varying vec3 vN;
varying float vKind;
varying float vF;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  float h = vW.y - uBase;
  // materialize: a bright scan line climbs from the floor; above it, nothing yet
  float front = uReveal * (uHeight + 0.4) - 0.2;
  if (h > front) discard;
  float edge = 1.0 - smoothstep(0.0, 0.07, front - h);
  // dissolve: little cells of her drop out (the motes carry them away)
  float n = h3(floor(vW * 34.0));
  if (n < uDissolve) discard;
  float dEdge = uDissolve > 0.001 ? 1.0 - smoothstep(0.0, 0.1, n - uDissolve) : 0.0;

  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  float ndv = abs(dot(N, V));
  float fres = 1.0 - ndv;
  float rim = fres * fres;
  // fine scanlines drifting down (faded out where they'd shimmer), a brighter band sweeping up
  float sy = (vW.y + uTime * 0.11) * 230.0;
  float aa = clamp(1.4 - fwidth(sy) * 0.5, 0.0, 1.0);
  float scan = 1.0 - aa * 0.5 * (0.5 + 0.5 * sin(sy));
  float band = smoothstep(0.9, 1.0, fract(h * 0.55 - uTime * 0.32));
  float a = (0.075 + 0.85 * rim) * scan + band * 0.16 * (0.4 + rim);
  vec3 col = mix(uColA, uColB, smoothstep(0.35, 1.0, fres));
  // a faint chromatic split on the rims
  col += vec3(0.32, -0.12, 0.28) * pow(fres, 5.0) * (0.6 + 0.4 * sin(uTime * 1.7 + vW.y * 5.0));
  if (vKind > 1.5 && vKind < 2.5) {
    // a beam (torch, headlamp, mirror glint): a soft cone of light, strongest at the lamp
    float f = 1.0 - vF;
    a = f * f * (0.05 + 0.25 * ndv) * (0.85 + 0.15 * sin(vF * 40.0 - uTime * 6.0));
    col = mix(uColB, vec3(1.0), 0.3);
  } else if (vKind > 3.5) {
    // the projection pool on the floor: a soft disc with a ring at its edge
    float r = vF;
    a = (1.0 - r) * 0.16 + smoothstep(0.82, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r)) * 0.32;
    a *= 0.7 + 0.3 * sin(uTime * 3.1 + r * 9.0);
    col = uColA;
    h = 1.0;
  } else if (vKind > 2.5) {
    // set pieces: a little dimmer than her, more outline
    a = (0.04 + 0.75 * rim) * scan + band * 0.08;
  }
  if (vKind > 0.5 && vKind < 1.5) a *= 1.0 + uPropFlash * 2.0;
  float feet = smoothstep(-0.05, 0.4, h); // the projection thins out at her feet
  a *= feet * uFlick * uAlpha;
  float hot = (edge * 1.5 + dEdge * 2.0) * uAlpha;
  col = col * (1.0 + 2.5 * hot) + hot * 0.6;
  a = clamp(max(a, hot * 0.5), 0.0, 1.0);
  gl_FragColor = vec4(col, a);
#ifdef DEPTH_ONLY
  // the depth pre-pass: only her solid surfaces (so the hologram shows just her nearest skin, not every
  // overlapping layer); beams and the floor pool never hide anything
  if (vKind > 1.5 && vKind < 2.5 || vKind > 3.5) discard;
  gl_FragColor = vec4(0.0);
#endif
}`;

// depthOf: the colour material whose uniforms the depth pre-pass shares (it lays down her depth first)
export function holoMaterial(depthOf = null) {
  if (depthOf) {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: depthOf.uniforms,
      defines: { DEPTH_ONLY: 1 },
      colorWrite: false,
      depthWrite: true,
      transparent: true,
      side: THREE.FrontSide,
      fog: false,
    });
  }
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uReveal: { value: 0 },
      uDissolve: { value: 0 },
      uFlick: { value: 1 },
      uGlitch: { value: 0 },
      uSeed: { value: 0 },
      uMask: { value: 0 },
      uMask2: { value: 0 },
      uPropFlash: { value: 0 },
      uBase: { value: 0 },
      uHeight: { value: 1.75 },
      uGlitchDir: { value: new THREE.Vector3(1, 0, 0) },
      uColA: { value: new THREE.Color(0.16, 0.78, 0.95) }, // cyan-teal body
      uColB: { value: new THREE.Color(0.75, 1.45, 1.75) }, // the hot spectral rim (HDR: it blooms)
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    fog: false,
  });
}

export function propMask(names) {
  let m1 = 0, m2 = 0;
  for (const n of names) {
    const id = PID[n];
    if (!id) continue;
    if (id <= 24) m1 += 2 ** (id - 1);
    else m2 += 2 ** (id - 25);
  }
  return [m1, m2];
}

// ---------------------------------------------------------------- geometry helpers
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// a lathe from (radius, y) pairs listed bottom to top
function lathe(prof, seg = 10) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);
  return g;
}
// a tapered capsule hanging down from y=0 to y=-len (radius r1 at the top, r2 at the bottom)
function capsule(r1, r2, len, seg = 8) {
  const prof = [];
  for (let i = 0; i <= 2; i++) {
    const a = (i / 2) * (Math.PI / 2);
    prof.push([r2 * Math.sin(a), -len - r2 * Math.cos(a) + r2 * 0.35]);
  }
  for (let i = 0; i <= 2; i++) {
    const a = Math.PI / 2 - (i / 2) * (Math.PI / 2);
    prof.push([r1 * Math.sin(a), r1 * Math.cos(a) - r1 * 0.35]);
  }
  return lathe(prof, seg);
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1, r2, h, seg = 8, open = false) => new THREE.CylinderGeometry(r1, r2, h, seg, 1, open);
const sphere = (r, ws = 10, hs = 8, ...rest) => new THREE.SphereGeometry(r, ws, hs, ...rest);

// place a geometry: rotation (degrees, XYZ), position, scale
function put(g, pos = [0, 0, 0], rot = null, scale = null) {
  _e.set(...(rot || [0, 0, 0]).map((d) => (d * Math.PI) / 180));
  _q.setFromEuler(_e);
  _s.set(...(scale ? (Array.isArray(scale) ? scale : [scale, scale, scale]) : [1, 1, 1]));
  _m.compose(_p.set(...pos), _q, _s);
  g.applyMatrix4(_m);
  return g;
}
// a thin box running from point a to point b (straps, rope, tripod legs, frames)
function bar(a, b, t = 0.012, d = t) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = box(t, len, d);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
// a hollow box frame (edges only) w x h x d, sitting on y=0
function frame(w, h, d, t = 0.02) {
  const x = w / 2, z = d / 2, out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(bar([sx * x, 0, sz * z], [sx * x, h, sz * z], t));
  for (const y of [0, h]) {
    for (const sz of [-1, 1]) out.push(bar([-x, y, sz * z], [x, y, sz * z], t));
    for (const sx of [-1, 1]) out.push(bar([sx * x, y, -z], [sx * x, y, z], t));
  }
  return out;
}

// Bone weights by height for a vertical chain (all the joints in the bind pose are stacked vertically):
// zones = [{ y, below, above, span }] ascending; a vertex within span of a joint blends the two bones.
function zoned(zones) {
  return (v) => {
    for (const z of zones) {
      if (v.y < z.y - z.span) return [z.below, 1, z.below, 0];
      if (v.y <= z.y + z.span) {
        if (z.span <= 0) return [v.y < z.y ? z.below : z.above, 1, z.above, 0];
        const t = (v.y - (z.y - z.span)) / (2 * z.span), w = t * t * (3 - 2 * t);
        return [z.below, 1 - w, z.above, w];
      }
    }
    const last = zones[zones.length - 1];
    return [last.above, 1, last.above, 0];
  };
}
const rigid = (bone) => () => [bone, 1, bone, 0];

// ---------------------------------------------------------------- the figure
export function buildFigure() {
  const parts = [];
  // geometry → skinned part: weights(v) -> [boneA, wA, boneB, wB] (bone names), prop name, kind
  const add = (g, weights, { prop = null, kind = 0, f = null } = {}) => {
    if (Array.isArray(g)) return g.forEach((x) => add(x, weights, { prop, kind, f }));
    g = g.index ? g : g; // every primitive here is indexed
    g.deleteAttribute('uv');
    const pos = g.attributes.position, n = pos.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), k = new Float32Array(n * 2), ff = new Float32Array(n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      const [a, wa, b, wb] = weights(v);
      si[i * 4] = BI[a];
      si[i * 4 + 1] = BI[b];
      sw[i * 4] = wa;
      sw[i * 4 + 1] = wb;
      k[i * 2] = prop ? PID[prop] : 0;
      k[i * 2 + 1] = kind;
      ff[i] = f ? f(v) : 0;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute('aK', new THREE.Float32BufferAttribute(k, 2));
    g.setAttribute('aF', new THREE.Float32BufferAttribute(ff, 1));
    parts.push(g);
  };

  // ---- torso: jacket over a fitted top, cinched at the waist, a little flare at the hem
  const torsoW = zoned([
    { y: 1.0, below: 'hips', above: 'spine', span: 0.05 },
    { y: 1.19, below: 'spine', above: 'chest', span: 0.06 },
    { y: 1.455, below: 'chest', above: 'neck', span: 0.02 },
  ]);
  const jacket = lathe([
    [0.0, 0.855], [0.168, 0.86], [0.166, 0.9], [0.152, 0.96], [0.138, 1.02], [0.134, 1.08], [0.142, 1.14],
    [0.156, 1.2], [0.162, 1.26], [0.158, 1.32], [0.152, 1.37], [0.13, 1.41], [0.085, 1.44], [0.0, 1.45],
  ], 12);
  jacket.scale(1.2, 1, 0.8);
  {
    // a bust and shoulder blades: push the front out a touch at chest height
    const p = jacket.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), z = p.getZ(i);
      const b = Math.max(0, 1 - Math.abs(y - 1.245) / 0.07);
      if (z > 0) p.setZ(i, z + 0.022 * b * b * (3 - 2 * b) * Math.min(1, z / 0.08));
    }
    jacket.computeVertexNormals();
  }
  add(jacket, torsoW);
  // collar standing up around the neck, a rolled hood behind it
  add(put(cyl(0.072, 0.092, 0.075, 12, true), [0, 1.455, -0.006], [-8, 0, 0]), torsoW);
  add(put(new THREE.TorusGeometry(0.075, 0.03, 5, 9, Math.PI * 1.1), [0, 1.44, -0.035], [90 - 12, 0, -9]), torsoW);
  // zip line, chest pockets with flaps, a belt line under the hem
  add(put(box(0.012, 0.52, 0.012), [0, 1.16, 0.133], [-3, 0, 0]), torsoW);
  for (const sx of [-1, 1]) {
    add(put(box(0.085, 0.075, 0.02), [sx * 0.085, 1.29, 0.142], [-12, sx * 14, 0]), torsoW);
    add(put(box(0.07, 0.07, 0.022), [sx * 0.105, 0.94, 0.128], [0, sx * 20, 0]), torsoW); // hip pockets
  }

  // ---- hips: cargo trousers
  const pants = lathe([[0.0, 0.79], [0.13, 0.8], [0.152, 0.85], [0.158, 0.91], [0.148, 0.97], [0.135, 1.01], [0.0, 1.02]], 12);
  pants.scale(1.18, 1, 0.86);
  add(pants, torsoW);

  // ---- neck and head
  add(put(cyl(0.043, 0.047, 0.13, 8, true), [0, 1.49, 0.0]), zoned([{ y: 1.455, below: 'chest', above: 'neck', span: 0.025 }, { y: 1.53, below: 'neck', above: 'head', span: 0.015 }]));
  const head = sphere(0.1, 12, 9);
  {
    const p = head.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // a gentler jaw and chin, a flatter back of the skull
      if (y < 0) x *= 1 - 0.28 * Math.min(1, -y / 0.1);
      if (y < -0.02 && z > 0) z *= 1 - 0.12 * Math.min(1, (-y - 0.02) / 0.08);
      if (z < 0) z *= 0.94;
      p.setXYZ(i, x * 0.84, y * 1.1, z * 0.98);
    }
    head.computeVertexNormals();
  }
  const headW = rigid('head');
  add(put(head, [0, 1.62, 0.012]), headW);
  add(put(new THREE.ConeGeometry(0.014, 0.034, 4), [0, 1.608, 0.11], [96, 45, 0]), headW); // nose
  for (const sx of [-1, 1]) add(put(sphere(0.018, 5, 3), [sx * 0.083, 1.615, -0.005], null, [0.45, 1, 0.8]), headW); // ears
  // hair: a cap over the crown and the back, a side-swept fringe, the tie, and the ponytail (its own bone)
  add(put(sphere(0.108, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), [0, 1.636, -0.006], [-28, 0, 0], [0.88, 1.06, 1.0]), headW);
  // a side-swept fringe falling to her right temple
  add(put(box(0.075, 0.022, 0.03), [-0.02, 1.712, 0.083], [-38, 0, 16]), headW);
  add(put(box(0.04, 0.06, 0.022), [-0.068, 1.67, 0.072], [-12, -28, 10]), headW);
  // brows, cheekbones and lips catch the rim light, so her face reads
  for (const sx of [-1, 1]) {
    add(put(box(0.034, 0.007, 0.01), [sx * 0.032, 1.648, 0.098], [0, sx * 14, sx * -8]), headW);
    add(put(sphere(0.012, 5, 3), [sx * 0.032, 1.628, 0.088], null, [1.2, 0.6, 0.5]), headW); // eyes
    add(put(sphere(0.022, 5, 3), [sx * 0.05, 1.595, 0.077], null, [1, 0.6, 0.6]), headW);
  }
  add(put(sphere(0.018, 6, 3), [0, 1.565, 0.094], null, [1.3, 0.45, 0.6]), headW); // lips
  add(put(sphere(0.03, 6, 4), [0, 1.66, -0.1]), headW);
  // the ponytail hangs from the tail bone along TAIL_DIR (head space), tapering
  {
    const pony = capsule(0.034, 0.012, 0.2, 7);
    // capsule hangs along -Y from 0; tilt it to TAIL_DIR
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), TAIL_DIR);
    pony.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, 1.655, -0.1), q, new THREE.Vector3(1, 1, 1)));
    add(pony, rigid('tail'));
  }
  // headlamp: a band round the head, the lamp on the forehead, its beam
  add(put(new THREE.TorusGeometry(0.1, 0.008, 3, 12), [0, 1.665, 0.004], [96, 0, 0], [0.88, 1.0, 1]), headW, { prop: 'lamp', kind: 1 });
  add(put(box(0.045, 0.03, 0.03), [0, 1.67, 0.11]), headW, { prop: 'lamp', kind: 1 });
  add(put(cyl(0.5, 0.02, 3.2, 12, true), [0, 1.67 - 0.25, 0.12 + 1.58], [99, 0, 0]), headW, { prop: 'lampBeam', kind: 2, f: (v) => Math.min(1, Math.max(0, (v.z - 0.12) / 3.2)) });

  // ---- arms: sleeves with cuffs, hands with a thumb
  for (const [s, side] of [['l', 1], ['r', -1]]) {
    const x = side * 0.18;
    const armW = zoned([
      { y: 0.885, below: s + 'Hand', above: s + 'Fore', span: 0.02 },
      { y: 1.125, below: s + 'Fore', above: s + 'Arm', span: 0.05 },
    ]);
    add(put(capsule(0.056, 0.047, 0.27, 9), [x, 1.395, 0]), armW);
    add(put(capsule(0.047, 0.04, 0.24, 9), [x, 1.125, 0]), armW);
    add(put(new THREE.TorusGeometry(0.043, 0.011, 3, 8), [x, 0.905, 0], [90, 0, 0]), armW);
    // hand: palm facing her thigh, fingers slightly curled forward
    const hw = rigid(s + 'Hand');
    add(put(box(0.028, 0.085, 0.075), [x, 0.835, 0.004]), hw);
    add(put(box(0.024, 0.075, 0.07), [x - side * 0.004, 0.77, 0.014], [-14, 0, 0]), hw);
    add(put(box(0.02, 0.06, 0.022), [x - side * 0.012, 0.83, 0.05], [24, 0, side * 18]), hw);
  }

  // ---- legs: trousers to mid-calf, boots
  for (const [s, side] of [['l', 1], ['r', -1]]) {
    const x = side * 0.095;
    const legW = zoned([
      { y: 0.075, below: s + 'Foot', above: s + 'Shin', span: 0.03 },
      { y: 0.47, below: s + 'Shin', above: s + 'Thigh', span: 0.06 },
    ]);
    add(put(capsule(0.083, 0.06, 0.42, 9), [x, 0.89, 0]), legW);
    add(put(box(0.035, 0.09, 0.07), [x + side * 0.075, 0.68, 0.01], [0, 0, side * -3]), legW); // cargo pocket
    add(put(capsule(0.058, 0.046, 0.25, 9), [x, 0.47, 0]), legW);
    // boot: shaft, cuff, foot with a rounded toe
    add(put(cyl(0.056, 0.05, 0.24, 9, true), [x, 0.19, 0]), legW);
    add(put(new THREE.TorusGeometry(0.056, 0.012, 3, 8), [x, 0.3, 0], [90, 0, 0]), legW);
    const foot = new THREE.BoxGeometry(0.092, 0.08, 0.25, 1, 1, 2);
    {
      const p = foot.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i), y = p.getY(i);
        if (z > 0.06) p.setX(i, p.getX(i) * 0.8); // the toe narrows
        if (z > 0.1 && y > 0) p.setY(i, y * 0.4); // and slopes down
      }
      foot.computeVertexNormals();
    }
    add(put(foot, [x, 0.04, 0.055]), rigid(s + 'Foot'));
  }

  // ---- satchel on her right hip, the strap over her left shoulder
  const bagW = rigid('hips');
  add(put(box(0.07, 0.17, 0.22), [-0.205, 0.93, -0.06], [0, 0, 4]), bagW);
  add(put(box(0.075, 0.08, 0.225), [-0.207, 0.995, -0.06], [0, 0, 4]), bagW); // the flap
  add(bar([0.13, 1.42, 0.07], [-0.07, 1.13, 0.14], 0.032, 0.012), torsoW);
  add(bar([-0.07, 1.13, 0.14], [-0.2, 1.0, 0.03], 0.032, 0.012), torsoW);
  add(bar([0.13, 1.42, -0.07], [-0.2, 1.0, -0.12], 0.032, 0.012), torsoW);

  // ---- hand props, built where the hand is in the bind pose (grip ~ (x, .82, .02); +Z is "out of the fist")
  const R = rigid('rHand'), L = rigid('lHand');
  const rx = -0.18, lx = 0.18;
  // recorder: a chunky handheld, upright in the palm
  add([put(box(0.04, 0.12, 0.06), [rx + 0.005, 0.81, 0.035]), put(box(0.01, 0.04, 0.04), [rx + 0.028, 0.835, 0.035]), put(cyl(0.004, 0.004, 0.06, 4), [rx, 0.9, 0.05])], R, { prop: 'recorder', kind: 1 });
  // tablet in the left hand, held at its edge
  add([put(box(0.012, 0.24, 0.17), [lx - 0.02, 0.78, 0.07]), put(box(0.002, 0.2, 0.14), [lx - 0.028, 0.78, 0.07])], L, { prop: 'tablet', kind: 1 });
  add(put(cyl(0.004, 0.003, 0.13, 4), [rx, 0.8, 0.06], [90, 0, 0]), R, { prop: 'stylus', kind: 1 });
  // a field notebook (open) and a pencil
  add([put(box(0.012, 0.16, 0.12), [lx - 0.02, 0.8, 0.06], [0, 0, 0]), put(box(0.004, 0.15, 0.11), [lx - 0.03, 0.8, 0.065], [0, -8, 0])], L, { prop: 'notebook', kind: 1 });
  add(put(cyl(0.004, 0.002, 0.12, 5), [rx, 0.79, 0.05], [90, 0, 0]), R, { prop: 'pencil', kind: 1 });
  // a brush: handle out of the fist, a bristle head
  add([put(cyl(0.008, 0.008, 0.13, 5), [rx, 0.81, 0.07], [90, 0, 0]), put(box(0.035, 0.022, 0.05), [rx, 0.81, 0.155])], R, { prop: 'brush', kind: 1 });
  // a torch and its beam
  add([put(cyl(0.017, 0.017, 0.15, 7), [rx, 0.81, 0.06], [90, 0, 0]), put(cyl(0.026, 0.019, 0.04, 7), [rx, 0.81, 0.14], [90, 0, 0])], R, { prop: 'torch', kind: 1 });
  add(put(cyl(0.55, 0.024, 3.4, 12, true), [rx, 0.81, 0.16 + 1.7], [90, 0, 0]), R, { prop: 'torchBeam', kind: 2, f: (v) => Math.min(1, Math.max(0, (v.z - 0.16) / 3.4)) });
  // the probe: a wand with a clip at its tip
  add([put(cyl(0.011, 0.011, 0.2, 6), [rx, 0.81, 0.08], [90, 0, 0]), put(new THREE.TorusGeometry(0.016, 0.004, 3, 6), [rx, 0.81, 0.13]), put(sphere(0.014, 5, 3), [rx, 0.81, 0.185])], R, { prop: 'probe', kind: 1 });
  // a compact mirror flipped open in the left hand, and the glint it throws
  add([put(cyl(0.035, 0.035, 0.008, 12), [lx - 0.015, 0.76, 0.03], [0, 0, 90]), put(cyl(0.035, 0.035, 0.006, 12), [lx - 0.03, 0.79, 0.03], [0, 0, 60])], L, { prop: 'mirror', kind: 1 });
  add(put(cyl(0.18, 0.02, 2.6, 8, true), [lx - 0.03 - 1.3, 0.79, 0.03], [0, 0, 90]), L, { prop: 'mirrorBeam', kind: 2, f: (v) => Math.min(1, Math.max(0, (lx - 0.03 - v.x) / 2.6)) });
  add(put(box(0.03, 0.1, 0.016), [rx, 0.8, 0.03]), R, { prop: 'bar', kind: 1 });
  add(put(box(0.003, 0.086, 0.054), [lx - 0.02, 0.75, 0.04]), L, { prop: 'pass', kind: 1 });

  // ---- set pieces (each on its own bone; built around the origin, sitting on the floor)
  const S = (n) => rigid('set_' + n);
  const set = (n, g) => add(g, S(n), { prop: n, kind: 3 });
  set('crate', [put(box(0.62, 0.46, 0.46), [0, 0.23, 0]), ...frame(0.64, 0.48, 0.48, 0.025), put(box(0.64, 0.03, 0.03), [0, 0.24, 0.235])]);
  set('tripod', [
    ...[0, 120, 240].map((a) => bar([0, 1.25, 0], [Math.sin((a * Math.PI) / 180) * 0.45, 0, Math.cos((a * Math.PI) / 180) * 0.45], 0.018)),
    put(box(0.12, 0.1, 0.2), [0, 1.33, 0]), put(cyl(0.03, 0.035, 0.08, 8), [0, 1.35, 0.13], [90, 0, 0]),
  ]);
  set('rope', [put(cyl(0.013, 0.013, 4.4, 5, true), [0, 0.4, 0]), put(new THREE.TorusGeometry(0.1, 0.012, 4, 10), [0, 2.55, 0], [90, 0, 0])]);
  {
    const p = [put(box(1.3, 1.1, 0.05), [0, 1.35, 0])];
    for (let i = 0; i < 9; i++) p.push(put(box(0.35 + ((i * 37) % 7) * 0.1, 0.02, 0.02), [-0.5 + ((i * 53) % 5) * 0.06 + 0.2, 0.95 + i * 0.09, 0.035]));
    p.push(put(new THREE.TorusGeometry(0.12, 0.012, 4, 16), [0.42, 1.6, 0.035]));
    set('panel', p);
  }
  set('terminal', [
    put(box(0.14, 0.95, 0.14), [0, 0.475, 0]),
    put(box(0.7, 0.45, 0.04), [0, 1.18, 0.06], [-25, 0, 0]),
    ...[0, 1, 2, 3, 4].map((i) => put(box(0.5 - (i % 2) * 0.15, 0.018, 0.02), [-0.05 + (i % 2) * 0.07, 1.06 + i * 0.065, 0.1 - i * 0.03], [-25, 0, 0])),
  ]);
  set('pipe', [put(cyl(0.11, 0.11, 2.8, 12, true), [0, 1.4, 0]), ...[0.3, 1.1, 1.9, 2.6].map((y) => put(new THREE.TorusGeometry(0.12, 0.022, 3, 10), [0, y, 0], [90, 0, 0])), put(box(0.12, 0.08, 0.06), [0, 1.55, 0.13])]);
  // a glassy conduit lying in the sand along X, with collars every so often
  set('conduit', [put(cyl(0.07, 0.07, 3.6, 10, true), [0, 0.07, 0], [0, 0, 90]), ...[-1.4, -0.5, 0.4, 1.3].map((x) => put(new THREE.TorusGeometry(0.08, 0.018, 3, 8), [x, 0.07, 0], [0, 90, 0]))]);
  // the Solar ring: a great stone ring on its edge with a stepped plinth, its plane facing +Z
  set('ring', [
    put(new THREE.TorusGeometry(1.45, 0.2, 5, 22), [0, 1.75, 0]),
    put(new THREE.TorusGeometry(1.2, 0.03, 3, 22), [0, 1.75, 0.1]),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => put(box(0.08, 0.14, 0.44), [Math.cos((i * Math.PI) / 4) * 1.45, 1.75 + Math.sin((i * Math.PI) / 4) * 1.45, 0], [0, 0, i * 45])),
    put(box(1.6, 0.18, 0.7), [0, 0.09, 0]),
  ]);
  set('bigMirror', [put(box(1.1, 1.5, 0.05), [0, 1.2, 0], [-20, 0, 0]), ...frame(1.14, 0.06, 0.1, 0.03).map((g) => put(g, [0, 0.45, 0])), bar([0, 0, 0], [0, 0.65, 0], 0.07)]);
  set('bank', [put(cyl(0.3, 0.3, 1.5, 12), [0, 0.75, 0]), ...[0.2, 0.55, 0.9, 1.25].map((y) => put(new THREE.TorusGeometry(0.31, 0.025, 3, 10), [0, y, 0], [90, 0, 0])), put(cyl(0.16, 0.3, 0.2, 12), [0, 1.6, 0])]);
  set('rail', [...[-1, 0, 1].map((x) => bar([x * 0.9, 0, 0], [x * 0.9, 1.05, 0], 0.035)), bar([-0.95, 1.05, 0], [0.95, 1.05, 0], 0.04), bar([-0.95, 0.55, 0], [0.95, 0.55, 0], 0.025)]);
  set('shaft', [put(new THREE.TorusGeometry(0.65, 0.05, 3, 18), [0, 0.03, 0], [90, 0, 0]), put(cyl(0.65, 0.65, 2.5, 16, true), [0, -1.25, 0]), ...frame(1.6, 0.04, 1.6, 0.04)]);
  set('core', [
    ...frame(1.4, 2.6, 0.2, 0.05),
    put(new THREE.TorusGeometry(0.5, 0.025, 3, 18), [0, 1.35, 0]),
    put(new THREE.TorusGeometry(0.3, 0.02, 3, 14), [0, 1.35, 0]),
    put(sphere(0.12, 8, 6), [0, 1.35, 0]),
  ]);

  // ---- the projection pool on the floor under her
  add(put(new THREE.CircleGeometry(0.62, 24), [0, 0, 0], [-90, 0, 0]), rigid('glow'), { kind: 4, f: (v) => Math.min(1, Math.hypot(v.x, v.z) / 0.62) });

  const geo = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  geo.computeBoundingSphere();
  return geo;
}

// the ponytail's rest direction in head space (down her back)
export const TAIL_DIR = new THREE.Vector3(0, -0.88, -0.48).normalize();

// the bones, wired into a hierarchy at their bind positions
export function buildBones() {
  const bones = [];
  for (const [name, parent, pos] of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...pos);
    if (parent) bones[BI[parent]].add(b);
    bones.push(b);
  }
  return bones;
}
export const BONE_INDEX = BI;

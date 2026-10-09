// GOO (world.goo): what the green glob launcher's bursts leave behind, and the puzzle pieces built on it.
// (wet.js is the blue cannon's counterpart.) Every green blast (weapons/globs.js blast()) calls splat(),
// and a burst on a floor raises a goo column (column()). Everything goo does runs out: it glows while
// fresh, then visibly HARDENS (darkens, cracks, the glow dies) and drips / shrinks away near expiry.
//
// What a splat does, in this order:
//   1. STICKABLES within reach get stuck fast for their `duration` (a moving platform freezes where it is,
//      a swinging log hangs mid-swing...): gobs of goo cling to them, pulse faster as the time runs out
//      (ticks in the last 1.5 s), then pop off and the thing carries on. Goo again to refresh.
//   2. GOO GAPS within reach fill with a walkable goo membrane (grows out from the hit in ~0.4 s, sags
//      under you, hardens and bursts when its time is up). A glob flying into a gap's open mouth bursts on
//      the membrane's plane (gapCatch), so you can lob one straight down a hole or across a chasm.
//   3. Otherwise, on a static surface, a GOO PATCH: a glowing splat decal on floors, walls and ceilings
//      (floor splats merge and grow up to PATCH_MAX m across). Ground enemies wading in floor goo are
//      gummed up: their whole AI runs at SLOW × speed (movement, turning, attack timers), and the moment
//      they step in they're ROOTED briefly (ROOT × speed for ROOT_T s). Flying enemies and the player are
//      unaffected (it squelches underfoot, nothing more), so goo never gets in the way of a puzzle.
//
// API for level code (positions world space; [x, y, z] arrays or Vector3s):
//   goo.registerStickable(obj, opts) → handle
//      obj: anything in world.entities (or not) with a bounding box. opts:
//        box        how to find its box: a function (out: Box3) => out, a live { min, max } (e.g. a solid),
//                   or omitted: obj.solid / obj.solids (union of the enabled ones) / obj.mesh / obj.group
//        duration   s it stays stuck per gooing (default STICK_TIME 5)
//        freeze     true (default): while stuck, obj.update is skipped entirely and the deltas of its
//                   solids (obj.solid / obj.solids, what carries a rider) are zeroed, so a mover just stops
//                   (MovingPlatform, a shot mover, a swinging root...). false: nothing is skipped; read
//                   handle.stuck / obj.gooStuck or use the callbacks to stop it your own way.
//        onStick(handle, point)  / onUnstick(handle)   callbacks (e.g. pause a pendulum's clock)
//        pad        m added to the blast's reach to its box (default 0.35)
//        parent     Object3D the goo gobs attach to (default obj.mesh || obj.group; world space if none):
//                   with freeze false the gobs then ride along with it
//      handle: { obj, stuck, left, duration, stick(point?), unstick(), remove() }; obj.gooStuck mirrors stuck.
//      e.g.  const plat = new MovingPlatform(W, {...});  W.goo.registerStickable(plat, { duration: 6 });
//            W.goo.registerStickable(log, { box: (out) => out.setFromObject(log.mesh), freeze: false,
//                                           onStick: () => (log.paused = true), onUnstick: () => (log.paused = false) });
//   goo.addGap(box, opts) → handle
//      box { min, max }: the hole / vent / chasm (keep it ≤ ~3 m across so one burst reads as bridging it).
//      opts: axis 'y' (default: a floor hole, the membrane spans x/z at box.max.y, walkable) or 'x' / 'z'
//            (a vertical plug across a vent or doorway: the membrane spans the box at its centre along that
//            axis and the whole box goes solid); duration (default GAP_TIME 9 s); thickness (0.3 m, axis
//            'y'); pad (0.6 m extra reach); onFill(handle, point) / onClear(handle) (e.g. a spawner checks
//            handle.filled before an enemy may climb out of its hole).
//      handle: { filled, left, duration, solid, fill(point?), clear(), remove() }
//      e.g.  W.goo.addGap({ min: [10, -4, 2], max: [12.5, 0, 6] }, { duration: 10 });
//            const vent = W.goo.addGap({ min: [x, 0, z], max: [x + 0.4, 2, z + 2] }, { axis: 'x', onFill: () => spawner.block(true), onClear: () => spawner.block(false) });
//   goo.addPatch(pos, normal = up, radius = 1.2, life = PATCH_LIFE)   place goo directly (life Infinity:
//                                         a permanent gooey surface that never dries)
//   goo.slowAt(pos) → 0..1                how gummed-up something with its feet at pos is (1: no goo)
//   goo.patchAt(pos) → patch | null       the floor patch under pos: { pos, n, r, life, max }
//   goo.splat(point, normal, radius, { air, charge })    what a green blast calls (normal null: mid-air)
//   goo.column(point, height, radius, charge)            the goo geyser a floor burst throws up
//   goo.clear()                           everything gone (the game calls it on respawn)
import * as THREE from 'three';
import { audio } from './audio.js';

export const PATCH_LIFE = 14; // s a splat lasts
const HARDEN = 3; // its last s: hardens, then shrinks away
const PATCH_MAX = 2.6; // m radius a floor patch can grow to
const MAX_PATCHES = 30;
export const SLOW = 0.4; // dt factor for a ground enemy wading in goo
const ROOT = 0.08, ROOT_T = 0.7, ROOT_COOL = 3; // stepping in: stuck fast for a moment
export const STICK_TIME = 5;
export const GAP_TIME = 9;
const GAP_FILL = 0.4; // s for a membrane to grow across
const GAP_HARDEN = 2.5;
const COLUMNS = 6;
const COLUMN_T = 0.8;
const CLUMPS = 14;
const BLOBS = 6; // gobs per clump
const CHECK_EVERY = 0.1;
const UP = new THREE.Vector3(0, 1, 0);
const GOO = new THREE.Color(0x3dff7a);
const GOO_DARK = new THREE.Color(0x0e5a24);
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion();
const _box = new THREE.Box3(), _box2 = new THREE.Box3();
const v3 = (p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p));
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// (goo_stick, goo_unstick, goo_bridge, goo_burst and goo_column are wanted samples: stock ones stand in)
audio.manifest?.then(() => audio.prefetch(['slime_squelch', 'slime_splat', 'slime_burble', 'slime_regrow', 'timer_tick', 'glob_pop', 'goo_stick', 'goo_unstick', 'goo_bridge', 'goo_burst', 'goo_column']));
const near = (world, p, range = 40) => Math.max(0, 1 - world.game.camera.position.distanceTo(p) / range);

// ---------------------------------------------------------------- the goo surface shader
// One program for splat patches and gap membranes: a translucent, glossy green film whose thickness is
// lumpy noise (lit by a fake normal from it), glowing veins that crawl, bubbles that swell and pop, a
// bright wet glint; uHard (0 → 1 near the end) dries it to a dark, cracked, dull crust and pulls the rim
// in. Round splats (uShape 0) have a noisy rim with flung "fingers"; membranes (uShape 1) are a rounded
// rectangle that grows out from uOrigin as uFill goes 0 → 1, and sag in the middle (uSag).
const surfVert = `
  uniform vec2 uHalf;
  uniform float uSag;
  varying vec2 vL;
  varying vec3 vWorld;
  varying vec3 vT;
  varying vec3 vN;
  #include <fog_pars_vertex>
  void main() {
    vec3 p = position;
    vL = vec2(p.x, p.z) * uHalf;
    p.y -= uSag * (1.0 - p.x * p.x) * (1.0 - p.z * p.z);
    vec4 w = modelMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    vT = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
    vN = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const surfFrag = `
  uniform float uTime, uHard, uFade, uSeed, uFill, uShape, uPulse;
  uniform vec2 uHalf, uOrigin;
  varying vec2 vL;
  varying vec3 vWorld;
  varying vec3 vT;
  varying vec3 vN;
  #include <fog_pars_fragment>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { return 0.55 * noise(p) + 0.3 * noise(p * 2.03 + 3.1) + 0.15 * noise(p * 4.1 + 7.7); }
  void main() {
    vec2 q = vL;
    float sd;
    if (uShape < 0.5) {
      float r = uHalf.x / 1.2; // (the decal is drawn 1.2 × the patch's radius, room for its fingers)
      float a = atan(q.y, q.x);
      float rim = 0.74 + 0.14 * noise(vec2(a * 1.9 + uSeed, uSeed * 2.3)) + 0.22 * pow(noise(vec2(a * 5.0 - uSeed * 3.0, 1.7 + uSeed)), 3.0);
      rim *= r * (0.3 + 0.7 * uFill) * (1.0 - 0.3 * uHard * uHard);
      sd = length(q) - rim;
      // a few flung droplets just past the rim
      vec2 dc = floor(q * 2.6 + uSeed), df = fract(q * 2.6 + uSeed) - 0.5;
      float drop = length(df - (vec2(hash(dc), hash(dc + 4.0)) - 0.5) * 0.5) - 0.09 * step(0.72, hash(dc + 9.0));
      if (sd > 0.0 && sd < r * 0.35) sd = min(sd, drop * 0.4 + 0.012);
    } else {
      vec2 d = abs(q) - uHalf + 0.04;
      sd = max(d.x, d.y) + 0.07 * (noise(q * 3.0 + uSeed) - 0.5);
      float fr = uFill * length(uHalf) * 2.3;
      sd = max(sd, length(q - uOrigin) - fr + 0.25 * (noise(q * 2.0 + uSeed) - 0.5));
    }
    float edge = 1.0 - smoothstep(-0.05, 0.0, sd);
    if (edge < 0.01) discard;
    float inner = clamp(-sd / 0.45, 0.0, 1.0);
    vec2 fl = vec2(uSeed, uTime * 0.12);
    float lump = fbm(q * 2.2 + fl);
    float h = inner * (0.5 + 0.5 * lump);
    float ex = fbm((q + vec2(0.06, 0.0)) * 2.2 + fl) - lump;
    float ey = fbm((q + vec2(0.0, 0.06)) * 2.2 + fl) - lump;
    vec3 B = cross(vT, vN);
    vec3 nrm = normalize(vN + (vT * -ex + B * -ey) * 7.0 * (0.4 + inner));
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(vec3(0.35, 1.0, 0.25));
    float spec = pow(max(dot(reflect(-V, nrm), L), 0.0), 36.0);
    float fres = pow(1.0 - clamp(abs(dot(V, nrm)), 0.0, 1.0), 3.0);
    // veins of glow crawling through it
    float vn = abs(noise(q * 2.6 + vec2(uTime * 0.25, -uTime * 0.18) + uSeed) - 0.5);
    float vein = (1.0 - smoothstep(0.0, 0.05, vn)) * inner;
    // bubbles swelling and popping
    vec2 bc = floor(q * 3.2 + uSeed * 1.3), bf = fract(q * 3.2 + uSeed * 1.3) - 0.5;
    float bph = fract(uTime * (0.35 + 0.4 * hash(bc)) + hash(bc + 2.0));
    float br = 0.05 + 0.2 * bph;
    float bub = (1.0 - smoothstep(0.0, 0.035, abs(length(bf - (vec2(hash(bc + 5.0), hash(bc + 6.0)) - 0.5) * 0.4) - br))) * step(0.55, hash(bc + 8.0)) * (1.0 - bph) * inner;
    vec3 deep = vec3(0.02, 0.22, 0.05);
    vec3 lime = vec3(0.3, 1.0, 0.4);
    float glow = 0.75 + 0.25 * sin(uTime * 2.0 + uSeed * 4.0) + uPulse;
    vec3 col = mix(deep, lime * 0.9, h * 0.55) * glow + lime * (vein * 1.5 + bub * 1.1) * (0.6 + uPulse) + vec3(0.75, 1.0, 0.8) * spec * 0.9 + lime * fres * 0.3;
    // drying: a dull olive crust, cracked, the glow gone
    float cr = abs(noise(q * 4.5 + uSeed * 2.0) - 0.5);
    float crack = 1.0 - smoothstep(0.0, 0.03, cr);
    vec3 crust = vec3(0.1, 0.15, 0.05) * (0.7 + 0.5 * lump) + vec3(0.02, 0.05, 0.01) * spec;
    crust = mix(crust, vec3(0.3, 0.9, 0.35) * 0.8, crack * (1.0 - uHard) * 1.2);
    col = mix(col, crust, smoothstep(0.0, 1.0, uHard));
    float alpha = edge * (0.62 + 0.33 * h + spec * 0.3) * uFade;
    alpha = mix(alpha, edge * uFade * 0.92, uHard * 0.6);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
    #include <fog_fragment>
  }`;

function surfMaterial(shape) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uHard: { value: 0 }, uFade: { value: 1 }, uSeed: { value: Math.random() * 10 }, uFill: { value: 1 }, uShape: { value: shape },
      uPulse: { value: 0 }, uSag: { value: 0 }, uHalf: { value: new THREE.Vector2(1, 1) }, uOrigin: { value: new THREE.Vector2() },
    }]),
    vertexShader: surfVert, fragmentShader: surfFrag, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
}

// ---------------------------------------------------------------- the goo column shader
// An open tube of goo shooting up: streaks of thicker goo racing up it, a bright fresnel rim, wobbling and
// swelling (vertex), fading toward its ragged top.
const colVert = `
  uniform float uTime, uSeed, uWob;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    float a = atan(p.z, p.x);
    float w = 1.0 + uWob * (0.16 * sin(p.y * 9.0 - uTime * 22.0 + a * 3.0 + uSeed) + 0.1 * sin(p.y * 17.0 + uTime * 13.0 - a * 2.0));
    w *= mix(1.0, 0.55, p.y) + 0.5 * smoothstep(0.75, 1.0, p.y) * (1.0 - smoothstep(0.95, 1.0, p.y));
    p.xz *= w;
    vP = position;
    vN = normalize(mat3(modelMatrix) * vec3(p.x, 0.0, p.z));
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const colFrag = `
  uniform float uTime, uSeed, uFade;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    float a = atan(vP.z, vP.x);
    float s = noise(vec2(a * 2.5 + uSeed, vP.y * 5.0 - uTime * 9.0));
    float s2 = noise(vec2(a * 6.0 - uSeed, vP.y * 11.0 - uTime * 14.0));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(V, normalize(vN))), 2.0);
    vec3 lime = vec3(0.35, 1.0, 0.45);
    vec3 col = mix(vec3(0.02, 0.22, 0.06), lime * 1.05, s * 0.55 + fres * 0.55) + vec3(0.7, 1.0, 0.75) * pow(s2, 6.0) * 0.9;
    float top = 1.0 - smoothstep(0.82 + 0.12 * s2, 1.0, vP.y);
    float alpha = (0.3 + 0.4 * s + 0.35 * fres) * top * uFade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
  }`;

export class GooSystem {
  constructor(world) {
    this.world = world;
    this.patches = [];
    this.stickables = [];
    this.gaps = [];
    this.count = 0; // live patches (0: slowAt / patchAt return at once)
    this.t = 0;
    this.checkT = 0;
    this.wading = new Map(); // entity → { root, cool }
    const scene = world.scene;
    const hide = (o) => {
      o.visible = false;
      o.userData.noCull = true;
      o.userData.noBatch = true;
      scene.add(o);
      return o;
    };
    // ---- patches: pooled decals (a subdivided plane so a membrane can sag), hidden from the start so the
    // startup pass compiles the shader ----
    this.planeGeo = new THREE.PlaneGeometry(2, 2, 14, 14).rotateX(-Math.PI / 2);
    this.pool = [];
    for (let i = 0; i < MAX_PATCHES; i++) {
      const m = hide(new THREE.Mesh(this.planeGeo, surfMaterial(0)));
      m.renderOrder = 1;
      this.pool.push(m);
    }
    // ---- columns: a tube, a swollen crown of goo on top and a splash cup at the base ----
    const tube = new THREE.CylinderGeometry(1, 1, 1, 18, 10, true).translate(0, 0.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 2);
    this.columns = [];
    for (let i = 0; i < COLUMNS; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uSeed: { value: Math.random() * 10 }, uWob: { value: 1 }, uFade: { value: 1 } },
        vertexShader: colVert, fragmentShader: colFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const g = hide(new THREE.Group());
      const body = new THREE.Mesh(tube, mat);
      const crownMat = new THREE.MeshStandardMaterial({ color: 0x109a34, emissive: 0x18d050, emissiveIntensity: 0.5, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.8, depthWrite: false, envMapIntensity: 1.5 });
      const crown = new THREE.Mesh(crownGeo, crownMat);
      const cup = new THREE.Mesh(crownGeo, crownMat);
      g.add(body, crown, cup);
      this.columns.push({ g, body, crown, cup, mat, crownMat, t: 1, life: COLUMN_T, h: 1, r: 0.5, pos: new THREE.Vector3(), dropped: false });
    }
    this.colCursor = 0;
    // ---- clumps: gobs of goo clinging to stuck things ----
    const blobGeo = new THREE.IcosahedronGeometry(1, 2);
    this.clumps = [];
    for (let i = 0; i < CLUMPS; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x18c040, emissive: 0x1aff5a, emissiveIntensity: 0.8, roughness: 0.07, metalness: 0.1, transparent: true, opacity: 0.88, envMapIntensity: 1.4 });
      const g = hide(new THREE.Group());
      const blobs = [];
      for (let j = 0; j < BLOBS; j++) {
        const b = new THREE.Mesh(blobGeo, mat);
        g.add(b);
        blobs.push({ m: b, base: new THREE.Vector3(), s: 1, ph: Math.random() * 6.28 });
      }
      this.clumps.push({ g, mat, blobs, owner: null, t: 0, pop: 0, size: 1 });
    }
  }

  // ================================================================ splat (every green blast)
  splat(point, normal, radius, { air = false, charge = 0 } = {}) {
    const at = point.isVector3 ? point : v3(point);
    let claimed = false;
    // 1. stickables in reach
    for (const h of this.stickables) {
      const box = this.boxOf(h, _box);
      if (!box || box.isEmpty()) continue;
      if (box.distanceToPoint(at) <= radius * 0.7 + h.pad) {
        this.stick(h, at);
        if (box.distanceToPoint(at) < 0.6) claimed = true;
      }
    }
    // 2. goo gaps in reach
    for (const g of this.gaps) {
      if (g.box.distanceToPoint(at) <= radius * 0.8 + g.pad) {
        this.fill(g, at);
        if (g.box.distanceToPoint(at) < 0.5) claimed = true;
      }
    }
    // 3. a patch on the surface (static surfaces only: a decal left on a moving thing would hang in the air)
    if (!normal || air || claimed) return;
    const surf = _a.copy(at).addScaledVector(normal, -0.12);
    const under = this.world.pointInSolid(_b.copy(surf).addScaledVector(normal, -0.12));
    if (under && (!under.static || under.goo)) return;
    this.addPatch(surf, normal, radius * 0.5 * (1 + charge * 0.35));
  }

  // ================================================================ patches
  addPatch(pos, normal = UP, radius = 1.2, life = PATCH_LIFE) {
    const p0 = v3(pos), n = (normal.isVector3 ? normal.clone() : v3(normal)).normalize();
    const floor = n.y > 0.6;
    // splats landing on or beside one on the same surface feed it
    for (const p of this.patches) {
      if (p.n.dot(n) < 0.9) continue;
      _v.subVectors(p0, p.pos);
      const off = Math.abs(_v.dot(n));
      if (off > 0.25) continue;
      const along = Math.sqrt(Math.max(0, _v.lengthSq() - off * off));
      if (along > p.r * 0.8 + radius * 0.3) continue;
      const a1 = p.r * p.r, a2 = radius * radius * 0.7;
      const r = Math.min(floor ? PATCH_MAX : PATCH_MAX * 0.7, Math.sqrt(a1 + a2));
      p.pos.lerp(p0, a2 / (a1 + a2) * 0.5);
      p.r = floor ? this.capRadius(p.pos, r) : r;
      p.life = Math.max(p.life, life);
      p.max = Math.max(p.max, life);
      p.grow = Math.min(p.grow, 0.6);
      p.pulse = 1;
      this.place(p);
      return p;
    }
    let mesh = this.pool.find((m) => !m.userData.patch);
    if (!mesh) {
      // every decal in use: the driest one makes way
      let worst = null;
      for (const q of this.patches) if (!worst || q.life < worst.life) worst = q;
      if (!worst) return null;
      this.freePatch(worst);
      mesh = worst.mesh;
    }
    const p = { pos: p0, n, floor, r: floor ? this.capRadius(p0, radius) : radius, life, max: life, grow: 0, pulse: 1, mesh, spin: Math.random() * 6.28 };
    mesh.userData.patch = p;
    const u = mesh.material.uniforms;
    u.uSeed.value = Math.random() * 10;
    u.uShape.value = 0;
    u.uSag.value = 0;
    mesh.visible = true;
    mesh.quaternion.setFromUnitVectors(UP, n);
    mesh.quaternion.multiply(_q.setFromAxisAngle(UP, p.spin));
    this.patches.push(p);
    this.count = this.patches.length;
    this.place(p);
    return p;
  }

  // floor goo only spreads where there's floor: shrink it short of a drop-off or a wall
  capRadius(c, r) {
    const W = this.world;
    for (let k = 0; k < 3; k++) {
      let ok = true;
      for (let i = 0; i < 8 && ok; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        const x = c.x + Math.cos(a) * r * 0.75, z = c.z + Math.sin(a) * r * 0.75;
        const fl = W.pointInSolid(_b.set(x, c.y - 0.08, z));
        if (!fl || fl.hazard || W.pointInSolid(_b.set(x, c.y + 0.15, z))) ok = false;
      }
      if (ok) return r;
      r = Math.max(0.45, r * 0.72);
    }
    return r;
  }

  place(p) {
    const m = p.mesh;
    m.position.copy(p.pos).addScaledVector(p.n, 0.02);
    m.scale.set(p.r * 1.2, 1, p.r * 1.2);
    m.material.uniforms.uHalf.value.set(p.r * 1.2, p.r * 1.2);
  }

  freePatch(p) {
    const i = this.patches.indexOf(p);
    if (i >= 0) this.patches.splice(i, 1);
    p.mesh.userData.patch = null;
    p.mesh.visible = false;
    p.dead = true;
    this.count = this.patches.length;
  }

  patchAt(pos) {
    if (!this.count) return null;
    for (const p of this.patches) {
      if (!p.floor || pos.y < p.pos.y - 0.5 || pos.y > p.pos.y + 0.6) continue;
      const k = p.life < HARDEN ? 0.7 : 1; // (drying, it pulls in)
      if (Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) < p.r * 0.85 * k) return p;
    }
    return null;
  }

  slowAt(pos) {
    return this.patchAt(pos) ? SLOW : 1;
  }

  // ================================================================ stickables
  registerStickable(obj, { box = null, duration = STICK_TIME, onStick = null, onUnstick = null, freeze = true, pad = 0.35, parent = null } = {}) {
    const h = { obj, box, duration, onStick, onUnstick, freeze, pad, parent: parent ?? obj.mesh ?? obj.group ?? null, stuck: false, left: 0, clumps: [], tick: 0 };
    h.stick = (point = null) => this.stick(h, point);
    h.unstick = () => this.unstick(h);
    h.remove = () => {
      this.unstick(h);
      const i = this.stickables.indexOf(h);
      if (i >= 0) this.stickables.splice(i, 1);
    };
    if (freeze && typeof obj.update === 'function') {
      // while stuck its update is skipped and whatever it carries stops with it
      const update = obj.update;
      obj.update = function (dt, player) {
        if (h.stuck) {
          if (this.solid?.delta) this.solid.delta.set(0, 0, 0);
          if (Array.isArray(this.solids)) for (const s of this.solids) s.delta?.set(0, 0, 0);
          return;
        }
        return update.call(this, dt, player);
      };
    }
    obj.gooStuck = false;
    this.stickables.push(h);
    return h;
  }

  boxOf(h, out) {
    const b = h.box, o = h.obj;
    if (typeof b === 'function') return b(out);
    if (b?.min) return out.set(v3(b.min), v3(b.max));
    if (o.solid?.min) return out.set(o.solid.min, o.solid.max);
    if (Array.isArray(o.solids)) {
      out.makeEmpty();
      for (const s of o.solids) if (s.enabled !== false) out.union(_box2.set(s.min, s.max));
      return out;
    }
    const m = o.mesh || o.group;
    if (m) return out.setFromObject(m);
    return null;
  }

  stick(h, point = null) {
    const box = this.boxOf(h, _box);
    const first = !h.stuck;
    h.stuck = true;
    h.obj.gooStuck = true;
    h.left = h.duration;
    h.tick = 0;
    // a clump of goo where it hit (up to three on one thing)
    if (box && !box.isEmpty()) {
      const c = box.getCenter(_v);
      const p = point ? box.clampPoint(point, _a) : _a.copy(c).setY(box.max.y);
      // the face it's on: the axis the burst was furthest out along (or the nearest face from inside)
      const n = this.faceNormal(box, point || p, p, _n);
      const size = clamp(Math.min(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) * 0.3 + 0.25, 0.3, 0.75);
      if (h.clumps.length < 3) this.addClump(h, p, n, size);
      else for (const cl of h.clumps) cl.pop = 1;
      const fx = this.world.fx;
      for (let i = 0, k = fx.budget(14); i < k; i++) {
        _b.copy(n).multiplyScalar(rnd(1, 3)).add(_v.randomDirection().multiplyScalar(1.5));
        const j = fx.spawn(0, p, _b.x, _b.y, _b.z, GOO, 1.4, rnd(0.4, 0.8), rnd(0.04, 0.08));
        fx.grav[j] = 12;
      }
      fx.ring(_b.copy(p).addScaledVector(n, 0.03), n, 0x7dffa0, { size: 0.15, end: size * 2.6, life: 0.35, thick: 0.25, k: 1.6 });
    }
    const g = near(this.world, point || h.obj.pos || this.world.game.camera.position, 45);
    if (first) {
      if (!audio.sample(audio.sfxOr('goo_stick', 'slime_squelch'), { gain: 0.9 * g, rate: audio.available?.has('goo_stick') ? 1 : 0.6, vary: 0.05 })) audio.tone({ type: 'sine', f: 220, f2: 90, dur: 0.2, gain: 0.15 * g });
      audio.sample('slime_burble', { gain: 0.35 * g, rate: 1.2, vary: 0.1, cut: 0.6 });
    }
    if (first) h.onStick?.(h, point ? point.clone() : null);
  }

  faceNormal(box, from, p, out) {
    out.set(0, 0, 0);
    const dx = from.x < box.min.x ? box.min.x - from.x : from.x > box.max.x ? from.x - box.max.x : 0;
    const dy = from.y < box.min.y ? box.min.y - from.y : from.y > box.max.y ? from.y - box.max.y : 0;
    const dz = from.z < box.min.z ? box.min.z - from.z : from.z > box.max.z ? from.z - box.max.z : 0;
    if (dx || dy || dz) {
      if (dx >= dy && dx >= dz) out.x = from.x < box.min.x ? -1 : 1;
      else if (dy >= dz) out.y = from.y < box.min.y ? -1 : 1;
      else out.z = from.z < box.min.z ? -1 : 1;
      return out;
    }
    // inside: the nearest face
    const f = [[p.x - box.min.x, -1, 0, 0], [box.max.x - p.x, 1, 0, 0], [p.y - box.min.y, 0, -1, 0], [box.max.y - p.y, 0, 1, 0], [p.z - box.min.z, 0, 0, -1], [box.max.z - p.z, 0, 0, 1]];
    let best = f[3];
    for (const e of f) if (e[0] < best[0]) best = e;
    return out.set(best[1], best[2], best[3]);
  }

  addClump(h, p, n, size) {
    let cl = this.clumps.find((c) => !c.owner);
    if (!cl) return null;
    cl.owner = h;
    cl.t = 0;
    cl.pop = 1;
    cl.size = size;
    cl.dying = 0;
    const g = cl.g;
    this.world.scene.add(g);
    g.position.copy(p);
    g.quaternion.setFromUnitVectors(UP, n);
    g.scale.setScalar(1);
    // gobs splayed over the face, the biggest in the middle, a couple hanging off as drips
    cl.blobs.forEach((b, j) => {
      const a = (j / BLOBS) * Math.PI * 2 + Math.random();
      const r = j === 0 ? 0 : size * rnd(0.35, 0.8);
      b.base.set(Math.cos(a) * r, size * (j === 0 ? 0.18 : rnd(0.02, 0.12)), Math.sin(a) * r);
      b.s = size * (j === 0 ? 0.55 : rnd(0.22, 0.4));
      b.m.position.copy(b.base);
      b.m.scale.set(b.s, b.s * 0.6, b.s);
    });
    cl.mat.opacity = 0.88;
    g.visible = true;
    if (h.parent) h.parent.attach(g);
    h.clumps.push(cl);
    return cl;
  }

  unstick(h) {
    if (!h.stuck) return;
    h.stuck = false;
    h.obj.gooStuck = false;
    h.left = 0;
    const fx = this.world.fx;
    let at = null;
    for (const cl of h.clumps) {
      cl.g.getWorldPosition(_v);
      at = at || _v.clone();
      // pops off: a splash of droplets, then it shrinks away (update)
      for (let i = 0, k = fx.budget(10); i < k; i++) {
        _b.randomDirection().multiplyScalar(rnd(1, 3.5));
        const j = fx.spawn(0, _v, _b.x, _b.y + 1.5, _b.z, GOO_DARK, 1.8, rnd(0.5, 0.9), rnd(0.04, 0.08));
        fx.grav[j] = 14;
      }
      cl.dying = 0.001;
      this.world.scene.attach(cl.g);
    }
    h.clumps.length = 0;
    const g = near(this.world, at || this.world.game.camera.position, 45);
    if (!audio.sample(audio.sfxOr('goo_unstick', 'slime_squelch'), { gain: 0.8 * g, rate: audio.available?.has('goo_unstick') ? 1 : 1.35, vary: 0.05 })) audio.tone({ type: 'sine', f: 140, f2: 420, dur: 0.15, gain: 0.12 * g });
    h.onUnstick?.(h);
  }

  // ================================================================ gaps
  addGap(box, { duration = GAP_TIME, axis = 'y', thickness = 0.3, pad = 0.6, onFill = null, onClear = null } = {}) {
    const min = v3(box.min), max = v3(box.max);
    const b = new THREE.Box3(min, max);
    let smin, smax;
    if (axis === 'y') {
      smin = new THREE.Vector3(min.x, max.y - thickness, min.z);
      smax = max.clone();
    } else {
      smin = min.clone();
      smax = max.clone();
    }
    const solid = this.world.addSolid(smin, smax, { kind: 'goo', goo: true, static: false });
    solid.enabled = false;
    const mesh = new THREE.Mesh(this.planeGeo, surfMaterial(1));
    mesh.visible = false;
    mesh.renderOrder = 1;
    mesh.userData.noCull = true;
    mesh.userData.noBatch = true;
    const c = b.getCenter(new THREE.Vector3());
    const half = new THREE.Vector2();
    if (axis === 'y') {
      mesh.position.set(c.x, max.y + 0.01, c.z);
      half.set((max.x - min.x) / 2, (max.z - min.z) / 2);
    } else if (axis === 'x') {
      mesh.position.copy(c);
      mesh.quaternion.setFromUnitVectors(UP, new THREE.Vector3(1, 0, 0)); // local x → world -y, local z → z
      half.set((max.y - min.y) / 2, (max.z - min.z) / 2);
    } else {
      mesh.position.copy(c);
      mesh.quaternion.setFromUnitVectors(UP, new THREE.Vector3(0, 0, 1)); // local x → x, local z → -y
      half.set((max.x - min.x) / 2, (max.y - min.y) / 2);
    }
    mesh.scale.set(half.x, 1, half.y);
    mesh.material.uniforms.uHalf.value.copy(half);
    this.world.scene.add(mesh);
    const g = { box: b, axis, solid, mesh, half, pad, duration, onFill, onClear, filled: false, state: 'open', grow: 0, left: 0, sag: 0, sagV: 0 };
    g.fill = (point = null) => this.fill(g, point);
    g.clear = () => this.burstGap(g);
    g.remove = () => {
      this.burstGap(g, true);
      solid.enabled = false;
      const i = this.gaps.indexOf(g);
      if (i >= 0) this.gaps.splice(i, 1);
      mesh.removeFromParent();
    };
    this.gaps.push(g);
    return g;
  }

  // a glob flying into an open gap's mouth: where it crosses the membrane's plane (within its rectangle),
  // or null. { t, point, normal, gap }
  gapCatch(from, dir, far) {
    let best = null;
    for (const g of this.gaps) {
      if (g.state === 'set') continue; // (a set membrane is a solid: the glob's own ray finds it)
      const ax = g.axis, b = g.box;
      const plane = ax === 'y' ? b.max.y : (b.min[ax] + b.max[ax]) / 2;
      const d = dir[ax];
      if (Math.abs(d) < 1e-4) continue;
      const t = (plane - from[ax]) / d;
      if (t < 0 || t > far || (best && t > best.t)) continue;
      const p = _v.copy(from).addScaledVector(dir, t);
      const e = 0.05;
      if (ax !== 'x' && (p.x < b.min.x - e || p.x > b.max.x + e)) continue;
      if (ax !== 'y' && (p.y < b.min.y - e || p.y > b.max.y + e)) continue;
      if (ax !== 'z' && (p.z < b.min.z - e || p.z > b.max.z + e)) continue;
      const normal = new THREE.Vector3();
      normal[ax] = d > 0 ? -1 : 1;
      best = { t, point: p.clone(), normal, gap: g };
    }
    return best;
  }

  fill(g, point = null) {
    g.left = g.duration;
    if (g.state === 'set' || g.state === 'filling') {
      g.sagV += 1.5; // (re-gooed: it wobbles and its clock refills)
      g.mesh.material.uniforms.uPulse.value = 1;
      return;
    }
    g.state = 'filling';
    g.grow = 0;
    g.filled = true;
    // grows out from where it hit (in the membrane's own coordinates)
    const o = g.mesh.material.uniforms.uOrigin.value;
    if (point) {
      g.mesh.updateMatrixWorld();
      g.mesh.worldToLocal(_v.copy(point));
      o.set(clamp(_v.x, -1, 1) * g.half.x, clamp(_v.z, -1, 1) * g.half.y);
    } else o.set(0, 0);
    const u = g.mesh.material.uniforms;
    u.uFill.value = 0;
    u.uHard.value = 0;
    u.uFade.value = 1;
    u.uSeed.value = Math.random() * 10;
    g.mesh.visible = true;
    const p = point || g.mesh.position;
    const gain = near(this.world, p, 50);
    if (!audio.sample(audio.sfxOr('goo_bridge', 'slime_regrow'), { gain: 0.9 * gain, rate: audio.available?.has('goo_bridge') ? 1 : 1.25, vary: 0.05 })) audio.sample('slime_squelch', { gain: 0.8 * gain, rate: 0.7 });
    audio.sample('slime_burble', { gain: 0.4 * gain, rate: 0.9, vary: 0.1, cut: 0.8 });
    g.onFill?.(g, point ? point.clone() : null);
  }

  // a membrane's time is up (or clear()): it bursts and drops away
  burstGap(g, silent = false) {
    if (g.state === 'open') return;
    g.state = 'open';
    g.filled = false;
    g.solid.enabled = false;
    g.mesh.visible = false;
    g.left = 0;
    if (!silent) {
      const fx = this.world.fx, b = g.box;
      for (let i = 0, k = fx.budget(26); i < k; i++) {
        _v.set(rnd(b.min.x, b.max.x), g.axis === 'y' ? b.max.y : rnd(b.min.y, b.max.y), rnd(b.min.z, b.max.z));
        const j = fx.spawn(0, _v, rnd(-1, 1), rnd(-1, 2), rnd(-1, 1), i & 1 ? GOO_DARK : GOO, 1.4, rnd(0.6, 1.1), rnd(0.06, 0.12));
        fx.grav[j] = 14;
      }
      const gain = near(this.world, g.mesh.position, 50);
      if (!audio.sample(audio.sfxOr('goo_burst', 'glob_pop'), { gain: 0.8 * gain, rate: audio.available?.has('goo_burst') ? 1 : 0.6, vary: 0.05 })) audio.explode();
      audio.sample('slime_splat', { gain: 0.6 * gain, rate: 0.8 });
    }
    g.onClear?.(g);
  }

  // ================================================================ the goo column
  column(point, height, radius, charge = 0) {
    const c = this.columns[this.colCursor];
    this.colCursor = (this.colCursor + 1) % COLUMNS;
    c.pos.copy(point);
    c.h = height * (0.85 + charge * 0.1);
    c.r = radius * (0.2 + charge * 0.05);
    c.t = 0;
    c.dropped = false;
    c.g.position.copy(point);
    c.g.visible = true;
    c.mat.uniforms.uSeed.value = Math.random() * 10;
    c.g.rotation.y = Math.random() * 6.28;
    const g = near(this.world, point, 45);
    if (g > 0) audio.sample(audio.sfxOr('goo_column', 'slime_burble'), { gain: 0.7 * g, rate: audio.available?.has('goo_column') ? 1 : 1.6, vary: 0.1, cut: audio.available?.has('goo_column') ? 0 : 0.5 });
  }

  updateColumns(dt) {
    const fx = this.world.fx;
    for (const c of this.columns) {
      if (!c.g.visible) continue;
      c.t += dt;
      const u = c.t / COLUMN_T;
      if (u >= 1) {
        c.g.visible = false;
        continue;
      }
      // shoots up (0.14 s), hangs with a wobble, then slumps back down and thins
      const rise = Math.min(1, c.t / 0.14);
      const up = 1 - (1 - rise) ** 3;
      const fall = c.t > 0.3 ? ((c.t - 0.3) / (COLUMN_T - 0.3)) ** 1.6 : 0;
      const h = Math.max(0.05, c.h * up * (1 - fall * 0.92) * (1 + Math.sin(c.t * 30) * 0.04 * (1 - fall)));
      const r = c.r * (0.6 + 0.4 * up) * (1 - fall * 0.55);
      c.body.scale.set(r, h, r);
      c.mat.uniforms.uTime.value = this.t;
      c.mat.uniforms.uFade.value = 1 - fall * 0.9;
      c.mat.uniforms.uWob.value = 1 + fall;
      // the crown: a swollen gob riding the top, then falling off it
      const cs = r * (1.35 - fall * 0.6);
      c.crown.position.y = h;
      c.crown.scale.set(cs, cs * (1.1 + Math.sin(c.t * 26) * 0.15), cs);
      c.cup.position.y = r * 0.25;
      const cupS = r * (1.6 + up * 0.8) * (1 - fall * 0.7);
      c.cup.scale.set(cupS * 1.4, cupS * 0.35, cupS * 1.4);
      c.crownMat.opacity = 0.85 * (1 - fall);
      c.crownMat.emissiveIntensity = 0.45 + (1 - rise) * 0.9;
      // at the top of the rise it throws droplets off its crown, and splashes round its foot
      if (!c.dropped && rise >= 1) {
        c.dropped = true;
        _a.copy(c.pos).setY(c.pos.y + h);
        for (let i = 0, k = fx.budget(22); i < k; i++) {
          _v.randomDirection();
          const j = fx.spawn(0, _a, _v.x * rnd(1.5, 4), rnd(1, 5), _v.z * rnd(1.5, 4), GOO, rnd(1.2, 1.7), rnd(0.6, 1.1), rnd(0.05, 0.11));
          fx.grav[j] = 15;
          fx.endColor(j, GOO_DARK, 1.2);
        }
        fx.ring(_a, UP, 0xbfffcf, { size: 0.2, end: c.r * 4, life: 0.3, thick: 0.2, k: 1.5 });
        fx.ring(_b.copy(c.pos).setY(c.pos.y + 0.05), UP, 0x7dffa0, { size: 0.3, end: c.r * 5, life: 0.45, thick: 0.15, k: 1.4 });
      }
      // goo sheeting off its sides as it slumps
      if (fall > 0 && Math.random() < dt * 40) {
        const a = Math.random() * 6.28, y = Math.random() * h;
        _v.set(c.pos.x + Math.cos(a) * r, c.pos.y + y, c.pos.z + Math.sin(a) * r);
        const j = fx.spawn(0, _v, Math.cos(a) * 1.2, rnd(-0.5, 0.5), Math.sin(a) * 1.2, GOO, 1.3, rnd(0.4, 0.7), rnd(0.04, 0.08));
        fx.grav[j] = 14;
      }
    }
  }

  // ================================================================ per frame
  clear() {
    for (const p of [...this.patches]) this.freePatch(p);
    for (const h of this.stickables) if (h.stuck) this.unstick(h);
    for (const g of this.gaps) this.burstGap(g, true);
    for (const cl of this.clumps) {
      cl.owner = null;
      cl.dying = 0;
      cl.g.visible = false;
    }
    for (const c of this.columns) c.g.visible = false;
    for (const [e, w] of this.wading) if (w.on) e.gooSlow = 1;
    this.wading.clear();
  }

  update(dt, player) {
    this.t += dt;
    this.updateColumns(dt);
    // ---- patches: grow in, age, harden, shrink away ----
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const p = this.patches[i];
      if (p.life !== Infinity) p.life -= dt;
      if (p.life <= 0) {
        this.freePatch(p);
        continue;
      }
      p.grow = Math.min(1, p.grow + dt / 0.18);
      p.pulse = Math.max(0, p.pulse - dt * 2.5);
      const u = p.mesh.material.uniforms;
      u.uTime.value = this.t;
      u.uFill.value = 1 - (1 - p.grow) ** 3;
      const hard = p.life < HARDEN ? 1 - p.life / HARDEN : 0;
      u.uHard.value = hard;
      u.uFade.value = p.life < 0.6 ? p.life / 0.6 : 1;
      u.uPulse.value = p.pulse * 0.8;
      // drips falling off goo on walls and ceilings
      if (!p.floor && hard < 0.7 && Math.random() < dt * (p.n.y < -0.5 ? 3 : 1.2) * p.r) {
        _v.copy(p.pos).addScaledVector(p.n, 0.05);
        _v.y -= p.n.y < -0.5 ? 0 : p.r * 0.5;
        const j = this.world.fx.spawn(0, _v, 0, -0.2, 0, GOO, 1.2, 1.0, rnd(0.04, 0.07));
        this.world.fx.grav[j] = 9;
      }
    }
    // ---- stickables: their clocks; gobs pulse faster as it runs out ----
    for (const h of this.stickables) {
      if (!h.stuck) continue;
      h.left -= dt;
      if (h.left <= 1.5) {
        const was = h.tick;
        h.tick = Math.ceil(h.left / 0.5);
        if (h.tick !== was && h.left > 0) {
          const g = near(this.world, h.clumps[0]?.g.getWorldPosition(_v) || this.world.game.camera.position, 30);
          if (g > 0.05) audio.sample('timer_tick', { gain: 0.35 * g, rate: 1.3 + (3 - h.tick) * 0.12, vary: 0 });
        }
      }
      if (h.left <= 0) this.unstick(h);
    }
    for (const cl of this.clumps) {
      if (!cl.owner && !cl.dying) continue;
      cl.t += dt;
      cl.pop = Math.max(0, cl.pop - dt * 4);
      if (cl.dying) {
        cl.dying += dt;
        const k = 1 - cl.dying / 0.3;
        if (k <= 0) {
          cl.dying = 0;
          cl.owner = null;
          cl.g.visible = false;
          continue;
        }
        cl.g.scale.setScalar(k);
        cl.mat.opacity = 0.88 * k;
        continue;
      }
      const h = cl.owner, left = h.left;
      // the clock: a slow throb when fresh, a frantic blink at the end; drying, it darkens and sags
      const rate = left > 2 ? 3 : left > 1 ? 7 : 14;
      const beat = 0.5 + 0.5 * Math.sin(cl.t * rate);
      const dry = left < 1.5 ? 1 - left / 1.5 : 0;
      cl.mat.emissiveIntensity = (0.55 + beat * 0.6) * (1 - dry * 0.6) + cl.pop * 1.5;
      cl.mat.color.setRGB(0.09 - dry * 0.04, 0.75 - dry * 0.4, 0.25 - dry * 0.12);
      for (const b of cl.blobs) {
        const w = Math.sin(cl.t * 5 + b.ph) * 0.08;
        const s = b.s * (1 + cl.pop * 0.35);
        b.m.scale.set(s * (1 + w), s * (0.6 - w + dry * 0.2), s * (1 + w));
        b.m.position.copy(b.base);
        b.m.position.y -= dry * b.s * 0.3;
      }
      if (Math.random() < dt * 2.5) {
        cl.g.getWorldPosition(_v);
        const j = this.world.fx.spawn(0, _v, rnd(-0.2, 0.2), -0.5, rnd(-0.2, 0.2), GOO, 1.2, 0.9, rnd(0.03, 0.06));
        this.world.fx.grav[j] = 10;
      }
    }
    // ---- gaps: grow across, sag, harden, burst ----
    for (const g of this.gaps) {
      if (g.state === 'open') continue;
      const u = g.mesh.material.uniforms;
      u.uTime.value = this.t;
      u.uPulse.value = Math.max(0, u.uPulse.value - dt * 2);
      if (g.state === 'filling') {
        g.grow = Math.min(1, g.grow + dt / GAP_FILL);
        u.uFill.value = 1 - (1 - g.grow) ** 2;
        // firm once it's mostly across, and never round the player (who'd be trapped inside it)
        if (g.grow >= 0.6 && !this.overlapsPlayer(player, g.solid)) {
          g.state = 'set';
          g.solid.enabled = true;
        }
      }
      g.left -= dt;
      const hard = g.left < GAP_HARDEN ? 1 - Math.max(0, g.left) / GAP_HARDEN : 0;
      u.uHard.value = hard;
      // it sags under you (a spring), and quivers when it's freshly gooed
      if (g.axis === 'y') {
        const on = g.state === 'set' && player && !player.dead && player.grounded && player.ground === g.solid;
        g.sagV += ((on ? 0.12 : 0.03) - g.sag) * 120 * dt - g.sagV * 9 * dt;
        g.sag += g.sagV * dt;
        u.uSag.value = g.sag * (1 - hard * 0.8);
      }
      if (hard > 0.6 && Math.random() < dt * 8) {
        const b = g.box;
        _v.set(rnd(b.min.x, b.max.x), g.axis === 'y' ? b.max.y - 0.1 : rnd(b.min.y, b.max.y), rnd(b.min.z, b.max.z));
        const j = this.world.fx.spawn(0, _v, 0, -0.5, 0, GOO_DARK, 1.4, 0.8, rnd(0.04, 0.07));
        this.world.fx.grav[j] = 12;
      }
      if (g.left <= 0) this.burstGap(g);
    }
    // ---- who's wading in floor goo ----
    this.checkT -= dt;
    if (this.checkT > 0) return;
    const step = CHECK_EVERY - this.checkT;
    this.checkT = CHECK_EVERY;
    for (const [e, w] of this.wading) {
      w.cool = Math.max(0, w.cool - step);
      w.root = Math.max(0, w.root - step);
    }
    if (!this.count && !this.wading.size) return;
    for (const e of this.world.entities) {
      if (e.flier || e.dead || !e.pos?.isVector3 || typeof e.onHit !== 'function' || typeof e.hp !== 'number' || typeof e.update !== 'function') continue;
      const footY = typeof e.floorY === 'number' ? e.floorY : typeof e.groundY === 'number' ? e.groundY : e.pos.y;
      const inGoo = this.count ? !!this.patchAt(_v.set(e.pos.x, footY, e.pos.z)) : false;
      let w = this.wading.get(e);
      if (!inGoo) {
        if (w?.on) {
          w.on = false;
          e.gooSlow = 1;
        }
        if (w && !w.cool && !w.on) this.wading.delete(e);
        continue;
      }
      if (!w) {
        w = { on: false, root: 0, cool: 0 };
        this.wading.set(e, w);
        wrapForGoo(e);
      }
      if (!w.on) {
        w.on = true;
        if (!w.cool) {
          // stepping in: stuck fast for a moment, with a wet slap
          w.root = ROOT_T;
          w.cool = ROOT_COOL;
          const fx = this.world.fx;
          fx.ring(_a.set(e.pos.x, footY + 0.05, e.pos.z), UP, 0x7dffa0, { size: 0.3, end: 1.4, life: 0.35, thick: 0.2, k: 1.4 });
          const g = near(this.world, e.pos, 30);
          if (g > 0.05) audio.sample('slime_squelch', { gain: 0.6 * g, rate: 0.8, vary: 0.1 });
        }
      }
      e.gooSlow = w.root > 0 ? ROOT : SLOW;
      // goo strung off it as it wades
      if (Math.random() < 0.5) {
        const j = this.world.fx.spawn(0, _a.set(e.pos.x + rnd(-0.3, 0.3), footY + rnd(0.1, 0.6), e.pos.z + rnd(-0.3, 0.3)), 0, 0.4, 0, GOO, 1.2, 0.6, rnd(0.04, 0.07));
        this.world.fx.grav[j] = 6;
      }
    }
  }

  overlapsPlayer(player, s) {
    if (!player || player.dead) return false;
    const b = player.bounds();
    return b.min.x < s.max.x && b.max.x > s.min.x && b.min.y < s.max.y - 0.02 && b.max.y > s.min.y && b.min.z < s.max.z && b.max.z > s.min.z;
  }
}

// An enemy wading in goo runs its whole frame at e.gooSlow × speed: its update is wrapped (once) to scale dt.
function wrapForGoo(e) {
  if (e.gooWrapped) return;
  e.gooWrapped = true;
  e.gooSlow = 1;
  const update = e.update;
  e.update = function (dt, player) {
    return update.call(this, dt * (this.gooSlow ?? 1), player);
  };
}

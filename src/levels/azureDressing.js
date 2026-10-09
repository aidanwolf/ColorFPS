// AZURE — set dressing: the look of a drowned research station and its water engine, laid over the
// gameplay geometry of azure.js / azureFlooded.js / azureSpillway.js without touching any of it (nothing
// here is solid unless it says so, and nothing stands on a route).
//   · wet metal pipe runs with flanges, glowing bands and valve wheels; hanging cables
//   · bulkhead frames, stencilled signage (one canvas atlas, one draw per cluster)
//   · windows and portholes onto the dark sea: deep gradients, drifting specks, slow bioluminescent shapes
//   · caustic light on walls and ceilings by the water, cold mist on the surfaces, water pouring from
//     outlets (with splashes), light shafts, drips
//   · machine-hall pieces: pump housings, sluice gates; Cryo sleeper tanks with silhouettes inside
//   · the chasm: plankton drifting in the abyss, great jellies pulsing far below, waterfalls from
//     broken mains on the cliffs, conduits down the cliff faces
// All static pieces are merged per material per ~60 m cluster (so distance culling still works); the
// animated surfaces share a handful of shader materials driven by one clock. dress.dimOnShutdown() is
// called by the aftermath (azureSpillway.js): the glow bands sink and the pours stop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UPV = V(0, 1, 0);
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = V(1, 1, 1), _a = V(0, 0, 0), _b = V(0, 0, 0);

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a normal given as '+x' / '-z' / [x, y, z]
const nrm = (n) => (Array.isArray(n) ? V(...n).normalize() : { '+x': V(1, 0, 0), '-x': V(-1, 0, 0), '+z': V(0, 0, 1), '-z': V(0, 0, -1), up: V(0, 1, 0), down: V(0, -1, 0) }[n]);

// orient a geometry built facing +z (planes) so it faces n, then move it to p
function place(g, p, n, up = null) {
  const zf = n.clone().normalize();
  const u = up ? up.clone() : Math.abs(zf.y) > 0.9 ? V(0, 0, -1) : UPV.clone();
  const xf = V().crossVectors(u, zf).normalize();
  const yf = V().crossVectors(zf, xf);
  _m.makeBasis(xf, yf, zf).setPosition(p);
  return g.applyMatrix4(_m);
}

// ---------------------------------------------------------------- shaders
const COMMON_V = `
  attribute vec2 auv;
  attribute float aseed;
  varying vec2 vUv;
  varying float vSeed;
  varying vec3 vW;
  varying float vDist;
  void main() {
    vUv = auv; vSeed = aseed;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vDist = distance(cameraPosition, w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const HASH = `
  float h1(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h1(i), h1(i + vec2(1,0)), f.x), mix(h1(i + vec2(0,1)), h1(i + vec2(1,1)), f.x), f.y); }`;
const shaders = {
  // light dancing on surfaces near water (auv in metres along the surface)
  caustic: `
    uniform float uTime, uPower;
    varying vec2 vUv; varying float vSeed; varying vec3 vW; varying float vDist;
    float caus(vec2 uv, float t) {
      vec2 p = mod(uv * 6.2831, 6.2831) - 250.0;
      vec2 i = p; float c = 1.0; float inten = 0.005;
      for (int n = 0; n < 4; n++) {
        float tt = t * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
      }
      c /= 4.0; c = 1.17 - pow(c, 1.4);
      return pow(abs(c), 7.0);
    }
    void main() {
      float c = caus(vUv * 0.16 + vSeed, uTime * 0.45 + vSeed * 3.0);
      float fade = 1.0 - smoothstep(25.0, 60.0, vDist);
      gl_FragColor = vec4(vec3(0.35, 0.8, 1.0) * c * 0.4 * uPower * fade, 1.0);
    }`,
  // a window onto the dark sea: auv 0..1 across the pane
  ocean: `
    uniform float uTime;
    varying vec2 vUv; varying float vSeed; varying vec3 vW; varying float vDist;
    ${HASH}
    void main() {
      vec2 uv = vUv;
      vec3 col = mix(vec3(0.0, 0.006, 0.02), vec3(0.01, 0.06, 0.13), smoothstep(0.0, 1.0, uv.y));
      // god rays from far above
      col += vec3(0.02, 0.07, 0.12) * pow(max(0.0, sin(uv.x * 9.0 + vSeed * 4.0 + uv.y * 2.0 + uTime * 0.07)), 6.0) * uv.y;
      // drifting specks (marine snow), in three depths
      for (int k = 0; k < 3; k++) {
        float s = 9.0 + float(k) * 7.0;
        vec2 g = uv * vec2(s * 1.6, s) + vec2(vSeed * 13.0 + float(k) * 5.0, uTime * (0.05 + 0.03 * float(k)));
        vec2 id = floor(g), f = fract(g) - 0.5;
        float r = h1(id + float(k));
        vec2 o = vec2(r - 0.5, h1(id + 7.0) - 0.5) * 0.6;
        float d = length(f - o);
        float tw = 0.5 + 0.5 * sin(uTime * (1.0 + r * 2.0) + r * 30.0);
        col += vec3(0.5, 0.85, 1.0) * smoothstep(0.06, 0.0, d) * step(0.72, r) * tw * (0.25 + 0.2 * float(k));
      }
      // two slow bioluminescent shapes far out
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        vec2 c = vec2(fract(uTime * (0.006 + 0.004 * fk) + vSeed * (0.37 + fk * 0.21)) * 1.6 - 0.3, 0.35 + 0.3 * sin(uTime * 0.05 + fk * 2.0 + vSeed));
        float d = length((uv - c) * vec2(1.6, 1.0));
        float pulse = 0.6 + 0.4 * sin(uTime * (0.8 + fk * 0.5) + vSeed * 9.0);
        col += mix(vec3(0.1, 0.9, 1.0), vec3(0.6, 0.4, 1.0), fk) * (0.05 / (d * d * 40.0 + 0.4)) * pulse * 0.6;
      }
      // the glass: a cold rim and a faint reflection streak
      float rim = smoothstep(0.08, 0.0, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
      col += vec3(0.25, 0.5, 0.7) * rim * 0.25 + vec3(0.06, 0.1, 0.14) * smoothstep(0.02, 0.0, abs(uv.x - uv.y * 0.6 - 0.25));
      gl_FragColor = vec4(col, 1.0);
    }`,
  // cold mist over water: auv in metres
  mist: `
    uniform float uTime, uPower;
    varying vec2 vUv; varying float vSeed; varying vec3 vW; varying float vDist;
    ${HASH}
    void main() {
      vec2 p = vW.xz * 0.18;
      float n = vn(p + vec2(uTime * 0.05, uTime * 0.03)) * 0.6 + vn(p * 2.3 - vec2(uTime * 0.07, 0.0)) * 0.4;
      float near = smoothstep(1.0, 5.0, vDist) * (1.0 - smoothstep(30.0, 55.0, vDist));
      gl_FragColor = vec4(vec3(0.6, 0.8, 0.95) * pow(n, 2.5) * 0.16 * near * uPower, 1.0);
    }`,
  // falling water: auv.x 0..1 across, auv.y metres down from the lip
  pour: `
    uniform float uTime, uPower;
    varying vec2 vUv; varying float vSeed; varying vec3 vW; varying float vDist;
    ${HASH}
    void main() {
      float x = vUv.x, y = vUv.y;
      float streak = vn(vec2(x * 14.0 + vSeed, y * 0.35 - uTime * 3.2)) * 0.7 + vn(vec2(x * 30.0, y * 0.9 - uTime * 5.0)) * 0.5;
      float side = smoothstep(0.0, 0.25, x) * smoothstep(1.0, 0.75, x);
      float a = pow(streak, 1.6) * side * (0.55 + 0.45 * smoothstep(0.0, 1.5, y));
      gl_FragColor = vec4(vec3(0.55, 0.85, 1.0) * a * 0.75 * uPower, 1.0);
    }`,
  // a soft cone of light falling from an opening (auv.y 0 at the top)
  shaft: `
    uniform float uTime;
    varying vec2 vUv; varying float vSeed; varying vec3 vW; varying float vDist;
    void main() {
      float fade = 1.0 - smoothstep(0.0, 1.0, vUv.y);
      float near = smoothstep(2.0, 8.0, vDist);
      float shimmer = 0.75 + 0.25 * sin(uTime * 0.8 + vUv.x * 30.0 + vSeed);
      gl_FragColor = vec4(vec3(0.45, 0.8, 1.0) * fade * near * shimmer * 0.09, 1.0);
    }`,
};
const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide };

// ---------------------------------------------------------------- the signage atlas
const SIGNS = [
  'AZURE STATION', 'DECK 01  RIM', 'PUMP STATION 2', 'TURBINE 4', 'CRYO 3  SLEEPER STORAGE', 'RECORDS', 'BRINE WELL',
  'VAULT', 'CORE SANCTUM', 'DECK 07  UNDERCROFT', 'UNDERCROFT  CISTERN 1', 'DUCT  >', 'SLUICE 2', 'LOCK 1', 'LOCK 2',
  'ENGINE  >', '<  SPILLWAY', 'PRESSURE LOCK', 'EMERGENCY PADS', 'NO SWIMMING', 'DANGER  COLD BRINE', 'KEEP CLEAR', 'B-7', 'CRANE 2',
  'BRINE WELL  >', 'BREAKER HALL', 'DANGER  LIVE WATER', 'STORM DECK 3', 'DANGER  HIGH VOLTAGE', 'WINCH  DUCT GATE', 'MAINTENANCE SEAL',
];
let atlas = null;
function signAtlas() {
  if (atlas) return atlas;
  const W = 1024, H = 2048, rowH = 40, c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.font = 'bold 30px "Courier New", monospace';
  const rows = {};
  SIGNS.forEach((t, i) => {
    const y = i * rowH;
    // stencil look: wide letter spacing and a gap through each glyph
    let x = 8;
    for (const ch of t) {
      g.fillText(ch, x, y + rowH / 2);
      x += g.measureText(ch).width + 5;
    }
    g.clearRect(0, y + rowH / 2 - 1, x, 2);
    rows[t] = { v0: 1 - (y + rowH) / H, v1: 1 - y / H, u1: x / W, aspect: x / rowH };
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  atlas = { tex, rows };
  return atlas;
}

export function makeDressing(B, { zone }) {
  const { W, game, level } = B;
  const rng = mulberry32(0xd7e55);
  const time = { value: 0 };
  const power = { value: 1 };
  // ---- materials
  const M = {
    metal: new THREE.MeshStandardMaterial({ color: 0x33475c, metalness: 0.88, roughness: 0.24, envMapIntensity: 1.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b1118, metalness: 0.5, roughness: 0.55 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x5a2a1e, metalness: 0.7, roughness: 0.45 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5fd6ff).multiplyScalar(1.7) }),
    frost: new THREE.MeshStandardMaterial({ color: 0xd6ecff, metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.26, depthWrite: false, emissive: 0x0d2e4a, emissiveIntensity: 0.8 }),
    tankGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3a9fd8).multiplyScalar(0.55), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x020a12 }),
    puddle: new THREE.MeshStandardMaterial({ color: 0x04070b, metalness: 1, roughness: 0.04, envMapIntensity: 2 }),
    sign: new THREE.MeshBasicMaterial({ map: signAtlas().tex, color: new THREE.Color(0xcfe6ff).multiplyScalar(0.9), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  M.frost.renderOrder = 2;
  const S = {};
  for (const k of Object.keys(shaders)) {
    S[k] = new THREE.ShaderMaterial({ uniforms: { uTime: time, uPower: power }, vertexShader: COMMON_V, fragmentShader: shaders[k], ...(k === 'ocean' ? { side: THREE.DoubleSide } : additive) });
  }
  // ---- geometry buckets: material key → cluster key → [geometries]
  const buckets = new Map();
  const put = (key, g, at) => {
    const ck = Math.floor(at.x / 60) + ':' + Math.floor(at.y / 40) + ':' + Math.floor(at.z / 60);
    if (!buckets.has(key)) buckets.set(key, new Map());
    const b = buckets.get(key);
    if (!b.has(ck)) b.set(ck, []);
    // every geometry gets the shader attributes so any bucket can merge
    const n = g.attributes.position.count;
    if (!g.attributes.auv) g.setAttribute('auv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.aseed) g.setAttribute('aseed', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'auv', 'aseed'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    b.get(ck).push(g);
    return g;
  };
  const setAttr = (g, name, fn, size) => {
    const pos = g.attributes.position, arr = new Float32Array(pos.count * size);
    for (let i = 0; i < pos.count; i++) {
      const r = fn(i, pos.getX(i), pos.getY(i), pos.getZ(i));
      if (size === 1) arr[i] = r;
      else for (let k = 0; k < size; k++) arr[i * size + k] = r[k];
    }
    g.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
    return g;
  };

  // ---------------------------------------------------------------- pieces
  // a cylinder from a to b (radius r) into bucket `key`
  function rod(a, b, r, key = 'metal', seg = 10) {
    const d = V().subVectors(b, a), len = d.length();
    if (len < 1e-3) return;
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
    _q.setFromUnitVectors(UPV, d.normalize());
    g.applyMatrix4(_m.compose(V().addVectors(a, b).multiplyScalar(0.5), _q, _s));
    put(key, g, a);
  }
  // a pipe run through points [x, y, z] (radius r), elbows at the bends, flanges every `flange` m, a
  // glowing band every `band` m (0: none)
  function pipe(points, { r = 0.22, flange = 3, band = 0, key = 'metal' } = {}) {
    const P = points.map((p) => V(...p));
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], d = V().subVectors(b, a), len = d.length();
      rod(a, b, r, key);
      d.normalize();
      _q.setFromUnitVectors(UPV, d);
      for (let s = flange * 0.5; flange > 0 && s < len; s += flange) {
        const g = new THREE.CylinderGeometry(r * 1.38, r * 1.38, 0.14, 12);
        g.applyMatrix4(_m.compose(V().copy(a).addScaledVector(d, s), _q, _s));
        put('metal', g, a);
      }
      for (let s = band * 0.5; band > 0 && s < len; s += band) {
        const g = new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.07, 12);
        g.applyMatrix4(_m.compose(V().copy(a).addScaledVector(d, s), _q, _s));
        put('glow', g, a);
      }
      if (i > 0) put('metal', new THREE.SphereGeometry(r * 1.12, 10, 8).translate(a.x, a.y, a.z), a);
    }
  }
  // a valve wheel facing n at p
  function valve(p, n, r = 0.42, key = 'rust') {
    const P = V(...p), N = nrm(n);
    const g = [new THREE.TorusGeometry(r, 0.05, 6, 18)];
    for (let k = 0; k < 3; k++) g.push(new THREE.BoxGeometry(r * 2, 0.06, 0.05).rotateZ((k * Math.PI) / 3));
    g.push(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8).rotateX(Math.PI / 2));
    for (const x of g) put(key, place(x, P, N), P);
    put('glow', place(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 6).rotateX(Math.PI / 2), P, N), P);
  }
  // a sagging cable from a to b
  function cable(a, b, sag = 1.2, r = 0.035) {
    const A = V(...a), Bv = V(...b), mid = V().addVectors(A, Bv).multiplyScalar(0.5);
    mid.y -= sag;
    const c = new THREE.QuadraticBezierCurve3(A, mid, Bv);
    put('dark', new THREE.TubeGeometry(c, 12, r, 4), A);
  }
  // a framed window onto the dark sea on a wall: center p, facing n (out of the wall), w x h
  function window_(p, n, w, h, { mullions = true } = {}) {
    const P = V(...p), N = nrm(n), seed = rng() * 10;
    const pane = place(new THREE.PlaneGeometry(w, h), P.clone().addScaledVector(N, 0.02), N);
    setAttr(pane, 'auv', (i) => [i % 2 ? 1 : 0, i < 2 ? 1 : 0], 2);
    setAttr(pane, 'aseed', () => seed, 1);
    put('ocean', pane, P);
    const f = 0.18, d = 0.22;
    for (const [x, y, sx, sy] of [[0, h / 2 + f / 2, w + 2 * f, f], [0, -h / 2 - f / 2, w + 2 * f, f], [-w / 2 - f / 2, 0, f, h], [w / 2 + f / 2, 0, f, h]]) {
      put('metal', place(new THREE.BoxGeometry(sx, sy, d).translate(x, y, d / 2), P, N), P);
    }
    if (mullions) for (let k = 1; k < Math.round(w / 1.6); k++) put('metal', place(new THREE.BoxGeometry(0.08, h, 0.08).translate(-w / 2 + (k * w) / Math.round(w / 1.6), 0, 0.06), P, N), P);
    put('glow', place(new THREE.BoxGeometry(w + 2 * f, 0.04, 0.05).translate(0, -h / 2 - f - 0.03, d), P, N), P);
  }
  function porthole(p, n, r = 0.6) {
    const P = V(...p), N = nrm(n), seed = rng() * 10;
    const disc = place(new THREE.CircleGeometry(r, 20), P.clone().addScaledVector(N, 0.02), N);
    const pos = disc.attributes.position;
    // auv from the disc's own layout (before placing): recompute from local offsets
    setAttr(disc, 'auv', (i, x, y, z) => {
      const o = V(x, y, z).sub(P);
      const xf = V().crossVectors(Math.abs(N.y) > 0.9 ? V(0, 0, -1) : UPV, N).normalize(), yf = V().crossVectors(N, xf);
      return [0.5 + o.dot(xf) / (2 * r), 0.5 + o.dot(yf) / (2 * r)];
    }, 2);
    void pos;
    setAttr(disc, 'aseed', () => seed, 1);
    put('ocean', disc, P);
    put('metal', place(new THREE.TorusGeometry(r + 0.06, 0.1, 6, 20), P.clone().addScaledVector(N, 0.06), N), P);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      put('metal', place(new THREE.SphereGeometry(0.05, 5, 4).translate(Math.cos(a) * (r + 0.06), Math.sin(a) * (r + 0.06), 0.14), P, N), P);
    }
  }
  // a stencilled sign (text from SIGNS) at p facing n, h tall
  function sign(text, p, n, h = 0.45, tint = null) {
    const row = signAtlas().rows[text];
    if (!row) return;
    const P = V(...p), N = nrm(n), w = h * row.aspect;
    const g = place(new THREE.PlaneGeometry(w, h), P.clone().addScaledVector(N, 0.03), N);
    const uv = g.attributes.uv;
    for (let i = 0; i < 4; i++) uv.setXY(i, i % 2 ? row.u1 : 0, i < 2 ? row.v1 : row.v0);
    put(tint === 'hazard' ? 'signHaz' : 'sign', g, P);
    // a backing plate
    put('dark', place(new THREE.BoxGeometry(w + 0.25, h + 0.16, 0.04), P.clone().addScaledVector(N, 0.01), N), P);
  }
  // caustic light on a surface: center p, facing n, w x h (m)
  function caustic(p, n, w, h, seed = rng() * 7) {
    const P = V(...p), N = nrm(n);
    const g = place(new THREE.PlaneGeometry(w, h, 1, 1), P.clone().addScaledVector(N, 0.03), N);
    setAttr(g, 'auv', (i) => [(i % 2 ? 0.5 : -0.5) * w, (i < 2 ? 0.5 : -0.5) * h], 2);
    setAttr(g, 'aseed', () => Math.floor(seed), 1);
    put('caustic', g, P);
  }
  // caustics round the walls of a box room in a band of y (inner faces), and optionally on its ceiling
  function causticRoom(x1, z1, x2, z2, y1, y2, ceiling = null) {
    const cy = (y1 + y2) / 2, h = y2 - y1;
    caustic([(x1 + x2) / 2, cy, z1], '+z', x2 - x1, h);
    caustic([(x1 + x2) / 2, cy, z2], '-z', x2 - x1, h);
    caustic([x1, cy, (z1 + z2) / 2], '+x', z2 - z1, h);
    caustic([x2, cy, (z1 + z2) / 2], '-x', z2 - z1, h);
    if (ceiling !== null) caustic([(x1 + x2) / 2, ceiling, (z1 + z2) / 2], 'down', x2 - x1, z2 - z1);
  }
  // cold mist hanging over a water surface
  function mist(x1, z1, x2, z2, y, layers = [0.25, 0.9]) {
    for (const dy of layers) {
      const g = new THREE.PlaneGeometry(x2 - x1, z2 - z1).rotateX(-Math.PI / 2).translate((x1 + x2) / 2, y + dy, (z1 + z2) / 2);
      put('mist', g, V((x1 + x2) / 2, y, (z1 + z2) / 2));
    }
  }
  // water pouring from a lip at p (center), falling to y, w wide, facing n (the side you see it from)
  const pours = [];
  function pour(p, y, w, n, { splash = true, mistAt = true } = {}) {
    const P = V(...p), N = nrm(n), h = P.y - y;
    const g = place(new THREE.PlaneGeometry(w, h), V(P.x, (P.y + y) / 2, P.z), N);
    setAttr(g, 'auv', (i) => [i % 2 ? 1 : 0, i < 2 ? 0 : h], 2);
    setAttr(g, 'aseed', () => rng() * 10, 1);
    put('pour', g, P);
    // a lip
    put('metal', place(new THREE.BoxGeometry(w + 0.3, 0.25, 0.6), P.clone().addScaledVector(N, -0.2), N), P);
    const rec = { at: V(P.x, y, P.z).addScaledVector(N, 0.2), w, t: rng(), splash, on: true };
    pours.push(rec);
    if (mistAt) mist(P.x - w, P.z - w, P.x + w, P.z + w, y);
    return rec;
  }
  function shaft(x, yTop, z, len, r0, r1) {
    const g = new THREE.CylinderGeometry(r0, r1, len, 16, 1, true).translate(x, yTop - len / 2, z);
    setAttr(g, 'auv', (i, px, py, pz) => [Math.atan2(pz - z, px - x), (yTop - py) / len], 2);
    setAttr(g, 'aseed', () => rng() * 10, 1);
    put('shaft', g, V(x, yTop, z));
  }
  // a pump housing standing on y: a ribbed drum r, h tall, with a motor cap and a glowing band
  function pump(x, y, z, r, h) {
    const P = V(x, y, z);
    put('metal', new THREE.CylinderGeometry(r, r * 1.05, h, 18).translate(x, y + h / 2, z), P);
    for (let k = 1; k < 5; k++) put('dark', new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.18, 18).translate(x, y + (h * k) / 5, z), P);
    put('metal', new THREE.CylinderGeometry(r * 0.7, r * 0.8, h * 0.25, 14).translate(x, y + h + h * 0.125, z), P);
    put('glow', new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.08, 18).translate(x, y + h * 0.9, z), P);
    put('rust', new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.4, 10).translate(x, y + h * 1.25 + 0.2, z), P);
  }
  // a sluice gate on a wall (facing n): a ribbed slab w x h, with rails and hazard edges
  function gate(p, n, w, h) {
    const P = V(...p), N = nrm(n);
    put('metal', place(new THREE.BoxGeometry(w, h, 0.4).translate(0, 0, 0.2), P, N), P);
    for (let k = 1; k < 6; k++) put('dark', place(new THREE.BoxGeometry(w + 0.1, 0.22, 0.5).translate(0, -h / 2 + (k * h) / 6, 0.25), P, N), P);
    for (const s of [-1, 1]) put('dark', place(new THREE.BoxGeometry(0.35, h + 1.5, 0.6).translate(s * (w / 2 + 0.2), 0.75, 0.3), P, N), P);
    put('glow', place(new THREE.BoxGeometry(w, 0.06, 0.06).translate(0, h / 2 + 0.05, 0.45), P, N), P);
  }
  // a sleeper tank on floor y: frosted glass round a body in the cold light
  function tank(x, y, z, h = 3, r = 0.75, body = true) {
    const P = V(x, y, z);
    put('metal', new THREE.CylinderGeometry(r + 0.12, r + 0.18, 0.45, 16).translate(x, y + 0.225, z), P);
    put('metal', new THREE.CylinderGeometry(r + 0.12, r + 0.08, 0.35, 16).translate(x, y + h - 0.175, z), P);
    put('glow', new THREE.CylinderGeometry(r + 0.13, r + 0.13, 0.05, 16).translate(x, y + 0.47, z), P);
    put('frost', new THREE.CylinderGeometry(r, r, h - 0.8, 18, 1, true).translate(x, y + h / 2, z), P);
    put('tankGlow', new THREE.CylinderGeometry(r * 0.92, r * 0.92, h - 0.85, 14, 1, true).translate(x, y + h / 2, z), P);
    if (body) {
      // a sleeper: head bowed, arms at its sides (dark against the glow)
      const by = y + 0.55, s = 0.92 + rng() * 0.12;
      const parts = [
        new THREE.SphereGeometry(0.13 * s, 8, 6).translate(0, 1.62 * s, 0.04),
        new THREE.CapsuleGeometry(0.17 * s, 0.5 * s, 3, 8).translate(0, 1.2 * s, 0),
        new THREE.CapsuleGeometry(0.07 * s, 0.55 * s, 2, 6).translate(-0.24 * s, 1.08 * s, 0),
        new THREE.CapsuleGeometry(0.07 * s, 0.55 * s, 2, 6).translate(0.24 * s, 1.08 * s, 0),
        new THREE.CapsuleGeometry(0.09 * s, 0.62 * s, 2, 6).translate(-0.1 * s, 0.45 * s, 0),
        new THREE.CapsuleGeometry(0.09 * s, 0.62 * s, 2, 6).translate(0.1 * s, 0.45 * s, 0),
      ];
      const yaw = rng() * Math.PI * 2;
      for (const g of parts) put('shadow', g.rotateY(yaw).translate(x, by, z), P);
      // tubes up out of the cap
      for (const k of [-1, 1]) cable([x + k * 0.3, y + h, z], [x + k * 0.8, y + h + 1.6, z + 0.4], 0.3, 0.05);
    }
  }
  // a doorframe of a bulkhead round an opening (center p at the floor, facing n), w x h
  function bulkhead(p, n, w, h) {
    const P = V(...p), N = nrm(n), t = 0.35, d = 0.3;
    for (const s of [-1, 1]) {
      put('metal', place(new THREE.BoxGeometry(t, h + t, d).translate(s * (w / 2 + t / 2), (h + t) / 2, d / 2), P, N), P);
      for (let k = 0; k < 4; k++) put('rust', place(new THREE.BoxGeometry(t + 0.02, 0.18, d + 0.02).translate(s * (w / 2 + t / 2), 0.3 + k * 0.7, d / 2), P, N), P);
    }
    put('metal', place(new THREE.BoxGeometry(w + 2 * t, t, d).translate(0, h + t / 2, d / 2), P, N), P);
    put('glow', place(new THREE.BoxGeometry(w + 2 * t, 0.05, 0.05).translate(0, h + t + 0.03, d), P, N), P);
  }
  function puddle(x, y, z, r) {
    put('puddle', new THREE.CircleGeometry(r, 14).scale(1, 0.6 + rng() * 0.4, 1).rotateX(-Math.PI / 2).rotateY(rng() * 3).translate(x, y + 0.015, z), V(x, y, z));
  }
  const drips = [];
  const drip = (x, y, z, every = 1.2) => drips.push({ p: V(x, y, z), every, t: rng() * every });

  // ---------------------------------------------------------------- the chasm's living dark
  // plankton drifting in the abyss (one draw), and great jellies pulsing far below
  function abyss() {
    const N = 1400, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = 37 + rng() * 74;
      pos[i * 3 + 1] = -78 + rng() * 56;
      pos[i * 3 + 2] = -67 - rng() * 128;
      seed[i] = rng() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aseed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uPower: power, uScale: { value: 300 } },
      vertexShader: `
        uniform float uTime, uScale; attribute float aseed; varying float vA;
        void main() {
          vec3 p = position;
          p.y += mod(uTime * (0.15 + fract(aseed) * 0.25) + aseed, 56.0) - 28.0;
          p.x += sin(uTime * 0.2 + aseed) * 1.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          gl_PointSize = clamp(0.28 * uScale / max(d, 0.1), 1.0, 7.0);
          vA = (0.5 + 0.5 * sin(uTime * (0.7 + fract(aseed * 7.0)) + aseed)) * (1.0 - smoothstep(70.0, 160.0, d));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uPower; varying float vA;
        void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.35, 0.85, 1.0) * (1.0 - smoothstep(0.1, 0.5, r)) * vA * (0.35 + 0.65 * uPower), 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.userData.noCull = true;
    pts.raycast = () => {};
    W.scene.add(pts);
    // the jellies
    const bellGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const jellies = [];
    for (let k = 0; k < 6; k++) {
      const hue = k % 3 === 2 ? 0x9a7bff : 0x5fe0ff;
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hue).multiplyScalar(0.55), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const grp = new THREE.Group();
      const bell = new THREE.Mesh(bellGeo, mat);
      grp.add(bell);
      const tg = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, r = 0.7;
        const pts2 = [];
        for (let s = 0; s <= 8; s++) pts2.push(V(Math.cos(a) * r * (1 - s * 0.04), -s * 0.9, Math.sin(a) * r * (1 - s * 0.04)));
        tg.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 10, 0.035, 3));
      }
      const tent = new THREE.Mesh(mergeGeometries(tg), mat);
      tg.forEach((x) => x.dispose());
      grp.add(tent);
      const s = 3 + rng() * 4;
      grp.scale.setScalar(s);
      grp.userData.noCull = true;
      grp.traverse((o) => (o.raycast = () => {}));
      W.scene.add(grp);
      const jelly = { grp, bell, tent, mat, base: V(48 + rng() * 52, -62 + rng() * 18, -80 - rng() * 100), r: 6 + rng() * 10, w: 0.02 + rng() * 0.03, ph: rng() * 10, s };
      grp.position.copy(jelly.base); // (never leave them at the origin: that's the Foundry's spawn room)
      jellies.push(jelly);
    }
    // they drift in slow circles far below, bells pulsing (only while you're out in Azure)
    let jt = 0;
    W.add({
      update(dt, player) {
        if (player.pos.x < 26) return;
        jt += dt;
        for (const j of jellies) {
          const a = jt * j.w + j.ph;
          j.grp.position.set(j.base.x + Math.cos(a) * j.r, j.base.y + Math.sin(jt * 0.3 + j.ph) * 2, j.base.z + Math.sin(a) * j.r);
          j.bell.scale.set(1 - 0.08 * Math.sin(jt * 1.6 + j.ph), 1 + 0.12 * Math.sin(jt * 1.6 + j.ph), 1 - 0.08 * Math.sin(jt * 1.6 + j.ph));
        }
      },
    });
    return { pts, jellies };
  }

  // ---------------------------------------------------------------- finalize
  function finalize() {
    const keyMat = { ...M, signHaz: M.sign, ocean: S.ocean, caustic: S.caustic, mist: S.mist, pour: S.pour, shaft: S.shaft };
    for (const [key, clusters] of buckets) {
      for (const geos of clusters.values()) {
        const merged = mergeGeometries(geos, false);
        geos.forEach((g) => g.dispose());
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, keyMat[key]);
        mesh.matrixAutoUpdate = false;
        mesh.raycast = () => {};
        if (['frost', 'tankGlow', 'caustic', 'mist', 'pour', 'shaft', 'sign', 'signHaz'].includes(key)) mesh.renderOrder = 3;
        W.scene.add(mesh);
      }
    }
    buckets.clear();
    // clocks, splashes and drips (only near the player)
    const _p = V(0, 0, 0);
    W.add({
      update(dt, player) {
        time.value += dt;
        const pp = player.pos;
        if (pp.x < 26) return;
        for (const pr of pours) {
          if (!pr.on || !pr.splash || pr.at.distanceTo(pp) > 35) continue;
          if ((pr.t -= dt) > 0) continue;
          pr.t = 0.08;
          _p.copy(pr.at).add(_a.set((Math.random() - 0.5) * pr.w, 0, (Math.random() - 0.5) * 0.4));
          W.fx.burst(_p, 0xd8f2ff, { count: 2, speed: 2.5, life: 0.5, size: 0.09, gravity: 9, spread: 0.8, dir: UPV });
          if (Math.random() < 0.3) W.fx.bubbles(_p.setY(_p.y - 0.3), 2);
        }
        for (const d of drips) {
          if (d.p.distanceTo(pp) > 22) continue;
          if ((d.t -= dt) > 0) continue;
          d.t = d.every * (0.6 + Math.random() * 0.8);
          W.fx.burst(d.p, 0xcfeaff, { count: 1, speed: 0.1, life: 1.4, size: 0.05, gravity: 14, drag: 0, spread: 0.05, dir: V(0, -1, 0), mode: 'streak', stretch: 0.04 });
        }
      },
    });
  }

  const dimOnShutdown = (instant) => {
    // the glow bands sink, the pours stop and the sea's light goes cold
    const target = 0.25;
    if (instant) {
      M.glow.color.multiplyScalar(target);
      M.tankGlow.opacity *= 0.5;
      power.value = 0.25;
      for (const p of pours) p.on = false;
      return;
    }
    let t = 0;
    const base = M.glow.color.clone();
    W.add({
      update(dt) {
        t += dt;
        const k = Math.max(0, 1 - t / 3);
        M.glow.color.copy(base).multiplyScalar(target + (1 - target) * k * (Math.sin(t * 31) > -0.3 ? 1 : 0.3));
        power.value = 0.25 + 0.75 * k;
        if (t > 1.5) for (const p of pours) p.on = false;
      },
    });
    M.tankGlow.opacity *= 0.5;
  };

  return { M, S, time, power, pipe, rod, valve, cable, window: window_, porthole, sign, caustic, causticRoom, mist, pour, pours, shaft, pump, gate, tank, bulkhead, puddle, drip, abyss, finalize, dimOnShutdown, rng };
}

// ================================================================== where it all goes
export function dressAzure(B, { zone }) {
  const { W, level } = B;
  const d = makeDressing(B, { zone });
  const st = level.azure;
  st.dress = d;
  const { pipe, valve, cable, sign, causticRoom, caustic, mist, pour, shaft, pump, gate, tank, bulkhead, puddle, drip, porthole } = d;
  const win = d.window;
  const solid = (a, b) => W.addSolid(V(...a), V(...b), { static: true, kind: 'metal' });

  // ---------------------------------------------------------------- the chasm
  d.abyss();
  // broken mains pour from the cliffs into the abyss
  pipe([[70, 14, -66], [70, 14, -69.4]], { r: 0.85, flange: 1.2 });
  pour([70, 13.4, -69.6], -72, 2.2, '+z', { splash: false, mistAt: false });
  pipe([[60, 18, -196], [60, 18, -192.6]], { r: 0.9, flange: 1.2 });
  pour([60, 17.4, -192.4], -72, 2.4, '-z', { splash: false, mistAt: false });
  pipe([[113, 8, -136], [110.4, 8, -136]], { r: 0.7, flange: 1 });
  pour([110.2, 7.5, -136], -72, 1.8, '-x', { splash: false, mistAt: false });
  // conduits down the cliff faces, banded with light
  for (const x of [48, 88]) pipe([[x, 30, -69.3], [x, -78, -69.3]], { r: 0.75, flange: 6, band: 9 });
  for (const x of [82, 100]) pipe([[x, 30, -192.7], [x, -78, -192.7]], { r: 0.75, flange: 6, band: 9 });

  // ---------------------------------------------------------------- entry and Rim Deck
  pipe([[25.6, 6.85, -113.2], [43.9, 6.85, -113.2]], { r: 0.12, flange: 2.4, band: 4.8 });
  pipe([[25.6, 6.85, -110.8], [43.9, 6.85, -110.8]], { r: 0.09, flange: 3, band: 0 });
  sign('AZURE STATION', [29.4, 5.7, -113.5], '+z', 0.36);
  sign('DECK 01  RIM', [45.9, 4.55, -117.18], '+z', 0.2);
  cable([56.85, 12.4, -119.15], [44.15, 5.1, -119.85], 1.2);
  pipe([[52.15, 2.3, -114.35], [52.15, -52.2, -114.35]], { r: 0.24, flange: 5, band: 7 });
  pipe([[56.85, 2.3, -109.65], [56.85, -52.2, -109.65]], { r: 0.2, flange: 5 });
  puddle(49, 4, -115.5, 0.8);
  puddle(53.5, 4, -106.2, 0.55);

  // ---------------------------------------------------------------- the Shelf and the crane
  sign('CRANE 2', [91.5, 3.25, -89.38], '+z', 0.32);
  for (const [a, b] of [[85, 89.5], [89.5, 94], [94, 98.8]]) cable([a, 3, -89.75], [b, 3, -89.75], 0.8, 0.03);
  cable([99.35, 3, -89.75], [102, -1, -79], 2.5);

  // ---------------------------------------------------------------- Pump Station
  sign('PUMP STATION 2', [103.48, -1.25, -84], '-x', 0.28);
  pump(108, -4.5, -93, 1.05, 1.8);
  solid([106.9, -4.5, -94.1], [109.1, -2.2, -91.9]);
  pipe([[108, -3.2, -91.9], [108, -3.2, -88.55]], { r: 0.14, flange: 1.5 });
  valve([106.6, -3.0, -88.55], '-z', 0.35);
  pipe([[103, -5.6, -86.2], [103, -40, -86.2]], { r: 0.3, flange: 4, band: 6 });
  pipe([[105.2, -5.6, -88.4], [105.2, -40, -88.4]], { r: 0.22, flange: 4 });
  puddle(101, -4.5, -82, 0.7);
  drip(103.6, -1.1, -80.6, 1.4);

  // ---------------------------------------------------------------- Turbine Deck
  sign('TURBINE 4', [104.48, -17.4, -120.6], '-x', 0.3);
  pipe([[107.5, -17.4, -117.1], [112, -17.4, -117.1]], { r: 0.2, flange: 1.5, band: 3 });
  pipe([[107.5, -19.6, -120.6], [112, -19.6, -120.6]], { r: 0.28, flange: 1.5 });
  cable([106.2, -16, -120.6], [104.2, -6, -110.9], 1.6);
  puddle(99, -21, -119.5, 0.9);
  puddle(101.6, -21, -114.4, 0.5);
  drip(100.6, -6.2, -111, 1.1);

  // ---------------------------------------------------------------- the Storm Deck
  sign('STORM DECK 3', [61.92, -17.6, -122.4], '+x', 0.36);
  sign('DANGER  HIGH VOLTAGE', [61.92, -18.4, -100.6], '+x', 0.26, 'hazard');
  for (const [a, b] of [[[61.6, -13.2, -122.4], [82.4, -13.2, -122.4]], [[61.6, -13.2, -100.6], [82.4, -13.2, -100.6]], [[61.6, -13.2, -122.4], [61.6, -13.2, -100.6]]]) cable(a, b, 1.6, 0.045);

  // ---------------------------------------------------------------- the Flooded Depths
  causticRoom(124, -126, 146, -104, -25, -19);
  caustic([135, -29.97, -115], 'up', 22, 22);
  mist(124, -126, 146, -104, -22.4);
  caustic([141, -50.05, -119], 'down', 14, 14);
  mist(134, -126, 148, -112, -52.6);
  for (const z of [-112, -118, -138, -150]) porthole([159.98, -56.5, z], '-x', 0.6);
  pipe([[152.45, -52.6, -108.6], [152.45, -52.6, -151.4]], { r: 0.14, flange: 3, band: 6 });
  for (const x of [130, 136.5, 147.5]) porthole([x, -55.2, -136.02], '-z', 0.5);
  pipe([[126.5, -50.6, -136.5], [151, -50.6, -136.5]], { r: 0.15, flange: 3, band: 5 });

  // ---------------------------------------------------------------- the Cryo Lab and its records room
  for (const x of [90.6, 93.4, 96.2, 99, 101.8, 104.6]) {
    tank(x, -25, -173.4, 3.2, 0.72);
    solid([x - 0.9, -25, -174.4], [x + 0.9, -21.8, -172.5]);
  }
  for (const z of [-156.2, -159]) {
    tank(89.35, -25, z, 3.2, 0.62);
    solid([88, -25, z - 0.8], [90.2, -21.8, z + 0.8]);
  }
  win([88.02, -21.6, -164.6], '+x', 3.6, 2.2);
  sign('CRYO 3  SLEEPER STORAGE', [100, -21.25, -153.02], '-z', 0.32);
  sign('RECORDS', [107.98, -21.9, -160.75], '-x', 0.28);
  pipe([[88.5, -17.6, -154.2], [107.5, -17.6, -154.2]], { r: 0.17, flange: 3, band: 4 });
  pipe([[88.5, -17.55, -174.6], [107.5, -17.55, -174.6]], { r: 0.22, flange: 3, band: 4 });
  pipe([[101.2, -17.6, -154.4], [101.2, -17.6, -174.4]], { r: 0.13, flange: 4 });
  mist(88, -175, 108, -153, -25.15, [0.45]);
  drip(95, -17.85, -154.2, 1.6);
  drip(103, -17.8, -174.6, 1.9);
  cable([109, -21.5, -158.2], [114.5, -21.5, -163.6], 0.5, 0.03);
  puddle(110.5, -25, -162.2, 0.45);

  // ---------------------------------------------------------------- the Breaker Hall and the Well
  pipe([[67, -20.2, -176.6], [87, -20.2, -176.6]], { r: 0.16, flange: 2.5, band: 5 });
  pipe([[67, -19.6, -163.4], [87, -19.6, -163.4]], { r: 0.12, flange: 3 });
  sign('BRINE WELL  >', [66.55, -21.1, -170], '+x', 0.26);
  sign('BREAKER HALL', [87.45, -21.2, -173.4], '-x', 0.3);
  sign('DANGER  LIVE WATER', [80, -22.4, -163.05], '-z', 0.3, 'hazard');
  sign('DANGER  LIVE WATER', [76, -22.4, -176.95], '+z', 0.3, 'hazard');
  mist(68.2, -177, 84.2, -163, -24.95, [0.3]);
  sign('DANGER  COLD BRINE', [65.98, -23.2, -173.6], '-x', 0.24, 'hazard');
  mist(50, -182, 66, -158, -46.05);
  pipe([[50.4, -20, -176], [50.4, -46, -176]], { r: 0.3, flange: 4, band: 5 });
  pipe([[50.4, -20, -164.5], [50.4, -46, -164.5]], { r: 0.22, flange: 4 });
  cable([50.2, -20.5, -160.5], [65.8, -20.5, -178.5], 3);
  cable([50.2, -21, -180.5], [65.8, -21, -162], 2.4);

  // ---------------------------------------------------------------- vault and sanctum
  sign('VAULT', [54, -52.35, -158.02], '-z', 0.32);
  sign('CORE SANCTUM', [60, -52.6, -149.98], '+z', 0.34);

  // ---------------------------------------------------------------- the Blue Span
  sign('DECK 07  UNDERCROFT', [111.98, -52.2, -146], '-x', 0.32);
  cable([92, -52.5, -139.6], [103.3, -51.4, -151.1], 1.4);
  cable([103.3, -51.4, -151.1], [111.9, -50, -149], 1.2);

  // ---------------------------------------------------------------- the Undercroft: a flooded machine hall
  const HW = -57.3;
  causticRoom(117, -194, 157, -160, HW + 0.1, -50, -44.05);
  mist(117, -194, 157, -160, HW);
  for (const x of [131, 141, 150]) {
    pump(x, -69, -162, 1.5, 15);
    solid([x - 1.5, -69, -163.5], [x + 1.5, -50.2, -160.5]);
    pipe([[x, -50.1, -162], [x, -45.2, -162], [x, -45.2, -167]], { r: 0.38, flange: 2 });
  }
  gate([128, -49, -193.98], '+z', 6, 9);
  gate([146, -49, -193.98], '+z', 6, 9);
  pour([126, -49.6, -160.25], HW, 1.6, '-z');
  pipe([[126, -49.3, -159.6], [126, -49.3, -160.4]], { r: 0.55, flange: 0.5 });
  pour([156.7, -50.2, -164], HW, 1.4, '-x');
  pipe([[157.5, -49.9, -164], [156.5, -49.9, -164]], { r: 0.5, flange: 0.6 });
  for (const z of [-170, -184]) for (const x of [125, 137, 149]) shaft(x, -44.05, z, 12.7, 0.55, 1.7);
  win([117.02, -49.8, -178], '+x', 8, 3.6);
  win([156.98, -49.8, -180], '-x', 8, 3.6);
  sign('UNDERCROFT  CISTERN 1', [125.5, -52.1, -160.03], '-z', 0.42);
  sign('DUCT  >', [156.97, -55.4, -164], '-x', 0.32);
  sign('WINCH  DUCT GATE', [156.97, -54.4, -168.4], '-x', 0.26);
  sign('MAINTENANCE SEAL', [152.47, -56.25, -186.6], '-x', 0.2);
  pipe([[118, -45, -161.2], [156, -45, -161.2]], { r: 0.34, flange: 4, band: 6 });
  pipe([[118, -45, -192.8], [156, -45, -192.8]], { r: 0.34, flange: 4, band: 6 });
  for (const x of [127, 137, 147]) cable([x, -44.3, -166], [x, -44.3, -188], 2.6, 0.045);
  drip(120, -44.4, -170, 1.3);
  drip(152, -44.4, -186, 1.5);

  // ---------------------------------------------------------------- the Sluice
  const QS = { x1: 166, x2: 180, z1: -168, z2: -158 };
  for (const x of [168.6, 175.6]) pipe([[x, -63, -158.35], [x, -8.6, -158.35]], { r: 0.22, flange: 5, band: 7 });
  valve([171.4, -47.5, -158.06], '-z', 0.34);
  valve([174.6, -47.5, -158.06], '-z', 0.34);
  sign('SLUICE 2', [173, -45.6, -158.02], '-z', 0.34);
  sign('LOCK 1', [179.97, -43.4, -163], '-x', 0.3);
  sign('LOCK 2', [166.03, -7.1, -163], '+x', 0.3);
  // the lock chamber's ribs: a steel band round the shaft every 6 m, lit underneath, and windows onto the
  // sea high up the shaft (you float past them on the way up)
  for (let y = -50; y < -6; y += 6) {
    if (Math.abs(y + 44) < 0.8 || Math.abs(y + 38) < 0.8) continue; // (clear of the ledges and the rack)
    W.deco(QS.x1, y, QS.z1, QS.x2, y + 0.3, QS.z1 + 0.14, 'metal', zone);
    W.deco(QS.x1, y, QS.z2 - 0.14, QS.x2, y + 0.3, QS.z2, 'metal', zone);
    W.deco(QS.x1, y, QS.z1, QS.x1 + 0.14, y + 0.3, QS.z2, 'metal', zone);
    W.deco(QS.x2 - 0.14, y, QS.z1, QS.x2, y + 0.3, QS.z2, 'metal', zone);
    W.deco(QS.x1, y - 0.05, QS.z1, QS.x2, y, QS.z1 + 0.1, 'glow3', zone);
    W.deco(QS.x1, y - 0.05, QS.z2 - 0.1, QS.x2, y, QS.z2, 'glow3', zone);
  }
  win([179.98, -24, -163], '-x', 5, 3.4);
  win([166.02, -18, -163], '+x', 5, 3.4);
  porthole([173, -30, -167.98], '+z', 0.8);
  porthole([173, -16, -158.02], '-z', 0.8);
  // a band of caustics that rides the water up the walls, and foam while it rushes in
  {
    const band = new THREE.Group();
    const parts = [];
    const add = (p, n, w, h) => {
      const g = place(new THREE.PlaneGeometry(w, h), V(...p).addScaledVector(nrm(n), 0.04), nrm(n));
      const pos = g.attributes.position, auv = new Float32Array(pos.count * 2), seed = new Float32Array(pos.count).fill(2);
      for (let i = 0; i < pos.count; i++) {
        auv[i * 2] = (i % 2 ? 0.5 : -0.5) * w;
        auv[i * 2 + 1] = (i < 2 ? 0.5 : -0.5) * h;
      }
      g.setAttribute('auv', new THREE.Float32BufferAttribute(auv, 2));
      g.setAttribute('aseed', new THREE.Float32BufferAttribute(seed, 1));
      parts.push(g);
    };
    add([173, 1.2, -168], '+z', 14, 3.4);
    add([173, 1.2, -158], '-z', 14, 3.4);
    add([166, 1.2, -163], '+x', 10, 3.4);
    add([180, 1.2, -163], '-x', 10, 3.4);
    const mesh = new THREE.Mesh(mergeGeometries(parts), d.S.caustic);
    mesh.renderOrder = 3;
    mesh.raycast = () => {};
    band.add(mesh);
    W.scene.add(band);
    const s = st.sluice;
    let last = s.level;
    const _p = V(0, 0, 0);
    W.add({
      update(dt, player) {
        band.position.y = s.level;
        const rising = s.level > last + 1e-4;
        last = s.level;
        if (rising && Math.abs(player.pos.x - 173) < 25 && Math.abs(player.pos.z + 163) < 25 && Math.random() < dt * 30) {
          _p.set(166.5 + Math.random() * 13, s.level, -167.5 + Math.random() * 9);
          W.fx.burst(_p, 0xe0f6ff, { count: 3, speed: 1.6, life: 0.6, size: 0.12, gravity: 4, spread: 1, dir: UPV });
        }
      },
    });
  }

  // ---------------------------------------------------------------- the gallery and the Spillway
  win([131, -5.9, -154.02], '-z', 6, 1.4);
  win([143, -5.9, -154.02], '-z', 6, 1.4);
  pipe([[112.6, -4.86, -156.65], [179.2, -4.86, -156.65]], { r: 0.12, flange: 3, band: 6 });
  // ribs every 6 m down the gallery, clear of its doors and the pressure lock
  for (let x = 115; x < 179; x += 6) {
    if ((x > 150 && x < 154.5) || (x > 155.5 && x < 164.5) || (x > 170.5 && x < 175.5) || (x > 127 && x < 134.5) || (x > 139 && x < 146.5)) continue;
    W.deco(x, -7.7, -154.2, x + 0.4, -4.5, -154, 'metal', zone);
    W.deco(x, -7.7, -157, x + 0.4, -4.5, -156.8, 'metal', zone);
    W.deco(x, -4.75, -157, x + 0.4, -4.5, -154, 'metal', zone);
    W.deco(x, -7.7, -154.22, x + 0.4, -7.3, -154.2, 'hazard', zone);
    W.deco(x, -7.7, -156.8, x + 0.4, -7.3, -156.78, 'hazard', zone);
    W.deco(x + 0.1, -4.78, -156.5, x + 0.3, -4.75, -154.5, 'glow3', zone);
  }
  bulkhead([173, -7.7, -157], '+z', 3, 3.2);
  bulkhead([160, -7.7, -157], '+z', 3, 3.2);
  sign('ENGINE  >', [155.6, -5.3, -156.98], '+z', 0.3);
  sign('<  SPILLWAY', [153.3, -6.05, -156.98], '+z', 0.3);
  sign('PRESSURE LOCK', [154.2, -5.4, -154.02], '-z', 0.28, 'hazard');
  puddle(140, -7.7, -155.2, 0.6);
  puddle(165, -7.7, -156.1, 0.5);
  drip(140, -4.6, -155.3, 1.7);
  sign('EMERGENCY PADS', [111.98, -3.9, -155.5], '-x', 0.32);

  d.finalize();
  return d;
}

// CRIMSON FOUNDRY — set dressing laid over red.js's gameplay geometry (nothing here is solid; nothing
// stands on a route or in a shot line that matters):
//   · machinery: crucibles on chains pouring molten streams, a gantry crane, conveyors carrying glowing
//     ingots (and empty holding pods past the cell block), wall gears, a grinder throwing sparks
//   · pipes with flanges, valve wheels, glowing bands and steam; pressure gauges with live needles
//   · girders, handrails, hazard stripes, stencilled signage, soot stains
//   · heat: lava uplight washing up the walls over every pool, drifting embers
// Static pieces are merged per material per room; animated ones share a few materials and one clock.
// setHeat(k) (1 hot → 0 cold) is driven by red.js's power-down: streams freeze into dark crust, belts,
// gears, the crane and the grinder stop, embers and steam die, glow sinks, needles fall to zero.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from '../materials.js';

const CH = 3.2;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const N = { '+x': V(1, 0, 0), '-x': V(-1, 0, 0), '+z': V(0, 0, 1), '-z': V(0, 0, -1), up: V(0, 1, 0), down: V(0, -1, 0) };
const _o = new THREE.Object3D();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = V(0, 0, 0), _s = V(1, 1, 1);

// a geometry built facing +z, turned to face n and moved to p (baked)
function placeGeo(g, p, n, spin = 0) {
  _o.position.copy(p);
  _o.rotation.set(0, 0, 0);
  _o.lookAt(_p.copy(p).add(n));
  if (spin) _o.rotateZ(spin);
  _o.updateMatrix();
  return g.applyMatrix4(_o.matrix);
}

// ---------------------------------------------------------------- textures
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const WORDS = ['FOUNDRY 1', 'INTAKE 05', 'PROCESSING', 'PROVING HALL', 'CAUTION HEAT', 'CRUCIBLE', 'SLAG RUN', 'GEARWORKS',
  'QUENCH SHAFT', 'SMELTING', 'ATRIUM', '01', '02', '03', '04', '05', '06', 'DROP', 'HIGH PRESSURE', 'NO ENTRY', 'KEEP CLEAR', 'FORGE'];
const CELL_W = 512, CELL_H = 64;
let atlas = null;
function signAtlas() {
  if (atlas) return atlas;
  const uv = {};
  const tex = canvas(1024, 1024, (g) => {
    g.clearRect(0, 0, 1024, 1024);
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    WORDS.forEach((w, i) => {
      const cx = (i % 2) * CELL_W, cy = Math.floor(i / 2) * CELL_H;
      g.font = 'bold 46px Impact, "Arial Black", sans-serif';
      // stencil look: wide letter spacing and a gap through each glyph
      const sp = 7;
      let width = 0;
      for (const ch of w) width += g.measureText(ch).width + sp;
      width -= sp;
      let x = cx + 8;
      for (const ch of w) {
        g.fillText(ch, x, cy + CELL_H / 2 + 2);
        x += g.measureText(ch).width + sp;
      }
      g.clearRect(cx, cy + CELL_H / 2 - 1, CELL_W, 3);
      uv[w] = { u0: cx / 1024, u1: (cx + width + 16) / 1024, v0: 1 - (cy + CELL_H) / 1024, v1: 1 - cy / 1024, aspect: (width + 16) / CELL_H };
    });
  });
  atlas = { tex, uv };
  return atlas;
}
let sootTex = null;
const soot = () => (sootTex ??= canvas(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(8,6,6,0.85)');
  r.addColorStop(0.55, 'rgba(10,8,8,0.45)');
  r.addColorStop(1, 'rgba(10,8,8,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
}));
let dialTex = null;
const dial = () => (dialTex ??= canvas(128, 128, (g) => {
  g.fillStyle = '#d9d2c0';
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2a2420';
  g.lineWidth = 6;
  g.stroke();
  g.strokeStyle = '#c0281c';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(64, 64, 46, -0.35, 0.75);
  g.stroke();
  g.strokeStyle = '#2a2420';
  g.lineWidth = 3;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 38, 64 + Math.sin(a) * 38);
    g.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52);
    g.stroke();
  }
}));

// ---------------------------------------------------------------- shaders
const upShader = {
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uHeat; uniform float uTime; varying vec2 vUv;
    void main(){
      float f = 0.78 + 0.22 * sin(uTime * 2.9 + vUv.x * 23.0) * sin(uTime * 1.3 + vUv.x * 9.0);
      float a = pow(1.0 - vUv.y, 2.4) * uHeat * f;
      gl_FragColor = vec4(vec3(1.0, 0.36, 0.07) * a * 1.25, a);
    }`,
};
const streamShader = {
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uHeat; uniform float uFlow; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    void main(){
      vec2 q = vec2(vUv.x * 6.0, vUv.y * 9.0 + uFlow);
      float k = n(q) * 0.6 + n(q * 2.3) * 0.4;
      vec3 hot = mix(vec3(1.25, 0.32, 0.04), vec3(2.0, 1.1, 0.35), smoothstep(0.45, 0.85, k));
      vec3 cold = vec3(0.09, 0.065, 0.06) + vec3(0.06, 0.03, 0.02) * k;
      gl_FragColor = vec4(mix(cold, hot, uHeat), 1.0);
    }`,
};

export function dressFoundry(B, { pools = [] } = {}) {
  const { W } = B;
  const zone = 'red';
  const metal = mat('metal', zone), dark = mat('ceil', zone);
  // ---- merge buckets for the static pieces (one mesh per material per room)
  const buckets = new Map();
  const add = (m, g) => {
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m).push(g);
  };
  const flush = () => {
    for (const [m, list] of buckets) {
      const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)), false);
      list.forEach((x) => x.dispose());
      const mesh = new THREE.Mesh(g, m);
      mesh.matrixAutoUpdate = false;
      W.scene.add(mesh);
    }
    buckets.clear();
  };

  // ---- the heat-driven materials
  const moltenMat = new THREE.MeshBasicMaterial({ color: 0xff7a22 });
  const MOLTEN = new THREE.Color(0xff7a22).multiplyScalar(1.7), MOLTEN_COLD = new THREE.Color(0x1d120e);
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
  const BAND = new THREE.Color(0xff5a1a).multiplyScalar(1.5), BAND_COLD = new THREE.Color(0x24130e);
  const podGlowMat = new THREE.MeshBasicMaterial({ color: 0x9bf6ff });
  const POD = new THREE.Color(0x9bf6ff).multiplyScalar(1.3), POD_COLD = new THREE.Color(0x10181a);
  const scanMat = new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const upMat = new THREE.ShaderMaterial({ ...upShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uHeat: { value: 1 }, uTime: { value: 0 } } });
  const streamMat = new THREE.ShaderMaterial({ ...streamShader, uniforms: { uHeat: { value: 1 }, uFlow: { value: 0 } } });
  const { tex: signTex, uv: signUV } = signAtlas();
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, color: 0xe8cf8a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const signRed = new THREE.MeshBasicMaterial({ map: signTex, color: 0xd8382a, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const sootMat = new THREE.MeshBasicMaterial({ map: soot(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const dialMat = new THREE.MeshBasicMaterial({ map: dial() });
  const needleMat = new THREE.MeshBasicMaterial({ color: 0xb01810 });
  let heat = 1;

  // ---------------------------------------------------------------- builders
  // a stencilled sign: text at p (centre) facing n, h tall; red: painted red instead of cream
  const sign = (text, p, n, h = 0.5, red = false, plate = true) => {
    const u = signUV[text];
    const w = h * u.aspect;
    const g = new THREE.PlaneGeometry(w, h);
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) ? u.u1 : u.u0, a.getY(i) ? u.v1 : u.v0);
    add(red ? signRed : signMat, placeGeo(g, V(...p).addScaledVector(N[n], 0.03), N[n]));
    if (plate) add(dark, placeGeo(new THREE.BoxGeometry(w + 0.3, h + 0.2, 0.04), V(...p).addScaledVector(N[n], 0.01), N[n]));
  };
  // soot: a dark smudge on a wall, w × h
  const smudge = (p, n, w, h) => add(sootMat, placeGeo(new THREE.PlaneGeometry(w, h), V(...p).addScaledVector(N[n], 0.02), N[n]));
  // lava uplight: a glow sheet up a wall from y0, h tall, between a and b (points on the wall line)
  const uplight = (a, b, y0, h, n) => {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const g = new THREE.PlaneGeometry(len, h);
    const mid = V((a[0] + b[0]) / 2, y0 + h / 2, (a[2] + b[2]) / 2).addScaledVector(N[n], 0.04);
    add(upMat, placeGeo(g, mid, N[n]));
  };
  // pipes: a run between two points with flanges every ~2.5 m and a glowing band (or not)
  const pipe = (a, b, r = 0.18, glow = true) => {
    const A = V(...a), Bv = V(...b), d = Bv.clone().sub(A), len = d.length();
    const q = _q.setFromUnitVectors(N.up, d.clone().normalize());
    const at = (t, g) => g.applyMatrix4(_m.compose(A.clone().addScaledVector(d, t), q, _s));
    add(metal, at(0.5, new THREE.CylinderGeometry(r, r, len, 10)));
    const n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) add(metal, at(i / n, new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.12, 10)));
    if (glow) for (let i = 0; i < n; i++) add(bandMat, at((i + 0.5) / n, new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.16, 10)));
  };
  // a valve wheel on a pipe/wall at p facing n, with a steam leak
  const steam = [];
  const valve = (p, n, puff = true) => {
    const P = V(...p);
    add(metal, placeGeo(new THREE.TorusGeometry(0.28, 0.04, 6, 14), P.clone().addScaledVector(N[n], 0.22), N[n]));
    add(metal, placeGeo(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6).rotateX(Math.PI / 2), P.clone().addScaledVector(N[n], 0.11), N[n]));
    for (let k = 0; k < 2; k++) add(metal, placeGeo(new THREE.BoxGeometry(0.54, 0.04, 0.04), P.clone().addScaledVector(N[n], 0.22), N[n], k * Math.PI / 2));
    if (puff) steam.push({ p: P.clone().addScaledVector(N[n], 0.3), n: N[n], t: Math.random() * 2 });
  };
  // an I-beam girder between two points (horizontal), d deep
  const girder = (a, b, d = 0.6) => {
    const [x1, y, z1] = a, [x2, , z2] = b, alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const lo = (u, v) => (alongX ? [Math.min(x1, x2), u, z1 - v, Math.max(x1, x2), u + 0.08, z1 + v] : [x1 - v, u, Math.min(z1, z2), x1 + v, u + 0.08, Math.max(z1, z2)]);
    W.deco(...lo(y - d, 0.2), 'metal', zone);
    W.deco(...lo(y - 0.08, 0.2), 'metal', zone);
    const web = alongX ? [Math.min(x1, x2), y - d, z1 - 0.04, Math.max(x1, x2), y, z1 + 0.04] : [x1 - 0.04, y - d, Math.min(z1, z2), x1 + 0.04, y, Math.max(z1, z2)];
    W.deco(...web, 'metal', zone);
    // gusset plates and rivet rows read as a riveted girder from below
    const len = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    for (let s = 1; s < len; s += 1.6) {
      const c = alongX ? [Math.min(x1, x2) + s, z1] : [x1, Math.min(z1, z2) + s];
      if (alongX) W.deco(c[0] - 0.05, y - d + 0.08, c[1] - 0.12, c[0] + 0.05, y - 0.08, c[1] + 0.12, 'metal', zone);
      else W.deco(c[0] - 0.12, y - d + 0.08, c[1] - 0.05, c[0] + 0.12, y - 0.08, c[1] + 0.05, 'metal', zone);
    }
  };
  // a handrail along a line, posts every ~1.5 m, height h above the line's y (y may slope)
  const rail = (a, b, h = 0.95) => {
    const A = V(...a), Bv = V(...b), d = Bv.clone().sub(A), len = Math.hypot(d.x, d.z);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const p = A.clone().addScaledVector(d, i / n);
      W.deco(p.x - 0.04, p.y, p.z - 0.04, p.x + 0.04, p.y + h, p.z + 0.04, 'metal', zone);
    }
    pipe([A.x, A.y + h, A.z], [Bv.x, Bv.y + h, Bv.z], 0.035, false);
  };
  // hazard stripes along a line (a thin strip on a wall/edge)
  const stripe = (x1, y1, z1, x2, y2, z2) => W.deco(x1, y1, z1, x2, y2, z2, 'hazard', zone);

  // ---- animated pieces
  const anims = [];
  // a wall gear of radius r at p facing n, turning at w rad/s (meshes share geometry by size)
  const gearCache = new Map();
  const gearGeo = (r) => {
    const key = r.toFixed(2);
    if (gearCache.has(key)) return gearCache.get(key);
    const parts = [new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.22, 28).rotateX(Math.PI / 2)];
    const teeth = Math.round(r * 10);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      parts.push(new THREE.BoxGeometry(r * 0.2, r * 0.22, 0.2).rotateZ(a).translate(Math.cos(a + Math.PI / 2) * -r * 0.95, Math.sin(a + Math.PI / 2) * -r * 0.95, 0));
    }
    for (let i = 0; i < 5; i++) parts.push(new THREE.BoxGeometry(r * 0.12, r * 1.5, 0.28).rotateZ((i / 5) * Math.PI));
    parts.push(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.4, 12).rotateX(Math.PI / 2));
    const g = mergeGeometries(parts.map((x) => x.toNonIndexed()));
    gearCache.set(key, g);
    return g;
  };
  const gear = (p, n, r, w) => {
    const m = new THREE.Mesh(gearGeo(r), metal);
    m.position.copy(V(...p).addScaledVector(N[n], 0.16));
    m.lookAt(m.position.clone().add(N[n]));
    W.scene.add(m);
    anims.push((dt) => m.rotateZ(w * heat * dt));
    return m;
  };
  // a conveyor from a to b (y = belt top), carrying n items ('ingot' | 'pod') at speed m/s
  const ingotGeo = new THREE.BoxGeometry(0.62, 0.22, 0.32);
  const podGeo = new THREE.CapsuleGeometry(0.36, 0.9, 4, 10);
  const podBandGeo = new THREE.BoxGeometry(0.5, 0.12, 0.76);
  const conveyor = (a, b, { n = 8, item = 'ingot', speed = 0.8, width = 0.8 } = {}) => {
    const A = V(...a), Bv = V(...b), d = Bv.clone().sub(A), len = d.length(), dir = d.clone().normalize();
    const alongX = Math.abs(d.x) > Math.abs(d.z);
    // belt and rollers (static)
    const bx = alongX ? [Math.min(A.x, Bv.x), A.y - 0.16, A.z - width / 2, Math.max(A.x, Bv.x), A.y, A.z + width / 2] : [A.x - width / 2, A.y - 0.16, Math.min(A.z, Bv.z), A.x + width / 2, A.y, Math.max(A.z, Bv.z)];
    W.deco(...bx, 'grate', zone);
    const fr = alongX ? [bx[0], bx[1] - 0.24, bx[2] - 0.08, bx[3], bx[1], bx[2]] : [bx[0] - 0.08, bx[1] - 0.24, bx[2], bx[0], bx[1], bx[5]];
    W.deco(...fr, 'metal', zone);
    const fr2 = alongX ? [bx[0], bx[1] - 0.24, bx[5], bx[3], bx[1], bx[5] + 0.08] : [bx[3], bx[1] - 0.24, bx[2], bx[3] + 0.08, bx[1], bx[5]];
    W.deco(...fr2, 'metal', zone);
    const yaw = Math.atan2(dir.x, dir.z);
    const meshes = item === 'pod'
      ? [new THREE.InstancedMesh(podGeo, metal, n), new THREE.InstancedMesh(podBandGeo, podGlowMat, n)]
      : [new THREE.InstancedMesh(ingotGeo, moltenMat, n)];
    for (const m of meshes) {
      m.frustumCulled = false;
      W.scene.add(m);
    }
    const s0 = Array.from({ length: n }, (_, i) => (i / n) * len);
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + (item === 'ingot' ? Math.PI / 2 : 0), 0));
    let off = 0;
    const place = () => {
      for (let i = 0; i < n; i++) {
        const s = (s0[i] + off) % len;
        const p = A.clone().addScaledVector(dir, s);
        p.y += item === 'pod' ? 0.82 : 0.11;
        meshes[0].setMatrixAt(i, _m.compose(p, rot, _s));
        if (meshes[1]) meshes[1].setMatrixAt(i, _m.compose(p.clone().setY(p.y + 0.15), rot, _s));
      }
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    };
    place();
    anims.push((dt, player) => {
      if (heat <= 0 || player.pos.distanceTo(A) > 45) return;
      off = (off + speed * heat * dt) % len;
      place();
    });
  };
  // a crucible on chains at p (rim centre), r wide, tilted by tilt (rad, about axis 'x' | 'z'), pouring a
  // molten stream from its lip down to y = to (or not, to = null)
  const potGeo = (() => {
    const pts = [V(0.2, -1.25, 0), V(0.75, -1.2, 0), V(0.98, -0.8, 0), V(1.05, 0, 0), V(1.1, 0.06, 0), V(1.0, 0.06, 0), V(0.92, -0.05, 0)];
    return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x, p.y)), 18);
  })();
  const streamGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 10, 1, true).translate(0, -0.5, 0);
  const crucible = (p, r, { tilt = 0, axis = 'z', to = null, chainTop = null } = {}) => {
    const P = V(...p);
    const g = new THREE.Group();
    g.position.copy(P);
    if (axis === 'z') g.rotation.z = tilt;
    else g.rotation.x = tilt;
    const body = new THREE.Mesh(potGeo, metal);
    body.scale.setScalar(r);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.93 * r, 18).rotateX(-Math.PI / 2), moltenMat);
    top.position.y = -0.04 * r;
    g.add(body, top);
    // trunnion lugs
    for (const s of [-1, 1]) {
      const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * r, 0.16 * r, 0.4 * r, 8), metal);
      lug.rotation.z = Math.PI / 2;
      lug.position.set(s * 1.15 * r, -0.2 * r, 0);
      g.add(lug);
    }
    W.scene.add(g);
    // chains up from the lugs (static boxes: a long dark bar with links)
    if (chainTop !== null) {
      for (const s of [-1, 1]) {
        const c = V(s * 1.25 * r, -0.2 * r, 0).applyEuler(g.rotation).add(P);
        W.deco(c.x - 0.05, c.y, c.z - 0.05, c.x + 0.05, chainTop, c.z + 0.05, 'metal', zone);
        for (let y = c.y + 0.2; y < chainTop; y += 0.42) W.deco(c.x - 0.09, y, c.z - 0.03, c.x + 0.09, y + 0.22, c.z + 0.03, 'metal', zone);
      }
    }
    if (to !== null) {
      // the lip on the downhill side, the stream straight down from it
      const lip = V(axis === 'z' ? (tilt < 0 ? 1 : -1) * 1.05 * r : 0, 0, axis === 'x' ? (tilt > 0 ? 1 : -1) * 1.05 * r : 0).applyEuler(g.rotation).add(P);
      const s = new THREE.Mesh(streamGeo, streamMat);
      s.position.copy(lip);
      s.scale.set(r * 0.9, lip.y - to, r * 0.9);
      W.scene.add(s);
      splash.push({ p: V(lip.x, to + 0.15, lip.z), t: 0 });
    }
    return g;
  };
  const splash = [];
  // a pressure gauge at p facing n, its needle shivering around `level` (0..1)
  const gauge = (p, n, level = 0.6, size = 0.36) => {
    const P = V(...p);
    add(metal, placeGeo(new THREE.CylinderGeometry(size * 0.6, size * 0.6, 0.08, 16).rotateX(Math.PI / 2), P.clone().addScaledVector(N[n], 0.04), N[n]));
    add(dialMat, placeGeo(new THREE.CircleGeometry(size * 0.5, 20), P.clone().addScaledVector(N[n], 0.085), N[n]));
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.02, size * 0.42, 0.01).translate(0, size * 0.18, 0), needleMat);
    needle.position.copy(P).addScaledVector(N[n], 0.095);
    needle.lookAt(needle.position.clone().add(N[n]));
    W.scene.add(needle);
    const base = needle.quaternion.clone();
    let a = 0, t = Math.random() * 10;
    anims.push((dt, player) => {
      if (player.pos.distanceTo(P) > 20) return;
      t += dt;
      const want = (0.75 - (level + Math.sin(t * 3.7) * 0.03 + Math.sin(t * 11) * 0.015) * 1.5) * Math.PI * heat + (1 - heat) * 0.75 * Math.PI;
      a += (want - a) * Math.min(1, dt * 6);
      needle.quaternion.copy(base).multiply(_q.setFromAxisAngle(N['+z'], a));
    });
  };
  // a grinder wheel at p facing n, throwing sparks along dir
  const grinders = [];
  const grinder = (p, n, dir) => {
    const P = V(...p);
    add(metal, placeGeo(new THREE.BoxGeometry(0.7, 0.5, 0.5), P.clone().addScaledVector(N[n], 0.25), N[n]));
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 18).rotateX(Math.PI / 2), mat('grate', zone));
    wheel.position.copy(P).addScaledVector(N[n], 0.56);
    wheel.lookAt(wheel.position.clone().add(N[n]));
    W.scene.add(wheel);
    anims.push((dt) => wheel.rotateZ(-22 * heat * dt));
    grinders.push({ p: P.clone().addScaledVector(N[n], 0.6).add(V(0, -0.38, 0)), dir: V(...dir).normalize(), t: 0 });
  };
  // a gantry trolley on a beam (y = beam underside), shuttling between x1 and x2 (or z), with a hook/bucket
  const trolley = ({ y, z, x1, x2, speed = 1.1, drop = 2.2 }) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.2), metal);
    body.position.y = -0.25;
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.05, drop, 0.05), metal);
    cable.position.y = -0.5 - drop / 2;
    const bucket = new THREE.Mesh(potGeo, metal);
    bucket.scale.setScalar(0.55);
    bucket.position.y = -0.5 - drop - 0.1;
    const slag = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), moltenMat);
    slag.position.y = bucket.position.y - 0.03;
    g.add(body, cable, bucket, slag);
    g.position.set(x1, y, z);
    W.scene.add(g);
    let t = 0;
    anims.push((dt) => {
      t += dt * heat;
      const k = 0.5 - 0.5 * Math.cos((t * speed * Math.PI) / (x2 - x1)); // eased back and forth
      g.position.x = x1 + (x2 - x1) * k;
      bucket.rotation.z = Math.sin(t * 1.7) * 0.05 * heat;
    });
  };
  // processing scanner: a red bar sweeping up and down
  const scanners = [];

  // ===================================================================== SPAWN ROOM + the processing chamber
  sign('FOUNDRY 1', [0, 4.6, -11.97], '+z', 0.55);
  sign('INTAKE 05', [5.97, 3.4, -3.8], '-x', 0.36);
  sign('CAUTION HEAT', [-5.97, 2.6, -10.2], '+x', 0.26, true);
  stripe(-1.75, 0, -11.98, -1.5, CH, -11.94);
  stripe(1.5, 0, -11.98, 1.75, CH, -11.94);
  stripe(-1.75, CH, -11.98, 1.75, CH + 0.18, -11.94);
  smudge([-5.97, 2.6, -10.2], '+x', 2.6, 2.4);
  pipe([-5.75, 5.6, -0.3], [-5.75, 5.6, -11.7]);
  pipe([5.75, 5.6, -0.3], [5.75, 5.6, -11.7]);
  pipe([-5.75, 0.2, -11.75], [-5.75, 5.6, -11.75], 0.14, false);
  valve([-5.75, 1.6, -11.5], '+z');
  gauge([-5.97, 1.7, -1.2], '+x', 0.55);
  gauge([-5.97, 1.7, -2.0], '+x', 0.35);
  girder([-6, 6, -4], [6, 6, -4]);
  girder([-6, 6, -8], [6, 6, -8]);
  // the window onto the processing chamber (east wall, z -11.2): pods on a belt through a red scanner
  {
    const y0 = 0;
    W.box(6.5, -1, -12.9, 13.5, 0, -10.1, 'floor', zone);
    W.box(6.5, 3, -12.9, 13.5, 3.5, -10.1, 'ceil', zone);
    W.box(6.5, 0, -12.9, 13.5, 3, -12.4, 'wall', zone);
    W.box(6.5, 0, -10.6, 13.5, 3, -10.1, 'wall', zone);
    W.box(13, 0, -12.4, 13.5, 3, -10.6, 'wall', zone);
    conveyor([6.6, y0 + 0.4, -11.5], [12.9, y0 + 0.4, -11.5], { n: 5, item: 'pod', speed: 0.55, width: 1.0 });
    for (const x of [8.2, 11.2]) {
      W.deco(x - 0.1, 0, -12.4, x + 0.1, 2.6, -12.25, 'metal', zone);
      W.deco(x - 0.1, 0, -10.75, x + 0.1, 2.6, -10.6, 'metal', zone);
      W.deco(x - 0.1, 2.5, -12.4, x + 0.1, 2.7, -10.6, 'metal', zone);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.7), scanMat);
    bar.position.set(9.7, 1, -11.5);
    W.scene.add(bar);
    scanners.push(bar);
    sign('PROCESSING', [12.97, 2.3, -11.5], '-x', 0.3, true);
    W.deco(7, 2.94, -12.2, 12.6, 3, -10.8, 'glow0', zone);
  }

  // ===================================================================== PROVING HALL
  sign('PROVING HALL', [0, 6.0, -12.53], '-z', 0.42);
  sign('02', [-6.97, 4.6, -24], '+x', 0.9);
  sign('CAUTION HEAT', [-6.97, 3.0, -17], '+x', 0.26, true);
  sign('CAUTION HEAT', [6.97, 3.0, -17], '-x', 0.26, true);
  sign('NO ENTRY', [0, 5.6, -30.47], '+z', 0.3, true);
  smudge([-6.97, 3.4, -17], '+x', 3.2, 3);
  smudge([6.97, 3.4, -17], '-x', 3.2, 3);
  for (const z of [-15, -25.5]) girder([-7, 7, z], [7, 7, z], 0.7);
  // an ingot conveyor on a wall shelf (west, above head height) and a wall gear opposite
  W.deco(-7, 3.05, -29.8, -6.2, 3.15, -21.6, 'metal', zone);
  conveyor([-6.6, 3.35, -29.6], [-6.6, 3.35, -21.8], { n: 6, speed: 0.6, width: 0.7 });
  gear([6.97, 4.6, -26.5], '-x', 1.5, 0.35);
  gear([6.97, 5.6, -24.4], '-x', 0.8, -0.65);
  pipe([-6.75, 6.4, -12.8], [-6.75, 6.4, -30.2]);
  pipe([6.75, 6.4, -12.8], [6.75, 6.4, -30.2]);
  valve([6.75, 2.2, -28.5], '-x');
  pipe([6.8, 0.1, -28.5], [6.8, 6.4, -28.5], 0.12, false);
  gauge([-6.97, 1.6, -27.5], '+x', 0.7);
  gauge([-6.97, 1.6, -28.3], '+x', 0.45);
  gauge([2.4, 5.6, -20.47], '+z', 0.6, 0.3);
  // the divider: hazard frame round the gate, a big number, a pipe stack with a valve and gauges, soot
  stripe(-1.75, 0, -20.47, -1.5, CH, -20.43);
  stripe(1.5, 0, -20.47, 1.75, CH, -20.43);
  stripe(-1.75, CH, -20.47, 1.75, CH + 0.18, -20.43);
  sign('02', [-4.4, 4.4, -20.47], '+z', 1.1);
  for (const x of [4.2, 4.8]) pipe([x, 0, -20.3], [x, 7, -20.3], 0.14, x < 4.5);
  valve([4.5, 2.4, -20.3], '+z');
  gauge([5.9, 1.8, -20.47], '+z', 0.55);
  gauge([5.9, 2.6, -20.47], '+z', 0.8, 0.3);
  smudge([-4.4, 5.6, -20.47], '+z', 3.4, 2.4);
  girder([-7, 6.9, -20.3], [7, 6.9, -20.3], 0.5);
  // a mezzanine catwalk high on the south wall (out of reach), with its railing
  W.deco(-7, 4.6, -13.6, 7, 4.75, -12.5, 'grate', zone);
  rail([-7, 4.75, -13.55], [7, 4.75, -13.55], 0.9);

  // ===================================================================== THE CRUCIBLE
  sign('CRUCIBLE', [-26, 9.5, -12.97], '-z', 0.9);
  sign('CAUTION HEAT', [-9.97, 2.6, -21.5], '-x', 0.3, true);
  sign('03', [-43.97, 7, -29], '+x', 1.2);
  // the great crucible over the middle, pouring into the lava
  crucible([-31, 8.2, -28.5], 1.5, { tilt: -0.5, axis: 'z', to: -5.6, chainTop: 13 });
  for (const z of [-17, -25, -33]) girder([-44, 13, z], [-10, 13, z], 0.8);
  pipe([-43.7, 10.5, -13.3], [-43.7, 10.5, -36.7]);
  pipe([-10.3, 10.5, -13.3], [-10.3, 10.5, -21]);
  valve([-43.7, 3.2, -26], '+x');
  pipe([-43.75, -5.6, -26], [-43.75, 10.5, -26], 0.16, false);
  gear([-43.97, 6.5, -20], '+x', 1.8, 0.25);
  smudge([-43.97, 4, -18], '+x', 4, 4);
  smudge([-43.97, 4, -30], '+x', 4, 4);
  smudge([-27, 5, -36.97], '+z', 7, 4);

  // ===================================================================== THE SLAG RUN
  sign('SLAG RUN', [-6.2, 6.4, -34.28], '-z', 0.32);
  sign('KEEP CLEAR', [2, 6.6, -34.28], '-z', 0.22, true);
  sign('KEEP CLEAR', [2, 6.6, -37.22], '+z', 0.22, true);
  pipe([-9.3, 6.85, -34.5], [8.8, 6.85, -34.5], 0.13);
  pipe([-9.3, 6.85, -37], [8.8, 6.85, -37], 0.13);
  gear([-1, 2.2, -34.28], '-z', 1.1, 0.5);
  gear([4.4, 2.0, -37.22], '+z', 0.9, -0.6);
  gauge([-8, 5.3, -34.28], '-z', 0.5, 0.3);
  stripe(-3.05, 3.6, -37.25, -2.95, 4.02, -34.25);
  stripe(6.95, 3.6, -37.25, 7.05, 4.02, -34.25);

  // ===================================================================== THE GEARWORKS
  sign('GEARWORKS', [27, 12.6, -13.53], '-z', 0.8);
  sign('04', [9.53, 6.4, -33.5], '+x', 1.0);
  sign('CAUTION HEAT', [20, 9, -37.47], '+z', 0.3, true);
  sign('CAUTION HEAT', [36, 9, -37.47], '+z', 0.3, true);
  sign('HIGH PRESSURE', [43.97, 7.6, -18], '-x', 0.24, true);
  smudge([20, 9, -37.47], '+z', 5, 4);
  smudge([36, 9, -37.47], '+z', 5, 4);
  // gears everywhere: the hall's namesake
  gear([43.97, 11, -22], '-x', 2.2, 0.18);
  gear([43.97, 12.2, -17.6], '-x', 1.2, -0.33);
  gear([43.97, 9.4, -32.5], '-x', 1.4, -0.28);
  gear([32.5, 11.6, -37.47], '+z', 1.6, 0.3);
  gear([9.53, 11.7, -27], '+x', 1.8, -0.22);
  gear([9.53, 12.4, -23.3], '+x', 1.0, 0.4);
  // an ingot conveyor on an east-wall shelf, a grinder on the entry ledge's back wall
  W.deco(43.2, 5.95, -36, 44, 6.05, -15, 'metal', zone);
  conveyor([43.6, 6.25, -35.8], [43.6, 6.25, -15.2], { n: 12, speed: 0.9, width: 0.7 });
  grinder([11.2, 5.4, -37.47], '+z', [0.7, 0.4, 1]);
  for (const x of [17, 30]) girder([x, 14, -13.5], [x, 14, -37.5], 0.9);
  pipe([9.8, 13.3, -14], [43.7, 13.3, -14]);
  pipe([9.8, 0, -37.2], [9.8, 13.3, -37.2], 0.16, false);
  valve([43.7, 7.5, -36.2], '-x');
  valve([16.2, 11.8, -13.75], '-z');
  gauge([12.5, 6, -37.47], '+z', 0.65);
  gauge([13.3, 6, -37.47], '+z', 0.4);
  gauge([10.8, 10.6, -13.53], '-z', 0.8, 0.3);
  rail([9.6, 8.8, -20], [9.6, 8.8, -33], 1.0); // (wall side of the catwalk: a handhold, not a guard)

  // ===================================================================== THE QUENCH SHAFT
  sign('QUENCH SHAFT', [15, 13.62, -37.47], '+z', 0.3);
  sign('DROP', [18.4, 11.6, -37.47], '+z', 0.36, true);
  stripe(13.5, 9.98, -37.5, 16.5, 10.02, -37.1);
  stripe(13.05, 3, -42.45, 13.1, 9.8, -42.3);

  // ===================================================================== THE SMELTING FLOOR
  sign('SMELTING', [0, 6.2, -55.47], '+z', 0.8);
  sign('05', [19.47, 6.5, -52.5], '-x', 1.1);
  sign('CAUTION HEAT', [-14, 4.5, -55.47], '+z', 0.3, true);
  sign('CAUTION HEAT', [14, 4.5, -55.47], '+z', 0.3, true);
  sign('FORGE', [0, 4.0, -55.47], '+z', 0.36, true);
  smudge([-14, 4.6, -55.47], '+z', 7, 4);
  smudge([14, 4.6, -55.47], '+z', 7, 4);
  trolley({ y: 8.6, z: -50.5, x1: -9, x2: 7, speed: 1.1, drop: 2.6 }); // (between the pillars)
  // a tilted pot pouring into the west runnel
  crucible([-18.4, 4.8, -48.5], 1.0, { tilt: 0.55, axis: 'x', to: -0.5, chainTop: 10 });
  W.deco(-3, 2.8, -38.53, 12, 2.9, -39.3, 'metal', zone);
  conveyor([-2.8, 3.1, -38.9], [11.8, 3.1, -38.9], { n: 9, speed: 0.75, width: 0.7 });
  gear([19.47, 7.2, -47.5], '-x', 1.7, 0.24);
  gear([19.47, 8.6, -44.6], '-x', 0.9, -0.45);
  grinder([19.47, 1.6, -52], '-x', [-0.6, 0.5, 0.6]);
  pipe([-19.2, 9.4, -38.8], [-19.2, 9.4, -55.2]);
  pipe([19.2, 9.4, -43.3], [19.2, 9.4, -55.2]);
  valve([-19.2, 3.4, -40], '+x');
  pipe([-19.25, 0, -40], [-19.25, 9.4, -40], 0.14, false);
  gauge([-19.47, 2.2, -54], '+x', 0.75);
  gauge([-19.47, 2.2, -54.8], '+x', 0.5);
  stripe(-1.75, 0, -55.47, -1.6, CH, -55.43);
  stripe(1.6, 0, -55.47, 1.75, CH, -55.43);

  // ===================================================================== THE STAIRS UP TO THE ATRIUM
  sign('ATRIUM', [-1.47, 6.0, -95], '+x', 0.36);
  sign('06', [1.47, 6.0, -95], '-x', 0.6);
  pipe([-1.3, 6.9, -90.6], [-1.3, 6.9, -99.4], 0.12);
  pipe([1.3, 6.9, -90.6], [1.3, 6.9, -99.4], 0.12);
  rail([-1.42, 0.4, -90.9], [-1.42, 4.0, -99.2], 0.9);
  rail([1.42, 0.4, -90.9], [1.42, 4.0, -99.2], 0.9);
  gauge([1.47, 3.6, -93], '-x', 0.6, 0.3);

  // ===================================================================== heat on the lava: uplight and embers
  // (only on the sides of a pool that are walls: walls = 'nsew' letters, n = the -z side)
  for (const [x1, z1, x2, z2, top, walls = 'nsew'] of pools) {
    const h = Math.min(6, Math.max(2.2, (x2 - x1 + z2 - z1) / 8));
    if (walls.includes('n')) uplight([x1, 0, z1], [x2, 0, z1], top - 0.3, h, '+z');
    if (walls.includes('s')) uplight([x1, 0, z2], [x2, 0, z2], top - 0.3, h, '-z');
    if (walls.includes('w')) uplight([x1, 0, z1], [x1, 0, z2], top - 0.3, h, '+x');
    if (walls.includes('e')) uplight([x2, 0, z1], [x2, 0, z2], top - 0.3, h, '-x');
  }
  flush();

  // ---------------------------------------------------------------- the clock
  let flow = 0, emberT = 0;
  W.add({
    update(dt, player) {
      upMat.uniforms.uTime.value += dt;
      flow -= dt * 2.2 * heat;
      streamMat.uniforms.uFlow.value = flow;
      for (const f of anims) f(dt, player);
      for (const b of scanners) {
        b.position.y = 0.5 + 1.0 * (0.5 + 0.5 * Math.sin(W.time * 2.2));
        scanMat.opacity = 0.8 * heat;
      }
      if (heat <= 0) return;
      const fx = W.fx;
      // embers off the nearest lava, drifting up on the heat
      emberT -= dt;
      if (emberT <= 0) {
        emberT = 0.06 / heat;
        const pool = pools.find(([x1, z1, x2, z2, top]) => player.pos.x > x1 - 12 && player.pos.x < x2 + 12 && player.pos.z > z1 - 12 && player.pos.z < z2 + 12 && Math.abs(player.pos.y - top) < 16);
        if (pool) {
          const [x1, z1, x2, z2, top] = pool;
          const px = THREE.MathUtils.clamp(player.pos.x + (Math.random() - 0.5) * 22, x1, x2), pz = THREE.MathUtils.clamp(player.pos.z + (Math.random() - 0.5) * 22, z1, z2);
          fx.ember(_p.set(px, top + 0.2, pz), (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8, 0xff8a2a, 2.4 + Math.random() * 1.6, 0.05 + Math.random() * 0.05);
        }
      }
      for (const s of steam) {
        if (Math.abs(s.p.x - player.pos.x) > 25 || Math.abs(s.p.z - player.pos.z) > 25) continue;
        if ((s.t -= dt) > 0) continue;
        s.t = (0.12 + Math.random() * 0.1) / heat;
        fx.puff(s.p, s.n.x * 0.8 + (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.4, s.n.z * 0.8 + (Math.random() - 0.5) * 0.3, new THREE.Color(0xc8c0b8), 0.3, 1.1, 0.22, 3);
      }
      for (const gr of grinders) {
        if (gr.p.distanceTo(player.pos) > 22 || (gr.t -= dt) > 0) continue;
        gr.t = 0.07 + Math.random() * 0.08;
        fx.sparks(gr.p, gr.dir, 0xffc070, { count: 5, speed: 7, spread: 0.45, life: 0.45, gravity: 9 });
      }
      for (const s of splash) {
        if (s.p.distanceTo(player.pos) > 30 || (s.t -= dt) > 0) continue;
        s.t = 0.12;
        fx.ember(s.p, (Math.random() - 0.5) * 2.5, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5, 0xffa040, 0.6 + Math.random() * 0.4, 0.07);
      }
    },
  });

  return {
    setHeat(k) {
      heat = k;
      upMat.uniforms.uHeat.value = k;
      streamMat.uniforms.uHeat.value = k;
      moltenMat.color.copy(MOLTEN_COLD).lerp(MOLTEN, k);
      bandMat.color.copy(BAND_COLD).lerp(BAND, k);
      podGlowMat.color.copy(POD_COLD).lerp(POD, k);
    },
  };
}

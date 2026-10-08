// THE REACTOR HEART of the Prism Atrium: the machine god's engine, hung from the skylight over the dais.
//   heart: core centre (0, 23.2, -110), 18 m from tip to hanger — a pulsing white-violet core caged by armored ribs, three gimbal
//   rings, a crown and hanger plate cabled up to the skylight rings, and a beam down through the Prism
//   into the lift shaft (the Prism Core below). Four conduits draw each world's power into it:
//     red (Foundry)  — two magma arteries out of the south wall, over the red door, into the crown
//     solar          — a god-ray from a captive-sun lens high on the west wall, straight into the core
//     verdant        — braided roots out of the north wall, crawling up the stepped skylight into the crown
//     azure          — a glass conduit from the east wall, water climbing it into the heart's base
//   setDown(name, instant) kills a conduit: live shutdowns sputter out with sparks (or, if you're away,
//   replay as a flicker wave the first time you're back in the Hub); every conduit lost makes the
//   heartbeat more erratic and cracks its glow. Everything animates in shaders: no particles to speak of.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { audio } from '../audio.js';
import { regionOf } from './regions.js';

const HX = 0, HY = 23.2, HZ = -110; // the core's centre
const S = 1.5; // the heart is modelled at 1:1.5
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const H = (x, y, z) => V(HX + x * S, HY + y * S, HZ + z * S); // a point on the heart, in its own units

// ---------------------------------------------------------------- shaders
const NOISE = `
  float hsh(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  // value noise, periodic in y (tube uv.y wraps around)
  float vnp(vec2 p, float per){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float y0 = mod(i.y, per), y1 = mod(i.y + 1.0, per);
    return mix(mix(hsh(vec2(i.x, y0)), hsh(vec2(i.x + 1.0, y0)), f.x), mix(hsh(vec2(i.x, y1)), hsh(vec2(i.x + 1.0, y1)), f.x), f.y);
  }`;
const conduitVert = `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
// STYLE 0 magma · 1 water · 2 roots · 3 sun beam · 4 down beam · 5 glass · 6 sun disc
// uTime: flow phase (slows as it dies) · uPower: 1 alive → 0 dead · uFlick: momentary brightness · uLen: metres
const conduitFrag = `
  uniform float uTime; uniform float uPower; uniform float uFlick; uniform float uLen; uniform float uSeed;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  ${NOISE}
  void main(){
    float s = vUv.x * uLen;
    float live = clamp(uPower * uFlick, 0.0, 1.5);
    float facing = abs(dot(vN, vV));
    float fres = 1.0 - facing;
    vec3 col; float alpha = 1.0;
  #if STYLE == 0
    vec2 q = vec2(s * 0.9 - uTime * 1.6, vUv.y * 6.0);
    float n = vnp(q, 6.0) * 0.62 + vnp(q * 2.0 + 7.0, 12.0) * 0.38;
    float crust = smoothstep(mix(0.12, 0.56, uPower), mix(0.2, 0.7, uPower), n);
    float pulse = pow(0.5 + 0.5 * sin(s * 0.8 - uTime * 3.2), 6.0);
    vec3 hot = mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.78, 0.32), smoothstep(0.18, 0.0, abs(n - 0.42)) * 0.7 + pulse * 0.6);
    vec3 rock = vec3(0.07, 0.035, 0.03) * (0.55 + 0.45 * vN.y);
    vec3 alive = mix(hot * (1.6 + pulse * 1.4), rock + hot * 0.18, crust);
    vec3 dead = rock + vec3(0.22, 0.04, 0.01) * (1.0 - crust) * (0.5 + 0.5 * sin(s * 0.3 + uSeed));
    col = mix(dead, alive, clamp(live, 0.0, 1.0)) * (live > 1.0 ? live : 1.0);
  #elif STYLE == 1
    float a = vUv.y * 6.2832;
    float swirl = 0.5 + 0.5 * sin(a * 3.0 + s * 1.4 - uTime * 4.0);
    float n1 = vnp(vec2(s * 1.5 - uTime * 2.6, vUv.y * 8.0), 8.0);
    float n2 = vnp(vec2(s * 2.6 - uTime * 3.9 + 5.0, vUv.y * 16.0), 16.0);
    float ridge = pow(1.0 - abs(n1 - n2), 9.0);
    float pulse = pow(0.5 + 0.5 * sin(s * 0.7 - uTime * 2.4), 8.0);
    col = mix(vec3(0.02, 0.15, 0.4), vec3(0.42, 0.88, 1.1), swirl * 0.3 + ridge * 0.85 + fres * 0.45) + vec3(0.5, 0.9, 1.0) * pulse * 0.7;
    col *= max(live, 0.0);
    alpha = clamp((0.5 + ridge * 0.35 + fres * 0.3 + pulse * 0.2) * min(live, 1.0) + 0.05, 0.0, 1.0);
  #elif STYLE == 2
    float bark = vnp(vec2(s * 2.4, vUv.y * 10.0), 10.0);
    float lam = 0.4 + 0.6 * clamp(dot(vN, normalize(vec3(0.3, 1.0, 0.2))) * 0.5 + 0.5, 0.0, 1.0);
    vec3 base = mix(vec3(0.04, 0.08, 0.035), vec3(0.11, 0.19, 0.06), bark) * lam;
    vec3 grey = vec3(dot(base, vec3(0.33))) * vec3(1.15, 0.95, 0.75);
    base = mix(grey, base, uPower);
    float vein = smoothstep(0.84, 1.0, 0.5 + 0.5 * sin(vUv.y * 25.13 + bark * 3.0 + s * 0.35));
    float p = fract(s * 0.11 - uTime * 0.55 + uSeed);
    float glow = smoothstep(0.0, 0.85, p) * smoothstep(1.0, 0.92, p);
    col = base + vec3(0.32, 1.0, 0.3) * (vein * 0.3 + glow * glow * (0.55 + vein) * 1.7) * max(live, 0.0);
  #elif STYLE == 3
    float rays = 0.55 + 0.45 * vnp(vec2(vUv.y * 24.0, s * 0.25 - uTime * 0.35), 24.0);
    float motes = pow(vnp(vec2(vUv.y * 48.0, s * 1.6 - uTime * 2.8), 48.0), 14.0) * 5.0;
    float pulse = pow(0.5 + 0.5 * sin(s * 0.55 - uTime * 3.0), 6.0);
    float ends = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
    col = vec3(1.0, 0.76, 0.32) * (pow(facing, 1.6) * rays * (0.5 + pulse * 0.7) + motes * facing) * ends * max(live, 0.0);
  #elif STYLE == 4
    float pulse = pow(fract(-s * 0.18 + uTime * 0.9), 6.0);
    float shaft = smoothstep(5.2, 9.5, vW.y) * 0.75 + 0.25;
    float ends = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.97, vUv.x);
    col = vec3(0.82, 0.68, 1.0) * pow(facing, 1.3) * (0.55 + pulse * 1.6) * shaft * ends * max(live, 0.0);
  #elif STYLE == 5
    col = vec3(0.55, 0.8, 1.0) * (0.05 + fres * fres * 0.7) * (0.6 + 0.4 * uPower);
    alpha = clamp(0.1 + fres * 0.5, 0.0, 1.0);
  #else
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float boil = vnp(vec2(atan(c.y, c.x) * 3.0 + uTime * 0.3, r * 5.0 - uTime * 0.8), 1000.0) * 0.5 + vnp(c * 9.0 + uTime * 0.4, 1000.0) * 0.5;
    vec3 sun = mix(vec3(1.0, 0.55, 0.12), vec3(1.0, 0.95, 0.75), smoothstep(0.9, 0.1, r) * (0.6 + 0.4 * boil));
    vec3 dead = vec3(0.12, 0.06, 0.02) * (0.6 + 0.4 * boil);
    col = mix(dead, sun * (1.3 + 0.5 * boil), clamp(live, 0.0, 1.0));
  #endif
    gl_FragColor = vec4(clamp(col, 0.0, 3.0), alpha);
  }`;

// The core: a breathing white-violet organ with prismatic edges, a vein network and (as it destabilizes)
// dark plates split by white-hot cracks.
const coreVert = `
  uniform float uTime; uniform float uChaos;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    vec3 p = position;
    float n = sin(p.x * 2.1 + uTime * 1.3) * sin(p.y * 1.7 - uTime * 0.9) * sin(p.z * 2.3 + uTime * 1.1);
    p += normal * (n * 0.09 + uChaos * 0.06 * sin(uTime * 31.0 + p.y * 7.0));
    vP = position;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const coreFrag = `
  uniform float uTime; uniform float uBeat; uniform float uGlow; uniform float uCrack;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    float fres = 1.0 - abs(dot(vN, vV));
    vec3 q = vP * 1.6;
    float w = sin(q.x * 1.7 + sin(q.y * 2.3 + uTime * 0.4) * 1.2) * sin(q.y * 1.9 + sin(q.z * 1.7 - uTime * 0.3) * 1.2) * sin(q.z * 2.1 + sin(q.x * 1.5 + uTime * 0.5) * 1.2);
    float vein = 1.0 - smoothstep(0.0, 0.1, abs(w));
    vec3 k = vP * 3.4;
    float cw = sin(k.x * 1.3 + sin(k.y * 1.1) * 2.0) * sin(k.y * 1.2 + sin(k.z * 1.4) * 2.0) * sin(k.z * 1.1 + sin(k.x * 1.2) * 2.0);
    float crack = (1.0 - smoothstep(0.0, 0.1, abs(cw))) * uCrack;
    vec3 rainbow = 0.5 + 0.5 * cos(6.2832 * (fres * 0.9 + vP.y * 0.12 + uTime * 0.05 + vec3(0.0, 0.33, 0.67)));
    float body = 0.85 + uBeat * 0.8;
    vec3 col = vec3(0.62, 0.46, 1.0) * 0.6 * body + vec3(1.0, 0.94, 1.0) * pow(1.0 - fres, 3.0) * 0.75 * body;
    col += rainbow * fres * fres * 1.1;
    col += vec3(0.95, 0.85, 1.0) * vein * (0.5 + uBeat * 1.1);
    col *= 1.25 * uGlow * (1.0 - uCrack * 0.62);
    col += vec3(1.0, 0.82, 1.0) * crack * (2.2 + 0.8 * sin(uTime * 53.0 + vP.y * 9.0)) * (0.6 + 0.4 * uGlow);
    gl_FragColor = vec4(clamp(col, 0.0, 3.0), 1.0);
  }`;

// ---------------------------------------------------------------- geometry helpers
// Scale a TubeGeometry's radius along its length: f(u) multiplies the radius at u (0 start → 1 end).
function taper(geo, f) {
  const { path, tubularSegments: ts, radialSegments: rs } = geo.parameters;
  const pos = geo.attributes.position, c = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i <= ts; i++) {
    path.getPointAt(i / ts, c);
    const k = f(i / ts);
    for (let j = 0; j <= rs; j++) {
      const n = i * (rs + 1) + j;
      p.fromBufferAttribute(pos, n).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(n, p.x, p.y, p.z);
    }
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}
// a cylinder from a to b
function rod(a, b, r1, r2 = r1, seg = 8) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
// a hanging cable from a to b, sagging by `sag`
function cable(a, b, r, sag) {
  const m = a.clone().add(b).multiplyScalar(0.5);
  m.y -= sag;
  return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 16, r, 6, false);
}
// emissive pattern for the gimbal rings: a continuous inner channel and dashed outer lights
function ringTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#fff';
  g.fillRect(0, 26, 512, 12);
  for (let i = 0; i < 512; i += 16) {
    g.fillRect(i, 0, 11, 5);
    g.fillRect(i, 59, 11, 5);
  }
  g.fillStyle = '#888';
  for (let i = 8; i < 512; i += 64) g.fillRect(i, 14, 3, 36);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(230,210,255,0.55)');
  gr.addColorStop(0.45, 'rgba(150,110,255,0.16)');
  gr.addColorStop(1, 'rgba(90,60,200,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DARK = { color: 0x2a2c35, metalness: 0.8, roughness: 0.36 };

export function buildReactor(B) {
  const { W, game, light } = B;
  const tag = (c, text) => `<b style="color:${COLORS[c].css}">${text}</b>`;
  const add = (...o) => (W.scene.add(...o), o[0]);
  const armor = []; // world-space dark metal: ribs, crown, collars, cables (one mesh)
  const clampXf = []; // [position, quaternion, radius] for the pipe clamps (one instanced mesh)

  const conduitMat = (style, len, extra = {}) =>
    new THREE.ShaderMaterial({
      vertexShader: conduitVert,
      fragmentShader: conduitFrag,
      defines: { STYLE: style },
      uniforms: { uTime: { value: Math.random() * 50 }, uPower: { value: 1 }, uFlick: { value: 1 }, uLen: { value: len }, uSeed: { value: Math.random() * 10 } },
      ...extra,
    });
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

  // ---------------------------------------------------------------- the heart
  const heart = new THREE.Group();
  heart.position.set(HX, HY, HZ);
  heart.scale.setScalar(S);
  add(heart);
  const coreMat = new THREE.ShaderMaterial({
    vertexShader: coreVert,
    fragmentShader: coreFrag,
    uniforms: { uTime: { value: 0 }, uBeat: { value: 0 }, uGlow: { value: 1 }, uCrack: { value: 0 }, uChaos: { value: 0 } },
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 4), coreMat);
  heart.add(core);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, ...additive, opacity: 0.5 }));
  aura.scale.setScalar(17);
  heart.add(aura);

  // armored ribs (meridians), two latitude belts, crown, neck and hanger plate, base cone (heart-local,
  // placed with the heart's transform)
  const local = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.TorusGeometry(2.6, i % 2 ? 0.08 : 0.13, 6, 28, Math.PI);
    local.push(g.rotateZ(-Math.PI / 2).scale(1, 1.25, 1).rotateY((i / 6) * Math.PI * 2 + 0.3));
  }
  for (const h of [2.25, -2.25]) local.push(new THREE.TorusGeometry(1.92, 0.15, 6, 24).rotateX(Math.PI / 2).translate(0, h, 0));
  local.push(new THREE.CylinderGeometry(1.45, 2.0, 1.4, 10).translate(0, 3.7, 0)); // crown
  local.push(new THREE.CylinderGeometry(1.75, 1.75, 0.22, 10).translate(0, 4.45, 0));
  local.push(new THREE.CylinderGeometry(0.85, 1.05, 1.5, 8).translate(0, 5.2, 0)); // neck
  local.push(new THREE.CylinderGeometry(1.35, 1.35, 0.3, 10).translate(0, 6.0, 0)); // hanger plate
  local.push(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 8).translate(0, 6.35, 0)); // its mount on the skylight ring
  local.push(new THREE.ConeGeometry(1.5, 2.55, 10).rotateX(Math.PI).translate(0, -4.075, 0)); // base cone (tip clear of the Prism)
  local.push(new THREE.TorusGeometry(1.25, 0.14, 6, 20).rotateX(Math.PI / 2).translate(0, -3.3, 0));
  heart.updateMatrix();
  for (const g of local) armor.push(g.applyMatrix4(heart.matrix));
  const TIP = H(0, -5.35, 0);
  // hung from the skylight: cables from the hanger plate up and out to the stepped rings and the oculus
  const plate = H(0, 6.05, 0);
  const anchors = [[4.5, 35.2, -113.4, 0.24, 0.4], [7, 35.5, -124, 0.2, 1.2], [14.5, 32.6, -113.5, 0.17, 0.9], [9, 32.6, -108.4, 0.2, 0.5]];
  for (const [ax, ay, az, r, sag] of anchors)
    for (const s of [-1, 1]) {
      const b = V(s * ax, ay, az), d = b.clone().sub(plate).setY(0).normalize();
      armor.push(cable(plate.clone().addScaledVector(d, 1.5), b, r, sag));
      armor.push(new THREE.SphereGeometry(r * 2.2, 8, 6).translate(b.x, b.y - 0.1, b.z));
    }

  // gimbal rings: tilted, precessing at different rates, wobbling harder as the heart fails
  const ringTex = ringTexture();
  const rings = [
    { r: 3.9, tube: 0.22, tilt: 0.78, speed: 0.32, color: 0xc9a8ff },
    { r: 5.0, tube: 0.3, tilt: -0.48, speed: -0.2, color: 0x9bf6ff },
    { r: 5.9, tube: 0.38, tilt: 0.22, speed: 0.11, color: 0xe6d8ff },
  ].map((o, i) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x4a4e5c, metalness: 0.7, roughness: 0.34, emissive: o.color, emissiveMap: ringTex, emissiveIntensity: 1.6 });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(o.r, o.tube, 8, 64), m);
    mesh.rotation.x = Math.PI / 2;
    const tilt = new THREE.Group(), spin = new THREE.Group();
    tilt.rotation.z = o.tilt;
    tilt.add(mesh);
    spin.add(tilt);
    spin.rotation.y = i * 2.1;
    heart.add(spin);
    return { ...o, m, mesh, tiltG: tilt, spin };
  });

  // energy arcs: a few jagged bolts, flashed on in random directions (more of them, longer, as it fails)
  const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8dcff).multiplyScalar(2.2), ...additive });
  const arcs = [];
  for (let i = 0; i < 7; i++) {
    const path = new THREE.CurvePath();
    let p = V(0, 0, 0);
    for (let k = 1; k <= 7; k++) {
      const q = V(k / 7, (Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.16);
      if (k === 7) q.set(1, 0, 0);
      path.add(new THREE.LineCurve3(p, q));
      p = q;
    }
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 28, 0.02, 3, false), arcMat);
    mesh.visible = false;
    heart.add(mesh);
    arcs.push({ mesh, t: 0 });
  }

  // ---------------------------------------------------------------- the conduits
  const conduits = {};
  const tubeOf = (curve, r, segs = 64, radial = 10) => new THREE.TubeGeometry(curve, segs, r, radial, false);
  const intake = (curve, r) => {
    // a collar where a pipe meets the heart, and a flange where it leaves the wall
    const e = curve.getPointAt(1), t = curve.getTangentAt(1);
    armor.push(rod(e.clone().addScaledVector(t, -0.9), e.clone().addScaledVector(t, 0.1), r + 0.16, r + 0.22, 10));
    const s = curve.getPointAt(0), t0 = curve.getTangentAt(0);
    armor.push(rod(s.clone().addScaledVector(t0, -0.3), s.clone().addScaledVector(t0, 0.5), r + 0.3, r + 0.2, 10));
  };
  const clamps = (curve, r, every = 1.3) => {
    const len = curve.getLength(), n = Math.floor(len / every);
    for (let i = 1; i < n; i++) {
      const u = i / n, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      clampXf.push([p, new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), t), r + 0.07]);
    }
  };
  const sample = (curve, n = 24) => Array.from({ length: n }, (_, i) => curve.getPointAt((i + 0.5) / n));
  function conduit(name, color, label, meshes, mats, pts, extra = {}) {
    conduits[name] = { name, color, label, meshes, mats, pts, power: 1, flick: 1, time: Math.random() * 50, down: false, mode: 'live', timer: 0, hold: 0, ...extra };
  }

  // red — the Foundry: two magma arteries out of the south wall, either side of the red banner, into the crown
  {
    const mats = [], pts = [], meshes = [];
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([V(s * 5.5, 27.0, -100.2), V(s * 5.7, 28.0, -102.3), V(s * 5.2, 29.2, -105), V(s * 3.8, 29.3, -107.6), H(s * 1.75, 3.6, 0.55)]);
      const len = curve.getLength(), m = conduitMat(0, len);
      meshes.push(add(new THREE.Mesh(tubeOf(curve, 0.6, 48), m)));
      mats.push(m);
      intake(curve, 0.6);
      clamps(curve, 0.6, 2.2);
      pts.push(...sample(curve, 12));
      // the wall socket: a heavy dark box around the pipe
      W.deco(s * 5.5 - 1.1, 25.9, -100.05, s * 5.5 + 1.1, 28.1, -99.6, 'metal', 'hub');
    }
    conduit('red', RED, 'FOUNDRY', meshes, mats, pts, { speed: 1, spark: 0xff7a1a });
  }

  // solar — a captive sun behind a lens high on the west wall, its light poured into the core
  {
    const lensC = V(-24.12, 27.6, -117);
    const lensRing = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.24, 8, 36), new THREE.MeshStandardMaterial({ color: 0x6b5222, metalness: 0.9, roughness: 0.3, emissive: 0xffb43a, emissiveIntensity: 0.25 }));
    lensRing.rotation.y = Math.PI / 2;
    lensRing.position.copy(lensC);
    const discMat = conduitMat(6, 1);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.58, 36), discMat);
    disc.rotation.y = Math.PI / 2;
    disc.position.copy(lensC).x += 0.05;
    add(lensRing, disc);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      armor.push(rod(V(-24.45, lensC.y + Math.sin(a) * 2.25, lensC.z + Math.cos(a) * 2.25), V(-24.05, lensC.y + Math.sin(a) * 1.85, lensC.z + Math.cos(a) * 1.85), 0.12));
    }
    const curve = new THREE.LineCurve3(lensC.clone().add(V(0.1, 0, 0)), H(-1.0, 0.15, -0.3));
    const len = curve.getLength();
    const beamMat = conduitMat(3, len, { ...additive, side: THREE.DoubleSide });
    const beam = add(new THREE.Mesh(taper(tubeOf(curve, 1, 40, 20), (u) => 1.45 - 0.95 * u), beamMat));
    const haloMat = conduitMat(3, len, { ...additive });
    haloMat.uniforms.uFlick.value = 0.35;
    const halo = add(new THREE.Mesh(taper(tubeOf(curve, 1, 24, 16), (u) => 2.4 - 1.5 * u), haloMat));
    conduit('solar', YELLOW, 'SOLAR', [beam, halo, disc], [beamMat, haloMat, discMat], sample(curve, 16), { speed: 1, spark: 0xffc84a, lensMat: lensRing.material, haloScale: 0.35 });
  }

  // verdant — braided roots out of the north wall, crawling up the stepped skylight to the crown
  {
    const main = new THREE.CatmullRomCurve3(
      [V(-10, 29.3, -147.9), V(-9.2, 29.72, -145), V(-7.2, 30.4, -141.8), V(-5.2, 32.3, -139.8), V(-3.4, 34.9, -134.8), V(-1.0, 35.15, -128), V(0, 35.15, -120), V(0, 34.85, -114.2), V(0, 33.3, -112.4), V(0, 32.75, -111.4), V(0, 32.5, -110.9)],
      false, 'centripetal',
    );
    const N = 140, frames = main.computeFrenetFrames(N, false);
    const geos = [], pts = [];
    const strands = [[0.27, 0.42, 0], [0.2, 0.38, 2.1], [0.16, 0.45, 4.2]];
    for (const [r, off, ph] of strands) {
      const ps = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, c = main.getPointAt(u), a = u * 26 + ph;
        const o = off * (1 - 0.6 * u); // braid tightens toward the heart
        ps.push(c.addScaledVector(frames.normals[i], Math.cos(a) * o).addScaledVector(frames.binormals[i], Math.sin(a) * o));
      }
      const curve = new THREE.CatmullRomCurve3(ps);
      geos.push(taper(tubeOf(curve, r, 160, 7), (u) => 1.35 - 0.6 * u + 0.12 * Math.sin(u * 60 + ph)));
    }
    // a tendril or two splaying onto the wall and the rings
    for (const [a, b, c] of [[V(-10, 29.3, -147.9), V(-12.5, 28.2, -147.95), V(-14.2, 26.8, -147.95)], [V(-10, 29.3, -147.9), V(-7.6, 29.9, -147.95), V(-6.2, 29.55, -147.95)], [V(-5.2, 32.3, -139.8), V(-8.5, 32.55, -139.6), V(-11.5, 32.5, -139.2)], [V(-1.0, 35.15, -128), V(3.5, 35.18, -129), V(6.8, 35.15, -131)]])
      geos.push(taper(tubeOf(new THREE.QuadraticBezierCurve3(a, b, c), 0.12, 20, 5), (u) => 1.2 - 0.9 * u));
    const len = main.getLength();
    const m = conduitMat(2, len);
    const mesh = add(new THREE.Mesh(mergeGeometries(geos), m));
    // glowing buds along the braid
    const budMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dff7a).multiplyScalar(1.6) });
    const buds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.15, 0), budMat, 18);
    const mx = new THREE.Matrix4();
    for (let i = 0; i < 18; i++) {
      const u = 0.05 + (i / 18) * 0.85, f = Math.floor(u * N), c = main.getPointAt(u), a = i * 2.4;
      c.addScaledVector(frames.normals[f], Math.cos(a) * 0.45).addScaledVector(frames.binormals[f], Math.sin(a) * 0.45);
      mx.makeScale(1, 1, 1).setPosition(c);
      buds.setMatrixAt(i, mx);
    }
    buds.computeBoundingSphere();
    add(buds);
    pts.push(...sample(main, 20));
    W.deco(-11.4, 28.6, -148, -8.6, 30, -147.75, 'grate', 'hub'); // where the roots break through
    conduit('verdant', GREEN, 'VERDANT', [mesh, buds], [m], pts, { speed: 1, spark: 0x7dff6a, budMat });
  }

  // azure — a glass conduit out of the east wall; the water inside climbs it into the heart's base
  {
    const curve = new THREE.CatmullRomCurve3([V(24.4, 14, -118), V(21.5, 14.2, -117.6), V(15, 15.6, -116), V(8, 17.0, -113), V(4, 17.7, -111), H(1.05, -3.55, -0.2)]);
    const len = curve.getLength();
    const waterMat = conduitMat(1, len, { transparent: true, depthWrite: false });
    const glassMat = conduitMat(5, len, { transparent: true, depthWrite: false });
    const water = add(new THREE.Mesh(tubeOf(curve, 0.46, 64, 12), waterMat));
    const glass = add(new THREE.Mesh(tubeOf(curve, 0.66, 64, 14), glassMat));
    glass.renderOrder = 1;
    intake(curve, 0.66);
    clamps(curve, 0.66, 1.6);
    W.deco(24.15, 12.8, -119.2, 24.5, 15.2, -116.8, 'metal', 'hub');
    conduit('azure', BLUE, 'AZURE', [water, glass], [waterMat, glassMat], sample(curve, 16), { speed: 1, spark: 0x6ad8ff });
  }

  // the down-beam: from the heart's tip through the Prism into the lift shaft
  const downCurve = new THREE.LineCurve3(TIP.clone(), V(HX, 4.85, HZ));
  const downMat = conduitMat(4, downCurve.getLength(), { ...additive, side: THREE.DoubleSide });
  add(new THREE.Mesh(taper(tubeOf(downCurve, 0.32, 24, 14), (u) => 1.1 - 0.4 * u), downMat));

  // static dark metal, and the pipe clamps
  const armorMat = new THREE.MeshStandardMaterial({ ...DARK, emissive: 0x150c2a, emissiveIntensity: 1 });
  add(new THREE.Mesh(mergeGeometries(armor.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute('uv'), g))), armorMat));
  const clampMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.12, 6, 14), armorMat, clampXf.length);
  clampXf.forEach(([p, q, r], i) => clampMesh.setMatrixAt(i, new THREE.Matrix4().compose(p, q, V(r, r, r * 2))));
  clampMesh.computeBoundingSphere();
  add(clampMesh);

  const heartLight = light(HX, HY, HZ, 0xd6c4ff, 16, 46);

  // ---------------------------------------------------------------- state
  const list = Object.values(conduits);
  const pending = []; // shut down while you were away: replayed as a flicker wave when you're back
  let waveT = -1, waveDelay = 0, msgQueue = null, msgWait = 0;
  let beatAt = 0, nextBeat = 1.05, sputter = 0, hiccup = 0, crackleAt = 0, fxT = 0, puffT = 0, t = 0;
  let hum = null, prefetched = false;
  const inHub = (p) => regionOf(p) === 'hub' && p.y > 2;

  function setDown(name, instant = false) {
    const c = conduits[name];
    if (!c || c.down) return;
    c.down = true;
    if (instant) {
      c.mode = 'dead';
      c.power = 0;
      return;
    }
    if (inHub(game.player.pos)) return startDying(c, true);
    c.mode = 'dead';
    c.power = 0;
    pending.push(c);
  }

  // full: the live shutdown (2.6 s of stutter and sparks); otherwise a short last gasp for the flicker wave
  function startDying(c, full) {
    c.mode = 'dying';
    c.full = full;
    c.timer = 0;
    c.dur = full ? 2.6 : 1.3;
    c.power = full ? 1 : 0.8;
    if (full) {
      if (!audio.sample('reactor_powerdown', { gain: 0.9, vary: 0 })) {
        audio.tone({ type: 'sawtooth', f: 190, f2: 26, dur: 2.6, gain: 0.12, attack: 0.05 });
        audio.noise({ dur: 2.6, gain: 0.22, freq: 1600, f2: 70, type: 'lowpass', q: 2 });
      }
      queueMsg([c]);
    }
  }

  function queueMsg(cs) {
    const dark = list.filter((k) => k.down).length;
    const lines = {
      red: `The ${tag(RED, 'FOUNDRY')} conduit has gone dark: the heart has lost its geothermal fire.`,
      solar: `The ${tag(YELLOW, 'SOLAR')} conduit has gone dark: the captive sun no longer feeds the heart.`,
      verdant: `The ${tag(GREEN, 'VERDANT')} roots have withered: the heart is starved of life.`,
      azure: `The ${tag(BLUE, 'AZURE')} torrent has run dry: the heart falters.`,
    };
    msgQueue =
      dark >= 4
        ? 'Every conduit is dark. The heart above the dais is failing: <b>end it in the Prism Core below.</b>'
        : cs.length === 1
          ? lines[cs[0].name]
          : `The ${cs.map((k) => tag(k.color, k.label)).join(' and ')} conduits have gone dark. The heart falters.`;
    msgWait = 0;
  }

  function crackle(gain) {
    if (t - crackleAt < 0.12) return;
    crackleAt = t;
    if (!audio.sample('energy_crackle', { gain, vary: 0.25 })) audio.noise({ dur: 0.07 + Math.random() * 0.08, gain: gain * 0.5, freq: 2200 + Math.random() * 3500, q: 0.7 });
  }

  const tmp = V(0, 0, 0), dir = V(0, 0, 0), _c = new THREE.Color();
  W.add({
    update(dt, player) {
      t += dt;
      const here = inHub(player.pos);
      const dist = player.pos.distanceTo(heart.position);
      if (!prefetched && audio.available) {
        prefetched = true;
        audio.prefetch(['reactor_heartbeat', 'reactor_powerdown', 'energy_crackle']);
        hum = audio.createLoop(audio.available.has('reactor_hum') ? 'reactor_hum' : 'amb_core', { rate: audio.available.has('reactor_hum') ? 1 : 0.72 });
      }
      // the lead's world state, in case a shutdown happened without telling us
      for (const c of list) if (!c.down && game.isWorldDown?.(c.name)) setDown(c.name, W.time < 1.5);

      // back in the Hub after a shutdown elsewhere: a flicker wave, and the dead conduits' last gasp
      if (pending.length && here) {
        if ((waveDelay += dt) > 0.7) {
          waveT = 0;
          waveDelay = 0;
          hiccup = 1;
          pending.forEach((c) => startDying(c, false));
          queueMsg(pending.splice(0));
          if (!audio.sample('reactor_powerdown', { gain: 0.55, rate: 1.25, vary: 0 })) audio.noise({ dur: 1.2, gain: 0.18, freq: 1200, f2: 90, type: 'lowpass', q: 2 });
        }
      } else waveDelay = 0;
      if (waveT >= 0 && (waveT += dt) > 1.6) waveT = -1;
      const waveAt = (delay) => {
        const x = waveT - delay;
        if (waveT < 0 || x < 0 || x > 0.5) return 1;
        return Math.random() < 0.55 ? 0.15 : 1.25;
      };
      if (msgQueue && ((msgWait += dt) > 1.2 && (game.hud.msgTimer <= 0.3 || msgWait > 7))) {
        game.hud.message(msgQueue, 6);
        msgQueue = null;
      }

      // conduits: flow, sputter, die
      let lost = 0;
      list.forEach((c, i) => {
        if (c.mode === 'dying') {
          c.timer += dt;
          const k = Math.min(1, c.timer / c.dur);
          if ((c.hold -= dt) <= 0) {
            c.hold = 0.04 + Math.random() * 0.07;
            c.flick = Math.random() < 1 - k * 0.8 ? 0.7 + Math.random() * 0.8 : 0.06;
            c.stall = Math.random() < k * 0.6;
          }
          c.power = (c.full ? 1 - k * 0.45 : 0.8 - k * 0.5) * (k > 0.85 ? (1 - k) / 0.15 : 1);
          if (Math.random() < dt * (c.full ? 9 : 5)) {
            const p = c.pts[(Math.random() * c.pts.length) | 0];
            W.fx.sparks(p, dir.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize(), c.spark, { count: 7, speed: 7, life: 0.5 });
            if (dist < 40) crackle(0.4 * (1 - dist / 40));
          }
          if (k >= 1) {
            c.mode = 'dead';
            c.power = 0;
            c.flick = 1;
            hiccup = 1;
            W.fx.flash(heart.position, COLORS[c.color].hex, { size: 6, life: 0.35, k: 1.2 });
            W.fx.sparks(c.pts[c.pts.length - 1], dir.set(0, -1, 0), c.spark, { count: 24, speed: 9, spread: 1.2, life: 0.8 });
          }
        } else if (c.mode === 'live') {
          c.flick = 1;
          c.stall = false;
        }
        const w = waveAt(0.15 + i * 0.1);
        c.time = (c.time + dt * (c.stall ? 0.05 : 0.15 + 0.85 * c.power)) % 2000;
        for (const m of c.mats) {
          m.uniforms.uTime.value = c.time;
          m.uniforms.uPower.value = c.power;
          m.uniforms.uFlick.value = c.flick * w * (m === c.mats[1] && c.haloScale ? c.haloScale : 1);
        }
        if (c.lensMat) c.lensMat.emissiveIntensity = 0.1 + 0.5 * c.power * c.flick;
        if (c.budMat) c.budMat.color.set(0x7dff7a).multiplyScalar(0.12 + 1.5 * c.power * c.flick * w);
        lost += 1 - Math.min(1, c.power);
      });
      const chaos = lost / 4;

      // heartbeat: a steady lub-dub that grows quick, ragged and skipping as conduits die
      if (t - beatAt > nextBeat) {
        beatAt = t;
        const r = Math.random();
        nextBeat = 1.05 * (1 - 0.3 * chaos) * (1 + (Math.random() - 0.5) * 1.1 * chaos);
        if (r < 0.22 * chaos) nextBeat = 0.22 + Math.random() * 0.12; // a flutter
        else if (r > 1 - 0.12 * chaos) nextBeat *= 2.2; // a skipped beat
        if (here && dist < 70 && !audio.sample('reactor_heartbeat', { gain: 0.8 * (1 - dist / 70), vary: 0.04 * (1 + chaos * 3) })) {
          const g = 0.5 * (1 - dist / 70);
          audio.tone({ type: 'sine', f: 64, f2: 36, dur: 0.34, gain: g, attack: 0.01 });
          audio.tone({ type: 'sine', f: 58, f2: 33, dur: 0.3, gain: g * 0.6, attack: 0.01, delay: 0.19 });
        }
      }
      const bt = t - beatAt;
      const beat = Math.exp(-bt * 9) + (bt > 0.19 ? 0.55 * Math.exp(-(bt - 0.19) * 10) : 0);
      // sputters: the glow drops out for a moment (only once it has started to fail)
      if (sputter > 0) sputter -= dt;
      else if (Math.random() < dt * (chaos * chaos * 3.5)) {
        sputter = 0.05 + Math.random() * 0.12;
        if (here && dist < 45) crackle(0.35 * (1 - dist / 45));
      }
      hiccup = Math.max(0, hiccup - dt * 1.4);
      const hw = waveAt(0);
      const glow = (sputter > 0 ? 0.3 : 1 - 0.1 * lost) * hw * (1 - 0.6 * hiccup * (Math.sin(t * 40) > 0 ? 1 : 0));
      const u = coreMat.uniforms;
      u.uTime.value = t % 1000;
      u.uBeat.value = beat;
      u.uGlow.value = glow;
      u.uCrack.value += (Math.min(1, chaos * 1.15) - u.uCrack.value) * Math.min(1, dt * 2);
      u.uChaos.value = chaos;
      const s = 1 + beat * 0.055;
      core.scale.set(s, s * 1.2, s);
      aura.material.opacity = Math.min(1, (0.5 + beat * 0.35) * glow);
      aura.scale.setScalar(15 + beat * 2.5);
      heartLight.intensity = (11 + beat * 12) * glow;
      heartLight.color.setRGB(0.84, 0.77 - 0.12 * chaos, 1);

      // the rings precess; failing, they wobble and shudder
      rings.forEach((R, i) => {
        R.spin.rotation.y += dt * R.speed * (1 + chaos * 0.8);
        R.tiltG.rotation.z = R.tilt + Math.sin(t * (0.6 + i * 0.3)) * 0.08 + chaos * Math.sin(t * (2.3 + i)) * (i === 2 ? 0.05 : 0.12) + hiccup * Math.sin(t * 30 + i) * 0.06;
        R.m.emissiveIntensity = (0.7 + beat * 1.1) * glow * (1 - 0.35 * chaos);
      });

      // arcs: rare and short while healthy; constant, long and crackling when all four are dead
      const arcRate = 0.5 + chaos * 16 + hiccup * 14;
      for (const a of arcs) {
        if (a.mesh.visible) {
          if ((a.t -= dt) <= 0) a.mesh.visible = false;
          else a.mesh.rotation.x += (Math.random() - 0.5) * 0.4;
          continue;
        }
        if (Math.random() < (dt * arcRate) / arcs.length) {
          a.mesh.visible = true;
          a.t = 0.05 + Math.random() * 0.1;
          const len = 3.4 + Math.random() * (2.4 + chaos * 4);
          a.mesh.scale.set(len, len * 0.6, len * 0.6);
          a.mesh.quaternion.setFromUnitVectors(V(1, 0, 0), dir.set(Math.random() - 0.5, (Math.random() - 0.5) * 1.2, Math.random() - 0.5).normalize());
          if (here && dist < 40 && chaos > 0.2) crackle(0.25 * chaos * (1 - dist / 40));
        }
      }
      const avg = 1 - chaos;
      downMat.uniforms.uTime.value = t % 1000;
      downMat.uniforms.uPower.value = 0.35 + 0.65 * avg;
      downMat.uniforms.uFlick.value = glow * (chaos > 0.5 && Math.random() < chaos * 0.25 ? 0.2 : 1);

      // a little life while you're here: steam off the crown, an ember, a mote, a spore
      if (here) {
        if ((puffT -= dt) <= 0) {
          puffT = 0.45;
          tmp.copy(heart.position).add(dir.set((Math.random() - 0.5) * 4, 3.6 * S, (Math.random() - 0.5) * 4));
          W.fx.puff(tmp, (Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4, _c.set(0xb8a8e8), 0.22, 2.6, 0.9);
        }
        if ((fxT -= dt) <= 0) {
          fxT = 0.16;
          const c = list[(Math.random() * list.length) | 0];
          if (c.power > 0.5) {
            const p = c.pts[(Math.random() * c.pts.length) | 0];
            if (c.name === 'red') W.fx.ember(p, (Math.random() - 0.5) * 1.5, Math.random(), (Math.random() - 0.5) * 1.5, 0xff7a1a, 1.4, 0.09);
            else W.fx.burst(p, c.spark, { count: 1, speed: 0.4, life: 2.2, size: 0.13, gravity: c.name === 'azure' ? -0.6 : -0.15, drag: 0.4, spread: 0.6 });
          }
        }
      }
      // the hum: deep and steady, wavering as it fails
      if (hum) {
        hum.setGain(here ? 0.42 * Math.max(0, 1 - dist / 55) * (0.55 + 0.45 * glow) : 0);
        hum.setRate((audio.available.has('reactor_hum') ? 1 : 0.72) * (1 - 0.06 * chaos + 0.04 * chaos * Math.sin(t * 7)));
      }
    },
  });

  // the lead's power-source state: shutdowns as they happen, and (restored) ones already done
  game.onPowerDown?.((name, { restored } = {}) => setDown(name, !!restored));

  // service points for the Hub's worker drones (entities/workerDrone.js): the crown, the base cone, the
  // stretches of conduit well clear of the rings, the sun lens. `avoid` is the rings' swept cylinder.
  const sites = [];
  const site = (p, look, conduit = null) => sites.push({ p, look, conduit, busy: null });
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + 0.35 + (i / 4) * (Math.PI - 0.7); // the crown's north half (magma arteries come from the south)
    site(V(HX + Math.cos(a) * 4.4, 30, HZ + Math.sin(a) * 4.4), V(HX + Math.cos(a) * 2.6, 29.2, HZ + Math.sin(a) * 2.6));
  }
  for (const a of [1.9, Math.PI, 4.4]) site(V(HX + Math.cos(a) * 2.9, 16.8, HZ + Math.sin(a) * 2.9), V(HX + Math.cos(a) * 1.15, 16.9, HZ + Math.sin(a) * 1.15));
  const far = (p) => Math.hypot(p.x - HX, p.z - HZ) > 10.6;
  for (const p of conduits.red.pts) if (far(p) && p.z < -101.6) site(p.clone().add(V(Math.sign(p.x) * 1.5, -0.8, 0)), p, 'red');
  conduits.azure.pts.forEach((p, i) => far(p) && p.x < 21 && i % 2 === 0 && site(p.clone().add(V(0, 1.35, 0.3)), p, 'azure'));
  conduits.verdant.pts.forEach((p, i) => far(p) && p.z > -136 && p.z < -112 && i % 2 === 0 && site(p.clone().add(V(0, -1.35, 0)), p, 'verdant'));
  for (const [dy, dz] of [[1.5, 0], [-1.5, 0], [0, 1.7], [0, -1.7]]) site(V(-22.2, 27.6 + dy, -117 + dz), V(-24, 27.6 + dy * 1.15, -117 + dz * 1.1), 'solar');

  return { setDown, conduits, heart, sites, avoid: { x: HX, z: HZ, r: 10.2, y1: 17.6, y2: 29.2 } };
}

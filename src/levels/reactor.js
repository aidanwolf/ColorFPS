// THE REACTOR HEART of the Prism Atrium: the machine god's engine, hung from the skylight's oculus over the
// middle of the Atrium (about equally far from all four world doors), above the sunken compass plaza.
//   heart: core centre (0, 25.5, -124), 18 m from tip to hanger — a pulsing white-violet core caged by armored
//   ribs, three gimbal rings, a crown and hanger plate on the oculus cross, cabled out to the skylight rings,
//   and a beam down through the Prism onto the Prism lift in the dais below. Four glass feeds, one per world, run
//   from beside each world's door into the heart's base, that world's energy flowing inside:
//     red (Foundry)  — magma, out of the south wall beside the red door
//     solar          — liquid sunlight, out of a captive-sun lens on the west wall
//     verdant        — green sap, out of the north wall where the roots break through
//     azure          — water, out of the east wall (the Spillway's conduit feeds it from outside)
//   setDown(name, restored) marks a world's power source shut down. Its feed blows the next time you're in
//   the Atrium (rupture: a surge runs up it, bursting collar after collar, then a blast at the heart, which
//   shudders); afterwards only dark, sparking stubs are left. A save that already saw it blow (game.events
//   has 'feed_<name>') restores the stubs. Every feed lost makes the heartbeat more erratic and cracks its glow.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { audio } from '../audio.js';
import { regionOf } from './regions.js';

const HX = 0, HY = 25.5, HZ = -124; // the core's centre: under the oculus, its mount on the oculus cross
const S = 1.5; // the heart is modelled at 1:1.5
const PLAZA_Y = 2.8; // the sunken plaza's floor (hub.js), where the down-beam lands
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const H = (x, y, z) => V(HX + x * S, HY + y * S, HZ + z * S); // a point on the heart, in its own units
// a feed rupture: the stubs left standing at the wall and at the heart (m), the wind-up (s), the blast's speed (m/s)
const STUB_WALL = 1.6, STUB_HEART = 1.7, WIND = 0.75, RUSH = 11;

// every sound played here (a sample that was never fetched plays nothing)
audio.manifest?.then(() =>
  audio.prefetch(['reactor_heartbeat', 'reactor_powerdown', 'energy_crackle', 'titan_steam', 'crab_explode', 'glass_hit', 'shatter', 'drone_explode', 'boss_slam', 'warp_shatter', 'lava_sizzle']),
);

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
// uStyle 0 magma · 1 water · 2 roots · 4 down beam · 5 glass · 6 sun disc · 7 energy fluid (sunlight, sap)
// (a uniform, not a define: every style shares one program)
// uTime: flow phase (slows as it dies) · uPower: 1 alive → 0 dead · uFlick: momentary brightness · uLen: metres
// uTint: the world's color · uCutA..uCutB: the blown-out stretch (metres; jagged ends, nothing drawn between)
// uEdge: the glow of the break edges · uSurge, uSurgeK: where the rupture's pressure wave is, and how hot
const conduitFrag = `
  uniform int uStyle;
  uniform float uTime; uniform float uPower; uniform float uFlick; uniform float uLen; uniform float uSeed;
  uniform vec3 uTint; uniform float uCutA; uniform float uCutB; uniform float uEdge; uniform float uSurge; uniform float uSurgeK;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  ${NOISE}
  void main(){
    float s = vUv.x * uLen;
    float jag = (vnp(vec2(vUv.y * 9.0, uSeed * 3.0), 9.0) - 0.5) * 0.9 + (hsh(vec2(floor(vUv.y * 23.0), uSeed)) - 0.5) * 0.4;
    float ca = uCutA + jag, cb = uCutB - jag;
    if (s > ca && s < cb) discard;
    float edge = uEdge * (1.0 - smoothstep(0.0, 0.45, min(abs(s - ca), abs(s - cb))));
    float surge = uSurgeK * exp(-(s - uSurge) * (s - uSurge) * 0.5);
    float live = clamp(uPower * uFlick, 0.0, 1.5);
    float facing = abs(dot(vN, vV));
    float fres = 1.0 - facing;
    vec3 col; float alpha = 1.0;
  if (uStyle == 0) {
    vec2 q = vec2(s * 0.9 - uTime * 1.6, vUv.y * 6.0);
    float n = vnp(q, 6.0) * 0.62 + vnp(q * 2.0 + 7.0, 12.0) * 0.38;
    float crust = smoothstep(mix(0.12, 0.56, uPower), mix(0.2, 0.7, uPower), n);
    float pulse = pow(0.5 + 0.5 * sin(s * 0.8 - uTime * 3.2), 6.0);
    vec3 hot = mix(vec3(1.0, 0.04, 0.07), vec3(1.0, 0.26, 0.3), smoothstep(0.18, 0.0, abs(n - 0.42)) * 0.7 + pulse * 0.6); // crimson, the blaster's red (orange would read as yellow)
    vec3 rock = vec3(0.07, 0.035, 0.03) * (0.55 + 0.45 * vN.y);
    vec3 alive = mix(hot * (1.25 + pulse * 1.2), rock + hot * 0.18, crust);
    vec3 dead = rock + vec3(0.22, 0.02, 0.03) * (1.0 - crust) * (0.5 + 0.5 * sin(s * 0.3 + uSeed));
    col = mix(dead, alive, clamp(live, 0.0, 1.0)) * (live > 1.0 ? live : 1.0);
  } else if (uStyle == 1) {
    float a = vUv.y * 6.2832;
    float swirl = 0.5 + 0.5 * sin(a * 3.0 + s * 1.4 - uTime * 4.0);
    float n1 = vnp(vec2(s * 1.5 - uTime * 2.6, vUv.y * 8.0), 8.0);
    float n2 = vnp(vec2(s * 2.6 - uTime * 3.9 + 5.0, vUv.y * 16.0), 16.0);
    float ridge = pow(1.0 - abs(n1 - n2), 9.0);
    float pulse = pow(0.5 + 0.5 * sin(s * 0.7 - uTime * 2.4), 8.0);
    col = mix(vec3(0.02, 0.15, 0.4), vec3(0.42, 0.88, 1.1), swirl * 0.3 + ridge * 0.85 + fres * 0.45) + vec3(0.5, 0.9, 1.0) * pulse * 0.7;
    col *= max(live, 0.0);
    alpha = clamp((0.5 + ridge * 0.35 + fres * 0.3 + pulse * 0.2) * min(live, 1.0) + 0.05, 0.0, 1.0);
  } else if (uStyle == 2) {
    float bark = vnp(vec2(s * 2.4, vUv.y * 10.0), 10.0);
    float lam = 0.4 + 0.6 * clamp(dot(vN, normalize(vec3(0.3, 1.0, 0.2))) * 0.5 + 0.5, 0.0, 1.0);
    vec3 base = mix(vec3(0.04, 0.08, 0.035), vec3(0.11, 0.19, 0.06), bark) * lam;
    vec3 grey = vec3(dot(base, vec3(0.33))) * vec3(1.15, 0.95, 0.75);
    base = mix(grey, base, uPower);
    float vein = smoothstep(0.84, 1.0, 0.5 + 0.5 * sin(vUv.y * 25.13 + bark * 3.0 + s * 0.35));
    float p = fract(s * 0.11 - uTime * 0.55 + uSeed);
    float glow = smoothstep(0.0, 0.85, p) * smoothstep(1.0, 0.92, p);
    col = base + vec3(0.32, 1.0, 0.3) * (vein * 0.3 + glow * glow * (0.55 + vein) * 1.7) * max(live, 0.0);
  } else if (uStyle == 4) {
    float pulse = pow(fract(-s * 0.18 + uTime * 0.9), 6.0);
    float shaft = smoothstep(2.8, 7.5, vW.y) * 0.6 + 0.4;
    float ends = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.985, vUv.x);
    col = vec3(0.82, 0.68, 1.0) * pow(facing, 1.3) * (0.55 + pulse * 1.6) * shaft * ends * max(live, 0.0);
  } else if (uStyle == 5) {
    col = mix(vec3(0.55, 0.8, 1.0), uTint, 0.3) * (0.05 + fres * fres * 0.7) * (0.6 + 0.4 * uPower) + uTint * 0.04 * uPower;
    alpha = clamp(0.1 + fres * 0.5, 0.0, 1.0);
  } else if (uStyle == 7) {
    float n1 = vnp(vec2(s * 1.1 - uTime * 2.2, vUv.y * 8.0), 8.0);
    float n2 = vnp(vec2(s * 2.4 - uTime * 3.6 + 3.0, vUv.y * 16.0), 16.0);
    float band = pow(0.5 + 0.5 * sin(s * 0.9 - uTime * 3.0 + n1 * 2.5), 4.0);
    float motes = pow(n2, 8.0) * 3.0;
    vec3 alive = uTint * (0.5 + 0.9 * n1 + band * 1.3 + fres * 0.4) + vec3(1.0, 0.95, 0.8) * (motes + band * 0.3);
    vec3 dead = uTint * 0.05 * (0.4 + n1) + vec3(0.025);
    col = mix(dead, alive, clamp(live, 0.0, 1.0)) * (live > 1.0 ? live : 1.0);
  } else {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float boil = vnp(vec2(atan(c.y, c.x) * 3.0 + uTime * 0.3, r * 5.0 - uTime * 0.8), 1000.0) * 0.5 + vnp(c * 9.0 + uTime * 0.4, 1000.0) * 0.5;
    vec3 sun = mix(vec3(1.0, 0.55, 0.12), vec3(1.0, 0.95, 0.75), smoothstep(0.9, 0.1, r) * (0.6 + 0.4 * boil));
    vec3 dead = vec3(0.12, 0.06, 0.02) * (0.6 + 0.4 * boil);
    col = mix(dead, sun * (1.3 + 0.5 * boil), clamp(live, 0.0, 1.0));
  }
    col += uTint * (edge * 2.6 + surge * 1.8) + vec3(surge * surge * 0.4);
    alpha = max(alpha, max(edge, surge * 0.6));
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

// The feed-conduit material (also used by the Foundry core's pipes): see conduitFrag for uStyle and the other uniforms.
export function conduitMaterial(style, len, extra = {}, tint = 0xffffff) {
  return new THREE.ShaderMaterial({
    vertexShader: conduitVert,
    fragmentShader: conduitFrag,
    uniforms: {
      uStyle: { value: style },
      uTime: { value: Math.random() * 50 }, uPower: { value: 1 }, uFlick: { value: 1 }, uLen: { value: len }, uSeed: { value: Math.random() * 10 },
      uTint: { value: new THREE.Color(tint) }, uCutA: { value: -10 }, uCutB: { value: -10 }, uEdge: { value: 0 }, uSurge: { value: -99 }, uSurgeK: { value: 0 },
    },
    ...extra,
  });
}

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
const rnd = (a, b) => a + Math.random() * (b - a);

export function buildReactor(B) {
  const { W, game, light } = B;
  const tag = (c, text) => `<b style="color:${COLORS[c].css}">${text}</b>`;
  const add = (...o) => (W.scene.add(...o), o[0]);
  const armor = []; // world-space dark metal: ribs, crown, collars, cables (one mesh)
  const armorMat = new THREE.MeshStandardMaterial({ ...DARK, emissive: 0x150c2a, emissiveIntensity: 1 });

  const conduitMat = conduitMaterial;
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
  local.push(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 8).translate(0, 6.35, 0)); // its mount under the oculus cross
  local.push(new THREE.ConeGeometry(1.5, 2.55, 10).rotateX(Math.PI).translate(0, -4.075, 0)); // base cone
  local.push(new THREE.TorusGeometry(1.25, 0.14, 6, 20).rotateX(Math.PI / 2).translate(0, -3.3, 0));
  heart.updateMatrix();
  for (const g of local) armor.push(g.applyMatrix4(heart.matrix));
  const TIP = H(0, -5.35, 0);
  // hung from the oculus cross, and cabled out to the stepped skylight rings: long stays to the middle
  // ring's corners, short ones to the top ring's east and west bars
  const plate = H(0, 6.05, 0);
  const anchors = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) anchors.push([V(HX + sx * 14.5, 32.55, HZ + sz * 14.5), 0.22, 1.1], [V(HX + sx * 10.2, 35.15, HZ + sz * 3.6), 0.17, 0.35]);
  for (const [b, r, sag] of anchors) {
    const d = b.clone().sub(plate).setY(0).normalize();
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
    return { ...o, m, mesh, tiltG: tilt, spin, stutter: 0 };
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

  // ---------------------------------------------------------------- the feeds
  const conduits = {};
  const tubeOf = (curve, r, segs = 64, radial = 10) => new THREE.TubeGeometry(curve, segs, r, radial, false);
  const intake = (curve, r) => {
    // a collar where a pipe meets the heart, and a flange where it leaves the wall
    const e = curve.getPointAt(1), t = curve.getTangentAt(1);
    armor.push(rod(e.clone().addScaledVector(t, -0.9), e.clone().addScaledVector(t, 0.1), r + 0.16, r + 0.22, 10));
    const s = curve.getPointAt(0), t0 = curve.getTangentAt(0);
    armor.push(rod(s.clone().addScaledVector(t0, -0.3), s.clone().addScaledVector(t0, 0.5), r + 0.3, r + 0.2, 10));
  };
  const sample = (curve, n = 24) => Array.from({ length: n }, (_, i) => curve.getPointAt((i + 0.5) / n));
  const sleeveGeo = new THREE.TorusGeometry(1, 0.1, 6, 16), bandGeo = new THREE.TorusGeometry(1, 0.035, 4, 24);
  const m4 = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // A glass feed from a world's wall into the heart's base, that world's energy flowing inside it, with
  // banded collars every ~1.7 m (a dark sleeve, a band lit in the world's color) that burst off when it blows.
  function feed(name, color, label, pts, { style, tint, spark, r = 0.44, gr = 0.64, ...extra }) {
    const curve = new THREE.CatmullRomCurve3(pts);
    const len = curve.getLength();
    const fluidMat = conduitMat(style, len, style === 1 ? { transparent: true, depthWrite: false } : {}, tint);
    const glassMat = conduitMat(5, len, { transparent: true, depthWrite: false }, tint);
    const fluid = add(new THREE.Mesh(tubeOf(curve, r, 80, 12), fluidMat));
    const glass = add(new THREE.Mesh(tubeOf(curve, gr, 80, 14), glassMat));
    glass.renderOrder = 1;
    intake(curve, gr);
    const n = Math.floor(len / 1.7), cols = [];
    for (let i = 1; i < n; i++) {
      const u = i / n;
      cols.push({ s: u * len, p: curve.getPointAt(u), t: curve.getTangentAt(u), on: true });
    }
    const sleeves = new THREE.InstancedMesh(sleeveGeo, armorMat, cols.length);
    const bandMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(tint) });
    const bands = new THREE.InstancedMesh(bandGeo, bandMat, cols.length);
    const q = new THREE.Quaternion(), R = gr + 0.06;
    cols.forEach((k, i) => {
      q.setFromUnitVectors(V(0, 0, 1), k.t);
      sleeves.setMatrixAt(i, m4.compose(k.p, q, V(R, R, R * 2.6)));
      bands.setMatrixAt(i, m4.compose(k.p, q, V(R * 1.1 + 0.012, R * 1.1 + 0.012, R)));
    });
    for (const m of [sleeves, bands]) {
      m.computeBoundingSphere();
      add(m);
    }
    const c = (conduits[name] = {
      name, color, label, curve, len, cols, sleeves, bands, bandMat, spark, style,
      tint: new THREE.Color(tint), mats: [fluidMat, glassMat], aux: [], pts: sample(curve, 16),
      A: STUB_WALL, B: len - STUB_HEART, mid: curve.getPointAt(0.62), end: curve.getPointAt(1),
      power: 1, flick: 1, time: Math.random() * 50, down: false, mode: 'live', timer: 0, hold: 0,
      cut: false, front: 0, edge: 0, surge: -99, surgeK: 0, titleT: -1, titleWait: 0, dripT: 0,
      ...extra,
    });
    return c;
  }

  // red — the Foundry: magma, out of the south wall just east of the red door, climbing over the Atrium
  // floor's east side (low enough to be right in view as you walk in: it's the one that blows first)
  {
    const c = feed('red', RED, 'FOUNDRY', [V(8, 10.2, -100.15), V(8, 10.5, -102.6), V(6.9, 12.4, -108.6), V(4.3, 15.2, -114.4), V(1.6, 17.9, -119), V(0.2, 19.6, -121.3), H(0, -3.55, 1.05)], {
      style: 0, tint: 0xff3344, spark: 0xff4a50,
    });
    W.deco(6.7, 8.9, -100.4, 9.3, 11.5, -100, 'metal', 'hub'); // the wall socket
    c.drip = (p) => W.fx.ember(p, rnd(-0.3, 0.3), rnd(-1.2, 0), rnd(-0.3, 0.3), 0xff3a40, rnd(1, 1.6), rnd(0.05, 0.08));
  }

  // solar — liquid sunlight, poured out of a captive sun behind a lens on the west wall
  {
    const lensC = V(-24.12, 15.2, -118);
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
    const c = feed('solar', YELLOW, 'SOLAR', [V(-23.95, 15.2, -118), V(-21.5, 15.3, -118.2), V(-15, 16.3, -120), V(-8.5, 17.8, -122.6), V(-4.4, 19.3, -123.7), H(-1.05, -3.55, 0)], {
      style: 7, tint: 0xffb02e, spark: 0xffc84a, lensMat: lensRing.material,
    });
    c.aux.push(discMat);
    c.drip = (p) => W.fx.burst(p, 0xffc84a, { count: 2, speed: 0.6, life: 1.4, size: 0.14, gravity: 1.5, drag: 0.5 });
  }

  // verdant — green sap, out of the north wall beside the gate's banner, where roots break through the wall
  // and grip the feed
  {
    const c = feed('verdant', GREEN, 'VERDANT', [V(-6.4, 16.6, -147.9), V(-6.2, 16.8, -145.5), V(-4.6, 17.6, -139), V(-2.0, 18.8, -132.5), V(-0.4, 19.6, -128.2), H(0, -3.55, -1.05)], {
      style: 7, tint: 0x46ff4a, spark: 0x7dff6a,
    });
    const geos = [], s0 = c.curve.getPointAt(0), fr = c.curve.computeFrenetFrames(60, false);
    // tendrils splaying over the wall from the flange
    for (const [dx, dy] of [[-2.6, -1.3], [2.0, -1.1], [-1.9, 1.7], [1.5, 2.1], [0.3, -2.5], [-3.2, 0.4]])
      geos.push(taper(tubeOf(new THREE.QuadraticBezierCurve3(s0.clone().add(V(dx * 0.2, dy * 0.2, 0.25)), s0.clone().add(V(dx * 0.55, dy * 0.55, 0.12)), s0.clone().add(V(dx, dy, -0.02))), 0.12, 16, 5), (u) => 1.2 - 0.9 * u));
    // two roots coiled round the stub
    for (const ph of [0, Math.PI]) {
      const ps = [];
      for (let i = 0; i <= 14; i++) {
        const u = (i / 14) * (1.3 / c.len), f = Math.round(u * 60), a = ph + i * 0.85;
        ps.push(c.curve.getPointAt(u).addScaledVector(fr.normals[f], Math.cos(a) * 0.76).addScaledVector(fr.binormals[f], Math.sin(a) * 0.76));
      }
      geos.push(taper(tubeOf(new THREE.CatmullRomCurve3(ps), 0.11, 32, 5), (u) => 1.3 - 0.8 * u));
    }
    const rootMat = conduitMat(2, 4);
    add(new THREE.Mesh(mergeGeometries(geos), rootMat));
    c.aux.push(rootMat);
    W.deco(-7.9, 15.1, -148, -4.9, 18.1, -147.75, 'grate', 'hub'); // where the roots break through
    c.drip = (p) => W.fx.burst(p, 0x7dff6a, { count: 2, speed: 0.4, life: 1.2, size: 0.12, gravity: 6, drag: 0.4 });
  }

  // azure — water, out of the east wall (the Spillway's glass conduit meets it outside)
  {
    const c = feed('azure', BLUE, 'AZURE', [V(24.4, 14, -118), V(21.5, 14.2, -118.2), V(15, 15.6, -120), V(8.5, 17.4, -122.6), V(4.4, 19.2, -123.7), H(1.05, -3.55, 0)], {
      style: 1, tint: 0x4ab8ff, spark: 0x6ad8ff,
    });
    W.deco(24.15, 12.8, -119.2, 24.5, 15.2, -116.8, 'metal', 'hub');
    c.drip = (p) => W.fx.burst(p, 0x9fe0ff, { count: 3, speed: 0.5, life: 0.9, size: 0.1, gravity: 9, drag: 0.2 });
  }

  // the down-beam: from the heart's tip into the sunken plaza's compass (the Prism Core lies below it)
  const downCurve = new THREE.LineCurve3(TIP.clone(), V(HX, PLAZA_Y + 0.05, HZ));
  const downMat = conduitMat(4, downCurve.getLength(), { ...additive, side: THREE.DoubleSide });
  add(new THREE.Mesh(taper(tubeOf(downCurve, 0.32, 24, 14), (u) => 1.1 - 0.4 * u), downMat));
  const poolMat = new THREE.MeshBasicMaterial({ map: aura.material.map, color: 0xd8c8ff, ...additive, opacity: 0.6 });
  const pool = add(new THREE.Mesh(new THREE.CircleGeometry(1.6, 28).rotateX(-Math.PI / 2), poolMat));
  pool.position.set(HX, PLAZA_Y + 0.05, HZ);

  // static dark metal
  add(new THREE.Mesh(mergeGeometries(armor.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute('uv'), g))), armorMat));

  const heartLight = light(HX, HY, HZ, 0xd6c4ff, 16, 46);

  // ---------------------------------------------------------------- state
  const list = Object.values(conduits);
  let msgQueue = null, msgWait = 0, dwell = 0;
  let beatAt = 0, nextBeat = 1.05, sputter = 0, hiccup = 0, jolt = 0, kick = 0, crackleAt = 0, fxT = 0, puffT = 0, t = 0;
  const kickColor = new THREE.Color();
  let hum = null;
  const inHub = (p) => regionOf(p) === 'hub' && p.y > 2;
  const P = game.player;
  const near = (p, far) => Math.max(0, 1 - p.distanceTo(P.pos) / far);
  const shake = (v) => (P.shake = Math.max(P.shake || 0, v));

  // A world's power source is down. Seen blow already (restored from a save that saw it): the stubs. Otherwise
  // the feed runs on the last of the pressure until you're next in the Atrium, then blows.
  function setDown(name, restored = false) {
    const c = conduits[name];
    if (!c || c.down) return;
    c.down = true;
    if (restored && game.events?.has('feed_' + name)) return breakNow(c);
    c.mode = 'pending';
  }

  const pointAt = (c, s, out = V(0, 0, 0)) => c.curve.getPointAt(THREE.MathUtils.clamp(s / c.len, 0, 1), out);
  const hideCollar = (c, i) => {
    c.cols[i].on = false;
    c.sleeves.setMatrixAt(i, ZERO);
    c.bands.setMatrixAt(i, ZERO);
    c.sleeves.instanceMatrix.needsUpdate = c.bands.instanceMatrix.needsUpdate = true;
  };
  function breakNow(c) {
    c.mode = 'dead';
    c.power = 0;
    c.cut = true;
    c.front = c.B;
    c.edge = 0.22;
    c.cols.forEach((k, i) => k.s > c.A && k.s < c.B && hideCollar(c, i));
  }

  // the blow-out: a surge winds up at the wall, then the glass bursts collar by collar up to the heart
  function rupture(c) {
    c.mode = 'dying';
    c.timer = 0;
    c.front = c.A;
    const w = c.curve.getPointAt(0.03);
    audio.at('titan_steam', w, { gain: 0.8, near: 8, far: 70, rate: 0.85, vary: 0 }) || audio.sample('titan_steam', { gain: 0.5, rate: 0.85 });
    crackle(0.6);
  }

  // one collar (or the wall stub) bursting: glass, the world's energy spilling, sparks, a ring of shrapnel
  const _p = V(0, 0, 0), _d = V(0, 0, 0), _c = new THREE.Color(), GLASS = new THREE.Color(0xd8f2ff);
  function pop(c, p, tan, k) {
    W.fx.flash(p, c.spark, { size: 2.4 + k * 1.5, life: 0.22, k: 2, hot: 0.55 });
    W.fx.ring(p, tan, c.spark, { size: 0.3, end: 2.8 + k * 2.5, life: 0.36, thick: 0.12, k: 1.7 });
    // a fireball of whatever burst out
    for (let j = 0; j < 4 + k * 4; j++) W.fx.puff(p, rnd(-1.5, 1.5), rnd(-0.5, 1.5), rnd(-1.5, 1.5), _c.set(c.spark), 0.75, rnd(0.45, 0.8), rnd(0.5, 0.9) * (1 + k * 0.5), 3);
    W.fx.sparks(p, _d.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize(), c.spark, { count: 14 + k * 20, speed: 12, spread: 2.4, life: 0.5, gravity: 7 });
    for (let j = 0, n = 10 + k * 14; j < n; j++) {
      _d.set(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(2, 6 + k * 4));
      const i = W.fx.shard(p, _d.x, _d.y, _d.z, GLASS, rnd(0.9, 1.4), rnd(1, 1.8), rnd(0.06, 0.15), rnd(1.4, 2.6));
      W.fx.grav[i] = 12;
      W.fx.drag[i] = 0.5;
    }
    // what was flowing in it
    if (c.style === 0) {
      for (let j = 0, n = 8 + k * 14; j < n; j++) W.fx.ember(p, rnd(-3, 3), rnd(-1, 4), rnd(-3, 3), 0xff3a40, rnd(1.2, 2.2), rnd(0.06, 0.12));
      for (let j = 0; j < 3 + k * 4; j++) W.fx.puff(p, rnd(-1, 1), rnd(0.3, 1.2), rnd(-1, 1), _c.set(0xff3a44), 0.22, rnd(1.2, 2), rnd(0.4, 0.7), 2.6);
    } else W.fx.burst(p, c.spark, { count: 14 + k * 24, speed: 4 + k * 3, life: 1.3, size: 0.18, gravity: c.style === 1 ? 9 : 3, drag: 0.6 });
  }

  // the blast where the feed meets the heart: it bucks, a ring stutters, the light flares the feed's color
  function boom(c, i) {
    const p = c.end;
    pop(c, p, c.curve.getTangentAt(1), 2);
    W.fx.flash(p, c.spark, { size: 9, life: 0.4, k: 2, hot: 0.4 });
    W.fx.flash(heart.position, 0xffffff, { size: 6, life: 0.25, k: 1.6, hot: 1 });
    W.fx.ring(p, UP, c.spark, { size: 0.6, end: 13, life: 0.6, thick: 0.08, k: 1.8 });
    W.fx.ring(p, null, 0xffffff, { size: 0.4, end: 7, life: 0.35, thick: 0.1, k: 1.2 });
    for (let j = 0; j < 4; j++) W.fx.sparks(p, _d.set(rnd(-1, 1), rnd(-1, 0.5), rnd(-1, 1)).normalize(), c.spark, { count: 22, speed: 16, spread: 1.2, life: 0.8, gravity: 8 });
    for (let j = 0; j < 14; j++) {
      _d.set(rnd(-1, 1), rnd(-0.6, 0.8), rnd(-1, 1)).normalize();
      W.fx.puff(_p.copy(p).addScaledVector(_d, rnd(0.5, 2.5)), _d.x * 3, _d.y * 3, _d.z * 3, _c.set(c.spark), 1.1, rnd(0.8, 1.4), rnd(1.6, 2.8), 2.4);
    }
    // red-hot shrapnel raining down out of it
    for (let j = 0; j < 24; j++) {
      const i = W.fx.shard(p, rnd(-6, 6), rnd(-2, 5), rnd(-6, 6), _c.set(0xffa070), 0.7, rnd(1.6, 2.4), rnd(0.12, 0.25), rnd(1, 1.8));
      W.fx.grav[i] = 14;
    }
    const d = p.distanceTo(P.pos);
    if (!audio.sample('drone_explode', { gain: 1, rate: 0.75, vary: 0 })) audio.noise({ dur: 1.4, gain: 0.5, freq: 900, f2: 60, type: 'lowpass', q: 1 });
    audio.sample('boss_slam', { gain: 0.7 * Math.max(0.4, near(p, 70)), rate: 0.9, vary: 0 });
    audio.sample('warp_shatter', { gain: 0.5, rate: 1.1, vary: 0 });
    audio.sample('reactor_powerdown', { gain: 0.85, vary: 0, delay: 0.3 });
    if (c.style === 0) audio.sample('lava_sizzle', { gain: 0.45, delay: 0.15 });
    audio.slam?.(0.25, 0.4, 1.8);
    shake(0.85 * Math.max(0.35, 1 - d / 60));
    hiccup = 1;
    jolt = 1;
    kick = 1;
    kickColor.copy(c.tint);
    rings[(i + 2) % 3].stutter = 3.2;
    c.mode = 'dead';
    c.power = 0;
    c.flick = 1;
    c.front = c.B;
    c.edge = 1;
    c.surgeK = 0;
    c.titleT = 1.1;
    c.titleWait = 0;
    dwell = 0.6; // (a second feed due as well waits a beat)
    game.events?.add('feed_' + c.name);
    game.save?.();
    // a world finished and its feed just blew in front of you: the natural break for a Bonus Round, once
    // the title has had its moment
    setTimeout(() => game.naturalBreak?.(), 4500);
  }

  function queueMsg(cs) {
    const dark = list.filter((k) => k.down).length;
    const lines = {
      red: `The ${tag(RED, 'FOUNDRY')} feed is severed: the heart has lost its geothermal fire.`,
      solar: `The ${tag(YELLOW, 'SOLAR')} feed is severed: the captive sun no longer feeds the heart.`,
      verdant: `The ${tag(GREEN, 'VERDANT')} feed is severed: the heart is starved of life.`,
      azure: `The ${tag(BLUE, 'AZURE')} feed is severed: the heart falters.`,
    };
    msgQueue =
      dark >= 4
        ? 'Every feed is severed. The heart over the Atrium is failing: <b>end it in the Prism Core below.</b>'
        : cs.length === 1
          ? lines[cs[0].name]
          : `The ${cs.map((k) => tag(k.color, k.label)).join(' and ')} feeds are severed. The heart falters.`;
    msgWait = 0;
  }

  function crackle(gain) {
    if (t - crackleAt < 0.12) return;
    crackleAt = t;
    if (!audio.sample('energy_crackle', { gain, vary: 0.25 })) audio.noise({ dur: 0.07 + Math.random() * 0.08, gain: gain * 0.5, freq: 2200 + Math.random() * 3500, q: 0.7 });
  }

  const tmp = V(0, 0, 0), dir = V(0, 0, 0), look = V(0, 0, 0);
  W.add({
    update(dt, player) {
      t += dt;
      const here = inHub(player.pos);
      const dist = player.pos.distanceTo(heart.position);
      if (!hum && audio.available) {
        const has = audio.available.has('reactor_hum');
        hum = audio.createLoop(has ? 'reactor_hum' : 'amb_core', { rate: has ? 1 : 0.72 });
      }
      // the lead's world state, in case a shutdown happened without telling us
      for (const c of list) if (!c.down && game.isWorldDown?.(c.name)) setDown(c.name, true);

      // in the Atrium with a feed due to blow: a moment to look round (up at the heart), then it goes
      const busy = list.some((c) => c.mode === 'dying');
      if (here) dwell += dt;
      else dwell = 0;
      const due = !busy && here && list.find((c) => c.mode === 'pending');
      if (due && dwell > 1) {
        game.camera.getWorldDirection(look);
        if (dwell > 2.6 || look.dot(dir.copy(due.mid).sub(game.camera.position).normalize()) > 0.55) rupture(due);
      }
      if (msgQueue && ((msgWait += dt) > 1.2 && (game.hud.msgTimer <= 0.3 || msgWait > 7))) {
        game.hud.message(msgQueue, 6);
        msgQueue = null;
      }

      // feeds: flow, strain, blow, smoulder
      let lost = 0;
      list.forEach((c, i) => {
        if (c.mode === 'pending') {
          // running on the last of the pressure: it stutters now and then
          if ((c.hold -= dt) <= 0) {
            const stall = Math.random() < 0.25;
            c.hold = stall ? rnd(0.05, 0.14) : rnd(0.4, 1.6);
            c.flick = stall ? rnd(0.3, 0.6) : 1;
          }
        } else if (c.mode === 'dying') {
          c.timer += dt;
          const wall = c.curve.getPointAt(0.04, tmp);
          if (c.timer < WIND) {
            // the surge builds at the wall end: the flow races, the tube strains and flickers
            const k = c.timer / WIND;
            c.flick = 1 + k * (0.3 + Math.random() * 0.7);
            c.surge = c.A * 0.6;
            c.surgeK = k * 1.6;
            if (Math.random() < dt * 20) W.fx.sparks(wall, dir.set(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize(), c.spark, { count: 6, speed: 7, life: 0.4 });
          } else {
            if (!c.cut) {
              // the wall end goes first
              c.cut = true;
              pop(c, pointAt(c, c.A, _p), c.curve.getTangentAt(c.A / c.len), 1);
              audio.at('crab_explode', _p, { gain: 1, near: 6, far: 70, rate: 0.85, gap: 0 }) || audio.sample('crab_explode', { gain: 0.6 });
              audio.at('shatter', _p, { gain: 0.8, near: 6, far: 70, gap: 0 });
              shake(0.35 * Math.max(0.3, near(_p, 50)));
            }
            const prev = c.front;
            c.front = Math.min(c.B, c.A + (c.timer - WIND) * RUSH);
            c.flick = 1.1 + Math.random() * 0.4;
            c.surge = c.front + 1.3;
            c.surgeK = 1.7;
            c.edge = 1;
            // the collars it reaches burst; the glass between them showers down
            let n = 0;
            c.cols.forEach((k, j) => {
              if (!k.on || k.s <= prev || k.s > c.front || k.s >= c.B) return;
              hideCollar(c, j);
              pop(c, k.p, k.t, 0);
              const u = (k.s - c.A) / (c.B - c.A);
              audio.at(n++ % 2 ? 'glass_hit' : 'crab_explode', k.p, { gain: 0.85, near: 6, far: 65, rate: 0.9 + 0.3 * u, gap: 0.03, key: 'feed_pop' });
              if (j % 3 === 0) audio.at('shatter', k.p, { gain: 0.5, near: 6, far: 60, rate: 1.1 + 0.2 * u, gap: 0.05, key: 'feed_glass' });
              shake(0.32 * Math.max(0.25, near(k.p, 45)));
            });
            if (Math.random() < dt * 30) {
              pointAt(c, rnd(prev - 1.5, c.front), _p);
              const sh = W.fx.shard(_p, rnd(-1.5, 1.5), rnd(-1, 2), rnd(-1.5, 1.5), GLASS, 1.1, rnd(1, 1.6), rnd(0.05, 0.12), 2);
              W.fx.grav[sh] = 12;
            }
            if (c.front >= c.B) boom(c, i);
          }
        } else if (c.mode === 'live') {
          c.flick = 1;
        } else if (c.cut) {
          // the stubs: the break edges cool, spit sparks and drip what's left
          c.edge = Math.max(0.22, c.edge - dt * 0.18);
          if (here && (c.dripT -= dt) <= 0) {
            c.dripT = rnd(0.25, 0.7);
            const end = Math.random() < 0.5 ? pointAt(c, c.A - 0.1, _p) : pointAt(c, c.B + 0.15, _p);
            if (end.distanceTo(player.pos) < 50) {
              c.drip?.(end);
              if (Math.random() < 0.45) {
                W.fx.sparks(end, dir.set(rnd(-1, 1), rnd(-1, 0.4), rnd(-1, 1)).normalize(), c.spark, { count: 6, speed: 6, life: 0.45, gravity: 9 });
                if (end.distanceTo(player.pos) < 30) crackle(0.25 * near(end, 30));
              }
            }
          }
        }
        // its HUD beat, once the arrival title is out of the way
        if (c.titleT > 0 && (c.titleT -= dt) <= 0) {
          if (game.hud.zoneTimer > 0.1 && (c.titleWait += dt) < 4) c.titleT = 1e-4;
          else {
            game.hud.zoneTitle('REACTOR HEART', `${c.label} FEED SEVERED`, COLORS[c.color].css, 3.2);
            queueMsg([c]);
          }
        }
        c.time = (c.time + dt * (c.mode === 'dying' ? 2.2 : 0.15 + 0.85 * c.power)) % 2000;
        for (const m of [...c.mats, ...c.aux]) {
          const u = m.uniforms;
          u.uTime.value = c.time;
          u.uPower.value = c.power;
          u.uFlick.value = c.flick;
        }
        for (const m of c.mats) {
          const u = m.uniforms;
          u.uCutA.value = c.cut ? c.A : -10;
          u.uCutB.value = c.cut ? c.front : -10;
          u.uEdge.value = c.edge;
          u.uSurge.value = c.surge;
          u.uSurgeK.value = c.surgeK;
        }
        c.bandMat.color.copy(c.tint).multiplyScalar(0.12 + 1.5 * c.power * Math.min(c.flick, 1.4));
        if (c.lensMat) c.lensMat.emissiveIntensity = 0.1 + 0.5 * c.power * c.flick;
        lost += 1 - Math.min(1, c.power);
      });
      const chaos = lost / 4;

      // heartbeat: a steady lub-dub that grows quick, ragged and skipping as feeds die
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
      hiccup = Math.max(0, hiccup - dt * 0.7);
      jolt = Math.max(0, jolt - dt * 0.8);
      kick = Math.max(0, kick - dt * 1.2);
      const glow = (sputter > 0 ? 0.3 : 1 - 0.1 * lost) * (1 - 0.6 * hiccup * (Math.sin(t * 40) > 0 ? 1 : 0));
      const u = coreMat.uniforms;
      u.uTime.value = t % 1000;
      u.uBeat.value = beat;
      u.uGlow.value = glow + kick * 0.8;
      u.uCrack.value += (Math.min(1, chaos * 1.15) - u.uCrack.value) * Math.min(1, dt * 2);
      u.uChaos.value = Math.min(1, chaos + jolt);
      const s = 1 + beat * 0.055;
      core.scale.set(s, s * 1.2, s);
      // the blast bucks the core in its cage
      core.position.set((Math.random() - 0.5) * jolt * 0.3, (Math.random() - 0.5) * jolt * 0.3, (Math.random() - 0.5) * jolt * 0.3);
      aura.material.opacity = Math.min(1, (0.5 + beat * 0.35) * glow + kick * 0.5);
      aura.scale.setScalar(15 + beat * 2.5 + kick * 8);
      heartLight.intensity = (11 + beat * 12) * glow + kick * 40;
      heartLight.color.setRGB(0.84, 0.77 - 0.12 * chaos, 1).lerp(kickColor, kick * 0.85);
      poolMat.opacity = (0.35 + beat * 0.4) * glow * (0.4 + 0.6 * (1 - chaos));

      // the rings precess; failing, they wobble and shudder; a blast leaves one stuttering for a few seconds
      rings.forEach((R, i) => {
        const st = (R.stutter = Math.max(0, R.stutter - dt)) / 3.2;
        const jerk = st > 0 ? (Math.random() < 0.35 ? 7 : -0.4) * st + (1 - st) : 1;
        R.spin.rotation.y += dt * R.speed * (1 + chaos * 0.8) * jerk;
        R.tiltG.rotation.z = R.tilt + Math.sin(t * (0.6 + i * 0.3)) * 0.08 + chaos * Math.sin(t * (2.3 + i)) * (i === 2 ? 0.05 : 0.12) + hiccup * Math.sin(t * 30 + i) * 0.06 + st * Math.sin(t * 19 + i * 2) * 0.16;
        R.m.emissiveIntensity = (0.7 + beat * 1.1) * glow * (1 - 0.35 * chaos) * (st > 0 && Math.random() < 0.45 * st ? 0.1 : 1);
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
            if (c.name === 'red') W.fx.ember(p, (Math.random() - 0.5) * 1.5, Math.random(), (Math.random() - 0.5) * 1.5, 0xff3a40, 1.4, 0.09);
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

  // service points for the Hub's worker drones (entities/workerDrone.js): round the crown, the base cone
  // between the feeds' intakes, the stretches of feed well clear of the rings, the sun lens. `avoid` is
  // the rings' swept cylinder.
  const sites = [];
  const site = (p, look, conduit = null) => sites.push({ p, look, conduit, busy: null });
  for (let i = 0; i < 6; i++) {
    const a = 0.3 + (i / 6) * Math.PI * 2;
    site(V(HX + Math.cos(a) * 4.4, HY + 6.8, HZ + Math.sin(a) * 4.4), V(HX + Math.cos(a) * 2.6, HY + 6, HZ + Math.sin(a) * 2.6));
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    site(V(HX + Math.cos(a) * 2.9, HY - 6.4, HZ + Math.sin(a) * 2.9), V(HX + Math.cos(a) * 1.15, HY - 6.3, HZ + Math.sin(a) * 1.15));
  }
  const clear = (p) => Math.hypot(p.x - HX, p.z - HZ) > 10.6 && Math.abs(p.x) < 22 && p.z < -102 && p.z > -146;
  for (const c of list) c.pts.forEach((p, i) => clear(p) && i % 2 === 0 && site(p.clone().add(V(0, 1.35, 0)), p, c.name));
  for (const [dy, dz] of [[1.5, 0], [-1.5, 0], [0, 1.7], [0, -1.7]]) site(V(-22.2, 15.2 + dy, -118 + dz), V(-24, 15.2 + dy * 1.15, -118 + dz * 1.1), 'solar');

  return { setDown, conduits, heart, sites, avoid: { x: HX, z: HZ, r: 10.2, y1: HY - 5.6, y2: HY + 6 } };
}

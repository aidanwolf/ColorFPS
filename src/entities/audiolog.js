// An audio log, waiting: no device, just a ghostly shimmer where Wren once stood and talked to her recorder.
// A faint flickering column of light over a projector glyph on the floor, light motes drifting up through
// it, now and then the after-image of a woman standing there; a hair-thin beam above it so it can be spotted
// from across a room, and a breathy whisper when you're near. Walk into it: her hologram materializes and
// the log plays (story/recorder.js, story/ghost.js); it's gone for good (remembered across reloads).
import * as THREE from 'three';
import { audio } from '../audio.js';

const HOLO = 0x8fe6ff;
const HOVER = 1.15; // the trigger's centre above the floor point (where the old recorder hovered)
const MOTES = 36;
const WHISPER_NEAR = 11; // m: the whisper starts this close
let shared = null;

const BILL_VERT = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
void main() {
  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = cameraPosition - c;
  toCam.y = 0.0;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));
  vec3 w = c + right * position.x + vec3(0.0, position.y, 0.0);
  vUv = uv;
  vSeed = fract(c.x * 0.1371 + c.z * 0.3113);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
// the column, the hotspot, the thin beam, and the after-image of her (a soft signed-distance silhouette)
const BILL_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
float seg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
void main() {
  float x = (vUv.x - 0.5) * 1.4, y = vUv.y * 6.0;
  float t = uTime + vSeed * 40.0;
  float column = exp(-x * x * 26.0) * smoothstep(0.0, 0.35, y) * exp(-max(0.0, y - 1.3) * 1.1);
  float beam = exp(-x * x * 3000.0) * smoothstep(6.0, 1.6, y) * smoothstep(1.0, 2.2, y);
  float hot = exp(-(x * x * 1.0 + (y - 1.15) * (y - 1.15)) * 14.0);
  // her after-image: head, neck, body, arms, legs (she has the recorder up to her mouth)
  vec2 p = vec2(x, y);
  float d = length(p - vec2(0.0, 1.6)) - 0.1;
  d = min(d, seg(p, vec2(0.0, 1.0), vec2(0.0, 1.38), 0.14));
  d = min(d, seg(p, vec2(-0.08, 0.1), vec2(-0.07, 0.92), 0.06));
  d = min(d, seg(p, vec2(0.08, 0.1), vec2(0.07, 0.92), 0.06));
  d = min(d, seg(p, vec2(0.19, 1.38), vec2(0.21, 0.82), 0.045));
  d = min(d, seg(p, vec2(-0.19, 1.38), vec2(-0.2, 1.12), 0.045));
  d = min(d, seg(p, vec2(-0.2, 1.12), vec2(-0.06, 1.48), 0.04));
  float sil = smoothstep(0.03, -0.02, d) * 0.25 + smoothstep(0.035, 0.0, abs(d)) * 0.7;
  // she's only there now and then, for a breath
  float appear = pow(max(0.0, sin(t * 0.37) * sin(t * 0.23 + 1.3)), 3.0) * 1.6;
  float scan = 0.65 + 0.35 * sin(y * 140.0 - uTime * 4.0);
  float flick = 0.82 + 0.18 * sin(t * 17.0) * sin(t * 5.3);
  flick *= step(0.04, fract(sin(floor(t * 9.0)) * 4375.85)); // the odd dropped frame
  float a = (column * 0.22 + beam * 0.5 + hot * 0.4 + sil * appear * smoothstep(0.0, 0.4, y)) * scan * flick;
  gl_FragColor = vec4(vec3(0.42, 1.25, 1.6), clamp(a, 0.0, 1.0));
}`;
// the projector glyph on the floor: two rings, one dashed and turning, a soft pool
const GLYPH_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 1.6;
  float r = length(p), a = atan(p.y, p.x);
  float ring = smoothstep(0.012, 0.0, abs(r - 0.56));
  float dash = smoothstep(0.01, 0.0, abs(r - 0.46)) * step(0.5, fract(a * 1.91 + uTime * 0.12));
  float ticks = smoothstep(0.03, 0.0, abs(r - 0.66)) * step(0.85, fract(a * 3.82 - uTime * 0.05));
  float pool = exp(-r * r * 9.0) * 0.3;
  float flick = 0.8 + 0.2 * sin(uTime * 11.0 + r * 9.0);
  gl_FragColor = vec4(vec3(0.42, 1.2, 1.55), (ring * 0.5 + dash * 0.35 + ticks * 0.3 + pool) * flick * smoothstep(0.8, 0.7, r));
}`;
const GLYPH_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const MOTE_VERT = /* glsl */ `
attribute vec4 seed;
uniform float uTime, uScale;
varying float vA;
void main() {
  float life = fract(uTime * (0.05 + seed.x * 0.08) + seed.y);
  float ang = seed.z * 6.2832 + uTime * (0.25 + seed.w * 0.35);
  float r = 0.06 + seed.w * 0.3 + life * 0.08;
  vec3 p = vec3(cos(ang) * r, 0.15 + seed.z * 0.6 + life * 1.6, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = sin(3.14159 * life) * (0.35 + 0.65 * fract(seed.y * 9.7 + uTime * 0.9));
  gl_PointSize = (0.02 + seed.x * 0.02) * uScale / max(0.2, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const MOTE_FRAG = /* glsl */ `
varying float vA;
void main() {
  float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA;
  gl_FragColor = vec4(0.55, 1.35, 1.7, a);
}`;

function assets() {
  if (shared) return shared;
  const uniforms = { uTime: { value: 0 }, uScale: { value: 600 } }; // one clock for every log
  const add = (vertexShader, fragmentShader) =>
    new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const mg = new THREE.BufferGeometry();
  const seeds = new Float32Array(MOTES * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  mg.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
  mg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.2);
  shared = {
    uniforms,
    bill: add(BILL_VERT, BILL_FRAG),
    glyph: add(GLYPH_VERT, GLYPH_FRAG),
    mote: add(MOTE_VERT, MOTE_FRAG),
    billGeo: new THREE.PlaneGeometry(1.4, 6).translate(0, 3, 0),
    glyphGeo: new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2),
    moteGeo: mg,
  };
  return shared;
}

// The whisper: one breathy voice for whichever log is nearest (filtered noise wandering through vowel-like
// formants, gated into phrases, with a faint glassy shimmer), panned toward it, through the world loops bus
// (so it hushes while paused).
const whisper = { best: Infinity, pos: new THREE.Vector3(), frame: -1, nodes: null };
function whisperNodes() {
  const ctx = audio.ctx;
  if (whisper.nodes || !ctx || !audio.loopBus || !audio.noiseBuf) return whisper.nodes;
  const out = ctx.createGain();
  out.gain.value = 0;
  const pan = ctx.createStereoPanner();
  out.connect(pan).connect(audio.loopBus);
  const src = ctx.createBufferSource();
  src.buffer = audio.noiseBuf;
  src.loop = true;
  const phrase = ctx.createGain();
  phrase.gain.value = 0.45;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 350;
  phrase.connect(hp).connect(out);
  const lfo = (hz, depth, param) => {
    const o = ctx.createOscillator();
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
  };
  for (const [f, q, wob, hz, lvl] of [[720, 5, 260, 0.23, 1], [2300, 7, 520, 0.37, 0.7], [3400, 9, 400, 0.51, 0.35]]) {
    const b = ctx.createBiquadFilter();
    b.type = 'bandpass';
    b.frequency.value = f;
    b.Q.value = q;
    lfo(hz, wob, b.frequency);
    const g = ctx.createGain();
    g.gain.value = lvl;
    src.connect(b).connect(g).connect(phrase);
  }
  lfo(0.61, 0.32, phrase.gain);
  lfo(1.73, 0.18, phrase.gain);
  for (const f of [1567, 1571.5]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.012;
    o.connect(g).connect(out);
    o.start();
  }
  src.start();
  whisper.nodes = { out, pan };
  return whisper.nodes;
}
function whisperFlush() {
  const n = whisperNodes();
  if (!n) return;
  const d = whisper.best;
  const k = d < WHISPER_NEAR ? (1 - d / WHISPER_NEAR) ** 2 : 0;
  n.out.gain.setTargetAtTime(k * 0.3, audio.ctx.currentTime, 0.15);
  if (k > 0) n.pan.pan.setTargetAtTime(audio.panOf(whisper.pos), audio.ctx.currentTime, 0.1);
}

export class AudioLog {
  // pos: the floor point it stands on; yaw: unused now (kept for the placement table)
  constructor(world, game, { id, pos }) {
    this.world = world;
    this.game = game;
    this.id = id;
    this.pos = new THREE.Vector3(pos[0], pos[1] + HOVER, pos[2]);
    const A = assets();
    this.group = new THREE.Group();
    this.group.position.set(pos[0], pos[1], pos[2]);
    const glyph = new THREE.Mesh(A.glyphGeo, A.glyph);
    glyph.position.y = 0.025;
    const bill = new THREE.Mesh(A.billGeo, A.bill);
    const motes = new THREE.Points(A.moteGeo, A.mote);
    this.group.add(glyph, bill, motes);
    world.scene.add(this.group);
    world.add(this);
  }

  update(dt, player) {
    const A = shared;
    A.uniforms.uTime.value = this.world.time;
    A.uniforms.uScale.value = this.game.renderer.domElement.height * 0.9;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dy = player.pos.y + 0.9 - this.pos.y;
    // the whisper follows the nearest log (flushed once a frame, by the first log to update in the next)
    if (whisper.frame !== this.world.time) {
      if (whisper.frame !== -1) whisperFlush();
      whisper.frame = this.world.time;
      whisper.best = Infinity;
    }
    const d = Math.hypot(dx, dy, dz);
    if (d < whisper.best) {
      whisper.best = d;
      whisper.pos.copy(this.pos);
    }
    if (dx * dx + dz * dz < 1.3 && Math.abs(dy) < 1.4) this.collect();
  }

  collect() {
    this.group.visible = false;
    this.world.remove(this);
    whisper.best = Infinity;
    whisperFlush();
    const fx = this.world.fx;
    fx.flash(this.pos, HOLO, { size: 0.8, life: 0.3, k: 1.1, hot: 0.4 });
    fx.ring(this.group.position, THREE.Object3D.DEFAULT_UP, HOLO, { size: 0.3, end: 1.6, life: 0.6, thick: 0.05, k: 1.2 });
    this.game.recorder.collect(this.id);
  }
}

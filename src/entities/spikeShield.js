// Spike-drop pieces (used by B.shieldedShaft in levels/builders.js):
//  SpikeShield: a tinted energy film hung over a spike layer. Bodies fall straight through it; shots are
//    swallowed (a ripple runs out from the hit, motes are sucked into it, a soft thump) — no ricochet.
//    Each film leaves one end of its layer open (the "port"), so a layer can only be shot through its port,
//    at the right angle, from the right spot: from the ledge, or mid-fall through the port above.
//  ShaftSpikes: a spike layer that won't regrow while you're in the shaft column above it (so a layer you
//    broke never reforms under you mid-fall), flickering back up for its last moment.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { Barrier } from './barrier.js';
import { audio } from '../audio.js';

const RIPPLES = 4;
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const shieldShader = {
  vertexShader: `
    varying vec3 vW;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uFlash;
    uniform float uDim;
    uniform vec4 uRip[${RIPPLES}];   // xz = hit point, w = age (s; < 0 unused)
    uniform vec4 uRect;              // x1, z1, x2, z2 of this film
    uniform vec4 uPort;              // the open end's edge: (axis 0 = x / 1 = z, edge coord, side, 0)
    varying vec3 vW;
    void main() {
      vec2 p = vW.xz * 1.6;
      // hex-ish cells in world space, so neighbouring films line up
      vec2 q = vec2(p.x + 0.5 * floor(p.y), p.y);
      vec2 g = abs(fract(q) - 0.5);
      float cell = smoothstep(0.36, 0.5, max(g.x, g.y));
      float wave = 0.5 + 0.5 * sin(vW.x * 2.3 + vW.z * 1.7 - uTime * 2.2);
      // bright rim round the film, brightest along the port edge so the opening reads from above
      float dx = min(vW.x - uRect.x, uRect.z - vW.x), dz = min(vW.z - uRect.y, uRect.w - vW.z);
      float rim = 1.0 - smoothstep(0.0, 0.14, min(dx, dz));
      float pe = uPort.x < 0.5 ? abs(vW.x - uPort.y) : abs(vW.z - uPort.y);
      float port = (1.0 - smoothstep(0.0, 0.22, pe)) * (0.75 + 0.25 * sin(uTime * 6.0));
      float rip = 0.0;
      for (int i = 0; i < ${RIPPLES}; i++) {
        vec4 r = uRip[i];
        if (r.w < 0.0) continue;
        float d = length(vW.xz - r.xy);
        float front = r.w * 5.5;
        rip += (1.0 - smoothstep(0.0, 0.28, abs(d - front))) * max(0.0, 1.0 - r.w * 1.6) * 1.6;
        rip += max(0.0, 1.0 - d * 2.5) * max(0.0, 1.0 - r.w * 6.0) * 2.0; // the hot spot itself
      }
      float k = (0.55 + cell * 1.4 + wave * 0.35 + rim * 1.6 + port * 2.2 + rip * 2.2) * uDim;
      vec3 col = uColor * k + vec3(uFlash + rip * 0.35);
      float a = (0.08 + cell * 0.2 + wave * 0.05 + rim * 0.45 + port * 0.5 + rip * 0.55 + uFlash * 0.4) * uDim;
      gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
    }`,
};

export class SpikeShield {
  // min/max: the film's box (thin in y). color: the layer it guards. port: { axis: 'x'|'z', edge, side }
  // marks the film edge that faces the opening (for the glow), side = +1/-1 toward the opening.
  constructor(world, { min, max, color, port = null }) {
    this.world = world;
    this.color = color;
    const a = new THREE.Vector3(...min), b = new THREE.Vector3(...max);
    this.min = a;
    this.max = b;
    const c = new THREE.Color(COLORS[color].hex);
    this.hex = COLORS[color].hex;
    this.rip = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, 0, -1));
    this.next = 0;
    this.mat = new THREE.ShaderMaterial({
      ...shieldShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: c },
        uTime: { value: Math.random() * 10 },
        uFlash: { value: 0 },
        uDim: { value: 1 },
        uRip: { value: this.rip },
        uRect: { value: new THREE.Vector4(a.x, a.z, b.x, b.z) },
        uPort: { value: new THREE.Vector4(port?.axis === 'z' ? 1 : 0, port ? port.edge : -1e5, port?.side ?? 1, 0) },
      },
    });
    const geo = new THREE.PlaneGeometry(b.x - a.x, b.z - a.z).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.mesh.renderOrder = 3;
    world.scene.add(this.mesh);
    this.flash = 0;
    // noCollide: the player falls straight through; shots stop here and land in onHit
    this.solid = world.addSolid(a.clone(), b.clone(), { noCollide: true, shield: true, entity: this });
    world.add(this);
  }

  // Swallow the shot: no ricochet, no hit marker. ('absorb' isn't a hit or a bounce, so the blaster only
  // draws a small spark at the point; the ripple, the motes and the thump are ours.)
  onHit(color, hit) {
    const p = hit?.point ?? _p.copy(this.min).add(this.max).multiplyScalar(0.5);
    const r = this.rip[this.next];
    this.next = (this.next + 1) % RIPPLES;
    r.set(p.x, p.z, 0, 0);
    this.flash = Math.min(1, this.flash + 0.5);
    const fx = this.world.fx;
    const n = hit?.dir && hit.dir.y > 0 ? _v.set(0, -1, 0) : _v.copy(UP);
    fx.ring(_p.copy(p).addScaledVector(n, 0.03), n, this.hex, { size: 0.15, end: 1.6, life: 0.45, thick: 0.1, k: 1.5 });
    fx.flash(_p, this.hex, { size: 0.5, life: 0.16, n, k: 1.4, hot: 0.4 });
    // motes drawn in from all round the hit and swallowed by the film
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2, d = 0.6 + Math.random() * 0.6;
      const o = new THREE.Vector3(p.x + Math.cos(ang) * d, p.y + n.y * (0.2 + Math.random() * 0.3), p.z + Math.sin(ang) * d);
      const vel = new THREE.Vector3(p.x - o.x, p.y - o.y, p.z - o.z).multiplyScalar(3.2);
      fx.burst(o, this.hex, { count: 1, speed: 1, life: 0.3, size: 0.09, gravity: 0, drag: 0, spread: 0, dir: vel, intensity: 1.6, sizeEnd: 0.2, mode: 'streak', stretch: 0.03 });
    }
    if (!audio.sample('shield_absorb', { gain: 0.55, vary: 0.12 })) {
      audio.tone({ type: 'sine', f: 520, f2: 140, dur: 0.16, gain: 0.07 });
      audio.noise({ dur: 0.14, gain: 0.05, freq: 900, f2: 200, type: 'lowpass' });
    }
    return 'absorb';
  }

  update(dt) {
    this.mat.uniforms.uTime.value += dt;
    for (const r of this.rip) if (r.w >= 0) r.w = r.w > 1.2 ? -1 : r.w + dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
    this.mat.uniforms.uFlash.value = this.flash * 0.25;
  }
}

// A spike layer for a shaft. hold(p) says whether the player is in the column above it.
export class ShaftSpikes extends Barrier {
  constructor(world, { min, max, color, regen = 2.6, zone = 'red', top = Infinity }) {
    super(world, { min, max, color, kind: 'spike', regen, zone });
    this.top = top;
  }

  hold(p) {
    const pad = 0.4;
    return p.pos.x > this.min.x - pad && p.pos.x < this.max.x + pad && p.pos.z > this.min.z - pad && p.pos.z < this.max.z + pad &&
      p.pos.y > this.min.y - 0.2 && p.pos.y < this.top;
  }

  update(dt, player) {
    if (this.broken && this.regen > 0 && this.hold(player)) this.timer = Math.max(this.timer, 0.9 + dt);
    super.update(dt, player);
  }
}

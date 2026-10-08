// Vortex tunnels: swirling tubes of fast water that grab a swimmer and shoot them along their axis
// (across, down, up, or any angle), released at the far end with their momentum. A turbine housing
// marks the intake, spiral streaks and rings scroll toward the exit, and streaks and bubbles race along
// it, so which way it flows always reads.
//
//   import { vortex } from '../entities/vortex.js';
//   vortex(B, { from: [x, y, z], to: [x, y, z], radius: 1.1, speed: 15 });
//   new VortexTunnel(world, { from, to, ... }) does the same without the level builders.
//
// Options:
//   from, to   intake and exit points (the tube's centerline); any direction
//   radius     capture radius around the centerline (m, default 1.1); the visible tube matches it
//   speed      m/s along the axis while captured (default 15)
//   exitSpeed  speed along the axis left when it lets go (default 0.55 × speed); use ~4-6 for a tube
//              that ends just under a surface or a ceiling so you don't rocket out
//   pull       how hard it draws you onto the centerline (1/s, default 7)
//   air        also carry the player when not swimming (default false: tubes live in water)
//   entry      how far along the tube a swimmer can still be grabbed (m, default 1.5): it only grabs you
//              through its intake end, so swimming across its far end never drags you back in; pass
//              Infinity to grab anywhere along it
//   water      B.water-style surface height: when set, a water volume (no current) is added over the
//              tube's bounding box with its top at this y, for a tube bored through rock between two
//              bodies of water (the walls around it are the level's job). Needs `B` (the vortex() helper).
//   color      glow color (default pale aqua); housing: false drops the intake turbine
//   onEnter    callback(tunnel) each time it grabs the player
// Methods: setActive(on) switches it on/off (visible but slack, the turbine spins down when off);
// contains(p) is true when a body centered at p would be captured.
//
// It works on the player's velocity directly (World entities update before the player): each frame it
// pulls the velocity onto the flow, allowing for the drag Player.swim applies afterwards, so no change to
// the swim code is needed.
import * as THREE from 'three';
import { audio } from '../audio.js';

const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// a spiral of streaks plus rings, scrolling from uv.y 0 (intake) to 1 (exit); additive, soft at the ends
const tubeShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    varying float vDist;
    void main() {
      vUv = uv;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal);
      vV = cameraPosition - w.xyz;
      vDist = length(vV);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform float uTime, uLen, uSpeed, uTwist, uPower;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    varying float vDist;
    void main() {
      float along = vUv.y * uLen;
      float flow = along - uTime * uSpeed * 0.55;
      float spiral = sin(vUv.x * 6.2831 * 3.0 + flow * uTwist);
      float streak = smoothstep(0.55, 1.0, spiral);
      float ring = smoothstep(0.82, 1.0, sin(flow * 1.1));
      float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      float ends = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
      float near = smoothstep(0.4, 2.2, vDist); // don't fill the screen while you're riding inside it
      float a = (0.06 + 0.55 * streak + 0.35 * ring) * (0.45 + 0.55 * rim) * ends * near * uPower;
      gl_FragColor = vec4(uColor * a, 1.0);
    }`,
};

let metalMat = null;

export class VortexTunnel {
  constructor(world, { from, to, radius = 1.1, speed = 15, exitSpeed = null, pull = 7, air = false, entry = 1.5, color = 0x8fe8ff, housing = true, onEnter = null }) {
    this.world = world;
    this.from = new THREE.Vector3(...from);
    this.to = new THREE.Vector3(...to);
    this.dir = this.to.clone().sub(this.from);
    this.len = this.dir.length();
    this.dir.divideScalar(this.len);
    this.radius = radius;
    this.speed = speed;
    this.exitSpeed = exitSpeed ?? speed * 0.55;
    this.pull = pull;
    this.air = air;
    this.entry = entry;
    this.onEnter = onEnter;
    this.active = true;
    this.power = 1; // eases to 0 when switched off
    this.captured = false;
    this.t = 0;
    this.fxT = 0;
    this.color = new THREE.Color(color);

    const q = new THREE.Quaternion().setFromUnitVectors(UP, this.dir);
    const mid = this.from.clone().lerp(this.to, 0.5);
    this.mats = [];
    const tube = (r, twist, k) => {
      const m = new THREE.ShaderMaterial({
        ...tubeShader,
        uniforms: {
          uTime: { value: Math.random() * 10 }, uLen: { value: this.len }, uSpeed: { value: speed }, uTwist: { value: twist },
          uPower: { value: k }, uColor: { value: this.color.clone().multiplyScalar(1.6) },
        },
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      m.userData.k = k;
      this.mats.push(m);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, this.len, 28, 1, true), m);
      mesh.position.copy(mid);
      mesh.quaternion.copy(q);
      mesh.renderOrder = 4;
      world.scene.add(mesh);
      return mesh;
    };
    this.meshes = [tube(radius, 0.9, 1), tube(radius * 0.55, -1.4, 0.7)];

    // the intake turbine: a ducted ring with stator struts and an impeller of blades around the rim
    // (the middle stays open: you swim straight through it), and a glowing ring at the exit
    const glow = new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(2.2) });
    this.glowMat = glow;
    metalMat ??= new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.85, roughness: 0.35, flatShading: true, side: THREE.DoubleSide });
    this.housing = new THREE.Group();
    this.housing.position.copy(this.from);
    this.housing.quaternion.copy(q);
    if (housing) {
      const R = radius + 0.2;
      const duct = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.9, 28, 1, true), metalMat);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.1, 0.1, 6, 28), metalMat);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = -0.45;
      const band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.13, 0.04, 4, 28), glow);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.2;
      this.housing.add(duct, lip, band);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.16), metalMat);
        strut.position.set(Math.cos(a) * (R + 0.55), -0.1, Math.sin(a) * (R + 0.55));
        strut.rotation.y = -a;
        this.housing.add(strut);
      }
      this.impeller = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, radius * 0.38), metalMat);
        blade.position.set(Math.cos(a) * radius * 0.86, 0, Math.sin(a) * radius * 0.86);
        blade.rotation.y = -a;
        blade.rotation.z = 0.55; // pitched
        this.impeller.add(blade);
      }
      const tip = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.66, 0.03, 4, 28), glow);
      tip.rotation.x = Math.PI / 2;
      this.impeller.add(tip);
      this.housing.add(this.impeller);
    }
    world.scene.add(this.housing);
    this.exitRing = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.05, 0.06, 6, 28), glow);
    this.exitRing.position.copy(this.to);
    this.exitRing.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    world.scene.add(this.exitRing);

    this.hum = audio.createLoop('drone_hum', { rate: 0.32 });
    this.rush = null;
    this.humGain = -1;
    world.add(this);
  }

  setActive(on) {
    this.active = on;
    if (!on) this.captured = false;
  }

  // axial position t (0..len) and the offset from the centerline of a point (into _p)
  project(p) {
    const t = _d.subVectors(p, this.from).dot(this.dir);
    _p.copy(_d).addScaledVector(this.dir, -t);
    return t;
  }

  contains(p) {
    const t = this.project(p);
    return t > -0.5 && t < this.len && _p.length() < this.radius + 0.25;
  }

  update(dt, player) {
    this.t += dt;
    this.power += ((this.active ? 1 : 0) - this.power) * Math.min(1, dt * 1.5);
    for (const m of this.mats) {
      m.uniforms.uTime.value += dt * (0.3 + 0.7 * this.power);
      m.uniforms.uPower.value = m.userData.k * (0.25 + 0.75 * this.power);
    }
    if (this.impeller) this.impeller.rotation.y += dt * 9 * this.power;
    const dist = _v.copy(player.pos).sub(this.from).length();
    // the turbine hums near its intake; the water roars around you while it carries you
    const hg = 0.22 * this.power * THREE.MathUtils.clamp(1 - (dist - 3) / 22, 0, 1);
    if (this.hum && Math.abs(hg - this.humGain) > 0.005) {
      this.humGain = hg;
      this.hum.setGain(hg);
    }

    // carry the player
    _c.copy(player.pos).y += player.height * 0.5;
    const t = this.project(_c);
    // (the intake reaches a little in front of the turbine and a little wider than the tube; once it has
    // you it holds you to the end)
    const inside = this.active && !player.dead && (player.swimming || this.air) && t > -0.5 && t < this.len && _p.length() < this.radius + 0.25 && (this.captured || t < this.entry);
    if (inside) {
      if (!this.captured) {
        this.captured = true;
        audio.sample('jump_pad', { gain: 0.45, rate: 0.7, vary: 0.05 });
        this.world.fx.bubbles(_c, 10);
        this.onEnter?.(this);
      }
      // snap the velocity onto the flow, drawn toward the centerline (scaled up by the water drag
      // Player.swim applies after us, so you really move at about `speed`)
      _v.copy(this.dir).multiplyScalar(this.speed).addScaledVector(_p, -this.pull);
      if (player.swimming) _v.divideScalar(1 - Math.min(0.9, dt * 3.2));
      player.vel.lerp(_v, 1 - Math.exp(-25 * dt));
      player.fallTop = player.pos.y;
      player.shake = Math.max(player.shake, 0.06);
      if ((this.fxT -= dt) <= 0) {
        this.fxT = 0.05;
        this.world.fx.bubbles(_c, 2);
      }
    } else if (this.captured) {
      // let go: keep the momentum, but no more than exitSpeed along the axis
      this.captured = false;
      const along = player.vel.dot(this.dir);
      if (along > this.exitSpeed) player.vel.addScaledVector(this.dir, this.exitSpeed - along);
    }
    if (this.captured && !this.rush) this.rush = audio.createLoop('fall_wind', { gain: 0, rate: 1.1 });
    this.rush?.setGain(this.captured ? 0.5 : 0);

    // streaks and bubbles racing along it (only near the player)
    if (dist > 45 && _v.copy(player.pos).sub(this.to).length() > 45) return;
    this.fxAcc = (this.fxAcc || 0) + dt * (10 + this.len * 1.2) * this.power;
    while (this.fxAcc > 1) {
      this.fxAcc--;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.radius * 0.9;
      // a point on the intake disc: build two axes perpendicular to the flow
      const ax = Math.abs(this.dir.y) < 0.9 ? _d.crossVectors(this.dir, UP).normalize() : _d.set(1, 0, 0);
      const ay = _p.crossVectors(this.dir, ax);
      _v.copy(this.from).addScaledVector(ax, Math.cos(a) * r).addScaledVector(ay, Math.sin(a) * r).addScaledVector(this.dir, Math.random() * this.len * 0.3);
      const life = (this.len / this.speed) * (0.7 + Math.random() * 0.3);
      if (Math.random() < 0.6) this.world.fx.burst(_v, 0xd8f6ff, { count: 1, speed: this.speed * this.power, spread: 0.04, dir: this.dir, gravity: 0, drag: 0, life, size: 0.1, mode: 'streak', stretch: 0.06 });
      else this.world.fx.burst(_v, 0xeafaff, { count: 1, speed: this.speed * 0.8 * this.power, spread: 0.05, dir: this.dir, gravity: 0, drag: 0, life, size: 0.13 });
    }
  }
}

// Level helper: vortex(B, opts) builds a VortexTunnel in B's world (and its water volume when
// opts.water is a surface height). Returns the tunnel.
export function vortex(B, { water = null, ...opts }) {
  if (water !== null) {
    const r = opts.radius ?? 1.1;
    const a = opts.from, b = opts.to;
    const min = [0, 1, 2].map((i) => Math.min(a[i], b[i]) - r);
    const max = [0, 1, 2].map((i) => Math.max(a[i], b[i]) + r);
    max[1] = water;
    B.water(min, max, { surface: false });
  }
  return new VortexTunnel(B.W, opts);
}

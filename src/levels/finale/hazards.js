// Hazards shared by the final battle's stages. Everything here is telegraphed before it can hurt
// (≥ 0.6 s), lives in pools so the stages can throw them around freely, and is wiped by clear() when a
// stage restarts:
//   erupt  — a glowing circle on the floor, then a column bursts up through it: a slag geyser, a sun
//            lance, a thicket of thorns or a stand of coral spikes (kind 'lava' | 'sun' | 'vine' | 'ice': the Deep's coral)
//   sweep  — a long bar (a giant vine) that rises at one edge of the arena and sweeps across it, low
//            (jump it) or high (duck under it)
//   SporePod — a pod lobbed onto the floor that bursts into a lethal cloud unless shot in its color
//   LiquidPlane — a lava or water surface that can rise and fall
import * as THREE from 'three';
import { COLORS } from '../../colors.js';
import { audio } from '../../audio.js';
import { liquidMaterial } from '../../liquid.js';

const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export const KIND_COLOR = { lava: 0xff6a1a, sun: 0xffc040, vine: 0x5dff6a, ice: 0x5ae8d8 };
const CAUSE = { lava: 'burn', sun: 'burn', vine: 'spike', ice: 'spike' };

// a column of light/heat: streaks rush up it, fading toward the top
const PILLAR_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const PILLAR_FS = `
  uniform vec3 uColor; uniform float uI, uTime; varying vec2 vUv;
  void main(){
    float streak = 0.55 + 0.45 * sin(vUv.x * 37.7 + sin(vUv.y * 5.0 + uTime) * 2.0) * sin(vUv.y * 9.0 - uTime * 14.0);
    float fade = smoothstep(1.0, 0.55, vUv.y) * (1.0 + 0.6 * smoothstep(0.15, 0.0, vUv.y));
    gl_FragColor = vec4(min(uColor * uI * streak * fade, vec3(3.0)), 1.0);
  }`;
function pillarMat(color) {
  return new THREE.ShaderMaterial({
    vertexShader: PILLAR_VS, fragmentShader: PILLAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: 0 }, uTime: { value: Math.random() * 10 } },
  });
}

const ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
const spikeGeo = new THREE.ConeGeometry(0.28, 1, 6).translate(0, 0.5, 0);
const shardGeo = new THREE.OctahedronGeometry(1, 0).scale(0.3, 1, 0.3).translate(0, 0.7, 0);

// One telegraphed eruption: warn → active (lethal) → fading out.
class Eruption {
  constructor(H, kind) {
    this.H = H;
    this.kind = kind;
    const color = KIND_COLOR[kind];
    this.group = new THREE.Group();
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.discMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.disc = new THREE.Mesh(discGeo, this.discMat);
    this.ring.position.y = 0.06;
    this.disc.position.y = 0.05;
    this.group.add(this.ring, this.disc);
    if (kind === 'lava' || kind === 'sun') {
      this.mat = pillarMat(kind === 'sun' ? 0xffd890 : 0xff7a20);
      this.coreMat = pillarMat(kind === 'sun' ? 0xffffff : 0xffd080);
      this.col = new THREE.Mesh(tubeGeo, this.mat);
      this.inner = new THREE.Mesh(tubeGeo, this.coreMat);
      this.group.add(this.col, this.inner);
    } else {
      // a stand of thorns or coral: spikes that punch up out of the floor
      const m = kind === 'vine'
        ? new THREE.MeshStandardMaterial({ color: 0x3f8a2e, emissive: 0x1f6a12, emissiveIntensity: 0.7, roughness: 0.7, flatShading: true })
        : new THREE.MeshStandardMaterial({ color: 0xff9aa8, emissive: 0x2ad8c8, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.05, flatShading: true });
      this.col = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(kind === 'vine' ? spikeGeo : shardGeo, m);
        const a = (i / 7) * Math.PI * 2, r = i === 0 ? 0 : 0.55;
        s.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        s.rotation.set(Math.sin(a) * 0.35 * (r ? 1 : 0), i, -Math.cos(a) * 0.35 * (r ? 1 : 0));
        s.userData.h = i === 0 ? 1 : 0.65 + ((i * 0.37) % 0.35);
        this.col.add(s);
      }
      this.group.add(this.col);
    }
    this.group.visible = false;
    H.W.scene.add(this.group);
  }

  start(x, y, z, o) {
    this.pos = new THREE.Vector3(x, y, z);
    this.r = o.radius;
    this.h = o.height;
    this.warn = Math.max(0.6, o.warn);
    this.dur = o.dur;
    this.delay = o.delay || 0;
    this.t = -this.delay;
    this.sounded = false;
    this.group.position.copy(this.pos);
    this.group.scale.set(this.r, 1, this.r);
    this.group.visible = false;
    if (this.inner) this.inner.scale.set(0.45, 1, 0.45);
  }

  // returns false once it's over
  update(dt, player) {
    this.t += dt;
    const t = this.t;
    if (t < 0) return true;
    this.group.visible = true;
    const fx = this.H.W.fx, color = KIND_COLOR[this.kind];
    const end = this.warn + this.dur;
    if (t < this.warn) {
      // telegraph: the ring pulses faster and brighter as it's about to go
      const k = t / this.warn;
      this.ringMat.opacity = 0.35 + 0.65 * k * (0.6 + 0.4 * Math.sin(t * (10 + k * 30)));
      this.discMat.opacity = 0.08 + 0.3 * k;
      this.ring.scale.setScalar(1 + (1 - k) * 0.5);
      this.setColumn(0, 0);
      if (Math.random() < dt * 20) {
        _v.set(this.pos.x + (Math.random() - 0.5) * this.r * 1.6, this.pos.y + 0.1, this.pos.z + (Math.random() - 0.5) * this.r * 1.6);
        if (this.kind === 'lava') fx.ember(_v, 0, 2 + Math.random() * 3, 0, color, 0.6, 0.1);
        else if (this.kind === 'sun') fx.ember(_v.setY(this.pos.y + this.h * Math.random()), 0, -6, 0, color, 0.4, 0.06);
        else fx.burst(_v, color, { count: 2, speed: 2, life: 0.4, size: 0.18, gravity: 6 });
      }
      return true;
    }
    if (!this.sounded) {
      this.sounded = true;
      const d = this.pos.distanceTo(player.pos), g = Math.max(0, 1 - d / 40);
      if (this.kind === 'sun') audio.sample('incinerator_ignite', { gain: 0.8 * g, vary: 0.1 }) || audio.slam();
      else if (this.kind === 'lava') audio.sample('lava_sizzle', { gain: 0.9 * g, vary: 0.15 }) || audio.slam();
      else audio.sample('spike_hit', { gain: 0.9 * g, vary: 0.15 }) || audio.spike();
      fx.ring(_v.copy(this.pos).setY(this.pos.y + 0.1), UP, color, { size: this.r * 0.5, end: this.r * 2.2, life: 0.45, k: 1.6 });
      if (this.kind === 'lava') for (let i = 0; i < 18; i++) fx.ember(_v.copy(this.pos).setY(this.pos.y + 0.3), (Math.random() - 0.5) * 6, 6 + Math.random() * 10, (Math.random() - 0.5) * 6, color, 1.2, 0.16);
      if (this.kind === 'ice') fx.burst(_v.copy(this.pos).setY(this.pos.y + 0.6), 0xffc8d0, { count: 30, speed: 6, life: 0.7, size: 0.25, gravity: 9, mode: 'shard' });
      if (this.kind === 'vine') fx.burst(_v.copy(this.pos).setY(this.pos.y + 0.4), 0x3a7a2a, { count: 24, speed: 5, life: 0.8, size: 0.3, gravity: 9 });
    }
    const a = t - this.warn;
    const rise = Math.min(1, a / 0.1), fall = t > end ? Math.max(0, 1 - (t - end) / 0.35) : 1;
    this.ringMat.opacity = 0.6 * fall;
    this.discMat.opacity = 0.35 * fall;
    this.setColumn(rise * fall, a);
    if (t < end && rise > 0.5) {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      if (dx * dx + dz * dz < (this.r * 0.85 + 0.3) ** 2 && player.pos.y < this.pos.y + this.h * rise && player.pos.y + player.height > this.pos.y) player.damage(1, CAUSE[this.kind]);
      if (this.kind === 'lava' && Math.random() < dt * 30) fx.ember(_v.set(this.pos.x, this.pos.y + this.h * Math.random(), this.pos.z), (Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5, color, 0.9, 0.14);
    }
    if (t > end + 0.35) {
      this.group.visible = false;
      return false;
    }
    return true;
  }

  setColumn(k, a) {
    if (this.mat) {
      this.col.visible = this.inner.visible = k > 0.001;
      this.col.scale.y = this.h * (0.3 + 0.7 * k);
      this.inner.scale.y = this.h * k;
      this.mat.uniforms.uI.value = k * 1.4;
      this.coreMat.uniforms.uI.value = k * 1.8;
      this.mat.uniforms.uTime.value += 0.016;
      this.coreMat.uniforms.uTime.value += 0.016;
      return;
    }
    this.col.visible = k > 0.001;
    this.col.children.forEach((s) => (s.scale.y = Math.max(0.001, k * this.h * s.userData.h)));
    this.col.rotation.y = a * 0.3;
  }

  stop() {
    this.group.visible = false;
  }
}

// A giant vine that heaves up out of one edge and sweeps across the arena: low (jump) or high (duck).
class Sweeper {
  constructor(H) {
    this.H = H;
    this.group = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0x4a7a26, emissive: 0x2a6a12, emissiveIntensity: 0.8, roughness: 0.9, flatShading: true });
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dff6a).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1).rotateZ(Math.PI / 2), bark);
    this.body = body;
    this.group.add(body);
    // thorns along it and a glowing seam so its height reads from anywhere
    this.thorns = new THREE.Group();
    const tm = new THREE.MeshStandardMaterial({ color: 0x9ac85a, roughness: 0.6, flatShading: true });
    for (let i = 0; i < 40; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 5), tm);
      const a = i * 2.4;
      c.position.set(-0.5 + i / 40, Math.cos(a) * 0.5, Math.sin(a) * 0.5);
      c.rotation.x = a + Math.PI / 2;
      this.thorns.add(c);
    }
    this.group.add(this.thorns);
    this.seam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.08), this.glowMat);
    this.group.add(this.seam);
    // a glowing band on the floor under it (see start)
    this.laneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dff6a), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.laneMat);
    this.group.visible = false;
    this.lane.visible = false;
    H.W.scene.add(this.group, this.lane);
  }

  // axis: the axis it travels along ('x' | 'z'); from → to along it; lo..hi the other axis (its length);
  // y0..y1 the band it fills; floorY the floor it rises from.
  start(o) {
    Object.assign(this, { axis: o.axis, from: o.from, to: o.to, lo: o.lo, hi: o.hi, y0: o.y0, y1: o.y1, floorY: o.floorY, speed: o.speed, warn: Math.max(0.8, o.warn), delay: o.delay || 0 });
    this.t = -this.delay;
    this.len = this.hi - this.lo;
    this.r = (this.y1 - this.y0) / 2;
    this.yc = (this.y0 + this.y1) / 2;
    this.at = this.from;
    this.group.visible = false;
    this.lane.visible = false;
    this.whooshed = false;
    const along = this.axis === 'x';
    this.group.rotation.y = along ? Math.PI / 2 : 0; // the bar lies across its direction of travel
    this.body.scale.set(this.len, this.r * 2, this.r * 2);
    this.thorns.scale.set(this.len, this.r * 2.4, this.r * 2.4);
    this.seam.scale.set(this.len, 1, 1);
    this.seam.position.set(0, 0, this.r * 1.02);
    // its shadow line: a glowing band on the floor right under it, which travels with it
    if (along) this.lane.scale.set(1.6, 1, this.len);
    else this.lane.scale.set(this.len, 1, 1.6);
  }

  place(at, y) {
    const mid = (this.lo + this.hi) / 2;
    if (this.axis === 'x') {
      this.group.position.set(at, y, mid);
      this.lane.position.set(at, this.floorY + 0.04, mid);
    } else {
      this.group.position.set(mid, y, at);
      this.lane.position.set(mid, this.floorY + 0.04, at);
    }
  }

  update(dt, player) {
    this.t += dt;
    const t = this.t;
    if (t < 0) return true;
    this.group.visible = true;
    this.lane.visible = true;
    const dir = Math.sign(this.to - this.from);
    const travel = Math.abs(this.to - this.from) / this.speed;
    const fx = this.H.W.fx;
    if (t < this.warn) {
      // it heaves up out of the edge, glowing brighter as it's about to go
      const k = t / this.warn;
      this.place(this.from, this.floorY - 2 + (this.yc - this.floorY + 2) * Math.min(1, k * 1.6));
      this.glowMat.opacity = 0.3 + 0.7 * k * (0.6 + 0.4 * Math.sin(t * 30));
      this.laneMat.opacity = 0.2 + 0.5 * k * (0.7 + 0.3 * Math.sin(t * 20));
      if (Math.random() < dt * 25) fx.burst(_v.copy(this.group.position).setY(this.floorY + 0.2), 0x3a7a2a, { count: 3, speed: 4, life: 0.6, size: 0.3, gravity: 8 });
      return true;
    }
    if (!this.whooshed) {
      this.whooshed = true;
      audio.sweep();
    }
    const a = t - this.warn;
    this.at = this.from + dir * Math.min(travel, a) * this.speed;
    this.place(this.at, this.yc);
    this.group.children[0].rotation.x += dt * 6 * dir;
    this.thorns.rotation.x += dt * 6 * dir;
    this.glowMat.opacity = 1;
    this.laneMat.opacity = 0.6;
    if (a < travel) {
      // lethal: the player's box overlaps the bar's
      const p = player.pos, along = this.axis === 'x' ? p.x : p.z, side = this.axis === 'x' ? p.z : p.x;
      if (Math.abs(along - this.at) < this.r + 0.35 && side > this.lo - 0.3 && side < this.hi + 0.3 && p.y < this.y1 - 0.05 && p.y + player.height > this.y0 + 0.05) player.damage(1, 'spike');
      return true;
    }
    // done: sink back into the sludge
    const s = a - travel;
    this.place(this.to, this.yc - s * 6);
    if (s > 0.6) {
      this.group.visible = false;
      this.lane.visible = false;
      return false;
    }
    return true;
  }

  stop() {
    this.group.visible = false;
    this.lane.visible = false;
  }
}

// A seed pod the Warden lobs: it arcs onto the floor, pulses, then bursts into a lethal spore cloud — unless
// you pop it first with its own color. Lives in world.projectiles (shootable; a respawn clears it).
const podGeo = new THREE.IcosahedronGeometry(0.55, 1);
const cloudGeo = new THREE.SphereGeometry(1, 20, 12);
export class SporePod {
  constructor(W, from, to, color, { flight = 1.1, fuse = 2.4, cloud = 3.2, life = 3.6 } = {}) {
    this.world = W;
    this.from = from.clone();
    this.to = to.clone();
    this.pos = from.clone();
    this.color = color;
    this.flight = flight;
    this.fuse = fuse;
    this.cloudR = cloud;
    this.cloudLife = life;
    this.t = 0;
    this.alive = true;
    this.shootable = true;
    this.hitRadius = 0.9;
    this.state = 'fly';
    const c = new THREE.Color(COLORS[color].hex);
    this.mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.4, flatShading: true });
    this.mesh = new THREE.Mesh(podGeo, this.mat);
    this.mesh.position.copy(this.pos);
    // the cloud it will release: shown as a faint shell while it ripens, so you see how far it reaches
    this.cloudMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dff6a), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.cloud = new THREE.Mesh(cloudGeo, this.cloudMat);
    this.cloud.position.copy(this.to);
    this.cloud.scale.setScalar(this.cloudR);
    this.cloud.visible = false;
    W.scene.add(this.mesh, this.cloud);
    W.projectiles.push(this);
  }

  update(dt, player) {
    this.t += dt;
    const fx = this.world.fx, hex = COLORS[this.color].hex;
    if (this.state === 'fly') {
      const k = Math.min(1, this.t / this.flight);
      this.pos.lerpVectors(this.from, this.to, k);
      this.pos.y += Math.sin(k * Math.PI) * 6;
      if (k >= 1) {
        this.state = 'ripe';
        this.t = 0;
        this.pos.copy(this.to).setY(this.to.y + 0.5);
        audio.land(1);
        fx.ring(_v.copy(this.to).setY(this.to.y + 0.05), UP, hex, { size: 0.3, end: 2, life: 0.4, k: 1.4 });
      }
    } else if (this.state === 'ripe') {
      // it swells and pulses faster as it's about to burst; the cloud's reach shows on the floor
      const k = this.t / this.fuse;
      this.mesh.scale.setScalar(1 + k * 0.5 + Math.sin(this.t * (8 + k * 30)) * 0.08);
      this.mat.emissiveIntensity = 0.8 + k * 2 * (0.5 + 0.5 * Math.sin(this.t * (8 + k * 30)));
      this.cloud.visible = true;
      this.cloudMat.opacity = 0.03 + 0.07 * k;
      if (Math.random() < dt * 8) fx.puff(_v.copy(this.pos), 0, 0.6, 0, new THREE.Color(0x6aff7a), 0.25, 1, 0.3, 3);
      if (this.t >= this.fuse) {
        this.state = 'cloud';
        this.t = 0;
        this.shootable = false;
        this.mesh.visible = false;
        audio.sample('spore_burst', { gain: 0.9 }) || audio.explode();
        fx.burst(this.pos, 0x7dff6a, { count: 80, speed: 6, life: 1.2, size: 0.5, gravity: -0.5, mode: 'puff' });
      }
    } else {
      // the cloud: lethal to breathe while it hangs
      const k = this.t / this.cloudLife;
      this.cloudMat.opacity = 0.22 * Math.min(1, this.t / 0.2) * (1 - k * k);
      this.cloud.scale.setScalar(this.cloudR * (0.85 + 0.15 * Math.min(1, this.t * 3)));
      if (Math.random() < dt * 22) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * this.cloudR * 0.9;
        fx.puff(_v.set(this.to.x + Math.cos(a) * r, this.to.y + 0.3 + Math.random() * this.cloudR * 0.8, this.to.z + Math.sin(a) * r), 0, 0.3, 0, new THREE.Color(0x5aff6a), 0.35, 1.4, 0.8, 2.5);
      }
      _v.copy(player.pos).setY(player.pos.y + 0.9);
      if (k < 0.92 && _v.distanceTo(this.to) < this.cloudR * 0.92) player.damage(1, 'spores');
      if (this.t >= this.cloudLife) this.alive = false;
      return;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y += dt * 2;
  }

  onHit(color) {
    if (!this.alive || !this.shootable) return undefined;
    if (color !== this.color) return 'immune';
    audio.orbPop();
    this.world.fx.orbPop(this.pos, COLORS[this.color].hex, 0.6);
    this.alive = false;
    return 'kill';
  }

  dispose() {
    this.world.scene.remove(this.mesh, this.cloud);
    this.mat.dispose();
    this.cloudMat.dispose();
  }
}

// The pool of eruptions and sweepers, updated once a frame while the fight is on.
export class Hazards {
  constructor(W, game) {
    this.W = W;
    this.game = game;
    this.free = {};
    this.live = [];
    W.add(this);
  }

  get(kind) {
    const list = (this.free[kind] ??= []);
    return list.pop() || (kind === 'sweep' ? new Sweeper(this) : new Eruption(this, kind));
  }

  // A telegraphed column at x, y (the floor), z.
  erupt(x, y, z, { kind = 'lava', radius = 1.6, warn = 1, dur = 1, height = 8, delay = 0 } = {}) {
    const e = this.get(kind);
    e.start(x, y, z, { radius, warn, dur, height, delay });
    this.live.push(e);
    return e;
  }

  sweep(o) {
    const s = this.get('sweep');
    s.start(o);
    this.live.push(s);
    return s;
  }

  clear() {
    for (const h of this.live) {
      h.stop();
      (this.free[h.kind || 'sweep'] ??= []).push(h);
    }
    this.live = [];
  }

  update(dt, player) {
    if (this.game.rulesPaused) return;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const h = this.live[i];
      if (!h.update(dt, player)) {
        this.live.splice(i, 1);
        (this.free[h.kind || 'sweep'] ??= []).push(h);
      }
    }
  }
}

// A liquid surface that can rise and fall (lava tides, the flood). style: liquid.js shader style.
export class LiquidPlane {
  constructor(W, x1, z1, x2, z2, y, { zone = 'red', style = null, glow = 1 } = {}) {
    const w = x2 - x1, d = z2 - z1;
    const geo = new THREE.PlaneGeometry(w, d, Math.min(48, Math.round(w / 1.5)), Math.min(48, Math.round(d / 1.5)));
    geo.rotateX(-Math.PI / 2);
    let mat = liquidMaterial(zone, true, style);
    if (glow !== 1) {
      // a dimmer copy (a whole lake of it seen from above would blow out the bloom), on the same clock
      const base = mat;
      mat = base.clone();
      mat.uniforms.uTime = base.uniforms.uTime;
      mat.fragmentShader = base.fragmentShader.replace('gl_FragColor = vec4(clamp(c, 0.0, 3.0)', `gl_FragColor = vec4(clamp(c * ${glow.toFixed(3)}, 0.0, 3.0)`);
    }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    W.scene.add(this.mesh);
    this.min = new THREE.Vector3(x1, -Infinity, z1);
    this.max = new THREE.Vector3(x2, y, z2);
    this.y = y;
  }

  setY(y) {
    this.y = y;
    this.max.y = y;
    this.mesh.position.y = y + 0.03;
  }

  contains(p) {
    return p.x > this.min.x && p.x < this.max.x && p.z > this.min.z && p.z < this.max.z;
  }
}

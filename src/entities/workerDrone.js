// Worker drones: the Atrium's white maintenance crew. Round pale pods with ducted fans, a cyan visor and
// two tool arms (no weapons). They fly service routes high above the floor: hovering at the reactor
// heart and its conduits to weld (sparks), fetching parts from the wall bays, docking to recharge. When a
// conduit starts to die they swarm it in a frantic repair. White means no color lock: any shot pops one,
// it spins out and bursts, and a replacement flies out of a bay a few seconds later. They never attack,
// collide with or block the player, and sleep (hidden, no updates) whenever you're not in the Hub.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { audio } from '../audio.js';
import { regionOf } from '../levels/regions.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const CRUISE = [20.6, 26]; // travel altitude: above the feeds (they're lower than this outside the rings), below the roof
const BOUNDS = { x: 22.3, z1: -101.9, z2: -146.2 };
const SPEED = 5.2;
const falloff = (d, near, far) => THREE.MathUtils.clamp(1 - (d - near) / (far - near), 0, 1);
const rnd = (a, b) => a + Math.random() * (b - a);

// shared geometry and materials (one body mesh + one glow mesh per drone)
let GEO = null;
function geometry() {
  if (GEO) return GEO;
  const body = [], glow = [];
  body.push(new THREE.SphereGeometry(0.42, 12, 9).scale(1, 0.72, 1.12));
  body.push(new THREE.CylinderGeometry(0.2, 0.28, 0.12, 10).translate(0, 0.32, 0.05)); // top hatch
  for (const s of [-1, 1]) {
    body.push(new THREE.TorusGeometry(0.26, 0.07, 6, 16).rotateX(Math.PI / 2).translate(s * 0.66, 0.02, 0.05)); // fan duct
    body.push(new THREE.BoxGeometry(0.3, 0.06, 0.1).translate(s * 0.42, 0.02, 0.05));
    // tool arms, reaching forward and down
    body.push(new THREE.BoxGeometry(0.06, 0.06, 0.42).rotateX(0.5).translate(s * 0.17, -0.34, -0.3));
    body.push(new THREE.BoxGeometry(0.05, 0.12, 0.05).translate(s * 0.17, -0.47, -0.5));
    glow.push(new THREE.CircleGeometry(0.2, 12).rotateX(-Math.PI / 2).translate(s * 0.66, 0.03, 0.05)); // fan glow
  }
  glow.push(new THREE.TorusGeometry(0.15, 0.03, 6, 18).translate(0, 0.03, -0.46)); // visor ring
  glow.push(new THREE.SphereGeometry(0.075, 8, 6).translate(0, 0.03, -0.45)); // eye
  glow.push(new THREE.BoxGeometry(0.5, 0.025, 0.025).translate(0, -0.06, -0.38)); // chin light
  const strip = (gs) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute('uv'), g)));
  GEO = {
    body: strip(body),
    glow: strip(glow),
    torch: new THREE.ConeGeometry(0.07, 0.42, 6, 1, true).rotateX(-Math.PI / 2).translate(0, -0.5, -0.78),
    part: new THREE.BoxGeometry(0.42, 0.24, 0.36).translate(0, -0.62, 0),
  };
  return GEO;
}
let MAT = null;
function materials() {
  MAT ??= {
    torch: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcff6ff).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    part: new THREE.MeshStandardMaterial({ color: 0x3c414e, metalness: 0.7, roughness: 0.4, emissive: 0x2a6a80, emissiveIntensity: 0.6, flatShading: true }),
  };
  return MAT;
}

export class WorkerDrone {
  constructor(swarm, pos) {
    const G = geometry(), M = materials();
    this.swarm = swarm;
    this.world = swarm.world;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.bank = new THREE.Vector2();
    this.t = Math.random() * 10;
    this.state = 'idle';
    this.route = [];
    this.site = null;
    this.bay = null;
    this.timer = 0;
    this.sparkT = 0;
    this.carrying = false;
    this.dead = false;
    this.flier = true; // airborne: green globs' flak fuse airbursts beside it (weapons/globs.js)
    this.group = new THREE.Group();
    this.group.userData.hit = this;
    this.group.userData.noCull = true;
    this.group.rotation.order = 'YXZ';
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0xe9edf3, metalness: 0.25, roughness: 0.42, emissive: 0x9fb4c8, emissiveIntensity: 0.16, flatShading: true });
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbff4ff).multiplyScalar(1.9) });
    this.body = new THREE.Mesh(G.body, this.shellMat);
    this.glow = new THREE.Mesh(G.glow, this.glowMat);
    this.torch = new THREE.Mesh(G.torch, M.torch);
    this.torch.visible = false;
    this.part = new THREE.Mesh(G.part, M.part);
    this.part.visible = false;
    this.group.add(this.body, this.glow, this.torch, this.part);
    this.group.position.copy(this.pos);
    this.world.scene.add(this.group);
    this.world.addHittable(this.group);
  }

  get frantic() {
    return this.site?.conduit && this.swarm.alerted(this.site.conduit);
  }

  // follow a route of waypoints; then arrive() decides what's next
  go(route, then) {
    this.route = route;
    this.onArrive = then;
    this.state = 'route';
    this.torch.visible = false;
  }

  update(dt, player) {
    this.t += dt;
    if (this.state === 'crash') return this.updateCrash(dt);
    const sw = this.swarm;
    let look = null;
    if (this.state === 'route') {
      const target = this.route[0];
      _v.subVectors(target, this.pos);
      const d = _v.length(), last = this.route.length === 1;
      const speed = SPEED * (this.frantic || this.rush ? 1.7 : 1);
      if (d < (last ? 0.15 : 0.9)) {
        this.route.shift();
        if (!this.route.length) {
          this.vel.multiplyScalar(0.3);
          this.onArrive?.();
        }
      } else {
        _v.multiplyScalar((speed * (last ? Math.min(1, d / 2.2) : 1)) / d);
        this.vel.lerp(_v, Math.min(1, dt * 2.6));
      }
    } else {
      this.vel.multiplyScalar(Math.exp(-dt * 4));
    }
    if (this.state === 'work') {
      look = this.site.look;
      this.timer -= dt;
      // hover in close, nudging about the weld
      _w.copy(this.site.p);
      _w.y += Math.sin(this.t * 2.1) * 0.08;
      _w.x += Math.sin(this.t * 1.3) * 0.1;
      this.pos.lerp(_w, Math.min(1, dt * 3));
      const hot = this.frantic ? 1 : 0.6;
      this.torch.visible = Math.random() < 0.85;
      this.torch.scale.setScalar(0.7 + Math.random() * 0.6);
      if ((this.sparkT -= dt) <= 0 && this.swarm.near(this.pos, 50)) {
        this.sparkT = rnd(0.07, 0.16) / hot;
        _v.subVectors(this.pos, look).normalize();
        this.world.fx.sparks(look, _v, 0xcff4ff, { count: this.frantic ? 6 : 3, speed: 5, spread: 0.8, life: 0.45, gravity: 9 });
        this.world.fx.flash(look, 0xbfefff, { size: 0.32, life: 0.06, k: 1.4 });
        sw.weldSound(this);
      }
      if (this.timer <= 0) {
        this.torch.visible = false;
        sw.release(this);
        sw.assign(this);
      }
    } else if (this.state === 'dock') {
      look = _w.copy(this.bay.out).multiplyScalar(2).sub(this.bay.park);
      this.pos.lerp(this.bay.park, Math.min(1, dt * 3));
      this.glowMat.color.setRGB(0.75, 1.6, 1.9).multiplyScalar(0.6 + 0.4 * Math.sin(this.t * 4)); // charging
      if ((this.timer -= dt) <= 0) {
        this.glowMat.color.set(0xbff4ff).multiplyScalar(1.9);
        this.carrying = true;
        this.part.visible = true;
        const out = this.bay.out.clone();
        sw.release(this);
        sw.assign(this, out);
      }
    }
    this.pos.addScaledVector(this.vel, dt);
    // face where it's going, or the job in front of it; bank into turns
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const want = look ? Math.atan2(-(look.x - this.pos.x), -(look.z - this.pos.z)) : sp > 0.6 ? Math.atan2(-this.vel.x, -this.vel.z) : this.yaw;
    let dy = want - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 3.5);
    const fwd = -Math.sin(this.yaw) * this.vel.x - Math.cos(this.yaw) * this.vel.z;
    this.bank.x += (-fwd * 0.05 - this.bank.x) * Math.min(1, dt * 3);
    this.bank.y += (THREE.MathUtils.clamp(-dy * 0.8, -0.5, 0.5) - this.bank.y) * Math.min(1, dt * 3);
    this.group.position.copy(this.pos);
    this.group.position.y += Math.sin(this.t * 3.1) * 0.05;
    this.group.rotation.set(this.bank.x, this.yaw, this.bank.y);
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    this.die(hit);
    return 'kill';
  }

  // popped: a sad little descending chirp, then it spins down trailing sparks
  die(hit) {
    this.dead = true;
    this.state = 'crash';
    this.crashT = 0;
    this.torch.visible = false;
    this.world.removeHittable(this.group);
    this.swarm.release(this);
    this.swarm.lost(this);
    const dir = hit?.dir ?? _v.set(0, 0, 0);
    this.vel.multiplyScalar(0.3).addScaledVector(dir, 7).add(_w.set(rnd(-1.5, 1.5), 2.5, rnd(-1.5, 1.5)));
    this.spin = new THREE.Vector3(rnd(-10, 10), rnd(8, 16), rnd(-10, 10));
    const p = hit?.point ?? this.pos, fx = this.world.fx;
    fx.burst(p, 0xffffff, { count: 16, speed: 7, life: 0.3, size: 0.32, gravity: 2 });
    fx.sparks(p, dir.lengthSq() ? dir : UP, 0xcff4ff, { count: 14, speed: 9, spread: 1, life: 0.5 });
    const g = falloff(this.pos.distanceTo(this.world.game.player.pos), 6, 45);
    audio.tone({ type: 'square', f: 1500, f2: 260, dur: 0.45, gain: 0.05 * g + 0.01, attack: 0.005 });
    audio.droneCrash(Math.max(0.25, g) * 0.6);
    this.glowMat.color.setRGB(0.5, 0.15, 0.1);
  }

  updateCrash(dt) {
    this.crashT += dt;
    this.vel.y -= 15 * dt;
    this.pos.addScaledVector(this.vel, dt);
    const w = 1 + this.crashT;
    this.group.rotation.x += this.spin.x * dt * w;
    this.group.rotation.y += this.spin.y * dt * w;
    this.group.rotation.z += this.spin.z * dt * w;
    this.group.position.copy(this.pos);
    const fx = this.world.fx;
    fx.burst(this.pos, 0xcff4ff, { count: 2, speed: 3, life: 0.35, size: 0.16, gravity: 6 });
    fx.burst(this.pos, 0x8a8f9c, { count: 1, speed: 0.6, life: 1.2, size: 0.5, gravity: -1.2, drag: 1 });
    this.glowMat.color.setRGB(Math.random() < 0.3 ? 1.6 : 0.2, Math.random() < 0.3 ? 1.8 : 0.1, 0.12);
    if (this.crashT > 3 || this.world.pointInSolid(this.pos, 0.3)) this.explode();
  }

  explode() {
    const p = this.pos, fx = this.world.fx;
    fx.burst(p, 0xeaf6ff, { count: 70, speed: 11, life: 0.9, size: 0.42, gravity: 6 });
    fx.burst(p, 0x9bf6ff, { count: 40, speed: 7, life: 0.7, size: 0.4, gravity: 3 });
    fx.burst(p, 0xffc070, { count: 24, speed: 5, life: 0.6, size: 0.45, gravity: 2 });
    fx.burst(p, 0x8a8f9c, { count: 12, speed: 2, life: 1.8, size: 0.9, gravity: -1.2, drag: 1.5 });
    fx.ring(p, null, 0xcff4ff, { size: 0.3, end: 3.2, life: 0.35 });
    for (let i = 0; i < 8; i++) fx.shard(p, rnd(-6, 6), rnd(1, 8), rnd(-6, 6), _c.set(0xe9edf3), 1, rnd(1, 1.8), rnd(0.12, 0.22));
    const d = p.distanceTo(this.world.game.player.pos);
    audio.droneExplode(Math.max(0.15, falloff(d, 8, 60)) * 0.75);
    this.dispose();
  }

  dispose() {
    this.dead = true;
    this.state = 'gone';
    this.world.removeHittable(this.group);
    this.world.scene.remove(this.group);
    this.shellMat.dispose();
    this.glowMat.dispose();
  }
}

// The crew: owns the drones, the bays and the jobs. `reactor` gives the service sites, the rings' swept
// cylinder to route around, and the conduits (a dying one gets swarmed).
export class WorkerSwarm {
  constructor(world, { reactor, bays, cap = 7 }) {
    this.world = world;
    this.reactor = reactor;
    this.sites = reactor.sites;
    this.avoid = reactor.avoid;
    this.cap = cap;
    this.drones = [];
    this.alert = {};
    this.t = 0;
    this.respawnT = 0;
    this.chirpT = 3;
    this.weldAt = 0;
    this.awake = true;
    this.hum = null;
    // the bays: a cradle on the wall with a lit lip; drones park in front of it
    this.bays = bays.map(({ p, n }) => {
      const P = new THREE.Vector3(...p), N = new THREE.Vector3(...n);
      const U = new THREE.Vector3(N.z, 0, -N.x); // along the wall
      const box = (u1, v1, d1, u2, v2, d2, kind) => {
        const a = P.clone().addScaledVector(U, u1).addScaledVector(N, d1).add(_v.set(0, v1, 0));
        const b = P.clone().addScaledVector(U, u2).addScaledVector(N, d2).add(_v.set(0, v2, 0));
        world.deco(a.x, a.y, a.z, b.x, b.y, b.z, kind, 'hub');
      };
      box(-1.3, -1.1, 0, 1.3, 1.1, 0.25, 'metal'); // back plate
      box(-1.4, 1.1, 0, 1.4, 1.35, 1.5, 'metal'); // hood
      box(-1.4, -1.35, 0, 1.4, -1.1, 1.3, 'metal'); // cradle shelf
      for (const s of [-1, 1]) box(s * 1.4, -1.35, 0, s * 1.25, 1.35, 1.5, 'metal');
      box(-1.25, 1.06, 1.42, 1.25, 1.12, 1.5, 'trimWhite');
      box(-1.25, -1.12, 1.22, 1.25, -1.06, 1.3, 'trimWhite');
      box(-0.6, -0.4, 0.25, 0.6, 0.4, 0.28, 'glow3');
      return { park: P.clone().addScaledVector(N, 1.25), out: P.clone().addScaledVector(N, 3.6), busy: null };
    });
    // the morning shift: already at work
    const free = this.sites.filter((s) => !s.conduit || s.conduit !== 'solar').sort(() => Math.random() - 0.5);
    for (let i = 0; i < cap; i++) {
      const s = free[i % free.length];
      const d = new WorkerDrone(this, s.p);
      this.drones.push(d);
      this.startWork(d, s);
      d.timer = rnd(0.5, 6);
    }
    world.add(this);
  }

  alerted(name) {
    return (this.alert[name] || 0) > this.t;
  }

  near(p, r) {
    return p.distanceTo(this.world.game.player.pos) < r;
  }

  // a route from where the drone is to a point, through the cruise band and around the heart's rings
  routeTo(from, to) {
    const A = this.avoid, out = [];
    const inside = (p) => Math.hypot(p.x - A.x, p.z - A.z) < A.r;
    const radial = (p, y) => {
      const a = Math.atan2(p.z - A.z, p.x - A.x);
      return new THREE.Vector3(A.x + Math.cos(a) * (A.r + 0.6), y, A.z + Math.sin(a) * (A.r + 0.6));
    };
    const cruise = (y) => THREE.MathUtils.clamp(y, CRUISE[0], CRUISE[1]);
    // leave: straight out of the heart's cylinder (sites in it sit above or below the rings), or down from the ceiling
    let cur = from.clone();
    if (inside(cur)) out.push((cur = radial(cur, cur.y)));
    else if (cur.y > 29.5) out.push((cur = new THREE.Vector3(cur.x, 29.2, cur.z)));
    out.push((cur = new THREE.Vector3(cur.x, cruise(cur.y), cur.z)));
    // arrive: the approach point outside the cylinder, at cruise height
    const tail = [];
    let end = to.clone();
    if (inside(end)) {
      const r = radial(end, end.y);
      tail.unshift(r);
      end = r;
    } else if (end.y > 29.5) {
      tail.unshift(new THREE.Vector3(end.x, 29.2, end.z));
      end = tail[0];
    }
    const pre = new THREE.Vector3(end.x, cruise(end.y), end.z);
    // go around the rings if the straight line would cut through them
    const a0 = Math.atan2(cur.z - A.z, cur.x - A.x), a1 = Math.atan2(pre.z - A.z, pre.x - A.x);
    if (segDist2D(cur, pre, A) < A.r + 0.4) {
      let da = a1 - a0;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const n = Math.max(1, Math.ceil(Math.abs(da) / 0.8));
      for (let i = 1; i < n; i++) {
        const a = a0 + (da * i) / n, R = A.r + 1.4;
        out.push(new THREE.Vector3(A.x + Math.cos(a) * R, THREE.MathUtils.lerp(cur.y, pre.y, i / n), A.z + Math.sin(a) * R));
      }
    }
    out.push(pre, ...tail, to.clone());
    out.forEach((p, i) => i < out.length - 1 && clampIn(p));
    return out;
  }

  startWork(d, s) {
    d.site = s;
    s.busy = d;
    d.state = 'work';
    d.timer = d.frantic ? rnd(1.8, 3.2) : rnd(3.5, 7);
    if (d.carrying) {
      d.carrying = false;
      d.part.visible = false;
    }
  }

  release(d) {
    if (d.site?.busy === d) d.site.busy = null;
    if (d.bay?.busy === d) d.bay.busy = null;
    d.site = null;
    d.bay = null;
  }

  // the next job: a frantic repair if a conduit is dying, otherwise a weld somewhere, or a trip to a bay
  assign(d, from = d.pos) {
    d.rush = Object.keys(this.alert).some((k) => this.alerted(k));
    const freeBay = this.bays.filter((b) => !b.busy);
    if (!d.carrying && !d.rush && freeBay.length && Math.random() < 0.25) {
      const b = freeBay[(Math.random() * freeBay.length) | 0];
      b.busy = d;
      d.bay = b;
      return d.go(this.routeTo(from, b.out).concat([b.park.clone()]), () => {
        d.state = 'dock';
        d.timer = rnd(2.5, 5);
      });
    }
    const pool = this.sites.filter((s) => !s.busy);
    if (!pool.length) return d.go(this.routeTo(from, from.clone().add(_v.set(rnd(-4, 4), 0, rnd(-4, 4)))), () => this.assign(d));
    const weight = (s) => {
      if (s.conduit && this.alerted(s.conduit)) return 12;
      if (s.conduit && this.reactor.conduits[s.conduit].down) return 0.25;
      return 1;
    };
    let total = 0;
    for (const s of pool) total += weight(s);
    let r = Math.random() * total, pick = pool[0];
    for (const s of pool) if ((r -= weight(s)) <= 0) {
      pick = s;
      break;
    }
    pick.busy = d;
    d.site = pick;
    d.go(this.routeTo(from, pick.p), () => this.startWork(d, pick));
  }

  lost() {
    this.respawnT = Math.max(this.respawnT, rnd(3.5, 6));
  }

  weldSound(d) {
    const dist = d.pos.distanceTo(this.world.game.player.pos);
    if (dist > 20 || this.t - this.weldAt < 0.09) return;
    this.weldAt = this.t;
    audio.noise({ dur: 0.05, gain: 0.07 * falloff(dist, 3, 20), freq: 5200 + Math.random() * 2000, q: 1.6 });
  }

  update(dt, player) {
    this.t += dt;
    const awake = regionOf(player.pos) === 'hub' && player.pos.y > 2;
    if (awake !== this.awake) {
      this.awake = awake;
      for (const d of this.drones) d.group.visible = awake;
    }
    if (!awake) {
      this.hum?.setGain(0);
      return;
    }
    if (!this.hum && audio.available) this.hum = audio.createLoop('drone_hum', { rate: 1.55 });
    // a dying conduit: everyone drops what they're doing and rushes it
    for (const c of Object.values(this.reactor.conduits)) {
      if (c.mode !== 'dying') continue;
      const fresh = !this.alerted(c.name);
      this.alert[c.name] = this.t + 16;
      if (fresh) for (const d of this.drones) if (!d.dead && d.state !== 'dock' && d.site?.conduit !== c.name && Math.random() < 0.7) {
        this.release(d);
        this.assign(d);
      }
    }
    const rushing = Object.keys(this.alert).some((k) => this.alerted(k));
    // replacements fly out of a bay
    const alive = this.drones.filter((d) => !d.dead);
    if (alive.length < this.cap + (rushing ? 2 : 0) && (this.respawnT -= dt) <= 0) {
      this.respawnT = rushing ? 1.5 : rnd(4, 7);
      const b = this.bays[(Math.random() * this.bays.length) | 0];
      const d = new WorkerDrone(this, b.park);
      d.yaw = Math.atan2(-(b.out.x - b.park.x), -(b.out.z - b.park.z));
      this.drones.push(d);
      d.go([b.out.clone()], () => this.assign(d));
      bayFlash(this.world, b.park);
    }
    let nearest = Infinity;
    for (const d of this.drones) {
      d.update(dt, player);
      if (!d.dead) nearest = Math.min(nearest, d.pos.distanceTo(player.pos));
    }
    this.drones = this.drones.filter((d) => d.state !== 'gone');
    this.hum?.setGain(0.22 * falloff(nearest, 4, 26));
    // the odd friendly chirp from one close by
    if ((this.chirpT -= dt) <= 0) {
      this.chirpT = rnd(2.5, 6);
      if (nearest < 18) {
        const f = rnd(1200, 1900), g = 0.045 * falloff(nearest, 4, 18);
        audio.tone({ type: 'sine', f, f2: f * rnd(1.15, 1.5), dur: 0.07, gain: g });
        audio.tone({ type: 'sine', f: f * 1.25, f2: f * rnd(0.8, 1.6), dur: 0.08, gain: g, delay: 0.1 });
      }
    }
  }
}

function bayFlash(world, p) {
  world.fx.flash(p, 0xbff4ff, { size: 1.2, life: 0.2, k: 1.2 });
}

// distance in xz from the centre (c.x, c.z) to the segment a-b
function segDist2D(a, b, c) {
  const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
  const k = l2 > 1e-6 ? THREE.MathUtils.clamp(((c.x - a.x) * abx + (c.z - a.z) * abz) / l2, 0, 1) : 0;
  return Math.hypot(a.x + abx * k - c.x, a.z + abz * k - c.z);
}

function clampIn(p) {
  p.x = THREE.MathUtils.clamp(p.x, -BOUNDS.x, BOUNDS.x);
  p.z = THREE.MathUtils.clamp(p.z, BOUNDS.z2, BOUNDS.z1);
  return p;
}

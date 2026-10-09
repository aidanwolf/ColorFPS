// Swarmers: small, fast, 1-hit drones that come in packs. They zip around you erratically, then one or
// two at a time break off, shudder with a danger streak pointing at you (the telegraph), and dive-bomb
// in a straight line: sidestep or shoot. Touching one is fatal; they burst on walls.
import * as THREE from 'three';
import { audio } from '../audio.js';
import { Enemy, Parts, Beam, Blast, MAT, GEO, moveSafe, falloff, hexOf, sfx, DANGER, loopFor } from './enemyKit.js';
import { edeath } from './enemySfx.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const WINDUP = 0.7;
const LOCK = 0.22; // the last part of the windup, aim fixed
const DIVE_SPEED = 21;
const MAX_SPEED = 10;

export class Swarmer extends Enemy {
  constructor(world, swarm, { pos, color = 0, aggro = true }) {
    super(world, { pos, color, hp: 1, range: 40, aggro });
    this.swarm = swarm;
    this.barkPersona = null; // too small (and too many) to talk: the Swarm reports through the network
    this.vel = new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 2, (Math.random() - 0.5) * 6);
    this.state = 'circle';
    this.phase = Math.random() * Math.PI * 2;
    this.spin = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.5);
    this.radius = 4.5 + Math.random() * 3.5;
    this.height = 1.8 + Math.random() * 2.6;
    this.jitter = new THREE.Vector3();
    this.jitterT = 0;
    this.diveIn = 2 + Math.random() * 3;
    this.timer = 0;
    this.diveDir = new THREE.Vector3();
    this.sightEvery = 0.5; // a pack of them: check sight lines less often

    // a dart: a dark faceted body, a glowing core and two swept blades
    const p = new Parts()
      .add(this.armor, new THREE.OctahedronGeometry(0.26, 0), [0, 0, 0], [0, 0, 0], [0.8, 0.6, 1.35])
      .add(this.glow, new THREE.OctahedronGeometry(0.17, 0), [0, 0.06, 0.16])
      .add(this.glow, new THREE.ConeGeometry(0.07, 0.3, 4), [0, 0, -0.42], [-Math.PI / 2, 0, 0]);
    // swept blades with glowing leading edges
    for (const sx of [-1, 1]) {
      p.add(MAT.dark, new THREE.BoxGeometry(0.46, 0.04, 0.22), [sx * 0.32, 0, -0.08], [0, sx * 0.5, sx * 0.2]);
      p.add(this.glow, new THREE.BoxGeometry(0.46, 0.05, 0.05), [sx * 0.36, 0.01, 0.02], [0, sx * 0.5, sx * 0.2]);
    }
    this.body = new THREE.Group();
    p.build(this.body);
    this.group.add(this.body);
    // small target, fast mover: a forgiving invisible hit sphere
    const hb = new THREE.Mesh(GEO.ico, MAT.hidden);
    hb.scale.setScalar(0.55);
    this.group.add(hb);
    this.streak = new Beam(world.scene, DANGER);
    this.register();
  }

  update(dt, player) {
    if (!this.tick(dt, player)) return;
    const fx = this.world.fx;
    const target = this.aimPoint(player, _t);
    if (this.state === 'circle') {
      // orbit the player at a jittery offset, keeping apart from the rest of the swarm
      this.phase += this.spin * dt;
      this.jitterT -= dt;
      if (this.jitterT <= 0) {
        this.jitterT = 0.25 + Math.random() * 0.35;
        this.jitter.randomDirection().multiplyScalar(2 + Math.random() * 2.5);
      }
      const want = _v.set(player.pos.x + Math.cos(this.phase) * this.radius, player.pos.y + this.height, player.pos.z + Math.sin(this.phase) * this.radius).add(this.jitter);
      _d.subVectors(want, this.pos).multiplyScalar(3.2);
      // never just blunder into the player while circling: only a telegraphed dive should reach them
      _v.subVectors(this.pos, target);
      const near = _v.length();
      if (near < 3) _d.addScaledVector(_v.divideScalar(Math.max(near, 0.1)), (3 - near) * 14);
      for (const o of this.swarm.members) {
        if (o === this || o.dead) continue;
        const dx = this.pos.x - o.pos.x, dy = this.pos.y - o.pos.y, dz = this.pos.z - o.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 2.2 && d2 > 1e-4) _d.add(_v.set(dx, dy, dz).multiplyScalar(6 / d2));
      }
      this.vel.addScaledVector(_d, dt).multiplyScalar(Math.exp(-1.6 * dt));
      if (this.vel.length() > MAX_SPEED) this.vel.setLength(MAX_SPEED);
      if (this.ready) this.diveIn -= dt;
      if (this.diveIn <= 0 && this.sees && this.dist < 24 && this.swarm.claimDive(this)) {
        this.state = 'windup';
        this.timer = WINDUP;
        const g = Math.max(0.35, falloff(this.dist, 5, 35));
        sfx('swarm_dive', { gain: 0.6 * g, vary: 0.1 }, null, null, () => audio.tone({ type: 'sawtooth', f: 700, f2: 1900, dur: WINDUP, gain: 0.05 * g, attack: 0.05 }));
      }
    } else if (this.state === 'windup') {
      // brake, shudder, and paint a danger streak at the player; the aim locks for the last LOCK seconds
      // (the streak turns hot and stops following), so moving at that moment makes it miss
      this.vel.multiplyScalar(Math.exp(-7 * dt));
      this.timer -= dt;
      const k = 1 - this.timer / WINDUP;
      const locked = this.timer <= LOCK;
      if (!locked) this.diveDir.subVectors(target, this.pos).normalize();
      _d.copy(this.diveDir);
      const len = Math.max(0.5, Math.min(this.dist - 1.4, locked ? 12 : 2.5 + k * 6));
      this.streak.set(this.pos, _v.copy(this.pos).addScaledVector(_d, len), locked ? 0.05 : 0.04 + 0.04 * k, locked ? 0.9 : Math.sin(this.t * 50) > 0 ? 0.8 : 0.35, locked ? 0xffb090 : DANGER);
      this.body.position.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0);
      if (Math.random() < dt * 20) fx.sparks(this.pos, _d, DANGER, { count: 2, speed: 5, spread: 0.6, life: 0.2 });
      if (this.timer <= 0) {
        this.state = 'dive';
        this.vel.copy(this.diveDir).multiplyScalar(DIVE_SPEED);
        this.travel = 0;
        this.maxTravel = this.dist + 7;
        this.body.position.set(0, 0, 0);
        this.streak.hide();
      }
    } else if (this.state === 'dive') {
      this.travel += DIVE_SPEED * dt;
      if (Math.random() < dt * 40) fx.burst(this.pos, hexOf(this.color), { count: 2, speed: 1, life: 0.25, size: 0.25, gravity: 0 });
      if (this.travel > this.maxTravel) {
        // missed: pull out and rejoin the swarm
        this.state = 'circle';
        this.diveIn = 2.5 + Math.random() * 3;
        this.swarm.releaseDive(this);
      }
    }
    // move (dives burst on whatever they hit)
    _d.copy(this.vel).multiplyScalar(dt);
    const blocked = moveSafe(this.world, this.pos, _d, 0.3);
    if (blocked.any) {
      if (this.state === 'dive') return this.burst(player);
      for (const k of ['x', 'y', 'z']) if (blocked[k]) this.vel[k] *= -0.6;
    }
    this.group.position.copy(this.pos);
    // face along the flight (or at the player while winding up)
    _v.copy(this.state === 'windup' ? this.diveDir : this.vel);
    if (_v.lengthSq() > 0.01) {
      _v.normalize().add(this.pos);
      this.group.lookAt(_v);
    }
    // a diving swarmer that reaches the player is fatal
    const b = player.bounds();
    const r = 0.45;
    if (this.state === 'dive' && this.pos.x > b.min.x - r && this.pos.x < b.max.x + r && this.pos.y > b.min.y - r && this.pos.y < b.max.y + r && this.pos.z > b.min.z - r && this.pos.z < b.max.z + r) {
      player.damage(1, 'swarm');
      return this.burst(player);
    }
    // core blinks while winding up
    if (this.state === 'windup' && Math.sin(this.t * 40) > 0) this.glow.color.set(DANGER).multiplyScalar(2.4);
    else this.glowFlash();
  }

  // kamikaze pop on a wall (or the player): small blast, deadly only right next to it
  burst(player) {
    if (this.dead) return;
    if (this.state === 'dive' && this.dist < 1.2) player.damage(1, 'swarm');
    this.dead = true;
    this.swarm.releaseDive(this);
    new Blast(this.world, this.pos, this.color, { scale: 0.45, chunks: 2, shake: 0.15 });
    this.remove();
  }

  die(hit, dir) {
    this.dead = true;
    this.swarm.releaseDive(this);
    const g = Math.max(0.3, falloff(this.dist, 5, 40));
    sfx('swarm_pop', { gain: 0.7 * g, vary: 0.12 }, 'orb_pop', { gain: 0.6 * g, rate: 0.8, vary: 0.12 });
    edeath('death_swarmer', this.pos);
    new Blast(this.world, this.pos, this.color, { scale: 0.4, chunks: 2, vel: dir ? dir.clone().multiplyScalar(5) : null, shake: 0.05, sound: false });
    this.onDeath?.(this);
    this.remove();
  }

  hitFx(p, dir) {
    this.world.fx.burst(p, 0xffd9a0, { count: 10, speed: 8, life: 0.3, size: 0.14, gravity: 8 });
  }

  cleanup() {
    this.streak.dispose();
  }
}

// A pack of swarmers sharing one buzz loop and a dive schedule (only `divers` dive at once).
export class Swarm {
  constructor(world, { pos, color = 0, colors = null, count = 6, divers = null, spread = 1.6, aggro = true, onDeath = null }) {
    this.world = world;
    this.onDeath = onDeath;
    this.divers = divers ?? (count > 6 ? 2 : 1);
    this.diving = new Set();
    this.dead = false;
    this.dist = Infinity;
    const list = colors || (Array.isArray(color) ? color : [color]);
    this.members = [];
    const c = new THREE.Vector3(...pos);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const p = [c.x + Math.cos(a) * spread, c.y + (Math.random() - 0.5) * spread * 0.5, c.z + Math.sin(a) * spread];
      const s = new Swarmer(world, this, { pos: p, color: list[i % list.length], aggro });
      s.diveIn = 1.2 + i * 0.7 + Math.random() * 1.2; // first dives staggered
      this.members.push(s);
    }
    this.color = this.members[0].color;
    this.hum = loopFor('swarm_buzz', 'drone_hum', { rate: 2 });
    world.add(this);
  }

  get alive() {
    return this.members.filter((m) => !m.dead);
  }

  // at most `divers` at once, and never two dives starting within 0.8 s of each other
  claimDive(m) {
    if (this.diving.size >= this.divers || this.world.time - (this.lastDive ?? -9) < 0.8) return false;
    this.diving.add(m);
    this.lastDive = this.world.time;
    return true;
  }

  releaseDive(m) {
    this.diving.delete(m);
  }

  materialize() {
    for (const m of this.members) m.materialize();
  }

  update(dt) {
    let near = Infinity, n = 0;
    for (const m of this.members) {
      if (m.dead) continue;
      n++;
      near = Math.min(near, m.dist);
    }
    this.dist = near;
    if (!n) {
      this.dead = true;
      this.world.remove(this);
      this.hum?.stop();
      this.hum = null;
      this.onDeath?.(this);
      return;
    }
    // one buzz for the pack: louder and higher the more of them there are and the closer the nearest
    const k = falloff(near, 3, 30);
    this.hum?.setGain(0.32 * k * k * Math.min(1, 0.4 + n * 0.15));
    this.hum?.setRate(1.9 + n * 0.04 + (this.diving.size ? 0.35 : 0));
  }

  despawn() {
    for (const m of this.members) if (!m.dead) m.despawn();
    this.dead = true;
    this.world.remove(this);
    this.hum?.stop();
    this.hum = null;
  }
}

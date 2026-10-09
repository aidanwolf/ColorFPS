// Lava gobs: the molten slag a Brute lobs from the cannon on its back. The moment a gob leaves the barrel
// a small ring marks the floor where it will land and tightens as it comes down (keep moving). It lands
// with a splash and leaves a little molten puddle for a couple of seconds. A direct hit, the splash or
// standing in the puddle burns you ('lava gob': an enemy attack, so the armor shield takes it).
// Every gob shares one geometry and one pair of materials (per world tint); the floor markers / puddles
// are pooled and reused, so a volley never builds a material or a shader.
import * as THREE from 'three';
import { audio } from '../audio.js';
import { GEO, additive, floorBelow, falloff, sfx } from './enemyKit.js';
import { regionOf } from '../levels/regions.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
export const GOB_G = 20; // gob gravity
const GOB_R = 0.34;
const PUDDLE_R = 1.2;
const PUDDLE_LIFE = 2.5;
const COOL = 0.45; // the last seconds of a puddle: crusting over, harmless

audio.manifest?.then(() => audio.prefetch(['lava_surge', 'lava_sizzle', 'lava_bubble', 'slime_splat', 'mortar_launch']));

// Molten slag is hot in every world; it just runs a little more amber in the desert, cherry by the sea.
const TINT = { red: 0xff5a14, solar: 0xff8a1c, verdant: 0xff6a20, azure: 0xff4a30 };
export const moltenTint = (p) => TINT[regionOf(p)] ?? TINT.red;

// ---- shared look: a lumpy blob of molten skin in a soft additive halo ----
const GOB_GEO = new THREE.IcosahedronGeometry(1, 1);
GOB_GEO.userData.shared = true;
const gobMats = new Map(); // tint -> { skin, halo } (never disposed)
function matsFor(tint) {
  let m = gobMats.get(tint);
  if (!m) {
    m = {
      skin: new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).lerp(new THREE.Color(0xffc060), 0.15).multiplyScalar(1.4) }),
      halo: additive(new THREE.Color(tint).multiplyScalar(1.2), 0.22),
    };
    gobMats.set(tint, m);
  }
  return m;
}

// splash sounds: a volley's gobs land within a beat of each other, so only the first one sizzles
let sizzleAt = -1;
function splashSound(world, p) {
  const g = Math.max(0.2, falloff(p.distanceTo(world.game.camera.position), 5, 45));
  sfx('slime_splat', { gain: 0.65 * g, rate: 0.62 }, 'land', { gain: 0.5 * g, rate: 0.6 });
  if (world.time - sizzleAt > 0.35) {
    sizzleAt = world.time;
    sfx('lava_sizzle', { gain: 0.5 * g, rate: 1.2, cut: 0.8 }, 'lava_bubble', { gain: 0.6 * g });
  }
}

// is the player's body within `r` of p (feet between p.y - 0.4 and p.y + height)?
function touches(player, p, r, height) {
  const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
  return dx * dx + dz * dz < r * r && player.pos.y > p.y - 0.4 && player.pos.y < p.y + height;
}

// ---- the floor marker that becomes the molten puddle (pooled) ----
const POOL = [];

class Puddle {
  constructor() {
    this.pos = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.userData.noCull = true;
    const side = { side: THREE.DoubleSide };
    this.poolMat = additive(0xffffff, 0, side); // the molten pool
    this.coreMat = additive(0xffffff, 0, side); // its white-hot middle
    this.ringMat = additive(0xffffff, 0, side); // the marker ring (and the pool's edge)
    const flat = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      this.group.add(m);
      return m;
    };
    this.pool = flat(GEO.disc, this.poolMat);
    this.core = flat(GEO.disc, this.coreMat);
    this.core.position.y = 0.01;
    this.edge = flat(GEO.ring, this.ringMat);
    this.ring = flat(GEO.ring, this.ringMat);
  }

  // mark where a gob will land in `warn` seconds
  start(world, pos, tint, warn) {
    this.world = world;
    this.pos.copy(pos);
    this.tint = tint;
    this.warn = warn;
    this.t = 0;
    this.state = 'marked';
    this.gone = false;
    this.gen = (this.gen ?? 0) + 1; // (a gob only ever releases the marker it was given, not a reuse of it)
    this.group.position.copy(pos).y += 0.04;
    this.poolMat.color.set(tint).multiplyScalar(1.3);
    this.coreMat.color.set(tint).lerp(_c.set(0xffe0a0), 0.5).multiplyScalar(1.4);
    this.ringMat.color.set(tint).multiplyScalar(1.6);
    this.pool.visible = this.core.visible = false;
    this.ring.visible = this.edge.visible = true;
    this.edge.scale.setScalar(PUDDLE_R);
    world.scene.add(this.group);
    world.add(this);
    return this;
  }

  // the gob arrived (at p, which may not be the marked spot if it hit something on the way)
  land(p) {
    if (this.state !== 'marked') return;
    this.state = 'molten';
    this.t = 0;
    this.pos.copy(p);
    this.group.position.copy(p).y += 0.04;
    this.ring.visible = false;
    this.edge.visible = false;
    this.pool.visible = this.core.visible = true;
    const fx = this.world.fx;
    const s = _a.copy(p).setY(p.y + 0.15);
    fx.flash(s, this.tint, { size: 1.4, life: 0.14, n: UP });
    fx.ring(s, UP, this.tint, { size: 0.3, end: PUDDLE_R * 1.7, life: 0.3, thick: 0.18, k: 1.8 });
    // molten droplets thrown out and bouncing on the floor, embers, a hiss of steam
    fx.burst(s, this.tint, { count: 26, speed: 5.5, life: 0.7, size: 0.32, gravity: 16, dir: _v.set(0, 0.7, 0), colorEnd: 0x401004, floor: p.y + 0.05 });
    for (let i = 0; i < 8; i++) fx.ember(s, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, this.tint, 0.6 + Math.random() * 0.4, 0.12);
    fx.puff(s, 0, 2.2, 0, _c.set(0x7a4a30), 0.25, 0.8, 0.5, 2.5);
    splashSound(this.world, p);
    // caught in the splash
    if (touches(this.world.game.player, p, PUDDLE_R, 1.4)) this.world.game.player.damage(1, 'lava gob');
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    if (this.state === 'marked') {
      // the ring tightens onto the puddle's edge as the gob comes down; its gob vanished: let it go
      const k = Math.min(1, t / this.warn);
      this.ring.scale.setScalar(PUDDLE_R * (1.9 - 0.9 * k));
      this.ringMat.opacity = 0.3 + 0.35 * k + 0.2 * Math.abs(Math.sin(t * (8 + 14 * k)));
      if (t > this.warn + 1.5) this.release();
      return;
    }
    // molten: splats out to full size, simmers, then crusts over and shrinks away
    const left = PUDDLE_LIFE - t;
    const spread = 1 - Math.pow(1 - Math.min(1, t / 0.15), 2);
    const cool = Math.min(1, left / COOL);
    const r = PUDDLE_R * spread * (0.7 + 0.3 * cool);
    this.pool.scale.setScalar(r);
    this.core.scale.setScalar(r * (0.5 + 0.06 * Math.sin(t * 9)));
    this.poolMat.opacity = (0.62 + 0.1 * Math.sin(t * 13)) * cool;
    this.coreMat.opacity = 0.75 * cool * cool;
    const fx = this.world.fx;
    if (left > COOL && Math.random() < dt * 9) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.85;
      fx.ember(_v.set(this.pos.x + Math.cos(a) * d, this.pos.y + 0.08, this.pos.z + Math.sin(a) * d), 0, 1.5 + Math.random() * 1.5, 0, this.tint, 0.6, 0.08);
    }
    if (left > COOL && touches(this.world.game.player, this.pos, r * 0.9, 0.6)) this.world.game.player.damage(1, 'lava gob');
    if (left <= 0) this.release();
  }

  release() {
    if (this.gone) return;
    this.gone = true;
    this.state = 'idle';
    this.world.remove(this);
    this.world.scene.remove(this.group);
    POOL.push(this);
  }
}

// ---- the gob in flight ----
class Gob {
  constructor(world, from, vel, flight, tint, puddle) {
    this.world = world;
    this.pos = from.clone();
    this.prev = from.clone();
    this.vel = vel.clone();
    this.flight = flight;
    this.tint = tint;
    this.puddle = puddle;
    this.gen = puddle.gen;
    this.age = 0;
    this.trailT = 0;
    this.alive = true;
    this.shootable = false; // it's slag, not a colored shot: dodge it
    this.hitRadius = GOB_R;
    const m = matsFor(tint);
    this.mesh = new THREE.Mesh(GOB_GEO, m.skin);
    this.mesh.userData.noCull = true;
    const halo = new THREE.Mesh(GEO.sphere, m.halo);
    halo.scale.setScalar(1.6);
    this.mesh.add(halo);
    this.mesh.position.copy(this.pos);
    this.spin = Math.random() * 6.28;
    world.scene.add(this.mesh);
    world.projectiles.push(this);
  }

  update(dt, player) {
    this.age += dt;
    this.prev.copy(this.pos);
    this.vel.y -= GOB_G * dt;
    this.pos.addScaledVector(this.vel, dt);
    // a wobbling blob stretched along its flight
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.setFromUnitVectors(UP, _v.copy(this.vel).normalize());
    this.spin += dt * 11;
    const w = 0.08 * Math.sin(this.spin);
    this.mesh.scale.set(GOB_R * (0.92 + w), GOB_R * (1.25 - w), GOB_R * (0.92 - w));
    // a trail of embers and heat haze
    if ((this.trailT -= dt) <= 0) {
      this.trailT = 0.025;
      const fx = this.world.fx;
      fx.ember(this.pos, (Math.random() - 0.5) * 1.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.2, this.tint, 0.45, 0.13);
      if (Math.random() < 0.35) fx.puff(this.pos, 0, 0.6, 0, _c.set(this.tint), 0.15, 0.45, 0.3, 2);
    }
    const b = player.bounds();
    const r = GOB_R;
    if (this.pos.x > b.min.x - r && this.pos.x < b.max.x + r && this.pos.y > b.min.y - r && this.pos.y < b.max.y + r && this.pos.z > b.min.z - r && this.pos.z < b.max.z + r) {
      player.damage(1, 'lava gob');
      return this.splat(floorBelow(this.world, this.pos, 4));
    }
    if (this.age >= this.flight) return this.splat(this.puddle.pos.y);
    // it hit a wall, a ledge or a crate on the way: splash where it struck, the puddle on the floor below
    if (this.age > 0.08 && this.world.pointInSolid(this.pos)) return this.splat(floorBelow(this.world, this.prev, 8));
    if (this.age > this.flight + 1.5) this.splat(null);
  }

  // land: the puddle settles on the floor at height y (null: nowhere to settle, just a splash)
  splat(y) {
    if (!this.alive) return;
    this.alive = false;
    this.landed = true;
    const fx = this.world.fx;
    if (y === null) {
      fx.burst(this.pos, this.tint, { count: 16, speed: 5, life: 0.5, size: 0.3, gravity: 14 });
      splashSound(this.world, this.pos);
      if (this.puddle.gen === this.gen) this.puddle.release();
      return;
    }
    this.puddle.land(_a.set(this.age >= this.flight ? this.puddle.pos.x : this.pos.x, y, this.age >= this.flight ? this.puddle.pos.z : this.pos.z));
  }

  dispose() {
    this.world.scene.remove(this.mesh);
    // cleared mid-flight (a respawn): its floor marker goes too
    if (!this.landed && this.puddle.gen === this.gen) this.puddle.release();
  }
}

// Lob a gob from `from` to land on the floor point `target` after `flight` seconds.
export function lobGob(world, from, target, flight, tint) {
  const puddle = (POOL.pop() ?? new Puddle()).start(world, target, tint, flight);
  const T = flight;
  _v.set((target.x - from.x) / T, (target.y - from.y) / T + 0.5 * GOB_G * T, (target.z - from.z) / T);
  return new Gob(world, from, _v, T, tint, puddle);
}

// Clear every gob and puddle (an encounter resetting).
export function clearLavaGobs(world) {
  for (const p of world.projectiles) if (p instanceof Gob) p.alive = false;
  for (const e of [...world.entities]) if (e instanceof Puddle) e.release();
}

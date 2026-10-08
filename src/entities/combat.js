// The combat toolkit: arena encounters (seal the exits, announce, spawn telegraphed waves, unseal with a
// reward, reset on respawn), spawn portals, seal slabs, and one factory for every enemy type so level
// code can describe a fight as data. Enemies live in their own files (drone, turret, swarmer, warden,
// brute, mortar); see levels/builders.js for the B.* wrappers and levels/combatRange.js for a showcase.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { audio } from '../audio.js';
import { boxGeo, mat } from '../materials.js';
import { boxOverlap } from '../world.js';
import { Drone } from './drone.js';
import { SubDrone } from './subdrone.js';
import { Turret } from './turret.js';
import { Swarm } from './swarmer.js';
import { Warden } from './warden.js';
import { Brute } from './brute.js';
import { Mortar, clearBlastZones } from './mortar.js';
import { GEO, additive, converge, falloff, sfx, DANGER } from './enemyKit.js';

export { Turret, Swarm, Warden, Brute, Mortar };
export { Swarmer } from './swarmer.js';

const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const firstColor = (c) => (Array.isArray(c) ? c[0] : c);

// ---------- enemies from data ----------
// spec: { type, pos: [x, y, z], color, ...options of that enemy's constructor }
//  'drone'  { color | [colors], hp, range, orbit, fireInterval }
//  'subdrone' { color, hp, range, orbit, leash, standoff } (in water only)
//  'swarm'  { color | colors: [..], count (4-8), divers }
//  'turret' { color | colors: [..], mount: 'floor' | 'ceiling' | [nx, ny, nz] (wall normal), burst, charge, cooldown }
//  'warden' { shield, core (or color: [shield, core]), shieldHp, coreHp, regen }
//  'brute'  { color, hp, speed, chargeSpeed, windup }
//  'mortar' { color, interval, flight, radius, linger }
// Returns the enemy; `.dead` turns true once it's down (a swarm: all of it).
export function spawnEnemy(world, spec) {
  const { type = 'drone', ...o } = spec;
  switch (type) {
    case 'drone': {
      const d = new Drone(world, { range: 40, ...o });
      if (o.aggro) d.aggro = true;
      return d;
    }
    case 'subdrone': {
      // (Azure) a submersible drone: pos must be inside a B.water volume
      const d = new SubDrone(world, o);
      if (o.aggro) d.aggro = true;
      return d;
    }
    case 'swarm':
      return new Swarm(world, o);
    case 'turret':
      return new Turret(world, o);
    case 'warden':
      return new Warden(world, o);
    case 'brute':
      return new Brute(world, o);
    case 'mortar':
      return new Mortar(world, o);
  }
  console.warn('[chroma] unknown enemy type', type);
  return null;
}

// the color a spawn telegraph shows for a spec
function specHex(spec) {
  const c = spec.type === 'warden' ? spec.shield ?? firstColor(spec.color) : firstColor(spec.colors ?? spec.color);
  return typeof c === 'number' && COLORS[c] ? COLORS[c].hex : 0xffffff;
}

// remove an enemy at once, without an explosion (drones have their own cleanup)
function despawn(e) {
  if (!e) return;
  if (e instanceof Drone) {
    if (!e.debris) e.world.fx.burst(e.pos, COLORS[e.color].hex, { count: 16, speed: 3, life: 0.4, size: 0.3, gravity: 0 });
    e.dispose();
  } else e.despawn?.();
}

// ---------- spawn portal ----------
// A beam of light stabs down and motes converge for `time` seconds, then the enemy pops out of a flash.
export class SpawnPortal {
  constructor(world, pos, hex, { time = 0.9, height = 7, size = 1, onSpawn = null } = {}) {
    this.world = world;
    this.pos = new THREE.Vector3(...pos);
    this.hex = hex;
    this.time = time;
    this.size = size;
    this.onSpawn = onSpawn;
    this.t = 0;
    this.spawned = null;
    this.beamMat = additive(new THREE.Color(hex).multiplyScalar(1.4), 0, { side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(GEO.cyl, this.beamMat);
    this.beam.position.copy(this.pos).y += height / 2 - 0.3;
    this.beam.scale.set(0.05, height + 0.6, 0.05);
    this.coreMat = additive(new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.3).multiplyScalar(1.2), 0);
    this.core = new THREE.Mesh(GEO.sphere, this.coreMat);
    this.core.position.copy(this.pos);
    this.core.scale.setScalar(0.01);
    this.beam.userData.noCull = this.core.userData.noCull = true;
    world.scene.add(this.beam, this.core);
    world.add(this);
    const g = Math.max(0.25, falloff(this.pos.distanceTo(world.game.camera.position), 6, 50));
    sfx('spawn_portal', { gain: 0.6 * g, vary: 0.1 }, 'charge_up', { gain: 0.3 * g, rate: 1.7, vary: 0.1 });
    this.ringT = 0;
  }

  update(dt) {
    this.t += dt;
    const fx = this.world.fx;
    if (!this.spawned) {
      const k = Math.min(1, this.t / this.time);
      this.beam.scale.x = this.beam.scale.z = (0.06 + 0.5 * k * k) * this.size;
      this.beamMat.opacity = 0.15 + 0.55 * k;
      this.core.scale.setScalar((0.1 + 0.4 * k) * this.size * (1 + Math.sin(this.t * 40) * 0.1));
      this.coreMat.opacity = 0.25 + 0.45 * k;
      this.ringT -= dt;
      if (this.ringT <= 0) {
        // shrinking rings and converging motes
        this.ringT = 0.16;
        fx.ring(this.pos, null, this.hex, { size: 2.4 * this.size, end: 0.3, life: 0.3, thick: 0.08, k: 1.2 });
        fx.ring(_v.copy(this.pos).setY(this.pos.y - 0.2), UP, this.hex, { size: 1.8 * this.size, end: 0.2, life: 0.3, thick: 0.1, k: 1 });
      }
      if (Math.random() < dt * 40) converge(fx, this.pos, this.hex, { count: 2, radius: 2.2 * this.size, time: 0.35 });
      if (this.t >= this.time) {
        this.spawned = this.onSpawn?.() || true;
        this.t = 0;
        fx.flash(this.pos, this.hex, { size: 2.5 * this.size, life: 0.18, k: 1.8, hot: 0.6 });
        fx.ring(this.pos, null, this.hex, { size: 0.3, end: 3.5 * this.size, life: 0.35, thick: 0.12, k: 1.6 });
        fx.sparks(this.pos, UP, this.hex, { count: 24, speed: 11, spread: 3, life: 0.45, gravity: 4 });
        const g = Math.max(0.3, falloff(this.pos.distanceTo(this.world.game.camera.position), 6, 50));
        sfx('spawn_in', { gain: 0.8 * g, vary: 0.1 }, 'orb_pop', { gain: 0.7 * g, rate: 0.6 });
      }
    } else {
      // the beam pinches out
      const k = Math.min(1, this.t / 0.35);
      this.beam.scale.x = this.beam.scale.z = 0.56 * this.size * (1 - k);
      this.beamMat.opacity = 0.7 * (1 - k);
      this.coreMat.opacity = 0.9 * (1 - k) * (1 - k);
      this.core.scale.setScalar(this.size * (0.6 + k));
      // grow anything that can't materialize itself (drones)
      const e = this.spawned;
      if (e instanceof Drone && !e.dead) e.group.scale.setScalar(Math.max(0.01, Math.min(1, this.t / 0.4)));
      if (k >= 1) {
        if (e instanceof Drone && !e.dead) e.group.scale.setScalar(1);
        this.dispose();
      }
    }
  }

  cancel() {
    if (this.spawned instanceof Drone && !this.spawned.dead) this.spawned.group.scale.setScalar(1);
    this.dispose();
  }

  dispose() {
    if (this.gone) return;
    this.gone = true;
    this.world.remove(this);
    this.world.scene.remove(this.beam, this.core);
    this.beamMat.dispose();
    this.coreMat.dispose();
  }
}

// ---------- seals ----------
// A slab that slams down out of the ceiling to shut a doorway, and slides back up to open it.
// color: a blaster color for an energy-wall look, or null for a heavy hazard-striped metal shutter.
export class Seal {
  constructor(world, { min, max, color = null, zone = 'red', closed = false }) {
    this.world = world;
    this.min = new THREE.Vector3(...min);
    this.max = new THREE.Vector3(...max);
    this.size = new THREE.Vector3().subVectors(this.max, this.min);
    this.center = new THREE.Vector3().addVectors(this.min, this.max).multiplyScalar(0.5);
    this.startClosed = closed;
    this.color = color;
    this.state = 'open';
    this.k = 0; // 0 = fully raised (open), 1 = down (closed)
    const hex = color === null ? DANGER : COLORS[color].hex;
    this.group = new THREE.Group();
    const alongX = this.size.x >= this.size.z;
    this.mats = [];
    if (color === null) {
      this.group.add(new THREE.Mesh(boxGeo(this.size.x, this.size.y, this.size.z), mat('metal', zone)));
      // glowing danger edges and a bright bottom lip
      const g = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(2.2) });
      this.mats.push(g);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(this.size.x + 0.04, 0.12, this.size.z + 0.04), g);
      lip.position.y = -this.size.y / 2 + 0.06;
      this.group.add(lip);
      for (let i = 1; i < 4; i++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(alongX ? this.size.x + 0.03 : this.size.x + 0.03, 0.06, alongX ? this.size.z + 0.03 : this.size.z + 0.03), g);
        stripe.position.y = -this.size.y / 2 + (i * this.size.y) / 4;
        this.group.add(stripe);
      }
    } else {
      const m = additive(new THREE.Color(hex).multiplyScalar(1.1), 0.5);
      const frame = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(2.2) });
      this.mats.push(m, frame);
      this.group.add(new THREE.Mesh(boxGeo(this.size.x, this.size.y, this.size.z, 1), m));
      const lip = new THREE.Mesh(new THREE.BoxGeometry(this.size.x + 0.08, 0.14, this.size.z + 0.08), frame);
      lip.position.y = -this.size.y / 2 + 0.07;
      this.group.add(lip);
    }
    this.group.position.copy(this.center);
    this.group.visible = false;
    world.scene.add(this.group);
    this.solid = world.addSolid(this.min.clone(), this.max.clone(), { enabled: false });
    this.solid.enabled = false;
    world.add(this);
    if (closed) this.close(true);
  }

  close(instant = false) {
    if (this.state === 'closed' || this.state === 'closing') return;
    this.state = instant ? 'closed' : 'closing';
    this.group.visible = true;
    if (instant) {
      this.k = 1;
      this.solid.enabled = true;
      this.place();
    }
  }

  open(instant = false) {
    if (this.state === 'open' || this.state === 'opening') return;
    this.state = instant ? 'open' : 'opening';
    if (instant) {
      this.k = 0;
      this.solid.enabled = false;
      this.group.visible = false;
      return;
    }
    audio.doorOpen();
    this.world.fx.doorOpen(this.min, this.max, this.color === null ? DANGER : COLORS[this.color].hex);
  }

  place() {
    this.group.position.y = this.center.y + this.size.y * (1 - this.k);
  }

  update(dt, player) {
    if (this.state === 'closing') {
      // wait for the doorway to be clear, then drop hard
      const b = player.bounds();
      if (this.k === 0 && boxOverlap(b.min, b.max, this.min, this.max)) return;
      this.k = Math.min(1, this.k + dt * (0.6 + this.k * 12));
      if (this.k >= 1) {
        this.state = 'closed';
        this.solid.enabled = true;
        this.slam(player);
      }
      this.place();
    } else if (this.state === 'opening') {
      this.k = Math.max(0, this.k - dt / 0.9);
      if (this.k < 0.6) this.solid.enabled = false;
      if (Math.random() < dt * 30) this.world.fx.edgeDust(this.min.x, this.max.x, this.min.y + this.size.y * (1 - this.k), this.min.z, this.max.z);
      if (this.k <= 0) {
        this.state = 'open';
        this.group.visible = false;
      }
      this.place();
    }
  }

  slam(player) {
    const dist = this.center.distanceTo(player.pos);
    const g = Math.max(0.35, falloff(dist, 6, 50));
    if (!sfx('arena_seal', { gain: g, vary: 0.05 }, 'door_slam', { gain: 0.9 * g, vary: 0.08 })) audio.door();
    const fx = this.world.fx;
    const hex = this.color === null ? DANGER : COLORS[this.color].hex;
    fx.doorOpen(this.min, this.max, hex);
    _v.set(this.center.x, this.min.y + 0.05, this.center.z);
    fx.sparks(_v, UP, hex, { count: 20, speed: 8, spread: 1.5, life: 0.4 });
    fx.burst(_v, 0xb8c0d0, { count: 14, speed: 3, life: 0.9, size: 0.6, gravity: -0.4, mode: 'puff' });
    player.shake = Math.max(player.shake, 0.3 * falloff(dist, 3, 30));
  }

  reset() {
    if (this.startClosed) this.close(true);
    else this.open(true);
  }
}

// ---------- encounters ----------
// Walk into `trigger` and the arena locks down: `seals` slam shut, a title card announces it, and the
// waves arrive one after another (each enemy out of a spawn portal; a wave starts when the last one is
// cleared, or after its `timeout`). Clear them all and the seals open (those marked closed: true, e.g.
// the way on, too), `checkpoint` becomes the respawn point and `onClear` runs. Dying resets it all
// (B.encounter hooks reset() into B.onRespawn); once cleared it stays cleared. With resume: true a death
// only rewinds to the start of the wave you died on (handy for long fights).
//
//   waves: [ [spec, spec, ...], { enemies: [spec, ...], timeout: 12, title: 'REINFORCEMENTS' }, ... ]
//   spec:  { type, pos, color, delay (s after the wave starts; default staggered), ...enemy options }
export class Encounter {
  constructor(world, game, { trigger, seals = [], waves = [], title = 'AMBUSH', sub = 'HOSTILES INBOUND', color = '#ff5a3a', music = null, gap = 1.6, startDelay = 1.4, stagger = 0.35, portal = 0.9, checkpoint = null, clearTitle = 'AREA SECURED', zone = 'red', resume = false, onStart = null, onWave = null, onClear = null }) {
    this.world = world;
    this.game = game;
    this.title = title;
    this.sub = sub;
    this.hudColor = color;
    this.music = music;
    this.gap = gap;
    this.startDelay = startDelay;
    this.stagger = stagger;
    this.portalTime = portal;
    this.checkpoint = checkpoint;
    this.clearTitle = clearTitle;
    this.onStart = onStart;
    this.onWave = onWave;
    this.onClear = onClear;
    this.resume = resume;
    this.resumeFrom = 0;
    this.waves = waves.map((w) => (Array.isArray(w) ? { enemies: w } : w));
    this.seals = seals.map((s) => (s instanceof Seal ? s : new Seal(world, { zone, ...s })));
    this.state = 'armed';
    this.live = []; // every enemy this encounter spawned that may still be up
    this.portals = [];
    this.pending = [];
    this.wave = -1;
    this.timer = 0;
    this.trigger = world.trigger(trigger[0], trigger[1], () => this.start());
    world.add(this);
  }

  get remaining() {
    return this.live.filter((e) => !e.dead).length + this.pending.length + this.portals.filter((p) => !p.spawned).length;
  }

  start() {
    if (this.state !== 'armed') return;
    this.state = 'intro';
    this.timer = 0;
    for (const s of this.seals) s.close();
    if (this.title) this.game.hud.zoneTitle(this.sub, this.title, this.hudColor, 2.4);
    sfx('alarm', { gain: 0.5, vary: 0 });
    if (this.music) {
      this.prevMusic = { track: this.game.musicOverride || this.game.musicTrack };
      this.game.setMusic(this.music);
    }
    this.onStart?.(this);
  }

  startWave(i) {
    this.wave = i;
    this.state = 'wave';
    this.timer = 0;
    const w = this.waves[i];
    this.waveEnemies = [];
    this.pending = w.enemies.map((spec, k) => ({ at: spec.delay ?? k * this.stagger, spec }));
    const n = this.waves.length;
    if (n > 1) this.game.hud.message(`<b>${w.title || (i === n - 1 ? 'FINAL WAVE' : 'WAVE ' + (i + 1))}</b> &nbsp;${i + 1} / ${n}`, 2.2);
    else if (w.title) this.game.hud.message(`<b>${w.title}</b>`, 2.2);
    this.onWave?.(i, this);
  }

  spawn(spec) {
    const hex = specHex(spec);
    const big = spec.type === 'brute' ? 1.6 : spec.type === 'warden' ? 1.4 : spec.type === 'swarm' ? 1.3 : 1;
    const portal = new SpawnPortal(this.world, spec.pos, hex, {
      time: this.portalTime,
      size: big,
      onSpawn: () => {
        const e = spawnEnemy(this.world, { aggro: true, ...spec });
        if (!e) return null;
        e.materialize?.();
        this.live.push(e);
        this.waveEnemies.push(e);
        return e;
      },
    });
    this.portals.push(portal);
  }

  update(dt) {
    if (this.state === 'armed' || this.state === 'cleared') return;
    this.timer += dt;
    this.portals = this.portals.filter((p) => !p.gone);
    if (this.state === 'intro') {
      if (this.timer >= this.startDelay) this.startWave(this.resumeFrom);
      return;
    }
    if (this.state === 'gap') {
      if (this.timer >= this.gap) this.startWave(this.wave + 1);
      return;
    }
    // a wave in progress: open the portals on schedule
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at > this.timer) continue;
      this.spawn(this.pending[i].spec);
      this.pending.splice(i, 1);
    }
    const spawning = this.pending.length || this.portals.some((p) => !p.spawned);
    if (spawning) return;
    const w = this.waves[this.wave];
    const waveDown = this.waveEnemies.every((e) => e.dead);
    const last = this.wave >= this.waves.length - 1;
    if (last) {
      if (this.live.every((e) => e.dead)) this.finish();
    } else if (waveDown || (w.timeout && this.timer >= w.timeout)) {
      this.state = 'gap';
      this.timer = 0;
      if (waveDown) sfx('target', { gain: 0.45, rate: 0.9, vary: 0 });
    }
  }

  finish() {
    this.state = 'cleared';
    this.live = [];
    for (const s of this.seals) s.open();
    if (this.clearTitle) this.game.hud.zoneTitle('', this.clearTitle, '#9bf6ff', 2.2);
    if (!sfx('arena_clear', { gain: 0.9, vary: 0 })) audio.target();
    if (this.checkpoint) {
      const { pos, yaw = 0 } = this.checkpoint;
      const p = new THREE.Vector3(...pos);
      this.game.checkpoint?.ref?.setActive?.(false);
      this.world.fx.checkpoint(p);
      this.game.setCheckpoint(p, yaw, null);
    }
    this.restoreMusic();
    this.onClear?.(this);
  }

  restoreMusic() {
    if (!this.prevMusic) return;
    // an area track (or none) hands the music back to the area mix
    this.game.setMusic(this.prevMusic.track);
    this.prevMusic = null;
  }

  // back to square one (on respawn), unless it's already been beaten
  reset() {
    if (this.state === 'cleared') return;
    for (const e of this.live) despawn(e);
    for (const p of this.portals) p.cancel();
    clearBlastZones(this.world);
    this.live = [];
    this.portals = [];
    this.pending = [];
    if (this.resume && this.wave > 0) this.resumeFrom = this.wave;
    this.wave = -1;
    for (const s of this.seals) s.reset();
    this.trigger.fired = false;
    this.trigger.inside = false;
    this.state = 'armed';
    this.restoreMusic();
  }
}

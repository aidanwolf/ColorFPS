// Shared machinery for the ground enemies (the Foundry's blast crabs and welders, Solar's scarabs and
// mummies): walking that respects walls and ledges, ballistic leaps, sight and aim checks, a cover search,
// shootable bolts, rig geometry built once and shared by every instance, debris, blasts and sounds.
// Every attack (leap, pounce, flame, rivet burst, sand volley) asks the combat director for a token
// first (combat/director.js) and aims through director.aim, so the first shot from off screen misses.
// Every enemy built on GroundEnemy is restockable: it keeps `spawnOpts` and `home`, sets `dead`, and
// carries `restockable = true`, so restock.js rebuilds it with `new e.constructor(world, e.spawnOpts)`.
// Every one can wear layered color shields (colorShield.js: { color, shields: [outer, ...], shieldHp }, or a
// legacy palette `color: [body, ..., outer]`) and enrages after a few wrong-color hits (rage.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../colors.js';
import { audio } from '../audio.js';
import { director } from '../combat/director.js';
import { barks } from '../combat/barks.js';
import { esfx } from './enemySfx.js';
import { ColorShield, parseShields } from './colorShield.js';
import { Rage } from './rage.js';

export { esfx, barks };

export const GRAVITY = 22;
const STEP_UP = 0.47; // the tallest ledge a walker steps straight onto
const AXES = ['x', 'z'];
const UP = new THREE.Vector3(0, 1, 0);
const _g = new THREE.Vector3();
const _b = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _c = new THREE.Vector3();
const _a = new THREE.Vector3();
const _l = new THREE.Vector3();
const _d = new THREE.Vector3();

const _lf = { f: 0, s: 0 };

// the ground enemies currently awake (near the player), so they can keep from walking into each other
const AWAKE = new Set();

// Solar's quicksand: a floor box of the liquid kind that drags you down rather than kills (player.js sinkIn),
// so it carries no lethal `hazard` flag. Ground enemies treat it as no floor (they stop at its edge, and one
// that lands in it is swallowed) unless they set `wadesQuicksand` (the Mummy's stilts).
export const isQuicksand = (s) => !!s && (!!s.quicksand || (s.kind === 'acid' && !s.hazard));

// 1 inside `near`, fading linearly to 0 at `far`
export const falloff = (d, near, far) => THREE.MathUtils.clamp(1 - (d - near) / (far - near), 0, 1);
export const rnd = (a, b) => a + Math.random() * (b - a);
// shortest signed angle from a to b
export const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// ---------------------------------------------------------------- sounds
// Sample names these enemies play when the files exist (see the list in the commit); until then each
// sound falls back to an existing sample or a small synth cue, so every telegraph is audible today.
export const SOUNDS = [
  'crab_skitter', 'crab_beep', 'crab_leap', 'crab_explode',
  'scarab_dig', 'scarab_emerge', 'scarab_chitter', 'scarab_crunch',
  'welder_alert', 'welder_step', 'welder_ignite', 'welder_rivet', 'welder_roll', 'welder_death',
  'mummy_alert', 'mummy_cast', 'mummy_bolt', 'mummy_shield', 'mummy_shield_break', 'mummy_death',
  'incinerator_ignite',
];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

// Play `name`, else the `alt` sample, else the synth fallback. gain already includes distance falloff.
export function sfx(name, gain, { rate = 1, vary = 0.08, alt = null, altRate = 1, altGain = 1, synth = null } = {}) {
  if (gain <= 0.01) return;
  if (audio.sample(name, { gain, rate, vary })) return;
  if (alt && audio.sample(alt, { gain: gain * altGain, rate: altRate, vary })) return;
  synth?.(gain);
}

// ---------------------------------------------------------------- rig geometry
// A rig is a tree of named pivots; each pivot's geometry is merged per material, so a whole humanoid
// is a dozen-odd meshes. Built once per enemy type and shared by every instance (never disposed).
export class RigDef {
  constructor(define) {
    this.define = define;
    this.nodes = null;
  }

  node(name, parent, pos = [0, 0, 0], { part = null, rot = null } = {}) {
    this.nodes.push({ name, parent, pos, rot, part, geos: new Map() });
    this.by[name] = this.nodes[this.nodes.length - 1];
    return this;
  }

  // add a geometry to a node, in that node's local space
  add(node, mat, geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
    const n = this.by[node];
    if (!n.geos.has(mat)) n.geos.set(mat, []);
    n.geos.get(mat).push(g);
    return this;
  }

  box(node, mat, size, pos, rot) {
    return this.add(node, mat, new THREE.BoxGeometry(...size), pos, rot);
  }

  // build the shared geometry on first use
  ready() {
    if (this.nodes) return;
    this.nodes = [];
    this.by = {};
    this.define(this);
    for (const n of this.nodes) {
      n.merged = [];
      for (const [mat, list] of n.geos) {
        const g = mergeGeometries(list, false);
        list.forEach((x) => x.dispose());
        g.computeBoundingSphere();
        n.merged.push([mat, g]);
      }
      n.geos = null;
    }
  }

  // one instance: { root, n: { name: Group }, meshes }, with the given materials by key
  build(mats) {
    this.ready();
    const root = new THREE.Group();
    const n = {};
    const meshes = [];
    for (const node of this.nodes) {
      const g = new THREE.Group();
      g.position.set(...node.pos);
      if (node.rot) g.rotation.set(...node.rot);
      g.userData.rest = g.position.clone();
      n[node.name] = g;
      (node.parent ? n[node.parent] : root).add(g);
      for (const [mat, geo] of node.merged) {
        const m = new THREE.Mesh(geo, mats[mat]);
        if (node.part) m.userData.part = node.part;
        g.add(m);
        meshes.push(m);
      }
    }
    return { root, n, meshes };
  }
}

// ---------------------------------------------------------------- projectiles
// Shootable bolts: rivets (a hot elongated slug) and sand bolts (a churning ball of glowing sand that
// can curve toward you). Shot with their own color they pop, like the drones' orbs. Geometry and
// materials are shared, so a burst of them costs nothing to make or free.
const boltGeo = {};
const boltMats = new Map();
function boltParts(style, color) {
  boltGeo.core ??= new THREE.SphereGeometry(1, 10, 6);
  boltGeo.shell ??= new THREE.IcosahedronGeometry(1, 1);
  boltGeo.slug ??= new THREE.CylinderGeometry(0.35, 0.6, 2.4, 6).rotateX(Math.PI / 2);
  const key = style + color;
  if (!boltMats.has(key)) {
    const c = new THREE.Color(COLORS[color].hex);
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
    boltMats.set(key, {
      core: new THREE.MeshBasicMaterial({ color: style === 'sand' ? new THREE.Color(0xfff0c0).multiplyScalar(1.6) : new THREE.Color(0xffffff).multiplyScalar(2) }),
      shell: new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(style === 'sand' ? 1.6 : 2.4), opacity: style === 'sand' ? 0.6 : 0.8, ...add }),
    });
  }
  return boltMats.get(key);
}

export class Bolt {
  constructor(world, pos, vel, color, { radius = 0.2, life = 5, style = 'rivet', turn = 0, turnTime = 0, cause = 'orb' } = {}) {
    this.world = world;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.color = color;
    this.radius = radius;
    this.hitRadius = radius + 0.35;
    this.life = life;
    this.style = style;
    this.turn = turn; // rad/s it steers toward you, for turnTime seconds
    this.turnTime = turnTime;
    this.cause = cause;
    this.alive = true;
    this.shootable = true;
    this.t = Math.random() * 10;
    const m = boltParts(style, color);
    this.mesh = new THREE.Group();
    if (style === 'sand') {
      const core = new THREE.Mesh(boltGeo.core, m.core);
      core.scale.setScalar(radius * 0.5);
      this.shell = new THREE.Mesh(boltGeo.shell, m.shell);
      this.shell.scale.setScalar(radius);
      this.mesh.add(core, this.shell);
    } else {
      const slug = new THREE.Mesh(boltGeo.slug, m.core);
      slug.scale.setScalar(radius * 0.5);
      this.shell = new THREE.Mesh(boltGeo.shell, m.shell);
      this.shell.scale.set(radius * 0.8, radius * 0.8, radius * 1.6);
      this.mesh.add(slug, this.shell);
    }
    this.mesh.position.copy(this.pos);
    this.mesh.userData.noCull = true;
    world.scene.add(this.mesh);
    world.projectiles.push(this);
  }

  update(dt, player) {
    this.life -= dt;
    if (this.life <= 0) return this.pop();
    this.t += dt;
    if (this.turnTime > 0) {
      // bend toward your chest, at most `turn` rad/s, keeping speed
      this.turnTime -= dt;
      _eye.copy(player.pos).y += player.eye * 0.75;
      _a.subVectors(_eye, this.pos).normalize();
      const speed = this.vel.length();
      _d.copy(this.vel).divideScalar(speed);
      const ang = Math.acos(THREE.MathUtils.clamp(_d.dot(_a), -1, 1));
      if (ang > 1e-4) {
        const k = Math.min(1, (this.turn * dt) / ang);
        _d.lerp(_a, k).normalize();
        this.vel.copy(_d).multiplyScalar(speed);
      }
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    if (this.style === 'sand') {
      this.shell.rotation.x += dt * 5;
      this.shell.rotation.y += dt * 3.5;
      this.shell.scale.setScalar(this.radius * (1 + Math.sin(this.t * 20) * 0.08));
      if (Math.random() < dt * 30) this.world.fx.puff(this.pos, (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4, _col.set(0xb08850), 0.35, 0.5, this.radius * 0.8, 2.5);
    } else {
      this.mesh.lookAt(_a.copy(this.pos).add(this.vel));
      if (Math.random() < dt * 25) this.world.fx.ember(this.pos, 0, 0, 0, COLORS[this.color].hex, 0.25, 0.05);
    }
    const b = player.bounds();
    const r = this.radius;
    if (this.pos.x > b.min.x - r && this.pos.x < b.max.x + r && this.pos.y > b.min.y - r && this.pos.y < b.max.y + r && this.pos.z > b.min.z - r && this.pos.z < b.max.z + r) {
      player.damage(1, this.cause);
      return this.pop();
    }
    if (this.world.pointInSolid(this.pos)) this.pop();
  }

  onHit(color) {
    if (!this.alive) return undefined;
    if (color === this.color) {
      audio.orbPop();
      this.pop();
      return 'kill';
    }
    return 'immune';
  }

  pop() {
    if (!this.alive) return;
    this.alive = false;
    this.world.fx.orbPop(this.pos, COLORS[this.color].hex, this.radius);
    if (this.style === 'sand') for (let i = 0; i < 4; i++) this.world.fx.puff(this.pos, rnd(-1, 1), rnd(0, 1), rnd(-1, 1), _col.set(0xb08850), 0.4, 0.8, 0.25, 3);
  }

  dispose() {
    this.world.scene.remove(this.mesh);
  }
}
const _col = new THREE.Color();

// ---------------------------------------------------------------- blasts
// An explosion that kills the player inside `radius` (with a clear line from the blast) and tells other
// entities nearby (crabs chain-detonate).
export function blast(world, center, radius, source, cause = 'blast') {
  const player = world.game.player;
  const b = player.bounds();
  // nearest point of the player's box to the blast
  _b.set(THREE.MathUtils.clamp(center.x, b.min.x, b.max.x), THREE.MathUtils.clamp(center.y, b.min.y, b.max.y), THREE.MathUtils.clamp(center.z, b.min.z, b.max.z));
  const d = _b.distanceTo(center);
  if (d < radius && (d < 0.6 || world.lineOfSight(center, _b))) player.damage(1, cause);
  for (const e of world.entities) {
    if (e === source || !e.onBlast || e.dead) continue;
    if (e.pos.distanceTo(center) < radius + (e.radius || 0)) e.onBlast(center, source);
  }
  player.shake = Math.max(player.shake, 0.25 + 0.5 * falloff(d, 2, 22));
}

// The fireball itself (particles only, so it costs no meshes): flash, shockwave, fire, smoke, sparks.
export function explosionFx(fx, p, hex, size = 1) {
  fx.flash(p, 0xffe0b0, { size: 2.6 * size, life: 0.22, k: 2, hot: 0.8, end: 1.6 });
  fx.ring(p, UP, hex, { size: 0.4 * size, end: 5.5 * size, life: 0.45, thick: 0.12, k: 1.8 });
  fx.ring(p, null, 0xffc070, { size: 0.3 * size, end: 3.5 * size, life: 0.3, thick: 0.2, k: 1.4 });
  fx.burst(p, hex, { count: 70 * size, speed: 11 * size, life: 0.9, size: 0.45, gravity: 6 });
  fx.burst(p, 0xffc070, { count: 50 * size, speed: 7 * size, life: 0.7, size: 0.5, gravity: 3 });
  fx.burst(p, 0xff6a20, { count: 30 * size, speed: 3.5, life: 1.4, size: 0.6, gravity: -2.5, drag: 2.5 });
  fx.burst(p, 0x3a3a44, { count: 16 * size, speed: 2, life: 2, size: 1, gravity: -1.2, drag: 1.5 });
  fx.sparks(p, UP, 0xffd9a0, { count: 24 * size, speed: 16, spread: 2.5, life: 0.6, gravity: 12 });
}

// ---------------------------------------------------------------- the ground enemy base
export class GroundEnemy {
  // cfg: { radius, height, hp, range, color } defaults; opts (the spawn options) override hp/range/color
  constructor(world, opts, cfg) {
    this.world = world;
    this.spawnOpts = opts; // so the area can restock it when you come back (see restock.js)
    this.restockable = true;
    this.radius = cfg.radius;
    this.height = cfg.height;
    const spec = parseShields(opts.color ?? cfg.color, opts.shields);
    this.color = spec.body;
    this.shieldSpec = { shields: spec.shields, hp: opts.shieldHp ?? cfg.shieldHp ?? 3, regen: opts.shieldRegen ?? 0 };
    this.rage = new Rage(this);
    this.hp = this.maxHp = opts.hp ?? cfg.hp;
    this.range = opts.range ?? cfg.range;
    this.patrol = opts.patrol ?? cfg.patrol ?? 4;
    this.home = new THREE.Vector3(...opts.pos);
    this.pos = this.home.clone();
    this.vel = new THREE.Vector3();
    this.move = new THREE.Vector3(); // wanted horizontal velocity, set by think()
    this.accel = cfg.accel ?? 30;
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.grounded = false;
    this.ground = null;
    this.ledges = true; // stop at drop-offs while walking
    this.t = Math.random() * 100;
    this.state = 'idle';
    this.stateT = 0;
    this.sightT = Math.random() * 0.25;
    this.sees = false;
    this.aggro = !!opts.aggro; // spawned by an encounter: already hunting you
    this.lostT = 0;
    this.lastSeen = new THREE.Vector3();
    this.dist = Infinity;
    this.flash = 0;
    this.immuneFlash = 0;
    this.dead = false;
    this.dying = false;
    this.onDeath = opts.onDeath ?? null;
    this.mats = []; // per-instance materials, freed on dispose
    this.loops = [];
    this.group = new THREE.Group();
  }

  // put it in the world, standing on whatever is under its spawn point
  attach(hitRoot = this.group) {
    this.hitRoot = hitRoot;
    hitRoot.userData.hit = this;
    this.snapToGround(this.home);
    this.home.copy(this.pos);
    this.sync();
    this.world.scene.add(this.group);
    this.world.addHittable(hitRoot);
    this.world.add(this);
    if (this.shieldSpec.shields.length) {
      this.shield = new ColorShield(this, this.shieldSpec, this.shieldView());
      // while a shell is up it takes every hit, before the subclass's own onHit sees it
      const onHit = this.onHit;
      this.onHit = (color, hit) => (this.shield.up && !this.dead ? this.shieldHit(color, hit) : onHit.call(this, color, hit));
    }
  }

  // where the shield shells go: a ball round its middle (subclasses shape their own)
  shieldView() {
    const r = Math.max(this.radius, this.height * 0.5) * 1.15;
    return { parent: this.hitRoot, center: [0, this.height * 0.55, 0], size: [r, Math.max(r, this.height * 0.62), r] };
  }

  shieldHit(color, hit) {
    if (!this.aggro) {
      this.aggro = true;
      this.onAlert?.(this.world.game.player);
    }
    const r = this.shield.hit(color, hit);
    return r === 'immune' ? this.immune(hit) : r;
  }

  // a shell cracked (a flinch) or shattered (a stagger, its attack called off) (colorShield.js)
  onShieldHit(hit) {
    this.flash = Math.max(this.flash, 0.4);
    this.flinch?.(this.shotDir(hit), 0.4);
  }

  onShieldBreak(color, hit) {
    this.flash = 1;
    const dir = this.shotDir(hit);
    this.flinch?.(dir, 1.3);
    if (this.knock) this.knock.add(_l.copy(dir).setY(0).normalize().multiplyScalar(2.5));
    if (this.stagger !== undefined) this.stagger = Math.max(this.stagger, 0.7);
    if (director.holders.has(this)) {
      director.release(this);
      this.interrupt?.();
    }
    this.onShieldStagger?.(dir);
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  // Ask the combat director for an attack token (held `hold` s). Refused: wait `retry` s and ask again.
  // Returns true when it may attack now.
  mayAttack(hold, retry = [0.25, 0.5]) {
    if (director.request(this, hold)) return true;
    this.attackWait = rnd(retry[0], retry[1]);
    return false;
  }

  // where to aim at `target` from `from` (the director pulls the first off-screen shot wide)
  aimAt(from, target) {
    return director.aim(this, from, target);
  }

  snapToGround(from) {
    this.pos.copy(from);
    for (let dy = 0.6; dy > -8; dy -= 0.1) {
      const s = this.world.pointInSolid(_g.set(from.x, from.y + dy, from.z));
      if (s) {
        this.pos.y = s.max.y;
        this.grounded = true;
        this.ground = s;
        return true;
      }
    }
    this.grounded = false;
    return false;
  }

  // ---- ground probing ----
  // Can it stand on this solid? Hazards (lava, acid) never; quicksand only if it wades.
  footing(s) {
    return isQuicksand(s) ? !!this.wadesQuicksand : !s.hazard;
  }

  // The floor a walker standing at (x, y, z) would be on: the same level, a step up or a step down
  // (`stepUp` / `stepDown` m: a long-legged walker sets them higher). Hazards and walls count as no floor.
  groundAt(x, y, z) {
    const W = this.world;
    const up = this.stepUp ?? STEP_UP, down = this.stepDown ?? 0.5;
    let s = W.pointInSolid(_g.set(x, y + 0.45, z));
    if (s) return s.max.y <= y + up && this.footing(s) ? s : null;
    s = W.pointInSolid(_g.set(x, y - 0.05, z)) || W.pointInSolid(_g.set(x, y - 0.5, z));
    if (!s && down > 0.5) s = W.pointInSolid(_g.set(x, y - (down + 0.5) / 2, z)) || W.pointInSolid(_g.set(x, y - down, z));
    return s && this.footing(s) ? s : null;
  }

  // Would its body overlap a solid standing at (x, y, z)? (Anything lower than a step is walked onto.)
  blocked(x, y, z) {
    const r = this.radius, W = this.world;
    const y1 = y + r + (this.stepUp ?? STEP_UP);
    if (W.pointInSolid(_b.set(x, y1, z), r)) return true;
    const y2 = y + this.height - r;
    return y2 > y1 + 0.2 && !!W.pointInSolid(_b.set(x, y2, z), r);
  }

  // Walk by (dx, dz), axis by axis so a wall only stops the blocked component. With `ledges`, it stops
  // short of drop-offs. Returns { x, z, ledge } for what stopped it.
  walk(dx, dz) {
    const res = { x: false, z: false, ledge: false };
    const p = this.pos;
    for (const k of AXES) {
      const d = k === 'x' ? dx : dz;
      if (!d) continue;
      const nx = k === 'x' ? p.x + d : p.x, nz = k === 'z' ? p.z + d : p.z;
      if (this.blocked(nx, p.y, nz)) {
        res[k] = true;
        continue;
      }
      if (this.ledges) {
        // look a little past the feet, so it stops with its body still over the floor
        const s = Math.sign(d) * this.radius * 0.8;
        const lx = k === 'x' ? nx + s : nx, lz = k === 'z' ? nz + s : nz;
        if (!this.groundAt(lx, p.y, lz) || !this.groundAt(nx, p.y, nz)) {
          res[k] = res.ledge = true;
          continue;
        }
      }
      p[k] += d;
    }
    return res;
  }

  // Can it walk in a straight line from where it stands to (x, z)? (Same rules as walk.)
  pathClear(x, z, margin = 0.6) {
    const p = this.pos;
    const dx = x - p.x, dz = z - p.z, len = Math.hypot(dx, dz);
    if (len < 0.01) return true;
    const ux = dx / len, uz = dz / len;
    let y = p.y;
    for (let s = 0.5; s <= len + margin; s += 0.5) {
      const px = p.x + ux * s, pz = p.z + uz * s;
      if (this.blocked(px, y, pz)) return false;
      const g = this.groundAt(px, y, pz);
      if (!g) return false;
      y = g.max.y;
    }
    return true;
  }

  // ---- physics ----
  physics(dt) {
    if (this.grounded) {
      if (this.ground?.delta) this.pos.add(this.ground.delta); // ride lifts
      // shoulder apart from any other awake ground enemy it's overlapping
      for (const o of AWAKE) {
        if (o === this || o.dead || !o.grounded) continue;
        const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, r = this.radius + o.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r || Math.abs(this.pos.y - o.pos.y) > 1) continue;
        const d = Math.sqrt(d2) || 0.01, push = (r - d) * 5;
        this.move.x += (d2 ? dx / d : Math.random() - 0.5) * push;
        this.move.z += (d2 ? dz / d : Math.random() - 0.5) * push;
      }
      const k = Math.min(1, this.accel * dt / Math.max(0.5, this.vel.distanceTo(this.move)));
      this.vel.x += (this.move.x - this.vel.x) * k;
      this.vel.z += (this.move.z - this.vel.z) * k;
      this.vel.y = 0;
      this.blockedBy = this.walk(this.vel.x * dt, this.vel.z * dt);
      if (this.blockedBy.x) this.vel.x = 0;
      if (this.blockedBy.z) this.vel.z = 0;
      const g = this.groundAt(this.pos.x, this.pos.y, this.pos.z);
      if (g) {
        this.pos.y = g.max.y;
        this.ground = g;
      } else {
        this.grounded = false;
        this.ground = null;
      }
      return;
    }
    this.vel.y -= GRAVITY * dt;
    const steps = Math.max(1, Math.min(8, Math.ceil((this.vel.length() * dt) / 0.3)));
    const h = dt / steps;
    const p = this.pos;
    for (let i = 0; i < steps; i++) {
      for (const k of AXES) {
        const n = p[k] + this.vel[k] * h;
        if (k === 'x' ? this.blocked(n, p.y, p.z) : this.blocked(p.x, p.y, n)) {
          this.vel[k] *= -0.25;
          this.onBump?.();
        } else p[k] = n;
      }
      const ny = p.y + this.vel.y * h;
      if (this.vel.y <= 0) {
        const s = this.world.pointInSolid(_g.set(p.x, ny, p.z));
        if (s) {
          if (s.hazard || !this.footing(s)) return this.onHazard(s);
          const impact = -this.vel.y;
          p.y = Math.max(ny, s.max.y);
          this.grounded = true;
          this.ground = s;
          this.vel.set(0, 0, 0);
          this.onLand?.(impact);
          return;
        }
      } else if (this.world.pointInSolid(_g.set(p.x, ny + this.height, p.z))) {
        this.vel.y = 0;
        continue;
      }
      p.y = ny;
    }
    if (p.y < this.home.y - 40) this.vanish();
  }

  // ballistic velocity that carries its feet from here to `target` in T seconds
  leapVelocity(target, T, out = new THREE.Vector3()) {
    out.subVectors(target, this.pos).divideScalar(T);
    out.y += 0.5 * GRAVITY * T;
    return out;
  }

  // ---- senses ----
  center(out = _c) {
    return out.copy(this.pos).setY(this.pos.y + this.height * 0.55);
  }

  look(dt, player) {
    this.sightT -= dt;
    if (this.sightT > 0) return;
    this.sightT = 0.25;
    _eye.copy(player.pos).y += player.eye;
    const from = _a.copy(this.pos).setY(this.pos.y + this.height * 0.85);
    this.sees = this.dist < this.range && this.world.lineOfSight(from, _eye);
    if (this.sees) {
      this.alerted = true;
      if (!this.aggro) {
        this.aggro = true;
        this.onAlert?.(player);
        barks.say(this, 'spot');
      }
      this.lastSeen.copy(player.pos);
      this.lostT = 0;
    } else if (this.aggro) {
      // lose interest once you've been gone (and far off) for a while
      this.lostT += 0.25;
      if (this.lostT === 1.5) barks.say(this, 'lost'); // "Where'd it go?"
      if (!this.relentless && this.lostT > 8 && this.dist > this.range * 0.8) {
        this.aggro = false;
        this.onCalm?.();
      }
    }
  }

  // Is the player's crosshair on (or within `extra` m of) its body?
  aimedAt(extra = 0) {
    const cam = this.world.game.camera;
    this.center(_a).sub(cam.position);
    const look = cam.getWorldDirection(_l);
    const along = _a.dot(look);
    if (along <= 0) return false;
    const r = Math.max(this.radius, this.height * 0.5) + extra;
    return _a.lengthSq() - along * along < r * r;
  }

  // Does the player's body overlap its own (grown by pad)?
  touches(player, pad = 0) {
    const b = player.bounds();
    const r = this.radius + pad, p = this.pos;
    return b.max.x > p.x - r && b.min.x < p.x + r && b.max.z > p.z - r && b.min.z < p.z + r && b.max.y > p.y - pad && b.min.y < p.y + this.height + pad;
  }

  // the horizontal direction and distance to the player
  toPlayer(player, out = _d) {
    out.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const d = out.length();
    if (d > 1e-4) out.divideScalar(d);
    return d;
  }

  turnToward(yaw, rate, dt) {
    this.yaw += THREE.MathUtils.clamp(angleTo(this.yaw, yaw), -rate * dt, rate * dt);
  }

  // A cover spot nearby: somewhere it can walk to in a straight line where the player can't see its head.
  findCover(player, { min = 2.5, max = 7, tries = 12, keep = 5 } = {}) {
    _eye.copy(player.pos).y += player.eye;
    let best = null, bestScore = Infinity;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < tries; i++) {
      const a = a0 + (i / tries) * Math.PI * 2, r = rnd(min, max);
      const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      const dp = Math.hypot(player.pos.x - x, player.pos.z - z);
      if (dp < keep) continue; // never "take cover" right next to you
      if (!this.pathClear(x, z, 0)) continue;
      if (this.world.lineOfSight(_eye, _g.set(x, this.pos.y + this.height * 0.8, z))) continue;
      const score = r - dp * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = new THREE.Vector3(x, this.pos.y, z);
      }
    }
    return best;
  }

  // ---- update skeleton: subclasses fill in think() (AI) and animate() (pose) ----
  update(dt, player) {
    if (this.debris) return this.updateDebris(dt);
    dt = this.rage.update(dt); // (enraged: the whole AI a beat faster)
    _eye.copy(player.pos).y += player.eye;
    this.dist = this.center(_c).distanceTo(_eye);
    if (this.dying) return this.updateDying(dt, player);
    if (this.dead) return;
    this.t += dt;
    // dormant while the player is far off: no AI or collision work, just a cheap idle so it never looks frozen
    if (this.dist > Math.max(60, this.range + 30)) {
      AWAKE.delete(this);
      this.idleFar?.(dt);
      this.updateLoops();
      return;
    }
    AWAKE.add(this);
    this.stateT += dt;
    this.look(dt, player);
    // spawned already hunting (an encounter's wave): wake the moment it lands, and never lose interest
    if (this.aggro && !this.alerted && this.state === 'idle') {
      this.alerted = true;
      this.lastSeen.copy(player.pos);
      this.onAlert?.(player);
    }
    this.think(dt, player);
    if (this.dead) return;
    this.physics(dt);
    if (this.dead) return;
    this.sync();
    this.animate(dt, player);
    this.rage.paint(this.m?.glow);
    this.shield?.update(dt);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.immuneFlash = Math.max(0, this.immuneFlash - dt * 5);
    this.updateLoops();
  }

  sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  updateLoops() {}

  // where the shot that hit it was going (horizontal-ish)
  shotDir(hit, out = new THREE.Vector3()) {
    if (hit?.dir) out.copy(hit.dir);
    else out.subVectors(this.pos, this.world.game.camera.position);
    if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
    return out.normalize();
  }

  // sparks sprayed out of an impact along the shot, plus a puff in its color
  hitSparks(hit, hex = COLORS[this.color].hex, n = 1) {
    const p = hit?.point ?? this.center(new THREE.Vector3());
    const dir = this.shotDir(hit, _l);
    this.world.fx.burst(p, 0xffd9a0, { count: 18 * n, speed: 8, life: 0.4, size: 0.16, gravity: 10, dir: _a.copy(dir).multiplyScalar(0.4) });
    this.world.fx.burst(p, hex, { count: 8 * n, speed: 5, life: 0.35, size: 0.22, gravity: 4 });
  }

  // a wrong-color hit: it glints, the shot ricochets, and its rage builds
  immune(hit) {
    this.immuneFlash = 1;
    this.aggro = true;
    this.rage.wrong(hit);
    return 'immune';
  }

  // fell into lava/acid (or quicksand it can't wade) or off the world: gone for good (restockable)
  onHazard(s = null) {
    const fx = this.world.fx;
    if (isQuicksand(s)) {
      // swallowed: a gout of sand and a ripple where it went under
      fx.burst(this.pos, 0xc9a26a, { count: 26, speed: 4.5, life: 0.7, size: 0.28, gravity: 10, dir: UP });
      fx.ring(_g.copy(this.pos).setY(this.pos.y + 0.05), UP, 0xa88758, { size: 0.3, end: 2.2, life: 0.5, thick: 0.25, k: 0.6 });
    } else {
      fx.burst(this.pos, 0xff7a1a, { count: 20, speed: 4, life: 0.6, size: 0.3, gravity: 5 });
      fx.burst(this.pos, 0x3a3a44, { count: 8, speed: 1, life: 1.2, size: 0.6, gravity: -1.5 });
    }
    this.vanish();
  }

  // removed at once with a puff (an encounter clearing up)
  despawn() {
    if (this.debris || !this.world.entities.includes(this)) return;
    this.world.fx.burst(this.center(new THREE.Vector3()), COLORS[this.color].hex, { count: 16, speed: 3, life: 0.4, size: 0.3, gravity: 0 });
    this.dead = true;
    this.dispose();
  }

  vanish() {
    if (this.dead && !this.dying) return;
    this.dead = true;
    this.dying = false;
    this.onDeath?.(this);
    this.dispose();
  }

  // Back to its post and calm (the player respawned at a checkpoint). The dead stay dead (restock.js).
  reset() {
    if (this.dead || this.dying) return;
    this.snapToGround(this.home);
    this.vel.set(0, 0, 0);
    this.move.set(0, 0, 0);
    this.hp = this.maxHp;
    this.shield?.restore();
    if (this.rage.on) this.rage.calm();
    this.aggro = false;
    this.sees = false;
    this.lostT = 0;
    this.setState('idle');
    director.release(this);
    this.resetExtra?.();
    this.sync();
  }

  // Fling these objects (parts of the model) as debris that bounce, spin and shrink away. The model
  // itself leaves the scene; the entity disposes itself once the last piece is gone.
  scatter(parts, push = null, { speed = 6, up = 0.5, life = 1.8, spin = 10 } = {}) {
    this.group.updateMatrixWorld(true);
    this.debris = [];
    this.debrisT = 0;
    for (const part of parts) {
      this.world.scene.attach(part);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + up, Math.random() - 0.5).normalize().multiplyScalar(speed * rnd(0.6, 1.2));
      if (push) vel.add(push);
      const l = life * rnd(0.8, 1.4);
      this.debris.push({ obj: part, vel, life: l, scale: part.scale.clone(), spin: new THREE.Vector3().randomDirection().multiplyScalar(spin * rnd(0.6, 1.4)) });
    }
    this.world.removeHittable(this.hitRoot);
    this.world.scene.remove(this.group);
  }

  updateDebris(dt) {
    const t = (this.debrisT += dt);
    this.cool?.(t);
    let alive = 0;
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      alive++;
      const o = d.obj;
      d.vel.y -= 20 * dt;
      for (const k of ['x', 'y', 'z']) {
        const old = o.position[k];
        o.position[k] += d.vel[k] * dt;
        if (this.world.pointInSolid(o.position, 0.06)) {
          o.position[k] = old;
          d.vel[k] *= -0.35;
          d.vel.multiplyScalar(0.75);
          d.spin.multiplyScalar(0.6);
        }
      }
      o.rotation.x += d.spin.x * dt;
      o.rotation.y += d.spin.y * dt;
      o.rotation.z += d.spin.z * dt;
      o.scale.copy(d.scale).multiplyScalar(Math.min(1, d.life / 0.4));
      if (d.life <= 0) o.visible = false;
    }
    if (!alive) this.dispose();
  }

  // remove from the world for good and free per-instance GPU resources (rig geometry is shared)
  dispose() {
    this.dead = true;
    AWAKE.delete(this);
    director.release(this);
    for (const l of this.loops) l.stop();
    this.loops = [];
    this.world.removeHittable(this.hitRoot);
    this.world.remove(this);
    this.world.scene.remove(this.group);
    for (const d of this.debris || []) this.world.scene.remove(d.obj);
    this.debris = null;
    this.shield?.dispose();
    this.rage.dispose();
    for (const m of this.mats) m.dispose();
    for (const g of this.ownGeos || []) g.dispose();
    this.disposeExtra?.();
  }
}

// ---------------------------------------------------------------- the humanoid brain
// Patrol → engage (strafe at a preferred range, hunt where it last saw you) → cover when hurt, dodge
// rolls when you line up a shot, a stagger on every correct-color hit, then the subclass's attacks.
// Rigs share node names: body (the roll pivot at the hips), pelvis, torso, head, armL/foreL, armR/foreR,
// legL/shinL, legR/shinR. Arms hang down -y at rest; rotation.x = -PI/2 points one forward (+z).
const ROLL_DIST = 3.4;
const ROLL_T = 0.55;
const STEP_DIST = 1.6;
const STEP_T = 0.28;
const TAU = Math.PI * 2;
const smooth = (a, b, x) => {
  const u = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

// A damped spring for secondary motion (lean, flinch, squash): step() eases x toward a target with a little
// overshoot; kick() adds velocity (a hit, a recoil, a landing). Allocation-free.
export class Spring {
  constructor(k = 90, c = 11) {
    this.k = k;
    this.c = c;
    this.x = 0;
    this.v = 0;
  }

  step(target, dt) {
    const h = Math.min(dt, 1 / 30);
    this.v += ((target - this.x) * this.k - this.v * this.c) * h;
    this.x += this.v * h;
    return this.x;
  }

  kick(v) {
    this.v += v;
  }

  zero() {
    this.x = this.v = 0;
  }
}

export class Trooper extends GroundEnemy {
  constructor(world, opts, cfg) {
    super(world, opts, cfg);
    this.speed = cfg.speed ?? 2.6;
    this.prefer = cfg.prefer ?? [8, 15];
    this.dodgeRate = opts.dodge ?? cfg.dodge ?? 2.5; // chance per second of a roll while you aim at it
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = rnd(1, 2.5);
    this.rollCool = 1;
    this.coverCool = 2;
    this.stagger = 0;
    this.knock = new THREE.Vector3();
    this.gaitPhase = Math.random() * 10;
    this.patrolTarget = null;
    this.waitT = rnd(0.5, 2);
    this.crouch = 0; // 0 standing → 1 hunkered down (cover, ignition)
    this.tumble = 0; // roll angle
    this.tuck = 0;
    this.footT = 0;
    // the procedural body (poseBase): gait amplitude, last walking direction, secondary-motion springs for
    // torso pitch / roll / twist, a head nod and the hips' squash; subclasses steer act* each frame
    this.gaitAmp = 0;
    this.gfk = 1;
    this.gsk = 0;
    this.pS = new Spring(90, 11);
    this.rS = new Spring(90, 11);
    this.tS = new Spring(70, 10);
    this.hS = new Spring(140, 12);
    this.sqS = new Spring(170, 15);
    this.actPitch = this.actRoll = this.actTwist = this.headNod = 0;
    this.headYaw = this.headPitch = 0;
    this.aimErr = 0;
    this.hunch = 0;
    this.bodyTwist = 0;
    this.armSwing = 0;
    this.seed = Math.random() * 10;
    this.idleT = rnd(3, 8);
  }

  // which way (in its own frame) a world direction points: f along its facing, s along its +x (its left)
  localDir(d) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    _lf.f = d.x * s + d.z * c;
    _lf.s = d.x * c - d.z * s;
    return _lf;
  }

  // A hit from direction `dir` (the shot's travel): the torso is shoved along it, twists, the head snaps
  // and the knees give a little.
  flinch(dir, k = 1) {
    const L = this.localDir(dir);
    this.pS.kick(L.f * 7 * k); // a shot from the front (f < 0) rocks it back
    this.rS.kick(-L.s * 7 * k); // a shot across it tips it the way the shot travels (z < 0 tilts toward +x)
    this.tS.kick((L.s >= 0 ? 1 : -1) * (L.f <= 0 ? 1 : -1) * 4 * k);
    this.hS.kick((L.f <= 0 ? -10 : 8) * k);
    this.sqS.kick(-0.5 * k);
  }

  // ---- AI ----
  think(dt, player) {
    this.stagger = Math.max(0, this.stagger - dt);
    this.attackWait = Math.max(0, (this.attackWait || 0) - dt);
    this.poise = Math.max(0, (this.poise || 0) - dt);
    this.rollCool -= dt;
    this.coverCool -= dt;
    this.knock.multiplyScalar(Math.exp(-6 * dt));
    if (this.state === 'roll') return this.doRoll(dt);
    if (this.stagger > 0) {
      this.move.copy(this.knock);
      return;
    }
    const d = this.toPlayer(player, _d);
    const faceYaw = Math.atan2(_d.x, _d.z);
    if (!this.aggro) {
      if (this.state !== 'idle') this.setState('idle');
      return this.doPatrol(dt);
    }
    if (this.state === 'idle') this.setState('engage');
    if (this.state === 'engage') this.doEngage(dt, player, d);
    else if (this.state === 'cover') this.doCover(dt, player, d);
    else this.act(dt, player, d); // the subclass's attack states
    this.move.add(this.knock);
    if (this.state !== 'cover' || this.stateT > 0.2) this.turnToward(faceYaw, this.turnRate ?? 6, dt);
    // a dodge roll when you line up a shot on it
    if (this.canDodge() && this.sees && this.rollCool <= 0 && this.aimedAt(0.25) && Math.random() < dt * this.dodgeRate) this.tryRoll(player);
  }

  canDodge() {
    return this.state === 'engage' || this.state === 'cover';
  }

  doPatrol(dt) {
    const p = this.pos;
    if (!this.patrolTarget) {
      this.move.set(0, 0, 0);
      this.waitT -= dt;
      if (this.waitT <= 0) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * this.patrol;
        const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
        if (this.pathClear(x, z, 0.3)) this.patrolTarget = new THREE.Vector3(x, p.y, z);
        this.waitT = rnd(1.5, 3.5);
      }
      return;
    }
    _a.set(this.patrolTarget.x - p.x, 0, this.patrolTarget.z - p.z);
    const len = _a.length();
    if (len < 0.4 || this.blockedBy?.ledge) {
      this.patrolTarget = null;
      return;
    }
    _a.divideScalar(len);
    this.move.copy(_a).multiplyScalar(this.speed * 0.45);
    this.turnToward(Math.atan2(_a.x, _a.z), 3, dt);
  }

  doEngage(dt, player, d) {
    const to = _a.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z).normalize();
    if (!this.sees) {
      // hunt: walk to where it last saw you
      _l.set(this.lastSeen.x - this.pos.x, 0, this.lastSeen.z - this.pos.z);
      const len = _l.length();
      this.move.copy(len > 1 ? _l.divideScalar(len).multiplyScalar(this.speed) : _l.set(0, 0, 0));
      if (this.blockedBy?.ledge || len <= 1) this.move.set(-to.z * this.strafeDir, 0, to.x * this.strafeDir).multiplyScalar(this.speed * 0.6);
    } else {
      let fwd = 0;
      const press = this.rage.on ? 0.6 : 1; // enraged, it closes in
      if (d > this.prefer[1] * press) fwd = 1;
      else if (d < this.prefer[0] * press) fwd = -0.7;
      this.strafeT -= dt;
      if (this.strafeT <= 0 || this.blockedBy?.x || this.blockedBy?.z) {
        this.strafeDir *= -1;
        this.strafeT = rnd(1.2, 3);
      }
      this.move.set(to.x * fwd - to.z * this.strafeDir * 0.8, 0, to.z * fwd + to.x * this.strafeDir * 0.8);
      if (this.move.lengthSq() > 1) this.move.normalize();
      this.move.multiplyScalar(this.speed);
    }
    this.engage(dt, player, d);
  }

  doCover(dt, player, d) {
    const p = this.pos;
    if (this.coverAt) {
      _l.set(this.coverAt.x - p.x, 0, this.coverAt.z - p.z);
      const len = _l.length();
      if (len < 0.35 || this.stateT > 3 || this.blockedBy?.ledge) {
        this.coverAt = null;
        this.stateT = 0;
        this.coverWait = rnd(1.2, 2.2);
      } else this.move.copy(_l.divideScalar(len).multiplyScalar(this.speed * 1.35));
    } else {
      this.move.set(0, 0, 0);
      if (this.stateT > this.coverWait) {
        this.coverCool = rnd(5, 8);
        this.setState('engage');
      }
    }
  }

  // hurt: duck behind something if there's cover nearby, else roll
  seekCover(player) {
    if (this.coverCool > 0) return false;
    const c = this.findCover(player);
    this.coverCool = 2;
    if (!c) return false;
    this.coverAt = c;
    this.setState('cover');
    return true;
  }

  // roll (or, kind 'step', a quick sidestep) to whichever side is clear
  tryRoll(player, kind = 'roll') {
    const to = this.toPlayer(player, _l);
    const dist = kind === 'step' ? STEP_DIST : ROLL_DIST;
    const first = Math.random() < 0.5 ? -1 : 1;
    for (const s of [first, -first]) {
      const dx = -_l.z * s, dz = _l.x * s;
      if (!this.pathClear(this.pos.x + dx * dist, this.pos.z + dz * dist, 0.3)) continue;
      this.rollDir = new THREE.Vector3(dx, 0, dz);
      this.rollSide = s;
      // which way that is in its own frame: +1 toward its local +x (its left), -1 toward its right. The
      // tumble turns the body about its forward axis so the head leads in that direction.
      this.rollLocal = this.localDir(this.rollDir).s >= 0 ? 1 : -1;
      this.rollKind = kind;
      this.rollFrom = this.state;
      director.release(this); // a roll cancels any wind-up
      this.rollCool = kind === 'step' ? rnd(0.7, 1.2) : rnd(1.6, 2.6);
      this.setState('roll');
      this.onRoll?.(kind);
      esfx('robot_effort', this.pos, kind === 'step' ? 0.5 : 0.9, this.voicePitch ?? 1);
      barks.say(this, 'roll');
      return true;
    }
    this.rollCool = 0.5;
    return false;
  }

  doRoll(dt) {
    const T = this.rollKind === 'step' ? STEP_T : ROLL_T;
    const dist = this.rollKind === 'step' ? STEP_DIST : ROLL_DIST;
    const u = this.stateT / T;
    if (u >= 1) {
      this.tumble = 0;
      this.move.set(0, 0, 0);
      this.vel.set(0, 0, 0);
      // coming out of it: the hips sink into a crouch and the hydraulics take the weight
      this.sqS.kick(this.rollKind === 'step' ? -0.35 : -0.7);
      if (this.rollKind !== 'step') esfx('hydraulic_land', this.pos, 0.6, this.voicePitch ?? 1);
      this.setState(this.rollFrom === 'cover' ? 'cover' : 'engage');
      return;
    }
    // fast out, easing to a stop: the speed integrates to `dist` over T
    const v = ((2 * dist) / T) * (1 - u);
    this.move.copy(this.rollDir).multiplyScalar(v);
    this.vel.x = this.move.x;
    this.vel.z = this.move.z;
    // (the tumble itself is posed in poseBase, from rollLocal)
  }

  // fell (or rolled) off a ledge and landed: squash into the knees, hiss
  onLand(impact) {
    this.sqS.kick(-Math.min(1.6, impact * 0.12));
    if (impact > 3) esfx('hydraulic_land', this.pos, Math.min(1, impact / 9), this.voicePitch ?? 1);
  }

  // idle hums and relay clicks while it stands about unaware (only close up)
  idleSounds(dt) {
    if (this.aggro || this.dist > 16) return;
    if ((this.idleT -= dt) > 0) return;
    this.idleT = rnd(4, 9);
    esfx(Math.random() < 0.6 ? 'robot_idle_click' : 'robot_idle_hum', this.pos, 1, (this.voicePitch ?? 1) * rnd(0.9, 1.1));
  }

  // A correct-color hit: knocked back along the shot and staggered (attacks interrupted). Right after a
  // stagger it has a moment of poise (hits still hurt but don't stagger), so sustained fire can't pin it
  // and it gets the chance to roll out of the stream.
  // keep: it's committed (e.g. raising a shield): the hit hurts but doesn't cancel what it's doing
  takeHit(hit, { stagger = 0.3, knock = 2.2, keep = false } = {}) {
    this.aggro = true;
    this.hp--;
    this.flash = 1;
    const dir = this.shotDir(hit, new THREE.Vector3());
    if (this.poise <= 0 && !keep) {
      this.knock.add(_l.copy(dir).setY(0).normalize().multiplyScalar(knock));
      this.stagger = stagger;
      this.poise = stagger + 0.45;
    }
    this.flinch(dir, keep ? 0.5 : 1);
    this.hitSparks(hit);
    audio.droneHit(Math.max(0.5, falloff(this.dist, 6, 40)));
    if (this.hp <= 0) {
      this.die(dir);
      return 'kill';
    }
    esfx(this.painSound ?? 'robot_pain_heavy', this.pos, 1, (this.voicePitch ?? 1) * rnd(0.92, 1.08));
    barks.say(this, 'hit');
    if (this.state === 'roll' || keep) return 'hit';
    if (this.state !== 'engage' && this.state !== 'cover') this.interrupt?.();
    if (this.state !== 'cover' && this.hp <= Math.ceil(this.maxHp / 2) && !this.seekCover(this.world.game.player) && this.rollCool <= 0) {
      this.stagger = 0;
      this.tryRoll(this.world.game.player);
    }
    return 'hit';
  }

  // ---- the shared procedural body ----
  // Walk: the gait phase advances with distance walked (so feet don't skate), legs swing along the
  // direction of travel (forward, back or sideways when strafing) with the knee lifting through the swing
  // and the hips bobbing (lowest at heel strike), swaying over the stance leg, twisting with the stride
  // while the torso counter-twists. On top: lean into the walk and into the run-up, breathing when still,
  // the subclass's attack lean (actPitch / actRoll / actTwist: anticipation and follow-through), springy
  // flinches from hits (flinch), a knee-buckle stagger, a squash when it lands, a head that tracks you
  // (or looks about when it hasn't seen you), and the action roll: a tucked log roll about its forward axis
  // whose head leads toward the side it travels (rollLocal), with a sink into a crouch as it comes up.
  // Writes armSwing / tuck / hunch / bodyTwist / aimErr for the subclass's arms.
  poseBase(dt) {
    const n = this.n;
    const rest = n.body.userData.rest;
    this.torsoRestX ??= n.torso.rotation.x;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const fwd = this.vel.x * s + this.vel.z * c;
    const side = this.vel.x * c - this.vel.z * s; // along its +x (its left)
    const speed = Math.hypot(fwd, side);
    const rolling = this.state === 'roll' && this.rollKind !== 'step';
    const stepping = this.state === 'roll' && this.rollKind === 'step';
    const k = rolling ? 0 : Math.min(1, speed / this.speed);
    this.gaitAmp += (k - this.gaitAmp) * Math.min(1, dt * 7);
    const amp = this.gaitAmp;
    if (!rolling) this.gaitPhase += ((speed * dt) / (this.strideLen ?? 0.95)) * Math.PI;
    if (speed > 0.2) {
      this.gfk = fwd / speed;
      this.gsk = side / speed;
    }
    const fk = this.gfk, sk = this.gsk;
    const p = this.gaitPhase, sp = Math.sin(p), cp = Math.cos(p);
    const A = (this.stride ?? 0.55) * amp;
    const stag = this.stagger > 0 ? Math.min(1, this.stagger * 4) : 0;
    const crouch = (this.crouch = THREE.MathUtils.lerp(this.crouch, (this.wantCrouch ?? 0) + stag * 0.3, Math.min(1, dt * 10)));
    // the roll: tuck in, a full turn about the forward axis (eased), untuck
    let tuck = 0, tumble = 0, hop = 0;
    const u = this.state === 'roll' ? Math.min(1, this.stateT / (stepping ? STEP_T : ROLL_T)) : 0;
    if (rolling) {
      tuck = smooth(0, 0.2, u) * (1 - smooth(0.78, 1, u));
      tumble = -this.rollLocal * TAU * smooth(0.06, 0.86, u); // z < 0 tips the top toward +x
    } else if (stepping) hop = Math.sin(u * Math.PI);
    this.tumble = tumble;
    this.tuck = tuck;
    // squash (landings, roll recoveries, hits): the hips drop, the knees take it
    const sq = Math.min(0.05, this.sqS.step(0, dt));
    const bend = -sq * 2.4;
    // legs (no per-frame allocation: two explicit calls)
    this.poseLeg(n.legL, n.shinL, sp, cp, 1, A, amp, fk, sk, crouch, tuck, bend);
    this.poseLeg(n.legR, n.shinR, -sp, -cp, -1, A, amp, fk, sk, crouch, tuck, bend);
    // hips: bob (high at mid-stance), sway over the stance leg, drop into a crouch / the roll / a squash
    const bob = (Math.abs(cp) - 0.55) * 0.065 * amp;
    const sway = -cp * 0.045 * amp; // over the left leg (+x) while it's planted (cos < 0)
    const rollY = rolling ? tuck * (rest.y - (this.rollRadius ?? 0.6)) : 0;
    n.body.position.set(rest.x + sway, rest.y + bob - crouch * (this.crouchDrop ?? 0.35) - rollY + sq + hop * 0.12, rest.z);
    // torso lean: into the walk (and the speed-up), the crouch, the subclass's attack lean, hit flinches
    const accel = THREE.MathUtils.clamp((speed - (this.lastSpeed ?? speed)) / Math.max(dt, 1e-3), -8, 8);
    this.lastSpeed = speed;
    const pitchT = fk * k * 0.13 + crouch * 0.22 + accel * 0.012 + this.actPitch + stag * 0.12;
    const rollT = -sk * k * 0.09 + this.actRoll + (stepping ? -this.rollLocal * 0.28 * hop : 0);
    const pitch = this.pS.step(pitchT, dt);
    const roll = this.rS.step(rollT, dt);
    const twist = this.tS.step(this.actTwist, dt);
    const hipTwist = -sp * 0.15 * amp * fk; // the swinging leg's hip comes forward (y < 0 brings +x forward)
    const hipRoll = -cp * 0.045 * amp; // the stance hip rides up
    const wob = stag ? Math.sin(this.t * 38) * 0.06 * stag : 0;
    n.body.rotation.set(pitch * 0.45 + tuck * 0.15, hipTwist + wob, hipRoll * (1 - tuck) + roll * 0.5 + tumble);
    const breathe = Math.sin(this.t * 1.7 + this.seed) * 0.022 * (1 - amp);
    n.torso.rotation.set(this.torsoRestX + pitch * 0.55 + breathe + tuck * 0.85, -hipTwist * 1.8 + twist, roll * 0.5);
    this.breath = breathe;
    this.hunch = n.body.rotation.x + n.torso.rotation.x;
    this.bodyTwist = n.body.rotation.y + n.torso.rotation.y;
    // head: tracks you once it's onto you, else looks about; snaps with hits, nods with headNod
    const player = this.world.game.player;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const hd = Math.max(0.5, Math.hypot(dx, dz));
    this.aimErr = THREE.MathUtils.clamp(angleTo(this.yaw, Math.atan2(dx, dz)), -0.9, 0.9);
    let hy, hp;
    if (this.aggro) {
      hy = THREE.MathUtils.clamp(this.aimErr - this.bodyTwist, -1, 1);
      hp = -Math.atan2(player.pos.y + player.eye - (this.pos.y + this.height * 0.9), hd) - this.hunch * 0.7;
    } else {
      // a slow look round now and then
      const scan = Math.sin(this.t * 0.37 + this.seed) + Math.sin(this.t * 0.83 + this.seed * 2) * 0.5;
      hy = Math.abs(scan) > 0.6 ? scan * 0.55 : 0;
      hp = 0.05 + Math.sin(this.t * 0.5 + this.seed) * 0.05 - this.hunch * 0.5;
    }
    const hk = Math.min(1, dt * (this.aggro ? 7 : 3));
    this.headYaw += (hy - this.headYaw) * hk;
    this.headPitch += (THREE.MathUtils.clamp(hp, -0.7, 0.6) - this.headPitch) * hk;
    const nod = this.hS.step(this.headNod, dt);
    n.head.rotation.set(this.headPitch + nod + tuck * 0.5, this.headYaw * (1 - tuck), -roll * 0.3);
    // arms counter-swing to the legs (left arm back while the left leg is forward)
    this.armSwing = sp * 0.45 * amp * Math.max(0.35, Math.abs(fk));
    // footfalls: each heel strike (the swing ends as cos(phase) turns over)
    const fs = cp >= 0 ? 1 : -1;
    if (fs !== this.footSign) {
      this.footSign = fs;
      if (amp > 0.25 && this.grounded && !rolling) this.onStep?.(amp, fs);
    }
    this.idleSounds(dt);
  }

  // one leg: the thigh swings along the walk direction (forward / back, out to the side when strafing),
  // the knee lifts through the swing (cos > 0) and folds for the crouch, the roll's tuck and a squash
  poseLeg(leg, shin, sw, lift, sgn, A, amp, fk, sk, crouch, tuck, bend) {
    leg.rotation.x = -sw * A * fk - crouch * 0.9 - tuck * 1.7 - bend;
    leg.rotation.z = sw * A * 0.8 * sk + sgn * 0.045 * (1 + crouch);
    shin.rotation.x = (Math.max(0, lift) * 0.95 + 0.08) * amp + crouch * 1.5 + tuck * 2.3 + bend * 2;
  }

  // the arm pitch that points a shoulder at you, given the torso's lean (rotation.x = -PI/2 is level)
  aimPitch(player, shoulderY) {
    const d = Math.max(1, Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z));
    return -Math.PI / 2 - Math.atan2(player.pos.y + player.eye * 0.6 - (this.pos.y + shoulderY), d) - this.hunch;
  }

  // knees buckle and it topples along the killing shot; then finishDeath() blows it apart
  die(dir) {
    this.dead = true;
    this.dying = true;
    this.shield?.dispose(); // (a shell still flying apart goes with it)
    director.release(this);
    this.dyingT = 0;
    this.deathDir = dir.clone().setY(0).normalize();
    const L = this.localDir(this.deathDir);
    this.deathF = L.f;
    this.deathS = L.s;
    this.world.removeHittable(this.hitRoot);
    esfx(this.painSound ?? 'robot_pain_heavy', this.pos, 1, (this.voicePitch ?? 1) * 0.8);
    barks.died(this);
    this.onDie?.();
  }

  updateDying(dt) {
    this.dyingT += dt;
    const k = Math.min(1, this.dyingT / (this.dyingTime ?? 0.7));
    const n = this.n;
    this.knock.multiplyScalar(Math.exp(-5 * dt));
    this.move.copy(this.knock);
    this.vel.x = this.move.x;
    this.vel.z = this.move.z;
    if (this.grounded) this.walk(this.vel.x * dt, this.vel.z * dt);
    this.sync();
    // a jolt back from the hit, then the knees go and it pitches over along the shot
    const kk = k * k, jolt = Math.sin(Math.min(1, k * 3) * Math.PI) * 0.25;
    const f = this.deathF ?? -1, s = this.deathS ?? 0;
    n.body.position.y = n.body.userData.rest.y - kk * this.height * 0.3;
    n.body.rotation.set(f * (kk * 0.9 + jolt), Math.sin(this.dyingT * 30) * 0.04 * (1 - k), -s * (kk * 0.7 + jolt));
    n.torso.rotation.x = (this.torsoRestX ?? 0) + kk * 0.4;
    n.legL.rotation.x = -k * 1.2;
    n.legR.rotation.x = -k * 0.9;
    n.shinL.rotation.x = n.shinR.rotation.x = k * 1.8;
    n.armL.rotation.x = -k * 0.8 + jolt;
    n.armR.rotation.x = -k * 0.6 - jolt;
    n.head.rotation.x = k * 0.5 - jolt;
    this.dyingFx?.(dt, k);
    if (k >= 1) {
      this.dying = false;
      this.onDeath?.(this);
      this.finishDeath();
    }
  }
}

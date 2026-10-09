// GLOB PUZZLES — pieces built for the green glob launcher (weapons/globs.js): things a glob's BURST works
// on and a straight shot can't. They follow the mechanics toolkit's rules (entities/mechanics.js): world
// space [x, y, z] options, reset(), and activate() / deactivate() / timer(left, total) on their links.
// A burst reaches them through globs.js blast(): onHit(GREEN, hit) with hit.kind 'blast' on anything in
// its radius it can see, and onSplash(point, radius, color) on every entity that has one.
//
// SporeBulb   { pos, size: 1, mode: 'once' | 'pulse', links: [], onActivate, plume: 3.2, stalk: 0.8, face }
//   A glowing spore bulb on a stalk, the receiver of a glob puzzle: a green burst that reaches it pops it
//   open and fires its links (once: stays open; pulse: fires on every hit). Other colors glance off. A faint
//   plume of spores stands over it (no collision, not shootable), so a bulb behind a wall or down a pit still
//   shows where it is: lob over and read the arc. face: 'up' (default) or a wall side ('+x' ...) for a bulb
//   growing out of a wall. on / reset() / activate().
// BulbCluster { bulbs: [SporeBulb, ...], window: 0.3, time: 0, links: [], onActivate, onExpire }
//   Splash switches: bulbs that only count when one burst catches them all (a hit lights a bulb for
//   `window` s, a glob comes every 0.62 s). time > 0: it holds that long, the bulbs dimming as it runs
//   down and flickering at the end (ticks; timer(left, total) on the links, like a timed switch), then goes
//   dark and deactivates its links; splash it again to refill. time 0: it stays open.
// Thicket     { min, max, style: 'bramble' | 'nest' | 'roots', health: 1, sealed: false, material, onBreak }
//   A growth choking a path: thorn brambles, a hive nest of papery cells, or living roots (material: the
//   level's bark). Solid to bodies and shots; only a glob's burst tears it apart (other colors glance off).
//   sealed: nothing breaks it (a door of roots that something else opens). wither(): it dies back by
//   itself (scripted). Once broken it stays gone.
// SwingRoot   { pivot, length, width: 2, back: 1, thick: 0.6, from: 'e', to: 's', time: 1.2, material }
//   A great root arm on a knuckle at `pivot` (its top surface at pivot.y) that swings round (activate())
//   from pointing `from` to pointing `to` (compass sides: 'n' -z, 's' +z, 'e' +x, 'w' -x) and slams down as a
//   walkway. Solid in either rest position, not mid-swing; waits rather than land in the player.
// Brink       { min, max, dir: [x, 0, z], killY, land: null }
//   A ledge where a glob's burst bowls ground enemies (slime molds, spider bots, brutes) standing in
//   min..max off the edge, away from the blast and out along `dir`, to tumble into the sludge or the drop
//   below (gone once they fall under killY, or after 3 s). land: the coordinate along dir's axis to drop
//   them at (the middle of a narrow trough), instead of flinging them well out.
import * as THREE from 'three';
import { COLORS, GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { boxGeo } from '../materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { v3, glowMat, nearGain, overlapsPlayer, sfx, clamp, rnd, tickDue } from './mechkit.js';
import { Slime, SpiderBot } from './verdantEnemies.js';
import { Brute } from './brute.js';

const HEX = COLORS[GREEN].hex;
const GOO = new THREE.Color(0x3dff7a);
const SPORE = new THREE.Color(0xd8ff9a);
const DUST = new THREE.Color(0x6a7a52);
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _c = new THREE.Color();

audio.manifest?.then(() => audio.prefetch(['pod_burst', 'spore_burst', 'spore_puff', 'root_rumble', 'vine_whip', 'crumble_break', 'slime_splat', 'acid', 'toxic_sink']));
const play = (name, o, alt = null, altO = o) => audio.sample(name, o) || (alt && audio.sample(alt, altO));

// ---------------------------------------------------------------- shared look (made once)
let K = null;
function kit() {
  if (K) return K;
  const plumeTex = (() => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 64;
    const g = c.getContext('2d');
    const v = g.createLinearGradient(0, 64, 0, 0);
    v.addColorStop(0, 'rgba(255,255,255,0.9)');
    v.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, 32, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  K = {
    stalkGeo: new THREE.CylinderGeometry(0.05, 0.1, 1, 6).translate(0, 0.5, 0),
    shellGeo: new THREE.IcosahedronGeometry(0.34, 2),
    heartGeo: new THREE.IcosahedronGeometry(0.17, 1),
    petalGeo: new THREE.SphereGeometry(0.3, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.55, 1, 0.18).rotateX(-Math.PI / 2).translate(0, 0, 0.02),
    plumeGeo: new THREE.CylinderGeometry(0.22, 0.42, 1, 12, 1, true).translate(0, 0.5, 0),
    stalkMat: new THREE.MeshStandardMaterial({ color: 0x2c5a34, roughness: 0.8, flatShading: true }),
    shellMat: new THREE.MeshStandardMaterial({ color: 0x1fb04a, emissive: 0x0a7a2a, emissiveIntensity: 0.7, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72 }),
    petalMat: new THREE.MeshStandardMaterial({ color: 0x3f8a3a, emissive: 0x0c3a12, roughness: 0.85, flatShading: true, side: THREE.DoubleSide }),
    plumeTex,
    thornMat: new THREE.MeshStandardMaterial({ color: 0x2e3a1c, roughness: 0.95, flatShading: true }),
    podMat: glowMat(0x7dff8a, 1.6),
    paperMat: new THREE.MeshStandardMaterial({ color: 0x8c8366, roughness: 1, flatShading: true }),
    cellMat: glowMat(0xb6ff5a, 1.7),
    rimMat: glowMat(HEX, 1.8),
  };
  return K;
}

// ================================================================ SPORE BULB
export class SporeBulb {
  constructor(world, { pos, size = 1, mode = 'once', links = [], onActivate = null, plume = 3.2, stalk = 0.8, face = 'up' }) {
    const k = kit();
    this.world = world;
    this.color = GREEN;
    this.pos = v3(pos);
    this.size = size;
    this.mode = mode;
    this.links = links;
    this.onActivate = onActivate;
    this.cluster = null;
    this.on = false;
    this.litT = 0; // a cluster bulb's moment of light
    this.dim = 1; // a timed cluster's run-down (1 full .. 0 dark)
    this.flash = 0;
    this.bloom = 0; // petals: 0 closed .. 1 open
    this.t = Math.random() * 10;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    // grows out of a wall: the stalk leans out of it and curls up
    const n = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[face];
    this.root = new THREE.Group();
    if (n) this.root.rotation.set(n[1] * 1.1, 0, -n[0] * 1.1);
    this.group.add(this.root);
    const s = new THREE.Mesh(k.stalkGeo, k.stalkMat);
    s.scale.set(size, stalk * size, size);
    this.heartMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9dffb0) });
    this.head = new THREE.Group();
    this.head.position.y = stalk * size + 0.3 * size;
    if (n) this.head.rotation.set(-n[1] * 1.1, 0, n[0] * 1.1); // the head turns back upright
    this.shell = new THREE.Mesh(k.shellGeo, k.shellMat);
    const heart = new THREE.Mesh(k.heartGeo, this.heartMat);
    this.petals = [];
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Group();
      p.rotation.y = (i / 5) * Math.PI * 2;
      const leaf = new THREE.Mesh(k.petalGeo, k.petalMat);
      leaf.position.set(0, -0.12, 0.12);
      p.add(leaf);
      this.petals.push(leaf);
      this.head.add(p);
    }
    this.head.add(this.shell, heart);
    this.head.scale.setScalar(size);
    this.root.add(s, this.head);
    this.group.userData.hit = this;
    world.scene.add(this.group);
    world.addHittable(this.group);
    // the plume over it (its own object: not shootable)
    this.plumeMat = new THREE.MeshBasicMaterial({ map: k.plumeTex, color: new THREE.Color(0x7dffa0), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.plume = new THREE.Mesh(k.plumeGeo, this.plumeMat);
    this.plume.scale.set(size, plume, size);
    this.head.updateWorldMatrix(true, false);
    this.head.getWorldPosition(this.plume.position);
    this.headPos = this.plume.position.clone();
    this.plume.position.y += 0.2 * size;
    this.plume.renderOrder = 4;
    this.plumeH = plume;
    if (plume > 0) world.scene.add(this.plume);
    world.add(this);
    this.reset();
  }

  get lit() {
    return this.litT > 0;
  }

  reset() {
    this.on = false;
    this.litT = 0;
    this.dim = 1;
    this.flash = 0;
    this.bloom = 0;
  }

  onHit(color, hit) {
    if (color !== GREEN) {
      this.flash = Math.max(this.flash, 0.4);
      return 'immune';
    }
    this.flash = 1;
    if (this.cluster) {
      this.litT = this.cluster.window;
      this.pop(0.5);
      this.cluster.lit(this);
      return 'hit';
    }
    if (this.mode === 'once' && this.on) return 'hit';
    this.on = true;
    this.pop(1);
    for (const l of this.links) l?.activate?.(this);
    this.onActivate?.(this);
    return 'hit';
  }

  activate() {
    if (this.on) return;
    this.on = true;
    this.pop(1);
    for (const l of this.links) l?.activate?.(this);
    this.onActivate?.(this);
  }

  // the pop: spores and goo out of the bulb, a ring, the sound
  pop(k) {
    const fx = this.world.fx, p = this.headPos, g = nearGain(this.world, p, 45);
    fx.flash(p, HEX, { size: 1.4 * this.size * k, life: 0.18, hot: 0.4 });
    fx.ring(p, null, 0xbfffcf, { size: 0.2, end: 1.6 * this.size, life: 0.3, thick: 0.1 });
    for (let i = 0, c = fx.budget(Math.round(18 * k)); i < c; i++) {
      _v.randomDirection().addScaledVector(UP, 0.8).multiplyScalar(rnd(1, 4));
      const j = fx.spawn(0, p, _v.x, _v.y, _v.z, i % 3 ? SPORE : GOO, 1.4, rnd(0.6, 1.4), rnd(0.03, 0.06));
      fx.grav[j] = -0.4;
      fx.drag[j] = 1.8;
    }
    if (k >= 1) {
      play('pod_burst', { gain: 0.8 * g, vary: 0.1 }, 'spore_burst', { gain: 0.7 * g });
      sfx.switchOn(g);
    } else play('spore_puff', { gain: 0.6 * g, rate: 1.2, vary: 0.1 }, 'slime_splat', { gain: 0.4 * g, rate: 1.5 });
  }

  update(dt, player) {
    this.t += dt;
    if (Math.abs(player.pos.z - this.pos.z) > 90 || Math.abs(player.pos.x - this.pos.x) > 90) return;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.litT = Math.max(0, this.litT - dt);
    const open = this.on ? this.dim : this.litT > 0 ? 0.6 : 0;
    this.bloom += (open - this.bloom) * Math.min(1, dt * (open > this.bloom ? 10 : 3));
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (this.on ? 2 : 3.4));
    // dormant: a slow green breath; open: blazing; a flash on every hit
    const glow = this.on ? 1.6 + 1.6 * this.dim + 0.3 * pulse : 0.7 + 0.6 * pulse + this.litT * 4;
    this.heartMat.color.copy(GOO).multiplyScalar(glow).lerp(_c.setRGB(3, 3, 3), this.flash * 0.6);
    this.shell.scale.setScalar(1 + this.bloom * 0.18 + Math.sin(this.t * 5) * 0.025 + this.flash * 0.15);
    for (const p of this.petals) p.rotation.x = -0.25 - this.bloom * 1.25;
    this.root.rotation.y = Math.sin(this.t * 0.7) * 0.08;
    if (this.plumeH > 0) this.plumeMat.opacity = this.on ? 0.05 * this.dim : 0.22 + 0.1 * pulse;
    // a dormant bulb breathes out a thin stream of spores that rises well clear of whatever hides it
    if (!this.on && this.plumeH > 0 && Math.random() < dt * 9 && player.pos.distanceToSquared(this.pos) < 2500) {
      const fx = this.world.fx, p = this.headPos;
      _v.set(p.x + rnd(-0.15, 0.15) * this.size, p.y + 0.2, p.z + rnd(-0.15, 0.15) * this.size);
      const j = fx.spawn(0, _v, rnd(-0.15, 0.15), rnd(1.2, 2), rnd(-0.15, 0.15), SPORE, 1.6, rnd(1.6, 2.4), rnd(0.03, 0.05));
      fx.drag[j] = 0.4;
      fx.grav[j] = -0.15;
    }
  }
}

// ================================================================ BULB CLUSTER (splash switches)
export class BulbCluster {
  constructor(world, { bulbs, window = 0.3, time = 0, links = [], onActivate = null, onExpire = null }) {
    this.world = world;
    this.bulbs = bulbs;
    this.window = window;
    this.time = time;
    this.links = links;
    this.onActivate = onActivate;
    this.onExpire = onExpire;
    for (const b of bulbs) b.cluster = this;
    this.centre = bulbs.reduce((c, b) => c.add(b.headPos), new THREE.Vector3()).divideScalar(bulbs.length);
    world.add(this);
    this.reset();
  }

  get on() {
    return this.open;
  }

  reset() {
    this.open = false;
    this.left = 0;
    for (const b of this.bulbs) b.reset();
  }

  // a bulb was splashed: open once every bulb is lit at the same time
  lit() {
    if (this.open) {
      if (this.time > 0) this.refill();
      return;
    }
    if (!this.bulbs.every((b) => b.litT > 0)) return;
    this.open = true;
    this.left = this.time;
    for (const b of this.bulbs) {
      b.on = true;
      b.dim = 1;
      b.pop(1);
    }
    for (const l of this.links) l?.activate?.(this);
    this.onActivate?.(this);
  }

  refill() {
    this.left = this.time;
    for (const b of this.bulbs) b.dim = 1;
    for (const l of this.links) l?.activate?.(this);
  }

  update(dt) {
    if (!this.open || this.time <= 0) return;
    const prev = this.left;
    this.left = Math.max(0, this.left - dt);
    const k = this.left / this.time;
    const warn = this.left < 1.6 ? (Math.sin(this.left * 30) > 0 ? 1 : 0.25) : 1;
    for (const b of this.bulbs) b.dim = (0.25 + 0.75 * k) * warn;
    for (const l of this.links) l?.timer?.(this.left, this.time);
    if (tickDue(prev, this.left)) sfx.tick(this.left < 1.5, nearGain(this.world, this.centre, 40));
    if (this.left > 0) return;
    this.open = false;
    for (const b of this.bulbs) {
      b.on = false;
      b.dim = 1;
    }
    sfx.switchOff(nearGain(this.world, this.centre, 40));
    for (const l of this.links) l?.deactivate?.(this);
    this.onExpire?.(this);
  }
}

// ================================================================ THICKET (blast it apart)
export class Thicket {
  constructor(world, { min, max, style = 'bramble', health = 1, sealed = false, material = null, onBreak = null, seed = 1 }) {
    const k = kit();
    this.world = world;
    this.color = GREEN;
    this.min = v3(min);
    this.max = v3(max);
    this.style = style;
    this.health = this.maxHealth = health;
    this.sealed = sealed;
    this.onBreak = onBreak;
    this.broken = false;
    this.k = 1; // 1 standing .. 0 gone
    this.dying = 0;
    this.shake = 0;
    const size = _v.subVectors(this.max, this.min), c = this.min.clone().add(this.max).multiplyScalar(0.5);
    this.centre = c;
    let r = seed * 9301 + 49297;
    const R = (a, b) => ((r = (r * 9301 + 49297) % 233280), a + (b - a) * (r / 233280));
    const body = [], glow = [];
    if (style === 'nest') {
      // a hive nest: lumps of chewed papery comb heaped in the gap, studded with glowing cells
      for (let i = 0; i < 9; i++) {
        const g = new THREE.IcosahedronGeometry(R(0.5, 0.9) * Math.min(size.x, size.z, 2.4), 1);
        g.scale(1, R(0.6, 1), 1).translate(R(-0.35, 0.35) * size.x, R(-0.4, 0.3) * size.y, R(-0.35, 0.35) * size.z);
        body.push(g);
      }
      for (let i = 0; i < 26; i++) {
        _a.randomDirection();
        const cell = new THREE.CylinderGeometry(0.11, 0.11, 0.14, 6).rotateX(Math.PI / 2);
        cell.lookAt(_a);
        cell.translate(_a.x * size.x * 0.48, _a.y * size.y * 0.42, _a.z * size.z * 0.48);
        glow.push(cell);
      }
    } else {
      // thorn brambles: twisted woody vines strung across the gap, thorns all along, spore pods in the tangle
      // (roots: fewer, far thicker, no thorns, woven across a doorway)
      const roots = style === 'roots';
      const along = size.x >= size.z ? 'x' : 'z';
      for (let i = 0; i < (roots ? 7 : 9); i++) {
        const pts = [];
        const y0 = R(0.05, 0.95) * size.y, y1 = R(0.05, 0.95) * size.y, d0 = R(-0.4, 0.4), d1 = R(-0.4, 0.4);
        for (let j = 0; j <= 4; j++) {
          const u = j / 4;
          const a = -0.55 + u * 1.1, y = y0 + (y1 - y0) * u + R(-0.4, 0.4) - size.y / 2, d = d0 + (d1 - d0) * u + R(-0.2, 0.2);
          pts.push(along === 'x' ? new THREE.Vector3(a * size.x, y, d * size.z) : new THREE.Vector3(d * size.x, y, a * size.z));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        body.push(new THREE.TubeGeometry(curve, 14, roots ? R(0.18, 0.32) : R(0.07, 0.16), roots ? 6 : 5, false));
        for (let j = 0; j < (roots ? 0 : 9); j++) {
          const p = curve.getPoint(R(0.05, 0.95));
          _a.randomDirection();
          const th = new THREE.ConeGeometry(0.045, R(0.18, 0.32), 4).translate(0, 0.12, 0);
          th.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, _a)));
          th.translate(p.x, p.y, p.z);
          body.push(th);
        }
      }
      for (let i = 0; i < 6; i++) glow.push(new THREE.IcosahedronGeometry(R(0.1, 0.2), 1).translate(R(-0.4, 0.4) * size.x, R(-0.4, 0.4) * size.y, R(-0.4, 0.4) * size.z));
    }
    const strip = (g) => {
      const o = g.index ? g.toNonIndexed() : g;
      for (const name of Object.keys(o.attributes)) if (name !== 'position' && name !== 'normal') o.deleteAttribute(name);
      return o;
    };
    this.group = new THREE.Group();
    this.group.position.copy(c);
    this.body = new THREE.Mesh(mergeGeometries(body.map(strip)), material || (style === 'nest' ? k.paperMat : k.thornMat));
    this.glow = new THREE.Mesh(mergeGeometries(glow.map(strip)), style === 'nest' ? k.cellMat : k.podMat);
    this.group.add(this.body, this.glow);
    world.scene.add(this.group);
    this.solid = world.addSolid(this.min.clone(), this.max.clone(), { entity: this, kind: 'grass' });
    world.add(this);
  }

  reset() {} // (stays broken: it was the way on)

  onHit(color, hit) {
    if (this.broken) return undefined;
    if (color !== GREEN || this.sealed) {
      this.shake = 0.3;
      return 'immune';
    }
    this.shake = 1;
    this.health--;
    const p = hit?.point || this.centre;
    this.world.fx.burst(p, this.style === 'nest' ? 0xb6ff5a : 0x5f9432, { count: 14, speed: 5, life: 0.6, size: 0.2, gravity: 9 });
    if (this.health <= 0) this.tear(hit);
    return 'hit';
  }

  // torn apart by a burst: chunks of vine and thorn fly, spores pour out, the gap opens
  tear(hit) {
    if (this.broken) return;
    this.broken = true;
    this.solid.enabled = false;
    this.dying = 0.35;
    const fx = this.world.fx, c = this.centre, size = _v.subVectors(this.max, this.min);
    const g = nearGain(this.world, c, 50);
    const nest = this.style === 'nest';
    for (let i = 0, n = fx.budget(40); i < n; i++) {
      _a.set(rnd(-0.5, 0.5) * size.x, rnd(-0.5, 0.5) * size.y, rnd(-0.5, 0.5) * size.z).add(c);
      _v.subVectors(_a, c).normalize().multiplyScalar(rnd(3, 8));
      if (hit?.dir) _v.addScaledVector(hit.dir, 3);
      fx.shard(_a, _v.x, _v.y + 3, _v.z, _c.set(nest ? 0x8c8366 : 0x3a4a24), 1, rnd(0.8, 1.4), rnd(0.08, 0.16));
    }
    fx.burst(c, nest ? 0xb6ff5a : 0x7dff8a, { count: 30, speed: 6, life: 0.9, size: 0.18, gravity: 2, drag: 2 });
    for (let i = 0, n = fx.budget(10); i < n; i++) {
      _v.randomDirection().multiplyScalar(rnd(0.5, 1.8));
      const j = fx.puff(_a.set(rnd(-0.4, 0.4) * size.x, rnd(-0.4, 0.4) * size.y, rnd(-0.4, 0.4) * size.z).add(c), _v.x, _v.y, _v.z, nest ? _c.set(0x9a9070) : DUST, 0.6, rnd(0.8, 1.4), rnd(0.5, 0.9), 2.4);
      fx.grav[j] = -0.4;
    }
    fx.flash(c, HEX, { size: 2.6, life: 0.2, hot: 0.3 });
    play('crumble_break', { gain: 0.8 * g, rate: 1.3, vary: 0.1 });
    play('vine_whip', { gain: 0.7 * g, rate: 0.8, vary: 0.1 }, 'pod_burst', { gain: 0.6 * g });
    this.onBreak?.(this);
  }

  // dies back on its own (something drained it): it browns, sags and crumbles over a second and a half
  wither() {
    if (this.broken) return;
    this.broken = true;
    this.solid.enabled = false;
    this.dying = 1.5;
    this.slow = true;
    const g = nearGain(this.world, this.centre, 50);
    play('root_rumble', { gain: 0.7 * g, rate: 1.3 }, 'crumble_break', { gain: 0.5 * g, rate: 0.7 });
  }

  update(dt, player) {
    if (this.k <= 0) return;
    if (this.broken) {
      const span = this.slow ? 1.5 : 0.35;
      this.dying -= dt;
      this.k = Math.max(0, this.dying / span);
      this.group.scale.set(1 - (1 - this.k) * 0.3, this.k, 1 - (1 - this.k) * 0.3);
      this.group.position.y = this.centre.y - (1 - this.k) * (this.max.y - this.min.y) * 0.5;
      if (this.slow && Math.random() < dt * 30) this.world.fx.burst(_a.set(rnd(this.min.x, this.max.x), rnd(this.min.y, this.max.y), rnd(this.min.z, this.max.z)), 0x6a5a32, { count: 2, speed: 1.5, life: 0.8, size: 0.25, gravity: 6 });
      if (this.k <= 0) this.group.visible = false;
      return;
    }
    if (Math.abs(player.pos.z - this.centre.z) > 80) return;
    this.shake = Math.max(0, this.shake - dt * 4);
    const t = this.world.time;
    this.group.position.set(this.centre.x + Math.sin(t * 47) * 0.05 * this.shake, this.centre.y, this.centre.z + Math.cos(t * 41) * 0.05 * this.shake);
    this.glow.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
  }
}

// ================================================================ SWING ROOT (a root arm walkway)
const SIDE = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 };

export class SwingRoot {
  constructor(world, { pivot, length, width = 2, back = 1, thick = 0.6, from = 'e', to = 's', time = 1.2, material = null }) {
    const k = kit();
    this.world = world;
    this.pivot = v3(pivot);
    this.length = length;
    this.width = width;
    this.back = back;
    this.thick = thick;
    this.a0 = SIDE[from];
    let d = SIDE[to] - this.a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d <= -Math.PI) d += Math.PI * 2;
    this.a1 = this.a0 + d;
    this.time = time;
    this.group = new THREE.Group();
    this.group.position.copy(this.pivot);
    this.spin = new THREE.Group();
    this.group.add(this.spin);
    const L = length + back;
    const m = material || k.thornMat;
    // the arm: a thick root, tapering toward its tip in three segments, a glowing moss seam along both edges
    for (let i = 0; i < 3; i++) {
      const u0 = i / 3, u1 = (i + 1) / 3, w = width * (1 - i * 0.08), h = thick * (1 - i * 0.12);
      const seg = new THREE.Mesh(boxGeo(L * (u1 - u0) + 0.02, h, w, 0.6), m);
      seg.position.set(-back + L * (u0 + u1) / 2, -h / 2, 0);
      this.spin.add(seg);
    }
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 0.06), k.rimMat);
      rim.position.set(-back + L / 2, -0.04, side * (width / 2 + 0.01));
      this.spin.add(rim);
    }
    const knuckle = new THREE.Mesh(new THREE.IcosahedronGeometry(width * 0.62, 1).scale(1, 0.7, 1), m);
    knuckle.position.y = -thick * 0.6;
    this.group.add(knuckle);
    world.scene.add(this.group);
    this.solids = [this.boxFor(this.a0), this.boxFor(this.a1)].map((b) => world.addSolid(b.min, b.max, { kind: 'grass' }));
    world.add(this);
    this.reset();
  }

  // the arm's box when it rests pointing along angle a (always one of the four sides)
  boxFor(a) {
    const cx = Math.round(Math.cos(a)), cz = -Math.round(Math.sin(a));
    const p = this.pivot, y0 = p.y - this.thick, y1 = p.y, hw = this.width / 2;
    const near = -this.back, far = this.length;
    if (cx) {
      const xa = p.x + cx * near, xb = p.x + cx * far;
      return { min: new THREE.Vector3(Math.min(xa, xb), y0, p.z - hw), max: new THREE.Vector3(Math.max(xa, xb), y1, p.z + hw) };
    }
    const za = p.z + cz * near, zb = p.z + cz * far;
    return { min: new THREE.Vector3(p.x - hw, y0, Math.min(za, zb)), max: new THREE.Vector3(p.x + hw, y1, Math.max(za, zb)) };
  }

  get swung() {
    return this.state === 'down' || this.state === 'swing';
  }

  reset() {
    this.state = 'up'; // up (pointing `from`), swing, down (pointing `to`)
    this.u = 0;
    this.pendingDown = false;
    this.spin.rotation.y = this.a0;
    this.solids[0].enabled = true;
    this.solids[1].enabled = false;
  }

  activate() {
    if (this.state !== 'up') return;
    this.state = 'swing';
    this.u = 0;
    this.solids[0].enabled = false;
    const g = nearGain(this.world, this.pivot, 60);
    play('root_rumble', { gain: 0.9 * g, vary: 0.05 }, 'door_open', { gain: 0.6 * g, rate: 0.6 });
    play('vine_whip', { gain: 0.5 * g, rate: 0.7 });
  }

  update(dt, player) {
    if (this.state === 'swing') {
      this.u = Math.min(1, this.u + dt / this.time);
      // swings out slowly, whips round, slams and bounces once
      const t = this.u, e = t < 0.75 ? Math.pow(t / 0.75, 2.2) : 1 + Math.sin((t - 0.75) / 0.25 * Math.PI) * 0.035 * (1 - t) * 4;
      this.spin.rotation.y = this.a0 + (this.a1 - this.a0) * e;
      if (this.u >= 1) {
        this.state = 'down';
        this.spin.rotation.y = this.a1;
        this.pendingDown = true;
        this.slam(player);
      }
    }
    if (this.pendingDown) {
      const s = this.solids[1];
      if (!overlapsPlayer(player, s.min, s.max, 0.02)) {
        s.enabled = true;
        this.pendingDown = false;
      }
    }
  }

  slam(player) {
    const fx = this.world.fx;
    const g = nearGain(this.world, this.pivot, 60);
    play('land_hard', { gain: 0.9 * g, rate: 0.6 }, 'door_slam', { gain: 0.8 * g, rate: 0.6 });
    sfx.rotorLock(g);
    const tip = _a.set(this.pivot.x + Math.cos(this.a1) * this.length, this.pivot.y, this.pivot.z - Math.sin(this.a1) * this.length);
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      _v.lerpVectors(this.pivot, tip, u);
      fx.burst(_v, 0x8a9a6a, { count: 5, speed: 2.5, life: 0.7, size: 0.35, gravity: 4 });
    }
    fx.ring(tip, UP, 0xbfffcf, { size: 0.3, end: 2.4, life: 0.4, thick: 0.15 });
    const d = player.pos.distanceTo(tip);
    player.shake = Math.max(player.shake || 0, 0.35 * clamp(1 - d / 18, 0, 1));
  }
}

// ================================================================ BRINK (bowl enemies off a ledge)
const isGround = (e) => e instanceof Slime || e instanceof SpiderBot || e instanceof Brute;

export class Brink {
  constructor(world, { min, max, dir, killY, land = null }) {
    this.world = world;
    this.min = v3(min);
    this.max = v3(max);
    this.dir = v3(dir).setY(0).normalize();
    this.killY = killY;
    this.land = land;
    this.flying = [];
    this.picked = [];
    world.add(this);
  }

  reset() {}

  inside(p) {
    return p.x >= this.min.x && p.x <= this.max.x && p.z >= this.min.z && p.z <= this.max.z && p.y >= this.min.y - 0.5 && p.y <= this.max.y + 2;
  }

  onSplash(point, radius, color) {
    if (color !== GREEN) return;
    const picked = this.picked;
    picked.length = 0;
    for (const e of this.world.entities) {
      if (!isGround(e) || e.dead || e.flung || !e.pos?.isVector3 || !e.group) continue;
      if (!this.inside(e.pos) || e.pos.distanceTo(point) > radius * 1.25) continue;
      picked.push(e);
    }
    for (const e of picked) this.fling(e, point);
  }

  fling(e, point) {
    e.flung = true;
    this.world.remove(e); // its own update stops: we fly it from here
    _v.subVectors(e.pos, point).setY(0);
    if (_v.lengthSq() < 1e-4) _v.copy(this.dir);
    _v.normalize().multiplyScalar(0.6).add(this.dir).normalize();
    const vel = _v.clone().multiplyScalar(e instanceof Brute ? 6 : 7.5);
    vel.y = e instanceof Brute ? 5 : 6.5;
    if (this.land !== null) {
      // a short hop that comes down over the trough's middle
      const along = Math.abs(this.dir.x) > Math.abs(this.dir.z) ? 'x' : 'z';
      const dist = Math.abs(this.land - e.pos[along]), lift = 3.2, drop = Math.max(0.2, e.pos.y - this.killY);
      const T = (lift + Math.sqrt(lift * lift + 2 * 22 * drop)) / 22;
      vel.set(0, lift, 0);
      vel[along] = Math.sign(this.land - e.pos[along]) * (dist / T);
    }
    this.flying.push({ e, vel, t: 0, spin: rnd(4, 9) * (Math.random() < 0.5 ? -1 : 1) });
    const g = nearGain(this.world, e.pos, 45);
    play('slime_splat', { gain: 0.5 * g, rate: 0.8 });
    if (e instanceof Brute) audio.sample('brute_roar', { gain: 0.6 * g, rate: 1.25 });
  }

  update(dt) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i], e = f.e;
      if (e.dead) {
        this.flying.splice(i, 1);
        continue;
      }
      f.t += dt;
      f.vel.y -= 22 * dt;
      e.pos.addScaledVector(f.vel, dt);
      e.group.position.copy(e.pos);
      e.group.rotation.x += f.spin * dt;
      e.group.rotation.z += f.spin * 0.6 * dt;
      if (e.pos.y > this.killY && f.t < 3) continue;
      this.flying.splice(i, 1);
      this.splashDown(e);
    }
  }

  // into the sludge: a gout of it, and the enemy is done for
  splashDown(e) {
    const fx = this.world.fx, g = nearGain(this.world, e.pos, 60);
    _v.copy(e.pos).setY(Math.max(e.pos.y, this.killY));
    fx.burst(_v, 0x7dff8a, { count: 26, speed: 6, life: 0.8, size: 0.3, gravity: 12, dir: UP });
    fx.ring(_v, UP, 0x9dffb0, { size: 0.3, end: 2.8, life: 0.5, thick: 0.25, k: 0.8 });
    play('toxic_sink', { gain: 0.8 * g }, 'acid', { gain: 0.6 * g });
    this.world.add(e); // (its death cleans itself out of the entity list)
    if (e.die) e.die(null, null);
    else {
      e.dead = true;
      e.dispose?.();
    }
  }
}

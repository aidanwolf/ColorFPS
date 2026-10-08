// THE THORNMAW — Emerald Hollow's mini-boss: a colossal carnivorous plant-hydra rooted in a sludge moat.
// Three flytrap heads, each armored in a blaster color (only that color hurts it; others ricochet), snap
// at you and spit seed pods that burst into toxic pools. A severed head sinks into the sludge and regrows
// (in a new color) unless all three are down at once: then the bud on its crown blooms over its core,
// which only takes its current, shifting color. (It guards the Verdant Heart, the world's power source,
// which hangs above it: see levels/verdantArena.js.) A thorn root sweeps the courtyard floor (jump it, ride
// on top of it, or take a jump pad), spore clouds hide drifting mines (phase 2+) and thorns erupt under
// you (phase 3). Every hit on the player is fatal, so every attack is telegraphed for at least 0.6 s.
// The arena (levels/verdantArena.js) owns the doors, music and checkpoint resets; this file drives the
// fight and the boss HUD (game.hud.bossShow / bossBar / bossHint).
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { audio } from '../audio.js';
import { Orb } from './drone.js';
import { liquidMaterial } from '../liquid.js';

const NAME = 'THE THORNMAW';
const MAX_HP = 1000;
const HEAD_HITS = 20; // correct-color hits to sever a head
const HEAD_DMG = 2; // boss damage per head hit (a full head is 4% of the bar)
const HEART_DMG = 8.5;
const REGROW = [0, 16, 14, 12]; // seconds a severed head stays down (per phase)
const HEART_OPEN = [0, 7.5, 7, 6.5]; // seconds the heart stays exposed
const HEART_SHIFT = [0, 1.9, 1.5, 1.2]; // seconds between heart color shifts
const HEAD_SCALE = 1.15;
const MOUTH = 2.7; // head origin (jaw hinge) to the bite point, m
const BITE_R = 1.9;
const NECK_SEGS = 14;
const ROOT_SEG = 1.2; // length of one root section / riding solid
const ROOT_TOP = 1.1; // the sweeping root's walkable top, above the floor
const ROOT_HALF = 0.62; // half its thickness, thorns included
const ROOT_SECTIONS = 22;
const ROOT_SOLIDS = 18;
const POD_G = 22;
const POOL_LIFE = [0, 6, 6.5, 7.5];
const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _lp = new THREE.Vector3(), _eye = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const BROWN = new THREE.Color(0x3b2f1c);
const DOWN = new THREE.Vector3(0, -1, 0), _ro = new THREE.Vector3(); // groundAt's own temporaries

const rnd = (a, b) => a + (b - a) * Math.random();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => k * k * (3 - 2 * k);
// sounds: a generated sample when it exists, else a stock one (see the report for the new prompts)
const sfx = (name, opts, fallback) => audio.sample(name, opts) || fallback?.();
export const THORNMAW_SOUNDS = ['hydra_roar', 'hydra_hiss', 'hydra_snap', 'hydra_spit', 'pod_burst', 'vine_whip', 'root_rumble', 'thorn_erupt', 'spore_puff', 'hydra_sever', 'hydra_bloom', 'hydra_death'];

// Organic lumps: push vertices in and out by a smooth function of their position (seams stay closed).
function gnarl(geo, amt, seed = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 2.1 + y * 1.3 + seed) * Math.cos(z * 1.9 - y * 2.3 + seed * 2.1) + 0.5 * Math.sin(x * 4.7 - z * 3.9 + seed * 0.7);
    const l = Math.hypot(x, y, z) || 1;
    p.setXYZ(i, x + (x / l) * n * amt, y + (y / l) * n * amt, z + (z / l) * n * amt);
  }
  geo.computeVertexNormals();
  return geo;
}

function softTex(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d'), 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const podMats = new Map();
function podMat(color) {
  if (!podMats.has(color)) podMats.set(color, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[color].hex).multiplyScalar(1.8) }));
  return podMats.get(color);
}
let podGeo = null;

// A seed pod lobbed by a head: a ballistic, shootable projectile (pop it with its color) that bursts into a
// toxic pool where it lands. Its landing ring is drawn on the ground for the whole flight.
class SeedPod {
  constructor(boss, from, target, color, flight) {
    this.boss = boss;
    this.world = boss.world;
    this.pos = from.clone();
    this.target = target.clone();
    this.color = color;
    this.flight = flight;
    this.t = 0;
    this.vel = new THREE.Vector3().subVectors(target, from).divideScalar(flight);
    this.vel.y += 0.5 * POD_G * flight;
    this.alive = true;
    this.shootable = true;
    this.radius = 0.5;
    this.hitRadius = 1.0;
    podGeo ??= gnarl(new THREE.IcosahedronGeometry(0.55, 1).scale(0.85, 1.25, 0.85), 0.08, 3);
    this.mesh = new THREE.Mesh(podGeo, podMat(color));
    this.mesh.position.copy(this.pos);
    this.mesh.userData.noCull = true;
    this.world.scene.add(this.mesh);
    this.marker = boss.showMarker(target, color, flight + 0.05, 1.9);
    this.world.projectiles.push(this);
    boss.pods.push(this);
  }

  update(dt, player) {
    if (!this.alive) return;
    this.t += dt;
    this.vel.y -= POD_G * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 5;
    this.mesh.rotation.z += dt * 3;
    if (Math.random() < dt * 30) this.world.fx.ember(this.pos, rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.5, 0.5), COLORS[this.color].hex, 0.4, 0.1);
    const b = player.bounds(), r = this.radius;
    if (this.pos.x > b.min.x - r && this.pos.x < b.max.x + r && this.pos.y > b.min.y - r && this.pos.y < b.max.y + r && this.pos.z > b.min.z - r && this.pos.z < b.max.z + r) {
      this.boss.kill(player, 'orb');
      this.alive = false;
      this.boss.podBurst(this.pos.clone(), this.color, false);
      this.boss.hideMarker(this.marker);
      return;
    }
    if (this.t >= this.flight) {
      this.alive = false;
      this.boss.podBurst(this.target, this.color, true);
      this.boss.hideMarker(this.marker);
    }
  }

  onHit(color) {
    if (!this.alive) return undefined;
    if (color !== this.color) return 'immune';
    this.pop();
    return 'kill';
  }

  // shot down (or cleared): a harmless puff of spores, no pool
  pop() {
    if (!this.alive) return;
    this.alive = false;
    this.boss.hideMarker(this.marker);
    this.world.fx.orbPop(this.pos, COLORS[this.color].hex, 0.6);
    this.world.fx.burst(this.pos, 0x9fd860, { count: 18, speed: 3, life: 0.9, size: 0.5, gravity: 1, mode: 'puff' });
    audio.orbPop();
  }

  dispose() {
    this.world.scene.remove(this.mesh);
  }
}

export class Thornmaw {
  // center: floor center of the courtyard (the moat island is around it); half: half the courtyard's inner
  // size; moatOut: half-size of the sludge moat's outer edge (the floor ring starts there); towerIn: the
  // corner towers occupy |x| and |z| > towerIn (the sweeping root stops short of them and of the walls).
  constructor(world, game, { center, colors = [0, 1, 2], half = 22, moatOut = 9.5, towerIn = 16, onDying = null, onDefeated = null } = {}) {
    this.world = world;
    this.game = game;
    this.c = new THREE.Vector3().copy(Array.isArray(center) ? new THREE.Vector3(...center) : center);
    this.floorY = this.c.y;
    this.colors = colors.length ? [...colors] : [0];
    this.half = half;
    this.moatOut = moatOut;
    this.towerIn = towerIn;
    this.onDying = onDying;
    this.onDefeated = onDefeated;
    this.pods = [];
    this.mines = [];
    this.root = new THREE.Group();
    this.root.position.copy(this.c);
    this.root.userData.noCull = true; // big and always moving: shown by distance instead (see update)
    world.scene.add(this.root);
    this.fxRoot = new THREE.Group(); // world-space telegraphs, pools and clouds
    this.fxRoot.userData.noCull = true;
    world.scene.add(this.fxRoot);
    this.build();
    this.buildSweeper();
    this.buildFx();
    world.addHittable(this.root);
    this.reset();
    world.add(this);
  }

  // ------------------------------------------------------------------ construction
  build() {
    const tag = (o, part) => {
      o.userData.hit = this;
      o.userData.part = part;
      return o;
    };
    this.barkMat = new THREE.MeshStandardMaterial({ color: 0x55602f, roughness: 0.95, flatShading: true });
    this.toothMat = new THREE.MeshStandardMaterial({ color: 0xe8e0c0, roughness: 0.5, emissive: 0x3a3420, flatShading: true });
    this.petalMat = new THREE.MeshStandardMaterial({ color: 0x7a2a66, emissive: 0x2a0a22, roughness: 0.6, flatShading: true, side: THREE.DoubleSide });
    this.mossMat = new THREE.MeshStandardMaterial({ color: 0x3f7a2c, roughness: 1, flatShading: true });

    // the bulb: a gnarled root mass on the island, with buttress roots plunging into the moat
    this.body = new THREE.Group();
    this.root.add(this.body);
    const bulb = new THREE.Mesh(gnarl(new THREE.SphereGeometry(3.7, 20, 14), 0.3, 1.7).scale(1, 0.7, 1), this.barkMat);
    bulb.position.y = 2.0;
    tag(bulb, 'bulb');
    this.body.add(bulb);
    this.bulb = bulb;
    const rootGeo = gnarl(new THREE.CylinderGeometry(0.4, 0.85, 5, 8, 4), 0.12, 2.3);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const from = new THREE.Vector3(Math.cos(a) * 2.8, 1.5, Math.sin(a) * 2.8);
      const to = new THREE.Vector3(Math.cos(a) * 6.8, -1.6, Math.sin(a) * 6.8);
      const m = new THREE.Mesh(rootGeo, this.barkMat);
      m.position.copy(from).add(to).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(UP, _v.subVectors(from, to).normalize());
      m.scale.set(1, from.distanceTo(to) / 5, 1);
      tag(m, 'bulb');
      this.body.add(m);
    }
    // moss collar and a ring of thorns around the crown
    const collar = new THREE.Mesh(gnarl(new THREE.TorusGeometry(2.1, 0.55, 6, 18), 0.15, 4).rotateX(Math.PI / 2), this.mossMat);
    collar.position.y = 4.3;
    this.body.add(collar);
    const thornGeo = new THREE.ConeGeometry(0.18, 1.1, 5);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const t = new THREE.Mesh(thornGeo, this.toothMat);
      t.position.set(Math.cos(a) * 3.2, 3.2 + (i % 2) * 0.5, Math.sin(a) * 3.2);
      t.quaternion.setFromUnitVectors(UP, _v.set(Math.cos(a), 0.6, Math.sin(a)).normalize());
      this.body.add(t);
    }

    // the bud: six petals hinged on a ring at the crown, closed into a dome over the heart; they bloom outward
    this.petals = [];
    const PR = 1.7, n = 6, w = (Math.PI * 2) / n;
    const petalGeo = new THREE.SphereGeometry(PR, 8, 10, Math.PI - w * 0.53, w * 1.06, 0, Math.PI / 2);
    petalGeo.translate(-PR, 0, 0);
    petalGeo.scale(1, 2.2, 1);
    gnarl(petalGeo, 0.05, 5);
    for (let i = 0; i < n; i++) {
      const a = i * w;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * PR, 4.35, Math.sin(a) * PR);
      pivot.rotation.y = -a;
      const p = new THREE.Mesh(petalGeo, this.petalMat);
      tag(p, 'bud');
      pivot.add(p);
      this.body.add(pivot);
      this.petals.push(pivot);
    }
    // the heart
    this.heartMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.heart = new THREE.Mesh(gnarl(new THREE.IcosahedronGeometry(1.3, 2), 0.1, 6), this.heartMat);
    this.heart.position.y = 5.5;
    tag(this.heart, 'heart');
    this.body.add(this.heart);
    this.heartShellMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    this.heartShell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), this.heartShellMat);
    this.heartShell.raycast = () => {};
    this.heart.add(this.heartShell);
    this.heartLight = this.world.addLight(0xffffff, 0, 20, 1.5);

    // the necks: one instanced mesh of bark segments (plus thorns) for all three, laid along curves each frame
    const neckGeo = new THREE.CylinderGeometry(1, 1, 1, 9, 1).rotateX(Math.PI / 2);
    this.necks = new THREE.InstancedMesh(neckGeo, this.barkMat, 3 * NECK_SEGS);
    this.necks.frustumCulled = false;
    this.necks.raycast = () => {}; // shots pass between the coils
    this.root.add(this.necks);
    this.neckThorns = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.8, 5), this.toothMat, 3 * NECK_SEGS);
    this.neckThorns.frustumCulled = false;
    this.neckThorns.raycast = () => {};
    this.root.add(this.neckThorns);

    // the heads
    const shell = new THREE.SphereGeometry(1.5, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    shell.scale(1.05, 0.62, 1.5).translate(0, 0, 1.75);
    gnarl(shell, 0.05, 7);
    const teeth = [];
    for (let k = 0; k <= 10; k++) {
      const phi = Math.PI * (0.08 + (0.84 * k) / 10);
      const g = new THREE.ConeGeometry(0.15, k % 2 ? 0.55 : 0.8, 5).rotateX(Math.PI);
      g.translate(-1.5 * 1.05 * Math.cos(phi) * 0.93, -0.3, 1.75 + 1.5 * 1.5 * Math.sin(phi) * 0.93);
      teeth.push(g.toNonIndexed());
    }
    const teethGeo = mergeSimple(teeth);
    const mawGeo = new THREE.SphereGeometry(1.25, 12, 8).scale(1, 0.32, 1.35).translate(0, 0, 1.85);
    const leafGeo = new THREE.ConeGeometry(0.5, 2.3, 4).scale(1, 1, 0.25).translate(0, 1.15, 0);
    this.heads = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.45, metalness: 0.1, flatShading: true });
      const mawMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const g = new THREE.Group();
      g.scale.setScalar(HEAD_SCALE);
      tag(g, 'head' + i);
      const upper = new THREE.Group(), lower = new THREE.Group();
      upper.add(new THREE.Mesh(shell, mat), new THREE.Mesh(teethGeo, this.toothMat));
      const lo = new THREE.Group();
      lo.rotation.z = Math.PI;
      lo.add(new THREE.Mesh(shell, mat), new THREE.Mesh(teethGeo, this.toothMat));
      lower.add(lo);
      const maw = new THREE.Mesh(mawGeo, mawMat);
      g.add(upper, lower, maw);
      // a collar of leaves in the head's color: they fall away as it takes damage (its health, at a glance)
      const leaves = [];
      for (let k = 0; k < 6; k++) {
        const b = (k / 6) * Math.PI * 2 + 0.26;
        const leaf = new THREE.Mesh(leafGeo, mat);
        const dir = _v.set(Math.cos(b) * 0.85, Math.sin(b) * 0.85, -0.55).normalize();
        leaf.position.copy(dir).multiplyScalar(0.6).add(_w.set(0, 0, 0.3));
        leaf.quaternion.setFromUnitVectors(UP, dir);
        g.add(leaf);
        leaves.push(leaf);
      }
      this.root.add(g);
      this.heads.push({
        i, g, upper, lower, mat, mawMat, leaves,
        pos: new THREE.Vector3(), look: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), target: new THREE.Vector3(),
        from: new THREE.Vector3(), strike: new THREE.Vector3(), q: new THREE.Quaternion(),
        ang: 0, open: 0, openCur: 0, flash: 0, wilt: 0, glow: 0, hp: HEAD_HITS, color: 0, state: 'sunk', step: 0, t: 0, regrowT: 0,
      });
    }
  }

  // The thorn root: bark sections with ivory thorns down both sides and a mossy top you can ride on.
  buildSweeper() {
    const g = (this.sweeper = new THREE.Group());
    this.root.add(g);
    const sec = gnarl(new THREE.CylinderGeometry(0.62, 0.66, ROOT_SEG * 1.12, 9, 2).rotateZ(Math.PI / 2), 0.07, 8).scale(1, 0.85, 1).translate(0, 0.56, 0);
    const thorns = [];
    for (const s of [-1, 1])
      for (const [x, y, len] of [[-0.3, 0.75, 1.3], [0.32, 0.4, 1.0]]) {
        const c = new THREE.ConeGeometry(0.2, len, 5).translate(0, len / 2, 0);
        c.applyQuaternion(_q.setFromUnitVectors(UP, _v.set(0.15, 0.25, s).normalize())).translate(x, y, s * 0.5);
        thorns.push(c.toNonIndexed());
      }
    this.rootMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.9, flatShading: true });
    this.rootBark = new THREE.InstancedMesh(sec, this.rootMat, ROOT_SECTIONS);
    this.rootThorns = new THREE.InstancedMesh(mergeSimple(thorns), this.toothMat, ROOT_SECTIONS);
    this.rootMoss = new THREE.InstancedMesh(new THREE.BoxGeometry(ROOT_SEG * 1.1, 0.12, 0.78).translate(0, ROOT_TOP - 0.03, 0), this.mossMat, ROOT_SECTIONS);
    for (const m of [this.rootBark, this.rootThorns, this.rootMoss]) {
      m.frustumCulled = false;
      m.raycast = () => {};
      g.add(m);
    }
    // glowing sap veins down both flanks: the part that kills (pulses during the telegraph)
    this.veinMat = new THREE.MeshBasicMaterial({ color: 0xc8ff4a });
    const vein = mergeSimple([-1, 1].map((s) => new THREE.BoxGeometry(1, 0.16, 0.06).translate(0.5, 0.55, s * 0.64).toNonIndexed()));
    this.vein = new THREE.Mesh(vein, this.veinMat);
    this.vein.raycast = () => {};
    g.add(this.vein);
    this.rootTip = new THREE.Mesh(gnarl(new THREE.ConeGeometry(0.6, 2.2, 8, 2).rotateZ(-Math.PI / 2).scale(1, 0.85, 1).translate(1.0, 0.5, 0), 0.06, 9), this.rootMat);
    this.rootTip.raycast = () => {};
    g.add(this.rootTip);
    // riding solids: one moving box per section over the floor ring (static grid ignores them)
    this.rootSolids = [];
    for (let k = 0; k < ROOT_SOLIDS; k++) {
      const s = this.world.addSolid(new THREE.Vector3(), new THREE.Vector3(), { delta: new THREE.Vector3(), moving: true, noShot: true, kind: 'rock' });
      s.enabled = false;
      s.r = this.moatOut + (k + 0.5) * ROOT_SEG;
      s.center = new THREE.Vector3();
      this.rootSolids.push(s);
    }
  }

  buildFx() {
    // ground telegraph rings (pods, bites, eruptions)
    const ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
    const discGeo = new THREE.CircleGeometry(0.86, 40).rotateX(-Math.PI / 2);
    this.markers = [];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const rm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const dm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.15, fog: false });
      g.add(new THREE.Mesh(ringGeo, rm), new THREE.Mesh(discGeo, dm));
      g.visible = false;
      this.fxRoot.add(g);
      this.markers.push({ g, rm, dm, t: 0, life: 0, r: 1, hex: 0xffffff, on: false });
    }
    // toxic pools (the Verdant sludge shader) with a dark rim; each owns a hazard box
    const poolGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    const rimGeo = new THREE.RingGeometry(0.92, 1.14, 24).rotateX(-Math.PI / 2);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0x14380e });
    const sludge = liquidMaterial('green', false);
    this.pools = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(poolGeo, sludge), new THREE.Mesh(rimGeo, rimMat));
      g.children[1].position.y = -0.01;
      g.visible = false;
      this.fxRoot.add(g);
      const solid = this.world.addSolid(new THREE.Vector3(), new THREE.Vector3(), { hazard: 'acid', noShot: true });
      solid.enabled = false;
      this.pools.push({ g, solid, t: 0, life: 0, r: 1, on: false, p: new THREE.Vector3() });
    }
    // spore clouds: soft, opaque-ish billboards that hide what's behind them
    const blob = softTex((c, s) => {
      const r = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.55, 'rgba(255,255,255,0.65)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = r;
      c.fillRect(0, 0, s, s);
    });
    this.clouds = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.SpriteMaterial({ map: blob, color: 0x9cb85a, transparent: true, opacity: 0, depthWrite: false });
      const sp = new THREE.Sprite(m);
      sp.visible = false;
      this.fxRoot.add(sp);
      this.clouds.push({ sp, m, t: 0, life: 0, on: false, vel: new THREE.Vector3(), size: 1 });
    }
    // eruption thorn clusters
    const spike = new THREE.ConeGeometry(0.32, 2.8, 6).translate(0, 1.4, 0);
    this.erupts = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2, r = k === 0 ? 0 : 0.7 + (k % 2) * 0.55;
        const m = new THREE.Mesh(spike, this.toothMat);
        m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        m.rotation.set(Math.sin(a) * r * 0.25, 0, -Math.cos(a) * r * 0.25);
        m.scale.setScalar(k === 0 ? 1.3 : 0.8 + (k % 3) * 0.15);
        g.add(m);
      }
      g.visible = false;
      this.fxRoot.add(g);
      this.erupts.push({ g, t: 0, on: false, p: new THREE.Vector3(), marker: null });
    }
  }

  // ------------------------------------------------------------------ state
  reset() {
    this.state = 'dormant';
    this.stateT = 0;
    this.t = 0;
    this.hp = MAX_HP;
    this.phase = 1;
    this.heartOpen = false;
    this.heartT = 0;
    this.heartColor = this.colors[0];
    this.heartShiftT = 0;
    this.bloom = 0;
    this.stagger = 0;
    this.attackTimer = 1.5;
    this.sweepT = 8;
    this.sporeT = 6;
    this.eruptT = 4;
    this.spore = null;
    this.sweep = null;
    this.firstSweep = this.firstSpit = this.firstSpore = true;
    this.deathT = 0;
    this.wither = 0;
    for (const p of this.pods) p.alive = false;
    for (const m of this.mines) m.alive = false;
    this.pods = [];
    this.mines = [];
    this.sweeper.visible = false;
    this.sweeper.position.y = -2;
    for (const s of this.rootSolids) s.enabled = false;
    for (const m of this.markers) this.hideMarker(m);
    for (const p of this.pools) this.clearPool(p);
    for (const c of this.clouds) {
      c.on = false;
      c.sp.visible = false;
    }
    for (const e of this.erupts) {
      e.on = false;
      e.g.visible = false;
    }
    this.body.visible = true;
    this.body.scale.set(1, 1, 1);
    this.body.position.y = 0;
    this.body.rotation.set(0, 0, 0);
    this.barkMat.color.set(0x55602f);
    this.petalMat.color.set(0x7a2a66);
    this.mossMat.color.set(0x3f7a2c);
    this.heart.visible = true;
    this.heart.scale.setScalar(1);
    this.heartLight.intensity = 0;
    this.necks.visible = this.neckThorns.visible = true;
    this.assignColors(this.heads);
    for (const h of this.heads) {
      h.state = 'sunk';
      h.ang = (h.i / 3) * Math.PI * 2 + Math.PI / 2;
      h.hp = HEAD_HITS;
      h.wilt = 0;
      h.flash = 0;
      h.openCur = h.open = 0;
      this.sunkPos(h, h.pos);
      h.look.copy(h.pos).add(_v.set(Math.cos(h.ang), 0, Math.sin(h.ang)));
      h.g.visible = false;
      h.g.rotation.set(0, 0, 0);
      h.leaves.forEach((l) => (l.visible = true));
      this.paintHead(h);
    }
    this.setBloom(0);
    this.updateNecks();
    this.paintHeart(0);
  }

  get active() {
    return this.state === 'intro' || this.state === 'fight' || this.state === 'dying';
  }

  get defeated() {
    return this.state === 'dead';
  }

  start() {
    if (this.state !== 'dormant') return;
    this.state = 'intro';
    this.stateT = 0;
    this.introStep = 0;
    audio.prefetch(THORNMAW_SOUNDS);
    const hud = this.game.hud;
    this.nameEl ??= document.querySelector('#boss-bar .boss-name');
    if (this.nameEl) {
      this.oldName ??= this.nameEl.textContent;
      this.nameEl.textContent = NAME;
      this.nameEl.style.textShadow = '0 0 12px #3dff7a';
    }
    hud.bossShow(true);
    hud.bossBar(1);
    audio.setIntensity(2);
  }

  // Back to sleep (the player respawned at the checkpoint mid-fight).
  stop() {
    const was = this.active;
    this.reset();
    if (was) this.hideHud();
  }

  hideHud() {
    this.game.hud.bossShow(false);
    if (this.nameEl && this.oldName) {
      this.nameEl.textContent = this.oldName;
      this.nameEl.style.textShadow = '';
    }
    audio.setIntensity(1);
  }

  // Already beaten (e.g. restoring progress): leave the withered husk.
  setDefeated() {
    this.reset();
    this.state = 'dead';
    this.applyHusk();
  }

  applyHusk() {
    for (const h of this.heads) {
      h.state = 'sunk';
      h.g.visible = false;
      this.sunkPos(h, h.pos);
    }
    this.updateNecks();
    this.necks.visible = this.neckThorns.visible = false;
    this.barkMat.color.copy(BROWN);
    this.petalMat.color.set(0x3a2430);
    this.mossMat.color.set(0x4a4a2a);
    this.body.scale.set(0.92, 0.55, 0.92);
    this.heart.visible = false;
    this.heartLight.intensity = 0;
    this.setBloom(1.25);
  }

  // Shuffle the palette over the given heads so they differ whenever there are enough colors.
  assignColors(heads) {
    const used = this.heads.filter((h) => !heads.includes(h) && h.state !== 'sunk' && h.state !== 'down').map((h) => h.color);
    let pool = this.colors.filter((c) => !used.includes(c));
    for (const h of heads) {
      if (!pool.length) pool = [...this.colors];
      const c = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      h.color = c;
    }
  }

  paintHead(h) {
    const col = _c.set(COLORS[h.color].hex);
    h.mat.color.copy(col).multiplyScalar(0.22).lerp(BROWN, h.wilt);
    h.mat.emissive.copy(col).multiplyScalar(1 - h.wilt);
    h.mawMat.color.copy(col).multiplyScalar(1.5 * (1 - h.wilt * 0.8));
  }

  paintHeart(pulse) {
    const col = _c.set(COLORS[this.heartColor].hex);
    const k = this.heartOpen ? 2.2 + pulse * 0.8 + this.heartFlash * 2 : 0.6;
    this.heartMat.color.copy(col).multiplyScalar(k);
    this.heartShellMat.color.copy(col).multiplyScalar(this.heartOpen ? 1.6 : 0.3);
    this.heartLight.color.copy(col);
  }

  setBloom(k) {
    this.bloom = k;
    for (const p of this.petals) p.rotation.z = -k * 2.0;
  }

  // ------------------------------------------------------------------ damage
  onHit(color, hit) {
    if (this.state !== 'fight') return 'world';
    const part = hit.part || '';
    if (part.startsWith('head')) {
      const h = this.heads[+part[4]];
      if (!h || !['idle', 'snap', 'spit'].includes(h.state)) return 'world';
      if (color !== h.color) {
        h.flash = Math.max(h.flash, 0.35);
        return 'immune';
      }
      h.hp--;
      h.flash = 1;
      this.damage(HEAD_DMG);
      const left = Math.ceil((h.hp / HEAD_HITS) * 6);
      h.leaves.forEach((l, k) => {
        if (l.visible && k >= left) {
          l.visible = false;
          this.world.fx.burst(l.getWorldPosition(_v), COLORS[h.color].hex, { count: 14, speed: 4, life: 0.9, size: 0.45, gravity: 6, mode: 'shard' });
        }
      });
      if (h.hp <= 0 && this.state === 'fight') this.sever(h);
      return 'hit';
    }
    if (part === 'heart' && this.heartOpen) {
      if (color !== this.heartColor) return 'immune';
      this.heartFlash = 1;
      audio.bossCoreHit();
      this.damage(HEART_DMG);
      return 'hit';
    }
    return 'world';
  }

  damage(n) {
    if (this.state !== 'fight') return;
    this.hp = Math.max(0, this.hp - n);
    this.game.hud.bossBar(this.hp / MAX_HP);
    if (this.hp <= 0) return this.die();
    const frac = this.hp / MAX_HP;
    const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (phase > this.phase) this.phaseShift(phase);
  }

  sever(h) {
    h.state = 'down';
    h.t = 0;
    h.regrowT = REGROW[this.phase];
    const p = h.g.getWorldPosition(_v).addScaledVector(h.fwd, 1.5);
    this.world.fx.burst(p, COLORS[h.color].hex, { count: 70, speed: 9, life: 1.1, size: 0.6, gravity: 9, mode: 'shard' });
    this.world.fx.burst(p, 0x7a2a66, { count: 30, speed: 6, life: 1.4, size: 0.7, gravity: 4, mode: 'shard' });
    this.world.fx.burst(p, 0xa8d070, { count: 16, speed: 3, life: 1.2, size: 1.4, gravity: 0, mode: 'puff' });
    sfx('hydra_sever', { gain: 1 }, () => audio.bossLimbBreak());
    this.game.player.shake = Math.max(this.game.player.shake, 0.35);
    const left = this.heads.filter((o) => ['idle', 'snap', 'spit', 'rise'].includes(o.state)).length;
    if (left === 0 && this.heads.every((o) => o.state === 'down' || o.state === 'sunk')) this.openHeart();
    else this.game.hud.bossHint(`Head severed — ${left} to go before it regrows!`, false);
  }

  openHeart() {
    this.heartOpen = true;
    this.heartT = HEART_OPEN[this.phase];
    this.heartShiftT = HEART_SHIFT[this.phase];
    this.heartFlash = 0;
    this.heartColor = pick(this.colors);
    this.bloomTarget = 1;
    for (const h of this.heads) h.regrowT = Infinity;
    this.heartLight.intensity = 16;
    sfx('hydra_bloom', { gain: 1 }, () => audio.shieldBreak());
    this.game.hud.bossHint('IT BLOOMS — shoot the core in its shifting color!', true);
    const p = this.heart.getWorldPosition(_v);
    this.world.fx.burst(p, 0xff9ad8, { count: 60, speed: 8, life: 1.2, size: 0.5, gravity: 3, mode: 'shard' });
    this.world.fx.ring(p, UP, 0xffffff, { size: 1, end: 9, life: 0.6, k: 1.5 });
  }

  closeHeart() {
    if (!this.heartOpen) return;
    this.heartOpen = false;
    this.bloomTarget = 0;
    this.heartLight.intensity = 0;
    // the heads come back together, in fresh colors
    const down = this.heads.filter((h) => h.state === 'down' || h.state === 'sunk');
    down.forEach((h, k) => (h.regrowT = 0.3 + k * 0.4));
    this.game.hud.bossHint('The bud closes — the heads regrow!', false);
  }

  phaseShift(p) {
    this.phase = p;
    this.stagger = 2.4;
    this.closeHeart();
    for (const h of this.heads) {
      if (h.state === 'snap' || h.state === 'spit') this.endAttack(h);
      if (h.state === 'down' || h.state === 'sunk') h.regrowT = Math.min(h.regrowT, 0.4 + h.i * 0.3);
    }
    if (this.sweep && this.sweep.state !== 'sink') this.sinkSweep();
    sfx('hydra_roar', { gain: 1, rate: 1.08 }, () => audio.bossPhase());
    this.game.player.shake = Math.max(this.game.player.shake, 0.8);
    this.thrash = 1.6;
    this.game.hud.bossHint(p === 2 ? 'THE THORNMAW ENRAGES — its spores hide drifting mines!' : 'FINAL PHASE — thorns erupt from the ground beneath you!', true);
  }

  die() {
    this.state = 'dying';
    this.stateT = 0;
    this.heartOpen = true;
    this.bloomTarget = 1;
    for (const h of this.heads) if (h.state === 'snap' || h.state === 'spit') this.endAttack(h);
    if (this.sweep) this.sinkSweep();
    this.spore = null;
    for (const p of this.pods) p.pop();
    for (const m of this.mines) m.pop();
    for (const p of this.pools) p.life = Math.min(p.life, p.t + 0.8);
    for (const e of this.erupts) if (e.on && e.t < 0.85) this.endErupt(e);
    for (const m of this.markers) this.hideMarker(m);
    sfx('hydra_death', { gain: 1 }, () => audio.sample('boss_death', { gain: 1 }) || audio.bossRoar());
    this.game.player.shake = 1;
    this.game.hud.bossHint('The Thornmaw is withering!', true);
    this.onDying?.();
  }

  kill(player, cause) {
    if (this.game.state !== 'playing' || player.dead) return;
    player.damage(1, cause);
  }

  // ------------------------------------------------------------------ helpers
  local(p, out = _lp) {
    return out.copy(p).sub(this.c);
  }

  sunkPos(h, out) {
    return out.set(Math.cos(h.ang) * 7.6, -3.8, Math.sin(h.ang) * 7.6);
  }

  restPos(h, out) {
    const t = this.t;
    const y = 7.4 + [0.7, 2.0, 0][h.i] + Math.sin(t * 1.3 + h.i * 2.1) * 0.45;
    const r = 6.6 + Math.sin(t * 0.9 + h.i) * 0.3;
    const a = h.ang + Math.sin(t * 0.7 + h.i * 1.7) * 0.05;
    return out.set(Math.cos(a) * r, y, Math.sin(a) * r);
  }

  // How far the root can reach at angle th before the walls or the corner towers.
  reach(th) {
    const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
    const wall = (this.half - 0.6) / Math.max(c, s);
    const tower = this.towerIn / Math.max(1e-3, Math.min(c, s)) - 0.4;
    return Math.min(wall, tower);
  }

  // The top of whatever is under (x, z) (world coordinates), or null over the void.
  groundAt(x, z, fromY) {
    const hit = this.world.raycast(_ro.set(x, fromY, z), DOWN, 40, { meshes: false });
    return hit ? { y: hit.point.y, acid: hit.solid?.hazard === 'acid' } : null;
  }

  // Keep a world-space point inside the courtyard floor area.
  clampToArena(p) {
    const lim = this.half - 1.2;
    p.x = this.c.x + clamp(p.x - this.c.x, -lim, lim);
    p.z = this.c.z + clamp(p.z - this.c.z, -lim, lim);
    return p;
  }

  showMarker(p, color, life, r) {
    const m = this.markers.find((k) => !k.on) || this.markers[0];
    m.on = true;
    m.t = 0;
    m.life = life;
    m.r = r;
    m.hex = typeof color === 'number' && color < 4 ? COLORS[color].hex : color;
    m.g.position.set(p.x, p.y + 0.06, p.z);
    m.g.visible = true;
    m.rm.color.set(m.hex).multiplyScalar(2);
    m.dm.color.set(m.hex);
    return m;
  }

  hideMarker(m) {
    if (!m) return;
    m.on = false;
    m.g.visible = false;
  }

  // ------------------------------------------------------------------ update
  update(dt, player) {
    const cam = this.game.camera.position;
    this.root.visible = this.fxRoot.visible = cam.distanceToSquared(this.c) < 175 * 175;
    if (this.state === 'dead') return;
    this.t += dt;
    this.stateT += dt;
    if (this.state === 'dormant') {
      // asleep: the bud breathes, the necks lie coiled under the sludge
      this.body.scale.set(1, 1 + Math.sin(this.t * 1.1) * 0.015, 1);
      return;
    }
    if (this.active && this.game.hud.bossEl.classList.contains('hidden') && this.state !== 'dying') this.game.hud.bossShow(true);
    if (this.state === 'intro') this.updateIntro(dt, player);
    else if (this.state === 'fight') this.updateFight(dt, player);
    else if (this.state === 'dying') this.updateDeath(dt, player);
    if (this.state === 'dead') return;
    this.updateHeads(dt, player);
    this.updateNecks();
    this.updateBud(dt);
    this.updateSweep(dt, player);
    this.updateSpores(dt, player);
    this.updateErupts(dt, player);
    this.updatePools(dt);
    this.updateMarkers(dt);
    this.updateClouds(dt);
    this.pods = this.pods.filter((p) => p.alive);
    this.mines = this.mines.filter((m) => m.alive);
  }

  updateIntro(dt, player) {
    const T = this.stateT;
    if (Math.random() < dt * 8) this.world.fx.burst(this.c.clone().setY(this.floorY - 0.4).add(_v.set(rnd(-8, 8), 0, rnd(-8, 8))), 0x7dff8a, { count: 6, speed: 4, life: 0.6, size: 0.3, gravity: 9 });
    this.body.rotation.z = Math.sin(T * 30) * 0.012 * (1 - T / 3.4);
    player.shake = Math.max(player.shake, 0.15);
    if (this.introStep === 0) {
      this.introStep = 1;
      sfx('root_rumble', { gain: 1 }, () => audio.sample('boss_land', { gain: 0.8, rate: 0.7 }));
      const pa = Math.atan2(player.pos.z - this.c.z, player.pos.x - this.c.x);
      this.heads.forEach((h) => (h.ang = pa + (h.i - 1) * 0.95));
    }
    for (const h of this.heads) if (h.state === 'sunk' && T > 0.5 + h.i * 0.45) this.raiseHead(h, true);
    if (this.introStep === 1 && T > 2.0) {
      this.introStep = 2;
      sfx('hydra_roar', { gain: 1 }, () => audio.bossRoar());
      player.shake = Math.max(player.shake, 0.7);
      this.thrash = 1.2;
    }
    if (T > 3.4) {
      this.state = 'fight';
      this.stateT = 0;
      this.attackTimer = 0.8;
      this.sweepT = 7;
      this.game.hud.bossHint('Shoot each head in its own color — sever all three to make it bloom!', false);
    }
  }

  updateFight(dt, player) {
    const P = this.phase;
    if (this.heartOpen) {
      this.heartT -= dt;
      this.heartShiftT -= dt;
      if (this.heartShiftT <= 0 && this.colors.length > 1) {
        this.heartShiftT = HEART_SHIFT[P];
        let c;
        do c = pick(this.colors);
        while (c === this.heartColor);
        this.heartColor = c;
        this.heartFlash = 0.6;
        audio.comboTick(c);
      }
      if (this.heartT <= 0) this.closeHeart();
    }
    for (const h of this.heads) {
      if (h.state !== 'sunk' || this.heartOpen) continue;
      h.regrowT -= dt;
      if (h.regrowT <= 0) this.raiseHead(h);
    }
    this.thrash = Math.max(0, (this.thrash || 0) - dt);
    if (this.stagger > 0) {
      this.stagger -= dt;
      return;
    }
    // ---- attack scheduler ----
    const busy = this.heads.filter((h) => h.state === 'snap' || h.state === 'spit').length;
    const idle = this.heads.filter((h) => h.state === 'idle');
    const maxBusy = this.heartOpen ? 0 : this.sweep ? [0, 1, 1, 2][P] : [0, 1, 2, 2][P];
    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && busy < maxBusy && idle.length) {
      // prefer the head nearest the player's bearing: it's the one in view
      const pa = Math.atan2(player.pos.z - this.c.z, player.pos.x - this.c.x);
      idle.sort((a, b) => Math.abs(wrap(a.ang - pa)) - Math.abs(wrap(b.ang - pa)));
      const h = Math.random() < 0.6 ? idle[0] : pick(idle);
      if (Math.random() < (P === 1 ? 0.6 : 0.5)) this.startSnap(h, player);
      else this.startSpit(h, player);
      this.attackTimer = [0, 2.0, 1.5, 1.15][P] * (this.sweep ? 1.35 : 1) + Math.random() * 0.6;
    }
    if (!this.sweep && (!this.heartOpen || P === 3)) {
      this.sweepT -= dt;
      if (this.sweepT <= 0) this.startSweep(player);
    }
    if (P >= 2 && !this.spore) {
      this.sporeT -= dt;
      if (this.sporeT <= 0) this.startSpores();
    }
    if (P >= 3) {
      this.eruptT -= dt;
      if (this.eruptT <= 0) {
        this.startErupt(player);
        this.eruptT = this.heartOpen ? 2.6 : 4.8 + Math.random() * 1.5;
      }
    }
  }

  // ------------------------------------------------------------------ heads
  raiseHead(h, intro = false) {
    if (!intro) this.assignColors([h]);
    h.state = 'rise';
    h.t = 0;
    h.hp = HEAD_HITS;
    h.wilt = 0;
    h.g.visible = true;
    h.leaves.forEach((l) => (l.visible = true));
    h.from.copy(h.pos);
    this.paintHead(h);
    const p = _v.set(Math.cos(h.ang) * 7.6, -0.5, Math.sin(h.ang) * 7.6).add(this.c);
    this.world.fx.burst(p, 0x5dff6a, { count: 50, speed: 9, life: 0.9, size: 0.5, gravity: 14 });
    this.world.fx.ring(p, UP, 0x7dff8a, { size: 0.6, end: 4, life: 0.6 });
    sfx('hydra_hiss', { gain: 0.7, rate: 0.8 }, () => audio.sample('acid', { gain: 0.6, rate: 0.7 }));
  }

  startSnap(h, player) {
    h.state = 'snap';
    h.step = 0;
    h.t = 0;
    h.wind = [0, 0.85, 0.72, 0.64][this.phase];
    h.lockAt = h.wind - 0.32;
    h.locked = false;
    this.local(player.pos, h.target).y += 0.9;
    sfx('hydra_hiss', { gain: 0.9 }, () => audio.charge());
  }

  startSpit(h, player) {
    h.state = 'spit';
    h.step = 0;
    h.t = 0;
    h.wind = [0, 0.9, 0.8, 0.72][this.phase];
    h.count = [0, 3, 4, 5][this.phase];
    h.fired = 0;
    sfx('hydra_hiss', { gain: 0.8, rate: 1.25 }, () => audio.charge());
    if (this.firstSpit) {
      this.firstSpit = false;
      this.game.hud.bossHint('Seed pods! Shoot them down in their color, or get out of the rings.', false);
    }
  }

  endAttack(h) {
    if (h.marker) this.hideMarker(h.marker);
    h.marker = null;
    h.state = 'idle';
    h.t = 0;
  }

  firePod(h, player, k) {
    const mouth = h.g.getWorldPosition(new THREE.Vector3()).addScaledVector(h.fwd, MOUTH * 0.9);
    const target = new THREE.Vector3();
    if (k === 0) {
      // the first lands where you're heading, the rest scatter around you
      target.copy(player.pos).addScaledVector(player.vel, 0.45).setY(player.pos.y);
    } else {
      const a = Math.random() * Math.PI * 2, r = rnd(2.6, 5.5);
      target.copy(player.pos).add(_v.set(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    this.clampToArena(target);
    const g = this.groundAt(target.x, target.z, Math.max(player.pos.y, this.floorY) + 10);
    target.y = g ? g.y : this.floorY;
    const flight = 1.15 + k * 0.07 + mouth.distanceTo(target) * 0.012;
    new SeedPod(this, mouth, target, h.color, flight);
    sfx('hydra_spit', { gain: 0.7 }, () => audio.enemyShoot());
    this.world.fx.burst(mouth, COLORS[h.color].hex, { count: 12, speed: 5, life: 0.4, size: 0.3, gravity: 4 });
  }

  podBurst(p, color, landed) {
    const fx = this.world.fx;
    fx.burst(p, 0x5dff6a, { count: 40, speed: 8, life: 0.7, size: 0.4, gravity: 14 });
    fx.burst(p, COLORS[color].hex, { count: 16, speed: 6, life: 0.5, size: 0.35, gravity: 10 });
    fx.ring(_v.copy(p).setY(p.y + 0.1), UP, 0x7dff8a, { size: 0.4, end: 2.6, life: 0.4 });
    sfx('pod_burst', { gain: 0.8 }, () => audio.sample('acid', { gain: 0.5 }) || audio.orbPop());
    const pl = this.game.player;
    if (landed && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < 1.7 && pl.pos.y < p.y + 1.6 && pl.pos.y > p.y - 1.2) this.kill(pl, 'acid');
    if (!landed) return;
    const g = this.groundAt(p.x, p.z, p.y + 1);
    if (!g || g.acid || Math.abs(g.y - p.y) > 0.5) return;
    this.spawnPool(p, [0, 1.8, 2.0, 2.2][this.phase], POOL_LIFE[this.phase]);
  }

  spawnPool(p, r, life) {
    const pool = this.pools.find((k) => !k.on) || this.pools.reduce((a, b) => (a.life - a.t < b.life - b.t ? a : b));
    pool.on = true;
    pool.t = 0;
    pool.life = life;
    pool.r = r;
    pool.p.copy(p);
    pool.g.position.set(p.x, p.y + 0.05, p.z);
    pool.g.scale.setScalar(0.01);
    pool.g.visible = true;
    const h = r * 0.72;
    pool.solid.min.set(p.x - h, p.y - 0.05, p.z - h);
    pool.solid.max.set(p.x + h, p.y + 0.1, p.z + h);
    pool.solid.enabled = true;
  }

  clearPool(pool) {
    pool.on = false;
    pool.g.visible = false;
    pool.solid.enabled = false;
  }

  updateHeads(dt, player) {
    const lp = this.local(player.pos, _lp);
    const eye = _eye.set(lp.x, lp.y + 1.3, lp.z);
    const pAng = Math.atan2(lp.z, lp.x);
    const turn = [0, 1.0, 1.25, 1.5][this.phase] * dt;
    const fast = 1 - Math.exp(-dt * 7), slow = 1 - Math.exp(-dt * 3.5);
    const desired = _w;
    for (const h of this.heads) {
      h.t += dt;
      h.flash = Math.max(0, h.flash - dt * 5);
      if (['idle', 'rise', 'spit', 'sunk'].includes(h.state) || (h.state === 'snap' && h.step === 0)) {
        const want = pAng + (h.i - 1) * 0.95;
        h.ang += clamp(wrap(want - h.ang), -turn, turn);
      }
      const out = _u.set(Math.cos(h.ang), 0, Math.sin(h.ang));
      let glow = 0, open = 0.15 + Math.sin(this.t * 2 + h.i) * 0.1, snapLook = false;
      switch (h.state) {
        case 'sunk':
          this.sunkPos(h, h.pos);
          h.look.copy(h.pos).add(out);
          h.g.visible = false;
          break;
        case 'rise': {
          const k = Math.min(1, h.t / 1.3);
          this.restPos(h, desired);
          h.pos.lerpVectors(h.from, desired, ease(k));
          h.look.lerp(eye, fast);
          open = 0.9 * Math.sin(k * Math.PI);
          if (k >= 1) h.state = 'idle';
          break;
        }
        case 'idle':
          this.restPos(h, desired);
          if (this.thrash > 0) desired.add(_v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.5));
          h.pos.lerp(desired, slow);
          h.look.lerp(eye, fast);
          if (this.thrash > 0) open = 1.1;
          break;
        case 'snap':
          ({ glow, open, snapLook } = this.updateSnap(h, player, lp, out, dt, desired, fast));
          break;
        case 'spit':
          ({ glow, open } = this.updateSpit(h, player, lp, out, desired, fast, eye));
          break;
        case 'down': {
          // limp: flop toward the moat rim, then sink into the sludge
          h.wilt = Math.min(1, h.t / 0.7);
          this.paintHead(h);
          if (h.t < 0.8) desired.set(out.x * 8.4, 0.6, out.z * 8.4);
          else desired.set(out.x * 8.0, -4.2, out.z * 8.0);
          h.pos.lerp(desired, 1 - Math.exp(-dt * (h.t < 0.8 ? 4 : 2.5)));
          h.look.copy(h.pos).addScaledVector(out, 1).add(_v.set(0, -1.6, 0));
          open = 0.5;
          if (h.t > 0.8 && !h.splashed) {
            h.splashed = true;
            this.world.fx.burst(_v.copy(h.pos).add(this.c).setY(this.floorY - 0.4), 0x5dff6a, { count: 40, speed: 7, life: 0.8, size: 0.5, gravity: 14 });
          }
          if (h.t > 2.0) {
            h.state = 'sunk';
            h.splashed = false;
            h.g.visible = false;
          }
          break;
        }
      }
      h.open = open;
      h.openCur += (h.open - h.openCur) * Math.min(1, dt * (h.open < h.openCur ? 30 : 10));
      h.upper.rotation.x = -h.openCur;
      h.lower.rotation.x = h.openCur * 0.7;
      // orientation: look at the target, smoothly (exactly during a lunge)
      _v.subVectors(h.look, h.pos);
      if (_v.lengthSq() < 1e-4) _v.copy(out);
      if (Math.abs(_v.y) > 0.98 * _v.length()) _v.x += 0.05;
      _m.lookAt(_v.add(h.pos), h.pos, UP);
      _q.setFromRotationMatrix(_m);
      if (snapLook) h.q.copy(_q);
      else h.q.slerp(_q, Math.min(1, dt * 10));
      h.g.position.copy(h.pos);
      h.g.quaternion.copy(h.q);
      h.fwd.set(0, 0, 1).applyQuaternion(h.q);
      h.glow += (glow - h.glow) * Math.min(1, dt * 10);
      if (h.state !== 'down' && h.state !== 'sunk') {
        h.mat.emissiveIntensity = 0.62 + h.flash * 1.4 + h.glow * 0.6;
        h.mawMat.color.set(COLORS[h.color].hex).multiplyScalar(1.4 + h.glow * 1.6 + h.flash * 1.5);
      }
    }
  }

  updateSnap(h, player, lp, out, dt, desired, fast) {
    let glow = 0, open = 0, snapLook = false;
    if (h.step === 0) {
      // telegraph: rear back and up, jaws wide, maw blazing, tracking you until the last 0.32 s
      const k = Math.min(1, h.t / h.wind);
      if (h.t < h.lockAt) this.local(player.pos, h.target).y += 0.9;
      else if (!h.locked) {
        h.locked = true;
        const g = _v.copy(h.target).add(this.c);
        const ground = this.groundAt(g.x, g.z, g.y + 0.5);
        h.marker = this.showMarker(g.setY(ground ? ground.y : this.floorY), h.color, 0.9, BITE_R);
      }
      this.restPos(h, desired).addScaledVector(out, -1.8).add(_v.set(0, 2.2, 0));
      desired.add(_v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.12 * k));
      h.pos.lerp(desired, fast);
      h.look.copy(h.target);
      glow = k;
      open = 1.25 * ease(Math.min(1, k * 1.6));
      if (h.t >= h.wind) {
        h.step = 1;
        h.t = 0;
        h.from.copy(h.pos);
        const dir = _v.subVectors(h.target, h.from);
        const len = dir.length();
        h.strike.copy(h.target).addScaledVector(dir.normalize(), -Math.min(MOUTH, len * 0.5));
        sfx('vine_whip', { gain: 0.7, rate: 1.3 }, () => audio.sweep());
      }
    } else if (h.step === 1) {
      const k = Math.min(1, h.t / 0.22);
      h.pos.lerpVectors(h.from, h.strike, k * k);
      h.look.copy(h.target).addScaledVector(_v.subVectors(h.target, h.from).normalize(), 2);
      snapLook = true;
      glow = 1;
      open = 1.25 * (1 - k * k);
      if (k > 0.35) this.biteCheck(h, player);
      if (k >= 1) {
        h.step = 2;
        h.t = 0;
        const p = _v.copy(h.target).add(this.c);
        this.world.fx.burst(p.setY(p.y - 0.6), 0x6b5a3a, { count: 30, speed: 7, life: 0.6, size: 0.4, gravity: 14 });
        this.world.fx.ring(p, UP, COLORS[h.color].hex, { size: 0.5, end: 3, life: 0.35 });
        sfx('hydra_snap', { gain: 1 }, () => audio.sample('boss_slam', { gain: 0.7, rate: 1.5 }));
        const d = _w.subVectors(player.pos, p).length();
        if (d < 8) player.shake = Math.max(player.shake, 0.4 * (1 - d / 8));
      }
    } else if (h.step === 2) {
      // planted: jaws clamped in the dirt for a moment — the easiest shot it gives you
      h.pos.copy(h.strike).add(_v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.05));
      snapLook = false;
      open = 0;
      if (h.t < 0.12) this.biteCheck(h, player);
      if (h.t > [0, 1.1, 0.95, 0.8][this.phase]) {
        h.step = 3;
        h.t = 0;
        this.hideMarker(h.marker);
        h.marker = null;
      }
    } else {
      this.restPos(h, desired);
      h.pos.lerp(desired, 1 - Math.exp(-dt * 5));
      h.look.lerp(_eye, fast);
      open = 0.3;
      if (h.t > 0.7) this.endAttack(h);
    }
    return { glow, open, snapLook };
  }

  biteCheck(h, player) {
    const m = _v.copy(h.pos).addScaledVector(h.fwd, MOUTH).add(this.c);
    const dx = player.pos.x - m.x, dy = player.pos.y + 0.9 - m.y, dz = player.pos.z - m.z;
    if (dx * dx + dy * dy + dz * dz < BITE_R * BITE_R) this.kill(player, 'spike');
  }

  updateSpit(h, player, lp, out, desired, fast, eye) {
    let glow = 0, open = 0;
    if (h.step === 0) {
      const k = Math.min(1, h.t / h.wind);
      this.restPos(h, desired).addScaledVector(out, -1.2).add(_v.set(0, 2.4, 0));
      h.pos.lerp(desired, fast);
      // rear up, mouth to the sky, throat swelling
      const toward = _v.set(lp.x - h.pos.x, 0, lp.z - h.pos.z).normalize();
      h.look.copy(h.pos).add(toward).add(_w.set(0, 1.5, 0));
      glow = k;
      open = 1.3 * ease(k);
      if (h.t >= h.wind) {
        h.step = 1;
        h.t = 0;
      }
    } else {
      const k = h.t / 0.14;
      while (h.fired < h.count && h.fired <= k) this.firePod(h, player, h.fired++);
      const toward = _v.set(lp.x - h.pos.x, 0, lp.z - h.pos.z).normalize();
      h.look.copy(h.pos).add(toward).add(_w.set(0, 1.2, 0));
      glow = 0.6;
      open = 1.0 + Math.sin(h.t * 40) * 0.15;
      if (h.t > h.count * 0.14 + 0.5) this.endAttack(h);
    }
    return { glow, open };
  }

  updateNecks() {
    const segs = NECK_SEGS;
    for (const h of this.heads) {
      const a = Math.atan2(h.pos.z, h.pos.x);
      const p0 = _a.set(Math.cos(a) * 2.3, 3.1, Math.sin(a) * 2.3);
      const p1 = _b.set(Math.cos(a) * 3.6, 6.2, Math.sin(a) * 3.6);
      const p3 = _d.copy(h.pos);
      const p2 = _e.copy(h.pos).addScaledVector(h.fwd, -3.2 * HEAD_SCALE);
      // a severed head's neck goes slack
      if (h.state === 'down' || h.state === 'sunk') p1.set(Math.cos(a) * 4.5, 2.5, Math.sin(a) * 4.5);
      let prev = bez(p0, p1, p2, p3, 0, _f);
      _g.copy(prev);
      for (let k = 0; k < segs; k++) {
        const t = (k + 1) / segs;
        const next = bez(p0, p1, p2, p3, t, _h);
        const dir = _v.subVectors(next, _g);
        const len = dir.length() || 0.001;
        dir.divideScalar(len);
        const r = 0.95 - 0.38 * t;
        _s.set(r, r, len * 1.15);
        _q.setFromUnitVectors(Z, dir);
        const mid = _w.addVectors(next, _g).multiplyScalar(0.5);
        _m.compose(mid, _q, _s);
        this.necks.setMatrixAt(h.i * segs + k, _m);
        // a thorn on alternating flanks
        const side = _u.crossVectors(dir, UP);
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
        side.normalize().multiplyScalar(k % 2 ? 1 : -1).addScaledVector(UP, 0.35).normalize();
        _q.setFromUnitVectors(UP, side);
        _s.setScalar(0.7 + r * 0.6);
        _m.compose(mid.addScaledVector(side, r * 0.9), _q, _s);
        this.neckThorns.setMatrixAt(h.i * segs + k, _m);
        _g.copy(next);
      }
    }
    this.necks.instanceMatrix.needsUpdate = true;
    this.neckThorns.instanceMatrix.needsUpdate = true;
  }

  updateBud(dt) {
    const target = this.state === 'dying' ? 1.15 : this.bloomTarget ?? 0;
    if (Math.abs(target - this.bloom) > 0.001) this.setBloom(this.bloom + clamp(target - this.bloom, -dt * 2.2, dt * 1.6));
    this.heartFlash = Math.max(0, (this.heartFlash || 0) - dt * 5);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (this.heartOpen ? 9 : 3));
    this.heart.scale.setScalar(1 + pulse * (this.heartOpen ? 0.08 : 0.03) + this.heartFlash * 0.1);
    this.heart.position.y = 5.5 + this.bloom * 0.5;
    this.heartShell.rotation.y += dt * 0.8;
    this.heartShell.rotation.x += dt * 0.5;
    this.paintHeart(pulse);
    this.heart.getWorldPosition(this.heartLight.position);
    this.heartLight.intensity = this.heartOpen ? 14 + pulse * 6 : this.state === 'fight' || this.state === 'intro' ? 2 + pulse * 1.5 : 0;
  }

  // ------------------------------------------------------------------ thorn root sweep
  startSweep(player) {
    const pa = Math.atan2(player.pos.z - this.c.z, player.pos.x - this.c.x);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const P = this.phase;
    this.sweep = { state: 'rise', t: 0, dir, th: pa - dir * 1.8, swept: 0, total: Math.PI * 2 * [0, 1, 1.25, 1.5][P], w: [0, 0.72, 0.82, 0.92][P] };
    this.sweeper.visible = true;
    this.sweeper.position.y = -1.8;
    this.placeSweeper();
    sfx('root_rumble', { gain: 1 }, () => audio.sample('boss_step', { gain: 1, rate: 0.6 }));
    if (this.firstSweep) {
      this.firstSweep = false;
      this.game.hud.bossHint('THORN ROOT! Jump it, ride on top of it, or take a jump pad!', true);
    }
  }

  sinkSweep() {
    if (!this.sweep) return;
    this.sweep.state = 'sink';
    this.sweep.t = 0;
    for (const s of this.rootSolids) {
      s.enabled = false;
      s.delta.set(0, 0, 0);
    }
  }

  placeSweeper() {
    const s = this.sweep;
    this.sweeper.rotation.y = -s.th;
    const tip = (s.tip = this.reach(s.th));
    for (let k = 0; k < ROOT_SECTIONS; k++) {
      const r = 4.4 + (k + 0.5) * ROOT_SEG;
      const show = r + ROOT_SEG * 0.5 <= tip + 0.2;
      _s.setScalar(show ? 1 : 0);
      _q.setFromAxisAngle(X, k * 1.9); // twist each section so the thorns don't line up
      _m.compose(_v.set(r, 0, 0), _q, _s);
      this.rootBark.setMatrixAt(k, _m);
      this.rootThorns.setMatrixAt(k, _m);
      _m.compose(_v.set(r, 0, 0), _q.identity(), _s);
      this.rootMoss.setMatrixAt(k, _m);
    }
    const last = Math.floor((tip + 0.2 - 4.4) / ROOT_SEG - 0.5 + 1e-6);
    const end = 4.4 + (last + 1) * ROOT_SEG;
    this.rootTip.position.x = end;
    this.vein.position.x = 4.4;
    this.vein.scale.x = end - 4.4 + 1.6;
    this.rootBark.instanceMatrix.needsUpdate = this.rootThorns.instanceMatrix.needsUpdate = this.rootMoss.instanceMatrix.needsUpdate = true;
  }

  updateSweep(dt, player) {
    const s = this.sweep;
    if (!s) return;
    s.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 18);
    if (s.state === 'rise') {
      // telegraph: the root heaves up out of the moat and the floor, sap veins strobing
      const k = Math.min(1, s.t / 1.1);
      this.sweeper.position.y = -1.8 * (1 - ease(k));
      this.veinMat.color.set(0xd8ff3a).multiplyScalar(1.5 + pulse * 2.5);
      if (Math.random() < dt * 25) {
        const r = rnd(this.moatOut, s.tip);
        this.world.fx.burst(_v.set(Math.cos(s.th) * r, 0.2, Math.sin(s.th) * r).add(this.c), 0x6b5a3a, { count: 6, speed: 5, life: 0.6, size: 0.4, gravity: 14 });
      }
      player.shake = Math.max(player.shake, 0.12);
      if (k >= 1) {
        s.state = 'sweep';
        s.t = 0;
        sfx('vine_whip', { gain: 1 }, () => audio.sweep());
      }
      return;
    }
    if (s.state === 'sink') {
      const k = Math.min(1, s.t / 0.8);
      this.sweeper.position.y = -1.9 * ease(k);
      if (k >= 1) {
        this.sweep = null;
        this.sweeper.visible = false;
        this.sweepT = [0, 13, 11, 9][this.phase] + Math.random() * 3;
      }
      return;
    }
    this.veinMat.color.set(0xd8ff3a).multiplyScalar(2.0 + pulse * 0.8);
    const step = s.dir * s.w * dt;
    s.th += step;
    s.swept += Math.abs(step);
    this.placeSweeper();
    // the riding solids follow (each one's delta carries whoever stands on it)
    const c = Math.cos(s.th), sn = Math.sin(s.th), ac = Math.abs(c), as = Math.abs(sn);
    const L = ROOT_SEG / 2, T = 0.45, top = this.floorY + ROOT_TOP;
    // one-way: the boxes are only solid for feet already level with the top (landing on it, or riding),
    // so the root never scoops up someone it should be cutting down
    const above = player.pos.y >= top - 0.15;
    for (const so of this.rootSolids) {
      const on = so.r + L <= s.tip && (above || player.ground === so);
      const x = this.c.x + c * so.r, z = this.c.z + sn * so.r;
      if (on && so.enabled) so.delta.set(x - so.center.x, 0, z - so.center.z);
      else so.delta.set(0, 0, 0);
      so.center.set(x, 0, z);
      const hx = ac * L + as * T, hz = as * L + ac * T;
      so.min.set(x - hx, this.floorY - 0.5, z - hz);
      so.max.set(x + hx, top, z + hz);
      so.enabled = on;
    }
    // the flanks kill: anyone level with the root as it passes (riders and jumpers are above it)
    const lp = this.local(player.pos, _lp);
    const pr = Math.hypot(lp.x, lp.z), d = wrap(Math.atan2(lp.z, lp.x) - s.th);
    const along = pr * Math.cos(d), lateral = Math.abs(pr * Math.sin(d));
    if (along > this.moatOut - 0.6 && along < s.tip + 0.6 && lateral < ROOT_HALF + 0.35 && player.pos.y < top - 0.15) this.kill(player, 'spike');
    if (Math.random() < dt * 20) {
      const r = rnd(this.moatOut, s.tip);
      this.world.fx.burst(_v.set(c * r, 0.1, sn * r).add(this.c), 0x6b5a3a, { count: 3, speed: 3, life: 0.5, size: 0.35, gravity: 10 });
    }
    if (s.swept >= s.total) this.sinkSweep();
  }

  // ------------------------------------------------------------------ spores (phase 2+)
  startSpores() {
    this.spore = { t: 0, n: this.phase >= 3 ? 4 : 3, fired: false };
    sfx('root_rumble', { gain: 0.7, rate: 1.3 }, () => audio.sample('boss_step', { gain: 0.6, rate: 0.9 }));
    if (this.firstSpore) {
      this.firstSpore = false;
      this.game.hud.bossHint('Spore clouds — mines drift inside them. Pop them with their color!', false);
    }
  }

  updateSpores(dt, player) {
    const s = this.spore;
    if (!s) return;
    s.t += dt;
    // telegraph: the bulb swells and wheezes
    const k = Math.min(1, s.t / 0.9);
    if (!s.fired) this.body.scale.set(1 + Math.sin(k * Math.PI) * 0.08, 1 + Math.sin(k * Math.PI) * 0.12, 1 + Math.sin(k * Math.PI) * 0.08);
    if (!s.fired && s.t > 0.9) {
      s.fired = true;
      this.body.scale.set(1, 1, 1);
      sfx('spore_puff', { gain: 1 }, () => audio.sample('absorb', { gain: 0.8, rate: 0.6 }));
      const pa = Math.atan2(player.pos.z - this.c.z, player.pos.x - this.c.x);
      for (let i = 0; i < s.n; i++) {
        const a = pa + (i - (s.n - 1) / 2) * 1.0 + rnd(-0.2, 0.2);
        const from = _v.set(Math.cos(a) * 2, 6.5, Math.sin(a) * 2).add(this.c);
        const vel = new THREE.Vector3(Math.cos(a), -0.25, Math.sin(a)).multiplyScalar(rnd(3.2, 4.2));
        for (let j = 0; j < 3; j++) this.spawnCloud(from, vel, rnd(6, 9));
        if (this.mines.length < 5 && this.state === 'fight') {
          const m = new Orb(this.world, from, vel.clone().multiplyScalar(0.8), pick(this.colors), { homing: 0.55, life: 11, radius: 0.48, speed: 3.1 });
          this.mines.push(m);
        }
      }
      this.world.fx.burst(_v.set(0, 6.5, 0).add(this.c), 0xb8d870, { count: 30, speed: 6, life: 1.4, size: 1.6, gravity: -0.5, mode: 'puff' });
    }
    if (s.fired && s.t > 1.5) {
      this.spore = null;
      this.sporeT = [0, 0, 12, 10][this.phase] + Math.random() * 3;
    }
  }

  spawnCloud(p, vel, size) {
    const c = this.clouds.find((k) => !k.on) || this.clouds.reduce((a, b) => (a.t > b.t ? a : b));
    c.on = true;
    c.t = 0;
    c.life = rnd(9, 11);
    c.size = size;
    c.sp.position.copy(p).add(_u.set(rnd(-1.5, 1.5), rnd(-1, 1), rnd(-1.5, 1.5)));
    c.vel.copy(vel).multiplyScalar(rnd(0.8, 1.2));
    c.sp.visible = true;
    c.sp.material.rotation = Math.random() * 6.28;
  }

  updateClouds(dt) {
    for (const c of this.clouds) {
      if (!c.on) continue;
      c.t += dt;
      c.sp.position.addScaledVector(c.vel, dt);
      c.vel.multiplyScalar(Math.exp(-dt * 0.35));
      if (c.sp.position.y < this.floorY + 2.2) c.vel.y = Math.abs(c.vel.y) * 0.3;
      const fade = Math.min(1, c.t / 0.8) * Math.min(1, (c.life - c.t) / 2);
      c.m.opacity = 0.62 * Math.max(0, fade);
      const s = c.size * (0.6 + 0.4 * Math.min(1, c.t / 2));
      c.sp.scale.set(s, s, 1);
      c.sp.material.rotation += dt * 0.1;
      if (c.t > c.life) {
        c.on = false;
        c.sp.visible = false;
      }
    }
  }

  // ------------------------------------------------------------------ thorn eruption (phase 3)
  startErupt(player) {
    const e = this.erupts.find((k) => !k.on);
    if (!e) return;
    const g = this.groundAt(player.pos.x, player.pos.z, player.pos.y + 1.2);
    if (!g || g.acid) return;
    e.on = true;
    e.t = 0;
    e.p.set(player.pos.x, g.y, player.pos.z);
    e.g.position.copy(e.p);
    e.g.scale.set(1, 0.01, 1);
    e.g.rotation.y = Math.random() * 6.28;
    e.g.visible = false;
    e.marker = this.showMarker(e.p, 0xc8ff4a, 0.9, 1.9);
    sfx('root_rumble', { gain: 0.8, rate: 1.5 }, () => audio.sample('boss_step', { gain: 0.7, rate: 1.2 }));
  }

  endErupt(e) {
    e.on = false;
    e.g.visible = false;
    this.hideMarker(e.marker);
  }

  updateErupts(dt, player) {
    for (const e of this.erupts) {
      if (!e.on) continue;
      e.t += dt;
      const WIND = 0.85;
      if (e.t < WIND) {
        if (Math.random() < dt * 30) this.world.fx.burst(_v.copy(e.p).add(_u.set(rnd(-1.5, 1.5), 0.1, rnd(-1.5, 1.5))), 0x6b5a3a, { count: 2, speed: 3, life: 0.4, size: 0.3, gravity: 10 });
        continue;
      }
      if (!e.burst) {
        e.burst = true;
        e.g.visible = true;
        this.hideMarker(e.marker);
        sfx('thorn_erupt', { gain: 1 }, () => audio.spike());
        this.world.fx.burst(e.p, 0x6b5a3a, { count: 40, speed: 9, life: 0.7, size: 0.5, gravity: 14 });
      }
      const k = e.t - WIND;
      e.g.scale.y = k < 0.1 ? Math.max(0.01, k / 0.1) : k < 0.8 ? 1 : Math.max(0.01, 1 - (k - 0.8) / 0.4);
      if (k < 0.75 && Math.hypot(player.pos.x - e.p.x, player.pos.z - e.p.z) < 1.75 && player.pos.y < e.p.y + 2.8 * e.g.scale.y && player.pos.y > e.p.y - 0.5) this.kill(player, 'spike');
      if (k > 1.2) {
        e.burst = false;
        this.endErupt(e);
      }
    }
  }

  // ------------------------------------------------------------------ pools & markers
  updatePools(dt) {
    for (const p of this.pools) {
      if (!p.on) continue;
      p.t += dt;
      const s = p.r * Math.min(1, p.t / 0.25) * Math.min(1, Math.max(0, (p.life - p.t) / 0.6));
      p.g.scale.setScalar(Math.max(0.01, s));
      // the hazard shrinks away a little before the puddle does
      if (p.t > p.life - 0.35) p.solid.enabled = false;
      if (p.t > p.life) this.clearPool(p);
    }
  }

  updateMarkers(dt) {
    for (const m of this.markers) {
      if (!m.on) continue;
      m.t += dt;
      const k = Math.min(1, m.t / Math.max(0.01, m.life));
      const blink = 0.5 + 0.5 * Math.sin(m.t * (10 + k * 25));
      m.g.scale.setScalar(m.r * (0.35 + 0.65 * Math.min(1, m.t / 0.25)));
      m.rm.opacity = 0.55 + 0.45 * blink;
      m.dm.opacity = 0.1 + 0.25 * k;
      if (m.t > m.life) this.hideMarker(m);
    }
  }

  // ------------------------------------------------------------------ death
  updateDeath(dt, player) {
    const T = (this.deathT = this.stateT);
    const fx = this.world.fx;
    // the heads thrash, then one by one go limp and crash into the moat
    this.thrash = T < 1.2 ? 1 : 0;
    this.heartColor = this.colors[Math.floor(T * 12) % this.colors.length];
    for (const h of this.heads) {
      if (h.state === 'sunk' || h.state === 'down') continue;
      if (T > 0.9 + h.i * 0.45) {
        h.state = 'down';
        h.t = 0;
        fx.burst(h.g.getWorldPosition(_v), COLORS[h.color].hex, { count: 60, speed: 8, life: 1.2, size: 0.6, gravity: 8, mode: 'shard' });
        sfx('hydra_sever', { gain: 0.9, rate: 0.8 + h.i * 0.1 }, () => audio.bossLimbBreak());
        player.shake = Math.max(player.shake, 0.5);
      } else if (h.state === 'snap' || h.state === 'spit') this.endAttack(h);
    }
    // then the bulb withers: it darkens, slumps and sheds its petals in a storm of spores
    if (T > 2.2) {
      const k = Math.min(1, (T - 2.2) / 2.2);
      this.barkMat.color.set(0x55602f).lerp(BROWN, k);
      this.petalMat.color.set(0x7a2a66).lerp(_c.set(0x3a2430), k);
      this.mossMat.color.set(0x3f7a2c).lerp(_c.set(0x4a4a2a), k);
      this.body.scale.set(1 - k * 0.08, 1 - k * 0.45, 1 - k * 0.08);
      this.body.rotation.z = Math.sin(T * 23) * 0.01 * (1 - k);
      if (Math.random() < dt * 22) {
        const p = _v.set(rnd(-3, 3), rnd(3, 7), rnd(-3, 3)).add(this.c);
        fx.burst(p, Math.random() < 0.5 ? 0xff7ad0 : 0x9a3a8a, { count: 14, speed: 4, life: 2.2, size: 0.55, gravity: 1.5, drag: 1.2, mode: 'shard' });
        fx.burst(p, 0xb8d870, { count: 4, speed: 2, life: 1.8, size: 1.8, gravity: -0.3, mode: 'puff' });
      }
    }
    this.heartLight.intensity = T < 4.4 ? 18 + Math.sin(T * 30) * 8 : 0;
    if (T > 4.6) {
      this.state = 'dead';
      const p = this.heart.getWorldPosition(new THREE.Vector3());
      fx.burst(p, 0xff7ad0, { count: 200, speed: 15, life: 2.6, size: 0.7, gravity: 3, drag: 1, mode: 'shard' });
      fx.burst(p, 0x7a2a66, { count: 120, speed: 11, life: 2.4, size: 0.8, gravity: 4, mode: 'shard' });
      for (const c of this.colors) fx.burst(p, COLORS[c].hex, { count: 60, speed: 13, life: 1.6, size: 0.5, gravity: 5 });
      fx.burst(p, 0xc8e080, { count: 40, speed: 5, life: 3, size: 3, gravity: -0.2, mode: 'puff' });
      fx.ring(p, UP, 0xffffff, { size: 1, end: 16, life: 0.8, k: 2 });
      fx.flash(p, 0xffffff, { size: 8, life: 0.4, k: 2 });
      audio.explode(true);
      player.shake = 1;
      for (const h of this.heads) {
        h.state = 'sunk';
        this.sunkPos(h, h.pos);
      }
      for (const p of this.pools) this.clearPool(p);
      this.applyHusk();
      this.hideHud();
      this.onDefeated?.();
    }
  }
}

// cubic bezier
function bez(a, b, c, d, t, out) {
  const u = 1 - t;
  return out
    .copy(a).multiplyScalar(u * u * u)
    .addScaledVector(b, 3 * u * u * t)
    .addScaledVector(c, 3 * u * t * t)
    .addScaledVector(d, t * t * t);
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _h = new THREE.Vector3();

// Merge non-indexed geometries that share position/normal/uv attributes into one.
function mergeSimple(geos) {
  const names = ['position', 'normal', 'uv'];
  const total = geos.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

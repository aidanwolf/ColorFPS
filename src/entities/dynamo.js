// THE DYNAMO — Azure's mini-boss (the Core Sanctum, levels/azure.js): a hulking walker that the station's
// power runs through. While it's powered nothing touches it (every shot sizzles off its field). It stalks
// you, lobbing slow balls of blue lightning, and when you're close it STOMPS: a shock ring races out
// over the floor (jump it) and every puddle near it goes live, so standing in your own water near it is
// death. Its weakness is the same water: soak the floor where it walks and SHORT one of the room's
// conduits (Junction, waterPuzzle.js) while a puddle runs from that conduit's foot to its feet. The surge
// overloads it: it drops to one knee, its chest plates blow open and the core is bare for a few seconds.
// Hose it down with blue. From the second overload the core wears hard-light shells (colorShield.js) to
// shoot off first. Three overloads finish it. Between them it calls in blue-bodied help.
//   new Dynamo(world, game, { pos, bounds: { x1, x2, z1, z2 }, spawns: [[x, y, z]], adds: [spec],
//     onStart, onDefeated })     start() / reset() / setDefeated()
import * as THREE from 'three';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { audio } from '../audio.js';
import { Orb, Drone } from './drone.js';
import { SpawnPortal, spawnEnemy } from './combat.js';
import { ColorShield } from './colorShield.js';
import { critHit, PainVoice, Malfunction, WeakMarker, play, prefetchFeel } from '../bossFeel.js';

const NAME = 'THE DYNAMO';
const PHASE_HP = 20; // blue ticks of the hose (one every 0.13 s) per overload
const PHASES = 3;
const STUN = [6.5, 6, 5.5];
const SPEED = [1.5, 1.9, 2.3];
const STOMP_CD = [5.5, 4.5, 3.6];
const BOLT_CD = [2.8, 2.3, 1.9];
const ADD_EVERY = [13, 11, 9];
const CORE_SHIELDS = [[], [RED], [YELLOW, GREEN]];
const STOMP_R = 10;
const BLUE_HEX = COLORS[BLUE].hex;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;
// remove a helper without a fuss (drones clean up with dispose, the rest with despawn)
const gone = (e) => (e instanceof Drone ? e.dispose() : e.despawn ? e.despawn() : e.dispose?.());
const SOUNDS = ['titan_step', 'titan_slam', 'boss_slam', 'charge_up', 'robot_pain_heavy', 'titan_roar', 'titan_death', 'shield_absorb', 'energy_crackle', 'joint_sparks', 'boss_core_hit', 'servo_heavy', 'enemy_shot', 'warden_shield_break'];
audio.manifest?.then(() => {
  audio.prefetch(SOUNDS);
  prefetchFeel();
});

export class Dynamo {
  constructor(world, game, { pos, bounds, spawns = [], adds = [], onStart = null, onDefeated = null }) {
    this.world = world;
    this.game = game;
    this.home = new THREE.Vector3(...pos);
    this.pos = this.home.clone();
    this.baseY = this.home.y;
    this.floorY = this.baseY;
    this.grounded = true;
    this.bounds = bounds;
    this.spawns = spawns;
    this.addSpecs = adds;
    this.onStart = onStart;
    this.onDefeated = onDefeated;
    this.maxHp = PHASE_HP * PHASES;
    this.color = BLUE; // (its body: what hurts the core once its shells are off)
    this.yaw = Math.PI;
    this.adds = [];
    this.portals = [];
    this.build();
    this.pain = new PainVoice(world, { name: 'robot_pain_heavy', fallback: 'warden_pain_big', rate: 0.7, gain: 1.1, big: 'titan_roar', bigFallback: 'boss_roar', bigRate: 1.25 });
    this.sparks = new Malfunction(game, [this.coreMesh, this.knees[0], this.knees[1], this.coils[0], this.coils[1]], { scale: 1.6, spark: 0x9fd0ff, arc: 0xcfe8ff, smoke: 0x1a2030, rate: 9 });
    this.marker = new WeakMarker(world, game, { color: BLUE_HEX, size: 1.1 });
    this.reset(true);
    world.add(this);
  }

  // ---------------------------------------------------------------- the rig
  build() {
    const armor = (this.armorMat = new THREE.MeshStandardMaterial({ color: 0x27324a, roughness: 0.35, metalness: 0.75, emissive: 0x08142c, emissiveIntensity: 1 }));
    const dark = new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.5, metalness: 0.6 });
    const ceramic = new THREE.MeshStandardMaterial({ color: 0xd2dce8, roughness: 0.35 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(BLUE_HEX).multiplyScalar(2.4) });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(BLUE_HEX).multiplyScalar(3) });
    this.fieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd0ff), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mats = [armor, dark, ceramic, this.glowMat, this.coreMat, this.fieldMat];
    const B = (w, h, d, m, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      return o;
    };
    const root = (this.root = new THREE.Group());
    const hips = (this.hips = new THREE.Group());
    hips.position.y = 2.1;
    root.add(hips);
    hips.add(B(1.7, 0.5, 1.1, dark));
    // legs: thigh, knee, shin, a wide flat foot (the part that stands in the water)
    this.legs = [];
    this.knees = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.95, 0, 0);
      thigh.add(B(0.55, 1.1, 0.7, armor, 0, -0.5, 0));
      const knee = new THREE.Group();
      knee.position.y = -1.05;
      const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), dark);
      knee.add(kneeCap, B(0.5, 0.9, 0.6, armor, 0, -0.45, 0.05));
      const foot = B(0.9, 0.22, 1.35, dark, 0, -0.95, -0.1);
      foot.add(B(0.92, 0.05, 1.37, this.glowMat, 0, 0.11, 0));
      knee.add(foot);
      thigh.add(knee);
      hips.add(thigh);
      this.legs.push({ thigh, knee, s });
      this.knees.push(kneeCap);
    }
    // the torso: a broad hull, a hunched back with insulator stacks, the core behind two plates
    const torso = (this.torso = new THREE.Group());
    torso.position.y = 0.35;
    hips.add(torso);
    torso.add(B(2.5, 1.5, 1.7, armor, 0, 0.95, 0));
    torso.add(B(2.1, 0.5, 1.5, armor, 0, 1.9, 0.15));
    torso.add(B(2.56, 0.08, 1.76, this.glowMat, 0, 0.35, 0));
    for (const s of [-1, 1]) torso.add(B(0.06, 1.1, 1.2, this.glowMat, s * 1.27, 1.0, 0.05), B(0.5, 0.06, 1.52, this.glowMat, s * 0.7, 2.16, 0.15));
    this.coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), this.coreMat);
    this.coreMesh.position.set(0, 1.05, -0.62);
    this.coreMesh.userData.hit = this;
    this.coreMesh.userData.part = 'core';
    torso.add(this.coreMesh);
    this.plates = [];
    for (const s of [-1, 1]) {
      const p = B(0.62, 1.05, 0.18, armor, s * 0.32, 1.05, -0.92);
      p.add(B(0.05, 0.9, 0.2, this.glowMat, -s * 0.29, 0, 0));
      torso.add(p);
      this.plates.push({ mesh: p, s });
    }
    for (const x of [-0.7, 0, 0.7]) {
      for (let i = 0; i < 4; i++) {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - i * 0.025, 0.2 - i * 0.025, 0.08, 10), ceramic);
        disc.position.set(x, 2.25 + i * 0.16, 0.55);
        torso.add(disc);
      }
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), this.glowMat);
      tip.position.set(x, 2.95, 0.55);
      torso.add(tip);
      (this.tips ??= []).push(tip);
    }
    // a head: a low sensor dome with a visor slit
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    head.position.set(0, 2.15, -0.45);
    head.add(B(0.6, 0.08, 0.1, this.glowMat, 0, 0.17, -0.38));
    torso.add(head);
    // arms ending in tesla coils
    this.arms = [];
    this.coils = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 1.5, 1.45, 0);
      sh.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), armor));
      sh.add(B(0.45, 1.1, 0.5, armor, 0, -0.65, 0));
      const coil = new THREE.Group();
      coil.position.y = -1.35;
      coil.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.8, 10), dark));
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 5, 14), this.glowMat);
        r.rotation.x = Math.PI / 2;
        r.position.y = -0.25 + i * 0.25;
        coil.add(r);
      }
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), this.coreMat);
      ball.position.y = -0.55;
      coil.add(ball);
      sh.add(coil);
      torso.add(sh);
      this.arms.push(sh);
      this.coils.push(ball);
    }
    // its field: a shimmering skin that flashes where shots strike it
    this.field = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), this.fieldMat);
    this.field.scale.set(2.1, 2.5, 1.7);
    this.field.position.y = 2.6;
    this.field.raycast = () => {};
    root.add(this.field);
    // the shock ring of the stomp
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd0ff).multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mats.push(this.ringMat);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.visible = false;
    this.ring.raycast = () => {};
    this.ring.userData.noCull = true;
    this.world.scene.add(this.ring);
    root.scale.setScalar(1.2); // (hulking: the rig is built at 1/1.2)
    root.userData.hit = this;
    this.world.scene.add(root);
    this.world.addHittable(root);
  }

  get center() {
    return _v.copy(this.pos).setY(this.floorY + 3.3);
  }

  // ---------------------------------------------------------------- control
  start() {
    if (this.state !== 'dormant' || this.defeated) return;
    this.state = 'intro';
    this.t = 0;
    const nameEl = document.querySelector('#boss-bar .boss-name');
    if (nameEl) {
      this.savedName ??= nameEl.textContent;
      nameEl.textContent = NAME;
    }
    this.game.hud.bossShow(true);
    this.game.hud.bossBar(1);
    this.game.hud.zoneTitle('OVERLOAD IT', NAME, COLORS[BLUE].css);
    play('titan_roar', 'boss_roar', { gain: 1, rate: 1.3, vary: 0 });
    this.onStart?.(this);
  }

  hideHud() {
    this.game.hud.bossShow(false);
    const nameEl = document.querySelector('#boss-bar .boss-name');
    if (nameEl && this.savedName) nameEl.textContent = this.savedName;
  }

  reset(first = false) {
    if (this.defeated) return;
    for (const e of this.adds) if (!e.dead) gone(e);
    for (const p of this.portals) p.cancel();
    this.adds = [];
    this.portals = [];
    this.state = 'dormant';
    this.t = 0;
    this.hp = this.maxHp;
    this.phase = 0;
    this.pos.copy(this.home);
    this.yaw = Math.PI;
    this.stompCd = 3;
    this.boltCd = 2;
    this.addCd = 6;
    this.immuneT = 0;
    this.kneel = 0;
    this.open = 0;
    this.walkT = 0;
    this.fieldFlash = 0;
    this.ringT = -1;
    this.coreShield?.dispose();
    this.coreShield = null;
    if (!first) this.hideHud();
    this.pose(0);
  }

  setDefeated() {
    this.defeated = true;
    this.state = 'dead';
    this.kneel = 1;
    this.open = 1;
    this.coreMat.color.setHex(0x101820);
    this.glowMat.color.setHex(0x0a1424);
    this.armorMat.emissive.setHex(0x000000);
    this.fieldMat.opacity = 0;
    this.coreShield?.dispose();
    this.coreShield = null;
    this.world.removeHittable(this.root);
    this.pose(0);
  }

  // ---------------------------------------------------------------- damage
  onHit(color, hit) {
    if (this.state === 'dead' || this.state === 'dying') return 'shield';
    if (this.state === 'stunned' && hit?.part === 'core') {
      if (this.coreShield?.up) {
        const r = this.coreShield.hit(color, hit);
        if (!this.coreShield.up) this.game.hud.bossHint('The core is bare — blue!', true);
        return r;
      }
      if (color !== BLUE) return 'immune';
      this.damage(hit);
      return 'hit';
    }
    // powered: the field drinks it
    this.fieldFlash = 1;
    if ((this.absorbT ?? 0) <= this.world.time) {
      this.absorbT = this.world.time + 0.25;
      audio.sample('shield_absorb', { gain: 0.6, rate: 0.8, vary: 0.1 });
      if (this.state !== 'stunned' && (this.hintAt ?? -99) < this.world.time - 12) {
        this.hintAt = this.world.time;
        this.game.hud.bossHint('Its field drinks every shot. Soak the floor under it, then short a conduit.', false);
      }
    }
    return 'shield';
  }

  damage(hit) {
    const floor = this.maxHp - PHASE_HP * (this.phase + 1);
    if (this.hp <= floor) return;
    this.hp--;
    critHit(this.game, hit, { color: BLUE_HEX, spark: 0xcfe8ff, scale: 1.2, gain: 0.8, shake: 0.12, pop: false });
    play('boss_core_hit', 'drone_hit', { gain: 0.6, rate: 0.9, vary: 0.1 });
    this.pain.hurt();
    this.game.hud.bossBar(this.hp / this.maxHp);
    if (this.hp <= floor) {
      // this overload is spent: it rears back up (or dies)
      this.phase++;
      this.pain.roar();
      if (this.phase >= PHASES) this.die();
      else {
        this.state = 'recover';
        this.t = 0;
        this.game.hud.bossHint(this.phase === 1 ? 'It shrugs it off. Do it again — it\'s getting faster.' : 'One more overload!', true);
      }
    }
  }

  // shock water under its feet (wet.js calls this when it stands in a live puddle; update() checks its
  // whole footprint too)
  onShock() {
    this.tryStun();
  }

  tryStun() {
    if (this.immuneT > 0 || this.defeated) return;
    if (!['walk', 'stomp', 'bolt'].includes(this.state)) return;
    this.state = 'stunned';
    this.t = 0;
    this.pain.roar();
    play('joint_sparks', 'energy_crackle', { gain: 1.2, rate: 0.7, vary: 0 });
    audio.sample('warden_shield_break', { gain: 0.9, rate: 0.8, vary: 0 });
    this.game.player.shake = Math.max(this.game.player.shake, 0.35);
    const fx = this.world.fx;
    const c = this.center;
    fx.flash(c, 0xcfe8ff, { size: 5, life: 0.25, k: 2.4 });
    fx.sparks(c, UP, 0x9fd0ff, { count: 60, speed: 14, spread: 1.8, life: 0.7 });
    for (let i = 0; i < 6; i++) this.world.wet.arc(_a.copy(this.pos).setY(this.floorY + 0.05).add(_b.set(rnd(-2, 2), 0, rnd(-2, 2))), _w.copy(c).add(_b.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))));
    // the core's shells for this overload (kept if they survived the last one)
    const want = CORE_SHIELDS[this.phase];
    if (!this.coreShield && want.length) this.coreShield = new ColorShield(this, { shields: want, hp: 2 }, { parent: this.coreMesh, size: 0.62, spin: 0.6 });
    const tag = (c) => `<b style="color:${COLORS[c].css}">${COLORS[c].name}</b>`;
    this.game.hud.bossHint(this.coreShield?.up ? `OVERLOADED! Its core is shelled: ${this.coreShield.colors.slice(this.coreShield.idx).map(tag).join(', then ')}, then blue.` : 'OVERLOADED! Hose its core with blue!', true);
    for (const e of this.adds) if (!e.dead && Math.random() < 0.5) e.onShock?.();
  }

  die() {
    this.state = 'dying';
    this.t = 0;
    this.marker.update(0, null);
    this.game.hud.bossHint('', false);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, player) {
    if (this.state === 'dormant' || this.state === 'dead') {
      this.marker.update(dt, null);
      this.sparks.update(dt, false);
      if (this.state === 'dead') this.pose(dt);
      return;
    }
    if (this.game.rulesPaused) return;
    this.t += dt;
    this.immuneT -= dt;
    this.dist = this.pos.distanceTo(player.pos);
    const fx = this.world.fx;
    const ph = Math.min(this.phase, PHASES - 1);
    const toP = _a.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dP = toP.length();
    switch (this.state) {
      case 'intro':
        this.open = 0;
        if (this.t > 2.2) {
          this.state = 'walk';
          this.t = 0;
          this.game.hud.bossHint('Its field drinks every shot. Soak the floor under it, then short a conduit.', false);
        }
        break;
      case 'walk': {
        this.turnTo(toP, dt, 1.6);
        if (dP > 3.2) this.walk(dt, SPEED[ph]);
        this.stompCd -= dt;
        this.boltCd -= dt;
        if (dP < 7 && this.stompCd <= 0 && player.grounded) {
          this.state = 'stomp';
          this.t = 0;
          audio.sample('charge_up', { gain: 0.9, rate: 0.7, vary: 0 });
        } else if (this.boltCd <= 0 && dP > 5) {
          this.state = 'bolt';
          this.t = 0;
        }
        break;
      }
      case 'stomp': {
        // wind-up (a raised foot, arcs gathering between the coils), then the slam
        this.turnTo(toP, dt, 0.8);
        if (Math.random() < dt * 30) this.world.wet.arc(this.coils[0].getWorldPosition(_v), this.coils[1].getWorldPosition(_w));
        if (this.t >= 1.0 && !this.slammed) {
          this.slammed = true;
          this.slam(player);
        }
        if (this.t > 1.6) {
          this.slammed = false;
          this.state = 'walk';
          this.t = 0;
          this.stompCd = STOMP_CD[ph];
        }
        break;
      }
      case 'bolt': {
        this.turnTo(toP, dt, 2.5);
        if (this.t > 0.55 && !this.fired) {
          this.fired = true;
          const n = ph >= 2 ? 3 : ph >= 1 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const from = this.coils[i % 2].getWorldPosition(new THREE.Vector3());
            const aim = _w.copy(player.pos).setY(player.pos.y + 1.1).sub(from).normalize();
            aim.applyAxisAngle(UP, (i - (n - 1) / 2) * 0.22);
            new Orb(this.world, from, aim.multiplyScalar(9.5), BLUE, { radius: 0.36, life: 5 });
          }
          audio.sample('enemy_shot', { gain: 0.8, rate: 0.6, vary: 0.05 });
        }
        if (this.t > 1.1) {
          this.fired = false;
          this.state = 'walk';
          this.t = 0;
          this.boltCd = BOLT_CD[ph];
        }
        break;
      }
      case 'stunned': {
        if (this.t > STUN[ph]) {
          this.state = 'recover';
          this.t = 0;
          this.game.hud.bossHint('It\'s back up. Overload it again.', false);
        }
        break;
      }
      case 'recover':
        if (this.t > 1.2) {
          this.state = 'walk';
          this.t = 0;
          this.immuneT = 1.5;
          this.stompCd = 1.5;
        }
        break;
      case 'dying': {
        if (Math.random() < dt * 14) {
          const p = this.center.add(_b.set(rnd(-1.4, 1.4), rnd(-1.8, 1), rnd(-1, 1)));
          fx.sparks(p, UP, 0x9fd0ff, { count: 14, speed: 9, life: 0.5 });
          fx.flash(p, 0xcfe8ff, { size: 1.2, life: 0.1 });
          if (Math.random() < 0.3) audio.sample('joint_sparks', { gain: 0.8, rate: rnd(0.7, 1.1), vary: 0 });
        }
        if (this.t > 2.6) {
          const c = this.center.clone();
          fx.flash(c, 0xffffff, { size: 8, life: 0.4, k: 2.5 });
          fx.burst(c, BLUE_HEX, { count: 140, speed: 14, life: 1.1, size: 0.35, gravity: 6 });
          fx.sparks(c, UP, 0xcfe8ff, { count: 90, speed: 18, spread: 2, life: 0.9 });
          fx.ring(_w.copy(this.pos).setY(this.floorY + 0.1), UP, 0x9fd0ff, { size: 0.5, end: 14, life: 0.6, thick: 0.4, k: 2 });
          play('titan_death', 'boss_death', { gain: 1.1, rate: 1.25, vary: 0 });
          this.game.player.shake = Math.max(this.game.player.shake, 0.7);
          for (const e of this.adds) if (!e.dead) (e.onShock ? e.onShock() : gone(e));
          this.hideHud();
          this.setDefeated();
          this.onDefeated?.(this);
        }
        break;
      }
    }
    // overloaded by shock water anywhere under its feet
    const wet = this.world.wet;
    if (wet.anyShock && this.immuneT <= 0 && this.state !== 'stunned') {
      for (const p of wet.puddles) {
        if (p.shock > 0 && Math.abs(p.y - this.floorY) < 0.45 && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < wet.radius(p) + 1.1) {
          this.tryStun();
          break;
        }
      }
    }
    // reinforcements
    this.adds = this.adds.filter((e) => !e.dead);
    this.portals = this.portals.filter((p) => !p.gone);
    if (this.state !== 'intro' && this.state !== 'dying' && this.addSpecs.length && this.spawns.length) {
      this.addCd -= dt;
      if (this.addCd <= 0 && this.adds.length + this.portals.length < 3) {
        this.addCd = ADD_EVERY[ph];
        const spec = this.addSpecs[(this.addN = (this.addN ?? -1) + 1) % this.addSpecs.length];
        // the spawn point farthest from the player
        const at = this.spawns.reduce((a, b) => (Math.hypot(b[0] - player.pos.x, b[2] - player.pos.z) > Math.hypot(a[0] - player.pos.x, a[2] - player.pos.z) ? b : a));
        const portal = new SpawnPortal(this.world, at, COLORS[spec.color ?? BLUE].hex, {
          onSpawn: () => {
            const e = spawnEnemy(this.world, { aggro: true, ...spec, pos: at });
            if (e) {
              e.materialize?.();
              this.adds.push(e);
            }
            return e;
          },
        });
        this.portals.push(portal);
      }
    }
    // the power crackling over its back while it's live
    if (this.state !== 'stunned' && this.state !== 'dying' && Math.random() < dt * 5) {
      const a = this.tips[Math.floor(Math.random() * 3)].getWorldPosition(_v), b = this.tips[Math.floor(Math.random() * 3)].getWorldPosition(_w);
      if (a.distanceTo(b) > 0.2) this.world.wet.arc(a, b);
      else this.world.wet.arc(a, b.add(_b.set(rnd(-0.6, 0.6), rnd(0.2, 0.9), rnd(-0.6, 0.6))));
    }
    this.updateRing(dt, player);
    this.pose(dt);
    const stunned = this.state === 'stunned';
    this.sparks.update(dt, stunned || this.state === 'dying', stunned ? 1 : 1.6);
    this.marker.update(dt, stunned && !this.coreShield?.up ? this.coreMesh.getWorldPosition(_w) : null, 1.4);
    if (this.coreShield) {
      this.coreShield.root.visible = stunned;
      this.coreShield.update(dt);
    }
  }

  turnTo(dir, dt, rate) {
    if (dir.lengthSq() < 1e-4) return;
    const want = Math.atan2(-dir.x, -dir.z);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += clamp(d, -rate * dt, rate * dt);
  }

  walk(dt, speed) {
    const W = this.world, b = this.bounds, r = 1.4;
    const dx = -Math.sin(this.yaw) * speed * dt, dz = -Math.cos(this.yaw) * speed * dt;
    // axis by axis, stopping at anything waist-high (the conduits) and the room's bounds
    const tryMove = (nx, nz) => {
      if (nx < b.x1 + r || nx > b.x2 - r || nz < b.z1 + r || nz > b.z2 - r) return false;
      for (const [ox, oz] of [[0, 0], [r * 0.7, 0], [-r * 0.7, 0], [0, r * 0.7], [0, -r * 0.7]]) {
        const s = W.pointInSolid(_w.set(nx + ox, this.baseY + 1.2, nz + oz));
        if (s && !s.entity) return false;
      }
      return true;
    };
    if (tryMove(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    if (tryMove(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
    this.walkT += speed * dt;
    // up onto low steps (the dais)
    const s = W.pointInSolid(_w.set(this.pos.x, this.baseY + 0.5, this.pos.z));
    const fy = s && s.max.y <= this.baseY + 0.6 ? s.max.y : this.baseY;
    this.floorY += (fy - this.floorY) * Math.min(1, dt * 8);
    // footfalls
    const step = Math.floor(this.walkT / 1.6);
    if (step !== this.lastStep) {
      this.lastStep = step;
      const g = clamp(1.2 - this.dist / 40, 0.3, 1);
      audio.sample('titan_step', { gain: 0.8 * g, rate: 1.35, vary: 0.08 });
      this.game.player.shake = Math.max(this.game.player.shake, 0.12 * g);
      this.world.fx.landDust(_w.copy(this.pos).setY(this.floorY), 0.8);
    }
  }

  slam(player) {
    const fx = this.world.fx;
    const p = _w.copy(this.pos).setY(this.floorY + 0.05);
    play('titan_slam', 'boss_slam', { gain: 1.1, rate: 1.2, vary: 0.05 });
    audio.sample('energy_crackle', { gain: 1, rate: 0.6, vary: 0 });
    fx.flash(p, 0xcfe8ff, { size: 4, life: 0.2, n: UP, k: 2.2 });
    fx.sparks(p, UP, 0x9fd0ff, { count: 40, speed: 12, spread: 1.6, life: 0.6 });
    this.game.player.shake = Math.max(this.game.player.shake, 0.5);
    // every puddle round it goes live (its own feet are insulated for a moment)
    this.immuneT = Math.max(this.immuneT, 1.6);
    this.world.wet.electrify(p, 7, 1.6);
    this.ringT = 0;
    this.ringHit = false;
  }

  updateRing(dt, player) {
    if (this.ringT < 0) {
      this.ring.visible = false;
      return;
    }
    this.ringT += dt;
    const k = this.ringT / 0.75;
    const r = 0.5 + k * STOMP_R;
    this.ring.visible = k < 1;
    this.ring.position.set(this.pos.x, this.floorY + 0.12, this.pos.z);
    this.ring.scale.setScalar(r);
    this.ringMat.opacity = (1 - k) * 0.9;
    if (Math.random() < dt * 40) {
      const a = Math.random() * Math.PI * 2;
      this.world.fx.sparks(_v.set(this.pos.x + Math.cos(a) * r, this.floorY + 0.1, this.pos.z + Math.sin(a) * r), UP, 0x9fd0ff, { count: 3, speed: 4, life: 0.25 });
    }
    // a ring racing over the floor: jump it
    if (!this.ringHit && !player.dead && player.grounded && player.pos.y < this.floorY + 0.9) {
      const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (Math.abs(d - r) < 0.7) {
        this.ringHit = true;
        player.damage(1, 'shock');
      }
    }
    if (k >= 1) this.ringT = -1;
  }

  // ---------------------------------------------------------------- the pose
  pose(dt) {
    const stunned = this.state === 'stunned' || this.state === 'dying' || this.state === 'dead';
    this.kneel += clamp((stunned ? 1 : 0) - this.kneel, -dt * 2, dt * 4);
    this.open += clamp((stunned ? 1 : 0) - this.open, -dt * 3, dt * 5);
    this.fieldFlash = Math.max(0, this.fieldFlash - dt * 4);
    const t = this.world.time;
    const walking = this.state === 'walk';
    const w = this.walkT * (Math.PI / 1.6);
    this.root.position.set(this.pos.x, this.floorY - this.kneel * 0.75, this.pos.z);
    this.root.rotation.y = this.yaw;
    this.hips.position.y = 2.1 + (walking ? Math.abs(Math.sin(w)) * 0.12 : 0);
    const stompLift = this.state === 'stomp' ? Math.min(1, this.t / 0.8) * (this.t < 1 ? 1 : Math.max(0, 1 - (this.t - 1) * 6)) : 0;
    for (const [i, L] of this.legs.entries()) {
      const sw = walking ? Math.sin(w + i * Math.PI) * 0.4 : 0;
      const lift = i === 1 ? stompLift : 0;
      L.thigh.rotation.x = sw - lift * 0.9 - this.kneel * (i ? 1.2 : 0.2);
      L.knee.rotation.x = Math.max(0, -sw) * 0.5 + lift * 1.1 + this.kneel * (i ? 1.5 : 0.5);
    }
    this.torso.rotation.x = this.kneel * 0.35 - stompLift * 0.1;
    for (const [i, a] of this.arms.entries()) a.rotation.x = (walking ? Math.sin(w + i * Math.PI) * 0.25 : 0) - (this.state === 'bolt' ? 1.2 : 0) - stompLift * 0.8 + this.kneel * 0.4;
    for (const p of this.plates) p.mesh.position.x = p.s * (0.32 + this.open * 0.55);
    const dead = this.state === 'dead';
    if (!dead) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 6);
      this.coreMat.color.setHex(BLUE_HEX).multiplyScalar(stunned ? 4 + Math.sin(t * 20) : 2.4 * pulse);
      this.fieldMat.opacity = stunned ? 0 : (this.state === 'dormant' ? 0 : 0.06 + 0.04 * Math.sin(t * 9)) + this.fieldFlash * 0.35;
    }
  }
}

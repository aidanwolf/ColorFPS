// THE PRISM WARDEN — a ~7 m armored humanoid with a color-combo shield, a color-shifting core,
// color-armored limbs (each with a crippling effect when broken), a laser sword and three phases.
import * as THREE from 'three';
import { COLORS } from './colors.js';
import { audio } from './audio.js';
import { Orb } from './entities/drone.js';

const MAX_HP = 4200;
const LIMB_DEFS = {
  head: { armor: 6, dmg: 10, broken: 'head' },
  armL: { armor: 8, dmg: 6 },
  armR: { armor: 8, dmg: 6 },
  legL: { armor: 8, dmg: 6 },
  legR: { armor: 8, dmg: 6 },
};
const LIMB_REGEN = 12;
const BROKEN_DMG = 7;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

const rand = (n) => Math.floor(Math.random() * n);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Boss {
  constructor(world, game, { pos, bounds, floorY }) {
    this.world = world;
    this.game = game;
    this.spawn = new THREE.Vector3(...pos);
    this.bounds = bounds;
    this.floorY = floorY;
    this.root = new THREE.Group();
    this.root.visible = false;
    world.scene.add(this.root);
    this.build();
    this.buildFx();
    this.resetState();
    world.add(this);
  }

  // ------------------------------------------------------------------ construction
  build() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2a35, metalness: 0.85, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15151c, metalness: 0.6, roughness: 0.6 });
    this.exposedMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const box = (w, h, d, m, x = 0, y = 0, z = 0, parent) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const tag = (obj, part) => {
      obj.userData.hit = this;
      obj.userData.part = part;
      return obj;
    };
    this.limbs = {};
    const makeLimb = (name) => {
      const l = { name, ...LIMB_DEFS[name], maxArmor: LIMB_DEFS[name].armor, plates: [], exposed: [], broken: false, timer: 0, color: 0, flash: 0 };
      l.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.6 });
      this.limbs[name] = l;
      return l;
    };

    // pelvis
    this.hips = new THREE.Group();
    this.hips.position.y = 3.2;
    this.root.add(this.hips);
    tag(this.hips, 'torso');
    box(2.0, 0.8, 1.3, metal, 0, 0, 0, this.hips);

    // legs
    for (const side of [-1, 1]) {
      const name = side < 0 ? 'legR' : 'legL';
      const l = makeLimb(name);
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.78, -0.1, 0);
      this.hips.add(thigh);
      tag(thigh, name);
      box(0.85, 1.6, 0.85, metal, 0, -0.8, 0, thigh);
      l.plates.push(box(0.95, 1.0, 0.25, l.mat, 0, -0.75, 0.48, thigh));
      l.exposed.push(box(0.5, 1.1, 0.5, this.exposedMat, 0, -0.8, 0.2, thigh));
      const knee = new THREE.Group();
      knee.position.y = -1.6;
      thigh.add(knee);
      box(0.75, 1.5, 0.75, dark, 0, -0.75, 0, knee);
      l.plates.push(box(0.85, 0.9, 0.25, l.mat, 0, -0.7, 0.42, knee));
      box(1.0, 0.3, 1.5, metal, 0, -1.45, 0.25, knee);
      l.thigh = thigh;
      l.knee = knee;
    }

    // torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.3;
    this.hips.add(this.torso);
    tag(this.torso, 'torso');
    box(2.9, 2.3, 1.7, metal, 0, 1.25, 0, this.torso);
    box(3.3, 0.6, 1.9, dark, 0, 2.3, 0, this.torso);
    this.torsoMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.4 });
    for (const s of [-1, 1]) box(0.9, 1.0, 0.2, this.torsoMat, s * 0.95, 1.5, 0.9, this.torso);
    box(2.6, 2.0, 0.3, dark, 0, 1.2, -0.95, this.torso); // back plate
    // core
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), this.coreMat);
    this.core.position.set(0, 1.05, 0.85);
    tag(this.core, 'core');
    this.torso.add(this.core);
    this.coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 8, 24), dark);
    this.coreRing.position.copy(this.core.position);
    this.torso.add(this.coreRing);
    // The core light lives in the scene (not under the hidden root) and is dimmed to 0 while the boss
    // is away, so the visible light count never changes (that would recompile every material).
    this.coreLight = new THREE.PointLight(0xffffff, 0, 14, 1.5);
    this.coreLightAnchor = new THREE.Object3D();
    this.coreLightAnchor.position.set(0, 1.05, 1.6);
    this.torso.add(this.coreLightAnchor);
    this.world.scene.add(this.coreLight);

    // head
    const hl = makeLimb('head');
    this.head = new THREE.Group();
    this.head.position.set(0, 2.55, 0.05);
    this.torso.add(this.head);
    tag(this.head, 'head');
    box(0.5, 0.4, 0.5, dark, 0, 0.1, 0, this.head);
    box(1.15, 1.0, 1.15, metal, 0, 0.75, 0, this.head);
    hl.plates.push(box(1.0, 0.28, 0.12, hl.mat, 0, 0.8, 0.6, this.head)); // visor
    hl.plates.push(box(0.18, 0.7, 1.3, hl.mat, 0, 1.35, 0, this.head)); // crest
    hl.exposed.push(box(0.7, 0.6, 0.7, this.exposedMat, 0, 0.75, 0.25, this.head));

    // arms
    for (const side of [-1, 1]) {
      const name = side < 0 ? 'armR' : 'armL';
      const l = makeLimb(name);
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 1.85, 2.1, 0);
      this.torso.add(shoulder);
      tag(shoulder, name);
      box(1.1, 0.8, 1.1, metal, side * 0.15, 0.1, 0, shoulder);
      l.plates.push(box(1.2, 0.3, 1.2, l.mat, side * 0.15, 0.55, 0, shoulder));
      box(0.7, 1.5, 0.7, dark, 0, -0.85, 0, shoulder);
      l.exposed.push(box(0.45, 1.2, 0.45, this.exposedMat, 0, -0.85, 0, shoulder));
      const elbow = new THREE.Group();
      elbow.position.y = -1.6;
      shoulder.add(elbow);
      box(0.7, 1.4, 0.7, metal, 0, -0.7, 0, elbow);
      l.plates.push(box(0.8, 0.9, 0.2, l.mat, 0, -0.65, 0.4, elbow));
      const hand = new THREE.Group();
      hand.position.y = -1.45;
      elbow.add(hand);
      box(0.55, 0.45, 0.55, dark, 0, 0, 0, hand);
      l.shoulder = shoulder;
      l.elbow = elbow;
      l.hand = hand;
    }

    // laser sword in the right hand
    this.sword = new THREE.Group();
    this.limbs.armR.hand.add(this.sword);
    this.sword.rotation.x = Math.PI / 2;
    box(0.25, 0.25, 0.9, dark, 0, 0, 0, this.sword);
    this.bladeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4060).multiplyScalar(2.2) });
    this.blade = box(0.16, 0.22, 5.6, this.bladeMat, 0, 0, 3.2, this.sword);
    this.blade.userData.hit = this;
    this.blade.userData.part = 'sword';

    // shield — held out in front of the chest by the left arm
    this.shieldGroup = new THREE.Group();
    this.shieldGroup.position.set(0.35, 1.05, 1.75);
    this.torso.add(this.shieldGroup);
    tag(this.shieldGroup, 'shield');
    this.shieldMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.2, transparent: true, opacity: 0.92 });
    const face = new THREE.Mesh(new THREE.BoxGeometry(3.1, 3.4, 0.3), this.shieldMat);
    this.shieldGroup.add(face);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.7, 0.2), dark);
    rim.position.z = -0.12;
    this.shieldGroup.add(rim);
    this.pips = [];
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      p.position.set(0, 0, 0.2);
      this.shieldGroup.add(p);
      this.pips.push(p);
    }

    // floating health bar above the head
    this.barCanvas = document.createElement('canvas');
    this.barCanvas.width = 512;
    this.barCanvas.height = 64;
    this.barTex = new THREE.CanvasTexture(this.barCanvas);
    this.barTex.colorSpace = THREE.SRGBColorSpace;
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barTex, depthTest: false, transparent: true }));
    this.bar.scale.set(6, 0.75, 1);
    this.bar.position.y = 9.4;
    this.bar.renderOrder = 10;
    this.bar.raycast = () => {}; // the health bar never blocks shots
    this.root.add(this.bar);

    this.world.addHittable(this.root);
  }

  buildFx() {
    const scene = this.world.scene;
    // the low sweeping laser you must jump over
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4060).multiplyScalar(2.5), transparent: true, opacity: 1, depthWrite: false });
    const bg = new THREE.BoxGeometry(0.25, 0.45, 13).translate(0, 0, 8);
    this.beam = new THREE.Mesh(bg, this.beamMat);
    this.beam.visible = false;
    scene.add(this.beam);
    this.rings = [];
  }

  resetState() {
    this.state = 'dormant';
    this.stateT = 0;
    this.hp = MAX_HP;
    this.phase = 1;
    this.pos = this.spawn.clone();
    this.yaw = Math.PI;
    this.walkPhase = 0;
    this.attackTimer = 2.5;
    this.attack = null;
    this.kneel = 0;
    this.stagger = 0;
    this.dipY = 0;
    this.torsoTwist = 0;
    for (const l of Object.values(this.limbs)) {
      l.armor = l.maxArmor;
      l.broken = false;
      l.timer = 0;
      this.setLimbColor(l, rand(4));
    }
    this.shield = { up: true, combo: [], idx: 0, timer: 0, down: 0, reform: 1 };
    this.newCombo();
    this.coreColor = 0;
    this.coreTimer = 0;
    this.torsoColor = rand(4);
    this.torsoTimer = 4;
    this.flash = 0;
    this.coreFlash = 0;
    this.barDirty = true;
    this.root.visible = false;
    this.coreLight.intensity = 0;
    this.root.rotation.set(0, 0, 0);
    this.beam.visible = false;
    for (const r of this.rings) this.world.scene.remove(r.mesh);
    this.rings = [];
    this.shieldGroup.visible = true;
    this.sword.visible = true;
    this.deathT = 0;
    this.landT = undefined;
    this.roared = false;
  }

  // ------------------------------------------------------------------ fight control
  start() {
    if (this.state !== 'dormant') return;
    this.root.visible = true;
    this.state = 'intro';
    this.stateT = 0;
    this.pos.copy(this.spawn);
    this.pos.y = this.floorY + 30;
    this.yaw = Math.atan2(this.game.player.pos.x - this.pos.x, this.game.player.pos.z - this.pos.z);
  }

  get active() {
    return this.state !== 'dormant' && this.state !== 'dead';
  }

  setLimbColor(l, c) {
    l.color = c;
    const col = new THREE.Color(COLORS[c].hex);
    l.mat.color.copy(col);
    l.mat.emissive.copy(col);
  }

  newCombo() {
    const len = 2 + this.phase; // 3, 4, 5
    const combo = [];
    for (let i = 0; i < len; i++) {
      let c;
      do c = rand(4);
      while (i > 0 && c === combo[i - 1]);
      combo.push(c);
    }
    this.shield.combo = combo;
    this.shield.idx = 0;
    this.shield.timer = 0;
    const w = 0.6;
    const x0 = (-(len - 1) * w) / 2;
    this.pips.forEach((p, i) => {
      p.visible = i < len;
      p.position.set(x0 + i * w, 1.25, 0.24);
    });
    this.refreshShield();
  }

  refreshShield() {
    const s = this.shield;
    const need = s.combo[Math.min(s.idx, s.combo.length - 1)];
    const c = new THREE.Color(COLORS[need].hex);
    this.shieldMat.color.copy(c);
    this.shieldMat.emissive.copy(c);
    this.pips.forEach((p, i) => {
      if (i >= s.combo.length) return;
      const pc = new THREE.Color(COLORS[s.combo[i]].hex);
      if (i < s.idx) p.material.color.setRGB(3, 3, 3);
      else if (i === s.idx) p.material.color.copy(pc).multiplyScalar(2.6);
      else p.material.color.copy(pc).multiplyScalar(0.7);
      p.scale.setScalar(i === s.idx ? 1.25 : 1);
    });
  }

  shieldBlocked() {
    // the shield is forced down while the left arm is broken or the boss kneels
    return this.limbs.armL.broken || this.kneel > 0;
  }

  // ------------------------------------------------------------------ damage
  onHit(color, hit) {
    if (!this.active || this.state === 'intro' || this.state === 'dying') return 'immune';
    const part = hit.part;
    if (part === 'shield') {
      if (!this.shield.up) return 'immune';
      const s = this.shield;
      if (color === s.combo[s.idx]) {
        s.idx++;
        s.timer = 3.4;
        audio.comboTick(s.idx);
        if (s.idx >= s.combo.length) this.breakShield();
        else this.refreshShield();
        return 'hit';
      }
      if (s.idx > 0) this.game.hud.bossHint('Combo broken — start again!', true);
      s.idx = 0;
      this.flash = 1;
      this.refreshShield();
      return 'immune';
    }
    if (part === 'core') {
      if (this.shield.up) return 'immune';
      if (color !== this.coreColor) return 'immune';
      this.coreFlash = 1;
      this.damage(this.kneel > 0 ? 38 : 26);
      return 'hit';
    }
    if (part === 'torso') {
      if (color !== this.torsoColor) return 'immune';
      this.damage(4);
      return 'hit';
    }
    const l = this.limbs[part];
    if (l) {
      if (l.broken) {
        this.damage(BROKEN_DMG);
        return 'hit';
      }
      if (color !== l.color) return 'immune';
      l.armor--;
      l.flash = 1;
      this.damage(l.dmg);
      if (l.armor <= 0) this.breakLimb(l);
      return 'hit';
    }
    return 'immune';
  }

  damage(n) {
    if (this.state === 'dying') return;
    this.hp = Math.max(0, this.hp - n);
    this.barDirty = true;
    const frac = this.hp / MAX_HP;
    const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (phase !== this.phase) {
      this.phase = phase;
      audio.bossRoar();
      audio.setIntensity(2);
      this.game.player.shake = 0.8;
      this.stagger = 1.4;
      this.game.hud.bossHint(phase === 2 ? 'The Warden grows faster — shield combos lengthen!' : 'FINAL PHASE — five-color combos!', true);
      if (this.shield.up) this.newCombo();
    }
    if (this.hp <= 0) this.die();
  }

  breakShield() {
    const s = this.shield;
    s.up = false;
    s.down = this.phase === 3 ? 6 : 7.5;
    this.shieldGroup.visible = false;
    const p = this.shieldGroup.getWorldPosition(new THREE.Vector3());
    this.world.fx.burst(p, COLORS[s.combo[s.combo.length - 1]].hex, { count: 120, speed: 10, life: 1.1, size: 0.45, gravity: 8 });
    this.world.fx.burst(p, 0xffffff, { count: 40, speed: 6, life: 0.5, size: 0.5, gravity: 0 });
    audio.shieldBreak();
    this.game.player.shake = 0.5;
    this.stagger = 1.0;
    this.game.hud.bossHint('SHIELD SHATTERED — hit the core with its color!', true);
  }

  breakLimb(l) {
    l.broken = true;
    l.timer = LIMB_REGEN;
    l.plates.forEach((p) => (p.visible = false));
    const p = (l.thigh || l.shoulder || this.head).getWorldPosition(new THREE.Vector3());
    this.world.fx.burst(p, COLORS[l.color].hex, { count: 70, speed: 8, life: 0.9, size: 0.4, gravity: 10 });
    audio.shatter();
    audio.explode();
    const msgs = {
      head: 'Visor cracked — the Warden is stunned!',
      armL: 'Shield arm broken — its core is exposed!',
      armR: 'Sword arm broken — no more sword attacks!',
      legL: this.limbs.legR.broken ? 'Both legs broken — it kneels!' : 'Leg armor broken — break the other to drop it!',
      legR: this.limbs.legL.broken ? 'Both legs broken — it kneels!' : 'Leg armor broken — break the other to drop it!',
    };
    this.game.hud.bossHint(msgs[l.name], true);
    if (l.name === 'head') {
      this.stagger = 2.5;
      this.cancelAttack();
    }
    if (l.name === 'armR') {
      this.sword.visible = false;
      if (this.attack && ['sweep', 'slam'].includes(this.attack.type)) this.cancelAttack();
    }
    if ((l.name === 'legL' || l.name === 'legR') && this.limbs.legL.broken && this.limbs.legR.broken) {
      this.kneel = 6;
      this.cancelAttack();
      this.game.player.shake = 0.7;
      audio.slam();
    }
  }

  restoreLimb(l) {
    l.broken = false;
    l.armor = l.maxArmor;
    let c;
    do c = rand(4);
    while (c === l.color);
    this.setLimbColor(l, c);
    l.plates.forEach((p) => (p.visible = true));
    if (l.name === 'armR') this.sword.visible = true;
  }

  cancelAttack() {
    this.attack = null;
    this.beam.visible = false;
    this.attackTimer = 1.5;
    if (this.state === 'attack') this.state = 'walk';
  }

  die() {
    this.state = 'dying';
    this.deathT = 0;
    this.cancelAttack();
    this.state = 'dying';
    audio.bossRoar();
    this.game.onBossDying();
  }

  // ------------------------------------------------------------------ update
  update(dt, player) {
    if (this.state === 'dormant' || this.state === 'dead') return;
    this.stateT += dt;
    const t = this.world.time;

    if (this.state === 'intro') return this.updateIntro(dt, player);
    if (this.state === 'dying') return this.updateDeath(dt);

    // ---- timers ----
    for (const l of Object.values(this.limbs)) {
      l.flash = Math.max(0, l.flash - dt * 6);
      l.mat.emissiveIntensity = 0.6 + l.flash * 2.5;
      if (l.broken) {
        l.timer -= dt;
        if (l.timer <= 0) this.restoreLimb(l);
      }
    }
    const pulse = 1.5 + Math.sin(t * 14) * 1.2;
    this.exposedMat.color.setRGB(pulse, pulse, pulse);
    const s = this.shield;
    if (s.up && this.shieldBlocked()) {
      s.up = false;
      s.down = 0;
      this.shieldGroup.visible = false;
    }
    if (!s.up) {
      s.down -= dt;
      if (s.down <= 0 && !this.shieldBlocked()) {
        s.up = true;
        s.reform = 0;
        this.shieldGroup.visible = true;
        this.newCombo();
        this.game.hud.bossHint('Shield restored — match the color sequence!', false);
      }
    } else if (s.idx > 0) {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.idx = 0;
        this.refreshShield();
        this.game.hud.bossHint('Too slow — the combo reset!', true);
      }
    }
    if (s.reform < 1) {
      s.reform = Math.min(1, s.reform + dt * 4);
      this.shieldGroup.scale.setScalar(s.reform);
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.shieldMat.emissiveIntensity = 0.35 + this.flash * 2 + Math.sin(t * 6) * 0.08;

    this.coreTimer -= dt;
    if (this.coreTimer <= 0) {
      this.coreTimer = [0, 1.6, 1.25, 0.95][this.phase];
      let c;
      do c = rand(4);
      while (c === this.coreColor);
      this.coreColor = c;
    }
    this.coreFlash = Math.max(0, this.coreFlash - dt * 6);
    const cc = new THREE.Color(COLORS[this.coreColor].hex);
    this.coreMat.color.copy(cc).multiplyScalar(2.2 + this.coreFlash * 3);
    this.coreLight.color.copy(cc);
    this.coreLight.intensity = s.up ? 4 : 14;
    this.coreLightAnchor.getWorldPosition(this.coreLight.position);
    this.torsoTimer -= dt;
    if (this.torsoTimer <= 0) {
      this.torsoTimer = 4;
      this.torsoColor = (this.torsoColor + 1 + rand(3)) % 4;
    }
    const tc = new THREE.Color(COLORS[this.torsoColor].hex);
    this.torsoMat.color.copy(tc);
    this.torsoMat.emissive.copy(tc);

    // ---- behavior ----
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(dx, dz);
    let moving = false;

    if (this.kneel > 0) {
      this.kneel -= dt;
      if (this.kneel <= 0) {
        // stand back up with fresh leg armor
        this.restoreLimb(this.limbs.legL);
        this.restoreLimb(this.limbs.legR);
        this.attackTimer = 1.2;
      }
    } else if (this.stagger > 0) {
      this.stagger -= dt;
    } else if (this.attack) {
      this.updateAttack(dt, player, dist, targetYaw);
    } else {
      const turn = [0, 1.4, 1.8, 2.3][this.phase] * dt;
      this.yaw += Math.max(-turn, Math.min(turn, wrap(targetYaw - this.yaw)));
      const legsHurt = this.limbs.legL.broken || this.limbs.legR.broken;
      const speed = [0, 2.2, 2.8, 3.4][this.phase] * (legsHurt ? 0.45 : 1);
      if (dist > 7) {
        this.pos.x += Math.sin(this.yaw) * speed * dt;
        this.pos.z += Math.cos(this.yaw) * speed * dt;
        moving = true;
      }
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) this.chooseAttack(dist);
    }

    this.pos.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.pos.x));
    this.pos.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, this.pos.z));
    this.updateRings(dt, player);
    this.pushPlayer(player);
    this.animate(dt, moving);
    this.updateBar();
  }

  updateIntro(dt, player) {
    const T = this.stateT;
    if (this.pos.y > this.floorY) {
      this.pos.y = Math.max(this.floorY, this.floorY + 30 - T * T * 22);
      if (this.pos.y === this.floorY) {
        audio.slam();
        player.shake = 1;
        this.spawnRing(this.pos.clone(), false);
        this.world.fx.burst(this.pos.clone().setY(this.floorY + 0.3), 0xd9c8ff, { count: 120, speed: 12, life: 1, size: 0.5, gravity: 4 });
        this.landT = T;
      }
    } else if (T - this.landT > 0.5 && !this.roared) {
      this.roared = true;
      audio.bossRoar();
      player.shake = 0.6;
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.animate(dt, false);
    this.updateBar();
    this.updateRings(dt, player);
    if (this.landT !== undefined && T - this.landT > 2.4) {
      this.state = 'walk';
      this.attackTimer = 1.5;
      this.game.hud.bossHint('Break the shield with its color combo, then hit the core!', false);
    }
  }

  chooseAttack(dist) {
    const opts = [];
    const swordOk = !this.limbs.armR.broken;
    const headOk = !this.limbs.head.broken;
    if (swordOk && dist < 14) opts.push('sweep', 'sweep');
    if (swordOk) opts.push('slam');
    if (headOk) opts.push('volley', 'volley');
    if (this.phase >= 2 && dist > 10) opts.push('charge', 'charge');
    if (!opts.length) {
      this.attackTimer = 1;
      return;
    }
    const type = opts[rand(opts.length)];
    this.attack = { type, t: 0, step: 0, fired: 0, hit: false };
    if (type === 'sweep') audio.charge();
    if (type === 'charge') audio.charge();
  }

  updateAttack(dt, player, dist, targetYaw) {
    const a = this.attack;
    a.t += dt;
    const p = this.phase;
    if (a.type === 'sweep') {
      const wind = p === 3 ? 0.65 : 0.9;
      const dur = p === 3 ? 0.5 : 0.65;
      const passes = p === 3 ? 2 : 1;
      if (a.step === 0) {
        // telegraph: rotate to face, show a faint beam at the starting edge
        this.yaw += wrap(targetYaw - this.yaw) * Math.min(1, dt * 4);
        this.beam.visible = true;
        this.beamMat.opacity = 0.18 + 0.2 * Math.sin(a.t * 30);
        a.from = 1.9;
        a.to = -1.9;
        this.setBeam(a.from);
        this.torsoTwist = 1.1;
        if (a.t > wind) {
          a.step = 1;
          a.t = 0;
          a.prev = a.from;
          audio.sweep();
        }
      } else if (a.step <= passes) {
        this.beamMat.opacity = 1;
        const k = Math.min(1, a.t / dur);
        const ang = a.from + (a.to - a.from) * k;
        this.setBeam(ang);
        this.torsoTwist = -ang * 0.6;
        // did the beam pass the player this frame?
        const pa = wrap(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z) - this.yaw);
        const lo = Math.min(a.prev, ang), hi = Math.max(a.prev, ang);
        if (!a.hit && pa >= lo && pa <= hi && dist < 14.8 && player.pos.y < this.floorY + 1.15) {
          a.hit = true;
          player.damage(28, 'sweep');
          player.launch(6, _v.set(Math.sin(this.yaw + ang - Math.sign(a.to - a.from) * 1.2) * 8, 0, Math.cos(this.yaw + ang - Math.sign(a.to - a.from) * 1.2) * 8));
        }
        a.prev = ang;
        if (k >= 1) {
          a.step++;
          a.t = 0;
          a.hit = false;
          [a.from, a.to] = [a.to, a.from];
          a.prev = a.from;
          if (a.step <= passes) audio.sweep();
        }
      } else {
        this.beam.visible = false;
        this.torsoTwist *= 0.9;
        if (a.t > 0.6) this.endAttack();
      }
    } else if (a.type === 'slam') {
      const wind = p === 3 ? 0.6 : 0.8;
      if (a.step === 0) {
        this.yaw += wrap(targetYaw - this.yaw) * Math.min(1, dt * 3);
        if (a.t > wind) {
          a.step = 1;
          a.t = 0;
          const at = this.pos.clone();
          at.x += Math.sin(this.yaw) * 4;
          at.z += Math.cos(this.yaw) * 4;
          this.spawnRing(at, true);
          audio.slam();
          player.shake = 0.6;
          this.world.fx.burst(at.clone().setY(this.floorY + 0.2), 0xff4060, { count: 60, speed: 10, life: 0.6, size: 0.4, gravity: 6 });
        }
      } else {
        if (p >= 2 && a.step === 1 && a.t > 0.45) {
          a.step = 2;
          this.spawnRing(this.pos.clone(), true);
          audio.slam();
        }
        if (a.t > 0.9) this.endAttack();
      }
    } else if (a.type === 'volley') {
      const count = [0, 3, 5, 7][p];
      this.yaw += wrap(targetYaw - this.yaw) * Math.min(1, dt * 3);
      if (a.t > 0.5 && a.fired < count && a.t > 0.5 + a.fired * 0.16) {
        a.fired++;
        const origin = this.head.getWorldPosition(new THREE.Vector3());
        origin.y += 0.7;
        _w.copy(player.pos);
        _w.y += 1.2;
        const dir = _v.subVectors(_w, origin).normalize();
        dir.x += (Math.random() - 0.5) * 0.6;
        dir.y += 0.25 + Math.random() * 0.3;
        dir.z += (Math.random() - 0.5) * 0.6;
        dir.normalize();
        const speed = [0, 8, 9.5, 11][p];
        new Orb(this.world, origin, dir.multiplyScalar(speed), rand(4), { damage: 12, homing: 1.3, life: 7, radius: 0.42 });
        audio.enemyShoot();
      }
      if (a.t > 0.5 + count * 0.16 + 0.6) this.endAttack();
    } else if (a.type === 'charge') {
      if (a.step === 0) {
        this.yaw += wrap(targetYaw - this.yaw) * Math.min(1, dt * 5);
        if (a.t > 0.7) {
          a.step = 1;
          a.t = 0;
          a.dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          audio.sweep();
        }
      } else if (a.step === 1) {
        const sp = 19;
        this.pos.addScaledVector(a.dir, sp * dt);
        if (!a.hit && dist < 3.2 && player.pos.y < this.floorY + 4) {
          a.hit = true;
          player.damage(25, 'charge');
          player.launch(7, _v.copy(a.dir).multiplyScalar(14));
        }
        const atEdge = this.pos.x <= this.bounds.minX || this.pos.x >= this.bounds.maxX || this.pos.z <= this.bounds.minZ || this.pos.z >= this.bounds.maxZ;
        if (a.t > 1.1 || atEdge) {
          a.step = 2;
          a.t = 0;
          if (atEdge) {
            player.shake = 0.5;
            audio.slam();
          }
        }
      } else if (a.t > 1.0) this.endAttack();
    }
  }

  endAttack() {
    this.attack = null;
    this.beam.visible = false;
    this.attackTimer = [0, 2.6, 2.0, 1.4][this.phase] + Math.random() * 0.8;
  }

  setBeam(rel) {
    this.beam.position.set(this.pos.x, this.floorY + 0.75, this.pos.z);
    this.beam.rotation.y = this.yaw + rel;
  }

  spawnRing(pos, harmful) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.22, 6, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(harmful ? 0xff4060 : 0xd9c8ff).multiplyScalar(2.2), transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(pos.x, this.floorY + 0.3, pos.z);
    this.world.scene.add(mesh);
    this.rings.push({ mesh, r: 1, harmful, hit: false, center: pos.clone() });
  }

  updateRings(dt, player) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.r += dt * 13;
      ring.mesh.scale.set(ring.r, ring.r, 1 + ring.r * 0.04);
      ring.mesh.material.opacity = Math.max(0, 1 - ring.r / 34);
      if (ring.harmful && !ring.hit) {
        const d = Math.hypot(player.pos.x - ring.center.x, player.pos.z - ring.center.z);
        if (Math.abs(d - ring.r) < 0.8 && player.pos.y < this.floorY + 0.55) {
          ring.hit = true;
          player.damage(20, 'ring');
          player.launch(7, null);
        }
      }
      if (ring.r > 34) {
        this.world.scene.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        ring.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  pushPlayer(player) {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const R = 1.9;
    if (d < R && player.pos.y < this.pos.y + 6.5 && d > 0.001) {
      player.pos.x = this.pos.x + (dx / d) * R;
      player.pos.z = this.pos.z + (dz / d) * R;
    }
  }

  // ------------------------------------------------------------------ animation
  animate(dt, moving) {
    const L = this.limbs;
    const k = Math.min(1, dt * 8);
    const lerp = (obj, axis, v) => (obj.rotation[axis] += (v - obj.rotation[axis]) * k);
    if (moving) this.walkPhase += dt * [0, 3.2, 3.8, 4.4][this.phase];
    const sw = moving ? Math.sin(this.walkPhase) : 0;
    const a = this.attack;
    let dip = 0;
    // legs
    if (this.kneel > 0 || this.state === 'dying') {
      lerp(L.legL.thigh, 'x', -1.5);
      lerp(L.legL.knee, 'x', 1.6);
      lerp(L.legR.thigh, 'x', -0.2);
      lerp(L.legR.knee, 'x', 1.5);
      dip = -1.4;
    } else {
      lerp(L.legL.thigh, 'x', sw * 0.45);
      lerp(L.legR.thigh, 'x', -sw * 0.45);
      lerp(L.legL.knee, 'x', Math.max(0, -sw) * 0.6);
      lerp(L.legR.knee, 'x', Math.max(0, sw) * 0.6);
    }
    // arms: left holds the shield forward, right carries the sword
    let rArmX = -0.5, rElbow = -0.5, rArmZ = 0, lArmX = -1.2, lElbow = -0.7, lean = 0, headX = 0;
    if (a?.type === 'sweep') {
      rArmX = -1.45;
      rElbow = -0.1;
      rArmZ = -0.3;
      dip = -0.7;
    } else if (a?.type === 'slam') {
      rArmX = a.step === 0 ? -3.0 : -1.0;
      rElbow = a.step === 0 ? -0.3 : 0;
      dip = a.step === 0 ? 0 : -0.8;
      lean = a.step === 0 ? -0.15 : 0.35;
    } else if (a?.type === 'volley') {
      headX = -0.35;
    } else if (a?.type === 'charge') {
      lean = a.step === 0 ? 0.15 : 0.4;
      lArmX = -1.5;
      dip = a.step === 0 ? -0.6 : -0.2;
    }
    if (this.stagger > 0) {
      lean = -0.25;
      headX = 0.3;
    }
    lerp(L.armR.shoulder, 'x', rArmX + sw * 0.15);
    lerp(L.armR.shoulder, 'z', rArmZ);
    lerp(L.armR.elbow, 'x', rElbow);
    lerp(L.armL.shoulder, 'x', L.armL.broken ? 0.1 : lArmX - sw * 0.1);
    lerp(L.armL.elbow, 'x', L.armL.broken ? -0.1 : lElbow);
    lerp(this.torso, 'x', lean);
    this.torsoTwist *= a?.type === 'sweep' ? 1 : 0.92;
    lerp(this.torso, 'y', this.torsoTwist);
    lerp(this.head, 'x', headX);
    this.dipY += (dip - this.dipY) * k;
    this.hips.position.y = 3.2 + this.dipY + (moving ? Math.abs(Math.cos(this.walkPhase)) * 0.12 : 0);
    if (moving && Math.abs(Math.sin(this.walkPhase)) > 0.98 && !this._stepped) {
      this._stepped = true;
      audio.bossStep();
      this.game.player.shake = Math.max(this.game.player.shake, 0.12);
    } else if (Math.abs(Math.sin(this.walkPhase)) < 0.9) this._stepped = false;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.bar.position.y = 9.0 + this.dipY;
  }

  updateBar() {
    if (!this.barDirty) return;
    this.barDirty = false;
    const g = this.barCanvas.getContext('2d');
    const W = 512, H = 64;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(0, 14, W, 36);
    const frac = this.hp / MAX_HP;
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#ff3344');
    grad.addColorStop(0.33, '#ffd23a');
    grad.addColorStop(0.66, '#3dff7a');
    grad.addColorStop(1, '#3a8bff');
    g.fillStyle = grad;
    g.fillRect(4, 18, (W - 8) * frac, 28);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.strokeRect(2, 16, W - 4, 32);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (const m of [0.33, 0.66]) g.fillRect(W * m, 16, 3, 32);
    this.barTex.needsUpdate = true;
    this.game.hud.bossBar(frac);
  }

  updateDeath(dt) {
    this.deathT += dt;
    const T = this.deathT;
    this.updateRings(dt, this.game.player);
    if (Math.random() < dt * 14) {
      const p = this.root.position.clone();
      p.x += (Math.random() - 0.5) * 4;
      p.y += 1 + Math.random() * 6;
      p.z += (Math.random() - 0.5) * 4;
      this.world.fx.burst(p, COLORS[rand(4)].hex, { count: 40, speed: 8, life: 0.8, size: 0.45, gravity: 4 });
      audio.explode();
      this.game.player.shake = Math.max(this.game.player.shake, 0.3);
    }
    this.animate(dt, false);
    if (T > 2.5) this.root.rotation.x = Math.min(Math.PI / 2.2, (T - 2.5) * 1.2);
    if (T > 4.2 && this.state === 'dying') {
      this.state = 'dead';
      const p = this.root.position.clone().setY(this.floorY + 2);
      for (let i = 0; i < 4; i++) this.world.fx.burst(p, COLORS[i].hex, { count: 150, speed: 16, life: 1.6, size: 0.6, gravity: 3 });
      audio.explode(true);
      this.game.player.shake = 1;
      this.root.visible = false;
      this.coreLight.intensity = 0;
      this.world.removeHittable(this.root);
      this.game.onBossDefeated();
    }
  }
}

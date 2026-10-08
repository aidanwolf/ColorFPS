// THE PRISM WARDEN — a ~7 m armored humanoid with a breakable color-shifting shield, a color-shifting core,
// color-armored limbs (each with a crippling effect when broken) and a laser sword.
// The final battle is fought in stages (see levels/finale): the Prism Core, then echoes of each world the
// Warden drags you through, then the machine's heart. One long health bar is split into a chunk per stage;
// each stage sets the Warden's form, which of its parts take which colors, its attacks (the shared ones
// below plus the stage's own "specials") and its arena. Clearing a chunk hands over to the stage director
// (onStageClear) for the warp; dying past the first stage restarts only that stage (restartStage).
import * as THREE from 'three';
import { COLORS } from './colors.js';
import { audio } from './audio.js';
import { Orb } from './entities/drone.js';
import { director } from './combat/director.js';
import { critHit, PainVoice, Malfunction, WeakMarker, prefetchFeel, play } from './bossFeel.js';

const ALL = [0, 1, 2, 3];
const RING_H = 0.45; // shockwave wall height (m)
const RING_SPEED = 11; // m/s
const BLADE_LEN = 5.6; // laser sword blade (m)
const BLADE_GROW = 2.8; // the blade extends to ~16 m for the sweep
const LIMB_DEFS = {
  head: { armor: 6, broken: 'head' },
  armL: { armor: 8 },
  armR: { armor: 8 },
  legL: { armor: 8 },
  legR: { armor: 8 },
};
const LIMB_REGEN = 12;
// how long the Warden holds the combat director's attack token per attack (its wind-up and the blow);
// specials hold it for their own `hold` (default 2.5 s)
const TOKEN_HOLD = { sweep: 2.4, slam: 2.4, volley: 2, charge: 3 };
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Color();

const rand = (n) => Math.floor(Math.random() * n);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// A stage's defaults (the Prism Core stage is built from these plus the constructor's arena).
// palettes: the colors a part may take (it shifts among them); an empty palette makes it immune.
// cover: the core sits behind chest plates that only open while the Warden kneels or vents (vent()).
const STAGE_DEFAULTS = {
  key: 'prism',
  name: 'THE PRISM WARDEN',
  hp: 1400,
  tier: 1, // speed and aggression of the shared attacks: 1, 2 or 3
  shield: true,
  shieldPalette: ALL,
  shieldRegen: 2.5, // seconds without a chip before tiles regrow
  shieldDown: 7.5,
  limbPalette: ALL,
  corePalette: ALL,
  torsoPalette: ALL,
  orbPalette: ALL,
  cover: false,
  armor: 1, // limb armor multiplier
  dmg: { core: 26, hole: 14, kneel: 38, vent: 26, limb: 6, head: 10, broken: 7, torso: 4 },
  attacks: { sweep: 2, slam: 1, volley: 2, charge: 0 },
  specials: {},
  walk: true,
  form: 'prism',
  blade: 0xff4060,
  ring: 0xff4060,
  introHint: 'Shoot its shield in the shield\'s color to break it apart, then hit the core!',
};

export class Boss {
  constructor(world, game, { pos, bounds, floorY }) {
    this.world = world;
    this.game = game;
    this.root = new THREE.Group();
    this.root.visible = false;
    world.scene.add(this.root);
    this.rings = [];
    this.build();
    // pain (a crystalline mechanical howl), joints shorting out while it kneels or reels, a target on the
    // open core
    this.pain = new PainVoice(world, { name: 'warden_pain', fallback: 'boss_roar', rate: 1.35, gain: 0.55, big: 'warden_pain_big', bigFallback: 'boss_roar', bigRate: 0.9, gap: 1.5 });
    const L = this.limbs;
    this.joints = [L.armL.shoulder, L.armR.shoulder, L.armL.elbow, L.armR.elbow, L.legL.knee, L.legR.knee, L.legL.thigh, L.legR.thigh, this.head];
    this.malfunction = new Malfunction(game, this.joints, { scale: 1.2, spark: 0xffe0a0, arc: 0xd0b8ff, rate: 12 });
    this.coreMarker = new WeakMarker(world, game, { color: 0xffffff, size: 1.0 });
    prefetchFeel(['warden_pain', 'warden_pain_big']);
    this.setStages([]);
    // the Prism Core arena (stage I) comes from the level; later stages bring their own
    Object.assign(this.stages[0], { spawn: new THREE.Vector3(...pos), bounds, floorY });
    this.resetState();
    world.add(this);
  }

  // ------------------------------------------------------------------ stages
  // stages: the stages after the Prism Core, in order (levels/finale builds them).
  setStages(list) {
    const first = this.stages?.[0] || { ...STAGE_DEFAULTS };
    this.stages = [first, ...list.map((s) => ({ ...STAGE_DEFAULTS, ...s, dmg: { ...STAGE_DEFAULTS.dmg, ...(s.dmg || {}) } }))];
    // hp counts down through every stage: stage i spans (hpAt[i + 1], hpAt[i]]
    this.hpAt = [];
    let sum = 0;
    for (let i = this.stages.length - 1; i >= 0; i--) {
      sum += this.stages[i].hp;
      this.hpAt[i] = sum;
    }
    this.hpAt[this.stages.length] = 0;
    this.maxHp = sum;
    this.barTicks = null;
  }

  get stage() {
    return this.stages[this.stageIdx];
  }

  // ------------------------------------------------------------------ construction
  build() {
    this.metalMat = new THREE.MeshStandardMaterial({ color: 0x2b2a35, metalness: 0.85, roughness: 0.35, emissive: 0x000000 });
    const metal = this.metalMat;
    const dark = new THREE.MeshStandardMaterial({ color: 0x15151c, metalness: 0.6, roughness: 0.6 });
    this.darkMat = dark;
    this.exposedMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.veinMat = new THREE.MeshBasicMaterial({ color: 0xb890ff });
    const box = (w, h, d, m, x = 0, y = 0, z = 0, parent) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    this.box = box;
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
      box(0.06, 1.4, 0.06, this.veinMat, side * 0.45, -0.8, 0.3, thigh);
      const knee = new THREE.Group();
      knee.position.y = -1.6;
      thigh.add(knee);
      box(0.75, 1.5, 0.75, dark, 0, -0.75, 0, knee);
      l.plates.push(box(0.85, 0.9, 0.25, l.mat, 0, -0.7, 0.42, knee));
      box(1.0, 0.3, 1.5, metal, 0, -1.45, 0.25, knee);
      box(0.06, 1.2, 0.06, this.veinMat, side * 0.4, -0.7, 0.2, knee);
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
    for (const s of [-1, 1]) box(0.07, 1.9, 0.07, this.veinMat, s * 1.47, 1.2, 0.6, this.torso);
    box(2.4, 0.07, 0.07, this.veinMat, 0, 0.12, 0.86, this.torso);
    // core
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), this.coreMat);
    this.core.position.set(0, 1.05, 0.85);
    tag(this.core, 'core');
    this.torso.add(this.core);
    this.coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 8, 24), dark);
    this.coreRing.position.copy(this.core.position);
    this.torso.add(this.coreRing);
    // chest plates that close over the core in the stages where it must be opened (stage.cover)
    this.cover = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.42, 1.05, 1.08);
      this.torso.add(g);
      tag(g, 'cover');
      box(0.86, 1.5, 0.22, metal, 0, 0, 0, g);
      box(0.06, 1.3, 0.05, this.veinMat, -s * 0.38, 0, 0.12, g);
      g.userData.side = s;
      this.cover.push(g);
    }
    this.coverOpen = 1;
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
      box(0.06, 1.2, 0.06, this.veinMat, side * 0.37, -0.7, 0, elbow);
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
    // the blade grows from the hilt (geometry starts at its origin) so it can extend into the giant sweep
    this.blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, BLADE_LEN).translate(0, 0, BLADE_LEN / 2), this.bladeMat);
    this.blade.position.z = 0.4;
    this.sword.add(this.blade);
    this.blade.userData.hit = this;
    this.blade.userData.part = 'sword';

    // shield — held out in front of the chest by the left arm
    this.shieldGroup = new THREE.Group();
    this.shieldGroup.position.set(0.35, 1.05, 1.75);
    this.torso.add(this.shieldGroup);
    tag(this.shieldGroup, 'shield');
    // the shield is a grid of armor tiles: every hit in its color knocks out the tiles around the impact
    this.shieldMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.2 });
    const COLS = 6, ROWS = 7, W = 3.1, H = 3.4, tw = W / COLS, th = H / ROWS;
    const tileGeo = new THREE.BoxGeometry(tw - 0.04, th - 0.04, 0.3);
    this.tiles = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = new THREE.Mesh(tileGeo, this.shieldMat);
        tile.position.set(-W / 2 + tw * (c + 0.5), -H / 2 + th * (r + 0.5), 0);
        tile.userData.tile = this.tiles.length;
        this.shieldGroup.add(tile);
        this.tiles.push(tile);
      }
    }
    // a frame only (no backing plate), so knocked-out tiles open real holes onto the core
    for (const [w, h, x, y] of [[3.4, 0.16, 0, 1.78], [3.4, 0.16, 0, -1.78], [0.16, 3.7, 1.63, 0], [0.16, 3.7, -1.63, 0]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.36), dark);
      bar.position.set(x, y, -0.02);
      this.shieldGroup.add(bar);
    }

    this.buildForms();

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

  // Each world's echo of the Warden wears that world: molten seams in the Forge, a halo of mirrors under
  // the sun, vines and blooms in the Overgrowth, ice in the Deep, every color in the Heart.
  buildForms() {
    const glow = (hex, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
    const noHit = (o) => {
      o.traverse((m) => (m.raycast = () => {})); // decoration never blocks a shot at the plates under it
      return o;
    };
    this.forms = {};
    // forge: glowing magma drips down the shoulders and back, slag crust on the forearms
    const forge = new THREE.Group();
    const magma = glow(0xff6a1a, 2.4);
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 1.85, 2.1, 0);
      this.torso.add(sh);
      for (let i = 0; i < 3; i++) this.box(0.12, 0.5 + i * 0.25, 0.12, magma, s * (0.1 + i * 0.22), -0.05 - i * 0.1, -0.4 + i * 0.3, sh);
      forge.userData.parts = [...(forge.userData.parts || []), sh];
    }
    for (let i = 0; i < 4; i++) this.box(0.1, 0.9, 0.08, magma, -0.9 + i * 0.6, 1.2, -1.12, this.torso);
    forge.userData.parts.push(...this.torso.children.slice(-4));
    this.forms.forge = noHit(forge);
    // solar: a ring of mirror panels fanned behind the head (it turns slowly)
    this.halo = new THREE.Group();
    this.halo.position.set(0, 3.1, -0.9);
    this.torso.add(this.halo);
    const panel = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb02a, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.15 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, p = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.2, 0.06), panel);
      p.position.set(Math.cos(a) * 1.7, Math.sin(a) * 1.7, 0);
      p.rotation.z = a - Math.PI / 2;
      this.halo.add(p);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.06, 6, 48), glow(0xffd23a, 2.2));
    this.halo.add(ring);
    this.forms.solar = noHit(this.halo);
    // verdant: vines wound round the limbs and torso, leaves sprouting
    const vine = new THREE.MeshStandardMaterial({ color: 0x2e6b2a, roughness: 0.9 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x4fb03c, emissive: 0x1a5a12, emissiveIntensity: 0.6, roughness: 0.8, side: THREE.DoubleSide });
    const verdant = [];
    const wind = (parent, r, y, n = 2) => {
      for (let i = 0; i < n; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 5, 14), vine);
        t.position.y = y - i * 0.45;
        t.rotation.set(Math.PI / 2 + (i % 2 ? 0.35 : -0.35), 0, 0);
        parent.add(t);
        verdant.push(t);
        const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.22), leaf);
        lf.position.set(r + 0.05, y - i * 0.45, 0.1);
        lf.rotation.set(0.4, 0.8, 0.3);
        parent.add(lf);
        verdant.push(lf);
      }
    };
    for (const n of ['legL', 'legR']) wind(this.limbs[n].knee, 0.5, -0.4);
    for (const n of ['armL', 'armR']) wind(this.limbs[n].elbow, 0.48, -0.3);
    wind(this.torso, 1.25, 1.9, 3);
    this.forms.verdant = verdant.map(noHit);
    // deep: ice crystals growing from the shoulders, back and crest
    const ice = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x2a8cff, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.1, flatShading: true, transparent: true, opacity: 0.9 });
    const deep = [];
    const crystal = (parent, x, y, z, s, rx, rz) => {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), ice);
      c.scale.set(s * 0.35, s, s * 0.35);
      c.position.set(x, y, z);
      c.rotation.set(rx, 0, rz);
      parent.add(c);
      deep.push(c);
    };
    for (const s of [-1, 1]) {
      crystal(this.limbs[s < 0 ? 'armR' : 'armL'].shoulder, s * 0.3, 0.9, -0.1, 0.8, 0.2, -s * 0.5);
      crystal(this.limbs[s < 0 ? 'armR' : 'armL'].shoulder, s * 0.6, 0.6, 0.25, 0.55, -0.3, -s * 0.9);
      crystal(this.torso, s * 0.7, 2.4, -1.0, 0.9, -0.6, s * 0.3);
    }
    crystal(this.torso, 0, 2.2, -1.1, 1.2, -0.7, 0);
    crystal(this.head, 0, 1.6, -0.3, 0.6, -0.4, 0);
    this.forms.deep = deep.map(noHit);
    // heart: four color crystals on the back, a crown of light
    const heart = [];
    ALL.forEach((c, i) => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), glow(COLORS[c].hex, 1.8));
      m.scale.set(0.3, 1.0, 0.3);
      m.position.set(-1.05 + i * 0.7, 2.9, -1.0);
      m.rotation.x = -0.4;
      this.torso.add(m);
      heart.push(m);
    });
    this.forms.heart = heart.map(noHit);
    this.setForm('prism');
  }

  setForm(key) {
    this.form = key;
    const show = (list, on) => {
      const items = Array.isArray(list) ? list : list.userData?.parts ? [list, ...list.userData.parts] : [list];
      for (const o of items) o.visible = on;
    };
    for (const [k, v] of Object.entries(this.forms)) show(v, k === key);
    // hide the forge parts (they live under the torso/shoulders, the group itself is empty)
    for (const p of this.forms.forge.userData.parts) p.visible = key === 'forge';
    const F = {
      prism: { vein: 0xb890ff, metal: 0x2b2a35, emissive: 0x000000, ei: 0 },
      forge: { vein: 0xff6a1a, metal: 0x2a1a16, emissive: 0xff3a0a, ei: 0.18 },
      solar: { vein: 0xffd23a, metal: 0x4a3c28, emissive: 0x6a4a10, ei: 0.25 },
      verdant: { vein: 0x5dff6a, metal: 0x24302a, emissive: 0x0a2a10, ei: 0.3 },
      deep: { vein: 0x6ad8ff, metal: 0x1e2c40, emissive: 0x0a2a5a, ei: 0.35 },
      heart: { vein: 0xffffff, metal: 0x24222e, emissive: 0x2a1a40, ei: 0.3 },
    }[key] || {};
    this.veinBase = new THREE.Color(F.vein ?? 0xb890ff);
    this.veinMat.color.copy(this.veinBase).multiplyScalar(2);
    this.metalMat.color.set(F.metal ?? 0x2b2a35);
    this.metalMat.emissive.set(F.emissive ?? 0);
    this.metalMat.emissiveIntensity = F.ei ?? 0;
  }

  resetState() {
    director.release(this);
    this.hideFeel();
    this.onReset?.();
    this.state = 'dormant';
    this.stateT = 0;
    this.stageIdx = 0;
    this.pendingStage = null;
    this.applyStage();
    this.hp = this.maxHp;
    this.root.visible = false;
    this.coreLight.intensity = 0;
    this.deathT = 0;
  }

  // Load the current stage's arena, form and rules, and put the Warden back to the stage's start.
  applyStage() {
    const st = this.stage;
    this.spawn = st.spawn.clone();
    this.bounds = st.bounds;
    this.floorY = st.floorY;
    this.ringY = st.ringY ?? st.floorY;
    this.phase = st.tier;
    this.setForm(st.form);
    this.bladeHex = st.blade;
    this.bladeMat.color.set(st.blade).multiplyScalar(2.2);
    this.pos = this.spawn.clone();
    this.yaw = st.yaw ?? Math.PI;
    this.walkPhase = 0;
    this.attackTimer = 2.5;
    this.attack = null;
    this.queued = null;
    this.kneel = 0;
    this.kneels = 0;
    this.stagger = 0;
    this.vented = 0;
    this.dipY = 0;
    this.torsoTwist = 0;
    for (const l of Object.values(this.limbs)) {
      l.maxArmor = Math.max(1, Math.round(LIMB_DEFS[l.name].armor * st.armor));
      l.armor = l.maxArmor;
      l.broken = false;
      l.timer = 0;
      l.plates.forEach((p) => (p.visible = true));
      this.setLimbColor(l, this.pick(st.limbPalette));
    }
    this.shield = { up: !!st.shield, color: 0, colorTimer: 0, idle: 0, regen: 0, down: 0, reform: 1 };
    this.shieldGroup.visible = !!st.shield;
    this.shieldGroup.scale.setScalar(1);
    if (st.shield) this.resetShield();
    this.coreColor = this.pick(st.corePalette);
    this.coreTimer = 0;
    this.torsoColor = this.pick(st.torsoPalette);
    this.torsoTimer = 4;
    if (this.torsoColor < 0) {
      // no color takes: the chest plates go dull
      this.torsoMat.color.set(0x3a302c);
      this.torsoMat.emissive.set(0x000000);
    }
    this.flash = 0;
    this.coreFlash = 0;
    this.coverOpen = st.cover ? 0 : 1;
    for (const g of this.cover) g.visible = !!st.cover;
    this.barDirty = true;
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.blade.scale.z = 1;
    this.clearRings();
    this.sword.visible = true;
    this.landT = undefined;
    this.roared = false;
    this.updateBossName();
  }

  clearRings() {
    for (const r of this.rings) this.disposeRing(r);
    this.rings = [];
  }

  // A color from a palette, different from `not` when there's a choice; -1 (immune) for an empty one.
  pick(pal, not = -2) {
    if (!pal.length) return -1;
    if (pal.length === 1) return pal[0];
    let c;
    do c = pal[rand(pal.length)];
    while (c === not);
    return c;
  }

  // ------------------------------------------------------------------ fight control
  // Wake up (walking into the Prism arena). stageIdx > 0 starts straight in that stage (dev starts).
  start(stageIdx = this.devStage ?? 0) {
    if (this.state !== 'dormant') return;
    this.devStage = null;
    this.stageIdx = Math.min(stageIdx, this.stages.length - 1);
    this.applyStage();
    this.hp = this.hpAt[this.stageIdx];
    this.root.visible = true;
    if (this.stageIdx > 0) {
      this.onEnterStage?.(this.stageIdx, { restart: false, dev: true });
      return this.arrive();
    }
    this.state = 'intro';
    this.stateT = 0;
    this.pos.copy(this.spawn);
    this.pos.y = this.floorY + 30;
    this.yaw = Math.atan2(this.game.player.pos.x - this.pos.x, this.game.player.pos.z - this.pos.z);
  }

  // Drop into the current stage's arena from the sky (after a warp or a stage restart).
  arrive(height = 22) {
    this.root.visible = true;
    this.state = 'intro';
    this.stateT = 0;
    this.pos.copy(this.spawn);
    this.introH = height;
    this.pos.y = this.floorY + height;
    this.landT = undefined;
    this.roared = false;
    const p = this.game.player.pos;
    this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  get active() {
    return this.state !== 'dormant' && this.state !== 'dead';
  }

  // The player died: past the first stage, the current stage starts over (its chunk of health back, the
  // arena reset) instead of the whole fight. Called from Game.respawn; false = do the full reset there.
  restartStage() {
    if (!this.active) return false;
    if (this.state === 'dying') return true; // nothing can kill you now; just stand back up
    const idx = this.pendingStage ?? this.stageIdx;
    if (idx === 0) return false;
    this.pendingStage = null;
    this.stageIdx = idx;
    this.applyStage();
    this.hp = this.hpAt[idx];
    this.barDirty = true;
    this.onEnterStage?.(idx, { restart: true });
    this.arrive(16);
    return true;
  }

  // Called by the stage director mid-warp, once the player has been moved into the next arena.
  enterStage(idx) {
    this.pendingStage = null;
    this.stageIdx = idx;
    this.applyStage();
    this.hp = this.hpAt[idx];
    this.barDirty = true;
    this.arrive();
  }

  setLimbColor(l, c) {
    l.color = c;
    if (c < 0) {
      // crusted over: dark, dull, immune
      l.mat.color.set(0x3a302c);
      l.mat.emissive.set(0x000000);
      return;
    }
    const col = new THREE.Color(COLORS[c].hex);
    l.mat.color.copy(col);
    l.mat.emissive.copy(col);
  }

  // all tiles back, fresh color
  resetShield() {
    for (const t of this.tiles) {
      t.visible = true;
      t.scale.setScalar(1);
    }
    this.shield.idle = 0;
    this.setShieldColor(this.pick(this.stage.shieldPalette, this.shield.color));
  }

  setShieldColor(c) {
    const s = this.shield;
    s.color = c;
    s.colorTimer = [0, 4, 3, 2.2][this.phase];
    const col = new THREE.Color(COLORS[c].hex);
    this.shieldMat.color.copy(col);
    this.shieldMat.emissive.copy(col);
    this.flash = 0.6;
  }

  tilesLeft() {
    return this.tiles.reduce((n, t) => n + (t.visible ? 1 : 0), 0);
  }

  // knock out every tile within reach of the impact
  chipShield(hit) {
    const center = hit.object?.userData.tile !== undefined ? this.tiles[hit.object.userData.tile].position : null;
    if (!center) return;
    const hex = COLORS[this.shield.color].hex;
    let broken = 0;
    for (const t of this.tiles) {
      if (!t.visible || t.position.distanceTo(center) > 0.62) continue;
      t.visible = false;
      broken++;
      this.world.fx.burst(t.getWorldPosition(new THREE.Vector3()), hex, { count: 14, speed: 7, life: 0.8, size: 0.28, gravity: 12 });
    }
    if (!broken) return;
    this.world.fx.burst(hit.point, 0xffffff, { count: 8, speed: 5, life: 0.3, size: 0.3, gravity: 4 });
    const left = this.tilesLeft() / this.tiles.length;
    audio.comboTick(Math.round((1 - left) * 6));
    audio.shatter();
    this.shield.idle = 0;
    if (left <= 0.35) this.breakShield();
  }

  shieldBlocked() {
    // the shield is forced down while the left arm is broken or the boss kneels
    return this.limbs.armL.broken || this.kneel > 0;
  }

  // Is the core open to shots? Behind the chest plates (cover stages) only while kneeling or venting.
  coreExposed() {
    return !this.stage.cover || this.coverOpen > 0.55;
  }

  // Open the chest plates for a while (a cover stage's big attacks leave the core venting afterwards).
  vent(secs, hint = 'Its core is open — hit it with its color!') {
    if (!this.stage.cover) return;
    this.vented = Math.max(this.vented, secs);
    if (hint) this.game.hud.bossHint(hint, true);
  }

  // ------------------------------------------------------------------ damage
  onHit(color, hit) {
    if (!this.active || this.state === 'intro' || this.state === 'dying' || this.state === 'warp') return 'immune';
    const part = hit.part;
    const D = this.stage.dmg;
    if (part === 'shield') {
      if (!this.shield.up) return 'immune';
      if (color === this.shield.color) {
        this.chipShield(hit);
        return 'hit';
      }
      this.flash = 1;
      return 'immune';
    }
    if (part === 'cover') return 'immune';
    if (part === 'core') {
      if (color !== this.coreColor || !this.coreExposed()) return 'immune';
      this.coreFlash = 1;
      audio.bossCoreHit();
      // shots through holes in the shield still count, for less
      const hex = COLORS[this.coreColor].hex;
      if (this.shield.up) {
        critHit(this.game, hit, { color: hex, scale: 0.8, gain: 0.7, shake: 0.2, pop: false });
        this.damage(D.hole);
      } else {
        const big = this.kneel > 0;
        critHit(this.game, hit, { color: hex, spark: 0xffffff, scale: big ? 1.5 : 1.2, shake: big ? 0.34 : 0.28 });
        this.pain.hurt(big ? 1.3 : 1);
        // it flinches: the torso jerks back, the head snaps up
        this.torso.rotation.x -= 0.1;
        this.head.rotation.x -= 0.25;
        this.damage(big ? D.kneel : this.stage.cover ? D.vent : D.core);
      }
      return 'hit';
    }
    if (part === 'torso') {
      if (color !== this.torsoColor) return 'immune';
      this.damage(D.torso);
      return 'hit';
    }
    const l = this.limbs[part];
    if (l) {
      if (l.broken) {
        this.damage(D.broken);
        return 'hit';
      }
      if (color !== l.color) return 'immune';
      l.armor--;
      l.flash = 1;
      this.damage(l.name === 'head' ? D.head : D.limb);
      if (l.armor <= 0) this.breakLimb(l);
      return 'hit';
    }
    return 'immune';
  }

  damage(n) {
    if (this.state === 'dying' || this.state === 'warp' || this.state === 'intro') return;
    const floor = this.hpAt[this.stageIdx + 1];
    this.hp = Math.max(floor, this.hp - n);
    this.barDirty = true;
    if (this.hp <= floor) {
      if (this.stageIdx >= this.stages.length - 1) this.die();
      else this.stageClear();
    }
  }

  // This stage's chunk is gone: the Warden staggers and reality breaks; the director warps us onward.
  stageClear() {
    this.cancelAttack();
    this.state = 'warp';
    this.hideFeel();
    this.stateT = 0;
    this.pendingStage = this.stageIdx + 1;
    this.kneel = 0;
    this.stagger = 0;
    this.clearRings();
    for (const pr of this.world.projectiles) pr.alive = false;
    audio.bossPhase();
    this.pain.roar();
    for (const j of this.joints) this.malfunction.sputter(j, 1.4);
    this.game.player.shake = 0.9;
    this.game.player.invuln = 99;
    audio.setIntensity(2);
    this.world.fx.burst(this.core.getWorldPosition(_v), 0xffffff, { count: 120, speed: 14, life: 1.2, size: 0.5, gravity: 2 });
    if (this.onStageClear) this.onStageClear(this.stageIdx, this.pendingStage);
    else this.enterStage(this.pendingStage);
  }

  breakShield() {
    const s = this.shield;
    s.up = false;
    s.down = this.phase === 3 ? 6 : this.stage.shieldDown;
    this.shieldGroup.visible = false;
    const p = this.shieldGroup.getWorldPosition(new THREE.Vector3());
    this.world.fx.burst(p, COLORS[s.color].hex, { count: 120, speed: 10, life: 1.1, size: 0.45, gravity: 8 });
    this.world.fx.burst(p, 0xffffff, { count: 40, speed: 6, life: 0.5, size: 0.5, gravity: 0 });
    audio.shieldBreak();
    this.pain.hurt(1.3);
    this.game.player.shake = 0.5;
    this.stagger = 1.0;
    this.game.hud.bossHint('SHIELD SHATTERED — hit the core with its color!', true);
  }

  breakLimb(l) {
    l.broken = true;
    l.timer = LIMB_REGEN;
    l.plates.forEach((p) => (p.visible = false));
    const p = (l.thigh || l.shoulder || this.head).getWorldPosition(new THREE.Vector3());
    this.world.fx.burst(p, COLORS[Math.max(0, l.color)].hex, { count: 70, speed: 8, life: 0.9, size: 0.4, gravity: 10 });
    audio.bossLimbBreak();
    for (const j of [l.thigh, l.knee, l.shoulder, l.elbow, l.name === 'head' ? this.head : null]) if (j) this.malfunction.sputter(j, 1.5);
    this.pain.hurt(1.4);
    const exposed = this.stage.shield ? 'its core is exposed!' : 'no more shield arm!';
    const msgs = {
      head: 'Visor cracked — the Warden is stunned!',
      armL: `Shield arm broken — ${exposed}`,
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
      this.kneel = this.stage.kneelTime ?? 6;
      this.cancelAttack();
      this.game.player.shake = 0.7;
      audio.slam();
      this.pain.roar();
      play('joint_sparks', 'energy_crackle', { gain: 0.9, rate: 0.8, vary: 0 });
      if (this.stage.cover) this.game.hud.bossHint('It kneels — its chest opens: hit the core!', true);
    }
  }

  restoreLimb(l) {
    l.broken = false;
    l.armor = l.maxArmor;
    this.setLimbColor(l, this.pick(this.stage.limbPalette, l.color));
    l.plates.forEach((p) => (p.visible = true));
    if (l.name === 'armR') this.sword.visible = true;
  }

  cancelAttack() {
    const a = this.attack;
    if (a?.special?.cancel) a.special.cancel(this, a);
    if (a) director.release(this);
    this.attack = null;
    this.attackTimer = 1.5;
    if (this.state === 'attack') this.state = 'walk';
  }

  die() {
    this.cancelAttack();
    if (this.shieldGroup.visible) {
      // the shield bursts first
      const p = this.shieldGroup.getWorldPosition(new THREE.Vector3());
      this.world.fx.burst(p, COLORS[Math.max(0, this.shield.color)].hex, { count: 120, speed: 10, life: 1.1, size: 0.45, gravity: 8 });
      this.shieldGroup.visible = false;
      this.shield.up = false;
    }
    this.state = 'dying';
    this.hideFeel();
    this.deathT = 0;
    this.clearRings();
    for (const pr of this.world.projectiles) pr.alive = false;
    this.game.player.invuln = 99;
    audio.bossRoar();
    this.game.onBossDying();
    this.onDying?.();
  }

  // Line the next attack up: it starts as soon as the Warden is free (the stage's timed events).
  queue(type) {
    this.queued = type;
    if (!this.attack) this.attackTimer = Math.min(this.attackTimer, 0.3);
  }

  // ------------------------------------------------------------------ update
  update(dt, player) {
    if (this.state === 'dormant' || this.state === 'dead') return;
    this.stateT += dt;
    const t = this.world.time;
    if (this.state !== 'walk' && this.state !== 'attack') this.malfunction.update(dt, false); // (let any arcs die out)

    if (this.state === 'intro') return this.updateIntro(dt, player);
    if (this.state === 'dying') return this.updateDeath(dt);
    if (this.state === 'warp') return this.updateWarp(dt);
    const st = this.stage;

    // ---- timers ----
    for (const l of Object.values(this.limbs)) {
      l.flash = Math.max(0, l.flash - dt * 6);
      l.mat.emissiveIntensity = l.color < 0 ? 0 : 0.6 + l.flash * 2.5;
      if (l.broken) {
        l.timer -= dt;
        if (l.timer <= 0) this.restoreLimb(l);
      }
    }
    const pulse = 1.5 + Math.sin(t * 14) * 1.2;
    this.exposedMat.color.setRGB(pulse, pulse, pulse);
    const s = this.shield;
    if (st.shield) {
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
          this.resetShield();
          this.game.hud.bossHint('Shield restored — chip it away with its color!', false);
        }
      } else {
        // the shield shifts color on a timer, and regrows tiles if you stop chipping at it
        s.colorTimer -= dt;
        if (s.colorTimer <= 0 && st.shieldPalette.length > 1) this.setShieldColor(this.pick(st.shieldPalette, s.color));
        s.idle += dt;
        if (s.idle > st.shieldRegen) {
          s.regen -= dt;
          if (s.regen <= 0) {
            s.regen = 0.35;
            const gone = this.tiles.filter((tl) => !tl.visible);
            if (gone.length) {
              const tl = gone[rand(gone.length)];
              tl.visible = true;
              tl.scale.setScalar(0.2);
            }
          }
        }
        for (const tl of this.tiles) if (tl.visible && tl.scale.x < 1) tl.scale.setScalar(Math.min(1, tl.scale.x + dt * 5));
      }
      if (s.reform < 1) {
        s.reform = Math.min(1, s.reform + dt * 4);
        this.shieldGroup.scale.setScalar(s.reform);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.shieldMat.emissiveIntensity = 0.35 + this.flash * 2 + Math.sin(t * 6) * 0.08;

    // chest plates: open while kneeling or venting (or while an attack holds them open)
    this.vented = Math.max(0, this.vented - dt);
    if (st.cover) {
      const want = this.kneel > 0 || this.vented > 0 || this.attack?.openCore ? 1 : 0;
      this.coverOpen += (want - this.coverOpen) * Math.min(1, dt * 7);
      for (const g of this.cover) {
        const sd = g.userData.side;
        g.position.x = sd * (0.42 + this.coverOpen * 0.75);
        g.rotation.y = sd * this.coverOpen * 0.9;
      }
    }

    this.coreTimer -= dt;
    if (this.coreTimer <= 0) {
      this.coreTimer = [0, 1.6, 1.25, 0.95][this.phase];
      this.coreColor = this.pick(st.corePalette, this.coreColor);
    }
    this.coreFlash = Math.max(0, this.coreFlash - dt * 6);
    const cc = _c.set(COLORS[this.coreColor].hex);
    const lit = this.coreExposed() ? 1 : 0.25;
    this.coreMat.color.copy(cc).multiplyScalar((2.2 + this.coreFlash * 3) * lit);
    this.coreLight.color.copy(cc);
    this.coreLight.intensity = (s.up || !this.coreExposed() ? 4 : 14) * lit;
    this.coreLightAnchor.getWorldPosition(this.coreLight.position);
    this.torsoTimer -= dt;
    if (this.torsoTimer <= 0) {
      this.torsoTimer = 4;
      this.torsoColor = this.pick(st.torsoPalette, this.torsoColor);
    }
    if (this.torsoColor >= 0) {
      const tc = _c.set(COLORS[this.torsoColor].hex);
      this.torsoMat.color.copy(tc);
      this.torsoMat.emissive.copy(tc);
    }
    this.updateForm(dt, t);

    // ---- behavior ----
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(dx, dz);
    let moving = false;

    if (this.kneel > 0) {
      this.kneel -= dt;
      if (this.kneel <= 0) {
        // stand back up with fresh leg armor
        // stand back up with fresh leg armor, thicker each time it has been dropped this stage
        this.kneels++;
        this.restoreLimb(this.limbs.legL);
        this.restoreLimb(this.limbs.legR);
        for (const l of [this.limbs.legL, this.limbs.legR]) l.armor = Math.round(l.maxArmor * (1 + 0.6 * this.kneels));
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
      if (st.walk && dist > 7) {
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
    this.updateFeel(dt);
    this.updateBar();
  }

  // kneeling or reeling: its joints short out in sparks and arcs (broken limbs keep sputtering);
  // the open core wears a target
  updateFeel(dt) {
    const fight = this.state === 'walk' || this.state === 'attack';
    const down = fight && this.kneel > 0 ? 1 : fight && this.stagger > 0 ? 0.7 : 0;
    this.malfunction.update(dt, down > 0, down);
    if (fight) for (const l of Object.values(this.limbs)) if (l.broken && Math.random() < dt * 2.5) this.malfunction.sputter(l.knee || l.elbow || this.head, 0.6);
    // (every stage guards it with a shield or chest plates: open = the plates apart, the shield down)
    const open = fight && this.coreExposed() && !(this.stage.shield && this.shield.up);
    if (open) this.coreMarker.tint(COLORS[Math.max(0, this.coreColor)].hex);
    this.coreMarker.update(dt, open ? this.core.getWorldPosition(_v) : null, this.kneel > 0 ? 1.6 : 1);
  }

  hideFeel() {
    this.malfunction?.update(1, false);
    this.coreMarker?.update(1, null);
  }

  // the stage form's own motion: the halo turns, the heart's veins cycle through every color
  updateForm(dt, t) {
    if (this.form === 'solar') this.halo.rotation.z += dt * 0.6;
    if (this.form === 'heart') this.veinMat.color.setHSL((t * 0.25) % 1, 1, 0.6).multiplyScalar(2);
    else this.veinMat.color.copy(this.veinBase).multiplyScalar(1.7 + Math.sin(t * 3) * 0.4);
    if (this.form === 'forge' && Math.random() < dt * 10) {
      // molten drips fall from its shoulders
      const sh = this.limbs[Math.random() < 0.5 ? 'armL' : 'armR'].shoulder.getWorldPosition(_v);
      this.world.fx.ember(sh, (Math.random() - 0.5) * 1.5, -1 - Math.random() * 2, (Math.random() - 0.5) * 1.5, 0xff7a1a, 0.9, 0.14);
    }
  }

  updateIntro(dt, player) {
    const T = this.stateT;
    const H = this.introH ?? 30;
    if (this.pos.y > this.floorY) {
      this.pos.y = Math.max(this.floorY, this.floorY + H - T * T * 22);
      if (this.pos.y === this.floorY) {
        audio.bossLand();
        player.shake = 1;
        this.spawnRing(this.pos.clone(), false);
        this.world.fx.burst(this.pos.clone().setY(this.ringY + 0.3), this.veinBase.getHex(), { count: 120, speed: 12, life: 1, size: 0.5, gravity: 4 });
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
    if (this.landT !== undefined && T - this.landT > (this.stageIdx ? 1.6 : 2.4)) {
      this.state = 'walk';
      this.attackTimer = 1.5;
      this.game.hud.bossHint(this.stage.introHint, false);
      this.onFightOn?.(this.stageIdx);
    }
  }

  // Between stages: the Warden reels while reality breaks around it (the director runs the warp).
  updateWarp(dt) {
    const T = this.stateT;
    this.stagger = 1;
    this.coreLightAnchor.getWorldPosition(this.coreLight.position);
    this.coreLight.intensity = 10 + Math.sin(T * 40) * 6;
    if (Math.random() < dt * 18) {
      const p = this.root.position.clone();
      p.x += (Math.random() - 0.5) * 4;
      p.y += 1 + Math.random() * 6;
      p.z += (Math.random() - 0.5) * 4;
      this.world.fx.burst(p, COLORS[rand(4)].hex, { count: 16, speed: 6, life: 0.6, size: 0.35, gravity: 2, mode: 'shard' });
    }
    this.animate(dt, false);
    this.root.rotation.y = this.yaw + Math.sin(T * 30) * 0.03 * Math.min(1, T);
  }

  chooseAttack(dist) {
    const st = this.stage;
    // ask the combat director first (it rations attacks among everything fighting you); retry shortly
    if (!director.request(this, 0.5)) {
      this.attackTimer = 0.25 + Math.random() * 0.25;
      return;
    }
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      if (st.specials[q]) return this.beginAttack(q);
    }
    const w = typeof st.attacks === 'function' ? st.attacks(this, dist) : st.attacks;
    const opts = [];
    const add = (k, n = 0) => {
      for (let i = 0; i < n; i++) opts.push(k);
    };
    const swordOk = !this.limbs.armR.broken;
    const headOk = !this.limbs.head.broken;
    if (swordOk && dist < 14) add('sweep', w.sweep);
    if (swordOk) add('slam', w.slam);
    if (headOk) add('volley', w.volley);
    if (st.walk && dist > 10) add('charge', w.charge);
    for (const [k, sp] of Object.entries(st.specials)) if (!sp.ok || sp.ok(this, dist)) add(k, w[k] ?? sp.weight ?? 0);
    if (!opts.length) {
      this.attackTimer = 1;
      return;
    }
    // don't repeat a special back to back if anything else is on offer
    let type = opts[rand(opts.length)];
    if (type === this.lastAttack && st.specials[type] && opts.some((o) => o !== type)) type = opts.filter((o) => o !== type)[rand(opts.filter((o) => o !== type).length)];
    this.beginAttack(type);
  }

  beginAttack(type) {
    this.lastAttack = type;
    const sp = this.stage.specials[type];
    director.release(this);
    director.request(this, sp ? sp.hold ?? 2.5 : TOKEN_HOLD[type] ?? 2);
    this.attack = { type, t: 0, step: 0, fired: 0, hit: false, special: sp || null };
    if (sp) return sp.start?.(this, this.attack, this.game.player);
    if (type === 'sweep') audio.charge();
    if (type === 'charge') audio.bossCharge();
    if (type === 'volley') audio.bossOrbs();
  }

  updateAttack(dt, player, dist, targetYaw) {
    const a = this.attack;
    a.t += dt;
    const p = this.phase;
    if (a.special) {
      if (a.special.update(this, a, dt, player, dist, targetYaw)) this.endAttack(a.special.rest);
      return;
    }
    if (a.type === 'sweep') {
      const wind = p === 3 ? 0.65 : 0.9;
      const dur = p === 3 ? 0.55 : 0.7;
      const passes = p === 3 ? 2 : 1;
      if (a.step === 0) {
        // telegraph: face the player and grow the blade, flickering
        this.yaw += wrap(targetYaw - this.yaw) * Math.min(1, dt * 4);
        a.from = 1.5;
        a.to = -1.5;
        this.torsoTwist = a.from;
        this.blade.scale.z = 1 + (BLADE_GROW - 1) * Math.min(1, a.t / wind);
        this.bladeMat.color.set(this.bladeHex).multiplyScalar(2.2 + Math.sin(a.t * 40) * 0.8);
        if (a.t > wind) {
          a.step = 1;
          a.t = 0;
          a.prevRel = undefined;
          audio.sweep();
        }
      } else if (a.step <= passes) {
        const k = Math.min(1, a.t / dur);
        const e = k * k * (3 - 2 * k);
        this.torsoTwist = a.from + (a.to - a.from) * e;
        if (!a.hit && this.bladeHits(player, a)) {
          a.hit = true;
          player.damage(28, 'sweep');
        }
        if (k >= 1) {
          a.step++;
          a.t = 0;
          a.hit = false;
          a.prevRel = undefined;
          [a.from, a.to] = [a.to, a.from];
          if (a.step <= passes) audio.sweep();
        }
      } else {
        this.blade.scale.z = Math.max(1, this.blade.scale.z - dt * 6);
        this.bladeMat.color.set(this.bladeHex).multiplyScalar(2.2);
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
          this.world.fx.burst(at.clone().setY(this.ringY + 0.2), this.stage.ring, { count: 60, speed: 10, life: 0.6, size: 0.4, gravity: 6 });
        }
      } else {
        // the second wave comes late enough to land and jump again
        if (p >= 2 && a.step === 1 && a.t > 0.9) {
          a.step = 2;
          this.spawnRing(this.pos.clone(), true);
          audio.slam();
        }
        if (a.t > 1.4) {
          this.endAttack();
          this.vent(this.stage.slamVent || 0, null);
        }
      }
    } else if (a.type === 'volley') {
      const count = [0, 3, 5, 7][p];
      this.yaw += wrap(targetYaw - this.yaw) * Math.min(1, dt * 3);
      if (a.t > 0.5 && a.fired < count && a.t > 0.5 + a.fired * 0.16) {
        a.fired++;
        this.shootOrb(player, a.fired, count);
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
        if (!a.hit && dist < 3.2 && player.pos.y < this.ringY + 4) {
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

  // One orb from the head at the player: shot i of a volley of n, fanned slightly around where you are
  // now (strafe out of them or shoot them down).
  shootOrb(player, i = 1, n = 1) {
    const origin = this.head.getWorldPosition(new THREE.Vector3());
    origin.y += 0.7;
    _w.copy(player.pos);
    _w.y += 1.2;
    // (from off screen, the director pulls the first shot wide as a warning)
    const dir = _v.subVectors(director.aim(this, origin, _w), origin).normalize();
    const fan = (i - (n + 1) / 2) * 0.09;
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    dir.addScaledVector(side, fan).normalize();
    const speed = [0, 10, 11.5, 13][this.phase] * (this.stage.orbSpeed ?? 1);
    new Orb(this.world, origin, dir.multiplyScalar(speed), this.pick(this.stage.orbPalette), { damage: 12, homing: 0, life: 5, radius: 0.42 });
    audio.enemyShoot();
  }

  endAttack(rest = 0) {
    this.attack = null;
    director.release(this);
    this.attackTimer = [0, 2.6, 2.0, 1.4][this.phase] * (this.stage.pace ?? 1) + Math.random() * 0.8 + rest;
    if (this.queued) this.attackTimer = Math.min(this.attackTimer, 0.5); // a timed event is waiting
  }

  // Is the sweeping blade passing through the player this frame? Uses the blade's real position:
  // high near the Warden (duck or stand under it), low toward the tip (jump it), underground past that.
  bladeHits(player, a) {
    this.root.updateMatrixWorld(true);
    const p0 = this.blade.localToWorld(_w.set(0, 0, 0)).clone();
    const p1 = this.blade.localToWorld(_v.set(0, 0, BLADE_LEN)).clone();
    const dx = p1.x - p0.x, dz = p1.z - p0.z, lenXZ = Math.hypot(dx, dz);
    const qx = player.pos.x - p0.x, qz = player.pos.z - p0.z, r = Math.hypot(qx, qz);
    const rel = wrap(Math.atan2(qx, qz) - Math.atan2(dx, dz));
    const crossed = a.prevRel !== undefined && Math.sign(rel) !== Math.sign(a.prevRel) && Math.abs(rel) < 1;
    a.prevRel = rel;
    // sparks where the blade meets the floor
    const fy = this.ringY;
    if (p1.y < fy) {
      const k = (p0.y - fy) / (p0.y - p1.y);
      this.world.fx.burst(new THREE.Vector3(p0.x + dx * k, fy + 0.05, p0.z + dz * k), this.bladeHex, { count: 3, speed: 4, life: 0.4, size: 0.22, gravity: 8 });
    }
    const near = Math.abs(Math.sin(rel)) * r < 0.7 && Math.cos(rel) > 0;
    if (!(crossed || near) || r > lenXZ) return false;
    const y = p0.y + (p1.y - p0.y) * (r / lenXZ);
    return y > fy - 0.05 && y > player.pos.y - 0.1 && y < player.pos.y + player.height + 0.1;
  }

  // Shockwave: a glowing wall of constant height (what you see is exactly what hurts) plus a ground ring.
  spawnRing(pos, harmful) {
    const color = new THREE.Color(harmful ? this.stage.ring : this.veinBase.getHex()).multiplyScalar(2.2);
    const wallMat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, RING_H, 96, 1, true).translate(0, RING_H / 2, 0), wallMat);
    const ground = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 96).rotateX(-Math.PI / 2), wallMat);
    const mesh = new THREE.Group();
    mesh.add(wall, ground);
    mesh.position.set(pos.x, this.ringY + 0.02, pos.z);
    this.world.scene.add(mesh);
    this.rings.push({ mesh, mat: wallMat, r: 1, harmful, hit: false, center: pos.clone() });
    if (harmful) audio.ringWave();
  }

  disposeRing(ring) {
    this.world.scene.remove(ring.mesh);
    ring.mesh.children[0].geometry.dispose();
    ring.mesh.children[1].geometry.dispose();
    ring.mat.dispose();
  }

  updateRings(dt, player) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.r += dt * RING_SPEED;
      ring.mesh.scale.set(ring.r, 1, ring.r);
      ring.mat.opacity = Math.max(0, 1 - ring.r / 34);
      if (ring.harmful && !ring.hit) {
        const d = Math.hypot(player.pos.x - ring.center.x, player.pos.z - ring.center.z);
        // feet below the top of the wall as it passes = hit; any jump clears it (and it runs along the
        // arena floor only: anyone standing higher, or swimming below, is clear)
        if (Math.abs(d - ring.r) < 0.6 && player.pos.y < this.ringY + RING_H && player.pos.y > this.ringY - 0.6) {
          ring.hit = true;
          player.damage(20, 'ring');
        }
      }
      if (ring.r > 34) {
        this.disposeRing(ring);
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
    const pose = a?.special ? (typeof a.special.pose === 'function' ? a.special.pose(this, a) : a.special.pose) : a?.type;
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
    let rArmX = -0.5, rElbow = -0.5, rArmZ = 0, lArmX = -1.2, lElbow = -0.7, lArmZ = 0, lean = 0, headX = 0;
    if (!this.stage.shield) {
      lArmX = -0.45; // no shield to hold up: the left arm hangs ready
      lElbow = -0.5;
    }
    if (pose === 'sweep') {
      // arm out and angled down so the long blade rakes the ground in front
      rArmX = -1.3;
      rElbow = 0;
      rArmZ = 0;
      dip = -0.9;
      lean = 0.2;
    } else if (pose === 'slam') {
      rArmX = a.step === 0 ? -3.0 : -1.0;
      rElbow = a.step === 0 ? -0.3 : 0;
      dip = a.step === 0 ? 0 : -0.8;
      lean = a.step === 0 ? -0.15 : 0.35;
    } else if (pose === 'volley') {
      headX = -0.35;
    } else if (pose === 'charge') {
      lean = a.step === 0 ? 0.15 : 0.4;
      lArmX = -1.5;
      dip = a.step === 0 ? -0.6 : -0.2;
    } else if (pose === 'raise') {
      // both arms up: calling something from the arena itself
      rArmX = -2.9;
      lArmX = -2.9;
      rElbow = -0.2;
      lElbow = -0.2;
      rArmZ = 0.35;
      lArmZ = -0.35;
      lean = -0.2;
      headX = -0.3;
    } else if (pose === 'pound') {
      // fists into the ground
      rArmX = a.t % 0.8 < 0.4 ? -2.6 : -0.9;
      lArmX = a.t % 0.8 < 0.4 ? -0.9 : -2.6;
      dip = -0.7;
      lean = 0.35;
    } else if (pose === 'cast') {
      lArmX = -1.6;
      lElbow = -0.1;
      headX = -0.2;
    } else if (pose === 'beam') {
      // arms flung wide, chest thrust out at you
      rArmX = -1.2;
      lArmX = -1.2;
      rArmZ = 1.2;
      lArmZ = -1.2;
      rElbow = 0;
      lElbow = 0;
      lean = -0.3;
      dip = -0.5;
    } else if (pose === 'spin') {
      rArmX = -1.5;
      lArmX = -1.5;
      rArmZ = 1.0;
      lArmZ = -1.0;
      dip = -0.4;
    }
    if (this.stagger > 0) {
      lean = -0.25;
      headX = 0.3;
    }
    lerp(L.armR.shoulder, 'x', rArmX + sw * 0.15);
    lerp(L.armR.shoulder, 'z', rArmZ);
    lerp(L.armR.elbow, 'x', rElbow);
    lerp(L.armL.shoulder, 'x', L.armL.broken ? 0.1 : lArmX - sw * 0.1);
    lerp(L.armL.shoulder, 'z', lArmZ);
    lerp(L.armL.elbow, 'x', L.armL.broken ? -0.1 : lElbow);
    lerp(this.torso, 'x', lean);
    if (pose === 'sweep' && a.step > 0) this.torso.rotation.y = this.torsoTwist; // the swing itself is exact
    else if (pose === 'spin') this.torso.rotation.y += dt * 2.6; // (slow enough that its core keeps coming round)
    else {
      this.torsoTwist *= pose === 'sweep' ? 1 : 0.92;
      if (Math.abs(this.torso.rotation.y) > Math.PI) this.torso.rotation.y = wrap(this.torso.rotation.y);
      lerp(this.torso, 'y', this.torsoTwist);
    }
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

  // the HUD bar's name line names the stage; tick marks split the bar into the stages' chunks
  updateBossName() {
    const el = document.querySelector('#boss-bar .boss-name');
    if (!el) return;
    const st = this.stage;
    el.textContent = st.title ? `${st.name} · ${st.title.split(' · ')[0]}` : st.name;
    const track = document.querySelector('#boss-bar .boss-track');
    if (track && !this.barTicks && this.stages.length > 1) {
      this.barTicks = [];
      for (let i = 1; i < this.stages.length; i++) {
        const d = document.createElement('div');
        d.style.cssText = `position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:rgba(255,255,255,0.75);z-index:3;left:${(100 * this.hpAt[i]) / this.maxHp}%`;
        track.appendChild(d);
        this.barTicks.push(d);
      }
    }
  }

  updateBar() {
    if (!this.barDirty) return;
    this.barDirty = false;
    const g = this.barCanvas.getContext('2d');
    const W = 512, H = 64;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(0, 14, W, 36);
    const frac = this.hp / this.maxHp;
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
    for (let i = 1; i < this.stages.length; i++) g.fillRect((W * this.hpAt[i]) / this.maxHp, 16, 3, 32);
    this.barTex.needsUpdate = true;
    this.game.hud.bossBar(frac);
  }

  updateDeath(dt) {
    this.deathT += dt;
    const T = this.deathT;
    const long = this.stages.length > 1; // the final death takes its time
    this.updateRings(dt, this.game.player);
    if (Math.random() < dt * (14 + T * 6)) {
      const p = this.root.position.clone();
      p.x += (Math.random() - 0.5) * 4;
      p.y += 1 + Math.random() * 6;
      p.z += (Math.random() - 0.5) * 4;
      this.world.fx.burst(p, COLORS[rand(4)].hex, { count: 40, speed: 8, life: 0.8, size: 0.45, gravity: 4 });
      audio.explode();
      this.game.player.shake = Math.max(this.game.player.shake, 0.3);
    }
    if (long && Math.random() < dt * (4 + T * 5)) {
      // light breaks out through the cracks: shafts of every color from the core
      const c = this.core.getWorldPosition(new THREE.Vector3());
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      this.world.fx.sparks(c, d, COLORS[rand(4)].hex, { count: 14, speed: 30, spread: 0.08, life: 0.5, size: 0.05, gravity: 0, stretch: 0.12, hot: 0.8, k: 2 });
    }
    this.coreLightAnchor.getWorldPosition(this.coreLight.position);
    this.coreLight.color.setHSL((T * 0.8) % 1, 1, 0.6);
    this.coreLight.intensity = 14 + T * 6;
    this.coreMat.color.setHSL((T * 0.8) % 1, 1, 0.6).multiplyScalar(3 + T);
    this.veinMat.color.setHSL((T * 0.8 + 0.5) % 1, 1, 0.6).multiplyScalar(2 + T);
    this.onDeathFx?.(T, dt);
    this.animate(dt, false);
    const fall = long ? 4.2 : 2.5;
    if (T > fall) this.root.rotation.x = Math.min(Math.PI / 2.2, (T - fall) * 1.2);
    if (T > fall + 1.7 && this.state === 'dying') {
      this.state = 'dead';
      const p = this.root.position.clone().setY(this.floorY + 2);
      for (let i = 0; i < 4; i++) this.world.fx.burst(p, COLORS[i].hex, { count: 150, speed: 16, life: 1.6, size: 0.6, gravity: 3 });
      audio.explode(true);
      this.game.player.shake = 1;
      this.root.visible = false;
      this.coreLight.intensity = 0;
      this.world.removeHittable(this.root);
      if (this.onDefeated) this.onDefeated();
      else this.game.onBossDefeated();
    }
  }
}

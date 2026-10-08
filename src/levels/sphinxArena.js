// THE SPHINX's arena — drop-in placement for the Solar mini-boss (src/entities/sphinx.js).
//
//   placeSphinx(B, { center: [x, y, z], ...options }) -> handle      (buildSphinxArena = the same, shell on)
//
// center      the middle of the arena floor; y = the floor top where you walk in (doors / corridors).
// size = 44   interior width of the (square) arena in m.
// shell = true  build the SUN COURT around it: sandstone walls (10 m, open sky, frieze), a 5.8 m terrace
//             round a SUNKEN sand court (1.2 m down, 0.4 m steps), pillars, obelisks, two sun-altar ledges
//             with jump pads, entry/exit doors (3 × 3.2 m, centered in their walls) that open onto 3 m-wide
//             corridor stubs `stub` m long (their far ends are returned as entryEnd / exitEnd, floor at y, so
//             a level butts its corridors against them), and a checkpoint in the entry stub.
//             shell = false: the world provides the room; the fight floor is flat at y over the whole size.
// entry = 's', exit = 'n'   door sides ('n' | 's' | 'e' | 'w'). The Sphinx lies facing the entry; the
//             default fight trigger is a band 3–7 m inside the entry wall.
// seals = []  (shell off) extra gates [{ min:[x,y,z], max:[x,y,z] }]: open, slam shut when the fight
//             starts, open again once it's beaten (sandstone slabs that slide up out of the way).
// exitSeals = [] (shell off) gates that stay shut until it's beaten.
// checkpoint  (shell off) { pos:[x,y,z], yaw } for a checkpoint beacon (the shell builds its own).
// trigger     { min, max } box that starts the fight (overrides the default band).
// bounds      { minX, maxX, minZ, maxZ } where the Sphinx's body center may go (default: 4.5 m inside the
//             fight floor). It's ~9.5 m long, ~3.8 m wide; its back is ~4.3 m up.
// pads = true four jump pads on the fight floor (at 55 % of its half-size) — they're how you dodge
//             pounces and get onto its back to ride it.
// colors = [RED, YELLOW]   [paw-gem color, back-core color]; its sun disc cycles between the two.
// powerSource = false  also build the SUN-LENS (a power source hovering 15 m over the arena that feeds the
//             Sphinx through a tether of light, shielded until it's beaten; then YELLOW shots overload it and
//             it goes dark, calling game.shutDownWorld(world)). Leave it off when the world builds its own.
// world = 'solar'  if game.isWorldDown(world) (a restored save) the arena builds already won: no Sphinx,
//             gates open (and a dead lens).
// music = 'music_miniboss' during the fight; areaMusic = 'music_solar' after it or after a death.
// onStart()   when it wakes.  onDefeated()  when it's destroyed (with powerSource: after the shutdown).
//
// Dying mid-fight resets it to a sleeping statue and reopens the entry (B.onRespawn). The fight drives the
// boss bar itself (game.hud.bossShow / bossBar / bossHint, named THE SPHINX).
// handle: { sphinx, gates, checkpoint, checkpointYaw, entryEnd, exitEnd, lens, fighting, defeated }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { JumpPad, Checkpoint } from '../entities/misc.js';
import { Sphinx } from '../entities/sphinx.js';
import { boxGeo } from '../materials.js';
import { audio } from '../audio.js';
import { RED, YELLOW } from '../colors.js';

const SIDES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const FACE_IN = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }; // player yaw looking into the arena
const SPHINX_FACE = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }; // sphinx yaw looking at a side
const T = 1.5; // wall thickness
const H = 10; // wall height
const DOOR_W = 3, DOOR_H = 3.2;
const SINK = 1.2; // court depth
const PAD_GOLD = 0xffd23a;

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

let mats = null;
function arenaMaterials() {
  if (mats) return mats;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // sandstone ashlar: staggered courses of big blocks, weathered
  const stoneTex = canvasTex(256, (g, s) => {
    g.fillStyle = '#c9a670';
    g.fillRect(0, 0, s, s);
    const rows = 4, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? s / 4 : 0;
      for (let x = -s / 2 + off; x < s; x += s / 2) {
        const v = 0.85 + rnd() * 0.25;
        g.fillStyle = `rgb(${201 * v | 0},${166 * v | 0},${112 * v | 0})`;
        g.fillRect(x + 2, r * rh + 2, s / 2 - 4, rh - 4);
      }
      g.fillStyle = 'rgba(70,45,20,0.55)';
      g.fillRect(0, r * rh, s, 3);
    }
    for (let i = 0; i < 9000; i++) {
      const v = rnd() * 255;
      g.fillStyle = `rgba(${v},${v * 0.8},${v * 0.55},0.08)`;
      g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? s / 4 : 0;
      g.fillStyle = 'rgba(70,45,20,0.5)';
      for (let x = off; x < s + 1; x += s / 2) g.fillRect(x - 1, r * rh, 3, rh);
    }
  });
  // wind-rippled sand
  const sandTex = canvasTex(256, (g, s) => {
    g.fillStyle = '#d8b67a';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 14000; i++) {
      const v = 150 + rnd() * 105;
      g.fillStyle = `rgba(${v},${v * 0.78},${v * 0.5},0.12)`;
      g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1);
    }
    for (let y = 0; y < s; y += 9) {
      g.strokeStyle = 'rgba(120,85,45,0.18)';
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= s; x += 8) g.lineTo(x, y + Math.sin((x / s) * Math.PI * 4 + y * 0.7) * 3);
      g.stroke();
    }
  });
  // a hieroglyph frieze: gold signs on lapis between gold rules
  const friezeTex = canvasTex(256, (g, s) => {
    g.fillStyle = '#163c8f';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#e8b84a';
    g.fillRect(0, 0, s, 18);
    g.fillRect(0, s - 18, s, 18);
    g.strokeStyle = '#f2c95a';
    g.fillStyle = '#f2c95a';
    g.lineWidth = 7;
    g.lineCap = 'round';
    const w = s / 4, cy = s / 2;
    for (let i = 0; i < 4; i++) {
      const x = i * w + w / 2;
      g.beginPath();
      if (i === 0) {
        // ankh
        g.ellipse(x, cy - 40, 16, 24, 0, 0, Math.PI * 2);
        g.moveTo(x, cy - 16);
        g.lineTo(x, cy + 70);
        g.moveTo(x - 30, cy);
        g.lineTo(x + 30, cy);
      } else if (i === 1) {
        // eye of Ra
        g.ellipse(x, cy - 10, 36, 16, 0, 0, Math.PI * 2);
        g.moveTo(x - 6, cy + 6);
        g.lineTo(x - 18, cy + 60);
        g.moveTo(x + 10, cy + 6);
        g.quadraticCurveTo(x + 40, cy + 40, x + 20, cy + 62);
        g.stroke();
        g.beginPath();
        g.arc(x, cy - 10, 9, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
      } else if (i === 2) {
        // sun disc with uraeus
        g.arc(x, cy - 6, 28, 0, Math.PI * 2);
        g.moveTo(x - 46, cy + 50);
        g.quadraticCurveTo(x, cy + 20, x + 46, cy + 50);
      } else {
        // a seated cat
        g.moveTo(x - 20, cy + 70);
        g.quadraticCurveTo(x - 30, cy, x - 4, cy - 30);
        g.lineTo(x - 10, cy - 62);
        g.lineTo(x + 4, cy - 44);
        g.lineTo(x + 16, cy - 62);
        g.lineTo(x + 14, cy - 28);
        g.quadraticCurveTo(x + 30, cy + 10, x + 20, cy + 70);
        g.moveTo(x + 20, cy + 70);
        g.quadraticCurveTo(x + 50, cy + 60, x + 40, cy + 20);
      }
      g.stroke();
    }
  });
  mats = {
    stone: new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xffffff, roughness: 0.9, metalness: 0.02 }),
    sand: new THREE.MeshStandardMaterial({ map: sandTex, color: 0xffffff, roughness: 1, metalness: 0 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8a23a, metalness: 0.9, roughness: 0.3, emissive: 0x3a2200, emissiveIntensity: 0.4 }),
    lapis: new THREE.MeshStandardMaterial({ color: 0x1f4fbf, metalness: 0.4, roughness: 0.3, emissive: 0x0a1d55, emissiveIntensity: 0.5 }),
    frieze: new THREE.MeshStandardMaterial({ map: friezeTex, color: 0xffffff, roughness: 0.5, metalness: 0.3, emissive: 0xffffff, emissiveMap: friezeTex, emissiveIntensity: 0.25 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc650).multiplyScalar(2.2) }),
  };
  return mats;
}

// A sandstone gate that slides up into the wall above its doorway.
class Gate {
  constructor(W, { min, max, open = true }) {
    this.min = new THREE.Vector3(...min);
    this.max = new THREE.Vector3(...max);
    const size = new THREE.Vector3().subVectors(this.max, this.min);
    const M = arenaMaterials();
    this.group = new THREE.Group();
    const along = size.x > size.z;
    const thin = Math.min(size.x, size.z);
    const slab = new THREE.Mesh(boxGeo(size.x, size.y, size.z, 0.25), M.stone);
    const band = (y) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(along ? size.x : thin + 0.08, 0.2, along ? thin + 0.08 : size.z), M.gold);
      b.position.y = y;
      this.group.add(b);
    };
    this.group.add(slab);
    band(-size.y / 2 + 0.25);
    band(size.y / 2 - 0.25);
    // a glowing sun emblem on both faces: gold when open, red while sealed
    this.signMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, thin + 0.1, 20), this.signMat);
    sign.rotation[along ? 'x' : 'z'] = Math.PI / 2;
    this.group.add(sign);
    this.center = this.min.clone().add(this.max).multiplyScalar(0.5);
    this.height = size.y;
    this.group.position.copy(this.center);
    W.scene.add(this.group);
    this.solid = W.addSolid(this.min.clone(), this.max.clone(), { kind: 'rock' });
    this.world = W;
    this.target = open ? 1 : 0;
    this.u = this.target; // 0 shut .. 1 open
    this.apply();
    W.add(this);
  }

  set(open, silent = false) {
    const t = open ? 1 : 0;
    if (t === this.target) return;
    this.target = t;
    if (silent) {
      this.u = t;
      this.apply();
      return;
    }
    if (open) audio.doorOpen();
    else audio.door();
  }

  apply() {
    const lift = this.u * (this.height + 0.1);
    this.group.position.y = this.center.y + lift;
    this.solid.enabled = this.u < 0.6;
    this.signMat.color.set(this.target ? 0xffc650 : 0xff3344).multiplyScalar(2);
  }

  update(dt) {
    if (this.u === this.target) return;
    // slams shut fast, grinds open slowly
    const was = this.u;
    this.u = this.target ? Math.min(1, this.u + dt / 1.6) : Math.max(0, this.u - dt / 0.35);
    this.apply();
    if (!this.target && this.u === 0 && was > 0) {
      this.world.fx.burst(new THREE.Vector3(this.center.x, this.min.y + 0.2, this.center.z), 0xd9b77a, { count: 40, speed: 5, life: 0.9, size: 0.6, gravity: 3, mode: 'puff' });
      const pl = this.world.game?.player;
      if (pl) pl.shake = Math.max(pl.shake, 0.3);
    }
  }
}

// THE SUN-LENS — Solar's power source: a great lens hovering over the court, drinking a beam from the
// captive sun and feeding the Sphinx through a tether of light. A shield of light surrounds it while its
// guardian lives; then it's exposed and YELLOW shots overload it: it shudders, cracks, the sun's beam cuts
// out and it goes dark.
const LENS_HP = 60;
const _lv = new THREE.Vector3();
const _lu = new THREE.Vector3();
const _lc = new THREE.Color();
class SunLens {
  constructor(W, game, { pos, sunDir, onShutdown }) {
    this.world = W;
    this.game = game;
    this.pos = new THREE.Vector3(...pos);
    this.onShutdown = onShutdown;
    this.state = 'shielded'; // 'shielded' | 'exposed' | 'overload' | 'dead'
    this.hp = LENS_HP;
    this.flash = 0;
    this.t = 0;
    const M = arenaMaterials();
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.userData.hit = this;
    this.group.userData.part = 'frame';
    // the lens: a fat glowing crystal disc in a gold ring, under an emitter crown
    this.lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe6a0).multiplyScalar(1.8) });
    this.lens = new THREE.Mesh(new THREE.SphereGeometry(2.8, 32, 12), this.lensMat);
    this.lens.scale.y = 0.24;
    this.lens.userData.hit = this;
    this.lens.userData.part = 'lens';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.38, 8, 40).rotateX(Math.PI / 2), M.gold);
    const crown = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 4), i % 2 ? M.lapis : M.gold);
      spike.position.set(Math.cos(a) * 3.0, i % 2 ? -0.7 : 0.8, Math.sin(a) * 3.0);
      if (i % 2) spike.rotation.x = Math.PI;
      crown.add(spike);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 0.8, 8), M.gold);
    cap.position.y = 0.9;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 8), M.gold);
    tip.position.y = -0.95;
    tip.rotation.x = Math.PI;
    // two gyroscope rings turning round it
    this.gyros = [4.1, 4.8].map((r, i) => {
      const g = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 6, 48), i ? M.lapis : M.gold);
      g.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.4);
      return g;
    });
    // cracks that spread as it takes hits (hidden until then)
    this.cracks = [];
    this.crackMat = new THREE.MeshBasicMaterial({ color: 0x2a1406 });
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.4 + (i % 3) * 0.6), this.crackMat);
      const a = i * 2.39, r = 0.4 + (i % 4) * 0.5;
      c.position.set(Math.cos(a) * r, i % 2 ? 0.63 : -0.63, Math.sin(a) * r);
      c.rotation.y = a + 0.6;
      c.visible = false;
      this.cracks.push(c);
    }
    // its shield: a shell of light
    this.shieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(0.9), opacity: 0.14, side: THREE.DoubleSide, ...add });
    this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(5.6, 2), this.shieldMat);
    this.shield.userData.hit = this;
    this.shield.userData.part = 'shield';
    this.shieldWire = new THREE.Mesh(new THREE.IcosahedronGeometry(5.62, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc650).multiplyScalar(1.5), wireframe: true, opacity: 0.18, ...add }));
    this.shieldWire.raycast = () => {};
    this.group.add(this.lens, ring, crown, cap, tip, ...this.gyros, ...this.cracks, this.shield, this.shieldWire);
    W.scene.add(this.group);
    W.addHittable(this.group);
    // the beam it drinks from the sun, and the tether it feeds its guardian with
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0);
    this.sunDir = new THREE.Vector3(...sunDir).normalize();
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb040).multiplyScalar(1.6), opacity: 0.5, ...add });
    this.beamCoreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(2), opacity: 0.9, ...add });
    this.skyBeam = new THREE.Group();
    this.skyBeam.add(new THREE.Mesh(beamGeo, this.beamMat), new THREE.Mesh(beamGeo, this.beamCoreMat));
    this.skyBeam.children[0].scale.set(1.3, 420, 1.3);
    this.skyBeam.children[1].scale.set(0.45, 420, 0.45);
    this.skyBeam.position.copy(this.pos).addScaledVector(this.sunDir, 1.0);
    this.skyBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.sunDir);
    this.skyBeam.userData.noCull = true; // reaches far into the sky
    W.scene.add(this.skyBeam);
    this.tetherMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc650).multiplyScalar(1.8), opacity: 0.7, ...add });
    this.tether = new THREE.Mesh(beamGeo, this.tetherMat);
    this.tether.userData.noCull = true;
    this.tether.visible = false;
    W.scene.add(this.tether);
    this.light = W.addLight(0xffd080, 30, 34, 1.5);
    this.light.position.copy(this.pos);
    this.hum = audio.createLoop('sun_hum', { gain: 0 });
    W.add(this);
  }

  expose() {
    if (this.state !== 'shielded') return;
    this.state = 'exposed';
    this.shield.visible = this.shieldWire.visible = false;
    this.world.fx.burst(this.pos, 0xffd890, { count: 120, speed: 12, life: 1, size: 0.5, gravity: 2 });
    this.world.fx.ring(this.pos, null, 0xffc650, { size: 2, end: 12, life: 0.7, thick: 0.15, k: 1.4 });
    audio.shieldBreak();
  }

  onHit(color, hit) {
    if (this.state === 'shielded') {
      this.flash = 1;
      return 'shield';
    }
    if (this.state !== 'exposed' || hit.part !== 'lens' || color !== 1) return 'immune';
    this.hp--;
    this.flash = 1;
    const k = 1 - this.hp / LENS_HP;
    this.cracks.forEach((c, i) => (c.visible = i < Math.floor(k * this.cracks.length)));
    this.world.fx.sparks(hit.point, hit.normal || _lu.set(0, -1, 0), 0xffd23a, { count: 8, speed: 9, spread: 1 });
    audio.comboTick(Math.floor(k * 6));
    if (this.hp % 12 === 0) audio.sample('shatter', { gain: 0.5, rate: 0.7 });
    if (this.hp <= 0) {
      this.state = 'overload';
      this.t = 0;
      audio.charge();
      audio.bossCharge();
      this.game.hud.message('The sun-lens is <b>overloading</b>!', 3);
    }
    return 'hit';
  }

  // dark and cracked for good (also used when the world was already powered down in a save)
  kill() {
    this.state = 'dead';
    this.shield.visible = this.shieldWire.visible = this.skyBeam.visible = this.tether.visible = false;
    this.lensMat.color.set(0x2a2218);
    this.cracks.forEach((c) => (c.visible = true));
    this.crackMat.color.set(0x050302);
    this.light.intensity = 0;
    this.gyros[0].rotation.set(Math.PI / 2 + 0.35, 0, 0.3);
    this.gyros[1].rotation.set(Math.PI / 2 - 0.5, 0, -0.4);
    this.group.rotation.set(0.18, 0, -0.12);
    this.group.position.copy(this.pos).setY(this.pos.y - 1.2);
    this.hum?.stop();
    this.hum = null;
    this.world.removeHittable(this.group);
  }

  update(dt, player) {
    if (this.state === 'dead') return;
    this.t += dt;
    const T = this.t;
    this.flash = Math.max(0, this.flash - dt * 5);
    const over = this.state === 'overload';
    const spin = over ? 1 + T * 4 : this.state === 'exposed' ? 1.4 : 1;
    this.gyros[0].rotation.z += dt * 0.6 * spin;
    this.gyros[1].rotation.z -= dt * 0.45 * spin;
    this.gyros[1].rotation.y += dt * 0.2 * spin;
    this.group.position.y = this.pos.y + Math.sin(T * 0.8) * 0.25;
    const pulse = 0.5 + 0.5 * Math.sin(T * (this.state === 'exposed' ? 6 : 2));
    this.lensMat.color.set(0xffe6a0).multiplyScalar(1.4 + pulse * 0.4 + this.flash * 1.2);
    this.shieldMat.opacity = 0.12 + this.flash * 0.35 + pulse * 0.04;
    this.beamMat.opacity = 0.4 + Math.sin(T * 9) * 0.08;
    const d = player ? player.pos.distanceTo(this.pos) : 99;
    this.hum?.setGain(Math.max(0, 1 - d / 45) * 0.5);
    this.hum?.setRate(over ? 1 + T * 0.5 : 1);
    if (over) {
      // shudders, sparks and sputters, then blows: the sun's beam cuts out and it goes dark
      this.group.position.x = this.pos.x + (Math.random() - 0.5) * T * 0.2;
      this.group.position.z = this.pos.z + (Math.random() - 0.5) * T * 0.2;
      this.lensMat.color.set(Math.random() < 0.5 ? 0xffffff : 0xff8a30).multiplyScalar(1.5 + T);
      this.skyBeam.visible = Math.random() < 1 - T * 0.3;
      if (Math.random() < dt * 20) {
        _lv.copy(this.pos).add(_lu.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 6));
        this.world.fx.sparks(_lv, _lu.set(0, -1, 0), 0xffc650, { count: 12, speed: 10, spread: 2 });
        if (Math.random() < 0.3) audio.explode();
      }
      player.shake = Math.max(player.shake, T * 0.12);
      if (T > 2.4) return this.blow(player);
    }
    this.light.intensity = over ? 30 + Math.random() * 40 : 26 + pulse * 8;
  }

  // the tether of light down to its guardian's sun disc (null hides it)
  feed(to) {
    if (!to || this.state === 'dead') return void (this.tether.visible = false);
    const from = _lv.copy(this.group.position).setY(this.group.position.y - 1.4);
    _lu.subVectors(to, from);
    const len = _lu.length();
    this.tether.visible = true;
    this.tether.position.copy(from);
    this.tether.quaternion.setFromUnitVectors(_lv.set(0, 1, 0), _lu.divideScalar(len));
    const w = 0.12 + Math.random() * 0.06;
    this.tether.scale.set(w, len, w);
  }

  blow(player) {
    const fx = this.world.fx, p = this.pos;
    fx.burst(p, 0xffffff, { count: 60, speed: 10, life: 0.5, size: 1.4, gravity: 0 });
    fx.burst(p, 0xffc650, { count: 220, speed: 18, life: 1.6, size: 0.5, gravity: 6 });
    fx.burst(p, 0xff7a20, { count: 90, speed: 9, life: 1.8, size: 0.8, gravity: -1, drag: 2 });
    fx.burst(p, 0x3a3028, { count: 40, speed: 3, life: 3, size: 1.6, gravity: -1, drag: 1.5, mode: 'puff' });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
      fx.shard(p, Math.cos(a) * v, Math.random() * 6 - 2, Math.sin(a) * v, _lc.set(0xffe6a0), 1.6, 1.4 + Math.random(), 0.25 + Math.random() * 0.2, 2);
    }
    fx.ring(p, null, 0xffc650, { size: 3, end: 30, life: 1, thick: 0.15, k: 1.5 });
    audio.sample('solar_shutdown', { gain: 1, vary: 0 }) || audio.explode(true);
    audio.shieldBreak();
    player.shake = 1;
    this.game.hud.whiteFlash?.();
    this.kill();
    this.onShutdown?.();
  }
}

export function placeSphinx(B, opts) {
  const {
    center, size = 44, shell = true, entry = 's', exit = 'n', stub = 6, seals = [], exitSeals = [], checkpoint = null,
    trigger = null, bounds = null, pads = true, colors = [RED, YELLOW], powerSource = false, world = 'solar',
    sunDir = [-0.85, 0.5, -0.12], music = 'music_miniboss', areaMusic = 'music_solar', onStart = null, onDefeated = null,
  } = opts;
  const { W, game, light, onRespawn } = B;
  const [cx, Y, cz] = center;
  const half = size / 2;
  const court = shell ? half - 7 : half; // half-size of the fight floor
  const CY = shell ? Y - SINK : Y; // its height
  const M = arenaMaterials();
  const sets = new Map(); // material key -> geometries, merged into one mesh each at the end

  const push = (key, geo) => {
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(geo.index ? geo.toNonIndexed() : geo);
  };
  // a box: drawn in material `key`, solid unless solid = false
  const box = (x1, y1, z1, x2, y2, z2, key = 'stone', solid = true, uv = 0.25) => {
    const a = [Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2)], b = [Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)];
    const w = b[0] - a[0], h = b[1] - a[1], d = b[2] - a[2];
    if (w < 0.001 || h < 0.001 || d < 0.001) return;
    push(key, boxGeo(w, h, d, uv).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2));
    if (solid) W.addSolid(new THREE.Vector3(...a), new THREE.Vector3(...b), { static: true, kind: 'rock' });
  };
  // the same in arena-relative coordinates (x, z offsets from the center)
  const rbox = (x1, y1, z1, x2, y2, z2, key, solid, uv) => box(cx + x1, y1, cz + z1, cx + x2, y2, cz + z2, key, solid, uv);
  // a rectangular frame between half-sizes a (inner) and b (outer)
  const frame = (a, b, y1, y2, key = 'stone', solid = true) => {
    rbox(-b, y1, -b, b, y2, -a, key, solid);
    rbox(-b, y1, a, b, y2, b, key, solid);
    rbox(-b, y1, -a, -a, y2, a, key, solid);
    rbox(a, y1, -a, b, y2, a, key, solid);
  };
  // a box in a side's frame: u along the wall, d outward from the wall's inner face
  const sideBox = (side, u1, u2, d1, d2, y1, y2, key = 'stone', solid = true, uv) => {
    const [nx, nz] = SIDES[side];
    if (nz) box(cx + u1, y1, cz + nz * (half + d1), cx + u2, y2, cz + nz * (half + d2), key, solid, uv);
    else box(cx + nx * (half + d1), y1, cz + u1, cx + nx * (half + d2), y2, cz + u2, key, solid, uv);
  };
  const sidePoint = (side, u, d, y) => {
    const [nx, nz] = SIDES[side];
    return nz ? [cx + u, y, cz + nz * (half + d)] : [cx + nx * (half + d), y, cz + u];
  };
  const box3 = (p1, p2) => [[Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.min(p1[2], p2[2])], [Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1]), Math.max(p1[2], p2[2])]];

  const sealGates = seals.map((g) => new Gate(W, { min: g.min, max: g.max, open: true })); // shut during the fight
  const exitGates = exitSeals.map((g) => new Gate(W, { min: g.min, max: g.max, open: false })); // shut until it's beaten
  const ends = {};
  let cpPos = checkpoint?.pos || null, cpYaw = checkpoint?.yaw ?? FACE_IN[entry];
  let ledgeSides = [];

  if (shell) {
    // -------------------------------------------------------------- floor: terrace, steps, sunken court
    frame(court + 1.2, half + T, Y - 2.4, Y);
    frame(court + 0.6, court + 1.2, Y - 2.4, Y - 0.4);
    frame(court, court + 0.6, Y - 2.4, Y - 0.8);
    rbox(-court, Y - 2.4, -court, court, CY, court, 'sand', true, 0.12);
    // gold lip along the terrace edge so the drop reads
    frame(court + 1.2, court + 1.35, Y - 0.05, Y + 0.03, 'gold', false);
    frame(court - 0.04, court, CY, CY + 0.03, 'glow', false);

    // -------------------------------------------------------------- walls (doors in the entry/exit walls)
    const doors = { [entry]: 'entry', [exit]: 'exit' };
    for (const side of Object.keys(SIDES)) {
      const u0 = -half - T, u1 = half + T;
      if (doors[side]) {
        const a = -DOOR_W / 2, b = DOOR_W / 2;
        sideBox(side, u0, a, 0, T, Y - 2.4, Y + H);
        sideBox(side, b, u1, 0, T, Y - 2.4, Y + H);
        sideBox(side, a, b, 0, T, Y + DOOR_H, Y + H);
        // gold door frame and a sun disc over it
        sideBox(side, a - 0.35, a, -0.12, 0, Y, Y + DOOR_H + 0.35, 'gold', false);
        sideBox(side, b, b + 0.35, -0.12, 0, Y, Y + DOOR_H + 0.35, 'gold', false);
        sideBox(side, a - 0.35, b + 0.35, -0.12, 0, Y + DOOR_H, Y + DOOR_H + 0.35, 'gold', false);
        const [sx, , sz] = sidePoint(side, 0, -0.1, 0);
        const disc = new THREE.CylinderGeometry(1.1, 1.1, 0.2, 24).rotateX(Math.PI / 2);
        if (!SIDES[side][1]) disc.rotateY(Math.PI / 2);
        push('glow', disc.translate(sx, Y + DOOR_H + 1.8, sz));
        for (const s of [-1, 1]) sideBox(side, s * 1.2 - (s < 0 ? 2.6 : 0), s * 1.2 + (s > 0 ? 2.6 : 0), -0.1, 0, Y + DOOR_H + 1.65, Y + DOOR_H + 1.95, 'gold', false); // wings
      } else sideBox(side, u0, u1, 0, T, Y - 2.4, Y + H);
      // frieze band and cornice
      sideBox(side, -half, half, -0.06, 0, Y + 6.2, Y + 7.4, 'frieze', false, 1 / 1.2);
      sideBox(side, -half - T, half + T, -0.4, T, Y + H, Y + H + 0.5, 'stone');
      sideBox(side, -half, half, -0.45, -0.4, Y + H + 0.1, Y + H + 0.35, 'gold', false);
      // pylon towers along the top so the skyline isn't flat
      for (const u of [-half + 3, -half / 2 + 1, half / 2 - 1, half - 3]) sideBox(side, u - 1.2, u + 1.2, 0, T, Y + H + 0.5, Y + H + 2.4, 'stone');
    }
    // corner towers
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      rbox(sx * (half + T) - 1.5, Y + H, sz * (half + T) - 1.5, sx * (half + T) + 1.5, Y + H + 4, sz * (half + T) + 1.5, 'stone');
      rbox(sx * (half + T) - 1.6, Y + H + 4, sz * (half + T) - 1.6, sx * (half + T) + 1.6, Y + H + 4.4, sz * (half + T) + 1.6, 'gold', false);
    }

    // -------------------------------------------------------------- pillars and obelisks on the terrace
    const tr = court + 1.2 + (half - court - 1.2) / 2; // terrace mid-line
    const pillars = [];
    for (const u of [-11, 11]) pillars.push([u, -tr], [u, tr], [-tr, u], [tr, u]);
    for (const [x, z] of pillars) {
      rbox(x - 1, Y, z - 1, x + 1, Y + 8.4, z + 1, 'stone');
      rbox(x - 1.05, Y + 1.0, z - 1.05, x + 1.05, Y + 1.5, z + 1.05, 'lapis', false);
      rbox(x - 1.08, Y + 1.5, z - 1.08, x + 1.08, Y + 1.65, z + 1.08, 'gold', false);
      rbox(x - 1.05, Y + 5.2, z - 1.05, x + 1.05, Y + 6.4, z + 1.05, 'frieze', false, 1 / 1.2);
      rbox(x - 1.3, Y + 8.4, z - 1.3, x + 1.3, Y + 9.0, z + 1.3, 'gold'); // capital
      rbox(x - 1.05, Y + 7.6, z - 1.05, x + 1.05, Y + 7.75, z + 1.05, 'glow', false);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * tr, z = sz * tr;
      rbox(x - 1.3, Y, z - 1.3, x + 1.3, Y + 0.9, z + 1.3, 'stone');
      rbox(x - 1.35, Y + 0.9, z - 1.35, x + 1.35, Y + 1.05, z + 1.35, 'gold', false);
      push('stone', new THREE.CylinderGeometry(0.62, 0.95, 11, 4, 1).rotateY(Math.PI / 4).translate(cx + x, Y + 1.05 + 5.5, cz + z));
      push('gold', new THREE.ConeGeometry(0.62, 1.3, 4).rotateY(Math.PI / 4).translate(cx + x, Y + 12.7, cz + z));
      push('lapis', new THREE.CylinderGeometry(0.8, 0.83, 0.5, 4, 1).rotateY(Math.PI / 4).translate(cx + x, Y + 4.3, cz + z));
      W.addSolid(new THREE.Vector3(cx + x - 0.75, Y, cz + z - 0.75), new THREE.Vector3(cx + x + 0.75, Y + 12, cz + z + 0.75), { static: true, kind: 'rock' });
    }

    // -------------------------------------------------------------- sun-altar ledges on the two other walls
    ledgeSides = Object.keys(SIDES).filter((s) => !doors[s]);
    for (const side of ledgeSides) {
      sideBox(side, -4, 4, -3, 0, Y + 4.1, Y + 4.6);
      sideBox(side, -4.05, 4.05, -3.05, -3, Y + 4.45, Y + 4.55, 'glow', false);
      sideBox(side, -4, 4, -3, -2.6, Y + 2.8, Y + 4.1, 'stone', false); // a corbel under its lip
      for (const u of [-3, 3]) sideBox(side, u - 0.4, u + 0.4, -2.2, -1.4, Y, Y + 4.1); // columns holding it up
      const [px, py, pz] = sidePoint(side, 0, -4.5, Y);
      const [nx, nz] = SIDES[side];
      new JumpPad(W, { pos: [px, py, pz], power: 16.5, push: [nx * 2.5, 0, nz * 2.5], color: PAD_GOLD });
      light(...sidePoint(side, 0, -2, Y + 7), 0xffb060, 16, 18);
    }

    // -------------------------------------------------------------- doors, corridor stubs, checkpoint
    for (const side of [entry, exit]) {
      const a = -DOOR_W / 2, b = DOOR_W / 2;
      sideBox(side, a - 0.5, b + 0.5, T, T + stub, Y - 1, Y);
      sideBox(side, a - 0.5, a, T, T + stub, Y, Y + DOOR_H);
      sideBox(side, b, b + 0.5, T, T + stub, Y, Y + DOOR_H);
      sideBox(side, a - 0.5, b + 0.5, T, T + stub, Y + DOOR_H, Y + DOOR_H + 0.5);
      sideBox(side, a, a + 0.06, T, T + stub, Y + 0.02, Y + 0.1, 'glow', false);
      sideBox(side, b - 0.06, b, T, T + stub, Y + 0.02, Y + 0.1, 'glow', false);
      const [min, max] = box3(sidePoint(side, a, T * 0.5 - 0.3, Y), sidePoint(side, b, T * 0.5 + 0.3, Y + DOOR_H));
      (side === entry ? sealGates : exitGates).push(new Gate(W, { min, max, open: side === entry }));
      ends[side] = sidePoint(side, 0, T + stub, Y);
    }
    cpPos = sidePoint(entry, 0, T + stub * 0.5, Y);
    cpYaw = FACE_IN[entry];
    light(...sidePoint(entry, 0, T + stub * 0.5, Y + 2.8), 0xffc070, 8, 9);
    light(cx, Y + 12, cz, 0xffd090, 40, 45);
  }
  if (cpPos) {
    const along = SIDES[entry][1] !== 0;
    new Checkpoint(W, game, { pos: cpPos, yaw: cpYaw, size: shell ? (along ? [3, 3, 2] : [2, 3, 3]) : [4, 3, 4] });
  }

  // ---------------------------------------------------------------- jump pads on the fight floor
  if (pads) {
    const padR = court * 0.55;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) new JumpPad(W, { pos: [cx + sx * padR, CY, cz + sz * padR], power: 17, color: PAD_GOLD });
  }

  // ---------------------------------------------------------------- the Sphinx (and optionally the power source it guards)
  const m = court - 4.5;
  let fighting = false, defeated = false, down = false;
  const reopen = () => {
    for (const g of sealGates) g.set(true);
    for (const g of exitGates) g.set(true);
  };
  const finish = () => {
    audio.setIntensity(0);
    game.setMusic(areaMusic);
    onDefeated?.();
  };
  const lens = powerSource
    ? new SunLens(W, game, {
        pos: [cx, Y + 15, cz],
        sunDir,
        onShutdown: () => {
          down = true;
          for (const g of exitGates) g.set(true);
          game.hud.zoneTitle('SOLAR ENGINE', 'POWERED DOWN', '#ffd23a');
          game.shutDownWorld?.(world);
          finish();
        },
      })
    : null;
  const sphinx = new Sphinx(W, game, {
    pos: [cx, CY, cz],
    yaw: SPHINX_FACE[entry],
    floorY: CY,
    colors,
    bounds: bounds || { minX: cx - m, maxX: cx + m, minZ: cz - m, maxZ: cz + m },
    court: { minX: cx - court, maxX: cx + court, minZ: cz - court, maxZ: cz + court },
    groundAt: shell
      ? (x, z) => {
          const d = Math.max(Math.abs(x - cx), Math.abs(z - cz));
          return d < court ? CY : d < court + 0.6 ? Y - 0.8 : d < court + 1.2 ? Y - 0.4 : Y;
        }
      : null,
    onDefeated: () => {
      fighting = false;
      defeated = true;
      game.hud.zoneTitle('THE SPHINX', 'SHATTERED', '#ffd23a');
      if (!lens) {
        reopen();
        return finish();
      }
      // its guardian gone, the power source's shield drops (the exit opens once it's shut down)
      for (const g of sealGates) g.set(true);
      lens.exposeT = 1.8;
    },
  });
  // the lens feeds its guardian while it stands; its shield drops a moment after the guardian falls
  if (lens) {
    const _disc = new THREE.Vector3();
    W.add({
      update: (dt) => {
        const on = sphinx.state === 'statue' || sphinx.state === 'waking' || sphinx.state === 'fight';
        lens.feed(on ? sphinx.disc.getWorldPosition(_disc) : null);
        if (lens.exposeT > 0 && (lens.exposeT -= dt) <= 0) {
          lens.expose();
          game.hud.message('The <b>sun-lens</b> is unshielded — shoot it <b>YELLOW</b> to shut the Solar engine down!', 6);
        }
      },
    });
  }

  // the fight starts when you step in (by default 3–7 m inside the entry wall)
  const [tmin, tmax] = trigger ? [trigger.min, trigger.max] : box3(sidePoint(entry, -half, -7, Y - 2), sidePoint(entry, half, -3, Y + 9));
  const startTrig = W.trigger(tmin, tmax, () => {
    if (fighting || defeated || down) return;
    fighting = true;
    for (const g of sealGates) g.set(false);
    sphinx.start();
    audio.setIntensity(2);
    game.setMusic(music);
    onStart?.();
  });

  onRespawn(() => {
    if (!fighting) return;
    fighting = false;
    sphinx.reset();
    for (const g of sealGates) g.set(true, true);
    startTrig.fired = false;
    startTrig.inside = false;
    audio.setIntensity(1);
    game.setMusic(areaMusic);
  });

  // this world's engine was already shut down (a restored save): no guardian, open doors (a dead lens)
  const alreadyDown = () => {
    if (down) return;
    down = defeated = true;
    fighting = false;
    sphinx.vanish();
    lens?.kill();
    for (const g of [...sealGates, ...exitGates]) g.set(true, true);
  };
  if (game.isWorldDown?.(world)) alreadyDown();
  game.onPowerDown?.((name, info) => name === world && info?.restored && alreadyDown());

  // ---------------------------------------------------------------- merge the stonework: one mesh per material
  for (const [key, geos] of sets) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), M[key]);
    geos.forEach((g) => g.dispose());
    mesh.matrixAutoUpdate = false;
    W.scene.add(mesh);
  }

  return {
    sphinx,
    gates: { seals: sealGates, exits: exitGates },
    checkpoint: cpPos,
    checkpointYaw: cpYaw,
    entryEnd: ends[entry] || null,
    exitEnd: ends[exit] || null,
    lens,
    get fighting() {
      return fighting;
    },
    get defeated() {
      return defeated;
    },
  };
}

// The Sphinx in its own Sun Court (see placeSphinx for the options).
export const buildSphinxArena = (B, opts) => placeSphinx(B, { shell: true, ...opts });

// FOUNDRY ANNEX — color-locked challenge wings behind the spawn room's south wall, for the trip back with
// new colors (region: x -45..45, z 0.5..100; see LAYOUT.md). Both doors and a grate between them are in
// plain view from the spawn room on the very first visit.
//  GREEN door (x -3.5): Quench Line gauntlet → the Slag Pit (spiked platforms over acid) → a four-layer
//    shielded drop → under the pit: the ricochet lock → the Slag Works vault → a one-way lift back up.
//  BLUE door (x 3.5): Spectrum Hall → the Spectrum Lock (four lenses against the clock) → the Slag Conveyor
//    (spiked shuttle, lift, curtained gantry, shielded drop) → the Smelter, climbing to the glass case on the
//    pillar you could see through the grate → a bridge back to the blue vestibule.
import * as THREE from 'three';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { glyphTex } from '../materials.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { MovingPlatform, Checkpoint } from '../entities/misc.js';
import { Mirror, Glass, TargetPanel, SlidingDoor } from '../entities/puzzle.js';

const tag = (c, text) => `<b style="color:${COLORS[c].css}">${text}</b>`;
const _v = new THREE.Vector3();
const _to = new THREE.Vector3();

// A spike layer over an annex platform, with the Crucible's rules (red.js): its regrowth holds while you
// stand on or hover over the slab, and the spikes flicker back up out of it for their last second.
// moveTo() lets it ride a shuttle.
class SlabSpikes extends Barrier {
  constructor(W, { min, max, color, regen = 6, zone = 'red' }) {
    super(W, { min, max, color, kind: 'spike', regen, zone });
    this.size = this.max.clone().sub(this.min);
  }

  near(p) {
    const pad = 1.2;
    return p.pos.x > this.min.x - pad && p.pos.x < this.max.x + pad && p.pos.z > this.min.z - pad && p.pos.z < this.max.z + pad &&
      p.pos.y > this.min.y - 1 && p.pos.y < this.max.y + 4;
  }

  moveTo(x, y, z) {
    this.min.set(x, y, z);
    this.max.copy(this.min).add(this.size);
    this.solid.min.copy(this.min);
    this.solid.max.copy(this.max);
    this.place();
  }

  place() {
    const g = this.group;
    g.position.set((this.min.x + this.max.x) / 2, this.min.y + (this.size.y * g.scale.y) / 2, (this.min.z + this.max.z) / 2);
  }

  update(dt, player) {
    if (this.broken && this.regen > 0 && this.near(player)) this.timer = Math.max(this.timer, 1 + dt);
    super.update(dt, player);
    if (this.broken && this.regen > 0) {
      const k = this.timer < 1 ? 1 - Math.max(0, this.timer) : 0;
      this.group.visible = k > 0 && (this.world.time * 14) % 1 < 0.7;
      this.group.scale.set(1, 0.05 + 0.3 * k, 1);
    }
    this.place();
  }

  restore() {
    super.restore();
    this.group.scale.setScalar(0.6);
  }
}

// A shuttle carrying a spike layer of one color.
class SpikedShuttle extends MovingPlatform {
  constructor(W, opts, color, regen) {
    super(W, opts);
    this.spikes = new SlabSpikes(W, { min: [opts.min[0], opts.max[1], opts.min[2]], max: [opts.max[0], opts.max[1] + 0.6, opts.max[2]], color, regen, zone: opts.zone });
  }

  update(dt) {
    super.update(dt);
    this.spikes.moveTo(this.cur.x, this.cur.y + this.size.y, this.cur.z);
  }
}

export function buildRedAnnex(B) {
  const { W, game, CH, wallX, room, corridor, corridorX, plat, secretRoom, trophy, shieldedShaft, hint, zoneTitle, area, light, barrierWallX, devStart, onRespawn } = B;
  const zone = 'red';
  const mood = { music: 'music_red', ambient: 'amb_foundry', atmosphere: 'foundry' };
  // a slab with a spike layer of the given color on top
  const spiked = (x1, z1, x2, z2, top, color, regen = 6) => {
    plat(x1, z1, x2, z2, top, zone);
    return new SlabSpikes(W, { min: [x1, top, z1], max: [x2, top + 0.6, z2], color, regen, zone });
  };

  // ================================================================ THE SPAWN ROOM'S SOUTH WALL
  // (red.js cuts the openings: green door x -3.5, grate x 0, blue door x 3.5.) Each door is a glowing
  // energy wall you can see the lit hall through, framed in its color, with the lock glyph above it.
  const glyphGeo = new THREE.PlaneGeometry(0.85, 0.85);
  const doorway = (cx, color) => {
    const g = 'glow' + color;
    W.deco(cx - 1.35, 0, -0.05, cx - 1.2, 3.15, 0, g, zone);
    W.deco(cx + 1.2, 0, -0.05, cx + 1.35, 3.15, 0, g, zone);
    W.deco(cx - 1.35, 3, -0.05, cx + 1.35, 3.15, 0, g, zone);
    W.deco(cx - 1.35, 0, -0.6, cx + 1.35, 0.02, 0, g, zone); // threshold strip on the floor
    const sign = new THREE.Mesh(glyphGeo, new THREE.MeshBasicMaterial({ map: glyphTex, color: new THREE.Color(COLORS[color].hex).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sign.position.set(cx, 3.75, -0.03);
    sign.rotation.y = Math.PI;
    W.scene.add(sign);
    return new Barrier(W, { min: [cx - 1.2, 0, 0.05], max: [cx + 1.2, 3, 0.45], color, kind: 'wall', zone });
  };
  const greenDoor = doorway(-3.5, GREEN);
  const blueDoor = doorway(3.5, BLUE);
  // the grate: glass behind iron bars, looking down a sealed duct into the Smelter at the trophy case
  new Glass(W, { min: [-1.1, 1.0, 0.2], max: [1.1, 2.5, 0.3] });
  for (const x of [-0.8, -0.4, 0.4, 0.8]) W.deco(x - 0.04, 1.0, 0.05, x + 0.04, 2.5, 0.15, 'metal', zone);
  W.deco(-1.1, 2.15, 0.05, 1.1, 2.23, 0.15, 'metal', zone);
  W.deco(-1.2, 0.92, -0.08, 1.2, 1.0, 0.2, 'glow0', zone); // glowing sill
  W.box(-1.5, -1, 0.5, 1.5, 0, 9.5, 'grate', zone);
  W.box(-1.5, CH, 0.5, 1.5, CH + 0.5, 9.5, 'ceil', zone);
  W.box(-2, 0, 8.5, -1.5, CH, 9.5, 'wall', zone);
  W.deco(-1.5, 0, 0.5, -1.45, CH, 9.5, 'metal', zone); // dark duct lining, red strips leading the eye
  W.deco(1.45, 0, 0.5, 1.5, CH, 9.5, 'metal', zone);
  W.deco(-1.45, 0.02, 0.5, -1.35, 0.08, 9.5, 'glow0', zone);
  W.deco(1.35, 0.02, 0.5, 1.45, 0.08, 9.5, 'glow0', zone);

  // First look at each door (or the grate) from the spawn room: one short hint, once.
  const looks = [
    { at: [-3.5, 1.5, 0.25], door: greenDoor, color: GREEN, word: 'green', range: 10 },
    { at: [3.5, 1.5, 0.25], door: blueDoor, color: BLUE, word: 'blue', range: 10 },
    { at: [0, 1.75, 0.25], range: 6, grate: true },
  ];
  let caseTrophy = null, lookCool = 0;
  W.add({
    update(dt) {
      const b = game.blaster, p = game.player;
      if ((lookCool -= dt) > 0 || !b.has || p.pos.z > 0.2 || p.pos.z < -12 || Math.abs(p.pos.x) > 6) return;
      const fwd = game.camera.getWorldDirection(_v), eye = game.camera.position;
      for (const L of looks) {
        const owned = !L.grate && b.unlocked[L.color];
        if (L.grate ? L.seen || !caseTrophy?.active : L.door.broken || (owned ? L.seenOwned : L.seen)) continue;
        _to.set(...L.at).sub(eye);
        const d = _to.length();
        if (d > L.range || fwd.dot(_to.divideScalar(d)) < (L.grate ? 0.96 : 0.93)) continue;
        if (L.grate) game.hud.message('Through the grate: a <b>prism trophy</b> in a glass case, far out over the molten Smelter.', 5);
        else if (owned) game.hud.message(`The ${tag(L.color, COLORS[L.color].name)} door. Your blaster fires ${L.word} now…`, 4);
        else game.hud.message(`${L.color === BLUE ? 'An' : 'A'} ${tag(L.color, COLORS[L.color].name)}-locked door… come back when your blaster fires ${L.word}.`, 5);
        if (owned) L.seenOwned = true;
        else L.seen = true;
        lookCool = 4.5; // let each hint be read before the next
        break;
      }
    },
  });

  // ================================================================ GREEN WING — THE SLAG WORKS (red, yellow, green)
  corridor({ zStart: 0.5, zEnd: 8, y: 0, zone, cx: -3.5, w: [{ c: 6.5, w: 3, h: CH }] });
  W.box(-5.5, 0, 8, -1.5, CH, 8.5, 'wall', zone);
  area([-5, 0, 0.5], [-2, 3, 3], mood);
  zoneTitle([-5, 0, 2], [-2, 3, 4], 'FOUNDRY ANNEX', 'THE SLAG WORKS', COLORS[GREEN].css);
  devStart('annexGreen', [-3.5, 0, 2.5], Math.PI, [RED, YELLOW, GREEN]);

  // the Quench Line: a switching gauntlet west, past the sealed service-lift hatch (x -14)
  corridorX({ xStart: -5.5, xEnd: -18, y: 0, zone, cz: 6.5, s: [{ c: -14, w: 3, h: CH }] });
  hint([-5.5, 0, 5], [-4, 3, 8], 'Every color you own, one after another. <b>Switch fast.</b>', 3);
  barrierWallX(-7.5, 0, GREEN, zone, 6.5);
  barrierWallX(-9.5, 0, YELLOW, zone, 6.5);
  barrierWallX(-11.5, 0, RED, zone, 6.5);
  barrierWallX(-16.5, 0, GREEN, zone, 6.5);
  new Drone(W, { pos: [-14, 2.3, 6.5], color: [RED, YELLOW, GREEN], orbit: 0.4, range: 10, cycle: 2 });
  const liftHatch = new SlidingDoor(W, { min: [-15.5, 0, 8.05], max: [-12.5, CH, 8.45], color: GREEN, zone });

  // the Slag Pit: spiked platforms over acid, south from the entry ledge to the drop
  room({
    x1: -42, x2: -18, zS: 40, zN: 2, y: -6, h: 16, zone,
    e: [{ c: 6.5, w: 3, h: CH, y0: 6 }],
    s: [{ c: -36, w: 3, h: CH, y0: 9.2 }],
  });
  W.box(-42, -6, 2, -18, -5.6, 40, 'acid', zone, { hazard: 'acid' });
  W.box(-24, -6, 2, -18, 0, 11, 'plat', zone);
  W.deco(-24, -0.12, 11, -18, -0.04, 11.02, 'glow0', zone);
  area([-24, 0, 2], [-18, 4, 11], mood);
  new Checkpoint(W, game, { pos: [-21, 0, 6.5], yaw: Math.PI, size: [6, 3, 5] });
  hint([-24, 0, 7], [-18, 3, 11], 'The <b>Slag Pit</b>. Every landing is spiked in a color you own: clear it, then jump.', 5);
  spiked(-22.5, 14, -19.5, 17, 0.4, YELLOW);
  new SpikedShuttle(W, { min: [-22.5, 0.2, 20], max: [-19.5, 0.8, 23], offset: [-12, 0, 0], speed: 2.2, pause: 1, zone }, GREEN, 8);
  spiked(-37.5, 26, -34.5, 29, 1.6, RED);
  // a green curtain hangs across the next hop: burn it from the red slab, then clear the yellow one beyond
  W.box(-38.6, 6.4, 30.35, -33.4, 6.7, 30.65, 'metal', zone);
  new Barrier(W, { min: [-38.4, 2.0, 30.4], max: [-33.6, 6.4, 30.6], color: GREEN, kind: 'wall', zone });
  spiked(-37.5, 32, -34.5, 35, 2.4, YELLOW);
  W.box(-42, -6, 37, -30, 3.2, 40, 'plat', zone);
  W.deco(-42, 3.08, 36.98, -30, 3.16, 37, 'glow0', zone);
  new Checkpoint(W, game, { pos: [-36, 3.2, 38.5], yaw: Math.PI, size: [5, 3, 3] });
  new Drone(W, { pos: [-28, 4.5, 26], color: [RED, YELLOW, GREEN], range: 22, cycle: 2.2 });
  new Drone(W, { pos: [-38, 6.5, 14], color: GREEN, range: 22 });
  light(-30, 8.5, 22, 0xff5533, 55, 40);

  // the drop: a four-layer shielded shaft down beneath the pit
  corridor({ zStart: 40.5, zEnd: 44, y: 3.2, zone, cx: -36 });
  wallX(43.5, 44, -38.5, -33.5, -12.5, 3.2, [{ c: -36, w: 3, y0: -12.5, h: CH }], zone);
  W.box(-38.5, 3.2, 43.5, -37.5, 6.4, 44, 'wall', zone);
  W.box(-34.5, 3.2, 43.5, -33.5, 6.4, 44, 'wall', zone);
  W.box(-38.5, -12.5, 44, -38, 6.4, 48.5, 'wall', zone);
  W.box(-34, -12.5, 44, -33.5, 6.4, 48.5, 'wall', zone);
  W.box(-38, -12.5, 48, -34, 6.4, 48.5, 'wall', zone);
  W.box(-38.5, 6.4, 43.5, -33.5, 6.9, 48.5, 'ceil', zone);
  W.box(-38, -13.5, 44, -34, -12.5, 48, 'floor', zone);
  shieldedShaft({
    x1: -38, x2: -34, z1: 44, z2: 48, floor: -12.5, capY: 2.8, zone,
    cap: { x1: -38, x2: -34, z1: 43.6, z2: 48 },
    layers: [{ y: -0.5, color: GREEN }, { y: -4, color: RED, shieldY: -0.7 }, { y: -7.5, color: YELLOW, shieldY: -4.2 }, { y: -11, color: GREEN, shieldY: -7.7 }],
  });
  hint([-37.5, 3.2, 40.5], [-34.5, 6, 43], 'Four layers deep. Drop through each shield, then fire: ' +
    `${tag(GREEN, 'GREEN')} · ${tag(RED, 'RED')} · ${tag(YELLOW, 'YELLOW')} · ${tag(GREEN, 'GREEN')}`, 6);

  // under the pit: back north to the ricochet lock
  corridor({ zStart: 43.5, zEnd: 20.5, y: -12.5, zone, cx: -36 });
  new Checkpoint(W, game, { pos: [-36, -12.5, 40.5], yaw: 0, size: [3, 3, 3] });
  room({
    x1: -42, x2: -26, zS: 20, zN: 8, y: -12.5, h: 5, zone,
    s: [{ c: -36, w: 3, h: CH }],
    n: [{ c: -35, w: 3, h: 4 }],
    e: [{ c: 14, w: 3, h: CH }],
  });
  const vaultDoor = new SlidingDoor(W, { min: [-26, -12.5, 12.5], max: [-25.5, -12.5 + CH, 15.5], color: GREEN, zone });
  {
    // An alcove behind glass in the north wall. Its ceiling and sides are SOLAR panels (green ricochets
    // off them; yellow shatters them for a moment), the floor and back wall one big green target, and
    // the slot over the glass is screened by a red curtain that regrows: burn it, then bank green in.
    const ay = -12.5, top = ay + 4, glassTop = ay + 2.6, x1 = -36.5, x2 = -33.5, zb = 3, zf = 7.5;
    room({ x1, x2, zS: zf, zN: zb, y: ay, h: 4, zone, s: [{ c: -35, w: 3, h: 4 }], trim: false });
    new Glass(W, { min: [x1, ay, 6.9], max: [x2, glassTop, 7.0] });
    W.deco(x1, glassTop, 6.85, x2, glassTop + 0.06, 7.05, 'glow2', zone);
    new Barrier(W, { min: [x1, glassTop, 7.1], max: [x2, top, 7.3], color: RED, kind: 'wall', regen: 4, zone });
    const panel = (min, max) => new Barrier(W, { min, max, color: YELLOW, kind: 'wall', regen: 2.5, zone });
    panel([x1, top - 0.15, zb], [x2, top, 7.0]);
    panel([x1, ay, zb + 0.2], [x1 + 0.1, top - 0.15, 6.9]);
    panel([x2 - 0.1, ay, zb + 0.2], [x2, top - 0.15, 6.9]);
    let solved = false;
    const onActivate = () => {
      if (solved) return;
      solved = true;
      vaultDoor.open();
      game.hud.message('Vault lock released.', 2.5);
    };
    const targets = [
      new TargetPanel(W, { min: [x1 + 0.1, ay, zb + 0.2], max: [x2 - 0.1, ay + 0.12, 6.9], color: GREEN, face: 'up', onActivate }),
      new TargetPanel(W, { min: [x1 + 0.1, ay + 0.12, zb], max: [x2 - 0.1, top - 0.15, zb + 0.2], color: GREEN, face: '+z', onActivate }),
    ];
    targets.forEach((tp) => (tp.group = targets));
  }
  hint([-38, -12.5, 14], [-34, -9.5, 20], `The vault lock is <b>behind the glass</b>. Burn the red screen over it, then bank ${tag(GREEN, 'green')} off the panels…`, 6);
  new Drone(W, { pos: [-30, -10, 12], color: GREEN, range: 14 });

  // the Slag Works vault, and the service lift straight back up to the Quench Line
  room({ x1: -25.5, x2: -16, zS: 17, zN: 8, y: -12.5, h: 4, zone, w: [{ c: 14, w: 3, h: CH }], e: [{ c: 10, w: 3, h: CH }] });
  trophy(-21, -11.5, 12.5);
  light(-21, -9.2, 12.5, 0x3dff7a, 10, 10);
  secretRoom([-25.5, -12.5, 8], [-16, -9, 17], 'Slag Works Vault');
  area([-25.5, -12.5, 8], [-16, -9, 17], mood);
  W.box(-16, -8, 8, -15.5, CH, 12, 'wall', zone);
  W.box(-12.5, -14.1, 8, -12, CH, 12, 'wall', zone);
  W.box(-16, -14.1, 11.5, -12.5, CH, 12, 'wall', zone);
  W.box(-16, -14.1, 8, -12.5, 0, 8.5, 'wall', zone);
  W.box(-15.5, -14.1, 8.5, -12.5, -13.1, 11.5, 'floor', zone);
  W.box(-16, CH, 8.5, -12, CH + 0.5, 12, 'ceil', zone);
  const lift = new MovingPlatform(W, { min: [-15.4, -13.1, 8.6], max: [-12.6, -12.5, 11.4], offset: [0, 12.5, 0], speed: 3, pause: 2, active: false, zone });
  W.trigger([-15.4, -12.5, 8.6], [-12.6, -11, 11.4], () => {
    lift.active = true;
    liftHatch.open();
    game.hud.message('Service lift: straight back up to the Quench Line.', 3);
  });

  // ================================================================ BLUE WING — THE SMELTER (every color)
  corridor({ zStart: 0.5, zEnd: 9.5, y: 0, zone, cx: 3.5, e: [{ c: 6.5, w: 3, h: CH }] });
  area([2, 0, 0.5], [5, 3, 3], mood);
  zoneTitle([2, 0, 2], [5, 3, 4], 'FOUNDRY ANNEX', 'THE SMELTER', COLORS[BLUE].css);
  devStart('annexBlue', [3.5, 0, 2.5], Math.PI, [RED, YELLOW, GREEN, BLUE]);

  // Spectrum Hall: four barriers, four colors
  corridorX({ xStart: 5.5, xEnd: 15.5, y: 0, zone, cz: 6.5 });
  barrierWallX(7.5, 0, BLUE, zone, 6.5);
  barrierWallX(9.5, 0, RED, zone, 6.5);
  barrierWallX(11.5, 0, GREEN, zone, 6.5);
  barrierWallX(13.5, 0, YELLOW, zone, 6.5);

  // The Spectrum Lock: four lenses — one plain, one behind a red screen that regrows, one behind a
  // sliding shutter, one facing the ceiling mirror on top of a pillar — must all burn within 12 s.
  room({ x1: 16, x2: 30, zS: 14, zN: 1, y: 0, h: 7, zone, w: [{ c: 6.5, w: 3, h: CH }], s: [{ c: 23, w: 3, h: CH }] });
  new Checkpoint(W, game, { pos: [17.8, 0, 6.5], yaw: -Math.PI / 2, size: [3, 3, 3] });
  const lensDoor = new SlidingDoor(W, { min: [21.5, 0, 14.05], max: [24.5, CH, 14.45], color: BLUE, zone });
  const LENS_TIME = 12;
  const lenses = [];
  let lensClock = 0, lensSolved = false;
  const lensLit = () => lenses.filter((p) => p.active).length;
  const lensStatus = () => game.hud.message(`Lenses <b>${lensLit()}/4</b> · ${Math.ceil(lensClock)} s`, 1.1);
  const onLens = () => {
    if (lensLit() === 4) {
      lensSolved = true;
      lensDoor.open();
      game.hud.message('<b>Spectrum Lock</b> open.', 2.5);
      return;
    }
    if (lensClock <= 0) lensClock = LENS_TIME;
    lensStatus();
  };
  const lens = (min, max, color, face) => lenses.push(new TargetPanel(W, { min, max, color, face, onActivate: onLens }));
  const dimLenses = () => {
    lensClock = 0;
    for (const p of lenses) {
      if (!p.active) continue;
      p.active = false;
      p.mat.emissiveIntensity = 0.18;
      p.glyph.color.set(COLORS[p.color].hex).multiplyScalar(1.1);
      W.fx.reformFlash(p.min, p.max, COLORS[p.color].hex, 'wall');
    }
  };
  lens([18, 4.2, 1], [20.5, 5.7, 1.15], RED, '+z');
  lens([25, 4.2, 1], [27.5, 5.7, 1.15], BLUE, '+z');
  new Barrier(W, { min: [24.6, 3.8, 1.5], max: [27.9, 6.1, 1.7], color: RED, kind: 'wall', regen: 3, zone });
  lens([29.85, 3.6, 4.5], [30, 5.1, 7], YELLOW, '-x');
  new MovingPlatform(W, { min: [29.3, 3.3, 4.3], max: [29.6, 5.4, 7.2], offset: [0, 0, 3.6], speed: 1.4, pause: 1.4, zone, kind: 'metal' });
  W.box(22, 0, 6.5, 24, 3, 8.5, 'metal', zone);
  W.deco(21.95, 2.88, 6.45, 24.05, 2.96, 8.55, 'glow2', zone);
  lens([22.1, 3, 6.6], [23.9, 3.12, 8.4], GREEN, 'up');
  new Mirror(W, { min: [17, 6.85, 2], max: [29, 7, 13] });
  W.add({
    update(dt) {
      if (lensSolved || lensClock <= 0) return;
      const s = Math.ceil(lensClock);
      lensClock -= dt;
      if (lensClock <= 0) {
        dimLenses();
        game.hud.message('Too slow. The lenses dim.', 2.5);
      } else if (Math.ceil(lensClock) !== s) lensStatus();
    },
  });
  onRespawn(() => {
    if (!lensSolved) dimLenses();
  });
  hint([16, 0, 5], [19, 3, 8], `<b>Spectrum Lock</b>: light all four lenses within <b>${LENS_TIME} seconds</b> of each other.`, 5);
  hint([19, 0, 3], [27, 3, 12], `The ${tag(GREEN, 'green')} lens faces the ceiling. <b>Bank a shot off the mirror.</b>`, 4);
  new Drone(W, { pos: [23, 4.6, 11.5], color: [BLUE, GREEN], orbit: 1, range: 16, cycle: 2.6 });

  // the Slag Conveyor: a spiked shuttle east, two spiked slabs, a lift up to a curtained gantry heading
  // back west, and a shielded drop at its end
  room({
    x1: 12, x2: 44, zS: 48, zN: 15, y: -8, h: 20, zone,
    n: [{ c: 23, w: 3, h: CH, y0: 8 }],
    w: [{ c: 46, w: 3, h: CH, y0: 2.4 }],
  });
  W.box(12, -8, 15, 44, -7.6, 48, 'acid', zone, { hazard: 'acid' });
  W.box(20, -8, 15, 26, 0, 19, 'plat', zone);
  W.deco(20, -0.12, 19, 26, -0.04, 19.02, 'glow0', zone);
  area([20, 0, 15], [26, 4, 19], mood);
  new Checkpoint(W, game, { pos: [23, 0, 16.8], yaw: Math.PI, size: [6, 3, 3.5] });
  hint([20, 0, 15], [26, 3, 19], `Shoot the ${tag(BLUE, 'blue')} spikes off the shuttle as it swings back, then ride it east.`, 5);
  new SpikedShuttle(W, { min: [21.5, -0.2, 22], max: [24.5, 0.4, 25], offset: [12, 0, 0], speed: 2.4, pause: 1.2, zone }, BLUE, 8);
  spiked(35, 28, 38, 31, 1.2, GREEN);
  spiked(37, 34, 40, 37, 2.0, YELLOW);
  new MovingPlatform(W, { min: [37, 1.4, 40], max: [40, 2.0, 43], offset: [0, 4.6, 0], speed: 1.8, pause: 1.2, zone });
  W.box(16.5, 6.0, 44.5, 42, 6.6, 47.5, 'plat', zone);
  W.deco(16.5, 6.48, 44.48, 42, 6.56, 44.5, 'glow0', zone);
  new Checkpoint(W, game, { pos: [39.5, 6.6, 46], yaw: Math.PI / 2, size: [3, 3, 3] });
  barrierWallX(34, 6.6, RED, zone, 46);
  barrierWallX(28, 6.6, BLUE, zone, 46);
  barrierWallX(22, 6.6, GREEN, zone, 46);
  new Drone(W, { pos: [30, 5, 31], color: [RED, YELLOW, GREEN, BLUE], range: 22, cycle: 2 });
  new Drone(W, { pos: [25, 10, 41], color: [BLUE, YELLOW], range: 20, cycle: 2.4 });
  light(28, 10, 32, 0xff5533, 55, 40);
  // the drop: a tube in the south-west corner, out through the west wall into the Smelter
  W.box(11.5, -5.6, 43.5, 16.5, 6.2, 44, 'wall', zone);
  W.box(16, -5.6, 44, 16.5, 6.2, 48, 'wall', zone);
  W.box(12, -6.6, 44, 16, -5.6, 48, 'floor', zone);
  shieldedShaft({
    x1: 12, x2: 16, z1: 44, z2: 48, floor: -5.6, capY: 6.2, zone,
    cap: { x1: 11.5, x2: 16.5, z1: 43.5, z2: 48 },
    layers: [{ y: 2.9, color: BLUE }, { y: -0.6, color: RED, shieldY: 2.7 }, { y: -4.1, color: GREEN, shieldY: -0.8 }],
  });
  hint([16.5, 6.6, 44.5], [19, 9, 47.5], `Drop through each shield, then fire: ${tag(BLUE, 'BLUE')} · ${tag(RED, 'RED')} · ${tag(GREEN, 'GREEN')}`, 5);
  W.box(10.5, -6.6, 44.5, 11.5, -5.6, 47.5, 'floor', zone);
  W.box(10.5, -5.6 + CH, 44.5, 11.5, -5.1 + CH, 47.5, 'ceil', zone);
  W.box(10.5, -5.6, 44, 11.5, -5.6 + CH, 44.5, 'wall', zone);
  W.box(10.5, -5.6, 47.5, 11.5, -5.6 + CH, 48, 'wall', zone);

  // The Smelter: climb from the low east ledge around to the glass case on the central pillar (the one
  // in view through the spawn room's grate). A bridge then shuttles you to the blue vestibule's back door.
  room({
    x1: -10, x2: 10, zS: 48, zN: 10, y: -10, h: 24, zone,
    n: [{ c: 0, w: 3, h: CH, y0: 10 }, { c: 3.5, w: 3, h: CH, y0: 10 }],
    e: [{ c: 46, w: 3, h: CH, y0: 4.4 }],
  });
  W.box(-10, -10, 10, 10, -9.6, 48, 'acid', zone, { hazard: 'acid' });
  new Glass(W, { min: [-1.5, 0, 9.6], max: [1.5, CH, 9.7] });
  const homeDoor = new SlidingDoor(W, { min: [2, 0, 9.55], max: [5, CH, 9.95], color: BLUE, zone });
  W.box(6, -10, 43, 10, -5.6, 48, 'plat', zone);
  W.deco(5.98, -5.72, 43, 6, -5.64, 48, 'glow0', zone);
  area([6, -5.6, 43], [10, -2, 48], mood);
  new Checkpoint(W, game, { pos: [8, -5.6, 45.5], yaw: Math.PI / 2, size: [4, 3, 4] });
  hint([6, -5.6, 43], [10, -2.5, 48], 'The <b>Smelter</b>. Climb to the case on the pillar, using every color you own.', 5);
  spiked(0.5, 44, 3.5, 47, -4.6, BLUE);
  new MovingPlatform(W, { min: [-4.5, -4.2, 43], max: [-1.5, -3.6, 46], offset: [0, 0, -11], speed: 2.2, pause: 1, zone });
  spiked(-9.5, 30, -6.5, 33, -2.4, GREEN);
  spiked(-7.5, 24, -4.5, 27, -1.2, RED);
  // the pillar and its case: a yellow wall on the side you climb to, a blue one toward the bridge
  W.box(-2, -10, 24, 3, 0, 29, 'metal', zone);
  W.deco(-2.02, -0.12, 23.98, 3.02, -0.04, 29.02, 'glow0', zone);
  new Barrier(W, { min: [-2.1, 0, 24.1], max: [-1.9, 3, 28.9], color: YELLOW, kind: 'wall', zone });
  const caseFront = new Barrier(W, { min: [-2, 0, 23.9], max: [3, 3, 24.1], color: BLUE, kind: 'wall', zone });
  new Glass(W, { min: [-1.9, 0, 28.9], max: [3, 3, 29.1] });
  new Glass(W, { min: [2.9, 0, 24.1], max: [3.1, 3, 28.9] });
  W.box(-2.2, 3, 23.8, 3.2, 3.3, 29.2, 'metal', zone);
  W.deco(-2.2, 2.92, 23.78, 3.2, 3.0, 23.8, 'glow3', zone);
  const bridge = new MovingPlatform(W, { min: [2, -0.6, 20.8], max: [5, 0, 23.8], offset: [0, 0, -10.7], speed: 2.4, pause: 1.5, active: false, zone });
  caseTrophy = trophy(0.5, 1, 26.5);
  caseTrophy.onCollect = () => {
    if (!caseFront.broken) caseFront.shatter();
    bridge.active = true;
    homeDoor.open();
    game.hud.message('A bridge grinds out toward the north wall: <b>the way home</b>.', 4);
  };
  secretRoom([-1.9, 0, 24.1], [2.9, 3, 28.9], 'Smelter Reliquary');
  new Checkpoint(W, game, { pos: [0.5, 0, 26.5], yaw: 0, size: [3, 3, 3] });
  new Drone(W, { pos: [-6, 2, 38], color: [RED, YELLOW, GREEN, BLUE], range: 20, cycle: 2 });
  new Drone(W, { pos: [5, 3.5, 31], color: [BLUE, RED, YELLOW, GREEN], range: 20, cycle: 2 });
  light(0, 10, 32, 0xff6633, 60, 45);
  devStart('annexConveyor', [23, 0, 17], Math.PI, [RED, YELLOW, GREEN, BLUE]);
  devStart('annexSmelter', [8, -5.6, 45.5], Math.PI / 2, [RED, YELLOW, GREEN, BLUE]);
  devStart('annexPit', [-21, 0, 6.5], Math.PI, [RED, YELLOW, GREEN]);
}

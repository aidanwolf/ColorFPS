// CRIMSON FOUNDRY — the tutorial world: you wake in the cell block (cellblock.js), take the Chroma Blaster in
// the spawn room and fight north to the Atrium. It runs on geothermal heat: lava everywhere, forges, steam.
// Region x -20..20 (z < -38) plus the annex box x -45..45 for z > -38 (redAnnex.js owns z > 0).
//
//   1 SPAWN ROOM (z 0..-12)        the blaster on its pedestal; first shot: the red barrier in the north door
//   2 PROVING HALL (z -12..-30)    a switch opens the inner gate; first drones; a ricochet-only target opens
//                                  the west door (bank red off the yellow panels)
//   3 THE CRUCIBLE (west wing)     platforming over lava: spiked slabs, a crumbling stone, a shot-pushed raft,
//                                  timed phase stones, a jump pad, a trapdoor sprint; a hidden red door (secret)
//   4 THE SLAG RUN (z -36 strip)   a riser block over a lava pit (spam it up, ride it), a trapdoor, a sinker door
//   5 THE GEARWORKS (east wing)    puzzle climb over lava: two spinning bridge slabs, a platform rack staircase,
//                                  a race gate; turrets and a drone harass; a hidden red door (secret)
//   6 THE QUENCH SHAFT             the spike drop (two red layers, shoot through each shield's open end) down
//   7 THE SMELTING FLOOR (z -38..-55.5) ...into the first arena: three waves, red only
//   8 THE FORGE (z -55.5..-90.5)   the Forge Titan's arena and the Geothermal Core (forgeArena.js); shooting
//                                  the core calls game.shutDownWorld('red') and the whole Foundry goes cold
//   9 the stairs up to the Atrium's red port (x 0, floor y 4, z -99.5)
// Shortcuts and secrets for later colors: a YELLOW-caged jump pad on the Crucible's entry ledge + a YELLOW door
// from the Slag Run into the Smelting Floor (spawn ⇄ Atrium in a minute, both ways); the YELLOW vent and the
// YELLOW Solar Cache off the spawn room; the GREEN and BLUE annex wings (redAnnex.js).
import * as THREE from 'three';
import { RED, YELLOW } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { Checkpoint, JumpPad } from '../entities/misc.js';
import { Glass, TargetPanel } from '../entities/puzzle.js';
import { mat } from '../materials.js';
import { buildForgeArena } from './forgeArena.js';
import { dressFoundry } from './redDressing.js';
import { regionOf } from './regions.js';

// A red spike layer covering a Crucible platform. Its regrowth timer holds while you stand on (or hover
// over) the platform, so it never reforms under you or mid-hop; for its last second the spikes visibly
// push back up out of the slab and flicker.
class PlatformSpikes extends Barrier {
  constructor(W, { min, max, regen = 6, zone = 'red' }) {
    super(W, { min, max, color: RED, kind: 'spike', regen, zone });
    this.size = this.max.clone().sub(this.min);
  }

  // player center within the footprint (padded so a landing hop counts) and not far above it
  near(p) {
    const pad = 1.2;
    return p.pos.x > this.min.x - pad && p.pos.x < this.max.x + pad && p.pos.z > this.min.z - pad && p.pos.z < this.max.z + pad &&
      p.pos.y > this.min.y - 1 && p.pos.y < this.max.y + 4;
  }

  // group sits on the slab bottom so the regrowth / reform scaling grows up out of the platform
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

// a cooled-rock skin laid over the Foundry's lava once its power is cut (cracks stay see-through)
let crustTex = null;
function crustTexture() {
  if (crustTex) return crustTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#251d1b';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 18 + Math.random() * 38;
    g.fillStyle = `rgba(${v},${v * 0.85},${v * 0.8},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 2;
  for (let i = 0; i < 22; i++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) g.lineTo((x += (Math.random() - 0.5) * 60), (y += (Math.random() - 0.5) * 60));
    g.stroke();
  }
  crustTex = new THREE.CanvasTexture(c);
  crustTex.wrapS = crustTex.wrapT = THREE.RepeatWrapping;
  crustTex.colorSpace = THREE.SRGBColorSpace;
  return crustTex;
}

// ===================================================================================================
// THE FORGE TITAN — the guardian (entities/forgeTitan.js) and its arena + the Geothermal Core (the
// Foundry's power source) come from forgeArena.js. Everything about the fight lives there; this places it.
// ===================================================================================================
export function placeForgeBoss(B, { onDefeated } = {}) {
  return buildForgeArena(B, {
    center: [0, 0, -73], size: 34, entry: 's', shell: true, height: 14.5, entryLen: 0, exitLen: 0,
    checkpoint: false, // the Smelting Floor's clear sets the checkpoint right outside the door
    trigger: { min: [-15, 0, -70], max: [15, 6, -57] },
    colors: [RED], powerSource: true, world: 'red', music: 'music_miniboss', areaMusic: 'music_red',
    onDefeated,
  });
}

export function buildRed(B) {
  const { W, game, level, CH, room, corridorX, tunnelX, wallX, wallZ, plat, pedestal, secretRoom, trophy, hint, hintEvery, area, light, barrierWall, devStart, glowEdge } = B;
  const zone = 'red';
  const down = () => game.isWorldDown?.('red');
  const foundry = (level.foundry = {}); // state the HUD objective reads (guide.js)

  // ---------------------------------------------------------------- shared set dressing (and its aftermath)
  // Everything that glows with geothermal heat is listed here so the power-down can kill it.
  const lights = []; // [light, base intensity]
  const lit = (x, y, z, color, intensity, dist) => {
    const l = light(x, y, z, color, intensity, dist);
    lights.push([l, intensity, l.color?.clone?.()]);
    return l;
  };
  const forgeMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
  const FORGE_HOT = new THREE.Color(0xff6a1a).multiplyScalar(1.6), FORGE_COLD = new THREE.Color(0x1a0d0a);
  const box = new THREE.BoxGeometry(1, 1, 1);
  // a furnace mouth: a glowing slot in a dark iron frame (frame static, glow a live mesh)
  const furnace = (x1, y1, z1, x2, y2, z2) => {
    const m = new THREE.Mesh(box, forgeMat);
    m.scale.set(Math.max(0.02, x2 - x1), y2 - y1, Math.max(0.02, z2 - z1));
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    W.scene.add(m);
  };
  const lavaPools = []; // [x1, z1, x2, z2, top]: get a crust when the power dies
  const lava = (x1, z1, x2, z2, top, walls = 'nsew') => {
    W.box(x1, top - 0.4, z1, x2, top, z2, 'acid', zone, { hazard: 'acid' });
    lavaPools.push([x1, z1, x2, z2, top, walls]); // (walls: the sides with a wall for the dressing's uplight)
  };
  const vents = []; // steam vents: { p, t, every }
  const vent = (x, y, z, every = 0.22) => {
    W.deco(x - 0.6, y, z - 0.6, x + 0.6, y + 0.06, z + 0.6, 'grate', zone);
    vents.push({ p: new THREE.Vector3(x, y + 0.1, z), t: Math.random(), every });
  };
  const steamCol = new THREE.Color(0xb8b0a8);
  let forgeK = 1; // 1 hot → 0 cold
  W.add({
    update(dt, player) {
      forgeMat.color.copy(FORGE_COLD).lerp(FORGE_HOT, forgeK * (0.85 + 0.15 * Math.sin(W.time * 7.3) * Math.sin(W.time * 3.1)));
      if (forgeK <= 0) return;
      for (const v of vents) {
        if (Math.abs(v.p.x - player.pos.x) > 30 || Math.abs(v.p.z - player.pos.z) > 30) continue;
        if ((v.t -= dt) > 0) continue;
        v.t = v.every / forgeK;
        W.fx.puff(v.p, (Math.random() - 0.5) * 0.4, 2.2 + Math.random(), (Math.random() - 0.5) * 0.4, steamCol, 0.35, 1.6, 0.5, 3.2);
      }
    },
  });
  // mood: the Foundry's music/ambience, and a cold dead atmosphere once its power is cut
  level.atmospheres.foundryCold = {
    fog: 0x0b0c12, fogNear: 25, fogFar: 140, skyTop: [0.01, 0.01, 0.03], skyMid: [0.04, 0.04, 0.07], skyHorizon: [0.1, 0.09, 0.12],
    aurora: 0, stars: 0.3, hemiSky: 0x7f8aa8, hemiGround: 0x1c1a22, hemiIntensity: 0.75, sunColor: 0xa8b4d0, sunIntensity: 0.7,
    exposure: 0.92, bloom: 0.45,
  };
  const mood = (min, max, music = 'music_red') =>
    W.trigger(min, max, () => {
      if (music) game.setMusic(music);
      game.setAmbient('amb_foundry');
      game.setAtmosphere(down() ? 'foundryCold' : 'foundry');
    }, { once: false });

  // ===================================================================== 1. SPAWN ROOM
  room({
    x1: -6, x2: 6, zS: 0, zN: -12, y: 0, h: 6, zone,
    n: [{ c: 0, w: 3, h: CH }],
    s: [{ c: -3.5, w: 2.4, h: 3 }, { c: 0, w: 2.2, h: 1.5, y0: 1.0 }, { c: 3.5, w: 2.4, h: 3 }], // Foundry annex doors + grate (redAnnex.js)
    e: [{ c: -11.2, w: 1.6, h: 1.2, y0: 1.2 }, { c: -9, w: 1.2, h: 1.0 }, { c: -3.8, w: 2.2, h: 2.8 }], // (z -3.8: the door to the cell block, cellblock.js; z -11.2: a window onto the processing chamber, redDressing.js)
    w: [{ c: -6, w: 2.4, h: 3 }],
  });
  new Glass(W, { min: [6.1, 1.2, -12], max: [6.25, 2.4, -10.4] });
  pedestal(0, 0, -6, RED, zone);
  W.deco(-1.2, 5.94, -7.2, 1.2, 6, -4.8, 'glow0', zone); // a lit panel over the pedestal (the blaster has its own glow)
  furnace(-5.98, 0.4, -11.2, -5.94, 1.6, -9.2); // a banked forge in the corner, just for the glow
  W.box(-6, 0, -11.5, -5.4, 2.0, -8.9, 'metal', zone);
  vent(4, 0, -11);
  mood([-6, 0, -12], [6, 6, 0]); // (music_red here also ends the cell block's music_haunt override)
  // first shot: the way north is a red barrier
  barrierWall(-12.25, 0, RED, zone);
  hintEvery([-3, 0, -12], [3, 3, -8.5], 'Barriers only break under <b>their own color</b>. Hold <b>LMB</b> to fire.', 25, 5, () => game.blaster.has);
  // vent hint: hazard stripes above the crawlspace
  W.deco(5.95, 1.0, -9.8, 6.0, 1.2, -8.2, 'hazard', zone);
  W.deco(5.95, 0, -9.75, 6.0, 1.0, -9.6, 'hazard', zone);
  W.deco(5.95, 0, -8.4, 6.0, 1.0, -8.25, 'hazard', zone);

  // SECRET — crawl through the vent, once you're back with yellow: a Solar energy lock seals its mouth
  let ventHinted = false;
  const ventLock = new Barrier(W, {
    min: [6.05, 0, -9.6], max: [6.35, 1.0, -8.4], color: YELLOW, kind: 'wall', zone,
    onBreak: () => game.hud.message('Vent open. Tight squeeze: hold <b>Ctrl</b> or <b>C</b> to crouch and crawl through.', 5),
  });
  W.trigger([4.3, 0, -10.4], [6, 2.2, -7.6], () => {
    if (ventLock.broken || ventHinted || !game.blaster.has) return;
    ventHinted = true;
    game.hud.message('A <b>SOLAR</b> lock seals this vent. Come back once your blaster fires yellow.', 4);
  }, { once: false });
  tunnelX({ x1: 6.5, x2: 13.5, zc: -9, w: 1.2, y: 0, h: 1.0, zone });
  // (set back to z -8.3 so the cell block's north row of cells fits in front of it, cellblock.js; it stops
  // short of the Gearworks' south wall at z -13)
  room({ x1: 14, x2: 18, zS: -8.3, zN: -12.8, y: 0, h: 3, zone, w: [{ c: -9, w: 1.2, h: 1.0 }] });
  trophy(16, 1, -10.5);
  W.deco(14, 2.9, -11, 18, 3, -10, 'glow1', zone);
  secretRoom([14, 0, -12.8], [18, 3, -8.3], 'Maintenance Vent');

  // SECRET — the Solar Cache behind a yellow door in the spawn room's west wall
  new Barrier(W, { min: [-6.5, 0, -7.2], max: [-6, 3, -4.8], color: YELLOW, kind: 'door', zone });
  room({ x1: -13, x2: -7, zS: -3, zN: -9, y: 0, h: 4, zone, e: [{ c: -6, w: 2.4, h: 3 }] });
  trophy(-10, 1, -6);
  W.deco(-12.95, 2.6, -8, -12.9, 2.7, -4, 'glow1', zone);
  W.deco(-12, 3.9, -7, -8, 4, -5, 'glow1', zone);
  secretRoom([-13, 0, -9], [-7, 3, -3], 'Solar Cache');

  // ===================================================================== 2. THE PROVING HALL
  room({
    x1: -7, x2: 7, zS: -12.5, zN: -30.5, y: 0, h: 7, zone,
    s: [{ c: 0, w: 3, h: CH }],
    w: [{ c: -26, w: 3, h: CH }],
    n: [{ c: 0, w: 4, h: 4.4 }], // the ricochet alcove
  });
  mood([-7, 0, -16], [7, 4, -12.5]);
  // the inner gate: a divider with a shutter, opened by a red switch above it
  wallX(-21, -20.5, -7, 7, 0, 7, [{ c: 0, w: 3, y0: 0, h: CH }], zone);
  const innerGate = B.seal([-1.5, 0, -21.05], [1.5, CH, -20.45], { closed: true });
  foundry.innerGate = innerGate;
  const provingDrones = [];
  B.colorSwitch({
    pos: [0, 4.9, -20.5], face: '+z', color: RED, mode: 'once', zone,
    onOn: () => {
      innerGate.open();
      for (const d of provingDrones) d.aggro = true;
    },
  });
  W.trigger([-3, 0, -24], [3, 3, -21.2], () => innerGate.open(), { once: false }); // (coming back the other way)
  hint([-7, 0, -20.4], [7, 3, -17], '<b>Switches</b> work the same way: shoot the red one over the gate.', 4);
  furnace(-6.98, 0.5, -19.5, -6.94, 2.2, -14.5);
  furnace(6.94, 0.5, -19.5, 6.98, 2.2, -14.5);
  vent(-5, 0, -16);
  vent(5, 0, -18.5);
  // the first drones wait beyond the gate
  provingDrones.push(new Drone(W, { pos: [-3, 3, -26], color: RED, orbit: 0.8, range: 13 }));
  provingDrones.push(new Drone(W, { pos: [3.5, 4, -28], color: RED, orbit: 0.6, range: 13 }));
  hint([-7, 0, -24], [7, 3, -21], 'Drones! Keep moving and <b>shoot them down</b>.', 3);
  // The ricochet alcove: a red target on the floor of a high-walled niche behind glass. Its ceiling and
  // walls are YELLOW panels: red can't break them, it bounces off them, so bank a shot in over the glass.
  {
    const ay = 0, top = 4.4, glassTop = 3.2, x1 = -2, x2 = 2, zf = -30.5, zb = -33.75; // (the Slag Run's wall is its back)
    W.box(x1 - 0.5, ay - 1, zb - 0.5, x2 + 0.5, ay, zf, 'floor', zone);
    W.box(x1 - 0.5, ay, zb, x1, top + 0.5, zf, 'wall', zone);
    W.box(x2, ay, zb, x2 + 0.5, top + 0.5, zf, 'wall', zone);
    W.box(x1 - 0.5, top, zb - 0.5, x2 + 0.5, top + 0.5, zf, 'ceil', zone);
    new Glass(W, { min: [x1, ay, zf - 0.2], max: [x2, glassTop, zf - 0.1] });
    W.deco(x1, glassTop, zf - 0.25, x2, glassTop + 0.06, zf - 0.05, 'glow0', zone);
    W.deco(x1, 0.005, zf + 0.6, x2, 0.03, zf + 1.4, 'hazard', zone); // a firing line: from close in, shoot up over the glass
    const panel = (min, max) => new Barrier(W, { min, max, color: YELLOW, kind: 'wall', regen: 2.5, zone });
    panel([x1, top - 0.15, zb], [x2, top, zf - 0.25]);
    panel([x1, 2.6, zb], [x2, top - 0.15, zb + 0.12]);
    panel([x1, ay + 0.12, zb + 0.12], [x1 + 0.1, top - 0.15, zf - 0.25]);
    panel([x2 - 0.1, ay + 0.12, zb + 0.12], [x2, top - 0.15, zf - 0.25]);
    const westGate = B.seal([-7.6, 0, -27.5], [-6.9, CH, -24.5], { closed: true });
    foundry.westGate = westGate;
    let solved = false;
    // the lock: the alcove floor and the lower back wall (no straight shot over the glass reaches either)
    const onActivate = () => {
      if (solved) return;
      solved = true;
      westGate.open();
      game.hud.message('The west gate grinds open: <b>the Crucible</b>.', 3);
    };
    const locks = [
      new TargetPanel(W, { min: [x1 + 0.1, ay, zb + 0.12], max: [x2 - 0.1, ay + 0.12, zf - 0.25], color: RED, face: 'up', onActivate }),
      new TargetPanel(W, { min: [x1 + 0.1, ay + 0.12, zb], max: [x2 - 0.1, 2.6, zb + 0.12], color: RED, face: '+z', onActivate }),
    ];
    locks.forEach((t) => (t.group = locks));
    // coming back from the Crucible side (or after a reload), the gate opens for you
    W.trigger([-10, 0, -27.5], [-7.7, 3, -24.5], () => westGate.open(), { once: false });
    hint([-7, 0, -30.4], [7, 3, -25], 'The lock is <b>on the floor behind the glass</b>. Wrong colors <b>ricochet</b>: bank red off the <b style="color:#ffd23a">yellow</b> panels.', 7);
  }

  // ===================================================================== 3. THE CRUCIBLE
  corridorX({ xStart: -7.5, xEnd: -10, y: 0, zone, cz: -26 });
  const CZ = { S: -13, N: -37 };
  room({
    x1: -44, x2: -10, zS: CZ.S, zN: CZ.N, y: -6, h: 19, zone,
    e: [{ c: -26, w: 3, h: CH, y0: 6 }, { c: -35.75, w: 3, h: CH, y0: 10 }],
    s: [{ c: -41, w: 2.4, h: 3, y0: 7.2 }],
  });
  lava(-44, CZ.N, -10, CZ.S, -5.6);
  mood([-16, 0, -30], [-10, 4, -22]);
  B.zoneTitle([-16, 0, -30], [-12, 4, -22], 'CRIMSON FOUNDRY', 'THE CRUCIBLE', '#ff5533');
  // E0: the entry ledge
  W.box(-16, -6, -30, -10, 0, -22, 'plat', zone);
  glowEdge(-16, -30, -10, -22, 0, 'glow0', zone);
  new Checkpoint(W, game, { pos: [-12, 0, -24], yaw: Math.PI / 2, size: [5, 3, 5] });
  hint([-44, 1.2, -24], [-40, 4, -13], '<b>Blast crabs</b> leap and explode. Shoot them before they reach you — near another, one shot pops both.', 5);
  hint([-16, 0, -30], [-12, 3, -22], 'The slabs are <b>spiked</b>: shoot the spikes off the next one, then jump. The lava is instant death.', 6);
  const spiked = (x1, z1, x2, z2, top, regen = 6) => {
    plat(x1, z1, x2, z2, top, zone);
    return new PlatformSpikes(W, { min: [x1, top, Math.min(z1, z2)], max: [x2, top + 0.6, Math.max(z1, z2)], regen, zone });
  };
  // P1 spiked slab, P2 a stone that crumbles a moment after you land, P3 a raft you push across by shooting it
  spiked(-21, -20, -18, -23, 0.4);
  B.crumble({ min: [-26, 0.2, -23], max: [-23, 0.8, -20], delay: 0.55, respawn: 3, zone });
  hint([-21, 0.4, -23], [-18, 3, -20], 'That stone <b>won\'t hold</b>. Land and go: the raft beyond moves when you <b>shoot it</b>.', 5);
  B.shotMover({ min: [-30, 0.2, -23], max: [-27, 0.8, -20], path: [-9, 0, 0], color: RED, mode: 'push', back: 1.2, zone });
  // P4: the south-west island (a hidden red door in the wall behind it)
  W.box(-44, -6, -24, -40, 1.2, CZ.S, 'plat', zone);
  glowEdge(-44, -24, -40, CZ.S, 1.2, 'glow0', zone);
  new Checkpoint(W, game, { pos: [-42, 1.2, -18], yaw: 0, size: [4, 3, 6] });
  // P5: phase stones north, conjured by a timed orb
  const stoneSet = [
    B.phasePlatform({ min: [-43.5, 1.1, -28.5], max: [-40.5, 1.5, -25.5], color: RED, zone }),
    B.phasePlatform({ min: [-43.5, 1.1, -33], max: [-40.5, 1.5, -30], color: RED, zone }),
  ];
  B.colorSwitch({ pos: [-37, 4.6, -29], style: 'orb', color: RED, mode: 'timed', time: 4, links: stoneSet, zone });
  hint([-44, 1.2, -24], [-40, 4, -20], 'Shoot the <b>orb</b>: the stones hold for 4 seconds. Run!', 5);
  // P7: the north-west island and its jump pad, throwing you east onto P9
  W.box(-44, -6, CZ.N, -37, 1.8, -34.5, 'plat', zone);
  glowEdge(-44, CZ.N, -37, -34.5, 1.8, 'glow0', zone);
  new JumpPad(W, { pos: [-38.8, 1.8, -35.75], power: 13, push: [11.4, 0, 0], color: 0xff9a50 });
  W.box(-31, -6, CZ.N, -27, 4, -33, 'plat', zone);
  glowEdge(-31, CZ.N, -27, -33, 4, 'glow0', zone);
  new Checkpoint(W, game, { pos: [-29, 4, -35], yaw: -Math.PI / 2, size: [4, 3, 4] });
  // P10: a trapdoor bridge (don't stop), straight onto P11's spikes: clear them first, from P9
  W.box(-27, -6, CZ.N, -26, 4, -33, 'plat', zone);
  B.trapdoor({ min: [-26, 3.5, -36.5], max: [-21, 4, -33.5], delay: 0.4, respawn: 3, zone });
  spiked(-21, -33.5, -18, -36.5, 4.4);
  hint([-31, 4, CZ.N], [-27, 7, -33], 'The bridge <b>drops</b> as soon as you touch it. Clear the spikes on the far slab <b>first</b>, then sprint.', 6);
  // E1: the exit ledge, east into the Slag Run
  W.box(-16, -6, CZ.N, -10, 4, -31, 'plat', zone);
  glowEdge(-16, CZ.N, -10, -31, 4, 'glow0', zone);
  new Checkpoint(W, game, { pos: [-13, 4, -34], yaw: -Math.PI / 2, size: [5, 3, 5] });
  B.blastCrab([-42.5, 1.2, -15.5], { color: RED, patrol: 1 }); // waits on the island you raft to
  B.blastCrab([-12.5, 4, -34.5], { color: RED, count: 2, spread: 1.1, patrol: 0.6 }); // a pair on the exit ledge: shoot one, both go
  new Drone(W, { pos: [-30, 5, -19], color: RED, orbit: 1.2, range: 22 });
  new Drone(W, { pos: [-24, 8, -31], color: RED, range: 22 });
  lit(-27, 11, -25, 0xff5533, 60, 42);
  for (const [x, z] of [[-43.95, -18], [-43.95, -30]]) furnace(x, 2.5, z - 2, x + 0.04, 5, z + 2);
  furnace(-30, 3, CZ.N + 0.02, -24, 6, CZ.N + 0.06);
  // YELLOW SHORTCUT (1/2): a caged jump pad on the entry ledge throws you straight up onto the exit ledge
  new JumpPad(W, { pos: [-11.5, 0, -28.6], power: 15, push: [0, 0, -3.6], color: 0xffd23a });
  new Barrier(W, { min: [-12.75, 0.05, -29.85], max: [-10.25, 2.4, -27.35], color: YELLOW, kind: 'wall', zone });
  hintEvery([-14, 0, -30], [-10, 3, -26.5], 'A jump pad in a <b style="color:#ffd23a">SOLAR</b> cage. Something to come back for.', 40, 4, () => !game.blaster.unlocked[YELLOW]);
  // SECRET (first visit): a disguised red door in the wall behind the south-west island
  new Barrier(W, { min: [-42.2, 1.2, -13.05], max: [-39.8, 4.2, -12.45], color: RED, kind: 'door', zone });
  room({ x1: -44, x2: -38, zS: -7.5, zN: -12.5, y: 1.2, h: 3.5, zone, n: [{ c: -41, w: 2.4, h: 3 }] });
  trophy(-41, 2.2, -10);
  W.deco(-43.9, 3.6, -11.5, -43.85, 3.7, -8.5, 'glow0', zone);
  secretRoom([-44, 1.2, -12.4], [-38, 4.4, -7.5], 'Crucible Hoard');

  // ===================================================================== 4. THE SLAG RUN
  const SZ = -35.75; // the strip between the Proving Hall and the Smelting Floor, floor y 4
  const S1 = SZ - 1.5, S2 = SZ + 1.5;
  const strip = (xa, xb, floor = true) => {
    if (floor) W.box(xa, 3, S1 - 0.5, xb, 4, S2 + 0.5, 'floor', zone);
    W.box(xa, 4 + CH, S1 - 0.5, xb, 4.5 + CH, S2 + 0.5, 'ceil', zone);
  };
  strip(-9.5, -3);
  strip(-3, 7, false);
  strip(7, 9);
  wallX(S2, S2 + 0.5, -9.5, 9, -0.6, 4 + CH, [], zone);
  wallX(S1 - 0.5, S1, -9.5, 9, -0.6, 4 + CH, [{ c: -8, w: 3, y0: 4, h: CH }], zone); // (door into the Smelting Floor's perch)
  W.deco(-9.5, 4.02, S1, 9, 4.1, S1 + 0.06, 'glow0', zone);
  W.deco(-9.5, 4.02, S2 - 0.06, 9, 4.1, S2, 'glow0', zone);
  mood([-9.5, 4, S1], [-7, 7, S2]);
  // the pit: lava 4 m down, a riser block in the middle (spam it up, ride it, hop off before it sinks)
  W.box(-3, -0.6, S1, 7, 0, S2, 'floor', zone);
  W.box(-9.5, -0.6, S1, -3, 3, S2, 'wall', zone); // (solid under the floor at both ends of the pit)
  W.box(7, -0.6, S1, 9, 3, S2, 'wall', zone);
  lava(-3, S1, 7, S2, 0.4);
  glowEdge(-9.5, S1, -3, S2, 4, 'glow0', zone);
  B.riser({ min: [-0.5, 0.4, S1 + 0.2], max: [2.5, 1.4, S2 - 0.2], rise: 2.6, color: RED, zone });
  hint([-9, 4, S1], [-4, 7, S2], 'A <b>riser</b>: spam shots into it and it climbs; it sinks the moment you stop. Ride it across.', 6);
  // then a trapdoor stretch over the same pit, and solid floor to the Gearworks' door
  B.trapdoor({ min: [5.5, 3.5, S1], max: [7, 4, S2], delay: 0.25, respawn: 2.5, zone });
  W.box(4, 3, S1, 5.5, 4, S2, 'floor', zone);
  glowEdge(4, S1, 5.5, S2, 4, 'glow0', zone);
  B.blastCrab([5, 4, SZ], { color: RED, count: 2, spread: 0.7, patrol: 0.3 });
  // YELLOW SHORTCUT (2/2): the door into the Smelting Floor's perch
  new Barrier(W, { min: [-9.5, 4, -38.3], max: [-6.5, 4 + CH, -37.2], color: YELLOW, kind: 'wall', zone });
  // the sinker door into the Gearworks
  B.sinker({ min: [9, 4, S1], max: [9.6, 4 + CH, S2], color: RED, zone });
  hint([4, 4, S1], [9, 7, S2], 'Shoot the <b>sinker</b> down and walk over it: it rises again once you stop.', 4);

  // ===================================================================== 5. THE GEARWORKS
  const GX1 = 9.5, GX2 = 44, GS = -13.5, GN = -37.5;
  room({
    x1: GX1, x2: GX2, zS: GS, zN: GN, y: -3, h: 17, zone,
    w: [{ c: SZ, w: 3, h: CH, y0: 7 }],
    n: [{ c: 15, w: 3, h: CH, y0: 13 }],
    s: [{ c: 39, w: 2.4, h: 3, y0: 7 }],
  });
  lava(GX1, GN, GX2, GS, -2.6);
  mood([GX1, 4, -37.2], [13, 7, -34]);
  B.zoneTitle([GX1, 4, -37.2], [14, 7, -31], 'CRIMSON FOUNDRY', 'THE GEARWORKS', '#ff5533');
  // W0: the entry ledge
  W.box(GX1, -3, GN, 16, 4, -30.5, 'plat', zone);
  glowEdge(GX1, GN, 16, -30.5, 4, 'glow0', zone);
  new Checkpoint(W, game, { pos: [12, 4, -33], yaw: -Math.PI / 2, size: [4, 3, 4] });
  // G1: two bridge slabs that spin a quarter turn per hit: line them up with the walkway
  B.shotRotor({ pivot: [20, 4, -33.5], axis: 'y', color: RED, start: 1, correct: [0, 2], parts: [[-4, -0.6, -1.4, 4, 0, 1.4]], zone });
  B.shotRotor({ pivot: [27.8, 4, -33.5], axis: 'y', color: RED, start: 3, correct: [0, 2], parts: [[-3.7, -0.6, -1.4, 3.7, 0, 1.4]], zone }); // (24.1..31.5: clear of anyone on the first)
  hint([GX1, 4, GN], [16, 7, -30.5], 'Those slabs <b>turn a quarter</b> every time you shoot them. Line them up into a bridge.', 5);
  // E: the east floor, all the way to the south wall
  W.box(31.5, -3, GN, GX2, 4, GS, 'plat', zone);
  glowEdge(31.5, GN, GX2, GS, 4, 'glow0', zone);
  new Checkpoint(W, game, { pos: [37, 4, -26], yaw: Math.PI / 2, size: [5, 3, 5] });
  // a welder holds the east floor: crates for cover (his and yours)
  for (const [x, z, w, d, h] of [[35.5, -31, 1.4, 1.4, 1.3], [40.5, -27, 1.6, 1.2, 1.1], [37, -22.5, 1.2, 1.2, 1.4], [42, -34.5, 1.2, 1.6, 1.2]]) {
    W.box(x - w / 2, 4, z - d / 2, x + w / 2, 4 + h, z + d / 2, 'metal', zone);
    W.deco(x - w / 2 - 0.02, 4 + h - 0.1, z - d / 2 - 0.02, x + w / 2 + 0.02, 4 + h - 0.04, z + d / 2 + 0.02, 'hazard', zone);
  }
  B.welder([40, 4, -30], { color: RED, range: 26 });
  // G2: the platform rack on the south wall: shoot its arrows to stair the ledges up to the west landing
  B.platformRack({ pos: [29, 4, GS], face: '-z', along: [-1, 0, 0], columns: 4, notches: 5, step: 1.2, spacing: 3.4, start: [3, 0, 5, 1], color: RED, width: 2.4, depth: 1.8, targetGap: 1.0, zone });
  hint([31.5, 4, -20], [GX2, 7, GS], '<b>Platform rack</b>: the arrow targets above and below each rail move that ledge. Stair them up to the west landing.', 7);
  // T: the west landing (y 8.8), the catwalk north along the west wall, and the top landing at the exit
  W.box(GX1, -3, -20, 16.5, 8.8, GS, 'plat', zone);
  glowEdge(GX1, -20, 16.5, GS, 8.8, 'glow0', zone);
  new Checkpoint(W, game, { pos: [13, 8.8, -16.5], yaw: Math.PI, size: [4, 3, 4] });
  plat(GX1, -26, 13, -20, 8.8, zone, 0.5, 'grate');
  plat(GX1, -33, 13, -29, 8.8, zone, 0.5, 'grate');
  B.crumble({ min: [GX1, 8.3, -29], max: [13, 8.8, -26], delay: 0.45, respawn: 2.5, kind: 'grate', zone }); // don't stop mid-race
  W.box(GX1, 8.3, GN, 17.5, 8.8, -33, 'plat', zone);
  for (let k = 0; k < 3; k++) W.box(13.5, 8.8, GN, 16.5, 9.2 + 0.4 * k, -35 - 0.85 * k, 'plat', zone); // steps up to the door
  glowEdge(GX1, GN, 17.5, -33, 8.8, 'glow0', zone);
  // G3: the race gate on the exit door, its switch back on the south wall over the west landing
  B.timedGate({ min: [13.5, 10, -37.95], max: [16.5, 10 + CH, -37.55], color: RED, time: 4.2, zone, switch: { pos: [12, 11.2, GS], face: '-z' } });
  hint([GX1, 8.8, -20], [16.5, 12, GS], 'The <b>exit gate</b> opens for 4 seconds. Shoot the switch, then run the catwalk!', 5);
  // harassment: turrets on the walls, a drone over the lava
  B.turret([43.95, 8, -28], RED, { mount: [-1, 0, 0] });
  B.turret([27, 9.5, -37.45], RED, { mount: [0, 0, 1] });
  new Drone(W, { pos: [22, 9, -24], color: RED, orbit: 1.5, range: 20 });
  lit(26, 9.5, -25, 0xff6a33, 40, 42); // (low enough not to blow out the ceiling)
  for (const x of [20, 36]) furnace(x - 2, 5.5, GN + 0.02, x + 2, 8, GN + 0.06);
  vent(40, 4, -34);
  vent(34, 4, -22);
  vent(12, 4, -36);
  // SECRET (first visit): a disguised red door in the south wall of the east floor
  new Barrier(W, { min: [37.8, 4, -13.55], max: [40.2, 7, -12.95], color: RED, kind: 'door', zone });
  room({ x1: 36, x2: 42, zS: -8, zN: -13, y: 4, h: 3.5, zone, n: [{ c: 39, w: 2.4, h: 3 }] });
  trophy(39, 5, -10.5);
  W.deco(36.05, 6.6, -12, 36.1, 6.7, -9, 'glow0', zone);
  secretRoom([36, 4, -12.9], [42, 7.4, -8], 'Pressure Vault');

  // ===================================================================== 6. THE QUENCH SHAFT (spike drop)
  // From the Gearworks' top door straight down a shaft in the Smelting Floor's south-east corner.
  const QX1 = 13, QX2 = 17, QZ1 = -42.5, QZ2 = -38.5;
  wallZ(12.5, 13, -43, -38, 0, 14.5, [{ c: -40.5, w: 3, y0: 0, h: 2 }], zone); // low opening out at the bottom
  W.box(17, 0, -43, 19.5, 14.5, -38, 'wall', zone);
  W.box(12.5, 0, -43, 17, 14.5, QZ1, 'wall', zone);
  W.box(13, 10 + CH, -38.5, 17, 14.5, -38, 'wall', zone); // (above the door in the Gearworks' wall)
  W.box(12.5, 14.5, -43, 19.5, 15, -37.5, 'ceil', zone);
  W.deco(QX1, 13.9, QZ1, QX2, 14, QZ2, 'glow0', zone);
  B.shieldedShaft({ x1: QX1, x2: QX2, z1: QZ1, z2: QZ2, floor: 0, capY: 10, zone, cap: { x1: QX1, x2: QX2, z1: QZ1, z2: -37.5 }, layers: [{ color: RED }, { color: RED }] });
  hint([13.6, 10, GN], [17.5, 13, -34], 'A <b>spike drop</b>. The shields swallow shots: fire through each one\'s <b>glowing open end</b> — the first from here, the next as you fall.', 7);
  new Checkpoint(W, game, { pos: [15.5, 10, -35], yaw: 0, size: [3.5, 3, 3.5] });

  // ===================================================================== 7. THE SMELTING FLOOR (arena)
  const AX1 = -19.5, AX2 = 19.5, AS = -38.5, AN = -55.5, AH = 10;
  W.box(-17.8, -1, AN, AX2 + 0.5, 0, AS + 0.5, 'floor', zone);
  W.box(AX1 - 0.5, -1, AN, -17.8, 0, -53.5, 'floor', zone);
  W.box(AX1 - 0.5, -1, -43.5, -17.8, 0, AS + 0.5, 'floor', zone);
  // ceiling with a hole for the shaft
  W.box(AX1 - 0.5, AH, AN, 12.5, AH + 0.5, AS + 0.5, 'ceil', zone);
  W.box(12.5, AH, AN, AX2 + 0.5, AH + 0.5, -43, 'ceil', zone);
  wallX(AS, AS + 0.5, AX1 - 0.5, AX2 + 0.5, 0, AH, [{ c: -8, w: 3, y0: 4, h: CH }], zone);
  wallZ(AX1 - 0.5, AX1, AN, AS, 0, AH, [], zone);
  wallZ(AX2, AX2 + 0.5, AN, AS, 0, AH, [], zone);
  // (the north wall is the Forge's own south wall, door at x 0; it's 35 m wide, so close the corners)
  W.box(AX1 - 0.5, 0, AN - 0.5, -17.5, AH, AN, 'wall', zone);
  W.box(17.5, 0, AN - 0.5, AX2 + 0.5, AH, AN, 'wall', zone);
  for (const x of [AX1, AX2 - 0.05]) W.deco(x, 4.2, AN, x + 0.05, 4.28, AS, 'glow0', zone);
  // the shortcut perch (yellow door from the Slag Run) with steps down
  W.box(-11, 0, AS, -5, 4, -41.5, 'plat', zone);
  glowEdge(-11, AS, -5, -41.5, 4, 'glow0', zone);
  for (let k = 1; k <= 3; k++) W.box(-5, 0, AS, -5 + k * 0.9, 4 - k, -41.5, 'plat', zone);
  // cover: four pillars, low walls, a forge on the north side, a mortar balcony
  for (const [x, z] of [[-11, -45.5], [9, -45.5], [-11, -51.5], [9, -51.5]]) {
    W.box(x - 0.9, 0, z - 0.9, x + 0.9, AH, z + 0.9, 'metal', zone);
    W.deco(x - 0.95, 2.6, z - 0.95, x + 0.95, 2.7, z + 0.95, 'glow0', zone);
  }
  W.box(-4, 0, -47.7, 4, 1.3, -47.1, 'metal', zone);
  W.box(-17, 0, -50, -14.5, 1.3, -49.4, 'metal', zone);
  W.box(14.5, 0, -50, 17, 1.3, -49.4, 'metal', zone);
  furnace(-17, 0.6, AN + 0.02, -11, 3.2, AN + 0.06);
  furnace(11, 0.6, AN + 0.02, 17, 3.2, AN + 0.06);
  W.box(-18, 3.6, AN + 0.06, -10, 4.0, AN + 1.2, 'metal', zone);
  W.box(10, 3.6, AN + 0.06, 18, 4.0, AN + 1.2, 'metal', zone);
  vent(-15, 0, -42);
  vent(6, 0, -42);
  // overhead: two gantry beams with a slag ladle hanging between them, lit from inside
  for (const z of [-44.5, -50.5]) {
    W.box(AX1, 8.6, z - 0.4, AX2, 9.4, z + 0.4, 'metal', zone);
    W.deco(AX1, 8.55, z - 0.42, AX2, 8.62, z + 0.42, 'glow0', zone);
  }
  W.box(-3, 6.2, -49, 3, 8.6, -46, 'metal', zone);
  furnace(-2.6, 6.15, -48.6, 2.6, 6.2, -46.4);
  for (const x of [-2.5, 2.5]) W.box(x - 0.1, 8.6, -47.6, x + 0.1, 9.4, -47.4, 'metal', zone);
  // a lava runnel along the west wall: mind your feet while you dodge
  W.box(AX1 - 0.5, -1.4, -53.5, -17.8, -0.9, -43.5, 'wall', zone);
  lava(AX1 + 0.1, -53.4, -17.9, -43.6, -0.5, 'w');
  glowEdge(AX1, -53.5, -17.8, -43.5, 0, 'hazard', zone);
  mood([AX1, 0, AN], [AX2, AH, AS]);
  hint([12, 0, -42.5], [13, 2, -38.5], 'The <b>Smelting Floor</b>. The door north is the Forge.', 3);
  // ARMOR: three one-hit shields for players who move: up on the shortcut perch (climb the steps), over
  // the lava runnel along the west wall (lean out from its edge), and tucked behind the east low wall by the
  // turret's forge. They come back 30 s after you take one, and every time you respawn.
  B.armor([-9.5, 4, -40]);
  B.armor([-18.5, 0, -48.5], { base: false }); // lean out over the lava from the runnel's edge
  B.armor([15.8, 0, -51.6]);
  const bossDoorSeal = { min: [-1.6, 0, AN + 0.1], max: [1.6, CH, AN + 0.6] };
  const smelting = B.encounter({
    trigger: [[AX1 + 0.5, 0, AN + 1], [12, 3, -43]],
    seals: [
      { min: [-9.6, 4, -38.9], max: [-6.4, 4 + CH, -38.4] }, // the shortcut door slams behind you too
      { ...bossDoorSeal, closed: true },
    ],
    title: 'THE SMELTING FLOOR', sub: 'HOSTILES INBOUND', music: 'music_combat',
    checkpoint: { pos: [0, 0, -52.5], yaw: 0 },
    waves: [
      [
        { type: 'drone', pos: [-6, 4, -49], color: RED },
        { type: 'drone', pos: [6, 5, -50], color: RED },
      ],
      [
        { type: 'drone', pos: [-14, 5, -52], color: RED },
        { type: 'drone', pos: [14, 4, -47], color: RED },
        { type: 'drone', pos: [0, 6, -53], color: RED, delay: 1 },
        { type: 'swarm', pos: [0, 4, -45], color: RED, count: 5, delay: 2.2 },
        { type: 'blastCrab', pos: [-15, 0, -53], color: RED, delay: 3 },
        { type: 'blastCrab', pos: [-14, 0, -54], color: RED, delay: 3.2 },
        { type: 'blastCrab', pos: [15, 0, -53], color: RED, delay: 4.5 },
      ],
      { title: 'HEAVIES', enemies: [
        { type: 'brute', pos: [0, 1.5, -52], color: RED },
        { type: 'welder', pos: [-14, 0, -46], color: RED, delay: 2 },
        { type: 'turret', pos: [-14, 4, AN + 0.65], color: RED, mount: 'floor', delay: 0.8 },
        { type: 'turret', pos: [14, 4, AN + 0.65], color: RED, mount: 'floor', delay: 1.2 },
        { type: 'drone', pos: [-12, 5, -44], color: RED, delay: 3 },
        { type: 'swarm', pos: [10, 4, -48], color: RED, count: 5, delay: 5 },
      ] },
    ],
  });

  // ===================================================================== 8. THE FORGE (guardian + power source)
  foundry.smelting = smelting;
  foundry.forge = placeForgeBoss(B, {
    onDefeated: () => game.hud.message('The Foundry\'s heart is cold. <b>North</b>, up the stairs, to the Atrium.', 5),
  });
  mood([-16, 0, -88], [16, 6, -60], null);
  // ===================================================================== 9. THE STAIRS UP TO THE ATRIUM
  const ZE = -90.5, ZH = -99.5;
  for (let k = 0; k < 10; k++) {
    const z0 = ZE - k * 0.9;
    W.box(-2, -1, z0 - 0.9, 2, 0.4 * (k + 1), z0, 'floor', zone);
    W.deco(-1.5, 0.4 * (k + 1) - 0.06, z0 - 0.06, 1.5, 0.4 * (k + 1) + 0.01, z0, 'glow0', zone);
  }
  W.box(-2, 0, ZH, -1.5, 7.6, ZE, 'wall', zone);
  W.box(1.5, 0, ZH, 2, 7.6, ZE, 'wall', zone);
  W.box(-2, 7.2, ZH, 2, 7.7, ZE, 'ceil', zone);
  area([-1.5, 4, -99.5], [1.5, 7, -95], { music: 'music_red', ambient: 'amb_foundry' });
  new Checkpoint(W, game, { pos: [0, 3.6, -97.5], yaw: 0, size: [3, 3, 3] });

  // ---------------------------------------------------------------- the power-down aftermath
  // The Forge's core calls game.shutDownWorld('red'); everything geothermal here dies with it: the lava
  // crusts over, the forges and vents go cold, the lights sink to embers, the neon trim dims, the
  // atmosphere turns grey, and the Smelting Floor stays quiet on the way back.
  const crustMat = new THREE.MeshStandardMaterial({ map: crustTexture(), color: 0x8a7a72, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
  for (const [x1, z1, x2, z2, top] of lavaPools) {
    const g = new THREE.PlaneGeometry(x2 - x1, z2 - z1).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x2 - x1)) / 6, (uv.getY(i) * (z2 - z1)) / 6);
    const m = new THREE.Mesh(g, crustMat);
    m.position.set((x1 + x2) / 2, top + 0.24, (z1 + z2) / 2);
    m.renderOrder = 1;
    W.scene.add(m);
  }
  const dress = dressFoundry(B, { pools: lavaPools });
  const glowMat = mat('glow0', zone), glowBase = glowMat.color.clone(), COLD_LIGHT = new THREE.Color(0x6a7aa0);
  let fade = null; // { t, from } while dying
  const apply = (k) => {
    forgeK = k;
    dress.setHeat(k);
    crustMat.opacity = 0.92 * (1 - k);
    glowMat.color.copy(glowBase).multiplyScalar(0.3 + 0.7 * k);
    for (const [l, base, col] of lights) {
      l.intensity = base * (0.12 + 0.88 * k);
      if (col) l.color.copy(col).lerp(COLD_LIGHT, 0.7 * (1 - k));
    }
  };
  const quiet = () => {
    if (smelting.state !== 'cleared') {
      smelting.reset();
      smelting.state = 'cleared';
      smelting.trigger.enabled = false;
      for (const s of smelting.seals) s.open(true);
    }
  };
  W.add({
    update(dt) {
      if (!fade) return;
      fade.t += dt;
      // a few last sputters, then a slow slide into the cold
      const k = Math.max(0, 1 - fade.t / 4.5);
      apply(k * (fade.t < 1.5 ? 0.75 + 0.25 * Math.sin(fade.t * 40) : 1));
      if (k <= 0) fade = null;
    },
  });
  game.onPowerDown?.((name, { restored } = {}) => {
    if (name !== 'red') return;
    quiet();
    if (restored) {
      apply(0);
      // (a save restore picks its atmosphere from the area table after this runs; Solar and Azure reach
      // north past the Hub's south wall too, so ask the region table, not just z)
      let once = false;
      W.add({ update(dt, player) { if (!once) { once = true; if (regionOf(player.pos) === 'red') game.setAtmosphere('foundryCold'); } } });
    } else {
      fade = { t: 0 };
      game.setAtmosphere('foundryCold');
    }
  });

  // ---------------------------------------------------------------- dev starts
  devStart('red', [0, 0, -2], 0, []);
  devStart('red1', [0, 0, -14], 0, [RED]); // Proving Hall
  devStart('red2', [-12, 0, -26], Math.PI / 2, [RED]); // the Crucible
  devStart('crucible', [-12, 0, -26], Math.PI / 2, [RED]);
  devStart('red3', [-8.5, 4, SZ], -Math.PI / 2, [RED]); // the Slag Run
  devStart('red4', [12, 4, -33], -Math.PI / 2, [RED]); // the Gearworks
  devStart('red5', [15.5, 10, -35], 0, [RED]); // the Quench Shaft
  devStart('red6', [8, 0, -40.5], Math.PI / 2, [RED]); // the Smelting Floor
  devStart('red7', [0, 0, -53.5], 0, [RED]); // the Forge door
  devStart('red8', [0, 4, -97], Math.PI, [RED]); // the stairs from the Atrium
  devStart('redShortcut', [-12, 0, -26], 0, [RED, YELLOW]);
}

// AZURE, SECOND HALF — with the AZURE core in hand you climb back up on the water (called from azure.js):
//   Core Sanctum (y -56, the Dynamo) → THE BLUE SPAN (platforming over the abyss in the rain: a long
//   runway you hose down for a SLICK LEAP over an 8.8 m gap, then a timed blue switch for a phase bridge
//   over a trapdoor) → through the east cliff → THE UNDERCROFT (a half-flooded cistern hall: an encounter
//   fought above and below the surface, all blue machines under off-color shields; then the duct's
//   gate winch, which only the hall's maintenance seal can reach: paint it a path of water along the
//   east walkway while crawlers hunt it) → its exit is underwater: a duct into THE SLUICE (puzzle: a 60 m shaft you flood by spam-shooting blue pump valves, ride up on the
//   rising water, with a wall of shoot-to-move ledges between the two stages) → the gallery (y -7.7) →
//   THE DROWNED CISTERN (leviathanArena.js: Charybdis, and the AZURE ENGINE, the world's power source)
//   → shoot the engine down → the pressure lock on the gallery opens → THE SPILLWAY: jump pads up across
//   the chasm to the Hub's east balcony port (x 25, y 12, z -136).
// The engine's output runs to the Atrium's reactor in a glass conduit (water racing through it) that
// crosses the chasm and enters the Hub's east wall at (25, 14, -118). When the engine dies the aftermath
// (onPowerDown('azure'), also replayed instantly after a reload) drains that conduit, kills the world's
// blue trims and lights, stills its vortex tubes and horizontal currents, and darkens its atmosphere.
// The way home never depends on the engine: jump pads, valves and gravity-fed pipes all keep working.
import * as THREE from 'three';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { Drone } from '../entities/drone.js';
import { Checkpoint, JumpPad } from '../entities/misc.js';
import { VortexTunnel } from '../entities/vortex.js';
import { mat } from '../materials.js';
import { RoboSeal, ScrapCrawler, Junction, Route } from '../entities/waterPuzzle.js';
import { SpawnPortal } from '../entities/combat.js';
import { waterSurface } from '../liquid.js';
import { audio } from '../audio.js';
import { regionOf } from './regions.js';
import { buildLeviathanArena } from './leviathanArena.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildAzureSpillway(B, { zone, MOOD, DEEP, keepOut }) {
  const { W, game, level, CH, room, corridor, corridorX, plat, hint, area, light, devStart, glowEdge, onRespawn } = B;
  const box = (x1, y1, z1, x2, y2, z2, kind = 'wall') => W.box(x1, y1, z1, x2, y2, z2, kind, zone);
  const deco = (x1, y1, z1, x2, y2, z2, kind = 'glow3') => W.deco(x1, y1, z1, x2, y2, z2, kind, zone);
  const RYGB = [RED, YELLOW, GREEN, BLUE];
  const st = level.azure;

  // ================================================================== THE BLUE SPAN (y -56)
  // A broken catwalk from the sanctum's east door to the east cliff, z -148.5..-143.5, over the abyss
  // (falling = the void: you're faded back to the deck's checkpoint).
  const SY = -56, SZ = -146;
  // D0: a long runway (12.5 m) from the door out to the gap: hose it down, sprint and leap
  plat(80.5, SZ - 2.5, 93, SZ + 2.5, SY, zone, 1);
  for (let x = 82, k = 0; x < 92; x += 2, k++) W.deco(x, SY + 0.005, SZ - 0.6, x + 1, SY + 0.02, SZ + 0.6, k % 2 ? 'hazard' : 'glow3', zone);
  new Checkpoint(W, game, { pos: [83.5, SY, SZ], yaw: -Math.PI / 2, size: [3, 3, 4] });
  area([80.5, SY, SZ - 2.5], [84, SY + 3, SZ + 2.5], DEEP);
  hint([80.5, SY, SZ - 2.5], [86, SY + 3, SZ + 2.5], 'A gap too far to jump dry. <b>Soak the runway</b> end to end, then <b>sprint</b> down it and jump at the very edge.', 6);
  // D1 (across the gap): the west half solid, the east half a trapdoor (keep moving), a timed blue switch
  // on a pylon for the phase bridge on to D2
  plat(101.8, SZ - 2.5, 104.6, SZ + 2.5, SY, zone, 1);
  B.trapdoor({ min: [104.6, SY - 0.4, SZ - 2.5], max: [107, SY, SZ + 2.5], delay: 0.45, respawn: 3, zone });
  box(102.6, -80, -151.6, 104, SY + 4.5, -150.6, 'metal'); // the pylon (the switch faces the deck)
  deco(102.5, SY + 4.5, -151.7, 104.1, SY + 4.6, -150.5);
  new Checkpoint(W, game, { pos: [103.3, SY, SZ], yaw: -Math.PI / 2, size: [2.4, 3, 4] });
  const bridge = [[108, SZ - 1.2, 110.5, SZ + 1.2]].map(([x1, z1, x2, z2]) =>
    B.phasePlatform({ min: [x1, SY - 0.4, z1], max: [x2, SY, z2], color: BLUE, zone }));
  B.colorSwitch({ pos: [103.3, SY + 2.2, -150.6], face: '+z', color: BLUE, mode: 'timed', time: 6, links: bridge, zone, light: false });
  hint([102, SY, SZ - 2.5], [104.6, SY + 3, SZ + 2.5], 'Hose the <b style="color:#3a8bff">blue</b> switch on the pylon: the bridge holds for <b>6 s</b>. Don\'t stop on the trapdoor.', 5);
  plat(110.5, SZ - 2.5, 112.2, SZ + 2.5, SY, zone, 1); // D2, at the cliff
  // the span's sentries: a turret on a pylon to the south, drones off to the sides
  box(91, -80, -140.6, 93, SY + 3.4, -138.6, 'metal');
  deco(90.9, SY + 3.4, -140.7, 93.1, SY + 3.5, -138.5);
  B.turret([92, SY + 3.5, -139.6], BLUE, { mount: 'floor', cooldown: 3, shields: [YELLOW] });
  new Drone(W, { pos: [98, SY + 4.5, -151], color: BLUE, shields: [RED], range: 22 });
  new Drone(W, { pos: [106, SY + 4.5, -141.5], color: BLUE, shields: [GREEN, YELLOW], range: 22 });
  // ice piers under the decks
  for (const [x1, x2] of [[81.5, 92], [102, 104.4], [110.8, 112]]) deco(x1, -80, SZ - 1.8, x2, SY - 1, SZ + 1.8, 'rock');
  keepOut.push([[80, SY - 2, SZ - 3.5], [121, SY + 5, SZ + 3.5]]);

  // ---- through the cliff, then north to the Undercroft
  corridorX({ xStart: 112.2, xEnd: 120.5, y: SY, zone, cz: SZ, n: [{ c: 119, w: 3, h: CH }] });
  box(120.5, SY, SZ - 1.5, 121, SY + CH, SZ + 1.5);
  corridor({ zStart: -147.5, zEnd: -159.5, y: SY, zone, cx: 119 });
  area([117.5, SY, -150], [120.5, SY + 3, -147.5], DEEP);
  new Checkpoint(W, game, { pos: [119, SY, -155], yaw: 0, size: [3, 3, 2] }); // before the Undercroft

  // ================================================================== THE UNDERCROFT (combat)
  // interior x 117..157, z -160..-194, floor y -69, ceiling y -44; flooded to y -56.3. Walkways (y -56)
  // ring it and stepping stones cross it; its way out is an underwater duct in the east wall.
  // (the walkways stand 1.3 m above the water, 0.8 m clear underneath: surface under one and you can
  // still breathe; submerged steps lead back up onto each)
  const HY = -69, HW = -57.3, HT = -56;
  room({ x1: 117, x2: 157, zS: -160, zN: -194, y: HY, h: 25, zone, s: [{ c: 119, w: 3, h: CH, y0: HT - HY }], e: [{ c: -164, w: 3, h: 3, y0: 6 }], wallKind: 'rock' });
  B.water([117, HY, -194], [157, HW, -160]);
  for (const [x1, z1, x2, z2] of [[117, -166, 123, -160], [117, -194, 120, -166], [120, -194, 157, -191], [152.5, -191, 157, -167.5], [123.5, -178.5, 126, -175.5], [130, -182, 142, -172], [146, -178.5, 148.5, -175.5]]) {
    plat(x1, z1, x2, z2, HT, zone, 0.5);
    // pillars hold them up out of the murk
    for (const [x, z] of [[x1 + 0.6, z1 + 0.6], [x2 - 0.6, z2 - 0.6]]) deco(x - 0.3, HY, z - 0.3, x + 0.3, HT - 0.6, z + 0.3, 'metal');
  }
  // steps up out of the water (0.4 m rises, so you just swim up them): from the walkway edge point (x, z)
  // out into the water along (dx, dz), from 0.4 m under the walkway down past a floating swimmer's feet
  const steps = (x, z, dx, dz, w = 2.4, top = HT, n = 6, d = 0.7) => {
    for (let k = 0; k < n; k++) {
      const a = d * k, b = d * (k + 1);
      const px1 = dx ? x + dx * a : x - w / 2, px2 = dx ? x + dx * b : x + w / 2;
      const pz1 = dz ? z + dz * a : z - w / 2, pz2 = dz ? z + dz * b : z + w / 2;
      plat(Math.min(px1, px2), Math.min(pz1, pz2), Math.max(px1, px2), Math.max(pz1, pz2), top - 0.4 * (k + 1), zone, 0.3);
    }
  };
  steps(123, -163, 1, 0); steps(120, -184, 1, 0); steps(138, -191, 0, 1); steps(130, -177, -1, 0); steps(142, -177, 1, 0); steps(152.5, -172, -1, 0); steps(136, -172, 0, 1);
  // cover on the island; crates on the floor below
  box(134.5, HT, -177.6, 137.5, HT + 1.3, -176.4, 'metal');
  box(138.6, HT, -179, 139.8, HT + 1.3, -175, 'metal');
  for (const [x, z, s] of [[126, -186, 2.2], [146, -168, 1.8], [140, -189, 2.6], [122, -172, 1.6]]) {
    box(x, HY, z, x + s, HY + s, z + s, 'metal');
    deco(x - 0.02, HY + s * 0.45, z - 0.02, x + s + 0.02, HY + s * 0.55, z + s + 0.02);
  }
  // the cistern's great ribs, and grilles of light in its roof
  for (const x of [127, 137, 147]) deco(x - 0.4, HY + 25 - 1.2, -194, x + 0.4, HY + 25, -160, 'metal');
  for (const z of [-170, -184]) for (const x of [125, 137, 149]) deco(x - 0.8, -44.06, z - 0.8, x + 0.8, -44, z + 0.8, 'trimWhite');
  light(137, -47, -177, 0x9fd8ff, 34, 30);
  // the exit duct's mouth, lit gold under the water (the way on), with a frame on the wall above
  deco(156.95, -63.1, -165.6, 157, -59.9, -165.5, 'glow1');
  deco(156.95, -63.1, -162.5, 157, -59.9, -162.4, 'glow1');
  deco(156.95, -60, -165.6, 157, -59.9, -162.4, 'glow1');
  deco(156.9, HT + 0.6, -165.6, 157, HT + 0.7, -162.4, 'glow1');
  // ARMOR: on the lone stepping stone east of the island (a 4 m jump from it), and on the island in the lee
  // of its cover.
  B.armor([147.25, HT, -177]);
  B.armor([136, HT, -174.8]);
  const undercroft = B.encounter({
    trigger: [[117, HT - 1, -166], [123, HT + 4, -160]],
    seals: [
      { min: [117.5, HT, -160.3], max: [120.5, HT + CH, -159.4] },
    ],
    title: 'THE UNDERCROFT', sub: 'HUNTERS IN THE WATER', color: '#3a8bff', music: 'music_combat', zone, resume: true,
    checkpoint: { pos: [120, HT, -163], yaw: -Math.PI / 2 },
    waves: [
      [
        { type: 'subdrone', pos: [134, -62, -170], color: BLUE, shields: [RED], orbit: 3, leash: 12 },
        { type: 'drone', pos: [137, -50, -178], color: BLUE, shields: [YELLOW], delay: 0.8 },
        { type: 'subdrone', pos: [145, -63, -184], color: BLUE, shields: [GREEN], orbit: 3, leash: 12, delay: 1.6 },
      ],
      [
        { type: 'turret', pos: [137, -50, -193.95], color: BLUE, shields: [YELLOW], mount: [0, 0, 1] },
        { type: 'fish', pos: [128, -61, -185], color: BLUE, count: 4 },
        { type: 'drone', pos: [125, -50, -170], color: BLUE, shields: [RED, GREEN], delay: 1 },
        { type: 'squid', pos: [148, -62, -172], color: BLUE, hp: 4, delay: 2 },
      ],
      { title: 'HEAVIES', enemies: [
        { type: 'warden', pos: [137, -49, -176], shield: RED, core: BLUE },
        { type: 'subdrone', pos: [127, -63, -188], color: BLUE, shields: [YELLOW], orbit: 3, leash: 12, delay: 1 },
        { type: 'subdrone', pos: [150, -62, -186], color: BLUE, shields: [GREEN, RED], orbit: 3, leash: 12, delay: 1.8 },
        { type: 'drone', pos: [150, -49, -168], color: BLUE, shields: [GREEN, YELLOW], delay: 2.6 },
      ] },
    ],
    onClear: () => game.hud.message('The duct out is <b>gated</b>. Its winch is at the south end of the <b>east walkway</b> — and something in the water is calling for a path.', 6),
  });

  // ---- the duct's gate and THE MAINTENANCE SEAL (a seal-path puzzle with chasers)
  // The gate over the duct's mouth only opens from its winch, at the south end of the east walkway. The
  // hall's maintenance seal (a RoboSeal: it only moves on wet ground) carries the winch's power cell; it
  // waits in the water by the walkway. Hose a trail of puddles from its haul-out spot down the walkway to
  // the winch and it slides along it, while scrap crawlers come down the walkway from the north to catch
  // it (caught, it bolts back to the water and you go again). A junction box by the walkway lets you fry
  // crawlers standing in your trail.
  const ductGate = B.seal([156.7, -63, -165.5], [157.4, -60, -162.5], { color: BLUE, closed: true, zone });
  box(155.2, HT, -169.2, 157, HT + 1.1, -167.6, 'metal'); // the winch
  deco(155.15, HT + 0.5, -169.25, 157, HT + 0.6, -167.55, 'hazard');
  deco(155.6, HT + 1.1, -168.8, 156.6, HT + 1.16, -168, 'glow1');
  const sealRoute = new Route([[153.2, HT, -186.6], [154.7, HT, -184.6], [154.7, HT, -170.4]]);
  const crawlRoute = new Route([[154.7, HT, -190.4], [154.7, HT, -184.6], [154.7, HT, -170.4]]);
  for (const x of [154.05, 155.3]) deco(x, HT + 0.004, -185.5, x + 0.05, HT + 0.02, -170.6, 'glow3'); // the seal's lane, marked
  const winchSeal = new RoboSeal(W, game, {
    water: [151.2, HW - 0.15, -186.6], route: sealRoute, carry: true,
    onArrive: () => {
      ductGate.open();
      audio.sample('elevator_start', { gain: 0.9, vary: 0 });
      game.hud.message('The seal plugs in the cell and the winch hauls the <b>duct gate</b> open. Dive for the gold-lit duct in the east wall.', 6);
    },
  });
  winchSeal.done = true; // (asleep until the hall is clear)
  const juncU = new Junction(W, game, { min: [156.35, HT, -177.2], max: [157, HT + 1.3, -176.2], face: '-x', cooldown: 6, cable: [156.7, -45.2, -176.7] });
  const crawlers = [];
  let chaseT = -1, spawned = 0;
  const SHIELDS = [[RED], [YELLOW], [GREEN], [RED, YELLOW]];
  W.add({
    update(dt) {
      // wake the seal once the fight is over (or was won before a reload)
      if (undercroft.state === 'cleared' && winchSeal.done && !winchSeal.worked && !ductGateOpen()) {
        winchSeal.done = false;
        winchSeal.t = 0;
      }
      // a chase starts each time it hauls out: crawlers come down from the north end, one every few seconds
      for (let i = crawlers.length - 1; i >= 0; i--) if (crawlers[i].dead) crawlers.splice(i, 1);
      if (winchSeal.state === 'haul' && chaseT < 0 && !winchSeal.worked) {
        chaseT = 0;
        spawned = 0;
      }
      if (chaseT >= 0) {
        chaseT += dt;
        if (spawned < 4 && chaseT > 1.2 + spawned * 3 && crawlers.length < 3) {
          spawned++;
          const shields = SHIELDS[(spawned - 1) % SHIELDS.length];
          new SpawnPortal(W, crawlRoute.p[0].toArray(), COLORS[shields[0]].hex, {
            time: 0.7,
            onSpawn: () => {
              const c = new ScrapCrawler(W, game, { route: crawlRoute, s: 0.2, seal: winchSeal, color: BLUE, shields, hp: 2 });
              crawlers.push(c);
              return c;
            },
          });
        }
        if (winchSeal.state === 'swim' || winchSeal.worked) chaseT = -1;
      }
    },
  });
  const ductGateOpen = () => ductGate.state === 'open' || ductGate.state === 'opening';
  onRespawn(() => {
    for (const c of crawlers) c.despawn();
    crawlers.length = 0;
    chaseT = -1;
    winchSeal.reset();
    juncU.reset();
    if (!winchSeal.worked && undercroft.state !== 'cleared') winchSeal.done = true;
  });
  level.azure.winchSeal = winchSeal;
  level.azure.undercroft = undercroft;
  hint([152.5, HT, -191], [157, HT + 3, -185], 'The seal only moves on <b>wet</b> ground. <b>Hose a trail</b> along the walkway from its haul-out spot to the winch, and keep the crawlers off it.', 6);
  hint([117, HT, -166], [123, HT + 3, -160], 'Hunters above the water and below it. Fight from the walkways — or take them on in their element.', 4);
  area([117, HT, -166], [123, HT + 3, -160], DEEP);

  // ---- the duct (x 157..166, flooded to its roof) into the foot of the Sluice
  box(157, -64, -166, 166, -63, -162);
  box(157, -60, -166, 166, -59.5, -162, 'ceil');
  box(157.5, -63, -166, 165.5, -60, -165.5, 'metal');
  box(157.5, -63, -162.5, 165.5, -60, -162, 'metal');
  B.water([157, -63, -165.5], [166, -60, -162.5], { surface: false });
  for (const x of [159.5, 162, 164.5]) {
    deco(x, -63, -165.5, x + 0.1, -60, -165.45, 'glow1');
    deco(x, -63, -162.55, x + 0.1, -60, -162.5, 'glow1');
  }

  // ================================================================== THE SLUICE (puzzle)
  // interior x 166..180, z -158..-168, floor y -64, roof y -3.5. Its water (level with the Undercroft's
  // until you pump it) is raised by shooting BLUE pump valves: every hit runs the pump for a moment; stop
  // and it drains back to the last lock. Stage 1: the valve on the south wall floods it to ledge 1. Stage 2:
  // a wall of ledges on the north wall (shoot each one's arrows into a staircase) up to ledge 2. Stage 3:
  // the valve in the roof floods it to the top: ride the water up, firing as you go.
  const QX1 = 166, QX2 = 180, QZ1 = -168, QZ2 = -158, QY = -64;
  room({ x1: QX1, x2: QX2, zS: QZ2, zN: QZ1, y: QY, h: 60.5, zone, trim: false, w: [{ c: -164, w: 3, h: 3, y0: 1 }], s: [{ c: 173, w: 3, h: CH, y0: -7.7 - QY }] });
  const LOCK0 = HW, LOCK1 = -44.6, LOCK2 = -8;
  const sw = B.water([QX1, QY, QZ1], [QX2, LOCK0, QZ2], { surface: false });
  const swSurf = waterSurface(W, QX1, QZ1, QX2, QZ2, LOCK0);
  const sluice = (st.sluice = { level: LOCK0, base: LOCK0, stage: 1, pumpT: 0, rate: 2.4, drain: 1.0 });
  // ledge 1 (west wall) and its checkpoint, with steps down into the water
  // (every ledge in here stands 0.4 m clear of the water it's meant to be climbed out of, so nobody who
  // surfaces under one is trapped without air)
  plat(QX1, -165.6, 168.2, QZ2, -44, zone, 0.2);
  steps(168.2, -164.6, 1, 0, 2, -44, 5, 0.6); // (at the north end, clear of where you float while pumping)
  new Checkpoint(W, game, { pos: [167.1, -44, -161], yaw: 0, size: [2.2, 3, 5] });
  // the rack: four ledges on the north wall, notch 0 level with ledge 1, 1.2 m a notch
  B.platformRack({ pos: [167.4, -44.3, QZ1], face: '+z', columns: 4, notches: 5, step: 1.2, start: [4, 0, 5, 2], colors: [BLUE, GREEN, BLUE, YELLOW], spacing: 3.2, width: 2.4, depth: 1.6, targetGap: 0.6, zone });
  // ledge 2 (east wall) with its checkpoint
  plat(178.4, QZ1, QX2, QZ2, -38.3, zone, 0.5);
  plat(176.2, -161, 178.4, QZ2, -38.3, zone, 0.5);
  new Checkpoint(W, game, { pos: [178.6, -38.3, -159.6], yaw: Math.PI / 2, size: [3, 3, 3] });
  // the exit ledge at the top, under the door to the gallery
  plat(168, -160.5, 178, QZ2, -7.35, zone, 0.25);
  steps(168, -159.25, -1, 0, 2.5, -7.35, 5, 0.4); // (tucked in the south-west corner, away from where you float up)
  // the pumps: pulse switches; each hit feeds the pump half a second
  const feed = (stage) => ({
    activate() {
      if (sluice.stage !== stage) return;
      sluice.pumpT = 0.5;
    },
  });
  B.colorSwitch({ pos: [173, -47.5, QZ2], face: '-z', color: BLUE, mode: 'pulse', size: 1.5, links: [feed(1)], zone, light: false });
  B.colorSwitch({ pos: [173, -3.5, -163], face: 'down', color: BLUE, mode: 'pulse', size: 1.9, links: [feed(3)], zone, light: false });
  // gauges up the walls: a mark every 4 m, the two locks in gold
  for (let y = -52; y < -8; y += 4) deco(QX1, y, QZ1, QX1 + 0.05, y + 0.06, QZ2);
  for (const y of [LOCK1, LOCK2]) {
    deco(QX1, y + 0.3, QZ1, QX1 + 0.06, y + 0.4, QZ2, 'glow1');
    deco(QX2 - 0.06, y + 0.3, QZ1, QX2, y + 0.4, QZ2, 'glow1');
  }
  deco(170.5, -4.4, QZ2 - 0.06, 175.5, -4.3, QZ2, 'trimWhite');
  hint([QX1, QY, QZ1], [QX2, LOCK0 + 2, QZ2], 'The <b>Sluice</b>. Keep firing <b style="color:#3a8bff">blue</b> into the pump valve high on the south wall to flood the shaft — stop and it drains.', 7);
  hint([QX1, -44.5, -165.6], [168.2, -41, QZ2], 'Shoot the <b>arrows</b> above and below each ledge on the north wall to set them into a <b>staircase</b> up to the east ledge.', 6);
  hint([176.2, -38.3, QZ1], [QX2, -35, QZ2], 'The last valve is in the <b>roof</b>. Flood the shaft and ride the water up — <b>hold Space</b> to float, keep firing.', 6);
  let rush = null, rushGain = 0;
  W.add({
    update(dt, player) {
      const s = sluice;
      const top = s.stage === 1 ? LOCK1 : s.stage === 3 ? LOCK2 : s.base;
      const was = s.level;
      if (s.pumpT > 0 && s.level < top) {
        s.pumpT -= dt;
        s.level = Math.min(top, s.level + s.rate * dt);
        if (s.level >= top) {
          // a lock fills: it holds from now on
          s.base = top;
          s.stage = s.stage === 1 ? 2 : 4;
          s.pumpT = 0;
          audio.sample('elevator_stop', { gain: 0.8, vary: 0 });
          game.hud.message(s.stage === 2 ? 'Lock 1 full. <b>The ledges on the north wall</b> lead on up.' : 'The Sluice is full. <b>Climb out at the top.</b>', 4);
        }
      } else {
        s.pumpT = Math.max(0, s.pumpT - dt);
        if (s.level > s.base) s.level = Math.max(s.base, s.level - s.drain * dt);
      }
      // stage 2 → 3: standing on ledge 2 arms the roof valve
      if (s.stage === 2 && player.pos.x > 176 && player.pos.y > -38.6 && player.pos.y < -35 && player.pos.z > QZ1 && player.pos.z < QZ2) s.stage = 3;
      if (s.level !== was) {
        sw.max.y = s.level;
        swSurf.position.y = s.level - LOCK0;
        swSurf.updateMatrix();
      }
      // the inrush lifts swimmers with it (as the ballast shaft's does), so floating keeps your head out
      sw.current = s.level > was + 1e-4 ? (sw.current || V(0, 0, 0)).set(0, s.rate / 0.78, 0) : null;
      const near = Math.abs(player.pos.x - 173) < 30 && Math.abs(player.pos.z + 163) < 30 && player.pos.y > -70;
      const want = s.level > was + 1e-4 && near ? 0.4 : 0;
      rushGain += (want - rushGain) * Math.min(1, dt * 3);
      if (!rush && rushGain > 0.01) rush = audio.createLoop('elevator_loop', { gain: 0, rate: 0.5 });
      rush?.setGain(rushGain);
    },
  });

  // ================================================================== THE GALLERY (y -7.7)
  // From the Sluice's top door west past the cistern's door (and, once the engine is down, on through the
  // pressure lock and out of the cliff onto the Spillway). z -157..-154.
  const GY = -7.7, GZ = -155.5;
  corridorX({ xStart: 112, xEnd: 179.5, y: GY, zone, cz: GZ, n: [{ c: 160, w: 8, h: CH }, { c: 173, w: 3, h: CH }] });
  box(179.5, GY, GZ - 1.5, 180, GY + CH, GZ + 1.5);
  new Checkpoint(W, game, { pos: [174, GY, GZ], yaw: Math.PI / 2, size: [3, 3, 3] });
  area([170, GY, GZ - 1.5], [176, GY + 3, GZ + 1.5], DEEP);
  // the pressure lock: the engine's head of water holds it shut
  const lock = B.seal([151.6, GY, GZ - 1.5], [152.2, GY + CH, GZ + 1.5], { closed: true, zone });
  for (const z of [GZ - 1.55, GZ + 1.45]) deco(152.3, GY, z, 152.4, GY + CH, z + 0.1, 'hazard');
  hint([152.3, GY, GZ - 1.5], [158, GY + 3, GZ + 1.5], 'A <b>pressure lock</b>: the engine\'s weight of water holds it shut. The cistern is through the door to the north.', 5);
  area([150, GY, GZ - 1.5], [154, GY + 3, GZ + 1.5], DEEP);
  // floor arrows: from the Sluice's door to the cistern's; once the engine is down, on west to the Spillway
  B.guideStrip([[173, GY, GZ + 0.6], [160.6, GY, GZ + 0.6], [160.6, GY, GZ - 1.4]], COLORS[BLUE].hex);
  const homeStrip = B.guideStrip([[159.4, GY, GZ - 1.4], [159.4, GY, GZ], [113, GY, GZ]], 0xdfe6ff, { near: 90 });
  homeStrip.visible = false;
  // (its windows onto the sea are set dressing: azureDressing.js)

  // ================================================================== THE DROWNED CISTERN (the guardian)
  // Charybdis and the Azure Engine (entities/leviathan.js, levels/leviathanArena.js): a 50x50 m tank,
  // 22 m deep, centered on (160, -30, -195), its entry alcove butting the gallery's north wall at z -157.
  const arena = (st.arena = buildLeviathanArena(B, {
    center: [160, -30, -195], world: 'azure', zone, music: 'music_blue',
    onDefeated: () => game.hud.message('The engine is dead. Somewhere a <b>pressure lock</b> lets go — back out into the gallery and head <b>west</b>.', 6),
  }));

  // ARMOR: floating at the surface in two of the air domes, the south-west one (a swim up from the murk) and
  // a corner of the south-east one (mind its down-tube). Longer respawn: you come up for air all the time.
  B.armor([143, -8.9, -178], { base: false, respawn: 45 });
  B.armor([179.5, -8.9, -175.5], { base: false, respawn: 45 });
  // (its shore ledge stands 0.3 m over the alcove pool with no way to wade out: a flight of submerged steps
  // up the pool's east side, so the way back out after the fight is a swim and a walk)
  for (let k = 0; k < 5; k++) plat(162.6, -165.6 - 0.6 * k, 164, -165 - 0.6 * k, -8.1 - 0.4 * k, zone, 0.25);

  // ================================================================== THE SPILLWAY (the way home)
  // Out of the cliff onto a deck (L0), then four jump pads up across the chasm to the terminal at the
  // Hub's east balcony port. With the engine dead the pads run on their own capacitors: shoot the orb over
  // a pad (each in its own color) and it holds a charge for 6 s; step on and it throws you to the next
  // landing. Pads throw you at 8 m/s across, so holding W (or nothing) lands you near the middle; each
  // landing is long enough for a sprint, too.
  plat(97, -158.5, 112, -152.5, GY, zone, 1);
  glowEdge(97, -158.5, 112, -152.5, GY, 'trimWhite', zone);
  new Checkpoint(W, game, { pos: [108.5, GY, GZ], yaw: Math.PI / 2, size: [3, 3, 5] });
  area([105, GY, -158.5], [112, GY + 3, -152.5], MOOD);
  const L = [
    { x1: 83, x2: 93, z: -151.5, top: -2.8 },
    { x1: 67.5, x2: 77.5, z: -147, top: 2.1 },
    { x1: 52, x2: 62, z: -142.5, top: 7 },
    { x1: 34.5, x2: 46, z: -136, top: 12 },
  ];
  const CHARGE = [BLUE, RED, YELLOW, GREEN];
  const pads = [[100, GY, GZ]];
  for (const [i, p] of L.entries()) {
    const last = i === L.length - 1;
    const land = [last ? 41.5 : (p.x1 + p.x2) / 2, p.top, p.z];
    // the throw: 8 m/s across, and the lift that lands it on `land` (from a launch ~1 m short of the
    // pad's center, where you step onto it coming from the landing before)
    const [px, py, pz] = pads[i];
    const dx = land[0] - px, dz = land[2] - pz, d = Math.hypot(dx, dz), s = 8, t = (d - 1) / s;
    const vy = (land[1] - (py + 0.2) + 12 * t * t) / t;
    const pad = new JumpPad(W, { pos: [px, py, pz], power: vy, push: [(dx / d) * s, 0, (dz / d) * s], color: 0xdfe6ff });
    // its capacitor: a timed orb switch hanging beside it
    const charge = { on: false, activate() { this.on = true; }, deactivate() { this.on = false; } };
    B.colorSwitch({ pos: [px, py + 2.7, pz + 1.9], style: 'orb', color: CHARGE[i], mode: 'timed', time: 6, links: [charge], zone, light: false });
    W.add({
      update() {
        if (!charge.on) pad.cool = Math.max(pad.cool, 0.2); // dead until charged
        for (const r of pad.rings) r.visible = charge.on;
      },
    });
    // the landing
    if (!last) {
      plat(p.x1, p.z - 3, p.x2, p.z + 3, p.top, zone, 0.8);
      glowEdge(p.x1, p.z - 3, p.x2, p.z + 3, p.top, 'trimWhite', zone);
      pads.push([p.x1 + 2.2, p.top, p.z]);
      // its pier, down into the abyss, ringed with light (stopping at the Core Sanctum's roof and going on
      // under its floor, where one stands over the sanctum)
      const cx = (p.x1 + p.x2) / 2, overSanctum = cx > 50 && cx < 82 && p.z < -120 && p.z > -152;
      const spans = overSanctum ? [[-80, -57.5], [-41.5, p.top - 0.8]] : [[-80, p.top - 0.8]];
      for (const [y1, y2] of spans) deco(cx - 1.6, y1, p.z - 1.6, cx + 1.6, y2, p.z + 1.6, 'rock');
      for (let y = p.top - 6; y > -70; y -= 14) if (!overSanctum || y > -41 || y < -57.5) deco(cx - 1.7, y, p.z - 1.7, cx + 1.7, y + 0.25, p.z + 1.7);
    }
  }
  new Checkpoint(W, game, { pos: [72.5, L[1].top, L[1].z], yaw: Math.PI / 2, size: [3, 3, 5] });
  // the terminal at the port: a dock with rails, and the port corridor (a shutter closes it until the engine is down)
  box(34.5, 11, -139, 46, 12, -133, 'floor');
  glowEdge(34.5, -139, 46, -133, 12, 'trimWhite', zone);
  for (const [z1, z2] of [[-139, -138.7], [-133.3, -133]]) {
    box(34.5, 12, z1, 46, 13.1, z2, 'metal');
    deco(34.5, 13.1, z1, 46, 13.16, z2);
    B.blocker([34.5, 12, z1], [46, 30, z2]);
  }
  deco(36, -80, -137.6, 39, 11, -134.4, 'rock'); // the terminal's pier
  corridorX({ xStart: 25, xEnd: 34.5, y: 12, zone, cz: -136 });
  const shutter = B.seal([34, 12, -137.5], [34.5, 12 + CH, -134.5], { closed: true, zone });
  W.trigger([25, 12, -137.5], [27.5, 15, -134.5], () => {
    game.setMusic('music_hub');
    game.setAmbient('amb_hub');
    if (level.atmospheres.hub) game.setAtmosphere('hub');
  }, { once: false });
  area([28, 12, -137.5], [34, 15, -134.5], MOOD);
  hint([97, GY, -158.5], [106, GY + 3, -152.5], 'The <b>Spillway</b>: emergency pads up across the chasm to the Nexus. <b>Shoot the orb over each pad</b> to charge it, then step on.', 6);
  // drones work the chasm (they come back whenever you return)
  // (they hang off to the sides of the chain, never in a pad's flight path)
  new Drone(W, { pos: [80, 3, -160], color: BLUE, shields: [YELLOW], range: 22, orbit: 2 });
  new Drone(W, { pos: [55, 13, -130.5], color: BLUE, shields: [RED], range: 22, orbit: 2 });
  keepOut.push([[33, -9, -160], [113, 30, -131]]);

  // ================================================================== THE CONDUIT to the Atrium's reactor
  // Glass, with water racing through it toward the Hub; it leaves the cistern's west wall, runs south
  // behind the cliff, through it, and across the chasm into the Hub's east wall (reactor.js takes over).
  const curve = new THREE.CatmullRomCurve3([
    V(133.4, -17, -199), V(126, -15, -196), V(121, -13, -186), V(121, -11.5, -162), V(121, -10.5, -140), V(117.5, -9, -129),
    V(100, -5, -124.5), V(75, 1.5, -123), V(52, 8.2, -121.6), V(36, 12.4, -119.2), V(25.2, 14, -118),
  ]);
  const pipeLen = curve.getLength();
  const pipeWater = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLen: { value: pipeLen }, uFill: { value: 1 }, uPower: { value: 1 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uLen, uFill, uPower;
      varying vec2 vUv;
      void main() {
        // vUv.x runs along the tube (0 at the engine end); the water drains from the Hub end back
        float along = vUv.x * uLen;
        if (vUv.x > uFill) discard;
        float band = smoothstep(0.6, 1.0, sin(along * 0.9 - uTime * 9.0 + sin(vUv.y * 6.2831) * 0.6));
        float swirl = 0.5 + 0.5 * sin(vUv.y * 6.2831 * 2.0 + along * 0.35 - uTime * 4.0);
        vec3 deep = vec3(0.04, 0.22, 0.55), bright = vec3(0.45, 0.9, 1.4);
        vec3 col = mix(deep, bright, 0.25 + 0.5 * band + 0.25 * swirl) * mix(0.18, 1.0, uPower);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const pipeGlass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.3, depthWrite: false, emissive: 0x0a2440, emissiveIntensity: 0.6 });
  const water = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.42, 10), pipeWater);
  const glass = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.6, 12), pipeGlass);
  glass.renderOrder = 2;
  for (const m of [water, glass]) {
    m.raycast = () => {};
    m.userData.noCull = true; // it spans the whole chasm (and is seen from the Hub)
    W.scene.add(m);
  }
  // clamps every ~7 m, and pylons where it crosses the open chasm
  {
    const clampGeo = new THREE.TorusGeometry(0.66, 0.1, 6, 14), parts = [], pos = new THREE.Vector3(), tan = new THREE.Vector3(), q = new THREE.Quaternion(), Z = V(0, 0, 1);
    const n = Math.floor(pipeLen / 7);
    for (let i = 1; i < n; i++) {
      curve.getPointAt(i / n, pos);
      curve.getTangentAt(i / n, tan);
      q.setFromUnitVectors(Z, tan);
      parts.push(clampGeo.clone().applyQuaternion(q).translate(pos.x, pos.y, pos.z));
    }
    const clamps = new THREE.InstancedMesh(clampGeo, mat('metal', zone), parts.length);
    const m4 = new THREE.Matrix4(), one = V(1, 1, 1);
    for (let i = 1; i < n; i++) {
      curve.getPointAt(i / n, pos);
      curve.getTangentAt(i / n, tan);
      clamps.setMatrixAt(i - 1, m4.compose(pos, q.setFromUnitVectors(Z, tan), one));
    }
    parts.forEach((g) => g.dispose());
    clamps.raycast = () => {};
    clamps.userData.noCull = true;
    W.scene.add(clamps);
    for (const [x, z, y] of [[100, -124.5, -5], [88, -123.8, -1.8]]) {
      deco(x - 0.5, -80, z - 0.5, x + 0.5, y - 0.6, z + 0.5, 'metal');
      deco(x - 0.9, y - 0.8, z - 0.9, x + 0.9, y - 0.6, z + 0.9, 'metal');
    }
  }

  // ================================================================== THE AFTERMATH (the engine shut down)
  // Live: blue trims flicker and die, lights sink to a dim emergency level, tubes and horizontal currents
  // go slack, the conduit drains from the Hub end back, and the station's air turns darker. Restored from
  // a save: all of it at once.
  const glow3 = mat('glow3', zone), glow3Base = glow3.color.clone();
  let crystals = null, crystalBase = null; // (azure.js makes the crystal materials after this runs: fetched when needed)
  const DIM = 0.22;
  let down = null; // { t, restored }
  const dimLights = [];
  function aftermath(restored) {
    if (down) return;
    down = { t: restored ? 99 : 0 };
    crystals = st.crystalMats || null;
    crystalBase = crystals && Object.fromEntries(Object.entries(crystals).map(([k, m]) => [k, m.color.clone()]));
    lock.open(restored);
    st.dress?.dimOnShutdown(restored);
    homeStrip.visible = true;
    shutter.open(restored);
    for (const v of W.virtualLights) if (regionOf(v.position) === 'azure') dimLights.push({ v, base: v.intensity });
    for (const e of W.entities) if (e instanceof VortexTunnel && regionOf(e.from) === 'azure') e.setActive(false);
    for (const w of W.waters || []) if (w.current && Math.abs(w.current.y) < 0.1 && regionOf(w.min.clone().add(w.max).multiplyScalar(0.5)) === 'azure') w.current = null;
    // a darker, stiller station
    const A = level.atmospheres;
    for (const k of ['azure', 'azureDeep']) {
      if (!A[k]) continue;
      Object.assign(A[k], { fog: k === 'azure' ? 0x050d1c : 0x030a18, hemiIntensity: A[k].hemiIntensity * 0.7, sunIntensity: A[k].sunIntensity * 0.4, exposure: A[k].exposure * 0.9, aurora: 0, bloom: A[k].bloom * 0.8 });
    }
    if (game.atmo && (game.atmo.name === 'azure' || game.atmo.name === 'azureDeep')) game.setAtmosphere(game.atmo.name, restored);
    if (!restored) {
      audio.sample('elevator_stop', { gain: 1, vary: 0, rate: 0.6 });
      game.player.shake = Math.max(game.player.shake, 0.4);
    }
  }
  game.onPowerDown((name, { restored }) => name === 'azure' && aftermath(restored));
  W.add({
    update(dt) {
      pipeWater.uniforms.uTime.value += dt * (down ? Math.max(0, 1 - down.t / 4) : 1);
      if (!down) return;
      down.t += dt;
      const t = down.t;
      // the conduit drains from the Hub end back toward the dead engine over ~7 s, its water dulling
      pipeWater.uniforms.uFill.value = Math.max(0, 1 - t / 7);
      pipeWater.uniforms.uPower.value = Math.max(0, 1 - t / 3);
      // the blue trims stutter, then sink to a dim glow
      const k = t > 2.6 ? DIM : (Math.sin(t * 37) > 0.2 ? 1 : 0.35) * (1 - (t / 2.6) * (1 - DIM));
      glow3.color.copy(glow3Base).multiplyScalar(k);
      if (crystals) {
        const c = t > 3 ? 0.45 : 1 - (t / 3) * 0.55;
        for (const key of Object.keys(crystals)) crystals[key].color.copy(crystalBase[key]).multiplyScalar(c);
      }
      const l = t > 3 ? 0.3 : 1 - (t / 3) * 0.7;
      for (const { v, base } of dimLights) v.intensity = base * l;
    },
  });

  // ---- dev starts (the ascent start shuts the engine down first, so the way home is open)
  devStart('azure13', [83.5, SY, SZ], -Math.PI / 2, RYGB, 'The Blue Span (slick leap)');
  devStart('azure14', [119, SY, -156], 0, RYGB, 'The Undercroft');
  devStart('azure15', [172, LOCK0 - 1, -163], 0, RYGB, "The Sluice");
  devStart('azure16', [168, GY, GZ], Math.PI / 2, RYGB, "The gallery by the cistern's door");
  devStart('cistern', arena.checkpoint, 0, RYGB, "The cistern's shore ledge (the Leviathan)");
  devStart('ascent', [108.5, GY, GZ], Math.PI / 2, RYGB, 'The Spillway ascent (engine down)');
  const params = new URLSearchParams(location.search);
  if (params.has('dev') && params.get('start') === 'ascent') {
    const once = { update: () => (W.remove(once), game.shutDownWorld('azure')) };
    W.add(once);
  }
}

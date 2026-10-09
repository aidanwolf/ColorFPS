// SOLAR — THE CHASM AND THE SUN TEMPLE (solar.js calls buildSolarTemple after the depths). The gate's blast
// opens onto a vast open-air chasm, far below the mesa: a sunken courtyard at its bottom, eerily silent, the
// YELLOW core floating in a stone ring on its dais. Take it and the courtyard wakes — an ambush from every
// side. Across the courtyard the SUN TEMPLE rises against the chasm's south wall from the courtyard floor
// back up to the surface; its stair is missing (a sheer cut face): yellow sun-disc targets in the flanks
// raise it flight by flight. Inside it's dark — no sun gets in: you are the light now. Every puzzle in it
// runs on the yellow gun's beam through small glass PRISMS (relays, beam-locks, receivers hidden behind
// glass and in sight-tubes), each one waking part of the temple (braziers, glyph seams, hard-light
// stairs), up a tall shaft over a quicksand pit, with fights on the landings. At the top the apex crystal
// throws a pillar of light into the sky, and the route goes on outside: the high crossing back over the
// chasm (restored from the old Solar: pillars over the drop, a timed hard-light bridge, crumbling stones —
// one only looks solid — a sun lance, red/yellow chroma stones) to the Panel Court passage on the west rim.
//
//   THE CHASM  x -134…-90, z -94…-42 (open to the sky; walls up to the surface, y -8). Floor y -70.
//   THE COURTYARD  z -94…-64 (the hole's ledge, y -64, and a rubble stair down at its north side).
//   THE SUN TEMPLE  x -130…-94, z -64…-42: the cut face (y -70…-58) with its stair targets; the vestibule
//     and its entry beam-lock (y -58); the shaft: L0 (y -58) → stage 1 (west wall) → L1 (y -46, south-east)
//     → stage 2 (east and north walls) → L2 (y -35.2, north-west) → stage 3 (west wall) → L3 (y -22.4,
//     south-east) → the hard-light lift → the apex chamber (y -10) → the north balcony.
//   THE HIGH CROSSING  the balcony (x -106…-96, z -68…-64, y -10) → columns over the courtyard → the
//     north side → the west rim (x -134…-130, y -8) → the Panel Court passage (z -66…-62).
// Persistence: game.events solar_court (the ambush won: the encounter's own save), solar_stair1…4,
// solar_t1…t4 (the temple's beam-locks), solar_apex; a start position past a beat counts it done.
import * as THREE from 'three';
import { RED, YELLOW } from '../colors.js';
import { Pickup } from '../entities/misc.js';
import { LightReceiver } from '../entities/sunlight.js';
import { mat } from '../materials.js';
import { audio } from '../audio.js';
import { mergeBoxes } from './solarSky.js';
import { buildTempleInterior, TEMPLE_T } from './solarTempleInterior.js';

const SOUNDS = ['servo_heavy', 'hydraulic_land', 'floor_collapse', 'gate_open', 'incinerator_ignite', 'charge_up', 'sun_hum', 'titan_charge', 'boss_slam', 'switch_on', 'energy_crackle', 'arena_seal', 'mummy_alert'];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

const _v = new THREE.Vector3();

// A flight of stairs that grinds out of a cut face: its steps (boxes, given at their final places) start
// pushed `depth` m back into the face along `dir` and slide out together, with dust, a rumble and a shake.
class StairFlight {
  constructor(W, game, steps, { dir = [0, 0, -1], depth = 3.2, zone = 'yellow' }) {
    this.W = W;
    this.game = game;
    this.dir = new THREE.Vector3(...dir);
    this.depth = depth;
    this.k = 0; // 0 hidden in the face → 1 out
    this.target = 0;
    this.group = new THREE.Group();
    const geos = [];
    this.solids = [];
    for (const [x1, y1, z1, x2, y2, z2] of steps) {
      geos.push(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2));
      const min = new THREE.Vector3(x1, y1, z1), max = new THREE.Vector3(x2, y2, z2);
      this.solids.push({ min, max, s: W.addSolid(min.clone(), max.clone(), { kind: 'rock', delta: new THREE.Vector3(), moving: true }) });
    }
    this.mesh = new THREE.Mesh(mergeBoxes(geos), mat('floor', zone));
    this.group.add(this.mesh);
    W.scene.add(this.group);
    this.place();
    W.add(this);
  }

  place() {
    const off = (1 - this.k) * this.depth;
    this.group.position.copy(this.dir).multiplyScalar(-off);
    for (const o of this.solids) {
      const nmin = _v.copy(o.min).addScaledVector(this.dir, -off);
      o.s.delta.subVectors(nmin, o.s.min);
      o.s.min.copy(nmin);
      o.s.max.copy(o.max).addScaledVector(this.dir, -off);
      o.s.enabled = this.k > 0.02;
    }
    this.group.visible = this.k > 0.01;
  }

  raise(instant = false) {
    if (this.target === 1) return;
    this.target = 1;
    if (instant) {
      this.k = 1;
      this.place();
      return;
    }
    audio.sample('servo_heavy', { gain: 1, rate: 0.5 });
    audio.sample('floor_collapse', { gain: 0.7, rate: 0.6 });
  }

  update(dt, player) {
    for (const o of this.solids) o.s.delta.set(0, 0, 0);
    if (this.k >= this.target) return;
    this.k = Math.min(1, this.k + dt / 1.7);
    this.place();
    player.shake = Math.max(player.shake || 0, 0.18 * (1 - this.k) + 0.05);
    if (Math.random() < dt * 30) {
      const o = this.solids[Math.floor(Math.random() * this.solids.length)];
      _v.set(o.min.x + Math.random() * (o.max.x - o.min.x), o.max.y, o.max.z + 0.1);
      this.W.fx.burst(_v, 0xa88758, { count: 2, speed: 1.6, life: 1.2, size: 0.5, gravity: -0.4, mode: 'puff' });
    }
    if (this.k >= 1) audio.sample('hydraulic_land', { gain: 0.8, rate: 0.7 }) || audio.sample('servo_heavy', { gain: 0.6, rate: 1.2 });
  }
}

// ================================================================ the build
export function buildSolarTemple(B, K, depths) {
  const { W, game, level, plat, hint, devStart, blocker, light, guideStrip, glowEdge, area, zoneTitle, onRespawn, pedestal } = B;
  const { R, M, F, D, G, PG, quick, pipe, cable, glyphs, pylon, strata, ck, mood, has, zone, glow, SKY, S, amber, brokenPillar, drum, sunRelief, glyphStrip, banner, drift, lanceRig, onWall } = K;
  const ev = (id) => game.events.has(id);
  const mark = (id) => {
    if (game.events.has(id)) return;
    game.events.add(id);
    game.save();
  };
  const FLOOR = -70;
  const CX1 = -134, CX2 = -90, CZ1 = -94, CZ2 = -42;
  const TX1 = -130, TX2 = -94, TZ1 = -64, TZ2 = -42; // the temple
  const T0 = -58; // the temple's floor (the top of the cut face)

  level.atmospheres.solarCanyon = {
    fog: 0x6a4a30, fogNear: 30, fogFar: 260,
    skyTop: [0.3, 0.19, 0.1], skyMid: [0.62, 0.36, 0.16], skyHorizon: [0.7, 0.45, 0.24], aurora: 0, stars: 0,
    hemiSky: 0xffd0a0, hemiGround: 0x3a2618, hemiIntensity: 0.55,
    sunColor: 0xffc890, sunIntensity: 1.1, sunDir: [-0.85, 0.5, -0.12],
    exposure: 1.0, bloom: 0.45,
  };
  // the temple's insides: dark at first, a little brighter with every awakening (wake())
  const TEMPLE_DARK = {
    fog: 0x0a0604, fogNear: 6, fogFar: 64,
    skyTop: [0.02, 0.015, 0.01], skyMid: [0.04, 0.03, 0.02], skyHorizon: [0.06, 0.04, 0.03], aurora: 0, stars: 0,
    hemiSky: 0xc8a078, hemiGround: 0x1a1008, hemiIntensity: 0.22,
    sunColor: 0xffc890, sunIntensity: 0.05, sunDir: [0.2, 1, 0.1],
    exposure: 1.05, bloom: 0.7,
  };
  level.atmospheres.solarTemple = { ...TEMPLE_DARK };
  const canyonMood = { music: 'music_solar', ambient: 'amb_wind', atmosphere: 'solarCanyon' };

  // ================================================================ THE CHASM: walls, floor, the hole's ledge
  R(-138, -92, CZ1, CX1, S, CZ2); // west (the Panel Court passage opens above its top, at y -8)
  R(CX2, -92, CZ1, -86, S, CZ2); // east
  R(-138, -92, CZ2, -86, S, -40); // south
  R(CX1, -92, CZ1, CX2, FLOOR, CZ2); // the floor
  strata(CX1, CZ1, CX1 + 0.3, CZ2, [-60, -46, -31, -18]);
  strata(CX2 - 0.3, CZ1, CX2, CZ2, [-62, -48, -35, -20]);
  strata(CX1, CZ1, CX2, CZ1 + 0.3, [-50, -36, -22]);
  // rim parapets round the top (and invisible walls over them: the chasm is the only way)
  for (const [x1, z1, x2, z2] of [[-138, -98, -86, -94.6], [-89.4, -94, -86, -40], [-138, -42, -86, -40], [-138, -94, -134.4, -67], [-138, -61, -134.4, -42]]) {
    R(x1, S, z1, x2, S + 1.2, z2);
    blocker([x1, S, z1], [x2, SKY, z2]);
  }
  // the hole's ledge and the rubble stair down into the courtyard
  F(-128, -92, -94, -112, -64, -90);
  for (let i = 0; i < 14; i++) F(-124, -92, -90 + i * 0.43, -116, -64.4 - 0.4 * i, -90 + (i + 1) * 0.43);
  R(-128, -64, -94, -124.6, -62.6, -90.4); // tumbled blocks either side
  R(-115.6, -64, -93, -112, -63.2, -90.6);
  // ---- the courtyard (restored from the old Sun Well: a sunken temple plaza, two sinkholes of quicksand,
  // broken pillars, fallen drums, drifts, banners, sun reliefs and glyph strips; four pylons)
  quick(-133, -92, -126, -86, FLOOR, -76, false); // the sinkholes
  quick(-100, -92, -93, -86, FLOOR, -76, false);
  glowEdge(-133, -92, -126, -86, FLOOR, glow, zone);
  glowEdge(-100, -92, -93, -86, FLOOR, glow, zone);
  for (const [x, z] of [[-131, -68], [-93, -68], [-131, -91.5], [-93, -91.5]]) pylon(x, FLOOR, z, 7);
  for (const [x, z, h, cap] of [[-127, -80, 3.2], [-97, -80, 5.4, true], [-120, -70, 2.2], [-106.5, -69.5, 1.4], [-130, -74, 2.8], [-95, -74, 4.2, true]]) brokenPillar(x, FLOOR, z, h, cap);
  drum(-122, FLOOR, -86, true);
  drum(-106, FLOOR, -91, false);
  drum(-107, FLOOR, -68.5, true, 2.2);
  for (const [x, z, w, d] of [[-126, -71, 6, 4], [-99, -84, 5, 5], [-118, -91, 6, 3], [-102, -66.5, 6, 3]]) drift(x, FLOOR, z, w, d);
  sunRelief('+x', CX1, -80, -60, 2.4);
  sunRelief('-x', CX2, -80, -60, 2.4);
  glyphStrip('+x', CX1, -92, -66, -64);
  glyphStrip('-x', CX2, -92, -66, -64);
  glyphStrip('-z', CZ1, -110, -96, -60);
  banner('+x', CX1, -86, -58, 2.2, 8);
  banner('+x', CX1, -72, -58, 2.2, 8);
  banner('-x', CX2, -86, -58, 2.2, 8);
  banner('-x', CX2, -72, -58, 2.2, 8);
  // ledges high on the chasm walls (the watchers come down from them)
  for (const [x1, z1, x2, z2] of [[-134, -86, -131.5, -76], [-92.5, -86, -90, -76], [-108, -94, -98, -91.5]]) {
    F(x1, -63, z1, x2, -62, z2);
    glowEdge(x1, z1, x2, z2, -62, glow, zone);
  }
  // the dais and the core: the yellow core floating in an upright stone ring, a sun-ray inlay round it
  F(-116, FLOOR, -84, -108, -69.6, -76);
  glowEdge(-116, -84, -108, -76, -69.6, glow, zone);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = -112 + Math.cos(a) * 7, z = -80 + Math.sin(a) * 7;
    W.deco(x - 0.25, FLOOR, z - 0.25, x + 0.25, FLOOR + 0.04, z + 0.25, 'glow1', zone);
  }
  {
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85, metalness: 0.1 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.32, 8, 32), ringMat);
    ring.position.set(-112, -67.4, -80);
    ring.rotation.y = Math.PI / 2;
    W.scene.add(ring);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.22).multiplyScalar(1.6) }));
    seam.position.set(-111.65, -67.4, -80);
    seam.rotation.y = Math.PI / 2;
    W.scene.add(seam);
    R(-112.5, -69.6, -82.2, -111.5, -69.3, -77.8); // its foot
  }
  const corePick = new Pickup(W, { pos: [-112, -67.4, -80], type: 'color', color: YELLOW, onCollect: (pk) => game.unlockColor(YELLOW, pk.pos) });
  ck([-120, -64, -92], Math.PI, [6, 3, 4]);
  devStart('solar11', [-120, -64, -92], Math.PI, [RED], 'The sunken courtyard (the gate blown open)');
  zoneTitle([-128, -66, -94], [-112, -60, -89], 'SOLAR · THE CHASM', 'THE SUNKEN COURT', '#ffd23a');
  // eerily silent until the core is taken and the court wakes
  const silence = () => {
    game.musicTrack = 'silence';
    game.musicOverride = 'silence';
    audio.wantTrack = null;
    audio.musicLayer?.to?.(null, null, 3);
    audio.stopMusic?.(2);
    game.setAmbient('amb_wind');
    game.setAtmosphere('solarCanyon');
  };
  let ambush = null;
  const courtMood = () => (ambush && ambush.state === 'cleared' ? (game.setMusic('music_solar'), game.setAmbient('amb_wind'), game.setAtmosphere('solarCanyon')) : ambush && ambush.state !== 'armed' ? game.setAtmosphere('solarCanyon') : silence());
  W.trigger([-128, -66, -94], [-112, -60, -89], courtMood, { once: false });
  W.trigger([CX1, FLOOR - 1, -89], [CX2, -50, TZ1 - 0.5], courtMood, { once: false });
  hint([-128, -66, -94], [-112, -60, -89], 'Daylight — far, far above. A lost court at the bottom of the world… and on the dais, the <b style="color:#ffd23a">yellow core</b>.', 7);

  // ---- THE AMBUSH: it wakes once you hold yellow and step down off the dais
  ambush = B.encounter({
    trigger: [[0, -500, 0], [1, -499, 1]], // started by hand (below)
    seals: [],
    title: 'THE SUNKEN COURT', sub: 'THE GUARDIANS WAKE', color: '#ffd23a', music: null, zone, resume: true,
    checkpoint: { pos: [-112, -69.6, -74.5], yaw: Math.PI },
    waves: [
      { title: 'THE SANDS STIR', enemies: [
        { type: 'scarab', pos: [-126, FLOOR, -76], color: YELLOW, burrow: true },
        { type: 'scarab', pos: [-98, FLOOR, -77], color: YELLOW, shields: [RED], burrow: true, delay: 0.3 },
        { type: 'scarab', pos: [-112, FLOOR, -90], color: YELLOW, burrow: true, delay: 0.6 },
        { type: 'scarab', pos: [-112, FLOOR, -68], color: YELLOW, shields: [RED], burrow: true, delay: 0.9 },
        { type: 'drone', pos: [-124, -60, -70], color: YELLOW, delay: 1.2 },
        { type: 'drone', pos: [-100, -60, -88], color: YELLOW, delay: 1.6 },
      ] },
      { title: 'THE WATCHERS DESCEND', enemies: [
        { type: 'mummy', pos: [-132.6, -62, -81], color: YELLOW, shieldColor: RED },
        { type: 'mummy', pos: [-91.4, -62, -81], color: YELLOW, shieldColor: RED, delay: 0.6 },
        { type: 'mummy', pos: [-103, -62, -92.6], color: YELLOW, shieldColor: null, delay: 1.2 },
        { type: 'turret', pos: [-112, -58, -93.9], color: YELLOW, shields: [RED], mount: [0, 0, 1], delay: 1.6 },
        { type: 'scarab', pos: [-120, FLOOR, -80], color: YELLOW, shields: [RED], burrow: true, delay: 2.2 },
      ] },
      [
        { type: 'warden', pos: [-112, -63, -86], shield: RED, core: YELLOW },
        { type: 'brute', pos: [-128, FLOOR, -70], color: YELLOW, delay: 1.0 },
        { type: 'mortar', pos: [-96, FLOOR, -68], color: YELLOW, delay: 1.6 },
        { type: 'mummy', pos: [-104, FLOOR, -86], color: YELLOW, shieldColor: RED, delay: 2.2 },
        { type: 'scarab', pos: [-120, FLOOR, -68], color: YELLOW, burrow: true, delay: 2.6 },
      ],
    ],
    onStart: () => game.setMusic('music_combat'),
    onClear: () => {
      game.setMusic('music_solar');
      mark('solar_court');
      game.hud.message('The court is still again. Across it, the <b>Sun Temple</b> — but its stair is gone. Those <b style="color:#ffd23a">sun-disc targets</b> in the cut face…', 7);
    },
  });
  onRespawn(() => {
    // dying mid-ambush: the court goes quiet again until it re-arms
    if (ambush.state === 'armed' && has(YELLOW) && game.checkpoint?.pos && Math.abs(game.checkpoint.pos.x + 112) < 30 && game.checkpoint.pos.z > -95 && game.checkpoint.pos.z < -60) silence();
  });
  {
    let wait = 0;
    W.add({
      update(dt, player) {
        if (ambush.state !== 'armed' || game.state !== 'playing' || !has(YELLOW)) return (wait = 0);
        const p = player.pos;
        if (p.x < CX1 || p.x > CX2 || p.z < CZ1 || p.z > TZ1 || p.y > -66) return (wait = 0);
        if ((wait += dt) > 1.4) ambush.start();
      },
    });
  }
  const courtWon = () => ambush.state === 'cleared';
  B.armor([-130, FLOOR, -88.5]);
  B.armor([-95, FLOOR, -66]);
  B.armor([-97, -64.6, -80]);

  // ================================================================ THE CUT FACE AND ITS STAIR
  // The temple's terrace sits on a sheer face of dressed stone (y -70 → -58). Four sun-disc targets in its
  // flanks (left and right, at different heights; buttresses hide them from the side) each grind out one
  // flight of the stair. Dark — and deaf to everything — until the court has been won.
  R(TX1, FLOOR, TZ1, TX2, T0, -57.6); // the terrace's rock (the stair face is its north side, z -64)
  for (const [x1, x2] of [[-127, -125.2], [-98.8, -97]]) R(x1, FLOOR, -67.2, x2, T0 + 0.4, TZ1); // buttresses
  for (const [x1, x2] of [[-119, -118.4], [-105.6, -105]]) R(x1, FLOOR, -65, x2, T0, TZ1); // the stair's cheek walls
  // nobody climbs onto the terrace except by the stair (capped below the relocated temple, which stands over it)
  blocker([TX1, T0, -64.6], [-118.4, -40, -64]);
  blocker([-105.6, T0, -64.6], [TX2, -40, -64]);
  const STEP = 0.4444, NSTEPS = 27;
  const stepBox = (i) => {
    const top = FLOOR + STEP * (i + 1), zOut = TZ1 - (NSTEPS - i) * STEP;
    return [-118.4, FLOOR, zOut, -105.6, top, TZ1];
  };
  const flights = [[0, 7], [7, 14], [14, 21], [21, 27]].map(([a, b]) => {
    const steps = [];
    for (let i = a; i < b; i++) steps.push(stepBox(i));
    return new StairFlight(W, game, steps, { dir: [0, 0, -1], depth: (NSTEPS - a) * STEP + 0.2, zone });
  });
  // the stair's landing gap at the top (the door's apron) is part of the terrace; the doorway
  const targets = [
    [-122.2, -67.2], [-101.8, -66], [-122.6, -62.6], [-101.4, -61.2],
  ].map(([x, y], i) => new LightReceiver(W, {
    pos: [x, y, TZ1 - 0.12], face: '-z', color: YELLOW, size: 1.5, look: 'disc', when: courtWon,
    onOn: () => {
      flights[i].raise(restoringStairs);
      mark('solar_stair' + (i + 1));
      if (!restoringStairs) game.hud.message(['The first flight grinds out of the face.', 'A second flight.', 'The third.', 'The stair is whole: up to the <b>temple doors</b>.'][Math.min(3, flights.filter((f) => f.target).length - 1)], 3.5);
    },
  }));
  let restoringStairs = false;
  K.lights.push(...targets);
  hint([-120, FLOOR, -76], [-104, -66, -68], 'No stair — just a sheer cut face. Those <b style="color:#ffd23a">sun discs</b> in its flanks… hold the <b style="color:#ffd23a">yellow beam</b> on them.', 6);
  devStart('solar12', [-112, T0, -62.8], Math.PI, [RED, YELLOW], 'The Sun Temple doors (stair raised)');

  // ================================================================ THE SUN TEMPLE (solarTempleInterior.js)
  // Everything behind the doorway — the hall, the inverted obelisk, the climb, the worshippers, the collapse,
  // the roof and the high crossing down to the Panel Court passage — is built in temple coordinates and
  // placed by TEMPLE_T (the door facing east onto the yard).
  area([-128, FLOOR, -76], [-96, -58.5, -64.5], canyonMood);
  const interior = buildTempleInterior(B, K, { T: TEMPLE_T });

  // ================================================================ persistence and starts
  const stageAt = (p) => {
    const inB = (x1, x2, z1, z2, y1, y2) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2 && p.y >= y1 && p.y <= y2;
    if (depths.stageAt(p) < 8) return 0;
    if (inB(CX1, CX2, CZ1, TZ1 - 0.5, -95, -50) && p.y < -60) return 0; // the courtyard itself
    const s = interior.stageAt(p); // (the temple: 1 doors/vestibule, 2–5 its storeys, 6 the roof and crossing)
    if (s !== null) return s;
    if (inB(TX1, TX2, -70, TZ2, -70, -57)) return 1; // (the old doors, at the stair's head)
    return 6; // past the temple
  };
  const applySaved = (stage) => {
    if (has(YELLOW) && corePick.active) {
      // (a start that already holds yellow: the core's long gone)
      corePick.active = false;
      corePick.group.visible = false;
      if (corePick.light) corePick.light.intensity = 0;
      W.remove(corePick);
    }
    if (stage >= 1 || ev('solar_court')) ambush.restoreCleared();
    restoringStairs = true;
    targets.forEach((t, i) => (ev('solar_stair' + (i + 1)) || stage >= 1) && !t.on && ((t.keep = true), t.setOn(true, null, true)));
    restoringStairs = false;
    interior.applySaved(stage);
  };
  let first = true;
  W.add({
    update(dt, player) {
      if (first && game.state === 'playing') {
        first = false;
        applySaved(stageAt(game.checkpoint?.pos || player.pos));
      }
    },
  });

  // ================================================================ the HUD objective for this stretch
  const Y = '<b style="color:#ffd23a">', E = '</b>';
  const objective = (p) => {
    const inB = (x1, x2, z1, z2, y1 = -99, y2 = 99) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2 && p.y >= y1 && p.y <= y2;
    if (inB(CX1, CX2, CZ1, TZ1 - 0.5, -95, -50) && p.y < -57) {
      if (!has(YELLOW)) return `Take the ${Y}yellow core${E} from the ring on the dais.`;
      if (!courtWon()) return `Hold the court: ${Y}yellow${E} bodies, <b style="color:#ff3344">red</b> shields — switch <b>1</b> ↔ <b>2</b>.`;
      const n = targets.filter((t) => t.on).length;
      return n < 4 ? `Raise the stair: hold the ${Y}yellow beam${E} on the <b>sun-disc targets</b> in the cut face (${n}/4).` : 'Up the stair to the <b>Sun Temple</b>.';
    }
    return interior.objective(p);
  };

  return { ambush, targets, flights, objective, stageAt, corePick, interior, get apexLit() { return interior.collapsed; } };
}


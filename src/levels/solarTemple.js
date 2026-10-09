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
import { Seal } from '../entities/combat.js';
import { MovingPlatform, Pickup } from '../entities/misc.js';
import { PhasePlatform } from '../entities/mechanics.js';
import { LightReceiver, Prism, BeamGlass } from '../entities/sunlight.js';
import { Drone } from '../entities/drone.js';
import { mat } from '../materials.js';
import { audio } from '../audio.js';
import { mergeBoxes } from './solarSky.js';

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

// A brazier: a bronze bowl on a plinth that ignites (a flame of embers, a warm glow, maybe a real light).
class Brazier {
  constructor(W, x, y, z, { real = false } = {}) {
    this.W = W;
    this.p = new THREE.Vector3(x, y + 1.25, z);
    this.on = false;
    this.k = 0;
    this.t = 0;
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.05, 0.03) });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.32, 0.4, 10), mat('metal', 'yellow'));
    bowl.position.set(x, y + 1.05, z);
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.06, 10), this.mat);
    coals.position.set(x, y + 1.24, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.9, 8), mat('metal', 'yellow'));
    post.position.set(x, y + 0.45, z);
    W.scene.add(bowl, coals, post);
    this.light = real ? W.addLight(0xff9a40, 0, 14, 1.6) : null;
    if (this.light) this.light.position.set(x, y + 1.9, z);
    W.add(this);
  }

  ignite(instant = false) {
    if (this.on) return;
    this.on = true;
    if (instant) this.k = 1;
    else {
      this.W.fx.burst(this.p, 0xffa040, { count: 30, speed: 4, life: 0.7, size: 0.3, gravity: -2 });
      audio.sample('incinerator_ignite', { gain: 0.35 * Math.max(0.2, 1 - this.p.distanceTo(this.W.game.player.pos) / 40), rate: 1.4 });
    }
  }

  update(dt, player) {
    if (!this.on) return;
    this.t += dt;
    if (this.k < 1) this.k = Math.min(1, this.k + dt * 1.5);
    const f = 0.85 + 0.15 * Math.sin(this.t * 17) * Math.sin(this.t * 7.3);
    this.mat.color.setRGB(1.6, 0.7, 0.2).multiplyScalar(this.k * f);
    if (this.light) this.light.intensity = 9 * this.k * f;
    if (player.pos.distanceToSquared(this.p) < 45 * 45 && Math.random() < dt * 18) {
      _v.copy(this.p).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1, (Math.random() - 0.5) * 0.5));
      this.W.fx.ember(_v, (Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 1.4, (Math.random() - 0.5) * 0.5, Math.random() < 0.5 ? 0xffa030 : 0xff6a18, 0.9, 0.07);
    }
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
  devStart('solar7', [-120, -64, -92], Math.PI, [RED], 'The sunken courtyard (the gate blown open)');
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
  blocker([TX1, T0, -64.6], [-118.4, SKY, -64]); // nobody climbs onto the terrace except by the stair
  blocker([-105.6, T0, -64.6], [TX2, SKY, -64]);
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
  devStart('solar8', [-112, T0, -62.8], Math.PI, [RED, YELLOW], 'The Sun Temple doors (stair raised)');

  // ================================================================ THE SUN TEMPLE: the shell
  const TOP = -10; // the apex chamber's floor
  const ROOF = -6;
  // the outer walls (the front with its doorway at the stair head, the top doorway onto the north balcony)
  R(TX1, T0, TZ1, -115, ROOF, TZ1 + 2);
  R(-109, T0, TZ1, -106, ROOF, TZ1 + 2);
  R(-115, T0 + 5, TZ1, -109, ROOF, TZ1 + 2);
  R(-106, T0, TZ1, TX2, TOP, TZ1 + 2);
  R(-106, TOP + 3.4, TZ1, TX2, ROOF, TZ1 + 2);
  R(-106, TOP, TZ1, -104, TOP + 3.4, TZ1 + 2);
  R(-100, TOP, TZ1, TX2, TOP + 3.4, TZ1 + 2);
  R(TX1, FLOOR, TZ1, TX1 + 2, ROOF, TZ2); // west
  R(TX2 - 2, FLOOR, TZ1, TX2, ROOF, TZ2); // east
  R(TX1, FLOOR, TZ2 - 2, TX2, ROOF, TZ2); // south (against the chasm wall)
  R(TX1 - 0.6, ROOF, TZ1 - 0.6, TX2 + 0.6, ROOF + 2, TZ2 + 0.6); // the roof
  // the apex: a stepped pyramid over the roof, its crown open to the sky (the light pillar leaves by it)
  for (let k = 0; k < 4; k++) {
    const i = 2 + k * 3.2, y = ROOF + 2 + k * 2.4;
    R(TX1 + i, y, TZ1 + i * 0.6, TX2 - i, y + 2.4, TZ2 - i * 0.6);
  }
  M(-114.2, ROOF + 11.6, -55.2, -109.8, ROOF + 12.4, -50.8);
  // the facade: pilasters, sun discs, glyph bands, banners
  for (const x of [-127, -121, -103, -97]) R(x - 0.7, T0, TZ1 - 0.6, x + 0.7, ROOF + 1, TZ1);
  sunRelief('-z', TZ1 - 0.6, -112, -46, 3);
  sunRelief('-z', TZ1 - 0.6, -124, -30, 2);
  sunRelief('-z', TZ1 - 0.6, -100, -30, 2);
  glyphStrip('-z', TZ1 - 0.6, -126, -98, -52);
  glyphStrip('-z', TZ1 - 0.6, -126, -98, -38);
  banner('-z', TZ1 - 0.6, -118, -40, 2, 9);
  banner('-z', TZ1 - 0.6, -106, -40, 2, 9);
  G(-115.05, T0 + 5, TZ1 - 0.05, -108.95, T0 + 5.2, TZ1 + 0.1); // the doorway's lintel glows
  zoneTitle([-115, T0, TZ1], [-109, T0 + 4, TZ1 + 2], 'SOLAR · THE TEMPLE', 'THE SUN TEMPLE', '#ffd23a');
  const templeMood = () => {
    game.setMusic('music_haunt');
    game.setAmbient('amb_wind');
    game.setAtmosphere('solarTemple');
  };
  area([TX1 + 2, -67, TZ1 + 2], [TX2 - 2, TOP + 6, TZ2 - 2], { music: 'music_haunt', ambient: 'amb_wind', atmosphere: 'solarTemple' });
  area([-128, FLOOR, -76], [-96, -58.5, -64.5], canyonMood);

  // the awakening: braziers, glyph seams, the darkness lifting a stage at a time
  const seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.06, 0.03) });
  {
    const geos = [];
    const band = (y) => {
      geos.push(new THREE.BoxGeometry(32, 0.12, 0.06).translate(-112, y, TZ1 + 2.04));
      geos.push(new THREE.BoxGeometry(32, 0.12, 0.06).translate(-112, y, TZ2 - 2.04));
      geos.push(new THREE.BoxGeometry(0.06, 0.12, 18).translate(TX1 + 2.04, y, -53));
      geos.push(new THREE.BoxGeometry(0.06, 0.12, 18).translate(TX2 - 2.04, y, -53));
    };
    for (const y of [-55, -50, -43, -38, -31, -26, -19, -14]) band(y);
    for (const x of [-124, -112, -100]) geos.push(new THREE.BoxGeometry(0.1, 52, 0.06).translate(x, -36, TZ2 - 2.04));
    W.scene.add(new THREE.Mesh(mergeBoxes(geos), seamMat));
  }
  const braziers = [
    [new Brazier(W, -126.5, T0, -60, { real: true }), new Brazier(W, -98, T0, -60)],
    [new Brazier(W, -110, -46, -45.5, { real: true }), new Brazier(W, -98, -46, -45.5)],
    [new Brazier(W, -126.5, -35.2, -60.5, { real: true })],
    [new Brazier(W, -110, -22.4, -45.5, { real: true }), new Brazier(W, -98, -22.4, -45.5)],
  ];
  let wakeLevel = 0;
  const wake = (n, instant = false) => {
    if (n <= wakeLevel) return;
    wakeLevel = n;
    for (let i = 0; i < n; i++) braziers[i]?.forEach((b) => b.ignite(instant));
    seamMat.color.setRGB(1, 0.66, 0.2).multiplyScalar(0.3 + n * 0.45);
    const A = level.atmospheres.solarTemple;
    A.hemiIntensity = TEMPLE_DARK.hemiIntensity + n * 0.12;
    A.fogFar = TEMPLE_DARK.fogFar + n * 22;
    A.fog = new THREE.Color(0x0a0604).lerp(new THREE.Color(0x5a3a1e), n / 5).getHex();
    A.exposure = TEMPLE_DARK.exposure + n * 0.04;
    if (game.atmo?.name === 'solarTemple') game.setAtmosphere('solarTemple', instant);
    if (!instant) {
      audio.sample('energy_crackle', { gain: 0.6, rate: 0.7 });
      audio.sample('sun_hum', { gain: 0.5, rate: 0.6 });
    }
  };

  // ================================================================ THE VESTIBULE: the first beam-lock
  // The inner gate west of the vestibule is a beam-lock. Its receiver stands beyond the vestibule's wall in a
  // glass case open only at the top. Three fixed prisms carry the beam: the pedestal one throws it up, the
  // one hung over it throws it west over the wall, the last one drops it into the case.
  R(TX1 + 2, -66.4, TZ1 + 2, TX2 - 2, T0, -57.6); // L0's rock (the vestibule and both wings)
  R(TX1 + 2, -66.4, -57.6, -116.4, T0, -55); // L0w
  R(-107.6, -66.4, -57.6, TX2 - 2, T0, -55); // L0e
  quick(TX1 + 2, -57.6, TX2 - 2, TZ2 - 2, -66, -70, false); // the shaft's quicksand pit
  R(TX1 + 2, -70, -57.6, TX2 - 2, -66.4, TZ2 - 2);
  glowEdge(TX1 + 2, -62, -116.4, -55, T0, glow, zone);
  glowEdge(-107.6, -62, TX2 - 2, -55, T0, glow, zone);
  // the vestibule's walls: west (with the beam-lock gate), south, east (an open doorway to the east wing)
  const VW = -116.4, VE = -107.6, VZ = -57.6, VT = -52.5;
  R(VW, T0, TZ1 + 2, VW + 0.4, VT, -61);
  R(VW, T0, -59, VW + 0.4, VT, VZ);
  R(VW, T0 + 3, -61, VW + 0.4, VT, -59);
  R(VW, T0, VZ - 0.4, VE, VT, VZ);
  R(VE - 0.4, T0, TZ1 + 2, VE, VT, -61);
  R(VE - 0.4, T0, -59, VE, VT, VZ);
  R(VE - 0.4, T0 + 3, -61, VE, VT, -59);
  const gateT1 = new Seal(W, { min: [VW, T0, -61], max: [VW + 0.4, T0 + 3, -59], color: YELLOW, zone, closed: true });
  const pa = new Prism(W, { pos: [-112, -56.6, -59.8], out: [0, 1, 0], stand: 1.4 });
  const pb = new Prism(W, { pos: [-112, -51.4, -59.8], out: [-1, 0, 0], stand: 0, hang: true });
  const pc = new Prism(W, { pos: [-122.6, -51.4, -59.8], out: [0, -1, 0], stand: 0, hang: true });
  M(-112.4, -50.2, -60.2, -111.6, -49, -59.4); // their brackets (hung from the temple's beams)
  M(-123, -50.2, -60.2, -122.2, -49, -59.4);
  M(-124, -49, -60.2, -110, -48.6, -59.4);
  F(-123.6, T0, -60.8, -121.6, -57.2, -58.8); // the receiver's plinth
  const rt1 = new LightReceiver(W, { pos: [-122.6, -57.15, -59.8], face: 'up', color: YELLOW, size: 1.2 });
  new BeamGlass(W, { min: [-124.2, -57.2, -61.4], max: [-124, -54.8, -58.2] });
  new BeamGlass(W, { min: [-121.2, -57.2, -61.4], max: [-121, -54.8, -58.2] });
  new BeamGlass(W, { min: [-124, -57.2, -61.4], max: [-121.2, -54.8, -61.2] });
  new BeamGlass(W, { min: [-124, -57.2, -58.4], max: [-121.2, -54.8, -58.2] });
  K.lights.push(rt1);
  ck([-112, T0, -62.6], Math.PI, [5, 3, 1.6]);
  hint([-115, T0, -62], [-109, T0 + 3, -58], 'Dark in here — the sun never reaches inside. <b>You</b> are the light now. Those glass <b>prisms</b> bend your beam: hold it on one.', 7);

  // ================================================================ THE SHAFT, STAGE 1 (west wall, y -58 → -46)
  // A zigzag of ledges up the west wall (two columns), a crumbling one in the middle; from the top ledge a
  // sun-disc on the south wall summons hard-light steps east to L1 for a few seconds.
  const A1 = -128, A2 = -125, B1 = -124.5, B2 = -121.5, ZN1 = -53.5, ZN2 = -50.5, ZS1 = -48, ZS2 = -45;
  const ledge = (x1, z1, x2, z2, top) => {
    F(x1, top - 0.5, z1, x2, top, z2);
    glowEdge(x1, z1, x2, z2, top, glow, zone);
  };
  const zig = (y0, crumbles = []) => {
    // 8 ledges: A-north, A-south, B-south, B-north, A-north, A-south, B-south, B-north, rising 1.2 a step
    const order = [[A1, ZN1, A2, ZN2], [A1, ZS1, A2, ZS2], [B1, ZS1, B2, ZS2], [B1, ZN1, B2, ZN2]];
    for (let i = 0; i < 8; i++) {
      const [x1, z1, x2, z2] = order[i % 4], top = y0 + 1.2 * (i + 1);
      if (crumbles.includes(i)) B.crumble({ min: [x1, top - 0.4, z1], max: [x2, top, z2], delay: 0.75, respawn: 3, zone });
      else ledge(x1, z1, x2, z2, top);
    }
  };
  zig(T0, [2, 6]); // tops -56.8 … -48.4
  const hl1 = [
    new PhasePlatform(W, { min: [-120, -48, -52.5], max: [-117, -47.6, -49.5], on: false, zone }),
    new PhasePlatform(W, { min: [-115.5, -47.2, -51.5], max: [-112.5, -46.8, -48.5], on: false, zone }),
  ];
  const act1 = new LightReceiver(W, { pos: [-118.5, -45.6, TZ2 - 2.12], face: '-z', color: YELLOW, size: 1.2, look: 'disc', mode: 'timed', time: 4.5, fill: 0.35, links: hl1 });
  // the pit's stalkers (they stride over the quicksand) and the wing's scarabs
  B.mummy([-118, -66, -49], { color: YELLOW, shieldColor: RED, range: 26, patrol: 5 });
  B.mummy([-104, -66, -50], { color: YELLOW, shieldColor: null, range: 26, patrol: 5 });
  B.scarab([-124, T0, -58], { color: YELLOW, range: 10, burrow: false });
  B.scarab([-100, T0, -58], { color: YELLOW, shields: [RED], range: 10, burrow: false });
  // the pit's way back up: a stair in the east wing (east wall)
  for (let i = 0; i < 20; i++) F(TX2 - 4.4, -70, -45 - (i + 1) * 0.5, TX2 - 2, -65.6 + 0.4 * i, -45 - i * 0.5);
  hint([TX1 + 2, T0, -62], [VW, T0 + 3, -55], 'The shaft climbs out of a <b>quicksand pit</b>. Up the ledges on the west wall — the cracked one won\'t hold.', 6);

  // ================================================================ L1 (y -46): a fight, then the second beam-lock
  // Its receiver sits at the back of a sight-tube high in the east wall: only a beam running straight
  // along the tube gets in. A hooded prism on a column over the pit can throw it there — but its hood is
  // open only to the north, where a rotatable prism stands on a taller column in the hood's line.
  const L1 = -46;
  F(-112, L1 - 0.6, TZ2 - 9, TX2 - 2, L1, TZ2 - 2);
  glowEdge(-112, TZ2 - 9, TX2 - 2, TZ2 - 2, L1, glow, zone);
  ck([-104, L1, -46.5], -Math.PI / 2, [6, 3, 4]);
  const fightL1 = B.encounter({
    trigger: [[-111, L1, -50], [-97, L1 + 4, -44]],
    seals: [],
    title: '', sub: '', music: 'music_combat', zone,
    waves: [
      [
        { type: 'mummy', pos: [-100, L1, -47], color: YELLOW, shieldColor: RED },
        { type: 'scarab', pos: [-106, L1, -46], color: YELLOW, burrow: false, delay: 0.4 },
        { type: 'scarab', pos: [-102, L1, -49], color: YELLOW, shields: [RED], burrow: false, delay: 0.8 },
      ],
      [
        { type: 'turret', pos: [-96.1, -42, -49.5], color: YELLOW, shields: [RED], mount: [-1, 0, 0] },
        { type: 'mummy', pos: [-108, L1, -47], color: YELLOW, shieldColor: RED, delay: 0.8 },
      ],
    ],
    checkpoint: { pos: [-104, L1, -46.5], yaw: -Math.PI / 2 },
    onClear: () => templeMood(),
  });
  // the tube (a stone casing on the east wall), the hooded prism, the rotatable one
  const T2Y = -38.5, T2Z = -45.5;
  R(-100, T2Y - 1.6, T2Z - 1.5, TX2 - 2, T2Y - 0.5, T2Z + 1.5);
  R(-100, T2Y + 0.5, T2Z - 1.5, TX2 - 2, T2Y + 1.6, T2Z + 1.5);
  R(-100, T2Y - 0.5, T2Z - 1.5, TX2 - 2, T2Y + 0.5, T2Z - 0.5);
  R(-100, T2Y - 0.5, T2Z + 0.5, TX2 - 2, T2Y + 0.5, T2Z + 1.5);
  const rt2 = new LightReceiver(W, { pos: [TX2 - 2.05, T2Y, T2Z], face: '-x', color: YELLOW, size: 0.9 });
  R(-112.5, -66.4, -46, -111.5, T2Y - 1.1, -45); // the hooded prism's column
  const pHood = new Prism(W, { pos: [-112, T2Y, T2Z], out: [1, 0, 0], stand: 0.6 });
  // the hood: closed above, below, south and west; open north (the feed) and east (the way out)
  R(-113.1, T2Y + 0.7, T2Z - 0.9, -110.9, T2Y + 0.9, T2Z + 0.9);
  R(-113.1, T2Y - 0.9, T2Z - 0.9, -110.9, T2Y - 0.7, T2Z + 0.9);
  R(-113.1, T2Y - 0.7, T2Z + 0.7, -110.9, T2Y + 0.7, T2Z + 0.9);
  R(-113.1, T2Y - 0.7, T2Z - 0.9, -112.9, T2Y + 0.7, T2Z + 0.7);
  R(-112.5, -66.4, -56.8, -111.5, T2Y - 1.1, -55.8); // the rotatable prism's column (in the notch)
  const pRot2 = new Prism(W, { pos: [-112, T2Y, -56.3], rotatable: true, yaw: 0, step: Math.PI / 4, count: 8, start: 3, stand: 0.6 });
  K.lights.push(rt2);
  hint([-111, L1, -50], [-97, L1 + 3, -44], 'High in the east wall, a receiver at the end of a <b>tube</b> — no shot from here can reach it. The <b>hooded prism</b> could… if light came at it from the <b>north</b>.', 8);

  // ================================================================ STAGE 2 (east wall then the north wall, y -46 → -35.2)
  // L1's beam-lock raises a hard-light stair up the east wall; then stone and a crumbling ledge along the
  // north wall, and a sun-disc that summons the last two hard-light steps up to L2. A turret in an alcove.
  const stair2 = [
    new PhasePlatform(W, { min: [-99, -45.2, -55.5], max: [-96, -44.8, -52.5], on: false, zone }),
    new PhasePlatform(W, { min: [-99, -44, -61], max: [-96, -43.6, -58], on: false, zone }),
  ];
  ledge(-104.5, -61.5, -101.5, -58.5, -42.4);
  B.crumble({ min: [-109, -41.6, -61.5], max: [-106, -41.2, -58.5], delay: 0.7, respawn: 3, zone });
  ledge(-113.5, -61.5, -110.5, -58.5, -40.0);
  ledge(-117.5, -61.5, -114.5, -58.5, -38.8);
  const hl2 = [
    new PhasePlatform(W, { min: [-117.5, -38, -56.8], max: [-114.5, -37.6, -54.2], on: false, zone }),
  ];
  const act2 = new LightReceiver(W, { pos: [-113, -36.2, TZ1 + 2.12], face: '+z', color: YELLOW, size: 1.2, look: 'disc', mode: 'timed', time: 4, fill: 0.35, links: hl2 });
  B.turret([-96.1, -38.5, -60], YELLOW, { shields: [RED], mount: [-1, 0, 0] });

  // ================================================================ L2 (y -35.2): a fight, then the moving prism
  // A prism glides back and forth on a rail across the shaft; its exit points south. Only at the east end
  // of its run does it line up with the receiver's tube in the south wall — hold the beam on it as it comes.
  const L2 = -36.4;
  F(TX1 + 2, L2 - 0.6, TZ1 + 2, -118, L2, -55);
  glowEdge(TX1 + 2, TZ1 + 2, -118, -55, L2, glow, zone);
  ck([-123, L2, -58.5], 0, [5, 3, 5]);
  devStart('solar9', [-123, L2, -58.5], Math.PI, [RED, YELLOW], 'The Sun Temple climb (halfway)');
  B.encounter({
    trigger: [[-128, L2, -62], [-118, L2 + 4, -55]],
    seals: [],
    title: '', sub: '', music: 'music_combat', zone,
    waves: [
      [
        { type: 'mummy', pos: [-121, L2, -60], color: YELLOW, shieldColor: RED },
        { type: 'scarab', pos: [-126, L2, -57], color: YELLOW, shields: [RED], burrow: false, delay: 0.5 },
        { type: 'drone', pos: [-112, -30, -52], color: YELLOW, delay: 0.8 },
      ],
      [
        { type: 'turret', pos: [TX1 + 2.1, -31, -58.5], color: YELLOW, shields: [RED], mount: [1, 0, 0] },
        { type: 'mummy', pos: [-125, L2, -60], color: YELLOW, shieldColor: null, delay: 0.6 },
        { type: 'drone', pos: [-104, -28, -50], color: YELLOW, shields: [RED], delay: 1.0 },
      ],
    ],
    checkpoint: { pos: [-123, L2, -58.5], yaw: Math.PI },
    onClear: () => templeMood(),
  });
  const T3Y = -34.0, T3X = -106;
  // the receiver's tube: a casing on the south wall (axis along z at x -106)
  R(T3X - 1.5, T3Y - 1.6, TZ2 - 5.5, T3X + 1.5, T3Y - 0.5, TZ2 - 2);
  R(T3X - 1.5, T3Y + 0.5, TZ2 - 5.5, T3X + 1.5, T3Y + 1.6, TZ2 - 2);
  R(T3X - 1.5, T3Y - 0.5, TZ2 - 5.5, T3X - 0.5, T3Y + 0.5, TZ2 - 2);
  R(T3X + 0.5, T3Y - 0.5, TZ2 - 5.5, T3X + 1.5, T3Y + 0.5, TZ2 - 2);
  const rt3 = new LightReceiver(W, { pos: [T3X, T3Y, TZ2 - 2.05], face: '-z', color: YELLOW, size: 0.9 });
  M(-121, T3Y - 1.2, -54.8, -104, T3Y - 1.0, -54.4); // the rail
  const pMove = new Prism(W, { pos: [-120, T3Y, -54.6], out: [0, 0, 1], stand: 0.9, path: [14, 0, 0], speed: 2.2, pause: 1.4 });
  K.lights.push(rt3);
  hint([-128, L2, -62], [-118, L2 + 3, -55], 'A prism riding a rail. Its light only finds the <b>receiver\'s tube</b> at one end of its run — <b>hold the beam</b> on it as it comes.', 7);

  // ================================================================ STAGE 3 (west wall, y -35.2 → -24.4) and L3
  // L2's beam-lock lights the first two ledges of a second zigzag; from its top, two sun-discs in turn
  // summon the hard-light steps east to L3 (shoot the second from the first step: chain them).
  const stair3 = [];
  {
    const order = [[A1, ZN1, A2, ZN2], [A1, ZS1, A2, ZS2]];
    order.forEach(([x1, z1, x2, z2], i) => stair3.push(new PhasePlatform(W, { min: [x1, L2 + 1.2 * (i + 1) - 0.4, z1], max: [x2, L2 + 1.2 * (i + 1), z2], on: false, zone })));
    const rest = [[B1, ZS1, B2, ZS2], [B1, ZN1, B2, ZN2], [A1, ZN1, A2, ZN2], [A1, ZS1, A2, ZS2], [B1, ZS1, B2, ZS2], [B1, ZN1, B2, ZN2]];
    rest.forEach(([x1, z1, x2, z2], j) => {
      const top = L2 + 1.2 * (j + 3);
      if (j === 1 || j === 4) B.crumble({ min: [x1, top - 0.4, z1], max: [x2, top, z2], delay: 0.75, respawn: 3, zone });
      else ledge(x1, z1, x2, z2, top);
    });
  }
  const L3 = -23.2;
  const hl3a = [new PhasePlatform(W, { min: [-120, -26.0, -52.5], max: [-117, -25.6, -49.5], on: false, zone })];
  const hl3b = [new PhasePlatform(W, { min: [-115.5, -24.8, -51.5], max: [-112.5, -24.4, -48.5], on: false, zone })];
  const act3a = new LightReceiver(W, { pos: [-122, -24.2, TZ2 - 2.12], face: '-z', color: YELLOW, size: 1.1, look: 'disc', mode: 'timed', time: 4, fill: 0.3, links: hl3a });
  const act3b = new LightReceiver(W, { pos: [-114, -22.8, TZ2 - 2.12], face: '-z', color: YELLOW, size: 1.1, look: 'disc', mode: 'timed', time: 3.5, fill: 0.3, links: hl3b });
  F(-112, L3 - 0.6, TZ2 - 9, TX2 - 2, L3, TZ2 - 2);
  glowEdge(-112, TZ2 - 9, TX2 - 2, TZ2 - 2, L3, glow, zone);
  ck([-104, L3, -46.5], -Math.PI / 2, [6, 3, 4]);
  B.scarab([-100, L3, -48], { color: YELLOW, shields: [RED], range: 10, burrow: false });
  new Drone(W, { pos: [-118, -18, -54], color: YELLOW, shields: [RED], range: 20 });

  // ================================================================ L3's beam-lock: two rotatable prisms
  // The receiver is at the back of a tube in the east wall. The prism on the column over the notch can
  // throw your light down it, but a hood lets light in only from the south — straight from the prism on
  // L3, which must send it north. Turn both.
  const T4Y = -22.0, T4Z = -56.3;
  R(-100, T4Y - 1.6, T4Z - 1.5, TX2 - 2, T4Y - 0.5, T4Z + 1.5);
  R(-100, T4Y + 0.5, T4Z - 1.5, TX2 - 2, T4Y + 1.6, T4Z + 1.5);
  R(-100, T4Y - 0.5, T4Z - 1.5, TX2 - 2, T4Y + 0.5, T4Z - 0.5);
  R(-100, T4Y - 0.5, T4Z + 0.5, TX2 - 2, T4Y + 0.5, T4Z + 1.5);
  const rt4 = new LightReceiver(W, { pos: [TX2 - 2.05, T4Y, T4Z], face: '-x', color: YELLOW, size: 0.9 });
  R(-110.5, -66.4, T4Z - 0.5, -109.5, T4Y - 1.1, T4Z + 0.5);
  const pD = new Prism(W, { pos: [-110, T4Y, T4Z], rotatable: true, yaw: 0, step: Math.PI / 4, count: 8, start: 5, stand: 0.6 });
  // its hood: open south (the feed from L3's prism) and east (toward the tube)
  R(-111.1, T4Y + 0.7, T4Z - 0.9, -108.9, T4Y + 0.9, T4Z + 0.9);
  R(-111.1, T4Y - 0.9, T4Z - 0.9, -108.9, T4Y - 0.7, T4Z + 0.9);
  R(-111.1, T4Y - 0.7, T4Z - 0.9, -108.9, T4Y + 0.7, T4Z - 0.7);
  R(-111.1, T4Y - 0.7, T4Z - 0.7, -110.9, T4Y + 0.7, T4Z + 0.9);
  const pC = new Prism(W, { pos: [-110, T4Y, -47.5], rotatable: true, yaw: 0, step: Math.PI / 4, count: 8, start: 2, stand: 1.2 });
  K.lights.push(rt4);
  hint([-112, L3, -51], [-96, L3 + 3, -44], 'Another tube in the east wall. The prism on the column could reach it — but its hood only takes light from the <b>south</b>: from <b>this</b> prism.', 7);
  // L3's beam-lock: the hard-light lift up into the apex chamber
  const lift = new MovingPlatform(W, { min: [-100, L3 - 0.4, -51], max: [-96, L3, -47], offset: [0, TOP - L3, 0], speed: 2.2, pause: 2.4, active: false, zone, kind: 'plat' });
  lift.mesh.visible = false;

  // ================================================================ THE APEX CHAMBER (y -10) and the light pillar
  F(TX1 + 2, TOP - 0.5, TZ1 + 2, TX2 - 2, TOP, -55.6); // north half
  F(TX1 + 2, TOP - 0.5, -48.4, -100, TOP, TZ2 - 2); // south half (the lift's hole east of it)
  F(TX1 + 2, TOP - 0.5, -55.6, -120, TOP, -48.4); // west of the oculus
  F(-104, TOP - 0.5, -55.6, TX2 - 2, TOP, -51); // east of the oculus, north of the lift
  // (the oculus over the shaft, x -120…-104, z -55.6…-48.4, ringed by a low rail)
  for (const [x1, z1, x2, z2] of [[-120.2, -55.8, -103.8, -55.6], [-120.2, -48.4, -103.8, -48.2], [-120.2, -55.6, -120, -48.4], [-104, -55.6, -103.8, -51]]) M(x1, TOP, z1, x2, TOP + 1, z2);
  const apexCrystal = new LightReceiver(W, { pos: [-112, TOP + 1.4, -60.4], face: '+z', color: YELLOW, size: 1.6, look: 'disc' });
  F(-113.4, TOP, -61.6, -110.6, TOP + 0.5, -59.2);
  const apexDoor = new Seal(W, { min: [-104, TOP, TZ1], max: [-100, TOP + 3.4, TZ1 + 0.6], color: YELLOW, zone, closed: true });
  K.lights.push(apexCrystal);
  ck([-108, TOP, -58], Math.PI / 2, [6, 3, 5]);
  devStart('solar10', [-108, TOP, -58], Math.PI / 2, [RED, YELLOW], 'The Sun Temple apex');
  // the light pillar: a colossal beam out of the apex into the sky, visible from the whole chasm
  const pillarMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.82, 0.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 400, 20, 1, true), pillarMat);
  pillar.position.set(-112, ROOF + 200, -53);
  pillar.userData.noCull = true;
  W.scene.add(pillar);
  const pillarCore = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 400, 12, 1, true), pillarMat);
  pillarCore.position.copy(pillar.position);
  pillarCore.userData.noCull = true;
  W.scene.add(pillarCore);
  let apexLit = false, pillarK = 0;
  W.add({
    update(dt) {
      if (apexLit && pillarK < 1) pillarK = Math.min(1, pillarK + dt / 2.5);
      pillarMat.opacity = pillarK * (0.55 + 0.08 * Math.sin(W.time * 3));
      pillar.visible = pillarCore.visible = pillarK > 0.01;
      pillar.scale.set(1 + 0.04 * Math.sin(W.time * 5), 1, 1 + 0.04 * Math.sin(W.time * 5));
    },
  });
  hint([TX1 + 2, TOP, TZ1 + 2], [TX2 - 2, TOP + 3, -55.6], 'The apex. One crystal left dark — give it your light.', 6);

  // ================================================================ the north balcony and THE HIGH CROSSING
  // (restored from the old Solar's high routes: pillars over the drop, a timed hard-light bridge, crumbling
  // stones — the last only LOOKS solid — a sun lance, chroma stones you stand on only in their color)
  F(-106, TOP - 0.6, -68, -96, TOP, TZ1);
  glowEdge(-106, -68, -96, TZ1, TOP, glow, zone);
  const column = (x1, z1, x2, z2, top) => {
    R(x1 + 0.3, FLOOR, z1 + 0.3, x2 - 0.3, top - 0.8, z2 - 0.3);
    F(x1, top - 0.8, z1, x2, top, z2);
    glowEdge(x1, z1, x2, z2, top, glow, zone);
  };
  column(-100, -73.5, -97, -70.5, -9.6);
  column(-101, -79.5, -98, -76.5, -9.2);
  column(-104.5, -86.5, -101, -83, -8.8);
  column(-110, -90, -104.5, -85, -8.4); // the corner landing
  ck([-107, -8.4, -87.5], Math.PI / 2, [4, 3, 4]);
  devStart('solar11', [-103, TOP, -66], 0, [RED, YELLOW], 'The high crossing (over the court)');
  // (the lance burns only up here, over the jump: its column never reaches the court)
  lanceRig(-104, -82.5, -98, -79.5, -40, -1, { period: 3.4, on: 1.3, warn: 0.7 }, FLOOR, '+x');
  const bridgeC = new PhasePlatform(W, { min: [-125.5, -8.8, -88.5], max: [-110, -8.4, -86.5], on: false, zone });
  const actC = new LightReceiver(W, { pos: [-114, -5.6, CZ1 + 0.12], face: '+z', color: YELLOW, size: 1.2, look: 'disc', mode: 'timed', time: 5, fill: 0.35, links: [bridgeC] });
  column(-129, -89, -125.5, -85, -8.4);
  B.crumble({ min: [-132.5, -9.0, -84], max: [-130, -8.6, -81.5], delay: 0.6, respawn: 3, zone });
  B.crumble({ min: [-133.6, -9.2, -79.5], max: [-131, -8.8, -77], delay: 0.3, respawn: 3, disguise: true, zone }); // looks solid: don't linger
  const chroma = [[-75, -72.5, RED, -9.0], [-71, -68.9, YELLOW, -8.8]];
  for (const [z1, z2, c, top] of chroma) B.chromaPlatform({ min: [-133.6, top - 0.4, z1], max: [-131, top, z2], color: c, zone });
  F(CX1, -9, -67.5, -130.4, S, -58); // the west rim ledge at the passage
  glowEdge(CX1, -67.5, -130.4, -58, S, glow, zone);
  new Drone(W, { pos: [-112, -2, -80], color: YELLOW, range: 24 });
  new Drone(W, { pos: [-126, -3, -78], color: YELLOW, shields: [RED], range: 22 });
  // falling from up here fades you back to the crossing's last checkpoint (the courtyard is a long way down)
  W.trigger([CX1, -46, CZ1], [CX2, -40, TZ1 - 0.2], () => apexLit && !game.voidT && game.state === 'playing' && game.player.vel.y < -10 && game.fallOutOfWorld(), { once: false });
  area([CX1, -9, -67.5], [-130.4, -4, -58], canyonMood);
  hint([-106, TOP, -68], [-96, TOP + 3, -64], 'Back in the sun. Across the chasm, high over the court: the <b>west rim</b> and the way on.', 6);
  hint([-110, -8.4, -90], [-104.5, -5, -85], 'A <b style="color:#ffd23a">sun-disc</b> on the north wall wakes a <b>hard-light bridge</b> west — for a few seconds.', 5);
  hint([-129, -8.4, -89], [-125.5, -5, -85], 'Cracked stones, then stones that are solid only while your blaster is <b>their color</b> (<b>1</b>/<b>2</b>).', 6);

  // ================================================================ the beam-locks → awakenings
  const locks = [
    { id: 'solar_t1', recv: rt1, prisms: [], set: [], on: () => gateT1.open(), wake: 1, say: 'The beam-lock opens. Braziers kindle on the first landing.' },
    { id: 'solar_t2', recv: rt2, prisms: [pRot2], set: [6], on: (q) => stair2.forEach((p) => p.set(true, q)), wake: 2, say: 'The temple stirs: a hard-light stair climbs the east wall.' },
    { id: 'solar_t3', recv: rt3, prisms: [], set: [], on: (q) => stair3.forEach((p) => p.set(true, q)), wake: 3, say: 'Light runs up the glyph seams. Ledges of hard light form on the west wall.' },
    { id: 'solar_t4', recv: rt4, prisms: [pC, pD], set: [0, 6], on: (q) => ((lift.active = true), (lift.mesh.visible = true), q || game.hud.message('A <b>lift of hard light</b> rises from the landing toward the apex.', 4)), wake: 4, say: '' },
  ];
  let restoringLocks = false;
  locks.forEach((L) => {
    L.recv.onOn = () => {
      L.on(restoringLocks);
      wake(L.wake, restoringLocks);
      L.prisms.forEach((p) => (p.rotatable = false));
      mark(L.id);
      if (!restoringLocks && L.say) game.hud.message(L.say, 4.5);
    };
  });
  apexCrystal.onOn = () => {
    if (apexLit) return;
    apexLit = true;
    apexDoor.open(restoringLocks);
    wake(5, restoringLocks);
    mark('solar_apex');
    if (restoringLocks) {
      pillarK = 1;
      return;
    }
    game.player.shake = Math.max(game.player.shake || 0, 0.8);
    audio.sample('titan_charge', { gain: 0.9, rate: 0.8 });
    setTimeout(() => audio.sample('boss_slam', { gain: 1, rate: 0.6 }), 900);
    game.hud.message('The temple is <b>awake</b>. A pillar of light leaves the apex for the sky — and the balcony door opens.', 6);
  };

  // ================================================================ persistence and starts
  const stageAt = (p) => {
    const inB = (x1, x2, z1, z2, y1, y2) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2 && p.y >= y1 && p.y <= y2;
    if (depths.stageAt(p) < 4) return 0;
    if (inB(CX1, CX2, CZ1, TZ1 - 0.5, -95, -50) && p.y < -60) return 0; // the courtyard itself
    if (inB(TX1, TX2, -70, TZ2, -70, -57)) return 1; // the doors, the vestibule, L0
    if (inB(TX1, TX2, TZ1, TZ2, -57, -40)) return 2; // stage 1, L1
    if (inB(TX1, TX2, TZ1, TZ2, -40, -28)) return 3; // stage 2, L2
    if (inB(TX1, TX2, TZ1, TZ2, -28, -15)) return 4; // stage 3, L3
    if (inB(TX1, TX2, TZ1, TZ2, -15, 0)) return 5; // the apex chamber
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
    restoringLocks = true;
    locks.forEach((L, i) => {
      if (L.recv.on || !(ev(L.id) || stage >= i + 2)) return;
      L.prisms.forEach((p, j) => p.setIndex(L.set[j]));
      L.recv.keep = true;
      L.recv.setOn(true, null, true);
    });
    if ((ev('solar_apex') || stage >= 6) && !apexCrystal.on) {
      apexCrystal.keep = true;
      apexCrystal.setOn(true, null, true);
    }
    restoringLocks = false;
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
    if (inB(TX1, TX2, TZ1, TZ2, -59, -55.5) && !rt1.on) return `Hold the ${Y}beam${E} on a <b>prism</b>: the light must find the receiver in the <b>glass case</b> beyond the wall.`;
    if (inB(TX1, TX2, TZ1, TZ2, -67, -47)) return 'Climb the <b>west wall</b>: from the top ledge, the <b>sun-disc</b> summons hard-light steps to the landing.';
    if (inB(TX1, TX2, TZ1, TZ2, -47, -44)) return rt2.on ? 'Up the <b>hard-light stair</b> on the east wall.' : 'Turn the <b>prism on the tall column</b> (shoot its base) so its light runs <b>south</b> into the hooded prism — then hold the beam on it.';
    if (inB(TX1, TX2, TZ1, TZ2, -44, -36)) return 'Along the north wall; the <b>sun-disc</b> above the last ledge brings the steps to the landing.';
    if (inB(TX1, TX2, TZ1, TZ2, -36, -33)) return rt3.on ? 'Up the new <b>hard-light ledges</b> on the west wall.' : 'Hold the beam on the <b>gliding prism</b> as it reaches the <b>east end</b> of its rail.';
    if (inB(TX1, TX2, TZ1, TZ2, -33, -23)) return 'Up the west wall. From the top, the two <b>sun-discs</b> — chain them — bring the steps to the landing.';
    if (inB(TX1, TX2, TZ1, TZ2, -23, -12)) return rt4.on ? 'Ride the <b>hard-light lift</b> to the apex.' : `Turn <b>this landing's prism</b> to face <b>north</b> and the <b>column prism</b> to face <b>east</b>, into the tube.`;
    if (inB(TX1, TX2, TZ1, TZ2, -12, 0)) return apexLit ? 'Out onto the <b>north balcony</b>.' : `Give the <b>apex crystal</b> your ${Y}light${E}.`;
    if (inB(CX1, CX2, CZ1, TZ1, -12, 2)) return 'Cross high over the court to the <b>west rim</b>: columns, the hard-light bridge, the crumbling stones, the chroma stones.';
    return null;
  };

  return { ambush, targets, flights, locks, apexCrystal, objective, stageAt, get apexLit() { return apexLit; }, corePick, rt1, rt2, rt3, rt4, pRot2, pHood, pMove, pC, pD, pa, pb, pc, act1, act2, act3a, act3b, actC, lift, gateT1, apexDoor };
}


// SOLAR COURT — the SUN YARD, where the stargate's blast lets you out of the buried matrix (solarTemple.js
// calls buildSolarCourt). A dark tunnel runs east under the mesa from the hole to the gatehouse lift; it
// climbs into a pylon gatehouse and you step out WEST into blazing daylight (the eyes take a moment) onto a
// long sun yard on a shelf in the mesa's flank, open on its south side past a colonnade over a vast drop to
// the lowland desert. At the yard's far (west) end the SUN TEMPLE rises from a sheer cut face, the sun just
// over its north shoulder.
//
//   THE TUNNEL (y -64; the hole's vestibule x -125…-115, then x -115 → -44.5 along z -92…-86) and the
//     GATEHOUSE LIFT (x -44.5…-38.5, z -92…-86, y -64 → -38): dark, the conduits' last glow.
//   THE GATEHOUSE (x -48…-36): a dark hall; its portal (x -48, z -89…-83) looks west down the yard.
//   THE SUN YARD (x -100…-48, z -94…-60, floor y -38): silent; the YELLOW core in its ring on the dais
//     (x -70). Take it and the yard wakes: scarabs burst from the sand, watchers come down the ledges on the
//     north wall, turrets rise on the colonnade (yellow bodies, red shields).
//   THE CUT FACE (x -100…-99, y -38 → -26): no stair; four yellow sun-disc targets in its flanks raise it
//     flight by flight once the yard is won. At its head, the temple's door (the temple itself is
//     solarTempleInterior.js, placed in temple-local coordinates: origin at the door (-100, -26, -76), +z
//     into the temple = world west).
//   THE EXPANSE (scenery): the lowland desert far below the colonnade; the cliff city and its colossi closing
//     the view to the east (they hide the Foundry), the gatehouse's pylons over the mesa.
//
// buildSolarCourt(B, K, { restoring }) → { ambush, targets, flights, corePick, courtWon, inYard, objective,
//   DOOR, YF, TF }. Persistence: solar_court (the ambush won), solar_stair1…4.
import * as THREE from 'three';
import { RED, YELLOW } from '../colors.js';
import { MovingPlatform, Pickup } from '../entities/misc.js';
import { LightReceiver } from '../entities/sunlight.js';
import { mat, boxGeo } from '../materials.js';
import { audio } from '../audio.js';
import { mergeBoxes } from './solarSky.js';

const SOUNDS = ['servo_heavy', 'hydraulic_land', 'floor_collapse', 'elevator_start', 'wind_gust'];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

const _v = new THREE.Vector3();

// A flight of stairs that grinds out of a cut face: its steps (boxes, given at their final places) start
// pushed `depth` m back into the face along `dir` and slide out together, with dust, a rumble and a shake.
class StairFlight {
  constructor(W, game, steps, { dir = [1, 0, 0], depth = 3.2, zone = 'yellow' }) {
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
      _v.set(o.max.x + 0.1, o.max.y, o.min.z + Math.random() * (o.max.z - o.min.z));
      this.W.fx.burst(_v, 0xa88758, { count: 2, speed: 1.6, life: 1.2, size: 0.5, gravity: -0.4, mode: 'puff' });
    }
    if (this.k >= 1) audio.sample('hydraulic_land', { gain: 0.8, rate: 0.7 }) || audio.sample('servo_heavy', { gain: 0.6, rate: 1.2 });
  }
}

// ================================================================ the build
export function buildSolarCourt(B, K, { restoring = () => false } = {}) {
  const { W, game, level, hint, devStart, blocker, glowEdge, area, zoneTitle, onRespawn } = B;
  const { R, M, F, D, G, quick, lamp, pipe, glyphs, pylon, strata, ck, has, zone, glow, SKY, S, brokenPillar, drum, sunRelief, glyphStrip, banner, drift, dglow, DZ } = K;
  const mark = (id) => {
    if (game.events.has(id)) return;
    game.events.add(id);
    game.save();
  };
  const YF = -38; // the yard's floor
  const TF = -26; // the temple's floor (the top of the cut face)
  const X1 = -100, X2 = -48, Z1 = -94, Z2 = -60; // the yard
  const DOOR = [-100, TF, -76]; // the temple door (temple-local origin; +z local = world -x)
  const FACE = -99; // the cut face's front (it stands 1 m proud of the temple's front wall line)

  // ---- atmospheres: the yard's blazing daylight, the flare as you step out of the dark, the gatehouse
  level.atmospheres.solarYard = {
    fog: 0xd8a466, fogNear: 110, fogFar: 640,
    skyTop: [0.34, 0.22, 0.12], skyMid: [0.8, 0.48, 0.2], skyHorizon: [1.0, 0.7, 0.38], aurora: 0, stars: 0,
    hemiSky: 0xffe0b0, hemiGround: 0x6a4428, hemiIntensity: 0.95,
    sunColor: 0xffdcaa, sunIntensity: 3.1, sunDir: [-0.85, 0.5, -0.12],
    exposure: 1.0, bloom: 0.42,
  };
  level.atmospheres.solarFlare = {
    ...level.atmospheres.solarYard,
    fog: 0xfff4dc, fogNear: 0, fogFar: 160, hemiSky: 0xffffff, hemiIntensity: 2.4, exposure: 3.4, bloom: 2.4,
  };
  level.atmospheres.solarGatehouse = {
    fog: 0x120a06, fogNear: 4, fogFar: 46,
    skyTop: [0.02, 0.015, 0.01], skyMid: [0.04, 0.03, 0.02], skyHorizon: [0.06, 0.04, 0.03], aurora: 0, stars: 0,
    hemiSky: 0xb08860, hemiGround: 0x140c06, hemiIntensity: 0.16,
    sunColor: 0xffc890, sunIntensity: 0.04, sunDir: [-0.85, 0.5, -0.12],
    exposure: 1.15, bloom: 0.6,
  };
  const deepMood = () => {
    game.setMusic(has(YELLOW) ? 'music_yellow' : 'music_haunt');
    game.setAmbient('amb_wind');
    game.setAtmosphere('solarDeep');
  };

  // ================================================================ THE TUNNEL (from the hole, y -64)
  // the vestibule behind the blown plug (x -125…-115), rubble from the blast
  F(-125, -66, -94, -115, -64, -86);
  R(-127, -66, -94, -125, -54, -84);
  R(-127, -66, -86, -113, -54, -84);
  R(-127, -56, -94, -113, -54, -86);
  R(-115, -66, -94, -113, -56, -92);
  {
    const geos = [];
    for (let k = 0; k < 16; k++) geos.push(new THREE.BoxGeometry(0.6 + Math.random() * 1.2, 0.3 + Math.random() * 0.7, 0.6 + Math.random() * 1.1).rotateY(Math.random() * 3).translate(-124 + Math.random() * 8, -63.8, -93 + Math.random() * 6));
    W.scene.add(new THREE.Mesh(mergeBoxes(geos), mat('rock', zone)));
  }
  // the long corridor east (6 wide, 6 high): dark, a strip of dying glow along its foot, a lamp now and then
  F(-115, -66, -92, -44.5, -64, -86);
  F(-44.5, -66, -92, -38.5, -64.4, -86); // (under the lift)
  R(-113, -66, -94, -36.5, -46, -92);
  R(-113, -66, -86, -36.5, -46, -84);
  R(-113, -58, -92, -44.5, -56, -86);
  R(-45, -56, -92, -44.5, -46, -86); // (closes the dark over the corridor's roof from the shaft)
  for (let x = -112; x < -46; x += 6) {
    D(x - 0.25, -64, -91.95, x + 0.25, -58, -91.55); // ribs
    D(x - 0.25, -64, -86.45, x + 0.25, -58, -86.05);
    D(x - 0.25, -58.6, -92, x + 0.25, -58, -86);
  }
  G(-113, -63.9, -91.6, -45, -63.82, -91.45);
  G(-113, -63.9, -86.55, -45, -63.82, -86.4);
  for (const x of [-104, -86, -68, -52]) lamp(x, -64, -91.3, { h: 2.2, pool: 0 });
  for (const [x, z, w, d] of [[-108, -88, 3, 2], [-92, -90.5, 4, 1.6], [-75, -87.5, 3, 1.6], [-60, -90, 5, 2]]) drift(x, -64, z, w, d);
  W.trigger([-127, -66, -94], [-44.5, -56, -84], deepMood, { once: false });
  hint([-125, -64, -94], [-115, -60, -86], 'A tunnel, east under the mesa — and far off, at its end, a <b>lift</b>.', 5);
  // the gatehouse lift: it waits at the bottom and climbs whenever you're near either end
  R(-38.5, -66, -92, -36.5, YF, -86); // the shaft's east wall
  const lift = new MovingPlatform(W, { min: [-44.4, -64.4, -91.9], max: [-38.6, -64, -86.1], offset: [0, 26, 0], speed: 3.2, pause: 2.2, active: false, zone, kind: 'grate' });
  for (const z of [-92.2, -85.8]) M(-44.6, -64, z - 0.15, -44.3, YF + 6, z + 0.15); // its guide posts
  // (while it's away from the top, an invisible lid keeps the shaft from swallowing anyone)
  const lid = W.addSolid(new THREE.Vector3(-44.5, YF, -92), new THREE.Vector3(-38.5, YF + 3, -86), { noShot: true });
  W.add({
    update(dt, player) {
      const p = player.pos, near = p.x > -50 && p.x < -36 && p.z > -95 && p.z < -83 && p.y > -66 && p.y < YF + 6;
      if (near) lift.active = true;
      else if (lift.u <= 0 && lift.wait > 0) lift.active = false; // (back at the bottom: it rests)
      // (it closes once the lift has left the top, unless you're riding it down: then it waits till you're out)
      const over = p.x > -44.9 && p.x < -38.1 && p.z > -92.4 && p.z < -85.6 && p.y < YF + 3;
      const away = lift.cur.y + lift.size.y < YF - 0.3;
      if (!away || (over && p.y < YF - 0.2)) lid.enabled = false;
      else if (!over) lid.enabled = true;
    },
  });

  // ================================================================ THE SHELF, THE GATEHOUSE, THE WALLS
  // the yard's floor slab (the temple stands on its west part; the lift shaft cut through it)
  R(-134, -46, -96, -44.5, YF, -58);
  R(-44.5, -46, -96, -38.5, YF, -92);
  R(-44.5, -46, -86, -38.5, YF, -58);
  R(-38.5, -46, -96, -36, YF, -58);
  // the north wall (the gate hall's and the sinkhole's walls carry it west of x -86)
  R(-86, -46, -96, -36, S, -94);
  R(-60, -46, -100, -36, S, -96);
  strata(-100, Z1, -48, Z1 + 0.3, [-33, -26, -18, -12]);
  // the shelf's south cliff, down into the haze; the mesa's cliffs either side of the drop
  R(-134, -118, -60, -36, -46, -58);
  R(-138, -118, -58, -134, -10, -40);
  for (let k = 0; k < 6; k++) R(-48 + k * 0.5, -118 + (k ? 74 + k * 10 : 0), -58 + k * 0.4, -32, -34 + k * 10, -40); // (it rises to +26: the Foundry stays hidden)
  strata(-134, -58.3, -36, -58, [-60, -76, -94]);
  // the gatehouse: a pylon gate in the yard's east end, its portal looking west down the yard
  R(-48, YF, -96, -47, S, -89);
  R(-48, YF, -83, -47, S, -58);
  R(-48, YF + 6, -89, -47, S, -83);
  R(-47, YF, -96, -36, S, -93); // the hall's north wall
  R(-47, YF, -79, -36, S, -58); // the south block
  R(-37, YF, -93, -36, S, -79); // the hall's east wall
  R(-47, YF + 7, -93, -37, S, -79); // the hall's roof
  for (const [z1, z2, n] of [[-97, -89.5, 5], [-82.5, -57, 6]]) {
    // the pylon towers: battered courses over the mesa, a cornice, a glowing band
    for (let k = 0; k < n; k++) {
      const i = k * 0.55, y = S + k * 5;
      R(-48.4 + i, y, z1 + i, -34 - i * 0.5, y + 5, z2 - i);
    }
    const top = S + n * 5, i = n * 0.55;
    R(-49, top, z1 + i - 0.6, -34, top + 1, z2 - i + 0.6);
    G(-49.05, top + 0.3, z1 + i - 0.6, -48.95, top + 0.5, z2 - i + 0.6);
  }
  R(-48.4, S, -89.5, -36, S + 26, -82.5); // the gate block between the towers
  sunRelief('-x', -48, -86, YF + 9.5, 2.6); // a winged sun over the portal
  for (const s of [-1, 1]) onWallWing(s);
  function onWallWing(s) {
    for (let k = 0; k < 6; k++) K.onWall?.('-x', -48, -86 + s * (3.2 + k * 0.9), YF + 9.6 - k * 0.18, -86 + s * (3.9 + k * 0.9), YF + 10.2 - k * 0.12, 0.12, 'rock');
  }
  glyphStrip('-x', -48, -95, -90, YF + 4);
  glyphStrip('-x', -48, -82, -60, YF + 4);
  // the portal: dark inside, blazing out; stepping through it the light floods your eyes
  W.trigger([-47, YF, -93], [-37, YF + 7, -79], () => game.setAtmosphere('solarGatehouse'), { once: false });
  let flareT = -9;
  W.trigger([-49.6, YF, -90], [-48.2, YF + 6, -82], () => {
    const pl = game.player;
    if (pl.vel.x > 0.5 || W.time - flareT < 6) return;
    flareT = W.time;
    game.setAtmosphere('solarFlare', true);
    setTimeout(() => courtMood(), 140);
    audio.sample('wind_gust', { gain: 0.6, rate: 0.9 });
  }, { once: false });
  zoneTitle([-56, YF, -92], [-48, YF + 6, -80], 'SOLAR · THE MESA', 'THE SUN YARD', '#ffd23a');
  hint([-58, YF, -92], [-48, YF + 6, -80], 'Daylight! A long yard on the mesa\'s flank — and at its end the <b>Sun Temple</b>, the sun over its shoulder. On the dais: the <b style="color:#ffd23a">yellow core</b>.', 7);

  // ================================================================ THE SUN YARD
  // the south side: a colonnade on the shelf's lip (a parapet between its columns; nobody goes over)
  R(X1, YF, -59.4, X2, YF + 0.7, -58.6);
  for (let x = -97; x <= -51; x += 4) {
    R(x - 0.7, YF, -60.3, x + 0.7, YF + 0.5, -58.7); // base
    R(x - 0.55, YF + 0.5, -60.15, x + 0.55, YF + 7, -58.85);
    for (let y = YF + 1.6; y < YF + 6.6; y += 1.4) D(x - 0.58, y, -60.18, x + 0.58, y + 0.08, -58.82);
    R(x - 0.85, YF + 7, -60.45, x + 0.85, YF + 7.5, -58.55); // capital
  }
  R(X1, YF + 7.5, -60.6, X2, YF + 8.4, -58.4); // the architrave
  G(X1, YF + 7.8, -60.65, X2, YF + 7.95, -60.6);
  blocker([X1, YF + 0.7, -60], [X2, SKY, -58]);
  // the north wall: ledges the watchers come down from, reliefs, glyph bands, banners, niches
  for (const [x1, x2] of [[-94, -86], [-66, -58]]) {
    F(x1, YF + 5.4, Z1, x2, YF + 6, Z1 + 2.4);
    glowEdge(x1, Z1, x2, Z1 + 2.4, YF + 6, glow, zone);
    for (const x of [x1 + 1, x2 - 1]) R(x - 0.3, YF + 3.6, Z1, x + 0.3, YF + 5.4, Z1 + 1.6); // corbels
  }
  for (const x of [-80, -72]) sunRelief('+z', Z1, x, YF + 10, 2);
  glyphStrip('+z', Z1, -99, -50, YF + 3.2);
  glyphStrip('+z', Z1, -99, -50, YF + 15);
  for (const x of [-96, -84, -64, -52]) banner('+z', Z1, x, YF + 14, 2.2, 8);
  for (const x of [-90, -76, -62]) {
    // niches cut in the wall (the cliff city's lowest homes)
    R(x - 1.6, YF + 18, Z1, x + 1.6, YF + 18.4, Z1 + 0.8);
    D(x - 1.2, YF + 18.4, Z1 - 0.01, x + 1.2, YF + 22, Z1 + 0.02, 'ceil');
  }
  // the dais and the core: the yellow core floating in an upright stone ring, a sun-ray inlay round it
  const CX = -70, CZ = -77;
  F(CX - 4, YF, CZ - 4, CX + 4, YF + 0.4, CZ + 4);
  glowEdge(CX - 4, CZ - 4, CX + 4, CZ + 4, YF + 0.4, glow, zone);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = CX + Math.cos(a) * 7, z = CZ + Math.sin(a) * 7;
    W.deco(x - 0.25, YF, z - 0.25, x + 0.25, YF + 0.04, z + 0.25, 'glow1', zone);
  }
  {
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85, metalness: 0.1 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.32, 8, 32), ringMat);
    ring.position.set(CX, YF + 2.6, CZ);
    ring.rotation.y = Math.PI / 2;
    W.scene.add(ring);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.22).multiplyScalar(1.6) }));
    seam.position.set(CX + 0.35, YF + 2.6, CZ);
    seam.rotation.y = Math.PI / 2;
    W.scene.add(seam);
    R(CX - 0.5, YF + 0.4, CZ - 2.2, CX + 0.5, YF + 0.7, CZ + 2.2); // its foot
  }
  const corePick = new Pickup(W, { pos: [CX, YF + 2.6, CZ], type: 'color', color: YELLOW, onCollect: (pk) => game.unlockColor(YELLOW, pk.pos) });
  ck([-55, YF, -92], Math.PI / 2, [6, 3, 4]);
  devStart('solar11', [-55, YF, -92], Math.PI / 2, [RED], 'The sun yard (the gate blown open)');
  // dressing: the old sun court's look — broken pillars, fallen drums, drifts, sensor pylons, two obelisks
  // whose mirror caps still catch the sun
  for (const [x, z, h, cap] of [[-92, -66, 3.2], [-88, -88, 5.4, true], [-58, -66, 2.2], [-80, -63.5, 1.4], [-60, -91, 2.8], [-94, -80, 4.2, true]]) brokenPillar(x, YF, z, h, cap);
  drum(-84, YF, -70, true);
  drum(-62, YF, -72, false);
  drum(-76, YF, -90, true, 2.2);
  for (const [x, z, w, d] of [[-90, -73, 6, 4], [-60, -84, 5, 5], [-78, -64, 7, 3], [-52, -70, 6, 3], [-96, -88, 5, 3]]) drift(x, YF, z, w, d);
  for (const [x, z] of [[-97, -92], [-51, -92], [-97, -62], [-51, -62]]) pylon(x, YF, z, 7);
  for (const z of [-90, -62]) {
    // an obelisk with a mirror cap
    const x = -82;
    R(x - 1.2, YF, z - 1.2, x + 1.2, YF + 1, z + 1.2);
    for (let k = 0; k < 4; k++) R(x - 0.8 + k * 0.12, YF + 1 + k * 3, z - 0.8 + k * 0.12, x + 0.8 - k * 0.12, YF + 4 + k * 3, z + 0.8 - k * 0.12);
    M(x - 0.4, YF + 13, z - 0.4, x + 0.4, YF + 14.4, z + 0.4);
    G(x - 0.42, YF + 13.4, z - 0.42, x + 0.42, YF + 13.55, z + 0.42);
  }
  // the processional way from the gatehouse to the stair: flagstones and four sphinxes facing across it
  W.deco(-98.6, YF, -80.5, -50, YF + 0.04, -71.5, 'floor', zone);
  G(-98.6, YF + 0.02, -80.62, -50, YF + 0.06, -80.5);
  G(-98.6, YF + 0.02, -71.5, -50, YF + 0.06, -71.38);
  const sphinx = (x, z, s) => {
    // facing s = +1 (toward +z) or -1; built along z
    const b = (x1, y1, z1, x2, y2, z2) => R(x + x1, YF + y1, z + Math.min(z1 * s, z2 * s), x + x2, YF + y2, z + Math.max(z1 * s, z2 * s));
    b(-1.5, 0, -3.6, 1.5, 1, 3.6); // plinth
    b(-1.1, 1, -1, 1.1, 2.9, 3.3); // the body
    b(-1.15, 1, 1.6, 1.15, 2.2, 3.4); // haunches
    b(-1.05, 1, -3.3, -0.35, 1.55, -0.6); // paws
    b(0.35, 1, -3.3, 1.05, 1.55, -0.6);
    b(-1, 1, -1.5, 1, 4.1, 0.4); // the chest
    b(-1.05, 4.1, -1.3, 1.05, 5.8, 0.5); // the nemes
    b(-0.6, 4.3, -1.75, 0.6, 5.5, -1.25); // the face
    G(-1.12 + x, YF + 3.6, z + Math.min(-1.32 * s, 0.52 * s), 1.12 + x, YF + 3.75, z + Math.max(-1.32 * s, 0.52 * s));
  };
  sphinx(-88, -84, 1);
  sphinx(-88, -68, -1);
  sphinx(-55.5, -84, 1);
  sphinx(-55.5, -68, -1);
  // eerily silent until the core is taken and the yard wakes
  const silence = () => {
    game.musicTrack = 'silence';
    game.musicOverride = 'silence';
    audio.wantTrack = null;
    audio.musicLayer?.to?.(null, null, 3);
    audio.stopMusic?.(2);
    game.setAmbient('amb_solar');
    game.setAtmosphere('solarYard');
  };
  let ambush = null;
  const courtMood = () => {
    if (ambush && ambush.state === 'cleared') {
      game.setMusic('music_solar');
      game.setAmbient('amb_solar');
      game.setAtmosphere('solarYard');
    } else if (ambush && ambush.state !== 'armed') game.setAtmosphere('solarYard');
    else silence();
  };
  W.trigger([X1, YF - 1, Z1], [X2 - 0.5, YF + 12, Z2 + 2], courtMood, { once: false });
  const inYard = (p) => p.x > X1 - 1 && p.x < X2 && p.z > Z1 && p.z < Z2 + 2 && p.y > YF - 2 && p.y < TF + 1;

  // ---- THE AMBUSH: it wakes once you hold yellow and step down off the dais
  ambush = B.encounter({
    trigger: [[0, -500, 0], [1, -499, 1]], // started by hand (below)
    seals: [],
    title: 'THE SUN YARD', sub: 'THE GUARDIANS WAKE', color: '#ffd23a', music: null, zone, resume: true,
    checkpoint: { pos: [CX, YF + 0.4, CZ + 5], yaw: Math.PI / 2 },
    waves: [
      { title: 'THE SANDS STIR', enemies: [
        { type: 'scarab', pos: [-90, YF, -84], color: YELLOW, burrow: true },
        { type: 'scarab', pos: [-58, YF, -68], color: YELLOW, shields: [RED], burrow: true, delay: 0.3 },
        { type: 'scarab', pos: [-80, YF, -66], color: YELLOW, burrow: true, delay: 0.6 },
        { type: 'scarab', pos: [-56, YF, -88], color: YELLOW, shields: [RED], burrow: true, delay: 0.9 },
        { type: 'drone', pos: [-84, YF + 8, -74], color: YELLOW, delay: 1.2 },
        { type: 'drone', pos: [-60, YF + 8, -80], color: YELLOW, delay: 1.6 },
      ] },
      { title: 'THE WATCHERS DESCEND', enemies: [
        { type: 'mummy', pos: [-90, YF + 6, -92.6], color: YELLOW, shieldColor: RED },
        { type: 'mummy', pos: [-62, YF + 6, -92.6], color: YELLOW, shieldColor: RED, delay: 0.6 },
        { type: 'turret', pos: [-85, YF + 8.4, -59.5], color: YELLOW, shields: [RED], delay: 1.2 },
        { type: 'turret', pos: [-63, YF + 8.4, -59.5], color: YELLOW, delay: 1.6 },
        { type: 'scarab', pos: [-74, YF, -70], color: YELLOW, shields: [RED], burrow: true, delay: 2.2 },
      ] },
      [
        { type: 'warden', pos: [-74, YF + 5, -80], shield: RED, core: YELLOW },
        { type: 'brute', pos: [-92, YF, -70], color: YELLOW, delay: 1.0 },
        { type: 'mortar', pos: [-54, YF, -66], color: YELLOW, delay: 1.6 },
        { type: 'mummy', pos: [-86, YF, -88], color: YELLOW, shieldColor: RED, delay: 2.2 },
        { type: 'scarab', pos: [-66, YF, -64], color: YELLOW, burrow: true, delay: 2.6 },
      ],
    ],
    onStart: () => game.setMusic('music_combat'),
    onClear: () => {
      game.setMusic('music_solar');
      mark('solar_court');
      game.hud.message('The yard is still again. At its end, the <b>Sun Temple</b> — but its stair is gone. Those <b style="color:#ffd23a">sun-disc targets</b> in the cut face…', 7);
    },
  });
  onRespawn(() => {
    // dying mid-ambush: the yard goes quiet again until it re-arms
    if (ambush.state === 'armed' && has(YELLOW) && game.checkpoint?.pos && inYard(game.checkpoint.pos)) silence();
  });
  {
    let wait = 0;
    W.add({
      update(dt, player) {
        if (ambush.state !== 'armed' || game.state !== 'playing' || !has(YELLOW)) return (wait = 0);
        if (!inYard(player.pos) || player.pos.y > YF + 2) return (wait = 0);
        if ((wait += dt) > 1.4) ambush.start();
      },
    });
  }
  const courtWon = () => ambush.state === 'cleared';
  B.armor([-96, YF, -91]);
  B.armor([-52, YF, -64]);
  B.armor([-90, YF + 6, -93]);

  // ================================================================ THE CUT FACE AND ITS STAIR
  // The temple's terrace stands on a sheer face of dressed stone (y -38 → -26), 1 m proud of the temple's
  // front wall. Four sun-disc targets in its flanks (left and right, at different heights; buttresses hide
  // them from the side) each grind out one flight of the stair. Dark — and deaf to everything — until the
  // yard has been won.
  F(X1, YF, Z1, FACE, TF, -58);
  for (const [z1, z2] of [[-91, -89.2], [-62.8, -61]]) R(FACE, YF, z1, FACE + 3.2, TF + 0.4, z2); // buttresses
  for (const [z1, z2] of [[-83, -82.4], [-69.6, -69]]) R(FACE, YF, z1, FACE + 1, TF, z2); // the stair's cheek walls
  const STEP = 0.4444, NSTEPS = 27;
  const stepBox = (i) => {
    const top = YF + STEP * (i + 1), xOut = FACE + (NSTEPS - i) * STEP;
    return [FACE, YF, -82.4, xOut, top, -69.6];
  };
  const flights = [[0, 7], [7, 14], [14, 21], [21, 27]].map(([a, b]) => {
    const steps = [];
    for (let i = a; i < b; i++) steps.push(stepBox(i));
    return new StairFlight(W, game, steps, { dir: [1, 0, 0], depth: (NSTEPS - a) * STEP + 0.2, zone });
  });
  const targets = [
    [-86.2, YF + 2.8], [-65.8, YF + 4], [-86.6, YF + 7.4], [-65.4, YF + 8.8],
  ].map(([z, y], i) => new LightReceiver(W, {
    pos: [FACE + 0.12, y, z], face: '+x', color: YELLOW, size: 1.5, look: 'disc', when: courtWon,
    onOn: () => {
      flights[i].raise(restoring());
      mark('solar_stair' + (i + 1));
      if (!restoring()) game.hud.message(['The first flight grinds out of the face.', 'A second flight.', 'The third.', 'The stair is whole: up to the <b>temple doors</b>.'][Math.min(3, flights.filter((f) => f.target).length - 1)], 3.5);
    },
  }));
  K.lights.push(...targets);
  glyphStrip('+x', FACE, -94, -83.4, TF - 1.2);
  glyphStrip('+x', FACE, -68.6, -58, TF - 1.2);
  // the facade's outer dressing (on the temple's front wall line, never inside it): pilasters, a sun disc
  // over the door, glyph bands
  for (const z of [-91, -85, -67, -61]) R(-100, TF, z - 0.7, -99.4, TF + (z < -82 ? 26 : 44), z + 0.7);
  sunRelief('+x', -100, -76, TF + 9, 2.6);
  glyphStrip('+x', -100, -84, -68, TF + 6.4);
  hint([-96, YF, -86], [-84, YF + 4, -66], 'No stair — just a sheer cut face. Those <b style="color:#ffd23a">sun discs</b> in its flanks… hold the <b style="color:#ffd23a">yellow beam</b> on them.', 6);
  devStart('solar12', [DOOR[0] + 1.6, TF, DOOR[2]], Math.PI / 2, [RED, YELLOW], 'The Sun Temple doors (stair raised)');

  // ================================================================ THE EXPANSE (scenery past the colonnade)
  // the cliff city: a massif east of the lowland, its face carved into terraces, doorways and seated
  // colossi crowned with sun discs (it closes the view east: the Foundry stays out of sight)
  {
    const stone = mat('rock', zone); // (the world's sandstone)
    const dark = new THREE.MeshBasicMaterial({ color: 0x2a1a10 });
    const sun = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.3).multiplyScalar(1.4) });
    const g = [], gd = [], gs = [];
    const box = (arr, x1, y1, z1, x2, y2, z2) => arr.push(boxGeo(x2 - x1, y2 - y1, z2 - z1).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2));
    // the massif itself, stepping back as it rises
    for (let k = 0; k < 6; k++) box(g, -66 + k * 2.2, -122 + k * 26, -40, -47, -96 + k * 26, 220);
    // terraces and doorways on its west face, colossi every 40 m, pylons between them
    for (let z = -30; z < 210; z += 40) {
      const fx = -66;
      // a seated colossus: plinth, legs, body, head with a sun disc
      box(g, fx - 9, -122, z - 6, fx, -90, z + 6);
      box(g, fx - 8, -90, z - 4.5, fx - 1, -76, z + 4.5);
      box(g, fx - 6, -76, z - 3.6, fx - 1, -50, z + 3.6);
      box(g, fx - 5, -50, z - 2.2, fx - 1.5, -43, z + 2.2);
      gs.push(new THREE.CylinderGeometry(3.4, 3.4, 0.6, 24).rotateZ(Math.PI / 2).translate(fx - 3.4, -38, z));
      // doorways stacked up the cliff between the colossi
      for (let y = -100; y < 10; y += 13) box(gd, fx + (y + 122) / 26 * 2.2 - 0.05, y, z + 17, fx + (y + 122) / 26 * 2.2 + 0.05, y + 5, z + 21);
    }
    for (const [geos, m] of [[g, stone], [gd, dark], [gs, sun]]) {
      const mesh = new THREE.Mesh(mergeBoxes(geos), m);
      mesh.userData.noCull = true;
      W.scene.add(mesh);
    }
  }

  // ================================================================ the HUD objective for the yard
  const Y = '<b style="color:#ffd23a">', E = '</b>';
  const objective = (p) => {
    const inB = (x1, x2, z1, z2, y1, y2) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2 && p.y >= y1 && p.y <= y2;
    if (inB(-127, -36, -94, -84, -66, -50)) return 'Follow the tunnel <b>east</b> to the <b>lift</b>.';
    if (inB(-48, -36, -96, -79, YF - 1, YF + 8)) return 'Out into the light: <b>west</b>, into the yard.';
    if (!inYard(p)) return null;
    if (!has(YELLOW)) return `Take the ${Y}yellow core${E} from its ring on the dais.`;
    if (!courtWon()) return ambush.state === 'armed' ? 'The yard is waking…' : 'Fight off the yard\'s guardians: their bodies are <b style="color:#ffd23a">yellow</b>, their shields <b style="color:#ff3344">red</b>.';
    if (flights.some((f) => !f.target)) return `Raise the stair: hold the ${Y}yellow beam${E} on the four ${Y}sun discs${E} in the cut face.`;
    return 'Up the stair to the <b>temple doors</b>.';
  };

  return { ambush, targets, flights, corePick, courtWon, inYard, objective, DOOR, YF, TF, lift };
}

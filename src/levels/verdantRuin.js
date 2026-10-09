// VERDANT · THE GRANITE RUIN under the swamp (verdantSwamp.js drops you in through the trapdoor island)
//
// A Mayan-like temple, but not a primitive one: carved granite halls with squared, circuit-like glyph friezes and
// jade inlays, and at its heart the machine — tall glass reactors of glowing, bubbling algae, pipes and conduits
// everywhere, the biofuel plant the whole forest was grown to feed. The builders were engineers.
//   THE CISTERN (-50, -8, -298): you fall into black water in the dark; a ledge, a doorway north.
//   THE GLYPH STAIR: a stepped corridor north, friezes down both walls, the reactor glow ahead.
//   THE REACTOR HALL (x -70..-30, z -318..-344, floor -8): six algae reactors in two rows, log 07b by the first.
//     The sanctum door is high on the north gallery (y 6), sealed by two conduit locks (red, yellow). Climb the
//     first reactor's ladder, cross the catwalk over the west reactor lids, ride the red riser up to the gallery
//     (keep shooting it), hit the red lock there and the yellow lock floating over the east reactor.
//   THE INNER SANCTUM (x -76..-24, z -352..-408, floor 6, 40 m high): a stepped pyramid under a colossal root cradle
//     (verdantKit rootCradle at scale 3), the GREEN core held in its grip over the pyramid's top. Take it: the cradle
//     shudders, dust pours from the roof, slimes pour out of the vents and pools (THE SEED'S GUARD), and when they're
//     down the high east door opens, the niche in the west wall bursts and the boulder comes (verdantEscape.js).
import * as THREE from 'three';
import { RED, YELLOW, GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { boxGeo } from '../materials.js';
import { Checkpoint, Pickup } from '../entities/misc.js';
import { SwampAmbush } from './verdantAmbush.js';
import { ColorSwitch } from '../entities/mechanics.js';
import { GooPad } from '../entities/gooPad.js';
import { buildVerdantEscape } from './verdantEscape.js';

const PI = Math.PI;
const NORTH = 0, SOUTH = PI, EAST = -PI / 2, WEST = PI / 2;
export const HALL = { x1: -70, x2: -30, z1: -344, z2: -318, floor: -8, ceil: 18, gallery: 6 };
export const SANCTUM = { x1: -76, x2: -24, z1: -408, z2: -352, floor: 6, ceil: 46, cx: -50, cz: -380, top: 23.6 };
export const AMBUSH_ID = 'enc:-74,44,-406'; // (the sanctum fight's encounter id: its trigger's min corner)

export function buildVerdantRuin(B, { K, F, trap }) {
  const { W, game, level, hint, devStart, onRespawn } = B;
  const { mats, R, rand } = K;
  const RY = [RED, YELLOW], RYG = [RED, YELLOW, GREEN];
  const tag = (hex, t) => `<b style="color:${hex}">${t}</b>`;
  const R_ = (t) => tag('#ff3344', t), Y_ = (t) => tag('#ffd23a', t), G_ = (t) => tag('#3dff7a', t);
  const say = (min, max, html, t = 6) => hint(min, max, html, t);
  const cp = (pos, yaw, size = [4, 3, 4]) => new Checkpoint(W, game, { pos, yaw, size });
  const mood = (min, max, music, atmosphere = 'verdantRuin') =>
    W.trigger(min, max, () => {
      game.setMusic(audio.musicOr(music, 'music_green'));
      game.setAmbient(audio.sfxOr('amb_ruin', 'amb_core'));
      game.setAtmosphere(atmosphere);
    }, { once: false });
  audio.manifest?.then(() => audio.prefetch(['temple_rumble', 'energy_surge_stone', 'obelisk_crack', 'gate_slam', 'crumble_break', 'door_open', 'charge_up', 'stone_slam', 'amb_ruin', 'vent_gush']));
  const solid = (x1, y1, z1, x2, y2, z2, kind = 'stone') => W.addSolid(new THREE.Vector3(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2)), new THREE.Vector3(Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)), { static: true, kind });
  const slab = (m, x1, y1, z1, x2, y2, z2, isSolid = true, kind = 'stone') => {
    if (x2 - x1 < 0.001 || y2 - y1 < 0.001 || z2 - z1 < 0.001) return;
    K.put(m, boxGeo(x2 - x1, y2 - y1, z2 - z1, 0.35), (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    if (isSolid) solid(x1, y1, z1, x2, y2, z2, kind);
  };
  const T = 1; // wall thickness
  // A granite hall: floor, ceiling, four walls with openings ({ c, w, y0 = 0, h } along each wall), a glyph
  // frieze at glyphY, pilasters, moss up from the floor, roots and vines down from the ceiling, jade inlays.
  function hall({ x1, x2, z1, z2, floor, ceil, n = [], s = [], e = [], w = [], glyphY = 2.6, ceiling = true, pilasters = 4, dress = true }) {
    slab(mats.granite, x1 - T, floor - 1, z1 - T, x2 + T, floor, z2 + T);
    if (ceiling) slab(mats.granite, x1 - T, ceil, z1 - T, x2 + T, ceil + 1, z2 + T);
    const wall = (axis, c, a1, a2, holes) => {
      // axis 'x': runs along x at z = c (thickness toward outside); 'z': along z at x = c
      const piece = (u1, u2, y1, y2) => (axis === 'x' ? slab(mats.granite, u1, y1, c - T / 2, u2, y2, c + T / 2) : slab(mats.granite, c - T / 2, y1, u1, c + T / 2, y2, u2));
      let u = a1;
      for (const o of [...holes].sort((p, q) => p.c - q.c)) {
        const h1 = o.c - o.w / 2, h2 = o.c + o.w / 2, y0 = floor + (o.y0 || 0);
        piece(u, h1, floor, ceil);
        piece(h1, h2, floor, y0);
        piece(h1, h2, y0 + o.h, ceil);
        u = h2;
      }
      piece(u, a2, floor, ceil);
    };
    wall('x', z1 - T / 2, x1 - T, x2 + T, n);
    wall('x', z2 + T / 2, x1 - T, x2 + T, s);
    wall('z', x1 - T / 2, z1, z2, w);
    wall('z', x2 + T / 2, z1, z2, e);
    if (!dress) return;
    const clear = (holes, u, y) => !holes.some((o) => u > o.c - o.w / 2 - 0.4 && u < o.c + o.w / 2 + 0.4 && y < floor + (o.y0 || 0) + o.h + 0.5 && y > floor + (o.y0 || 0) - 0.5);
    const faces = [
      ['x', z1 + 0.02, 1, x1, x2, n], ['x', z2 - 0.02, -1, x1, x2, s],
      ['z', x1 + 0.02, 1, z1, z2, w], ['z', x2 - 0.02, -1, z1, z2, e],
    ];
    for (const [axis, c, dir, a1, a2, holes] of faces) {
      const at = (u, y, d = 0) => (axis === 'x' ? [u, y, c + dir * d] : [c + dir * d, y, u]);
      // the glyph frieze: a band of carved panels, broken at the openings
      for (let u = a1 + 0.5; u < a2 - 0.5; u += 2) {
        if (!clear(holes, u + 1, floor + glyphY)) continue;
        const [px, py, pz] = at(u + 1, floor + glyphY, 0.06);
        K.put(mats.glyph, axis === 'x' ? boxGeo(1.96, 1.1, 0.12, 0.9) : boxGeo(0.12, 1.1, 1.96, 0.9), px, py, pz);
        if (rand() < 0.35) {
          const [jx, jy, jz] = at(u + 1, floor + glyphY + 0.75, 0.1);
          K.put(mats.jade, axis === 'x' ? boxGeo(0.3, 0.3, 0.06, 0.5) : boxGeo(0.06, 0.3, 0.3, 0.5), jx, jy, jz);
        }
      }
      // pilasters with a stepped cap
      for (let u = a1 + pilasters / 2; u < a2 - 0.5; u += pilasters) {
        if (!clear(holes, u, floor + 1)) continue;
        const [px, , pz] = at(u, 0, 0.3);
        K.put(mats.granite, axis === 'x' ? boxGeo(0.8, ceil - floor, 0.6, 0.35) : boxGeo(0.6, ceil - floor, 0.8, 0.35), px, (floor + ceil) / 2, pz);
        const [qx, , qz] = at(u, 0, 0.45);
        K.put(mats.granite, axis === 'x' ? boxGeo(1.1, 0.4, 0.9, 0.35) : boxGeo(0.9, 0.4, 1.1, 0.35), qx, floor + 0.2, qz);
        K.put(mats.granite, axis === 'x' ? boxGeo(1.1, 0.4, 0.9, 0.35) : boxGeo(0.9, 0.4, 1.1, 0.35), qx, ceil - 0.2, qz);
      }
      // moss creeping up from the damp floor, ivy and roots down from the top
      for (let u = a1; u < a2 - 0.4; u += R(1, 3)) {
        if (!clear(holes, u, floor + 0.3)) continue;
        const [mx, , mz] = at(u, 0, 0.05);
        K.put(mats.moss, axis === 'x' ? boxGeo(R(0.6, 2), R(0.2, 0.9), 0.08, 0.5) : boxGeo(0.08, R(0.2, 0.9), R(0.6, 2), 0.5), mx, floor + 0.3, mz);
      }
      for (let u = a1 + 0.5; u < a2 - 0.5; u += R(1.5, 4)) {
        const len = R(1, Math.min(6, (ceil - floor) * 0.6));
        if (!clear(holes, u, ceil - len)) continue;
        const [vx, , vz] = at(u, 0, 0.12);
        if (rand() < 0.6) F.vineStrand(vx, ceil, vz, len, 0.14);
        else K.limb([[vx, ceil + 0.3, vz], at(u + R(-0.5, 0.5), ceil - len * 0.5, 0.25), at(u + R(-0.8, 0.8), ceil - len, 0.1)].map((p) => p), R(0.08, 0.16), 0.04, mats.bark, 5);
      }
    }
  }
  const puddle = (x, y, z, r) => K.put(mats.glass, new THREE.CircleGeometry(r, 10).scale(1, R(0.6, 1), 1).rotateX(-PI / 2), x, y + 0.02, z);
  // an algae lamp: a glowing slit set in the wall, a little glass vial of algae under a stone hood
  const lamp = (x, y, z, axis) => {
    K.put(mats.algae, axis === 'x' ? boxGeo(0.24, 0.8, 0.12, 0.5) : boxGeo(0.12, 0.8, 0.24, 0.5), x, y, z);
    K.put(mats.granite, axis === 'x' ? boxGeo(0.6, 0.18, 0.4, 0.5) : boxGeo(0.4, 0.18, 0.6, 0.5), x, y + 0.5, z);
  };

  // ================================================================ THE CISTERN (under the island)
  const C = { x1: -57, x2: -43, z1: -305, z2: -291, floor: -12, water: -8, top: -2 };
  const H = trap.hole;
  hall({ x1: C.x1, x2: C.x2, z1: C.z1, z2: C.z2, floor: C.floor, ceil: C.top, n: [{ c: -50, w: 3, y0: 4.6, h: 3.2 }], glyphY: 6.8, ceiling: false, pilasters: 3.5 });
  // the roof, holed for the shaft from the island
  slab(mats.granite, C.x1 - T, C.top, C.z1 - T, C.x2 + T, C.top + 1, H.z1 - 0.5);
  slab(mats.granite, C.x1 - T, C.top, H.z2 + 0.5, C.x2 + T, C.top + 1, C.z2 + T);
  slab(mats.granite, C.x1 - T, C.top, H.z1 - 0.5, H.x1 - 0.5, C.top + 1, H.z2 + 0.5);
  slab(mats.granite, H.x2 + 0.5, C.top, H.z1 - 0.5, C.x2 + T, C.top + 1, H.z2 + 0.5);
  // the north ledge (0.6 m over the water: swim to it and climb out) and the water
  slab(mats.granite, C.x1, C.floor, C.z1, C.x2, C.water + 0.6, C.z1 + 3.2);
  K.put(mats.glyph, boxGeo(14, 0.3, 0.2, 0.5), -50, C.water + 0.45, C.z1 + 3.25);
  B.water([C.x1, C.floor, C.z1 + 3.2], [C.x2, C.water, C.z2], { surface: false });
  K.put(mats.swampDeep, new THREE.PlaneGeometry(C.x2 - C.x1, C.z2 - C.z1 - 3.2, 6, 5).rotateX(-PI / 2), -50, C.water, (C.z1 + 3.2 + C.z2) / 2);
  for (let i = 0; i < 5; i++) K.limb([[R(C.x1, C.x2), C.top + 0.5, R(-300, -292)], [R(C.x1, C.x2), C.top - 2, R(-300, -292)], [R(C.x1, C.x2), C.water - 0.5, R(-300, -292)]], 0.25, 0.08, mats.bark, 6);
  lamp(-55.5, C.water + 2.4, C.z1 + 0.05, 'x');
  lamp(-44.5, C.water + 2.4, C.z1 + 0.05, 'x');
  B.light(-50, -5, -301, 0x6dffb0, 6, 14);
  F.drips([[-50, -2, -297, -8, 1.6, 30], [-55, -2.2, -293, -8, 0.4, 8], [-45, -2.2, -294, -8, 0.4, 8]], { near: 25 });
  F.shaft(-50, -2.5, -297, 6, 2.6, 0.02);
  const cisternCp = cp([-50, C.water + 0.6, -303.5], NORTH, [6, 3, 3]);
  mood([C.x1, C.water - 3, C.z1], [C.x2, C.top, C.z2], 'music_ruin');
  // the doorway north into the glyph stair
  // ================================================================ THE GLYPH STAIR (x -52..-48, z -306 → -318)
  {
    const y0 = C.water + 0.6; // -7.4
    hall({ x1: -52, x2: -48, z1: -317, z2: -306, floor: HALL.floor, ceil: HALL.floor + 4.4, s: [{ c: -50, w: 3, y0: 0.6, h: 3.2 }], n: [{ c: -50, w: 4, y0: 0, h: 4.4 }], glyphY: 2.8, pilasters: 3 });
    // steps down from the cistern's doorway level (-7.4) to the hall floor (-8)
    slab(mats.granite, -52, HALL.floor, -308, -48, y0, -306);
    slab(mats.granite, -52, HALL.floor, -309, -48, HALL.floor + 0.3, -308);
    for (const z of [-308.5, -311.5, -314.5]) {
      lamp(-51.92, HALL.floor + 2, z, 'z');
      lamp(-48.08, HALL.floor + 2, z, 'z');
    }
    puddle(-49.5, HALL.floor, -312, 0.7);
    say([-52, HALL.floor, -309], [-48, HALL.floor + 3, -306], 'Carved granite — and squared glyphs like <b>circuit diagrams</b>. A green glow ahead, and a hum.', 5);
  }

  // ================================================================ THE REACTOR HALL
  const Hh = HALL;
  hall({ x1: Hh.x1, x2: Hh.x2, z1: Hh.z1, z2: Hh.z2, floor: Hh.floor, ceil: Hh.ceil, s: [{ c: -50, w: 4, y0: 0, h: 4.4 }], n: [{ c: -50, w: 4, y0: Hh.gallery - Hh.floor, h: 4 }], glyphY: 3.2, pilasters: 5 });
  mood([-52, Hh.floor, -320], [-48, Hh.floor + 4, -317], 'music_ruin');
  W.trigger([Hh.x1, Hh.floor, Hh.z1], [Hh.x2, Hh.floor + 3, -321], () => game.hud.zoneTitle('THE BUILDERS\' ENGINE', 'THE ALGAE REACTORS', '#7dff9a', 2.6));
  // the reactors: two rows of three, the west row's lids decked over as a catwalk (one ladder up)
  const tankH = 10, tanks = [];
  for (const [x, z, i] of [[-61, -325, 0], [-61, -331, 1], [-61, -337, 2], [-39, -325, 3], [-39, -331, 4], [-39, -337, 5]]) {
    const west = x < -50;
    tanks.push(K.reactorTank([x, Hh.floor, z], tankH, { r: 1.8, ladder: i === 0, ladderYaw: EAST, cap: !west }));
    if (west) {
      // a flat grated lid you can walk on
      slab(mats.grate, x - 2.2, Hh.floor + tankH - 0.15, z - 2.2, x + 2.2, Hh.floor + tankH, z + 2.2, true, 'metal');
      K.put(mats.pipeDark, new THREE.CylinderGeometry(2.1, 2.1, 0.3, 16), x, Hh.floor + tankH - 0.3, z);
    }
    // feed pipes from each reactor up to the ceiling manifold, and down into the floor
    K.pipe([[x, Hh.floor + tankH + (west ? 0 : 0.6), z], [x + (west ? -2 : 2), Hh.floor + tankH + 2.5, z], [x + (west ? -6 : 6), Hh.floor + tankH + 4, z], [x + (west ? -8.4 : 8.4), Hh.floor + tankH + 4.5, z]], { r: 0.3, moss: true, flanges: true });
  }
  K.catwalk([[-61, -322.6], [-61, -340.9]], Hh.floor + tankH, { w: 2, rails: false, solid: true });
  // the manifold: two great conduits along the side walls, and the conduits that run to the sanctum door
  K.pipe([[-69.4, Hh.floor + tankH + 4.5, -320], [-69.4, Hh.floor + tankH + 4.5, -343]], { r: 0.6, moss: true });
  K.pipe([[-30.6, Hh.floor + tankH + 4.5, -320], [-30.6, Hh.floor + tankH + 4.5, -343]], { r: 0.6, moss: true });
  const conduitL = K.pipe([[-69.4, Hh.floor + tankH + 4.5, -343], [-60, Hh.gallery + 5.5, -343.6], [-52.6, Hh.gallery + 4.5, -343.6]], { r: 0.35, moss: false, flanges: true });
  const conduitR = K.pipe([[-30.6, Hh.floor + tankH + 4.5, -343], [-40, Hh.gallery + 5.5, -343.6], [-47.4, Hh.gallery + 4.5, -343.6]], { r: 0.35, moss: false, flanges: true });
  // the floor: worn paving, drains, puddles, a terminal-like carved console, roots up through the tiles
  for (let i = 0; i < 9; i++) puddle(R(-57, -43), Hh.floor, R(-342, -320), R(0.4, 1.1));
  for (const [x, z] of [[-55, -327], [-45, -340], [-66, -341]]) {
    for (let k = 0; k < 3; k++) K.limb([[x + R(-0.5, 0.5), Hh.floor - 0.4, z + R(-0.5, 0.5)], [x + R(-1, 1), Hh.floor + R(0.6, 1.2), z + R(-1, 1)], [x + R(-1.6, 1.6), Hh.floor + 0.05, z + R(-1.6, 1.6)]], 0.18, 0.06, mats.bark, 5);
  }
  // THE NORTH GALLERY (y 6) and the sanctum door
  slab(mats.granite, Hh.x1, Hh.gallery - 1, Hh.z1, -63, Hh.gallery, Hh.z1 + 3.6);
  slab(mats.granite, -59, Hh.gallery - 1, Hh.z1, Hh.x2, Hh.gallery, Hh.z1 + 3.6); // (a hole at x -63..-59 for the riser)
  K.put(mats.glyph, boxGeo(Hh.x2 - Hh.x1, 0.6, 0.2, 0.6), (Hh.x1 + Hh.x2) / 2, Hh.gallery - 0.5, Hh.z1 + 3.7);
  for (let x = Hh.x1 + 2; x < Hh.x2 - 1; x += 3) slab(mats.granite, x - 0.25, Hh.gallery, Hh.z1 + 3.3, x + 0.25, Hh.gallery + 0.9, Hh.z1 + 3.6); // a low balustrade
  W.addSolid(new THREE.Vector3(Hh.x1, Hh.gallery, Hh.z1 + 3.3), new THREE.Vector3(Hh.x2, Hh.gallery + 1.0, Hh.z1 + 3.6), { noShot: true });
  // ... but open over the riser and the catwalk end at its west end
  // (the riser lands you on the gallery from below at x -61)
  const door = stoneDoor([-52, Hh.gallery, Hh.z1 - 0.6], [-48, Hh.gallery + 4, Hh.z1 + 0.4]);
  // the two conduit locks: red on the gallery's west end wall, yellow floating over the east reactor's lid
  const locks = { red: false, yellow: false };
  const lockGlow = (on, x, y, z) => {
    W.fx.burst(new THREE.Vector3(x, y, z), 0x7dff9a, { count: 30, speed: 5, life: 0.7, size: 0.2, gravity: 2 });
    audio.sample(audio.sfxOr('energy_surge_stone', 'charge_up'), { gain: 0.9, vary: 0 });
  };
  const checkLocks = () => {
    if (!locks.red || !locks.yellow || door.state !== 'shut') return;
    setTimeout(() => {
      door.open();
      surge = 1;
      game.hud.message('The conduits wake: algae light runs along them into the door, and it grinds open. <b>The sanctum.</b>', 6);
    }, 700);
  };
  const lockR = new ColorSwitch(W, { pos: [-69.95, Hh.gallery + 2, Hh.z1 + 1.8], face: '+x', color: RED, mode: 'once', style: 'panel', size: 1.2, zone: 'green', light: false, onOn: () => ((locks.red = true), lockGlow(1, -69.5, Hh.gallery + 2, Hh.z1 + 1.8), checkLocks()) });
  const lockY = new ColorSwitch(W, { pos: [-39, Hh.floor + tankH + 2.6, -331], color: YELLOW, mode: 'once', style: 'orb', size: 1.3, zone: 'green', light: false, onOn: () => ((locks.yellow = true), lockGlow(1, -39, Hh.floor + tankH + 2.6, -331), checkLocks()) });
  // the red riser at the catwalk's north end: up to the gallery
  const riser = B.riser({ min: [-62.4, Hh.floor + tankH - 0.6, -343.9], max: [-59.6, Hh.floor + tankH, -341.1], rise: Hh.gallery - (Hh.floor + tankH) + 0.05, color: RED, kick: 1.5, back: 1.2, zone: 'green' });
  slab(mats.granite, -63, Hh.floor, -344, -59, Hh.floor + tankH - 0.6, -340.6); // (its plinth)
  say([-62.5, Hh.floor + tankH, -341], [-59.5, Hh.floor + tankH + 3, -338], `A ${R_('red')} lifting block. Stand on it and <b>keep firing ${R_('red')} into it</b> to ride it up to the gallery.`, 6);
  say([-63, Hh.floor, -327], [-58, Hh.floor + 3, -322], 'A ladder up the first reactor. <b>Space</b> (or W facing it) to climb.', 5);
  W.trigger([-70, Hh.gallery, Hh.z1], [-56, Hh.gallery + 3, Hh.z1 + 3.6], () => !locks.red && game.hud.message(`Two dead conduit locks feed the door: the ${R_('red')} one here on the wall, a ${Y_('yellow')} one hanging over the far reactor.`, 6));
  // a spider bot keeps house up on the east reactors (red and yellow)
  B.spiderBot([-39, Hh.floor + tankH + 0.6, -337], { color: YELLOW, shields: [RED], leash: 10, range: 24 });
  B.armor([-66, Hh.floor, -341]);
  cp([-50, Hh.floor, -321.5], NORTH, [5, 3, 3]);
  cp([-61, Hh.floor + tankH, -339], NORTH, [3, 3, 3]);
  B.light(-50, Hh.floor + 10, -331, 0x8affb0, 30, 32);
  F.motes([Hh.x1, Hh.floor + 0.5, Hh.z1, Hh.x2, Hh.ceil - 2, Hh.z2], 120, { color: 0x5a9a6a, size: 0.05, speed: 0.15, opacity: 0.6 });
  F.drips([[-46, Hh.ceil, -329, Hh.floor, 0.4, 10], [-57, Hh.ceil, -335, Hh.floor, 0.4, 10]], { near: 30 });
  // the algae surge when the door opens: the reactors glow brighter for a while
  let surge = 0;
  const algaeBase = mats.algae.uniforms.uColor.value.clone();
  W.add({
    update(dt) {
      if (surge <= 0) return;
      surge = Math.max(0, surge - dt * 0.25);
      mats.algae.uniforms.uColor.value.copy(algaeBase).multiplyScalar(1 + surge * 0.8);
    },
  });

  // ================================================================ THE SANCTUM PASSAGE (z -344 → -352)
  hall({ x1: -52, x2: -48, z1: -351, z2: -345, floor: Hh.gallery, ceil: Hh.gallery + 4.4, s: [{ c: -50, w: 4, h: 4.4 }], n: [{ c: -50, w: 4, h: 4.4 }], glyphY: 2.6, pilasters: 2.5 });
  slab(mats.granite, -52, Hh.gallery - 1, -345, -48, Hh.gallery, -344);
  lamp(-51.92, Hh.gallery + 2, -348.5, 'z');
  lamp(-48.08, Hh.gallery + 2, -348.5, 'z');

  // ================================================================ THE INNER SANCTUM
  const S = SANCTUM;
  hall({ x1: S.x1, x2: S.x2, z1: S.z1, z2: S.z2, floor: S.floor, ceil: S.ceil, s: [{ c: -50, w: 4, h: 4.4 }], e: [{ c: S.cz, w: 4.6, y0: S.top - S.floor, h: 5.2 }], w: [{ c: S.cz, w: 5, y0: S.top - S.floor, h: 5.4 }], glyphY: 4, pilasters: 6.5 });
  mood([-52, S.floor, -354], [-48, S.floor + 4, -351], 'music_ruin');
  W.trigger([-60, S.floor, -360], [-40, S.floor + 5, -353], () => !game.blaster.unlocked[GREEN] && game.hud.zoneTitle('THE SEED OF THE HOLLOW', 'THE INNER SANCTUM', '#3dff7a', 3));
  // the pyramid: four stepped tiers, a stair up its south face, an altar at the top
  const tiers = [[26, S.floor], [20, S.floor + 4.4], [14, S.floor + 8.8], [8, S.floor + 13.2]];
  for (const [w, y] of tiers) {
    slab(mats.granite, S.cx - w / 2, y, S.cz - w / 2, S.cx + w / 2, y + 4.4, S.cz + w / 2);
    K.put(mats.glyph, boxGeo(w + 0.1, 0.9, w + 0.1, 0.6), S.cx, y + 3.6, S.cz);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.put(mats.jade, boxGeo(0.5, 0.5, 0.5, 0.5), S.cx + dx * (w / 2 + 0.05), y + 3.6, S.cz + dz * (w / 2 + 0.05));
    for (let i = 0; i < w * 1.4; i++) {
      const a = R(0, 4), u = R(-w / 2, w / 2), side = Math.floor(a);
      const [mx, mz] = side === 0 ? [u, -w / 2] : side === 1 ? [w / 2, u] : side === 2 ? [u, w / 2] : [-w / 2, u];
      K.put(mats.moss, boxGeo(R(0.5, 1.6), R(0.1, 0.5), R(0.5, 1.6), 0.5), S.cx + mx, y + 4.42, S.cz + mz);
    }
  }
  // the grand stair: 44 steps of 0.4 m up the south face, from the floor 22 m out to the top
  const top = S.top;
  for (let i = 0; i < 44; i++) {
    const y = S.floor + 0.4 * (i + 1), z2 = S.cz + 4 + 22 - i * 0.5, z1 = z2 - 0.5;
    slab(i % 4 === 3 ? mats.glyph : mats.granite, S.cx - 2.5, S.floor, z1, S.cx + 2.5, y, z2);
  }
  for (const s of [-1, 1]) {
    // balustrades: stepped serpent ramps down each side of the stair
    for (let i = 0; i < 11; i++) slab(mats.granite, S.cx + s * 2.5 - (s > 0 ? 0 : 0.7), S.floor, S.cz + 4 + 22 - i * 2 - 2, S.cx + s * 2.5 + (s > 0 ? 0.7 : 0), S.floor + 1.6 * (i + 1) + 0.6, S.cz + 4 + 22 - i * 2);
    K.put(mats.jade, new THREE.SphereGeometry(0.45, 10, 8), S.cx + s * 2.85, S.floor + 1.6, S.cz + 26.3);
  }
  // the altar under the core: a squat stone table, conduits from the cradle's roots feeding it
  slab(mats.glyph, S.cx - 1.1, top, S.cz - 1.1, S.cx + 1.1, top + 0.8, S.cz + 1.1);
  K.put(mats.jade, new THREE.CylinderGeometry(0.8, 0.8, 0.08, 20), S.cx, top + 0.84, S.cz);
  // the cradle: the shrine's spider of roots, colossal (scale 3), its grip holding the core over the altar
  const coreY = top + 1.9;
  const cradle = K.rootCradle([S.cx, S.floor, S.cz], 3, { knotY: coreY + 2.6 * 3, legs: 4, conduits: true });
  // feed conduits up the cradle's feet into the floor, out to the walls (the reactors feed it)
  for (const [x, z] of [[-74, -366], [-26, -394], [-74, -394], [-26, -366]]) K.pipe([[x, S.floor + 0.4, z], [x + (S.cx - x) * 0.25, S.floor + 0.4, z + (S.cz - z) * 0.25], [x + (S.cx - x) * 0.5, S.floor + 0.6, z + (S.cz - z) * 0.5]], { r: 0.4, moss: true });
  // the core in the cradle's grip
  const core = new Pickup(W, { pos: [S.cx, coreY, S.cz], type: 'color', color: GREEN, onCollect: (pk) => takeCore(pk) });
  // the room: the vents the slimes come out of, the algae pools at the pyramid's foot, light shafts from the roof
  const vents = [[-75.4, 14, -366, [8, 6, 0]], [-75.4, 14, -394, [8, 6, 0]], [-24.6, 14, -366, [-8, 6, 0]], [-24.6, 14, -394, [-8, 6, 0]], [-62, 14, -407.4, [0, 6, 8]], [-38, 14, -407.4, [0, 6, 8]]];
  for (const [x, y, z] of vents) {
    const alongZ = Math.abs(x - S.x1) < 1 || Math.abs(x - S.x2) < 1;
    K.put(mats.pipeDark, alongZ ? boxGeo(0.4, 2.2, 2.2, 0.5) : boxGeo(2.2, 2.2, 0.4, 0.5), x, y, z);
    K.put(mats.algae, alongZ ? boxGeo(0.45, 1.6, 1.6, 0.5) : boxGeo(1.6, 1.6, 0.45, 0.5), x, y, z);
    for (let k = 0; k < 4; k++) K.put(mats.pipeDark, alongZ ? boxGeo(0.5, 0.12, 1.8, 0.5) : boxGeo(1.8, 0.12, 0.5, 0.5), x, y - 0.6 + k * 0.4, z);
  }
  const pools = [[-66, -374], [-34, -386], [-62, -398], [-38, -362]];
  for (const [x, z] of pools) {
    K.put(mats.algae, new THREE.CircleGeometry(2.2, 18).rotateX(-PI / 2), x, S.floor + 0.04, z);
    K.put(mats.granite, new THREE.TorusGeometry(2.3, 0.25, 5, 18).rotateX(PI / 2), x, S.floor + 0.1, z);
  }
  // (log 08) by the pool right of the stair: roots out of the water have grown through two bodies, not old ones
  {
    const bone = new THREE.MeshStandardMaterial({ color: 0xcfc6a8, roughness: 0.8, flatShading: true });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.9, flatShading: true });
    for (const [x, z, yaw] of [[-37.6, -359.4, 0.5], [-40.2, -358.4, 2.2]]) {
      const c = Math.cos(yaw), s = Math.sin(yaw), at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
      const [sx, sz] = at(0, -0.55);
      K.put(bone, new THREE.IcosahedronGeometry(0.13, 1), sx, S.floor + 0.42, sz);
      for (let i = 0; i < 4; i++) {
        const [rx, rz] = at(0, -0.25 + i * 0.09);
        K.put(bone, new THREE.TorusGeometry(0.14 - i * 0.012, 0.018, 4, 10, PI).rotateY(yaw), rx, S.floor + 0.18, rz);
      }
      const [jx, jz] = at(0.1, -0.1);
      K.put(cloth, boxGeo(0.55, 0.06, 0.7, 0.5).rotateY(yaw + 0.3).rotateX(0.15), jx, S.floor + 0.12, jz);
      const [tx, tz] = at(0.3, 0.55);
      K.put(cloth, boxGeo(0.12, 0.12, 0.3, 0.5).rotateY(yaw), tx, S.floor + 0.08, tz); // a trainer, laces still done up
      for (let i = 0; i < 4; i++) K.limb([[-38 + R(-1.5, 1.5), S.floor - 0.2, -362 + R(-1, 1)], [x + R(-0.3, 0.3), S.floor + R(0.3, 0.6), z + R(-0.3, 0.3)], [x + R(-1.5, 1.5), S.floor - 0.1, z + R(-1.5, 1.5)]], R(0.12, 0.2), 0.05, mats.bark, 5);
    }
  }
  for (const [x, z, w] of [[-50, -380, 4], [-62, -366, 2.4], [-38, -396, 2.4]]) F.shaft(x, S.ceil - 0.5, z, S.ceil - S.floor - 1, w, 0.04);
  B.light(S.cx, top + 6, S.cz, 0x7dffa0, 30, 40);
  B.light(S.cx, S.floor + 6, S.cz + 20, 0xc8ffd0, 14, 26);
  F.motes([S.x1, S.floor + 1, S.z1, S.x2, S.ceil - 4, S.z2], 260, { color: 0x7aaa6a, size: 0.07, speed: 0.12, opacity: 0.6 });
  F.fireflies([[S.cx, top + 2, S.cz, 5, 30], [-62, S.floor + 2, -366, 4, 12], [-38, S.floor + 2, -396, 4, 12]], 0x9dffb0, 0.1);
  say([-52, S.floor, -360], [-48, S.floor + 4, -353], `There: held in the cradle's grip over the pyramid, a ${G_('chroma core')}. Up the stair.`, 6);
  cp([-50, S.floor, -357], NORTH, [4, 3, 3]);
  B.armor([-71, S.floor, -403]);
  // SECRET — the Builders' Archive: a ledge high on the north wall, reached by a bloom pad in the floor below it
  // (goo it, stand on it, and it throws you up)
  slab(mats.granite, -62, top - 7.6, S.z1, -56, top - 6.6, S.z1 + 3.4);
  K.put(mats.glyph, boxGeo(6, 0.5, 0.2, 0.6), -59, top - 7.3, S.z1 + 3.45);
  for (let i = 0; i < 6; i++) K.put(mats.jade, boxGeo(0.4, 0.6, 0.12, 0.5), -61.4 + i * 0.95, top - 5.2, S.z1 + 0.08);
  B.trophy(-59, top - 5.6, S.z1 + 1.4);
  B.secretRoom([-62, top - 6.6, S.z1], [-56, top - 3.6, S.z1 + 3.4], "The Builders' Archive");
  new GooPad(W, { pos: [-59, S.floor, S.z1 + 8.5], power: 24, push: [0, 0, -3.4] });
  for (let i = 0; i < 4; i++) K.put(mats.sap, boxGeo(0.12, 0.04, 0.6, 0.5), -59, S.floor + 0.02, S.z1 + 6 - i * 0.9); // a faint trail to the pad
  B.armor([-29, S.floor, -357]);

  // ---------------------------------------------------------------- taking the core: the Seed's guard wakes
  let guardDue = false;
  function takeCore(pk) {
    guardDue = true;
    game.unlockColor(GREEN, pk.pos);
  }
  const vent = (i, color, core, extra = {}) => {
    const [x, y, z, v] = vents[i];
    return { type: 'slime', from: 'vent', pos: [x + v[0] * 0.08, y, z + v[2] * 0.08], vel: v, color, core, ...extra };
  };
  const pool = (i, color, core, extra = {}) => {
    const [x, z] = pools[i];
    return { type: 'slime', from: 'vent', pos: [x, S.floor + 0.2, z], vel: [(S.cx - x) * 0.25, 9, (S.cz - z) * 0.25], color, core, ...extra };
  };
  const guard = new SwampAmbush(W, game, {
    trigger: [[S.x1 + 2, S.ceil - 2, S.z1 + 2], [S.x1 + 3, S.ceil - 1.5, S.z1 + 3]], // (started by taking the core, not by walking in)
    seals: [
      { min: [-52, S.floor, -352.6], max: [-48, S.floor + 4.4, -351.8] },
      { min: [S.x2 - 0.5, top, S.cz - 2.3], max: [S.x2 + 0.6, top + 5.2, S.cz + 2.3], closed: true },
    ],
    title: 'THE SEED\'S GUARD', sub: 'TRY THE GLOB LAUNCHER', color: '#3dff7a', music: 'music_combat', zone: 'green', resume: true, startDelay: 1.6,
    checkpoint: { pos: [S.cx + 3, top, S.cz], yaw: EAST },
    waves: [
      { title: 'OUT OF THE VENTS', enemies: [
        vent(0, GREEN, RED, { delay: 0 }), vent(2, GREEN, YELLOW, { delay: 0.5 }), vent(4, GREEN, RED, { delay: 1 }), vent(1, GREEN, YELLOW, { delay: 1.6, size: 0.85 }), vent(3, GREEN, RED, { delay: 2.2, size: 0.85 }),
      ] },
      { title: 'OUT OF THE POOLS', enemies: [
        pool(0, GREEN, YELLOW, { delay: 0 }), pool(1, GREEN, RED, { delay: 0.4 }), pool(2, GREEN, RED, { delay: 0.8 }), pool(3, GREEN, YELLOW, { delay: 1.2 }),
        { type: 'spider', from: 'tree', pos: [-60, S.floor, -372], color: GREEN, shields: [YELLOW], ceiling: false, leash: 14, range: 30, delay: 1.8 },
        vent(5, YELLOW, GREEN, { delay: 2.4 }),
      ] },
      { title: 'THE BIG ONES', enemies: [
        pool(0, GREEN, RED, { delay: 0, size: 1.5, slimeHp: 2 }), pool(1, GREEN, YELLOW, { delay: 0.6, size: 1.5, slimeHp: 2 }),
        vent(0, GREEN, YELLOW, { delay: 1.4, size: 0.8 }), vent(2, GREEN, RED, { delay: 1.6, size: 0.8 }), vent(4, RED, GREEN, { delay: 2, size: 0.8 }), vent(5, GREEN, YELLOW, { delay: 2.4, size: 0.8 }),
        { type: 'spider', from: 'tree', pos: [-40, S.floor, -390], color: GREEN, shields: [RED], ceiling: false, leash: 14, range: 30, delay: 2.8 },
      ] },
    ],
    onStart: () => {
      cradle.shudder(1.4);
      quake(2.2);
      setTimeout(() => game.hud.message(`${G_('GLOB LAUNCHER')}: globs arc and <b>burst</b>. One burst blows the goo off a whole clump — then finish the cores. Goo on the floor gums them up.`, 6), 2400);
    },
    onClear: () => {
      escape.arm();
      setTimeout(() => {
        quake(1.6);
        game.hud.message('The temple is coming down! The high door <b>east</b> of the pyramid\'s top is open — <b>run</b>.', 6);
      }, 1800);
    },
  });
  onRespawn(() => guard.reset());
  // the fight starts once the cutscene hands control back (and again on respawning after a death mid-fight)
  W.add({
    update(dt, player) {
      if (guard.state !== 'armed' || game.clearedEncounters?.has(guard.id) || !game.blaster.unlocked[GREEN]) return;
      if (game.isWorldDown?.('verdant')) return guard.restoreCleared();
      if (!guardDue) {
        if (core.active && W.entities.includes(core)) return; // (not taken yet)
        guardDue = true; // (a save, or a practice start, that already has green: the guard still owes the fight)
      }
      const p = player.pos;
      if (game.state === 'playing' && p.x > S.x1 && p.x < S.x2 && p.z > S.z1 && p.z < S.z2 && p.y > S.floor - 0.5) guard.start();
    },
  });
  // dust pouring from the roof, a rumble, the screen shaking
  function quake(k = 1) {
    game.player.shake = Math.max(game.player.shake, 0.4 * k);
    audio.sample(audio.sfxOr('temple_rumble', 'root_rumble'), { gain: Math.min(1.2, 0.6 + 0.3 * k), vary: 0.05 });
    for (let i = 0; i < 14 * k; i++) {
      const p = new THREE.Vector3(R(S.x1 + 2, S.x2 - 2), S.ceil - 0.5, R(S.z1 + 2, S.z2 - 2));
      W.fx.burst(p, 0x8a8a6a, { count: 10, speed: 1.5, life: 2.4, size: 0.5, gravity: 4, mode: 'puff' });
      if (rand() < 0.4) W.fx.shard(p, R(-1, 1), -2, R(-1, 1), new THREE.Color(0x5a6058), 2, 0.3, 0.25);
    }
  }

  // ---------------------------------------------------------------- the escape (the boulder) and the bridge
  const escape = buildVerdantEscape(B, { K, F, cradle, quake, guard, sanctum: S, slab, solid, hall, lamp });
  let first = true;
  W.add({
    update(dt, player) {
      // a practice start at the run or the bridge (Select Location): the fight is behind you
      if (first) {
        first = false;
        const p = player.pos;
        if (game.blaster.unlocked[GREEN] && guard.state === 'armed' && ((p.y > top - 1 && p.x > S.cx + 1 && Math.abs(p.z - S.cz) < 3) || p.x > 0)) {
          guard.restoreCleared();
          core.active = false;
          core.group.visible = false;
          if (core.light) core.light.intensity = 0;
          W.remove(core);
          if (p.x > 0) escape.done();
        }
      }
      // a save after the fight (or a practice start beyond it): the run is armed straight away
      if (!escape.armed && guard.state === 'cleared') escape.arm();
    },
  });

  // ================================================================ OBJECTIVES
  function objective(p) {
    const e = escape.objective?.(p);
    if (e) return e;
    if (p.y > -2 && p.z > -301.5) return '';
    if (p.z > -306 && p.y < -2) return p.y < C.water + 0.3 ? 'Swim to the <b>north ledge</b> and climb out.' : 'Through the doorway <b>north</b>.';
    if (p.z > -318 && p.y < 0) return 'Down the glyph stair <b>north</b>, toward the glow.';
    if (p.z > Hh.z1 - 1 && p.z < Hh.z2 && p.x > Hh.x1 && p.x < Hh.x2) {
      if (door.state !== 'shut') return 'Through the open door on the north gallery, into the <b>sanctum</b>.';
      if (p.y < Hh.floor + tankH - 0.5) return `The sanctum door is high on the north gallery. Climb the <b>ladder</b> up the first reactor on the west side.`;
      if (p.y < Hh.gallery - 0.3) return p.z < -340 ? `Stand on the ${R_('red')} block and <b>keep firing</b> into it to rise to the gallery.` : 'Along the reactor lids <b>north</b> to the lifting block.';
      if (!locks.red) return `Shoot the ${R_('red')} conduit lock on the gallery's west wall.`;
      if (!locks.yellow) return `Shoot the ${Y_('yellow')} lock hanging over the far east reactor.`;
      return 'The door is opening.';
    }
    if (p.z < -344 && p.z > -352.5) return 'On into the <b>sanctum</b>.';
    if (p.z <= -352 && p.x > S.x1 && p.x < S.x2 && p.y > S.floor - 1) {
      if (!game.blaster.unlocked[GREEN]) return p.y < top - 0.5 ? `Climb the pyramid's stair to the ${G_('core')} in the cradle's grip.` : `Take the ${G_('VERDANT core')}.`;
      if (guard.state !== 'armed' && guard.state !== 'cleared') return `Fight off the Seed's guard: ${G_('globs')} burst whole clumps of slime.`;
    }
    return '';
  }

  // ================================================================ STARTS
  devStart('verdant8', [-50, C.water + 0.6, -303.5], NORTH, RY, 'The ruin: the cistern under the island');
  devStart('verdant9', [-50, Hh.floor, -321.5], NORTH, RY, 'The algae reactors (log 07b)');
  devStart('verdant10', [-50, S.floor, -357], NORTH, RY, 'The inner sanctum (the green core)');

  // (the ruin's dressing is drawn only once you're out of the swamp)
  F.groupVisible(K.flush(), (p) => !(p.y > -2 && p.z > -301.5));

  return { objective, onFall: () => cisternCp, door, locks, guard, core, cradle, escape, riser, tanks };

  // ---------------------------------------------------------------- a granite door that grinds down into the floor
  function stoneDoor(min, max) {
    const size = new THREE.Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const g = new THREE.Group();
    const m = new THREE.Mesh(boxGeo(size.x, size.y, size.z, 0.5), mats.glyph);
    const seam = new THREE.Mesh(boxGeo(0.1, size.y * 0.9, size.z + 0.04, 0.5), mats.sap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 6, 20), mats.jade);
    ring.position.z = size.z / 2 + 0.03;
    g.add(m, seam, ring);
    g.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    W.scene.add(g);
    const sol = W.addSolid(new THREE.Vector3(...min), new THREE.Vector3(...max), { kind: 'stone' });
    const d = { state: 'shut', k: 0 };
    d.open = () => {
      if (d.state !== 'shut') return;
      d.state = 'opening';
      audio.sample(audio.sfxOr('stone_grind', 'temple_rumble'), { gain: 1, vary: 0 });
      game.player.shake = Math.max(game.player.shake, 0.25);
    };
    W.add({
      update(dt) {
        if (d.state !== 'opening') return;
        d.k = Math.min(1, d.k + dt / 2.6);
        g.position.y = (min[1] + max[1]) / 2 - size.y * d.k;
        if (Math.random() < dt * 30) W.fx.edgeDust?.(min[0], max[0], min[1] + 0.05, min[2], max[2]);
        if (d.k > 0.7) sol.enabled = false;
        if (d.k >= 1) {
          d.state = 'open';
          g.visible = false;
        }
      },
    });
    // a save beyond the door (the fight in the sanctum done, or the core taken): it's already open
    W.add({
      update() {
        if (d.state === 'shut' && (game.blaster.unlocked[GREEN] || game.clearedEncounters?.has('verdant:door'))) {
          d.state = 'open';
          sol.enabled = false;
          g.visible = false;
        }
        if (d.state !== 'shut') game.clearedEncounters?.add('verdant:door');
      },
    });
    return d;
  }
}

// THE CELL BLOCK — where the game starts: a holding block off the Crimson Foundry's spawn room (through a
// door in its east wall at z -3.8). Five cells in a row along the south side of a narrow hall
// (x 6.5 → 22, z 0 → -5, y 0 → 3.4) and four more facing them across it (06 → 09, z -5 → -7.8; the far
// end of the north wall, opposite your cell, is left bare for the eye); the player wakes in the last
// south cell, 05, behind a red field.
// A few seconds in (sooner if you look around) the field sputters, sparks and dies: a power flicker from
// the Atrium (Dr. Wren Ashby has clipped a probe onto a reactor conduit there, unaware of what it reaches
// down here) is enough to short its worn emitter. The other cells still hold their prisoners' bones behind the
// Lumen's own violet fields, which nothing you carry can break. A machine eye on the far wall watches.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RED } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { audio } from '../audio.js';

const LUMEN = 0xc9a8ff; // the machine's own light: the fields that still hold
const HALL = { x1: 6.5, x2: 22, zS: -2.6, zN: -5, h: 3.4 };
const CELL_W = 3;
const CELL_X = (k) => 7 + k * CELL_W; // west edge of cell k (0..4)
const FRONT = -2.6; // the line of the cell fields
const FIELD_ALPHA = 0.6;
const NFRONT = -5; // the north row's field line (the hall's old north wall)
const NBACK = -7.3; // and its back wall's inner face (the wall itself runs to -7.8)
export const SPAWN = [20.6, 0, -1.3];

export function buildCellBlock(B) {
  const { W, game, level, light, area, devStart } = B;
  const zone = 'red';
  const box = (x1, y1, z1, x2, y2, z2, kind = 'wall') => W.box(x1, y1, z1, x2, y2, z2, kind, zone);
  const deco = (x1, y1, z1, x2, y2, z2, kind = 'glow0') => W.deco(x1, y1, z1, x2, y2, z2, kind, zone);
  const { x1, x2, zN, h } = HALL;

  // ---------------------------------------------------------------- shell
  box(x1, -1, zN - 0.5, x2 + 0.5, 0, 0.5, 'floor');
  box(x1, h, zN - 0.5, x2 + 0.5, h + 0.5, 0.5, 'ceil');
  // the north row (cells 06 → 09) reaches back to z -7.8 over x 6.5 → 19.15; past it the north wall
  // stays a bare wall for the eye, across from your cell
  const NX2 = CELL_X(4) + 0.15;
  box(x1, -1, NBACK - 0.5, NX2, 0, zN - 0.5, 'floor');
  box(x1, h, NBACK - 0.5, NX2, h + 0.5, zN - 0.5, 'ceil');
  box(x1, 0, NBACK - 0.5, NX2, h, NBACK); // back wall of the north row
  box(x1, 0, NBACK, CELL_X(0) + 0.15, h, NFRONT); // the corner by the door
  box(CELL_X(4) - 0.15, 0, NBACK, NX2, h, NFRONT); // end divider (flush: no stub by your cell's door)
  box(NX2, 0, zN - 0.5, x2 + 0.5, h, zN); // north wall (the eye's)
  box(x1, 0, 0, x2 + 0.5, h, 0.5); // south wall (the Foundry annex lies beyond z 0.5)
  box(x2, 0, zN, x2 + 0.5, h, 0); // east wall
  box(x1, 0, FRONT, CELL_X(0) + 0.15, h, 0); // the corner by the door
  // the doorway from the spawn room (red.js cuts the hole: x 6 → 6.5, z -2.7 → -4.9, 2.8 m high)
  for (const x of [5.9, 6.5]) {
    deco(x, 0, -4.95, x + 0.1, 2.85, -4.85);
    deco(x, 0, -2.75, x + 0.1, 2.85, -2.65);
    deco(x, 2.8, -4.95, x + 0.1, 2.9, -2.65);
  }
  deco(5.95, 2.95, -4.9, 6.0, 3.15, -2.7, 'hazard');
  // a drain channel down the middle of the hall, and grime-dark baseboards
  box(7.5, 0, -3.95, 21.5, 0.01, -3.75, 'grate');
  deco(NX2, 0.02, zN + 0.02, x2, 0.1, zN + 0.08, 'glow0');

  // ---------------------------------------------------------------- the cells
  const fields = [];
  for (let k = 0; k < 5; k++) {
    const a = CELL_X(k) + 0.15, b = CELL_X(k) + CELL_W - (k === 4 ? 0 : 0.15);
    if (k < 4) box(CELL_X(k + 1) - 0.15, 0, FRONT - 0.25, CELL_X(k + 1) + 0.15, h, 0); // divider
    box(a, 2.6, FRONT - 0.25, b, h, FRONT + 0.25, 'metal'); // lintel with the field emitter
    box(a, 0, FRONT - 0.25, b, 0.06, FRONT + 0.25, 'metal'); // sill
    deco(a, 2.55, FRONT - 0.2, b, 2.6, FRONT + 0.2, k === 4 ? 'glow0' : 'trimWhite');
    // cot along the back wall, and a slop bucket in the corner
    box(a + 0.25, 0, -0.9, a + 2.1, 0.42, -0.05, 'metal');
    box(a + 0.3, 0.42, -0.85, a + 2.05, 0.5, -0.1, 'floor');
    box(b - 0.55, 0, -0.5, b - 0.2, 0.38, -0.15, 'metal');
    const min = [a, 0.06, FRONT - 0.1], max = [b, 2.55, FRONT + 0.1];
    fields.push(k === 4 ? new Barrier(W, { min, max, color: RED, kind: 'wall', zone }) : lumenField(W, min, max));
  }
  const myField = fields[4];
  myField.mat.uniforms.uAlpha.value = FIELD_ALPHA; // see-through enough to watch the eye watching you

  // across the hall: 06 → 09, numbered back toward the door. Not a copy of the south row: 07 was
  // purged and its field has all but died (still solid: nothing gets out), 08's emitter is failing and
  // stutters, and each cell has its cot somewhere different (07's is tipped against the wall).
  const north = []; // { k, num, field, lamp }
  const lampOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(LUMEN).multiplyScalar(1.15) });
  const lampOff = new THREE.MeshBasicMaterial({ color: 0x15131c });
  const lampGeo = new THREE.BoxGeometry(0.6, 0.07, 0.1);
  for (let k = 0; k < 4; k++) {
    const num = 9 - k, a = CELL_X(k) + 0.15, b = CELL_X(k + 1) - 0.15;
    const dark = num === 7, faulty = num === 8;
    if (k < 3) box(b, 0, NBACK, b + 0.3, h, NFRONT + 0.25); // divider
    box(a, 2.6, NFRONT - 0.25, b, h, NFRONT + 0.25, 'metal');
    box(a, 0, NFRONT - 0.25, b, 0.06, NFRONT + 0.25, 'metal');
    if (!dark) deco(a, 2.55, NFRONT - 0.2, b, 2.6, NFRONT + 0.2, 'trimWhite');
    if (num === 9) {
      // cot along the back wall, bucket in the west corner
      box(a + 0.6, 0, NBACK + 0.05, a + 2.45, 0.42, NBACK + 0.9, 'metal');
      box(a + 0.65, 0.42, NBACK + 0.1, a + 2.4, 0.5, NBACK + 0.85, 'floor');
      box(a + 0.2, 0, NBACK + 0.15, a + 0.55, 0.38, NBACK + 0.5, 'metal');
    } else if (num === 6) {
      // cot along the east divider (the back wall is the kneeler's), bucket by the field
      box(b - 0.9, 0, NBACK + 0.05, b - 0.05, 0.42, NBACK + 1.9, 'metal');
      box(b - 0.85, 0.42, NBACK + 0.1, b - 0.1, 0.5, NBACK + 1.85, 'floor');
      box(a + 0.15, 0, NFRONT - 0.75, a + 0.5, 0.38, NFRONT - 0.4, 'metal');
    } else if (faulty) {
      // cot along the west divider
      box(a + 0.05, 0, NBACK + 0.05, a + 0.9, 0.42, NBACK + 1.9, 'metal');
      box(a + 0.1, 0.42, NBACK + 0.1, a + 0.85, 0.5, NBACK + 1.85, 'floor');
      box(b - 0.45, 0, NFRONT - 0.75, b - 0.1, 0.38, NFRONT - 0.4, 'metal');
    } else {
      // 07: the cot torn off the wall and stood on end; the bucket on its side
      box(b - 0.5, 0, NBACK + 0.25, b - 0.08, 1.85, NBACK + 1.1, 'metal');
      box(a + 0.7, 0, NFRONT - 0.95, a + 1.1, 0.3, NFRONT - 0.6, 'metal');
    }
    const lamp = new THREE.Mesh(lampGeo, dark ? lampOff : faulty ? lampOn.clone() : lampOn);
    lamp.position.set((a + b) / 2, 2.38, NBACK + 0.06);
    W.scene.add(lamp);
    const field = lumenField(W, [a, 0.06, NFRONT - 0.1], [b, 2.55, NFRONT + 0.1]);
    if (dark) {
      field.mat.uniforms.uColor.value.set(LUMEN).multiplyScalar(0.1);
      field.mat.uniforms.uAlpha.value = 0.22;
      field.frame.color.set(0x2c2440);
    }
    fields.push(field);
    north.push({ k, num, a, b, field, lamp });
  }
  const faulty = north.find((c) => c.num === 8);

  // ---------------------------------------------------------------- the dead
  const bones = new Bones();
  // 01: laid out on the cot as if asleep
  bones.add(POSES.supine, CELL_X(0) + 1.2, 0.5, -0.47, Math.PI);
  // 02: sat against the wall under a wall of tally marks
  bones.add(POSES.sitting, CELL_X(1) + 0.32, 0, -1.4, 0);
  // 03: face down, one hand still reaching for the field
  bones.add(POSES.prone, CELL_X(2) + 1.35, 0, -0.95, -Math.PI / 2);
  // 04: curled up on the cot; a second skull by the bucket
  bones.add(POSES.curled, CELL_X(3) + 1.2, 0.5, -0.5, Math.PI / 2 + 0.2);
  bones.skull(CELL_X(3) + 2.2, 0.09, -0.75, 1.9, 0.4);
  // 06: knelt facing the back wall, forehead to it, under the words
  bones.add(POSES.kneel, CELL_X(3) + 1.0, 0, NBACK + 0.72, Math.PI / 2);
  // 07 (purged): nobody left whole; a heap of loose bones and three skulls swept into the corner
  bones.skull(CELL_X(2) + 0.55, 0.09, NBACK + 0.45, 0.4, 0.2);
  bones.skull(CELL_X(2) + 0.95, 0.09, NBACK + 0.4, 2.6, 0.9);
  bones.skull(CELL_X(2) + 0.7, 0.17, NBACK + 0.75, 4.1, 0.3);
  bones.heap(CELL_X(2) + 0.8, NBACK + 0.6, 14, 0.55, 7);
  bones.heap(CELL_X(2) + 1.9, NBACK + 1.3, 4, 0.45, 3);
  // 08: one asleep on the cot, another sat against the east wall facing it
  bones.add(POSES.supine, CELL_X(1) + 0.62, 0.5, NBACK + 1.05, Math.PI / 2);
  bones.add(POSES.sitting, CELL_X(2) - 0.32, 0, NBACK + 1.45, Math.PI + 0.25);
  // 09: curled up on the floor just inside the field, back to the hall
  bones.add(POSES.curled, CELL_X(0) + 1.6, 0, NFRONT - 0.55, Math.PI);
  const boneMesh = bones.build();
  W.scene.add(boneMesh);

  // scratched into the walls: tally marks in cell 02, a last message in cell 04
  scratches(W, { x: CELL_X(1) + CELL_W - 0.16, y: 1.55, z: -1.25, w: 2.1, h: 1.5, face: -1, tallies: 230 });
  scratches(W, { x: CELL_X(0) + CELL_W - 0.16, y: 1.2, z: -1.6, w: 1.1, h: 0.7, face: -1, tallies: 26 });
  scratches(W, { x: CELL_X(3) + 0.16, y: 1.45, z: -1.35, w: 1.6, h: 1.1, face: 1, tallies: 11, text: ['IT WATCHES', 'IT WAITS'] });
  // and across the hall: 06's words over the kneeling one, 08's long count, 09's riddle on its back wall
  scratches(W, { x: CELL_X(3) + 1.0, y: 1.55, z: NBACK, w: 1.5, h: 0.95, face: 0, tallies: 4, text: ['THE EYE', 'NEVER SLEEPS'] });
  scratches(W, { x: CELL_X(2) - 0.16, y: 1.6, z: NBACK + 1.0, w: 1.6, h: 1.6, face: -1, tallies: 412 });
  scratches(W, { x: CELL_X(0) + 1.9, y: 1.4, z: NBACK, w: 1.5, h: 1.0, face: 0, tallies: 19, text: ['FOUR COLORS', 'ONE DOOR'] });

  // status plates over each cell, in the machine's terse hand
  const plates = [];
  for (let k = 0; k < 5; k++) {
    const p = plate(k === 4 ? ['05', 'DORMANT'] : [`0${k + 1}`, 'EXPIRED'], k === 4 ? '#ff4455' : '#b9a3e6');
    p.mesh.position.set(CELL_X(k) + 1.5, 3.0, FRONT - 0.26);
    p.mesh.rotation.y = Math.PI;
    W.scene.add(p.mesh);
    plates.push(p);
  }
  for (const c of north) {
    const p = plate([`0${c.num}`, c.num === 7 ? 'PURGED' : c.num === 8 ? 'FAULT' : 'EXPIRED'], c.num === 7 ? '#5e5770' : '#b9a3e6');
    p.mesh.position.set(CELL_X(c.k) + 1.5, 3.0, NFRONT + 0.26);
    W.scene.add(p.mesh);
  }

  // ---------------------------------------------------------------- light: three lamps, one dead, one failing
  const lampMats = [0.55, 1, 0].map((k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8d4ff).multiplyScalar(k * 1.6) }));
  [9.5, 14.5, 19.5].forEach((x, i) => {
    box(x - 0.7, h - 0.12, -4.1, x + 0.7, h, -3.6, 'metal');
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.32), lampMats[i]);
    panel.position.set(x, h - 0.135, -3.85);
    W.scene.add(panel);
  });
  const hallLight = light(14.5, h - 0.4, -3.9, 0xc0ccff, 10, 13);
  const cellLight = light(20.6, 1.4, -2.0, 0xff3344, 7, 7);
  area([x1, 0, zN], [x2, h, 0], { ambient: 'amb_foundry', atmosphere: 'cells' });
  // the block keeps the title's haunting track (an override: see Game.setMusic) until you step out into
  // the spawn room, whose area (red.js) asks for music_red and so hands back to the Foundry's mix
  W.trigger([x1, 0, zN], [x2, h, 0], () => game.setMusic(audio.musicOr('music_haunt', 'music_title')), { once: false });
  // the block is dim: the fields, the lamps and the red of your own cell do the lighting
  level.atmospheres.cells = {
    fog: 0x07060c, fogNear: 6, fogFar: 60,
    hemiSky: 0x8a86b0, hemiGround: 0x1a1218, hemiIntensity: 0.32,
    sunColor: 0xc8b8ff, sunIntensity: 0.18, exposure: 1.0, bloom: 0.75,
  };

  // ---------------------------------------------------------------- the eye
  const eye = machineEye(game);
  eye.root.position.set(20.6, 2.5, zN);
  W.scene.add(eye.root);

  // ---------------------------------------------------------------- the escape
  level.spawn.set(...SPAWN);
  level.spawnYaw = 0;
  level.introMessage = ''; // (main.js: no "grab the blaster" nag while you're still locked up)
  const state = (level.cellBlock = { fieldDown: false, escaped: false });
  devStart('cell', SPAWN, 0, []);
  W.trigger([-6, 0, -12], [5.6, 4, 0], () => {
    state.escaped = true;
    if (!game.blaster.has) game.hud.message('Grab the <b>Chroma Blaster</b> from the pedestal.', 5);
  });
  audio.manifest.then(() => audio.prefetch(['cell_malfunction']));

  const sparkAt = (x, y, z, n, big = false, tint = 0xff6a50) => {
    const fx = W.fx;
    const p = new THREE.Vector3(x, y, z);
    fx.sparks(p, n, big ? 0xffd0a0 : tint, { count: big ? 26 : 9, speed: big ? 9 : 6, spread: 1.1, life: big ? 0.6 : 0.4, gravity: 9 });
    if (big) fx.flash(p, 0xff5544, { size: 0.9, life: 0.12, k: 1.6 });
  };
  const sx = [CELL_X(4) + 0.2, CELL_X(4) + CELL_W - 0.05]; // the emitter posts
  const toHall = new THREE.Vector3(0, 0.3, -1), toCell = new THREE.Vector3(0, 0.3, 1), down = new THREE.Vector3(0, -1, 0);
  let t = 0, start = -1, phase = 0, nextSpark = 0, after = 0;
  const yaw0 = level.spawnYaw;

  function idle(dt, tt) {
    // the failing lamp stutters; the hall light follows it (never to 0: see World.updateLights)
    const f = Math.sin(tt * 23) * Math.sin(tt * 7.3) > 0.55 || (tt % 5.3 < 0.18) ? 0.15 : 1;
    lampMats[1].color.set(0xc8d4ff).multiplyScalar(1.6 * f);
    hallLight.intensity = 10 * (0.25 + 0.75 * f);
    eye.update(dt, tt);
    // 08's failing emitter: bursts of stutter, its lamp dropping out with it, a spark now and then
    const fu = faulty.field.mat.uniforms;
    const glitch = Math.sin(tt * 3.1) * Math.sin(tt * 1.27 + 2) > 0.3 || tt % 6.1 < 0.25;
    const out = glitch && Math.random() < 0.55;
    fu.uAlpha.value = out ? Math.random() * 0.18 : glitch ? 0.3 + Math.random() * 0.3 : 0.5;
    fu.uFlash.value = glitch && Math.random() < 0.08 ? 0.6 : 0;
    faulty.field.frame.color.set(LUMEN).multiplyScalar(out ? 0.25 : 1.2);
    faulty.lamp.material.color.set(LUMEN).multiplyScalar(out ? 0.08 : 1.15);
    if (glitch && (faultSpark -= dt) <= 0) {
      faultSpark = 0.6 + Math.random() * 1.4;
      sparkAt(faulty.a + (Math.random() < 0.5 ? 0.05 : faulty.b - faulty.a - 0.05), 2.45, NFRONT, down, false, 0xb98cff);
    }
  }
  let faultSpark = 0;

  function breakField(silent) {
    phase = 3;
    state.fieldDown = true;
    if (silent) {
      myField.broken = true;
      myField.solid.enabled = false;
      myField.group.visible = false;
    } else myField.shatter({ point: new THREE.Vector3(20.6, 1.3, FRONT), dir: toHall });
    cellLight.intensity = 0;
    plates[4].draw(['05', 'VACANT'], '#ff4455');
    eye.alarm = 1;
    if (silent) return;
    game.player.shake = Math.max(game.player.shake, 0.4);
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Vector3(19.4 + Math.random() * 2.4, 0.3 + Math.random() * 2, FRONT);
      W.fx.puff(p, (Math.random() - 0.5) * 0.6, 0.4, -0.4, new THREE.Color(0x553333), 0.3, 1.6, 0.35, 3);
    }
  }

  W.add({
    update(dt, player) {
      t += dt;
      idle(dt, W.time);
      if (phase === 3) {
        // the dead emitter still spits now and then
        if ((after -= dt) <= 0) {
          after = 1.5 + Math.random() * 3;
          sparkAt(sx[Math.random() < 0.5 ? 0 : 1], 2.4 + Math.random() * 0.15, FRONT, down);
        }
        return;
      }
      if (phase === 0) {
        // a save or a dev start put you somewhere else: the field is already long dead
        const inCell = player.pos.x > CELL_X(4) && player.pos.z > FRONT;
        if (game.resumed || !inCell) {
          state.escaped = !inCell;
          if (game.atmo?.name === 'cells' && titleAtmo && !inBlock(player.pos)) game.setAtmosphere(titleAtmo, true);
          return breakField(true);
        }
        // it gives out a few seconds in, or soon after you first look around
        const looked = Math.abs(player.yaw - yaw0) > 0.5 || Math.abs(player.pitch) > 0.45;
        if (start < 0 && (t > 3.2 || (looked && t > 1.2))) start = t + (looked ? 0.5 : 0);
        if (start >= 0 && t >= start) {
          phase = 1;
          start = t;
          audio.sample('cell_malfunction', { gain: 1.2, vary: 0, dry: true });
          plates[4].draw(['05', 'ERROR'], '#ff4455');
          sparkAt(sx[0], 2.45, FRONT, toCell, true);
        }
        return;
      }
      // phase 1: 3.6 s of stutter, worse and worse, then it shorts out
      const k = (t - start) / 3.6;
      const u = myField.mat.uniforms;
      const stutter = Math.random() < 0.25 + k * 0.6;
      u.uAlpha.value = stutter ? Math.random() * (1 - k * 0.6) * FIELD_ALPHA : FIELD_ALPHA;
      u.uFlash.value = stutter && Math.random() < 0.3 ? 0.8 : u.uFlash.value;
      myField.group.children.forEach((c, i) => i && (c.visible = !stutter || Math.random() < 0.5));
      cellLight.intensity = 7 * (stutter ? 0.2 + Math.random() * 0.5 : 1);
      if ((nextSpark -= dt) <= 0) {
        nextSpark = 0.35 - k * 0.25 + Math.random() * 0.2;
        const side = Math.random() < 0.5 ? 0 : 1;
        sparkAt(sx[side], 0.2 + Math.random() * 2.3, FRONT, Math.random() < 0.5 ? toHall : toCell);
        if (Math.random() < 0.4) sparkAt(19.3 + Math.random() * 2.6, 2.55, FRONT, down);
      }
      if (phase === 1 && k > 0.45) {
        phase = 2;
        sparkAt(sx[1], 1.6, FRONT, toCell, true);
        sparkAt(sx[0], 2.3, FRONT, toHall, true);
        player.shake = Math.max(player.shake, 0.25);
      }
      if (k >= 1) breakField(false);
    },
  });

  // the title screen looks in at the dead, down the hall from the door
  let titleAtmo = null; // what the save had set, put back if you don't start in here
  const inBlock = (p) => p.x > x1 && p.x < x2 && p.z > zN && p.z < 0 && p.y > -1 && p.y < h;
  level.titleView = (cam, tt, dt) => {
    if (game.atmo?.name !== 'cells') {
      titleAtmo = game.atmo?.name || 'foundry';
      game.setAtmosphere('cells', true);
    }
    cam.position.set(11.6 + Math.sin(tt * 0.11) * 1.1, 1.55, -4.45);
    cam.rotation.set(-0.16, Math.PI + 0.62 + Math.sin(tt * 0.09) * 0.32, 0, 'YXZ');
    idle(dt, tt);
    for (const f of fields) f.mat.uniforms.uTime.value = tt;
  };
}

// A cell field the blaster can't touch: the Barrier look in the Lumen's violet, immune to every color.
function lumenField(W, min, max) {
  const f = new Barrier(W, { min, max, color: RED, kind: 'wall' });
  f.mat.uniforms.uColor.value.set(LUMEN).multiplyScalar(0.32);
  f.mat.uniforms.uAlpha.value = 0.5;
  const frame = new THREE.MeshBasicMaterial({ color: new THREE.Color(LUMEN).multiplyScalar(1.2) });
  f.group.children.forEach((c) => c !== f.mesh && (c.material = frame));
  f.frame = frame; // (its own: the dead and failing fields across the hall dim theirs)
  f.onHit = () => {
    f.flash = 1;
    return 'immune';
  };
  return f;
}

// A small engraved plate with two lines of text, redrawn when its status changes.
function plate(lines, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  const draw = (l, col) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 96);
    g.fillStyle = 'rgba(14,12,18,0.92)';
    g.fillRect(4, 4, 248, 88);
    g.strokeStyle = col;
    g.globalAlpha = 0.6;
    g.lineWidth = 3;
    g.strokeRect(6, 6, 244, 84);
    g.globalAlpha = 1;
    g.fillStyle = col;
    g.textAlign = 'center';
    g.font = 'bold 40px monospace';
    g.fillText(l[0], 128, 46);
    g.font = '22px monospace';
    g.fillText(l[1].split('').join(' '), 128, 78);
    tex.needsUpdate = true;
  };
  draw(lines, color);
  return { mesh, draw };
}

// Scratches on a wall facing ±x (face ±1), or +z (face 0: a north cell's back wall): groups of tally
// marks, maybe a line or two of words.
function scratches(W, { x, y, z, w, h, face, tallies, text = null }) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * 220);
  c.height = Math.round(h * 220);
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(235,225,210,0.75)';
  g.lineCap = 'round';
  let seed = tallies * 7 + 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gw = 34, gh = 40, cols = Math.floor((c.width - 20) / gw);
  for (let i = 0; i < Math.floor(tallies / 5) + 1; i++) {
    const gx = 12 + (i % cols) * gw + rnd() * 4, gy = 10 + Math.floor(i / cols) * (gh + 8) + rnd() * 4;
    if (gy + gh > c.height - (text ? 70 : 6)) break;
    const n = Math.min(5, tallies - i * 5);
    for (let j = 0; j < Math.min(4, n); j++) {
      g.lineWidth = 1.5 + rnd() * 1.5;
      g.beginPath();
      g.moveTo(gx + j * 6 + rnd() * 2, gy + rnd() * 3);
      g.lineTo(gx + j * 6 + rnd() * 3 - 1, gy + gh - rnd() * 3);
      g.stroke();
    }
    if (n === 5) {
      g.beginPath();
      g.moveTo(gx - 4, gy + gh - 6);
      g.lineTo(gx + 26, gy + 6);
      g.stroke();
    }
  }
  if (text) {
    g.font = 'italic 34px serif';
    g.fillStyle = 'rgba(235,225,210,0.8)';
    text.forEach((s, i) => {
      g.save();
      g.translate(16 + i * 18, c.height - 44 + i * 34);
      g.rotate(-0.04 + i * 0.03);
      g.fillText(s, 0, 0);
      g.restore();
    });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
  if (face) m.position.set(x + face * 0.005, y, z);
  else m.position.set(x, y, z + 0.005);
  m.rotation.y = (face * Math.PI) / 2;
  W.scene.add(m);
}

// The Lumen's eye: a dark housing on a wall bracket with a violet iris that follows you, and flares when
// the field fails.
function machineEye(game) {
  const root = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.8, roughness: 0.35 });
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.12), dark);
  mount.position.z = 0.06;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8).rotateX(Math.PI / 2), dark);
  arm.position.z = 0.25;
  const head = new THREE.Group();
  head.position.z = 0.42;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.72).rotateX(-Math.PI / 2), dark);
  const irisMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(LUMEN).multiplyScalar(1.5) });
  const iris = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 28), irisMat);
  iris.position.z = 0.13;
  const pupilMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.2) });
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), pupilMat);
  pupil.position.z = 0.125;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshBasicMaterial({ color: 0x0a0612 }));
  lens.position.z = 0.118;
  head.add(shell, lens, iris, pupil);
  root.add(mount, arm, head);
  const target = new THREE.Vector3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), wp = new THREE.Vector3();
  const eye = {
    root,
    alarm: 0,
    update(dt, t) {
      if (game.state === 'title') {
        // nobody to watch yet: a slow, patient search
        target.set(14 + Math.sin(t * 0.4) * 6, 0.8 + Math.sin(t * 0.7) * 0.4, -1);
      } else target.copy(game.player.pos).setY(game.player.pos.y + game.player.eye);
      head.getWorldPosition(wp);
      m4.lookAt(target, wp, THREE.Object3D.DEFAULT_UP);
      q.setFromRotationMatrix(m4);
      head.quaternion.slerp(q, Math.min(1, dt * 3));
      eye.alarm = Math.max(0, eye.alarm - dt * 0.4);
      const pulse = 0.8 + 0.2 * Math.sin(t * 2.2) + eye.alarm * 1.5;
      irisMat.color.set(eye.alarm > 0.05 ? 0xffb0c8 : LUMEN).multiplyScalar(1.5 * pulse);
      iris.scale.setScalar(1 - eye.alarm * 0.35);
    },
  };
  return eye;
}

// ---------------------------------------------------------------- skeletons
// Joints for a few poses (meters, around the pelvis on the ground; the head toward +x). f: which way the
// chest faces. One merged mesh for every bone in the block (plus one for the dark eye sockets).
const POSES = {
  supine: {
    f: [0, 1, 0],
    pelvis: [0, 0.06, 0], neck: [0.55, 0.07, 0], head: [0.71, 0.11, 0],
    sL: [0.5, 0.06, 0.18], sR: [0.5, 0.06, -0.18], eL: [0.24, 0.04, 0.25], eR: [0.26, 0.04, -0.25], hL: [0.03, 0.05, 0.13], hR: [0.0, 0.05, -0.1],
    pL: [0, 0.05, 0.09], pR: [0, 0.05, -0.09], kL: [-0.42, 0.05, 0.11], kR: [-0.42, 0.06, -0.13], fL: [-0.82, 0.06, 0.14], fR: [-0.8, 0.06, -0.2],
  },
  sitting: {
    f: [1, 0, 0],
    pelvis: [0.12, 0.1, 0], neck: [-0.02, 0.62, 0.02], head: [0.1, 0.66, 0.1],
    sL: [0.0, 0.55, 0.19], sR: [0.0, 0.55, -0.17], eL: [0.14, 0.28, 0.27], eR: [0.16, 0.3, -0.26], hL: [0.36, 0.04, 0.3], hR: [0.32, 0.12, -0.12],
    pL: [0.12, 0.09, 0.09], pR: [0.12, 0.09, -0.09], kL: [0.5, 0.36, 0.13], kR: [0.56, 0.07, -0.14], fL: [0.8, 0.03, 0.14], fR: [0.96, 0.03, -0.2],
  },
  prone: {
    f: [0, -1, 0],
    pelvis: [0, 0.1, 0], neck: [0.55, 0.15, 0], head: [0.73, 0.12, 0.04],
    sL: [0.5, 0.15, 0.18], sR: [0.5, 0.15, -0.18], eL: [0.8, 0.04, 0.24], eR: [0.3, 0.03, -0.28], hL: [1.1, 0.03, 0.2], hR: [0.06, 0.03, -0.3],
    pL: [0, 0.06, 0.09], pR: [0, 0.06, -0.09], kL: [-0.42, 0.05, 0.13], kR: [-0.42, 0.05, -0.1], fL: [-0.82, 0.07, 0.1], fR: [-0.8, 0.05, -0.22],
  },
  curled: {
    f: [0, 0, 1],
    pelvis: [0, 0.12, 0], neck: [0.5, 0.15, 0.06], head: [0.66, 0.13, 0.14],
    sL: [0.47, 0.26, 0.02], sR: [0.47, 0.05, 0.02], eL: [0.62, 0.25, 0.26], eR: [0.64, 0.04, 0.22], hL: [0.6, 0.2, 0.4], hR: [0.7, 0.04, 0.36],
    pL: [0, 0.2, 0], pR: [0, 0.04, 0], kL: [0.28, 0.2, 0.4], kR: [0.3, 0.04, 0.36], fL: [-0.12, 0.18, 0.46], fR: [-0.08, 0.04, 0.42],
  },
  // sat back on its heels, bent forward until the skull rests against the wall (+x), hands on the floor
  kneel: {
    f: [0.82, -0.57, 0],
    pelvis: [0, 0.4, 0], neck: [0.34, 0.84, 0], head: [0.47, 0.8, 0.02],
    sL: [0.31, 0.8, 0.18], sR: [0.31, 0.8, -0.18], eL: [0.42, 0.44, 0.25], eR: [0.45, 0.42, -0.24], hL: [0.5, 0.04, 0.22], hR: [0.54, 0.04, -0.2],
    pL: [0, 0.4, 0.09], pR: [0, 0.4, -0.09], kL: [0.36, 0.06, 0.13], kR: [0.36, 0.06, -0.13], fL: [-0.14, 0.05, 0.12], fR: [-0.14, 0.05, -0.12],
  },
};

class Bones {
  constructor() {
    this.white = [];
    this.dark = [];
    this.m = new THREE.Matrix4();
  }

  // (x, y, z): where the pelvis lies; yaw turns the pose about y
  add(P, x, y, z, yaw) {
    const base = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    const J = {};
    for (const [k, v] of Object.entries(P)) if (k !== 'f') J[k] = new THREE.Vector3(...v).applyMatrix4(base);
    const F = new THREE.Vector3(...P.f).transformDirection(base);
    const A = J.neck.clone().sub(J.pelvis).normalize(); // up the spine
    const L = J.sL.clone().sub(J.sR);
    L.addScaledVector(A, -L.dot(A)).normalize();
    // spine, neck
    for (let i = 0; i <= 12; i++) this.put(new THREE.BoxGeometry(0.035, 0.03, 0.035), this.at(J.pelvis.clone().lerp(J.neck, i / 12), L, F, A));
    // ribs: arcs from the spine bulging toward the chest, shrinking down the ribcage
    for (let i = 0; i < 6; i++) {
      const p = J.neck.clone().lerp(J.pelvis, 0.12 + i * 0.075);
      const s = 1 - Math.abs(i - 1.5) * 0.09;
      const g = new THREE.TorusGeometry(1, 0.012, 4, 12, Math.PI).scale(0.13 * s, 0.11 * s, 1);
      this.put(g, this.at(p, L, F, A));
    }
    this.put(new THREE.BoxGeometry(0.03, 0.02, 0.16), this.at(J.neck.clone().lerp(J.pelvis, 0.3).addScaledVector(F, 0.1), L, F, A)); // sternum
    // pelvis: a squashed ring
    this.put(new THREE.TorusGeometry(0.09, 0.025, 5, 12).scale(1.2, 0.8, 1).rotateX(Math.PI / 2), this.at(J.pelvis, L, F, A));
    // collarbones and limbs
    for (const [a, b, r] of [['neck', 'sL', 0.012], ['neck', 'sR', 0.012], ['sL', 'eL', 0.017], ['eL', 'hL', 0.014], ['sR', 'eR', 0.017], ['eR', 'hR', 0.014],
      ['pL', 'kL', 0.022], ['kL', 'fL', 0.018], ['pR', 'kR', 0.022], ['kR', 'fR', 0.018]]) this.limb(J[a], J[b], r);
    // hands and feet: a few scattered small bones
    for (const [e, hnd] of [['eL', 'hL'], ['eR', 'hR'], ['kL', 'fL'], ['kR', 'fR']]) {
      const d = J[hnd].clone().sub(J[e]).setY(0).normalize();
      for (let i = 0; i < 4; i++) {
        const tip = J[hnd].clone().addScaledVector(d, 0.07 + (i % 2) * 0.02).add(new THREE.Vector3((i - 1.5) * 0.02 * d.z, 0, -(i - 1.5) * 0.02 * d.x));
        tip.y = Math.max(tip.y - 0.02, J[hnd].y - 0.03);
        this.limb(J[hnd], tip, 0.006, false);
      }
    }
    // the skull, facing F, crown along the neck → head line
    const up = J.head.clone().sub(J.neck).normalize();
    this.skullAt(J.head, up, F);
  }

  // n loose long bones and a few small ones heaped on the floor around (x, z), within radius r
  heap(x, z, n, r, seed) {
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r, len = 0.18 + rnd() * 0.28, yaw = rnd() * Math.PI;
      const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d, y = 0.02 + (1 - d / r) * 0.12 * rnd();
      const hx = (Math.cos(yaw) * len) / 2, hz = (Math.sin(yaw) * len) / 2, dy = (rnd() - 0.5) * 0.06;
      this.limb(new THREE.Vector3(cx - hx, y + dy, cz - hz), new THREE.Vector3(cx + hx, y - dy, cz + hz), 0.012 + rnd() * 0.01);
    }
    // a few ribs: arcs lying on the floor
    for (let i = 0; i < Math.ceil(n / 4); i++) {
      const g = new THREE.TorusGeometry(0.12, 0.01, 4, 10, Math.PI * 0.8).rotateX(Math.PI / 2).rotateY(rnd() * 6.3);
      this.white.push(g.translate(x + (rnd() - 0.5) * r, 0.03, z + (rnd() - 0.5) * r));
    }
  }

  // a loose skull on the floor: tilt rolls it onto its side
  skull(x, y, z, yaw, tilt) {
    const up = new THREE.Vector3(Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw));
    const f = new THREE.Vector3(Math.cos(yaw + 1.2), 0, Math.sin(yaw + 1.2));
    this.skullAt(new THREE.Vector3(x, y, z), up, f);
  }

  skullAt(p, up, fwd) {
    const F = fwd.clone().addScaledVector(up, -fwd.dot(up)).normalize();
    const L = new THREE.Vector3().crossVectors(up, F).normalize();
    const M = new THREE.Matrix4().makeBasis(L, up, F).setPosition(p);
    const part = (g, x, y, z, list = this.white) => list.push(g.translate(x, y, z).applyMatrix4(M));
    part(new THREE.SphereGeometry(0.09, 12, 9).scale(0.85, 0.95, 1.08), 0, 0.03, -0.01);
    part(new THREE.BoxGeometry(0.1, 0.05, 0.07), 0, -0.045, 0.045); // cheekbones and upper jaw
    part(new THREE.BoxGeometry(0.085, 0.025, 0.06), 0, -0.085, 0.04); // jaw
    for (const s of [-1, 1]) part(new THREE.SphereGeometry(0.023, 8, 6), s * 0.035, 0.0, 0.085, this.dark);
    part(new THREE.SphereGeometry(0.012, 6, 5), 0, -0.035, 0.092, this.dark);
  }

  at(p, L, F, A) {
    return new THREE.Matrix4().makeBasis(L, F, A).setPosition(p);
  }

  put(g, m) {
    this.white.push(g.applyMatrix4(m));
  }

  limb(a, b, r, knobs = true) {
    const d = b.clone().sub(a);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r, r * 0.85, len, 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.white.push(g);
    if (knobs) for (const p of [a, b]) this.white.push(new THREE.SphereGeometry(r * 1.7, 6, 5).translate(p.x, p.y, p.z));
  }

  build() {
    const group = new THREE.Group();
    const bone = new THREE.MeshStandardMaterial({ color: 0xcfc3a6, roughness: 0.85, metalness: 0 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x080606 });
    for (const [list, m] of [[this.white, bone], [this.dark, dark]]) {
      const geo = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
      list.forEach((g) => g.dispose());
      group.add(new THREE.Mesh(geo, m));
    }
    return group;
  }
}

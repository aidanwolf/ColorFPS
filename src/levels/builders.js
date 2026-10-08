// Shared level-building helpers. Every world module calls makeBuilders(world, game, level) and builds
// with the returned functions; see src/levels/LAYOUT.md for where each world lives.
import * as THREE from 'three';
import { Barrier } from '../entities/barrier.js';
import { Pickup } from '../entities/misc.js';
import { AudioLog } from '../entities/audiolog.js';
import { Recorder } from '../story/recorder.js';
import { Mirror, Glass, TargetPanel } from '../entities/puzzle.js';
import { SpikeShield, ShaftSpikes } from '../entities/spikeShield.js';
import { waterSurface } from '../liquid.js';
import {
  ColorSwitch, PhasePlatform, ChromaPlatform, TimedGate, CrumblePlatform, Trapdoor, SpikeBed,
  ShotMover, RiserBlock, SinkerBlock, ShotRotor, PlatformRack,
} from '../entities/mechanics.js';
import { Encounter, Seal, spawnEnemy } from '../entities/combat.js';
import { Slime, SpiderBot } from '../entities/verdantEnemies.js';
import { FishSchool, RoboSquid } from '../entities/azureEnemies.js';
import { resetCritters } from '../entities/critters.js';

export const T = 0.5; // wall thickness
export const CH = 3.2; // corridor height
export const GLOW = { red: 'glow0', yellow: 'glow1', green: 'glow2', blue: 'glow3', boss: 'trimWhite', hub: 'trimWhite' };

export function makeBuilders(W, game, level) {
  // A wall along x (thickness z1..z2) with rectangular openings centered at c (x), bottom y0, height h.
  function wallX(z1, z2, x1, x2, yb, yt, openings, zone, kind = 'wall') {
    let x = x1;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      W.box(x, yb, z1, a, yt, z2, kind, zone);
      if (o.y0 > yb) W.box(a, yb, z1, b, o.y0, z2, kind, zone);
      if (o.y0 + o.h < yt) W.box(a, o.y0 + o.h, z1, b, yt, z2, kind, zone);
      x = b;
    }
    W.box(x, yb, z1, x2, yt, z2, kind, zone);
  }
  // A wall along z (thickness x1..x2); opening centers c are z coordinates.
  function wallZ(x1, x2, z1, z2, yb, yt, openings, zone, kind = 'wall') {
    let z = z1;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      W.box(x1, yb, z, x2, yt, a, kind, zone);
      if (o.y0 > yb) W.box(x1, yb, a, x2, o.y0, b, kind, zone);
      if (o.y0 + o.h < yt) W.box(x1, o.y0 + o.h, a, x2, yt, b, kind, zone);
      z = b;
    }
    W.box(x1, yb, z, x2, yt, z2, kind, zone);
  }
  const abs = (y, list) => (list || []).map((o) => ({ ...o, y0: y + (o.y0 || 0) }));

  // Room: interior x1..x2, z from zS (south, larger) to zN (north), floor top at y, height h.
  // Openings (n/s: c is x; e/w: c is z) have y0 relative to the floor.
  function room({ x1, x2, zS, zN, y, h, zone, n, s, e, w, ceiling = true, floor = true, trim = true, wallKind = 'wall' }) {
    if (floor) W.box(x1 - T, y - 1, zN - T, x2 + T, y, zS + T, 'floor', zone);
    if (ceiling) W.box(x1 - T, y + h, zN - T, x2 + T, y + h + 0.5, zS + T, 'ceil', zone);
    wallX(zS, zS + T, x1, x2, y, y + h, abs(y, s), zone, wallKind);
    wallX(zN - T, zN, x1, x2, y, y + h, abs(y, n), zone, wallKind);
    wallZ(x2, x2 + T, zN - T, zS + T, y, y + h, abs(y, e), zone, wallKind);
    wallZ(x1 - T, x1, zN - T, zS + T, y, y + h, abs(y, w), zone, wallKind);
    if (trim && h > 3) {
      const g = GLOW[zone];
      const ty = y + Math.min(h - 0.6, 4.2);
      W.deco(x1, ty, zN, x1 + 0.05, ty + 0.08, zS, g, zone);
      W.deco(x2 - 0.05, ty, zN, x2, ty + 0.08, zS, g, zone);
    }
  }

  // North-south corridor between zStart and zEnd (either order), 3 m wide, centered on x = cx.
  // e/w openings: c is z.  low: [{ z1, z2, h }] lowers the ceiling to h (crawlspace).
  function corridor({ zStart, zEnd, y, zone, e, w, low = [], h = CH, cx = 0 }) {
    const x1 = cx - 1.5, x2 = cx + 1.5;
    const za = Math.min(zStart, zEnd), zb = Math.max(zStart, zEnd);
    W.box(x1 - T, y - 1, za, x2 + T, y, zb, 'floor', zone);
    W.box(x1 - T, y + h, za, x2 + T, y + h + 0.5, zb, 'ceil', zone);
    wallZ(x2, x2 + T, za, zb, y, y + h, abs(y, e), zone);
    wallZ(x1 - T, x1, za, zb, y, y + h, abs(y, w), zone);
    for (const l of low) W.box(x1, y + l.h, Math.min(l.z1, l.z2), x2, y + h, Math.max(l.z1, l.z2), 'metal', zone);
    // glowing base strips guide the eye down the hall
    const g = GLOW[zone];
    W.deco(x1, y + 0.02, za, x1 + 0.06, y + 0.1, zb, g, zone);
    W.deco(x2 - 0.06, y + 0.02, za, x2, y + 0.1, zb, g, zone);
  }

  // East-west corridor between xStart and xEnd (either order), 3 m wide, centered on z = cz.
  // n/s openings: c is x.  low: [{ x1, x2, h }].
  function corridorX({ xStart, xEnd, y, zone, n, s, low = [], h = CH, cz }) {
    const z1 = cz - 1.5, z2 = cz + 1.5;
    const xa = Math.min(xStart, xEnd), xb = Math.max(xStart, xEnd);
    W.box(xa, y - 1, z1 - T, xb, y, z2 + T, 'floor', zone);
    W.box(xa, y + h, z1 - T, xb, y + h + 0.5, z2 + T, 'ceil', zone);
    wallX(z1 - T, z1, xa, xb, y, y + h, abs(y, n), zone);
    wallX(z2, z2 + T, xa, xb, y, y + h, abs(y, s), zone);
    for (const l of low) W.box(Math.min(l.x1, l.x2), y + l.h, z1, Math.max(l.x1, l.x2), y + h, z2, 'metal', zone);
    const g = GLOW[zone];
    W.deco(xa, y + 0.02, z1, xb, y + 0.1, z1 + 0.06, g, zone);
    W.deco(xa, y + 0.02, z2 - 0.06, xb, y + 0.1, z2, g, zone);
  }

  function tunnelX({ x1, x2, zc, w, y, h, zone }) {
    const a = zc - w / 2, b = zc + w / 2;
    W.box(x1, y - 0.5, a - T, x2, y, b + T, 'grate', zone);
    W.box(x1, y + h, a - T, x2, y + h + 0.5, b + T, 'metal', zone);
    W.box(x1, y, a - T, x2, y + h, a, 'metal', zone);
    W.box(x1, y, b, x2, y + h, b + T, 'metal', zone);
  }

  // Floating slab with neon edge lines so its outline reads mid-jump.
  function plat(x1, z1, x2, z2, top, zone, thick = 0.6, kind = 'plat') {
    W.box(x1, top - thick, z1, x2, top, z2, kind, zone);
    const za = Math.min(z1, z2), zb = Math.max(z1, z2), g = GLOW[zone], y1 = top - 0.12, y2 = top - 0.04, o = 0.02;
    W.deco(x1 - o, y1, za - o, x2 + o, y2, za, g, zone);
    W.deco(x1 - o, y1, zb, x2 + o, y2, zb + o, g, zone);
    W.deco(x1 - o, y1, za, x1, y2, zb, g, zone);
    W.deco(x2, y1, za, x2 + o, y2, zb, g, zone);
  }

  // A chroma core on a pedestal: collecting it plays the unlock cutscene and grants the color.
  function pedestal(x, y, z, color, zone) {
    W.box(x - 0.7, y, z - 0.7, x + 0.7, y + 0.9, z + 0.7, 'metal', zone);
    W.deco(x - 0.75, y + 0.9, z - 0.75, x + 0.75, y + 0.98, z + 0.75, GLOW[zone], zone);
    return new Pickup(W, { pos: [x, y + 1.8, z], type: 'color', color, onCollect: (pk) => game.unlockColor(color, pk.pos) });
  }

  // A secret room: a prism trophy plus a trigger that counts the secret when you step inside.
  function secretRoom(min, max, label) {
    level.secretsTotal++;
    level.secrets.push({ label, trigger: W.trigger(min, max, () => game.foundSecret(label)) });
  }
  const trophy = (x, y, z) => new Pickup(W, { pos: [x, y, z], type: 'maxhp', amount: 20 });

  // A side alcove off a room's east wall (x = 5), centered on zc: a glass wall you can't climb, open
  // above. Behind it the ceiling and side walls reflect (mirrors, or energy panels of another color) and
  // the floor and back wall are one big target, so nearly any shot fired over the glass lands on it.
  function sideAlcove({ zc, y, color, zone, onActivate, reflector = null }) {
    const z1 = zc - 1.5, z2 = zc + 1.5, top = y + 4, glassTop = y + 2.6;
    room({ x1: 6, x2: 11.5, zS: z2, zN: z1, y, h: 4, zone, w: [{ c: zc, w: 3, h: 4 }], trim: false });
    new Glass(W, { min: [6.6, y, z1], max: [6.7, glassTop, z2] });
    W.deco(6.55, glassTop, z1, 6.75, glassTop + 0.06, z2, GLOW[zone], zone); // glowing lip marks the glass top
    const reflect = (min, max) =>
      reflector === null ? new Mirror(W, { min, max }) : new Barrier(W, { min, max, color: reflector, kind: 'wall', regen: 2.5, zone });
    reflect([6.7, top - 0.15, z1], [11.5, top, z2]);
    reflect([6.7, y, z1], [11.3, top - 0.15, z1 + 0.1]);
    reflect([6.7, y, z2 - 0.1], [11.3, top - 0.15, z2]);
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      onActivate();
    };
    const panels = [
      new TargetPanel(W, { min: [6.8, y, z1 + 0.1], max: [11.3, y + 0.12, z2 - 0.1], color, face: 'up', onActivate: once }),
      new TargetPanel(W, { min: [11.3, y + 0.12, z1 + 0.1], max: [11.5, top - 0.15, z2 - 0.1], color, face: '-x', onActivate: once }),
    ];
    panels.forEach((p) => (p.group = panels));
  }

  // A spike drop: a free fall down a shaft through stacked spike layers (no slow-fall; that's Azure's water).
  //   shieldedShaft({ x1, x2, z1, z2, floor, capY, cap, layers: [{ y?, color, port?, regen? }, ...], zone })
  // Every layer covers the footprint x1..x2 / z1..z2 (top to bottom in `layers`). Just above each one hangs a
  // SpikeShield film tinted the layer's color: bodies fall straight through it, shots are swallowed (ripple,
  // no ricochet). The film leaves one end of its layer open (the port; ports alternate ends along the
  // shaft's long axis, the first at the end away from the drop-off side), so each layer can only be shot
  // through its port, from the right angle: the first from the ledge (or as you drop), the next ones
  // mid-fall, looking through the port above at the port below. A broken layer won't regrow while you're in
  // the column above it. Hold fire, aim at the next port, switch color as each layer goes.
  // Spacing: leave `y` out on every layer and they're spread evenly from capY - 2.4 down to floor + 2 (the
  // bottom one reforms over a standing player's head). Keep the whole drop under ~15 m (an 18 m fall is
  // lethal); 2 layers in 10-12 m or 3 in 13-15 m feel right. Explicit y's are honoured as given.
  // cap ({ x1, x2, z1, z2 }, optional) only tells which side you drop in from (the side it overhangs);
  // layer.shieldY (old updraft design) is ignored. port: 'n' | 's' | 'e' | 'w' forces a layer's open end.
  function shieldedShaft({ x1, x2, z1, z2, floor, capY, cap = null, layers, zone = 'red' }) {
    const lx = x2 - x1, lz = z2 - z1;
    const over = cap ? { n: z1 - cap.z1, s: cap.z2 - z2, w: x1 - cap.x1, e: cap.x2 - x2 } : { n: 0, s: 0, w: 0, e: 0 };
    const entry = Object.keys(over).reduce((a, b) => (over[b] > over[a] ? b : a), 'n');
    const axis = Math.abs(lx - lz) < 0.01 ? (entry === 'e' || entry === 'w' ? 'x' : 'z') : lx > lz ? 'x' : 'z';
    // the first port sits at the far end from where you drop in (or the + end if you enter from the side)
    let end = axis === 'z' ? (entry === 's' ? 'n' : 's') : entry === 'e' ? 'w' : 'e';
    const auto = layers.every((L) => L.y === undefined);
    const yTop = capY - 2.4, yBot = floor + 2;
    const n = layers.length;
    layers.forEach((L, i) => {
      const y = auto ? (n === 1 ? (yTop + yBot) / 2 : yTop + ((yBot - yTop) * i) / (n - 1)) : L.y;
      new ShaftSpikes(W, { min: [x1, y, z1], max: [x2, y + 0.6, z2], color: L.color, regen: L.regen ?? 2.6, zone, top: capY + 4 });
      const side = L.port ?? end;
      const len = side === 'n' || side === 's' ? lz : lx, pw = Math.max(1.4, Math.min(len * 0.4, 2.4));
      const fy = y + 0.6 + 0.35;
      let fmin, fmax, port;
      if (side === 'n') (fmin = [x1, fy, z1 + pw]), (fmax = [x2, fy + 0.06, z2]), (port = { axis: 'z', edge: z1 + pw, side: -1 });
      else if (side === 's') (fmin = [x1, fy, z1]), (fmax = [x2, fy + 0.06, z2 - pw]), (port = { axis: 'z', edge: z2 - pw, side: 1 });
      else if (side === 'w') (fmin = [x1 + pw, fy, z1]), (fmax = [x2, fy + 0.06, z2]), (port = { axis: 'x', edge: x1 + pw, side: -1 });
      else (fmin = [x1, fy, z1]), (fmax = [x2 - pw, fy + 0.06, z2]), (port = { axis: 'x', edge: x2 - pw, side: 1 });
      new SpikeShield(W, { min: fmin, max: fmax, color: L.color, port });
      end = { n: 's', s: 'n', e: 'w', w: 'e' }[side];
    });
  }

  const hint = (min, max, html, time = 5) => W.trigger(min, max, () => game.hud.message(html, time));
  // Title card the first time you enter a sector; also switches the music if a track is given.
  const zoneTitle = (min, max, sub, main, color, music) => W.trigger(min, max, () => game.enterZone(sub, main, color, music));
  // A mood volume: every time you walk in, music / ambience / atmosphere crossfade to these (any may be
  // omitted). Put one just inside each doorway so backtracking restores the right mood.
  const area = (min, max, { music, ambient, atmosphere } = {}) =>
    W.trigger(min, max, () => {
      if (music) game.setMusic(music);
      if (ambient) game.setAmbient(ambient);
      if (atmosphere) game.setAtmosphere(atmosphere);
    }, { once: false });
  // Point lights: only the nearest few really shine at once (World.updateLights), but keep to the budget.
  // (pooled: see World.addLight; returns an object with position/color/intensity like a PointLight)
  const light = (x, y, z, color, intensity = 30, dist = 30) => {
    const l = W.addLight(color, intensity, dist, 1.5);
    l.position.set(x, y, z);
    return l;
  };
  const barrierWall = (z, y, color, zone, h = CH, cx = 0) =>
    new Barrier(W, { min: [cx - 1.5, y, z - 0.2], max: [cx + 1.5, y + h, z + 0.2], color, kind: 'wall', zone });
  const barrierWallX = (x, y, color, zone, cz, h = CH) =>
    new Barrier(W, { min: [x - 0.2, y, cz - 1.5], max: [x + 0.2, y + h, cz + 1.5], color, kind: 'wall', zone });
  const tree = (x, y, z, scale = 1) => {
    W.box(x - 0.3 * scale, y, z - 0.3 * scale, x + 0.3 * scale, y + 2.8 * scale, z + 0.3 * scale, 'rock', 'green');
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 * scale, 0), new THREE.MeshStandardMaterial({ color: 0x2f8a46, flatShading: true, roughness: 1 }));
    canopy.position.set(x, y + 3.6 * scale, z);
    canopy.scale.y = 1.2;
    W.scene.add(canopy);
    return canopy;
  };
  // Swimmable water: a box you can swim in (air runs out with your head under), with a surface sheet on
  // top. current: [x, y, z] m/s pushes swimmers along (e.g. a downward flow in a flooded pipe).
  const water = (min, max, { current = null, surface = true } = {}) => {
    const v = { min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), current: current ? new THREE.Vector3(...current) : null };
    (W.waters ??= []).push(v);
    if (surface) waterSurface(W, min[0], min[2], max[0], max[2], max[1]);
    return v;
  };
  // An invisible wall: it stops the player but not shots, drones or sight lines. Seals the open-air worlds
  // (stand one on a wall top, up into the sky, and nobody can get onto the wall or over it).
  const blocker = (min, max) => W.addSolid(new THREE.Vector3(...min), new THREE.Vector3(...max), { noShot: true });
  // The void under the edge of the world: falling in fades you back to the checkpoint (no death).
  const killZone = (min, max) => {
    const t = W.trigger(min, max, () => !game.voidT && game.state === 'playing' && game.fallOutOfWorld(), { once: false });
    t.kill = true;
    return t;
  };
  // A glowing floor path: chevrons laid along the points ([x, y, z], y = the floor top under that point;
  // keep each run on one surface) with a pulse that runs toward the last point. One draw per path.
  const chevronGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, -0.22);
    s.lineTo(0, 0.26);
    s.lineTo(0.5, -0.22);
    s.lineTo(0.5, 0.06);
    s.lineTo(0, 0.54);
    s.lineTo(-0.5, 0.06);
    s.closePath();
    return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  })();
  function guideStrip(points, color, { spacing = 1.5, scale = 1, near = 70 } = {}) {
    const marks = [];
    let s = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay, az] = points[i], [bx, by, bz] = points[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const yaw = Math.atan2(-(bx - ax), -(bz - az));
      for (let d = s ? 0 : 0.6; d < len; d += spacing) marks.push({ x: ax + ((bx - ax) * d) / len, y: ay + ((by - ay) * d) / len, z: az + ((bz - az) * d) / len, yaw, s: s + d });
      s += len;
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.InstancedMesh(chevronGeo, mat, marks.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(scale, 1, scale);
    const base = new THREE.Color(color), col = new THREE.Color();
    const centre = new THREE.Vector3();
    marks.forEach((k, i) => {
      q.setFromAxisAngle(up, k.yaw);
      mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(k.x, k.y + 0.03, k.z), q, sc));
      mesh.setColorAt(i, col.copy(base).multiplyScalar(0.5));
      centre.add(new THREE.Vector3(k.x, k.y, k.z));
    });
    centre.divideScalar(Math.max(1, marks.length));
    W.scene.add(mesh);
    let t = Math.random() * 10;
    W.add({
      update(dt, player) {
        if (player.pos.distanceTo(centre) > near) return;
        t += dt;
        marks.forEach((k, i) => {
          const wave = Math.pow(Math.max(0, Math.sin((k.s / 6 - t * 1.6) * Math.PI)), 6); // pulses run toward the end
          mesh.setColorAt(i, col.copy(base).multiplyScalar(0.75 + 1.6 * wave));
        });
        mesh.instanceColor.needsUpdate = true;
      },
    });
    return mesh;
  }
  // Glowing outline round the top of a box (a ledge, a step, a drop-off) so its edges read from afar.
  function glowEdge(x1, z1, x2, z2, top, kind, zone, t = 0.08) {
    const y1 = top - 0.1, y2 = top + 0.02;
    W.deco(x1, y1, z1, x2, y2, z1 + t, kind, zone);
    W.deco(x1, y1, z2 - t, x2, y2, z2, kind, zone);
    W.deco(x1, y1, z1, x1 + t, y2, z2, kind, zone);
    W.deco(x2 - t, y1, z1, x2, y2, z2, kind, zone);
  }
  // A repeating hint that waits `every` seconds before it can show again (for spots players keep returning to).
  const hintEvery = (min, max, html, every = 20, time = 5, when = () => true) => {
    let at = -1e9;
    W.trigger(min, max, () => {
      if (W.time - at < every || !when()) return;
      at = W.time;
      game.hud.message(html, time);
    }, { once: false });
  };
  // ?dev&start=<name> drops you here with the given colors (see main.js devSkip).
  const devStart = (name, pos, yaw = 0, colors = [0]) => (level.devStarts[name] = { pos: new THREE.Vector3(...pos), yaw, colors });
  // Called whenever the player respawns at a checkpoint (reset elevators, encounters, ...).
  const onRespawn = (fn) => level.respawnHooks.push(fn);
  // One of Wren Ashby's audio logs ('01'..'15', see tools/audio/logs.json), floating over the floor point
  // pos. Once picked up it never comes back (story/recorder.js keeps the list).
  const audioLog = (id, pos, yaw = 0) => {
    const rec = (game.recorder ??= new Recorder(game));
    return rec.has(id) ? null : new AudioLog(W, game, { id, pos, yaw });
  };

  // ---------- mechanics toolkit: one line per piece (options: see the top of entities/mechanics.js) ----------
  // Each wrapper takes the entity's options (zone defaults to 'red'), returns the entity and resets it on
  // every checkpoint respawn.
  const mech = (e) => (onRespawn(() => e.reset()), e);
  const colorSwitch = (o) => mech(new ColorSwitch(W, o));
  const phasePlatform = (o) => mech(new PhasePlatform(W, o));
  const chromaPlatform = (o) => mech(new ChromaPlatform(W, o));
  const crumble = (o) => mech(new CrumblePlatform(W, o));
  const trapdoor = (o) => mech(new Trapdoor(W, o));
  const spikes = (min, max, o = {}) => new SpikeBed(W, { min, max, ...o });
  const shotMover = (o) => mech(new ShotMover(W, o));
  const riser = (o) => mech(new RiserBlock(W, o));
  const sinker = (o) => mech(new SinkerBlock(W, o));
  const shotRotor = (o) => mech(new ShotRotor(W, o));
  const platformRack = (o) => mech(new PlatformRack(W, o));
  // A race door. switch: { pos, face, style, ... } adds a pulse switch of the gate's color that opens it,
  // with the gate's countdown on its ring (gate.switch).
  const timedGate = ({ switch: sw = null, ...o }) => {
    const g = mech(new TimedGate(W, o));
    if (sw) g.switch = colorSwitch({ color: o.color, zone: o.zone, ...sw, mode: 'pulse', links: [g], timerSource: g });
    return g;
  };

  // ---- combat (src/entities/combat.js) ----
  // An arena fight: enter `trigger` ([min, max]) and `seals` slam shut, then `waves` of enemies spawn out
  // of portals; clear them all to open the seals, set `checkpoint` ({ pos, yaw }) and run `onClear`.
  // Resets itself whenever the player respawns (until it's been cleared). Positions are [x, y, z].
  //   B.encounter({ trigger: [[x1, y1, z1], [x2, y2, z2]],
  //     seals: [{ min, max, color?, closed? }],            // closed: shut from the start, opens on clear
  //     waves: [[{ type: 'drone', pos, color }, ...], { enemies: [...], timeout: 12 }],
  //     title: 'AMBUSH', sub: 'HOSTILES INBOUND', music: 'music_combat', checkpoint, onClear,
  //     resume: false })                                    // resume: a death rewinds only to the current wave
  const encounter = (opts) => {
    const e = new Encounter(W, game, opts);
    onRespawn(() => e.reset());
    return e;
  };
  // A single enemy placed in the level (not part of an encounter); see spawnEnemy in combat.js for options.
  // type: 'drone' | 'swarm' | 'turret' | 'warden' | 'brute' | 'mortar'
  const enemy = (type, pos, opts = {}) => spawnEnemy(W, { type, pos, ...opts });
  const turret = (pos, color, opts = {}) => enemy('turret', pos, { color, ...opts }); // opts.mount: 'floor' | 'ceiling' | wall normal
  const swarm = (pos, colors, count = 6, opts = {}) => enemy('swarm', pos, { color: colors, count, ...opts });
  const warden = (pos, shield, core, opts = {}) => enemy('warden', pos, { shield, core, ...opts });
  const brute = (pos, color, opts = {}) => enemy('brute', pos, { color, ...opts });
  const mortar = (pos, color, opts = {}) => enemy('mortar', pos, { color, ...opts });
  // A slab that slams shut / slides open on command (seal.close(), seal.open()); color null = metal shutter.
  const seal = (min, max, opts = {}) => new Seal(W, { min, max, ...opts });

  // ---- world creatures (entities/verdantEnemies.js, entities/azureEnemies.js) ----
  // pos [x, y, z]; every live one goes back to its post when the player respawns (one hook for them all).
  let crittersHooked = false;
  const critter = (e) => {
    if (!crittersHooked) {
      crittersHooked = true;
      onRespawn(() => resetCritters(W));
    }
    return e;
  };
  // Slime Mold (leaper): pos on the floor. opts: color (slime, default green), core (default red), slimeHp,
  // range, leapRange, regrow (s the bare core has before its slime is back), wander, size
  const slime = (pos, opts = {}) => critter(new Slime(W, { pos, ...opts }));
  // Spider Bot: pos on the floor (or under a ceiling with ceiling: true). opts: color (one or a cycling
  // palette, default [green, red]), hp, range, fireInterval, cycle, leash (m it strays from pos)
  const spiderBot = (pos, opts = {}) => critter(new SpiderBot(W, { pos, ...opts }));
  // Robo-Fish school: pos inside a B.water box. opts: count (3–6), color (one, or one per fish), range,
  // leapRange (m from the water's edge it leaps at you on the bank), patrol (m the school roams)
  const roboFish = (pos, opts = {}) => critter(new FishSchool(W, { pos, ...opts }));
  // Robo-Squid: pos inside a B.water box (with none nearby it hovers in the air). opts: color, hp, range,
  // fireInterval, orbit
  const roboSquid = (pos, opts = {}) => critter(new RoboSquid(W, { pos, ...opts }));

  return {
    W, game, level, T, CH, GLOW,
    wallX, wallZ, abs, room, corridor, corridorX, tunnelX, plat, pedestal, secretRoom, trophy,
    sideAlcove, shieldedShaft, hint, zoneTitle, area, light, barrierWall, barrierWallX, tree, blocker, killZone, devStart, onRespawn, water,
    guideStrip, glowEdge, hintEvery,
    colorSwitch, phasePlatform, chromaPlatform, crumble, trapdoor, spikes, shotMover, riser, sinker, shotRotor, platformRack, timedGate,
    audioLog,
    encounter, enemy, turret, swarm, warden, brute, mortar, seal,
    slime, spiderBot, roboFish, roboSquid,
  };
}

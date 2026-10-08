// Where to go next. currentObjective() turns progress (colors owned, where you are, the boss) into the
// HUD objective line; buildGuide() lays animated chevrons on the Hub floor from the entrance to the
// door you should take next, with a light column in that doorway.
import * as THREE from 'three';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { regionOf } from './regions.js';

const tag = (c, text) => `<b style="color:${COLORS[c].css}">${text}</b>`;
const FLOOR = 4;

// Floor paths in the Hub (x, z), skirting the raised dais at x -5..5, z -105..-115.
// Where the floor path ends for each goal (just inside its doorway), the raised dais to route around,
// and the Hub's return gallery (y 12): from up there the path leads to the edge nearest the goal.
const TARGETS = { solar: [-23, -112], verdant: [-10, -146.5], azure: [23, -112], dais: [0, -104.6] };
const DAIS = { x1: -6.4, x2: 6.4, z1: -116.4, z2: -103.6 };
const GALLERY_Y = 12;
const DOORS = {
  solar: { pos: [-24.6, -112], color: YELLOW },
  verdant: { pos: [-10, -148.2], color: GREEN },
  azure: { pos: [24.6, -112], color: BLUE },
  dais: { pos: [0, -110], color: null },
};

export function currentObjective(game) {
  const b = game.blaster, has = (c) => b.has && b.unlocked[c];
  const where = regionOf(game.player.pos);
  if (!b.has) {
    const cell = game.level.cellBlock; // the opening (cellblock.js): locked up, then out of the block
    if (cell && !cell.escaped) return { html: cell.fieldDown ? 'Escape the <b>cell block</b>.' : 'You wake in a <b>holding cell</b>.', color: COLORS[RED].css };
    return { html: 'Grab the <b>Chroma Blaster</b> from the pedestal.', color: COLORS[RED].css };
  }
  if (!has(YELLOW)) {
    if (where === 'red') return { html: `Fight north through the ${tag(RED, 'Crimson Foundry')} to the Nexus.`, color: COLORS[RED].css };
    if (where === 'solar') return { html: `Find the ${tag(YELLOW, 'SOLAR core')} somewhere below the mesas.`, door: null };
    return { html: `Enter the ${tag(YELLOW, 'SOLAR wing')}: the open yellow door on the <b>west</b> side of the Nexus.`, door: 'solar' };
  }
  if (!has(GREEN)) {
    if (where === 'solar') return { html: `${tag(YELLOW, 'Solar')} restored. Climb back up to the Nexus.` };
    if (where === 'verdant') return { html: `Find the ${tag(GREEN, 'VERDANT core')} deep in the hollow.` };
    return { html: `Blast open the ${tag(GREEN, 'VERDANT gate')} on the <b>north</b> wall with ${tag(YELLOW, 'yellow')}.`, door: 'verdant' };
  }
  if (!has(BLUE)) {
    if (where === 'verdant') return { html: `${tag(GREEN, 'Verdant')} restored. Climb back up to the Nexus.` };
    if (where === 'azure') return { html: `Descend to the ${tag(BLUE, 'AZURE core')} at the bottom of the station.` };
    return { html: `Blast open the ${tag(BLUE, 'AZURE gate')} on the <b>east</b> wall with ${tag(GREEN, 'green')}.`, door: 'azure' };
  }
  const boss = game.level.boss;
  if (game.state === 'victory' || boss?.dead) return { html: '' };
  if (where === 'azure') return { html: 'Ride the elevator back up to the Nexus.' };
  if (where === 'prism') return { html: boss?.active ? 'Destroy the <b>Prism Warden</b>.' : 'Enter the arena. <b>The Warden waits.</b>' };
  return { html: 'Shoot the four <b>color locks</b> on the central dais, then ride the lift down to the <b>Prism Core</b>.', door: 'dais' };
}

export function buildGuide(W, game) {
  // chevrons along a path recomputed from wherever you stand to the goal, pulsing toward it
  const shape = new THREE.Shape();
  shape.moveTo(-0.55, -0.25);
  shape.lineTo(0, 0.3);
  shape.lineTo(0.55, -0.25);
  shape.lineTo(0.55, 0.05);
  shape.lineTo(0, 0.6);
  shape.lineTo(-0.55, 0.05);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const MAXN = 64;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, MAXN);
  mesh.frustumCulled = false;
  mesh.count = 0;
  for (let i = 0; i < MAXN; i++) mesh.setColorAt(i, new THREE.Color(0));
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 14, 20, 1, true), beamMat);
  beam.visible = false;
  const group = new THREE.Group();
  group.add(mesh, beam);
  group.userData.noCull = true; // it follows the player around the Hub
  W.scene.add(group);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color(), base = new THREE.Color(), down = new THREE.Vector3(0, -1, 0), probe = new THREE.Vector3();
  let marks = [], t = 0, rebuildT = 0, lastGoal = null;
  // does the segment a→b cross the dais (with margin)?
  const crossesDais = (a, b) => {
    for (let k = 0; k <= 20; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / 20, z = a[1] + ((b[1] - a[1]) * k) / 20;
      if (x > DAIS.x1 && x < DAIS.x2 && z > DAIS.z1 && z < DAIS.z2) return true;
    }
    return false;
  };
  const len = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  // a floor route from a to b that skirts the dais through one or two of its corners
  const route = (a, b) => {
    if (!crossesDais(a, b)) return [a, b];
    const C = [[DAIS.x1, DAIS.z1], [DAIS.x2, DAIS.z1], [DAIS.x1, DAIS.z2], [DAIS.x2, DAIS.z2]];
    let best = null;
    for (const c of C) {
      if (crossesDais(a, c) || crossesDais(c, b)) continue;
      const p = [a, c, b];
      if (!best || len(p) < len(best)) best = p;
    }
    for (const c of C)
      for (const d of C) {
        if (c === d || crossesDais(a, c) || crossesDais(c, d) || crossesDais(d, b)) continue;
        const p = [a, c, d, b];
        if (!best || len(p) < len(best)) best = p;
      }
    return best || [a, b];
  };
  const rebuild = (player, goal) => {
    const onGallery = player.pos.y > GALLERY_Y - 1.5;
    const tgt = TARGETS[goal];
    let pts, y0;
    if (onGallery) {
      // up on the gallery: lead to its inner edge nearest the goal, then hop down
      const gx = player.pos.x, gz = player.pos.z;
      let e = gx < -19 ? [-19.4, Math.min(-125, Math.max(-147, tgt[1]))] : gx > 19 ? [19.4, Math.min(-125, Math.max(-147, tgt[1]))] : [Math.min(19, Math.max(-19, tgt[0])), -143.4];
      pts = [[gx, gz], e];
      y0 = player.pos.y;
    } else {
      pts = route([player.pos.x, player.pos.z], tgt);
      y0 = player.pos.y;
    }
    marks = [];
    let s = 0;
    for (let i = 0; i < pts.length - 1 && marks.length < MAXN; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(-(bx - ax), -(bz - az));
      for (let d = i ? 0 : 1.6; d < L && marks.length < MAXN; d += 1.6) {
        const x = ax + ((bx - ax) * d) / L, z = az + ((bz - az) * d) / L;
        // sit on whatever floor is there (the sunken plaza, steps)
        const hit = W.raycast(probe.set(x, y0 + 1.2, z), down, 4, { meshes: false });
        marks.push({ x, z, y: hit ? hit.point.y : y0, yaw, s: s + d });
      }
      s += L;
    }
    marks.forEach((k, i) => {
      q.setFromAxisAngle(up, k.yaw);
      mesh.setMatrixAt(i, m4.compose(probe.set(k.x, k.y + 0.04, k.z), q, one));
    });
    mesh.count = marks.length;
    mesh.instanceMatrix.needsUpdate = true;
  };

  W.add({
    update(dt, player) {
      t += dt;
      const inHub = regionOf(player.pos) === 'hub' && player.pos.y > FLOOR - 1;
      const goal = inHub ? currentObjective(game).door : null;
      const door = goal && DOORS[goal];
      mesh.visible = !!door;
      beam.visible = !!door;
      if (!door) {
        lastGoal = null;
        return;
      }
      rebuildT -= dt;
      if (rebuildT <= 0 || goal !== lastGoal) {
        rebuildT = 0.35;
        lastGoal = goal;
        rebuild(player, goal);
      }
      base.set(door.color === null ? 0xffffff : COLORS[door.color].hex);
      marks.forEach((k, i) => {
        const wave = Math.pow(Math.max(0, Math.sin((k.s / 6 - t * 1.6) * Math.PI)), 6); // pulses run toward the goal
        mesh.setColorAt(i, col.copy(base).multiplyScalar(0.35 + 1.4 * wave));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      beam.position.set(door.pos[0], FLOOR + 7, door.pos[1]);
      beamMat.color.copy(base);
      beamMat.opacity = 0.16 + Math.sin(t * 3) * 0.06;
    },
  });
}

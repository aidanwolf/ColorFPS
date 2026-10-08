// Where to go next. currentObjective() turns progress (colors owned, where you are, the boss) into the
// HUD objective line; buildGuide() lays animated chevrons on the Hub floor from the entrance to the
// door you should take next, with a light column in that doorway.
import * as THREE from 'three';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { regionOf } from './regions.js';

const tag = (c, text) => `<b style="color:${COLORS[c].css}">${text}</b>`;
const FLOOR = 4;

// Floor paths in the Hub (x, z), skirting the raised dais at x -5..5, z -105..-115.
const PATHS = {
  solar: [[0, -103], [-6.5, -103.6], [-23, -112]],
  verdant: [[0, -103], [-6.5, -104], [-10, -112], [-10, -146.5]],
  azure: [[0, -103], [6.5, -103.6], [23, -112]],
};
export const DOORS = {
  solar: { pos: [-24.6, -112], color: YELLOW },
  verdant: { pos: [-10, -148.2], color: GREEN },
  azure: { pos: [24.6, -112], color: BLUE },
  dais: { pos: [0, -110], color: null },
};

export function currentObjective(game) {
  const b = game.blaster, has = (c) => b.has && b.unlocked[c];
  const where = regionOf(game.player.pos);
  if (!b.has) return { html: 'Grab the <b>Chroma Blaster</b> from the pedestal.', color: COLORS[RED].css };
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
  // chevrons: one instanced draw for every path, brightened by a pulse that runs toward the door
  const shape = new THREE.Shape();
  shape.moveTo(-0.55, -0.25);
  shape.lineTo(0, 0.3);
  shape.lineTo(0.55, -0.25);
  shape.lineTo(0.55, 0.05);
  shape.lineTo(0, 0.6);
  shape.lineTo(-0.55, 0.05);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const chevrons = {};
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (const [name, pts] of Object.entries(PATHS)) {
    const marks = [];
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(-(bx - ax), -(bz - az)); // point the chevron along the segment
      for (let d = i ? 0 : 1.2; d < len; d += 1.6) marks.push({ x: ax + ((bx - ax) * d) / len, z: az + ((bz - az) * d) / len, yaw, s: s + d });
      s += len;
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geo, mat, marks.length);
    marks.forEach((k, i) => {
      q.setFromAxisAngle(up, k.yaw);
      mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(k.x, FLOOR + 0.03, k.z), q, one));
      mesh.setColorAt(i, new THREE.Color(0));
    });
    mesh.visible = false;
    group.add(mesh);
    chevrons[name] = { mesh, marks, total: s, color: new THREE.Color(COLORS[DOORS[name].color].hex) };
  }
  // a light column in the target doorway (or over the dais)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 14, 20, 1, true), beamMat);
  beam.visible = false;
  group.add(beam);
  W.scene.add(group);

  const col = new THREE.Color();
  let t = 0;
  W.add({
    update(dt, player) {
      t += dt;
      const inHub = regionOf(player.pos) === 'hub' && player.pos.y < FLOOR + 6;
      const goal = currentObjective(game).door;
      for (const [name, c] of Object.entries(chevrons)) {
        const on = inHub && goal === name;
        c.mesh.visible = on;
        if (!on) continue;
        c.marks.forEach((k, i) => {
          const wave = Math.pow(Math.max(0, Math.sin((k.s / 6 - t * 1.6) * Math.PI)), 6); // pulses run toward the door
          c.mesh.setColorAt(i, col.copy(c.color).multiplyScalar(0.35 + 1.4 * wave));
        });
        c.mesh.instanceColor.needsUpdate = true;
      }
      const door = goal && DOORS[goal];
      beam.visible = !!(inHub && door);
      if (beam.visible) {
        beam.position.set(door.pos[0], FLOOR + 7, door.pos[1]);
        beamMat.color.set(door.color === null ? 0xffffff : COLORS[door.color].hex);
        beamMat.opacity = 0.16 + Math.sin(t * 3) * 0.06;
      }
    },
  });
}

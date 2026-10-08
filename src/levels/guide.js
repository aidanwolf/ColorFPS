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
// ---- wayfinding (playtest pass): extra lead-ins, e.g. from where you land after dropping off a balcony
const EXTRA_PATHS = {
  verdant: [[[-18.6, -136], [-12, -143], [-10, -146.5]]], // back from Solar: off the west balcony
};
// chevrons also show from the balconies (y 12), so you can see where to go before you drop
const GUIDE_MAX_Y = 16;
const DOORS = {
  solar: { pos: [-24.6, -112], color: YELLOW },
  verdant: { pos: [-10, -148.2], color: GREEN },
  azure: { pos: [24.6, -112], color: BLUE },
  dais: { pos: [0, -110], color: null },
};

// ---- wayfinding (playtest pass): Solar is one long loop, so name the next step for the stretch you're in
const inBox = (p, x1, x2, z1, z2, y1 = -99, y2 = 99) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2 && p.y >= y1 && p.y <= y2;
function solarBefore(p) {
  if (inBox(p, -38, -25, -114, -110)) return `Head through to the ${tag(YELLOW, 'Sunward Overlook')}.`;
  if (inBox(p, -56.5, -37.5, -124, -100, 3.5)) return `Follow the glowing arrows to the deck's far corner, step down the rubble and blast the ${tag(RED, 'red gate')}.`;
  if (inBox(p, -46, -37.5, -100, -89.4, -1)) return `Blast the ${tag(RED, 'red gate')} across the ledge, then hop down the canyon.`;
  if (inBox(p, -60, -34, -100, -66, -6)) return 'Hop down the canyon — the pillar, then the fallen panel — to the <b>Collector Yard</b>.';
  if (inBox(p, -90, -34, -66, -40, -10, 2)) return `Slip west past the <b>sun lances</b> while they cool, then blast the ${tag(RED, 'red gate')} into the Shade Slot.`;
  if (inBox(p, -146, -86, -59, -45, -10, 2)) return 'Run west through the <b>Shade Slot</b>, between the waves of sunlight.';
  if (inBox(p, -194, -146, -100, -42)) return `Hop down the ledges of the <b>Sun Well</b> to the ${tag(YELLOW, 'SOLAR core')} on the pillar.`;
  return '';
}
function solarAfter(p, st) {
  if (inBox(p, -194, -146, -102, -42)) return `Blast the ${tag(YELLOW, 'yellow door')} at the end of the causeway behind the core.`;
  if (inBox(p, -168, -164, -124, -102)) return `Break the barriers with their own colors: ${tag(RED, 'red')} and ${tag(YELLOW, 'yellow')} (<b>1</b>/<b>2</b> to switch).`;
  if (inBox(p, -184, -148, -150, -124, -21, -5))
    return st && !st.lift1.active ? `Power the lift: fire ${tag(YELLOW, 'yellow')} <b>over the glass</b> at the receiver in the north wall.` : 'Ride the lift in the east corner up to the terrace.';
  if (inBox(p, -148, -118, -170, -124, -5, 2))
    return st && !st.lift2.active ? `Shoot the ${tag(YELLOW, 'yellow solar panel')} on the mesa wall to power the lift.` : 'Ride the lift up the <b>Gnomon Mesa</b>.';
  if (inBox(p, -122, -86, -170, -152, 2, 20)) return 'Climb the ledges to the <b>jump pad</b>: it throws you west, onto the summit — let go of the keys as it fires.';
  if (inBox(p, -118, -98, -162, -132, 20)) return `Drop down the stone chimney at the summit's east edge — shoot ${tag(RED, 'red')}, then ${tag(YELLOW, 'yellow')}, as you fall.`;
  if (inBox(p, -98, -93, -140, -132, 11, 20)) return `Fall through the chimney: shoot each spike layer once you're past its shield — ${tag(RED, 'red')}, then ${tag(YELLOW, 'yellow')}.`;
  if (inBox(p, -93, -25, -141, -131, 11, 20)) return `Cross the <b>Sunset Causeway</b> back to the Nexus.`;
  return '';
}

export function currentObjective(game) {
  const b = game.blaster, has = (c) => b.has && b.unlocked[c];
  const where = regionOf(game.player.pos);
  if (!b.has) return { html: 'Grab the <b>Chroma Blaster</b> from the pedestal.', color: COLORS[RED].css };
  if (!has(YELLOW)) {
    if (where === 'red') return { html: `Fight north through the ${tag(RED, 'Crimson Foundry')} to the Nexus.`, color: COLORS[RED].css };
    if (where === 'solar') return { html: solarBefore(game.player.pos) || `Find the ${tag(YELLOW, 'SOLAR core')} somewhere below the mesas.`, door: null };
    return { html: `Enter the ${tag(YELLOW, 'SOLAR wing')}: the open yellow door on the <b>west</b> side of the Nexus.`, door: 'solar' };
  }
  if (!has(GREEN)) {
    if (where === 'solar') return { html: solarAfter(game.player.pos, game.level.solarState) || `${tag(YELLOW, 'Solar')} restored. Climb back up to the Nexus.` };
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
  for (const [name, path] of Object.entries(PATHS)) {
    const marks = [];
    let total = 0;
    // a door may have extra lead-ins (EXTRA_PATHS), each pulsing from its own start
    for (const pts of [path, ...(EXTRA_PATHS[name] || [])]) {
      let s = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
        const yaw = Math.atan2(-(bx - ax), -(bz - az)); // point the chevron along the segment
        for (let d = i ? 0 : 1.2; d < len; d += 1.6) marks.push({ x: ax + ((bx - ax) * d) / len, z: az + ((bz - az) * d) / len, yaw, s: s + d });
        s += len;
      }
      total = Math.max(total, s);
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
    chevrons[name] = { mesh, marks, total, color: new THREE.Color(COLORS[DOORS[name].color].hex) };
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
      const inHub = regionOf(player.pos) === 'hub' && player.pos.y < GUIDE_MAX_Y;
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

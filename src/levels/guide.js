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
export const DOORS = {
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

// ---- Verdant (one loop; green is picked up in the Seed Vault halfway): the next step for the stretch you're in
function verdantObjective(game) {
  const p = game.player.pos, v = game.level.verdant || {}, green = game.blaster.unlocked[GREEN];
  const fought = (e) => e && e.state !== 'armed' && e.state !== 'cleared';
  if (game.isWorldDown?.('verdant')) {
    if (p.y > 11 && p.x > 7.5 && p.x < 12.5) return 'Follow the aqueduct home to the Nexus: blast each gate with its color.';
    return `The engine is dead. Take the <b>bridge west</b> from the courtyard's south gate and the aqueduct home.`;
  }
  if (!green) {
    if (p.y > 11 && p.z > -158.5 && p.x > 7) return `A dead end from this side. Drop to the Nexus floor and take the ${tag(YELLOW, 'yellow gate')} in the north wall.`;
    if (p.z > -172) return `Cross the sludge moat: hop the stones, breaking the ${tag(RED, 'red')} and ${tag(YELLOW, 'yellow')} spikes on them first.`;
    if (p.z > -203 && p.y > 3) {
      if (p.x < -14.5 && p.z > -184) return `Break the spikes on each stone with its own color, then hop on to the island.`;
      if (p.x < 0.5) return 'Hop east over the crumbling stones to the second island. <b>Don\'t stop on the last one.</b>';
      return `Ride the raft north to the bank: <b>keep shooting it</b> ${tag(RED, 'red')}.`;
    }
    if (p.z > -214 && p.y > 3) {
      if (fought(v.bankFight)) return 'Ambush! Clear the bank.';
      return `Head for the gateway at the bank's <b>west</b> end and the root bridge beyond.`;
    }
    if (p.x > -26 && p.x < -22 && p.z > -246 && p.y > 3) return 'Swing each root arm with its color until it <b>points back at you</b>, then walk out along it.';
    if (p.x > -60 && p.z < -244 && p.y > -1 && p.x > -50) return 'Cross the walkway west. <b>Sprint</b> over its sagging middle.';
    if (p.x > -60 && p.z < -244 && p.y > -11) return `Shoot the ${tag(RED, 'red')} and ${tag(YELLOW, 'yellow')} orbs, then hop down the phase stones while they hold.`;
    if (p.x > -44 && p.y > -21) return 'Hop down the root steps west to the dock.';
    if (p.x > -60) return 'Into the <b>greenhouse</b> through the tunnel in the west wall.';
    if (p.z > -299.5) return fought(v.greenhouse) ? 'Clear the <b>Greenhouse</b>.' : 'On through the north door to the <b>Seed Vault</b>.';
    if (v.cage && !v.cage()) {
      if (p.y > -21) return `Bank ${tag(YELLOW, 'yellow')} off the <b>mirrored leaf</b> above the cage so it drops onto the cage floor.`;
      return 'Shoot the arrows beside each ledge on the west wall to line the four up into a <b>staircase</b> to the balcony.';
    }
    return `Take the ${tag(GREEN, 'VERDANT core')} from the cage.`;
  }
  if (p.x < -69.5 && p.z < -299.5) return `Stand on the ${tag(GREEN, 'green riser')} by the east wall and <b>hold fire on it</b> to climb to the door.`;
  if (p.x < -61 && p.z < -324 && p.z > -334) return `Burst each spore membrane with ${tag(GREEN, 'green')}, then ride the pad under it.`;
  if (p.z < -315 && p.y > 13) {
    if (p.x < -27) return `Cross the chroma vines with your blaster on ${tag(GREEN, 'green')}.`;
    if (p.x < -6) return 'Run the bough to the far platform — <b>don\'t stop</b>.';
    return `${tag(GREEN, 'Green')} builds the near stone, ${tag(YELLOW, 'yellow')} the far one: jump, then shoot yellow in mid-air.`;
  }
  if (p.z < -301 && p.z > -315 && p.y > 15) return 'Ride the jump pad onto the <b>Great Tree\'s crown</b>.';
  if (p.y > 20 && p.y < 23.5 && p.z > -271) return 'A quiet nest. The pad takes you back up.';
  if (p.y > 25 && Math.abs(p.x) < 14.5) {
    if (fought(v.crownFight)) return 'Clear the <b>Crown Nest</b>.';
    return `Drop down the shaft at the deck's <b>north-east</b> corner: fire through each film's open end, ${tag(GREEN, 'green')}, ${tag(YELLOW, 'yellow')}, ${tag(RED, 'red')}.`;
  }
  if (p.x > 13.5 && p.x < 20.6 && p.z < -294.5 && p.z > -301.5) return `Fire through each film's open end as you fall: ${tag(GREEN, 'green')}, ${tag(YELLOW, 'yellow')}, ${tag(RED, 'red')}.`;
  if (p.x > 20 && p.x < 40 && p.z < -296 && p.z > -300) return `Keep the ${tag(GREEN, 'green sinker')} door shot down as you run at it.`;
  if (p.x > 40 && p.x < 58.5 && p.z < -276 && p.z > -300.5) return `Push the raft south with ${tag(GREEN, 'green')}; swing the gates out of its lane with ${tag(YELLOW, 'yellow')} and ${tag(RED, 'red')}.`;
  const boss = v.arena?.boss;
  if (p.x > 60.8 && p.x < 107.2 && p.z < -246.8 && p.z > -293.2) {
    if (boss?.defeated) return `The Heart is exposed: shut it down with ${tag(GREEN, 'green')}.`;
    return boss?.state === 'dormant' ? 'Into the courtyard.' : '';
  }
  return 'Through the courtyard gate: the guardian of the <b>Verdant Heart</b> waits.';
}

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
    if (where === 'solar') return { html: solarBefore(game.player.pos) || `Find the ${tag(YELLOW, 'SOLAR core')} somewhere below the mesas.`, door: null };
    return { html: `Enter the ${tag(YELLOW, 'SOLAR wing')}: the open yellow door on the <b>west</b> side of the Nexus.`, door: 'solar' };
  }
  if (!has(GREEN)) {
    if (where === 'solar') return { html: solarAfter(game.player.pos, game.level.solarState) || `${tag(YELLOW, 'Solar')} restored. Climb back up to the Nexus.` };
    if (where === 'verdant') return { html: verdantObjective(game) };
    return { html: `Blast open the ${tag(GREEN, 'VERDANT gate')} on the <b>north</b> wall with ${tag(YELLOW, 'yellow')}.`, door: 'verdant' };
  }
  if (!has(BLUE)) {
    if (where === 'verdant') return { html: verdantObjective(game) };
    if (where === 'azure') {
      const p = game.player.pos;
      if (p.y < -50 && p.z < -157.5) return { html: `Free the vault door: fire ${tag(YELLOW, 'yellow')} over the glass in the west alcove; the azure panels carry it to the target.` };
      if (p.y < -50) return { html: `Take the ${tag(BLUE, 'AZURE core')}.` };
      if (p.x < 66.5 && p.y < -24) return { html: 'Work down the ice pillars to the hole, then drop through the spike shaft: <b>each layer opens to its own color</b>.' };
      if (p.y < -23.5) return { html: 'Cross the Cryo Lab and run the three-color gauntlet <b>west</b> to the Well.' };
      if (p.y < -6 || p.x > 98) return { html: 'Ride the freight lift down, then cross the frozen pipes to the <b>Cryo Lab</b>.' };
      return { html: 'Hop down the ice ledges to the <b>Pump Station</b>. Clear spikes with their own color before you land.' };
    }
    return { html: `Blast open the ${tag(BLUE, 'AZURE gate')} on the <b>east</b> wall with ${tag(GREEN, 'green')}.`, door: 'azure' };
  }
  const boss = game.level.boss;
  if (game.state === 'victory' || boss?.dead || boss?.state === 'dead') return { html: '' };
  if (where === 'azure') {
    const p = game.player.pos, lift = game.level.azure?.lift;
    if (p.y > 10) return { html: 'Walk out onto the Nexus balcony.' };
    if (lift && (lift.state === 'armed' || lift.state === 'moving')) return { html: 'Shoot every hatch above you before the lift carries you into it!' };
    return { html: `Head <b>west</b> through the ${tag(BLUE, 'blue lock')} and ride the station lift up to the Nexus.` };
  }
  // (no objective during the fight: the boss bar and its hints own the top of the screen)
  if (where === 'prism') return { html: boss?.active ? '' : 'Follow the light down the corridor into the arena. <b>The Warden waits.</b>' };
  if (game.level.prismElevator?.enabled) return { html: 'The Prism Core is open: step onto the lift in the middle of the dais and ride it down.', door: 'dais' };
  return { html: 'Shoot each <b>color lock</b> on the central dais with its own color, then ride the lift down to the <b>Prism Core</b>.', door: 'dais' };
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

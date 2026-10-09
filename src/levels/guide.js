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
const TARGETS = { solar: [-23, -112], verdant: [-10, -146.5], azure: [23, -112], dais: [0, -104.6], red: [0, -101.5] };
const DAIS = { x1: -6.4, x2: 6.4, z1: -116.4, z2: -103.6 };
const GALLERY_Y = 12;
export const DOORS = {
  solar: { pos: [-24.6, -112], color: YELLOW },
  verdant: { pos: [-10, -148.2], color: GREEN },
  azure: { pos: [24.6, -112], color: BLUE },
  dais: { pos: [0, -110], color: null },
  red: { pos: [0, -100.2], color: RED }, // (only when the Foundry's core was left burning: see STILL_RUNNING)
};
// After the last color: a world whose engine still runs keeps the Warden asleep, so send the player back.
const WORLDS = ['red', 'solar', 'verdant', 'azure'];
const STILL_RUNNING = {
  red: `The ${tag(RED, 'Foundry')}'s core still burns: go back down the <b>south</b> stairs and shut it down.`,
  solar: `The ${tag(YELLOW, 'Solar')} engine still runs: go back in by the <b>west</b> door and shut its sun-lens down.`,
  verdant: `The ${tag(GREEN, 'Verdant')} engine still runs: go back in by the <b>north</b> gate and shut its Heart down.`,
  azure: `The ${tag(BLUE, 'Azure')} engine still runs: go back in by the <b>east</b> door and shut it down.`,
};
const WORLD_NAME = { red: 'the Foundry', solar: 'Solar', verdant: 'Verdant', azure: 'Azure' };

// ---- Solar names the next step for the stretch you're in: solar.js publishes level.solar.objective(pos)
// (it knows its own puzzles' state), so the Solar branches below just ask it.
const solarObjective = (game) => game.level.solar?.objective?.(game.player.pos) || '';

// ---- the Crimson Foundry (red.js): the next step for the stretch you're in, while red is all you have
function foundryObjective(game) {
  const p = game.player.pos, f = game.level.foundry || {};
  const inBox = (q, x1, x2, z1, z2, y1 = -99, y2 = 99) => q.x >= x1 && q.x <= x2 && q.z >= z1 && q.z <= z2 && q.y >= y1 && q.y <= y2;
  const R = (t) => tag(RED, t);
  if (game.isWorldDown?.('red')) return p.z < -55 ? 'The Foundry is cold. <b>North</b>, up the stairs, to the Atrium.' : 'The Foundry is dead. Head <b>north</b> to the Atrium.';
  if (inBox(p, 6, 23, -8, 0.5)) return 'Out of the cell block: <b>west</b>, into the room with the red door.'; // (cellblock.js)
  if (p.z > 0.5) return 'This annex wing needs colors you don\'t have yet. Head back <b>north</b>.';
  if (inBox(p, -6, 6, -12.2, 0)) return `Shoot the ${R('red barrier')} in the north door.`;
  if (inBox(p, -7, 7, -30.5, -12.2)) {
    if (f.innerGate && f.innerGate.state !== 'open' && p.z > -20.5) return `Shoot the ${R('red switch')} above the gate.`;
    if (f.westGate && f.westGate.state !== 'open') return `The lock is behind the glass: bank a ${R('red')} shot off the <b>yellow</b> panels onto it.`;
    return 'Through the <b>west</b> door to the Crucible.';
  }
  if (inBox(p, -44, -9.5, -37, -13)) {
    if (p.x > -16 && p.y < 2) return `Shoot the ${R('spikes')} off the first slab, then hop across the lava.`;
    if (inBox(p, -40, -16, -24, -19)) return `Jump on the raft and <b>keep shooting it</b> to push it west.`;
    if (p.x < -40 && p.z > -24.5) return `Shoot the ${R('orb')} to raise the stepping stones, then run north.`;
    if (p.x < -36) return 'Step on the <b>jump pad</b>: it throws you east.';
    if (p.x < -16) return `Clear the far slab's ${R('spikes')} first, then sprint over the trapdoor.`;
    return 'East, through the door into the <b>Slag Run</b>.';
  }
  if (inBox(p, -10, 9.6, -37.3, -34.2, 2)) return p.x < 4 ? `Spam shots into the ${R('riser')} to raise it, and ride it over the lava.` : `Shoot the ${R('sinker door')} down and walk over it.`;
  if (inBox(p, 9.5, 44, -37.5, -13)) {
    if (p.y > 8.5 && p.z < -33) return 'Through the gate and <b>down the spike shaft</b>.';
    if (p.y > 8.5) return `Shoot the ${R('switch')} on the wall, then race along the catwalk to the exit gate.`;
    if (p.x > 31) return `Shoot the rack's ${R('arrows')} to stair the ledges up to the west landing.`;
    return `Shoot the two ${R('bridge slabs')} until they line up, then cross east.`;
  }
  if (inBox(p, 12.5, 17.5, -43, -38)) return `Shoot each spike layer through its shield's <b>glowing open end</b> as you fall.`;
  if (inBox(p, -20, 20, -55.5, -38)) {
    const st = f.smelting?.state;
    if (st === 'armed') return 'Down onto the <b>Smelting Floor</b>. The Forge is through the north door.';
    return st && st !== 'cleared' ? 'Survive the <b>Smelting Floor</b>: keep moving, shoot everything.' : '<b>North</b>, into the Forge.';
  }
  if (inBox(p, -17.5, 17.5, -90.5, -55.5)) {
    const core = f.forge?.core, titan = f.forge?.titan;
    if (core?.state === 'exposed' || core?.state === 'overload') return `Shoot the ${R('Geothermal Core')} until it overloads.`;
    if (titan && titan.state !== 'dead') return `Defeat the ${R('Forge Titan')}: shoot its glowing weak points.`;
  }
  return '';
}

// ---- Azure (azure.js / azureFlooded.js / azureSpillway.js): name the next step for the stretch you're in
const inBox = (p, x1, x2, z1, z2, y1 = -99, y2 = 99) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2 && p.y >= y1 && p.y <= y2;
function azureBefore(p, game) {
  const st = game.level.azure || {};
  if (inBox(p, 108, 162, -153, -100, -63, 8)) {
    if (inBox(p, 108, 147, -127, -100, -31.5)) return `Swim out along the buoys and dive by the marker: blast the ${tag(RED, 'red grate')} over the pipe.`;
    if (inBox(p, 125.5, 152, -152, -136, -61, -17)) return `Drop a ${tag(GREEN, 'green')} shot into the lit gap beside the glass case: the mirror banks it onto the ballast valve. Then ride the water up.`;
    return 'Follow the <b>cyan lights</b> through the flood; surface in the <b>gold-lit air pockets</b> to breathe.';
  }
  if (inBox(p, 125, 147, -152, -141, -48, -16)) return 'Ride the water up the Ballast Shaft to the way out.';
  if (inBox(p, 107, 126, -149, -145, -26, -21)) return 'Out of the deep: on to the <b>Cryo Lab</b>.';
  if (p.y > 2) return `Hop down the ice ledges east: clear the ${tag(GREEN, 'green spikes')} from the deck first; the first ledge crumbles under you.`;
  if (inBox(p, 58, 99, -107, -80, -4.6)) return `Ride the crane trolley across: keep shooting it ${tag(YELLOW, 'yellow')}.`;
  if (inBox(p, 98, 123, -97, -77, -6, 1)) return `Shoot the freight lift ${tag(GREEN, 'green')} to work it down to the turbine deck.`;
  if (inBox(p, 95, 109, -123, -98, -23, -5)) return 'Clear the turbine deck\'s sentries; the hatch in its <b>east</b> edge opens into the Flooded Depths.';
  if (inBox(p, 88, 116, -176, -142, -26, -16)) return 'Survive the Cryo Lab lockdown, then go <b>west</b> through the three-color gauntlet.';
  if (inBox(p, 66, 88, -172, -168, -26, -21)) return 'Three colors, one corridor: <b>keep switching</b>.';
  if (inBox(p, 50, 66, -182, -158, -47, -17)) return `Work down the ice pillars to the hole, blast its ${tag(RED, 'red')} grate and sink down the flooded pipe: shoot ${tag(YELLOW, 'yellow')}, then ${tag(GREEN, 'green')}.`;
  if (p.y < -50 && p.z < -157.5 && !(st.vaultDoor && st.vaultDoor.openT >= 0)) return `Free the vault door: fire ${tag(YELLOW, 'yellow')} over the glass in the west alcove; the azure panels carry it to the target.`;
  if (p.y < -50) return `Take the ${tag(BLUE, 'AZURE core')} from the sanctum's dais.`;
  return 'Make your way down through the station.';
}
function azureAfter(p, game) {
  const st = game.level.azure || {};
  if (p.y > 10 && p.x < 47) return 'Walk out onto the Nexus balcony.';
  if (game.isWorldDown?.('azure')) {
    if (p.x < 113 && p.y > -9) return 'Ride the pads up across the chasm: <b>shoot the orb over each pad</b> to charge it, then step on.';
    if (inBox(p, 112, 181, -158, -153, -9, -3)) return 'The pressure lock is open: follow the gallery <b>west</b>, out onto the Spillway.';
    if (inBox(p, 133, 187, -222, -157, -32, 12)) return 'The engine is dead. Swim back out to the shore ledge and take the gallery <b>west</b>.';
    return 'Climb back up through the station: the Undercroft, the Sluice, then the Spillway home.';
  }
  if (inBox(p, 52, 80.5, -150, -122, -57, -41)) return `Break the ${tag(BLUE, 'blue door')} in the sanctum's <b>east</b> wall.`;
  if (inBox(p, 80, 113, -152, -140, -60, -48)) return `Cross the Blue Span: stay set to ${tag(BLUE, 'blue')} on the light stones, and shoot the blue switch for the bridge.`;
  if (inBox(p, 112, 158, -195, -144, -70, -43)) return 'Clear the Undercroft, then dive for the <b>gold-lit duct</b> in its east wall.';
  if (inBox(p, 165.5, 181, -169, -157, -65, -3)) { // (the Sluice is x 166..180; the cistern's shore ledge sits just west of it)
    const s = st.sluice;
    if (!s || s.stage === 1) return `Keep firing ${tag(BLUE, 'blue')} into the pump valve on the south wall to flood the Sluice.`;
    if (s.stage === 2) return 'Shoot the <b>arrows</b> on the north wall\'s ledges to set them into a staircase up to the east ledge.';
    if (s.stage === 3) return `Fire ${tag(BLUE, 'blue')} into the valve in the roof and ride the water up — hold <b>Space</b>.`;
    return 'Climb out at the top, through the door in the south wall.';
  }
  if (inBox(p, 112, 181, -158, -153, -9, -3)) return 'The cistern\'s door is in the gallery\'s <b>north</b> wall.';
  if (inBox(p, 133, 187, -222, -157, -32, 12)) {
    if (st.arena?.defeated) return `Shoot the <b>Azure Engine's</b> core with ${tag(BLUE, 'blue')} to shut it down.`;
    return `Charybdis guards the engine. Kill it, then shut the engine down with ${tag(BLUE, 'blue')}.`;
  }
  return 'Climb on through the station to its engine.';
}

// ---- Verdant (one loop; green waits in the Seed Shrine just past the moat): the next step for the stretch you're in
function verdantObjective(game) {
  const p = game.player.pos, v = game.level.verdant || {}, green = game.blaster.unlocked[GREEN];
  const fought = (e) => e && e.state !== 'armed' && e.state !== 'cleared';
  const G = (t) => tag(GREEN, t);
  if (game.isWorldDown?.('verdant')) {
    if (p.y > 11 && p.x > 7.5 && p.x < 12.5) return 'Follow the aqueduct home to the Nexus: blast each gate with its color.';
    return `The engine is dead. Take the <b>bridge west</b> from the courtyard's south gate and the aqueduct home.`;
  }
  if (p.y > 11 && p.z > -158.5 && p.x > 7) return `A dead end from this side. Drop to the Nexus floor and take the ${tag(YELLOW, 'yellow gate')} in the north wall.`;
  if (!green) {
    if (p.z > -172) return 'Cross the sludge moat on the stepping stones.';
    if (p.z > -203 && p.y > 3) {
      if (p.x < -14.5) return 'Hop east over the crumbling stones to the second island. <b>Don\'t stop on the last one.</b>';
      if (p.x < 14) return 'Climb the root stumps <b>north-east</b> onto the great tree\'s plateau.';
      return 'From the plateau\'s north edge, hop down the stone to the bank and the <b>shrine</b>.';
    }
    return `Take the ${G('VERDANT core')} from the shrine's cradle of roots.`;
  }
  // ---- green in hand
  if (fought(v.hive)) return `The hive's awake: clear the bank. ${G('Globs')} burst through clumps; lob them over the parapets.`;
  if (p.z > -214 && p.y > 3 && p.y < 16 && p.x > -30.5 && p.x < 30.5) {
    if (p.z > -203) return v.hive?.state === 'cleared' ? 'The way on is the gateway on the terrace at the bank\'s <b>west</b> end.' : 'Back to the shrine on the far bank.';
    if (p.y < 7.6) return `Up onto the terrace at the <b>west</b> end: look down, then <b>jump and fire a ${G('glob')} together</b>.`;
    if (v.bramble && !v.bramble.broken) return `Burst the brambles in the gateway with a ${G('glob')}.`;
    if (!v.arms?.[0]?.swung) return `Lob a ${G('glob')} over the root wall on the first column: the bulb behind it swings its arm across.`;
    return 'Out along the root arm to the first column.';
  }
  if (p.x > -30.5 && p.x < -20 && p.z > -246.5 && p.y > 6) {
    const next = (v.arms || []).findIndex((a) => !a.swung);
    if (next === 0) return `Lob a ${G('glob')} over the root wall on the first column: the bulb behind it swings its arm across.`;
    if (next === 1) return `Drop a ${G('glob')} into the hollow stump on the next column.`;
    if (next === 2) return `Land one ${G('glob')} between the two bulbs: one burst has to catch both.`;
    return 'Over the last root arm to the ledge beyond.';
  }
  const hollow = p.x > -60 && p.z < -244 && p.z > -292; // the descent down the Hollow's west side
  if (hollow && p.y > 2) return 'Down the stones <b>west</b>, onto the old walkway.';
  if (hollow && p.y > -1 && p.x > -50) return 'Cross the walkway west. <b>Sprint</b> over its sagging middle.';
  if (hollow && p.y > -11) return v.stoneLock?.on ? 'Down the stones while they hold!' : `Splash all three bulbs on the wall shelf with <b>one</b> ${G('glob')}, then hop down the stones while they hold.`;
  if (hollow && p.x > -44 && p.y > -21) return 'Hop down the root steps west to the dock.';
  if (hollow && p.y > -26) return 'Into the <b>greenhouse</b> through the tunnel in the west wall.';
  if (p.x < -60 && p.z > -299.5 && p.y < -20) return fought(v.greenhouse) ? 'Clear the <b>Greenhouse</b>.' : 'On through the north door to the <b>Seed Vault</b>.';
  if (p.x < -69.5 && p.z < -299.5 && p.y < -9) {
    if (v.seed && !v.seed.on) {
      if (p.y > -21) return `Bank a ${G('glob')} off the <b>mirrored leaf</b> so it drops into the Seed's glass cage.`;
      return 'Shoot the arrows beside each ledge on the west wall to line the four up into a <b>staircase</b> to the balcony.';
    }
    return `Stand on the ${G('green riser')} by the east wall and <b>keep globbing it</b> to climb to the door.`;
  }
  if (p.x < -61 && p.z < -324 && p.z > -334) return `Burst each spore membrane with a ${G('glob')}, then ride the pad under it.`;
  if (p.z < -315 && p.y > 13) {
    if (p.x < -30.5) return `Cross the chroma vines with your blaster on ${G('green')}.`;
    if (p.x < -27 && p.y < 18.5) return `Rocket jump onto the high bough: look down, then <b>jump and fire a ${G('glob')} together</b>.`;
    if (p.x < -21 && p.y > 18.5) return 'Bowl the slime molds off the bough with bursts beside them, then drop east onto the long bough.';
    if (p.x < -6) return 'Run the bough to the far platform — <b>don\'t stop</b>.';
    return `${G('Green')} builds the near stone, ${tag(YELLOW, 'yellow')} the far one: jump, then burn yellow in mid-air.`;
  }
  if (p.z < -301 && p.z > -315 && p.y > 15) return v.padNest && !v.padNest.broken ? `Burst the hive nest that's swallowed the jump pad.` : 'Ride the jump pad onto the <b>Great Tree\'s crown</b>.';
  if (p.y > 20 && p.y < 23.5 && p.z > -271) return 'A quiet nest. The pad takes you back up.';
  if (p.y > 25 && Math.abs(p.x) < 14.5) {
    if (fought(v.crownFight)) return 'Clear the <b>Crown Nest</b>.';
    return `Drop down the shaft at the deck's <b>north-east</b> corner: fire through each film's open end, ${G('green')}, ${tag(YELLOW, 'yellow')}, ${tag(RED, 'red')}.`;
  }
  if (p.x > 13.5 && p.x < 20.6 && p.z < -294.5 && p.z > -301.5) return `Fire through each film's open end as you fall: ${G('green')}, ${tag(YELLOW, 'yellow')}, ${tag(RED, 'red')}.`;
  if (p.x > 20 && p.x < 40 && p.z < -296 && p.z > -300) return `Keep the ${G('green sinker')} door globbed down as you run at it.`;
  if (p.x > 40 && p.x < 58.5 && p.z < -276 && p.z > -300.5) return `Blast the raft south with ${G('globs')}; swing the gates out of its lane with ${tag(YELLOW, 'yellow')} and ${tag(RED, 'red')}.`;
  const boss = v.arena?.boss;
  if (p.x > 60.8 && p.x < 107.2 && p.z < -246.8 && p.z > -293.2) {
    if (boss?.defeated) return `The Heart is exposed: shut it down with ${G('green')}.`;
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
    if (where === 'red') return { html: foundryObjective(game) || `Fight north through the ${tag(RED, 'Crimson Foundry')} to the Nexus.`, color: COLORS[RED].css };
    if (where === 'solar') return { html: solarObjective(game) || `Find the ${tag(YELLOW, 'SOLAR core')} somewhere below the mesas.`, door: null };
    return { html: `Enter the ${tag(YELLOW, 'SOLAR wing')}: the open yellow door on the <b>west</b> side of the Nexus.`, door: 'solar' };
  }
  if (!has(GREEN)) {
    if (where === 'solar') return { html: solarObjective(game) || `${tag(YELLOW, 'Solar')} restored. Head back to the Nexus.` };
    if (where === 'verdant') return { html: verdantObjective(game) };
    return { html: `Blast open the ${tag(GREEN, 'VERDANT gate')} on the <b>north</b> wall with ${tag(YELLOW, 'yellow')}.`, door: 'verdant' };
  }
  if (!has(BLUE)) {
    if (where === 'verdant') return { html: verdantObjective(game) };
    if (where === 'azure') return { html: azureBefore(game.player.pos, game) };
    return { html: `Blast open the ${tag(BLUE, 'AZURE gate')} on the <b>east</b> wall with ${tag(GREEN, 'green')}.`, door: 'azure' };
  }
  const boss = game.level.boss;
  if (game.state === 'victory' || boss?.dead || boss?.state === 'dead') return { html: '' };
  if (boss?.active) return { html: '' }; // (the final battle crosses every world: its bar and hints lead)
  if (where === 'azure') return { html: azureAfter(game.player.pos, game) };
  const running = game.isWorldDown ? WORLDS.filter((w) => !game.isWorldDown(w)) : [];
  if (where === 'red' && running.includes('red')) return { html: foundryObjective(game) || STILL_RUNNING.red, color: COLORS[RED].css };
  if (where === 'solar' && running.includes('solar')) return { html: solarObjective(game) || STILL_RUNNING.solar };
  if (where === 'verdant' && running.includes('verdant')) return { html: verdantObjective(game) };
  if (where === 'hub' && running.length) return { html: STILL_RUNNING[running[0]], door: running[0] };
  // (no objective during the fight: the boss bar and its hints own the top of the screen)
  if (where === 'prism' && running.length) {
    const names = running.map((w) => WORLD_NAME[w]).join(' and ');
    return { html: `The Warden sleeps while ${names} still feed${running.length > 1 ? '' : 's'} the machine. Ride the lift back up and <b>shut ${running.length > 1 ? 'them' : 'it'} down</b>.` };
  }
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
      // up on the gallery: lead to the gap in the railing on this side (in front of its return port; the
      // railing runs along the rest of the inner edge), then hop down
      const gx = player.pos.x, gz = player.pos.z;
      const e = gx < -19 ? [-19.4, -136] : gx > 19 ? [19.4, -136] : [10, -143.4];
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
      const inHub = regionOf(player.pos) === 'hub' && player.pos.y > FLOOR - 1.5; // (the sunken plaza's floor is 1.2 m down)
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

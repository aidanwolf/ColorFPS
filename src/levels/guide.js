// Where to go next. currentObjective() turns progress (colors owned, where you are, the boss) into the
// HUD objective line; buildGuide() lays animated chevrons on the Hub floor from the entrance to the
// door you should take next, with a light column in that doorway.
import * as THREE from 'three';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { regionOf } from './regions.js';

const tag = (c, text) => `<b style="color:${COLORS[c].css}">${text}</b>`;
const FLOOR = 4;

// Floor paths in the Hub (x, z), routed round whatever stands on the floor (the research station's rooms,
// columns) and the Prism lift in the middle of the sunken dais (x -2..2, z -126..-122: sealed, then a hole
// while the car is away).
// Where the floor path ends for each goal (just inside its doorway; for the dais, at the lift's edge on
// your side), the lift to route around, and the Hub's return gallery (y 12): from up there the path leads
// to the edge nearest the goal.
const PZ = -124; // the Atrium's centre: the dais, the lift, the Prism, the reactor
const TARGETS = { solar: [-23, -112], verdant: [-10, -146.5], azure: [23, -112], dais: [0, PZ + 2.9], red: [0, -101.5] };
const DAIS = { x1: -2.7, x2: 2.7, z1: PZ - 2.7, z2: PZ + 2.7 };
const GALLERY_Y = 12;
export const DOORS = {
  solar: { pos: [-24.6, -112], color: YELLOW },
  verdant: { pos: [-10, -148.2], color: GREEN },
  azure: { pos: [24.6, -112], color: BLUE },
  dais: { pos: [0, PZ], color: null },
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
// before the core: the descent through the rain, platforming only
function azureBefore(p) {
  if (p.y > 2) return `Hop down the ice ledges east: clear the ${tag(GREEN, 'green spikes')} from the deck first; the first ledge crumbles under you.`;
  if (inBox(p, 58, 99, -107, -80, -4.6)) return `Ride the crane trolley across: keep shooting it ${tag(YELLOW, 'yellow')}.`;
  if (inBox(p, 98, 123, -97, -77, -6, 1)) return `Shoot the freight lift ${tag(GREEN, 'green')} to work it down to the turbine deck.`;
  if (inBox(p, 91, 109, -123, -98, -23, -5)) return `Take the ${tag(BLUE, 'AZURE core')} from the dais on the turbine deck.`;
  return 'Make your way down the station through the rain.';
}
// with blue in hand: the water cannon's world
function azureAfter(p, game) {
  const st = game.level.azure || {};
  const W = (t) => tag(BLUE, t);
  if (p.y > 10 && p.x < 47) return 'Walk out onto the Nexus balcony.';
  if (game.isWorldDown?.('azure')) {
    if (p.x < 113 && p.y > -9) return 'Ride the pads up across the chasm: <b>shoot the orb over each pad</b> to charge it, then step on.';
    if (inBox(p, 112, 181, -158, -153, -9, -3)) return 'The pressure lock is open: follow the gallery <b>west</b>, out onto the Spillway.';
    if (inBox(p, 133, 187, -222, -157, -32, 12)) return 'The engine is dead. Swim back out to the shore ledge and take the gallery <b>west</b>.';
    return 'Climb back up through the station: the Undercroft, the Sluice, then the Spillway home.';
  }
  // the turbine deck and the Storm Deck
  const storm = st.stormDeck;
  if (inBox(p, 91, 109, -123, -98, -23, -5)) {
    if (storm && storm.state === 'cleared') return 'The hatch has thawed: <b>east</b>, into the cliff.';
    return `Too far to jump dry: ${W('hose a long slick')} down the deck, then <b>sprint</b> along it and leap to the Storm Deck.`;
  }
  if (inBox(p, 60, 91, -124, -99, -23, -10)) {
    if (storm && storm.state !== 'cleared' && storm.state !== 'armed') return `Soak the floor under the robots and ${W('hose a junction box')} to short it into them. Keep your feet dry.`;
    if (storm && storm.state === 'cleared') return 'Back over the gantry to the turbine deck, and in through the hatch.';
    return 'Clear the Storm Deck.';
  }
  // (the corridor out of the Ballast Shaft lies inside the Flooded Depths' box)
  if (inBox(p, 107, 126, -149, -145, -26, -21)) return 'Out of the deep: on to the <b>Cryo Lab</b>.';
  // the Flooded Depths
  if (inBox(p, 108, 162, -153, -100, -63, 8)) {
    if (inBox(p, 108, 147, -127, -100, -31.5)) {
      if (st.pipeHatch && st.pipeHatch.state === 'closed') return `The maintenance seal can work the valve on the north shelf: ${W('hose it a trail of puddles')} along the shelf.`;
      return 'Swim out along the buoys and dive by the marker, down the open pipe.';
    }
    if (inBox(p, 125.5, 152, -152, -136, -61, -17) && st.ballast?.flooding) return 'Ride the water up the shaft (hold <b>Space</b>), then out up the steps by the <b>west</b> wall.';
    if (inBox(p, 125.5, 152, -152, -136, -61, -17)) return `Drop a ${tag(GREEN, 'green')} shot into the lit gap beside the glass case: the mirror banks it onto the ballast valve. Then ride the water up.`;
    return 'Follow the <b>cyan lights</b> through the flood; surface in the <b>gold-lit air pockets</b> to breathe.';
  }
  if (inBox(p, 125, 147, -152, -141, -48, -16)) return 'Ride the water up the Ballast Shaft to the way out.';
  // the Cryo Lab
  if (inBox(p, 88, 116, -176, -142, -26, -16)) {
    const lab = st.lab;
    if (lab && lab.state !== 'armed' && lab.state !== 'cleared') return `Fight off the lab's sentries — and keep ${W('filling the tanks')} between shots.`;
    if (st.labGate && !st.labGate.open) return `Fill ${W('both hanging tanks')} with the water cannon: their weight hauls the west gate up. They leak: top them both up together.`;
    return 'Through the gate <b>west</b>.';
  }
  if (inBox(p, 66, 88, -178, -162, -26, -18)) {
    if (st.breaker && !st.breaker.tripped) return `The floor is live: cross on the insulated grates, break the ${tag(GREEN, 'green cage')} on the far wall's breaker and ${W('hose the breaker')} to drop the forcefield.`;
    return 'The forcefield is down: on <b>west</b>, into the Well.';
  }
  if (inBox(p, 50, 66, -182, -158, -47, -17)) return `Work down the ice pillars to the hole, blast its ${tag(RED, 'red')} grate and sink down the flooded pipe: shoot ${tag(YELLOW, 'yellow')}, then ${tag(GREEN, 'green')}.`;
  if (p.y < -50 && p.z < -157.5 && p.x < 67 && !(st.vaultDoor && st.vaultDoor.openT >= 0)) return `Free the vault door: fire ${tag(YELLOW, 'yellow')} over the glass in the west alcove; the azure panels carry it to the target.`;
  if (inBox(p, 52, 80.5, -158, -121, -57, -41)) {
    const d = st.dynamo;
    if (d && !d.defeated && d.state !== 'dormant') return d.state === 'stunned' ? `It's overloaded: ${W('hose its core')}!` : `Soak the floor where the Dynamo walks, then ${W('hose a conduit')} to short the surge into it.`;
    if (d && d.defeated) return `Break the ${W('blue door')} in the sanctum's <b>east</b> wall.`;
    return 'Into the sanctum.';
  }
  if (inBox(p, 80, 113, -152, -140, -60, -48)) return `Hose the runway into a slick and ${W('sprint-leap')} the gap; then the ${W('blue switch')} for the bridge.`;
  if (inBox(p, 112, 158, -195, -144, -70, -43)) {
    const u = st.undercroft, seal = st.winchSeal;
    if (u && u.state !== 'cleared') return 'Clear the Undercroft\'s hunters, above the water and below it.';
    if (seal && !seal.worked) return `${W('Hose a trail')} down the east walkway for the maintenance seal to the duct's winch — and keep the crawlers off it.`;
    return 'Dive for the <b>gold-lit duct</b> in the east wall.';
  }
  if (inBox(p, 165.5, 181, -169, -157, -65, -3)) { // (the Sluice is x 166..180; the cistern's shore ledge sits just west of it)
    const s = st.sluice;
    if (!s || s.stage === 1) return `Keep ${W('hosing the pump valve')} on the south wall to flood the Sluice.`;
    if (s.stage === 2) return 'Shoot the <b>arrows</b> on the north wall\'s ledges to set them into a staircase up to the east ledge.';
    if (s.stage === 3) return `${W('Hose the valve in the roof')} and ride the water up — hold <b>Space</b>.`;
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
  const hollow = p.x > -60 && p.x < -18 && p.z < -244 && p.z > -292; // the descent down the Hollow's west side (not the crown deck above the tree)
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
    if (where === 'solar') return { html: solarObjective(game) || `Find the ${tag(YELLOW, 'SOLAR core')}: down the dig shaft beyond the overlook.`, door: null };
    return { html: `Enter the ${tag(YELLOW, 'SOLAR wing')}: the open yellow door on the <b>west</b> side of the Nexus.`, door: 'solar' };
  }
  if (!has(GREEN)) {
    if (where === 'solar') return { html: solarObjective(game) || `${tag(YELLOW, 'Solar')} restored. Head back to the Nexus.` };
    if (where === 'verdant') return { html: verdantObjective(game) };
    return { html: `Blast open the ${tag(GREEN, 'VERDANT gate')} on the <b>north</b> wall with ${tag(YELLOW, 'yellow')}.`, door: 'verdant' };
  }
  if (!has(BLUE)) {
    if (where === 'verdant') return { html: verdantObjective(game) };
    if (where === 'azure') return { html: azureBefore(game.player.pos) };
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
  if (game.level.prismElevator?.enabled) return { html: 'The Prism Core is open: step onto the lift in the middle of the dais, under the reactor, and ride it down.', door: 'dais' };
  return { html: 'Shoot each <b>color lock</b> around the lift in the sunken dais with its own color, then ride the lift down to the <b>Prism Core</b>.', door: 'dais' };
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
  let marks = [], t = 0, rebuildT = 0, lastGoal = null, lastX = 0, lastY = 0, lastZ = 0;
  // Floor routes: A* over a grid of the Hub floor, blocked wherever a solid stands in the way at walking
  // height (walls, columns, the research station's desks, partitions and glass: hubOffices.js) or over the
  // Prism lift, then pulled taut into straight runs. Built the first time it's needed (every solid exists).
  const G = { x0: -24.5, z0: -148, cell: 0.25, nx: 196, nz: 192, pad: 0.3 };
  let grid = null;
  const cellOf = (x, z) => [Math.floor((x - G.x0) / G.cell), Math.floor((z - G.z0) / G.cell)];
  const centre = (i, j) => [G.x0 + (i + 0.5) * G.cell, G.z0 + (j + 0.5) * G.cell];
  const blocked = (i, j) => i < 0 || j < 0 || i >= G.nx || j >= G.nz || grid[j * G.nx + i] === 1;
  const buildGrid = () => {
    grid = new Uint8Array(G.nx * G.nz);
    // a level can ask for its walking lanes to be preferred: W.laneCost(x, z) >= 1 per cell (hubOffices.js)
    if (W.laneCost) {
      G.cost = new Float32Array(grid.length);
      for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) G.cost[j * G.nx + i] = W.laneCost(...centre(i, j));
    }
    G.gs = new Float32Array(grid.length);
    G.from = new Int32Array(grid.length);
    G.done = new Uint8Array(grid.length);
    const fill = (x1, z1, x2, z2) => {
      const [i1, j1] = cellOf(x1, z1), [i2, j2] = cellOf(x2, z2);
      for (let j = Math.max(0, j1); j <= Math.min(G.nz - 1, j2); j++) for (let i = Math.max(0, i1); i <= Math.min(G.nx - 1, i2); i++) grid[j * G.nx + i] = 1;
    };
    for (const s of W.solids) {
      if (!s.static || s.noCollide || s.max.y < FLOOR + 0.5 || s.min.y > FLOOR + 1.6) continue; // (noCollide: shot proxies you walk through)
      if (s.max.x < G.x0 - 1 || s.min.x > -G.x0 + 1 || s.max.z < G.z0 - 1 || s.min.z > -100 + 1) continue;
      fill(s.min.x - G.pad, s.min.z - G.pad, s.max.x + G.pad, s.max.z + G.pad);
    }
    fill(DAIS.x1, DAIS.z1, DAIS.x2 - 0.01, DAIS.z2 - 0.01);
  };
  // nearest open cell to (i, j) (you can stand closer to a wall than the padding allows)
  const free = (i, j) => {
    for (let r = 0; r < 8; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && !blocked(i + di, j + dj)) return [i + di, j + dj];
    return null;
  };
  // can you walk straight from cell a to cell b? (every cell the segment touches is open)
  // (with lane costs, a shortcut mustn't leave the lanes its ends are in)
  const clear = (a, b) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2) + 1;
    const lim = G.cost ? Math.max(G.cost[a[1] * G.nx + a[0]] || 1, G.cost[b[1] * G.nx + b[0]] || 1) : 0;
    for (let k = 0; k <= n; k++) {
      const i = Math.round(a[0] + ((b[0] - a[0]) * k) / n), j = Math.round(a[1] + ((b[1] - a[1]) * k) / n);
      if (blocked(i, j) || (G.cost && G.cost[j * G.nx + i] > lim)) return false;
    }
    return true;
  };
  const route = (a, b) => {
    if (!grid) buildGrid();
    const s0 = free(...cellOf(a[0], a[1])), g0 = free(...cellOf(b[0], b[1]));
    if (!s0 || !g0) return [a, b];
    if (clear(s0, g0)) return [a, b];
    // A* (8-connected, no corner cutting), octile heuristic, a binary heap of cells keyed by f (typed arrays).
    // With lane costs (W.laneCost) and both ends in a lane, the search keeps to the lanes; else it may cross
    // anything walkable, paying a lane cell's cost per step.
    const gi = g0[1] * G.nx + g0[0], si = s0[1] * G.nx + s0[0];
    const search = (laneOnly) => {
      const { gs, from, done } = G;
      gs.fill(Infinity);
      from.fill(-1);
      done.fill(0);
      const off = (i, j) => blocked(i, j) || (laneOnly && G.cost[j * G.nx + i] > 1);
      const h = (i, j) => {
        const dx = Math.abs(i - g0[0]), dz = Math.abs(j - g0[1]);
        return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
      };
      const HF = (G.hf ??= new Float32Array(grid.length * 4)), HC = (G.hc ??= new Int32Array(grid.length * 4));
      let n = 0;
      const push = (f, c) => {
        if (n >= HF.length) return;
        let k = n++;
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (HF[p] <= f) break;
          HF[k] = HF[p];
          HC[k] = HC[p];
          k = p;
        }
        HF[k] = f;
        HC[k] = c;
      };
      const pop = () => {
        const top = HC[0], lf = HF[--n], lc = HC[n];
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = -1, mf = lf;
          if (l < n && HF[l] < mf) (m = l), (mf = HF[l]);
          if (r < n && HF[r] < mf) m = r;
          if (m < 0) break;
          HF[k] = HF[m];
          HC[k] = HC[m];
          k = m;
        }
        HF[k] = lf;
        HC[k] = lc;
        return top;
      };
      gs[si] = 0;
      push(h(...s0), si);
      while (n > 0) {
        const c = pop();
        if (done[c]) continue;
        done[c] = 1;
        if (c === gi) return true;
        const ci = c % G.nx, cj = (c - ci) / G.nx;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = ci + di, nj = cj + dj;
            if (off(ni, nj) || (di && dj && (off(ci + di, cj) || off(ci, cj + dj)))) continue;
            const k = nj * G.nx + ni, g = gs[c] + (di && dj ? 1.4142 : 1) * (G.cost && !laneOnly ? G.cost[k] : 1);
            if (g < gs[k]) {
              gs[k] = g;
              from[k] = c;
              push(g + h(ni, nj), k);
            }
          }
      }
      return false;
    };
    const inLanes = G.cost && G.cost[si] <= 1 && G.cost[gi] <= 1;
    const found = (inLanes && search(true)) || search(false);
    if (!found) return [a, b];
    const cells = [];
    for (let c = gi; c !== -1; c = G.from[c]) cells.push([c % G.nx, Math.floor(c / G.nx)]);
    cells.reverse();
    // pull it taut: from each corner, jump to the farthest cell still in a straight line
    const pts = [a];
    let k = 0;
    while (k < cells.length - 1) {
      let m = cells.length - 1;
      while (m > k + 1 && !clear(cells[k], cells[m])) m--;
      if (m < cells.length - 1) pts.push(centre(...cells[m]));
      k = m;
    }
    pts.push(b);
    return pts;
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
      let end = tgt;
      if (goal === 'dais') {
        // to the middle of the lift's nearest edge (a lock sits on each one's channel, just beyond it)
        const dx = player.pos.x, dz = player.pos.z - PZ, k = 2.9;
        end = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx) * k, PZ] : [0, PZ + (dz < 0 ? -k : k)];
      }
      pts = route([player.pos.x, player.pos.z], end);
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
        // (standing still, the path hasn't changed)
        if (goal !== lastGoal || Math.abs(player.pos.x - lastX) + Math.abs(player.pos.z - lastZ) + Math.abs(player.pos.y - lastY) > 0.25) {
          lastGoal = goal;
          lastX = player.pos.x;
          lastY = player.pos.y;
          lastZ = player.pos.z;
          rebuild(player, goal);
        }
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

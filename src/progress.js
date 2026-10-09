// Where a save stands, for the title's Continue card: a name for its checkpoint, which checkpoint it is
// (in route order) out of all of them, and how far through the whole game that is.
// Route order: the cell block and Foundry, the Atrium, then Solar, Verdant, Azure, the Prism Core and the
// finale's stages; inside each area, the order its checkpoints were built in (each world file is laid
// out along its route). Progress: each world is a share of the bar, filled by how far through its
// checkpoints you are; worlds you've shut down count in full.
import * as THREE from 'three';
import { regionOf, FINALE_X } from './levels/regions.js';

const ROUTE = ['red', 'hub', 'solar', 'verdant', 'azure', 'prism', 'fin_red', 'fin_solar', 'fin_verdant', 'fin_azure', 'fin_heart'];
// [start, share] of the bar per area (the Atrium sits between worlds and adds nothing of its own)
const SPAN = {
  red: [0, 18], solar: [18, 20], verdant: [38, 20], azure: [58, 20], prism: [78, 4],
  fin_red: [82, 3.5], fin_solar: [85.5, 3.5], fin_verdant: [89, 3.5], fin_azure: [92.5, 3.5], fin_heart: [96, 4],
};
const WORLDS = ['red', 'solar', 'verdant', 'azure'];
export const AREA_NAMES = {
  red: 'Crimson Foundry', hub: 'The Prism Atrium', solar: 'Sunscorch Mesa', verdant: 'Emerald Hollow', azure: 'The Cold Deep',
  prism: 'Prism Core', fin_red: 'Prism Core', fin_solar: 'Prism Core', fin_verdant: 'Prism Core', fin_azure: 'Prism Core', fin_heart: 'Prism Core',
};
export const AREA_COLORS = {
  red: '#ff3344', hub: '#4ff0ff', solar: '#ffc23a', verdant: '#3dff7a', azure: '#3a8bff', prism: '#b46bff',
};

// every checkpoint in the game, route order: { pos, name, region }
function checkpoints(game) {
  const list = [];
  game.world.entities.forEach((e, i) => {
    const n = e.constructor.name;
    const pos = n === 'Checkpoint' ? e.pos : n === 'Encounter' && e.checkpoint?.pos ? new THREE.Vector3(...e.checkpoint.pos) : null;
    if (!pos) return;
    const region = regionOf(pos);
    if (pos.x > 390 && pos.x < FINALE_X) return; // the ?dev test ranges
    if (list.some((c) => c.pos.distanceTo(pos) < 1.5)) return; // (an arena beacon on a checkpoint)
    list.push({ pos, region, name: e.name || (n === 'Encounter' && e.title !== 'AMBUSH' ? e.title : null), i });
  });
  return list.sort((a, b) => ROUTE.indexOf(a.region) - ROUTE.indexOf(b.region) || a.i - b.i);
}


export function saveProgress(game, save) {
  if (!save?.cp?.pos) return null;
  const at = new THREE.Vector3(...save.cp.pos);
  const all = checkpoints(game);
  let best = -1, bd = Infinity;
  all.forEach((c, k) => {
    const d = c.pos.distanceTo(at);
    if (d < bd) (bd = d), (best = k);
  });
  const region = regionOf(at);
  const here = all[best];
  // its name: its own, else the nearest named place in the same area, else the area
  let name = bd < 3 ? here?.name : null;
  if (!name) {
    let pd = 70;
    for (const p of game.level.places || []) {
      const d = p.pos.distanceTo(at);
      if (d < pd && regionOf(p.pos) === region) (pd = d), (name = p.name);
    }
  }
  const area = AREA_NAMES[region] || 'Unknown';
  // the bar: shut-down worlds in full, plus this area's share by checkpoint
  const down = new Set(save.powerDown || []);
  let pct = 0;
  for (const w of WORLDS) if (down.has(w)) pct = Math.max(pct, SPAN[w][0] + SPAN[w][1]);
  const span = SPAN[region];
  if (span && !(WORLDS.includes(region) && down.has(region))) {
    const mine = all.filter((c) => c.region === region);
    const k = Math.max(0, mine.indexOf(here));
    pct = Math.max(pct, span[0] + (span[1] * (k + 1)) / (mine.length + 1));
  }
  if (!save.colors?.length && region === 'red') pct = Math.min(pct, 1); // still in the cell block
  if (save.won) pct = 100;
  return {
    name: name || area.toUpperCase(),
    area,
    color: AREA_COLORS[region] || AREA_COLORS[region.replace('fin_', '')] || AREA_COLORS.prism,
    index: best + 1,
    total: all.length,
    pct: Math.round(Math.min(100, pct)),
  };
}

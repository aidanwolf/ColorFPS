// Select Location (the title's list of places to start from): every start a world module registers
// (devStart in levels/builders.js), grouped by area in route order, with the bosses gathered up front.
// Picking one reloads the page with ?jump=<name>; main.js then skips the save and sets the world up as
// it would be on arriving there (the colors of that start, earlier worlds shut down), and the run is a
// practice run: nothing it does is saved.
import { regionOf, FINALE_X } from './levels/regions.js';
import { AREA_COLORS } from './progress.js';

// friendlier names for starts that don't carry their own label (a devStart's 5th argument)
const LABELS = {
  cell: 'The cell block (new game)',
  red: 'The spawn room',
  red1: 'Proving Hall',
  red2: 'The Crucible',
  crucible: 'The Crucible (west door)',
  red3: 'The Slag Run',
  red4: 'The Gearworks',
  red5: 'The Quench Shaft',
  red6: 'The Smelting Floor (arena)',
  red7: 'The Forge door',
  red8: 'Stairs up to the Atrium (Foundry shut down)',
  redShortcut: 'The Crucible shortcut (yellow)',
  annexGreen: 'Annex: the Slag Works (green)',
  annexBlue: 'Annex: the Smelter (blue)',
  annexConveyor: 'Annex: the conveyor hall',
  annexSmelter: 'Annex: the smelter pit',
  annexPit: 'Annex: the slag pit',
  azure1: 'The Rim Deck',
  azure2: 'The Pump Station',
  azurelab: 'The Cryo Lab porch (arena)',
  azure4: 'The vault antechamber',
  azure5: 'The Core Sanctum',
  azure6: 'The Blue Span',
  azure7: 'Outside the Undercroft',
  azure8: "In the Sluice's water",
  azure9: "The gallery by the cistern's door",
  verdant1: 'The moat: island one',
  verdant2: 'Island two and the raft',
  verdant3: 'The Ruin Bank (ambush)',
  verdant4: 'The root bridge',
  verdant5: 'The Hollow descent',
  verdant6: 'The Greenhouse door',
  verdant7: 'The Seed Vault',
  verdant8: 'The canopy',
  verdant9: 'The phase pair and the crown pad',
  verdant10: 'The Crown Nest',
  verdant11: 'The sinker race and the sluice',
  verdant12: 'The Thornmaw',
  verdant13: 'The way home',
  hub: 'The Prism Atrium',
  boss: 'The Prism Warden (final boss)',
  solar: 'The Solar door',
  verdant: 'The Verdant gate',
  azure: 'The Azure door',
  azurewell: 'The Azure well',
  cistern: "The cistern's shore ledge",
  ascent: 'The Spillway ascent (engine down)',
  flooded: 'The Flooded Depths',
  flooded2: 'The Flooded Depths 2',
  flooded3: 'The Flooded Depths 3',
};
// the four guardians and the finale, wherever their starts are (first match wins)
const BOSSES = [
  { start: ['red7'], label: 'The Forge Titan', area: 'red' },
  { start: ['solar11', 'sun_court', 'sphinx_court'], label: 'The Sphinx', area: 'solar' },
  { start: ['verdant12'], label: 'The Thornmaw', area: 'verdant' },
  { start: ['cistern'], label: 'The Leviathan', area: 'azure' },
  { start: ['boss'], label: 'The Prism Warden', area: 'prism' },
];
// what's already behind you on arriving in each area, in route order
const ROUTE = ['red', 'solar', 'verdant', 'azure'];
const AREAS = [
  ['red', 'Crimson Foundry'],
  ['hub', 'The Prism Atrium'],
  ['solar', 'Sunscorch Mesa'],
  ['verdant', 'Emerald Hollow'],
  ['azure', 'The Cold Deep'],
  ['prism', 'Prism Core'],
  ['dev', 'Test ranges'],
];
// starts that sit after a world's guardian (its power source already shut down)
const AFTER = { red8: ['red'], ascent: ['azure'] };

const areaOf = (s) => {
  if (s.pos.x > 390 && s.pos.x < FINALE_X) return 'dev';
  const r = regionOf(s.pos);
  return r.startsWith('fin_') ? 'prism' : r;
};

// the setup for a start: colors, worlds already shut down, and whether their Atrium feeds have blown
export function jumpSetup(level, name) {
  const s = level.devStarts[name];
  if (!s) return null;
  const area = areaOf(s);
  const i = ROUTE.indexOf(area);
  let down = area === 'red' ? [] : area === 'hub' ? ['red'] : i > 0 ? ROUTE.slice(0, i) : area === 'dev' ? [] : ROUTE.slice();
  down = [...new Set([...down, ...(AFTER[name] || [])])];
  // (a start just past a guardian keeps that world's Atrium feed intact, so walking in shows it blow)
  const feedsBlown = down.filter((w) => !(AFTER[name] || []).includes(w));
  return { start: s, area, down, feedsBlown, label: s.label || LABELS[name] || name };
}

export function buildLocationList(level, el, onPick) {
  const starts = level.devStarts;
  const names = Object.keys(starts);
  el.innerHTML = '';
  const group = (title, color, items) => {
    if (!items.length) return;
    const g = document.createElement('div');
    g.className = 'loc-group';
    g.style.setProperty('--lc', color);
    g.innerHTML = `<div class="loc-title">${title}</div>`;
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'loc';
      b.textContent = it.label;
      b.title = it.name;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(it.name);
      });
      g.appendChild(b);
    }
    el.appendChild(g);
  };
  group(
    'Boss fights',
    '#ff5a22',
    BOSSES.map((b) => ({ name: b.start.find((n) => starts[n]), label: b.label })).filter((b) => b.name),
  );
  for (const [area, title] of AREAS) {
    const items = names
      .filter((n) => areaOf(starts[n]) === area)
      .map((n) => ({ name: n, label: starts[n].label || LABELS[n] || n }));
    // numbered sections in order (solar2 before solar10), the rest as registered
    items.sort((a, b) => {
      const na = +(a.name.match(/(\d+)$/) || [])[1], nb = +(b.name.match(/(\d+)$/) || [])[1];
      return Number.isFinite(na) && Number.isFinite(nb) && a.name.replace(/\d+$/, '') === b.name.replace(/\d+$/, '') ? na - nb : 0;
    });
    group(title, AREA_COLORS[area] || '#8a90a8', items);
  }
}

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
  hub: 'The Prism Atrium',
  boss: 'The Prism Warden (final boss)',
  solar: 'The Solar door',
  dunes: 'The Dune Sea (hover-sled run)',
  dunesEnd: 'The Dune Sea: arrival dock',
  verdant: 'The Verdant gate',
};
// the four guardians and the finale, wherever their starts are (first match wins)
const BOSSES = [
  { start: ['red7'], label: 'The Forge Titan', area: 'red' },
  { start: ['solar23'], label: 'The Sphinx', area: 'solar' },
  { start: ['verdantBoss'], label: 'The Thornmaw', area: 'verdant' },
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
  ['azure', 'The Drowned Reach'],
  ['prism', 'Prism Core'],
  ['dev', 'Test ranges'],
];
// the order a few starts belong in (each list: names in route order; anything not listed keeps the order
// it was registered in, after the listed ones of its area). Registration order alone put the cell block last
// in the Foundry, the Verdant gate after the rope bridge and the moon pool after the Dynamo.
const ROUTE_ORDER = [
  'cell', 'red', 'red1', 'red2', 'crucible', 'red3', 'red4', 'red5', 'red6', 'red7', 'red8', 'redShortcut',
  'solar', 'solar1', 'solar2', 'solar3', 'solar4', 'solar5', 'solar6', 'solar7', 'solar8', 'solar9', 'solar10', 'solar11', 'solar12',
  'temple0', 'temple1', 'solar13', 'temple3', 'solar14', 'solar15', 'solar16', 'solar17', 'solar18', 'solar19', 'solar20', 'solar21',
  'dunes', 'dunesEnd', 'solar22', 'solar23', 'solar24',
  'verdant', 'verdant1', 'verdant2', 'verdant3', 'verdant4', 'verdant5', 'verdant6', 'verdant7', 'verdant8', 'verdant9', 'verdant10', 'verdant11', 'verdant14',
  'azure', 'azure1', 'azure2', 'azure3', 'azure4', 'azureMoon', 'azure5', 'azure6', 'azure7', 'azure8', 'azure9', 'azure10', 'azure11', 'azure12', 'azure13', 'azure14', 'azure15', 'azure16', 'cistern', 'ascent',
];
// starts kept out of the list: the final battle's later arenas (a practice start there has no Warden to fight
// and no way back but Quit; a dev build still reaches them with ?start=finale2)
const HIDDEN = /^finale\d/;
// starts that sit after a world's guardian (its power source already shut down)
const AFTER = { red8: ['red'], solar24: ['solar'], verdantHome: ['verdant'], ascent: ['azure'] };

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
  const names = Object.keys(starts).filter((n) => !HIDDEN.test(n));
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
    // numbered sections in order (solar2 before solar10), the rest as registered; ROUTE_ORDER first.
    // (A key per item, so the sort is consistent: comparing only within a family could reorder the rest.)
    const reg = new Map(names.map((n, i) => [n, i]));
    const fam = new Map();
    for (const n of names) {
      const f = n.replace(/\d+$/, '');
      if (!fam.has(f)) fam.set(f, reg.get(n));
    }
    const key = (n) => {
      const r = ROUTE_ORDER.indexOf(n);
      if (r >= 0) return [0, r, 0];
      const num = +(n.match(/(\d+)$/) || [])[1];
      return [1, fam.get(n.replace(/\d+$/, '')), Number.isFinite(num) ? num : -1];
    };
    items.sort((a, b) => {
      const ka = key(a.name), kb = key(b.name);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || reg.get(a.name) - reg.get(b.name);
    });
    group(title, AREA_COLORS[area] || '#8a90a8', items);
  }
}

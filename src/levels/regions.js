// Which area a point belongs to (matches the region boxes in LAYOUT.md), and which areas can be seen
// from each one. Used to cull whole worlds: from inside a color world only it and the Hub are drawn;
// from the Hub (whose windows look into every world) everything is.
// (Solar and Azure reach north past the Hub's south wall, so the side worlds are tested before the
// Foundry; the Prism Core's antechamber does too, and Verdant widens past the side worlds north of z -232.)
export function regionOf(p) {
  if (p.x > FINALE_X) return finaleRegion(p);
  if (p.z > -38) return 'red'; // the Foundry and its southern annex (nothing else reaches this far south)
  if (p.y < -6 && p.z < -88 && p.z > -176 && Math.abs(p.x) < 31.5) return 'prism';
  if (p.z < -232 || (p.z < -148.5 && Math.abs(p.x) < 31.5)) return 'verdant';
  if (p.x < -25) return 'solar';
  if (p.x > 25) return 'azure';
  if (p.z > -99.5) return 'red';
  return 'hub';
}

// The outdoor worlds can see over their walls into their neighbours (the Foundry's outer walls from
// Solar's mesas, Solar and Azure from Verdant's canopy), so they keep them; only areas that are truly
// enclosed drop the rest. The Foundry is all indoors; the Prism Core is underground.
export const VISIBLE_FROM = {
  red: new Set(['red', 'hub']),
  hub: new Set(['red', 'hub', 'solar', 'verdant', 'azure', 'prism']),
  solar: new Set(['solar', 'hub', 'red', 'verdant']),
  verdant: new Set(['verdant', 'hub', 'solar', 'azure']),
  azure: new Set(['azure', 'hub', 'red', 'verdant']),
  prism: new Set(['prism', 'hub']),
};

// The Prism Warden's final battle drags you through echoes of each world, built far off the map (x > 705,
// see levels/finale). Each stage arena is its own area that sees only itself; the nearest centre wins.
export const FINALE_X = 705; // west of this (x 394-690) are the ?dev test ranges
export const FINALE_STAGES = {
  fin_red: [760, -80],
  fin_solar: [760, -260],
  fin_verdant: [940, -80],
  fin_azure: [940, -260],
  fin_heart: [850, -420],
};
function finaleRegion(p) {
  let best = 'fin_heart', bd = Infinity;
  for (const k in FINALE_STAGES) {
    const [x, z] = FINALE_STAGES[k], d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}
for (const k in FINALE_STAGES) VISIBLE_FROM[k] = new Set([k]);

// Doorways between areas, for the position-driven music/ambience mix: within BLEND m of one, the two
// areas' tracks are mixed by which side you're on and how far (50/50 standing in the doorway).
// n points from area a into area b.
export const PORTALS = [
  { p: [0, 5.6, -99.5], n: [0, 0, -1], a: 'red', b: 'hub' },
  { p: [-25, 5.6, -112], n: [-1, 0, 0], a: 'hub', b: 'solar' },
  { p: [-25, 13.6, -136], n: [-1, 0, 0], a: 'hub', b: 'solar' },
  { p: [-10, 5.6, -148.5], n: [0, 0, -1], a: 'hub', b: 'verdant' },
  { p: [10, 13.6, -148.5], n: [0, 0, -1], a: 'hub', b: 'verdant' },
  { p: [25, 5.6, -112], n: [1, 0, 0], a: 'hub', b: 'azure' },
  { p: [25, 13.6, -136], n: [1, 0, 0], a: 'hub', b: 'azure' },
  { p: [0, -6, -110], n: [0, -1, 0], a: 'hub', b: 'prism' }, // the Prism lift shaft
];
export const PORTAL_BLEND = 6;

// Which area a point belongs to (matches the region boxes in LAYOUT.md), and which areas can be seen
// from each one. Used to cull whole worlds: from inside a color world only it and the Hub are drawn;
// from the Hub (whose windows look into every world) everything is.
export function regionOf(p) {
  if (p.z > -40) return 'red'; // the Foundry and its southern annex (the backtracking challenge rooms)
  // (then the side worlds: Solar and Azure reach as far south as z -40, beside the Foundry)
  if (p.x < -25) return 'solar';
  if (p.x > 25) return 'azure';
  if (p.z > -99.5) return 'red';
  if (p.y < -6 && p.z > -176) return 'prism';
  if (p.z < -148.5) return 'verdant';
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

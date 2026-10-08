// Which area a point belongs to (matches the region boxes in LAYOUT.md), and which areas can be seen
// from each one. Used to cull whole worlds: from inside a color world only it and the Hub are drawn;
// from the Hub (whose windows look into every world) everything is.
export function regionOf(p) {
  // (the side worlds come first: Solar and Azure reach as far south as the Foundry, z -40)
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

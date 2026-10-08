// Which area a point belongs to (matches the region boxes in LAYOUT.md), and which areas can be seen
// from each one. Used to cull whole worlds: from inside a color world only it and the Hub are drawn;
// from the Hub (whose windows look into every world) everything is.
// (Solar and Azure reach north past the Hub's south wall, so the side worlds are tested before the
// Foundry; the Prism Core's antechamber does too, and Verdant widens past the side worlds north of z -232.)
export function regionOf(p) {
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

// Which area a point belongs to (matches the region boxes in LAYOUT.md), and which areas can be seen
// from each one. Used to cull whole worlds: from inside a color world only it and the Hub are drawn;
// from the Hub (whose windows look into every world) everything is.
export function regionOf(p) {
  if (p.z > -99.5) return 'red';
  if (p.x < -25) return 'solar';
  if (p.x > 25) return 'azure';
  if (p.y < -6 && p.z > -176) return 'prism';
  if (p.z < -148.5) return 'verdant';
  return 'hub';
}

export const VISIBLE_FROM = {
  red: new Set(['red', 'hub']),
  hub: new Set(['red', 'hub', 'solar', 'verdant', 'azure', 'prism']),
  solar: new Set(['solar', 'hub']),
  verdant: new Set(['verdant', 'hub']),
  azure: new Set(['azure', 'hub']),
  prism: new Set(['prism', 'hub']),
};

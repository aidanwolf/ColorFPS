// Where Wren Ashby's eighteen audio logs wait (scripts: tools/audio/logs.json, story: src/story/STORY.md).
// One table, in story order: the Atrium first, then Solar, Verdant, Azure and the Prism Core. Her voice
// is first heard in the Prism Atrium: no log goes in the cell block or the Crimson Foundry (or its annex).
//   world: which area it belongs to · pos: the floor point the recorder hovers over (1.15 m up)
//   yaw: which way the recorder faces at first (it slowly turns) · provisional: a placeholder spot
// Every spot is final: the color worlds' were picked by their rebuilds to match each script.
const LOGS = [
  // THE PRISM ATRIUM (final): wonder, on the first visit
  { id: '01', world: 'hub', pos: [-9.4, 4, -102.1], yaw: Math.PI * 0.8 }, // in the day-1 research station just west of the red door: by the party table under the WELCOME TEAM banner (hubOffices.js), open floor east of it for her ghost, the reactor in view
  { id: '02', world: 'hub', pos: [-3.7, 2.8, -127.7], yaw: Math.PI / 4 }, // down in the dais, its north-west corner between the green and yellow locks, right under the reactor heart, where all four feeds can be seen
  { id: '03', world: 'hub', pos: [23.2, 12, -128], yaw: -Math.PI / 2 }, // the east gallery, just off the lift, by Azure's glass conduit
  // SOLAR: Wren's team in the buried matrix, trying to work out how to get into the power source (each spot
  // has a clear 4 x 4 m patch beside it for her ghost, out of every puzzle's beam path)
  { id: '04', world: 'solar', pos: [-93, -79.6, -121.5], yaw: Math.PI / 2 }, // Under the Sand: the sinkhole's lip, north end, just after the drop, by the first dormant conduit
  { id: '04b', world: 'solar', pos: [-93, -79.6, -106], yaw: -Math.PI / 2 }, // The Ring: the lip's south end, the pit and the first mirror on its island under the lens's beam
  { id: '05', world: 'solar', pos: [-105, -79.6, -108.5], yaw: Math.PI / 4 }, // Mirrors: the gate hall's entry gallery, the first full view of the dormant stargate and its mirrors
  { id: '05b', world: 'solar', pos: [-129.5, -78.8, -127.8], yaw: -Math.PI / 2 }, // Full: under the ring, beside the west capacitor bank, where the hard-light bridge lands
  { id: '06', world: 'solar', pos: [-105, -64, -125], yaw: Math.PI / 2 }, // Here We Go: the upper gallery off the annex lift, just before the stargate puzzle
  // The Pillar: the Sun Temple's pilgrims' balcony beside the obelisk (L3), its 4 x 4 m patch clear for her ghost.
  // The temple is placed by a transform, so its module sets the world spot (setLogSpot, from
  // solarTempleInterior.js); this row's pos is the placement it had when written (temple-local 16.2, 29.2, 23.1)
  { id: '06b', world: 'solar', pos: [-123.1, 3.2, -59.8], yaw: 0 },
  // VERDANT (final, the rebuilt world): lonely, then frightened
  { id: '07', world: 'verdant', pos: [-10, 4, -162.5], yaw: Math.PI }, // the Moss Landing, just inside the Verdant gate on the walking line: moss, drizzle, a shaft of gold light; the open paving ahead is the ghost's stage
  { id: '07b', world: 'verdant', pos: [-50, -8, -322.5], yaw: Math.PI }, // the algae reactors under the swamp: the aisle between the two rows of tanks, just in from the glyph stair
  { id: '08', world: 'verdant', pos: [-41.5, 6, -359], yaw: -Math.PI / 2 }, // the inner sanctum, beside the algae pool right of the pyramid's stair, roots grown through two bodies
  { id: '09', world: 'verdant', pos: [-47.2, 23.6, -377.2], yaw: -Math.PI / 2 }, // the top of the sanctum's pyramid, by the sealed high door east ("run for the cold door, east": the boulder escape starts here)
  // AZURE (final, the rebuilt world): homesick, then the truth
  { id: '10', world: 'azure', pos: [46.4, -60, -110.6], yaw: 2.36 }, // the Aquarium's observation gallery, at the north-west window: the first look out into the deep
  { id: '11', world: 'azure', pos: [105.4, -21, -121.4], yaw: 1.57 }, // the warm crew deck, by the boiler
  { id: '12', world: 'azure', pos: [136, -52.3, -120.5], yaw: -Math.PI / 2 }, // the Flooded Depths: the Bell's dry ledge, an air pocket underwater
  { id: '13', world: 'azure', pos: [113.4, -25, -160.8], yaw: Math.PI / 2 }, // the Archive's records room, in front of the index terminal (the catalogue)
  // PRISM CORE (final; prism.js isn't being rebuilt): resolve, and the last note
  { id: '14', world: 'prism', pos: [-7.5, -48, -97.5], yaw: Math.PI / 4 }, // the antechamber, among the crystals, south-west corner
  { id: '15', world: 'prism', pos: [7, -48, -112], yaw: -Math.PI / 4 }, // the antechamber's north-east corner, by the way to the arena
];

// A world module that places itself by a transform can move its log's spot (call it before placeLogs, i.e.
// while the world builds).
export function setLogSpot(id, pos, yaw) {
  const row = LOGS.find((l) => l.id === id);
  if (!row) return;
  row.pos = [...pos];
  if (yaw !== undefined) row.yaw = yaw;
}

export function placeLogs(B) {
  for (const { id, pos, yaw } of LOGS) B.audioLog(id, pos, yaw);
}

// (read-only: the spots, for tools and tests)
export const LOG_SPOTS = LOGS;

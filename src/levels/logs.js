// Where Wren Ashby's fifteen audio logs wait (scripts: tools/audio/logs.json, story: src/story/STORY.md).
// One table, in story order: the Atrium first, then Solar, Verdant, Azure and the Prism Core. Her voice
// is first heard in the Prism Atrium: no log goes in the cell block or the Crimson Foundry (or its annex).
//   world: which area it belongs to · pos: the floor point the recorder hovers over (1.15 m up)
//   yaw: which way the recorder faces at first (it slowly turns) · provisional: a placeholder spot
// The Hub and the Prism Core aren't being rebuilt, so their spots are final. Every color world is being rebuilt from scratch:
// the spots marked provisional point into the OLD layouts (where they were reachable) and must be moved
// to a natural spot in the new level, off the main path but reachable, then the flag dropped.
const LOGS = [
  // THE PRISM ATRIUM (final): wonder, on the first visit
  { id: '01', world: 'hub', pos: [-4.3, 4.4, -105.6], yaw: Math.PI / 4 }, // the dais's lower step, south-west corner, under the reactor heart: in view as you walk in from the red door
  { id: '02', world: 'hub', pos: [0, 2.8, -134], yaw: 0 }, // the sunken plaza's compass, where all four conduits can be seen
  { id: '03', world: 'hub', pos: [23.2, 12, -128], yaw: -Math.PI / 2 }, // the east gallery, just off the lift, by Azure's glass conduit
  // SOLAR (final, the rebuilt world): her nine seconds; she dims the captive star
  { id: '04', world: 'solar', pos: [-59.5, 4, -121.5], yaw: Math.PI / 2 }, // the lookout balcony off the overlook's north-west corner, facing the captive sun
  { id: '05', world: 'solar', pos: [-150.5, -4, -126.5], yaw: Math.PI }, // the Glass Terrace's south end, facing the cliff of fused sand-glass bands
  { id: '06', world: 'solar', pos: [-128, 12, -164], yaw: -Math.PI / 2 }, // the ring of standing stones on the Gnomon Summit, shadows burned into the rock
  // VERDANT (provisional): lonely, then frightened
  { id: '07', world: 'verdant', pos: [26, 4, -161.5], yaw: 0, provisional: true }, // old: the Root Court's south terrace (wants: early, lush and quiet)
  { id: '08', world: 'verdant', pos: [27.5, 4.5, -205.5], yaw: 0, provisional: true }, // old: the north bank over the Great Hollow (wants: roots by water)
  { id: '09', world: 'verdant', pos: [12, -25, -250], yaw: 0, provisional: true }, // old: the root island behind the Great Tree (wants: late, hidden, before the way east)
  // AZURE (final, the rebuilt world): homesick, then the truth
  { id: '10', world: 'azure', pos: [55.5, 4, -117.5], yaw: 2.36 }, // the Rim Deck by the antenna mast, first view of the cold sea
  { id: '11', world: 'azure', pos: [107.2, -4.5, -82.3], yaw: 1.08 }, // inside the warm pump hut, by the boiler
  { id: '12', world: 'azure', pos: [136, -52.3, -120.5], yaw: -Math.PI / 2 }, // the Flooded Depths: the Bell's dry ledge, an air pocket underwater
  { id: '13', world: 'azure', pos: [113.4, -25, -160.8], yaw: Math.PI / 2 }, // the records room off the Cryo Lab, in front of the index terminal
  // PRISM CORE (final; prism.js isn't being rebuilt): resolve, and the last note
  { id: '14', world: 'prism', pos: [-7.5, -48, -97.5], yaw: Math.PI / 4 }, // the antechamber, among the crystals, south-west corner
  { id: '15', world: 'prism', pos: [7, -48, -112], yaw: -Math.PI / 4 }, // the antechamber's north-east corner, by the way to the arena
];

export function placeLogs(B) {
  for (const { id, pos, yaw } of LOGS) B.audioLog(id, pos, yaw);
}

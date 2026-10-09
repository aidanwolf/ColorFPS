// Where Wren Ashby's fifteen audio logs wait (scripts: tools/audio/logs.json, story: src/story/STORY.md).
// One table, in story order: the Atrium first, then Solar, Verdant, Azure and the Prism Core. Her voice
// is first heard in the Prism Atrium: no log goes in the cell block or the Crimson Foundry (or its annex).
//   world: which area it belongs to · pos: the floor point the recorder hovers over (1.15 m up)
//   yaw: which way the recorder faces at first (it slowly turns) · provisional: a placeholder spot
// Every spot is final: the color worlds' were picked by their rebuilds to match each script.
const LOGS = [
  // THE PRISM ATRIUM (final): wonder, on the first visit
  { id: '01', world: 'hub', pos: [-4.3, 4.4, -105.6], yaw: Math.PI / 4 }, // the dais's lower step, south-west corner, under the reactor heart: in view as you walk in from the red door
  { id: '02', world: 'hub', pos: [0, 2.8, -134], yaw: 0 }, // the sunken plaza's compass, where all four conduits can be seen
  { id: '03', world: 'hub', pos: [23.2, 12, -128], yaw: -Math.PI / 2 }, // the east gallery, just off the lift, by Azure's glass conduit
  // SOLAR (final, the rebuilt world): her nine seconds; she dims the captive star
  { id: '04', world: 'solar', pos: [-59.5, 4, -121.5], yaw: Math.PI / 2 }, // the lookout balcony off the overlook's north-west corner, facing the captive sun
  { id: '05', world: 'solar', pos: [-107.5, -19.6, -99], yaw: 0 }, // the dig gallery: the ledge off the scaffold tower (walk the side plank), facing the cut's fused sand-glass bands
  { id: '06', world: 'solar', pos: [-206, -6, -193.5], yaw: -Math.PI / 2 }, // the Sun Quay under the court mesa (after the dune run): the ring of standing stones by the sun discs, shadows burned into the stone
  // VERDANT (final, the rebuilt world): lonely, then frightened
  { id: '07', world: 'verdant', pos: [25.5, 4, -163.5], yaw: Math.PI / 2 }, // the Rain Court, east end of the south terrace: moss, gold light, drizzle
  { id: '08', world: 'verdant', pos: [27, 4.5, -212.2], yaw: Math.PI / 2 }, // the Ruin Bank's east rim over the sludge lake, roots grown through two skeletons
  { id: '09', world: 'verdant', pos: [-2.4, 21, -268.4], yaw: 0 }, // the hidden nest under the crown deck's south edge (drop through the rail gap; a pad brings you back)
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

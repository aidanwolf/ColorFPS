// Where Iris Calder's sixteen audio logs wait (scripts: tools/audio/logs.json, story: src/story/STORY.md).
// Each position is the floor point the recorder hovers over. They reward a look around: corners off the
// main path, high perches, secret rooms, the Hub's gallery. If you rebuild an area, move its logs here.
const LOGS = [
  // CRIMSON FOUNDRY
  ['01', [8.4, 0, -3.8]], // the cell block hall, by the door out (the first one you'll find)
  ['02', [-11.5, 0, -4.2]], // the Solar Cache, behind the spawn room's yellow door
  ['03', [-5, 4, -80]], // the Crucible's far shore, in the corner beside the exit
  // THE PRISM ATRIUM
  ['04', [0, 2.8, -134]], // the sunken plaza's compass
  ['05', [22.5, 12, -146.5]], // the far corner of the east gallery (ride a lift up)
  // SOLAR — Sunscorch Mesa
  ['06', [-54.5, 4, -122.5]], // the back corner of the Sunward Overlook
  ['07', [-125, -3, -129.8]], // the dead end of the array terrace ledge, south of where you land
  ['08', [-116, 20.8, -134.5]], // the Gnomon summit, the corner past the dial
  // VERDANT — Emerald Hollow
  ['09', [26, 4, -161.5]], // the Root Court's south terrace, far east under the great tree
  ['10', [27.5, 4.5, -205.5]], // the east end of the north bank, over the Great Hollow
  ['11', [12, -25, -250]], // the root island, behind the Great Tree
  // AZURE — The Cold Deep
  ['12', [55.5, 4, -117]], // the Rim Deck, by the antenna mast
  ['13', [107.5, -4.5, -81.5]], // inside the pump hut
  ['14', [107.4, -25, -166.2]], // the cryo lab, behind the specimen tanks
  // PRISM CORE — the antechamber
  ['15', [-7.5, -48, -97.5]], // among the crystals, the south-west corner
  ['16', [7, -48, -112]], // the north-east corner, by the way to the arena
];

export function placeLogs(B) {
  for (const [id, pos] of LOGS) B.audioLog(id, pos);
}

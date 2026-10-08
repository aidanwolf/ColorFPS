// Assembles the game world from one module per area (see src/levels/LAYOUT.md for the map):
//  CRIMSON FOUNDRY (red, linear intro) → THE HUB → SOLAR / VERDANT / AZURE (looping worlds that return
//  to the Hub) → PRISM CORE (the boss, beneath the Hub).
import * as THREE from 'three';
import { makeBuilders } from './levels/builders.js';
import { buildRed } from './levels/red.js';
import { buildRedAnnex } from './levels/redAnnex.js';
import { buildCellBlock } from './levels/cellblock.js';
import { buildHub } from './levels/hub.js';
import { buildSolar } from './levels/solar.js';
import { buildVerdant } from './levels/verdant.js';
import { buildAzure } from './levels/azure.js';
import { buildPrism } from './levels/prism.js';
import { buildGuide } from './levels/guide.js';
import { buildTestRange } from './levels/testRange.js';
import { placeLogs } from './levels/logs.js';

export function buildLevel(world, game) {
  const level = {
    secretsTotal: 0,
    spawn: new THREE.Vector3(0, 0, -2), // (the cell block moves it into your cell)
    spawnYaw: 0,
    introMessage: 'Grab the <b>Chroma Blaster</b> from the pedestal.', // shown a moment into a new game
    devStarts: {}, // ?dev&start=<name>
    respawnHooks: [], // run on every checkpoint respawn
    atmospheres: {}, // name -> preset for game.setAtmosphere (see main.js ATMOSPHERE_DEFAULT)
    secrets: [], // { label, trigger } for every secret room (restored from a save)
  };
  const B = makeBuilders(world, game, level);
  buildRed(B);
  buildRedAnnex(B);
  buildCellBlock(B); // the opening: you wake in a cell off the Foundry's spawn room
  buildHub(B);
  buildSolar(B);
  buildVerdant(B);
  buildAzure(B);
  buildPrism(B);
  buildGuide(world, game);
  buildTestRange(B); // ?dev only: the mechanics toolkit showcase, far off the map
  placeLogs(B); // Iris Calder's audio logs, all over the worlds
  return level;
}

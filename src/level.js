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
import { buildAzureFlooded } from './levels/azureFlooded.js';
import { buildPrism } from './levels/prism.js';
import { buildGuide } from './levels/guide.js';
import { buildTestRange } from './levels/testRange.js';
import { placeLogs } from './levels/logs.js';
import { buildCombatRange } from './levels/combatRange.js';
import { buildVerdantBossRange } from './levels/verdantBossRange.js';
import { buildBossRange } from './levels/bossRange.js';
import { buildLeviathanRange } from './levels/leviathanRange.js';
import { buildForgeRange } from './levels/forgeRange.js';
import { buildEnemyRangeB } from './levels/enemyRangeB.js';
import { buildEnemyRangeA } from './levels/enemyRangeA.js';
import { buildVerdantCreatureRange } from './levels/verdantCreatureRange.js';


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
    places: [], // { pos, name } named spots (zone titles, arenas): what the Continue card calls a checkpoint
  };
  game.level = level; // (reachable while building, e.g. for level.places)
  const B = makeBuilders(world, game, level);
  buildRed(B);
  buildRedAnnex(B);
  buildCellBlock(B); // the opening: you wake in a cell off the Foundry's spawn room
  buildHub(B);
  buildSolar(B);
  buildVerdant(B);
  buildAzure(B);
  buildAzureFlooded(B); // the water heart of the Azure world, between its turbine deck and Cryo Lab
  buildPrism(B);
  buildGuide(world, game);
  buildTestRange(B); // ?dev only: the mechanics toolkit showcase, far off the map
  placeLogs(B); // Wren Ashby's audio logs, from the Atrium on
  // dev-only test arena, far off the map (?dev&start=arena)
  if (new URLSearchParams(location.search).has('dev')) buildCombatRange(B);
  buildVerdantBossRange(B); // dev-only (?dev&start=hydra)
  buildBossRange(B); // ?dev only: mini-bosses off the map
  buildLeviathanRange(B); // ?dev only: the Azure mini-boss arena, off the map
  buildForgeRange(B); // dev-only Forge Titan test arena (?dev)
  buildEnemyRangeB(B); // ?dev only: test range for the world creatures
  buildEnemyRangeA(B);
  buildVerdantCreatureRange(B); // ?dev only: Verdant's flytraps, flies, worms and the fly ride, off the map
  return level;
}

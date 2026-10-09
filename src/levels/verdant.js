// VERDANT — the green world, "EMERALD HOLLOW": a biomass farm grown over a drowned forest north of the Hub, the
// whole valley harvested by an ancient, clearly engineered machine (pipelines, algae reactors, sap taps), and
// under it a granite temple of the people who built it. You come in with red + yellow and find GREEN deep in
// the ruin. This file is the coordinator: the atmosphere presets, the Hub gatehouse, the two halves, the
// aqueduct home, the shutdown aftermath and the HUD objective.
//   FIRST HALF (verdantSwamp.js → verdantRuin.js → verdantEscape.js): the Drowned Wood and the swamp river from
//   the gate (x -10, y 4), the trapdoor island, the granite ruin and its algae reactors, the green core in the
//   giant root cradle, the slime ambush, the boulder escape out of the monkey's mouth and the rope bridge to the
//   landing at (30, 18, -330).
//   SECOND HALF (verdantGodTree.js): the god tree from that landing, the Thornmaw, the way home down to the
//   aqueduct head at (10, 12, -239).
//   THE AQUEDUCT (built in verdantGodTree.js): from there south over the swamp to the Hub's north balcony port
//   (x 10, y 12), through the gates and the one-way door.
// Shutting the Heart down (game.onPowerDown('verdant'), also on load) kills the forest: see aftermath().
import * as THREE from 'three';
import { BLUE } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { mat } from '../materials.js';
import { regionOf } from './regions.js';
import { buildVerdantSwamp } from './verdantSwamp.js';
import { buildGodTree } from './verdantGodTree.js';
import { makeVerdantKit, kitMaterials } from './verdantKit.js';
import { floraMats } from './verdantFlora.js';

const PI = Math.PI;
const NORTH = 0;

export function buildVerdant(B) {
  const { W, game, level, GLOW, room, corridor, trophy, secretRoom, zoneTitle, area } = B;
  const zone = 'green';
  const MOOD = { music: 'music_green', ambient: 'amb_jungle', atmosphere: 'verdant' };

  // ---------------------------------------------------------------- atmospheres
  // the swamp: thick green-brown murk close round you (twenty metres and it's gone), a sickly hidden sun
  level.atmospheres.verdant = {
    fog: 0x26301f, fogNear: 4, fogFar: 46,
    skyTop: [0.008, 0.012, 0.007], skyMid: [0.014, 0.02, 0.011], skyHorizon: [0.02, 0.028, 0.015], aurora: 0, stars: 0,
    hemiSky: 0xa8c890, hemiGround: 0x141a0e, hemiIntensity: 0.62,
    sunColor: 0xd8e090, sunIntensity: 0.55, sunDir: [-0.3, 1, 0.35],
    exposure: 1.05, bloom: 0.62,
  };
  // the granite ruin: dark, cool stone, the algae's glow carrying further in the still air
  level.atmospheres.verdantRuin = {
    fog: 0x0c1410, fogNear: 6, fogFar: 70,
    skyTop: [0.01, 0.015, 0.01], skyMid: [0.02, 0.03, 0.02], skyHorizon: [0.03, 0.04, 0.03], aurora: 0, stars: 0,
    hemiSky: 0x7a9a88, hemiGround: 0x0a100c, hemiIntensity: 0.42,
    sunColor: 0x88a090, sunIntensity: 0.12, sunDir: [-0.3, 1, 0.35],
    exposure: 1.1, bloom: 0.75,
  };
  // the gorge outside the monkey's mouth: the fog opens up (you can see the face behind you, and the tree ahead)
  level.atmospheres.verdantGorge = {
    fog: 0x3a4a34, fogNear: 14, fogFar: 150,
    skyTop: [0.03, 0.05, 0.035], skyMid: [0.07, 0.1, 0.06], skyHorizon: [0.12, 0.15, 0.09], aurora: 0, stars: 0,
    hemiSky: 0xc8e0a8, hemiGround: 0x18241a, hemiIntensity: 0.8,
    sunColor: 0xffe8a8, sunIntensity: 1.3, sunDir: [0.75, 0.55, 0.3],
    exposure: 1.0, bloom: 0.55,
  };
  // ... and once the engine is dead: cold grey light, the bloom gone out of it
  const DEAD = {
    fog: 0x3c4448, skyTop: [0.02, 0.025, 0.04], skyMid: [0.06, 0.07, 0.085], skyHorizon: [0.13, 0.14, 0.16],
    hemiSky: 0xa9b8c8, hemiGround: 0x16181c, sunColor: 0xc4d4e6, bloom: 0.3,
  };

  // ---------------------------------------------------------------- THE GATEHOUSE (z -148.5 → -158.5)
  corridor({ zStart: -148.5, zEnd: -158.5, y: 4, zone, cx: -10, w: [{ c: -153.5, w: 2.4, h: 3 }] });
  zoneTitle([-11.5, 4, -152], [-8.5, 7, -149], 'VERDANT', 'EMERALD HOLLOW', '#3dff7a', null);
  area([-11.5, 4, -152], [-8.5, 7.2, -149], MOOD);
  W.deco(-11.5, 4.01, -158.5, -8.5, 4.06, -155, 'grass', zone);
  // SECRET — the Verdant Reliquary behind a blue door (come back after Azure)
  new Barrier(W, { min: [-12, 4, -154.7], max: [-11.5, 7, -152.3], color: BLUE, kind: 'door', zone });
  room({ x1: -18, x2: -12.5, zS: -150.5, zN: -156.5, y: 4, h: 3.5, zone, e: [{ c: -153.5, w: 2.4, h: 3 }], trim: false });
  trophy(-15.5, 5, -153.5);
  W.box(-16.3, 4, -154.3, -14.7, 4.15, -152.7, 'metal', zone);
  W.deco(-17.95, 6.2, -156.45, -17.9, 6.28, -150.55, 'glow3', zone);
  secretRoom([-18, 4, -156.5], [-12.5, 7.5, -150.5], 'Verdant Reliquary');
  {
    const K = makeVerdantKit(B, { seed: 3 });
    for (let i = 0; i < 10; i++) K.hangMoss(-11.4 + Math.random() * 2.8, 7.2, -149 - Math.random() * 9.4, 0.4 + Math.random() * 1.2, 0.3);
    for (let i = 0; i < 8; i++) K.hangMoss(-17.8 + Math.random() * 5.2, 7.5, -150.8 - Math.random() * 5.5, 0.5 + Math.random() * 1.5, 0.3);
    K.flush();
  }

  // ---------------------------------------------------------------- THE FIRST HALF and THE SECOND HALF
  const swamp = buildVerdantSwamp(B, { MOOD });
  const tree = buildGodTree(B, { landing: [30, 18, -330] });

  // ---------------------------------------------------------------- AFTERMATH: the engine is dead
  // The glow drains out of everything (algae, sap, fungi, the water's sheen), the leaves and moss go brown, the
  // light turns cold. Over a few seconds on a live shutdown, at once from a save.
  const KM = kitMaterials(), FM = floraMats();
  const fades = [
    [KM.sap.color, 0x3a4434], [KM.glow.color, 0x26302a], [KM.leaf.color, 0x4f4426], [KM.leafLit.color, 0x6b5a32], [KM.vine.color, 0x5a4a2a],
    [KM.moss.color, 0x6a5a3a], [FM.fungus.color, 0x3a4038], [FM.fungusTeal.color, 0x34403c], [FM.reed.color, 0x6a5a3a], [FM.lily.color, 0x5a5034],
    [mat(GLOW[zone], zone).color, 0x26302a], [mat('grass', zone).color, 0x5b4a2e],
  ].map(([c, to]) => ({ c, from: c.clone(), to: new THREE.Color(to) }));
  const atmos = ['verdant', 'verdantRuin', 'verdantGorge'].map((n) => ({ a: level.atmospheres[n], from: { ...level.atmospheres[n] } }));
  let deadK = -1;
  function applyDead(k) {
    for (const f of fades) f.c.copy(f.from).lerp(f.to, k);
    KM.algae.uniforms.uLife.value = 1 - k * 0.9;
    swamp.waterMats.deep.uniforms.uLife.value = swamp.waterMats.shallow.uniforms.uLife.value = 1 - k;
  }
  function aftermath(restored) {
    if (deadK >= 0) return;
    deadK = 0;
    for (const { a } of atmos) Object.assign(a, DEAD);
    const r = regionOf(game.player.pos);
    if (r === 'verdant') game.setAtmosphere(game.atmo?.name?.startsWith('verdant') ? game.atmo.name : 'verdant', restored);
    if (restored) return (deadK = 1), applyDead(1);
    W.add({
      update(dt) {
        if (deadK >= 1) return;
        deadK = Math.min(1, deadK + dt / 5);
        applyDead(deadK * deadK * (3 - 2 * deadK));
      },
    });
  }
  game.onPowerDown((name, { restored }) => name === 'verdant' && aftermath(restored));

  // ---------------------------------------------------------------- the HUD objective (guide.js asks)
  function objective(p) {
    if (game.isWorldDown?.('verdant')) {
      if (p.y > 11 && p.x > 7.5 && p.x < 12.5 && p.z > -241) return 'Follow the aqueduct home to the Nexus: blast each gate with its color.';
      return tree.objective?.(p) || 'The engine is dead. Make your way home to the Nexus.';
    }
    if (p.y > 11 && p.z > -158.5 && p.x > 7) return `A dead end from this side. Drop to the Nexus floor and take the <b style="color:#ffd23a">yellow gate</b> in the north wall.`;
    if (p.y > 11 && p.x > 7.5 && p.x < 12.5 && p.z > -241) return 'The aqueduct runs home to the Nexus.';
    return swamp.objective(p) || tree.objective?.(p) || '';
  }

  level.verdant = { ...swamp, tree, objective };
}

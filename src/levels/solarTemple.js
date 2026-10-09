// SOLAR — THE SUN YARD AND THE SUN TEMPLE (solar.js calls buildSolarTemple after the depths). The gate's blast
// opens the way to the sun yard (solarCourt.js: the tunnel, the gatehouse lift, the yard on its shelf, the core,
// the ambush, the cut face and its stair targets). Behind the temple's door everything is solarTempleInterior.js:
// the hall of the inverted obelisk, built in temple coordinates (origin at the door's threshold, +z into the
// temple) and placed by TEMPLE_T (the door at court.DOOR, facing east), its climb, its worshippers, the support
// joints and the collapse that throws you out onto the roof, and the high crossing down the south flank to the
// Panel Court passage. This file joins them: persistence (stageAt / applySaved) and the HUD objective.
// Persistence: game.events solar_court (the ambush won), solar_stair1…4, solar_t1…t5 (the temple's locks),
// solar_j1…j4 (its joints), solar_collapse; a start position past a beat counts it done.
import { YELLOW } from '../colors.js';
import { audio } from '../audio.js';
import { buildSolarCourt } from './solarCourt.js';
import { buildTempleInterior, TEMPLE_T } from './solarTempleInterior.js';

const SOUNDS = ['servo_heavy', 'hydraulic_land', 'floor_collapse', 'gate_open', 'incinerator_ignite', 'charge_up', 'sun_hum', 'titan_charge', 'boss_slam', 'switch_on', 'energy_crackle', 'arena_seal', 'mummy_alert'];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

// ================================================================ the build
export function buildSolarTemple(B, K, depths) {
  const { W, game } = B;
  const { has } = K;
  const ev = (id) => game.events.has(id);
  // ================================================================ THE SUN YARD (solarCourt.js)
  // The tunnel from the gate's hole, the gatehouse lift, the yard on its shelf (the core, the ambush) and the
  // cut face with its stair targets. (The old chasm courtyard is gone; the temple is placed by the door at
  // court.DOOR, temple-local +z = world west.)
  let restoringStairs = false;
  const court = buildSolarCourt(B, K, { restoring: () => restoringStairs });
  const { ambush, targets, flights, corePick } = court;

  // ================================================================ THE SUN TEMPLE (solarTempleInterior.js)
  const interior = buildTempleInterior(B, K, { T: { ...TEMPLE_T, x: court.DOOR[0], y: court.DOOR[1], z: court.DOOR[2] } });

  // ================================================================ persistence and starts
  const stageAt = (p) => {
    if (depths.stageAt(p) < 8) return 0;
    if (court.inYard(p) || p.y < -50 || p.x > -100) return 0; // the yard, the tunnel, the gatehouse (and the hall's hole)
    const s = interior.stageAt(p); // the temple: 1 the vestibule and L0, 2–5 its storeys, 6 the roof and the crossing
    if (s !== null) return s;
    return 6; // past the temple
  };
  const applySaved = (stage) => {
    if (has(YELLOW) && corePick.active) {
      // (a start that already holds yellow: the core's long gone)
      corePick.active = false;
      corePick.group.visible = false;
      if (corePick.light) corePick.light.intensity = 0;
      W.remove(corePick);
    }
    if (stage >= 1 || ev('solar_court')) ambush.restoreCleared();
    restoringStairs = true;
    targets.forEach((t, i) => (ev('solar_stair' + (i + 1)) || stage >= 1) && !t.on && ((t.keep = true), t.setOn(true, null, true)));
    restoringStairs = false;
    interior.applySaved(stage);
  };
  let first = true;
  W.add({
    update(dt, player) {
      if (first && game.state === 'playing') {
        first = false;
        applySaved(stageAt(game.checkpoint?.pos || player.pos));
      }
    },
  });

  // ================================================================ the HUD objective for this stretch
  const objective = (p) => {
    const yard = court.objective(p);
    if (yard) return yard;
    return interior.objective(p);
  };

  return { ambush, targets, flights, objective, stageAt, corePick, court, interior, get apexLit() { return interior.collapsed; } };
}


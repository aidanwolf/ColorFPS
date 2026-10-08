// DEV-ONLY combat range (?dev&start=arena): a walled arena far off the map (x 405-465, z -150 → -230)
// that runs one Encounter showing every enemy type over four escalating waves. Built only with ?dev.
// Also a worked example of the combat toolkit (B.encounter, enemy specs, seals) for level designers.
import { RED, YELLOW, GREEN, BLUE } from '../colors.js';

export function buildCombatRange(B) {
  const { W, room, corridor, plat, light, encounter, devStart, hint } = B;
  const zone = 'hub';
  const X1 = 410, X2 = 460, ZS = -165, ZN = -215, H = 10, CX = 435;

  // entry corridor from the south, the arena, and a small reward room to the north
  corridor({ zStart: -150, zEnd: ZS, y: 0, zone, cx: CX });
  W.box(CX - 2, 0, -150.5, CX + 2, 3.7, -150, 'wall', zone);
  room({ x1: X1, x2: X2, zS: ZS, zN: ZN, y: 0, h: H, zone, ceiling: false, s: [{ c: CX, w: 3, h: 3.2 }], n: [{ c: CX, w: 3, h: 3.2 }] });
  corridor({ zStart: ZN, zEnd: -219, y: 0, zone, cx: CX });
  room({ x1: 429, x2: 441, zS: -219, zN: -229, y: 0, h: 4, zone, s: [{ c: CX, w: 3, h: 3.2 }] });
  hint([429, 0, -228], [441, 3, -220], 'Combat range cleared. Reload to run it again.', 4);

  // cover: four pillars, low walls, a central dais, side balconies with steps, and a gantry overhead
  for (const [x, z] of [[420, -178], [450, -178], [420, -202], [450, -202]]) W.box(x - 1, 0, z - 1, x + 1, 6, z + 1, 'metal', zone);
  W.box(426, 0, -173, 432, 1.3, -172.4, 'metal', zone);
  W.box(438, 0, -173, 444, 1.3, -172.4, 'metal', zone);
  W.box(428, 0, -208, 442, 1.3, -207.4, 'metal', zone);
  plat(429, -186, 441, -194, 1.2, zone, 1.2);
  for (const [x1, x2] of [[X1, X1 + 5], [X2 - 5, X2]]) {
    plat(x1, -176, x2, -204, 3.5, zone);
    // steps up from the south end
    for (let i = 0; i < 8; i++) W.box(x1, 0, -168.8 - i * 0.9 - 0.9, x2, 0.44 * (i + 1), -168.8 - i * 0.9, 'plat', zone);
  }
  W.box(X1, 8, -191, X2, 8.6, -189, 'metal', zone);
  W.deco(X1, 7.95, -191.02, X2, 8.02, -188.98, 'glow3', zone);
  light(CX, 9, -175, 0xcfd8ff, 45, 34);
  light(CX, 9, -205, 0xcfd8ff, 45, 34);
  light(414, 6, -190, 0xffd9a0, 25, 22);
  light(456, 6, -190, 0xffd9a0, 25, 22);
  light(CX, 3, -224, 0x9bf6ff, 20, 14);

  encounter({
    trigger: [[X1 + 1, 0, ZN + 2], [X2 - 1, 6, ZS - 4]],
    seals: [
      { min: [CX - 1.5, 0, ZS - 0.1], max: [CX + 1.5, 3.2, ZS + 0.6] }, // the way in slams shut behind you
      { min: [CX - 1.5, 0, ZN - 0.6], max: [CX + 1.5, 3.2, ZN + 0.1], color: BLUE, closed: true }, // the way on opens when it's clear
    ],
    title: 'COMBAT RANGE',
    sub: 'DEV ARENA',
    music: 'music_combat',
    checkpoint: { pos: [CX, 0, -224], yaw: 0 },
    waves: [
      // 1: drones and a small swarm
      [
        { type: 'drone', pos: [425, 4, -196], color: RED },
        { type: 'drone', pos: [445, 4, -196], color: YELLOW },
        { type: 'drone', pos: [CX, 5, -206], color: GREEN },
        { type: 'swarm', pos: [CX, 4, -186], color: [RED, YELLOW], count: 5, delay: 1.6 },
      ],
      // 2: turrets on the north wall and the gantry, with a swarm to keep you moving
      [
        { type: 'turret', pos: [424, 4.5, ZN + 0.05], color: BLUE, mount: [0, 0, 1] },
        { type: 'turret', pos: [446, 4.5, ZN + 0.05], color: YELLOW, mount: [0, 0, 1] },
        { type: 'turret', pos: [CX, 8, -190], colors: [RED, GREEN], mount: 'ceiling', delay: 0.8 },
        { type: 'swarm', pos: [CX, 4, -180], color: [GREEN, BLUE], count: 6, delay: 2.5 },
        { type: 'drone', pos: [CX, 6, -200], color: [RED, YELLOW], delay: 3 },
      ],
      // 3: a warden, a brute and mortars on the balconies
      { title: 'HEAVIES', enemies: [
        { type: 'warden', pos: [CX, 5, -199], shield: YELLOW, core: BLUE },
        { type: 'brute', pos: [447, 1.5, -205], color: RED, delay: 1.2 },
        { type: 'mortar', pos: [412.5, 3.5, -192], color: GREEN, delay: 2 },
        { type: 'mortar', pos: [457.5, 3.5, -192], color: BLUE, delay: 2.4 },
      ] },
      // 4: everything at once
      [
        { type: 'brute', pos: [422, 1.5, -207], color: GREEN },
        { type: 'warden', pos: [450, 5.5, -200], shield: RED, core: GREEN, delay: 0.6 },
        { type: 'turret', pos: [420, 0, -190], colors: [YELLOW, BLUE], delay: 1.2 },
        { type: 'mortar', pos: [457.5, 3.5, -200], color: RED, delay: 1.8 },
        { type: 'swarm', pos: [CX, 5, -195], color: [RED, YELLOW, GREEN, BLUE], count: 8, delay: 3 },
      ],
    ],
  });

  devStart('arena', [CX, 0, -152], 0, [RED, YELLOW, GREEN, BLUE]);
}

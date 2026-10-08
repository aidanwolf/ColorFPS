// DEV TEST RANGE (only with ?dev; ?dev&start=range drops you in with every color). A short course far off
// the map (x 394..474, z 18..-36, all inside the 'red' culling region so it's drawn as one) showing every
// piece of the mechanics toolkit (entities/mechanics.js) the way the B.* one-liners place it:
//  row A (east, +x): toggle switch → phase bridge, timed orb → vanishing stepping stones, chroma platforms
//  north leg (-z):   crumbling stones (and a disguised instant one), a trapdoor over spikes
//  row B (west, -x): push mover, step lift / riser block up to the decks, rotor gate, rotor wall,
//                    sinker door, timed race gate, then a platform rack to climb out and drop back to the start.
import { RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { Checkpoint } from '../entities/misc.js';

export function buildTestRange(B) {
  if (!new URLSearchParams(location.search).has('dev')) return;
  const { W, game, plat, hint, light, devStart } = B;
  const zone = 'hub';
  const spikes = (x1, z1, x2, z2) => B.spikes([x1, -6, z1], [x2, -5.2, z2]);
  // a pad: a pillar from the base floor with a trimmed slab on top
  const pad = (x1, z1, x2, z2, top = 0) => {
    W.box(x1, -6, Math.min(z1, z2), x2, top - 0.5, Math.max(z1, z2), 'wall', zone);
    plat(x1, z1, x2, z2, top, zone, 0.5, 'floor');
  };
  const cp = (x, y, z, yaw) => new Checkpoint(W, game, { pos: [x, y, z], yaw, size: [3, 3, 3] });
  const say = (min, max, html) => hint(min, max, `<b>TEST RANGE</b> · ${html}`, 6);
  const E = -Math.PI / 2, N = 0, Wst = Math.PI / 2; // yaws facing +x, -z, -x

  W.box(392, -7, -40, 476, -6, 22, 'floor', zone); // base floor under everything
  for (const [x, z] of [[400, 13], [430, 13], [460, 13], [468, -8], [450, -29], [425, -29], [404, -29], [400, -4]]) light(x, 8, z, 0xdfe6ff, 20, 30);

  // ---------- row A ----------
  pad(396, 8, 406, 18);
  cp(400, 0, 13, E);
  devStart('range', [399, 0, 13], E, [RED, YELLOW, GREEN, BLUE]);
  say([396, 0, 8], [406, 4, 18], 'Shoot the <b style="color:#ff3344">red switch</b> to build the bridge (toggle).');
  // 1. toggle switch → phase bridge over spikes
  const bridge = B.phasePlatform({ min: [406, -0.4, 11.5], max: [414, 0, 14.5], color: RED, zone });
  pad(414, 8, 420, 18);
  W.box(415, 0, 16, 416, 3, 17, 'metal', zone);
  B.colorSwitch({ pos: [415, 1.8, 16.5], face: '-x', color: RED, mode: 'toggle', links: [bridge], zone });
  spikes(406, 8, 414, 18);
  // 2. timed orb → three stepping stones that vanish when its clock runs out
  say([414, 0, 8], [420, 4, 18], 'Timed orb: the stones hold for 4 s (shoot again to refill). Run!');
  const stones = [422, 426.5, 431].map((x) => B.phasePlatform({ min: [x, -0.4, 11.5], max: [x + 2.5, 0, 14.5], color: YELLOW, zone }));
  B.colorSwitch({ pos: [418, 3, 9.5], style: 'orb', color: YELLOW, mode: 'timed', time: 4, links: stones, zone });
  spikes(420, 8, 435.5, 18);
  pad(435.5, 8, 440, 18);
  cp(437.5, 0, 13, E);
  // 3. chroma platforms: solid only in their own color
  say([435.5, 0, 8], [440, 4, 18], 'Chroma platforms are solid only while your blaster is <b>their color</b>: switch (1-4) mid-jump.');
  [[442, 0.5, RED], [446.5, 1, BLUE], [451, 1, GREEN], [455.5, 0.5, YELLOW]].forEach(([x, top, c]) => B.chromaPlatform({ min: [x, top - 0.4, 11.5], max: [x + 2.5, top, 14.5], color: c, zone }));
  spikes(440, 8, 460, 18);

  // ---------- north leg ----------
  pad(460, 6, 474, 18);
  cp(467, 0, 13, N);
  say([460, 0, 6], [474, 4, 12], 'Crumbling stones drop after a moment. The plain-looking one on the right drops <b>instantly</b>.');
  B.crumble({ min: [465.5, -0.5, 1], max: [468.5, 0, 4], delay: 0.8, respawn: 3, zone });
  B.crumble({ min: [465.5, -0.5, -4], max: [468.5, 0, -1], delay: 0.4, respawn: 3, zone });
  B.crumble({ min: [470.5, -0.5, -4], max: [473.5, 0, -1], delay: 0, respawn: 2, disguise: true, zone });
  spikes(462, -6, 474, 6);
  pad(462, -6, 474, -12);
  cp(468, 0, -8, N);
  say([462, 0, -12], [474, 4, -6], 'Trapdoor ahead: it drops a moment after you step on it. Sprint or jump it.');
  B.trapdoor({ min: [462, -0.5, -16], max: [474, 0, -12], delay: 0.45, respawn: 2.5, spikes: -6, zone });

  // ---------- row B ----------
  pad(456, -16, 474, -36);
  cp(466, 0, -22, Wst);
  devStart('rangeB', [466, 0, -24], Wst, [RED, YELLOW, GREEN, BLUE]);
  say([456, 0, -36], [474, 4, -18], 'Push mover: ride it and keep shooting it (<b style="color:#3a8bff">blue</b>). It drifts home when you stop.');
  B.shotMover({ min: [453, -0.4, -30.5], max: [456, 0, -27.5], path: [-9, 0, 0], color: BLUE, mode: 'push', back: 1.2, zone });
  spikes(444, -36, 456, -22);
  pad(432, -22, 444, -36);
  cp(440, 0, -29, Wst);
  say([432, 0, -36], [444, 4, -22], 'Up: the <b style="color:#3dff7a">green lift</b> steps per hit, the <b style="color:#ff3344">red riser</b> climbs while you spam it and sinks when you stop.');
  B.shotMover({ min: [432, 0, -28], max: [434.5, 0.4, -25.5], path: [0, 5.6, 0], color: GREEN, mode: 'step', step: 1.4, back: 1, hold: 4, zone });
  B.riser({ min: [432, 0, -34], max: [435, 1, -31], rise: 4.5, color: RED, zone });
  W.box(420, -6, -36, 432, 6, -22, 'wall', zone); // deck 1
  plat(420, -36, 432, -22, 6, zone, 0.3, 'floor');
  cp(424, 6, -29, Wst);
  devStart('rangeC', [426, 6, -29], Wst, [RED, YELLOW, GREEN, BLUE]);
  say([420, 6, -36], [432, 10, -22], 'Rotor gate: each <b style="color:#3a8bff">blue</b> hit turns it a quarter. Turn the hole down to the bridge to get through.');
  // a narrow bridge over spikes, blocked by an 8.4 m square wall with a door-sized hole cut in one edge,
  // turning about the bridge's own axis: only orientation 0 puts the hole at your feet (the others leave
  // it 3 m+ up or overhead: a jump, mid-air crouch tuck and step-up climb about 2.8 m), and there's no
  // way around it but the spikes
  W.box(412, 5.5, -30.5, 420, 6, -27.5, 'metal', zone);
  plat(412, -30.5, 420, -27.5, 6, zone, 0.3, 'floor');
  B.shotRotor({
    pivot: [416, 10.2, -29], axis: 'x', color: BLUE, start: 2, correct: 0, zone,
    parts: [[-0.3, -4.2, -4.2, 0.3, 4.2, -1.1], [-0.3, -4.2, 1.1, 0.3, 4.2, 4.2], [-0.3, -1.2, -1.1, 0.3, 4.2, 1.1]],
  });
  spikes(412, -36, 420, -22);
  W.box(396, -6, -32.5, 412, 6, -22, 'wall', zone); // deck 2
  plat(396, -32.5, 412, -22, 6, zone, 0.3, 'floor');
  W.box(402, 6, -26, 412, 9.5, -25.5, 'wall', zone);
  W.box(396, 6, -32.5, 412, 9.5, -32, 'wall', zone);
  W.box(395.5, 6, -32.5, 396, 10, -10, 'wall', zone);
  say([408, 6, -32], [412, 10, -26], 'Rotor wall (<b style="color:#ffd23a">yellow</b>), then the <b style="color:#3dff7a">sinker door</b>: shoot it down, it rises when you stop. The red gate beyond closes fast.');
  B.shotRotor({ pivot: [408, 6, -29], axis: 'y', color: YELLOW, zone, parts: [[-0.3, 0, -2.9, 0.3, 3.2, 2.9]] });
  // sinker door in a wall across the corridor (it sinks into the deck)
  W.box(402.5, 6, -32, 403.5, 9.5, -30.5, 'wall', zone);
  W.box(402.5, 6, -27.5, 403.5, 9.5, -26, 'wall', zone);
  W.box(402.5, 9, -30.5, 403.5, 9.5, -27.5, 'wall', zone);
  B.sinker({ min: [402.5, 6, -30.5], max: [403.5, 9, -27.5], color: GREEN, zone });
  // race gate at the end of deck 3, its switch back on deck 2's west wall
  W.box(396, -6, -22, 402, 6, -10, 'wall', zone); // deck 3
  plat(396, -22, 402, -10, 6, zone, 0.3, 'floor');
  W.box(402, 6, -22, 402.5, 10, -12.5, 'wall', zone);
  W.box(396, 6, -12.5, 397.5, 12.5, -12, 'wall', zone);
  W.box(400.5, 6, -12.5, 402, 12.5, -12, 'wall', zone);
  W.box(397.5, 9, -12.5, 400.5, 12.5, -12, 'wall', zone);
  B.timedGate({ min: [397.5, 6, -12.4], max: [400.5, 9, -12.1], color: RED, time: 3.2, zone, switch: { pos: [396, 7.8, -29], face: '+x' } });

  // ---------- the rack: shoot the ledges into a staircase ----------
  W.box(394, -6, -10, 412, 0, 2, 'wall', zone);
  plat(394, -10, 412, 2, 0, zone, 0.3, 'floor');
  cp(400, 0, -6, N);
  say([394, 0, -10], [412, 4, -3], 'Platform rack: the arrows above and below each rail move that ledge a notch. Make a staircase to the door.');
  W.box(394, 0, -0.6, 395, 1, 2, 'metal', zone); // a step up beside the first ledge (clear of its targets)
  B.platformRack({ pos: [396.4, 2, 2], face: '-z', columns: 3, notches: 4, step: 1.2, spacing: 3.4, start: [3, 4, 0], colors: [RED, YELLOW, BLUE], targetGap: 0.9, zone });
  // the wall, with the exit door at ledge height and a balcony beyond it over the start pad
  W.box(394, 0, 2, 405.8, 10, 3, 'wall', zone);
  W.box(408.4, 0, 2, 412, 10, 3, 'wall', zone);
  W.box(405.8, 0, 2, 408.4, 5.6, 3, 'wall', zone);
  W.box(405.8, 8.6, 2, 408.4, 10, 3, 'wall', zone);
  plat(405.2, 0.4, 409, 2, 5.6, zone, 0.4, 'floor');
  plat(403, 3, 410, 9, 5.6, zone, 0.4, 'floor');
  B.colorSwitch({
    pos: [406.5, 5.6, 6], face: 'up', color: BLUE, mode: 'once', size: 1.4, zone,
    onOn: (sw) => {
      game.hud.message('<b>TEST RANGE CLEAR</b> · drop down to go again', 4);
      for (const c of [0xff3344, 0xffd23a, 0x3dff7a, 0x3a8bff]) W.fx.ring(sw.center, null, c, { size: 0.5, end: 6, life: 0.8, thick: 0.06, k: 1.5 });
    },
  });
}

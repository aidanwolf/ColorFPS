// CRIMSON FOUNDRY — the opening level, laid out north (-z) from the spawn room:
// spawn room (yellow-locked vent secret + yellow door secret) → barrier corridor → the Crucible (spiked
// floating platforms over acid) → barrier corridor → the Hub's south door at z = -100.
import { RED, YELLOW } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { MovingPlatform, Checkpoint } from '../entities/misc.js';

// A red spike layer covering a Crucible platform. Its regrowth timer holds while you stand on (or hover
// over) the platform, so it never reforms under you or mid-hop; for its last second the spikes visibly
// push back up out of the slab and flicker. moveTo() lets it ride a moving platform.
class PlatformSpikes extends Barrier {
  constructor(W, { min, max, regen = 6, zone = 'red' }) {
    super(W, { min, max, color: RED, kind: 'spike', regen, zone });
    this.size = this.max.clone().sub(this.min);
  }

  // player center within the footprint (padded so a landing hop counts) and not far above it
  near(p) {
    const pad = 1.2;
    return p.pos.x > this.min.x - pad && p.pos.x < this.max.x + pad && p.pos.z > this.min.z - pad && p.pos.z < this.max.z + pad &&
      p.pos.y > this.min.y - 1 && p.pos.y < this.max.y + 4;
  }

  // knock the layer down without fx (a checkpoint respawn onto its platform)
  suppress() {
    if (this.broken) return;
    this.broken = true;
    this.solid.enabled = false;
    this.group.visible = false;
    this.timer = this.regen;
  }

  moveTo(x, y, z) {
    this.min.set(x, y, z);
    this.max.copy(this.min).add(this.size);
    this.solid.min.copy(this.min);
    this.solid.max.copy(this.max);
    this.place();
  }

  // group sits on the slab bottom so the regrowth / reform scaling grows up out of the platform
  place() {
    const g = this.group;
    g.position.set((this.min.x + this.max.x) / 2, this.min.y + (this.size.y * g.scale.y) / 2, (this.min.z + this.max.z) / 2);
  }

  update(dt, player) {
    if (this.broken && this.regen > 0 && this.near(player)) this.timer = Math.max(this.timer, 1 + dt);
    super.update(dt, player);
    if (this.broken && this.regen > 0) {
      const k = this.timer < 1 ? 1 - Math.max(0, this.timer) : 0;
      this.group.visible = k > 0 && (this.world.time * 14) % 1 < 0.7;
      this.group.scale.set(1, 0.05 + 0.3 * k, 1);
    }
    this.place();
  }

  restore() {
    super.restore();
    this.group.scale.setScalar(0.6);
  }
}

// A moving platform whose spike layer rides along with it.
class SpikedPlatform extends MovingPlatform {
  constructor(W, opts, regen) {
    super(W, opts);
    this.spikes = new PlatformSpikes(W, { min: [opts.min[0], opts.max[1], opts.min[2]], max: [opts.max[0], opts.max[1] + 0.6, opts.max[2]], regen, zone: opts.zone });
  }

  update(dt) {
    super.update(dt);
    this.spikes.moveTo(this.cur.x, this.cur.y + this.size.y, this.cur.z);
  }
}

export function buildRed(B) {
  const { W, game, CH, room, corridor, tunnelX, plat, pedestal, secretRoom, trophy, hint, area, light, barrierWall, devStart, onRespawn } = B;
  const zone = 'red';
  room({
    x1: -6, x2: 6, zS: 0, zN: -12, y: 0, h: 6, zone,
    n: [{ c: 0, w: 3, h: CH }],
    e: [{ c: -9, w: 1.2, h: 1.0 }],
    w: [{ c: -6, w: 2.4, h: 3 }],
  });
  // the Chroma Blaster on its pedestal
  pedestal(0, 0, -6, RED, zone);
  light(0, 5, -6, 0xffb0a0, 25, 20);
  // vent hint: hazard stripes above the crawlspace
  W.deco(5.95, 1.0, -9.8, 6.0, 1.2, -8.2, 'hazard', zone);
  W.deco(5.95, 0, -9.75, 6.0, 1.0, -9.6, 'hazard', zone);
  W.deco(5.95, 0, -8.4, 6.0, 1.0, -8.25, 'hazard', zone);

  // SECRET 1 — crawl through the vent, once you're back with yellow: a Solar energy lock seals its mouth
  let ventHinted = false;
  const ventLock = new Barrier(W, {
    min: [6.05, 0, -9.6], max: [6.35, 1.0, -8.4], color: YELLOW, kind: 'wall', zone,
    onBreak: () => game.hud.message('Vent open. Tight squeeze: hold <b>Ctrl</b> or <b>C</b> to crouch and crawl through.', 5),
  });
  W.trigger([4.3, 0, -10.4], [6, 2.2, -7.6], () => {
    if (ventLock.broken || ventHinted) return;
    ventHinted = true;
    game.hud.message('A <b>SOLAR</b> lock seals this vent. Come back once your blaster fires yellow.', 4);
  }, { once: false });
  tunnelX({ x1: 6.5, x2: 13.5, zc: -9, w: 1.2, y: 0, h: 1.0, zone });
  room({ x1: 14, x2: 18, zS: -6, zN: -12, y: 0, h: 3, zone, w: [{ c: -9, w: 1.2, h: 1.0 }] });
  trophy(16, 1, -9);
  light(16, 2.5, -9, 0xffcc55, 8, 8);
  secretRoom([14, 0, -12], [18, 3, -6], 'Maintenance Vent');

  // SECRET 2 — yellow door in the west wall (come back after Sector 2)
  new Barrier(W, { min: [-6.5, 0, -7.2], max: [-6, 3, -4.8], color: YELLOW, kind: 'door', zone });
  room({ x1: -13, x2: -7, zS: -3, zN: -9, y: 0, h: 4, zone, e: [{ c: -6, w: 2.4, h: 3 }] });
  trophy(-10, 1, -6);
  light(-10, 3.5, -6, 0xffd23a, 8, 9);
  secretRoom([-13, 0, -9], [-7, 3, -3], 'Solar Cache');

  // corridor of red barriers
  corridor({ zStart: -12.5, zEnd: -34.5, y: 0, zone });
  hint([-1.5, 0, -15], [1.5, 3, -13], 'Barriers only break under <b>their own color</b>. Hold <b>LMB</b> to fire.');
  barrierWall(-17.5, 0, RED, zone);
  barrierWall(-21.5, 0, RED, zone);
  barrierWall(-25.5, 0, RED, zone);
  new Drone(W, { pos: [0, 2.2, -31], color: RED, orbit: 0.5, range: 18 });

  // the Crucible — floating platforms over molten acid
  const zS = -35, zN = -81, z = (lz) => zS - lz;
  room({
    x1: -14, x2: 14, zS, zN, y: -6, h: 20, zone,
    s: [{ c: 0, w: 3, h: CH, y0: 6 }],
    n: [{ c: 0, w: 3, h: CH, y0: 10 }],
  });
  W.box(-14, -6, zN, 14, -5.6, zS, 'acid', zone, { hazard: 'acid' });
  W.box(-5, -6, z(6), 5, 0, zS, 'plat', zone);
  new Checkpoint(W, game, { pos: [0, 0, z(3)], yaw: 0, size: [10, 3, 6] });
  hint([-5, 0, z(6)], [5, 3, z(3)], 'Every platform is <b>spiked</b>. Shoot the red spikes off the next one, then <b>Space</b> to jump — the acid is instant death.', 6);
  // every floating platform carries a red spike layer: clear the next one from where you stand, then hop
  const spiked = (x1, lz1, x2, lz2, top, regen = 6) => {
    plat(x1, z(lz1), x2, z(lz2), top, zone);
    return new PlatformSpikes(W, { min: [x1, top, z(lz2)], max: [x2, top + 0.6, z(lz1)], regen, zone });
  };
  spiked(-1.5, 8.5, 1.5, 11.5, 0.5);
  hint([-1.5, 0.5, z(11.5)], [1.5, 3, z(8.5)], 'Shattered spikes <b>regrow</b> once you leave — they flicker just before. Never under your feet.', 5);
  spiked(-6.5, 13, -3.5, 16, 1.2);
  hint([-6.5, 1.2, z(16)], [-3.5, 4, z(13)], 'Clear the <b>moving platform</b> as it swings back to you, then hop on.', 5);
  new SpikedPlatform(W, { min: [-6.5, 1.2, z(21)], max: [-3.5, 1.8, z(18)], offset: [10, 0, 0], speed: 2.2, zone }, 8);
  // mid-room checkpoint: respawning here knocks this platform's spikes down until you move on
  const midSpikes = spiked(3.25, 22.75, 6.75, 26.25, 2.4);
  const midCheckpoint = new Checkpoint(W, game, { pos: [5, 2.4, z(24.5)], yaw: 0.74, size: [3.5, 3, 3.5] });
  onRespawn(() => {
    if (game.checkpoint?.ref === midCheckpoint) midSpikes.suppress();
  });
  spiked(-1.5, 28.5, 1.5, 31.5, 3.2);
  spiked(-6.5, 33.5, -3.5, 36.5, 3.8);
  // a red energy curtain hangs across the last hop: break it before you jump
  W.box(-7.6, 7.2, z(38.4), -1.4, 7.5, z(38.1), 'metal', zone);
  new Barrier(W, { min: [-7.4, 3.6, z(38.35)], max: [-1.6, 7.2, z(38.15)], color: RED, kind: 'wall', zone });
  W.box(-6, -6, zN, 6, 4, z(39), 'plat', zone);
  new Drone(W, { pos: [6, 3.2, z(10)], color: RED, orbit: 1.2, range: 20 });
  new Drone(W, { pos: [-8, 5, z(18)], color: RED, range: 24 });
  new Drone(W, { pos: [8, 6.5, z(30)], color: RED, range: 24 });
  new Drone(W, { pos: [0, 8, z(40)], color: RED, range: 24 });
  light(0, 11, z(14), 0xff5533, 60, 40);
  light(0, 11, z(36), 0xff5533, 60, 40);

  corridor({ zStart: -81.5, zEnd: -99.5, y: 4, zone }); // runs into the Hub's south door
  barrierWall(-86, 4, RED, zone);
  barrierWall(-90, 4, RED, zone);
  new Drone(W, { pos: [0, 6, -93.5], color: RED, orbit: 0.4, range: 14 });

  area([-6, 0, -12], [6, 6, 0], { ambient: 'amb_foundry', atmosphere: 'foundry' });
  area([-1.5, 4, -99.5], [1.5, 7, -95], { music: 'music_red', ambient: 'amb_foundry', atmosphere: 'foundry' });
  devStart('red', [0, 0, -2], 0, []);
  devStart('crucible', [0, 0, -38], 0, [RED]);
}

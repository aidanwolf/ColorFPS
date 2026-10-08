// Areas restock while you're away: when you leave an area, its destroyed drones are rebuilt and its
// broken barriers and spike layers reform, so every trip back through is another run to shoot through.
// (Done on leaving, never on entering, so nothing can reappear on top of you.)
import { regionOf } from './levels/regions.js';
import { Drone } from './entities/drone.js';
import { Barrier } from './entities/barrier.js';

export class Restock {
  constructor(world) {
    this.world = world;
    this.region = null;
    // every drone the level placed, by area (drones spawned later, e.g. by encounters, aren't included)
    this.drones = world.entities.filter((e) => e instanceof Drone).map((d) => ({ d, region: regionOf(d.home), opts: d.spawnOpts }));
    this.barriers = world.entities.filter((e) => e instanceof Barrier).map((b) => ({ b, region: regionOf(b.min.clone().add(b.max).multiplyScalar(0.5)) }));
  }

  update(player) {
    const r = regionOf(player.pos);
    if (r === this.region) return;
    const left = this.region;
    this.region = r;
    if (left) this.restock(left, player);
  }

  restock(region, player) {
    for (const rec of this.drones) {
      if (rec.region !== region || !rec.d.dead || !rec.opts) continue;
      if (this.world.entities.includes(rec.d)) continue; // still crashing / scattering debris
      rec.d = new Drone(this.world, rec.opts);
      this.world.cull(rec.d.group);
    }
    for (const { b, region: br } of this.barriers) {
      if (br !== region || !b.broken) continue;
      const c = b.min.clone().add(b.max).multiplyScalar(0.5);
      if (c.distanceTo(player.pos) < 8) continue;
      b.restore();
    }
  }
}

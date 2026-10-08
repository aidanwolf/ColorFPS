// STAGE VI · THE HEART — inside the machine: a disc of light adrift in a prismatic void, four pylons of
// the world colors round its rim, and above it all the Prism Heart itself, the core that drank the worlds,
// laid bare and pulsing. The Warden fights in every color at once with every trick it learned:
//   shield chipping in fast-shifting colors, the blade, shockwaves, orbs and its charge, plus slag
//   geysers, sun lances, sweeping vines, ice spikes and spore pods, chosen at random.
// When it falls, the heart cracks, the pylons pour their light into it, and it shatters.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../../colors.js';
import { SporePod } from './hazards.js';
import { audio } from '../../audio.js';

const C = { x: 850, z: -420 };
const R = 22; // the disc's radius
const HEART_Y = 34;
const _v = new THREE.Vector3();

export function buildHeart({ B, W, game, level, H, boss }) {
  const { light, blocker } = B;
  const zone = 'boss';
  const X = (x) => C.x + x, Z = (z) => C.z + z;

  // ---------------------------------------------------------------- the disc
  // floor: strips approximating a circle, with a glowing rim; an invisible wall round its edge
  for (let z = -R; z < R; z += 2) {
    const zc = Math.abs(z + 1), hw = Math.sqrt(Math.max(0, R * R - zc * zc));
    W.box(X(-hw), -1, Z(z), X(hw), 0, Z(z + 2), 'floor', zone);
    W.box(X(-hw * 0.8), -3, Z(z), X(hw * 0.8), -1, Z(z + 2), 'metal', zone);
  }
  const N = 110;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, x = Math.cos(a) * (R + 0.7), z = Math.sin(a) * (R + 0.7);
    blocker([X(x - 0.9), 0, Z(z - 0.9)], [X(x + 0.9), 6, Z(z + 0.9)]);
  }
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe6ff).multiplyScalar(1.6) });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 6, 96), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(X(0), 0.05, Z(0));
  W.scene.add(rim);
  // a curtain of light at the rim (shows the invisible wall)
  const curtainMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){
        float a = vUv.x * 6.2832;
        vec3 c = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + a * 4.0 + uTime * 0.4);
        float s = 0.6 + 0.4 * sin(vUv.x * 300.0 + uTime * 2.0);
        gl_FragColor = vec4(c * s * 0.35 * smoothstep(1.0, 0.0, vUv.y), 1.0);
      }`,
  });
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.2, R + 0.2, 3, 96, 1, true).translate(0, 1.5, 0), curtainMat);
  curtain.position.set(X(0), 0, Z(0));
  W.scene.add(curtain);
  // circuit rings inlaid in the floor
  for (const r of [6, 12, 17]) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.08, r, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb890ff).multiplyScalar(1.4) }));
    m.position.set(X(0), 0.02, Z(0));
    W.scene.add(m);
  }
  // four pylons of the world colors round the rim (cover), each feeding a beam up into the heart
  const pylons = [];
  const beamGeo = new THREE.CylinderGeometry(0.15, 0.15, 1, 8, 1, true).translate(0, 0.5, 0);
  [[0, -18], [18, 0], [0, 18], [-18, 0]].forEach(([x, z], i) => {
    W.box(X(x - 1.2), 0, Z(z - 1.2), X(x + 1.2), 6, Z(z + 1.2), 'metal', zone);
    W.deco(X(x - 1.25), 5.9, Z(z - 1.25), X(x + 1.25), 6.05, Z(z + 1.25), 'glow' + i, zone);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[i].hex).multiplyScalar(2) }));
    crystal.position.set(X(x), 8, Z(z));
    W.scene.add(crystal);
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[i].hex).multiplyScalar(1.6), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    const from = new THREE.Vector3(X(x), 8, Z(z)), to = new THREE.Vector3(X(0), HEART_Y, Z(0));
    beam.position.copy(from);
    beam.scale.set(1, from.distanceTo(to), 1);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    W.scene.add(beam);
    pylons.push({ crystal, beam, beamMat, color: COLORS[i].hex });
  });
  // ARMOR: one, tucked behind the far (north) pylon; slow to come back, this is the last fight.
  B.armor([X(0), 0, Z(-20.6)], { respawn: 60 });
  // the Prism Heart: a vast faceted crystal, slowly turning, its light pulsing through every color
  const heartMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xb890ff, emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.1, flatShading: true, transparent: true, opacity: 0.92 });
  const heart = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.OctahedronGeometry(6, 0), heartMat);
  outer.scale.y = 1.5;
  const innerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.6) });
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), innerMat);
  heart.add(outer, inner);
  heart.position.set(X(0), HEART_Y, Z(0));
  W.scene.add(heart);
  // shards orbiting it (one instanced mesh)
  const SHARDS = 60;
  const shardMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xd8c8ff, emissive: 0x6a3cff, emissiveIntensity: 0.8, flatShading: true, roughness: 0.1 }), SHARDS);
  const shardData = Array.from({ length: SHARDS }, (_, i) => ({ r: 10 + (i % 7) * 2.2, a: i * 2.4, y: HEART_Y - 8 + (i % 9) * 2, s: 0.4 + (i % 4) * 0.25, sp: 0.1 + (i % 5) * 0.04 }));
  W.scene.add(shardMesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), e = new THREE.Euler();
  let spinUp = 1;
  const placeShards = (dt, t) => {
    shardData.forEach((d, i) => {
      d.a += dt * d.sp * spinUp;
      e.set(t * 0.5 + i, t * 0.7 + i * 2, 0);
      q.setFromEuler(e);
      m4.compose(_v.set(X(Math.cos(d.a) * d.r), d.y + Math.sin(t + i) * 0.6, Z(Math.sin(d.a) * d.r)), q, sv.set(d.s * 0.5, d.s * 1.4, d.s * 0.5));
      shardMesh.setMatrixAt(i, m4);
    });
    shardMesh.instanceMatrix.needsUpdate = true;
  };
  placeShards(0, 0);
  shardMesh.computeBoundingSphere();
  // the void below: crystal spires hanging under the disc
  const spires = [];
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2, r = 4 + (k % 4) * 4.5, h = 8 + (k % 5) * 5;
    const g = new THREE.ConeGeometry(1 + (k % 3) * 0.5, h, 5).rotateX(Math.PI).translate(X(Math.cos(a) * r), -3 - h / 2, Z(Math.sin(a) * r));
    spires.push(g);
  }
  W.scene.add(new THREE.Mesh(mergeGeometries(spires.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x3a2a60, emissive: 0x2a1060, emissiveIntensity: 0.6, flatShading: true })));
  light(X(0), 14, Z(0), 0xd0b0ff, 14, 40);

  level.atmospheres.finHeart = {
    fog: 0x0c0820, fogNear: 70, fogFar: 260,
    skyTop: [0.01, 0.005, 0.04], skyMid: [0.035, 0.015, 0.09], skyHorizon: [0.12, 0.04, 0.2], aurora: 0.55, stars: 1.4,
    hemiSky: 0xcbb4ff, hemiGround: 0x1d1430, hemiIntensity: 1.1,
    sunColor: 0xe8d8ff, sunIntensity: 0.9, sunDir: [0.2, 1, 0.3],
    exposure: 1.0, bloom: 0.6,
  };

  // ---------------------------------------------------------------- the remix
  const onDisc = (x, z) => Math.hypot(x - C.x, z - C.z) < R - 1.2;
  const specials = {
    geysers: {
      weight: 1,
      pose: 'pound',
      start(b, a) {
        a.waves = 2;
        a.next = 0.2;
      },
      update(b, a, dt, player) {
        if (a.waves > 0 && a.t >= a.next) {
          a.waves--;
          a.next += 1.0;
          H.erupt(player.pos.x, 0, player.pos.z, { kind: 'lava', radius: 1.8, warn: 0.9, dur: 0.9, height: 9 });
          for (let i = 0; i < 2; i++) {
            const ang = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4, x = player.pos.x + Math.cos(ang) * r, z = player.pos.z + Math.sin(ang) * r;
            if (onDisc(x, z)) H.erupt(x, 0, z, { kind: 'lava', radius: 1.6, warn: 0.9, dur: 0.9, height: 9, delay: 0.15 });
          }
        }
        return a.t > 2.6;
      },
    },
    lances: {
      weight: 1,
      pose: 'raise',
      start(b, a) {
        a.done = false;
      },
      update(b, a, dt, player) {
        if (!a.done && a.t > 0.2) {
          a.done = true;
          // a ring closes round you (gaps of ~3 m), then the middle goes up
          const off = Math.random() * Math.PI;
          for (let k = 0; k < 6; k++) {
            const ang = off + (k / 6) * Math.PI * 2;
            H.erupt(player.pos.x + Math.cos(ang) * 6, 0, player.pos.z + Math.sin(ang) * 6, { kind: 'sun', radius: 1.3, warn: 0.95, dur: 0.8, height: 30 });
          }
          H.erupt(player.pos.x, 0, player.pos.z, { kind: 'sun', radius: 2.8, warn: 0.95, dur: 0.8, height: 30, delay: 0.35 });
        }
        return a.t > 2.2;
      },
    },
    vines: {
      weight: 1,
      pose: 'raise',
      start(b) {
        const axisX = Math.random() < 0.5, dir = Math.random() < 0.5 ? 1 : -1, high = Math.random() < 0.5;
        const c0 = axisX ? C.x : C.z, o0 = axisX ? C.z : C.x;
        H.sweep({ axis: axisX ? 'x' : 'z', from: c0 - dir * (R + 1), to: c0 + dir * (R + 1), lo: o0 - R - 1, hi: o0 + R + 1, y0: high ? 1.15 : 0, y1: high ? 2.6 : 0.85, floorY: 0, speed: 10, warn: 1.2 });
        game.hud.bossHint(high ? 'A vine — HIGH: crouch under it!' : 'A vine — LOW: jump it!', true);
        audio.charge();
      },
      update(b, a) {
        return a.t > 1.6;
      },
    },
    icespikes: {
      weight: 1,
      pose: 'pound',
      start(b, a) {
        a.done = false;
      },
      update(b, a, dt, player) {
        if (!a.done) {
          a.done = true;
          const ang = Math.atan2(player.pos.x - b.pos.x, player.pos.z - b.pos.z);
          for (let k = 0; k < 9; k++) {
            const d = 4 + k * 2.6, x = b.pos.x + Math.sin(ang) * d, z = b.pos.z + Math.cos(ang) * d;
            if (onDisc(x, z)) H.erupt(x, 0, z, { kind: 'ice', radius: 1.45, warn: 0.7, dur: 0.8, height: 3, delay: k * 0.08 });
          }
          audio.shatter();
        }
        return a.t > 1.6;
      },
    },
    spores: {
      weight: 1,
      pose: 'cast',
      start(b, a) {
        a.thrown = 0;
      },
      update(b, a, dt, player) {
        if (a.thrown < 3 && a.t > 0.4 + a.thrown * 0.3) {
          a.thrown++;
          const hand = b.limbs.armL.hand.getWorldPosition(new THREE.Vector3());
          const ang = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5;
          let x = player.pos.x + Math.cos(ang) * r, z = player.pos.z + Math.sin(ang) * r;
          if (!onDisc(x, z)) [x, z] = [player.pos.x, player.pos.z];
          new SporePod(W, hand, new THREE.Vector3(x, 0, z), Math.floor(Math.random() * 4), { flight: 1.0, fuse: 2.4, cloud: 3.0, life: 3.2 });
        }
        return a.t > 1.8;
      },
    },
  };

  // ---------------------------------------------------------------- the ending
  let dying = -1, shattered = false;
  const stage = {
    key: 'heart',
    name: 'THE PRISM WARDEN',
    title: 'VI · THE HEART',
    sub: 'FINAL STAGE',
    main: 'THE HEART OF THE PRISM',
    color: '#ffffff',
    hp: 2200,
    tier: 3,
    form: 'heart',
    blade: 0xffffff,
    ring: 0xff4060,
    shield: true,
    shieldDown: 5,
    dmg: { core: 9, hole: 4, kneel: 15, limb: 3, head: 5, broken: 1, torso: 1 }, // (the open core carries it; armor is chip)
    attacks: { sweep: 2, slam: 2, volley: 2, charge: 1, geysers: 1, lances: 1, vines: 1, icespikes: 1, spores: 1 },
    specials,
    env: 0.25, // image-based light (main's default 0.35)
    intensity: 3, // combat director attack tokens
    walk: true,
    pace: 1.1,
    spawn: new THREE.Vector3(X(0), 0, Z(-6)),
    floorY: 0,
    yaw: 0,
    bounds: { minX: X(-15), maxX: X(15), minZ: Z(-15), maxZ: Z(15) },
    playerStart: new THREE.Vector3(X(0), 0, Z(16)),
    playerYaw: 0,
    atmosphere: 'finHeart',
    music: 'music_finale_heart',
    musicFallback: 'music_boss_final',
    introHint: 'Every color at once: chip the shield in ITS color, then hit the core in ITS color!',
    intro: '<b>THE HEART OF THE PRISM.</b> Everything it learned, all at once. <b>Finish it.</b>',
    tips: {},
    reset() {
      dying = -1;
      shattered = false;
      spinUp = 1;
      heart.visible = true;
      heart.scale.setScalar(1);
      for (const p of pylons) p.beamMat.opacity = 0.5;
    },
    update(dt) {
      stage.animate(dt);
    },
    animate(dt) {
      const t = W.time;
      curtainMat.uniforms.uTime.value += dt;
      heart.rotation.y += dt * 0.25 * spinUp;
      heart.position.y = HEART_Y + Math.sin(t * 0.8) * 0.6;
      heartMat.emissive.setHSL((t * 0.07) % 1, 0.8, 0.55);
      const pulse = 1 + Math.sin(t * 2.4) * 0.04;
      inner.scale.setScalar(pulse * (1 + (dying >= 0 ? dying * 0.15 : 0)));
      innerMat.color.setHSL((t * 0.07 + 0.5) % 1, 0.7, 0.6).multiplyScalar(1.6 + (dying >= 0 ? dying * 0.4 : 0));
      placeShards(dt, t);
      pylons.forEach((p, i) => {
        p.crystal.rotation.y += dt * 1.2;
        p.beamMat.opacity = 0.35 + 0.2 * Math.sin(t * 3 + i) + (dying >= 0 ? Math.min(0.6, dying * 0.15) : 0);
      });
    },
    // the Warden falls: the heart cracks, the pylons pour light into it, then it shatters
    onDying() {
      dying = 0;
      game.hud.bossHint('The Warden is breaking — and the heart of the machine with it!', true);
    },
    deathFx(T, dt) {
      dying = T;
      spinUp = 1 + T * 2;
      stage.animate(dt);
      heart.position.x = X(0) + (Math.random() - 0.5) * T * 0.15;
      const fx = W.fx;
      if (Math.random() < dt * (6 + T * 6)) {
        const p = pylons[Math.floor(Math.random() * 4)];
        fx.burst(heart.position, p.color, { count: 24, speed: 9, life: 1.0, size: 0.6, gravity: 2, mode: 'shard' });
      }
      if (!shattered && T > 4.6) {
        shattered = true;
        heart.visible = false;
        for (let i = 0; i < 4; i++) fx.burst(heart.position, COLORS[i].hex, { count: 220, speed: 22, life: 2.4, size: 0.9, gravity: 4, mode: 'shard' });
        fx.burst(heart.position, 0xffffff, { count: 120, speed: 30, life: 1.4, size: 1.2, gravity: 0 });
        audio.explode(true);
        audio.sample('heart_shatter', { gain: 1 }) || audio.shieldBreak();
        game.player.shake = 1;
        game.hud.whiteFlash();
      }
    },
  };
  // the heart and its shards turn even before the fight reaches them (cheap; culled when away)
  W.add({
    update(dt) {
      if (dying < 0 && boss.stageIdx !== 5) heart.rotation.y += dt * 0.1;
    },
  });
  return stage;
}

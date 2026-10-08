import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COLORS, RED, YELLOW, GREEN, BLUE } from './colors.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Blaster } from './weapon.js';
import { Hud } from './hud.js';
import { buildLevel } from './level.js';
import { ads } from './monetization/bonusround.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');

function loadSettings() {
  const d = { sensitivity: 1, fov: 90, volume: 0.7, invertY: false };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem('chroma-settings') || '{}') };
  } catch {
    return d;
  }
}

class Game {
  constructor() {
    this.settings = loadSettings();
    this.state = 'title';
    this.stats = { time: 0, deaths: 0 };
    this.secretsFound = 0;

    // ---- renderer / scene ----
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    $('#game').appendChild(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x0b0918);
    scene.fog = new THREE.Fog(0x140f26, 35, 190);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    this.addSky();
    scene.add(new THREE.HemisphereLight(0xb9c3ff, 0x2a2030, 1.1));
    const sun = new THREE.DirectionalLight(0xffe2c4, 1.5);
    sun.position.set(0.5, 1, 0.3);
    scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.05, 800);
    scene.add(this.camera);

    // ---- game systems ----
    this.input = new Input(renderer.domElement);
    this.hud = new Hud();
    this.world = new World(this);
    this.player = new Player(this);
    this.blaster = new Blaster(this);
    this.level = buildLevel(this.world, this);
    this.world.finalize();
    this.hud.buildColors(this.blaster);
    this.hud.setSecrets(0, this.level.secretsTotal);
    this.player.spawn(this.level.spawn, this.level.spawnYaw);
    this.checkpoint = { pos: this.level.spawn.clone(), yaw: this.level.spawnYaw, ref: null };

    // ---- post processing: world → bloom → view model on top → output ----
    const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    const vm = new RenderPass(this.blaster.vmScene, this.blaster.vmCamera);
    vm.clear = false;
    vm.clearDepth = true;
    this.composer.addPass(vm);
    this.composer.addPass(new OutputPass());

    addEventListener('resize', () => this.resize());
    this.resize();
    this.bindUi();
    this.input.onLockChange = (locked) => this.onLockChange(locked);

    // ---- Bonus Round ----
    ads.load();
    ads.attach({
      THREE,
      scene,
      camera: this.camera,
      renderer,
      onStart: () => this.onAdStart(),
      onEnd: () => this.onAdEnd(),
    });
    ads.safe(true);

    if (params.get('start') === 'boss' || params.get('start') === 'gauntlet') this.devSkip(params.get('start'));

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    renderer.setAnimationLoop(() => this.tick());
  }

  addSky() {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform float uTime;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float h = vDir.y;
          vec3 top = vec3(0.03, 0.03, 0.10);
          vec3 mid = vec3(0.16, 0.06, 0.24);
          vec3 hor = vec3(0.55, 0.20, 0.32);
          vec3 c = mix(hor, mid, smoothstep(-0.05, 0.25, h));
          c = mix(c, top, smoothstep(0.25, 0.9, h));
          // prismatic aurora bands
          float band = sin(vDir.x * 6.0 + uTime * 0.05) * 0.5 + 0.5;
          float a = smoothstep(0.15, 0.45, h) * smoothstep(0.75, 0.45, h);
          c += a * 0.12 * vec3(band, 0.4 + 0.6 * (1.0 - band), 0.9);
          // stars
          vec3 p = floor(vDir * 300.0);
          float s = step(0.9975, hash(p)) * smoothstep(0.1, 0.4, h);
          c += vec3(s);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.blaster.vmCamera.aspect = w / h;
    this.blaster.vmCamera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ UI / states
  showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    const overlay = $('#overlay');
    if (!name) {
      overlay.classList.add('clear');
      return;
    }
    overlay.classList.remove('clear');
    $('#screen-' + name).classList.remove('hidden');
  }

  bindUi() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]')?.dataset.action;
      if (!a) return;
      audio.unlock();
      if (a === 'play') this.play();
      else if (a === 'resume') this.resume();
      else if (a === 'settings') this.openSettings();
      else if (a === 'settings-back') this.showScreen(this.settingsReturn);
      else if (a === 'checkpoint') this.respawn();
      else if (a === 'quit') location.reload();
      else if (a === 'respawn') this.respawn();
      else if (a === 'revive') this.revive();
      else if (a === 'continue') this.resume();
    });
    const bind = (id, key, parse, after) => {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = this.settings[key];
      else el.value = this.settings[key];
      el.addEventListener('input', () => {
        this.settings[key] = parse(el);
        try {
          localStorage.setItem('chroma-settings', JSON.stringify(this.settings));
        } catch {
          /* storage unavailable: settings last for this session only */
        }
        after?.();
      });
    };
    bind('#set-sens', 'sensitivity', (el) => +el.value);
    bind('#set-fov', 'fov', (el) => +el.value, () => {
      this.camera.fov = this.settings.fov;
      this.camera.updateProjectionMatrix();
    });
    bind('#set-vol', 'volume', (el) => +el.value, () => audio.setVolume(this.settings.volume));
    bind('#set-invert', 'invertY', (el) => el.checked);
    audio.setVolume(this.settings.volume);
    // a "Continue" button for after Bonus Rounds (re-locking the pointer needs a click)
    const ad = $('#screen-ad');
    const btns = document.createElement('div');
    btns.className = 'buttons';
    btns.innerHTML = '<button data-action="continue" class="primary">Continue</button>';
    ad.appendChild(btns);
    this.adContinue = btns;
  }

  openSettings() {
    this.settingsReturn = this.state === 'title' ? 'title' : 'pause';
    this.showScreen('settings');
  }

  play() {
    audio.unlock();
    audio.startMusic();
    this.state = 'playing';
    this.hud.show(true);
    this.showScreen(null);
    this.input.requestLock();
    ads.safe(false);
    if (!this.started) {
      this.started = true;
      this.hud.zoneTitle('SECTOR 1', 'CRIMSON FOUNDRY', '#ff3344');
      setTimeout(() => this.hud.message('Grab the <b>Chroma Blaster</b> from the pedestal.', 5), 1200);
    }
  }

  resume() {
    if (this.player.dead) return this.respawn();
    this.state = 'playing';
    this.showScreen(null);
    this.input.requestLock();
    ads.safe(false);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    const t = Math.floor(this.stats.time);
    $('#pause-stats').textContent = `Time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · Secrets ${this.secretsFound}/${this.level.secretsTotal} · Deaths ${this.stats.deaths}`;
    this.showScreen('pause');
    ads.safe(true);
  }

  onLockChange(locked) {
    if (locked) return;
    if (this.inBreak || this.state === 'ad') return;
    if (this.state === 'playing') this.pause();
  }

  // ------------------------------------------------------------------ progression hooks
  setCheckpoint(pos, yaw, ref) {
    this.checkpoint = { pos: pos.clone(), yaw, ref };
    audio.checkpoint();
    this.hud.message('Checkpoint', 1.5);
    this.player.heal(10);
  }

  unlockColor(c) {
    const first = !this.blaster.has;
    this.blaster.give(c);
    audio.unlock(c);
    const name = `<b>${COLORS[c].name}</b>`;
    if (first) this.hud.message(`${name} blaster online. <b>LMB</b> to fire.`, 4);
    else this.hud.message(`${name} unlocked — press <b>${c + 1}</b>. Remember those ${name}-marked doors?`, 6);
    // finishing a color world is a natural break for a Bonus Round
    if (!first) setTimeout(() => this.naturalBreak(), 2500);
  }

  foundSecret(label) {
    this.secretsFound++;
    this.hud.setSecrets(this.secretsFound, this.level.secretsTotal);
    this.hud.message(`SECRET FOUND — <b>${label}</b> (${this.secretsFound}/${this.level.secretsTotal})`, 4);
    audio.secret();
  }

  startBoss() {
    this.level.setSeal(true);
    audio.door();
    this.level.boss.start();
    this.hud.bossShow(true);
    this.hud.bossBar(1);
    audio.setIntensity(2);
    ads.safe(false);
  }

  onBossDying() {
    this.hud.bossHint('The Warden is breaking apart!', true);
  }

  onBossDefeated() {
    this.level.setSeal(false);
    this.hud.bossShow(false);
    audio.setIntensity(0);
    this.hud.zoneTitle('PRISM WARDEN', 'SHATTERED', '#ffd23a');
    setTimeout(async () => {
      await this.naturalBreak();
      this.victory();
    }, 4000);
  }

  victory() {
    this.state = 'victory';
    this.input.exitLock();
    const t = Math.floor(this.stats.time);
    $('#victory-stats').innerHTML = `
      <span>Time</span><span>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span>
      <span>Deaths</span><span>${this.stats.deaths}</span>
      <span>Secrets</span><span>${this.secretsFound}/${this.level.secretsTotal}</span>
      <span>Max integrity</span><span>${this.player.maxHealth}</span>`;
    this.showScreen('victory');
    ads.safe(true);
  }

  onPlayerDeath() {
    this.state = 'dead';
    this.stats.deaths++;
    this.deathPos = this.player.pos.clone();
    this.deathYaw = this.player.yaw;
    this.input.exitLock();
    audio.explode();
    $('#screen-dead [data-action="revive"]').classList.toggle('hidden', !ads.available);
    this.showScreen('dead');
    ads.safe(true);
  }

  respawn() {
    const p = this.player;
    p.spawn(this.checkpoint.pos, this.checkpoint.yaw);
    p.health = p.maxHealth;
    p.invuln = 1.5;
    const boss = this.level.boss;
    if (boss.active) {
      boss.resetState();
      this.level.setSeal(false);
      this.level.bossTrigger.fired = false;
      this.level.bossTrigger.inside = false;
      this.hud.bossShow(false);
      audio.setIntensity(1);
    }
    for (const pr of this.world.projectiles) pr.alive = false;
    this.state = 'playing';
    this.showScreen(null);
    this.input.requestLock();
    ads.safe(false);
  }

  // Rewarded Bonus Round: finish it and you're revived on the spot.
  async revive() {
    let rewarded = false;
    this.inBreak = true;
    const result = await ads.rewarded(() => (rewarded = true));
    this.inBreak = false;
    this.adActive = false;
    audio.setVolume(this.settings.volume);
    if (!rewarded) {
      if (!result.filled) return this.respawn();
      // they left the round early: back to the death screen
      this.state = 'dead';
      this.showScreen('dead');
      return;
    }
    const p = this.player;
    p.dead = false;
    p.spawn(this.deathPos, this.deathYaw);
    p.health = Math.ceil(p.maxHealth * 0.6);
    p.invuln = 3;
    for (const pr of this.world.projectiles) pr.alive = false;
    this.hud.message('Revived — thanks for playing the Bonus Round!', 3);
    this.state = 'ad';
    this.adContinue.classList.remove('hidden');
    this.showScreen('ad');
    $('#screen-ad h2').textContent = 'Revived!';
  }

  // Natural break: request an intermission round. Gameplay freezes while the request is out
  // (breaks only happen at safe moments). If nothing fills, play resumes with no click needed.
  // break() resolving is the reliable end signal, so we don't depend on the SDK's start/end events.
  async naturalBreak() {
    if (!ads.enabled) return;
    this.inBreak = true;
    const result = await ads.intermission();
    this.inBreak = false;
    if (import.meta.env.DEV) console.info('[chroma] intermission result', JSON.stringify(result));
    if (this.adActive) this.onAdEnd();
    else if (result.filled && this.state !== 'ad') {
      // a round played but we never saw it start: still hand back control with a Continue click
      this.onAdStart();
      this.onAdEnd();
    }
  }

  // Called on the SDK's start event, or its first impression/viewable event as a fallback. Idempotent.
  onAdStart() {
    if (this.adActive) return;
    this.adActive = true;
    this.prevState = this.state;
    this.state = 'ad';
    this.input.exitLock();
    audio.setVolume(0);
    this.adContinue.classList.add('hidden');
    $('#screen-ad h2').textContent = 'Bonus Round';
    this.showScreen('ad');
  }

  onAdEnd() {
    if (!this.adActive) return;
    this.adActive = false;
    audio.setVolume(this.settings.volume);
    if (this.prevState === 'dead' || this.prevState === 'victory' || this.prevState === 'title') {
      this.state = this.prevState;
      this.showScreen(this.prevState);
      return;
    }
    $('#screen-ad h2').textContent = 'Back to the breach';
    this.adContinue.classList.remove('hidden');
    this.showScreen('ad');
  }

  // ------------------------------------------------------------------ dev helpers (?dev)
  devSkip(where) {
    [RED, YELLOW, GREEN, BLUE].forEach((c) => this.blaster.give(c));
    this.blaster.setColor(RED, true);
    const pos = where === 'boss' ? new THREE.Vector3(0, 4.4, -341) : new THREE.Vector3(0, 4.4, -286);
    this.player.spawn(pos, 0);
    this.checkpoint = { pos, yaw: 0, ref: null };
    this.started = true;
  }

  devKeys() {
    const i = this.input;
    if (i.hit('KeyG')) {
      this.godMode = !this.godMode;
      this.hud.message(`God mode ${this.godMode ? 'ON' : 'OFF'}`, 1.5);
    }
    if (i.hit('KeyU')) [RED, YELLOW, GREEN, BLUE].forEach((c) => this.blaster.give(c));
    if (i.hit('KeyB')) {
      this.player.spawn(new THREE.Vector3(0, 4.4, -341), 0);
    }
    if (i.hit('KeyK') && this.level.boss.active) this.level.boss.damage(600);
  }

  // ------------------------------------------------------------------ main loop
  // One gameplay step. Entities update first so moving platforms publish their delta before the player rides them.
  step(dt) {
    this.stats.time += dt;
    this.world.update(dt, this.player);
    this.player.update(dt, this.input, this.settings);
    this.blaster.update(dt, this.input);
    this.hud.setHealth(this.player.health, this.player.maxHealth);
  }

  tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    const t = this.timer.getElapsed();
    this.sky.material.uniforms.uTime.value = t;
    this.sky.position.copy(this.camera.position);

    if (this.state === 'playing') {
      if (DEV) this.devKeys();
      if (!this.inBreak) this.step(dt);
    } else if (this.state === 'title') {
      // slow look around the spawn room behind the menu
      this.camera.position.set(Math.sin(t * 0.1) * 2, 2.2, -1.5);
      this.camera.rotation.set(-0.05, Math.sin(t * 0.15) * 0.6, 0, 'YXZ');
      this.world.fx.update(dt);
    } else {
      this.world.fx.update(dt);
    }
    this.hud.update(dt);
    this.composer.render();
    this.input.endFrame();
  }
}

window.game = new Game();

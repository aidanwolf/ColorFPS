import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COLORS, RED, YELLOW, GREEN, BLUE } from './colors.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { World } from './world.js';
import { Player, AIR_MAX } from './player.js';
import { Blaster } from './weapon.js';
import { Hud } from './hud.js';
import { buildLevel } from './level.js';
import { Batcher } from './batch.js';
import { currentObjective } from './levels/guide.js';
import { regionOf, PORTALS, PORTAL_BLEND } from './levels/regions.js';
import { updateLiquids } from './liquid.js';
import { Restock } from './restock.js';
import { director } from './combat/director.js';
import { barks } from './combat/barks.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { ads } from './monetization/bonusround.js';
import { TouchControls } from './touch.js';
import { UnlockCutscene } from './cutscene.js';
import { MapView } from './map.js';
import { spawnEnemy, Encounter } from './entities/combat.js';
import { Checkpoint } from './entities/misc.js';
import { saveProgress } from './progress.js';
import { jumpSetup, buildLocationList } from './levelSelect.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// the music, ambience and atmosphere to resume with in each area (see levels/regions.js)
const AREA_MOOD = {
  red: { music: 'music_red', ambient: 'amb_foundry', atmosphere: 'foundry' },
  hub: { music: 'music_hub', ambient: 'amb_hub', atmosphere: 'hub' },
  solar: { music: 'music_solar', ambient: 'amb_solar', atmosphere: 'solar' },
  verdant: { music: 'music_green', ambient: 'amb_jungle', atmosphere: 'verdant' },
  azure: { music: 'music_blue', ambient: 'amb_abyss', atmosphere: 'azure' },
  prism: { music: 'music_antechamber', ambient: 'amb_core', atmosphere: 'prism' },
  // ---- final battle (levels/finale): the Warden's echoes of each world, far off the map. Each stage
  // pushes its own track (an area track here plays when a stage asks for one), the ambience follows it
  fin_red: { music: 'music_red', ambient: 'amb_foundry', atmosphere: 'finForge' },
  fin_solar: { music: 'music_solar', ambient: 'amb_solar', atmosphere: 'finSolar' },
  fin_verdant: { music: 'music_green', ambient: 'amb_jungle', atmosphere: 'finVerdant' },
  fin_azure: { music: 'music_blue', ambient: 'amb_abyss', atmosphere: 'finDeep' },
  fin_heart: { music: 'music_antechamber', ambient: 'amb_core', atmosphere: 'finHeart' },
  // ---- end final battle
};
// how each hazard liquid takes you (death sequence): depth sunk, over how long, tint, sound, banner
const SINK = {
  lava: { depth: 2.2, time: 1.5, tint: 0xff4a10, ember: 0xff7a1a, sound: 'lava_sizzle', banner: 'MELTED' },
  sand: { depth: 2.0, time: 1.8, tint: 0x6a4a28, ember: null, sound: 'sand_sink', banner: 'SWALLOWED' },
  toxic: { depth: 2.0, time: 1.5, tint: 0x2aff4a, ember: 0x7dff8a, sound: 'toxic_sink', banner: 'DISSOLVED' },
  brine: { depth: 2.0, time: 1.6, tint: 0x2a7aff, ember: null, sound: 'toxic_sink', banner: 'FROZEN' },
};
const AREA_TRACKS = new Set(Object.values(AREA_MOOD).map((m) => m.music));
const AREA_AMBIENTS = new Set(Object.values(AREA_MOOD).map((m) => m.ambient));
const REVIVE_AFTER_DEATHS = 3; // the rewarded revive is offered from this many deaths at one checkpoint

// The look of the Crimson Foundry; every atmosphere preset (level.atmospheres) overrides some of these.
// Sky colors are raw shader RGB [0..1+]; sunDir is the direction the sunlight comes from.
const ATMOSPHERE_DEFAULT = {
  fog: 0x140f26, fogNear: 35, fogFar: 190,
  skyTop: [0.03, 0.03, 0.1], skyMid: [0.16, 0.06, 0.24], skyHorizon: [0.55, 0.2, 0.32], aurora: 0.12, stars: 1,
  hemiSky: 0xb9c3ff, hemiGround: 0x2a2030, hemiIntensity: 1.1,
  sunColor: 0xffe2c4, sunIntensity: 1.5, sunDir: [0.5, 1, 0.3],
  exposure: 1.05, bloom: 0.6,
};
const DEV = params.has('dev');
// Phones and tablets get touch controls and a lighter render setup.
const COARSE = matchMedia('(pointer: coarse)').matches;

// sens is in Quake/Half-Life units (0.022° per mouse count × sens) on top of the OS pointer speed;
// fov is Quake-style: horizontal degrees on a 4:3 screen (default 90), widened for wider screens.
function loadSettings() {
  const d = { sens: 20, fov: 90, volume: 0.7, music: 1, voice: 1, invertY: false, barkSubs: true };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem('chroma-settings-v3') || '{}') };
  } catch {
    return d;
  }
}

// Vertical FOV (what three.js wants) from a Quake-style horizontal FOV measured at 4:3.
function verticalFov(fov43) {
  return (2 * Math.atan(Math.tan((fov43 * Math.PI) / 360) * 0.75) * 180) / Math.PI;
}

class Game {
  constructor() {
    this.settings = loadSettings();
    this.audio = audio; // handy for debugging from the console
    this.barks = barks; // (enemy voice lines: barks.log lists what played)
    this.state = 'title';
    this.stats = { time: 0, deaths: 0 };
    this.secretsFound = 0;
    // Each world is an engine feeding the machine; with its chroma in hand you shut its power source down.
    // World modules call shutDownWorld(name) and listen with onPowerDown(fn) to show the aftermath.
    this.powerDown = { red: false, solar: false, verdant: false, azure: false };
    this.clearedEncounters = new Set(); // arena fights already won (persisted in the save)
    this.beaten = new Set(); // worlds whose guardian is dead (saved at once, before its power source goes down)
    this.events = new Set(); // one-off story beats already played, saved (e.g. 'feed_red': the Atrium's Foundry feed blew)
    this.powerDownListeners = [];

    // ---- renderer / scene ----
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.25 : 1.5));
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
    this.hemi = new THREE.HemisphereLight(0xb9c3ff, 0x2a2030, 1.1);
    scene.add(this.hemi);
    const sun = (this.sunLight = new THREE.DirectionalLight(0xffe2c4, 1.5));
    sun.position.set(0.5, 1, 0.3);
    scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(verticalFov(this.settings.fov), innerWidth / innerHeight, 0.05, 800);
    scene.add(this.camera);

    // ---- game systems ----
    this.input = new Input(renderer.domElement);
    this.hud = new Hud();
    this.world = new World(this);
    this.player = new Player(this);
    this.blaster = new Blaster(this);
    this.cutscene = new UnlockCutscene(this);
    this.level = buildLevel(this.world, this);
    this.world.finalize();
    if (COARSE) this.world.fx.quality = 0.6; // lighter particle effects on phones
    new Batcher(this.world).build([this.sky]); // meshes added straight to the scene: one draw per material (batch.js)
    this.world.setupCulling([this.sky]);
    this.restock = new Restock(this.world);
    director.attach(this);
    barks.attach(this);
    this.map = new MapView(this); // holographic map (M): its own scene, built on first open
    this.hud.buildColors(this.blaster);
    this.hud.setSecrets(0, this.level.secretsTotal);
    this.player.spawn(this.level.spawn, this.level.spawnYaw);
    this.checkpoint = { pos: this.level.spawn.clone(), yaw: this.level.spawnYaw, ref: null };
    this.setAtmosphere('foundry', true);

    // ---- post processing: world → bloom → view model on top → output ----
    const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: COARSE ? 0 : 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.25 : 1.5));
    this.composer.addPass(new RenderPass(scene, this.camera));
    // safety net: one NaN/Inf pixel (from any shader) would be smeared across the screen by the bloom
    // blur as a black blotch, so scrub them before it
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          if (c.r != c.r || c.g != c.g || c.b != c.b) c = vec4(0.0, 0.0, 0.0, 1.0);
          gl_FragColor = vec4(clamp(c.rgb, 0.0, 64.0), c.a);
        }`,
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    // death grade: drains color, tints red and closes a vignette as uAmount goes 0 → 1
    this.deathPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 }, uSubmerge: { value: 0 }, uTint: { value: new THREE.Color() }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uAmount, uSubmerge, uTime; uniform vec3 uTint; varying vec2 vUv;
        void main(){
          // sinking into a liquid: the view wobbles and drowns in its color
          vec2 uv = vUv + uSubmerge * 0.012 * vec2(sin(vUv.y * 24.0 + uTime * 5.0), cos(vUv.x * 19.0 + uTime * 4.0));
          vec4 c = texture2D(tDiffuse, uv);
          float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          c.rgb = mix(c.rgb, uTint * (0.35 + 0.9 * lum), uSubmerge * 0.9);
          float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          vec3 grade = mix(c.rgb, vec3(g * 1.1, g * 0.35, g * 0.35), uAmount);
          float v = smoothstep(0.85, 0.2, length(vUv - 0.5) * (1.0 + uAmount));
          gl_FragColor = vec4(grade * mix(1.0, v, uAmount), c.a);
        }`,
    });
    this.deathPass.enabled = false;
    this.composer.addPass(this.deathPass);
    const vm = (this.vmPass = new RenderPass(this.blaster.vmScene, this.blaster.vmCamera));
    vm.clear = false;
    vm.clearDepth = true;
    this.composer.addPass(vm);
    this.composer.addPass(new OutputPass());

    // compile every material now so the first sight of anything (the boss included) doesn't hitch
    // (compile only walks visible objects, so everything culled or hidden is shown for the pass)
    // Arena enemies only exist once their portal opens, so one of each kind is made for the pass and
    // then taken straight back out.
    const undo = this.stageArenaEnemies();
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    // against the composer's buffer, not the canvas: the programs differ (output color space / tone
    // mapping), and compiling for the canvas would leave every real one to compile on first sight
    renderer.setRenderTarget(this.composer.readBuffer);
    renderer.compile(scene, this.camera);
    renderer.compile(this.blaster.vmScene, this.blaster.vmCamera);
    renderer.setRenderTarget(null);
    for (const o of hidden) o.visible = false;
    undo();

    addEventListener('resize', () => this.resize());
    this.resize();
    this.bindUi();
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.input.onLockRefused = () => this.onLockRefused();
    this.touch = new TouchControls(this.input, { onPause: () => this.pause(), onMap: () => this.map.toggle() });
    this.hud.onColor = (i) => this.blaster.has && this.blaster.setColor(i);
    if (COARSE) this.enableTouch();
    // a touch anywhere (e.g. tapping Play on a touchscreen laptop) switches to touch controls
    addEventListener('touchstart', () => this.enableTouch(), { once: true, passive: true });
    document.addEventListener('visibilitychange', () => document.hidden && this.pause());
    addEventListener('pointerdown', () => this.state === 'cutscene' && this.cutscene.skip());

    // ---- Bonus Round (native mode: the round plays in our world with our own player) ----
    this.frameCallbacks = [];
    const player = this.player;
    ads.load();
    ads.attach({
      THREE,
      scene,
      camera: this.camera,
      renderer,
      worldRoot: this.world.staticGroup, // hidden during the round
      host: {
        getPlayerPosition: () => player.pos.clone(),
        teleport: (v) => player.teleport(v),
        setBounds: (b) => (player.arenaBounds = b),
        onFrame: (cb) => this.frameCallbacks.push(cb),
      },
      onStart: (kind) => (kind !== 'impression' || this.inBreak || this.reviving) && this.onAdStart(),
      onEnd: () => this.onAdEnd(),
    });
    ads.safe(true);

    // ?jump=<start> (the title's Select Location): a practice run from there, the save left alone
    if (params.get('jump') && this.level.devStarts[params.get('jump')]) this.jumpTo(params.get('jump'));
    else if (DEV && params.get('start')) this.devSkip(params.get('start'));
    else this.restore(loadSave());

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
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: new THREE.Vector3(...ATMOSPHERE_DEFAULT.skyTop) },
        uMid: { value: new THREE.Vector3(...ATMOSPHERE_DEFAULT.skyMid) },
        uHor: { value: new THREE.Vector3(...ATMOSPHERE_DEFAULT.skyHorizon) },
        uAurora: { value: ATMOSPHERE_DEFAULT.aurora },
        uStars: { value: ATMOSPHERE_DEFAULT.stars },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform float uTime;
        uniform vec3 uTop, uMid, uHor;
        uniform float uAurora, uStars;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float h = vDir.y;
          vec3 c = mix(uHor, uMid, smoothstep(-0.05, 0.25, h));
          c = mix(c, uTop, smoothstep(0.25, 0.9, h));
          // prismatic aurora bands
          float band = sin(vDir.x * 6.0 + uTime * 0.05) * 0.5 + 0.5;
          float a = smoothstep(0.15, 0.45, h) * smoothstep(0.75, 0.45, h);
          c += a * uAurora * vec3(band, 0.4 + 0.6 * (1.0 - band), 0.9);
          // stars
          vec3 p = floor(vDir * 300.0);
          float s = step(0.9975, hash(p)) * smoothstep(0.1, 0.4, h) * uStars;
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
      // any first click on the title (browsers hold audio until one) starts its music
      if (!a && this.state === 'title' && !this.titleMusic) {
        this.titleMusic = true;
        audio.unlock();
        audio.playMusic(audio.musicOr('music_haunt', 'music_title'));
      }
      if (!a) return;
      audio.unlock();
      audio.uiClick();
      // the title plays the haunting intro track (the cell block's too), or the old title theme without it
      if (this.state === 'title' && a !== 'play') audio.playMusic(audio.musicOr('music_haunt', 'music_title'));
      if (a === 'play') this.play();
      else if (a === 'resume') this.resume();
      else if (a === 'settings') this.openSettings();
      else if (a === 'settings-back') this.showScreen(this.settingsReturn);
      else if (a === 'checkpoint') this.respawn();
      else if (a === 'quit' && this.state === 'victory' && !this.leaving) {
        // leaving the victory screen: the natural break plays here (never longer than 45 s), then the title
        this.leaving = true;
        e.target.closest('button')?.setAttribute('disabled', '');
        Promise.race([this.naturalBreak(), new Promise((r) => setTimeout(r, 45000))]).then(() => location.reload());
      } else if (a === 'quit' && this.practice) {
        // leaving a practice run: back to the plain title (and your real save)
        const u = new URL(location.href);
        u.searchParams.delete('jump');
        location.href = u.toString();
      } else if (a === 'quit') location.reload();
      else if (a === 'locations') this.openLocations();
      else if (a === 'locations-back') this.showScreen('title');
      else if (a === 'revive') this.reviveTapped = true;
      else if (a === 'continue') this.resume();
      else if (a === 'newgame') this.confirmNewGame();
      else if (a === 'newgame-cancel') this.showScreen('title');
      else if (a === 'newgame-confirm' && !e.target.closest('button').disabled) {
        clearSave();
        location.reload();
      }
    });
    const bind = (id, key, parse, after) => {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = this.settings[key];
      else el.value = this.settings[key];
      el.addEventListener('input', () => {
        this.settings[key] = parse(el);
        try {
          localStorage.setItem('chroma-settings-v3', JSON.stringify(this.settings));
        } catch {
          /* storage unavailable: settings last for this session only */
        }
        after?.();
      });
    };
    bind('#set-sens', 'sens', (el) => +el.value, () => ($('#sens-val').textContent = this.settings.sens.toFixed(1)));
    $('#sens-val').textContent = this.settings.sens.toFixed(1);
    bind('#set-fov', 'fov', (el) => +el.value, () => {
      $('#fov-val').textContent = this.settings.fov;
      this.camera.fov = verticalFov(this.settings.fov);
      this.camera.updateProjectionMatrix();
    });
    $('#fov-val').textContent = this.settings.fov;
    bind('#set-vol', 'volume', (el) => +el.value, () => audio.setVolume(this.settings.volume));
    bind('#set-music', 'music', (el) => +el.value, () => audio.setMusicVolume(this.settings.music));
    bind('#set-voice', 'voice', (el) => +el.value, () => audio.setVoiceVolume(this.settings.voice));
    bind('#set-invert', 'invertY', (el) => el.checked);
    bind('#set-barksubs', 'barkSubs', (el) => el.checked, () => barks.setSubtitles(this.settings.barkSubs));
    audio.setVolume(this.settings.volume);
    audio.setMusicVolume(this.settings.music);
    audio.setVoiceVolume(this.settings.voice);
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
    if (!this.started) audio.gameStart();
    audio.prefetch(['lava_sizzle', 'sand_sink', 'toxic_sink', 'lava_bubble', 'incinerator_ignite']);
    // area music and ambience follow the player (updateMix); only special tracks (boss, ascent) are pushed
    if (this.musicOverride) audio.playMusic(this.musicOverride);
    this.state = 'playing';
    this.hud.show(true);
    this.showScreen(null);
    this.capture();
    ads.safe(false);
    if (!this.started) {
      this.started = true;
      if (this.practice) this.hud.message(`<b>PRACTICE</b> · ${this.practice} · nothing here is saved`, 3.5);
      else if (this.resumed) this.hud.message('Welcome back. Resuming from your last checkpoint.', 3);
      else {
        this.enterZone('SECTOR 1', 'CRIMSON FOUNDRY', '#ff3344');
        const intro = this.level.introMessage; // (empty when the level opens with its own scene: the cell block)
        if (intro) setTimeout(() => this.hud.message(intro, 5), 1200);
      }
    }
  }

  // ------------------------------------------------------------------ world power
  isWorldDown(name) {
    return !!this.powerDown[name];
  }

  // The player shut a world's power source down: remember it, tell every listener (the world's own
  // aftermath, the Atrium reactor), save. fn(name, { restored }) also runs for worlds restored from a save.
  // A world's guardian is down: saved straight away, so quitting before the shutdown can't bring it back.
  guardianBeaten(name) {
    if (!name || this.beaten.has(name)) return;
    this.beaten.add(name);
    this.save();
  }

  shutDownWorld(name) {
    if (this.powerDown[name]) return;
    this.powerDown[name] = true;
    for (const fn of this.powerDownListeners) fn(name, { restored: false });
    this.save();
  }

  onPowerDown(fn) {
    this.powerDownListeners.push(fn);
    for (const [name, down] of Object.entries(this.powerDown)) if (down) fn(name, { restored: true });
  }

  // ------------------------------------------------------------------ saving
  save() {
    if ((DEV && params.get('start')) || this.practice) return; // dev jumps and practice runs don't overwrite your real progress
    const cp = this.checkpoint;
    writeSave({
      cp: { pos: cp.pos.toArray(), yaw: cp.yaw },
      colors: this.blaster.unlocked.map((u, i) => (u && this.blaster.has ? i : -1)).filter((i) => i >= 0),
      color: this.blaster.color,
      secrets: this.level.secrets.filter((s) => s.trigger.fired).map((s) => s.label),
      powerDown: Object.keys(this.powerDown).filter((k) => this.powerDown[k]),
      cleared: [...this.clearedEncounters],
      beaten: [...this.beaten],
      events: [...this.events],
      won: !!this.won,
      time: Math.floor(this.stats.time),
      deaths: this.stats.deaths,
    });
  }

  // Put the world back the way the save left it: colors, cores already taken, secrets, the checkpoint
  // (lit up) and the right music/atmosphere for where it is.
  restore(s) {
    if (!s) return;
    this.resumed = true;
    s.colors.forEach((c) => this.blaster.give(c));
    if (s.colors.length) this.blaster.setColor(s.colors.includes(s.color) ? s.color : s.colors[0], true);
    for (const e of [...this.world.entities]) {
      if (e.type === 'color' && s.colors.includes(e.color)) {
        e.active = false;
        e.group.visible = false;
        if (e.light) e.light.intensity = 0;
        this.world.remove(e);
      }
    }
    for (const sec of this.level.secrets) {
      if (!s.secrets.includes(sec.label)) continue;
      sec.trigger.fired = true;
      this.secretsFound++;
    }
    this.hud.setSecrets(this.secretsFound, this.level.secretsTotal);
    // one-off beats already played (before the power-down listeners hear about it: the Atrium reactor asks).
    // A save from before they were kept: a down world's feed counts as blown once the checkpoint is out of it.
    const down = [...(s.powerDown || []), ...(s.beaten || [])];
    for (const e of s.events || []) this.events.add(e);
    if (!s.events) for (const name of down) if (regionOf(new THREE.Vector3(...s.cp.pos)) !== name) this.events.add('feed_' + name);
    // (a guardian beaten but its power source not yet shot counts as shut down: its fight never comes back)
    for (const name of down) {
      if (name in this.powerDown && !this.powerDown[name]) {
        this.powerDown[name] = true;
        for (const fn of this.powerDownListeners) fn(name, { restored: true });
      }
    }
    for (const id of s.cleared || []) this.clearedEncounters.add(id);
    // a save at an arena's own beacon means that fight was won (saves from before arena clears were kept)
    const cp = new THREE.Vector3(...s.cp.pos);
    for (const e of this.world.entities) {
      const at = e instanceof Encounter && e.checkpoint?.pos; // (instanceof: class names are minified in a build)
      if (at && cp.distanceTo(new THREE.Vector3(...at)) < 1.5) this.clearedEncounters.add(e.id);
    }
    this.won = !!s.won;
    this.stats.time = s.time || 0;
    this.stats.deaths = s.deaths || 0;
    const pos = new THREE.Vector3(...s.cp.pos);
    const ref = this.world.entities.find((e) => e instanceof Checkpoint && e.pos.distanceTo(pos) < 0.5) || null;
    ref?.setActive(true);
    this.checkpoint = { pos, yaw: s.cp.yaw, ref };
    this.player.spawn(pos, s.cp.yaw);
    const mood = AREA_MOOD[regionOf(pos)];
    this.musicTrack = mood.music;
    this.ambient = mood.ambient;
    this.setAtmosphere(mood.atmosphere, true);
    this.showContinue(s);
    $('[data-action="newgame"]').classList.remove('hidden');
  }

  // New Game with a save: a second screen that names what will be lost, whose erase button only wakes
  // up after a moment (a double-click can't wipe a save).
  confirmNewGame() {
    const pr = saveProgress(this, loadSave());
    $('#newgame-what').innerHTML = pr
      ? `Your save at <b style="color:${pr.color}">${pr.name}</b> (${pr.pct}% complete) will be erased.`
      : 'Your save will be erased.';
    const btn = $('#newgame-confirm');
    btn.disabled = true;
    clearTimeout(this.newGameT);
    this.newGameT = setTimeout(() => (btn.disabled = false), 900);
    this.showScreen('newgame');
  }

  // The title's Continue card: the checkpoint's name and number, the area, how far through the game you
  // are, and a look at the spot (rendered from the checkpoint on the next title frame: see previewShot).
  showContinue(s) {
    const pr = saveProgress(this, s);
    const btn = $('#play-btn');
    btn.classList.add('continue');
    btn.querySelector('.play-label').textContent = 'Continue';
    if (!pr) return;
    const t = Math.floor(s.time || 0);
    btn.style.setProperty('--cc', pr.color);
    btn.querySelector('.cc').classList.remove('hidden');
    btn.querySelector('.cc-name').textContent = pr.name;
    btn.querySelector('.cc-area').textContent = pr.area;
    btn.querySelector('.cc-cp').textContent = `Checkpoint ${pr.index} / ${pr.total}`;
    btn.querySelector('.cc-bar i').style.width = pr.pct + '%';
    btn.querySelector('.cc-meta').textContent = `${pr.pct}% complete · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}${s.deaths ? ` · ${s.deaths} death${s.deaths > 1 ? 's' : ''}` : ''}`;
    this.wantPreview = true;
  }

  // One frame drawn from the saved checkpoint (where Continue puts you), into the card's thumbnail.
  previewShot() {
    this.wantPreview = false;
    const cam = this.camera, cp = this.checkpoint;
    const pos = cam.position.clone(), rot = cam.rotation.clone(), fov = cam.fov;
    // a step back and up from where you'll stand, looking the way you'll face (not into the wall behind)
    const fwd = new THREE.Vector3(-Math.sin(cp.yaw), 0, -Math.cos(cp.yaw));
    const eye = cp.pos.clone().setY(cp.pos.y + 1.7);
    const back = new THREE.Vector3(-fwd.x, 0.45, -fwd.z).normalize();
    const hit = this.world.raycast(eye, back, 4.5, { meshes: false });
    cam.position.copy(eye).addScaledVector(back, Math.max(0, (hit ? hit.t : 4.5) - 0.6));
    cam.rotation.set(-0.16, cp.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
    this.world.updateCulling(cam.position, cam.far);
    this.world.updateLights(cam.position, 0);
    this.composer.render();
    const c = $('#play-btn .cc-shot canvas'), src = this.renderer.domElement;
    const g = c.getContext('2d'), k = Math.max(c.width / src.width, c.height / src.height);
    const w = src.width * k, h = src.height * k;
    g.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
    $('#play-btn .cc-shot').classList.add('ready');
    cam.position.copy(pos);
    cam.rotation.copy(rot);
    cam.fov = fov;
    cam.updateMatrixWorld();
    this.world.updateCulling(cam.position, cam.far);
    this.composer.render(); // (the title's own view again, so the shot never shows on screen)
  }

  enableTouch() {
    if (this.touchMode) return;
    this.touchMode = true;
    this.hud.touchMode = true;
    document.body.classList.add('touch');
  }

  // Grab input for gameplay. Desktop: fullscreen + pointer lock, and a keyboard lock on the movement and
  // crouch keys so Ctrl+W crouch-walks instead of closing the tab (Chrome/Edge). Touch: fullscreen.
  capture() {
    const el = document.documentElement;
    if (!this.touchMode) {
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => navigator.keyboard?.lock?.(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'ControlLeft', 'ControlRight', 'Space']))
          .catch(() => {});
      }
      return this.input.requestLock();
    }
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
        .catch(() => {});
    }
  }

  resume() {
    if (this.player.dead) return this.respawn();
    this.state = 'playing';
    this.showScreen(null);
    this.capture();
    ads.safe(false);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    const t = Math.floor(this.stats.time);
    $('#pause-stats').textContent = `Time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · Secrets ${this.secretsFound}/${this.level.secretsTotal} · Deaths ${this.stats.deaths}`;
    this.showScreen('pause');
    $('#pause-hint').classList.add('hidden');
    ads.safe(true);
    // free the cursor so the menu is clickable, even if something other than our canvas holds the lock
    // (e.g. a Bonus Round that ended with the pointer still captured)
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // The browser wouldn't hand the mouse over yet (just after Esc): back to the pause menu, whose Resume
  // asks again, instead of playing on with a loose cursor.
  onLockRefused() {
    if (this.state !== 'playing' || this.touchMode || this.input.lockFailed) return;
    this.pause();
    $('#pause-hint').classList.remove('hidden');
  }

  onLockChange(locked) {
    if (locked) return;
    if (this.adRound || this.reviving || this.state === 'ad') return;
    if (this.state === 'map') return this.map.close(true); // Esc in the map: on to the pause menu
    if (this.state === 'playing') this.pause();
  }

  // ------------------------------------------------------------------ progression hooks
  // Title card for a new area, plus its music if one is given (tracks crossfade in audio.playMusic).
  enterZone(sub, main, color, music) {
    this.hud.zoneTitle(sub, main, color);
    if (music) this.setMusic(music);
  }

  // Crossfade fog, sky, hemisphere/sun light and exposure toward a named preset (level.atmospheres,
  // registered by the world modules; missing fields fall back to ATMOSPHERE_DEFAULT).
  setAtmosphere(name, instant = false) {
    const preset = name === 'foundry' || !this.level.atmospheres[name] ? {} : this.level.atmospheres[name];
    if (name !== 'foundry' && !this.level.atmospheres[name]) console.warn('[chroma] unknown atmosphere', name);
    const a = { ...ATMOSPHERE_DEFAULT, ...(this.level.atmospheres.foundry || {}), ...preset };
    const c = (hex) => new THREE.Color(hex);
    const v = (arr) => new THREE.Vector3(...arr);
    this.atmo = {
      name,
      fog: c(a.fog), fogNear: a.fogNear, fogFar: a.fogFar,
      skyTop: v(a.skyTop), skyMid: v(a.skyMid), skyHorizon: v(a.skyHorizon), aurora: a.aurora, stars: a.stars,
      hemiSky: c(a.hemiSky), hemiGround: c(a.hemiGround), hemiIntensity: a.hemiIntensity,
      sunColor: c(a.sunColor), sunIntensity: a.sunIntensity, sunDir: v(a.sunDir).normalize(), exposure: a.exposure,
      bloom: a.bloom,
    };
    if (instant) this.updateAtmosphere(1, true);
  }

  updateAtmosphere(dt, snap = false) {
    const a = this.atmo;
    if (!a) return;
    const k = snap ? 1 : 1 - Math.exp(-dt * 1.2);
    const f = this.scene.fog, u = this.sky.material.uniforms;
    f.color.lerp(a.fog, k);
    f.near += (a.fogNear - f.near) * k;
    f.far += (a.fogFar - f.far) * k;
    u.uTop.value.lerp(a.skyTop, k);
    u.uMid.value.lerp(a.skyMid, k);
    u.uHor.value.lerp(a.skyHorizon, k);
    u.uAurora.value += (a.aurora - u.uAurora.value) * k;
    u.uStars.value += (a.stars - u.uStars.value) * k;
    this.hemi.color.lerp(a.hemiSky, k);
    this.hemi.groundColor.lerp(a.hemiGround, k);
    this.hemi.intensity += (a.hemiIntensity - this.hemi.intensity) * k;
    this.sunLight.color.lerp(a.sunColor, k);
    this.sunLight.intensity += (a.sunIntensity - this.sunLight.intensity) * k;
    this.sunLight.position.lerp(a.sunDir, k);
    this.renderer.toneMappingExposure += (a.exposure - this.renderer.toneMappingExposure) * k;
    if (this.bloom) this.bloom.strength += (a.bloom - this.bloom.strength) * k;
    // underwater: a thick blue-green murk close around you (eases back out as you surface)
    if (this.player.headUnder) {
      f.color.set(0x0a3a4a);
      f.near = 0;
      f.far = 26;
    }
    // nothing past the fog can be seen, so don't draw it: the far plane follows the fog (all the
    // worlds share one scene). A Bonus Round brings its own scenery, so it gets the full range.
    const far = this.adRound ? 800 : Math.max(200, f.far + 30);
    if (Math.abs(this.camera.far - far) > 1) {
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
      this.sky.scale.setScalar((far * 0.95) / 600);
    }
  }

  setAmbient(name) {
    this.ambient = name;
    this.ambOverride = AREA_AMBIENTS.has(name) ? null : name;
    if (this.started && this.ambOverride) audio.playAmbient(name);
  }

  // the boss's final phase gets its own, faster track
  onBossPhase(phase) {
    if (phase === 3) this.setMusic('music_boss_final');
  }

  // Area tracks are mixed by position (updateMix); anything else (boss, ascent, victory) takes over
  // until an area track is asked for again.
  setMusic(track) {
    this.musicTrack = track;
    this.musicOverride = AREA_TRACKS.has(track) ? null : track;
    if (this.started && this.musicOverride) audio.playMusic(track);
  }

  // Music and ambience follow you: inside an area its tracks play; within a few metres of a doorway the
  // two sides are mixed by where you stand (50/50 in the doorway), so crossing is immediate and stepping
  // back reverses it at once.
  updateMix() {
    const pos = this.camera.position;
    let a = regionOf(pos), b = a, w = 0;
    for (const P of PORTALS) {
      const dx = pos.x - P.p[0], dy = pos.y - P.p[1], dz = pos.z - P.p[2];
      const s = dx * P.n[0] + dy * P.n[1] + dz * P.n[2];
      if (Math.abs(s) > PORTAL_BLEND) continue;
      const lx = dx - P.n[0] * s, ly = dy - P.n[1] * s, lz = dz - P.n[2] * s;
      if (lx * lx + ly * ly + lz * lz > 25) continue;
      a = P.a;
      b = P.b;
      w = Math.min(1, Math.max(0, 0.5 + (0.5 * s) / PORTAL_BLEND));
      break;
    }
    if (!this.musicOverride) audio.musicBlend(AREA_MOOD[a].music, AREA_MOOD[b].music, w);
    if (!this.ambOverride) audio.ambientBlend(AREA_MOOD[a].ambient, AREA_MOOD[b].ambient, w);
  }

  // One enemy of every kind (and color) the arenas will summon, for the startup shader pass. Returns
  // the undo: the world's lists go back to their old lengths and the new scene objects come out.
  stageArenaEnemies() {
    const w = this.world;
    const lens = Object.entries(w).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]);
    const before = new Set(w.scene.children);
    const kinds = new Map();
    for (const e of w.entities) {
      for (const wave of e.waves || []) {
        for (const { pos, delay, ...rest } of wave.enemies || []) {
          const k = JSON.stringify(rest);
          if (!kinds.has(k)) kinds.set(k, { ...rest, pos });
        }
      }
    }
    for (const spec of kinds.values()) {
      try {
        spawnEnemy(w, { aggro: false, ...spec });
      } catch (err) {
        console.warn('[chroma] prewarm', spec.type, err);
      }
    }
    return () => {
      for (const [k, n] of lens) w[k].length = Math.min(w[k].length, n);
      for (const o of [...w.scene.children]) if (!before.has(o)) w.scene.remove(o);
    };
  }

  setCheckpoint(pos, yaw, ref) {
    this.checkpoint = { pos: pos.clone(), yaw, ref };
    this.deathsHere = 0;
    this.revivedHere = false;
    this.save();
    audio.checkpoint();
    this.hud.message('Checkpoint', 1.5);
    this.player.heal(10);
  }

  // Picking up a chroma core plays the unlock cutscene; the color is granted when it ends.
  unlockColor(c, corePos) {
    this.unlocking = c;
    this.state = 'cutscene';
    this.input.mouseDown = false;
    this.blaster.release();
    this.cutscene.start(c, corePos);
  }

  onCutsceneDone() {
    const c = this.unlocking;
    const first = !this.blaster.has;
    this.state = 'playing';
    this.blaster.give(c);
    const name = `<b>${COLORS[c].name}</b>`;
    this.save();
    if (first) this.hud.message(`${name} blaster online. <b>LMB</b> to fire.`, 4);
    else this.hud.message(`${name} unlocked — press <b>${c + 1}</b>. Remember those ${name}-marked doors?`, 6);
    // finishing a color world is a natural break for a Bonus Round
    if (!first) setTimeout(() => this.naturalBreak(), 2500);
  }

  foundSecret(label) {
    this.secretsFound++;
    this.hud.setSecrets(this.secretsFound, this.level.secretsTotal);
    this.hud.message(`SECRET FOUND — <b>${label}</b> (${this.secretsFound}/${this.level.secretsTotal})`, 4);
    this.save();
    audio.secret();
  }

  startBoss() {
    this.level.setSeal(true);
    audio.door();
    this.level.boss.start();
    this.hud.bossShow(true);
    this.hud.bossBar(1);
    audio.setIntensity(2);
    this.setMusic('music_boss');
    ads.safe(false);
  }

  onBossDying() {
    this.hud.bossHint('The Warden is breaking apart!', true);
  }

  onBossDefeated() {
    this.level.setSeal(false);
    this.hud.bossShow(false);
    audio.setIntensity(0);
    this.setMusic('music_victory');
    this.hud.zoneTitle('PRISM WARDEN', 'SHATTERED', '#ffd23a');
    // the win is saved at once (Continue later puts you back in the Atrium, every world dark, free to roam)
    this.won = true;
    const hub = this.level.devStarts?.hub;
    if (hub) this.checkpoint = { pos: hub.pos.clone(), yaw: hub.yaw, ref: null };
    this.save();
    // the victory screen comes straight up; the intermission waits until you leave it
    setTimeout(() => this.victory(), 4000);
  }

  victory() {
    this.state = 'victory';
    this.input.exitLock();
    const t = Math.floor(this.stats.time);
    $('#victory-stats').innerHTML = `
      <span>Time</span><span>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span>
      <span>Deaths</span><span>${this.stats.deaths}</span>
      <span>Secrets</span><span>${this.secretsFound}/${this.level.secretsTotal}</span>`;
    this.showScreen('victory');
    ads.safe(true);
  }

  // Death: the camera crumples, the suit bursts into shards of your color, the screen drains to red,
  // then you're put back at the last checkpoint automatically. A Bonus Round revive is offered meanwhile.
  onPlayerDeath() {
    const p = this.player;
    this.state = 'dying';
    this.deathT = 0;
    this.stats.deaths++;
    this.deathPos = p.pos.clone();
    this.deathYaw = p.yaw;
    // where a revive puts you: on the spot if you were shot, but never back inside the acid, spikes or
    // pit that killed you: then it's the last solid ground you stood on, or the checkpoint
    this.revivePos = this.deathPos.clone();
    if (['spike', 'acid', 'quicksand', 'fall', 'burn', 'impact', 'landing'].includes(p.deathCause)) {
      const safe = p.safePos.clone();
      const ok = safe.distanceToSquared(this.deathPos) < 40 * 40 && [0.3, 1.2].every((h) => !this.world.pointInSolid(safe.clone().setY(safe.y + h), 0.3));
      this.revivePos = ok ? safe : this.checkpoint.pos.clone();
      // step back from the edge you went over (toward the checkpoint) if there's floor there
      if (ok) {
        const back = this.checkpoint.pos.clone().sub(safe).setY(0);
        if (back.lengthSq() > 0.01) {
          const probe = safe.clone().addScaledVector(back.normalize(), 1.2).setY(safe.y + 0.5);
          const hit = this.world.raycast(probe, new THREE.Vector3(0, -1, 0), 1.0, { meshes: false });
          if (hit && !hit.solid?.hazard && !hit.entity) this.revivePos.copy(probe).setY(hit.point.y);
        }
      }
    }
    this.deathPitch = p.pitch;
    this.deathEye = this.camera.position.clone();
    this.deathRoll = Math.random() < 0.5 ? -1 : 1;
    this.input.mouseDown = false;
    this.blaster.release(); // (a held beam or stream stops; globs in flight are dropped)
    audio.setHeartbeat(false);
    audio.death();
    barks.player('taunt', true);
    const eye = this.deathEye.clone();
    const hex = COLORS[this.blaster.color].hex;
    this.world.fx.burst(eye.clone().setY(eye.y - 0.4), hex, { count: 140, speed: 7, life: 1.4, size: 0.3, gravity: 6 });
    this.world.fx.burst(eye.clone().setY(eye.y - 0.6), 0xffffff, { count: 50, speed: 4, life: 0.7, size: 0.4, gravity: 2 });
    p.shake = 1;
    // falling into a liquid: you sink into it instead of crumpling (see updateDying)
    const where = regionOf(this.deathPos);
    const liquid = p.deathCause === 'quicksand' ? 'sand' : p.deathCause === 'acid' ? { verdant: 'toxic', fin_verdant: 'toxic', azure: 'brine', solar: 'sand' }[where] || 'lava' : null;
    this.sink = liquid && { ...SINK[liquid], surface: this.deathPos.y };
    if (this.sink) audio.sample(this.sink.sound, { gain: 1, vary: 0.05 });
    const banner = this.sink?.banner || { spike: 'IMPALED', acid: 'DISSOLVED', fall: 'LOST', burn: 'INCINERATED', impact: 'CRATERED', landing: 'CRATERED', drown: 'DROWNED', slime: 'ENGULFED', spider: 'SKEWERED', fish: 'SHREDDED', squid: 'CRUSHED', 'acid spit': 'DISSOLVED', 'ink torpedo': 'TORPEDOED', blast: 'BLOWN APART', scarab: 'STUNG', crab: 'BLOWN APART', spores: 'POISONED', 'lava gob': 'SLAGGED', shock: 'ELECTROCUTED' }[p.deathCause] || 'SHOT DOWN';
    // The rewarded revive is a helping hand for a section you're stuck on, not a way to skip every
    // challenge: it's offered from the 3rd death since your last checkpoint, once per checkpoint.
    this.deathsHere = (this.deathsHere || 0) + 1;
    this.reviveTapped = false;
    this.reviveOffered = ads.available && this.deathsHere >= REVIVE_AFTER_DEATHS && !this.revivedHere;
    this.hud.deathBanner(banner, this.reviveOffered);
    this.deathPass.enabled = true;
  }

  updateDying(dt) {
    this.deathT += dt;
    const t = this.deathT;
    const k = 1 - Math.pow(1 - Math.min(1, t / 0.9), 3);
    const c = this.camera;
    const u = this.deathPass.uniforms;
    u.uTime.value = t;
    c.position.copy(this.deathEye);
    if (this.sink) {
      // pulled under: slow at first, then the liquid swallows you; the view tips up toward the light
      const s = this.sink, ks = Math.min(1, t / s.time);
      const depth = s.depth * ks * ks * (3 - 2 * ks);
      c.position.y -= depth;
      c.position.x += Math.sin(t * 2.3) * 0.05 * ks;
      c.rotation.set(this.deathPitch * (1 - ks) + 0.45 * ks, this.deathYaw + Math.sin(t * 1.7) * 0.06 * ks, 0, 'YXZ');
      u.uTint.value.set(s.tint);
      u.uSubmerge.value = Math.min(1, Math.max(0, (s.surface + 0.25 - c.position.y) / 0.5));
      u.uAmount.value = Math.min(0.6, t / 1.2);
      s.fxT = (s.fxT || 0) - dt;
      if (s.fxT <= 0 && t < s.time) {
        s.fxT = 0.06;
        const p = this.deathPos.clone().setY(s.surface + 0.1);
        p.x += (Math.random() - 0.5) * 1.2;
        p.z += (Math.random() - 0.5) * 1.2;
        if (s.ember) this.world.fx.ember(p, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, s.ember, 0.8, 0.12);
        else this.world.fx.puff(p, 0, 0.6, 0, new THREE.Color(s.tint), 0.5, 1.2, 0.5, 3);
      }
    } else {
      c.position.y -= (this.player.eye - 0.3) * k;
      c.rotation.set(this.deathPitch * (1 - k) + 0.35 * k, this.deathYaw, this.deathRoll * 1.25 * k, 'YXZ');
      u.uAmount.value = Math.min(1, t / 0.7);
    }
    this.hud.fade(Math.max(0, Math.min(1, (t - 1.65) / 0.4)));
    this.world.fx.update(dt);
    if (this.reviveOffered && (this.input.hit('KeyR') || this.reviveTapped)) {
      this.reviveTapped = false;
      return this.revive();
    }
    if (t > 2.1) this.respawn();
  }

  clearDeathFx() {
    this.deathPass.enabled = false;
    this.deathPass.uniforms.uAmount.value = 0;
    this.deathPass.uniforms.uSubmerge.value = 0;
    this.sink = null;
    this.hud.deathBanner(null);
    this.hud.fade(0, 0.45);
  }

  // Fell off the edge of the world: keep falling while the screen fades out, then you're back at the
  // checkpoint (no death screen, no death counted).
  fallOutOfWorld() {
    this.voidT = 0.001;
    this.hud.fade(1, 0.7);
  }

  respawn() {
    this.voidT = 0;
    const p = this.player;
    p.spawn(this.checkpoint.pos, this.checkpoint.yaw);
    p.health = p.maxHealth;
    p.invuln = 1.5;
    const boss = this.level.boss;
    // (final battle: past the first stage, dying restarts only the current stage; see Boss.restartStage)
    if (boss.active && !boss.restartStage?.()) {
      boss.resetState();
      this.level.setSeal(false);
      this.level.bossTrigger.fired = false;
      this.level.bossTrigger.inside = false;
      this.hud.bossShow(false);
      audio.setIntensity(1);
      this.setMusic('music_antechamber');
    }
    for (const pr of this.world.projectiles) pr.alive = false;
    this.world.wet.clear(); // puddles and shock water dry up
    for (const fn of this.level.respawnHooks) fn();
    director.holders.clear();
    barks.reset();
    this.clearDeathFx();
    audio.respawn();
    p.updateCamera();
    this.state = 'playing';
    this.showScreen(null);
    if (!this.input.locked) this.capture();
    ads.safe(false);
  }

  // Rewarded Bonus Round: you're dropped into the round right where you fell (or the nearest safe ground
  // for hazard deaths); finish it and you're revived there with 60% integrity, otherwise you respawn
  // at the checkpoint.
  async revive() {
    const p = this.player;
    let rewarded = false;
    this.revivedHere = true;
    this.reviveOffered = false;
    this.reviving = true; // rules stay paused from the click until the round ends
    p.dead = false;
    p.spawn(this.revivePos, this.deathYaw);
    p.health = 1;
    for (const pr of this.world.projectiles) pr.alive = false;
    this.clearDeathFx();
    this.state = 'playing';
    this.showScreen(null);
    this.capture();
    const result = await ads.rewarded(() => (rewarded = true));
    this.reviving = false;
    this.onAdEnd();
    if (!rewarded || this.unsafeSpot()) return this.respawn();
    p.health = Math.ceil(p.maxHealth * 0.6);
    p.invuln = 3;
    this.hud.message(result.filled ? 'Revived — thanks for playing the Bonus Round!' : 'Revived!', 3);
  }

  // Natural break: ask for an intermission round and keep playing. The SDK shows its countdown,
  // then moves the player into the round (native mode) and back. If nothing fills, nothing happens.
  async naturalBreak() {
    if (!ads.enabled) return;
    this.inBreak = true;
    const result = await ads.intermission();
    this.inBreak = false;
    if (import.meta.env.DEV) console.info('[chroma] intermission result', JSON.stringify(result));
    this.onAdEnd(); // break() resolving is the reliable end signal
  }

  // Round started (the SDK's start event, or its first impression/viewable event). Idempotent.
  // Gameplay keeps running for the player; enemies, damage and hazards pause.
  onAdStart() {
    if (this.adRound) return;
    this.adRound = true;
    // a round is ~15 s plus its leaderboard: if the SDK never reports the end, don't leave the game
    // paused underneath forever (enemies frozen, no damage)
    clearTimeout(this.adWatchdog);
    this.adWatchdog = setTimeout(() => this.onAdEnd(), 75000);
    audio.setMusicMuted(true);
    this.hud.bossShow(false);
    for (const pr of this.world.projectiles) pr.alive = false;
  }

  onAdEnd() {
    clearTimeout(this.adWatchdog);
    if (!this.adRound) return;
    this.adRound = false;
    this.player.arenaBounds = null;
    this.input.keys.clear();
    audio.setMusicMuted(false);
    if (this.level.boss.active) this.hud.bossShow(true);
    // never hand control back somewhere deadly or stuck (inside acid, spikes, a wall): checkpoint instead
    if (this.state === 'playing' && !this.reviving && this.unsafeSpot()) this.respawn();
    // if the round released the mouse, offer a click back in instead of dropping input silently
    if (this.state === 'playing' && !this.touchMode && !this.input.locked) this.pause();
  }

  // Is the player overlapping a hazard or embedded in a solid?
  unsafeSpot() {
    const b = this.player.bounds();
    for (const s of this.world.solids) {
      if (!s.enabled || s.noCollide) continue;
      const pad = s.hazard ? 0.06 : -0.05;
      if (b.min.x < s.max.x + pad && b.max.x > s.min.x - pad && b.min.y < s.max.y + pad && b.max.y > s.min.y - pad && b.min.z < s.max.z + pad && b.max.z > s.min.z - pad) {
        if (s.hazard || !s.delta) return true;
      }
    }
    return this.player.pos.y < -90;
  }

  // enemies, damage, triggers and hazards are paused while a round plays or a revive is pending
  get rulesPaused() {
    return this.adRound || this.reviving;
  }

  // ------------------------------------------------------------------ dev helpers (?dev)
  // ?dev&start=<name>: spawn at a start registered by a world module (devStart in levels/builders.js)
  // Select Location: start at a world's start as if you'd just arrived there (its colors, the worlds before
  // it shut down, their Atrium feeds already blown), as a practice run that never saves.
  jumpTo(name) {
    const j = jumpSetup(this.level, name);
    this.practice = j.label;
    j.start.colors.forEach((c) => this.blaster.give(c));
    if (j.start.colors.length) this.blaster.setColor(j.start.colors[j.start.colors.length - 1], true);
    for (const w of j.feedsBlown) this.events.add('feed_' + w);
    for (const w of j.down) {
      this.powerDown[w] = true;
      for (const fn of this.powerDownListeners) fn(w, { restored: true });
    }
    const pos = j.start.pos.clone();
    this.checkpoint = { pos, yaw: j.start.yaw, ref: null };
    this.player.spawn(pos, j.start.yaw);
    const mood = AREA_MOOD[regionOf(pos)];
    if (mood) {
      this.musicTrack = mood.music;
      this.ambient = mood.ambient;
      this.setAtmosphere(mood.atmosphere, true);
    }
    this.resumed = true;
    $('#play-btn .play-label').textContent = 'Start';
    $('#jump-note').innerHTML = `Practice run: <b>${j.label}</b> · your save is untouched`;
    $('#jump-note').classList.remove('hidden');
  }

  openLocations() {
    buildLocationList(this.level, $('#loc-list'), (name) => {
      const u = new URL(location.href);
      u.searchParams.delete('start');
      u.searchParams.set('jump', name);
      location.href = u.toString();
    });
    this.showScreen('locations');
  }

  devSkip(where) {
    const s = this.level.devStarts[where];
    if (!s) return console.warn('[chroma] unknown start', where, Object.keys(this.level.devStarts));
    s.colors.forEach((c) => this.blaster.give(c));
    if (s.colors.length) this.blaster.setColor(s.colors[s.colors.length - 1], true);
    this.player.spawn(s.pos, s.yaw);
    this.checkpoint = { pos: s.pos.clone(), yaw: s.yaw, ref: null };
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
      const s = this.level.devStarts.boss;
      this.player.spawn(s.pos, s.yaw);
    }
    if (i.hit('KeyK') && this.level.boss.active) this.level.boss.damage(600);
  }

  // ------------------------------------------------------------------ main loop
  // One gameplay step. Entities update first so moving platforms publish their delta before the player rides them.
  step(dt) {
    this.stats.time += dt;
    if (this.rulesPaused) this.world.fx.update(dt);
    else this.world.update(dt, this.player);
    // A Bonus Round that plays as an overlay (the SDK didn't move us into a native arena) takes the
    // keyboard: hold our player still underneath it, or WASD would walk you into the acid meanwhile.
    if (this.rulesPaused && !this.player.arenaBounds) this.player.updateCamera();
    else this.player.update(dt, this.input, this.settings);
    this.blaster.update(dt, this.input);
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.restock.update(this.player);
    director.update(dt);
    audio.setListener(this.camera.position, this.camera.quaternion); // positional enemy sounds (audio.at)
    barks.update(dt, this); // enemy voice lines (combat/barks.js)
    this.map.track(this.player.pos); // chart where you've been
    const air = this.player.air / AIR_MAX;
    this.hud.setAir(air, this.player.headUnder || air < 0.999);
    const goal = currentObjective(this);
    this.hud.setObjective(goal.html, goal.color);
    audio.setHeartbeat(this.player.health > 0 && this.player.health < this.player.maxHealth * 0.3);
  }

  tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    const t = this.timer.getElapsed();
    this.sky.material.uniforms.uTime.value = t;
    updateLiquids(t);
    this.sky.position.copy(this.camera.position);
    this.updateAtmosphere(dt);
    if (this.started && this.state !== 'title') {
      this.updateMix();
      audio.updateSpace?.(this.world, this.camera.position, dt); // room-size reverb (audio.js)
    }
    this.world.updateLights(this.camera.position, dt);
    this.world.updateCulling(this.camera.position, this.camera.far);

    this.input.active = this.state === 'playing';
    // safety net: playing with the mouse loose and no fallback (a lock lost without any event) pauses, so the
    // cursor never wanders over the page clicking other things
    const loose = this.state === 'playing' && !this.touchMode && !this.input.locked && !this.input.lockFailed;
    this.looseT = loose ? (this.looseT || 0) + dt : 0;
    if (this.looseT > 1.2) {
      this.looseT = 0;
      this.pause();
    }
    audio.setLoopsMuted(this.state !== 'playing');
    this.touch.show(this.touchMode && this.state === 'playing');
    if (this.state === 'playing') {
      if (DEV) this.devKeys();
      // one bad frame of game logic must not freeze the game: report it and keep running
      if (this.voidT && (this.voidT += dt) > 0.8) {
        this.voidT = 0;
        this.respawn();
      }
      try {
        this.step(dt);
      } catch (e) {
        if (!this.stepErrors) console.error('[chroma] step failed', e);
        this.stepErrors = (this.stepErrors || 0) + 1;
      }
      if (this.input.hit('KeyM')) this.map.open();
    } else if (this.state === 'map') {
      this.map.update(dt); // the game stays frozen underneath
    } else if (this.state === 'cutscene') {
      if (this.input.hit('Space') || this.input.hit('Enter') || this.input.mousePressed) this.cutscene.skip();
      this.cutscene.update(dt);
      this.world.fx.update(dt);
    } else if (this.state === 'dying') {
      this.updateDying(dt);
      barks.update(dt, this); // (the taunt over your death)
    } else if (this.state === 'title') {
      // a slow look around behind the menu: the level's own view (the cell block), else the spawn room
      if (this.level.titleView) this.level.titleView(this.camera, t, dt);
      else {
        this.camera.position.set(Math.sin(t * 0.1) * 2, 2.2, -1.5);
        this.camera.rotation.set(-0.05, Math.sin(t * 0.15) * 0.6, 0, 'YXZ');
      }
      this.world.fx.update(dt);
    } else {
      this.world.fx.update(dt);
    }
    // a small FOV kick while sprinting; falling fast pulls the view wide and the wind roars in
    const fall = this.state === 'playing' ? Math.min(1, Math.max(0, ((this.player.fallSpeed || 0) - 11) / 18)) : 0;
    this.fallWind ??= audio.createLoop('fall_wind');
    this.fallWind.setGain(fall * fall * 0.9);
    this.fallWind.setRate(0.85 + fall * 0.4);
    if (fall > 0.3) this.player.shake = Math.max(this.player.shake, (fall - 0.3) * 0.25);
    const fovTarget = verticalFov(this.settings.fov) + (this.player.sprinting && this.player.speed2d > 8 ? 4 : 0) + fall * 22;
    if (Math.abs(this.camera.fov - fovTarget) > 0.01) {
      this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }
    for (const cb of this.frameCallbacks) cb(dt);
    this.hud.update(dt);
    if (this.state === 'map') this.map.render();
    else {
      if (this.vmPass) this.vmPass.enabled = this.state !== 'title'; // (no gun floating over the title's backdrop)
      this.composer.render();
    }
    // (a couple of title frames in, once its shaders are warm, the Continue card's look at the checkpoint)
    if (this.wantPreview && this.state === 'title' && (this.previewWait = (this.previewWait || 0) + 1) > 3) this.previewShot();
    this.input.endFrame();
  }
}

if (DEV) window.THREE = THREE; // for console debugging
window.game = new Game();

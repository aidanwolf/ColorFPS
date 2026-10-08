# Chroma Breach — world layout

Coordinates are meters. **+x is east, -z is north, +y is up.** One scene holds every area, so areas must not
overlap: each module stays inside its region box below. Everything is built from axis-aligned boxes
(`W.box`, `room`, `corridor`, `corridorX`, `plat`, ...) plus entities (see `builders.js`).

## Flow

```
            ┌───────── VERDANT (north, green) ─────────┐
            │  entry x=-10,y=4   ...loop...  return x=10,y=12 │
            └──────────────┬──────────────┬────────────┘
SOLAR (west, yellow)  ┌────┴──── THE HUB ───┴────┐  AZURE (east, blue)
 entry z=-112,y=4 ────┤  x -24..24, z -100..-148  ├──── entry z=-112,y=4 (green door)
 return z=-136,y=12 ──┤  floor y=4, balconies y=12├──── return z=-136,y=12 (forced-ascent elevator)
                      └────────────┬──────────────┘
                     red entry  x=0,y=4 (south wall)        PRISM CORE: beneath the Hub (elevator, needs all 4 colors)
                                   │
                     CRIMSON FOUNDRY (south, red, linear intro)
```

Progression: red (spawn) → Hub → **Solar** (get yellow) → Hub → **Verdant** (yellow door; get green) → Hub →
**Azure** (green door; get blue, ride the forced-ascent elevator back up) → Hub → **Prism Core** (all four
colors) → boss. Every color world is a **loop**: you leave the Hub by its entry port on the floor (y 4) and
come back through its return port onto a Hub balcony (y 12), then drop down to the Hub floor.
From the Hub you can **see into every world through big windows before you can enter it.**

## Region boxes (min → max). Stay inside yours.

| module | file | x | y | z |
|---|---|---|---|---|
| Crimson Foundry | `red.js` | -20 → 20 | -7 → 15 | 2 → -99.5 |
| Foundry annex (color-locked challenge rooms off the spawn room) | `redAnnex.js` | -45 → 45 | -25 → 30 | 100 → -38 (keep clear of red.js's rooms) |
| The Hub | `hub.js` | -25 → 25 | 2 → 45 | -99.5 → -148.5 |
| Prism Core (boss) | `prism.js` | -31 → 31 | -60 → -6 | -88 → -175 |
| Solar | `solar.js` | -32 → -200 | -30 → 80 | -40 → -230 |
| Azure | `azure.js` | 32 → 200 | -80 → 40 | -40 → -230 |
| Verdant | `verdant.js` | -31 → 31 (wider, -110 → 110, once z < -235) | -5 → 60 (may go down to -40 once z < -178) | -148.5 → -380 |
| Final battle stages (off-map; regions `fin_*` in regions.js, each sees only itself) | `finale/*.js` | 700 → 1000 | -10 → 40 | -40 → -450 |

Corridors that join a world to the Hub cross the gap between the Hub wall and the region (x ±25 → ±32);
the world module owns its connecting corridor in that gap. Near the Hub (within 10 m of its walls) keep
world geometry below y 14 except right around your two port corridors, so the Hub's windows (which sit
above y 14) look out over your world. Put something spectacular in that view.

## Hub ports (all openings are 3 m wide, 3.2 m tall, in the Hub's 0.5 m-thick walls)

| port | wall (thickness) | center | floor y | owner of what's beyond |
|---|---|---|---|---|
| Red entry | south, z -100 → -99.5 | x 0 | 4 | red.js (corridor already runs z -81.5 → -99.5) |
| Solar entry | west, x -25 → -24.5 | z -112 | 4 | solar.js — no color gate |
| Solar return | west, x -25 → -24.5 | z -136 | 12 | solar.js; Hub balcony inside |
| Verdant entry | north, z -148.5 → -148 | x -10 | 4 | verdant.js — Hub puts a YELLOW barrier door in the opening |
| Verdant return | north, z -148.5 → -148 | x 10 | 12 | verdant.js; Hub balcony inside |
| Azure entry | east, x 24.5 → 25 | z -112 | 4 | azure.js — Hub puts a GREEN barrier door in the opening |
| Azure return | east, x 24.5 → 25 | z -136 | 12 | azure.js (the forced-ascent elevator tops out here); Hub balcony inside |

A world's corridor must butt exactly against the outside face of the Hub wall (x = -25, x = 25 or
z = -148.5) with its floor top at the port's y and its 3 m width centered on the port center.
The Hub builds the balconies and doors on its side. The return port's corridor should be one-way in
practice (the world's end is a drop or lift the player can't take backwards) — that's fine, the Hub
floor is always reachable by dropping off the balcony.

## Mood: music / ambience / atmosphere

Use `B.area(min, max, { music, ambient, atmosphere })` (a repeating trigger) just inside every doorway
and at the start of every major space, so backtracking restores the right mood, and `B.zoneTitle(...)`
once per world entrance (title card + music). Register your atmosphere preset on
`level.atmospheres.<name>` (fields: see `ATMOSPHERE_DEFAULT` in `main.js`: fog, fogNear, fogFar, skyTop,
skyMid, skyHorizon (raw RGB arrays), aurora, stars, hemiSky, hemiGround, hemiIntensity, sunColor,
sunIntensity, sunDir, exposure, bloom). Presets crossfade over ~2 s.

| area | music | ambient | atmosphere |
|---|---|---|---|
| Crimson Foundry | `music_red` (the rock track — keep) | `amb_foundry` | `foundry` (default) |
| The Hub | `music_hub` (new, calm interlude) | `amb_hub` (new) | `hub` |
| Solar | `music_solar` (new) | `amb_solar` (new; hot wind) | `solar` |
| Verdant | `music_green` | `amb_jungle` | `verdant` |
| Azure | `music_blue` | `amb_abyss` (new) | `azure` |
| Forced ascent | `music_ascent` (new) | — | `azure` |
| Prism Core | `music_antechamber` → boss tracks (main.js) | `amb_core` | `prism` |

New audio files are generated by the audio agent; until they exist, playMusic falls back to the synth
and missing ambient/loops are silent, so reference the names above freely.

Loops: `audio.createLoop(name, { gain, rate })` returns `{ setGain, setRate, stop }` (set gain every frame
from distance to the player). Loop names: `drone_hum`, `elevator_loop`, `sun_hum`.
One-shots: `audio.sample(name, { gain, rate, vary })` — `elevator_start`, `elevator_stop`, `alarm`,
plus everything already in `SFX_FILES` (door_open, door_slam, target, checkpoint, ...).

## Budgets

* **Point lights: ≤ 6 per world, ≤ 4 in the Hub.** Every lit pixel loops over every light in the scene.
  Lights are never removed or hidden (that recompiles every shader); dim them to intensity 0 instead.
  Prefer emissive `glow0..3` / `trimWhite` deco strips and the atmosphere's hemisphere/sun light.
* Drones: ~8–14 per world. Keep static geometry to boxes (they're merged per material automatically).
* Any new material for static boxes must go through `mat(kind, zone)`; zones: red, yellow, green, blue,
  boss, hub. Custom meshes (sun, trees, crystals) can use their own materials, but create few of them.

## Player metrics (for platform spacing)

Width 0.7, height 1.75 (crouched 0.95 — crawlspaces 1.0–1.1 high), eye 1.6. Steps up to 0.45 m
automatically. Jump apex ≈ 1.5 m. Run 7.6 m/s, sprint 10.5 m/s: comfortable gaps ≤ 4 m (≤ 5.5 m
sprinting), rises ≤ 1.2 m per jump. Falling below y -60 is death; touching spikes/acid/orbs is death
(instant), so be fair: telegraph hazards, put a `Checkpoint` before every hard section.

## Dev starts

`B.devStart(name, [x,y,z], yaw, colors)` registers `?dev&start=<name>`. yaw 0 faces north (-z),
π/2 faces west (-x), -π/2 faces east (+x), π faces south.
Each world registers at least its entrance (`solar`, `verdant`, `azure`, `ascent`, `hub`, `boss`).
`B.onRespawn(fn)` runs on every checkpoint respawn — reset elevators / encounters there.

# Chroma Breach

A three.js FPS puzzle-platformer. Tight corridors open onto big floating-platform arenas and open-air yards. Your Chroma Blaster fires four colors, and almost everything in the world only breaks to its own color. That includes barriers that fill the width of a hallway, stacked spike layers you have to clear while falling onto the safe platform below, colored enemies, secret doors, and a 7 m boss.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Controls

| Action | Keys |
| --- | --- |
| Move / jump | `WASD`, `Space` (hold for a higher jump) |
| Sprint | `Shift` |
| Crouch (vents and crawlspaces) | `Ctrl` or `C` |
| Fire | Left mouse (hold for auto-fire) |
| Switch color | `1`–`4`, `Q`/`E`, mouse wheel, `F` = last color |
| Pause | `Esc` |

## The demo

1. **Crimson Foundry** (red, linear intro): grab the blaster, shoot through red barriers, then cross the Crucible: spiked floating and moving platforms over acid.
2. **The Prism Hub**: a calm atrium joining everything. Through its windows you can see each color world before you can enter it. Each world is a loop: you leave from the Hub floor and come back onto a Hub balcony.
3. **Solar · Sunscorch Mesa** (yellow): outdoors under a huge, hot sun. Drop into a scorched canyon past sun lances, find yellow in the Sun Well, then climb back up via mirror puzzles, solar-panel lifts and a red→yellow spike drop.
4. **Verdant · Emerald Hollow** (green, behind a yellow door): overgrown ruins, a bridge-powering ricochet kiosk, a descent into a sunken hollow to the green core, a climb up a giant hollow tree, and the red→yellow→green spike drop.
5. **Azure · The Cold Deep** (blue, behind a green door): descend a frozen research station to the blue core, then ride the **forced ascent**: an elevator that carries you 70 m up while colored spike hatches and drones come at you.
6. **Prism Core**: the four-color lock in the Hub opens the elevator down to the Prism Warden. Shoot its tiled shield away with the matching color, then break its colored limbs and core. It has a laser sword, slam shockwaves you jump over, and volleys of colored orbs.

**Secrets:** color-locked doors and crawl vents in every world (the spawn-room vent needs yellow). Each holds a collectible prism.

## Monetization: Bonus Round

[Bonus Round](https://bonusround.io) turns natural breaks into 15-second playable branded rounds (overlay mode). The game is registered as **Chroma Breach** with publisher id `pub_4e2464e82324152a`, set in `.env` (public by design; override it in `.env.local` if needed).

The game was registered without an account, so it's **unclaimed**: localhost only shows the Bonus Round test ad, and a public site shows free, unpaid house ads. To turn on paid ads, open the claim link (kept in the gitignored `.bonusround/agent.json`, or recover it with `npx bonusround status`), create your account, and add the game's public domain in its Bonus Round settings. Unclaimed games are deleted after 90 days.

Where it hooks in (`src/monetization/bonusround.js`, wired up in `src/main.js`):

- **Loader + `attach()`** after the renderer, scene and camera exist. Every call is safe if the SDK is blocked.
- **`break('intermission')`** after unlocking yellow, green and blue (each color world cleared), and after the boss falls, before the victory screen.
- **Rewarded revive** on the death screen: finish the round and you're revived where you died with 60% integrity.
- **`safe()`**: interval offers are allowed only in menus, never during play or the boss fight.
- The game pauses on the SDK's `start` event and shows a Continue button on `end`.

New games start in test mode, which always serves the Fizzpop Soda test ad. Before going live, add `bonusround.io, pub_XXXXXXXX, DIRECT` to your site's `ads.txt` and turn test mode off in the dashboard.

## Audio

Music and sound effects are generated with ElevenLabs into `public/audio/` (prompts in `tools/audio/sfx.json` and `tools/audio/music.json`):

```bash
ELEVENLABS_API_KEY=... node tools/audio/gen.mjs      # skips files that already exist; updates manifest.json
```

Anything not generated yet falls back to the built-in synthesized sounds.

## Dev helpers

Add `?dev` to the URL for cheats: `G` god mode, `U` unlock all colors, `B` teleport to the boss antechamber, `K` hit the boss for 600. `?dev&start=<name>` starts at a registered point with the colors you'd have there: `red`, `crucible`, `hub`, `solar`, `solar2`, `verdant`, `verdant2`, `azure`, `azurelab`, `azurewell`, `azure2`, `ascent`, `boss`.

## Code map

- `src/main.js`: game states, render pipeline (bloom plus a separate view-model pass), progression and ad hooks
- `src/level.js` + `src/levels/`: one module per area (red, hub, solar, verdant, azure, prism) built with the shared helpers in `builders.js`; `LAYOUT.md` has the map, region boxes and Hub ports
- `src/player.js`: AABB controller (coyote time, jump buffer, crouch, step-up, platform riding)
- `src/weapon.js`: hitscan Chroma Blaster and its view model
- `src/boss.js`: the Prism Warden
- `src/entities/`: barriers, doors and spike layers; drones and orbs; pickups, platforms, jump pads, checkpoints
- `src/audio.js`: ElevenLabs-generated SFX and music (crossfaded per area), with synthesized fallbacks

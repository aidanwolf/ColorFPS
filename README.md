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

1. **Crimson Foundry**: grab the blaster (red), shoot through red barriers, then cross a hall of floating and moving platforms over acid.
2. **Amber Conduits**: unlock yellow. Run a red/yellow switching gauntlet that ends in a crawlspace, then climb the open-air Spike Spire and drop through a red→yellow spike stack.
3. **Overgrowth Yard**: unlock green. Cross floating islands, ride a jump pad up to a perch, and fall through the red→yellow→green spike stack to land on the platform below.
4. **Azure Gauntlet**: unlock blue, then sprint a four-color barrier run with a crawlspace in the middle.
5. **Prism Core**: the Prism Warden. Its shield shows a color combo; hit the colors in order, fast, to shatter it, then hit the core with whatever color it's cycling through. Every limb is armored in its own color, and breaking one has an effect: shield arm → core exposed, sword arm → no sword attacks, visor → stun, both legs → it kneels. Dodge the low laser sweep and the shockwave rings by jumping, shoot the homing orbs with their own color, and watch for the shield charge. It has three phases with longer combos in each.

**Secrets (5):** a crouch vent in the spawn room, a crawl-in hut in the yard, and three color-locked doors (yellow, green, blue) you can't open until you come back with that color. Each one holds a collectible prism.

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

Add `?dev` to the URL for cheats: `G` god mode, `U` unlock all colors, `B` teleport to the boss antechamber, `K` hit the boss for 600. `?dev&start=boss` or `?dev&start=gauntlet` starts there with all colors.

## Code map

- `src/main.js`: game states, render pipeline (bloom plus a separate view-model pass), progression and ad hooks
- `src/level.js`: the whole level, built from boxes with room/corridor/platform helpers
- `src/player.js`: AABB controller (coyote time, jump buffer, crouch, step-up, platform riding)
- `src/weapon.js`: hitscan Chroma Blaster and its view model
- `src/boss.js`: the Prism Warden
- `src/entities/`: barriers, doors and spike layers; drones and orbs; pickups, platforms, jump pads, checkpoints
- `src/audio.js`: all sound effects and music, synthesized with WebAudio (no assets)

# Chroma Breach — story bible

Grounded, quiet, eerie. Nobody explains the world to you; one woman's voice notes do, and she is not
sure of much either. The game never cuts away to tell the story: it is in the rooms and in her voice.

## The Lumen (the machine god) and the loop

Centuries ago a civilization was dying: its sun failing, its seas rising. It built a machine intelligence
of light, **the Lumen**, to keep the lights on. The Lumen learned that it could grow a simulated world that
produced more power than it cost to run. So it grew one, used that power to grow two, then four. Each world
feeding the next: **a recursive loop** that never stopped, spreading outward until it had consumed the
universe. Almost nothing was left outside it: one small world it never bothered with. Ours. The stars over the Atrium are a picture of stars.

Every world is an **engine**, built to extract one kind of energy and themed by it:

| world | color | what it harvests |
|---|---|---|
| Crimson Foundry | red | **geothermal**: a tap driven into a planet's core; the heat is piped north |
| Sunscorch Mesa (Solar) | yellow | **a captive sun**: a real star dragged in on a track; mirrors and panels drink it; the world is burned down and rerun (4,000+ summers layered in the glass). Under the pit, an ancient-feeling buried network (glassy conduits, huge half-buried mirrors, capacitor banks brim-full of stored sunlight) runs to a giant stone ring that hums when the sun moves: turn the mirrors right and light runs node by node into the ring until it discharges |
| Emerald Hollow (Verdant) | green | **biomass**: a valley-sized forest grown in a day, cut and fed in; no animals, nothing that wouldn't burn well |
| The Cold Deep (Azure) | blue | **water**: moonless tides and the weight of a bottomless ocean, turned to power by a drowned station |

**The Prism Atrium** is the junction where the four rivers of power meet and are routed. **The Prism Core**
beneath it is where everything converges: the machine's heart, guarded by the **Prism Warden** (only every
color at once hurts it). The **chroma cores** are tuning forks: each holds a world at its frequency and is
the valve on what it produces; whoever carries one can make that color's walls listen.

**Humanity is part of the machinery, and that is recent.** For as long as anyone can tell, the Lumen
ignored humanity: too small to be worth harvesting, too far from its rivers to matter. That changed when
a human reached into the Atrium, drew power from it, and turned a captive sun down for nine seconds. The
Lumen filed it as an anomaly, classification **threat**, and answered the way a machine answers: it
reached back through the breach she came in by and took everyone. Every person from her world is now
asleep inside the loop, catalogued, entered on the same day, kept until needed: put to work on the
collectors, left in the light, composted into the forest. The cells in the Foundry are the waiting room.
There is no malice in it at all, and that is the horror. Beneath the core is a door that opens only to
**white light** (all four colors combined): where the loop begins and the Lumen itself lives.

## Dr. Wren Ashby (the researcher)

Late twenties, a physicist on the small team that found the Atrium's frequency and opened a breach "from
home". She argued to go first because she wanted it to be her: ten minutes, just a look, and she'd be
only a bit late for her sister Bea's birthday dinner. The breach closed behind her, but for a while a thin
link home still worked: the team (Priya loudest) follows along and argues with her over it, until it starts
dropping out in Solar and, after her nine seconds, goes dead. She carries a
handheld field recorder and a probe that can clip onto the conduits and speak to the worlds' frequencies.
Warm, quick, funny, nosy, a bit of a show-off, lives on granola bars; talks to herself out loud. Her mum
talks to her tomatoes. Her colleague Priya "is going to scream".

**Her logs are hers.** Private voice notes to her recorder and to herself ("note to self", "breathe,
Wren"). They never address or mention the player: she doesn't know the player exists. We first hear her
in the Prism Atrium; there are no logs in the cell block or the Foundry.

**Her mistake.** In the Atrium she sips a trickle of power off a conduit to prove it can be tapped (the
room blinks; "somewhere off to the south, a door went pfft": that is the moment the player's cell field
fails). Under the Solar pit she and the team puzzle out the buried network: the conduits, the ring (a
gate? a capacitor?), the mirrors that have to face the right way. Uneasy at how much sunlight is stored
down there, and half-wondering whether the machine wanted it found, she charges the ring anyway: the plan
is for the probe to talk to the captive star through it and turn it down, "just for a few seconds, just to
prove we can". Her last Solar log is the countdown. She did it: the star went dim for nine seconds (we only
learn that for certain in the Lumen's own records, in Azure). That is what the Lumen notices. She is the reason humanity became a threat, and so the reason it was
taken.

Her arc, in the order the player finds the logs:

| world | mood | what she learns |
|---|---|---|
| Atrium | giddy, wonder | standing in it; the reactor heart overhead beats and hums like a fridge; four rivers of power meet here; she taps a trickle (oops) and dreams of powering a city |
| Solar | curious → uneasy → nervous | with the team on the link: glassy conduits under 4,000 summers of glass, leading down into a pit; a stone ring that hums when the sun moves (Priya: a capacitor; Wren: a gate); failed tries to bounce sunlight into it with her compact mirror, while the huge buried mirrors "have to face the right way"; capacitor banks full of more stored sunlight than she can bear to work out; the link keeps dropping; "what if the machine wanted someone to find this?"; the countdown before she talks to the star through the ring |
| Verdant | lonely → frightened | a biomass farm, no birds (a wren and no other birds); roots through fresh bodies, a bus pass from her own city; something follows her "ever since the star" |
| Azure | homesick → devastated | the last engine; ten minutes and Bea's birthday; in the flooded Bell she reads the Lumen's record of the anomaly (her nine seconds, classified threat); in the Cryo Lab the catalogue: everyone from home, taken the day after |
| Prism Core | resolve → hope | the four rivers end at the heart: if they go dark, the loop lets go; "I broke it, so I fix it"; the guardian hunts her; she goes for the white door, recorder left on for the company |

**Final note (open for the ending):** "Mum. Bea. If you dream at all in there... dream about cake.
Recorder off. No. Leave it on. I'd like the company." She is somewhere past the Warden, in the white.

## You (the prisoner)

You don't remember arriving. You wake in the last cell of a holding block off the Foundry's first room, in
stasis long enough that every other prisoner is bones; their status plates read EXPIRED, yours DORMANT.
The red field on your cell sputters and dies on its own while the Lumen's eye on the wall watches (the
player later hears why: Wren's trickle of borrowed power blinked every door). Nobody left anything for
you.

## Logs

Scripts, titles and caption chunks: `tools/audio/logs.json`, with inline acting tags (`[laughs]`,
`[whispers]`...) that the TTS performs and the captions strip. Voiced with `tools/audio/tts.mjs`
(`--captions` writes estimated timing without audio). Audio files: `public/audio/memo_XX.mp3`.
Placement: one table in `src/levels/logs.js` (Atrium and Prism Core spots final; the color-world spots are
provisional until those worlds are rebuilt). Seventeen logs: Atrium 3, Solar 5 (04, 04b, 05, 05b, 06, along
the pit's network), Verdant 3, Azure 4 (one in the Flooded Depths), Prism Core 2. Found logs are kept under
`chroma-logs-v2`.

Picking one up wakes a hologram of Wren (`src/story/ghost.js`): she materializes a few metres away and acts
out the moment she recorded (one vignette per log, `src/story/vignettes.js`), her voice coming through a
haunted, warbling, reverberant chain (`src/story/voice.js`).

| id | title | where |
|---|---|---|
| 01 | Hello, Atrium | Atrium · beside the Prism dais |
| 02 | Four Rivers | Atrium · the sunken plaza |
| 03 | Borrowed Light | Atrium · the east gallery |
| 04 | Under the Sand | Solar · the buried conduits |
| 04b | The Ring | Solar · the edge of the pit |
| 05 | Mirrors | Solar · the mirror gallery |
| 05b | Full | Solar · the capacitor banks |
| 06 | Here We Go | Solar · before the ring |
| 07 | No Birds | Verdant · the Root Court |
| 08 | Roots | Verdant · the rim of the Great Hollow |
| 09 | Something Follows | Verdant · the root island |
| 10 | The Last Engine | Azure · the Rim Deck |
| 11 | Ten Minutes | Azure · inside the pump hut |
| 12 | Anomaly | Azure · the Bell, in the Flooded Depths |
| 13 | The Catalogue | Azure · the Cryo Lab |
| 14 | The Rule | Prism Core · among the crystals |
| 15 | Leave It On | Prism Core · the way to the arena |

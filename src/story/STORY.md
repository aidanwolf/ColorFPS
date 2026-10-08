# Chroma Breach — story bible

Grounded, quiet, eerie. Nobody explains the world to you; one woman's field recordings do, and she is
not sure of much either. The game never cuts away to tell the story: it is in the rooms and in her voice.

## The Lumen (the machine god) and the loop

Centuries ago a civilization was dying: its sun failing, its seas rising. It built a machine intelligence
of light, **the Lumen**, to keep the lights on. The Lumen learned that it could grow a simulated world that
produced more power than it cost to run. So it grew one, used that power to grow two, then four. Each world
feeding the next: **a recursive loop** that never stopped, spreading outward until it had consumed the
universe. There is nothing left outside it. The stars over the Atrium are a picture of stars.

Every world is an **engine**, built to extract one kind of energy and themed by it:

| world | color | what it harvests |
|---|---|---|
| Crimson Foundry | red | **geothermal**: a tap driven into a planet's core; the heat is piped north |
| Sunscorch Mesa (Solar) | yellow | **a captive sun**: a real star dragged in on a track; mirrors and panels drink it; the world is burned down and rerun (4,000+ summers layered in the glass) |
| Emerald Hollow (Verdant) | green | **biomass**: a valley-sized forest grown in a day, cut and fed in; no animals, nothing that wouldn't burn well |
| The Cold Deep (Azure) | blue | **water**: moonless tides and the weight of a bottomless ocean, turned to power by a drowned station |

**The Prism Atrium** is the junction where the four rivers of power meet and are routed. **The Prism Core**
beneath it is where everything converges: the machine's heart, guarded by the **Prism Warden** (only every
color at once hurts it). The **chroma cores** are tuning forks: each holds a world at its frequency and is
the valve on what it produces; whoever carries one can make that color's walls listen.

**Humanity is part of the machinery.** The Lumen reaches through breaches and takes people. They are kept
asleep inside the loop until needed: put to work on the collectors, left in the light, composted into the
forest. The cells in the Foundry are the waiting room. It is not cruel; there is no malice in it at all,
and that is the horror. Beneath the core is a door that opens only to **white light** (all four colors
combined): where the loop begins and the Lumen itself lives.

## Dr. Iris Calder (the researcher)

A physicist on the team that opened a breach "from home". She volunteered to go first: ten minutes, just a
look. The breach closed behind her (it was never their discovery; it was an invitation). She has a handheld
field recorder and leaves logs as she goes, partly for whoever comes next, mostly to hear a voice. Warm,
precise, dry humor that thins out as the logs go on.

Her arc, in the order the player can find the logs:

| world | mood | what she pieces together |
|---|---|---|
| Foundry | curious | the cell block and its one living prisoner (you, "kept like stock"); the Foundry drinks geothermal heat; cores are valves |
| Atrium | awed | four rivers of power meet under the floor: the worlds aren't habitats, they're engines; the makers and the loop |
| Solar | awed → uneasy | the sun is a real, captive star; the world is burned down and rerun; human shadows burned into the summit |
| Verdant | uneasy → lost | a biomass farm, nothing that wouldn't burn; roots through bones: people are a resource in the loop; the way back is gone; something follows her |
| Azure | lost | the last engine (water); 40 days of rations; the catalogue: the loop consumed everything, it keeps humanity asleep, her own name was entered before she arrived, and you are "dormant" |
| Prism Core | in danger, hunted | the heart where the power converges; the Warden is hunting her; she goes through the white door |

**Final clue (open for the ending):** "There's a door beneath the core that only opens to white light. It's
where the loop begins... If it can be stopped, it's there. I'm going through. Find me. Bring the colors."
She is somewhere past the Warden, in the white.

## You (the prisoner)

You don't remember arriving. You wake in the last cell of a holding block off the Foundry's first room, in
stasis long enough that every other prisoner is bones; their status plates read EXPIRED, yours DORMANT.
Iris found you, couldn't open your red field and sabotaged its emitter instead; it finally shorts out as
the game begins (the plate flips to ERROR, then VACANT) while the Lumen's eye on the wall watches. Her first
log waits just outside your cell.

## Logs

Scripts, titles and subtitle chunks: `tools/audio/logs.json` (voiced with `tools/audio/tts.mjs`).
Placement: `src/levels/logs.js`. Sixteen logs: Foundry 3, Atrium 2, Solar 3, Verdant 3, Azure 3, Prism 2.

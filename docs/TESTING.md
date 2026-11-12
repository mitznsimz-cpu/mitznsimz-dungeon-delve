# Mitz & Simz: Dungeon Delve — playing and testing locally

## The short version

There is only ever **one game file**. Each slice supersedes the last and contains
everything before it. You never link slices together.

Clone or download this repo, then, from its top folder:

- **To play:** double-click `index.html` (keep `msdd_assets.js`, `motion.js` and `sound.js` beside it)
- **To test:** `cd` to that folder and run `sh tests/run_gate.sh`

That's it.

---

## What each file is

| File | What it is |
| --- | --- |
| `index.html` | **The game.** Open this. Everything is inside it, including the drawn miniatures |
| `msdd_assets.js` | Wall textures (CC0, from 3dtextures.me). Optional: without it the walls are drawn as masonry. Since v4.9 it carries no figure renders |
| `msdd_materials.js` | v6.0: the 3D view's materials and zones: stone, wood, iron and doors drawn by a shader into textures, the coverings (moss, soot and lava, crystal, frost, dust, roots, sand, ore, fungus), water, and point-light shadows. Optional |
| `msdd_view3d.js` | v6.0: the 3D view. Builds the floor from the game's own data and draws it in WebGL 2. Optional: without it, or without WebGL 2, or with the setting off, the view is drawn in 2D |
| `motion.js` | Hold the Line's motion module (1.1.0), unchanged: wind-ups, hit-stop, knock-back, spells in flight, bits by material, a tumbling d20, dice pops, the cats' paw. Optional: without it fights are drawn still. Don't edit it here; new versions come from Hold the Line |
| `sound.js` | Hold the Line's sound module (1.0.0), unchanged: 17 sounds made in the browser, no audio files. Optional: without it the game is silent. Don't edit it here either |
| `packs/msdd_pack_ashkeld.json` | The bundled adventure as a standalone pack, for editing |
| `docs/pack_authoring.md` | How to write a pack: terrain, traps, finds, mechanisms, habitats, miniatures and the rest |
| `tests/run_gate.sh` | Runs every harness in order. Your pre-commit check |
| `msdd_party_balance.js` | The party balance test: plays the campaign and an 8-floor delve with 13 party mixes and prints how each fares. `node msdd_party_balance.js` (about 15 seconds). Not part of the gate |
| `mitznsimz_minis.js` | The miniatures library shared with Hold the Line (2.5.0: 94 figures and 133 poses). The game embeds it; the gate checks the copy matches |
| `tests/harness_*.js` | 30 runners. `run` covers the run record, unlocks, class variants, loot rarities and the zone pick. `view3d` covers the zones, the floor built in 3D and the hand-over between the views. `minis` covers the shared miniature library, `terrain` the floor's second layer, `campaign` saves, the town and banter, `motion` the fight animation, `bestiary` habitats and the creatures that live in them, `sound` sound.js and the game's settings, `dungeon` traps, chests, finds, mechanisms and the generator's dressing, `rogue` the Rogue, locks, signature moves, tools, spells and rings |


---

## Installing it as an app

The PWA files only work over http(s), not `file://`. From the folder:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/index.html`, then use the browser's
install option (Chrome: address-bar icon; Safari on iOS: Share -> Add to Home
Screen). Once installed it runs offline — the service worker caches everything.

Bump `CACHE` in `sw.js` on every release or returning players keep the old build.

---

## Playing it

Double-click the HTML. It runs from `file://` with no server — everything is
inline, no build step, no dependencies.

**One caveat.** Safari blocks `localStorage` on `file://` URLs, so saving will
fail silently there. Two options:

- **Use Chrome** for `file://` testing — it allows per-file-origin storage
- **Or serve it locally**, which works in every browser:

```sh
cd ~/path/to/folder
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

Every figure in the game is drawn from the shared Mitz & Simz minis library,
and since minis 2.4.0 they strike, cast, guard and flinch in fights with Hold
the Line's poses. Since minis 2.5.0 every hero class has a man's and a
woman's figure, so Wren the rogue is drawn as a woman.
The renders made from STL files are on the back burner until the original
sculptors give permission: the game no longer ships them, the pack no longer
names them, and they stay off. The machinery is still there, so an asset file
that has renders can be looked at privately by adding `?figures=renders` to the
address.

The local server is also how you'd test the PWA/offline behaviour later, so it's
worth getting into the habit.

### Test parties

The roster screen offers three pre-built parties under "For testing":

- **Level 1** — Pete and Sharron (Fighters), Mitz (Priest), Simz (Wizard), starting kit, 120 gold
- **Level 12 (max)** — the same four at the cap, best shop gear, every spell, 5,000 gold
- **Level 5, with a rogue** — Pete (Fighter), Wren (Rogue), Mitz (Priest), Simz (Wizard), the spells and skills of their tiers, 800 gold, and rope, a crowbar, two flasks of oil and caltrops

Both skip character creation entirely. They exist to exercise mechanics and
flow, not to measure balance.

### What lives where (v4.6)

Sixty-two monsters now, each living in one or two of six places: warrens,
crypts, flooded halls, ruins, the deep and forges. In Ashkeld, the Cistern on
floor 2 brings frogs, crabs and eels up out of the water, the tunnels keep to
goblin-kind, and the Ossuary on floor 3 keeps to the dead. Endless floors keep
to their theme's places: the kilns are full of fire beetles and salamanders,
the vaults of the drowned and the dead. New on the list: hobgoblins, wolf
riders, ankhegs and trolls; mummies, banshees, necromancers (who raise
skeletons) and vampires; giant frogs and crabs, shock eels and the drowned;
imps, animated armour, mimics and a medusa; a rust monster (it damages gear:
take it to Simz) and a gelatinous cube; fire beetles, salamanders, magma
crawlers, and a young red dragon at the very bottom.

### Fights you can feel (v4.7)

Blows wind up before they land. A crit or a heavy hit freezes both figures for
a beat, and a d20 tumbles across the table showing the roll. What flies off a
struck figure depends on what it is made of: sparks off armour, bone chips,
stone dust, ooze splats, embers. Spirits drift away when they die, oozes melt,
constructs crumble, and the fallen lie where they drop until one of the cats
reaches in and sweeps them off the table in a single swipe (Mitz and Simz take
turns, each with a collar tag at the table's edge: Mitz red with a gold M, Simz
gold with a red S). Since the end of v4.9 that comes once two are down, or one
has lain four seconds, or the fight is won, as in Hold the Line (which waits
for three, its fights being bigger). Every move has a sound. **☰ → Settings**
has sound on or off, the volume, reduced motion and the cat paws (off, the
fallen fade instead); **M** turns the sound on and off anywhere.

### The dungeon comes alive (v4.8)

**Traps** are hidden until you find them. **Search** looks at your square and
the four around it; a found trap is drawn and marked on the map, and facing it,
**Use** disarms it (or walk on, carefully, and you may step round it). Darts,
gas, fire jets, nets, tripwires that bring the floor down on you, and the old
blade traps. **Chests** open on screen, some are trapped, and some, from the
third floor down, are not chests. **Finds**: fountains to drink from, altars to
pray at or rob, statues that ask riddles, dead delvers, old camps, travelling
merchants, and prisoners who will fight beside you to the next stairs if you
can get the chains off. **Mechanisms**: pressure plates, portcullises (raised
by a plate or lever, or heaved up by the strongest), walls that are not there,
doors that only open one way, ice you slide across, bridges that take you over
once, and pillared halls where the back rank has cover. A fight in a doorway
is one at a time. Ashkeld has a few of each; every endless floor is dressed.

To see them all quickly in Ashkeld: the shortbow chest at the top of the tower
(search beside it first), the delver by the well, the prisoner in the goblin
chief's den, the tinker in the Warren's far corner, the statue in the
Laboratory's antechamber, and the plate and portcullis beyond it.

### The Rogue, and the tools of the trade (v4.9)

**The Rogue** is a fourth class: light blades and bows, leather, and Dexterity
for everything. From the back rank, **Backstab** puts a knife in whatever your
front rank is fighting (always a critical on something nobody has hurt yet), and
**Melt Away** hides them for two rounds. Simz teaches three more: **Dirty
Trick** (grit across their front rank: worse to hit with, easier to hit, for two
rounds), **Knife Flurry** (two thrown knives) and, from level 5, **Assassinate**
(the sneak dice three times over, and a wounded foe does not get up). Melt Away
then Assassinate is the combination: from hiding it always lands as a critical.
A rogue notices traps just ahead
without searching, and **picks locks**: face a locked door without its key and
press Use. **Monsters have signature moves**: the gelatinous cube swallows a
hero, the medusa turns one to stone, the vampire turns one against the party
for two turns, the ankheg comes up through the floor among the back rank, and
fire stops a troll mending for a turn. **Tools** from Simz: rope (over a
one-square chasm, or down a pit without falling), a crowbar (forces a lock,
loudly), oil (thrown fire, or burn the webs) and caltrops (their melee −2, and
a sure escape). **New spells**: Knock, Levitate, Water Walk and Detect Traps
between fights, and Silence in a fight. **Rings** found in the dark go by a plain
name until worn or shown to Simz, and a cursed one will not come off until
Mitz lifts it.

Quickest way to see it: start the "Level 5, with a rogue" test party, face the
warped door in the tower's hall and press Use.

### The screen fits the device (v4.9)

The dungeon view comes first at every size. On a wide screen the party, the
threat and the buttons sit in a column on the right, and the view and the
automap take the rest. Held upright on a phone, the buttons fold into two rows
(Use runs down the right-hand side) and the automap is a small inset in the
corner of the view: tap it for the full map, and tap again to shrink it. Turned
sideways, a phone gets the wide layout in miniature. Monsters, and the merchant,
now stand in the middle of their square and a little taller, so they are easy to
make out a square or two ahead.

Fights follow suit. On a wide screen the figures and the log fill the left,
and the list of who is who (every foe, and the party with their BP and MP) sits
on the right above the target line and the actions. On a phone held upright,
the figures get a band of their own, and the **List** button at the top swaps
the log for that list. Held sideways, the figures fill the left and the actions
the right. Figures grow with the screen. A caster's long list of actions
scrolls, with a gold glow at the edge when there is more below. When the enemy
wins the initiative they now take their turn first. Before, the fight froze on
"…" whenever that happened.

To check the layout at thirteen screen sizes, from a small phone to a big
monitor, the repo has `tools/layout_shots.js`: run
`node tools/layout_shots.js index.html <folder>` (it needs Playwright,
`npm install playwright`). It saves a screenshot of each size and prints the size
of the view and the map, and whether anything spills off the screen.
`tools/fight_shots.js` does the same for the fight screen.

### Controls

- **Arrows** or **WASD** — move
- **Q / E** — turn
- **M** — sound on and off
- **☰** (top right) — saves, campaign name, whole-game export/import, party export/import, settings
- **Packs** — the party's gear, and spells to cast between fights
- **Use** — open, take, read, talk; clear rubble and webs, disarm a found trap, heave a portcullis, pick or force a lock, or throw a rope across a gap in front of you
- **Search** — look for secret doors, and for traps here and on the four squares around you
- **Tap the automap** — enlarge, tap again to shrink (on a phone held upright it sits in the corner of the view)
- **Tap the fight** while a turn plays out — skip to the end of it
- **List** (top right of a fight, on a phone) — swap the log for the list of who is who

### Saves

The game autosaves as you go, and keeps the autosave from a minute or more
before it. If a save is ever cut off mid-write, the menu and the title screen
offer that earlier one. **Export this game** writes the whole game to a file,
which **Import a game…** brings back here or on another device. Endless and
generated delves are rebuilt from their seed when loaded, so they now survive
closing the page.

---

## Running the tests

You need Node. Check first:

```sh
node --version
```

If that errors, install it:

```sh
brew install node
```

Then, from the repo's top folder:

```sh
sh tests/run_gate.sh
```

Expected output:

```
=== pack ===              PASSED — 44 passed, 0 failed
...
=== minis ===             PASSED — 228 passed, 0 failed
=== terrain ===           PASSED — 105 passed, 0 failed
=== campaign ===          PASSED — 60 passed, 0 failed
=== motion ===            PASSED — 111 passed, 0 failed
=== bestiary ===          PASSED — 107 passed, 0 failed
=== sound ===             PASSED — 34 passed, 0 failed
=== dungeon ===           PASSED — 147 passed, 0 failed
=== rogue ===             PASSED — 164 passed, 0 failed
GATE PASSED
```

Any `FAIL` line names the specific assertion. A non-zero exit code means the
gate failed, so this can go straight into a git pre-commit hook later. (Before
v4.1 the script lost each runner's exit code in a pipe and could print
`GATE PASSED` over a failure; it now checks every runner and prints
`GATE FAILED — n runner(s)` and exits 1.)

Individual runners work too, if you're iterating on one area:

```sh
node tests/harness_combat.js
```

### One more run (v6.1, the roadmap's v5.5)

An endless delve is now a run. When the party falls, the run ends: a card
names the floor it reached, the foes felled, the gold and kit found, and the
blow that ended it (who fell last, to what). Each ended run unlocks the next
thing on a fixed ladder (a run that reached floor 5 unlocks two):

1. Delver's pack: every new delving party starts with two torches, a rope and an antidote.
2. The Vanguard: a Fighter variant, +1 defence and -1 to hit.
3. Stranger stone: delve floors may be cut from arcane vaults, old mines and timber cellars (3D).
4. The Hedge Witch (Wizard: +3 magic, -2 body), then a heavier purse (+60 gold),
   the War Priest (Priest: +1 to hit, -2 magic), Simz's compliments (two
   draughts and an ether) and the Cutthroat (Rogue: +1 to hit, -1 defence).

A variant is chosen on the party screen, beside the class. The record lives in
storage apart from the saves (`msdd_meta`), so a new game keeps it. *One more
run* starts a fresh delve with a fresh party; *Wake at the door* carries on in
the same delve, as a new run.

**On a phone (v6.1.1).** Held upright, the view grows to up to 1.2 times as tall as it is
wide, and the log folds to where you stand and its last two lines. *Log* opens
the whole of it over the screen; *Close* folds it again. The buttons sit at the
bottom, under your thumbs, and the automap inset is smaller. Hanging chains in
3D are now interlocking links from a ceiling staple, one to three to a wall,
some ending in an open manacle or a hook.

**Loot rarities.** About one plain chest in six in a generated delve holds a
piece of gear from the depth's shop list (or a floor ahead). About two in five
of those are Fine (+1) and one in five Masterwork (+2), and both come out
unidentified: "Unidentified weapon", worth 10 gold to Simz until he looks at it
(25 gold) or someone wears it. A three-floor run turns up a couple. The find is
seeded by the delve's seed and the chest, so a reload opens it the same way.

**Zones by seed.** A delve floor's zone is now picked from its theme's zones by
the run's seed and the depth, so two delves look different from the first floor.

The `run` runner (56 checks) covers the ladder, the record's repair from bad
storage, kit and variants, the variant numbers, the find rates and rarities,
identifying and wearing, the zone pick and the summary text. The bot's gate for
it is `--meta`: a fresh player plays endless runs until three have ended, and
passes only if each one unlocked something.

```sh
node tools/playbot.js index.html --meta 3 --runs 2 --jobs 2
```

### Into 3D (v6.0)

The corridor is drawn in WebGL 2 by `msdd_view3d.js`, with the materials and
zones from `msdd_materials.js`. The game still decides everything; the view
asks it, through a few hooks in `index.html` (`v3dHooks`), which doors are open,
which seams are found, what has been taken, which levers are thrown, which traps
are known, which barriers are down and who is still standing. A new floor is
built once; it is built again only when one of those answers changes.

- **Moving:** the camera follows the game's own step and turn, so it is still
  one square at a time, four ways to face, with the v5.2 glides and head dip.
- **Zones:** each floor wears one of 16 zones. Ashkeld's floors name theirs in
  the pack (`"zone": "damp"`, `"sewer"`, `"arcane"`). Each delve theme names two;
  the run's seed and the depth pick one (v6.1). Without a zone, a floor
  gets one by its habitat, then by its wall texture.
- **Light:** the torch you carry and the wall torches the game already hangs,
  each lighting the stone per pixel, with shadows from the torch and the two
  nearest wall torches. How far you can see (`currentSight`) sets how bright
  the torch is and how thick the dark.
- **Things:** doors in frames (swung open once opened; a seam nobody has found
  is just wall), portcullises that rise, chests whose lids are thrown back,
  levers, plates, shrines, fountains, campfires, stairs, pits and chasms with
  bridges, and paper-thick minis on bases for the monsters waiting in a square,
  turning to face the party.
- **The settings:** `3D view: on/off` in the menu, remembered. It switches off
  by itself without WebGL 2, and drops back to 2D if the browser loses the
  context. If frames come slowly it lowers its sharpness, then turns shadows
  off, and comes back up when there is room.
- **The play bot** plays the 2D view by default: it checks the game, and in
  headless Chromium the 3D view is drawn in software at about a second a
  frame. `--view 3d` plays it in 3D, and `--shots N` takes a picture every N
  ticks to look at.

**The fight screen (v6.0.3).** Each rank stands on a floor of its own: warm for
the front, cool for the back, a dashed line between a side's two ranks, and a
ground line under each (dashed for the back). The captions are coloured to
match, with a sword for the front and a bow for the back. Whose turn it is shows
three ways: a banner across the top of the stage ("ANSEL'S TURN, back rank" in
gold, or "THEIR TURN" in red) that pops in when the turn changes hands, a beam
of light over the one acting with a pulsing ring at their feet while the rest of
the party is a shade dimmer, and "Ansel's turn" in the header, larger, with a
pulse on each new turn. Reduced motion keeps all of it, without the pop and the
pulse. The look runner checks it under [L34].

The `view3d` runner (48 checks) builds every Ashkeld floor and a six-floor
delve in node, with no WebGL: a ceiling over every open square, a wall on every
walled edge, a leaf for every door; an open door, a found seam, an opened chest
and a beaten group each change what is built; every zone names materials,
water, particles and clutter that exist; and the game's hand-over and fallback
are in place.

### Ambush (v5.4)

Now either side can be caught unready. An ambusher still takes the first round.
Otherwise the party may see the enemy first, and the enemy loses round one. The
odds are about one fight in eight, better with a Rogue alive and better again
if the party searched within the last three steps (a careful approach). When
it happens, any Rogue starts the fight in the shadows, ready to Assassinate or
Backstab. A boss is never caught out.

Bosses telegraph their big blow. On its turn in round two, and every third
round after it lands, a boss winds up instead of attacking: a line in the log,
a pulsing **!** over it on the stage, and *winding up* beside its name. It
fights on as usual in the next round and lets the blow go when that round ends.
A melee boss hits the front rank twice as hard as its best attack; a boss with
a ranged attack hits everyone a little harder. Whoever chose **Defend** that
round takes a quarter. Hurt it by 30% of its BP while it gathers, blind it
with Dirty Trick, or Silence a caster, and it staggers: the blow comes apart.

The party balance test plays both: the surprise round happens in its fights,
and its tactics answer a wind-up the way that worked best (grit, Silence, or
the biggest spell at the boss; bracing cost more rounds than it saved). The
balance bands held: Ashkeld is finished by 64–92% of party mixes (was 56–92%),
the Shade falls first time 65–83%, and the 8-floor delve now reaches 4.2–6.1
(was 3.6–5.8). The play bot checks it on the real screen:

```sh
node tools/playbot.js index.html --bosses --runs 2 --mode both --jobs 2
```

levels the party up, fights every boss in the pack in turn, and fails with
`no-tell` unless each one winds up where the bot can see it and the bot
answers it (Dirty Trick or Silence if it has them, otherwise Defend).

### Dressed stone (v5.3)

Walls carry cracks, moss, soot, drip stains, chains, cobwebs in the ceiling
corners, and now and then a torch in an iron bracket that lights its stretch of
passage. Empty floors have bones, chips of stone, or a puddle where it is damp.
What a floor gets follows the kind of place it is (see the pack authoring guide),
and each detail stays where it is every time you pass. The side walls carry a
little carved relief, and dust drifts in the torchlight, sparks rise from embers
and wall torches, and mist hangs over a chasm.

### In motion (v5.2)

Moving is still one square and a quarter turn at a time, but each now glides:
a step takes 150 ms and eases to rest with a slight dip of the head, and a turn
swings the old view out as the new one swings in. A key pressed while a move is
still playing is kept and played straight after, so quick taps are never lost
and holding a key walks on. In a fight, idle figures breathe, each in its own
time, and a crit or heavy blow jolts the stage. A fight opens with a quick fade
and zoom, and the dungeon fades back in afterwards. **Reduced motion** turns all
of this off.

### Torchlight (v5.1)

The party carries a torch. Light is bright close by and falls away into the
dark, the ceiling sits darker than the floor, walls are shadowed where they
meet the floor and ceiling, and the far wall darkens into its corners. You see
seven squares down a corridor instead of five, and the dark, not a cut-off,
ends the view. Embers and holy ground light their own squares and fade over
the next two. A Light spell carries the torch further. The flame flickers
gently while you look around; with **Reduced motion** on it holds still.

### First-run hints (v5.0)

A new player gets a short hint the first time each thing happens: the first
steps, the first chest, the first fight, the first trap, the party first badly
hurt, the first hero ready to level, and the first wipe. Each shows once. **Got
it** closes it; **No more hints** turns them all off. In the menu, **Hints**
turns them on or off, and **Show hints again** brings back every one. The
words follow the device: keys on a computer, buttons on a phone.

### The play bot (v5.0)

The runners test the rules directly. The play bot plays whole runs through the
real screen instead, pressing keys and clicking buttons as a player does: it
picks an adventure, makes a party with **Suggest a party**, explores, fights,
opens chests, answers events, rests, uses the temple, takes the stairs, and
wakes after a wipe. Every 300 moves it saves, reloads the page, continues the
saved game and checks the game came back the same.

```sh
npm install playwright
node tools/playbot.js index.html --runs 20 --jobs 4
```

It reports a fault when the game is at fault: an error on the page, a screen
with nothing to press, a fight stuck on the enemy's turn, a BP, MP, gold or XP
that isn't a sane number, the fight screen out of step with the fight, or a
game that comes back different after a reload. Each run's seed is printed, so
a failing run can be played again exactly. Screenshots and `report.json` go in
`playbot-out/`.

Its first runs found two bugs the runners never could: a fight could start
while the town was opening (the town then sat over the fight, with its temple
usable mid-fight), and a split or summoned foe copied its parent's name, so
three "Rot Grub F" could stand in one fight. Its 200-run check of v5.3 found a
third: a draining foe could lower a hero's casting stat and leave their MP
above the new maximum (fixed in v5.3.1).

---

## How the harnesses stay honest

Each harness regex-extracts a marked block straight out of the HTML:

```js
/* ==== COMBAT CORE START ==== */
   ...
/* ==== COMBAT CORE END ==== */
```

It then evaluates that block in Node with no DOM. This means **the tests cannot
drift from the shipped code** — there is no copy to keep in sync. If you edit
the combat rules in the HTML, the combat harness is testing your edit.

The marked blocks are all pure: no DOM, no `localStorage`, no `Math.random()`.
Every random call takes an explicit seeded RNG. That's what makes 3,000
simulated fights run in under a second and give identical results every time.

---

## Where the blocks live in the file

Open the HTML in a text editor and search for these markers:

| Block | Contains |
| --- | --- |
| `MAP CORE` | Floor building, walls, visibility, validator |
| `PARTY CORE` | Stats, classes, XP, level-up, barks, export/import |
| `SAVE CORE` | Serialise/deserialise, migrations, base64 bitsets |
| `COMBAT CORE` | Monsters, spells, encounters, turn resolution |
| `STAGE CORE` | Turns a fight's log into the moves, effects and sounds the stage plays (with `motion.js` and `sound.js`) |
| `TOWN CORE` | Prices, temple and shop transactions |
| `INVENTORY CORE` | Using, giving, dropping, carrying capacity |
| `PACK CORE` | Pack loading and validation; the feature types, trap kinds, terrain kinds, habitats and monster traits; the solvability prover (keys, levers, plates, one-way doors, ice, falling bridges) |
| `EVENT CORE` | Events, doors, keys, levers, search, region text, clearing rubble and webs; traps found, sprung and disarmed; the neutral finds |
| `WORLD CORE` | Per-floor state, stair transitions, victory; which encounter wanders up where you stand |
| `RUN CORE` | v6.1: the run record, the unlock ladder, class variants, the zone pick, the run summary |
| `GEN CORE` | The endless-delve generator, with terrain and creatures by theme, and the dressing: traps, finds, ice, pillars |
| `MINI CORE` | The shared miniature library (`mitznsimz_minis.js`, embedded word for word) |
| `BUNDLED PACK` | The adventure data itself — content, not engine |

Everything outside those markers is presentation and wiring — safe to change
without breaking tests. Everything inside is covered.

---

## If you want to hand a slice to another session

The useful prompt shape is:

> Here is the current slice HTML and its harnesses. The `<X> CORE` block is pure
> and headless-tested. Add `<feature>` inside that block, keep every existing
> test passing, and add tests for the new behaviour.

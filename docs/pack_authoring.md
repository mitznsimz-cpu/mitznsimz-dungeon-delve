# Writing an adventure for Dungeon Delve

A pack is one JSON file. The engine ships with no content of its own — every
monster, item, spell, floor and line of text comes from a pack. Export the one
that ships (☰ → Adventure → Export), edit it, and load it back in.

Everything below is checked when a pack loads. A pack that names something the
engine does not implement is refused with the reason, not accepted quietly.

---

## The shape of a pack

```
packFormat  1
id          msdd.yourname.something
name        The Ruined Tower of Ashkeld
version     4.9.0 (Ashkeld; engine v4.9)
engineMin   1.6.0
rules       stats, partySize, xpTable, startingGold, threat, victory, light
classes     fighter / mage / priest / rogue, or your own
spells      keyed by id
skills      keyed by id, for classes with a skillList
items       weapons, armour, consumables, keys, quest items
monsters    keyed by id; each may name a `mini` figure and its `habitats`
minis       optional, your own sculpted figures (see Miniatures)
floors      the dungeon itself
events      the things that happen on a cell
town        the temple and the shop
testParties optional, so a pack can be played without rolling characters
```

## Spell and event effects (26)

`damage` `damageAll` `heal` `healAll`
`buff` `debuff` `gold` `threat`
`xp` `flag` `item` `lore`
`cure` `status` `teleport` `unlock`
`chain` `turn` `recall` `reveal`
`campsite` `random` `stat` `mp`
`fight` `ally`

Each takes its own fields — `damage` wants `dice` and optionally `perLevel`;
`chain` wants `jumps` and `falloff`; `turn` wants a `trait`; `campsite` wants
`fraction` and `threat`.

The five from v4.8 are what the neutral finds are made of, and any event may
use them:

| effect | fields | what it does |
|---|---|---|
| `random` | `table`: rows of `{ w, text, effects }` | rolls one row, by weight, and applies its effects (which may be another `random`) |
| `stat` | `stat`, `amount`, `who` (`best` or random) | a lasting change to one stat, never below 3 or above 20 |
| `mp` | `dice` | magic back to every living caster |
| `fight` | `ref`, optional `count` | the event closes and that monster attacks |
| `ally` | `name`, `dice`, `toHit`, optional `mini` | someone fights beside the party, one blow a round, until the next stairs |

The validator looks inside a `random` table, so a misspelt effect three rows
deep is still refused.

A spell (or a damage item's `use`) may name an `element`: `fire`, `cold`,
`lightning` or `holy`. Untagged spells are untouched by the ground; tagged
ones answer to it (see Terrain). In Ashkeld, Cinderburst and Wall of Fire are
fire, Frostbite is cold, the bolts and sparks are lightning, and Smite,
Radiance and Turn Undead are holy.

**Between fights.** `heal`, `cure`, `revive`, `light`, `threat`, `recall`,
`knock`, `levitate`, `waterwalk` and `detectTraps` spells can be cast from the
Packs screen while exploring. A spell with `"usableIn": ["dungeon"]` is cast
only there; one with `["combat"]` only in a fight.

**What a spell may do** (v4.9, now checked): `damage` `heal` `buff` `debuff`
`cure` `revive` `escape` `recall` `light` `threat` `chain` `turn`, and five new:

| kind | fields | what it does |
|---|---|---|
| `knock` | — | opens the locked door or the portcullis in front; not a `sealed` door; not spent on a blank wall |
| `levitate` | `turns` | the party floats: over chasms, plates, traps, pits and ice, and rotten planks do not fall. It will not let you down over a drop |
| `waterwalk` | `turns` | water underfoot is as good as stone: no noise, and the light stays dry |
| `detectTraps` | `radius` | every trap, trapped chest and mimic within that many squares shows itself |
| `silence` | `rounds` | in a fight: no `caster` foe can work its ranged spells, and nothing is raised |

In Ashkeld, Knock and Levitate are the wizard's; Detect Traps, Water Walk and
Silence the priest's. A spell whose kind the engine does not know is refused;
until v4.9 it loaded and did nothing when cast. Usable items are checked the
same way: `heal` `restoreMp` `cure` `damage` `light` `recall` `reveal` `caltrops`.

## Spell targets (10)

`self` `ally` `party` `enemy`
`enemyGroup` `allEnemies` `enemyRank` `enemyFront`
`enemyBack` `none`

`enemyRank` lets the player choose front or back — that is what makes a shield
line worth getting past. `enemyFront` and `enemyBack` fix it.

## Monster traits (25)

`ambush` `banish` `berserk` `boss`
`burrow` `caster` `charm` `construct`
`corrode` `drain` `engulf` `fireStops`
`flees` `gaze` `guard` `paralyse`
`poison` `radiantStops` `regenerate` `resistWeapon`
`spawner` `split` `stealer` `swarm`
`undead`

Some are behaviour (`guard`, `berserk`, `split`, `spawner`, `banish`); some are
description the engine reads (`undead` for turning, `boss` to prevent routing).
`swarm` and `construct` only describe. A trait the engine does not know is
refused, and so is a boss phase whose `addTrait` it does not know. Until v4.6 a
misspelt trait was accepted and did nothing.

**Signature moves** (v4.9; spelt as Hold the Line spells them, so a monster's
traits read the same in both games' packs):

| trait | what it does | in Ashkeld's bestiary |
|---|---|---|
| `engulf` | on a melee hit, about one time in three, the target is swallowed: out of the fight, unreachable, burning for 1d6 + the monster's level each round, until they tear free, it dies, or four rounds pass. One at a time | gelatinous cube |
| `gaze` | before its blows, about one turn in three, a gaze: unless the target looks away (Constitution helps) they turn to stone, out of the fight and out of reach, until it dies or four rounds pass | medusa |
| `charm` | before its blows, about one turn in four, a word: unless the target shrugs it off (Piety, a little Intelligence) they turn on the party for two turns, striking a friend at half force | vampire |
| `burrow` | comes up through the floor at the start of the fight, with a free round of blows among the back rank | ankheg |

`fireStops` and `radiantStops` go with `regenerate`: fire (or holy light) that
hurts the monster stops it mending for a turn. Ashkeld's troll has `fireStops`;
its vampire and the barrow lich have `radiantStops`. A regenerator without
either mends whatever hits it. No hold lasts past the fight.

`corrode` (v4.6): on a hit, about two times in five, a piece of the target's
gear (weapon, armour or shield) is damaged. Nothing is ever destroyed; Simz
mends it in town. The rust monster has it.

A `spawner` calls another of its own kind at half strength. Give it
`"spawns": "mn.skeleton"` and it raises that monster instead, whole, worth half
its xp and no gold: the necromancer does this. `spawns` without the `spawner`
trait is warned about, because it never happens.

An attack may carry an `element` (`fire`, `cold`, `lightning`, `holy`), and
then the ground it lands on works on it the way it works on spells: a fire
beetle's bite does half in standing water and half again on the coals. A
ranged fire attack flies as a fireball on the stage.

A monster makes one of its attacks each turn, picked at random. Give it
`"perTurn": 2` (up to 4) and it makes that many: each of its attacks in turn,
a claw and a bite, then random picks for any left over. Deep in the endless
delve, monsters past the bestiary's strongest gain attacks this way, up to
three a turn.

## Feature types (28)

`stairsDown` `stairsUp` `door` `secretDoor`
`chest` `lever` `monster` `trap`
`pit` `spinner` `textTrigger` `shrine`
`event` `npc` `barrier` `teleporter`
`staff` `exit` `plate` `portcullis`
`illusion` `fountain` `altar` `statue`
`remains` `campsite` `merchant` `prisoner`

One per cell, keyed `"x,y"`. Any feature marked `"quest": true` is a goal the
prover insists can be reached. Terrain is a separate layer under the features
(see Terrain). Since v4.8 the list is closed: a type the engine does not know
is refused, where it used to be ignored. The ten new ones are under Traps,
Finds and Mechanisms below.

## Skill effects (10)

`guard` `riposte` `cleave` `taunt`
`wall` `backstab` `hide` `dirt` `flurry` `assassinate`

Every skill needs a `cooldown` in rounds. A skill without one would replace
attacking entirely.

`backstab` (v4.9): from out of the press (the back rank, or behind the two in
a passage), while someone in front is fighting, a blade in one of the foes
they are fighting: `toHit` more to hit, and `sneak` dice (`[1, 6, 0]`) once for
every three levels on top of the weapon. Against something nobody has hurt
yet, it is always a critical. Not in a doorway. `hide` makes the user
unreachable for `duration` rounds, and their next blow `toHit` more likely.

`dirt`, `flurry` and `assassinate` (v4.9, the Rogue's later lessons):

- `dirt` throws grit across the foes' front rank from either rank. For
  `duration` rounds everything there is `amount` worse to hit with and `amount`
  easier to hit. A `construct` has no eyes to fill.
- `flurry` throws `knives` knives at anything in sight, from either rank, at
  `toHit` (`-2`) each for `damage` (`[1, 4, 0]`) plus the thrower's knack. A
  knife whose mark has dropped finds another.
- `assassinate` is a `backstab` with the `sneak` dice `sneakTimes` times over.
  Anything but a boss left at or below `finishBelow` of its BP (`0.34`) dies
  outright. From hiding (after a `hide`) it needs nobody in front, works even
  from the front rank, always lands as a critical, and the line is
  `finishBelowHidden` (`0.5`).

## Classes

A class says what it is called, its dice, its spell and skill lists, what it
may carry (`allowedTags`) and the least stats it needs (`minStats`). v4.9 adds:

- `traps: { spot, disarm, passive }` — `spot` (0 to 3) helps find traps,
  `disarm` (0 to 0.6) adds to the chance of disarming one, and `passive` means
  they notice a trap just ahead without searching.
- `locks` (0 to 0.6) — they can pick a locked door. A bad slip jams it.
- `finesse: true` — with a light or finesse weapon they strike with Dexterity
  rather than Strength.
- `kit: { weapon, armor, shield }` — what a new character of the class starts
  with.
- `minis: { male, female }` — the drawn figure for a class with no render.

Ashkeld's fourth class, the **Rogue**, has all of them: Dexterity 11, a d6 of
BP a level, light blades and bows (`weapon.light`, `weapon.finesse`), leather
and quilting (`armor.light`), a trap sense, and picks. It trains five
techniques, shaped like the Fighter's: Backstab (it starts with this) and Dirty
Trick at the first tier, Melt Away and Knife Flurry at the second, and
Assassinate at the third. Tags begin `weapon`, `armor`, `shield`,
`trinket`, `consumable`, `key`, `quest` or `tool`; anything else is refused.

---

## The rules a pack cannot break

**Progress must never require a secret.** The validator floods the floor with
every secret door treated as shut. If the stairs or the goal cannot be reached
that way, the pack is refused. Secrets are for reward, never for passage.

**A key must be reachable before its door.** The validator plays the dungeon
the way you would: reach what it can, pick up what it finds, try the locks
again, and repeat until nothing new opens. A key behind the door it opens is
caught, including the cascade where that lock blocks a later one.

**Every staircase pairs with one coming back.** Except in an endless delve,
where the deepest stair legitimately points at a floor not yet built.

**Nothing may strand the party** (v4.8). On a floor with ice, a rotten
bridge or a one-way door, every square the party can reach must still have a
way back to a stair, the way out, a teleporter or a pit that goes somewhere,
with every rotten bridge counted as already fallen. A door that lets you into
a dead end and never out again is refused, with the square it strands you on.

**A named texture, sprite or monster must exist.** Unknown ids fail; a missing
sprite warns and falls back to the vector miniature.

---

## Terrain

A floor may carry a second layer under its features:

```json
"terrain": { "4,9": "water", "1,6": "rubble", "8,7": "bridge", "7,7": "chasm" }
```

Twelve kinds. Each does the same thing in every pack:

| kind | underfoot | in a fight |
|---|---|---|
| `water` | +1 threat a step (splashing); a carried light loses 3 turns | melee −1 to hit, both sides; fire spells do half |
| `embers` | 1–2 damage to each member, never to below 1 BP | fire spells do half again; cold does half |
| `fog` | sight is one square, light or not; you see into a bank, not through it | ranged attacks −2, both sides |
| `antimagic` | no spells can be cast here | no spells; a foe `caster`'s ranged working fizzles |
| `holy` | resting here is half as risky | undead −2 to hit; Turn Undead counts as 2 levels stronger |
| `rubble` | blocks until cleared from the next cell (Use) | — |
| `web` | blocks until cleared; a light burns it out fast | — |
| `chasm` | blocks for good | — |
| `bridge` | walkable, over a chasm | narrow: two abreast |
| `ice` | you slide to the far end of it and cannot stop on it | melee −1 to hit, both sides |
| `rotten` | a bridge that takes you over once, then falls | narrow: two abreast |
| `pillars` | — | the back ranks have cover from shots (ranged −2 against them) |

**Clearing.** Facing rubble or webs, the Use button offers to clear them.
Rubble takes 3 turns and 8 threat, or 2 turns and 4 threat with a fighter
standing. Webs take 2 turns and 4 threat by hand, and about one time in three
whatever spun them comes out, if the floor's encounter table has a spider. With
a light burning, the webs go up in 1 turn for 1 threat and 4 turns of light,
and nothing is left to come out. Cleared cells are saved.

**Doorways.** A fight on a door, a secret door or a portcullis is one at a
time, on both sides: the first of your front rank against the first of theirs.

**Passages.** Any cell walled on two opposite sides is a passage, and a fight
in one is two abreast: only the first two of your front rank can swing, only
the first two of theirs can reach you, and you can only reach their first two.
Ranged attacks and spells are unaffected. Corridors are where a small party
holds off a big one.

**The rules.** Unknown kinds, terrain off the map or in rock are refused.
Rubble, webs and chasms need a cell of their own (never under a feature or on
the entry). The validator treats chasms as solid when it proves the floor, so a
chasm across the only way to the stairs is refused; rubble and webs count as
passable, because they can always be cleared. A bridge that crosses no chasm is
warned about; a `rotten` bridge must span one. A feature on ice is warned
about, because the party slides over it and never stands on it.

The endless delve places terrain by theme: water and fog in the vaults,
webs and rubble in the warrens, dead air and hallowed ground in the undercrofts,
embers in the kilns, rifts in the chalk halls. More of it, deeper down.

---

## Traps

```json
"3,5":  { "type": "trap", "kind": "darts", "dc": 2, "text": "A click, low in the wall." }
```

Six kinds. A trap with no `kind` is a blade trap, as every trap was before v4.8.

| kind | sprung |
|---|---|
| `snare` | a blade trap: a piece of someone's gear is damaged (Simz mends it) |
| `darts` | two hits of 1d6, plus one for each floor below the first |
| `gas` | poisons whoever fails to hold their breath (Constitution helps) |
| `fire` | 2d6 to everyone, plus one for each floor below the first; half in water, half again on embers |
| `net` | four turns lost cutting free, and 6 threat |
| `alarm` | a bell: whatever lives on this floor comes, now |

`dc` runs from 1 to 5; leave it out and it grows with depth. A trap is hidden
until someone finds it. **Search** looks at the square you stand on and the
four around it; the best searcher's Dexterity, half their Intelligence and
their class's trap sense set the chance, and a harder trap is harder to find.
A found trap shows on the map and in the view. Facing it, **Use** disarms it
(the best hands try; a near miss can be tried again, a bad one sets it off,
and success is worth 15 experience a point of difficulty). Or walk on: with
care, you may step round a trap you know is there.

**Classes and traps.** A class may say how good it is at all this:

```json
"traps": { "spot": 1, "disarm": 0.25, "passive": true }
```

`spot` adds to finding, `disarm` to the chance of disarming, and `passive`
means they notice a trap just ahead without searching. In Ashkeld only the
Rogue has one (see Classes).

## Chests that bite back

```json
"9,1":  { "type": "chest", "item": "it.shortbow", "trap": "darts", "dc": 1 },
"4,9":  { "type": "chest", "item": "it.charm.luck", "mimic": true }
```

A chest may carry a `trap` of any kind. Searching beside it can find it; then
opening it tries to disarm it first. An unfound one goes off as the lid comes
up. A `mimic` is a monster (`mn.mimic`, or name your own: `"mimic": "mn.x"`)
sitting on its own `gold` and `item`, which are yours when it is dead.
Searching can find that it is breathing, and then you strike first.

Chests now open on screen: the lid comes up, the coins come out.

## Finds

Seven things to come across that are neither fights nor treasure. Each is an
event the engine writes from the find itself, with the same window, choices,
requirements and effects as your own events; the same find always offers the
same things.

| type | what it offers |
|---|---|
| `fountain` | drink (a gamble: healing, magic back, a cure, a lasting gift, poison, or something else drinking), fill a flask |
| `altar` | pray, leave an offering (20 gold for each floor of depth) for blessings, or take the offerings and pay for it |
| `statue` | a riddle on the plinth: the right answer pays, a wrong one wakes the statue |
| `remains` | search the pack (and sometimes the bones get up), or say a word for them |
| `campsite` | make camp: half of everyone's BP and magic back, for only 5 threat |
| `merchant` | buy, at half as much again as the shop; each ware once |
| `prisoner` | break the chains (Strength 12) or pick the lock (Dexterity 13), and they fight beside you until the stairs |

Optional fields: `text` and `title` for your own words; `riddle`
(`{ "q", "answers": [...], "right": 0 }`) for a statue; `stock` (item ids)
for a merchant; `ally` (`{ "name", "dice": [1, 6, 1], "toHit" }`) for a
prisoner. Leave them out and the engine picks, from what lives at this depth.

## Mechanisms

```json
"1,7":  { "type": "plate", "id": "pl.dais" },
"2,5":  { "type": "portcullis", "needsLever": "pl.dais" },
"5,1":  { "type": "plate", "trap": "alarm" },
"8,9":  { "type": "illusion", "side": 2 },
"1,5":  { "type": "door", "oneWay": 2 }
```

A **pressure plate** with an `id` is a lever you work by standing on it; one
with a `trap` springs it, once. A **portcullis** is raised by a lever or plate
(`needsLever`), or, with `"liftable": true`, heaved up from the square before
it by whoever is strongest (fighters are better at it). An **illusory wall**
sits on one `side` of its cell (0 north, 1 east, 2 south, 3 west) where there is
a real wall in the map; it looks like stone and you walk through it. The prover
always treats it as a wall, so nothing may depend on it. A door or secret door
with `oneWay` (0 to 3) lets you through in that direction only. **Ice** and
**rotten** bridges are terrain (above). The validator checks that every plate
or lever a portcullis waits on exists, that an illusory wall is on a real wall
facing open ground, and that nothing strands the party.

**In Ashkeld.** The shortbow's chest on the tower top is trapped; a flagstone in
the gallery rings a bell; a delver lies by the well; the wall by the shrine is
painted on the dark. In the Warren the goblins keep a prisoner in the chief's
den and leave a tinker be in the far corner, and a door into the Lightless Run
does not open back. In the Laboratory a stone scholar asks Ashkeld's own riddle,
a plate raises a portcullis on a hidden chest, the bridge over the crack has
gone rotten, and the charm behind the vent is not a chest.

**In the endless delve**, every floor is dressed: traps in the passages, some
chests trapped, a mimic now and then from the third floor down, a find or two
in the rooms, a merchant every third floor, pillars in a hall, ice in the wet
places, a rotten bridge deeper down. Ice and rot that would strand anyone are
taken back out before the floor is handed over, and a delve begun before v4.8
rebuilds in the same shape.

## Locks, tools and rings

**Locks.** A locked door opens to its key, as ever, and nothing else is ever
needed: the prover still insists the key can be reached first. Since v4.9 it
can also be picked by a class with `locks`, forced with a crowbar (loud: 15
threat), or opened with Knock. `"lockDc"` (1 to 5) sets how hard it is to pick
or force; leave it out and it grows with depth. `"sealed": true` makes a door
answer only to its key: Ashkeld's warden door in the Laboratory is sealed.

**Tools** (tag `tool`, kept rather than used up): a **rope and grapnel** lets
the party cross a chasm one square wide (Use, facing it) and climb down a pit
instead of falling into it. A **crowbar** forces locks and helps under a
portcullis. A **flask of oil** is thrown fire (2d6), and burns webs away when
there is no light to do it. **Caltrops**, scattered in a fight, cost their melee
2 to hit for three rounds, and a flight while they lie is sure. All four are on
Simz's shelves.

**Rings nobody can name.** An item with `"unknown": "A dull bronze ring"` goes by
that name when found, until it is worn or Simz looks at it (25 gold). Simz will
pay only 10 gold for one he has not looked at. An item with `"cursed": true`
(only something you wear) will not come off once worn, until Mitz lifts the
curse at the temple (80 gold), and the ring is destroyed. `PRICES.identify` and
`PRICES.uncurse` set the fees. Ashkeld keeps a cursed one at the foot of the
Lightless Run and a good one behind the Laboratory's portcullis; the endless
delve leaves one in a plain chest now and then from the second floor down, a
good one twice as likely as any one curse.

---

## Habitats

Six places a creature can live: `warren` `crypt` `flooded` `ruin` `deep`
`forge`. A monster names one or two:

```json
"mn.giantCrab": { "...": "...", "habitats": ["flooded"] }
```

A floor names the place it is, and so can a region of one:

```json
"habitat": "warren",
"regions": { "cistern": { "name": "The Cistern", "look": "...", "habitat": "flooded" } }
```

Where the party stands decides what wanders up:

- In a region with its own `encounterTable`, that table, and nothing else.
- In a region with a `habitat`, only the floor's creatures that live there.
  If fewer than two of them do, the bestiary's own creatures of that place
  join them, from within a level of the floor's depth (two, if that is thin),
  and never a boss unless nothing else lives there. In Ashkeld the floor 2
  table has no water creatures, so the cistern draws frogs, crabs, eels,
  serpents, leeches and lizardfolk from the bestiary.
- Anywhere else, the floor's table, exactly as before.
- A floor with no table but a `habitat` draws from the bestiary by that place
  and its depth.

A monster with no `habitats` lives anywhere, so a pack that never mentions
habitats plays as it did. Placed monsters (a `monster` feature with a `ref` or
a `group`) are always what they say.

The endless delve gives each theme its places: vaults are flooded and crypts,
warrens are warrens and the deep, undercrofts crypts and ruins, kilns forges,
cloisters ruins and forges, chalk halls ruins and flooded. A floor's table is
its depth band kept to the creatures of its theme; if that leaves fewer than
two that are not bosses, the theme gives way to the plain depth band, so a
theme never makes a floor easier.

**The rules.** An unknown habitat is refused, on a monster, a floor or a
region, and so is an empty `habitats` list (leave it out to live anywhere). A
region's table must name real monsters. A floor or region whose habitat nothing
in the bestiary lives in near its depth is warned about, and so is a floor with
neither a table nor a habitat, because nothing will wander there.

---

## The shop

`shopStock` lists what Simz sells. An item may carry `"shopFrom": 2`: it stays
on the back shelf until the party has reached floor 2, and the shop says how
much more is waiting. Anything without it is on sale from the start. In Ashkeld,
the basics are there from the start, the middle shelf opens on floor 2 and the
rest on floor 3.

The one-tap **Rest and restock** in town needs nothing from a pack. It revives
and tends the party, then buys the cheapest item on the shelf of each kind it
tops up: a `heal` item for each member, a `restoreMp` item for each caster, and
`light` items until the party carries two.

## Barks

`barkTriggers` names the moments characters speak, and `barks` gives each
archetype its lines for each one. Exploring uses `chest`, `inscription`,
`stairs`, `monster`, `wounded` and `floor`. Fights use `kill` (the one who
struck the blow), `crit` (a clean strike) and `close` (someone just brought
below a quarter of their body points). There is at most one line a round, and
not every time. A trigger without lines for some archetype is warned about.

---

## Materials

A floor names a wall and a floor texture:

```json
"materials": { "wall": "stone.tower", "floor": "floor.flagstone" }
```

Available: `stone.tower` `stone.warren` `stone.lab` `stone.bright`
`stone.brick` `stone.terra` `floor` `floor.flagstone` `floor.terra`
`door.plain` `door.gate` `metal`

A pack may name a `sprite` on a monster or class. Without one, the engine draws
an unpainted miniature from its own library — so a pack needs no assets at all
to work. A render is only used for the sex it was made for; the other sex gets
the drawn figure rather than borrowing it.

Since v4.9 renders are off unless the game is opened with `?figures=renders`.
Ashkeld names none: the renders made from STL files are on the back burner until
their sculptors give permission, and every figure is drawn.

---

## Miniatures

Every monster and hero is drawn as an unpainted plastic miniature on a round
base (renders are off since v4.9; see Materials above): heroes on red with a gold rim, monsters on black,
bosses (`boss` trait) on black with a gold rim. The figures come from the Mitz
& Simz minis library (`mitznsimz_minis.js`, version 2.5.0), which Dungeon Delve and
Hold the Line share. A monster picks its figure by, in order:

1. its own `mini` — `"mini": "goblin.archer"`
2. its id, when that is a figure's name in either game — `mn.caveBat` is the bat
3. what its name suggests — "Frost Goblin" is a goblin, "Hill Giant" an ogre
4. its `art` family — `beast.quad` is a wolf, `undead` a skeleton, and so on

Heroes pick by class and sex: a class may say
`"minis": { "male": "…", "female": "…" }` or a single `"mini"`, and a
character may carry its own `mini`. A class that names no figure gets one by
its name: a woman paladin is `paladin.f`, a man `paladin.m`. Every hero has a
`.m` and an `.f` figure, and the plain id (`paladin`) means `.m`. Hold the Line's camelCase names
(`goblinArcher`, `barrowLich`) work anywhere an id does.

Monster and neutral figures (66):

`ankheg` `armour.animated` `ballista` `barricade` `bat` `bear` `beetle`
`bone.knight` `bone.titan` `brigand` `brigand.archer` `caltrops` `colossus`
`crab` `crypt.warden` `dragon.red` `drowned` `ember` `font.holy` `frog`
`gargoyle` `ghoul` `gloom` `goblin` `goblin.archer` `goblin.chief`
`goblin.shaman` `golem.clay` `grub` `hobgoblin` `horror` `hound` `imp`
`kobold` `leech` `lich` `lizardfolk` `mage.renegade` `medusa` `mimic` `mummy`
`necromancer` `ogre` `oil.flask` `ooze.cube` `orc` `orc.champion` `orc.raider`
`priest.fallen` `proxy` `rat` `rust.monster` `salamander` `sentinel` `serpent`
`shade` `skeleton` `skeleton.archer` `spider` `troll` `vampire` `wight` `wisp`
`wolf` `wolf.rider` `wraith`

Hero figures (28), each as `.m` and `.f`:

`barbarian` `bard` `cleric` `druid` `fighter` `monk` `paladin` `priest`
`ranger` `rogue` `sorcerer` `tinker` `warlock` `wizard`

### Sculpting your own

A pack can add figures under `minis`. A sculpt is plain data: drawing
operations in units where the base sits at 0,0, up is negative, and a man-sized
figure is about one unit tall.

```json
"minis": {
  "bog.blob": {
    "name": "Bog Blob", "faction": "monster", "size": "medium", "rx": 0.28,
    "ops": [
      ["S", ["ell", 0, -0.2, 0.2, 0.18]],
      ["D", 0.8, ["circ", -0.05, -0.24, 0.02], ["circ", 0.05, -0.24, 0.02]]
    ]
  }
}
```

| Field | Meaning |
| --- | --- |
| `faction` | `hero`, `monster` (default) or `neutral`: the base colours |
| `size` | the rules size: `tiny`, `small`, `medium`, `large` or `huge` |
| `rx` | base radius in units (default by size) |
| `scale` | draw it this much bigger, for a figure too small to read (default 1) |
| `top` | where the shading starts (default the top of the figure) |
| `face` | `right` (default: weapon toward +x) or `left`; the game turns it to face the fight |
| `material` | what it is made of: `metal`, `bone`, `stone`, `ooze`, `flesh` (default), `ember`, `spirit` or `wood`. It decides what flies off it when struck, the sound of the blow, and how it goes when it dies: spirits drift away, oozes melt, stone (and any `construct`) crumbles, the rest fall over |
| `poses` | other stances, `{ "strike": [ops], "cast": [ops] }`, worn mid-move in a fight; `strike`, `cast`, `hurt` and `guard` are used |

| Op | Meaning |
| --- | --- |
| `["S", shape…]` | solid plastic, outlined |
| `["D", alpha, shape…]` | a shade wash: a recess, a fold, an eye socket |
| `["L", alpha, shape…]` | a highlight |
| `["R", width, x,y, x,y…]` | a rod: limb, haft, staff, bone |
| `["C", width, path]` | a curved rod: bow, tail, tentacle |
| `["G", width, alpha, path, "r,g,b"?]` | a groove scored into the plastic, in its own colour if given |
| `["E", width, alpha, path, "r,g,b"?]` | a bright edge or a bowstring, likewise |
| `["T", x, y]` | a clear acrylic flight stand from the base up to x,y; put it first |

Shapes: `["poly", x,y, x,y…]` `["rr", x,y,w,h,r]` `["ell", x,y,rx,ry,rot]`
`["circ", x,y,r]` `["path", "M",x,y, "L",x,y, "Q",cx,cy,x,y, "C",…]`. In a path,
`"A",cx,cy,r,from,to,anticlockwise` is an arc and `"X",cx,cy,rx,ry,rot` a whole
ellipse; `["path", "O", …]` leaves the outline open.

The validator refuses an unknown op, shape, faction or size, a rod with fewer
than two points, a base radius over 0.8, and anything reaching outside the
sculpting box (±1 wide, 2 tall). A pack figure cannot replace a built-in of the
same name. A monster naming a figure that does not exist only warns, and is
drawn by its name or art family instead. A v4.1 pack that gave `size` as a
number still loads: it is read as `scale`.

**Poses** (2.4.0, 2.5.0): Hold the Line drew 133 of them for 91 of the built-in
figures, and the fight stage wears them mid-move: `strike` on a blow, `cast` on a spell,
`hurt` when knocked back, `guard` when dodging. Nearly every figure has `hurt`;
the heroes strike, guard or cast, and so do the bosses (the dragon breathes).
A pack's own figures can carry poses the same way. Sculpt a
pose with the enemy to the right (+x), whichever way the figure stands: the
stage mirrors it when the foe is on the other side.

The whole library, drawn live, is on the Mitz & Simz Minis page, where a Pose
filter shows every figure that has a pose, drawn in it.

---

## Cells and walls

`cells` is a flat array, `w × h`, one number per cell:

```
1  wall to the north      8  wall to the west
2  wall to the east      16  solid rock, not a cell at all
4  wall to the south
```

Walls must agree from both sides. The validator checks every pair.

---

## Testing a pack

`msdd_run_gate.sh` runs twenty-four harnesses headless under Node. The `pack` and
`solve` runners are the ones that check content rather than engine. A pack that
passes those is playable; whether it is *good* is your problem.

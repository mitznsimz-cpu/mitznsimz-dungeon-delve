# Mitz & Simz: Dungeon Delve

A first-person party dungeon crawler for the browser, in the spirit of the early-1990s classics. Lead four adventurers through the Ruined Tower of Ashkeld, or down an endless delve that builds itself as you go. Every hero and monster is drawn as an unpainted miniature on a round base.

**Play it:** https://mitznsimz-cpu.github.io/mitznsimz-dungeon-delve/

Or download the repo and double-click `index.html`. It plays offline once loaded, and on a phone or tablet you can add it to your home screen (Safari: Share → Add to Home Screen; Chrome: Install).

> **Work in progress.** This is v4.9. v5.0, with a balance pass and a phone app, comes next.

## What's in it

- **Four classes:** Fighter, Wizard, Priest and Rogue. Make your own party, or start with a ready-made one.
- **The Ruined Tower of Ashkeld:** a hand-made adventure over three floors.
- **Endless delves:** generated floors, each with its own theme and creatures.
- **62 monsters** that live where they belong: warrens, crypts, flooded halls, ruins, the deep and the forges. Some have signature moves. The gelatinous cube swallows a hero, the medusa turns one to stone, and fire stops a troll mending.
- **A dungeon that fights back:** hidden traps, chests that bite, fountains, altars, riddling statues, prisoners to free, pressure plates, portcullises, ice and one-way doors.
- **A town** where Mitz keeps the temple and Simz the shop.
- **Fights you can feel:** wind-ups, hit-stop, a tumbling d20, and sounds made in the browser, with no audio files.
- **Saves:** it autosaves as you go. You can export a whole game to a file and carry on on another device.

## Controls

| Key | What it does |
| --- | --- |
| Arrows or WASD | Move |
| Q / E | Turn |
| M | Sound on or off |
| ☰ (top right) | Saves, export and import, settings |
| Packs | The party's gear, and spells to cast between fights |
| Use, or Space | Open, take, read, talk, disarm, pick a lock |
| Search, or F | Look for secret doors and traps |

On a touch screen, use the on-screen pad to move and turn. It also has Use, Search and Rest. Tap the automap to enlarge it. Tap a fight while a turn plays out to skip to the end of it.

## The files

| File | What it is |
| --- | --- |
| `index.html` | **The game.** Everything it needs is inside, including the adventure and the miniatures |
| `msdd_assets.js` | Wall textures. Optional: without it the walls are drawn as masonry |
| `motion.js`, `sound.js` | The fight animation and sound modules, shared with Hold the Line, a sister Mitz & Simz game. Optional |
| `mitznsimz_minis.js` | The shared miniatures library. The game has a copy built in, and the tests check that the copy matches this file |
| `sw.js`, `msdd.webmanifest`, `icon.svg`, `icon-*.png` | Offline play, and installing it as an app with its own icon |
| `packs/` | The adventure as a standalone pack, for editing. `docs/pack_authoring.md` explains the format |
| `tests/` | 28 headless test runners, and `run_gate.sh`, which runs them all |
| `tools/party_balance.js` | The party balance test: plays the campaign and an 8-floor delve with 13 party mixes. `node tools/party_balance.js` |
| `docs/TESTING.md` | Running the game locally, the tests, and where everything lives in the code |

## Running the tests

You need [Node](https://nodejs.org). From the top folder:

```sh
sh tests/run_gate.sh
```

It runs 28 runners with 2,300 checks, and ends with `GATE PASSED`. Each runner lifts a marked block of code straight out of `index.html` and runs it in Node, so the tests can't drift from the game.

## Licence

The code is under the MIT licence (see `LICENSE`): use it, change it, share it. That doesn't cover the Mitz & Simz characters or their artwork: the miniatures drawn by `mitznsimz_minis.js` and the icon are © MitzNSimz. The wall textures are CC0, from [3dtextures.me](https://3dtextures.me).

## Credits

Made by Pete at [MitzNSimz](https://mitznsimz.co.uk), Folkestone.

☕ Enjoying it? [Buy Pete some dice, or Mitz & Simz some treats.](https://ko-fi.com/mitznsimz)

Also from Mitz & Simz: [Hold the Line](https://mitznsimz-cpu.github.io/mitznsimz-hold-the-line/), [Tarokk](https://mitznsimz-cpu.github.io/mitznsimz-tarokk/) and the [D&D Encounter Tracker](https://mitznsimz-cpu.github.io/DnD-Encounter-Tracker/).

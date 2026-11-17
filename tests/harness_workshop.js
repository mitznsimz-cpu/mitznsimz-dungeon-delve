// v7.0 The Workshop, stage E1: the editor's own edits (carve, fill, walls,
// terrain, things, the entry), undo and redo, the pack a draft makes, and the
// game's validator and solver run over it. Lifts the EDITOR CORE out of
// msdd_workshop.js and the cores it leans on out of index.html.
const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');
const wsrc = fs.readFileSync('./msdd_workshop.js', 'utf8');
function grab(s, tag) {
  const re = new RegExp('/\\* ==== ' + tag + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + tag + ' END ==== \\*/');
  const mm = s.match(re);
  if (!mm) { console.error('FAIL: ' + tag + ' markers missing'); process.exit(1); }
  return mm[1];
}
const BOOT = grab(src, 'BUNDLED PACK') + grab(src, 'PACK CORE') +
  '\nvar BUNDLED_BASE = JSON.parse(JSON.stringify(BUNDLED_PACK));\nvar __L = loadPack(BUNDLED_PACK);\n';
const names = ['edNewFloor', 'edCarve', 'edFill', 'edSetWall', 'edWall', 'edRock', 'edPaint', 'edPlace', 'edSetEntry',
  'edWallsInStep', 'edPackFrom', 'edProblems', 'edHistory', 'edRecord', 'edUndo', 'edRedo', 'edNewDraft', 'edThing',
  'ED_THINGS', 'ED_TERRAIN', 'ED_SIZES', 'validatePack', 'proveSolvable', 'loadPack', 'BUNDLED_BASE'];
const T = new Function(BOOT + grab(wsrc, 'EDITOR CORE') + '\nreturn {' + names.join(',') + '};')();

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')); } };
const draftWith = f => ({ name: 'Test', slug: 'test', floors: [f], rev: 1 });
const problems = f => T.edProblems(T.edPackFrom(draftWith(f), T.BUNDLED_BASE), T.validatePack, T.proveSolvable);
const errors = f => problems(f).filter(p => p.level === 'error');

console.log('\n[W1] new floors');
let f = T.edNewFloor(16, 16, 'rock');
ok('16 by 16', f.w === 16 && f.h === 16 && f.cells.length === 256);
ok('mostly rock, with a first room for the entry', f.cells.filter((c, i) => c & 16).length > 200 && !T.edRock(f, 1, 1));
ok('the entry is on open ground', !T.edRock(f, f.entry[0], f.entry[1]));
ok('walls in step', T.edWallsInStep(f));
const box = T.edNewFloor(12, 12, 'box');
ok('an empty box is open inside, walled round', !T.edRock(box, 5, 5) && T.edRock(box, 0, 0) && T.edWall(box, 1, 1, 0) && !T.edWall(box, 5, 5, 1));
ok('sizes are kept within reason', T.edNewFloor(2, 99).w === 6 && T.edNewFloor(2, 99).h === 40);
ok('every offered size makes a floor that is in step', T.ED_SIZES.every(n => T.edWallsInStep(T.edNewFloor(n, n, 'rock'))));

console.log('\n[W2] carving, filling and walls stay in step');
f = T.edNewFloor(16, 16, 'rock');
T.edCarve(f, 4, 2, 10, 2);                       // a corridor from the first room
ok('a carved corridor joins the room it was dragged out of', !T.edWall(f, 4, 2, 3) && !T.edWall(f, 3, 2, 1));
ok('and is walled along its sides', T.edWall(f, 6, 2, 0) && T.edWall(f, 6, 2, 2));
T.edCarve(f, 9, 3, 13, 8);
ok('a room carved against it opens onto it', !T.edWall(f, 9, 2, 2) && !T.edWall(f, 10, 2, 2));
ok('walls in step after carving', T.edWallsInStep(f));
T.edSetWall(f, 9, 3, 0, true);
ok('a wall set on one side is set on the other', T.edWall(f, 9, 3, 0) && T.edWall(f, 9, 2, 2) && T.edWallsInStep(f));
T.edSetWall(f, 9, 3, 0, false);
ok('and taken away from both', !T.edWall(f, 9, 3, 0) && !T.edWall(f, 9, 2, 2));
ok('no opening onto rock', !T.edSetWall(f, 13, 8, 1, false) && T.edWall(f, 13, 8, 1));
ok('no opening off the edge of the map', !T.edSetWall(f, 0, 0, 0, false));
T.edPlace(f, 11, 5, { type: 'monster', ref: 'mn.goblin' }); T.edPaint(f, 11, 5, 'water');
T.edFill(f, 11, 5, 11, 5);
ok('filling a square makes it rock, and clears what was on it', T.edRock(f, 11, 5) && !f.features['11,5'] && !f.terrain['11,5']);
ok('and walls it off from its neighbours', T.edWall(f, 10, 5, 1) && T.edWall(f, 11, 4, 2) && T.edWallsInStep(f));
// a fuzz of random edits never breaks the walls
let rngs = 7, rnd = () => (rngs = (rngs * 1103515245 + 12345) >>> 0) / 4294967296;
let g = T.edNewFloor(20, 20, 'rock');
for (let k = 0; k < 400; k++) {
  const x = Math.floor(rnd() * 20), y = Math.floor(rnd() * 20), x2 = Math.floor(rnd() * 20), y2 = Math.floor(rnd() * 20), r = rnd();
  if (r < 0.4) T.edCarve(g, x, y, Math.min(19, x + Math.floor(rnd() * 5)), Math.min(19, y + Math.floor(rnd() * 5)));
  else if (r < 0.55) T.edFill(g, x, y, x, y);
  else T.edSetWall(g, x, y, Math.floor(rnd() * 4), rnd() < 0.5);
}
ok('400 random edits leave every wall in step', T.edWallsInStep(g));

console.log('\n[W3] terrain, things and the entry');
f = T.edNewFloor(12, 12, 'box');
ok('terrain paints on open ground', T.edPaint(f, 3, 3, 'water') && f.terrain['3,3'] === 'water');
ok('not on rock', !T.edPaint(f, 0, 0, 'water'));
ok('only the terrain the game knows', !T.edPaint(f, 4, 4, 'lava'));
ok('and clears', T.edPaint(f, 3, 3, null) && !f.terrain['3,3']);
ok('a thing is placed as its own copy', (() => { const m = { type: 'monster', ref: 'mn.goblin' }; T.edPlace(f, 5, 5, m); m.ref = 'x'; return f.features['5,5'].ref === 'mn.goblin'; })());
ok('things are not placed in rock', !T.edPlace(f, 0, 3, { type: 'chest' }));
ok('the entry moves, and turns', T.edSetEntry(f, 6, 6, 5) && f.entry.join() === '6,6' && f.entryFacing === 1);
ok('every thing on offer has a maker that names a real type', T.ED_THINGS.every(t => typeof t.make().type === 'string'));

console.log('\n[W4] the game\'s own checks');
f = T.edNewFloor(16, 16, 'rock');
T.edCarve(f, 4, 2, 10, 2); T.edCarve(f, 9, 3, 13, 8);
let pr = problems(f);
ok('no goal: warned', pr.some(p => /No goal/.test(p.text)) && !errors(f).length);
T.edPlace(f, 12, 7, T.edThing('staff').make());
ok('with the staff placed it is all clear', problems(f).length === 0, JSON.stringify(problems(f)));
T.edPlace(f, 9, 2, T.edThing('lockedDoor').make());
let er = errors(f);
ok('a locked door with no key anywhere is an error', er.some(p => /nowhere to be found/.test(p.text)));
ok('and the problem names its square', er.some(p => p.at && p.at.join() === '9,2'));
T.edPlace(f, 2, 2, { type: 'chest', item: 'it.key.rust', gold: [1, 4, 0] });
ok('a chest with the key before the door clears it', errors(f).length === 0, JSON.stringify(errors(f)));
T.edPlace(f, 2, 2, null); T.edPlace(f, 12, 4, { type: 'chest', item: 'it.key.rust', gold: [1, 4, 0] });
ok('the key behind its own door is an error', errors(f).some(p => /cannot be picked up before/.test(p.text)));
T.edPlace(f, 12, 4, null); T.edPlace(f, 9, 2, null);
T.edSetWall(f, 9, 2, 2, true); T.edSetWall(f, 10, 2, 2, true);
ok('a goal walled off is an error', errors(f).some(p => /cannot be reached/.test(p.text)));
T.edSetWall(f, 10, 2, 2, false);
ok('opened again, all clear', errors(f).length === 0);
let ex = T.edNewFloor(12, 12, 'box'); T.edPlace(ex, 8, 8, T.edThing('exit').make());
ok('a way out is a goal too', problems(ex).length === 0, JSON.stringify(problems(ex)));
const every = T.edNewFloor(20, 20, 'box');
T.ED_THINGS.forEach((t, i) => { if (t.id !== 'lockedDoor' && t.id !== 'secretDoor') T.edPlace(every, 2 + (i % 8) * 2, 3 + Math.floor(i / 8) * 4, t.make()); });
ok('every kind of thing on offer passes the game\'s validator', errors(every).length === 0, JSON.stringify(errors(every)));

console.log('\n[W5] the pack it makes');
f = T.edNewFloor(12, 12, 'box'); T.edPlace(f, 8, 8, T.edThing('staff').make());
let pk = T.edPackFrom({ name: 'The Cellar', slug: 'the-cellar!', author: 'Pete', floors: [f], rev: 3, zone: 'crypt' }, T.BUNDLED_BASE);
ok('named and id\'d from the draft', pk.name === 'The Cellar' && pk.id === 'ws.the-cellar' && pk.author === 'Pete' && pk.version === '1.0.3');
ok('with the base\'s monsters, items and town', Object.keys(pk.monsters).length > 20 && pk.town && pk.items['it.potion']);
ok('the draft\'s floor, numbered, with its zone', pk.floors.length === 1 && pk.floors[0].depth === 1 && pk.floors[0].zone === 'crypt');
ok('it loads into the game', T.loadPack(JSON.parse(JSON.stringify(pk))).ok);
ok('it does not change the draft', f.depth === 1 && !f.zone);
let pk2 = T.edPackFrom({ name: 'Out', floors: [ex], rev: 1 }, T.BUNDLED_BASE);
ok('with a way out and no staff, no staff victory is asked for', !pk2.rules.victory);
ok('a round trip through JSON keeps the floor the same', JSON.stringify(JSON.parse(JSON.stringify(pk)).floors[0].cells) === JSON.stringify(f.cells));
ok('the base is left alone', T.BUNDLED_BASE.id === 'msdd.core.tapro' && T.BUNDLED_BASE.floors.length === 3);

console.log('\n[W6] undo and redo');
const h = T.edHistory(5);
let d = T.edNewDraft(12, 'box');
T.edRecord(h, d); T.edPaint(d.floors[0], 3, 3, 'web');
T.edRecord(h, d); T.edPaint(d.floors[0], 4, 4, 'ice');
d = T.edUndo(h, d);
ok('undo takes back the last edit', !d.floors[0].terrain['4,4'] && d.floors[0].terrain['3,3'] === 'web');
d = T.edRedo(h, d);
ok('redo puts it back', d.floors[0].terrain['4,4'] === 'ice');
d = T.edUndo(h, d); d = T.edUndo(h, d);
ok('undo again, back to the start', !d.floors[0].terrain['3,3']);
ok('nothing more to undo', T.edUndo(h, d) === null);
for (let k = 0; k < 9; k++) T.edRecord(h, d);
ok('history keeps its limit', h.past.length === 5);

console.log('\n[W7] the page');
ok('the game loads the Workshop', /<script src="msdd_workshop\.js"><\/script>/.test(src));
ok('it is offered on the chooser and in the menu', /opt\('The Workshop'/.test(src) && /id="openWorkshop"/.test(src));
ok('a play-test saves nothing', /window\.WS_TESTING\) return \{ ok: true/.test(src) && /window\.WS_TESTING = true/.test(wsrc));
ok('leaving a play-test brings the real game back from its autosave', /loadFrom\('auto'\)/.test(wsrc));
ok('the draft is kept on the device', /msdd_workshop/.test(wsrc) && /localStorage\.setItem\(DRAFT_KEY\(\)/.test(wsrc));
ok('it works offline', /'\.\/msdd_workshop\.js'/.test(fs.readFileSync('./sw.js', 'utf8')));

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' \u2014 ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

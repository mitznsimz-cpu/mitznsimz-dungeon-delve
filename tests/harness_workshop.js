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
  'ED_THINGS', 'ED_TERRAIN', 'ED_SIZES', 'edAddFloor', 'edRemoveFloor', 'edMoveFloor', 'edLinkStairs', 'edPairStairs',
  'edCover', 'edDraftProblems', 'edCatchStairs', 'ED_WINS', 'validatePack', 'proveSolvable', 'loadPack', 'BUNDLED_BASE'];
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
let pk2 = T.edPackFrom({ name: 'Out', floors: [ex], rev: 1, cover: { win: 'exit' } }, T.BUNDLED_BASE);
ok('won by the way out, the pack asks for that', pk2.rules.victory.flag === 'reachedExit');
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

console.log('\n[W8] several floors, and stairs that find each other (v7.1)');
{
  const d = T.edNewDraft(12, 'box');
  const i = T.edAddFloor(d, 12, 12, 'box');
  ok('a floor added below', i === 1 && d.floors.length === 2 && d.floors[1].id === 'w2' && d.floors[1].name === 'Level 2');
  T.edPlace(d.floors[0], 6, 6, { type: 'stairsDown' });
  ok('stairs down put stairs up on the same square of the floor below', T.edPairStairs(d, 0, 6, 6, 'stairsDown') && d.floors[1].features['6,6'].type === 'stairsUp');
  ok('not over something already there', (() => { T.edPlace(d.floors[1], 3, 3, { type: 'chest' }); T.edPlace(d.floors[0], 3, 3, { type: 'stairsDown' }); return !T.edPairStairs(d, 0, 3, 3, 'stairsDown'); })());
  T.edPlace(d.floors[0], 3, 3, null);
  const copy = JSON.parse(JSON.stringify(d.floors)), lonely = T.edLinkStairs(copy);
  ok('linked both ways', copy[0].features['6,6'].to === 'w2' && copy[0].features['6,6'].at.join() === '6,6' &&
     copy[1].features['6,6'].to === 'w1' && copy[1].features['6,6'].at.join() === '6,6' && !lonely.length, JSON.stringify(lonely));
  ok('the draft itself is not written to', !d.floors[0].features['6,6'].to);
  T.edPlace(d.floors[1], 9, 9, { type: 'stairsDown' });
  let probs = T.edDraftProblems(d);
  ok('stairs down from the last floor lead nowhere: an error on its square', probs.some(p => p.floor === 'w2' && p.at.join() === '9,9' && /no stairs up on floor 3/.test(p.text)));
  T.edAddFloor(d, 12, 12, 'box'); T.edPairStairs(d, 1, 9, 9, 'stairsDown');
  T.edPlace(d.floors[1], 2, 2, T.edThing('staff').make());
  probs = T.edDraftProblems(d);
  ok('a third floor below clears it', !probs.length, JSON.stringify(probs));
  const pk = T.edPackFrom(d, T.BUNDLED_BASE);
  const pr = T.edProblems(pk, T.validatePack, T.proveSolvable, d);
  ok('three floors joined by stairs pass the game\'s own checks', !pr.filter(p => p.level === 'error').length, JSON.stringify(pr));
  ok('numbered by depth', pk.floors.map(f => f.depth).join() === '1,2,3');
  ok('a deeper floor begins at its stairs up', pk.floors[1].entry.join() === '6,6' && pk.floors[2].entry.join() === '9,9');
  T.edPlace(d.floors[0], 1, 1, { type: 'stairsUp' });
  ok('stairs up on the first floor are a problem', T.edDraftProblems(d).some(p => /first floor lead nowhere/.test(p.text)));
  T.edPlace(d.floors[0], 1, 1, null);
  ok('floors move', T.edMoveFloor(d, 2, -1) && d.floors[1].id === 'w3' && !T.edMoveFloor(d, 0, -1));
  ok('and stairs pair up in their new order: now a problem', T.edDraftProblems(d).length > 0);
  T.edMoveFloor(d, 1, 1);
  ok('the last floor cannot be removed', T.edRemoveFloor(d, 2) && T.edRemoveFloor(d, 1) && !T.edRemoveFloor(d, 0) && d.floors.length === 1);
  {
    const e = T.edNewDraft(12, 'box');
    T.edPlace(e.floors[0], 7, 7, { type: 'stairsDown' });
    T.edAddFloor(e, 12, 12, 'rock');
    ok('a new floor of rock catches nothing yet', T.edCatchStairs(e, 1) === 0);
    T.edCarve(e.floors[1], 5, 5, 9, 9);
    ok('carving a room under the stairs catches them: stairs up below', T.edCatchStairs(e, 1) === 1 && e.floors[1].features['7,7'].type === 'stairsUp');
    ok('and only once', T.edCatchStairs(e, 1) === 0 && !T.edDraftProblems(e).some(p => /stairs/.test(p.text)));
  }
  ok('a new floor takes the first free id', T.edAddFloor(d, 12, 12, 'rock') === 1 && d.floors[1].id === 'w2');
  ok('and is solid rock: no start room of its own', d.floors[1].cells.every(c => c & 16));
}

console.log('\n[W9] the cover, and how it is won (v7.1)');
{
  const d = T.edNewDraft(12, 'box');
  T.edPlace(d.floors[0], 8, 8, { type: 'monster', ref: 'mn.goblinChief', boss: true });
  ok('by default, won by the staff: with none placed, that is an error', T.edDraftProblems(d).some(p => /no staff placed/.test(p.text)));
  d.cover = { win: 'boss', gold: 300, blurb: 'Goblins in the cellar.', winText: 'The chief is down.', shop: ['it.potion', 'it.torch', 'it.nothing'] };
  ok('won by the boss, with one marked, it is clear', !T.edDraftProblems(d).length);
  const pk = T.edPackFrom(d, T.BUNDLED_BASE);
  ok('the pack is won by beating the boss, with its words', pk.rules.victory.flag === 'beatBoss' && pk.rules.victory.text === 'The chief is down.');
  ok('the boss must be reachable', pk.floors[0].features['8,8'].quest === true);
  ok('starting gold and the blurb carry over', pk.rules.startingGold === 300 && pk.blurb === 'Goblins in the cellar.');
  ok('the shop sells what was ticked, and nothing that does not exist', pk.shopStock.join() === 'it.potion,it.torch');
  ok('the whole thing passes the game\'s checks', !T.edProblems(pk, T.validatePack, T.proveSolvable, d).filter(p => p.level === 'error').length);
  T.edSetWall(d.floors[0], 8, 8, 0, true); T.edSetWall(d.floors[0], 8, 8, 1, true); T.edSetWall(d.floors[0], 8, 8, 2, true); T.edSetWall(d.floors[0], 8, 8, 3, true);
  ok('a boss walled in where nobody can reach it is an error', T.edProblems(T.edPackFrom(d, T.BUNDLED_BASE), T.validatePack, T.proveSolvable, d).some(p => p.level === 'error'));
  ok('gold is kept within reason', T.edCover({ cover: { gold: 99999 } }).gold === 5000 && T.edCover({ cover: { gold: -5 } }).gold === 0);
  ok('an unknown way to win falls back to the staff', T.edCover({ cover: { win: 'dance' } }).win === 'staff');
  ok('every way to win has a flag the game checks', Object.keys(T.ED_WINS).every(k => /^(gotStaff|beatBoss|reachedExit)$/.test(T.ED_WINS[k].flag)));
}

console.log('\n[W7] the page');
ok('the game loads the Workshop', /<script src="msdd_workshop\.js"><\/script>/.test(src));
ok('it is offered on the chooser and in the menu', /opt\('The Workshop'/.test(src) && /id="openWorkshop"/.test(src));
ok('a play-test saves nothing', /window\.WS_TESTING\) return \{ ok: true/.test(src) && /window\.WS_TESTING = true/.test(wsrc));
ok('leaving a play-test brings the real game back from its autosave', /loadFrom\('auto'\)/.test(wsrc));
ok('the draft is kept on the device', /msdd_workshop/.test(wsrc) && /localStorage\.setItem\(DRAFT_KEY\(\)/.test(wsrc));
ok('it works offline', /'\.\/msdd_workshop\.js'/.test(fs.readFileSync('./sw.js', 'utf8')));
ok('the game wins by the way out', /questFlags\.reachedExit = true/.test(src));
ok('and by beating a boss placed on the map', /questFlags\.beatBoss = true/.test(src) && /\{ boss: !!\(feat && feat\.boss\) \}/.test(src));
ok('kept adventures are listed on the chooser', /var mine = mineAll\(\)/.test(src));
ok('and a save in one reloads after a refresh', /var mine = typeof mineGet === 'function' \? mineGet\(raw\.packId\)/.test(src));

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' \u2014 ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

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
  'edLink', 'edUnlink', 'edLinks', 'edAim', 'edLeverId', 'edAddRegion', 'edPaintRegion', 'edFloodRegion', 'edRemoveRegion',
  'edCopy', 'edBlockRotate', 'edBlockMirror', 'edPaste', 'edTransformFloor', 'ED_STAMPS',
  'edMakeItem', 'edMakeMonster', 'edCover', 'edDraftProblems', 'edCatchStairs', 'ED_WINS', 'validatePack', 'proveSolvable', 'loadPack', 'BUNDLED_BASE'];
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
const NEEDS_LINK = ['plate', 'portcullis'];
T.ED_THINGS.forEach((t, i) => { if (t.id !== 'lockedDoor' && t.id !== 'secretDoor' && NEEDS_LINK.indexOf(t.id) < 0) T.edPlace(every, 2 + (i % 8) * 2, 3 + Math.floor(i / 8) * 4, t.make()); });
ok('every kind of thing on offer passes the game\'s validator', errors(every).length === 0, JSON.stringify(errors(every)));
const lone = T.edNewFloor(12, 12, 'box'); T.edPlace(lone, 4, 4, T.edThing('plate').make()); T.edPlace(lone, 6, 6, T.edThing('portcullis').make());
ok('a plate or portcullis on its own asks to be linked', errors(lone).filter(p => /pressure plate with neither|no lever or plate to raise it/.test(p.text)).length === 2);

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

console.log('\n[W10] your own items and monsters (v7.1)');
{
  const B = T.BUNDLED_BASE;
  const sw = T.edMakeItem(B.items['it.longsword'], { name: 'Mill-Wheel Blade', desc: 'Notched like a cog.', value: 400, damage: [2, 8, 1] });
  ok('an item takes its name, words and numbers', sw.id === 'it.ws.mill-wheel-blade' && sw.name === 'Mill-Wheel Blade' && sw.value === 400 && sw.damage.join() === '2,8,1');
  ok('and keeps its kind and who may use it', sw.slot === 'weapon' && sw.tags.join() === B.items['it.longsword'].tags.join() && sw.reach === 'melee');
  ok('the base is left alone', B.items['it.longsword'].name === 'Long Sword');
  const wild = T.edMakeItem(B.items['it.longsword'], { name: 'x'.repeat(80), value: 99999, damage: [40, 7, 99] });
  ok('numbers are kept within limits', wild.name.length === 32 && wild.value === 3000 && wild.damage.join() === '6,8,12', wild.damage.join());
  const ring = T.edMakeItem(B.items['it.ring.ward'], { name: 'Miller\'s Ring', defenseBonus: 9, hitBonus: 2 });
  ok('a trinket: defence and to-hit, within limits', ring.defenseBonus === 3 && ring.hitBonus === 2);
  const draught = T.edMakeItem(B.items['it.potion'], { name: 'Flour Tonic', useDice: [3, 6, 2] });
  ok('a draught keeps what it does, with its own strength', draught.use.kind === 'heal' && draught.use.dice.join() === '3,6,2');
  const key = T.edMakeItem(B.items['it.key.rust'], { name: 'Sluice Key', value: 50 });
  ok('a key opens doors that name it, and cannot be sold', key.keyId === key.id && key.flags.indexOf('quest') >= 0 && key.value === 0);
  ok('a second of the same name gets its own id', T.edMakeItem(B.items['it.dagger'], { name: 'Mill-Wheel Blade' }, { 'it.ws.mill-wheel-blade': 1 }).id === 'it.ws.mill-wheel-blade-2');
  const boss = T.edMakeMonster(B.monsters['mn.goblinChief'], { name: 'The Miller', level: 6, bp: [6, 10, 8], defense: 30, boss: true,
    attacks: [{ name: 'millstone', toHit: 7, damage: [2, 10, 2] }] });
  ok('a monster takes its name and numbers', boss.id === 'mn.ws.the-miller' && boss.level === 6 && boss.bp.join() === '6,10,8' && boss.attacks[0].name === 'millstone');
  ok('within limits', boss.defense === 24);
  ok('keeps its look and gifts', boss.mini === B.monsters['mn.goblinChief'].mini && boss.traits.indexOf('berserk') >= 0);
  ok('a boss fights alone, and is worth more', boss.traits.indexOf('boss') >= 0 && boss.groupSize.join() === '1,1,0' && boss.xp > B.monsters['mn.goblinChief'].xp);
  ok('its base\'s phases are not carried over', !boss.phases);
  ok('an attack it does not change stays as it was', boss.attacks[1].name === 'shield bash');
  const meek = T.edMakeMonster(B.monsters['mn.goblinChief'], { boss: false });
  ok('a boss can be made a plain monster', meek.traits.indexOf('boss') < 0);
  // into an adventure: a boss of your own, a chest with your blade, a door with your key
  const d = T.edNewDraft(16, 'box');
  d.items = { [sw.id]: sw, [key.id]: key }; d.monsters = { [boss.id]: boss };
  T.edPlace(d.floors[0], 3, 3, { type: 'chest', item: key.id, gold: [1, 4, 0] });
  T.edPlace(d.floors[0], 5, 5, { type: 'chest', item: sw.id, gold: [1, 4, 0] });
  T.edSetWall(d.floors[0], 8, 1, 1, true); for (let y = 2; y <= 14; y++) T.edSetWall(d.floors[0], 8, y, 1, true);
  T.edPlace(d.floors[0], 8, 8, { type: 'door', locked: true, keyId: key.id });
  T.edSetWall(d.floors[0], 8, 8, 1, false);
  T.edPlace(d.floors[0], 12, 8, { type: 'monster', ref: boss.id, boss: true });
  d.cover = { win: 'boss', shop: ['it.potion', sw.id] };
  const pk = T.edPackFrom(d, T.BUNDLED_BASE);
  ok('the pack has them', pk.items[sw.id] && pk.items[key.id] && pk.monsters[boss.id]);
  ok('and Simz sells your blade', pk.shopStock.indexOf(sw.id) >= 0);
  const pr = T.edProblems(pk, T.validatePack, T.proveSolvable, d).filter(p => p.level === 'error');
  ok('your key opens your door, your boss wins it: all clear', !pr.length, JSON.stringify(pr));
  ok('it loads into the game', T.loadPack(JSON.parse(JSON.stringify(pk))).ok);
}

console.log('\n[W11] mechanisms: levers, plates, gates, teleporters (v7.3)');
{
  const d = T.edNewDraft(14, 'box'), f = d.floors[0];
  for (let y = 1; y <= 12; y++) T.edSetWall(f, 7, y, 1, true);          // a wall down the middle
  T.edSetWall(f, 7, 6, 1, false);                                       // with one gap
  T.edPlace(f, 8, 6, T.edThing('portcullis').make());                    // and a portcullis in it
  T.edPlace(f, 10, 10, T.edThing('staff').make());
  T.edPlace(f, 3, 3, T.edThing('lever').make());
  let pr = T.edProblems(T.edPackFrom(d, T.BUNDLED_BASE), T.validatePack, T.proveSolvable, d).filter(p => p.level === 'error');
  ok('a portcullis with nothing to raise it is an error', pr.length > 0);
  ok('a lever links to it', T.edLink(d, f, '3,3', '8,6') && f.features['3,3'].id === 'lv.1' && f.features['8,6'].needsLever === 'lv.1' && f.features['3,3'].opens === '8,6');
  pr = T.edProblems(T.edPackFrom(d, T.BUNDLED_BASE), T.validatePack, T.proveSolvable, d).filter(p => p.level === 'error');
  ok('and then it can be played through', !pr.length, JSON.stringify(pr));
  ok('the link is drawn', T.edLinks(f).some(l => l.from === '3,3' && l.to === '8,6'));
  ok('a lever cannot open a chest', (() => { T.edPlace(f, 2, 2, { type: 'chest', gold: [1, 4, 0] }); return !T.edLink(d, f, '3,3', '2,2'); })());
  ok('a door cannot pull a lever', !T.edLink(d, f, '8,6', '3,3'));
  T.edPlace(f, 4, 4, T.edThing('plate').make());
  T.edPlace(f, 8, 2, { type: 'door' }); T.edSetWall(f, 7, 2, 1, false);
  ok('a plate opens a door, with its own id', T.edLink(d, f, '4,4', '8,2') && f.features['4,4'].id === 'pl.1' && f.features['8,2'].needsLever === 'pl.1');
  ok('ids are unique across the adventure', (() => { const g = T.edAddFloor(d, 10, 10, 'box'); T.edPlace(d.floors[g], 2, 2, T.edThing('lever').make()); T.edPlace(d.floors[g], 4, 4, { type: 'portcullis' }); T.edLink(d, d.floors[g], '2,2', '4,4'); return d.floors[g].features['2,2'].id === 'lv.2'; })());
  ok('unlinking from the gate', T.edUnlink(f, '8,2') && !f.features['8,2'].needsLever);
  ok('unlinking from the lever frees everything it opened', T.edUnlink(f, '3,3') && !f.features['8,6'].needsLever && !f.features['3,3'].opens);
  T.edPlace(f, 2, 10, T.edThing('teleporter').make());
  ok('a teleporter is aimed at a square', T.edAim(f, '2,10', 12, 3) && f.features['2,10'].at.join() === '12,3' && f.features['2,10'].to === f.id);
  ok('not into rock, nor onto itself', !T.edAim(f, '2,10', 0, 0) && !T.edAim(f, '2,10', 2, 10));
  ok('and its line is drawn', T.edLinks(f).some(l => l.kind === 'tele' && l.to === '12,3'));
}

console.log('\n[W12] regions (v7.3)');
{
  const f = T.edNewFloor(12, 12, 'box');
  const a = T.edAddRegion(f, 'The Mill Pond'), b = T.edAddRegion(f, 'The Mill Pond');
  ok('a region gets an id from its name, unique', a === 'the-mill-pond' && b === 'the-mill-pond-2');
  ok('squares are painted into it', T.edPaintRegion(f, 3, 3, a) && f.regionMap['3,3'] === a);
  ok('not rock, not an unknown region', !T.edPaintRegion(f, 0, 0, a) && !T.edPaintRegion(f, 4, 4, 'nope'));
  ok('and painted out', T.edPaintRegion(f, 3, 3, null) && !f.regionMap['3,3']);
  const g = T.edNewFloor(14, 14, 'rock'); T.edCarve(g, 1, 1, 5, 5); T.edCarve(g, 6, 3, 8, 3); T.edCarve(g, 9, 1, 12, 6);
  T.edPlace(g, 7, 3, { type: 'door' }); const ra = T.edAddRegion(g, 'West');
  ok('a tap fills the whole room, up to the door', T.edFloodRegion(g, 2, 2, ra) === 26 && g.regionMap['6,3'] === ra && !g.regionMap['7,3'] && !g.regionMap['10,2'], Object.keys(g.regionMap).length);
  ok('painting out fills the same way', T.edFloodRegion(g, 2, 2, null) === 26 && !Object.keys(g.regionMap).length);
  T.edPaintRegion(f, 5, 5, b); f.regions[b].look = 'Still water.'; f.regions[b].habitat = 'flooded';
  ok('removing a region clears its squares', T.edRemoveRegion(f, b) && !f.regionMap['5,5'] && !f.regions[b]);
  T.edPaintRegion(f, 6, 6, a); f.regions[a].look = 'Reeds and black water.';
  const d = { name: 'R', floors: [f], cover: { win: 'exit' } }; T.edPlace(f, 9, 9, T.edThing('exit').make());
  ok('regions pass the game\'s checks', !T.edProblems(T.edPackFrom(d, T.BUNDLED_BASE), T.validatePack, T.proveSolvable, d).filter(p => p.level === 'error').length);
}

console.log('\n[W13] blocks: copy, paste, rotate, mirror, stamps (v7.3)');
{
  const f = T.edNewFloor(20, 20, 'rock');
  T.edCarve(f, 2, 2, 5, 4); T.edPlace(f, 3, 3, { type: 'chest', gold: [1, 4, 0] }); T.edPaint(f, 4, 3, 'water');
  const b = T.edCopy(f, 2, 2, 5, 4);
  ok('a copied block has its size, things and terrain', b.w === 4 && b.h === 3 && b.features['1,1'].type === 'chest' && b.terrain['2,1'] === 'water');
  ok('pasted elsewhere', T.edPaste(f, b, 10, 10) && f.features['11,11'].type === 'chest' && f.terrain['12,11'] === 'water' && !T.edRock(f, 10, 10));
  ok('walls in step after a paste', T.edWallsInStep(f));
  T.edCarve(f, 6, 3, 9, 3);                                   // a corridor up to the pasted room's side
  T.edPaste(f, b, 10, 2);
  ok('a paste against open ground stays walled where the block is walled', T.edWall(f, 9, 3, 1) && T.edWallsInStep(f));
  const r = T.edBlockRotate(b);
  ok('a block turned is tall where it was wide', r.w === 3 && r.h === 4 && r.features['1,1'].type === 'chest');
  ok('four turns bring it back', JSON.stringify(T.edBlockRotate(T.edBlockRotate(T.edBlockRotate(r)))) === JSON.stringify(b));
  const m = T.edBlockMirror(b, 'x');
  ok('mirrored, the chest moves across and twice is the same', m.features['2,1'].type === 'chest' && JSON.stringify(T.edBlockMirror(m, 'x')) === JSON.stringify(b));
  ok('mirrored top to bottom, twice is the same', JSON.stringify(T.edBlockMirror(T.edBlockMirror(b, 'y'), 'y')) === JSON.stringify(b));
  const g = T.edNewFloor(20, 20, 'rock'); T.edPaste(g, T.edBlockRotate(b), 5, 5); T.edPaste(g, m, 12, 12);
  ok('turned and mirrored blocks paste in step', T.edWallsInStep(g));
  ok('pasting off the edge keeps what fits', T.edPaste(g, b, 18, 18) && T.edWallsInStep(g));
  Object.keys(T.ED_STAMPS).forEach(k => {
    const s = T.ED_STAMPS[k].make(), h = T.edNewFloor(20, 20, 'rock');
    T.edPaste(h, s, 6, 6);
    ok('the ' + k + ' stamp pastes in step', T.edWallsInStep(h) && h.cells.some(c => !(c & 16)));
  });
  const cellsF = T.edNewFloor(14, 14, 'rock'); T.edPaste(cellsF, T.ED_STAMPS.cells.make(), 2, 2);
  T.edSetEntry(cellsF, 3, 5, 1); T.edPlace(cellsF, 3, 3, T.edThing('exit').make());
  const cd = { name: 'C', floors: [cellsF], cover: { win: 'exit' } };
  ok('a cell block: through a cell door to a way out, all clear', !T.edProblems(T.edPackFrom(cd, T.BUNDLED_BASE), T.validatePack, T.proveSolvable, cd).filter(p => p.level === 'error').length,
     JSON.stringify(T.edProblems(T.edPackFrom(cd, T.BUNDLED_BASE), T.validatePack, T.proveSolvable, cd)));
  // the whole floor
  const w = T.edNewFloor(16, 12, 'box'); T.edPlace(w, 3, 2, { type: 'lever', id: 'lv.1', opens: '10,8' }); T.edPlace(w, 10, 8, { type: 'portcullis', needsLever: 'lv.1' });
  T.edSetEntry(w, 2, 9, 1); T.edPlace(w, 5, 5, { type: 'teleporter', to: w.id, at: [12, 3] });
  T.edTransformFloor(w, 'rotate');
  ok('a whole floor turned: its size swaps', w.w === 12 && w.h === 16);
  ok('the entry turns with it, and faces the new way', w.entry.join() === '2,2' && w.entryFacing === 2, w.entry.join() + ' ' + w.entryFacing);
  ok('the lever still opens its portcullis, wherever it went', w.features[w.features['9,3'] ? '9,3' : ''] && w.features[w.features['9,3'].opens].needsLever === 'lv.1');
  ok('the teleporter still lands where it did', w.features['6,5'].at.join() === '8,12');
  ok('walls in step', T.edWallsInStep(w));
  T.edTransformFloor(w, 'mirrorX'); T.edTransformFloor(w, 'mirrorY');
  ok('mirrored both ways, still in step', T.edWallsInStep(w));
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

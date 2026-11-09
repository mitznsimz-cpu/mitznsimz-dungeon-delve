// MSDD v4.8 — the dungeon comes alive: the closed list of feature types and
// what the validator says about each new one; traps found, sprung and
// disarmed; chests that are trapped and chests that are not chests; the seven
// neutral finds and the effects they use; doorways, ice, rotten planks and
// pillars in a fight; someone freed fighting beside you; one-way doors,
// slides and collapses in the prover; the save; the generator's dressing;
// and Ashkeld's placements.
const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');

function grabFrom(text, tag) {
  const re = new RegExp('/\\* ==== ' + tag + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + tag + ' END ==== \\*/');
  const mm = text.match(re);
  if (!mm) { console.error('FAIL: ' + tag + ' markers missing'); process.exit(1); }
  return mm[1];
}
const grab = tag => grabFrom(src, tag);

const BOOT = grab('BUNDLED PACK') + grab('MINI CORE') + grab('PACK CORE') +
  '\nvar __L = loadPack(BUNDLED_PACK);' +
  '\nif(!__L.ok){throw new Error("pack invalid: "+__L.errors.join("; "));}\n';
const names = ['FEATURE_TYPES', 'NEUTRAL_TYPES', 'TRAP_KINDS', 'trapKindOf', 'TERRAIN', 'combatGround', 'validatePack',
  'proveSolvable', 'loadPack', 'BUNDLED_PACK', 'PACK', 'MONSTERS', 'ITEMS', 'CLASSES', 'makeRng', 'makeParty',
  'grantStartingSpells', 'maxBP', 'maxMP', 'applyDamage', 'beginCombat', 'makeEncounter', 'engagedParty', 'engagedFoes',
  'abreastOf', 'groundToHit', 'allyTurn', 'livingFoes', 'blankFloorState', 'floorState', 'FLOOR_LISTS', 'packWorld',
  'unpackWorld', 'serialise', 'deserialise', 'exploredToBits', 'searchHere', 'trapDifficulty', 'spotChance',
  'disarmChance', 'bestDisarmer', 'passiveSpotter', 'hiddenAt', 'isSpotted', 'markSpotted', 'trapNote', 'springTrap',
  'disarmTrap', 'neutralEvent', 'RIDDLES', 'applyEffects', 'STATS', 'generateDelve', 'extendDelve', 'delvePrint',
  'GEN_VERSION', 'GEN_DRESSING_TYPES', 'GEN_DRESSING_TERRAIN', 'genDressing'];
const CORES = ['PARTY CORE', 'SAVE CORE', 'WORLD CORE', 'GEN CORE', 'EVENT CORE', 'COMBAT CORE', 'STAGE CORE',
  'TOWN CORE', 'INVENTORY CORE', 'MAP CORE'];
const T = new Function(BOOT + CORES.map(grab).join('\n') + '\nreturn {' + names.join(',') + '};')();

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')); } };
const clone = o => JSON.parse(JSON.stringify(o));
const fixed = v => () => v;                                   // an rng that always says the same
const seq = vs => { let i = 0; return () => vs[Math.min(i++, vs.length - 1)]; };

function party(seed, classes) {
  const rg = T.makeRng(seed || 1);
  const p = T.makeParty(rg, (classes || ['fighter', 'fighter', 'mage', 'priest']).map((c, i) =>
    ({ name: ['Bruda', 'Kesh', 'Merl', 'Ansel'][i], class: c })));
  T.grantStartingSpells(p);
  p.forEach(c => { if (!c.equipped.weapon) c.equipped.weapon = { damage: [1, 8, 0], reach: 'melee' }; });
  return p;
}
// the bundled pack with one floor changed, validated
function withF1(change) {
  const p = clone(T.BUNDLED_PACK);
  change(p.floors[0], p);
  return T.validatePack(p);
}
const errs = r => (r.errors || []).join(' | ');

// a corridor one cell high, walls north and south: x from 0 to w-1
function corridor(w, opts) {
  opts = opts || {};
  const cells = [];
  for (let x = 0; x < w; x++) cells.push(5 | (x === 0 ? 8 : 0) | (x === w - 1 ? 2 : 0));
  return { id: 'c1', name: 'Test', depth: 1, w: w, h: 1, cells: cells, entry: opts.entry || [0, 0], entryFacing: 1,
           features: opts.features || {}, terrain: opts.terrain || {} };
}
const prove = f => T.proveSolvable({ floors: [f], items: {}, endless: true });
const stranded = r => r.errors.some(e => /no way back/.test(e));

console.log('\n[D1] the vocabulary, and the validator');
{
  ok('28 feature types, the new ten among them', T.FEATURE_TYPES.length === 28 &&
     ['plate', 'portcullis', 'illusion', 'fountain', 'altar', 'statue', 'remains', 'campsite', 'merchant', 'prisoner']
       .every(t => T.FEATURE_TYPES.indexOf(t) >= 0));
  ok('seven neutral finds', T.NEUTRAL_TYPES.length === 7 && T.NEUTRAL_TYPES.every(t => T.FEATURE_TYPES.indexOf(t) >= 0));
  ok('six kinds of trap, each named and described', Object.keys(T.TRAP_KINDS).join() === 'snare,darts,gas,fire,net,alarm' &&
     Object.values(T.TRAP_KINDS).every(k => k.name && k.look && k.spring));
  ok('a trap with no kind is the old blade', T.trapKindOf({ type: 'trap' }) === 'snare' && T.trapKindOf({ kind: 'gas' }) === 'gas' &&
     T.trapKindOf({ kind: 'nonsense' }) === 'snare');
  ok('the bundled pack still validates', T.validatePack(clone(T.BUNDLED_PACK)).ok);

  const refuse = (name, change, re) => { const r = withF1(change); ok(name, !r.ok && re.test(errs(r)), errs(r)); };
  refuse('an unknown feature type is refused', f => { f.features['2,9'] = { type: 'trapdoor' }; }, /"trapdoor", which the engine does not know/);
  refuse('a trap of an unknown kind is refused', f => { f.features['2,9'] = { type: 'trap', kind: 'boulder' }; }, /kind "boulder"/);
  refuse('a difficulty outside 1 to 5 is refused', f => { f.features['2,9'] = { type: 'trap', dc: 9 }; }, /difficulty 9/);
  refuse('a chest trapped with nonsense is refused', f => { f.features['2,2'].trap = 'spikes'; }, /trapped with "spikes"/);
  refuse('a mimic of a monster that does not exist is refused', f => { f.features['2,2'].mimic = 'mn.wardrobe'; }, /no monster "mn.wardrobe"/);
  ok('a mimic and a trap together is a warning, not an error', (() => {
    const r = withF1(f => { f.features['2,2'].mimic = true; f.features['2,2'].trap = 'darts'; });
    return r.ok && (r.warnings || []).some(w => /mimic wins/.test(w)); })());
  refuse('a door one-way toward 7 is refused', f => { f.features['4,5'].oneWay = 7; }, /one-way toward 7/);
  refuse('a plate that does nothing is refused', f => { f.features['2,9'] = { type: 'plate' }; }, /neither an id/);
  refuse('a plate that springs nonsense is refused', f => { f.features['2,9'] = { type: 'plate', trap: 'pie' }; }, /springs "pie"/);
  refuse('a portcullis nothing can raise is refused', f => { f.features['2,9'] = { type: 'portcullis' }; }, /cannot be lifted/);
  refuse('a portcullis waiting on a missing plate is refused', f => { f.features['2,9'] = { type: 'portcullis', needsLever: 'pl.none' }; },
         /"pl.none"/);
  ok('a portcullis raised by a plate on the floor is fine', withF1(f => {
    f.features['2,9'] = { type: 'portcullis', needsLever: 'pl.t' }; f.features['2,10'] = { type: 'plate', id: 'pl.t' }; }).ok);
  refuse('an illusory wall where there is no wall is refused', f => { f.features['2,9'] = { type: 'illusion', side: 1 }; }, /side that has no wall/);
  refuse('an illusory wall with no side is refused', f => { f.features['2,9'] = { type: 'illusion' }; }, /no side/);
  refuse('an illusory wall onto solid rock is refused', f => { f.features['1,9'] = { type: 'illusion', side: 3 }; }, /solid rock|edge of the map|no wall/);
  refuse('a riddle with one answer is refused', f => { f.features['2,9'] = { type: 'statue', riddle: { q: 'Why?', answers: ['No'], right: 0 } }; },
         /riddle needs/);
  refuse('a merchant selling what does not exist is refused', f => { f.features['2,9'] = { type: 'merchant', stock: ['it.unicorn'] }; },
         /unknown item "it.unicorn"/);
  refuse('a prisoner with bad dice is refused', f => { f.features['2,9'] = { type: 'prisoner', ally: { dice: [6] } }; }, /dice like/);
  ok('a find on ice is a warning', (() => {
    const r = withF1(f => { f.features['2,9'] = { type: 'fountain' }; f.terrain['2,9'] = 'ice'; });
    return (r.warnings || []).some(w => /on ice is slid over/.test(w)); })());
}

console.log('\n[D2] one-way doors, ice and rotten planks in the prover');
{
  // entry at the west end, stairs at the west end: going east is fine only if you can come back
  const base = () => corridor(6, { entry: [1, 0], features: { '0,0': { type: 'stairsUp' } } });
  ok('a plain corridor proves', prove(base()).ok, prove(base()).errors.join('; '));
  const oneEast = base(); oneEast.features['3,0'] = { type: 'door', oneWay: 1 };
  ok('a door that lets you east and never back strands the party', stranded(prove(oneEast)), prove(oneEast).errors.join('; '));
  const oneWest = base(); oneWest.features['3,0'] = { type: 'door', oneWay: 3 };
  ok('one that only lets you west strands nobody', !stranded(prove(oneWest)));
  const stairsBeyond = base(); stairsBeyond.features['3,0'] = { type: 'door', oneWay: 1 };
  stairsBeyond.features['5,0'] = { type: 'stairsDown' };
  ok('with stairs beyond it, a one-way door is fine', !stranded(prove(stairsBeyond)), prove(stairsBeyond).errors.join('; '));

  const rot = base(); rot.terrain['3,0'] = 'rotten';
  ok('a rotten plank you cross and cannot recross strands the party', stranded(prove(rot)));
  const rotStairs = base(); rotStairs.terrain['3,0'] = 'rotten'; rotStairs.features['5,0'] = { type: 'stairsDown' };
  ok('with a way out beyond it, it does not', !stranded(prove(rotStairs)));

  const ice = base(); ice.terrain['3,0'] = 'ice'; ice.terrain['4,0'] = 'ice';
  ok('ice in a passage you can walk back along strands nobody', !stranded(prove(ice)), prove(ice).errors.join('; '));

  const ill = corridor(4); ill.cells[1] |= 2; ill.cells[2] |= 8;           // a wall between 1 and 2
  ill.features['1,0'] = { type: 'illusion', side: 1 }; ill.features['0,0'] = { type: 'stairsUp' };
  ill.features['3,0'] = { type: 'chest', item: 'it.key.t' };
  ill.features['0,0'] = { type: 'door', locked: true, keyId: 'it.key.t' };
  const r = T.proveSolvable({ floors: [ill], items: { 'it.key.t': { tags: ['key'] } }, endless: true });
  ok('the prover never counts on an illusory wall: a key behind one is out of reach', !r.ok && /it\.key\.t/.test(r.errors.join(' ')),
     r.errors.join('; '));
  const ashkeld = T.proveSolvable(clone(T.BUNDLED_PACK));
  ok('Ashkeld, with its one-way door and rotten bridge, proves', ashkeld.ok, ashkeld.errors.join('; '));
  const flip = clone(T.BUNDLED_PACK); flip.floors[1].features['1,5'].oneWay = 0;
  ok('turned to face north, the Lightless Run door still strands nobody', !stranded(T.proveSolvable(flip)));
}

console.log('\n[D3] traps: finding them');
{
  const p = party(3);
  ok('difficulty is the trap\'s own, or grows with depth', T.trapDifficulty({ dc: 4 }, 1) === 4 &&
     T.trapDifficulty({}, 1) === 1 && T.trapDifficulty({}, 3) === 2 && T.trapDifficulty({}, 20) === 5);
  const c1 = T.spotChance(p, 1), c5 = T.spotChance(p, 5);
  ok('a harder trap is harder to find', c1 > c5, c1 + ' vs ' + c5);
  ok('finding is never sure and never hopeless', [1, 2, 3, 4, 5].every(d => T.spotChance(p, d) >= 0.05 && T.spotChance(p, d) <= 0.95));
  const dead = clone(p); dead.forEach(c => { c.bp = 0; });
  ok('the fallen find nothing', T.spotChance(dead, 1) === 0);
  const before = T.spotChance(p, 3);
  T.CLASSES.fighter.traps = { spot: 1, disarm: 0.25, passive: true };      // what v4.9's Rogue will have
  ok('a class with a trap sense finds more', T.spotChance(p, 3) > before);
  ok('and notices without looking', T.passiveSpotter(p) && T.passiveSpotter(p).class === 'fighter');
  ok('and disarms better', T.disarmChance(p[0], 2) > T.disarmChance(p[2], 2) - 0.08 * 10);
  delete T.CLASSES.fighter.traps;
  ok('nobody in a plain party notices on their own', T.passiveSpotter(p) === null);

  const f = { id: 'tf', depth: 2, w: 3, h: 3, cells: new Array(9).fill(0), features: {
    '1,1': { type: 'trap', kind: 'darts' }, '2,1': { type: 'chest', trap: 'gas' }, '1,0': { type: 'chest', mimic: true },
    '0,1': { type: 'chest' } } };
  const world = {};
  ok('a trap hides a trap', T.hiddenAt(f, world, '1,1') === 'trap');
  ok('a trapped chest hides a chest trap', T.hiddenAt(f, world, '2,1') === 'chestTrap');
  ok('a mimic hides a mimic', T.hiddenAt(f, world, '1,0') === 'mimic');
  ok('a plain chest hides nothing', T.hiddenAt(f, world, '0,1') === null && T.hiddenAt(f, world, '0,0') === null);
  const s0 = T.searchHere(p, f, world, 1, 1, fixed(0));
  ok('a sure search finds the trap underfoot and the two beside it', s0.traps.length === 3 &&
     ['1,1', '2,1', '1,0'].every(k => T.isSpotted(world, 'tf', k)), s0.traps.join());
  ok('and says what and where', s0.notes.some(n => /dart trap here/.test(n)) && s0.notes.some(n => /to the east is trapped/.test(n)) &&
     s0.notes.some(n => /to the north is breathing/.test(n)), s0.notes.join(' / '));
  const s1 = T.searchHere(p, f, world, 1, 1, fixed(0));
  ok('a second search does not find them again', s1.traps.length === 0);
  const w2 = {};
  const miss = T.searchHere(p, f, w2, 1, 1, fixed(0.999));
  ok('an unlucky search finds nothing', miss.traps.length === 0 && !T.isSpotted(w2, 'tf', '1,1') && /Nothing here/.test(miss.notes[0]));
  T.floorState(w2, 'tf').disarmed.push('2,1');
  ok('a disarmed chest hides nothing more', T.hiddenAt(f, w2, '2,1') === null);
  T.floorState(w2, 'tf').consumed.push('1,1');
  ok('a trap that is spent hides nothing more', T.hiddenAt(f, w2, '1,1') === null);
}

console.log('\n[D4] traps: springing them');
{
  const bpSum = p => p.reduce((a, c) => a + c.bp, 0);
  let p = party(4), was = bpSum(p);
  let r = T.springTrap(p, { text: 'Click.' }, 'darts', T.makeRng(9), { depth: 1 });
  ok('darts hit twice', r.hurt.length === 2 && bpSum(p) < was && /Darts hiss/.test(r.notes.join(' ')), r.notes.join(' '));
  ok('and the trap\'s own words come first', r.notes[0] === 'Click.');
  p = party(4);
  r = T.springTrap(p, null, 'gas', fixed(0.99), { depth: 1 });
  ok('gas poisons whoever cannot hold their breath', r.hurt.length === 4 && p.every(c => c.status.indexOf('poisoned') >= 0));
  p = party(4);
  r = T.springTrap(p, null, 'gas', fixed(0), { depth: 1 });
  ok('and nobody who can', r.hurt.length === 0 && /held their breath/.test(r.notes.join(' ')));
  p = party(4); was = bpSum(p);
  r = T.springTrap(p, null, 'fire', T.makeRng(2), { depth: 3 });
  const burnt = was - bpSum(p);
  ok('fire burns everyone', r.hurt.length === 4 && burnt > 0);
  p = party(4); was = bpSum(p);
  T.springTrap(p, null, 'fire', T.makeRng(2), { depth: 3, fireMult: 0.5 });
  ok('less in water', was - bpSum(p) < burnt, (was - bpSum(p)) + ' vs ' + burnt);
  r = T.springTrap(party(4), null, 'net', T.makeRng(2), {});
  ok('a net costs four turns and makes a noise', r.turns === 4 && r.threat > 0);
  r = T.springTrap(party(4), null, 'alarm', T.makeRng(2), {});
  ok('a tripwire brings something', r.alarm === true && r.threat === 100);
  p = party(4);
  r = T.springTrap(p, null, 'snare', T.makeRng(7), {});
  ok('a blade trap goes for the gear', /damaged|nothing to bite/.test(r.notes.join(' ')), r.notes.join(' '));
  ok('a trap sprung on the fallen does nothing', T.springTrap(party(4).map(c => Object.assign(c, { bp: 0 })), null, 'fire',
     T.makeRng(1), {}).notes.length === 0);
}

console.log('\n[D5] traps: disarming them');
{
  const f = { id: 'tf', depth: 1, w: 3, h: 1, cells: [0, 0, 0], features: {
    '0,0': { type: 'trap', kind: 'net', dc: 2 }, '1,0': { type: 'chest', trap: 'darts', dc: 3 }, '2,0': { type: 'trap' } } };
  const p = party(6);
  const best = T.bestDisarmer(p, 2);
  ok('the best hands try', best && p.every(c => T.disarmChance(c, 2) <= best.chance));
  ok('a harder trap is harder to disarm', T.disarmChance(p[0], 1) > T.disarmChance(p[0], 5));
  let world = {};
  let r = T.disarmTrap(p, world, f, '0,0', fixed(0));
  ok('a clean disarm is worth 15 a point of difficulty', r.ok && r.xp === 30, JSON.stringify(r));
  ok('and the trap is gone', T.hiddenAt(f, world, '0,0') === null);
  r = T.disarmTrap(p, world, f, '1,0', fixed(0));
  ok('a chest\'s trap comes out of the lock, and the chest stays', r.ok && r.xp === 45 &&
     T.floorState(world, 'tf').disarmed.indexOf('1,0') >= 0 && T.floorState(world, 'tf').consumed.indexOf('1,0') < 0);
  world = {};
  r = T.disarmTrap(p, world, f, '0,0', fixed(0.999));
  ok('a bad slip sets it off', !r.ok && r.sprung && r.kind === 'net');
  const c = T.bestDisarmer(p, 2).chance;
  r = T.disarmTrap(p, world, f, '0,0', fixed(Math.min(0.99, c + 0.1)));
  ok('a near miss leaves it be, to try again', !r.ok && !r.sprung && /tried again/.test(r.notes.join(' ')));
  ok('an old trap with no kind is a blade trap to disarm', T.disarmTrap(p, {}, f, '2,0', fixed(0)).notes[0].indexOf('blade trap') > 0);
}

console.log('\n[D6] the neutral finds');
{
  const ctx = (key, depth) => ({ depth: depth || 2, key: key, floorId: 'fx', monsters: T.PACK.monsters, items: T.PACK.items,
                                 shopStock: T.PACK.shopStock });
  T.NEUTRAL_TYPES.forEach(type => {
    const ev = T.neutralEvent({ type: type }, ctx('3,3'));
    ok(type + ': a titled event with something to decide and a way to leave', ev.title && ev.text && ev.choices.length >= 2 &&
       ev.choices.some(c => c.leave), JSON.stringify(ev).slice(0, 120));
  });
  ok('the same find offers the same thing every time', T.NEUTRAL_TYPES.every(t =>
     JSON.stringify(T.neutralEvent({ type: t }, ctx('3,3'))) === JSON.stringify(T.neutralEvent({ type: t }, ctx('3,3')))));
  ok('finds elsewhere differ', T.NEUTRAL_TYPES.some(t =>
     JSON.stringify(T.neutralEvent({ type: t }, ctx('3,3'))) !== JSON.stringify(T.neutralEvent({ type: t }, ctx('7,1')))));
  // every choice's effects run without fault, and fights name real monsters
  let bad = [];
  T.NEUTRAL_TYPES.forEach(type => {
    for (let k = 0; k < 6; k++) {
      const ev = T.neutralEvent({ type: type }, ctx(k + ',' + k, 1 + k));
      ev.choices.forEach(c => {
        try {
          for (let s = 0; s < 8; s++) {
            const out = T.applyEffects(party(s + 1), c.effects, T.makeRng(s * 31 + k));
            if (out.fight && !T.PACK.monsters[out.fight.ref]) bad.push(type + ' fights ' + out.fight.ref);
            out.items.forEach(it => { if (!T.PACK.items[it.ref || it]) bad.push(type + ' gives ' + JSON.stringify(it)); });
          }
        } catch (e) { bad.push(type + ': ' + e.message); }
      });
    }
  });
  ok('every choice of every find runs, and names only real things', bad.length === 0, bad.slice(0, 4).join(' | '));

  const riddle = { q: 'What walks on four legs?', answers: ['A table', 'A dog'], right: 1 };
  const st = T.neutralEvent({ type: 'statue', riddle: riddle, text: 'A stone sphinx.' }, ctx('1,1'));
  ok('a statue asks its own riddle, after its own words', /^A stone sphinx\. Words are cut into the plinth: "What walks/.test(st.text), st.text);
  const right = T.applyEffects(party(1), st.choices[1].effects, T.makeRng(1));
  const wrong = T.applyEffects(party(1), st.choices[0].effects, T.makeRng(1));
  ok('the right answer pays', right.xp > 0 && right.gold > 0 && !right.fight);
  ok('the wrong one wakes the statue', !!wrong.fight && !!T.PACK.monsters[wrong.fight.ref]);
  ok('a statue without a riddle of its own draws one of six', T.RIDDLES.length === 6 &&
     T.RIDDLES.some(r => T.neutralEvent({ type: 'statue' }, ctx('5,5')).text.indexOf(r.q) >= 0));

  const shop = T.neutralEvent({ type: 'merchant', stock: ['it.potion', 'it.torch'] }, ctx('2,2'));
  ok('a merchant comes back, and sells what is in the pack', shop.repeat === true && shop.once === false &&
     shop.choices.filter(c => c.sells).map(c => c.sells).join() === 'it.potion,it.torch');
  ok('at half as much again', shop.choices[0].require.gold === Math.round(T.PACK.items['it.potion'].value * 1.5));
  const pr = T.neutralEvent({ type: 'prisoner', ally: { name: 'Wenna', dice: [1, 6, 1] } }, ctx('9,4'));
  const freed = pr.choices.filter(c => c.effects.some(e => e.kind === 'ally'));
  ok('a prisoner is freed by strength or by deft hands', freed.length === 2 &&
     freed[0].require.stat === 'str' && freed[1].require.stat === 'dex');
  const out = T.applyEffects(party(1), freed[0].effects, T.makeRng(1));
  ok('and fights beside you, by name', out.ally && out.ally.name === 'Wenna' && out.ally.dice.join() === '1,6,1');
  const camp = T.neutralEvent({ type: 'campsite' }, ctx('2,2'));
  ok('an old camp lets you rest', camp.choices[0].effects[0].kind === 'campsite');
}

console.log('\n[D7] the new effects');
{
  const tbl = { kind: 'random', table: [{ w: 1, text: 'First.', effects: [{ kind: 'gold', amount: 5 }] },
                                        { w: 3, text: 'Second.', effects: [{ kind: 'xp', amount: 7 }] }] };
  let o = T.applyEffects(party(1), [tbl], fixed(0));
  ok('a table picks by weight: the low roll the first row', o.gold === 5 && o.notes[0] === 'First.');
  o = T.applyEffects(party(1), [tbl], fixed(0.5));
  ok('the higher roll the heavier row', o.xp === 7 && o.notes[0] === 'Second.');
  const p = party(1); const was = p[0].stats.str;
  T.applyEffects(p, [{ kind: 'stat', stat: 'str', amount: 1, who: 'best' }], fixed(0));
  ok('a stat can rise', p[0].stats.str === Math.min(20, was + 1));
  p[0].stats.str = 4;
  T.applyEffects(p, [{ kind: 'stat', stat: 'str', amount: -5, who: 'best' }], fixed(0));
  ok('and never falls below 3', p[0].stats.str === 3);
  const caster = p.filter(c => T.maxMP(c) > 0)[0]; caster.mp = 0;
  T.applyEffects(p, [{ kind: 'mp', dice: [1, 4, 0] }], T.makeRng(3));
  ok('magic comes back to the casters', caster.mp > 0 && caster.mp <= T.maxMP(caster));
  o = T.applyEffects(party(1), [{ kind: 'fight', ref: 'mn.goblin', count: 2 }], fixed(0));
  ok('a fight is handed back to start', o.fight && o.fight.ref === 'mn.goblin' && o.fight.count === 2);
  const evPack = clone(T.BUNDLED_PACK);
  evPack.events['ev.test'] = { title: 'T', text: 't', once: true, choices: [{ label: 'x', effects: [
    { kind: 'random', table: [{ w: 1, effects: [{ kind: 'nonsense' }] }] }] }] };
  const vr = T.validatePack(evPack);
  ok('the validator looks inside a table for effects it does not know', !vr.ok && /nonsense/.test(errs(vr)), errs(vr));
}

console.log('\n[D8] the ground of a fight');
{
  const f = { w: 3, h: 3, cells: [16, 16, 16, 16, 10, 16, 16, 16, 16], features: { '1,1': { type: 'door' } }, terrain: {} };
  const g = T.combatGround(f, 1, 1);
  ok('a doorway: one at a time', g && g.doorway && g.abreast === 1 && g.narrow);
  const fightOn = (ground, n, classes) => {
    const rg = T.makeRng(5), p = party(5, classes || ['fighter', 'fighter', 'fighter', 'priest']), foes = [];
    for (let i = 0; i < n; i++) foes.push(T.makeEncounter('mn.goblin', rg)[0]);
    foes.forEach((fo, i) => { fo.rank = 'front'; fo.uid = 'g' + i; });
    return { p, st: T.beginCombat(p, foes, rg, ground), rg };
  };
  let F = fightOn(g, 3);
  F.p[2].rank = 'front';
  ok('one of the party fights in a doorway', T.abreastOf(F.st) === 1 && T.engagedParty(F.p, F.st).length === 1);
  ok('and one of them', T.engagedFoes(F.st).length === 1);
  ok('the start of the fight says so', F.st.log.some(l => /doorway/i.test(l.text)), F.st.log.map(l => l.text).join(' / '));
  F = fightOn({ narrow: true }, 3);
  ok('a passage is still two abreast', T.abreastOf(F.st) === 2);
  const iceG = T.combatGround({ w: 1, h: 1, cells: [0], features: {}, terrain: { '0,0': 'ice' } }, 0, 0);
  ok('on ice, blows go astray', iceG && iceG.meleeHit === -1 && T.groundToHit({ ground: iceG }, 'melee') === -1);
  const pil = T.combatGround({ w: 1, h: 1, cells: [0], features: {}, terrain: { '0,0': 'pillars' } }, 0, 0);
  ok('among pillars, the back rank has cover from shots', T.groundToHit({ ground: pil }, 'ranged', null, true) === -2 &&
     T.groundToHit({ ground: pil }, 'ranged', null, false) === 0 && T.groundToHit({ ground: pil }, 'melee', null, true) === 0);
  const rot = T.combatGround({ w: 1, h: 1, cells: [0], features: {}, terrain: { '0,0': 'rotten' } }, 0, 0);
  ok('rotten planks are as narrow as a bridge', rot && rot.narrow);
}

console.log('\n[D9] someone fighting beside you');
{
  const rg = T.makeRng(8), p = party(8), foes = T.makeEncounter('mn.goblin', rg).slice(0, 1);
  foes[0].bp = 50;
  const st = T.beginCombat(p, foes, rg, null);
  ok('no ally, no blows', T.allyTurn(st, rg).length === 0);
  st.ally = { name: 'Wenna', dice: [2, 6, 2], toHit: 30 };
  const ev = T.allyTurn(st, rg);
  ok('an ally strikes at the front of the press', ev.length >= 1 && /Wenna hits/.test(ev[0].text) && foes[0].bp < 50, ev.map(e => e.text).join(' '));
  ok('and the stage knows whose blow it was', ev[0].by === 'ally' && ev[0].on === foes[0].uid);
  st.ally.toHit = -40;
  ok('and sometimes misses', /misses/.test(T.allyTurn(st, rg)[0].text));
}

console.log('\n[D10] the save');
{
  ok('a floor remembers five more lists', ['spotted', 'disarmed', 'collapsed', 'dispelled', 'sold'].every(k =>
     T.FLOOR_LISTS.indexOf(k) >= 0 && Array.isArray(T.blankFloorState()[k])));
  const world = { f1: T.blankFloorState() };
  world.f1.spotted.push('9,1'); world.f1.disarmed.push('9,1'); world.f1.dispelled.push('8,9');
  world.f1.collapsed.push('8,7'); world.f1.sold.push('10,10|it.potion');
  const back = T.unpackWorld(clone(T.packWorld(world, T.BUNDLED_PACK)), T.BUNDLED_PACK);
  ok('and keeps them through a save', ['spotted', 'disarmed', 'dispelled', 'collapsed', 'sold'].every(k =>
     JSON.stringify(back.f1[k]) === JSON.stringify(world.f1[k])));
  const old = { f1: { explored: '', consumed: ['2,2'] } };
  const oldBack = T.unpackWorld(old, T.BUNDLED_PACK);
  ok('a save from before has them empty', oldBack.f1.spotted.length === 0 && oldBack.f1.consumed.join() === '2,2');

  const rg = T.makeRng(5), p = T.makeParty(rg, [{ name: 'A', class: 'fighter' }, { name: 'B', class: 'priest' },
                                                { name: 'C', class: 'mage' }, { name: 'D', class: 'fighter' }]);
  const base = { packId: T.BUNDLED_PACK.id, packVersion: T.BUNDLED_PACK.version, slotName: 'x', createdAt: '2026-11-08T00:00:00Z',
                 playtimeSec: 1, worldSeed: 1, actionRngState: 1, gold: 1, threat: 0,
                 position: { floor: 'f2', x: 9, y: 4, facing: 0 }, party: p, world: {}, questFlags: {} };
  const withAlly = Object.assign({}, base, { ally: { name: 'Wenna', dice: [1, 6, 1], toHit: 4, floor: 'f2' } });
  const r = T.deserialise(clone(T.serialise(withAlly)), { packId: T.BUNDLED_PACK.id });
  ok('someone beside you comes back with the save', r.ok && r.state.ally && r.state.ally.name === 'Wenna' &&
     r.state.ally.dice.join() === '1,6,1' && r.state.ally.floor === 'f2', JSON.stringify(r.state && r.state.ally));
  const r2 = T.deserialise(clone(T.serialise(base)), { packId: T.BUNDLED_PACK.id });
  ok('and nobody, when there was nobody', r2.ok && r2.state.ally === null);
}

console.log('\n[D11] the generator dresses its floors');
{
  ok('generator 4', T.GEN_VERSION === 4);
  const stats = { trap: 0, mimic: 0, trapped: 0, finds: 0, merchant: 0, ice: 0, pillars: 0, rotten: 0 };
  let valid = true, proven = true, onEntry = 0, shallowMimic = 0, onFeature = 0, deterministic = true, samePrint = true;
  for (let seed = 1; seed <= 40; seed++) {
    const a = T.generateDelve(seed, { floors: 6, basePack: T.BUNDLED_PACK });
    if (!a.ok) { valid = false; continue; }
    if (!T.proveSolvable(a.pack).ok) proven = false;
    if (seed <= 10) {
      const b = T.generateDelve(seed, { floors: 6, basePack: T.BUNDLED_PACK });
      if (JSON.stringify(a.pack.floors) !== JSON.stringify(b.pack.floors)) deterministic = false;
      const bare = T.generateDelve(seed, { floors: 6, basePack: T.BUNDLED_PACK, cfg: { dressing: false } });
      if (T.delvePrint(bare.pack) !== a.pack.generated.print) samePrint = false;
    }
    a.pack.floors.forEach(f => {
      Object.keys(f.features).forEach(k => {
        const ft = f.features[k];
        if (ft.type === 'trap') stats.trap++;
        if (ft.mimic) { stats.mimic++; if (f.depth < 3) shallowMimic++; }
        if (ft.type === 'chest' && ft.trap) stats.trapped++;
        if (T.NEUTRAL_TYPES.indexOf(ft.type) >= 0) stats.finds++;
        if (ft.type === 'merchant') stats.merchant++;
        if (T.GEN_DRESSING_TYPES[ft.type] && k === f.entry.join(',')) onEntry++;
      });
      Object.keys(f.terrain || {}).forEach(k => {
        const t = f.terrain[k];
        if (stats[t] != null) stats[t]++;
        if (T.GEN_DRESSING_TERRAIN[t] && f.features[k] && f.features[k].type !== 'door') onFeature++;
      });
    });
  }
  ok('forty dressed delves all validate', valid);
  ok('and all prove, with nobody stranded', proven);
  ok('the same seed dresses a floor the same way', deterministic);
  ok('dressing leaves a delve\'s fingerprint alone, so old saves rebuild in place', samePrint);
  ok('traps in the passages', stats.trap > 200, stats.trap);
  ok('trapped chests', stats.trapped > 30, stats.trapped);
  ok('mimics, and only from the third floor down', stats.mimic > 10 && shallowMimic === 0, stats.mimic + ' / ' + shallowMimic);
  ok('finds in the rooms, merchants among them', stats.finds > 60 && stats.merchant > 10, JSON.stringify(stats));
  ok('pillars and ice', stats.pillars > 0 && stats.ice > 0, JSON.stringify(stats));
  let rotten = 0;
  for (let seed = 1; seed <= 120 && !rotten; seed++) {
    const a = T.generateDelve(seed, { floors: 8, size: 'large', basePack: T.BUNDLED_PACK });
    a.pack.floors.forEach(f => Object.values(f.terrain || {}).forEach(t => { if (t === 'rotten') rotten++; }));
  }
  ok('and, deeper down, now and then a rotten bridge', rotten > 0);
  ok('nothing laid on the way in', onEntry === 0);
  ok('no dressed ground under a feature', onFeature === 0);
  const none = T.generateDelve(7, { floors: 4, basePack: T.BUNDLED_PACK, cfg: { dressing: false } });
  ok('and with dressing off there is none of it', none.pack.floors.every(f =>
     Object.values(f.features).every(ft => !T.GEN_DRESSING_TYPES[ft.type] && !ft.mimic && !ft.trap) &&
     Object.values(f.terrain || {}).every(t => !T.GEN_DRESSING_TERRAIN[t] && t !== 'rotten')));
  const endless = T.generateDelve(99, { floors: 2, endless: true, basePack: T.BUNDLED_PACK });
  const deep = T.extendDelve(endless.pack, 9, T.BUNDLED_PACK);
  ok('an endless floor built on demand is dressed too', deep && Object.values(deep.features).some(ft => ft.type === 'trap'));
  // the fallback: a floor where the ice or the rot would strand you has them taken back out
  let strandedAny = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const a = T.generateDelve(seed, { floors: 8, size: 'small', basePack: T.BUNDLED_PACK });
    a.pack.floors.forEach(f => { if (T.proveSolvable({ floors: [f], items: a.pack.items, endless: true }).errors.some(e => /no way back/.test(e))) strandedAny++; });
  }
  ok('no generated floor, on its own, strands the party', strandedAny === 0, strandedAny);
}

console.log('\n[D12] Ashkeld');
{
  const P = T.BUNDLED_PACK, F = id => P.floors.filter(f => f.id === id)[0];
  ok('pack 4.8.0 or later', P.version >= '4.8.0');
  ok('the shortbow\'s chest at the tower top is trapped with darts', F('f1').features['9,1'].trap === 'darts');
  ok('a flagstone in the gallery rings a bell', F('f1').features['5,1'].type === 'plate' && F('f1').features['5,1'].trap === 'alarm');
  ok('a delver who came before', F('f1').features['4,9'].type === 'remains');
  ok('a wall that is not there, by the shrine', F('f1').features['8,9'].type === 'illusion');
  ok('pillars in the refectory', F('f1').terrain['5,7'] === 'pillars');
  ok('a prisoner in the chief\'s den, and a tinker in the corner', F('f2').features['9,4'].type === 'prisoner' &&
     F('f2').features['10,10'].type === 'merchant');
  ok('a net and a gas vent in the warren', F('f2').features['10,4'].kind === 'net' && F('f2').features['1,8'].kind === 'gas');
  ok('a door into the Lightless Run that does not open back', F('f2').features['1,5'].oneWay === 2);
  ok('the charm behind the vent is not a chest, and still pays out the charm',
     F('f3').features['4,9'].mimic === true && F('f3').features['4,9'].item === 'it.charm.luck');
  ok('a stone scholar with Ashkeld\'s own riddle', F('f3').features['3,3'].riddle && F('f3').features['3,3'].riddle.answers.length === 3);
  ok('a portcullis raised by a plate on the same floor', F('f3').features['2,5'].needsLever === 'pl.dais' &&
     F('f3').features['1,7'].type === 'plate' && F('f3').features['1,7'].id === 'pl.dais');
  ok('the Laboratory\'s bridge has gone rotten', F('f3').terrain['8,7'] === 'rotten');
  const noPlate = clone(P); delete noPlate.floors[2].features['1,7'];
  ok('take the plate away and the validator notices', !T.validatePack(noPlate).ok);
  const NEW = ['trap', 'plate', 'portcullis', 'illusion'].concat(T.NEUTRAL_TYPES);
  ok('every new placement is on open ground, never in rock', P.floors.every(f => Object.keys(f.features).every(k => {
    const [x, y] = k.split(',').map(Number); return NEW.indexOf(f.features[k].type) < 0 || !(f.cells[y * f.w + x] & 16); })));
}

console.log('\n[D13] a mix of a mix');
{
  // chests, timber and plank bridges mix colours twice; that used to give rgb(NaN, ...)
  const hexMix = new Function(src.match(/function hexMix\(a, b, t\) \{[\s\S]*?\n\}/)[0] + '\nreturn hexMix;')();
  ok('a hex and a hex', hexMix('#000000', '#ffffff', 0.5) === 'rgb(128,128,128)');
  ok('a mix of a mix is a colour', hexMix(hexMix('#000000', '#ffffff', 0.5), '#000000', 0.5) === 'rgb(64,64,64)');
  ok('either way round', hexMix('#ffffff', 'rgb(0, 0, 0)', 0.25) === 'rgb(191,191,191)');
}

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

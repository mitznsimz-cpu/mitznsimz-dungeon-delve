// MSDD v4.3 — terrain: the floor's second layer, what it does to feet, eyes,
// spells and fights; the save that now remembers doors, levers, seams and
// cleared rubble; and spells cast between fights.
const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');

function grab(tag) {
  const re = new RegExp('/\\* ==== ' + tag + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + tag + ' END ==== \\*/');
  const mm = src.match(re);
  if (!mm) { console.error('FAIL: ' + tag + ' markers missing'); process.exit(1); }
  return mm[1];
}

const BOOT = grab('BUNDLED PACK') + grab('PACK CORE') +
  '\nvar __L = loadPack(BUNDLED_PACK);' +
  '\nif(!__L.ok){throw new Error("pack invalid: "+__L.errors.join("; "));}\n';

const names = ['TERRAIN', 'TERRAIN_ELEMENTS', 'terrainDef', 'terrainAt', 'terrainBlocks', 'cellIsNarrow',
  'combatGround', 'validatePack', 'validateFloorData', 'proveSolvable', 'packFloor', 'PACK', 'SPELLS', 'ITEMS',
  'MONSTERS', 'BUNDLED_PACK', 'blankFloorState', 'packWorld', 'unpackWorld', 'FLOOR_LISTS',
  'clearTerrain', 'terrainStep', 'sightRange', 'makeRng', 'makeParty', 'grantStartingSpells', 'maxBP', 'maxMP',
  'beginCombat', 'partyAction', 'activeActor', 'advanceCombat', 'makeEncounter', 'foeFront', 'frontRank',
  'meleeTargets', 'engagedParty', 'engagedFoes', 'groundToHit', 'groundElementMult', 'oneFoeAttack',
  'attackRoll', 'fieldSpells', 'fieldTarget', 'fieldNeed', 'castOutside', 'generateDelve', 'extendDelve', 'genReachable',
  'GEN_THEMES', 'themeFor', 'validateFloor', 'makeItem'];
const T = new Function(BOOT + grab('PARTY CORE') + '\n' + grab('SAVE CORE') + '\n' + grab('WORLD CORE') + '\n' +
  grab('GEN CORE') + '\n' + grab('EVENT CORE') + '\n' + grab('COMBAT CORE') + '\n' + grab('TOWN CORE') + '\n' +
  grab('INVENTORY CORE') + '\n' + grab('MAP CORE') + '\nreturn {' + names.join(',') + '};')();

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')); } };
const clone = o => JSON.parse(JSON.stringify(o));

function party(seed, classes) {
  const rg = T.makeRng(seed || 1);
  const p = T.makeParty(rg, (classes || ['fighter', 'fighter', 'mage', 'priest']).map((c, i) =>
    ({ name: ['Bruda', 'Kesh', 'Merl', 'Ansel'][i], class: c })));
  T.grantStartingSpells(p);
  p.forEach(c => { if (!c.equipped.weapon) c.equipped.weapon = { damage: [1, 8, 0], reach: 'melee' }; });
  return p;
}
// a tiny open floor: 4x3, every cell open, outer walls only
function tinyFloor(terrain, features) {
  const W = 4, H = 3, cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = 0; if (y === 0) c |= 1; if (x === W - 1) c |= 2; if (y === H - 1) c |= 4; if (x === 0) c |= 8;
    cells.push(c);
  }
  return { id: 'tf', name: 'Test', depth: 1, w: W, h: H, cells, entry: [0, 1], entryFacing: 1,
           features: features || { '3,1': { type: 'stairsDown', to: 'f1', at: [10, 1] } }, terrain: terrain || {} };
}

console.log('\n[T1] the vocabulary');
const KINDS = ['water', 'embers', 'fog', 'antimagic', 'holy', 'rubble', 'web', 'chasm', 'bridge'];
ok('nine kinds, each named and described', KINDS.every(k => T.TERRAIN[k] && T.TERRAIN[k].name && T.TERRAIN[k].look),
   Object.keys(T.TERRAIN).join(','));
ok('only rubble, webs and chasms block', KINDS.filter(k => T.TERRAIN[k].blocks).sort().join() === 'chasm,rubble,web');
ok('rubble and webs can be cleared, a chasm cannot', !!T.TERRAIN.rubble.clear && !!T.TERRAIN.web.clear &&
   !T.TERRAIN.chasm.clear && T.TERRAIN.chasm.impassable);
ok('elements are fire, cold, lightning, holy', T.TERRAIN_ELEMENTS.join() === 'fire,cold,lightning,holy');

console.log('\n[T2] reading the layer');
const f0 = tinyFloor({ '1,1': 'rubble', '2,1': 'water', '1,0': 'web', '2,2': 'chasm' });
ok('terrainAt finds the kind', T.terrainAt(f0, 2, 1) === 'water' && T.terrainAt(f0, 0, 0) === null);
ok('off the map is nothing', T.terrainAt(f0, -1, 5) === null);
ok('rubble blocks until cleared', T.terrainBlocks(f0, 1, 1, []).blocked && !T.terrainBlocks(f0, 1, 1, ['1,1']).blocked);
ok('a cleared list does not unmake water', T.terrainAt(f0, 2, 1, ['2,1']) === 'water');
ok('a chasm blocks and says it cannot be cleared', (() => { const b = T.terrainBlocks(f0, 2, 2, ['2,2']);
  return b.blocked && b.impassable && !b.clearable; })());
ok('water does not block', !T.terrainBlocks(f0, 2, 1, []).blocked);

console.log('\n[T3] the validator');
const vf = (f) => T.validateFloorData(f, T.PACK);
ok('a clean floor with terrain passes', vf(tinyFloor({ '1,1': 'water', '2,1': 'fog' })).errors.length === 0);
ok('an unknown kind is an error', vf(tinyFloor({ '1,1': 'lava' })).errors.some(e => /lava/.test(e)));
ok('off-map terrain is an error', vf(tinyFloor({ '9,9': 'water' })).errors.some(e => /off the map/.test(e)));
ok('rubble under a feature is an error', vf(tinyFloor({ '3,1': 'rubble' })).errors.some(e => /needs a cell of its own/.test(e)));
ok('blocking terrain on the entry is an error', vf(tinyFloor({ '0,1': 'web' })).errors.some(e => /covers the entry/.test(e)));
ok('water under a feature is fine', vf(tinyFloor({ '3,1': 'water' })).errors.length === 0);
ok('a bridge over nothing is warned about', vf(tinyFloor({ '1,1': 'bridge' })).warnings.some(w => /crosses no chasm/.test(w)));
ok('a bridge over a chasm is not', !vf(tinyFloor({ '1,1': 'bridge', '1,2': 'chasm' })).warnings.some(w => /crosses no chasm/.test(w)));
// a wall of chasm cutting the stairs off
const cut = tinyFloor({ '2,0': 'chasm', '2,1': 'chasm', '2,2': 'chasm' });
ok('a chasm that cuts off the stairs is an error', vf(cut).errors.some(e => /stairsDown/.test(e)));
ok('a bridge in the line puts it right', vf(tinyFloor({ '2,0': 'chasm', '2,1': 'bridge', '2,2': 'chasm' })).errors.length === 0);
ok('chasm cells are not counted as unreachable floor', !vf(tinyFloor({ '1,2': 'chasm', '1,1': 'bridge' })).warnings.some(w => /reachable only/.test(w)));
ok('a spell element outside the four is an error', (() => {
  const p = clone(T.BUNDLED_PACK); p.spells['sp.bolt1'].element = 'acid';
  return T.validatePack(p).errors.some(e => /acid/.test(e)); })());

console.log('\n[T4] the solvability prover');
ok('the bundled pack still proves', T.proveSolvable(T.PACK).ok, T.proveSolvable(T.PACK).errors.join('; '));
ok('a chasm across the only way down fails the proof', (() => {
  const p = clone(T.BUNDLED_PACK);
  const f1 = p.floors[0];
  f1.terrain = f1.terrain || {};
  // ring the stairs at 10,1 with chasm on every open neighbour
  ['9,1', '10,2'].forEach(k => { f1.terrain[k] = 'chasm'; });
  return !T.proveSolvable(p).ok; })());
ok('rubble across the way does not: it can be cleared', (() => {
  const p = clone(T.BUNDLED_PACK);
  ['9,1', '10,2'].forEach(k => { p.floors[0].terrain[k] = 'rubble'; });
  return T.proveSolvable(p).ok; })());

console.log('\n[T5] the bundled pack has ground worth standing on');
const PF = k => T.PACK.floors.filter(f => f.id === k)[0];
ok('pack is 4.3.0 or later', T.PACK.version.split('.').map(Number).reduce(function (a, n) { return a * 100 + n; }, 0) >= 40300, T.PACK.version);
ok('every authored floor has terrain', T.PACK.floors.every(f => Object.keys(f.terrain || {}).length > 0));
ok('the Warren cistern is under water', ['4,9', '5,9', '6,9', '7,9', '8,9'].every(k => PF('f2').terrain[k] === 'water'));
// v4.8: the one bridge has gone rotten, and takes you over once
ok('a rift crosses the Laboratory, with one bridge, and it is rotten', Object.values(PF('f3').terrain).filter(k => k === 'rotten').length === 1 &&
   Object.values(PF('f3').terrain).filter(k => k === 'chasm').length === 3);
ok('fire spells are tagged fire', T.SPELLS['sp.cinder'].element === 'fire' && T.SPELLS['sp.wallfire'].element === 'fire');
ok('the Scroll of Cinders burns as fire', T.ITEMS['it.scroll.fire'].use.element === 'fire');
ok('packFloor carries terrain', Object.keys(T.packFloor('f2').terrain).length === 9);
ok('packFloor carries regions and their map (the look panel was blank in play)',
   Object.keys(T.packFloor('f1').regions).length >= 3 && Object.keys(T.packFloor('f1').regionMap).length > 10);
ok('packFloor carries materials (generated floors wore one stone)', T.packFloor('f2').materials.wall === 'stone.warren');
ok('packFloor carries monsterScale', T.packFloor('f1').monsterScale === 1);
ok('packFloor copies terrain rather than sharing it', (() => { const a = T.packFloor('f2'); a.terrain['1,1'] = 'web';
  return !T.packFloor('f2').terrain['1,1']; })());

console.log('\n[T6] the save remembers doors, levers, seams and cleared ground');
ok('a blank floor state carries every list', T.FLOOR_LISTS.every(k => Array.isArray(T.blankFloorState()[k])));
const w0 = { f1: { explored: { '1,10': 1, '1,9': 1 }, consumed: ['2,2'], opened: ['4,5'], levers: ['lv.grate'],
                   found: ['6,9'], cleared: ['1,6'] } };
const back = T.unpackWorld(clone(T.packWorld(w0, T.PACK)), T.PACK);
ok('opened doors survive a reload', back.f1.opened.join() === '4,5');
ok('thrown levers survive a reload', back.f1.levers.join() === 'lv.grate');
ok('found seams survive a reload', back.f1.found.join() === '6,9');
ok('cleared rubble survives a reload', back.f1.cleared.join() === '1,6');
ok('explored and consumed still do', back.f1.explored['1,9'] === 1 && back.f1.consumed.join() === '2,2');
const old = T.unpackWorld({ f1: { explored: '', consumed: ['2,2'] } }, T.PACK);
ok('an older save loads with empty lists', T.FLOOR_LISTS.every(k => Array.isArray(old.f1[k])) &&
   old.f1.opened.length === 0 && old.f1.consumed.join() === '2,2');

console.log('\n[T7] clearing the way');
{
  const f = tinyFloor({ '1,1': 'rubble', '2,1': 'web' }), world = {};
  const strong = party(3), weak = party(3, ['mage', 'priest', 'mage', 'priest']);
  const r1 = T.clearTerrain(weak, world, f, '1,1', {});
  ok('rubble clears', r1.ok && r1.kind === 'rubble' && world.tf.cleared.join() === '1,1');
  ok('without a fighter it is slow and loud', r1.work === 3 && r1.threat === 8, r1.work + '/' + r1.threat);
  const r2 = T.clearTerrain(strong, {}, f, '1,1', {});
  ok('a fighter shifts it faster and quieter', r2.work === 2 && r2.threat === 4 && /shoulder/.test(r2.notes.join(' ')));
  ok('once cleared there is nothing to clear', !T.clearTerrain(weak, world, f, '1,1', {}).ok);
  const r3 = T.clearTerrain(weak, {}, f, '2,1', { light: 10 });
  ok('a light burns webs quickly and quietly, for some of the light', r3.ok && r3.work === 1 && r3.threat === 1 && r3.lightCost === 4);
  const r4 = T.clearTerrain(weak, {}, f, '2,1', { light: 0 });
  ok('cutting webs by hand is the slower way', r4.ok && r4.work === 2 && r4.threat === 4);
  let ambushes = 0;
  for (let s = 0; s < 400; s++) {
    const r = T.clearTerrain(weak, {}, f, '2,1', { light: 0, rng: T.makeRng(s), spinners: ['mn.tombSpider'] });
    if (r.ambush) ambushes++;
  }
  ok('cut webs sometimes wake what spun them (about a third)', ambushes > 100 && ambushes < 180, ambushes + '/400');
  ok('burnt webs never do', (() => { for (let s = 0; s < 100; s++) {
    if (T.clearTerrain(weak, {}, f, '2,1', { light: 9, rng: T.makeRng(s), spinners: ['mn.tombSpider'] }).ambush) return false; }
    return true; })());
  ok('no spiders on the floor, no ambush', (() => { for (let s = 0; s < 100; s++) {
    if (T.clearTerrain(weak, {}, f, '2,1', { light: 0, rng: T.makeRng(s), spinners: [] }).ambush) return false; }
    return true; })());
  const down = party(3); down.forEach(c => { c.bp = 0; });
  ok('a fallen party cannot clear anything', !T.clearTerrain(down, {}, f, '1,1', {}).ok);
  ok('water is not something to clear', !T.clearTerrain(weak, {}, tinyFloor({ '1,1': 'water' }), '1,1', {}).ok);
}

console.log('\n[T8] what the ground does underfoot');
{
  const p = party(4);
  const before = p.map(c => c.bp);
  let worst = 99;
  for (let s = 0; s < 50; s++) { p.forEach(c => { c.bp = 2; }); T.terrainStep(p, 'embers', T.makeRng(s));
    worst = Math.min(worst, ...p.map(c => c.bp)); }
  ok('embers burn but never fell anyone', worst === 1);
  p.forEach((c, i) => { c.bp = before[i]; });
  const e = T.terrainStep(p, 'embers', T.makeRng(9));
  ok('embers report who was burnt', e.hurt.length === 4 && /coals bite/.test(e.notes.join(' ')));
  const w = T.terrainStep(p, 'water', T.makeRng(9));
  ok('water is loud and finds the light', w.threat === 1 && w.douse === 3 && !w.hurt.length);
  ok('plain stone costs nothing', (() => { const z = T.terrainStep(p, null, T.makeRng(1)); return !z.threat && !z.douse; })());
  ok('fog cuts sight to one square, lantern or not',
     T.sightRange(tinyFloor({ '1,1': 'fog' }), 1, 1, 99, T.PACK.rules) === 1 &&
     T.sightRange(tinyFloor({ '1,1': 'fog' }), 2, 1, 99, T.PACK.rules) === null);
}

console.log('\n[T9] the ground of a fight');
{
  const corridor = { id: 'c', w: 3, h: 1, cells: [1 | 4 | 8, 1 | 4, 1 | 2 | 4], terrain: { '1,0': 'water' } };
  ok('a passage is narrow', T.cellIsNarrow(corridor, 1, 0));
  const g = T.combatGround(corridor, 1, 0, []);
  ok('the ground carries kind, width and modifiers', g.kind === 'water' && g.narrow && g.meleeHit === -1 && g.element.fire === 0.5);
  ok('open plain floor is no ground at all', T.combatGround(tinyFloor({}), 1, 1, []) === null);
  ok('a bridge is narrow even in the open', T.combatGround(tinyFloor({ '1,1': 'bridge', '1,2': 'chasm' }), 1, 1, []).narrow);
}

// a fight with a given ground and a wall of foes
function fight(ground, foeRef, count, seed, classes) {
  const rg = T.makeRng(seed || 5);
  const p = party(seed || 5, classes);
  const foes = [];
  for (let i = 0; i < count; i++) foes.push(...T.makeEncounter(foeRef, rg).slice(0, 1));
  foes.forEach((f, i) => { f.name = f.name + ' ' + 'ABCDEFG'[i]; f.rank = 'front'; });
  const st = T.beginCombat(p, foes, rg, ground);
  return { p, st, rg };
}

console.log('\n[T10] two abreast in a passage');
{
  const narrow = { narrow: true, kind: null };
  const { p, st } = fight(narrow, 'mn.goblin', 4, 11, ['fighter', 'fighter', 'fighter', 'priest']);
  p[2].rank = 'front';
  ok('the start of the fight says so', st.log.some(l => /two abreast/.test(l.text)));
  ok('only two of the party engage', T.engagedParty(p, st).length === 2);
  ok('only two foes can be reached', T.meleeTargets(st).length === 2);
  ok('only two foes press in', T.engagedFoes(st).length === 2);
  // the third fighter tries to swing: refused, and the turn is kept
  st.order = [{ side: 'party', idx: 2 }];
  const ev = T.partyAction(p, st, 'attack', 0, T.makeRng(1));
  ok('a third blade is refused with a reason', ev.some(e => /No room/.test(e.text)));
  ok('and the refusal keeps the turn', T.activeActor(st) === 2);
  // a foe outside the two cannot attack in melee
  const back = st.foes[3], evs = [];
  T.oneFoeAttack(p, st, back, back.attacks[0], T.makeRng(2), evs);
  ok('a foe behind the press cannot close', evs.some(e => /cannot get past/.test(e.text)));
  const front = st.foes[0], evf = [];
  T.oneFoeAttack(p, st, front, front.attacks[0], T.makeRng(2), evf);
  ok('a foe at the front can', !evf.some(e => /cannot get past/.test(e.text)) && evf.length > 0);
  ok('it only ever reaches the two holding the line', (() => {
    const hit = {};
    for (let s = 0; s < 200; s++) { const e2 = []; T.oneFoeAttack(p, st, front, front.attacks[0], T.makeRng(s), e2);
      e2.forEach(x => { p.forEach(c => { if (x.text.indexOf(c.name) >= 0) hit[c.name] = 1; }); });
      p.forEach(c => { c.bp = T.maxBP(c); }); }
    return !hit[p[2].name] && (hit[p[0].name] || hit[p[1].name]); })());
  const open = fight(null, 'mn.goblin', 4, 11, ['fighter', 'fighter', 'fighter', 'priest']);
  open.p[2].rank = 'front';
  ok('in the open, all four foes and three blades engage', T.meleeTargets(open.st).length === 4 &&
     T.engagedParty(open.p, open.st).length === 3);
}

console.log('\n[T11] water, coals, fog, dead air, hallowed ground');
{
  ok('water: -1 to melee, both sides', T.groundToHit({ ground: T.combatGround({ w: 1, h: 1, cells: [15], terrain: { '0,0': 'water' } }, 0, 0) }, 'melee') === -1);
  ok('fog: -2 to ranged', T.groundToHit({ ground: { rangedHit: -2 } }, 'ranged') === -2 && T.groundToHit({ ground: { rangedHit: -2 } }, 'melee') === 0);
  ok('hallowed: the undead are -2 to hit', T.groundToHit({ ground: { undeadHit: -2 } }, 'melee', { traits: ['undead'] }) === -2 &&
     T.groundToHit({ ground: { undeadHit: -2 } }, 'melee', { traits: [] }) === 0);
  ok('fire in water is halved, on coals half again', T.groundElementMult({ ground: T.TERRAIN.water.fight }, 'fire') === 0.5 &&
     T.groundElementMult({ ground: T.TERRAIN.embers.fight }, 'fire') === 1.5);
  ok('an untagged spell is untouched', T.groundElementMult({ ground: T.TERRAIN.water.fight }, undefined) === 1);

  // fire damage measured over many casts: water vs open
  const avg = (ground) => { let tot = 0;
    for (let s = 0; s < 300; s++) {
      const { p, st } = fight(ground, 'mn.clayGolem', 1, 100 + s);
      const mage = p.findIndex(c => c.class === 'mage');
      p[mage].spellsKnown.push('sp.wallfire'); p[mage].mp = 99;
      st.order = [{ side: 'party', idx: mage }];
      const hp = st.foes[0].bp;
      T.partyAction(p, st, 'cast:sp.wallfire', 0, T.makeRng(s));
      tot += hp - st.foes[0].bp;
    }
    return tot / 300; };
  const dry = avg(null), wet = avg(T.combatGround({ w: 1, h: 1, cells: [15], terrain: { '0,0': 'water' } }, 0, 0));
  ok('Wall of Fire does about half in water', wet / dry > 0.4 && wet / dry < 0.6, (wet / dry).toFixed(2));

  const dead = T.combatGround({ w: 1, h: 1, cells: [15], terrain: { '0,0': 'antimagic' } }, 0, 0);
  const { p, st } = fight(dead, 'mn.goblinShaman', 1, 21);
  const mage = p.findIndex(c => c.class === 'mage');
  const mp = p[mage].mp;
  st.order = [{ side: 'party', idx: mage }];
  const ev = T.partyAction(p, st, 'cast:' + p[mage].spellsKnown[0], 0, T.makeRng(3));
  ok('dead air refuses a spell', ev.some(e => /dead air/.test(e.text)));
  ok('without spending it, and the turn is kept', p[mage].mp === mp && T.activeActor(st) === mage);
  const ef = [];
  T.oneFoeAttack(p, st, st.foes[0], st.foes[0].attacks[0], T.makeRng(4), ef);
  ok("a foe caster's working dies too", ef.some(e => /dies in the dead air/.test(e.text)));
  const archer = fight(dead, 'mn.goblinArcher', 1, 22), ea = [];
  T.oneFoeAttack(archer.p, archer.st, archer.st.foes[0], archer.st.foes[0].attacks[0], T.makeRng(4), ea);
  ok('an archer is not a caster: arrows still fly', !ea.some(e => /dead air/.test(e.text)));

  // Turn Undead on hallowed ground
  const holy = T.combatGround({ w: 1, h: 1, cells: [15], terrain: { '0,0': 'holy' } }, 0, 0);
  const routs = (ground) => { let n = 0;
    for (let s = 0; s < 120; s++) {
      const r = fight(ground, 'mn.boneKnight', 1, 300 + s, ['fighter', 'fighter', 'priest', 'priest']);
      const pr = r.p.findIndex(c => c.class === 'priest');
      r.p[pr].spellsKnown.push('sp.turn'); r.p[pr].mp = 99; r.p[pr].level = 4;
      r.st.order = [{ side: 'party', idx: pr }];
      T.partyAction(r.p, r.st, 'cast:sp.turn', 0, T.makeRng(s));
      if (r.st.foes[0].turned) n++;
    }
    return n; };
  const plain = routs(null), blessed = routs(holy);
  ok('hallowed ground lets a priest turn what they could not', blessed > plain, plain + ' -> ' + blessed);
}

console.log('\n[T12] spells between fights');
{
  const p = party(31);
  const mage = p.findIndex(c => c.class === 'mage'), priest = p.findIndex(c => c.class === 'priest');
  p[mage].spellsKnown = ['sp.bolt1', 'sp.light'];
  p[priest].spellsKnown = ['sp.mend1', 'sp.sanct', 'sp.bless', 'sp.revive', 'sp.cure'];
  ok('field spells are the ones that make sense out of a fight',
     T.fieldSpells(p[mage]).join() === 'sp.light' &&
     T.fieldSpells(p[priest]).sort().join() === 'sp.cure,sp.mend1,sp.revive,sp.sanct');
  p[0].bp = 1; p[priest].mp = 40;
  ok('the mender aims at whoever is hurt most', T.fieldTarget(p, 'sp.mend1') === 0);
  const r = T.castOutside(p, priest, 'sp.mend1', null, T.makeRng(1), {});
  ok('Mend Wounds heals between fights', r.ok && p[0].bp > 1 && p[priest].mp === 40 - T.SPELLS['sp.mend1'].mp);
  ok('Lantern Light gives light', (() => { p[mage].mp = 10; const l = T.castOutside(p, mage, 'sp.light', null, T.makeRng(1), {});
    return l.ok && l.light === 60; })());
  ok('Sanctuary calms the dark', (() => { const s = T.castOutside(p, priest, 'sp.sanct', null, T.makeRng(1), {});
    return s.ok && s.threat === -60; })());
  ok('a fight-only spell is refused', !T.castOutside(p, mage, 'sp.bolt1', null, T.makeRng(1), {}).ok);
  ok('dead air refuses them too', (() => { const mp = p[priest].mp;
    const d = T.castOutside(p, priest, 'sp.mend1', 0, T.makeRng(1), { noCast: true });
    return !d.ok && /dead air/.test(d.notes[0]) && p[priest].mp === mp; })());
  p[1].bp = 0; p[1].status.push('down');
  ok('Call Them Back works between fights', (() => { p[priest].mp = 40;
    const v = T.castOutside(p, priest, 'sp.revive', 1, T.makeRng(1), {});
    return v.ok && p[1].bp > 0 && p[1].status.indexOf('down') < 0; })());
  ok('an unhurt target is refused, not charged', (() => { p.forEach(c => { c.bp = T.maxBP(c); }); const mp = p[priest].mp;
    const u = T.castOutside(p, priest, 'sp.mend1', 0, T.makeRng(1), {}); return !u.ok && p[priest].mp === mp; })());
  ok('a spell nobody needs is greyed out', (() => { p.forEach(c => { c.bp = T.maxBP(c); c.status = []; });
    return !T.fieldNeed(p, 'sp.mend1') && !T.fieldNeed(p, 'sp.cure') && !T.fieldNeed(p, 'sp.revive') && T.fieldNeed(p, 'sp.light'); })());
  ok('and lit again when someone does', (() => { p[2].status.push('poisoned'); p[0].bp = 1;
    return T.fieldNeed(p, 'sp.cure') && T.fieldNeed(p, 'sp.mend1'); })());
  ok('not enough magic, no spell', (() => { p[0].bp = 1; p[priest].mp = 0; return !T.castOutside(p, priest, 'sp.mend1', 0, T.makeRng(1), {}).ok; })());
}

console.log('\n[T13] generated delves carry their theme\'s ground');
{
  const base = T.BUNDLED_PACK;
  const counts = {};
  let allValid = true, allProve = true, any = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const r = T.generateDelve(seed, { floors: 6, size: 'medium', basePack: base });
    if (!r.ok) { allValid = false; continue; }
    if (!T.proveSolvable(r.pack).ok) allProve = false;
    r.pack.floors.forEach(f => { Object.values(f.terrain || {}).forEach(k => { counts[k] = (counts[k] || 0) + 1; any++; }); });
  }
  ok('every generated delve is valid and proven', allValid && allProve);
  ok('they have terrain', any > 50, any);
  ok('every kind turns up somewhere', KINDS.every(k => counts[k] > 0), JSON.stringify(counts));
  const a = T.generateDelve(77, { floors: 4, basePack: base }), b = T.generateDelve(77, { floors: 4, basePack: base });
  ok('the same seed gives the same ground', JSON.stringify(a.pack.floors.map(f => f.terrain)) ===
                                            JSON.stringify(b.pack.floors.map(f => f.terrain)));
  // v4.8's dressing reads the ground (it keeps off it), so both sides leave it out here
  const a0 = T.generateDelve(77, { floors: 4, basePack: base, cfg: { dressing: false } });
  const c = T.generateDelve(77, { floors: 4, basePack: base, cfg: { terrain: false, dressing: false } });
  ok('terrain leaves the layout a seed makes exactly as it was', JSON.stringify(a0.pack.floors.map(f => [f.cells, f.features])) ===
                                                                   JSON.stringify(c.pack.floors.map(f => [f.cells, f.features])));
  ok('and without it there is none', c.pack.floors.every(f => !f.terrain || !Object.keys(f.terrain).length));
  const deep = T.generateDelve(5, { floors: 3, basePack: base, endless: true });
  const g9 = T.extendDelve(deep.pack, 9, base);
  ok('an endless floor built on demand has ground too', g9 && Object.keys(g9.terrain || {}).length > 0);
  ok('the ground follows the theme', (() => { let good = true;
    for (let seed = 1; seed <= 6; seed++) { const r = T.generateDelve(seed, { floors: 6, basePack: base });
      r.pack.floors.forEach(f => { const th = T.themeFor(f.depth).terrain;
        // v4.8: pillars anywhere, rot where a bridge was, ice only where there is water
        const allowed = th.concat(['bridge', 'rotten', 'pillars'], th.indexOf('water') >= 0 ? ['ice'] : []);
        Object.values(f.terrain || {}).forEach(k => { if (allowed.indexOf(k) < 0) good = false; }); }); }
    return good; })());
  ok('blocking ground never sits on a feature or the entry', (() => { let good = true;
    for (let seed = 1; seed <= 8; seed++) { const r = T.generateDelve(seed, { floors: 6, basePack: base });
      r.pack.floors.forEach(f => Object.keys(f.terrain || {}).forEach(k => {
        if (T.TERRAIN[f.terrain[k]].blocks && (f.features[k] || k === f.entry.join(','))) good = false; })); }
    return good; })());
}

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' \u2014 ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

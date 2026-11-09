// MSDD v4.4 — the campaign: saves that keep everything (trinkets, depth, a
// generated delve's recipe, retired heroes), whole-save files, the shop by
// depth, one-tap rest and restock, retiring a hero, and banter in a fight.
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
const names = ['PACK', 'ITEMS', 'SHOP_STOCK', 'BARKS', 'BUNDLED_PACK', 'validatePack', 'makeRng', 'makeParty',
  'makeCharacter', 'grantStartingSpells', 'grantStartingSkills', 'startingKit', 'maxBP', 'maxMP', 'makeItem',
  'serialise', 'deserialise', 'wrapSaveFile', 'unwrapSaveFile', 'SAVE_FILE_FORMAT', 'describeSave',
  'generateDelve', 'extendDelve', 'delvePrint', 'GEN_VERSION', 'itemShopFrom', 'shopStockFor', 'shopHeldBack',
  'doBuy', 'restockParty', 'restCost', 'retireHero', 'canUse', 'sellValue', 'PACK_LIMIT', 'beginCombat',
  'partyAction', 'makeEncounter', 'banterSnapshot', 'combatBanter', 'BANTER_ODDS', 'packWorld', 'rollStats'];
const T = new Function(BOOT + grab('PARTY CORE') + '\n' + grab('SAVE CORE') + '\n' + grab('WORLD CORE') + '\n' +
  grab('GEN CORE') + '\n' + grab('EVENT CORE') + '\n' + grab('COMBAT CORE') + '\n' + grab('TOWN CORE') + '\n' +
  grab('INVENTORY CORE') + '\nreturn {' + names.join(',') + '};')();

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')); } };
const clone = o => JSON.parse(JSON.stringify(o));

function party(seed, classes) {
  const rg = T.makeRng(seed || 1);
  const p = T.makeParty(rg, (classes || ['fighter', 'fighter', 'mage', 'priest']).map((c, i) =>
    ({ name: ['Bruda', 'Kesh', 'Merl', 'Ansel'][i], class: c })));
  T.grantStartingSpells(p);
  T.startingKit(p);
  p.forEach((c, i) => { c.archetype = ['stoic', 'brash', 'curious', 'kind'][i]; });
  return p;
}
function state(p, extra) {
  return Object.assign({ packId: T.PACK.id, packVersion: T.PACK.version, slotName: 'The Long Descent',
    playtimeSec: 600, worldSeed: 7, actionRngState: 9, gold: 120, threat: 5, lightTurns: 0,
    position: { floor: 'f1', x: 1, y: 10, facing: 0 }, party: p, world: {}, questFlags: {} }, extra || {});
}

console.log('\n[K1] the save keeps what it used to drop');
{
  const p = party(2);
  p[0].equipped.trinket = T.makeItem('it.ring.ward');
  const blob = clone(T.serialise(state(p, { deepest: 3, retired: [{ name: 'Old Tam', class: 'fighter', level: 6 }] })));
  const back = T.deserialise(blob, { packId: T.PACK.id });
  ok('a save still loads', back.ok, back.notes.join(' '));
  ok('a worn ring survives the reload (it vanished before v4.4)',
     back.state.party[0].equipped.trinket && back.state.party[0].equipped.trinket.ref === 'it.ring.ward');
  ok('and still counts toward defence', (() => { const bare = clone(blob); bare.party[0].equipped.trinket = null;
    const nb = T.deserialise(bare, { packId: T.PACK.id });
    return back.state.party[0].armorBonus - nb.state.party[0].armorBonus === T.ITEMS['it.ring.ward'].defenseBonus; })());
  ok('how deep the party has been is kept', back.state.deepest === 3);
  ok('the retired are kept', back.state.retired.length === 1 && back.state.retired[0].name === 'Old Tam');
  ok('the campaign name is kept', back.state.slotName === 'The Long Descent' && T.describeSave(blob).name === 'The Long Descent');
  const old = clone(blob); delete old.deepest; delete old.retired; delete old.generated;
  const ob = T.deserialise(old, { packId: T.PACK.id });
  ok('an older save loads with sensible defaults', ob.ok && ob.state.deepest === 1 && ob.state.retired.length === 0 && ob.state.generated === null);
  ok('the retired list is capped', clone(T.serialise(state(p, { retired: new Array(60).fill({ name: 'x' }) }))).retired.length === 40);
  ok('describeSave refuses a save with no party rather than throwing', T.describeSave({ party: [] }) === null && T.describeSave({}) === null);
}

console.log('\n[K2] a whole game as a file');
{
  const blob = clone(T.serialise(state(party(3))));
  const file = clone(T.wrapSaveFile(blob, null, '2026-11-08T00:00:00Z'));
  const u = T.unwrapSaveFile(file);
  ok('wrap and unwrap give the save back', u.ok && JSON.stringify(u.save) === JSON.stringify(blob) && u.pack === null);
  ok('the file says what it is', file.msddSave === T.SAVE_FILE_FORMAT && file.exportedAt === '2026-11-08T00:00:00Z');
  const withPack = T.unwrapSaveFile(clone(T.wrapSaveFile(blob, { id: 'my.pack', name: 'Mine' })));
  ok('a pack the game cannot rebuild travels with it', withPack.ok && withPack.pack.id === 'my.pack');
  ok('a bare save blob is accepted too', T.unwrapSaveFile(blob).ok);
  ok('a party file is pointed at the roster', /party file/.test(T.unwrapSaveFile({ exportFormat: 1, party: [] }).notes[0]));
  ok('a newer save file is refused', !T.unwrapSaveFile({ msddSave: 99, save: blob }).ok);
  ok('nonsense is refused', !T.unwrapSaveFile({ hello: 1 }).ok && !T.unwrapSaveFile(null).ok && !T.unwrapSaveFile({ msddSave: 1 }).ok);
}

console.log('\n[K3] a generated delve carries its recipe, and builds again the same');
{
  const a = T.generateDelve(4242, { floors: 4, size: 'small', endless: true, basePack: T.BUNDLED_PACK });
  ok('the recipe is recorded', a.ok && a.pack.generated.seed === 4242 && a.pack.generated.floors === 4 &&
     a.pack.generated.size === 'small' && a.pack.generated.endless === true && a.pack.generated.gen === T.GEN_VERSION);
  ok('with a fingerprint of its first floor', /^[0-9a-f]{8}$/.test(a.pack.generated.print));
  const g = a.pack.generated;
  const b = T.generateDelve(g.seed, { floors: g.floors, size: g.size, endless: g.endless, basePack: T.BUNDLED_PACK });
  ok('building it again from the recipe gives the same fingerprint', T.delvePrint(b.pack) === g.print);
  ok('and the same floors, cell for cell', JSON.stringify(a.pack.floors) === JSON.stringify(b.pack.floors));
  const c = T.generateDelve(4243, { floors: 4, size: 'small', endless: true, basePack: T.BUNDLED_PACK });
  ok('another seed has another fingerprint', T.delvePrint(c.pack) !== g.print);
  // floors built on demand come out the same both times
  const e1 = T.extendDelve(a.pack, 5, T.BUNDLED_PACK), e2 = T.extendDelve(b.pack, 5, T.BUNDLED_PACK);
  ok('a deeper floor built on demand is the same both times', JSON.stringify(e1.cells) === JSON.stringify(e2.cells) &&
     JSON.stringify(e1.terrain) === JSON.stringify(e2.terrain));
  const sv = clone(T.serialise(state(party(4), { packId: a.pack.id, generated: g })));
  ok('the save carries the recipe', sv.generated.seed === 4242 && sv.generated.print === g.print);
}

console.log('\n[K4] Simz opens the back shelf as you go deeper');
{
  const s1 = T.shopStockFor(1), s3 = T.shopStockFor(3);
  ok('floor 1 has the basics', s1.indexOf('it.potion') >= 0 && s1.indexOf('it.torch') >= 0 && s1.indexOf('it.shortsword') >= 0);
  ok('but not plate or the strong draughts', s1.indexOf('it.plate') < 0 && s1.indexOf('it.potion3') < 0 && s1.indexOf('it.potion2') < 0);
  ok('floor 2 brings out the middle shelf', T.shopStockFor(2).indexOf('it.potion2') >= 0 && T.shopStockFor(2).indexOf('it.plate') < 0);
  ok('by floor 3 everything is out', s3.length === T.SHOP_STOCK.length && T.shopHeldBack(3).length === 0);
  ok('the held-back list is the rest', T.shopHeldBack(1).length + s1.length === T.SHOP_STOCK.length);
  const p = party(5);
  ok('buying from the back shelf too early is refused', !T.doBuy(p[0], 'it.plate', 9999, { deepest: 1 }).ok);
  ok('once deep enough it sells', T.doBuy(p[0], 'it.plate', 9999, { deepest: 3 }).ok);
  ok('a full pack is refused when the limit is given', (() => { const q = party(6); q[0].pack = new Array(8).fill(T.makeItem('it.torch'));
    return !T.doBuy(q[0], 'it.potion', 999, { deepest: 1, packLimit: 8 }).ok; })());
  ok('older callers without a context still buy', T.doBuy(party(7)[0], 'it.potion', 999).ok);
  ok('shopFrom must be a floor number', (() => { const pk = clone(T.BUNDLED_PACK); pk.items['it.potion'].shopFrom = 0;
    return T.validatePack(pk).errors.some(e => /shopFrom/.test(e)); })());
}

console.log('\n[K5] one tap: rest and restock');
{
  const p = party(8);
  p.forEach(c => { c.pack = []; });
  p[0].bp = 3; p[2].mp = 0;
  const r = T.restockParty(p, 500, { deepest: 1, packLimit: 8 });
  const count = kind => p.reduce((n, c) => n + c.pack.filter(it => it.use && it.use.kind === kind).length, 0);
  ok('everyone is tended', p.every(c => c.bp === T.maxBP(c) && c.mp === T.maxMP(c)));
  ok('each member carries a healing draught', p.every(c => c.pack.some(it => it.use && it.use.kind === 'heal')));
  ok('each caster carries a magic draught', p.filter(c => T.maxMP(c) > 0).every(c => c.pack.some(it => it.use && it.use.kind === 'restoreMp')));
  ok('and the party carries two lights', count('light') === 2);
  ok('the cheapest on the shelf, not the best', p[0].pack.some(it => it.ref === 'it.potion'));
  ok('it says what it spent', r.ok && r.spent === 500 - r.gold && /Simz packs/.test(r.notes.join(' ')));
  const again = T.restockParty(p, r.gold, { deepest: 1, packLimit: 8 });
  ok('a second tap does nothing', again.nothing && again.spent === 0);
  const down = party(9); down.forEach(c => { c.pack = []; }); down[1].bp = 0; down[1].status.push('down');
  const rv = T.restockParty(down, 500, { deepest: 1 });
  ok('the fallen are revived first, then tended', down[1].bp === T.maxBP(down[1]) && /breathe again/.test(rv.notes[0]));
  const poor = party(10); poor.forEach(c => { c.pack = []; }); poor[0].bp = 1;
  const pr = T.restockParty(poor, 30, { deepest: 1 });
  ok('a thin purse buys what it can and names what it could not', pr.gold >= 0 && pr.short.length > 0);
  const full = party(11); full.forEach(c => { c.pack = new Array(8).fill(T.makeItem('it.dagger')); });
  T.restockParty(full, 999, { deepest: 1, packLimit: 8 });
  ok('it never overfills a pack', full.every(c => c.pack.length <= 8));
  ok('it does not spend money that is not there', (() => { const q = party(12); q.forEach(c => { c.pack = []; c.bp = 1; });
    const z = T.restockParty(q, 0, { deepest: 1 }); return z.gold === 0 && z.spent === 0 && !z.ok; })());
}

console.log('\n[K6] retiring a hero');
{
  const p = party(13);
  p[0].level = 7; p[0].xp = 5000; p[0].rank = 'front'; p[0].position = 1;
  p[0].equipped.trinket = T.makeItem('it.ring.ward');
  p[0].equipped.armor = T.makeItem('it.chainmail');
  p[0].pack = [T.makeItem('it.potion'), T.makeItem('it.torch')];
  const st = T.rollStats(T.makeRng(77));
  st.int = 15; st.pie = 15; st.str = 12;
  const rec = T.makeCharacter('Wenna', 'mage', st, 'kind', 'female');
  T.grantStartingSpells([rec]); T.startingKit([rec]);
  const r = T.retireHero(p, 0, rec, 100, '2026-11-08T12:00:00Z');
  ok('the recruit takes the place in the line', r.ok && p[0] === rec && rec.rank === 'front' && rec.position === 1);
  ok('the one who retires is recorded', r.retired.name === 'Bruda' && r.retired.level === 7 && r.retired.class === 'fighter' &&
     r.retired.retiredAt === '2026-11-08T12:00:00Z');
  ok('gear the recruit can use is worn', rec.equipped.trinket && rec.equipped.trinket.ref === 'it.ring.ward');
  ok('gear they cannot is carried, not lost', rec.pack.some(it => it.ref === 'it.chainmail') && rec.pack.some(it => it.ref === 'it.potion'));
  ok('the others are untouched', p[1].name === 'Kesh' && p.length === 4);
  const q = party(14);
  q[0].pack = new Array(8).fill(0).map(() => T.makeItem('it.longsword'));
  const rec2 = T.makeCharacter('Hob', 'fighter', T.rollStats(T.makeRng(5)), 'brash', 'male');
  T.startingKit([rec2]);
  const before = 50, r2 = T.retireHero(q, 0, rec2, before, null);
  ok('what will not fit is sold to Simz', r2.gold > before && rec2.pack.length <= 8 && /Simz takes/.test(r2.notes.join(' ')));
  ok('a recruit with no calling is refused', !T.retireHero(party(15), 0, { class: 'nope' }, 0).ok);
}

console.log('\n[K7] banter in a fight');
{
  ok('the pack has kill, crit and close lines for every temperament',
     ['stoic', 'brash', 'curious', 'kind'].every(a => ['kill', 'crit', 'close'].every(t => (T.BARKS[a][t] || []).length >= 3)));
  ok('and the validator is satisfied', !T.validatePack(clone(T.BUNDLED_PACK)).warnings.some(w => /Barks missing/.test(w)));
  const rg = T.makeRng(5), p = party(16);
  const st = T.beginCombat(p, T.makeEncounter('mn.goblin', rg).slice(0, 1), rg, null);
  const snap = T.banterSnapshot(p, st);
  st.foes[0].bp = 0;
  st.log.push({ kind: 'kill', text: 'Goblin goes down.' });
  const ev = T.combatBanter(p, st, snap, 0, () => 0);
  ok('a killing blow can draw a line from whoever struck it', ev && ev.who === 'Bruda' && ev.trigger === 'kill' &&
     T.BARKS.stoic.kill.some(l => ev.text.indexOf(l) >= 0));
  ok('it goes into the fight log', st.log[st.log.length - 1] === ev && ev.kind === 'say');
  ok('only one line a round', T.combatBanter(p, st, snap, 0, () => 0) === null);
  st.round++;
  const s2 = T.banterSnapshot(p, st);
  p[1].bp = 1;
  const e2 = T.combatBanter(p, st, s2, null, () => 0);
  ok('someone brought near to falling says so', e2 && e2.who === 'Kesh' && e2.trigger === 'close');
  st.round++;
  const s3 = T.banterSnapshot(p, st);
  ok('nothing happened, nothing said', T.combatBanter(p, st, s3, 0, () => 0) === null);
  ok('and not every time: the odds hold it back', T.combatBanter(p, st, T.banterSnapshot(p, st), null, () => 0.99) === null);
  let said = 0;
  for (let s = 0; s < 300; s++) {
    const r3 = T.makeRng(s), q = party(17);
    const f = T.beginCombat(q, T.makeEncounter('mn.goblin', r3).slice(0, 1), r3, null);
    const sn = T.banterSnapshot(q, f); f.foes[0].bp = 0;
    if (T.combatBanter(q, f, sn, 0, r3)) said++;
  }
  ok('a kill draws a line about ' + Math.round(T.BANTER_ODDS.kill * 100) + '% of the time', said > 90 && said < 150, said + '/300');
}

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' \u2014 ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

// v5.5 "One more run": the run record, unlocks, class variants, loot rarities,
// and the seed-picked zones of a delve. Reads the RUN CORE and the cores it leans on.
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
const names = ['makeRng', 'makeCharacter', 'maxBP', 'maxMP', 'defense', 'meleeToHit', 'varBonus', 'ITEMS',
  'makeItem', 'itemLabel', 'sellValue', 'doIdentify', 'equipItem', 'rollFind', 'gearPool', 'RARITY', 'FIND',
  'VARIANTS', 'UNLOCKS', 'RUN_BONUS_DEPTH', 'STRANGE_ZONES', 'emptyMeta', 'cleanMeta', 'hasUnlock', 'recordRun',
  'unlockedVariants', 'metaKit', 'delveZones', 'pickZone', 'blowText', 'runLines', 'serialise', 'deserialise', 'CLASSES', 'validPortal', 'describeWhere', 'unequipItem', 'canUse', 'SHOP_STOCK', 'itemShopFrom'];
const T = new Function(BOOT + grab('PARTY CORE') + '\n' + grab('COMBAT CORE') + '\n' + grab('SAVE CORE') + '\n' +
  grab('WORLD CORE') + '\n' + grab('EVENT CORE') + '\n' + grab('TOWN CORE') + '\n' + grab('RUN CORE') +
  '\nreturn {' + names.join(',') + '};')();

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')); } };
const stats = { str: 13, dex: 12, con: 12, int: 13, pie: 13 };

console.log('\n[U1] every run that ends unlocks something, in order');
let meta = T.emptyMeta(), seen = [];
for (let k = 0; k < 3; k++) {
  const r = T.recordRun(meta, { depth: 1, kills: 2, gold: 30 });
  ok('run ' + (k + 1) + ' unlocks one thing', r.gained.length === 1, r.gained.length);
  seen = seen.concat(r.gained.map(u => u.id));
  meta = r.meta;
}
ok('three runs, three different unlocks', new Set(seen).size === 3, seen.join(','));
ok('the first three cover kit, a variant and a floor theme',
   ['kit', 'variant', 'zone'].every(k => seen.some(id => T.UNLOCKS.find(u => u.id === id).kind === k)), seen.join(','));
ok('runs counted', meta.runs === 3, meta.runs);
const deep = T.recordRun(meta, { depth: T.RUN_BONUS_DEPTH, kills: 40, gold: 900 });
ok('a run to floor ' + T.RUN_BONUS_DEPTH + ' unlocks two', deep.gained.length === 2, deep.gained.length);
ok('and is a best yet', deep.best.indexOf('depth') >= 0 && deep.best.indexOf('gold') >= 0, deep.best.join(','));
ok('the record does not change the one it was given', meta.unlocked.length === 3);
let full = T.emptyMeta();
for (let k = 0; k < 20; k++) full = T.recordRun(full, { depth: 1 }).meta;
ok('everything unlocks in the end', full.unlocked.length === T.UNLOCKS.length, full.unlocked.length);
ok('after that, a run unlocks nothing and does not fail', T.recordRun(full, { depth: 9 }).gained.length === 0);

console.log('\n[U2] the record survives bad storage');
ok('null is a fresh record', T.cleanMeta(null).runs === 0 && T.cleanMeta(null).unlocked.length === 0);
const junk = T.cleanMeta({ runs: 'x', unlocked: ['kit.delver', 'no.such'], best: { depth: -4, gold: '12' } });
ok('unknown unlocks dropped', junk.unlocked.join() === 'kit.delver', junk.unlocked.join());
ok('numbers made sane', junk.runs === 0 && junk.best.depth === 0 && junk.best.gold === 12, JSON.stringify(junk));
ok('every unlock names a real variant or item', T.UNLOCKS.every(u =>
  (u.kind !== 'variant' || T.VARIANTS[u.variant]) && (u.kit || []).every(ref => T.ITEMS[ref])));
ok('every variant has an unlock', Object.keys(T.VARIANTS).every(v => T.UNLOCKS.some(u => u.variant === v)));
ok('every variant is for a real class', Object.values(T.VARIANTS).every(v => T.CLASSES[v.class]));

console.log('\n[U3] starting kit and variants follow the record');
const kit0 = T.metaKit(T.emptyMeta()), kit1 = T.metaKit(full);
ok('nothing unlocked, no kit', kit0.items.length === 0 && kit0.gold === 0);
ok('all unlocked: the pack and the purse', kit1.items.length >= 4 && kit1.gold === 60, JSON.stringify(kit1));
ok('no variant for a fresh player', T.unlockedVariants(T.emptyMeta(), 'fighter').length === 0);
ok('the Vanguard for the fighter, once unlocked', T.unlockedVariants(full, 'fighter').map(v => v.id).join() === 'vanguard');
ok('not for a wizard', T.unlockedVariants(full, 'mage').every(v => v.class === 'mage'));

console.log('\n[U4] a variant shades the numbers, and only for its class');
const f0 = T.makeCharacter('A', 'fighter', stats), f1 = T.makeCharacter('B', 'fighter', stats);
f1.variant = 'vanguard';
ok('Vanguard: +1 defence', T.defense(f1) === T.defense(f0) + 1, T.defense(f0) + ' ' + T.defense(f1));
ok('Vanguard: -1 to hit', T.meleeToHit(f1) === T.meleeToHit(f0) - 1);
const m0 = T.makeCharacter('C', 'mage', stats), m1 = T.makeCharacter('D', 'mage', stats);
m1.variant = 'hedgewitch';
ok('Hedge Witch: 3 more magic', T.maxMP(m1) === T.maxMP(m0) + 3, T.maxMP(m0) + ' ' + T.maxMP(m1));
ok('Hedge Witch: 2 less body, never below the level', T.maxBP(m1) === Math.max(1, T.maxBP(m0) - 2));
const wrong = T.makeCharacter('E', 'priest', stats); wrong.variant = 'vanguard';
ok('a variant on the wrong class does nothing', T.varBonus(wrong, 'def') === 0);
const p0 = T.makeCharacter('F', 'priest', stats), p1 = T.makeCharacter('G', 'priest', stats); p1.variant = 'warpriest';
ok('War Priest never has negative magic', T.maxMP(p1) >= 0 && T.maxMP(p1) === Math.max(0, T.maxMP(p0) - 2));

console.log('\n[U5] finds: rarities, unidentified until looked at');
let found = 0, fine = 0, master = 0, plain = 0, known = 0, chests = 6000;
const rng = T.makeRng(77);
for (let k = 0; k < chests; k++) {
  const it = T.rollFind(rng, 1 + (k % 8));
  if (!it) continue;
  found++;
  if (it.rarity === 'fine') { fine++; if (it.bonus !== 1) known = -999; }
  else if (it.rarity === 'master') { master++; if (it.bonus !== 2) known = -999; }
  else plain++;
  if (it.rarity && !it.unknown) known = -999;
  if (!it.rarity && it.unknown && it.slot !== 'trinket') known = -999;
}
const rate = found / chests;
ok('about one plain chest in six holds kit', rate > 0.12 && rate < 0.2, rate.toFixed(3));
ok('fine and masterwork both turn up', fine > 0 && master > 0 && plain > 0, fine + '/' + master + '/' + plain);
ok('a fine piece is +1, a masterwork +2, and both come unidentified', known === 0);
ok('the same seed finds the same thing', JSON.stringify(T.rollFind(T.makeRng(5), 3)) === JSON.stringify(T.rollFind(T.makeRng(5), 3)));
ok('the gear on offer grows with depth', T.gearPool(1).length < T.gearPool(4).length, T.gearPool(1).length + ' ' + T.gearPool(4).length);
ok('never a quest item or a cursed one', T.gearPool(9).every(k => !(T.ITEMS[k].flags || []).length && !T.ITEMS[k].cursed));
// six to seven chests a floor, roughly: a run of three floors should see a couple unidentified
let trinkets = 0; { const r2 = T.makeRng(77); for (let k = 0; k < chests; k++) { const it = T.rollFind(r2, 1 + (k % 8)); if (it && it.slot === 'trinket') trinkets++; } }
const perRun = 3 * 6.5 * rate * (fine + master + trinkets) / found;      // v7.2: found trinkets come unidentified too
ok('a three-floor run finds a couple of unidentified pieces', perRun >= 1.5 && perRun <= 3.5, perRun.toFixed(2));

const sword = T.makeItem('it.longsword'); sword.rarity = 'master'; sword.bonus = 2; sword.unknown = true;
ok('unidentified, it shows as plain kit', T.itemLabel(sword) === 'Unidentified weapon', T.itemLabel(sword));
ok('and Simz pays 10 for it', T.sellValue(sword) === 10);
const fighter = T.makeCharacter('H', 'fighter', stats); fighter.pack = [sword];
const idr = T.doIdentify(fighter, 0, 100);
ok('identifying costs gold and names it', idr.ok && idr.gold < 100 && /Masterwork Long Sword \+2/.test(idr.notes[0]), idr.notes[0]);
ok('identified, it sells for more than a plain one', T.sellValue(sword) > T.sellValue(T.makeItem('it.longsword')));
const axe = T.makeItem('it.mace'); axe.rarity = 'fine'; axe.bonus = 1; axe.unknown = true;
const priest = T.makeCharacter('I', 'priest', stats); priest.pack = [axe];
const eq = T.equipItem(priest, 0);
ok('wearing it is the other way to find out', eq.ok && !axe.unknown && /Fine Mace \+1/.test(eq.notes.join(' ')), eq.notes.join(' '));

console.log('\n[U6] seed-picked zones');
const zs = new Set();
for (let s = 1; s <= 40; s++) zs.add(T.pickZone(['sunken', 'frost'], s * 7919, 1));
ok('different seeds pick both of a theme\'s zones', zs.size === 2, [...zs].join());
ok('the same seed and depth always pick the same', T.pickZone(['a', 'b', 'c'], 99, 4) === T.pickZone(['a', 'b', 'c'], 99, 4));
ok('no stranger stone for a fresh player', T.delveZones(0, ['sunken', 'frost'], T.emptyMeta()).length === 2);
ok('stranger stone adds one', T.delveZones(0, ['sunken', 'frost'], full).length === 3);
const MAT = fs.readFileSync('./msdd_materials.js', 'utf8');
ok('every stranger zone exists', T.STRANGE_ZONES.every(z => new RegExp('\\n\\s+' + z + ':\\s+Z\\(').test(MAT)), T.STRANGE_ZONES.join());

console.log('\n[U7] the summary');
ok('how it ended, from the killing blow',
   T.blowText({ blow: { by: 'Goblin Chief', with: 'iron axe', who: 'Kesh' } }) === 'Kesh fell last, to a Goblin Chief\u2019s iron axe.',
   T.blowText({ blow: { by: 'Goblin Chief', with: 'iron axe', who: 'Kesh' } }));
ok('a named boss takes no article', /to The Shade of Ashkeld/.test(T.blowText({ blow: { by: 'The Shade of Ashkeld', with: 'withering touch', who: 'Merl', tell: true } })));
ok('an Orc takes "an"', /to an Orc Raider/.test(T.blowText({ blow: { by: 'Orc Raider', with: 'cleaver', who: 'Ansel' } })));
ok('no blow recorded: still a sentence', /party/.test(T.blowText({})));
ok('four lines: floor, foes, gold, kit', T.runLines({ depth: 3, kills: 9, gold: 120, finds: 1 }).map(l => l[1]).join() === '3,9,120,1');

console.log('\n[U8] the page: card, record and saves');
ok('the card is on the page', /<div id="runEnd"/.test(src) && /id="runAgain"/.test(src) && /id="runWake"/.test(src));
ok('the record is kept apart from the saves', /msdd_meta/.test(src));
ok('an endless wipe ends the run', /if \(PACK\.endless\) endRun\(cst\.lastDown\)/.test(src));
ok('the killing blow is noted where a hero falls', (src.match(/st\.lastDown = \{/g) || []).length >= 2);
ok('a run in progress is saved', /run: RUN,/.test(src) && /RUN = st\.run \|\| null/.test(src));
ok('a variant is saved', /variant: c\.variant \|\| null/.test(src) && /if \(r\.variant\) ch\.variant = r\.variant/.test(src));

console.log('\n[U9] the Endless Delve is set up by choosing, not typing (v6.1.7)');
{
  const m = src.match(/var DELVE_DEPTHS[\s\S]*?\nfunction readDelveSetup[\s\S]*?\n}\n/);
  ok('the setup rules are on the page', !!m);
  const gs = src.match(/var GEN_SIZES = \{[\s\S]*?\n\};\n\nfunction genSizeNames\(\) \{[^}]*\}/)[0];
  const sf = src.match(/function seedFromText\(t\) \{[\s\S]*?\n\}\n/)[0];
  const D = new Function(gs + '\n' + m[0] + '\n' + sf + '\nreturn { readDelveSetup, DELVE_DEPTHS, genSizeNames, seedFromText };')();
  let r = D.readDelveSetup('medium', 'endless', '', true);
  ok('endless, any size, no seed', r.ok && r.endless && r.seed === null && r.size === 'medium');
  r = D.readDelveSetup('large', '8', ' 4242 ', true);
  ok('eight large floors, seed 4242', r.ok && !r.endless && r.floors === 8 && r.seed === 4242);
  // v6.1.9: words are seeds too, the same words always the same dungeon
  const w = D.readDelveSetup('small', '3', 'Goblin King', true);
  ok('words make a seed', w.ok && typeof w.seed === 'number' && w.seed > 0 && w.seedText === 'Goblin King');
  ok('the same words, the same seed, whatever the case or spacing',
     D.seedFromText('Goblin King') === D.seedFromText('  goblin   KING ') && D.seedFromText('goblin king') === w.seed);
  ok('different words, different seeds', D.seedFromText('goblin king') !== D.seedFromText('goblin queen'));
  ok('a number is still itself', D.seedFromText('4242') === 4242 && D.readDelveSetup('small', '3', '4242', true).seed === 4242);
  ok('letters and digits together are words, not a number cut short', D.seedFromText('12ab') !== 12);
  ok('a seed past 40 characters is refused', !D.readDelveSetup('small', '3', 'x'.repeat(41), true).ok);
  ok('an unknown size is refused', !D.readDelveSetup('gigantic', '3', '', true).ok);
  ok('no size chosen is refused', !D.readDelveSetup(null, '3', '', true).ok);
  ok('endless is refused where it is not offered', !D.readDelveSetup('small', 'endless', '', false).ok);
  ok('every depth offered is accepted', D.DELVE_DEPTHS.every(n => D.readDelveSetup('small', String(n), '', false).ok));
  ok('every size is accepted', D.genSizeNames().every(k => D.readDelveSetup(k, '3', '', true).ok));
  ok('a ten-digit seed folds into range', D.readDelveSetup('small', '3', '9999999999', true).seed === (9999999999 >>> 0));
  ok('the game opens no browser prompts', !/\bprompt\(/.test(src.replace(/var BUNDLED_PACK = .*\n/, '')));
  ok('the panel is on the page, with radio groups and a numeric seed',
     /<div id="delveSetup"/.test(src) && /setAttribute\('role', 'radio'\)/.test(src) && /id="dsSeed" type="text" maxlength="40"/.test(src));
}

console.log('\n[U10] Continue after a refresh, and the recall portal (v6.1.11)');
ok('a portal is a floor and a square', T.validPortal({ floor: 'g3', x: 6, y: 2, f: 1 }));
ok('junk is not a portal', !T.validPortal(null) && !T.validPortal({ floor: '', x: 1, y: 1, f: 0 }) &&
   !T.validPortal({ floor: 'g2', x: -1, y: 1, f: 0 }) && !T.validPortal({ floor: 'g2', x: 1, y: 1, f: 7 }));
ok('the Continue card names the delve floor and the words of its seed',
   T.describeWhere({ position: { floor: 'g3' }, generated: { seed: 5, seedText: 'goblin king' } }) === 'Endless Delve, floor 3 \u00b7 \u201cgoblin king\u201d');
ok('or its number', T.describeWhere({ position: { floor: 'g2' }, generated: { seed: 4242 } }) === 'Endless Delve, floor 2 \u00b7 seed 4242');
ok('Continue is offered on the adventure chooser, first', /var cont = !inPlay && typeof continueSlot === 'function' \? continueSlot\(\) : null;/.test(src) && /opt\('Continue', /.test(src));
ok('recall leaves a portal below the first floor', /PORTAL = \{ floor: floor\.id, x: pos\.x, y: pos\.y, f: pos\.f \};/.test(src));
ok('the town offers it, and it closes once used', /id="portalBtn"/.test(src) && /PORTAL = null;\s+\/\/ it closes behind you/.test(src));
ok('a wipe closes it', /PORTAL = null;\s+\/\/ a wipe closes any portal/.test(src));
ok('the portal and the seed words are saved', /portal: PORTAL,/.test(src) && /seedText: typeof st\.generated\.seedText === 'string'/.test(src));

console.log('\n[U11] more armour and trinkets (v7.2)');
{
  const add = ['it.studded', 'it.brigandine', 'it.elvenmail', 'it.lamellar', 'it.wardenplate', 'it.ring.vigour', 'it.bead.wizard', 'it.charm.owl', 'it.collar.iron', 'it.heartstone'];
  ok('ten new pieces', add.every(k => T.ITEMS[k]), add.filter(k => !T.ITEMS[k]).join());
  ok('five armours, five trinkets', add.filter(k => T.ITEMS[k].slot === 'armor').length === 5 && add.filter(k => T.ITEMS[k].slot === 'trinket').length === 5);
  const rogue = T.makeCharacter('R', 'rogue', stats);
  ok('a rogue may wear studded leather and elven mail', T.canUse(rogue, T.makeItem('it.studded')) && T.canUse(rogue, T.makeItem('it.elvenmail')));
  ok('but not brigandine', !T.canUse(rogue, T.makeItem('it.brigandine')));
  const f = T.makeCharacter('F', 'fighter', stats), bp0 = T.maxBP(f);
  f.pack = [T.makeItem('it.ring.vigour')]; T.equipItem(f, 0);
  ok('a Ring of Vigour: +5 body', T.maxBP(f) === bp0 + 5);
  f.bp = T.maxBP(f); T.unequipItem(f, 'trinket');
  ok('taken off, body falls back, and the wounds that are left fit', T.maxBP(f) === bp0 && f.bp === bp0);
  const m = T.makeCharacter('M', 'mage', stats), mp0 = T.maxMP(m);
  m.pack = [T.makeItem('it.bead.wizard')]; T.equipItem(m, 0);
  ok('a Wizard\'s Bead: +4 magic for a caster', T.maxMP(m) === mp0 + 4);
  const f2 = T.makeCharacter('G', 'fighter', stats); f2.pack = [T.makeItem('it.bead.wizard')]; T.equipItem(f2, 0);
  ok('and nothing for a fighter, who has no magic', T.maxMP(f2) === 0);
  const c = T.makeCharacter('C', 'fighter', stats), d0 = T.defense(c), h0 = T.meleeToHit(c);
  c.pack = [T.makeItem('it.collar.iron')]; T.equipItem(c, 0);
  ok('an Iron Collar: +2 defence, -1 to hit', T.defense(c) === d0 + 2 && T.meleeToHit(c) === h0 - 1);
  ok('the Warden\'s Harness and the Heartstone are never sold', T.SHOP_STOCK.indexOf('it.wardenplate') < 0 && T.SHOP_STOCK.indexOf('it.heartstone') < 0);
  ok('and only turn up deep', T.itemShopFrom('it.wardenplate') >= 5 && T.gearPool(3).indexOf('it.wardenplate') < 0 && T.gearPool(5).indexOf('it.wardenplate') >= 0);
  ok('the other eight are in the shop', add.filter(k => T.SHOP_STOCK.indexOf(k) >= 0).length === 8);
  const tr = (() => { const r = T.makeRng(11); for (let k = 0; k < 4000; k++) { const it = T.rollFind(r, 6); if (it && it.slot === 'trinket') return it; } })();
  ok('a trinket found in a delve is unidentified, with no rarity', tr && tr.unknown && !tr.rarity && T.itemLabel(tr) === 'Unidentified trinket');
}

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' \u2014 ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

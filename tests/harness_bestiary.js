// MSDD v4.6 — the bestiary by terrain: where each creature lives, the floors
// and regions that say where they are, encounters drawn from what lives there,
// themed generated floors, and the new creatures' rules (corroding feelers,
// elemental attacks on the ground they land on, a necromancer's raised dead).
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

const names = ['HABITATS', 'HABITAT_NAMES', 'MONSTER_TRAITS', 'monsterHabitats', 'livesIn', 'habitatTable',
  'habitatAt', 'encounterTableAt', 'pickEncounter', 'validatePack', 'packFloor', 'PACK', 'MONSTERS', 'BUNDLED_PACK',
  'GEN_THEMES', 'GEN_VERSION', 'themeFor', 'genTable', 'deepTable', 'generateDelve', 'extendDelve', 'delvePrint',
  'makeRng', 'makeParty', 'grantStartingSpells', 'startingKit', 'maxBP', 'makeEncounter', 'beginCombat',
  'oneFoeAttack', 'spawnerTurn', 'groundElementMult', 'combatGround', 'TERRAIN', 'TERRAIN_ELEMENTS',
  'damageEquipment', 'stageTurn', 'miniKnown', 'MitzMinis', 'livingFoes', 'setMonsterScale', 'GEN_DRESSING_TYPES', 'GEN_DRESSING_TERRAIN'];
const CORES = ['PARTY CORE', 'SAVE CORE', 'WORLD CORE', 'GEN CORE', 'EVENT CORE', 'COMBAT CORE', 'STAGE CORE',
  'TOWN CORE', 'INVENTORY CORE', 'MAP CORE'];
const T = new Function(BOOT + CORES.map(grab).join('\n') + '\nreturn {' + names.join(',') + '};')();

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')); } };
const clone = o => JSON.parse(JSON.stringify(o));
const M = T.MONSTERS;
const isBoss = id => (M[id].traits || []).indexOf('boss') >= 0;

const NEW = {
  'mn.hobgoblin': [2, 'hobgoblin', 'warren'], 'mn.wolfRider': [3, 'wolf.rider', 'warren'],
  'mn.ankheg': [4, 'ankheg', 'warren'], 'mn.troll': [5, 'troll', 'warren'],
  'mn.mummy': [4, 'mummy', 'crypt'], 'mn.banshee': [5, 'wraith', 'crypt'],
  'mn.necromancer': [5, 'necromancer', 'crypt'], 'mn.vampire': [6, 'vampire', 'crypt'],
  'mn.giantFrog': [1, 'frog', 'flooded'], 'mn.giantCrab': [2, 'crab', 'flooded'],
  'mn.eel': [3, 'serpent', 'flooded'], 'mn.drowned': [4, 'drowned', 'flooded'],
  'mn.imp': [2, 'imp', 'ruin'], 'mn.animatedArmour': [3, 'armour.animated', 'ruin'],
  'mn.mimic': [4, 'mimic', 'ruin'], 'mn.medusa': [6, 'medusa', 'ruin'],
  'mn.rustMonster': [3, 'rust.monster', 'deep'], 'mn.gelCube': [4, 'ooze.cube', 'deep'],
  'mn.fireBeetle': [1, 'beetle', 'forge'], 'mn.salamander': [3, 'salamander', 'forge'],
  'mn.magmaCrawler': [5, 'grub', 'forge'], 'mn.youngDragon': [8, 'dragon.red', 'deep']
};

console.log('\n[B1] the vocabulary');
ok('six habitats', T.HABITATS.join() === 'warren,crypt,flooded,ruin,deep,forge', T.HABITATS.join());
ok('each habitat has a name to show', T.HABITATS.every(h => typeof T.HABITAT_NAMES[h] === 'string'));
ok('corrode is a trait', T.MONSTER_TRAITS.indexOf('corrode') >= 0);
const used = {};
Object.keys(M).forEach(id => (M[id].traits || []).forEach(t => { used[t] = 1; }));
ok('every trait the bundled bestiary uses is in the vocabulary', Object.keys(used).every(t => T.MONSTER_TRAITS.indexOf(t) >= 0),
   Object.keys(used).filter(t => T.MONSTER_TRAITS.indexOf(t) < 0).join());
{ const wired = new Set([...src.matchAll(/hasTrait\([A-Za-z_$]+, '([a-zA-Z]+)'\)/g)].map(m => m[1]));
  ['boss', 'undead', 'swarm', 'caster', 'construct'].forEach(t => wired.add(t));
  ok('the vocabulary lists nothing the engine does not do', T.MONSTER_TRAITS.every(t => wired.has(t)),
     T.MONSTER_TRAITS.filter(t => !wired.has(t)).join()); }
ok('a monster with no habitats lives anywhere', T.livesIn({}, ['crypt']) && T.livesIn({ habitats: null }, ['forge']));
ok('one with habitats lives only there', T.livesIn({ habitats: ['crypt'] }, ['crypt', 'ruin']) &&
   !T.livesIn({ habitats: ['crypt'] }, ['forge']));

console.log('\n[B2] the bundled bestiary');
ok('62 monsters: the 40 of v4.5 and 22 new', Object.keys(M).length === 62, Object.keys(M).length);
ok('all 22 new ones are there', Object.keys(NEW).every(id => !!M[id]), Object.keys(NEW).filter(id => !M[id]).join());
ok('each at the level it was planned', Object.keys(NEW).every(id => M[id] && M[id].level === NEW[id][0]));
ok('each drawn by its planned figure', Object.keys(NEW).every(id => M[id] && M[id].mini === NEW[id][1]),
   Object.keys(NEW).filter(id => M[id] && M[id].mini !== NEW[id][1]).join());
ok('every figure exists in the shared library', Object.keys(M).every(id => T.MitzMinis.has(M[id].mini)),
   Object.keys(M).filter(id => !T.MitzMinis.has(M[id].mini)).join());
ok('each lives where it was planned', Object.keys(NEW).every(id => M[id] && M[id].habitats.indexOf(NEW[id][2]) >= 0));
ok('every monster says where it lives', Object.keys(M).every(id => (M[id].habitats || []).length >= 1),
   Object.keys(M).filter(id => !(M[id].habitats || []).length).join());
ok('nobody lives in more than two places', Object.keys(M).every(id => M[id].habitats.length <= 2));
T.HABITATS.forEach(h => {
  const lv = Object.keys(M).filter(id => M[id].habitats.indexOf(h) >= 0).map(id => M[id].level);
  ok(h + ': a creature at level 1 or 2 and one at 4 or deeper', lv.some(l => l <= 2) && lv.some(l => l >= 4), lv.join());
});
for (let d = 1; d <= 4; d++) ok('every habitat has two or more ordinary creatures around depth ' + d,
  T.HABITATS.every(h => T.habitatTable(M, [h], d).filter(id => !isBoss(id)).length >= 2),
  T.HABITATS.map(h => h + ':' + T.habitatTable(M, [h], d).length).join(' '));

// stat bands: a new monster sits within what its level already looks like
const avgDice = d => d[0] * (d[1] + 1) / 2 + (d[2] || 0);
const band = lv => {
  const old = Object.keys(M).filter(id => !NEW[id] && M[id].level === lv && !isBoss(id));
  if (!old.length) return null;
  const f = fn => old.map(id => fn(M[id]));
  const r = a => [Math.min.apply(null, a), Math.max.apply(null, a)];
  return { bp: r(f(m => avgDice(m.bp))), def: r(f(m => m.defense)), xp: r(f(m => m.xp)),
           hit: r(f(m => Math.max.apply(null, m.attacks.map(a => a.toHit)))) };
};
const outOfBand = [];
Object.keys(NEW).filter(id => !isBoss(id)).forEach(id => {
  const m = M[id], b = band(m.level) || band(m.level - 1);
  const top = Math.max.apply(null, m.attacks.map(a => a.toHit));
  if (avgDice(m.bp) < b.bp[0] * 0.7 || avgDice(m.bp) > b.bp[1] * 1.3) outOfBand.push(id + ' bp ' + avgDice(m.bp));
  if (m.defense < b.def[0] - 2 - (id === 'mn.gelCube' ? 2 : 0) || m.defense > b.def[1] + 1) outOfBand.push(id + ' def ' + m.defense);
  if (m.xp < b.xp[0] * 0.85 || m.xp > b.xp[1] * 1.15) outOfBand.push(id + ' xp ' + m.xp);
  if (top < b.hit[0] - 1 || top > b.hit[1] + 1) outOfBand.push(id + ' toHit ' + top);
});
ok('the new creatures fit their level: BP, defence, xp and to-hit', outOfBand.length === 0, outOfBand.join('; '));
ok('the young dragon is a boss, as tough as the deepest', isBoss('mn.youngDragon') &&
   avgDice(M['mn.youngDragon'].bp) >= avgDice(M['mn.deepHorror'].bp) && M['mn.youngDragon'].phases.length === 1);
ok('no new monster goes deeper than the bestiary already did',
   Object.keys(NEW).every(id => M[id].level <= 8));

console.log('\n[B3] the validator');
const base = () => clone(T.BUNDLED_PACK);
const v = p => T.validatePack(p);
const has = (r, re) => r.errors.some(e => re.test(e));
const warns = (r, re) => r.warnings.some(e => re.test(e));
ok('the bundled pack is clean', v(base()).ok && !v(base()).warnings.some(w => /habitat|trait|spawn|wanders/.test(w)),
   v(base()).warnings.join(' | '));
{ const p = base(); p.monsters['mn.goblin'].traits = ['sneaky'];
  ok('a misspelt trait fails', has(v(p), /trait "sneaky"/)); }
{ const p = base(); p.monsters['mn.goblin'].habitats = ['swamp'];
  ok('an unknown habitat fails', has(v(p), /lives in "swamp"/)); }
{ const p = base(); p.monsters['mn.goblin'].habitats = [];
  ok('an empty habitat list fails', has(v(p), /habitats must be a list/)); }
{ const p = base(); p.monsters['mn.goblin'].habitats = ['warren', 'warren'];
  const r = v(p); ok('a habitat named twice warns', r.ok && warns(r, /twice/)); }
{ const p = base(); p.monsters['mn.goblin'].attacks[0].element = 'acid';
  ok('an unknown attack element fails', has(v(p), /element "acid"/)); }
{ const p = base(); p.monsters['mn.necromancer'].spawns = 'mn.nobody';
  ok('spawning an unknown monster fails', has(v(p), /spawns unknown/)); }
{ const p = base(); p.monsters['mn.goblin'].spawns = 'mn.skeleton';
  const r = v(p); ok('spawns without the spawner trait warns', r.ok && warns(r, /no spawner trait/)); }
{ const p = base(); p.monsters['mn.youngDragon'].phases[0].addTrait = 'wings';
  ok('a boss phase adding an unknown trait fails', has(v(p), /adds trait "wings"/)); }
{ const p = base(); p.floors[1].habitat = 'swamp';
  ok('an unknown floor habitat fails', has(v(p), /f2 is habitat "swamp"/)); }
{ const p = base(); p.floors[1].regions.cistern.habitat = 'lava';
  ok('an unknown region habitat fails', has(v(p), /region cistern is habitat "lava"/)); }
{ const p = base(); p.floors[1].regions.cistern.encounterTable = ['mn.nobody'];
  ok('a region table naming an unknown monster fails', has(v(p), /region cistern encounter table/)); }
{ const p = base(); p.floors[0].encounterTable = [];
  const r = v(p); ok('a floor with no table and no habitat warns that nothing wanders', r.ok && warns(r, /nothing wanders/)); }
{ const p = base(); p.floors[0].encounterTable = []; p.floors[0].habitat = 'warren';
  const r = v(p); ok('but a habitat is enough', r.ok && !warns(r, /nothing wanders/)); }
{ const p = base(); Object.keys(p.monsters).forEach(id => { if (p.monsters[id].habitats.indexOf('forge') >= 0) p.monsters[id].habitats = ['deep']; });
  p.floors[0].habitat = 'forge';
  const r = v(p); ok('a habitat nothing lives in warns', r.ok && warns(r, /nothing in the bestiary lives there/)); }
{ const p = base(); Object.keys(p.monsters).forEach(id => { delete p.monsters[id].habitats; });
  ok('a pack with no habitats at all is still valid', v(p).ok); }

console.log('\n[B4] the habitat table');
{
  const t = T.habitatTable(M, ['flooded'], 2);
  ok('only creatures that live there', t.length >= 2 && t.every(id => M[id].habitats.indexOf('flooded') >= 0), t.join());
  ok('within a level of the depth when it can be', t.every(id => Math.abs(M[id].level - 2) <= 1));
  ok('no bosses when anything else lives there', T.HABITATS.every(h => [1, 2, 3, 4, 5].every(d =>
    T.habitatTable(M, [h], d).filter(id => !isBoss(id)).length === 0 || T.habitatTable(M, [h], d).every(id => !isBoss(id)))));
  const thin = T.habitatTable(M, ['forge'], 7);
  ok('widens to two levels either side when the band is thin', thin.length >= 1 &&
     thin.every(id => Math.abs(M[id].level - 7) <= 2), thin.join());
  ok('a creature from another place never appears', T.habitatTable(M, ['crypt'], 3).every(id => T.livesIn(M[id], ['crypt'])));
  ok('nothing lives in the flooded halls at depth 9', T.habitatTable(M, ['flooded'], 9).length === 0);
  const wander = { 'mn.a': { level: 2, traits: [] }, 'mn.b': { level: 2, habitats: ['crypt'], traits: [] },
                   'mn.c': { level: 2, habitats: ['forge'], traits: [] } };
  ok('a creature that names no habitat wanders into any', T.habitatTable(wander, ['crypt'], 2).sort().join() === 'mn.a,mn.b');
}

console.log('\n[B5] encounters where you stand');
{
  const f2 = T.packFloor('f2'), f3 = T.packFloor('f3');
  const cellOf = (f, rid) => Object.keys(f.regionMap).filter(k => f.regionMap[k] === rid)[0].split(',').map(Number);
  const outside = f => { for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (!f.regionMap[x + ',' + y]) return [x, y]; return null; };
  ok('the floors know where they are', f2.habitat === 'warren' && f3.habitat === 'crypt');
  ok('the cistern is flooded, the tunnels a warren', f2.regions.cistern.habitat === 'flooded' &&
     f2.regions.tunnels.habitat === 'warren');
  ok('the ossuary is a crypt', f3.regions.ossuary.habitat === 'crypt');
  const [cx, cy] = cellOf(f2, 'cistern');
  ok('habitatAt reads the region', T.habitatAt(f2, cx, cy) === 'flooded' && T.habitatAt(f2, null, null) === null);

  const draw = (f, at, n) => { const seen = {}, rg = T.makeRng(9); for (let i = 0; i < (n || 400); i++) seen[T.pickEncounter(f, rg, at)] = 1; return Object.keys(seen); };
  const wet = draw(f2, { x: cx, y: cy, monsters: M });
  ok('in the cistern, things come out of the water', wet.every(id => M[id].habitats.indexOf('flooded') >= 0), wet.join());
  ok('several kinds of them', wet.length >= 4, wet.length);
  ok('none of them a boss', wet.every(id => !isBoss(id)));
  const [tx, ty] = cellOf(f2, 'tunnels');
  const dry = draw(f2, { x: tx, y: ty, monsters: M });
  ok('in the tunnels, only the warren', dry.every(id => M[id].habitats.indexOf('warren') >= 0) && dry.length >= 2, dry.join());
  ok('taken from the floor\'s own list', dry.every(id => f2.encounterTable.indexOf(id) >= 0));
  const [ox, oy] = cellOf(f3, 'ossuary');
  const bones = draw(f3, { x: ox, y: oy, monsters: M });
  ok('in the ossuary, only what lives in crypts', bones.every(id => M[id].habitats.indexOf('crypt') >= 0), bones.join());
  ok('the mummy is on the laboratory\'s list', f3.encounterTable.indexOf('mn.mummy') >= 0 && bones.indexOf('mn.mummy') >= 0);
  ok('the hobgoblin is on the warren\'s', f2.encounterTable.indexOf('mn.hobgoblin') >= 0);
  const o = outside(f2);
  if (o) {
    const any = draw(f2, { x: o[0], y: o[1], monsters: M });
    ok('outside any region, the whole floor list', any.sort().join() === f2.encounterTable.slice().sort().join(), any.join());
  }
  // without a position the old behaviour, call for call
  let same = true;
  for (let s = 0; s < 200; s++) {
    const a = T.pickEncounter(f2, T.makeRng(s)), t = f2.encounterTable;
    if (a !== t[Math.floor(T.makeRng(s)() * t.length)]) same = false;
  }
  ok('without a position, the same pick as before v4.6', same);
  ok('a position without the bestiary is the plain list too', T.encounterTableAt(f2, { x: cx, y: cy }).join() === f2.encounterTable.join());
  { const rg = T.makeRng(3), r2 = T.makeRng(3);
    T.pickEncounter(f2, rg, { x: cx, y: cy, monsters: M }); r2();
    ok('one roll of the dice per encounter, as before', rg() === r2()); }
  const g = clone(f2); g.regions.cistern.encounterTable = ['mn.giantCrab'];
  ok('a region with its own table uses only that', draw(g, { x: cx, y: cy, monsters: M }).join() === 'mn.giantCrab');
  const e = clone(f3); e.encounterTable = []; e.regionMap = {};
  const fromHab = draw(e, { x: 1, y: 1, monsters: M });
  ok('a floor with no list draws from its habitat', fromHab.length >= 2 && fromHab.every(id => M[id].habitats.indexOf('crypt') >= 0), fromHab.join());
  const n = clone(f3); n.encounterTable = []; n.regionMap = {}; n.habitat = null;
  ok('and with neither, nothing wanders', T.pickEncounter(n, T.makeRng(1), { x: 1, y: 1, monsters: M }) === null);
}

console.log('\n[B6] generated floors by theme');
{
  ok('the generator version is 4 (v4.8 dresses the floors)', T.GEN_VERSION === 4);
  ok('every theme names one or two habitats', T.GEN_THEMES.every(t => t.habitats && t.habitats.length >= 1 && t.habitats.length <= 2 &&
     t.habitats.every(h => T.HABITATS.indexOf(h) >= 0)));
  ok('between them every habitat is used', T.HABITATS.every(h => T.GEN_THEMES.some(t => t.habitats.indexOf(h) >= 0)));
  const byLevel = {};
  Object.keys(M).forEach(id => { (byLevel[M[id].level] = byLevel[M[id].level] || []).push(id); });
  const weak = [], themedCount = [], bossy = [];
  for (let d = 1; d <= 24; d++) {
    const t = T.genTable(M, byLevel, d), plain = T.deepTable(byLevel, d, Object.keys(M));
    const habs = T.themeFor(d).habitats;
    if (t.every(id => T.livesIn(M[id], habs))) themedCount.push(d);
    if (t.join() !== plain.join() && t.filter(id => !isBoss(id)).length < 2) bossy.push(d);
    const lo = Math.min.apply(null, t.map(id => M[id].level)), plainLo = Math.min.apply(null, plain.map(id => M[id].level));
    if (lo < plainLo - 1) weak.push(d + ':' + lo + '<' + plainLo);
  }
  ok('every floor down to 8 keeps to its theme', [1, 2, 3, 4, 5, 6, 7, 8].every(d => themedCount.indexOf(d) >= 0), themedCount.join());
  ok('a themed table always has two ordinary creatures, or the plain band is used', bossy.length === 0, bossy.join());
  ok('a theme never makes a floor much easier than the plain depth band', weak.length === 0, weak.join());
  const deep = T.genTable(M, byLevel, 15);
  ok('past the end of the book, still only the deepest creatures', deep.every(id => M[id].level >= 7), deep.join());

  const a = T.generateDelve(4242, { floors: 6, basePack: T.BUNDLED_PACK });
  const b = T.generateDelve(4242, { floors: 6, basePack: T.BUNDLED_PACK });
  ok('a generated delve validates', a.ok, (a.errors || []).join());
  ok('it records generator 4', a.ok && a.pack.generated.gen === 4);
  ok('the same seed gives the same tables', a.ok && b.ok &&
     JSON.stringify(a.pack.floors.map(f => f.encounterTable)) === JSON.stringify(b.pack.floors.map(f => f.encounterTable)));
  ok('and the same monsters on the map', a.ok && JSON.stringify(a.pack.floors.map(f => f.features)) === JSON.stringify(b.pack.floors.map(f => f.features)));
  ok('each floor\'s table lives in its theme', a.ok && a.pack.floors.every((f, i) =>
     f.encounterTable.every(id => T.livesIn(M[id], T.themeFor(i + 1).habitats))));
  ok('placed monsters come from the table', a.ok && a.pack.floors.every(f => Object.keys(f.features).every(k =>
     f.features[k].type !== 'monster' || !f.features[k].ref || f.encounterTable.indexOf(f.features[k].ref) >= 0)));

  // The layout is the same as v4.5 built from the same seed, so a save resumes
  // in place. These fingerprints were taken from v4.5 itself: the floor-1 print
  // its saves carry, and a hash of every floor's cells, feature cells and terrain.
  const V45 = { 1: ['dec00fb0', '2f3d3c78'], 77: ['4e679328', '35cd05d4'],
                4242: ['cb3e38e8', '3ff451bf'], 90210: ['be704cd9', 'f7ef0bc7'] };
  const fnv = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = ((h ^ s.charCodeAt(i)) * 16777619) >>> 0;
                     return ('0000000' + h.toString(16)).slice(-8); };
  let samePrint = true, sameCells = true;
  Object.keys(V45).forEach(seed => {
    const n = T.generateDelve(Number(seed), { floors: 5, basePack: T.BUNDLED_PACK });
    if (!n.ok || T.delvePrint(n.pack) !== V45[seed][0]) samePrint = false;
    // v4.8 lays traps, finds, pillars, ice and rotten planks on top; take those
    // back off and what is left must be the v4.5 floor exactly
    const bare = n.ok && n.pack.floors.map(f => {
      const keys = Object.keys(f.features).filter(k => !T.GEN_DRESSING_TYPES[f.features[k].type]);
      const terr = {}; Object.keys(f.terrain || {}).forEach(k => { const t = f.terrain[k];
        if (!T.GEN_DRESSING_TERRAIN[t]) terr[k] = t === 'rotten' ? 'bridge' : t; });
      return [f.cells, keys, terr];
    });
    if (!n.ok || fnv(JSON.stringify(bare)) !== V45[seed][1]) sameCells = false;
  });
  ok('a v4.5 delve\'s fingerprint still matches its rebuild', samePrint);
  ok('every floor of it is laid out the same, only the creatures differ', sameCells);

  const endless = T.generateDelve(31337, { floors: 3, endless: true, size: 'small', basePack: T.BUNDLED_PACK });
  const g4 = endless.ok ? T.extendDelve(endless.pack, 4, T.BUNDLED_PACK) : null;
  ok('an endless floor below is themed too', !!g4 && g4.encounterTable.every(id => T.livesIn(M[id], T.themeFor(4).habitats)),
     g4 && g4.encounterTable.join());
}

console.log('\n[B7] the new rules');
function party(seed) {
  const rg = T.makeRng(seed || 1);
  const p = T.makeParty(rg, ['fighter', 'fighter', 'mage', 'priest'].map((c, i) =>
    ({ name: ['Bruda', 'Kesh', 'Merl', 'Ansel'][i], class: c })));
  T.grantStartingSpells(p); T.startingKit(p);
  return p;
}
function fight(ref, seed, ground) {
  const p = party(seed), rg = T.makeRng(seed);
  const foes = T.makeEncounter(ref, rg).slice(0, 1);
  foes[0].rank = 'front';
  const st = T.beginCombat(p, foes, rg, ground || null);
  return { p, st };
}
{
  // corrode: what the rust monster touches is damaged, never lost
  let rusted = 0, lines = 0, lost = 0, hits = 0;
  for (let s = 1; s <= 300; s++) {
    const { p, st } = fight('mn.rustMonster', s);
    const before = p.map(c => ['weapon', 'armor', 'shield'].filter(k => c.equipped[k]).length);
    const ev = [];
    T.oneFoeAttack(p, st, st.foes[0], st.foes[0].attacks[0], T.makeRng(s * 7), ev);
    if (ev.some(e => e.kind === 'foehit' && e.dmg)) hits++;
    if (ev.some(e => /pits and flakes/.test(e.text))) lines++;
    p.forEach((c, i) => {
      ['weapon', 'armor', 'shield'].forEach(k => { if (c.equipped[k] && c.equipped[k].damaged) rusted++; });
      if (['weapon', 'armor', 'shield'].filter(k => c.equipped[k]).length !== before[i]) lost++;
    });
  }
  ok('the rust monster damages gear on some hits', rusted > 0 && lines === rusted, rusted + ' of ' + hits + ' hits');
  ok('about two hits in five', rusted / hits > 0.25 && rusted / hits < 0.55, (rusted / hits).toFixed(2));
  ok('and never takes anything away', lost === 0);
  // other monsters never do
  let other = 0;
  for (let s = 1; s <= 200; s++) {
    const { p, st } = fight('mn.giantBeetle', s), ev = [];
    T.oneFoeAttack(p, st, st.foes[0], st.foes[0].attacks[0], T.makeRng(s), ev);
    p.forEach(c => ['weapon', 'armor', 'shield'].forEach(k => { if (c.equipped[k] && c.equipped[k].damaged) other++; }));
  }
  ok('nothing else corrodes', other === 0);
  // without the town's damageEquipment (a cut-down build), no crash and no rust
  const NoTown = new Function(BOOT + CORES.filter(c => c !== 'TOWN CORE').map(grab).join('\n') +
    '\nreturn { makeRng, makeParty, grantStartingSpells, makeEncounter, beginCombat, oneFoeAttack };')();
  let crashed = false;
  try {
    for (let s = 1; s <= 30; s++) {
      const rg = NoTown.makeRng(s), p = NoTown.makeParty(rg, [{ name: 'A', class: 'fighter' }, { name: 'B', class: 'fighter' }]);
      const foes = NoTown.makeEncounter('mn.rustMonster', rg);
      const st = NoTown.beginCombat(p, foes, rg);
      NoTown.oneFoeAttack(p, st, foes[0], foes[0].attacks[0], NoTown.makeRng(s), []);
    }
  } catch (e) { crashed = e.message; }
  ok('corrode is skipped, not fatal, without the town core', crashed === false, crashed);
}
{
  // elements: fire in water is halved, on the coals it is fed
  const water = T.combatGround({ terrain: { '1,1': 'water' }, cells: [0, 0, 0, 0, 0, 0, 0, 0, 0], w: 3, h: 3 }, 1, 1, []);
  const coals = T.combatGround({ terrain: { '1,1': 'embers' }, cells: [0, 0, 0, 0, 0, 0, 0, 0, 0], w: 3, h: 3 }, 1, 1, []);
  ok('the grounds carry their elements', T.groundElementMult({ ground: water }, 'fire') === 0.5 &&
     T.groundElementMult({ ground: coals }, 'fire') === 1.5, JSON.stringify([water, coals]));
  const total = ground => {
    let sum = 0, line = false, tagged = true;
    for (let s = 1; s <= 200; s++) {
      const { p, st } = fight('mn.fireBeetle', s, ground), ev = [];
      T.oneFoeAttack(p, st, st.foes[0], st.foes[0].attacks[0], T.makeRng(s * 3), ev);
      ev.forEach(e => { if (e.dmg) { sum += e.dmg; if (e.element !== 'fire') tagged = false; }
                        if (/water drinks half|coals feed/.test(e.text)) line = true; });
    }
    return { sum, line, tagged };
  };
  // only the element: real water also costs melee a point to hit
  const wetG = { element: water.element }, hotG = { element: coals.element };
  const dry = total(null), wet = total(wetG), hot = total(hotG);
  ok('a fire beetle\'s bite is weaker standing in water', wet.sum < dry.sum * 0.75, wet.sum + ' vs ' + dry.sum);
  ok('and stronger on the coals', hot.sum > dry.sum * 1.25, hot.sum + ' vs ' + dry.sum);
  ok('the log says why', wet.line && hot.line && !dry.line);
  ok('each blow is marked with its element', dry.tagged && wet.tagged);
  // a blade without an element is unaffected
  let gsum = 0, gwet = 0;
  for (let s = 1; s <= 200; s++) {
    ['dry', 'wet'].forEach(k => {
      const { p, st } = fight('mn.goblin', s, k === 'wet' ? wetG : null), ev = [];
      T.oneFoeAttack(p, st, st.foes[0], st.foes[0].attacks[0], T.makeRng(s * 3), ev);
      ev.forEach(e => { if (e.dmg) { if (k === 'dry') gsum += e.dmg; else gwet += e.dmg; } });
    });
  }
  ok('a plain blade does not care what it stands in', gsum === gwet, gsum + ' vs ' + gwet);
  // the stage throws fire as fire
  const snap = (foes, partyBp) => ({ foes, party: partyBp, logLen: 0 });
  const r = T.stageTurn({ events: [{ kind: 'foehit', text: 'x', by: 'g0', on: 'p2', roll: 15, reach: 'ranged', caster: true,
                                     element: 'fire', hit: true, dmg: 4 },
                                   { kind: 'foehit', text: 'y', by: 'g1', on: 'p3', roll: 15, reach: 'ranged',
                                     element: 'lightning', hit: true, dmg: 4 },
                                   { kind: 'foehit', text: 'z', by: 'g2', on: 'p1', roll: 15, reach: 'ranged', hit: true, dmg: 4 }],
                          actor: null, before: snap({ g0: { bp: 5 }, g1: { bp: 5 }, g2: { bp: 5 } }, [9, 9, 9, 9]),
                          after: snap({ g0: { bp: 5 }, g1: { bp: 5 }, g2: { bp: 5 } }, [9, 5, 5, 5]) });
  ok('an imp\'s firebolt flies as a fireball', r.cues.some(c => c.kind === 'fx' && c.fx.k === 'fireball' && c.fx.to === 'p2'));
  ok('lightning as a bolt, a plain shot as an arrow', r.cues.some(c => c.fx && c.fx.k === 'bolt' && c.fx.to === 'p3') &&
     r.cues.some(c => c.fx && c.fx.k === 'arrow' && c.fx.to === 'p1'));
}
{
  // the necromancer raises skeletons; an ordinary spawner still calls its own kind
  let raised = null, n = 0;
  for (let s = 1; s <= 60 && !raised; s++) {
    const { st } = fight('mn.necromancer', s);
    const ev = T.spawnerTurn(st, T.makeRng(s));
    if (st.foes.length > 1) { raised = st.foes[st.foes.length - 1]; n = ev.length; raised.__text = ev[0] && ev[0].text; }
  }
  ok('a necromancer raises the dead', !!raised && raised.ref === 'mn.skeleton', raised && raised.ref);
  ok('it is a whole skeleton, not half a necromancer', !!raised && raised.attacks === M['mn.skeleton'].attacks &&
     raised.traits.indexOf('undead') >= 0 && raised.traits.indexOf('spawner') < 0);
  ok('worth half a skeleton\'s xp, and no gold', !!raised && raised.xp === Math.round(M['mn.skeleton'].xp * 0.5) &&
     raised.gold[0] === 0);
  ok('the log names what rose', !!raised && /skeleton rises/.test(raised.__text), raised && raised.__text);
  let copy = null;
  for (let s = 1; s <= 60 && !copy; s++) {
    const { st } = fight('mn.shadeWisp', s);
    T.spawnerTurn(st, T.makeRng(s));
    if (st.foes.length > 1) copy = st.foes[st.foes.length - 1];
  }
  ok('a shade wisp still calls another shade wisp', !!copy && copy.ref === 'mn.shadeWisp');
}

console.log('\n[B8] the app passes where the party stands');
{
  const calls = src.match(/pickEncounter\(floor, actionRng[^)]*\)/g) || [];
  ok('every wandering encounter is drawn where the party stands', calls.length >= 3 &&
     calls.every(c => /encounterHere\(\)/.test(c)), calls.join(' | '));
  ok('encounterHere gives the position and the bestiary',
     /function encounterHere\(\) \{ return \{ x: pos\.x, y: pos\.y, monsters: MONSTERS \}; \}/.test(src));
  ok('the floor\'s habitat survives packFloor', /habitat: f\.habitat \|\| null/.test(src));
}

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

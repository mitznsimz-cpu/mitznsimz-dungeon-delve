// MSDD v4.9 — the Rogue and the tools of the trade: the fourth core class,
// finesse, Backstab and Melt Away; locks picked, forced and knocked open;
// the signature moves (swallow, petrify, charm, burrow, and fire against a
// troll's mending); Silence and caltrops; Knock, Levitate, Water Walk and
// Detect Traps; rings nobody can name, and curses; and Ashkeld's share.
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
const names = ['CLASSES', 'ITEMS', 'SPELLS', 'PACK', 'BUNDLED_PACK', 'MONSTERS', 'validatePack', 'loadPack', 'proveSolvable',
  'MONSTER_TRAITS', 'SPELL_KINDS', 'ITEM_USE_KINDS', 'makeRng', 'makeParty', 'makeCharacter', 'grantStartingSpells',
  'grantStartingSkills', 'startingKit', 'startingSkills', 'canUse', 'makeItem', 'itemLabel', 'equipItem', 'unequipItem',
  'sellValue', 'doIdentify', 'doUncurse', 'identifyCost', 'uncurseCost', 'meleeToHit', 'strikeMod', 'mod', 'recomputeArmor',
  'beginCombat', 'makeEncounter', 'partyAction', 'advanceCombat', 'oneFoeTurn', 'oneFoeAttack', 'foeRegenerates',
  'heldUpkeep', 'releaseHeld', 'isHeld', 'targetable', 'hasStatus', 'finishCombat', 'engagedParty', 'engagedFoes',
  'spawnerTurn', 'signatureMoves', 'useItem', 'itemUsableNow', 'castOutside', 'fieldSpells', 'fieldNeed',
  'pickLock', 'forceLock', 'knockOpen', 'lockChance', 'bestPicker', 'lockDifficulty', 'lockedShut', 'carrying',
  'floorState', 'blankFloorState', 'FLOOR_LISTS', 'packWorld', 'unpackWorld', 'serialise', 'deserialise',
  'generateDelve', 'genRings', 'spotChance', 'passiveSpotter', 'disarmChance', 'maxBP', 'maxMP', 'normalisePositions',
  'isFront', 'xpForLevel', 'levelUp', 'canLevel', 'quickPartyMix', 'QUICK_PARTIES', 'meetsMinimums',
  'learnableSkills', 'skillDef'];
const CORES = ['PARTY CORE', 'SAVE CORE', 'WORLD CORE', 'GEN CORE', 'EVENT CORE', 'COMBAT CORE', 'STAGE CORE',
  'TOWN CORE', 'INVENTORY CORE', 'MAP CORE'];
const T = new Function(BOOT + CORES.map(grab).join('\n') + '\nreturn {' + names.join(',') + '};')();

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')); } };
const clone = o => JSON.parse(JSON.stringify(o));
const fixed = v => () => v;
const seq = vs => { let i = 0; return () => vs[Math.min(i++, vs.length - 1)]; };
const P = T.BUNDLED_PACK;

function party(seed, classes, stats) {
  const rg = T.makeRng(seed || 1);
  const p = T.makeParty(rg, (classes || ['fighter', 'fighter', 'rogue', 'priest']).map((c, i) =>
    ({ name: ['Pete', 'Sharron', 'Wren', 'Mitz'][i], class: c })));
  T.grantStartingSpells(p); T.grantStartingSkills(p); T.startingKit(p); T.normalisePositions(p);
  p.forEach(c => { c.effects = []; if (stats && stats[c.class]) Object.assign(c.stats, stats[c.class]); T.recomputeArmor(c); });
  return p;
}
function foesOf(ref, n, rg) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = T.makeEncounter(ref, rg)[0];
    f.uid = 'f' + i; f.rank = 'front'; f.traits = (f.traits || []).filter(t => t !== 'ambush');
    out.push(f);
  }
  return out;
}
// a fight where it is the given hero's turn
function turnOf(st, idx) { st.order = [{ side: 'party', idx: idx, roll: 99 }]; st.phase = 'party'; }

console.log('\n[G1] the Rogue, a fourth core class');
{
  const R = T.CLASSES.rogue;
  ok('four classes', Object.keys(T.CLASSES).join() === 'fighter,mage,priest,rogue');
  ok('a rogue needs Dexterity 11', R.minStats.dex === 11);
  ok('no spells, its own skills', !R.spellList && R.skillList === 'rogue');
  const w = T.makeCharacter('Wren', 'rogue', { str: 10, dex: 16, con: 12, int: 12, pie: 10 }, 'curious', 'female');
  const can = id => T.canUse(w, T.makeItem(id));
  ok('daggers, short swords, short bows, slings and crossbows', ['it.dagger', 'it.shortsword', 'it.shortbow', 'it.sling', 'it.crossbow'].every(can));
  ok('quilting and leather', can('it.padded') && can('it.leather'));
  ok('not a longsword, a greatsword or a mace', !can('it.longsword') && !can('it.greatsword') && !can('it.mace'));
  ok('not mail, and no shield', !can('it.chainmail') && !can('it.ringmail') && !can('it.buckler'));
  ok('rings and charms', can('it.ring.ward'));
  const f = T.makeCharacter('Pete', 'fighter', { str: 16, dex: 10, con: 14, int: 10, pie: 10 }, 'brash', 'male');
  ok('the fighter still wears leather and swings anything', T.canUse(f, T.makeItem('it.leather')) && T.canUse(f, T.makeItem('it.greatsword')));
  const p = party(1);
  const wren = p[2];
  ok('a rogue starts with a dagger and a leather jack', wren.equipped.weapon.ref === 'it.dagger' && wren.equipped.armor.ref === 'it.leather');
  ok('and knows Backstab', wren.skills.join() === 'sk.backstab');
  wren.stats.str = 8; wren.stats.dex = 18;
  ok('with a light blade, a rogue strikes with Dexterity', T.strikeMod(wren) === T.mod(18));
  p[0].stats.str = 8; p[0].stats.dex = 18; p[0].equipped.weapon = T.makeItem('it.dagger');
  ok('a fighter with the same dagger still strikes with Strength', T.strikeMod(p[0]) === T.mod(8));
  ok('a rogue notices traps without looking', T.passiveSpotter(p) === wren);
  ok('and finds and disarms them better than anyone else here',
     T.spotChance([wren], 3) > T.spotChance([p[1]], 3) && T.disarmChance(wren, 3) > T.disarmChance(p[1], 3));
  ok('the hiding skill comes at the second tier', T.PACK.skills['sk.hide'].tier === 2 && T.PACK.skills['sk.hide'].list === 'rogue');
  const bad = (name, change, re) => { const b = clone(P); change(b); const r = T.validatePack(b);
    ok(name, !r.ok && re.test(r.errors.join(' ')), r.errors.join(' | ')); };
  bad('a trap sense out of range is refused', b => { b.classes.rogue.traps.spot = 9; }, /traps\.spot 9/);
  bad('a locksmith out of range is refused', b => { b.classes.rogue.locks = 2; }, /locks 2/);
  bad('a kit that does not exist is refused', b => { b.classes.rogue.kit.weapon = 'it.rapier'; }, /unknown item "it\.rapier"/);
  // (this used 'assassinate' as the made-up kind until Assassinate became real)
  bad('a skill that does nothing the engine knows is refused', b => { b.skills['sk.backstab'].effect.kind = 'vanish'; }, /unknown effect "vanish"/);
  const tp = P.testParties.filter(t => t.id === 'tp.rogue')[0];
  ok('a test party with a rogue, at level 5, carrying the tools', tp && tp.level === 5 &&
     ['it.rope', 'it.crowbar', 'it.oil', 'it.caltrops'].every(k => tp.kit.indexOf(k) >= 0));
}

console.log('\n[G2] a charm that helps your aim');
{
  const p = party(2), c = p[0];
  const before = T.meleeToHit(c);
  c.equipped.trinket = T.makeItem('it.charm.luck');
  ok('the Charm of Fortune adds its +1 to hit (it was ignored before v4.9)', T.meleeToHit(c) === before + 1, before + ' -> ' + T.meleeToHit(c));
  c.equipped.trinket = T.makeItem('it.ring.fumble');
  ok('and a Ring of Fumbling takes 2 off', T.meleeToHit(c) === before - 2);
}

console.log('\n[G3] Backstab and Melt Away');
{
  const go = (seed, opts) => {
    opts = opts || {};
    const rg = T.makeRng(seed), p = party(seed, opts.classes);
    const foes = foesOf(opts.ref || 'mn.orcRaider', opts.n || 2, rg);
    const st = T.beginCombat(p, foes, rg, opts.ground || null);
    return { p, st, rg, foes };
  };
  let F = go(3);
  turnOf(F.st, 2);
  const hpBefore = F.foes.map(f => f.bp);
  let ev = T.partyAction(F.p, F.st, 'skill:sk.backstab', 0, T.makeRng(1));
  ok('from the back rank, the rogue reaches what the front rank is fighting', ev.some(e => /slips round the press|darts in/.test(e.text)), ev.map(e => e.text).join(' / '));
  ok('and the blow is staged from the rogue', ev.some(e => e.by === 'p2' && e.reach === 'melee'));
  // the first cut on an unhurt foe is a critical, every time it lands
  let crits = 0, hits = 0;
  for (let s = 1; s <= 120; s++) {
    const G = go(100 + s); turnOf(G.st, 2);
    const e = T.partyAction(G.p, G.st, 'skill:sk.backstab', 0, T.makeRng(s));
    if (e.some(x => x.hit)) { hits++; if (e.some(x => x.hit && x.crit)) crits++; }
  }
  ok('the first cut on something nobody has hurt is always a critical', hits > 30 && crits === hits, crits + '/' + hits);
  F = go(5); F.foes.forEach(f => { f.bp = f.bpMax - 1; }); turnOf(F.st, 2);
  let crit2 = 0, hit2 = 0;
  for (let s = 1; s <= 80; s++) {
    const G = go(300 + s); G.foes.forEach(f => { f.bp = f.bpMax - 1; }); turnOf(G.st, 2);
    const e = T.partyAction(G.p, G.st, 'skill:sk.backstab', 0, T.makeRng(s));
    if (e.some(x => x.hit)) { hit2++; if (e.some(x => x.crit)) crit2++; }
  }
  ok('on something already bleeding, only a natural 20 is', hit2 > 20 && crit2 < hit2 * 0.3, crit2 + '/' + hit2);
  // refusals: in the press, in a doorway, with nobody in front
  F = go(6, { classes: ['rogue', 'fighter', 'fighter', 'priest'] }); turnOf(F.st, 0);
  ev = T.partyAction(F.p, F.st, 'skill:sk.backstab', 0, T.makeRng(1));
  ok('a rogue in the front rank is in the thick of it', ev.some(e => /thick of it/.test(e.text)) && !F.p[0].cooldowns['sk.backstab']);
  F = go(7, { ground: { narrow: true, abreast: 1, doorway: true } }); turnOf(F.st, 2);
  ev = T.partyAction(F.p, F.st, 'skill:sk.backstab', 0, T.makeRng(1));
  ok('in a doorway there is no way round', ev.some(e => /doorway/.test(e.text)));
  F = go(8); F.p[0].bp = 0; F.p[1].bp = 0; turnOf(F.st, 2);
  ev = T.partyAction(F.p, F.st, 'skill:sk.backstab', 0, T.makeRng(1));
  ok('with the front rank down, nobody is keeping them busy', ev.some(e => /Nobody is keeping them busy|thick of it/.test(e.text)));
  // sneak dice grow with level
  const dmgAt = lvl => { let tot = 0;
    for (let s = 1; s <= 200; s++) { const G = go(500 + s); G.p[2].level = lvl; G.foes.forEach(f => { f.bp = 999; f.bpMax = 999; f.defense = -50; });
      turnOf(G.st, 2); T.partyAction(G.p, G.st, 'skill:sk.backstab', 0, T.makeRng(s)); tot += 999 - G.foes[0].bp; }
    return tot / 200; };
  const d1 = dmgAt(1), d10 = dmgAt(10);
  ok('a d6 more for every three levels', d10 > d1 + 7, d1.toFixed(1) + ' vs ' + d10.toFixed(1));
  // Melt Away
  F = go(9); F.p[2].skills.push('sk.hide'); turnOf(F.st, 2);
  T.partyAction(F.p, F.st, 'skill:sk.hide', 0, T.makeRng(1));
  ok('melting away hides the rogue for two rounds', F.p[2].hidden === 2 && F.p[2].hiddenBonus === 4);
  ok('and nothing can aim at a hidden rogue', !T.targetable(F.p[2]));
  T.heldUpkeep(F.p, F.st, T.makeRng(1)); T.heldUpkeep(F.p, F.st, T.makeRng(1));
  ok('until it wears off', F.p[2].hidden === 0 && T.targetable(F.p[2]));
}

console.log('\n[G4] locks: picked, forced, knocked');
{
  const floor = { id: 'lf', depth: 3, w: 3, h: 1, cells: [0, 0, 0], features: {
    '1,0': { type: 'door', locked: true, keyId: 'it.key.rust' }, '2,0': { type: 'door', locked: true, keyId: 'it.key.rust', sealed: true },
    '0,0': { type: 'portcullis', needsLever: 'lv.x' } } };
  const p = party(10);
  ok('a lock is shut until something opens it', T.lockedShut({}, floor, '1,0'));
  ok('only someone who knows locks can pick one', T.lockChance(p[0], 2) === 0 && T.lockChance(p[2], 2) > 0.3 && T.bestPicker(p, 2).ch === p[2]);
  ok('a harder lock is harder', T.lockChance(p[2], 1) > T.lockChance(p[2], 5));
  let w = {};
  let r = T.pickLock(p, w, floor, '1,0', fixed(0));
  ok('a clean pick opens it, worth 10 a point of difficulty', r.ok && r.xp === 10 * T.lockDifficulty(floor.features['1,0'], 3) && !T.lockedShut(w, floor, '1,0'));
  w = {};
  r = T.pickLock(p, w, floor, '1,0', fixed(0.999));
  ok('a bad slip jams it', !r.ok && r.jammed && T.floorState(w, 'lf').jammed.indexOf('1,0') >= 0);
  ok('and a jammed lock cannot be picked again', /jammed/.test(T.pickLock(p, w, floor, '1,0', fixed(0)).notes[0]));
  ok('a near miss can be tried again', (() => { const c = T.bestPicker(p, 2).chance; const rr = T.pickLock(p, {}, floor, '1,0', fixed(Math.min(0.99, c + 0.1)));
     return !rr.ok && !rr.jammed && /tried again/.test(rr.notes[0]); })());
  ok('a sealed door has no keyhole for a pick', /Only its own key/.test(T.pickLock(p, {}, floor, '2,0', fixed(0)).notes[0]));
  ok('without a crowbar there is nothing to force it with', /nothing to force/.test(T.forceLock(p, w, floor, '1,0', fixed(0)).notes[0]));
  p[0].pack.push(T.makeItem('it.crowbar'));
  r = T.forceLock(p, w, floor, '1,0', fixed(0));
  ok('a crowbar forces even a jammed lock, loudly', r.ok && r.threat === 15 && !T.lockedShut(w, floor, '1,0') && T.floorState(w, 'lf').jammed.indexOf('1,0') < 0);
  ok('a failed heave is quieter, and can be tried again', (() => { const rr = T.forceLock(p, {}, floor, '1,0', fixed(0.999)); return !rr.ok && rr.threat === 6; })());
  ok('a sealed door will not be forced', /Only its own key/.test(T.forceLock(p, {}, floor, '2,0', fixed(0)).notes[0]));
  w = {};
  ok('Knock opens a locked door', T.knockOpen(w, floor, '1,0').ok && !T.lockedShut(w, floor, '1,0'));
  ok('and a portcullis', T.knockOpen(w, floor, '0,0').ok && T.floorState(w, 'lf').opened.indexOf('0,0') >= 0);
  ok('but not a sealed door', !T.knockOpen({}, floor, '2,0').ok);
  ok('the floor remembers its jammed locks through a save', T.FLOOR_LISTS.indexOf('jammed') >= 0 && Array.isArray(T.blankFloorState().jammed));
  ok('the Laboratory\'s warden door is sealed: its key, and nothing else', P.floors[2].features['6,6'].sealed === true);
  ok('and Ashkeld still needs no pick, bar or spell to finish', T.proveSolvable(clone(P)).ok);
}

console.log('\n[G5] signature moves');
{
  // spelt as Hold the Line spells them, so a monster reads the same in both packs
  ok('six new traits, in Hold the Line\'s spelling', ['burrow', 'charm', 'engulf', 'gaze', 'fireStops', 'radiantStops'].every(t => T.MONSTER_TRAITS.indexOf(t) >= 0) &&
     T.MONSTER_TRAITS.indexOf('swallow') < 0 && T.MONSTER_TRAITS.indexOf('petrify') < 0);
  ok('the monsters carry them', T.MONSTERS['mn.gelCube'].traits.indexOf('engulf') >= 0 && T.MONSTERS['mn.medusa'].traits.indexOf('gaze') >= 0 &&
     T.MONSTERS['mn.ankheg'].traits.indexOf('burrow') >= 0 && T.MONSTERS['mn.vampire'].traits.indexOf('charm') >= 0 &&
     T.MONSTERS['mn.troll'].traits.indexOf('fireStops') >= 0 && T.MONSTERS['mn.vampire'].traits.indexOf('radiantStops') >= 0);
  ok('the cube no longer paralyses, it swallows; the medusa\'s gaze is its own move', T.MONSTERS['mn.gelCube'].traits.indexOf('paralyse') < 0 &&
     T.MONSTERS['mn.medusa'].traits.indexOf('paralyse') < 0);
  // swallow
  let swallowed = 0, freed = 0, acid = 0, max = 0;
  for (let s = 1; s <= 60; s++) {
    const rg = T.makeRng(s), p = party(s, ['fighter', 'fighter', 'rogue', 'priest']);
    p.forEach(c => { c.bp = 200; });
    const cube = foesOf('mn.gelCube', 1, rg)[0];
    const st = T.beginCombat(p, [cube], rg, null);
    for (let k = 0; k < 6 && !p.some(c => T.hasStatus(c, 'swallowed')); k++) T.oneFoeTurn(p, st, cube, T.makeRng(s * 7 + k));
    const inside = p.filter(c => T.hasStatus(c, 'swallowed'))[0];
    if (!inside) continue;
    swallowed++;
    if (!T.targetable(inside) && T.isHeld(inside) && cube.holding === 'p' + p.indexOf(inside)) max++;
    let rounds = 0;
    while (T.hasStatus(inside, 'swallowed') && rounds < 10) { const b = inside.bp; T.heldUpkeep(p, st, T.makeRng(s + rounds)); if (inside.bp < b) acid++; rounds++; }
    if (rounds <= 4) freed++;
  }
  ok('the cube swallows whoever it strikes, now and then', swallowed > 20, swallowed);
  ok('inside, nobody can be aimed at and nothing can be done', max === swallowed);
  ok('the acid burns each round', acid > swallowed);
  ok('and no hero stays inside more than four rounds', freed === swallowed, freed + '/' + swallowed);
  {
    const rg = T.makeRng(4), p = party(4); const cube = foesOf('mn.gelCube', 1, rg)[0];
    const st = T.beginCombat(p, [cube], rg, null);
    p[0].status.push('swallowed'); cube.holding = 'p0'; cube.bp = 0;
    const notes = T.heldUpkeep(p, st, fixed(0.99));
    ok('when the cube dies, out they slide', !T.hasStatus(p[0], 'swallowed') && notes.some(n => /slides out/.test(n)));
  }
  // petrify
  let stoned = 0, looked = 0;
  for (let s = 1; s <= 80; s++) {
    const rg = T.makeRng(s), p = party(s); const med = foesOf('mn.medusa', 1, rg)[0];
    const st = T.beginCombat(p, [med], rg, null);
    const ev = T.signatureMoves(p, st, med, T.makeRng(s * 3));
    if (p.some(c => T.hasStatus(c, 'petrified'))) stoned++;
    if (ev.some(e => /looks away/.test(e.text))) looked++;
  }
  ok('the medusa\'s eyes turn someone to stone, now and then', stoned > 5 && stoned < 40, stoned);
  ok('and sometimes they look away in time', looked > 0);
  {
    const rg = T.makeRng(5), p = party(5); const med = foesOf('mn.medusa', 1, rg)[0];
    const st = T.beginCombat(p, [med], rg, null);
    p[1].status.push('petrified');
    ok('stone cannot be aimed at, and takes no turn', !T.targetable(p[1]) && T.isHeld(p[1]));
    let n = 0; while (T.hasStatus(p[1], 'petrified') && n < 10) { T.heldUpkeep(p, st, fixed(0.99)); n++; }
    ok('it cracks within four rounds even with the medusa standing', n <= 4, n);
    p[1].status.push('petrified'); med.bp = 0;
    T.heldUpkeep(p, st, fixed(0.99));
    ok('and at once when the medusa falls', !T.hasStatus(p[1], 'petrified'));
    p[1].status.push('petrified'); T.finishCombat(p, st, 'won');
    ok('nothing held outlasts the fight', !p.some(T.isHeld));
  }
  // charm: two rounds, turned on the others
  {
    const rg = T.makeRng(6), p = party(6); const v = foesOf('mn.vampire', 1, rg)[0];
    const st = T.beginCombat(p, [v], rg, null);
    p[0].status.push('charmed'); p[0].heldFor = 0;
    const bp = p.map(c => c.bp);
    const n1 = T.heldUpkeep(p, st, fixed(0.5)), still = T.hasStatus(p[0], 'charmed');
    const n2 = T.heldUpkeep(p, st, fixed(0.5));
    ok('a charmed hero turns on the others', (n1.concat(n2)).some(n => /smiling, strikes|swings at/.test(n)), n1.concat(n2).join(' / '));
    ok('for two turns, then shakes it off', still && !T.hasStatus(p[0], 'charmed'));
  }
  // burrow: up among the back rank
  {
    let backHit = 0, frontHit = 0;
    for (let s = 1; s <= 40; s++) {
      const rg = T.makeRng(s), p = party(s); p.forEach(c => { c.bp = 300; });
      const ank = T.makeEncounter('mn.ankheg', rg).slice(0, 1); ank[0].uid = 'a0';
      const st = T.beginCombat(p, ank, rg, null);
      st.log.filter(e => e.on).forEach(e => { if (e.on === 'p2' || e.on === 'p3') backHit++; else if (e.on === 'p0' || e.on === 'p1') frontHit++; });
      if (s === 1) ok('the floor heaves under the back rank', st.log.some(e => /floor heaves/.test(e.text)));
    }
    ok('and its first blows go to the back rank', backHit > 10 && frontHit === 0, backHit + ' back, ' + frontHit + ' front');
  }
  // fire stops a troll mending, for a turn
  {
    const rg = T.makeRng(7), p = party(7, ['fighter', 'fighter', 'mage', 'priest']);
    const troll = foesOf('mn.troll', 1, rg)[0]; troll.bp = Math.floor(troll.bpMax / 2);
    const st = T.beginCombat(p, [troll], rg, null);
    p[2].spellsKnown.push('sp.cinder'); p[2].mp = 50; turnOf(st, 2);
    T.partyAction(p, st, 'cast:sp.cinder', 0, T.makeRng(2));
    ok('fire burns a troll', troll.burnt === true);
    const b = troll.bp, notes = T.foeRegenerates(st, T.makeRng(1));
    ok('and the burnt flesh does not knit that turn', troll.bp === b && notes.some(n => /will not/.test(n)));
    T.foeRegenerates(st, T.makeRng(1));
    ok('but it does the turn after, unless it burns again', troll.bp > b);
    const v = foesOf('mn.vampire', 1, rg)[0]; v.bp = 10; const st2 = T.beginCombat(p, [v], rg, null);
    p[3].mp = 50; p[3].spellsKnown.push('sp.smite'); turnOf(st2, 3);
    T.partyAction(p, st2, 'cast:sp.smite', 0, T.makeRng(3));
    ok('holy light does the same to a radiantStops regenerator', v.burnt === true || v.bp === 0);
    const sen = foesOf('mn.ironSentinel', 1, rg)[0]; sen.bp = Math.floor(sen.bpMax / 2); const st3 = T.beginCombat(p, [sen], rg, null);
    p[2].mp = 50; turnOf(st3, 2); T.partyAction(p, st3, 'cast:sp.cinder', 0, T.makeRng(4));
    ok('but fire does nothing to a regenerator that does not say so', !sen.burnt);
  }
}

console.log('\n[G6] Silence and caltrops');
{
  const rg = T.makeRng(8), p = party(8, ['fighter', 'fighter', 'mage', 'priest']);
  p[3].spellsKnown.push('sp.silence'); p[3].mp = 50;
  const mage = T.makeEncounter('mn.renegadeMage', rg).slice(0, 1); mage[0].uid = 'm0';
  const st = T.beginCombat(p, mage, rg, null);
  turnOf(st, 3);
  const ev = T.partyAction(p, st, 'cast:sp.silence', 0, T.makeRng(1));
  ok('Silence is cast in a fight', st.silence === 3 && ev.some(e => /air goes dead/.test(e.text)));
  const ranged = mage[0].attacks.filter(a => a.reach === 'ranged')[0];
  const out = []; T.oneFoeAttack(p, st, mage[0], ranged, T.makeRng(2), out);
  ok('and a caster\'s working comes to nothing', out.some(e => /Nothing comes/.test(e.text)));
  T.heldUpkeep(p, st, fixed(0.5)); T.heldUpkeep(p, st, fixed(0.5)); T.heldUpkeep(p, st, fixed(0.5));
  ok('for three rounds', st.silence === 0);
  const nec = T.makeEncounter('mn.necromancer', rg).slice(0, 1); nec[0].uid = 'n0';
  const st2 = T.beginCombat(p, nec, rg, null); st2.silence = 2;
  let raised = 0; for (let s = 1; s <= 30; s++) raised += T.spawnerTurn(st2, T.makeRng(s)).length;
  ok('and nothing is raised under it', raised === 0 && T.MONSTERS['mn.necromancer'].traits.includes('caster'), raised);
  // caltrops
  const p2 = party(9); p2[2].pack.push(T.makeItem('it.caltrops'));
  const st3 = T.beginCombat(p2, foesOf('mn.orcRaider', 2, rg), rg, null);
  ok('caltrops are for fights, not empty halls', T.itemUsableNow(p2[2].pack[p2[2].pack.length - 1], 'combat') &&
     !T.itemUsableNow(p2[2].pack[p2[2].pack.length - 1], 'dungeon'));
  turnOf(st3, 2);
  T.partyAction(p2, st3, 'item:' + (p2[2].pack.length - 1), 0, T.makeRng(1));
  ok('scattered, they lie for three rounds and are used up', st3.caltrops === 3 && !p2[2].pack.some(i => i.ref === 'it.caltrops'));
  let hitsWith = 0, hitsWithout = 0;
  for (let s = 1; s <= 300; s++) {
    const a = []; const f = st3.foes[0];
    T.oneFoeAttack(p2, st3, f, f.attacks[0], T.makeRng(s), a); if (a.some(e => e.hit)) hitsWith++;
    const save = st3.caltrops; st3.caltrops = 0;
    const b = []; T.oneFoeAttack(p2, st3, f, f.attacks[0], T.makeRng(s), b); if (b.some(e => e.hit)) hitsWithout++;
    st3.caltrops = save; p2.forEach(c => { c.bp = 100; });
  }
  ok('their melee lands less often over the iron', hitsWith < hitsWithout, hitsWith + ' vs ' + hitsWithout);
  turnOf(st3, 0);
  T.partyAction(p2, st3, 'flee', 0, fixed(0.99));
  ok('and if you run while they are down, nothing follows', st3.outcome === 'fled');
}

console.log('\n[G7] the five spells');
{
  ok('the engine names what spells may do', ['knock', 'levitate', 'detectTraps', 'waterwalk', 'silence'].every(k => T.SPELL_KINDS.indexOf(k) >= 0));
  ok('a spell that does something unknown is refused (it used to load and do nothing)', (() => {
    const b = clone(P); b.spells['sp.knock'].effect.kind = 'unlockEverything'; return !T.validatePack(b).ok; })());
  ok('an item used for something unknown is refused', (() => {
    const b = clone(P); b.items['it.oil'].use.kind = 'splash'; return !T.validatePack(b).ok; })());
  ok('Knock and Levitate for the wizard; Detect Traps, Water Walk and Silence for the priest',
     T.SPELLS['sp.knock'].list === 'mage' && T.SPELLS['sp.levitate'].list === 'mage' && T.SPELLS['sp.detect'].list === 'priest' &&
     T.SPELLS['sp.waterwalk'].list === 'priest' && T.SPELLS['sp.silence'].list === 'priest');
  const p = party(11, ['fighter', 'fighter', 'mage', 'priest']);
  p[2].spellsKnown = ['sp.knock', 'sp.levitate']; p[3].spellsKnown = ['sp.detect', 'sp.waterwalk', 'sp.silence'];
  p[2].mp = p[3].mp = 30;
  ok('the four dungeon spells are cast between fights; Silence is not', T.fieldSpells(p[2]).length === 2 && T.fieldSpells(p[3]).join() === 'sp.detect,sp.waterwalk');
  ok('Knock wants a lock in front of it', !T.fieldNeed(p, 'sp.knock', {}) && T.fieldNeed(p, 'sp.knock', { lockAhead: true }));
  let r = T.castOutside(p, 2, 'sp.knock', null, T.makeRng(1), {});
  ok('and is not spent on a blank wall', !r.ok && p[2].mp === 30);
  r = T.castOutside(p, 2, 'sp.knock', null, T.makeRng(1), { lockAhead: true });
  ok('with one there, it says so to the caller', r.ok && r.knock && p[2].mp === 28);
  r = T.castOutside(p, 2, 'sp.levitate', null, T.makeRng(1), {});
  ok('Levitate floats the party a number of steps', r.ok && r.levitate === 24);
  r = T.castOutside(p, 3, 'sp.waterwalk', null, T.makeRng(1), {});
  ok('Water Walk the same', r.ok && r.waterwalk === 60);
  r = T.castOutside(p, 3, 'sp.detect', null, T.makeRng(1), {});
  ok('Detect Traps looks four squares round', r.ok && r.detect === 4);
  ok('in dead air, none of them', !T.castOutside(p, 2, 'sp.levitate', null, T.makeRng(1), { noCast: true }).ok);
  const rg = T.makeRng(1), back = T.deserialise(clone(T.serialise({ packId: P.id, packVersion: P.version, slotName: 'x', createdAt: 'x',
    playtimeSec: 1, worldSeed: 1, actionRngState: 1, gold: 1, threat: 0, levitateTurns: 7, waterwalkTurns: 30,
    position: { floor: 'f1', x: 1, y: 1, facing: 0 }, party: party(12), world: {}, questFlags: {} })), { packId: P.id });
  ok('floating and water-walking survive a save', back.ok && back.state.levitateTurns === 7 && back.state.waterwalkTurns === 30);
}

console.log('\n[G8] rings nobody can name, and curses');
{
  const p = party(13), c = p[0];
  const ring = T.makeItem('it.ring.fumble');
  ok('a found ring goes by a plain name', ring.unknown && T.itemLabel(ring) === 'Dull bronze ring');
  ok('and sells for a pittance until someone knows what it is', T.sellValue(ring) === 10);
  c.pack.push(ring);
  let r = T.equipItem(c, c.pack.length - 1);
  ok('putting it on is one way to find out', r.ok && !ring.unknown && r.notes.some(n => /Ring of Fumbling/.test(n)));
  ok('a cursed ring tightens and will not come off', r.cursed && !T.unequipItem(c, 'trinket').ok);
  c.pack.push(T.makeItem('it.ring.smoke'));
  ok('nor make room for another', !T.equipItem(c, c.pack.length - 1).ok);
  r = T.doUncurse(c, 'trinket', 500);
  ok('Mitz lifts the curse, and the ring is gone', r.ok && r.gold === 500 - T.uncurseCost() && !c.equipped.trinket);
  ok('lifting a curse costs gold', !T.doUncurse(Object.assign(c, {}), 'trinket', 500).ok);
  const smoke = c.pack[c.pack.length - 1];
  r = T.doIdentify(c, c.pack.length - 1, 100);
  ok('Simz will name a ring for a fee', r.ok && !smoke.unknown && r.gold === 100 - T.identifyCost() && /Ring of Smoke/.test(r.notes[0]));
  ok('and a known good ring sells for what it is worth', T.sellValue(smoke) > 50);
  T.equipItem(c, c.pack.length - 1);
  ok('a Ring of Smoke is two points of defence', c.armorBonus >= 2 && T.unequipItem(c, 'trinket').ok);
  ok('only something you wear can be cursed', (() => { const b = clone(P); b.items['it.potion'].cursed = true; return !T.validatePack(b).ok; })());
  ok('a ring with no name to go by is refused', (() => { const b = clone(P); b.items['it.ring.smoke'].unknown = 7; return !T.validatePack(b).ok; })());
  ok('rings in the shop are not on its shelves', ['it.ring.fumble', 'it.ring.lead', 'it.ring.smoke'].every(k => P.shopStock.indexOf(k) < 0));
  ok('Ashkeld hides one cursed and one good', P.floors[1].features['1,10'].item === 'it.ring.fumble' && P.floors[2].features['3,5'].item === 'it.ring.smoke');
  const rings = T.genRings(P);
  ok('the generator keeps a good ring twice as likely as any one curse', rings.filter(k => k === 'it.ring.smoke').length === 2 && rings.length === 4);
  let found = 0, shallow = 0, proven = true;
  for (let s = 1; s <= 30; s++) {
    const d = T.generateDelve(s, { floors: 6, basePack: P });
    if (!d.ok || !T.proveSolvable(d.pack).ok) proven = false;
    d.pack.floors.forEach(f => Object.values(f.features).forEach(ft => { if (ft.item && rings.indexOf(ft.item) >= 0) { found++; if (f.depth < 2) shallow++; } }));
  }
  ok('and leaves them in plain chests from the second floor down', found > 15 && shallow === 0, found + ' / ' + shallow);
  ok('with every delve still proven', proven);
}

console.log('\n[G9] the tools themselves');
{
  ok('rope, crowbar, oil and caltrops are on Simz\'s shelves', ['it.rope', 'it.crowbar', 'it.oil', 'it.caltrops'].every(k => P.shopStock.indexOf(k) >= 0));
  ok('rope and crowbar are tools, kept rather than used up', T.ITEMS['it.rope'].tags.indexOf('tool') >= 0 && !T.ITEMS['it.rope'].use &&
     T.ITEMS['it.crowbar'].tags.indexOf('tool') >= 0);
  ok('a flask of oil is thrown fire', T.ITEMS['it.oil'].use.kind === 'damage' && T.ITEMS['it.oil'].use.element === 'fire');
  const p = party(14);
  ok('carrying finds the tool in anyone\'s pack', !T.carrying(p, 'it.rope') && (p[3].pack.push(T.makeItem('it.rope')), T.carrying(p, 'it.rope').ci === 3));
  ok('a fallen hero carries nothing for the party', (p[3].bp = 0, !T.carrying(p, 'it.rope')));
  ok('an unknown tag is refused', (() => { const b = clone(P); b.items['it.rope'].tags = ['gadget']; return !T.validatePack(b).ok; })());
}

console.log('\n[G10] Suggest a party offers the Rogue');
{
  const one = T.quickPartyMix(0);
  ok('the first suggestion is one of each', one.slice().sort().join() === 'fighter,mage,priest,rogue', one.join());
  ok('with the Fighter and the Priest in front', one[0] === 'fighter' && one[1] === 'priest', one.slice(0, 2).join());
  const all = [0, 1, 2, 3].map(t => T.quickPartyMix(t).join());
  ok('each press after deals another mix', new Set(all).size === 4, all.join(' | '));
  ok('the old four are still among them', all.indexOf('fighter,fighter,mage,priest') >= 0);
  ok('the Rogue is in two of the four', all.filter(m => m.indexOf('rogue') >= 0).length === 2);
  ok('and it comes round again', T.quickPartyMix(4).join() === one.join() && T.quickPartyMix(-1).join() === T.quickPartyMix(3).join());
  ok('a suggestion is never shared out', (() => { const a = T.quickPartyMix(0); a[0] = 'mage'; return T.quickPartyMix(0)[0] === 'fighter'; })());
  ok('every mix is four of the core classes', T.QUICK_PARTIES.every(m => m.length === 4 && m.every(c => !!T.CLASSES[c])));
  ok('every one has someone fit for the front', T.QUICK_PARTIES.every(m => m[0] === 'fighter'));
  // the source still deals from the rotation, front rank first
  ok('the roster asks for it in turn', /var want = quickPartyMix\(quickPartyTurn\+\+\);/.test(src) &&
     /quickPartyTurn = 0;\s+\/\/ a fresh roster suggests one of each first/.test(src));
}

console.log('\n[G11] the Rogue\'s new lessons: Dirty Trick, Knife Flurry, Assassinate');
{
  const SK = T.PACK.skills;
  const rogueSkills = Object.keys(SK).filter(k => SK[k].list === 'rogue');
  const fighterSkills = Object.keys(SK).filter(k => SK[k].list === 'fighter');
  const byTier = list => [1, 2, 3].map(t => list.filter(k => SK[k].tier === t).length).join('/');
  ok('the Rogue now trains five, shaped like the Fighter\'s', rogueSkills.length === 5 && byTier(rogueSkills) === byTier(fighterSkills), byTier(rogueSkills) + ' vs ' + byTier(fighterSkills));
  ok('a new rogue still starts with Backstab', T.startingSkills('rogue').join() === 'sk.backstab');
  const lv = n => { const c = party(40)[2]; c.level = n; c.skills = ['sk.backstab']; return T.learnableSkills(c).sort().join(); };
  ok('Dirty Trick at level 1, Knife Flurry at 3, Assassinate at 5', lv(1) === 'sk.trick' && lv(3) === 'sk.flurry,sk.hide,sk.trick' && lv(5).indexOf('sk.assassinate') >= 0, lv(1) + ' | ' + lv(3) + ' | ' + lv(5));
  const go = (seed, opts) => {
    opts = opts || {};
    const rg = T.makeRng(seed), p = party(seed, opts.classes);
    const foes = foesOf(opts.ref || 'mn.orcRaider', opts.n || 2, rg);
    const st = T.beginCombat(p, foes, rg, opts.ground || null);
    p.forEach(c => { c.skills = (c.skills || []).concat(c.class === 'rogue' ? ['sk.trick', 'sk.flurry', 'sk.hide', 'sk.assassinate'] : []); });
    return { p, st, foes };
  };
  const R = 2;
  // Dirty Trick
  let F = go(41, { n: 3 }); F.foes[2].rank = 'back'; turnOf(F.st, R);
  const def0 = F.foes.map(f => f.defBonus);
  let ev = T.partyAction(F.p, F.st, 'skill:sk.trick', 0, T.makeRng(1));
  ok('Dirty Trick leaves their whole front rank half-blind for two rounds', F.foes[0].blinded === 2 && F.foes[1].blinded === 2 &&
     F.foes[0].blindBy === 3 && !F.foes[2].blinded, ev.map(e => e.text).join(' / '));
  ok('and 3 easier to hit while it lasts', F.foes[0].defBonus === def0[0] - 3 && F.foes[1].defBonus === def0[1] - 3 && F.foes[2].defBonus === def0[2]);
  F.p[R].cooldowns['sk.trick'] = 0; turnOf(F.st, R);
  T.partyAction(F.p, F.st, 'skill:sk.trick', 0, T.makeRng(2));
  ok('a second handful does not stack', F.foes[0].defBonus === def0[0] - 3 && F.foes[0].blinded === 2);
  ok('and then waits three rounds', F.p[R].cooldowns['sk.trick'] === 3);
  F = go(42, { classes: ['rogue', 'fighter', 'fighter', 'priest'] }); turnOf(F.st, 0);
  T.partyAction(F.p, F.st, 'skill:sk.trick', 0, T.makeRng(1));
  ok('it works from the front rank too', F.foes[0].blinded === 2);
  const hitRate = blind => { let h = 0; const N = 3000;
    for (let k = 0; k < N; k++) { const G = go(43); G.p.forEach(c => { c.bp = 999; });
      const f = G.foes[0]; if (blind) { f.blinded = 2; f.blindBy = 3; }
      const e2 = []; T.oneFoeAttack(G.p, G.st, f, f.attacks[0], T.makeRng(7000 + k), e2);
      if (e2.some(e => e.kind === 'foehit')) h++; }
    return h / N; };
  const seeing = hitRate(false), blind = hitRate(true);
  ok('a half-blind foe lands about 15% fewer blows', seeing - blind > 0.1 && seeing - blind < 0.2, (seeing * 100).toFixed(0) + '% vs ' + (blind * 100).toFixed(0) + '%');
  F = go(44); F.p.forEach(c => { c.bp = 999; }); F.foes.forEach(f => { f.bp = 999; f.bpMax = 999; });
  const def44 = F.foes[0].defBonus;
  turnOf(F.st, R); T.partyAction(F.p, F.st, 'skill:sk.trick', 0, T.makeRng(1));
  const roundsAt = [], defAt = [];
  for (let g = 0; g < 400 && roundsAt.length < 2; g++) {
    const r0 = F.st.round;
    T.partyAction(F.p, F.st, 'defend', 0, T.makeRng(g)); T.advanceCombat(F.p, F.st, T.makeRng(g + 1));
    if (F.st.round !== r0) { roundsAt.push(F.foes[0].blinded); defAt.push(F.foes[0].defBonus - def44); }
  }
  ok('the grit wears off a round at a time', roundsAt.join() === '1,0', roundsAt.join());
  ok('and then it can see blows coming again', defAt.join() === '-3,0', defAt.join());
  F = go(45, { ref: 'mn.clayGolem', n: 1 }); turnOf(F.st, R);
  ev = T.partyAction(F.p, F.st, 'skill:sk.trick', 0, T.makeRng(1));
  ok('a golem has no eyes to fill', !F.foes[0].blinded && ev.some(e => /no eyes/.test(e.text)));
  // Knife Flurry
  F = go(46); F.foes.forEach(f => { f.bp = 999; f.bpMax = 999; f.defense = -50; }); F.foes[1].rank = 'back'; turnOf(F.st, R);
  ev = T.partyAction(F.p, F.st, 'skill:sk.flurry', 1, fixed(0.5));
  const knives = ev.filter(e => e.by === 'p' + R && e.reach === 'ranged');
  ok('Knife Flurry throws two knives', knives.length === 2 && knives.every(e => e.hit), ev.map(e => e.text).join(' / '));
  ok('and reaches the back rank', knives.every(e => e.on === F.foes[1].uid));
  ok('a d4 apiece, with the rogue\'s knack', knives.every(e => e.dmg >= 1 && e.dmg <= 4 + T.strikeMod(F.p[R])));
  F = go(47); F.foes.forEach(f => { f.defense = -50; }); F.foes[0].bp = 1; F.foes[1].bp = 999; F.foes[1].bpMax = 999; turnOf(F.st, R);
  ev = T.partyAction(F.p, F.st, 'skill:sk.flurry', 0, fixed(0.5));
  ok('when the first knife drops it, the second finds another', ev.filter(e => e.reach === 'ranged').map(e => e.on).join() === F.foes[0].uid + ',' + F.foes[1].uid && F.foes[0].bp === 0);
  F = go(48, { classes: ['rogue', 'fighter', 'fighter', 'priest'] }); F.foes.forEach(f => { f.defense = -50; f.bp = 999; }); turnOf(F.st, 0);
  ev = T.partyAction(F.p, F.st, 'skill:sk.flurry', 0, fixed(0.5));
  ok('from the front rank as well', ev.filter(e => e.reach === 'ranged' && e.hit).length === 2);
  ok('at -2 to hit', SK['sk.flurry'].effect.toHit === -2 && /sk\.effect\.toHit != null \? sk\.effect\.toHit : -2/.test(src));
  // Assassinate
  const asg = (seed, set, opts) => { const G = go(seed, opts); G.foes.forEach(f => { f.defense = -50; f.bp = 999; f.bpMax = 999; }); set && set(G); turnOf(G.st, (opts && opts.at) != null ? opts.at : R);
    const e2 = T.partyAction(G.p, G.st, 'skill:sk.assassinate', 0, fixed(0.5)); return { G, ev: e2 }; };
  let A = asg(50, G => { G.foes[0].bp = 99; G.foes[0].bpMax = 300; });
  ok('Assassinate finishes anything left below a third', A.G.foes[0].bp === 0 && A.ev.some(e => /does not get up/.test(e.text)), A.ev.map(e => e.text).join(' / '));
  ok('and the blow is staged from the rogue', A.ev.some(e => e.by === 'p' + R && e.reach === 'melee' && e.hit));
  A = asg(51, G => { G.foes[0].bp = 99; G.foes[0].bpMax = 300; G.foes[0].traits.push('boss'); });
  ok('but never a boss', A.G.foes[0].bp > 0);
  A = asg(52, G => { G.foes[0].bp = 250; G.foes[0].bpMax = 300; });
  ok('nor anything left above the line', A.G.foes[0].bp > 102);
  const avg = (sk, lvl) => { let tot = 0; for (let k = 1; k <= 300; k++) { const G = go(600 + k); G.p[R].level = lvl;
      G.foes.forEach(f => { f.bp = 990; f.bpMax = 999; f.defense = -50; }); turnOf(G.st, R);
      T.partyAction(G.p, G.st, 'skill:' + sk, 0, T.makeRng(k)); tot += 990 - G.foes[0].bp; } return tot / 300; };
  const b5 = avg('sk.backstab', 5), a5 = avg('sk.assassinate', 5);
  ok('the sneak dice three times over (two d6 at level 5, so four more)', a5 - b5 > 11 && a5 - b5 < 17, b5.toFixed(1) + ' vs ' + a5.toFixed(1));
  F = go(53, { classes: ['rogue', 'fighter', 'fighter', 'priest'] }); turnOf(F.st, 0);
  ev = T.partyAction(F.p, F.st, 'skill:sk.assassinate', 0, T.makeRng(1));
  ok('in the thick of it there is no getting round', ev.some(e => /thick of it/.test(e.text)) && !F.p[0].cooldowns['sk.assassinate']);
  F = go(54); F.p[0].bp = 0; F.p[1].bp = 0; turnOf(F.st, R);
  ev = T.partyAction(F.p, F.st, 'skill:sk.assassinate', 0, T.makeRng(1));
  ok('nor with nobody keeping them busy', ev.some(e => /Nobody is keeping them busy/.test(e.text)));
  F = go(55, { ground: { narrow: true, abreast: 1, doorway: true } }); turnOf(F.st, R);
  ev = T.partyAction(F.p, F.st, 'skill:sk.assassinate', 0, T.makeRng(1));
  ok('nor in a doorway', ev.some(e => /doorway/.test(e.text)));
  // from hiding
  const fromDark = (seed, set, opts) => { const G = go(seed, opts); G.foes.forEach(f => { f.defense = -50; f.bp = 999; f.bpMax = 999; }); set && set(G);
    const at = (opts && opts.at) != null ? opts.at : R;
    turnOf(G.st, at); T.partyAction(G.p, G.st, 'skill:sk.hide', 0, T.makeRng(1));
    turnOf(G.st, at); const e2 = T.partyAction(G.p, G.st, 'skill:sk.assassinate', 0, fixed(0.5)); return { G, ev: e2, at }; };
  A = fromDark(56, G => { G.foes[0].bp = 160; G.foes[0].bpMax = 300; });
  ok('from hiding, it finishes anything left below half', A.G.foes[0].bp === 0 && A.ev.some(e => /comes out of the dark/.test(e.text)), A.ev.map(e => e.text).join(' / '));
  let B = asg(56, G => { G.foes[0].bp = 160; G.foes[0].bpMax = 300; });
  ok('where out in the open the same blow would not', B.G.foes[0].bp > 0);
  A = fromDark(57, G => { G.foes[0].bp = 900; });
  B = asg(57, G => { G.foes[0].bp = 900; });
  ok('from hiding it lands as a critical even on something hurt', A.ev.some(e => e.crit && e.hit) && (999 - 900) >= 0 &&
     (900 - A.G.foes[0].bp) > (900 - B.G.foes[0].bp), (900 - A.G.foes[0].bp) + ' vs ' + (900 - B.G.foes[0].bp));
  A = fromDark(58, G => { G.p[0].bp = 0; G.p[1].bp = 0; });
  ok('and needs nobody to keep them busy', A.ev.some(e => e.by === 'p' + R && e.hit));
  A = fromDark(59, null, { classes: ['rogue', 'fighter', 'fighter', 'priest'], at: 0 });
  ok('even from the front rank', A.ev.some(e => e.by === 'p0' && e.hit));
  ok('and the rogue is in plain sight again after', A.G.p[0].hidden === 0 && A.G.p[0].hiddenBonus === 0);
  ok('Melt Away says so in the shop', /Assassinate from hiding/.test(SK['sk.hide'].blurb));
  // the buttons aim at a foe
  ok('the new lessons aim at a foe, round the press or anything in sight',
     /kind === 'backstab' \|\| sk\.effect\.kind === 'assassinate'\)\)\s*return \{ side: 'foe', pool: engagedFoes\(cst\) \}/.test(src) &&
     /sk\.effect\.kind === 'flurry'\)\s*return \{ side: 'foe', pool: anyTargets\(cst\) \}/.test(src));
  ok('Dirty Trick needs no aim: it takes the whole line', !/kind === 'dirt'[^\n]*side: 'foe'/.test(src));
}

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

// Party balance test (groundwork for the v5.0 balance pass).
//
// Plays real fights through the game's own rules (the COMBAT, PARTY, TOWN, GEN
// and INVENTORY cores lifted out of the page, as the test runners do), with a
// sensible player's tactics and kit, for many party mixes and seeds:
//
//   Ashkeld   the hand-made campaign, three floors, from level 1
//   Delve     an 8-floor generated delve, from level 1
//
//   node party_balance.js [game.html] [runs per mix] [mix,mix,...]
//   mixes are four letters, front rank first: F fighter, R rogue, M wizard, P priest
//   BALANCE_PATCH=leech,packs runs the what-ifs below
//
// What it models, and what it doesn't, is printed with the results.
'use strict';
const fs = require('fs');
const FILE = process.argv[2] || (fs.existsSync('./index.html') ? './index.html' : './msdd_delve_v4.9.html');
const RUNS = Number(process.argv[3] || 200);
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
const src = fs.readFileSync(FILE, 'utf8');
function grab(t) {
  const re = new RegExp('/\\* ==== ' + t + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + t + ' END ==== \\*/');
  const m = src.match(re); if (!m) throw new Error(t + ' missing'); return m[1];
}
const names = ['PACK', 'RULES', 'MONSTERS', 'SPELLS', 'ITEMS', 'CLASSES', 'MAX_LEVEL',
  'makeRng', 'rollStats', 'meetsMinimums', 'makeCharacter', 'makeItem', 'startingKit',
  'grantStartingSpells', 'grantStartingSkills', 'normalisePositions', 'recomputeArmor', 'maxBP', 'maxMP',
  'canLevel', 'levelUp', 'learnableSkills', 'learnableSpells', 'canUse',
  'makeEncounter', 'makeGroup', 'beginCombat', 'partyAction', 'advanceCombat', 'activeActor',
  'meleeTargets', 'engagedParty', 'frontRank', 'backRank', 'isFront', 'setRank', 'weaponReach',
  'skillReady', 'hasTrait', 'isHeld', 'setMonsterScale', 'generateDelve', 'castOutside', 'fieldSpells', 'strikeMod'];
const G = new Function(grab('BUNDLED PACK') + grab('PACK CORE') +
  '\nvar __L=loadPack(BUNDLED_PACK); if(!__L.ok) throw new Error(__L.errors.join("; "));\n' +
  ['MAP CORE', 'PARTY CORE', 'SAVE CORE', 'WORLD CORE', 'EVENT CORE', 'COMBAT CORE', 'TOWN CORE',
   'GEN CORE', 'INVENTORY CORE'].map(grab).join('\n') + '\nreturn {' + names.join(',') + '};')();

/* What-ifs for the balance pass: BALANCE_PATCH=leech,... changes the bestiary
   in memory before the runs. Nothing is written back. */
// The v4.9 what-ifs (leeches 3-6, wolves and raiders 2-5) went into the game in
// v5.0, so they are gone from here. Add a new one in the same shape to try it.
const PATCHES = {};
(process.env.BALANCE_PATCH || '').split(',').filter(Boolean).forEach(k => { if (!PATCHES[k]) throw new Error('no patch ' + k); PATCHES[k](); });

/* ---------------- the party ---------------- */
const CODE = { F: 'fighter', R: 'rogue', M: 'mage', P: 'priest' };
const NAME = { F: 'Fighter', R: 'Rogue', M: 'Wizard', P: 'Priest' };
// who takes the front rank: the best armoured first
const FRONT_PRI = { fighter: 4, priest: 3, rogue: 2, mage: 1 };

function rollFor(rng, cls) {                 // reroll until the class may be taken, as the roster does
  for (let g = 0; g < 200; g++) { const s = G.rollStats(rng); if (G.meetsMinimums(s, cls)) return s; }
  throw new Error('no stats for ' + cls);
}
function makeParty(mix, rng) {
  const p = mix.split('').map((k, i) => G.makeCharacter(NAME[k] + (i + 1), CODE[k], rollFor(rng, CODE[k]), 'stoic', i % 2 ? 'female' : 'male'));
  G.grantStartingSpells(p); G.grantStartingSkills(p); G.startingKit(p);
  // ranks: the two best armoured in front
  const order = p.slice().sort((a, b) => FRONT_PRI[b.class] - FRONT_PRI[a.class] || G.maxBP(b) - G.maxBP(a));
  p.forEach(c => { c.effects = []; c.cooldowns = {}; G.setRank(c, order.indexOf(c) < 2); });
  return p;
}

/* Kit a sensible player buys as the money comes in: tier 0 at the start,
   1 after the second floor, 2 after the fifth. Back-rank fighters, priests and
   rogues take a crossbow or bow; a wizard a sling. */
const KIT = {
  fighter: { front: [['it.shortsword', 'it.leather', 'it.buckler'], ['it.longsword', 'it.chainmail', 'it.kiteshield'], ['it.longsword', 'it.plate', 'it.towershield']],
             back:  [['it.crossbow', 'it.leather'], ['it.longbow', 'it.chainmail'], ['it.longbow', 'it.plate']] },
  priest:  { front: [['it.club', 'it.leather', 'it.buckler'], ['it.mace', 'it.scalemail', 'it.kiteshield'], ['it.morningstar', 'it.plate', 'it.towershield']],
             back:  [['it.crossbow', 'it.leather'], ['it.crossbow', 'it.scalemail'], ['it.crossbow', 'it.plate']] },
  rogue:   { front: [['it.shortsword', 'it.leather'], ['it.shortsword', 'it.leather'], ['it.shortsword', 'it.leather']],
             back:  [['it.shortbow', 'it.leather'], ['it.crossbow', 'it.leather'], ['it.crossbow', 'it.leather']] },
  mage:    { front: [['it.quarterstaff'], ['it.quarterstaff'], ['it.quarterstaff']],
             back:  [['it.sling'], ['it.sling'], ['it.sling']] }
};
function kitUp(party, tier) {
  party.forEach(c => {
    const set = KIT[c.class][G.isFront(c) ? 'front' : 'back'][tier];
    c.equipped = { weapon: null, armor: null, shield: null };
    set.forEach(id => {
      const it = G.makeItem(id);
      if (!G.canUse(c, it)) throw new Error(c.class + ' cannot use ' + id);
      c.equipped[it.slot] = it;
    });
    G.recomputeArmor(c);
  });
}

/* Town: Mitz heals and revives, the party trains and learns everything open to it. */
function town(party, tier, rng, log) {
  party.forEach(c => {
    while (G.canLevel(c)) G.levelUp(c, rng);
    G.learnableSpells(c).forEach(s => c.spellsKnown.push(s));
    G.learnableSkills(c).forEach(s => c.skills.push(s));
    c.bp = G.maxBP(c); c.mp = G.maxMP(c);
    c.status = []; c.effects = []; c.cooldowns = {};
  });
  kitUp(party, tier);
  if (log) log.town++;
}

/* ---------------- tactics ---------------- */
const pct = c => c.bp / G.maxBP(c);
// BALANCE_OFF=trick,flurry,assassinate,hide leaves a technique out of the tactics, to see what it is worth
const OFF = (process.env.BALANCE_OFF || '').split(',').filter(Boolean);
function choose(party, i, st) {
  const ch = party[i], cls = ch.class;
  const alive = party.filter(c => c.bp > 0);
  const foes = st.foes.filter(f => f.bp > 0);
  const fi = f => st.foes.indexOf(f), pi = c => party.indexOf(c);
  const knows = id => (ch.spellsKnown || []).indexOf(id) >= 0 && ch.mp >= G.SPELLS[id].mp;
  const ready = id => (ch.skills || []).indexOf(id) >= 0 && G.skillReady(ch, id) && OFF.indexOf(id.slice(3)) < 0;
  const front = G.isFront(ch), ranged = G.weaponReach(ch) === 'ranged';
  const mt = G.meleeTargets(st).filter(f => f.bp > 0);
  const lowest = arr => arr.reduce((a, b) => (a.bp <= b.bp ? a : b));
  const biggest = arr => arr.reduce((a, b) => (a.bp >= b.bp ? a : b));
  const atk = pool => ['attack', fi(lowest(pool.length ? pool : foes))];
  const boss = foes.filter(f => G.hasTrait(f, 'boss'))[0];
  const undead = foes.filter(f => G.hasTrait(f, 'undead'));
  const fFront = foes.filter(f => f.rank !== 'back'), fBack = foes.filter(f => f.rank === 'back');
  const totalFoeBP = foes.reduce((a, f) => a + f.bp, 0);
  const smallFight = !boss && totalFoeBP <= 10;     // not worth the spell points
  st.__acts = (st.__acts || 0) + 1;

  if (cls === 'priest') {
    const down = party.filter(c => c.bp <= 0);
    if (down.length && knows('sp.revive')) return ['cast:sp.revive', pi(down[0])];
    const hurt = alive.filter(c => pct(c) < 0.45).sort((a, b) => pct(a) - pct(b));
    if (alive.filter(c => pct(c) < 0.65).length >= 3 && knows('sp.massmend')) return ['cast:sp.massmend', 0];
    if (hurt.length) {
      if (knows('sp.mend2') && G.maxBP(hurt[0]) - hurt[0].bp > 14) return ['cast:sp.mend2', pi(hurt[0])];
      if (knows('sp.mend1')) return ['cast:sp.mend1', pi(hurt[0])];
    }
    const spare = ch.mp - 6;                          // keep a heal or two in hand
    if (undead.length >= 2 && knows('sp.turn') && spare >= 5) return ['cast:sp.turn', undead.some(f => f.rank !== 'back') ? 0 : 1];
    if (undead.length >= 2 && knows('sp.radiance') && spare >= 5) return ['cast:sp.radiance', undead.some(f => f.rank !== 'back') ? 0 : 1];
    if (!st.__blessed && (boss || foes.length >= 3) && knows('sp.bless') && spare >= 3) { st.__blessed = 1; return ['cast:sp.bless', 0]; }
    if ((boss || undead.length) && knows('sp.smite') && spare >= 4) return ['cast:sp.smite', fi(boss || undead[0])];
    if (front || ranged) return atk(ranged ? foes : mt);
    return ['defend', 0];
  }
  if (cls === 'mage') {
    if (!smallFight) {
      if (foes.length >= 3 && knows('sp.chain')) return ['cast:sp.chain', fi(biggest(foes))];
      if (foes.length >= 3 && knows('sp.spark')) return ['cast:sp.spark', 0];
      const rank = fFront.length >= fBack.length ? 0 : 1, n = Math.max(fFront.length, fBack.length);
      if (n >= 2 && knows('sp.wallfire')) return ['cast:sp.wallfire', rank];
      if (n >= 3 && knows('sp.cinder')) return ['cast:sp.cinder', rank];
      if (boss && !st.__dazzled && knows('sp.dazzle')) { st.__dazzled = 1; return ['cast:sp.dazzle', fi(boss)]; }
      const big = biggest(foes);
      if (knows('sp.unmake') && big.bp >= 18) return ['cast:sp.unmake', fi(big)];
      if (knows('sp.frost') && big.bp >= 8) return ['cast:sp.frost', fi(big)];
      if (knows('sp.bolt1')) return ['cast:sp.bolt1', fi(lowest(foes))];
    }
    if (front || ranged) return atk(ranged ? foes : mt);
    return ['defend', 0];
  }
  if (cls === 'fighter') {
    if (front) {
      if (ready('sk.wall') && foes.length >= 3 && !st.__wall) { st.__wall = 1; return ['skill:sk.wall', 0]; }
      if (ready('sk.taunt') && G.backRank(party).some(c => pct(c) < 0.5)) return ['skill:sk.taunt', 0];
      if (ready('sk.cleave') && mt.length >= 2) return ['skill:sk.cleave', fi(lowest(mt))];
      return atk(mt);
    }
    return ranged ? atk(foes) : ['defend', 0];
  }
  if (cls === 'rogue') {
    const holding = G.frontRank(party).some(c => c.bp > 0 && !G.isHeld(c));
    const hidden = ch.hidden > 0;
    const eng = mt.length ? mt : foes;
    const avgDice = d => d ? d[0] * (d[1] + 1) / 2 + (d[2] || 0) : 0;
    const hardest = f => Math.max.apply(null, (f.attacks || []).map(a => avgDice(a.damage)).concat([0]));
    // Assassinate: from hiding anything goes; otherwise round the press
    if (ready('sk.assassinate') && (hidden || (!front && holding))) {
      const nonBoss = eng.filter(f => !G.hasTrait(f, 'boss'));
      return ['skill:sk.assassinate', fi(boss && !nonBoss.length ? boss : biggest(nonBoss.length ? nonBoss : eng))];
    }
    // Melt Away first when Assassinate is ready and something is worth it
    if (ready('sk.hide') && ready('sk.assassinate') && !hidden && (boss || biggest(foes).bp >= 20)) return ['skill:sk.hide', 0];
    if (!front && ready('sk.backstab') && holding) {
      const fresh = eng.filter(f => f.bp >= f.bpMax);          // a clean first cut is a critical
      return ['skill:sk.backstab', fi(fresh.length ? biggest(fresh) : lowest(eng))];
    }
    // grit across their front rank, when it matters
    if (ready('sk.trick') && (alive.some(c => pct(c) < 0.6) || boss)) {
      const line = foes.filter(f => f.rank !== 'back');
      const seeing = (line.length ? line : foes).filter(f => !(f.blinded > 0) && !G.hasTrait(f, 'construct'));
      if (seeing.length >= 2 || (seeing.length && (seeing[0] === boss || hardest(seeing[0]) >= 7))) return ['skill:sk.trick', 0];
    }
    // knives when they beat what is in hand
    const flurryAvg = 2 * (2.5 + G.strikeMod(ch)) * 0.9;
    const handAvg = (front || ranged) ? avgDice((ch.equipped.weapon || {}).damage) + G.strikeMod(ch) : 0;
    if (ready('sk.flurry') && flurryAvg > handAvg) return ['skill:sk.flurry', fi(lowest(foes))];
    if (front) {
      if (ready('sk.hide') && pct(ch) < 0.35) return ['skill:sk.hide', 0];
      return atk(mt);
    }
    if (ranged) return atk(foes);
    if (ready('sk.hide')) return ['skill:sk.hide', 0];
    return ['defend', 0];
  }
  return ['defend', 0];
}

function fight(party, foes, rng, log) {
  const st = G.beginCombat(party, foes, rng, null);
  let guard = 0;
  while (!st.outcome && guard++ < 4000) {
    const i = G.activeActor(st);
    if (i === null) { G.advanceCombat(party, st, rng); continue; }
    const [act, tgt] = choose(party, i, st);
    const before = (st.refusals && st.refusals[i]) || 0;
    G.partyAction(party, st, act, tgt, rng);
    if (!st.outcome && G.activeActor(st) === i && ((st.refusals || {})[i] || 0) > before) {
      log.refused[act.split(':')[0] + ':' + party[i].class] = (log.refused[act.split(':')[0] + ':' + party[i].class] || 0) + 1;
      G.partyAction(party, st, 'defend', 0, rng);
    }
    G.advanceCombat(party, st, rng);
  }
  if (!st.outcome) log.stalls++;
  log.fights++;
  log.rounds += st.__acts || 0;
  log.downed += party.filter(c => c.bp <= 0).length;
  return st.outcome;
}

/* Between fights: the priest mends whoever is worst, if it can spare it. */
function mendBetween(party, rng) {
  party.forEach((p, pi) => {
    if (p.class !== 'priest' || p.bp <= 0) return;
    for (let g = 0; g < 6; g++) {
      const hurt = party.filter(c => c.bp > 0 && pct(c) < 0.7).sort((a, b) => pct(a) - pct(b))[0];
      if (!hurt) return;
      const sid = (p.spellsKnown.indexOf('sp.mend2') >= 0 && p.mp >= 5 + 4 && G.maxBP(hurt) - hurt.bp > 14) ? 'sp.mend2'
                : (p.spellsKnown.indexOf('sp.mend1') >= 0 && p.mp >= 2 + 4) ? 'sp.mend1' : null;
      if (!sid) return;
      const r = G.castOutside(party, pi, sid, party.indexOf(hurt), rng, {});
      if (!r.ok) return;
    }
  });
}
function rest(party, frac) {
  party.forEach(c => { if (c.bp > 0) { c.bp = Math.min(G.maxBP(c), c.bp + Math.ceil(G.maxBP(c) * frac)); c.mp = Math.min(G.maxMP(c), c.mp + Math.ceil(G.maxMP(c) * frac)); } });
}
const partyFrac = p => p.reduce((a, c) => a + Math.max(0, c.bp), 0) / p.reduce((a, c) => a + G.maxBP(c), 0);
const casterMP = p => { const cs = p.filter(c => G.maxMP(c) > 0 && c.bp > 0); return cs.length ? cs.reduce((a, c) => a + c.mp / G.maxMP(c), 0) / cs.length : 1; };

/* One floor: its placed fights and some wanderers, with rests and town trips. */
function playFloor(party, fl, depth, tierFn, rng, log, maxWipes) {
  G.setMonsterScale(fl.monsterScale || 1);
  const placed = Object.keys(fl.features).map(k => fl.features[k]).filter(x => x.type === 'monster');
  const groups = placed.map(x => ({ placed: x, boss: (x.group || [x]).some(m => { const r = m.ref || m; return G.MONSTERS[r] && (G.MONSTERS[r].traits || []).indexOf('boss') >= 0; }) }));
  const wander = fl.__wander;
  // wanderers come along the way; the placed fights are where they are, a boss last
  const seq = [];
  const nonBoss = groups.filter(g => !g.boss), bosses = groups.filter(g => g.boss);
  for (let k = 0; k < Math.max(wander, nonBoss.length); k++) {
    if (k < wander) seq.push({ wander: true });
    if (k < nonBoss.length) seq.push(nonBoss[k]);
  }
  bosses.forEach(b => seq.push(b));
  let rests = (G.RULES.rest && G.RULES.rest.perFloor) || 2;
  const restCfg = G.RULES.rest || {};
  const risk = Math.min(restCfg.maxRisk || 0.65, (restCfg.baseRisk || 0.12) + (restCfg.riskPerDepth || 0.06) * depth);
  const table = fl.encounterTable;
  const mk = s => s.wander ? G.makeEncounter(table[Math.floor(rng() * table.length)], rng)
                           : G.makeGroup(s.placed.group || [{ ref: s.placed.ref, count: s.placed.count }], rng);
  for (let s = 0; s < seq.length; s++) {
    // rest or go home before a fight if the party is spent
    if (partyFrac(party) < 0.55 || casterMP(party) < 0.3) {
      if (rests > 0) {
        rests--; log.rests++;
        if (rng() < risk) {                       // something finds you mid-rest
          log.interrupted++;
          const o = fight(party, G.makeEncounter(table[Math.floor(rng() * table.length)], rng), rng, log);
          if (o === 'lost') { log.wipes++; if (log.wipes > maxWipes) return false; town(party, tierFn(), rng, log); }
        } else rest(party, restCfg.fraction || 0.35);
      } else if (partyFrac(party) < 0.4) { town(party, tierFn(), rng, log); log.retreats++; rests = 2; }
    }
    const isBoss = !!seq[s].boss;
    let o = fight(party, mk(seq[s]), rng, log);
    if (isBoss) { log.boss[fl.id] = log.boss[fl.id] || { tries: 0, firstWins: 0 }; if (!log.boss[fl.id].tries++ && o === 'won') log.boss[fl.id].firstWins++; }
    while (o === 'lost') {
      log.wipes++; if (log.wipes > maxWipes) return false;
      town(party, tierFn(), rng, log); rests = 2;
      o = fight(party, mk(seq[s]), rng, log);
      if (isBoss) log.boss[fl.id].tries++;
    }
    mendBetween(party, rng);
    if (party.some(c => c.bp <= 0)) {             // somebody is down and nobody can raise them: home
      const raiser = party.find(c => c.bp > 0 && c.spellsKnown.indexOf('sp.revive') >= 0 && c.mp >= 8);
      if (raiser) { const down = party.find(c => c.bp <= 0); G.castOutside(party, party.indexOf(raiser), 'sp.revive', party.indexOf(down), rng, {}); }
      if (party.some(c => c.bp <= 0)) { town(party, tierFn(), rng, log); log.retreats++; rests = 2; }
    }
  }
  return true;
}

function newLog() { return { fights: 0, rounds: 0, wipes: 0, retreats: 0, rests: 0, interrupted: 0, downed: 0, town: 0, stalls: 0, boss: {}, refused: {}, reached: 0, done: false, level: 0 }; }

function walkable(fl) { return fl.cells.filter(c => !(c & 16)).length; }   // bit 16 is rock
function wanderFor(fl) { return Math.max(1, Math.round(walkable(fl) / 45)); }

function ashkeld(mix, seed) {
  const rng = G.makeRng(seed);
  const party = makeParty(mix, rng);
  const log = newLog();
  let floorNo = 0;
  const tierFn = () => (floorNo >= 2 ? 1 : 0);
  town(party, 0, rng, null);
  for (const fl0 of G.PACK.floors) {
    const fl = Object.assign({}, fl0, { __wander: wanderFor(fl0) });
    if (!playFloor(party, fl, fl.depth || floorNo + 1, tierFn, rng, log, 3)) break;
    floorNo++; log.reached = floorNo;
    town(party, tierFn(), rng, null);
  }
  log.done = log.reached === G.PACK.floors.length;
  log.level = party.reduce((a, c) => a + c.level, 0) / party.length;
  return log;
}

const DELVE_DEPTH = 8;
const delveCache = {};
function delveFloors(seed) {
  if (delveCache[seed]) return delveCache[seed];
  const r = G.generateDelve(seed, { floors: DELVE_DEPTH, basePack: JSON.parse(JSON.stringify(G.PACK)) });
  if (!r.ok) throw new Error('delve: ' + (r.errors || []).join('; '));
  return (delveCache[seed] = r.pack.floors);
}
function delve(mix, seed) {
  const rng = G.makeRng(seed * 31 + 7);
  const party = makeParty(mix, rng);
  const log = newLog();
  let floorNo = 0;
  const tierFn = () => (floorNo >= 5 ? 2 : floorNo >= 2 ? 1 : 0);
  town(party, 0, rng, null);
  const floors = delveFloors(1000 + (seed % 40));
  for (let d = 0; d < floors.length; d++) {
    const fl = Object.assign({}, floors[d], { __wander: wanderFor(floors[d]) });
    if (!playFloor(party, fl, d + 1, tierFn, rng, log, 3)) break;
    floorNo++; log.reached = floorNo;
    town(party, tierFn(), rng, null);
  }
  log.done = log.reached === DELVE_DEPTH;
  log.level = party.reduce((a, c) => a + c.level, 0) / party.length;
  return log;
}

/* ---------------- the runs ---------------- */
const MIXES = ONLY || ['FFMP', 'FRMP', 'FFRP', 'FFRM', 'FRRP', 'FMMP', 'FMPP', 'RRMP', 'RRPP', 'MMPP', 'FFFP', 'RRRP', 'FFMM'];
const uniq = [...new Set(MIXES)];
const t0 = Date.now();
const out = [];
for (const mix of uniq) {
  const A = [], D = [];
  for (let s = 1; s <= RUNS; s++) { A.push(ashkeld(mix, s)); D.push(delve(mix, s)); }
  const agg = (L, f) => L.reduce((a, l) => a + f(l), 0) / L.length;
  const boss = (L, id) => { const b = L.map(l => l.boss[id]).filter(Boolean); return b.length ? b.reduce((a, x) => a + x.firstWins, 0) / b.length : null; };
  const refused = {}; A.concat(D).forEach(l => Object.keys(l.refused).forEach(k => refused[k] = (refused[k] || 0) + l.refused[k]));
  out.push({
    mix, label: mix.split('').map(k => NAME[k]).join(', '),
    ash: { done: agg(A, l => l.done ? 1 : 0), wipes: agg(A, l => l.wipes), retreats: agg(A, l => l.retreats), downed: agg(A, l => l.downed / Math.max(1, l.fights)),
           chief: boss(A, 'f2'), shade: boss(A, 'f3'), level: agg(A, l => l.level), fights: agg(A, l => l.fights), stalls: agg(A, l => l.stalls) },
    del: { done: agg(D, l => l.done ? 1 : 0), depth: agg(D, l => l.reached), wipes: agg(D, l => l.wipes), retreats: agg(D, l => l.retreats),
           downed: agg(D, l => l.downed / Math.max(1, l.fights)), level: agg(D, l => l.level), fights: agg(D, l => l.fights), stalls: agg(D, l => l.stalls) },
    refused
  });
  process.stderr.write(mix + ' ');
}
process.stderr.write('\n' + ((Date.now() - t0) / 1000).toFixed(1) + ' s\n');
console.log(JSON.stringify({ runs: RUNS, depth: DELVE_DEPTH, file: FILE, results: out }, null, 1));

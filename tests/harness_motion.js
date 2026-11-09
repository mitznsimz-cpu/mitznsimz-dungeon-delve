// MSDD v4.5 — motion: Hold the Line's shared motion.js, loaded beside the
// game, and the Delve's STAGE CORE that turns a fight into its cues.
// v4.7: motion 1.1.0. Wind-up strikes, hit-stop, knock-back, bits by
// material, a tumbling d20, deaths by what a figure is made of, the cats'
// paw, and a sound for every move (the sound runner checks sound.js itself).
// Includes Hold the Line's own safeguard: every effect, pop and coin is drawn
// against a mock canvas, so a crash like 1.0.0's fireball cannot slip in.
const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');

function grab(tag) {
  const re = new RegExp('/\\* ==== ' + tag + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + tag + ' END ==== \\*/');
  const mm = src.match(re);
  if (!mm) { console.error('FAIL: ' + tag + ' markers missing'); process.exit(1); }
  return mm[1];
}
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')); } };

console.log('\n[MO1] motion.js beside the game');
const MOTION_FILE = './motion.js';
ok('motion.js sits beside the game', fs.existsSync(MOTION_FILE), 'copy motion.js from Hold the Line into this folder');
const msrc = fs.existsSync(MOTION_FILE) ? fs.readFileSync(MOTION_FILE, 'utf8') : '';
let MM = null;
try { MM = new Function(msrc + '\nreturn MitzMotion;')(); } catch (e) { MM = null; }
ok('it loads on its own', !!(MM && MM.create));
ok('it is version 1.1 or later (v4.7 uses its strike, knock, hold, bits, tumble and paw)',
   MM && /^1\.\d+\.\d+$/.test(MM.VERSION) && Number(MM.VERSION.split('.')[1]) >= 1, MM && MM.VERSION);
ok('the game loads it beside itself', /<script src="motion\.js"><\/script>/.test(src));
ok('and plays on without it', /typeof MitzMotion === 'undefined'/.test(src));

// a canvas that accepts anything and remembers nothing
function mockCtx() {
  const grad = { addColorStop() {} };
  const target = { calls: 0 };
  return new Proxy(target, {
    get(t, k) {
      if (k === 'calls') return t.calls;
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => { t.calls++; return grad; };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k in t) return t[k];
      return function () { t.calls++; };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

console.log('\n[MO2] every effect, pop and coin draws (Hold the Line\'s safeguard)');
{
  const ctx = mockCtx(), view = { fx: [], pops: [], coins: [], impacts: [] };
  const host = { ctx: () => ctx, layout: () => ({ cell: 60, horiz: true, dpr: 1 }), state: () => view, motion: 1,
                 toScreen: (lane, sq) => ({ x: sq * 60, y: lane * 60 }), laneVec: s => ({ x: s, y: 0, lean: s }),
                 dice: () => true, purse: () => ({ x: 10, y: 10 }), onCoin: () => {} };   // no mat: blasts are not clipped
  const fxm = MM.create(host);
  const from = { lane: 4, sq: 2, ht: 0.9 }, to = { lane: 4, sq: 8, ht: 0.9 };
  const KINDS = ['arrow', 'bolt', 'shadow', 'sigil', 'beam', 'fireball', 'radiant', 'whirl', 'slash', 'smash', 'boom', 'notes', 'sparkle',
                 'tumble', 'bits', 'paw'];
  KINDS.forEach(k => view.fx.push({ k, t0: 0, dur: 1, from, to, lane: 4, sq: 8, ht: 0.9, rx: 0.3, ang: 0, hit: true, sign: 1, seed: 1, col: '200,200,160',
                                    face: 17, side: 'hero', gold: true, mat: 'metal', ex: 0.35, ey: -1, reach: 3 }));
  Object.keys(MM.MATERIALS).forEach(m => view.fx.push({ k: 'bits', t0: 0, dur: 1, lane: 4, sq: 8, ht: 0.9, mat: m, ang: Math.PI, seed: 3, scale: 1.6 }));
  view.fx.push({ k: 'arrow', t0: 0, dur: 1, from, to, sign: -1, miss: 1 });
  [{ kind: 'atk', hit: true, roll: 14, dmg: 5, side: 'hero' }, { kind: 'atk', hit: true, crit: true, roll: 20, dmg: 12, side: 'monster' },
   { kind: 'atk', hit: false, roll: 3 }, { kind: 'atk', hit: false, fumble: true, roll: 1 }, { kind: 'save', saved: true, roll: 12, dmg: 0 },
   { kind: 'heal', amount: 6 }, { kind: 'label', text: '\u22127', col: '#fff' }]
    .forEach(p => view.pops.push(Object.assign({ t0: 0, lane: 4, sq: 8, ht: 0.9 }, p)));
  view.coins.push({ t0: 0, lane: 4, sq: 8, vx: 0.3, peak: 0.5 });
  let threw = null;
  try { [0.01, 0.2, 0.45, 0.7, 0.95].forEach(t => { fxm.drawFx(t); fxm.drawPops(t); fxm.drawCoins(t); }); } catch (e) { threw = e.message; }
  ok('all ' + KINDS.length + ' effects, bits of all eight materials, seven pops and a coin draw without a throw', !threw, threw);
  ok('and they actually draw', ctx.calls > 100, ctx.calls);
  ok('a fireball bursts with no play area given', (() => { const v2 = { fx: [{ k: 'boom', t0: 0, dur: 1, lane: 1, sq: 1 }], pops: [], coins: [], impacts: [] };
    const f2 = MM.create(Object.assign({}, host, { state: () => v2 })); try { f2.drawFx(0.5); return true; } catch (e) { return false; } })());
  const ANIMS = ['drop', 'land', 'hop', 'leap', 'charge', 'emerge', 'rise', 'leak', 'lunge', 'recoil', 'cast', 'wobble', 'shake',
                 'dodge', 'flash', 'topple', 'fade', 'pickup', 'strike', 'knock', 'drift', 'crumble', 'melt', 'swat'];
  let bad = [];
  ANIMS.forEach(k => {
    const sp = { lane: 4, sq: 5, rx: 0.3, anims: [{ k, t0: 0, dur: 1, vx: -1, vy: 0, lean: -1, dir: -1, from: 5, to: 6, fromLane: 4, fromSq: 5, toLane: 4 }] };
    const e = fxm.evaluate(sp, 0.5);
    if (!['dx', 'dy', 'lift', 'rot', 'alpha', 'pivot', 'flash', 'scale'].every(f => Number.isFinite(e[f]))) bad.push(k);
  });
  ok('every tween evaluates to finite numbers', !bad.length, bad.join(','));
  const sp = { lane: 4, sq: 5, rx: 0.3, anims: [{ k: 'topple', t0: 0, dur: 0.45, dir: -1, persist: true }] };
  const e1 = fxm.evaluate(sp, 2);
  ok('a topple stays down once it has played', Math.abs(e1.rot + Math.PI / 2) < 0.05 && sp.anims.length === 1);
  const sp2 = { lane: 4, sq: 5, rx: 0.3, anims: [{ k: 'shake', t0: 0, dur: 0.3 }] };
  fxm.evaluate(sp2, 1);
  ok('a finished tween is dropped', sp2.anims.length === 0);

  // 1.1: hit-stop, the wind-up, reduced motion read every frame
  const sp3 = { lane: 4, sq: 5, rx: 0.3, anims: [{ k: 'strike', t0: 0, dur: 0.5, vx: -1, vy: 0, lean: -1 }] };
  const wind = fxm.evaluate(sp3, 0.15);
  ok('a strike leans back before it drives in', wind.dx > 0, wind.dx);
  const sp4 = { lane: 4, sq: 5, rx: 0.3, anims: [{ k: 'strike', t0: 0, dur: 0.5, vx: -1, vy: 0, lean: -1 }] };
  const free = fxm.evaluate(JSON.parse(JSON.stringify(sp4)), 0.35);
  fxm.hold(sp4, 0.25, 0.1);
  const held = fxm.evaluate(sp4, 0.35);
  const atContact = fxm.evaluate({ lane: 4, sq: 5, rx: 0.3, anims: [{ k: 'strike', t0: 0, dur: 0.5, vx: -1, vy: 0, lean: -1 }] }, 0.25);
  ok('hold() freezes a move that began before the beat', Math.abs(held.dx - atContact.dx) < 1e-9 && Math.abs(free.dx - held.dx) > 1e-6,
     held.dx + ' vs ' + atContact.dx);
  ok('the blow lands at STRIKE_CONTACT, halfway', MM.STRIKE_CONTACT === 0.5);
  let lvl = 1;
  const fn = MM.create(Object.assign({}, host, { motion: () => lvl }));
  const big = fn.evaluate({ lane: 4, sq: 5, rx: 0.3, anims: [{ k: 'knock', t0: 0, dur: 0.3, vx: -1, vy: 0, lean: -1, amt: 0.3 }] }, 0.05);
  lvl = 0.35;
  const small = fn.evaluate({ lane: 4, sq: 5, rx: 0.3, anims: [{ k: 'knock', t0: 0, dur: 0.3, vx: -1, vy: 0, lean: -1, amt: 0.3 }] }, 0.05);
  ok('reduced motion given as a function takes hold at once', Math.abs(small.dx) < Math.abs(big.dx) && Math.abs(small.dx) > 0,
     small.dx + ' vs ' + big.dx);
  const MINI_MATS = ['metal', 'bone', 'stone', 'ooze', 'flesh', 'ember', 'spirit', 'wood'];
  ok('motion knows the same eight materials as the minis library', Object.keys(MM.MATERIALS).sort().join() === MINI_MATS.slice().sort().join(),
     Object.keys(MM.MATERIALS).join());
}

console.log('\n[MO3] the stage: one fight turn into cues');
const BOOT = grab('BUNDLED PACK') + grab('MINI CORE') + grab('PACK CORE') +
  '\nvar __L = loadPack(BUNDLED_PACK);\nif(!__L.ok){throw new Error("pack invalid");}\n';
const names = ['stageSnapshot', 'stageTurn', 'stageFxFor', 'STAGE_GAP', 'STAGE_MAX', 'STAGE_STRIKE', 'STAGE_CONTACT', 'STAGE_HOLD',
  'STAGE_HOLD_CRIT', 'stageDeathFor', 'stageHitSound', 'STAGE_TUMBLE', 'STAGE_PAW', 'STAGE_SWEEP_COUNT', 'STAGE_SWEEP_AGE', 'STAGE_SWEEP_GAP', 'makeRng', 'makeParty', 'grantStartingSpells',
  'startingKit', 'beginCombat', 'partyAction', 'advanceCombat', 'activeActor', 'makeEncounter', 'SPELLS', 'ITEMS', 'isFront',
  'weaponReach', 'maxBP', 'makeItem', 'skillDef', 'miniMaterial', 'miniForMonster', 'miniForHero', 'CLASSES', 'MONSTERS'];
const S = new Function(BOOT + grab('PARTY CORE') + '\n' + grab('SAVE CORE') + '\n' + grab('WORLD CORE') + '\n' +
  grab('EVENT CORE') + '\n' + grab('COMBAT CORE') + '\n' + grab('STAGE CORE') + '\n' + grab('TOWN CORE') + '\n' +
  grab('INVENTORY CORE') + '\nreturn {' + names.join(',') + '};')();
const FX_KINDS = ['arrow', 'bolt', 'shadow', 'sigil', 'beam', 'fireball', 'radiant', 'whirl', 'slash', 'smash', 'boom', 'notes', 'sparkle',
                  'tumble', 'bits', 'paw'];
const ANIM_KINDS = ['lunge', 'recoil', 'cast', 'wobble', 'shake', 'dodge', 'flash', 'topple',
                    'strike', 'knock', 'drift', 'crumble', 'melt', 'swat'];
const SOUND_FILE = './sound.js';
const SOUND_NAMES = (() => { try { const ss = fs.readFileSync(SOUND_FILE, 'utf8'); const m = ss.match(/Sounds: ([a-z, ]+)\./); return m ? m[1].split(/,\s*/) : []; } catch (e) { return []; } })();
const snap = (foes, party, logLen) => ({ foes, party, logLen: logLen || 0 });
{
  const before = snap({ g1: { bp: 6 }, g2: { bp: 4 } }, [10, 10, 6, 5]);
  const after = snap({ g1: { bp: 0 }, g2: { bp: 4 } }, [10, 10, 6, 5]);
  const r = S.stageTurn({ events: [{ kind: 'hit', text: 'x', by: 'p0', on: 'g1', roll: 15, reach: 'melee', hit: true, dmg: 6 },
                                   { kind: 'kill', text: 'y', on: 'g1' }], actor: 'p0', before, after });
  const lunge = r.cues.find(c => c.kind === 'anim' && c.key === 'p0');
  ok('a party blow: the striker winds up and strikes toward the foes (to the left)', lunge && lunge.anim.k === 'strike' && lunge.anim.vx === -1 && lunge.at === 0);
  const sh = r.cues.find(c => c.kind === 'anim' && c.key === 'g1' && c.anim.k === 'knock');
  ok('the target is knocked back as the blow lands, at the strike\'s contact', sh && Math.abs(sh.at - S.STAGE_STRIKE * S.STAGE_CONTACT) < 1e-9 &&
     sh.anim.vx === -1, sh && sh.at);
  ok('with a slash where it lands', r.cues.some(c => c.kind === 'fx' && c.fx.k === 'slash' && c.fx.on === 'g1' && c.fx.hit));
  const pop = r.cues.find(c => c.kind === 'pop');
  ok('and the d20 and the damage pop up', pop && pop.pop.kind === 'atk' && pop.pop.roll === 15 && pop.pop.dmg === 6 && pop.pop.side === 'hero');
  const top = r.cues.find(c => c.kind === 'anim' && c.anim.k === 'topple');
  ok('the slain foe topples away from the party, on the beat of the blow', top && top.key === 'g1' && top.anim.dir === -1 &&
     top.anim.persist && Math.abs(top.at - S.STAGE_STRIKE * S.STAGE_CONTACT) < 1e-9);
  ok('the one left standing does not', !r.cues.some(c => c.key === 'g2' || (c.fx && c.fx.on === 'g2')));
  ok('the turn knows how long it lasts', r.length > 0.4 && r.length < 1.5, r.length);
}
{
  const before = snap({ g1: { bp: 6 } }, [10, 10, 6, 5]), after = snap({ g1: { bp: 6 } }, [10, 3, 6, 0]);
  const r = S.stageTurn({ events: [{ kind: 'foehit', text: 'a', by: 'g1', on: 'p1', roll: 18, reach: 'melee', hit: true, dmg: 7 },
                                   { kind: 'foemiss', text: 'b', by: 'g1', on: 'p0', roll: 2, reach: 'ranged', hit: false },
                                   { kind: 'foehit', text: 'c', by: 'g1', on: 'p3', roll: 20, reach: 'ranged', caster: true, hit: true, crit: true, dmg: 5 },
                                   { kind: 'down', text: 'd', on: 'p3' }], actor: null, before, after });
  const lunges = r.cues.filter(c => c.kind === 'anim' && c.anim.k === 'strike');
  ok('a foe strikes toward the party (to the right)', lunges.length === 1 && lunges[0].anim.vx === 1);
  ok('blows follow one another', r.cues.filter(c => c.kind === 'pop').map(c => c.at).every((t, i, a) => !i || t > a[i - 1]));
  ok('a missed shot flies past and the target dodges', r.cues.some(c => c.kind === 'fx' && c.fx.k === 'arrow' && c.fx.miss) &&
     r.cues.some(c => c.key === 'p0' && c.anim && c.anim.k === 'dodge'));
  ok('a caster\'s working is a bolt, not an arrow', r.cues.some(c => c.kind === 'fx' && c.fx.k === 'bolt' && c.fx.to === 'p3'));
  ok('a fallen hero topples away from the foes', r.cues.some(c => c.key === 'p3' && c.anim && c.anim.k === 'topple' && c.anim.dir === 1));
  ok('a crit pops as a crit', r.cues.some(c => c.kind === 'pop' && c.pop.crit && c.pop.side === 'monster'));
}
{
  const ev = []; for (let i = 0; i < 20; i++) ev.push({ kind: 'foehit', text: 'x', by: 'g' + i, on: 'p0', roll: 10, reach: 'melee', hit: true, dmg: 1 });
  const foes = {}; for (let i = 0; i < 20; i++) foes['g' + i] = { bp: 3 };
  const r = S.stageTurn({ events: ev, actor: null, before: snap(foes, [50, 1, 1, 1]), after: snap(foes, [30, 1, 1, 1]) });
  ok('twenty blows still fit in a few seconds', r.length < S.STAGE_MAX + 1, r.length);
}
{
  const before = snap({ g1: { bp: 9 }, g2: { bp: 9 }, g3: { bp: 9 } }, [10, 10, 6, 5]);
  const after = snap({ g1: { bp: 2 }, g2: { bp: 0 }, g3: { bp: 9 } }, [10, 10, 6, 5]);
  const r = S.stageTurn({ events: [{ kind: 'spell', text: 'casts Wall of Fire' }], actor: 'p2', spell: S.SPELLS['sp.wallfire'], before, after });
  ok('a spell: the caster raises their hands', r.cues.some(c => c.key === 'p2' && c.anim && c.anim.k === 'cast'));
  ok('fire flies to everyone it hurt, and only them', r.cues.filter(c => c.kind === 'fx' && c.fx.k === 'fireball').map(c => c.fx.to).sort().join() === 'g1,g2');
  ok('a rank of fire bursts where it lands', r.cues.some(c => c.kind === 'fx' && c.fx.k === 'boom'));
  ok('the damage shows on each', r.cues.filter(c => c.kind === 'pop' && c.pop.kind === 'label').map(c => c.pop.text).sort().join() === '\u22127,\u22129');
  ok('the one it killed topples', r.cues.some(c => c.key === 'g2' && c.anim && c.anim.k === 'topple'));
  const h = S.stageTurn({ events: [{ kind: 'spell', text: 'mends' }], actor: 'p3', spell: S.SPELLS['sp.mend1'],
                          before: snap({}, [3, 10, 6, 5]), after: snap({}, [9, 10, 6, 5]) });
  ok('a mending: a beam from the priest, and the number', h.cues.some(c => c.kind === 'fx' && c.fx.k === 'beam' && c.fx.from === 'p3' && c.fx.to === 'p0') &&
     h.cues.some(c => c.kind === 'pop' && c.pop.kind === 'heal' && c.pop.amount === 6));
  ok('holy light falls as a column', S.stageFxFor('holy') === 'radiant' && S.stageFxFor(null, 'turn') === 'radiant' && S.stageFxFor('lightning') === 'bolt');
}

console.log('\n[MO4] real fights stage cleanly');
{
  let fights = 0, cues = 0, bad = [], longest = 0;
  const seen = { mats: {}, deaths: {}, sounds: {}, holds: 0, tumbles: 0, paws: 0 };
  const mat = x => { const id = x.ref ? S.miniForMonster(x.ref, S.MONSTERS[x.ref]) : S.miniForHero(x, S.CLASSES[x.class]); return id ? S.miniMaterial(id) : null; };
  for (let seed = 1; seed <= 150; seed++) {
    const rg = S.makeRng(seed);
    const p = S.makeParty(rg, [{ name: 'A', class: 'fighter' }, { name: 'B', class: 'fighter' }, { name: 'C', class: 'mage' }, { name: 'D', class: 'priest' }]);
    S.grantStartingSpells(p); S.startingKit(p);
    const refs = ['mn.goblin', 'mn.skeleton', 'mn.goblinArcher', 'mn.goblinShaman', 'mn.direWolf', 'mn.boneKnight',
                  'mn.gloom', 'mn.shadeWisp', 'mn.animatedArmour', 'mn.giantCrab', 'mn.rotGrub', 'mn.fireBeetle'];
    const st = S.beginCombat(p, S.makeEncounter(refs[seed % refs.length], rg), rg, seed % 3 ? null : { narrow: true });
    let guard = 0;
    while (!st.outcome && guard++ < 300) {
      const i = S.activeActor(st);
      const a = S.stageSnapshot(p, st, mat);
      let action = 'defend';
      if (i !== null) {
        const ch = p[i];
        const known = ch.spellsKnown.filter(id => p[i].mp >= S.SPELLS[id].mp && !(S.SPELLS[id].usableIn && S.SPELLS[id].usableIn.indexOf('combat') < 0));
        action = known.length && rg() < 0.4 ? 'cast:' + known[Math.floor(rg() * known.length)]
               : (S.weaponReach(ch) === 'ranged' || S.isFront(ch)) ? 'attack' : 'defend';
        S.partyAction(p, st, action, 0, rg);
      }
      const b = S.stageSnapshot(p, st, mat);
      S.advanceCombat(p, st, rg);
      const c = S.stageSnapshot(p, st, mat);
      const keys = new Set(['p0', 'p1', 'p2', 'p3'].concat(st.foes.map(f => f.uid)));
      [S.stageTurn({ events: st.log.slice(a.logLen, b.logLen), actor: i !== null ? 'p' + i : null,
                     spell: action.indexOf('cast:') === 0 ? S.SPELLS[action.slice(5)] : null, before: a, after: b, living: ['p0'], paw: seed % 2 }),
       S.stageTurn({ events: st.log.slice(b.logLen), actor: null, before: b, after: c, paw: seed % 2 })].forEach(r => {
        longest = Math.max(longest, r.length);
        r.cues.forEach(q => {
          if (q.fx && q.fx.k === 'bits') seen.mats[q.fx.mat] = 1;
          if (q.anim && ['topple', 'drift', 'melt', 'crumble'].indexOf(q.anim.k) >= 0 && !/^p/.test(q.key)) seen.deaths[q.anim.k] = 1;
          if (q.kind === 'sound') seen.sounds[q.name] = 1;
          if (q.kind === 'hold') seen.holds++;
          if (q.fx && q.fx.k === 'tumble') seen.tumbles++;
          if (q.fx && q.fx.k === 'paw') seen.paws++;
        });
        r.cues.forEach(q => {
          cues++;
          if (!Number.isFinite(q.at) || q.at < 0) bad.push('time ' + q.at);
          if (q.kind === 'anim' && (!keys.has(q.key) || ANIM_KINDS.indexOf(q.anim.k) < 0)) bad.push('anim ' + q.key + ' ' + q.anim.k);
          if (q.kind === 'fx' && FX_KINDS.indexOf(q.fx.k) < 0) bad.push('fx ' + q.fx.k);
          if (q.kind === 'fx' && ((q.fx.on && !keys.has(q.fx.on)) || (q.fx.from && (!keys.has(q.fx.from) || !keys.has(q.fx.to))))) bad.push('fx key');
          if (q.kind === 'pop' && !keys.has(q.key)) bad.push('pop key ' + q.key);
          if (q.kind === 'sound' && SOUND_NAMES.indexOf(q.name) < 0) bad.push('sound ' + q.name);
          if (q.kind === 'hold' && (!q.keys.every(k => keys.has(k)) || !(q.dur > 0 && q.dur < 0.2))) bad.push('hold');
          if (q.kind === 'fx' && q.fx.k === 'bits' && MM.MATERIALS[q.fx.mat] == null) bad.push('bits of ' + q.fx.mat);
        });
        if (!(r.length >= 0) || r.length > S.STAGE_MAX + 2) bad.push('length ' + r.length);
      });
    }
    fights++;
  }
  ok('150 fights, ' + cues + ' cues: every cue names a real figure, a real tween, effect or sound, and a sane time',
     !bad.length, bad.slice(0, 5).join(' | '));
  ok('fights do get staged', cues > 2000, cues);
  ok('even the longest turn plays in under six seconds', longest < 6, longest.toFixed(2));
  ok('bits of five materials or more fly', Object.keys(seen.mats).length >= 5, Object.keys(seen.mats).join());
  ok('foes die in at least three ways', Object.keys(seen.deaths).length >= 3, Object.keys(seen.deaths).join());
  ok('crits stop the table and throw dice', seen.holds > 20 && seen.tumbles > 10, seen.holds + ' holds, ' + seen.tumbles + ' dice');
  ok('won fights end with a paw', seen.paws > 30, seen.paws);
  ok('a dozen different sounds are heard', Object.keys(seen.sounds).length >= 12, Object.keys(seen.sounds).join());
}

console.log('\n[MO6] v4.7: the juice, cue by cue');
{
  const foe = (bp, mat, more) => Object.assign({ bp, gone: false, boss: false, construct: false, mat: mat || null }, more || {});
  const withMat = (foes, party, pm) => Object.assign(snap(foes, party), { partyMat: pm || ['metal', 'metal', 'flesh', 'flesh'] });
  const blow = (by, on, o) => Object.assign({ kind: by[0] === 'p' ? 'hit' : 'foehit', text: 'x', by, on, roll: 12, reach: 'melee', hit: true, dmg: 2 }, o || {});

  // hit-stop on a crit, and the turn waits for it
  const b1 = withMat({ g1: foe(30, 'bone'), g2: foe(30, 'bone') }, [20, 20, 9, 9]);
  const a1 = withMat({ g1: foe(10, 'bone'), g2: foe(28, 'bone') }, [20, 20, 9, 9]);
  const r1 = S.stageTurn({ events: [blow('p0', 'g1', { kind: 'crit', crit: true, roll: 20, dmg: 20 }), blow('p1', 'g2', { roll: 11, dmg: 2 })],
                           actor: null, before: b1, after: a1 });
  const h1 = r1.cues.find(c => c.kind === 'hold');
  ok('a crit freezes striker and struck for a beat', h1 && h1.keys.join() === 'p0,g1' && h1.dur === S.STAGE_HOLD_CRIT &&
     Math.abs(h1.at - S.STAGE_STRIKE * S.STAGE_CONTACT) < 1e-9);
  const second = r1.cues.find(c => c.kind === 'anim' && c.key === 'p1' && c.anim.k === 'strike');
  ok('and the next blow waits for it', second && Math.abs(second.at - (S.STAGE_GAP + S.STAGE_HOLD_CRIT)) < 1e-9, second && second.at);
  ok('a light blow does not stop the table', r1.cues.filter(c => c.kind === 'hold').length === 1);
  const t1 = r1.cues.find(c => c.fx && c.fx.k === 'tumble');
  ok('a crit throws a d20 across the mat, showing the roll', t1 && t1.fx.from === 'p0' && t1.fx.to === 'g1' && t1.fx.face === 20 &&
     t1.fx.side === 'hero' && t1.fx.gold === true);
  ok('and you hear it rattle', r1.cues.some(c => c.kind === 'sound' && c.name === 'dice'));
  const k1 = r1.cues.find(c => c.kind === 'anim' && c.key === 'g1' && c.anim.k === 'knock');
  const k2 = r1.cues.find(c => c.kind === 'anim' && c.key === 'g2' && c.anim.k === 'knock');
  ok('a heavier blow knocks further', k1 && k2 && k1.anim.amt > k2.anim.amt, k1 && k2 && k1.anim.amt + ' > ' + k2.anim.amt);
  const bits1 = r1.cues.filter(c => c.fx && c.fx.k === 'bits');
  ok('bone chips fly off a skeleton, away from the blow', bits1.length === 2 && bits1.every(c => c.fx.mat === 'bone' && c.fx.ang === 0));
  ok('more of them on a crit', bits1[0].fx.scale > bits1[1].fx.scale);
  ok('bone cracks', r1.cues.some(c => c.kind === 'sound' && c.name === 'crack'));

  // reduced motion: no stopping, no dice, fewer bits
  const r1r = S.stageTurn({ events: [blow('p0', 'g1', { kind: 'crit', crit: true, roll: 20, dmg: 20 })], actor: null, before: b1, after: a1, reduced: true });
  ok('with reduced motion: no hit-stop and no thrown die', !r1r.cues.some(c => c.kind === 'hold' || (c.fx && c.fx.k === 'tumble')));
  ok('and the bits are fewer', r1r.cues.find(c => c.fx && c.fx.k === 'bits').fx.scale < bits1[0].fx.scale);

  // what the hero is made of
  const b2 = withMat({ g1: foe(10, 'flesh') }, [20, 20, 9, 9]), a2 = withMat({ g1: foe(10, 'flesh') }, [16, 20, 9, 9]);
  const r2 = S.stageTurn({ events: [blow('g1', 'p0', { dmg: 4 }), blow('g1', 'p2', { hit: false, kind: 'foemiss', dmg: 0 })], actor: null, before: b2, after: a2 });
  ok('steel on a fighter in mail: sparks and a clang', r2.cues.some(c => c.fx && c.fx.k === 'bits' && c.fx.on === 'p0' && c.fx.mat === 'metal' && c.fx.ang === Math.PI) &&
     r2.cues.some(c => c.kind === 'sound' && c.name === 'clang'));
  ok('a swing at the robed mage that misses: a whiff', r2.cues.some(c => c.kind === 'sound' && c.name === 'whiff'));
  const r3 = S.stageTurn({ events: [blow('g1', 'p1', { hit: false, kind: 'foemiss', dmg: 0 })], actor: null, before: b2, after: b2 });
  ok('a glancing blow off armour still sparks, softly', r3.cues.some(c => c.fx && c.fx.k === 'bits' && c.fx.mat === 'metal' && c.fx.scale === 0.5));

  // how each kind of thing dies
  const dying = { s: foe(5, 'spirit'), o: foe(5, 'ooze'), st: foe(5, 'stone'), c: foe(5, 'metal', { construct: true }), f: foe(5, 'flesh'), m: foe(5, 'metal') };
  const dead = {}; Object.keys(dying).forEach(k => { dead[k] = foe(0, dying[k].mat, { construct: dying[k].construct }); });
  const ev4 = Object.keys(dying).map((k, i) => blow('p0', k, { dmg: 5, roll: 10 + i }));
  const r4 = S.stageTurn({ events: ev4, actor: null, before: withMat(dying, [20, 20, 9, 9]), after: withMat(dead, [20, 20, 9, 9]) });
  const how = k => { const c = r4.cues.find(q => q.kind === 'anim' && q.key === k && ['topple', 'drift', 'melt', 'crumble'].indexOf(q.anim.k) >= 0); return c && c.anim.k; };
  ok('a spirit drifts up and away', how('s') === 'drift');
  ok('an ooze melts', how('o') === 'melt');
  ok('stone crumbles, and so does a construct of iron', how('st') === 'crumble' && how('c') === 'crumble');
  ok('flesh, and a man in armour, fall over', how('f') === 'topple' && how('m') === 'topple');
  ok('every death stays done', r4.cues.filter(q => q.kind === 'anim' && ['topple', 'drift', 'melt', 'crumble'].indexOf(q.anim.k) >= 0).every(q => q.anim.persist));
  ok('crumbling throws dust, melting a splat', r4.cues.some(q => q.fx && q.fx.k === 'bits' && q.fx.on === 'st' && q.fx.mat === 'stone') &&
     r4.cues.some(q => q.fx && q.fx.k === 'bits' && q.fx.on === 'o' && q.fx.mat === 'ooze'));
  ok('each with its sound', ['crumble', 'squish', 'thump', 'whoosh'].every(n => r4.cues.some(q => q.kind === 'sound' && q.name === n)));
  ok('the death kinds are what the page expects', S.stageDeathFor({ mat: 'spirit' }) === 'drift' && S.stageDeathFor({}) === 'topple' &&
     S.stageHitSound('metal') === 'clang' && S.stageHitSound('nonsense') === 'thud');

  // a boss falls: a golden d20; the fight is won: a cat swats the last one off the table
  const b5 = withMat({ g1: foe(6, 'flesh', { boss: true }), g2: foe(0, 'flesh') }, [20, 20, 9, 9]);
  const a5 = withMat({ g1: foe(0, 'flesh', { boss: true }), g2: foe(0, 'flesh') }, [20, 20, 9, 9]);
  const won = paw => S.stageTurn({ events: [blow('p1', 'g1', { dmg: 6, roll: 14 })], actor: null, before: b5, after: a5, paw });
  const r5 = won(0), r6 = won(1);
  ok('a boss killed: a golden 20 rolls to it', r5.cues.some(c => c.fx && c.fx.k === 'tumble' && c.fx.face === 20 && c.fx.gold && c.fx.from === 'p1' && c.fx.to === 'g1'));
  const pw = r5.cues.find(c => c.fx && c.fx.k === 'paw'), sw = r5.cues.find(c => c.kind === 'anim' && c.anim.k === 'swat');
  ok('the fight won: a paw reaches in for the last one down', pw && pw.fx.on === 'g1' && pw.at > 0.25);
  ok('and swats it off the table when it hooks it', sw && sw.key === 'g1' && sw.anim.persist && sw.at > pw.at &&
     Math.abs(sw.at - (pw.at + S.STAGE_PAW * 0.4)) < 1e-9 && r5.cues.some(c => c.kind === 'sound' && c.name === 'swat'));
  ok('Mitz and Simz reach in from opposite sides', r6.cues.find(c => c.fx && c.fx.k === 'paw').fx.ex === -pw.fx.ex);
  ok('no paw while a foe still stands', !S.stageTurn({ events: [blow('p1', 'g1', { dmg: 6 })], actor: null,
     before: withMat({ g1: foe(6), g2: foe(5) }, [20, 20, 9, 9]), after: withMat({ g1: foe(0), g2: foe(5) }, [20, 20, 9, 9]), paw: 0 }).cues.some(c => c.fx && c.fx.k === 'paw'));
  ok('none unless the page asks for one, and none with reduced motion',
     !S.stageTurn({ events: [blow('p1', 'g1', { dmg: 6 })], actor: null, before: b5, after: a5 }).cues.some(c => c.fx && c.fx.k === 'paw') &&
     !S.stageTurn({ events: [blow('p1', 'g1', { dmg: 6 })], actor: null, before: b5, after: a5, paw: 0, reduced: true }).cues.some(c => c.fx && (c.fx.k === 'paw' || c.fx.k === 'tumble')));
  ok('the last one melted, but one lies toppled from before: the paw takes that one', (() => {
    const r = S.stageTurn({ events: [blow('p1', 'g1', { dmg: 6 })], actor: null,
      before: withMat({ g1: foe(6, 'ooze'), g0: foe(0, 'flesh') }, [20, 20, 9, 9]), after: withMat({ g1: foe(0, 'ooze'), g0: foe(0, 'flesh') }, [20, 20, 9, 9]), paw: 1 });
    const pw = r.cues.find(c => c.fx && c.fx.k === 'paw');
    return pw && pw.fx.on === 'g0' && r.cues.some(c => c.kind === 'anim' && c.key === 'g0' && c.anim.k === 'swat'); })());
  ok('a melted ooze is not swatted (there is nothing left to swat)', !S.stageTurn({ events: [blow('p1', 'g1', { dmg: 6 })], actor: null,
     before: withMat({ g1: foe(6, 'ooze') }, [20, 20, 9, 9]), after: withMat({ g1: foe(0, 'ooze') }, [20, 20, 9, 9]), paw: 0 }).cues.some(c => c.fx && c.fx.k === 'paw'));

  // spells and skills sound too
  const sb = withMat({ g1: foe(9, 'flesh'), g2: foe(9, 'flesh') }, [10, 10, 6, 5]), sa = withMat({ g1: foe(2, 'flesh'), g2: foe(0, 'flesh') }, [10, 10, 6, 5]);
  const rf = S.stageTurn({ events: [{ kind: 'spell', text: 'x' }], actor: 'p2', spell: S.SPELLS['sp.wallfire'], before: sb, after: sa });
  ok('a fireball: whoosh, then boom', rf.cues.some(c => c.kind === 'sound' && c.name === 'whoosh') && rf.cues.some(c => c.kind === 'sound' && c.name === 'boom'));
  ok('and the burnt are knocked back too', rf.cues.filter(c => c.kind === 'anim' && c.anim.k === 'knock').length === 2);
  const rh = S.stageTurn({ events: [{ kind: 'spell', text: 'x' }], actor: 'p3', spell: S.SPELLS['sp.mend1'],
                           before: withMat({}, [3, 10, 6, 5]), after: withMat({}, [9, 10, 6, 5]) });
  ok('a mending chimes', rh.cues.some(c => c.kind === 'sound' && c.name === 'chime'));

  // snapshots
  const rg = S.makeRng(3), pp = S.makeParty(rg, [{ name: 'A', class: 'fighter' }, { name: 'B', class: 'mage' }]);
  S.grantStartingSpells(pp); S.startingKit(pp);
  const mix = S.makeEncounter('mn.skeleton', rg).concat(S.makeEncounter('mn.gloom', rg));
  mix.forEach((f, i) => { f.uid = 'm' + i; });
  const st0 = S.beginCombat(pp, mix, rg);
  const mat = x => { const id = x.ref ? S.miniForMonster(x.ref, S.MONSTERS[x.ref]) : S.miniForHero(x, S.CLASSES[x.class]); return id ? S.miniMaterial(id) : null; };
  const sn = S.stageSnapshot(pp, st0, mat);
  ok('a snapshot knows the skeleton is bone and the gloom is ooze', Object.keys(sn.foes).some(u => sn.foes[u].mat === 'bone') &&
     Object.keys(sn.foes).some(u => sn.foes[u].mat === 'ooze'));
  ok('and that the fighter wears metal', sn.partyMat[0] === 'metal' && sn.partyMat[1] === 'flesh', sn.partyMat.join());
  ok('without a material reader it is the v4.5 snapshot', S.stageSnapshot(pp, st0).partyMat === undefined);
}

console.log('\n[MO5] the page plays it, and can do without it');
ok('a fight starts and ends with a clean stage', /selFoe = 0;\s+stageReset\(\);/.test(src) && /cst = null;\s+stageReset\(\);/.test(src));
ok('buttons wait while a turn plays', /if \(STAGE\.playing\) return;/.test(src) && /#acts\.busy button\{opacity:\.55;pointer-events:none\}/.test(src));
ok('a tap on the fight skips to the end of the turn', /if \(stageSkip\(\)\) return;/.test(src));
ok('reduced motion turns the movement down, not off', /function stageMotionLevel\(\) \{ return reduceMotion \? 0\.35 : 1; \}/.test(src));
ok('and, given to motion 1.1 as a function, it changes mid-fight', /motion: live \? stageMotionLevel : m/.test(src));
ok('a figure wears its pose for the move it is making, when it has one',
   /var STAGE_POSES = \{ lunge: 'strike', strike: 'strike', cast: 'cast', shake: 'hurt', knock: 'hurt', dodge: 'guard' \};/.test(src) &&
   /stagePose = stagePoseOf\(sp, now\);/.test(src));
ok('hit-stop goes to motion\'s hold()', /STAGE\.fxm\.hold\(stageSprite\(key\), t0, c\.dur\)/.test(src));
ok('the snapshots know what each figure is made of', (src.match(/stageSnapshot\(party, cst, stageMat\)/g) || []).length === 3 &&
   /function stageMat\(x\) \{/.test(src));
// v4.9: the page asks for a paw each half-turn, so the cats still alternate swipe by swipe
ok('Mitz and Simz take turns at the paw', /PREFS\.paws === false \? null : STAGE\.paw % 2/.test(src) && /STAGE\.paw\+\+/.test(src));
ok('with motion 1.0 beside it, 1.1\'s moves fall back to the old ones', /if \(!v11\) \{/.test(src) &&
   /if \(!v11 && \(c\.fx\.k === 'bits' \|\| c\.fx\.k === 'tumble' \|\| c\.fx\.k === 'paw'\)\) return;/.test(src));
ok('a figure fades as motion fades it, and is not drawn once it has gone', /if \(!\(e\.alpha > 0\.005\)\) return e;/.test(src) &&
   /g\.globalAlpha = \(alive \? 1 : 0\.3\) \* ea;/.test(src));
ok('a figure drifted, melted, crumbled, swatted or faded away counts as felled', /var STAGE_GONE = \{ topple: 1, drift: 1, crumble: 1, melt: 1, swat: 1, fade: 1 \};/.test(src));
ok('a skip silences the sounds still to come', /function stageSkip\(\) \{\s+if \(!STAGE\.playing\) return false;\s+stageHush\(\);/.test(src));
ok('the stage reads no clock of its own', !/performance|Date\.now|requestAnimationFrame/.test(grab('STAGE CORE')));

console.log('\n[MO9] the paws, after Hold the Line: one swipe for the lot');
{
  const f = (bp, mat) => ({ bp, gone: false, boss: false, construct: false, mat: mat || 'flesh' });
  const sn = (foes) => ({ foes, party: [20, 20, 9, 9], logLen: 0, partyMat: ['metal', 'metal', 'cloth', 'cloth'] });
  const hit = (on, dmg) => ({ kind: 'hit', text: 'x', by: 'p0', on, roll: 15, reach: 'melee', hit: true, dmg });
  const turn = (b, a, ev, extra) => S.stageTurn(Object.assign({ events: ev, actor: null, before: sn(b), after: sn(a), paw: 0 }, extra || {}));
  const paws = r => r.cues.filter(c => c.fx && c.fx.k === 'paw');
  const swats = r => r.cues.filter(c => c.kind === 'anim' && c.anim.k === 'swat').map(c => c.key).sort();
  ok('Hold the Line waits for three; the Delve, with smaller fights, for two', S.STAGE_SWEEP_COUNT === 2 && S.STAGE_SWEEP_AGE === 4 && S.STAGE_SWEEP_GAP === 2);
  // one falls, and the fight goes on: it lies there
  let r = turn({ a: f(5), b: f(9), c: f(9) }, { a: f(0), b: f(9), c: f(9) }, [hit('a', 5)], { lying: [], sinceSwipe: 99 });
  ok('one down while others stand: it lies where it fell', !paws(r).length && r.lying.map(l => l.uid).join() === 'a' && !r.swept.length);
  // a second falls: one swipe takes both
  r = turn({ a: f(0), b: f(4), c: f(9) }, { a: f(0), b: f(0), c: f(9) }, [hit('b', 4)], { lying: [{ uid: 'a', age: 1.5 }], sinceSwipe: 99 });
  ok('two down: one cat sweeps both off in a single swipe', paws(r).length === 1 && swats(r).join() === 'a,b' && r.swept.sort().join() === 'a,b');
  ok('the paw hooks the last one down, and the rest go with it', paws(r)[0].fx.on === 'b' &&
     r.cues.filter(c => c.kind === 'anim' && c.anim.k === 'swat').every(c => c.at >= paws(r)[0].at + S.STAGE_PAW * 0.4 - 1e-9 && c.anim.persist));
  ok('with one swat sound', r.cues.filter(c => c.kind === 'sound' && c.name === 'swat').length === 1);
  ok('and it says when the swipe came, and that nobody is left lying', r.swipeAt != null && r.lying.length === 0);
  // a lone one that has lain long enough goes on its own
  const lone = age => turn({ a: f(0), b: f(9) }, { a: f(0), b: f(7) }, [hit('b', 2)], { lying: [{ uid: 'a', age }], sinceSwipe: 99 });
  ok('one lying a while goes on its own once it has lain four seconds', !paws(lone(1)).length && paws(lone(4.5)).length === 1 && swats(lone(4.5)).join() === 'a');
  // swipes at least two seconds apart
  r = turn({ a: f(0), b: f(4), c: f(9) }, { a: f(0), b: f(0), c: f(9) }, [hit('b', 4)], { lying: [{ uid: 'a', age: 1 }], sinceSwipe: 0.2 });
  ok('too soon after the last swipe: they wait for the next turn', !paws(r).length && r.lying.length === 2);
  r = turn({ a: f(0), b: f(4) }, { a: f(0), b: f(0) }, [hit('b', 4)], { lying: [{ uid: 'a', age: 1 }], sinceSwipe: 0.2 });
  ok('but a won fight still ends with one, a beat later', paws(r).length === 1 && paws(r)[0].at >= 1.8 - 1e-9);
  // the swept do not come back
  r = turn({ a: f(0), b: f(4), c: f(9) }, { a: f(0), b: f(0), c: f(9) }, [hit('b', 4)], { lying: [], sinceSwipe: 99 });
  ok('one already swept is not swept again', !paws(r).length && r.lying.map(l => l.uid).join() === 'b');
  // paws off, or reduced motion: the fallen fade instead
  const fades = r2 => r2.cues.filter(c => c.kind === 'anim' && c.anim.k === 'fade' && c.anim.persist).map(c => c.key).sort().join();
  r = turn({ a: f(0), b: f(4), c: f(9) }, { a: f(0), b: f(0), c: f(9) }, [hit('b', 4)], { lying: [{ uid: 'a', age: 1 }], sinceSwipe: 99, paw: null });
  ok('with the paws off the fallen fade instead, on the same beat', !paws(r).length && fades(r) === 'a,b' && r.swipeAt === null);
  r = turn({ a: f(0), b: f(4), c: f(9) }, { a: f(0), b: f(0), c: f(9) }, [hit('b', 4)], { lying: [{ uid: 'a', age: 1 }], sinceSwipe: 99, reduced: true });
  ok('and with reduced motion', !paws(r).length && fades(r) === 'a,b');
  // the cats
  r = turn({ a: f(0), b: f(4) }, { a: f(0), b: f(0) }, [hit('b', 4)], { lying: [{ uid: 'a', age: 1 }], sinceSwipe: 99, paw: 1 });
  const r0 = turn({ a: f(0), b: f(4) }, { a: f(0), b: f(0) }, [hit('b', 4)], { lying: [{ uid: 'a', age: 1 }], sinceSwipe: 99, paw: 0 });
  ok('each paw says whose it is, for the collar tag', paws(r0)[0].fx.cat === 'mitz' && paws(r)[0].fx.cat === 'simz');
  ok('Mitz red with a gold M, Simz gold with a red S', /mitz: \{ tag: '#C0392B', letter: '#E3A93C', ch: 'M' \}, simz: \{ tag: '#E3A93C', letter: '#C0392B', ch: 'S' \}/.test(src) &&
     /STAGE\.fxm\.drawFx\(now\);\s+stageCollars\(g, c\.w, now\);/.test(src));
  ok('the page keeps who is lying and when the last swipe came', /lying: lyingAt\(now\), sinceSwipe: now - STAGE\.lastSwipe/.test(src) &&
     /function stageNoteSweep\(r, base\)/.test(src) && /STAGE\.lying = \{\}; STAGE\.lastSwipe = -99;/.test(src));
  ok('a Cat paws setting, on unless switched off, and kept', /id="pawsToggle"/.test(src) && /reduce: null, paws: true \};/.test(src) &&
     /function setPaws\(on\)/.test(src));
}

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' \u2014 ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

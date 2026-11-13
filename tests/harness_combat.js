const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');

function grab(tag) {
  const re = new RegExp('/\\* ==== ' + tag + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + tag + ' END ==== \\*/');
  const mm = src.match(re);
  if (!mm) { console.error('FAIL: ' + tag + ' markers missing'); process.exit(1); }
  return mm[1];
}

// Every harness boots the bundled pack first: the engine has no content of its own.
const BOOT = grab('BUNDLED PACK') + grab('PACK CORE') +
  '\nvar __L = loadPack(BUNDLED_PACK);' +
  '\nif(!__L.ok){throw new Error("pack invalid: "+__L.errors.join("; "));}\n';

const names = ['isFront','frontRank','backRank','foeFront','foeBack','meleeTargets','anyTargets','canSwapRank','swapRank','normalisePositions','weaponReach','hasTrait','tickStatuses','tickEffects','effectBonus','FRONT_SLOTS','MONSTERS','SPELLS','startingSpells','grantStartingSpells','rollDice','makeEncounter',
  'beginCombat','partyAction','foeTurns','advanceCombat','finishCombat','activeActor','livingFoes',
  'attackRoll','reviveAfterWipe','threatTriggers','describeFoes','foesBlockLine','makeGroup','setMonsterScale','currentMonsterScale','scaleFoe','scaleGroupSize','wasStruck','advanceCombat','activeActor','normalisePositions','startingKit','grantStartingSpells',
  'makeRng','makeParty','makeCharacter','maxBP','maxMP','partyDown','applyDamage','canLevel','levelUp',
  'oneFoeTurn','attacksThisTurn','fitPools','surpriseChance','partyFirst','bossTell','bossUnleash','TELL','SURPRISE','engagedParty','hasPolearm','meleeReach','POLEARM_FROM_BEHIND','canUse','ITEMS','makeItem','useItem','anyTargets','letterFoe','spawnerTurn','MONSTERS'];
const C = new Function(BOOT + grab('PARTY CORE') + '\n' + grab('SAVE CORE') + '\n' + grab('WORLD CORE') + '\n' + grab('EVENT CORE') + '\n' + grab('COMBAT CORE') + '\n' + grab('TOWN CORE') + '\n' + grab('INVENTORY CORE') +
  '\nreturn {' + names.join(',') + '};')();

let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));} };

function freshParty(seed) {
  const rg = C.makeRng(seed);
  const p = C.makeParty(rg,[{name:'Bruda',class:'fighter'},{name:'Kesh',class:'fighter'},
                            {name:'Merl',class:'mage'},{name:'Ansel',class:'priest'}]);
  C.grantStartingSpells(p);
  p.forEach(c=>{ c.equipped.weapon={damage:[1,8,0]}; });
  return p;
}

/* Drive a whole fight with a simple policy. Returns the final state. */
function runFight(seed, policy) {
  const rg = C.makeRng(seed);
  const party = freshParty(seed);
  const st = C.beginCombat(party, C.makeEncounter('mn.goblin', rg), rg);
  let guard = 0;
  while (!st.outcome && guard++ < 2000) {
    const i = C.activeActor(st);
    if (i === null) { C.advanceCombat(party, st, rg); continue; }
    C.partyAction(party, st, policy(party[i], st, rg), 0, rg);
    C.advanceCombat(party, st, rg);
  }
  return { st, party, guard };
}

// A rank-aware policy, as a player would play: melee only from the front.
const alwaysAttack = (ch, st) => (C.weaponReach(ch) === 'ranged' || C.isFront(ch))
  ? 'attack' : 'forward';

console.log('\n[C1] dice and encounter generation');
let dbad=0, dmin=99, dmax=0;
for (let s=0;s<2000;s++){ const v=C.rollDice(C.makeRng(s),[2,6,1]);
  dmin=Math.min(dmin,v); dmax=Math.max(dmax,v); if(v<3||v>13) dbad++; }
ok('2d6+1 stays in 3..13', dbad===0, dmin+'..'+dmax);
ok('range actually spans', dmin===3 && dmax===13, dmin+'..'+dmax);

let sizes=new Set(), ebad=0;
for (let s=0;s<800;s++){
  const foes=C.makeEncounter('mn.goblin', C.makeRng(s));
  sizes.add(foes.length);
  if(foes.length<2||foes.length>4) ebad++;
  foes.forEach(f=>{ if(f.bp<1||f.bp>9||f.bp!==f.bpMax) ebad++; });
}
ok('goblin groups sized 2..4', ebad===0, [...sizes].sort().join(','));
ok('every goblin spawns alive at full BP', ebad===0);
ok('unknown monster throws', (()=>{try{C.makeEncounter('mn.nope',C.makeRng(1));return false;}catch(e){return true;}})());

console.log('\n[C2] attack rolls behave');
let hits=0,crits=0,fumbles=0,N=200000;
const rg=C.makeRng(77);
for(let i=0;i<N;i++){ const r=C.attackRoll(rg,2,12); if(r.hit)hits++; if(r.crit)crits++; if(r.fumble)fumbles++; }
ok('nat 20 rate ~5%', Math.abs(crits/N-0.05)<0.004, (100*crits/N).toFixed(2)+'%');
ok('nat 1 rate ~5%', Math.abs(fumbles/N-0.05)<0.004, (100*fumbles/N).toFixed(2)+'%');
ok('hit rate plausible for +2 vs AC12', hits/N>0.5 && hits/N<0.62, (100*hits/N).toFixed(1)+'%');
ok('nat 1 never hits', (()=>{for(let i=0;i<50000;i++){const r=C.attackRoll(rg,99,1);if(r.fumble&&r.hit)return false;}return true;})());
ok('nat 20 always hits', (()=>{for(let i=0;i<50000;i++){const r=C.attackRoll(rg,-99,99);if(r.crit&&!r.hit)return false;}return true;})());

console.log('\n[C3] fights always terminate');
let stalls=0, maxGuard=0, outcomes={};
for(let s=0;s<3000;s++){
  const {st,guard}=runFight(s,alwaysAttack);
  maxGuard=Math.max(maxGuard,guard);
  if(!st.outcome) stalls++;
  outcomes[st.outcome]=(outcomes[st.outcome]||0)+1;
}
ok('3000 fights all reached an outcome', stalls===0, 'stalls='+stalls);
ok('no fight needed absurd iterations', maxGuard<200, 'max='+maxGuard);
ok('both win and loss occur', outcomes.won>0 && outcomes.lost>0, JSON.stringify(outcomes));
// Ranked archers on floor 1 made this much harder than the goblins-only build
// (87% -> ~45%). Assert the fight is meaningful, not that it is easy; the real
// number is a balance input, recorded here rather than tuned away.
const winRate = outcomes.won/3000;
ok('a level-1 party can win, but not for free', winRate>0.25 && winRate<0.90,
   (100*winRate).toFixed(1)+'% — outside 25-90% means the encounter is broken, not merely hard');

console.log('\n[C3b] a mixed warband is announced correctly');
// It used to take the first foe's name and pluralise it, so two goblins and
// two archers read as "4 Goblins".
const mixed=C.makeGroup([{ref:'mn.goblin',count:2},{ref:'mn.goblinArcher',count:2}],C.makeRng(1));
const line=C.foesBlockLine(mixed);
ok('each kind is counted separately', /2 Goblins and 2 Goblin Archers/.test(line), line);
ok('the verb agrees for a group', / block the way\.$/.test(line), line);
ok('and for a single foe', (()=>{
  const one=C.makeGroup([{ref:'mn.goblin',count:1}],C.makeRng(2));
  return / blocks the way\.$/.test(C.foesBlockLine(one));})());
ok('a lone foe gets an article', (()=>{
  const one=C.makeGroup([{ref:'mn.goblin',count:1}],C.makeRng(3));
  return /^A Goblin /.test(C.foesBlockLine(one));})());
ok('a vowel gets "an"', (()=>{
  const one=C.makeGroup([{ref:'mn.ironSentinel',count:1}],C.makeRng(4));
  return /^An Iron Sentinel /.test(C.foesBlockLine(one));})());
ok('three kinds read as a list', (()=>{
  const three=C.makeGroup([{ref:'mn.goblin',count:2},{ref:'mn.goblinArcher',count:1},
                           {ref:'mn.direRat',count:3}],C.makeRng(5));
  return /2 Goblins, a Goblin Archer and 3 Dire Rats/.test(C.foesBlockLine(three));})());
ok('an empty group does not crash', C.describeFoes([])==='Nothing');

console.log('\n[C3c] depth scaling is explicit, not ambient');
// currentMonsterScale() used to read the app's `floor` global, which broke
// every headless runner. COMBAT CORE must not reach outside itself.
ok('the scale is state the caller sets', /function setMonsterScale/.test(src));
ok('and it does not read app globals',
   !/return \(floor && floor\.monsterScale\) \|\| 1;/.test(src),
   'COMBAT CORE is pure and must stay loadable on its own');
ok('it defaults to one', (()=>{ C.setMonsterScale(0); return C.currentMonsterScale()===1; })());
ok('a nonsense value is refused', (()=>{ C.setMonsterScale(-3); return C.currentMonsterScale()===1; })());
ok('spawning unscaled matches the book', (()=>{
  C.setMonsterScale(1);
  const f=C.makeEncounter('mn.goblin',C.makeRng(1));
  return f.every(x=>!x.scaled);})());
// Superseded: group size scales with depth too, so the counts differ by design.
ok('spawning scaled hardens the group', (()=>{
  C.setMonsterScale(1);
  const plain=C.makeEncounter('mn.goblin',C.makeRng(9));
  C.setMonsterScale(3);
  const hard=C.makeEncounter('mn.goblin',C.makeRng(9));
  C.setMonsterScale(1);
  return hard[0].bpMax > plain[0].bpMax && hard[0].xp > plain[0].xp;})());
ok('and sends more of them', (()=>{
  C.setMonsterScale(1);
  const plain=C.makeEncounter('mn.goblin',C.makeRng(9));
  C.setMonsterScale(5);
  const hard=C.makeEncounter('mn.goblin',C.makeRng(9));
  C.setMonsterScale(1);
  return hard.length >= plain.length;})());
ok('the app keeps it in step with the floor', /setMonsterScale\(floor\.monsterScale \|\| 1\)/.test(src));

console.log('\n[C3d] every stat worth hardening is hardened');
function fresh(){ return {bpMax:10,bp:10,defense:12,level:2,xp:100,gold:[1,6,10],
  attacks:[{name:'claw',toHit:3,damage:[1,6,1],reach:'melee'}],
  phases:[{belowBP:0.5,damageMult:1.4,summon:{ref:'mn.goblin',count:2}}]}; }

const s1=fresh(), s4=fresh();
C.scaleFoe(s4,4);
ok('body scales', s4.bpMax>s1.bpMax, s1.bpMax+' -> '+s4.bpMax);
ok('defence scales', s4.defense>s1.defense, s1.defense+' -> '+s4.defense);
ok('to-hit scales', s4.attacks[0].toHit>s1.attacks[0].toHit);
ok('damage scales', s4.attacks[0].damage[2]>s1.attacks[0].damage[2]);
ok('experience scales', s4.xp>s1.xp, s1.xp+' -> '+s4.xp);
ok('gold scales', s4.gold[2]>s1.gold[2], s1.gold[2]+' -> '+s4.gold[2],
   'it used to be copied but never scaled — deep kills paid floor-1 money');
ok('level is reported honestly', s4.level>s1.level, s1.level+' -> '+s4.level,
   'Turn Undead reads level, so a scaled monster must report one');
// Superseded in v4.2. This used to check that the attack LIST grew, and it did,
// but a foe picks one attack from that list, so the extra ones never landed.
// What matters is the number of attacks made in a turn.
ok('a deep creature attacks more often each turn', (s4.perTurn||1) > (s1.perTurn||1), (s1.perTurn||1)+' -> '+s4.perTurn);
ok('and the list is not padded with copies any more', s4.attacks.length===s1.attacks.length);
ok('it stops at three a turn', (()=>{ const b=fresh(); C.scaleFoe(b,50); return b.perTurn===3; })());
const swings = (foe, seed) => {
  const party = C.makeParty ? null : null;
  const st = { foes:[foe], log:[], order:[], refusals:{} };
  const pp = [0,1,2,3].map(i=>({name:'P'+i, class:'fighter', bp:999, bpMax:999, stats:{str:12,dex:10,con:12,int:10,pie:10},
    status:[], equipped:{}, pack:[], rank: i<2?'front':'back', defBonus:0, level:1}));
  let r = seed || 7; const rng = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const ev = C.oneFoeTurn(pp, st, foe, rng);
  return ev.filter(e => e.kind==='foehit' && / catches /.test(e.text) || e.kind==='foemiss' && / (lunges|looses) at /.test(e.text)).length;
};
ok('one attack a turn by default', swings(Object.assign(fresh(), {name:'Imp', uid:'a'})) === 1);
ok('a scaled foe really swings more than once', swings(Object.assign((()=>{const b=fresh(); C.scaleFoe(b,6); return b;})(), {name:'Imp', uid:'b'})) === 3,
   'counted from the turn itself, not from the attack list');
ok('a claw and a bite are both used', (()=>{ const f=Object.assign(fresh(), {name:'Bear', uid:'c', perTurn:2,
     attacks:[{name:'claw',toHit:30,damage:[1,2,0],reach:'melee'},{name:'bite',toHit:30,damage:[1,2,0],reach:'melee'}]});
   const st={foes:[f],log:[],order:[],refusals:{}}, pp=[{name:'P',class:'fighter',bp:999,bpMax:999,stats:{str:12,dex:10,con:12,int:10,pie:10},status:[],equipped:{},pack:[],rank:'front',defBonus:0,level:1}];
   let r=11; const rng=()=>(r=(r*16807)%2147483647)/2147483647;
   const t=C.oneFoeTurn(pp,st,f,rng).map(e=>e.text).join(' ');
   return /claw/.test(t) && /bite/.test(t); })());
ok('a turn is logged once', (()=>{ const f=Object.assign(fresh(), {name:'Imp', uid:'d'}); const st={foes:[f],log:[],order:[],refusals:{}};
   const pp=[{name:'P',class:'fighter',bp:999,bpMax:999,stats:{str:12,dex:10,con:12,int:10,pie:10},status:[],equipped:{},pack:[],rank:'front',defBonus:0,level:1}];
   let r=3; const rng=()=>(r=(r*16807)%2147483647)/2147483647;
   const ev=C.foeTurns(pp,st,rng); return st.log.length===ev.length; })(),
   'the ambush round used to print every foe\'s line twice');
ok('boss phases scale with the creature', (()=>{
  const a=fresh(), b=fresh(); C.scaleFoe(b,3);
  return b.phases[0].summon.count > a.phases[0].summon.count &&
         b.phases[0].damageMult > a.phases[0].damageMult;})());
ok('more of them turn up as well', C.scaleGroupSize(3,4) > 3, '3 -> '+C.scaleGroupSize(3,4));

// The things that must NOT scale.
ok('defence is capped', (()=>{
  const a=fresh(), b=fresh(); C.scaleFoe(b,50);
  return b.defense <= a.defense + 12;})(),
  'unbounded defence eventually makes a monster impossible to hit');
ok('the dice themselves are untouched', (()=>{
  const a=fresh(), b=fresh(); C.scaleFoe(b,6);
  return b.attacks[0].damage[0]===a.attacks[0].damage[0] &&
         b.attacks[0].damage[1]===a.attacks[0].damage[1];})(),
  'growing the dice count makes damage swing wildly; a flat bonus is steadier');
ok('traits are left alone', (()=>{
  const b=fresh(); b.traits=['undead','guard']; C.scaleFoe(b,5);
  return b.traits.length===2;})(),
  'a scaled goblin should not acquire regeneration it never had');
ok('a scale of one changes nothing at all', (()=>{
  const a=fresh(), b=fresh(); C.scaleFoe(b,1);
  return JSON.stringify(a)===JSON.stringify(b);})());
ok('group size is untouched at scale one', C.scaleGroupSize(3,1)===3);
ok('an exact count named by a pack is respected', /entry\.count != null \? entry\.count/.test(src),
   'a scripted encounter of exactly two must stay two');

console.log('\n[C3e] a struck figure is shown to have been struck');
// A bar creeping down is easy to miss. The originals inverted the figure that
// took damage; this records who, so the renderer can flash them.
function fp(seed){
  const rg=C.makeRng(seed);
  const p=C.makeParty(rg,[{name:'A',class:'fighter'},{name:'B',class:'fighter'},
    {name:'C',class:'priest'},{name:'D',class:'mage'}]);
  C.grantStartingSpells(p);C.startingKit(p);C.normalisePositions(p);
  p.forEach(c=>{c.effects=[];c.cooldowns={};});
  return p;
}
ok('there is a way to ask who was struck', typeof C.wasStruck==='function');
ok('nothing is flashing before a blow lands', (()=>{
  const rg=C.makeRng(4), p=fp(4);
  const st=C.beginCombat(p,C.makeEncounter('mn.goblin',rg),rg);
  return !st.foes.some(f=>C.wasStruck(st,'foes',f.uid));})());
ok('a foe that takes damage is marked', (()=>{
  for(let s=0;s<80;s++){
    const rg=C.makeRng(s+30), p=fp(s+30);
    const st=C.beginCombat(p,C.makeEncounter('mn.goblin',rg),rg);
    const i=C.activeActor(st); if(i===null) continue;
    C.partyAction(p,st,'attack',0,rg);
    if(st.foes.some(f=>C.wasStruck(st,'foes',f.uid))) return true;
  }
  return false;})());
ok('a party member that takes damage is marked', (()=>{
  for(let s=0;s<80;s++){
    const rg=C.makeRng(s+70), p=fp(s+70);
    const st=C.beginCombat(p,C.makeEncounter('mn.goblin',rg),rg);
    C.foeTurns(p,st,rg);
    if(p.some((c,j)=>C.wasStruck(st,'party',j))) return true;
  }
  return false;})());
ok('an action that hurts nobody marks nobody', (()=>{
  const rg=C.makeRng(9), p=fp(9);
  const st=C.beginCombat(p,C.makeEncounter('mn.goblin',rg),rg);
  C.partyAction(p,st,'defend',0,rg);
  return !st.foes.some(f=>C.wasStruck(st,'foes',f.uid));})(),
  'a miss must not flash the target');
ok('the mark clears when the next action lands', (()=>{
  const rg=C.makeRng(12), p=fp(12);
  const st=C.beginCombat(p,C.makeEncounter('mn.goblin',rg),rg);
  C.partyAction(p,st,'attack',0,rg);
  C.advanceCombat(p,st,rg);
  C.partyAction(p,st,'defend',0,rg);
  return !st.foes.some(f=>C.wasStruck(st,'foes',f.uid));})(),
  'a flash that never clears is just a permanent mark');
ok('it catches damage from any source, not just melee',
   /function snapshotBP/.test(src) && /function markStruck/.test(src),
   'threading a flag through every damage site would miss poison, riposte and phases');
ok('a fallen foe is marked differently from a wounded one',
   /\(f\.bp <= 0\) \? 'down' : 'hit'/.test(src));

console.log('\n[C4] no value ever goes out of bounds');
let oob=0;
for(let s=0;s<1500;s++){
  const {st,party}=runFight(s,alwaysAttack);
  party.forEach(c=>{ if(c.bp<0||c.bp>C.maxBP(c)||Number.isNaN(c.bp)) oob++;
                     if(c.mp<0||c.mp>C.maxMP(c)||Number.isNaN(c.mp)) oob++; });
  st.foes.forEach(f=>{ if(f.bp<0||f.bp>f.bpMax||Number.isNaN(f.bp)) oob++; });
}
ok('party BP/MP and foe BP stay in range over 1500 fights', oob===0, 'oob='+oob);

console.log('\n[C5] outcomes mean what they say');
let bad=0;
for(let s=0;s<1500;s++){
  const {st,party}=runFight(s,alwaysAttack);
  if(st.outcome==='won'){
    if(C.livingFoes(st).length) bad++;
    if(st.xpAwarded<=0) bad++;
    if(party.every(c=>c.xp===0)) bad++;
  }
  if(st.outcome==='lost'){
    if(!C.partyDown(party)) bad++;
    if(st.xpAwarded!==0) bad++;
    if(party.some(c=>c.xp>0)) bad++;
  }
}
ok('win => no foes left and xp awarded', bad===0, 'bad='+bad);
ok('loss => party down and zero xp', bad===0);

console.log('\n[C6] fleeing');
let fled=0, fledWithFoes=0;
for(let s=0;s<1500;s++){
  const {st}=runFight(s,(ch,state)=>state.round>1?'flee':alwaysAttack(ch,state));
  if(st.outcome==='fled'){ fled++; if(!C.livingFoes(st).length) fledWithFoes++; }
}
ok('fleeing sometimes works', fled>200, 'fled='+fled+'/1500');
ok('fleeing ends combat immediately', fled>0);

console.log('\n[C7] determinism');
const a=runFight(1234,alwaysAttack), b=runFight(1234,alwaysAttack);
ok('same seed, same outcome', a.st.outcome===b.st.outcome);
ok('same seed, same log', JSON.stringify(a.st.log)===JSON.stringify(b.st.log));
ok('same seed, same final BP', JSON.stringify(a.party.map(c=>c.bp))===JSON.stringify(b.party.map(c=>c.bp)));
ok('different seed usually differs', JSON.stringify(runFight(1235,alwaysAttack).st.log)!==JSON.stringify(a.st.log));

console.log('\n[C8] spells');
ok('mage starts with at least one tier-1 spell', C.startingSpells('mage').length>=1, String(C.startingSpells('mage').length));
ok('priest starts with at least one tier-1 spell', C.startingSpells('priest').length>=1, String(C.startingSpells('priest').length));
ok('fighter knows none', C.startingSpells('fighter').length===0);
let mpbad=0, healed=0;
for(let s=0;s<800;s++){
  const rgs=C.makeRng(s); const party=freshParty(s);
  C.applyDamage(party[0], Math.floor(C.maxBP(party[0])*0.6));
  const st=C.beginCombat(party, C.makeEncounter('mn.goblin',rgs), rgs);
  let guard=0;
  while(!st.outcome && guard++<2000){
    const i=C.activeActor(st);
    if(i===null){ C.advanceCombat(party,st,rgs); continue; }
    const ch=party[i];
    const sp=ch.spellsKnown[0];
    C.partyAction(party,st, sp && ch.mp>=C.SPELLS[sp].mp ? 'cast:'+sp : 'attack', 0, rgs);
    C.advanceCombat(party,st,rgs);
  }
  party.forEach(c=>{ if(c.mp<0) mpbad++; });
}
ok('MP never goes negative when casting', mpbad===0, 'bad='+mpbad);
ok('casting with insufficient MP is refused, not negative', (()=>{
  const rgs=C.makeRng(3); const party=freshParty(3);
  const st=C.beginCombat(party,C.makeEncounter('mn.goblin',rgs),rgs);
  const mage=party.find(c=>c.class==='mage'); mage.mp=0;
  while(C.activeActor(st)!==null && party[C.activeActor(st)]!==mage) C.partyAction(party,st,'attack',0,rgs);
  C.partyAction(party,st,'cast:sp.bolt1',0,rgs);
  return mage.mp===0; })());

console.log('\n[C9] wipe recovery never destroys the save');
const wp=freshParty(5);
wp.forEach(c=>C.applyDamage(c,9999));
ok('party is fully down', C.partyDown(wp));
const rev=C.reviveAfterWipe(wp, 400, { goldLoss: 0.25 });
ok('everyone revives with at least 1 BP', wp.every(c=>c.bp>=1));
ok('nobody revives at full', wp.every(c=>c.bp<C.maxBP(c)));
ok('down status cleared', wp.every(c=>c.status.indexOf('down')<0));
ok('gold reduced not zeroed', rev.gold===300 && rev.lost===100, JSON.stringify(rev));
ok('zero gold survives the maths', (()=>{const r=C.reviveAfterWipe(freshParty(6),0,{goldLoss:0.25});
  return r.gold===0 && r.lost===0;})());

console.log('\n[C10] threat trigger');
let fires=0;
for(let s=0;s<10000;s++) if(C.threatTriggers(100,C.makeRng(s),{triggerAt:100,jitter:15})) fires++;
ok('threat 100 always fires', fires===10000, fires+'/10000');
let low=0;
for(let s=0;s<10000;s++) if(C.threatTriggers(50,C.makeRng(s),{triggerAt:100,jitter:15})) low++;
ok('threat 50 never fires', low===0, low+'/10000');
let mid=0;
for(let s=0;s<10000;s++) if(C.threatTriggers(90,C.makeRng(s),{triggerAt:100,jitter:15})) mid++;
ok('threat 90 fires sometimes but not always', mid>500 && mid<9500, (mid/100).toFixed(1)+'%');

console.log('\n[C11] items in a fight');
// v4.2: an item in a fight is the user's turn (it used to be free, for anyone,
// at any moment), and damage items finally do what they say.
function itemFight(seed, foeRef) {
  const rg = C.makeRng(seed);
  const party = freshParty(seed);
  const st = C.beginCombat(party, C.makeEncounter(foeRef || 'mn.goblin', rg), rg);
  let guard = 0;
  while (C.activeActor(st) === null && !st.outcome && guard++ < 50) C.advanceCombat(party, st, rg);
  return { rg, party, st, i: C.activeActor(st) };
}
const turnPassed = (st, i) => C.activeActor(st) !== i || (st.order[0] && st.order[0].side !== 'party');
{
  const f = itemFight(21); const ch = f.party[f.i];
  ch.bp = Math.max(1, Math.floor(C.maxBP(ch) / 3)); const before = ch.bp;
  ch.pack = [C.makeItem('it.potion')];
  const orderBefore = f.st.order.length;
  C.partyAction(f.party, f.st, 'item:0:' + f.i, 0, f.rg);
  ok('a potion in a fight heals', ch.bp > before, before + ' -> ' + ch.bp);
  ok('and is used up', ch.pack.length === 0);
  ok('and takes the drinker\'s turn', f.st.order.length === orderBefore - 1);
}
{
  const f = itemFight(22); const ch = f.party[f.i];
  ch.bp = C.maxBP(ch); ch.pack = [C.makeItem('it.potion')];
  const orderBefore = f.st.order.length;
  C.partyAction(f.party, f.st, 'item:0:' + f.i, 0, f.rg);
  ok('a draught nobody needs is refused', ch.pack.length === 1 && /unhurt/.test(f.st.log.map(e=>e.text).join(' ')));
  ok('and the turn is kept', f.st.order.length === orderBefore);
}
{
  const f = itemFight(23, 'mn.skeleton'); const ch = f.party[f.i];
  ch.pack = [C.makeItem('it.holywater')];
  const foe = C.anyTargets(f.st)[0], idx = f.st.foes.indexOf(foe), bp0 = foe.bp;
  C.partyAction(f.party, f.st, 'item:0', idx, f.rg);
  ok('holy water burns the dead', foe.bp < bp0, bp0 + ' -> ' + foe.bp);
  ok('and is gone afterwards', ch.pack.length === 0);
}
{
  const f = itemFight(24, 'mn.goblin'); const ch = f.party[f.i];
  ch.pack = [C.makeItem('it.holywater')];
  const foe = C.anyTargets(f.st)[0], bp0 = foe.bp, ord = f.st.order.length;
  C.partyAction(f.party, f.st, 'item:0', f.st.foes.indexOf(foe), f.rg);
  ok('but is not wasted on the living', foe.bp === bp0 && ch.pack.length === 1 && f.st.order.length === ord,
     f.st.log.slice(-1)[0] && f.st.log.slice(-1)[0].text);
}
{
  const f = itemFight(25, 'mn.goblin'); const ch = f.party[f.i];
  ch.pack = [C.makeItem('it.wand.spark')];
  const foe = C.anyTargets(f.st)[0], bp0 = foe.bp, ch0 = ch.pack[0].charges;
  C.partyAction(f.party, f.st, 'item:0', f.st.foes.indexOf(foe), f.rg);
  ok('the wand of sparks hurts', foe.bp < bp0);
  ok('and spends a charge, not the wand', ch.pack.length === 1 && ch.pack[0].charges === ch0 - 1, ch0 + ' -> ' + (ch.pack[0] && ch.pack[0].charges));
}
{
  const f = itemFight(26, 'mn.goblin'); const ch = f.party[f.i];
  ch.pack = [C.makeItem('it.scroll.fire')];
  const foe = C.anyTargets(f.st)[0], bp0 = foe.bp;
  C.partyAction(f.party, f.st, 'item:0', f.st.foes.indexOf(foe), f.rg);
  ok('a scroll of fire hurts', foe.bp < bp0 && ch.pack.length === 0);
}
{
  const f = itemFight(27, 'mn.goblin'); const ch = f.party[f.i];
  ch.pack = [C.makeItem('it.scroll.recall')];
  C.partyAction(f.party, f.st, 'item:0', 0, f.rg);
  ok('a recall scroll ends the fight and goes home', f.st.outcome === 'fled' && f.st.recall === true);
}
{
  const f = itemFight(28); const ch = f.party[f.i];
  ch.pack = [C.makeItem('it.torch')];
  const ord = f.st.order.length;
  C.partyAction(f.party, f.st, 'item:0', 0, f.rg);
  ok('a torch is no use mid-fight, and costs no turn', ch.pack.length === 1 && f.st.order.length === ord);
}
ok('a new wand carries its charges', C.makeItem('it.wand.spark').charges === 5);
ok('an older save\'s wand, with none recorded, still gets them', (()=>{ const f = itemFight(31, 'mn.goblin'); const ch = f.party[f.i];
   const w = C.makeItem('it.wand.spark'); delete w.charges; ch.pack = [w];
   C.partyAction(f.party, f.st, 'item:0', f.st.foes.indexOf(C.anyTargets(f.st)[0]), f.rg);
   return ch.pack.length === 1 && ch.pack[0].charges === 4; })());
ok('outside a fight a damage item is saved, not wasted', (()=>{ const p = freshParty(29); p[0].pack = [C.makeItem('it.scroll.fire')];
   const r = C.useItem(p, 0, 0, 0, C.makeRng(1), 'dungeon'); return !r.ok && p[0].pack.length === 1 && /fight/.test(r.notes[0]); })());
ok('the Scroll of Revealing now reveals', (()=>{ const p = freshParty(30); p[0].pack = [C.makeItem('it.scroll.reveal')];
   const r = C.useItem(p, 0, 0, 0, C.makeRng(1), 'dungeon'); return r.ok && r.reveal === 'floor' && p[0].pack.length === 0; })(),
   'it used to answer "Nothing happened."');
ok('in a fight the inventory spends the turn, only for the one whose turn it is',
   /if \(inFight && turnOf !== ci\) \{ u\.disabled = true;/.test(src) && /doAction\('item:' \+ i/.test(src));

console.log('\n[C12] the enemy can go first without freezing the fight (v4.9)');
// When a foe won initiative, at the start or when a new round's order put one
// first, the screen sat on "..." for good: it only moved on after a party
// action. The core was always fine (the simulator advances when no hero is up);
// the screen now does the same.
(() => {
  let opened = 0, handedBack = 0, newRound = 0, newRoundBack = 0;
  for (let s = 0; s < 300; s++) {
    const rg = C.makeRng(9000 + s), p = fp(9000 + s);
    const st = C.beginCombat(p, C.makeEncounter('mn.goblin', rg), rg);
    if (C.activeActor(st) === null && !st.outcome) {
      opened++;
      let g = 0; while (!st.outcome && C.activeActor(st) === null && g++ < 6) C.advanceCombat(p, st, rg);
      if (st.outcome || C.activeActor(st) !== null) handedBack++;
    }
    // play on: whenever a round opens with them, one more advance hands it back
    let guard = 0;
    while (!st.outcome && guard++ < 60) {
      const i = C.activeActor(st);
      if (i === null) { newRound++; let g = 0; while (!st.outcome && C.activeActor(st) === null && g++ < 6) C.advanceCombat(p, st, rg);
                        if (st.outcome || C.activeActor(st) !== null) newRoundBack++; continue; }
      C.partyAction(p, st, 'attack', 0, rg); C.advanceCombat(p, st, rg);
    }
  }
  ok('fights do open with the enemy', opened > 20, opened + ' of 300');
  ok('and running their turns always hands the turn to a hero, or ends it', handedBack === opened, handedBack + '/' + opened);
  ok('rounds that open with the enemy settle the same way', newRound > 0 && newRoundBack === newRound, newRoundBack + '/' + newRound);
})();
ok('the screen runs their turns whenever one of them is up',
   /function foesGoFirst\(\) \{\s*if \(!cst \|\| cst\.outcome \|\| activeActor\(cst\) !== null\) return false;/.test(src) &&
   /while \(cst && !cst\.outcome && activeActor\(cst\) === null && guard\+\+ < 6\) advanceCombat\(party, cst, actionRng\);/.test(src));
ok('and plays them on the stage', /if \(stA\) stagePlay\(null, null, selFoe, null, stA, stA, stageSnapshot\(party, cst, stageMat\)\);/.test(src));
ok('when a fight starts', /renderCombat\(\);\s*settleFoes\(\);\s*\/\/ they may have the initiative/.test(src));
ok('after each action', /renderCombat\(\);\s*settleFoes\(\);\s*\/\/ a new round may open with the enemy/.test(src));
ok('and once a turn has finished playing out', /renderActions\(\);\s*settleFoes\(\);\s*\/\/ and if the enemy is up next/.test(src));
ok('but never while a turn is still playing', /function settleFoes\(\) \{\s*if \(STAGE\.playing\) return;/.test(src));

console.log('\n[C13] a foe that joins a fight has a name of its own (v5.0)');
// The play bot found three "Rot Grub F" in one fight: a split copied its
// parent's name whole, so the list and the stage could not tell them apart.
(() => {
  const st = { foes: [{ ref: 'mn.x', name: 'Grub A' }, { ref: 'mn.x', name: 'Grub B' }] };
  const a = { ref: 'mn.x', name: 'Grub B' }; st.foes.push(a); C.letterFoe(st, a);
  const b = { ref: 'mn.x', name: 'Grub A' }; st.foes.push(b); C.letterFoe(st, b);
  ok('a split takes the next free letter', a.name === 'Grub C' && b.name === 'Grub D', a.name + ', ' + b.name);
  const lone = { foes: [{ ref: 'mn.y', name: 'Ghoul' }] }, c = { ref: 'mn.y', name: 'Ghoul' };
  lone.foes.push(c); C.letterFoe(lone, c);
  ok('a lone foe that gains kin becomes A, the newcomer B', lone.foes[0].name === 'Ghoul A' && c.name === 'Ghoul B', lone.foes.map(f => f.name).join(', '));
  const other = { foes: [{ ref: 'mn.z', name: 'Skeleton A' }] }, d = { ref: 'mn.w', name: 'Zombie' };
  other.foes.push(d); C.letterFoe(other, d);
  ok('a different kind keeps its plain name', d.name === 'Zombie');
  const boss = { foes: [{ ref: 'mn.s', name: 'The Shade of Ashkeld' }] }, e = { ref: 'mn.t', name: 'Shade Wisp' };
  boss.foes.push(e); C.letterFoe(boss, e);
  ok('a named foe is never lettered by mistake', boss.foes[0].name === 'The Shade of Ashkeld');
})();
// every fight in 400 seeded ones, with splitters and spawners in them: no two living foes share a name
(() => {
  const splitters = Object.keys(C.MONSTERS).filter(k => (C.MONSTERS[k].traits || []).some(t => t === 'split' || t === 'spawner'));
  let dup = 0, joined = 0, checked = 0;
  for (let s = 0; s < 400 && splitters.length; s++) {
    const rg = C.makeRng(7000 + s), p = freshParty(7000 + s);
    const st = C.beginCombat(p, C.makeGroup([{ ref: splitters[s % splitters.length], count: 3 }], rg), rg);
    const n0 = st.foes.length;
    let g = 0;
    while (!st.outcome && g++ < 40) {
      const i = C.activeActor(st);
      if (i !== null) C.partyAction(p, st, 'attack', 0, rg);
      C.advanceCombat(p, st, rg);
      const names = st.foes.map(f => f.name);
      if (new Set(names).size !== names.length) { dup++; break; }
    }
    joined += st.foes.length - n0; checked++;
  }
  ok('foes joined fights in the sample', joined > 20, joined + ' joined over ' + checked + ' fights');
  ok('and no two in a fight ever shared a name', dup === 0, dup + ' fights with a repeat');
})();
ok('splits, callers and the raised are all lettered',
   (src.match(/letterFoe\(st, (spawn|copy|raised)\);/g) || []).length === 3);

console.log('\n[C14] nothing starts on top of a fight or the town (v5.0)');
// A fight and the town each open a beat after the step that brings them. The
// play bot kept walking in that beat, a wandering fight began, and the town
// opened over it with its temple usable mid-fight.
ok('every delayed fight and town goes through soon()',
   !/setTimeout\(openTown/.test(src) && !/setTimeout\(function \(\) \{\s*(if \(!cst\) )?startCombat/.test(src) &&
   (src.match(/soon\(/g) || []).length >= 8);
ok('while one is due, the party cannot step, turn, use, search or rest',
   // v5.2: a move pressed mid-step is queued first; the queue only plays when nothing is due
   /function step\(dir, sliding\) \{\s*if \(animating && !sliding && party\.length\) \{ queuedMove = [^\n]*\n\s*if \(animating \|\| !party\.length \|\| sceneDue\) return;/.test(src) &&
   /function turn\(d\) \{\s*if \(animating && party\.length\) \{ queuedMove = [^\n]*\n\s*if \(animating \|\| !party\.length \|\| sceneDue\) return;/.test(src) &&
   /function playQueued\(\) \{ var q = queuedMove; queuedMove = null; if \(q && !cst && !sceneDue\) q\(\); \}/.test(src) &&
   /function interactHere\(\) \{\s*if \(!party\.length \|\| animating \|\| cst \|\| sceneDue\) return;/.test(src) &&
   /function doSearch\(\) \{\s*if \(!party\.length \|\| animating \|\| cst \|\| sceneDue\) return;/.test(src) &&
   /function campRest\(\) \{\s*if \(sceneDue\) return false;/.test(src));
ok('a second fight never replaces the first', /if \(cst\) return;\s*\/\/ never a second fight over the first/.test(src));
ok('the town never opens over a fight', /function openTown\(\) \{\s*if \(!party\.length \|\| cst\) return;/.test(src));

console.log('\n[C15] a lowered stat trims BP and MP to the new maxima (v5.3.1)');
// The play bot saw a mage keep 5 MP of a 4 MP maximum after a drain.
{
  const p = freshParty(77), m = p[2], f = p[0];
  m.mp = C.maxMP(m); m.stats.int = 3; m.stats.wis = 3; m.stats.cha = 3;
  f.bp = C.maxBP(f); f.stats.con = 3;
  C.fitPools(m); C.fitPools(f);
  ok('MP never above the maximum after a drop', m.mp <= C.maxMP(m), m.mp + ' / ' + C.maxMP(m));
  ok('BP never above the maximum after a drop', f.bp <= C.maxBP(f), f.bp + ' / ' + C.maxBP(f));
  ok('a draining foe and a stat event both trim the pools',
     /ch\.stats\[stat\] -= 1;\s*fitPools\(ch\);/.test(src) &&
     /ch\.stats\[e\.stat\] = Math\.max\(3[^\n]*\n\s*fitPools\(ch\);/.test(src));
}

console.log('\n[C16] the party can see them first (v5.4)');
{
  const rg = C.makeRng(5);
  const p = C.makeParty(rg,[{name:'Bruda',class:'fighter'},{name:'Kesh',class:'fighter'},
                            {name:'Sly',class:'rogue'},{name:'Ansel',class:'priest'}]);
  C.grantStartingSpells(p);
  const gob = C.makeEncounter('mn.goblin', rg), chief = C.makeEncounter('mn.goblinChief', rg);
  ok('a Rogue and a careful approach each raise the odds',
     C.surpriseChance(p, gob, {}) > C.SURPRISE.base && C.surpriseChance(p, gob, { careful: true }) > C.surpriseChance(p, gob, {}));
  ok('never against a boss', C.surpriseChance(p, chief, { careful: true }) === 0);
  const amb = C.makeEncounter('mn.goblin', rg); amb.forEach(f => f.traits = f.traits.concat(['ambush']));
  ok('never against an ambusher', C.surpriseChance(p, amb, {}) === 0);
  const st = C.beginCombat(p, gob, rg, null, { surprise: true });
  ok('round one is the party\'s alone', st.foesSurprised && st.order.every(e => e.side === 'party'));
  ok('the Rogue opens from the shadows', p[2].hidden > 0 && p[2].hiddenBonus >= 4);
  ok('the log says so', st.log.some(e => /see them before they see you/.test(e.text)));
  const st2 = C.beginCombat(p, C.makeEncounter('mn.goblin', rg), rg, null, { surprise: false });
  ok('a search keeps the party careful for three steps, and the fight is told',
     /carefulSteps = 3;/.test(src) && /\{ careful: carefulSteps > 0 \}/.test(src) && /if \(carefulSteps > 0\) carefulSteps--;/.test(src));
  ok('forced off, nothing changes', !st2.foesSurprised && st2.order.some(e => e.side === 'foe'));
}

console.log('\n[C17] a boss winds up a round early, and can be braced for or staggered (v5.4)');
{
  const setup = (seed) => {
    const rg = C.makeRng(seed);
    const p = freshParty(seed);
    const foes = C.makeEncounter('mn.goblinChief', rg);
    const st = C.beginCombat(p, foes, rg, null, { surprise: false });
    return { rg, p, st, boss: foes[0] };
  };
  let { rg, p, st, boss } = setup(11);
  ok('no wind-up in round one', C.bossTell(p, st, boss) === null && !boss.windup);
  st.round = 2;
  const ev = C.bossTell(p, st, boss);
  ok('round two: it winds up, and that is its turn', ev && ev[0].kind === 'crit' && boss.windup === 2);
  ok('while it holds it, it fights on', C.bossTell(p, st, boss) === null);
  ok('nothing lands in the round it winds up', C.bossUnleash(p, st, rg).length === 0);
  st.round = 3;
  const front = C.engagedParty(p, st);
  front[0].braced = 3;                                          // Defend this round
  p.forEach(c => { c.bp = 200; });
  const before = front.map(c => c.bp);
  const out = C.bossUnleash(p, st, rg);
  ok('it lands when the next round ends', out.length > 1 && !boss.windup && boss.nextTell === 3 + C.TELL.every);
  ok('the braced one takes far less', (before[0] - front[0].bp) < (before[1] - front[1].bp), (before[0] - front[0].bp) + ' vs ' + (before[1] - front[1].bp));
  ok('a melee boss strikes only the front rank', p.filter(c => front.indexOf(c) < 0).every(c => c.bp === 200));

  ({ rg, p, st, boss } = setup(12));
  st.round = 2; C.bossTell(p, st, boss);
  boss.bp -= Math.ceil(boss.bpMax * C.TELL.stagger);           // hurt hard while it gathers
  st.round = 3; p.forEach(c => { c.bp = 200; });
  const out2 = C.bossUnleash(p, st, rg);
  ok('hurt hard enough, it staggers and nothing lands', /staggers/.test(out2[0].text) && p.every(c => c.bp === 200));

  ({ rg, p, st, boss } = setup(13));
  st.round = 2; C.bossTell(p, st, boss); boss.blinded = 2;
  st.round = 3; p.forEach(c => { c.bp = 200; });
  ok('grit in its eyes staggers it too', /staggers/.test(C.bossUnleash(p, st, rg)[0].text));
  ok('Defend braces, in the rules', /action === 'defend'\) \{\s*ch\.defBonus = 2;\s*ch\.braced = st\.round;/.test(src));
  ok('the wind-up shows on the fight screen', /f\.windup \? ' \\u00b7 <b class="tell">winding up<\/b>'/.test(src) && /tellMark\(g, x, ground, hgt\)/.test(src));
}

console.log('\n[C18] polearms reach past the two in front (v6.1.6)');
{
  const P = () => { const p = C.makeParty(C.makeRng(3), [{name:'A',class:'fighter'},{name:'B',class:'fighter'},{name:'C',class:'fighter'},{name:'D',class:'priest'}]);
    p.forEach((c, k) => { c.rank = k < 3 ? 'front' : 'back'; c.position = k; c.equipped.weapon = C.makeItem('it.club'); }); return p; };
  const narrow = { narrow: true }, door = { narrow: true, abreast: 1 };
  const foes = () => C.makeEncounter('mn.goblin', C.makeRng(9));
  let p = P(), st = C.beginCombat(p, foes(), C.makeRng(1), narrow);
  ok('in a passage the third in front has no room with a club', !C.meleeReach(p, st, p[2]).ok);
  p[2].equipped.weapon = C.makeItem('it.spear');
  let r = C.meleeReach(p, st, p[2]);
  ok('with a spear the third reaches past, from behind', r.ok && r.behind);
  ok('the two in front reach as ever', C.meleeReach(p, st, p[0]).ok && !C.meleeReach(p, st, p[0]).behind);
  ok('a club in the back rank does not reach', !C.meleeReach(p, st, p[3]).ok);
  p[3].equipped.weapon = C.makeItem('it.lucerne');
  ok('a lucerne hammer in the back rank does', C.meleeReach(p, st, p[3]).ok);
  ok('in a doorway the spear still reaches past the one', (() => { const q = P(); q[1].equipped.weapon = C.makeItem('it.spear');
    const s2 = C.beginCombat(q, foes(), C.makeRng(1), door); return !C.meleeReach(q, s2, q[2]).ok && C.meleeReach(q, s2, q[1]).ok; })());
  ok('reaching from behind costs to hit', C.POLEARM_FROM_BEHIND < 0);
  // a whole swing from the third place lands in the log, not refused
  let swung = 0, refused = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const q = P(); q[2].equipped.weapon = C.makeItem('it.spear');
    const s3 = C.beginCombat(q, foes(), C.makeRng(seed), narrow);
    for (let g = 0; g < 30 && !s3.outcome; g++) {
      const i = C.activeActor(s3);
      if (i === null) { C.advanceCombat(q, s3, C.makeRng(seed + g)); continue; }
      const ev = C.partyAction(q, s3, i === 2 ? 'attack' : 'defend', 0, C.makeRng(seed * 7 + g));
      if (i === 2) { if (ev.some(e => /reaches past/.test(e.text || ''))) swung++; if (ev.some(e => /No room/.test(e.text || ''))) refused++; break; }
    }
  }
  ok('the spear swings from the third place, never refused', swung > 0 && refused === 0, swung + ' swung, ' + refused + ' refused');
  const pr = P()[3], fg = P()[0];
  const rogue = C.makeParty(C.makeRng(4), [{name:'R',class:'rogue'}])[0];
  ok('a priest may carry the blunt lucerne hammer, not the spear', C.canUse(pr, C.makeItem('it.lucerne')) && !C.canUse(pr, C.makeItem('it.spear')));
  ok('a fighter may carry all three', ['it.spear','it.lucerne','it.halberd'].every(k => C.canUse(fg, C.makeItem(k))));
  ok('a rogue carries none of them', ['it.spear','it.lucerne','it.halberd'].every(k => !C.canUse(rogue, C.makeItem(k))));
  ok('all three are polearms', ['it.spear','it.lucerne','it.halberd'].every(k => C.hasPolearm({ equipped: { weapon: C.makeItem(k) } })));
}

console.log('\n' + (fail?'FAILED':'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail?1:0);

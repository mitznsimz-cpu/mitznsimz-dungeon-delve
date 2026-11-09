// Event core: doors, keys, levers, search, region text, and rank rules.
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');
function grab(t){const re=new RegExp('/\\* ==== '+t+' START ==== \\*/([\\s\\S]*?)/\\* ==== '+t+' END ==== \\*/');
 const m=src.match(re); if(!m){console.error('FAIL: '+t+' missing');process.exit(1);} return m[1];}
const BOOT=grab('BUNDLED PACK')+grab('PACK CORE')+
 '\nvar __L=loadPack(BUNDLED_PACK);\nif(!__L.ok){throw new Error(__L.errors.join("; "));}\n';
const names=['eventDef','choiceAvailable','applyEffects','tickEffects','effectBonus','keyFor',
 'tryOpenDoor','pullLever','leverThrown','searchHere','secretFound','regionAt','lookText','COMPASS',
 'setQuestFlagsRef','setPartyHasItem','floorState','packFloor','PACK','ITEMS','MONSTERS','SPELLS',
 'makeRng','makeParty','makeItem','startingKit','grantStartingSpells','maxBP','applyDamage',
 'isFront','normalisePositions','frontRank','backRank','swapRank','canSwapRank','weaponReach',
 'makeEncounter','beginCombat','foeTurns','meleeTargets','anyTargets','foeFront','foeBack','partyAction',
 'advanceCombat','activeActor','hasTrait','tickStatuses','livingFoes'];
const E=new Function(BOOT+grab('PARTY CORE')+'\n'+grab('SAVE CORE')+'\n'+grab('WORLD CORE')+'\n'+
 grab('EVENT CORE')+'\n'+grab('COMBAT CORE')+'\n'+grab('TOWN CORE')+'\n'+grab('INVENTORY CORE')+
 '\nreturn {'+names.join(',')+'};')();

let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};
function fresh(seed){const rg=E.makeRng(seed||1);
 const p=E.makeParty(rg,[{name:'Pete',class:'fighter'},{name:'Mitz',class:'priest'},
   {name:'Sharron',class:'fighter'},{name:'Simz',class:'mage'}]);
 E.grantStartingSpells(p);E.startingKit(p);E.normalisePositions(p);
 p.forEach(c=>c.effects=[]); return p;}

console.log('\n[E1] events are well formed');
const ids=Object.keys(E.PACK.events);
ok('pack ships events', ids.length>=6, String(ids.length));
ok('every event resolves', ids.every(i=>!!E.eventDef(i)));
ok('every event has a free choice', ids.every(i=>E.eventDef(i).choices.some(c=>!c.require)));
ok('unknown event id returns null', E.eventDef('nope')===null);

console.log('\n[E2] requirements gate choices honestly');
const p2=fresh(2);
E.setQuestFlagsRef({}); E.setPartyHasItem(()=>false);
p2.forEach(c=>{c.stats.int=8;});
const throne=E.eventDef('ev.throne');
const runeChoice=throne.choices.find(c=>c.require&&c.require.stat==='int');
ok('low INT blocks the rune choice', !E.choiceAvailable(p2,999,runeChoice).ok);
p2[3].stats.int=16;
ok('high INT unlocks it', E.choiceAvailable(p2,999,runeChoice).ok);
ok('a downed character does not count', (()=>{E.applyDamage(p2[3],9999);
  const r=E.choiceAvailable(p2,999,runeChoice); p2[3].bp=1; return !r.ok;})());
const goldChoice=E.eventDef('ev.shrine1').choices.find(c=>c.require&&c.require.gold);
ok('gold requirement respected', !E.choiceAvailable(p2,0,goldChoice).ok &&
   E.choiceAvailable(p2,999,goldChoice).ok);

console.log('\n[E3] effects apply and stay in bounds');
let oob=0;
for(let s=0;s<400;s++){
 const p=fresh(s);const rg=E.makeRng(s+9);
 ids.forEach(id=>{E.eventDef(id).choices.forEach(ch=>{
   const r=E.applyEffects(p,ch.effects,rg);
   p.forEach(c=>{if(c.bp<0||c.bp>E.maxBP(c)||Number.isNaN(c.bp))oob++;});
   if(Number.isNaN(r.gold)||Number.isNaN(r.threat))oob++;
 });});
}
ok('every effect on every choice keeps BP sane', oob===0, 'oob='+oob);
const p3=fresh(3);
const gotGold=E.applyEffects(p3,[{kind:'gold',amount:50}],E.makeRng(1));
ok('gold effect reports, does not mutate', gotGold.gold===50);
const gotItem=E.applyEffects(p3,[{kind:'item',ref:'it.potion'}],E.makeRng(1));
ok('item effect reports the ref for the caller', gotItem.items[0]==='it.potion');
const gotFlag=E.applyEffects(p3,[{kind:'flag',set:'readThrone'}],E.makeRng(1));
ok('flag effect reports the flag', gotFlag.flags[0]==='readThrone');

console.log('\n[E4] timed buffs expire');
const p4=fresh(4);
E.applyEffects(p4,[{kind:'buff',stat:'defense',amount:2,duration:3}],E.makeRng(1));
ok('buff is felt', E.effectBonus(p4[0],'defense')===2);
E.tickEffects(p4,2); ok('still active after 2', E.effectBonus(p4[0],'defense')===2);
E.tickEffects(p4,1); ok('gone after its duration', E.effectBonus(p4[0],'defense')===0);
ok('unrelated stats unaffected', E.effectBonus(p4[0],'toHit')===0);

console.log('\n[E5] locked doors need their key');
const world={};
const f1=E.packFloor('f1');
const doorKey=Object.keys(f1.features).find(k=>f1.features[k].type==='door'&&f1.features[k].locked);
const door=f1.features[doorKey];
const p5=fresh(5);
ok('a locked door exists on f1', !!door, doorKey);
const noKey=E.tryOpenDoor(p5,world,'f1',doorKey,door);
ok('refused without the key', !noKey.ok && /no key/.test(noKey.notes.join(' ')));
p5[0].pack.push(E.makeItem(door.keyId));
const withKey=E.tryOpenDoor(p5,world,'f1',doorKey,door);
ok('opens with the key', withKey.ok, withKey.notes.join(' '));
ok('stays open afterwards', E.tryOpenDoor(p5,world,'f1',doorKey,door).ok);
ok('keyFor finds the key in any pack', (()=>{const p=fresh(6);
  p[2].pack.push(E.makeItem('it.key.bronze'));
  return E.keyFor(p,'it.key.bronze').ci===2;})());
ok('keyFor returns null when absent', E.keyFor(fresh(7),'it.key.warden')===null);

console.log('\n[E6] levers open what they promise');
const w2={};
const f3=E.packFloor('f3');
const leverKey=Object.keys(f3.features).find(k=>f3.features[k].type==='lever');
const lever=f3.features[leverKey];
const gated=Object.keys(f3.features).find(k=>f3.features[k].needsLever===lever.id);
ok('a lever and its gate both exist', !!lever && !!gated, lever.id+' -> '+gated);
ok('the gate refuses before the lever', !E.tryOpenDoor(fresh(8),w2,'f3',gated,f3.features[gated]).ok);
const pl=E.pullLever(w2,'f3',lever);
ok('lever throws once', pl.ok && E.leverThrown(w2,'f3',lever.id));
ok('lever refuses a second pull', !E.pullLever(w2,'f3',lever).ok);
ok('the gate opens once the lever is thrown',
   E.tryOpenDoor(fresh(9),w2,'f3',gated,f3.features[gated]).ok);

console.log('\n[E7] searching finds secrets, eventually');
const f2=E.packFloor('f2');
const secretKey=Object.keys(f2.features).find(k=>f2.features[k].type==='secretDoor'&&!f2.features[k].needsLever);
const [sx,sy]=secretKey.split(',').map(Number);
let everFound=0, neverFalse=0;
for(let s=0;s<300;s++){
 const w={};const p=fresh(s);
 let found=false;
 for(let t=0;t<8&&!found;t++){
  const r=E.searchHere(p,f2,w,sx,sy-1,E.makeRng(s*13+t));
  if(r.found.length)found=true;
 }
 if(found)everFound++;
 // searching far from any secret must never report one
 const r2=E.searchHere(p,f2,{},1,1,E.makeRng(s));
 if(r2.found.length)neverFalse++;
}
ok('persistent searching finds the secret', everFound>280, everFound+'/300');
ok('searching empty stone never invents one', neverFalse===0, 'false positives='+neverFalse);
ok('a near-miss still hints', (()=>{const r=E.searchHere(fresh(1),f2,{},sx,sy-1,()=>0.99);
  return /uneven/.test(r.notes.join(' '));})());
ok('found secrets are remembered', (()=>{const w={};
  E.searchHere(fresh(1),f2,w,sx,sy-1,()=>0.01); return E.secretFound(w,'f2',secretKey);})());

console.log('\n[E8] the party is told where they are and what they see');
ok('four compass points', E.COMPASS.length===4 && E.COMPASS[0]==='North');
let described=0, total=0;
E.PACK.floors.forEach(f=>{
 Object.keys(f.regionMap||{}).forEach(k=>{
  const [x,y]=k.split(',').map(Number); total++;
  const l=E.lookText(f,x,y,0);
  if(l.place && l.look && l.look.length>10) described++;
 });
});
ok('every mapped cell has a place and a description', described===total, described+'/'+total);
ok('unmapped cells fall back to the floor name',
   (()=>{const l=E.lookText(E.packFloor('f1'),0,0,1); return l.place===E.packFloor('f1').name;})());
ok('facing is reported', E.lookText(E.packFloor('f1'),1,10,2).heading==='South');
ok('every floor defines regions', E.PACK.floors.every(f=>Object.keys(f.regions||{}).length>=3));

console.log('\n[E9] combat ranks');
const p9=fresh(9);
ok('two in front, two behind', E.frontRank(p9).length===2 && E.backRank(p9).length===2);
const rg9=E.makeRng(9);
const foes=E.makeEncounter('mn.goblinArcher',rg9);
const mixed=E.makeEncounter('mn.goblin',rg9).concat(foes);
const st9=E.beginCombat(p9,mixed,rg9);
ok('back-rank foes are not melee targets while the front holds',
   E.meleeTargets(st9).every(f=>f.rank!=='back'), 'front='+E.foeFront(st9).length);
ok('ranged attacks can reach anything', E.anyTargets(st9).length===mixed.length);
E.foeFront(st9).forEach(f=>{f.bp=0;});
ok('killing the front exposes the back',
   E.meleeTargets(st9).length>0 && E.meleeTargets(st9).every(f=>f.rank==='back'));

console.log('\n[E10] rank movement is legal or refused, never silent');
const p10=fresh(10);
const st10=E.beginCombat(p10,E.makeEncounter('mn.goblin',E.makeRng(10)),E.makeRng(11));
ok('a back-rank member may step forward', E.canSwapRank(p10,st10,2).ok||E.canSwapRank(p10,st10,3).ok);
// Superseded: ranks have no minimum. Leaving the front open is a legal, and
// costly, choice — the enemy simply reaches your casters.
p10.filter(c=>E.isFront(c)).slice(1).forEach(c=>{c.bp=0;});
const lone=p10.findIndex(c=>E.isFront(c)&&c.bp>0);
ok('the last defender may still fall back if they accept the risk',
   E.canSwapRank(p10,st10,lone).ok);
ok('a fallen character cannot move at all', (()=>{
  const p=fresh(21); p[0].bp=0;
  return !E.canSwapRank(p,st10,0).ok;})());
ok('moving changes only the mover\'s rank', (()=>{const p=fresh(12);
  const was=E.isFront(p[3]);
  const othersBefore=p.filter((c,i)=>i!==3).map(c=>E.isFront(c)).join(',');
  E.swapRank(p,3);
  const othersAfter=p.filter((c,i)=>i!==3).map(c=>E.isFront(c)).join(',');
  return E.isFront(p[3])!==was && othersBefore===othersAfter;})());
ok('the mover is returned so it can be announced', (()=>{const p=fresh(13);
  const t=E.swapRank(p,3); return t === p[3];})());
// Corrected against the source material: the originals let a rear character
// spend a round moving forward. Nobody is displaced, and a rank has no cap.
ok('moving forward displaces nobody', (()=>{
  const p=fresh(14);
  const before = p.filter(E.isFront).map(c=>c.name).join(',');
  const backIdx = p.findIndex(c=>!E.isFront(c));
  E.swapRank(p,backIdx);
  const after = p.filter(E.isFront).map(c=>c.name).join(',');
  return after.indexOf(before)===0 && after.length>before.length;})(),
  'someone else was pushed out of the front rank');
ok('all four may stand in the front rank', (()=>{
  const p=fresh(17);
  p.forEach((c,i)=>{ if(!E.isFront(c)) E.swapRank(p,i); });
  return p.filter(E.isFront).length===4;})());
ok('all four may fall back, leaving the front open', (()=>{
  const p=fresh(18);
  p.forEach((c,i)=>{ if(E.isFront(c)) E.swapRank(p,i); });
  return p.filter(E.isFront).length===0;})());
ok('an empty front rank exposes the back to melee', (()=>{
  const p=fresh(19); const rg=E.makeRng(19);
  const st=E.beginCombat(p,E.makeEncounter('mn.goblin',rg),rg);
  p.forEach((c,i)=>{ if(E.isFront(c)) E.swapRank(p,i); });
  E.foeTurns(p,st,E.makeRng(20));
  return p.some(c=>c.bp<E.maxBP(c));})(), 'hiding at the back should not be free');
ok('everyone is always in exactly one rank', (()=>{const p=fresh(15);
  E.swapRank(p,2); E.swapRank(p,3); E.swapRank(p,0);
  return p.filter(E.isFront).length + p.filter(c=>!E.isFront(c)).length === 4;})());
ok('positions stay a permutation of 1..4', (()=>{const p=fresh(16);
  E.swapRank(p,3); E.swapRank(p,0);
  return p.map(c=>c.position).sort().join(',')==='1,2,3,4';})());

console.log('\n[E10b] healing lands on the person you chose');
// The bug: the enemy index was being passed as the ally index, so a heal hit
// whoever happened to sit at that slot in the party.
const ph=fresh(30);
const rgh=E.makeRng(31);
const sth=E.beginCombat(ph,E.makeEncounter('mn.goblin',rgh),rgh);
ph.forEach(c=>E.applyDamage(c, Math.floor(E.maxBP(c)*0.6)));
const priestIdx=ph.findIndex(c=>c.class==='priest');
// force the priest to the front of the order so it can act
sth.order=[{side:'party',idx:priestIdx,roll:99}];
const before=ph.map(c=>c.bp);
E.partyAction(ph,sth,'cast:sp.mend1',2,E.makeRng(32));   // heal party member 2
const after=ph.map(c=>c.bp);
const healed=after.map((v,i)=>v>before[i]?i:-1).filter(i=>i>=0);
ok('the named ally is the one healed', healed.length===1 && healed[0]===2,
   'healed indices: '+healed.join(','));
ok('nobody else is touched', after.filter((v,i)=>i!==2&&v!==before[i]).length===0);

ok('a downed ally is not silently chosen instead', (()=>{
  const p=fresh(33); const rg=E.makeRng(34);
  const st=E.beginCombat(p,E.makeEncounter('mn.goblin',rg),rg);
  const pi=p.findIndex(c=>c.class==='priest');
  E.applyDamage(p[1],9999);                       // member 1 is down
  E.applyDamage(p[0], Math.floor(E.maxBP(p[0])*0.5));
  st.order=[{side:'party',idx:pi,roll:99}];
  const b=p[1].bp;
  E.partyAction(p,st,'cast:sp.mend1',1,E.makeRng(35));
  return p[1].bp===b;})(), 'a heal aimed at the fallen should fall through, not revive');

console.log('\n[E11] a back-rank melee attack cannot hang the fight');
let stalled=0;
for(let s=0;s<500;s++){
 const p=fresh(s);const rg=E.makeRng(s+77);
 const st=E.beginCombat(p,E.makeEncounter('mn.goblin',rg),rg);
 let g=0;
 while(!st.outcome&&g++<600){
  const i=E.activeActor(st);
  if(i===null){E.advanceCombat(p,st,rg);continue;}
  E.partyAction(p,st,'attack',0,rg);       // deliberately naive: always melee
  E.advanceCombat(p,st,rg);
 }
 if(!st.outcome)stalled++;
}
ok('500 fights with a naive melee-only caller still terminate', stalled===0, 'stalls='+stalled);

console.log('\n[E12] traits are wired, not merely declared');
const declared=new Set();
Object.values(E.MONSTERS).forEach(m=>(m.traits||[]).forEach(t=>declared.add(t)));
// Read the implemented traits out of the source rather than keeping a second
// list here — a hardcoded copy goes stale the moment the engine grows.
const wired=new Set([...src.matchAll(/hasTrait\([A-Za-z_$]+, '([a-zA-Z]+)'\)/g)].map(m=>m[1]));
['boss','undead','swarm','caster','construct'].forEach(t=>wired.add(t)); // descriptive tags
const inert=[...declared].filter(t=>!wired.has(t));
ok('no trait is declared but unimplemented', inert.length===0, 'inert: '+inert.join(', '));
ok('poison can be inflicted and ticks', (()=>{const p=fresh(20);
  p[0].status.push('poisoned'); const before=p[0].bp;
  E.tickStatuses(p,E.makeRng(1)); return p[0].bp<before;})());
ok('back-rank monsters all have a ranged attack',
   Object.values(E.MONSTERS).filter(m=>m.rank==='back')
     .every(m=>m.attacks.some(a=>a.reach==='ranged')));

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);

// Tier-1 vocabulary: new effects, statuses, traits, features, and pack loading.
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');
function grab(t){const re=new RegExp('/\\* ==== '+t+' START ==== \\*/([\\s\\S]*?)/\\* ==== '+t+' END ==== \\*/');
 const m=src.match(re); if(!m){console.error('FAIL: '+t+' missing');process.exit(1);} return m[1];}
const BOOT=grab('BUNDLED PACK')+grab('PACK CORE')+
 '\nvar __L=loadPack(BUNDLED_PACK);\nif(!__L.ok){throw new Error(__L.errors.join("; "));}\n';
const names=['PACK','MONSTERS','ITEMS','SPELLS','STATS','STAT_NAME','validatePack','loadPack','packFloor',
 'applyEffects','hasStatus','statusToHit','statusDefense','clearStatus','tickStatuses','isParalysed',
 'hasTrait','meleeTargets','foeDamageMod','traitDamageMod','foeTurns','beginCombat','makeEncounter',
 'makeRng','makeParty','grantStartingSpells','startingKit','normalisePositions','maxBP','applyDamage',
 'isFront','awardXp','floorState','tryOpenDoor','eventDef'];
const V=new Function(BOOT+grab('MAP CORE')+'\n'+grab('PARTY CORE')+'\n'+grab('SAVE CORE')+'\n'+
 grab('WORLD CORE')+'\n'+grab('EVENT CORE')+'\n'+grab('COMBAT CORE')+'\n'+grab('TOWN CORE')+'\n'+
 grab('INVENTORY CORE')+'\nreturn {'+names.join(',')+'};')();

let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};
function fresh(s){const rg=V.makeRng(s||1);
 const p=V.makeParty(rg,[{name:'Pete',class:'fighter'},{name:'Sharron',class:'fighter'},
  {name:'Mitz',class:'priest'},{name:'Simz',class:'mage'}]);
 V.grantStartingSpells(p);V.startingKit(p);V.normalisePositions(p);p.forEach(c=>c.effects=[]);return p;}

console.log('\n[V1] new effect kinds do something');
const rg=V.makeRng(7);
let p=fresh(1);
const totalBefore=p.reduce((a,c)=>a+c.bp,0);
V.applyEffects(p,[{kind:'damageAll',dice:[1,4,1]}],rg);
ok('damageAll hits the whole party', p.every((c,i)=>c.bp<V.maxBP(c)),
   p.map(c=>c.bp+'/'+V.maxBP(c)).join(' '));

p=fresh(2);
V.applyEffects(p,[{kind:'status',status:'poisoned',target:'party'}],rg);
ok('status can be inflicted on the party', p.every(c=>V.hasStatus(c,'poisoned')));
p=fresh(3);
V.applyEffects(p,[{kind:'status',status:'blessed'}],rg);
ok('status can hit one person', p.filter(c=>V.hasStatus(c,'blessed')).length===1);

const rx=V.applyEffects(fresh(4),[{kind:'xp',amount:250}],rg);
ok('xp is reported to the caller', rx.xp===250);
const ru=V.applyEffects(fresh(5),[{kind:'unlock',key:'6,6'}],rg);
ok('unlock names the door', ru.unlock[0]==='6,6');
const rt=V.applyEffects(fresh(6),[{kind:'teleport',floor:'f2',at:[1,1]}],rg);
ok('teleport is reported', rt.teleport && rt.teleport.floor==='f2');
ok('an unknown kind is simply ignored, not fatal', (()=>{
  try { V.applyEffects(fresh(7),[{kind:'nonsense'}],rg); return true; } catch(e){ return false; }})());

console.log('\n[V2] statuses bend the numbers');
p=fresh(8);
const base=V.statusToHit(p[0]);
p[0].status.push('blessed');
ok('blessed helps to hit', V.statusToHit(p[0])>base, String(V.statusToHit(p[0])));
ok('blessed helps defence', V.statusDefense(p[0])>0);
p[1].status.push('cursed');
ok('cursed hinders to hit', V.statusToHit(p[1])<0, String(V.statusToHit(p[1])));
ok('cursed hinders defence', V.statusDefense(p[1])<0);
ok('paralysed is recognised', (()=>{p[2].status.push('paralysed'); return V.isParalysed(p[2]);})());
ok('clearStatus removes and reports', V.clearStatus(p[2],'paralysed') && !V.isParalysed(p[2]));
ok('clearing something absent is safe', V.clearStatus(p[2],'paralysed')===false);

console.log('\n[V3] statuses wear off');
let held=0,freed=0;
for(let s=0;s<400;s++){
 const q=fresh(s); q[0].status.push('paralysed');
 for(let t=0;t<10 && V.isParalysed(q[0]);t++) V.tickStatuses(q,V.makeRng(s*7+t));
 if(V.isParalysed(q[0])) held++; else freed++;
}
ok('paralysis always ends within its cap', held===0, held+' still held after 10 rounds');
ok('every case resolved', freed===400, freed+'/400');
ok('the cap is declared, not left to chance', /var PARALYSIS_MAX = \d+;/.test(src),
   'a bad run of rolls could hold someone out indefinitely');

console.log('\n[V4] new traits change the fight');
ok('guard shields everything behind it', (()=>{
 const q=fresh(9); const rg2=V.makeRng(9);
 const foes=V.makeEncounter('mn.boneKnight',rg2).concat(V.makeEncounter('mn.goblin',rg2));
 const st=V.beginCombat(q,foes,rg2);
 const t=V.meleeTargets(st);
 return t.length>0 && t.every(f=>V.hasTrait(f,'guard'));})(),
 'non-guards should be unreachable while a guard stands');

ok('berserk hits harder as it weakens', (()=>{
 const f={bp:10,bpMax:10,traits:['berserk']};
 const full=V.foeDamageMod(f,10);
 f.bp=2; const hurt=V.foeDamageMod(f,10);
 return hurt>full;})());
ok('a calm monster is unaffected', V.foeDamageMod({bp:5,bpMax:10,traits:[]},10)===10);

ok('every new trait is referenced by the engine', (()=>{
 const wired=['guard','berserk','drain','paralyse','stealer'];
 const missing=wired.filter(t=>!new RegExp("hasTrait\\([A-Za-z_$]+, '"+t+"'\\)").test(src));
 return missing.length===0 || (console.log('      missing:',missing.join(',')), false);})());

ok('drain actually lowers a stat', (()=>{
 for(let s=0;s<300;s++){
  const q=fresh(s); const rg3=V.makeRng(s+11);
  const st=V.beginCombat(q,V.makeEncounter('mn.shade',rg3),rg3);
  const before=q.map(c=>V.STATS.reduce((a,k)=>a+c.stats[k],0));
  for(let r=0;r<6;r++) V.foeTurns(q,st,rg3);
  const after=q.map(c=>V.STATS.reduce((a,k)=>a+c.stats[k],0));
  if(after.some((v,i)=>v<before[i])) return true;
 }
 return false;})(), 'the Shade never drained anyone in 300 fights');

ok('no stat is ever drained below 3', (()=>{
 for(let s=0;s<200;s++){
  const q=fresh(s); const rg4=V.makeRng(s+21);
  const st=V.beginCombat(q,V.makeEncounter('mn.shade',rg4),rg4);
  for(let r=0;r<12;r++) V.foeTurns(q,st,rg4);
  if(q.some(c=>V.STATS.some(k=>c.stats[k]<3))) return false;
 }
 return true;})());

console.log('\n[V5] new feature types are placed and understood');
const types={};
V.PACK.floors.forEach(f=>Object.values(f.features).forEach(x=>types[x.type]=(types[x.type]||0)+1));
['pit','spinner','teleporter','npc'].forEach(t=>{
  ok('the pack uses ' + t, types[t]>0, JSON.stringify(types));
});
ok('a pit names where you land', (()=>{
  const pit=V.PACK.floors.flatMap(f=>Object.values(f.features)).find(x=>x.type==='pit');
  return pit.to && pit.at;})());
ok('an npc opens a real event', (()=>{
  const npc=V.PACK.floors.flatMap(f=>Object.values(f.features)).find(x=>x.type==='npc');
  return !!V.eventDef(npc.id);})());
ok('a teleporter names its destination', (()=>{
  const tp=V.PACK.floors.flatMap(f=>Object.values(f.features)).find(x=>x.type==='teleporter');
  return tp.at && tp.at.length===2;})());

console.log('\n[V6] the validator knows the wider vocabulary');
const clone=o=>JSON.parse(JSON.stringify(o));
ok('the shipped pack still validates', V.validatePack(V.PACK).ok);
ok('a bad effect kind is still refused', (()=>{
  const bad=clone(V.PACK);
  bad.events[Object.keys(bad.events)[0]].choices[0].effects=[{kind:'explode'}];
  return !V.validatePack(bad).ok;})());
ok('every new effect kind is accepted', (()=>{
  const good=clone(V.PACK);
  good.events[Object.keys(good.events)[0]].choices[0].effects=[
    {kind:'damageAll',dice:[1,4,0]},{kind:'status',status:'cursed'},
    {kind:'xp',amount:10},{kind:'unlock',key:'1,1'},{kind:'teleport',floor:'f1',at:[1,1]}];
  const r=V.validatePack(good);
  return r.ok;})(), 'the validator rejects vocabulary the engine implements');
ok('no trait is declared without an implementation', (()=>{
  const declared=new Set();
  Object.values(V.MONSTERS).forEach(m=>(m.traits||[]).forEach(t=>declared.add(t)));
  // Read the implemented traits out of the source; a second hardcoded list
  // here goes stale the moment the engine grows.
  const wired=new Set([...src.matchAll(/hasTrait\([A-Za-z_$]+, '([a-zA-Z]+)'\)/g)].map(m=>m[1]));
  ['boss','undead','swarm','caster','construct'].forEach(t=>wired.add(t));
  const missing=[...declared].filter(t=>!wired.has(t));
  return missing.length===0 || (console.log('      unimplemented:',missing.join(',')), false);})());

console.log('\n[V7] adventures can be loaded from a file');
ok('there is a loader in the UI', /id="loadPack"/.test(src) && /function applyPack/.test(src));
ok('and an exporter', /id="savePack"/.test(src) && /downloadJson\(PACK/.test(src));
ok('a bad pack is refused with reasons, not a crash',
   /This adventure cannot be loaded/.test(src) && /check\.errors\.slice\(0, 6\)/.test(src));
ok('loading resets the run rather than mixing worlds',
   /party = \[\];[\s\S]{0,120}world = \{\};/.test(src));
ok('the menu names the adventure in play', /Currently playing: /.test(src));
ok('a fresh pack still loads through the same path', (()=>{
  const r=V.loadPack(clone(V.PACK)); return r.ok;})());

console.log('\n[V8] the chest bark fires once');
ok('stepping on a chest no longer barks', !/chest: 'chest', monster: 'monster'/.test(src),
   'the chest bark fired on arrival and again on opening');
ok('opening it still does', /pickBark\(party, 'chest', actionRng\)/.test(src));

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);

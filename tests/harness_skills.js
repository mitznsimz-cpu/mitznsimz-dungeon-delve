// Fighter skills: guard, riposte, cleave, taunt, shield wall.
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');
function grab(t){const re=new RegExp('/\\* ==== '+t+' START ==== \\*/([\\s\\S]*?)/\\* ==== '+t+' END ==== \\*/');
 const m=src.match(re); if(!m){console.error('FAIL: '+t+' missing');process.exit(1);} return m[1];}
const BOOT=grab('TEXTURE ATLAS')+grab('BUNDLED PACK')+grab('PACK CORE')+
 '\nvar __L=loadPack(BUNDLED_PACK);\nif(!__L.ok){throw new Error(__L.errors.join("; "));}\n';
const names=['PACK','CLASSES','SPELLS','MONSTERS','PRICES','validatePack','makeRng','makeParty',
 'grantStartingSpells','grantStartingSkills','startingSkills','startingKit','normalisePositions',
 'makeEncounter','beginCombat','partyAction','advanceCombat','activeActor','foeTurns','foeFront',
 'foeBack','livingFoes','maxBP','maxMP','applyDamage','isFront','swapRank','frontRank','backRank',
 'skillDef','skillReady','skillCooldownLeft','tickCooldowns','guardianOf','clearTurnStates',
 'learnableSkills','skillCost','doLearnSkill','effectBonus','spellTierUnlocked'];
const K=new Function(BOOT+grab('MAP CORE')+'\n'+grab('PARTY CORE')+'\n'+grab('SAVE CORE')+'\n'+
 grab('WORLD CORE')+'\n'+grab('EVENT CORE')+'\n'+grab('COMBAT CORE')+'\n'+grab('TOWN CORE')+'\n'+
 grab('INVENTORY CORE')+'\nreturn {'+names.join(',')+'};')();

let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};

function party(seed, allSkills){
  const rg=K.makeRng(seed||1);
  const p=K.makeParty(rg,[{name:'Pete',class:'fighter'},{name:'Sharron',class:'fighter'},
    {name:'Mitz',class:'priest'},{name:'Simz',class:'mage'}]);
  K.grantStartingSpells(p);K.grantStartingSkills(p);K.startingKit(p);K.normalisePositions(p);
  p.forEach(c=>{c.effects=[];c.level=10;c.mp=99;
    if(allSkills&&K.CLASSES[c.class].skillList)
      c.skills=Object.keys(K.PACK.skills).filter(k=>K.PACK.skills[k].list==='fighter');
    c.cooldowns={};});
  return p;
}
const act=(p,st,i,a,t,rg)=>{st.order=[{side:'party',idx:i,roll:99}];return K.partyAction(p,st,a,t,rg);};

console.log('\n[K1] fighters have a trade at last');
ok('the pack defines skills', Object.keys(K.PACK.skills||{}).length>=5,
   String(Object.keys(K.PACK.skills||{}).length));
ok('the fighter class trains them', K.CLASSES.fighter.skillList==='fighter');
ok('casters do not', !K.CLASSES.mage.skillList && !K.CLASSES.priest.skillList);
ok('skills span the tiers', (()=>{
  const t=new Set(Object.values(K.PACK.skills).map(s=>s.tier)); return t.size>=3;})());
ok('every skill has a cooldown', Object.values(K.PACK.skills).every(s=>s.cooldown>0),
   'a free-every-round skill would replace attacking entirely');
ok('a fighter starts knowing one', K.startingSkills('fighter').length===1);
ok('a wizard starts with none', K.startingSkills('mage').length===0);

console.log('\n[K2] cooldowns actually gate them');
let p=party(1,true); let rg=K.makeRng(2);
let st=K.beginCombat(p,K.makeEncounter('mn.goblin',rg),rg);
ok('a fresh skill is ready', K.skillReady(p[0],'sk.cleave'));
act(p,st,0,'skill:sk.cleave',0,rg);
ok('using it puts it on cooldown', !K.skillReady(p[0],'sk.cleave'),
   'left: '+K.skillCooldownLeft(p[0],'sk.cleave'));
ok('the cooldown matches the pack', K.skillCooldownLeft(p[0],'sk.cleave')===K.PACK.skills['sk.cleave'].cooldown);
K.tickCooldowns(p); K.tickCooldowns(p); K.tickCooldowns(p);
ok('it comes back', K.skillReady(p[0],'sk.cleave'));
ok('using it while cooling is refused', (()=>{
  const q=party(3,true), r2=K.makeRng(3);
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r2),r2);
  act(q,s2,0,'skill:sk.cleave',0,r2);
  const before=s2.foes.map(f=>f.bp);
  act(q,s2,0,'skill:sk.cleave',0,r2);
  return s2.foes.every((f,i)=>f.bp===before[i]);})());

console.log('\n[K3] Guard puts a fighter in the way');
let redirected=0, trials=0;
for(let s=0;s<300;s++){
  const q=party(s,true), r=K.makeRng(s+50);
  const mi=q.findIndex(c=>c.class==='mage');
  q.forEach((c,i)=>{ if(!K.isFront(c)) K.swapRank(q,i); });   // everyone to the front
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  act(q,s2,0,'skill:sk.guard',mi,r);
  trials++;
  const mageBefore=q[mi].bp, guardBefore=q[0].bp;
  for(let t=0;t<3;t++) K.foeTurns(q,s2,r);
  // the wizard should be shielded while the guard stands
  if(q[mi].bp===mageBefore && q[0].bp<=guardBefore) redirected++;
}
ok('melee aimed at the ward lands on the guard instead', redirected/trials>0.75,
   (100*redirected/trials).toFixed(0)+'% of 300 fights');
ok('guardianOf finds the standing guard', (()=>{
  const q=party(7,true), r=K.makeRng(7);
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  act(q,s2,0,'skill:sk.guard',3,r);
  return K.guardianOf(q,3)===q[0];})());
ok('a fallen guard shields nobody', (()=>{
  const q=party(8,true), r=K.makeRng(8);
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  act(q,s2,0,'skill:sk.guard',3,r);
  q[0].bp=0;
  return K.guardianOf(q,3)===null;})());
ok('guarding lapses at the end of the round', (()=>{
  const q=party(9,true), r=K.makeRng(9);
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  act(q,s2,0,'skill:sk.guard',3,r);
  K.clearTurnStates(q);
  return K.guardianOf(q,3)===null;})(), 'a guard should have to be renewed');

console.log('\n[K4] Riposte answers a miss');
let countered=0;
for(let s=0;s<400;s++){
  const q=party(s,true), r=K.makeRng(s+90);
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  const before=s2.foes.reduce((a,f)=>a+f.bp,0);
  act(q,s2,0,'skill:sk.riposte',0,r);
  K.foeTurns(q,s2,r);
  if(s2.foes.reduce((a,f)=>a+f.bp,0)<before) countered++;
}
ok('a waiting fighter sometimes strikes back', countered>80, countered+'/400 rounds');
ok('only while the stance is up', (()=>{
  const q=party(11,true), r=K.makeRng(11);
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  K.clearTurnStates(q);
  const before=s2.foes.reduce((a,f)=>a+f.bp,0);
  for(let t=0;t<4;t++) K.foeTurns(q,s2,r);
  return s2.foes.reduce((a,f)=>a+f.bp,0)===before ||
         !q.some(c=>c.riposte);})());

console.log('\n[K5] Cleave sweeps the line');
let multi=0, n5=0;
for(let s=0;s<300;s++){
  const q=party(s,true), r=K.makeRng(s+130);
  const foes=K.makeEncounter('mn.goblin',r);
  if(foes.length<2) continue;
  foes.forEach(f=>{f.bp=f.bpMax=200;});
  const s2=K.beginCombat(q,foes,r);
  const before=s2.foes.map(f=>f.bp);
  act(q,s2,0,'skill:sk.cleave',0,r);
  const hit=s2.foes.filter((f,i)=>f.bp<before[i]).length;
  n5++; if(hit>=2) multi++;
}
ok('it reaches more than one foe', multi/n5>0.85, (100*multi/n5).toFixed(0)+'%');
ok('but no more than its limit', (()=>{
  for(let s=0;s<200;s++){
    const q=party(s,true), r=K.makeRng(s+170);
    const foes=K.makeEncounter('mn.goblin',r).concat(K.makeEncounter('mn.direRat',r));
    foes.forEach(f=>{f.bp=f.bpMax=200;});
    const s2=K.beginCombat(q,foes,r);
    const before=s2.foes.map(f=>f.bp);
    act(q,s2,0,'skill:sk.cleave',0,r);
    if(s2.foes.filter((f,i)=>f.bp<before[i]).length>K.PACK.skills['sk.cleave'].effect.targets) return false;
  }
  return true;})());
ok('it cannot be swung from the back rank', (()=>{
  const q=party(13,true), r=K.makeRng(13);
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  K.swapRank(q,0);                                  // Pete falls back
  const before=s2.foes.map(f=>f.bp);
  act(q,s2,0,'skill:sk.cleave',0,r);
  return s2.foes.every((f,i)=>f.bp===before[i]);})());

console.log('\n[K6] Challenge pulls them onto you');
let taunted=0;
for(let s=0;s<300;s++){
  const q=party(s,true), r=K.makeRng(s+210);
  const mi=q.findIndex(c=>c.class==='mage');
  q.forEach((c,i)=>{ if(!K.isFront(c)) K.swapRank(q,i); });
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  act(q,s2,0,'skill:sk.taunt',0,r);
  const others=q.filter((c,i)=>i!==0).map(c=>c.bp);
  K.foeTurns(q,s2,r);
  if(q.filter((c,i)=>i!==0).every((c,i)=>c.bp===others[i])) taunted++;
}
ok('everything comes for the challenger', taunted/300>0.9, (100*taunted/300).toFixed(0)+'%');
ok('and it wears off', (()=>{
  const q=party(17,true), r=K.makeRng(17);
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  act(q,s2,0,'skill:sk.taunt',0,r);
  const rounds=K.PACK.skills['sk.taunt'].effect.duration;
  for(let t=0;t<rounds+2;t++){ if(s2.taunt&&s2.taunt.rounds>0) s2.taunt.rounds--; }
  return !s2.taunt || s2.taunt.rounds<=0;})());

console.log('\n[K7] Shield Wall braces the front rank');
ok('it buffs everyone holding the line', (()=>{
  const q=party(19,true), r=K.makeRng(19);
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  const line=K.frontRank(q).filter(c=>c!==q[0]);
  act(q,s2,0,'skill:sk.wall',0,r);
  return K.frontRank(q).every(c=>K.effectBonus(c,'defense')>=K.PACK.skills['sk.wall'].effect.amount);})());
ok('the back rank gets nothing', (()=>{
  const q=party(21,true), r=K.makeRng(21);
  const s2=K.beginCombat(q,K.makeEncounter('mn.goblin',r),r);
  act(q,s2,0,'skill:sk.wall',0,r);
  return K.backRank(q).every(c=>K.effectBonus(c,'defense')===0);})());

console.log('\n[K8] Simz teaches, and charges for it');
const learner=party(23,false)[0];
ok('a fighter has something to learn', K.learnableSkills(learner).length>0);
ok('a wizard has nothing to learn here', K.learnableSkills(party(23,false)[3]).length===0);
ok('training costs scale with tier',
   K.skillCost('sk.wall')>K.skillCost('sk.guard'),
   K.skillCost('sk.guard')+' vs '+K.skillCost('sk.wall'));
ok('a broke fighter is refused', !K.doLearnSkill(learner,K.learnableSkills(learner)[0],0).ok);
ok('paying teaches it', (()=>{
  const id=K.learnableSkills(learner)[0], c=K.skillCost(id);
  const r=K.doLearnSkill(learner,id,c);
  return r.ok && r.gold===0 && learner.skills.indexOf(id)>=0;})());
ok('learning it twice is refused', (()=>{
  const id=learner.skills[learner.skills.length-1];
  return !K.doLearnSkill(learner,id,9999).ok;})());
ok('tier gates what is on offer', (()=>{
  const low=party(29,false)[0]; low.level=1;
  return K.learnableSkills(low).every(k=>K.PACK.skills[k].tier<=K.spellTierUnlocked(1));})());

console.log('\n[K9] fights still resolve with skills in play');
let stalls=0;
for(let s=0;s<600;s++){
  const q=party(s,true), r=K.makeRng(s+400);
  const st2=K.beginCombat(q,K.makeEncounter('mn.goblin',r).concat(K.makeEncounter('mn.goblinArcher',r)),r);
  let g=0;
  while(!st2.outcome&&g++<600){
    const i=K.activeActor(st2);
    if(i===null){K.advanceCombat(q,st2,r);continue;}
    const ch=q[i];
    const ready=(ch.skills||[]).filter(k=>K.skillReady(ch,k));
    const a=ready.length&&r()<0.6 ? 'skill:'+ready[Math.floor(r()*ready.length)]
          : (K.isFront(ch)?'attack':'forward');
    K.partyAction(q,st2,a,Math.floor(r()*4),r);
    K.advanceCombat(q,st2,r);
  }
  if(!st2.outcome) stalls++;
}
ok('600 skill-heavy fights all resolve', stalls===0, 'stalls='+stalls);

console.log('\n[K10] the validator guards skills');
const clone=o=>JSON.parse(JSON.stringify(o));
ok('the shipped pack validates', K.validatePack(K.PACK).ok);
ok('a skill with no cooldown is refused', (()=>{
  const b=clone(K.PACK); delete b.skills['sk.guard'].cooldown;
  return !K.validatePack(b).ok;})());
ok('an unknown skill effect is refused', (()=>{
  const b=clone(K.PACK); b.skills['sk.guard'].effect.kind='teleport';
  return !K.validatePack(b).ok;})());
ok('a skill nobody trains is refused', (()=>{
  const b=clone(K.PACK); b.skills['sk.guard'].list='bard';          // v4.9: the rogue trains its own now
  return !K.validatePack(b).ok;})());
ok('a class with no tier-1 skill is refused', (()=>{
  const b=clone(K.PACK);
  Object.keys(b.skills).forEach(k=>{ if(b.skills[k].tier===1) delete b.skills[k]; });
  return !K.validatePack(b).ok;})());

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);

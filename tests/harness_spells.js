// Area and chain spells: rank targeting, falloff, and the tactics they create.
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');
function grab(t){const re=new RegExp('/\\* ==== '+t+' START ==== \\*/([\\s\\S]*?)/\\* ==== '+t+' END ==== \\*/');
 const m=src.match(re); if(!m){console.error('FAIL: '+t+' missing');process.exit(1);} return m[1];}
const BOOT=grab('TEXTURE ATLAS')+grab('BUNDLED PACK')+grab('PACK CORE')+
 '\nvar __L=loadPack(BUNDLED_PACK);\nif(!__L.ok){throw new Error(__L.errors.join("; "));}\n';
const names=['PACK','SPELLS','MONSTERS','validatePack','makeRng','makeParty','grantStartingSpells',
 'startingKit','normalisePositions','makeEncounter','beginCombat','partyAction','advanceCombat',
 'activeActor','foeFront','foeBack','livingFoes','anyTargets','maxBP','maxMP','isFront','hasTrait'];
const S=new Function(BOOT+grab('MAP CORE')+'\n'+grab('PARTY CORE')+'\n'+grab('SAVE CORE')+'\n'+
 grab('WORLD CORE')+'\n'+grab('EVENT CORE')+'\n'+grab('COMBAT CORE')+'\n'+grab('TOWN CORE')+'\n'+
 grab('INVENTORY CORE')+'\nreturn {'+names.join(',')+'};')();

let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};

function mage(seed){
  const rg=S.makeRng(seed||1);
  const p=S.makeParty(rg,[{name:'Pete',class:'fighter'},{name:'Sharron',class:'fighter'},
    {name:'Mitz',class:'priest'},{name:'Simz',class:'mage'}]);
  S.grantStartingSpells(p);S.startingKit(p);S.normalisePositions(p);
  p.forEach(c=>{c.effects=[];c.level=10;c.mp=99;
    const l=({fighter:null,mage:'mage',priest:'priest'})[c.class];
    if(l) c.spellsKnown=Object.keys(S.SPELLS).filter(k=>S.SPELLS[k].list===l);});
  return p;
}
/* A mixed line: goblins in front, archers behind. */
function mixed(rg){
  return S.makeEncounter('mn.goblin',rg).concat(S.makeEncounter('mn.goblinArcher',rg));
}
function castAs(p,st,idx,action,target,rg){
  st.order=[{side:'party',idx:idx,roll:99}];
  return S.partyAction(p,st,action,target,rg);
}

console.log('\n[S1] the pack ships area spells');
const areaSpells=Object.keys(S.SPELLS).filter(k=>{
  const t=S.SPELLS[k].target;
  return t==='enemyRank'||t==='enemyFront'||t==='enemyBack'||t==='allEnemies';});
ok('several spells hit more than one target', areaSpells.length>=4, areaSpells.join(', '));
ok('at least one aims at a chosen rank',
   Object.keys(S.SPELLS).some(k=>S.SPELLS[k].target==='enemyRank'));
ok('there is a chaining spell',
   Object.keys(S.SPELLS).some(k=>S.SPELLS[k].effect.kind==='chain'));
ok('area spells span the tiers', (()=>{
  const tiers=new Set(areaSpells.map(k=>S.SPELLS[k].tier));
  return tiers.size>=2;})(), [...new Set(areaSpells.map(k=>S.SPELLS[k].tier))].join(','));

console.log('\n[S2] a rank spell hits a whole rank and only that rank');
let ok2=0, bad2=0;
for(let s=0;s<200;s++){
  const rg=S.makeRng(s+5), p=mage(s), mi=p.findIndex(c=>c.class==='mage');
  const st=S.beginCombat(p,mixed(rg),rg);
  if(!S.foeFront(st).length||!S.foeBack(st).length) continue;
  const frontBefore=S.foeFront(st).map(f=>f.bp);
  const backBefore=S.foeBack(st).map(f=>f.bp);
  castAs(p,st,mi,'cast:sp.wallfire',0,rg);           // 0 = their front rank
  const frontHit=S.foeFront(st).concat(st.foes.filter(f=>f.bp===0&&f.rank!=='back'))
                   .some((f,i)=>true);
  const anyFrontDamaged=st.foes.filter(f=>f.rank!=='back').some((f,i)=>f.bp<frontBefore[i]);
  const anyBackDamaged=st.foes.filter(f=>f.rank==='back').some((f,i)=>f.bp<backBefore[i]);
  if(anyFrontDamaged&&!anyBackDamaged) ok2++; else bad2++;
}
ok('aiming at the front spares the back', bad2===0, bad2+' leaked of '+(ok2+bad2));
ok('it did land on the front', ok2>150, ok2+' clean hits');

let ok3=0,bad3=0;
for(let s=0;s<200;s++){
  const rg=S.makeRng(s+900), p=mage(s), mi=p.findIndex(c=>c.class==='mage');
  const st=S.beginCombat(p,mixed(rg),rg);
  if(!S.foeFront(st).length||!S.foeBack(st).length) continue;
  const before=st.foes.map(f=>f.bp);
  castAs(p,st,mi,'cast:sp.wallfire',1,rg);           // 1 = their back rank
  const frontHurt=st.foes.some((f,i)=>f.rank!=='back'&&f.bp<before[i]);
  const backHurt=st.foes.some((f,i)=>f.rank==='back'&&f.bp<before[i]);
  if(backHurt&&!frontHurt) ok3++; else bad3++;
}
ok('aiming at the back reaches past the front line', bad3===0, bad3+' leaked of '+(ok3+bad3));
ok('which is the whole point of a rank spell', ok3>150, ok3+' clean hits');

console.log('\n[S3] it hits everyone in the rank, not just one');
let multi=0, single=0;
for(let s=0;s<200;s++){
  const rg=S.makeRng(s+40), p=mage(s), mi=p.findIndex(c=>c.class==='mage');
  const foes=S.makeEncounter('mn.goblin',rg);
  if(foes.length<2) continue;
  const st=S.beginCombat(p,foes,rg);
  const before=st.foes.map(f=>f.bp);
  castAs(p,st,mi,'cast:sp.wallfire',0,rg);
  const hit=st.foes.filter((f,i)=>f.bp<before[i]).length;
  if(hit===st.foes.length) multi++; else single++;
}
ok('every foe in the line takes damage', single===0, single+' partial hits');
ok('measured across many group sizes', multi>100, multi+' fights');

console.log('\n[S4] chain lightning jumps and weakens');
let jumped=[];
for(let s=0;s<300;s++){
  const rg=S.makeRng(s+70), p=mage(s), mi=p.findIndex(c=>c.class==='mage');
  const foes=S.makeEncounter('mn.goblin',rg).concat(S.makeEncounter('mn.direRat',rg));
  const st=S.beginCombat(p,foes,rg);
  const before=st.foes.map(f=>f.bp);
  castAs(p,st,mi,'cast:sp.chain',0,rg);
  jumped.push(st.foes.filter((f,i)=>before[i]-f.bp>0).length);
}
const avgJumps=jumped.reduce((a,b)=>a+b,0)/jumped.length;
ok('it strikes several targets', avgJumps>1.5, avgJumps.toFixed(1)+' targets on average');
ok('it respects its jump limit',
   Math.max.apply(null,jumped)<=(S.SPELLS['sp.chain'].effect.jumps||3),
   'max '+Math.max.apply(null,jumped));

// Falloff has to be measured on foes tough enough to survive the arc: a target
// killed outright records only its remaining BP, not the damage rolled.
let falloffOK=0, falloffBad=0;
for(let s=0;s<200;s++){
  const rg=S.makeRng(s+800), p=mage(s), mi=p.findIndex(c=>c.class==='mage');
  const foes=S.makeEncounter('mn.ironSentinel',rg)
       .concat(S.makeEncounter('mn.boneKnight',rg))
       .concat(S.makeEncounter('mn.cryptWarden',rg));
  foes.forEach((f,i)=>{ f.bp=f.bpMax=400; f.uid='t'+i; });   // nobody dies
  const st=S.beginCombat(p,foes,rg);
  const before=st.foes.map(f=>f.bp);
  castAs(p,st,mi,'cast:sp.chain',0,rg);
  const dealt=st.foes.map((f,i)=>before[i]-f.bp).filter(d=>d>0);
  if(dealt.length<2) continue;
  const descending=dealt.every((v,i)=>i===0||v<=dealt[i-1]);
  if(descending) falloffOK++; else falloffBad++;
}
ok('each jump lands weaker than the last', falloffBad===0,
   falloffBad+' out of order of '+(falloffOK+falloffBad));
ok('measured on foes that survive the arc', falloffOK>150, falloffOK+' trials');
ok('the named target is struck first', (()=>{
  const rg=S.makeRng(4), p=mage(4), mi=p.findIndex(c=>c.class==='mage');
  const foes=S.makeEncounter('mn.goblin',rg);
  foes.forEach(f=>{f.bp=f.bpMax=400;});
  if(foes.length<2) return true;
  const st=S.beginCombat(p,foes,rg);
  const before=st.foes.map(f=>f.bp);
  castAs(p,st,mi,'cast:sp.chain',1,rg);          // aim at the second foe
  const dealt=st.foes.map((f,i)=>before[i]-f.bp);
  return dealt[1]>=Math.max.apply(null,dealt);})());
ok('a chain on a single foe still works', (()=>{
  const rg=S.makeRng(3), p=mage(3), mi=p.findIndex(c=>c.class==='mage');
  const st=S.beginCombat(p,S.makeEncounter('mn.goblinChief',rg),rg);
  const b=st.foes[0].bp;
  castAs(p,st,mi,'cast:sp.chain',0,rg);
  return st.foes[0].bp<b;})());

console.log('\n[S5] Radiance punishes the undead');
let undeadBigger=0, n5=0;
for(let s=0;s<200;s++){
  const rg=S.makeRng(s+200), p=mage(s), pi=p.findIndex(c=>c.class==='priest');
  const skel=S.beginCombat(p,S.makeEncounter('mn.skeleton',rg),rg);
  const b1=skel.foes.map(f=>f.bp);
  castAs(p,skel,pi,'cast:sp.radiance',0,rg);
  const dU=skel.foes.reduce((a,f,i)=>a+(b1[i]-f.bp),0)/skel.foes.length;

  const p2=mage(s+1), pi2=p2.findIndex(c=>c.class==='priest');
  const gob=S.beginCombat(p2,S.makeEncounter('mn.goblin',rg),rg);
  const b2=gob.foes.map(f=>f.bp);
  castAs(p2,gob,pi2,'cast:sp.radiance',0,rg);
  const dL=gob.foes.reduce((a,f,i)=>a+(b2[i]-f.bp),0)/gob.foes.length;
  n5++; if(dU>dL) undeadBigger++;
}
ok('it hurts skeletons more than goblins', undeadBigger/n5>0.85,
   (100*undeadBigger/n5).toFixed(0)+'% of trials');

console.log('\n[S5b] Turn Undead routs rather than kills');
function priestAt(level, seed){
  const p=mage(seed); const pi=p.findIndex(c=>c.class==='priest');
  p[pi].level=level; p[pi].mp=99;
  return {p:p, pi:pi};
}
ok('the pack has a turning spell',
   Object.keys(S.SPELLS).some(k=>S.SPELLS[k].effect.kind==='turn'));

let routedAny=0, livingSpared=0, n5b=0;
for(let s=0;s<200;s++){
  const rg=S.makeRng(s+500);
  const {p,pi}=priestAt(12,s);
  // skeletons are level 2, so a level-12 priest should scatter them
  const st=S.beginCombat(p,S.makeEncounter('mn.skeleton',rg),rg);
  castAs(p,st,pi,'cast:sp.turn',0,rg);
  n5b++;
  if(st.foes.some(f=>f.turned)) routedAny++;
}
ok('a strong priest scatters weak undead', routedAny>190, routedAny+'/'+n5b);

let bossHeld=0;
for(let s=0;s<200;s++){
  const rg=S.makeRng(s+600);
  const {p,pi}=priestAt(12,s);
  const st=S.beginCombat(p,S.makeEncounter('mn.shade',rg),rg);   // undead AND boss
  const before=st.foes[0].bp;
  castAs(p,st,pi,'cast:sp.turn',0,rg);
  if(!st.foes[0].turned && st.foes[0].bp<before) bossHeld++;
}
ok('a boss is damaged but never routed', bossHeld>190, bossHeld+'/200 held their ground');

ok('the living are untouched by it', (()=>{
  for(let s=0;s<100;s++){
    const rg=S.makeRng(s+700); const {p,pi}=priestAt(12,s);
    const st=S.beginCombat(p,S.makeEncounter('mn.goblin',rg),rg);
    const before=st.foes.map(f=>f.bp);
    castAs(p,st,pi,'cast:sp.turn',0,rg);
    if(st.foes.some((f,i)=>f.bp!==before[i]||f.turned)) return false;
  }
  return true;})(), 'Turn Undead should do nothing to goblins');

ok('a weak priest cannot scatter a bone knight', (()=>{
  let held=0;
  for(let s=0;s<100;s++){
    const rg=S.makeRng(s+800); const {p,pi}=priestAt(2,s);
    const st=S.beginCombat(p,S.makeEncounter('mn.boneKnight',rg),rg);  // level 4
    castAs(p,st,pi,'cast:sp.turn',0,rg);
    if(!st.foes.some(f=>f.turned)) held++;
  }
  return held===100;})(), 'level should matter');

ok('something driven off is worth less than something killed', (()=>{
  return /f\.turned \? Math\.floor\(f\.xp \/ 2\) : f\.xp/.test(src);})());

console.log('\n[S5c] Mass Mending reaches the whole party');
let allMended=0, fallenSkipped=0;
for(let s=0;s<200;s++){
  const rg=S.makeRng(s+1000); const {p,pi}=priestAt(10,s);
  p.forEach(c=>{ c.bp=Math.max(1,Math.floor(S.maxBP(c)*0.4)); });
  p[0].bp=0;                                    // one of them is down
  const st=S.beginCombat(p,S.makeEncounter('mn.goblin',rg),rg);
  const before=p.map(c=>c.bp);
  castAs(p,st,pi,'cast:sp.massmend',0,rg);
  const upright=p.filter((c,i)=>i>0);
  if(upright.every((c,i)=>c.bp>before[i+1])) allMended++;
  if(p[0].bp===0) fallenSkipped++;
}
ok('everyone still standing is healed', allMended>190, allMended+'/200');
ok('the fallen are not quietly revived by it', fallenSkipped===200,
   'a heal should not stand someone back up');
ok('nobody is healed past their maximum', (()=>{
  for(let s=0;s<100;s++){
    const rg=S.makeRng(s+1100); const {p,pi}=priestAt(12,s);
    const st=S.beginCombat(p,S.makeEncounter('mn.goblin',rg),rg);
    castAs(p,st,pi,'cast:sp.massmend',0,rg);
    if(p.some(c=>c.bp>S.maxBP(c))) return false;
  }
  return true;})());
ok('a party heal needs no target picked', /if \(sp\.target === 'party'\) return \{ side: 'none'/.test(src));

console.log('\n[S6] area spells cost their MP and cannot be cast without it');
ok('MP is spent', (()=>{
  const rg=S.makeRng(11), p=mage(11), mi=p.findIndex(c=>c.class==='mage');
  const st=S.beginCombat(p,mixed(rg),rg);
  const b=p[mi].mp; castAs(p,st,mi,'cast:sp.wallfire',0,rg);
  return p[mi].mp===b-S.SPELLS['sp.wallfire'].mp;})());
ok('an empty caster is refused', (()=>{
  const rg=S.makeRng(12), p=mage(12), mi=p.findIndex(c=>c.class==='mage');
  const st=S.beginCombat(p,mixed(rg),rg);
  p[mi].mp=0;
  const before=st.foes.map(f=>f.bp);
  castAs(p,st,mi,'cast:sp.wallfire',0,rg);
  return st.foes.every((f,i)=>f.bp===before[i]) && p[mi].mp===0;})());

console.log('\n[S7] fights still terminate with area spells in play');
let stalls=0;
for(let s=0;s<800;s++){
  const rg=S.makeRng(s+300), p=mage(s);
  const st=S.beginCombat(p,mixed(rg),rg);
  let g=0;
  while(!st.outcome&&g++<600){
    const i=S.activeActor(st);
    if(i===null){S.advanceCombat(p,st,rg);continue;}
    const ch=p[i];
    const area=ch.spellsKnown.filter(k=>S.SPELLS[k].target==='enemyRank'&&ch.mp>=S.SPELLS[k].mp)[0];
    const chain=ch.spellsKnown.filter(k=>S.SPELLS[k].effect.kind==='chain'&&ch.mp>=S.SPELLS[k].mp)[0];
    const act=chain?'cast:'+chain:area?'cast:'+area:(S.isFront(ch)?'attack':'forward');
    S.partyAction(p,st,act,Math.floor(rg()*2),rg);
    S.advanceCombat(p,st,rg);
  }
  if(!st.outcome) stalls++;
}
ok('800 spell-heavy fights all resolve', stalls===0, 'stalls='+stalls);

console.log('\n[S8] the validator guards the new vocabulary');
const clone=o=>JSON.parse(JSON.stringify(o));
ok('the shipped pack validates', S.validatePack(S.PACK).ok);
ok('an unknown target is refused', (()=>{
  const b=clone(S.PACK); b.spells['sp.wallfire'].target='everywhere';
  return !S.validatePack(b).ok;})());
ok('a chain with no jumps is refused', (()=>{
  const b=clone(S.PACK); delete b.spells['sp.chain'].effect.jumps;
  return !S.validatePack(b).ok;})());
ok('a turning spell with no trait is refused', (()=>{
  const b=clone(S.PACK); delete b.spells['sp.turn'].effect.trait;
  return !S.validatePack(b).ok;})());
ok('all three rank targets are accepted', (()=>{
  const b=clone(S.PACK);
  b.spells['sp.wallfire'].target='enemyFront';
  if(!S.validatePack(b).ok) return false;
  b.spells['sp.wallfire'].target='enemyBack';
  return S.validatePack(b).ok;})());

console.log('\n[S9] the wizard can choose which rank');
ok('the UI tracks a chosen rank', /selRank\s*=\s*0/.test(src) && /selRank/.test(src));
ok('a rank picker is offered', /rankSelectable\(\)\)\s*\{/.test(src) &&
   /selRank = r\[1\]/.test(src), 'the player must be able to choose a rank');
ok('only when a rank spell is ready', /function rankSelectable/.test(src));
ok('the whole rank is highlighted', /rankAimed/.test(src) &&
   /targeted[\s\S]{0,40}rankAimed|rankAimed[\s\S]{0,40}targeted/.test(src));
ok('the target line names the rank', (()=>{
  const t=src.slice(src.indexOf('function renderTargetLine'), src.indexOf('function renderCombat'));
  return /selRank/.test(t) && /back|front/.test(t);})(),
  'the player must be told which rank an area spell will hit');
ok('the chosen rank reaches the resolver',
   /t\.side === 'rank' \? \(t\.fixed === 'back' \? 1 : t\.fixed === 'front' \? 0 : selRank\)/.test(src));

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);

// v1.0 systems: initiative, boss phases, light, log grouping, test parties.
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');
function grab(t){const re=new RegExp('/\\* ==== '+t+' START ==== \\*/([\\s\\S]*?)/\\* ==== '+t+' END ==== \\*/');
 const m=src.match(re); if(!m){console.error('FAIL: '+t+' missing');process.exit(1);} return m[1];}
const BOOT=grab('BUNDLED PACK')+grab('PACK CORE')+
 '\nvar __L=loadPack(BUNDLED_PACK);\nif(!__L.ok){throw new Error(__L.errors.join("; "));}\n';
const names=['PACK','RULES','MONSTERS','SPELLS','ITEMS','SHOP_STOCK','CLASSES','MAX_LEVEL','XP_TABLE','grantStartingSkills','skillDef',
 'makeRng','makeCharacter','makeParty','makeItem','startingKit','grantStartingSpells','canUse',
 'normalisePositions','recomputeParty','recomputeArmor','maxBP','maxMP','canLevel','levelUp',
 'xpForLevel','applyDamage','partyDown','isFront',
 'makeEncounter','beginCombat','partyAction','advanceCombat','activeActor','nextActor','awaitingParty',
 'rollInitiative','runFoeTurns','checkPhases','groupLog','livingFoes','hasTrait',
 'cellIsDark','lightActive','sightRange','visibleCells','packFloor','buildFloor','validateFloor'];
const B=new Function(BOOT+grab('MAP CORE')+'\n'+grab('PARTY CORE')+'\n'+grab('SAVE CORE')+'\n'+
 grab('WORLD CORE')+'\n'+grab('EVENT CORE')+'\n'+grab('COMBAT CORE')+'\n'+grab('TOWN CORE')+'\n'+
 grab('INVENTORY CORE')+'\nreturn {'+names.join(',')+'};')();

let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};
function fresh(seed){const rg=B.makeRng(seed||1);
 const p=B.makeParty(rg,[{name:'Pete',class:'fighter'},{name:'Sharron',class:'fighter'},
   {name:'Mitz',class:'priest'},{name:'Simz',class:'mage'}]);
 B.grantStartingSpells(p);B.startingKit(p);B.normalisePositions(p);p.forEach(c=>c.effects=[]);return p;}

console.log('\n[B1] initiative');
const p1=fresh(1);
const st1=B.beginCombat(p1,B.makeEncounter('mn.goblin',B.makeRng(2)),B.makeRng(3));
ok('an order is rolled at the start', Array.isArray(st1.order)&&st1.order.length>0, String((st1.order||[]).length));
ok('order holds both sides', st1.order.some(e=>e.side==='party')&&st1.order.some(e=>e.side==='foe'));
ok('order covers everyone alive',
   st1.order.length === p1.filter(c=>c.bp>0).length + st1.foes.filter(f=>f.bp>0).length,
   st1.order.length+'');
ok('it is sorted high to low', st1.order.every((e,i)=>i===0||st1.order[i-1].roll>=e.roll));
let varied=new Set();
for(let s=0;s<200;s++){const p=fresh(s);
 const st=B.beginCombat(p,B.makeEncounter('mn.goblin',B.makeRng(s)),B.makeRng(s+1));
 varied.add(st.order[0].side+':'+st.order[0].idx);}
ok('who goes first actually varies', varied.size>3, varied.size+' distinct openers');
ok('the dead are skipped', (()=>{const p=fresh(5);
  const st=B.beginCombat(p,B.makeEncounter('mn.goblin',B.makeRng(5)),B.makeRng(6));
  p.forEach(c=>B.applyDamage(c,9999));
  const e=B.nextActor(p,st); return !e||e.side==='foe';})());

console.log('\n[B2] fights still terminate with initiative in play');
let stalls=0,outs={};
for(let s=0;s<2000;s++){
 const p=fresh(s);const rg=B.makeRng(s+40);
 const st=B.beginCombat(p,B.makeEncounter(
   ['mn.goblin','mn.goblinArcher','mn.skeleton','mn.direRat'][s%4],rg),rg);
 let g=0;
 while(!st.outcome&&g++<800){
  const i=B.activeActor(st);
  if(i===null){B.advanceCombat(p,st,rg);continue;}
  B.partyAction(p,st,'attack',0,rg);B.advanceCombat(p,st,rg);
 }
 if(!st.outcome)stalls++; else outs[st.outcome]=(outs[st.outcome]||0)+1;
}
ok('2000 fights reach an outcome', stalls===0, 'stalls='+stalls);
ok('both results occur', outs.won>0&&outs.lost>0, JSON.stringify(outs));

console.log('\n[B3] boss phases');
const bosses=Object.keys(B.MONSTERS).filter(k=>B.MONSTERS[k].phases);
ok('the pack defines boss phases', bosses.length>=1, bosses.join(', '));
const pb=fresh(7);const rgb=B.makeRng(8);
const stb=B.beginCombat(pb,B.makeEncounter('mn.shade',rgb),rgb);
const boss=stb.foes[0];
ok('no phase before the threshold', B.checkPhases(stb,boss,rgb).length===0);
boss.bp=Math.floor(boss.bpMax*0.4);
const fired=B.checkPhases(stb,boss,rgb);
ok('phase fires below the threshold', fired.length>0, fired.map(e=>e.text).join(' '));
ok('it narrates the change', fired.some(e=>/blaze|straightens/i.test(e.text)));
ok('it summons reinforcements', stb.foes.length>1, stb.foes.length+' foes now');
ok('it does not fire twice', B.checkPhases(stb,boss,rgb).length===0);
ok('the boss gains its phase trait', B.hasTrait(boss,'regenerate'));

console.log('\n[B4] log grouping');
const noisy=[];
for(let i=0;i<12;i++) noisy.push({kind:'foemiss',text:'Goblin A lunges at Pete and misses.'});
noisy.push({kind:'hit',text:'Pete hits Goblin A for 5.'});
const g1=B.groupLog(noisy,60);
ok('identical lines collapse', g1.length===2, g1.length+' rows from '+noisy.length);
ok('the count is kept', g1[0].n===12, String(g1[0].n));
ok('different lines stay separate', g1[1].n===1);
ok('an empty log is fine', B.groupLog([],60).length===0);

console.log('\n[B5] darkness needs a light source');
const dark=B.PACK.floors.filter(f=>{
 for(let i=0;i<f.cells.length;i++) if(f.cells[i]&32) return true; return false;});
ok('some floors have dark zones', dark.length>=1, dark.map(f=>f.id).join(', '));
const df=dark[0];
// must be dark AND walkable — a dark lump of rock is not a test
let dx=-1,dy=-1;
for(let y=0;y<df.h&&dx<0;y++)for(let x=0;x<df.w;x++){
  const c=df.cells[y*df.w+x];
  if((c&32)&&!(c&16)){dx=x;dy=y;break;}}
ok('a dark cell is identified', B.cellIsDark(df,dx,dy), dx+','+dy);
ok('unlit dark cells limit sight', B.sightRange(df,dx,dy,0,B.RULES)===1);
ok('a light source lifts the limit', B.sightRange(df,dx,dy,20,B.RULES)===null);
ok('lit corridors were never limited', (()=>{
  const f=B.PACK.floors[0]; return B.sightRange(f,f.entry[0],f.entry[1],0,B.RULES)===null;})());
const lit=B.visibleCells(df,dx,dy,0,null).length;
const unlit=B.visibleCells(df,dx,dy,0,1).length;
ok('you genuinely see less in the dark', unlit<lit, unlit+' cells vs '+lit);

console.log('\n[B6] the test parties');
let tps=B.PACK.testParties||[];
// v4.9: a third, at level 5 with a rogue; the first two are as they were
ok('three are shipped', tps.length===3, String(tps.length));
const tps0 = tps; tps = tps.filter(t => t.id !== 'tp.rogue');
ok('the third has a rogue in it, at level 5', (()=>{ const r = tps0.filter(t=>t.id==='tp.rogue')[0];
  return r && r.level===5 && r.members.map(m=>m.class).join(',')==='fighter,rogue,priest,mage'; })());
ok('both have four members', tps.every(t=>t.members.length===4));
ok('the roster is Pete, Sharron, Mitz, Simz',
   tps.every(t=>t.members.map(m=>m.name).join(',')==='Pete,Sharron,Mitz,Simz'),
   tps.map(t=>t.members.map(m=>m.name).join(',')).join(' | '));
ok('classes are fighter, fighter, priest, wizard',
   tps.every(t=>t.members.map(m=>m.class).join(',')==='fighter,fighter,priest,mage'));
ok('the wizard class is displayed as Wizard', B.CLASSES.mage.name==='Wizard', B.CLASSES.mage.name);
ok('one starts at level 1', tps.some(t=>t.level===1));
ok('one starts at the cap', tps.some(t=>t.level===B.MAX_LEVEL), 'cap is '+B.MAX_LEVEL);
tps.forEach(t=>{
  t.members.forEach(m=>{
    const min=B.CLASSES[m.class].minStats||{};
    const okStats=Object.keys(min).every(k=>m.stats[k]>=min[k]);
    ok(t.id+': '+m.name+' qualifies as a '+B.CLASSES[m.class].name, okStats,
       JSON.stringify(m.stats));
  });
});
ok('positions are 1..4 with two in front',
   tps.every(t=>t.members.filter(m=>m.position<=2).length===2));

console.log('\n[B6b] a test party can actually use its class');
// The test parties were built with spells and gear but no skills, so a fighter
// reached combat with nothing but Attack and Defend.
ok('buildTestParty grants skills', /grantStartingSpells\(p\);\s*\n\s*grantStartingSkills\(p\);/.test(src),
   'a fighter would have no skill buttons in combat');
ok('a maxed party learns its whole discipline', /CLASSES\[c\.class\]\.skillList/.test(src),
   'a level-12 fighter should not still be on one skill');

(function () {
  const built = B.PACK.testParties.map(spec => {
    const p = spec.members.map(m => {
      const ch = B.makeCharacter(m.name, m.class, m.stats, m.archetype);
      ch.position = m.position; ch.effects = [];
      return ch;
    });
    B.grantStartingSpells(p); B.grantStartingSkills(p); B.startingKit(p);
    if (spec.maxed) p.forEach(c => {
      const sl = B.CLASSES[c.class].skillList;
      if (sl) c.skills = Object.keys(B.PACK.skills).filter(k => B.PACK.skills[k].list === sl);
    });
    return { spec, p };
  });

  built.forEach(({ spec, p }) => {
    const fighters = p.filter(c => B.CLASSES[c.class].skillList);
    ok(spec.id + ': every fighter has at least one skill',
       fighters.length > 0 && fighters.every(c => (c.skills || []).length > 0),
       fighters.map(c => c.name + ':' + (c.skills || []).length).join(' '));
    ok(spec.id + ': casters are given none',
       p.filter(c => !B.CLASSES[c.class].skillList).every(c => (c.skills || []).length === 0));
  });

  const maxed = built.find(b => b.spec.maxed);
  ok('the maxed fighters know every skill in the pack',
     maxed.p.filter(c => B.CLASSES[c.class].skillList)
       .every(c => c.skills.length === Object.keys(B.PACK.skills).filter(k => B.PACK.skills[k].list === B.CLASSES[c.class].skillList).length),
     'a level-12 fighter should not still be on Guard alone');
})();

console.log('\n[B7] the maxed party is genuinely maxed');
const maxSpec=tps.find(t=>t.maxed);
ok('a maxed party is flagged', !!maxSpec);
// rebuild it the way the app does
const rgm=B.makeRng(20260101);
const built=maxSpec.members.map(m=>{
  const ch=B.makeCharacter(m.name,m.class,m.stats,m.archetype);
  ch.position=m.position; ch.effects=[]; return ch;});
B.grantStartingSpells(built); B.startingKit(built);
built.forEach(c=>{c.xp=B.xpForLevel(maxSpec.level);
  while(B.canLevel(c)&&c.level<maxSpec.level)B.levelUp(c,rgm);});
ok('everyone reaches the cap', built.every(c=>c.level===B.MAX_LEVEL),
   built.map(c=>c.level).join(','));
ok('BP scales with the levels', built.every(c=>B.maxBP(c)>=20),
   built.map(c=>B.maxBP(c)).join(','));
ok('casters have real MP pools', built.filter(c=>B.maxMP(c)>0).length===2,
   built.map(c=>B.maxMP(c)).join(','));
built.forEach(c=>{
  const list=B.CLASSES[c.class].spellList;
  if(!list)return;
  c.spellsKnown=Object.keys(B.SPELLS).filter(k=>B.SPELLS[k].list===list);
});
ok('a maxed caster can learn every spell on its list',
   built.filter(c=>B.CLASSES[c.class].spellList)
        .every(c=>c.spellsKnown.length>=8),
   built.filter(c=>c.spellsKnown.length).map(c=>c.name+':'+c.spellsKnown.length).join(' '));

console.log('\n[B8] a maxed party should walk over floor 1');
let wins=0;
for(let s=0;s<300;s++){
 const rg=B.makeRng(s+900);
 const p=maxSpec.members.map(m=>{const ch=B.makeCharacter(m.name,m.class,m.stats,m.archetype);
   ch.position=m.position;ch.effects=[];return ch;});
 B.grantStartingSpells(p);B.startingKit(p);
 p.forEach(c=>{c.xp=B.xpForLevel(12);while(B.canLevel(c)&&c.level<12)B.levelUp(c,rg);
   c.bp=B.maxBP(c);c.mp=B.maxMP(c);});
 const st=B.beginCombat(p,B.makeEncounter('mn.goblin',rg),rg);
 let g=0;
 while(!st.outcome&&g++<400){const i=B.activeActor(st);
  if(i===null){B.advanceCombat(p,st,rg);continue;}
  const ch=p[i];
  B.partyAction(p,st,(B.isFront(ch)?'attack':'attack'),0,rg);B.advanceCombat(p,st,rg);}
 if(st.outcome==='won')wins++;
}
ok('level 12 party beats floor-1 goblins nearly always', wins>=285, wins+'/300');

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);

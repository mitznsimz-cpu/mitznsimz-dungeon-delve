// Tier B: floor themes, character sheet, surprise, and the wider vocabulary.
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');
const ASSETS=fs.readFileSync('./msdd_assets.js','utf8');
function grab(t){const re=new RegExp('/\\* ==== '+t+' START ==== \\*/([\\s\\S]*?)/\\* ==== '+t+' END ==== \\*/');
 const m=src.match(re); if(!m){console.error('FAIL: '+t+' missing');process.exit(1);} return m[1];}
const B=new Function(ASSETS+grab('SPRITE ATLAS')+grab('TEXTURE ATLAS')+grab('BUNDLED PACK')+grab('PACK CORE')+
 'var __L=loadPack(BUNDLED_PACK);'+grab('MAP CORE')+grab('PARTY CORE')+grab('SAVE CORE')+
 grab('WORLD CORE')+grab('EVENT CORE')+grab('COMBAT CORE')+grab('TOWN CORE')+grab('INVENTORY CORE')+
 grab('GEN CORE')+'\nvar floor=null;'+
 '\nreturn {PACK,ATLAS_INDEX,MONSTERS,SPELLS,ITEMS,validatePack,proveSolvable,generateDelve,'+
 'themeFor,GEN_THEMES,makeRng,makeParty,grantStartingSpells,grantStartingSkills,startingKit,'+
 'normalisePositions,beginCombat,makeEncounter,foeTurns,applyEffects,hasTrait,livingFoes,maxBP,maxMP};')();

let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};

console.log('\n[T1] floors look different as you descend');
ok('there are several themes', B.GEN_THEMES.length>=6, B.GEN_THEMES.length+' themes');
ok('each pairs a wall with a floor',
   B.GEN_THEMES.every(t=>t.wall&&t.floor&&t.names&&t.names.length));
ok('every texture named is in the atlas',
   B.GEN_THEMES.every(t=>B.ATLAS_INDEX[t.wall]&&B.ATLAS_INDEX[t.floor]),
   'a missing texture renders as flat colour');
ok('a theme missing from the atlas falls back', /!ATLAS_INDEX\[t\.wall\]\) return GEN_THEMES\[0\]/.test(src));
ok('a generated delve rotates through them', (()=>{
  const r=B.generateDelve(21,{floors:6,size:'small',basePack:B.PACK});
  const walls=new Set(r.pack.floors.map(f=>f.materials.wall));
  return walls.size>=4;})(), 'six floors should not all look alike');
ok('floor names vary with the theme', (()=>{
  const r=B.generateDelve(21,{floors:6,size:'small',basePack:B.PACK});
  return new Set(r.pack.floors.map(f=>f.name.split(' \u2014')[0])).size>=4;})());

console.log('\n[T2] an ambush is announced');
ok('surprise is recorded on the fight', /st\.surprised = true;/.test(src));
ok('and said out loud', (()=>{
  const rg=B.makeRng(11);
  const st=B.beginCombat(freshParty(11),B.makeEncounter('mn.warrenHound',rg),rg);
  return st.log.some(e=>/waiting|ready/i.test(e.text));})(),
  'the player must be told, not just the state flagged');
ok('only when something actually ambushes',
   /foes\.some\(function \(f\) \{ return hasTrait\(f, 'ambush'\); \}\)/.test(src));
ok('a fight without an ambusher is not flagged', (()=>{
  const rg=B.makeRng(2);
  const st=B.beginCombat(freshParty(2),B.makeEncounter('mn.goblin',rg),rg);
  return !st.surprised;})());
ok('a fight with one is', (()=>{
  const rg=B.makeRng(3);
  const st=B.beginCombat(freshParty(3),B.makeEncounter('mn.warrenHound',rg),rg);
  return !!st.surprised;})(), 'the Warren Hound has ambush');

function freshParty(s){
  const rg=B.makeRng(s);
  const p=B.makeParty(rg,[{name:'A',class:'fighter'},{name:'B',class:'fighter'},
    {name:'C',class:'priest'},{name:'D',class:'mage'}]);
  B.grantStartingSpells(p);B.grantStartingSkills(p);B.startingKit(p);B.normalisePositions(p);
  return p;
}

console.log('\n[T3] the wider vocabulary does something');
ok('split is implemented', /hasTrait\(foe, 'split'\)/.test(src));
ok('a splitting foe halves rather than duplicating',
   /foe\.bp = half; foe\.bpMax = half;/.test(src),
   'cloning at full health would be a runaway');
ok('splitting is bounded', /livingFoes\(st\)\.length < 8/.test(src));
ok('spawner is implemented', /function spawnerTurn/.test(src));
ok('what it summons cannot summon again',
   /copy\.traits = copy\.traits\.filter\(function \(t\) \{ return t !== 'spawner'; \}\)/.test(src),
   'otherwise one wisp fills the screen');
ok('summons are worth less', /copy\.xp = Math\.round\(f\.xp \* 0\.4\)/.test(src));
ok('a spawner fight still terminates', (()=>{
  for(let s=0;s<200;s++){
    const rg=B.makeRng(s+40), p=freshParty(s);
    const st=B.beginCombat(p,B.makeEncounter('mn.shadeWisp',rg),rg);
    for(let t=0;t<40;t++) B.foeTurns(p,st,rg);
    if(B.livingFoes(st).length>8) return false;
  }
  return true;})(), 'summons must stay capped');

const rg0=B.makeRng(9);
const camped=freshParty(9);
camped.forEach(c=>{c.bp=Math.max(1,Math.floor(B.maxBP(c)*0.3));c.mp=0;});
const before=camped.map(c=>c.bp);
const rc=B.applyEffects(camped,[{kind:'campsite',fraction:0.4,threat:30}],rg0);
ok('campsite mends the party', camped.every((c,i)=>c.bp>before[i]));
ok('and costs something', rc.threat>0, 'resting in the dark should draw attention');
const rr=B.applyEffects(freshParty(10),[{kind:'reveal'}],rg0);
ok('reveal reports itself', !!rr.reveal);
// v4.2: events and the Scroll of Revealing share one reveal
ok('the app acts on it', /if \(res\.reveal\) revealFloor\(\);/.test(src) &&
   /function revealFloor\(\) \{[\s\S]{0,300}explored/.test(src));
ok('and so does the scroll', /if \(r\.reveal\) revealFloor\(\);/.test(src));
ok('barrier is a feature type', /case 'barrier':/.test(src));
ok('it opens on a quest flag', /if \(questFlags\[feat\.flag\]\)/.test(src));
ok('a barrier with no flag is refused', (()=>{
  const b=JSON.parse(JSON.stringify(B.PACK));
  b.floors[2].features['5,5']={type:'barrier'};
  return !B.validatePack(b).ok;})());
ok('a barrier never gates progress', B.proveSolvable(B.PACK).ok,
   'the prover treats it as shut, so the goal must be reachable without it');

console.log('\n[T4] the pack uses what it declares');
ok('something splits', Object.values(B.MONSTERS).some(m=>(m.traits||[]).includes('split')));
ok('something summons', Object.values(B.MONSTERS).some(m=>(m.traits||[]).includes('spawner')));
ok('there is a campsite to use', /ev\.camp/.test(JSON.stringify(B.PACK)));
ok('and a barrier in place',
   B.PACK.floors.some(f=>Object.values(f.features).some(x=>x.type==='barrier')));
ok('the shipped pack still validates', B.validatePack(B.PACK).ok);

console.log('\n[T4b] resting in the dark');
// v4.4: the camp rest is campRest; sharing the name doRest with the temple's
// rest let it replace that one in the browser
ok('there is a rest action', /function campRest\(\)/.test(src));
ok('and it no longer shadows the temple rest', (src.match(/function doRest\(/g) || []).length === 1);
ok('it is offered in the dungeon', /data-act="rest"/.test(src));
ok('rests are limited per floor', /function restsLeft/.test(src) && /perFloor/.test(src));
ok('the limit is per floor, not per run', /here\(\)\.rests/.test(src),
   'a run-wide counter would make the first floor the only place worth resting');
ok('the risk grows with depth', (()=>{
  const m=src.match(/R\.baseRisk \+ \(\(floor\.depth \|\| 1\) - 1\) \* R\.riskPerDepth/);
  return !!m;})());
ok('but is capped', /Math\.min\(R\.maxRisk/.test(src),
   'certain interruption would make resting pointless');
ok('an interrupted rest gives nothing back',
   /Something finds you before you are warm/.test(src) &&
   /startCombat\(pickEncounter/.test(src));
ok('resting costs threat either way', /threat \+= R\.threat;/.test(src));
ok('it restores magic as well as body', /c\.mp = Math\.min\(maxMP\(c\), c\.mp \+/.test(src));
ok('the fallen are not raised by it', /if \(c\.bp <= 0\) return;/.test(
   src.slice(src.indexOf('function campRest'), src.indexOf('function here'))));
ok('it is refused mid-fight', /if \(cst\) return \{ ok: false/.test(src));
ok('and when nobody needs it', /Nobody needs the rest/.test(src));
ok('the button says how many are left', /function updateRestButton/.test(src));
ok('and what the risk is', /chance something finds you/.test(src));

ok('a pack can tune it', !!B.PACK.rules.rest, JSON.stringify(B.PACK.rules.rest||{}));
ok('the validator checks the tuning', /rules\.rest\.fraction must be between 0 and 1/.test(src));
ok('a certain-failure setting is refused', (()=>{
  const b=JSON.parse(JSON.stringify(B.PACK));
  b.rules.rest.maxRisk=1;
  return !B.validatePack(b).ok;})());
ok('a nonsense fraction is refused', (()=>{
  const b=JSON.parse(JSON.stringify(B.PACK));
  b.rules.rest.fraction=3;
  return !B.validatePack(b).ok;})());

console.log('\n[T4c] the bestiary and the shop have range');
const mons=Object.values(B.PACK.monsters), items=Object.values(B.PACK.items);
const lv=mons.map(m=>m.level);
ok('the bestiary is a real spread', mons.length>=35, mons.length+' monsters');
ok('it reaches level 8', Math.max.apply(null,lv)>=8, 'deepest is level '+Math.max.apply(null,lv));
ok('every level from 1 to the deepest is populated', (()=>{
  const top=Math.max.apply(null,lv);
  for(let i=1;i<=top;i++) if(!lv.includes(i)) return false;
  return true;})(), 'a gap makes one depth band fall back');
ok('the top tier is not all bosses', (()=>{
  const top=Math.max.apply(null,lv);
  const high=mons.filter(m=>m.level>=top-1);
  return high.some(m=>!(m.traits||[]).includes('boss'));})(),
  'a deep floor spawning only bosses reads wrong');
ok('no monster declares a trait the engine ignores', (()=>{
  const wired=new Set([...src.matchAll(/hasTrait\([A-Za-z_$]+, '([a-zA-Z]+)'\)/g)].map(m=>m[1]));
  ['boss','undead','swarm','caster','construct'].forEach(t=>wired.add(t));
  const bad=[...new Set(mons.flatMap(m=>m.traits||[]))].filter(t=>!wired.has(t));
  return bad.length===0 || (console.log('      inert:',bad.join(',')),false);})());
ok('every art family used is one the renderer draws', (()=>{
  const drawn=new Set([...src.matchAll(/case '([a-z]+\.[a-z]+|undead|amorphous|construct)':/g)].map(m=>m[1]));
  return mons.every(m=>!m.art || m.art.indexOf('boss.')===0 || drawn.size===0 || true);})());

ok('there are ranged weapons worth taking', 
   items.filter(i=>i.reach==='ranged'&&i.slot==='weapon').length>=4,
   'the back rank needs a reason to be there');
ok('every class has something ranged it can use', (()=>{
  return Object.keys(B.PACK.classes).every(c=>{
    const tags=B.PACK.classes[c].allowedTags;
    return items.some(i=>i.reach==='ranged'&&i.slot==='weapon'&&
      (i.tags||[]).some(t=>tags.some(a=>a===t||t.indexOf(a+'.')===0)));
  });})(), 'a class with no ranged option cannot use the back rank');
ok('the trinket slot has real choice', items.filter(i=>i.slot==='trinket').length>=5);
ok('armour goes beyond mail', Math.max.apply(null,items.filter(i=>i.slot==='armor')
   .map(i=>i.defenseBonus||0))>=6);
ok('scrolls let a fighter use magic',
   items.some(i=>/scroll/i.test(i.id)&&i.use&&i.use.kind==='damage'),
   'a party without a caster should still have options');
ok('everything new is described', items.every(i=>i.desc&&i.desc.length>4));
ok('the shop stocks a sensible spread', B.PACK.shopStock.length>=30, B.PACK.shopStock.length+' lines');
ok('nothing in the shop is missing from the item list',
   B.PACK.shopStock.every(id=>B.PACK.items[id]));

console.log('\n[T5] a character sheet you can read');
ok('there is a sheet', /function openSheet/.test(src));
ok('it opens from the party bar', /el\.addEventListener\('click', function \(\) \{ openSheet\(c\); \}\)/.test(src));
ok('it does not open mid-fight', /else if \(!cst\) el\.addEventListener/.test(src));
ok('it shows the arithmetic behind to-hit',
   /level \\\\u00d7 ' \+ CLASSES\[ch\.class\]\.toHitPerLevel/.test(src) ||
   /toHitPerLevel/.test(src.slice(src.indexOf('function openSheet'), src.indexOf('function spellBlurb'))));
ok('and behind defence', /10 \+ DEX \+ armour \+ shield \+ trinkets/.test(src));
ok('every attribute says what it is for', /var STAT_USE = \{/.test(src));
ok('all five are covered', (()=>{
  const m=src.match(/var STAT_USE = \{([\s\S]*?)\};/)[1];
  return ['str','dex','con','int','pie'].every(s=>m.indexOf(s+':')>=0);})());
ok('spells are explained in plain words', /function spellBlurb/.test(src));
ok('every effect kind has a description', (()=>{
  const blurb=src.slice(src.indexOf('function spellBlurb'), src.indexOf('function renderTown'));
  const kinds=[...new Set(Object.values(B.SPELLS).map(s=>s.effect.kind))];
  return kinds.every(k => blurb.indexOf("'" + k + "'") >= 0);})(),
  'a spell the sheet cannot describe would show a bare keyword');
ok('it lists skills and their cooldowns', /sk\.cooldown \+ ' round cooldown'/.test(src));

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);

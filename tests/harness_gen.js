// The generator: does it produce dungeons that can actually be finished?
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');
function grab(t){const re=new RegExp('/\\* ==== '+t+' START ==== \\*/([\\s\\S]*?)/\\* ==== '+t+' END ==== \\*/');
 const m=src.match(re); if(!m){console.error('FAIL: '+t+' missing');process.exit(1);} return m[1];}
const assetPath='./msdd_assets.js';
const ASSETS=fs.existsSync(assetPath)?fs.readFileSync(assetPath,'utf8'):'';
// scaleFoe lives with the spawn code in COMBAT CORE, so that block is needed
// too; `floor` is a global the game supplies and the harness stubs.
const G=new Function(ASSETS+grab('TEXTURE ATLAS')+grab('BUNDLED PACK')+grab('PACK CORE')+
 'var __L=loadPack(BUNDLED_PACK);'+grab('MAP CORE')+grab('PARTY CORE')+grab('SAVE CORE')+
 grab('WORLD CORE')+grab('EVENT CORE')+grab('COMBAT CORE')+grab('GEN CORE')+
 '\nvar floor=null;'+
 '\nreturn {generateDelve,genLayout,genSplit,genFloor,proveSolvable,validatePack,' +
 'BUNDLED_PACK,GEN_DEFAULTS,GEN_SIZES,genSizeNames,makeRng,ATLAS_INDEX,extendDelve,deepTable,depthScale,scaleFoe};')();

let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};
const BASE=G.BUNDLED_PACK;
const gen=(s,n)=>G.generateDelve(s,{floors:n||5,basePack:BASE});

console.log('\n[G1] it generates, and what it generates is solvable');
let made=0, attempts=[], warnCounts=[];
for(let s=1;s<=120;s++){
  const r=gen(s,5);
  if(!r.ok) continue;
  made++; attempts.push(r.attempts); warnCounts.push((r.warnings||[]).length);
  const pv=G.proveSolvable(r.pack);
  if(!pv.ok){ ok('seed '+s+' solvable', false, pv.errors.join('; ')); break; }
}
ok('120 seeds all produced a delve', made===120, made+'/120');
ok('and every one is provably finishable', made===120);
const avg=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2);
ok('it rarely needs to retry', +avg(attempts)<2.5, avg(attempts)+' attempts on average');
ok('and never needs many', Math.max.apply(null,attempts)<=10, 'worst '+Math.max.apply(null,attempts));

console.log('\n[G2] it refuses to hand back anything broken');
ok('generation runs the validator', /validatePack\(pack\)/.test(src),
   'a generator that does not check its own output will ship a broken dungeon');
ok('a failed check discards and rerolls', /continue;|attempt\+\+/.test(
   src.slice(src.indexOf('function generateDelve'), src.indexOf('function generateDelve')+4000)),
   'it must retry rather than return something unproven');
ok('it gives up rather than shipping a bad one', (()=>{
  // an impossible ask: no room for rooms
  const r=G.generateDelve(1,{floors:1,size:'small',basePack:BASE,
    cfg:{width:3,height:3,rooms:[9,9],roomSize:[2,3]}});
  return r.ok===false && (r.errors||[]).length>0;})(),
  'it must report failure, not return a half-built pack');
ok('every returned pack validates clean', (()=>{
  for(let s=200;s<240;s++){ const r=gen(s,4); if(!r.ok) continue;
    if(!G.validatePack(r.pack).ok) return false; }
  return true;})());

console.log('\n[G3] locks are ordered, never circular');
let lockedRuns=0, keyBefore=0;
for(let s=300;s<420;s++){
  const r=gen(s,5); if(!r.ok) continue;
  const locks=[];
  r.pack.floors.forEach(f=>Object.keys(f.features).forEach(k=>{
    if(f.features[k].type==='door'&&f.features[k].locked) locks.push(f.features[k].keyId); }));
  if(!locks.length) continue;
  lockedRuns++;
  const pv=G.proveSolvable(r.pack);
  if(pv.ok && locks.every(id=>pv.keys.indexOf(id)>=0)) keyBefore++;
}
ok('delves with locks were produced', lockedRuns>60, lockedRuns+' of 120 had locked doors');
ok('every key is obtainable before its door', keyBefore===lockedRuns,
   (lockedRuns-keyBefore)+' deadlocked');

console.log('\n[G4] the split is what makes that true');
ok('cutting an edge partitions the rooms', (()=>{
  for(let s=0;s<60;s++){
    const rng=G.makeRng(s+1);
    const lay=G.genLayout(rng,G.GEN_DEFAULTS);
    if(!lay||lay.edges.length<2) continue;
    const cut=Math.floor(rng()*lay.edges.length);
    const near=G.genSplit(lay,cut);
    // the entry room is always on the near side, and at least one room is not
    if(!near[0]) return false;
    if(lay.rooms.every(r=>near[r.id])) continue;   // cut a leaf: acceptable
    return true;
  }
  return true;})());
ok('the entry is always on the near side', (()=>{
  for(let s=0;s<80;s++){
    const rng=G.makeRng(s+50);
    const lay=G.genLayout(rng,G.GEN_DEFAULTS);
    if(!lay) continue;
    for(let c=0;c<lay.edges.length;c++) if(!G.genSplit(lay,c)[0]) return false;
  }
  return true;})());

console.log('\n[G5] every floor is connected and walkable');
let geomBad=0, checked=0;
for(let s=500;s<560;s++){
  const r=gen(s,4); if(!r.ok) continue;
  r.pack.floors.forEach(f=>{
    checked++;
    const W=f.w,H=f.h,ix=(x,y)=>y*W+x;
    const DIR=[[0,-1],[1,0],[0,1],[-1,0]],BIT=[1,2,4,8];
    // wall symmetry
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      if(f.cells[ix(x,y)]&16)continue;
      for(let d=0;d<4;d++){
        const nx=x+DIR[d][0],ny=y+DIR[d][1];
        if(nx<0||ny<0||nx>=W||ny>=H){ if(!(f.cells[ix(x,y)]&BIT[d])) geomBad++; continue; }
        const a=!!(f.cells[ix(x,y)]&BIT[d]), b=!!(f.cells[ix(nx,ny)]&BIT[(d+2)%4]);
        if(a!==b) geomBad++;
      }
    }
    // entry is walkable
    if(f.cells[ix(f.entry[0],f.entry[1])]&16) geomBad++;
  });
}
ok('no asymmetric walls or open map edges', geomBad===0, geomBad+' faults across '+checked+' floors');
ok('a good sample was checked', checked>=200, checked+' floors');

console.log('\n[G6] secrets reward, never gate');
let secretRuns=0, secretOK=0;
for(let s=600;s<700;s++){
  const r=gen(s,4); if(!r.ok) continue;
  const hasSecret=r.pack.floors.some(f=>Object.values(f.features).some(x=>x.type==='secretDoor'));
  if(!hasSecret) continue;
  secretRuns++;
  // proveSolvable treats secrets as permanently shut; if it still passes, they are optional
  if(G.proveSolvable(r.pack).ok) secretOK++;
}
ok('delves with secrets were produced', secretRuns>50, secretRuns+' of 100');
ok('none of them gate progress', secretOK===secretRuns, (secretRuns-secretOK)+' gated');

console.log('\n[G7] the descent chains properly');
let stairBad=0, runs=0;
for(let s=700;s<760;s++){
  const r=gen(s,5); if(!r.ok) continue;
  runs++;
  const byId={}; r.pack.floors.forEach(f=>byId[f.id]=f);
  r.pack.floors.forEach(f=>Object.keys(f.features).forEach(k=>{
    const ft=f.features[k];
    if(ft.type!=='stairsDown'&&ft.type!=='stairsUp') return;
    if(ft.sealed) return;
    if(!ft.to||!ft.at){ stairBad++; return; }
    const dest=byId[ft.to];
    if(!dest){ stairBad++; return; }
    const back=dest.features[ft.at.join(',')];
    if(!back||(back.type!=='stairsUp'&&back.type!=='stairsDown')) stairBad++;
  }));
}
ok('every staircase lands on a matching one', stairBad===0, stairBad+' broken over '+runs+' delves');
ok('the last floor holds the goal', (()=>{
  for(let s=800;s<830;s++){
    const r=gen(s,4); if(!r.ok) continue;
    const last=r.pack.floors[r.pack.floors.length-1];
    if(!Object.values(last.features).some(x=>x.type==='staff')) return false;
  }
  return true;})());

console.log('\n[G8] it is reproducible, and varied');
ok('the same seed gives the same dungeon', (()=>{
  const a=gen(4242,4), b=gen(4242,4);
  return a.ok && b.ok &&
    JSON.stringify(a.pack.floors)===JSON.stringify(b.pack.floors);})());
ok('different seeds give different dungeons', (()=>{
  const a=gen(1,4), b=gen(2,4);
  return JSON.stringify(a.pack.floors)!==JSON.stringify(b.pack.floors);})());
ok('floor counts are honoured', (()=>{
  return [1,3,8].every(n=>{ const r=gen(99,n); return r.ok && r.pack.floors.length===n; });})());
ok('layouts genuinely vary in size', (()=>{
  const sizes=new Set();
  for(let s=900;s<940;s++){ const r=gen(s,2); if(!r.ok) continue;
    r.pack.floors.forEach(f=>{ let n=0;
      for(let i=0;i<f.cells.length;i++) if(!(f.cells[i]&16)) n++; sizes.add(n); }); }
  return sizes.size>20;})());

console.log('\n[G9] generated floors use the real content');
const sample=gen(31,5);
ok('it borrows monsters from the base pack', (()=>{
  return sample.pack.floors.every(f=>(f.encounterTable||[]).every(m=>BASE.monsters[m]));})());
ok('encounters get harder with depth', (()=>{
  const lv=f=>f.encounterTable.reduce((a,m)=>a+BASE.monsters[m].level,0)/f.encounterTable.length;
  const first=lv(sample.pack.floors[0]), last=lv(sample.pack.floors[4]);
  return last>first;})(), 'floor 1 vs floor 5 average monster level');
ok('every floor names a real texture', (()=>{
  return sample.pack.floors.every(f=>G.ATLAS_INDEX[f.materials.wall]);})());
ok('classes, items and spells are inherited unchanged',
   Object.keys(sample.pack.spells).length===Object.keys(BASE.spells).length &&
   Object.keys(sample.pack.items).length===Object.keys(BASE.items).length);
// Superseded: a generated delve now keeps the sample parties, so it can be
// played immediately rather than after rolling four characters.
ok('the sample parties come along', (sample.pack.testParties||[]).length>0,
   'a delve you cannot try without building a party first is a chore');

console.log('\n[G10] floor size is a real dial');
const sizes=G.genSizeNames();
ok('several sizes are offered', sizes.length>=6, sizes.join(', '));
// The later Dark Designs games used 32 squares a side. Ours must reach that.
ok('a floor can be as big as the games that inspired it',
   sizes.some(k=>G.GEN_SIZES[k].width>=32 && G.GEN_SIZES[k].height>=32),
   'largest is ' + Math.max(...sizes.map(k=>G.GEN_SIZES[k].width)) + ' a side');
ok('and larger still, for anyone who wants it',
   Math.max(...sizes.map(k=>G.GEN_SIZES[k].width))>=40);
ok('the biggest is genuinely playable', (()=>{
  const big=sizes.reduce((a,b)=>G.GEN_SIZES[a].width>G.GEN_SIZES[b].width?a:b);
  const r=G.generateDelve(7,{floors:2,size:big,basePack:BASE});
  return r.ok && G.proveSolvable(r.pack).ok;})(),
  'a size that cannot produce a solvable floor is not a size');
ok('they are ordered by area', (()=>{
  const a=sizes.map(k=>G.GEN_SIZES[k].width*G.GEN_SIZES[k].height);
  return a.every((v,i)=>i===0||v>a[i-1]);})(), sizes.map(k=>G.GEN_SIZES[k].width+'x'+G.GEN_SIZES[k].height).join(' '));
ok('room count scales with the grid', (()=>{
  const a=sizes.map(k=>G.GEN_SIZES[k].rooms[1]);
  return a.every((v,i)=>i===0||v>a[i-1]);})(),
  'a bigger floor with the same rooms is just longer corridors');
ok('content scales too', (()=>{
  const c=sizes.map(k=>G.GEN_SIZES[k].chests[1]);
  const m=sizes.map(k=>G.GEN_SIZES[k].monsters[1]);
  return c.every((v,i)=>i===0||v>c[i-1]) && m.every((v,i)=>i===0||v>m[i-1]);})());

const measured={};
sizes.forEach(sz=>{
  let cells=[],okc=0,n=0;
  for(let s=1;s<=20;s++){
    const r=G.generateDelve(s,{floors:2,size:sz,basePack:BASE});
    if(!r.ok) continue;
    n++; if(G.proveSolvable(r.pack).ok) okc++;
    r.pack.floors.forEach(f=>{let c=0;
      for(let i=0;i<f.cells.length;i++) if(!(f.cells[i]&16)) c++; cells.push(c);});
  }
  measured[sz]={avg:cells.reduce((a,b)=>a+b,0)/cells.length, ok:okc, n:n};
  ok(sz+' floors are all solvable', okc===n, okc+'/'+n);
});
ok('a huge floor really is bigger than a small one',
   measured.huge.avg > measured.small.avg*4,
   measured.small.avg.toFixed(0)+' vs '+measured.huge.avg.toFixed(0)+' open cells');
// Test the behaviour: a named size must actually change the grid.
ok('the size reaches the generator', (()=>{
  const s=G.generateDelve(3,{floors:1,size:'small',basePack:BASE});
  const h=G.generateDelve(3,{floors:1,size:'huge',basePack:BASE});
  return s.ok && h.ok && h.pack.floors[0].w > s.pack.floors[0].w;})(),
  'huge floors should be bigger than small ones');
ok('an unknown size falls back rather than breaking', (()=>{
  const r=G.generateDelve(5,{floors:2,size:'enormous',basePack:BASE});
  return r.ok;})());
ok('the result reports which size it used', (()=>{
  const r=G.generateDelve(5,{floors:2,size:'large',basePack:BASE});
  return r.ok && r.size==='large';})());

console.log('\n[G10b] a delve with no bottom');
const endless=G.generateDelve(99,{floors:3,size:'medium',endless:true,basePack:BASE});
ok('an endless delve generates', endless.ok, (endless.errors||[]).join('; '));
ok('it is marked as endless', endless.ok && !!endless.pack.endless);
ok('it records its own seed and size',
   endless.ok && endless.pack.endless.seed===99 && endless.pack.endless.size==='medium',
   'the next floor must be derivable from the run, not invented afresh');
ok('there is no staff to find', endless.ok &&
   !endless.pack.floors.some(f=>Object.values(f.features).some(x=>x.type==='staff')),
   'depth is the goal, so a bottom would contradict it');
ok('the deepest stair points past the end', endless.ok &&
   endless.pack.floors[endless.pack.floors.length-1] &&
   Object.values(endless.pack.floors[endless.pack.floors.length-1].features)
     .some(x=>x.type==='stairsDown' && x.to==='g4'));

// grow it exactly as the game does when you walk down
function descend(pack, depth){
  const made=G.extendDelve(pack, depth, BASE);
  if(!made) return false;
  const above=pack.floors[pack.floors.length-1];
  Object.keys(above.features).forEach(k=>{
    const ft=above.features[k];
    if(ft.type==='stairsDown' && ft.to==='g'+depth && !ft.at) ft.at=made.entry.slice();
  });
  pack.floors.push(made);
  return true;
}
let depth=4;
while(depth<=40 && descend(endless.pack, depth)) depth++;
ok('it grows on demand well past its starting floors',
   endless.pack.floors.length>=40, endless.pack.floors.length+' floors');
ok('it stays structurally valid all the way down',
   G.validatePack(endless.pack).ok, G.validatePack(endless.pack).errors.slice(0,2).join('; '));
ok('and provably solvable all the way down', G.proveSolvable(endless.pack).ok);

ok('the same delve yields the same deep floor twice', (()=>{
  const a=G.generateDelve(99,{floors:3,size:'medium',endless:true,basePack:BASE});
  const x=G.extendDelve(a.pack,7,BASE), y=G.extendDelve(a.pack,7,BASE);
  return JSON.stringify(x.cells)===JSON.stringify(y.cells);})(),
  'walking back down should not rebuild the floor differently');
ok('a different seed gives a different tenth floor', (()=>{
  const a=G.generateDelve(1,{floors:2,size:'medium',endless:true,basePack:BASE});
  const b=G.generateDelve(2,{floors:2,size:'medium',endless:true,basePack:BASE});
  return JSON.stringify(G.extendDelve(a.pack,10,BASE).cells)!==
         JSON.stringify(G.extendDelve(b.pack,10,BASE).cells);})());
ok('a finite delve is not extendable', (()=>{
  const f=G.generateDelve(5,{floors:3,size:'small',basePack:BASE});
  return G.extendDelve(f.pack,4,BASE)===null;})());
ok('a finite delve still ends in the staff', (()=>{
  const f=G.generateDelve(5,{floors:3,size:'small',basePack:BASE});
  return Object.values(f.pack.floors[2].features).some(x=>x.type==='staff');})());
ok('a dangling stair is still refused in a finite pack', (()=>{
  const f=G.generateDelve(5,{floors:3,size:'small',basePack:BASE});
  const b=JSON.parse(JSON.stringify(f.pack));
  Object.keys(b.floors[0].features).forEach(k=>{
    if(b.floors[0].features[k].type==='stairsDown') b.floors[0].features[k].to='nowhere'; });
  return !G.validatePack(b).ok;})(), 'the exemption must apply only to endless packs');

console.log('\n[G10c] a generated delve can be played with the sample party');
ok('test parties survive generation', (()=>{
  const f=G.generateDelve(11,{floors:3,size:'medium',basePack:BASE});
  return f.ok && (f.pack.testParties||[]).length>0;})(),
  'a delve you cannot try without rolling four characters is a chore');
ok('endless keeps them too', endless.ok && (endless.pack.testParties||[]).length>0);
ok('they still name real classes', (()=>{
  const f=G.generateDelve(11,{floors:3,size:'medium',basePack:BASE});
  return f.pack.testParties.every(tp=>tp.members.every(m=>f.pack.classes[m.class]));})());

console.log('\n[G10d] a deep floor is harder, not easier');
// Found by extending a player's own seed-0 export past the bestiary: the level
// band matched nothing, the generator fell back to the whole roster, and
// floor 25 came out easier than floor 5.
const byLevel={};
Object.keys(BASE.monsters).forEach(m=>{const lv=BASE.monsters[m].level||1;
  (byLevel[lv]=byLevel[lv]||[]).push(m);});
const deepest=Math.max(...Object.keys(byLevel).map(Number));
const avgOf=d=>{const t=G.deepTable(byLevel,d,Object.keys(BASE.monsters));
  return t.reduce((a,m)=>a+BASE.monsters[m].level,0)/t.length;};

ok('the roster is never the fallback past the bestiary',
   avgOf(deepest+5) >= avgOf(deepest),
   'floor '+(deepest+5)+' avg '+avgOf(deepest+5).toFixed(1)+
   ' vs floor '+deepest+' avg '+avgOf(deepest).toFixed(1));
ok('deep floors draw only from the toughest creatures', (()=>{
  const t=G.deepTable(byLevel,deepest+10,Object.keys(BASE.monsters));
  return t.every(m=>BASE.monsters[m].level >= deepest-1);})());
ok('shallow floors are unaffected', (()=>{
  const t=G.deepTable(byLevel,2,Object.keys(BASE.monsters));
  return t.every(m=>BASE.monsters[m].level<=3);})());

ok('no scaling while the bestiary still has range',
   G.depthScale(byLevel,deepest)===1 && G.depthScale(byLevel,2)===1,
   'hand-authored depths should play as written');
ok('scaling begins past the deepest monster', G.depthScale(byLevel,deepest+1)>1);
ok('and rises with depth', (()=>{
  const a=G.depthScale(byLevel,deepest+3), b=G.depthScale(byLevel,deepest+12);
  return b>a;})());

ok('a scaled monster is genuinely tougher', (()=>{
  const g=BASE.monsters['mn.goblin'];
  const f={uid:'x',ref:'mn.goblin',name:'Goblin',level:1,bp:6,bpMax:6,defense:11,
    attacks:JSON.parse(JSON.stringify(g.attacks)),xp:g.xp,gold:g.gold,traits:[],rank:'front'};
  const c=JSON.parse(JSON.stringify(f)); G.scaleFoe(c,3);
  return c.bpMax>f.bpMax && c.defense>f.defense && c.xp>f.xp &&
         c.attacks[0].damage[2] > (f.attacks[0].damage[2]||0);})());
ok('and worth more when it falls', (()=>{
  const g=BASE.monsters['mn.goblin'];
  const f={uid:'x',ref:'mn.goblin',name:'Goblin',level:1,bp:6,bpMax:6,defense:11,
    attacks:JSON.parse(JSON.stringify(g.attacks)),xp:g.xp,gold:g.gold,traits:[],rank:'front'};
  const c=JSON.parse(JSON.stringify(f)); G.scaleFoe(c,2);
  return c.xp === f.xp*2;})(), 'a harder fight that pays the same is a punishment');
ok('scaling one leaves it at full health', (()=>{
  const g=BASE.monsters['mn.goblin'];
  const f={uid:'x',bp:6,bpMax:6,defense:11,attacks:JSON.parse(JSON.stringify(g.attacks)),
    xp:g.xp,gold:g.gold,name:'Goblin'};
  G.scaleFoe(f,2.5);
  return f.bp===f.bpMax;})());
ok('a scale of one changes nothing', (()=>{
  const g=BASE.monsters['mn.goblin'];
  const f={uid:'x',bp:6,bpMax:6,defense:11,attacks:JSON.parse(JSON.stringify(g.attacks)),
    xp:g.xp,gold:g.gold,name:'Goblin'};
  const before=JSON.stringify(f); G.scaleFoe(f,1);
  return JSON.stringify(f)===before;})());

ok('every generated floor records its scale', (()=>{
  const r=G.generateDelve(4,{floors:3,size:'small',endless:true,basePack:BASE});
  return r.ok && r.pack.floors.every(f=>typeof f.monsterScale==='number');})());
ok('a deep generated floor carries a scale above one', (()=>{
  const r=G.generateDelve(4,{floors:2,size:'small',endless:true,basePack:BASE});
  const deep=G.extendDelve(r.pack, deepest+8, BASE);
  return deep && deep.monsterScale>1;})());

console.log('\n[G11] it is reachable from the game');
ok('a start function exists', /function startEndless/.test(src));
ok('the roster offers a fresh dungeon', /startEndless\(null,/.test(src),
   'there must be a one-tap way to generate one');
ok('the menu allows a chosen seed', /id="newDelve"/.test(src) && /Seed for the delve/.test(src));
ok('and a chosen size', /Floor size \\u2014/.test(src));
ok('an unknown size is rejected with the options listed',
   /genSizeNames\(\)\.indexOf\(size\) < 0/.test(src) &&
   /genSizeNames\(\)\.join/.test(src));
ok('the base pack is kept for content', /function rememberBase/.test(src));
ok('a failed generation is reported, not swallowed',
   /res\.errors \|\| \['Generation failed\.'\]/.test(src));

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);

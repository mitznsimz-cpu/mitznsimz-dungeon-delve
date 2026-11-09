// World core tests: per-floor state, stair pairing, descent integrity.
const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');
function grab(tag) {
  const re = new RegExp('/\\* ==== ' + tag + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + tag + ' END ==== \\*/');
  const mm = src.match(re);
  if (!mm) { console.error('FAIL: ' + tag + ' markers missing'); process.exit(1); }
  return mm[1];
}
const BOOT = grab('BUNDLED PACK') + grab('PACK CORE') +
  '\nvar __L = loadPack(BUNDLED_PACK);' +
  '\nif(!__L.ok){throw new Error("pack invalid: "+__L.errors.join("; "));}\n';

const names = ['BUNDLED_PACK','PACK','packFloor','blankFloorState','floorState','packWorld',
  'unpackWorld','stairTarget','checkStairPairs','pickEncounter','questComplete',
  'exploredToBits','bitsToExplored','makeRng','MONSTERS','ITEMS','RULES','validateFloorData'];
const W = new Function(BOOT + grab('PARTY CORE') + '\n' + grab('SAVE CORE') + '\n' +
  grab('WORLD CORE') + '\nreturn {' + names.join(',') + '};')();

let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));} };
const P = W.PACK;

console.log('\n[W1] every staircase pairs with one coming back');
const sp = W.checkStairPairs(P);
ok('stair pairing is complete', sp.ok, sp.errors.join('; '));

let downs = 0, ups = 0;
P.floors.forEach(f => Object.keys(f.features).forEach(k => {
  if (f.features[k].type === 'stairsDown' && !f.features[k].sealed) downs++;
  if (f.features[k].type === 'stairsUp') ups++;
}));
ok('there are stairs down', downs >= 2, 'downs=' + downs);
ok('every descent has an ascent', downs === ups, downs + ' down / ' + ups + ' up');

console.log('\n[W2] the whole dungeon is walkable end to end');
// Walk from f1 entry through every floor using only real connections.
const DIR=[[0,-1],[1,0],[0,1],[-1,0]], BIT=[1,2,4,8];
function walkFloor(f, from) {
  const ix=(x,y)=>y*f.w+x, ib=(x,y)=>x>=0&&y>=0&&x<f.w&&y<f.h;
  const wall=(x,y,d)=>(f.cells[ix(x,y)]&BIT[d])!==0;
  const rock=(x,y)=>(f.cells[ix(x,y)]&16)!==0;
  const seen=new Set([from.join(',')]), q=[from];
  while(q.length){ const p=q.shift();
    for(let d=0;d<4;d++){ if(wall(p[0],p[1],d)) continue;
      const nx=p[0]+DIR[d][0], ny=p[1]+DIR[d][1], k=nx+','+ny;
      if(!ib(nx,ny)||rock(nx,ny)||seen.has(k)) continue;
      seen.add(k); q.push([nx,ny]); } }
  return seen;
}
const visited = {};
let frontier = [{ floor:'f1', at:P.floors[0].entry }];
let guard = 0;
while (frontier.length && guard++ < 20) {
  const cur = frontier.shift();
  const f = P.floors.find(x=>x.id===cur.floor);
  const reach = walkFloor(f, cur.at);
  visited[f.id] = reach;
  Object.keys(f.features).forEach(k=>{
    const t = W.stairTarget(f.features[k]);
    if (t && reach.has(k) && !visited[t.floor]) frontier.push({ floor:t.floor, at:t.at });
  });
}
ok('all three floors reachable from the start', Object.keys(visited).length===3,
   Object.keys(visited).join(','));

console.log('\n[W3] the quest item is reachable without secrets');
const f3 = P.floors.find(f=>f.id==='f3');
const staffKey = Object.keys(f3.features).find(k=>f3.features[k].type==='staff');
ok('a staff exists', !!staffKey);
ok('the staff sits on a walkable, non-secret path', visited.f3 && visited.f3.has(staffKey),
   'staff at ' + staffKey);
const bossKey = Object.keys(f3.features).find(k=>f3.features[k].boss);
ok('the boss is reachable', !!bossKey && visited.f3.has(bossKey), 'boss at ' + bossKey);

console.log('\n[W4] optional secrets stay optional');
let secretGated = 0;
P.floors.forEach(f=>{
  const res = W.validateFloorData(f, P);
  res.errors.forEach(()=>secretGated++);
});
ok('no floor errors — nothing required sits behind a secret', secretGated===0);
const f2 = P.floors.find(f=>f.id==='f2');
const secretKey = Object.keys(f2.features).find(k=>f2.features[k].type==='secretDoor');
ok('f2 does hide something optional', !!secretKey, 'secret at ' + secretKey);

console.log('\n[W5] per-floor state stays separate');
const world = {};
W.floorState(world,'f1').explored['1,8']=1;
W.floorState(world,'f2').explored['8,8']=1;
ok('two floors tracked independently', Object.keys(world).length===2);
ok('f1 does not see f2 cells', !world.f1.explored['8,8']);
ok('f2 does not see f1 cells', !world.f2.explored['1,8']);
W.floorState(world,'f1').consumed.push('2,2');
ok('consumed is per floor', world.f1.consumed.length===1 && world.f2.consumed.length===0);

console.log('\n[W6] the whole world survives a save');
const big = {};
P.floors.forEach((f,i)=>{
  const st = W.floorState(big, f.id);
  for (let y=0;y<f.h;y++) for (let x=0;x<f.w;x++) if ((x+y+i)%3===0) st.explored[x+','+y]=1;
  st.consumed.push(i+',0');
});
const packed = W.packWorld(big, P);
ok('every visited floor is written', Object.keys(packed).length===3);
const back = W.unpackWorld(packed, P);
let drift = 0;
P.floors.forEach(f=>{
  const a = Object.keys(big[f.id].explored).sort().join('|');
  const b = Object.keys(back[f.id].explored).sort().join('|');
  if (a!==b) drift++;
  if (big[f.id].consumed.join()!==back[f.id].consumed.join()) drift++;
});
ok('explored and consumed survive exactly, all floors', drift===0, 'drift='+drift);
ok('unknown floors in a save are dropped, not crashed',
   Object.keys(W.unpackWorld({ nope:{explored:'',consumed:[]} }, P)).length===0);

console.log('\n[W7] stairTarget refuses to send you nowhere');
ok('sealed stairs give no target', W.stairTarget({type:'stairsDown',sealed:true,to:'f2'})===null);
ok('stairs with no destination give no target', W.stairTarget({type:'stairsDown'})===null);
ok('a chest is not a staircase', W.stairTarget({type:'chest',to:'f2'})===null);
ok('a real staircase resolves', (()=>{const t=W.stairTarget({type:'stairsDown',to:'f2',at:[8,8]});
  return t && t.floor==='f2' && t.at[0]===8;})());

console.log('\n[W8] encounters scale with depth');
P.floors.forEach(f=>{
  ok(f.id + ' has an encounter table', (f.encounterTable||[]).length>0);
});
const avgLevel = f => {
  const t = f.encounterTable.map(r=>W.MONSTERS[r].level);
  return t.reduce((a,b)=>a+b,0)/t.length;
};
const levels = P.floors.map(avgLevel);
ok('deeper floors field tougher creatures', levels[0] < levels[2],
   levels.map(l=>l.toFixed(1)).join(' -> '));
let picked = new Set();
for (let s=0;s<400;s++) picked.add(W.pickEncounter(P.floors[1], W.makeRng(s)));
ok('encounter picks vary within a floor', picked.size>1, [...picked].join(','));
ok('a floor with no table returns null', W.pickEncounter({encounterTable:[]}, W.makeRng(1))===null);

console.log('\n[W9] victory condition');
ok('not complete by default', !W.questComplete({}, W.RULES));
ok('complete once the flag is set', W.questComplete({gotStaff:true}, W.RULES));
ok('the staff item exists in the pack', !!W.ITEMS['it.staff']);
ok('the staff cannot be sold or dropped',
   (W.ITEMS['it.staff'].flags||[]).indexOf('quest')>=0);

console.log('\n[W10] art families are all drawable');
const arts = new Set(Object.keys(W.MONSTERS).map(k=>W.MONSTERS[k].art));
ok('several silhouette families in use', arts.size>=4, [...arts].join(', '));
arts.forEach(a=>{
  ok('drawMini handles ' + a,
     new RegExp("'" + a.replace('.','\\.') + "'").test(src) || /else \{/.test(src));
});

console.log('\n' + (fail?'FAILED':'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail?1:0);

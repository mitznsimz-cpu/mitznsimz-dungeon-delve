// Solvability: can the adventure actually be finished, given lock order?
const fs=require('fs');
const src=fs.readFileSync('./index.html','utf8');
function grab(t){const re=new RegExp('/\\* ==== '+t+' START ==== \\*/([\\s\\S]*?)/\\* ==== '+t+' END ==== \\*/');
 const m=src.match(re); if(!m){console.error('FAIL: '+t+' missing');process.exit(1);} return m[1];}
const P=new Function(grab('TEXTURE ATLAS')+grab('BUNDLED PACK')+grab('PACK CORE')+
 '\nreturn {BUNDLED_PACK,validatePack,proveSolvable};')();

let pass=0,fail=0;
const ok=(n,c,x)=>{if(c){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));}};
const clone=o=>JSON.parse(JSON.stringify(o));
const BASE=P.BUNDLED_PACK;

console.log('\n[Q1] the shipped adventure can be finished');
const s=P.proveSolvable(BASE);
ok('it is solvable', s.ok, s.errors.join('; '));
ok('every key is obtainable', s.keys.length>=3, s.keys.join(', '));
ok('every lever is reachable', s.levers.length>=3, s.levers.join(', '));
ok('it settles quickly', s.passes<=10, s.passes+' passes');
ok('no floor is stranded', !s.warnings.some(w=>/never entered/.test(w)), s.warnings.join('; '));

console.log('\n[Q2] a key behind its own door is caught');
const dead=clone(BASE);
(function(){
  const f=dead.floors[0];
  const dk=Object.keys(f.features).find(k=>f.features[k].type==='door'&&f.features[k].locked);
  const keyId=f.features[dk].keyId;
  // remove the key from where it was, and put it beyond the door it opens
  Object.keys(f.features).forEach(k=>{
    if(f.features[k].type==='chest'&&f.features[k].item===keyId) delete f.features[k].item;
  });
  const deep=dead.floors[2];
  const dc=Object.keys(deep.features).find(k=>deep.features[k].type==='chest');
  deep.features[dc].item=keyId;
})();
const dr=P.proveSolvable(dead);
ok('the deadlock is detected', !dr.ok, 'a key behind its own door went unnoticed');
ok('it names the door', dr.errors.some(e=>/needs "/.test(e)), dr.errors[0]);
ok('validatePack refuses it too', !P.validatePack(dead).ok);

console.log('\n[Q3] the old check would have missed it');
// The superseded rule only asked whether a key existed anywhere in the pack.
const keyStillPresent = dead.floors.some(f=>Object.keys(f.features)
  .some(k=>f.features[k].type==='chest'&&f.features[k].item&&/key/.test(f.features[k].item)));
ok('the key is still somewhere in the pack', keyStillPresent,
   'which is exactly why existence alone proves nothing');
ok('but the adventure is unfinishable', !dr.ok);

console.log('\n[Q4] secrets can never be load-bearing');
const secret=clone(BASE);
(function(){
  const f=secret.floors[0];
  const stair=Object.keys(f.features).find(k=>f.features[k].type==='stairsDown');
  const [sx,sy]=stair.split(',').map(Number), W=f.w;
  const DIR=[[0,-1],[1,0],[0,1],[-1,0]],BIT=[1,2,4,8];
  // wall the stairs off except one way in, then make that way a secret
  const open=[];
  for(let d=0;d<4;d++) if(!(f.cells[sy*W+sx]&BIT[d])) open.push({d,x:sx+DIR[d][0],y:sy+DIR[d][1]});
  open.slice(1).forEach(n=>{ f.cells[sy*W+sx]|=BIT[n.d]; f.cells[n.y*W+n.x]|=BIT[(n.d+2)%4]; });
  if(open[0]) f.features[open[0].x+','+open[0].y]={type:'secretDoor'};
})();
const sr=P.proveSolvable(secret);
ok('stairs reachable only through a secret are refused', !sr.ok, sr.errors.join('; '));
ok('optional secrets stay fine', P.proveSolvable(BASE).ok);

console.log('\n[Q5] a lever nobody can reach is reported');
const lev=clone(BASE);
(function(){
  const f=lev.floors[0];
  const lk=Object.keys(f.features).find(k=>f.features[k].type==='lever');
  const id=f.features[lk].id;
  delete f.features[lk];                       // the gate now waits forever
  lev.floors.forEach(fl=>Object.keys(fl.features).forEach(k=>{
    if(fl.features[k].needsLever===id) fl.features[k].__keep=1; }));
})();
const lr=P.proveSolvable(lev);
ok('an unreachable lever is flagged', lr.warnings.some(w=>/waits on lever/.test(w)),
   lr.warnings.join('; '));
ok('but it is a warning, not a failure', lr.ok,
   'a lever gating optional loot should not block the adventure');

console.log('\n[Q6] an unreachable goal is fatal');
const goal=clone(BASE);
(function(){
  const f=goal.floors[2], W=f.w;
  const gk=Object.keys(f.features).find(k=>f.features[k].type==='staff');
  const [gx,gy]=gk.split(',').map(Number);
  for(let d=0;d<4;d++){
    f.cells[gy*W+gx]|=[1,2,4,8][d];
    const nx=gx+[[0,-1],[1,0],[0,1],[-1,0]][d][0], ny=gy+[[0,-1],[1,0],[0,1],[-1,0]][d][1];
    if(nx>=0&&ny>=0&&nx<f.w&&ny<f.h) f.cells[ny*W+nx]|=[4,8,1,2][d];
  }
})();
const gr=P.proveSolvable(goal);
ok('walling in the goal is caught', !gr.ok, gr.errors.join('; '));
ok('it says so plainly', gr.errors.some(e=>/goal/.test(e)), gr.errors[0]);

console.log('\n[Q7] the prover terminates on hostile input');
ok('a pack with no features still resolves', (()=>{
  const b=clone(BASE); b.floors.forEach(f=>{f.features={};});
  const r=P.proveSolvable(b); return typeof r.ok==='boolean';})());
ok('circular stairs do not loop forever', (()=>{
  const b=clone(BASE);
  b.floors[0].features['1,1']={type:'stairsDown',to:'f2',at:[1,1]};
  b.floors[1].features['1,1']={type:'stairsUp',to:'f1',at:[1,1]};
  const r=P.proveSolvable(b); return r.passes<40;})());
ok('a pack of one floor is fine', (()=>{
  const b=clone(BASE); b.floors=[b.floors[0]];
  b.floors[0].features['10,1']={type:'stairsDown',sealed:true};
  return typeof P.proveSolvable(b).ok==='boolean';})());

console.log('\n[Q8] snapshots exist and carry what matters');
ok('a debug snapshot builder exists', /function debugSnapshot/.test(src));
ok('it records the seeds', /seeds: \{ world: worldSeed, action: actionRng\.state\(\) \}/.test(src));
ok('it records where you are', /where: \{ floor: floor\.id/.test(src));
ok('it records the whole party', /party: party\.map/.test(src));
ok('it records per-floor world state', /secretsFound:/.test(src));
ok('it records combat if a fight is open', /inCombat: cst \?/.test(src));
ok('it runs the solvability proof into the file', /solvable: \{ ok: solve\.ok/.test(src));
ok('a floor exporter exists', /function floorSnapshot/.test(src));
ok('the floor export is pack-shaped', /floor: JSON\.parse\(JSON\.stringify\(f\)\)/.test(src));
ok('both are reachable from the menu', /id="dumpState"/.test(src) && /id="dumpFloor"/.test(src));
ok('and a snapshot has a shortcut', /k === 'p' && party\.length/.test(src));

console.log('\n' + (fail?'FAILED':'PASSED') + ' — '+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);

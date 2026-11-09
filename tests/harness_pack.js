// Pack core tests: the validator must refuse packs that would strand a player.
const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');
function grab(tag) {
  const re = new RegExp('/\\* ==== ' + tag + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + tag + ' END ==== \\*/');
  const mm = src.match(re);
  if (!mm) { console.error('FAIL: ' + tag + ' markers missing'); process.exit(1); }
  return mm[1];
}
const K = new Function(grab('BUNDLED PACK') + grab('PACK CORE') +
  '\nreturn {BUNDLED_PACK,loadPack,validatePack,validateFloorData,packFloor,PACK_FORMAT,STATS};')();

let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));} };
const clone = o => JSON.parse(JSON.stringify(o));
const BASE = K.BUNDLED_PACK;

console.log('\n[K1] the bundled pack is valid');
const v = K.validatePack(BASE);
ok('validates clean', v.ok, v.errors.join('; '));
// Warnings are expected where a pack deliberately hides an optional pocket.
ok('only expected warnings', v.warnings.every(w=>/reachable only via secrets/.test(w)),
   v.warnings.join('; '));
ok('every floor is present', BASE.floors.length===3, String(BASE.floors.length));
ok('loads and binds', K.loadPack(clone(BASE)).ok);

console.log('\n[K1b] nothing borrowed from the source material');
// Dark Designs is the inspiration, not a source of assets. Names lifted from it
// have no place in a pack that ships.
const BORROWED = ['Grelminar', 'Dark Designs', 'Softdisk', 'Catacomb'];
const packText = JSON.stringify(BASE);
BORROWED.forEach(word => {
  ok('the pack does not use "' + word + '"',
     packText.toLowerCase().indexOf(word.toLowerCase()) < 0,
     'found in the shipped pack — rename it');
});
ok('the adventure has a name of its own', /^[A-Za-z' ]+$/.test(BASE.name) && BASE.name.length > 5,
   BASE.name);

console.log('\n[K2] the engine really is empty without a pack');
ok('no monsters hardcoded outside the pack',
   !/var MONSTERS = \{\s*'mn\./.test(src), 'MONSTERS literal still in a core block');
ok('no items hardcoded outside the pack',
   !/var ITEMS = \{\s*'it\./.test(src), 'ITEMS literal still in a core block');
ok('no spells hardcoded outside the pack',
   !/var SPELLS = \{\s*'sp\./.test(src), 'SPELLS literal still in a core block');
ok('no classes hardcoded outside the pack',
   !/var CLASSES = \{\s*\n\s*fighter:/.test(src), 'CLASSES literal still in a core block');
ok('no xp curve hardcoded outside the pack',
   !/var XP_TABLE = \[0, \d\d/.test(src), 'XP_TABLE literal still in a core block');

console.log('\n[K3] structural refusals');
const bad = (mut, label, expect) => {
  const p = clone(BASE); mut(p);
  const r = K.validatePack(p);
  ok(label, !r.ok && (!expect || r.errors.some(e=>expect.test(e))),
     r.ok ? 'accepted a broken pack' : r.errors.join('; '));
};
bad(p=>{p.packFormat=99;}, 'wrong pack format refused', /format/);
bad(p=>{delete p.floors;}, 'no floors refused', /floors/);
bad(p=>{delete p.classes;}, 'no classes refused', /classes/);
bad(p=>{p.shopStock.push('it.nonsense');}, 'shop stocking a ghost item refused', /unknown item/);
bad(p=>{p.spells['sp.bolt1'].list='druid';}, 'spell for a class that does not exist refused', /no class casts/);
bad(p=>{ Object.keys(p.spells).forEach(k=>{ if(p.spells[k].list==='priest'&&p.spells[k].tier===1) delete p.spells[k]; }); },
    'caster class with no tier-1 spell refused', /tier-1/);
bad(p=>{p.monsters['mn.goblin'].attacks=[];}, 'monster with no attacks refused', /no attacks/);
bad(p=>{delete p.monsters['mn.goblin'].xp;}, 'monster awarding no xp refused', /no xp/);
bad(p=>{p.rules.xpTable=[0,500,300];}, 'descending xp curve refused', /ascending/);
bad(p=>{p.floors[0].encounterTable=['mn.ghost'];}, 'encounter table naming a ghost refused', /unknown monster/);
bad(p=>{ const f=p.floors[0];
   const k=Object.keys(f.features).find(k=>f.features[k].type==='chest');
   f.features[k].item='it.ghost'; }, 'chest with an unknown item refused', /unknown item/);
bad(p=>{ const f=p.floors[0];
   const k=Object.keys(f.features).find(k=>f.features[k].type==='stairsDown');
   f.features[k].to='f9'; }, 'stairs to nowhere refused', /unknown floor/);
bad(p=>{p.floors[0].cells=p.floors[0].cells.slice(0,50);}, 'wrong cell count refused', /cells length/);

console.log('\n[K3b] the new content rules');
bad(p=>{ const f=p.floors[0];
   const k=Object.keys(f.features).find(k=>f.features[k].type==='event'||f.features[k].type==='shrine');
   f.features[k].id='ev.nowhere'; }, 'event pointing at nothing refused', /unknown event/);
bad(p=>{ delete p.events[Object.keys(p.events)[0]].choices; }, 'event with no choices refused', /no choices/);
bad(p=>{ p.events[Object.keys(p.events)[0]].choices[0].effects=[{kind:'explode'}]; },
    'unknown effect kind refused', /unknown effect/);
bad(p=>{ p.monsters['mn.goblin'].rank='sideways'; }, 'unknown rank refused', /unknown rank/);
bad(p=>{ // remove every chest holding the key a door needs
   const need=[]; p.floors.forEach(f=>Object.keys(f.features).forEach(k=>{
     if(f.features[k].type==='door'&&f.features[k].locked) need.push(f.features[k].keyId);}));
   p.floors.forEach(f=>Object.keys(f.features).forEach(k=>{
     if(f.features[k].type==='chest'&&need.indexOf(f.features[k].item)>=0) delete f.features[k].item;}));
  }, 'a lock whose key is nowhere refused', /nowhere to be found/);
bad(p=>{ p.floors.forEach(f=>Object.keys(f.features).forEach(k=>{
     if(f.features[k].type==='lever') delete f.features[k]; })); },
    'a gate waiting on a lever that does not exist refused', /does not exist/);

console.log('\n[K4] the rule that matters: progress never needs a secret');
// Build the trap from whatever the pack contains, so this cannot go stale.
const seal = clone(BASE);
const sf = seal.floors[0], SW = sf.w;
const sIx = (x,y)=>y*SW+x;
const DIRS=[[0,-1],[1,0],[0,1],[-1,0]], BITS=[1,2,4,8];
const stairKey = Object.keys(sf.features).find(k=>sf.features[k].type==='stairsDown');
const [stx,sty] = stairKey.split(',').map(Number);

// find the stair cell's open neighbours
const nbrs = [];
for (let d=0; d<4; d++) {
  if (sf.cells[sIx(stx,sty)] & BITS[d]) continue;
  nbrs.push({ d, x: stx+DIRS[d][0], y: sty+DIRS[d][1] });
}
ok('the stairs have at least one way in', nbrs.length>0, String(nbrs.length));

// wall off every route but the first, then make that one a secret
nbrs.slice(1).forEach(n=>{
  sf.cells[sIx(stx,sty)] |= BITS[n.d];
  sf.cells[sIx(n.x,n.y)] |= BITS[(n.d+2)%4];
});
sf.features[nbrs[0].x + ',' + nbrs[0].y] = { type:'secretDoor' };

const rs = K.validatePack(seal);
ok('stairs reachable only through a secret are refused', !rs.ok &&
   rs.errors.some(e=>/cannot be reached without finding a secret/.test(e)),
   rs.ok ? 'accepted a secret-gated pack' : rs.errors.join('; '));

const optional = clone(BASE);
const of = optional.floors[0];
// a secret in a dead-end pocket is fine and must stay fine
ok('optional secrets are still accepted', K.validatePack(optional).ok);

console.log('\n[K5] floor geometry');
const gf = BASE.floors[0], GW = gf.w;
const ix = (x,y)=>y*GW+x;
const asym = clone(BASE);
asym.floors[0].cells[ix(1,5)] |= 1;
ok('asymmetric wall refused', !K.validatePack(asym).ok);
const edge = clone(BASE);
edge.floors[0].cells[ix(0,0)] &= ~16;   // make it walkable
edge.floors[0].cells[ix(0,0)] &= ~1;    // ...and remove its north wall, off the map
const er = K.validatePack(edge);
ok('open map edge refused', !er.ok && er.errors.some(e=>/open map edge/.test(e)),
   er.ok ? 'accepted a floor with a hole in the boundary' : er.errors.join('; '));
const noentry = clone(BASE);
noentry.floors[0].entry = [0,0];
ok('entry inside rock refused', !K.validatePack(noentry).ok);

console.log('\n[K6] warnings are advisory, not fatal');
const warnPack = clone(BASE);
delete warnPack.barks.stoic.chest;
const wr = K.validatePack(warnPack);
ok('missing barks warn but still load', wr.ok && wr.warnings.some(w=>/Barks missing/.test(w)),
   JSON.stringify(wr.warnings));
const noWeapon = clone(BASE);
noWeapon.shopStock = ['it.potion'];
const nw = K.validatePack(noWeapon);
ok('unarmable class warns but still loads', nw.ok && nw.warnings.some(w=>/cannot buy any weapon/.test(w)));

console.log('\n[K7] packFloor hands back a copy, not the pack');
K.loadPack(clone(BASE));
const fa = K.packFloor(), fb = K.packFloor();
fa.cells[0] = 999; fa.features['0,0'] = {type:'chest'};
ok('cells not shared between calls', fb.cells[0] !== 999);
ok('features not shared between calls', !fb.features['0,0']);
ok('unknown floor id returns null', K.packFloor('nope')===null);

console.log('\n' + (fail?'FAILED':'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail?1:0);

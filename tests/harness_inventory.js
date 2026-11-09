// Inventory core tests: using, giving, dropping, capacity.
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

const names = ['PACK_LIMIT','packCount','packFull','partyItems','countOf','itemUsableNow','useItem',
  'giveItem','dropItem','receiveItem','suggestTarget','makeItem','itemLabel','equipItem',
  'makeRng','makeParty','grantStartingSpells','startingKit','maxBP','maxMP','applyDamage','healCharacter',
  'PACK','canUse','defense','unequipItem','normalisePositions','validatePack'];
const I = new Function(BOOT + grab('PARTY CORE') + '\n' + grab('COMBAT CORE') + '\n' +
  grab('SAVE CORE') + '\n' + grab('WORLD CORE') + '\n' + grab('EVENT CORE') + '\n' + grab('TOWN CORE') + '\n' + grab('INVENTORY CORE') +
  '\nreturn {' + names.join(',') + '};')();

let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));} };


function inv(seed){
  const rg=I.makeRng(seed||1);
  const p=I.makeParty(rg,[{name:'Pete',class:'fighter'},{name:'B',class:'fighter'},
    {name:'C',class:'priest'},{name:'D',class:'mage'}]);
  I.grantStartingSpells(p); I.startingKit(p); I.normalisePositions(p);
  return p;
}
function fresh(seed) {
  const rg = I.makeRng(seed||1);
  const p = I.makeParty(rg,[{name:'Bruda',class:'fighter'},{name:'Kesh',class:'fighter'},
                            {name:'Merl',class:'mage'},{name:'Ansel',class:'priest'}]);
  I.grantStartingSpells(p); I.startingKit(p);
  return p;
}

console.log('\n[I1] using a healing draught');
const p1 = fresh(1);
p1[0].pack.push(I.makeItem('it.potion'));
I.applyDamage(p1[0], Math.floor(I.maxBP(p1[0])*0.7));
const hurt = p1[0].bp;
const r1 = I.useItem(p1, 0, 0, 0, I.makeRng(2), 'dungeon');
ok('use succeeds', r1.ok, r1.notes.join(' '));
ok('BP actually went up', p1[0].bp > hurt, hurt+' -> '+p1[0].bp);
ok('the potion is gone', p1[0].pack.length===0 && r1.consumed===true);
ok('never heals above max', p1[0].bp <= I.maxBP(p1[0]));

console.log('\n[I2] refusals leave everything untouched');
const p2 = fresh(2);
p2[0].pack.push(I.makeItem('it.potion'));
const before = p2[0].pack.length;
const rNo = I.useItem(p2, 0, 0, 0, I.makeRng(3), 'dungeon');
ok('using a potion on the unhurt is refused', !rNo.ok, rNo.notes.join(' '));
ok('the potion was not consumed', p2[0].pack.length===before);

I.applyDamage(p2[1], 9999);
p2[0].pack.push(I.makeItem('it.potion'));
const rDown = I.useItem(p2, 0, p2[0].pack.length-1, 1, I.makeRng(4), 'dungeon');
ok('a draught cannot raise the fallen', !rDown.ok && /Mitz/.test(rDown.notes.join(' ')));
ok('still not consumed', p2[0].pack.filter(i=>i.ref==='it.potion').length===2);

const rNone = I.useItem(p2, 0, 99, 0, I.makeRng(5), 'dungeon');
ok('using an empty slot is refused', !rNone.ok);
const rDead = I.useItem(p2, 1, 0, 0, I.makeRng(6), 'dungeon');
ok('a downed character cannot act', !rDead.ok);
ok('equipment is not "usable"', (()=>{
  const p=fresh(7); p[0].pack.push(I.makeItem('it.longsword'));
  return !I.useItem(p,0,0,0,I.makeRng(8),'dungeon').ok; })());

console.log('\n[I3] ether restores MP, and only to casters');
const p3 = fresh(3);
const mage = p3.findIndex(c=>c.class==='mage');
p3[mage].mp = 0;
p3[mage].pack.push(I.makeItem('it.ether'));
const r3 = I.useItem(p3, mage, 0, mage, I.makeRng(9), 'dungeon');
ok('mage recovers MP', r3.ok && p3[mage].mp>0, r3.notes.join(' '));
ok('MP never exceeds max', p3[mage].mp <= I.maxMP(p3[mage]));
const fighterIdx = p3.findIndex(c=>c.class==='fighter');
p3[fighterIdx].pack.push(I.makeItem('it.ether'));
ok('fighter cannot use ether', !I.useItem(p3, fighterIdx, 0, fighterIdx, I.makeRng(10), 'dungeon').ok);

console.log('\n[I3b] gear can be worn, taken off, and handed over');
// Every trinket was unequippable: no class listed 'trinket' in allowedTags, and
// recomputeArmor never looked at the slot even if one got there.
ok('every class may wear a trinket',
   Object.keys(I.PACK.classes).every(c=>I.PACK.classes[c].allowedTags.indexOf('trinket')>=0),
   'a ring nobody can wear is 120 gold of nothing');
ok('a trinket is usable by a fighter', (()=>{
  const p=inv(1); return I.canUse(p[0], I.makeItem('it.ring.ward'));})());
ok('wearing one actually changes defence', (()=>{
  const p=inv(2); I.receiveItem(p,0,I.makeItem('it.ring.ward'));
  const i=p[0].pack.findIndex(x=>x.ref==='it.ring.ward');
  const b=I.defense(p[0]); I.equipItem(p[0],i);
  return I.defense(p[0])>b;})(), 'recomputeArmor skipped the trinket slot entirely');
ok('the bonus goes away again when removed', (()=>{
  const p=inv(3); I.receiveItem(p,0,I.makeItem('it.ring.ward'));
  const i=p[0].pack.findIndex(x=>x.ref==='it.ring.ward');
  const b=I.defense(p[0]); I.equipItem(p[0],i); I.unequipItem(p[0],'trinket');
  return I.defense(p[0])===b;})());

ok('there is a way to take gear off', typeof I.unequipItem==='function');
ok('what comes off goes into the pack', (()=>{
  const p=inv(4); const n=p[0].pack.length;
  const r=I.unequipItem(p[0],'weapon');
  return r.ok && p[0].pack.length===n+1 && !p[0].equipped.weapon;})());
ok('an empty slot is refused', (()=>{
  const p=inv(5); p[0].equipped.trinket=null;
  return !I.unequipItem(p[0],'trinket').ok;})());

ok('items can be handed between characters', typeof I.giveItem==='function');
ok('the item moves', (()=>{
  const p=inv(6); I.receiveItem(p,0,I.makeItem('it.potion'));
  const i=p[0].pack.findIndex(x=>x.ref==='it.potion');
  const before=p[3].pack.length;
  const r=I.giveItem(p,0,i,3);
  return r.ok && p[3].pack.length===before+1;})());
ok('a full pack refuses it', (()=>{
  const p=inv(7);
  while(!I.packFull(p[3])) p[3].pack.push(I.makeItem('it.potion'));
  I.receiveItem(p,0,I.makeItem('it.torch'));
  const i=p[0].pack.findIndex(x=>x.ref==='it.torch');
  return !I.giveItem(p,0,i,3).ok;})());
ok('handing to yourself is refused', (()=>{
  const p=inv(8); I.receiveItem(p,0,I.makeItem('it.potion'));
  const i=p[0].pack.findIndex(x=>x.ref==='it.potion');
  return !I.giveItem(p,0,i,0).ok;})());
ok('you may carry what you cannot use', (()=>{
  const p=inv(9); I.receiveItem(p,0,I.makeItem('it.longsword'));
  const i=p[0].pack.findIndex(x=>x.ref==='it.longsword');
  const r=I.giveItem(p,0,i,3);
  return r.ok && p[3].pack.some(x=>x.ref==='it.longsword') && !I.canUse(p[3],p[3].pack[p[3].pack.length-1]);})(),
  'a mage should be able to ferry a sword back to town');

console.log('\n[I3c] you can tell what an item is');
ok('every item has a description',
   Object.values(I.PACK.items).every(x=>x.desc && x.desc.length>4),
   Object.values(I.PACK.items).filter(x=>!x.desc).map(x=>x.id).join(', '));
ok('the validator warns when one has none', (()=>{
  const b=JSON.parse(JSON.stringify(I.PACK));
  delete b.items['it.potion'].desc;
  const r=I.validatePack(b);
  return r.warnings.some(w=>/no description/.test(w));})());
ok('the magic potion says what it does',
   /magic/i.test(I.PACK.items['it.ether'].desc),
   'it is called Clear Ether, which tells a new player nothing');
ok('and its name hints at it too', /magic/i.test(I.PACK.items['it.ether'].name));

console.log('\n[I4] 20,000 random uses stay in bounds');
let oob=0;
for (let s=0;s<2000;s++){
  const p=fresh(s); const rg=I.makeRng(s+500);
  p.forEach(c=>{ c.pack.push(I.makeItem('it.potion')); c.pack.push(I.makeItem('it.ether')); });
  for (let i=0;i<10;i++){
    const u=Math.floor(rg()*4), t=Math.floor(rg()*4);
    if (rg()<0.5) I.applyDamage(p[t], Math.floor(rg()*20));
    if (p[u].pack.length) I.useItem(p, u, Math.floor(rg()*p[u].pack.length), t, rg, 'dungeon');
    p.forEach(c=>{ if(c.bp<0||c.bp>I.maxBP(c)||c.mp<0||c.mp>I.maxMP(c)||Number.isNaN(c.bp)) oob++; });
  }
}
ok('BP and MP never leave range', oob===0, 'oob='+oob);

console.log('\n[I5] carrying capacity');
const p5 = fresh(5);
for (let i=0;i<I.PACK_LIMIT;i++) p5[0].pack.push(I.makeItem('it.potion'));
ok('pack reports full', I.packFull(p5[0]));
ok('giving to a full pack is refused', !I.giveItem(p5, 1, 0, 0).ok ||
   p5[1].pack.length===0, 'expected refusal');
const rr = I.receiveItem(p5, 0, I.makeItem('it.potion'));
ok('loot overflows to someone with room', rr.ok && rr.taker!==p5[0].name, rr.taker);
p5.forEach(c=>{ while(!I.packFull(c)) c.pack.push(I.makeItem('it.potion')); });
ok('loot refused when the whole party is full', !I.receiveItem(p5, 0, I.makeItem('it.potion')).ok);

console.log('\n[I6] giving and dropping');
const p6 = fresh(6);
p6[0].pack.push(I.makeItem('it.potion'));
const g = I.giveItem(p6, 0, 0, 2);
ok('give moves the item', g.ok && p6[0].pack.length===0 && p6[2].pack.length===1);
ok('total item count is conserved', I.partyItems(p6).length===1);
ok('giving to yourself is refused', !I.giveItem(p6, 2, 0, 2).ok);
ok('giving from an empty slot is refused', !I.giveItem(p6, 0, 0, 1).ok);
const d = I.dropItem(p6, 2, 0);
ok('drop removes it', d.ok && I.partyItems(p6).length===0);
ok('quest items cannot be dropped', (()=>{
  const p=fresh(11); const q=I.makeItem('it.potion'); q.flags=['quest'];
  p[0].pack.push(q); return !I.dropItem(p,0,0).ok; })());

console.log('\n[I7] target suggestion picks the neediest');
const p7 = fresh(7);
I.applyDamage(p7[2], Math.floor(I.maxBP(p7[2])*0.8));
ok('heal suggests the most hurt', I.suggestTarget(p7, I.makeItem('it.potion'))===2);
p7.forEach(c=>{ if(I.maxMP(c)) c.mp=I.maxMP(c); });
const caster = p7.findIndex(c=>I.maxMP(c)>0);
p7[caster].mp = 0;
ok('ether suggests the emptiest caster', I.suggestTarget(p7, I.makeItem('it.ether'))===caster);
ok('a non-consumable suggests slot 0', I.suggestTarget(p7, I.makeItem('it.longsword'))===0);

console.log('\n[I8] combat vs dungeon context');
ok('draughts work in combat', I.itemUsableNow(I.makeItem('it.potion'), 'combat'));
ok('ether works in combat', I.itemUsableNow(I.makeItem('it.ether'), 'combat'));
ok('a sword is never "usable"', !I.itemUsableNow(I.makeItem('it.longsword'), 'combat'));

console.log('\n[I9] countOf across the whole party');
const p9 = fresh(9);
p9[0].pack.push(I.makeItem('it.potion'));
p9[2].pack.push(I.makeItem('it.potion'));
p9[3].pack.push(I.makeItem('it.ether'));
ok('counts potions across characters', I.countOf(p9,'it.potion')===2);
ok('counts ether', I.countOf(p9,'it.ether')===1);
ok('counts nothing correctly', I.countOf(p9,'it.longsword')===0);

console.log('\n' + (fail?'FAILED':'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail?1:0);

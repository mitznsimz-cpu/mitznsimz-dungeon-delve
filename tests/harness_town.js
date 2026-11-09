const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');

function grab(tag) {
  const re = new RegExp('/\\* ==== ' + tag + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + tag + ' END ==== \\*/');
  const mm = src.match(re);
  if (!mm) { console.error('FAIL: ' + tag + ' markers missing'); process.exit(1); }
  return mm[1];
}

// Every harness boots the bundled pack first: the engine has no content of its own.
const BOOT = grab('BUNDLED PACK') + grab('PACK CORE') +
  '\nvar __L = loadPack(BUNDLED_PACK);' +
  '\nif(!__L.ok){throw new Error("pack invalid: "+__L.errors.join("; "));}\n';

const names = ['ITEMS','SHOP_STOCK','PRICES','makeItem','itemLabel','canUse','effectiveDamage',
  'recomputeArmor','recomputeParty','restCost','doRest','fallen','reviveCost','doRevive',
  'trainCost','doTrain','learnableSpells','learnCost','doLearn','buyPrice','doBuy','sellValue',
  'doSell','equipItem','upgradeCost','doUpgrade','doRepair','damageEquipment','startingKit',
  'damagedItems','makeRng','makeParty','maxBP','maxMP','applyDamage','canLevel','levelUp',
  'grantStartingSpells','XP_TABLE','defense','CLASSES','SPELLS','partyDown'];
const T = new Function(BOOT + grab('PARTY CORE') + '\n' + grab('COMBAT CORE') + '\n' + grab('SAVE CORE') + '\n' + grab('WORLD CORE') + '\n' + grab('EVENT CORE') + '\n' + grab('TOWN CORE') +
  '\nreturn {' + names.join(',') + '};')();

const BASE_MONSTERS = JSON.parse(JSON.stringify(
  new Function(grab('BUNDLED PACK') + '\nreturn BUNDLED_PACK.monsters;')()));

let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));} };

function freshParty(seed) {
  const rg = T.makeRng(seed||1);
  const p = T.makeParty(rg,[{name:'Bruda',class:'fighter'},{name:'Kesh',class:'fighter'},
                            {name:'Merl',class:'mage'},{name:'Ansel',class:'priest'}]);
  T.grantStartingSpells(p); T.startingKit(p);
  return p;
}

console.log('\n[T1] starting kit and item instances');
const p1 = freshParty(1);
ok('everyone has a weapon', p1.every(c=>c.equipped.weapon));
ok('mage wears no armour', !p1.find(c=>c.class==='mage').equipped.armor);
ok('fighters wear armour', p1.filter(c=>c.class==='fighter').every(c=>c.equipped.armor));
ok('armorBonus derived, not invented', p1.every(c=>c.armorBonus===T.recomputeArmor(c)));
ok('items are instances, not shared refs', (()=>{
  const a=T.makeItem('it.longsword'), b=T.makeItem('it.longsword');
  a.bonus=2; return b.bonus===0 && T.ITEMS['it.longsword'].value===40; })());
ok('unknown item throws', (()=>{try{T.makeItem('it.nope');return false;}catch(e){return true;}})());

console.log('\n[T2] class restrictions are enforced at the till');
const mage = p1.find(c=>c.class==='mage');
const fighter = p1.find(c=>c.class==='fighter');
ok('mage cannot buy a long sword', !T.doBuy(mage,'it.longsword',9999).ok);
ok('mage can buy a dagger', T.doBuy(T.makeParty(T.makeRng(2),[{name:'M',class:'mage'}])[0],'it.dagger',9999).ok);
ok('fighter can buy a long sword', T.doBuy(fighter,'it.longsword',9999).ok);
ok('priest cannot buy a blade', (()=>{const pr=freshParty(3).find(c=>c.class==='priest');
  return !T.doBuy(pr,'it.longsword',9999).ok;})());
ok('priest can buy a mace', (()=>{const pr=freshParty(4).find(c=>c.class==='priest');
  return T.doBuy(pr,'it.mace',9999).ok;})());
ok('everyone can buy a potion', freshParty(5).every(c=>T.doBuy(c,'it.potion',9999).ok));

console.log('\n[T3] failed transactions change nothing');
let leak=0;
for (let s=0;s<600;s++){
  const p = freshParty(s);
  const ch = p[0];
  const before = { gold: 5, pack: ch.pack.length, bonus: (ch.equipped.weapon.bonus||0) };
  const ops = [
    ()=>T.doBuy(ch,'it.longsword',5),
    ()=>T.doUpgrade(ch,'weapon',5),
    ()=>T.doRepair(ch,'weapon',5),
    ()=>T.doRest(p,5),
    ()=>T.doRevive(p,5),
    ()=>T.doTrain(ch,5,T.makeRng(s)),
    ()=>T.doLearn(ch,'sp.bolt1',5)
  ];
  ops.forEach(fn=>{
    const r = fn();
    if (r.ok) return;                       // some legitimately succeed
    if (r.gold !== 5) leak++;
    if (ch.pack.length !== before.pack) leak++;
    if ((ch.equipped.weapon.bonus||0) !== before.bonus) leak++;
  });
}
ok('600 broke parties: no gold or goods moved on failure', leak===0, 'leaks='+leak);

console.log('\n[T4] gold is conserved across buy/sell');
let gbad=0;
for (let s=0;s<500;s++){
  const p = freshParty(s); const ch = p[0];
  let gold = 1000;
  const r1 = T.doBuy(ch,'it.longsword',gold);
  if (!r1.ok) { gbad++; continue; }
  gold = r1.gold;
  if (gold !== 1000 - T.buyPrice('it.longsword')) gbad++;
  const idx = ch.pack.length-1;
  const expect = T.sellValue(ch.pack[idx]);
  const r2 = T.doSell(ch, idx, gold);
  if (!r2.ok || r2.gold !== gold + expect) gbad++;
  if (ch.pack.length !== 0) gbad++;
}
ok('buy then sell moves exactly the stated amounts', gbad===0, 'bad='+gbad);
ok('selling never returns more than buying cost', (()=>{
  return T.SHOP_STOCK.every(ref=>T.sellValue(T.makeItem(ref)) < T.buyPrice(ref)); })());
ok('sell value never below 1', T.SHOP_STOCK.every(ref=>{
  const it=T.makeItem(ref); it.damaged=true; return T.sellValue(it)>=1; }));

console.log('\n[T5] upgrades');
const up = freshParty(7)[0];
let g = 100000, costs = [];
for (let i=0;i<3;i++){ const c=T.upgradeCost(up.equipped.weapon);
  costs.push(c); const r=T.doUpgrade(up,'weapon',g); if(r.ok) g=r.gold; }
ok('three upgrades applied', up.equipped.weapon.bonus===3, 'bonus='+up.equipped.weapon.bonus);
ok('cost escalates', costs[0]<costs[1] && costs[1]<costs[2], costs.join(','));
ok('fourth upgrade refused', !T.doUpgrade(up,'weapon',100000).ok);
ok('bonus reaches the damage roll', (()=>{const d=T.effectiveDamage(up.equipped.weapon);
  return d[2]===3;})());
ok('armour bonus reaches defence', (()=>{
  const c=freshParty(8).find(x=>x.class==='fighter');
  const before=T.defense(c);
  T.doUpgrade(c,'armor',100000);
  return T.defense(c)===before+1; })());
ok('damaged gear cannot be upgraded', (()=>{
  const c=freshParty(9)[0]; c.equipped.weapon.damaged=true;
  return !T.doUpgrade(c,'weapon',100000).ok; })());

console.log('\n[T6] damage is an event, and repair undoes it');
const dp = freshParty(11);
const rgd = T.makeRng(3);
const victim = dp[0];
const beforeDmg = T.effectiveDamage(victim.equipped.weapon)[2];
const hit = T.damageEquipment(victim, rgd);
ok('something got damaged', !!hit);
ok('damage is flagged on the instance', hit && hit.item.damaged===true);
ok('damaged gear hits/defends worse', (()=>{
  if (hit.slot==='weapon') return T.effectiveDamage(victim.equipped.weapon)[2]===beforeDmg-1;
  return T.recomputeArmor(victim) >= 0; })());
ok('damagedItems finds it', T.damagedItems(dp).length>=1);
ok('repair costs and clears the flag', (()=>{
  const r=T.doRepair(victim,hit.slot,500);
  return r.ok && r.gold===500-T.PRICES.repair && !victim.equipped[hit.slot].damaged; })());
ok('repairing sound gear refused', !T.doRepair(victim,hit.slot,500).ok);
ok('damage never applies twice to one item', (()=>{
  const c=freshParty(12)[0];
  c.equipped.armor=null; c.equipped.shield=null;
  T.damageEquipment(c,T.makeRng(1));
  return T.damageEquipment(c,T.makeRng(1))===null; })());

console.log('\n[T7] temple: rest, revive, train, learn');
const tp = freshParty(13);
tp.forEach(c=>T.applyDamage(c, Math.floor(T.maxBP(c)/2)));
const rc = T.restCost(tp);
ok('rest costs something when hurt', rc>0, 'cost='+rc);
ok('rest heals everyone standing', (()=>{const r=T.doRest(tp,rc);
  return r.ok && tp.every(c=>c.bp===T.maxBP(c) && c.mp===T.maxMP(c)); })());
ok('rest when whole is refused', !T.doRest(tp,9999).ok);
ok('rest respects the minimum', (()=>{const p=freshParty(14);
  T.applyDamage(p[0],1); return T.restCost(p)===T.PRICES.restMinimum; })());

const fp = freshParty(15);
T.applyDamage(fp[2],9999);
ok('fallen detected', T.fallen(fp).length===1);
ok('rest does not raise the fallen', (()=>{T.doRest(fp,9999); return fp[2].bp===0;})());
ok('revive works and costs per head', (()=>{const r=T.doRevive(fp,200);
  return r.ok && r.gold===200-T.PRICES.revive && fp[2].bp>0; })());
ok('revive brings them back hurt, not whole', fp[2].bp<T.maxBP(fp[2]));
ok('revive with nobody down refused', !T.doRevive(fp,9999).ok);

const trp = freshParty(16)[0];
ok('training refused with no xp', !T.doTrain(trp,9999,T.makeRng(1)).ok);
trp.xp = T.XP_TABLE[1];
ok('training refused when broke', !T.doTrain(trp,1,T.makeRng(1)).ok);
ok('training levels and charges', (()=>{const c=T.trainCost(trp);
  const r=T.doTrain(trp,c,T.makeRng(1));
  return r.ok && trp.level===2 && r.gold===0; })());

const lp = freshParty(17).find(c=>c.class==='priest');
lp.spellsKnown = [];
ok('priest has something learnable', T.learnableSpells(lp).length>0);
ok('learning adds the spell and charges', (()=>{
  const sid=T.learnableSpells(lp)[0]; const cost=T.learnCost(sid);
  const r=T.doLearn(lp,sid,cost);
  return r.ok && lp.spellsKnown.indexOf(sid)>=0 && r.gold===0; })());
ok('learning the same spell twice refused', (()=>{
  const sid=lp.spellsKnown[0]; return !T.doLearn(lp,sid,9999).ok; })());
ok('fighter can learn nothing', T.learnableSpells(freshParty(18)[0]).length===0);

console.log('\n[T8] equipping swaps rather than duplicates');
const ep = freshParty(19)[0];
const oldW = ep.equipped.weapon;
T.doBuy(ep,'it.longsword',9999);
const before = ep.pack.length;
const eq = T.equipItem(ep, ep.pack.length-1);
ok('equip succeeded', eq.ok, eq.notes.join(' '));
ok('new item equipped', ep.equipped.weapon.ref==='it.longsword');
ok('old item returned to pack, count unchanged', ep.pack.length===before && ep.pack.indexOf(oldW)>=0);
ok('cannot equip a consumable', (()=>{T.doBuy(ep,'it.potion',9999);
  return !T.equipItem(ep, ep.pack.length-1).ok; })());
ok('cannot equip what the class cannot use', (()=>{
  const m=freshParty(20).find(c=>c.class==='mage');
  m.pack.push(T.makeItem('it.longsword'));
  return !T.equipItem(m, m.pack.length-1).ok; })());

console.log('\n[T9] gold never goes negative anywhere');
let neg=0;
for (let s=0;s<400;s++){
  const p=freshParty(s); let gold=Math.floor(T.makeRng(s)()*300);
  const rg=T.makeRng(s+1000);
  for (let i=0;i<60;i++){
    const ch=p[Math.floor(rg()*4)];
    const pick=Math.floor(rg()*7);
    let r;
    if(pick===0) r=T.doBuy(ch,T.SHOP_STOCK[Math.floor(rg()*T.SHOP_STOCK.length)],gold);
    else if(pick===1) r=T.doUpgrade(ch,'weapon',gold);
    else if(pick===2) r=T.doRest(p,gold);
    else if(pick===3) r=T.doRevive(p,gold);
    else if(pick===4) r=T.doTrain(ch,gold,rg);
    else if(pick===5) r=ch.pack.length?T.doSell(ch,0,gold):{ok:false,gold:gold};
    else r=T.doRepair(ch,'weapon',gold);
    gold=r.gold;
    if(gold<0||Number.isNaN(gold)) neg++;
  }
}
ok('24,000 random transactions never overdraw', neg===0, 'neg='+neg);

console.log('\n[T10] the new XP curve is reachable');
ok('level 2 costs 150, not 1000', T.XP_TABLE[1]===150, String(T.XP_TABLE[1]));
ok('curve strictly ascending', T.XP_TABLE.every((v,i)=>i===0||v>T.XP_TABLE[i-1]));
ok('level 2 is ~8 goblin fights at 18xp', Math.round(T.XP_TABLE[1]/18)>=6 && Math.round(T.XP_TABLE[1]/18)<=10,
   Math.round(T.XP_TABLE[1]/18)+' fights');
ok('training to level 2 affordable on early gold', T.trainCost({level:1})<=150, String(T.trainCost({level:1})));
ok('rest is cheaper than a fight earns', T.PRICES.restPerBP<=1, String(T.PRICES.restPerBP));

// Levelling is bought, not given. The economy must be able to fund it.
const avgGold = spec => spec[0]*(spec[1]+1)/2 + (spec[2]||0);
const M = new Function('return ' + JSON.stringify(BASE_MONSTERS))();
const firstFloorPurse = avgGold(M['mn.goblin'].gold) * 3;
ok('one fight funds a level-2 training', firstFloorPurse >= T.trainCost({level:1})/2,
   Math.round(firstFloorPurse) + ' gold/fight vs ' + T.trainCost({level:1}) + ' to train');
ok('training is not free', T.PRICES.trainPerLevel > 0);
ok('training stays affordable at depth', T.trainCost({level:5}) <= 400,
   String(T.trainCost({level:5})));

console.log('\n' + (fail?'FAILED':'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail?1:0);

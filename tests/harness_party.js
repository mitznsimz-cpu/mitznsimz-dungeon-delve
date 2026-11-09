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

const names = ['STATS','CLASSES','CLASS_IDS','XP_TABLE','MAX_LEVEL','makeRng','mod','rollStats',
  'meetsMinimums','eligibleClasses','maxBP','maxMP','meleeToHit','defense','makeCharacter',
  'makeParty','levelForXp','canLevel','levelUp','awardXp','applyDamage','healCharacter',
  'partyDown','woundState','pickBark','BARKS','BARK_TRIGGERS','ARCHETYPES','exportParty',
  'importParty','xpForLevel','spellTierUnlocked'];
const P = new Function(BOOT + grab('PARTY CORE') +
  '\nreturn {' + names.join(',') + '};')();

let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));} };

console.log('\n[P1] stat rolling');
let lo=99, hi=0, n=0;
for (let s=0;s<300;s++){ const r=P.makeRng(s); const st=P.rollStats(r);
  for (const k of P.STATS){ lo=Math.min(lo,st[k]); hi=Math.max(hi,st[k]); n++; } }
ok('all stats within 7..18', lo>=7 && hi<=18, lo+'..'+hi);
ok('sampled 1500 stats', n===1500);
ok('mod clamps', P.mod(3)===-3 && P.mod(20)===3 && P.mod(10)===0);

console.log('\n[P2] determinism');
const a=JSON.stringify(P.rollStats(P.makeRng(42)));
const b=JSON.stringify(P.rollStats(P.makeRng(42)));
ok('same seed, same stats', a===b);
ok('different seed differs', a!==JSON.stringify(P.rollStats(P.makeRng(43))));

console.log('\n[P3] class minimums honoured');
let viol=0, noneEligible=0;
for (let s=0;s<400;s++){ const st=P.rollStats(P.makeRng(s));
  const el=P.eligibleClasses(st);
  if (!el.length) noneEligible++;
  for (const c of el) if (!P.meetsMinimums(st,c)) viol++; }
ok('no ineligible class returned', viol===0);
ok('rolls with zero eligible classes are rare', noneEligible/400 < 0.10, (noneEligible/4)+'%');

console.log('\n[P4] derived stats');
const r=P.makeRng(7);
const pty=P.makeParty(r,[{name:'A',class:'fighter'},{name:'B',class:'mage'},
                         {name:'C',class:'priest'},{name:'D',class:'fighter'}]);
ok('party of four', pty.length===4);
ok('everyone starts at full BP', pty.every(c=>c.bp===P.maxBP(c)));
ok('BP always >= level', pty.every(c=>P.maxBP(c)>=c.level));
ok('fighter has no MP', P.maxMP(pty[0])===0);
ok('mage has MP', P.maxMP(pty[1])>0);
ok('priest has MP', P.maxMP(pty[2])>0);

console.log('\n[P5] progression monotonic');
let bad=0, tiers=0;
for (let s=0;s<200;s++){
  const rg=P.makeRng(s);
  const ch=P.makeCharacter('T','fighter',{str:14,dex:11,con:13,int:10,pie:10});
  let prevBP=P.maxBP(ch), prevLv=ch.level;
  ch.xp=999999;
  while(P.canLevel(ch)){
    const res=P.levelUp(ch,rg);
    if(!res){bad++;break;}
    if(P.maxBP(ch)<=prevBP) bad++;
    if(ch.level!==prevLv+1) bad++;
    if(res.tier) tiers++;
    prevBP=P.maxBP(ch); prevLv=ch.level;
  }
  if(ch.level!==P.MAX_LEVEL) bad++;
}
ok('BP strictly increases each level', bad===0, 'issues='+bad);
ok('spell tiers unlock during climb', tiers>0);
ok('XP table strictly ascending', P.XP_TABLE.every((v,i)=>i===0||v>P.XP_TABLE[i-1]));
ok('cannot exceed MAX_LEVEL', (()=>{const c=P.makeCharacter('X','mage',{str:10,dex:10,con:10,int:14,pie:10});
  c.xp=1e9; const g=P.makeRng(1); let i=0; while(P.canLevel(c)&&i++<50)P.levelUp(c,g);
  return c.level===P.MAX_LEVEL;})());

console.log('\n[P6] damage & recovery never go out of bounds');
let oob=0;
const rg2=P.makeRng(9);
const p2=P.makeParty(rg2,[{name:'A',class:'fighter'},{name:'B',class:'mage'},
                          {name:'C',class:'priest'},{name:'D',class:'priest'}]);
for(let i=0;i<20000;i++){
  const c=p2[Math.floor(rg2()*4)];
  if(rg2()<0.6) P.applyDamage(c, Math.floor(rg2()*30));
  else P.healCharacter(c, Math.floor(rg2()*25));
  if(c.bp<0 || c.bp>P.maxBP(c) || Number.isNaN(c.bp)) oob++;
}
ok('BP stays in 0..maxBP across 20k ops', oob===0, 'oob='+oob);
ok('downed flagged at 0', (()=>{const c=p2[0]; P.applyDamage(c,9999);
  return c.bp===0 && c.status.indexOf('down')>=0;})());
ok('healing clears down', (()=>{const c=p2[0]; P.healCharacter(c,5);
  return c.bp>0 && c.status.indexOf('down')<0;})());
ok('partyDown detects wipe', (()=>{p2.forEach(c=>P.applyDamage(c,9999));
  return P.partyDown(p2);})());

console.log('\n[P7] barks table complete');
let missing=[];
for(const a of P.ARCHETYPES) for(const t of P.BARK_TRIGGERS){
  const l=(P.BARKS[a]||{})[t];
  if(!l||!l.length) missing.push(a+'/'+t);
}
ok('every archetype covers every trigger', missing.length===0, missing.join(' '));
ok('no bark line is empty', Object.values(P.BARKS).every(a=>Object.values(a).every(l=>l.every(s=>s&&s.length>3))));
ok('barks never fire for a wiped party', P.pickBark(p2,'chest',P.makeRng(3))===null);

console.log('\n[P8] xp award splits among the living');
const rg3=P.makeRng(11);
const p3=P.makeParty(rg3,[{name:'A',class:'fighter'},{name:'B',class:'mage'},
                          {name:'C',class:'priest'},{name:'D',class:'fighter'}]);
P.applyDamage(p3[3],9999);
const res=P.awardXp(p3,300);
ok('only living share xp', res.length===3);
ok('downed member gains none', p3[3].xp===0);
ok('living each gained 100', p3.slice(0,3).every(c=>c.xp===100));

console.log('\n[P9] export / import round trip');
const rg4=P.makeRng(21);
const p4=P.makeParty(rg4,[{name:'Merl',class:'mage'},{name:'Bruda',class:'fighter'},
                          {name:'Ansel',class:'priest'},{name:'Kesh',class:'fighter'}]);
p4.forEach(c=>{c.xp=9000; while(P.canLevel(c)) P.levelUp(c,rg4);});
const blob=P.exportParty(p4,250,'msdd.core.tapro');
const imp=P.importParty(blob,{maxLevel:P.MAX_LEVEL});
ok('import succeeds', imp.ok, imp.notes.join('; '));
ok('levels preserved', imp.party.every((c,i)=>c.level===p4[i].level));
ok('maxBP preserved', imp.party.every((c,i)=>P.maxBP(c)===P.maxBP(p4[i])));
ok('gold preserved', imp.gold===250);

const clamped=P.importParty(blob,{maxLevel:3});
ok('level clamp reported, not silent', clamped.ok && clamped.notes.length>0, JSON.stringify(clamped.notes));
ok('clamped levels applied', clamped.party.every(c=>c.level<=3));
ok('bad blob rejected', !P.importParty({exportFormat:9},{}).ok);
ok('wrong party size rejected', !P.importParty({exportFormat:1,party:[1,2]},{}).ok);

console.log('\n' + (fail?'FAILED':'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail?1:0);

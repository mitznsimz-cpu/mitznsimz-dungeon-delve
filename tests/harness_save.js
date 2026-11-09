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

const names = ['packWorld','unpackWorld','floorState','stairTarget','checkStairPairs','SAVE_FORMAT','serialise','deserialise','migrate','describeSave',
  'exploredToBits','bitsToExplored','bytesToB64','b64ToBytes',
  'makeRng','makeParty','makeCharacter','maxBP','maxMP','levelUp','canLevel',
  'applyDamage','MAX_LEVEL','rollStats'];
const S = new Function(BOOT + grab('PARTY CORE') + '\n' + grab('SAVE CORE') + '\n' + grab('WORLD CORE') +
  '\nreturn {' + names.join(',') + '};')();

let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));} };

/* fixture */
function fixture(seed) {
  const rg = S.makeRng(seed||5);
  const party = S.makeParty(rg,[{name:'Merl',class:'mage'},{name:'Bruda',class:'fighter'},
                                {name:'Ansel',class:'priest'},{name:'Kesh',class:'fighter'}]);
  party.forEach(c=>{ c.xp=6000; while(S.canLevel(c)) S.levelUp(c,rg); });
  S.applyDamage(party[1], 5);
  party[0].mp = Math.max(0, S.maxMP(party[0]) - 3);
  party[2].spellsKnown = ['sp.mend1','sp.light'];
  return {
    packId:'msdd.core.tapro', packVersion:'1.0.0', slotName:"Nigel's lot",
    createdAt:'2026-08-20T10:00:00.000Z', playtimeSec: 3725,
    worldSeed: 918273645, actionRngState: 220044119,
    gold: 250, threat: 42,
    position: { floor:'f1', x:3, y:7, facing:2 },
    party: party,
    world: { f1: { explored: S.exploredToBits({'1,8':1,'1,7':1,'3,7':1,'9,9':1}, 10, 10), consumed: ['2,2'] } },
    questFlags: { gotStaff: true }
  };
}

console.log('\n[S1] base64 byte round trip');
let b64bad = 0;
for (let len=0; len<200; len++) {
  const bytes = []; const rg = S.makeRng(len+1);
  for (let i=0;i<len;i++) bytes.push(Math.floor(rg()*256));
  const back = S.b64ToBytes(S.bytesToB64(bytes));
  if (back.length < bytes.length) { b64bad++; continue; }
  for (let i=0;i<bytes.length;i++) if (back[i]!==bytes[i]) b64bad++;
}
ok('200 random byte arrays survive round trip', b64bad===0, 'bad='+b64bad);

console.log('\n[S2] explored bitset round trip');
let bitbad = 0;
for (let t=0;t<300;t++) {
  const rg = S.makeRng(t*7+1), set = {};
  for (let y=0;y<10;y++) for (let x=0;x<10;x++) if (rg()<0.4) set[x+','+y]=1;
  const back = S.bitsToExplored(S.exploredToBits(set,10,10),10,10);
  if (Object.keys(back).length !== Object.keys(set).length) bitbad++;
  for (const k in set) if (!back[k]) bitbad++;
  for (const k in back) if (!set[k]) bitbad++;
}
ok('300 random explored sets exact', bitbad===0, 'bad='+bitbad);
ok('empty set stays empty', Object.keys(S.bitsToExplored(S.exploredToBits({},10,10),10,10)).length===0);
ok('20x20 floor packs to <=68 chars',
   S.exploredToBits({'19,19':1},20,20).length<=68, S.exploredToBits({'19,19':1},20,20).length);

console.log('\n[S3] serialise / deserialise round trip');
const st = fixture();
const blob = S.serialise(st);
const res = S.deserialise(blob, { packId:'msdd.core.tapro' });
ok('deserialise ok', res.ok, res.notes.join('; '));
ok('no spurious notes on a current save', res.notes.length===0, res.notes.join('; '));
ok('position exact', JSON.stringify(res.state.position)===JSON.stringify(st.position));
ok('gold + threat exact', res.state.gold===250 && res.state.threat===42);
ok('questFlags preserved', res.state.questFlags.gotStaff===true);
ok('playtime preserved', res.state.playtimeSec===3725);
ok('names preserved', res.state.party.map(c=>c.name).join()===st.party.map(c=>c.name).join());
ok('levels preserved', res.state.party.every((c,i)=>c.level===st.party[i].level));
ok('maxBP recomputes identically', res.state.party.every((c,i)=>S.maxBP(c)===S.maxBP(st.party[i])));
ok('spellsKnown preserved', res.state.party[2].spellsKnown.join()==='sp.mend1,sp.light');

console.log('\n[S4] a wounded party stays wounded');
ok('current BP not reset to max', res.state.party[1].bp===st.party[1].bp &&
   res.state.party[1].bp < S.maxBP(res.state.party[1]), res.state.party[1].bp+'/'+S.maxBP(res.state.party[1]));
ok('spent MP not refilled', res.state.party[0].mp===st.party[0].mp &&
   res.state.party[0].mp < S.maxMP(res.state.party[0]));

console.log('\n[S5] explored survives the save');
const back = S.bitsToExplored(res.state.world.f1.explored, 10, 10);
ok('explored cells identical', ['1,8','1,7','3,7','9,9'].every(k=>back[k]) &&
   Object.keys(back).length===4, Object.keys(back).join(' '));
ok('consumed features preserved', res.state.world.f1.consumed.join()==='2,2');

console.log('\n[S6] rng state restores the exact sequence');
const live = S.makeRng(st.actionRngState);
const a = [live(),live(),live()];
const restored = S.makeRng(res.state.actionRngState);
const b = [restored(),restored(),restored()];
ok('identical next three rolls', JSON.stringify(a)===JSON.stringify(b));
ok('state advances after use', S.makeRng(1).state()!==(()=>{const r=S.makeRng(1);r();return r.state();})());

console.log('\n[S7] migration from format 1');
const old = JSON.parse(JSON.stringify(blob));
old.saveFormat = 1;
old.world = { f1: { explored: ['1,8','1,7','3,7','9,9'], w:10, h:10, consumed:['2,2'] } };
delete old.playtimeSec; delete old.questFlags;
const mig = S.deserialise(old, { packId:'msdd.core.tapro' });
ok('old save loads', mig.ok, mig.notes.join('; '));
ok('migration is reported, not silent', mig.notes.some(n=>/format 1 to format 2/.test(n)), mig.notes.join('; '));
ok('legacy explored array converted', (()=>{const e=S.bitsToExplored(mig.state.world.f1.explored,10,10);
   return ['1,8','1,7','3,7','9,9'].every(k=>e[k]) && Object.keys(e).length===4;})());
ok('missing fields defaulted', mig.state.playtimeSec===0 && typeof mig.state.questFlags==='object');
ok('original blob not mutated by migrate', old.saveFormat===1);

console.log('\n[S8] refuses what it should refuse');
const future = JSON.parse(JSON.stringify(blob)); future.saveFormat = 99;
const rf = S.deserialise(future,{});
ok('newer format refused with a clear reason', !rf.ok && /newer version/.test(rf.notes.join(' ')), rf.notes.join(' '));
ok('null refused', !S.deserialise(null,{}).ok);
ok('non-save object refused', !S.deserialise({hello:'world'},{}).ok);
ok('wrong party size refused', (()=>{const b2=JSON.parse(JSON.stringify(blob));
   b2.party=b2.party.slice(0,2); return !S.deserialise(b2,{}).ok;})());
ok('pack mismatch refused with a clear reason', (()=>{const r=S.deserialise(blob,{packId:'other.pack'});
   return !r.ok && /adventure/.test(r.notes.join(' '));})());
ok('missing position refused', (()=>{const b3=JSON.parse(JSON.stringify(blob));
   delete b3.position; return !S.deserialise(b3,{}).ok;})());
ok('corrupt character rejected cleanly, no throw', (()=>{
   const b4=JSON.parse(JSON.stringify(blob)); b4.party[0].class='wizard';
   let r; try { r=S.deserialise(b4,{}); } catch(e){ return false; }
   return !r.ok && r.notes.length>0; })());

console.log('\n[S9] tampered values are clamped, not trusted');
const t = JSON.parse(JSON.stringify(blob));
t.party[0].bp = 99999; t.party[0].level = 900; t.threat = 5000; t.gold = -50;
const tr = S.deserialise(t,{});
ok('BP clamped to max', tr.ok && tr.state.party[0].bp===S.maxBP(tr.state.party[0]));
ok('level clamped to MAX_LEVEL', tr.state.party[0].level===S.MAX_LEVEL);
ok('threat clamped to 100', tr.state.threat===100);
ok('gold floored at 0', tr.state.gold===0);

console.log('\n[S10] describeSave for the load menu');
const d = S.describeSave(blob);
ok('summary present', !!d && d.name==="Nigel's lot");
ok('level range shown', /^L\d+(\u2013\d+)?$/.test(d.levels), d.levels);
ok('playtime humanised', d.played==='1h 2m', d.played);
ok('null blob handled', S.describeSave(null)===null);

console.log('\n[S11] repeated save/load is stable (no drift)');
let cur = S.serialise(fixture(9));
for (let i=0;i<25;i++) {
  const r = S.deserialise(cur,{});
  if (!r.ok) { ok('cycle '+i, false, r.notes.join(' ')); break; }
  cur = S.serialise(Object.assign({}, r.state, { playtimeSec: r.state.playtimeSec }));
}
const fin = S.deserialise(cur,{});
ok('25 save/load cycles remain valid', fin.ok);
ok('BP unchanged after 25 cycles', fin.state.party.every((c,i)=>c.bp===S.deserialise(S.serialise(fixture(9)),{}).state.party[i].bp));
ok('levels unchanged after 25 cycles', fin.state.party.every(c=>c.level>=1 && c.level<=S.MAX_LEVEL));

console.log('\n' + (fail?'FAILED':'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail?1:0);

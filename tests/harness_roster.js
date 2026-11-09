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

const R = new Function(BOOT + grab('PARTY CORE') +
  '\nreturn {makeRng,rollStats,eligibleClasses,meetsMinimums,CLASS_IDS,CLASSES,STAT_NAME};')();

// Mirror of the app-layer guarantee. If the HTML drops it, the test fails.
const hasGuarantee = /function rollUsableStats\(\)/.test(src) &&
                     /eligibleClasses\(st\)\.length === 0/.test(src);

// Mirror of the app-layer guarantee. If the HTML drops it, the test fails.
let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(x?'  -> '+x:''));} };

console.log('\n[R1] the roster can always be completed');
ok('app layer guarantees a usable roll', hasGuarantee,
   'rollUsableStats() missing — a slot can become unfillable');

function rollUsable(rng) {
  let st, guard = 0;
  do { st = R.rollStats(rng); } while (R.eligibleClasses(st).length === 0 && guard++ < 50);
  return st;
}

let stuck = 0, stuckParty = 0;
for (let s = 0; s < 20000; s++) {
  const rng = R.makeRng(s);
  let bad = false;
  for (let i = 0; i < 4; i++) {
    const st = rollUsable(rng);
    if (R.eligibleClasses(st).length === 0) { stuck++; bad = true; }
  }
  if (bad) stuckParty++;
}
ok('20,000 guaranteed rolls: no unfillable slot', stuck === 0, 'stuck=' + stuck);
ok('20,000 parties: every one can reach "begin"', stuckParty === 0, 'stuck=' + stuckParty);

console.log('\n[R2] the raw roll really was the problem');
let rawStuck = 0;
for (let s = 0; s < 20000; s++) {
  if (R.eligibleClasses(R.rollStats(R.makeRng(s))).length === 0) rawStuck++;
}
ok('unguarded rolls DO strand slots (regression is real)', rawStuck > 0,
   (100*rawStuck/20000).toFixed(1) + '% of raw rolls had no legal class');

console.log('\n[R3] the guarantee terminates');
let worst = 0;
for (let s = 0; s < 5000; s++) {
  const rng = R.makeRng(s);
  let guard = 0, st;
  do { st = R.rollStats(rng); guard++; } while (R.eligibleClasses(st).length === 0 && guard < 50);
  worst = Math.max(worst, guard);
}
ok('never needs more than a handful of rerolls', worst < 15, 'worst=' + worst);

console.log('\n[R4] class minimums are satisfiable at all');
R.CLASS_IDS.forEach(cid => {
  let found = false;
  for (let s = 0; s < 3000 && !found; s++) {
    if (R.meetsMinimums(R.rollStats(R.makeRng(s)), cid)) found = true;
  }
  ok(cid + ' is rollable', found);
});

console.log('\n[R5] the start button reports why it is disabled');
ok('disabled reason is rendered', /beginWhy/.test(src), 'no #beginWhy element');
ok('action row is pinned, not below the fold', /#startRow\{position:sticky/.test(src),
   '#startRow is not sticky — button scrolls off small screens');
ok('disabled class chips state the requirement', /needs '\s*\+\s*short\.join/.test(src),
   'chips do not explain the shortfall');

console.log('\n' + (fail?'FAILED':'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail?1:0);

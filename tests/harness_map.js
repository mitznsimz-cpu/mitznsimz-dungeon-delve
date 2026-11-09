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

const exportNames = ['buildFloor','validateFloor','visibleCells','canStep','hasWall',
                     'isRock','idx','inb','FWD','RIGHT','W','H','ROCK','link','MAXD','MAXO','sightChain'];
const mod = new Function(BOOT + grab('MAP CORE') +
  '\nreturn {' + exportNames.join(',') + '};')();

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
};

console.log('\n[1] floor builds');
const f = mod.buildFloor();
ok('cells length', f.cells.length === f.w * f.h, f.cells.length+' vs '+(f.w*f.h));
ok('entry is not rock', !mod.isRock(f.cells, f.entry[0], f.entry[1]));

console.log('\n[2] validator');
const v = mod.validateFloor(f);
ok('floor valid', v.ok, JSON.stringify(v.errors));
ok('open cells > 20', v.open > 20, 'open=' + v.open);
ok('all open cells reachable', v.reachable === v.open, v.reachable + '/' + v.open);

console.log('\n[3] validator catches breakage');
const broke = mod.buildFloor();
broke.cells[mod.idx(1, 5)] |= 1;              // add N wall on one side only
const vb = mod.validateFloor(broke);
ok('asymmetry detected', !vb.ok && vb.errors.some(e => /asymmetric/.test(e)));

const iso = mod.buildFloor();
for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
  if (x !== 8 || y !== 1) continue;
  iso.cells[mod.idx(x, y)] |= 1 | 2 | 4 | 8;
  const nb = [[0,-1,4],[1,0,8],[0,1,1],[-1,0,2]];
  for (const [dx,dy,bit] of nb) {
    const nx = x+dx, ny = y+dy;
    if (mod.inb(nx,ny)) iso.cells[mod.idx(nx,ny)] |= bit;
  }
}
const vi = mod.validateFloor(iso);
ok('sealed feature cell flagged', !vi.ok && vi.errors.some(e => /unreachable|not reachable/.test(e)),
   JSON.stringify(vi.errors));

console.log('\n[4] wall symmetry across whole floor');
let asym = 0;
for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
  if (mod.isRock(f.cells, x, y)) continue;
  for (let d = 0; d < 4; d++) {
    const nx = x + mod.FWD[d][0], ny = y + mod.FWD[d][1];
    if (!mod.inb(nx, ny)) continue;
    if (mod.hasWall(f.cells, x, y, d) !== mod.hasWall(f.cells, nx, ny, (d + 2) % 4)) asym++;
  }
}
ok('zero asymmetric pairs', asym === 0, 'count=' + asym);

console.log('\n[5] field of view: nothing is seen through a wall');
let bad = 0, maxCells = 0, orphan = 0;
for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
  if (mod.isRock(f.cells, x, y)) continue;
  for (let dir = 0; dir < 4; dir++) {
    const cs = mod.visibleCells(f, x, y, dir);
    maxCells = Math.max(maxCells, cs.length);
    const set = new Set(cs.map(c => c.d + ':' + c.o));
    for (const c of cs) {
      if (!mod.inb(c.x, c.y) || mod.isRock(f.cells, c.x, c.y)) bad++;
      if (c.d < 0 || c.d >= mod.MAXD || Math.abs(c.o) > mod.MAXO) bad++;
      if (c.d === 0 && c.o === 0) continue;
      // every visible cell must be lit from directly behind, or from inward
      const behind = set.has((c.d - 1) + ':' + c.o);
      const inward = c.o !== 0 && set.has(c.d + ':' + (c.o - Math.sign(c.o)));
      if (!behind && !inward) orphan++;
    }
    if (!set.has('0:0')) bad++;
  }
}
ok('no out-of-bounds or rock cells emitted', bad === 0, 'bad=' + bad);
ok('every visible cell has an unbroken line of sight', orphan === 0, 'orphans=' + orphan);
ok('cone bounded', maxCells <= (mod.MAXD * (mod.MAXO * 2 + 1)), 'max=' + maxCells);

// A sealed cell can see nothing but itself.
const boxed = mod.buildFloor('f1');
const bx = 3, byy = 3;
for (let d = 0; d < 4; d++) {
  boxed.cells[mod.idx(bx, byy)] |= [1, 2, 4, 8][d];
  const nx = bx + mod.FWD[d][0], ny = byy + mod.FWD[d][1];
  if (mod.inb(nx, ny)) boxed.cells[mod.idx(nx, ny)] |= [4, 8, 1, 2][d];
}
boxed.cells[mod.idx(bx, byy)] &= ~mod.ROCK;
let boxedOK = true;
for (let dir = 0; dir < 4; dir++) {
  if (mod.visibleCells(boxed, bx, byy, dir).length !== 1) boxedOK = false;
}
ok('a sealed cell sees only itself', boxedOK);

// Facing a wall, you cannot see the cell beyond it.
let throughWall = 0;
for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
  if (mod.isRock(f.cells, x, y)) continue;
  for (let dir = 0; dir < 4; dir++) {
    if (!mod.hasWall(f.cells, x, y, dir)) continue;
    if (mod.sightChain(f, x, y, dir, 1, 0)) throughWall++;
  }
}
ok('a wall directly ahead blocks the cell behind it', throughWall === 0, 'leaks=' + throughWall);

console.log('\n[5b] a shut door stops the eye as well as the feet');
const doorKey = Object.keys(f.features).find(k => f.features[k].type === 'door');
ok('the floor has a door to test', !!doorKey, doorKey);
const [ddx, ddy] = doorKey.split(',').map(Number);
const shut = (x, y) => { const ft = f.features[x + ',' + y]; return !!(ft && ft.type === 'door'); };
const none = () => false;

let provedBlock = false, doorStillSeen = false;
for (let dir = 0; dir < 4; dir++) {
  const sx = ddx - mod.FWD[dir][0] * 2, sy = ddy - mod.FWD[dir][1] * 2;
  if (!mod.inb(sx, sy) || mod.isRock(f.cells, sx, sy)) continue;
  const closed = mod.visibleCells(f, sx, sy, dir, null, shut);
  const opened = mod.visibleCells(f, sx, sy, dir, null, none);
  if (!closed.some(c => c.x === ddx && c.y === ddy)) continue;
  doorStillSeen = true;
  if (closed.length < opened.length) provedBlock = true;
}
ok('you can still see the door itself', doorStillSeen);
ok('but not what lies beyond it', provedBlock,
   'sight passed straight through a closed door');
ok('an opaque predicate is optional', mod.visibleCells(f, f.entry[0], f.entry[1], 0, null).length > 0);
// You can always see the blocker itself, so the cone collapses to your own
// cell plus whatever immediately adjoins it — never anything further out.
const allBlocked = mod.visibleCells(f, f.entry[0], f.entry[1], 0, null, () => true);
const freeSight  = mod.visibleCells(f, f.entry[0], f.entry[1], 0, null);
ok('blocking everything collapses the cone', allBlocked.length < freeSight.length,
   allBlocked.length + ' vs ' + freeSight.length);
ok('nothing beyond the first step is visible', allBlocked.every(c => c.d <= 1),
   'saw depth ' + Math.max.apply(null, allBlocked.map(c => c.d)));

console.log('\n[6] full-floor walk: every open cell entered');
const seen = new Set(), start = f.entry.join(',');
const q = [f.entry]; seen.add(start);
let steps = 0;
while (q.length) {
  const [x, y] = q.shift();
  if (++steps > 5000) break;
  for (let d = 0; d < 4; d++) {
    if (!mod.canStep(f.cells, x, y, d)) continue;
    const nx = x + mod.FWD[d][0], ny = y + mod.FWD[d][1], k = nx + ',' + ny;
    if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); }
  }
}
ok('walk reaches every open cell', seen.size === v.open, seen.size + '/' + v.open);
ok('every feature cell walkable', Object.keys(f.features).every(k => seen.has(k)),
   Object.keys(f.features).filter(k => !seen.has(k)).join(' '));

console.log('\n[7] no-clip: cannot step through a wall');
let clips = 0;
for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
  for (let d = 0; d < 4; d++) {
    if (mod.hasWall(f.cells, x, y, d) && mod.canStep(f.cells, x, y, d)) clips++;
  }
}
ok('zero wall clips', clips === 0, 'count=' + clips);

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);

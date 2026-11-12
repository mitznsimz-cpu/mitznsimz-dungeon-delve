// MSDD v6.0 — the corridor in 3D: the zones and materials, the floor built as
// geometry from the game's own data, and how the game hands it what it knows.
// msdd_view3d.js keeps the building apart from WebGL, so all of this runs in node.
const fs = require('fs');
const src = fs.readFileSync('./index.html', 'utf8');
function grab(t) {
  const re = new RegExp('/\\* ==== ' + t + ' START ==== \\*/([\\s\\S]*?)/\\* ==== ' + t + ' END ==== \\*/');
  const m = src.match(re); if (!m) { console.error('FAIL: ' + t + ' missing'); process.exit(1); } return m[1];
}
global.window = global;
require('../msdd_materials.js'); require('../msdd_view3d.js');
const M = global.MSDDMat, V = global.MSDD3D;
const ASSETS = fs.existsSync('./msdd_assets.js') ? fs.readFileSync('./msdd_assets.js', 'utf8') : '';
const G = new Function(ASSETS + grab('TEXTURE ATLAS') + grab('BUNDLED PACK') + grab('PACK CORE') +
  'var __L=loadPack(BUNDLED_PACK);' + grab('MAP CORE') + grab('PARTY CORE') + grab('SAVE CORE') +
  grab('WORLD CORE') + grab('EVENT CORE') + grab('COMBAT CORE') + grab('GEN CORE') +
  '\nvar floor=null;\nreturn {generateDelve,BUNDLED_PACK,GEN_THEMES,validatePack};')();

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')); } };
const tris = (P, name) => P.geo[name].count() / 3;
const FLOORS = G.BUNDLED_PACK.floors;

console.log('\n[V1] every zone is whole');
{
  const Z = M.ZONES, keys = Object.keys(Z);
  ok('sixteen zones', keys.length === 16, keys.length);
  const matOk = k => k && (k.indexOf('photo:') === 0 ? M.PHOTOS.indexOf(k.slice(6)) >= 0 : !!M.MATS[k]);
  ok('each names walls, floor, ceiling, door and props the material list has',
     keys.every(k => ['wall', 'floor', 'ceil', 'door'].every(s => matOk(Z[k][s])) && (!Z[k].prop || matOk(Z[k].prop))),
     keys.filter(k => !['wall', 'floor', 'ceil', 'door'].every(s => matOk(Z[k][s]))).join());
  ok('each door material is a door', keys.every(k => Z[k].door.indexOf('photo:') === 0 || M.MATS[Z[k].door].door));
  ok('each has a covering style, its colours, and its light', keys.every(k => {
    const z = Z[k]; return z.cover && z.cover.style >= 0 && z.cover.style <= 9 && /^#[0-9a-f]{6}$/i.test(z.cover.a) &&
      ['torch', 'lamp', 'amb', 'fog', 'glow'].every(c => /^#[0-9a-f]{6}$/i.test(z[c])); }));
  ok('each names water the list has, and particles', keys.every(k => Z[k].water in M.WATERS && Z[k].parts && Z[k].parts.kind));
  const DECOR = ['rubble', 'blocks', 'webs', 'bones', 'skulls', 'stalactites', 'stalagmites', 'beams', 'crates', 'barrels', 'mushrooms', 'crystals', 'coffins', 'urns', 'chains'];
  ok('every bit of clutter is one the builder knows', keys.every(k => (Z[k].decor || []).every(d => DECOR.indexOf(d) >= 0)));
  ok('eleven doors to choose from: eight made, the portcullis, and two photos', Object.keys(M.MATS).filter(k => M.MATS[k].door).length === 9 && M.PHOTOS.filter(k => /^door/.test(k)).length === 2);
  ok('shadows come as a chunk the shaders share, and a no-shadow stand-in', /float shadowT\(vec3 p, vec3 n\)/.test(M.SHADOW) && /return 1\.0/.test(M.NO_SHADOW));
}

console.log('\n[V2] the floors of Ashkeld, built');
{
  ok('each floor names its zone', FLOORS.every(f => f.zone && M.ZONES[f.zone]), FLOORS.map(f => f.id + ':' + f.zone).join());
  FLOORS.forEach(f => {
    const P = V.plan(f, M.ZONES[V.zoneFor(f, M)], {});
    let edges = 0, open = 0;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const c = f.cells[y * f.w + x]; if (c & 16) continue; open++;
      for (let d = 0; d < 4; d++) if (c & [1, 2, 4, 8][d]) edges++;
    }
    const floorTris = ['floor', 'water', 'embers', 'holy', 'antimagic', 'ice', 'rotten'].reduce((a, n) => a + tris(P, n), 0);
    const ups = Object.keys(f.features).filter(k => f.features[k].type === 'stairsUp').length;
    const downs = Object.keys(f.features).filter(k => f.features[k].type === 'stairsDown').length;
    ok(f.id + ': a ceiling over every open square but the stairs up', tris(P, 'ceil') === (open - ups) * 2, tris(P, 'ceil') + ' vs ' + (open - ups) * 2);
    ok(f.id + ': each stair opens a shaft of four stone sides, and has its steps', tris(P, 'pit') >= (ups + downs) * 8 && P.stairs.length === ups + downs && P.stairs.every(st => st.geo.count() / 3 >= 7 * 10), tris(P, 'pit'));
    ok(f.id + ': a floor under every square without a hole in it', floorTris + P.geo.recess.count() / 3 >= open * 2 - 2 * 20 && floorTris <= open * 2, floorTris);
    ok(f.id + ': a wall on every walled edge (and no more than its trimmings)', tris(P, 'wall') >= edges * 2, tris(P, 'wall') + ' vs ' + edges * 2);
    const doors = Object.keys(f.features).filter(k => /^(door|secretDoor)$/.test(f.features[k].type)).length;
    ok(f.id + ': a leaf for every door', P.doors.length === doors, P.doors.length + ' vs ' + doors);
  });
}

console.log('\n[V3] it draws what the game says, not what the data says');
{
  const f = FLOORS[0], key = Object.keys(f.features).find(k => f.features[k].type === 'door');
  const shut = V.plan(f, M.ZONES.damp, { door: () => 'shut' }), open = V.plan(f, M.ZONES.damp, { door: () => 'open' });
  const leaf = P => P.doors.find(d => d.key === key).geo.v.slice(0, 3).join();
  ok('an open door swings its leaf aside', leaf(shut) !== leaf(open));
  const hid = V.plan(f, M.ZONES.damp, { door: () => 'hidden' });
  ok('a seam nobody has found is drawn as wall, with no leaf and no frame', hid.doors.length === 0 && tris(hid, 'wall') !== tris(shut, 'wall') && tris(hid, 'wall') > tris(V.plan(f, M.ZONES.damp, { door: () => 'shut' }), 'wall') - 200);
  const ck = Object.keys(f.features).find(k => f.features[k].type === 'chest');
  const full = V.plan(f, M.ZONES.damp, { spent: () => false }), taken = V.plan(f, M.ZONES.damp, { spent: () => true });
  ok('a chest that has been opened has its lid thrown back', !!ck && full.lids.some(l => l.key === ck && !l.open) && taken.lids.some(l => l.key === ck && l.open));
  const pl = V.plan(f, M.ZONES.damp, { terrain: (x, y) => (x === f.entry[0] && y === f.entry[1]) ? 'pillars' : null });
  ok('pillars stand as a pair, with the way between them open', tris(pl, 'wall') - tris(V.plan(f, M.ZONES.damp, { terrain: () => null }), 'wall') === 2 * 26);
  const rb = V.plan(f, M.ZONES.damp, { terrain: (x, y) => (x === f.entry[0] && y === f.entry[1]) ? 'rubble' : null });
  ok('fallen rubble is a heap of two dozen stones', tris(rb, 'prop') - tris(V.plan(f, M.ZONES.damp, { terrain: () => null }), 'prop') === 24 * 10);
  const mk = Object.keys(f.features).find(k => f.features[k].type === 'monster');
  const foes = V.plan(f, M.ZONES.damp, { figures: (k, ft) => ft.type === 'monster' ? [{ fig: 'goblin' }, { fig: 'goblin' }] : null });
  ok('a waiting group stands as minis in its square', foes.minis.filter(m => m.key === mk).length === 2);
  ok('a beaten group is gone', V.plan(f, M.ZONES.damp, { figures: () => null }).minis.length === 0);
  const lamps = V.plan(f, M.ZONES.damp, { torch: (x, y, d) => (x + y + d) % 9 === 0 });
  ok('wall torches where the game hangs them, each a light', lamps.lamps.length > 0 && tris(lamps, 'flame') === lamps.lamps.length * 10);
  const wet = V.plan(f, M.ZONES.damp, { terrain: (x, y) => (x === f.entry[0] && y === f.entry[1]) ? 'water' : null });
  ok('terrain from the game: water where it says water', tris(wet, 'water') === 2);
  const pit = V.plan(f, M.ZONES.damp, { terrain: (x, y) => (x === f.entry[0] && y === f.entry[1]) ? 'chasm' : null });
  ok('a chasm has no floor, and sides going down', tris(pit, 'pit') > 0 && tris(pit, 'floor') === tris(V.plan(f, M.ZONES.damp, { terrain: () => null }), 'floor') - 2);
}

console.log('\n[V4] the endless delve: every theme wears zones, every floor builds');
{
  ok('each delve theme names two zones the list has', G.GEN_THEMES.every(t => t.zones && t.zones.length === 2 && t.zones.every(z => M.ZONES[z])));
  const all = new Set(); G.GEN_THEMES.forEach(t => t.zones.forEach(z => all.add(z)));
  ok('twelve different zones across the delve', all.size === 12, all.size);
  const r = G.generateDelve(11, { floors: 6, basePack: G.BUNDLED_PACK });
  const fl = r.pack ? r.pack.floors : r.floors || [];
  ok('a six-floor delve builds in 3D, floor by floor', fl.length === 6 && fl.every(f => { const P = V.plan(f, M.ZONES.crypt, {}); return tris(P, 'wall') > 50 && tris(P, 'ceil') > 50; }), fl.length);
}

console.log('\n[V5] the game hands over to it, and falls back without it');
{
  ok('both files load after the textures, before the game', /msdd_assets\.js"><\/script>\n<!--[^\n]*-->\n<script src="msdd_materials\.js"><\/script>\n<script src="msdd_view3d\.js"><\/script>/.test(src));
  ok('the service worker keeps both', /'\.\/msdd_materials\.js'/.test(fs.readFileSync('./sw.js', 'utf8')) && /'\.\/msdd_view3d\.js'/.test(fs.readFileSync('./sw.js', 'utf8')));
  ok('a 3D canvas under the 2D one', /<canvas id="view3d" aria-hidden="true"><\/canvas>\n\s*<canvas id="view"><\/canvas>/.test(src));
  ok('drawView hands over when it can, and draws 2D when it cannot', /function drawView\(\) \{\n  if \(v3dActive\(\)\) \{ v3dDraw\(\); return; \}\n  document\.body\.classList\.remove\('v3d'\);/.test(src));
  ok('no WebGL 2, no files, or the setting off: the 2D view', /PREFS\.view3d === false \|\| V3D === false \|\| typeof MSDD3D === 'undefined' \|\| typeof MSDDMat === 'undefined'\) return false;/.test(src));
  ok('a lost context drops back to 2D', /if \(V3D && V3D\.lost\(\)\) V3D = false;/.test(src));
  ok('the setting, remembered, on by default', /view3d: true \}/.test(src) && /id="view3dToggle"/.test(src));
  ok('composeView leaves the 3D view alone', /function composeView\(\) \{\n  if \(V3D && document\.body\.classList\.contains\('v3d'\)\) return;/.test(src));
  ok('the camera follows the step and the turn, never more', /var x = walking \? prev\.x \+ \(pos\.x - prev\.x\) \* t : pos\.x/.test(src) && /pos\.f - turning \* \(1 - turnT\)/.test(src));
  ok('slow frames step the quality down, sharpness first, then shadows', /V3D_LEVELS = \[\{ scale: 1, shadows: true \}, \{ scale: 0\.75, shadows: true \}, \{ scale: 0\.75, shadows: false \}/.test(src));
  ok('the game says what is hidden, open, taken, raised and beaten', ['door:', 'spent:', 'gateOpen:', 'leverOn:', 'trapShown:', 'barrierDown:', 'figures:', 'signature:']
     .every(h => src.indexOf('    ' + h) >= 0));
}

console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ' \u2014 ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

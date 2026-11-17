/* Mitz & Simz: Dungeon Delve — the Workshop (v7.0, stage E1).
   Build a floor on a grid, check it with the game's own validator and solver
   as you go, play-test it with a ready-made party, and keep it as a pack: the
   same JSON pack the game loads, so whatever is made here plays like Ashkeld.

   The EDITOR CORE is pure (no DOM): every edit is a small function over a
   floor, and the tests run it in node. The page glue below it draws the grid
   and wires the tools. The game is reached through a few globals it already
   has (BUNDLED_BASE, validatePack, proveSolvable, loadPack, ...). */

/* ==== EDITOR CORE START ==== */
var ED_N = 1, ED_E = 2, ED_S = 4, ED_W = 8, ED_ROCK = 16;
var ED_BIT = [ED_N, ED_E, ED_S, ED_W];
var ED_DX = [0, 1, 0, -1], ED_DY = [-1, 0, 1, 0];
var ED_SIZES = [12, 16, 20, 24, 30];
var ED_TERRAIN = ['water', 'embers', 'fog', 'antimagic', 'holy', 'rubble', 'web', 'chasm', 'bridge', 'ice', 'rotten', 'pillars'];
var ED_TRAPS = ['snare', 'darts', 'gas', 'fire', 'net', 'alarm'];
var ED_KEYS = ['it.key.rust', 'it.key.bronze', 'it.key.warden'];

/* What can be placed, with the settings a new one starts with. */
var ED_THINGS = [
  { id: 'staff',      label: 'Goal: the staff',  glyph: '★', make: function () { return { type: 'staff', quest: true, text: 'A staff rests on a broken cradle, humming to itself in the dark.' }; } },
  { id: 'exit',       label: 'Goal: a way out',  glyph: '⌂', make: function () { return { type: 'exit', text: 'Daylight, at last.' }; } },
  { id: 'monster',    label: 'Monsters',         glyph: '☠', make: function () { return { type: 'monster', ref: 'mn.goblin' }; } },
  { id: 'stairsDown', label: 'Stairs down',      glyph: '\u25bc', make: function () { return { type: 'stairsDown' }; } },
  { id: 'stairsUp',   label: 'Stairs up',        glyph: '\u25b2', make: function () { return { type: 'stairsUp' }; } },
  { id: 'door',       label: 'Door',             glyph: '▯', make: function () { return { type: 'door' }; } },
  { id: 'lockedDoor', label: 'Locked door',      glyph: '▮', make: function () { return { type: 'door', locked: true, keyId: 'it.key.rust', text: 'A locked door.' }; } },
  { id: 'secretDoor', label: 'Secret door',      glyph: '░', make: function () { return { type: 'secretDoor', text: 'A seam, barely there.' }; } },
  { id: 'lever',      label: 'Lever',            glyph: '\u2310', make: function () { return { type: 'lever', text: 'An iron lever.', note: 'Somewhere, something grinds open.' }; } },
  { id: 'plate',      label: 'Pressure plate',   glyph: '\u25a1', make: function () { return { type: 'plate', text: 'A flagstone sits a finger proud of the rest.' }; } },
  { id: 'portcullis', label: 'Portcullis',       glyph: '\u2261', make: function () { return { type: 'portcullis', text: 'A portcullis. Something elsewhere raises it.' }; } },
  { id: 'teleporter', label: 'Teleporter',       glyph: '\u273a', make: function () { return { type: 'teleporter', text: 'A sigil cut deep into the flagstone.' }; } },
  { id: 'chest',      label: 'Chest',            glyph: '▣', make: function () { return { type: 'chest', gold: [2, 8, 4] }; } },
  { id: 'trap',       label: 'Trap',             glyph: '✖', make: function () { return { type: 'trap', kind: 'snare' }; } },
  { id: 'fountain',   label: 'Fountain',         glyph: '♨', make: function () { return { type: 'fountain' }; } },
  { id: 'altar',      label: 'Altar',            glyph: '☩', make: function () { return { type: 'altar' }; } },
  { id: 'remains',    label: 'Remains',          glyph: '☠', make: function () { return { type: 'remains' }; } },
  { id: 'campsite',   label: 'Old camp',         glyph: '⌂', make: function () { return { type: 'campsite' }; } },
  { id: 'textTrigger', label: 'Words on a square', glyph: '¶', make: function () { return { type: 'textTrigger', text: 'Words are scratched into the wall here.' }; } }
];
function edThing(id) { for (var i = 0; i < ED_THINGS.length; i++) if (ED_THINGS[i].id === id) return ED_THINGS[i]; return null; }

function edIn(f, x, y) { return x >= 0 && y >= 0 && x < f.w && y < f.h; }
function edIdx(f, x, y) { return y * f.w + x; }
function edRock(f, x, y) { return !edIn(f, x, y) || !!(f.cells[edIdx(f, x, y)] & ED_ROCK); }
function edKey(x, y) { return x + ',' + y; }

/* A new floor: solid rock, or one open box with walls all round. */
function edNewFloor(w, h, start, id) {
  w = Math.max(6, Math.min(40, w | 0)); h = Math.max(6, Math.min(40, h | 0));
  var f = { id: id || 'w1', name: 'A new floor', depth: 1, w: w, h: h, cells: [], features: {}, terrain: {},
            entry: [1, 1], entryFacing: 1, encounterTable: ['mn.goblin', 'mn.direRat', 'mn.kobold'], monsterScale: 1 };
  for (var i = 0; i < w * h; i++) f.cells.push(ED_ROCK | 15);
  if (start === 'box') edCarve(f, 1, 1, w - 2, h - 2);
  else if (start !== 'solid') edCarve(f, 1, 1, Math.min(4, w - 2), Math.min(3, h - 2));       // a first small room for the entry
  return f;
}

/* Set or clear the wall on one side of a square, and the matching side of
   its neighbour, so a wall can never stand on one side only. The edge of the
   map is always a wall. A rock square keeps all its walls. */
function edSetWall(f, x, y, d, on) {
  if (!edIn(f, x, y)) return false;
  var nx = x + ED_DX[d], ny = y + ED_DY[d], o = (d + 2) % 4;
  if (!on && (!edIn(f, nx, ny) || edRock(f, x, y) || edRock(f, nx, ny))) return false;
  var i = edIdx(f, x, y);
  f.cells[i] = on ? (f.cells[i] | ED_BIT[d]) : (f.cells[i] & ~ED_BIT[d]);
  if (edIn(f, nx, ny)) {
    var j = edIdx(f, nx, ny);
    f.cells[j] = on ? (f.cells[j] | ED_BIT[o]) : (f.cells[j] & ~ED_BIT[o]);
  }
  return true;
}
function edWall(f, x, y, d) { return !edIn(f, x, y) || !!(f.cells[edIdx(f, x, y)] & ED_BIT[d]); }

/* Carve a room (or a corridor, one square wide) out of rock: open inside,
   walled where it meets rock or the edge. Where it meets an open square that
   was already there, it opens onto it, so a corridor dragged into a room joins it. */
function edCarve(f, x0, y0, x1, y1) {
  var ax = Math.max(0, Math.min(x0, x1)), bx = Math.min(f.w - 1, Math.max(x0, x1));
  var ay = Math.max(0, Math.min(y0, y1)), by = Math.min(f.h - 1, Math.max(y0, y1));
  var was = {};
  for (var y = ay; y <= by; y++) for (var x = ax; x <= bx; x++) was[edKey(x, y)] = edRock(f, x, y);
  for (y = ay; y <= by; y++) for (x = ax; x <= bx; x++) f.cells[edIdx(f, x, y)] &= ~ED_ROCK;
  for (y = ay; y <= by; y++) for (x = ax; x <= bx; x++) {
    for (var d = 0; d < 4; d++) {
      var nx = x + ED_DX[d], ny = y + ED_DY[d];
      var inside = nx >= ax && nx <= bx && ny >= ay && ny <= by;
      if (!edIn(f, nx, ny) || edRock(f, nx, ny)) { edSetWall(f, x, y, d, true); continue; }
      if (inside) { edSetWall(f, x, y, d, false); continue; }
      if (was[edKey(x, y)]) edSetWall(f, x, y, d, false);          // newly carved: join what is there
    }
  }
  return true;
}

/* Fill squares back to rock; anything on them goes. */
function edFill(f, x0, y0, x1, y1) {
  var ax = Math.max(0, Math.min(x0, x1)), bx = Math.min(f.w - 1, Math.max(x0, x1));
  var ay = Math.max(0, Math.min(y0, y1)), by = Math.min(f.h - 1, Math.max(y0, y1));
  for (var y = ay; y <= by; y++) for (var x = ax; x <= bx; x++) {
    for (var d = 0; d < 4; d++) edSetWall(f, x, y, d, true);
    f.cells[edIdx(f, x, y)] |= ED_ROCK | 15;
    delete f.features[edKey(x, y)];
    delete f.terrain[edKey(x, y)];
  }
  return true;
}

/* Terrain on an open square, or null to clear it. */
function edPaint(f, x, y, t) {
  if (!edIn(f, x, y) || edRock(f, x, y)) return false;
  if (t && ED_TERRAIN.indexOf(t) < 0) return false;
  if (t) f.terrain[edKey(x, y)] = t; else delete f.terrain[edKey(x, y)];
  return true;
}

/* Put a thing on an open square (it replaces what was there), or null to clear. */
function edPlace(f, x, y, ft) {
  if (!edIn(f, x, y) || edRock(f, x, y)) return false;
  if (ft) f.features[edKey(x, y)] = JSON.parse(JSON.stringify(ft)); else delete f.features[edKey(x, y)];
  return true;
}

function edSetEntry(f, x, y, facing) {
  if (!edIn(f, x, y) || edRock(f, x, y)) return false;
  f.entry = [x, y]; f.entryFacing = ((facing | 0) % 4 + 4) % 4;
  return true;
}

/* ---- v7.1 (E3): several floors ----
   Floors are stacked: floor 2 lies under floor 1. Stairs pair up between
   neighbouring floors, in reading order (top row first): the first stairs down
   on a floor lead to the first stairs up on the floor below, and back. Put a
   pair on the same square and they are one staircase straight down. */
function edFloorId(draft) {
  var n = 1;
  while (draft.floors.some(function (f) { return f.id === 'w' + n; })) n++;
  return 'w' + n;
}
function edAddFloor(draft, w, h, start, at) {
  // a floor below starts as solid rock: the party arrives by the stairs, not at a start of its own
  var f = edNewFloor(w, h, start === 'rock' ? 'solid' : start, edFloorId(draft));
  f.name = 'Level ' + (draft.floors.length + 1);
  var i = at == null ? draft.floors.length : Math.max(0, Math.min(draft.floors.length, at));
  draft.floors.splice(i, 0, f);
  return i;
}
function edRemoveFloor(draft, i) {
  if (draft.floors.length <= 1 || i < 0 || i >= draft.floors.length) return false;
  draft.floors.splice(i, 1);
  return true;
}
function edMoveFloor(draft, i, by) {
  var j = i + by;
  if (i < 0 || j < 0 || i >= draft.floors.length || j >= draft.floors.length) return false;
  var f = draft.floors.splice(i, 1)[0]; draft.floors.splice(j, 0, f);
  return true;
}
function edStairs(f, type) {
  return Object.keys(f.features).filter(function (k) { return f.features[k].type === type; })
    .map(function (k) { var p = k.split(',').map(Number); return { k: k, x: p[0], y: p[1] }; })
    .sort(function (a, b) { return a.y - b.y || a.x - b.x; });
}
/* Give every staircase its partner (on a copy of the floors, for the pack).
   Returns the stairs that found none. */
function edLinkStairs(floors) {
  var lonely = [];
  floors.forEach(function (f) { Object.keys(f.features).forEach(function (k) {
    var t = f.features[k].type; if (t === 'stairsDown' || t === 'stairsUp') { delete f.features[k].to; delete f.features[k].at; }
  }); });
  floors.forEach(function (f, i) {
    var downs = edStairs(f, 'stairsDown'), below = floors[i + 1], ups = below ? edStairs(below, 'stairsUp') : [];
    downs.forEach(function (d, n) {
      var u = ups[n];
      if (!u) { lonely.push({ floor: f.id, i: i, at: [d.x, d.y], type: 'stairsDown' }); return; }
      f.features[d.k].to = below.id; f.features[d.k].at = [u.x, u.y];
      below.features[u.k].to = f.id; below.features[u.k].at = [d.x, d.y];
    });
    ups.slice(downs.length).forEach(function (u) { lonely.push({ floor: below.id, i: i + 1, at: [u.x, u.y], type: 'stairsUp' }); });
    if (i === 0) edStairs(f, 'stairsUp').forEach(function (u) { lonely.push({ floor: f.id, i: 0, at: [u.x, u.y], type: 'stairsUp', top: true }); });
  });
  return lonely;
}
/* Stairs placed: the other end goes on the same square of the next floor, if
   that square is open and free, so the staircase runs straight up and down. */
function edPairStairs(draft, i, x, y, type) {
  var j = type === 'stairsDown' ? i + 1 : i - 1, g = draft.floors[j];
  if (!g || edRock(g, x, y) || g.features[edKey(x, y)]) return false;
  g.features[edKey(x, y)] = { type: type === 'stairsDown' ? 'stairsUp' : 'stairsDown' };
  return true;
}

/* Carving on a floor under stairs down that have no partner yet: the stairs
   up appear on the square below them, so a room dug out under a staircase
   catches it. Returns how many were placed. */
function edCatchStairs(draft, i) {
  var f = draft.floors[i], above = draft.floors[i - 1], n = 0;
  if (!f || !above) return 0;
  var copy = JSON.parse(JSON.stringify(draft.floors)), lonely = edLinkStairs(copy);
  lonely.forEach(function (l) {
    if (l.type !== 'stairsDown' || l.i !== i - 1) return;
    var x = l.at[0], y = l.at[1];
    if (edRock(f, x, y) || f.features[edKey(x, y)]) return;
    f.features[edKey(x, y)] = { type: 'stairsUp' }; n++;
  });
  return n;
}

/* ---- v7.1 (E3 part 2): your own items and monsters ----
   Each starts from one the game has (so it keeps its slot, its class rules,
   its use and its mini) and changes the name, the words and the numbers,
   within limits that keep it fair. */
var ED_DIE = [4, 6, 8, 10, 12];
function edClamp(v, lo, hi, d) { v = Number(v); if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, Math.round(v))); }
function edSlug(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'thing'; }
function edDice(d, def) {
  d = Array.isArray(d) ? d : def;
  var n = edClamp(d[0], 1, 6, def[0]), sides = ED_DIE.indexOf(+d[1]) >= 0 ? +d[1] : def[1], plus = edClamp(d[2], 0, 12, def[2]);
  return [n, sides, plus];
}
/* An item of your own, from base (an item definition) and the changes asked for. */
function edMakeItem(base, ch, taken) {
  ch = ch || {};
  var it = JSON.parse(JSON.stringify(base));
  var name = String(ch.name || base.name).trim().slice(0, 32) || base.name;
  var id = ch.id || ('it.ws.' + edSlug(name));
  if (!ch.id && taken) { var n = 2, b = id; while (taken[id]) id = b + '-' + n++; }
  it.id = id; it.name = name;
  it.desc = String(ch.desc == null ? base.desc || '' : ch.desc).slice(0, 200);
  it.value = edClamp(ch.value == null ? base.value : ch.value, 0, 3000, base.value || 0);
  if (base.slot === 'weapon') it.damage = edDice(ch.damage || base.damage, base.damage || [1, 6, 0]);
  if (base.slot === 'armor' || base.slot === 'shield') it.defenseBonus = edClamp(ch.defenseBonus == null ? base.defenseBonus : ch.defenseBonus, 0, 8, base.defenseBonus || 1);
  if (base.slot === 'trinket') {
    it.defenseBonus = edClamp(ch.defenseBonus == null ? base.defenseBonus || 0 : ch.defenseBonus, -3, 3, 0);
    it.hitBonus = edClamp(ch.hitBonus == null ? base.hitBonus || 0 : ch.hitBonus, -3, 3, 0);
    it.bpBonus = edClamp(ch.bpBonus == null ? base.bpBonus || 0 : ch.bpBonus, 0, 10, 0);
    it.mpBonus = edClamp(ch.mpBonus == null ? base.mpBonus || 0 : ch.mpBonus, 0, 8, 0);
    ['defenseBonus', 'hitBonus', 'bpBonus', 'mpBonus'].forEach(function (k) { if (!it[k]) delete it[k]; });
  }
  if (it.use && it.use.dice) it.use.dice = edDice(ch.useDice || it.use.dice, it.use.dice);
  if ((base.tags || []).indexOf('key') >= 0) { it.keyId = id; it.flags = ['quest']; it.value = 0; }
  else if (ch.quest) it.flags = ['quest']; else delete it.flags;
  delete it.shopFrom; delete it.cursed; delete it.unknown;
  return it;
}
/* A monster of your own, the same way. */
function edMakeMonster(base, ch, taken) {
  ch = ch || {};
  var m = JSON.parse(JSON.stringify(base));
  var name = String(ch.name || base.name).trim().slice(0, 32) || base.name;
  var id = ch.id || ('mn.ws.' + edSlug(name));
  if (!ch.id && taken) { var n = 2, b = id; while (taken[id]) id = b + '-' + n++; }
  m.id = id; m.name = name;
  m.level = edClamp(ch.level == null ? base.level : ch.level, 1, 12, base.level);
  m.bp = edDice(ch.bp || base.bp, base.bp);
  m.defense = edClamp(ch.defense == null ? base.defense : ch.defense, 8, 24, base.defense);
  m.attacks = (base.attacks || []).map(function (a, i) {
    var c = (ch.attacks || [])[i] || {};
    return { name: String(c.name || a.name).slice(0, 24), toHit: edClamp(c.toHit == null ? a.toHit : c.toHit, 0, 12, a.toHit),
             damage: edDice(c.damage || a.damage, a.damage), reach: a.reach };
  });
  var traits = (base.traits || []).filter(function (t) { return t !== 'boss'; });
  if (ch.boss != null ? ch.boss : (base.traits || []).indexOf('boss') >= 0) traits.push('boss');
  m.traits = traits;
  if (traits.indexOf('boss') >= 0) m.groupSize = [1, 1, 0];
  // what it is worth follows how tough it is
  var tough = m.level * 25 + m.bp[0] * m.bp[1] * 2 + (m.defense - 10) * 6;
  m.xp = edClamp(ch.xp == null ? Math.max(10, Math.round(tough * (traits.indexOf('boss') >= 0 ? 2.5 : 1))) : ch.xp, 5, 5000, 25);
  delete m.phases;                         // a base's own phases name its own summons and lines
  return m;
}

/* ---- v7.3 (E2): mechanisms ----
   A lever or a plate opens whatever names it: a portcullis, a door, a grate
   (a secret door). Ids are made unique across the whole adventure, because
   the game keeps thrown levers by id. A teleporter sends you to a square. */
var ED_OPENERS = ['lever', 'plate'], ED_GATES = ['portcullis', 'door', 'secretDoor'];
function edLeverId(draft, type) {
  var used = {};
  draft.floors.forEach(function (f) { Object.keys(f.features).forEach(function (k) { var id = f.features[k].id; if (id) used[id] = 1; }); });
  var pre = type === 'plate' ? 'pl.' : 'lv.', n = 1;
  while (used[pre + n]) n++;
  return pre + n;
}
/* Link the opener at a to the gate at b, on floor f. False if they cannot be linked. */
function edLink(draft, f, a, b) {
  var src = f.features[a], dst = f.features[b];
  if (!src || !dst || a === b) return false;
  if (ED_OPENERS.indexOf(src.type) < 0 || ED_GATES.indexOf(dst.type) < 0) return false;
  if (!src.id) src.id = edLeverId(draft, src.type);
  dst.needsLever = src.id;
  if (src.type === 'lever') src.opens = b;
  return true;
}
function edUnlink(f, key) {
  var ft = f.features[key]; if (!ft) return false;
  if (ft.needsLever) { delete ft.needsLever; return true; }
  if (ft.id) {
    var any = false;
    Object.keys(f.features).forEach(function (k) { if (f.features[k].needsLever === ft.id) { delete f.features[k].needsLever; any = true; } });
    delete ft.opens;
    return any;
  }
  return false;
}
/* The lines to draw: from each opener to what it opens, on one floor. */
function edLinks(f) {
  var at = {}, out = [];
  Object.keys(f.features).forEach(function (k) { var ft = f.features[k]; if (ft.id && ED_OPENERS.indexOf(ft.type) >= 0) at[ft.id] = k; });
  Object.keys(f.features).forEach(function (k) {
    var ft = f.features[k];
    if (ft.needsLever && at[ft.needsLever]) out.push({ from: at[ft.needsLever], to: k, kind: 'gate' });
    if (ft.type === 'teleporter' && ft.at && (!ft.to || ft.to === f.id)) out.push({ from: k, to: edKey(ft.at[0], ft.at[1]), kind: 'tele' });
  });
  return out;
}
function edAim(f, key, x, y) {
  var ft = f.features[key];
  if (!ft || ft.type !== 'teleporter' || edRock(f, x, y) || key === edKey(x, y)) return false;
  ft.to = f.id; ft.at = [x, y];
  return true;
}

/* ---- v7.3 (E2): regions ----
   Named parts of a floor: what the party reads on entering, and the habitat
   that decides which wanderers turn up there. */
var ED_HABITATS = ['', 'warren', 'crypt', 'flooded', 'deep', 'forge', 'ruin'];
function edAddRegion(f, name) {
  f.regions = f.regions || {}; f.regionMap = f.regionMap || {};
  var base = edSlug(name || 'room'), id = base, n = 2;
  while (f.regions[id]) id = base + '-' + n++;
  f.regions[id] = { name: String(name || 'A room').slice(0, 40), look: '' };
  return id;
}
function edPaintRegion(f, x, y, id) {
  if (!edIn(f, x, y) || edRock(f, x, y)) return false;
  f.regionMap = f.regionMap || {};
  if (id && !(f.regions || {})[id]) return false;
  if (id) f.regionMap[edKey(x, y)] = id; else delete f.regionMap[edKey(x, y)];
  return true;
}
/* A whole room at once: every open square reached from x,y without passing a
   wall or a door (doors, grates and portcullises mark where rooms end). */
function edFloodRegion(f, x, y, id) {
  if (!edIn(f, x, y) || edRock(f, x, y)) return 0;
  if (id && !(f.regions || {})[id]) return 0;
  var gate = function (k) { var ft = f.features[k]; return ft && (ft.type === 'door' || ft.type === 'secretDoor' || ft.type === 'portcullis'); };
  var seen = {}, todo = [[x, y]], n = 0;
  seen[edKey(x, y)] = 1;
  while (todo.length && n < 900) {
    var c = todo.shift(), k = edKey(c[0], c[1]);
    if (edPaintRegion(f, c[0], c[1], id)) n++;
    if (gate(k) && n > 1) continue;
    for (var d = 0; d < 4; d++) {
      if (edWall(f, c[0], c[1], d)) continue;
      var nx = c[0] + ED_DX[d], ny = c[1] + ED_DY[d], nk = edKey(nx, ny);
      if (seen[nk] || edRock(f, nx, ny) || gate(nk)) continue;
      seen[nk] = 1; todo.push([nx, ny]);
    }
  }
  return n;
}
function edRemoveRegion(f, id) {
  if (!f.regions || !f.regions[id]) return false;
  delete f.regions[id];
  Object.keys(f.regionMap || {}).forEach(function (k) { if (f.regionMap[k] === id) delete f.regionMap[k]; });
  return true;
}

/* ---- v7.3 (E4): blocks: copy, paste, rotate, mirror, stamps ----
   A block is a rectangle of squares lifted off a floor, with its walls,
   things, terrain and regions. Pasting keeps walls in step at its edges. */
function edCopy(f, x0, y0, x1, y1) {
  var ax = Math.max(0, Math.min(x0, x1)), bx = Math.min(f.w - 1, Math.max(x0, x1));
  var ay = Math.max(0, Math.min(y0, y1)), by = Math.min(f.h - 1, Math.max(y0, y1));
  var b = { w: bx - ax + 1, h: by - ay + 1, cells: [], features: {}, terrain: {}, regionMap: {} };
  for (var y = ay; y <= by; y++) for (var x = ax; x <= bx; x++) {
    b.cells.push(f.cells[edIdx(f, x, y)]);
    var k = edKey(x, y), nk = edKey(x - ax, y - ay);
    if (f.features[k]) { b.features[nk] = JSON.parse(JSON.stringify(f.features[k])); delete b.features[nk].id; delete b.features[nk].needsLever; delete b.features[nk].opens; }
    if (f.terrain[k]) b.terrain[nk] = f.terrain[k];
    if (f.regionMap && f.regionMap[k]) b.regionMap[nk] = f.regionMap[k];
  }
  return b;
}
function edMapKeys(obj, fn) { var o = {}; Object.keys(obj || {}).forEach(function (k) { var p = k.split(',').map(Number), q = fn(p[0], p[1]); o[edKey(q[0], q[1])] = obj[k]; }); return o; }
function edRotBits(c, turns) {                 // walls turn with the squares, clockwise
  var walls = c & 15, rest = c & ~15;
  for (var t = 0; t < turns; t++) walls = ((walls << 1) | (walls >> 3)) & 15;
  return rest | walls;
}
function edBlockRotate(b) {                   // a quarter turn clockwise
  var w = b.h, h = b.w, cells = new Array(w * h);
  for (var y = 0; y < b.h; y++) for (var x = 0; x < b.w; x++) cells[x * w + (b.h - 1 - y)] = edRotBits(b.cells[y * b.w + x], 1);
  var f = function (x, y) { return [b.h - 1 - y, x]; };
  return { w: w, h: h, cells: cells, features: edMapKeys(b.features, f), terrain: edMapKeys(b.terrain, f), regionMap: edMapKeys(b.regionMap, f) };
}
function edBlockMirror(b, across) {           // 'x': left to right; 'y': top to bottom
  var cells = new Array(b.w * b.h);
  for (var y = 0; y < b.h; y++) for (var x = 0; x < b.w; x++) {
    var c = b.cells[y * b.w + x], walls = c & 15, rest = c & ~15, nw = walls;
    if (across === 'x') nw = (walls & (ED_N | ED_S)) | ((walls & ED_E) ? ED_W : 0) | ((walls & ED_W) ? ED_E : 0);
    else nw = (walls & (ED_E | ED_W)) | ((walls & ED_N) ? ED_S : 0) | ((walls & ED_S) ? ED_N : 0);
    var nx = across === 'x' ? b.w - 1 - x : x, ny = across === 'x' ? y : b.h - 1 - y;
    cells[ny * b.w + nx] = rest | nw;
  }
  var f = function (x, y) { return across === 'x' ? [b.w - 1 - x, y] : [x, b.h - 1 - y]; };
  return { w: b.w, h: b.h, cells: cells, features: edMapKeys(b.features, f), terrain: edMapKeys(b.terrain, f), regionMap: edMapKeys(b.regionMap, f) };
}
/* Paste a block with its top-left at x,y; what falls off the map is left behind. */
function edPaste(f, b, x0, y0) {
  var put = false;
  for (var y = 0; y < b.h; y++) for (var x = 0; x < b.w; x++) {
    var X = x0 + x, Y = y0 + y; if (!edIn(f, X, Y)) continue;
    var k = edKey(X, Y), nk = edKey(x, y);
    f.cells[edIdx(f, X, Y)] = b.cells[y * b.w + x];
    delete f.features[k]; delete f.terrain[k]; if (f.regionMap) delete f.regionMap[k];
    if (b.features[nk]) f.features[k] = JSON.parse(JSON.stringify(b.features[nk]));
    if (b.terrain[nk]) f.terrain[k] = b.terrain[nk];
    if (b.regionMap[nk] && f.regions && f.regions[b.regionMap[nk]]) f.regionMap[k] = b.regionMap[nk];
    put = true;
  }
  // keep walls in step everywhere the block touches, inside and at its edges
  for (y = y0 - 1; y <= y0 + b.h; y++) for (x = x0 - 1; x <= x0 + b.w; x++) {
    if (!edIn(f, x, y)) continue;
    for (var d = 0; d < 4; d++) {
      var nx = x + ED_DX[d], ny = y + ED_DY[d];
      if (!edIn(f, nx, ny)) { edSetWall(f, x, y, d, true); continue; }
      if (edRock(f, x, y) || edRock(f, nx, ny)) { edSetWall(f, x, y, d, true); continue; }
      var inside = x >= x0 && x < x0 + b.w && y >= y0 && y < y0 + b.h;
      var wall = edWall(f, x, y, d) || edWall(f, nx, ny, (d + 2) % 4);
      if (inside) wall = edWall(f, x, y, d);            // the block's own wall decides at its edge
      edSetWall(f, x, y, d, wall);
    }
  }
  return put;
}
function edClear(f, x0, y0, x1, y1) { return edFill(f, x0, y0, x1, y1); }
/* The whole floor turned or mirrored: the entry and the links go with it. */
function edTransformFloor(f, op) {
  var b = edCopy(f, 0, 0, f.w - 1, f.h - 1);
  // ids and links survive a whole-floor turn: copy them back by position
  var keep = {}; Object.keys(f.features).forEach(function (k) { keep[k] = f.features[k]; });
  var nb = op === 'rotate' ? edBlockRotate(b) : edBlockMirror(b, op === 'mirrorX' ? 'x' : 'y');
  var ow = f.w, oh = f.h;                    // the size before the turn: f.w and f.h change below
  var map = op === 'rotate' ? function (x, y) { return [oh - 1 - y, x]; } : op === 'mirrorX' ? function (x, y) { return [ow - 1 - x, y]; } : function (x, y) { return [x, oh - 1 - y]; };
  var feats = edMapKeys(keep, map);
  var turnFace = op === 'rotate' ? function (d) { return (d + 1) % 4; } : op === 'mirrorX' ? function (d) { return d === 1 ? 3 : d === 3 ? 1 : d; } : function (d) { return d === 0 ? 2 : d === 2 ? 0 : d; };
  var e = map(f.entry[0], f.entry[1]);
  f.w = nb.w; f.h = nb.h; f.cells = nb.cells; f.terrain = nb.terrain; f.regionMap = nb.regionMap;
  f.features = {};
  Object.keys(feats).forEach(function (k) {
    var ft = JSON.parse(JSON.stringify(feats[k]));
    if (ft.type === 'lever' && ft.opens) { var p = ft.opens.split(',').map(Number), q = map(p[0], p[1]); ft.opens = edKey(q[0], q[1]); }
    if (ft.type === 'teleporter' && ft.at && (!ft.to || ft.to === f.id)) ft.at = map(ft.at[0], ft.at[1]);
    f.features[k] = ft;
  });
  f.entry = e; f.entryFacing = turnFace(f.entryFacing || 0);
  return true;
}
/* Ready-made rooms, as blocks to paste. */
function edRoomBlock(w, h) { var g = { w: w, h: h, cells: [], features: {}, terrain: {}, regionMap: {} }; for (var i = 0; i < w * h; i++) g.cells.push(ED_ROCK | 15); return g; }
function edBlockFloor(b) { return { w: b.w, h: b.h, cells: b.cells, features: b.features, terrain: b.terrain, regionMap: b.regionMap }; }
var ED_STAMPS = {
  cross: { label: 'A cross', make: function () {
    var f = edBlockFloor(edRoomBlock(7, 7)); edCarve(f, 2, 0, 4, 6); edCarve(f, 0, 2, 6, 4); return edCopy(f, 0, 0, 6, 6); } },
  hall: { label: 'A pillared hall', make: function () {
    var f = edBlockFloor(edRoomBlock(9, 7)); edCarve(f, 0, 0, 8, 6);
    [[2, 2], [6, 2], [2, 4], [6, 4]].forEach(function (p) { edPaint(f, p[0], p[1], 'pillars'); });
    return edCopy(f, 0, 0, 8, 6); } },
  cells: { label: 'A cell block', make: function () {
    var f = edBlockFloor(edRoomBlock(9, 7)); edCarve(f, 0, 3, 8, 3);
    [1, 4, 7].forEach(function (x) {
      edCarve(f, x, 0, x, 1); edCarve(f, x, 5, x, 6);
      edSetWall(f, x, 1, 2, false); edSetWall(f, x, 5, 0, false);
      edCarve(f, x, 2, x, 2); edCarve(f, x, 4, x, 4);
      f.features[edKey(x, 2)] = { type: 'door' }; f.features[edKey(x, 4)] = { type: 'door' };
    });
    // the corridor joins each door, the doors join each cell
    [1, 4, 7].forEach(function (x) { edSetWall(f, x, 2, 2, false); edSetWall(f, x, 4, 0, false); edSetWall(f, x, 1, 2, false); edSetWall(f, x, 5, 0, false); });
    return edCopy(f, 0, 0, 8, 6); } },
  round: { label: 'A round chamber', make: function () {
    var f = edBlockFloor(edRoomBlock(7, 7)); edCarve(f, 2, 0, 4, 6); edCarve(f, 1, 1, 5, 5); edCarve(f, 0, 2, 6, 4); return edCopy(f, 0, 0, 6, 6); } }
};

/* ---- the cover: what the adventure is, how it is won, what Simz sells ---- */
var ED_WINS = {
  staff: { flag: 'gotStaff',    label: 'Find the staff',     text: 'The staff is yours. The gate can be closed.' },
  boss:  { flag: 'beatBoss',    label: 'Beat the boss',      text: 'It is over. Nothing down here will rise again.' },
  exit:  { flag: 'reachedExit', label: 'Find the way out',   text: 'Daylight, at last. You made it out.' }
};
function edCover(draft) {
  var c = draft.cover || {};
  return { blurb: c.blurb || '', gold: c.gold == null ? 120 : Math.max(0, Math.min(5000, c.gold | 0)),
           win: ED_WINS[c.win] ? c.win : 'staff', winText: c.winText || '', shop: Array.isArray(c.shop) ? c.shop.slice() : null };
}
function edCountThings(draft, test) {
  var n = 0;
  draft.floors.forEach(function (f) { Object.keys(f.features).forEach(function (k) { if (test(f.features[k])) n++; }); });
  return n;
}
/* Problems the game's checks do not know about: the win condition with
   nothing to win by, and stairs with no partner. */
function edDraftProblems(draft) {
  var out = [], c = edCover(draft);
  var need = { staff: function (ft) { return ft.type === 'staff'; },
               boss: function (ft) { return ft.type === 'monster' && ft.boss; },
               exit: function (ft) { return ft.type === 'exit'; } }[c.win];
  if (!edCountThings(draft, need))
    out.push({ level: 'error', text: 'It is won by \u201c' + ED_WINS[c.win].label.toLowerCase() + '\u201d, but there is ' +
              { staff: 'no staff placed', boss: 'no monster marked as the boss', exit: 'no way out placed' }[c.win] + '. Place one, or change how it is won on the cover.', at: null });
  var copy = JSON.parse(JSON.stringify(draft.floors));
  edLinkStairs(copy).forEach(function (l) {
    out.push({ level: 'error', floor: l.floor, at: l.at, text: 'Floor ' + (l.i + 1) + ' at ' + l.at.join(',') + ': ' +
      (l.top ? 'stairs up from the first floor lead nowhere (the party arrives at the start).'
             : l.type === 'stairsDown' ? 'stairs down with no stairs up on floor ' + (l.i + 2) + ' to arrive at.'
             : 'stairs up with no stairs down on floor ' + l.i + ' to lead to.') });
  });
  return out;
}

/* Every wall in step with its neighbour's? (True for anything these edits make.) */
function edWallsInStep(f) {
  for (var y = 0; y < f.h; y++) for (var x = 0; x < f.w; x++) for (var d = 0; d < 4; d++) {
    var nx = x + ED_DX[d], ny = y + ED_DY[d];
    if (!edIn(f, nx, ny)) { if (!edWall(f, x, y, d)) return false; continue; }
    if (edWall(f, x, y, d) !== edWall(f, nx, ny, (d + 2) % 4)) return false;
  }
  return true;
}

/* The pack a draft makes: the Ashkeld base for monsters, items, classes,
   spells and the town, with the draft's floors in place of Ashkeld's. */
function edPackFrom(draft, base) {
  var pk = JSON.parse(JSON.stringify(base));
  pk.id = 'ws.' + String(draft.slug || 'my-adventure').replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 32);
  pk.name = draft.name || 'My adventure';
  pk.author = draft.author || 'Someone';
  pk.version = '1.0.' + (draft.rev || 0);
  delete pk.generated;
  pk.floors = draft.floors.map(function (f, i) {
    var c = JSON.parse(JSON.stringify(f));
    c.depth = i + 1;
    if (draft.zone && !c.zone) c.zone = draft.zone;
    return c;
  });
  edLinkStairs(pk.floors);
  // below the first floor the party arrives by the stairs: that is the floor's entry
  pk.floors.forEach(function (f, i) {
    if (!i) return;
    var up = edStairs(f, 'stairsUp')[0];
    if (up) f.entry = [up.x, up.y];
  });
  var c = edCover(draft), win = ED_WINS[c.win];
  pk.blurb = c.blurb;
  pk.rules.startingGold = c.gold;
  pk.rules.victory = { flag: win.flag, text: c.winText || win.text };
  // the solver must be able to reach whatever wins it
  pk.floors.forEach(function (f) { Object.keys(f.features).forEach(function (k) {
    var ft = f.features[k];
    if (c.win === 'boss' && ft.type === 'monster' && ft.boss) ft.quest = true;
  }); });
  Object.keys(draft.items || {}).forEach(function (id) { pk.items[id] = JSON.parse(JSON.stringify(draft.items[id])); });
  Object.keys(draft.monsters || {}).forEach(function (id) { pk.monsters[id] = JSON.parse(JSON.stringify(draft.monsters[id])); });
  if (c.shop) pk.shopStock = c.shop.filter(function (id) { return pk.items[id]; });
  pk.testParties = base.testParties || [];
  return pk;
}

/* The game's own checks, as a list of problems with the square they are on. */
function edProblems(pack, validate, solve, draft) {
  var out = [], seen = {};
  if (draft) edDraftProblems(draft).forEach(function (p) { seen[p.text] = 1; out.push(p); });
  var add = function (text, level) {
    if (seen[text]) return; seen[text] = 1;
    var m = /(?:^|\s)(\d+),(\d+)(?:\D|$)/.exec(text), fm = /\b(w\d+)\b/.exec(text);
    out.push({ text: text, level: level, at: m ? [+m[1], +m[2]] : null, floor: fm ? fm[1] : null });
  };
  var v = validate(pack);
  (v.errors || []).forEach(function (t) { add(t, 'error'); });
  if (v.ok) {
    var s = solve(pack);
    (s.errors || []).forEach(function (t) { add(t, 'error'); });
    (s.warnings || []).forEach(function (t) { add(t, 'warning'); });
  } else (v.warnings || []).forEach(function (t) { add(t, 'warning'); });
  return out;
}

/* Undo and redo over whole snapshots of the draft: floors are small. */
function edHistory(limit) { return { past: [], future: [], limit: limit || 80 }; }
function edRecord(h, draft) { h.past.push(JSON.stringify(draft)); if (h.past.length > h.limit) h.past.shift(); h.future = []; }
function edUndo(h, draft) { if (!h.past.length) return null; h.future.push(JSON.stringify(draft)); return JSON.parse(h.past.pop()); }
function edRedo(h, draft) { if (!h.future.length) return null; h.past.push(JSON.stringify(draft)); return JSON.parse(h.future.pop()); }

function edNewDraft(size, start) {
  return { v: 1, name: 'My adventure', author: '', slug: 'my-adventure', zone: 'damp', rev: 0,
           floors: [edNewFloor(size, size, start, 'w1')] };
}
/* ==== EDITOR CORE END ==== */


/* ---------------------------------------------------------------------------
   The page: the Workshop screen. Everything below touches the DOM. */
(function () {
  if (typeof document === 'undefined') return;

  var WS = { draft: null, hist: edHistory(), tool: 'carve', thing: 'monster', terrain: 'water', fi: 0,
             linkFrom: null, region: null, block: null, clip: null, pasting: false, hover: null, look: null, lookF: 1,
             sel: null, drag: null, zoom: 0, problems: [], timer: 0 };
  var DRAFT_KEY = function () { return (typeof MSDD_NS !== 'undefined' ? MSDD_NS : '') + 'msdd_workshop'; };

  var TOOLS = [
    ['carve', 'Carve', 'Drag to carve a room or corridor out of rock'],
    ['rock', 'Fill', 'Drag to fill squares back in with rock'],
    ['wall', 'Walls', 'Tap the edge of a square to add or take away a wall'],
    ['terrain', 'Terrain', 'Paint water, embers, webs and more'],
    ['thing', 'Things', 'Place monsters, doors, chests, traps and goals'],
    ['entry', 'Start', 'Where the party arrives: tap again to turn them'],
    ['erase', 'Erase', 'Clear things and terrain from squares'],
    ['select', 'Inspect', 'Tap a thing to change its settings, and look from that square in 3D'],
    ['link', 'Link', 'Tap a lever or plate, then what it opens. Or a teleporter, then where it sends you'],
    ['region', 'Regions', 'Name the rooms and paint them onto squares'],
    ['block', 'Select', 'Drag to select a block: copy, cut, paste, turn, mirror, or stamp a ready-made room']
  ];

  function el(id) { return document.getElementById(id); }
  function escH(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function F() { if (WS.fi >= WS.draft.floors.length) WS.fi = WS.draft.floors.length - 1; return WS.draft.floors[WS.fi]; }

  /* ---- markup and style ---- */
  var css = document.createElement('style');
  css.textContent = [
    '#workshop{position:fixed;inset:0;z-index:40;background:var(--ink);display:none;flex-direction:column;color:var(--text)}',
    '#workshop.on{display:flex}',
    '#wsHead{display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--line);flex-wrap:wrap}',
    '#wsHead h2{font-size:13px;margin:0;color:var(--gold);letter-spacing:.04em;white-space:nowrap}',
    '#wsHead input{height:32px;min-width:0;flex:1 1 160px;background:rgba(255,255,255,.03);color:var(--text);border:1px solid var(--line);padding:0 8px;font-size:13px}',
    '#wsHead button{height:32px;min-height:0;padding:0 10px;font-size:11px}',
    '#wsHead .go{border-color:var(--gold);color:var(--gold)}',
    '#wsBody{flex:1;display:grid;grid-template-columns:150px 1fr 260px;min-height:0}',
    '#wsTools{border-right:1px solid var(--line);padding:8px;display:flex;flex-direction:column;gap:5px;overflow:auto}',
    '#wsTools button{height:34px;min-height:0;font-size:11px;text-align:left;padding:0 10px}',
    '#wsTools button[aria-pressed="true"]{border-color:var(--gold);color:var(--gold);background:rgba(201,162,74,.09)}',
    '#wsTools select{width:100%;height:32px;background:var(--ink);color:var(--text);border:1px solid var(--line);font-size:11px}',
    '#wsTools .lbl{font:10px/1.4 ui-monospace,Menlo,monospace;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-top:6px}',
    '#wsGridWrap{position:relative;overflow:auto;min-height:0;background:#0b0907}',
    '#wsGrid{display:block;touch-action:none;margin:12px auto;cursor:crosshair}',
    '#wsZoom{position:sticky;left:8px;top:8px;display:flex;gap:4px;z-index:2;width:max-content}',
    '#wsZoom button{width:32px;height:30px;min-height:0;padding:0;font-size:13px}',
    '#wsSide{border-left:1px solid var(--line);padding:10px;overflow:auto;display:flex;flex-direction:column;gap:12px;font-size:12px}',
    '#wsSide > div{flex:0 0 auto}',
    '#wsSide h3{font:600 10px/1.4 ui-monospace,Menlo,monospace;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px}',
    '#wsInspect label{display:flex;flex-direction:column;gap:3px;margin:0 0 8px;font-size:11px;color:var(--text-dim)}',
    '#wsInspect input,#wsInspect select,#wsInspect textarea{background:rgba(255,255,255,.03);color:var(--text);border:1px solid var(--line);font-size:12px;padding:5px 6px;font-family:inherit}',
    '#wsInspect textarea{min-height:54px;resize:vertical}',
    '#wsProblems{list-style:none;margin:0;padding:0}',
    '#wsProblems li{padding:6px 8px;border:1px solid var(--line);margin:0 0 5px;cursor:pointer;line-height:1.45}',
    '#wsProblems li.error{border-color:#7a3a2a;color:#f0b8a8}',
    '#wsProblems li.warning{color:var(--text-dim)}',
    '#wsProblems li.okay{border-color:#3f5a32;color:#b9d8a6;cursor:default}',
    '#wsStatus{font-size:11px;color:var(--text-dim);min-height:15px}',
    '#wsViewBox{position:relative;width:100%;padding-top:75%;background:#000;border:1px solid var(--line);overflow:hidden}',
    '#wsView{position:absolute;inset:0;width:100%!important;height:100%!important;display:block}',
    '#wsViewBar{display:flex;gap:4px;margin-top:4px}',
    '#wsViewBar button{flex:1;height:28px;min-height:0;font-size:11px;padding:0}',
    '#wsToolPanel button{height:30px;min-height:0;font-size:11px;padding:0 8px;margin:0 4px 4px 0}',
    '#wsToolPanel input,#wsToolPanel textarea,#wsToolPanel select{width:100%;background:rgba(255,255,255,.03);color:var(--text);border:1px solid var(--line);font-size:12px;padding:5px 6px;font-family:inherit;margin:0 0 6px;box-sizing:border-box}',
    '#wsToolPanel .reg{display:flex;align-items:center;gap:6px;margin:0 0 4px}',
    '#wsToolPanel .reg button[aria-pressed="true"]{border-color:var(--gold);color:var(--gold)}',
    '#wsToolPanel .sw{width:12px;height:12px;flex:0 0 12px;border:1px solid rgba(255,255,255,.3)}',
    '#wsFloors{display:flex;gap:4px;align-items:center;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid var(--line)}',
    '#wsFloors button{height:28px;min-height:0;font-size:11px;padding:0 9px}',
    '#wsFloors button[aria-pressed="true"]{border-color:var(--gold);color:var(--gold);background:rgba(201,162,74,.09)}',
    '#wsFloors input{height:28px;width:150px;background:rgba(255,255,255,.03);color:var(--text);border:1px solid var(--line);font-size:12px;padding:0 7px}',
    '#wsFloors .sep{flex:1}',
    '#wsCover{position:fixed;inset:0;z-index:46;background:rgba(0,0,0,.72);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 10px}',
    '#wsCover.on{display:flex}',
    '#wsCover .box{background:var(--ink);border:1px solid var(--gold);padding:16px;max-width:560px;width:100%}',
    '#wsCover h3{color:var(--gold);font-size:13px;margin:0 0 10px}',
    '#wsCover label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-dim);margin:0 0 10px}',
    '#wsCover input,#wsCover textarea,#wsCover select{background:rgba(255,255,255,.03);color:var(--text);border:1px solid var(--line);font-size:13px;padding:6px 8px;font-family:inherit}',
    '#wsCover textarea{min-height:56px;resize:vertical}',
    '#wsShop{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:2px 10px;max-height:220px;overflow:auto;border:1px solid var(--line);padding:6px 8px}',
    '#wsShop label{flex-direction:row;align-items:center;gap:6px;margin:0;color:var(--text);font-size:11.5px}',
    '#wsCover .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}',
    '#wsLib{position:fixed;inset:0;z-index:46;background:rgba(0,0,0,.72);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 10px}',
    '#wsLib.on{display:flex}',
    '#wsLib .box{background:var(--ink);border:1px solid var(--gold);padding:16px;max-width:640px;width:100%}',
    '#wsLib h3{color:var(--gold);font-size:13px;margin:0 0 4px}',
    '#wsLib .intro{font-size:11px;color:var(--text-dim);margin:0 0 10px;line-height:1.5}',
    '#wsLibList{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 12px}',
    '#wsLibList button{height:30px;min-height:0;font-size:11px;padding:0 10px}',
    '#wsLibList button[aria-pressed="true"]{border-color:var(--gold);color:var(--gold)}',
    '#wsLibForm label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-dim);margin:0 0 9px}',
    '#wsLibForm .row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}',
    '#wsLibForm .row label{flex:1 1 90px}',
    '#wsLibForm input,#wsLibForm textarea,#wsLibForm select{background:rgba(255,255,255,.03);color:var(--text);border:1px solid var(--line);font-size:13px;padding:6px 8px;font-family:inherit;min-width:0}',
    '#wsLibForm textarea{min-height:48px;resize:vertical}',
    '#wsLibForm fieldset{border:1px solid var(--line);padding:8px 10px 2px;margin:0 0 10px}',
    '#wsLibForm legend{font-size:11px;color:var(--gold);padding:0 4px}',
    '#wsLib .acts{display:flex;gap:8px;justify-content:space-between;margin-top:6px;flex-wrap:wrap}',
    '#wsTest{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:45;display:none;gap:8px;align-items:center;',
    '  background:var(--ink);border:1px solid var(--gold);padding:5px 6px 5px 12px;font-size:11px;color:var(--gold);box-shadow:0 6px 24px rgba(0,0,0,.6)}',
    '#wsTest.on{display:flex}',
    '#wsTest button{height:28px;min-height:0;font-size:11px;padding:0 10px}',
    '#wsNew{position:absolute;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:5}',
    '#wsNew.on{display:flex}',
    '#wsNew .box{background:var(--ink);border:1px solid var(--gold);padding:16px;max-width:380px;width:92%}',
    '#wsNew .row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 12px}',
    '#wsNew .row button{min-width:58px;height:38px;font-size:12px}',
    '#wsNew .row button[aria-pressed="true"]{border-color:var(--gold);color:var(--gold)}',
    '#wsMore{display:none}',
    '@media (max-width:760px){',
    '  #wsMore{display:inline-block}',
    '  #wsHead h2{display:none}',
    '  #wsHead:not(.more) #wsNewBtn,#wsHead:not(.more) #wsExport,#wsHead:not(.more) #wsImport,#wsHead:not(.more) #wsParty,',
    '  #wsHead:not(.more) #wsCoverBtn,#wsHead:not(.more) #wsItemsBtn,#wsHead:not(.more) #wsMonBtn,#wsHead:not(.more) #wsKeep{display:none}',
    '  #wsHead input#wsName{flex:1 1 100%}',
    '  #wsGridWrap{min-height:48vh}',
    '  #wsFloors{padding:4px 6px}',
    '  #wsBody{grid-template-columns:1fr;grid-template-rows:auto 1fr auto}',
    '  #wsTools{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--line);padding:6px}',
    '  #wsTools button{flex:1 1 22%;text-align:center;padding:0 4px}',
    '  #wsTools .lbl{flex:1 1 100%;margin:2px 0 0}',
    '  #wsTools select{flex:1 1 100%}',
    '  #wsSide{border-left:0;border-top:1px solid var(--line);max-height:34vh}',
    '}'
  ].join('\n');
  document.head.appendChild(css);

  var root = document.createElement('div');
  root.id = 'workshop';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'The Workshop');
  root.innerHTML =
    '<div id="wsHead"><h2>The Workshop</h2>' +
    '<input id="wsName" maxlength="40" placeholder="Name your adventure" aria-label="Adventure name">' +
    '<button id="wsUndo" title="Undo (Ctrl+Z)">Undo</button><button id="wsRedo" title="Redo (Ctrl+Y)">Redo</button>' +
    '<button id="wsNewBtn">New floor…</button><button id="wsExport" title="Save the adventure as a pack file">Export</button>' +
    '<button id="wsImport">Import…</button><input type="file" id="wsFile" accept="application/json,.json" hidden>' +
    '<select id="wsParty" aria-label="Play-test party" style="height:32px;background:var(--ink);color:var(--text);border:1px solid var(--line);font-size:11px"></select>' +
    '<button id="wsPlay" class="go" title="Play it now with a ready-made party">Play-test</button>' +
    '<button id="wsCoverBtn" title="Name, story, how it is won, what the shop sells">Cover\u2026</button>' +
    '<button id="wsItemsBtn" title="Your own items">Items\u2026</button><button id="wsMonBtn" title="Your own monsters">Monsters\u2026</button>' +
    '<button id="wsKeep" title="Keep it in your adventures, to play from the New Game list">Save to my adventures</button>' +
    '<button id="wsMore" aria-expanded="false">More \u25be</button>' +
    '<button id="wsClose">Close</button></div>' +
    '<div id="wsFloors"></div>' +
    '<div id="wsBody"><div id="wsTools"></div>' +
    '<div id="wsGridWrap"><div id="wsZoom"><button id="wsZoomOut" aria-label="Zoom out">−</button>' +
    '<button id="wsZoomIn" aria-label="Zoom in">+</button><button id="wsFit" style="width:auto;padding:0 8px">Fit</button></div>' +
    '<canvas id="wsGrid"></canvas>' +
    '<div id="wsNew"><div class="box"><h3 style="color:var(--gold);font-size:13px;margin:0 0 8px">A new floor</h3>' +
    '<div style="font-size:11px;color:var(--text-dim)">Size</div><div class="row" id="wsNewSize"></div>' +
    '<div style="font-size:11px;color:var(--text-dim)">Start from</div><div class="row" id="wsNewStart"></div>' +
    '<p style="font-size:11px;color:var(--text-dim);margin:0 0 10px">This replaces the floor you have (Undo brings it back).</p>' +
    '<div class="row" style="justify-content:flex-end;margin:0"><button id="wsNewCancel">Cancel</button><button id="wsNewGo" class="go">Make it</button></div></div></div>' +
    '</div>' +
    '<div id="wsSide"><div><h3>The view</h3><div id="wsViewBox"><canvas id="wsView"></canvas></div><div id="wsViewBar">' +
    '<button id="wsLookL" title="Turn left">\u21b6</button><button id="wsLookFwd" title="Step forward">\u2191</button><button id="wsLookR" title="Turn right">\u21b7</button></div>' +
    '<p id="wsViewNote" style="font-size:10.5px;color:var(--text-dim);margin:4px 0 0">Inspect a square to look from it.</p></div>' +
    '<div id="wsToolPanel"></div><div><h3>Selected</h3><div id="wsInspect"><p style="color:var(--text-dim);margin:0">Use Inspect and tap a thing to change it.</p></div></div>' +
    '<div><h3>Checks</h3><ul id="wsProblems"></ul></div><div id="wsStatus"></div></div></div>';
  document.body.appendChild(root);

  var cover = document.createElement('div');
  cover.id = 'wsCover';
  cover.innerHTML = '<div class="box" role="dialog" aria-label="The cover"><h3>The cover</h3>' +
    '<label>Author<input id="wsAuthor" maxlength="40" placeholder="Your name"></label>' +
    '<label>What it is about (shown in the New Game list)<textarea id="wsBlurb" maxlength="200"></textarea></label>' +
    '<label>How it is won<select id="wsWin"></select></label>' +
    '<label>What the party reads when they win<textarea id="wsWinText" maxlength="200"></textarea></label>' +
    '<label>Starting gold<input id="wsGold" type="number" min="0" max="5000" step="10" inputmode="numeric"></label>' +
    '<label>What Simz sells in town <span><button type="button" id="wsShopAll" style="height:24px;min-height:0;font-size:10px;padding:0 8px">All</button> <button type="button" id="wsShopNone" style="height:24px;min-height:0;font-size:10px;padding:0 8px">None</button> <button type="button" id="wsShopStd" style="height:24px;min-height:0;font-size:10px;padding:0 8px">As Ashkeld</button></span></label>' +
    '<div id="wsShop"></div>' +
    '<div class="acts"><button id="wsCoverCancel">Cancel</button><button id="wsCoverOk" class="go">Done</button></div></div>';
  document.body.appendChild(cover);

  var lib = document.createElement('div');
  lib.id = 'wsLib';
  lib.innerHTML = '<div class="box" role="dialog" aria-labelledby="wsLibTitle"><h3 id="wsLibTitle"></h3><p class="intro" id="wsLibIntro"></p>' +
    '<div id="wsLibList"></div><div id="wsLibForm"></div>' +
    '<p id="wsLibNote" style="font-size:11px;color:var(--text-dim);min-height:15px;margin:0 0 6px"></p>' +
    '<div class="acts"><button id="wsLibDel">Delete it</button><span style="flex:1"></span><button id="wsLibClose">Close</button><button id="wsLibSave" class="go">Save it</button></div></div>';
  document.body.appendChild(lib);

  var bar = document.createElement('div');
  bar.id = 'wsTest';
  bar.innerHTML = '<span>Play-testing — nothing here is saved</span><button id="wsLeave">Back to the Workshop</button>';
  document.body.appendChild(bar);

  /* ---- tools panel ---- */
  function renderTools() {
    var h = el('wsTools'); h.innerHTML = '';
    TOOLS.forEach(function (t) {
      var b = document.createElement('button');
      b.textContent = t[1]; b.title = t[2];
      b.setAttribute('aria-pressed', WS.tool === t[0] ? 'true' : 'false');
      b.addEventListener('click', function () { WS.tool = t[0]; WS.linkFrom = null; WS.pasting = false; renderTools(); renderToolPanel(); draw(); });
      h.appendChild(b);
    });
    if (WS.tool === 'thing' || WS.tool === 'terrain') {
      var lab = document.createElement('div'); lab.className = 'lbl';
      lab.textContent = WS.tool === 'thing' ? 'Place' : 'Paint';
      h.appendChild(lab);
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', lab.textContent);
      (WS.tool === 'thing' ? ED_THINGS.map(function (t) { return [t.id, t.label]; })
                           : ED_TERRAIN.map(function (t) { return [t, t.charAt(0).toUpperCase() + t.slice(1)]; }))
        .forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); });
      sel.value = WS.tool === 'thing' ? WS.thing : WS.terrain;
      sel.addEventListener('change', function () { if (WS.tool === 'thing') WS.thing = sel.value; else WS.terrain = sel.value; });
      h.appendChild(sel);
    }
  }

  /* The game's items and monsters with the draft's own among them. */
  function allItems() { var o = {}, b = BUNDLED_BASE.items; Object.keys(b).forEach(function (k) { o[k] = b[k]; }); Object.keys(WS.draft.items || {}).forEach(function (k) { o[k] = WS.draft.items[k]; }); return o; }
  function allMonsters() { var o = {}, b = BUNDLED_BASE.monsters; Object.keys(b).forEach(function (k) { o[k] = b[k]; }); Object.keys(WS.draft.monsters || {}).forEach(function (k) { o[k] = WS.draft.monsters[k]; }); return o; }

  /* ---- the floors ---- */
  function renderFloors() {
    var h = el('wsFloors'); h.innerHTML = '';
    var lab = document.createElement('span'); lab.textContent = 'Floors'; lab.style.cssText = 'font:10px ui-monospace,Menlo,monospace;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-right:4px';
    h.appendChild(lab);
    WS.draft.floors.forEach(function (f, i) {
      var b = document.createElement('button'); b.textContent = String(i + 1); b.title = f.name;
      b.setAttribute('aria-pressed', i === WS.fi ? 'true' : 'false');
      b.addEventListener('click', function () { WS.fi = i; WS.sel = null; WS.block = null; WS.region = null; renderFloors(); renderToolPanel(); inspect(); draw(); });
      h.appendChild(b);
    });
    var add = document.createElement('button'); add.textContent = '+ Floor'; add.title = 'Add a floor below the last';
    add.addEventListener('click', function () {
      var cur = F();
      change(function () { WS.fi = edAddFloor(WS.draft, cur.w, cur.h, 'rock'); return true; });
      renderFloors(); inspect(); draw(); status('Floor ' + (WS.fi + 1) + ' added below. Stairs down on floor ' + WS.fi + ' put stairs up on the same square here.');
    });
    h.appendChild(add);
    var nm = document.createElement('input'); nm.value = F().name || ''; nm.maxLength = 40; nm.setAttribute('aria-label', 'Floor name');
    nm.addEventListener('change', function () { var v = nm.value.trim() || 'Level ' + (WS.fi + 1); change(function () { F().name = v; return true; }); });
    h.appendChild(nm);
    if (typeof MSDDMat !== 'undefined' && MSDDMat.ZONES) {
      var zs = document.createElement('select'); zs.setAttribute('aria-label', 'Look of this floor'); zs.title = 'How this floor looks in 3D';
      zs.style.cssText = 'height:28px;background:var(--ink);color:var(--text);border:1px solid var(--line);font-size:11px';
      zs.innerHTML = '<option value="">Look: as the game picks</option>' + Object.keys(MSDDMat.ZONES).map(function (z) { return '<option value="' + z + '"' + (F().zone === z ? ' selected' : '') + '>Look: ' + (MSDDMat.ZONES[z].name || z) + '</option>'; }).join('');
      zs.addEventListener('change', function () { change(function () { if (zs.value) F().zone = zs.value; else delete F().zone; return true; }); });
      h.appendChild(zs);
    }
    var sp = document.createElement('span'); sp.className = 'sep'; h.appendChild(sp);
    [['\u2191', 'Move this floor up', -1], ['\u2193', 'Move this floor down', 1]].forEach(function (m) {
      var b = document.createElement('button'); b.textContent = m[0]; b.title = m[1];
      b.disabled = WS.fi + m[2] < 0 || WS.fi + m[2] >= WS.draft.floors.length;
      b.addEventListener('click', function () { var j = WS.fi + m[2]; if (change(function () { return edMoveFloor(WS.draft, WS.fi, m[2]); })) WS.fi = j; renderFloors(); draw(); });
      h.appendChild(b);
    });
    var del = document.createElement('button'); del.textContent = 'Remove floor'; del.disabled = WS.draft.floors.length <= 1;
    del.addEventListener('click', function () {
      change(function () { return edRemoveFloor(WS.draft, WS.fi); });
      WS.fi = Math.max(0, WS.fi - 1); WS.sel = null; renderFloors(); inspect(); draw();
      status('Floor removed. Undo brings it back.');
    });
    h.appendChild(del);
  }

  var REG_COL = ['#c9a24a', '#5a9ac9', '#9ac95a', '#c95a8a', '#8a5ac9', '#c97a3a', '#3ac9a8', '#c9c93a'];
  function regionColour(f, id) { var ks = Object.keys(f.regions || {}); return REG_COL[Math.max(0, ks.indexOf(id)) % REG_COL.length]; }

  /* ---- drawing ---- */
  var TERR_COL = { water: '#2c5a78', embers: '#8a3a18', fog: '#5a5a64', antimagic: '#4a2a6a', holy: '#8a7a3a', rubble: '#5a4a3a',
                   web: '#7a7a7a', chasm: '#000000', bridge: '#6a4a2a', ice: '#7aa8c8', rotten: '#4a3a1a', pillars: '#6a6258' };
  function cellPx() {
    var f = F(), wrap = el('wsGridWrap');
    var fit = Math.max(10, Math.floor(Math.min((wrap.clientWidth - 24) / f.w, (wrap.clientHeight - 60) / f.h)));
    return Math.max(8, Math.min(64, fit + WS.zoom * 4));
  }
  function draw() {
    var f = F(), cv = el('wsGrid'), s = cellPx(), dpr = window.devicePixelRatio || 1;
    cv.width = f.w * s * dpr; cv.height = f.h * s * dpr;
    cv.style.width = f.w * s + 'px'; cv.style.height = f.h * s + 'px';
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#16120e'; g.fillRect(0, 0, f.w * s, f.h * s);
    var bad = {};
    WS.problems.forEach(function (p) { if (p.level === 'error' && p.at && (!p.floor || p.floor === f.id)) bad[edKey(p.at[0], p.at[1])] = 1; });
    for (var y = 0; y < f.h; y++) for (var x = 0; x < f.w; x++) {
      var px = x * s, py = y * s, k = edKey(x, y);
      if (edRock(f, x, y)) {
        g.fillStyle = '#100d0a'; g.fillRect(px, py, s, s);
        var up = WS.fi > 0 ? WS.draft.floors[WS.fi - 1] : null;      // the floor above, faintly, to line things up
        if (up && edIn(up, x, y) && !edRock(up, x, y)) { g.fillStyle = 'rgba(120,150,200,.10)'; g.fillRect(px, py, s, s); }
        g.strokeStyle = 'rgba(255,255,255,.035)'; g.strokeRect(px + .5, py + .5, s - 1, s - 1);
        continue;
      }
      g.fillStyle = '#3a3128'; g.fillRect(px, py, s, s);
      var t = f.terrain[k];
      if (t) { g.globalAlpha = .75; g.fillStyle = TERR_COL[t] || '#555'; g.fillRect(px + 1, py + 1, s - 2, s - 2); g.globalAlpha = 1; }
      var rg = f.regionMap && f.regionMap[k];
      if (rg && (WS.tool === 'region' || !t)) { g.globalAlpha = WS.tool === 'region' ? .32 : .12; g.fillStyle = regionColour(f, rg); g.fillRect(px, py, s, s); g.globalAlpha = 1; }
      if (bad[k]) { g.strokeStyle = '#e0573a'; g.lineWidth = 2; g.strokeRect(px + 2, py + 2, s - 4, s - 4); g.lineWidth = 1; }
      var ft = f.features[k];
      if (ft) {
        var th = ED_THINGS.filter(function (q) { var m = q.make(); return m.type === ft.type && (q.id !== 'lockedDoor' || ft.locked) && (q.id !== 'door' || !ft.locked); })[0];
        g.fillStyle = ft.type === 'monster' ? '#e07a5a' : ft.type === 'staff' || ft.type === 'exit' ? '#f2c45a' : ft.type === 'trap' ? '#d05050' : '#e8dcc8';
        g.font = Math.round(s * .62) + 'px ui-sans-serif,system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(th ? th.glyph : '?', px + s / 2, py + s / 2 + 1);
      }
      if (WS.sel && WS.sel[0] === x && WS.sel[1] === y) { g.strokeStyle = '#f2c45a'; g.lineWidth = 2; g.strokeRect(px + 1, py + 1, s - 2, s - 2); g.lineWidth = 1; }
    }
    // walls
    g.strokeStyle = '#d8c8a8'; g.lineWidth = Math.max(2, s / 10); g.lineCap = 'square';
    g.beginPath();
    for (y = 0; y < f.h; y++) for (x = 0; x < f.w; x++) {
      if (edRock(f, x, y)) continue;
      px = x * s; py = y * s;
      if (edWall(f, x, y, 0)) { g.moveTo(px, py); g.lineTo(px + s, py); }
      if (edWall(f, x, y, 1)) { g.moveTo(px + s, py); g.lineTo(px + s, py + s); }
      if (edWall(f, x, y, 2)) { g.moveTo(px, py + s); g.lineTo(px + s, py + s); }
      if (edWall(f, x, y, 3)) { g.moveTo(px, py); g.lineTo(px, py + s); }
    }
    g.stroke(); g.lineWidth = 1;
    // the entry, as an arrow (the first floor only)
    if (WS.fi === 0) {
    var ex = f.entry[0] * s + s / 2, ey = f.entry[1] * s + s / 2, a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][f.entryFacing];
    g.save(); g.translate(ex, ey); g.rotate(a); g.fillStyle = '#7fd08a';
    g.beginPath(); g.moveTo(s * .34, 0); g.lineTo(-s * .22, -s * .24); g.lineTo(-s * .22, s * .24); g.closePath(); g.fill(); g.restore();
    }
    // links: lever to gate, teleporter to landing
    edLinks(f).forEach(function (l) {
      var a = l.from.split(',').map(Number), b2 = l.to.split(',').map(Number);
      g.strokeStyle = l.kind === 'tele' ? 'rgba(160,120,230,.85)' : 'rgba(242,196,90,.85)'; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(a[0] * s + s / 2, a[1] * s + s / 2); g.lineTo(b2[0] * s + s / 2, b2[1] * s + s / 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(b2[0] * s + s / 2, b2[1] * s + s / 2, Math.max(2, s / 8), 0, Math.PI * 2); g.fill(); g.lineWidth = 1;
    });
    if (WS.linkFrom && WS.tool === 'link') { var lf = WS.linkFrom.split(',').map(Number); g.strokeStyle = '#f2c45a'; g.lineWidth = 3; g.strokeRect(lf[0] * s + 2, lf[1] * s + 2, s - 4, s - 4); g.lineWidth = 1; }
    // the 3D view's eye
    if (WS.look && WS.look.fi === WS.fi) {
      var lx = WS.look.x * s + s / 2, ly = WS.look.y * s + s / 2, la = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][WS.lookF];
      g.save(); g.translate(lx, ly); g.rotate(la); g.strokeStyle = '#7fd0ff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-s * .2, -s * .3); g.lineTo(s * .35, 0); g.lineTo(-s * .2, s * .3); g.stroke(); g.restore(); g.lineWidth = 1;
    }
    // the selected block, and a paste waiting for its place
    if (WS.block && WS.tool === 'block') {
      var bb = WS.block; g.strokeStyle = '#7fd0ff'; g.setLineDash([4, 3]); g.lineWidth = 2;
      g.strokeRect(bb.x0 * s + 1, bb.y0 * s + 1, (bb.x1 - bb.x0 + 1) * s - 2, (bb.y1 - bb.y0 + 1) * s - 2); g.setLineDash([]); g.lineWidth = 1;
    }
    if (WS.pasting && WS.clip && WS.hover) {
      g.fillStyle = 'rgba(127,208,255,.18)'; g.strokeStyle = '#7fd0ff';
      g.fillRect(WS.hover[0] * s, WS.hover[1] * s, WS.clip.w * s, WS.clip.h * s);
      g.strokeRect(WS.hover[0] * s + .5, WS.hover[1] * s + .5, WS.clip.w * s - 1, WS.clip.h * s - 1);
    }
    // a drag in progress
    if (WS.drag && (WS.tool === 'carve' || WS.tool === 'rock' || WS.tool === 'block') && !WS.pasting) {
      var d = WS.drag, x0 = Math.min(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), x1 = Math.max(d.x0, d.x1), y1 = Math.max(d.y0, d.y1);
      g.fillStyle = WS.tool === 'carve' ? 'rgba(127,208,138,.25)' : WS.tool === 'block' ? 'rgba(127,208,255,.15)' : 'rgba(0,0,0,.45)';
      g.fillRect(x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
      g.strokeStyle = '#f2c45a'; g.strokeRect(x0 * s + .5, y0 * s + .5, (x1 - x0 + 1) * s - 1, (y1 - y0 + 1) * s - 1);
    }
  }

  /* ---- editing ---- */
  function change(fn) {                    // record, apply, save, check
    var before = JSON.stringify(WS.draft);
    edRecord(WS.hist, WS.draft);
    var ok = fn();
    if (!ok || JSON.stringify(WS.draft) === before) { WS.hist.past.pop(); return false; }
    WS.draft.rev = (WS.draft.rev || 0) + 1;
    afterChange();
    return true;
  }
  function afterChange() {
    saveDraft(); draw(); preview();
    clearTimeout(WS.timer); WS.timer = setTimeout(runChecks, 250);
  }
  function saveDraft() { try { localStorage.setItem(DRAFT_KEY(), JSON.stringify(WS.draft)); } catch (e) {} }
  function loadDraft() {
    try { var d = JSON.parse(localStorage.getItem(DRAFT_KEY()) || 'null'); if (d && d.floors && d.floors[0] && d.floors[0].cells) return d; } catch (e) {}
    return null;
  }
  function packNow() { return edPackFrom(WS.draft, BUNDLED_BASE || BUNDLED_PACK); }
  function runChecks() {
    var pk = packNow();
    try { WS.problems = edProblems(pk, validatePack, proveSolvable, WS.draft); }
    catch (e) { WS.problems = [{ text: 'The check failed: ' + e.message, level: 'error', at: null }]; }
    var ul = el('wsProblems'); ul.innerHTML = '';
    var errs = WS.problems.filter(function (p) { return p.level === 'error'; }).length;
    if (!WS.problems.length) { ul.innerHTML = '<li class="okay">All clear: it can be played from start to goal.</li>'; }
    WS.problems.forEach(function (p) {
      var li = document.createElement('li'); li.className = p.level; li.textContent = p.text;
      if (p.at) { li.title = 'Show the square'; li.addEventListener('click', function () {
        var fi = p.floor ? WS.draft.floors.map(function (f) { return f.id; }).indexOf(p.floor) : -1;
        if (fi >= 0) WS.fi = fi;
        WS.sel = p.at; renderFloors(); draw(); inspect(); }); }
      ul.appendChild(li);
    });
    el('wsPlay').disabled = errs > 0;
    el('wsKeep').disabled = errs > 0;
    el('wsPlay').title = errs ? 'Clear the problems first' : 'Play it now with a ready-made party';
    draw();
  }

  function cellAt(ev) {
    var cv = el('wsGrid'), r = cv.getBoundingClientRect(), s = cellPx();
    var fx = (ev.clientX - r.left) / s, fy = (ev.clientY - r.top) / s;
    var x = Math.floor(fx), y = Math.floor(fy);
    return { x: x, y: y, fx: fx - x, fy: fy - y, ok: edIn(F(), x, y) };
  }
  function nearestSide(c) {
    var d = [c.fy, 1 - c.fx, 1 - c.fy, c.fx], best = 0;
    for (var i = 1; i < 4; i++) if (d[i] < d[best]) best = i;
    return best;
  }
  function applyAt(c, first) {
    var f = F();
    if (!c.ok) return;
    if (WS.tool === 'terrain') change(function () { return edPaint(f, c.x, c.y, WS.terrain); });
    else if (WS.tool === 'erase') change(function () { var a = edPlace(f, c.x, c.y, null), b = edPaint(f, c.x, c.y, null); return a || b; });
    else if (!first) return;
    else if (WS.tool === 'wall') {
      var d = nearestSide(c);
      change(function () { return edSetWall(f, c.x, c.y, d, !edWall(f, c.x, c.y, d)); });
    } else if (WS.tool === 'thing') {
      var th = edThing(WS.thing);
      var paired = false;
      if (th && change(function () {
        var ok = edPlace(f, c.x, c.y, th.make());
        if (ok && (th.id === 'stairsDown' || th.id === 'stairsUp')) paired = edPairStairs(WS.draft, WS.fi, c.x, c.y, th.id);
        return ok;
      })) {
        WS.sel = [c.x, c.y]; inspect(); draw();
        if (paired) status('And ' + (th.id === 'stairsDown' ? 'stairs up on floor ' + (WS.fi + 2) : 'stairs down on floor ' + WS.fi) + ', on the same square.');
      }
    } else if (WS.tool === 'entry' && WS.fi > 0) {
      status('Only the first floor has a start. Deeper floors begin where their stairs up arrive.');
    } else if (WS.tool === 'entry') {
      var same = f.entry[0] === c.x && f.entry[1] === c.y;
      change(function () { return edSetEntry(f, c.x, c.y, same ? f.entryFacing + 1 : f.entryFacing); });
    } else if (WS.tool === 'select') {
      WS.sel = [c.x, c.y];
      if (!edRock(f, c.x, c.y)) { if (!WS.look || WS.look.x !== c.x || WS.look.y !== c.y || WS.look.fi !== WS.fi) WS.lookF = bestFacing(f, c.x, c.y); WS.look = { fi: WS.fi, x: c.x, y: c.y }; }
      inspect(); draw(); preview();
    } else if (WS.tool === 'link') {
      var k = edKey(c.x, c.y), ft = f.features[k];
      if (!WS.linkFrom) {
        if (ft && (ED_OPENERS.indexOf(ft.type) >= 0 || ft.type === 'teleporter')) { WS.linkFrom = k; status(ft.type === 'teleporter' ? 'Now tap the square it sends the party to.' : 'Now tap the portcullis, door or grate it opens.'); }
        else if (ft && ED_GATES.indexOf(ft.type) >= 0 && ft.needsLever) { change(function () { return edUnlink(f, k); }); status('Unlinked.'); }
        else status('Tap a lever, a plate or a teleporter first. Tap a linked gate to unlink it.');
      } else {
        var from = WS.linkFrom, src = f.features[from]; WS.linkFrom = null;
        if (src && src.type === 'teleporter') { if (change(function () { return edAim(f, from, c.x, c.y); })) status('The teleporter sends the party to ' + k + '.'); else status('Not there: pick an open square.'); }
        else if (change(function () { return edLink(WS.draft, f, from, k); })) status('Linked: ' + (src.type === 'plate' ? 'the plate' : 'the lever') + ' opens the ' + (f.features[k].type === 'secretDoor' ? 'grate' : f.features[k].type) + '.');
        else status('That cannot be opened by a lever: pick a portcullis, a door or a grate.');
      }
      draw();
    } else if (WS.tool === 'region') {
      var filled = 0;
      change(function () { filled = edFloodRegion(f, c.x, c.y, WS.region); return filled > 0; });
      if (filled) status((WS.region ? 'The room is now ' + ((f.regions || {})[WS.region] || {}).name : 'Painted out') + ' (' + filled + ' squares). Drag to paint square by square.');
    } else if (WS.tool === 'block' && WS.pasting && WS.clip) {
      var clip = WS.clip;
      if (change(function () { return edPaste(f, clip, c.x, c.y); })) { status('Pasted. Tap again to paste another, or choose another tool.'); WS.block = { x0: c.x, y0: c.y, x1: Math.min(f.w - 1, c.x + clip.w - 1), y1: Math.min(f.h - 1, c.y + clip.h - 1) }; }
    }
  }
  function bestFacing(f, x, y) {                 // look down the longest open run
    var best = 1, len = -1;
    for (var d = 0; d < 4; d++) { var n = 0, cx = x, cy = y; while (n < 20 && !edWall(f, cx, cy, d)) { cx += ED_DX[d]; cy += ED_DY[d]; n++; } if (n > len) { len = n; best = d; } }
    return best;
  }

  var cv = el('wsGrid');
  cv.addEventListener('pointerdown', function (ev) {
    var c = cellAt(ev); if (!c.ok) return;
    cv.setPointerCapture(ev.pointerId);
    WS.drag = { x0: c.x, y0: c.y, x1: c.x, y1: c.y, last: edKey(c.x, c.y) };
    if (WS.tool !== 'carve' && WS.tool !== 'rock' && !(WS.tool === 'block' && !WS.pasting)) applyAt(c, true);
    draw();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!WS.drag) return;
    var c = cellAt(ev); if (!c.ok) return;
    WS.drag.x1 = c.x; WS.drag.y1 = c.y;
    var k = edKey(c.x, c.y);
    if ((WS.tool === 'terrain' || WS.tool === 'erase' || WS.tool === 'region') && k !== WS.drag.last) { WS.drag.last = k; if (WS.tool === 'region') { WS.drag.first = false; change(function () { return edPaintRegion(F(), c.x, c.y, WS.region); }); } else applyAt(c, false); }
    if (WS.tool === 'carve' || WS.tool === 'rock' || (WS.tool === 'block' && !WS.pasting)) draw();
  });
  function endDrag() {
    var d = WS.drag; WS.drag = null;
    if (!d) return;
    var caught = 0;
    if (WS.tool === 'carve') change(function () { var ok = edCarve(F(), d.x0, d.y0, d.x1, d.y1); caught = edCatchStairs(WS.draft, WS.fi); return ok; });
    if (WS.tool === 'block' && !WS.pasting) { WS.block = { x0: Math.min(d.x0, d.x1), y0: Math.min(d.y0, d.y1), x1: Math.max(d.x0, d.x1), y1: Math.max(d.y0, d.y1) }; renderToolPanel(); }
    if (caught) status('The stairs from floor ' + WS.fi + ' come down into it' + (caught > 1 ? ' (' + caught + ' staircases).' : '.'));
    else if (WS.tool === 'rock') change(function () { return edFill(F(), d.x0, d.y0, d.x1, d.y1); });
    draw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointerleave', function () { if (WS.pasting) { WS.hover = null; draw(); } });
  cv.addEventListener('pointermove', function (ev) { if (!WS.pasting) return; var c = cellAt(ev); WS.hover = c.ok ? [c.x, c.y] : null; draw(); });
  cv.addEventListener('pointercancel', function () { WS.drag = null; draw(); });

  /* ---- the panel for the tool in hand ---- */
  function renderToolPanel() {
    var h = el('wsToolPanel'), f = F(), html = '';
    if (WS.tool === 'region') {
      html = '<h3>Regions on this floor</h3>';
      var regs = f.regions || {};
      Object.keys(regs).forEach(function (id) {
        html += '<div class="reg"><span class="sw" style="background:' + regionColour(f, id) + '"></span><button data-reg="' + escH(id) + '" aria-pressed="' + (WS.region === id) + '" style="flex:1;text-align:left">' + escH(regs[id].name) + '</button></div>';
      });
      html += '<button id="wsRegNew">+ Region</button><button id="wsRegNone" aria-pressed="' + (WS.region === null) + '">Paint out</button>';
      if (WS.region && regs[WS.region]) {
        var r = regs[WS.region];
        html += '<input id="wsRegName" maxlength="40" value="' + escH(r.name) + '" aria-label="Region name">' +
          '<textarea id="wsRegLook" maxlength="240" placeholder="What the party reads on walking in">' + escH(r.look || '') + '</textarea>' +
          '<select id="wsRegHab" aria-label="Habitat">' + ED_HABITATS.map(function (x) { return '<option value="' + x + '"' + ((r.habitat || '') === x ? ' selected' : '') + '>' + (x ? 'Wanderers: ' + x : 'Wanderers: the floor\u2019s own') + '</option>'; }).join('') + '</select>' +
          '<button id="wsRegDel">Remove region</button>';
      }
      html += '<p style="font-size:10.5px;color:var(--text-dim);margin:2px 0 0">Choose a region, then tap a room to fill it up to its walls and doors, or drag to paint square by square.</p>';
    } else if (WS.tool === 'block') {
      var b = WS.block;
      html = '<h3>Block</h3>' + (b ? '<p style="font-size:11px;margin:0 0 6px">' + (b.x1 - b.x0 + 1) + ' \u00d7 ' + (b.y1 - b.y0 + 1) + ' selected</p>' : '<p style="font-size:11px;color:var(--text-dim);margin:0 0 6px">Drag across the grid to select.</p>') +
        '<button id="wsCopy"' + (b ? '' : ' disabled') + '>Copy</button><button id="wsCut"' + (b ? '' : ' disabled') + '>Cut</button><button id="wsDelBlock"' + (b ? '' : ' disabled') + '>Fill with rock</button>' +
        '<button id="wsPaste"' + (WS.clip ? '' : ' disabled') + ' aria-pressed="' + !!WS.pasting + '">' + (WS.pasting ? 'Pasting\u2026' : 'Paste') + '</button>' +
        (WS.clip ? '<p style="font-size:11px;margin:2px 0 6px">Holding ' + WS.clip.w + ' \u00d7 ' + WS.clip.h + '. <button id="wsRot">Turn \u21bb</button><button id="wsMirX">Mirror \u2194</button><button id="wsMirY">Mirror \u2195</button></p>' : '') +
        '<h3 style="margin-top:8px">Ready-made rooms</h3>' + Object.keys(ED_STAMPS).map(function (k) { return '<button data-stamp="' + k + '">' + ED_STAMPS[k].label + '</button>'; }).join('') +
        '<h3 style="margin-top:8px">The whole floor</h3><button id="wsFRot">Turn \u21bb</button><button id="wsFMirX">Mirror \u2194</button><button id="wsFMirY">Mirror \u2195</button>';
    } else if (WS.tool === 'link') {
      html = '<h3>Link</h3><p style="font-size:11px;color:var(--text-dim);margin:0">Tap a lever or plate, then the portcullis, door or grate it opens. Tap a teleporter, then the square it sends the party to. Tap a linked gate to unlink it.</p>';
    }
    h.innerHTML = html;
    h.querySelectorAll('[data-reg]').forEach(function (b) { b.addEventListener('click', function () { WS.region = b.dataset.reg; renderToolPanel(); draw(); }); });
    var on = function (id, fn) { var e = el(id); if (e) e.addEventListener('click', fn); };
    on('wsRegNew', function () { var id; change(function () { id = edAddRegion(F(), 'Room ' + (Object.keys(F().regions || {}).length + 1)); return true; }); WS.region = id; renderToolPanel(); });
    on('wsRegNone', function () { WS.region = null; renderToolPanel(); });
    on('wsRegDel', function () { var id = WS.region; change(function () { return edRemoveRegion(F(), id); }); WS.region = null; renderToolPanel(); });
    var rn = el('wsRegName'), rl = el('wsRegLook'), rh = el('wsRegHab');
    if (rn) rn.addEventListener('change', function () { var id = WS.region; change(function () { F().regions[id].name = rn.value.trim() || 'A room'; return true; }); renderToolPanel(); });
    if (rl) rl.addEventListener('change', function () { var id = WS.region; change(function () { F().regions[id].look = rl.value.trim(); return true; }); });
    if (rh) rh.addEventListener('change', function () { var id = WS.region; change(function () { if (rh.value) F().regions[id].habitat = rh.value; else delete F().regions[id].habitat; return true; }); });
    var B = WS.block;
    on('wsCopy', function () { WS.clip = edCopy(F(), B.x0, B.y0, B.x1, B.y1); status('Copied. Paste, then tap where its top-left corner goes.'); renderToolPanel(); });
    on('wsCut', function () { WS.clip = edCopy(F(), B.x0, B.y0, B.x1, B.y1); change(function () { return edFill(F(), B.x0, B.y0, B.x1, B.y1); }); status('Cut. Paste, then tap where it goes.'); renderToolPanel(); });
    on('wsDelBlock', function () { change(function () { return edFill(F(), B.x0, B.y0, B.x1, B.y1); }); });
    on('wsPaste', function () { WS.pasting = !WS.pasting; status(WS.pasting ? 'Tap where the top-left corner goes.' : ''); renderToolPanel(); draw(); });
    on('wsRot', function () { WS.clip = edBlockRotate(WS.clip); renderToolPanel(); draw(); });
    on('wsMirX', function () { WS.clip = edBlockMirror(WS.clip, 'x'); renderToolPanel(); draw(); });
    on('wsMirY', function () { WS.clip = edBlockMirror(WS.clip, 'y'); renderToolPanel(); draw(); });
    h.querySelectorAll('[data-stamp]').forEach(function (b) { b.addEventListener('click', function () {
      WS.clip = ED_STAMPS[b.dataset.stamp].make(); WS.pasting = true; status(ED_STAMPS[b.dataset.stamp].label + ': tap where its top-left corner goes.'); renderToolPanel(); draw(); }); });
    var whole = function (op, say) { change(function () { return edTransformFloor(F(), op); }); WS.block = null; WS.sel = null; WS.look = null; status(say + ' Stairs to other floors pair up again by order: check them.'); renderToolPanel(); inspect(); draw(); };
    on('wsFRot', function () { whole('rotate', 'The floor turned a quarter.'); });
    on('wsFMirX', function () { whole('mirrorX', 'The floor mirrored left to right.'); });
    on('wsFMirY', function () { whole('mirrorY', 'The floor mirrored top to bottom.'); });
  }

  /* ---- the 3D view of a square ---- */
  var V3 = null, V3FLOOR = null, V3SIG = '';
  function preview() {
    var c = el('wsView'), note = el('wsViewNote');
    if (!WS.look || typeof MSDD3D === 'undefined') { note.textContent = typeof MSDD3D === 'undefined' ? 'The 3D view is not available here.' : 'Inspect a square to look from it.'; return; }
    var f = WS.draft.floors[WS.look.fi];
    if (!f || edRock(f, WS.look.x, WS.look.y)) { WS.look = null; note.textContent = 'Inspect a square to look from it.'; return; }
    if (V3 === null) {
      try {
        var img = null;
        if (typeof ATLAS_DATA !== 'undefined' && typeof Image !== 'undefined') { img = new Image(); img.src = ATLAS_DATA; }
        V3 = MSDD3D.create(c, { minis: typeof MitzMinis !== 'undefined' ? MitzMinis : null, atlasImg: img, atlasIndex: typeof ATLAS_INDEX !== 'undefined' ? ATLAS_INDEX : {} }) || false;
      } catch (e) { V3 = false; }
    }
    if (!V3) { note.textContent = 'This device cannot draw the 3D view.'; return; }
    var dpr = window.devicePixelRatio || 1, r = el('wsViewBox').getBoundingClientRect();
    c.width = Math.max(64, Math.round(r.width * dpr)); c.height = Math.max(48, Math.round(r.height * dpr));
    var M = allMonsters(), MM = typeof MitzMinis !== 'undefined' ? MitzMinis : null;
    var zone = f.zone || WS.draft.zone || (typeof MSDDMat !== 'undefined' ? MSDD3D.zoneFor(f, MSDDMat) : null);
    var hooks = {
      terrain: function (x, y) { return f.terrain[edKey(x, y)] || null; },
      dressing: function () { return null; },
      door: function (key, ft) { return 'shut'; },
      spent: function () { return false; }, gateOpen: function () { return false; }, leverOn: function () { return false; },
      trapShown: function () { return true; }, barrierDown: function () { return false; },
      bridge: function (x, y) { return f.terrain[edKey(x, y)] === 'bridge'; },
      figures: function (key, ft) {
        if (ft.type !== 'monster' || !M[ft.ref]) return null;
        var d = M[ft.ref], fig = MM && MM.forMonster ? MM.forMonster(ft.ref, d) : d.mini;
        var boss = (d.traits || []).indexOf('boss') >= 0 || ft.boss;
        return fig ? [{ fig: fig, faction: boss ? 'boss' : 'foe', tall: boss ? 0.72 : 0.6 }] : null;
      },
      signature: function () { return String(WS.draft.rev); }
    };
    var sig = WS.draft.rev + '|' + WS.look.fi + '|' + zone;
    try {
      if (V3FLOOR !== f || V3SIG !== sig) { V3.setFloor(f, zone, hooks); V3FLOOR = f; V3SIG = sig; }
      V3.render({ x: WS.look.x, z: WS.look.y, yaw: WS.lookF * Math.PI / 2, px: WS.look.x, pz: WS.look.y, dt: 0.016, reduceMotion: true,
                  loot: null, pitch: 0, nudge: 0, bob: 0, sight: 3.4, dpr: dpr, shadows: true });
      note.textContent = 'Floor ' + (WS.look.fi + 1) + ', square ' + WS.look.x + ',' + WS.look.y + ', facing ' + ['north', 'east', 'south', 'west'][WS.lookF] + '.';
    } catch (e) { note.textContent = 'The 3D view could not draw this: ' + e.message; }
  }
  el('wsLookL').addEventListener('click', function () { WS.lookF = (WS.lookF + 3) % 4; preview(); draw(); });
  el('wsLookR').addEventListener('click', function () { WS.lookF = (WS.lookF + 1) % 4; preview(); draw(); });
  el('wsLookFwd').addEventListener('click', function () {
    if (!WS.look) return; var f = WS.draft.floors[WS.look.fi];
    if (!edWall(f, WS.look.x, WS.look.y, WS.lookF)) { WS.look.x += ED_DX[WS.lookF]; WS.look.y += ED_DY[WS.lookF]; }
    preview(); draw();
  });

  /* ---- the inspector: a thing's settings ---- */
  function opts(list, cur) {
    return list.map(function (o) { return '<option value="' + escH(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + escH(o[1]) + '</option>'; }).join('');
  }
  function inspect() {
    var h = el('wsInspect'), f = F();
    if (!WS.sel) { h.innerHTML = '<p style="color:var(--text-dim);margin:0">Use Inspect and tap a thing to change it.</p>'; return; }
    var k = edKey(WS.sel[0], WS.sel[1]), ft = f.features[k], t = f.terrain[k];
    var html = '<p style="margin:0 0 8px;color:var(--text-dim)">Square ' + k + (t ? ' · ' + escH(t) : '') + '</p>';
    if (!ft) { h.innerHTML = html + '<p style="margin:0;color:var(--text-dim)">Nothing here.</p>'; return; }
    html += '<p style="margin:0 0 8px"><b>' + escH(ft.type) + '</b></p>';
    var M = allMonsters(), I = allItems();
    if (ft.type === 'monster') html += '<label>Who<select data-k="ref">' + opts(Object.keys(M).sort(function (a, b) { return (M[a].level - M[b].level) || M[a].name.localeCompare(M[b].name); })
      .map(function (id) { return [id, M[id].name + ' (level ' + M[id].level + ((M[id].traits || []).indexOf('boss') >= 0 ? ', boss' : '') + ')' + (/^mn\.ws\./.test(id) ? ' \u2605 yours' : '')]; }), ft.ref) + '</select></label>';
    if (ft.type === 'monster')
      html += '<label><span><input type="checkbox" data-k="boss"' + (ft.boss ? ' checked' : '') + '> The boss' +
              (edCover(WS.draft).win === 'boss' ? ' (beating it wins)' : '') + '</span></label>';
    if (ft.type === 'stairsDown' || ft.type === 'stairsUp') {
      var lk = JSON.parse(JSON.stringify(WS.draft.floors)); edLinkStairs(lk);
      var me = lk[WS.fi].features[k], to = me && me.to ? lk.map(function (q) { return q.id; }).indexOf(me.to) : -1;
      html += '<p style="margin:0 0 8px">' + (to >= 0 ? 'Leads to floor ' + (to + 1) + ', square ' + me.at.join(',') + '.'
              : '<span style="color:#f0b8a8">Not linked yet: ' + (ft.type === 'stairsDown' ? 'put stairs up on the floor below.' : 'put stairs down on the floor above.') + '</span>') + '</p>';
    }
    if (ft.type === 'door') {
      html += '<label><span><input type="checkbox" data-k="locked"' + (ft.locked ? ' checked' : '') + '> Locked</span></label>';
      if (ft.locked) html += '<label>Key<select data-k="keyId">' + opts(Object.keys(I).filter(function (id) { return (I[id].tags || []).indexOf('key') >= 0; })
        .map(function (id) { return [id, I[id].name]; }), ft.keyId) + '</select></label>';
    }
    if (ft.type === 'chest') {
      html += '<label>Holds<select data-k="item"><option value="">Just gold</option>' + opts(Object.keys(I).filter(function (id) { return (I[id].value > 0 || (I[id].tags || []).indexOf('key') >= 0) && !I[id].cursed; })
        .sort().map(function (id) { return [id, I[id].name + (/^it\.ws\./.test(id) ? ' \u2605 yours' : '')]; }), ft.item || '') + '</select></label>';
      html += '<label>Trapped<select data-k="trap"><option value="">No</option>' + opts(ED_TRAPS.map(function (x) { return [x, x]; }), ft.trap || '') + '</select></label>';
    }
    if (ft.type === 'trap') html += '<label>Kind<select data-k="kind">' + opts(ED_TRAPS.map(function (x) { return [x, x]; }), ft.kind) + '</select></label>';
    if (ED_OPENERS.indexOf(ft.type) >= 0) html += '<p style="margin:0 0 8px">' + (ft.id && edLinks(f).some(function (l) { return l.from === k; }) ? 'Opens what the line points to.' : '<span style="color:#f0b8a8">Opens nothing yet: use Link.</span>') + '</p>';
    if (ft.type === 'lever') html += '<label>What the party hears when it is pulled<textarea data-k="note" maxlength="200">' + escH(ft.note || '') + '</textarea></label>';
    if (ft.type === 'plate') html += '<label>Or make it a trap<select data-k="trap"><option value="">No trap</option>' + opts(ED_TRAPS.map(function (x) { return [x, x]; }), ft.trap || '') + '</select></label>';
    if (ED_GATES.indexOf(ft.type) >= 0 && ft.needsLever) html += '<p style="margin:0 0 8px">Opened by ' + escH(ft.needsLever) + '. (Link tool: tap it to unlink.)</p>';
    if (ft.type === 'teleporter') html += '<p style="margin:0 0 8px">' + (ft.at ? 'Sends the party to ' + ft.at.join(',') + '.' : '<span style="color:#f0b8a8">Goes nowhere yet: use Link.</span>') + '</p>';
    if ('text' in ft || ['staff', 'exit', 'textTrigger', 'secretDoor'].indexOf(ft.type) >= 0)
      html += '<label>What the party reads<textarea data-k="text" maxlength="240">' + escH(ft.text || '') + '</textarea></label>';
    html += '<button id="wsDelThing" style="height:30px;min-height:0;font-size:11px">Remove it</button>';
    h.innerHTML = html;
    h.querySelectorAll('[data-k]').forEach(function (inp) {
      var ev = inp.tagName === 'TEXTAREA' ? 'change' : 'change';
      inp.addEventListener(ev, function () {
        var key = inp.dataset.k;
        change(function () {
          var cur = F().features[k]; if (!cur) return false;
          if (inp.type === 'checkbox' && key === 'boss') { if (inp.checked) cur.boss = true; else delete cur.boss; return true; }
          if (inp.type === 'checkbox') { cur[key] = inp.checked; if (key === 'locked' && inp.checked && !cur.keyId) cur.keyId = ED_KEYS[0]; if (key === 'locked' && !inp.checked) delete cur.keyId; }
          else if (inp.value === '') delete cur[key];
          else cur[key] = inp.value;
          return true;
        });
        inspect();
      });
    });
    el('wsDelThing').addEventListener('click', function () { change(function () { return edPlace(F(), WS.sel[0], WS.sel[1], null); }); inspect(); });
  }

  /* ---- new floor ---- */
  var NEW = { size: 16, start: 'rock' };
  function renderNew() {
    var hs = el('wsNewSize'); hs.innerHTML = '';
    ED_SIZES.forEach(function (n) {
      var b = document.createElement('button'); b.textContent = n + ' × ' + n; b.setAttribute('aria-pressed', NEW.size === n ? 'true' : 'false');
      b.addEventListener('click', function () { NEW.size = n; renderNew(); }); hs.appendChild(b);
    });
    var st = el('wsNewStart'); st.innerHTML = '';
    [['rock', 'Solid rock'], ['box', 'An empty box'], ['delve', 'A generated floor']].forEach(function (o) {
      var b = document.createElement('button'); b.textContent = o[1]; b.setAttribute('aria-pressed', NEW.start === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () { NEW.start = o[0]; renderNew(); }); st.appendChild(b);
    });
  }
  function makeNewFloor() {
    var f;
    if (NEW.start === 'delve' && typeof generateDelve === 'function') {
      var size = NEW.size <= 12 ? 'small' : NEW.size <= 16 ? 'medium' : NEW.size <= 22 ? 'large' : 'huge';
      var r = generateDelve((Math.random() * 1e9) >>> 0, { floors: 1, size: size, basePack: BUNDLED_BASE });
      if (r.ok) {
        f = JSON.parse(JSON.stringify(r.pack.floors[0]));
        f.id = 'w1'; f.terrain = f.terrain || {}; f.features = f.features || {};
        Object.keys(f.features).forEach(function (k) {     // stairs lead nowhere in a one-floor adventure: a way out instead
          var t = f.features[k].type;
          if (t === 'stairsUp') delete f.features[k];
          else if (t === 'stairsDown') f.features[k] = { type: 'exit', text: 'A way out, at last.' };
          else if (f.features[k].to) delete f.features[k].to;
        });
      }
    }
    if (!f) f = edNewFloor(NEW.size, NEW.size, NEW.start === 'box' ? 'box' : 'rock', 'w1');
    f.id = F().id; f.name = F().name;
    change(function () { WS.draft.floors[WS.fi] = f; return true; });
    WS.sel = null; inspect();
  }

  /* ---- play-test ---- */
  function playTest() {
    var pk = packNow();
    var probs = edProblems(pk, validatePack, proveSolvable).filter(function (p) { return p.level === 'error'; });
    if (probs.length) { status('Clear the problems first.'); return; }
    window.WS_TESTING = true;                              // saveTo does nothing while this is on
    var l = loadPack(pk);
    if (!l.ok) { window.WS_TESTING = false; status('It would not load: ' + (l.errors || []).join(' ')); return; }
    var tps = PACK.testParties || [], pick = el('wsParty').value;
    var spec = tps.filter(function (t) { return t.id === pick; })[0] || tps[0];
    root.classList.remove('on');
    ['chooser', 'roster', 'menu', 'town'].forEach(function (id) { var e = el(id); if (e) e.classList.remove('on'); });
    if (spec && typeof startTestParty === 'function') startTestParty(spec);
    if (WS.fi > 0 && typeof changeFloor === 'function') {     // test the floor you are on: arrive at its entry
      var cf = PACK.floors[WS.fi];
      changeFloor({ floor: cf.id, at: cf.entry }, cf.entryFacing || 1);
    }
    bar.classList.add('on');
  }
  function leaveTest() {
    bar.classList.remove('on');
    if (typeof cst !== 'undefined' && cst) { try { cst = null; document.getElementById('combat').classList.remove('on'); } catch (e) {} }
    window.WS_TESTING = false;
    // put the real game back as it was: the autosave was never touched
    var r = typeof loadFrom === 'function' ? loadFrom('auto') : { ok: false };
    if (!r.ok) {                                        // no real game to go back to: the chooser, under the Workshop
      if (typeof party !== 'undefined') party.length = 0;
      if (typeof openChooser === 'function') openChooser();
    }
    open();
  }

  /* ---- files ---- */
  function exportPack() {
    var pk = packNow();
    var blob = new Blob([JSON.stringify(pk, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (pk.id.replace(/^ws\./, '') || 'adventure') + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    status('Exported. Load it from Other adventures → Load an adventure, or come back and import it here.');
  }
  function importPack(file) {
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var pk = JSON.parse(rd.result);
        if (!pk.floors || !pk.floors[0] || !pk.floors[0].cells) throw new Error('No floor in it');
        var fl = pk.floors.map(function (q, i) { var f = JSON.parse(JSON.stringify(q)); f.id = 'w' + (i + 1); f.terrain = f.terrain || {}; f.features = f.features || {};
          Object.keys(f.features).forEach(function (k) { delete f.features[k].to; delete f.features[k].at; }); return f; });
        change(function () {
          WS.draft.floors = fl; WS.draft.name = pk.name || WS.draft.name; WS.draft.author = pk.author || WS.draft.author;
          WS.draft.items = {}; WS.draft.monsters = {};
          Object.keys(pk.items || {}).forEach(function (k) { if (/^it\.ws\./.test(k)) WS.draft.items[k] = pk.items[k]; });
          Object.keys(pk.monsters || {}).forEach(function (k) { if (/^mn\.ws\./.test(k)) WS.draft.monsters[k] = pk.monsters[k]; });
          var win = Object.keys(ED_WINS).filter(function (k) { return pk.rules && pk.rules.victory && ED_WINS[k].flag === pk.rules.victory.flag; })[0];
          WS.draft.cover = { blurb: pk.blurb || '', gold: (pk.rules || {}).startingGold, win: win || 'staff', winText: ((pk.rules || {}).victory || {}).text || '', shop: pk.shopStock || null };
          return true;
        });
        WS.fi = 0; el('wsName').value = WS.draft.name; renderFloors();
        status('Imported \u201c' + (pk.name || 'that pack') + '\u201d: ' + fl.length + (fl.length === 1 ? ' floor.' : ' floors.') + ' Stairs pair up again in reading order; check them.');
      } catch (e) { status('That file is not a pack: ' + e.message); }
    };
    rd.readAsText(file);
  }

  function status(t) { el('wsStatus').textContent = t || ''; }

  /* ---- the cover ---- */
  function openCover() {
    var c = edCover(WS.draft), I = allItems(), std = BUNDLED_BASE.shopStock || [];
    el('wsAuthor').value = WS.draft.author || '';
    el('wsBlurb').value = c.blurb;
    el('wsWin').innerHTML = Object.keys(ED_WINS).map(function (k) { return '<option value="' + k + '"' + (k === c.win ? ' selected' : '') + '>' + ED_WINS[k].label + '</option>'; }).join('');
    el('wsWinText').value = c.winText; el('wsWinText').placeholder = ED_WINS[c.win].text;
    el('wsGold').value = c.gold;
    var stock = c.shop || std, sell = Object.keys(I).filter(function (id) { return I[id].value > 0 && !(I[id].flags || []).length && !I[id].cursed; })
      .sort(function (a, b) { return (I[a].slot || '').localeCompare(I[b].slot || '') || I[a].value - I[b].value; });
    el('wsShop').innerHTML = sell.map(function (id) { return '<label><input type="checkbox" value="' + escH(id) + '"' + (stock.indexOf(id) >= 0 ? ' checked' : '') + '> ' + escH(I[id].name) + '</label>'; }).join('');
    cover.classList.add('on');
  }
  el('wsWin').addEventListener('change', function () { el('wsWinText').placeholder = ED_WINS[el('wsWin').value].text; });
  var shopSet = function (fn) { el('wsShop').querySelectorAll('input').forEach(function (i) { i.checked = fn(i.value); }); };
  el('wsShopAll').addEventListener('click', function () { shopSet(function () { return true; }); });
  el('wsShopNone').addEventListener('click', function () { shopSet(function () { return false; }); });
  el('wsShopStd').addEventListener('click', function () { var std = BUNDLED_BASE.shopStock || []; shopSet(function (v) { return std.indexOf(v) >= 0; }); });
  el('wsCoverCancel').addEventListener('click', function () { cover.classList.remove('on'); });
  el('wsCoverOk').addEventListener('click', function () {
    var shop = Array.prototype.filter.call(el('wsShop').querySelectorAll('input'), function (i) { return i.checked; }).map(function (i) { return i.value; });
    change(function () {
      WS.draft.author = el('wsAuthor').value.trim();
      WS.draft.cover = { blurb: el('wsBlurb').value.trim(), win: el('wsWin').value, winText: el('wsWinText').value.trim(),
                         gold: Math.max(0, Math.min(5000, parseInt(el('wsGold').value, 10) || 0)), shop: shop };
      return true;
    });
    cover.classList.remove('on'); inspect();
  });

  /* ---- your own items and monsters ---- */
  var LIB = { kind: 'items', id: null, base: null };
  function libStore() { var k = LIB.kind; WS.draft[k] = WS.draft[k] || {}; return WS.draft[k]; }
  function openLib(kind) {
    LIB.kind = kind; LIB.id = null; LIB.base = null;
    el('wsLibTitle').textContent = kind === 'items' ? 'Your items' : 'Your monsters';
    el('wsLibIntro').textContent = kind === 'items'
      ? 'Start from an item the game has: yours keeps its kind, who may use it and what it does, and takes your name, words and numbers. It can then go in chests and in the shop.'
      : 'Start from a creature the game has: yours keeps its look and its gifts (poison, undead and so on), and takes your name and numbers. Mark it as a boss to make it the one that wins the adventure.';
    renderLib(); lib.classList.add('on');
  }
  function renderLib() {
    var store = libStore(), h = el('wsLibList'); h.innerHTML = '';
    Object.keys(store).sort().forEach(function (id) {
      var b = document.createElement('button'); b.textContent = store[id].name; b.setAttribute('aria-pressed', LIB.id === id ? 'true' : 'false');
      b.addEventListener('click', function () { LIB.id = id; LIB.base = null; renderLib(); });
      h.appendChild(b);
    });
    var nb = document.createElement('button'); nb.textContent = '+ New'; nb.setAttribute('aria-pressed', !LIB.id ? 'true' : 'false');
    nb.addEventListener('click', function () { LIB.id = null; LIB.base = null; renderLib(); });
    h.appendChild(nb);
    renderLibForm();
  }
  function num(id, v, lo, hi, label) { return '<label>' + label + '<input type="number" id="' + id + '" value="' + v + '" min="' + lo + '" max="' + hi + '" inputmode="numeric"></label>'; }
  function diceRow(pfx, d, label) {
    return '<fieldset><legend>' + label + '</legend><div class="row">' + num(pfx + 'N', d[0], 1, 6, 'Dice') +
      '<label>Sides<select id="' + pfx + 'S">' + ED_DIE.map(function (x) { return '<option' + (x === d[1] ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
      num(pfx + 'P', d[2], 0, 12, 'Plus') + '</div></fieldset>';
  }
  function readDice(pfx) { return [parseInt(el(pfx + 'N').value, 10), parseInt(el(pfx + 'S').value, 10), parseInt(el(pfx + 'P').value, 10)]; }
  function renderLibForm() {
    var f = el('wsLibForm'), store = libStore(), cur = LIB.id ? store[LIB.id] : null;
    var B = LIB.kind === 'items' ? BUNDLED_BASE.items : BUNDLED_BASE.monsters;
    el('wsLibDel').hidden = !cur; el('wsLibNote').textContent = '';
    var html = '';
    if (!cur) {
      var pool = Object.keys(B).filter(function (k) { return LIB.kind === 'monsters' || (B[k].value > 0 || (B[k].tags || []).indexOf('key') >= 0) && !B[k].cursed; })
        .sort(function (a, b) { return LIB.kind === 'items' ? (B[a].slot || '').localeCompare(B[b].slot || '') || B[a].name.localeCompare(B[b].name) : B[a].level - B[b].level || B[a].name.localeCompare(B[b].name); });
      LIB.base = LIB.base && B[LIB.base] ? LIB.base : pool[0];
      html += '<label>Start from<select id="wsLibBase">' + pool.map(function (k) {
        var x = B[k], tag = LIB.kind === 'items' ? (x.slot === 'none' ? ((x.tags || []).indexOf('key') >= 0 ? 'key' : 'use') : x.slot) : 'level ' + x.level;
        return '<option value="' + escH(k) + '"' + (k === LIB.base ? ' selected' : '') + '>' + escH(x.name) + ' (' + tag + ')</option>';
      }).join('') + '</select></label>';
    }
    var src = cur || B[LIB.base];
    html += '<label>Name<input id="wsLibName" maxlength="32" value="' + escH(cur ? cur.name : '') + '" placeholder="' + escH(src.name) + '"></label>';
    if (LIB.kind === 'items') {
      html += '<label>What it says about itself<textarea id="wsLibDesc" maxlength="200">' + escH(cur ? cur.desc : src.desc || '') + '</textarea></label>';
      html += '<div class="row">' + num('wsLibVal', src.value || 0, 0, 3000, 'Worth (gold)') + '</div>';
      if (src.slot === 'weapon') html += diceRow('wsLibDmg', src.damage || [1, 6, 0], 'Damage');
      if (src.slot === 'armor' || src.slot === 'shield') html += '<div class="row">' + num('wsLibDef', src.defenseBonus || 0, 0, 8, 'Defence') + '</div>';
      if (src.slot === 'trinket') html += '<div class="row">' + num('wsLibDef', src.defenseBonus || 0, -3, 3, 'Defence') + num('wsLibHit', src.hitBonus || 0, -3, 3, 'To hit') +
        num('wsLibBpB', src.bpBonus || 0, 0, 10, 'Body') + num('wsLibMpB', src.mpBonus || 0, 0, 8, 'Magic') + '</div>';
      if (src.use && src.use.dice) html += diceRow('wsLibUse', src.use.dice, 'Strength (' + src.use.kind + ')');
      if ((src.tags || []).indexOf('key') < 0) html += '<label><span><input type="checkbox" id="wsLibQuest"' + ((src.flags || []).indexOf('quest') >= 0 && cur ? ' checked' : '') + '> A quest item: it cannot be sold or lost</span></label>';
      else html += '<p style="font-size:11px;color:var(--text-dim);margin:0 0 8px">A key of your own: choose it for a locked door in Inspect, and put it in a chest.</p>';
    } else {
      html += '<div class="row">' + num('wsLibLvl', src.level, 1, 12, 'Level') + num('wsLibDefM', src.defense, 8, 24, 'Defence') + '</div>';
      html += diceRow('wsLibBp', src.bp, 'Toughness (body points)');
      (src.attacks || []).forEach(function (a, i) {
        html += '<fieldset><legend>Attack ' + (i + 1) + (a.reach === 'ranged' ? ' (ranged)' : '') + '</legend><div class="row">' +
          '<label>Name<input id="wsLibA' + i + 'n" maxlength="24" value="' + escH(a.name) + '"></label>' + num('wsLibA' + i + 'h', a.toHit, 0, 12, 'To hit') + '</div>' +
          '<div class="row">' + num('wsLibA' + i + 'dN', a.damage[0], 1, 6, 'Dice') +
          '<label>Sides<select id="wsLibA' + i + 'dS">' + ED_DIE.map(function (x) { return '<option' + (x === a.damage[1] ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
          num('wsLibA' + i + 'dP', a.damage[2], 0, 12, 'Plus') + '</div></fieldset>';
      });
      html += '<label><span><input type="checkbox" id="wsLibBoss"' + ((src.traits || []).indexOf('boss') >= 0 ? ' checked' : '') + '> A boss (fights alone; worth more)</span></label>';
    }
    f.innerHTML = html;
    var bs = el('wsLibBase');
    if (bs) bs.addEventListener('change', function () { LIB.base = bs.value; renderLibForm(); });
  }
  function saveLib() {
    var store = libStore(), cur = LIB.id ? store[LIB.id] : null;
    var B = LIB.kind === 'items' ? BUNDLED_BASE.items : BUNDLED_BASE.monsters;
    var base = cur ? (B[cur.from] || cur) : B[LIB.base], made;
    var taken = {}; Object.keys(store).forEach(function (k) { taken[k] = 1; });
    if (LIB.kind === 'items') {
      var ch = { name: el('wsLibName').value.trim() || base.name + ' (yours)', desc: el('wsLibDesc').value, value: el('wsLibVal').value };
      if (el('wsLibDmgN')) ch.damage = readDice('wsLibDmg');
      if (el('wsLibDef')) ch.defenseBonus = el('wsLibDef').value;
      if (el('wsLibHit')) ch.hitBonus = el('wsLibHit').value;
      if (el('wsLibBpB')) { ch.bpBonus = el('wsLibBpB').value; ch.mpBonus = el('wsLibMpB').value; }
      if (el('wsLibUseN')) ch.useDice = readDice('wsLibUse');
      if (el('wsLibQuest')) ch.quest = el('wsLibQuest').checked;
      if (cur) ch.id = cur.id;
      made = edMakeItem(base, ch, taken);
    } else {
      var mc = { name: el('wsLibName').value.trim() || base.name + ' (yours)', level: el('wsLibLvl').value, defense: el('wsLibDefM').value,
                 bp: readDice('wsLibBp'), boss: el('wsLibBoss').checked, attacks: [] };
      (base.attacks || []).forEach(function (a, i) { mc.attacks.push({ name: el('wsLibA' + i + 'n').value, toHit: el('wsLibA' + i + 'h').value, damage: readDice('wsLibA' + i + 'd') }); });
      if (cur) mc.id = cur.id;
      made = edMakeMonster(base, mc, taken);
    }
    made.from = cur ? cur.from : LIB.base;
    change(function () { libStore()[made.id] = made; return true; });
    LIB.id = made.id; renderLib(); inspect();
    el('wsLibNote').textContent = 'Saved \u201c' + made.name + '\u201d. ' + (LIB.kind === 'items' ? 'Put it in a chest (Things \u2192 Chest, then Inspect) or the shop (Cover).' : 'Place it with Things \u2192 Monsters, then choose it in Inspect.');
  }
  function deleteLib() {
    if (!LIB.id) return;
    var id = LIB.id, used = edCountThings(WS.draft, function (ft) { return ft.ref === id || ft.item === id || ft.keyId === id; });
    change(function () {
      delete libStore()[id];
      WS.draft.floors.forEach(function (f) { Object.keys(f.features).forEach(function (k) {     // what used it goes back to plain
        var ft = f.features[k];
        if (ft.ref === id) ft.ref = 'mn.goblin';
        if (ft.item === id) delete ft.item;
        if (ft.keyId === id) ft.keyId = 'it.key.rust';
      }); });
      if (WS.draft.cover && WS.draft.cover.shop) WS.draft.cover.shop = WS.draft.cover.shop.filter(function (x) { return x !== id; });
      return true;
    });
    LIB.id = null; renderLib(); inspect();
    el('wsLibNote').textContent = used ? 'Deleted. ' + used + ' place' + (used > 1 ? 's' : '') + ' that used it went back to a plain one.' : 'Deleted.';
  }
  el('wsLibSave').addEventListener('click', saveLib);
  el('wsLibDel').addEventListener('click', deleteLib);
  el('wsLibClose').addEventListener('click', function () { lib.classList.remove('on'); });

  /* ---- keeping it ---- */
  function keep() {
    var pk = packNow();
    var errs = edProblems(pk, validatePack, proveSolvable, WS.draft).filter(function (p) { return p.level === 'error'; });
    if (errs.length) { status('Clear the problems first.'); return; }
    if (typeof mineSave !== 'function' || !mineSave(pk)) { status('It could not be kept: the device may be out of room. Export it instead.'); return; }
    status('Kept. \u201c' + pk.name + '\u201d is in the New Game list now. Saving again replaces it.');
    if (typeof renderChooser === 'function') { try { renderChooser(); } catch (e) {} }
  }

  /* ---- open and close ---- */
  function fillParties() {
    var sel = el('wsParty'), tps = ((typeof BUNDLED_BASE !== 'undefined' && BUNDLED_BASE) || {}).testParties || [];
    if (sel.options.length === tps.length && tps.length) return;
    sel.innerHTML = tps.map(function (t) { return '<option value="' + escH(t.id) + '">' + escH(t.label.replace(/^Test party \u2014 /, 'Party: ')) + '</option>'; }).join('');
  }
  function open() {
    if (!WS.draft) { WS.draft = loadDraft() || edNewDraft(16, 'rock'); }
    fillParties();
    el('wsName').value = WS.draft.name || '';
    root.classList.add('on');
    renderTools(); renderFloors(); renderToolPanel(); inspect();
    requestAnimationFrame(function () { draw(); runChecks(); if (!WS.look) { var f0 = WS.draft.floors[0]; WS.look = { fi: 0, x: f0.entry[0], y: f0.entry[1] }; WS.lookF = f0.entryFacing || 1; } preview(); });
  }
  function close() { root.classList.remove('on'); }

  el('wsClose').addEventListener('click', close);
  el('wsMore').addEventListener('click', function () {
    var on = el('wsHead').classList.toggle('more');
    el('wsMore').setAttribute('aria-expanded', on ? 'true' : 'false');
    el('wsMore').innerHTML = on ? 'Less \u25b4' : 'More \u25be';
    setTimeout(draw, 0);
  });
  el('wsCoverBtn').addEventListener('click', openCover);
  el('wsItemsBtn').addEventListener('click', function () { openLib('items'); });
  el('wsMonBtn').addEventListener('click', function () { openLib('monsters'); });
  el('wsKeep').addEventListener('click', keep);
  el('wsUndo').addEventListener('click', function () { var d = edUndo(WS.hist, WS.draft); if (d) { WS.draft = d; afterChange(); renderFloors(); inspect(); } });
  el('wsRedo').addEventListener('click', function () { var d = edRedo(WS.hist, WS.draft); if (d) { WS.draft = d; afterChange(); renderFloors(); inspect(); } });
  el('wsName').addEventListener('change', function () {
    var v = el('wsName').value.trim() || 'My adventure';
    change(function () { WS.draft.name = v; WS.draft.slug = v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-adventure'; return true; });
  });
  el('wsNewBtn').addEventListener('click', function () { renderNew(); el('wsNew').classList.add('on'); });
  el('wsNewCancel').addEventListener('click', function () { el('wsNew').classList.remove('on'); });
  el('wsNewGo').addEventListener('click', function () { el('wsNew').classList.remove('on'); makeNewFloor(); });
  el('wsExport').addEventListener('click', exportPack);
  el('wsImport').addEventListener('click', function () { el('wsFile').click(); });
  el('wsFile').addEventListener('change', function () { if (this.files[0]) importPack(this.files[0]); this.value = ''; });
  el('wsPlay').addEventListener('click', playTest);
  el('wsLeave').addEventListener('click', leaveTest);
  el('wsZoomIn').addEventListener('click', function () { WS.zoom = Math.min(8, WS.zoom + 1); draw(); });
  el('wsZoomOut').addEventListener('click', function () { WS.zoom = Math.max(-2, WS.zoom - 1); draw(); });
  el('wsFit').addEventListener('click', function () { WS.zoom = 0; draw(); });
  window.addEventListener('resize', function () { if (root.classList.contains('on')) draw(); });
  document.addEventListener('keydown', function (e) {
    if (!root.classList.contains('on') || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName)) return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); el(e.shiftKey ? 'wsRedo' : 'wsUndo').click(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); el('wsRedo').click(); }
    else if (k === 'escape') { if (el('wsNew').classList.contains('on')) el('wsNew').classList.remove('on'); else close(); }
    e.stopPropagation();
  }, true);

  window.MSDDWorkshop = { open: open, close: close, state: WS, draw: draw, runChecks: runChecks, packNow: packNow, leaveTest: leaveTest,
                         keep: keep, openCover: openCover, renderFloors: renderFloors, openLib: openLib };
})();

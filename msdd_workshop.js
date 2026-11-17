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
    ['select', 'Inspect', 'Tap a thing to change its settings']
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
    '@media (max-width:760px){',
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
    '<button id="wsKeep" title="Keep it in your adventures, to play from the New Game list">Save to my adventures</button>' +
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
    '<div id="wsSide"><div><h3>Selected</h3><div id="wsInspect"><p style="color:var(--text-dim);margin:0">Use Inspect and tap a thing to change it.</p></div></div>' +
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
      b.addEventListener('click', function () { WS.tool = t[0]; renderTools(); });
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

  /* ---- the floors ---- */
  function renderFloors() {
    var h = el('wsFloors'); h.innerHTML = '';
    var lab = document.createElement('span'); lab.textContent = 'Floors'; lab.style.cssText = 'font:10px ui-monospace,Menlo,monospace;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-right:4px';
    h.appendChild(lab);
    WS.draft.floors.forEach(function (f, i) {
      var b = document.createElement('button'); b.textContent = String(i + 1); b.title = f.name;
      b.setAttribute('aria-pressed', i === WS.fi ? 'true' : 'false');
      b.addEventListener('click', function () { WS.fi = i; WS.sel = null; renderFloors(); inspect(); draw(); });
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
    // a drag in progress
    if (WS.drag && (WS.tool === 'carve' || WS.tool === 'rock')) {
      var d = WS.drag, x0 = Math.min(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), x1 = Math.max(d.x0, d.x1), y1 = Math.max(d.y0, d.y1);
      g.fillStyle = WS.tool === 'carve' ? 'rgba(127,208,138,.25)' : 'rgba(0,0,0,.45)';
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
    saveDraft(); draw();
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
    } else if (WS.tool === 'select') { WS.sel = [c.x, c.y]; inspect(); draw(); }
  }

  var cv = el('wsGrid');
  cv.addEventListener('pointerdown', function (ev) {
    var c = cellAt(ev); if (!c.ok) return;
    cv.setPointerCapture(ev.pointerId);
    WS.drag = { x0: c.x, y0: c.y, x1: c.x, y1: c.y, last: edKey(c.x, c.y) };
    if (WS.tool !== 'carve' && WS.tool !== 'rock') applyAt(c, true);
    draw();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!WS.drag) return;
    var c = cellAt(ev); if (!c.ok) return;
    WS.drag.x1 = c.x; WS.drag.y1 = c.y;
    var k = edKey(c.x, c.y);
    if ((WS.tool === 'terrain' || WS.tool === 'erase') && k !== WS.drag.last) { WS.drag.last = k; applyAt(c, false); }
    if (WS.tool === 'carve' || WS.tool === 'rock') draw();
  });
  function endDrag() {
    var d = WS.drag; WS.drag = null;
    if (!d) return;
    var caught = 0;
    if (WS.tool === 'carve') change(function () { var ok = edCarve(F(), d.x0, d.y0, d.x1, d.y1); caught = edCatchStairs(WS.draft, WS.fi); return ok; });
    if (caught) status('The stairs from floor ' + WS.fi + ' come down into it' + (caught > 1 ? ' (' + caught + ' staircases).' : '.'));
    else if (WS.tool === 'rock') change(function () { return edFill(F(), d.x0, d.y0, d.x1, d.y1); });
    draw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', function () { WS.drag = null; draw(); });

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
    var M = typeof MONSTERS !== 'undefined' ? MONSTERS : (BUNDLED_BASE || {}).monsters || {};
    var I = typeof ITEMS !== 'undefined' ? ITEMS : (BUNDLED_BASE || {}).items || {};
    if (ft.type === 'monster') html += '<label>Who<select data-k="ref">' + opts(Object.keys(M).sort(function (a, b) { return (M[a].level - M[b].level) || M[a].name.localeCompare(M[b].name); })
      .map(function (id) { return [id, M[id].name + ' (level ' + M[id].level + ((M[id].traits || []).indexOf('boss') >= 0 ? ', boss' : '') + ')']; }), ft.ref) + '</select></label>';
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
      if (ft.locked) html += '<label>Key<select data-k="keyId">' + opts(ED_KEYS.map(function (id) { return [id, (I[id] || {}).name || id]; }), ft.keyId) + '</select></label>';
    }
    if (ft.type === 'chest') {
      html += '<label>Holds<select data-k="item"><option value="">Just gold</option>' + opts(Object.keys(I).filter(function (id) { return (I[id].value > 0 || (I[id].tags || []).indexOf('key') >= 0) && !I[id].cursed; })
        .sort().map(function (id) { return [id, I[id].name]; }), ft.item || '') + '</select></label>';
      html += '<label>Trapped<select data-k="trap"><option value="">No</option>' + opts(ED_TRAPS.map(function (x) { return [x, x]; }), ft.trap || '') + '</select></label>';
    }
    if (ft.type === 'trap') html += '<label>Kind<select data-k="kind">' + opts(ED_TRAPS.map(function (x) { return [x, x]; }), ft.kind) + '</select></label>';
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
    var c = edCover(WS.draft), I = BUNDLED_BASE.items, std = BUNDLED_BASE.shopStock || [];
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
    renderTools(); renderFloors(); inspect();
    requestAnimationFrame(function () { draw(); runChecks(); });
  }
  function close() { root.classList.remove('on'); }

  el('wsClose').addEventListener('click', close);
  el('wsCoverBtn').addEventListener('click', openCover);
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
                         keep: keep, openCover: openCover, renderFloors: renderFloors };
})();

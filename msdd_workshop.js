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
  else edCarve(f, 1, 1, Math.min(4, w - 2), Math.min(3, h - 2));       // a first small room for the entry
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
  var staff = pk.floors.some(function (f) { return Object.keys(f.features).some(function (k) { return f.features[k].type === 'staff'; }); });
  if (!staff && pk.rules) delete pk.rules.victory;      // a way out is the goal instead
  pk.testParties = base.testParties || [];
  return pk;
}

/* The game's own checks, as a list of problems with the square they are on. */
function edProblems(pack, validate, solve) {
  var out = [], seen = {};
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

  var WS = { draft: null, hist: edHistory(), tool: 'carve', thing: 'monster', terrain: 'water',
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
  function F() { return WS.draft.floors[0]; }

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
    '<button id="wsClose">Close</button></div>' +
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
    WS.problems.forEach(function (p) { if (p.level === 'error' && p.at) bad[edKey(p.at[0], p.at[1])] = 1; });
    for (var y = 0; y < f.h; y++) for (var x = 0; x < f.w; x++) {
      var px = x * s, py = y * s, k = edKey(x, y);
      if (edRock(f, x, y)) {
        g.fillStyle = '#100d0a'; g.fillRect(px, py, s, s);
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
    // the entry, as an arrow
    var ex = f.entry[0] * s + s / 2, ey = f.entry[1] * s + s / 2, a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][f.entryFacing];
    g.save(); g.translate(ex, ey); g.rotate(a); g.fillStyle = '#7fd08a';
    g.beginPath(); g.moveTo(s * .34, 0); g.lineTo(-s * .22, -s * .24); g.lineTo(-s * .22, s * .24); g.closePath(); g.fill(); g.restore();
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
    try { WS.problems = edProblems(pk, validatePack, proveSolvable); }
    catch (e) { WS.problems = [{ text: 'The check failed: ' + e.message, level: 'error', at: null }]; }
    var ul = el('wsProblems'); ul.innerHTML = '';
    var errs = WS.problems.filter(function (p) { return p.level === 'error'; }).length;
    if (!WS.problems.length) { ul.innerHTML = '<li class="okay">All clear: it can be played from start to goal.</li>'; }
    WS.problems.forEach(function (p) {
      var li = document.createElement('li'); li.className = p.level; li.textContent = p.text;
      if (p.at) { li.title = 'Show the square'; li.addEventListener('click', function () { WS.sel = p.at; draw(); inspect(); }); }
      ul.appendChild(li);
    });
    el('wsPlay').disabled = errs > 0;
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
      if (th && change(function () { return edPlace(f, c.x, c.y, th.make()); })) { WS.sel = [c.x, c.y]; inspect(); draw(); }
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
    if (WS.tool === 'carve') change(function () { return edCarve(F(), d.x0, d.y0, d.x1, d.y1); });
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
    change(function () { WS.draft.floors[0] = f; return true; });
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
        var f = JSON.parse(JSON.stringify(pk.floors[0])); f.id = 'w1'; f.terrain = f.terrain || {}; f.features = f.features || {};
        change(function () { WS.draft.floors = [f]; WS.draft.name = pk.name || WS.draft.name; return true; });
        el('wsName').value = WS.draft.name;
        status('Imported the first floor of “' + (pk.name || 'that pack') + '”.' + (pk.floors.length > 1 ? ' Several floors arrive in a later Workshop.' : ''));
      } catch (e) { status('That file is not a pack: ' + e.message); }
    };
    rd.readAsText(file);
  }

  function status(t) { el('wsStatus').textContent = t || ''; }

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
    renderTools(); inspect();
    requestAnimationFrame(function () { draw(); runChecks(); });
  }
  function close() { root.classList.remove('on'); }

  el('wsClose').addEventListener('click', close);
  el('wsUndo').addEventListener('click', function () { var d = edUndo(WS.hist, WS.draft); if (d) { WS.draft = d; afterChange(); inspect(); } });
  el('wsRedo').addEventListener('click', function () { var d = edRedo(WS.hist, WS.draft); if (d) { WS.draft = d; afterChange(); inspect(); } });
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

  window.MSDDWorkshop = { open: open, close: close, state: WS, draw: draw, runChecks: runChecks, packNow: packNow, leaveTest: leaveTest };
})();

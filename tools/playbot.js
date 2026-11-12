// The play bot: plays whole runs of the game through the real screen.
//
// It looks at the game the way a player looks at the screen (where the party
// stands, what is on the map, whose turn it is) and acts only the way a player
// can: key presses, clicks and taps on what is showing. So it finds the bugs the
// rule runners cannot, where the screen and the rules disagree. A fight that
// froze when the enemy won the initiative, a list that never showed, a party
// screen wiped by a fight: all three lived for months because every runner drove
// the rules directly.
//
// Each run: pick an adventure from the front screen, make a party with Suggest a
// party, then explore, fight, open chests, answer events, rest, use the town,
// take the stairs, die and wake, until the run's tick budget is spent. Along the
// way it saves, reloads the page and checks the game comes back the same.
//
// It reports a FAULT when the game, not the bot, is at fault:
//   page-error      an uncaught error or console error on the page
//   frozen          a screen with nothing the player can press, for too long
//   foes-stuck      a fight on the enemy's turn that never moves on
//   bad-number      a BP, MP, gold or XP that is not a sane number
//   screen-mismatch the fight screen open with no fight, or a fight with no screen
//   reload-differs  the game after a save and a page reload is not the game before
//
// "Wandered" (the bot ran out of places to go) is a note, not a fault: some
// puzzles want a person.
//
// Usage: node tools/playbot.js [index.html] [--runs 20] [--ticks 1500]
//        [--mode endless|written|both] [--seed 1] [--motion on|off|both]
//        [--width 1280 --height 800] [--jobs 4] [--out playbot-out] [--quiet]
// Needs Playwright: npm install playwright
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const HTML = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : 'index.html');
const RUNS = +opt('runs', 20), TICKS = +opt('ticks', 1500), SEED0 = +opt('seed', 1);
const MODE = opt('mode', 'both'), MOTION = opt('motion', 'both');
const W = +opt('width', 1280), H = +opt('height', 800);
const OUT = path.resolve(opt('out', 'playbot-out'));
const QUIET = args.includes('--quiet');
const JOBS = +opt('jobs', 4);
// --bosses: v5.4 check. Each run levels the party up and fights every boss in
// turn (up to three tries each), and passes only if every boss winds up on
// screen and the bot answers it.
const BOSSES = args.includes('--bosses');
// --shots N: a picture of the screen every N ticks (to look at the view, v6.0)
const SHOTS = +opt('shots', 0);
// --view 2d|3d: which view to play in (v6.0). 2D by default: the bot checks the game, and here
// the 3D view is drawn in software (about a second a frame). --view 3d for a short look at it.
const VIEW = opt('view', '2d');
fs.mkdirSync(OUT, { recursive: true });

// a small seeded generator, so a failing run can be replayed exactly
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/* ---------------------------------------------------------------- in the page
   Everything here runs inside the game's page. It only READS the game and says
   what to press; the Node side does the pressing, with real input. */
const PAGE = function () {
  if (window.__bot) return;
  var B = window.__bot = { blocked: {}, used: {}, stood: {}, tries: {}, last: null, floorTicks: {}, rested: {} };

  var vis = function (el) { if (!el) return false; var r = el.getBoundingClientRect(); var cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  var on = function (id) { var e = document.getElementById(id); return !!e && e.classList.contains('on') && vis(e); };
  var enabled = function (sel) { return Array.from(document.querySelectorAll(sel)).filter(function (b) { return !b.disabled && vis(b); }); };
  var label = function (b) { return (b.textContent || '').trim(); };
  // what the Node side clicks: the k-th element under css whose words include
  // these. The game redraws its buttons freely, so a mark on the element itself
  // can be gone by the time the click lands; the words are not.
  var press = function (css, el, why, extra) {
    var t = label(el).slice(0, 40), all = Array.from(document.querySelectorAll(css)).filter(function (e) { return label(e).indexOf(t) >= 0; });
    var o = { do: 'click', css: css, text: t, nth: Math.max(0, all.indexOf(el)), why: why };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  };
  var clearTags = function () {};

  B.screen = function () {
    if (on('about')) return 'about';
    if (on('menu')) return 'menu';
    if (on('inv')) return 'inv';
    if (on('sheet')) return 'sheet';
    if (on('victory')) return 'victory';
    if (on('evt')) return 'evt';
    if (on('combat')) return 'combat';
    if (on('town')) return 'town';
    if (on('chooser')) return 'chooser';
    if (on('roster')) return 'roster';
    return 'explore';
  };

  /* Numbers that must always be sane, whatever happened. */
  B.check = function () {
    var bad = [];
    var num = function (v, what, lo, hi) {
      if (typeof v !== 'number' || !isFinite(v)) bad.push(what + ' is ' + v);
      else if (lo != null && v < lo) bad.push(what + ' is ' + v + ', below ' + lo);
      else if (hi != null && v > hi) bad.push(what + ' is ' + v + ', above ' + hi);
    };
    (window.party || []).forEach(function (c, i) {
      var n = (c.name || 'hero ' + i);
      var mb = maxBP(c), mm = maxMP(c);
      num(mb, n + ' max BP', 1); num(c.bp, n + ' BP', 0, mb);
      num(mm, n + ' max MP', 0); num(c.mp, n + ' MP', 0, mm);
      num(c.xp, n + ' XP', 0); num(c.level, n + ' level', 1);
    });
    if (window.party && party.length) num(typeof gold !== 'undefined' ? gold : 0, 'gold', 0);
    if (window.cst && cst.foes) cst.foes.forEach(function (f, i) { num(f.bp, 'foe ' + (f.name || i) + ' BP', 0); });
    // the fight screen and the fight agree
    var shown = on('combat');
    if (shown && !window.cst) bad.push('the fight screen is open but there is no fight');
    return bad;
  };

  /* What a player would press next. Returns {do, sel?, key?, why}. */
  B.decide = function (r) {
    clearTags();
    var s = B.screen();
    B.last = B.last || {};

    if (s === 'about') return { do: 'click', sel: '#closeAbout', why: 'close About' };
    if (s === 'menu') return { do: 'click', sel: '#closeMenu', why: 'close the menu' };
    if (s === 'inv') return { do: 'click', sel: '#closeInv', why: 'close the packs' };
    if (s === 'sheet') return { do: 'click', sel: '#sheetClose', why: 'close the sheet' };
    if (s === 'victory') return { do: 'click', sel: '#vicContinue', why: 'won: keep exploring', won: true };

    if (s === 'chooser') {
      var opts = Array.from(document.querySelectorAll('#chooseList .advOpt'));
      var want = r.mode === 'endless' ? /Endless Delve/ : null;
      var pick = opts.filter(function (o) {
        var t = o.querySelector('h3') && o.querySelector('h3').textContent;
        if (/Carry on/.test(t)) return r.resume;
        if (want) return want.test(t);
        return o.querySelector('.go') && o.querySelector('.go').textContent === 'enter';
      })[0];
      if (!pick) return { do: 'none', why: 'nothing to pick on the front screen' };
      return press('#chooseList .advOpt', pick, 'choose ' + (pick.querySelector('h3') || {}).textContent);
    }

    if (s === 'roster') {
      var cont = enabled('#startRow button').filter(function (b) { return /^Continue/.test(label(b)); });
      if (r.resume && cont.length) return press('#startRow button', cont[0], 'continue the saved game');
      var begin = document.getElementById('begin');
      if (begin && !begin.disabled && B.last.suggested) { B.last.suggested = false; return { do: 'click', sel: '#begin', why: 'enter with this party' }; }
      B.last.suggested = true;
      return { do: 'click', sel: '#quickParty', why: 'suggest a party' };
    }

    if (s === 'evt') {
      if (vis(document.getElementById('evtDone'))) return { do: 'click', sel: '#evtClose', why: 'move on' };
      var ch = enabled('#evtChoices button');
      if (!ch.length) return { do: 'none', why: 'an event with no choices', frozen: true };
      var k = Math.floor(r.roll * ch.length);
      return press('#evtChoices button', ch[k], 'event: ' + label(ch[k]));
    }

    if (s === 'town') {
      B.townClicks = (B.townClicks || 0) + 1;
      B.townGold = gold;
      // revive, rest, then train everyone who is ready (Train all, or one at a time)
      var temple = enabled('#tab-temple button').filter(function (b) { return /^(Revive|Rest|Train all|Train|Lift)$/.test(label(b)); });
      var order = ['Revive', 'Rest', 'Train all', 'Train', 'Lift'];
      temple.sort(function (a, b) { return order.indexOf(label(a)) - order.indexOf(label(b)); });
      if (temple.length && B.townClicks < 12) return press('#tab-temple button', temple[0], 'temple: ' + label(temple[0]));
      // nobody selected is ready: look at the next hero, until all four are seen
      var who = Array.from(document.querySelectorAll('#tab-temple .who-row button')).filter(vis);
      B.whoSeen = (B.whoSeen || 0) + 1;
      if (who.length && B.whoSeen < who.length && B.townClicks < 12) { var nx = who[B.whoSeen % who.length]; return press('#tab-temple .who-row button', nx, 'look at ' + label(nx)); }
      B.townClicks = 0; B.whoSeen = 0; B.retreat = false;
      return { do: 'click', sel: '#leaveTown', why: 'back to the tower' };
    }

    // a first-run hint: read it and close it, as a new player would (most of the time)
    if ((s === 'combat' || s === 'explore') && on('hint') && r.roll < 0.7) return { do: 'click', sel: '#hintOk', why: 'close the hint' };
    if (s === 'combat') return B.fight(r);
    return B.explore(r);
  };

  B.fight = function (r) {
    var acts = document.getElementById('acts');
    if (STAGE.playing || acts.classList.contains('busy')) {
      // tapping the fight skips a turn playing out, as a player would
      return { do: r.roll < 0.6 ? 'tap' : 'wait', sel: '#foes', why: 'a turn is playing out' };
    }
    if (cst && cst.outcome) {
      var end = enabled('#acts button');
      if (!end.length) return { do: 'none', why: 'the fight is over but there is no way out', frozen: true };
      return press('#acts button', end[0], 'fight ' + cst.outcome + ': ' + label(end[0]));
    }
    if (STAGE.playing || acts.classList.contains('busy')) {
      // tapping the fight skips a turn playing out, as a player would
      return { do: r.roll < 0.6 ? 'tap' : 'wait', sel: '#foes', why: 'a turn is playing out' };
    }
    var i = activeActor(cst);
    if (i === null) return { do: 'wait', why: 'the enemy is acting', foesTurn: true };
    var bs = enabled('#acts button');
    if (!bs.length) return { do: 'none', why: party[i].name + ' has nothing to press', frozen: true };
    // sometimes pick a target from the list or the stage, the way a player does
    if (r.roll2 < 0.15) {
      var rows = Array.from(document.querySelectorAll('#cRoster .rrow')).filter(vis);
      if (rows.length) return press('#cRoster .rrow', rows[Math.floor(r.roll * rows.length)], 'pick a target in the list');
    }
    var names = bs.map(label);
    var low = party.some(function (c) { return c.bp > 0 && c.bp < maxBP(c) * 0.4; });
    var find = function (re) { for (var k = 0; k < names.length; k++) if (re.test(names[k])) return k; return -1; };
    var pickI = -1;
    // v5.4: a boss winding up shows on the screen. Answer it as a player would:
    // grit in its eyes or Silence if there is one, otherwise brace.
    var tell = Array.from(document.querySelectorAll('#cRoster .tell')).filter(vis).length > 0;
    if (tell) {
      pickI = find(/^(Dirty Trick|Silence)/);
      if (pickI < 0) pickI = find(/^Defend/);
      if (pickI >= 0) return press('#acts button', bs[pickI], party[i].name + ' answers the wind-up: ' + names[pickI], { tell: true });
    }
    if (low) pickI = find(/^(Cure|Heal|Mend|Bless)/);
    if (pickI < 0 && r.roll < 0.2) { var spells = names.map(function (n, k) { return /^(Attack|Shoot|Defend|Use|Flee|Run)/.test(n) ? -1 : k; }).filter(function (k) { return k >= 0; });
      if (spells.length) pickI = spells[Math.floor(r.roll2 * spells.length)]; }
    if (pickI < 0) pickI = find(/^(Attack|Shoot|Strike|Stab)/);
    if (pickI < 0) pickI = find(/^Defend/);
    if (pickI < 0) pickI = 0;
    return press('#acts button', bs[pickI], party[i].name + ': ' + names[pickI]);
  };

  var FW = function (f) { return FWD[f]; };
  var edge = function (x, y, f) { return floor.id + ':' + x + ',' + y + ':' + f; };
  var cell = function (x, y) { return floor.id + ':' + x + ',' + y; };

  B.explore = function (r) {
    if (!window.party || !party.length || !window.floor) return { do: 'wait', why: 'no party yet' };
    if (window.animating) return { do: 'wait', why: 'moving' };
    var here = cell(pos.x, pos.y);
    B.stood[here] = 1;
    B.floorTicks[floor.id] = (B.floorTicks[floor.id] || 0) + 1;

    // did the last step go nowhere? then that way is shut, unless Use opens it
    if (B.last.move && B.last.move.from === here + ':' + pos.f && !B.last.move.done) {
      var e = edge(pos.x, pos.y, pos.f);
      B.last.move.done = true;
      if (aheadUse() && !B.tries[e]) { B.tries[e] = 1; B.last.move = null; return { do: 'key', key: ' ', why: 'something ahead to use: ' + aheadUse().verb }; }
      B.blocked[e] = 1;
    }
    B.last.move = null;

    // the wounded rest, while camp allows
    var hurt = party.filter(function (c) { return c.bp > 0 && c.bp < maxBP(c) * 0.45; }).length;
    var rest = document.getElementById('btnRest');


    // worn down with nowhere left to camp: head home to the temple, when there is
    // gold to pay it (or never been yet)
    var tot = party.reduce(function (a, c) { return a + maxBP(c); }, 0), now = party.reduce(function (a, c) { return a + c.bp; }, 0);
    var weak = now < tot * 0.5 || party.some(function (c) { return c.bp <= 0; });
    var canCamp = rest && !rest.disabled;
    if (weak && canCamp) return { do: 'click', sel: '#btnRest', why: 'rest, the party is worn' };
    if (weak && !canCamp && (B.townGold == null || gold > B.townGold + 20)) B.retreat = true;
    if (B.retreat) {
      if (isExitCell(floor, pos.x, pos.y)) {
        // home is the square we stand on: step off and back on
        for (var fo = 0; fo < 4; fo++) if (canStep(floor.cells, pos.x, pos.y, (pos.f + fo) % 4)) break;
        var df = (pos.f + fo) % 4;
        if (df === pos.f) { B.last.move = { from: here + ':' + pos.f }; B.stepBack = true; return { do: 'key', key: 'ArrowUp', why: 'step off the way home' }; }
        return { do: 'key', key: 'ArrowRight', why: 'turn to step off' };
      }
      var home = floor.depth === 1
        ? function (x, y) { return isExitCell(floor, x, y); }
        : function (x, y) { var f = floor.features[x + ',' + y]; return f && f.type === 'stairsUp' && interactable(f, x, y); };
      var hp = B.route(home);
      if (hp && hp.length) {
        var hd = hp[0];
        if (hd === pos.f) { B.last.move = { from: here + ':' + pos.f }; return { do: 'key', key: 'ArrowUp', why: 'heading home to heal' }; }
        return { do: 'key', key: hd === (pos.f + 1) % 4 ? 'ArrowRight' : 'ArrowLeft', why: 'turn for home' };
      }
      if (hp && !hp.length && floor.depth > 1) return { do: 'key', key: ' ', why: 'up the stairs for home' };
      B.retreat = false;
    }

    // something underfoot to use
    var ft = floor.features[pos.x + ',' + pos.y];
    var offer = interactable(ft, pos.x, pos.y);
    var travel = ft && /^(stairsDown|stairsUp|teleporter)$/.test(ft.type);
    if (offer && !travel && !B.used[here]) { B.used[here] = 1; return { do: 'key', key: ' ', why: offer }; }

    // walk to the nearest square the bot has not stood on, or a thing to use
    var maxFloorTicks = r.floorBudget;
    var exhausted = B.floorTicks[floor.id] > maxFloorTicks;
    var goal = function (x, y) {
      var k = cell(x, y);
      var f = floor.features[x + ',' + y];
      if (f && /^(stairsDown|stairsUp|teleporter)$/.test(f.type)) return false;
      if (exhausted) return false;
      if (!B.stood[k]) return true;
      return !!(f && interactable(f, x, y) && !B.used[k]);
    };
    var path = B.route(goal);
    if (!path) {
      // nothing left here: take the stairs, down first; used stairs are not taken twice in a row
      var stairs = function (type) { return function (x, y) { var f = floor.features[x + ',' + y];
        return f && f.type === type && interactable(f, x, y) && !B.used['stairs:' + cell(x, y)]; }; };
      if (travel && interactable(ft, pos.x, pos.y) && !B.used['stairs:' + here]) {
        B.used['stairs:' + here] = 1; B.stood = {}; B.used = Object.assign({}, B.used);
        return { do: 'key', key: ' ', why: 'take the ' + ft.type };
      }
      path = B.route(stairs('stairsDown')) || B.route(stairs('teleporter')) || B.route(stairs('stairsUp'));
      if (!path) {
        // search for hidden ways, then give up on this floor
        B.searched = B.searched || {};
        if (!B.searched[here] && r.roll < 0.5) { B.searched[here] = 1; return { do: 'key', key: 'f', why: 'search for a hidden way' }; }
        return { do: 'wander', why: 'nowhere left to go', wandered: true, key: r.roll < 0.5 ? 'ArrowLeft' : 'ArrowUp' };
      }
    }
    if (!path.length) return { do: 'wait', why: 'at the goal' };
    var d = path[0];
    if (d === pos.f) { B.last.move = { from: here + ':' + pos.f }; return { do: 'key', key: 'ArrowUp', why: 'walk' }; }
    if (d === (pos.f + 1) % 4) return { do: 'key', key: 'ArrowRight', why: 'turn right' };
    return { do: 'key', key: 'ArrowLeft', why: 'turn left' };
  };

  /* The first direction on the shortest route to a square the test likes. */
  B.route = function (want) {
    var Wd = floor.w, Hd = floor.h, start = pos.x + ',' + pos.y, seen = {}, q = [[pos.x, pos.y, -1]];
    seen[start] = 1;
    while (q.length) {
      var p = q.shift();
      if (p[2] >= 0 && want(p[0], p[1])) return [p[2]];
      for (var f = 0; f < 4; f++) {
        if (!canStep(floor.cells, p[0], p[1], f) || B.blocked[edge(p[0], p[1], f)]) continue;
        var nx = p[0] + FW(f)[0], ny = p[1] + FW(f)[1];
        if (nx < 0 || ny < 0 || nx >= Wd || ny >= Hd) continue;
        var k = nx + ',' + ny;
        if (seen[k]) continue;
        seen[k] = 1;
        q.push([nx, ny, p[2] < 0 ? f : p[2]]);
      }
    }
    return want(pos.x, pos.y) ? [] : null;
  };

  /* The game as a save sees it, for the reload check. */
  B.snapshot = function () {
    var s = serialise(captureState());
    var drop = function (o) {
      if (!o || typeof o !== 'object') return o;
      if (Array.isArray(o)) return o.map(drop);
      var out = {};
      Object.keys(o).sort().forEach(function (k) { if (!/^(savedAt|createdAt|updatedAt|playtime|playtimeSec|lastSaved)$/.test(k)) out[k] = drop(o[k]); });
      return out;
    };
    return JSON.stringify(drop(s));
  };

  /* A fingerprint of everything that moves, to spot a game that has stopped. */
  B.sig = function () {
    var p = window.pos ? pos.x + ',' + pos.y + ',' + pos.f : '';
    var c = window.cst ? cst.round + ':' + (cst.log || []).length + ':' + (cst.outcome || '') : '';
    var hp = (window.party || []).map(function (h) { return h.bp + '/' + h.mp; }).join(',');
    return [B.screen(), window.floor && floor.id, p, c, hp, typeof gold !== 'undefined' ? gold : 0, document.getElementById('mlog') ? document.getElementById('mlog').childElementCount : 0].join('|');
  };
};

/* ---------------------------------------------------------------- one run */
async function playRun(browser, n, mode, motion) {
  const seed = SEED0 * 1000 + n;
  const R = rng(seed);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: motion === 'off' ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const faults = [], notes = [], log = [];
  const fault = (kind, detail) => { if (faults.some(f => f.kind === kind && f.detail === detail)) return; faults.push({ kind, detail, tick }); };
  page.on('pageerror', e => fault('page-error', e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_FILE_NOT_FOUND/.test(m.text())) fault('page-error', 'console: ' + m.text()); });
  // the Endless Delve asks three things: a seed, a size, how many floors
  page.on('dialog', d => {
    const m = d.message();
    if (/size/i.test(m)) return d.accept(['small', 'medium', 'large'][seed % 3]);
    if (/floors/i.test(m)) return d.accept(seed % 2 ? 'endless' : '4');
    return d.accept(String(seed));
  });

  let tick = 0, won = false, floors = new Set(), fights = 0, wipes = 0, reloads = 0, steps = 0, tells = 0;
  let lastOutcome = null, fled = 0, fightLog = [], missed = 0, lastSig = '', still = 0, foesWait = 0, frozenFor = 0, wanderFor = 0;
  await page.goto('file://' + HTML);
  await page.waitForTimeout(400);
  await page.evaluate((v) => { try { localStorage.clear(); if (v === '2d') localStorage.setItem((window.MSDD_NS || 'dev_') + 'prefs', JSON.stringify({ view3d: false })); } catch (e) {} }, VIEW);
  await page.reload(); await page.waitForTimeout(400);
  await page.evaluate(PAGE);

  const shot = async (why) => { const f = path.join(OUT, `run${n}-${mode}-${motion}-t${tick}-${why}.png`); await page.screenshot({ path: f }).catch(() => {}); return f; };

  const bossTold = {}, bossTries = {};
  let bossQueue = null, bossNow = null;
  for (tick = 0; tick < TICKS; tick++) {
    if (SHOTS && tick % SHOTS === 0) await shot('view');
    if (BOSSES) {
      // the last boss fight is over: move on once it was answered, or after three tries
      if (bossNow && !(await page.evaluate(() => !!window.cst).catch(() => true))) {
        if (bossTold[bossNow] > 0 || bossTries[bossNow] >= 3) bossQueue = bossQueue.slice(1);
        bossNow = null;
      }
      const go = bossNow ? { wait: true } : await page.evaluate((q) => {
        if (__bot.screen() !== 'explore' || !window.party || !party.length || window.cst || sceneDue) return { wait: true };
        const all = Object.keys(MONSTERS).filter(k => (MONSTERS[k].traits || []).indexOf('boss') >= 0);
        const left = q || all;
        if (!left.length) return { done: true, all };
        party.forEach(c => { c.xp = Math.max(c.xp, XP_TABLE[Math.min(XP_TABLE.length - 1, 6)]);
          while (canLevel(c)) levelUp(c, actionRng);
          c.status = []; c.bp = maxBP(c); c.mp = maxMP(c); });
        startCombat(left[0]);
        return { started: left[0], left, all };
      }, bossQueue).catch(() => ({ wait: true }));
      if (go.done) break;
      if (go.started) {
        bossQueue = go.left; bossNow = go.started;
        bossTries[bossNow] = (bossTries[bossNow] || 0) + 1;
        go.all.forEach(k => { if (bossTold[k] == null) bossTold[k] = 0; });
      }
    }
    const st = await page.evaluate((r) => {
      const d = __bot.decide(r);
      return { d, bad: __bot.check(), sig: __bot.sig(), floor: window.floor && floor.id, inFight: !!window.cst, outcome: window.cst && cst.outcome,
               foes: window.cst ? cst.foes.map(f => f.name).join(', ') : '', levels: (window.party || []).map(c => c.level).join('/') };
    }, { mode, roll: R(), roll2: R(), resume: false, floorBudget: 400 }).catch(e => ({ err: e.message }));
    if (st.err) { fault('page-error', 'the bot could not read the page: ' + st.err); break; }
    const d = st.d;
    if (log.length > 60) log.shift();
    log.push(tick + ' ' + d.why);
    if (!QUIET && tick % 250 === 0) console.log(`  run ${n} ${mode}/${motion} tick ${tick}: ${d.why}`);

    st.bad.forEach(b => fault(/fight screen/.test(b) ? 'screen-mismatch' : 'bad-number', b));
    if (st.floor) floors.add(st.floor);
    if (d.won && !won) { won = true; notes.push('won the adventure at tick ' + tick); }
    if (st.outcome && st.outcome !== lastOutcome) { if (st.outcome === 'won') fights++; else if (st.outcome === 'lost') wipes++; else fled++;
      fightLog.push(st.outcome + ' vs ' + st.foes + ' (' + st.floor + ', party ' + st.levels + ')'); }
    lastOutcome = st.outcome;

    // a game that has stopped moving
    if (d.frozen) { if (++frozenFor > 6) { fault('frozen', d.why); await shot('frozen'); break; } } else frozenFor = 0;
    if (d.tell) tells++;                         // v5.4: a boss wind-up seen and answered
    if (BOSSES && d.tell && bossNow && ++bossTold[bossNow] === 1) await shot('tell-' + bossNow.replace('mn.', ''));
    if (d.foesTurn) { if (++foesWait > 20) { fault('foes-stuck', 'the enemy\'s turn never ended'); await shot('foes-stuck'); break; } } else foesWait = 0;
    if (d.wandered) { if (++wanderFor > 40) { notes.push('wandered: ran out of places to go on ' + st.floor); break; } } else wanderFor = 0;
    if (st.sig === lastSig && !/^(wait|tap)$/.test(d.do)) { if (++still > 80) { notes.push('the bot went round in circles on ' + st.floor + ' (' + d.why + ')'); break; } } else if (st.sig !== lastSig) still = 0;
    lastSig = st.sig;

    // act, with real input
    try {
      if (d.do === 'click') await clickIt(page, d);
      else if (d.do === 'tap') await page.click(d.sel, { timeout: 2000, position: { x: 5, y: 5 } });
      else if (d.do === 'key' || d.do === 'wander') { await page.keyboard.press(d.key); if (d.key === 'ArrowUp') steps++; }
      else if (d.do === 'none') {}
      missed = 0;
    } catch (e) {
      if (++missed < 4) { await page.waitForTimeout(150); continue; }
      missed = 0;
      // the control said it was there and pressable, and was not: that is the screen lying.
      // Watch it for half a second, so the report says why.
      const probe = d.css ? await page.evaluate(async (d) => {
        const seen = []; let muts = 0;
        const host = document.querySelector(d.css) && document.querySelector(d.css).parentNode;
        const mo = new MutationObserver(ms => muts += ms.length); if (host) mo.observe(host, { childList: true, subtree: true, attributes: true });
        for (let i = 0; i < 6; i++) {
          const el = Array.from(document.querySelectorAll(d.css)).filter(e => (e.textContent || '').indexOf(d.text) >= 0)[d.nth];
          if (!el) seen.push('gone'); else { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            seen.push(Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + (top === el || el.contains(top) ? '' : ' under ' + (top && (top.id || top.tagName))) + (window.STAGE && STAGE.playing ? ' playing' : '')); }
          await new Promise(r => setTimeout(r, 90));
        }
        mo.disconnect();
        return seen.join(' | ') + ' · ' + muts + ' changes';
      }, d).catch(() => '') : '';
      fault('frozen', probe + ' ·· ' + 'could not press ' + (d.sel || d.css + ' "' + d.text + '"') + ' (' + d.why + '): ' + e.message.split('\n').filter(l => /intercepts|not visible|not stable|detached|disabled|outside/.test(l)).slice(-1)[0] || e.message.split('\n')[0]);
    }
    await page.waitForTimeout(d.do === 'wait' ? 120 : 30);

    // now and then: save, reload the page, and check the game comes back the same
    if (!st.inFight && tick > 0 && tick % 300 === 0) {
      const ok = await reloadCheck(page, fault);
      if (ok) reloads++;
    }
  }
  if (BOSSES) {
    notes.push('bosses: ' + Object.keys(bossTold).map(k => k.replace('mn.', '') + ' ' + bossTold[k] + ' in ' + (bossTries[k] || 0)).join(', '));
    Object.keys(bossTold).forEach(k => { if (!bossTold[k]) fault('no-tell', k + ' never wound up where the bot could see and answer it'); });
    if (!Object.keys(bossTold).length) fault('no-tell', 'no boss fight was ever started');
  }
  const out = { run: n, seed, mode, motion, ticks: tick, steps, floors: [...floors], fights, wipes, fled, reloads, tells, won, faults, notes, fightLog };
  if (faults.length) { out.lastMoves = log.slice(-25); out.shot = await shot('end'); }
  await ctx.close();
  return out;
}

/* Click what the page described: an id, or the k-th match by its words. */
async function clickIt(page, d) {
  if (d.sel) return page.click(d.sel, { timeout: 2000 });
  const esc = d.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator(d.css).filter({ hasText: new RegExp(esc) }).nth(d.nth).click({ timeout: 2000 });
}

/* Save, reload the page, continue the saved game, and compare. */
async function reloadCheck(page, fault) {
  const screen = await page.evaluate(() => __bot.screen());
  if (screen !== 'explore') return false;
  const before = await page.evaluate(() => { autosave(); return __bot.snapshot(); });
  await page.reload(); await page.waitForTimeout(500);
  await page.evaluate(PAGE);
  // the way back in: the front screen, then Continue on the party screen
  for (let k = 0; k < 6; k++) {
    const d = await page.evaluate(() => __bot.decide({ resume: true, roll: 0, roll2: 0, mode: 'written', floorBudget: 400 }));
    if (await page.evaluate(() => __bot.screen()) === 'explore' && await page.evaluate(() => !!(window.party && party.length))) break;
    if (d.do === 'click') await clickIt(page, d).catch(() => {});
    await page.waitForTimeout(250);
  }
  const back = await page.evaluate(() => window.party && party.length ? __bot.snapshot() : null);
  if (!back) { fault('reload-differs', 'after a reload the saved game could not be continued'); return false; }
  if (back !== before) {
    const a = JSON.parse(before), b = JSON.parse(back), diffs = [];
    const walk = (x, y, p) => {
      if (diffs.length > 6) return;
      if (JSON.stringify(x) === JSON.stringify(y)) return;
      if (x && y && typeof x === 'object' && typeof y === 'object') { new Set([...Object.keys(x), ...Object.keys(y)]).forEach(k => walk(x[k], y[k], p + '.' + k)); return; }
      diffs.push(p + ': ' + JSON.stringify(x) + ' -> ' + JSON.stringify(y));
    };
    walk(a, b, 'save');
    fault('reload-differs', diffs.join('; '));
  }
  return true;
}

/* ---------------------------------------------------------------- all runs */
(async () => {
  const browser = await chromium.launch();
  const modes = MODE === 'both' ? ['endless', 'written'] : [MODE];
  const motions = MOTION === 'both' ? ['on', 'off'] : [MOTION];
  const results = [];
  const t0 = Date.now();
  // several runs at once, each in its own browser context
  let next = 0;
  const worker = async () => { while (next < RUNS) { const n = next++;
    const mode = modes[n % modes.length], motion = motions[Math.floor(n / modes.length) % motions.length];
    const r = await playRun(browser, n, mode, motion);
    results.push(r);
    const tagLine = r.faults.length ? 'FAULT ' + r.faults.map(f => f.kind).join(',') : 'clean';
    console.log(`run ${n} ${mode}/${motion} seed ${r.seed}: ${r.ticks} ticks, ${r.steps} steps, floors ${r.floors.length}, fights ${r.fights}, wipes ${r.wipes}, reloads ${r.reloads}${r.tells ? ', tells answered ' + r.tells : ''}${r.won ? ', WON' : ''} — ${tagLine}${r.notes.length ? ' (' + r.notes.join('; ') + ')' : ''}`);
    r.faults.forEach(f => console.log(`    ${f.kind} at tick ${f.tick}: ${f.detail}`));
  } };
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));
  results.sort((a, b) => a.run - b.run);
  await browser.close();
  const faulty = results.filter(r => r.faults.length);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.length} runs in ${Math.round((Date.now() - t0) / 1000)}s: ${results.length - faulty.length} clean, ${faulty.length} with faults. ` +
              `${results.reduce((s, r) => s + r.fights, 0)} fights, ${results.reduce((s, r) => s + r.steps, 0)} steps, ${results.reduce((s, r) => s + r.reloads, 0)} reloads.`);
  console.log(faulty.length ? 'PLAYBOT FAILED' : 'PLAYBOT PASSED');
  process.exit(faulty.length ? 1 : 0);
})();

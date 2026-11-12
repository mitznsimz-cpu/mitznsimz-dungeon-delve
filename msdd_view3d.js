/* msdd_view3d.js — Dungeon Delve's corridor in WebGL 2 (v6.0).
 *
 * The game still decides everything: where the walls are, which doors are
 * open, what has been taken, what is hidden. This file only draws it. It asks
 * the game through a small set of hooks, builds the floor as real geometry,
 * and draws it with the zone materials from msdd_materials.js: torchlight
 * that falls off, relief in the stone, shadows from the torch and the nearest
 * wall lamps, props, particles in the air, and paper-thick minis on bases.
 *
 * Movement stays the game's: one square per step, four ways to face. The
 * camera only glides between those positions.
 *
 *   var v = MSDD3D.create(canvas, { minis: MitzMinis, atlasImg, atlasIndex });
 *   v.setFloor(floorDef, zoneKey, hooks);   // when the floor changes
 *   v.refresh();                             // when doors, chests or levers change
 *   v.render(cam);                           // every frame: { x, z, yaw, bob, sight, time }
 *
 * MSDD3D.plan(floorDef, zone, hooks) builds the geometry without WebGL, so the
 * tests can check it in node.
 */
(function (root) {
  'use strict';
  var FWD = [[0, -1], [1, 0], [0, 1], [-1, 0]], DIRBIT = [1, 2, 4, 8], H = 1.0;

  function hash(x, y, a, s) {
    var n = ((x * 73856093) ^ (y * 19349663) ^ (a * 83492791) ^ (s * 2654435761)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  /* ---------------- geometry, with no WebGL in sight ---------------- */
  function Geo() { this.v = []; }
  Geo.prototype.tri = function (a, b, c, ua, ub, uc) {
    var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    var n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
    var v = this.v; [[a, ua], [b, ub], [c, uc]].forEach(function (q) { v.push(q[0][0], q[0][1], q[0][2], q[1][0], q[1][1], n[0] / l, n[1] / l, n[2] / l); });
  };
  Geo.prototype.quad = function (p0, p1, p2, p3, n, uv) {
    uv = uv || [0, 1, 1, 1, 1, 0, 0, 0]; var P = [p0, p1, p2, p3], v = this.v;
    [0, 1, 2, 0, 2, 3].forEach(function (i) { var p = P[i]; v.push(p[0], p[1], p[2], uv[i * 2], uv[i * 2 + 1], n[0], n[1], n[2]); });
  };
  Geo.prototype.face = function (a, b, c, d, want, uv) {
    var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    var n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) this.quad(d, c, b, a, want, uv && [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]]);
    else this.quad(a, b, c, d, want, uv);
  };
  // a box turned about the vertical (ry) and tipped about its own x (rx)
  Geo.prototype.box = function (cx, cy, cz, sx, sy, sz, top, ry, rx) {
    ry = ry || 0; rx = rx || 0;
    var c1 = Math.cos(ry), s1 = Math.sin(ry), c2 = Math.cos(rx), s2 = Math.sin(rx);
    var T = function (x, y, z) { var y2 = y * c2 - z * s2, z2 = y * s2 + z * c2; return [cx + x * c1 + z2 * s1, cy + y2, cz - x * s1 + z2 * c1]; };
    var R = function (n) { var p = T(n[0], n[1], n[2]); return [p[0] - cx, p[1] - cy, p[2] - cz]; };
    var a = sx / 2, b = sy / 2, c = sz / 2;
    this.quad(T(-a, -b, c), T(a, -b, c), T(a, b, c), T(-a, b, c), R([0, 0, 1]));
    this.quad(T(a, -b, -c), T(-a, -b, -c), T(-a, b, -c), T(a, b, -c), R([0, 0, -1]));
    this.quad(T(a, -b, c), T(a, -b, -c), T(a, b, -c), T(a, b, c), R([1, 0, 0]));
    this.quad(T(-a, -b, -c), T(-a, -b, c), T(-a, b, c), T(-a, b, -c), R([-1, 0, 0]));
    if (top !== false) this.quad(T(-a, b, c), T(a, b, c), T(a, b, -c), T(-a, b, -c), R([0, 1, 0]));
  };
  // a solid of revolution: prof = [[radius, height], ...] from the bottom up
  Geo.prototype.lathe = function (cx, cy, cz, prof, sides, rot) {
    rot = rot || 0;
    for (var i = 0; i < sides; i++) {
      var a0 = rot + i / sides * Math.PI * 2, a1 = rot + (i + 1) / sides * Math.PI * 2;
      for (var j = 0; j < prof.length - 1; j++) {
        var r0 = prof[j][0], y0 = prof[j][1], r1 = prof[j + 1][0], y1 = prof[j + 1][1];
        var p00 = [cx + Math.cos(a0) * r0, cy + y0, cz + Math.sin(a0) * r0], p10 = [cx + Math.cos(a1) * r0, cy + y0, cz + Math.sin(a1) * r0];
        var p01 = [cx + Math.cos(a0) * r1, cy + y1, cz + Math.sin(a0) * r1], p11 = [cx + Math.cos(a1) * r1, cy + y1, cz + Math.sin(a1) * r1];
        var u0 = i / sides, u1 = (i + 1) / sides;
        if (r0 > 0.0001) this.tri(p00, p01, p10, [u0, y0], [u0, y1], [u1, y0]);
        if (r1 > 0.0001) this.tri(p10, p01, p11, [u1, y0], [u0, y1], [u1, y1]);
      }
    }
  };
  Geo.prototype.count = function () { return this.v.length / 8; };

  var GEO_NAMES = ['wall', 'floor', 'water', 'embers', 'holy', 'antimagic', 'ice', 'rotten', 'ceil', 'prop', 'wood', 'iron',
                   'flame', 'recess', 'bone', 'clay', 'chain', 'stem', 'cap', 'crystal', 'web', 'writ', 'glow', 'barrier', 'mist', 'pit', 'base', 'fountain'];
  var TERR_GEO = { water: 'water', embers: 'embers', holy: 'holy', antimagic: 'antimagic', ice: 'ice', rotten: 'rotten' };

  /* Build a floor. zone: an entry of MSDDMat.ZONES. hooks: what the game knows.
     Returns geometry by name, the wall lamps, the door leaves and the minis. */
  function plan(F, zone, hooks) {
    hooks = hooks || {};
    var G = {}; GEO_NAMES.forEach(function (n) { G[n] = new Geo(); });
    var out = { geo: G, lamps: [], doors: [], minis: [], fixtures: [], lids: [], stairs: [] };
    var W = F.w, Hh = F.h, cells = F.cells, feats = F.features || {};
    var ROCK = 16;                                       // the game's cell bits: walls N E S W 1 2 4 8, rock 16
    var cellAt = function (x, y) { return (x < 0 || y < 0 || x >= W || y >= Hh) ? 15 | ROCK : cells[y * W + x]; };
    var wall = function (x, y, d) { return (cellAt(x, y) & DIRBIT[d]) !== 0; };
    var rock = function (x, y) { return (cellAt(x, y) & ROCK) !== 0; };
    var terr = function (x, y) { return hooks.terrain ? hooks.terrain(x, y) : ((F.terrain || {})[x + ',' + y] || null); };
    var decor = zone.decor || [];
    var R = function (x, y, k) { return hash(x, y, k, 91); };

    for (var y = 0; y < Hh; y++) for (var x = 0; x < W; x++) {
      if (rock(x, y)) continue;
      var key = x + ',' + y, t = terr(x, y), ft = feats[key];
      var x0 = x - 0.5, x1 = x + 0.5, z0 = y - 0.5, z1 = y + 0.5;
      // the floor, by what it is made of; a chasm has none
      if (t === 'chasm' || t === 'bridge' || (ft && ft.type === 'pit' && !(hooks.spent && hooks.spent(key, ft)))) {
        for (var dd = 0; dd < 4; dd++) {
          var nx = x + FWD[dd][0], ny = y + FWD[dd][1], nt = terr(nx, ny), nf = feats[nx + ',' + ny];
          var open = !wall(x, y, dd) && (nt === 'chasm' || nt === 'bridge' || (nf && nf.type === 'pit'));
          if (open) continue;
          var e = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]][dd], inn = [-FWD[dd][0], 0, -FWD[dd][1]];
          G.pit.face([e[0], -1.6, e[1]], [e[2], -1.6, e[3]], [e[2], 0, e[3]], [e[0], 0, e[1]], inn);
        }
        G.recess.quad([x0, -1.6, z1], [x1, -1.6, z1], [x1, -1.6, z0], [x0, -1.6, z0], [0, 1, 0]);
        if (t === 'bridge' && (!hooks.bridge || hooks.bridge(x, y))) {
          for (var pl = 0; pl < 6; pl++) G.wood.box(x, -0.03, y - 0.4 + pl * 0.16, 0.6, 0.04, 0.14, true, (R(x, y, pl) - 0.5) * 0.08);
        }
      } else if (ft && ft.type === 'stairsDown') {
        shaft(G, x, y, -1.3);                                                         // steps go down through a hole
      } else {
        var fg = TERR_GEO[t] ? G[TERR_GEO[t]] : G.floor;
        fg.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0]);
      }
      if (ft && ft.type === 'stairsUp') shaft(G, x, y, 1.3);                          // and up into one
      else G.ceil.quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], [0, -1, 0]);

      var walls = [];
      for (var d = 0; d < 4; d++) {
        if (!wall(x, y, d)) continue;
        walls.push(d);
        var fc = [[x0, 0, z0], [x1, 0, z0], [x1, H, z0], [x0, H, z0], [0, 0, 1]];
        if (d === 1) fc = [[x1, 0, z0], [x1, 0, z1], [x1, H, z1], [x1, H, z0], [-1, 0, 0]];
        if (d === 2) fc = [[x1, 0, z1], [x0, 0, z1], [x0, H, z1], [x1, H, z1], [0, 0, -1]];
        if (d === 3) fc = [[x0, 0, z1], [x0, 0, z0], [x0, H, z0], [x0, H, z1], [1, 0, 0]];
        var dress = hooks.dressing ? hooks.dressing(x, y, d) : null;
        var torch = hooks.torch ? hooks.torch(x, y, d) : dress === 'torch';
        var behindRock = rock(x + FWD[d][0], y + FWD[d][1]);
        // the odd alcove, drain or scrawl, where solid rock lies behind the wall
        var feat = null, fr = hash(x, y, d, 23);
        if (!torch && !dress && behindRock && !ft && fr < 0.07) feat = ['alcove', 'drain', 'writing'][Math.floor(hash(x, y, d, 24) * 3)];
        if (feat === 'alcove' || feat === 'drain') {
          var P = holed(G, fc, feat === 'alcove' ? [0.3, 0.7, 0.36, 0.72, 0.24] : [0.3, 0.7, 0.0, 0.13, 0.2], feat === 'drain');
          if (feat === 'alcove') out.fixtures.push({ kind: hash(x, y, d, 25) < 0.5 ? 'skull' : 'urn', at: P(0.5, 0.36, 0.12) });
          else for (var g = 1; g < 8; g++) { var q = P(0.3 + g * 0.05, 0.065, 0.03); G.iron.box(q[0], q[1], q[2], fc[4][0] ? 0.015 : 0.012, 0.13, fc[4][0] ? 0.012 : 0.015); }
        } else {
          G.wall.quad(fc[0], fc[1], fc[2], fc[3], fc[4]);
          if (feat === 'writing') {
            var n6 = fc[4], o2 = 0.004, lerp = function (p, q, k) { return [p[0] + (q[0] - p[0]) * k + n6[0] * o2, 0, p[2] + (q[2] - p[2]) * k + n6[2] * o2]; };
            var b0 = lerp(fc[0], fc[1], 0.1), b1 = lerp(fc[0], fc[1], 0.9);
            G.writ.quad([b0[0], 0.22, b0[2]], [b1[0], 0.22, b1[2]], [b1[0], 0.72, b1[2]], [b0[0], 0.72, b0[2]], n6, [0, 1, 1, 1, 1, 0, 0, 0]);
          }
        }
        if (torch) {
          var tx = x + FWD[d][0] * 0.47, tz = y + FWD[d][1] * 0.47;
          G.iron.box(tx, 0.56, tz, 0.025, 0.12, 0.025);
          G.flame.box(tx, 0.645, tz, 0.035, 0.05, 0.035);
          out.lamps.push([tx - FWD[d][0] * 0.08, 0.66, tz - FWD[d][1] * 0.08]);
        }
        if (dress === 'chain') hangChains(G.chain, x, y, d, H, R);
      }
      // cobwebs in a corner: where the game dresses a wall with a web, or the zone asks for them
      var wantWeb = walls.some(function (d2) { return hooks.dressing && hooks.dressing(x, y, d2) === 'web'; }) ||
                    (decor.indexOf('webs') >= 0 && R(x, y, 1) < 0.18) || t === 'web';
      if (wantWeb && walls.length >= 2) cornerWeb(G, x, y, walls, R(x, y, 2));
      if (t === 'web') { crossWeb(G, x, y); }

      // what stands in the square
      if (t === 'pillars') {
        // a pair you walk between, across the way you came through (as the 2D view draws them)
        var nsP = !wall(x, y, 0) || !wall(x, y, 2) ? (wall(x, y, 1) || wall(x, y, 3) || (!wall(x, y, 0) && !wall(x, y, 2))) : false;
        [-0.33, 0.33].forEach(function (o) {
          var px = x + (nsP ? o : 0), pz = y + (nsP ? 0 : o);
          G.wall.box(px, H / 2, pz, 0.18, H, 0.18, false); G.wall.box(px, 0.04, pz, 0.26, 0.08, 0.26); G.wall.box(px, H - 0.04, pz, 0.26, 0.08, 0.26, false);
        });
      }
      else if (t === 'rubble') rubble(G.prop, x, y, R, 0, 0, 24, 0.85, true);   // fallen stone across the way
      else if (t === 'fog') mistCell(G.mist, x, y, R);
      if (ft) feature(G, out, F, key, ft, x, y, walls, hooks, zone, R);
      else if (!t && walls.length && !(F.entry && F.entry[0] === x && F.entry[1] === y)) clutter(G, x, y, walls, zone, R);
    }
    return out;
  }

  /* A square's floor or ceiling opened into a shaft: its four sides in stone,
     and the dark at the far end. depth < 0 goes down, > 0 goes up past the ceiling. */
  function shaft(G, x, y, depth) {
    var x0 = x - 0.5, x1 = x + 0.5, z0 = y - 0.5, z1 = y + 0.5, a = depth < 0 ? depth : H, b = depth < 0 ? 0 : H + depth;
    [[x0, z0, x1, z0, [0, 0, 1]], [x1, z0, x1, z1, [-1, 0, 0]], [x1, z1, x0, z1, [0, 0, -1]], [x0, z1, x0, z0, [1, 0, 0]]].forEach(function (e) {
      G.pit.face([e[0], a, e[1]], [e[2], a, e[3]], [e[2], b, e[3]], [e[0], b, e[1]], e[4]);
    });
    var end = depth < 0 ? depth : H + depth;
    G.recess.face([x0, end, z1], [x1, end, z1], [x1, end, z0], [x0, end, z0], [0, depth < 0 ? 1 : -1, 0]);
  }

  /* A wall with a hole in it: the pieces round the hole, and the niche behind. */
  function holed(G, fc, h, darkBack) {
    var u0 = h[0], u1 = h[1], v0 = h[2], v1 = h[3], depth = h[4];
    var bl = fc[0], br = fc[1], tl = fc[3], n = fc[4];
    var P = function (u, v, k) { return [bl[0] + (br[0] - bl[0]) * u + (tl[0] - bl[0]) * v - n[0] * (k || 0), bl[1] + (br[1] - bl[1]) * u + (tl[1] - bl[1]) * v - n[1] * (k || 0), bl[2] + (br[2] - bl[2]) * u + (tl[2] - bl[2]) * v - n[2] * (k || 0)]; };
    var U = [br[0] - bl[0], br[1] - bl[1], br[2] - bl[2]];
    G.wall.face(P(0, 0), P(1, 0), P(1, v0), P(0, v0), n); G.wall.face(P(0, v1), P(1, v1), P(1, 1), P(0, 1), n);
    G.wall.face(P(0, v0), P(u0, v0), P(u0, v1), P(0, v1), n); G.wall.face(P(u1, v0), P(1, v0), P(1, v1), P(u1, v1), n);
    (darkBack ? G.recess : G.wall).face(P(u0, v0, depth), P(u1, v0, depth), P(u1, v1, depth), P(u0, v1, depth), n);
    G.wall.face(P(u0, v0), P(u0, v0, depth), P(u0, v1, depth), P(u0, v1), U);
    G.wall.face(P(u1, v0), P(u1, v1), P(u1, v1, depth), P(u1, v0, depth), [-U[0], -U[1], -U[2]]);
    G.wall.face(P(u0, v1), P(u0, v1, depth), P(u1, v1, depth), P(u1, v1), [0, -1, 0]);
    if (v0 > 0.001) G.wall.face(P(u0, v0), P(u1, v0), P(u1, v0, depth), P(u0, v0, depth), [0, 1, 0]);
    return P;
  }
  function cornerWeb(G, x, y, walls, r) {
    for (var i = 0; i < 4; i++) {
      var a = (i + Math.floor(r * 4)) % 4, b = (a + 1) % 4; if (walls.indexOf(a) < 0 || walls.indexOf(b) < 0) continue;
      var cx = x + (FWD[a][0] + FWD[b][0]) * 0.5, cz = y + (FWD[a][1] + FWD[b][1]) * 0.5, s = 0.3 + r * 0.2;
      var pa = [cx - FWD[a][0] * s, H - 0.002, cz - FWD[a][1] * s], pb = [cx - FWD[b][0] * s, H - 0.002, cz - FWD[b][1] * s], pc = [cx, H - s * 0.9, cz];
      G.web.tri([cx, H, cz], pa, pc, [0, 0], [1, 0], [0, 1]); G.web.tri([cx, H, cz], pc, pb, [0, 0], [0, 1], [1, 0]);
      return;
    }
  }
  function crossWeb(G, x, y) {                                 // a web across the whole square
    G.web.quad([x - 0.5, 0.05, y], [x + 0.5, 0.05, y], [x + 0.5, 0.95, y], [x - 0.5, 0.95, y], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1]);
    G.web.quad([x, 0.05, y + 0.5], [x, 0.05, y - 0.5], [x, 0.95, y - 0.5], [x, 0.95, y + 0.5], [1, 0, 0], [1, 0, 0, 0, 0, 1, 1, 1]);
  }
  function rubble(g, x, y, R, ox, oz, n, spread, big) {
    for (var r = 0; r < n; r++) {
      var sz = (big ? 0.12 : 0.06) + R(x, y, 30 + r) * (big ? 0.22 : 0.12);
      var dx = (R(x, y, 50 + r) - 0.5) * spread, dz = (R(x, y, 70 + r) - 0.5) * spread;
      // a heap: higher in the middle, stones resting on stones
      var lift = big ? Math.max(0, 1 - Math.hypot(dx, dz) / (spread * 0.55)) * 0.42 * R(x, y, 200 + r) : 0;
      g.box(x + ox + dx, sz * 0.4 + lift, y + oz + dz, sz, sz * 0.8, sz * 1.1, true, R(x, y, 90 + r) * 6, (R(x, y, 110 + r) - 0.5) * 0.7);
    }
  }
  /* v6.1: chains of real links. One oval link is eight short bars round an
     ellipse in an upright plane, turned by yaw; the next link is turned a
     quarter, so they interlock. */
  function chainLink(g, cx, cy, cz, yaw, len, wid, t) {
    var N = 8, pts = [];
    for (var i = 0; i <= N; i++) { var a = i / N * Math.PI * 2; pts.push([Math.sin(a) * wid / 2, Math.cos(a) * len / 2]); }
    for (var k = 0; k < N; k++) {
      var p = pts[k], q = pts[k + 1], dh = q[0] - p[0], dv = q[1] - p[1], L = Math.hypot(dh, dv) + t * 0.9;
      var mh = (p[0] + q[0]) / 2, mv = (p[1] + q[1]) / 2;
      g.box(cx + Math.sin(yaw) * mh, cy + mv, cz + Math.cos(yaw) * mh, t, L, t, true, yaw, Math.atan2(dh, dv));
    }
  }
  /* One to three chains from staples in the ceiling near a wall, of different
     lengths, some ending in an open manacle or a hook. */
  function hangChains(g, x, y, d, H, R) {
    var nx = FWD[d][0], nz = FWD[d][1], ax = -nz, az = nx;                  // towards the wall, and along it
    var n = 1 + Math.floor(R(x, y, d + 44) * 2.4);
    for (var c = 0; c < n; c++) {
      var o = (n === 1 ? (R(x, y, d + 40) - 0.5) * 0.3 : (c / (n - 1) - 0.5) * 0.42) + (R(x, y, d + 50 + c) - 0.5) * 0.06;
      var hx = x + nx * 0.4 + ax * o, hz = y + nz * 0.4 + az * o;
      var yaw = Math.atan2(ax, az) + (R(x, y, d + 60 + c) - 0.5) * 0.5;
      var links = 5 + Math.floor(R(x, y, d + 42 + c * 7) * 9), pitch = 0.052, top = H - 0.012;
      g.box(hx, top, hz, 0.05, 0.016, 0.05);                                 // the staple plate
      chainLink(g, hx, top - 0.03, hz, yaw + Math.PI / 2, 0.05, 0.03, 0.009); // its ring
      for (var k = 0; k < links; k++) chainLink(g, hx, top - 0.065 - k * pitch, hz, yaw + (k % 2 ? Math.PI / 2 : 0), 0.072, 0.042, 0.011);
      var end = top - 0.065 - links * pitch, kind = R(x, y, d + 70 + c);
      if (kind < 0.4) {                                                      // an open manacle, hanging edge-on
        var mr = 0.055, m = 10;
        for (var j = 1; j < m; j++) {                                        // a ring with a gap at the top
          var a0 = j / m * Math.PI * 2, a1 = (j + 1) / m * Math.PI * 2, s0 = [Math.sin(a0) * mr, -Math.cos(a0) * mr], s1 = [Math.sin(a1) * mr, -Math.cos(a1) * mr];
          if (j === m - 1) break;
          var mh = (s0[0] + s1[0]) / 2, mv = (s0[1] + s1[1]) / 2;
          g.box(hx + Math.sin(yaw) * mh, end - mr + mv, hz + Math.cos(yaw) * mh, 0.016, Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) + 0.01, 0.026, true, yaw, Math.atan2(s1[0] - s0[0], s1[1] - s0[1]));
        }
      } else if (kind < 0.65) {                                              // a meat hook
        g.box(hx, end - 0.06, hz, 0.014, 0.1, 0.014);
        var hk = [[0, -0.11], [0.03, -0.14], [0.06, -0.12], [0.065, -0.085]];
        for (var h = 0; h < hk.length - 1; h++) {
          var p = hk[h], q = hk[h + 1];
          g.box(hx + Math.sin(yaw) * (p[0] + q[0]) / 2, end + (p[1] + q[1]) / 2, hz + Math.cos(yaw) * (p[0] + q[0]) / 2,
                0.013, Math.hypot(q[0] - p[0], q[1] - p[1]) + 0.01, 0.013, true, yaw, Math.atan2(q[0] - p[0], q[1] - p[1]));
        }
      }
    }
  }
  function mistCell(g, x, y, R) {                              // a few soft sheets of mist
    for (var i = 0; i < 4; i++) {
      var a = R(x, y, 120 + i) * Math.PI, c = Math.cos(a) * 0.5, s = Math.sin(a) * 0.5, h = 0.1 + i * 0.18;
      g.quad([x - c, h - 0.2, y - s], [x + c, h - 0.2, y + s], [x + c, h + 0.35, y + s], [x - c, h + 0.35, y - s], [s, 0, -c], [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  }
  /* the zone's clutter against a wall: rubble, blocks, bones, barrels, mushrooms... */
  function clutter(G, x, y, walls, zone, R) {
    if (R(x, y, 5) > 0.3) return;
    var opts = (zone.decor || []).filter(function (k) { return ['webs', 'chains'].indexOf(k) < 0; });
    if (!opts.length) return;
    var what = opts[Math.floor(R(x, y, 6) * opts.length)];
    var d = walls[Math.floor(R(x, y, 3) * walls.length)], wx = x + FWD[d][0] * 0.3, wz = y + FWD[d][1] * 0.3;
    var along = [FWD[(d + 1) % 4][0], FWD[(d + 1) % 4][1]], o = (R(x, y, 4) - 0.5) * 0.5;
    wx += along[0] * o; wz += along[1] * o;
    var j = function (k) { return R(x, y, 130 + k); };
    if (what === 'rubble') rubble(G.prop, x, y, R, wx - x, wz - y, 11, 0.36);
    else if (what === 'blocks') { G.prop.box(wx, 0.09, wz, 0.32, 0.18, 0.22, true, j(1) * 6); if (j(2) > 0.5) G.prop.box(wx + 0.1, 0.27, wz, 0.24, 0.16, 0.2, true, j(3) * 6, (j(4) - 0.5) * 0.4); }
    else if (what === 'bones') for (var r2 = 0; r2 < 10; r2++) G.bone.box(wx + (j(r2) - 0.5) * 0.35, 0.012 + r2 * 0.004, wz + (j(r2 + 10) - 0.5) * 0.35, 0.022, 0.022, 0.12 + j(r2 + 20) * 0.08, true, j(r2 + 30) * 6);
    else if (what === 'skulls') for (var r3 = 0; r3 < 5; r3++) skull(G.bone, wx + (j(r3) - 0.5) * 0.25, r3 < 3 ? 0 : 0.07, wz + (j(r3 + 5) - 0.5) * 0.25, j(r3 + 9) * 6);
    else if (what === 'stalagmites') for (var r4 = 0; r4 < 3; r4++) { var l2 = 0.12 + j(r4) * 0.25; G.prop.lathe(wx + (j(r4 + 3) - 0.5) * 0.3, 0, wz + (j(r4 + 6) - 0.5) * 0.3, [[0.06, 0], [0.035, l2 * 0.5], [0, l2]], 6, r4); }
    else if (what === 'stalactites') for (var r9 = 0; r9 < 3; r9++) { var l9 = 0.08 + j(r9 + 40) * 0.2; G.prop.lathe(x + (j(r9 + 43) - 0.5) * 0.8, H - l9, y + (j(r9 + 46) - 0.5) * 0.8, [[0, 0], [0.025, l9 * 0.6], [0.045, l9], [0, l9]], 6, r9); }
    else if (what === 'crates') { G.wood.box(wx, 0.11, wz, 0.22, 0.22, 0.22, true, j(1) * 0.6); if (j(2) > 0.4) G.wood.box(wx + along[0] * 0.2, 0.09, wz + along[1] * 0.2, 0.18, 0.18, 0.18, true, j(3)); }
    else if (what === 'barrels') barrel(G, wx, wz);
    else if (what === 'mushrooms') for (var r6 = 0; r6 < 5; r6++) {
      var mx = wx + (j(r6) - 0.5) * 0.35, mz = wz + (j(r6 + 5) - 0.5) * 0.35, mh = 0.05 + j(r6 + 10) * 0.12, mr = 0.025 + j(r6 + 15) * 0.05;
      G.stem.lathe(mx, 0, mz, [[0.012, 0], [0.009, mh]], 6); G.cap.lathe(mx, mh - 0.01, mz, [[mr, 0], [mr * 0.8, mr * 0.35], [0, mr * 0.55]], 10);
    }
    else if (what === 'crystals') for (var r7 = 0; r7 < 5; r7++) {
      var ql = 0.12 + j(r7 + 10) * 0.25, qr = 0.025 + j(r7 + 15) * 0.025;
      G.crystal.lathe(wx + (j(r7) - 0.5) * 0.25, 0, wz + (j(r7 + 5) - 0.5) * 0.25, [[qr, 0], [qr, ql * 0.75], [0, ql]], 6, j(r7 + 20));
    }
    else if (what === 'coffins') { var ry = d % 2 ? 0 : Math.PI / 2; G.prop.box(wx, 0.09, wz, 0.24, 0.18, 0.56, true, ry); G.prop.box(wx, 0.2, wz, 0.27, 0.04, 0.6, true, ry); }
    else if (what === 'urns') for (var r8 = 0; r8 < 2; r8++) urn(G.clay, wx + along[0] * (r8 * 0.16 - 0.08), 0, wz + along[1] * (r8 * 0.16 - 0.08));
    else if (what === 'beams' && walls.length === 2 && ((walls[0] + 2) % 4 === walls[1])) {
      var ax = FWD[walls[0]][0], az = FWD[walls[0]][1];
      [-1, 1].forEach(function (sg) { G.wood.box(x + ax * 0.42 * sg, H / 2, y + az * 0.42 * sg, 0.08, H, 0.08); });
      G.wood.box(x, H - 0.05, y, ax ? 0.92 : 0.1, 0.1, az ? 0.92 : 0.1);
    }
  }
  function skull(g, x, y, z, rot) { g.lathe(x, y, z, [[0, 0], [0.035, 0.01], [0.045, 0.04], [0.04, 0.07], [0, 0.085]], 8, rot || 0); }
  function urn(g, x, y, z) { g.lathe(x, y, z, [[0, 0], [0.04, 0], [0.07, 0.06], [0.065, 0.12], [0.035, 0.17], [0.045, 0.19], [0, 0.19]], 10); }
  function barrel(G, x, z) {
    G.wood.lathe(x, 0, z, [[0, 0], [0.085, 0], [0.1, 0.07], [0.105, 0.14], [0.1, 0.21], [0.085, 0.28], [0, 0.28]], 12);
    [0.04, 0.24].forEach(function (yy) { G.chain.lathe(x, yy, z, [[0.099, 0], [0.106, 0.012], [0.099, 0.024]], 12); });
  }

  /* The features of a square, as the game says they stand. */
  function feature(G, out, F, key, ft, x, y, walls, hooks, zone, R) {
    var t = ft.type, spent = hooks.spent ? hooks.spent(key, ft) : false;
    var ns = walls.indexOf(1) >= 0 && walls.indexOf(3) >= 0 ? true : walls.indexOf(0) >= 0 && walls.indexOf(2) >= 0 ? false
           : (walls.indexOf(1) >= 0 || walls.indexOf(3) >= 0);   // which way the passage runs
    if (t === 'door' || t === 'secretDoor') {
      var st = hooks.door ? hooks.door(key, ft) : 'shut';
      if (st === 'hidden') {                                         // a seam nobody has found: it is wall
        G.wall.box(x, H / 2, y, ns ? 1.0 : 0.1, H, ns ? 0.1 : 1.0, false);
        return;
      }
      [-0.43, 0.43].forEach(function (o) { G.wall.box(x + (ns ? o : 0), H / 2, y + (ns ? 0 : o), ns ? 0.14 : 0.1, H, ns ? 0.1 : 0.14, false); });
      G.wall.box(x, H - 0.09, y, ns ? 1.0 : 0.1, 0.18, ns ? 0.1 : 1.0, false);
      var leaf = new Geo(), hw = 0.36, top = H - 0.18;
      if (st === 'open') {                                           // swung back against its hinge
        var hx = x + (ns ? -0.36 : 0), hz = y + (ns ? 0 : -0.36);
        if (ns) { leaf.face([hx, 0, y], [hx, 0, y + 0.72], [hx, top, y + 0.72], [hx, top, y], [1, 0, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
                  leaf.face([hx - 0.03, 0, y + 0.72], [hx - 0.03, 0, y], [hx - 0.03, top, y], [hx - 0.03, top, y + 0.72], [-1, 0, 0], [0, 0, 1, 0, 1, 1, 0, 1]); }
        else { leaf.face([x, 0, hz], [x + 0.72, 0, hz], [x + 0.72, top, hz], [x, top, hz], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1]);
               leaf.face([x + 0.72, 0, hz - 0.03], [x, 0, hz - 0.03], [x, top, hz - 0.03], [x + 0.72, top, hz - 0.03], [0, 0, -1], [0, 0, 1, 0, 1, 1, 0, 1]); }
      } else {
        var a = ns ? [x - hw, y] : [x, y - hw], b = ns ? [x + hw, y] : [x, y + hw], n = ns ? [0, 0, 1] : [1, 0, 0];
        leaf.face([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], n, [0, 0, 1, 0, 1, 1, 0, 1]);
        leaf.face([b[0], 0, b[1]], [a[0], 0, a[1]], [a[0], top, a[1]], [b[0], top, b[1]], [-n[0], 0, -n[2]], [0, 0, 1, 0, 1, 1, 0, 1]);
        [1, -1].forEach(function (sg) { G.iron.box(x + (ns ? 0.2 : n[0] * 0.012 * sg), 0.45, y + (ns ? n[2] * 0.012 * sg : 0.2), ns ? 0.05 : 0.02, 0.05, ns ? 0.02 : 0.05); });
      }
      out.doors.push({ key: key, geo: leaf, secret: t === 'secretDoor', locked: !!ft.locked });
    } else if (t === 'portcullis') {
      var up = hooks.gateOpen ? hooks.gateOpen(key, ft) : false, lift = up ? 0.78 : 0;
      for (var b2 = -4; b2 <= 4; b2++) G.iron.box(x + (ns ? b2 * 0.1 : 0), H / 2 + lift, y + (ns ? 0 : b2 * 0.1), 0.03, H - 0.02, 0.03);
      [0.2, 0.5, 0.8].forEach(function (yy) { G.iron.box(x, yy + lift, y, ns ? 0.9 : 0.03, 0.03, ns ? 0.03 : 0.9); });
    } else if (t === 'barrier') {
      if (!(hooks.barrierDown && hooks.barrierDown(key, ft))) {
        G.barrier.quad([x - (ns ? 0.5 : 0), 0, y - (ns ? 0 : 0.5)], [x + (ns ? 0.5 : 0), 0, y + (ns ? 0 : 0.5)], [x + (ns ? 0.5 : 0), H, y + (ns ? 0 : 0.5)], [x - (ns ? 0.5 : 0), H, y - (ns ? 0 : 0.5)], ns ? [0, 0, 1] : [1, 0, 0], [0, 1, 1, 1, 1, 0, 0, 0]);
      }
    } else if (t === 'chest') {
      var ry = ns ? 0 : Math.PI / 2;
      G.wood.box(x, 0.1, y, 0.36, 0.2, 0.24, true, ry);
      G.recess.box(x, 0.199, y, 0.32, 0.004, 0.2, true, ry);                      // the dark inside, seen when the lid is up
      G.iron.box(x + (ns ? 0 : 0.126), 0.16, y + (ns ? 0.126 : 0), ns ? 0.05 : 0.008, 0.06, ns ? 0.008 : 0.05);
      out.lids.push({ key: key, x: x, z: y, ry: ry, open: spent });              // drawn on its own, so it can swing
      [-0.12, 0.12].forEach(function (o) { G.iron.box(x + (ns ? o : 0), 0.1, y + (ns ? 0 : o), ns ? 0.02 : 0.25, 0.202, ns ? 0.25 : 0.02, false); });
    } else if (t === 'trap') {
      if (hooks.trapShown && hooks.trapShown(key, ft)) { G.iron.box(x, 0.008, y, 0.5, 0.016, 0.5); G.glow.box(x, 0.018, y, 0.06, 0.004, 0.42, true, Math.PI / 4); G.glow.box(x, 0.018, y, 0.06, 0.004, 0.42, true, -Math.PI / 4); }
    } else if (t === 'plate') {
      G.prop.box(x, 0.012, y, 0.6, 0.024, 0.6);
    } else if (t === 'lever') {
      var d = walls.length ? walls[0] : 0, on = hooks.leverOn ? hooks.leverOn(key, ft) : false;
      var wx = x + FWD[d][0] * 0.49, wz = y + FWD[d][1] * 0.49, lean = (on ? 0.6 : -0.6);
      G.iron.box(wx, 0.5, wz, FWD[d][0] ? 0.02 : 0.1, 0.14, FWD[d][0] ? 0.1 : 0.02);
      G.iron.box(wx - FWD[d][0] * 0.05, 0.52, wz - FWD[d][1] * 0.05, 0.022, 0.2, 0.022, true, d % 2 ? Math.PI / 2 : 0, lean * (d === 0 || d === 3 ? -1 : 1));
    } else if (t === 'shrine' || t === 'altar') {
      G.prop.box(x, 0.16, y, 0.42, 0.32, 0.3); G.prop.box(x, 0.335, y, 0.5, 0.03, 0.36);
      if (!spent) G.glow.lathe(x, 0.35, y, [[0.05, 0], [0.04, 0.03], [0, 0.05]], 8);
    } else if (t === 'fountain') {
      G.prop.lathe(x, 0, y, [[0.36, 0], [0.38, 0.14], [0.33, 0.16], [0.3, 0.06], [0, 0.06]], 16);
      G.prop.lathe(x, 0.06, y, [[0.05, 0], [0.04, 0.32], [0.1, 0.36], [0, 0.38]], 10);
      G.fountain.lathe(x, 0.12, y, [[0.31, 0], [0, 0]], 16);
    } else if (t === 'campsite') {
      for (var l = 0; l < 4; l++) G.wood.box(x, 0.03, y, 0.04, 0.04, 0.34, true, l * Math.PI / 4);
      if (!spent) G.glow.lathe(x, 0.04, y, [[0.08, 0], [0.04, 0.05], [0, 0.07]], 8);
    } else if (t === 'remains') {
      skull(G.bone, x + 0.1, 0, y - 0.05, 0.4);
      for (var r2 = 0; r2 < 7; r2++) G.bone.box(x + (R(x, y, 150 + r2) - 0.5) * 0.4, 0.012, y + (R(x, y, 160 + r2) - 0.5) * 0.4, 0.022, 0.022, 0.14, true, R(x, y, 170 + r2) * 6);
    } else if (t === 'stairsDown' || t === 'stairsUp') {
      var dirIn = walls.length === 3 ? [0, 1, 2, 3].filter(function (q) { return walls.indexOf(q) < 0; })[0] : (ns ? 2 : 1);
      var fx = -FWD[dirIn][0], fz = -FWD[dirIn][1], up = t === 'stairsUp';   // the steps run away from the way in
      var n = up ? 10 : 7, sg = new Geo();                                        // up: ten shallow steps, a tenth of the way each
      for (var s2 = 0; s2 < n; s2++) {
        // up: rising away from the way in. down: dropping toward it, so you look onto the treads, not behind the rim
        var at = up ? s2 : n - 1 - s2;
        var cx = x + fx * (-0.5 + (at + 0.5) / n), cz = y + fz * (-0.5 + (at + 0.5) / n);
        var top = up ? (s2 + 1) * 0.1 : -(s2 + 1) * 0.1 + 0.02, bot = up ? 0 : -1.3;
        sg.box(cx, (top + bot) / 2, cz, fx ? 1 / n : 0.98, top - bot, fz ? 1 / n : 0.98);
      }
      if (!up) {                                                                    // a low kerb round the well, but not on the way in
        [0, 1, 2, 3].forEach(function (q) {
          if (q === dirIn || walls.indexOf(q) >= 0) return;
          var kx = x + FWD[q][0] * 0.46, kz = y + FWD[q][1] * 0.46;
          G.prop.box(kx, 0.07, kz, FWD[q][0] ? 0.08 : 1.0, 0.14, FWD[q][1] ? 0.08 : 1.0);
        });
      }
      out.stairs.push({ key: key, geo: sg });                                       // its own piece: not drawn while you stand on it
      if (!up) { out.stairsDown = out.stairsDown || []; out.stairsDown.push([x, y]); }
    } else if (t === 'teleporter') {
      G.glow.lathe(x, 0.006, y, [[0.4, 0], [0.38, 0.004], [0.3, 0.004], [0.28, 0]], 24);
    } else if (t === 'staff') {
      if (!spent) { G.wood.box(x, 0.03, y, 0.04, 0.04, 0.7, true, 0.6); G.glow.lathe(x + 0.2, 0.03, y + 0.27, [[0.03, 0], [0.035, 0.03], [0, 0.06]], 8); }
    }
    // figures: monsters, people, statues
    var who = hooks.figures ? hooks.figures(key, ft) : null;
    if (who && who.length) {
      var faceTo = hooks.faceTo ? hooks.faceTo(x, y) : 0;
      who.slice(0, 3).forEach(function (w, i) {
        var off = who.length === 1 ? 0 : (i - (Math.min(3, who.length) - 1) / 2) * 0.3;
        out.minis.push({ fig: w.fig, faction: w.faction || 'foe', tall: w.tall || 0.6, x: x + (ns ? off : 0) + (i === 1 ? 0.05 : 0), z: y + (ns ? 0 : off) - (i === 1 ? 0.12 : 0), key: key, grey: !!w.grey });
      });
    }
  }

  /* Which zone a floor wears: its own, else by habitat, else by its walls. */
  function zoneFor(F, M) {
    if (!M) return 'damp';
    if (F && F.zone && M.ZONES[F.zone]) return F.zone;
    var hab = (F && F.habitat) || '', wallT = (F && F.materials && F.materials.wall) || '';
    var byHab = { flooded: 'sunken', crypt: 'crypt', warren: 'damp', forge: 'lava', deep: 'fungal', ruin: 'overgrown' };
    if (byHab[hab]) return byHab[hab];
    var byWall = { 'stone.tower': 'damp', 'stone.warren': 'sewer', 'stone.lab': 'arcane', 'stone.brick': 'lava', 'stone.terra': 'infernal', 'stone.bright': 'tomb' };
    return byWall[wallT] || 'damp';
  }

  /* ---------------- the WebGL side ---------------- */
  function supported() {
    try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2')); } catch (e) { return false; }
  }

  function create(canvas, opts) {
    opts = opts || {};
    var M = root.MSDDMat;
    if (!M) return null;
    var gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    var lost = false;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; });

    var VS = '#version 300 es\nin vec3 aPos; in vec2 aUv; in vec3 aNrm; uniform mat4 uVP, uModel; out vec3 vPos; out vec2 vUv; out vec3 vNrm;\n' +
      'void main(){ vec4 w = uModel * vec4(aPos, 1.0); vPos = w.xyz; vUv = aUv; vNrm = mat3(uModel) * aNrm; gl_Position = uVP * w; }';
    var POST = 'vec3 finish(vec3 c, vec3 eye, vec3 fogC, float fogK){ float fd = length(vPos - eye); float f = 1.0 - exp(-pow(fd * fogK, 2.0));\n' +
      '  c = mix(c, fogC, clamp(f, 0.0, 1.0)); c = c / (1.0 + c); return pow(c * 2.2, vec3(1.0 / 2.2)); }\n';
    var COMMON = 'uniform vec3 uEye, uTorch, uFogC; uniform float uTorchI, uFog; uniform vec4 uLamps[6]; uniform int uNL;\n';
    var FS = '#version 300 es\nprecision highp float; precision highp int;\nin vec3 vPos; in vec2 vUv; in vec3 vNrm; out vec4 o;\n' + COMMON + M.SHADOW + '\n' + M.COVER + '\n' + POST +
      'void main(){ vec3 c = shadeStone(uEye, uTorch, uTorchI, uLamps, uNL); o = vec4(finish(c, uEye, uFogC, uFog), 1.0); }';
    var FS2 = '#version 300 es\nprecision highp float; precision highp int;\nin vec3 vPos; in vec2 vUv; in vec3 vNrm; out vec4 o;\n' + COMMON +
      'uniform sampler2D uTex; uniform vec3 uTorchC, uAmbC, uEmit, uTint, uLampC; uniform float uAlpha, uSpec, uOpacity;\n' + M.SHADOW + '\n' + POST +
      'void main(){ vec4 t = texture(uTex, vUv); if (uAlpha > 0.0 && t.a < uAlpha) discard;\n' +
      '  vec3 b = pow(t.rgb, vec3(2.2)) * uTint; vec3 L = uTorch - vPos; float d = length(L); L /= d;\n' +
      '  float att = uTorchI / (1.0 + 0.6 * d + 2.2 * d * d); vec3 N = normalize(vNrm); if (!gl_FrontFacing) N = -N;\n' +
      '  vec3 V = normalize(uEye - vPos); float nl = max(dot(N, L), 0.0); float sh = shadowT(vPos, N);\n' +
      '  vec3 lit = uAmbC * 2.0 + uTorchC * (0.25 + 0.75 * nl) * att * sh; vec3 sp = uTorchC * pow(max(dot(N, normalize(L + V)), 0.0), 40.0) * uSpec * att * nl * sh;\n' +
      '  for (int i = 0; i < 6; i++){ if (i >= uNL) break; vec3 Lw = uLamps[i].xyz - vPos; float dw = length(Lw); lit += uLampC * max(dot(N, Lw / dw), 0.0) * uLamps[i].w / (1.0 + 1.2 * dw + 3.0 * dw * dw) * shadowL(i, vPos, N); }\n' +
      '  vec3 c = b * lit + sp + uEmit;\n' +
      '  o = vec4(finish(c, uEye, uFogC, uFog), (uAlpha > 0.0 ? t.a : 1.0) * uOpacity); }';
    var FS3 = '#version 300 es\nprecision highp float; precision highp int;\nin vec3 vPos; in vec2 vUv; in vec3 vNrm; out vec4 o;\n' + COMMON +
      'uniform sampler2D uTex, uNrm; uniform vec3 uTorchC, uAmbC, uLampC; uniform float uEdge, uGrey;\n' + M.SHADOW + '\n' + POST +
      'void main(){ vec4 t = texture(uTex, vUv); if (t.a < 0.45) discard;\n' +
      '  vec3 F = normalize(vNrm); if (!gl_FrontFacing) F = -F; vec3 U = vec3(0.0, 1.0, 0.0), R = normalize(cross(U, F));\n' +
      '  vec3 nm = texture(uNrm, vUv).xyz * 2.0 - 1.0; vec3 N = normalize(R * nm.x + U * nm.y + F * max(nm.z, 0.2));\n' +
      '  if (uEdge > 0.5) N = normalize(R * sign(dot(R, uEye - vPos)) + F * 0.2);\n' +
      '  vec3 base = uEdge > 0.5 ? vec3(0.035, 0.028, 0.022) : pow(t.rgb, vec3(2.2)); if (uGrey > 0.5) base = vec3(dot(base, vec3(0.3, 0.59, 0.11))) * vec3(0.9, 0.92, 0.95);\n' +
      '  vec3 V = normalize(uEye - vPos), L = uTorch - vPos; float d = length(L); L /= d; float sl = sign(dot(F, L));\n' +
      '  float att = uTorchI / (1.0 + 0.6 * d + 2.2 * d * d), sh = shadowT(vPos + F * sl * 0.03, F * sl);\n' +
      '  float wrap = max((dot(N, L) + 0.3) / 1.3, 0.0);\n' +
      '  vec3 lit = uAmbC * 2.5 + uTorchC * wrap * att * sh; vec3 sp = uTorchC * pow(max(dot(N, normalize(L + V)), 0.0), 30.0) * 0.25 * att * sh;\n' +
      '  for (int i = 0; i < 6; i++){ if (i >= uNL) break; vec3 Lw = uLamps[i].xyz - vPos; float dw = length(Lw); Lw /= dw; float sw = sign(dot(F, Lw));\n' +
      '    float aw = uLamps[i].w / (1.0 + 1.2 * dw + 3.0 * dw * dw) * shadowL(i, vPos + F * sw * 0.03, F * sw);\n' +
      '    lit += uLampC * max((dot(N, Lw) + 0.3) / 1.3, 0.0) * aw; sp += uLampC * pow(1.0 - max(dot(N, V), 0.0), 3.0) * aw * 0.8; }\n' +
      '  o = vec4(finish(base * lit + sp, uEye, uFogC, uFog), 1.0); }';
    var PVS = '#version 300 es\nin vec4 aSeed; uniform mat4 uVP; uniform vec3 uEye; uniform float uTime, uSize; uniform int uKind; out float vA; out float vF;\n' +
      'void main(){ vec4 s = aSeed; float t = uTime; vec3 box = vec3(5.0, 1.0, 5.0); vec3 p; vec3 o = s.xyz * box; float sp = 0.5 + s.w;\n' +
      '  if (uKind == 1){ o.y = fract(s.y + t * 0.07 * sp); o.x += sin(t * 0.9 + s.w * 30.0) * 0.08; o.z += cos(t * 0.7 + s.x * 20.0) * 0.08; }\n' +
      '  else if (uKind == 2){ o.y = fract(s.y + t * 0.025 * sp); o.x += sin(t * 0.4 + s.w * 20.0) * 0.15; o.z += cos(t * 0.3 + s.x * 9.0) * 0.15; }\n' +
      '  else if (uKind == 3){ o.y = 1.0 - fract(s.y + t * 0.05 * sp); o.x += sin(t * 0.8 + s.w * 30.0) * 0.1; }\n' +
      '  else if (uKind == 4){ o.y = s.y; o.x += sin(t * 0.5 + s.w * 9.0) * 0.05; }\n' +
      '  else if (uKind == 5){ o.y = 1.0 - fract(s.y + t * 0.6 * sp); }\n' +
      '  else if (uKind == 6){ o.y = 1.0 - fract(s.y + t * 0.035 * sp); o.x += sin(t * 1.2 + s.w * 30.0) * 0.12; o.z += cos(t * 0.9 + s.w * 11.0) * 0.12; }\n' +
      '  else { o.x += sin(t * 0.15 + s.w * 40.0) * 0.2; o.y = fract(s.y + sin(t * 0.1 + s.x * 9.0) * 0.05); o.z += cos(t * 0.12 + s.z * 30.0) * 0.2; }\n' +
      '  vec3 c0 = uEye - vec3(box.x * 0.5, 0.0, box.z * 0.5); p = vec3(c0.x + mod(o.x - c0.x, box.x), o.y * box.y, c0.z + mod(o.z - c0.z, box.z));\n' +
      '  gl_Position = uVP * vec4(p, 1.0); float d = max(length(p - uEye), 0.2);\n' +
      '  gl_PointSize = min(uSize * (0.6 + 0.8 * s.w) / d, uSize * 0.35); vA = smoothstep(4.0, 1.0, d) * smoothstep(0.15, 0.4, d);\n' +
      '  vF = uKind == 4 ? pow(0.5 + 0.5 * sin(t * 5.0 + s.w * 60.0), 6.0) : (uKind == 1 ? 0.6 + 0.4 * sin(t * 9.0 + s.x * 50.0) : 1.0); }';
    var PFS = '#version 300 es\nprecision highp float; precision highp int;\nin float vA; in float vF; uniform vec3 uCol; uniform float uGlowP; uniform int uKind; out vec4 o;\n' +
      'void main(){ vec2 q = gl_PointCoord - 0.5; if (uKind == 5) q.x *= 3.0; float a = smoothstep(0.5, 0.15, length(q)) * vA * vF;\n' +
      '  if (a < 0.01) discard; o = vec4(uCol * (uGlowP > 0.5 ? 1.6 : 0.7), a * (uGlowP > 0.5 ? 1.0 : 0.55)); }';
    var SVS = VS;

    function compile(vs, fs, attrs) {
      var sh = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      (attrs || ['aPos', 'aUv', 'aNrm']).forEach(function (a, i) { gl.bindAttribLocation(p, i, a); }); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var U = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i), nm = info.name.replace(/\[0\]$/, ''); U[nm] = gl.getUniformLocation(p, info.name); }
      return { p: p, U: U };
    }
    var S, F2, MS, SH, PP;
    try {
      S = compile(VS, FS); F2 = compile(VS, FS2); MS = compile(VS, FS3); SH = compile(SVS, M.SHADOW_FS); PP = compile(PVS, PFS, ['aSeed']);
    } catch (e) { if (root.console) console.warn('3D view off:', e.message); return null; }
    var IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    function Mesh(geo) { this.vao = gl.createVertexArray(); this.buf = gl.createBuffer(); this.n = 0; if (geo) this.set(geo); }
    Mesh.prototype.set = function (geo) {
      this.n = geo.count(); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.v), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 20);
      gl.bindVertexArray(null); return this;
    };
    Mesh.prototype.draw = function () { if (!this.n) return; gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, this.n); };
    Mesh.prototype.free = function () { gl.deleteVertexArray(this.vao); gl.deleteBuffer(this.buf); };

    function texFrom(c, clamp) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (clamp) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
      return t;
    }
    function flatTex(r, g, b) { var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, 255])); return t; }
    var whiteTex = flatTex(255, 255, 255);
    var mk = function (w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return texFrom(c); };
    var webTex = mk(256, 256, function (g) {
      g.strokeStyle = 'rgba(235,235,230,0.85)'; g.lineWidth = 1.4;
      for (var i = 0; i <= 8; i++) { var a = i / 8 * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 256, Math.sin(a) * 256); g.stroke(); }
      for (var r = 30; r < 256; r += 30) { g.beginPath(); for (var k = 0; k <= 8; k++) { var a2 = k / 8 * Math.PI / 2, rr = r * (0.92 + 0.08 * Math.sin(k * 3.1 + r));
        if (k === 0) g.moveTo(Math.cos(a2) * rr, Math.sin(a2) * rr); else g.quadraticCurveTo(Math.cos(a2 - Math.PI / 16) * rr * 0.9, Math.sin(a2 - Math.PI / 16) * rr * 0.9, Math.cos(a2) * rr, Math.sin(a2) * rr); } g.stroke(); }
    });
    var writTex = mk(512, 256, function (g) {
      g.strokeStyle = 'rgba(230,226,210,0.8)'; g.lineWidth = 5; g.lineCap = 'round';
      var a = 7, rnd = function () { a = (a * 16807) % 2147483647; return a / 2147483647; };
      for (var line = 0; line < 3; line++) for (var k = 0; k < 9; k++) {
        var x = 30 + k * 50 + rnd() * 8, y = 40 + line * 75 + rnd() * 6; g.beginPath(); g.moveTo(x, y);
        for (var st = 0; st < 3; st++) g.lineTo(x + (rnd() - 0.3) * 34, y + rnd() * 46); g.stroke();
      }
    });
    var mistTex = mk(128, 128, function (g) {
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(200,198,190,0.55)'); gr.addColorStop(1, 'rgba(200,198,190,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });

    /* paper minis: the drawing, a relief made from it, cached per figure */
    var miniCache = {};
    function reliefOf(c) {
      var w = c.width, h = c.height, g = c.getContext('2d'), px = g.getImageData(0, 0, w, h).data, A = new Float32Array(w * h), B = new Float32Array(w * h);
      for (var i = 0; i < w * h; i++) A[i] = px[i * 4 + 3] / 255;
      var blur = function (src, dst, r) {
        var y, x, acc;
        for (y = 0; y < h; y++) { acc = 0; for (x = -r; x < w + r; x++) { if (x + r < w) acc += src[y * w + x + r]; if (x - r - 1 >= 0) acc -= src[y * w + x - r - 1]; if (x >= 0 && x < w) dst[y * w + x] = acc / (2 * r + 1); } }
        var col = new Float32Array(h);
        for (x = 0; x < w; x++) { acc = 0; for (y = -r; y < h + r; y++) { if (y + r < h) acc += dst[(y + r) * w + x]; if (y - r - 1 >= 0) acc -= dst[(y - r - 1) * w + x]; if (y >= 0 && y < h) col[y] = acc / (2 * r + 1); } for (y = 0; y < h; y++) dst[y * w + x] = col[y]; }
      };
      blur(A, B, 7); blur(B, A, 5);
      var out = g.createImageData(w, h), o = out.data;
      var Hf = function (xx, yy) { xx = Math.max(0, Math.min(w - 1, xx)); yy = Math.max(0, Math.min(h - 1, yy)); var j = yy * w + xx; return A[j] + (px[j * 4] * 0.3 + px[j * 4 + 1] * 0.59 + px[j * 4 + 2] * 0.11) / 255 * 0.08; };
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i2 = y * w + x, nx = (Hf(x - 1, y) - Hf(x + 1, y)) * 6, ny = (Hf(x, y + 1) - Hf(x, y - 1)) * 6, ln = Math.hypot(nx, ny, 1);
        o[i2 * 4] = (nx / ln * 0.5 + 0.5) * 255; o[i2 * 4 + 1] = (ny / ln * 0.5 + 0.5) * 255; o[i2 * 4 + 2] = (1 / ln * 0.5 + 0.5) * 255; o[i2 * 4 + 3] = 255;
      }
      var cc = document.createElement('canvas'); cc.width = w; cc.height = h; cc.getContext('2d').putImageData(out, 0, 0); return cc;
    }
    function miniFor(fig, faction, tall) {
      var id = fig + '|' + faction + '|' + tall;
      if (miniCache[id] !== undefined) return miniCache[id];
      var MM = opts.minis || root.MitzMinis, spr = null;
      try { if (MM && MM.has(fig)) spr = MM.sprite(fig, 256, { faction: faction, view: 'front' }); } catch (e) { spr = null; }
      if (!spr || !spr.canvas) return (miniCache[id] = null);
      var c = spr.canvas, tier = 256, wU = c.width / tier, hU = c.height / tier, s = tall * H / hU, BASE = 0.025, T = 0.022;
      var w = wU * s, hh = hU * s, left = spr.ox / tier * s, top = (spr.oy / tier + (spr.foot || 0)) * s + BASE;
      var P = function (u, v, k) { return [-left + u * w, top - hh + (1 - v) * hh, k]; };
      var front = new Geo(), back = new Geo(), edge = new Geo(), base = new Geo();
      front.quad(P(0, 1, T / 2), P(1, 1, T / 2), P(1, 0, T / 2), P(0, 0, T / 2), [0, 0, 1], [0, 1, 1, 1, 1, 0, 0, 0]);
      back.quad(P(1, 1, -T / 2), P(0, 1, -T / 2), P(0, 0, -T / 2), P(1, 0, -T / 2), [0, 0, -1], [1, 1, 0, 1, 0, 0, 1, 0]);
      for (var k = 1; k < 7; k++) { var kk = -T / 2 + T * k / 7; edge.quad(P(0, 1, kk), P(1, 1, kk), P(1, 0, kk), P(0, 0, kk), [0, 0, 1], [0, 1, 1, 1, 1, 0, 0, 0]); }
      base.lathe(0, 0, 0, [[0, 0], [0.13, 0], [0.13, BASE * 0.6], [0.12, BASE], [0, BASE]], 24);
      return (miniCache[id] = { tex: texFrom(c, true), nrm: texFrom(reliefOf(c), true), front: new Mesh(front), back: new Mesh(back), edge: new Mesh(edge), base: new Mesh(base) });
    }

    /* ---- shadows: the torch every time it moves; the two nearest wall lamps once ---- */
    var SHF = 6.0, SHS = 256, shFb = gl.createFramebuffer(), shDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, shDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, SHS, SHS);
    function makeCube() {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
      for (var f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA8, SHS, SHS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (k) { gl.texParameteri(gl.TEXTURE_CUBE_MAP, k, gl.NEAREST); });
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R].forEach(function (k) { gl.texParameteri(gl.TEXTURE_CUBE_MAP, k, gl.CLAMP_TO_EDGE); });
      return t;
    }
    var torchCube = makeCube(), torchAt = null, lampShadow = {};
    function persp(fov, asp, n, f) { var t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
    function mul(a, b) { var o = new Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
    function lookAt(e, c, u) {
      var z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]], zl = Math.hypot(z[0], z[1], z[2]); z = z.map(function (v) { return v / zl; });
      var x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]], xl = Math.hypot(x[0], x[1], x[2]); x = x.map(function (v) { return v / xl; });
      var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
    }
    function T4(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
    function RY4(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
    function RX4(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; }
    var LID_OPEN = 1.9;
    function lidModel(l, ang) { return new Float32Array(mul(mul(T4(l.x, 0.2, l.z), RY4(l.ry)), mul(T4(0, 0, -0.125), RX4(ang)))); }
    var lidMesh = (function () { var g = new Geo(); g.box(0, 0.025, 0.125, 0.37, 0.05, 0.25); return g; })();
    var lidBand = (function () { var g = new Geo(); [-0.12, 0.12].forEach(function (o) { g.box(o, 0.028, 0.125, 0.025, 0.056, 0.255); }); return g; })();
    var coinGeo = (function () { var g = new Geo(); g.lathe(0, -0.004, 0, [[0, 0], [0.024, 0], [0.024, 0.008], [0, 0.008]], 12); return g; })();
    function modelOf(m) { var c = Math.cos(m.yaw), s = Math.sin(m.yaw); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, m.x, 0, m.z, 1]); }
    var CUBE_DIRS = [[[1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]], [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]], [[0, 0, 1], [0, -1, 0]], [[0, 0, -1], [0, -1, 0]]];
    var CASTERS = ['wall', 'iron', 'prop', 'wood', 'bone', 'clay', 'chain', 'stem', 'cap', 'crystal'];
    function renderCube(cube, lp) {
      var proj = persp(Math.PI / 2, 1, 0.02, SHF);
      gl.useProgram(SH.p); gl.uniform3fv(SH.U.uLight, lp); gl.uniform1f(SH.U.uFar, SHF); gl.uniform1i(SH.U.uTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shFb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shDepth);
      gl.viewport(0, 0, SHS, SHS); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      for (var f = 0; f < 6; f++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, cube, 0);
        gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        var d = CUBE_DIRS[f];
        gl.uniformMatrix4fv(SH.U.uVP, false, new Float32Array(mul(proj, lookAt(lp, [lp[0] + d[0][0], lp[1] + d[0][1], lp[2] + d[0][2]], d[1]))));
        gl.uniformMatrix4fv(SH.U.uModel, false, IDENT); gl.uniform1f(SH.U.uAlpha, 0);
        CASTERS.forEach(function (n) { if (meshes[n]) meshes[n].draw(); });
        doorMeshes.forEach(function (dm) { dm.mesh.draw(); });
        stairMeshes.forEach(function (dm) { dm.mesh.draw(); });
        gl.uniform1f(SH.U.uAlpha, 0.45); gl.activeTexture(gl.TEXTURE0);
        figures.forEach(function (m) { if (!m.mini) return; gl.uniformMatrix4fv(SH.U.uModel, false, modelOf(m)); gl.bindTexture(gl.TEXTURE_2D, m.mini.tex); m.mini.front.draw(); });
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null);
    }
    function shadowUniforms(U, torch, near, on) {
      gl.uniform1f(U.uShOn, on ? 1 : 0); gl.uniform1f(U.uShFar, SHF); gl.uniform3fv(U.uShTP, torch);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_CUBE_MAP, torchCube); gl.uniform1i(U.uShT, 2);
      [0, 1].forEach(function (i) {
        var n = near[i], c = n && lampShadow[n.id];
        gl.activeTexture(gl.TEXTURE3 + i); gl.bindTexture(gl.TEXTURE_CUBE_MAP, c ? c.cube : torchCube); gl.uniform1i(U['uSh' + i], 3 + i);
        gl.uniform3fv(U['uShP' + i], c ? c.p : [0, -9, 0]); gl.uniform1f(U['uShL' + i], c ? 1 : 0);
      });
      gl.activeTexture(gl.TEXTURE0);
    }

    /* particles */
    var NP = 420, pVao = gl.createVertexArray(), pBuf = gl.createBuffer(), seeds = new Float32Array(NP * 4);
    for (var i = 0; i < NP * 4; i++) seeds[i] = Math.random();
    gl.bindVertexArray(pVao); gl.bindBuffer(gl.ARRAY_BUFFER, pBuf); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    var PKIND = { dust: [0, 18, 0, 140], embers: [1, 26, 1, 200], spores: [2, 30, 1, 160], snow: [3, 24, 0, 260], sparks: [4, 26, 1, 140], drip: [5, 22, 0, 100], leaves: [6, 40, 0, 60] };

    /* ---- the floor, as built ---- */
    var baker = new M.Baker(gl, opts.atlasImg || null, opts.atlasIndex || {});
    var lidM = null, bandM = null, coinM = null;
    var F = null, zoneKey = 'damp', Z = M.ZONES.damp, hooks = {}, meshes = {}, doorMeshes = [], stairMeshes = [], figures = [], lamps = [], lids = [], fixtures = [], mats = {}, sig = '', shadowStale = true;
    function lin(h, k) { return M.hex(h).map(function (v) { return Math.pow(v, 2.2) * (k || 1); }); }
    function scale(hexc, k) { return '#' + M.hex(hexc).map(function (v) { var n = Math.round(Math.min(1, v * k) * 255); return (n < 16 ? '0' : '') + n.toString(16); }).join(''); }

    function rebuild() {
      if (!F) return;
      var P = plan(F, Z, hooks);
      Object.keys(meshes).forEach(function (k) { meshes[k].free(); }); meshes = {};
      doorMeshes.forEach(function (d) { d.mesh.free(); }); doorMeshes = [];
      // alcove contents
      P.fixtures.forEach(function (f) { if (f.kind === 'skull') skull(P.geo.bone, f.at[0], f.at[1], f.at[2], 0.4); else urn(P.geo.clay, f.at[0], f.at[1], f.at[2]); });
      GEO_NAMES.forEach(function (n) { if (P.geo[n].count()) meshes[n] = new Mesh(P.geo[n]); });
      doorMeshes = P.doors.map(function (d) { return { key: d.key, secret: d.secret, mesh: new Mesh(d.geo) }; });
      stairMeshes.forEach(function (d) { d.mesh.free(); });
      stairMeshes = P.stairs.map(function (d) { return { key: d.key, mesh: new Mesh(d.geo) }; });
      var old = {}; figures.forEach(function (m) { old[m.key + '|' + m.fig] = m.yaw; });
      figures = P.minis.map(function (m) { return { fig: m.fig, x: m.x, z: m.z, key: m.key, grey: m.grey, mini: miniFor(m.fig, m.faction, m.tall), yaw: old[m.key + '|' + m.fig] }; });
      lamps = P.lamps; lids = P.lids; shadowStale = true; torchAt = null;
      if (!lidM) { lidM = new Mesh(lidMesh); bandM = new Mesh(lidBand); coinM = new Mesh(coinGeo); }
      Object.keys(lampShadow).forEach(function (k) { lampShadow[k].stale = true; });
    }
    function rebake() {
      var floorCols = Z.stone.map(function (c) { return scale(c, Z.floorTone || 1); });
      var seed = (F && F.id ? F.id.split('').reduce(function (a, ch) { return (a * 31 + ch.charCodeAt(0)) % 9973; }, 7) : 1);
      mats.wall = baker.get(Z.wall, Z.stone, seed); mats.floor = baker.get(Z.floor, floorCols, seed + 11);
      mats.ceil = baker.get(Z.ceil, Z.stone, seed + 23); mats.prop = baker.get(Z.prop || 'rubble', Z.stone, seed + 41);
      mats.wood = baker.get('boards', Z.stone, seed + 43); mats.door = baker.get(Z.door, Z.stone, seed + 31);
      mats.secret = mats.wall;
    }

    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var api = {
      ok: true, gl: gl,
      setFloor: function (floorDef, zone, h) {
        F = floorDef; hooks = h || {}; zoneKey = M.ZONES[zone] ? zone : 'damp'; Z = M.ZONES[zoneKey];
        lampShadow = {};
        rebake(); rebuild(); sig = hooks.signature ? hooks.signature() : '';
      },
      zone: function () { return zoneKey; },
      refresh: function (force) {
        var s = hooks.signature ? hooks.signature() : '';
        if (force || s !== sig) { sig = s; rebuild(); return true; }
        return false;
      },
      stats: function () { var n = 0; Object.keys(meshes).forEach(function (k) { n += meshes[k].n; }); return { tris: n / 3, lamps: lamps.length, minis: figures.length, doors: doorMeshes.length, zone: zoneKey }; },
      lost: function () { return lost; },
      render: function (cam) {
        if (lost || !F) return;
        var dpr = Math.max(0.3, Math.min(cam.dpr || 1, 2)), W = Math.max(1, Math.round(canvas.clientWidth * dpr)), Hc = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== W || canvas.height !== Hc) { canvas.width = W; canvas.height = Hc; }
        var s = cam.time != null ? cam.time : ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) / 1000;
        var calm = !!cam.reduceMotion;
        var flick = calm ? 1 : 1 + 0.07 * Math.sin(s * 7.3) + 0.04 * Math.sin(s * 12.9 + 1.7) + 0.02 * Math.sin(s * 23.1);
        var fx = Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), back = 0.30 - (cam.nudge || 0);
        var ex = cam.x - fx * back, ey = 0.47 - (cam.bob || 0), ez = cam.z - fz * back;
        var pc = Math.cos(cam.pitch || 0), ps = Math.sin(cam.pitch || 0);           // looking down, at a chest being opened
        var VP = new Float32Array(mul(persp((cam.fov || 62) * Math.PI / 180, W / Hc, 0.04, 30), mul([1, 0, 0, 0, 0, pc, ps, 0, 0, -ps, pc, 0, 0, 0, 0, 1], mul([Math.cos(cam.yaw), 0, -Math.sin(cam.yaw), 0, 0, 1, 0, 0, Math.sin(cam.yaw), 0, Math.cos(cam.yaw), 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -ex, -ey, -ez, 1]))));
        var loot = cam.loot || null, lootE = 0, lootLid = null;
        if (loot) { lootE = 1 - Math.pow(1 - Math.min(1, Math.max(0, (loot.p - 0.12) / 0.4)), 3); lootLid = lids.filter(function (l) { return l.key === loot.key; })[0] || null; }
        var rx = Math.cos(cam.yaw), rz = Math.sin(cam.yaw), torch = [ex + fx * 0.15 + rx * 0.14, ey - 0.08, ez + fz * 0.15 + rz * 0.14];
        // sight: how far the light reaches decides how bright the torch is and how thick the dark
        var sight = cam.sight != null ? cam.sight : 3, reach = Math.max(0.8, Math.min(6, sight));
        var torchI = 2.4 * flick * Math.max(0.55, Math.min(1.5, reach / 3)), fogK = 0.24 * 3 / reach;
        var near = lamps.map(function (p, id) { return { p: p, id: id, d: (p[0] - ex) * (p[0] - ex) + (p[2] - ez) * (p[2] - ez) }; })
                        .filter(function (n) { return n.d < 36; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 6);
        var shadows = cam.shadows !== false;
        // minis turn to face the party, gently
        figures.forEach(function (m) {
          var want = Math.atan2(cam.px - m.x, cam.pz - m.z);
          if (m.yaw == null || calm) m.yaw = want;
          else { var dlt = ((want - m.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; m.yaw += dlt * Math.min(1, (cam.dt || 0.016) * 6); if (Math.abs(dlt) > 0.002) shadowStale = true; }
        });
        if (shadows) {
          near.slice(0, 2).forEach(function (n) {
            var c = lampShadow[n.id];
            if (!c) { var ids = Object.keys(lampShadow); if (ids.length >= 6) { var old = ids.filter(function (k) { return near.slice(0, 2).every(function (q) { return q.id != k; }); })[0]; c = lampShadow[old]; delete lampShadow[old]; } else c = { cube: makeCube() }; c.stale = true; lampShadow[n.id] = c; }
            if (c.stale) { c.p = n.p; renderCube(c.cube, n.p); c.stale = false; }
          });
          var moved = !torchAt || Math.abs(torchAt[0] - torch[0]) + Math.abs(torchAt[1] - torch[1]) + Math.abs(torchAt[2] - torch[2]) > 0.002;
          if (moved || shadowStale) { renderCube(torchCube, torch); torchAt = torch; shadowStale = false; }
        }
        if (lootLid && loot.kind !== 'mimic' && lootE > 0) near = [{ p: [lootLid.x, 0.32, lootLid.z], id: -1, glow: lootE }].concat(near).slice(0, 6);
        var L = new Float32Array(24);
        near.forEach(function (n, i) { L[i * 4] = n.p[0]; L[i * 4 + 1] = n.p[1]; L[i * 4 + 2] = n.p[2]; L[i * 4 + 3] = n.glow != null ? 0.9 * n.glow : 0.6 * (calm ? 1 : 1 + 0.1 * Math.sin(s * (6 + i) + i)); });
        var fogC = lin(Z.fog), WT = M.WATERS[Z.water && Z.water !== 'none' ? Z.water : 'clear'];

        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, Hc);
        gl.clearColor(fogC[0], fogC[1], fogC[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
        var common = function (U) {
          gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniformMatrix4fv(U.uModel, false, IDENT);
          gl.uniform3f(U.uEye, ex, ey, ez); gl.uniform3fv(U.uTorch, torch); gl.uniform1f(U.uTorchI, torchI); gl.uniform1f(U.uFog, fogK); gl.uniform3fv(U.uFogC, fogC);
          gl.uniform4fv(U.uLamps, L); gl.uniform1i(U.uNL, near.length); shadowUniforms(U, torch, near, shadows);
          if (U.uTorchC) gl.uniform3fv(U.uTorchC, lin(Z.torch)); if (U.uLampC) gl.uniform3fv(U.uLampC, lin(Z.lamp)); if (U.uAmbC) gl.uniform3fv(U.uAmbC, lin(Z.amb, 1.6));
        };
        var P = S.U; gl.useProgram(S.p); common(P);
        gl.uniform1i(P.uStyle, Z.cover.style); gl.uniform3fv(P.uCovA, lin(Z.cover.a)); gl.uniform3fv(P.uCovB, lin(Z.cover.b));
        gl.uniform3fv(P.uEmitC, lin(Z.cover.emit)); gl.uniform1f(P.uAmt, Z.cover.amt); gl.uniform1f(P.uWet, Z.wet); gl.uniform1f(P.uTime, calm ? 0 : s);
        gl.uniform3fv(P.uGlowC, lin(Z.glow, 0.9)); gl.uniform1f(P.uGlowUp, Z.glowUp || 0); gl.uniform1f(P.uRunes, 0);
        gl.uniform1f(P.uWater, 0); gl.uniform1f(P.uWaterMurk, WT.murk); gl.uniform3fv(P.uWaterC, lin(WT.c)); gl.uniform3fv(P.uWaterE, lin(WT.e, 2.0));
        gl.uniform1i(P.uTerr, 0); gl.uniform1i(P.uMat, 0); gl.activeTexture(gl.TEXTURE0);
        var stone = function (name, m, k, surf, uvMode) {
          var mesh = typeof name === 'string' ? meshes[name] : name; if (!mesh || !m) return;
          gl.bindTexture(gl.TEXTURE_2D, m.tex); gl.uniform1f(P.uPeriod, m.period); gl.uniform1i(P.uUvMode, uvMode || 0); gl.uniform1f(P.uSpec, m.spec);
          var tint = m.photo ? lin(Z.stone[1], 1.9) : [1, 1, 1];
          gl.uniform3fv(P.uTintC, tint.map(function (v) { return v * k; })); gl.uniform1i(P.uSurf, surf); mesh.draw();
        };
        stone('wall', mats.wall, 1, 0); stone('floor', mats.floor, 1, 1); stone('ceil', mats.ceil, 0.62, 2); stone('pit', mats.wall, 0.7, 0);
        [['water', 0, 1], ['embers', 2, 0], ['holy', 3, 0], ['antimagic', 4, 0], ['ice', 5, 0], ['rotten', 6, 0]].forEach(function (tq) {
          if (!meshes[tq[0]]) return; gl.uniform1f(P.uWater, tq[2]); gl.uniform1i(P.uTerr, tq[1]); stone(tq[0], mats.floor, 1, 1);
        });
        gl.uniform1f(P.uWater, 0); gl.uniform1i(P.uTerr, 0);
        stone('prop', mats.prop, 0.95, 4); stone('wood', mats.wood, 1, 4);
        var here = cam.px + ',' + cam.pz;
        stairMeshes.forEach(function (d) { if (d.key !== here) stone(d.mesh, mats.floor, 0.9, 4); });   // steps in the floor's own stone
        doorMeshes.forEach(function (d) { gl.uniform1f(P.uRunes, mats.door && mats.door.runes ? 1 : 0); stone(d.mesh, d.secret ? mats.wall : mats.door, 1, 3, d.secret ? 0 : 1); });
        gl.uniform1f(P.uRunes, 0);

        var Q = F2.U; gl.useProgram(F2.p); common(Q); gl.uniform1i(Q.uTex, 0); gl.uniform1f(Q.uOpacity, 1);
        var flat = function (name, col, emit, spec) {
          var mesh = meshes[name]; if (!mesh) return; gl.bindTexture(gl.TEXTURE_2D, whiteTex); gl.uniform1f(Q.uAlpha, 0);
          gl.uniform3fv(Q.uTint, lin(col)); gl.uniform3fv(Q.uEmit, emit || [0, 0, 0]); gl.uniform1f(Q.uSpec, spec || 0); mesh.draw();
        };
        var emitC = Z.cover.emit !== '#000000' ? Z.cover.emit : Z.lamp;
        flat('iron', '#3a3836', null, 0.5); flat('chain', '#3a3836', null, 0.6); flat('recess', '#000000');
        flat('flame', '#000000', lin(Z.lamp, 3.0 * flick));
        flat('bone', '#d9ccad', null, 0.2); flat('clay', '#8a5a3a', null, 0.15); flat('stem', '#d8d0c0');
        flat('cap', '#20302c', lin(emitC, 1.2), 0.3); flat('crystal', '#5a3a8a', lin(emitC, 1.4), 1.0);
        flat('glow', '#000000', lin('#ffc860', 1.6 * flick)); flat('fountain', '#0c2a3a', lin('#3a90c0', 0.5), 1.5);
        // chest lids, swinging up and back for the chest being opened; and its coins
        lids.forEach(function (l) {
          var ang = l.open ? LID_OPEN : 0, shake = 0;
          if (lootLid === l) { ang = (loot.kind === 'mimic' ? 0.9 : LID_OPEN) * lootE; if (loot.kind === 'mimic' && loot.p > 0.3) shake = Math.sin(loot.p * 70) * 0.06; }
          var Mm = lidModel(l, ang + shake);
          gl.uniformMatrix4fv(Q.uModel, false, Mm); gl.bindTexture(gl.TEXTURE_2D, mats.wood ? mats.wood.tex : whiteTex);
          gl.uniform1f(Q.uAlpha, 0); gl.uniform3fv(Q.uTint, lin('#7a5532')); gl.uniform3f(Q.uEmit, 0, 0, 0); gl.uniform1f(Q.uSpec, 0.15); lidM.draw();
          gl.bindTexture(gl.TEXTURE_2D, whiteTex); gl.uniform3fv(Q.uTint, lin('#3a3836')); gl.uniform1f(Q.uSpec, 0.5); bandM.draw();
        });
        if (lootLid && loot.kind !== 'mimic') {
          gl.uniformMatrix4fv(Q.uModel, false, new Float32Array(mul(T4(lootLid.x, 0.205, lootLid.z), RY4(lootLid.ry))));
          gl.bindTexture(gl.TEXTURE_2D, whiteTex); gl.uniform3fv(Q.uTint, lin('#c8962c')); gl.uniform1f(Q.uSpec, 1.6);
          for (var gk = 0; gk < 14; gk++) {                                            // a heap of coins in the chest
            var ga = gk * 2.399, gr = 0.02 + 0.09 * Math.sqrt(gk / 14), gx = Math.cos(ga) * gr, gz = Math.sin(ga) * gr * 0.65;
            gl.uniform3fv(Q.uEmit, lin('#ffb840', (0.25 + 0.35 * Math.max(0, Math.sin(s * 3 + gk * 1.7))) * lootE));
            gl.uniformMatrix4fv(Q.uModel, false, new Float32Array(mul(mul(T4(lootLid.x, 0.206 + 0.014 * (1 - gr / 0.11), lootLid.z), RY4(lootLid.ry)), mul(T4(gx, 0, gz), RX4(0.35 * Math.sin(gk * 3.1))))));
            coinM.draw();
          }
          for (var k = 0; k < (loot.coins || 0); k++) {
            var st = 0.18 + 0.4 * (k / Math.max(1, loot.coins)), q = (loot.p - st) / 0.5; if (q <= 0 || q >= 1) continue;
            var vx = ((k * 37) % 11 - 5) / 5, vz = ((k * 53) % 7 - 3) / 3;
            var up = q < 0.45 ? Math.sin(q / 0.45 * Math.PI * 0.5) * 0.42 : 0.42 - Math.pow((q - 0.45) / 0.55, 2) * 0.2;
            var tow = q < 0.45 ? 0 : Math.pow((q - 0.45) / 0.55, 2);                   // then off toward the party's purse
            var cx2 = lootLid.x + vx * 0.08 * Math.min(1, q / 0.45), cz2 = lootLid.z + vz * 0.05 * Math.min(1, q / 0.45);
            cx2 += (ex - cx2) * tow; cz2 += (ez - cz2) * tow; var cy2 = 0.22 + up - tow * 0.25;
            gl.uniformMatrix4fv(Q.uModel, false, new Float32Array(mul(T4(cx2, cy2, cz2), mul(RY4(q * 9 + k), RX4(q * 14 + k)))));
            gl.uniform3fv(Q.uTint, lin('#e3b040')); gl.uniform3fv(Q.uEmit, lin('#5a3a08')); gl.uniform1f(Q.uSpec, 1.5); coinM.draw();
          }
        }
        if (lootLid && loot.kind === 'mimic' && loot.p > 0.25) {                    // something red, inside, waking
          gl.uniformMatrix4fv(Q.uModel, false, new Float32Array(mul(mul(T4(lootLid.x, 0.21, lootLid.z), RY4(lootLid.ry)), [5.5, 0, 0, 0, 0, 0.2, 0, 0, 0, 0, 3.6, 0, 0, 0, 0, 1])));
          gl.bindTexture(gl.TEXTURE_2D, whiteTex); gl.uniform3fv(Q.uTint, lin('#300404')); gl.uniform1f(Q.uSpec, 1.2); gl.uniform3fv(Q.uEmit, lin('#a01206', (0.6 + 0.4 * Math.sin(s * 9)) * lootE)); coinM.draw();
        }
        gl.uniformMatrix4fv(Q.uModel, false, IDENT);
        // minis
        var MU = MS.U; gl.useProgram(MS.p); common(MU); gl.uniform1i(MU.uTex, 0); gl.uniform1i(MU.uNrm, 1);
        figures.forEach(function (m) {
          if (!m.mini) return; gl.uniformMatrix4fv(MU.uModel, false, modelOf(m)); gl.uniform1f(MU.uGrey, m.grey ? 1 : 0);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, m.mini.nrm); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.mini.tex);
          gl.uniform1f(MU.uEdge, 0); m.mini.front.draw(); m.mini.back.draw();
          gl.disable(gl.CULL_FACE); gl.uniform1f(MU.uEdge, 1); m.mini.edge.draw(); gl.enable(gl.CULL_FACE);
        });
        gl.useProgram(F2.p);
        figures.forEach(function (m) { if (!m.mini) return; gl.uniformMatrix4fv(Q.uModel, false, modelOf(m)); gl.bindTexture(gl.TEXTURE_2D, whiteTex); gl.uniform1f(Q.uAlpha, 0); gl.uniform3fv(Q.uTint, lin('#1d1f1c')); gl.uniform3f(Q.uEmit, 0, 0, 0); gl.uniform1f(Q.uSpec, 0.4); m.mini.base.draw(); });
        gl.uniformMatrix4fv(Q.uModel, false, IDENT);
        // see-through things last
        gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        var sheer = function (name, tex, tint, emit, alphaCut, opac) {
          var mesh = meshes[name]; if (!mesh) return; gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1f(Q.uAlpha, alphaCut);
          gl.uniform3fv(Q.uTint, tint); gl.uniform3fv(Q.uEmit, emit || [0, 0, 0]); gl.uniform1f(Q.uSpec, 0); gl.uniform1f(Q.uOpacity, opac == null ? 1 : opac); mesh.draw();
        };
        sheer('web', webTex, [0.8, 0.8, 0.78], null, 0.05); sheer('writ', writTex, [0.9, 0.9, 0.85], null, 0.05);
        sheer('mist', mistTex, [0.7, 0.7, 0.68], null, 0.01, 0.9);
        sheer('barrier', whiteTex, [0.2, 0.1, 0.4], lin('#a060ff', 0.6 + 0.2 * Math.sin(s * 3)), 0, 0.35);
        gl.uniform1f(Q.uOpacity, 1);
        // the air
        var pk = PKIND[Z.parts && Z.parts.kind] || PKIND.dust;
        if (!calm && cam.particles !== false) {
          gl.useProgram(PP.p); if (pk[2]) gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.uniformMatrix4fv(PP.U.uVP, false, VP); gl.uniform3f(PP.U.uEye, ex, ey, ez); gl.uniform1f(PP.U.uTime, s);
          gl.uniform1f(PP.U.uSize, pk[1] * dpr); gl.uniform1i(PP.U.uKind, pk[0]); gl.uniform3fv(PP.U.uCol, lin(Z.parts.col)); gl.uniform1f(PP.U.uGlowP, pk[2]);
          gl.bindVertexArray(pVao); gl.drawArrays(gl.POINTS, 0, Math.min(NP, pk[3]));
        }
        gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
      }
    };
    return api;
  }

  root.MSDD3D = { supported: supported, create: create, plan: plan, zoneFor: zoneFor, Geo: Geo, GEO_NAMES: GEO_NAMES };
})(typeof window !== 'undefined' ? window : this);

/* Gut Run - simulation core (physics + collision).
 * No DOM access on purpose: the same file is loaded in the browser and by
 * tools/verify_level.js in Node, which proves that the course can be finished.
 * Units: design pixels (720x1280) and seconds.
 */
(function (GR) {
  'use strict';

  var P = GR.PHYS, PL = GR.PLAYER;
  var DT = 1 / 120;                 // fixed simulation step
  var WALL_FORGIVE = 6;             // px the player may overlap the top/bottom wall artwork

  var data = window.GUT_DATA;

  /* ---------- decode hit masks (1 bit per pixel, eroded alpha) ---------- */
  var masks = {};
  Object.keys(data.obstacles).forEach(function (id) {
    var o = data.obstacles[id];
    var bin = typeof atob === 'function' ? atob(o.bits) : Buffer.from(o.bits, 'base64').toString('binary');
    var m = new Uint8Array(o.w * o.h);
    for (var i = 0; i < m.length; i++) m[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
    masks[id] = { w: o.w, h: o.h, m: m };
  });

  var pts = data.player.pts;          // [[x,y], ...] in player-sprite pixels
  var top = data.top, bottom = data.bottom;

  // obstacles with their world rectangles (for the cheap x broad-phase)
  var obstacles = GR.LEVEL.map(function (o) {
    var mk = masks[o.id], s = o.s || 1;
    return { id: o.id, x: o.x, y: o.y, s: s, w: mk.w * s, h: mk.h * s, mask: mk };
  });

  function newRun() {
    return { t: 0, scroll: GR.START_SCROLL, y: PL.y, vy: 0, speed: 0, hit: null };
  }

  function speedAt(t, scroll) {
    var k = Math.min(1, t / GR.SPEED.easeIn);
    k = k * k * (3 - 2 * k);                                  // smoothstep ease-in after the first tap
    var prog = Math.min(1, scroll / GR.MAX_SCROLL);
    return k * (GR.SPEED.base + (GR.SPEED.max - GR.SPEED.base) * prog);
  }

  /** @returns null or a string describing what was hit ("top", "bottom" or an obstacle id) */
  function collide(y, scroll, t) {
    var i, wy, sx;
    for (i = 0; i < pts.length; i++) {
      wy = y + pts[i][1];
      sx = PL.x + pts[i][0];
      if (wy < top[sx] - WALL_FORGIVE) return 'top';
      if (wy > bottom[sx] + WALL_FORGIVE) return 'bottom';
    }
    if (t < GR.GRACE) return null;                              // get-ready moment: obstacles are harmless
    var x0 = scroll + PL.x, x1 = x0 + PL.w;
    for (var k = 0; k < obstacles.length; k++) {
      var ob = obstacles[k];
      if (ob.x > x1 || ob.x + ob.w < x0) continue;           // not next to the player
      if (ob.y > y + PL.h || ob.y + ob.h < y) continue;
      for (i = 0; i < pts.length; i++) {
        var lx = Math.floor((x0 + pts[i][0] - ob.x) / ob.s);
        var ly = Math.floor((y + pts[i][1] - ob.y) / ob.s);
        if (lx >= 0 && ly >= 0 && lx < ob.mask.w && ly < ob.mask.h && ob.mask.m[ly * ob.mask.w + lx]) return ob.id;
      }
    }
    return null;
  }

  /** advance one fixed step. @returns 'ok' | 'crash' | 'win' */
  function step(r, tap) {
    if (tap) r.vy = P.jump;
    r.t += DT;
    r.vy = Math.min(P.maxFall, r.vy + P.gravity * DT);
    r.y += r.vy * DT;
    r.speed = speedAt(r.t, r.scroll);
    r.scroll += r.speed * DT;
    r.hit = collide(r.y, r.scroll, r.t);
    if (r.hit) return 'crash';
    if (r.scroll >= GR.MAX_SCROLL) { r.scroll = GR.MAX_SCROLL; return 'win'; }
    return 'ok';
  }

  GR.Core = { DT: DT, newRun: newRun, step: step, collide: collide, speedAt: speedAt, obstacles: obstacles, masks: masks, pts: pts, top: top, bottom: bottom };
})(window.GR = window.GR || {});

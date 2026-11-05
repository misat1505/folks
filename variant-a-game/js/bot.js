/* Debug autopilot, only loaded with ?bot=1 (never part of the normal ad).
 * Beam search over the next ~0.6 s using the real physics from core.js:
 * it plays like a (good) human and is used by the automated browser tests.
 * ?bot=1&skill=lazy makes it tap late so that crash/fail paths can be tested.
 */
(function (GR) {
  'use strict';
  const C = GR.Core, SUB = 6, DEPTH = 12, BEAM = 36, MIN_GAP = 3;
  const params = new URLSearchParams(location.search);
  let cd = 0, sub = 0;

  const clone = (r) => ({ t: r.t, scroll: r.scroll, y: r.y, vy: r.vy, speed: r.speed, hit: null });

  function search(run0, cd0) {
    let layer = [{ r: clone(run0), first: -1, cd: cd0 }];
    for (let d = 0; d < DEPTH; d++) {
      const next = [];
      for (const s of layer) {
        for (const tap of [0, 1]) {
          if (tap && s.cd > 0) continue;
          const n = clone(s.r); let res = 'ok';
          for (let i = 0; i < SUB && res === 'ok'; i++) res = C.step(n, tap && i === 0);
          if (res === 'crash') continue;
          next.push({ r: n, first: s.first < 0 ? tap : s.first, cd: tap ? MIN_GAP - 1 : Math.max(0, s.cd - 1) });
        }
      }
      if (!next.length) return 0;
      next.sort((a, b) => Math.abs(a.r.y - 760) - Math.abs(b.r.y - 760));   // prefer the middle of the gut
      layer = next.slice(0, BEAM);
    }
    return layer[0].first;
  }

  GR.Bot = {
    // called once per 1/120 s simulation step; decides every 50 ms
    decide(run) {
      if (sub++ % SUB !== 0) return false;
      if (cd > 0) cd--;
      if (params.get('skill') === 'lazy') return false;
      const tap = search(run, cd);
      if (tap) cd = MIN_GAP;
      return !!tap;
    }
  };
})(window.GR = window.GR || {});

#!/usr/bin/env node
/* Proves that the Gut Run course can be finished, and how forgiving it is.
 *
 * Breadth-first search over every possible tap sequence. A decision is made every
 * 50 ms and two taps must be >= MIN_GAP apart (humans cannot tap faster than ~6-7/s),
 * states are merged on a coarse (y, vy, cooldown) grid. For every 50 ms tick it reports
 * how many distinct states are still alive: a large number = a wide "corridor".
 *
 *   node tools/verify_level.js [minGapSeconds]       (default 0.17)
 */
'use strict';
const path = require('path');
global.window = global;
const J = (f) => require(path.join(__dirname, '..', 'variant-a-game', 'js', f));
J('hitmasks.js'); J('level.js'); J('core.js');
const GR = global.GR, C = GR.Core;

const MIN_GAP = Math.round((parseFloat(process.argv[2]) || 0.17) / 0.05);
const SUB = Math.round(0.05 / C.DT);                  // 6 sim steps per decision

const clone = (r) => ({ t: r.t, scroll: r.scroll, y: r.y, vy: r.vy, speed: r.speed, hit: null });
const key = (r, cd) => Math.round(r.y / 5) + ':' + Math.round(r.vy / 60) + ':' + cd;

let layer = new Map();
const r0 = C.newRun();
layer.set(key(r0, 0), { r: r0, cd: 0 });
let tick = 0, won = null;
const widths = [];
const deaths = {};

while (layer.size && !won && tick < 900) {
  const next = new Map();
  for (const { r, cd } of layer.values()) {
    for (const tap of [0, 1]) {
      if (tap && cd > 0) continue;
      const n = clone(r);
      let res = 'ok';
      for (let i = 0; i < SUB && res === 'ok'; i++) res = C.step(n, tap && i === 0);
      if (res === 'win') { won = { tick: tick + 1, t: n.t }; break; }
      if (res === 'crash') { deaths[n.hit] = (deaths[n.hit] || 0) + 1; continue; }
      const ncd = tap ? MIN_GAP - 1 : Math.max(0, cd - 1);
      const k = key(n, ncd);
      if (!next.has(k)) next.set(k, { r: n, cd: ncd });
    }
    if (won) break;
  }
  layer = next; tick++;
  widths.push({ tick, scroll: Math.round([...layer.values()][0] ? [...layer.values()][0].r.scroll : 0), alive: layer.size });
}

console.log(won ? `COMPLETABLE: finish after ${won.t.toFixed(1)} s (min tap gap ${(MIN_GAP * 0.05).toFixed(2)} s)` : 'NOT COMPLETABLE - the course is too hard / blocked');
// narrowest points of the corridor
const sorted = widths.filter((w) => w.tick > 24).sort((a, b) => a.alive - b.alive).slice(0, 8);
console.log('narrowest points (scroll px -> alive states):', sorted.map((w) => `${w.scroll}:${w.alive}`).join('  '));
const worst = Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log('most common killers in the search:', worst.map(([k, v]) => `${k}=${v}`).join('  '));

/* ---- Monte-Carlo "human" model -------------------------------------------------------------
 * No look-ahead search: a player looks ~420 px ahead, aims at the middle of the biggest free gap
 * between the obstacles there, and taps when below that line. Reaction time is random
 * (80-260 ms) and every tap is jittered (+-40 ms). Reports the share of runs that finish.
 */
function humanRun(rng) {
  const r = C.newRun();
  const react = 0.08 + rng() * 0.18;
  let queue = [0], cd = 0, step = 0;           // the tap that starts the run is the first hop
  const FLOOR = 1120, CEIL = 485, PH = 70;
  function target() {
    const x0 = r.scroll + GR.PLAYER.x - 20, x1 = x0 + 420;
    const blocks = [];
    for (const o of C.obstacles) if (o.x < x1 && o.x + o.w > x0) blocks.push([o.y - 6, o.y + o.h + 6]);
    blocks.sort((a, b) => a[0] - b[0]);
    let best = null, cur = CEIL;
    const centre = r.y + GR.PLAYER.h / 2;
    for (const b of blocks.concat([[FLOOR, FLOOR]])) {
      const g = [cur, b[0]];
      if (g[1] - g[0] >= PH + 16) {                          // a gap the poo fits through; pick the one nearest to it
        const mid = (g[0] + g[1]) / 2;
        if (!best || Math.abs(mid - centre) < Math.abs((best[0] + best[1]) / 2 - centre)) best = g;
      }
      cur = Math.max(cur, b[1]);
    }
    if (!best) return 780;
    const h = best[1] - best[0];
    return best[0] + Math.min(PH / 2 + 18, h / 2) + (h > 260 ? 0.18 * h : 0);   // hover in the upper part of a gap: falling is free, climbing costs taps
  }
  let res = 'ok';
  while (res === 'ok' && step < 120 * 40) {
    let tap = false;
    if (step % 6 === 0) {                                   // look every 50 ms, act `react` seconds later
      const centre = r.y + GR.PLAYER.h / 2;
      // anticipation: where will the poo be when my finger arrives? (free fall for `react` seconds)
      const pred = centre + r.vy * react + 0.5 * GR.PHYS.gravity * react * react;
      if (!queue.length && cd <= 0 && pred > target() + 6 && r.vy > -120) queue.push(r.t + react + (rng() - 0.5) * 0.08);
    }
    if (queue.length && r.t >= queue[0]) { queue.shift(); if (cd <= 0) { tap = true; cd = 0.15; } }
    cd -= C.DT;
    res = C.step(r, tap); step++;
    if (process.env.TRACE && step % 12 === 0 && step < 400) console.log('t=' + r.t.toFixed(2), 'y=' + Math.round(r.y), 'vy=' + Math.round(r.vy), 'scroll=' + Math.round(r.scroll), tap ? 'TAP' : '', 'target=' + Math.round(target()), res);
  }
  return { win: res === 'win', scroll: Math.round(r.scroll / 100) * 100, hit: r.hit };
}
let seed = 12345; const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
let wins = 0; const N = 300; const deathAt = {};
if (process.env.TRACE) { humanRun(rng); process.exit(0); }
for (let i = 0; i < N; i++) { const o = humanRun(rng); if (o.win) wins++; else { const k = o.scroll + ':' + o.hit; deathAt[k] = (deathAt[k] || 0) + 1; } }
if (wins < N) console.log('where the human model dies (scroll:killer = count):', Object.entries(deathAt).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + '=' + v).join('  '));
console.log(`reactive human model (random reaction 80-260 ms, tap jitter): ${wins}/${N} runs finished (${(100 * wins / N).toFixed(0)} %)`);
process.exit(won ? 0 : 1);

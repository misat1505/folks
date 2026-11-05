/* Gut Run - constants and the hand-made course.
 * All coordinates are in "design pixels" (the 720x1280 @2x space of the assets).
 * The ad itself is laid out at 360x640 CSS px = exactly half of that.
 */
(function (GR) {
  'use strict';

  GR.W = 720;
  GR.H = 1280;

  // The gut strip (gameplay.png) is 5056 px wide. The design file 01-start.png shows
  // it scrolled by 4 px, so the run starts there (measured by template matching).
  GR.GUT_W = 5056;
  GR.START_SCROLL = 4;
  GR.MAX_SCROLL = GR.GUT_W - GR.W;

  // Player: fixed x, start position measured from design/01-start.png (111, 517).
  GR.PLAYER = { x: 111, y: 517, w: 84, h: 82 };

  // Physics (px and seconds in design space). A tap gives ~53 px of lift (the ceiling is only ~50px above the start position).
  GR.PHYS = { gravity: 1600, jump: -410, maxFall: 1100 };

  // Scroll speed in px/s: eases in after the first tap ("get ready"),
  // then ramps up gently over the length of the gut.
  GR.SPEED = { base: 270, max: 330, easeIn: 1.4 };

  // "Get ready": for this long after the first tap the player cannot hit obstacles (the walls still count).
  // The design puts bac6 only 61 px under the start position, so without it the first tap would be a coin flip.
  GR.GRACE = 0.7;

  /* The course. x = left edge in gut coordinates, y = top edge on screen.
   * The first four entries are exactly where design/01-start.png shows them
   * (screen x + 4 because of the 4px start scroll; bac6 is drawn at 70%, as in
   * the design). Every obstacle appears exactly once per run.
   * `lane` documents the free passage (centre y) that the obstacles leave open;
   * the debug autopilot (?bot=1) uses it, and so did I when tuning the gaps.
   */
  GR.LEVEL = [
    // start screen (high lane)
    { id: 'bac6', x: 191,  y: 660, s: 0.7 },
    { id: 'txt1', x: 203,  y: 740 },
    { id: 'bac2', x: 552,  y: 658 },
    { id: 'txt2', x: 607,  y: 778 },
    // gate 1 - low lane (txt5 hangs from the ceiling)
    { id: 'txt5', x: 1010, y: 452 },
    // gate 2 - high lane
    { id: 'bac1', x: 1430, y: 760 },
    // gate 3 - middle lane (ceiling + floor obstacle)
    { id: 'txt3', x: 1840, y: 455 },
    { id: 'txt7', x: 1880, y: 985 },
    // gate 4 - a floating bacterium: pass above or below
    { id: 'bac3', x: 2250, y: 720 },
    // gate 5 - low-middle lane
    { id: 'txt6', x: 2650, y: 452 },
    { id: 'bac5', x: 2760, y: 1035 },
    // gate 6 - high-middle lane
    { id: 'txt8', x: 3100, y: 822 },
    { id: 'bac4', x: 3200, y: 470 },
    // gate 7 - low lane
    { id: 'txt9', x: 3500, y: 455 },
    // gate 8 - high lane, then a free glide to the end of the gut
    { id: 'txt4', x: 3900, y: 955 }
  ];

  // x0..x1: world x-range the gate occupies, lane: centre y of the free passage
  GR.GATES = [
    { x0: 191,  x1: 675,  lane: 560 },
    { x0: 1010, x1: 1070, lane: 980 },
    { x0: 1430, x1: 1555, lane: 650 },
    { x0: 1840, x1: 1940, lane: 765 },
    { x0: 2250, x1: 2408, lane: 595 },
    { x0: 2650, x1: 2867, lane: 890 },
    { x0: 3100, x1: 3338, lane: 685 },
    { x0: 3500, x1: 3551, lane: 960 },
    { x0: 3900, x1: 3958, lane: 640 }
  ];
})(window.GR = window.GR || {});

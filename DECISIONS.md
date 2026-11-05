# Decisions

Measured numbers come from the scripts in `tools/` (OpenCV template matching / SIFT on the delivered assets and designs).

## Both variants

- **No framework, no bundler.** Plain files, GSAP only. `clickTag` is read exactly as the brief says: `const clickTag = window.clickTag || 'https://example.com/landing'`.
- **2x assets shown at 50%.** All sizes in CSS are the asset pixel size / 2.
- **Positions measured, not eyeballed.** Sprite positions in the start screen, CTA positions and the product/panel geometry were found by template matching against the design PNGs (rmse and offsets are in the build scripts' comments).
- **Weight (budget 3 MB).** A: 1.3 MB, B: 1.4 MB. Original task assets: A 2.1 MB, B 3.6 MB.
  - Audio is the big win in A: mono, 32 kHz, 48 to 56 kbps. Music 463 KB -> 347 KB, applause 602 KB -> 37 KB (trimmed to 6 s with a fade-out, it was 15 s), crash 86 -> 16 KB, fail 168 -> 30 KB.
  - JPG backgrounds re-encoded at q80 progressive, PNGs optimised, full-frame PNG layers in B cropped to their bounding box (logo, copy, headline lines), the text panel is one 640x338 strip instead of a 640x1950 layer.
  - `bg-big.jpg` (1.9 MB) is not shipped; the top background is cut from it at build time.

## Variant A: Gut Run

**Rendering: one canvas for the world, DOM for everything else.**
- The world (background, scrolling gut, 15 obstacles, player, walls) is drawn on a 720x1280 canvas. That is a lot of moving pieces and a canvas keeps it to a single composited surface.
- The start hint and the endcards are DOM `<img>` layers animated with GSAP. They are mostly full-frame transparent PNGs, they need easing/stagger/bounces (GSAP does that better than hand-written canvas tweens), and the CTA / replay / mute must be real `<button>`s (focus, click, `alt` text).

**Scaling to the viewport.**
- The stage is 360x640 and scaled with `transform: scale(min(innerWidth/360, innerHeight/640))`, anchored to the top and centred horizontally ("contain"). Nothing is cut off at any size; `innerHeight` follows the browser toolbars and is re-read on `resize`, `orientationchange` and `visualViewport` resize.
- On a taller phone than 9:16 the free strip below gets the gut-wall colour (`#d89c95`), on a wider screen the sides are the navy background.
- Tested 320x568, 360x640, 375x667, 390x844, 430x932, 412x700 and landscape 844x390: the stage always lies fully inside the viewport (`tools/e2e_a.py`).

**Game loop.**
- Fixed 1/120 s simulation step with an accumulator, so physics and collisions are the same on 60 Hz and 120 Hz screens. Frame time is clamped to 50 ms.
- The poo has a fixed x. Physics (design px): gravity 1600, jump -410 (a tap lifts about 53 px), max fall 1100.
- Why such a small hop: the wall above the start position is only about 50 px away (the wall bottom edge at the player's columns is y 448 to 469, the player starts at y 517). A bigger hop would kill the player on the very first tap.
- Scroll speed eases in after the first tap (smoothstep, 1.4 s) and ramps from 270 to 330 px/s over the length of the gut. The gut strip is 5056 px wide; the run starts at 4 px scroll because that is how `01-start.png` is cut (template match).

**Collision.**
- Pixel-based, not rectangles. At build time (`tools/build_a.py`) each obstacle's alpha is thresholded and **eroded by 3 px (@2x)**; the player is eroded by **5 px** and stored as about 380 sample points (outline plus a filled 4 px grid, so a small bacterium inside the player's body is also found). The test is "does any player point fall on a set pixel of an obstacle mask", with a cheap bounding-box test first.
- The top and bottom gut walls use the real alpha profile of `border.png` (per column), plus 6 px tolerance. Cyan lines in `?debug=1` show it.
- The player's rotation (tilt with vertical speed) is cosmetic only; the hitbox is not rotated. With the erosion margins the mismatch is not visible.
- Text obstacles are collided on their letter strokes, not their bounding box. The player is always much wider than the gaps between letters, so nothing can slip through them.
- `?debug=1` draws the actual masks (red), the naive image rectangles (dashed white), the player points (green) and the wall profile (cyan).

**Course ("each obstacle exactly once").**
- Hand-placed in `js/level.js`: the first four obstacles are exactly where `01-start.png` shows them (bac6 is drawn at 70% as in the design), the other 11 follow in 8 gates. All gaps are at least 180 px for a 70 px player.
- `tools/verify_level.js` searches **all** tap sequences (decision every 50 ms, minimum 0.15 to 0.30 s between taps) and finds a finish for every setting, with at least about 80 alive states at the narrowest point (a wide corridor, not a needle's eye).
- The same script has a crude reactive-human model with 80 to 260 ms reaction time and tap jitter: it finishes about 35% of runs. That model first scored 0% because of bugs in the model (it picked the biggest gap instead of the nearest, queued several taps at once, ignored the delay) and then because the physics were too twitchy (gravity 3200). I softened gravity to 1600 / jump 410 at the same hop height. I trust the number only as a lower bound.
- **Get ready:** the design puts bac6 only 61 px under the start position, so for 0.7 s after the first tap obstacles are harmless (walls still count) and the poo blinks. Without it the first tap would be a coin flip.

**Endcards.**
- Dies: crash sound + white flash + short canvas shake, the poo tumbles for 0.7 s, then the fail card fades in; the bacteria pop in with `back.out`, the sad poo drops with `bounce.out`, the CTA pulses. Win: the poo coasts to the end of the gut, then confetti burst (the delivered `konfetti.png` plus 30 small DOM pieces), the happy poo springs in (`elastic.out`) and squashes gently.
- Button boxes live in the stylesheet, not inline styles. GSAP `clearProps: 'all'` (used to reset endcards on replay) wipes the whole `style` attribute, which moved the buttons to the top in my first version.
- **Replay** kills every timeline and idle tween, removes the confetti pieces, stops all audio and goes back to the start screen. `tools/e2e_a.py` checks that the tween count drops and that no sound keeps playing.

**Audio.**
- Plain `HTMLAudio`: works from the first user gesture, is simple to pause/resume and has no decoding cost at load. Nothing plays before the first tap.
- iOS only accepts `play()` inside `touchend` / `click`, not `pointerdown`. The first tap primes the short sounds (muted play/pause) and a retry hook runs on `pointerup` / `touchend` / `click` so a refused music start is retried within the same gesture. **Written to the rules, not tested on an iPhone.**
- Music is faded out (0.4 s) on crash and win. `visibilitychange` and an `IntersectionObserver` (less than 25% visible) pause GSAP's global timeline, the loop and all sounds. On return in the middle of a run the game waits for a tap (the "tab to run" hand reappears) instead of dropping the player into moving obstacles.

**Reduced motion.** Intro, pulses and idle loops are skipped; the endcards just fade. The game itself is the product, so scrolling/physics stay.

## Variant B: Fireplace

**Background: bg-big or the per-part files? (the question in the brief)**
- SIFT matching of each delivered `bg.jpg` against `bg-big.jpg` shows they are **not crops of one surface**: `left/bg.jpg` is bg-big at scale 1.000 shifted by (4, 12) px (2600 inliers); `right/bg.jpg` is bg-big at 1.127; `top/bg.jpg` at 1.325. So the grain of the moss is 13% and 32% different between parts, and simply using the three files gives three surfaces that only look alike.
- The design (`layout.png`) was built from the per-part files: the product pack on the right is 340 px wide in the design and in `right/bg.jpg`, but 383 px in `bg-big` (the packs are part of the photos, there is no separate product layer). Using bg-big for everything would therefore break "product in the right size and place".
- **Decision (hybrid):**
  - **left** = delivered `left/bg.jpg` (identical to bg-big at the left part's offset, so it matches the design exactly),
  - **top** = a crop of `bg-big.jpg` at the same scale and offset as the left part (x 652, y 12), so the left | top seam is exact by construction. The delivered `top/bg.jpg` was rejected: it is the same photo at 0.75x, the moss would be 32% finer than next to it,
  - **right** = delivered `right/bg.jpg` (keeps the product at the design's size and position).
- Seam check (mean colour difference of columns across the 8 px gap, versus columns 9 px apart inside one picture, which is about 63 for this noisy texture): left | top 70, top | right 69. So the top | right seam is at the noise level of the texture. Honest limit: that is a number plus looking at the stitched result, not proof that no one will see it.
- Motion: each part zooms about its own point (left about its right edge, right about its left edge, top about its centre). The seam content can drift apart by up to about 20 px during the 30 s push-in, which on stationary moss is not visible. Using one shared canvas would be exact, but then the right product would be too big.

**Transparency was missing from the delivered PNGs.**
- `box.png`, `cta.png` and the left/right `hl.png` are palette PNGs without a `tRNS` chunk: opaque on black. Overlaying them directly gives black boxes.
- `hl.png` (11 palette entries, all white) and `cta.png` (corners 1 to 6 are the same red, then opaque colours) keep the **original alpha order in the palette index**, so alpha is rebuilt as index / max for the text and index / 7 for the corner pixels of the button.
- `box.png` is a 1-bit mask. Fitting `layout.png` (G and B channels, slope of design colour vs. moss colour) gives opacity 0.91 and a panel colour of about (48,106,156), not the (15,108,161) stored in the file. I used the fitted values so that it looks like the design. It is an estimate.
- `top/hl.png` and the logos are real RGBA and used as they are.

**Headline copy mismatch (open question for the designer).** `layout.png`: "NATÜRLICH STARK / BEI HUSTENREIZ & / HALSSCHMERZEN."; delivered `top/hl.png`: "STARK BEI / HUSTENREIZ & / HALSSCHMERZEN.". I did not retype or rebuild the text and used the delivered file.

**Layout.** The assets are full-frame 640x1950 layers, so they sit at (0,0), and each layer is cropped to its bounding box at build time with its CSS position written to `css/positions.css` (so they are measured, not typed). Logo (65,59), panel y 745 to 914, copy at y 768, CTA (74,837), headline lines at y 0 / 89 / 157. The CTA is centred in the lower panel; the design offsets differ by under 1 px. The preview has 4 px between the parts, as in the design.

**Animation (about 3.6 s intro, everything stopped by 30 s).**
- One choreography, offsets per part: surface fades up from dark (1 s) and settles from a 10% zoom (3.2 s, `power3.out`); left logo (0.45 s, `back.out`) -> headline lines rise one after another through a mask (0.7 / 1.1 / 1.5 s) -> right logo (0.9 s) -> panels open (`scaleY`, 1.55 / 1.75 s) -> copy (2.05 / 2.25 s) -> CTA pops in last (2.7 / 2.9 s).
- Because the product is baked into the background, "product slides in and eases to a stop" is the settle of the whole surface, not a separate move. I would rather say that than fake a product layer.
- After the intro: the background pushes in from 1.00 to 1.04 with `sine.inOut` (it eases out, no snap) until 30 s, and the CTA pulses 28 times (1 to 1.06) and ends at scale 1 before 30 s. No `repeat: -1` anywhere. `e2e_b.py` checks that no tween is active 31 s after the start.
- Only `transform` and `opacity` are animated. Moving layers have `will-change`. The headline lines are revealed with `yPercent` inside an `overflow: hidden` wrapper, which is a clip but not an animated layout property.
- `prefers-reduced-motion`: the finished state at once, no tweens.

**Sync across separate documents.** `preview.html` loads the parts with `?sync=1`; each part posts `ready` once its images are decoded, the preview waits for all three and sends `start` with an absolute timestamp (now + 250 ms), each part begins at that time. Measured timeline offsets between the three iframes are below 0.15 s (usually one frame). Without a preview (production, each part alone) a part simply starts after load, and also after 8 s if the preview never answers.

**Debug overlay.** `?debug=1` or `D`: `design/layout.png` (re-saved as `dev/layout.jpg`, not counted in the ad weight) at 50% opacity, scaled by 1/0.975 (the design is a 0.975x screenshot) and offset per frame. Frame origins in the layout are measured to about 1 px.

# SF-FE-01-BAM: Gut Run (Variant A) and Fireplace (Variant B)

Two rich media ads in plain HTML / CSS / JavaScript. GSAP is the only library (copied from npm, `GSAP-LICENSE.txt`). No framework, no bundler, no build step needed to run them.

| | Variant A: Gut Run | Variant B: Fireplace |
|---|---|---|
| Entry | `variant-a-game/index.html` | `variant-b-fireplace/preview.html` (and `top.html`, `left.html`, `right.html` on their own) |
| Size | 360x640 CSS px, scaled to the visible viewport | 1032x250 and 2x 320x975 |
| Weight | about 1.3 MB (images 0.7 MB, audio 0.44 MB, JS 0.16 MB) | about 1.4 MB |
| Debug | `?debug=1` hitboxes, `?bot=1` autopilot | `?debug=1` or the checkbox / key `D`: design overlay at 50% |

## Run it

```bash
python3 -m http.server 8000        # any static server works (npx serve, php -S ...)
# Variant A:  http://localhost:8000/variant-a-game/index.html     (use device mode in DevTools, or a phone on the same Wi-Fi)
# Variant B:  http://localhost:8000/variant-b-fireplace/preview.html
```

Do not open the files with a double click: audio, `decode()` and iframes behave differently on `file://`.

**Controls (A):** tap / click / Space to start and jump. Speaker icon = mute.
**Preview (B):** `R` or the button replays all three parts in sync, `D` toggles the design overlay.

### Checks

```bash
node tools/verify_level.js          # proves Variant A can be finished (search over all tap sequences)
python3 tools/e2e_a.py              # Variant A in headless Chromium: win, fail, replay, sounds, pause, 7 viewports
python3 tools/e2e_b.py              # Variant B: sync, 30 s stop, reduced motion, clickout, weight
```
The e2e scripts need `pip install playwright && playwright install chromium`. They write screenshots to `tools/e2e-out/`.

`tools/build_a.py` and `tools/build_b.py` regenerate the optimised assets from the original task repo (`python3 tools/build_b.py <task-repo> .`). The built assets are committed, so you do not need them to run anything.

## What I would do next (2 to 4 hours)

1. **Real devices.** I only had headless Chromium. iOS Safari (audio unlock, dynamic toolbar, `100%` height) and a mid-range Android are the first things to test; the iOS audio path is written to the rules but not verified.
2. **Variant A feel.** Playtest with real people and tune from that (the numbers I used are in DECISIONS.md). Add a short screen shake / particles on the crash and a proper "go" cue after the get-ready moment.
3. **Variant B automated visual check.** Turn the manual 50% overlay into a pixel diff against `design/layout.png` in the e2e test, and ask the designer about the headline (see below).
4. **Weight.** Audio sprite instead of 5 files, WebP/AVIF for the large JPGs (the 2x backgrounds are the biggest items), a single copy of `gsap.min.js` if both variants ship together.

## Known issues and shortcuts

- **Variant B headline does not match the design.** `design/layout.png` reads "NATÜRLICH STARK / BEI HUSTENREIZ & / HALSSCHMERZEN." but the delivered `assets/top/hl.png` contains "STARK BEI / HUSTENREIZ & / HALSSCHMERZEN." (no "NATÜRLICH", different line breaks and sizes). I used the delivered asset and did not retype marketing copy. This is the one visible deviation from the design and needs an answer from the designer.
- **Variant B text panel colour/opacity is estimated.** `box.png`, `cta.png` and the left/right `hl.png` were exported as palette PNGs without any transparency chunk (opaque on black). I rebuilt alpha from the palette order; for the panel I fitted colour (48,106,156) and opacity 0.91 to `layout.png` because the file only holds a 1-bit mask. Details in DECISIONS.md.
- **Variant B product is part of the background image**, there is no separate product layer. So "product slides in" is done as the whole background settling from a 10% zoom, not as a separate move.
- **Variant B seams.** Left | top is exact (same scale and offset). Top | right is not guaranteed, the delivered right background is `bg-big` at another scale. Measured seam difference is in the noise of the moss texture, but it is judged by eye only.
- **Variant A tuned with models, not people.** The course is proven finishable by a search (`verify_level.js`), and a deliberately crude reactive player model finishes about 35% of runs. Real players will differ.
- **Variant A, first obstacles are the design's.** The start screenshot puts bacteria only 61 px under the player, so the first 0.7 s after the first tap are a "get ready" moment (blinking poo, obstacles harmless, walls not).
- The debug autopilot (`?bot=1`) and the level solver are development tools. They are not loaded in the normal ad.
- No screen recording.

## AI note

I used **Claude (Claude Code, Sonnet 5.5)** for almost everything: reading the assets, writing the measurement scripts (template matching and SIFT in OpenCV to find sprite positions and the scale of each background), the game and the ads themselves, the level solver and the Playwright tests. The decisions in DECISIONS.md are the ones I checked and can explain; the numbers come from the scripts in `tools/`.

Where the AI was wrong and I fixed it:
- **Lost transparency.** The first plan was to overlay `box.png`, `cta.png` and `hl.png` as normal PNGs. Dumping the PNG chunks showed they are palette images with no `tRNS` chunk, so they would have shown as black rectangles. I rebuilt alpha from the palette order (`tools/build_b.py`).
- **GSAP `clearProps: 'all'` deleted my inline styles**, so the endcard buttons jumped to the top after a reset. Positions moved into the stylesheet. Found by the e2e screenshots.
- **The gut and its texture were drawn over the headline band** on the start screen. The world is now clipped to y >= 337 like in the design.
- **First physics were too twitchy.** The Monte-Carlo player model finished 0 of 300 runs (first because of a bug in the model itself, then because of the physics). Fixing the model and softening gravity (3200 -> 1600) is what brought it to about 35%.
- **A flawed background match.** SIFT on the right background first reported a match in the wrong half of `bg-big`. I restricted the search region and only then trusted the scale (1.127).

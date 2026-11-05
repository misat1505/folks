#!/usr/bin/env python3
"""End-to-end check of Variant B (Fireplace) in headless Chromium.

    python3 tools/e2e_b.py        (needs: pip install playwright && playwright install chromium)

  * every part also works on its own (no preview needed) and ends in the finished state
  * in preview.html the three separate documents run ONE choreography (same timeline time)
  * all motion has stopped after 30 s (no endless loops)
  * prefers-reduced-motion: finished state immediately, nothing animates
  * clickout, debug overlay toggle, no console errors, total weight under 3 MB
Screenshots -> tools/e2e-out/
"""
import functools, http.server, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(os.path.dirname(__file__), "e2e-out"); os.makedirs(OUT, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a, **k): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_address[1]}/variant-b-fireplace/"

fails = []
def check(ok, msg):
    print(("PASS  " if ok else "FAIL  ") + msg)
    if not ok: fails.append(msg)

SIZES = {"left": (320, 975), "right": (320, 975), "top": (1032, 250)}
ACTIVE = "gsap.globalTimeline.getChildren(true, true, true).filter(t => t.isActive() && t.getChildren === undefined).length"

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---- 1. standalone parts -------------------------------------------------------------
    for part, (w, h) in SIZES.items():
        ctx = b.new_context(viewport={"width": w, "height": h}); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto(f"{BASE}{part}.html"); time.sleep(5.2)
        pg.screenshot(path=f"{OUT}/b-{part}.png")
        if part != "top":
            ops = pg.evaluate("['.logo','.panel','.copy','.cta'].map(s => +getComputedStyle(document.querySelector(s)).opacity)")
            check(all(o > 0.99 for o in ops), f"{part}: standalone intro finishes with every layer visible {ops}")
        else:
            ops = pg.evaluate("[...document.querySelectorAll('.line img')].map(e => +getComputedStyle(e).opacity)")
            check(all(o > 0.99 for o in ops), f"top: three headline lines visible {ops}")
        pg.evaluate("window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; 0")
        pg.mouse.click(w // 2, h // 2)
        check(pg.evaluate("window.__opened") == ["https://example.com/landing"], f"{part}: click opens the click tag")
        check(not errs, f"{part}: no console errors {errs}")
        ctx.close()

    # ---- 2. preview: one choreography ----------------------------------------------------
    ctx = b.new_context(viewport={"width": 1680, "height": 975}); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(BASE + "preview.html"); time.sleep(1.8)
    times = [pg.frame_locator(f"#{p_}").locator("body").evaluate("() => window.__fp.tl.time()") for p_ in ("left", "top", "right")]
    check(max(times) - min(times) < 0.25, f"three documents are in sync (timeline times {[round(t, 2) for t in times]})")
    time.sleep(3.2); pg.screenshot(path=f"{OUT}/b-preview.png")
    # debug overlay
    pg.keyboard.press("d"); time.sleep(0.3)
    vis = [pg.frame_locator(f"#{p_}").locator(".dbg").is_visible() for p_ in ("left", "top", "right")]
    check(all(vis), "design overlay toggles on in all parts")
    pg.screenshot(path=f"{OUT}/b-preview-overlay.png"); pg.keyboard.press("d")
    # replay restarts everything
    pg.click("#replay"); time.sleep(1.0)
    times2 = [pg.frame_locator(f"#{p_}").locator("body").evaluate("() => window.__fp.tl.time()") for p_ in ("left", "top", "right")]
    check(max(times2) < 1.8 and max(times2) - min(times2) < 0.25, f"replay restarts all parts together {[round(t, 2) for t in times2]}")
    check(not errs, f"preview: no console errors {errs}")

    # ---- 3. everything stops by 30 s -----------------------------------------------------
    pg.click("#replay"); t0 = time.time()
    time.sleep(31.0 - 0.0)
    act = [pg.frame_locator(f"#{p_}").locator("body").evaluate(f"() => {ACTIVE}") for p_ in ("left", "top", "right")]
    check(act == [0, 0, 0], f"no tween still running 31 s after start {act}")
    ctx.close()

    # ---- 4. reduced motion ----------------------------------------------------------------
    ctx = b.new_context(viewport={"width": 320, "height": 975}, reduced_motion="reduce"); pg = ctx.new_page()
    pg.goto(BASE + "left.html"); time.sleep(0.5)
    st = pg.evaluate("({veil: getComputedStyle(document.querySelector('.veil')).display, cta: +getComputedStyle(document.querySelector('.cta')).opacity, running: gsap.globalTimeline.getChildren(true,true,true).filter(t=>t.isActive()).length})")
    check(st["veil"] == "none" and st["cta"] == 1 and st["running"] == 0, f"reduced motion: static finished state {st}")
    ctx.close()
    b.close()

# ---- 5. weight (ad only: html + css + js + assets, without preview.html and dev/) --------------------------------
total = 0
for dp, dn, fn in os.walk(os.path.join(ROOT, "variant-b-fireplace")):
    if os.path.basename(dp) == "dev": continue
    for f in fn:
        if f == "preview.html": continue
        total += os.path.getsize(os.path.join(dp, f))
check(total < 3 * 1024 * 1024, f"total weight {total / 1024 / 1024:.2f} MB (< 3 MB)")

srv.shutdown()
print(f"\n{len(fails)} check(s) failed" if fails else "\nall checks passed")
sys.exit(1 if fails else 0)

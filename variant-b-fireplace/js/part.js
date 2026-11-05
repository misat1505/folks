/* Fireplace - one animated part (top / left / right). The three parts are separate documents, as in
 * production, but share this script: they run the same intro with part-specific delays so that it
 * reads as ONE choreography across the website (left logo -> headline lines -> right logo -> panels ->
 * copy -> CTAs). Only transform and opacity are animated. */
(function () {
  'use strict';

  const clickTag = window.clickTag || 'https://example.com/landing';

  const part = document.body.dataset.part;                    // 'left' | 'right' | 'top'
  const ad = document.getElementById('ad');
  const $ = (s) => ad.querySelector(s);
  const params = new URLSearchParams(location.search);
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const waitForParent = params.get('sync') === '1' && window.parent !== window;   // set by preview.html

  /* ----------------------------------------------------------------- clickout */
  const clickout = () => window.open(clickTag, '_blank', 'noopener');
  ad.addEventListener('click', clickout);
  ad.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickout(); } });

  /* ----------------------------------------------------------------- choreography (seconds) */
  const DELAY = {
    left:  { logo: 0.45, panel: 1.55, copy: 2.05, cta: 2.7 },
    right: { logo: 0.9,  panel: 1.75, copy: 2.25, cta: 2.9 },
    top:   { line: [0.7, 1.1, 1.5] }
  }[part];
  const INTRO_BG = 3.2;        // background settles after this long
  const LIFETIME = 30;         // all looping motion has stopped by now

  const el = {
    bg: $('.bg'), veil: $('.veil'), logo: $('.logo'), panel: $('.panel'), copy: $('.copy'), cta: $('.cta'),
    lines: Array.prototype.slice.call(ad.querySelectorAll('.line img'))
  };

  // every element that exists in this part (top has lines but no logo/panel/copy/cta, the skyscrapers the reverse)
  const movers = [el.bg, el.logo, el.panel, el.copy, el.cta].concat(el.lines).filter(Boolean);

  let tl = null;

  function finalState() {
    gsap.set(movers, { clearProps: 'transform,opacity' });
    el.veil.style.display = 'none';
  }

  function build() {
    if (tl) tl.kill();
    gsap.killTweensOf(movers.concat(el.veil));
    el.veil.style.display = '';

    // start poses (set before the first paint; the veil also hides everything until the timeline runs)
    gsap.set(el.veil, { opacity: 1 });
    gsap.set(el.bg, { scale: 1.1 });
    if (part === 'top') {
      gsap.set(el.lines, { yPercent: 108, opacity: 0 });
    } else {
      gsap.set(el.logo, { opacity: 0, scale: 0.82, y: -18, transformOrigin: '50% 50%' });
      gsap.set(el.panel, { opacity: 0, scaleY: 0, transformOrigin: '50% 50%' });
      gsap.set(el.copy, { opacity: 0, y: 16 });
      gsap.set(el.cta, { opacity: 0, scale: 0.6, transformOrigin: '50% 50%' });
    }

    tl = gsap.timeline({ paused: true });

    // shared by all three parts: the surface fades up from dark and settles from a slight zoom,
    // then very slowly pushes in until LIFETIME and stops with an ease (no loop, no snap)
    tl.to(el.veil, { opacity: 0, duration: 1.0, ease: 'power1.out' }, 0)
      .to(el.bg, { scale: 1, duration: INTRO_BG, ease: 'power3.out' }, 0)
      .to(el.bg, { scale: 1.04, duration: LIFETIME - INTRO_BG, ease: 'sine.inOut' }, INTRO_BG);

    if (part === 'top') {
      el.lines.forEach((img, i) => {
        tl.to(img, { yPercent: 0, duration: 0.8, ease: 'power3.out' }, DELAY.line[i])
          .to(img, { opacity: 1, duration: 0.35, ease: 'power1.out' }, DELAY.line[i]);
      });
    } else {
      tl.to(el.logo, { opacity: 1, scale: 1, y: 0, duration: 0.85, ease: 'back.out(1.7)' }, DELAY.logo)
        .to(el.panel, { opacity: 1, scaleY: 1, duration: 0.7, ease: 'power3.out' }, DELAY.panel)
        .to(el.copy, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, DELAY.copy)
        .to(el.cta, { opacity: 1, scale: 1, duration: 0.75, ease: 'back.out(2.2)' }, DELAY.cta)
        // calm pulse: 28 legs x 0.9 s, an even number so that it ends at scale 1 before LIFETIME
        .to(el.cta, { scale: 1.06, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: 27 }, DELAY.cta + 0.85);
    }
    return tl;
  }

  /** start (or restart) at an absolute time so that separate documents can begin in the same frame */
  function startAt(epochMs) {
    if (reduced) { finalState(); return; }
    build();
    const wait = Math.max(0, (epochMs || Date.now()) - Date.now());
    window.setTimeout(() => tl.play(0), wait);
  }

  /* ----------------------------------------------------------------- debug overlay */
  const dbg = $('.dbg');
  function setDebug(on) { dbg.hidden = !on; }
  if (params.get('debug') === '1') setDebug(true);

  /* ----------------------------------------------------------------- messages from preview.html */
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object' || !d.fp) return;
    if (d.fp === 'start' || d.fp === 'restart') startAt(d.at);
    if (d.fp === 'debug') setDebug(!!d.on);
  });

  /* ----------------------------------------------------------------- boot */
  if (reduced) finalState(); else build();                    // poses are in place immediately

  const imgs = Array.prototype.slice.call(ad.querySelectorAll('img'));
  Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()))).then(() => {
    if (waitForParent) {
      window.parent.postMessage({ fp: 'ready', part: part }, '*');
      window.setTimeout(() => { if (!started()) startAt(); }, 8000);   // never hang if the preview is gone
    } else {
      startAt();
    }
  });

  function started() { return tl && (tl.time() > 0 || tl.isActive()); }

  // handy for tests / debugging
  window.__fp = { get tl() { return tl; }, startAt: startAt };
})();

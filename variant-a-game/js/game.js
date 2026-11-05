/* Gut Run - game controller: rendering, input, states, endcards, pause.
 * Physics and collision live in core.js, audio in sound.js, the course in level.js. */
(function (GR) {
  'use strict';

  const clickTag = window.clickTag || 'https://example.com/landing';

  const gsap = window.gsap, Core = GR.Core, Sound = GR.Sound;
  const PL = GR.PLAYER;
  const qs = new URLSearchParams(location.search);
  const DEBUG = qs.get('debug') === '1';
  const BOT = qs.get('bot') === '1';
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (s, el) => (el || document).querySelector(s);
  const viewport = $('#viewport'), stage = $('#stage'), canvas = $('#game'), ctx = canvas.getContext('2d');
  const startEl = $('#start'), failEl = $('#fail'), winEl = $('#win');
  const headline = $('#headline'), gesture = $('#gesture'), logo = $('#logo'), muteBtn = $('#mute');

  /* ------------------------------------------------------------------ fit to viewport */
  // The stage is 360x640. It is scaled ("contain") to the *visible* viewport, so nothing is cut
  // off by mobile browser toolbars: innerHeight shrinks/grows with them and we re-fit on resize.
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / 360, vh / 640);
    const ox = (vw - 360 * s) / 2;
    stage.style.transform = 'translate(' + ox.toFixed(2) + 'px,0) scale(' + s.toFixed(4) + ')';
    viewport.classList.toggle('tall', vh / 640 > vw / 360);   // taller than 9:16 -> free strip below
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  fit();

  /* ------------------------------------------------------------------ images */
  const IMG = {};
  const toLoad = { bg: 'assets/bg.jpg', texture: 'assets/bg_texture.png', gut: 'assets/gameplay.png',
    border: 'assets/border.png', player: 'assets/player.png' };
  Core.obstacles.forEach((o) => { toLoad[o.id] = 'assets/obstacles/' + o.id + '.png'; });
  const preload = Promise.all(Object.keys(toLoad).map((k) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(); im.onerror = () => rej(new Error('missing ' + toLoad[k]));
    im.src = toLoad[k]; IMG[k] = im;
  })));

  /* ------------------------------------------------------------------ state */
  let state = 'loading';       // loading | ready | running | paused | dead | winning | fail | win
  let run = null;              // Core run state while playing
  let scrollView = GR.START_SCROLL;   // what the canvas shows
  const pl = { x: PL.x, y: PL.y, rot: 0, scale: 1 };   // player as drawn
  const intro = { off: 0, drop: 0, pop: 1, bob: 0 };    // start-screen animation values
  const fx = { flash: 0 };
  let tapQueued = false, acc = 0, last = 0, raf = 0;
  let introTL = null, bobTW = null, pulseTW = null, endTL = null, deathTL = null;
  let fps = 60, fpsT = 0, fpsN = 0;

  /* ------------------------------------------------------------------ rendering */
  function draw() {
    ctx.clearRect(0, 0, 720, 1280);
    ctx.drawImage(IMG.bg, 0, 0);

    // the world only lives below the headline band (y >= 337, where border.png starts)
    ctx.save(); ctx.beginPath(); ctx.rect(0, 337, 720, 943); ctx.clip();

    // faint squiggle texture, parallax at 35% of the gut speed
    const tx = -((scrollView * 0.35) % 720);
    ctx.drawImage(IMG.texture, tx, 0); ctx.drawImage(IMG.texture, tx + 720, 0);

    ctx.drawImage(IMG.gut, scrollView, 0, 720, 1280, 0, 0, 720, 1280);

    const pop = state === 'ready' ? intro.pop : 1;
    for (let i = 0; i < Core.obstacles.length; i++) {
      const o = Core.obstacles[i], sx = o.x - scrollView;
      if (sx > 720 || sx + o.w < 0) continue;
      if (pop < 1) {                                            // pop-in on the start screen
        ctx.save(); ctx.globalAlpha = Math.max(0, pop);
        const k = 0.6 + 0.4 * pop, cx = sx + o.w / 2, cy = o.y + o.h / 2;
        ctx.translate(cx, cy); ctx.scale(k, k); ctx.drawImage(IMG[o.id], -o.w / 2, -o.h / 2, o.w, o.h); ctx.restore();
      } else ctx.drawImage(IMG[o.id], sx, o.y, o.w, o.h);
    }

    // player (rotation/scale are cosmetic - the hitbox is the un-rotated eroded mask)
    ctx.save();
    ctx.translate(pl.x + PL.w / 2, pl.y + PL.h / 2 + (state === 'ready' ? intro.drop + intro.bob : 0));
    ctx.rotate(pl.rot); ctx.scale(pl.scale, pl.scale);
    if (state === 'running' && run.t < GR.GRACE) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(run.t * 40);   // blink = "get ready"
    ctx.drawImage(IMG.player, -PL.w / 2, -PL.h / 2);
    ctx.restore();

    ctx.drawImage(IMG.border, 0, 0);                            // gut walls on top
    ctx.restore();

    if (fx.flash > 0.01) { ctx.fillStyle = 'rgba(255,255,255,' + fx.flash + ')'; ctx.fillRect(0, 337, 720, 943); }
    if (DEBUG) drawDebug();
  }

  const maskCanvases = {};
  function maskCanvas(o) {
    if (maskCanvases[o.id]) return maskCanvases[o.id];
    const c = document.createElement('canvas'); c.width = o.mask.w; c.height = o.mask.h;
    const x = c.getContext('2d'), d = x.createImageData(o.mask.w, o.mask.h);
    for (let i = 0; i < o.mask.m.length; i++) if (o.mask.m[i]) { d.data[i * 4] = 255; d.data[i * 4 + 1] = 30; d.data[i * 4 + 2] = 30; d.data[i * 4 + 3] = 150; }
    x.putImageData(d, 0, 0);
    return (maskCanvases[o.id] = c);
  }

  function drawDebug() {
    // obstacle hitboxes: the real eroded masks, plus the naive image rectangle for comparison
    Core.obstacles.forEach((o) => {
      const sx = o.x - scrollView; if (sx > 720 || sx + o.w < 0) return;
      ctx.drawImage(maskCanvas(o), sx, o.y, o.w, o.h);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([6, 6]); ctx.strokeRect(sx, o.y, o.w, o.h); ctx.setLineDash([]);
    });
    // player sample points
    const py = state === 'running' || state === 'paused' ? run.y : pl.y;
    ctx.fillStyle = 'rgba(0,255,120,.9)';
    Core.pts.forEach((p) => ctx.fillRect(PL.x + p[0] - 1, py + p[1] - 1, 3, 3));
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.strokeRect(PL.x, py, PL.w, PL.h);
    // wall profiles
    ctx.strokeStyle = '#00e5ff'; ctx.beginPath();
    for (let x = 0; x < 720; x++) ctx.lineTo(x, Core.top[x]);
    ctx.stroke(); ctx.beginPath();
    for (let x = 0; x < 720; x++) ctx.lineTo(x, Core.bottom[x]);
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '22px monospace';
    ctx.fillText(state + '  scroll ' + Math.round(scrollView) + '/' + GR.MAX_SCROLL + '  ' + Math.round(fps) + 'fps', 12, 150);
    if (run && run.hit) ctx.fillText('hit: ' + run.hit, 12, 180);
  }

  /* ------------------------------------------------------------------ main loop */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    fpsN++; fpsT += dt; if (fpsT > 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }

    if (state === 'running') {
      acc += dt;
      while (acc >= Core.DT) {
        acc -= Core.DT;
        let tap = tapQueued; tapQueued = false;
        if (BOT && GR.Bot) tap = GR.Bot.decide(run) || tap;
        const res = Core.step(run, tap);
        if (res !== 'ok') { endRun(res); break; }
      }
      scrollView = run.scroll; pl.y = run.y;
      pl.rot = Math.max(-0.28, Math.min(0.42, run.vy / 1100 * 0.5));      // nose up / down
    }
    draw();
  }

  function startLoop() { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); }

  /* ------------------------------------------------------------------ states */
  function killIdle() {
    [introTL, bobTW, pulseTW, endTL, deathTL].forEach((t) => t && t.kill());
    introTL = bobTW = pulseTW = endTL = deathTL = null;
  }

  function showReady(quick) {
    killIdle();
    Sound.stopAll();
    state = 'ready'; run = null; acc = 0; tapQueued = false;
    failEl.hidden = true; winEl.hidden = true; startEl.hidden = false;
    gsap.set([headline, gesture, logo, canvas], { clearProps: 'all' });
    gsap.set([headline, gesture], { opacity: 1 });
    scrollView = GR.START_SCROLL; pl.x = PL.x; pl.y = PL.y; pl.rot = 0; pl.scale = 1; fx.flash = 0;
    Object.assign(intro, { off: 0, drop: 0, pop: 1, bob: 0 });

    if (reducedMotion) { startEl.hidden = false; return; }

    const tl = gsap.timeline();
    introTL = tl;
    intro.drop = -150; intro.pop = 0; intro.off = quick ? 300 : 700;
    if (!quick) tl.from(logo, { y: -60, duration: 0.6, ease: 'power3.out' }, 0);
    tl.from(headline, { y: 26, opacity: 0, duration: 0.7, ease: 'back.out(1.5)' }, quick ? 0 : 0.2);
    tl.to(intro, { off: 0, duration: quick ? 0.7 : 1.3, ease: 'power3.out',
      onUpdate: () => { scrollView = GR.START_SCROLL + intro.off; } }, 0);
    tl.to(intro, { pop: 1, duration: 0.6, ease: 'back.out(2)' }, quick ? 0.3 : 0.7);
    tl.to(intro, { drop: 0, duration: 0.9, ease: 'back.out(1.7)' }, quick ? 0.2 : 0.5);
    tl.from(gesture, { opacity: 0, scale: 0.5, duration: 0.5, ease: 'back.out(2)' }, quick ? 0.6 : 1.1);
    tl.add(() => {
      bobTW = gsap.to(intro, { bob: 7, duration: 0.85, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      pulseTW = gsap.to(gesture, { scale: 1.08, duration: 0.55, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }, quick ? 0.9 : 1.6);
  }

  function startRun() {
    Sound.unlock();
    Sound.play('music');
    // finish whatever intro was still running, then fade the hint away
    if (introTL) { introTL.progress(1); }
    killIdle();
    scrollView = GR.START_SCROLL; intro.off = 0; intro.drop = 0; intro.bob = 0; intro.pop = 1;
    gsap.to([headline, gesture], { opacity: 0, duration: 0.3, ease: 'power1.out', overwrite: true, onComplete: () => { if (state === 'running') startEl.hidden = true; } });
    run = Core.newRun();
    pl.x = PL.x; pl.y = PL.y; pl.rot = 0; pl.scale = 1;
    acc = 0; tapQueued = true; state = 'running';
  }

  function endRun(res) {
    if (res === 'win') return doWin();
    // crash
    state = 'dead';
    Sound.play('crash'); Sound.fadeOutMusic(0.4);
    const d = { y: run.y, rot: pl.rot, s: 1 };
    fx.flash = reducedMotion ? 0 : 0.55;
    deathTL = gsap.timeline({ onComplete: () => showEnd('fail') });
    if (reducedMotion) { deathTL.to(d, { duration: 0.5 }); return; }
    deathTL.to(fx, { flash: 0, duration: 0.35, ease: 'power2.out' }, 0)
      .fromTo(canvas, { x: 7 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.25)', clearProps: 'x' }, 0)
      .to(d, { y: Math.min(run.y + 70, 1040), rot: 2.4, s: 0.85, duration: 0.7, ease: 'power2.in',
        onUpdate: () => { pl.y = d.y; pl.rot = d.rot; pl.scale = d.s; } }, 0);
  }

  function doWin() {
    state = 'winning';
    Sound.fadeOutMusic(0.8);
    scrollView = GR.MAX_SCROLL; pl.y = run.y; pl.rot = 0;
    // the poo coasts to the end of the gut, then the win endcard takes over
    deathTL = gsap.timeline({ onComplete: () => showEnd('win') });
    deathTL.to(pl, { x: 330, y: 640, rot: 0.0, scale: 1.25, duration: reducedMotion ? 0.3 : 1.0, ease: 'power2.inOut' }, 0)
      .to({}, { duration: 0.15 });
  }

  /* ------------------------------------------------------------------ endcards */
  // centres of the artwork inside each full-frame layer (720x1280 space) -> transform-origin
  const ORIGIN = {
    fail: { bubble: [360, 470], bac1: [289, 267], bac2: [516, 430], bac3: [174, 462], bac4: [189, 296], bac5: [443, 310], sad: [360, 590], hl: [80, 800] },
    win: { bubble: [360, 490], konfetti: [360, 730], happy: [360, 790], hl: [56, 960] }
  };

  function setOrigins(root, kind) {
    Object.keys(ORIGIN[kind]).forEach((k) => {
      const el = $('[data-k="' + k + '"]', root), o = ORIGIN[kind][k];
      gsap.set(el, { transformOrigin: (o[0] / 7.2) + '% ' + (o[1] / 12.8) + '%' });
    });
  }

  function showEnd(kind) {
    state = kind;
    killIdle();
    startEl.hidden = true;
    const root = kind === 'fail' ? failEl : winEl;
    const other = kind === 'fail' ? winEl : failEl;
    other.hidden = true; root.hidden = false;
    const q = (k) => $('[data-k="' + k + '"]', root);
    const all = root.querySelectorAll('[data-k]');
    gsap.set(all, { clearProps: 'all' });
    setOrigins(root, kind);

    if (kind === 'fail') Sound.play('fail');
    else { Sound.play('cheer'); setTimeout(() => state === 'win' && Sound.play('applause'), 250); }

    if (reducedMotion) {
      gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      return;
    }

    const tl = endTL = gsap.timeline();
    tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out' }, 0);
    const bubble = q('bubble');
    tl.fromTo(bubble, { scale: 0.55, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.65, ease: 'back.out(1.6)' }, 0.1);

    if (kind === 'fail') {
      const bacs = ['bac1', 'bac2', 'bac3', 'bac4', 'bac5'].map(q);
      tl.fromTo(bacs, { scale: 0, opacity: 0, rotation: -25 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(2.2)', stagger: 0.09 }, 0.35);
      tl.fromTo(q('sad'), { y: -130, opacity: 0, scale: 0.85 }, { y: 0, opacity: 1, scale: 1, duration: 0.85, ease: 'bounce.out' }, 0.3);
      tl.fromTo(q('hl'), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, 0.8);
      tl.fromTo([q('cta'), q('replay')], { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.2)', stagger: 0.12 }, 1.1);
      tl.add(() => {
        bacs.forEach((b, i) => gsap.to(b, { y: '+=' + (4 + i), duration: 1.1 + i * 0.17, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
        gsap.to(q('sad'), { rotation: 2.5, duration: 1.3, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        gsap.to(q('cta'), { scale: 1.045, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }, 1.9);
    } else {
      tl.fromTo(q('konfetti'), { scale: 0.15, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.0, ease: 'expo.out' }, 0.2);
      tl.fromTo(q('happy'), { y: 150, scale: 0.6, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 1.0, ease: 'elastic.out(1, 0.55)' }, 0.25);
      tl.fromTo(q('hl'), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, 0.8);
      tl.fromTo(q('cta'), { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.2)' }, 1.1);
      tl.add(() => {
        gsap.to(q('happy'), { scaleY: 0.94, scaleX: 1.04, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 100%' });
        gsap.to(q('konfetti'), { y: 5, rotation: 0.8, duration: 1.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        gsap.to(q('cta'), { scale: 1.045, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }, 1.8);
      confettiBurst(root, tl);
    }
  }

  const COLORS = ['#fd9e8d', '#ffd9d1', '#8ec9e6', '#ffe08a', '#b6dec3', '#ffffff'];
  function confettiBurst(root, tl) {
    $$('.bit', root).forEach((b) => b.remove());
    for (let i = 0; i < 30; i++) {
      const b = document.createElement('i'); b.className = 'bit';
      b.style.background = COLORS[i % COLORS.length];
      root.appendChild(b);
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 130;
      const x1 = 180 + Math.cos(a) * r, y1 = 330 + Math.sin(a) * r * 0.85;
      tl.fromTo(b, { x: 180, y: 360, opacity: 1, rotation: 0, scale: 0.6 + Math.random() * 0.6 },
        { x: x1, y: y1, rotation: Math.random() * 540 - 270, duration: 0.7 + Math.random() * 0.3, ease: 'power3.out' }, 0.35)
        .to(b, { y: '+=' + (160 + Math.random() * 120), x: '+=' + (Math.random() * 40 - 20), rotation: '+=' + (Math.random() * 360 - 180),
          opacity: 0, duration: 1.6 + Math.random() * 1.0, ease: 'sine.in' }, '>-0.05');
    }
  }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

  function clickout() { window.open(clickTag, '_blank', 'noopener'); }

  function replay() {
    // leave no timers, tweens or sounds behind - the next run starts from a clean slate
    killIdle();
    gsap.killTweensOf('*');
    gsap.killTweensOf([fx, intro, pl]);
    $$('.bit').forEach((b) => b.remove());
    gsap.set(failEl.querySelectorAll('[data-k]'), { clearProps: 'all' });
    gsap.set(winEl.querySelectorAll('[data-k]'), { clearProps: 'all' });
    Sound.stopAll();
    showReady(true);
  }

  /* ------------------------------------------------------------------ input */
  function handleTap() {
    if (state === 'ready') startRun();
    else if (state === 'running') tapQueued = true;
    else if (state === 'paused') resumeFromHint();
  }
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('button')) return;
    e.preventDefault(); handleTap();
  }, { passive: false });
  ['pointerup', 'touchend', 'click'].forEach((ev) => stage.addEventListener(ev, () => { Sound.unlock(); Sound.retry(); }, { passive: true }));
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') { if (!e.target.closest || !e.target.closest('button')) { e.preventDefault(); handleTap(); } }
  });

  $('#fail-cta').addEventListener('click', clickout);
  $('#win-cta').addEventListener('click', clickout);
  $('#replay').addEventListener('click', replay);

  muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  muteBtn.addEventListener('click', () => {
    const m = !Sound.isMuted(); Sound.setMuted(m);
    muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.setAttribute('aria-label', m ? 'Ton einschalten' : 'Ton ausschalten');
  });

  /* ------------------------------------------------------------------ pause / resume */
  let paused = false, hiddenTab = document.hidden, offscreen = false;
  function evalPause() {
    const should = hiddenTab || offscreen;
    if (should && !paused) pause(); else if (!should && paused) resume();
  }
  function pause() {
    paused = true;
    cancelAnimationFrame(raf); raf = 0;
    gsap.globalTimeline.pause();
    Sound.pauseAll();
  }
  function resume() {
    paused = false;
    gsap.globalTimeline.resume();
    acc = 0;
    if (state === 'running') {
      // do not drop the player back into a moving course: wait for a tap
      state = 'paused';
      gesture.hidden = false; startEl.hidden = false; headline.style.opacity = 0;
      gsap.set(gesture, { opacity: 1, scale: 1 });
    } else Sound.resumeAll();
    startLoop();
  }
  function resumeFromHint() {
    state = 'running'; acc = 0; tapQueued = false;
    startEl.hidden = true; headline.style.opacity = '';
    Sound.resumeAll();
  }
  document.addEventListener('visibilitychange', () => { hiddenTab = document.hidden; evalPause(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { offscreen = es[es.length - 1].intersectionRatio < 0.25; evalPause(); }, { threshold: [0, 0.25, 0.5, 1] }).observe(stage);
  }

  /* ------------------------------------------------------------------ boot */
  GR._debug = { get state() { return state; }, get run() { return run; }, fit: fit, sounds: () => Sound.playing() };

  function boot() {
    if (BOT) {
      const s = document.createElement('script'); s.src = 'js/bot.js';
      s.onload = begin; s.onerror = begin; document.head.appendChild(s);
    } else begin();
  }
  function begin() {
    stage.classList.add('ready');
    showReady(false);
    startLoop();
    evalPause();
  }
  preload.then(boot).catch((err) => { console.error(err); });
})(window.GR = window.GR || {});

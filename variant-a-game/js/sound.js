/* Gut Run - audio.
 * Plain HTMLAudio elements: they work from file:// too, and on iOS they only need
 * to be "unlocked" once inside a user gesture (unlock() is called from the first tap).
 * Nothing plays before that first tap, which satisfies browser autoplay rules.
 */
(function (GR) {
  'use strict';

  var FILES = {
    music: 'assets/audio/music.mp3',
    crash: 'assets/audio/crash.mp3',
    fail: 'assets/audio/fail.mp3',
    cheer: 'assets/audio/cheer.mp3',
    applause: 'assets/audio/applause.mp3'
  };
  var VOL = { music: 0.5, crash: 0.9, fail: 0.9, cheer: 0.9, applause: 0.7 };

  var el = {};
  var muted = false;
  var unlocked = false;
  var wasPlaying = [];
  var fadeTween = null;
  var wantMusic = false;     // music should be playing (used to retry when iOS refused the first play())
  var suspended = false;     // everything paused because the ad is not visible

  Object.keys(FILES).forEach(function (k) {
    var a = new Audio();
    a.preload = 'auto';
    a.src = FILES[k];
    a.volume = VOL[k];
    el[k] = a;
  });
  el.music.loop = true;

  /** Call synchronously from a user gesture. Primes the short sounds so that they
   *  can be started later (iOS Safari blocks audio that was never started by a tap). */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Object.keys(el).forEach(function (k) {
      if (k === 'music') return;
      var a = el[k];
      a.muted = true;
      var p = a.play();
      var done = function () { a.pause(); a.currentTime = 0; a.muted = muted; };
      if (p && p.then) p.then(done).catch(function () { a.muted = muted; });
      else done();
    });
  }

  function killFade() {
    if (fadeTween) { fadeTween.kill(); fadeTween = null; }
  }

  function play(k) {
    var a = el[k];
    if (!a) return;
    if (k === 'music') { killFade(); wantMusic = true; }
    a.volume = VOL[k];
    a.muted = muted;
    try { a.currentTime = 0; } catch (e) { /* not seekable yet */ }
    var p = a.play();
    if (p && p.catch) p.catch(function () { /* blocked: ignore */ });
  }

  function stop(k) {
    var a = el[k];
    if (!a) return;
    if (k === 'music') { killFade(); wantMusic = false; }
    a.pause();
    try { a.currentTime = 0; } catch (e) { /* ignore */ }
  }

  function stopAll() {
    Object.keys(el).forEach(stop);
    wasPlaying = [];
  }

  function fadeOutMusic(sec) {
    var a = el.music;
    killFade();
    if (a.paused) return;
    wantMusic = false;
    fadeTween = window.gsap.to(a, {
      volume: 0, duration: sec, ease: 'power1.out',
      onComplete: function () { a.pause(); a.currentTime = 0; a.volume = VOL.music; fadeTween = null; }
    });
  }

  /** visibilitychange: remember what was playing and pause everything */
  function pauseAll() {
    suspended = true;
    wasPlaying = Object.keys(el).filter(function (k) { return !el[k].paused; });
    if (fadeTween) fadeTween.pause();
    wasPlaying.forEach(function (k) { el[k].pause(); });
  }

  function resumeAll() {
    suspended = false;
    if (fadeTween) fadeTween.resume();
    wasPlaying.forEach(function (k) {
      var p = el[k].play();
      if (p && p.catch) p.catch(function () { /* ignore */ });
    });
    wasPlaying = [];
  }

  /** iOS only honours play() inside touchend/click, not pointerdown: the game calls this from those
   *  events, so a refused first music start is retried within the same user gesture. */
  function retry() {
    if (unlocked && wantMusic && !suspended && el.music.paused) {
      var p = el.music.play();
      if (p && p.catch) p.catch(function () { /* still blocked: next gesture */ });
    }
  }

  function playing() {
    return Object.keys(el).filter(function (k) { return !el[k].paused; });
  }

  function setMuted(m) {
    muted = !!m;
    Object.keys(el).forEach(function (k) { el[k].muted = muted; });
  }

  GR.Sound = {
    unlock: unlock, retry: retry, playing: playing, play: play, stop: stop, stopAll: stopAll, fadeOutMusic: fadeOutMusic,
    pauseAll: pauseAll, resumeAll: resumeAll, setMuted: setMuted,
    isMuted: function () { return muted; }
  };
})(window.GR = window.GR || {});

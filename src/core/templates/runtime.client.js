// Runs INSIDE each ad page (injected by base.js). Responsibilities:
//  1. wait for fonts + media
//  2. split text into words/characters when a motion preset needs it
//  3. auto-fit text ([data-fit] elements and [data-fit-lines] stacks), honouring --fit-scale
//  4. build the timeline (Web Animations API, all paused): motion presets + effects, and expose
//     window.__setTime(seconds) so the renderer can capture any exact frame
//  5. window.__stillPose() puts effects in a nice frozen state for still images
//  6. set window.__AD_READY = true
// window.__AD = { mode: 'render' | 'preview', anim, effects: [], duration, still }
(async () => {
  const AD = window.__AD || { mode: 'render', anim: 'none', effects: [], duration: 6 };
  const root = document.documentElement;
  const cssVar = (n, el = root) => getComputedStyle(el).getPropertyValue(n).trim();
  const u = parseFloat(cssVar('--u'));
  const D = AD.duration || 6;
  const anim = AD.anim || 'none';
  const effects = AD.effects || [];
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const ad = $('.ad');
  const lockscreen = ad?.classList.contains('t-lockscreen');

  // ── 1. fonts + media ──────────────────────────────────────────────────────
  try {
    const fams = new Set();
    $$('*').forEach((el) => { const cs = getComputedStyle(el); fams.add(`${cs.fontStyle} ${cs.fontWeight} 40px ${cs.fontFamily}`); });
    await Promise.race([Promise.all([...fams].map((f) => document.fonts.load(f).catch(() => {}))), new Promise((r) => setTimeout(r, 8000))]);
    await document.fonts.ready;
  } catch (e) { /* render with fallback fonts */ }
  await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
  await Promise.all($$('video').map((v) => (v.readyState >= 2 ? 0 : Promise.race([
    new Promise((r) => v.addEventListener('loadeddata', r, { once: true })), new Promise((r) => setTimeout(r, 3000))]))));

  // ── 2. split text ─────────────────────────────────────────────────────────
  function split(el, unit, clip) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      const bits = unit === 'char' ? [...n.textContent] : n.textContent.split(/(\s+)/);
      for (const b of bits) {
        if (!b) continue;
        if (unit === 'word' && /^\s+$/.test(b)) { frag.append(b); continue; }
        const s = document.createElement('span');
        if (unit === 'word') {
          s.className = clip ? 'wd clip' : 'wd';
          const inner = document.createElement('span');
          inner.className = 'wi';
          inner.textContent = b;
          s.append(inner);
        } else {
          s.className = 'ch';
          s.textContent = b;
        }
        frag.append(s);
      }
      n.replaceWith(frag);
    }
  }
  const mains = $$('.headline, .offer, .ln');
  if (anim === 'word-rise' || anim === 'pop') mains.forEach((el) => split(el, 'word', anim === 'word-rise'));
  if (anim === 'typewriter') mains.forEach((el) => split(el, 'char'));
  if (['word-rise', 'pop', 'typewriter'].includes(anim)) $$('.mk').forEach((m) => m.classList.add('split'));

  // ── 3. fit text ───────────────────────────────────────────────────────────
  // Compare layout boxes (not scrollHeight): glyph ink overflowing a tight line-height must not count.
  const fits = (el, box) => el.offsetHeight <= box.clientHeight + 1 && el.scrollWidth <= Math.ceil(el.clientWidth) + 1;
  for (const el of $$('[data-fit]')) {
    const box = el.closest('.fitbox') || el.parentElement;
    const scale = parseFloat(cssVar('--fit-scale', el)) || 1; // per-element size override
    let lo = parseFloat(el.dataset.min || 3) * u * Math.min(1, scale);
    let hi = parseFloat(el.dataset.max || 20) * u * Math.max(1, scale);
    el.style.fontSize = `${lo}px`;
    if (fits(el, box)) {
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}px`;
        if (fits(el, box)) lo = mid; else hi = mid;
      }
    }
    el.style.fontSize = `${Math.floor(lo * (scale < 1 ? scale : 1) * 10) / 10}px`;
  }
  // Stacked lines: each line sized to fill the width, then all scaled down together to fit the height.
  for (const box of $$('[data-fit-lines]')) {
    const lines = [...box.querySelectorAll('.ln')];
    const W = box.clientWidth;
    const H = box.clientHeight;
    const scale = parseFloat(cssVar('--fit-scale', lines[0] ?? box)) || 1;
    const maxS = parseFloat(box.dataset.max || 40) * u;
    lines.forEach((l) => { l.style.fontSize = '100px'; });
    let sizes = lines.map((l) => Math.min(maxS, (100 * W) / Math.max(1, l.getBoundingClientRect().width)) * Math.min(1, scale));
    lines.forEach((l, i) => { l.style.fontSize = `${sizes[i]}px`; });
    // Sum line boxes directly: centred content overflowing upwards isn't counted by scrollHeight.
    const gap = parseFloat(getComputedStyle(box).rowGap) || 0;
    const total = lines.reduce((s, l) => s + l.offsetHeight, 0) + gap * (lines.length - 1);
    if (total > H) {
      const k = H / total;
      sizes = sizes.map((s) => s * k * 0.995);
      lines.forEach((l, i) => { l.style.fontSize = `${sizes[i]}px`; });
    }
  }

  // Cards that should hug their (now fitted) text instead of keeping the box used for fitting.
  $$('[data-shrinkwrap]').forEach((el) => { el.style.height = 'auto'; el.style.maxHeight = 'none'; });

  // ── 4. timeline ───────────────────────────────────────────────────────────
  const EASE = 'cubic-bezier(.2,.75,.2,1)';
  const intro = [];
  const extra = [];
  const add = (el, kf, o, list = intro) => {
    if (!el) return null;
    const a = el.animate(kf, { fill: 'both', easing: EASE, ...o });
    a.pause();
    list.push(a);
    return a;
  };
  const ms = (s) => s * 1000;
  const rise = (el, at, dist = 2.5, dur = 0.7) =>
    add(el, [{ opacity: 0, transform: `translateY(${dist * u}px)` }, { opacity: 1, transform: 'none' }], { delay: ms(at), duration: ms(dur) });
  // Start fully clipped (right edge left of the box) so the slide-in offset can't expose a sliver.
  const wipe = (el, at, dur = 0.8) => add(el,
    [{ clipPath: 'inset(-20% 106% -20% -6%)', transform: `translateX(${-2 * u}px)` }, { clipPath: 'inset(-20% -6% -20% -6%)', transform: 'none' }],
    { delay: ms(at), duration: ms(dur), easing: 'cubic-bezier(.7,0,.2,1)' });
  let introEnd = 0;

  const LOOP = !!AD.loop;
  if (anim !== 'none') {
    // Background: slow push-in on photos, drifting blobs on generated aurora backgrounds.
    // Looping clips go there and back so the last frame matches the first.
    $$('img.bg:not([data-video])').forEach((el) =>
      add(el, LOOP ? [{ transform: 'scale(1.07)' }, { transform: 'scale(1)' }, { transform: 'scale(1.07)' }] : [{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
        { duration: ms(D), easing: LOOP ? 'ease-in-out' : 'cubic-bezier(.3,.1,.3,1)' }, extra));
    $$('.genbg.aurora i').forEach((el, i) => {
      const dx = (i % 2 ? -1 : 1) * 9 * u;
      const dy = (i % 3 ? 1 : -1) * 7 * u;
      const away = { transform: `translate(${dx}px,${dy}px) scale(1.15)` };
      const home = { transform: 'translate(0,0) scale(1)' };
      add(el, LOOP ? [home, away, home] : [home, away], { duration: ms(D), easing: 'ease-in-out' }, extra);
    });

    let t = 0.25;
    if (lockscreen) {
      // iOS lock screen, as it really behaves: the clock settles, then the notification rises from
      // the bottom of the screen with Apple's spring (quick, a small overshoot, a soft settle),
      // starting slightly smaller and blurred; the older stacked cards slide up behind it.
      add($('.clock'), [{ opacity: 0, transform: `translateY(${-3 * u}px) scale(1.04)` }, { opacity: 1, transform: 'none' }], { delay: 150, duration: 900 });
      const rect = $('.notif')?.getBoundingClientRect();
      const rise = rect ? (ad.clientHeight - rect.top) + 6 * u : 60 * u;
      const spring = [
        { opacity: 0, transform: `translateY(${rise}px) scale(.9)`, filter: `blur(${0.8 * u}px)` },
        { opacity: 1, transform: `translateY(${-1.8 * u}px) scale(1.012)`, filter: 'blur(0px)', offset: 0.5 },
        { opacity: 1, transform: `translateY(${0.6 * u}px) scale(.998)`, filter: 'blur(0px)', offset: 0.74 },
        { opacity: 1, transform: `translateY(${-0.15 * u}px) scale(1)`, filter: 'blur(0px)', offset: 0.88 },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ];
      add($('.notif'), spring, { delay: 1000, duration: 950, easing: 'cubic-bezier(.32,.72,0,1)' });
      $$('.ghost').forEach((g, i) => {
        const o = parseFloat(getComputedStyle(g).opacity) || 1;
        add(g, [{ opacity: 0, transform: `translateY(${4 * u}px) scale(.94)` }, { opacity: o, transform: 'none' }], { delay: 1600 + i * 110, duration: 560, easing: 'cubic-bezier(.32,.72,0,1)' });
      });
      if (anim === 'typewriter') {
        const chars = $$('.notif .ch');
        const per = Math.min(0.05, 1.6 / Math.max(1, chars.length));
        chars.forEach((c, i) => add(c, [{ opacity: 0 }, { opacity: 1 }], { delay: ms(1.85 + i * per), duration: 1, easing: 'linear' }));
        t = 1.95 + chars.length * per;
      } else t = 2.1;
      add($('.action'), [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }], { delay: ms(t), duration: 520 });
    } else {
      const panels = $$('[data-anim-panel]');
      panels.forEach((el, i) => add(el,
        [{ opacity: 0, transform: `translateY(${4 * u}px) scale(.97)` }, { opacity: 1, transform: 'none' }],
        { delay: ms(t + i * 0.12), duration: 900 }));
      if (panels.length) t += 0.35;

      // Every visible piece starts hidden, so frame 0 never shows half-revealed text or stray marks.
      const ITEMS = '.logo, .eyebrow, .stars, .offer, .headline, .lines, .sub, .who, .cta, .foot, .rule, .mark, .ring, .orb, .body, .list, .stat-num, .src, .cols, .link, .handle, [data-anim-item]';
      const items = $$(ITEMS).filter((el) => !el.parentElement.closest(ITEMS));
      for (const el of items) {
        const isMain = el.matches('.headline, .offer, .lines');
        if (!isMain) {
          if (anim === 'wipe') wipe(el, t);
          else rise(el, t);
          t += 0.12;
          continue;
        }
        if (anim === 'typewriter') {
          const chars = [...el.querySelectorAll('.ch')];
          const per = Math.min(0.07, Math.max(0.025, 2.4 / Math.max(1, chars.length)));
          const caret = `inset ${-0.07}em 0 0 0 ${cssVar('--accent')}`;
          chars.forEach((c, i) => {
            add(c, [{ opacity: 0 }, { opacity: 1 }], { delay: ms(t + i * per), duration: 1, easing: 'linear' });
            add(c, [{ boxShadow: caret }, { boxShadow: caret }], { delay: ms(t + i * per), duration: ms(per), easing: 'linear', fill: 'none' });
          });
          const last = chars[chars.length - 1];
          if (last) {
            add(last, [{ boxShadow: caret }, { boxShadow: caret, offset: 0.5 }, { boxShadow: 'none', offset: 0.5 }, { boxShadow: 'none' }],
              { delay: ms(t + chars.length * per), duration: 900, iterations: 3, easing: 'linear', fill: 'none' });
          }
          t += chars.length * per + 0.2;
        } else if (anim === 'word-rise') {
          // 140% so even accents/ascenders sit fully below the mask before they rise.
          const words = [...el.querySelectorAll('.wi')];
          words.forEach((w, i) => add(w, [{ transform: 'translateY(140%)' }, { transform: 'none' }], { delay: ms(t + i * 0.08), duration: 750 }));
          t += words.length * 0.08 + 0.3;
        } else if (anim === 'pop') {
          const words = [...el.querySelectorAll('.wd')];
          words.forEach((w, i) => add(w, [
            { opacity: 0, transform: 'scale(.4)', filter: 'blur(10px)' },
            { opacity: 1, transform: 'scale(1.08)', filter: 'blur(0px)', offset: 0.7 },
            { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
          ], { delay: ms(t + i * 0.07), duration: 600, easing: 'ease-out' }));
          t += words.length * 0.07 + 0.3;
        } else if (anim === 'wipe') {
          wipe(el, t, 1);
          t += 0.7;
        } else {
          rise(el, t, 5, 0.9);
          t += 0.35;
        }
      }
    }

    // Keep the intro inside the clip: compress it if it would run past ~85% of the duration.
    const end = Math.max(0, ...intro.map((a) => { const tm = a.effect.getTiming(); return (tm.delay + tm.duration * (tm.iterations || 1)) / 1000; }));
    // A loop also needs room to hold, then fade everything out so the last frame matches the first.
    const limit = LOOP ? Math.max(D * 0.5, Math.min(D * 0.85, D - 1.4)) : D * 0.85;
    if (end > limit) {
      const k = limit / end;
      for (const a of intro) {
        const tm = a.effect.getTiming();
        a.effect.updateTiming({ delay: tm.delay * k, duration: Math.max(1, tm.duration * k) });
      }
    }
    introEnd = Math.min(end, limit);

    if (LOOP && intro.length) {
      // Outro: fade the outermost animated pieces away over the last ~0.5s.
      const targets = [...new Set(intro.map((a) => a.effect.target))];
      const outer = targets.filter((el) => !targets.some((o) => o !== el && o.contains(el)));
      outer.forEach((el) => {
        const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { delay: ms(D - 0.55), duration: 450, easing: 'ease-in', fill: 'forwards' });
        a.pause();
        extra.push(a);
      });
    }
  }
  const HOLD = LOOP && anim !== 'none' ? D - 0.75 : D; // the "finished" moment for still images

  // ── Button animation (content.ctaFx): repeats after the intro ───────────────
  if (AD.ctaFx) {
    const P = { shine: 2.4, nudge: 1.6, pulse: 2 }[AD.ctaFx] || 2;
    const t0 = LOOP ? Math.max(0.4, introEnd) : Math.max(0.8, introEnd + 0.2);
    const end = LOOP && anim !== 'none' ? D - 0.6 : D;
    const fxAdd = (el, kf, o) => { const a = el.animate(kf, { fill: 'none', ...o }); a.pause(); extra.push(a); };
    const ctas = $$('.cta, .action');
    if (AD.ctaFx === 'shine') {
      ctas.forEach((c) => {
        const glint = document.createElement('span');
        glint.className = 'cta-shine';
        c.append(glint);
        for (let s = t0; s + 0.9 <= end; s += P) {
          fxAdd(glint, [{ transform: 'translateX(-170%) skewX(-18deg)' }, { transform: 'translateX(340%) skewX(-18deg)' }], { delay: ms(s), duration: 900, easing: 'cubic-bezier(.5,0,.3,1)' });
        }
      });
    } else if (AD.ctaFx === 'nudge') {
      $$('.cta .arrow, .link .arrow').forEach((ar) => {
        for (let s = t0; s + 0.9 <= end; s += P) {
          fxAdd(ar, [{ transform: 'translateY(-.03em)' }, { transform: 'translate(.4em,-.03em)', offset: 0.3 }, { transform: 'translateY(-.03em)', offset: 0.55 },
            { transform: 'translate(.22em,-.03em)', offset: 0.75 }, { transform: 'translateY(-.03em)' }], { delay: ms(s), duration: 900, easing: 'ease-in-out' });
        }
      });
    } else if (AD.ctaFx === 'pulse') {
      const ring = cssVar('--cta-bg') || cssVar('--accent');
      ctas.forEach((c) => {
        for (let s = t0; s + 1.1 <= end; s += P) {
          fxAdd(c, [{ scale: '1', boxShadow: `0 0 0 0 color-mix(in srgb, ${ring} 55%, transparent)` },
            { scale: '1.055', offset: 0.3 }, { scale: '1', boxShadow: `0 0 0 ${2.2 * u}px transparent` }], { delay: ms(s), duration: 1100, easing: 'ease-out' });
        }
      });
    }
  }

  // ── Effects (independent of motion) ─────────────────────────────────────────
  const poses = [];
  if (effects.length && ad) {
    const W = ad.clientWidth;
    const Hh = ad.clientHeight;
    // Let the intro land first; loops start early so the rhythm repeats evenly across the loop point.
    const fx0 = LOOP ? 0.4 : Math.max(0.6, Math.min(1.2, introEnd));
    if (effects.includes('holo')) {
      // Holographic foil: rainbow bands in a soft drifting band, a passing glint, faint sparkles.
      const holo = document.createElement('div');
      holo.className = 'holo';
      holo.innerHTML = '<div class="foil"></div><div class="glint"></div>' + '<i class="spark"></i>'.repeat(5);
      ad.append(holo);
      const glint = holo.querySelector('.glint');
      glint.style.transform = 'translate(-60%, -30%)';
      const appear = add(holo, [{ opacity: LOOP ? 1 : 0 }, { opacity: 1 }], { delay: 200, duration: 1200, easing: 'ease-out' }, extra);
      const drift = add(holo.querySelector('.foil'), LOOP
        ? [{ transform: 'translate(-32%, -16%)' }, { transform: 'translate(32%, 16%)' }, { transform: 'translate(-32%, -16%)' }]
        : [{ transform: 'translate(-32%, -16%)' }, { transform: 'translate(32%, 16%)' }], { duration: ms(D), easing: 'ease-in-out' }, extra);
      for (let s = fx0; s + 1.6 < D; s += 3.2) {
        add(glint, [{ transform: 'translate(-60%, -30%)' }, { transform: 'translate(60%, 30%)' }], { delay: ms(s), duration: 1600, easing: 'ease-in-out', fill: 'none' }, extra);
      }
      const spots = [[0.18, 0.22], [0.78, 0.16], [0.62, 0.58], [0.3, 0.74], [0.86, 0.82]];
      holo.querySelectorAll('.spark').forEach((sp, i) => {
        sp.style.left = `${spots[i][0] * W}px`;
        sp.style.top = `${spots[i][1] * Hh}px`;
        add(sp, [{ opacity: 0, transform: 'scale(.4) rotate(0deg)' }, { opacity: 0.85, transform: 'scale(1) rotate(45deg)', offset: 0.5 }, { opacity: 0, transform: 'scale(.4) rotate(90deg)' }],
          { delay: ms(0.8 + i * 0.9), duration: 1100, iterations: Math.max(1, Math.floor((D - 0.8 - i * 0.9) / 4.5)), endDelay: 3400, easing: 'ease-in-out', fill: 'none' }, extra);
      });
      poses.push(() => { appear.currentTime = ms(D); drift.currentTime = ms(D * 0.45); });
    }
    if (effects.includes('glimmer')) {
      // A slow, soft white light passing diagonally over everything, repeating.
      const layer = document.createElement('div');
      layer.className = 'holo';
      layer.innerHTML = '<div class="sweep"></div>';
      ad.append(layer);
      const sweep = layer.querySelector('.sweep');
      const OFF = 'translate(-55%, -30%)';
      sweep.style.transform = OFF;
      for (let s = fx0; s + 2.6 <= D; s += 3.6) {
        add(sweep, [{ transform: OFF }, { transform: 'translate(55%, 30%)' }], { delay: ms(s), duration: 2600, easing: 'cubic-bezier(.45,0,.4,1)', fill: 'none' }, extra);
      }
      poses.push(() => { sweep.style.transform = 'translate(-10%, -6%)'; }); // a soft sheen frozen across the upper-left
    }
  }

  const all = [...intro, ...extra];
  // Stickers (and any CSS animation in the page) run on the same paused clock: SVG SMIL via
  // setCurrentTime, CSS animations via currentTime. That keeps every exported frame exact.
  const svgs = $$('.decor svg');
  svgs.forEach((v) => v.pauseAnimations?.());
  const cssAnims = () => document.getAnimations().filter((a) => typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation);
  cssAnims().forEach((a) => a.pause());
  window.__setTime = (s) => {
    for (const a of all) a.currentTime = s * 1000;
    svgs.forEach((v) => v.setCurrentTime?.(s));
    for (const a of cssAnims()) { a.pause(); a.currentTime = s * 1000; }
  };
  window.__setBgFrame = async (url) => {
    const img = $('img.bg');
    if (!img) return;
    img.src = url;
    try { await img.decode(); } catch (e) { /* keep previous frame */ }
  };
  window.__stillPose = () => { window.__setTime(HOLD); poses.forEach((p) => p()); };
  window.__AD_DURATION = D;

  // ── mode ──────────────────────────────────────────────────────────────────
  if (AD.mode === 'preview' && !AD.still && (all.length || svgs.length)) {
    const total = LOOP ? D : D + 1; // loops play back to back; others pause on the end frame
    const start = performance.now();
    const tick = (now) => { window.__setTime(((now - start) / 1000) % total); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  } else if (AD.still) {
    window.__stillPose();
  } else {
    window.__setTime(HOLD); // render mode: the renderer picks a still pose or steps frames
  }
  window.__AD_READY = true;
})();

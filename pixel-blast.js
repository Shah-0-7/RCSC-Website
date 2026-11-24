/**
 * PixelBlast — vanilla JS port of https://motion-brew.com/components/pixel-blast
 *
 * MIT License, Copyright (c) 2026 Md Eftakher.
 * Ported to plain JS (no React / npm) for the RCSC static site.
 *
 * API:
 *   PixelBlast.mount(container, opts)   – mount inside a positioned element
 *   PixelBlast.mountFixed(opts)         – mount as full-page fixed background
 *
 * Options (all optional):
 *   color      {string}  Pixel colour.               Default '#252528'
 *   cellSize   {number}  Grid cell in px.            Default 6
 *   shape      {string}  'square'|'circle'|'diamond' Default 'square'
 *   speed      {number}  Drift speed.                Default 1
 *   coverage   {number}  Cloud width factor.         Default 1.4
 *   density    {number}  Cloud heaviness.            Default 0.8
 *   floor      {boolean} Perspective floor.          Default false
 *   interactive{boolean} Pointer glow & ripples.     Default true
 */
(function () {
  'use strict';

  /* ── Maths helpers (identical to official source) ── */
  const BAYER = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v => (v + 0.5) / 16);

  function hash(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  const smooth = t => t * t * (3 - 2 * t);
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smooth(x - ix), fy = smooth(y - iy);
    const a = hash(ix, iy), b = hash(ix+1, iy), c = hash(ix, iy+1), d = hash(ix+1, iy+1);
    return a + (b-a)*fx + (c-a)*fy + (a-b-c+d)*fx*fy;
  }
  const fbm = (x, y) =>
    noise(x, y) * 0.6 + noise(x*2.1, y*2.1) * 0.3 + noise(x*4.3, y*4.3) * 0.1;

  const CLOUDS = [
    { ax:0.42, ay:0.36, fx:0.23, fy:0.17, px:0,   py:1.2, r:0.2  },
    { ax:0.46, ay:0.4,  fx:0.15, fy:0.21, px:2.4,  py:4.1, r:0.17 },
    { ax:0.38, ay:0.44, fx:0.19, fy:0.13, px:4.6,  py:0.4, r:0.15 },
  ];

  const REVEAL = 1.5;
  const STEPS  = [0, 0, 0.16, 0.26, 0.38, 0.50, 0.62, 0.74, 0.86];
  const band   = (lo, hi, v) => smooth(Math.min(1, Math.max(0, (v-lo)/(hi-lo))));

  /* ── Shimmer phases (one per dot slot, pre-computed) ── */
  const PHASE_COUNT = 4096;
  const phases = new Float32Array(PHASE_COUNT);
  for (let k = 0; k < PHASE_COUNT; k++) phases[k] = hash(k, 17) * Math.PI * 2;

  /* ── Read theme colour from CSS variable ── */
  function getColor(opts) {
    if (!opts.color || opts.color === 'auto') {
      const v = getComputedStyle(document.documentElement)
                  .getPropertyValue('--rcsc-contour-color').trim();
      return v || '#252528';
    }
    return opts.color;
  }

  /* ══ Core mount function ════════════════════════════════════════════════ */
  function _mount(el, ctx, opts, isFixed) {
    const still = false; // always animate – decorative background

    let w = 0, h = 0;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let time = 0;
    let idle = 0;
    let revealStart = -2; // -2 = start on next frame, -1 = not yet, ≥0 = started

    const glow    = { x: 0, y: 0, a: 0 };
    const pointer = { x: -999, y: -999, on: false };
    let ripples   = [];

    /* ── Size ── */
    function size() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (isFixed) {
        w = window.innerWidth;
        h = window.innerHeight;
      } else {
        w = el.clientWidth;
        h = el.clientHeight;
      }
      el.width  = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ── Draw a single dot ── */
    function dot(x, y, s) {
      if (s < 0.6) return;
      const shape = opts.shape || 'square';
      if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(x, y, s/2, 0, Math.PI*2);
        ctx.fill();
      } else if (shape === 'diamond') {
        const r = s * 0.62;
        ctx.beginPath();
        ctx.moveTo(x, y-r); ctx.lineTo(x+r, y);
        ctx.lineTo(x, y+r); ctx.lineTo(x-r, y);
        ctx.fill();
      } else {
        ctx.fillRect(x-s/2, y-s/2, s, s);
      }
    }

    /* ── Extra light at a point (pointer glow + ripple rings) ── */
    function light(x, y) {
      let l = 0;
      if (glow.a > 0.01) {
        const dx = x - glow.x, dy = y - glow.y;
        l += glow.a * 0.55 * Math.exp(-(dx*dx + dy*dy) / (2*54*54));
      }
      for (const r of ripples) {
        const age    = time - r.t;
        const radius = age * 240;
        const d      = Math.hypot(x - r.x, y - r.y) - radius;
        const fade   = Math.max(0, 1 - age / 1.6);
        l += 0.6 * fade * Math.exp(-(d*d) / (2*14*14));
      }
      return l;
    }

    /* ── Main draw ── */
    function draw() {
      ctx.clearRect(0, 0, w, h);
      const drawColor = getColor(opts);
      ctx.fillStyle = drawColor;

      const pr = revealStart < 0 ? 0 : Math.min(1, (time - revealStart) / REVEAL);
      if (pr === 0) return;
      const eased = 1 - Math.pow(1 - pr, 3);
      const reach = (Math.hypot(w, h) / 2 + 90) * eased;
      const cx = w / 2, cy = h / 2;

      function opened(x, y) {
        if (pr >= 1) return { m: 1, edge: 0 };
        const d = Math.hypot(x - cx, y - cy);
        const e = d - reach;
        return {
          m:    Math.min(1, Math.max(0, -e / 70)),
          edge: 0.6 * (1 - pr) * Math.exp(-(e*e) / (2*14*14)),
        };
      }

      const cell    = Math.max(4, opts.cellSize || 6);
      const coverage = Math.max(0.3, opts.coverage || 1.4);
      const density  = Math.max(0.2, opts.density  || 0.8);
      const speed    = opts.speed || 1;
      const floorOn  = !!opts.floor;
      const horizon  = floorOn ? h * 0.66 : h * 2;
      const t        = time * speed;
      const cols     = Math.ceil(w / cell);
      const rows     = Math.ceil(h / cell);

      const bodies = CLOUDS.map(c => ({
        x:  w * (0.5 + c.ax * Math.sin(t * c.fx + c.px)),
        y:  h * (0.5 + c.ay * Math.sin(t * c.fy + c.py)),
        r2: 2 * Math.pow(c.r * coverage * Math.max(w, h), 2),
      }));

      /* Cloud dots */
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = i * cell + cell / 2;
          const y = j * cell + cell / 2;
          const n   = fbm(x * 0.0062 + t * 0.045, y * 0.0062 - t * 0.03);
          let body  = 0;
          for (const b of bodies) {
            const dx = x - b.x, dy = y - b.y;
            body += Math.exp(-(dx*dx + dy*dy) / b.r2);
          }
          let v = band(0.3, 0.95, body * (0.45 + 0.9 * n) * density);
          v    *= 1 - 0.55 * band(horizon - 30, horizon + 30, y);
          v    *= 0.82 + 0.18 * Math.sin(t * 2.4 + phases[(j * cols + i) % PHASE_COUNT]);
          const o = opened(x, y);
          v = v * o.m + o.edge + light(x, y) * o.m;
          if (v < 0.04) continue;
          const th   = BAYER[(j & 3) * 4 + (i & 3)];
          const q    = Math.min(1, v + (th - 0.5) * 0.32);
          const step = STEPS[Math.min(STEPS.length - 1, Math.floor(q * STEPS.length))];
          if (!step) continue;
          ctx.globalAlpha = 0.3 + Math.min(1, v) * 0.7;
          dot(x, y, cell * step);
        }
      }

      /* Perspective floor */
      if (floorOn) {
        const near    = 1, depth = 9;
        const roll    = (t * 0.5) % 1;
        const spacing = cell * 3.2;
        const span    = Math.ceil(w / spacing) * 3;
        for (let k = depth; k >= 0; k--) {
          const z = near + (k - roll) * 0.8;
          if (z < near * 0.6) continue;
          const p  = near / z;
          const fy = horizon + (h - horizon) * p * 0.98;
          const fade = Math.pow(Math.min(1, p * 1.1), 1.6);
          for (let c = -span; c <= span; c++) {
            const fx = w / 2 + c * spacing * p;
            if (fx < -cell || fx > w + cell) continue;
            const shimmer = 0.8 + 0.2 * Math.sin(t * 2 + hash(c, k + 99) * 6.28);
            const o  = opened(fx, fy);
            const fv = (fade * 0.75 * shimmer + light(fx, fy) * p) * o.m;
            ctx.globalAlpha = Math.min(1, fv);
            dot(fx, fy, cell * 0.8 * p);
          }
        }
      }

      ctx.globalAlpha = 1;
    }

    /* ── RAF loop ── */
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!visible) return;
      time += dt;
      if (revealStart === -2) revealStart = time;

      const k = 1 - Math.pow(0.0015, dt);
      glow.x += (pointer.x - glow.x) * k;
      glow.y += (pointer.y - glow.y) * k;
      glow.a += ((pointer.on ? 1 : 0) - glow.a) * (1 - Math.pow(0.02, dt));

      idle = pointer.on ? 0 : idle + dt;
      if (idle > 3.2) {
        idle = 0;
        ripples.push({ x: w*(0.15 + Math.random()*0.7), y: h*(0.15 + Math.random()*0.45), t: time });
      }
      ripples = ripples
        .map(r => r.t < 0 ? { ...r, t: time } : r)
        .filter(r => time - r.t < 1.6);
      draw();
    }

    /* ── Pointer handlers ── */
    function getLocalXY(clientX, clientY) {
      if (isFixed) return { x: clientX, y: clientY };
      const r = el.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    }
    function onMove(e) {
      const p = getLocalXY(e.clientX, e.clientY);
      pointer.x = p.x; pointer.y = p.y; pointer.on = true;
    }
    function onLeave() { pointer.on = false; }
    function onDown(e) {
      const p = getLocalXY(e.clientX, e.clientY);
      ripples.push({ x: p.x, y: p.y, t: -1 });
    }

    if (opts.interactive !== false) {
      const target = isFixed ? window : el.parentElement || el;
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerleave', onLeave);
      target.addEventListener('pointerdown', onDown);
    }

    /* ── Resize ── */
    function onResize() { size(); }
    window.addEventListener('resize', onResize);

    /* ── Visibility (pause off-screen) ── */
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
    });
    io.observe(el);

    /* ── Theme change ── */
    function onThemeChange() { /* color re-read per frame via getColor() */ }
    window.addEventListener('rcsc-theme-change', onThemeChange);

    /* ── Start ── */
    size();
    raf = requestAnimationFrame(frame);

    return {
      destroy() {
        cancelAnimationFrame(raf);
        io.disconnect();
        window.removeEventListener('resize', onResize);
        window.removeEventListener('rcsc-theme-change', onThemeChange);
        if (opts.interactive !== false) {
          const target = isFixed ? window : el.parentElement || el;
          target.removeEventListener('pointermove', onMove);
          target.removeEventListener('pointerleave', onLeave);
          target.removeEventListener('pointerdown', onDown);
        }
        el.remove();
      },
    };
  }

  /* ══ Public API ═════════════════════════════════════════════════════════ */

  /**
   * Mount PixelBlast inside a container element (makes it position:relative).
   */
  function mount(container, opts) {
    opts = Object.assign({ color: 'auto', cellSize: 6, shape: 'square', speed: 1, coverage: 1.4, density: 0.8, floor: false, interactive: true }, opts);
    const cs = getComputedStyle(container);
    if (cs.position === 'static') container.style.position = 'relative';
    container.style.overflow = 'hidden';

    const el = document.createElement('canvas');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;';
    container.insertBefore(el, container.firstChild);

    const ctx = el.getContext('2d');
    return _mount(el, ctx, opts, false);
  }

  /**
   * Mount PixelBlast as a full-page fixed background (z-index: -1).
   */
  function mountFixed(opts) {
    opts = Object.assign({ color: 'auto', cellSize: 6, shape: 'square', speed: 1, coverage: 1.4, density: 0.8, floor: false, interactive: true }, opts);

    const el = document.createElement('canvas');
    el.setAttribute('aria-hidden', 'true');
    el.id = 'rcsc-pixelblast-canvas';
    el.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:-1;';
    document.body.insertBefore(el, document.body.firstChild);

    const ctx = el.getContext('2d');
    return _mount(el, ctx, opts, true);
  }

  window.PixelBlast = { mount, mountFixed };
})();

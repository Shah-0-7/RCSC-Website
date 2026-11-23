/**
 * ContourLines — vanilla JS port of the official Motion Brew component
 * Source: https://motion-brew.com/components/contour-lines
 * Ported from contour-lines.tsx (React/motion) to a plain JS mount() function.
 *
 * MIT License, Copyright (c) 2026 Md Eftakher.
 *
 * Usage:
 *   ContourLines.mount(element, { color, lines, scale, speed, lift, interactive })
 *   Returns { destroy() } to clean up.
 */
(function () {
  'use strict';

  const REVEAL = 1.5; // seconds for the lines to spread across the card
  const CELL = 10;    // px per marching squares cell

  // ── Noise (exact port from the .tsx source) ───────────────────────────────
  function hash(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  const smooth = t => t * t * (3 - 2 * t);
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smooth(x - ix), fy = smooth(y - iy);
    const a = hash(ix,     iy),     b = hash(ix + 1, iy);
    const c = hash(ix,     iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // ── Mount ─────────────────────────────────────────────────────────────────
  function mount(container, opts) {
    opts = Object.assign({ color: '#242423', lines: 14, scale: 1, speed: 1, lift: 1, interactive: true }, opts);

    // Ensure container is a positioned box
    const cs = getComputedStyle(container);
    if (cs.position === 'static') container.style.position = 'relative';
    container.style.overflow = 'hidden';

    // Canvas — behind all existing children
    const el = document.createElement('canvas');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;';
    container.insertBefore(el, container.firstChild);

    const ctx = el.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const still = reduced;

    let w = 0, h = 0, cols = 0, rows = 0;
    let field = new Float32Array(0);
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let time = 0;
    let idle = 0;

    // Reveal state: -1=not yet, -2=next frame start, N=clock when started
    let reveal = -1;

    // Glow (smoothed pointer position + alpha)
    const glow = { x: 0, y: 0, a: 0 };

    // Pointer ref
    const pointer = { x: -999, y: -999, on: false };

    // Waves: { x, y, t }   t<0 means "stamp on next frame"
    let waves = [];

    // ── Sizing ──────────────────────────────────────────────────────────────
    function size() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width  = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CELL) + 1;
      rows = Math.ceil(h / CELL) + 1;
      field = new Float32Array(cols * rows);
    }

    // ── Sample terrain ──────────────────────────────────────────────────────
    function sample() {
      const t = time * opts.speed;
      const z = 0.0045 / opts.scale;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = i * CELL, y = j * CELL;
          let v =
            noise(x * z + t * 0.04,       y * z - t * 0.025) * 0.65 +
            noise(x * z * 2.2 - t * 0.03, y * z * 2.2 + 3.1) * 0.35;
          if (glow.a > 0.01) {
            const dx = x - glow.x, dy = y - glow.y;
            v += glow.a * 0.28 * opts.lift * Math.exp(-(dx * dx + dy * dy) / (2 * 70 * 70));
          }
          for (const wv of waves) {
            const age = time - wv.t;
            const d = Math.hypot(x - wv.x, y - wv.y) - age * 220;
            v += 0.12 * Math.max(0, 1 - age / 1.8) * Math.exp(-(d * d) / (2 * 22 * 22));
          }
          field[j * cols + i] = v;
        }
      }
    }

    // ── Draw ────────────────────────────────────────────────────────────────
    function draw() {
      ctx.clearRect(0, 0, w, h);
      const pr = still
        ? 1
        : (reveal === -1 || reveal === -2)
          ? 0
          : Math.min(1, (time - reveal) / REVEAL);
      if (pr === 0) return;
      sample();

      const step = 1 / (opts.lines + 1);
      const path  = new Path2D();
      const major = new Path2D();

      const at = (i, j) => field[j * cols + i];

      for (let l = 1; l <= opts.lines; l++) {
        const lv = 0.14 + l * step * 0.78;
        const p = (l % 4 === 0) ? major : path;

        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols - 1; i++) {
            const a = at(i,     j);
            const b = at(i + 1, j);
            const c = at(i + 1, j + 1);
            const d = at(i,     j + 1);
            const k =
              (a > lv ? 8 : 0) |
              (b > lv ? 4 : 0) |
              (c > lv ? 2 : 0) |
              (d > lv ? 1 : 0);
            if (k === 0 || k === 15) continue;

            const x = i * CELL, y = j * CELL;
            const top    = () => [x + ((lv - a) / (b - a)) * CELL, y];
            const right  = () => [x + CELL, y + ((lv - b) / (c - b)) * CELL];
            const bottom = () => [x + ((lv - d) / (c - d)) * CELL, y + CELL];
            const left   = () => [x, y + ((lv - a) / (d - a)) * CELL];

            const seg = (p1, p2) => { p.moveTo(p1[0], p1[1]); p.lineTo(p2[0], p2[1]); };

            switch (k) {
              case 1: case 14: seg(left(),   bottom()); break;
              case 2: case 13: seg(bottom(),  right());  break;
              case 3: case 12: seg(left(),    right());  break;
              case 4: case 11: seg(top(),     right());  break;
              case 5:  seg(left(), top()); seg(bottom(), right()); break;
              case 6: case 9:  seg(top(),    bottom()); break;
              case 7: case 8:  seg(left(),   top());    break;
              case 10: seg(left(), bottom()); seg(top(), right()); break;
            }
          }
        }
      }

      // Circular clip for entrance reveal
      ctx.save();
      if (pr < 1) {
        const e = 1 - Math.pow(1 - pr, 3);
        const reach = (Math.hypot(w, h) / 2 + 40) * e;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.max(0.1, reach), 0, Math.PI * 2);
        ctx.clip();
      }

      ctx.lineCap = 'round';
      ctx.strokeStyle = opts.color;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 1;
      ctx.stroke(path);
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1.4;
      ctx.stroke(major);

      // Pointer glow
      if (glow.a > 0.01) {
        const g = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, 150);
        g.addColorStop(0, opts.color);
        g.addColorStop(1, 'transparent');
        ctx.strokeStyle = g;
        ctx.globalAlpha = 0.6 * glow.a;
        ctx.lineWidth = 1.2;
        ctx.stroke(path);
        ctx.stroke(major);
      }

      ctx.restore();
    }

    // ── RAF loop ─────────────────────────────────────────────────────────────
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!visible) return;
      time += dt;
      if (reveal === -2) reveal = time;

      const k = 1 - Math.pow(0.002, dt);
      glow.x += (pointer.x - glow.x) * k;
      glow.y += (pointer.y - glow.y) * k;
      glow.a += ((pointer.on ? 1 : 0) - glow.a) * (1 - Math.pow(0.03, dt));

      idle = pointer.on ? 0 : idle + dt;
      if (idle > 3.6) {
        idle = 0;
        waves.push({
          x: w * (0.15 + Math.random() * 0.7),
          y: h * (0.15 + Math.random() * 0.5),
          t: time,
        });
      }

      // Stamp waves that were queued before the clock started
      waves = waves
        .map(wv => (wv.t < 0 ? { ...wv, t: time } : wv))
        .filter(wv => time - wv.t < 1.8);

      draw();
    }

    // ── Pointer events ───────────────────────────────────────────────────────
    function localCoords(e) {
      const r = container.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onMove(e) {
      const p = localCoords(e);
      pointer.x = p.x; pointer.y = p.y; pointer.on = true;
    }
    function onLeave() { pointer.on = false; }
    function onDown(e) {
      const p = localCoords(e);
      waves.push({ x: p.x, y: p.y, t: -1 });
    }

    if (opts.interactive) {
      container.addEventListener('pointermove',  onMove);
      container.addEventListener('pointerleave', onLeave);
      container.addEventListener('pointerdown',  onDown);
    }

    // ── Observers ────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      size();
      if (still) draw();
    });
    ro.observe(el);

    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      // Trigger reveal on first becoming visible
      if (visible && reveal === -1) reveal = -2;
    });
    io.observe(el);

    // ── Start ────────────────────────────────────────────────────────────────
    size();
    if (still) {
      time = 4;
      reveal = 0; // show immediately for reduced motion
      draw();
    } else {
      reveal = -2; // start reveal on next frame
      raf = requestAnimationFrame(frame);
    }

    return {
      destroy() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        if (opts.interactive) {
          container.removeEventListener('pointermove',  onMove);
          container.removeEventListener('pointerleave', onLeave);
          container.removeEventListener('pointerdown',  onDown);
        }
        el.remove();
      }
    };
  }

  window.ContourLines = { mount };
})();

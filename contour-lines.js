/**
 * ContourLines — vanilla JS Web Component
 * Matches the Motion Brew "contour-lines" component spec:
 *  - Topographic contour map on a 2D canvas behind slotted children
 *  - 2 octaves of drifting value noise, sampled on a 10px grid
 *  - ~12 contour levels traced with marching squares into Path2D objects
 *  - Every 4th level is an "index" contour (heavier stroke)
 *  - Pointer raises a gaussian hill → lines bend and crowd near it
 *  - Radial gradient stroke lights lines near the pointer
 *  - Pointer press fires a ring-shaped wave through the terrain
 *  - Auto-wave every few seconds when pointer is away
 *  - Intro: lines spread from centre behind a growing circular clip
 *  - Animation pauses when off-screen (IntersectionObserver)
 *  - Canvas size from layout (ResizeObserver), not CSS transform box
 *  - prefers-reduced-motion → draws one still frame only
 *
 * Usage (HTML):
 *   <contour-lines class="h-480 rounded-3xl bg-white">
 *     <h2>Some content</h2>
 *   </contour-lines>
 *
 * Or as a plain <div> wrapper via ContourLines.mount(element, options)
 */

(function () {
  'use strict';

  // ─────────────────────────── NOISE ───────────────────────────────────────
  // Deterministic pseudo-random permutation table (256-entry)
  const P = new Uint8Array(512);
  (function buildPerm() {
    const src = new Uint8Array(256).map((_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [src[i], src[j]] = [src[j], src[i]];
    }
    for (let i = 0; i < 512; i++) P[i] = src[i & 255];
  })();

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Value noise (simpler than Perlin but sufficient)
  function vnoise(x, y) {
    const ix = Math.floor(x) & 255, iy = Math.floor(y) & 255;
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    const u = fade(fx), v = fade(fy);
    const a = (P[ix] + iy) & 255,
      b = (P[ix + 1] + iy) & 255;
    const v00 = (P[a] & 255) / 255,
      v10 = (P[b] & 255) / 255,
      v01 = (P[a + 1] & 255) / 255,
      v11 = (P[b + 1] & 255) / 255;
    return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  }

  function fbm(x, y, octaves = 2) {
    let v = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      v += vnoise(x * freq, y * freq) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return v / max;
  }

  // ────────────────────── MARCHING SQUARES ─────────────────────────────────
  // Returns a Path2D for all edges at `level` in the scalar field grid.
  // grid: Float32Array, cols × rows, cell size `step`
  function marchingSquares(grid, cols, rows, step, level) {
    const path = new Path2D();
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const tl = grid[r * cols + c];
        const tr = grid[r * cols + c + 1];
        const bl = grid[(r + 1) * cols + c];
        const br = grid[(r + 1) * cols + c + 1];
        const x = c * step, y = r * step;

        const a = +(tl >= level), b = +(tr >= level),
          d = +(bl >= level), e = +(br >= level);
        const idx = (a << 3) | (b << 2) | (e << 1) | d;

        if (idx === 0 || idx === 15) continue;

        // Interpolated edge midpoints
        const top = x + step * (level - tl) / (tr - tl || 1e-9);
        const bot = x + step * (level - bl) / (br - bl || 1e-9);
        const lft = y + step * (level - tl) / (bl - tl || 1e-9);
        const rgt = y + step * (level - tr) / (br - tr || 1e-9);

        const addLine = (x1, y1, x2, y2) => {
          path.moveTo(x1, y1);
          path.lineTo(x2, y2);
        };

        switch (idx) {
          case 1:  case 14: addLine(x,       lft, top, y); break;
          case 2:  case 13: addLine(x + step,rgt, top, y); break;
          case 3:  case 12: addLine(x,       lft, x + step, rgt); break;
          case 4:  case 11: addLine(bot, y + step, x + step, rgt); break;
          case 5:
            addLine(x, lft, top, y);
            addLine(bot, y + step, x + step, rgt); break;
          case 6:  case 9:  addLine(top, y, bot, y + step); break;
          case 7:  case 8:  addLine(x, lft, bot, y + step); break;
          case 10:
            addLine(x, lft, top, y);
            addLine(bot, y + step, x + step, rgt); break;
        }
      }
    }
    return path;
  }

  // ─────────────────────── CONTOUR RENDERER ────────────────────────────────
  class ContourRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = 1; this.h = 1;

      this.t = 0;                     // animation time
      this.mouse = { x: -9999, y: -9999, active: false };
      this.wave = { active: false, x: 0, y: 0, r: 0, maxR: 0, speed: 0 };
      this.introProgress = 0;         // 0→1 during intro
      this.introActive = true;
      this.autoWaveTimer = 0;
      this.raf = null;
      this.paused = false;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.STEP = 10;
      this.LEVELS = 14;

      this._bindPointer();
    }

    resize(w, h) {
      this.w = w; this.h = h;
      this.canvas.width = w;
      this.canvas.height = h;
      if (!this.raf) this._tick(performance.now());
    }

    _bindPointer() {
      const el = this.canvas.parentElement;
      if (!el) return;

      el.addEventListener('pointermove', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
        this.mouse.active = true;
      });
      el.addEventListener('pointerleave', () => {
        this.mouse.active = false;
      });
      el.addEventListener('pointerdown', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this._fireWave(e.clientX - rect.left, e.clientY - rect.top);
      });
    }

    _fireWave(x, y) {
      this.wave.active = true;
      this.wave.x = x; this.wave.y = y;
      this.wave.r = 0;
      this.wave.maxR = Math.hypot(this.w, this.h);
      this.wave.speed = this.wave.maxR / 1.4; // px per second
    }

    _buildField(dt) {
      this.t += dt * 0.08;
      const { w, h, STEP, t } = this;
      const cols = Math.ceil(w / STEP) + 2;
      const rows = Math.ceil(h / STEP) + 2;
      const grid = new Float32Array(cols * rows);

      // Wave ring influence
      let wave = null;
      if (this.wave.active) {
        this.wave.r += this.wave.speed * dt;
        if (this.wave.r > this.wave.maxR) this.wave.active = false;
        else wave = this.wave;
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = c * STEP, wy = r * STEP;

          // Base noise
          let v = fbm(wx * 0.004 + t, wy * 0.004 + t * 0.6);

          // Gaussian hill at pointer
          if (this.mouse.active) {
            const dx = wx - this.mouse.x, dy = wy - this.mouse.y;
            const dist2 = dx * dx + dy * dy;
            const sigma2 = 90 * 90;
            v += 0.35 * Math.exp(-dist2 / (2 * sigma2));
          }

          // Ring wave
          if (wave) {
            const dx = wx - wave.x, dy = wy - wave.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const diff = d - wave.r;
            const bandwidth = 40;
            if (Math.abs(diff) < bandwidth) {
              const env = 1 - Math.abs(diff) / bandwidth;
              v += 0.22 * env * Math.exp(-diff * diff / (2 * 15 * 15));
            }
          }

          grid[r * cols + c] = Math.min(1, Math.max(0, v));
        }
      }
      return grid;
    }

    _draw(now) {
      const { ctx, w, h, STEP, LEVELS } = this;
      ctx.clearRect(0, 0, w, h);

      // Intro circular clip
      if (this.introActive) {
        const maxR = Math.hypot(w / 2, h / 2) * 1.05;
        const r = this.introProgress * maxR;
        ctx.save();
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
        ctx.clip();
      }

      const cols = Math.ceil(w / STEP) + 2;
      const rows = Math.ceil(h / STEP) + 2;

      // Build contour paths — this.field is the raw Float32Array from _buildField
      const paths = [];
      for (let i = 0; i < LEVELS; i++) {
        const level = (i + 1) / (LEVELS + 1);
        paths.push({ path: marchingSquares(this.field, cols, rows, STEP, level), index: i });
      }

      // Radial gradient for pointer lighting
      let radGrad = null;
      if (this.mouse.active) {
        radGrad = ctx.createRadialGradient(
          this.mouse.x, this.mouse.y, 0,
          this.mouse.x, this.mouse.y, 150
        );
        radGrad.addColorStop(0, 'rgba(99,120,255,0.95)');
        radGrad.addColorStop(0.5, 'rgba(80,100,220,0.5)');
        radGrad.addColorStop(1, 'rgba(80,100,200,0)');
      }

      for (const { path, index } of paths) {
        const isIndex = index % 4 === 3; // every 4th level is heavier

        ctx.save();
        if (radGrad) {
          // Composite: draw grey first, then coloured on top via source-atop trick
          ctx.strokeStyle = 'rgba(60,80,120,0.22)';
          ctx.lineWidth = isIndex ? 1.6 : 0.8;
          ctx.stroke(path);

          ctx.strokeStyle = radGrad;
          ctx.lineWidth = isIndex ? 2.0 : 1.0;
          ctx.globalAlpha = 0.9;
          ctx.stroke(path);
        } else {
          ctx.strokeStyle = isIndex
            ? 'rgba(50,70,110,0.32)'
            : 'rgba(60,85,130,0.18)';
          ctx.lineWidth = isIndex ? 1.5 : 0.75;
          ctx.stroke(path);
        }
        ctx.restore();
      }

      if (this.introActive) ctx.restore();
    }

    _tick(now) {
      if (this.paused) { this.raf = null; return; }
      const dt = Math.min((now - (this._lastNow || now)) / 1000, 0.1);
      this._lastNow = now;

      // Intro
      if (this.introActive) {
        this.introProgress = Math.min(1, this.introProgress + dt * 0.9);
        if (this.introProgress >= 1) this.introActive = false;
      }

      // Auto-wave
      if (!this.mouse.active && !this.wave.active) {
        this.autoWaveTimer += dt;
        if (this.autoWaveTimer > 5) {
          this.autoWaveTimer = 0;
          this._fireWave(
            this.w * (0.2 + Math.random() * 0.6),
            this.h * (0.2 + Math.random() * 0.6)
          );
        }
      } else {
        this.autoWaveTimer = 0;
      }

      this.field = this._buildField(dt);
      this._draw(now);

      if (this.reducedMotion) {
        this.raf = null;
        return;
      }
      this.raf = requestAnimationFrame(ts => this._tick(ts));
    }

    start() {
      if (this.raf) return;
      this._lastNow = null;
      this.raf = requestAnimationFrame(ts => this._tick(ts));
    }

    stop() {
      this.paused = true;
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    }

    resume() {
      this.paused = false;
      this.start();
    }
  }

  // ─────────────── MOUNT FUNCTION (non-web-component usage) ────────────────
  function mount(container, options = {}) {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';

    // Ensure container is relatively positioned for canvas overlay
    const cs = getComputedStyle(container);
    if (cs.position === 'static') container.style.position = 'relative';

    // Insert canvas as first child (behind other content)
    container.insertBefore(canvas, container.firstChild);

    const renderer = new ContourRenderer(canvas);

    // ResizeObserver — size canvas from layout box
    const ro = new ResizeObserver(entries => {
      const { contentRect } = entries[0];
      renderer.resize(Math.round(contentRect.width), Math.round(contentRect.height));
    });
    ro.observe(container);

    // IntersectionObserver — pause off-screen
    const io = new IntersectionObserver(entries => {
      entries[0].isIntersecting ? renderer.resume() : renderer.stop();
    }, { threshold: 0.01 });
    io.observe(container);

    // Initial size
    const rect = container.getBoundingClientRect();
    if (rect.width > 0) renderer.resize(rect.width, rect.height);
    renderer.start();

    return {
      destroy() {
        renderer.stop();
        ro.disconnect();
        io.disconnect();
        canvas.remove();
      }
    };
  }

  // ──────────────────────── WEB COMPONENT ──────────────────────────────────
  class ContourLinesElement extends HTMLElement {
    constructor() {
      super();
      // Shadow DOM with a slot so children render on top
      const shadow = this.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host {
            display: block;
            position: relative;
            overflow: hidden;
          }
          canvas {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            display: block;
          }
          .content {
            position: relative;
            z-index: 1;
            width: 100%;
            height: 100%;
          }
        </style>
        <canvas></canvas>
        <div class="content"><slot></slot></div>
      `;
      this._canvas = shadow.querySelector('canvas');
      this._renderer = null;
    }

    connectedCallback() {
      this._renderer = new ContourRenderer(this._canvas);

      this._ro = new ResizeObserver(entries => {
        const { contentRect } = entries[0];
        this._renderer.resize(Math.round(contentRect.width), Math.round(contentRect.height));
      });
      this._ro.observe(this);

      this._io = new IntersectionObserver(entries => {
        entries[0].isIntersecting ? this._renderer.resume() : this._renderer.stop();
      }, { threshold: 0.01 });
      this._io.observe(this);

      // Pointer events on the host element (not shadow canvas)
      this._onMove = (e) => {
        const rect = this._canvas.getBoundingClientRect();
        this._renderer.mouse.x = e.clientX - rect.left;
        this._renderer.mouse.y = e.clientY - rect.top;
        this._renderer.mouse.active = true;
      };
      this._onLeave = () => { this._renderer.mouse.active = false; };
      this._onDown = (e) => {
        const rect = this._canvas.getBoundingClientRect();
        this._renderer._fireWave(e.clientX - rect.left, e.clientY - rect.top);
      };
      this.addEventListener('pointermove', this._onMove);
      this.addEventListener('pointerleave', this._onLeave);
      this.addEventListener('pointerdown', this._onDown);

      const rect = this.getBoundingClientRect();
      if (rect.width > 0) this._renderer.resize(rect.width, rect.height);
      this._renderer.start();
    }

    disconnectedCallback() {
      if (this._renderer) this._renderer.stop();
      if (this._ro) this._ro.disconnect();
      if (this._io) this._io.disconnect();
      this.removeEventListener('pointermove', this._onMove);
      this.removeEventListener('pointerleave', this._onLeave);
      this.removeEventListener('pointerdown', this._onDown);
    }
  }

  customElements.define('contour-lines', ContourLinesElement);

  // Expose mount for non-web-component usage
  window.ContourLines = { mount };

})();

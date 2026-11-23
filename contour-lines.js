/**
 * ContourLines — vanilla JS Web Component + mount() helper
 * Full Motion Brew spec implementation — no Shadow DOM (better compatibility).
 *
 * Usage as custom element (register once via script tag):
 *   <contour-lines style="position:absolute;inset:0;width:100%;height:100%"></contour-lines>
 *
 * Usage via JS API:
 *   ContourLines.mount(document.getElementById('my-div'));
 */
(function () {
  'use strict';

  // ─────────────────────────── NOISE ───────────────────────────────────────
  const P = new Uint8Array(512);
  (function buildPerm() {
    const src = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [src[i], src[j]] = [src[j], src[i]];
    }
    for (let i = 0; i < 512; i++) P[i] = src[i & 255];
  })();

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function vnoise(x, y) {
    const ix = Math.floor(x) & 255, iy = Math.floor(y) & 255;
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    const u = fade(fx), v = fade(fy);
    const a = (P[ix] + iy) & 255, b = (P[ix + 1] + iy) & 255;
    const v00 = (P[a] & 255) / 255, v10 = (P[b] & 255) / 255;
    const v01 = (P[(a + 1) & 255] & 255) / 255, v11 = (P[(b + 1) & 255] & 255) / 255;
    return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  }

  function fbm(x, y) {
    return (vnoise(x, y) + 0.5 * vnoise(x * 2, y * 2)) / 1.5;
  }

  // ────────────────────── MARCHING SQUARES ─────────────────────────────────
  function marchingSquares(grid, cols, rows, step, level) {
    const path = new Path2D();
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const tl = grid[r * cols + c];
        const tr = grid[r * cols + c + 1];
        const bl = grid[(r + 1) * cols + c];
        const br = grid[(r + 1) * cols + c + 1];

        const a = +(tl >= level), b = +(tr >= level);
        const d = +(bl >= level), e = +(br >= level);
        const idx = (a << 3) | (b << 2) | (e << 1) | d;

        if (idx === 0 || idx === 15) continue;

        const x = c * step, y = r * step;
        // Interpolated edge positions
        const top = x + step * (level - tl) / (tr - tl || 1e-9);
        const bot = x + step * (level - bl) / (br - bl || 1e-9);
        const lft = y + step * (level - tl) / (bl - tl || 1e-9);
        const rgt = y + step * (level - tr) / (br - tr || 1e-9);

        const L = (x1, y1, x2, y2) => { path.moveTo(x1, y1); path.lineTo(x2, y2); };

        switch (idx) {
          case 1: case 14: L(x, lft, top, y); break;
          case 2: case 13: L(x + step, rgt, top, y); break;
          case 3: case 12: L(x, lft, x + step, rgt); break;
          case 4: case 11: L(bot, y + step, x + step, rgt); break;
          case 5:
            L(x, lft, top, y);
            L(bot, y + step, x + step, rgt); break;
          case 6: case 9: L(top, y, bot, y + step); break;
          case 7: case 8: L(x, lft, bot, y + step); break;
          case 10:
            L(x + step, rgt, top, y);
            L(x, lft, bot, y + step); break;
        }
      }
    }
    return path;
  }

  // ─────────────────────── CONTOUR ENGINE ──────────────────────────────────
  class ContourEngine {
    constructor(canvas, host) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.host = host;   // element to listen for pointer events
      this.w = 1; this.h = 1;

      this.t = 0;
      this.mouse = { x: -9999, y: -9999, active: false };
      this.wave = { active: false, x: 0, y: 0, r: 0, maxR: 0, speed: 0 };
      this.introProgress = 0;
      this.introActive = true;
      this.autoWaveTimer = 0;
      this.raf = null;
      this.paused = false;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.STEP = 10;
      this.LEVELS = 14;
      this.field = null;
      this._lastNow = null;

      this._onMove = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
        this.mouse.active = true;
      };
      this._onLeave = () => { this.mouse.active = false; };
      this._onDown = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this._fireWave(e.clientX - rect.left, e.clientY - rect.top);
      };

      host.addEventListener('pointermove', this._onMove);
      host.addEventListener('pointerleave', this._onLeave);
      host.addEventListener('pointerdown', this._onDown);
    }

    destroy() {
      this.stop();
      this.host.removeEventListener('pointermove', this._onMove);
      this.host.removeEventListener('pointerleave', this._onLeave);
      this.host.removeEventListener('pointerdown', this._onDown);
    }

    resize(w, h) {
      this.w = w; this.h = h;
      this.canvas.width = w;
      this.canvas.height = h;
    }

    _fireWave(x, y) {
      this.wave.active = true;
      this.wave.x = x; this.wave.y = y;
      this.wave.r = 0;
      this.wave.maxR = Math.hypot(this.w, this.h);
      this.wave.speed = this.wave.maxR / 1.4;
    }

    _buildField(dt) {
      this.t += dt * 0.08;
      const { w, h, STEP, t } = this;
      const cols = Math.ceil(w / STEP) + 2;
      const rows = Math.ceil(h / STEP) + 2;
      const grid = new Float32Array(cols * rows);

      let wave = null;
      if (this.wave.active) {
        this.wave.r += this.wave.speed * dt;
        if (this.wave.r > this.wave.maxR) this.wave.active = false;
        else wave = this.wave;
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = c * STEP, wy = r * STEP;
          let v = fbm(wx * 0.004 + t, wy * 0.004 + t * 0.6);

          if (this.mouse.active) {
            const dx = wx - this.mouse.x, dy = wy - this.mouse.y;
            v += 0.35 * Math.exp(-(dx * dx + dy * dy) / (2 * 90 * 90));
          }

          if (wave) {
            const dx = wx - wave.x, dy = wy - wave.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const diff = d - wave.r;
            if (Math.abs(diff) < 40) {
              const env = 1 - Math.abs(diff) / 40;
              v += 0.22 * env * Math.exp(-diff * diff / 450);
            }
          }

          grid[r * cols + c] = Math.min(1, Math.max(0, v));
        }
      }
      return grid;
    }

    _draw() {
      const { ctx, w, h, STEP, LEVELS } = this;
      ctx.clearRect(0, 0, w, h);

      if (this.introActive) {
        const maxR = Math.hypot(w / 2, h / 2) * 1.05;
        ctx.save();
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, this.introProgress * maxR, 0, Math.PI * 2);
        ctx.clip();
      }

      const cols = Math.ceil(w / STEP) + 2;
      const rows = Math.ceil(h / STEP) + 2;

      let radGrad = null;
      if (this.mouse.active) {
        radGrad = ctx.createRadialGradient(
          this.mouse.x, this.mouse.y, 0,
          this.mouse.x, this.mouse.y, 150
        );
        radGrad.addColorStop(0, 'rgba(80,120,255,0.95)');
        radGrad.addColorStop(0.5, 'rgba(80,100,220,0.5)');
        radGrad.addColorStop(1, 'rgba(80,100,200,0)');
      }

      for (let i = 0; i < LEVELS; i++) {
        const level = (i + 1) / (LEVELS + 1);
        const isIndex = i % 4 === 3;
        const path = marchingSquares(this.field, cols, rows, STEP, level);

        ctx.save();
        if (radGrad) {
          ctx.strokeStyle = 'rgba(60,80,120,0.2)';
          ctx.lineWidth = isIndex ? 1.5 : 0.75;
          ctx.stroke(path);
          ctx.strokeStyle = radGrad;
          ctx.lineWidth = isIndex ? 2.0 : 1.0;
          ctx.globalAlpha = 0.9;
          ctx.stroke(path);
        } else {
          ctx.strokeStyle = isIndex ? 'rgba(50,70,110,0.30)' : 'rgba(60,85,130,0.16)';
          ctx.lineWidth = isIndex ? 1.5 : 0.75;
          ctx.stroke(path);
        }
        ctx.restore();
      }

      if (this.introActive) ctx.restore();
    }

    _tick(now) {
      if (this.paused) { this.raf = null; return; }
      const dt = Math.min(((this._lastNow != null) ? (now - this._lastNow) : 16) / 1000, 0.1);
      this._lastNow = now;

      if (this.introActive) {
        this.introProgress = Math.min(1, this.introProgress + dt * 0.9);
        if (this.introProgress >= 1) this.introActive = false;
      }

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
      this._draw();

      if (this.reducedMotion) { this.raf = null; return; }
      this.raf = requestAnimationFrame(ts => this._tick(ts));
    }

    start() {
      if (this.raf) return;
      this.paused = false;
      this.raf = requestAnimationFrame(ts => this._tick(ts));
    }

    stop() {
      this.paused = true;
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    }

    resume() {
      if (this.paused) { this.paused = false; this.start(); }
    }
  }

  // ─────────────── MOUNT FUNCTION ──────────────────────────────────────────
  // Inserts a canvas into `container` as the background.
  // The container must be position:relative (or absolute/fixed) and have a size.
  function mount(container, options = {}) {
    const cs = getComputedStyle(container);
    if (cs.position === 'static') container.style.position = 'relative';

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;';
    container.insertBefore(canvas, container.firstChild);

    // The host for pointer events is the container itself
    const engine = new ContourEngine(canvas, container);

    const ro = new ResizeObserver(entries => {
      const cr = entries[0].contentRect;
      const w = Math.round(cr.width), h = Math.round(cr.height);
      if (w > 0 && h > 0) { engine.resize(w, h); }
    });
    ro.observe(container);

    const io = new IntersectionObserver(entries => {
      entries[0].isIntersecting ? engine.resume() : engine.stop();
    }, { threshold: 0.01 });
    io.observe(container);

    // Kick off with current size
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) engine.resize(rect.width, rect.height);
    engine.start();

    return {
      destroy() {
        engine.destroy();
        ro.disconnect();
        io.disconnect();
        canvas.remove();
      }
    };
  }

  // ──────────────────────── WEB COMPONENT ──────────────────────────────────
  // No Shadow DOM — the host IS the container. Children are slotted via
  // normal DOM order (canvas inserted as firstChild, existing children follow).
  if (!customElements.get('contour-lines')) {
    class ContourLinesElement extends HTMLElement {
      connectedCallback() {
        // Apply host styles needed for canvas overlay
        if (!this.style.position || this.style.position === 'static') {
          this.style.position = 'relative';
        }
        this.style.overflow = 'hidden';
        this.style.display = this.style.display || 'block';

        // Create canvas overlay
        this._canvas = document.createElement('canvas');
        this._canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;';
        this.insertBefore(this._canvas, this.firstChild);

        // Bump existing children above canvas
        for (const child of this.children) {
          if (child !== this._canvas && !child.style.zIndex) {
            child.style.position = child.style.position || 'relative';
            child.style.zIndex = '1';
          }
        }

        this._engine = new ContourEngine(this._canvas, this);

        this._ro = new ResizeObserver(entries => {
          const cr = entries[0].contentRect;
          const w = Math.round(cr.width), h = Math.round(cr.height);
          if (w > 0 && h > 0) this._engine.resize(w, h);
        });
        this._ro.observe(this);

        this._io = new IntersectionObserver(entries => {
          entries[0].isIntersecting ? this._engine.resume() : this._engine.stop();
        }, { threshold: 0.01 });
        this._io.observe(this);

        const rect = this.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) this._engine.resize(rect.width, rect.height);
        this._engine.start();
      }

      disconnectedCallback() {
        if (this._engine) this._engine.destroy();
        if (this._ro) this._ro.disconnect();
        if (this._io) this._io.disconnect();
        if (this._canvas) this._canvas.remove();
      }
    }

    customElements.define('contour-lines', ContourLinesElement);
  }

  // Expose mount API
  window.ContourLines = { mount };

})();

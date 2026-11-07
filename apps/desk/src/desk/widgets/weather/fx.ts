/**
 * Weather widget animations: one small canvas behind the card's text, drawn
 * with Canvas 2D. Scenes: sun, moon (clear night), partly, cloud, rain, storm,
 * snow, fog. Runs only while the tab is visible, caps the pixel ratio at 2 and
 * draws a single still frame when the person asks for reduced motion.
 *
 * Colours here are computed per frame (alpha varies), so they live in code.
 */

export type FxKind = 'sun' | 'moon' | 'partly' | 'cloud' | 'rain' | 'storm' | 'snow' | 'fog';

type G = CanvasRenderingContext2D;
type Segment = [number, number, number, number, number];

interface Scene {
  draw(g: G, dt: number, t: number): void;
  onStrike?: (bolt: boolean) => void;
}

const R = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = 7; // the prototype's full-circle shorthand (> 2π)

// ── sprites, made once ──────────────────────────────────────────────────────

function sprite(w: number, h: number, draw: (g: G, w: number, h: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g, w, h);
  return c;
}

interface Sprites {
  drop: HTMLCanvasElement;
  flake: HTMLCanvasElement;
  clouds: HTMLCanvasElement[];
  fog: HTMLCanvasElement;
}

let cached: Sprites | null = null;

function cloudSprite(seed: number): HTMLCanvasElement {
  return sprite(300, 180, (g, w, h) => {
    let s = seed;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const puffs: [number, number, number][] = [
      [0.24, 0.62, 0.24],
      [0.4, 0.5, 0.3],
      [0.6, 0.47, 0.28],
      [0.76, 0.6, 0.22],
      [0.5, 0.64, 0.26],
      [0.32, 0.68, 0.2],
      [0.68, 0.68, 0.2],
    ];
    for (const [px, py, pr] of puffs) {
      const x = px * w + (rnd() - 0.5) * 12;
      const y = py * h + (rnd() - 0.5) * 8;
      const r = pr * w * 0.5 * (0.9 + rnd() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,.95)');
      gr.addColorStop(0.55, 'rgba(255,255,255,.8)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  });
}

function sprites(): Sprites {
  if (cached) return cached;
  // A water drop stuck to glass: dark rim below, bright edge, small highlight.
  const drop = sprite(64, 64, (g) => {
    const c = 32;
    const r = 26;
    g.fillStyle = 'rgba(0,10,20,.28)';
    g.beginPath();
    g.arc(c, c + 3, r, 0, TAU);
    g.fill();
    const b = g.createRadialGradient(c - 6, c - 8, 2, c, c, r);
    b.addColorStop(0, 'rgba(255,255,255,.04)');
    b.addColorStop(0.7, 'rgba(200,230,255,.10)');
    b.addColorStop(1, 'rgba(220,240,255,.42)');
    g.fillStyle = b;
    g.beginPath();
    g.arc(c, c, r, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(c, c, r - 3, 0.25 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.beginPath();
    g.ellipse(c - 9, c - 10, 6, 4.5, -0.6, 0, TAU);
    g.fill();
  });
  const flake = sprite(32, 32, (g) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.45, 'rgba(255,255,255,.85)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
  });
  const fog = sprite(420, 90, (g, w, h) => {
    g.save();
    g.scale(w / h, 1);
    const c = h / 2;
    const r = g.createRadialGradient(c, c, 0, c, c, c);
    r.addColorStop(0, 'rgba(255,255,255,.9)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, h, h);
    g.restore();
  });
  cached = { drop, flake, fog, clouds: [cloudSprite(3), cloudSprite(11), cloudSprite(27)] };
  return cached;
}

// ── scene parts ─────────────────────────────────────────────────────────────

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  f: number;
  p: number;
}

function stars(W: number, H: number, n: number): Star[] {
  return Array.from({ length: n }, () => ({
    x: R(0, W),
    y: R(0, H * 0.75),
    r: R(0.35, 1.25),
    a: R(0.3, 0.9),
    f: R(0.6, 2.2),
    p: R(0, 7),
  }));
}

function drawStars(g: G, S: Star[], t: number, k = 1) {
  for (const s of S) {
    g.globalAlpha = k * s.a * (0.55 + 0.45 * Math.sin(t * s.f + s.p));
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(s.x, s.y, s.r, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

interface Cloud {
  x: number;
  y: number;
  s: number;
  v: number;
  a: number;
  img: HTMLCanvasElement;
}

interface CloudOpts {
  y0: number;
  y1: number;
  s0: number;
  s1: number;
  v0: number;
  v1: number;
  a0: number;
  a1: number;
}

function makeClouds(W: number, n: number, o: CloudOpts): Cloud[] {
  const imgs = sprites().clouds;
  return Array.from({ length: n }, (_, i) => ({
    x: R(-80, W),
    y: R(o.y0, o.y1),
    s: R(o.s0, o.s1),
    v: R(o.v0, o.v1),
    a: R(o.a0, o.a1),
    img: imgs[i % 3] as HTMLCanvasElement,
  }));
}

function drawClouds(g: G, C: Cloud[], W: number, dt: number) {
  for (const c of C) {
    c.x += c.v * dt;
    const w = 300 * c.s;
    if (c.x > W + 20) c.x = -w - R(0, 60);
    g.globalAlpha = c.a;
    g.drawImage(c.img, c.x, c.y, w, 180 * c.s);
  }
  g.globalAlpha = 1;
}

interface Drop {
  x: number;
  y: number;
  r: number;
  o: number;
  v: number;
  trail?: number;
}

/** Drops on the glass, some of which slide down. */
function glass(W: number, H: number, n: number) {
  const D: Drop[] = [];
  const add = (fade: boolean) =>
    D.push({ x: R(0, W), y: R(0, H), r: Math.random() < 0.2 ? R(2.4, 5) : R(0.7, 2.2), o: fade ? 0 : 1, v: 0 });
  for (let i = 0; i < n; i++) add(false);
  let next = R(0.6, 1.8);
  const { drop } = sprites();
  return {
    step(dt: number) {
      for (const d of D) if (d.o < 1) d.o = Math.min(1, d.o + dt * 1.5);
      if ((next -= dt) <= 0) {
        next = R(0.7, 2);
        const big = D.filter((d) => d.r > 2.6 && !d.v);
        if (big.length) {
          const d = big[(Math.random() * big.length) | 0] as Drop;
          d.v = R(30, 60);
          d.trail = 0;
        }
      }
      for (let i = D.length - 1; i >= 0; i--) {
        const d = D[i] as Drop;
        if (!d.v) continue;
        d.v += R(-40, 60) * dt;
        d.v = Math.max(8, Math.min(130, d.v));
        const dy = d.v * dt;
        d.y += dy;
        d.x += R(-0.3, 0.3);
        d.trail = (d.trail ?? 0) + dy;
        if (d.trail > 9) {
          d.trail = 0;
          D.push({ x: d.x + R(-0.5, 0.5), y: d.y - d.r - 2, r: R(0.5, 1), o: 1, v: 0 });
          d.r = Math.max(1.8, d.r - 0.12);
        }
        for (let j = D.length - 1; j >= 0; j--) {
          const e = D[j] as Drop;
          if (e !== d && !e.v && Math.abs(e.x - d.x) < d.r + e.r && Math.abs(e.y - d.y) < d.r + e.r && e.r < d.r) {
            d.r = Math.min(5, Math.hypot(d.r, e.r));
            D.splice(j, 1);
            if (j < i) i--;
          }
        }
        if (d.y > H + 10) D.splice(i, 1);
      }
      while (D.length < n) add(true);
      if (D.length > n * 1.4) D.splice(0, (D.length - n * 1.4) | 0);
    },
    draw(g: G) {
      for (const d of D) {
        g.globalAlpha = d.o;
        const s = d.r * 3;
        g.drawImage(drop, d.x - s / 2, d.y - s / 2, s, s * (d.v ? 1.12 : 1));
      }
      g.globalAlpha = 1;
    },
  };
}

function streaks(W: number, H: number, n: number, wind: number) {
  const S = Array.from({ length: n }, () => ({
    x: R(-20, W + 20),
    y: R(-H, H),
    l: R(9, 18),
    v: R(480, 720),
    a: R(0.08, 0.24),
  }));
  return {
    draw(g: G, dt: number) {
      g.lineCap = 'round';
      g.lineWidth = 1;
      for (const s of S) {
        s.y += s.v * dt;
        s.x += s.v * wind * dt;
        if (s.y > H + 20) {
          s.y = R(-40, -10);
          s.x = R(-20, W + 20);
        }
        g.strokeStyle = `rgba(200,225,245,${s.a})`;
        g.beginPath();
        g.moveTo(s.x, s.y);
        g.lineTo(s.x - s.l * wind, s.y - s.l);
        g.stroke();
      }
    },
  };
}

/** Lightning: a jagged main channel with a few branches. */
function bolt(W: number, H: number): Segment[] {
  const segs: Segment[] = [];
  const walk = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
    let px = x;
    let py = y;
    const steps = Math.max(4, (len / 9) | 0);
    for (let i = 0; i < steps; i++) {
      const nx = px + Math.sin(ang) * 9 + R(-7, 7);
      const ny = py + Math.cos(ang) * 9 + R(-1, 3);
      segs.push([px, py, nx, ny, w]);
      px = nx;
      py = ny;
      if (depth < 2 && Math.random() < 0.07) {
        walk(px, py, ang + R(0.35, 0.9) * (Math.random() < 0.5 ? -1 : 1), len * R(0.25, 0.45), w * 0.55, depth + 1);
      }
      ang += R(-0.25, 0.25) * 0.6;
      ang = Math.max(-0.5, Math.min(0.5, ang));
      if (py > H + 10) break;
    }
  };
  walk(R(W * 0.55, W * 0.9), -10, R(-0.2, 0.2), H * 1.3, 1, 0);
  return segs;
}

function drawBolt(g: G, segs: Segment[], b: number) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const pass = (lw: number, col: string, blur: number) => {
    g.shadowBlur = blur;
    g.shadowColor = 'rgba(170,200,255,.9)';
    g.strokeStyle = col;
    for (const [x1, y1, x2, y2, w] of segs) {
      g.lineWidth = lw * w;
      g.globalAlpha = b * (w < 1 ? 0.6 : 1);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
  };
  pass(7, 'rgba(140,175,255,.18)', 18);
  pass(2.6, 'rgba(205,225,255,.75)', 8);
  pass(1.1, '#fff', 0);
  g.restore();
}

// ── scene builder ───────────────────────────────────────────────────────────

function build(kind: FxKind, night: boolean, W: number, H: number): Scene {
  const S: Scene = { draw: () => {} };
  const sp = sprites();

  if (kind === 'sun') {
    const sx = W - 58;
    const sy = 46;
    const motes = Array.from({ length: 14 }, () => ({
      x: R(0, W),
      y: R(0, H),
      r: R(2, 7),
      v: R(4, 10),
      a: R(0.05, 0.14),
      p: R(0, 7),
    }));
    S.draw = (g, dt, t) => {
      const glow = g.createRadialGradient(sx, sy, 0, sx, sy, 150);
      glow.addColorStop(0, `rgba(255,240,190,${0.42 + 0.06 * Math.sin(t * 0.8)})`);
      glow.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.translate(sx, sy);
      g.rotate(t * 0.06);
      for (let i = 0; i < 12; i++) {
        g.rotate((Math.PI * 2) / 12);
        const a = 0.05 + 0.03 * Math.sin(t * 0.7 + i * 1.7);
        const gr = g.createLinearGradient(0, 0, 0, 260);
        gr.addColorStop(0, `rgba(255,250,225,${a})`);
        gr.addColorStop(1, 'rgba(255,250,225,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(-14, 260);
        g.lineTo(14, 260);
        g.closePath();
        g.fill();
      }
      g.restore();
      for (const m of motes) {
        m.y -= m.v * dt;
        m.x -= m.v * 0.5 * dt;
        if (m.y < -10) {
          m.y = H + 10;
          m.x = R(0, W + 40);
        }
        g.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(t + m.p));
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(m.x, m.y, m.r, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    };
  }

  if (kind === 'moon') {
    const st = stars(W, H, 70);
    let shoot: { x: number; y: number; age: number } | null = null;
    let next = R(3, 7);
    S.draw = (g, dt, t) => {
      const glow = g.createRadialGradient(W - 58, 46, 0, W - 58, 46, 120);
      glow.addColorStop(0, 'rgba(255,240,200,.18)');
      glow.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      drawStars(g, st, t);
      if ((next -= dt) <= 0 && !shoot) {
        shoot = { x: R(W * 0.2, W * 0.8), y: R(-5, H * 0.3), age: 0 };
        next = R(6, 12);
      }
      if (shoot) {
        shoot.age += dt;
        const p = shoot.age / 0.8;
        const x = shoot.x - p * 260;
        const y = shoot.y + p * 120;
        const a = Math.sin(Math.min(1, p) * Math.PI);
        const gr = g.createLinearGradient(x, y, x + 70, y - 32);
        gr.addColorStop(0, `rgba(255,255,255,${a})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = gr;
        g.lineWidth = 1.6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 70, y - 32);
        g.stroke();
        if (p >= 1) shoot = null;
      }
    };
  }

  if (kind === 'partly') {
    const st = night ? stars(W, H, 40) : null;
    const C = makeClouds(W, 4, {
      y0: -20,
      y1: H * 0.55,
      s0: 0.55,
      s1: 0.9,
      v0: 6,
      v1: 13,
      a0: night ? 0.16 : 0.42,
      a1: night ? 0.26 : 0.65,
    });
    S.draw = (g, dt, t) => {
      if (st) drawStars(g, st, t, 0.8);
      if (!night) {
        const glow = g.createRadialGradient(W - 58, 46, 0, W - 58, 46, 130);
        glow.addColorStop(0, 'rgba(255,240,190,.3)');
        glow.addColorStop(1, 'rgba(255,240,190,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
      }
      drawClouds(g, C, W, dt);
    };
  }

  if (kind === 'cloud') {
    const back = makeClouds(W, 5, {
      y0: -50,
      y1: H * 0.25,
      s0: 0.8,
      s1: 1.2,
      v0: 3,
      v1: 6,
      a0: night ? 0.07 : 0.14,
      a1: night ? 0.12 : 0.22,
    });
    const front = makeClouds(W, 4, {
      y0: -10,
      y1: H * 0.4,
      s0: 0.6,
      s1: 0.95,
      v0: 8,
      v1: 14,
      a0: night ? 0.1 : 0.2,
      a1: night ? 0.16 : 0.32,
    });
    S.draw = (g, dt) => {
      drawClouds(g, back, W, dt);
      drawClouds(g, front, W, dt);
    };
  }

  if (kind === 'rain' || kind === 'storm') {
    const storm = kind === 'storm';
    const gl = glass(W, H, storm ? 120 : 95);
    const sk = streaks(W, H, storm ? 120 : 70, storm ? 0.22 : 0.12);
    let next = R(1.2, 3);
    let strike: { age: number; segs: Segment[] | null } | null = null;
    S.draw = (g, dt) => {
      if (storm) {
        if ((next -= dt) <= 0 && !strike) {
          strike = { age: 0, segs: Math.random() < 0.75 ? bolt(W, H) : null };
          next = R(3.5, 8);
          S.onStrike?.(Boolean(strike.segs));
        }
        if (strike) {
          strike.age += dt;
          const a = strike.age;
          const b = a < 0.06 ? 1 : a < 0.11 ? 0.25 : a < 0.17 ? 0.9 : Math.max(0, 0.9 * (1 - (a - 0.17) / 0.45));
          g.fillStyle = `rgba(190,215,255,${(strike.segs ? 0.22 : 0.14) * b})`;
          g.fillRect(0, 0, W, H);
          if (strike.segs) drawBolt(g, strike.segs, b);
          if (a > 0.65) strike = null;
        }
      }
      sk.draw(g, dt);
      gl.step(dt);
      gl.draw(g);
    };
  }

  if (kind === 'snow') {
    const F = Array.from({ length: 80 }, () => ({ x: R(0, W), y: R(-H, H), z: R(0.3, 1), p: R(0, 7), f: R(0.4, 1.2) }));
    S.draw = (g, dt, t) => {
      for (const f of F) {
        f.y += (14 + 34 * f.z) * dt;
        f.x += Math.sin(t * f.f + f.p) * 12 * f.z * dt + 6 * dt;
        if (f.y > H + 6) {
          f.y = -6;
          f.x = R(-20, W);
        }
        if (f.x > W + 6) f.x = -6;
        const s = (1.4 + 3.6 * f.z) * 2;
        g.globalAlpha = 0.35 + 0.6 * f.z;
        g.drawImage(sp.flake, f.x - s / 2, f.y - s / 2, s, s);
      }
      g.globalAlpha = 1;
    };
  }

  if (kind === 'fog') {
    const B = Array.from({ length: 6 }, (_, i) => ({
      x: R(-200, W),
      y: H * (0.1 + i * 0.16) + R(-8, 8),
      v: (i % 2 ? -1 : 1) * R(4, 9),
      a: R(0.24, 0.4),
      s: R(0.9, 1.4),
      p: R(0, 7),
    }));
    S.draw = (g, dt, t) => {
      for (const b of B) {
        b.x += b.v * dt;
        const w = 420 * b.s;
        if (b.v > 0 && b.x > W) b.x = -w;
        if (b.v < 0 && b.x < -w) b.x = W;
        g.globalAlpha = b.a * (0.75 + 0.25 * Math.sin(t * 0.4 + b.p));
        g.drawImage(sp.fog, b.x, b.y - 45 * b.s + Math.sin(t * 0.3 + b.p) * 4, w, 90 * b.s);
      }
      g.globalAlpha = 1;
    };
  }

  return S;
}

// ── controller ──────────────────────────────────────────────────────────────

export interface WeatherFx {
  set(kind: FxKind, night: boolean, onStrike?: (bolt: boolean) => void): void;
  dispose(): void;
}

export function attachWeatherFx(canvas: HTMLCanvasElement): WeatherFx {
  const g = canvas.getContext('2d');
  if (!g) return { set: () => {}, dispose: () => {} };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let W = 0;
  let H = 0;
  let scene: Scene | null = null;
  let raf = 0;
  let last = 0;
  let t = 0;
  let disposed = false;

  const size = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const frame = (ts: number) => {
    if (!scene || disposed) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    t += dt;
    g.clearRect(0, 0, W, H);
    scene.draw(g, dt, t);
    raf = requestAnimationFrame(frame);
  };

  const run = () => {
    cancelAnimationFrame(raf);
    if (!scene || disposed) return;
    if (reduce.matches) {
      g.clearRect(0, 0, W, H);
      scene.draw(g, 0.016, 1);
      return;
    }
    if (document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  document.addEventListener('visibilitychange', run);
  reduce.addEventListener('change', run);

  return {
    set(kind, night, onStrike) {
      size();
      scene = build(kind, night, W, H);
      scene.onStrike = onStrike;
      t = 0;
      run();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', run);
      reduce.removeEventListener('change', run);
      scene = null;
    },
  };
}

// Ballpark lab: new challenge types being tried out in Admin → Try it before they go into the quiz.
// Each challenge has: setup(el, params, onAnswer) to play it, score(params, answer) -> { points, metrics },
// and reveal(params, answer) -> SVG/HTML that shows the real answer next to yours.
import { COUNTRIES, FIGURES } from './shapes.js';
import { ROUNDS, parseRound, isImg } from './rounds.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const pts10k = (f) => Math.max(1, Math.min(10000, Math.round(10000 * f)));
const curve = (err, tol) => clamp01(1 - err / tol) ** 1.5;
const r2 = (x) => Math.round(x * 100) / 100;

// Pointer position in an SVG's own coordinates.
function svgPoint(svg, e) {
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  const q = p.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}
const pathD = (pts, close = false) => pts.length ? `M${pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}${close ? 'Z' : ''}` : '';

// ---------- polygon helpers ----------
export function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return a / 2; }
export function polyCentroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j][0] * p[i][1] - p[i][0] * p[j][1];
    a += f; cx += (p[j][0] + p[i][0]) * f; cy += (p[j][1] + p[i][1]) * f;
  }
  a /= 2;
  return Math.abs(a) < 1e-12 ? [p[0][0], p[0][1]] : [cx / (6 * a), cy / (6 * a)];
}
function inside(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  }
  return c;
}
// Move to centroid (0,0) and scale to area 1, so position and size don't matter, only the shape.
function normShape(p) {
  const [cx, cy] = polyCentroid(p), s = 1 / Math.sqrt(Math.abs(polyArea(p)) || 1);
  return p.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
}
function rowSpans(p, y) {   // where a horizontal line crosses the polygon, as [from, to] pairs
  const xs = [];
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y)) xs.push(((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]);
  xs.sort((u, v) => u - v);
  const out = []; for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
  return out;
}
// Overlap (intersection over union) of two outlines, measured along 140 horizontal lines.
export function iou(a, b, n = 140) {
  const ys = a.concat(b).map((q) => q[1]), y0 = Math.min(...ys), st = (Math.max(...ys) - y0) / n;
  let both = 0, either = 0;
  for (let r = 0; r < n; r++) {
    const y = y0 + (r + 0.5) * st, A = rowSpans(a, y), B = rowSpans(b, y);
    let la = 0, lb = 0, li = 0;
    A.forEach(([u, v]) => { la += v - u; }); B.forEach(([u, v]) => { lb += v - u; });
    for (let i = 0, j = 0; i < A.length && j < B.length;) {
      li += Math.max(0, Math.min(A[i][1], B[j][1]) - Math.max(A[i][0], B[j][0]));
      if (A[i][1] < B[j][1]) i++; else j++;
    }
    both += li; either += la + lb - li;
  }
  return either > 0 ? both / either : 0;
}
function resample(pts, n) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = d[d.length - 1], out = [];
  if (!(L > 0)) return pts.slice();
  for (let k = 0, j = 0; k < n; k++) {
    const t = (k / n) * L;
    while (j < d.length - 2 && d[j + 1] < t) j++;
    const f = (t - d[j]) / ((d[j + 1] - d[j]) || 1);
    out.push([pts[j][0] + f * (pts[j + 1][0] - pts[j][0]), pts[j][1] + f * (pts[j + 1][1] - pts[j][1])]);
  }
  return out;
}

// One-finger freehand drawing on a square canvas. Each new stroke replaces the old one.
// One-finger freehand drawing on a square canvas. maxTries limits how many drawings count (the last one
// is the answer); prev restores an earlier drawing when you come back to the question.
function drawPad(el, onAnswer, { maxTries = Infinity, prev = null } = {}) {
  let used = prev?.tries || (prev?.pts ? 1 : 0), shown = prev?.pts || null;
  const hint = () => maxTries === Infinity ? 'Draw in one go without lifting your finger. Drawing again starts over.'
    : maxTries === 1 ? (used ? '<b>Done.</b> You only get one go at this one.' : 'You get <b>one go</b>: draw it in one stroke without lifting your finger.')
    : used >= maxTries ? `<b>That was your last try</b> (${maxTries} of ${maxTries}). This drawing counts.`
    : `Draw in one stroke without lifting your finger. ${used ? `Try ${used} of ${maxTries}: draw again to replace it.` : `You get up to ${maxTries} tries; the last one counts.`}`;
  el.innerHTML = `<svg class="lab-pad" viewBox="0 0 100 100"><path class="lab-ink" d="${shown ? pathD(shown, true) : ''}"/></svg><p class="lab-hint">${hint()}</p>`;
  const svg = el.querySelector('svg'), ink = el.querySelector('.lab-ink'), msg = el.querySelector('.lab-hint');
  const live = () => svg.classList.toggle('lab-live', used < maxTries);   // no tries left = the page scrolls normally
  live();
  let pts = null;
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (used >= maxTries) { msg.innerHTML = hint(); return; }
    svg.setPointerCapture(e.pointerId); pts = [svgPoint(svg, e)]; ink.setAttribute('d', pathD(pts));
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pts) return;
    const q = svgPoint(svg, e), l = pts[pts.length - 1];
    if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.6) { pts.push(q); ink.setAttribute('d', pathD(pts)); }
  });
  const end = () => {
    if (!pts) return;
    const done = pts; pts = null;
    if (done.length < 8) { ink.setAttribute('d', shown ? pathD(shown, true) : ''); return; }   // a tap or a slip doesn't use up a try
    const keep = done.length > 200 ? done.filter((_, k) => k % Math.ceil(done.length / 200) === 0 || k === done.length - 1) : done;
    shown = keep.map((p) => [r2(p[0]), r2(p[1])]); used++;
    ink.setAttribute('d', pathD(shown, true)); msg.innerHTML = hint(); live();
    onAnswer({ pts: shown, tries: used });
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}

// ---------- ⭕ Perfect circle ----------
function circleFit(pts) {
  const r = resample(pts.concat([pts[0]]), 180);
  const cx = r.reduce((s, p) => s + p[0], 0) / r.length, cy = r.reduce((s, p) => s + p[1], 0) / r.length;
  const rad = r.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const R = rad.reduce((s, x) => s + x, 0) / rad.length;
  const e = Math.sqrt(rad.reduce((s, x) => s + (x - R) ** 2, 0) / rad.length) / (R || 1);
  // How far around did they go, and how big is the gap between start and end?
  let turn = 0;
  for (let i = 1; i < pts.length; i++) {
    let d = Math.atan2(pts[i][1] - cy, pts[i][0] - cx) - Math.atan2(pts[i - 1][1] - cy, pts[i - 1][0] - cx);
    if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
    turn += d;
  }
  const gap = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) / (2 * Math.PI * (R || 1));
  return { cx, cy, R, e, around: Math.abs(turn) / (2 * Math.PI), gap };
}

const circle = {
  meta: (p) => ({ tol: p.tol }),
  title: '⭕ Perfect circle', prompt: () => 'Draw a perfect circle',
  params: [{ k: 'tol', label: 'Strictness (roundness error at which points fall off; lower = stricter)', def: 0.08, step: 0.01 }],
  setup(el, p, onAnswer, opts = {}) { drawPad(el, onAnswer, { maxTries: opts.live ? 1 : Infinity, prev: opts.prev }); },
  score(p, a) {
    const f = circleFit(a.pts);
    if (f.R < 8) return { points: 1, metrics: { note: 'Too small' } };
    const round = Math.exp(-((f.e / p.tol) ** 2));
    const closed = clamp01(1 - Math.max(0, f.gap - 0.04) / 0.25) * clamp01((f.around - 0.8) / 0.18);
    return { points: pts10k(round * closed), metrics: { 'Roundness': `${(100 * (1 - f.e)).toFixed(1)} %`, 'Radius wobble': `${(100 * f.e).toFixed(1)} %`, 'Went around': `${Math.round(f.around * 360)}°`, 'Gap at the end': `${(100 * f.gap).toFixed(1)} % of the way round` } };
  },
  reveal(p, a) {
    const f = circleFit(a.pts);
    return `<svg class="lab-pad" viewBox="0 0 100 100"><circle cx="${r2(f.cx)}" cy="${r2(f.cy)}" r="${r2(f.R)}" class="lab-real"/><path class="lab-ink" d="${pathD(a.pts, true)}"/></svg>
      <p class="lab-legend"><span class="k-real">dashed = perfect circle</span> · <span class="k-you">yours</span></p>`;
  },
};

// ---------- ✏️ Draw a country ----------
const country = {
  meta: (p) => ({ country: p.country, floor: p.floor, top: p.top, outline: COUNTRIES[p.country].pts }),
  title: '✏️ Draw a country', prompt: (p) => `Draw the outline of ${COUNTRIES[p.country].name}`,
  params: [
    { k: 'country', label: 'Country', def: 'sweden', options: Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, v.name])) },
    { k: 'floor', label: 'Overlap that gives 0 points', def: 0.45, step: 0.05 },
    { k: 'top', label: 'Overlap that gives full points', def: 0.9, step: 0.05 },
  ],
  setup(el, p, onAnswer, opts = {}) { drawPad(el, onAnswer, { maxTries: opts.live ? 3 : Infinity, prev: opts.prev }); },
  score(p, a) {
    const real = normShape(COUNTRIES[p.country].pts), mine = normShape(a.pts);
    const o = iou(real, mine);
    return { points: pts10k(clamp01((o - p.floor) / (p.top - p.floor)) ** 1.2), metrics: { 'Overlap with the real shape': `${Math.round(o * 100)} %`, note: 'Position and size don’t matter, only the shape (north is up).' } };
  },
  reveal(p, a) {
    // Put the real outline on top of the drawing: same centre and same area.
    const [cx, cy] = polyCentroid(a.pts), s = Math.sqrt(Math.abs(polyArea(a.pts)));
    const real = normShape(COUNTRIES[p.country].pts).map(([x, y]) => [cx + x * s, cy + y * s]);
    const all = real.concat(a.pts), x0 = Math.min(...all.map((q) => q[0])) - 3, y0 = Math.min(...all.map((q) => q[1])) - 3;
    const w = Math.max(...all.map((q) => q[0])) - x0 + 3, h = Math.max(...all.map((q) => q[1])) - y0 + 3;
    return `<svg class="lab-pad" viewBox="${r2(x0)} ${r2(y0)} ${r2(w)} ${r2(h)}"><path class="lab-real fill" d="${pathD(real, true)}"/><path class="lab-ink" d="${pathD(a.pts, true)}"/></svg>
      <p class="lab-legend"><span class="k-real">real ${COUNTRIES[p.country].name}</span> · <span class="k-you">yours</span></p>`;
  },
};

// ---------- 🍸 Fill the glass ----------
const GLASSES = {
  martini: { name: 'Cocktail glass (cone)', rb: 0, rt: 34 },
  tumbler: { name: 'Pint glass (wider at the top)', rb: 21, rt: 30 },
  vase: { name: 'Vase (wider at the bottom)', rb: 30, rt: 14 },
};
const GLASS = { x: 50, top: 14, bottom: 88 };   // centre line and rim/base in the SVG
function volFrac(g, h) {   // h: 0..1 of the height -> share of the volume below it
  const v = (t) => { const k = g.rt - g.rb; return Math.abs(k) < 1e-9 ? g.rb * g.rb * t : ((g.rb + k * t) ** 3 - g.rb ** 3) / (3 * k); };
  return v(h) / v(1);
}
function levelFor(g, target) { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (volFrac(g, m) < target) lo = m; else hi = m; } return (lo + hi) / 2; }
// Drawn as a 3D glass (oval rim and water surface) so you judge volume, not the flat area of a triangle.
const ELL = 0.22;   // how flat the ovals are
function glassSvg(g, levels) {
  const H = GLASS.bottom - GLASS.top, X = GLASS.x, yAt = (h) => GLASS.bottom - h * H, rAt = (h) => g.rb + (g.rt - g.rb) * h;
  const ov = (y, r, cls, extra = '') => `<ellipse class="${cls}" cx="${X}" cy="${r2(y)}" rx="${r2(r)}" ry="${r2(r * ELL)}"${extra}/>`;
  const bottomArc = g.rb > 0 ? `A${g.rb},${r2(g.rb * ELL)} 0 0 0 ${X + g.rb},${GLASS.bottom}` : '';
  const body = (h) => { const y = r2(yAt(h)), r = r2(rAt(h));
    return `M${X - r},${y} L${X - g.rb},${GLASS.bottom} ${bottomArc} L${X + r},${y} A${r},${r2(r * ELL)} 0 0 1 ${X - r},${y}Z`; };
  const water = (h) => h <= 0.002 ? '' : `<path class="lab-water" d="${body(h)}"/>${ov(yAt(h), rAt(h), 'lab-surface')}`;
  const ring = (h, cls) => ov(yAt(h), rAt(h), cls);
  const sides = `M${X - g.rt},${GLASS.top} L${X - g.rb},${GLASS.bottom} ${bottomArc} L${X + g.rt},${GLASS.top}`;
  const base = g.rb > 0 ? `<path class="lab-glass back" d="M${X - g.rb},${GLASS.bottom} A${g.rb},${r2(g.rb * ELL)} 0 0 1 ${X + g.rb},${GLASS.bottom}"/>` : '';
  const stem = g.rb === 0 ? `<path class="lab-glass" d="M${X},${GLASS.bottom} V95"/>${ov(95.5, 12, 'lab-glass')}` : '';
  return `<svg class="lab-pad" viewBox="0 0 100 100">${base}${levels.map((l) => (l.fill ? water(l.h) : '') + (l.line ? ring(l.h, l.line) : '')).join('')}
    <path class="lab-glass" d="${sides}"/>${ov(GLASS.top, g.rt, 'lab-glass')}${stem}</svg>`;
}
const glass = {
  meta: (p) => ({ glass: p.glass, target: p.target, tol: p.tol, rb: GLASSES[p.glass].rb, rt: GLASSES[p.glass].rt }),
  title: '🍸 Fill the glass', prompt: (p) => `Fill the glass so it holds exactly ${p.target === 50 ? 'half' : `${p.target} %`} of what it can`,
  params: [
    { k: 'glass', label: 'Glass', def: 'martini', options: Object.fromEntries(Object.entries(GLASSES).map(([k, v]) => [k, v.name])) },
    { k: 'target', label: 'Target (% of the volume)', def: 50, step: 5 },
    { k: 'tol', label: 'Volume error that gives 0 points (%-points)', def: 30, step: 5 },
  ],
  setup(el, p, onAnswer, opts = {}) {
    const g = GLASSES[p.glass], h0 = opts.prev?.level;
    el.innerHTML = `<div class="lab-stage lab-live">${glassSvg(g, h0 == null ? [] : [{ h: h0, fill: true, line: 'lab-level' }])}</div><p class="lab-hint">Touch the glass and drag up or down to pour.</p>`;
    const stage = el.querySelector('.lab-stage');
    let down = false;
    const set = (e) => {
      const y = svgPoint(stage.querySelector('svg'), e)[1], h = clamp01((GLASS.bottom - y) / (GLASS.bottom - GLASS.top));
      stage.innerHTML = glassSvg(g, [{ h, fill: true, line: 'lab-level' }]);
      onAnswer({ level: Math.round(h * 1000) / 1000 });
    };
    stage.addEventListener('pointerdown', (e) => { e.preventDefault(); down = true; stage.setPointerCapture(e.pointerId); set(e); });
    stage.addEventListener('pointermove', (e) => { if (down) set(e); });
    stage.addEventListener('pointerup', () => { down = false; });
  },
  score(p, a) {
    const g = GLASSES[p.glass], v = 100 * volFrac(g, a.level), err = Math.abs(v - p.target);
    return { points: pts10k(curve(err, p.tol)), metrics: { 'You filled': `${v.toFixed(1)} % of the volume`, 'Your level': `${Math.round(a.level * 100)} % of the height`, 'Right level': `${Math.round(levelFor(g, p.target / 100) * 100)} % of the height`, ...(p.glass === 'martini' ? { note: 'A cone gets wider as it goes up, so its volume grows with the height cubed: half the height holds only 12.5 %, and half the volume sits at 79 % of the height.' } : {}) } };
  },
  reveal(p, a) {
    const g = GLASSES[p.glass], right = levelFor(g, p.target / 100);
    return glassSvg(g, [{ h: right, fill: true, line: 'lab-real' }, { h: a.level, line: 'lab-level' }])
      + '<p class="lab-legend"><span class="k-real">blue + dashed = right level</span> · <span class="k-you">your level</span></p>';
  },
};

// ---------- 🫘 Bean jar ----------
// Beans are poured in one at a time: each tries a few random spots and settles at the lowest one
// (resting on the floor or on beans below), like real pouring. Same jar number = same jar every time.
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const jarCache = new Map();
let JAR_TRIES = 80;
export const _setTries = (n) => { JAR_TRIES = n; jarCache.clear(); };
export function jarBeans(p) {
  const key = `${p.seed}|${p.across}|${p.height}`;
  if (jarCache.has(key)) return jarCache.get(key);
  const rand = rng(p.seed * 7919 + 13), R = p.across / 2 - 0.5, beans = [], grid = new Map();
  const cell = (x, y) => `${Math.floor(x)},${Math.floor(y)}`;
  const near = (x, y) => { const out = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const g = grid.get(cell(x + i, y + j)); if (g) out.push(...g); } return out; };
  let misses = 0;
  while (misses < 60 && beans.length < 5000) {
    let best = null;
    for (let k = 0; k < JAR_TRIES; k++) {
      const ang = rand() * 2 * Math.PI, rr = R * Math.sqrt(rand()), x = rr * Math.cos(ang), y = rr * Math.sin(ang);
      let z = 0.5;
      for (const o of near(x, y)) { const d2 = (o.x - x) ** 2 + (o.y - y) ** 2; if (d2 < 1) z = Math.max(z, o.z + Math.sqrt(1 - d2)); }
      if (!best || z < best.z) best = { x, y, z };
    }
    if (best.z > p.height - 0.5) { misses++; continue; }
    misses = 0;
    const b = { ...best, rot: rand() * Math.PI, end: rand() < 0.25, size: 0.92 + rand() * 0.16, c: Math.floor(rand() * 7) };
    beans.push(b);
    const c = cell(b.x, b.y); if (!grid.has(c)) grid.set(c, []); grid.get(c).push(b);
  }
  jarCache.set(key, beans);
  return beans;
}
// The quick estimate you can do in your head: beans across × beans across × beans up × 0.6
// (a cylinder is about 80 % of the square box around it, and loose beans fill about 75 % of the space).
export const jarRule = (p) => Math.round(p.across * p.across * p.height * 0.6);
const BEAN_COLOURS = [['#e63946', '#7a1018'], ['#f4a261', '#8a4a12'], ['#ffd166', '#8c6a00'], ['#06d6a0', '#03664b'], ['#9b5de5', '#4b2380'], ['#f15bb5', '#7a1d55'], ['#f8f4e3', '#9b9070'], ['#222', '#000']];
export function drawJar(canvas, p) {
  const beans = jarBeans(p), ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, tilt = 0.3, ct = Math.cos(tilt), stl = Math.sin(tilt);
  const R = p.across / 2, Hj = p.height + 1.2;
  const s = Math.min((W * 0.86) / (2 * R), (H * 0.88) / (Hj * ct + 2 * R * stl));
  const cx = W / 2, by = H - (H - (Hj * ct + 2 * R * stl) * s) / 2 - R * stl * s;
  const X = (x) => cx + x * s, Y = (y, z) => by - z * ct * s - y * stl * s;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(180,220,255,0.06)'; ctx.strokeStyle = 'rgba(200,230,255,0.35)'; ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath(); ctx.ellipse(cx, Y(0, 0), R * s, R * stl * s, 0, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  const order = beans.slice().sort((a, b) => (-a.y * ct + a.z * stl) - (-b.y * ct + b.z * stl));
  for (const b of order) {
    const [c1, c2] = BEAN_COLOURS[b.c], x = X(b.x), y = Y(b.y, b.z);
    const rx = (b.end ? 0.44 : 0.6) * s * b.size, ry = 0.4 * s * b.size;
    const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.45, ry * 0.1, x, y, rx * 1.15);
    g.addColorStop(0, '#fff'); g.addColorStop(0.2, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, b.rot, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(210,235,255,0.55)';
  ctx.beginPath(); ctx.moveTo(X(-R), Y(0, 0)); ctx.lineTo(X(-R), Y(0, Hj)); ctx.moveTo(X(R), Y(0, 0)); ctx.lineTo(X(R), Y(0, Hj)); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, Y(0, 0), R * s, R * stl * s, 0, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, Y(0, Hj), R * s, R * stl * s, 0, 0, 2 * Math.PI); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(X(-R * 0.75), Y(0, Hj * 0.92), R * 0.18 * s, Hj * ct * 0.8 * s);
  return beans.length;
}
const jar = {
  meta: (p) => ({ seed: p.seed, across: p.across, height: p.height, tol: p.tol, count: jarBeans(p).length }),
  title: '🫘 Beans in a jar', prompt: () => 'How many jelly beans are in the jar?',
  params: [
    { k: 'seed', label: 'Jar number (any number makes a new jar)', def: 7, step: 1 },
    { k: 'across', label: 'Jar width (in beans)', def: 9, step: 1 },
    { k: 'height', label: 'Filled height (in beans)', def: 11, step: 1 },
    { k: 'tol', label: 'Ratio error that gives 0 points (0.3 = off by 2×)', def: 0.3, step: 0.05 },
  ],
  setup(el, p, onAnswer, opts = {}) {
    el.innerHTML = `<canvas class="lab-jar" width="640" height="760"></canvas>
      <label class="field"><span>Your guess</span><input class="input lab-num" type="number" inputmode="numeric" min="1" placeholder="e.g. 350" value="${opts.prev?.value ?? ''}"></label>`;
    drawJar(el.querySelector('canvas'), p);
    const inp = el.querySelector('input');
    inp.addEventListener('input', () => { const v = Math.round(+inp.value); onAnswer(v > 0 ? { value: v } : null); });
  },
  answerTarget: (p) => jarBeans(p).length,
  score(p, a) {
    const n = p.count ?? jarBeans(p).length, err = Math.abs(Math.log10(a.value / n));
    return { points: pts10k(curve(err, p.tol)), metrics: { 'Beans in the jar': n, 'Your guess': a.value, 'Off by': `${Math.round(Math.abs(a.value / n - 1) * 100)} %` } };
  },
  reveal(p) {
    const n = p.count ?? jarBeans(p).length;
    return `<p class="lab-big">${n} beans</p><p class="lab-legend">Quick estimate: ${p.across} across × ${p.across} × ${p.height} up × 0.6 ≈ <b>${jarRule(p)}</b></p>`;
  },
};

// ---------- 🎯 Centre of mass ----------
const SHAPES = { ...Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, v])), ...FIGURES };
function shapeIn100(key) {   // scale the shape into the 100×100 view, centred
  const pts = SHAPES[key].pts, w = Math.max(...pts.map((q) => q[0])), h = Math.max(...pts.map((q) => q[1]));
  const s = 84 / Math.max(w, h), ox = (100 - w * s) / 2, oy = (100 - h * s) / 2;
  return pts.map(([x, y]) => [ox + x * s, oy + y * s]);
}
const centre = {
  meta: (p) => { const poly = shapeIn100(p.shape), [cx, cy] = polyCentroid(poly); return { shape: p.shape, tol: p.tol, cx: r2(cx), cy: r2(cy), size: 84 }; },
  title: '🎯 Centre of mass', prompt: (p) => `Tap the centre of mass of ${COUNTRIES[p.shape] ? COUNTRIES[p.shape].name : 'this shape'}`,
  params: [
    { k: 'shape', label: 'Shape', def: 'sweden', options: Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, v.name])) },
    { k: 'tol', label: 'Miss (share of the shape\u2019s longest side) that gives 0 points', def: 0.25, step: 0.05 },
  ],
  setup(el, p, onAnswer, opts = {}) {
    const poly = shapeIn100(p.shape), pv = opts.prev;
    el.innerHTML = `<svg class="lab-pad" viewBox="0 0 100 100"><path class="lab-shape" d="${pathD(poly, true)}"/><g class="lab-mark" ${pv ? `transform="translate(${pv.x},${pv.y})"` : 'style="display:none"'}><circle r="2.6"/><path d="M-5,0H5M0,-5V5"/></g></svg>
      <p class="lab-hint">Imagine the shape cut out of cardboard. Where would it balance on a pin? Tap to place, tap again to move.</p>`;
    const svg = el.querySelector('svg'), mark = el.querySelector('.lab-mark');
    svg.addEventListener('click', (e) => {
      const [x, y] = svgPoint(svg, e);
      mark.style.display = ''; mark.setAttribute('transform', `translate(${r2(x)},${r2(y)})`);
      onAnswer({ x: r2(x), y: r2(y) });
    });
  },
  score(p, a) {
    const poly = shapeIn100(p.shape), [cx, cy] = polyCentroid(poly), size = 84;   // the shape's longest side
    const d = Math.hypot(a.x - cx, a.y - cy) / size;
    return { points: pts10k(curve(d, p.tol)), metrics: { 'Miss': `${(d * 100).toFixed(1)} % of the shape's length`, 'Centre inside the shape?': inside(poly, cx, cy) ? 'yes' : 'no, it’s outside!' } };
  },
  reveal(p, a) {
    const poly = shapeIn100(p.shape), [cx, cy] = polyCentroid(poly);
    return `<svg class="lab-pad" viewBox="0 0 100 100"><path class="lab-shape" d="${pathD(poly, true)}"/>
      <g class="lab-mark" transform="translate(${a.x},${a.y})"><circle r="2.6"/><path d="M-5,0H5M0,-5V5"/></g>
      <g class="lab-mark real" transform="translate(${r2(cx)},${r2(cy)})"><circle r="2.6"/><path d="M-5,0H5M0,-5V5"/></g></svg>
      <p class="lab-legend"><span class="k-real">real centre</span> · <span class="k-you">yours</span></p>`;
  },
};

// ---------- 📐 Angle ----------
const ANGLES = {
  pisa: { name: 'Leaning Tower of Pisa', prompt: 'Tilt the tower to match how much the Leaning Tower of Pisa leans', target: 3.97, from: 'vertical', look: 'tower', fact: 'About 4° today. Before the 1990s rescue work it was about 5.5°.' },
  earth: { name: 'Earth’s axis', prompt: 'Tilt the line to match the tilt of Earth’s axis', target: 23.44, from: 'vertical', look: 'axis', fact: '23.4°, which is what gives us seasons.' },
  baldwin: { name: 'Steepest street', prompt: 'Tilt the road to match the world’s steepest street (Baldwin Street, New Zealand)', target: 19.3, from: 'horizontal', look: 'road', fact: 'About 19° at its steepest, a 35 % gradient.' },
};
function angleSvg(look, from, deg, extra = '') {
  const px = 50, py = 84, rot = from === 'vertical' ? deg : -deg;
  const body = look === 'tower'
    ? `<g transform="rotate(${rot} ${px} ${py})"><rect x="${px - 8}" y="${py - 62}" width="16" height="62" rx="2" class="lab-tower"/>${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${px - 8}" x2="${px + 8}" y1="${py - 10 - i * 9.5}" y2="${py - 10 - i * 9.5}" class="lab-band"/>`).join('')}<rect x="${px - 6}" y="${py - 70}" width="12" height="8" rx="1.5" class="lab-tower"/></g>`
    : look === 'road'
      ? `<g transform="rotate(${rot} 14 ${py})"><line x1="14" y1="${py}" x2="96" y2="${py}" class="lab-road"/><line x1="14" y1="${py}" x2="96" y2="${py}" class="lab-road-mid"/></g>`
      : `<g transform="rotate(${rot} 50 50)"><line x1="50" y1="8" x2="50" y2="92" class="lab-axis"/><circle cx="50" cy="50" r="18" class="lab-earth"/></g>`;
  const ground = look === 'axis' ? '<line x1="50" y1="4" x2="50" y2="96" class="lab-ref"/>' : `<line x1="4" y1="${py}" x2="96" y2="${py}" class="lab-ground"/>`;
  return `<svg class="lab-pad" viewBox="0 0 100 100">${ground}${extra}${body}</svg>`;
}
const angle = {
  meta: (p) => ({ preset: p.preset, tol: p.tol, target: ANGLES[p.preset].target }),
  title: '📐 Match the angle', prompt: (p) => ANGLES[p.preset].prompt,
  params: [
    { k: 'preset', label: 'What', def: 'pisa', options: Object.fromEntries(Object.entries(ANGLES).map(([k, v]) => [k, v.name])) },
    { k: 'tol', label: 'Degrees off that gives 0 points', def: 10, step: 1 },
  ],
  setup(el, p, onAnswer, opts = {}) {
    const A = ANGLES[p.preset];
    let deg = opts.prev?.deg ?? 0;
    const paint = () => { el.querySelector('.lab-stage').innerHTML = angleSvg(A.look, A.from, deg); };
    el.innerHTML = '<div class="lab-stage lab-pan-y"></div><p class="lab-hint">Drag sideways anywhere on the picture to tilt it.</p>';
    paint();
    const stage = el.querySelector('.lab-stage');
    let start = null;
    stage.addEventListener('pointerdown', (e) => { e.preventDefault(); stage.setPointerCapture(e.pointerId); start = { x: e.clientX, deg }; });
    stage.addEventListener('pointermove', (e) => {
      if (!start) return;
      deg = Math.max(-80, Math.min(80, start.deg + (e.clientX - start.x) * 0.25));
      paint(); onAnswer({ deg: Math.round(deg * 10) / 10 });
    });
    stage.addEventListener('pointerup', () => { start = null; });
  },
  score(p, a) {
    const A = ANGLES[p.preset], err = Math.abs(Math.abs(a.deg) - A.target);   // leaning left or right both count
    return { points: pts10k(curve(err, p.tol)), metrics: { 'Your angle': `${Math.abs(a.deg).toFixed(1)}°`, 'Real angle': `${A.target}°`, note: A.fact } };
  },
  reveal(p, a) {
    const A = ANGLES[p.preset], sign = a.deg < 0 ? -1 : 1;
    const ghost = angleSvg(A.look, A.from, sign * A.target).replace(/^<svg[^>]*>|<\/svg>$/g, '').replace(/class="lab-(tower|band|road|road-mid|axis|earth)"/g, 'class="lab-ghost"');
    return angleSvg(A.look, A.from, a.deg, `<g opacity=".9">${ghost}</g>`) + '<p class="lab-legend"><span class="k-real">dashed = real angle</span> · <span class="k-you">yours</span></p>';
  },
};

// ---------- 🟢 Marble maze (tilt the phone) ----------
// Two marbles, one after the other. Every hole has a value: early holes are cheap, the deeper you get
// the more they're worth, and the goal at the very end is worth 5 000. A marble scores the hole it falls in.
const MZ = { w: 100, h: 150, ball: 3, hole: 4.6, goal: 6, time: 60 };
const MAZE_WALLS = [[0, 32, 76, 32], [24, 62, 100, 62], [0, 92, 76, 92], [24, 122, 100, 122]];
const MAZE_HOLES = [
  [36, 22, 250], [60, 10, 250],
  [66, 52, 750], [46, 40, 750], [28, 52, 750],
  [32, 74, 1500], [52, 84, 1500], [72, 72, 1500],
  // The last two rows drift slowly: [x, y, value, sideways swing, up-down swing, seconds per swing, phase]
  [76, 112, 2500, 9, 0, 5.5, 0], [56, 100, 2500, 0, 3, 4, 1.5], [36, 112, 2500, 9, 0, 6.5, 3],
  [40, 142, 3500, 11, 0, 4.5, 2], [60, 130, 3500, 8, 2.5, 5, 0.5], [70, 144, 3500, 7, 0, 3.8, 4],
];
// Where a hole is t seconds after the marble starts.
const holeAt = (h, t) => (h[3] || h[4] ? [h[0] + (h[3] || 0) * Math.sin((2 * Math.PI * t) / h[5] + h[6]), h[1] + (h[4] || 0) * Math.sin((2 * Math.PI * t) / (h[5] * 1.3) + h[6])] : [h[0], h[1]]);
const MAZE_GOAL = [88, 138, 5000];
export const MAZE_VALUES = [0, ...new Set(MAZE_HOLES.map((h) => h[2])), MAZE_GOAL[2]];
const maze = {
  meta: (p) => ({ speed: p.speed, values: MAZE_VALUES }),
  title: '🟢 Marble maze (tilt)', prompt: () => 'Tilt your phone to roll the marble as far as you can',
  params: [
    { k: 'speed', label: 'How strongly tilting pushes the marble', def: 1, step: 0.1 },
  ],
  // opts.live: the real quiz. opts.progress: marbles already rolled (a marble counts as 0 the moment it
  // starts, so leaving or reloading mid-roll can't be used to get a do-over). opts.onProgress saves it.
  setup(el, p, onAnswer, opts = {}) {
    el.innerHTML = `<canvas class="lab-maze" width="400" height="600"></canvas>
      <p class="lab-hint" id="mzMsg"></p>
      <div class="tmp-row" style="width:100%;max-width:360px"><button type="button" class="btn ghost" id="mzSkip">Skip practice</button><button type="button" class="btn" id="mzGo"></button></div>`;
    const cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), msg = el.querySelector('#mzMsg'), go = el.querySelector('#mzGo'), skip = el.querySelector('#mzSkip');
    const row = go.parentElement;
    const S = cv.width / MZ.w;
    const results = (opts.progress || []).slice(0, 2);
    const REAL = { walls: MAZE_WALLS, holes: MAZE_HOLES, goal: MAZE_GOAL, start: [12, 12], time: MZ.time };
    const PRACTICE = { walls: [[18, 62, 82, 62]], holes: [[28, 100, 0], [72, 100, 0]], goal: [50, 128, 0], start: [50, 14], time: Infinity, practice: true };
    let lv = results.length ? REAL : PRACTICE;
    let ball = null, tilt = { x: 0, y: 0 }, base = null, sensor = false, pointer = null, raf = 0, last = 0, t0 = 0, keys = {};
    const onOri = (e) => {
      if (e.gamma == null) return;
      sensor = true;
      if (base == null) base = e.beta;
      tilt = { x: Math.max(-1, Math.min(1, e.gamma / 25)), y: Math.max(-1, Math.min(1, (e.beta - base) / 25)) };
    };
    const onKey = (e) => { keys[e.key] = e.type === 'keydown'; };
    window.addEventListener('deviceorientation', onOri);
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * MZ.w, (e.clientY - r.top) / r.height * MZ.h]; };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); pointer = pos(e); });
    cv.addEventListener('pointermove', (e) => { if (pointer) pointer = pos(e); });
    cv.addEventListener('pointerup', () => { pointer = null; });
    const fmtV = (v) => v.toLocaleString('sv-SE');

    function draw() {
      ctx.setTransform(S, 0, 0, S, 0, 0);
      ctx.fillStyle = lv.practice ? '#25303a' : '#2a2f3f'; ctx.fillRect(0, 0, MZ.w, MZ.h);
      ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (const [x1, y1, x2, y2] of lv.walls) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      ctx.font = 'bold 3.2px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const t = ball ? (last - t0) / 1000 : 0;
      for (const h of lv.holes) { const [x, y] = holeAt(h, t), v = h[2]; ctx.fillStyle = '#0b0d12'; ctx.beginPath(); ctx.arc(x, y, MZ.hole, 0, 7); ctx.fill(); ctx.fillStyle = '#9aa0b4'; ctx.fillText(lv.practice ? '✗' : v >= 1000 ? `${v / 1000}k` : v, x, y); }
      ctx.fillStyle = '#5ee0b1'; ctx.beginPath(); ctx.arc(lv.goal[0], lv.goal[1], MZ.goal, 0, 7); ctx.fill();
      ctx.fillStyle = '#062018'; ctx.font = 'bold 3.6px system-ui'; ctx.fillText(lv.practice ? '✓' : '5k', lv.goal[0], lv.goal[1]);
      ctx.fillStyle = '#9aa0b4'; ctx.font = 'bold 3px system-ui'; ctx.fillText(lv.practice ? 'PRACTICE · NO POINTS' : 'START', lv.practice ? 50 : 12, 4);
      if (ball) {
        const r = Math.max(0.3, MZ.ball * (ball.fall ?? 1));
        const g = ctx.createRadialGradient(ball.x - r / 3, ball.y - r / 3, r / 6, ball.x, ball.y, r);
        g.addColorStop(0, '#fff'); g.addColorStop(1, '#ff7a3d');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ball.x, ball.y, r, 0, 7); ctx.fill();
      }
      if (sensor) {   // a little spirit level, so you can see the phone's tilt is coming through
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(92, 142, 5, 0, 7); ctx.stroke();
        ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(92 + tilt.x * 4, 142 + tilt.y * 4, 1.4, 0, 7); ctx.fill();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (ball && !ball.fall && lv.time < Infinity) { ctx.fillStyle = '#f5efe4'; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'right'; ctx.fillText(`${Math.max(0, Math.ceil(lv.time - (last - t0) / 1000))} s`, cv.width - 10, 20); }
    }
    function collide() {
      const segs = lv.walls.concat([[0, 0, MZ.w, 0], [MZ.w, 0, MZ.w, MZ.h], [MZ.w, MZ.h, 0, MZ.h], [0, MZ.h, 0, 0]]);
      for (const [x1, y1, x2, y2] of segs) {
        const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((ball.x - x1) * dx + (ball.y - y1) * dy) / (dx * dx + dy * dy)));
        const cx = x1 + t * dx, cy = y1 + t * dy, ex = ball.x - cx, ey = ball.y - cy, d = Math.hypot(ex, ey), min = MZ.ball + 1.1;
        if (d < min && d > 1e-6) {
          const nx = ex / d, ny = ey / d;
          ball.x = cx + nx * min; ball.y = cy + ny * min;
          const vn = ball.vx * nx + ball.vy * ny;
          if (vn < 0) { ball.vx -= 1.35 * vn * nx; ball.vy -= 1.35 * vn * ny; }
        }
      }
    }
    function end(value, goal) {
      ball.fall = 1;
      const shrink = () => { ball.fall -= 0.08; draw(); if (ball.fall > 0) raf = requestAnimationFrame(shrink); else finish(value, goal); };
      shrink();
    }
    const showRow = (on) => { row.style.display = on ? '' : 'none'; };   // (.tmp-row's CSS display overrides [hidden])
    function showState() {   // buttons and text between rolls
      showRow(true); go.disabled = false;
      if (results.length >= 2) {
        showRow(false); go.disabled = true;
        msg.innerHTML = `<b>Marble 1: ${fmtV(results[0])} · Marble 2: ${fmtV(results[1])}</b>`;
        return;
      }
      skip.hidden = !lv.practice;
      if (lv.practice) {
        go.textContent = 'Start practice';
        skip.textContent = 'Skip practice';
        msg.innerHTML = 'First a practice round: tilt your phone to roll the marble into the <b>green hole</b>. Avoid the ✗ holes. No points, try as many times as you like.';
      } else {
        go.textContent = `Start marble ${results.length + 1} of 2`;
        msg.innerHTML = results.length
          ? `Marble 1: <b>${fmtV(results[0])}</b> points. One marble left.`
          : 'The real game: <b>two marbles, one go each</b>. Every hole has a value and they get better the further you get; the green goal at the end is worth 5 000. You have 60 seconds per marble.';
      }
    }
    function finish(value, goal) {
      ball = null; draw(); cv.classList.remove('lab-live');
      navigator.vibrate?.(60);
      if (lv.practice) {
        showState();
        go.textContent = 'Practice again'; skip.hidden = false; skip.textContent = 'Start the real game →';
        msg.innerHTML = goal ? '🎉 Nice, you’ve got it! Practice again or start the real game.' : 'Oops, that’s a ✗ hole. Try again, or start the real game when you’re ready.';
        return;
      }
      results[results.length - 1] = value;
      opts.onProgress?.(results.slice(0, 2));
      showState();
      if (results.length >= 2) onAnswer({ holes: results.slice(0, 2) });
    }
    function step(now) {
      const dt = Math.min(0.04, (now - last) / 1000); last = now;
      let ax = tilt.x, ay = tilt.y;
      if (!sensor) {
        ax = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0); ay = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
        if (pointer) { ax = Math.max(-1, Math.min(1, (pointer[0] - ball.x) / 25)); ay = Math.max(-1, Math.min(1, (pointer[1] - ball.y) / 25)); }
      }
      const A = 150 * p.speed;
      ball.vx = (ball.vx + ax * A * dt) * (1 - 0.9 * dt); ball.vy = (ball.vy + ay * A * dt) * (1 - 0.9 * dt);
      const sp = Math.hypot(ball.vx, ball.vy); if (sp > 80) { ball.vx *= 80 / sp; ball.vy *= 80 / sp; }
      const n = Math.ceil(sp * dt / 1.5) || 1;
      const t = (now - t0) / 1000, holes = lv.holes.map((h) => [...holeAt(h, t), h[2]]);
      // Rolling over a hole's edge pulls the marble in (stronger the closer to the middle), so you can't just skim across.
      for (const [x, y] of holes) {
        const dx = x - ball.x, dy = y - ball.y, d = Math.hypot(dx, dy);
        if (d < MZ.hole + 0.6 && d > 1e-6) { const pull = 420 * (1 - d / (MZ.hole + 0.6)) * dt; ball.vx += (dx / d) * pull; ball.vy += (dy / d) * pull; }
      }
      for (let i = 0; i < n; i++) {
        ball.x += ball.vx * dt / n; ball.y += ball.vy * dt / n; collide();
        if (Math.hypot(ball.x - lv.goal[0], ball.y - lv.goal[1]) < MZ.goal - 1) return end(lv.goal[2], true);
        for (const [x, y, v] of holes) if (Math.hypot(ball.x - x, ball.y - y) < MZ.hole - 0.5) return end(v, false);
      }
      if ((now - t0) / 1000 > lv.time) { msg.textContent = 'Time’s up!'; return end(0, false); }
      draw();
      raf = requestAnimationFrame(step);
    }
    go.onclick = async () => {
      try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission(); } catch { /* fall back to touch */ }
      if (!lv.practice && results.length >= 2) return;   // two marbles, never a third
      if (!lv.practice) { results.push(0); opts.onProgress?.(results.slice()); }   // counts as 0 unless it finishes
      base = null; showRow(false); cv.classList.add('lab-live');
      msg.textContent = lv.practice ? 'Tilt to roll into the green hole!' : `Marble ${results.length} of 2. Tilt to roll!`;
      ball = { x: lv.start[0], y: lv.start[1], vx: 0, vy: 0 };
      last = t0 = performance.now();
      raf = requestAnimationFrame(step);
      setTimeout(() => { if (!sensor && ball) msg.textContent = 'No tilt sensor found: hold your finger where you want the marble to roll.'; }, 1200);
    };
    skip.onclick = () => { lv = REAL; draw(); showState(); };
    showState(); draw();
    if (results.length >= 2) onAnswer({ holes: results.slice(0, 2) });
    return () => { cancelAnimationFrame(raf); window.removeEventListener('deviceorientation', onOri); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  },
  score(p, a) {
    const h = (a.holes || []).slice(0, 2), ok = h.length === 2 && h.every((v) => MAZE_VALUES.includes(v));   // only the first two marbles count
    return { points: ok ? Math.max(1, h[0] + h[1]) : 1, metrics: { 'Marble 1': a.holes[0].toLocaleString('sv-SE'), 'Marble 2': a.holes[1].toLocaleString('sv-SE') } };
  },
  reveal(p, a) { return `<p class="lab-big">${a.holes.slice(0, 2).map((v) => v.toLocaleString('sv-SE')).join(' + ')}</p><p class="lab-legend">The goal at the end is worth 5 000 per marble.</p>`; },
};

// ---------- ⚡ Quick round: true/false, pick one, match pairs ----------
// meta.items (full, with answers) is kept on the server; phones get a copy without answers until they submit.
const fullRound = (p) => (p.items ? p : { items: parseRound(ROUNDS[p.preset].text).items });
const hashSort = (arr, f = (x) => x) => arr.slice().sort((a, b) => { const h = (s) => [...String(f(s))].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7); return h(a) - h(b); });
function publicRound(m) {   // same shape the server sends (quiz_round_public)
  return { items: m.items.map((it) => it.t === 'tf' ? { t: 'tf', text: it.text }
    : it.t === 'pick' ? { t: 'pick', text: it.text, options: it.answer === undefined ? it.options : hashSort(it.options) }
    : it.left ? it : { t: 'match', text: it.text, left: it.pairs.map((q) => q[0]), right: hashSort(it.pairs.map((q) => q[1])) }) };
}
export function roundScore(m, a) {   // mirror of quiz_round_points
  let units = 0, ok = 0;
  m.items.forEach((it, i) => {
    const p = a?.picks?.[i];
    if (it.t === 'match') it.pairs.forEach(([, r], j) => { units++; if (Array.isArray(p) && p[j] === r) ok++; });
    else { units++; if (p === it.answer) ok++; }
  });
  return { ok, units, points: units ? Math.max(1, Math.round((10000 * ok) / units)) : 1 };
}
const optHtml = (o) => (isImg(o) ? `<img src="${esc(o)}" alt="" loading="lazy">` : esc(o));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = {
  title: '⚡ Quick round', prompt: (p) => ROUNDS[p.preset]?.prompt || 'Quick round',
  params: [{ k: 'preset', label: 'Round', def: 'facts', options: Object.fromEntries(Object.entries(ROUNDS).map(([k, v]) => [k, v.name])) }],
  meta: (p) => fullRound(p),
  // One item per screen. A tap answers and moves on; there's no going back inside the round, and
  // opts.progress / onProgress keep answers if you leave and come back.
  setup(el, p, onAnswer, opts = {}) {
    const m = publicRound(fullRound(p)), n = m.items.length, picks = (opts.progress || []).slice(0, n);
    const save = () => opts.onProgress?.(picks.slice());
    const show = () => {
      const i = picks.length;
      const dots = `<div class="rnd-dots">${m.items.map((_, k) => `<span class="${k < i ? 'done' : k === i ? 'now' : ''}"></span>`).join('')}</div>`;
      if (i >= n) {
        el.innerHTML = `${dots}<p class="lab-big">All ${n} done ✓</p><p class="lab-hint">Your answers are in. You'll see how you did after you submit.</p>`;
        onAnswer({ picks: picks.slice() });
        return;
      }
      const it = m.items[i];
      const head = `${dots}<div class="rnd-n">${i + 1} of ${n}</div><p class="rnd-q">${esc(it.text)}</p>`;
      const next = (v) => { picks.push(v); save(); setTimeout(show, 260); };
      if (it.t === 'tf') {
        el.innerHTML = `${head}<div class="rnd-tf"><button type="button" class="btn rnd-true" data-v="1">✓ True</button><button type="button" class="btn rnd-false" data-v="0">✗ False</button></div>`;
        el.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { b.classList.add('chosen'); el.querySelectorAll('[data-v]').forEach((x) => { x.disabled = true; }); next(b.dataset.v === '1'); });
      } else if (it.t === 'pick') {
        const imgs = it.options.some(isImg);
        el.innerHTML = `${head}<div class="rnd-opts ${imgs ? 'imgs' : ''}">${it.options.map((o, k) => `<button type="button" class="rnd-opt" data-k="${k}">${optHtml(o)}</button>`).join('')}</div>`;
        el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { b.classList.add('chosen'); el.querySelectorAll('[data-k]').forEach((x) => { x.disabled = true; }); next(it.options[+b.dataset.k]); });
      } else {
        el.innerHTML = `${head}<div class="rnd-match">${it.left.map((l, k) => `<label class="rnd-row"><span class="rnd-left">${optHtml(l)}</span>
          <select class="input" data-k="${k}"><option value="">Choose…</option>${it.right.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>`).join('')}</div>
          <p class="lab-hint">Each right answer counts. You can't change them after pressing Done.</p>
          <button type="button" class="btn block" data-a="done" disabled>Done →</button>`;
        const sels = [...el.querySelectorAll('select')], done = el.querySelector('[data-a="done"]');
        sels.forEach((s) => s.onchange = () => { done.disabled = sels.some((x) => !x.value); });
        done.onclick = () => { done.disabled = true; next(sels.map((x) => x.value)); };
      }
    };
    show();
  },
  score(p, a) {
    const r = roundScore(fullRound(p), a);
    return { points: r.points, metrics: { 'Right': `${r.ok} of ${r.units}` } };
  },
  reveal(p, a) {
    const m = fullRound(p);
    if (!m.items?.[0] || !('answer' in m.items[0] || m.items[0].pairs)) return '';
    const yes = (b) => `<span class="${b ? 'ok' : 'no'}">${b ? '✓' : '✗'}</span>`;
    return `<ol class="rnd-reveal">${m.items.map((it, i) => {
      const pk = a?.picks?.[i];
      if (it.t === 'match') return `<li><b>${esc(it.text)}</b>${it.pairs.map(([l, r], j) => `<div>${yes(Array.isArray(pk) && pk[j] === r)} ${optHtml(l)} → <b>${esc(r)}</b>${Array.isArray(pk) && pk[j] !== r ? ` <span class="muted">(you: ${esc(pk[j])})</span>` : ''}</div>`).join('')}${it.note ? `<div class="muted">${esc(it.note)}</div>` : ''}</li>`;
      const right = it.t === 'tf' ? (it.answer ? 'True' : 'False') : it.answer;
      return `<li>${yes(pk === it.answer)} ${esc(it.text)} <b>${it.t === 'tf' ? right : optHtml(right)}</b>${it.note ? `<div class="muted">${esc(it.note)}</div>` : ''}</li>`;
    }).join('')}</ol>`;
  },
};
// For the office screen: how everyone did on each item, and the hardest one.
export function roundSummary(m, guesses) {
  if (!m?.items?.length) return '';
  const stats = m.items.map((it, i) => {
    let ok = 0, tot = 0;
    guesses.forEach((g) => { const r = roundScore({ items: [it] }, { picks: [g?.picks?.[i]] }); ok += r.ok; tot += r.units; });
    return { it, share: tot ? ok / tot : 0 };
  });
  const hard = stats.slice().sort((x, y) => x.share - y.share)[0];
  const right = hard.it.t === 'tf' ? (hard.it.answer ? 'true' : 'false') : hard.it.t === 'pick' ? hard.it.answer : '';
  return `Hardest: “${esc(hard.it.text)}”${right && !isImg(right) ? ` (${esc(right)})` : ''}, ${Math.round(hard.share * 100)} % got it`;
}

export const LAB = { circle, country, glass, jar, centre, angle, maze, round };

// Short correct answer for the office screen (null = show the picture reveal instead).
export function labAnswer(kind, m) {
  if (kind === 'jar') return `${m.count ?? jarBeans(m).length} beans`;
  if (kind === 'angle') return `${m.target ?? ANGLES[m.preset].target}°`;
  if (kind === 'glass') return `${Math.round(levelFor({ rb: m.rb ?? GLASSES[m.glass].rb, rt: m.rt ?? GLASSES[m.glass].rt }, m.target / 100) * 100)} % up`;
  if (kind === 'maze') return '5 000 + 5 000';
  return null;
}
// What the closest player answered, in words (for the screen's results).
export function labGuess(kind, m, a) {
  if (!a) return '';
  if (kind === 'jar' && a.value) return `guessed ${Number(a.value).toLocaleString('sv-SE')}`;
  if (kind === 'angle' && a.deg != null) return `${Math.abs(a.deg).toFixed(1)}°`;
  if (kind === 'glass' && a.level != null) return `${Math.round(a.level * 100)} % up`;
  if (kind === 'maze' && a.holes) return a.holes.slice(0, 2).map((v) => v.toLocaleString('sv-SE')).join(' + ');
  return '';
}
// A fun fact to show when the question has none of its own.
export function labFact(kind, m) {
  if (kind === 'jar') return `Trick: beans across × across × up × 0.6, here ${m.across} × ${m.across} × ${m.height} × 0.6 ≈ ${jarRule(m)}.`;
  if (kind === 'glass' && m.glass === 'martini') return 'A cone holds most of its drink near the top: half the volume sits at about 79 % of the height.';
  return '';
}
// Picture shown on the office screen next to today's question, so people can study it.
export function labScreenPic(kind, m) {
  if (kind === 'centre') return `<svg class="pic lab-pic" viewBox="0 0 100 100"><path class="lab-shape" d="${pathD(shapeIn100(m.shape), true)}"/></svg>`;
  if (kind === 'glass') return glassSvg(GLASSES[m.glass], []).replace('class="lab-pad"', 'class="pic lab-pic"');
  if (kind === 'jar') return '<canvas class="pic lab-pic" width="480" height="570" data-jar="1"></canvas>';
  return '';
}

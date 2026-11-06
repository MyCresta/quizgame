// Ballpark lab: new challenge types being tried out in Admin → Try it before they go into the quiz.
// Each challenge has: setup(el, params, onAnswer) to play it, score(params, answer) -> { points, metrics },
// and reveal(params, answer) -> SVG/HTML that shows the real answer next to yours.
import { COUNTRIES, FIGURES } from './shapes.js';

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
function iou(a, b, n = 140) {
  const all = a.concat(b);
  const x0 = Math.min(...all.map((q) => q[0])), x1 = Math.max(...all.map((q) => q[0]));
  const y0 = Math.min(...all.map((q) => q[1])), y1 = Math.max(...all.map((q) => q[1]));
  const st = Math.max(x1 - x0, y1 - y0) / n;
  let both = 0, either = 0;
  for (let y = y0 + st / 2; y < y1; y += st) for (let x = x0 + st / 2; x < x1; x += st) {
    const ia = inside(a, x, y), ib = inside(b, x, y);
    if (ia || ib) either++; if (ia && ib) both++;
  }
  return either ? both / either : 0;
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
function drawPad(el, onAnswer, { guide = '' } = {}) {
  el.innerHTML = `<svg class="lab-pad" viewBox="0 0 100 100">${guide}<path class="lab-ink" d=""/></svg>
    <p class="lab-hint">Draw in one go without lifting your finger. Drawing again starts over.</p>`;
  const svg = el.querySelector('svg'), ink = el.querySelector('.lab-ink');
  let pts = null;
  svg.addEventListener('pointerdown', (e) => { e.preventDefault(); svg.setPointerCapture(e.pointerId); pts = [svgPoint(svg, e)]; ink.setAttribute('d', pathD(pts)); onAnswer(null); });
  svg.addEventListener('pointermove', (e) => {
    if (!pts) return;
    const q = svgPoint(svg, e), l = pts[pts.length - 1];
    if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.6) { pts.push(q); ink.setAttribute('d', pathD(pts)); }
  });
  const end = () => {
    if (!pts) return;
    const done = pts; pts = null;
    if (done.length < 8) { ink.setAttribute('d', ''); return; }
    ink.setAttribute('d', pathD(done, true));
    onAnswer({ pts: done.map((p) => [r2(p[0]), r2(p[1])]) });
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
  title: '⭕ Perfect circle', prompt: () => 'Draw a perfect circle',
  params: [{ k: 'tol', label: 'Strictness (roundness error at which points fall off; lower = stricter)', def: 0.08, step: 0.01 }],
  setup(el, p, onAnswer) { drawPad(el, onAnswer); },
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
  title: '✏️ Draw a country', prompt: (p) => `Draw the outline of ${COUNTRIES[p.country].name}`,
  params: [
    { k: 'country', label: 'Country', def: 'sweden', options: Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, v.name])) },
    { k: 'floor', label: 'Overlap that gives 0 points', def: 0.45, step: 0.05 },
    { k: 'top', label: 'Overlap that gives full points', def: 0.9, step: 0.05 },
  ],
  setup(el, p, onAnswer) { drawPad(el, onAnswer); },
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
function glassSvg(g, levels) {
  const H = GLASS.bottom - GLASS.top, yAt = (h) => GLASS.bottom - h * H, rAt = (h) => g.rb + (g.rt - g.rb) * h;
  const outline = `M${GLASS.x - g.rt},${GLASS.top} L${GLASS.x - g.rb},${GLASS.bottom} L${GLASS.x + g.rb},${GLASS.bottom} L${GLASS.x + g.rt},${GLASS.top}`;
  const stem = g.rb === 0 ? `<path class="lab-glass" d="M50,${GLASS.bottom} V96 M38,96 H62"/>` : '';
  const fill = (h, cls) => { const y = yAt(h), r = rAt(h);
    return `<path class="${cls}" d="M${GLASS.x - r},${y} L${GLASS.x - g.rb},${GLASS.bottom} L${GLASS.x + g.rb},${GLASS.bottom} L${GLASS.x + r},${y}Z"/>`; };
  const line = (h, cls) => { const y = yAt(h), r = rAt(h); return `<line class="${cls}" x1="${GLASS.x - r - 6}" x2="${GLASS.x + r + 6}" y1="${y}" y2="${y}"/>`; };
  return `<svg class="lab-pad" viewBox="0 0 100 100">${levels.map((l) => (l.fill ? fill(l.h, 'lab-water') : '') + (l.line ? line(l.h, l.line) : '')).join('')}
    <path class="lab-glass" d="${outline}"/>${stem}</svg>`;
}
const glass = {
  title: '🍸 Fill the glass', prompt: (p) => `Fill the glass so it holds exactly ${p.target === 50 ? 'half' : `${p.target} %`} of what it can`,
  params: [
    { k: 'glass', label: 'Glass', def: 'martini', options: Object.fromEntries(Object.entries(GLASSES).map(([k, v]) => [k, v.name])) },
    { k: 'target', label: 'Target (% of the volume)', def: 50, step: 5 },
    { k: 'tol', label: 'Volume error that gives 0 points (%-points)', def: 30, step: 5 },
  ],
  setup(el, p, onAnswer) {
    const g = GLASSES[p.glass];
    el.innerHTML = `<div class="lab-stage">${glassSvg(g, [])}</div><p class="lab-hint">Touch the glass and drag up or down to pour.</p>`;
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
    return { points: pts10k(curve(err, p.tol)), metrics: { 'You filled': `${v.toFixed(1)} % of the volume`, 'Your level': `${Math.round(a.level * 100)} % of the height`, 'Right level': `${Math.round(levelFor(g, p.target / 100) * 100)} % of the height` } };
  },
  reveal(p, a) {
    const g = GLASSES[p.glass], right = levelFor(g, p.target / 100);
    return glassSvg(g, [{ h: right, fill: true, line: 'lab-real' }, { h: a.level, line: 'lab-level' }])
      + '<p class="lab-legend"><span class="k-real">blue + dashed = right level</span> · <span class="k-you">your level</span></p>';
  },
};

// ---------- 🫘 Bean jar ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function jarBeans(p) {
  const rand = rng(p.seed), R = p.across / 2 - 0.5, beans = [];
  const dz = 0.82, rows = Math.sqrt(3) / 2;
  for (let L = 0; L < p.layers; L++) {
    const ox = L % 2 ? 0.5 : 0, oy = L % 2 ? rows / 3 : 0;
    const top = L === p.layers - 1;
    for (let j = -Math.ceil(R / rows) - 1; j <= Math.ceil(R / rows) + 1; j++) for (let i = -Math.ceil(R) - 1; i <= Math.ceil(R) + 1; i++) {
      const x = i + (j % 2 ? 0.5 : 0) + ox, y = j * rows + oy;
      if (x * x + y * y > R * R) continue;
      if (top && rand() > p.topFill) continue;   // the top layer is only partly full
      beans.push({ x: x + (rand() - 0.5) * 0.14, y: y + (rand() - 0.5) * 0.14, z: L * dz + 0.5 + (top ? (rand() - 0.5) * 0.2 : 0), rot: rand() * Math.PI, c: Math.floor(rand() * 7) });
    }
  }
  return beans;
}
const BEAN_COLOURS = [['#e63946', '#7a1018'], ['#f4a261', '#8a4a12'], ['#ffd166', '#8c6a00'], ['#06d6a0', '#03664b'], ['#9b5de5', '#4b2380'], ['#f15bb5', '#7a1d55'], ['#f8f4e3', '#9b9070']];
export function drawJar(canvas, p) {
  const beans = jarBeans(p), ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, tilt = 0.32, ct = Math.cos(tilt), stl = Math.sin(tilt);
  const R = p.across / 2, Hj = p.layers * 0.82 + 1.2;
  const s = Math.min((W * 0.86) / (2 * R), (H * 0.86) / (Hj * ct + 2 * R * stl));
  const cx = W / 2, by = H - (H - (Hj * ct + 2 * R * stl) * s) / 2 - R * stl * s;
  const X = (x) => cx + x * s, Y = (y, z) => by - z * ct * s - y * stl * s;
  ctx.clearRect(0, 0, W, H);
  // back of the jar
  ctx.fillStyle = 'rgba(180,220,255,0.06)'; ctx.strokeStyle = 'rgba(200,230,255,0.35)'; ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath(); ctx.ellipse(cx, Y(0, 0), R * s, R * stl * s, 0, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  beans.sort((a, b) => (-a.y * ct + a.z * stl) - (-b.y * ct + b.z * stl));
  for (const b of beans) {
    const [c1, c2] = BEAN_COLOURS[b.c], x = X(b.x), y = Y(b.y, b.z), rx = 0.56 * s, ry = 0.4 * s;
    const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.45, ry * 0.1, x, y, rx * 1.1);
    g.addColorStop(0, '#fff'); g.addColorStop(0.18, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, b.rot, 0, 2 * Math.PI); ctx.fill();
  }
  // glass walls, rim and shine in front
  ctx.strokeStyle = 'rgba(210,235,255,0.55)';
  ctx.beginPath(); ctx.moveTo(X(-R), Y(0, 0)); ctx.lineTo(X(-R), Y(0, Hj)); ctx.moveTo(X(R), Y(0, 0)); ctx.lineTo(X(R), Y(0, Hj)); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, Y(0, 0), R * s, R * stl * s, 0, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, Y(0, Hj), R * s, R * stl * s, 0, 0, 2 * Math.PI); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(X(-R * 0.75), Y(0, Hj * 0.92), R * 0.18 * s, Hj * ct * 0.8 * s);
  return beans.length;
}
const jar = {
  title: '🫘 Beans in a jar', prompt: () => 'How many jelly beans are in the jar?',
  params: [
    { k: 'seed', label: 'Jar number (any number makes a new jar)', def: 7, step: 1 },
    { k: 'across', label: 'Beans across', def: 9, step: 1 },
    { k: 'layers', label: 'Layers', def: 12, step: 1 },
    { k: 'topFill', label: 'How full the top layer is (0–1)', def: 0.5, step: 0.1 },
    { k: 'tol', label: 'Ratio error that gives 0 points (0.3 = off by 2×)', def: 0.3, step: 0.05 },
  ],
  setup(el, p, onAnswer) {
    el.innerHTML = `<canvas class="lab-jar" width="640" height="760"></canvas>
      <label class="field"><span>Your guess</span><input class="input lab-num" type="number" inputmode="numeric" min="1" placeholder="e.g. 350"></label>`;
    drawJar(el.querySelector('canvas'), p);
    const inp = el.querySelector('input');
    inp.addEventListener('input', () => { const v = Math.round(+inp.value); onAnswer(v > 0 ? { value: v } : null); });
  },
  score(p, a) {
    const n = jarBeans(p).length, err = Math.abs(Math.log10(a.value / n));
    return { points: pts10k(curve(err, p.tol)), metrics: { 'Beans in the jar': n, 'Your guess': a.value, 'Off by': `${Math.round(Math.abs(a.value / n - 1) * 100)} %` } };
  },
  reveal(p) { return `<p class="lab-big">${jarBeans(p).length} beans</p><p class="lab-legend">${p.layers} layers of about ${Math.round(jarBeans({ ...p, layers: 1, topFill: 1 }).length)} beans, the top one partly full.</p>`; },
};

// ---------- 🎯 Centre of mass ----------
const SHAPES = { ...Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, v])), ...FIGURES };
function shapeIn100(key) {   // scale the shape into the 100×100 view, centred
  const pts = SHAPES[key].pts, w = Math.max(...pts.map((q) => q[0])), h = Math.max(...pts.map((q) => q[1]));
  const s = 84 / Math.max(w, h), ox = (100 - w * s) / 2, oy = (100 - h * s) / 2;
  return pts.map(([x, y]) => [ox + x * s, oy + y * s]);
}
const centre = {
  title: '🎯 Centre of mass', prompt: (p) => `Tap the centre of mass of ${COUNTRIES[p.shape] ? COUNTRIES[p.shape].name : 'this shape'}`,
  params: [
    { k: 'shape', label: 'Shape', def: 'sweden', options: Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, v.name])) },
    { k: 'tol', label: 'Miss (share of the shape\u2019s longest side) that gives 0 points', def: 0.25, step: 0.05 },
  ],
  setup(el, p, onAnswer) {
    const poly = shapeIn100(p.shape);
    el.innerHTML = `<svg class="lab-pad" viewBox="0 0 100 100"><path class="lab-shape" d="${pathD(poly, true)}"/><g class="lab-mark" style="display:none"><circle r="2.6"/><path d="M-5,0H5M0,-5V5"/></g></svg>
      <p class="lab-hint">Imagine the shape cut out of cardboard. Where would it balance on a pin? Tap to place, tap again to move.</p>`;
    const svg = el.querySelector('svg'), mark = el.querySelector('.lab-mark');
    svg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
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
  title: '📐 Match the angle', prompt: (p) => ANGLES[p.preset].prompt,
  params: [
    { k: 'preset', label: 'What', def: 'pisa', options: Object.fromEntries(Object.entries(ANGLES).map(([k, v]) => [k, v.name])) },
    { k: 'tol', label: 'Degrees off that gives 0 points', def: 10, step: 1 },
  ],
  setup(el, p, onAnswer) {
    const A = ANGLES[p.preset];
    let deg = 0;
    const paint = () => { el.querySelector('.lab-stage').innerHTML = angleSvg(A.look, A.from, deg); };
    el.innerHTML = '<div class="lab-stage"></div><p class="lab-hint">Drag sideways anywhere on the picture to tilt it.</p>';
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

export const LAB = { circle, country, glass, jar, centre, angle };

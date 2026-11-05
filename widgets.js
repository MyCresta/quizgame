// Interactive answer widgets: colour picker, drag-to-sort list, percent slider, stop-the-clock timer.
import { esc, rhythmTimeline, rhythmVerdict, rhythmPoints } from './common.js';

// ---------- colour helpers ----------
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');

function hsvToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

// Drag helper: calls fn(xFraction, yFraction) while the pointer is held down on el.
function dragArea(el, fn) {
  const at = (e) => {
    const r = el.getBoundingClientRect();
    fn(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); at(e); });
  el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) at(e); });
}

// Hue bar + saturation/brightness square. onChange(hex) fires on every change made by the user.
export function createColorPicker(el, { value = null, onChange = () => {} } = {}) {
  el.innerHTML = `<div class="cp">
    <div class="cp-sv"><div class="cp-white"></div><div class="cp-black"></div><div class="cp-knob"></div></div>
    <div class="cp-hue"><div class="cp-hue-knob"></div></div>
  </div>`;
  const sv = el.querySelector('.cp-sv'), knob = el.querySelector('.cp-knob');
  const hue = el.querySelector('.cp-hue'), hueKnob = el.querySelector('.cp-hue-knob');
  let [h, s, v] = value ? rgbToHsv(...hexToRgb(value)) : [150, 0.6, 0.7];
  const hex = () => rgbToHex(...hsvToRgb(h, s, v));
  const draw = () => {
    sv.style.background = `hsl(${h}, 100%, 50%)`;
    knob.style.left = `${s * 100}%`; knob.style.top = `${(1 - v) * 100}%`;
    knob.style.background = hex();
    hueKnob.style.left = `${(h / 360) * 100}%`;
    hueKnob.style.background = `hsl(${h}, 100%, 50%)`;
  };
  dragArea(sv, (x, y) => { s = x; v = 1 - y; draw(); onChange(hex()); });
  dragArea(hue, (x) => { h = Math.min(359.9, x * 360); draw(); onChange(hex()); });
  draw();
  return {
    get: hex,
    set(newHex) { const rgb = hexToRgb(newHex); if (!rgb) return; [h, s, v] = rgbToHsv(...rgb); draw(); },
  };
}

// Drag-to-reorder list (works with touch and mouse). onChange(items) after each drop.
export function createSortable(el, items, { onChange = () => {} } = {}) {
  let order = items.slice();
  const render = () => {
    el.innerHTML = `<div class="srt">${order.map((it, i) => `
      <div class="srt-item" data-i="${i}"><span class="srt-pos">${i + 1}</span><span class="srt-label">${esc(it)}</span><span class="srt-grip" aria-hidden="true">⠿</span></div>`).join('')}</div>`;
    el.querySelectorAll('.srt-item').forEach((row) => row.addEventListener('pointerdown', start));
  };
  let drag = null;
  function start(e) {
    if (e.button > 0) return;
    e.preventDefault();
    const rows = [...el.querySelectorAll('.srt-item')];
    const row = e.currentTarget;
    const from = +row.dataset.i;
    const tops = rows.map((r) => r.offsetTop);
    const step = rows.length > 1 ? tops[1] - tops[0] : row.offsetHeight;
    drag = { rows, row, from, to: from, step, startY: e.clientY, id: e.pointerId };
    row.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    navigator.vibrate?.(8);
    row.addEventListener('pointermove', move);
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.startY;
    const n = drag.rows.length;
    const minDy = -drag.from * drag.step, maxDy = (n - 1 - drag.from) * drag.step;
    const cdy = Math.max(minDy, Math.min(maxDy, dy));
    drag.row.style.transform = `translateY(${cdy}px)`;
    const to = Math.max(0, Math.min(n - 1, drag.from + Math.round(cdy / drag.step)));
    if (to !== drag.to) navigator.vibrate?.(4);
    drag.to = to;
    drag.rows.forEach((r, i) => {
      if (r === drag.row) return;
      let shift = 0;
      if (drag.from < to && i > drag.from && i <= to) shift = -drag.step;
      if (drag.from > to && i < drag.from && i >= to) shift = drag.step;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }
  function end() {
    if (!drag) return;
    const { from, to } = drag;
    drag = null;
    const [it] = order.splice(from, 1);
    order.splice(to, 0, it);
    render();
    onChange(order.slice());
  }
  render();
  return { get: () => order.slice(), set(list) { order = list.slice(); render(); } };
}

// 0–100 % slider with fine-tune buttons. onChange(value) only fires after the user touches it.
export function createPercent(el, { value = null, onChange = () => {} } = {}) {
  el.innerHTML = `<div class="pct">
    <div class="pct-val"><span class="v">–</span><span class="u">%</span></div>
    <input type="range" min="0" max="100" step="1" value="${value ?? 50}" class="pct-range ${value == null ? 'untouched' : ''}" aria-label="Percentage">
    <div class="pct-row"><button type="button" class="pct-btn" data-d="-1">−1</button><span class="pct-hint">${value == null ? 'Drag the slider' : ''}</span><button type="button" class="pct-btn" data-d="1">+1</button></div>
  </div>`;
  const range = el.querySelector('.pct-range'), out = el.querySelector('.v'), hint = el.querySelector('.pct-hint');
  const show = (v) => { out.textContent = v; range.style.setProperty('--p', `${v}%`); };
  const set = (v) => { v = Math.max(0, Math.min(100, Math.round(v))); range.value = v; range.classList.remove('untouched'); hint.textContent = ''; show(v); onChange(v); };
  range.addEventListener('input', () => set(+range.value));
  el.querySelectorAll('.pct-btn').forEach((b) => b.onclick = () => set((range.classList.contains('untouched') ? 50 : +range.value) + +b.dataset.d));
  if (value != null) show(value); else range.style.setProperty('--p', '50%');
  return { set };
}

// Stop-the-clock: one attempt. Uses the touch events' own high-resolution timestamps.
// onDone(seconds) fires once when the player stops the clock.
export function createTimer(el, { target, done = false, onDone = () => {} } = {}) {
  el.innerHTML = `<div class="tmr">
    <div class="tmr-target">Stop at exactly <b>${target}</b> second${target === 1 ? '' : 's'}</div>
    <button type="button" class="tmr-btn">Start</button>
    <div class="tmr-hint"></div>
  </div>`;
  const btn = el.querySelector('.tmr-btn'), hint = el.querySelector('.tmr-hint');
  let t0 = null;
  const lock = () => {
    btn.disabled = true; btn.textContent = 'Done ✓'; btn.className = 'tmr-btn done';
    hint.textContent = 'Stopped! You’ll see how close you got along with your points.';
  };
  if (done) { lock(); return {}; }
  hint.textContent = 'No clock is shown. Tap Start, count in your head, then tap Stop. You only get one try!';
  const cancel = () => {
    if (t0 === null) return;
    t0 = null; btn.textContent = 'Start'; btn.className = 'tmr-btn';
    hint.textContent = 'You left the page, so that attempt didn’t count. Try again.';
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    if (t0 === null) {
      t0 = e.timeStamp;
      btn.textContent = 'Stop'; btn.className = 'tmr-btn running';
      hint.textContent = 'Counting… tap Stop when you think the time is up.';
      return;
    }
    const secs = (e.timeStamp - t0) / 1000;
    if (secs < 0.3) return;   // ignore an accidental double tap
    t0 = null;
    lock();
    navigator.vibrate?.(30);
    onDone(Math.round(secs * 1000) / 1000);
  });
  return {};
}

// ---------- Tap the rhythm ----------
// Practice: watch "Shave and a haircut… two bits" (public domain), then tap it back and see a timeline.
// Your turn: hum the song, tap the rhythm from memory (N taps, first tap starts). onDone(taps in ms from the first tap).

export const PRACTICE_RHYTHM = [0, 500, 750, 1000, 1500, 2500, 3000];
const MAX_PAUSE = 3000;

function tapCircle(cls, label, count) {
  return `<button type="button" class="tmp-circle ${cls}" aria-label="Tap"><span class="tmp-dot"></span><span class="tmp-label">${label}</span>${count != null ? `<span class="tmp-count">${count}</span>` : ''}</button>`;
}
const flash = (circle) => { circle.classList.remove('pulse'); void circle.offsetWidth; circle.classList.add('pulse'); };
const ripple = (circle) => { circle.classList.remove('hit'); void circle.offsetWidth; circle.classList.add('hit'); navigator.vibrate?.(12); };

// Plays a rhythm on a circle (flash + short vibration per note). Returns a cancel function.
function playRhythm(circle, ref, onEnd) {
  const timers = ref.map((ms) => setTimeout(() => { flash(circle); navigator.vibrate?.(20); }, 400 + ms));
  timers.push(setTimeout(onEnd, 400 + ref[ref.length - 1] + 500));
  return () => timers.forEach(clearTimeout);
}

export function createRhythm(el, { count, hint = '', done = false, onDone = () => {} } = {}) {
  let stage = done ? 'done' : 'practice';
  let cancelDemo = () => {};

  function collectTaps(circle, n, counter, fb, finish) {
    let taps = [];
    circle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); ripple(circle);
      if (taps.length && e.timeStamp - taps[taps.length - 1] > MAX_PAUSE) { taps = []; fb.textContent = 'That pause was long, so we started over.'; }
      taps.push(e.timeStamp);
      counter.textContent = `${taps.length} / ${n}`;
      if (taps.length === 1) fb.textContent = 'Keep going…';
      if (taps.length === n) { const rel = taps.map((t) => Math.round(t - taps[0])); taps = []; finish(rel); }
    });
  }

  function render() {
    cancelDemo();
    if (stage === 'practice') {
      el.innerHTML = `<div class="tmp">
        <div class="tmp-step">1 · Practice</div>
        <p class="tmp-text">Watch the circle knock a rhythm (<i>"shave and a haircut… two bits"</i>), then tap it back, <b>one tap per knock</b>. This is just practice, not today's song.</p>
        <div class="tmp-slot"></div>
        <div class="tmp-feedback" aria-live="polite">&nbsp;</div>
        <div class="tmp-row"><button type="button" class="btn ghost" data-a="show">▶ Show again</button><button type="button" class="btn" data-a="ready">Ready →</button></div>
      </div>`;
      const slot = el.querySelector('.tmp-slot'), fb = el.querySelector('.tmp-feedback');
      const n = PRACTICE_RHYTHM.length;
      const show = () => {
        cancelDemo();
        slot.innerHTML = tapCircle('demo', 'Watch', null);
        fb.textContent = 'Watch the rhythm…';
        cancelDemo = playRhythm(slot.querySelector('.tmp-circle'), PRACTICE_RHYTHM, () => {
          slot.innerHTML = tapCircle('go', 'Tap', `0 / ${n}`);
          const c = slot.querySelector('.tmp-circle');
          fb.textContent = 'Now tap it back. Your first tap starts it.';
          collectTaps(c, n, c.querySelector('.tmp-count'), fb, (taps) => {
            const pts = rhythmPoints(PRACTICE_RHYTHM, taps, 0.5);
            fb.innerHTML = `${rhythmTimeline(PRACTICE_RHYTHM, taps)}<div class="tmp-verdict">${rhythmVerdict(PRACTICE_RHYTHM, taps)} <span class="muted">(${pts.toLocaleString('sv-SE')} pts)</span></div>`;
            c.querySelector('.tmp-count').textContent = 'Tap again to retry';
          });
        });
      };
      el.querySelector('[data-a="show"]').onclick = show;
      el.querySelector('[data-a="ready"]').onclick = () => { stage = 'turn'; render(); };
      show();
      return;
    }
    if (stage === 'turn') {
      el.innerHTML = `<div class="tmp">
        <div class="tmp-step">2 · Your turn</div>
        <p class="tmp-text">Hum the song in your head${hint ? ` <span class="tmp-hint">(${esc(hint)})</span>` : ''} and tap its rhythm: <b>${count} taps</b>, one per note. <b>Your first tap starts it</b>, no rush.</p>
        ${tapCircle('go', 'Tap', `0 / ${count}`)}
        <div class="tmp-feedback" aria-live="polite">&nbsp;</div>
        <button type="button" class="btn ghost block" data-a="practice">← Practice again</button>
      </div>`;
      const circle = el.querySelector('.tmp-circle');
      collectTaps(circle, count, el.querySelector('.tmp-count'), el.querySelector('.tmp-feedback'), (taps) => {
        onDone(taps); stage = 'done'; navigator.vibrate?.(30); render();
      });
      el.querySelector('[data-a="practice"]').onclick = () => { stage = 'practice'; render(); };
      return;
    }
    el.innerHTML = `<div class="tmp">
      <div class="tmp-circle done" aria-hidden="true"><span class="tmp-label">✓</span></div>
      <p class="tmp-text"><b>Got it!</b> You'll see how close you were with your points.</p>
      <button type="button" class="btn ghost block" data-a="redo">Redo</button>
    </div>`;
    el.querySelector('[data-a="redo"]').onclick = () => { stage = 'turn'; render(); };
  }
  render();
  return {};
}

// For question authors: record the real rhythm by tapping along while the song plays.
// Stops after a 2-second pause. onChange(taps | null).
export function createRecorder(el, { initial = null, onChange = () => {} } = {}) {
  let rec = initial;
  function render() {
    el.innerHTML = rec ? `<div class="tmp">
        ${rhythmTimeline(rec, null)}
        <div class="tmp-verdict"><b>${rec.length} taps</b> · ${(rec[rec.length - 1] / 1000).toFixed(1)} s</div>
        <button type="button" class="btn ghost" data-a="again">Record again</button>
      </div>` : `<div class="tmp">
        <p class="tmp-text">Play the song, and tap along with the part players should tap, <b>one tap per note or syllable</b>. Recording stops after a 2-second pause.</p>
        ${tapCircle('go', 'Tap', '0 taps')}
      </div>`;
    if (rec) { el.querySelector('[data-a="again"]').onclick = () => { rec = null; onChange(null); render(); }; return; }
    const circle = el.querySelector('.tmp-circle'), cnt = el.querySelector('.tmp-count');
    let taps = [], timer = null;
    circle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); ripple(circle);
      taps.push(e.timeStamp);
      cnt.textContent = `${taps.length} tap${taps.length === 1 ? '' : 's'}`;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (taps.length < 3) { taps = []; cnt.textContent = 'Need at least 3 taps'; return; }
        rec = taps.slice(0, 20).map((t) => Math.round(t - taps[0])); onChange(rec); render();
      }, 2000);
    });
  }
  render();
  return { get: () => rec };
}

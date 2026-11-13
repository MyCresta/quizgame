// Interactive answer widgets: colour picker, drag-to-sort list, percent slider, stop-the-clock timer.
import { esc, rhythmTimeline, rhythmVerdict, rhythmPoints } from './common.js?v=202611130834';

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
// Practice: watch the first line of "Små grodorna" (traditional), then tap it back and see a timeline.
// Your turn: hum the song, tap the rhythm from memory (N taps, first tap starts). onDone(taps in ms from the first tap).

// Practice tune: the first line of "Små grodorna" (traditional), from the sheet music: 2/4 with a pickup, ♩ ≈ 112.
// Onsets in eighth notes: c | A>A A c | A>A A c | d c B A | G2
export const PRACTICE_RHYTHM = [0, 1, 2.5, 3, 4, 5, 6.5, 7, 8, 9, 10, 11, 12, 13].map((e) => Math.round(e * 268));
export const PRACTICE_WORDS = ['Små', 'gro', 'dor', 'na', 'små', 'gro', 'dor', 'na', 'är', 'lus', 'ti', 'ga', 'att', 'se'];
const MAX_PAUSE = 12000;   // only a really long break restarts an attempt (some rhythms have long gaps)

function tapCircle(cls, label, count) {
  return `<button type="button" class="tmp-circle ${cls}" aria-label="Tap"><span class="tmp-dot"></span><span class="tmp-label">${label}</span>${count != null ? `<span class="tmp-count">${count}</span>` : ''}</button>`;
}
const flash = (circle) => { circle.classList.remove('pulse'); void circle.offsetWidth; circle.classList.add('pulse'); };
const ripple = (circle) => { circle.classList.remove('hit'); void circle.offsetWidth; circle.classList.add('hit'); navigator.vibrate?.(12); };

// Plays a rhythm on a circle (flash + short vibration per note). Returns a cancel function.
function playRhythm(circle, ref, onEnd, onNote = () => {}) {
  const timers = ref.map((ms, i) => setTimeout(() => { flash(circle); navigator.vibrate?.(20); onNote(i + 1); }, 400 + ms));
  timers.push(setTimeout(onEnd, 400 + ref[ref.length - 1] + 500));
  return () => timers.forEach(clearTimeout);
}

// words: syllables to show karaoke-style (one tap per syllable); otherwise `hint` says what to tap.
export function syllables(text) {
  return String(text || '').trim().split(/[\s\-·]+/).map((x) => x.trim()).filter(Boolean);
}

// Just the player's own taps as dots (doesn't give away the real rhythm).
function tapsStrip(taps) {
  const W = 340, L = 8, end = Math.max(1, taps[taps.length - 1]);
  const x = (ms) => L + (ms / end) * (W - 2 * L);
  return `<svg class="rtl" viewBox="0 0 ${W} 22" width="100%" role="img" aria-label="Your taps">
    <line x1="${L}" x2="${W - L}" y1="11" y2="11" stroke="var(--line)" stroke-width="2"/>
    ${taps.map((ms) => `<circle cx="${x(ms)}" cy="11" r="5.5" class="rtl-tap"/>`).join('')}</svg>`;
}
const GUARD_MS = 700;   // buttons ignore taps this long after the last tap, so an extra tap can't hit them

export function createRhythm(el, { count, hint = '', words = null, done = false, onDone = () => {} } = {}) {
  let stage = done ? 'done' : 'practice';
  let cancelDemo = () => {};
  let pending = null;   // a finished attempt that isn't locked in yet

  // Collects exactly n taps, then the circle goes inert: extra taps do nothing until the player presses Try again.
  function collectTaps(circle, n, counter, fb, finish, onTap = () => {}) {
    let taps = [], full = false;
    circle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (full) return;
      ripple(circle);
      if (taps.length && e.timeStamp - taps[taps.length - 1] > MAX_PAUSE) { taps = []; fb.textContent = 'That pause was long, so we started over.'; }
      taps.push(e.timeStamp);
      onTap(taps.length);
      counter.textContent = `${taps.length} / ${n}`;
      if (taps.length === 1) fb.textContent = 'Keep going…';
      if (taps.length === n) {
        full = true;
        circle.classList.add('full'); circle.querySelector('.tmp-label').textContent = '✓';
        counter.textContent = `${n} / ${n}`;
        navigator.vibrate?.(30);
        finish(taps.map((t) => Math.round(t - taps[0])));
      }
    });
  }
  // Show buttons but ignore presses for a moment (catches the "one tap too many").
  function guard(btns) {
    btns.forEach((b) => { b.disabled = true; });
    setTimeout(() => btns.forEach((b) => { b.disabled = false; }), GUARD_MS);
  }

  function render() {
    cancelDemo();
    if (stage === 'practice') {
      el.innerHTML = `<div class="tmp">
        <div class="tmp-step">1 · Practice</div>
        <p class="tmp-text">Watch the circle tap the first line of <b>Små grodorna</b>, one flash per syllable. Then sing it in your head and tap it back. This is just practice, not today's song.</p>
        <div class="tmp-words">${PRACTICE_WORDS.map((w, k) => `<span data-k="${k}">${w}</span>`).join('')}</div>
        <div class="tmp-slot"></div>
        <div class="tmp-feedback" aria-live="polite">&nbsp;</div>
        <button type="button" class="btn ghost block" data-a="again" hidden>↻ Try again</button>
        <div class="tmp-row"><button type="button" class="btn ghost" data-a="show">▶ Show again</button><button type="button" class="btn" data-a="ready">Ready →</button></div>
      </div>`;
      const slot = el.querySelector('.tmp-slot'), fb = el.querySelector('.tmp-feedback'), again = el.querySelector('[data-a="again"]');
      const lightUp = (k) => el.querySelectorAll('.tmp-words span').forEach((sp) => sp.classList.toggle('on', +sp.dataset.k < k));
      const n = PRACTICE_RHYTHM.length;
      const arm = (msg) => {
        again.hidden = true;
        slot.innerHTML = tapCircle('go', 'Tap', `0 / ${n}`);
        const c = slot.querySelector('.tmp-circle');
        fb.textContent = msg;
        collectTaps(c, n, c.querySelector('.tmp-count'), fb, (taps) => {
          const pts = rhythmPoints(PRACTICE_RHYTHM, taps, 0.5);
          fb.innerHTML = `${rhythmTimeline(PRACTICE_RHYTHM, taps)}<div class="tmp-verdict">${rhythmVerdict(PRACTICE_RHYTHM, taps)} <span class="muted">(${pts.toLocaleString('sv-SE')} pts)</span></div>`;
          again.hidden = false; guard([again]);
        }, lightUp);
        lightUp(0);
      };
      const show = () => {
        cancelDemo();
        again.hidden = true;
        slot.innerHTML = tapCircle('demo', 'Watch', null);
        fb.textContent = 'Watch the rhythm…';
        lightUp(0);
        cancelDemo = playRhythm(slot.querySelector('.tmp-circle'), PRACTICE_RHYTHM, () => arm('Now tap it back, one tap per syllable. Your first tap starts it.'), lightUp);
      };
      again.onclick = () => arm('Go again. Your first tap starts it.');
      el.querySelector('[data-a="show"]').onclick = show;
      el.querySelector('[data-a="ready"]').onclick = () => { stage = 'turn'; render(); };
      show();
      return;
    }
    if (stage === 'turn') {
      const what = words?.length
        ? `<div class="tmp-what"><span>Sing it in your head and tap <b>once per syllable</b>:</span></div>
           <div class="tmp-words">${words.map((w, k) => `<span data-k="${k}">${esc(w)}</span>`).join('')}</div>`
        : `<div class="tmp-what"><span class="tmp-what-big">👉 ${esc(hint || 'Tap the rhythm')}</span><span>${count} taps, from memory</span></div>`;
      el.innerHTML = `<div class="tmp">
        <div class="tmp-step">2 · Your turn</div>
        ${what}
        ${tapCircle('go', 'Tap', `0 / ${count}`)}
        <div class="tmp-feedback" aria-live="polite">Your first tap starts it, no rush. You can try as many times as you like.</div>
        <div class="tmp-row" data-r="decide" hidden><button type="button" class="btn ghost" data-a="again">↻ Try again</button><button type="button" class="btn" data-a="lock">Lock in ✓</button></div>
        <button type="button" class="btn ghost block" data-a="practice">← Practice again</button>
      </div>`;
      const circle = el.querySelector('.tmp-circle'), fb = el.querySelector('.tmp-feedback');
      const decide = el.querySelector('[data-r="decide"]');
      const lightUp = (k) => el.querySelectorAll('.tmp-words span').forEach((sp) => sp.classList.toggle('on', +sp.dataset.k < k));
      collectTaps(circle, count, el.querySelector('.tmp-count'), fb, (taps) => {
        pending = taps;
        fb.innerHTML = `${tapsStrip(taps)}<div class="tmp-verdict">Your take: <b>${(taps[taps.length - 1] / 1000).toFixed(1)} s</b>. Happy with it? Lock it in, or try again.</div>`;
        decide.hidden = false;
        el.querySelector('[data-a="practice"]').hidden = true;
        guard([...decide.querySelectorAll('button')]);
      }, lightUp);
      el.querySelector('[data-a="again"]').onclick = () => { pending = null; render(); };
      el.querySelector('[data-a="lock"]').onclick = () => { if (!pending) return; onDone(pending); pending = null; stage = 'done'; render(); };
      el.querySelector('[data-a="practice"]').onclick = () => { stage = 'practice'; render(); };
      return;
    }
    el.innerHTML = `<div class="tmp">
      <div class="tmp-circle done" aria-hidden="true"><span class="tmp-label">✓</span></div>
      <p class="tmp-text"><b>Locked in!</b> You'll see how close you were with your points.</p>
      <button type="button" class="btn ghost block" data-a="redo">Change my answer</button>
    </div>`;
    el.querySelector('[data-a="redo"]').onclick = () => { stage = 'turn'; render(); };
  }
  render();
  return {};
}

// For question authors: record the real rhythm by tapping along while the song plays.
// Finish with the Done button (or it stops by itself after 8 seconds without a tap). onChange(taps | null).
const RECORD_IDLE_STOP = 8000;
export function createRecorder(el, { initial = null, onChange = () => {} } = {}) {
  let rec = initial;
  function render() {
    el.innerHTML = rec ? `<div class="tmp">
        ${rhythmTimeline(rec, null)}
        <div class="tmp-verdict"><b>${rec.length} taps</b> · ${(rec[rec.length - 1] / 1000).toFixed(1)} s</div>
        <button type="button" class="btn ghost" data-a="again">Record again</button>
      </div>` : `<div class="tmp">
        <p class="tmp-text">Play the song, and tap along with exactly what players should tap. Long gaps are fine. Press <b>Done</b> after your last tap.</p>
        ${tapCircle('go', 'Tap', '0 taps')}
        <div class="tmp-row"><button type="button" class="btn ghost" data-a="reset">Start over</button><button type="button" class="btn" data-a="done" disabled>Done</button></div>
      </div>`;
    if (rec) { el.querySelector('[data-a="again"]').onclick = () => { rec = null; onChange(null); render(); }; return; }
    const circle = el.querySelector('.tmp-circle'), cnt = el.querySelector('.tmp-count'), doneBtn = el.querySelector('[data-a="done"]');
    let taps = [], timer = null;
    const finish = () => {
      clearTimeout(timer);
      if (taps.length < 3) { cnt.textContent = 'Need at least 3 taps'; return; }
      rec = taps.slice(0, 20).map((t) => Math.round(t - taps[0])); onChange(rec); render();
    };
    circle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); ripple(circle);
      taps.push(e.timeStamp);
      cnt.textContent = `${taps.length} tap${taps.length === 1 ? '' : 's'}`;
      doneBtn.disabled = taps.length < 3;
      clearTimeout(timer);
      timer = setTimeout(finish, RECORD_IDLE_STOP);
    });
    doneBtn.onclick = finish;
    el.querySelector('[data-a="reset"]').onclick = () => { clearTimeout(timer); taps = []; cnt.textContent = '0 taps'; doneBtn.disabled = true; };
  }
  render();
  return { get: () => rec };
}

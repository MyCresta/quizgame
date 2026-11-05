// The 3-question set editor, shared by the "add" page and the admin page.
import { fmt, fmtPts, esc, parseNumber, makeMap, pin, points, KIND_TAG } from './common.js';
import { createColorPicker, hexToRgb, createRecorder } from './widgets.js';

export const SCORING = [
  { id: 'r1', label: 'Ballpark: 10× off scores 1 point', scoring: 'ratio', tol: 1 },
  { id: 'r05', label: 'Tight: ~3× off scores 1 point', scoring: 'ratio', tol: 0.5 },
  { id: 'r2', label: 'Loose: 100× off scores 1 point', scoring: 'ratio', tol: 2 },
  { id: 'abs', label: 'Plain difference (years, temperatures…)', scoring: 'absolute' },
];
const RADIUS = [[300, 'Within 300 km (same region)'], [1000, 'Within 1 000 km (same country-ish)'], [2000, 'Within 2 000 km (same continent)'], [5000, 'Within 5 000 km (rough area of the world)']];
// Strictness presets for the other types: value = how far off scores 1 point
const PCT_TOL = [[15, 'Tight: 15 percentage points off scores 1 point'], [30, 'Normal: 30 points off scores 1 point'], [50, 'Loose: 50 points off scores 1 point']];
const TIME_TOL = [[0.15, 'Tight: 15 % of the target off scores 1 point'], [0.3, 'Normal: 30 % off scores 1 point'], [0.5, 'Loose: 50 % off scores 1 point']];
const TEMPO_TOL = [[0.3, 'Tight: speed and rhythm must be close'], [0.5, 'Normal'], [0.8, 'Loose']];
const COLOR_TOL = [[50, 'Tight: only close shades score well'], [70, 'Normal: any shade of the right colour scores well'], [100, 'Loose: generous for neighbouring colours too']];

export const KINDS = [
  ['number', '# Number'], ['map', '📍 Map pin'], ['percent', '% Percent'],
  ['time', '⏱ Timer'], ['color', '🎨 Colour'], ['order', '↕ Sort'],
  ['tempo', '🥁 Rhythm'],
];
const PLACEHOLDERS = {
  number: ['How far is it between our Stockholm and Gothenburg offices?', 'How many rolls of toilet paper does a person use in a lifetime?', 'How much does an average adult elephant weigh?'],
  map: ['Where was this photo taken?'],
  percent: ['What percentage of the Earth’s surface is covered by water?'],
  time: ['Stop the clock at exactly 10 seconds'],
  color: ['Pick the exact Spotify green'],
  order: ['Sort these buildings by height, tallest first'],
  tempo: ['Tap the rhythm of \u201cAnother one bites the dust\u201d (Queen)'],
};
const opts = (list, sel) => list.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');

async function geocode(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
  const [hit] = await r.json();
  return hit || null;
}

function block(uid, i) {
  return `<div class="card" id="${uid}-q${i}">
    <h2><span class="n">${i + 1}</span> Question ${i + 1}</h2>
    <div class="seg seg-kinds" data-f="kindseg">${KINDS.map(([k, l]) => `<button type="button" data-k="${k}">${l}</button>`).join('')}</div>
    <label class="field"><span>Question</span><textarea class="input" data-f="prompt" maxlength="300"></textarea></label>

    <div data-part="number" style="display:grid;gap:14px">
      <div class="row2">
        <label class="field"><span>Correct answer</span><input class="input num" data-f="answer" inputmode="decimal" placeholder="e.g. 398"></label>
        <label class="field"><span>Unit (optional)</span><input class="input" data-f="unit" maxlength="30" placeholder="km, rolls, years…"></label>
      </div>
      <div class="hint" data-f="answerPreview"></div>
      <label class="field"><span>How strict is the scoring?</span>
        <select class="input" data-f="scoring">${SCORING.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select></label>
      <label class="field hidden" data-part="abs"><span>1 point if the guess is off by</span><input class="input num" data-f="abstol" inputmode="decimal" placeholder="e.g. 50"></label>
      <div class="scoreprev" data-f="prev"></div>
    </div>

    <div data-part="map" class="hidden" style="display:grid;gap:12px">
      <div class="search"><input class="input" data-f="search" placeholder="Search a place to jump there"><button type="button" class="btn ghost" data-f="go">Find</button></div>
      <div class="map" data-f="map"></div>
      <div class="hint" data-f="maphint">Tap the map to place the correct spot. Players see a map without place names.</div>
      <div class="row2">
        <label class="field"><span>Name of the place (shown with the answer)</span><input class="input" data-f="label" maxlength="80" placeholder="e.g. Our Gothenburg office"></label>
        <label class="field"><span>1 point if further than</span><select class="input" data-f="radius">${RADIUS.map(([v, l]) => `<option value="${v}" ${v === 2000 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="hint">💡 Tip: add a photo link below and ask “Where was this photo taken?”</div>
    </div>

    <div data-part="percent" class="hidden" style="display:grid;gap:14px">
      <label class="field"><span>Correct answer (0–100 %)</span><input class="input num" data-f="pct" inputmode="decimal" placeholder="e.g. 71"></label>
      <label class="field"><span>How strict is the scoring?</span><select class="input" data-f="pcttol">${opts(PCT_TOL, 30)}</select></label>
      <div class="scoreprev" data-f="pctprev"></div>
    </div>

    <div data-part="time" class="hidden" style="display:grid;gap:14px">
      <label class="field"><span>Target time in seconds (1–120)</span><input class="input num" data-f="secs" inputmode="decimal" placeholder="e.g. 10"></label>
      <label class="field"><span>How strict is the scoring?</span><select class="input" data-f="timetol">${opts(TIME_TOL, 0.3)}</select></label>
      <div class="scoreprev" data-f="timeprev"></div>
      <div class="hint">Players tap Start, count in their head with no clock shown, and tap Stop. One try each.</div>
    </div>

    <div data-part="color" class="hidden" style="display:grid;gap:14px">
      <div class="swatch-row"><span class="swatch empty" data-f="csw"></span>
        <label class="field" style="flex:1"><span>Correct colour (hex code)</span><input class="input num" data-f="hex" maxlength="7" placeholder="#1db954"></label></div>
      <div data-f="picker"></div>
      <label class="field"><span>How strict is the scoring?</span><select class="input" data-f="coltol">${opts(COLOR_TOL, 70)}</select></label>
      <div class="hint">Tip: search “Spotify green hex” to get the exact code. Players mix the colour with a picker, no codes allowed.</div>
    </div>

    <div data-part="tempo" class="hidden" style="display:grid;gap:14px">
      <div class="field"><span>Record the real rhythm</span><div data-f="recorder"></div></div>
      <label class="field"><span>Which part to tap (shown to players)</span><input class="input" data-f="hint" maxlength="80" placeholder="e.g. One tap per syllable of the chorus line"></label>
      <label class="field"><span>How strict is the scoring?</span><select class="input" data-f="tempotol">${opts(TEMPO_TOL, 0.5)}</select></label>
      <div class="hint">Players see how many taps the rhythm has and your hint, then tap it from memory. They score on speed (total length) and rhythm (the gaps between taps). Keep it short and famous: a chorus line, a riff, an intro.</div>
    </div>

    <div data-part="order" class="hidden" style="display:grid;gap:12px">
      <div class="hint">Write the items in the <b>correct</b> order, first at the top. Players get them shuffled and drag them into order.</div>
      <div data-f="items" style="display:grid;gap:8px"></div>
      <div class="actions" style="display:flex;gap:8px"><button type="button" class="btn ghost" data-f="additem" style="padding:.6em 1em">＋ Item</button><button type="button" class="btn ghost" data-f="delitem" style="padding:.6em 1em">− Item</button></div>
    </div>

    <details class="more" data-f="more">
      <summary>Optional: picture, fun fact and source</summary>
      <div>
        <label class="field"><span>Image link</span><input class="input" data-f="imgurl" type="url" inputmode="url" placeholder="https://… (right-click an image → Copy image address)"></label>
        <img class="preview-img hidden" data-f="img" alt="">
        <div class="hint" data-f="imghint"></div>
        <label class="field"><span>Fun fact, shown with the answer</span><input class="input" data-f="fact" maxlength="300" placeholder="e.g. That's about 100 rolls a year!"></label>
        <label class="field"><span>Source link, shown with the answer</span><input class="input" data-f="source" type="url" inputmode="url" placeholder="https://… where you found the answer"></label>
      </div>
    </details>
  </div>`;
}

export function createSetEditor(root, { toast = alert, onChange = () => {} } = {}) {
  const uid = `ed${Math.random().toString(36).slice(2, 7)}`;
  root.innerHTML = [0, 1, 2].map((i) => block(uid, i)).join('');
  const state = [0, 1, 2].map(() => ({ kind: 'number', lat: null, lng: null, map: null, marker: null, imageOk: true, picker: null, autoPrompt: '' }));
  const card = (i) => document.getElementById(`${uid}-q${i}`);
  const f = (i, name) => card(i).querySelector(`[data-f="${name}"]`);
  const part = (i, name) => card(i).querySelector(`[data-part="${name}"]`);

  // ---- number ----
  function updateNumberPreview(i) {
    const ans = parseNumber(f(i, 'answer').value);
    const unit = f(i, 'unit').value.trim();
    f(i, 'answerPreview').innerHTML = ans === null ? (f(i, 'answer').value ? '<span class="error">Not a number</span>' : '') : `Answer: <b class="num">${fmt(ans)}</b> ${esc(unit)}`;
    const s = SCORING.find((x) => x.id === f(i, 'scoring').value);
    part(i, 'abs').classList.toggle('hidden', s.scoring !== 'absolute');
    const prev = f(i, 'prev');
    if (ans === null) { prev.innerHTML = ''; return; }
    if (s.scoring === 'ratio') {
      prev.innerHTML = [[ans * 1.1, '10% off'], [ans * 2, 'Double'], [ans * 5, '5× off']]
        .map(([g, l]) => `<div>${l}<b>${fmtPts(points('ratio', s.tol, ans, g))}</b></div>`).join('');
    } else {
      const tol = parseNumber(f(i, 'abstol').value);
      prev.innerHTML = tol > 0 ? [tol * 0.1, tol * 0.25, tol * 0.5]
        .map((d) => `<div>Off by ${fmt(d)}<b>${fmtPts(points('absolute', tol, ans, ans + d))}</b></div>`).join('') : '';
    }
  }

  // ---- percent / time previews ----
  function updatePctPreview(i) {
    const tol = +f(i, 'pcttol').value;
    f(i, 'pctprev').innerHTML = [5, 10, 20].map((d) => `<div>${d} points off<b>${fmtPts(points('absolute', tol, 0, d))}</b></div>`).join('');
  }
  function updateTimePreview(i) {
    const t = parseNumber(f(i, 'secs').value);
    const tol = (t || 0) * +f(i, 'timetol').value;
    f(i, 'timeprev').innerHTML = t > 0 ? [0.25, 0.5, 1].map((d) => `<div>${String(d).replace('.', ',')} s off<b>${fmtPts(points('absolute', tol, 0, d))}</b></div>`).join('') : '';
    // Keep an auto-written prompt in sync with the target
    const p = f(i, 'prompt');
    if (t > 0 && (!p.value.trim() || p.value === state[i].autoPrompt)) {
      state[i].autoPrompt = `Stop the clock at exactly ${fmt(t)} second${t === 1 ? '' : 's'}`;
      p.value = state[i].autoPrompt;
    }
  }

  // ---- rhythm ----
  function ensureRecorder(i, initial = null) {
    if (state[i].recorder && !initial) return;
    state[i].rhythm = initial;
    state[i].recorder = createRecorder(f(i, 'recorder'), { initial, onChange: (r) => { state[i].rhythm = r; onChange(); } });
  }

  // ---- colour ----
  function setHex(i, hex, fromPicker = false) {
    const ok = !!hexToRgb(hex);
    const sw = f(i, 'csw');
    sw.classList.toggle('empty', !ok);
    sw.style.background = ok ? hex : '';
    if (ok && !fromPicker) state[i].picker?.set(hex);
    if (fromPicker) f(i, 'hex').value = hex;
  }

  // ---- sort items ----
  function itemInputs(i) { return [...f(i, 'items').querySelectorAll('input')]; }
  function setItems(i, values) {
    f(i, 'items').innerHTML = values.map((v, k) => `<div style="display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:center"><b style="color:var(--accent);text-align:center">${k + 1}</b><input class="input" maxlength="60" value="${esc(v)}" placeholder="${k === 0 ? 'e.g. Burj Khalifa (the tallest)' : `Item ${k + 1}`}"></div>`).join('');
    itemInputs(i).forEach((inp) => inp.addEventListener('input', onChange));
    f(i, 'delitem').disabled = values.length <= 3;
    f(i, 'additem').disabled = values.length >= 6;
  }

  function ensureMap(i) {
    if (typeof L === 'undefined') { f(i, 'maphint').innerHTML = '<span class="error">The map failed to load. Check your connection.</span>'; return null; }
    if (!state[i].map) {
      state[i].map = makeMap(f(i, 'map'), { tiles: 'labels' });
      state[i].map.on('click', (e) => place(i, e.latlng));
    }
    setTimeout(() => state[i].map.invalidateSize(), 50);
    return state[i].map;
  }

  function setKind(i, kind) {
    state[i].kind = kind;
    f(i, 'kindseg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === kind));
    KINDS.forEach(([k]) => part(i, k).classList.toggle('hidden', k !== kind));
    const ph = PLACEHOLDERS[kind];
    f(i, 'prompt').placeholder = ph[i % ph.length];
    if (kind === 'map') ensureMap(i);
    if (kind === 'color' && !state[i].picker) {
      state[i].picker = createColorPicker(f(i, 'picker'), { onChange: (hex) => { setHex(i, hex, true); onChange(); } });
    }
    if (kind === 'order' && !itemInputs(i).length) setItems(i, ['', '', '', '', '']);
    if (kind === 'time') updateTimePreview(i);
    if (kind === 'percent') updatePctPreview(i);
    if (kind === 'tempo') ensureRecorder(i);
    onChange();
  }

  function place(i, ll, zoom) {
    const st = state[i];
    const [rawLat, rawLng] = Array.isArray(ll) ? ll : [ll.lat, ll.lng];
    st.lat = rawLat; st.lng = ((rawLng + 540) % 360) - 180;   // keep the spot even if the map can't load
    const m = ensureMap(i); if (!m) return;
    const w = L.latLng(ll).wrap();
    st.lat = w.lat; st.lng = w.lng;
    if (st.marker) st.marker.setLatLng(ll); else st.marker = L.marker(ll, { icon: pin('#ff7a3d', 26) }).addTo(m);
    if (zoom) m.setView(ll, zoom);
    f(i, 'maphint').textContent = `Correct spot: ${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}. Tap again to move it.`;
  }

  async function search(i) {
    const q = f(i, 'search').value.trim();
    if (!q) return;
    try {
      const hit = await geocode(q);
      if (!hit) { toast('No place found'); return; }
      place(i, [+hit.lat, +hit.lon], 12);
      if (!f(i, 'label').value) f(i, 'label').value = hit.display_name.split(',').slice(0, 2).join(',').trim();
    } catch { toast('Search failed. Tap the map instead.'); }
  }

  function checkImage(i) {
    const url = f(i, 'imgurl').value.trim();
    const img = f(i, 'img'), hint = f(i, 'imghint');
    state[i].imageOk = null;
    onChange();
    if (!url) { img.classList.add('hidden'); hint.textContent = ''; state[i].imageOk = true; return; }
    if (!/^https:\/\//i.test(url)) { img.classList.add('hidden'); hint.innerHTML = '<span class="error">Use a link starting with https://</span>'; state[i].imageOk = false; return; }
    hint.textContent = 'Loading preview…';
    img.onload = () => { if (f(i, 'imgurl').value.trim() !== url) return; img.classList.remove('hidden'); hint.textContent = 'Looks good. Links from Wikipedia/Wikimedia or our own sites are the most reliable.'; state[i].imageOk = true; onChange(); };
    img.onerror = () => { if (f(i, 'imgurl').value.trim() !== url) return; img.classList.add('hidden'); hint.innerHTML = '<span class="error">That link doesn’t load as an image. It must point to the image itself (often ends in .jpg/.png).</span>'; state[i].imageOk = false; onChange(); };
    img.src = url;
  }

  for (const i of [0, 1, 2]) {
    f(i, 'kindseg').querySelectorAll('button').forEach((b) => b.onclick = () => setKind(i, b.dataset.k));
    ['answer', 'unit', 'abstol'].forEach((n) => f(i, n).addEventListener('input', () => { updateNumberPreview(i); onChange(); }));
    f(i, 'scoring').addEventListener('change', () => { updateNumberPreview(i); onChange(); });
    f(i, 'pcttol').addEventListener('change', () => updatePctPreview(i));
    f(i, 'secs').addEventListener('input', () => { updateTimePreview(i); onChange(); });
    f(i, 'hint').addEventListener('input', onChange);
    f(i, 'timetol').addEventListener('change', () => updateTimePreview(i));
    f(i, 'hex').addEventListener('input', () => {
      let v = f(i, 'hex').value.trim();
      if (/^[0-9a-f]{6}$/i.test(v)) v = '#' + v;
      setHex(i, v.toLowerCase());
    });
    f(i, 'additem').onclick = () => { const v = itemInputs(i).map((x) => x.value); if (v.length < 6) setItems(i, [...v, '']); onChange(); };
    f(i, 'delitem').onclick = () => { const v = itemInputs(i).map((x) => x.value); if (v.length > 3) setItems(i, v.slice(0, -1)); onChange(); };
    ['prompt', 'label', 'fact', 'source'].forEach((n) => f(i, n).addEventListener('input', onChange));
    f(i, 'imgurl').addEventListener('input', () => checkImage(i));
    f(i, 'go').onclick = () => search(i);
    f(i, 'search').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); search(i); } };
    setKind(i, i === 2 ? 'map' : 'number');
  }

  // Current values without validation (for the preview)
  function peek() {
    return [0, 1, 2].map((i) => {
      const k = state[i].kind;
      const items = k === 'order' ? itemInputs(i).map((x) => x.value.trim()).filter(Boolean) : null;
      return {
        kind: k,
        prompt: f(i, 'prompt').value.trim(),
        unit: k === 'number' ? f(i, 'unit').value.trim() : '',
        target: k === 'time' ? parseNumber(f(i, 'secs').value) : null,
        hint: k === 'tempo' ? f(i, 'hint').value.trim() : '',
        taps: k === 'tempo' ? state[i].rhythm?.length : null,
        items: items ? items.slice().reverse() : null,   // shown shuffled to players; reversed is a fine stand-in
        image_url: state[i].imageOk ? f(i, 'imgurl').value.trim() : '',
      };
    });
  }

  // Validated payload for the database; throws with a readable message.
  function collect() {
    return [0, 1, 2].map((i) => {
      const n = i + 1;
      const k = state[i].kind;
      const prompt = f(i, 'prompt').value.trim();
      if (prompt.length < 3) throw new Error(`Question ${n} needs a question text`);
      const extras = { fact: f(i, 'fact').value.trim(), source_url: f(i, 'source').value.trim() };
      const imageUrl = f(i, 'imgurl').value.trim();
      if (imageUrl && state[i].imageOk === false) throw new Error(`Question ${n}: the image link doesn't work (clear it or fix it)`);
      if (imageUrl && state[i].imageOk === null) throw new Error(`Question ${n}: the image is still loading, try again in a second`);
      if (imageUrl) extras.image_url = imageUrl;
      if (extras.source_url && !/^https?:\/\//i.test(extras.source_url)) throw new Error(`Question ${n}: the source should be a web link (https://…)`);

      if (k === 'map') {
        if (state[i].lat === null) throw new Error(`Question ${n}: tap the map to set the correct spot`);
        return { kind: 'map', prompt, lat: state[i].lat, lng: state[i].lng, label: f(i, 'label').value.trim(), tolerance: +f(i, 'radius').value, ...extras };
      }
      if (k === 'percent') {
        const v = parseNumber(f(i, 'pct').value.replace('%', ''));
        if (v === null || v < 0 || v > 100) throw new Error(`Question ${n}: the correct answer must be 0 to 100 %`);
        return { kind: 'percent', prompt, answer: v, tolerance: +f(i, 'pcttol').value, ...extras };
      }
      if (k === 'time') {
        const t = parseNumber(f(i, 'secs').value);
        if (t === null || t < 1 || t > 120) throw new Error(`Question ${n}: the target time must be 1 to 120 seconds`);
        return { kind: 'time', prompt, answer: t, tolerance: Math.round(t * +f(i, 'timetol').value * 1000) / 1000, ...extras };
      }
      if (k === 'tempo') {
        if (!state[i].rhythm) throw new Error(`Question ${n}: record the rhythm by tapping along to the song`);
        return { kind: 'tempo', prompt, rhythm: state[i].rhythm, hint: f(i, 'hint').value.trim(), tolerance: +f(i, 'tempotol').value, ...extras };
      }
      if (k === 'color') {
        let hex = f(i, 'hex').value.trim().toLowerCase();
        if (/^[0-9a-f]{6}$/.test(hex)) hex = '#' + hex;
        if (!hexToRgb(hex)) throw new Error(`Question ${n}: enter the correct colour as a hex code like #1db954, or pick it`);
        return { kind: 'color', prompt, color: hex, tolerance: +f(i, 'coltol').value, ...extras };
      }
      if (k === 'order') {
        const items = itemInputs(i).map((x) => x.value.trim());
        if (items.some((x) => !x)) throw new Error(`Question ${n}: fill in every item (or remove the empty ones)`);
        if (new Set(items.map((x) => x.toLowerCase())).size !== items.length) throw new Error(`Question ${n}: the items must all be different`);
        return { kind: 'order', prompt, items, ...extras };
      }
      const answer = parseNumber(f(i, 'answer').value);
      if (answer === null) throw new Error(`Question ${n} needs a numeric answer`);
      const s = SCORING.find((x) => x.id === f(i, 'scoring').value);
      let tolerance = s.tol;
      if (s.scoring === 'absolute') {
        tolerance = parseNumber(f(i, 'abstol').value);
        if (!(tolerance > 0)) throw new Error(`Question ${n}: say how far off scores 1 point`);
      } else if (answer <= 0) throw new Error(`Question ${n}: use "Plain difference" scoring for answers of 0 or below`);
      return { kind: 'number', prompt, answer, unit: f(i, 'unit').value.trim(), scoring: s.scoring, tolerance, ...extras };
    });
  }

  const nearest = (list, v) => list.reduce((a, b) => (Math.abs(b[0] - v) < Math.abs(a[0] - v) ? b : a))[0];

  // Fill the editor from a stored set (admin)
  function load(questions) {
    questions.forEach((q, i) => {
      if (i > 2) return;
      setKind(i, q.kind);
      f(i, 'prompt').value = q.prompt || '';
      if (q.kind === 'number') {
        f(i, 'answer').value = q.answer ?? '';
        f(i, 'unit').value = q.unit || '';
        const preset = SCORING.find((s) => s.scoring === q.scoring && s.tol === q.tolerance);
        f(i, 'scoring').value = preset ? preset.id : 'abs';
        if (!preset) f(i, 'abstol').value = q.tolerance;
        updateNumberPreview(i);
      } else if (q.kind === 'map') {
        f(i, 'label').value = q.label || '';
        f(i, 'radius').value = String(q.tolerance);
        place(i, [q.lat, q.lng]);
        state[i].map?.setView([q.lat, q.lng], 5);
      } else if (q.kind === 'percent') {
        f(i, 'pct').value = q.answer ?? '';
        f(i, 'pcttol').value = String(nearest(PCT_TOL, q.tolerance));
        updatePctPreview(i);
      } else if (q.kind === 'time') {
        f(i, 'secs').value = q.answer ?? '';
        f(i, 'timetol').value = String(nearest(TIME_TOL, q.tolerance / (q.answer || 1)));
        state[i].autoPrompt = '';
        updateTimePreview(i);
      } else if (q.kind === 'tempo') {
        ensureRecorder(i, q.items);
        f(i, 'hint').value = q.label || '';
        f(i, 'tempotol').value = String(nearest(TEMPO_TOL, q.tolerance));
      } else if (q.kind === 'color') {
        f(i, 'hex').value = q.color || '';
        setHex(i, q.color || '');
        f(i, 'coltol').value = String(nearest(COLOR_TOL, q.tolerance));
      } else if (q.kind === 'order') {
        setItems(i, q.items || ['', '', '']);
      }
      f(i, 'imgurl').value = q.image_url || '';
      f(i, 'fact').value = q.fact || '';
      f(i, 'source').value = q.source_url || '';
      if (q.image_url) checkImage(i);
      f(i, 'more').open = !!(q.image_url || q.fact || q.source_url);
    });
    onChange();
  }

  return { collect, peek, load };
}

// Live preview of a set: a mini office-screen view plus a mini phone, one question at a time.
export function renderPreview(el, qs, author, current = 0) {
  const tag = (q) => q.kind === 'number' ? (q.unit ? `<span class="tag number">in ${esc(q.unit)}</span>` : '') : KIND_TAG[q.kind] || '';
  const screen = qs.map((q, i) => `
    <div class="pv-q ${q.prompt ? '' : 'empty'}">
      <div class="n">${i + 1}</div>
      <div class="p">${q.prompt ? esc(q.prompt) : 'Question ' + (i + 1) + '…'} ${tag(q)}${q.kind === 'order' && q.items?.length ? `<div class="pv-items">${q.items.map((it) => `<span>${esc(it)}</span>`).join('')}</div>` : ''}</div>
      ${q.image_url ? `<img src="${esc(q.image_url)}" alt="">` : '<span></span>'}
    </div>`).join('');
  const q = qs[current];
  const inputs = {
    map: '<div class="fake-map">Map without place names</div>',
    percent: '<div class="fake-pct"><b>50 %</b><span></span></div>',
    time: `<div class="fake-timer">Start</div><div class="muted" style="font-size:11px;text-align:center">Stop at ${q.target ? fmt(q.target) : '?'} s</div>`,
    color: '<div class="fake-color"></div>',
    tempo: `<div class="fake-timer" style="background:var(--accent);color:var(--accent-ink)">Tap</div><div class="muted" style="font-size:11px;text-align:center">Practice first, then tap ${q.taps || '?'} times${q.hint ? ` · ${esc(q.hint)}` : ''}</div>`,
    order: `<div class="fake-sort">${(q.items?.length ? q.items : ['Item', 'Item', 'Item']).map((it, k) => `<span><b>${k + 1}</b> ${esc(it)}</span>`).join('')}</div>`,
    number: `<div class="fake-input"><span>Your guess</span><span>${esc(q.unit || '')}</span></div>`,
  };
  el.innerHTML = `
    <div class="pv-screen"><div class="lbl">Office screen · questions by ${esc(author || 'you')}</div>${screen}</div>
    <div class="pv-tabs">${qs.map((_, i) => `<button type="button" data-i="${i}" class="${i === current ? 'on' : ''}">📱 Q${i + 1}</button>`).join('')}</div>
    <div class="pv-phone">
      <div class="qn">Question ${current + 1} of 3</div>
      ${q.image_url ? `<img src="${esc(q.image_url)}" alt="">` : ''}
      <div class="p">${q.prompt ? esc(q.prompt) : '<span class="muted">Your question…</span>'}</div>
      ${inputs[q.kind] || inputs.number}
      <div class="fake-btn">${current === 2 ? 'Review answers' : 'Next'}</div>
    </div>`;
  return el;
}

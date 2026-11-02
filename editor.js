// The 3-question set editor, shared by the "add" page and the admin page.
import { fmt, fmtPts, esc, parseNumber, makeMap, pin, points } from './common.js';

export const SCORING = [
  { id: 'r1', label: 'Ballpark: 10× off scores 1 point', scoring: 'ratio', tol: 1 },
  { id: 'r05', label: 'Tight: ~3× off scores 1 point', scoring: 'ratio', tol: 0.5 },
  { id: 'r2', label: 'Loose: 100× off scores 1 point', scoring: 'ratio', tol: 2 },
  { id: 'abs', label: 'Plain difference (years, temperatures…)', scoring: 'absolute' },
];
const RADIUS = [[300, 'Within 300 km (same region)'], [1000, 'Within 1 000 km (same country-ish)'], [2000, 'Within 2 000 km (same continent)'], [5000, 'Within 5 000 km (rough area of the world)']];
const PLACEHOLDERS = ['How far is it between our Stockholm and Gothenburg offices?', 'How many rolls of toilet paper does a person use in a lifetime?', 'How much does an average adult elephant weigh?'];

async function geocode(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
  const [hit] = await r.json();
  return hit || null;
}

function block(uid, i) {
  return `<div class="card" id="${uid}-q${i}">
    <h2><span class="n">${i + 1}</span> Question ${i + 1}</h2>
    <div class="seg" data-f="kindseg"><button type="button" data-k="number" class="on"># Number</button><button type="button" data-k="map">📍 Map pin</button></div>
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
      <div class="hint" data-f="maphint">Tap the map to place the correct spot. Players see a map without labels.</div>
      <div class="row2">
        <label class="field"><span>Name of the place (shown with the answer)</span><input class="input" data-f="label" maxlength="80" placeholder="e.g. Our Gothenburg office"></label>
        <label class="field"><span>1 point if further than</span><select class="input" data-f="radius">${RADIUS.map(([v, l]) => `<option value="${v}" ${v === 2000 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
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
  const state = [0, 1, 2].map(() => ({ kind: 'number', lat: null, lng: null, map: null, marker: null, imageOk: true }));
  const card = (i) => document.getElementById(`${uid}-q${i}`);
  const f = (i, name) => card(i).querySelector(`[data-f="${name}"]`);

  function updateNumberPreview(i) {
    const ans = parseNumber(f(i, 'answer').value);
    const unit = f(i, 'unit').value.trim();
    f(i, 'answerPreview').innerHTML = ans === null ? (f(i, 'answer').value ? '<span class="error">Not a number</span>' : '') : `Answer: <b class="num">${fmt(ans)}</b> ${esc(unit)}`;
    const s = SCORING.find((x) => x.id === f(i, 'scoring').value);
    card(i).querySelector('[data-part="abs"]').classList.toggle('hidden', s.scoring !== 'absolute');
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
    card(i).querySelector('[data-part="number"]').classList.toggle('hidden', kind !== 'number');
    card(i).querySelector('[data-part="map"]').classList.toggle('hidden', kind !== 'map');
    f(i, 'prompt').placeholder = kind === 'map' ? 'e.g. Pin our newest office' : PLACEHOLDERS[i];
    if (kind === 'map') ensureMap(i);
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
    ['prompt', 'label', 'fact', 'source'].forEach((n) => f(i, n).addEventListener('input', onChange));
    f(i, 'imgurl').addEventListener('input', () => checkImage(i));
    f(i, 'go').onclick = () => search(i);
    f(i, 'search').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); search(i); } };
    setKind(i, i === 2 ? 'map' : 'number');
  }

  // Current values without validation (for the preview)
  function peek() {
    return [0, 1, 2].map((i) => ({
      kind: state[i].kind,
      prompt: f(i, 'prompt').value.trim(),
      unit: state[i].kind === 'number' ? f(i, 'unit').value.trim() : '',
      image_url: state[i].imageOk ? f(i, 'imgurl').value.trim() : '',
    }));
  }

  // Validated payload for the database; throws with a readable message.
  function collect() {
    return [0, 1, 2].map((i) => {
      const prompt = f(i, 'prompt').value.trim();
      if (prompt.length < 3) throw new Error(`Question ${i + 1} needs a question text`);
      const extras = { fact: f(i, 'fact').value.trim(), source_url: f(i, 'source').value.trim() };
      const imageUrl = f(i, 'imgurl').value.trim();
      if (imageUrl && state[i].imageOk === false) throw new Error(`Question ${i + 1}: the image link doesn't work (clear it or fix it)`);
      if (imageUrl && state[i].imageOk === null) throw new Error(`Question ${i + 1}: the image is still loading, try again in a second`);
      if (imageUrl) extras.image_url = imageUrl;
      if (extras.source_url && !/^https?:\/\//i.test(extras.source_url)) throw new Error(`Question ${i + 1}: the source should be a web link (https://…)`);
      if (state[i].kind === 'map') {
        if (state[i].lat === null) throw new Error(`Question ${i + 1}: tap the map to set the correct spot`);
        return { kind: 'map', prompt, lat: state[i].lat, lng: state[i].lng, label: f(i, 'label').value.trim(), tolerance: +f(i, 'radius').value, ...extras };
      }
      const answer = parseNumber(f(i, 'answer').value);
      if (answer === null) throw new Error(`Question ${i + 1} needs a numeric answer`);
      const s = SCORING.find((x) => x.id === f(i, 'scoring').value);
      let tolerance = s.tol;
      if (s.scoring === 'absolute') {
        tolerance = parseNumber(f(i, 'abstol').value);
        if (!(tolerance > 0)) throw new Error(`Question ${i + 1}: say how far off scores 1 point`);
      } else if (answer <= 0) throw new Error(`Question ${i + 1}: use "Plain difference" scoring for answers of 0 or below`);
      return { kind: 'number', prompt, answer, unit: f(i, 'unit').value.trim(), scoring: s.scoring, tolerance, ...extras };
    });
  }

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
      } else {
        f(i, 'label').value = q.label || '';
        f(i, 'radius').value = String(q.tolerance);
        place(i, [q.lat, q.lng]);
        state[i].map?.setView([q.lat, q.lng], 5);
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
  const tag = (q) => q.kind === 'map' ? '<span class="tag map">📍 Map</span>' : q.unit ? `<span class="tag number">in ${esc(q.unit)}</span>` : '';
  const screen = qs.map((q, i) => `
    <div class="pv-q ${q.prompt ? '' : 'empty'}">
      <div class="n">${i + 1}</div>
      <div class="p">${q.prompt ? esc(q.prompt) : 'Question ' + (i + 1) + '…'} ${tag(q)}</div>
      ${q.image_url ? `<img src="${esc(q.image_url)}" alt="">` : '<span></span>'}
    </div>`).join('');
  const q = qs[current];
  el.innerHTML = `
    <div class="pv-screen"><div class="lbl">Office screen · questions by ${esc(author || 'you')}</div>${screen}</div>
    <div class="pv-tabs">${qs.map((_, i) => `<button type="button" data-i="${i}" class="${i === current ? 'on' : ''}">📱 Q${i + 1}</button>`).join('')}</div>
    <div class="pv-phone">
      <div class="qn">Question ${current + 1} of 3</div>
      ${q.image_url ? `<img src="${esc(q.image_url)}" alt="">` : ''}
      <div class="p">${q.prompt ? esc(q.prompt) : '<span class="muted">Your question…</span>'}</div>
      ${q.kind === 'map' ? '<div class="fake-map">Map without labels</div>' : `<div class="fake-input"><span>Your guess</span><span>${esc(q.unit || '')}</span></div>`}
      <div class="fake-btn">${current === 2 ? 'Review answers' : 'Next'}</div>
    </div>`;
  return el;
}

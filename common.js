import { CONFIG } from './config.js';

export async function rpc(name, params = {}) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: CONFIG.supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && (data.message || data.hint)) || `Request failed (${res.status})`);
  return data;
}

const nf = (digits) => new Intl.NumberFormat('sv-SE', { maximumFractionDigits: digits });

export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  const a = Math.abs(n);
  const digits = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4;
  return nf(digits).format(n);
}

export const fmtPts = (n) => `${nf(0).format(n)} pts`;

export function fmtDate(d, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', opts);
}

// Accepts "384400", "384 400", "384,400", "9,58", "9.58", "1.2k", "3m", "2 bn"
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().toLowerCase().replace(/[\s  '’_]/g, '');
  if (!s) return null;
  let mult = 1;
  const suffix = s.match(/(k|thousand|m|mn|million|milj|bn|b|billion|mdr)$/);
  if (suffix) {
    const map = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, milj: 1e6, bn: 1e9, b: 1e9, billion: 1e9, mdr: 1e9 };
    mult = map[suffix[1]];
    s = s.slice(0, -suffix[1].length);
  }
  if (s.includes('.') && s.includes(',')) s = s.replace(/,/g, '');
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s) && !/^-?0,/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = parseFloat(s) * mult;
  return Number.isFinite(v) ? v : null;
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const r = (x) => (x * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Mirror of the database scoring, used for previews on the "add" page.
export function points(scoring, tol, answer, guess) {
  let err;
  if (scoring === 'ratio') {
    if (!(guess > 0) || !(answer > 0)) return 1;
    err = Math.abs(Math.log10(guess) - Math.log10(answer));
  } else err = Math.abs(guess - answer);
  const f = Math.max(0, 1 - err / tol);
  return Math.max(1, Math.min(10000, Math.round(10000 * f ** 1.5)));
}

// Keyless tile sources, tried in order if one fails to load.
// 'plain' is for answering map questions: no place names in any of its sources, ever.
const ESRI = (name) => `https://server.arcgisonline.com/ArcGIS/rest/services/${name}/MapServer/tile/{z}/{y}/{x}`;
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ESRI_ATTR = 'Tiles &copy; Esri';
export const TILES = {
  plain: [
    { url: ESRI('Canvas/World_Light_Gray_Base'), attr: ESRI_ATTR, maxZoom: 16 },
    { url: ESRI('World_Shaded_Relief'), attr: ESRI_ATTR, maxZoom: 13 },
  ],
  dark: [
    { url: ESRI('Canvas/World_Dark_Gray_Base'), attr: ESRI_ATTR, maxZoom: 16 },
    { url: OSM, attr: OSM_ATTR, maxZoom: 19 },
  ],
  labels: [{ url: OSM, attr: OSM_ATTR, maxZoom: 19 }],
};

// Highest zoom players can use when answering a map question. The 'plain' maps never contain
// place names at any zoom (Esri keeps labels in a separate reference layer we don't load),
// so players can zoom in to street level to place their pin precisely.
export const ANSWER_MAX_ZOOM = 16;

export function makeMap(el, { tiles = 'plain', interactive = true, maxZoom } = {}) {
  const sources = TILES[tiles];
  const cap = maxZoom ?? sources[0].maxZoom;
  const map = L.map(el, {
    worldCopyJump: true, minZoom: 1, maxZoom: cap, zoomControl: interactive, attributionControl: true,
    dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive,
    touchZoom: interactive, boxZoom: interactive, keyboard: interactive, tap: interactive,
  }).setView([30, 10], 1);
  let i = 0, errors = 0, layer = null;
  const use = () => {
    const src = sources[i];
    layer = L.tileLayer(src.url, { attribution: src.attr, maxZoom: Math.min(cap, src.maxZoom), maxNativeZoom: src.maxZoom }).addTo(map);
    errors = 0;
    layer.on('tileerror', () => {
      if (++errors !== 4 || i >= sources.length - 1) return;
      map.removeLayer(layer); i++; use();
    });
  };
  use();
  return map;
}

export function pin(color = '#ff7a3d', size = 22) {
  return L.divIcon({
    className: '',
    html: `<div class="pin" style="--c:${color};width:${size}px;height:${size}px"></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size],
  });
}

export function dot(color = '#5ee0b1', size = 10) {
  return L.divIcon({
    className: '',
    html: `<div class="dot" style="--c:${color};width:${size}px;height:${size}px"></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export function pageUrl(file) {
  return new URL(file, location.href).href;
}

// ---------- Shared display helpers for every question type ----------
export const KIND_TAG = {
  number: '', map: '<span class="tag map">📍 Map</span>', percent: '<span class="tag number">% Percent</span>',
  time: '<span class="tag map">⏱ Timer</span>', tempo: '<span class="tag map">🥁 Tempo</span>', color: '<span class="tag number">🎨 Colour</span>', order: '<span class="tag map">↕ Sort</span>',
};
export const swatchHtml = (hex, cls = '') => `<span class="sw ${cls}" style="background:${esc(hex)}"></span>`;
const secs = (n) => `${(Math.round(n * 100) / 100).toFixed(2)} s`;

// The correct answer, as shown at the reveal
export function answerHtml(q) {
  switch (q.kind) {
    case 'map': return esc(q.answer_label || 'See the map');
    case 'percent': return `${fmt(q.answer_num)} %`;
    case 'time': return `${fmt(q.answer_num)} s`;
    case 'tempo': return `${Math.round(q.answer_num)} BPM`;
    case 'color': return `${swatchHtml(q.answer_color)} <span class="hex">${esc(q.answer_color)}</span>`;
    case 'order': return (q.answer_items || []).map((it, i) => `<span class="ord"><b>${i + 1}</b> ${esc(it)}</span>`).join(' ');
    default: return `${fmt(q.answer_num)} ${esc(q.unit || '')}`;
  }
}

// One player's guess. g = { guess, lat, lng, json }
export function guessHtml(q, g) {
  if (!g) return '';
  switch (q.kind) {
    case 'map': return g.lat == null ? '' : `${fmt(Math.round(distanceKm(q.answer_lat, q.answer_lng, g.lat, g.lng)))} km away`;
    case 'percent': return `${fmt(g.guess)} %`;
    case 'time': return g.guess == null ? '' : `stopped at ${secs(g.guess)}`;
    case 'tempo': return g.guess == null ? '' : `tapped ${Math.round(g.guess)} BPM`;
    case 'color': return g.json ? `${swatchHtml(g.json)}` : '';
    case 'order': return Array.isArray(g.json) ? g.json.map((it) => esc(it)).join(' › ') : '';
    default: return `guessed ${fmt(g.guess)}`;
  }
}

// Mirror of the database tempo scoring (log2 distance; half or double speed earns 80 %)
export function tempoPoints(target, bpm, tol = 0.5) {
  if (!(bpm > 0)) return 1;
  const sc = (e) => Math.max(0, 1 - e / tol) ** 1.5;
  const f = Math.max(sc(Math.abs(Math.log2(bpm / target))), 0.8 * sc(Math.abs(Math.log2(2 * bpm / target))), 0.8 * sc(Math.abs(Math.log2(bpm / (2 * target)))));
  return Math.max(1, Math.min(10000, Math.round(10000 * f)));
}

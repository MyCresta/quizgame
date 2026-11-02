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

// Keyless tile sources. Esri basemaps have no place labels (good for map questions);
// if a source fails to load, the map switches to OpenStreetMap automatically.
const ESRI = (name) => `https://server.arcgisonline.com/ArcGIS/rest/services/${name}/MapServer/tile/{z}/{y}/{x}`;
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const TILES = {
  dark: { url: ESRI('Canvas/World_Dark_Gray_Base'), attr: 'Tiles &copy; Esri', maxZoom: 16 },
  plain: { url: ESRI('Canvas/World_Light_Gray_Base'), attr: 'Tiles &copy; Esri', maxZoom: 16 },
  satellite: { url: ESRI('World_Imagery'), attr: 'Tiles &copy; Esri', maxZoom: 18 },
  labels: { url: OSM, attr: OSM_ATTR, maxZoom: 19 },
};

export function makeMap(el, { tiles = 'plain', interactive = true } = {}) {
  const map = L.map(el, {
    worldCopyJump: true, minZoom: 1, zoomControl: interactive, attributionControl: true,
    dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive,
    touchZoom: interactive, boxZoom: interactive, keyboard: interactive, tap: interactive,
  }).setView([30, 10], 1);
  const src = TILES[tiles];
  let layer = L.tileLayer(src.url, { attribution: src.attr, maxZoom: src.maxZoom }).addTo(map);
  if (src.url !== OSM) {
    let errors = 0;
    layer.on('tileerror', () => {
      if (++errors !== 4) return;
      map.removeLayer(layer);
      layer = L.tileLayer(OSM, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map);
    });
  }
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

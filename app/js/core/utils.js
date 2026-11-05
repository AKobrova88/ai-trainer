'use strict';
let seq = 0;
const nid = p => p + Date.now().toString(36).slice(-4) + (++seq).toString(36) + Math.random().toString(36).slice(2, 5);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = w => (Math.round(w * 10) / 10).toString().replace('.', ',');
const parseNum = s => { const v = parseFloat(String(s).replace(',', '.')); return isFinite(v) ? v : 0; };
function inputNumber(input, min = 0, integer = false) {
  const text = input.value.trim(), n = Number(text.replace(',', '.'));
  const valid = /^\d+(?:[.,]\d+)?$/.test(text) && Number.isFinite(n) && n >= min && (!integer || Number.isInteger(n));
  input.setAttribute('aria-invalid', String(!valid));
  return valid ? n : null;
}
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };
const reps = it => it.lo === it.hi ? `${it.lo}` : `${it.lo}–${it.hi}`;
const dose = it => `${it.s} × ${reps(it)}${it.sec ? ' с' : ''}`;
const stepOf = it => it.sec ? 0 : (STEP[it.inc] ?? 2.5);
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const sameDay = (a, b) => dayKey(new Date(a)) === dayKey(new Date(b));
const now = () => new Date();
const monthKey = (d = now()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”„()\[\]{}.,;:!?/\\|+_*#№•·–—-]/g, ' ').replace(/\s+/g, ' ').trim();
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ruDate = (t, o = {day: 'numeric', month: 'long'}) => new Date(t).toLocaleDateString('ru-RU', o);
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function ex(name, base, s, lo, hi, w, inc) {
  const c = base && CAT[base];
  const it = {id: nid('i'), name: name || (c ? c.n : 'Упражнение'), base: c ? base : null, cam: !!(c && c.cam), inc: inc || (c ? c.inc : 'machine'), s, lo, hi, w: w || 0, rest: 90, sec: false};
  if (c && c.inc === 'time') it.sec = true;
  return it;
}


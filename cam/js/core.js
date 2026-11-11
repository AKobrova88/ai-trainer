'use strict';
AT.setData(EX);
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; if (a === 1 && b !== 11) return one; if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few; return many; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kgTxt = v => v == null || v === '' || isNaN(v) ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
const num = s => { const v = parseFloat(String(s == null ? '' : s).replace(',', '.')); return isFinite(v) ? v : null; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const IN_TG = /tgWebApp/.test(location.hash) || /[?&]tg=1/.test(location.search) || !!window.Telegram?.WebApp?.initData || !!window.TelegramWebviewProxy;
if (IN_TG) document.documentElement.classList.add('in-telegram');
/* every Telegram account on this phone has its own unsaved sets and its own way back to the app: the keys carry its Telegram ID
   (the app keeps Telegram's data for this window in sessionStorage 'trener.tg') */
const TG_SLOT = (() => {
  let d=new URLSearchParams(location.hash.slice(1)).get('tgWebAppData') || window.Telegram?.WebApp?.initData || '';
  try {d=d || sessionStorage.getItem('trener.tg') || '';if(d)sessionStorage.setItem('trener.tg',d);}catch(e){/* The signed launch data still identifies the local partition. */}
  try {
    const u = JSON.parse(new URLSearchParams(d).get('user') || 'null');
    return u && /^\d{1,20}$/.test(String(u.id)) ? ':tg' + u.id : '';
  } catch (e) { return ''; }
})();
if(TG_SLOT)document.documentElement.classList.add('in-telegram');
const telegramBridge = Startup.telegram(IN_TG || !!TG_SLOT);
const CAMERA_CONTEXT = new URLSearchParams(location.search).get('ctx') || '';
const SETS_KEY = 'aitrainer.sets' + TG_SLOT + (/^[a-z0-9_-]{1,80}$/.test(CAMERA_CONTEXT) ? ':'+CAMERA_CONTEXT : '');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

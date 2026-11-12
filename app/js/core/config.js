'use strict';
const APP_VERSION = '2.9.1 · тест';
const CAMERA_REV = '2.9.1';
/* storage keys: one set per Telegram account on this phone (TG.slot() is empty in a browser) */
const LEGACY_KEY = 'ai-trainer-app-1';
const KEY = LEGACY_KEY + TG.slot();
const INBOX = 'aitrainer.inbox' + TG.slot();
const STEP = {bb_lower: 5, bb_upper: 2.5, machine: 2.5, db: 1, bw: 0, time: 0};
/* the camera coach: on the same site the results come back by themselves; elsewhere it opens in a new tab */
const CAM_ABS = 'https://trener-ii.ru/';
const OWN_DOMAIN = /^(?:www\.)?trener-ii\.ru$/.test(location.hostname);
const APP_PATH = /\/app(?:\/(?:index\.html)?)?$/;
/* The camera is at the root of each deployment. Keep an existing site's local training data on that origin. */
const SAME_SITE = OWN_DOMAIN || ((['akobrova88.github.io', 'localhost', '127.0.0.1'].includes(location.hostname) || /\.(vercel\.app|tuna\.am|tuna\.free)$/.test(location.hostname)) && APP_PATH.test(location.pathname));
const CAM_URL = SAME_SITE ? new URL(APP_PATH.test(location.pathname) ? location.pathname.replace(APP_PATH, '/') : '/', location.origin).href : CAM_ABS;
/* who runs the service — goes into the consent text; fill in before payments are switched on */
const OPERATOR = {name: 'Индивидуальный предприниматель Коброва Анастасия', ogrnip: '', inn: '', address: '', email: ''};
/* One base plan. Payment details are planning metadata; acquiring is not connected. */
const PRICING = {
  trialDays: 14, periodDays: 30, payments: false,
  paymentProvider: 'tbank', taxRegime: 'usn_income', taxRatePercent: 6, addonsEnabled: false,
  trialAi: {prog: 1, photo: 0, ask: 0},
  sub: {price: 490, ai: {prog: 3, photo: 10, ask: 30}},
  aiPlus: {price: 290, ai: {prog: 10, photo: 30, ask: 100}},
};
const AI_KINDS = [['prog', 'Подборы программы'], ['photo', 'Фото программ'], ['ask', 'Вопросы тренеру']];
/* Promo codes live on the server (trener_core.promo_codes) since 2.7: the app no longer carries a list anyone could read.
   Until accounts are on (TRENER.accounts), the phone checks the 2.6 test codes by a hash — the codes are not in the page. */
const PROMO_TEXT = 'доступ как в подписке на всё время тестирования';
const promoHash = s => {   // cyrb53: a short non-cryptographic hash, enough to keep the code text out of the page
  let h1 = 0xdeadbeef ^ 7, h2 = 0x41c6ce57 ^ 7;
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
const LOCAL_PROMOS = {'19zy9v13o9k': {text: PROMO_TEXT}, '18ptbxxgvfw': {unlimited: true, text: 'личный доступ без лимитов и срока окончания'}};
const localPromo = code => (code && LOCAL_PROMOS[promoHash(String(code).toUpperCase())]) || null;
const rub = n => `${n} ₽`;
const DAY = 864e5;


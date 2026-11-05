'use strict';
/* ---------- where the API lives ----------
   On the real site the API is api.trener-ii.ru. In a local run (127.0.0.1, localhost, a Tuna tunnel) the API serves the
   site itself, so it is the same address. localStorage 'trener.api' overrides it for testing.
   ACCOUNTS: sign-in, sync and promo codes on the server. Switch it to true once api.trener-ii.ru is running (and consent 2.0
   is approved). Until then the site works only on the phone, exactly as 2.6: consent 1.0, no password, promo codes checked
   on the phone. A local run always has its own API. localStorage 'trener.accounts' = '1' / '0' overrides it for testing. */
const ACCOUNTS = false;
const TRENER = (() => {
  const h = location.hostname;
  const local = h === 'localhost' || h === '127.0.0.1' || /\.tuna\.(am|free)$/.test(h);
  let override = '';
  try { override = localStorage.getItem('trener.api') || ''; } catch (e) { /* storage blocked */ }
  let accounts = local || !!override || ACCOUNTS;
  try { const v = localStorage.getItem('trener.accounts'); if (v === '1' || v === '0') accounts = v === '1'; } catch (e) { /* storage blocked */ }
  return {apiBase: (override || (local ? location.origin : 'https://api.trener-ii.ru')).replace(/\/$/, ''), bot: 'ii_trener_ak_bot', accounts};
})();

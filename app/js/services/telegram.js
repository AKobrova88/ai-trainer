'use strict';
/* ---------- Telegram Mini App ----------
   initData comes in the address (#tgWebAppData=…) before Telegram's script has loaded: read it at once and keep it for
   this tab, so sign-in does not wait for the script. The server checks its signature. */
const TG = (() => {
  let initData = '';
  try {
    const p = new URLSearchParams(location.hash.slice(1));
    initData = p.get('tgWebAppData') || sessionStorage.getItem('trener.tg') || '';
    if (initData) sessionStorage.setItem('trener.tg', initData);
  } catch (e) { /* no storage: the address is enough */ }
  /* every Telegram account on this phone keeps its own data: the storage keys carry the account's Telegram ID */
  let userId = '';
  try { const u = JSON.parse(new URLSearchParams(initData).get('user') || 'null'); if (u && /^\d{1,20}$/.test(String(u.id))) userId = String(u.id); } catch (e) { /* no user in the data */ }
  const app = () => (window.Telegram && window.Telegram.WebApp) || null;
  const data = () => initData || (app() && app().initData) || '';
  const call = (f, ...a) => { const W = app(); try { if (W && typeof W[f] === 'function') return W[f](...a); } catch (e) { /* older Telegram */ } };
  let backBound = false;
  /* the system «Back» button: closes the top sheet, otherwise returns to «Сегодня» */
  function syncChrome() {
    const W = app(); if (!W) return;
    const back = W.BackButton;
    if (back) {
      if (!backBound) { backBound = true; back.onClick(() => { if (typeof sheetTop === 'function' && sheetTop()) closeTop(); else if (S.stage === 'app' && S.tab !== 'today') A.tab('today'); }); }
      const need = !!(($('#sheets') || {}).children || []).length || (S.stage === 'app' && S.tab !== 'today');
      try { need ? back.show() : back.hide(); } catch (e) { /* older Telegram */ }
    }
    call(S.workout ? 'enableClosingConfirmation' : 'disableClosingConfirmation');   // a workout in progress: ask before closing
  }
  function onReady() {
    call('disableVerticalSwipes');   // dragging days and exercises must not fold the app
    syncChrome();
  }
  return {inside: () => !!data(), initData: data, app, syncChrome, onReady, userId: () => userId, slot: () => (userId ? ':tg' + userId : ''),
    user: () => { try { return JSON.parse(new URLSearchParams(data()).get('user') || 'null'); } catch (e) { return null; } }};
})();

const telegramBridge = Startup.telegram(/tgWebApp/.test(location.hash) || window.TelegramWebviewProxy || TG.inside());

'use strict';
/* results from the camera: on start, when coming back to this tab, and when another tab writes them */
window.addEventListener('pageshow', processInbox);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { processInbox(); if (Account.signedIn()) Sync.schedule(300); } else if (Account.signedIn()) Sync.now(); });
window.addEventListener('focus', processInbox);
window.addEventListener('storage', e => { if (e.key === INBOX && e.newValue) processInbox(); else if (e.key === KEY && e.newValue && !S.workout) { S = load(); render(); } });

/* inside Telegram: use its frame (also after coming back from the camera page, when the address no longer carries tgWebApp…) */
telegramBridge.then(W => {
  if (!W) return;
  try { W.ready(); W.expand(); } catch (e) { /* old client */ }
  applyTheme();
  TG.onReady();
});
if (location.hash === '#from-camera') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } }
if (S.stage !== 'welcome' && !S.user && !S.demo) S.stage = 'welcome';
render();
processInbox();
/* the account: sign in with Telegram or the saved session, then sync (the app is already usable meanwhile) */
Account.start();

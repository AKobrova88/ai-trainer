'use strict';
/* ---------- theme ---------- */
function applyTheme() {
  const root = document.documentElement;
  if (S.theme === 'bento') root.setAttribute('data-theme', 'bento'); else root.removeAttribute('data-theme');
  const bg = S.theme === 'bento' ? '#f1e8dc' : '#12151f';
  const tc = $('meta[name="theme-color"]');
  if (tc) tc.content = bg;
  const W = window.Telegram && window.Telegram.WebApp;
  if (W) { try { W.setHeaderColor && W.setHeaderColor(bg); W.setBackgroundColor && W.setBackgroundColor(bg); } catch (e) { /* older Telegram */ } }
}


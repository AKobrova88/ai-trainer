'use strict';
/* ---------- sheets & toasts ---------- */
function syncSheets(returnTo) {
  const wraps = $$('#sheets > .sheet-wrap'), top = wraps[wraps.length - 1];
  document.body.classList.toggle('sheet-open', !!top);
  $$('#onb,.top,#view,.tabs,#restbar').forEach(el => { el.inert = !!top; });
  wraps.forEach(w => { w.inert = w !== top; });
  if (returnTo && returnTo.isConnected && !returnTo.closest('[inert]')) returnTo.focus({preventScroll: true});
  else if (top) $('[role="dialog"]', top).focus({preventScroll: true});
  TG.syncChrome();
}
function sheet(title, body, foot = '', size = '', stack = false) {
  const returnTo = sheetTop()?._returnFocus || document.activeElement;
  if (!stack) closeSheet(false);
  const w = document.createElement('div');
  w._returnFocus = stack ? document.activeElement : returnTo;
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="sheet-h"><h2>${esc(title)}</h2><button class="icon-btn" data-act="${stack ? 'close-top' : 'close'}" aria-label="закрыть">✕</button></div><div class="sheet-b">${body}</div>${foot ? `<div class="sheet-f">${foot}</div>` : ''}</div>`;
  w.addEventListener('pointerdown', e => { if (e.target === w) w.dataset.down = '1'; });
  w.addEventListener('click', e => { if (e.target === w && w.dataset.down) { stack ? closeTop() : closeSheet(); } delete w.dataset.down; });
  $('#sheets').appendChild(w);
  syncSheets();
  return w;
}
function closeSheet(restoreFocus = true) {
  const returnTo = $('#sheets').firstElementChild?._returnFocus;
  if (REC) stopMic(true);
  $('#sheets').innerHTML = ''; S.wiz = null;
  syncSheets(restoreFocus ? returnTo : null);
}
let toastT;
function toast(msg, withUndo) {
  clearTimeout(toastT);
  $('#toast-root').innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${withUndo && undoSnap ? '<button data-act="undo">Вернуть</button>' : ''}</div>`;
  toastT = setTimeout(() => { $('#toast-root').innerHTML = ''; }, 4500);
}


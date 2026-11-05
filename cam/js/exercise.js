'use strict';
/* ---------- exercise ---------- */
function fillSelect() {
  const sorted = keys.slice().sort((a, b) => EX.ex[a].name.localeCompare(EX.ex[b].name, 'ru'));
  if (FREE) sorted.unshift(FREE);
  for (const k of FREE_KEYS) if (!sorted.includes(k)) sorted.unshift(k);
  el.sel.innerHTML = sorted.map(k => '<option value="' + k + '">' + esc(EX.ex[k].name) + (FREE_KEYS.has(k) ? ' · счёт повторов' : '') + '</option>').join('');
  el.sel.value = state.ex;
}
function setExercise(key) {
  if (state.file) stopCamera();
  if (state.on && !state.preflight && state.analyzer && state.analyzer.reps.length && !state.analyzer.setEnded) {
    state.analyzer.endSet(); processEvents(state.analyzer.drain());
  }
  state.ex = key; el.sel.value = key;
  if (key !== FREE) store.set('aitrainer.v2', Object.assign(prefs, { ex: key }));
  el.camTip.textContent = '📱 ' + (isFree() ? 'Поставь телефон в 2–3 м так, чтобы работающий сустав было хорошо видно (лучше сбоку)'
    : state.ex === 'leg_ext' ? '📍 Разгибания ног: нужны таз, колено и стопа одной ноги. Голова и руки для подсчёта не обязательны. Телефон можно поставить под углом'
    : 'Поставь телефон ровно в 2–3 м. Можно спереди, сбоку, сзади или под углом, если рабочие суставы видны');
  if (isFree()) { el.howto.removeAttribute('src'); try { el.howto.load(); } catch (e) { /* fine */ } }
  else {
    if (HOWTO_HAVE.has(key)) el.howto.src = 'howto/' + key + '.mp4'; else { el.howto.removeAttribute('src'); try { el.howto.load(); } catch (e) { /* fine */ } }
    if (!state.on) try { const p = el.howto.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* autoplay blocked */ }
  }
  state.fallback = false; barReset();
  if (state.on && !state.file && !state.recOnly) { Rec.drop(); state.preflight = true; }
  el.note.hidden = !isFree() || state.on;
  loadSets();
  newAnalyzer();
  renderSets(); renderMain();
}
function newAnalyzer() {
  state.revision++;
  state.analyzer = state.fallback && state.ex === 'leg_ext' ? new AT.LegExtensionAnalyzer(state.level,true)
    : isFree() || state.fallback ? new AT.FreeAnalyzer(state.level, state.ex, !!state.fallback) : AT.analyzerFor(state.ex, state.depth, state.level);
  state.snap = null; state.flash = null;
  state.preflightReady = false; state.preflightSince = null;
  resetDet();
}
el.sel.addEventListener('change', () => setExercise(el.sel.value));


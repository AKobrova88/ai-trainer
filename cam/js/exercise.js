'use strict';
/* ---------- exercise ---------- */
function fillSelect() {
  const sorted = [...keys, ...FREE_KEYS].sort((a, b) => EX.ex[a].name.localeCompare(EX.ex[b].name, 'ru'));
  const options = list => list.map(k => '<option value="' + esc(k) + '">' + esc(EX.ex[k].name) + '</option>').join('');
  el.sel.innerHTML = '<optgroup label="Разбор техники">' + options(sorted.filter(k => !FREE_KEYS.has(k))) + '</optgroup>' +
    '<optgroup label="Счёт повторов">' + options(sorted.filter(k => FREE_KEYS.has(k))) + '</optgroup>';
  el.sel.value = state.ex;
  const query = $('#exerciseSearch'), results = $('#exerciseMatches');
  const normName = s => s.toLowerCase().replace(/ё/g, 'е');
  const search = () => {
    const words = normName(query.value).trim().split(/\s+/).filter(Boolean);
    const matches = words.length ? sorted.filter(k => [EX.ex[k].name, ...(SYN[k] || [])].some(name => words.every(w => normName(name).includes(w))))
      : [...new Set([state.ex, ...PLAN.map(p => p.k), ...sorted])].filter(k => cameraHas(k));
    results.innerHTML = matches.map(k => '<button type="button" data-ex="' + esc(k) + '"' +
      (k === state.ex ? ' aria-current="true"' : '') + '>' + esc(EX.ex[k].name) +
      (k === state.ex ? '<span aria-hidden="true">✓</span>' : '') + '</button>').join('') || '<p>Упражнения не найдены</p>';
  };
  query.addEventListener('input', search);
  $('#exerciseBtn').addEventListener('click', () => {
    query.value = ''; search(); openSheet($('#exerciseFinder'));
  });
  results.addEventListener('click', e => {
    const button = e.target.closest('button[data-ex]');
    if (!button || !cameraHas(button.dataset.ex)) return;
    setExercise(button.dataset.ex);
    closeSheet($('#exerciseFinder'));
  });
}
function setExercise(key, keepVideo = false) {
  if (state.file && !keepVideo) stopCamera();
  if (!keepVideo && state.on && !state.preflight && state.analyzer && state.analyzer.reps.length && !state.analyzer.setEnded) {
    state.analyzer.endSet(); processEvents(state.analyzer.drain());
  }
  state.ex = key; el.sel.value = key; $('#exerciseName').textContent = info().name;
  if (key !== FREE) store.set('aitrainer.v2', Object.assign(prefs, { ex: key }));
  el.camTip.textContent = (isFree() ? 'Поставь телефон в 2–3 м так, чтобы работающий сустав было хорошо видно (лучше сбоку)'
    : state.ex === 'leg_ext' ? 'Разгибания ног: нужны таз, колено и стопа одной ноги. Голова и руки для подсчёта не обязательны. Телефон можно поставить под углом'
    : 'Поставь телефон ровно в 2–3 м. Можно спереди, сбоку, сзади или под углом, если рабочие суставы видны');
  try { el.howto.pause(); } catch (e) { /* fine */ }
  el.howto.controls = false;
  el.howto.removeAttribute('src');
  try { el.howto.load(); } catch (e) { /* fine */ }
  const example = $('#showHowto');
  if (example) example.hidden = isFree() || !HOWTO_HAVE.has(key) || state.on;
  state.fallback = false; barReset();
  if (state.on && !state.file && !state.recOnly) { Rec.drop(); startPreparation(false); }
  el.note.hidden = !isFree() || state.on;
  loadSets();
  newAnalyzer(!keepVideo);
  if(state.on && state.stream && !state.file)Rec.start(state.stream);
  renderSets(); renderMain();
}
function newAnalyzer(resetPose = true) {
  state.revision++;
  state.analyzer = AT.isLunge(state.ex) ? new AT.LungeAnalyzer(state.ex, state.level, state.depth, !!state.fallback)
    : state.fallback && state.ex === 'leg_ext' ? new AT.LegExtensionAnalyzer(state.level,true)
    : isFree() || state.fallback ? new AT.FreeAnalyzer(state.level, state.ex, !!state.fallback) : AT.analyzerFor(state.ex, state.depth, state.level);
  state.snap = null; state.flash = null;
  state.preflightReady = false; state.preflightSince = null;
  if (resetPose) resetDet();
}
el.sel.addEventListener('change', () => setExercise(el.sel.value));


const exampleButton = $('#showHowto');
if (exampleButton) exampleButton.addEventListener('click', () => {
  if (isFree() || !HOWTO_HAVE.has(state.ex) || state.on) return;
  el.howto.src = 'howto/' + state.ex + '.mp4';
  el.howto.controls = true;
  const play = el.howto.play(); if (play && play.catch) play.catch(() => {});
  exampleButton.hidden = true;
});

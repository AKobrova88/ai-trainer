'use strict';
/* ---------- sets ---------- */
const recordedSetArrays = new WeakSet();
function recordSet() {
  const A = state.analyzer; if (!A || !A.reps.length) return;
  if (recordedSetArrays.has(A.reps)) return;
  recordedSetArrays.add(A.reps);
  const reps = A.reps, hold = isHold(), countOnly = isFree() || !!state.fallback, partial = !countOnly && reps.some(r => r.partial);
  const graded = !countOnly && !partial;
  const faults = {}; for (const r of reps) for (const id of r.faultList) faults[id] = (faults[id] || 0) + 1;
  const top = Object.keys(faults).sort((a, b) => faults[b] * A.meta(b).pen - faults[a] * A.meta(a).pen)[0];
  const prevW = state.sets.length ? state.sets[state.sets.length - 1].w : urlW();
  const set = {
    r: hold ? Math.round(reps.reduce((a, r) => a + (r.extra.secs || 0), 0)) : reps.length,
    n: graded ? reps.length : 0, c: graded ? reps.filter(r => !r.faultList.length).length : 0, f: countOnly ? {} : faults, w: weighted() ? prevW : null, cue: countOnly ? '' : top ? A.meta(top).cue : '',
    g: graded ? reps.map(r => !r.faultList.length ? 0 : r.grade === 'bad' ? 2 : 1) : [], file: !!state.usedFile, countOnly,
    partial, analysisMode: reps.some(r => r.analysisMode === '3d') ? '3d' : '2d'
  };
  set.note = countOnly ? 'Повторы посчитаны. Техника не оценивалась.' : partial
    ? '3D: предварительные подсказки по видимым суставам. ' + (set.cue || 'В доступных проверках замечаний нет.') + (AT.family(state.ex) === 'squat' ? ' Контакт пяток с полом не проверен.' : '')
    : setVerdict(set, set.cue);
  if (A.isBar) { set.bar = true; set.analysisMode = 'bar'; set.note = A.note(); }
  state.sets.push(set); state.view = A.view || state.view; saveSets();
  if (!state.file) { Rec.restart(); attemptT0 = performance.now(); helperAt = 25000; }
  state.flash = { cls: set.c / set.n >= 0.8 ? 'good' : 'info', text: 'Подход ' + state.sets.length + ' · ' + set.note, until: performance.now() + 6000 };
  Coaching.completed(set);
  renderSets(); renderMain();
  afterSet();
}
function qClass(s) { if (!s.n) return 'none'; const q = s.c / s.n; return q >= 0.8 ? 'good' : q >= 0.5 ? 'fair' : 'bad'; }
function renderExerciseSummary() {
  const result = CoachText.summary(state.sets, {hold:isHold(),analysis:true}), box = $('#exerciseSummary');
  box.hidden = !result.sets;
  if (box.textContent !== result.text) box.textContent = result.text;
}
function renderSets() {
  const hold = isHold(), w = weighted();
  el.setsBox.hidden = !state.sets.length && !state.fromBot;
  el.setsTitle.textContent = state.sets.length ? 'Подходы · ' + state.sets.length : 'Подходы';
  el.setList.innerHTML = state.sets.map((s, i) => '<li class="set" data-i="' + i + '"><span class="set-n">' + (i + 1) + '</span><span class="set-main">' +
    (w ? '<input class="w" inputmode="decimal" aria-label="Вес, кг" placeholder="кг" value="' + esc(kgTxt(s.w)) + '"> кг ×' : '') +
    '<input class="r" inputmode="numeric" aria-label="' + (hold ? 'Секунды' : 'Повторы') + '" value="' + esc(s.r) + '"> ' + (hold ? 'с' : 'повт.') +
    '</span><button class="set-del" type="button" aria-label="Удалить подход">×</button>' +
    (s.n || s.note ? '<p class="set-note">' + (s.n ? '<span class="set-q ' + qClass(s) + '">' + (hold ? (s.c ? 'ровно' : 'поправить') : 'чисто ' + s.c + ' из ' + s.n) + '</span> ' : '') + esc(s.note || '') + '</p>' : '') + '</li>').join('') +
    '<li><button class="add-set" type="button" id="addSet" style="width:100%">+ Добавить подход вручную</button></li>';
  renderSend(); renderPlan();
}

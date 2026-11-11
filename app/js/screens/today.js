'use strict';
/* ---------- today / workout ---------- */
function viewToday() {
  return S.workout ? viewWorkout() : viewDiary();
}
function startWorkout(dayId) {
  if (S.workout) {
    if (S.workout.dayId === dayId) { closeSheet(); S.tab = 'today'; render(); window.scrollTo({top:0}); return; }
    return sheet('Сначала заверши текущую тренировку', `<p class="hint">«${esc(S.workout.title)}» ещё не завершена. Подходы сохранены. Заверши её, чтобы начать другой день.</p>`, '<button class="btn" data-act="close">В дневник</button><button class="btn primary" data-act="resume-workout">Продолжить тренировку</button>');
  }
  const d = dayById(dayId);
  if (!d || !d.items.length) return toast('В этом дне пока нет упражнений');
  if (!S.healthOk) return healthSheet(() => startWorkout(dayId));
  S.workout = {dayId, title: d.title, start: Date.now(), active: 0, items: d.items.map(it => {
    const sg = suggest(it), last = lastSets(it);
    return {...JSON.parse(JSON.stringify(it)), hint: sg.text, up: !!sg.up, sets: Array.from({length: it.s}, (_, k) => ({w: sg.w, r: sg.up ? it.lo : (last && last.sets[k] ? Math.min(it.hi, last.sets[k].r + (last.sets[k].r < it.hi ? 1 : 0)) : it.lo), done: false}))};
  })};
  const plan = (S.schedule || []).find(p => p.dayId === dayId && p.date === dateKey());
  if (plan) S.workout.planId = plan.id;
  S.rest = null; S.tab = 'today'; S.justFinished = null;
  render(); window.scrollTo({top: 0});
}
function camBtn(it, i) {
  if (it.sec && !it.cam) return '';
  if (!canCamera()) return `<button class="btn" data-act="paywall" data-v="cam">${I.lock}Снять подход</button>`;
  return `<a class="btn" href="${esc(camLink(it))}" ${SAME_SITE ? '' : 'target="_blank" rel="noopener"'} data-act="cam-go" data-v="${i}">${I.camera}Снять подход</a>`;
}
function viewWorkout() {
  const W = S.workout, all = W.items.flatMap(i => i.sets), done = all.filter(s => s.done).length;
  const labs = blockLabels(W.items);
  const cards = W.items.map((it, i) => {
    const fin = it.sets.length && it.sets.every(s => s.done), open = i === W.active;
    const G = groupOf(W.items, i), ssHead = it.ss && G[0] === i ? `<div class="ss-h">Суперсет ${labs[G[0]]}–${labs[G[G.length - 1]]}: по подходу по очереди, отдых после круга</div>` : '';
    const sum = it.sets.filter(s => s.done).map(s => `${s.w ? fmt(s.w) + '×' : ''}${s.r}${it.sec ? ' с' : ''}`).join('  ');
    const head = `<button class="wx-h" data-act="wx-open" data-v="${i}" aria-expanded="${open}"><span class="wx-n">${fin ? '✓' : labs[i]}</span><span class="wx-t"><b>${esc(it.name)}</b><span>${open || !sum ? (it.sets.length ? dose({...it,s:it.sets.length}) : 'Без подходов') + (it.sets[0] && it.sets[0].w ? ' · ' + fmt(it.sets[0].w) + ' кг' : '') : sum}</span></span>${it.cam ? '<span class="badge cam">камера</span>' : ''}</button>`;
    if (!open) return `${ssHead}<article class="wx ${fin ? 'done' : ''} ${it.ss ? 'ss' : ''}">${head}</article>`;
    const wcol = !!stepOf(it) || it.sets.some(s => s.w);
    const rows = it.sets.map((s, k) => `
      <div class="set ${s.done ? 'done' : ''}">
        <span class="i">${k + 1}</span>
        ${wcol ? `<input class="set-input" inputmode="decimal" aria-label="Вес в подходе ${k+1}, кг" data-in="w" data-v="${i}:${k}" value="${fmt(s.w)}">` : '<span class="hint" style="text-align:center">свой вес</span>'}
        <input class="set-input" inputmode="numeric" aria-label="${it.sec ? 'Секунды' : 'Повторы'} в подходе ${k+1}" data-in="r" data-v="${i}:${k}" value="${s.r}">
        <button class="check" data-act="done" data-v="${i}:${k}" aria-label="подход сделан" aria-pressed="${s.done}">${CHECK}</button>
      </div>`).join('');
    return `${ssHead}<article class="wx open ${fin ? 'done' : ''} ${it.ss ? 'ss' : ''}">${head}<div class="wx-b">
      <p class="coach ${it.up ? 'up' : ''}">${it.hint}</p>
      ${it.coachNotes && it.coachNotes.length ? `<p class="hint">Заметка тренера: ${it.coachNotes.map(esc).join(' · ')}</p>` : ''}
      ${it.base && CAT[it.base] && CAT[it.base].cue ? `<p class="hint" style="margin:-4px 2px 0">${esc(CAT[it.base].cue)}</p>` : ''}
      <div class="sets"><div class="set set-h"><span>#</span><span>${wcol ? 'кг' : ''}</span><span>${it.sec ? 'секунды' : 'повторы'}</span><span></span></div>${rows}</div>
      <div class="wx-a"><button class="btn sm" data-act="addset" data-v="${i}">${I.plus}Подход</button>${camBtn(it, i)}<button class="icon-btn" data-act="wx-menu" data-v="${i}" aria-label="ещё">${DOTS}</button></div>
    </div></article>`;
  }).join('');
  return [W.title.replace(/^День \d+ · /, ''), `
    <div class="wo-head"><div class="row"><span class="grow hint">${done} из ${all.length} подходов</span><span class="clock" id="clock">${clock(Date.now() - W.start)}</span></div><div class="bar"><i style="width:${all.length ? done / all.length * 100 : 0}%"></i></div></div>
    ${cards}
    <button class="btn" data-act="wx-add">${I.plus}Добавить упражнение на сегодня</button>
    <div class="workout-dock"><button class="btn primary big" data-act="finish">Завершить тренировку</button></div>`,
    todayMore()];
}
function renderRest() {
  const el = $('#restbar');
  if (!S.workout || !S.rest || S.tab !== 'today' || S.stage !== 'app') { el.hidden = true; return; }
  const lft = Math.round((S.rest.end - Date.now()) / 1000);
  el.hidden = false;
  if (!el.firstElementChild) el.innerHTML = '<div class="rest" role="group" aria-label="Отдых между подходами"><span class="t" role="timer" aria-label="Осталось отдыхать"></span><span class="l" role="status"></span><button data-act="rest-add" aria-label="Добавить 15 секунд отдыха">+15 с</button><button data-act="rest-skip"></button></div>';
  $('.rest', el).classList.toggle('over', lft <= 0);
  $('.t', el).textContent = lft > 0 ? clock(lft * 1000) : '0:00';
  const label = lft > 0 ? 'Отдых' : 'Пора, следующий подход';
  if ($('.l', el).textContent !== label) $('.l', el).textContent = label;
  $('[data-act="rest-skip"]', el).textContent = lft > 0 ? 'Дальше' : 'Скрыть';
}
setInterval(() => {
  if (S.workout) { const c = $('#clock'); if (c) c.textContent = clock(Date.now() - S.workout.start); }
  if (S.rest) {
    const l = S.rest.end - Date.now();
    if (l <= 0 && !S.rest.buzz) { S.rest.buzz = 1; try { navigator.vibrate && navigator.vibrate([120, 80, 120]); } catch (e) { /* no vibration */ } }
    if (l < -60000) S.rest = null;
    renderRest();
  }
}, 500);
function finishSheet() {
  const W = S.workout; if (!W) return;
  const all = W.items.flatMap(i => i.sets), done = all.filter(s => s.done).length;
  if (!done) return sheet('Завершить тренировку?', `<p class="hint">Ни один подход не отмечен — в дневник ничего не попадёт.</p>`, `<button class="btn" data-act="close">Продолжить</button><button class="btn danger" data-act="discard">Завершить без записи</button>`);
  if(done===all.length)return saveWorkout();
  const l = all.length - done;
  sheet('Завершить тренировку?', `<p style="margin:0">${done} из ${all.length} подходов отмечены.${l ? ` Неотмеченные ${l} ${plural(l, 'подход', 'подхода', 'подходов')} не попадут в дневник.` : ''}</p>`,
    `<button class="btn" data-act="close">Продолжить</button><button class="btn primary" data-act="save-wo">Завершить</button>`);
}
function saveWorkout() {
  const W = S.workout; if (!W) return false;
  const items = W.items.map(it => ({name: it.name, base: it.base, sec: it.sec || undefined, sets: it.sets.filter(s => s.done).map(s => ({w: s.w, r: s.r, ...(s.c != null ? {c: s.c, n: s.n} : {}),
    ...(s.partial ? {partial:true} : {}), ...(s.analysisMode ? {analysisMode:s.analysisMode} : {}), ...(s.note ? {note:s.note} : {}), ...(s.cue ? {cue:s.cue} : {}), ...(s.ft ? {ft:s.ft} : {})}))})).filter(e => e.sets.length);
  if (!items.length) return false;
  const entry = {id:nid('w'), dayId:W.dayId, date:W.start, title:W.title, dur:Math.max(1, Math.round((Date.now() - W.start) / 60000)), items};
  const previous = S, idx = S.program.days.findIndex(d => d.id === W.dayId);
  /* Commit diary, next day and the consumed plan together; a full device must not erase the workout. */
  S = {...S, diary:[entry, ...S.diary], schedule:(S.schedule || []).filter(p => p.id !== W.planId),
    next:idx >= 0 ? S.program.days[(idx + 1) % S.program.days.length].id : S.next,
    workout:null, rest:null, pick:null, tab:'diary', dtab:'hist', open:{...S.open, [entry.id]:true}, justFinished:entry.id};
  selectDiaryDate(dateKey(entry.date));
  if (!save()) {
    S = previous; toast('Тренировка пока не записана в дневник. Подходы сохранены на экране — освободи место и повтори.'); return false;
  }
  closeSheet(); render(); window.scrollTo({top:0});
  const panel = $('#diary-day'); if (panel && panel.scrollIntoView) panel.scrollIntoView({block:'start'});
  return true;
}
function healthSheet(then) {
  HEALTH_THEN = then;
  sheet('Перед первой тренировкой', `<div class="doc">${DOCS.health.body}</div>`, `<button class="btn primary" data-act="health-ok">Понятно, начинаем</button>`);
}
let HEALTH_THEN = null;


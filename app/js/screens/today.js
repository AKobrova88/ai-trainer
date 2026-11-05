'use strict';
/* ---------- today / workout ---------- */
function viewToday() {
  if (S.workout) return viewWorkout();
  if (!S.program.days.length) return ['Сегодня', `
    <section class="empty-card"><h2>Программы пока нет</h2><p class="hint" style="margin:0">Подберу её по твоим пожеланиям или разберу твою из другого приложения.</p>
      <div class="row" style="flex-wrap:wrap"><button class="btn primary" data-act="wish">${I.spark}Подобрать</button><button class="btn" data-act="import">${I.photo}Загрузить свою</button></div></section>
    <button class="btn" data-act="tab" data-v="camera">${I.camera}Тренировка с камерой без программы</button>`];
  const d = dayById(S.pick) || nextDay();
  const T0 = Date.now(), weekStart = (() => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); })();
  const week = S.diary.filter(w => w.date >= weekStart && !w.camOnly).length, last = S.diary.find(w => !w.camOnly);
  const chips = S.program.days.map(x => `<button class="chip" data-act="pick" data-v="${x.id}" aria-pressed="${x.id === d.id}">${esc(x.title.replace(/^День (\d+) · .*/, 'День $1'))}${x.id === S.next ? ' · по плану' : ''}</button>`).join('');
  const items = d.items.map(it => { const sg = suggest(it); return `<li><span class="nm">${esc(it.name)}${it.cam ? ' <span class="badge cam">камера</span>' : ''}${sg.up ? ' <span class="badge next">+ вес</span>' : ''}</span><span class="ds">${dose(it)}${sg.w ? ' · ' + fmt(sg.w) + ' кг' : ''}</span></li>`; }).join('');
  const mins = Math.round(d.items.reduce((a, it) => a + it.s * (1 + it.rest / 60), 0) + 6);
  const ups = d.items.filter(it => suggest(it).up);
  return ['Сегодня', `
    <div class="statline">
      <div class="stat"><b>${week} из ${S.program.days.length}</b><span>на этой неделе</span></div>
      <div class="stat"><b>${S.diary.filter(w => !w.camOnly).length}</b><span>всего тренировок</span></div>
      <div class="stat"><b>${last ? Math.max(0, Math.round((T0 - last.date) / 864e5)) + ' дн.' : '—'}</b><span>с прошлой</span></div>
    </div>
    <section class="card pad daypick">
      <div class="eyebrow">${d.id === S.next ? 'Следующая тренировка' : 'Выбранная тренировка'}</div>
      <div class="chips">${chips}</div>
      <div class="row"><div class="grow"><h2>${esc(d.title.replace(/^День \d+ · /, ''))}</h2><div class="hint">${d.items.length} ${plural(d.items.length, 'упражнение', 'упражнения', 'упражнений')} · около ${mins} мин</div></div></div>
      <button class="btn primary big" data-act="start" data-v="${d.id}" ${d.items.length ? '' : 'disabled'}>Начать тренировку</button>
      ${ups.length ? `<p class="coach up" style="margin:0">${ups.length === 1 ? `В «${esc(ups[0].name)}» прибавляем вес` : `Прибавляем вес в ${ups.length} ${plural(ups.length, 'упражнении', 'упражнениях', 'упражнениях')}`}: прошлый раз ты закрыла все подходы.</p>` : ''}
      <ul class="plan-list">${items || '<li class="muted">В этом дне пока нет упражнений</li>'}</ul>
    </section>`];
}
function startWorkout(dayId) {
  if (!S.healthOk) return healthSheet(() => startWorkout(dayId));
  const d = dayById(dayId);
  S.workout = {dayId, title: d.title, start: Date.now(), active: 0, items: d.items.map(it => {
    const sg = suggest(it), last = lastSets(it);
    return {...JSON.parse(JSON.stringify(it)), hint: sg.text, up: !!sg.up, sets: Array.from({length: it.s}, (_, k) => ({w: sg.w, r: sg.up ? it.lo : (last && last.sets[k] ? Math.min(it.hi, last.sets[k].r + (last.sets[k].r < it.hi ? 1 : 0)) : it.lo), done: false}))};
  })};
  S.rest = null; S.tab = 'today';
  render(); window.scrollTo({top: 0});
}
function camBtn(it, i) {
  if (it.sec && !it.cam) return '';
  if (!canCamera()) return `<button class="btn" data-act="paywall" data-v="cam">${I.lock}Камера</button>`;
  return `<a class="btn" href="${esc(camLink(it))}" ${SAME_SITE ? '' : 'target="_blank" rel="noopener"'} data-act="cam-go" data-v="${i}">${I.camera}Камера</a>`;
}
function viewWorkout() {
  const W = S.workout, all = W.items.flatMap(i => i.sets), done = all.filter(s => s.done).length;
  const labs = blockLabels(W.items);
  const cards = W.items.map((it, i) => {
    const fin = it.sets.length && it.sets.every(s => s.done), open = i === W.active;
    const G = groupOf(W.items, i), ssHead = it.ss && G[0] === i ? `<div class="ss-h">Суперсет ${labs[G[0]]}–${labs[G[G.length - 1]]}: по подходу по очереди, отдых после круга</div>` : '';
    const sum = it.sets.filter(s => s.done).map(s => `${s.w ? fmt(s.w) + '×' : ''}${s.r}${it.sec ? ' с' : ''}`).join('  ');
    const head = `<button class="wx-h" data-act="wx-open" data-v="${i}" aria-expanded="${open}"><span class="wx-n">${fin ? '✓' : labs[i]}</span><span class="wx-t"><b>${esc(it.name)}</b><span>${open || !sum ? dose(it) + (it.sets[0] && it.sets[0].w ? ' · ' + fmt(it.sets[0].w) + ' кг' : '') : sum}</span></span>${it.cam ? '<span class="badge cam">камера</span>' : ''}</button>`;
    if (!open) return `${ssHead}<article class="wx ${fin ? 'done' : ''} ${it.ss ? 'ss' : ''}">${head}</article>`;
    const wcol = !!stepOf(it) || it.sets.some(s => s.w);
    const rows = it.sets.map((s, k) => `
      <div class="set ${s.done ? 'done' : ''}">
        <span class="i">${k + 1}</span>
        ${wcol ? `<div class="step"><button data-act="adj" data-v="${i}:${k}:w:-1" aria-label="меньше вес">−</button><input inputmode="decimal" aria-label="вес, кг" data-in="w" data-v="${i}:${k}" value="${fmt(s.w)}"><button data-act="adj" data-v="${i}:${k}:w:1" aria-label="больше вес">+</button></div>` : '<span class="hint" style="text-align:center">свой вес</span>'}
        <div class="step"><button data-act="adj" data-v="${i}:${k}:r:-1" aria-label="меньше">−</button><input inputmode="numeric" aria-label="${it.sec ? 'секунды' : 'повторы'}" data-in="r" data-v="${i}:${k}" value="${s.r}"><button data-act="adj" data-v="${i}:${k}:r:1" aria-label="больше">+</button></div>
        <button class="check" data-act="done" data-v="${i}:${k}" aria-label="подход сделан" aria-pressed="${s.done}">${CHECK}</button>
      </div>`).join('');
    return `${ssHead}<article class="wx open ${fin ? 'done' : ''} ${it.ss ? 'ss' : ''}">${head}<div class="wx-b">
      <p class="coach ${it.up ? 'up' : ''}">${it.hint}</p>
      ${it.coachNotes && it.coachNotes.length ? `<p class="hint">Заметка тренера: ${it.coachNotes.map(esc).join(' · ')}</p>` : ''}
      ${it.base && CAT[it.base] && CAT[it.base].cue ? `<p class="hint" style="margin:-4px 2px 0">${esc(CAT[it.base].cue)}</p>` : ''}
      <div class="sets"><div class="set set-h"><span>#</span><span>${wcol ? 'кг' : ''}</span><span>${it.sec ? 'секунды' : 'повторы'}</span><span></span></div>${rows}</div>
      <div class="wx-a"><div class="sets-n" role="group" aria-label="Подходы"><button data-act="rmset" data-v="${i}" aria-label="убрать подход" ${it.sets.length <= 1 ? 'disabled' : ''}>−</button><span>${it.sets.length} ${plural(it.sets.length, 'подход', 'подхода', 'подходов')}</span><button data-act="addset" data-v="${i}" aria-label="добавить подход">+</button></div>${camBtn(it, i)}<button class="icon-btn" data-act="wx-menu" data-v="${i}" aria-label="ещё">${DOTS}</button></div>
    </div></article>`;
  }).join('');
  return [W.title.replace(/^День \d+ · /, ''), `
    <div class="wo-head"><div class="row"><span class="grow hint">${done} из ${all.length} подходов</span><span class="clock" id="clock">${clock(Date.now() - W.start)}</span></div><div class="bar"><i style="width:${all.length ? done / all.length * 100 : 0}%"></i></div></div>
    ${cards}
    <button class="btn" data-act="wx-add">${I.plus}Добавить упражнение на сегодня</button>
    <button class="btn primary big" data-act="finish">Завершить тренировку</button>`,
    '<button class="btn sm" data-act="finish">Финиш</button>'];
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
  const W = S.workout, all = W.items.flatMap(i => i.sets), done = all.filter(s => s.done).length;
  if (!done) return sheet('Завершить тренировку?', `<p class="hint">Ни один подход не отмечен — в дневник ничего не попадёт.</p>`, `<button class="btn" data-act="close">Продолжить</button><button class="btn danger" data-act="discard">Завершить без записи</button>`);
  const l = all.length - done;
  sheet('Завершить тренировку?', `<p style="margin:0">${done} из ${all.length} подходов отмечены.${l ? ` Неотмеченные ${l} ${plural(l, 'подход', 'подхода', 'подходов')} не попадут в дневник.` : ''}</p>`,
    `<button class="btn" data-act="close">Продолжить</button><button class="btn primary" data-act="save-wo">Завершить</button>`);
}
function saveWorkout() {
  const W = S.workout;
  const items = W.items.map(it => ({name: it.name, base: it.base, sec: it.sec || undefined, sets: it.sets.filter(s => s.done).map(s => ({w: s.w, r: s.r, ...(s.c != null ? {c: s.c, n: s.n} : {})}))})).filter(e => e.sets.length);
  const entry = {id: nid('w'), date: Date.now(), title: W.title, dur: Math.max(1, Math.round((Date.now() - W.start) / 60000)), items};
  const recs = items.filter(e => { const b = bestE1(e.name); return b && Math.max(...e.sets.map(e1)) > b + .01; }).map(e => e.name);
  const ups = W.items.filter(it => it.up && it.sets.some(s => s.done)).map(it => it.name);
  const vol = items.reduce((a, e) => a + e.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
  const cam = items.flatMap(e => e.sets).filter(s => s.n);
  S.diary.unshift(entry);
  const idx = S.program.days.findIndex(d => d.id === W.dayId);
  if (idx >= 0) S.next = S.program.days[(idx + 1) % S.program.days.length].id;
  S.workout = null; S.rest = null; S.pick = null;
  render();
  sheet('Тренировка записана', `
    <div class="kpis"><div class="stat"><b>${entry.dur} мин</b><span>время</span></div><div class="stat"><b>${items.reduce((a, e) => a + e.sets.length, 0)}</b><span>подходов</span></div><div class="stat"><b>${fmt(vol / 1000)} т</b><span>поднято</span></div></div>
    ${recs.length ? `<div class="card pad"><div class="eyebrow">Рекорды</div><p style="margin:.4em 0 0">${recs.map(esc).join(', ')}</p></div>` : ''}
    ${cam.length ? `<div class="card pad"><div class="eyebrow">Камера</div><p style="margin:.4em 0 0">Чистых повторов: <b>${cam.reduce((a, s) => a + s.c, 0)} из ${cam.reduce((a, s) => a + s.n, 0)}</b></p></div>` : ''}
    <p class="coach up">${ups.length ? `Ты прибавила вес в ${ups.length} ${plural(ups.length, 'упражнении', 'упражнениях', 'упражнениях')} — отличная работа.` : 'Хорошая работа.'} Следующая тренировка — «${esc(nextDay().title.replace(/^День \d+ · /, ''))}».</p>`,
    `<button class="btn" data-act="go-diary">В дневник</button><button class="btn primary" data-act="close">Готово</button>`);
}
function healthSheet(then) {
  HEALTH_THEN = then;
  sheet('Перед первой тренировкой', `<div class="doc">${DOCS.health.body}</div>`, `<button class="btn primary" data-act="health-ok">Понятно, начинаем</button>`);
}
let HEALTH_THEN = null;


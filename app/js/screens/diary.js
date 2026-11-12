'use strict';
/* ---------- diary ---------- */
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
/* Local calendar dates stay local: UTC conversion shifts late-evening workouts to another day. */
function dateKey(value = new Date()) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function calendarDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return null;
  const [y, m, d] = key.split('-').map(Number), value = new Date(y, m - 1, d, 12);
  return dateKey(value) === key ? value : null;
}
function selectDiaryDate(key = dateKey()) {
  const d = calendarDate(key); if (!d) return false;
  if (S.calDay !== key) S.diaryPick = null;
  S.calDay = key; S.calM = [d.getFullYear(), d.getMonth()]; S.dtab = 'hist';
  return true;
}
function workoutProgram(w) {
  if (w.camOnly) return null;
  if (w.programId) return w.programId;
  const owners = libraryPrograms().filter(p => (!p.at || w.date >= p.at) && p.days.some(d => w.dayId ? d.id === w.dayId : d.title === w.title));
  return owners.length === 1 ? owners[0].id : null;
}
function workoutDay(w, programId) {
  if (w.camOnly || workoutProgram(w) !== programId) return null;
  if (w.dayId) return w.dayId;
  const p = programById(programId), days = p?.days.filter(d => d.title === w.title) || [];
  return days.length === 1 ? days[0].id : null;
}
function diarySelection() {
  const pick = S.diaryPick;
  if (!pick || pick.date !== S.calDay) return null;
  const program = programById(pick.programId), day = program?.days.find(d => d.id === pick.dayId);
  return program && day ? {...pick, program, day} : null;
}
function pickDiaryDay(value) {
  const [pid, did] = String(value || '').includes(':') ? value.split(':') : [S.program.id, value];
  const p = programById(pid), day = p?.days.find(d => d.id === did);
  if (!day) return;
  if (!calendarDate(S.calDay)) selectDiaryDate();
  S.diaryProgram = pid; S.diaryPick = {programId:pid, dayId:did, date:S.calDay}; render(); revealDiaryPreview();
}
function pickPlannedWorkout(id) {
  const plan = (S.schedule || []).find(p => p.id === id), p = plan && programById(plan.programId);
  if (!p?.days.some(d => d.id === plan.dayId)) return toast('Этого дня больше нет в программе. Убери план и выбери другой.');
  selectDiaryDate(plan.date); S.diaryProgram = p.id;
  S.diaryPick = {programId:p.id, dayId:plan.dayId, date:plan.date, planId:id}; render(); revealDiaryPreview();
}
function revealDiaryPreview() {
  const preview = $('.diary-preview'); if (preview?.scrollIntoView) preview.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function planSelectedWorkout() {
  const pick = diarySelection();
  if (!pick || !pick.day.items.length || pick.date < dateKey()) return;
  if (pick.planId) return;
  const before = S;
  const plan = {id:nid('p'), date:pick.date, programId:pick.programId, programTitle:pick.program.title, dayId:pick.dayId, title:pick.day.title, at:Date.now()};
  S = {...S, schedule:[...(S.schedule || []),plan], diaryPick:null};
  if (!save()) { S = before; return toast('План не сохранён — освободи место и попробуй ещё раз'); }
  render(); toast('Тренировка запланирована');
}
function startSelectedWorkout() {
  const pick = diarySelection();
  if (!pick || pick.date !== dateKey()) return toast('Начать тренировку можно на сегодняшнюю дату');
  startWorkout(pick.dayId, pick.programId, pick.planId);
}
/* Old links may still ask to plan a day; they never start a workout. */
function togglePlan(dayId) {
  libraryPrograms();
  const existing = (S.schedule || []).find(p => p.date === S.calDay && p.programId === S.program.id && p.dayId === dayId);
  if (existing) return removePlan(existing.id);
  pickDiaryDay(S.program.id + ':' + dayId); planSelectedWorkout();
}
function removePlan(id) {
  const before = S;
  S = {...S, schedule:(S.schedule || []).filter(p => p.id !== id), diaryPick:S.diaryPick?.planId === id ? null : S.diaryPick};
  if (!save()) { S = before; return toast('Не удалось сохранить изменение плана'); }
  render();
}
function diaryDayPanel(key, entries) {
  const today = dateKey(), isToday = key === today, future = key > today, date = calendarDate(key);
  const programs = libraryPrograms(), selectedProgram = programById(S.diaryProgram) || S.program;
  const plans = (S.schedule || []).filter(p => p.date === key);
  const finished = entries.filter(w => !w.camOnly), saved = entries.find(w => w.id === S.justFinished), W = S.workout;
  const resume = isToday && W ? `<button class="btn primary big" data-act="resume-workout">Продолжить · ${esc(W.title)}</button><p class="hint">${esc(W.programTitle || '')} · подходы сохранены.</p>` : '';
  const planned = plans.length ? `<div class="diary-plans"><p class="eyebrow">Запланировано · ${plans.length}</p>${plans.map(plan => {
    const p = programById(plan.programId), d = p?.days.find(x => x.id === plan.dayId), selected = S.diaryPick?.planId === plan.id;
    return `<div class="diary-plan ${selected ? 'selected' : ''}"><button class="diary-plan-pick grow" data-act="plan-pick" data-v="${esc(plan.id)}" ${d?.items.length ? '' : 'disabled'} aria-pressed="${selected}"><b>${esc(d?.title || plan.title)}</b><span class="hint">${esc(p?.title || plan.programTitle || 'Программа')}${!d ? ' · день недоступен' : ''}</span></button><button class="icon-btn" data-act="plan-remove" data-v="${esc(plan.id)}" aria-label="Убрать ${esc(plan.title)} из плана">${I.trash}</button></div>`;
  }).join('')}</div>` : '';
  const choices = isToday || future ? selectedProgram.days.map(d => {
    const completed = finished.filter(w => workoutDay(w, selectedProgram.id) === d.id), selected = S.diaryPick?.programId === selectedProgram.id && S.diaryPick?.dayId === d.id && S.diaryPick?.date === key;
    return `<button class="diary-choice ${completed.length ? 'completed' : ''}" data-act="diary-pick" data-v="${esc(selectedProgram.id)}:${esc(d.id)}" aria-pressed="${selected}" ${d.items.length ? '' : 'disabled'}><span class="grow"><b>${esc(d.title)}</b><span class="hint">${completed.length ? '✓ Выполнено · ' : ''}${d.items.length} ${plural(d.items.length, 'упражнение', 'упражнения', 'упражнений')}</span></span><span class="diary-choice-action">${selected ? 'Выбрано ✓' : 'Выбрать'}</span></button>`;
  }).join('') : '';
  const pick = diarySelection();
  const preview = pick && (isToday || future) ? `<section class="diary-preview"><p class="eyebrow">${esc(pick.program.title)}</p><h3>${esc(pick.day.title)}</h3><details class="diary-exercises"><summary>Состав тренировки · ${pick.day.items.length} упр.</summary><ul class="plan-list">${pick.day.items.map(it => `<li><span class="nm">${esc(it.name)}</span><span class="ds">${dose(it)}${it.w ? ' · ' + fmt(it.w) + ' кг' : ''}</span></li>`).join('')}</ul></details><div class="diary-start-actions">${isToday ? `<button class="btn primary big" data-act="start-selected" ${pick.day.items.length ? '' : 'disabled'}>${W?.programId === pick.programId && W.dayId === pick.dayId ? 'Продолжить тренировку' : 'Начать тренировку'}</button>` : ''}${!pick.planId ? `<button class="btn ${future ? 'primary big' : ''}" data-act="plan-selected" ${pick.day.items.length ? '' : 'disabled'}>${future ? 'Запланировать тренировку' : 'Добавить в план'}</button>` : '<p class="hint">Эта тренировка уже в плане.</p>'}</div></section>` : '';
  return `<section class="card pad diary-day" id="diary-day"><div class="row"><h2 class="grow">${isToday ? 'Сегодня' : esc(ruDate(date, {day:'numeric',month:'long'}))}</h2>${!isToday ? '<button class="btn ghost" data-act="diary-today">Сегодня</button>' : ''}</div>
    ${saved ? `<p class="diary-success" role="status">Тренировка сохранена. ${esc(CoachText.praise(saved.items.reduce((n,e) => n + e.sets.length, 0)))}</p>` : ''}
    ${finished.length ? `<div class="diary-completed" aria-label="Выполнено за день">${finished.map(w => `<span class="badge next">✓ ${esc(w.programTitle || programById(workoutProgram(w))?.title || '')}${w.programTitle ? ' · ' : ' '}${esc(w.title)}</span>`).join('')}</div>` : ''}
    ${!entries.length && !future ? '<p class="hint">Пока нет записанных тренировок.</p>' : ''}
    ${resume}${planned}
    ${programs.length && (isToday || future) ? `<div class="field"><label for="diary-program">Из какой программы?</label><select class="input" id="diary-program">${programs.map(p => `<option value="${esc(p.id)}" ${p.id === selectedProgram.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></div>` : ''}
    ${preview}${choices ? `<p class="eyebrow">Выбери день · тренировка начнётся по кнопке</p><div class="diary-choices">${choices}</div>` : ''}
    ${!programs.length && (isToday || future) ? '<p class="hint">Добавь программу — её дни можно будет выбирать здесь.</p><button class="btn" data-act="tab" data-v="program">Добавить программу</button>' : ''}
  </section>`;
}
function viewDiary() {
  const seg = `<div class="seg"><button data-act="dtab" data-v="hist" aria-pressed="${S.dtab === 'hist'}">История</button><button data-act="dtab" data-v="prog" aria-pressed="${S.dtab === 'prog'}">Прогресс</button></div>`;
  if (S.dtab === 'prog') return ['Дневник', seg + viewProgress()];
  const [y, m] = S.calM, first = new Date(y, m, 1), nDays = new Date(y, m + 1, 0).getDate(), shift = (first.getDay() + 6) % 7;
  let selected = calendarDate(S.calDay);
  if (!selected || selected.getFullYear() !== y || selected.getMonth() !== m) {
    selected = new Date(y, m, y === now().getFullYear() && m === now().getMonth() ? now().getDate() : 1, 12);
    S.calDay = dateKey(selected);
  }
  const inMonth = S.diary.filter(w => { const d = new Date(w.date); return d.getFullYear() === y && d.getMonth() === m; });
  const has = new Set(inMonth.map(w => new Date(w.date).getDate()));
  const planned = new Set((S.schedule || []).map(p => p.date));
  let cells = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => `<div class="wd">${d}</div>`).join('');
  for (let i = 0; i < shift; i++) cells += '<div class="cal-d out"></div>';
  for (let d = 1; d <= nDays; d++) {
    const key = dateKey(new Date(y, m, d, 12)), plan = planned.has(key);
    cells += `<button class="cal-d ${has.has(d) ? 'has' : ''} ${plan ? 'planned' : ''} ${key === dateKey() ? 'today' : ''}" aria-pressed="${key === S.calDay}" aria-label="${d} ${MONTHS[m]} ${y}${has.has(d) ? ', есть тренировка' : ''}${plan ? ', запланировано' : ''}" data-act="cal-go" data-v="${key}">${d}</button>`;
  }
  const vol = inMonth.reduce((a, w) => a + w.items.reduce((b, e) => b + e.sets.reduce((c, s) => c + s.w * s.r, 0), 0), 0), mins = inMonth.reduce((a, w) => a + (w.dur || 0), 0);
  const selectedEntries = inMonth.filter(w => dateKey(w.date) === S.calDay);
  const otherEntries = inMonth.filter(w => dateKey(w.date) !== S.calDay);
  const logs = selectedEntries.map(logCard).join('') + (otherEntries.length ? '<h2 class="diary-history-title">Другие тренировки месяца</h2>' + otherEntries.map(logCard).join('') : '');
  return ['Дневник', `${seg}
    <details class="card cal" id="diary-calendar" ${S.calExpanded ? 'open' : ''}><summary>Календарь · ${MONTHS[m]} ${y}</summary><div class="cal-h"><button class="icon-btn" data-act="cal-m" data-v="-1" aria-label="предыдущий месяц" style="transform:scaleX(-1)">${CHEV}</button><b>${MONTHS[m]} ${y}</b><button class="icon-btn" data-act="cal-m" data-v="1" aria-label="следующий месяц">${CHEV}</button></div>
      <div class="cal-g">${cells}</div>
      <div class="sumline"><span><b>${inMonth.length}</b> ${plural(inMonth.length, 'тренировка', 'тренировки', 'тренировок')}</span><span><b>${Math.floor(mins / 60)} ч ${mins % 60} мин</b></span><span><b>${fmt(vol / 1000)} т</b> поднято</span></div></details>
    ${diaryDayPanel(S.calDay, selectedEntries)}${logs}${videoEntry()}`,todayMore()];
}
function logCard(w) {
  const d = new Date(w.date), open = S.open[w.id], nSets = w.items.reduce((a, e) => a + e.sets.length, 0);
  const body = open ? `<div class="log-b">${w.items.map((e, ei) => {
    const cam = e.sets.filter(s => s.n), partial = e.sets.some(s => s.partial);
    const cameraNote = partial ? '3D: предварительные подсказки по видимым суставам, без общей оценки техники.'
      : cam.length ? `Камера: чисто ${cam.reduce((a, s) => a + s.c, 0)} из ${cam.reduce((a, s) => a + s.n, 0)}` : '';
    return `<div class="log-ex"><b>${esc(e.name)}</b><div class="sets-chips">${e.sets.map((s, si) => `<button class="sc" data-act="set-edit" data-v="${w.id}:${ei}:${si}">${s.w ? fmt(s.w) + ' × ' : ''}${s.r}${e.sec ? ' с' : ''}</button>`).join('')}<button class="sc add" data-act="set-add" data-v="${w.id}:${ei}">＋ подход</button></div><p class="hint" style="margin:8px 0 0">${esc(CoachText.summary(e.sets,{hold:!!e.sec}).text)}</p>${cameraNote ? `<div class="hint" style="margin-top:6px">${I.camera.replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')} ${cameraNote}</div>` : ''}</div>`;
  }).join('')}</div>` : '';
  return `<article class="log" id="log-${w.id}"><button class="log-h" data-act="log-toggle" data-v="${w.id}" aria-expanded="${!!open}"><span class="log-d"><b>${d.getDate()}</b><span>${WD[d.getDay()]}</span></span><span class="grow"><b style="display:block">${esc(w.title)}</b>${w.programTitle ? `<span class="hint log-program">${esc(w.programTitle)}</span>` : ''}<span class="hint">${w.durMs != null ? clock(w.durMs) + ' · ' : w.dur ? w.dur + ' мин · ' : ''}${w.items.length} ${plural(w.items.length, 'упражнение', 'упражнения', 'упражнений')} · ${nSets} ${plural(nSets, 'подход', 'подхода', 'подходов')}</span></span><span style="width:20px;color:var(--muted);transform:rotate(${open ? 90 : 0}deg);transition:transform .15s">${CHEV}</span></button>${body}</article>`;
}
function setSheet(wid, ei, si) {
  const w = S.diary.find(x => x.id === wid), e = w.items[ei], s = si == null ? null : e.sets[si], v = s || e.sets[e.sets.length - 1] || {w: 0, r: 10};
  S.setEdit = {wid, ei, si};
  sheet(e.name, `<div class="hint">${ruDate(w.date)} · ${esc(w.title)}</div>
    <div class="grid2"><div class="field"><label for="se-w">Вес, кг</label><input class="input" id="se-w" inputmode="decimal" value="${fmt(v.w || 0)}"></div><div class="field"><label for="se-r">${e.sec ? 'Секунды' : 'Повторы'}</label><input class="input" id="se-r" inputmode="numeric" value="${v.r}"></div></div>`,
    `${s ? '<button class="btn danger" data-act="se-del">Удалить</button>' : '<button class="btn" data-act="close">Отмена</button>'}<button class="btn primary" data-act="se-save">${s ? 'Сохранить' : 'Добавить подход'}</button>`);
  setTimeout(() => { const i = $('#se-w'); i && i.select(); }, 50);
}
function exHistory(name) {
  return S.diary.filter(w => w.items.some(e => e.name === name && e.sets.length)).map(w => { const e = w.items.find(x => x.name === name && x.sets.length); const top = e.sets.reduce((a, s) => s.w > a.w || (s.w === a.w && s.r > a.r) ? s : a, e.sets[0]); return {date: w.date, w: top.w, r: top.r, sets: e.sets, e1: Math.max(...e.sets.map(e1))}; }).reverse();
}
function viewProgress() {
  const names = [...new Set(S.diary.flatMap(w => w.items.filter(e => e.sets.some(s => s.w)).map(e => e.name)))];
  if (!names.length) return '<div class="empty">Прогресс появится после первых тренировок с весом</div>';
  if (!S.prog || !names.includes(S.prog)) S.prog = names[0];
  const h = exHistory(S.prog), f = h[0], l = h[h.length - 1], best = h.reduce((a, x) => x.e1 > a.e1 ? x : a, h[0]);
  const weeks = Math.max(1, Math.round((l.date - f.date) / (7 * 864e5))), dw = l.w - f.w;
  return `
    <div class="chips">${names.map(n => `<button class="chip" data-act="prog-ex" data-v="${esc(n)}" aria-pressed="${n === S.prog}">${esc(n.length > 28 ? n.slice(0, 27) + '…' : n)}</button>`).join('')}</div>
    <div class="kpis"><div class="stat"><b>${fmt(l.w)} кг</b><span>рабочий вес</span></div><div class="stat"><b>${dw > 0 ? '+' : ''}${fmt(dw)} кг</b><span>за ${weeks} ${plural(weeks, 'неделю', 'недели', 'недель')}</span></div><div class="stat"><b>≈ ${fmt(Math.round(best.e1))} кг</b><span>максимум на 1 раз</span></div></div>
    <section class="card chart-card" style="position:relative"><div class="eyebrow" style="margin-bottom:6px">Рабочий вес по тренировкам, кг</div><div id="chart"></div></section>
    <section class="card pad"><table class="hist"><thead><tr><th>Дата</th><th>Подходы</th><th style="text-align:right">Лучший</th></tr></thead><tbody>
      ${h.slice().reverse().map(x => `<tr><td>${ruDate(x.date, {day: 'numeric', month: 'short'})}</td><td>${x.sets.map(s => `${fmt(s.w)}×${s.r}`).join(', ')}</td><td style="text-align:right">${fmt(x.w)} × ${x.r}</td></tr>`).join('')}
    </tbody></table></section>
    <p class="hint">«Максимум на 1 раз» — оценка по формуле Эпли из лучшего подхода, проверять его не нужно.</p>`;
}
function mountChart() {
  const box = $('#chart'); if (!box) return;
  const h = exHistory(S.prog); if (!h.length) return;
  const W = 340, H = 190, L = 34, R = 44, T = 14, B = 26, xs = h.map(x => x.date), ys = h.map(x => x.w);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = Math.max(1, (y1 - y0) * .25); y0 = Math.max(0, y0 - pad); y1 = y1 + pad;
  const stepY = niceStep((y1 - y0) / 3); y0 = Math.floor(y0 / stepY) * stepY; y1 = Math.ceil(y1 / stepY) * stepY;
  const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 864e5 : xs[xs.length - 1];
  const sx = t => L + (t - x0) / (x1 - x0) * (W - L - R), sy = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  let g = '';
  for (let v = y0; v <= y1 + 1e-9; v += stepY) g += `<line class="grid" x1="${L}" x2="${W - R + 8}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ax" x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  [h[0], h[Math.floor(h.length / 2)], h[h.length - 1]].filter((x, i, a) => a.indexOf(x) === i).forEach(x => { g += `<text class="ax" x="${sx(x.date)}" y="${H - 6}" text-anchor="middle">${ruDate(x.date, {day: 'numeric', month: 'short'}).replace('.', '')}</text>`; });
  const pts = h.map(x => [sx(x.date), sy(x.w)]), line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${sy(y0)} L${pts[0][0].toFixed(1)} ${sy(y0)} Z`, last = pts[pts.length - 1];
  box.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Рабочий вес: ${h.map(x => fmt(x.w)).join(', ')} кг">${g}<path class="ar" d="${area}"/><path class="ln" d="${line}"/>
    ${pts.map((p, i) => `<circle class="pt ${i === pts.length - 1 ? 'end' : ''}" cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 5.5 : 4}"/>`).join('')}
    <text class="lbl" x="${last[0] + 9}" y="${last[1] + 4}">${fmt(h[h.length - 1].w)}</text><line class="cross" id="cross" y1="${T}" y2="${H - B}" visibility="hidden"/></svg><div class="tip" id="tip" hidden></div>`;
  const svg = $('svg', box), tip = $('#tip'), cross = $('#cross');
  const move = e => {
    const r = svg.getBoundingClientRect(), k = r.width / W, px = (e.clientX - r.left) / k;
    let bi = 0; pts.forEach((p, i) => { if (Math.abs(p[0] - px) < Math.abs(pts[bi][0] - px)) bi = i; });
    const p = pts[bi], x = h[bi], card = box.closest('.chart-card').getBoundingClientRect();
    cross.setAttribute('x1', p[0]); cross.setAttribute('x2', p[0]); cross.setAttribute('visibility', 'visible');
    tip.hidden = false; tip.innerHTML = `<b>${fmt(x.w)} кг × ${x.r}</b> · ${ruDate(x.date, {day: 'numeric', month: 'short'})}`;
    tip.style.left = Math.min(Math.max(r.left - card.left + p[0] * k, 84), card.width - 84) + 'px';
    tip.style.top = (r.top - card.top + p[1] * k) + 'px';
  };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }


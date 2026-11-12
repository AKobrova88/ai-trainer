'use strict';
/* ---------- program ---------- */
/* Navigation and editing permission are temporary: a reload always opens the library in view mode. */
let programViewId = null, programEditing = false;
function programIsOpen() { return S.tab === 'program' && !!programViewId && programViewId === S.program.id; }
function programEditable() { return programIsOpen() && programEditing; }
function resetProgramScreen() {
  if (drag) { drag.ghost.remove(); drag.el.classList.remove('placeholder'); drag = null; }
  const toastRoot = $('#toast-root');
  if (toastRoot?.querySelector?.('[data-act="undo"]')) toastRoot.innerHTML = '';
  programViewId = null; programEditing = false; S.renaming = null; undoSnap = null;
}
function setProgramScreen(id, editing = false) {
  programViewId = id; programEditing = editing; S.renaming = null; S.open = {};
  if (editing && S.program.days[0]) S.open[S.program.days[0].id] = true;
}
function editProgram() {
  if (!programIsOpen()) return;
  programEditing = true;
  if (!S.program.days.some(d => S.open[d.id] === true) && S.program.days[0]) S.open[S.program.days[0].id] = true;
  closeSheet(); render();
}
function programSummary(p) {
  const n = p.days.reduce((a, d) => a + d.items.length, 0);
  return `${p.days.length} ${plural(p.days.length, 'день', 'дня', 'дней')} · ${n} ${plural(n, 'упражнение', 'упражнения', 'упражнений')}`;
}
function viewProgram() {
  const library = libraryPrograms();
  if (!programIsOpen() || !library.some(p => p.id === programViewId)) {
    resetProgramScreen();
    if (!library.length) return ['Программы', `<section class="empty-card"><h2>Твои программы</h2><p class="hint" style="margin:0">Добавь свою по фото или тексту, создай вручную или подбери с тренером.</p><button class="btn primary" data-act="program-add">${I.plus}Добавить программу</button></section>`];
    return ['Программы', `<p class="hint program-count">Мои программы · ${library.length} из 5</p>
      <div class="program-list" aria-label="Мои программы">${library.map(p => `<button class="card program-card" data-act="program-open" data-v="${esc(p.id)}"><span class="program-card-symbol">${p.by === 'wish' ? I.spark : I.program}</span><span class="grow"><b class="program-card-title">${esc(p.title)}</b><span class="program-card-meta">${programSummary(p)}</span></span><span class="program-card-arrow">${CHEV}</span></button>`).join('')}</div>
      <button class="btn primary program-add" data-act="program-add" ${library.length >= 5 ? 'disabled' : ''}>${I.plus}Добавить программу</button>
      ${library.length >= 5 ? '<p class="hint program-count">Можно хранить до пяти программ. Управление каждой — внутри, в режиме редактирования.</p>' : ''}`];
  }
  const P = S.program, editing = programEditable();
  const more = editing ? `<button class="icon-btn" data-act="program-menu" aria-label="Настройки программы">${DOTS}</button>` : '';
  return [P.title, `<div class="program-nav"><button class="program-back" data-act="program-back">${I.back}<span>Все программы</span></button><button class="btn sm ${editing ? 'primary' : ''}" data-act="${editing ? 'program-done' : 'program-edit'}">${editing ? 'Готово' : 'Редактировать'}</button></div>
    <p class="hint program-count">${P.by === 'wish' ? 'Рекомендована ИИ' : P.by === 'manual' ? 'Создана вручную' : 'Своя программа'} · ${programSummary(P)}</p>
    ${editing ? '<p class="program-edit-note">Редактирование: нажми на упражнение, чтобы изменить нагрузку. Для перестановки используй маркеры слева.</p>' : ''}
    ${P.coachNotes && P.coachNotes.length ? `<details class="card pad"><summary>Заметки из программы</summary>${P.coachNotes.map(note => `<p class="hint">${esc(note)}</p>`).join('')}</details>` : ''}
    ${P.days.length ? `<div class="days ${editing ? 'is-editing' : 'is-reading'}" id="days">${P.days.map((d, index) => dayCard(d, index, editing)).join('')}</div>` : '<section class="empty-card"><h2>Дни пока не добавлены</h2><p class="hint">В режиме редактирования можно создать первый день и добавить упражнения.</p></section>'}
    ${editing ? `<button class="btn" data-act="day-add">${I.plus}Добавить день</button>` : ''}`,more];
}
function programMenu() {
  if (!programEditable()) return;
  sheet('Настройки программы',`<div class="menu">
    ${S.program.id ? mi('program-rename',S.program.id,I.edit,'Переименовать программу') : ''}
    ${mi('day-add','',I.plus,'Добавить день вручную')}
    ${S.program.days.length ? mi('program-organize','',I.sliders,'Изменить распределение по дням') : ''}
    ${S.program.id ? mi('program-delete',S.program.id,I.trash,'Удалить программу','class="danger"') : ''}
  </div>`);
}
function programAddSheet() {
  if (libraryPrograms().length >= 5) return toast('У тебя уже пять программ. Открой ненужную: «Редактировать» → ⋯ → «Удалить программу»');
  sheet('Добавить программу', `<div class="menu">${mi('wish','',I.spark,'Рекомендованная ИИ')}${mi('program-import','',I.photo,'Загрузить по фото или тексту')}${mi('program-manual','',I.plus,'Создать вручную')}</div><p class="hint">Текущая программа останется в библиотеке.</p>`);
}
function selectProgram(id) {
  const p = programById(id); if (!p) return;
  resetProgramScreen(); S.program = p; S.next = p.next || p.days[0]?.id || null; setProgramScreen(id);
  render(); window.scrollTo({top:0});
}
function renameProgramSheet(id) {
  const p = programById(id); if (!p) return;
  sheet('Название программы', `<div class="field"><label for="program-title">Как назвать?</label><input class="input" id="program-title" maxlength="80" value="${esc(p.title)}"></div>`, `<button class="btn" data-act="close">Отмена</button><button class="btn primary" data-act="program-rename-save" data-v="${esc(id)}">Сохранить</button>`);
}
function deleteProgram(id) {
  const p = programById(id); if (!p) return;
  if (S.workout?.programId === id) return toast('Сначала заверши тренировку из этой программы');
  sheet('Удалить программу?', `<p>«${esc(p.title)}» исчезнет из списка. Выполненные тренировки останутся в дневнике.</p>`, `<button class="btn" data-act="close">Отмена</button><button class="btn danger" data-act="program-delete-confirm" data-v="${esc(id)}">Удалить программу</button>`);
}
function dayCard(d, index = 0, editable = programEditable()) {
  const closed = S.open[d.id] !== true, renaming = editable && S.renaming === d.id;
  const prefix = d.title.match(/^День\s*(\d+)(?:\s*[·.:\-–—]\s*|\s+|$)/i);
  const name = (prefix ? d.title.slice(prefix[0].length) : d.title).trim();
  const dayLabel = `День ${prefix ? prefix[1] : index + 1}`;
  const title = renaming ? `<input class="title-input" id="rename" data-day="${esc(d.id)}" value="${esc(d.title)}" maxlength="50" aria-label="название дня">`
    : `<button class="day-t" data-act="day-toggle" data-v="${esc(d.id)}" aria-expanded="${!closed}" aria-controls="program-day-${esc(d.id)}"><span class="day-heading">${name ? `<span class="day-number">${esc(dayLabel)}</span>` : ''}<b>${esc(name || dayLabel)}</b><span class="day-count">${d.items.length} ${plural(d.items.length, 'упражнение', 'упражнения', 'упражнений')}</span></span><span class="day-chevron" aria-hidden="true">${CHEV}</span></button>`;
  const labs = blockLabels(d.items);
  const items = d.items.map((it, i) => { const g = it.ss, first = g && (!d.items[i - 1] || d.items[i - 1].ss !== g), last = g && (!d.items[i + 1] || d.items[i + 1].ss !== g); return `
    ${first ? `<div class="ss-h">Суперсет ${labs[i]}–${labs[groupOf(d.items, i).slice(-1)[0]]} · по очереди, отдых после круга</div>` : ''}
    <div class="ex ${g ? 'ss' : ''} ${first ? 'ss-first' : ''} ${last ? 'ss-last' : ''}" data-item="${esc(it.id)}" role="listitem">
      ${editable ? `<span class="grip" data-drag="item" aria-label="перетащить">${GRIP}</span>` : `<span class="ex-number" aria-hidden="true">${labs[i]}</span>`}
      <${editable ? 'button' : 'div'} class="ex-m" ${editable ? `data-act="ex-dose" data-v="${esc(d.id)}:${esc(it.id)}"` : ''}><b>${editable && g ? `<span class="ssl">${labs[i]}</span>` : ''}${esc(it.name)}</b><span class="dz">${editable ? '<u>' : ''}${dose(it)}${it.w ? ' · ' + fmt(it.w) + ' кг' : ''}${editable ? '</u>' : ''}</span>${it.coachNotes && it.coachNotes.length ? `<span class="ex-coach-note">Заметка тренера: ${it.coachNotes.map(esc).join(' · ')}</span>` : ''}</${editable ? 'button' : 'div'}>
      ${editable ? `<button class="icon-btn" data-act="ex-menu" data-v="${esc(d.id)}:${esc(it.id)}" aria-label="Действия с упражнением ${esc(it.name)}">${DOTS}</button>` : ''}
    </div>`; }).join('');
  return `<section class="day ${closed ? 'closed' : ''} ${S.flash === d.id ? 'flash' : ''}" data-day="${esc(d.id)}">
    <div class="day-h">${editable ? `<span class="grip" data-drag="day" aria-label="перетащить день">${GRIP}</span>` : ''}${title}${editable ? `<button class="icon-btn" data-act="day-menu" data-v="${esc(d.id)}" aria-label="Действия: ${esc(dayLabel)}">${DOTS}</button>` : ''}</div>
    <div class="day-content" id="program-day-${esc(d.id)}"><div class="ex-list" role="list" aria-label="${esc(dayLabel)}: упражнения">${items || `<div class="hint" style="padding:12px 14px">${editable ? 'Добавь упражнения в этот день.' : 'Пока нет упражнений.'}</div>`}</div>
    ${editable ? `<div class="day-f"><button class="btn sm" data-act="cat" data-v="${esc(d.id)}">${I.plus}Упражнение</button></div>` : ''}</div>
  </section>`;
}
let undoSnap = null;
function snap() { libraryPrograms(); undoSnap = JSON.stringify({program: S.program, next: S.next}); }
function undo() { if (!undoSnap) return; const u = JSON.parse(undoSnap); S.program = u.program; S.next = u.next; undoSnap = null; render(); toast('Вернула как было'); }
function findItem(dayId, itemId) { const d = dayById(dayId); const i = d ? d.items.findIndex(x => x.id === itemId) : -1; return [d, i, d && d.items[i]]; }
const mi = (act, v, icon, label, extra = '') => `<button data-act="${act}" data-v="${v}" ${extra}>${icon}<span>${label}</span></button>`;
function dayMenu(id) {
  const d = dayById(id), i = S.program.days.indexOf(d), n = S.program.days.length;
  sheet(d.title, `<div class="menu">
    ${mi('day-rename', id, I.edit, 'Переименовать')}
    ${mi('day-move', id + ':-1', I.up, 'Поставить раньше', i === 0 ? 'disabled' : '')}
    ${mi('day-move', id + ':1', I.down, 'Поставить позже', i === n - 1 ? 'disabled' : '')}
    ${mi('day-next', id, I.play, 'Сделать следующей тренировкой', S.next === id ? 'disabled' : '')}
    ${mi('day-dup', id, I.copy, 'Дублировать')}
    ${mi('day-del', id, I.trash, 'Удалить день', 'class="danger"')}</div>`);
}
function exMenu(dayId, itemId) {
  const [d, i, it] = findItem(dayId, itemId), others = S.program.days.filter(x => x.id !== dayId);
  const nx = d.items[i + 1], G = groupOf(d.items, i), canJoin = nx && (!it.ss || it.ss !== nx.ss) && G.length + groupOf(d.items, i + 1).length <= SS_MAX;
  sheet(it.name, `${it.base && CAT[it.base] && CAT[it.base].cue ? `<p class="hint" style="margin:0">${esc(CAT[it.base].cue)}</p>` : ''}<div class="menu">
    ${mi('ex-dose', dayId + ':' + itemId, I.sliders, 'Подходы, повторы, вес, отдых')}
    ${mi('ex-move', dayId + ':' + itemId + ':-1', I.up, 'Выше в этом дне', G[0]===0 ? 'disabled' : '')}
    ${mi('ex-move', dayId + ':' + itemId + ':1', I.down, 'Ниже в этом дне', G[G.length-1]===d.items.length-1 ? 'disabled' : '')}
    ${canJoin ? mi('ss-join', dayId + ':' + itemId, I.copy, `В суперсет со следующим: «${esc(nx.name.length > 26 ? nx.name.slice(0, 25) + '…' : nx.name)}»`) : ''}
    ${it.ss ? mi('ss-split', dayId + ':' + itemId, I.swap, 'Убрать из суперсета') : ''}
    ${mi('ex-swap', dayId + ':' + itemId, I.swap, 'Заменить упражнение')}
    ${mi('ex-del', dayId + ':' + itemId, I.trash, 'Убрать из дня', 'class="danger"')}</div>
    ${others.length ? `<div class="eyebrow">Перенести в другой день</div><div class="menu">${others.map(o => `<button data-act="ex-moveto" data-v="${dayId}:${itemId}:${o.id}">${I.arrow}<span>${esc(o.title)}</span><small>${o.items.length}</small></button>`).join('')}</div>` : ''}`);
}
function doseSheet(dayId, itemId) {
  const [, , it] = findItem(dayId, itemId), st = stepOf(it) || 1;
  const stepper = (k, v, lab) => `<div class="field"><label for="dz-${k}">${lab}</label><input class="input" id="dz-${k}" inputmode="${k==='w'?'decimal':'numeric'}" value="${k === 'w' ? fmt(v) : v}"></div>`;
  sheet(it.name, `
    <div class="grid2">${stepper('s', it.s, 'Подходы', 1)}${stepper('w', it.w, stepOf(it) ? 'Вес, кг' : 'Доп. вес, кг', st)}</div>
    <div class="grid2">${stepper('lo', it.lo, it.sec ? 'Секунд от' : 'Повторов от', 1)}${stepper('hi', it.hi, 'до', 1)}</div>
    <div class="field"><label>Отдых между подходами</label><div class="seg" id="dz-rest">${[45, 60, 90, 120, 180].map(r => `<button data-act="dz-rest" data-v="${r}" aria-pressed="${it.rest === r}">${r < 120 ? r + ' с' : r / 60 + ' мин'}</button>`).join('')}</div></div>
    <p class="hint">Когда во всех подходах получится верх диапазона, тренер предложит прибавить ${st ? fmt(st) + ' кг' : 'нагрузку'}.</p>`,
    `<button class="btn" data-act="close">Отмена</button><button class="btn primary" data-act="dz-save" data-v="${dayId}:${itemId}">Сохранить</button>`);
  $('#sheets').dataset.rest = it.rest;
}

/* catalogue: add to a day, replace in the program, add/replace for today, pick for the camera */
function catSheet(mode, dayId, swapId) {
  S.cat = {mode, dayId, swapId, g: S.cat?.g || 'legs', q: '', added: 0};
  const d = dayId && dayById(dayId);
  const title = mode === 'swap' ? 'Заменить на…' : mode === 'wo-add' ? 'Добавить на сегодня' : mode === 'wo-swap' ? 'Заменить на сегодня' : mode === 'cam' ? 'Упражнение для камеры' : `Добавить в «${d.title}»`;
  const alts = (mode === 'swap' || mode === 'wo-swap') ? alternativesFor(mode === 'swap' ? findItem(dayId, swapId)[2] : S.workout.items[+swapId], 4) : [];
  sheet(title, `
    ${alts.length ? `<div class="eyebrow">Похожие — то же движение или та же группа</div><div class="menu">${alts.map(c => `<button class="cat-item" data-act="cat-add" data-v="${c.k}"><b>${esc(c.n)}</b>${c.cam ? '<span class="badge cam">камера</span>' : ''}<span class="plus">＋</span></button>`).join('')}</div><div class="eyebrow">Или найди в справочнике</div>` : ''}
    <input class="input" id="cat-q" placeholder="Поиск: «разводка», «становая»…" autocomplete="off">
    <div class="chips" id="cat-g">${Object.entries(GROUPS).map(([g, n]) => `<button class="chip" data-act="cat-g" data-v="${g}" aria-pressed="${S.cat.g === g}">${n}</button>`).join('')}</div>
    <div class="menu" id="cat-list"></div>`,
    `<button class="btn primary" data-act="close" id="cat-done">Готово</button>`, 'full');
  catList();
  $('#cat-q').addEventListener('input', e => { S.cat.q = e.target.value; catList(); });
}
function catList() {
  const q = norm(S.cat.q.trim());
  let list = Object.values(CAT);
  if (S.cat.mode === 'cam') list = list.filter(c => c.cam || c.inc !== 'time');
  list = q ? list.filter(c => norm(c.n).includes(q) || q.split(' ').every(w => norm(c.n).includes(w)) || (SYN[c.k] || []).some(s => norm(s).includes(q))) : list.filter(c => c.g === S.cat.g);
  list.sort((a, b) => (b.cam - a.cam) || a.n.localeCompare(b.n, 'ru'));
  $('#cat-g').style.display = q ? 'none' : '';
  let html = list.slice(0, 60).map(c => `<button class="cat-item" data-act="cat-add" data-v="${c.k}"><b>${esc(c.n)}</b>${c.cam ? '<span class="badge cam">техника</span>' : S.cat.mode === 'cam' ? '<span class="badge">счёт повторов</span>' : ''}<span class="plus">＋</span></button>`).join('');
  if (q && S.cat.mode !== 'cam') html += `<button class="cat-item" data-act="cat-own"><b>Своё: «${esc(S.cat.q.trim())}»</b><span class="badge new">своё</span><span class="plus">＋</span></button>`;
  $('#cat-list').innerHTML = html || '<div class="empty">Ничего не нашлось</div>';
}
function catAdd(key, own, btn) {
  const C = S.cat, c = CAT[key];
  const it = own ? ex(C.q.trim().slice(0, 60), null, 3, 8, 12, 0, guessInc(C.q, null, false, false)) : ex(null, key, 3, c.inc === 'time' ? 30 : 8, c.inc === 'time' ? 45 : 12, startWeight(key, S.profile));
  if (C.mode === 'cam') { S.camEx = {name: it.name, base: it.base, w: it.w, inc: it.inc, sec: it.sec}; closeSheet(); render(); return; }
  if (C.mode === 'wo-add' || C.mode === 'wo-swap') {
    const W = S.workout, sg = suggest(it), wi = {...it, hint: sg.text, up: !!sg.up, sets: Array.from({length: it.s}, () => ({w: sg.w, r: it.lo, done: false}))};
    if (C.mode === 'wo-swap') {
      const i = +C.swapId, old = W.items[i], doneSets = old.sets.filter(s => s.done);
      Object.assign(wi, {s: old.s, lo: old.lo, hi: old.hi, rest: old.rest});
      wi.sets = Array.from({length: Math.max(1, old.sets.length - doneSets.length)}, () => ({w: sg.w, r: old.lo, done: false}));
      if (old.ss) wi.ss = old.ss;
      if (doneSets.length) { old.sets = doneSets; W.items.splice(i + 1, 0, wi); W.active = i + 1; } else { W.items.splice(i, 1, wi); W.active = i; }
      closeSheet(); render(); toast(doneSets.length ? `Сделанные подходы остались за «${old.name}», дальше — «${wi.name}»` : `На сегодня — «${wi.name}»`); return;
    }
    W.items.push(wi); W.active = W.items.length - 1; closeSheet(); render(); toast(`«${wi.name}» добавлено на сегодня`); return;
  }
  if (!programEditable()) return;
  const d = dayById(C.dayId);
  snap();
  if (C.swapId) {
    const i = d.items.findIndex(x => x.id === C.swapId), old = d.items[i];
    Object.assign(it, {s: old.s, lo: old.lo, hi: old.hi, rest: old.rest}); if (old.ss) it.ss = old.ss;
    d.items.splice(i, 1, it); closeSheet(); render(); toast(`Заменила на «${it.name}»`, true); return;
  }
  d.items.push(it); C.added++;
  if (btn) { btn.classList.add('added'); btn.querySelector('.plus').textContent = '✓'; }
  $('#cat-done').textContent = `Готово · добавлено ${C.added}`;
  render(); toast(`«${it.name}» → ${d.title}`, true);
}

/* drag & drop: days and exercises (also between days) */
let drag = null;
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-drag]');
  if (!h || e.button > 0 || !programEditable()) return;
  e.preventDefault();
  const kind = h.dataset.drag;
  if (kind === 'day') $$('#days .day').forEach(x => x.classList.add('compact'));
  const el = h.closest(kind === 'day' ? '.day' : '.ex'), r = el.getBoundingClientRect(), ghost = el.cloneNode(true);
  ghost.classList.add('drag-ghost'); ghost.classList.remove('flash');
  Object.assign(ghost.style, {width: r.width + 'px', left: r.left + 'px', top: r.top + 'px'});
  document.body.appendChild(ghost); el.classList.add('placeholder');
  drag = {kind, el, ghost, dx:e.clientX-r.left,dy: e.clientY - r.top, x:e.clientX,y:e.clientY, startX:e.clientX,startY:e.clientY,programId:S.program.id, from: el.closest('.day').dataset.day, moved: false};
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!programEditable() || drag.programId !== S.program.id) return cancelDrag();
  if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 8) return;
  e.preventDefault(); if (!drag.moved) { snap(); requestAnimationFrame(autoScroll); } drag.x=e.clientX;drag.y=e.clientY;drag.moved=true;dragTo();
}, {passive: false});
function dragTo() {
  const {ghost, kind, el} = drag;
  ghost.style.top = (drag.y - drag.dy) + 'px';
  ghost.style.left = (drag.x - drag.dx) + 'px';
  $$('.day.drop').forEach(x => x.classList.remove('drop'));
  if (kind === 'day') {
    const list = $('#days'), cards = $$('#days .day').filter(c => c !== el);
    const before = cards.find(c => { const r = c.getBoundingClientRect(); return drag.y < r.top || drag.y < r.bottom && drag.x < r.left + r.width / 2; }) || null;
    if (el.nextSibling !== before) list.insertBefore(el, before);
    return;
  }
  const under = document.elementFromPoint(drag.x, drag.y), dayEl = under && under.closest('.day');
  if (!dayEl) return;
  const list = $('.ex-list', dayEl);
  if (dayEl.classList.contains('closed')) { dayEl.classList.add('drop'); if (el.parentNode !== list) list.appendChild(el); return; }
  const rows = $$('.ex', list).filter(c => c !== el);
  const before = rows.find(c => { const r = c.getBoundingClientRect(); return drag.y < r.top + r.height / 2; }) || null;
  if (el.parentNode !== list || el.nextSibling !== before) list.insertBefore(el, before);
  $$('.hint', list).forEach(x => x.remove());
}
function autoScroll() {
  if (!drag || !drag.moved) return;
  const edge = 90, vh = innerHeight;
  if (drag.y < edge) { scrollBy(0, -Math.ceil((edge - drag.y) / 6)); dragTo(); }
  else if (drag.y > vh - edge - 64) { scrollBy(0, Math.ceil((drag.y - (vh - edge - 64)) / 6)); dragTo(); }
  requestAnimationFrame(autoScroll);
}
function endDrag() {
  if (!drag) return;
  if (!programEditable() || drag.programId !== S.program.id) return cancelDrag();
  const {kind, el, ghost, from} = drag;
  ghost.remove(); el.classList.remove('placeholder');
  const moved = drag.moved; drag = null;
  if (!moved) { render(); return; }
  if (kind === 'day') {
    const order = $$('#days .day').map(x => x.dataset.day), before = S.program.days.map(d => d.id).join();
    S.program.days.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    renumber(); render();
    if (before !== order.join()) toast('Порядок дней изменён', true);
    return;
  }
  const byId = {};
  S.program.days.forEach(d => d.items.forEach(it => { byId[it.id] = it; }));
  $$('#days .day').forEach(dEl => { const d = dayById(dEl.dataset.day); d.items = $$('.ex', dEl).map(x => byId[x.dataset.item]).filter(Boolean); });
  const to = el.closest('.day').dataset.day;
  render();
  if (to !== from) toast(`Перенесла в «${dayById(to).title}»`, true);
}
document.addEventListener('pointerup', endDrag);
function cancelDrag() {
  if(!drag)return;
  drag.ghost.remove();drag.el.classList.remove('placeholder');drag=null;render();
}
document.addEventListener('pointercancel', cancelDrag);
window.addEventListener?.('blur',cancelDrag);
/* «День 2 · Спина» keeps its number in sync with its place */
function renumber() { S.program.days.forEach((d, i) => { if (/^День \d+( · |$)/.test(d.title)) d.title = d.title.replace(/^День \d+/, `День ${i + 1}`); }); }


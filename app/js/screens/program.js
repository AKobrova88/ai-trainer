'use strict';
/* ---------- program ---------- */
function viewProgram() {
  const P = S.program, n = P.days.reduce((a, d) => a + d.items.length, 0);
  if (!P.days.length) return ['Программа', `
    <section class="empty-card"><h2>Пусто</h2><p class="hint" style="margin:0">Подбери программу по пожеланиям, загрузи свою или собери из справочника.</p>
      <div class="row" style="flex-wrap:wrap"><button class="btn primary" data-act="wish">${I.spark}Подобрать</button><button class="btn" data-act="import">${I.photo}По фото или тексту</button></div>
      <button class="btn ghost" data-act="day-add">${I.plus}Собрать самой</button></section>`];
  return ['Программа', `
    <div class="toolbar"><button class="btn" data-act="import">${I.photo}По фото</button><button class="btn" data-act="wish">${I.spark}Подобрать</button><button class="btn" data-act="day-add">${I.plus}День</button></div>
    <button class="btn" data-act="program-organize">${I.sliders}Исправить распределение по дням</button>
    ${P.coachNotes && P.coachNotes.length ? `<details class="card pad"><summary>Заметки из программы</summary>${P.coachNotes.map(note => `<p class="hint">${esc(note)}</p>`).join('')}</details>` : ''}
    <p class="hint" style="margin:0">${P.days.length} ${plural(P.days.length, 'день', 'дня', 'дней')} · ${n} ${plural(n, 'упражнение', 'упражнения', 'упражнений')}. Держи за <span style="display:inline-flex;width:14px;vertical-align:-2px">${GRIP}</span> и перетаскивай — дни и упражнения меняются местами, упражнение можно перенести в другой день.</p>
    <div class="days" id="days">${P.days.map(dayCard).join('')}</div>`];
}
function dayCard(d) {
  const closed = S.open[d.id] === false, editing = S.renaming === d.id;
  const title = editing ? `<input class="title-input" id="rename" data-day="${d.id}" value="${esc(d.title)}" maxlength="50" aria-label="название дня">`
    : `<button class="day-t" data-act="day-toggle" data-v="${d.id}" aria-expanded="${!closed}"><b>${esc(d.title)}</b><span>${d.items.length} ${plural(d.items.length, 'упражнение', 'упражнения', 'упражнений')}${d.id === S.next ? ' · <span class="badge next">следующая</span>' : ''}</span></button>`;
  const labs = blockLabels(d.items);
  const items = d.items.map((it, i) => { const g = it.ss, first = g && (!d.items[i - 1] || d.items[i - 1].ss !== g), last = g && (!d.items[i + 1] || d.items[i + 1].ss !== g); return `
    ${first ? `<div class="ss-h">Суперсет ${labs[i]}–${labs[groupOf(d.items, i).slice(-1)[0]]} · по очереди, отдых после круга</div>` : ''}
    <div class="ex ${g ? 'ss' : ''} ${first ? 'ss-first' : ''} ${last ? 'ss-last' : ''}" data-item="${it.id}">
      <span class="grip" data-drag="item" aria-label="перетащить">${GRIP}</span>
      <button class="ex-m" data-act="ex-dose" data-v="${d.id}:${it.id}"><b>${g ? `<span class="ssl">${labs[i]}</span>` : ''}${esc(it.name)}</b><span class="dz"><u>${dose(it)}${it.w ? ' · ' + fmt(it.w) + ' кг' : ''}</u>${it.cam ? '<span class="badge cam">камера</span>' : ''}</span>${it.coachNotes && it.coachNotes.length ? `<span class="ex-coach-note">Заметка тренера: ${it.coachNotes.map(esc).join(' · ')}</span>` : ''}</button>
      <button class="icon-btn" data-act="ex-menu" data-v="${d.id}:${it.id}" aria-label="действия">${DOTS}</button>
    </div>`; }).join('');
  return `<section class="day ${closed ? 'closed' : ''} ${S.flash === d.id ? 'flash' : ''}" data-day="${d.id}">
    <div class="day-h"><span class="grip" data-drag="day" aria-label="перетащить день">${GRIP}</span>${title}<button class="icon-btn" data-act="day-menu" data-v="${d.id}" aria-label="действия с днём">${DOTS}</button></div>
    <div class="ex-list">${items || '<div class="hint" style="padding:12px 14px">Пусто — добавь упражнения или перетащи сюда</div>'}</div>
    <div class="day-f"><button class="btn sm" data-act="cat" data-v="${d.id}">${I.plus}Упражнение</button></div>
  </section>`;
}
let undoSnap = null;
function snap() { undoSnap = JSON.stringify({program: S.program, next: S.next}); }
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
    ${canJoin ? mi('ss-join', dayId + ':' + itemId, I.copy, `В суперсет со следующим: «${esc(nx.name.length > 26 ? nx.name.slice(0, 25) + '…' : nx.name)}»`) : ''}
    ${it.ss ? mi('ss-split', dayId + ':' + itemId, I.swap, 'Убрать из суперсета') : ''}
    ${mi('ex-swap', dayId + ':' + itemId, I.swap, 'Заменить упражнение')}
    ${mi('ex-del', dayId + ':' + itemId, I.trash, 'Убрать из дня', 'class="danger"')}</div>
    ${others.length ? `<div class="eyebrow">Перенести в другой день</div><div class="menu">${others.map(o => `<button data-act="ex-moveto" data-v="${dayId}:${itemId}:${o.id}">${I.arrow}<span>${esc(o.title)}</span><small>${o.items.length}</small></button>`).join('')}</div>` : ''}`);
}
function doseSheet(dayId, itemId) {
  const [, , it] = findItem(dayId, itemId), st = stepOf(it) || 1;
  const stepper = (k, v, lab, s) => `<div class="field"><label for="dz-${k}">${lab}</label><div class="step" style="height:50px;grid-template-columns:46px 1fr 46px"><button data-act="dz-adj" data-v="${k}:-${s}" aria-label="меньше">−</button><input id="dz-${k}" inputmode="decimal" value="${k === 'w' ? fmt(v) : v}"><button data-act="dz-adj" data-v="${k}:${s}" aria-label="больше">+</button></div></div>`;
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
  if (S.cat.mode === 'cam') list = list.filter(c => c.cam);
  list = q ? list.filter(c => norm(c.n).includes(q) || q.split(' ').every(w => norm(c.n).includes(w)) || (SYN[c.k] || []).some(s => norm(s).includes(q))) : list.filter(c => c.g === S.cat.g);
  list.sort((a, b) => (b.cam - a.cam) || a.n.localeCompare(b.n, 'ru'));
  $('#cat-g').style.display = q ? 'none' : '';
  let html = list.slice(0, 60).map(c => `<button class="cat-item" data-act="cat-add" data-v="${c.k}"><b>${esc(c.n)}</b>${c.cam ? '<span class="badge cam">камера</span>' : ''}<span class="plus">＋</span></button>`).join('');
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
  if (!h || e.button > 0) return;
  e.preventDefault();
  const kind = h.dataset.drag;
  if (kind === 'day') $$('#days .day').forEach(x => x.classList.add('compact'));
  const el = h.closest(kind === 'day' ? '.day' : '.ex'), r = el.getBoundingClientRect(), ghost = el.cloneNode(true);
  ghost.classList.add('drag-ghost'); ghost.classList.remove('flash');
  Object.assign(ghost.style, {width: r.width + 'px', left: r.left + 'px', top: r.top + 'px'});
  document.body.appendChild(ghost); el.classList.add('placeholder');
  drag = {kind, el, ghost, dy: e.clientY - r.top, x: r.left + r.width / 2, y: e.clientY, from: el.closest('.day').dataset.day, moved: false};
  snap(); requestAnimationFrame(autoScroll);
});
document.addEventListener('pointermove', e => { if (!drag) return; e.preventDefault(); drag.y = e.clientY; drag.moved = true; dragTo(); }, {passive: false});
function dragTo() {
  const {ghost, kind, el} = drag;
  ghost.style.top = (drag.y - drag.dy) + 'px';
  $$('.day.drop').forEach(x => x.classList.remove('drop'));
  if (kind === 'day') {
    const list = $('#days'), cards = $$('#days .day').filter(c => c !== el);
    const before = cards.find(c => { const r = c.getBoundingClientRect(); return drag.y < r.top + r.height / 2; }) || null;
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
  if (!drag) return;
  const edge = 90, vh = innerHeight;
  if (drag.y < edge) { scrollBy(0, -Math.ceil((edge - drag.y) / 6)); dragTo(); }
  else if (drag.y > vh - edge - 64) { scrollBy(0, Math.ceil((drag.y - (vh - edge - 64)) / 6)); dragTo(); }
  requestAnimationFrame(autoScroll);
}
function endDrag() {
  if (!drag) return;
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
document.addEventListener('pointercancel', endDrag);
/* «День 2 · Спина» keeps its number in sync with its place */
function renumber() { S.program.days.forEach((d, i) => { if (/^День \d+( · |$)/.test(d.title)) d.title = d.title.replace(/^День \d+/, `День ${i + 1}`); }); }


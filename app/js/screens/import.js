'use strict';
/* ---------- own program by photo or text ---------- */
let IMP = null;
function newImportSession() {
  return {step: 'pick', photos: [], text: '', mode: 'photo', days: [], notes: [], warnings: [], undo: [], expectedDays: 'auto', countConfirmed: null, dest: 'add', toDay: S.program.days.length ? S.program.days[S.program.days.length - 1].id : null, prog: ''};
}
const importDayCount = () => IMP.days.filter(d => d.items.length).length;
function saveImportDraft() {
  if (!IMP || IMP.step !== 'review') return;
  S.importDraft = JSON.parse(JSON.stringify({v: 1, days: IMP.days, notes: IMP.notes, warnings: IMP.warnings, expectedDays: IMP.expectedDays, countConfirmed: IMP.countConfirmed, dest: IMP.dest, toDay: IMP.toDay, mode: IMP.mode, existing: IMP.existing, sourceCount: IMP.photos.length || IMP.sourceCount || 0}));
  save();
}
function snapImport() {
  IMP.undo.push(JSON.stringify({days: IMP.days, notes: IMP.notes, warnings: IMP.warnings, expectedDays: IMP.expectedDays, countConfirmed: IMP.countConfirmed}));
  if (IMP.undo.length > 20) IMP.undo.shift();
}
/* fewer days found than the person says: cut where one screenshot ends and an unrelated one begins (never inside a found day
   boundary), sizes as even as possible; a cut inside a screenshot only when there are not enough screenshot changes */
function splitImportByPhotos(n) {
  const items = IMP.days.flatMap(d => d.items), N = items.length, k0 = IMP.days.filter(d => d.items.length).length;
  if (IMP.mode !== 'photo' || k0 >= n || N < n) return false;
  const starts = new Set(); let acc = 0; for (const d of IMP.days) { if (d.items.length) starts.add(acc); acc += d.items.length; }
  const ph = it => (it._photos || [])[0];
  const border = i => ph(items[i]) != null && ph(items[i]) !== ph(items[i - 1]) && !(items[i - 1]._photos || []).includes(ph(items[i]));
  const cand = [...Array(N).keys()].filter(i => i > 0 && !starts.has(i) && border(i));
  if (cand.length < n - k0) return false;
  const cost = i => starts.has(i) || border(i) ? 0 : 1e6, avg = N / n, INF = 1e12;
  const best = Array.from({length: n + 1}, () => new Array(N + 1).fill(INF)), from = Array.from({length: n + 1}, () => new Array(N + 1).fill(0));
  best[0][0] = 0;
  for (let k = 1; k <= n; k++) for (let j = k; j <= N; j++) for (let i = k - 1; i < j; i++) {
    if (best[k - 1][i] >= INF || [...starts].some(s => s > i && s < j)) continue;   // a found boundary stays a boundary
    const v = best[k - 1][i] + (j - i - avg) ** 2 + (i > 0 ? cost(i) : 0);
    if (v < best[k][j]) { best[k][j] = v; from[k][j] = i; }
  }
  if (best[n][N] >= 1e6) return false;
  const cuts = []; for (let k = n, j = N; k > 0; k--) { cuts.unshift(from[k][j]); j = from[k][j]; }
  const old = new Map(); acc = 0; for (const d of IMP.days) { if (d.items.length) old.set(acc, d); acc += d.items.length; }
  IMP.days = cuts.map((c, k) => {
    const part = items.slice(c, k + 1 < cuts.length ? cuts[k + 1] : N), was = old.get(c);
    return was ? {...was, items: part} : {id: nid('r'), title: `День ${k + 1}`, items: part, _reason: `Граница по смене скриншотов (фото ${ph(part[0])}) — проверь`};
  });
  IMP.days.forEach((d, index) => { if (/^День \d+( · |$)/.test(d.title)) d.title = d.title.replace(/^День \d+/, `День ${index + 1}`); });
  return true;
}
function setImportDayCount(value) {
  IMP.expectedDays = value;
  IMP.countConfirmed = null;
  if (value !== 'auto') {
    IMP.days = IMP.days.filter(d => d.items.length);
    splitImportByPhotos(+value);
    while (IMP.days.length < +value) IMP.days.push({id: nid('r'), title: `День ${IMP.days.length + 1}`, items: [], _reason: 'День добавлен вручную'});
  }
}
function readyImport() {
  const count = importDayCount();
  return count > 0 && count === IMP.days.length && !IMP.days.some(d => d.items.some(it => it._needsDose)) && (IMP.expectedDays === 'auto' ? IMP.countConfirmed === count : +IMP.expectedDays === count);
}
function reviewImportLines(lines) {
  const report = {notes: [], warnings: []};
  IMP.lines = lines; IMP.days = parseImport(lines, report); IMP.notes = report.notes; IMP.warnings = report.warnings; IMP.undo = []; IMP.countConfirmed = null;
  if (IMP.expectedDays !== 'auto') setImportDayCount(IMP.expectedDays);
  IMP.dest = 'add'; IMP.step = 'review';
}
function splitImportDay(di, ii) {
  if (ii <= 0 || ii >= IMP.days[di].items.length) return false;
  snapImport();
  const source = IMP.days[di], rest = source.items.splice(ii);
  const empty = IMP.days.findIndex(d => d !== source && !d.items.length);
  const day = empty >= 0 ? IMP.days.splice(empty, 1)[0] : {id: nid('r'), title: `День ${di + 2}`};
  Object.assign(day, {items: rest, _reason: 'Начало дня указано вручную'});
  IMP.days.splice(IMP.days.indexOf(source) + 1, 0, day);
  IMP.days.forEach((d, index) => { if (/^День \d+( · |$)/.test(d.title)) d.title = d.title.replace(/^День \d+/, `День ${index + 1}`); });
  return true;
}
function moveImportItem(di, ii, target) {
  const source = IMP.days[di];
  let dest = IMP.days.find(d => d.id === target);
  if (dest === source) return false;
  if (!dest && target !== 'new') return false;
  snapImport();
  if (!dest) { dest = {id: nid('r'), title: `День ${IMP.days.length + 1}`, items: [], _reason: 'День добавлен вручную'}; IMP.days.push(dest); }
  dest.items.push(source.items.splice(ii, 1)[0]);
  return true;
}
function noteImportItem(di, ii) {
  snapImport();
  const day = IMP.days[di], it = day.items.splice(ii, 1)[0], owner = day.items[ii - 1];
  if (owner) { owner.coachNotes = owner.coachNotes || []; owner.coachNotes.push(it.name); }
  IMP.notes.push({id: nid('note'), text: it.name, ownerId: owner ? owner.id : null, dayId: day.id, original: it, index: ii});
}
function restoreImportNote(id) {
  const index = IMP.notes.findIndex(n => n.id === id); if (index < 0) return;
  snapImport();
  const note = IMP.notes.splice(index, 1)[0];
  const owner = IMP.days.flatMap(d => d.items).find(it => it.id === note.ownerId);
  if (owner) owner.coachNotes = (owner.coachNotes || []).filter(n => n !== note.text);
  let day = IMP.days.find(d => d.id === note.dayId) || IMP.days[0];
  if (!day) { day = {id: nid('r'), title: 'День 1', items: []}; IMP.days.push(day); }
  const it = note.original || {...importItem(note.text, null, note.text, 0), _needsDose: true};
  day.items.splice(Math.min(note.index == null ? day.items.length : note.index, day.items.length), 0, it);
}
function organizeProgram() {
  IMP = newImportSession(); IMP.existing = true; IMP.dest = 'replace'; IMP.mode = 'text'; IMP.step = 'review';
  IMP.days = JSON.parse(JSON.stringify(S.program.days)).map(d => ({...d, items: d.items.map(it => ({...it, st: coachNote(it.name) ? 'check' : it.base ? 'ok' : 'new', raw: it.name}))}));
  IMP.expectedDays = 'auto'; IMP.countConfirmed = null;
  sheet('Исправить распределение по дням', '<div id="imp"></div>', '<div id="imp-f" style="display:flex;gap:8px;width:100%"></div>', 'full');
  renderImport();
}
function importSheet() {
  IMP = newImportSession();
  const draft = S.importDraft;
  if (draft && draft.v === 1 && validBackup({app: 'ii-trener', v: 1, program: {days: draft.days}, diary: []})) {
    Object.assign(IMP, JSON.parse(JSON.stringify(draft)), {step: 'review', undo: []});
  }
  sheet('Своя программа', '<div id="imp"></div>', '<div id="imp-f" style="display:flex;gap:8px;width:100%"></div>', 'full');
  renderImport();
}
function demoRecognized() {
  const r = (name, base, st, s, lo, hi, w, inc, raw) => ({...ex(name, base, s, lo, hi, w, inc), st, raw});
  return [{id: nid('r'), title: 'Тренировка 4', items: [
    r('Подтягивания в гравитроне (широкий хват)', 'assisted_pullup', 'ok', 3, 8, 12, 4.5, 'machine', 'Подтягивания в гравитроне (широкий хват)'),
    r('Жим гантелей на наклонной скамье (35°)', 'incline_db', 'ok', 3, 8, 12, 12, 'db', 'Жим гантелей на наклонной скамье (35 градусов)'),
    r('Горизонтальная тяга блока широким хватом', 'cable_row', 'ok', 3, 8, 12, 27.3, 'machine', 'Горизонтальная тяга блока широким хватом'),
    r('Жим сидя в Смите', 'bb_ohp', 'check', 3, 8, 12, 16.3, 'machine', 'Жим сидя (в Смите)'),
    r('Жим сидя в хаммере', null, 'new', 3, 8, 12, 23, 'machine', 'Жим сидя в хаммере'),
    r('Скручивания в тренажере', 'crunch', 'ok', 3, 12, 15, 5, 'machine', 'Скручивания в тренажере')]}];
}
function renderImport() {
  const b = $('#imp'), f = $('#imp-f');
  if (!b || !IMP) return;
  const dayOptions = value => `<option value="auto" ${value === 'auto' ? 'selected' : ''}>Определить автоматически</option>${Array.from({length: 14}, (_, i) => i + 1).map(n => `<option value="${n}" ${+value === n ? 'selected' : ''}>${n} ${plural(n, 'день', 'дня', 'дней')}</option>`).join('')}`;
  if (IMP.step === 'pick') {
    const thumbs = IMP.photos.map((p, i) => `<div class="thumb">${p.url ? `<img src="${p.url}" alt="скриншот ${i + 1}">` : '<div class="fake">' + '<i></i>'.repeat(14) + '</div>'}<span class="n">${i + 1}</span><button class="x" data-act="imp-rm" data-v="${i}" aria-label="Убрать фото ${i + 1}">×</button><div class="photo-order"><button data-act="imp-photo-move" data-v="${i}:-1" aria-label="Фото ${i + 1} раньше" ${i ? '' : 'disabled'}>←</button><button data-act="imp-photo-move" data-v="${i}:1" aria-label="Фото ${i + 1} позже" ${i < IMP.photos.length - 1 ? '' : 'disabled'}>→</button></div></div>`).join('');
    const lft = left('photo');
    b.innerHTML = `
      <div class="seg"><button data-act="imp-mode" data-v="photo" aria-pressed="${IMP.mode === 'photo'}">Скриншоты</button><button data-act="imp-mode" data-v="text" aria-pressed="${IMP.mode === 'text'}">Текстом</button></div>
      <div class="field"><label for="imp-count">Сколько тренировочных дней в программе?</label><select class="input" id="imp-count">${dayOptions(IMP.expectedDays)}</select><span class="hint">Это число разных тренировок, а не количество фотографий. Один день может занимать несколько скриншотов.</span></div>
      ${IMP.mode === 'photo' ? `
      <label class="drop-zone" id="dz">${I.photo}<b>Выбери скриншоты</b><span class="hint">Добавь все фото в порядке упражнений. Границы дней ищу по заголовкам и новому началу нумерации. После распознавания их можно поправить.</span><span class="btn sm primary">Выбрать фото</span><input type="file" accept="image/*" multiple id="imp-file" hidden></label>
      ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ''}
      <p class="hint" style="margin:0">Фото читаются прямо на телефоне и никуда не отправляются. ${access().unlimited ? 'Распознавание фото доступно без лимита.' : allowance().photo ? `Распознавание фото — ИИ-функция: осталось ${lft} из ${allowance().photo}.` : 'Распознавание фото — в подписке; текстом — бесплатно.'}</p>
      <button class="btn ghost" data-act="imp-sample">Показать на примере скриншотов «Тренировка 4»</button>`
      : `<div class="field"><label for="imp-text">Вставь программу — по строке на упражнение</label><textarea class="input" id="imp-text" placeholder="День 3 · Верх&#10;Жим гантелей на наклонной 3×10 12 кг&#10;Тяга верхнего блока 3×12 35 кг&#10;Планка 3×45 сек">${esc(IMP.text)}</textarea></div>
      <p class="hint" style="margin:0">Разбор текста бесплатный и без лимита.</p>`}`;
    f.innerHTML = `<button class="btn" data-act="close">Отмена</button><button class="btn primary" data-act="imp-read" ${(IMP.mode === 'photo' ? IMP.photos.length : IMP.text.trim()) ? '' : 'disabled'}>Распознать</button>`;
    const inp = $('#imp-file'); if (inp) inp.addEventListener('change', () => addPhotos(inp.files));
    $('#imp-count').addEventListener('change', e => { IMP.expectedDays = e.target.value; });
    const dz = $('#dz');
    if (dz) {
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); addPhotos(e.dataTransfer.files); });
    }
    const ta = $('#imp-text'); if (ta) ta.addEventListener('input', () => { IMP.text = ta.value; $('[data-act="imp-read"]').disabled = !IMP.text.trim(); });
    return;
  }
  if (IMP.step === 'read') {
    b.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:36px 0;text-align:center"><div class="spinner"></div><b id="imp-st">${esc(IMP.prog || 'Читаю…')}</b><div class="ocr-row" style="width:100%;max-width:300px"><div class="meter"><i id="imp-bar" style="width:${Math.round((IMP.pct || 0) * 100)}%"></i></div></div><span class="hint">В первый раз загружаю распознавание текста — около 10 МБ, дальше быстрее.</span></div>`;
    f.innerHTML = `<button class="btn" data-act="imp-back">Отмена</button>`;
    return;
  }
  const n = IMP.days.reduce((a, d) => a + d.items.length, 0), nd = IMP.days.length, P = S.program.days;
  const flagged = IMP.days.reduce((a, d) => a + d.items.filter(i => i.st !== 'ok').length, 0);
  const dayOpts = P.map(d => `<option value="${d.id}" ${IMP.toDay === d.id ? 'selected' : ''}>${esc(d.title)}</option>`).join('');
  const destOpt = (k, title, sub) => `<button class="opt" role="radio" aria-checked="${IMP.dest === k}" data-act="imp-dest" data-v="${k}"><span class="rd"></span><span class="grow"><b>${title}</b><span>${sub}</span></span></button>`;
  const sourceInfo = it => (it._warn ? `<div class="mt" style="color:var(--warn)">⚠︎ ${esc(it._warn)} — нажми и поправь</div>` : '') + sourceInfo0(it);
  const sourceInfo0 = it => {
    const photo = IMP.mode === 'photo';
    const source = [it._number ? `№ ${it._number} ${photo ? 'на скриншоте' : 'в исходном тексте'}` : '', photo && it._photos ? 'Фото ' + it._photos.join(', ') : ''].filter(Boolean).join(' · ');
    return `${source ? `<div class="mt">${esc(source)}</div>` : ''}${it.coachNotes && it.coachNotes.length ? `<div class="mt">Заметка: ${it.coachNotes.map(esc).join(' · ')}</div>` : ''}`;
  };
  const rdays = IMP.days.map((d, di) => `
    <section class="rday" data-review-day="${d.id}"><div class="rday-h"><input value="${esc(d.title)}" data-imp-title="${di}" aria-label="Название дня ${di + 1}"><span class="badge">${d.items.length} упр.</span></div>
    <div class="review-day-tools"><span class="hint">${esc(d._reason || 'День из программы')}</span>${di > 0 ? `<button class="btn sm" data-act="imp-merge" data-v="${di}">Объединить с предыдущим</button>` : ''}${!d.items.length ? `<button class="btn sm danger" data-act="imp-day-delete" data-v="${di}">Удалить пустой день</button>` : ''}</div>
    ${d.items.map((it, ii) => `<div class="rrow"><span class="st ${it.st}" aria-label="${it.st === 'ok' ? 'из справочника' : it.st === 'check' ? 'проверь' : 'своё'}">${it.st === 'ok' ? '✓' : it.st === 'check' ? '?' : '+'}</span>
      <button class="grow" style="text-align:left" data-act="imp-fix" data-v="${di}:${ii}" aria-label="Изменить ${esc(it.name)}"><div class="nm">${esc(it.name)}</div><div class="mt">${dose(it)}${it.w ? ' · ' + fmt(it.w) + ' кг' : ''}${it._warn ? '<span class="badge warn">проверь цифры</span>' : it._needsDose ? '<span class="badge warn">проверь повторы</span>' : it.st === 'check' ? '<span class="badge warn">проверь название</span>' : it.st === 'new' ? '<span class="badge new">своё</span>' : ''}</div>${sourceInfo(it)}${coachNote(it.name) ? '<div class="hint" style="color:var(--warn)">Похоже на рекомендацию — можно убрать в заметки</div>' : ''}</button>
      <button class="icon-btn" data-act="imp-row-menu" data-v="${di}:${ii}" aria-label="Действия: ${esc(it.name)}">${DOTS}</button>
      <div class="review-row-tools">${ii > 0 ? `<button data-act="imp-split" data-v="${di}:${ii}">Новый день отсюда</button>` : ''}<button data-act="imp-move-menu" data-v="${di}:${ii}">Перенести в другой день</button></div></div>`).join('') || '<div class="empty">Пока нет упражнений. Перенеси их из другого дня или добавь вручную.</div>'}
    <div class="review-day-tools"><button class="btn sm" data-act="imp-add-item" data-v="${di}">${I.plus}Добавить упражнение</button></div>
    </section>`).join('');
  b.innerHTML = `
    <div class="card pad"><b>${IMP.existing ? 'Редактирование программы' : 'Результат распознавания'}: ${importDayCount()} ${plural(importDayCount(), 'день', 'дня', 'дней')}, ${n} ${plural(n, 'упражнение', 'упражнения', 'упражнений')}</b><div class="hint">${flagged ? `${flagged} ${plural(flagged, 'название требует', 'названия требуют', 'названий требуют')} проверки. ` : ''}Правки сохраняются в черновик на этом устройстве. Программа изменится после сохранения.</div></div>
    <section class="import-count card pad"><div class="field"><label for="imp-review-count">На сколько дней нужно разделить?</label><select class="input" id="imp-review-count">${dayOptions(IMP.expectedDays)}</select></div>
      <span class="hint">Фото не равны дням. Если заголовков и нумерации мало, разделю по смене скриншотов — проверь границы; если и этого не хватит, добавлю пустые дни для ручного переноса, а не разделю упражнения поровну.</span>
      ${IMP.expectedDays === 'auto' ? `<button class="btn" data-act="imp-confirm-days" ${n && nd === importDayCount() ? '' : 'disabled'}>${IMP.countConfirmed === importDayCount() ? '✓ Подтверждено' : 'Верно'}: ${importDayCount()} ${plural(importDayCount(), 'день', 'дня', 'дней')}</button>` : ''}
      <div class="row" style="flex-wrap:wrap"><button class="btn sm" data-act="imp-day-add">${I.plus}Добавить день</button><button class="btn sm" data-act="imp-undo" ${IMP.undo.length ? '' : 'disabled'}>Отменить правку</button></div></section>
    ${IMP.warnings.length ? `<div class="note warn">${I.info}<span>${IMP.warnings.map(esc).join('<br>')}</span></div>` : ''}
    ${P.length && !IMP.existing ? `<div class="eyebrow">Куда добавить</div>
    <div class="dest" role="radiogroup">
      ${destOpt('add', 'Новым днём в мою программу', `${nd > 1 ? 'Станут днями' : 'Станет днём'} ${P.length + 1}${nd > 1 ? '–' + (P.length + nd) : ''}, остальное не изменится`)}
      ${destOpt('into', 'Дописать в существующий день', 'Все распознанные дни объединятся в один выбранный день')}
      ${IMP.dest === 'into' ? `<select class="input" id="imp-day" aria-label="в какой день">${dayOpts}</select>` : ''}
      ${destOpt('replace', 'Заменить всю программу', `Текущие ${P.length} ${plural(P.length, 'день', 'дня', 'дней')} уйдут`)}
    </div>` : ''}
    <div class="eyebrow">Что распознала</div>
    <p class="hint" style="margin:0">«Новый день отсюда» переносит это упражнение и все следующие в отдельный день. «Перенести» меняет день одного упражнения. Нажми на название для изменения веса и повторов, ⋯ — для удаления или переноса в заметки.</p>
    <div class="rdays">${rdays}</div>
    ${IMP.notes.length ? `<details class="card pad"><summary>Рекомендации тренера — ${IMP.notes.length}</summary><p class="hint">Это заметки, а не упражнения. Если строка попала сюда ошибочно, верни её в список.</p>${IMP.notes.map(note => `<div class="import-note"><p>${esc(note.text)}</p>${note.photo && IMP.mode === 'photo' ? `<small class="hint">Фото ${note.photo}</small>` : ''}<button class="btn sm" data-act="imp-note-restore" data-v="${note.id}">Это упражнение</button></div>`).join('')}</details>` : ''}
    ${IMP.existing ? '' : '<button class="btn ghost" data-act="imp-back">← Вернуться к фото или тексту</button>'}
    <button class="btn ghost" data-act="imp-new">Начать новый разбор</button>`;
  renderImportFoot();
  $$('[data-imp-title]').forEach(i => i.addEventListener('change', () => { snapImport(); IMP.days[+i.dataset.impTitle].title = i.value; saveImportDraft(); }));
  $('#imp-review-count').addEventListener('change', e => { snapImport(); setImportDayCount(e.target.value); renderImport(); });
  const sel = $('#imp-day'); if (sel) sel.addEventListener('change', () => { IMP.toDay = sel.value; renderImportFoot(); saveImportDraft(); });
  saveImportDraft();
}
function renderImportFoot() {
  const f = $('#imp-f'), n = IMP.days.reduce((a, d) => a + d.items.length, 0), into = IMP.dest === 'into' && dayById(IMP.toDay);
  const empty = IMP.days.length - importDayCount(), missingDose = IMP.days.flatMap(d => d.items).filter(it => it._needsDose).length;
  const message = empty ? `Заполни или удали пустые дни: ${empty}.` : missingDose ? `Не прочитались подходы и повторы: ${missingDose}. Нажми на названия и проверь значения.` : !readyImport() ? IMP.expectedDays === 'auto' ? 'Сначала подтверди число дней выше.' : `Нужно ${IMP.expectedDays} ${plural(+IMP.expectedDays, 'день', 'дня', 'дней')}, сейчас заполнено ${importDayCount()}. Расставь границы или перенеси упражнения.` : `${importDayCount()} ${plural(importDayCount(), 'день', 'дня', 'дней')} · ${n} ${plural(n, 'упражнение', 'упражнения', 'упражнений')} — готово к сохранению`;
  f.innerHTML = `<div class="import-save"><span class="hint" role="status">${message}</span><div class="row"><button class="btn" data-act="close">Закрыть</button><button class="btn primary" data-act="imp-save" ${readyImport() ? '' : 'disabled'}>${IMP.existing ? 'Сохранить исправления' : !S.program.days.length ? 'Сохранить программу' : IMP.dest === 'replace' ? 'Заменить программу' : into ? 'Дописать в день' : 'Добавить в программу'}</button></div></div>`;
}
function addPhotos(files) {
  [...files].filter(f => f.type.startsWith('image/')).forEach(f => IMP.photos.push({url: URL.createObjectURL(f), name: f.name}));
  renderImport();
}
async function readImport() {
  if (IMP.mode === 'text') {
    reviewImportLines(IMP.text.split('\n'));
    if (!IMP.days.some(d => d.items.length)) { IMP.step = 'pick'; return toast('Не нашла строк вида «Жим лёжа 3×10»'); }
    return renderImport();
  }
  if (IMP.sample) { IMP.days = demoRecognized(); IMP.step = 'read'; IMP.prog = 'Читаю 2 скриншота…'; renderImport(); setTimeout(() => { if (IMP && IMP.step === 'read') { IMP.step = 'review'; renderImport(); } }, 1200); return; }
  const need = IMP.photos.length;
  if (left('photo') < need) return paywallSheet(allowance().photo ? `Распознавание фото: осталось ${left('photo')}, а скриншотов ${need}. Можно вставить программу текстом — это бесплатно.` : 'Распознавание фото программы — в подписке. Текстом программу можно вставить бесплатно.');
  IMP.step = 'read'; IMP.prog = 'Готовлю распознавание…'; IMP.pct = 0; renderImport();
  const token = IMP;
  try {
    const lines = await ocrPhotos(IMP.photos, (i, p) => {
      if (IMP !== token || IMP.step !== 'read') return;
      if (i != null) IMP.cur = i;
      IMP.pct = ((IMP.cur || 0) + (p || 0)) / need;
      const st = $('#imp-st'), bar = $('#imp-bar');
      if (st) st.textContent = `Читаю скриншот ${(IMP.cur || 0) + 1} из ${need}…`;
      if (bar) bar.style.width = Math.round(IMP.pct * 100) + '%';
    });
    if (IMP !== token || IMP.step !== 'read') return;
    reviewImportLines(lines);
    if (IMP.days.some(d => d.items.length)) for (let k = 0; k < need; k++) spend('photo');
    if (!IMP.days.some(d => d.items.length)) { IMP.step = 'pick'; renderImport(); return sheet('Не нашла упражнений', `<p class="hint" style="margin:0">Текст на скриншоте прочитался, но строк с упражнениями и подходами я не увидела. Попробуй скриншот крупнее или вставь программу текстом.</p>${lines.length ? `<details><summary class="hint">Что прочиталось</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(lines.filter(l => l !== PHOTO_BREAK).join('\n'))}</pre></details>` : ''}`, `<button class="btn" data-act="close-top">Понятно</button><button class="btn primary" data-act="imp-totext">Вставить текстом</button>`, '', true); }
    renderImport(); scrollSheet();
  } catch (e) {
    console.error(e);
    if (IMP !== token) return;
    IMP.step = 'pick'; renderImport();
    sheet('Не получилось прочитать фото', `<p class="hint" style="margin:0">Распознавание не загрузилось — проверь интернет. Если открыто внутри предпросмотра, фото распознаются в установленной версии; здесь можно вставить программу текстом.</p>`, `<button class="btn" data-act="close-top">Понятно</button><button class="btn primary" data-act="imp-totext">Вставить текстом</button>`, '', true);
  }
}
function fixSheet(di, ii) {
  const it = ii == null ? importItem('Новое упражнение', null, '', 0) : IMP.days[di].items[ii];
  const q = norm(it.name).split(' ').filter(w => w.length > 3).map(w => w.slice(0, -2));
  const sug = Object.values(CAT).map(c => [c, q.filter(w => norm(c.n).includes(w)).length + (c.k === it.base ? 5 : 0)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
  IMP.fix = [di, ii];
  IMP.fixPick = undefined;
  sheet('Проверь упражнение', `
    <div class="field"><label for="fx-name">Название</label><input class="input" id="fx-name" value="${ii == null ? '' : esc(it.name)}" placeholder="Название упражнения"></div>
    ${it.raw ? `<div class="hint">На скриншоте: «${esc(it.raw)}»</div>` : ''}
    <div class="grid2"><div class="field"><label for="fx-dose">Подходы × повторы или секунды</label><input class="input" id="fx-dose" value="${it.s}×${reps(it)}${it.sec ? ' сек' : ''}"></div><div class="field"><label for="fx-w">Вес, кг</label><input class="input" id="fx-w" inputmode="decimal" value="${it.w ? fmt(it.w) : ''}" placeholder="0"></div></div>
    <div class="eyebrow">Это упражнение из справочника?</div>
    <div class="menu" id="fx-menu">${sug.map(c => `<button data-act="fx-pick" data-v="${c.k}"><span class="ck" ${it.base === c.k ? '' : 'hidden'}>✓</span><span>${esc(c.n)}</span>${c.cam ? '<small>камера</small>' : ''}</button>`).join('')}<button data-act="fx-pick" data-v=""><span class="ck" ${!it.base ? '' : 'hidden'}>✓</span><span>Нет, это моё упражнение</span></button></div>`,
    `<button class="btn" data-act="close-top">Отмена</button><button class="btn primary" data-act="fx-save">Готово</button>`, '', true);
}
function closeImportTools() { const top = sheetTop(); if (top && !top.querySelector('#imp')) closeTop(); }
function importMoveSheet(di, ii) {
  const it = IMP.days[di].items[ii];
  sheet('Перенести упражнение', `<p class="hint">${esc(it.name)}</p><div class="menu">${IMP.days.map((d, index) => `<button data-act="imp-move" data-v="${di}:${ii}:${d.id}" ${index === di ? 'disabled' : ''}><span>${esc(d.title)}</span><small>${index === di ? 'сейчас здесь' : d.items.length + ' упр.'}</small></button>`).join('')}<button data-act="imp-move" data-v="${di}:${ii}:new">${I.plus}<span>В новый день</span></button></div>`, '', '', true);
}
function importRowMenu(di, ii) {
  const it = IMP.days[di].items[ii];
  sheet(it.name, `<div class="menu">
    ${mi('imp-fix', `${di}:${ii}`, I.edit, 'Изменить название, вес и повторы')}
    ${mi('imp-move-menu', `${di}:${ii}`, I.arrow, 'Перенести в другой день')}
    ${ii > 0 ? mi('imp-split', `${di}:${ii}`, I.plus, 'Начать новый день отсюда') : ''}
    ${mi('imp-row-shift', `${di}:${ii}:-1`, I.up, 'Поставить раньше', ii === 0 ? 'disabled' : '')}
    ${mi('imp-row-shift', `${di}:${ii}:1`, I.down, 'Поставить позже', ii === IMP.days[di].items.length - 1 ? 'disabled' : '')}
    ${mi('imp-to-note', `${di}:${ii}`, I.doc, 'Это рекомендация, а не упражнение')}
    ${mi('imp-del', `${di}:${ii}`, I.trash, 'Удалить строку', 'class="danger"')}</div>`, '', '', true);
}
function importSave() {
  if (!readyImport()) return toast('Сначала проверь число дней и распредели упражнения по ним');
  const P = S.program;
  const owners = new Set(IMP.days.flatMap(d => d.items.map(it => it.id)));
  const orphanNotes = IMP.notes.filter(note => !owners.has(note.ownerId)).map(note => note.text);
  const days = IMP.days.filter(d => d.items.length).map(d => ({id: IMP.existing ? d.id : nid('d'), title: d.title.trim() || 'День', ...(d.coachNotes ? {coachNotes: d.coachNotes} : {}), items: d.items.map(({st, raw, _number, _photos, _needsDose, _warn, ...it}) => ({...it, id: IMP.existing ? it.id : nid('i')}))}));
  snap();
  let msg, flashId;
  if (!P.days.length || IMP.dest === 'replace') { if (!IMP.existing) { delete P.coachNotes; P.at = Date.now(); P.by = 'import'; } P.days = days; if (!IMP.existing || !days.some(d => d.id === S.next)) S.next = days[0].id; msg = `Программа сохранена: ${days.length} ${plural(days.length, 'день', 'дня', 'дней')}`; flashId = days[0].id; }
  else if (IMP.dest === 'into') { const d = dayById(IMP.toDay); d.items.push(...days.flatMap(x => x.items)); msg = `Дописала в «${d.title}»`; flashId = d.id; }
  else { P.days.push(...days); msg = days.length > 1 ? `Добавила ${days.length} дня в конец программы` : `«${days[0].title}» — теперь день ${P.days.length}`; flashId = days[0].id; }
  if (orphanNotes.length) P.coachNotes = [...new Set([...(P.coachNotes || []), ...orphanNotes])];
  if (!S.next) S.next = P.days[0].id;
  S.pick = null; delete S.importDraft;
  IMP = null; closeSheet();
  S.stage = 'app'; S.tab = 'program'; S.flash = flashId; S.open[flashId] = true;
  render(); S.flash = null;
  setTimeout(() => { const el = $(`[data-day="${flashId}"]`); el && el.scrollIntoView({behavior: 'smooth', block: 'center'}); }, 60);
  toast(msg, true);
}


'use strict';
/* ---------- actions: every button carries data-act (+ data-v) ---------- */
const sheetTop = () => $('#sheets').lastElementChild;
const closeTop = () => { const t = sheetTop(); if (!t) return; if (t.querySelector('#wiz')) { if (REC) stopMic(true); S.wiz = null; } if (t.querySelector('#imp')) IMP = null; const returnTo = t._returnFocus; t.remove(); syncSheets(returnTo); };
const scrollSheet = () => { const b = $('.sheet-b', sheetTop() || document); if (b) b.scrollTop = 0; };
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function useProgram(days, profile, tab) {
  if (S.program.days.length) snap();
  if (S.demo && S.user) { S.diary = S.demoReturn ? JSON.parse(S.demoReturn).diary : S.diary.filter(w => !w.demo); S.demo = false; delete S.demoReturn; S.workout = null; S.rest = null; }
  else if (S.demo) { S.diary = []; S.workout = null; S.rest = null; }
  S.program = {days, at: Date.now(), by: profile ? 'wish' : 'other'}; S.next = days[0] ? days[0].id : null; S.pick = null;
  if (profile) { const {found, ...p} = profile; S.profile = {...blankProfile(), ...p, filled: true}; S.wishRulesStamp = wishProfileStamp(S.profile); }
  S.stage = 'app'; S.tab = tab; S.open = {};
}
const A = {
  /* shell */
  tab: v => { S.tab = v; render(); window.scrollTo({top: 0}); },
  'video-select':()=>chooseCameraVideo(),
  'video-history':()=>videoHistorySheet(),
  'today-menu':()=>todayMenu(),
  close: () => closeSheet(),
  'close-top': () => closeTop(),
  undo: () => { $('#toast-root').innerHTML = ''; undo(); },

  /* registration & first screen */
  'reg-ck': v => { REG[v] = !REG[v]; const e = $('#reg-email'); if (e) REG.email = e.value; $$(`.box[data-v="${v}"]`).forEach(b => b.setAttribute('aria-checked', REG[v])); $('#reg-go').disabled = !(REG.pd && REG.terms); },
  /* registration creates the account on the server (services/account.js); with no connection the app starts on the phone */
  'reg-go': () => {
    const pi = $('#reg-promo'), pc = (pi ? pi.value : '').trim().toUpperCase();
    if (!TRENER.accounts) {   // no server yet: the account lives on this phone, as in 2.6
      const e = $('#reg-email'), email = (e ? e.value : '').trim();
      REG.email = email;
      if (!EMAIL_RX.test(email)) { toast('Проверь почту — например, name@mail.ru'); e && e.focus(); return; }
      if (!REG.pd || !REG.terms) return toast('Отметь согласие и соглашение — без них регистрация недоступна');
      if (pc && !localPromo(pc)) { toast('Такого промокода нет — проверь или оставь поле пустым'); pi && pi.focus(); return; }
      const at = Date.now();
      S.user = {email, at, consent: {pd: {v: CONSENT_V, at}, terms: {v: CONSENT_V, at}, news: REG.news}};
      if (pc) applyPromo(pc);
      S.stage = 'start'; render(); window.scrollTo({top: 0});
      return;
    }
    REG.promo = pc;
    if (TG.inside()) {
      if (!REG.pd || !REG.terms) return toast('Отметь согласие и соглашение — без них регистрация недоступна');
      return Account.tgSignIn({pd: true, terms: true, marketing: REG.news}, pc);
    }
    const e = $('#reg-email'), email = (e ? e.value : '').trim();
    REG.email = email;
    if (!EMAIL_RX.test(email)) { toast('Проверь почту — например, name@mail.ru'); e && e.focus(); return; }
    if (!REG.pd || !REG.terms) return toast('Отметь согласие и соглашение — без них регистрация недоступна');
    return Account.register(email, pc);
  },
  doc: v => docSheet(v),
  'start-path': v => {
    if (v === 'wish') return openWizard();
    if (v === 'import') return importSheet();
    S.stage = 'app'; S.tab = 'today'; render(); window.scrollTo({top: 0});
    if (v === 'video') chooseCameraVideo();
  },
  demo: () => {
    if (S.demo) return;
    const previous = JSON.stringify(S);
    undoSnap = null;
    const p = demoProgram(), d = demoDiary(p); d.forEach(w => { w.demo = true; });
    S.demoReturn = previous;
    S.program = p; S.diary = d.sort((a, b) => b.date - a.date); S.next = p.days[0].id; S.demo = true;
    S.workout = null; S.rest = null;
    S.stage = 'app'; S.tab = 'today'; S.pick = null; closeSheet(); render(); window.scrollTo({top: 0});
    toast('Пример: 2 дня программы и 5 недель дневника');
  },
  'demo-off': () => {
    const theme = S.theme, acct = S.acct, server = S.server;
    if (S.demoReturn) { S = JSON.parse(S.demoReturn); S.theme = theme; if (acct) { S.acct = acct; S.server = server; } }
    else { S.diary = S.diary.filter(w => !w.demo); S.program = {days: []}; S.next = null; S.demo = false; S.workout = null; S.rest = null; S.tab = 'today'; }
    if (!S.user) S.stage = 'welcome';
    undoSnap = null;
    closeSheet(); render(); window.scrollTo({top: 0}); toast('Пример закрыт — твои данные на месте');
  },

  /* wishes → program */
  wish: () => openWizard(),
  mic: () => toggleMic(),
  'wiz-next': async () => {
    const W = S.wiz; if (!W) return;
    if (W.nextPending) return;
    if (REC) {
      W.nextPending = true;
      const next = $('#wiz-next'); if (next) { next.disabled = true; next.textContent = 'Завершаю диктовку…'; }
      await stopMic();
      delete W.nextPending;
      if (S.wiz !== W || W.step !== 1) return;
    }
    const P = parseWishes(W.text);
    /* Preserve current-rule manual edits; re-read older interpretations only in this new draft. */
    W.P = S.wishRulesStamp === wishProfileStamp(S.profile) && S.profile.filled && norm(S.profile.text) === norm(W.text) ? {...JSON.parse(JSON.stringify(S.profile)), found: P.found, flags: P.flags, expMonths: P.expMonths, daysAsked: P.daysAsked} : P;
    W.step = 2; renderWizard(); scrollSheet();
  },
  'wiz-back': () => { const W = S.wiz; if (!W) return; W.step = W.step === 3 ? 2 : 1; renderWizard(); scrollSheet(); },
  'wiz-build': () => {
    const W = S.wiz; if (!W) return;
    if (!W.spent) {
      if (left('prog') <= 0) { const al = allowance().prog, lv = access().level; return paywallSheet(!al ? 'Подбор программы по пожеланиям — в подписке.' : lv === 'trial' ? `В пробный период — ${al} подбор программы, он уже использован. Дальше — с подпиской.` : `Подборы на этот период закончились (${al} из ${al}). Обновятся ${ruDate(period().end)}.`); }
      spend('prog'); W.spent = true;
    }
    W.res = buildProgram(W.P); W.open = {}; W.step = 3; renderWizard(); scrollSheet();
  },
  'wz-set': v => { const [k, x] = v.split(':'); S.wiz.P[k] = k === 'days' || k === 'mins' ? +x : x; if (k === 'days') S.wiz.P.daysAsked = +x; renderWizard(); },
  'wz-focus': v => { const [k, l] = v.split(':'), F = S.wiz.P.focus; if (+l) F[k] = +l; else delete F[k]; renderWizard(); },
  'wz-lim': v => { const L = S.wiz.P.limits, i = L.indexOf(v); if (i >= 0) L.splice(i, 1); else L.push(v); renderWizard(); },
  'wz-day': v => { const W = S.wiz, i = W.res.days.findIndex(d => d.id === v); W.open[v] = !(W.open[v] ?? i === 0); renderWizard(); },
  'wiz-accept': v => {
    const W = S.wiz; if (!W || !W.res) return;
    const had = S.program.days.length;
    useProgram(W.res.days, W.res.profile, v === 'program' ? 'program' : 'today');
    closeSheet(); render(); window.scrollTo({top: 0});
    toast(had ? 'Новая программа сохранена' : 'Программа готова', had);
  },

  /* today & workout */
  pick: v => { S.pick = v; render(); },
  start: v => startWorkout(v),
  'health-ok': () => { S.healthOk = true; closeSheet(); const t = HEALTH_THEN; HEALTH_THEN = null; if (t) t(); else render(); },
  'wx-open': v => { S.workout.active = S.workout.active === +v ? -1 : +v; render(); },
  adj: v => {
    const [i, k, f, d] = v.split(':'), it = S.workout.items[+i], s = it.sets[+k];
    if (f === 'w') s.w = Math.max(0, Math.round((s.w + (+d) * (stepOf(it) || 1)) * 10) / 10);
    else s.r = Math.max(1, s.r + (+d));
    if (f === 'w' && !s.done) it.sets.forEach((o, j) => { if (j > +k && !o.done) o.w = s.w; });
    render();
  },
  done: v => {
    const [i, k] = v.split(':').map(Number), W = S.workout, it = W.items[i], s = it.sets[k];
    if (!s.done) {
      const inputs = $$('[data-in]').filter(el => el.dataset.v === v);
      if (inputs.some(el => inputNumber(el, el.dataset.in === 'r' ? 1 : 0, el.dataset.in === 'r') === null)) return toast('Укажи вес от 0 и целое число повторов или секунд больше 0');
      if (!(s.r > 0)) return toast('Укажи число повторов или секунд больше 0');
    }
    s.done = !s.done;
    if (s.done) {
      const G = groupOf(W.items, i), left = j => W.items[j].sets.some(x => !x.done);
      const go = j => setTimeout(() => { if (S.workout === W) { W.active = j; render(); const o = $('.wx.open'); o && o.scrollIntoView({behavior: 'smooth', block: 'start'}); } }, 450);
      if (G.length > 1) {   // superset: the next member without rest, rest only after the round
        const at = G.indexOf(i), order = [...G.slice(at + 1), ...G.slice(0, at + 1)], nx = order.find(left);
        if (nx !== undefined) {
          const labs = blockLabels(W.items), wrap = G.indexOf(nx) <= at, rest = Math.max(...G.map(j => W.items[j].rest || 0));
          if (wrap) { S.rest = {end: Date.now() + rest * 1000, total: rest}; if (nx !== i) toast(`Круг готов — отдых, потом ${labs[nx]} «${W.items[nx].name}»`); }
          else { S.rest = null; toast(`Дальше — ${labs[nx]} «${W.items[nx].name}», без отдыха`); }
          if (nx !== i) go(nx);
          render(); return;
        }
      }
      S.rest = {end: Date.now() + it.rest * 1000, total: it.rest};
      if (it.sets.every(x => x.done)) {
        const last = G[G.length - 1], nxt = W.items.findIndex((x, j) => j > last && !(x.sets.length && x.sets.every(y => y.done)));
        const any = nxt >= 0 ? nxt : W.items.findIndex(x => x.sets.length && !x.sets.every(y => y.done));
        if (any >= 0) setTimeout(() => { if (S.workout === W) { W.active = any; render(); const o = $('.wx.open'); o && o.scrollIntoView({behavior: 'smooth', block: 'start'}); } }, 500);
        else S.rest = null;
      }
    }
    render();
  },
  rmset: v => {
    const it = S.workout.items[+v]; if (it.sets.length <= 1) return;
    let k = -1; for (let j = it.sets.length - 1; j >= 0; j--) if (!it.sets[j].done) { k = j; break; }
    const wasDone = k < 0; if (wasDone) k = it.sets.length - 1;
    it.sets.splice(k, 1); render();
    if (wasDone) toast(`Убрала подход ${k + 1} — в дневник он не попадёт`);
  },
  addset: v => { const it = S.workout.items[+v], l = it.sets[it.sets.length - 1] || {w: it.w, r: it.lo}; it.sets.push({w: l.w, r: l.r, done: false}); render(); },
  'wx-menu': v => {
    const it = S.workout.items[+v];
    sheet(it.name, `<div class="menu">${mi('rmset',v,I.trash,'Убрать последний подход',it.sets.length<=1?'disabled':'')}${mi('wx-swap', v, I.swap, 'Заменить на сегодня')}${mi('wx-last', v, I.last, 'Сделать в конце')}${mi('wx-skip', v, I.skip, 'Пропустить сегодня')}</div><p class="hint">Программа не меняется — только сегодняшняя тренировка.</p>`);
  },
  'wx-skip': v => { const W = S.workout; W.items[+v].sets = []; W.active = Math.min(+v + 1, W.items.length - 1); closeSheet(); render(); toast('Пропустили — в дневник не попадёт'); },
  'wx-last': v => { const W = S.workout, G = groupOf(W.items, +v); W.items.push(...W.items.splice(G[0], G.length)); W.active = G[0]; closeSheet(); render(); },
  'wx-swap': v => { closeSheet(); catSheet('wo-swap', null, v); },
  'wx-add': () => catSheet('wo-add'),
  finish: () => finishSheet(),
  'save-wo': () => { closeSheet(); saveWorkout(); },
  discard: () => { S.workout = null; S.rest = null; closeSheet(); render(); },
  'go-diary': () => { closeSheet(); S.tab = 'diary'; S.dtab = 'hist'; if (S.diary[0]) S.open[S.diary[0].id] = true; render(); window.scrollTo({top: 0}); },
  'rest-add': () => { if (S.rest) { S.rest.end = Math.max(Date.now(), S.rest.end) + 15000; S.rest.buzz = 0; renderRest(); save(); } },
  'rest-skip': () => { S.rest = null; renderRest(); save(); },

  /* program */
  'day-toggle': v => { S.open[v] = S.open[v] === false; render(); },
  'day-menu': v => dayMenu(v),
  'day-rename': v => { closeSheet(); S.renaming = v; S.open[v] = true; render(); const i = $('#rename'); if (i) { i.focus(); i.select(); } },
  'day-move': v => { const [id, d] = v.split(':'), a = S.program.days, i = a.findIndex(x => x.id === id), j = i + (+d); if (j < 0 || j >= a.length) return; snap(); [a[i], a[j]] = [a[j], a[i]]; renumber(); closeSheet(); S.flash = id; render(); S.flash = null; toast(`«${dayById(id).title}» теперь день ${j + 1}`, true); },
  'day-next': v => { S.next = v; S.pick = null; closeSheet(); render(); toast(`Следующая тренировка — «${dayById(v).title}»`); },
  'day-dup': v => { snap(); const d = dayById(v), c = JSON.parse(JSON.stringify(d)); c.id = nid('d'); c.title = d.title + ' (копия)'; c.items.forEach(i => { i.id = nid('i'); }); S.program.days.splice(S.program.days.indexOf(d) + 1, 0, c); renumber(); closeSheet(); S.flash = c.id; render(); S.flash = null; toast('День скопирован', true); },
  'day-del': v => { snap(); const a = S.program.days, d = dayById(v); a.splice(a.indexOf(d), 1); if (S.next === v) S.next = a[0] ? a[0].id : null; if (S.pick === v) S.pick = null; renumber(); closeSheet(); render(); toast(`«${d.title}» удалён`, true); },
  'day-add': () => { snap(); const d = {id: nid('d'), title: `День ${S.program.days.length + 1}`, items: []}; S.program.days.push(d); if (!S.next) S.next = d.id; S.stage = 'app'; S.tab = 'program'; S.renaming = d.id; render(); const i = $('#rename'); if (i) { i.focus(); i.select(); i.scrollIntoView({block: 'center'}); } },
  'ex-menu': v => { const [d, i] = v.split(':'); exMenu(d, i); },
  'ex-dose': v => { const [d, i] = v.split(':'); doseSheet(d, i); },
  'ex-del': v => { const [d, i] = v.split(':'), [day, idx, it] = findItem(d, i); snap(); day.items.splice(idx, 1); closeSheet(); render(); toast(`«${it.name}» убрано`, true); },
  'ss-join': v => {
    const [dId, iId] = v.split(':'), [day, idx, it] = findItem(dId, iId), nx = day.items[idx + 1]; if (!nx) return;
    snap(); const g = it.ss || nx.ss || nid('g');
    for (const j of [...groupOf(day.items, idx), ...groupOf(day.items, idx + 1)]) day.items[j].ss = g;
    closeSheet(); render();
    const labs = blockLabels(day.items), G = groupOf(day.items, idx);
    toast(`${G.length === 2 ? 'Суперсет' : 'Круг'} ${G.map(j => labs[j]).join(' + ')}: по подходу по очереди, отдых после круга`, true);
  },
  'ss-split': v => {
    const [dId, iId] = v.split(':'), [day, idx, it] = findItem(dId, iId), G = groupOf(day.items, idx);
    snap(); delete it.ss;
    if (idx !== G[0] && idx !== G[G.length - 1]) { day.items.splice(idx, 1); day.items.splice(G[G.length - 1], 0, it); }
    closeSheet(); render(); toast(`«${it.name}» — отдельно, по порядку`, true);
  },
  'ex-moveto': v => { const [d, i, to] = v.split(':'), [day, idx, it] = findItem(d, i); snap(); day.items.splice(idx, 1); delete it.ss; dayById(to).items.push(it); closeSheet(); S.open[to] = true; render(); toast(`Перенесла в «${dayById(to).title}»`, true); },
  'ex-swap': v => { const [d, i] = v.split(':'); closeSheet(); catSheet('swap', d, i); },
  'dz-adj': v => { const [k, d] = v.split(':'), inp = $('#dz-' + k); let n = parseNum(inp.value) + parseFloat(d); n = Math.max(k === 's' ? 1 : 0, Math.round(n * 10) / 10); inp.value = k === 'w' ? fmt(n) : n; },
  'dz-rest': v => { $('#sheets').dataset.rest = v; $$('#dz-rest button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); },
  'dz-save': v => {
    const [d, i] = v.split(':'), [, , it] = findItem(d, i);
    const s = inputNumber($('#dz-s'), 1, true), w = inputNumber($('#dz-w'));
    const lo = inputNumber($('#dz-lo'), 1, true), hi = inputNumber($('#dz-hi'), 1, true);
    if ([s, w, lo, hi].some(n => n === null)) return toast('Укажи вес от 0, подходы и повторы или секунды — целыми числами больше 0');
    snap();
    it.s = s; it.w = w;
    it.lo = Math.max(1, Math.min(lo, hi)); it.hi = Math.max(lo, hi, 1); it.rest = +$('#sheets').dataset.rest || 90;
    closeSheet(); render(); toast('Сохранено', true);
  },
  cat: v => catSheet('add', v),
  'cat-g': v => { S.cat.g = v; $$('#cat-g .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.v === v)); catList(); },
  'cat-add': (v, el) => catAdd(v, false, el),
  'cat-own': (v, el) => catAdd(null, true, el),

  /* own program by photo or text */
  import: () => importSheet(),
  'program-organize': () => organizeProgram(),
  'program-menu':()=>programMenu(),
  'imp-new': () => { delete S.importDraft; save(); IMP = newImportSession(); renderImport(); scrollSheet(); },
  'imp-undo': () => { const previous = IMP.undo.pop(); if (!previous) return; Object.assign(IMP, JSON.parse(previous)); renderImport(); },
  'imp-confirm-days': () => { if (importDayCount() && IMP.days.length === importDayCount()) { IMP.countConfirmed = importDayCount(); renderImport(); } },
  'imp-day-add': () => { snapImport(); IMP.days.push({id: nid('r'), title: `День ${IMP.days.length + 1}`, items: [], _reason: 'День добавлен вручную'}); renderImport(); },
  'imp-day-delete': v => { const index = +v; if (IMP.days[index].items.length) return; snapImport(); IMP.days.splice(index, 1); renderImport(); },
  'imp-photo-move': v => { const [index, direction] = v.split(':').map(Number), target = index + direction; if (target < 0 || target >= IMP.photos.length) return; [IMP.photos[index], IMP.photos[target]] = [IMP.photos[target], IMP.photos[index]]; renderImport(); },
  'imp-mode': v => { IMP.mode = v; IMP.sample = false; renderImport(); },
  'imp-rm': v => { const photo = IMP.photos.splice(+v, 1)[0]; if (photo && photo.url) URL.revokeObjectURL(photo.url); if (!IMP.photos.length) IMP.sample = false; renderImport(); },
  'imp-sample': () => { IMP.mode = 'photo'; IMP.sample = true; IMP.photos = [{url: '', name: 'Скриншот 1'}, {url: '', name: 'Скриншот 2'}]; renderImport(); },
  'imp-read': () => readImport(),
  'imp-back': () => { IMP.step = 'pick'; renderImport(); scrollSheet(); },
  'imp-totext': () => {
    closeTop(); if (!IMP) return;
    IMP.mode = 'text'; IMP.step = 'pick'; IMP.sample = false;
    if (IMP.lines && IMP.lines.length && !IMP.text.trim()) IMP.text = IMP.lines.filter(l => l !== PHOTO_BREAK).join('\n');
    renderImport();
  },
  'imp-dest': v => { IMP.dest = v; renderImport(); },
  'imp-merge': v => { const i = +v, a = IMP.days; if (i <= 0 || i >= a.length) return; snapImport(); a[i - 1].items.push(...a[i].items); a[i - 1].coachNotes = [...(a[i - 1].coachNotes || []), ...(a[i].coachNotes || [])]; a.splice(i, 1); renderImport(); toast('Дни объединены. Правку можно отменить'); },
  'imp-split': v => { const [di, ii] = v.split(':').map(Number); if (!splitImportDay(di, ii)) return; closeImportTools(); renderImport(); toast('Новый день начинается с выбранного упражнения'); },
  'imp-del': v => { const [di, ii] = v.split(':').map(Number); snapImport(); IMP.days[di].items.splice(ii, 1); closeImportTools(); renderImport(); toast('Строка удалена. Правку можно отменить'); },
  'imp-row-menu': v => { const [di, ii] = v.split(':').map(Number); importRowMenu(di, ii); },
  'imp-move-menu': v => { const [di, ii] = v.split(':').map(Number); closeImportTools(); importMoveSheet(di, ii); },
  'imp-move': v => { const [di, ii, target] = v.split(':'); if (!moveImportItem(+di, +ii, target)) return; closeImportTools(); renderImport(); toast('Упражнение перенесено'); },
  'imp-row-shift': v => { const [di, ii, direction] = v.split(':').map(Number), items = IMP.days[di].items, target = ii + direction; if (target < 0 || target >= items.length) return; snapImport(); [items[ii], items[target]] = [items[target], items[ii]]; closeImportTools(); renderImport(); },
  'imp-to-note': v => { const [di, ii] = v.split(':').map(Number); noteImportItem(di, ii); closeImportTools(); renderImport(); toast('Рекомендация сохранится как заметка'); },
  'imp-note-restore': v => { restoreImportNote(v); renderImport(); },
  'imp-add-item': v => fixSheet(+v, null),
  'imp-fix': v => { const [di, ii] = v.split(':').map(Number); closeImportTools(); fixSheet(di, ii); },
  'fx-pick': (v, el) => { IMP.fixPick = v; $$('#fx-menu .ck').forEach(c => { c.hidden = true; }); $('.ck', el).hidden = false; },
  'fx-save': () => {
    const [di, ii] = IMP.fix, name = $('#fx-name').value.trim(), d = parseDose($('#fx-dose').value);
    const w = $('#fx-w').value.trim() ? inputNumber($('#fx-w')) : 0;
    if (name.length < 2) return toast('Напиши название упражнения');
    if (!d) return toast('Укажи подходы и повторы, например 3×8–12 или 3×30 сек');
    if (w === null) return toast('Вес должен быть числом от 0');
    snapImport();
    const it = ii == null ? importItem(name, d, '', w) : IMP.days[di].items[ii];
    const renamed = it.name !== name;
    it.name = name.slice(0, 60); Object.assign(it, {s: d.s, lo: d.lo, hi: d.hi, sec: d.sec, w}); delete it._needsDose; delete it._warn;
    const picked = IMP.fixPick !== undefined ? IMP.fixPick : renamed ? resolve(name)[0] || '' : it.base;
    const c = CAT[picked]; it.base = c ? c.k : null; it.cam = !!(c && c.cam); it.inc = guessInc(it.name, it.base, !!w, it.sec);
    it.st = it.base ? 'ok' : 'new';
    if (ii == null) IMP.days[di].items.push(it);
    IMP.fixPick = undefined;
    closeTop(); renderImport();
  },
  'imp-save': () => importSave(),

  /* camera */
  'cam-pick': () => camPickSheet(),
  'cam-set': v => { const it = S.camChoices[+v]; if (it) S.camEx = {name: it.name, base: it.base, w: it.w || (it.sets && it.sets[0] ? it.sets[0].w : 0), inc: it.inc, sec: it.sec, cam: it.cam}; closeSheet(); render(); },
  'cam-cat': () => { closeSheet(); catSheet('cam'); },
  'cam-facing': v => { S.camFacing = v; render(); },
  'cam-go': v => { if (v != null && S.workout) S.workout.active = +v; S.tab = 'today'; save(); return 'follow'; },
  vres: v => videoSheet(v),
  'vres-log': v => { const x = S.videoLog.find(y => y.id === v); if (!x) return; const msg = logCamSets(x); closeSheet(); render(); toast(msg); },

  /* diary */
  dtab: v => { S.dtab = v; render(); },
  'cal-m': v => { let [y, m] = S.calM; m += +v; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } S.calM = [y, m]; render(); },
  'cal-go': v => { const [y, m, d] = v.split('-').map(Number), w = S.diary.find(x => sameDay(x.date, new Date(y, m, d))); if (w) { S.open[w.id] = true; render(); const el = $('#log-' + w.id); el && el.scrollIntoView({behavior: 'smooth', block: 'start'}); } },
  'log-toggle': v => { S.open[v] = !S.open[v]; render(); },
  'set-edit': v => { const [w, e, s] = v.split(':'); setSheet(w, +e, +s); },
  'set-add': v => { const [w, e] = v.split(':'); setSheet(w, +e, null); },
  'se-save': () => {
    const w = inputNumber($('#se-w')), r = inputNumber($('#se-r'), 1, true);
    if (w === null || r === null) return toast('Укажи вес от 0 и целое число повторов или секунд больше 0');
    const {wid, ei, si} = S.setEdit, e = S.diary.find(x => x.id === wid).items[ei], s = {w, r};
    if (si == null) e.sets.push(s); else e.sets[si] = {...e.sets[si], ...s};
    closeSheet(); render(); toast(si == null ? 'Подход добавлен' : 'Сохранено');
  },
  'se-del': () => { const {wid, ei, si} = S.setEdit, w = S.diary.find(x => x.id === wid), e = w.items[ei]; e.sets.splice(si, 1); if (!e.sets.length) w.items.splice(ei, 1); if (!w.items.length) S.diary.splice(S.diary.indexOf(w), 1); closeSheet(); render(); toast('Подход удалён'); },
  'prog-ex': v => { S.prog = v; render(); },

  /* profile, subscription, data */
  theme: v => { S.theme = v; render(); toast(v === 'bento' ? 'Оформление «Бенто»' : 'Оформление «Сумерки»'); },
  paywall: v => paywallSheet(v === 'cam' ? 'Камера-тренер и разбор видео — в подписке.' : ''),
  promo: () => { paywallSheet(); setTimeout(() => { const i = $('#promo'); i && i.focus(); }, 60); },
  /* the server checks the code; without an account there is nothing to attach it to */
  'promo-go': async () => {
    const i = $('#promo'), c = (i ? i.value : '').trim().toUpperCase();
    if (!c) return toast('Введи промокод');
    if (!TRENER.accounts) {   // no server yet: checked on the phone, as in 2.6
      const p = localPromo(c);
      if (!p) return toast('Такого промокода нет — проверь написание');
      applyPromo(c);
      save(); closeTop(); paywallSheet(); render(); if (S.wiz) renderWizard();
      return toast(`Промокод принят: ${p.text}`);
    }
    if (!Account.signedIn()) return toast(TG.inside() ? 'Сначала сохрани данные в аккаунте — «Профиль → Аккаунт»' : 'Промокод работает в аккаунте — войди или создай его в профиле');
    const p = await Account.redeem(c);
    if (!p.ok) return toast(p.error.code === 'offline' ? 'Нет связи с сервером — попробуй чуть позже' : p.error.message);
    save(); closeTop(); paywallSheet(); render(); if (S.wiz) renderWizard();
    toast(`Промокод принят: ${p.text}`);
  },
  subscribe: () => toast(PRICING.payments ? '' : access().test ? 'Сейчас тестирование: всё уже открыто бесплатно' : 'На время теста оплата отключена — введи промокод TEST2026'),
  'ai-plus': () => {
    if (!PRICING.addonsEnabled) return;
    S.sub.plusPick = !S.sub.plusPick; save();
    $$('[data-act="ai-plus"]').forEach(b => b.setAttribute('aria-checked', S.sub.plusPick));
    $$('[data-act="subscribe"]').forEach(b => { b.textContent = `Оформить за ${rub(PRICING.sub.price + (S.sub.plusPick ? PRICING.aiPlus.price : 0))}`; });
    toast(S.sub.plusPick ? `С ИИ+ — ${rub(PRICING.sub.price + PRICING.aiPlus.price)} в месяц` : `Без ИИ+ — ${rub(PRICING.sub.price)} в месяц`);
  },
  'ai-once': () => toast('Сейчас предусмотрен один тариф — ' + rub(PRICING.sub.price) + ' в месяц. Оплата пока отключена'),
  backup: () => backupFile(),
  'bk-copy': async () => { const t = $('#bk-text'); try { await navigator.clipboard.writeText(t.value); toast('Скопировано'); } catch (e) { t.focus(); t.select(); toast('Выдели текст и скопируй вручную'); } },
  restore: () => restoreSheet(),
  support: () => supportSheet(),
  'sup-diag': () => { S.supDiag = S.supDiag === false; const b = $('[data-act="sup-diag"].box'); if (b) b.setAttribute('aria-checked', String(S.supDiag !== false)); },
  'sup-send': (v, el, e) => {
    const t = (($('#sup-text') || {}).value || '').trim();
    if (t.length < 3) { if (e) e.preventDefault(); toast('Напиши пару слов — что случилось'); const x = $('#sup-text'); x && x.focus(); return; }
    const text = supportText(); S.supDraft = t;
    try { navigator.clipboard.writeText(text).then(() => toast('Текст скопирован — вставь его в чат с ботом'), () => {}); } catch (err) { /* the bot asks anyway */ }
    return 'follow';
  },
  'rs-text': () => { const t = ($('#rs-text') || {}).value || ''; if (!t.trim()) return toast('Вставь текст копии или выбери файл'); restoreText(t.trim()); },
  'restore-go': () => {
    const d = RESTORE; if (!d) return;
    for (const k of BACKUP_KEYS) if (k in d && d[k] != null) S[k] = d[k];
    S.workout = null; S.rest = null; S.pick = null; S.open = {}; S.stage = S.user ? 'app' : S.stage; S.tab = 'today'; S.demo = false; delete S.demoReturn;
    RESTORE = null; closeSheet(); render(); window.scrollTo({top: 0}); toast('Данные восстановлены из копии');
  },
  wipe: () => Account.signedIn() ? sheet('Удалить аккаунт и все данные?', `<p style="margin:0">Удалятся аккаунт на сервере и всё, что в нём: программа, дневник, разборы камеры, пожелания. С этого телефона тоже. Вернуть их будет нельзя. Отметки о согласии хранятся 3 года — так требует закон, — без доступа к ним.</p>`,
    `<button class="btn" data-act="close">Отмена</button><button class="btn danger" data-act="wipe-go">Удалить всё</button>`) : sheet('Удалить все данные?', `<p style="margin:0">С этого телефона удалятся программа, дневник, разборы камеры, пожелания и аккаунт с отметками согласия. Вернуть их можно будет только из сохранённой копии.</p>`,
    `<button class="btn" data-act="close">Отмена</button><button class="btn danger" data-act="wipe-go">Удалить всё</button>`),
  'wipe-go': async () => {
    const account = Account.signedIn();
    if (account) { const r = await Account.deleteAll(); if (!r.ok) return toast(r.error.code === 'offline' ? 'Нет связи с сервером — аккаунт не удалён. Попробуй позже' : r.error.message); }
    try { localStorage.removeItem(KEY); localStorage.removeItem(INBOX); } catch (e) { /* nothing stored */ }
    S = fresh(); S.renaming = null; S.wiz = null; REG = {pd: false, terms: false, news: false, email: ''};
    closeSheet(); render(); window.scrollTo({top: 0}); toast(account ? 'Аккаунт и все данные удалены' : 'Все данные удалены с этого телефона');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  const f = A[el.dataset.act];
  if (!f) return;
  const r = f(el.dataset.v, el, e);
  if (r !== 'follow') e.preventDefault();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.in && S.workout) {
    const [i, k] = t.dataset.v.split(':').map(Number), it = S.workout.items[i], s = it.sets[k], f = t.dataset.in;
    const value = inputNumber(t, f === 'r' ? 1 : 0, f === 'r');
    if (value !== null) {
      s[f] = value;
      if (f === 'w' && !s.done) it.sets.forEach((o, j) => {
        if (j > k && !o.done) {
          o.w = value;
          const input = $(`[data-in="w"][data-v="${i}:${j}"]`);
          if (input) { input.value = fmt(value); input.setAttribute('aria-invalid', 'false'); }
        }
      });
      save();
    }
  }
  if (t.id === 'reg-email') REG.email = t.value;
  if (t.id === 'reg-promo') REG.promo = t.value;
});
document.addEventListener('change', e => {
  const t = e.target;
  if(t.id==='cameraFileInput'){const file=t.files?.[0];t.value='';openCameraVideo(file);}
  if (t.id === 'restore-file' && t.files && t.files[0]) { restoreFile(t.files[0]); t.value = ''; }
});
document.addEventListener('focusout', e => {
  const t = e.target;
  if (t.id === 'rename') { const d = dayById(t.dataset.day); if (d) d.title = t.value.trim() || d.title; S.renaming = null; setTimeout(render, 0); }
});
document.addEventListener('keydown', e => {
  const id = e.target.id;
  if (e.key === 'Tab' && sheetTop()) {
    const dialog = $('[role="dialog"]', sheetTop()), focusable = $$('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]', dialog).filter(el => el.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) { e.preventDefault(); dialog.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { e.preventDefault(); first.focus(); }
  }
  if (e.key === 'Enter' && id === 'rename') e.target.blur();
  if (e.key === 'Enter' && id === 'reg-email') A['reg-go']();
  if (e.key === 'Enter' && id === 'promo') A['promo-go']();
  if (e.key === 'Escape' && $('#sheets').children.length) closeTop();
});


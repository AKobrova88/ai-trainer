'use strict';
/* ---------- camera tab: live coach and video check (both run in the camera page, results come back here) ---------- */
const hash = s => { let h = 0; for (const ch of norm(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
/* today's workout goes to the camera too: there you switch exercises and alternate sets (supersets) */
const b64u = t => btoa(unescape(encodeURIComponent(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function camPlan() {
  const W = S.workout; if (!W) return [];
  const seen = new Set(), out = [], labs = blockLabels(W.items);
  W.items.forEach((x, pos) => {
    if (x.sec && !x.cam) return;
    let k = x.base || 'own_' + hash(x.name);
    if (seen.has(k)) k = 'own_' + hash(x.name + pos);   // the same exercise twice in a day: count the second by name
    seen.add(k);
    const sets = x.sets || [], nextSet = sets.find(z => !z.done) || sets[0];
    /* [key, name, unit, weight, position, superset block ('' = on its own), sets left, label 1 / 2А] */
    out.push([k, x.name.slice(0, 60), x.sec ? 'time' : stepOf(x) ? 'w' : 'bw', nextSet ? nextSet.w : x.w || 0, pos, x.ss ? labs[pos].replace(/[А-Я]$/, '') : '', sets.filter(z => !z.done).length, labs[pos]]);
  });
  return out;
}
function camLink(it, mode = 'live') {
  const u = new URL(CAM_URL), plan = camPlan();
  u.searchParams.set('rev', CAMERA_REV);
  if (it) {
    const W = S.workout, pos = W ? W.items.findIndex(x => x === it || norm(x.name) === norm(it.name)) : -1, mine = plan.find(p => p[4] === pos);
    /* the camera knows technique for its own keys; anything else it still counts by name */
    u.searchParams.set('ex', mine ? mine[0] : it.base || 'own_' + hash(it.name));
    u.searchParams.set('n', it.name.slice(0, 60));
    u.searchParams.set('u', it.sec ? 'time' : stepOf(it) ? 'w' : 'bw');
    const w = it.sets && it.sets[0] ? it.sets[0].w : it.w;
    if (w) u.searchParams.set('w', String(w));
  }
  if (plan.length > 1) u.searchParams.set('plan', b64u(JSON.stringify(plan)));
  u.searchParams.set('cam', S.camFacing === 'back' ? 'back' : 'front');
  u.searchParams.set('theme', S.theme === 'bento' ? 'bento' : 'dusk');
  u.searchParams.set('l', S.profile.exp || 'normal');
  u.searchParams.set('mode', mode);
  u.searchParams.set('src', 'app');
  if (TG.inside() || /tgWebApp/.test(location.hash) || window.TelegramWebviewProxy) u.searchParams.set('tg', '1');
  if (SAME_SITE) u.searchParams.set('ret', location.pathname + '#from-camera');
  return u.href;
}
function camChoices() {
  const seen = new Set(), out = [];
  const add = it => { const k = norm(it.name); if (!seen.has(k) && !(it.sec && !it.cam)) { seen.add(k); out.push(it); } };
  if (S.workout) S.workout.items.forEach(add);
  const nd = nextDay(); if (nd) nd.items.forEach(add);
  S.program.days.forEach(d => d.items.forEach(add));
  return out;
}
function currentCamEx() {
  if (S.camEx) return S.camEx;
  const ch = camChoices();
  return ch.find(x => x.cam) || ch[0] || {name: CAT.bw_squat.n, base: 'bw_squat', w: 0, inc: 'bw'};
}
function viewCamera() {
  if (!canCamera()) return ['Камера', `
    <section class="camcard"><div class="hd"><span class="pi">${I.lock}</span><span><b>Камера-тренер — в подписке</b><span>Пробный период закончился</span></span></div>
      <p style="margin:0">Камера онлайн и разбор видео без лимитов — ${rub(PRICING.sub.price)} в месяц. Своя программа, дневник и прогресс работают и без подписки.</p>
      <button class="btn primary big" data-act="paywall" data-v="cam">Подписка и промокод</button></section>`];
  const it = currentCamEx();
  const vlog = S.videoLog.slice(0, 6);
  const q = v => { const r = v.n ? v.c / v.n : 0; return r >= .8 ? 'good' : r >= .5 ? 'fair' : 'bad'; };
  return ['Камера', `
    <section class="cam-entry" aria-label="Камера и видео">
      <a class="cam-entry-row" href="${esc(camLink(it))}" ${SAME_SITE ? '' : 'target="_blank" rel="noopener"'} data-act="cam-go">
        <span class="cam-entry-icon">${I.camera}</span><span class="grow"><b>Камера</b><small>${esc(it.name)}</small></span>${CHEV}
      </a>
      <a class="cam-entry-row" href="${esc(camLink(it, 'video'))}" ${SAME_SITE ? '' : 'target="_blank" rel="noopener"'} data-act="cam-go">
        <span class="cam-entry-icon">${I.video}</span><span class="grow"><b>Разбор видео</b><small>Из галереи</small></span>${CHEV}
      </a>
    </section>
    ${SAME_SITE ? '' : `<div class="note blue">${I.info}<span>Здесь, в предпросмотре, камера откроется в новой вкладке, и подходы оттуда нужно будет записать вручную. В установленной версии они вернутся сюда сами.</span></div>`}
    ${vlog.length ? `<div class="eyebrow">Недавние разборы</div><div class="vlog">${vlog.map(v => `<button class="vrow" data-act="vres" data-v="${v.id}"><span class="grow"><b>${esc(v.name)}</b><small>${ruDate(v.at)} · ${v.reps} ${plural(v.reps, 'повтор', 'повтора', 'повторов')}${v.mode === 'video' ? ' · видео' : ''}${v.partial ? ' · 3D, предварительно' : ''}</small></span>${v.n && !v.partial ? `<span class="q ${q(v)}">чисто ${v.c} из ${v.n}</span>` : ''}</button>`).join('')}</div>` : ''}`];
}
function camPickSheet() {
  const ch = camChoices();
  sheet('Упражнение для камеры', `${ch.length ? `<div class="eyebrow">Из твоей программы</div><div class="menu">${ch.map((it, i) => `<button class="cat-item" data-act="cam-set" data-v="${i}"><b>${esc(it.name)}</b>${it.cam ? '<span class="badge cam">техника</span>' : '<span class="badge">счёт</span>'}</button>`).join('')}</div>` : ''}
    <button class="btn" data-act="cam-cat">${I.plus}Другое из справочника</button>
    <p class="hint">«Техника» — камера знает правильное движение и подсказывает. «Счёт» — считает повторы и следит за амплитудой и темпом.</p>`);
  S.camChoices = ch;
}
/* results from the camera page: sets go into today's workout or the diary; video checks into «Недавние разборы» */
function processInbox() {
  let box;
  try { box = JSON.parse(localStorage.getItem(INBOX) || '[]'); } catch (e) { box = []; }
  if (!Array.isArray(box) || !box.length) return;
  try { localStorage.removeItem(INBOX); } catch (e) { /* ignore */ }
  const msgs = box.map(applyCamResult).filter(Boolean);
  if (S.stage !== 'app' && S.user) S.stage = 'app';
  render();
  if (msgs.length > 1) {
    const ok = box.filter(m => m && Array.isArray(m.sets) && m.sets.some(x => x && x.r > 0));
    toast('Из камеры: ' + ok.map(m => `${(m.name || 'упражнение').length > 22 ? m.name.slice(0, 21) + '…' : m.name} — ${m.sets.filter(x => x && x.r > 0).length}`).join(', '));
  } else if (msgs.length) toast(msgs[0]);
}
function applyCamResult(m) {
  if (!m || !Array.isArray(m.sets)) return null;
  const sets = m.sets.filter(s => s && s.r > 0).map(s => ({w: s.w || 0, r: s.r, n: s.partial ? 0 : (s.n || 0), c: s.partial ? 0 : (s.c || 0), g: s.partial ? [] : (s.g || []), cue: s.cue || '', ft: s.ft || [], partial: !!s.partial, analysisMode: s.analysisMode === '3d' ? '3d' : '2d', note: s.note || ''}));
  if (!sets.length) return null;
  const name = m.name || (CAT[m.ex] ? CAT[m.ex].n : 'Упражнение');
  const faults = {};
  for (const s of sets) for (const f of s.ft) { const k = f.t || f.id; faults[k] = faults[k] || {t: f.t, c: f.c, n: 0}; faults[k].n += f.n || 1; }
  const partial = sets.some(s => s.partial);
  const v = {id: nid('v'), at: m.at || Date.now(), ex: m.ex, pos: Number.isInteger(m.pos) ? m.pos : null, name, mode: m.mode || 'live', sets, reps: sets.reduce((a, s) => a + (s.n || s.r), 0), n: sets.reduce((a, s) => a + s.n, 0), c: sets.reduce((a, s) => a + s.c, 0), g: partial ? [] : sets.flatMap(s => s.g), faults: Object.values(faults).sort((a, b) => b.n - a.n), partial, logged: false};
  S.videoLog.unshift(v); S.videoLog = S.videoLog.slice(0, 30);
  if (m.mode === 'video' && !S.workout) return partial ? `3D-разбор готов: ${v.reps} повторов, предварительные подсказки` : v.n ? `Разбор видео готов: чисто ${v.c} из ${v.n}` : `Посчитано повторов: ${v.reps}, без оценки техники`;
  return logCamSets(v);
}
function logCamSets(v) {
  const sets = v.sets.map(s => ({w: s.w, r: s.r, c: s.c, n: s.n, partial: !!s.partial, analysisMode: s.analysisMode, note: s.note || ''}));
  v.logged = true;
  if (S.workout) {
    const W = S.workout, at = v.pos != null && W.items[v.pos], same = at && (norm(at.name) === norm(v.name) || (v.ex && at.base === v.ex));
    const i = same ? v.pos : W.items.findIndex(it => norm(it.name) === norm(v.name) || (v.ex && it.base === v.ex));
    if (i >= 0) {
      const it = W.items[i];
      let k = 0;
      for (const s of sets) { const slot = it.sets.find(x => !x.done); if (slot) Object.assign(slot, {...s, w: s.w || slot.w, done: true}); else it.sets.push({...s, w: s.w || (it.sets[0] && it.sets[0].w) || 0, done: true}); k++; }
      W.active = i; S.tab = 'today';
      return `Из камеры: ${k} ${plural(k, 'подход', 'подхода', 'подходов')} — «${it.name}»`;
    }
  }
  const today = S.diary.find(w => w.camOnly && sameDay(w.date, Date.now()));
  const entry = today || {id: nid('w'), date: Date.now(), title: 'С камерой', dur: 0, camOnly: true, items: []};
  if (!today) S.diary.unshift(entry);
  const e = entry.items.find(x => norm(x.name) === norm(v.name));
  if (e) e.sets.push(...sets); else entry.items.push({name: v.name, base: CAT[v.ex] ? v.ex : null, sets});
  return `Записала в дневник: ${sets.length} ${plural(sets.length, 'подход', 'подхода', 'подходов')} — «${v.name}»`;
}
function videoSheet(id) {
  const v = S.videoLog.find(x => x.id === id); if (!v) return;
  const partial = v.partial || v.sets.some(s => s.partial);
  const g = partial ? [] : v.g.length ? v.g : v.sets.flatMap(s => Array.from({length: s.n}, (_, i) => i < s.c ? 0 : 1));
  sheet(v.name, `<div class="hint">${ruDate(v.at, {day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'})} · ${v.mode === 'video' ? 'разбор видео' : 'камера онлайн'}</div>
    <div class="kpis"><div class="stat"><b>${v.reps}</b><span>повторов</span></div>${v.n && !partial ? `<div class="stat"><b>${v.c}</b><span>чистых</span></div>` : '<div class="stat"><b>—</b><span>без общей оценки</span></div>'}<div class="stat"><b>${v.sets.length}</b><span>${plural(v.sets.length, 'подход', 'подхода', 'подходов')}</span></div></div>
    ${partial ? '<p class="hint">3D: предварительные подсказки по видимым суставам. Скрытые части тела и контакт с полом не проверены.</p>' : ''}
    ${g.length ? `<div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Повторы по порядку</div><div class="stripe" role="img" aria-label="${g.filter(x => !x).length} чистых из ${g.length}">${g.map(x => `<i class="${x === 2 ? 'b' : x === 1 ? 'w' : ''}"></i>`).join('')}</div><div class="legend" style="margin-top:8px"><span><i style="background:var(--good-strong)"></i>чисто</span><span><i style="background:var(--warn)"></i>поправить</span><span><i style="background:var(--bad)"></i>грубая ошибка</span></div></div>` : ''}
    ${v.faults.length ? `<div class="card pad">${v.faults.map(f => `<div class="fault"><span class="n">${f.n} ${plural(f.n, 'повтор', 'повтора', 'повторов')}</span><span><b>${esc(f.t || 'Техника')}</b>${f.c ? `<span class="hint">${esc(f.c)}</span>` : ''}</span></div>`).join('')}</div>` : `<p class="coach up">${partial ? 'В доступных проверках замечаний нет.' : v.n ? 'Ошибок не нашла — чистая техника.' : 'Повторы посчитаны. Техника не оценивалась.'}</p>`}`,
    `<button class="btn" data-act="close">Закрыть</button>${v.logged ? '<button class="btn" disabled>Уже в дневнике</button>' : `<button class="btn primary" data-act="vres-log" data-v="${v.id}">Записать в дневник</button>`}`);
}


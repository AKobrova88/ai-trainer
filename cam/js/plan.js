'use strict';
/* ---------- today's workout from the app ---------- */
try { localStorage.removeItem('aitrainer.alt'); } catch (e) { /* old switch, not used */ }
const planName = k => { const p = PLAN.find(x => x.k === k); return (p && p.n) || (EX.ex[k] && EX.ex[k].name) || ''; };
const short = s => s.length > 24 ? s.slice(0, 23) + '…' : s;
function setsOf(k) { if (k === state.ex) return state.sets; const all = store.get(SETS_KEY, {}); return all[k] && all[k].date === today() ? all[k].sets : []; }
const doneOf = k => setsOf(k).filter(s => s.r > 0).length;
const leftOf = p => p.s == null ? Infinity : Math.max(0, p.s - doneOf(p.k));
const groupOf = p => p && p.g ? PLAN.filter(x => x.g === p.g) : (p ? [p] : []);
const spoken = p => (p.lab && p.g ? p.lab + ', ' : '') + p.n;
/* supersets come only from the program (1А, 1Б…); everything else goes one by one, in order */
function nextStep(p) {
  const G = groupOf(p);
  if (G.length > 1) {
    const at = G.indexOf(p), order = [...G.slice(at + 1), ...G.slice(0, at + 1)], nx = order.find(x => leftOf(x) > 0);
    if (nx) return nx === p ? { p: nx, rest: true } : { p: nx, rest: G.indexOf(nx) <= at, round: true };
  } else if (leftOf(p) > 0) return null;
  const after = PLAN.slice(PLAN.indexOf(G[G.length - 1]) + 1).concat(PLAN.slice(0, PLAN.indexOf(G[0])));
  const nx = after.find(x => leftOf(x) > 0);
  return nx ? { p: nx, rest: true, done: true } : { end: true };
}
function afterSet() {
  const p = PLAN.find(x => x.k === state.ex); if (!p || PLAN.length < 2 && p.s == null) return;
  const st = nextStep(p); if (!st) return;
  const from = state.ex;
  if (st.end) { Voice.queue('Все упражнения тренировки готовы. Запиши их в дневник'); return; }
  if (st.p === p) return;
  const say = st.done ? 'Готово: ' + doneOf(p.k) + ' ' + plural(doneOf(p.k), 'подход', 'подхода', 'подходов') + '. Отдыхай. Дальше — ' + spoken(st.p)
    : st.rest ? 'Круг готов. Отдых, потом ' + spoken(st.p) : 'Дальше — ' + spoken(st.p) + ', без отдыха';
  setTimeout(() => { if (state.ex === from) { switchTo(st.p.k, false); Voice.queue(say); } }, 1500);
}
function renderPlan() {
  const box = $('#planBox');
  if (!box || !PLAN.length) { if (box) box.hidden = true; return; }
  box.hidden = false;
  $('#planChips').innerHTML = PLAN.map(p => { const c = doneOf(p.k), fin = p.s != null && c >= p.s; return '<button type="button" class="' + (p.g ? 'ss' : '') + (fin ? ' fin' : '') + '" data-k="' + esc(p.k) + '" aria-pressed="' + (p.k === state.ex) + '">' + (p.lab ? '<span class="lb">' + esc(p.lab) + '</span>' : '') + '<span class="nm">' + esc(p.n) + '</span>' + (c ? '<b aria-label="подходов">' + c + (p.s ? '/' + p.s : '') + '</b>' : '') + '</button>'; }).join('');
  const info = $('#planInfo'), p = PLAN.find(x => x.k === state.ex), G = groupOf(p);
  if (info) {
    if (G.length > 1) { info.hidden = false; info.innerHTML = '<b>' + (G.length === 2 ? 'Суперсет' : 'Круг') + ' ' + G.map(x => esc(x.lab)).join(' + ') + '</b> — по подходу по очереди, переключу сама, отдых после круга'; }
    else if (p && p.s) { info.hidden = false; info.textContent = 'По плану ' + p.s + ' ' + plural(p.s, 'подход', 'подхода', 'подходов') + ', потом перейду к следующему упражнению'; }
    else info.hidden = true;
  }
  const cur = $('#planChips [aria-pressed="true"]');
  if (cur) { const row = $('#planChips'); row.scrollLeft = Math.max(0, cur.offsetLeft - row.offsetWidth / 2 + cur.offsetWidth / 2); }
}
function switchTo(k, manual) {
  if (!k || k === state.ex || !EX.ex[k]) return;
  const A = state.analyzer;
  if (A && A.reps.length && !A.setEnded) { A.endSet(); processEvents(A.drain()); }   // a running set belongs to the old exercise
  saveSets();
  setExercise(k);
  if (manual) Voice.say(info().name, 'ex', true);
}
$('#planChips').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) switchTo(b.dataset.k, true); });
/* automated checks only (?debug=1): a finished set without a camera */
if (qp.get('debug') === '1') window.__camTest = { set(r) { state.sets.push({ r, n: r, c: r, f: {}, w: weighted() ? urlW() : null, cue: '', g: [], file: false, note: '' }); saveSets(); renderSets(); renderMain(); afterSet(); }, ex: () => state.ex };
el.setList.addEventListener('input', e => {
  const li = e.target.closest('.set'); if (!li) return;
  const s = state.sets[Number(li.dataset.i)];
  if (e.target.classList.contains('w')) s.w = num(e.target.value);
  if (e.target.classList.contains('r')) { const v = num(e.target.value); s.r = v == null ? 0 : Math.round(v); }
  saveSets(); renderSend();
});
el.setList.addEventListener('click', e => {
  if (e.target.id === 'addSet') {
    const last = state.sets[state.sets.length - 1];
    state.sets.push({ r: last ? last.r : (isHold() ? 30 : 10), n: 0, c: 0, f: {}, w: weighted() ? (last ? last.w : urlW()) : null, note: '' });
    saveSets(); renderSets();
    const rows = el.setList.querySelectorAll('.set'), inputs = rows.length ? rows[rows.length - 1].querySelectorAll('input') : [];
    if (inputs.length) inputs[inputs.length - 1].focus();
    return;
  }
  const b = e.target.closest('.set-del'); if (!b) return;
  state.sets.splice(Number(b.closest('.set').dataset.i), 1); saveSets(); renderSets();
});
/* Telegram: the whole list goes to the diary in one message (works when the app was opened from the bot's 🎥 button). */
function tg() { return window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData !== undefined && document.documentElement.classList.contains('in-telegram') ? window.Telegram.WebApp : null; }
function canSend() { const W = tg(); return !!(W && typeof W.sendData === 'function' && !(W.initDataUnsafe && W.initDataUnsafe.query_id)); }
function chatText() {
  return state.sets.filter(s => s.r > 0).map(s => weighted() && s.w ? kgTxt(s.w).replace(',', '.') + 'x' + s.r : String(s.r)).join(' ');
}
const appKeys = () => { const l = PLAN.map(p => p.k); if (!l.includes(state.ex)) l.push(state.ex); return l; };
function resultHandoff() {
  if (RET) return appKeys().some(k => setsOf(k).some(s => s.r > 0)) ? 'app' : '';
  return canSend() && state.sets.some(s => s.r > 0) ? 'bot' : '';
}
function renderSend() {
  const ok = state.sets.filter(s => s.r > 0);
  el.sendBox.innerHTML = '';
  if (ok.length && (RET || canSend())) {
    if (weighted() && ok.some(s => !s.w)) el.sendBox.innerHTML = '<p>Укажи вес, чтобы точнее отслеживать прогресс.</p>';
  } else if (ok.length && tg()) {
    el.sendBox.innerHTML = '<p>Этот способ открытия камеры не поддерживает запись в дневник. Можно скопировать итог для бота.</p>' +
      '<button class="sub-btn" type="button" id="copyBtn">Скопировать: ' + esc(chatText()) + '</button>';
  } else if (ok.length) {
    el.sendBox.innerHTML = '<p>Подходы сохранены на этом телефоне до конца дня.</p>';
  }
  renderMain();
}
function toApp() {
  if (state.on) stopCamera();
  saveSets();
  const entries = [];
  for (const k of appKeys()) {
    const ss = setsOf(k).filter(s => s.r > 0); if (!ss.length || !EX.ex[k]) continue;
    const free = FREE_KEYS.has(k) || ss.every(s => s.countOnly), A = k === state.ex && state.analyzer ? state.analyzer : free ? new AT.FreeAnalyzer() : AT.analyzerFor(k);
    const wtd = !['bw', 'time'].includes(EX.ex[k].inc), p = PLAN.find(x => x.k === k);
    const sets = ss.map(s => {
      const ft = free ? [] : Object.keys(s.f || {}).sort((a, b) => s.f[b] - s.f[a]).slice(0, 3).map(id => { const m = A ? A.meta(id) : { title: 'Техника', cue: '' }; return { id, t: m.title, c: m.cue, n: s.f[id] }; });
      return { w: wtd ? (s.w || 0) : 0, r: s.r, n: free ? 0 : (s.n || 0), c: free ? 0 : (s.c || 0), g: free ? [] : (s.g || []), cue: free ? '' : (s.cue || ''), ft,
        partial: !!s.partial, analysisMode: s.analysisMode, note: s.note || '' };
    });
    entries.push({ id: 'c' + Date.now().toString(36) + entries.length, at: Date.now(), ex: k, name: p ? p.n : EX.ex[k].name, pos: p ? p.pos : null, free, mode: ss.some(s => s.file) ? 'video' : 'live', sets });
  }
  let box = []; try { box = JSON.parse(localStorage.getItem(APP_INBOX) || '[]'); if (!Array.isArray(box)) box = []; } catch (err) { box = []; }
  box.push(...entries);
  try { localStorage.setItem(APP_INBOX, JSON.stringify(box)); } catch (err) { el.sendBox.insertAdjacentHTML('afterbegin', '<p>Не получилось сохранить на телефоне. Освободи место и попробуй ещё раз.</p>'); return; }
  const all = store.get(SETS_KEY, {}); for (const k of appKeys()) delete all[k]; store.set(SETS_KEY, all);
  state.sets = [];
  location.href = RET;
}
function commitResults() {
  const destination = resultHandoff();
  if (destination === 'app') return toApp();
  if (destination === 'bot') {
    const W = tg(), A = state.analyzer;
    const sets = state.sets.filter(s => s.r > 0).map(s => {
      const f = {}; Object.keys(s.f || {}).sort((a, b) => s.f[b] - s.f[a]).slice(0, 3).forEach(k => { f[k] = s.f[k]; });
      return isFree() || s.partial || s.countOnly ? { w: weighted() ? s.w : null, r: s.r, n: 0, c: 0, f: {} } : { w: weighted() ? s.w : null, r: s.r, n: s.n, c: s.c, f };
    });
    const payload = JSON.stringify({ v: 2, ex: state.ex, view: (A && A.view) || state.view, sets });
    try { W.sendData(payload); state.sets = []; saveSets(); renderSets(); }
    catch (err) { el.sendBox.insertAdjacentHTML('afterbegin', '<p>Не получилось отправить. Скопируй результат и пришли боту сообщением.</p>'); }
  }
}
el.sendBox.addEventListener('click', async e => {
  if (e.target.closest('#copyBtn')) {
    const text = chatText();
    try { await navigator.clipboard.writeText(text); e.target.closest('#copyBtn').textContent = 'Скопировано — вставь в чат с ботом'; }
    catch (err) { e.target.closest('#copyBtn').textContent = text; }
  }
});


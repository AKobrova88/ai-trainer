'use strict';
/* ---------- live UI ---------- */
const STATUS_TEXT = {
  bar_lost: 'Потеряла точку — нажми на блин на экране ещё раз',
  nobody: 'Встань в кадр целиком — от головы до стоп',
  world_lost: 'Недостаточно надёжных 3D-точек. Открой суставы и замри в исходном положении',
  turn: 'Повернись к камере боком',
  turn_front: 'Встань к камере лицом',
  plank: 'Прими упор лёжа, чтобы были видны плечи, таз и ноги'
};
function calibText() {
  const fam = AT.family(state.ex);
  if (fam === 'squat') return 'Встань прямо и замри на секунду';
  if (fam === 'pushup') return 'Замри в упоре на прямых руках';
  if (isHold()) return 'Прими положение — время пойдёт само';
  return 'Замри на секунду в начальном положении';
}
/* Say what exactly is missing, so the person knows whether to step back, lower the phone or turn. */
function missingHint(kp) {
  if (!kp) return 'Не вижу человека. Проверь свет и направь камеру на рабочие суставы';
  const f = state.frame;
  const visible = i => {const p=kp[i];return p && p.score>.5 && Number.isFinite(p.x) && Number.isFinite(p.y) && (!f || (p.x>=0 && p.y>=0 && p.x<=f.W && p.y<=f.H));};
  const chain=AT.requiredChains(state.ex).slice().sort((a,b)=>b.filter(visible).length/b.length-a.filter(visible).length/a.length)[0] || [];
  const names={11:'плечо',12:'плечо',13:'локоть',14:'локоть',15:'кисть',16:'кисть',23:'таз',24:'таз',25:'колено',26:'колено',27:'стопа',28:'стопа',31:'носок стопы',32:'носок стопы'};
  const missing=[...new Set(chain.filter(i=>!visible(i)).map(i=>names[i]||'сустав'))];
  return missing.length ? 'Закрыты или вне кадра: ' + missing.join(', ') + '. Открой обзор рабочей стороны'
    : 'Рабочие суставы видны, но положение пока не распознано';
}
function cueState() {
  const snap = state.snap, now = performance.now(), A = state.analyzer;
  if (state.bar && state.bar.picking) return { cls: 'info', text: 'Нажми на блин, стопку грузов или каретку' };
  if (state.bar && state.on && state.file && state.analyzing) return { cls: 'info', text: 'Слежу за весом · ' + (state.prog || 0) + '%' + (snap && snap.reps ? ' · повторов: ' + snap.reps : '') };
  if (state.on && state.file && !state.analyzing && state.snap) {
    const r = state.videoSummary;
    return {cls:'info',text:r ? 'Видео: '+(isHold()?'секунд':'повторов')+' — '+r.reps+' · подходов — '+r.sets+(r.warning ? '. '+r.warning : '. Проверь результат ниже') : 'Видео обработано. Проверь результат ниже'};
  }
  if (state.on && state.file && state.analyzing) return { cls: 'info', text: 'Разбираю видео · ' + (state.prog || 0) + '%' + (snap && snap.reps ? ' · повторов: ' + snap.reps : '') };
  if (state.on && state.recOnly) { const s = Math.round(Rec.secs()); return { cls: 'info', text: '● Запись ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' · ' + (!snap || snap.status === 'nobody' ? 'встань в кадр целиком' : 'вижу тебя целиком') }; }
  if (!state.on) return state.flash && state.flash.until > now ? state.flash : { cls: 'tip', text: info().tips[0] };
  if (!snap) return { cls: 'info', text: state.detector ? 'Включаю камеру…' : 'Готовлю тренера…' };
  if (state.preflight) {
    const f=state.frame,checks=checkSetup(f&&f.kp,f&&f.W,f&&f.H,snap,state.ex);
    return {cls:'info',text:'Счёт пока не включён. '+setupReason(checks,snap)};
  }
  if (snap.status === 'nobody') return { cls: 'info', text: missingHint(state.frame && state.frame.kp) };
  if (snap.live.length) { const m = A.meta(snap.live[0]); return { cls: m.pen >= 25 ? 'bad' : 'warn', text: m.cue }; }
  if (state.flash && state.flash.until > now) return state.flash;
  if (STATUS_TEXT[snap.status]) return { cls: 'info', text: STATUS_TEXT[snap.status] };
  if (snap.status === 'calib') return { cls: 'info', text: calibText() };
  if (snap.phase === 'hold') return { cls: snap.partial ? 'info' : 'good', text: snap.partial ? 'Держи! 3D-оценка по видимым суставам' : 'Держи! Ровно, дыши' };
  if (snap.phase === 'top') return { cls: 'info', text: snap.reps && !snap.setEnded ? 'Следующий повтор' : 'Готово. Начинай' };
  return { cls: 'info', text: 'Под контролем' };
}
let lastStatus = '', lastStatusSay = 0, calibSaid = false, turnSince = null;
function speakStatus() {
  const snap = state.snap; if (!state.on || !snap || state.file) { lastStatus = ''; turnSince = null; return; }
  const now = performance.now(), s = snap.status;
  const text = s === 'nobody' ? missingHint(state.frame && state.frame.kp) : STATUS_TEXT[s] || (s === 'calib' ? calibText() : null);
  if (s !== lastStatus) {
    if (lastStatus === 'nobody') Voice.say('Вижу тебя', 'see', false, true);
    lastStatus = s; lastStatusSay = now - 4200; calibSaid = false;   // the first hint 2 s after the change, then every 6 s
  }
  if (text && Voice.on && !speechSynthesis.speaking) {
    if (s === 'calib') { if (!calibSaid) { Voice.say(text, null, true); calibSaid = true; } }   // said once
    else if (now - lastStatusSay > 6000) { Voice.say(text, null, true); lastStatusSay = now; }
  }
  if (state.preflight) return;
  /* the phone stands at an angle the rules cannot judge: keep counting reps instead of waiting */
  if (!isFree() && !state.fallback && (s === 'turn' || s === 'turn_front')) {
    if (turnSince == null) turnSince = now;
    else if (now - turnSince > 5000) {
      if (state.analyzer.reps.length && !state.analyzer.setEnded) {state.analyzer.endSet();processEvents(state.analyzer.drain());}
      turnSince = null; state.fallback = true; newAnalyzer(); renderMain();
      const msg = 'Считаю повторы. Для разбора техники поставь телефон ' + (s === 'turn' ? 'сбоку' : 'спереди');
      state.flash = { cls: 'info', text: msg, until: now + 6000 }; Voice.say(msg, 'fallback', true);
    }
  } else turnSince = null;
}
/* Setup check: pure pose visibility and analyzer-state checks, also covered by tests. */
function checkSetup(kp, width, height, snap, key = null) {
  const visible = i => { const p = kp && kp[i]; return !!(p && p.score > .5 && Number.isFinite(p.x) && Number.isFinite(p.y) && width > 0 && height > 0 && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height); };
  const body = key ? AT.requiredChains(key).some(chain=>chain.every(visible))
    : [[0,7,8],[11,12],[13,14],[15,16],[23,24],[25,26],[27,28]].every(pair => pair.some(visible));
  const angle = body && !!snap && !['nobody','world_lost','turn','turn_front'].includes(snap.status);
  const position = angle && snap.status === 'track' && ['top','hold'].includes(snap.phase);
  return {body, angle, position, ready: body && angle && position};
}
/* End setup check. */
function setupReason(checks,snap) {
  if (!checks.body) return missingHint(state.frame&&state.frame.kp);
  if (!checks.angle) return snap && snap.status==='world_lost' ? '3D-точки неустойчивы. Открой суставы или выбери «Только счёт повторов» ниже' : STATUS_TEXT[snap&&snap.status] || 'Не удалось распознать рабочие суставы';
  if (!checks.position) return calibText();
  return 'Замри ещё на мгновение — начну автоматически';
}
function renderSetup() {
  const panel = $('#setupCheck'), active = state.on && state.preflight && !state.file && !state.recOnly;
  panel.hidden = !active;
  $('#setupCount').hidden = !active; $('#setupBar').hidden = !active;
  if (!active) return;
  const f = state.frame, checks = checkSetup(f && f.kp, f && f.W, f && f.H, state.snap, state.ex);
  for (const item of panel.querySelectorAll('[data-setup]')) item.dataset.ok = String(checks[item.dataset.setup]);
  $('#setupStart').disabled = !state.preflightReady;
  $('#setupCount').disabled = !checks.body;
  const text = setupReason(checks,state.snap) + '. Счёт включится после проверки автоматически.';
  if ($('#setupStatus').textContent !== text) $('#setupStatus').textContent = text;
}
function renderLive() {
  renderSetup();
  speakStatus();
  const cs = cueState();
  el.cue.className = 'cue ' + cs.cls;
  if (el.cueText.textContent !== cs.text) el.cueText.textContent = cs.text;
  const snap = state.snap, hold = isHold();
  const analysisText = state.bar ? 'Версия 2.6 · Счёт по движению веса: повторы, амплитуда и темп. Положение тела не оценивается'
    : state.fallback ? 'Версия 2.6 · Только счёт повторов по видимому движению. Техника не оценивается'
    : snap && snap.analysisMode === '2d'
    ? 'Версия 2.6 · 2D-режим: модель не вернула 3D-точки. Для этого упражнения нужен ракурс ' + viewWord() + '.'
    : 'Версия 2.6 · 3D-анализ на устройстве. Оценка предварительная; скрытые суставы не проверены.';
  const analysisInfo = $('#analysisInfo');
  if (analysisInfo.textContent !== analysisText) analysisInfo.textContent = analysisText;
  el.hud.hidden = !state.on || !!state.recOnly || state.preflight;
  if (snap) {
    const n = hold ? Math.floor(snap.held || 0) : (snap.setEnded ? 0 : snap.reps);
    el.repNum.textContent = n;
    el.repLabel.textContent = hold ? plural(n, 'секунда', 'секунды', 'секунд') : plural(n, 'повтор', 'повтора', 'повторов');
  }
}
const ICON_PLAY = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6 4.5v11l9-5.5-9-5.5z"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';
function renderMain() {
  const A = state.analyzer, inSet = state.on && A && A.reps.length && !A.setEnded;
  const b = el.main;
  $('#altBtns').hidden = state.on;
  if (state.on && state.preflight) { b.className = 'main-btn secondary'; b.innerHTML = 'Выключить камеру'; return; }
  if (state.on && state.recOnly) { b.className = 'main-btn rec'; b.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="2"/></svg>Стоп — разобрать видео'; return; }
  b.className = 'main-btn' + (inSet ? ' stop' : state.on ? ' secondary' : '');
  b.innerHTML = !state.on ? ICON_PLAY + (state.sets.length ? 'Следующий подход с камерой' : 'Начать подход с камерой')
    : inSet ? ICON_CHECK + 'Подход закончен' : state.file ? 'Закрыть видео' : 'Выключить камеру';
}
el.main.addEventListener('click', () => {
  const A = state.analyzer;
  if (!state.on) { state.recOnly = false; return startCamera(); }
  if (state.preflight) return stopCamera();
  if (state.recOnly) return finishRecording();
  if (A && A.reps.length && !A.setEnded) { A.endSet(); processEvents(A.drain()); return; }
  if (!state.file && A && !A.isBar && !A.reps.length && el.msg.hidden) return showLiveHelp('Подход не распознан', 'Повторы не удалось определить. ' + (state.snap && state.snap.status==='world_lost' ? STATUS_TEXT.world_lost : missingHint(state.frame&&state.frame.kp)));
  stopCamera();
});
$('#recBtn').addEventListener('click', () => startRecordMode());
function beginPreparedSet(countOnly = false) {
  if (!state.on || !state.preflight) return;
  const f = state.frame;
  if (countOnly ? !checkSetup(f && f.kp, f && f.W, f && f.H, state.snap, state.ex).body : !state.preflightReady) return;
  const previous=state.analyzer;
  if (countOnly) state.fallback = true;
  state.preflight = false;
  newAnalyzer();
  if (!countOnly && previous && previous.cal && previous.status==='track') {
    Object.assign(state.analyzer,{cal:previous.cal,analysisMode:previous.analysisMode,worldExpected:previous.worldExpected,
      view:previous.view,side:previous.side,phase:'top',status:'track'});
  }
  Rec.start(state.stream); attemptT0 = performance.now(); helperAt = 12000;
  state.flash = null; lastStatus = ''; renderMain(); renderLive();
  if (Voice.on) Voice.say(countOnly ? 'Считаю повторы, без оценки техники' : 'Счёт включён. Начинай подход', 'start', true);
}
$('#setupStart').addEventListener('click', () => beginPreparedSet());
$('#setupCount').addEventListener('click', () => beginPreparedSet(true));
$('#setupBar').addEventListener('click', () => barPick('live'));
$('#vidBtn').addEventListener('click', () => pickVideo());
$('#voiceSel').addEventListener('change', e => { store.set(VOICE_KEY, e.target.value); pickVoice(); });
$('#voiceTest').addEventListener('click', () => { const was = Voice.on; Voice.on = true; Voice.say('Привет! Отойди подальше, чтобы было видно всё тело. Начинаем подход.', 'test', true); Voice.on = was; });


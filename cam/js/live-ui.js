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
const PREPARE_MS = 12000;
function startPreparation(announce = true) {
  const now = performance.now();
  state.preflight = true; state.preflightReady = false; state.preflightSince = null;
  state.prepareUntil = now + PREPARE_MS; state.preparedCalibration = false;
  state.preparationHintAt = now; state.startAnnounced = false;
  if (announce) Voice.say('У тебя двенадцать секунд на подготовку. Поставь телефон и встань в кадр.', 'prepare', true);
}
function preparationRemaining() {
  if (state.prepareUntil == null) startPreparation(false);
  return Math.max(0, Math.ceil((state.prepareUntil - performance.now()) / 1000));
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
  if (state.on && state.file && !state.analyzing && (state.snap || state.videoSummary)) {
    const r = state.videoSummary;
    return {cls:'info',text:r ? 'Видео: '+(isHold()?'секунд':'повторов')+' — '+r.reps+' · подходов — '+r.sets+(r.warning ? '. '+r.warning : '. Проверь результат ниже') : 'Видео обработано. Проверь результат ниже'};
  }
  if (state.on && state.file && state.analyzing) return { cls: 'info', text: (state.recognizingVideo ? 'Определяю упражнение' : 'Разбираю видео') + ' · ' + (state.prog || 0) + '%' + (snap && snap.reps ? ' · повторов: ' + snap.reps : '') };
  if (state.on && state.recOnly) { const s = Math.round(Rec.secs()); return { cls: 'info', text: '● Запись ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' · ' + (!snap || snap.status === 'nobody' ? 'встань в кадр целиком' : 'вижу тебя целиком') }; }
  if (state.cameraRequest) return {cls:'info', text:'Открываю камеру…'};
  if (!state.on && state.cameraDenied) return {cls:'info', text: IN_TG
    ? 'Разреши Telegram доступ к камере в настройках телефона или выбери видео.'
    : 'Разреши камеру в настройках сайта или выбери видео.'};
  if (!state.on) return state.flash && state.flash.until > now ? state.flash : { cls: 'tip', text: info().tips[0] };
  if (state.preflight && preparationRemaining()) return {cls:'info', text:'Подготовка · ' + preparationRemaining() + ' с. Счёт ещё не идёт'};
  if (!el.msg.hidden && el.msg.dataset.loading === 'true') return { cls: 'info', text: 'Держи рабочие суставы в кадре' };
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
let lastStatus = '', lastStatusSay = -Infinity, turnSince = null;
function speakStatus() {
  const snap = state.snap; if (!state.on || !snap || state.file) { lastStatus = ''; turnSince = null; return; }
  const now = performance.now(), s = snap.status;
  if (!el.msg.hidden || state.recOnly) return;
  if (state.preflight) {
    if (preparationRemaining() || now - state.preparationHintAt < PREPARE_MS) return;
    const f = state.frame, checks = checkSetup(f && f.kp, f && f.W, f && f.H, snap, state.ex);
    const hint = !checks.body ? missingHint(f && f.kp) : !checks.angle && s !== 'calib' ? setupReason(checks, snap) : calibText();
    if (Voice.say(hint, 'preparation-hint', false, true)) state.preparationHintAt = now;
    return;
  }
  const text = s === 'nobody' ? missingHint(state.frame && state.frame.kp) : STATUS_TEXT[s] || (s === 'calib' ? calibText() : null);
  if (s !== lastStatus) {
    lastStatus = s;
  }
  if (text && now - lastStatusSay >= PREPARE_MS) {
    if (Voice.say(text, 'position-hint', false, true)) lastStatusSay = now;
  }
  /* the phone stands at an angle the rules cannot judge: keep counting reps instead of waiting */
  if (!isFree() && !state.fallback && !AT.isLunge(state.ex) && (s === 'turn' || s === 'turn_front')) {
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
  if (!checks.angle) return snap && snap.status==='world_lost' ? '3D-точки неустойчивы. Открой суставы или выбери «Только счёт повторов» в меню «Ещё»' : STATUS_TEXT[snap&&snap.status] || 'Не удалось распознать рабочие суставы';
  if (!checks.position) return calibText();
  return 'Замри ещё на мгновение — начну автоматически';
}
function renderSetup() {
  const active = state.on && state.preflight && !state.file && !state.recOnly;
  const count = $('#setupCount'), f = state.frame;
  count.hidden = !active;
  count.disabled = !active || !checkSetup(f && f.kp, f && f.W, f && f.H, state.snap, state.ex).body;
}
function renderLive() {
  renderSetup();
  speakStatus();
  Coaching.flush();
  const cs = cueState();
  el.cue.className = 'cue ' + cs.cls;
  if (el.cueText.textContent !== cs.text) el.cueText.textContent = cs.text;
  const snap = state.snap, hold = isHold();
  const videoExercise = $('#videoExercise');
  videoExercise.hidden = !state.videoExercise;
  if (videoExercise.textContent !== (state.videoExercise || '')) videoExercise.textContent = state.videoExercise || '';
  const analysisText = state.bar ? 'Счёт по движению веса: повторы, амплитуда и темп. Положение тела не оценивается'
    : state.fallback || isFree() ? 'Только счёт повторов по видимому движению. Техника не оценивается'
    : snap && snap.analysisMode === '2d'
    ? '2D-режим: модель не вернула 3D-точки. Для этого упражнения нужен ракурс ' + viewWord() + '.'
    : '3D-анализ на устройстве. Оценка предварительная; скрытые суставы не проверены.';
  const analysisInfo = $('#analysisInfo');
  const versionedAnalysis = 'Версия 2.9.3 · ' + analysisText;
  if (analysisInfo.textContent !== versionedAnalysis) analysisInfo.textContent = versionedAnalysis;
  el.hud.hidden = !state.on || !!state.recOnly || state.preflight;
  if (snap) {
    const n = hold ? Math.floor(snap.held || 0) : (snap.setEnded ? 0 : snap.reps);
    el.repNum.textContent = n;
    el.repLabel.textContent = hold ? plural(n, 'секунда', 'секунды', 'секунд') : plural(n, 'повтор', 'повтора', 'повторов');
  }
}
function cameraAction() {
  const A = state.analyzer;
  if (state.cameraRequest || (!el.msg.hidden && el.msg.dataset.loading === 'true') || state.analyzing || state.file && !state.on)
    return ['cancel', 'Отменить', 'secondary'];
  if (state.bar?.picking) return ['cancel-point', 'Отменить', 'secondary'];
  if (state.on && state.recOnly) return ['finish', 'Стоп и разобрать', 'rec'];
  if (state.on && !state.file && !state.preflight && A && A.reps.length && !A.setEnded)
    return ['end', 'Завершить подход', 'stop'];
  if (resultHandoff()) return ['save', WORKOUT_CONTEXT ? 'Готово, к тренировке' : state.file && state.videoSummary?.reps ? 'Сохранить разбор' : 'Сохранить подходы'];
  if (state.file) return ['stop', 'Закрыть видео', 'secondary'];
  if (state.on) return ['stop', 'Выключить камеру', 'secondary'];
  return MODE_VIDEO ? ['pick', 'Выбрать видео'] : ['start', state.sets.length ? 'Следующий подход' : 'Начать с камерой'];
}
function renderMain() {
  if(typeof syncCameraTelegramChrome==='function')syncCameraTelegramChrome();
  const [action, label, style] = cameraAction(), b = el.main;
  b.disabled = false;
  b.className = 'main-btn' + (style ? ' ' + style : '');
  if (b.textContent !== label) b.textContent = label;
  $('#videoAutoRow').hidden = state.on;
}
el.main.addEventListener('click', () => {
  const A = state.analyzer, [action] = cameraAction();
  if (action === 'start') { state.recOnly = false; return startCamera(); }
  if (action === 'pick') return pickVideo();
  if (action === 'save') return commitResults();
  if (action === 'cancel') return stopCamera();
  if (action === 'cancel-point') return cancelBarPick();
  if (action === 'finish') return finishRecording();
  if (action === 'end') { A.endSet(); processEvents(A.drain()); return; }
  if (!state.preflight && !state.file && A && !A.isBar && !A.reps.length && el.msg.hidden)
    return showLiveHelp('Подход не распознан', 'Повторы не удалось определить. ' + (state.snap && state.snap.status==='world_lost' ? STATUS_TEXT.world_lost : missingHint(state.frame&&state.frame.kp)));
  stopCamera();
});
function beginPreparedSet(countOnly = false) {
  if (!state.on || !state.preflight) return;
  const f = state.frame;
  if (countOnly) {
    if (!checkSetup(f && f.kp, f && f.W, f && f.H, state.snap, state.ex).body) return;
    state.fallback = true; newAnalyzer(false);
    state.preparedCalibration = !preparationRemaining(); renderMain(); renderLive(); return;
  }
  if (preparationRemaining() || !state.preflightReady) return;
  const previous=state.analyzer;
  state.preflight = false;
  newAnalyzer();
  if (previous && previous.cal && previous.status==='track') {
    Object.assign(state.analyzer,{cal:previous.cal,analysisMode:previous.analysisMode,worldExpected:previous.worldExpected,
      view:previous.view,side:previous.side,phase:'top',status:'track'});
    if (AT.isLunge(state.ex)) state.analyzer.baselines = previous.baselines;
  }
  Voice.announceStart();
  state.startAnnounced = true;
  Rec.start(state.stream); attemptT0 = performance.now(); helperAt = 12000;
  state.flash = {cls:'info', text:'Начинаю отсчёт' + (state.fallback || isFree() ? ' · без оценки техники' : ''), until:performance.now()+2600};
  lastStatus = ''; lastStatusSay = performance.now(); renderMain(); renderLive();
}
$('#coachMode').addEventListener('change', e => { Coaching.mode = pickOpt(e.target.value, ['calm','every','summary'], 'calm'); store.set('aitrainer.coach-mode',Coaching.mode); renderCoachMode(); });


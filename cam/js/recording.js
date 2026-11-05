'use strict';
/* ---------- the current attempt is recorded in the background (it never leaves the phone) ---------- */
const Rec = {
  mr: null, chunks: [], t0: 0, mime: '',
  ok() { return typeof MediaRecorder !== 'undefined'; },
  start(stream) {
    this.drop(); if (!this.ok() || !stream) return;
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    this.mime = types.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
    try { this.mr = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: 1500000 }, this.mime ? { mimeType: this.mime } : {})); }
    catch (e) { this.mr = null; return; }
    this.chunks = []; this.t0 = performance.now();
    this.mr.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    try { this.mr.start(1000); } catch (e) { this.mr = null; }
  },
  secs() { return this.mr ? (performance.now() - this.t0) / 1000 : 0; },
  restart() { if (state.stream) this.start(state.stream); },
  drop() { const mr = this.mr; this.mr = null; this.chunks = []; if (mr && mr.state !== 'inactive') try { mr.ondataavailable = null; mr.stop(); } catch (e) { /* fine */ } },
  take() {
    const mr = this.mr; this.mr = null;
    if (!mr) return Promise.resolve(null);
    return new Promise(res => {
      const done = () => { const b = this.chunks.length ? new Blob(this.chunks, { type: (mr.mimeType || this.mime || 'video/webm').split(';')[0] }) : null; this.chunks = []; res(b); };
      if (mr.state === 'inactive') return done();
      mr.onstop = () => setTimeout(done, 0);
      try { mr.stop(); } catch (e) { done(); }
    });
  }
};
const framed = kp => !!kp && AT.requiredChains(state.ex).some(chain=>chain.every(i=>kp[i]&&kp[i].score>.5));
const viewWord = () => { const v = AT.viewOf(state.ex); return v === 'front' ? 'лицом к телефону' : v === 'side' ? 'боком к телефону' : 'боком или лицом к телефону'; };
function manualSet() {
  renderSets(); el.setsBox.hidden = false;
  const b = $('#addSet'); if (b) b.click();
  try { el.setsBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* fine */ }
}
/* the live coach could not count: offer the recording, or the set by hand */
let attemptT0 = 0, helperAt = 25000;
function helperCheck() {
  if (!state.on || state.file || state.recOnly || state.preflight || !el.msg.hidden || state.bar) return;
  const A = state.analyzer;
  if (!A || A.reps.length || (isHold() && state.snap && state.snap.phase==='hold')) { attemptT0 = performance.now(); return; }
  if (performance.now() - attemptT0 < helperAt) return;
  helperAt = Infinity;
  const s = state.snap ? state.snap.status : 'nobody';
  const why = s === 'nobody' ? missingHint(state.frame && state.frame.kp)
    : s === 'turn' || s === 'turn_front' ? 'Ракурс не подходит: встань ' + viewWord() + ', в 2–3 м'
    : s === 'calib' ? 'Замри на секунду в начальном положении — так я пойму, откуда считать'
    : s === 'world_lost' ? STATUS_TEXT.world_lost
    : 'Не вижу повторов — двигайся на полную амплитуду, целиком в кадре';
  showLiveHelp('Не получается посчитать?', why + '.', () => { attemptT0 = performance.now(); helperAt = 45000; });
  Voice.say('Не получается посчитать. ' + why, 'helper', true);
}
function showLiveHelp(title, why, onContinue) {
  const acts = [], secs = Math.round(Rec.secs());
  if (secs >= 4) acts.push({ label: 'Разобрать запись', primary: true, run: () => { hideMsg(); analyzeLive(); } });
  if (state.on && !state.file) acts.push({ label: 'Тело закрыто — считать по весу', run: () => { hideMsg(); barPick('live'); } });
  acts.push({ label: 'Записать вручную', primary: !acts.length, run: () => { hideMsg(); stopCamera(); manualSet(); } });
  acts.push({ label: onContinue ? 'Продолжить' : 'Выключить камеру', run: () => { hideMsg(); if (onContinue) onContinue(); else stopCamera(); } });
  showMsg(title, why + (secs >= 4 ? '\n\nНа устройстве есть запись последних ' + secs + ' с — могу повторно пройти её кадр за кадром. Или запиши подход вручную.' : '\n\nМожно записать подход вручную или снять на видео и разобрать после.'), acts);
}
async function analyzeLive() {
  const blob = await Rec.take();
  stopStream(); releaseWake();
  if (!blob || blob.size < 2000) { showCameraMode(false); return showMsg('Запись не сохранилась', 'Телефон не дал записать видео. Сними подход обычной камерой телефона и выбери его здесь.', [{ label: 'Выбрать видео', primary: true, run: () => { hideMsg(); pickVideo(true); } }, { label: 'Закрыть', run: hideMsg }]); }
  analyzeVideo(blob, 'rec');
}
async function startRecordMode() { state.recOnly = true; await startCamera(); if (!state.on) state.recOnly = false; renderMain(); }
async function finishRecording() { state.recOnly = false; renderMain(); return analyzeLive(); }
/* before a video: how to film it, so the coach can read it */
function pickVideo(skipGuide) {
  state.barNext = false;
  if (skipGuide) return $('#fileInput').click();
  showMsg('Как снять, чтобы я разобрала',
    (state.ex==='leg_ext' ? '• Разгибания ног: в кадре нужны таз, колено и стопа одной ноги. Голова и руки для подсчёта не обязательны.\n' : '• Поставь телефон в 2–3 м: рабочие суставы должны оставаться в кадре весь подход.\n') +
    '• Подходит съёмка спереди, сбоку, сзади и под углом, если видны нужные суставы. Не закрывай их оборудованием.\n' +
    '• Телефон неподвижно и ровно, без наклона вбок, на уровне пояса — на полке, скамье или штативе.\n' +
    '• Свет спереди, не против окна. Одно видео — один подход, до минуты.\n' +
    '• Тренажёр или блины закрывают тело? Выбери «Тело закрыто тренажёром» — посчитаю повторы по движению веса.\n\n' +
    'Видео обрабатывается на устройстве. 3D из одной камеры — предварительная оценка: скрытые суставы и контакт с полом надёжно проверить нельзя. Если точек недостаточно, анализ приостановится.',
    [{ label: 'Выбрать видео', primary: true, run: () => { hideMsg(); $('#fileInput').click(); } },
     { label: 'Тело закрыто тренажёром', run: () => { hideMsg(); state.barNext = true; $('#fileInput').click(); } },
     { label: 'Снять сейчас', run: () => { hideMsg(); startRecordMode(); } },
     { label: 'Отмена', run: hideMsg }]);
}


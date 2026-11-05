'use strict';
/* ---------- camera and model ---------- */
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => rej(new Error('Не загрузилась библиотека: ' + src)); document.head.appendChild(s); });
}
const ENGINE_KEY = 'aitrainer.engine';
const LOCAL = !!window.AI_TRAINER_STANDALONE;
const MP_PATH = LOCAL ? new URL('vendor/mediapipe', location.href).href : 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404';
function engineOrder() {
  const e = store.get(ENGINE_KEY, null), fresh = e && Date.now() - (e.at || 0) < 3 * 864e5;
  let gl2 = false; try { gl2 = !!document.createElement('canvas').getContext('webgl2'); } catch (x) { gl2 = false; }
  if (typeof WebAssembly !== 'object' || !gl2 || (fresh && e.e === 'tfjs')) return ['tfjs'];
  if (fresh && e.e === 'mp-lite') return ['mp-lite', 'tfjs'];
  return ['mp-full', 'tfjs'];
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
async function createEngine(kind) {
  if (!window.tf) await loadScript(LOCAL ? 'vendor/tf.min.js' : 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
  if (!window.poseDetection) await loadScript(LOCAL ? 'vendor/pose-detection.min.js' : 'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js');
  let det;
  if (kind === 'tfjs') {
    try { await tf.setBackend('webgl'); } catch (e) { await tf.setBackend('cpu'); }
    await tf.ready();
    det = await poseDetection.createDetector(poseDetection.SupportedModels.BlazePose, {
      runtime: 'tfjs', modelType: 'lite', enableSmoothing: true,
      detectorModelUrl: 'models/blazepose-detector.json', landmarkModelUrl: 'models/blazepose-lite.json'
    });
  } else {
    if (!window.Pose) await loadScript(MP_PATH + '/pose.js');
    det = await poseDetection.createDetector(poseDetection.SupportedModels.BlazePose, { runtime: 'mediapipe', modelType: kind === 'mp-full' ? 'full' : 'lite', enableSmoothing: true, solutionPath: MP_PATH });
  }
  const wc = document.createElement('canvas'); wc.width = wc.height = 256; const wg = wc.getContext('2d'); wg.fillStyle = '#777'; wg.fillRect(0, 0, 256, 256);
  await det.estimatePoses(wc); try { det.reset && det.reset(); } catch (e) { /* fine */ }
  return det;
}
async function ensureDetector() {
  if (state.detector) return state.detector;
  if (!state.detectorLoading) {
    state.detectorLoading = (async () => {
      let last = null;
      for (const kind of engineOrder()) {
        try { const det = await withTimeout(createEngine(kind), 60000); state.detector = det; state.engine = kind; return det; }
        catch (e) { console.error(kind, e); last = e; if (kind !== 'tfjs') store.set(ENGINE_KEY, { e: 'tfjs', at: Date.now() }); }
      }
      throw last || new Error('no pose model');
    })();
  }
  try { return await state.detectorLoading; } catch (e) { state.detectorLoading = null; throw e; }
}
const resetDet = () => { try { state.detector && state.detector.reset && state.detector.reset(); } catch (e) { /* fine */ } };
/* A slow phone gets the lighter model; a model that cannot read frames gets the old one. */
async function swapEngine(kind) {
  if (state.swapping) return; state.swapping = true;
  const old = state.detector; state.detector = null; state.detectorLoading = null;
  try { old && old.dispose && old.dispose(); } catch (e) { /* fine */ }
  store.set(ENGINE_KEY, { e: kind, at: Date.now() });
  try { await ensureDetector(); resetDet(); } catch (e) { console.error(e); }
  H.ms = null; H.nInf = 0; H.errors = 0; H.ok = 0; state.swapping = false;
}
function showMsg(title, text, actions, spinning) {
  el.msg.hidden = false; el.msgTitle.textContent = title; el.msgText.textContent = text; el.msgSpin.hidden = !spinning;
  el.stage.classList.toggle('msg-open', text.length > 140 || (actions || []).length > 2);
  el.msgActions.innerHTML = '';
  for (const a of actions || []) { const b = document.createElement('button'); b.type = 'button'; b.textContent = a.label; if (a.primary) b.className = 'primary'; b.addEventListener('click', a.run); el.msgActions.appendChild(b); }
}
function hideMsg() { el.msg.hidden = true; el.stage.classList.remove('msg-open'); }
async function loadModelWithUi() {
  if (state.detector) return true;
  showMsg('Готовлю тренера', 'Загружаю модель позы, около 15 МБ — один раз, дальше всё считается прямо на телефоне.', [], true);
  try { await ensureDetector(); hideMsg(); return true; }
  catch (e) {
    console.error(e);
    showMsg('Не загрузилось', 'Проверь интернет и попробуй ещё раз.', [{ label: 'Повторить', primary: true, run: () => { hideMsg(); startCamera(); } }]);
    return false;
  }
}
function showCameraMode(on) {
  state.on = on;
  el.howto.hidden = on; el.flip.hidden = !on || !!state.file; el.note.hidden = on || !isFree();
  if (on) {
    try { el.howto.pause(); } catch (e) { /* fine */ }
    H.still = 0; H.lastT = -1; H.errors = 0; H.ok = 0;
    if (state.stream) { try { const p = el.vid.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* watchdog retries */ } }
  }
  else { setAspect(1, 1); try { const p = el.howto.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* fine */ } }
  renderMain(); renderLive();
}
async function startCamera() {
  stopFile(); state.usedFile = false; state.fallback = false; lastStatus = '';
  if (Voice.on) Voice.say('Включаю камеру', 'cam', true);   // said inside the tap, so the phone lets the coach speak later
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return cameraBlocked();
  let stream;
  stopStream();                                   // many phones cannot open the second camera while the first one is busy
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: state.facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
  catch (e) { return cameraBlocked(); }
  stopStream(); state.stream = stream;
  state.preflight = !state.recOnly;
  el.vid.muted = true; el.vid.setAttribute('playsinline', ''); el.vid.srcObject = stream;
  el.vid.classList.toggle('mirror', state.facing === 'user');
  newAnalyzer(); showCameraMode(true);          // the video is on screen before play(): hidden videos stay frozen on some phones
  try { await el.vid.play(); } catch (e) { /* the watchdog asks for a tap */ }
  setAspect(el.vid.videoWidth || 720, el.vid.videoHeight || 1280);
  requestWake();
  if (!(await loadModelWithUi())) { stopCamera(); return; }
  resetDet();
  if (!state.preflight) { Rec.start(state.stream); attemptT0 = performance.now(); helperAt = 25000; }
  if (state.recOnly) Voice.say('Запись пошла. Сделай подход и нажми «Стоп»', 'rec', true);
}
function stopStream() {
  barReset();
  Rec.drop();
  if (state.stream) { for (const t of state.stream.getTracks()) t.stop(); state.stream = null; }
  if (el.vid.srcObject) el.vid.srcObject = null;
}
function stopCamera() {
  state.recOnly = false;
  const A = state.analyzer;
  if (!state.preflight && A && A.reps.length && !A.setEnded) { A.endSet(); processEvents(A.drain()); }
  state.preflight = false; state.preflightReady = false; state.preflightSince = null;
  stopStream(); stopFile(); releaseWake(); state.frame = null; showCameraMode(false);
}
function cameraBlocked() {
  const tgIn = document.documentElement.classList.contains('in-telegram');
  showMsg('Нет доступа к камере', tgIn
    ? 'Разреши Telegram доступ к камере в настройках телефона и нажми «Повторить». Или выбери видео подхода из галереи.'
    : 'Разреши камеру для этой страницы (значок замка или «аА» в адресной строке) и нажми «Повторить». Или выбери видео подхода.',
    [{ label: 'Повторить', primary: true, run: () => { hideMsg(); startCamera(); } }, { label: 'Видео из галереи', run: () => { hideMsg(); pickVideo(); } }]);
}
el.stage.addEventListener('click', () => { if (state.on && el.vid.paused) { try { el.vid.play(); } catch (e) { /* fine */ } } });
function renderFacing() {
  for (const b of el.camBtns) b.setAttribute('aria-pressed', String(b.dataset.facing === state.facing));
  el.camNote.textContent = state.facing === 'user'
    ? 'Фронтальная — видишь себя и подсказки на экране.'
    : 'Основная — картинка чётче, но экран смотрит от тебя: подсказки скажу голосом.';
}
function setFacing(f) {
  if (f === state.facing) return;
  state.facing = f; store.set('aitrainer.v2', Object.assign(prefs, { facing: f }));
  if (f === 'environment' && !Voice.on && 'speechSynthesis' in window) { Voice.on = true; el.voice.setAttribute('aria-pressed', 'true'); Voice.say('Голос включён', 'on', true); }
  renderFacing();
  if (state.on && !state.file) startCamera();
}
for (const b of el.camBtns) b.addEventListener('click', () => setFacing(b.dataset.facing));
el.flip.addEventListener('click', () => setFacing(state.facing === 'user' ? 'environment' : 'user'));
el.vid.addEventListener('resize', () => { if (el.vid.videoWidth && state.on) setAspect(el.vid.videoWidth, el.vid.videoHeight); });
let wake = null;
async function requestWake() { try { wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; } }
function releaseWake() { try { wake && wake.release(); } catch (e) { /* ignore */ } wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.on && !wake) requestWake(); });


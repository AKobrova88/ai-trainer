'use strict';
/* ---------- camera and model ---------- */
const modelScripts = new Map();
function loadScript(src) {
  if (!modelScripts.has(src)) {
    const loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error('Не загрузилась библиотека: ' + src));
      };
      const timer = setTimeout(fail, 10000);
      script.src = src;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = fail;
      document.head.appendChild(script);
    }).catch(error => { modelScripts.delete(src); throw error; });
    modelScripts.set(src, loading);
  }
  return modelScripts.get(src);
}
const ENGINE_KEY = 'aitrainer.engine';
const LOCAL = !!window.AI_TRAINER_STANDALONE;
const MP_PATH = LOCAL ? new URL('vendor/mediapipe', location.href).href : 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404';
function engineOrder(preferred) {
  const e = store.get(ENGINE_KEY, null), fresh = e?.v === 2 && Date.now() - e.at < 3 * 864e5;
  let gl2 = false;
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    gl2 = !!context;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch (e) { /* WebGL probe is optional */ }
  if (typeof WebAssembly !== 'object' || !gl2 || preferred === 'tfjs') return ['tfjs'];
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!preferred && fresh && e.e === 'tfjs') return ['tfjs', 'mp-lite'];
  return [preferred || (mobile || (fresh && e.e === 'mp-lite') ? 'mp-lite' : 'mp-full'), 'tfjs'];
}

/* MediaPipe takes video and canvas frames directly. Keep its 2D pixels and metric 3D points in the existing pose format. */
function mediaPipePoses(result, width, height) {
  if (!result?.poseLandmarks) return [];
  const points = (landmarks, w, h) => landmarks.map(p => ({ x: p.x * w, y: p.y * h, z: p.z, score: p.visibility }));
  const keypoints = points(result.poseLandmarks, width, height);
  const keypoints3D = result.poseWorldLandmarks ? points(result.poseWorldLandmarks, 1, 1) : undefined;
  return [{ keypoints, keypoints3D }];
}

function mediaPipeDetector(kind) {
  const pose = new window.Pose({ locateFile: name => MP_PATH + '/' + name });
  pose.setOptions({ modelComplexity: kind === 'mp-full' ? 1 : 0, smoothLandmarks: true, enableSegmentation: false });
  let result;
  pose.onResults(frame => { result = frame; });
  return {
    initialize: () => pose.initialize(),
    async estimatePoses(image, _config, timestamp) {
      result = null;
      await pose.send({ image }, timestamp);
      return mediaPipePoses(result, image.videoWidth || image.width, image.videoHeight || image.height);
    },
    reset: () => pose.reset(),
    dispose: () => pose.close()
  };
}

function supportsPoseWorker() {
  if (!LOCAL || typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') return false;
  try {
    const context = new OffscreenCanvas(1, 1).getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!context;
  } catch (e) { return false; }
}

function mediaPipeWorkerDetector(kind) {
  const worker = new Worker(new URL('cam/js/pose-worker.js?v=2.7.3', location.href));
  let pending, closed, copy;
  function dispose(error = new Error('Анализатор остановлен')) {
    closed = error;
    worker.terminate();
    pending?.reject(error);
    pending = null;
  }
  worker.onmessage = ({ data }) => {
    const request = pending;
    pending = null;
    if (data.error) request?.reject(new Error(data.error));
    else request?.resolve(data.result);
  };
  worker.onerror = event => dispose(new Error(event.message || 'Не запустился поток анализатора'));
  function request(message, transfer = []) {
    return new Promise((resolve, reject) => {
      if (closed || pending) {
        transfer.forEach(bitmap => bitmap.close());
        return reject(closed || new Error('Предыдущий кадр ещё обрабатывается'));
      }
      pending = { resolve, reject };
      try { worker.postMessage(message, transfer); }
      catch (error) {
        pending = null;
        transfer.forEach(bitmap => bitmap.close());
        reject(error);
      }
    });
  }
  return {
    initialize: () => request({ type: 'initialize', kind }),
    async estimatePoses(image, _config, timestamp) {
      const width = image.videoWidth || image.width, height = image.videoHeight || image.height;
      let bitmap;
      try { bitmap = await createImageBitmap(image); }
      catch (error) {
        copy ||= document.createElement('canvas');
        if (copy.width !== width) copy.width = width;
        if (copy.height !== height) copy.height = height;
        copy.getContext('2d').drawImage(image, 0, 0, width, height);
        bitmap = await createImageBitmap(copy);
      }
      const result = await request({ type: 'frame', bitmap, timestamp }, [bitmap]);
      return mediaPipePoses(result, width, height);
    },
    reset: () => { if (!closed) worker.postMessage({ type: 'reset' }); },
    dispose
  };
}

function disposeDetector(det) {
  try { Promise.resolve(det?.dispose?.()).catch(() => {}); } catch (e) { /* best effort */ }
}

async function createEngine(kind, signal) {
  let det;
  const checkDeadline = () => { if (signal.aborted) throw new Error('Запуск модели отменён'); };
  const dispose = () => { disposeDetector(det); det = null; };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    if (kind === 'tfjs') {
      if (!window.tf) await loadScript(LOCAL ? 'vendor/tf.min.js' : 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
      checkDeadline();
      if (!window.poseDetection) await loadScript(LOCAL ? 'vendor/pose-detection.min.js' : 'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js');
      checkDeadline();
      const webgl = await tf.setBackend('webgl').catch(() => false);
      if (!webgl) await tf.setBackend('cpu');
      await tf.ready();
      checkDeadline();
      det = await poseDetection.createDetector(poseDetection.SupportedModels.BlazePose, {
        runtime: 'tfjs', modelType: 'lite', enableSmoothing: true,
        detectorModelUrl: 'models/blazepose-detector.json', landmarkModelUrl: 'models/blazepose-lite.json'
      });
    } else {
      if (supportsPoseWorker()) det = mediaPipeWorkerDetector(kind);
      else {
        if (!window.Pose) await loadScript(MP_PATH + '/pose.js');
        checkDeadline();
        det = mediaPipeDetector(kind);
      }
      await det.initialize();
    }
    checkDeadline();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    await det.estimatePoses(canvas);
    checkDeadline();
    try { det.reset?.(); } catch (e) { /* model is ready even if reset is unavailable */ }
    return det;
  } catch (error) {
    dispose();
    throw error;
  } finally {
    signal.removeEventListener('abort', dispose);
  }
}

const ENGINE_TIMEOUT_MS = 12000;
async function startEngine(kind) {
  const deadline = new AbortController();
  let timer;
  try {
    return await Promise.race([
      createEngine(kind, deadline.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Модель не запустилась за 12 секунд: ' + kind));
          deadline.abort();
        }, ENGINE_TIMEOUT_MS);
      })
    ]);
  } finally { clearTimeout(timer); }
}

async function ensureDetector(preferred) {
  if (state.detector) return state.detector;
  if (!state.detectorLoading) {
    state.detectorLoading = (async () => {
      let lastError;
      for (const kind of engineOrder(preferred)) {
        try {
          const det = await startEngine(kind);
          state.detector = det;
          state.engine = kind;
          store.set(ENGINE_KEY, { v: 2, e: kind, at: Date.now() });
          return det;
        } catch (error) {
          console.warn(kind, error);
          lastError = error;
        }
      }
      throw lastError;
    })();
  }
  const loading = state.detectorLoading;
  try { return await loading; }
  finally { if (state.detectorLoading === loading) state.detectorLoading = null; }
}
const resetDet = () => { try { state.detector && state.detector.reset && state.detector.reset(); } catch (e) { /* fine */ } };
/* A slow phone gets the lighter model; a model that cannot read frames gets the old one. */
async function swapEngine(kind) {
  if (state.swapping) return; state.swapping = true;
  const old = state.detector; state.detector = null; state.detectorLoading = null;
  disposeDetector(old);
  try { await ensureDetector(kind); resetDet(); } catch (e) { console.error(e); }
  H.ms = null; H.nInf = 0; H.errors = 0; H.ok = 0; state.swapping = false;
}
function showMsg(title, text, actions, spinning) {
  el.msg.hidden = false; el.msgTitle.textContent = title; el.msgText.textContent = text; el.msgSpin.hidden = !spinning;
  el.stage.classList.toggle('msg-open', text.length > 140 || (actions || []).length > 2);
  el.msgActions.innerHTML = '';
  for (const a of actions || []) { const b = document.createElement('button'); b.type = 'button'; b.textContent = a.label; if (a.primary) b.className = 'primary'; b.addEventListener('click', a.run); el.msgActions.appendChild(b); }
}
function hideMsg() { el.msg.hidden = true; el.stage.classList.remove('msg-open'); }
async function loadModelWithUi(current, retry) {
  if (state.detector) return true;
  const manual = { label: 'Записать вручную', run: () => { stopCamera(); manualSet(); } };
  showMsg('Загружаю анализатор', 'Первый запуск может занять до 24 секунд. Анализ начнётся, когда модель будет готова.',
    [{ label: 'Отменить', run: stopCamera }, manual], true);
  try {
    await ensureDetector();
    if (!current()) return false;
    hideMsg();
    return true;
  }
  catch (e) {
    if (!current()) return false;
    console.error(e);
    stopCamera();
    showMsg('Анализатор не запустился', 'Попробуй ещё раз или запиши подход вручную.',
      [{ label: 'Повторить', primary: true, run: () => { hideMsg(); retry(); } },
       manual,
       { label: 'Закрыть', run: hideMsg }]);
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
  el.vid.autoplay = true; el.vid.muted = true; el.vid.setAttribute('playsinline', ''); el.vid.srcObject = stream;
  el.vid.classList.toggle('mirror', state.facing === 'user');
  newAnalyzer(); showCameraMode(true);          // the video is on screen before play(): hidden videos stay frozen on some phones
  setAspect(el.vid.videoWidth || 720, el.vid.videoHeight || 1280);
  requestWake();
  if (!(await loadModelWithUi(() => state.stream === stream, startCamera))) return;
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
  hideMsg();
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


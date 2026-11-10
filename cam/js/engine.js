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
      const timer = setTimeout(fail, 30000);
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
const ENGINE_VERSION = 3;
const LOCAL = !!window.AI_TRAINER_STANDALONE;
const MP_PATH = LOCAL ? new URL('vendor/mediapipe', location.href).href : 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404';
function appleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || new URLSearchParams(location.hash.slice(1)).get('tgWebAppPlatform') === 'ios';
}
function engineOrder(preferred) {
  const e = store.get(ENGINE_KEY, null), fresh = e?.v === ENGINE_VERSION && Date.now() - e.at < 3 * 864e5;
  let gl2 = false;
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    gl2 = !!context;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch (e) { /* WebGL probe is optional */ }
  if (typeof WebAssembly !== 'object' || !gl2 || preferred === 'tfjs') return ['tfjs'];
  const mobile = appleMobile() || /Android/i.test(navigator.userAgent);
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
  // A WebGL2 probe alone does not establish that MediaPipe can run in an iOS WebView worker.
  if (appleMobile()) return false;
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

function modelSource(path, signal, onBytes) {
  if (!LOCAL || typeof tf.io?.http !== 'function' || typeof fetch !== 'function') return path;
  return tf.io.http(new URL(path, location.href).href, {
    requestInit: {signal},
    async fetchFunc(input, options) {
      const response = await fetch(input, options);
      if (!response.ok || !response.body?.getReader || typeof ReadableStream !== 'function') return response;
      const reader = response.body.getReader();
      const body = new ReadableStream({
        async pull(controller) {
          const {value, done} = await reader.read();
          if (done) { controller.close(); return; }
          onBytes(value.byteLength);
          controller.enqueue(value);
        },
        cancel(reason) { return reader.cancel(reason); },
      });
      return new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
    },
  });
}

async function createEngine(kind, mode, signal, report = () => {}) {
  let det;
  const checkDeadline = () => { if (signal.aborted) throw new Error('Запуск модели отменён'); };
  const dispose = () => { disposeDetector(det); det = null; };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    if (kind === 'tfjs') {
      report('library');
      if (!window.tf) await loadScript(LOCAL ? 'vendor/tf.min.js' : 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
      checkDeadline();
      if (!window.poseDetection) await loadScript(LOCAL ? 'vendor/pose-detection.min.js' : 'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js');
      checkDeadline();
      report('runtime');
      if (mode === 'wasm') {
        const assets = new URL('vendor/tfjs-wasm/', location.href).href;
        if (!tf.wasm) await loadScript(assets + 'tf-backend-wasm.min.js');
        checkDeadline();
        tf.wasm.setWasmPaths(assets);
        tf.wasm.setThreadsCount(1); // Telegram need not isolate its WebView for shared-memory threads.
      }
      if (!(await tf.setBackend(mode))) throw new Error('Недоступен режим анализа: ' + mode);
      await tf.ready();
      checkDeadline();
      let bytes = 0;
      const onBytes = size => { bytes += size; report('model', bytes); };
      report('model');
      det = await poseDetection.createDetector(poseDetection.SupportedModels.BlazePose, {
        runtime: 'tfjs', modelType: 'lite', enableSmoothing: true,
        detectorModelUrl: modelSource('models/blazepose-detector.json', signal, onBytes),
        landmarkModelUrl: modelSource('models/blazepose-lite.json', signal, onBytes),
      });
    } else {
      report('model');
      if (mode === 'worker') det = mediaPipeWorkerDetector(kind);
      else {
        if (!window.Pose) await loadScript(MP_PATH + '/pose.js');
        checkDeadline();
        det = mediaPipeDetector(kind);
      }
      await det.initialize();
    }
    checkDeadline();
    report('frame');
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

// Cold startup includes fetching several MB of model data, even if the page itself loaded quickly.
const ENGINE_TIMEOUT_MS = 60000;
const IOS_STARTUP_LIMIT_MS = 120000, IOS_NO_PROGRESS_MS = 30000;
async function startEngine(kind, mode, report) {
  const deadline = new AbortController();
  const watchProgress = LOCAL && appleMobile() && kind === 'tfjs' && typeof ReadableStream === 'function';
  let timer, idle, rejectTimeout;
  const expired = new Promise((_, reject) => { rejectTimeout = reject; });
  const timeout = () => {
    rejectTimeout(new Error('Истекло время запуска модели: ' + kind + '/' + mode));
    deadline.abort();
  };
  const resetIdle = () => { clearTimeout(idle); idle = setTimeout(timeout, IOS_NO_PROGRESS_MS); };
  timer = setTimeout(timeout, watchProgress ? IOS_STARTUP_LIMIT_MS : ENGINE_TIMEOUT_MS);
  if (watchProgress) resetIdle();
  try {
    return await Promise.race([
      createEngine(kind, mode, deadline.signal, (stage, bytes = 0) => {
        if (deadline.signal.aborted) return;
        if (watchProgress) resetIdle();
        report?.(stage, bytes);
      }),
      expired,
    ]);
  } finally { clearTimeout(timer); clearTimeout(idle); }
}

function engineAttempts(preferred) {
  // In Safari and other iOS WebViews, skip both WebGL startups. This model uses the same
  // local BlazePose weights with a faster CPU backend, and can still fall back to plain JS.
  if (LOCAL && appleMobile()) {
    const modes = typeof WebAssembly === 'object' ? ['wasm', 'cpu'] : ['cpu'];
    return modes.map(mode => ({kind: 'tfjs', mode}));
  }
  const worker = supportsPoseWorker();
  return engineOrder(preferred).flatMap(kind => {
    const modes = kind === 'tfjs' ? ['webgl', 'cpu'] : worker ? ['worker', 'page'] : ['page'];
    return modes.map(mode => ({kind, mode}));
  });
}

async function ensureDetector(preferred) {
  if (state.detector) return state.detector;
  if (!state.detectorLoading) {
    state.detectorLoading = (async () => {
      let lastError;
      for (const [i, {kind, mode}] of engineAttempts(preferred).entries()) {
        state.detectorProgress = {stage: 'library', bytes: 0, attempt: i};
        try {
          const det = await startEngine(kind, mode, (stage, bytes) => { state.detectorProgress = {stage, bytes, attempt: i}; });
          state.detector = det;
          state.engine = kind;
          store.set(ENGINE_KEY, { v: ENGINE_VERSION, e: kind, at: Date.now() });
          return det;
        } catch (error) {
          console.warn(kind + '/' + mode, error);
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
async function loadModelWithUi(current, retry, videoFallback) {
  if (state.detector) return true;
  const manual = { label: 'Записать вручную', run: () => { stopCamera(); manualSet(); } };
  const started = performance.now();
  const stages = { library: 'Подключаю анализатор', runtime: 'Запускаю модуль анализа', model: 'Скачиваю модель на телефон', frame: 'Проверяю обработку кадра' };
  showMsg('Загружаю анализатор', stages.library,
    [{ label: 'Отменить', run: stopCamera }, manual], true);
  const refresh = () => {
    if (!current()) { clearInterval(clock); return; }
    const p = state.detectorProgress;
    const size = p?.bytes >= 1e5 ? ' · ' + (p.bytes / 1e6).toFixed(1).replace('.', ',') + ' МБ' : '';
    el.msgText.textContent = (p?.attempt ? 'Запасной режим. ' : '') + (stages[p?.stage] || stages.library) + size + ' · ' + Math.floor((performance.now() - started) / 1000) + ' с';
  };
  const clock = setInterval(refresh, 1000);
  try {
    const startup = ensureDetector();
    refresh();
    await startup;
    if (!current()) return false;
    hideMsg();
    return true;
  }
  catch (e) {
    if (!current()) return false;
    console.error(e);
    stopCamera();
    showMsg('Анализатор не запустился', videoFallback
      ? 'Видео открылось. Проверь интернет и повтори разбор этого видео. Можно также посчитать повторы по движению веса.'
      : 'Проверь интернет и повтори запуск. Можно записать подход вручную.',
      [{ label: videoFallback ? 'Повторить разбор' : 'Повторить', primary: true, run: () => { hideMsg(); retry(); } },
       ...(videoFallback ? [{ label: 'Считать по движению веса', run: () => { hideMsg(); videoFallback(); } }] : []),
       manual,
       { label: 'Закрыть', run: hideMsg }]);
    return false;
  } finally { clearInterval(clock); }
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
  if (state.recOnly) {
    Rec.start(stream);
    if (!Rec.mr) {
      stopCamera();
      return showMsg('Запись недоступна', 'Сними подход обычной камерой телефона и выбери запись из галереи.',
        [{ label: 'Выбрать видео', primary: true, run: () => { hideMsg(); pickVideo(true); } }, { label: 'Закрыть', run: hideMsg }]);
    }
    Voice.say('Запись пошла. Сделай подход и нажми «Стоп»', 'rec', true);
    return;
  }
  if (!(await loadModelWithUi(() => state.stream === stream, startCamera))) return;
  resetDet();
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


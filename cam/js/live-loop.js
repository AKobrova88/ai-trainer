'use strict';
/* ---------- live loop ---------- */
let lastUi = 0;
let lastHealth = 0;
function loop(now) {
  try {
    if (state.on && !state.file) infer();
    draw();
    if (now - lastUi > 110) { lastUi = now; renderLive(); }
    if (now - lastHealth > 1000) { lastHealth = now; health(); }
  } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}
/* The camera picture must keep moving: some phones pause a video until it is tapped. */
const H = { lastT: -1, still: 0, errors: 0, ok: 0, lastErr: '', noPose: 0 };
function health() {
  if (!state.on || state.file || !state.stream || !el.msg.hidden) return;
  if (state.engine === 'mp-full' && H.nInf > 60 && H.ms > 110) swapEngine('mp-lite');
  if (Rec.secs() > 180 && !(state.analyzer && state.analyzer.reps.length)) Rec.restart();   // keep only the current attempt
  helperCheck();
  const v = el.vid;
  if (v.paused || v.ended) { try { const p = v.play(); if (p && p.catch) p.catch(() => tapToStart()); } catch (e) { tapToStart(); } }
  if (v.currentTime === H.lastT) H.still++; else { H.still = 0; H.lastT = v.currentTime; }
  if (H.still >= 3) return tapToStart();
  if (state.detector && H.errors > 15 && !H.ok) {
    showMsg('Тренер не смог прочитать кадр', 'Нажми «Перезапустить». Если не поможет — пришли мне снимок экрана. Ошибка: ' + H.lastErr.slice(0, 120),
      [{ label: 'Перезапустить', primary: true, run: () => location.reload() }]);
  }
}
function tapToStart() {
  if (!el.msg.hidden) return;
  showMsg('Камера на паузе', 'Нажми кнопку — и картинка пойдёт.', [{ label: 'Запустить камеру', primary: true, run: () => {
    hideMsg(); H.still = 0; H.lastT = -1;
    try { const p = el.vid.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* retried by the watchdog */ }
  } }]);
}
function syncSize(v) { if (v.videoWidth && (v.width !== v.videoWidth || v.height !== v.videoHeight)) { v.width = v.videoWidth; v.height = v.videoHeight; } }
const toKp = AT.poseToKeypoints; // One adapter for live inference and uploaded video frames.
async function infer() {
  const v = el.vid;
  if (state.bar && state.on && !state.file) { if (state.bar.live) barInferLive(); return; }   // picking a point or following it: no pose
  if (!state.on || state.file || state.busy || !state.detector || v.readyState < 2 || !v.videoWidth) return;
  const revision=state.revision,detector=state.detector,analyzer=state.analyzer,stream=state.stream;
  const current=()=>state.on && !state.file && state.revision===revision && state.detector===detector && state.analyzer===analyzer && state.stream===stream;
  state.busy = true;
  try {
    const t = performance.now() / 1000;
    syncSize(v);
    const t0 = performance.now(), kp = toKp(await detector.estimatePoses(v, { maxPoses: 1, flipHorizontal: false }, t * 1000)), dt = performance.now() - t0;
    if (!current()) return; // A late camera frame must never enter another exercise or a closed session.
    H.ms = H.ms == null ? dt : H.ms + (dt - H.ms) * 0.05; H.nInf = (H.nInf || 0) + 1;
    state.frame = { kp, W: v.videoWidth, H: v.videoHeight };
    H.ok++; H.noPose = kp ? 0 : H.noPose + 1;
    if (state.recOnly) state.snap = { status: framed(kp) ? 'rec' : 'nobody', live: [], view: 'side', side: 'l', reps: 0, phase: 'top' };
    else if (state.preflight) {
      preparationRemaining();
      if (!preparationRemaining() && !state.preparedCalibration) {
        newAnalyzer(false); state.preparedCalibration = true;
      }
      state.snap = state.analyzer.update(kp, t);
      state.analyzer.drain(); // Preparation movements never become recorded sets.
      const checks = checkSetup(kp, v.videoWidth, v.videoHeight, state.snap, state.ex);
      if (preparationRemaining() || !checks.ready) state.preflightSince = null;
      else if (state.preflightSince == null) state.preflightSince = t;
      state.preflightReady = !preparationRemaining() && checks.ready && t - state.preflightSince >= .7;
      if (state.preflightReady) beginPreparedSet();
    } else handleSnap(state.analyzer.update(kp, t));
  } catch (e) {
    if (!current()) return;
    console.error(e); H.errors++; H.lastErr = String((e && e.message) || e);
    if (state.engine && state.engine !== 'tfjs' && H.errors > 10 && !H.ok) swapEngine('tfjs');
  }
  finally { state.busy = false; }
}
function handleSnap(snap) { state.snap = snap; processEvents(state.analyzer.drain()); }
function processEvents(evts) {
  const A = state.analyzer;
  for (const e of evts) {
    if (e.type === 'cue') { if (!state.file) Voice.say(A.meta(e.id).cue, e.id); }
    else if (e.type === 'rep') {
      const r = e.rep, now = performance.now();
      if (isHold()) continue;
      state.flash = A.isBar ? { cls: r.faultList.length ? 'warn' : 'info', text: 'Повтор ' + r.n + (r.faultList.length ? ': ' + A.meta(r.faultList[0]).cue.toLowerCase() : ' · по движению веса'), until: now + 1600 }
        : isFree() || state.fallback ? { cls: 'info', text: 'Повтор ' + r.n + ' · без оценки техники', until: now + 1400 } : r.faultList.length
        ? { cls: r.grade === 'bad' ? 'bad' : 'warn', text: 'Повтор ' + r.n + ': ' + A.meta(r.faultList[0]).cue.toLowerCase(), until: now + 1800 }
        : r.partial ? { cls: 'info', text: 'Повтор ' + r.n + ' · 3D: в доступных проверках замечаний нет', until: now + 1800 }
        : { cls: 'good', text: 'Повтор ' + r.n + ' — ' + (Math.random() < 0.3 ? pick(T.praise).toLowerCase() : 'чисто'), until: now + 1400 };
      if (!state.file) Voice.say(String(r.n), 'rep' + r.n, false, true);
    } else if (e.type === 'setEnd') {
      recordSet();
      if (state.on && !state.file && !state.recOnly) startPreparation(false);
    }
    else if (e.type === 'newSet') renderMain();
  }
  if (evts.length) renderMain();
}


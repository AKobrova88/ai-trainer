'use strict';
/* A recorded video is decoded once. The initial poses are reused for recognition and the technique analysis. */
let fileToken = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function seekTo(v, t) {
  if (v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - t) < .001) return Promise.resolve(true);
  return new Promise(resolve => {
    const done = ok => {
      clearTimeout(timer);
      v.removeEventListener('seeked', ready);
      v.removeEventListener('error', failed);
      resolve(ok);
    };
    const ready = () => done(true), failed = () => done(false);
    const timer = setTimeout(failed, 1500);
    v.addEventListener('seeked', ready);
    v.addEventListener('error', failed);
    try { v.currentTime = t; } catch (e) { failed(); }
  });
}
function stopFile() {
  fileToken++; barReset();
  state.analyzing=false; state.videoSummary=null;
  state.videoExercise = ''; state.recognizingVideo = false;
  if (state.file) { try { el.vid.pause(); } catch (e) { /* fine */ } el.vid.removeAttribute('src'); el.vid.load(); URL.revokeObjectURL(state.file); state.file = null; }
}
$('#fileInput').addEventListener('change', e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) { state.barNext = false; return; }
  const bar = !!state.barNext; state.barNext = false;
  analyzeVideo(file, 'upload', bar);
});
function metaOf(v) {
  if (v.readyState >= 1) return Promise.resolve(true);
  return new Promise(resolve => {
    const done = ok => {
      clearTimeout(timer);
      v.removeEventListener('loadedmetadata', ready);
      v.removeEventListener('error', failed);
      v.removeEventListener('abort', failed);
      resolve(ok);
    };
    const ready = () => done(true), failed = () => done(false);
    const timer = setTimeout(failed, 8000);
    v.addEventListener('loadedmetadata', ready);
    v.addEventListener('error', failed);
    v.addEventListener('abort', failed);
  });
}
/* a recording from the phone (webm) knows its length only after a seek to the very end */
function fixDuration(v) {
  return new Promise(res => {
    let to = 0;
    const done = () => { v.removeEventListener('durationchange', chk); v.removeEventListener('timeupdate', chk); clearTimeout(to); const d = v.duration; v.currentTime = 0; res(isFinite(d) ? d : NaN); };
    const chk = () => { if (isFinite(v.duration)) done(); };
    v.addEventListener('durationchange', chk); v.addEventListener('timeupdate', chk);
    to = setTimeout(done, 4000);
    try { v.currentTime = 1e101; } catch (e) { done(); }
  });
}
async function analyzeVideo(blob, from, bar = false) {
  stopStream(); stopFile(); state.recOnly = false; state.fallback = false; hideMsg();
  state.file = URL.createObjectURL(blob); state.usedFile = true;
  const token=++fileToken;
  const v = el.vid; v.autoplay = false; v.srcObject = null; v.src = state.file; v.muted = true; v.classList.remove('mirror');
  showMsg('Открываю видео', 'Читаю запись на телефоне.', [{label: 'Отмена', run: stopCamera}], true);
  const ok = await metaOf(v);
  if (token!==fileToken) return;
  let dur = ok ? v.duration : NaN;
  if (ok && !isFinite(dur)) dur = await fixDuration(v);
  if (token!==fileToken) return;
  if (!ok || !v.videoWidth || !isFinite(dur) || dur <= 0) { stopFile(); showCameraMode(false); return showMsg('Видео не открылось', 'Попробуй другой файл: MP4 или MOV, снятый на телефон.', [{ label: 'Понятно', primary: true, run: hideMsg }]); }
  hideMsg();
  setAspect(v.videoWidth, v.videoHeight); newAnalyzer(); showCameraMode(true);
  if (bar) return barPick('file');   // the body is hidden anyway: no pose model, the weight is followed
  const current = () => token === fileToken;
  if (!(await loadModelWithUi(current, () => analyzeVideo(blob, from, bar))) || !current()) return;
  const st = { n: 0, miss: {}, errors:0, consecutiveErrors:0, shadowGroups:[[]] };
  const buffer = [];
  const auto = from === 'upload' && $('#videoAuto').checked !== false;
  let setStart = state.sets.length, shadow = null, curlTracks = [];
  function feed(kp, t) {
    for (const track of curlTracks) track.rows.push(recognitionFrame(kp, t, track.side));
    const snap = state.analyzer.update(kp, t);
    handleSnap(snap);
    if (shadow) {
      shadow.update(kp, t);
      for (const e of shadow.drain()) {
        if (e.type === 'newSet') st.shadowGroups.push([]);
        else if (e.type === 'rep') st.shadowGroups[st.shadowGroups.length - 1].push(e.rep);
      }
    }
    st.n++; st[snap.status] = (st[snap.status] || 0) + 1;
    if (snap.status === 'nobody') { const m = missingHint(kp); st.miss[m] = (st.miss[m] || 0) + 1; }
  }
  function startAnalysis() {
    if (auto) {
      const key = recognizeVideoExercise(buffer), movement = videoMovements[key];
      if (movement && key !== state.ex && !movement.related.includes(state.ex)) {
        setExercise(key, true);
        state.videoExercise = 'Распознала движение: ' + movement.name + '.';
        Voice.say(state.videoExercise, 'video-exercise', true);
      } else if (movement) {
        state.videoExercise = 'Разбор выбранного упражнения: ' + info().name + '.';
      } else {
        state.videoExercise = 'Не смогла уверенно определить упражнение. Разбор по выбранному: ' + info().name + '.';
      }
      if (key === 'db_curl' && state.ex === key) curlTracks = Object.values(AT.SIDE).map(side => ({side, rows: []}));
    }
    setStart = state.sets.length;
    shadow = isFree() ? null : state.ex === 'leg_ext' ? new AT.LegExtensionAnalyzer(state.level, true) : new AT.FreeAnalyzer(state.level, state.ex, true);
    state.recognizingVideo = false;
    for (const [kp, t] of buffer) feed(kp, t);
    buffer.length = 0;
  }
  resetDet(); state.analyzing = true; state.prog = 0;
  state.recognizingVideo = auto;
  if (!auto) startAnalysis();
  try { await v.play(); v.pause(); } catch (err) { /* priming */ }
  const step = 1 / (dur > 60 ? 8 : dur > 20 ? 10 : 15);   // a long recording: fewer frames, still enough to see every rep
  for (let t = 0; token === fileToken && t <= dur; t += step) {
    const w0 = performance.now();
    const decoded = await seekTo(v, Math.min(t, Math.max(0, dur - 0.01)));
    if (token !== fileToken) return;
    try {
      if (!decoded) throw new Error('Video frame did not decode');
      syncSize(v);
      const kp = toKp(await state.detector.estimatePoses(v, { maxPoses: 1, flipHorizontal: false }, t * 1000));
      if (token!==fileToken) return;
      state.frame = { kp, W: v.videoWidth, H: v.videoHeight };
      if (state.recognizingVideo) {
        buffer.push([kp, t]);
        if (t >= 12) startAnalysis();
      } else feed(kp, t);
      st.consecutiveErrors=0;
      state.prog = Math.min(99, Math.round(t / dur * 100));
    } catch (err) { if(token!==fileToken)return; console.error(err); st.errors++; if(++st.consecutiveErrors>=3)break; }
    const wait = 1000 / 30 - (performance.now() - w0); if (wait > 0) await sleep(wait);
  }
  if (token !== fileToken) return;
  if (state.recognizingVideo) startAnalysis();
  state.analyzing = false;
  const A = state.analyzer;
  A.endSet(); processEvents(A.drain());
  const videoSets = state.sets.slice(setStart), found = videoSets.reduce((sum,s)=>sum+s.r,0);
  state.videoSummary = {reps:found,sets:videoSets.length,warning:found?'':'Повторы не распознаны; можно записать вручную'};
  try { v.pause(); } catch (e) { /* fine */ }
  if (!found && curlTracks.length) {
    const reps = Math.max(...curlTracks.map(track => curlCycles(track.rows)));
    if (reps) {
      state.fallback = true;
      A.reps = Array.from({length: reps}, () => ({faultList: []}));
      A.setEnded = true;
      recordSet();
      state.videoSummary = {reps, sets: 1, warning: 'Посчитала видимые сгибания на одной руке. Техника не оценивалась. Проверь число повторов'};
      return;
    }
  }
  videoVerdict(st, found, shadow, from);
}

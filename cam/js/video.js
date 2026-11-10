'use strict';
/* A recorded video (when the live camera is blocked) is read frame by frame, 15 per second. */
let fileToken = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function seekTo(v, t) { return new Promise(res => { let to = 0; const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res(); }; to = setTimeout(done, 1500); v.addEventListener('seeked', done); v.currentTime = t; }); }
function stopFile() {
  fileToken++; barReset();
  state.analyzing=false; state.videoSummary=null;
  if (state.file) { try { el.vid.pause(); } catch (e) { /* fine */ } el.vid.removeAttribute('src'); el.vid.load(); URL.revokeObjectURL(state.file); state.file = null; }
}
$('#fileInput').addEventListener('change', e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) { state.barNext = false; return; }
  const bar = !!state.barNext; state.barNext = false;
  analyzeVideo(file, 'upload', bar);
});
const metaOf = v => new Promise(res => { if (v.readyState >= 1) return res(true); v.addEventListener('loadedmetadata', () => res(true), { once: true }); v.addEventListener('error', () => res(false), { once: true }); });
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
  const ok = await metaOf(v);
  if (token!==fileToken) return;
  let dur = ok ? v.duration : NaN;
  if (ok && !isFinite(dur)) dur = await fixDuration(v);
  if (token!==fileToken) return;
  if (!ok || !v.videoWidth || !isFinite(dur) || dur <= 0) { stopFile(); showCameraMode(false); return showMsg('Видео не открылось', 'Попробуй другой файл: MP4 или MOV, снятый на телефон.', [{ label: 'Понятно', primary: true, run: hideMsg }]); }
  setAspect(v.videoWidth, v.videoHeight); newAnalyzer(); showCameraMode(true);
  if (bar) return barPick('file');   // the body is hidden anyway: no pose model, the weight is followed
  const current = () => token === fileToken;
  if (!(await loadModelWithUi(current, () => analyzeVideo(blob, from, bar))) || !current()) return;
  const st = { n: 0, miss: {}, errors:0, consecutiveErrors:0, shadowGroups:[[]] }, setStart = state.sets.length;
  const shadow = isFree() || state.fallback ? null : state.ex === 'leg_ext' ? new AT.LegExtensionAnalyzer(state.level,true) : new AT.FreeAnalyzer(state.level,state.ex,true);
  resetDet(); state.analyzing = true; state.prog = 0;
  try { await v.play(); v.pause(); } catch (err) { /* priming */ }
  const step = 1 / (dur > 60 ? 8 : dur > 20 ? 10 : 15);   // a long recording: fewer frames, still enough to see every rep
  for (let t = 0; token === fileToken && t <= dur; t += step) {
    const w0 = performance.now();
    await seekTo(v, Math.min(t, Math.max(0, dur - 0.01)));
    if (token !== fileToken) return;
    try {
      syncSize(v);
      const kp = toKp(await state.detector.estimatePoses(v, { maxPoses: 1, flipHorizontal: false }, t * 1000));
      if (token!==fileToken) return;
      state.frame = { kp, W: v.videoWidth, H: v.videoHeight };
      const snap = state.analyzer.update(kp, t); handleSnap(snap);
      if (shadow) {
        shadow.update(kp, t);
        for (const e of shadow.drain()) {
          if (e.type === 'newSet') st.shadowGroups.push([]);
          else if (e.type === 'rep') st.shadowGroups[st.shadowGroups.length-1].push(e.rep);
        }
      }
      st.n++; st[snap.status] = (st[snap.status] || 0) + 1;
      st.consecutiveErrors=0;
      if (snap.status === 'nobody') { const m = missingHint(kp); st.miss[m] = (st.miss[m] || 0) + 1; }
      state.prog = Math.min(99, Math.round(t / dur * 100));
    } catch (err) { if(token!==fileToken)return; console.error(err); st.errors++; if(++st.consecutiveErrors>=3)break; }
    const wait = 1000 / 30 - (performance.now() - w0); if (wait > 0) await sleep(wait);
  }
  if (token !== fileToken) return;
  state.analyzing = false;
  const A = state.analyzer;
  A.endSet(); processEvents(A.drain());
  const videoSets = state.sets.slice(setStart), found = videoSets.reduce((sum,s)=>sum+s.r,0);
  state.videoSummary = {reps:found,sets:videoSets.length,warning:found?'':'Повторы не распознаны; можно записать вручную'};
  try { v.pause(); } catch (e) { /* fine */ }
  videoVerdict(st, found, shadow, from);
}

'use strict';
function openSheet(sheet) {
  if (sheet.open) return;
  if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', '');
}
function closeSheet(sheet) {
  if (sheet.close && sheet.open) sheet.close(); else sheet.removeAttribute('open');
}
const optionsSheet = $('#cameraOptions');
for (const dialog of [optionsSheet, $('#exerciseFinder'), $('#recordingsDialog')]) {
  dialog.addEventListener('click', e => {
    if (e.target === dialog || e.target.closest('[data-dismiss]')) closeSheet(dialog);
  });
}
const option = (id, run) => $(id).addEventListener('click', () => { closeSheet(optionsSheet); run(); });
const goCamera = () => { state.recOnly = false; startCamera(); };
option('#cameraOption', goCamera);
option('#galleryOption', () => pickVideo());
option('#saveOption', commitResults);
option('#recBtn', startRecordMode);
option('#recordedOption', analyzeLive);
option('#manualOption', () => { stopCamera(); manualSet(); });
option('#setupCount', () => beginPreparedSet(true));
option('#setupBar', () => state.file ? barPick('file') : state.on ? barPick('live') : pickVideo(true));
$('#vidBtn').addEventListener('click', () => pickVideo());
$('#facingOption').addEventListener('click', () => setFacing(state.facing === 'user' ? 'environment' : 'user'));
$('#moreBtn').addEventListener('click', () => {
  const [action] = cameraAction(), idle = !state.on && !state.file && !state.cameraRequest, ready = !state.analyzing && !action.startsWith('cancel');
  $('#cameraOption').hidden = !(idle && action !== 'start');
  $('#galleryOption').hidden = !ready || (!state.file && (!idle || action !== 'save'));
  $('#recBtn').hidden = !idle || !Rec.ok();
  $('#recordedOption').hidden = !ready || !state.on || !!state.file || state.recOnly || Rec.secs() < 4;
  $('#saveOption').hidden = !ready || action === 'save' || !resultHandoff();
  $('#setupBar').hidden = !ready || state.recOnly || isHold();
  $('#facingOption').hidden = !idle;
  $('#voiceOption').hidden = !('speechSynthesis' in window);
  renderSetup(); renderCoachMode(); if ('speechSynthesis' in window) renderVoices(); openSheet(optionsSheet);
});
el.voice.addEventListener('change', () => {
  if (!('speechSynthesis' in window)) return;
  Voice.on = el.voice.checked; store.set('aitrainer.v2', Object.assign(prefs, { voice: Voice.on }));
  if (Voice.on) Voice.say('Голос включён', 'on', true); else speechSynthesis.cancel();
});
const back = $('#navBack');
back.hidden = !RET;
if (RET) {
  back.setAttribute('href', RET);
  back.addEventListener('click', e => { e.preventDefault();stopCamera();saveSets();Clips.leave(()=>{location.href=RET;}); });
}
let cameraTelegram = null;
if (cameraColorScheme.addEventListener) cameraColorScheme.addEventListener('change', () => syncCameraTheme(cameraTelegram));
new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

fillSelect(); setAspect(1, 1); resize(); setExercise(state.ex); renderFacing(); renderPlan();
el.voice.checked = Voice.on;
Clips.init().then(()=>{if(qp.get('mode')==='recordings')Clips.open();});
$('#recordingsBtn').addEventListener('click',()=>Clips.open());
$('#clipSave').addEventListener('click',()=>Clips.export(Clips.selected));
$('#clipRetry').addEventListener('click',()=>Clips.retry(Clips.selected));
$('#clipDelete').addEventListener('click',()=>Clips.remove(Clips.selected));
$('#recordingsList').addEventListener('click',e=>{const b=e.target.closest('[data-clip]');if(b)Clips.open(b.dataset.clip);});
$('#recordingsDialog').addEventListener('close',()=>{$('#clipPreview').pause();});
window.addEventListener('pagehide',()=>{Rec.drop();});
function preserveRecordingVisibility() {
  if(document.visibilityState==='hidden')Rec.drop();
  else if(document.visibilityState==='visible' && state.on && state.stream && !state.file)Rec.start(state.stream);
}
document.addEventListener('visibilitychange',preserveRecordingVisibility);
requestAnimationFrame(loop);
if (MODE_LIVE) startCamera(true);

if (window.AI_TRAINER_STANDALONE) {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).catch(() => { /* offline cache is optional */ }); });
  }
}
telegramBridge.then(W => {
  if (!W) return;
  cameraTelegram = W;
  const call = (f, ...a) => { try { if (typeof W[f] === 'function') W[f](...a); } catch (e) { /* older Telegram */ } };
  const atLeast = v => { try { return W.isVersionAtLeast(v); } catch (e) { return false; } };
  const theme = () => {
    syncCameraTheme(W);
    if (atLeast('6.9')) { const bg = cssv('--bg'); call('setHeaderColor', bg); call('setBackgroundColor', bg); }
    if (atLeast('7.10')) call('setBottomBarColor', cssv('--bg'));
  };
  call('ready'); call('expand');
  if (atLeast('7.7')) call('disableVerticalSwipes');
  theme(); renderSets();
  try { W.onEvent('themeChanged', theme); } catch (e) { /* no theme events */ }
});
window.__aiTrainer = { state, AT, EX, recordSet, renderSets, setExercise, feed: (kp, t) => handleSnap(state.analyzer.update(kp, t)),
  end: () => { state.analyzer.endSet(); processEvents(state.analyzer.drain()); }, on: v => showCameraMode(v) };

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
option('#recordingsOption',()=>Clips.open());
option('#manualOption', () => { stopCamera(); manualSet(); });
option('#setupCount', () => beginPreparedSet(true));
option('#setupBar', () => state.file ? barPick('file') : state.on ? barPick('live') : pickVideo(true));
$('#facingOption').addEventListener('click', () => setFacing(state.facing === 'user' ? 'environment' : 'user'));
$('#moreBtn').addEventListener('click', () => {
  const [action] = cameraAction(), idle = !state.on && !state.file && !state.cameraRequest, ready = !state.analyzing && !action.startsWith('cancel');
  $('#cameraOption').hidden = !(idle && action !== 'start');
  $('#galleryOption').hidden = !MODE_VIDEO || !ready || !state.file;
  $('#recordingsOption').hidden=!Clips.items.length;
  $('#saveOption').hidden = !ready || action === 'save' || !resultHandoff();
  $('#setupBar').hidden = !ready || state.recOnly || isHold();
  $('#facingOption').hidden = !idle || !canFlipCamera();
  refreshCameraDevices();
  $('#voiceOption').hidden = !('speechSynthesis' in window);
  renderSetup(); renderCoachMode(); if ('speechSynthesis' in window) renderVoices(); openSheet(optionsSheet);
});
$('#cameraDevice').addEventListener('change',e=>selectCameraDevice(e.target.value));
if(navigator.mediaDevices?.addEventListener)navigator.mediaDevices.addEventListener('devicechange',refreshCameraDevices);
el.voice.addEventListener('change', () => {
  if (!('speechSynthesis' in window)) return;
  Voice.on = el.voice.checked; store.set('aitrainer.v2', Object.assign(prefs, { voice: Voice.on }));
  if (Voice.on) Voice.say('Голос включён', 'on', true); else speechSynthesis.cancel();
});
const back = $('#navBack');
back.hidden = !RET;
if (RET) {
  back.setAttribute('href', RET);
  back.setAttribute('aria-label', WORKOUT_CONTEXT ? 'Вернуться к тренировке' : 'Вернуться на Сегодня');
  back.addEventListener('click', e => { e.preventDefault();stopCamera();toApp(); });
}
let cameraTelegram = null;
if (cameraColorScheme.addEventListener) cameraColorScheme.addEventListener('change', () => syncCameraTheme(cameraTelegram));
new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

fillSelect(); setAspect(1, 1); resize(); setExercise(state.ex); renderFacing(); renderPlan();
el.voice.checked = Voice.on;
Clips.init().then(()=>{if(qp.get('mode')==='recordings')Clips.open();});
$('#recordingsBtn').addEventListener('click',()=>{const clip=Clips.latest();if(clip)Clips.export(clip.id);});
$('#clipSave').addEventListener('click',()=>Clips.export(Clips.selected));
$('#clipRetry').addEventListener('click',()=>Clips.retry(Clips.selected));
$('#clipDelete').addEventListener('click',()=>Clips.remove(Clips.selected));
$('#recordingsList').addEventListener('click',e=>{const b=e.target.closest('[data-clip]');if(b)Clips.open(b.dataset.clip);});
$('#recordingsDialog').addEventListener('close',()=>{$('#clipPreview').pause();});
window.addEventListener('pagehide',()=>{Rec.drop();if(RET)queueAppResults();});
function preserveRecordingVisibility() {
  if(document.visibilityState==='hidden')Rec.drop();
  else if(document.visibilityState==='visible' && state.on && state.stream && !state.file)Rec.start(state.stream);
}
document.addEventListener('visibilitychange',preserveRecordingVisibility);
requestAnimationFrame(loop);
if (MODE_LIVE) startCamera(true);
async function startIncomingVideo() {
  const id=qp.get('input');if(!MODE_VIDEO)return;
  if(!id){if(qp.has('input-error')){state.flash={cls:'info',text:'Файл не передался. Выбери его здесь — оригинал остался в галерее.',until:Infinity};renderLive();}return;}
  const token={};state.incomingVideoToken=token;
  showMsg('Открываю видео','Подготавливаю выбранную запись.',[],true);
  try {
    const file=await VideoInput.read(id,TG_SLOT);
    if(state.incomingVideoToken!==token)return;
    if(!file)throw Error('Video missing');
    await analyzeVideo(file,'upload');
  } catch(e) {
    if(state.incomingVideoToken!==token)return;
    state.flash={cls:'info',text:'Временная копия недоступна. Выбери видео ещё раз — оригинал остался в галерее.',until:Infinity};hideMsg();renderLive();
  } finally {
    VideoInput.remove(id,TG_SLOT).catch(()=>{});
    if(state.incomingVideoToken===token)state.incomingVideoToken=null;
  }
}
startIncomingVideo();

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

'use strict';
/* ---------- the current attempt is recorded in the background (it never leaves the phone) ---------- */
const Rec = {
  mr: null, session: null, pending: new Set(), generation: 0,
  ok() { return typeof MediaRecorder !== 'undefined'; },
  start(stream) {
    if (!stream || this.mr && this.session?.stream === stream) return;
    if(this.mr)this.drop();
    if (!this.ok()) { Clips.notice='Браузер не поддерживает запись камеры. Для сохранения видео сними подход обычной камерой телефона.';Clips.render();return; }
    if (this.pending.size) {
      const generation=this.generation;
      this.drain().then(()=>{if(generation===this.generation && state.stream===stream && state.on && !state.file && !this.mr)this.start(stream);});
      return;
    }
    const types=['video/mp4','video/mp4;codecs=avc1.42E01E','video/webm;codecs=vp8','video/webm','video/webm;codecs=vp9'];
    const mime=types.find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch(e){return false;}}) || '';
    let mr;
    try { mr=new MediaRecorder(stream,Object.assign({videoBitsPerSecond:1500000},mime?{mimeType:mime}:{})); }
    catch(e) { Clips.notice='Не удалось начать запись видео. Анализ может работать, но для видеокопии потребуется обычная камера телефона.';Clips.render();return; }
    let resolve;
    const session={mr,stream,chunks:[],t0:performance.now(),mime,
      meta:{exercise:state.ex,name:info().name,unit:info().inc==='time'?'time':weighted()?'w':'bw'},done:new Promise(r=>{resolve=r;}),resolve:null,closed:false,timer:null};
    session.resolve=resolve;
    const complete=partial=>{
      const recovered=session.closed && session.partial && !partial;
      if(session.closed && !recovered)return;
      session.closed=true;session.partial=!!partial;clearTimeout(session.timer);
      if(this.session===session){this.session=null;this.mr=null;}
      if(!recovered)this.track(session);
      const type=(mr.mimeType || session.chunks.find(c=>c.type)?.type || mime || 'video/webm').split(';')[0];
      const blob=session.chunks.length?new Blob(session.chunks,{type}):null;
      const save=blob?.size?Clips.keep(blob,{...session.meta,mime:type,seconds:Math.max(0,((session.ended ?? performance.now())-session.t0)/1000),partialRecording:!!partial}):Promise.resolve(null);
      if(recovered)this.pending.add(save);
      save.then(clip=>{if(!partial)session.chunks=[];session.resolve(clip);}).catch(()=>session.resolve(null)).finally(()=>{this.pending.delete(recovered?save:session.done);Clips.render();});
      if(partial)Clips.notice='Запись завершилась не полностью. Сохрани доступное видео и проверь его перед закрытием страницы.';
      else if(recovered)Clips.notice='Полная запись восстановлена. Её можно сохранить на телефон.';
    };
    session.complete=complete;this.session=session;this.mr=mr;
    mr.ondataavailable=e=>{if((!session.closed || session.partial) && e.data?.size)session.chunks.push(e.data);};
    mr.onstop=()=>complete(false);
    mr.onerror=()=>{if(session.closed)return;Clips.notice='Запись прервалась. Сохраняю доступное видео.';if(this.session===session)this.finish('error');};
    try { mr.start(1000);Clips.render(); }
    catch(e) { complete(false);Clips.notice='Телефон не смог начать запись видео.';Clips.render(); }
  },
  track(session) { this.pending.add(session.done); },
  secs() { return this.session && this.mr ? (performance.now()-this.session.t0)/1000 : 0; },
  finish(reason='camera') {
    const session=this.session;if(!session)return Promise.resolve(null);
    this.session=null;this.mr=null;session.ended=performance.now();session.meta.reason=reason;this.track(session);
    session.timer=setTimeout(()=>session.complete(true),8000);
    try { if(session.mr.state!=='inactive')session.mr.stop(); }
    catch(e) { session.complete(true); }
    Clips.render();return session.done;
  },
  drop() { this.generation++;return this.finish(); },
  restart() {
    const stream=state.stream,generation=this.generation;
    return this.finish('set').then(clip=>{if(stream && state.stream===stream && state.on && !state.file && generation===this.generation)this.start(stream);return clip;});
  },
  async drain() { while(this.pending.size)await Promise.all([...this.pending]); },
  async take() { const clip=await this.finish('retry');await this.drain();return (clip || Clips.latest())?.blob || null; }
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
  const acts = [];
  if (Rec.mr) acts.push({label:'Завершить запись',primary:true,run:finishAndOpenRecording});
  else acts.push({ label: 'Записать вручную', primary:true, run: () => { hideMsg(); stopCamera(); manualSet(); } });
  acts.push({ label: onContinue ? 'Продолжить' : 'Выключить камеру', run: () => { hideMsg(); if (onContinue) onContinue(); else stopCamera(); } });
  showMsg(title, why + (Rec.mr ? '\n\nЗапись видео продолжается. Заверши её, чтобы сохранить на телефон или разобрать повторно.' : '\n\nМожно записать подход вручную или выбрать сохранённое видео.'), acts);
}
async function finishAndOpenRecording() {
  const session=Rec.session;
  hideMsg();stopCamera();await Rec.drain();
  const clip=session ? await session.done : null;
  if(clip)Clips.open(clip.id);
  else showMsg('Видео не записалось','Телефон не передал запись. Можно выбрать другое видео или записать подход вручную.',[{label:'Выбрать видео',primary:true,run:()=>{hideMsg();pickVideo();}},{label:'Записать вручную',run:()=>{hideMsg();manualSet();}}]);
}
async function analyzeLive() {
  const blob = await Rec.take();
  stopStream(); releaseWake();
  if (!blob || blob.size < 2000) { showCameraMode(false); return showMsg('Запись не сохранилась', 'Телефон не дал записать видео. Сними подход обычной камерой телефона и выбери его здесь.', [{ label: 'Выбрать видео', primary: true, run: () => { hideMsg(); pickVideo(); } }, { label: 'Закрыть', run: hideMsg }]); }
  return analyzeVideo(blob, 'rec');
}
async function startRecordMode() { state.recOnly = true; await startCamera(); if (!state.on) state.recOnly = false; renderMain(); }
async function finishRecording() { state.recOnly = false; renderMain(); return analyzeLive(); }
/* Keep the native picker in the original tap, including on iPhone. */
function pickVideo(byWeight = false) {
  hideMsg();
  state.barNext = byWeight;
  $('#fileInput').click();
}

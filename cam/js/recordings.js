'use strict';
/* Original videos stay on this device. A failed analyzer never owns their lifetime. */
const Clips = {
  items: [], opening: null, selected: null, url: null, notice: '', saving: 0,
  db() {
    if (this.opening) return this.opening;
    this.opening = new Promise(resolve => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      let req;
      try { req = indexedDB.open('aitrainer-recordings-v1', 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => { const db=req.result; if (!db.objectStoreNames.contains('clips')) db.createObjectStore('clips',{keyPath:'id'}).createIndex('account','account'); };
      req.onsuccess = () => { req.result.onversionchange=()=>req.result.close(); resolve(req.result); };
      req.onerror = req.onblocked = () => resolve(null);
    });
    return this.opening;
  },
  async init() {
    const db=await this.db(); if (!db) return;
    try {
      const saved=await new Promise((resolve,reject)=>{ const tx=db.transaction('clips','readonly'),r=tx.objectStore('clips').index('account').getAll(TG_SLOT);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
      const all=new Map(saved.filter(c=>c.account===TG_SLOT).map(c=>[c.id,{...c,persistent:true}]));
      for (const c of this.items) all.set(c.id,c);
      this.items=[...all.values()].sort((a,b)=>b.at-a.at); this.render();
    } catch (e) { this.notice='Не удалось открыть сохранённые видео. Новую запись можно сохранить на телефон.'; this.render(); }
  },
  async keep(blob, meta) {
    if (!blob || !blob.size) return null;
    const at=Date.now(), mime=(blob.type || meta.mime || 'video/webm').split(';')[0];
    const extension=mime.includes('mp4') ? 'mp4' : mime.includes('quicktime') ? 'mov' : 'webm';
    const stamp=new Date(at).toISOString().replace(/[:.]/g,'-');
    const clip={...meta,id:'v'+at.toString(36)+Math.random().toString(36).slice(2,8),account:TG_SLOT,at,blob,mime,
      filename:'ii-trener-'+stamp+'.'+extension,persistent:false};
    this.items.unshift(clip); if(!$('#recordingsDialog').open)this.selected=clip.id; this.saving++; this.render();
    try {
      const db=await this.db(); if (!db) throw Error('Storage unavailable');
      await new Promise((resolve,reject)=>{const tx=db.transaction('clips','readwrite');tx.objectStore('clips').put({...clip,persistent:undefined});tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});
      clip.persistent=true;
    } catch (e) { this.notice='Не удалось сохранить копию в приложении. Сохрани видео на телефон перед закрытием этой страницы.'; }
    finally { this.saving--; this.render(); }
    return clip;
  },
  latest() { return this.items.find(c=>c.account===TG_SLOT) || null; },
  get(id) { return this.items.find(c=>c.account===TG_SLOT && c.id===id) || null; },
  file(clip) { return new File([clip.blob],clip.filename,{type:clip.mime}); },
  export(id) {
    const clip=this.get(id); if (!clip) return;
    // No await before share(): iPhone requires the original user activation.
    try {
      const file=this.file(clip);
      if (!this.downloadFallback && navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
        return navigator.share({files:[file],title:clip.name || 'Видео подхода'}).then(()=>{
          clip.shared=true;this.notice=clip.persistent ? 'Запись остаётся в приложении. Для обрезки открой сохранённое видео в «Фото».' : 'Видео передано выбранному приложению. Копию в памяти браузера сохранить не удалось.';this.render();
        }).catch(e=>{
          if (e?.name==='AbortError') return;
          this.downloadFallback=true;
          this.notice='Системное окно недоступно. Нажми «Сохранить видео», чтобы скачать файл.';this.render();this.open(clip.id);
        });
      }
    } catch (e) { /* native sharing is optional; keep the original container */ }
    this.downloadFallback=true;this.open(clip.id); $('#clipDownload').click();
    this.notice='Начато сохранение файла. Проверь «Файлы» или «Загрузки». На iPhone можно открыть видео и выбрать «Поделиться → Сохранить видео».';this.render();
  },
  open(id) {
    const clip=this.get(id) || this.latest();
    this.selected=clip?.id || null;
    if (this.url) { $('#clipPreview').pause();URL.revokeObjectURL(this.url);this.url=null; }
    $('#clipPreview').hidden=!clip; $('#clipActions').hidden=!clip;
    if (clip) {
      this.url=URL.createObjectURL(clip.blob);$('#clipPreview').src=this.url;
      $('#clipTitle').textContent=clip.name || 'Видео подхода';
      $('#clipDownload').href=this.url;$('#clipDownload').download=clip.filename;
      $('#clipDownload').hidden=true; // One visible save action for both native sharing and download.
    }
    this.render();openSheet($('#recordingsDialog'));
  },
  async retry(id) {
    const clip=this.get(id); if (!clip) return;
    closeSheet($('#recordingsDialog'));
    if(!cameraHas(clip.exercise) && addFree(clip.exercise,clip.name,clip.unit))el.sel.innerHTML+='<option value="'+esc(clip.exercise)+'">'+esc(clip.name)+'</option>';
    if (cameraHas(clip.exercise) && clip.exercise!==state.ex) setExercise(clip.exercise);
    return analyzeVideo(clip.blob,'rec');
  },
  async remove(id) {
    const clip=this.get(id);if(!clip || !window.confirm('Удалить эту запись из приложения? Копия, сохранённая в «Фото», останется.'))return;
    try {
      const db=await this.db();if(db)await new Promise((resolve,reject)=>{const tx=db.transaction('clips','readwrite');tx.objectStore('clips').delete(id);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});
      this.items=this.items.filter(c=>c.id!==id);this.open(this.latest()?.id);
    } catch(e){this.notice='Не удалось удалить запись. Попробуй ещё раз.';this.render();}
  },
  async leave(go) {
    await Rec.drain();
    if(this.items.some(c=>c.account===TG_SLOT && (!c.persistent || c.partialRecording) && !c.shared)) {
      showMsg('Сохрани видео перед выходом','Копию не получилось записать в память браузера. Сохрани её на телефон, чтобы не потерять после закрытия страницы.',[
        {label:'Открыть записи',primary:true,run:()=>{hideMsg();this.open();}},
        {label:'Выйти без копии',run:go}]);return;
    }
    go();
  },
  render() {
    const strip=$('#recordingStrip'), recording=typeof Rec!=='undefined' && !!Rec.mr, finishing=typeof Rec!=='undefined' && Rec.pending.size>0;
    strip.hidden=MODE_VIDEO || (!recording && !this.items.length && !this.saving && !finishing && !this.notice);
    const latest=this.latest();
    $('#recordingStatus').textContent=recording ? '● Камера записывает видео' : this.saving || finishing ? 'Сохраняю запись…' : '';
    $('#lastRecordingText').hidden=!latest;$('#lastRecordingText').textContent=latest ? 'Последняя запись · '+Math.round(latest.seconds || 0)+' с' : '';
    $('#recordingsBtn').hidden=!latest;$('#recordingsBtn').textContent='Сохранить видео';
    $('#recordingNotice').hidden=!this.notice;$('#recordingNotice').textContent=this.notice;
    $('#clipsHelp').textContent=this.notice || 'Записи хранятся на этом устройстве. Нажми «Сохранить видео», затем выбери сохранение в «Фото» или другой способ. Видео можно обрезать и разобрать повторно.';
    $('#recordingsList').innerHTML=this.items.filter(c=>c.account===TG_SLOT).map(c=>'<button type="button" data-clip="'+esc(c.id)+'"'+(c.id===this.selected?' aria-current="true"':'')+'><span>'+esc(c.name || 'Видео подхода')+'<small>'+esc(new Date(c.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))+' · '+Math.round(c.seconds || 0)+' с · '+(c.blob.size/1e6).toFixed(1).replace('.',',')+' МБ</small></span><span aria-hidden="true">'+(c.id===this.selected?'✓':'›')+'</span></button>').join('') || '<p>Сохранённые записи появятся здесь.</p>';
  }
};

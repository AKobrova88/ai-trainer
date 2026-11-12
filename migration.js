'use strict';
// Only device-local export. No API, analytics, account tokens or automatic redirect.
let slot='',saved=null;
try {const launch=new URLSearchParams(location.hash.slice(1)).get('tgWebAppData')||sessionStorage.getItem('trener.tg')||'';const u=JSON.parse(new URLSearchParams(launch).get('user')||'null');if(u&&/^\d{1,20}$/.test(String(u.id)))slot=':tg'+u.id;}catch(e){}
try{saved=JSON.parse(localStorage.getItem('ai-trainer-app-1'+slot)||'null');}catch(e){}
const $=id=>document.getElementById(id),keys=['program','programs','diary','schedule','voiceSettings','next','profile','videoLog','camReceipts','theme','usage','sub','healthOk'];
$('status').textContent=saved?'Локальная копия найдена. Сначала сохрани её, чтобы перенести программы и дневник.':'В этом браузере старых данных не найдено. Можно открыть приложение на новом адресе.';
$('backup').disabled=!saved;
$('backup').onclick=()=>{
 const data={app:'ii-trener',v:1,at:new Date().toISOString()};for(const k of keys)if(k in saved)data[k]=saved[k];
 const text=JSON.stringify(data),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download='ii-trener-kopiya.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
 $('help').hidden=false;$('copy').hidden=false;$('copy').value=text;$('clipboard').hidden=false;
};
$('clipboard').onclick=async()=>{try{await navigator.clipboard.writeText($('copy').value);$('clipboard').textContent='Скопировано';}catch(e){$('copy').select();$('clipboard').textContent='Выдели и скопируй текст';}};
if(typeof indexedDB!=='undefined'){
 const request=indexedDB.open('aitrainer-recordings-v1');request.onupgradeneeded=()=>request.transaction.abort();
 request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('clips'))return db.close();const tx=db.transaction('clips','readonly'),r=tx.objectStore('clips').getAll();
  r.onsuccess=()=>{for(const clip of r.result){if(clip.account!==slot||!clip.blob)continue;const a=document.createElement('a');a.textContent=clip.name||clip.filename||'Видео подхода';a.href=URL.createObjectURL(clip.blob);a.download=clip.filename||'ii-trener-video.webm';$('clips').appendChild(a);$('videos').hidden=false;}};tx.oncomplete=()=>db.close();
 };
}
if('serviceWorker'in navigator)navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))).catch(()=>{});

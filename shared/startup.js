'use strict';

const Startup = (() => {
  const ownScript = document.currentScript?.src;
  const releaseUrl = ownScript ? new URL('release.json',ownScript).href : null;
  let checkedAt = 0;
  const fonts = document.getElementById?.('web-fonts');
  if (fonts?.media === 'print') {
    const applyFonts = () => { fonts.media = 'all'; };
    if (fonts.sheet) applyFonts();
    else fonts.addEventListener('load', applyFonts, { once: true });
  }

  function telegram(enabled) {
    if (!enabled) return Promise.resolve(null);
    if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-web-app.js';
      script.onload = () => resolve(window.Telegram?.WebApp || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    }).catch(() => null);
  }

  async function freshRelease() {
    if(!releaseUrl || Date.now()-checkedAt<60000 || typeof fetch!=='function')return;
    checkedAt=Date.now();
    const scripts=[...document.querySelectorAll('script[src]')];
    const boot=scripts.find(s=>/\/(?:core\/config|cam\/js\/main)\.js(?:\?|$)/.test(s.src));
    const current=boot && new URL(boot.src).searchParams.get('v');
    if(!/^\d+\.\d+\.\d+$/.test(current || ''))return;
    const pending=()=>!!document.activeElement?.matches?.('input,textarea,[contenteditable="true"]') || !!document.querySelector('dialog[open]') || typeof state!=='undefined' && (state.on || state.cameraRequest || state.file || state.sets?.length || typeof Rec!=='undefined' && (Rec.mr || Rec.pending.size)) || typeof S!=='undefined' && (S.wiz || S.renaming || (typeof IMP!=='undefined' && IMP) || document.querySelector('#sheets>.sheet-wrap'));
    if(pending())return;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    try {
      const response=await fetch(releaseUrl,{cache:'no-store',signal:controller.signal});
      if(!response.ok)return;
      const latest=(await response.json()).version;
      if(!/^\d+\.\d+\.\d+$/.test(latest || '') || pending())return;
      const a=latest.split('.').map(Number),b=current.split('.').map(Number);
      const different=a.findIndex((n,i)=>n!==b[i]);
      if(different<0 || a[different]<b[different])return;
      const slot=typeof TG!=='undefined' ? TG.slot() : typeof TG_SLOT==='string' ? TG_SLOT : '';
      const guard=latest+':'+location.pathname+slot;
      try {if(sessionStorage.getItem('aitrainer.refresh')===guard)return;}catch(e){return;}
      if(typeof S!=='undefined' && typeof save==='function' && !save())return;
      try {sessionStorage.setItem('aitrainer.refresh',guard);}catch(e){return;}
      const next=new URL(location.href);next.searchParams.set('rev',latest);
      location.replace(next.href);
    }catch(e){/* Keep a working offline app and all local records. */}
    finally{clearTimeout(timer);}
  }
  document.addEventListener('DOMContentLoaded',freshRelease);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')freshRelease();});

  return { telegram, freshRelease };
})();

'use strict';
el.voice.addEventListener('click', () => {
  if (!('speechSynthesis' in window)) { el.voice.disabled = true; return; }
  Voice.on = !Voice.on; el.voice.setAttribute('aria-pressed', String(Voice.on)); store.set('aitrainer.v2', Object.assign(prefs, { voice: Voice.on }));
  if (Voice.on) Voice.say('Голос включён', 'on', true); else speechSynthesis.cancel();
});
const mq = window.matchMedia('(prefers-color-scheme: dark)');
if (mq.addEventListener) mq.addEventListener('change', readColors);
new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

fillSelect(); setAspect(1, 1); resize(); setExercise(state.ex); renderFacing(); renderPlan();
el.voice.setAttribute('aria-pressed', String(Voice.on));
requestAnimationFrame(loop);
if (MODE_VIDEO) pickVideo();
if (!Rec.ok()) $('#recBtn').hidden = true;

if (window.AI_TRAINER_STANDALONE) {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache is optional */ }); });
  }
}
if (IN_TG) {
  const s = document.createElement('script');
  s.src = 'https://telegram.org/js/telegram-web-app.js';
  s.onload = () => {
    const W = window.Telegram && window.Telegram.WebApp; if (!W) return;
    const call = (f, ...a) => { try { if (typeof W[f] === 'function') W[f](...a); } catch (e) { /* older Telegram */ } };
    const atLeast = v => { try { return W.isVersionAtLeast(v); } catch (e) { return false; } };
    const theme = () => {   /* the camera stays dark («Сумерки») in any Telegram theme */
      document.documentElement.setAttribute('data-theme', 'dark');
      if (atLeast('6.9')) { const bg = cssv('--bg'); call('setHeaderColor', bg); call('setBackgroundColor', bg); }
      if (atLeast('7.10')) call('setBottomBarColor', cssv('--bg'));
    };
    call('ready'); call('expand');
    if (atLeast('7.7')) call('disableVerticalSwipes');
    theme(); renderSets();
    try { W.onEvent('themeChanged', theme); } catch (e) { /* no theme events */ }
  };
  document.head.appendChild(s);
}
window.__aiTrainer = { state, AT, EX, recordSet, renderSets, setExercise, feed: (kp, t) => handleSnap(state.analyzer.update(kp, t)),
  end: () => { state.analyzer.endSet(); processEvents(state.analyzer.drain()); }, on: v => showCameraMode(v) };

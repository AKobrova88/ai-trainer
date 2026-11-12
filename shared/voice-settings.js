'use strict';
/* The profile owns voice preferences; every camera session reads the same account's app state. */
const VoicePrefs = (() => {
  const rates = [.85, 1, 1.15];
  const defaults = () => ({voiceId:'remote:anna', rate:1});
  const valid = p => !!p && typeof p.voiceId === 'string' && p.voiceId.length > 0 && p.voiceId.length <= 200 && rates.includes(p.rate);
  function legacy(key) {
    try { const raw = localStorage.getItem(key); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return raw; } }
    catch (e) { return null; }
  }
  function resolve(settings) {
    if (valid(settings)) return {voiceId:settings.voiceId, rate:settings.rate};
    const id = legacy('aitrainer.voice'), rate = Number(legacy('aitrainer.voice-rate') || 1);
    return {voiceId:typeof id === 'string' && id.length > 0 && id.length <= 200 ? id : defaults().voiceId, rate:rates.includes(rate) ? rate : 1};
  }
  const appKey = slot => 'ai-trainer-app-1' + (slot || '');
  function read(slot) {
    try { const app = JSON.parse(localStorage.getItem(appKey(slot)) || 'null'); return resolve(app?.voiceSettings); }
    catch (e) { return resolve(null); }
  }
  function systemVoices() {
    try { return window.speechSynthesis.getVoices().filter(v => /^ru([-_]|$)/i.test(v.lang || '')).filter((v,i,list) => list.findIndex(x => (x.voiceURI || x.name) === (v.voiceURI || v.name)) === i); }
    catch (e) { return []; }
  }
  const name = id => id === 'remote:aleksandr' ? 'Александр · мужской' : id === 'remote:anna' ? 'Анна · женский' : systemVoices().find(v => (v.voiceURI || v.name) === id)?.name || 'Голос устройства';
  return {defaults, valid, resolve, read, appKey, systemVoices, name};
})();

'use strict';
/* ---------- state ---------- */
let S;
function blankProfile() {
  return {text: '', goal: 'muscle', weight: 0, height: 0, age: 0, exp: 'normal', days: 3, mins: 60, place: 'gym', focus: {}, limits: [], other: [], filled: false};
}
function fresh() {
  return {v: 1, stage: 'welcome', user: null, tab: 'today', program: {days: []}, diary: [], next: null, pick: null, workout: null, rest: null,
    open: {}, dtab: 'hist', calM: [now().getFullYear(), now().getMonth()], prog: null, theme: 'dusk', profile: blankProfile(),
    sub: {promo: '', since: 0, paidUntil: 0, aiPlus: false, plusPick: false, packs: []}, usage: {m: '', prog: 0, photo: 0, ask: 0}, healthOk: false,
    camFacing: 'front', camEx: null, videoLog: [], demo: false};
}
function load() {
  try {
    let raw = localStorage.getItem(KEY);
    /* 2.6 kept one set of data per phone. Inside Telegram it goes to the first account that opens this version, never to a
       second one (that one starts from scratch) */
    if (!raw && KEY !== LEGACY_KEY && !localStorage.getItem(LEGACY_KEY + '.owner')) {
      raw = localStorage.getItem(LEGACY_KEY);
      localStorage.setItem(LEGACY_KEY + '.owner', TG.userId());
      if (raw) localStorage.setItem(KEY, raw);   // hers from now on, even if she closes the app before anything is saved
    }
    if (raw) { const s = JSON.parse(raw); if (s && s.v === 1 && s.program) { const o = Object.assign(fresh(), s); o.sub = Object.assign(fresh().sub, s.sub); if (o.sub.promo) o.sub.aiPlus = false; return o; } }
  } catch (e) { /* storage blocked or damaged: start fresh */ }
  return fresh();
}
let saveFailed = false;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); saveFailed = false; }
  catch (e) { if (!saveFailed) { saveFailed = true; setTimeout(() => toast('Не получается сохранить на телефоне — освободи место или выйди из режима «инкогнито»'), 300); } }
}
S = load();
S.renaming = null; S.wiz = null;

const dayById = id => S.program.days.find(d => d.id === id);
const nextDay = () => dayById(S.next) || S.program.days[0];


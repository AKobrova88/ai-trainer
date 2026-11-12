'use strict';
/* ---------- state ---------- */
let S;
function blankProfile() {
  return {text: '', goal: 'muscle', weight: 0, height: 0, age: 0, exp: 'normal', days: 3, mins: 60, place: 'gym', focus: {}, limits: [], other: [], filled: false};
}
function fresh() {
  return {v: 1, stage: 'welcome', user: null, tab: 'diary', program: {days: []}, programs: [], diary: [], schedule: [], next: null, pick: null, diaryPick: null, workout: null, rest: null,
    open: {}, dtab: 'hist', calM: [now().getFullYear(), now().getMonth()], calDay: null, prog: null, theme: 'dusk', profile: blankProfile(),
    sub: {promo: '', since: 0, paidUntil: 0, aiPlus: false, plusPick: false, packs: []}, usage: {m: '', prog: 0, photo: 0, ask: 0}, healthOk: false,
    camFacing: 'front', camEx: null, videoLog: [], camReceipts: [], demo: false};
}
/* S.program remains the editor's current program. The library owns all programs, by stable ID. */
function normalizeLibrary(s) {
  if (!Array.isArray(s.programs)) s.programs = [];
  let p = s.program;
  if (p && Array.isArray(p.days) && (p.id || p.days.length)) {
    if (!p.id) p.id = nid('p');
    if (!p.title) p.title = p.by === 'wish' ? 'Рекомендация ИИ' : 'Моя программа';
    const next = s.next || p.next; p.next = p.days.some(d => d.id === next) ? next : (p.days[0]?.id || null);
    s.next = p.next;
    const at = s.programs.findIndex(x => x.id === p.id);
    if (at < 0) s.programs.push(p); else s.programs[at] = p;
  } else if (s.programs.length) {
    p = s.program = s.programs[0]; s.next = p.next || p.days[0]?.id || null;
  }
  if (!Array.isArray(s.schedule)) s.schedule = [];
  for (const plan of s.schedule) if (!plan.programId) {
    const owners = s.programs.filter(x => x.days.some(d => d.id === plan.dayId));
    if (owners.length === 1) { plan.programId = owners[0].id; plan.programTitle = owners[0].title; }
  }
  if (s.workout && !s.workout.programId) {
    const owners = s.programs.filter(x => x.days.some(d => d.id === s.workout.dayId));
    if (owners.length === 1) { s.workout.programId = owners[0].id; s.workout.programTitle = owners[0].title; }
  }
  return s;
}
function libraryPrograms() { normalizeLibrary(S); return S.programs; }
function programById(id) { return libraryPrograms().find(p => p.id === id); }
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
    if (raw) { const s = JSON.parse(raw); if (s && s.v === 1 && s.program) { const o = Object.assign(fresh(), s); o.sub = Object.assign(fresh().sub, s.sub); if (o.sub.promo) o.sub.aiPlus = false; return normalizeLibrary(o); } }
  } catch (e) { /* storage blocked or damaged: start fresh */ }
  return fresh();
}
let saveFailed = false;
function save() {
  try { normalizeLibrary(S); localStorage.setItem(KEY, JSON.stringify(S)); saveFailed = false; return true; }
  catch (e) { if (!saveFailed) { saveFailed = true; setTimeout(() => toast('Не получается сохранить на телефоне — освободи место или выйди из режима «инкогнито»'), 300); } return false; }
}
S = load();
if (S.tab === 'camera') S.tab = 'today';
if (S.tab === 'today' && !S.workout) S.tab = 'diary';
if (!Array.isArray(S.schedule)) S.schedule = [];
S.justFinished = null;
S.renaming = null; S.wiz = null;

const dayById = id => S.program.days.find(d => d.id === id);
const nextDay = () => dayById(S.next) || S.program.days[0];


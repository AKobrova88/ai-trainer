'use strict';
/* ---------- state ---------- */
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
};
const prefs = store.get('aitrainer.v2', {});
const qp = new URLSearchParams(location.search);
/* Opened from the web app on the same site: ret= is where to go back, results travel in localStorage 'aitrainer.inbox'. */
const RET = (() => { const r = qp.get('ret') || ''; return /^\/[^/\\]/.test(r) ? r : null; })();
const MODE_VIDEO = qp.get('mode') === 'video';
const MODE_LIVE = !MODE_VIDEO && (qp.get('mode') === 'live' && (qp.get('src') === 'app' || IN_TG) || IN_TG && qp.has('ex') && !RET && qp.get('src') !== 'app');
const APP_INBOX = 'aitrainer.inbox' + TG_SLOT;
const pickOpt = (v, list, d) => list.includes(v) ? v : d;
const keys = Object.keys(EX.ex).filter(k => AT.analyzerFor(k));
/* An exercise from the bot without technique rules (a machine, an own exercise): the camera still runs and counts reps. */
const b64d = s => { try { return decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')))); } catch (e) { return ''; } };
/* today's workout from the app: [key, name, load type, weight, place in the workout, superset block, sets left, label] */
const PLAN = (() => {
  try {
    const a = JSON.parse(b64d(qp.get('plan') || '') || 'null');
    return Array.isArray(a) ? a.filter(x => Array.isArray(x) && x[0] && x[1]).slice(0, 14)
      .map(([k, n, u, w, pos, g, s, lab]) => ({ k: String(k).slice(0, 40), n: String(n).slice(0, 60), u, w: num(w), pos: Number.isInteger(pos) ? pos : null,
        g: g ? String(g).slice(0, 4) : '', s: Number.isInteger(s) ? s : null, lab: lab ? String(lab).slice(0, 4) : '' })) : [];
  } catch (e) { return []; }
})();
const FREE_KEYS = new Set();
const HOWTO_HAVE = new Set(["ab_wheel", "arnold", "assisted_pullup", "back_squat", "bb_curl", "bb_ohp", "bb_row", "bench", "bench_dips", "bird_dog", "box_squat", "bulgarian", "bw_squat", "cable_cross", "cable_crunch", "cable_curl", "cable_lateral", "cable_pullover", "cable_row", "calf_raise", "calf_raise_bw", "calf_raise_db", "chair_squat", "chest_press", "chest_row", "chinup", "close_bench", "crunch", "db_bench", "db_bench_neutral", "db_curl", "db_ext", "db_floor_press", "db_ohp", "db_pullover", "db_rear_fly", "db_row", "dead_bug", "deadlift", "dips", "face_pull", "front_raise", "front_squat", "glute_bridge", "glute_bridge_db", "glute_kickback", "goblet", "goblet_box", "good_morning", "hack_squat", "hammer_curl", "hanging_leg_raise", "hip_thrust", "hollow_hold", "hyperext", "incline_bench", "incline_db", "landmine", "lat_pulldown", "lateral_raise", "leg_curl", "leg_ext", "leg_press", "lunge_db", "lying_leg_raise", "machine_ohp", "mountain_climber", "overhead_cable_ext", "pallof", "pike_pushup", "plank", "preacher_curl", "pulldown_close", "pullup", "pushdown", "pushup", "pushup_incline", "rdl_bb", "rdl_db", "reverse_lunge", "reverse_pec", "seated_calf", "side_plank", "skull_crusher", "sl_glute_bridge", "smith_squat", "split_squat_db", "step_up", "step_up_bw", "step_up_db", "sumo_deadlift", "superman", "table_row", "tbar_row", "towel_row", "upright_row", "walking_lunge"]);
function addFree(k, n, u) {
  if (!/^[a-z][a-z0-9_:-]{0,39}$/.test(k || '') || keys.includes(k) || !n) return null;
  const inc = ({ bw: 'bw', time: 'time' })[u] || 'machine';
  EX.ex[k] = { name: n.slice(0, 60), inc, tips: ['Начни из исходного положения и замри на секунду — дальше считаю сам', 'Двигайся на полную амплитуду, без рывков'] };
  FREE_KEYS.add(k); return k;
}
for (const p of PLAN) addFree(p.k, p.n, p.u);
const FREE = addFree(qp.get('ex'), (qp.get('n') || '').trim(), qp.get('u'));
for (const entry of Object.values(CAT)) {
  if (entry.inc === 'time' || (entry.webOnly && IN_TG && !RET) || FREE_KEYS.has(entry.k)) continue;
  addFree(entry.k, entry.n, entry.inc === 'bw' ? 'bw' : 'w');
}
const cameraHas = k => keys.includes(k) || FREE_KEYS.has(k);
const isFree = () => FREE_KEYS.has(state.ex);
const FACING = { front: 'user', back: 'environment' };
const savedFacing = pickOpt(prefs.facing, ['user', 'environment'], null);
const state = {
  ex: FREE || (cameraHas(qp.get('ex')) ? qp.get('ex') : cameraHas(prefs.ex) ? prefs.ex : 'bw_squat'),
  depth: pickOpt(qp.get('d'), ['half', 'parallel', 'deep'], pickOpt(prefs.depth, ['half', 'parallel', 'deep'], 'parallel')),
  level: pickOpt(qp.get('l'), ['novice', 'normal', 'pro'], pickOpt(prefs.level, ['novice', 'normal', 'pro'], 'normal')),
  urlW: num(qp.get('w')), fromBot: qp.has('ex'),
  analyzer: null, snap: null, frame: null, flash: null, sets: [], view: null,
  preflight: false, preflightReady: false, preflightSince: null, revision: 0,
  detector: null, detectorLoading: null, stream: null, facing: (qp.get('src') === 'app' && savedFacing) || FACING[qp.get('cam')] || savedFacing || 'user', on: false, cameraRequest: null, busy: false, file: null
};
store.set('aitrainer.v2', Object.assign(prefs, { depth: state.depth, level: state.level }));
const el = {
  sel: $('#exSel'), stage: $('#stage'), howto: $('#howto'), vid: $('#vid'), cv: $('#cv'), hud: $('#hud'), repNum: $('#repNum'), repLabel: $('#repLabel'),
  cue: $('#cue'), cueText: $('#cueText'), camTip: $('#camTip'), main: $('#mainBtn'), flip: $('#flipBtn'), voice: $('#voiceBtn'),
  setsBox: $('#setsBox'), setList: $('#setList'), sendBox: $('#sendBox'), setsTitle: $('#setsTitle'),
  note: $('#stageNote'),
  msg: $('#stageMsg'), msgTitle: $('#msgTitle'), msgText: $('#msgText'), msgActions: $('#msgActions'), msgSpin: $('#msgSpin')
};
const info = () => EX.ex[state.ex];
const weighted = () => !['bw', 'time'].includes(info().inc);
const isHold = () => AT.isHold(state.ex);
const urlW = () => { const p = PLAN.find(x => x.k === state.ex); if (p && p.w) return p.w; return state.ex === qp.get('ex') ? state.urlW : null; };   // the weight in the link belongs to that exercise
/* voice: on by default when the camera is opened from the app or with the back camera; the choice is remembered */
Voice.on = 'speechSynthesis' in window && (prefs.voice != null ? !!prefs.voice : (!!RET || qp.get('src') === 'app' || state.facing === 'environment'));
Voice.queue = function (text) { if (!this.on || !('speechSynthesis' in window)) return; try { const u = new SpeechSynthesisUtterance(text); u.lang = 'ru-RU'; u.rate = 1.0; if (this.voice) u.voice = this.voice; speechSynthesis.speak(u); this.last = performance.now(); } catch (e) { /* speech unavailable */ } };
/* The phone's voices differ a lot: neural and «enhanced» voices put the stress right far more often. The best one is picked, the person can change it. */
const VOICE_KEY = 'aitrainer.voice';
const ruVoices = () => { try { return speechSynthesis.getVoices().filter(v => /^ru([-_]|$)/i.test(v.lang || '')); } catch (e) { return []; } };
const voiceRank = v => { const n = v.name || ''; return (/natural|neural|нейро/i.test(n) ? 60 : 0) + (/enhanced|premium|улучш|высок/i.test(n) ? 50 : 0) + (/online/i.test(n) ? 20 : 0) + (/google/i.test(n) ? 30 : 0) + (/milena|милена|svetlana|светлана|dariya|дарья|alena|алёна|алена/i.test(n) ? 10 : 0) + (/compact|eloquence|novelty|whisper/i.test(n) ? -40 : 0); };
function pickVoice() {
  const list = ruVoices(); if (!list.length) { Voice.voice = null; return list; }
  const saved = store.get(VOICE_KEY, '');
  Voice.voice = list.find(v => v.name === saved) || list.slice().sort((a, b) => voiceRank(b) - voiceRank(a))[0];
  return list;
}
function renderVoices() {
  const list = pickVoice(), row = $('#voiceRow'); if (!row) return;
  row.hidden = list.length < 2;
  if (list.length < 2) return;
  const sorted = list.slice().sort((a, b) => voiceRank(b) - voiceRank(a));
  $('#voiceSel').innerHTML = sorted.map(v => '<option value="' + esc(v.name) + '"' + (Voice.voice && v.name === Voice.voice.name ? ' selected' : '') + '>' + esc(v.name.replace(/^Microsoft |^Google /, '').replace(/ - Russian.*$| \(Russia\)/i, '')) + '</option>').join('');
}
if ('speechSynthesis' in window) { renderVoicesSoon(); try { speechSynthesis.addEventListener('voiceschanged', renderVoices); } catch (e) { speechSynthesis.onvoiceschanged = renderVoices; } }
function renderVoicesSoon() { setTimeout(renderVoices, 0); setTimeout(renderVoices, 800); }

/* Sets live in the browser until they are written to the diary, so a closed app never loses them. */
function loadSets() {
  const all = store.get(SETS_KEY, {});
  const s = all[state.ex];
  state.sets = s && s.date === today() ? s.sets : [];
}
function saveSets() {
  const all = store.get(SETS_KEY, {});
  for (const k of Object.keys(all)) if (!all[k] || all[k].date !== today()) delete all[k];
  if (state.sets.length) all[state.ex] = { date: today(), sets: state.sets }; else delete all[state.ex];
  store.set(SETS_KEY, all);
}


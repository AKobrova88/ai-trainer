'use strict';
/* ---------- the coach's voice: praise, gentle advice, an occasional joke ---------- */
const T = EX.tone;
const withJoke = s => Math.random() < T.joke_p ? s + ' ' + pick(T.jokes) : s;
function setVerdict(set, cue) {
  if (!set.n) return '';
  const q = set.c / set.n;
  if (q >= 0.8 || !cue) return withJoke(pick(T.good));
  return pick(q >= 0.5 ? T.ok : T.hard).replace('{cue}', cue.toLowerCase());
}
const Voice = {
  on: false, last: -Infinity, lastId: {}, guardUntil: 0, rate: 1,
  supported() { return !!window.speechSynthesis || RemoteVoice.available(); },
  utterance(text) {
    const u = new SpeechSynthesisUtterance(russianSpeech(text));
    u.lang = 'ru-RU'; u.rate = this.rate; if (this.voice) u.voice = this.voice;
    return u;
  },
  cancel() { RemoteVoice.cancel(); try { speechSynthesis.cancel(); } catch (e) { /* no speech engine */ } this.guardUntil = 0; },
  say(text, id, force, low) {
    if (!this.on || !this.supported()) return false;
    if ($('#cameraOptions')?.open && id !== 'test' && id !== 'on') return false;
    const now = performance.now();
    if (!force && now < this.guardUntil) return false;
    if (low && (this.remoteVoice ? RemoteVoice.busy : typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking)) return false;
    if (!force && now - this.last < (id && /^rep\d+$/.test(id) ? 450 : 1600)) return false;
    if (!force && id && Number.isFinite(this.lastId[id]) && now - this.lastId[id] < 12000) return false;
    try {
      if (this.remoteVoice) {
        if (!low) this.cancel();
        RemoteVoice.play(russianSpeech(text), this.remoteVoice, this.rate);
        this.last = now; if (id) this.lastId[id] = now; return true;
      }
      if (!low) speechSynthesis.cancel();
      speechSynthesis.speak(this.utterance(text)); this.last = now; if (id) this.lastId[id] = now;
      return true;
    } catch (e) { return false; }
  },
  announceStart() {
    if (this.say('Начинаю отсчёт.', 'start', true)) this.guardUntil = performance.now() + 1500;
  },
  queue(text) {
    if (!this.on || !this.supported() || performance.now() < this.guardUntil) return;
    if ($('#cameraOptions')?.open) return;
    if (this.remoteVoice) { RemoteVoice.play(russianSpeech(text), this.remoteVoice, this.rate, true); this.last = performance.now(); return; }
    try { speechSynthesis.speak(this.utterance(text)); this.last = performance.now(); } catch (e) { /* speech unavailable */ }
  }
};

/* One owner for live coaching. Recognition still records every finding; only
   speech is limited, across sets and revisits of the exercise on this day. */
const Coaching = {
  mode: 'calm', day: null, account: null, data: null, pending: new Map(), lastRemark: new Map(), rest: null,
  get profile() { return this.mode === 'every' ? {step:1,limit:2} : this.mode === 'summary' ? {step:0,limit:0} : {step:2,limit:3}; },
  load() {
    const day = today(), account = TG_SLOT;
    if (this.day === day && this.account === account) return;
    const saved = store.get('aitrainer.coach-day' + account, {});
    this.day = day; this.account = account;
    this.data = saved && saved.date === day && saved.exercises && typeof saved.exercises === 'object'
      ? saved : {date:day,exercises:{},encouragement:0,joke:0};
    this.pending.clear(); this.lastRemark.clear(); this.rest = null;
  },
  save() { store.set('aitrainer.coach-day' + this.account, this.data); },
  entry(key = state.ex) {
    this.load();
    let e = Object.hasOwn(this.data.exercises,key) ? this.data.exercises[key] : null;
    if (!e || !Array.isArray(e.spoken) || !Array.isArray(e.ids)) {
      e = {spoken:[],ids:[]}; this.data.exercises[key] = e;
    }
    return e;
  },
  correction(id, meta) {
    if (!meta || !meta.cue || !this.profile.limit || this.mode === 'every') return;
    const e = this.entry(), text = CoachText.key(meta.cue);
    if (e.spoken.length >= this.profile.limit || e.spoken.includes(text) || e.ids.includes(id)) return;
    this.pending.set(state.ex + ':' + id, {exercise:state.ex,id,text:meta.cue,priority:meta.pen || 0,until:performance.now()+5000});
  },
  count(n) {
    this.flush();
    if (this.profile.step && n % this.profile.step === 0) Voice.say(String(n), 'rep'+n, false, true);
  },
  completed(set) {
    this.load();
    if (state.file || this.mode === 'summary') return;
    const n = state.sets.filter(s => s.r > 0).length;
    const kind = n % 3 === 0 ? 'joke' : 'encouragement';
    const pool = kind === 'joke' ? CoachText.jokes : CoachText.encouragements;
    const at = Number.isSafeInteger(this.data[kind]) && this.data[kind] >= 0 ? this.data[kind] : 0;
    const amount = set.r + ' ' + (isHold() ? plural(set.r,'секунда','секунды','секунд') : plural(set.r,'повтор','повтора','повторов')) + '.';
    let advice = null;
    if (this.mode === 'every') {
      const e = this.entry(), A = state.analyzer;
      if (e.spoken.length < this.profile.limit) {
        advice = Object.keys(set.f || {}).map(id=>({id,text:A.meta(id).cue,priority:(set.f[id] || 0)*(A.meta(id).pen || 1)}))
          .filter(p=>p.text && !e.ids.includes(p.id) && !e.spoken.includes(CoachText.key(p.text))).sort((a,b)=>b.priority-a.priority)[0] || null;
      }
    }
    this.rest = {exercise:state.ex,text:[amount,advice ? advice.text.replace(/[.!?]+$/,'')+'.' : '',pool[at % pool.length]].filter(Boolean).join(' '),kind,advice,until:performance.now()+7000};
  },
  flush() {
    this.load();
    const now = performance.now();
    if (!state.on || state.file || !el.msg.hidden) return;
    if (this.rest) {
      const r = this.rest;
      if (r.exercise !== state.ex || r.until < now || this.mode === 'summary') this.rest = null;
      else if (state.preflight && Voice.say(r.text, 'coach-rest', false, true)) {
        if (r.advice) { const e=this.entry(); e.ids.push(r.advice.id); e.spoken.push(CoachText.key(r.advice.text)); }
        this.data[r.kind] = (Number.isSafeInteger(this.data[r.kind]) ? this.data[r.kind] : 0) + 1;
        this.save(); this.rest = null;
      }
    }
    if (state.preflight || this.mode === 'every' || now - (this.lastRemark.get(state.ex) ?? -Infinity) < 12000 || !this.profile.limit) return;
    const e = this.entry();
    if (e.spoken.length >= this.profile.limit) return;
    const candidates = [];
    for (const [key,p] of this.pending) {
      if (p.until < now || p.exercise === state.ex && (e.ids.includes(p.id) || e.spoken.includes(CoachText.key(p.text)))) { this.pending.delete(key); continue; }
      if (p.exercise === state.ex && (state.snap?.live || []).includes(p.id)) candidates.push(p);
    }
    candidates.sort((a,b)=>b.priority-a.priority);
    const p = candidates[0];
    if (p && Voice.say(p.text, 'coach-advice', false, true)) {
      e.ids.push(p.id); e.spoken.push(CoachText.key(p.text));
      this.lastRemark.set(state.ex,now); this.pending.delete(state.ex+':'+p.id); this.save();
    }
  }
};


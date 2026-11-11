'use strict';
/* ---------- sync with the server ----------
   The app keeps working with its data on the phone exactly as before; when signed in, changes go to the server
   record by record and changes from other devices come back.
   Records: state/main (program, next day, theme), profile/main (wishes WITHOUT injuries and limitations — those never
   leave the phone), workout/<id> (one diary entry), video/<id> (one video check result, never the video). */
const Sync = (() => {
  const KEY = 'trener.sync' + TG.slot();
  const STATE_KEYS = ['program', 'next', 'schedule', 'theme', 'healthOk'];
  const PROFILE_LOCAL = ['limits', 'other', 'text'];   // health and free text stay on the phone
  let timer = 0, running = null, again = false, applying = false;
  let meta = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {since: 0, known: {}}; } catch (e) { return {since: 0, known: {}}; } })();
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch (e) { /* full storage: sync starts over next time */ } };
  const hash = o => { const s = JSON.stringify(o); let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + s.length; };
  const clean = o => JSON.parse(JSON.stringify(o));
  function records() {
    const out = {};
    const st = {}; for (const k of STATE_KEYS) st[k] = S[k] === undefined ? null : S[k];
    out['state/main'] = st;
    const p = {...S.profile}; for (const k of PROFILE_LOCAL) delete p[k];
    out['profile/main'] = p;
    for (const w of S.diary) if (!w.demo && w.id) out['workout/' + w.id] = w;
    for (const v of S.videoLog) if (v.id) out['video/' + v.id] = v;
    return out;
  }
  function apply(ch) {
    const key = ch.c + '/' + ch.id, body = ch.deleted ? null : ch.body;
    if (ch.c === 'state' && body) { for (const k of STATE_KEYS) if (k in body) S[k] = body[k]; if (S.next && !S.program.days.some(d => d.id === S.next)) S.next = S.program.days[0] ? S.program.days[0].id : null; }
    else if (ch.c === 'profile' && body) { const local = {}; for (const k of PROFILE_LOCAL) local[k] = S.profile[k]; S.profile = {...blankProfile(), ...body, ...local}; }
    else if (ch.c === 'workout' || ch.c === 'video') {
      const list = ch.c === 'workout' ? S.diary : S.videoLog, i = list.findIndex(x => x.id === ch.id);
      if (body) { if (i >= 0) list[i] = body; else list.push(body); } else if (i >= 0) list.splice(i, 1);
      if (ch.c === 'workout') S.diary.sort((a, b) => b.date - a.date); else S.videoLog.sort((a, b) => (b.at || 0) - (a.at || 0));
    }
    meta.known[key] = {v: ch.version, h: body ? hash(clean(body)) : null};
  }
  /* first sync of this phone with the account: take what the account has, then send what only the phone has */
  async function pullFirst() {
    let since = 0, changed = false;
    for (let round = 0; round < 50; round++) {
      const r = await API.call('/v1/sync', {method: 'POST', body: {since, changes: []}});
      if (!r.ok) return r;
      applying = true;
      try { for (const c of r.data.changes) { apply(c); changed = true; } } finally { applying = false; }
      since = r.data.seq;
      if (!r.data.more) break;
    }
    meta.since = since; meta.pulled = true; keep();
    return {ok: true, changed};
  }
  async function run() {
    if (!TRENER.accounts || S.demo || !API.hasSession()) return {ok: false, skipped: true};
    let pulled = false;
    if (!meta.pulled) { const p = await pullFirst(); if (!p.ok) return p; pulled = p.changed; }
    const cur = records(), changes = [], now = Date.now();
    for (const [key, body] of Object.entries(cur)) {
      const k = meta.known[key], h = hash(body);
      if (!k || k.h !== h) { const [c, id] = key.split(/\/(.+)/); changes.push({c, id, body: clean(body), base: k ? k.v : 0, at: now}); }
    }
    for (const [key, k] of Object.entries(meta.known)) if (k.h !== null && !(key in cur)) { const [c, id] = key.split(/\/(.+)/); changes.push({c, id, deleted: true, base: k.v, at: now}); }
    let since = meta.since, sent = changes.slice(0, 400), changed = pulled;
    for (let round = 0; round < 20; round++) {
      const r = await API.call('/v1/sync', {method: 'POST', body: {since, changes: sent}});
      if (!r.ok) return r;
      for (const a of r.data.applied) { const key = a.c + '/' + a.id; const b = cur[key]; meta.known[key] = {v: a.version, h: b === undefined ? null : hash(b)}; }
      applying = true;
      try {
        for (const c of r.data.conflicts) { apply(c); changed = true; }
        for (const c of r.data.changes) { const k = meta.known[c.c + '/' + c.id]; if (!k || k.v < c.version) { apply(c); changed = true; } }
      } finally { applying = false; }
      since = meta.since = r.data.seq; keep();
      sent = changes.slice(400 * (round + 1), 400 * (round + 2));
      if (!r.data.more && !sent.length) break;
    }
    meta.at = Date.now(); keep();
    if (changed) {
      if (S.stage === 'start' && S.user && S.program.days.length) S.stage = 'app';   // a new phone got the account's program
      saveLocal(); if (!sheetTop()) render();
    }
    return {ok: true, changed};
  }
  /* one run at a time; a change during a run asks for another one */
  function now() {
    if (running) { again = true; return running; }
    running = run().catch(e => ({ok: false, error: {code: 'client', message: String(e)}})).then(r => { running = null; if (again) { again = false; schedule(500); } Account.syncDone(r); return r; });
    return running;
  }
  function schedule(ms = 2500) { if (applying) return; clearTimeout(timer); timer = setTimeout(now, ms); }
  function reset() { meta = {since: 0, known: {}}; keep(); }
  return {now, schedule, reset, lastAt: () => meta.at || 0, records};
})();
/* every save of the app's data also schedules a sync (the original save stays as it was) */
const saveLocal = save;
save = function () { const ok = saveLocal(); if (ok && API.hasSession()) Sync.schedule(); return ok; };

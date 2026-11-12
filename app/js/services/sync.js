'use strict';
/* Versioned records; health text and raw videos remain on this device. */
const Sync = (() => {
  const KEY = 'trener.sync.v2' + TG.slot(), PROFILE_LOCAL = ['limits', 'other', 'text', 'flags'];
  let timer = 0, running = null, again = false, applying = false, generation = 0;
  const empty = () => ({since: 0, known: {}, owner: S.ownerId || ''});
  let meta = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || empty(); } catch (e) { return empty(); } })();
  const clean = o => JSON.parse(JSON.stringify(o));
  function stable(o) { return JSON.stringify(o, function (k, v) { return v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {}) : v; }); }
  const hash = o => { const s = stable(o); let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + s.length; };
  const keep = () => localStorage.setItem(KEY, JSON.stringify(meta));
  function records() {
    normalizeLibrary(S);
    const out = {'settings/main': {voiceSettings: S.voiceSettings, theme: S.theme}};
    const p = {...S.profile}; for (const k of PROFILE_LOCAL) delete p[k]; out['profile/main'] = p;
    for (const p of S.programs) out['program/' + p.id] = p;
    for (const p of S.schedule) out['plan/' + p.id] = p;
    for (const w of S.diary) if (!w.demo && w.id) out['workout/' + w.id] = w;
    for (const v of S.videoLog) if (v.id) out['video/' + v.id] = v;
    return clean(out);
  }
  function checkpoint() {
    const key = KEY + '.before-account.' + (S.ownerId || 'local');
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({app:'ii-trener',v:1,at:new Date().toISOString(),...Object.fromEntries(BACKUP_KEYS.map(k => [k,S[k]]))}));
  }
  function backupConflict(key, body) {
    if (!body) return;
    const k = KEY + '.conflicts.' + S.ownerId, list = JSON.parse(localStorage.getItem(k) || '[]');
    if (!list.some(x => x.key === key && stable(x.body) === stable(body))) { list.push({key, body, at: Date.now()}); localStorage.setItem(k, JSON.stringify(list)); }
  }
  function reconcile() {
    S.program = S.programs.find(p => p.id === S.program?.id) || S.programs[0] || {days: []};
    S.next = S.program.next || S.program.days[0]?.id || null;
    S.diary.sort((a, b) => b.date - a.date); S.videoLog.sort((a, b) => (b.at || 0) - (a.at || 0)); normalizeLibrary(S);
  }
  function listFor(c) { return c === 'program' ? S.programs : c === 'plan' ? S.schedule : c === 'workout' ? S.diary : c === 'video' ? S.videoLog : null; }
  function preserve(c, id, body) {
    if (!body) return;
    backupConflict(c + '/' + id, body);
    const list = listFor(c); if (!list) return;
    const fork = clean(body); fork.id = id.slice(0, 48) + '.copy.' + hash(body).split(':')[0];
    if (c === 'program') fork.title = (body.title || 'Программа').slice(0, 170) + ' · сохранённая версия';
    if (!list.some(x => x.id === fork.id)) list.push(fork);
    if (c === 'program') for (const p of S.schedule) if (p.programId === id) p.programId = fork.id;
    if (c === 'program' && S.workout?.programId === id) S.workout.programId = fork.id;
  }
  function apply(ch, initial = false) {
    const key = ch.c + '/' + ch.id, body = ch.deleted ? null : ch.body, current = records()[key], known = meta.known[key];
    if (ch.c === 'state') {
      if (body) {
        for (const p of body.programs || (body.program?.id ? [body.program] : [])) if (!S.programs.some(x => x.id === p.id)) S.programs.push(clean(p));
        for (const p of body.schedule || []) if (!S.schedule.some(x => x.id === p.id)) S.schedule.push(clean(p));
      }
      return;
    }
    if (current && stable(current) !== stable(body) && (initial || !known || known.h !== hash(current))) preserve(ch.c, ch.id, current);
    const list = listFor(ch.c);
    if (list) {
      const i = list.findIndex(x => x.id === ch.id);
      if (body) { const value = {...clean(body), id: ch.id}; if (i < 0) list.push(value); else list[i] = value; }
      else if (i >= 0) list.splice(i, 1);
    } else if (ch.c === 'settings' && body) {
      S.voiceSettings = VoicePrefs.resolve(body.voiceSettings); if (body.theme) S.theme = body.theme;
    } else if (ch.c === 'profile' && body) {
      const local = {}; for (const k of PROFILE_LOCAL) local[k] = S.profile[k]; S.profile = {...blankProfile(), ...body, ...local};
    }
    meta.known[key] = {v: ch.version, h: body ? hash(body) : null}; reconcile();
  }
  async function pullFirst(epoch) {
    let since = 0, all = [], more = true;
    checkpoint();
    for (let round = 0; round < 200 && more; round++) {
      const r = await API.call('/v1/sync', {method: 'POST', body: {since, changes: []}});
      if (epoch !== generation) return {ok: false, skipped: true}; if (!r.ok) return r;
      all.push(...r.data.changes); since = r.data.seq; more = r.data.more;
    }
    if (more) throw new Error('Не удалось получить все данные аккаунта. Повтори синхронизацию.');
    applying = true; try { for (const ch of all) apply(ch, true); } finally { applying = false; }
    meta.since = since; meta.pulled = true; keep(); saveLocal(); return {ok: true, changed: all.length > 0};
  }
  async function run() {
    if (!TRENER.accounts || S.demo || !API.hasSession() || !S.ownerId) return {ok: false, skipped: true};
    if (typeof programEditable === 'function' && programEditable()) { schedule(5000); return {ok: false, skipped: true}; }
    if (meta.owner !== S.ownerId) reset(); const epoch = generation; let changed = false;
    if (!meta.pulled) { const r = await pullFirst(epoch); if (!r.ok) return r; changed = r.changed; }
    for (let round = 0; round < 200; round++) {
      const cur = records(), changes = [], now = Date.now();
      for (const [key, body] of Object.entries(cur)) {
        const k = meta.known[key]; if (!k || k.h !== hash(body)) { const [c, id] = key.split('/'); changes.push({c, id, body, base: k?.v || 0, at: now}); }
      }
      for (const [key, k] of Object.entries(meta.known)) if (k.h !== null && !(key in cur)) { const [c, id] = key.split('/'); changes.push({c, id, deleted: true, base: k.v, at: now}); }
      const sent = []; let bytes = 0;
      for (const ch of changes) { const n = stable(ch).length * 3; if (sent.length && (bytes + n > 900000 || sent.length >= 100)) break; sent.push(ch); bytes += n; }
      const r = await API.call('/v1/sync', {method: 'POST', body: {since: meta.since, changes: sent}});
      if (epoch !== generation) return {ok: false, skipped: true}; if (!r.ok) return r;
      const acknowledged = new Set();
      for (const a of r.data.applied) {
        const key = a.c + '/' + a.id, ch = sent.find(x => x.c === a.c && x.id === a.id);
        meta.known[key] = {v: a.version, h: ch?.deleted ? null : hash(ch.body)}; acknowledged.add(key);
      }
      applying = true;
      try {
        for (const ch of [...r.data.conflicts, ...r.data.changes]) {
          const key = ch.c + '/' + ch.id, known = meta.known[key];
          if (known && known.v >= ch.version) continue;
          apply(ch); changed = true;
        }
      } finally { applying = false; }
      meta.since = r.data.seq; keep(); saveLocal();
      const after = records();
      if (!r.data.more && !Object.entries(after).some(([k, v]) => meta.known[k]?.h !== hash(v)) && !Object.entries(meta.known).some(([k, v]) => v.h !== null && !(k in after))) break;
      if (round === 199) throw new Error('Синхронизация ещё не завершена. Повтори подключение.');
    }
    meta.at = Date.now(); keep(); if (S.stage === 'start' && S.user && S.program.days.length) S.stage = 'app';
    saveLocal(); if (changed && !sheetTop()) render(); return {ok: true, changed};
  }
  function now() {
    if (running) { again = true; return running; }
    running = run().catch(e => ({ok: false, error: {code: 'client', message: String(e.message || e)}})).then(r => {
      running = null; if (again) { again = false; schedule(500); } Account.syncDone(r); return r;
    }); return running;
  }
  function schedule(ms = 2500) { if (applying) return; clearTimeout(timer); timer = setTimeout(now, ms); }
  function reset() { generation++; meta = empty(); keep(); }
  const backupKey = () => KEY + '.before-account.' + (S.ownerId || 'local');
  return {now, schedule, reset, lastAt: () => meta.at || 0, records,
    hasBackup: () => !!localStorage.getItem(backupKey()), backup: () => JSON.parse(localStorage.getItem(backupKey()) || 'null')};
})();
const saveLocal = save;
save = function () { const ok = saveLocal(); if (ok && API.hasSession()) Sync.schedule(); return ok; };

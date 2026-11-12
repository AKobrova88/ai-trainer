'use strict';
/* ---------- API client ----------
   Access token (15 min) in memory, refresh token (30 days, one-time) in localStorage 'trener.auth'. No cookies:
   inside Telegram they are unreliable. Every answer is {ok, status, data, error: {code, message}}. */
const API = (() => {
  const AUTH = 'trener.auth' + TG.slot();   // one session per Telegram account on this phone
  let access = '', accessExp = 0, refreshing = null, epoch = 0;
  const load = () => { try { return JSON.parse(localStorage.getItem(AUTH) || 'null'); } catch (e) { return null; } };
  const store = v => { try { v ? localStorage.setItem(AUTH, JSON.stringify(v)) : localStorage.removeItem(AUTH); } catch (e) { /* private mode */ } };
  function setTokens(t) {
    epoch++;
    access = t.access_token; accessExp = t.access_expires_at || Date.now() + 10 * 60000;
    store({refresh: t.refresh_token, at: Date.now()});
  }
  function clear() { epoch++; access = ''; accessExp = 0; store(null); }
  const hasSession = () => !!(access || (load() || {}).refresh);
  async function raw(path, {method = 'GET', body, token, timeout = 15000} = {}) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : 0;
    try {
      const r = await fetch(TRENER.apiBase + path, {method, signal: ctl && ctl.signal,
        headers: {...(body !== undefined ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: 'Bearer ' + token} : {})},
        body: body !== undefined ? JSON.stringify(body) : undefined});
      let data = null;
      if (r.status !== 204) { try { data = await r.json(); } catch (e) { data = null; } }
      // not our API answering (a plain static server, a proxy page, a gateway error): the same as no connection
      if (!r.ok && (r.status >= 502 || !(data && data.error))) return {ok: false, status: 0, data: null, error: {code: 'offline', message: 'Нет связи с сервером'}};
      return r.ok ? {ok: true, status: r.status, data} : {ok: false, status: r.status, data, error: data.error};
    } catch (e) {
      return {ok: false, status: 0, data: null, error: {code: 'offline', message: 'Нет связи с сервером'}};
    } finally { if (timer) clearTimeout(timer); }
  }
  async function refresh() {
    if (!refreshing) {
      const perform = async () => {
        const saved = load(), started = epoch;
        if (!saved || !saved.refresh) return false;
        const r = await raw('/v1/auth/refresh', {method: 'POST', body: {refresh_token: saved.refresh}});
        if (started !== epoch) return hasSession(); // A different sign-in happened while this request was in flight.
        if (r.ok) { setTokens(r.data); return true; }
        if (r.status === 401) clear();
        return r.status === 0 ? null : false;
      };
      // A refresh token is single-use. Two browser tabs must read it only after acquiring the shared lock.
      const task = navigator.locks?.request ? navigator.locks.request(AUTH + '.refresh', perform) : perform();
      refreshing = task.finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  /* a request with the session: refresh the access token when it is old, retry once after 401 */
  async function call(path, opts = {}) {
    if (!access || Date.now() > accessExp - 30000) { const ok = await refresh(); if (!ok) return {ok: false, status: ok === null ? 0 : 401, error: {code: ok === null ? 'offline' : 'unauthorized', message: ok === null ? 'Нет связи с сервером' : 'Нужно войти'}}; }
    let r = await raw(path, {...opts, token: access});
    if (r.status === 401 && await refresh()) r = await raw(path, {...opts, token: access});
    return r;
  }
  return {raw, call, setTokens, clear, hasSession, refresh, refreshToken: () => (load() || {}).refresh || '', base: () => TRENER.apiBase};
})();

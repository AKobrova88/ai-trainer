'use strict';
/* ---------- access & AI allowance ---------- */
/* free: own program, diary, progress · trial: 14 days of everything, AI — 1 program · sub: camera + AI 3/10/30 a period */
/* signed in: the server decides (S.server, refreshed on every answer); otherwise the phone decides as in 2.6 */
function serverAccess() {
  const sv = S.acct && S.server;
  if (!sv || !sv.level) return null;
  if (sv.level === 'sub') return {level: 'sub', since: sv.since, test: !!sv.test || undefined, unlimited: !!sv.unlimited};
  if (sv.level === 'trial' && Date.now() < sv.until) return {level: 'trial', since: sv.since, until: sv.until, days: Math.max(1, Math.ceil((sv.until - Date.now()) / DAY))};
  return {level: 'free'};
}
function access() {
  const sa = serverAccess(); if (sa) return sa;
  const now = Date.now(), reg = S.user ? S.user.at : now, sb = S.sub;
  if (sb.promo) return {level: 'sub', since: sb.since || reg, test: true, unlimited: !!(sb.unlimited || (localPromo(sb.promo) || {}).unlimited)};
  if (sb.paidUntil > now) return {level: 'sub', since: sb.since || reg};
  const end = reg + PRICING.trialDays * DAY;
  if (now < end) return {level: 'trial', since: reg, until: end, days: Math.max(1, Math.ceil((end - now) / DAY))};
  return {level: 'free'};
}
const canCamera = () => access().level !== 'free';
/* a code accepted by the server (Account.redeem, with its «unlimited») or, without accounts, on the phone: mirror it here */
function applyPromo(code, unlimited) {
  const grant = state => {
    if (state.sub.promo !== code) { state.sub.promo = code; state.sub.since = Date.now(); }
    if (unlimited !== undefined) state.sub.unlimited = !!unlimited;
  };
  grant(S);
  // Activating access while previewing the example must also survive leaving it.
  if (S.demo && S.demoReturn) { const own = JSON.parse(S.demoReturn); grant(own); S.demoReturn = JSON.stringify(own); }
  return true;
}
function period() {
  const a = access();
  if (a.unlimited) return {key: 'unlimited', end: null};
  if (a.level === 'trial') return {key: 'trial', end: a.until};
  if (a.level !== 'sub') return {key: 'free', end: null};
  const len = PRICING.periodDays * DAY, n = Math.max(0, Math.floor((Date.now() - a.since) / len));
  return {key: 'sub' + n, end: a.since + (n + 1) * len};
}
function usage() {
  const p = period();
  if (S.usage.m !== p.key) S.usage = {m: p.key, prog: 0, photo: 0, ask: 0};
  return S.usage;
}
function allowance() {
  const a = access(), z = {prog: 0, photo: 0, ask: 0};
  if (a.unlimited) return {prog: Infinity, photo: Infinity, ask: Infinity};
  if (S.acct && S.server && S.server.allowance && a.level !== 'free') return {...S.server.allowance};
  if (a.level === 'trial') return {...PRICING.trialAi};
  if (a.level !== 'sub') return z;
  const r = {...PRICING.sub.ai};
  if (PRICING.addonsEnabled && S.sub.aiPlus && !a.test) for (const k in r) r[k] += PRICING.aiPlus.ai[k];
  return r;
}
const left = k => access().unlimited ? Infinity : Math.max(0, allowance()[k] - usage()[k]);
function spend(k) { if (access().unlimited) return; usage()[k]++; save(); Account.used(k); }


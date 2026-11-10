'use strict';
/* ---------- coach: last time, records, next weight ---------- */
const sameEx = (e, it) => e.name === it.name || (!!it.base && e.base === it.base && norm(e.name) === norm(it.name));
function lastSets(it) {
  for (const w of S.diary) { const e = w.items.find(i => sameEx(i, it)); if (e && e.sets.length) return {sets: e.sets, date: w.date}; }
  return null;
}
const e1 = s => s.w * (1 + Math.min(s.r, 12) / 30);
function bestE1(name, exceptId) {
  let b = 0;
  for (const w of S.diary) if (w.id !== exceptId) for (const e of w.items) if (e.name === name) for (const s of e.sets) b = Math.max(b, e1(s));
  return b;
}
function suggest(it) {
  const last = lastSets(it);
  if (it.sec) return {w: 0, text: last ? `Прошлый раз ${last.sets.map(s => s.r).join(' · ')} с. Цель — ${it.hi} с в каждом подходе.` : `Держи ${reps(it)} с с ровной техникой.`};
  if (!last) {
    if (!stepOf(it)) return {w: 0, text: `Сделай ${reps(it)} повторов чисто; если тяжело — упрощённый вариант.`};
    return {w: it.w, text: it.w ? `Первый раз: начни с ${fmt(it.w)} кг. Последние 2 повтора должны быть тяжёлыми, но чистыми — если легко, прибавь.` : 'Первый раз — подбери вес в первом подходе: последние 2 повтора тяжело, но чисто.'};
  }
  const lw = Math.max(...last.sets.map(s => s.w)), top = last.sets.length >= it.s && last.sets.every(s => s.r >= it.hi), st = stepOf(it);
  const was = last.sets.map(s => s.r).join(' · ');
  if (!st) return {w: 0, text: top ? `Прошлый раз ${was} — верх диапазона. Добавь медленный спуск 3 с или усложни вариант.` : `Прошлый раз ${was}. Добавь по повтору.`};
  if (top) return {w: Math.round((lw + st) * 10) / 10, up: true, text: `Прошлый раз ${fmt(lw)} кг × ${was} — все подходы на верх диапазона. Сегодня добавь вес: <b>${fmt(lw + st)} кг</b>.`};
  if (last.sets.some(s => s.r < it.lo)) return {w: lw, text: `Прошлый раз ${fmt(lw)} кг × ${was}. Оставь вес — цель минимум ${it.lo} повторов в каждом подходе.`};
  return {w: lw, text: `Прошлый раз ${fmt(lw)} кг × ${was}. Оставь вес и добери повторы до ${it.hi}.`};
}

/* replacements: same movement first, then the same muscle group; nothing that hurts a stated limitation */
function alternativesFor(it, n = 6) {
  const c = it.base && CAT[it.base];
  const avoid = new Set((S.profile.limits || []).flatMap(l => [...(AVOID[l] || [])]));
  const fitsPlace = k => placeFits(CAT[k].inc, S.profile.place);
  const pool = Object.values(CAT).filter(x => !x.webOnly && x.k !== it.base && !avoid.has(x.k) && fitsPlace(x.k));
  const same = c && c.p ? pool.filter(x => x.p === c.p) : [];
  const grp = c ? pool.filter(x => x.g === c.g && !same.includes(x)) : [];
  return [...same, ...grp].sort((a, b) => (b.cam - a.cam)).slice(0, n);
}
const placeFits = (inc, place) => place === 'gym' || inc === 'bw' || inc === 'time' || (place === 'dumbbells' && inc === 'db');


'use strict';
/* ---------- own program from screenshots or text: a port of the bot's importer ----------
   Understands «4×8», «4 x 8-10», «3 подхода по 12», «3×30 сек», a dose on the next line, day headings, and apps that show
   each exercise as a card («Вес 40 40 40» / «Повт 8-12 8-12 8-12»). Names stay the person's own; an exercise is linked to
   the catalogue only when the name says the same thing. */
const PHOTO_BREAK = '\u0000photo';
const X = '[xхXХ×*]', NUM = '\\d{1,3}', RANGE = `(${NUM})(?:\\s*[-–—/]\\s*(${NUM}))?`, SEC_UNIT = '(с|сек|секунд\\S*|s|sec|seconds?|мин|min|минут\\S*)';
const DOSE_RX = [
  new RegExp(`(?<!\\d)(${NUM})\\s*${X}\\s*${RANGE}\\s*${SEC_UNIT}?(?![а-яa-z])`, 'i'),
  new RegExp(`(?<!\\d)(${NUM})\\s*(?:подход\\S*|подх\\.?|сет\\S*|sets?)\\s*[·•,:;/|-]?\\s*(?:по|of|x|×|х)?\\s*${RANGE}\\s*(?:повтор\\S*|повт\\.?|раз\\S*|reps?)?\\s*${SEC_UNIT}?`, 'i'),
  new RegExp(`${RANGE}\\s*(?:повтор\\S*|повт\\.?|reps?)\\s*[,;·•]?\\s*(${NUM})\\s*(?:подход\\S*|подх\\.?|sets?)`, 'i'),
];
const REST_RX = new RegExp(`отдых\\S*\\s*:?\\s*(${NUM})(?:\\s*[-–]\\s*${NUM})?\\s*(с|сек|мин|min|s)?`, 'i');
const DAY_HEAD = /^\s*(день|day|т?ренировка|workout|занятие|неделя\s*\d+\s*день|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|пн|вт|ср|чт|пт|сб|вс|mon|tue|wed|thu|fri|sat|sun)(?![а-яёa-z])[\s\d.:№#АБВГДABCDEабвгдabcde-]*/i;
const GROUP_WORDS = new Set('ноги ног грудь груди спина спины плечи плеч руки рук бицепс трицепс пресс кор верх низ ягодицы ягодиц бедра икры дельты дельт широчайшие фулбади тело всё все всего жимы тяги кардио push pull legs leg upper lower body full chest back shoulders arms core abs glutes day и and + &'.split(' '));
const LONE_REPS = /^(.*?[A-Za-zА-Яа-яЁё)])\s{2,}(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?\s*(?:повт\S*|раз\S*|reps?)?\s*$/;
const NOISE = /^\W*(назад|готово|сохранить|начать|старт|меню|поделиться|редактировать|изменить|добавить|отдых|разминка|заминка|кардио|примечание|комментарий|итого|всего|упражнени[ея]|подходы?|повторения|вес|kg|кг|\d{1,2}:\d{2})\W*$/i;
const W_ROW = /^\s*(вес|weight)(?![а-яёa-z])[\s:.]*(.*)$/i, R_ROW = /^\s*(повт\S*|повтор\S*|reps?|раз)(?![а-яёa-z])[\s:.]*(.*)$/i;
function coachNote(text) {
  const t = String(text).replace(/^\s*\d{1,2}[.)]\s*/, '').replace(/^[^\p{L}\p{N}+]+/u, '').trim().toLowerCase();
  // an icon in front of the advice is often read as a letter: «▲ Увеличиваем вес» → «А Увеличиваем вес»
  return coachText(t) || coachText(t.replace(/^[\p{L}\p{N}]{1,2}\s+(?=\p{L}{3})/u, ''));
}
function coachText(t) {
  return /^(?:следим|держим|делаем|не\s+забыва\S*|важно)(?:\s|:|$)/u.test(t) || /^[а-яё]{3,}(?:аем|яем|уем|юем)(?:\s|$)/u.test(t)
    || /^(?:рекомендаци\S*|комментари\S*|совет\S*|заметк\S*|примечани\S*|подсказк\S*)(?:\s|:|$)/u.test(t)
    || /^(?:увеличива\S*|увеличи\S*|уменьша\S*|уменьши\S*|оставля\S*|остав\S*|закрепля\S*|снижа\S*|сниз\S*|повыша\S*|повыси\S*|добавля\S*|добав\S*|сохраня\S*|сохрани\S*|прибавля\S*|прибав\S*)(?:$|\s+(?:(?:рабоч\S*|текущ\S*|прежн\S*|немного|постепенно|все|всё|по|на|к)\s+){0,3}(?:вес\S*|нагруз\S*|\d))/u.test(t)
    || /^(?:рабоч\S*\s+)?вес\S*\s+(?:увелич\S*|повы\S*|уменьш\S*|сниж\S*|остав\S*|сохра\S*|прибав\S*)/u.test(t)
    || /^(?:в\s+следующ\S*\s+(?:раз|тренировк\S*|подход\S*)|на\s+следующ\S*\s+тренировк\S*|если\s+(?:легко|тяжело|получ\S*)|нужно\s+видео|нужен\s+видео\S*|сними\S*\s+видео|пришли\S*\s+видео)/u.test(t)
    || /^\+\s*\d+(?:[.,]\d+)?\s*(?:кг|kg)(?:\s|$)/u.test(t);
}
function importOrdinal(line) {
  const s = String(line).replace(/^\s*([\u2460-\u2473])\s*/u, (m, c) => (c.charCodeAt(0) - 0x245F) + ' ');
  const m = s.match(/^\s*(?:№\s*)?(?:[([]\s*(\d{1,2})\s*[)\]]\s*|(\d{1,2})(?:[.)]\s*|\s+))(?=[\p{L}])/u);
  if (m) return +(m[1] || m[2]);
  return null;
}
function importLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === PHOTO_BREAK) { out.push(PHOTO_BREAK); continue; }
    let line = fixOcr(String(lines[i] || '').trim());
    const next = lines[i + 1] !== PHOTO_BREAK ? String(lines[i + 1] || '').trim() : '';
    // OCR sometimes puts the verb or a table label on its own line.
    if (/^(?:увеличиваем|увеличить|уменьшаем|уменьшить|оставляем|повышаем|снижаем|прибавляем|добавляем)(?:\s+рабочий)?$/iu.test(line) && /^(?:(?:рабочий\s+)?вес|нагруз|по\s*\d|на\s*\d)/iu.test(next)) { line += ' ' + next; i++; }
    else if (/^(?:вес|weight|повт\.?|повторы|повторения|reps?)\s*:?$/iu.test(line) && /^\d[\d\s.,/хx×–—-]*(?:\s*(?:кг|kg))?$/iu.test(next)) { line += ' ' + next; i++; }
    if (line) out.push(line);
  }
  return out;
}
function importTracker(report = {}) {
  report.notes = report.notes || []; report.warnings = report.warnings || [];
  const c = {days: [], current: null, photo: 1, overlap: 0, report};
  c.day = (title, reason) => { c.current = {id: nid('r'), title: title || `День ${c.days.length + 1}`, items: [], _reason: reason}; c.days.push(c.current); c.overlap = 0; return c.current; };
  c.ensure = () => c.current || c.day(null, 'Не найдена явная граница');
  c.header = title => {
    if (c.current && norm(c.current.title) === norm(title)) return c.current;
    if (c.current && !c.current.items.length) { c.current.title = title; c.current._reason = 'Заголовок на скриншоте'; return c.current; }
    return c.day(title, 'Заголовок на скриншоте');
  };
  c.add = (it, number, photo = c.photo) => {
    let day = c.ensure();
    const last = day.items[day.items.length - 1];
    if (c.overlap > 0) {
      c.overlap--;
      const old = day.items.slice(-4).find(o => norm(o.name) === norm(it.name) && (number && o._number ? number === o._number : !number && !o._number && o === last));
      const sameDose = old && (!parseDose(it.raw || '') || ['s', 'lo', 'hi', 'w', 'sec'].every(k => old[k] === it[k]));
      if (sameDose && (number !== 1 || old === last)) { old._photos = [...new Set([...(old._photos || []), photo])]; return old; }
    }
    if (number === 1 && last && last._number && !(last._number === 1 && norm(last.name) === norm(it.name))) day = c.day(null, 'Нумерация упражнений началась заново с 1');
    else if (number && last && last._number && number < last._number) {
      const warning = `Нумерация ${last._number} → ${number}: проверь порядок фото и границы дней.`;
      if (!report.warnings.includes(warning)) report.warnings.push(warning);
    }
    it._number = number; it._photos = [photo]; day.items.push(it); return it;
  };
  c.note = (text, owner) => {
    if (owner) { owner.coachNotes = owner.coachNotes || []; if (!owner.coachNotes.includes(text)) owner.coachNotes.push(text); }
    report.notes.push({id: nid('note'), text, photo: c.photo, ownerId: owner ? owner.id : null, dayId: c.current ? c.current.id : null});
  };
  c.nextPhoto = () => { c.photo++; c.overlap = 4; };
  return c;
}
const CARD_NOISE = /^\W*(начать|добавить в план|заметка|завершить|пропустить|история|поделиться|\d{1,2}[:.]\d{2}(?!\d)|\d{1,2}\.\d{1,2}\.\d{2,4})/i;
const LEAD_JUNK = /^(?:\d{1,2}|[а-яёa-z]{1,2})[.)]?\s+(?=[А-ЯЁA-Z])/;
const STOP = new Set('в во на с со к ко и для по из от до за a the with on in of'.split(' '));

/* difflib.SequenceMatcher.ratio (Ratcliff–Obershelp), enough for short names */
function ratio(a, b) {
  if (!a.length && !b.length) return 1;
  const M = (a, b) => {
    if (!a.length || !b.length) return 0;
    let best = 0, ai = 0, bi = 0; let prev = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      const cur = new Array(b.length + 1).fill(0);
      for (let j = 1; j <= b.length; j++) if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) { best = cur[j]; ai = i - best; bi = j - best; } }
      prev = cur;
    }
    return best ? best + M(a.slice(0, ai), b.slice(0, bi)) + M(a.slice(ai + best), b.slice(bi + best)) : 0;
  };
  return 2 * M(a, b) / (a.length + b.length);
}
let IDX = null;
function catIndex() {
  if (IDX) return IDX;
  IDX = [];
  for (const c of Object.values(CAT)) for (const alias of [c.n, ...(SYN[c.k] || [])]) { const a = norm(alias.replace(/\(.*?\)/g, '')); if (a) IDX.push([c.k, a, new Set(a.split(' '))]); }
  return IDX;
}
const HOMO = {a: 'а', b: 'ь', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', n: 'п', o: 'о', p: 'р', r: 'г', t: 'т', u: 'и', x: 'х', y: 'у', g: 'д', 6: 'б', 3: 'з', 0: 'о', 4: 'ч'};
const HOMO_UP = {A: 'а', B: 'в', C: 'с', E: 'е', H: 'н', K: 'к', M: 'м', O: 'о', P: 'р', T: 'т', X: 'х', Y: 'у'};
const toCyr = t => String(t || '').split(' ').map(w => /[a-z]/i.test(w) ? [...w].map(ch => HOMO_UP[ch] || ch).join('').toLowerCase().split('').map(ch => HOMO[ch] || ch).join('') : w).join(' ');
function _match(text) {
  const t = norm(text);
  if (t.length < 3) return [null, 0];
  const toks = new Set(t.split(' '));
  let best = null, score = 0;
  for (const [k, alias, at] of catIndex()) {
    let r = ratio(t, alias);
    if ([...at].every(x => toks.has(x))) r = Math.max(r, .8 + .2 * Math.min(1, alias.length / Math.max(1, t.length)));
    else if (at.size >= 2 && [...at].filter(x => toks.has(x)).length >= at.size - 1 && t.includes(alias.slice(0, 5))) r = Math.max(r, .74);
    if (r > score) { best = k; score = r; }
  }
  return [best, score];
}
function matchEx(text, min = .72) {
  let [k, s] = _match(text);
  if (/[a-z]/i.test(text || '')) { const [k2, s2] = _match(toCyr(text)); if (s2 > s + .05) { k = k2; s = s2; } }
  return s >= min ? [k, s] : [null, s];
}
const tokSame = (t, a) => t === a || (Math.min(t.length, a.length) >= 3 && (t.startsWith(a) || a.startsWith(t)) && Math.abs(t.length - a.length) <= 3) || (Math.min(t.length, a.length) >= 4 && ratio(t, a) >= .8);
function covered(name, key) {
  const toks = norm(name).split(' ').filter(t => t && !STOP.has(t) && !/^\d+$/.test(t));
  if (!toks.length || !CAT[key]) return false;
  return [CAT[key].n, ...(SYN[key] || [])].some(alias => { const at = norm(alias).split(' ').filter(a => !STOP.has(a)); return toks.every(t => at.some(a => tokSame(t, a))); });
}
function resolve(name, min = .72) {
  const variants = [name, ...(/[a-z]/i.test(name) ? [toCyr(name)] : [])];
  for (const nm of variants) {
    const [key] = matchEx(nm, min);
    const plain = nm.replace(/\(.*?\)|\(.*$/g, ' ').trim();
    if (key && (plain === nm.trim() || norm(nm) === norm(CAT[key].n)) && covered(nm, key)) return [key, null];
    if (plain !== nm.trim() && norm(plain).length >= 3) { const [k2] = matchEx(plain, min); if (k2 && covered(plain, k2)) return [null, k2]; }
  }
  return [null, null];
}
function parseDose(text) {
  for (let pi = 0; pi < DOSE_RX.length; pi++) {
    const m = text.match(DOSE_RX[pi]);
    if (!m) continue;
    let s, lo, hi, unit;
    if (pi === 2) { lo = +m[1]; hi = +(m[2] || m[1]); s = +m[3]; unit = null; } else { s = +m[1]; lo = +m[2]; hi = +(m[3] || m[2]); unit = m[4]; }
    if (!(s >= 1 && s <= 12) || !(lo >= 1 && lo <= 300)) continue;
    let sec = false;
    if (unit) { sec = true; if (/^(мин|min)/i.test(unit)) { lo *= 60; hi *= 60; } }
    if (hi < lo) [lo, hi] = [hi, lo];
    let rest = null; const r = text.match(REST_RX);
    if (r) rest = +r[1] * ((/^(мин|min)/i.test(r[2] || '') || +r[1] <= 5) ? 60 : 1);
    return {s, lo, hi, sec, rest, span: [m.index, m.index + m[0].length]};
  }
  return null;
}
const LAT_LOOK = /^[ABCEHKMOPTXYacekmopxyr]+$/;
function fixOcr(line) {
  if ((line.match(/[А-Яа-яЁё]/g) || []).length >= 3) line = line.split(/(\s+)/).map(w => LAT_LOOK.test(w) ? toCyr(w) : w).join('');
  line = line.replace(/(\d)\s*[«»"'’]?\s*[кkK][кkK]?[гrГ](?![А-Яа-яЁёA-Za-z])/g, '$1 кг').replace(/(\d)\s*[сcC][еeE][кkK](?![А-Яа-яЁёA-Za-z])/g, '$1 сек');
  return line.replace(new RegExp(`(?<![А-Яа-яA-Za-z])[зЗ](?=\\s*${X}\\s*\\d)`, 'g'), '3').replace(new RegExp(`(?<=\\d${X})\\s*[зЗ](?=\\d|\\b)`, 'g'), '3')
    .replace(/(?<=\d)[оОoO](?=\d|\b)/g, '0').replace(/(?<![А-Яа-яA-Za-z])[оОoO](?=\d)/g, '0');
}
function cleanName(text) {
  let t = text.replace(/^[^А-Яа-яЁёA-Za-z0-9(]+/, '').replace(/^[([]\s*\d{1,2}\s*[)\]]\s*/, '').replace(/^[А-Яа-яЁёA-Za-z]\s+(?=[А-ЯЁA-Z][а-яё])/, '');
  t = t.replace(/(?:\s+[^\sА-Яа-яЁёA-Za-z0-9()]{1,2})+\s*$/, '');      // icons at the end of a card: «@ >», «›»
  t = t.replace(/^\s*(\d{1,2}[.)]|[-–—•·*])\s*/, '').replace(/^\d{1,2}\s+(?=[А-ЯЁA-Z])/, '');
  if (/\s{2,}\S/.test(t) && t.split('  ')[0].length > 3) t = t.replace(/\s{2,}.*$/, '');
  return t.replace(/[\s,;:–—-]+$/, '').replace(/\s+/g, ' ').trim().replace(/^[ .:]+|[ .:]+$/g, '');
}
const groupHeading = line => { const w = (line.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я+&]+/g) || []); return w.length >= 1 && w.length <= 5 && line.length <= 40 && w.every(x => GROUP_WORDS.has(x)) && w.some(x => x.length > 2); };
const dayTitle = (line, n) => { let t = line.replace(/^[\s:.\-—–]+|[\s:.\-—–]+$/g, '').replace(/^ренировка/, 'Тренировка').replace(/\s+/g, ' ').replace(/^(день|тренировка|day|workout)\s*(\d+)\s*[-–—·.:|•]+\s*/i, (m, a, d) => `${a} ${d} · `); return t ? (t[0].toUpperCase() + t.slice(1)).slice(0, 40) : `День ${n}`; };
const groupsOf = c => { c = c.trim(); return /\s{2,}/.test(c) ? c.split(/\s{2,}/).filter(g => g.trim()) : c ? [c] : []; };
function cardReps(content) {
  const d = parseDose(content); if (d) return [d.s, d.lo, d.hi];
  const groups = groupsOf(content), toks = g => g.match(/\d{1,3}\s*[-–—]\s*\d{1,3}|\d{1,3}|[A-Za-zА-Яа-яЁё]+/g) || [];
  let sets, first;
  if (groups.length >= 2) { sets = groups.length; first = toks(groups[0]); }
  else { const all = toks(content); sets = all.filter(t => /[-–—]/.test(t)).length || all.filter(t => /^\d+$/.test(t)).length || 1; first = all; }
  let lo = null, hi = null;
  for (let i = 0; i < first.length; i++) {
    const t = first[i], m = t.match(/(\d+)\s*[-–—]\s*(\d+)/);
    if (m) { lo = +m[1]; hi = +m[2]; break; }
    if (/^\d+$/.test(t)) { lo = hi = +t; break; }
    if (/^(max|макс\S*|мах|тах)$/i.test(t)) { const nx = first.slice(i + 1).find(x => /^\d+$/.test(x)); lo = hi = nx ? +nx : 12; break; }
  }
  if (lo == null || !(lo >= 1 && lo <= 300)) return null;
  return [Math.max(1, Math.min(10, sets)), Math.min(lo, hi), Math.max(lo, hi)];
}
function cardWeight(content) {
  const votes = new Map(), add = (w, v) => votes.set(w, (votes.get(w) || 0) + v);
  for (let g of (groupsOf(content).length ? groupsOf(content) : [content])) {
    g = g.split('/')[0].replace(/,/g, '.').replace(/(\d)\s*\.?\s*[взЗВ](?![а-яёА-ЯЁ])/g, '$1.3');
    const nums = g.match(/\d+(?:\.\d+)?/g); if (!nums) continue;
    add(parseFloat(nums[nums.length - 1]), 1);
    if (nums.length === 1 && !nums[0].includes('.') && [3, 4].includes(nums[0].length)) add(+nums[0] / 10, .9);
    if (nums.length === 2 && nums[0].length === 1 && !g.includes('.') && nums[1].length === 2) add(+(nums[0] + nums[1]) / 10, .9);
  }
  let best = null, bv = 0;
  for (const [w, v] of votes) if (w > 0 && w <= 500 && (v > bv || (v === bv && w > best))) { best = w; bv = v; }
  return best;
}
const MACHINE_RX = /тренаж|блок|смит|кроссовер|хаммер|машин|гравитрон|рычаж|платформ|голен|machine|cable|smith/i, FREE_RX = /штанг|гантел|гир|гриф|блин|диск|barbell|dumbbell|kettlebell/i,
  BODY_RX = /отжиман|подтягиван|планк|скручиван|гиперэкст|выпад|присед|берпи|прыж|бег|мост|вис|лодочк|push.?up|pull.?up|plank|crunch/i;
function guessInc(name, base, weighted, sec) {
  if (sec) return 'time';
  const b = base && CAT[base] ? CAT[base].inc : null;
  if (weighted) return b && !['bw', 'time'].includes(b) ? b : MACHINE_RX.test(name) ? 'machine' : 'db';
  return b || (MACHINE_RX.test(name) ? 'machine' : FREE_RX.test(name) ? 'db' : BODY_RX.test(name) ? 'bw' : 'db');
}
/* one recognised exercise → an item for the review screen: ok (catalogue), check (looks like one — confirm), new (own) */
function importItem(name, d, src, wHint) {
  name = name[0].toUpperCase() + name.slice(1);
  const [key, base] = resolve(name);
  let st, b = key || base;
  if (b) st = 'ok';
  else { const [loose, sc] = matchEx(name, .6); if (loose && sc >= .6) { st = 'check'; b = loose; } else st = 'new'; }
  const sec = !!(d && d.sec) || (b && CAT[b] && CAT[b].inc === 'time');
  const it = ex(name.slice(0, 60), b, d ? d.s : 3, d ? d.lo : sec ? 30 : 8, d ? d.hi : sec ? 45 : 12, wHint || 0);
  it.name = name.slice(0, 60); it.sec = sec; it.st = st; it.raw = src;
  it.inc = guessInc(name, b, !!wHint, sec);
  if (d && d.rest) it.rest = d.rest;
  if (st === 'new') { it.base = null; it.cam = false; }
  return it;
}
function parseImport(lines, report = {}) {
  lines = importLines(lines);
  const cardMode = lines.filter(x => x !== PHOTO_BREAK && (W_ROW.test(x || '') || R_ROW.test(x || ''))).length >= 2;
  return tidyImport(cardMode ? parseCards(lines, report) : parseList(lines, report));
}
function tidyImport(days) {
  const all = days.flatMap(d => d.items);
  const reps = all.filter(i => !i.sec && i.hi <= 40).map(i => i.hi).sort((a, b) => a - b), mid = reps.length ? reps[reps.length >> 1] : 12;
  for (const it of all) {
    // «Отведение бедер в тренажере (с» — the rest of the name went off the screen: take it from the same exercise elsewhere
    if ((it.name.match(/\(/g) || []).length > (it.name.match(/\)/g) || []).length) {
      const head = norm(it.name), full = all.find(o => o !== it && norm(o.name).startsWith(head) && o.name.length > it.name.length && !/\([^)]*$/.test(o.name));
      if (full) { it.name = full.name; if (full.base && !it.base) { it.base = full.base; it.cam = full.cam; it.inc = full.inc; } it.st = full.st; }
      else if (/\(\s*[^)]{0,3}$/.test(it.name)) it.name = it.name.replace(/\s*\(\s*[^)]{0,3}$/, '');
    }
    // 172 repetitions is a misread «12»: drop one digit (the value closest to the rest of the program wins) and ask to check
    if (!it.sec && it.hi > 40) {
      const fix = v => { const t = String(v), c = []; for (let k = 0; k < t.length; k++) { const n = +(t.slice(0, k) + t.slice(k + 1)); if (n >= 3 && n <= 30) c.push(n); } return c.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0]; };
      const was = it.lo === it.hi ? `${it.lo}` : `${it.lo}–${it.hi}`, lo = fix(it.lo) || mid, hi = it.hi === it.lo ? lo : (fix(it.hi) || lo);
      Object.assign(it, {lo: Math.min(lo, hi), hi: Math.max(lo, hi), _needsDose: true, _warn: `повторы прочитались как ${was}`});
    }
    if (it.w > 300) Object.assign(it, {_warn: (it._warn ? it._warn + '; ' : '') + `вес прочитался как ${fmt(it.w)} кг`, w: 0, _needsDose: true});
  }
  return days;
}
const SS_MARK = /^\s*(?:(\d{1,2})([абвгabcd])|([абвгabcd])(\d))(?=[\s.):\-—–]|$)[\s.):\-—–]*/i;
const SS_HEAD = /^\s*(?:супер|три|гигант|super|tri|giant)\s*-?\s*сет[а-яё]*(?![а-яёa-z])[\s:.\-—–\dх×x]*(?:раз|круг[а-яё]*)?\s*$|^\s*(?:super|tri|giant)\s*-?\s*sets?\s*[\s:.\-—–\d]*$/i;
/* the next line continues a name: «(…», «…)», an open bracket or a preposition at the end, or lower case that is not an exercise itself */
const wrapsName = (name, next) => /^\(/.test(next) || (next.match(/\)/g) || []).length > (next.match(/\(/g) || []).length
  || (name.match(/\(/g) || []).length > (name.match(/\)/g) || []).length || /(\s(с|со|на|в|во|для|и|к|от|по|из|под|над)|[-–(])$/i.test(name)
  || (/^[а-яё]/.test(next) && !matchEx(next, .8)[0]);
function parseList(lines, report = {}) {
  const tracker = importTracker(report), days = tracker.days; let cur = null, pending = null, open = null, ordinal = null;
  const joinPending = (name, line) => {
    if (norm(pending.name).endsWith(norm(name))) return;               // the same card again on the next screenshot
    const j = importItem(pending.name + ' ' + name, null, pending.raw + ' / ' + line, 0);
    Object.assign(pending, {name: j.name, base: j.base, cam: j.cam, st: j.st, inc: j.inc, sec: j.sec, raw: j.raw});
    const items = cur.items, first = it => (it._photos || [0])[0];
    const dup = items.find(o => o !== pending && norm(o.name) === norm(pending.name) && items.indexOf(o) >= items.length - 6 && first(o) < first(pending));
    if (dup) { items.splice(items.indexOf(pending), 1); dup._photos = [...new Set([...(dup._photos || []), ...(pending._photos || [])])]; pending = dup; }
  };
  const add = it => { const result = tracker.add(it, ordinal); cur = tracker.current; ordinal = null; return result; };
  for (const raw of lines) {
    if (raw === PHOTO_BREAK) { tracker.nextPhoto(); ordinal = null; continue; }
    let line = fixOcr(String(raw || '').trim()); if (!line) continue;
    if (coachNote(line)) { tracker.note(line, pending || (cur && cur.items[cur.items.length - 1])); continue; }
    if (/^\s*(?:№\s*)?\d{1,2}[.)]?\s*$/.test(line)) { ordinal = +line.replace(/\D/g, ''); continue; }
    ordinal = importOrdinal(line) || ordinal;
    if (SS_HEAD.test(line)) { open = {g: nid('g'), n: 0}; pending = null; continue; }
    let mk = null; const sm = line.match(SS_MARK);
    if (sm && line.length > sm[0].length + 2) { mk = sm[1] ? 'n' + sm[1] : 'l' + sm[3].toLowerCase().replace('a', 'а').replace('b', 'б').replace('c', 'в').replace('d', 'г'); line = line.slice(sm[0].length); open = null; }
    const tag = it => { if (!it || !cur) return it; if (mk) it.ss = 'g' + cur.id + mk; else if (open && open.n < SS_MAX) { it.ss = open.g; open.n++; } return it; };
    const rm = line.match(REST_RX);
    if (rm && rm.index === 0 && !parseDose(line)) { open = null; const last = days.length && days[days.length - 1].items.slice(-1)[0]; if (last) last.rest = +rm[1] * ((/^(мин|min)/i.test(rm[2] || '') || +rm[1] <= 5) ? 60 : 1); continue; }
    const head = line.match(DAY_HEAD);
    let d = parseDose(line);
    if (!d) { const lone = line.match(LONE_REPS); if (lone && matchEx(lone[1])[0]) { const lo = +lone[2], hi = +(lone[3] || lo); if (lo >= 1 && lo <= 50) d = {s: 3, lo: Math.min(lo, hi), hi: Math.max(lo, hi), sec: false, rest: null, span: [line.indexOf(lone[2], lone[1].length), line.length]}; } }
    if (!d && !head && groupHeading(line)) {
      pending = null; open = null; let title = line.replace(/^[\s:.\-—–]+|[\s:.\-—–]+$/g, ''); title = title[0].toUpperCase() + title.slice(1);
      cur = tracker.header(title); ordinal = null;
      continue;
    }
    if (head && !d) {
      const restT = line.slice(head[0].length).replace(/^[\s:—–-]+|[\s:—–-]+$/g, '');
      const k = restT.length > 6 ? matchEx(restT, .9)[0] : null;
      if (!k) { pending = null; open = null; ordinal = null; cur = tracker.header(dayTitle(line, days.length + 1)); continue; }
    }
    if (d) {
      let name = cleanName((line.slice(0, d.span[0]) + ' ' + line.slice(d.span[1])).replace(REST_RX, ''));
      name = name.replace(/(^|\s)(подход\S*|повтор\S*|раз|reps?|sets?|кг|kg)(?=\s|$)/gi, ' ').replace(/^[\s,.;:–—-]+|[\s,.;:–—-]+$/g, '').replace(/\s+/g, ' ');
      const wm = line.slice(d.span[1]).match(/(\d+(?:[.,]\d+)?)\s*(кг|kg)/i) || line.slice(0, d.span[0]).match(/(\d+(?:[.,]\d+)?)\s*(кг|kg)/i);
      if (wm) name = name.replace(wm[0], '').trim();
      const cont = pending && cur && cur.items.includes(pending) && /^[а-яёa-z(]/.test(name) && wrapsName(pending.name, name);
      if (cont) joinPending(name, line);
      else if (norm(name).length >= 3 && /[a-zа-я]{3,}/.test(norm(name))) { tag(add(importItem(name, d, line, wm ? parseNum(wm[1]) : 0), d)); pending = null; continue; }
      if (pending) {
        pending._photos = [...new Set([...(pending._photos || []), tracker.photo])];
        Object.assign(pending, {s: d.s, lo: d.lo, hi: d.hi}); if (d.sec) pending.sec = true; if (d.rest) pending.rest = d.rest;
        if (wm) pending.w = parseNum(wm[1]);
        pending.inc = guessInc(pending.name, pending.base, !!wm, pending.sec);
        pending.raw += ' / ' + line; delete pending._needsDose; pending = null;
      }
      ordinal = null;
      continue;
    }
    if (NOISE.test(line) || norm(line).length < 4 || !/[a-zа-яё]{3,}/.test(line.toLowerCase())) continue;
    const name = cleanName(line);
    if (pending && cur && cur.items.includes(pending) && pending._needsDose && wrapsName(pending.name, name)) { joinPending(name, line); continue; }
    if (matchEx(name)[0] || name.length >= 6) { pending = tag(add(importItem(name, null, line, 0))); pending._needsDose = true; }
  }
  return days.filter(x => x.items.length);
}
function parseCards(lines, report = {}) {
  const tracker = importTracker(report), days = tracker.days; let buf = [], item = null, ordinal = null, bufNumber = null, bufPhoto = 1;
  const nameOf = rows => rows.map((r, i) => i === 0 ? cleanName(r).replace(LEAD_JUNK, '') : cleanName(r)).join(' ').replace(/\s+/g, ' ').replace(/^[ .,:;]+|[ .,:;]+$/g, '').replace(/\(\s+/g, '(');
  const openCard = () => {
    const name = nameOf(buf), src = buf.join(' / '), number = bufNumber, photo = bufPhoto; buf = []; bufNumber = null;
    if (norm(name).length < 3 || !/[a-zа-яё]{3,}/.test(name.toLowerCase())) { item = null; return; }
    if (coachNote(name)) { tracker.note(name, item); return; }
    item = tracker.add(importItem(name, null, src, 0), number, photo);
    if (!item._reps) item._needsDose = true;
  };
  for (const raw of lines) {
    if (raw === PHOTO_BREAK) { tracker.nextPhoto(); continue; }
    const line = fixOcr(String(raw || '').trim()); if (!line) continue;
    if (coachNote(line)) { if (buf.length) openCard(); tracker.note(line, item); continue; }
    if (/^\s*(?:№\s*)?\d{1,2}[.)]?\s*$/.test(line)) { if (buf.length) openCard(); ordinal = +line.replace(/\D/g, ''); continue; }
    const wm = line.match(W_ROW), rm = line.match(R_ROW);
    if (wm || rm) {
      if (buf.length) openCard();
      if (item) {
        item._photos = [...new Set([...(item._photos || []), tracker.photo])];
        if (wm) { const w = cardWeight(wm[2]); if (w) { item.w = w; item.inc = guessInc(item.name, item.base, true, item.sec); } item._wn = Math.max(item._wn || 0, groupsOf(wm[2]).length); }
        else { const d = cardReps(rm[2]); if (d) { let [s, lo, hi] = d; if (groupsOf(rm[2]).length < 2 && (item._wn || 0) >= 2 && !parseDose(rm[2])) s = Math.max(s, item._wn); item.s = item._reps ? Math.max(s, item.s) : s; item.lo = lo; item.hi = hi; item._reps = true; delete item._needsDose; } }
      }
      continue;
    }
    if (CARD_NOISE.test(line) || NOISE.test(line) || !/[A-Za-zА-Яа-яЁё]{3,}/.test(line)) continue;
    const head = line.match(DAY_HEAD);
    if (head && line.length <= 60 && !matchEx(line.slice(head[0].length), .9)[0]) {
      if (buf.length) openCard();
      const previous = tracker.current;
      const day = tracker.header(dayTitle(line, days.length + 1));
      if (day !== previous) item = null;
      ordinal = null; continue;
    }
    if (groupHeading(line)) { if (buf.length) openCard(); tracker.header(dayTitle(line, days.length + 1)); item = null; ordinal = null; continue; }
    const inlineDose = parseDose(line);
    if (inlineDose) {
      if (buf.length) openCard();
      const parsed = parseList([line], {notes: [], warnings: []});
      if (parsed[0] && parsed[0].items[0]) { item = tracker.add(parsed[0].items[0], importOrdinal(line) || ordinal); ordinal = null; continue; }
    }
    const number = importOrdinal(line) || ordinal;
    const last = buf[buf.length - 1] || '';
    const sameCard = !number || (bufNumber && number === bufNumber);
    const joins = buf.length && sameCard && (/^[а-яёa-z]/.test(line) || (last.match(/\(/g) || []).length > (last.match(/\)/g) || []).length || /(\s(с|со|на|в|для|и|к)|[-–(])\s*$/.test(last));
    if (joins && buf.length < 4) buf.push(line);
    else { if (buf.length) openCard(); buf = [line]; bufNumber = number; bufPhoto = tracker.photo; }
    ordinal = null;
  }
  if (buf.length) openCard();
  for (const d of days) for (const it of d.items) { delete it._reps; delete it._wn; }
  return days.filter(x => x.items.length);
}


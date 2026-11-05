'use strict';
/* ---------- wishes in plain words → profile; profile → weekly program ----------
   Rules follow the bot (NSCA / ACSM, simplified): movement patterns, rep ranges by goal, less volume for novices,
   joint-friendly variants for stated limitations, double progression. Runs on the phone — nothing is sent anywhere. */

const GOAL_NAMES = {muscle: 'Форма и мышцы', fatloss: 'Похудение и рельеф', strength: 'Сила', health: 'Здоровье и осанка'};
const EXP_NAMES = {novice: 'Новичок', normal: 'Средний уровень', pro: 'Опытный'};
const PLACE_NAMES = {gym: 'Тренажёрный зал', dumbbells: 'Дома с гантелями', bodyweight: 'Дома без инвентаря'};
const LIMIT_NAMES = {knees: 'Колени', back: 'Спина, поясница', shoulders: 'Плечи'};
const OTHER_NAMES = {wrists: 'запястья', elbows: 'локти', neck: 'шея', hips: 'тазобедренный сустав'};
const MUSCLES = {glutes: 'Ягодицы', hams: 'Задняя поверхность бедра', quads: 'Передняя поверхность бедра', calves: 'Икры', back: 'Спина',
  chest: 'Грудь', shoulders: 'Плечи', arms: 'Руки', core: 'Пресс и кор'};
const LEVELS3 = {1: 'поддержка', 2: 'сильный', 3: 'главный'};

const NUMW = {'один': 1, 'одна': 1, 'одну': 1, 'два': 2, 'две': 2, 'двух': 2, 'три': 3, 'трех': 3, 'четыре': 4, 'четырех': 4, 'пять': 5, 'пяти': 5, 'шесть': 6, 'семь': 7, 'десять': 10, 'полтора': 1.5, 'полгода': 0.5};
const toN = s => s == null ? NaN : (NUMW[s] ?? parseFloat(String(s).replace(',', '.')));
const PAIN = /(бол(ит|ят|ь|и|ью|ел|езн)|побалива|травм|грыж|протруз|операц|ноет|ноют|хрустит|нельзя|противопоказ|не люблю|не могу|проблем\S* с|разрыв|растяжени|артроз|артрит|сколиоз|остеохондр|защемл|вылет)/;
const JOINTS = [['knees', /колен|мениск|крестообраз/], ['back', /спин|поясниц|позвон|грыж|протруз|сколиоз|остеохондр/], ['shoulders', /плеч|ротатор/],
  ['wrists', /запяст/], ['elbows', /локт/], ['neck', /шея|шеи|шею|шейн/], ['hips', /тазобедр/]];
const FOCUS_RX = [['hams', /задн\S* (поверхн|част)\S*( бедр\S*)?|бицепс\S* бедр|бицуху бедр/], ['glutes', /ягодиц|попа|попу|попы|попой|ягодичн/],
  ['quads', /квадри|передн\S* (поверхн|част)\S*( бедр\S*)?|бедр|(?<![а-яё])ног|(?<![а-яё])ножк/], ['calves', /икр/], ['back', /спин|осанк|широчайш|лопат/],
  ['chest', /груд/], ['shoulders', /плеч|дельт/], ['arms', /(?<![а-яё])рук|бицепс|трицепс/], ['core', /пресс|живот|талию|талия|(?<![а-яё])кор(?![а-яёa-z])|кубики|бок/]];

function parseWishes(text) {
  const raw = ' ' + String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ') + ' ';
  const P = blankProfile(); P.text = String(text || '').trim();
  const found = {};
  const clauses = raw.split(/[.;!?\n]|,\s*(?:но|а|однако)\s|\s—\s|\s-\s/).map(c => c.trim()).filter(Boolean);
  const pain = clauses.filter(c => PAIN.test(c));
  const calm = clauses.filter(c => !PAIN.test(c)).join(' . ');

  /* body */
  let m = raw.match(/(?:вес\S*|вешу|масса тела)\D{0,10}?(\d{2,3}(?:[.,]\d)?)/) ;
  if (!m) {
    const re = /(\d{2,3}(?:[.,]\d)?)\s*(?:кг|килограм\S*|kg)(?![а-яёa-z])/g; let x;
    while ((x = re.exec(raw))) { const pre = raw.slice(Math.max(0, x.index - 22), x.index); const v = toN(x[1]); if (v >= 35 && v <= 220 && !/жим|присед|тяг|штанг|гантел|станов|рабоч|снаряд|блин|минус|скинуть|сбросить|похудеть на/.test(pre)) { m = x; break; } }
  }
  if (m) { const v = toN(m[1]); if (v >= 35 && v <= 220) { P.weight = v; found.body = true; } }
  m = raw.match(/рост\S*\D{0,8}?(1[3-9]\d|2[0-2]\d)\b/) || raw.match(/\b(1[3-9]\d|2[0-2]\d)\s*(?:см|cm)(?![а-яёa-z])/);
  if (m) { P.height = +m[1]; found.body = true; }
  else if ((m = raw.match(/\b1[.,]([5-9]\d)\s*(?:м(?![а-яёa-z])|метр)/))) { P.height = 100 + +m[1]; found.body = true; }

  /* age vs experience: «2 года в зале» is experience, «мне 34» is age */
  const TRAIN_CTX = /зал|занима|трениру|опыт|стаж|хожу|спорт|фитнес|качаюсь/;
  m = raw.match(/(?:мне|возраст\S*)\s*(?:уже|почти|около)?\s*(\d{2})\b/);
  if (!m) { const re = /\b(\d{2})\s*(?:лет|год(?:а)?)(?![а-яёa-z])/g; let x; while ((x = re.exec(raw))) { const ctx = raw.slice(Math.max(0, x.index - 25), x.index + 30); if (!TRAIN_CTX.test(ctx)) { m = x; break; } } }
  if (m && +m[1] >= 14 && +m[1] <= 90) { P.age = +m[1]; found.age = true; }

  let months = null;
  if (/новичок|новенька|начинающ|никогда не (занима|трениров|ходил)|ни разу|только начина|первый раз в зал|с нуля|не занимал/.test(raw)) months = 0;
  const yre = /(?:около|примерно|почти|уже|больше|более|меньше|чуть больше)?\s*(\d+(?:[.,]5)?|один|одного|двух|два|три|трех|четыре|пяти|пять|десять|полтора|несколько)?\s*(год|года|лет)(?![а-яёa-z])/g; let y;
  while (months == null && (y = yre.exec(raw))) {
    const ctx = raw.slice(Math.max(0, y.index - 30), y.index + 40);
    if (!TRAIN_CTX.test(ctx)) continue;
    const n = y[1] === 'несколько' ? 3 : y[1] === 'одного' ? 1 : y[1] ? toN(y[1]) : 1;
    if (n > 0 && n < 40) months = n * 12;
  }
  if (months == null && (m = raw.match(/(\d+|полгода|пол года|пару|несколько)\s*(месяц\S*|мес)(?![а-яёa-z])/))) months = /пол/.test(m[1]) ? 6 : m[1] === 'пару' ? 2 : m[1] === 'несколько' ? 4 : toN(m[1]);
  else if (months == null && /полгода|пол года/.test(raw)) months = 6;
  if (months == null && /опытн|давно трениру|много лет|профессионал|кмс|мастер спорта/.test(raw)) months = 60;
  if (months != null) { P.exp = months < 6 ? 'novice' : months < 36 ? 'normal' : 'pro'; P.expMonths = months; found.exp = true; }

  /* how often and how long */
  m = raw.match(/(\d|один|одна|два|две|три|четыре|пять|шесть)\s*(?:[-–]\s*(\d|два|три|четыре|пять)\s*)?(?:раз\S*|трениров\S*|дн\S*)\s*(?:в|за)?\s*недел/);
  if (m) { P.days = Math.round(toN(m[2] || m[1])); found.days = true; }
  else if (/через день/.test(raw)) { P.days = 3; found.days = true; }
  else if (/каждый день|ежедневно/.test(raw)) { P.days = 5; found.days = true; }
  if (P.days) { P.daysAsked = P.days; P.days = Math.max(2, Math.min(5, P.days)); }
  m = raw.match(/(\d{2,3})\s*(?:мин|минут)/);
  let mins = m ? +m[1] : /полтора час/.test(raw) ? 90 : /полчаса|пол часа/.test(raw) ? 40 : /по часу|около часа|час(?![а-яёa-z])|1 час/.test(raw) ? 60 : /(\d)\s*час/.test(raw) ? +raw.match(/(\d)\s*час/)[1] * 60 : 0;
  if (mins) { P.mins = [45, 60, 75, 90].reduce((a, b) => Math.abs(b - mins) < Math.abs(a - mins) ? b : a); found.mins = true; }

  /* where */
  if (/(?<![а-яё])зал|тренажер|фитнес|спортзал|фитнес-клуб/.test(raw)) { P.place = 'gym'; found.place = true; }
  else if (/дома|домашн|без инвентар|без оборудован|на улице/.test(raw)) { P.place = /гантел|гир/.test(raw) ? 'dumbbells' : 'bodyweight'; found.place = true; }

  /* goal */
  const g = [['fatloss', /похуд|сбросить|скинуть|жир|сушк|лишн\S* вес|минус \d+|стройн|убрать живот|убрать бок/],
    ['strength', /сильн|(?<![а-яё])сила|силов|пауэр|рекорд|станов\S* на|жим на|подтянуться \d|больше вес/],
    ['muscle', /масс|набрать|мышц|объем|подкачат|накачат|форм|подтянут|рельеф|круглее|упруг/],
    ['health', /осанк|здоров|самочувств|тонус|для себя|реабилит|выносл|энерги/]].find(([, r]) => r.test(raw));
  if (g) { P.goal = g[0]; found.goal = true; }

  /* focus: groups named outside the «it hurts» sentences; the first one named is the main accent */
  let rest = ' ' + calm + ' ';
  const hits = [];
  for (const [k, r] of FOCUS_RX) {
    const rx = new RegExp(r.source, 'g'); let x;
    while ((x = rx.exec(rest))) { hits.push([x.index, k]); rest = rest.slice(0, x.index) + ' '.repeat(x[0].length) + rest.slice(x.index + x[0].length); rx.lastIndex = x.index + x[0].length; }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const order = [...new Set(hits.map(h => h[1]))];
  const strong = /особенно|главн|в первую очередь|больше всего|акцент|прежде всего/;
  order.forEach((k, i) => { P.focus[k] = i === 0 ? 3 : 2; });
  if (order.length) {
    for (const c of clauses) if (strong.test(c)) for (const [k, r] of FOCUS_RX) if (r.test(c) && P.focus[k]) P.focus[k] = 3;
    found.focus = true;
  }

  /* limitations from the «it hurts / I can't» sentences */
  for (const c of pain) for (const [k, r] of JOINTS) if (r.test(c)) { if (LIMIT_NAMES[k]) { if (!P.limits.includes(k)) P.limits.push(k); } else if (!P.other.includes(k)) P.other.push(k); }
  if (!P.limits.includes('knees') && /глубок\S* присед/.test(pain.join(' '))) P.limits.push('knees');
  if (P.limits.length || P.other.length) found.limits = true;
  if (/беремен|после родов|кормлю груд/.test(raw)) { P.flags = {...(P.flags || {}), pregnant: true}; found.limits = true; }
  if (/гипертон|давлени|сердц|диабет|астм|эпилеп|варикоз/.test(raw)) { P.flags = {...(P.flags || {}), medical: true}; found.limits = true; }
  P.found = found;
  P.filled = true;
  return P;
}
const FOUND_CHIPS = [['goal', 'цель'], ['body', 'вес и рост'], ['exp', 'опыт'], ['days', 'сколько тренировок'], ['focus', 'акцент'], ['limits', 'ограничения'], ['place', 'где занимаешься'], ['mins', 'длительность'], ['age', 'возраст']];


'use strict';
/* ---------- program builder ---------- */
const LIB = {
  squat: {gym: ['back_squat', {knees: 'box_squat', back: 'leg_press'}], dumbbells: ['goblet', {knees: 'goblet_box'}], bodyweight: ['bw_squat', {knees: 'chair_squat'}]},
  quad: {gym: ['leg_press', {}], dumbbells: ['goblet', {knees: 'goblet_box'}], bodyweight: ['bw_squat', {knees: 'chair_squat'}]},
  hinge: {gym: ['rdl_bb', {back: 'hip_thrust'}], dumbbells: ['rdl_db', {back: 'glute_bridge_db'}], bodyweight: ['glute_bridge', {}]},
  glute: {gym: ['hip_thrust', {}], dumbbells: ['glute_bridge_db', {}], bodyweight: ['glute_bridge', {}]},
  glute2: {gym: ['glute_kickback', {}], dumbbells: ['sl_glute_bridge', {}], bodyweight: ['sl_glute_bridge', {}]},
  abduct: {gym: ['hip_abd', {}], dumbbells: [null, {}], bodyweight: [null, {}]},
  backExt: {gym: ['hyperext', {back: 'bird_dog'}], dumbbells: ['superman', {back: 'bird_dog'}], bodyweight: ['superman', {back: 'bird_dog'}]},
  hpush: {gym: ['bench', {shoulders: 'db_bench_neutral'}], dumbbells: ['db_floor_press', {}], bodyweight: ['pushup', {shoulders: 'pushup_incline'}]},
  hpull: {gym: ['cable_row', {back: 'chest_row'}], dumbbells: ['db_row', {}], bodyweight: ['table_row', {}]},
  vpush: {gym: ['db_ohp', {shoulders: 'landmine'}], dumbbells: ['db_ohp', {shoulders: 'db_floor_press'}], bodyweight: ['pike_pushup', {shoulders: 'pushup_incline'}]},
  vpull: {gym: ['lat_pulldown', {}], dumbbells: ['db_pullover', {shoulders: 'db_rear_fly'}], bodyweight: ['superman', {back: 'bird_dog'}]},
  single: {gym: ['bulgarian', {knees: 'step_up'}], dumbbells: ['split_squat_db', {knees: 'step_up_db'}], bodyweight: ['reverse_lunge', {knees: 'step_up_bw'}]},
  core: {gym: ['plank', {back: 'dead_bug'}], dumbbells: ['plank', {back: 'dead_bug'}], bodyweight: ['plank', {back: 'dead_bug'}]},
  core2: {gym: ['pallof', {}], dumbbells: ['side_plank', {}], bodyweight: ['side_plank', {}]},
  calves: {gym: ['seated_calf', {}], dumbbells: ['calf_raise_db', {}], bodyweight: ['calf_raise_bw', {}]},
  hamstring: {gym: ['leg_curl', {}], dumbbells: ['rdl_db', {back: 'glute_bridge_db'}], bodyweight: ['sl_glute_bridge', {}]},
  delts: {gym: ['lateral_raise', {}], dumbbells: ['lateral_raise', {}], bodyweight: ['pike_pushup', {shoulders: 'superman'}]},
  rear: {gym: ['face_pull', {}], dumbbells: ['db_rear_fly', {}], bodyweight: ['superman', {}]},
  fly: {gym: ['pec_deck', {shoulders: 'cable_cross'}], dumbbells: ['db_fly', {}], bodyweight: ['pushup_incline', {}]},
  biceps: {gym: ['db_curl', {}], dumbbells: ['db_curl', {}], bodyweight: ['table_row', {}]},
  triceps: {gym: ['pushdown', {}], dumbbells: ['db_ext', {}], bodyweight: ['pushup_incline', {}]},
};
const AVOID = {
  back: new Set(['back_squat', 'box_squat', 'rdl_bb', 'rdl_db', 'bb_row', 'superman', 'deadlift', 'sumo_deadlift', 'good_morning', 'front_squat', 'bb_ohp']),
  knees: new Set(['back_squat', 'bulgarian', 'split_squat_db', 'reverse_lunge', 'bw_squat', 'goblet', 'leg_ext', 'walking_lunge', 'lunge_db', 'front_squat', 'hack_squat']),
  shoulders: new Set(['bench', 'db_ohp', 'pike_pushup', 'pushup', 'db_pullover', 'pullup', 'dips', 'upright_row', 'bb_ohp', 'skull_crusher']),
};
const DOSE = {
  strength: {main: [4, 4, 6, 180], sec: [3, 6, 8, 120], acc: [2, 10, 12, 75], core: [3, 30, 45, 60]},
  muscle: {main: [4, 8, 12, 120], sec: [3, 8, 12, 90], acc: [3, 12, 15, 60], core: [3, 30, 45, 60]},
  fatloss: {main: [3, 10, 12, 90], sec: [3, 10, 15, 60], acc: [2, 12, 15, 45], core: [3, 30, 45, 45]},
  health: {main: [3, 8, 12, 90], sec: [2, 10, 15, 75], acc: [2, 12, 15, 60], core: [2, 20, 40, 60]},
};
const T = {
  G1: ['Ягодицы и задняя поверхность', [['glute', 'main'], ['hinge', 'sec'], ['hamstring', 'acc'], ['abduct', 'acc'], ['backExt', 'acc'], ['core', 'core']]],
  G2: ['Ягодицы и ноги', [['quad', 'main'], ['single', 'sec'], ['glute', 'sec'], ['abduct', 'acc'], ['calves', 'acc'], ['core2', 'core']]],
  G3: ['Ягодицы и кор', [['glute2', 'main'], ['single', 'sec'], ['hamstring', 'acc'], ['abduct', 'acc'], ['core', 'core'], ['core2', 'core']]],
  GL: ['Ягодицы и ноги', [['glute', 'main'], ['quad', 'sec'], ['hinge', 'sec'], ['abduct', 'acc'], ['hamstring', 'acc'], ['core', 'core']]],
  U1: ['Спина и верх тела', [['vpull', 'main'], ['hpull', 'sec'], ['hpush', 'sec'], ['vpush', 'sec'], ['rear', 'acc'], ['core2', 'core']]],
  U2: ['Верх тела', [['hpush', 'main'], ['hpull', 'main'], ['vpush', 'sec'], ['delts', 'acc'], ['biceps', 'acc'], ['triceps', 'acc']]],
  FB: ['Всё тело', [['glute', 'main'], ['hpull', 'sec'], ['hpush', 'sec'], ['single', 'sec'], ['vpull', 'sec'], ['core', 'core']]],
  FA: ['Всё тело A', [['squat', 'main'], ['hpush', 'main'], ['hpull', 'sec'], ['hinge', 'sec'], ['core', 'core']]],
  FBb: ['Всё тело B', [['hinge', 'main'], ['vpush', 'sec'], ['vpull', 'sec'], ['single', 'sec'], ['core2', 'core']]],
  FC: ['Всё тело C', [['squat', 'sec'], ['hpush', 'sec'], ['hpull', 'main'], ['rear', 'acc'], ['calves', 'acc']]],
  UA: ['Верх A', [['hpush', 'main'], ['hpull', 'main'], ['vpush', 'sec'], ['vpull', 'sec'], ['biceps', 'acc'], ['triceps', 'acc']]],
  LA: ['Низ A', [['squat', 'main'], ['hinge', 'sec'], ['single', 'sec'], ['calves', 'acc'], ['core', 'core']]],
  UB: ['Верх B', [['vpush', 'main'], ['vpull', 'main'], ['hpush', 'sec'], ['hpull', 'sec'], ['rear', 'acc'], ['delts', 'acc']]],
  LB: ['Низ B', [['hinge', 'main'], ['squat', 'sec'], ['single', 'sec'], ['hamstring', 'acc'], ['core2', 'core']]],
  PU: ['Жимы', [['vpush', 'main'], ['hpush', 'sec'], ['delts', 'acc'], ['triceps', 'acc'], ['core2', 'core']]],
  PL: ['Тяги', [['vpull', 'main'], ['hpull', 'sec'], ['rear', 'acc'], ['biceps', 'acc'], ['core', 'core']]],
  UP: ['Верх', [['hpush', 'main'], ['hpull', 'main'], ['vpush', 'sec'], ['vpull', 'sec'], ['rear', 'acc']]],
};
const PLANS = {
  lower: {2: ['GL', 'FB'], 3: ['G1', 'U1', 'G2'], 4: ['G1', 'U1', 'G2', 'U2'], 5: ['G1', 'U1', 'G2', 'U2', 'G3']},
  upper: {2: ['UA', 'LB'], 3: ['UA', 'LA', 'UB'], 4: ['UA', 'LA', 'UB', 'LB'], 5: ['UP', 'LA', 'PU', 'PL', 'LB']},
  even: {2: ['FA', 'FBb'], 3: ['FA', 'FBb', 'FC'], 4: ['UA', 'LA', 'UB', 'LB'], 5: ['UP', 'LA', 'PU', 'PL', 'LB']},
};
const PLAN_NAMES = {lower: 'акцент на низ тела', upper: 'акцент на верх тела', even: 'всё тело равномерно'};
const MUSCLE_OF = (() => {
  const m = {};
  const put = (g, ks) => ks.forEach(k => { m[k] = g; });
  put('glutes', ['hip_thrust', 'glute_bridge_db', 'glute_bridge', 'sl_glute_bridge', 'glute_kickback', 'hip_abd', 'step_up', 'step_up_db', 'step_up_bw']);
  put('hams', ['rdl_bb', 'rdl_db', 'leg_curl', 'good_morning', 'hyperext', 'deadlift', 'sumo_deadlift']);
  put('quads', ['back_squat', 'box_squat', 'front_squat', 'smith_squat', 'hack_squat', 'leg_press', 'leg_ext', 'goblet', 'goblet_box', 'bw_squat', 'chair_squat', 'bulgarian', 'split_squat_db', 'reverse_lunge', 'lunge_db', 'walking_lunge', 'hip_add']);
  put('calves', ['calf_raise', 'calf_raise_db', 'calf_raise_bw', 'seated_calf']);
  return k => m[k] || ({legs: 'quads', chest: 'chest', back: 'back', shoulders: 'shoulders', arms: 'arms', core: 'core'})[(CAT[k] || {}).g] || 'core';
})();
/* starting weight ≈ share of body weight for an average intermediate; novices less, experienced more. Rough on purpose:
   the first workout corrects it and the coach adds weight from there. Dumbbells — per hand. */
const RATIO = {hip_thrust: .9, rdl_bb: .6, back_squat: .6, box_squat: .5, leg_press: 1.2, leg_curl: .35, leg_ext: .4, hip_abd: .7, hip_add: .6,
  glute_kickback: .15, bench: .5, db_bench_neutral: .15, db_floor_press: .15, db_ohp: .12, lateral_raise: .06, cable_row: .55, lat_pulldown: .55,
  chest_row: .5, bb_row: .5, face_pull: .2, db_curl: .1, pushdown: .3, db_ext: .12, goblet: .25, goblet_box: .2, rdl_db: .25, glute_bridge_db: .35,
  split_squat_db: .12, bulgarian: .12, step_up: .12, step_up_db: .1, calf_raise: .8, seated_calf: .4, calf_raise_db: .15, db_row: .25,
  db_pullover: .15, db_rear_fly: .05, pallof: .15, landmine: .25, pec_deck: .35, cable_cross: .1, db_fly: .08};
function startWeight(k, P) {
  const r = RATIO[k], c = CAT[k];
  if (!r || !P.weight || !c || ['bw', 'time'].includes(c.inc)) return 0;
  const lvl = {novice: .6, normal: 1, pro: 1.3}[P.exp] || 1;
  const v = P.weight * r * lvl * (P.limits.length ? .9 : 1);
  const st = c.inc === 'db' ? (v < 10 ? 1 : 2) : 2.5;
  return Math.max(st, Math.round(v / st) * st);
}
function pickKey(pattern, P) {
  const row = LIB[pattern] && LIB[pattern][P.place];
  if (!row) return null;
  let [key, subs] = row;
  for (const lim of ['knees', 'back', 'shoulders']) if (P.limits.includes(lim) && subs[lim]) { key = subs[lim]; break; }
  if (key && P.exp === 'novice') key = ({pushup: 'pushup_incline', pike_pushup: 'pushup_incline', back_squat: P.limits.includes('knees') ? key : 'goblet', bulgarian: 'step_up', rdl_bb: P.place === 'gym' ? 'rdl_db' : key})[key] || key;
  if (key && P.exp === 'pro' && key === 'lat_pulldown' && !P.limits.includes('shoulders')) key = 'pullup';
  if (key && P.limits.some(l => AVOID[l] && AVOID[l].has(key))) {
    const alt = Object.values(CAT).find(c => !c.webOnly && c.p === CAT[key].p && !P.limits.some(l => AVOID[l] && AVOID[l].has(c.k)) && placeFits(c.inc, P.place) && c.k !== key);
    key = alt ? alt.k : null;
  }
  return key;
}
function buildProgram(P0) {
  const P = {...blankProfile(), ...P0, focus: {...(P0.focus || {})}, limits: [...(P0.limits || [])]};
  if (P.flags && P.flags.pregnant) P.goal = 'health';
  const F = P.focus;
  const lower = Math.max(F.glutes || 0, F.hams || 0, F.quads || 0), upper = Math.max(F.back || 0, F.chest || 0, F.shoulders || 0, F.arms || 0);
  const kind = lower >= 2 && lower >= upper ? 'lower' : upper >= 2 && upper > lower ? 'upper' : 'even';
  const days = Math.max(2, Math.min(5, P.days || 3));
  const maxEx = {45: 5, 60: 6, 75: 7, 90: 8}[P.mins] || 6;
  const goal = DOSE[P.goal] ? P.goal : 'muscle';
  const out = [];
  for (const code of PLANS[kind][days]) {
    let [title, slots] = T[code];
    slots = slots.map(s => [...s]);
    if (code === 'G1' && (F.hams || 0) > (F.glutes || 0)) title = 'Задняя поверхность и ягодицы';
    if (code === 'U1' && (F.back || 0) >= 2) { title = 'Спина и осанка'; if (!slots.some(s => s[0] === 'rear')) slots.splice(4, 0, ['rear', 'acc']); }
    if ((code === 'G2' || code === 'GL') && P.limits.includes('knees')) title += ', бережно к колену';
    if (/^U|^UP|^PU|^PL/.test(code)) {
      if ((F.arms || 0) >= 2 && !slots.some(s => s[0] === 'biceps')) slots.push(['biceps', 'acc'], ['triceps', 'acc']);
      if ((F.shoulders || 0) >= 2 && !slots.some(s => s[0] === 'delts')) slots.splice(3, 0, ['delts', 'acc']);
      if ((F.chest || 0) >= 2 && !slots.some(s => s[0] === 'fly')) slots.splice(2, 0, ['fly', 'acc']);
    }
    if ((F.core || 0) >= 2 && !slots.some(s => s[0] === 'core2')) slots.push(['core2', 'core']);
    if ((F.calves || 0) >= 2 && /^G|^L/.test(code) && !slots.some(s => s[0] === 'calves')) slots.push(['calves', 'acc']);
    /* keep within the session length: drop isolation first, then extra core */
    while (slots.length > maxEx) { const i = slots.map(s => s[1]).lastIndexOf('acc'); slots.splice(i >= 0 ? i : slots.map(s => s[1]).lastIndexOf('core') >= 0 ? slots.map(s => s[1]).lastIndexOf('core') : slots.length - 1, 1); }
    const used = new Set(), items = [];
    for (const [pattern, role] of slots) {
      let key = pickKey(pattern, P);
      if (!key || used.has(key)) {
        const alt = key && Object.values(CAT).find(c => !c.webOnly && c.p === CAT[key].p && !used.has(c.k) && placeFits(c.inc, P.place) && !P.limits.some(l => AVOID[l] && AVOID[l].has(c.k)));
        key = alt ? alt.k : null;
      }
      if (!key || !CAT[key]) continue;
      used.add(key);
      let [s, lo, hi, rest] = DOSE[goal][role];
      if (P.exp === 'novice' && (role === 'main' || role === 'sec')) s = Math.max(2, s - 1);
      if (P.exp === 'pro' && role === 'main') s += 1;
      const c = CAT[key], it = ex(null, key, s, lo, hi, 0);
      if (c.inc === 'time') { it.sec = true; it.lo = role === 'core' ? lo : 30; it.hi = role === 'core' ? hi : 45; }
      else if (role === 'core') { it.lo = 8; it.hi = 12; }
      it.rest = rest; it.role = role;
      it.w = startWeight(key, P);
      items.push(it);
    }
    out.push({id: nid('d'), title, items});
  }
  out.forEach((d, i) => { d.title = `День ${i + 1} · ${d.title}`; });
  return {days: out, kind, profile: P};
}
function loadShare(days) {
  const sets = {};
  for (const d of days) for (const it of d.items) { const g = it.base ? MUSCLE_OF(it.base) : 'core'; sets[g] = (sets[g] || 0) + it.s; }
  const total = Object.values(sets).reduce((a, b) => a + b, 0) || 1;
  const rows = Object.entries(sets).sort((a, b) => b[1] - a[1]);
  const top = rows.slice(0, 3), restN = rows.slice(3).reduce((a, r) => a + r[1], 0);
  const out = top.map(([g, n]) => ({g, name: MUSCLES[g], n, pct: Math.round(n / total * 100)}));
  if (restN) out.push({g: 'other', name: 'Остальное', n: restN, pct: 100 - out.reduce((a, r) => a + r.pct, 0)});
  return {rows: out, total, sets};
}
function explain(res) {
  const P = res.profile, d0 = DOSE[P.goal] || DOSE.muscle, n = res.days.length, why = [];
  why.push(`${n} ${plural(n, 'тренировка', 'тренировки', 'тренировок')} в неделю → ${PLAN_NAMES[res.kind]}${P.daysAsked && P.daysAsked !== n ? ` (просила ${P.daysAsked} — для восстановления оставила ${n})` : ''}.`);
  const sh = loadShare(res.days), main = Object.entries(P.focus).filter(([, v]) => v >= 3).map(([k]) => k);
  for (const g of main) if (sh.sets[g]) why.push(`${MUSCLES[g]} — главный акцент: ${sh.sets[g]} из ${sh.total} рабочих подходов в неделю, базовое упражнение первым.`);
  why.push(`Цель «${GOAL_NAMES[P.goal]}»: в базовых упражнениях ${d0.main[1]}–${d0.main[2]} повторов, отдых ${d0.main[3] >= 120 ? d0.main[3] / 60 + ' мин' : d0.main[3] + ' с'}.`);
  why.push(`${EXP_NAMES[P.exp]}: ${P.exp === 'novice' ? 'меньше подходов, простые варианты — сначала техника' : P.exp === 'pro' ? 'больше подходов в главном упражнении' : '3–4 подхода в главных упражнениях'}.`);
  if (P.limits.includes('knees')) why.push('Колени: без глубоких приседов и прыжков, жим ногами — до 90° в колене, выпады заменила зашагиваниями.');
  if (P.limits.includes('back')) why.push('Спина: без осевой нагрузки — тяги с упором и ягодичный мост вместо приседа со штангой.');
  if (P.limits.includes('shoulders')) why.push('Плечи: нейтральный хват и жим под углом вместо жима над головой.');
  if (P.other.length) why.push(`Учту: ${P.other.map(k => OTHER_NAMES[k]).join(', ')} — если упражнение даёт боль, нажми «Заменить».`);
  if (P.mins) why.push(`Тренировка ≈ ${P.mins} мин: ${{45: 5, 60: 6, 75: 7, 90: 8}[P.mins] || 6} упражнений максимум.`);
  why.push('Прогресс: когда все подходы на верх диапазона — тренер предложит прибавить вес.');
  return why;
}


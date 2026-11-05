'use strict';
/* ---------- example data: her own program from the screenshots and five weeks of history ---------- */
function demoProgram() {
  return {days: [
    {id: nid('d'), title: 'День 1 · Ягодицы', items: [
      ex('Лэндмайн присед', null, 3, 8, 12, 15, 'bb_upper'),
      ex('Отведение бедер в тренажере (с наклоном назад)', 'hip_abd', 3, 12, 15, 45),
      ex('Отведение бедер в тренажере (с наклоном вперед)', 'hip_abd', 3, 15, 15, 45),
      ex(null, 'hip_thrust', 3, 8, 12, 116.3),
      ex('Жим платформы одной ногой', 'leg_press', 3, 8, 12, 49.5),
      ex('Сгибание голени сидя (с наклоном вперед)', 'leg_curl', 3, 8, 12, 24.1),
      ex('Сведение бедер в тренажере сидя', 'hip_add', 3, 12, 12, 37.1)]},
    {id: nid('d'), title: 'День 2 · Задняя поверхность', items: [
      ex('Сгибание голени лёжа', 'leg_curl', 3, 8, 12, 32),
      ex('Румынская тяга в Смите', 'rdl_bb', 3, 8, 12, 51.3),
      ex('Обратные выпады с гантелью', 'reverse_lunge', 3, 8, 12, 24, 'db'),
      ex('Разгибание голени сидя', 'leg_ext', 3, 8, 12, 36),
      ex('Отведение бедер (с наклоном назад)', 'hip_abd', 3, 12, 15, 45),
      ex('Икры в тренажере сидя', 'seated_calf', 3, 12, 15, 20)]}]};
}
function demoDiary(prog) {
  const rand = rng(11), out = [], dates = [];
  const end = new Date(); end.setHours(18, 30, 0, 0); end.setDate(end.getDate() - 2);
  const start = new Date(end); start.setDate(start.getDate() - 35);
  let flip = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) if (d.getDay() === 1 || d.getDay() === 4) dates.push([new Date(d), flip++ % 2]);
  if (dates.length && dates[dates.length - 1][1] === 0) dates.pop();
  const perDay = [dates.filter(x => x[1] === 0).length, dates.filter(x => x[1] === 1).length], seen = [0, 0];
  for (const [date, di] of dates) {
    const day = prog.days[di], j = seen[di]++, lft = perDay[di] - 1 - j;
    const items = day.items.map(it => {
      const st = stepOf(it), back = Math.ceil(lft / 2) * st;
      const w = Math.max(st ? st : 0, Math.round((it.w - back) * 10) / 10), sets = [];
      for (let k = 0; k < it.s; k++) {
        let r = lft % 2 === 1 ? it.hi : it.lo + Math.floor(rand() * (it.hi - it.lo + 1));
        if (lft === 0 && di === 0) r = Math.max(it.lo, it.hi - Math.floor(rand() * 3));
        if (lft === 0 && di === 1) r = it.hi;
        sets.push({w, r});
      }
      return {name: it.name, base: it.base, sets};
    });
    out.push({id: nid('w'), date: date.getTime(), title: day.title, dur: 48 + Math.floor(rand() * 20), items});
  }
  return out.reverse();
}


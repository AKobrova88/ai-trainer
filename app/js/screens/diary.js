'use strict';
/* ---------- diary ---------- */
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function viewDiary() {
  const seg = `<div class="seg"><button data-act="dtab" data-v="hist" aria-pressed="${S.dtab === 'hist'}">История</button><button data-act="dtab" data-v="prog" aria-pressed="${S.dtab === 'prog'}">Прогресс</button></div>`;
  if (S.dtab === 'prog') return ['Дневник', seg + viewProgress()];
  const [y, m] = S.calM, first = new Date(y, m, 1), nDays = new Date(y, m + 1, 0).getDate(), shift = (first.getDay() + 6) % 7;
  const inMonth = S.diary.filter(w => { const d = new Date(w.date); return d.getFullYear() === y && d.getMonth() === m; });
  const has = new Set(inMonth.map(w => new Date(w.date).getDate()));
  let cells = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => `<div class="wd">${d}</div>`).join('');
  for (let i = 0; i < shift; i++) cells += '<div class="cal-d out"></div>';
  for (let d = 1; d <= nDays; d++) cells += `<button class="cal-d ${has.has(d) ? 'has' : ''} ${sameDay(new Date(y, m, d), new Date()) ? 'today' : ''}" aria-label="${d} ${MONTHS[m]} ${y}${has.has(d) ? ', есть тренировка' : ', без тренировок'}" ${has.has(d) ? `data-act="cal-go" data-v="${y}-${m}-${d}"` : 'disabled'}>${d}</button>`;
  const vol = inMonth.reduce((a, w) => a + w.items.reduce((b, e) => b + e.sets.reduce((c, s) => c + s.w * s.r, 0), 0), 0), mins = inMonth.reduce((a, w) => a + (w.dur || 0), 0);
  const logs = inMonth.map(logCard).join('') || `<div class="empty">${S.diary.length ? 'В этом месяце тренировок пока нет. Выбери другой месяц в календаре.' : 'Здесь появятся твои тренировки.'}<br><button class="btn" data-act="tab" data-v="today">К тренировке</button></div>`;
  return ['Дневник', `${seg}
    <section class="card cal"><div class="cal-h"><button class="icon-btn" data-act="cal-m" data-v="-1" aria-label="предыдущий месяц" style="transform:scaleX(-1)">${CHEV}</button><b>${MONTHS[m]} ${y}</b><button class="icon-btn" data-act="cal-m" data-v="1" aria-label="следующий месяц">${CHEV}</button></div>
      <div class="cal-g">${cells}</div>
      <div class="sumline"><span><b>${inMonth.length}</b> ${plural(inMonth.length, 'тренировка', 'тренировки', 'тренировок')}</span><span><b>${Math.floor(mins / 60)} ч ${mins % 60} мин</b></span><span><b>${fmt(vol / 1000)} т</b> поднято</span></div></section>
    ${logs}`];
}
function logCard(w) {
  const d = new Date(w.date), open = S.open[w.id], nSets = w.items.reduce((a, e) => a + e.sets.length, 0);
  const body = open ? `<div class="log-b">${w.items.map((e, ei) => {
    const cam = e.sets.filter(s => s.n), partial = e.sets.some(s => s.partial);
    const cameraNote = partial ? '3D: предварительные подсказки по видимым суставам, без общей оценки техники.'
      : cam.length ? `Камера: чисто ${cam.reduce((a, s) => a + s.c, 0)} из ${cam.reduce((a, s) => a + s.n, 0)}` : '';
    return `<div class="log-ex"><b>${esc(e.name)}</b><div class="sets-chips">${e.sets.map((s, si) => `<button class="sc" data-act="set-edit" data-v="${w.id}:${ei}:${si}">${s.w ? fmt(s.w) + ' × ' : ''}${s.r}${e.sec ? ' с' : ''}</button>`).join('')}<button class="sc add" data-act="set-add" data-v="${w.id}:${ei}">＋ подход</button></div><p class="hint" style="margin:8px 0 0">${esc(CoachText.summary(e.sets,{hold:!!e.sec}).text)}</p>${cameraNote ? `<div class="hint" style="margin-top:6px">${I.camera.replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')} ${cameraNote}</div>` : ''}</div>`;
  }).join('')}</div>` : '';
  return `<article class="log" id="log-${w.id}"><button class="log-h" data-act="log-toggle" data-v="${w.id}" aria-expanded="${!!open}"><span class="log-d"><b>${d.getDate()}</b><span>${WD[d.getDay()]}</span></span><span class="grow"><b style="display:block">${esc(w.title)}</b><span class="hint">${w.dur ? w.dur + ' мин · ' : ''}${w.items.length} ${plural(w.items.length, 'упражнение', 'упражнения', 'упражнений')} · ${nSets} ${plural(nSets, 'подход', 'подхода', 'подходов')}</span></span><span style="width:20px;color:var(--muted);transform:rotate(${open ? 90 : 0}deg);transition:transform .15s">${CHEV}</span></button>${body}</article>`;
}
function setSheet(wid, ei, si) {
  const w = S.diary.find(x => x.id === wid), e = w.items[ei], s = si == null ? null : e.sets[si], v = s || e.sets[e.sets.length - 1] || {w: 0, r: 10};
  S.setEdit = {wid, ei, si};
  sheet(e.name, `<div class="hint">${ruDate(w.date)} · ${esc(w.title)}</div>
    <div class="grid2"><div class="field"><label for="se-w">Вес, кг</label><input class="input" id="se-w" inputmode="decimal" value="${fmt(v.w || 0)}"></div><div class="field"><label for="se-r">${e.sec ? 'Секунды' : 'Повторы'}</label><input class="input" id="se-r" inputmode="numeric" value="${v.r}"></div></div>`,
    `${s ? '<button class="btn danger" data-act="se-del">Удалить</button>' : '<button class="btn" data-act="close">Отмена</button>'}<button class="btn primary" data-act="se-save">${s ? 'Сохранить' : 'Добавить подход'}</button>`);
  setTimeout(() => { const i = $('#se-w'); i && i.select(); }, 50);
}
function exHistory(name) {
  return S.diary.filter(w => w.items.some(e => e.name === name && e.sets.length)).map(w => { const e = w.items.find(x => x.name === name && x.sets.length); const top = e.sets.reduce((a, s) => s.w > a.w || (s.w === a.w && s.r > a.r) ? s : a, e.sets[0]); return {date: w.date, w: top.w, r: top.r, sets: e.sets, e1: Math.max(...e.sets.map(e1))}; }).reverse();
}
function viewProgress() {
  const names = [...new Set(S.diary.flatMap(w => w.items.filter(e => e.sets.some(s => s.w)).map(e => e.name)))];
  if (!names.length) return '<div class="empty">Прогресс появится после первых тренировок с весом</div>';
  if (!S.prog || !names.includes(S.prog)) S.prog = names[0];
  const h = exHistory(S.prog), f = h[0], l = h[h.length - 1], best = h.reduce((a, x) => x.e1 > a.e1 ? x : a, h[0]);
  const weeks = Math.max(1, Math.round((l.date - f.date) / (7 * 864e5))), dw = l.w - f.w;
  return `
    <div class="chips">${names.map(n => `<button class="chip" data-act="prog-ex" data-v="${esc(n)}" aria-pressed="${n === S.prog}">${esc(n.length > 28 ? n.slice(0, 27) + '…' : n)}</button>`).join('')}</div>
    <div class="kpis"><div class="stat"><b>${fmt(l.w)} кг</b><span>рабочий вес</span></div><div class="stat"><b>${dw > 0 ? '+' : ''}${fmt(dw)} кг</b><span>за ${weeks} ${plural(weeks, 'неделю', 'недели', 'недель')}</span></div><div class="stat"><b>≈ ${fmt(Math.round(best.e1))} кг</b><span>максимум на 1 раз</span></div></div>
    <section class="card chart-card" style="position:relative"><div class="eyebrow" style="margin-bottom:6px">Рабочий вес по тренировкам, кг</div><div id="chart"></div></section>
    <section class="card pad"><table class="hist"><thead><tr><th>Дата</th><th>Подходы</th><th style="text-align:right">Лучший</th></tr></thead><tbody>
      ${h.slice().reverse().map(x => `<tr><td>${ruDate(x.date, {day: 'numeric', month: 'short'})}</td><td>${x.sets.map(s => `${fmt(s.w)}×${s.r}`).join(', ')}</td><td style="text-align:right">${fmt(x.w)} × ${x.r}</td></tr>`).join('')}
    </tbody></table></section>
    <p class="hint">«Максимум на 1 раз» — оценка по формуле Эпли из лучшего подхода, проверять его не нужно.</p>`;
}
function mountChart() {
  const box = $('#chart'); if (!box) return;
  const h = exHistory(S.prog); if (!h.length) return;
  const W = 340, H = 190, L = 34, R = 44, T = 14, B = 26, xs = h.map(x => x.date), ys = h.map(x => x.w);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = Math.max(1, (y1 - y0) * .25); y0 = Math.max(0, y0 - pad); y1 = y1 + pad;
  const stepY = niceStep((y1 - y0) / 3); y0 = Math.floor(y0 / stepY) * stepY; y1 = Math.ceil(y1 / stepY) * stepY;
  const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 864e5 : xs[xs.length - 1];
  const sx = t => L + (t - x0) / (x1 - x0) * (W - L - R), sy = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  let g = '';
  for (let v = y0; v <= y1 + 1e-9; v += stepY) g += `<line class="grid" x1="${L}" x2="${W - R + 8}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ax" x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  [h[0], h[Math.floor(h.length / 2)], h[h.length - 1]].filter((x, i, a) => a.indexOf(x) === i).forEach(x => { g += `<text class="ax" x="${sx(x.date)}" y="${H - 6}" text-anchor="middle">${ruDate(x.date, {day: 'numeric', month: 'short'}).replace('.', '')}</text>`; });
  const pts = h.map(x => [sx(x.date), sy(x.w)]), line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${sy(y0)} L${pts[0][0].toFixed(1)} ${sy(y0)} Z`, last = pts[pts.length - 1];
  box.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Рабочий вес: ${h.map(x => fmt(x.w)).join(', ')} кг">${g}<path class="ar" d="${area}"/><path class="ln" d="${line}"/>
    ${pts.map((p, i) => `<circle class="pt ${i === pts.length - 1 ? 'end' : ''}" cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 5.5 : 4}"/>`).join('')}
    <text class="lbl" x="${last[0] + 9}" y="${last[1] + 4}">${fmt(h[h.length - 1].w)}</text><line class="cross" id="cross" y1="${T}" y2="${H - B}" visibility="hidden"/></svg><div class="tip" id="tip" hidden></div>`;
  const svg = $('svg', box), tip = $('#tip'), cross = $('#cross');
  const move = e => {
    const r = svg.getBoundingClientRect(), k = r.width / W, px = (e.clientX - r.left) / k;
    let bi = 0; pts.forEach((p, i) => { if (Math.abs(p[0] - px) < Math.abs(pts[bi][0] - px)) bi = i; });
    const p = pts[bi], x = h[bi], card = box.closest('.chart-card').getBoundingClientRect();
    cross.setAttribute('x1', p[0]); cross.setAttribute('x2', p[0]); cross.setAttribute('visibility', 'visible');
    tip.hidden = false; tip.innerHTML = `<b>${fmt(x.w)} кг × ${x.r}</b> · ${ruDate(x.date, {day: 'numeric', month: 'short'})}`;
    tip.style.left = Math.min(Math.max(r.left - card.left + p[0] * k, 84), card.width - 84) + 'px';
    tip.style.top = (r.top - card.top + p[1] * k) + 'px';
  };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }


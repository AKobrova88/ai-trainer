'use strict';
/* ---------- count by the weight: the plates or the machine hide the body ----------
   The person taps the plate, weight stack or carriage once; AT.BarTracker follows it on a 160-px grey copy of each frame and
   AT.BarAnalyzer counts the reps from its path. Works on a chosen video and live; the body position is not assessed. */
const BAR_W = 160, barCv = document.createElement('canvas'), barCtx = barCv.getContext('2d', { willReadFrequently: true });
function barGray(v) {
  const w = v.videoWidth, h = v.videoHeight; if (!w || !h) return null;
  const W = BAR_W, Hh = Math.max(2, Math.round(h * W / w));
  if (barCv.width !== W || barCv.height !== Hh) { barCv.width = W; barCv.height = Hh; }
  barCtx.drawImage(v, 0, 0, W, Hh);
  const d = barCtx.getImageData(0, 0, W, Hh).data, g = new Float32Array(W * Hh);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return { g, W, H: Hh };
}
function barReset() {
  if (state.bar && state.bar.live) Rec.drop();
  state.bar = null; el.stage.classList.remove('picking'); $('#barTip').hidden = true;
}
function barPick(mode) {
  if (mode === 'file' ? !state.file : !state.on || state.file) return;
  hideMsg();
  const keep = state.bar && state.bar.live ? state.bar : null;   // live: a new point for the same set
  state.bar = { picking: true, mode, pts: [], keep };
  el.stage.classList.add('picking');
  $('#barTipText').textContent = 'Нажми на то, что ходит вместе с весом: блин, стопку грузов или каретку. Лучше на край блина или надпись.';
  $('#barTip').hidden = false;
  if (mode === 'file') { state.analyzing = false; const v = el.vid; seekTo(v, Math.min(0.2, isFinite(v.duration) ? v.duration / 2 : 0)); }
  Voice.say('Нажми на блин или каретку на экране', 'barpick', true);
  renderLive(); renderMain();
}
$('#barTipCancel').addEventListener('click', () => {
  const B = state.bar; el.stage.classList.remove('picking'); $('#barTip').hidden = true;
  state.bar = B && B.keep ? B.keep : null;
  if (!state.bar && state.file && !state.analyzing) showMsg('Как посчитать подход', 'Можно указать точку ещё раз или записать подход вручную.', [{ label: 'Указать точку', primary: true, run: () => barPick('file') }, { label: 'Записать вручную', run: () => { hideMsg(); manualSet(); } }]);
  renderLive();
});
el.stage.addEventListener('pointerdown', e => {
  const B = state.bar;
  if (!B || !(B.picking || B.live) || e.target.closest('#barTip, .stage-msg, button')) return;
  const v = el.vid, r = el.stage.getBoundingClientRect(), W = v.videoWidth, Hh = v.videoHeight; if (!W || !Hh) return;
  const s = Math.min(r.width / W, r.height / Hh), ox = (r.width - W * s) / 2, oy = (r.height - Hh * s) / 2;
  let x = (e.clientX - r.left - ox) / s; const y = (e.clientY - r.top - oy) / s;
  if (!state.file && state.facing === 'user') x = W - x;
  if (x < 0 || y < 0 || x > W || y > Hh) return;
  e.preventDefault();
  el.stage.classList.remove('picking'); $('#barTip').hidden = true;
  if (B.live) return barAnchor(x / W, y / Hh);   // live: tapping again moves the point
  B.picking = false;
  if (B.mode === 'file') barRunFile(x / W, y / Hh); else barStartLive(x / W, y / Hh);
});
const barFlat = () => showMsg('Здесь не за что зацепиться', 'Это место слишком однотонное. Нажми на край блина, надпись или болт — что-то с рисунком.', [{ label: 'Выбрать снова', primary: true, run: () => barPick(state.file ? 'file' : 'live') }, { label: 'Отмена', run: hideMsg }]);
async function barRunFile(nx, ny) {
  const v = el.vid, token = fileToken, dur = isFinite(v.duration) ? v.duration : 0;
  if (!dur) return;
  const tr = new AT.BarTracker(), A = new AT.BarAnalyzer(state.ex, state.level), setStart = state.sets.length;
  state.fallback = true; state.analyzer = A; state.snap = null; state.flash = null; state.frame = null;
  state.bar = { mode: 'file', pts: [], tr, k: 1 };
  state.analyzing = true; state.prog = 0; renderLive(); renderMain();
  let n = 0, lost = 0, flat = false;
  const live = () => token === fileToken && state.bar && state.bar.tr === tr;
  const take = t => {   // one frame of the video at time t
    const f = barGray(v); if (!f) return;
    let p;
    if (!n) { p = tr.start(f.g, f.W, f.H, nx * f.W, ny * f.H); if (p.contrast < 4) { flat = true; return; } }
    else p = tr.update(f.g);
    n++; if (!p.ok) lost++;
    const B = state.bar; B.k = v.videoWidth / f.W; B.pts.push({ x: p.x * B.k, y: p.y * B.k, ok: p.ok }); if (B.pts.length > 45) B.pts.shift();
    handleSnap(A.update(p, t, f.W));
    state.prog = Math.min(99, Math.round(t / dur * 100));
  };
  await seekTo(v, 0); if (!live()) return;
  take(0);
  // The video plays once and every shown frame is read (fast, and how Safari is happiest); seeking frame by frame otherwise.
  let played = false;
  if (!flat && 'requestVideoFrameCallback' in v) {
    played = await new Promise(res => {
      let last = 0;
      const stop = ok => { v.removeEventListener('ended', ended); try { v.pause(); } catch (e) { /* fine */ } res(ok); };
      const ended = () => stop(true);
      const onFrame = (now, md) => {
        if (!live() || flat) return stop(true);
        const t = md.mediaTime; if (t > last) { take(t); last = t; }
        if (v.ended || t >= dur - 0.04) return stop(true);
        v.requestVideoFrameCallback(onFrame);
      };
      v.addEventListener('ended', ended);
      v.requestVideoFrameCallback(onFrame);
      v.playbackRate = 1;
      const pr = v.play(); if (pr && pr.catch) pr.catch(() => stop(false));
    });
  }
  if (!played && !flat) for (let t = 1 / 15; live() && t <= dur && !flat; t += 1 / 15) {
    await seekTo(v, Math.min(t, Math.max(0, dur - 0.01)));
    if (!live()) return;
    take(t);
    await sleep(0);
  }
  if (flat) { state.analyzing = false; state.bar = null; return barFlat(); }
  if (token !== fileToken) return;
  state.analyzing = false;
  A.endSet(); processEvents(A.drain());
  const sets = state.sets.slice(setStart), found = sets.reduce((a, x) => a + x.r, 0);
  state.videoSummary = { reps: found, sets: sets.length, warning: found ? 'Посчитано по движению веса, положение тела не оценивалось' : 'Повторы не найдены' };
  const redo = { label: 'Указать другую точку', run: () => { if (state.sets.length > setStart) { state.sets.splice(setStart); saveSets(); renderSets(); } barPick('file'); } };
  const byHand = { label: 'Записать вручную', run: () => { hideMsg(); manualSet(); } };
  if (found) { showMsg('Посчитала по движению веса', A.note() + (lost > n * 0.2 ? ' Точка иногда терялась — проверь число повторов.' : ''), [{ label: 'Готово', primary: true, run: hideMsg }, redo, byHand]); Voice.say('Посчитала по движению веса: ' + found + ' ' + plural(found, 'повтор', 'повтора', 'повторов'), 'verdict', true); return; }
  const lostIt = lost > n * 0.4;
  showMsg(lostIt ? 'Не смогла проследить за точкой' : 'Повторов не нашла', lostIt ? 'Точка пропадала из кадра или похожа на соседние места. Нажми на край блина, надпись или болт — то, что всё время видно.' : 'Точка почти не двигалась. Выбери то, что ходит вместе с весом на всю амплитуду: блин, стопку грузов или каретку.', [Object.assign({}, redo, { primary: true }), byHand]);
}
function barStartLive(nx, ny) {
  const v = el.vid, f = barGray(v); if (!f) return;
  const tr = new AT.BarTracker(), p = tr.start(f.g, f.W, f.H, nx * f.W, ny * f.H);
  if (p.contrast < 4) { state.bar = null; return barFlat(); }
  const fresh = !!state.preflight || !Rec.mr;
  if (state.analyzer && state.analyzer.reps.length && !state.analyzer.setEnded && !state.analyzer.isBar) { state.analyzer.endSet(); processEvents(state.analyzer.drain()); }
  state.preflight = false; state.preflightReady = false; state.fallback = true;
  state.analyzer = new AT.BarAnalyzer(state.ex, state.level); state.snap = null; state.flash = null; state.frame = null;
  state.bar = { mode: 'live', live: true, tr, pts: [], k: v.videoWidth / f.W };
  if (fresh) Rec.start(state.stream);
  lastStatus = ''; renderMain(); renderLive();
  Voice.say('Слежу за весом. Начинай подход', 'bar', true);
}
function barAnchor(nx, ny) {   // live: the point was lost or a better one is chosen — same set, new point
  const B = state.bar, f = barGray(el.vid); if (!B || !f) return;
  const p = B.tr.start(f.g, f.W, f.H, nx * f.W, ny * f.H);
  if (p.contrast < 4) return barFlat();
  B.pts = []; state.analyzer.reanchor();
  Voice.say('Новая точка', 'bar', true);
}
function barInferLive() {
  const v = el.vid, B = state.bar; if (v.readyState < 2 || !v.videoWidth) return;
  const f = barGray(v); if (!f) return;
  const t = performance.now() / 1000, p = B.tr.update(f.g);
  B.k = v.videoWidth / f.W; B.pts.push({ x: p.x * B.k, y: p.y * B.k, ok: p.ok }); if (B.pts.length > 45) B.pts.shift();
  handleSnap(state.analyzer.update(p, t, f.W));
}
function videoVerdict(st, found, shadow, from) {
  const n = Math.max(1, st.n), share = k => (st[k] || 0) / n, turn = share('turn') + share('turn_front'), nobody = share('nobody'), lost3d = share('world_lost');
  const shadowGroups = st.shadowGroups.filter(g=>g.length), shadowTotal = shadowGroups.reduce((sum,g)=>sum+g.length,0);
  const name = info().name, miss = Object.keys(st.miss).sort((a, b) => st.miss[b] - st.miss[a])[0];
  const byWeight = { label: 'Посчитать по движению веса', primary: weighted(), run: () => { hideMsg(); barPick('file'); } };
  const again = [{ label: from === 'rec' ? 'Снять ещё раз' : 'Снять на камеру', primary: !weighted(), run: () => { hideMsg(); startRecordMode(); } },
    { label: 'Другое видео', run: () => { hideMsg(); pickVideo(); } }, { label: 'Записать вручную', run: () => { hideMsg(); manualSet(); } }];
  again.splice(weighted() ? 0 : 1, 0, byWeight);   // a machine or plates hide the body: counting by the weight comes first
  const tell = (title, text, acts, say) => { state.flash = null; showMsg(title, text + (acts && acts.includes(byWeight) ? '\n\nТренажёр или блины закрывают тело? Нажми «Посчитать по движению веса» и укажи блин или каретку.' : ''), acts); Voice.say(say || title, 'verdict', true); };
  if (!found && st.errors>=3 && st.errors>st.n) {
    state.videoSummary.warning = 'Техническая ошибка обработки. Повторы не удалось определить';
    return tell('Не удалось обработать видео',
      'Модель не смогла прочитать кадры из-за технической ошибки. Это не означает, что ты сделала ноль повторов. Попробуй загрузить запись ещё раз или сохрани подход вручную.',again);
  }
  if (found) {
    const disagreement = state.ex === 'leg_ext' && shadow && Math.abs(shadowTotal-found) >= 2;
    if (st.errors || lost3d > .15 || share('calib') > .35 || disagreement) state.videoSummary.warning = 'Результат может быть неполным: часть кадров не разобрана или счётчики расходятся. Проверь и исправь число повторов ниже';
    else if (turn > .35) state.videoSummary.warning = 'Часть видео пропущена из-за ракурса. Проверь число повторов';
    return;
  }
  if (shadow && shadowTotal >= 2 && nobody < 0.5) {
    state.fallback = true; state.analyzer = shadow; shadow.setEnded = true;
    for (const group of shadowGroups) { shadow.reps = group; recordSet(); }
    state.videoSummary = {reps:shadowTotal,sets:shadowGroups.length,warning:'Техника не оценивалась. Проверь число повторов'};
    return tell('Повторы посчитала, технику — нет', 'По видимым движениям нашла ' + shadowTotal + ' повторов. Проверь число и при необходимости исправь его в подходе. Для оценки техники данных недостаточно: суставы могли быть закрыты тренажёром или 3D-точки были неустойчивы.',
      [{ label: 'Проверить повторы', primary: true, run: hideMsg }, again.find(a => a !== byWeight)], 'Повторы посчитаны без оценки техники. Проверь число');
  }
  if (lost3d > .35) return tell('Недостаточно надёжных 3D-точек',
    'Не удалось уверенно восстановить суставы. Освободи обзор, добавь свет и поставь телефон ровно. Начни запись с неподвижного исходного положения. Скрытые части тела нельзя надёжно оценить по одной камере.', again);
  if (nobody > 0.5) {
    return tell('По этому видео я ничего не могу сказать', (miss && miss !== STATUS_TEXT.nobody && !/^Не вижу человека/.test(miss) ? miss + '.\n\n' : 'Не вижу человека в кадре целиком.\n\n') +
      'В следующий раз встань подальше — в 2–3 м от телефона, чтобы в кадре было всё тело от головы до стоп. Встань ' + viewWord() + ', телефон на уровне пояса, свет спереди.', again,
      'По этому видео я ничего не могу сказать. Встань подальше, чтобы было видно всё тело');
  }
  if (turn > 0.35) {
    return tell('Съёмка с неподходящего ракурса', 'По этому видео я ничего не могу сказать: для «' + name + '» нужно встать ' + viewWord() + '. Отойди на 2–3 м, чтобы было видно всё тело, и сними ещё раз.', again,
      'Съёмка с неподходящего ракурса. Встань ' + viewWord());
  }
  tell('Не нашла повторов', 'Тебя видно, но повторов я не нашла. Начни запись до подхода и замри на секунду в начальном положении, потом делай повторы на полную амплитуду — целиком в кадре.', again);
}


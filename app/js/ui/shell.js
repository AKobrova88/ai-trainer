'use strict';
/* ---------- shell ---------- */
function renderTabs() {
  const active = S.tab === 'today' ? 'diary' : S.tab;
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab" data-act="tab" data-v="${k}" ${active === k ? 'aria-current="page"' : ''}>${I[k]}<span>${l}</span>${k === 'diary' && S.workout ? '<i class="dot"></i>' : ''}</button>`).join('');
}
function render() {
  normalizeLibrary(S);
  if (S.tab === 'camera') S.tab = 'today';
  if (S.tab === 'today' && !S.workout) S.tab = 'diary';
  applyTheme();
  const camOf = it => { if (it.base && CAT[it.base]) it.cam = CAT[it.base].cam; };   // the camera learns new exercises: old programs follow
  for (const p of S.programs) for (const d of p.days) { normSS(d.items); d.items.forEach(camOf); }
  if (S.workout) { normSS(S.workout.items); S.workout.items.forEach(camOf); }
  const onb = S.stage !== 'app';
  document.body.classList.toggle('onb-mode', onb);
  document.body.classList.toggle('workout-mode', !onb && S.tab === 'today' && !!S.workout);
  $('#onb').hidden = !onb; $('#view').hidden = onb;
  if (onb) { $('#onb').innerHTML = S.stage === 'welcome' ? viewWelcome() : viewStart(); $('#restbar').hidden = true; save(); TG.syncChrome(); return; }
  renderTabs();
  const views = {today: viewToday, program: viewProgram, diary: viewDiary, profile: viewProfile};
  const [title, html, act] = (views[S.tab] || viewToday)();
  $('#title').textContent = title;
  $('#top-act').innerHTML = act || '';
  const back = $('#workout-back'); if (back) back.hidden = S.tab !== 'today' || !S.workout;
  $('#view').innerHTML = (S.demo ? `<div class="demo-banner"><span><b>Пример программы и дневника</b>Здесь можно попробовать приложение.${S.demoReturn && S.user ? ' Твои данные сохранены.' : ''}</span><button data-act="demo-off">${S.user ? 'Выйти' : 'К началу'}</button></div>` : '') + html;
  $('#view').dataset.screen=S.tab;
  if (S.tab === 'diary' && S.dtab === 'prog') mountChart();
  renderRest();
  document.documentElement.style.setProperty('--top-h', $('.top').offsetHeight + 'px');
  save();
  TG.syncChrome();
}


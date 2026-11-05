'use strict';
/* ---------- wishes → program: three steps in one sheet ---------- */
const hasSpeech = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
function openWizard(fromText) {
  sheet('Подбор программы', '<div id="wiz"></div>', '<div id="wiz-f" style="display:flex;gap:8px;width:100%"></div>', 'full');
  S.wiz = {step: 1, text: fromText ?? (S.profile.text || ''), P: null, res: null, spent: false, open: {}};
  renderWizard();
}
function stepsBar(n) { return `<div class="row"><div class="steps" aria-hidden="true">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div><span class="hint">${n} из 3</span></div>`; }
function foundChips(P) {
  return FOUND_CHIPS.map(([k, l]) => `<span class="fchip ${P.found[k] ? 'ok' : ''}">${P.found[k] ? '✓ ' : '+ '}${l}</span>`).join('');
}
function renderWizard() {
  const W = S.wiz, b = $('#wiz'), f = $('#wiz-f');
  if (!b || !W) return;
  const head = $('.sheet-h h2', b.closest('.sheet'));
  if (W.step === 1) {
    head.textContent = 'Расскажи о себе';
    const P = parseWishes(W.text);
    b.innerHTML = `${stepsBar(1)}
      <p class="lead">Своими словами, как тренеру. Чем подробнее — тем точнее программа.</p>
      <div class="wish"><label class="sr" for="wish-t">Твои пожелания</label>
        <textarea id="wish-t" rows="8" placeholder="Например: вес 62 кг, рост 168. Хожу в зал около двух лет, 3 раза в неделю по часу. Хочу подкачать ягодицы и заднюю поверхность бедра, подтянуть спину. Иногда побаливает колено — глубокие приседы не люблю.">${esc(W.text)}</textarea>
        <div class="row"><span class="hint" id="wish-n">${W.text.length} ${plural(W.text.length, 'знак', 'знака', 'знаков')}</span>${hasSpeech() ? `<button class="mic" data-act="mic" id="mic">${I.mic}Надиктовать</button>` : ''}</div></div>
      <div class="eyebrow">Что уже есть в тексте</div><div class="found" id="wish-found">${foundChips(P)}</div>
      ${youngProgram() ? `<div class="note warn">${I.info}<span>Твоей программе ${youngProgram()} ${plural(youngProgram(), 'день', 'дня', 'дней')}. Программу стоит вести 4–6 недель, чтобы вес успевал расти. ${access().unlimited ? 'Пересборка доступна без лимита.' : 'Пересобрать можно — это 1 подбор из лимита.'}</span></div>` : ''}
      <p class="hint">Подбор идёт по правилам тренера прямо на телефоне: текст никуда не отправляется.</p>`;
    f.innerHTML = `<button class="btn" data-act="close">Отмена</button><button class="btn primary" data-act="wiz-next" id="wiz-next" ${W.text.trim().length >= 12 ? '' : 'disabled'}>Дальше</button>`;
    const ta = $('#wish-t');
    ta.addEventListener('input', () => {
      W.text = ta.value; const p = parseWishes(W.text);
      $('#wish-found').innerHTML = foundChips(p);
      $('#wish-n').textContent = `${W.text.length} ${plural(W.text.length, 'знак', 'знака', 'знаков')}`;
      $('#wiz-next').disabled = W.text.trim().length < 12;
    });
    return;
  }
  if (W.step === 2) {
    head.textContent = 'Что я поняла';
    const P = W.P;
    const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-act="wz-set" data-v="${k}:${v}" aria-pressed="${String(P[k]) === String(v)}">${l}</button>`).join('')}</div>`;
    const fr = Object.keys(MUSCLES).filter(k => P.focus[k]).sort((a, c) => P.focus[c] - P.focus[a]);
    const add = Object.keys(MUSCLES).filter(k => !P.focus[k]);
    b.innerHTML = `${stepsBar(2)}
      <p class="lead">Проверь и поправь, если что-то не так.</p>
      <div class="frm">
        <div class="fld"><span class="lab">Цель</span>${seg('goal', [['muscle', 'Форма'], ['fatloss', 'Похудение'], ['strength', 'Сила'], ['health', 'Здоровье']])}</div>
        <div class="fld"><span class="lab">Тело</span><div class="nums">
          <label><input class="input" inputmode="decimal" data-wz="weight" value="${P.weight || ''}" placeholder="—"><span>вес, кг</span></label>
          <label><input class="input" inputmode="numeric" data-wz="height" value="${P.height || ''}" placeholder="—"><span>рост, см</span></label>
          <label><input class="input" inputmode="numeric" data-wz="age" value="${P.age || ''}" placeholder="—"><span>возраст</span></label></div>
          ${P.weight ? '' : '<span class="hint">Без веса тела не подскажу стартовые веса — подберёшь на первой тренировке.</span>'}</div>
        <div class="fld"><span class="lab">Опыт</span>${seg('exp', [['novice', 'Новичок'], ['normal', 'Средний'], ['pro', 'Опытный']])}${P.expMonths != null ? `<span class="hint">Поняла из текста: ${P.expMonths < 12 ? Math.round(P.expMonths) + ' мес.' : fmt(P.expMonths / 12) + ' ' + plural(Math.round(P.expMonths / 12), 'год', 'года', 'лет')}</span>` : ''}</div>
        <div class="fld"><span class="lab">Тренировок в неделю</span>${seg('days', [[2, '2'], [3, '3'], [4, '4'], [5, '5']])}</div>
        <div class="fld"><span class="lab">Одна тренировка</span>${seg('mins', [[45, '45 мин'], [60, '60 мин'], [75, '75 мин'], [90, '90 мин']])}</div>
        <div class="fld"><span class="lab">Где</span>${seg('place', [['gym', 'Зал'], ['dumbbells', 'Дома, гантели'], ['bodyweight', 'Дома, без всего']])}</div>
        <div class="fld"><span class="lab">Акцент</span>
          ${fr.map(k => `<div class="focus-row"><span class="nm">${MUSCLES[k]}</span><span class="lvl">${[1, 2, 3].map(l => `<button data-act="wz-focus" data-v="${k}:${l}" aria-pressed="${P.focus[k] === l}">${LEVELS3[l]}</button>`).join('')}</span><button class="x" data-act="wz-focus" data-v="${k}:0" aria-label="убрать">✕</button></div>`).join('') || '<span class="hint">Равномерно на всё тело. Добавь, если хочешь акцент:</span>'}
          <div class="addchips">${add.map(k => `<button data-act="wz-focus" data-v="${k}:2">+ ${MUSCLES[k]}</button>`).join('')}</div></div>
        <div class="fld"><span class="lab">Ограничения</span><div class="lim-chips">${Object.entries(LIMIT_NAMES).map(([k, l]) => `<button data-act="wz-lim" data-v="${k}" aria-pressed="${P.limits.includes(k)}">${l}</button>`).join('')}</div>
          ${P.other.length ? `<span class="hint">Ещё из текста: ${P.other.map(k => OTHER_NAMES[k]).join(', ')} — учту в подсказках.</span>` : '<span class="hint">Отметь, что болит или что нельзя — заменю упражнения на щадящие.</span>'}</div>
        ${P.flags && (P.flags.pregnant || P.flags.medical) ? `<div class="note warn">${I.warn}<span><b>Сначала согласуй нагрузку с врачом.</b> Программа будет щадящей, без максимальных весов.</span></div>` : ''}
      </div>`;
    const lft = left('prog'), all = allowance().prog;
    b.insertAdjacentHTML('beforeend', `<p class="hint" style="margin:0">${access().unlimited ? 'Подбор и пересборка программы доступны без лимита.' : W.spent ? 'Пересборка в этом окне не тратит лимит.' : all ? `Это 1 подбор из лимита ИИ: осталось ${lft} из ${all}.` : 'Подбор программы — в подписке; покажу варианты.'}</p>`);
    f.innerHTML = `<button class="btn" data-act="wiz-back">Назад</button><button class="btn primary" data-act="wiz-build">${W.spent ? 'Пересобрать' : 'Составить программу'}</button>`;
    $$('[data-wz]', b).forEach(i => i.addEventListener('input', () => { P[i.dataset.wz] = parseNum(i.value); }));
    return;
  }
  /* step 3: the program */
  head.textContent = 'Твоя программа';
  const R = W.res, P = R.profile, sh = loadShare(R.days);
  const colors = ['var(--load1)', 'var(--load2)', 'var(--load3)', 'var(--load4)'];
  const days = R.days.map((d, i) => {
    const mins = Math.round(d.items.reduce((a, it) => a + it.s * (1 + it.rest / 60), 0) + 6), open = W.open[d.id] ?? i === 0;
    return `<section class="pday"><button class="pday-h" data-act="wz-day" data-v="${d.id}" aria-expanded="${open}"><span class="grow"><b>${esc(d.title)}</b><span class="hint">${d.items.length} ${plural(d.items.length, 'упражнение', 'упражнения', 'упражнений')} · ≈ ${mins} мин</span></span><span style="width:20px;color:var(--muted);transform:rotate(${open ? 90 : 0}deg)">${CHEV}</span></button>
      ${open ? `<div class="pday-l">${d.items.map(it => `<div><span>${esc(it.name)}${it.cam ? ' <span class="badge cam">камера</span>' : ''}</span><span>${dose(it)}${it.w ? ' · ' + fmt(it.w) + ' кг' : ''}</span></div>`).join('')}</div>` : ''}</section>`;
  }).join('');
  b.innerHTML = `${stepsBar(3)}
    <p class="hint" style="margin:0">${R.days.length} ${plural(R.days.length, 'тренировка', 'тренировки', 'тренировок')} в неделю · 8 недель · ${EXP_NAMES[P.exp].toLowerCase()} · ${GOAL_NAMES[P.goal].toLowerCase()}</p>
    <section class="fld"><span class="lab">Куда идёт нагрузка</span>
      <div class="loadbar" role="img" aria-label="${sh.rows.map(r => r.name + ' ' + r.pct + '%').join(', ')}">${sh.rows.map((r, i) => `<i style="width:${r.pct}%;background:${colors[i]}"></i>`).join('')}</div>
      <div class="legend">${sh.rows.map((r, i) => `<span><i style="background:${colors[i]}"></i>${esc(r.name)} · ${r.pct}%</span>`).join('')}</div></section>
    ${days}
    <section class="fld"><span class="lab">Почему так</span><ul class="why">${explain(R).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
    <p class="hint">${P.weight ? 'Стартовые веса примерные — на первой тренировке уточним, дальше прибавлю сама.' : 'Веса подберёшь на первой тренировке — дальше прибавлю сама.'} Гантели — вес одной.</p>`;
  const had = S.program.days.length;
  f.innerHTML = `<button class="btn" data-act="wiz-accept" data-v="program">Поправить</button><button class="btn primary" data-act="wiz-accept" data-v="today">${S.demo && !S.user ? 'Попробовать программу' : had ? 'Заменить мою программу' : 'Начать'}</button>`;
}
let REC = null;
function toggleMic() {
  const btn = $('#mic'), ta = $('#wish-t');
  if (REC) { try { REC.stop(); } catch (e) { /* stopped */ } REC = null; btn && btn.classList.remove('on'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR || !ta) return;
  const r = new SR(); r.lang = 'ru-RU'; r.continuous = true; r.interimResults = false;
  r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { ta.value = (ta.value.trim() + ' ' + e.results[i][0].transcript.trim()).trim(); ta.dispatchEvent(new Event('input')); } };
  r.onend = () => { REC = null; const b = $('#mic'); b && b.classList.remove('on'); };
  r.onerror = e => { if (e.error === 'not-allowed') toast('Разреши микрофон для этой страницы — или напиши текстом'); };
  try { r.start(); REC = r; btn.classList.add('on'); } catch (e) { toast('Диктовка недоступна — напиши текстом'); }
}


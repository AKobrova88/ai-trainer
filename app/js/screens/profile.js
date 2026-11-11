'use strict';
/* ---------- profile ---------- */
/* the text of the active promo code comes from the server (2.7) */
const promoText = () => (S.server && S.server.promo && S.server.promo.text) || (localPromo(S.sub.promo) || {}).text || PROMO_TEXT;
function subStatus() {
  const a = access(), p = period();
  if (a.unlimited) return {title: 'Личный доступ без лимитов', note: 'Подбор программ, распознавание фото, камера и разбор видео открыты без срока окончания.'};
  if (a.level === 'sub' && a.test) return {title: 'Тестирование: всё открыто', note: `Промокод ${esc(S.sub.promo)} — ${esc(promoText())}. Оплата отключена.`};
  if (a.level === 'sub') return {title: 'Подписка оформлена', note: `Следующий период — с ${ruDate(p.end)}.`};
  if (a.level === 'trial') return {title: `Пробный период: ещё ${a.days} ${plural(a.days, 'день', 'дня', 'дней')}`, note: `До ${ruDate(a.until)} открыто всё; из ИИ — ${PRICING.trialAi.prog} подбор программы. Потом ${rub(PRICING.sub.price)} в месяц.`};
  return {title: 'Бесплатный доступ', note: `Своя программа, дневник и прогресс работают всегда. Камера-тренер, разбор видео и ИИ — в подписке.`};
}
function limRows() {
  const a = allowance(), u = access().unlimited ? S.usage : usage();
  return AI_KINDS.filter(([k]) => PRICING.payments || k !== 'ask').map(([k, l]) => `<div class="lim"><span>${l}</span><small>${!Number.isFinite(a[k]) ? `без лимита${k === 'ask' ? ' · скоро' : ''}` : !a[k] ? PRICING.payments ? 'после оформления' : 'по промокоду' : k === 'ask' ? `${a[k]} · скоро` : `осталось ${Math.max(0, a[k] - u[k])} из ${a[k]}`}</small></div>`).join('');
}
function subCard(inSheet) {
  const st = subStatus(), P = PRICING, a = access(), p = period();
  if (a.unlimited) return `<section class="card sub"><div class="eyebrow">Личный доступ</div>
    <b class="big">Без лимитов</b><span>${st.note}</span>
    <div class="lims" aria-label="Доступные функции">${limRows()}</div>
    <span class="hint" style="color:inherit">Доступ сохранён на этом устройстве. Оплата не требуется.</span>
    ${!inSheet ? '<button class="btn" data-act="promo">Ввести промокод</button>' : ''}</section>`;
  if (!P.payments) return `<section class="card sub"><div class="eyebrow">Бесплатное тестирование</div>
    <b class="big">${a.test ? 'Тестовый доступ включён' : 'Попробуй возможности тренера'}</b>
    <span>Оплата отключена. Своя программа, дневник и прогресс доступны бесплатно.</span>
    <span class="hint" style="color:inherit">${a.test ? 'Камера и разбор видео открыты. Доступные подборы и распознавания указаны ниже.' : a.level === 'trial' ? `Камера и разбор видео открыты ещё ${a.days} ${plural(a.days, 'день', 'дня', 'дней')}. Для полного тестового доступа введи TEST2026.` : 'Для камеры, разбора видео и подбора программы активируй бесплатный промокод TEST2026.'}</span>
    <div class="lims" aria-label="Доступные функции">${limRows()}</div>
    ${!inSheet ? `<button class="btn ${a.test ? '' : 'primary'}" data-act="promo">${a.test ? 'Ввести промокод' : 'Активировать бесплатный доступ'}</button>` : ''}</section>`;
  const total = P.sub.price + (P.addonsEnabled && S.sub.plusPick ? P.aiPlus.price : 0);
  return `<section class="card sub"><div class="eyebrow">Подписка</div><b class="big">${st.title}</b>
    <div class="price"><b>${rub(P.sub.price)}</b><span>в месяц · ${P.trialDays} дней бесплатно новым</span></div>
    <span class="hint" style="color:inherit;opacity:.85">Все доступные функции входят в одну подписку: камера, разбор видео, подбор и распознавание программ. Камера и разбор видео без лимитов; доступное число подборов и фото указано ниже. Своя программа, дневник и прогресс — бесплатно всегда.</span>
    <div class="lims" aria-label="ИИ сейчас">${limRows()}</div>
    ${a.level !== 'free' && p.end ? `<span class="hint" style="color:inherit;opacity:.85">${a.level === 'trial' ? `Пробный период до ${ruDate(p.end)}` : `Лимиты обновятся ${ruDate(p.end)}`}. Неиспользованные сгорают.</span>` : ''}
    <span class="hint" style="color:inherit;opacity:.85">${st.note}</span>
    <div class="row" style="flex-wrap:wrap"><button class="btn primary" data-act="subscribe">Оформить за ${rub(total)}</button>${inSheet ? '' : '<button class="btn" data-act="promo">Ввести промокод</button>'}</div></section>`;
}
function addonCards() {
  const P = PRICING;
  if (!P.payments || !P.addonsEnabled) return '';
  return `<section class="addon"><div class="row"><span class="grow"><b style="font-size:17px">ИИ+</b> · +${rub(P.aiPlus.price)} в месяц</span><button class="switch" role="switch" aria-checked="${!!S.sub.plusPick}" aria-label="Добавить ИИ+ к подписке" data-act="ai-plus"><i></i></button></div>
      <span class="hint">Ещё +${P.aiPlus.ai.prog} подборов, +${P.aiPlus.ai.photo} фото и +${P.aiPlus.ai.ask} вопросов каждый месяц. Вместе с подпиской — ${rub(P.sub.price + P.aiPlus.price)} в месяц.</span></section>
    <p class="hint" style="margin:-4px 2px 0">Расширенный блок добавляется к оформленной подписке. Неиспользованные лимиты в конце периода сгорают.</p>`;
}
function viewProfile() {
  const P = S.profile;
  const focus = Object.entries(P.focus || {}).filter(([, v]) => v).sort((x, y) => y[1] - x[1]).map(([k]) => MUSCLES[k]).join(', ');
  const row = (label, val, act = 'wish') => `<button class="prow" data-act="${act}"><span>${label}</span><span class="val">${val || '—'}</span><span style="width:18px;flex:none;color:var(--muted)">${CHEV}</span></button>`;
  const th = (k, name, sub, cols) => `<button class="th ${k}" data-act="theme" data-v="${k}" aria-pressed="${S.theme === k}"><span class="mini" aria-hidden="true">${cols.map((c, i) => `<i style="background:${c};width:${[70, 100, 55][i]}%"></i>`).join('')}</span><b>${S.theme === k ? '✓ ' : ''}${name}</b><small>${sub}</small></button>`;
  return ['Личный кабинет', `
    ${subCard()}
    ${addonCards()}
    <button class="card pad help-card" data-act="support"><span class="hc-ico">${I.tg}</span><span><b>Поддержка</b><small>Что-то не работает или непонятно — напиши, ответим в Telegram</small></span><span style="width:18px;flex:none;color:var(--muted)">${CHEV}</span></button>
    <div class="eyebrow">Мои данные для программы</div>
    <div class="plist">
      ${row('Цель', P.filled ? GOAL_NAMES[P.goal] : '')}
      ${row('Вес и рост', P.weight || P.height ? [P.weight ? fmt(P.weight) + ' кг' : '', P.height ? P.height + ' см' : ''].filter(Boolean).join(' · ') : '')}
      ${row('Опыт', P.filled ? EXP_NAMES[P.exp] : '')}
      ${row('Тренировок в неделю', P.filled ? `${P.days} · ${P.mins} мин` : '')}
      ${row('Акцент', focus || (P.filled ? 'равномерно' : ''))}
      ${row('Ограничения', [...P.limits.map(k => LIMIT_NAMES[k]), ...P.other.map(k => OTHER_NAMES[k])].join(', ') || (P.filled ? 'нет' : ''))}
      <button class="prow" data-act="wish">${I.spark.replace('<svg', '<svg class="ico"')}<span><b>Изменить пожелания и пересобрать программу</b></span></button>
    </div>
    <div class="eyebrow">Оформление</div>
    <div class="themes">${th('dusk', 'Сумерки', 'тёмная, по умолчанию', ['#9dcbf4', '#1c2131', '#c3eb6e'])}${th('bento', 'Бенто', 'светлая, цветные плитки', ['#cde3f7', '#fff8ef', '#d5efa3'])}</div>
    <div class="eyebrow">Хранение</div>
    <section class="card pad" style="display:flex;flex-direction:column;gap:10px">
      <span class="hint">${S.acct ? 'Программа, дневник и итоги разборов сохраняются в аккаунте на сервере в России. Травмы и ограничения — только на этом телефоне. Копию можно сохранить и файлом.' : 'Программа, дневник и разборы — только на этом телефоне. Чтобы не потерять при смене телефона, сохрани копию файлом.'}</span>
      <div class="grid2"><button class="btn" data-act="backup">${I.download}Сохранить копию</button><button class="btn" data-act="restore">${I.upload}Восстановить</button></div>
      <button class="btn ghost danger" data-act="wipe">${S.acct ? 'Удалить аккаунт и все данные' : 'Удалить все мои данные'}</button></section>
    <div class="eyebrow">Документы</div>
    <div class="plist">${[['consent', 'Согласие на обработку персональных данных'], ['terms', 'Пользовательское соглашение'], ['health', 'Здоровье и безопасность']].map(([k, l]) => `<button class="prow" data-act="doc" data-v="${k}">${I.doc.replace('<svg', '<svg class="ico"')}<span>${l}</span><span style="width:18px;flex:none;color:var(--muted)">${CHEV}</span></button>`).join('')}</div>
    <div class="eyebrow">Аккаунт</div>
    ${Account.section()}
    <div class="eyebrow">Где открыть</div>
    <div class="plist"><div class="prow">${I.globe.replace('<svg', '<svg class="ico"')}<span>В браузере на телефоне или компьютере. На телефоне — «Поделиться» → «На экран Домой», будет как приложение.</span></div>
      <div class="prow">${I.tg.replace('<svg', '<svg class="ico"')}<span>По желанию — в Telegram через бота @ii_trener_ak_bot.</span></div></div>
    ${S.demo ? '<button class="btn ghost" data-act="demo-off">Убрать пример и начать со своей программы</button>' : '<button class="btn ghost" data-act="demo">Показать на примере программы и дневника</button>'}
    <p class="hint" style="text-align:center">ИИ Тренер · версия ${APP_VERSION}</p>`];
}
/* support: for now through the Telegram bot (it passes the question on, the answer comes back there); later — straight to the server */
const SUPPORT_BOT = 'ii_trener_ak_bot';
const SUPPORT_URL = `https://t.me/${SUPPORT_BOT}?start=support`;
function supportSheet(prefill) {
  sheet('Поддержка', `<p class="hint" style="margin:0">Опиши, что не работает или что непонятно. Сообщение уйдёт в поддержку через Telegram-бота @${SUPPORT_BOT}, ответ придёт туда же.</p>
    <textarea class="input" id="sup-text" rows="5" placeholder="Например: камера не видит меня, когда снимаю жим лёжа сбоку">${esc(prefill || S.supDraft || '')}</textarea>
    <div class="ck-row"><button class="box" role="checkbox" aria-checked="${S.supDiag !== false}" aria-labelledby="lb-sup" data-act="sup-diag">${CHECK}</button><span id="lb-sup" data-act="sup-diag">Добавить версию приложения и модель телефона — так быстрее разберёмся</span></div>
    <a class="btn primary" href="${SUPPORT_URL}" target="_blank" rel="noopener" data-act="sup-send">${I.tg}Отправить через Telegram</a>
    <p class="hint" style="margin:0">Текст скопируется сам: в боте нажми «Старт», вставь и отправь.</p>`);
}
function supportText() {
  const t = (($('#sup-text') || {}).value || '').trim();
  if (S.supDiag === false) return t;
  const ua = navigator.userAgent.replace(/\s*\(KHTML, like Gecko\)|Mozilla\/5\.0\s*/g, '').slice(0, 140);
  return `${t}\n\n— ИИ Тренер ${APP_VERSION} · ${access().level} · ${innerWidth}×${innerHeight} · ${ua}`;
}
function paywallSheet(reason) {
  const a = access(), lvl = a.level;
  const promo = `<section class="card pad" style="display:flex;flex-direction:column;gap:8px"><label class="eyebrow" for="promo">Промокод</label>
      <div class="row"><input class="input grow" id="promo" placeholder="Например, TEST2026" autocomplete="off" value="${esc(S.sub.promo)}" style="text-transform:uppercase"><button class="btn primary" data-act="promo-go">Применить</button></div>
      ${S.sub.promo && access().test ? `<span class="hint" style="color:var(--good-text);font-weight:700">✓ ${esc(promoText())}</span>` : ''}</section>`;
  /* One plan; the extended block stays hidden until explicitly enabled. */
  sheet(a.unlimited ? 'Личный доступ' : PRICING.payments ? 'Подписка' : 'Тестовый доступ', `
    ${reason ? `<div class="note warn">${I.info}<span>${esc(reason)}</span></div>` : ''}
    ${lvl === 'sub' ? addonCards() + subCard(true) : subCard(true) + addonCards()}
    ${promo}
    ${PRICING.payments || a.unlimited ? '' : `<div class="note blue">${I.info}<span>Сейчас тестирование: оплата отключена. Промокод TEST2026 открывает всё бесплатно.</span></div>`}`,
    '', 'full', $('#sheets').children.length > 0);
}


'use strict';
/* ---------- first run: registration with consent, then «С чего начнём?» ---------- */
const CONSENT_V = TRENER.accounts ? '2.0' : '1.0';   /* 2.0: program, diary and results are kept in the account on a server in Russia */
let REG = {pd: false, terms: false, news: false, email: '', promo: ''};
/* days since a program picked by wishes, while it is younger than 3 weeks */
const youngProgram = () => { const P = S.program; if (!P.days.length || P.by !== 'wish' || !P.at) return 0; const d = Math.floor((Date.now() - P.at) / DAY); return d < 21 ? Math.max(1, d) : 0; };
const brand = () => `<div class="brand"><span class="mark" aria-hidden="true"><i></i><i></i><i></i></span><b>ИИ Тренер</b><span class="pill">Тест: всё бесплатно</span></div>`;
function ckRow(k, html, req) {
  return `<div class="ck-row"><button class="box" role="checkbox" aria-checked="${REG[k]}" aria-labelledby="lb-${k}" data-act="reg-ck" data-v="${k}">${CHECK}</button><span id="lb-${k}" data-act="reg-ck" data-v="${k}">${html}${req ? ' <span class="req" aria-label="обязательно">*</span>' : ''}</span></div>`;
}
function viewWelcome() {
  return `<div class="onb">${brand()}
    <h1 class="hero-t">Твой тренер<br>в телефоне</h1>
    <p class="lead">Программа под твои цели, подсказки по технике через камеру и дневник прогресса.</p>
    <section class="form-card" aria-label="Регистрация">
      ${TRENER.accounts && TG.inside() ? `<div class="note blue">${I.tg}<span>Вход через Telegram${Account.tgName() ? ` — ${esc(Account.tgName())}` : ''}. Пароль не нужен.</span></div>` : `<div class="field"><label for="reg-email">Электронная почта</label><input class="input" id="reg-email" type="email" autocomplete="email" inputmode="email" placeholder="name@mail.ru" value="${esc(REG.email)}"></div>`}
      <div class="field"><label for="reg-promo">Промокод, если есть</label><input class="input" id="reg-promo" autocomplete="off" autocapitalize="characters" placeholder="Например, TEST2026" value="${esc(REG.promo || '')}" style="text-transform:uppercase"></div>
      ${ckRow('pd', 'Даю <a class="linkish" href="#consent" data-act="doc" data-v="consent">согласие на обработку персональных данных</a>', true)}
      ${ckRow('terms', 'Мне есть 18 лет, принимаю <a class="linkish" href="#terms" data-act="doc" data-v="terms">пользовательское соглашение</a>', true)}
      ${ckRow('news', 'Хочу получать советы и новости на почту', false)}
      <button class="btn primary big" data-act="reg-go" id="reg-go" ${REG.pd && REG.terms ? '' : 'disabled'}>${TRENER.accounts && !TG.inside() ? 'Получить код' : 'Начать'}</button>
      <span class="hint">* без этих отметок регистрация недоступна. Первые ${PRICING.trialDays} дней открыто всё, оплата в тесте отключена. ${TRENER.accounts ? `Программа и дневник сохраняются в аккаунте на сервере в России.${TG.inside() ? '' : ' Пароль не нужен — пришлём код на почту.'}` : 'Аккаунт пока хранится только на этом телефоне.'}</span>
      ${TRENER.accounts && !TG.inside() ? '<button class="btn ghost" data-act="acc-login">Уже есть аккаунт — войти</button>' : ''}
    </section>
    <button class="btn big" data-act="demo">Посмотреть приложение на примере</button>
    <div class="note blue">${I.phone}<span>Камера и видео работают только в твоём телефоне. Мы их не получаем и не храним.</span></div>
    <div class="foot-links"><button data-act="doc" data-v="consent">Как мы обращаемся с данными</button><button data-act="doc" data-v="health">Здоровье и безопасность</button></div>
  </div>`;
}
function viewStart() {
  const path = (act, icon, title, sub, main, tag) => `<button class="path ${main ? 'main' : ''}" data-act="start-path" data-v="${act}"><span class="pi">${icon}</span><span class="grow"><b>${title}${tag ? `<span class="tag">${tag}</span>` : ''}</b><span class="s">${sub}</span></span></button>`;
  return `<div class="onb">${brand()}
    <div><h1 class="hero-t">С чего начнём?</h1><p class="lead" style="margin-top:6px">Выбери, что нужно сейчас. Остальное всегда будет под рукой.</p></div>
    <div class="paths">
      ${path('wish', I.spark, 'Подобрать программу', 'Напиши своими словами цель, вес, опыт и на что сделать акцент — составлю программу под тебя', true, 'ИИ')}
      ${path('import', I.photo, 'Загрузить свою программу', 'Скриншоты из другого приложения или текст — разберу дни и упражнения')}
      ${path('camera', I.camera, 'Тренировка с камерой', 'Камера смотрит технику и подсказывает прямо во время подхода')}
      ${path('video', I.video, 'Разбор видео', 'Загрузи запись подхода — покажу ошибки в каждом повторе')}
    </div>
    <button class="btn ghost" data-act="demo">Сначала посмотреть на примере</button>
    <p class="privacy">${I.lock}<span>${S.acct ? 'Видео не покидает телефон. Программа и дневник сохраняются в аккаунте на сервере в России.' : 'Программа, дневник и видео хранятся только на этом телефоне — на сервер они не отправляются.'}</span></p>
  </div>`;
}


'use strict';
/* ---------- the account on the server ----------
   Inside Telegram the account is the person's Telegram (no password); in a browser — e-mail and password.
   Signed in, the server decides access (trial, promo codes, subscription, AI limits) and keeps the data in sync.
   Without the server (no connection, or not signed in) the app works on the phone exactly as in 2.6. */
const Account = (() => {
  let tgPending = null;        // a Telegram person who has not given the consents yet: {first_name, username}
  let syncInfo = {state: 'idle', at: 0};
  const signedIn = () => !!(TRENER.accounts && S.acct && API.hasSession());

  function setEnt(e) {
    if (!e) return;
    S.server = e;
    S.usage = {m: e.period.key, prog: e.used.prog, photo: e.used.photo, ask: e.used.ask};
    if (e.level === 'sub' && e.promo) { if (S.sub.promo !== e.promo.code) S.sub.since = e.since; S.sub.promo = e.promo.code; S.sub.unlimited = !!e.unlimited; }
  }
  function applyMe(me) {
    const u = me.user, pd = me.consents.find(c => c.kind === 'pd'), terms = me.consents.find(c => c.kind === 'terms');
    S.acct = {id: u.id, email: u.email || '', tg: u.telegram, hasPassword: !!u.has_password, consents: me.consents, versions: me.consent_versions};
    setEnt(me.entitlements);
    const consent = {pd: {v: pd ? pd.version : CONSENT_V, at: pd ? pd.accepted_at : Date.now()}, terms: {v: terms ? terms.version : CONSENT_V, at: terms ? terms.accepted_at : Date.now()}, news: me.consents.some(c => c.kind === 'marketing')};
    S.user = {...(S.user || {}), email: u.email || (S.user && S.user.email) || '', at: u.trial_started_at, consent};
  }
  function forget() {   // the session ended on the server: the phone keeps its data and works as before
    API.clear(); Sync.reset(); delete S.acct; delete S.server; delete S.sub.unlimited;
  }
  /* the data on this phone belongs to one account: another account starts from a clean slate (its own data comes from the
     server), and nothing of the previous person goes into it */
  function startClean() {
    const theme = S.theme;
    S = fresh(); S.theme = theme; S.renaming = null; S.wiz = null;
    REG = {pd: false, terms: false, news: false, email: '', promo: ''};
    Sync.reset();
  }
  function finishSignIn(data) {
    const id = data.me.user.id;
    if (S.ownerId && S.ownerId !== id) startClean();
    API.setTokens(data); applyMe(data.me); tgPending = null; S.ownerId = id;
    if (S.stage === 'welcome') S.stage = S.program.days.length ? 'app' : 'start';
    saveLocal(); closeSheet(); render(); window.scrollTo({top: 0});
    if (data.promo === 'invalid') toast('Промокод не подошёл — вход выполнен без него');
    Sync.now();
  }

  /* ---- Telegram Mini App ---- */
  async function tgSignIn(consents, promo) {
    const body = {init_data: TG.initData()};
    if (S.user && S.user.at) body.registered_at = S.user.at;
    if (consents) body.consents = consents;
    const pc = promo || (!S.acct && S.sub.promo) || '';   // a code activated on this phone before accounts existed
    if (pc) body.promo = pc;
    const r = await API.raw('/v1/auth/telegram', {method: 'POST', body});
    if (r.ok) return finishSignIn(r.data);
    if (r.error.code === 'consent_required') {
      tgPending = r.error.telegram || {};
      // consents given in this app to the current text (2.0) count: the person agreed on this phone
      if (!consents && S.user && S.user.consent && S.user.consent.pd && S.user.consent.pd.v === CONSENT_V) return tgSignIn({pd: true, terms: true, marketing: !!S.user.consent.news}, promo);
      if (S.stage === 'welcome') return render();
      return consentSheet();
    }
    if (consents && r.status === 0) {   // «Начать» with no connection: start on the phone, the account comes later
      localUser(''); S.stage = 'start'; render(); return toast('Нет связи с сервером — начнём на этом телефоне');
    }
    if (consents) toast(r.error.message);
  }
  function consentSheet() {
    REG.pd = false; REG.terms = false;
    sheet('Данные в аккаунте', `<p style="margin:0">Теперь программа, дневник и итоги разборов сохраняются в твоём аккаунте на сервере в России — их не потерять при смене телефона. Травмы и ограничения остаются только на телефоне, видео по-прежнему не отправляется.</p>
      ${ckRow('pd', 'Даю <a class="linkish" href="#consent" data-act="doc" data-v="consent">согласие на обработку персональных данных</a>', true)}
      ${ckRow('terms', 'Мне есть 18 лет, принимаю <a class="linkish" href="#terms" data-act="doc" data-v="terms">пользовательское соглашение</a>', true)}`,
      '<button class="btn" data-act="close">Не сейчас</button><button class="btn primary" id="reg-go" data-act="acc-consent-go" disabled>Сохранять в аккаунте</button>');
  }

  /* ---- browser: e-mail and password ---- */
  function localUser(email) {
    if (S.user) return;
    const at = Date.now();
    S.user = {email, at, consent: {pd: {v: CONSENT_V, at}, terms: {v: CONSENT_V, at}, news: REG.news}};
  }
  async function register(email, password, promo) {
    const btn = $('#reg-go'); if (btn) btn.disabled = true;
    const body = {email, password, consents: {pd: REG.pd, terms: REG.terms, marketing: REG.news}};
    if (promo) body.promo = promo;
    if (S.user && S.user.at) body.registered_at = S.user.at;
    if (TG.inside()) body.init_data = TG.initData();
    const r = await API.raw('/v1/auth/register', {method: 'POST', body});
    if (btn) btn.disabled = false;
    if (r.ok) { localUser(email); return finishSignIn(r.data); }
    if (r.status === 0 && S.stage === 'welcome') {
      localUser(email); S.stage = 'start'; render(); window.scrollTo({top: 0});
      return toast('Нет связи с сервером — начнём на этом телефоне. Аккаунт можно создать позже в профиле');
    }
    if (r.error.code === 'email_taken') { toast(r.error.message); return loginSheet(email); }
    toast(r.error.message);
  }
  function loginSheet(email) {
    sheet('Вход в аккаунт', `<div class="field"><label for="acc-email">Электронная почта</label><input class="input" id="acc-email" type="email" autocomplete="email" inputmode="email" placeholder="name@mail.ru" value="${esc(email || (S.user && S.user.email) || '')}"></div>
      <div class="field"><label for="acc-pass">Пароль</label><input class="input" id="acc-pass" type="password" autocomplete="current-password"></div>
      <button class="btn ghost" data-act="acc-forgot">Не помню пароль</button>
      ${S.program.days.length || S.diary.length ? '<p class="hint" style="margin:0">После входа программа и дневник из аккаунта появятся здесь, а тренировки с этого телефона добавятся в аккаунт.</p>' : ''}`,
      '<button class="btn" data-act="close">Отмена</button><button class="btn primary" id="acc-go" data-act="acc-login-go">Войти</button>', '', true);
    setTimeout(() => { const i = $(email ? '#acc-pass' : '#acc-email'); i && i.focus(); }, 60);
  }
  function registerSheet() {
    REG.pd = false; REG.terms = false;
    sheet('Создать аккаунт', `<div class="field"><label for="reg-email">Электронная почта</label><input class="input" id="reg-email" type="email" autocomplete="email" inputmode="email" placeholder="name@mail.ru" value="${esc((S.user && S.user.email) || '')}"></div>
      <div class="field"><label for="reg-pass">Пароль</label><input class="input" id="reg-pass" type="password" autocomplete="new-password" placeholder="Не короче 8 символов"></div>
      ${ckRow('pd', 'Даю <a class="linkish" href="#consent" data-act="doc" data-v="consent">согласие на обработку персональных данных</a>', true)}
      ${ckRow('terms', 'Мне есть 18 лет, принимаю <a class="linkish" href="#terms" data-act="doc" data-v="terms">пользовательское соглашение</a>', true)}
      <p class="hint" style="margin:0">Программа, дневник и итоги разборов перейдут в аккаунт. Травмы и ограничения останутся только на телефоне.</p>`,
      '<button class="btn" data-act="close">Отмена</button><button class="btn primary" id="reg-go" data-act="acc-register-go" disabled>Создать</button>', '', true);
  }
  function credentialsSheet() {
    sheet('Почта и пароль', `<p class="hint" style="margin:0">Чтобы открывать приложение и в браузере — на компьютере или другом телефоне.</p>
      <div class="field"><label for="acc-email">Электронная почта</label><input class="input" id="acc-email" type="email" autocomplete="email" inputmode="email" placeholder="name@mail.ru"></div>
      <div class="field"><label for="acc-pass">Пароль</label><input class="input" id="acc-pass" type="password" autocomplete="new-password" placeholder="Не короче 8 символов"></div>`,
      '<button class="btn" data-act="close">Отмена</button><button class="btn primary" id="acc-go" data-act="acc-cred-go">Сохранить</button>', '', true);
  }
  function forgotSheet() {
    const email = (($('#acc-email') || {}).value || (S.user && S.user.email) || '').trim();
    sheet('Новый пароль', `<p class="hint" style="margin:0">Пришлём на почту код из 6 цифр.</p>
      <div class="field"><label for="acc-email">Электронная почта</label><input class="input" id="acc-email" type="email" autocomplete="email" inputmode="email" value="${esc(email)}"></div>`,
      '<button class="btn" data-act="close-top">Отмена</button><button class="btn primary" id="acc-go" data-act="acc-forgot-go">Прислать код</button>', '', true);
  }
  function resetSheet(email) {
    sheet('Код из письма', `<p class="hint" style="margin:0">Код отправлен на ${esc(email)}. Он действует 30 минут.</p>
      <div class="field"><label for="acc-code">Код</label><input class="input" id="acc-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
      <div class="field"><label for="acc-pass">Новый пароль</label><input class="input" id="acc-pass" type="password" autocomplete="new-password" placeholder="Не короче 8 символов"></div>
      <input type="hidden" id="acc-email" value="${esc(email)}">`,
      '<button class="btn" data-act="close-top">Отмена</button><button class="btn primary" id="acc-go" data-act="acc-reset-go">Сохранить пароль</button>', '', true);
  }
  const field = id => (($(id) || {}).value || '').trim();
  async function busy(fn) { const b = $('#acc-go'); if (b) b.disabled = true; try { return await fn(); } finally { const x = $('#acc-go'); if (x) x.disabled = false; } }

  /* ---- what the profile shows ---- */
  function section() {
    const row = (label, val) => `<div class="prow"><span>${label}</span><span class="val">${val}</span></div>`;
    const btn = (act, label, extra = '') => `<button class="prow" data-act="${act}"${extra}><span><b>${label}</b></span><span style="width:18px;flex:none;color:var(--muted)">${CHEV}</span></button>`;
    const consent = S.user && S.user.consent ? ruDate(S.user.consent.pd.at) + ', версия ' + S.user.consent.pd.v : '—';
    if (!TRENER.accounts) return `<div class="plist"><div class="prow"><span>Почта</span><span class="val">${esc(S.user ? S.user.email : '—')}</span></div>
      <div class="prow"><span>Согласие дано</span><span class="val">${consent}</span></div></div>`;   // as in 2.6
    if (!signedIn()) {
      return `<div class="plist">${row('Почта', esc(S.user ? S.user.email || '—' : '—'))}${row('Согласие дано', consent)}
        ${TG.inside() ? btn('acc-tg', 'Сохранять данные в аккаунте') : btn('acc-login', 'Войти в аккаунт') + btn('acc-register', 'Создать аккаунт')}</div>
        <p class="hint" style="margin:-4px 2px 0">Аккаунт хранит программу и дневник на сервере в России — их не потерять при смене телефона.</p>`;
    }
    const a = S.acct, how = a.tg ? `Telegram${a.tg.username ? ' · @' + esc(a.tg.username) : a.tg.first_name ? ' · ' + esc(a.tg.first_name) : ''}` : 'почта и пароль';
    const st = syncInfo.state === 'syncing' ? 'сохраняю…' : syncInfo.state === 'offline' ? 'нет связи — сохранено на телефоне'
      : Sync.lastAt() ? 'на сервере · ' + new Date(Sync.lastAt()).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) : 'на сервере';
    return `<div class="plist">${row('Вход', how)}${row('Почта', esc(a.email || 'не указана'))}${row('Согласие дано', consent)}
      <button class="prow" data-act="acc-sync"><span>Данные</span><span class="val">${st}</span></button>
      ${a.email ? '' : btn('acc-cred', 'Добавить почту и пароль для браузера')}
      ${btn('acc-export', 'Выгрузить мои данные')}${btn('acc-logout', 'Выйти из аккаунта')}</div>`;
  }

  /* ---- startup ---- */
  async function start() {
    if (!TRENER.accounts) return;   // no server yet: the app works on the phone
    if (TG.inside() && (!S.acct || !API.hasSession())) { await tgSignIn(); return; }
    if (!API.hasSession()) { if (S.acct) { forget(); saveLocal(); } return; }
    const r = await API.call('/v1/me');
    if (r.ok) {
      if (S.ownerId && S.ownerId !== r.data.user.id) { forget(); startClean(); saveLocal(); render(); return; }   // not this phone's account
      applyMe(r.data); S.ownerId = r.data.user.id; saveLocal(); render(); Sync.now(); if (needsReconsent()) consentSheetBrowser();
    }
    else if (r.status === 401) { forget(); saveLocal(); render(); }
  }
  /* the consent text changed after the person agreed: ask again (browser accounts; Telegram asks through the server) */
  function needsReconsent() { const pd = S.acct && S.acct.consents.find(c => c.kind === 'pd'); return !!(pd && S.acct.versions && pd.version !== S.acct.versions.pd); }
  function consentSheetBrowser() {
    REG.pd = false; REG.terms = false;
    sheet('Обновлённое согласие', `<p style="margin:0">Мы обновили согласие на обработку персональных данных. Посмотри, что изменилось, и подтверди — без этого данные не сохраняются в аккаунте.</p>
      ${ckRow('pd', 'Даю <a class="linkish" href="#consent" data-act="doc" data-v="consent">согласие на обработку персональных данных</a>', true)}
      ${ckRow('terms', 'Принимаю <a class="linkish" href="#terms" data-act="doc" data-v="terms">пользовательское соглашение</a>', true)}`,
      '<button class="btn primary" id="reg-go" data-act="acc-reconsent-go" disabled>Подтвердить</button>');
  }
  function syncDone(r) {
    syncInfo = {state: r && r.ok ? 'ok' : r && r.skipped ? 'idle' : 'offline', at: Date.now()};
    if (r && r.status === 401) { forget(); saveLocal(); render(); }
    const v = $('[data-act="acc-sync"] .val'); if (v && S.tab === 'profile') { const tmp = document.createElement('div'); tmp.innerHTML = section(); const nv = $('[data-act="acc-sync"] .val', tmp); if (nv) v.textContent = nv.textContent; }
  }

  /* ---- buttons ---- */
  Object.assign(A, {
    'acc-login': () => loginSheet(),
    'acc-register': () => registerSheet(),
    'acc-tg': () => tgSignIn(),
    'acc-forgot': () => forgotSheet(),
    'acc-cred': () => credentialsSheet(),
    'acc-sync': async () => { syncInfo.state = 'syncing'; syncDone({ok: true}); const r = await Sync.now(); toast(r && r.ok ? 'Данные сохранены в аккаунте' : 'Нет связи с сервером — данные остаются на телефоне'); },
    'acc-login-go': () => busy(async () => {
      const email = field('#acc-email'), password = ($('#acc-pass') || {}).value || '';
      if (!EMAIL_RX.test(email)) return toast('Проверь почту — например, name@mail.ru');
      if (!password) return toast('Введи пароль');
      const body = {email, password}; if (TG.inside()) body.init_data = TG.initData();
      const r = await API.raw('/v1/auth/login', {method: 'POST', body});
      if (!r.ok) return toast(r.error.message);
      Sync.reset(); finishSignIn(r.data); toast('Вход выполнен');
    }),
    'acc-register-go': () => {
      const email = field('#reg-email'), password = ($('#reg-pass') || {}).value || '';
      if (!EMAIL_RX.test(email)) return toast('Проверь почту — например, name@mail.ru');
      if (password.length < 8) return toast('Пароль — не короче 8 символов');
      if (!REG.pd || !REG.terms) return toast('Отметь согласие и соглашение — без них аккаунт не создать');
      return register(email, password, '');
    },
    'acc-consent-go': () => { if (REG.pd && REG.terms) tgSignIn({pd: true, terms: true, marketing: REG.news}); },
    'acc-reconsent-go': async () => {
      if (!REG.pd || !REG.terms) return;
      for (const kind of ['pd', 'terms']) { const r = await API.call('/v1/me/consents', {method: 'POST', body: {kind}}); if (!r.ok) return toast(r.error.message); if (kind === 'terms') { applyMe(r.data); saveLocal(); } }
      closeSheet(); render(); toast('Спасибо, согласие обновлено');
    },
    'acc-forgot-go': () => busy(async () => {
      const email = field('#acc-email');
      if (!EMAIL_RX.test(email)) return toast('Проверь почту — например, name@mail.ru');
      const r = await API.raw('/v1/auth/password/forgot', {method: 'POST', body: {email}});
      if (!r.ok) return toast(r.error.message);
      closeTop(); resetSheet(email);
    }),
    'acc-reset-go': () => busy(async () => {
      const email = field('#acc-email'), code = field('#acc-code'), password = ($('#acc-pass') || {}).value || '';
      if (!/^\d{6}$/.test(code)) return toast('Код — 6 цифр из письма');
      if (password.length < 8) return toast('Пароль — не короче 8 символов');
      const r = await API.raw('/v1/auth/password/reset', {method: 'POST', body: {email, code, password}});
      if (!r.ok) return toast(r.error.message);
      Sync.reset(); finishSignIn(r.data); toast('Пароль сохранён');
    }),
    'acc-cred-go': () => busy(async () => {
      const email = field('#acc-email'), password = ($('#acc-pass') || {}).value || '';
      if (!EMAIL_RX.test(email)) return toast('Проверь почту — например, name@mail.ru');
      if (password.length < 8) return toast('Пароль — не короче 8 символов');
      const r = await API.call('/v1/me/credentials', {method: 'POST', body: {email, password}});
      if (!r.ok) return toast(r.error.message);
      applyMe(r.data); saveLocal(); closeSheet(); render(); toast('Готово: теперь можно входить и по почте');
    }),
    /* leaving the account clears this phone: the data is in the account, and the next person must not see it */
    'acc-logout': async () => {
      const r = await Sync.now();
      if (r && !r.ok && !r.skipped) return toast('Нет связи с сервером — последние изменения ещё не сохранены в аккаунте. Выйди, когда связь появится');
      const token = API.refreshToken();
      if (token) API.raw('/v1/auth/logout', {method: 'POST', body: {refresh_token: token}});
      forget(); startClean(); saveLocal(); render(); window.scrollTo({top: 0});
      toast('Ты вышла из аккаунта. Программа и дневник сохранены в нём — войди снова, чтобы их вернуть');
    },
    'acc-export': async () => {
      const r = await API.call('/v1/me/export');
      if (!r.ok) return toast(r.error.message);
      const text = JSON.stringify(r.data, null, 1), name = `ii-trener-moi-dannye-${new Date().toISOString().slice(0, 10)}.json`;
      if (canDownload()) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'})); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        return toast(`Сохранено: ${name}`);
      }
      sheet('Мои данные', `<p class="hint" style="margin:0">Всё, что хранится в аккаунте. Скопируй и сохрани.</p><textarea class="input" id="bk-text" readonly style="min-height:160px;font:12px/1.4 var(--f-mono)">${esc(text)}</textarea>`,
        '<button class="btn" data-act="close">Закрыть</button><button class="btn primary" data-act="bk-copy">Скопировать</button>');
    },
  });

  /* promo code: checked by the server */
  async function redeem(code) {
    const r = await API.call('/v1/promo/redeem', {method: 'POST', body: {code}});
    if (!r.ok) return r;
    setEnt(r.data.entitlements); applyPromo(r.data.promo.code, !!r.data.entitlements.unlimited);
    return {ok: true, text: r.data.promo.text};
  }
  /* AI use: counted on the server (the phone has already counted it locally) */
  function used(kind) { if (!signedIn()) return; API.call('/v1/usage/' + kind, {method: 'POST'}).then(r => { if (r.data && (r.data.entitlements || (r.data.error && r.data.error.entitlements))) { setEnt(r.data.entitlements || r.data.error.entitlements); saveLocal(); } }); }
  /* deleting everything: on the server first, then on the phone */
  async function deleteAll() {
    const r = await API.call('/v1/me', {method: 'DELETE', body: {confirm: 'УДАЛИТЬ'}});
    if (!r.ok) return r;
    forget();
    return {ok: true};
  }
  return {start, signedIn, tgSignIn, register, loginSheet, section, syncDone, redeem, used, deleteAll, setEnt,
    tgName: () => (tgPending && tgPending.first_name) || ((TG.user() || {}).first_name) || ''};
})();

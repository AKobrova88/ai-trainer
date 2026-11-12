'use strict';
/* ---------- the account on the server ----------
   Inside Telegram the account is the person's Telegram; in a browser — the e-mail: a 6-digit code comes in a letter, no passwords.
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
    S.acct = {id: u.id, email: u.email || '', tg: u.telegram, consents: me.consents, versions: me.consent_versions};
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
    if (S.ownerId !== id) { S.ownerId = id; Sync.reset(); }
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

  /* ---- e-mail: a one-time code from the letter (sign in, a new account, or an address for a Telegram account) ---- */
  function localUser(email) {
    if (S.user) return;
    const at = Date.now();
    S.user = {email, at, consent: {pd: {v: CONSENT_V, at}, terms: {v: CONSENT_V, at}, news: REG.news}};
  }
  let pending = null;          // {email, mode: 'login' | 'add', consents, promo, code}: the letter is on its way
  let waitTimer = 0;
  const startPath = mode => mode === 'add' ? '/v1/me/email/start' : '/v1/auth/email/start';
  async function sendCode(email, ctx) {
    const r = ctx.mode === 'add' ? await API.call(startPath('add'), {method: 'POST', body: {email}}) : await API.raw(startPath('login'), {method: 'POST', body: {email}});
    if (!r.ok) return r;
    pending = {...ctx, email};
    codeSheet(r.data.resend_after || 60);
    return r;
  }
  /* the first screen and «Создать аккаунт»: e-mail and consents, then the code */
  async function register(email, promo) {
    const btn = $('#reg-go'); if (btn) btn.disabled = true;
    const r = await sendCode(email, {mode: 'login', consents: {pd: REG.pd, terms: REG.terms, marketing: REG.news}, promo});
    if (btn) btn.disabled = false;
    if (r.ok) return;
    if (r.status === 0 && S.stage === 'welcome') {
      localUser(email); S.stage = 'start'; render(); window.scrollTo({top: 0});
      return toast('Нет связи с сервером — начнём на этом телефоне. Аккаунт можно создать позже в профиле');
    }
    toast(r.error.message);
  }
  function emailSheet(mode) {
    const add = mode === 'add';
    sheet(add ? 'Почта для входа' : 'Вход по почте', `<p class="hint" style="margin:0">${add ? 'Чтобы открывать приложение и в браузере — на компьютере или другом телефоне. ' : ''}Пришлём на почту код из 6 цифр — пароль не нужен.</p>
      <div class="field"><label for="acc-email">Электронная почта</label><input class="input" id="acc-email" type="email" autocomplete="email" inputmode="email" placeholder="name@mail.ru" value="${esc(add ? '' : (S.user && S.user.email) || '')}"></div>
      ${!add && (S.program.days.length || S.diary.length) ? '<p class="hint" style="margin:0">После входа программа и дневник из аккаунта появятся здесь, а тренировки с этого телефона добавятся в аккаунт.</p>' : ''}`,
      `<button class="btn" data-act="close">Отмена</button><button class="btn primary" id="acc-go" data-act="acc-email-go" data-v="${add ? 'add' : 'login'}">Получить код</button>`, '', true);
    setTimeout(() => { const i = $('#acc-email'); i && i.focus(); }, 60);
  }
  function loginSheet() {
    if (TRENER.emailLogin) return emailSheet('login');
    sheet('Войти в свой аккаунт', `<p class="hint" style="margin:0">Открой ИИ Тренер в Telegram → «Личный кабинет» → «Подключить браузер». Скопируй одноразовый код и введи его здесь. Программы и дневник с этого устройства добавятся в твой аккаунт.</p>
      <a class="btn" href="https://t.me/${TRENER.bot}?startapp=account" target="_blank" rel="noopener">Открыть Telegram</a>
      <div class="field"><label for="device-code">Одноразовый код</label><input class="input" id="device-code" inputmode="numeric" autocomplete="one-time-code" maxlength="18" placeholder="0000 0000 0000"></div>`,
      '<button class="btn" data-act="close">Отмена</button><button class="btn primary" id="acc-go" data-act="acc-device-login">Войти</button>');
  }
  let deviceCode = '';
  async function issueDeviceCode() {
    const sync = await Sync.now();
    if (!sync.ok) return toast(sync.error?.message || 'Сначала сохрани изменения в аккаунте, затем повтори.');
    const r = await API.call('/v1/me/device-code', {method: 'POST'});
    if (!r.ok) return toast(r.error.message);
    deviceCode = r.data.code;
    sheet('Подключить браузер', `<p class="hint" style="margin:0">На сайте trener-ii.ru открой «Личный кабинет» → «Войти через Telegram» и введи этот код. Он действует 5 минут и подходит только для одного входа.</p>
      <p style="font:700 28px var(--f-mono);text-align:center;letter-spacing:3px" aria-label="Одноразовый код">${esc(deviceCode.match(/.{1,4}/g).join(' '))}</p>
      <p class="hint" style="margin:0">Не передавай код другим людям: он открывает доступ к твоим программам и дневнику.</p>`,
      '<button class="btn" data-act="close">Закрыть</button><button class="btn primary" data-act="acc-device-copy">Скопировать код</button>');
  }
  function codeSheet(wait) {
    closeTop();
    sheet('Код из письма', `<p class="hint" style="margin:0">Отправили код на <b>${esc(pending.email)}</b>. Он действует 10 минут. Если письма нет — загляни в «Спам».</p>
      <div class="field"><label for="acc-code">Код</label><input class="input" id="acc-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="font-size:24px;letter-spacing:6px;text-align:center"></div>
      <button class="btn ghost" id="acc-again" data-act="acc-code-again" disabled></button>`,
      `<button class="btn" data-act="close">Отмена</button><button class="btn primary" id="acc-go" data-act="acc-code-go">${pending.mode === 'add' ? 'Подтвердить' : 'Войти'}</button>`, '', true);
    const input = $('#acc-code');
    if (input) {
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); if (input.value.length === 6) A['acc-code-go'](); });
      setTimeout(() => input.focus(), 60);
    }
    countdown(wait);
  }
  function countdown(wait) {
    clearInterval(waitTimer);
    let left = wait;
    const tick = () => {
      const b = $('#acc-again'); if (!b) return clearInterval(waitTimer);
      b.disabled = left > 0; b.textContent = left > 0 ? `Отправить ещё раз — через ${left} с` : 'Отправить код ещё раз';
      if (left-- <= 0) clearInterval(waitTimer);
    };
    tick(); waitTimer = setInterval(tick, 1000);
  }
  /* a new address and no consents yet (sign-in from the profile): ask for them, the same code stays valid */
  function newAccountSheet() {
    REG.pd = false; REG.terms = false;
    closeTop();
    sheet('Новый аккаунт', `<p style="margin:0">Аккаунта с почтой <b>${esc(pending.email)}</b> ещё нет — создадим его. Программа, дневник и итоги разборов будут храниться в нём на сервере в России. Травмы и ограничения остаются только на телефоне.</p>
      ${ckRow('pd', 'Даю <a class="linkish" href="#consent" data-act="doc" data-v="consent">согласие на обработку персональных данных</a>', true)}
      ${ckRow('terms', 'Мне есть 18 лет, принимаю <a class="linkish" href="#terms" data-act="doc" data-v="terms">пользовательское соглашение</a>', true)}`,
      '<button class="btn" data-act="close">Отмена</button><button class="btn primary" id="reg-go" data-act="acc-newacc-go" disabled>Создать аккаунт</button>', '', true);
  }
  async function verify() {
    const p = pending;
    if (p.mode === 'add') {
      const r = await API.call('/v1/me/email/verify', {method: 'POST', body: {email: p.email, code: p.code}});
      if (!r.ok) return toast(r.error.message);
      pending = null; applyMe(r.data); saveLocal(); closeSheet(); render(); return toast('Готово: теперь можно входить и по почте');
    }
    const body = {email: p.email, code: p.code};
    if (p.consents && p.consents.pd && p.consents.terms) body.consents = p.consents;
    if (p.promo) body.promo = p.promo;
    if (S.user && S.user.at) body.registered_at = S.user.at;
    if (TG.inside()) body.init_data = TG.initData();
    const r = await API.raw('/v1/auth/email/verify', {method: 'POST', body});
    if (r.ok) {
      clearInterval(waitTimer); pending = null;
      if (S.stage !== 'welcome') Sync.reset();   // signing in on a phone with its own data: the account's data comes first
      localUser(p.email); finishSignIn(r.data); return toast('Вход выполнен');
    }
    if (r.error.code === 'consent_required') return newAccountSheet();
    toast(r.error.message);
    if (r.error.code === 'code_tries') { const i = $('#acc-code'); if (i) i.value = ''; }
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
        ${TG.inside() ? btn('acc-tg', 'Сохранять данные в аккаунте') : btn('acc-login', TRENER.emailLogin ? 'Войти или создать аккаунт по почте' : 'Войти через Telegram')}</div>
        <p class="hint" style="margin:-4px 2px 0">Аккаунт хранит программу и дневник на сервере в России — их не потерять при смене телефона.</p>`;
    }
    const a = S.acct, how = a.tg ? `Telegram${a.tg.username ? ' · @' + esc(a.tg.username) : a.tg.first_name ? ' · ' + esc(a.tg.first_name) : ''}` : 'почта и пароль';
    const st = syncInfo.state === 'syncing' ? 'сохраняю…' : syncInfo.state === 'error' ? 'нужно повторить синхронизацию' : syncInfo.state === 'offline' ? 'нет связи — сохранено на телефоне'
      : Sync.lastAt() ? 'на сервере · ' + new Date(Sync.lastAt()).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) : 'на сервере';
    return `<div class="plist">${row('Вход', how)}${TRENER.emailLogin || a.email ? row('Почта', esc(a.email || 'не указана')) : ''}${row('Согласие дано', consent)}
      <button class="prow" data-act="acc-sync"><span>Данные</span><span class="val">${st}</span></button>
      ${btn('acc-device-code', 'Подключить браузер')}
      ${a.email || !TRENER.emailLogin ? '' : btn('acc-cred', 'Добавить почту для входа из браузера')}
      ${Sync.hasBackup() ? btn('acc-local-backup', 'Копия до синхронизации') : ''}
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
    syncInfo = {state: r && r.ok ? 'ok' : r && r.skipped ? 'idle' : r && r.status === 0 ? 'offline' : 'error', at: Date.now()};
    if (r && r.status === 401) { forget(); saveLocal(); render(); }
    const v = $('[data-act="acc-sync"] .val'); if (v && S.tab === 'profile') { const tmp = document.createElement('div'); tmp.innerHTML = section(); const nv = $('[data-act="acc-sync"] .val', tmp); if (nv) v.textContent = nv.textContent; }
  }

  /* ---- buttons ---- */
  Object.assign(A, {
    'acc-login': () => loginSheet(),
    'acc-device-code': () => issueDeviceCode(),
    'acc-device-copy': async () => { try { await navigator.clipboard.writeText(deviceCode); toast('Код скопирован'); } catch (e) { toast('Выдели код и скопируй вручную'); } },
    'acc-device-login': () => busy(async () => {
      const code = field('#device-code').replace(/\s/g, '');
      if (!/^\d{12}$/.test(code)) return toast('Введи все 12 цифр из личного кабинета Telegram');
      const r = await API.raw('/v1/auth/device', {method: 'POST', body: {code}});
      if (!r.ok) return toast(r.error.message);
      finishSignIn(r.data); toast('Вход выполнен. Объединяю программы и дневник');
    }),
    'acc-local-backup': () => {
      const data = Sync.backup(); if (!data) return toast('Копии ещё нет');
      sheet('Копия до синхронизации', '<p class="hint">Исходные данные с этого устройства. Сохрани текст: его можно вставить в «Восстановить из копии».</p><textarea class="input" id="bk-text" readonly style="min-height:240px">' + esc(JSON.stringify(data)) + '</textarea>', '<button class="btn" data-act="close">Закрыть</button><button class="btn primary" data-act="bk-copy">Скопировать</button>');
    },
    'acc-tg': () => tgSignIn(),
    'acc-cred': () => emailSheet('add'),
    'acc-sync': async () => { syncInfo.state = 'syncing'; render(); const r = await Sync.now(); toast(r && r.ok ? 'Данные сохранены в аккаунте' : r?.error?.message || 'Данные остаются на телефоне — повтори синхронизацию'); },
    'acc-email-go': v => busy(async () => {
      const email = field('#acc-email');
      if (!EMAIL_RX.test(email)) return toast('Проверь почту — например, name@mail.ru');
      const r = await sendCode(email, {mode: v === 'add' ? 'add' : 'login'});
      if (!r.ok) toast(r.error.message);
    }),
    'acc-code-go': () => busy(async () => {
      const code = field('#acc-code');
      if (!pending) return closeSheet();
      if (!/^\d{6}$/.test(code)) return toast('Код — 6 цифр из письма');
      pending.code = code;
      await verify();
    }),
    'acc-code-again': async () => {
      if (!pending) return;
      const r = pending.mode === 'add' ? await API.call(startPath('add'), {method: 'POST', body: {email: pending.email}}) : await API.raw(startPath('login'), {method: 'POST', body: {email: pending.email}});
      if (!r.ok) return toast(r.error.message);
      countdown(r.data.resend_after || 60); toast('Отправили новый код. Прежний больше не действует');
    },
    'acc-newacc-go': () => { if (!pending || !REG.pd || !REG.terms) return; pending.consents = {pd: true, terms: true, marketing: false}; verify(); },
    'acc-consent-go': () => { if (REG.pd && REG.terms) tgSignIn({pd: true, terms: true, marketing: REG.news}); },
    'acc-reconsent-go': async () => {
      if (!REG.pd || !REG.terms) return;
      for (const kind of ['pd', 'terms']) { const r = await API.call('/v1/me/consents', {method: 'POST', body: {kind}}); if (!r.ok) return toast(r.error.message); if (kind === 'terms') { applyMe(r.data); saveLocal(); } }
      closeSheet(); render(); toast('Спасибо, согласие обновлено');
    },
    /* leaving the account clears this phone: the data is in the account, and the next person must not see it */
    'acc-logout': async () => {
      const r = await Sync.now();
      if (r && !r.ok && !r.skipped) return toast('Нет связи с сервером — последние изменения ещё не сохранены в аккаунте. Выйди, когда связь появится');
      const token = API.refreshToken();
      if (token) API.raw('/v1/auth/logout', {method: 'POST', body: {refresh_token: token}});
      forget(); startClean(); saveLocal(); render(); window.scrollTo({top: 0});
      toast('Выход выполнен. Программа и дневник сохранены в аккаунте — войди снова, чтобы их вернуть');
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

'use strict';
/* ---------- backup ---------- */
const BACKUP_KEYS = ['program', 'programs', 'diary', 'schedule', 'voiceSettings', 'next', 'profile', 'videoLog', 'camReceipts', 'theme', 'usage', 'sub', 'user', 'healthOk'];
/* a file download works in the browser; inside a preview frame or Telegram the copy goes through the clipboard */
const canDownload = () => window.parent === window && !(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
function backupText() {
  if (!S.demo) normalizeLibrary(S);
  const source = S.demo && S.demoReturn ? JSON.parse(S.demoReturn) : S;
  return JSON.stringify({app: 'ii-trener', v: 1, at: new Date().toISOString(), ...Object.fromEntries(BACKUP_KEYS.map(k => [k, source[k]]))});
}
function backupFile() {
  const text = backupText(), name = `ii-trener-kopiya-${new Date().toISOString().slice(0, 10)}.json`;
  if (canDownload()) {
    try {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'})); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return toast(`Копия сохранена: ${name}`);
    } catch (e) { /* fall through to the text copy */ }
  }
  sheet('Копия данных', `<p class="hint" style="margin:0">Скопируй текст и сохрани в заметках или отправь себе в чат. На новом телефоне: «Профиль → Восстановить → Вставить текст копии».</p><textarea class="input" id="bk-text" readonly style="min-height:160px;font:12px/1.4 var(--f-mono)">${esc(text)}</textarea>`,
    '<button class="btn" data-act="close">Закрыть</button><button class="btn primary" data-act="bk-copy">Скопировать</button>');
}
function restoreSheet() {
  sheet('Восстановить из копии', `<label class="btn" for="restore-file">${I.upload}Выбрать файл копии</label>
    <div class="field"><label for="rs-text">Или вставь текст копии</label><textarea class="input" id="rs-text" placeholder="{&quot;app&quot;:&quot;ii-trener&quot;…" style="min-height:140px;font:12px/1.4 var(--f-mono)"></textarea></div>
    <input type="file" id="restore-file" accept="application/json,.json,text/plain" hidden>`,
    '<button class="btn" data-act="close">Отмена</button><button class="btn primary" data-act="rs-text">Дальше</button>');
}
function restoreText(text) {
  RESTORE = null;
  try {
    const d = JSON.parse(text);
    if (!validBackup(d)) throw new Error('invalid backup');
    sheet('Восстановить из копии?', `<p style="margin:0">Копия от ${ruDate(d.at)}: ${d.program.days.length} ${plural(d.program.days.length, 'день', 'дня', 'дней')} программы, ${d.diary.length} ${plural(d.diary.length, 'тренировка', 'тренировки', 'тренировок')} в дневнике. Текущие данные на телефоне заменятся.</p>`,
      `<button class="btn" data-act="close">Отмена</button><button class="btn primary" data-act="restore-go">Восстановить</button>`);
    RESTORE = d;
  } catch (e) { toast('Это не копия ИИ Тренера — нужен файл ii-trener-kopiya-….json или его текст'); }
}
function validBackup(d) {
  const text = x => typeof x === 'string', num = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const dose = x => num(x) && Number.isInteger(x) && x > 0;
  const item = x => x && text(x.id) && text(x.name) && dose(x.s) && dose(x.lo) && dose(x.hi) && x.hi >= x.lo && num(x.w) && num(x.rest);
  if (!d || d.app !== 'ii-trener' || d.v !== 1 || !d.program || !Array.isArray(d.program.days) || !Array.isArray(d.diary)) return false;
  if (!d.program.days.every(day => day && text(day.id) && text(day.title) && Array.isArray(day.items) && day.items.every(item))) return false;
  if (d.programs && (!Array.isArray(d.programs) || d.programs.length > 100 || new Set(d.programs.map(p => p?.id)).size !== d.programs.length || !d.programs.every(p => p && text(p.id) && text(p.title) && Array.isArray(p.days) && p.days.every(day => day && text(day.id) && text(day.title) && Array.isArray(day.items) && day.items.every(item))))) return false;
  if (!d.diary.every(w => w && text(w.id) && text(w.title) && num(w.date) && Array.isArray(w.items) && w.items.every(e => e && text(e.name) && Array.isArray(e.sets) && e.sets.every(s => s && num(s.w) && dose(s.r))))) return false;
  if (d.profile && (!Array.isArray(d.profile.limits) || !d.profile.limits.every(text) || !Array.isArray(d.profile.other) || !d.profile.other.every(text) || !d.profile.focus || typeof d.profile.focus !== 'object')) return false;
  if (d.voiceSettings != null && !VoicePrefs.valid(d.voiceSettings)) return false;
  if (d.videoLog && !Array.isArray(d.videoLog)) return false;
  if (d.schedule && (!Array.isArray(d.schedule) || !d.schedule.every(p => p && text(p.id) && text(p.dayId) && text(p.title) && num(p.at) && calendarDate(p.date)))) return false;
  if (d.sub && (!Array.isArray(d.sub.packs) || d.sub.packs.some(p => !p || !num(p.until)))) return false;
  return true;
}
function restoreFile(file) { const r = new FileReader(); r.onload = () => restoreText(r.result); r.readAsText(file); }
let RESTORE = null;


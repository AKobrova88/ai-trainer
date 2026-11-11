'use strict';
/* ---------- the coach's voice: praise, gentle advice, an occasional joke ---------- */
const T = EX.tone;
const withJoke = s => Math.random() < T.joke_p ? s + ' ' + pick(T.jokes) : s;
function setVerdict(set, cue) {
  if (!set.n) return '';
  const q = set.c / set.n;
  if (q >= 0.8 || !cue) return withJoke(pick(T.good));
  return pick(q >= 0.5 ? T.ok : T.hard).replace('{cue}', cue.toLowerCase());
}
/* Plain-text stress marks are passed to the selected Russian synthesizer. They
   are not SSML and never change visible exercise names. Keep all speech paths
   here so test phrases, queued advice and live commands use the same lexicon. */
const RU_PRONUNCIATION = Object.freeze({
  'замри':'замри́', 'выпад':'вы́пад', 'выпады':'вы́пады', 'выпадов':'вы́падов',
  'корпус':'ко́рпус', 'локти':'ло́кти', 'плечи':'пле́чи', 'колено':'коле́но',
  'колени':'коле́ни', 'лопатки':'лопа́тки', 'подход':'подхо́д', 'подходы':'подхо́ды',
  'повтор':'повто́р', 'повторы':'повто́ры', 'отсчет':'отсчёт', 'еще':'ещё',
  'счет':'счёт', 'считаем':'счита́ем'
});
function russianSpeech(text) {
  return String(text).normalize('NFC').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '')
    .replace(/([А-Яа-яЁё]+)(\u0301?)/gu, (word, letters, stress) => {
      if (stress) return word;
      const result = RU_PRONUNCIATION[letters.toLowerCase()];
      return result ? (letters[0] === letters[0].toUpperCase() ? result[0].toUpperCase()+result.slice(1) : result) : word;
    }).replace(/\b3D\b/g, 'три дэ').replace(/\b2D\b/g, 'два дэ').trim();
}
const Voice = {
  on: false, last: -Infinity, lastId: {}, guardUntil: 0, rate: 1,
  utterance(text) {
    const u = new SpeechSynthesisUtterance(russianSpeech(text));
    u.lang = 'ru-RU'; u.rate = this.rate; if (this.voice) u.voice = this.voice;
    return u;
  },
  cancel() { try { speechSynthesis.cancel(); } catch (e) { /* no speech engine */ } this.guardUntil = 0; },
  say(text, id, force, low) {
    if (!this.on || !('speechSynthesis' in window)) return false;
    const now = performance.now();
    if (!force && now < this.guardUntil) return false;
    if (low && speechSynthesis.speaking) return false;
    if (!force && now - this.last < (id && /^rep\d+$/.test(id) ? 450 : 1600)) return false;
    if (!force && id && Number.isFinite(this.lastId[id]) && now - this.lastId[id] < 12000) return false;
    try {
      if (!low) speechSynthesis.cancel();
      speechSynthesis.speak(this.utterance(text)); this.last = now; if (id) this.lastId[id] = now;
      return true;
    } catch (e) { return false; }
  },
  announceStart() {
    if (this.say('Начинаю отсчёт.', 'start', true)) this.guardUntil = performance.now() + 1500;
  },
  queue(text) {
    if (!this.on || !('speechSynthesis' in window) || performance.now() < this.guardUntil) return;
    try { speechSynthesis.speak(this.utterance(text)); this.last = performance.now(); } catch (e) { /* speech unavailable */ }
  }
};


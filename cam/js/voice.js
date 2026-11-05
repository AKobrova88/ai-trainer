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
const Voice = {
  on: false, last: 0, lastId: {},
  say(text, id, force, low) {
    if (!this.on || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (low && speechSynthesis.speaking) return;
    if (!force && now - this.last < 1600) return;
    if (!force && id && this.lastId[id] && now - this.lastId[id] < 4500) return;
    try {
      if (!low) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '')); u.lang = 'ru-RU'; u.rate = 1.0; if (this.voice) u.voice = this.voice;
      speechSynthesis.speak(u); this.last = now; if (id) this.lastId[id] = now;
    } catch (e) { /* speech unavailable */ }
  }
};


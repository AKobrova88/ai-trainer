'use strict';
/* Same-origin Russian speech, independent of the voices installed on the phone. */
const RemoteVoice = {
  context:null, source:null, generation:0, busy:false, chain:Promise.resolve(), requests:new Set(), cache:new Map(),
  available() { return typeof fetch === 'function' && !!(window.AudioContext || window.webkitAudioContext); },
  unlock() {
    try {
      if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch (e) { /* the test button can retry after a user gesture */ }
  },
  cancel() {
    this.generation++; this.requests.forEach(c => c.abort()); this.requests.clear();
    try { this.source?.stop(); } catch (e) { /* already ended */ }
    this.source = null; this.busy = false; this.chain = Promise.resolve();
  },
  play(text, voice, rate, append = false) {
    this.unlock();
    if (!append) this.cancel();
    const generation = this.generation;
    this.busy = true;
    this.chain = this.chain.then(async () => {
      if (generation !== this.generation) return;
      this.busy = true;
      const key = voice + ':' + text, controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5500); this.requests.add(controller);
      try {
        let bytes = this.cache.get(key);
        if (!bytes) {
          const origin = location.hostname === 'akobrova88.github.io' ? 'https://trener-ii.ru' : location.origin;
          const response = await fetch(origin + '/speech/say', {method:'POST', credentials:'omit', signal:controller.signal,
            headers:{'Content-Type':'application/json'}, body:JSON.stringify({voice,text})});
          if (!response.ok) throw new Error('voice unavailable');
          bytes = await response.arrayBuffer();
          if (!bytes.byteLength || bytes.byteLength > 2000000) throw new Error('invalid audio');
          this.cache.set(key, bytes);
          while (this.cache.size > 96 || [...this.cache.values()].reduce((n,b) => n+b.byteLength,0) > 8000000) this.cache.delete(this.cache.keys().next().value);
        }
        clearTimeout(timer);
        if (generation !== this.generation || !this.context) return;
        const buffer = await this.context.decodeAudioData(bytes.slice(0));
        if (generation !== this.generation) return;
        if (this.context.state !== 'running') {
          const hint = $('#voiceHelp'); if (hint) hint.textContent = $('#profileVoicePreview') ? 'Нажми ▶, чтобы включить звук.' : 'Коснись экрана, чтобы включить голос.';
          return;
        }
        const source = this.context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
        source.connect(this.context.destination); this.source = source;
        await new Promise(resolve => { source.onended = resolve; source.start(); });
      } catch (e) {
        if (generation === this.generation) {
          const hint = $('#voiceHelp'); if (hint) hint.textContent = 'Голос временно недоступен. Проверь интернет и повтори прослушивание в личном кабинете.';
        }
      } finally {
        clearTimeout(timer); this.requests.delete(controller);
      }
    }).catch(() => {}).finally(() => { if (generation === this.generation) this.busy = false; });
    return true;
  }
};

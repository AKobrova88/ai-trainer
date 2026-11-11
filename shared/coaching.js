'use strict';
/* The camera, saved video review and diary use the same factual, short summary. */
const CoachText = (() => {
  const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : [2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100) ? few : many;
  const clean = text => String(text || '').trim().replace(/[.!?…]+$/u, '');
  const key = text => clean(text).normalize('NFD').replace(/\u0301/g, '').toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
  const praise = n => 'Ты молодец! Записано ' + n + ' ' + plural(n,'подход','подхода','подходов') + '.';
  const encouragements = Object.freeze([
    'Хорошая работа. Отдохни перед следующим подходом.',
    'Ещё один шаг сделан. Двигайся в своём темпе.',
    'Регулярность складывается из таких подходов.',
    'Подход готов. Дай себе время восстановиться.',
    'Ты находишь время на себя. Это уже важно.',
    'Отлично, ещё один подход позади.',
    'Дай дыханию восстановиться. Мы никуда не спешим.',
    'Маленькие шаги тоже двигают вперёд.',
    'Продолжаем спокойно, с вниманием к себе.',
    'Можно выдохнуть. Этот подход уже записан.'
  ]);
  const jokes = Object.freeze([
    'Диван сегодня немного скучает без тебя.',
    'Отдых по плану. Марафон сериалов оставим на потом.',
    'Тренировка сама себя не запишет. Хотя эту часть я уже взяла на себя.',
    'У твоей силы воли сегодня рабочая смена.'
  ]);
  function summary(sets, options = {}) {
    const valid = (Array.isArray(sets) ? sets : []).filter(s => s && Number.isFinite(s.r) && s.r > 0);
    const count = valid.length, total = valid.reduce((n,s) => n+s.r,0), recommendations = new Map();
    for (const s of valid) {
      const notes = Array.isArray(s.ft) ? s.ft.filter(f => f && f.c) : [];
      if (s.cue) notes.push({c:s.cue,n:1});
      const inSet = new Set();
      for (const f of notes) {
        const text = clean(f.c), id = key(text);
        if (!id || inSet.has(id)) continue;
        inSet.add(id);
        const previous = recommendations.get(id) || {text,sets:0};
        previous.sets++; recommendations.set(id,previous);
      }
    }
    const advice = [...recommendations.values()].sort((a,b) => b.sets-a.sets).slice(0,2).map(x=>x.text);
    const analyzed = options.analysis || valid.some(s => s.n > 0 || s.partial || s.countOnly || s.bar || s.analysisMode);
    const partial = valid.some(s => s.partial), bodyUnknown = valid.some(s => s.countOnly || s.bar || s.analysisMode === 'bar');
    let finding = advice.length ? 'На следующий раз: ' + advice.join('. ') + '.' : '';
    if (analyzed) {
      const limit = partial ? '3D-подсказки предварительные.' : bodyUnknown || !valid.some(s=>s.n>0) ? 'Техника не оценивалась.' : '';
      finding = [finding,limit].filter(Boolean).join(' ');
    }
    const detail = count ? total + ' ' + (options.hold ? plural(total,'секунда','секунды','секунд') : plural(total,'повтор','повтора','повторов')) + '.' : 'Пока нет записанных подходов.';
    const support = count ? praise(count) : 'Ты молодец, что уделяешь себе время.';
    return {sets:count,total,advice,finding,praise:support,text:[detail,finding,support].filter(Boolean).join(' ')};
  }
  return {key,praise,summary,encouragements,jokes};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CoachText;

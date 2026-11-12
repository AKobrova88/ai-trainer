'use strict';
/* Plain-text stress marks are passed to the selected Russian synthesizer. They
   are not SSML and never change visible exercise names. Keep all speech paths
   here so test phrases, queued advice and live commands use the same lexicon. */
const RU_PRONUNCIATION = Object.freeze({
  'замри':'замри́', 'выпад':'вы́пад', 'выпады':'вы́пады', 'выпадов':'вы́падов',
  'корпус':'ко́рпус', 'локти':'ло́кти', 'плечи':'пле́чи', 'колено':'коле́но',
  'колени':'коле́ни', 'лопатки':'лопа́тки', 'подход':'подхо́д', 'подходы':'подхо́ды',
  'повтор':'повто́р', 'повторы':'повто́ры', 'отсчет':'отсчёт', 'еще':'ещё',
  'счет':'счёт', 'считаем':'счита́ем', 'молодец':'молоде́ц', 'записано':'запи́сано',
  'записан':'запи́сан', 'записана':'запи́сана', 'записаны':'запи́саны',
  'начинаю':'начина́ю', 'секунду':'секу́нду', 'секунды':'секу́нды', 'секунд':'секу́нд',
  'замрите':'замри́те', 'начинай':'начина́й', 'дыши':'дыши́', 'выдох':'вы́дох',
  'повторов':'повто́ров', 'подходов':'подхо́дов', 'подхода':'подхо́да'
});
function russianSpeech(text) {
  return String(text).normalize('NFC').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '')
    .replace(/([А-Яа-яЁё]+)(\u0301?)/gu, (word, letters, stress) => {
      if (stress) return word;
      const result = RU_PRONUNCIATION[letters.toLowerCase()];
      return result ? (letters[0] === letters[0].toUpperCase() ? result[0].toUpperCase()+result.slice(1) : result) : word;
    }).replace(/\b3D\b/g, 'три дэ').replace(/\b2D\b/g, 'два дэ').trim();
}

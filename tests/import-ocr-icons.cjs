// OCR text of 8 synthetic screenshots (4 days × 2 overlapping screens, dark list app) as Tesseract returned it:
// round number badges read as «™»/«(2)», arrow icons before «Увеличиваем вес» read as letters, chevrons «>»,
// Latin look-alikes («Bec», «5kr», «45 cek») and names that wrap onto a second line. No personal data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];
const code = script.slice(0, script.indexOf('/* results from the camera:'));
function app() {
  const storage = new Map(), nodes = new Map();
  nodes.set('#sheets', {lastElementChild: null});
  const context = vm.createContext({URL, console, Date, setTimeout: () => 0, clearTimeout() {}, setInterval() {},
    location: new URL('http://127.0.0.1/app/'), window: {scrollTo() {}}, navigator: {},
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k)},
    document: {addEventListener() {}, querySelector: k => nodes.get(k) || null, querySelectorAll: () => []}});
  vm.runInContext(code, context);
  vm.runInContext(`render = () => save(); renderImport = () => saveImportDraft(); closeSheet = closeImportTools = () => {}; toast = msg => window.lastToast = msg; sheet = () => {};`, context);
  const run = source => vm.runInContext(source, context);
  return {run, json: source => JSON.parse(run(`JSON.stringify(${source})`))};
}
const SHOTS = [
  "9:41",
  "™ Ягодичный мост CO штангой   >",
  "A Увеличиваем вес",
  "3 х 8-12   60 кг",
  "(2) Отведение бедер в тренажере (с   >",
  "наклоном корпуса вперед)",
  "® Оставляем вес",
  "3 х 12-15   45 кг",
  "(3) Румынская тяга на одной ноге   >",
  "3x12   12 кг",
  "(5) Гиперэкстензия на ягодицы   >",
  "A Увеличиваем вес",
  "3x15   10 кг",
  "\u0000photo",
  "9:41",
  "(3) Румынская тяга на одной ноге   >",
  "3x12   12 кг",
  "(5) Гиперэкстензия на ягодицы   >",
  "A Увеличиваем вес",
  "3x15   10 кг",
  "(5) Сгибание ног лежа   >",
  "3x12   25 кг",
  "(6) Скручивания в тренажере   >",
  "® Оставляем вес",
  "3x15   20 кг",
  "\u0000photo",
  "9:41",
  "™ Подтягивания в гравитроне   >",
  "у Уменьшаем вес",
  "3 х 8-12   20 кг",
  "(2) Жим гантелей на наклонной скамье >",
  "3x10   12 кг",
  "(3) Тяга верхнего блока к груди   >",
  "A Увеличиваем Bec",
  "3x12   35 кг",
  "(5) Разведения гантелей в стороны   >",
  "3x15   5kr",
  "\u0000photo",
  "9:41",
  "(3) Тяга верхнего блока к груди   >",
  "A Увеличиваем Bec",
  "3x12   35 кг",
  "(5) Разведения гантелей в стороны   >",
  "3x15   5«kr",
  "(5) Тяга горизонтального блока   >",
  "3x12   30 кг",
  "(6) Планка   >",
  "3 x 45 cek",
  "\u0000photo",
  "9:41",
  "™ Приседания в Смите   >",
  "A Увеличиваем Bec",
  "4 x 8-10   40 кг",
  "(2) Жим ногами   >",
  "3x12   100 кг",
  "(3) Выпады с гантелями   >",
  "® Оставляем вес",
  "3x10   8кг",
  "(5) Отведение бедер в тренажере   >",
  "(сидя)",
  "3x15   40 кг",
  "\u0000photo",
  "9:41",
  "(3) Выпады с гантелями   >",
  "® Оставляем вес",
  "3x10   8кг",
  "(5) Отведение бедер в тренажере   >",
  "(сидя)",
  "3x15   40 кг",
  "(5) Разгибание ног в тренажере   >",
  "3x15   30 кг",
  "(6) Ягодичный мостик на одной ноге   >",
  "3x12",
  "\u0000photo",
  "9:41",
  "™ Становая тяга с гантелями   >",
  "3x10   16 кг",
  "(2) Жим сидя в хаммере   >",
  "A Увеличиваем вес",
  "3x10   23 кг",
  "(3) Тяга гантели в наклоне   >",
  "3x12   12 кг",
  "(5) Ягодичный мост со штангой   >",
  "® Оставляем вес",
  "3x12   70 кг",
  "\u0000photo",
  "9:41",
  "(3) Тяга гантели в наклоне   >",
  "3x12   12 кг",
  "(5) Ягодичный мост со штангой   >",
  "® Оставляем вес",
  "3x12   70 кг",
  "(5) Сгибание рук с гантелями   >",
  "3x12   7kKr",
  "(6) Обратные скручивания   >",
  "3x15"
];
const names = a => a.json('IMP.days.map(d => d.items.map(i => i.name))');

test('icons, advice with an icon letter, look-alike letters and wrapped names: 24 clean exercises', () => {
  const a = app();
  a.run(`IMP = newImportSession(); reviewImportLines(${JSON.stringify(SHOTS)});`);
  const all = names(a).flat();
  assert.equal(all.length, 24);
  assert.ok(all.every(n => !/^[™©®(A-ZА-Я]\s|[@>›]$|^\(\d\)|Увеличива|Оставля|Уменьша|Cek|kr$/u.test(n)), all.join(' | '));
  assert.ok(all.includes('Ягодичный мост со штангой'));
  assert.ok(all.includes('Отведение бедер в тренажере (с наклоном корпуса вперед)'));
  assert.ok(all.includes('Отведение бедер в тренажере (сидя)'));
  assert.ok(a.run('IMP.notes.length') >= 10, 'status lines go to the coach notes');
  const it = a.json(`IMP.days.flatMap(d => d.items).find(i => i.name === 'Разведения гантелей в стороны')`);
  assert.equal(it.w, 5);
  const plank = a.json(`IMP.days.flatMap(d => d.items).find(i => i.name === 'Планка')`);
  assert.equal(plank.sec, true); assert.equal(plank.lo, 45);
});

test('the person says 4 days: the list is cut where screenshots change, not inside an overlapping pair', () => {
  const a = app();
  a.run(`IMP = newImportSession(); reviewImportLines(${JSON.stringify(SHOTS)}); setImportDayCount('4');`);
  assert.deepEqual(a.json('IMP.days.map(d => d.items.length)'), [6, 6, 6, 6]);
  assert.deepEqual(names(a).map(d => d[0]), ['Ягодичный мост со штангой', 'Подтягивания в гравитроне', 'Приседания в Смите', 'Становая тяга с гантелями']);
  assert.deepEqual(a.json('IMP.days.map(d => d.title)'), ['День 1', 'День 2', 'День 3', 'День 4']);
  assert.equal(a.run('readyImport()'), true);
});

test('text without screenshots keeps the old rule: empty days for manual moving', () => {
  const a = app();
  a.run(`IMP = newImportSession(); IMP.mode = 'text'; reviewImportLines(['Жим лёжа 3×10 40 кг', 'Тяга блока 3×12 35 кг', 'Присед 3×10 50 кг']); setImportDayCount('2');`);
  assert.deepEqual(a.json('IMP.days.map(d => d.items.length)'), [3, 0]);
});

test('numbers that cannot be right are corrected to a likely value and must be confirmed', () => {
  const a = app();
  a.run(`IMP = newImportSession(); reviewImportLines(['(8) Ягодичный мост со штангой @ >', 'А Увеличиваем Вес', '3 × 172   116,3 кг', 'Жим ногами 3×12 100 кг', 'Румынская тяга 3×10 1163 кг']); A['imp-confirm-days']();`);
  const [bridge, press, rdl] = a.json('IMP.days[0].items');
  assert.equal(bridge.name, 'Ягодичный мост со штангой');
  assert.deepEqual([bridge.lo, bridge.hi, bridge._needsDose], [12, 12, true]);
  assert.match(bridge._warn, /172/);
  assert.equal(press._warn, undefined);
  assert.equal(rdl.w, 0); assert.match(rdl._warn, /1163/);
  assert.equal(a.run('readyImport()'), false);
  assert.equal(a.run('IMP.notes.length'), 1);
});

test('a name continued on the next line is joined, also when the dose follows it', () => {
  const a = app();
  a.run(`IMP = newImportSession(); reviewImportLines(['Отведение бедер в тренажере (с', 'наклоном корпуса вперед)', '3 × 12-15   45 кг', 'Разгибание рук на блоке', 'с канатом 3×12 15 кг', 'жим лёжа', 'приседания']);`);
  assert.deepEqual(names(a)[0], ['Отведение бедер в тренажере (с наклоном корпуса вперед)', 'Разгибание рук на блоке с канатом', 'Жим лёжа', 'Приседания']);
});

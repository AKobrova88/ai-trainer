// Synthetic OCR fixtures test the actual importer and review actions, not OCR accuracy.
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
  nodes.set('#sheets', {lastElementChild:null});
  const context = vm.createContext({URL, console, Date, setTimeout: () => 0, clearTimeout() {}, setInterval() {},
    location: new URL('http://127.0.0.1/app/'), window: {scrollTo() {}}, navigator: {},
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k)},
    document: {addEventListener() {}, querySelector: k => nodes.get(k) || null, querySelectorAll: () => []}});
  vm.runInContext(code, context);
  vm.runInContext(`window.reviewUI = renderImport; render = () => save(); renderImport = () => saveImportDraft();
    closeSheet = closeImportTools = () => {}; toast = msg => window.lastToast = msg;
    sheet = (title, body, foot) => {window.sheet = {title,body,foot};};`, context);
  const run = source => vm.runInContext(source, context);
  return {run, nodes, json: source => JSON.parse(run(`JSON.stringify(${source})`)), parse: lines => {
    run(`var report = {notes:[],warnings:[]}; var parsed = parseImport(${JSON.stringify(lines)}, report);`);
    return {days: JSON.parse(run('JSON.stringify(parsed)')), report: JSON.parse(run('JSON.stringify(report)'))};
  }};
}
const BREAK = '\u0000photo';
const card = (n, name, weight = 40) => [`${n}. ${name}`, `Вес ${weight}   ${weight}   ${weight}`, 'Повторы 8-12   8-12   8-12'];
const list = ['1. Жим штанги лёжа 3×10 40 кг', '2. Тяга верхнего блока 3×12 35 кг', '3. Планка 3×30 сек', '4. Сгибания рук 3×10 8 кг'];

test('12 photos form 3 days from numbering restarts, preserving advice without changing weight', () => {
  const lines = [];
  for (let day = 0; day < 3; day++) for (let n = 1; n <= 4; n++) {
    if (lines.length) lines.push(BREAK);
    lines.push(...card(n, ['Жим штанги лёжа', 'Тяга верхнего блока', 'Жим ногами', 'Сгибания рук'][n - 1], 20 + n));
    if (n === 2) lines.push('Увеличиваем рабочий вес на 2,5 кг в следующий раз');
  }
  const result = app().parse(lines);
  assert.deepEqual(result.days.map(d => d.items.length), [4,4,4]);
  assert.equal(result.report.notes.length, 3);
  assert.equal(result.days[0].items[1].w, 22);
  assert.equal(result.days[0].items[1].coachNotes.length, 1);
  assert.deepEqual(result.days[2].items[3]._photos, [12]);
});

test('coach advice is filtered equally in list and card formats; exercise names remain exercises', () => {
  const notes = ['Увеличиваем веса', 'Вес оставляем прежний', 'Рекомендация: держи спину ровно',
    'В следующий раз добавь 2 кг', '+2,5 кг в следующий раз', 'Снижаем нагрузку на 10%', 'Если легко, увеличь вес'];
  for (const format of [['Подъём штанги на бицепс 3×10 10 кг'], card(1, 'Подъём штанги на бицепс', 10)]) {
    const result = app().parse([...format, ...notes]);
    assert.equal(result.days.flatMap(d => d.items).length, 1);
    assert.equal(result.report.notes.length, notes.length);
    assert.equal(result.days[0].items[0].w, 10);
  }
});

test('a standalone advice verb and weight label split by OCR are joined', () => {
  const result = app().parse(['1. Жим ногами', 'Вес', '40   40   40', 'Повторы', '10   10   10', 'Увеличиваем', 'вес на 5 кг']);
  assert.equal(result.days[0].items.length, 1);
  assert.equal(result.days[0].items[0].w, 40);
  assert.equal(result.days[0].items[0].s, 3);
  assert.equal(result.report.notes[0].text, 'Увеличиваем вес на 5 кг');
});

test('numbering gaps stay within a day, backwards numbering warns, restart at 1 splits', () => {
  const result = app().parse(['1. Жим лёжа 3×10', '3. Тяга блока 3×10', '5. Жим ногами 3×10',
    '3. Сгибания рук 3×10', '1. Выпады с гантелями 3×10']);
  assert.deepEqual(result.days.map(d => d.items.length), [4,1]);
  assert.match(result.report.warnings.join(' '), /5 → 3/);
});

test('repeated day headers on consecutive photos do not create duplicate days', () => {
  const result = app().parse(['Тренировка 2 · Верх', ...card(1, 'Жим лёжа'), BREAK,
    'Тренировка 2 · Верх', ...card(2, 'Тяга блока'), 'Тренировка 5 · Низ', ...card(1, 'Жим ногами')]);
  assert.deepEqual(result.days.map(d => d.items.length), [2,1]);
  assert.match(result.days[1].title, /5/);
});

test('a card can continue across photos without losing its name, weight or reps', () => {
  const result = app().parse(['1. Жим гантелей на', BREAK, 'наклонной скамье', 'Вес 12   12   12', BREAK,
    'Повторы 8-10   8-10   8-10', ...card(2, 'Тяга блока')]);
  const item = result.days[0].items[0];
  assert.equal(result.days[0].items.length, 2);
  assert.match(item.name, /Жим гантелей на наклонной скамье/);
  assert.equal(item.w, 12);
  assert.equal(item.s, 3);
  assert.equal(item.lo, 8);
  assert.equal(item.hi, 10);
  assert.deepEqual(item._photos, [1,2,3]);
  assert.equal(item._needsDose, undefined);
});

test('overlapping cards are deduplicated, but the first exercise repeated on another day is retained', () => {
  const result = app().parse([...card(1, 'Жим лёжа'), ...card(2, 'Тяга блока'), BREAK,
    ...card(2, 'Тяга блока'), ...card(3, 'Жим ногами'), BREAK, ...card(1, 'Жим лёжа')]);
  assert.deepEqual(result.days.map(d => d.items.length), [3,1]);
  assert.deepEqual(result.days[0].items[1]._photos, [1,2]);
});

test('list doses continuing on the next photo and mixed card/list rows survive', () => {
  const result = app().parse(['1. Жим лёжа', BREAK, '3 подхода по 10', 'Тяга блока', '3 подхода по 12']);
  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].items.length, 2);
  assert.equal(result.days[0].items[1]._number, null);
  assert.deepEqual(result.days[0].items[0]._photos, [1,2]);
  assert.equal(result.days[0].items[1]._needsDose, undefined);
  const mixed = app().parse([...card(1, 'Жим лёжа'), '2. Планка 3×45 сек', ...card(3, 'Тяга блока')]);
  assert.equal(mixed.days[0].items.length, 3);
  assert.equal(mixed.days[0].items[1].sec, true);
});

test('superset markers are not mistaken for day restarts', () => {
  const result = app().parse(['1а. Жим лёжа 3×10', '1б. Тяга блока 3×10', '2а. Сгибания рук 3×10', '2б. Разгибания рук 3×10']);
  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].items.length, 4);
  assert.ok(result.days[0].items[0].ss);
  assert.equal(result.days[0].items[0].ss, result.days[0].items[1].ss);
  assert.notEqual(result.days[0].items[0].ss, result.days[0].items[2].ss);
});

test('same name with different doses across screenshots is retained for manual review', () => {
  const result = app().parse(['Жим лёжа 3×10 40 кг', BREAK, 'Жим лёжа 4×8 45 кг']);
  assert.equal(result.days[0].items.length, 2);
  assert.equal(result.days[0].items[0].w, 40);
  assert.equal(result.days[0].items[1].w, 45);
});

test('missing reps require manual review before a program can be saved', () => {
  const a = app();
  a.run(`IMP = newImportSession(); reviewImportLines(['1. Жим лёжа','Вес 40   40   40','Повторы','2. Тяга блока','Вес 35','Повторы 10   10   10']); A['imp-confirm-days']();`);
  assert.equal(a.run('readyImport()'), false);
  assert.equal(a.run('IMP.days[0].items[0]._needsDose'), true);
});

test('requested day count adds empty destinations without distributing exercises arbitrarily', () => {
  const a = app();
  a.run(`IMP = newImportSession(); IMP.expectedDays = '3'; reviewImportLines(${JSON.stringify(list)});`);
  assert.deepEqual(a.json('IMP.days.map(d => d.items.length)'), [4,0,0]);
  assert.equal(a.run('readyImport()'), false);
  a.run(`moveImportItem(0,3,IMP.days[2].id); moveImportItem(0,2,IMP.days[1].id);`);
  assert.deepEqual(a.json('IMP.days.map(d => d.items.length)'), [2,1,1]);
  assert.equal(a.run('readyImport()'), true);
});

test('split, move, merge, reorder and undo preserve all exercise values', () => {
  const a = app();
  a.run(`IMP = newImportSession(); reviewImportLines(${JSON.stringify(list)}); var original = JSON.stringify(IMP.days[0].items); splitImportDay(0,2);`);
  assert.deepEqual(a.json('IMP.days.map(d => d.items.length)'), [2,2]);
  a.run(`A['imp-row-shift']('1:1:-1'); A['imp-undo'](); A['imp-merge']('1');`);
  assert.equal(a.run('JSON.stringify(IMP.days[0].items) === original'), true);
  a.run(`A['imp-undo'](); moveImportItem(1,1,IMP.days[0].id); A['imp-undo']();`);
  assert.deepEqual(a.json('IMP.days.map(d => d.items.length)'), [2,2]);
});

test('splitting uses already requested empty days instead of creating extra placeholders', () => {
  const a = app();
  a.run(`IMP = newImportSession(); IMP.expectedDays = '3'; reviewImportLines(${JSON.stringify(list)}); splitImportDay(0,2); splitImportDay(1,1);`);
  assert.deepEqual(a.json('IMP.days.map(d => d.items.length)'), [2,1,1]);
  assert.deepEqual(a.json('IMP.days.map(d => d.title)'), ['День 1','День 2','День 3']);
  assert.equal(a.run('readyImport()'), true);
});

test('mistaken exercise can become a note and be restored with all original values', () => {
  const a = app();
  a.run(`IMP = newImportSession(); reviewImportLines(${JSON.stringify(list)}); var original = JSON.stringify(IMP.days[0].items[1]); noteImportItem(0,1);`);
  assert.equal(a.run('IMP.days[0].items.length'), 3);
  assert.equal(a.run('IMP.notes.length'), 1);
  a.run('restoreImportNote(IMP.notes[0].id);');
  assert.equal(a.run('JSON.stringify(IMP.days[0].items[1]) === original'), true);
  assert.equal(a.run('IMP.notes.length'), 0);
  assert.deepEqual(a.json('IMP.days[0].items[0].coachNotes'), []);
});

test('existing program is edited in a draft; save preserves diary and strips recognition metadata', () => {
  const a = app();
  a.run(`S.program.days = parseImport(${JSON.stringify(list)}); S.diary = [{id:'history',items:[]}];
    var originalDayId = S.program.days[0].id, originalItemId = S.program.days[0].items[0].id;
    S.next = originalDayId; var before = JSON.stringify(S.program); organizeProgram(); splitImportDay(0,2); saveImportDraft();`);
  assert.equal(a.run('JSON.stringify(S.program) === before'), true);
  a.run(`importSave();`);
  assert.equal(a.run('S.program.days.length'), 1, 'unconfirmed day count blocks save');
  a.run(`A['imp-confirm-days'](); importSave();`);
  assert.equal(a.run('S.program.days.length'), 2);
  assert.equal(a.run('S.diary[0].id'), 'history');
  assert.equal(a.run('S.importDraft'), undefined);
  assert.equal(a.run('S.program.days[0].items[0]._number'), undefined);
  assert.equal(a.run('S.program.days[0].items[0].st'), undefined);
  assert.equal(a.run('S.program.days[0].id === originalDayId && S.next === originalDayId'), true);
  assert.equal(a.run('S.program.days[0].items[0].id === originalItemId'), true);
});

test('review draft resumes after reload without reading photos again', () => {
  const a = app();
  a.run(`IMP = newImportSession(); reviewImportLines(${JSON.stringify(list)}); splitImportDay(0,2); saveImportDraft();
    S = load(); IMP = null; importSheet();`);
  assert.equal(a.run('IMP.step'), 'review');
  assert.deepEqual(a.json('IMP.days.map(d => d.items.length)'), [2,2]);
  assert.equal(a.run('IMP.photos.length'), 0);
  a.run('S.importDraft.days[0].items = null; importSheet();');
  assert.equal(a.run('IMP.step'), 'pick');
});

test('manual editing validates dose and weight; accepts decimal comma and new exercises', () => {
  const a = app();
  a.run(`IMP = newImportSession(); reviewImportLines(${JSON.stringify(list)}); IMP.fix = [0,0];`);
  const input = value => ({value,setAttribute() {}});
  a.nodes.set('#fx-name', input('Жим штанги лёжа'));
  a.nodes.set('#fx-dose', input('плохо'));
  a.nodes.set('#fx-w', input('16,5'));
  a.run(`A['fx-save']();`);
  assert.equal(a.run('IMP.days[0].items[0].w'), 40);
  a.nodes.get('#fx-dose').value = '4×8-10';
  a.nodes.get('#fx-w').value = '-5';
  a.run(`A['fx-save']();`);
  assert.equal(a.run('IMP.days[0].items[0].w'), 40);
  a.nodes.get('#fx-w').value = '16,5';
  a.run(`A['fx-save']();`);
  assert.deepEqual(a.json('({s:IMP.days[0].items[0].s,lo:IMP.days[0].items[0].lo,hi:IMP.days[0].items[0].hi,w:IMP.days[0].items[0].w})'), {s:4,lo:8,hi:10,w:16.5});
  a.run('fixSheet(0,null);');
  a.nodes.get('#fx-name').value = 'Планка';
  a.nodes.get('#fx-dose').value = '3×45 сек';
  a.nodes.get('#fx-w').value = '';
  a.run(`A['fx-save']();`);
  assert.equal(a.run('IMP.days[0].items.length'), 5);
  assert.equal(a.run('IMP.days[0].items[4].sec'), true);
});

test('review exposes day count, visible split and transfer controls and recoverable recommendations', () => {
  const a = app();
  for (const key of ['#imp','#imp-f','#imp-review-count']) a.nodes.set(key, {innerHTML:'',addEventListener() {}});
  a.run(`IMP = newImportSession(); reviewImportLines(${JSON.stringify([...list,'Увеличиваем вес на 2 кг'])}); window.reviewUI();`);
  const markup = a.nodes.get('#imp').innerHTML;
  assert.match(markup, /На сколько дней нужно разделить/);
  assert.match(markup, /Новый день отсюда/);
  assert.match(markup, /Перенести в другой день/);
  assert.match(markup, /Рекомендации тренера — 1/);
  assert.match(markup, /Это упражнение/);
  assert.match(a.nodes.get('#imp-f').innerHTML, /data-act="imp-save" disabled/);
});

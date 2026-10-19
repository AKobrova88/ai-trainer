// Run with: node tests/regression.cjs
// Exercise the actual inline application code, with only browser IO stubbed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {test} = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];
const code = script.slice(0, script.indexOf('/* results from the camera:'));

function app() {
  const storage = new Map(), events = {}, nodes = new Map();
  const context = vm.createContext({
    URL, console, Date, setTimeout: () => 0, clearTimeout() {}, setInterval() {},
    location: new URL('http://127.0.0.1/app/'),
    window: {scrollTo() {}}, navigator: {},
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k)},
    document: {addEventListener: (name, fn) => { events[name] = fn; }, querySelector: key => nodes.get(key) || null, querySelectorAll: () => []},
  });
  vm.runInContext(code, context);
  vm.runInContext('render = () => save(); closeSheet = () => {}; toast = msg => { window.lastToast = msg; };', context);
  return {run: source => vm.runInContext(source, context), events, nodes};
}

test('demo exit restores own program, diary and active workout, including after reload', () => {
  const a = app();
  a.run(`S.stage = 'app'; S.user = {email:'test@example.invalid',at:Date.now()};
    S.program = demoProgram(); S.diary = demoDiary(S.program); S.program.days[0].title = 'Моя программа';
    S.workout = {dayId:S.program.days[0].id, title:'В процессе',items:[],start:123};
    S.rest = {end:456}; const before = JSON.stringify(S); A.demo(); save(); S = load(); A['demo-off']();
    if (JSON.stringify(S) !== before) throw Error('Own data changed');`);
});

test('backup from demo contains original data', () => {
  const a = app();
  a.run(`S.program = demoProgram(); S.program.days[0].title = 'Оригинал';
    const original = JSON.stringify(S.program); A.demo();
    if (JSON.stringify(JSON.parse(backupText()).program) !== original) throw Error('Demo leaked into backup');`);
});

test('guest demo exit returns to welcome without creating an account', () => {
  const a = app();
  a.run(`A.demo(); S = load(); if (!S.demo || S.user) throw Error('Bad preview'); A['demo-off']();
    if (S.stage !== 'welcome' || S.user || S.program.days.length) throw Error('Bad preview exit');`);
});

test('adopting a program from demo preserves own diary', () => {
  const a = app();
  a.run(`S.user = {email:'test@example.invalid',at:Date.now()}; S.diary = [{id:'real',items:[]}]; A.demo(); useProgram(demoProgram().days, null, 'today');
    if (S.demo || S.demoReturn || S.diary.length !== 1 || S.diary[0].id !== 'real') throw Error('Diary lost');`);
});

test('a guest can try program creation without leaving preview or losing the exit path', () => {
  const a = app();
  a.run(`A.demo(); useProgram(demoProgram().days, null, 'today');
    if (!S.demo || !S.demoReturn) throw Error('Preview exit lost');
    A['demo-off'](); if (S.stage !== 'welcome') throw Error('Not back at welcome');`);
});

test('backup validation accepts own exported data and rejects broken nested structures', () => {
  const a = app();
  a.run(`S.program = demoProgram(); S.diary = demoDiary(S.program);
    const data = JSON.parse(backupText()); if (!validBackup(data)) throw Error('Own backup rejected');
    data.program.days[0].items = null; if (validBackup(data)) throw Error('Broken items accepted');
    const other = JSON.parse(backupText()); other.diary[0].items[0].sets[0].w = -1;
    if (validBackup(other)) throw Error('Negative weight accepted');`);
});

test('diary history matches selected calendar month', () => {
  const a = app();
  a.run(`S.calM = [2026,9]; S.diary = [
    {id:'oct',title:'October workout',date:new Date(2026,9,5).getTime(),items:[]},
    {id:'sep',title:'September workout',date:new Date(2026,8,5).getTime(),items:[]}];
    const html = viewDiary()[1];
    if (!html.includes('October workout') || html.includes('September workout')) throw Error('Wrong month');
    S.calM = [2026,10]; if (!viewDiary()[1].includes('В этом месяце тренировок пока нет')) throw Error('No empty state');`);
});

test('numeric input accepts decimal comma and rejects negative, partial and fractional reps', () => {
  const a = app();
  for (const [value, min, integer, expected] of [
    ['16,5',0,false,16.5], ['0',0,false,0], ['-5',0,false,null], ['12abc',0,false,null],
    ['',0,false,null], ['Infinity',0,false,null], ['0',1,true,null], ['2.5',1,true,null], ['12',1,true,12],
  ]) {
    const result = a.run(`inputNumber({value:${JSON.stringify(value)},setAttribute(){}},${min},${integer})`);
    assert.equal(result, expected, value);
  }
});

test('invalid workout input does not overwrite saved set; typed weight propagates to unfinished sets', () => {
  const a = app();
  a.run(`S.workout = {items:[{sets:[{w:10,r:8,done:false},{w:10,r:8,done:false},{w:20,r:9,done:true}]}]};`);
  const input = {dataset:{in:'w',v:'0:0'}, value:'-5', setAttribute() {}};
  const nextInput = {value:'10',setAttribute() {}};
  a.nodes.set('[data-in="w"][data-v="0:1"]', nextInput);
  a.events.input({target:input});
  assert.equal(a.run('S.workout.items[0].sets[0].w'), 10);
  input.value = '16,5';
  a.events.input({target:input});
  assert.equal(a.run('S.workout.items[0].sets[1].w'), 16.5);
  assert.equal(nextInput.value, '16,5');
  assert.equal(a.run('S.workout.items[0].sets[2].w'), 20);
});

test('rest skip is persisted immediately', () => {
  const a = app();
  a.run(`renderRest = () => {}; S.rest = {end:Date.now()+90000}; save(); A['rest-skip'](); S = load();
    if (S.rest !== null) throw Error('Rest came back');`);
});

test('test mode offers access without payment buttons or paid add-ons', () => {
  const a = app();
  a.run(`const card = subCard();
    if (!card.includes('Оплата отключена') || card.includes('Оформить за') || card.includes('490')) throw Error('Payment offer in test mode');
    if (addonCards() !== '') throw Error('Paid add-ons in test mode');
    S.sub.promo = 'TEST2026';
    if (!subCard().includes('Тестовый доступ включён')) throw Error('Missing active access');`);
});

test('camera preparation requires visible head, body, suitable angle and starting position', () => {
  const camera = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const checkSource = camera.split('/* Setup check: pure pose visibility and analyzer-state checks, also covered by tests. */')[1].split('/* End setup check. */')[0];
  const context = vm.createContext({});
  vm.runInContext(checkSource,context);
  const check = (points,snap,width=640,height=480) => vm.runInContext(`checkSetup(${JSON.stringify(points)},${width},${height},${JSON.stringify(snap)})`,context);
  const points = Array.from({length:33},()=>({x:200,y:200,score:.9}));
  const tracking = {status:'track',phase:'top'};
  assert.equal(check(points,tracking).ready,true);
  assert.equal(check(null,tracking).ready,false);
  assert.equal(check(points,{status:'turn',phase:'top'}).ready,false);
  assert.equal(check(points,{status:'turn_front',phase:'top'}).ready,false);
  assert.equal(check(points,{status:'calib',phase:'setup'}).ready,false);
  assert.equal(check(points,{status:'track',phase:'bottom'}).ready,false);
  assert.equal(check(points,tracking,0,0).ready,false);
  const missingHead = structuredClone(points);
  for (const i of [0,7,8]) missingHead[i].score=0;
  assert.equal(check(missingHead,tracking).body,false);
  const offscreenFeet = structuredClone(points);
  offscreenFeet[27].y=500;offscreenFeet[28].y=500;
  assert.equal(check(offscreenFeet,tracking).body,false);
});

test('both HTML entry points contain valid JavaScript', () => {
  for (const file of ['index.html','app/index.html']) {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    for (const [i, match] of [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].entries()) {
      new vm.Script(match[1], {filename:`${file}:script-${i}`});
    }
  }
});

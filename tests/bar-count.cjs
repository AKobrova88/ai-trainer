// Counting by the weight (2.6): a synthetic plate moves on a textured, static background — frames as the page grabs them
// (160 px wide, grey). Checks the tracker and the rep logic, not a real camera. No personal data.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAT() {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('Technique analyzers'));
  const context = vm.createContext({module: {exports: {}}}); vm.runInContext(code, context);
  const AT = context.module.exports; AT.setData(JSON.parse(html.match(/const EX = (.*);/)[1])); return AT;
}
const AT = loadAT();
const plain = v => JSON.parse(JSON.stringify(v));   // arrays from the VM have another prototype
const W = 160, H = 284;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const R0 = rng(7), BG = new Float32Array(W * H).map(() => 60 + 120 * R0());
for (let k = 0; k < 3; k++) for (let i = W; i < BG.length; i++) BG[i] = (BG[i] + BG[i - 1] + BG[i - W]) / 3;   // a softer texture
/* the plate: a dark disc with bright marks; cx, cy in pixels; sometimes hidden by a flat patch */
function frame(cx, cy, noise, R, hide) {
  const g = BG.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
    if (r < 24) { const a = Math.atan2(dy, dx); g[y * W + x] = 25 + (r < 5 ? 200 : 0) + (Math.sin(6 * a) > 0.6 && r > 12 ? 150 : 0) + (r > 21 ? 90 : 0); }
    if (hide && Math.abs(x - cx) < 34 && Math.abs(y - cy) < 34) g[y * W + x] = 128;
    g[y * W + x] += (R() - 0.5) * noise;
  }
  return g;
}
/* height of the plate above its lowest point: up in `up` s, a pause, down in `down` s, rest */
function profile(reps, {up = 0.5, hold = 0.3, down = 1.2, rest = 0.6, amp = 20, startMid = false, short = -1, lead = 0.8} = {}) {
  const seg = []; let t = lead;
  if (startMid) seg.push([0, 0.6, a => amp * 0.5 * (1 - a)]);
  for (let i = 0; i < reps; i++) {
    const A = i === short ? amp * 0.5 : amp;
    seg.push([t, t + up, a => A * (0.5 - 0.5 * Math.cos(Math.PI * a))]); t += up;
    seg.push([t, t + hold, () => A]); t += hold;
    seg.push([t, t + down, a => A * (0.5 + 0.5 * Math.cos(Math.PI * a))]); t += down + rest;
  }
  const end = t + 0.6;
  return {end, at: tt => { for (const [a, b, f] of seg) if (tt >= a && tt < b) return f((tt - a) / (b - a)); return 0; }};
}
function run(key, prof, {fps = 15, noise = 12, hideFrom = -1, hideTo = -1} = {}) {
  const R = rng(3), tr = new AT.BarTracker(), A = new AT.BarAnalyzer(key);
  for (let i = 0, t = 0; t < prof.end; i++, t = i / fps) {
    const g = frame(100, 190 - prof.at(t), noise, R, t >= hideFrom && t < hideTo);
    const p = i === 0 ? tr.start(g, W, H, 100, 190) : tr.update(g);
    A.update(p, t, W); A.drain();
  }
  A.endSet(); A.drain();
  return A;
}

test('five clean reps of a hip thrust are counted, with the pause and the lowering time', () => {
  const A = run('hip_thrust', profile(5));
  assert.equal(A.reps.length, 5);
  assert.deepEqual(plain(A.reps.map(r => r.faultList)), [[], [], [], [], []]);
  for (const r of A.reps) { assert.ok(r.extra.amp > 15 && r.extra.amp < 25, 'range ' + r.extra.amp); assert.ok(r.extra.ecc > 0.6, 'lowering ' + r.extra.ecc); }
  assert.match(A.note(), /5 повторов\. Амплитуда ровная/);
});

test('a recording that starts in the middle of a rep still counts every whole rep', () => {
  assert.equal(run('hip_thrust', profile(4, {startMid: true, lead: 0.9})).reps.length, 4);
});

test('a half rep at the top is named, dropping the weight is named', () => {
  const short = run('hip_thrust', profile(5, {short: 3}));
  assert.equal(short.reps.length, 5);
  assert.deepEqual(plain(short.reps.map(r => !!r.faults.bar_rom)), [false, false, false, true, false]);
  assert.match(short.note(), /Повтор 4 короче остальных\. Таз выше/);
  const fast = run('hip_thrust', profile(5, {down: 0.35}));
  assert.equal(fast.reps.length, 5);
  assert.match(fast.note(), /Медленнее, под контролем: сейчас около 0,\d с/);
});

test('an exercise that starts with the lowering (leg press) counts the same way', () => {
  const p = profile(4), down = {end: p.end, at: t => 20 - p.at(t)};   // the carriage starts up and goes down first
  const A = run('leg_press', down);
  assert.equal(A.reps.length, 4);
});

test('30 frames per second and a noisy picture give the same count', () => {
  assert.equal(run('hip_thrust', profile(5), {fps: 30, noise: 30}).reps.length, 5);
});

test('the point hidden for a second breaks only that rep and is found again', () => {
  const prof = profile(5), A = run('hip_thrust', prof, {hideFrom: 3.55, hideTo: 4.6});
  assert.ok(A.reps.length >= 4 && A.reps.length <= 5, 'reps ' + A.reps.length);
});

test('no movement, no reps; a flat spot is reported as such', () => {
  const tr = new AT.BarTracker(), A = new AT.BarAnalyzer('hip_thrust'), R = rng(5);
  for (let i = 0; i < 60; i++) { const g = frame(100, 190, 12, R); const p = i ? tr.update(g) : tr.start(g, W, H, 100, 190); A.update(p, i / 15, W); }
  A.endSet(); assert.equal(A.reps.length, 0);
  const flat = new Float32Array(W * H).fill(128);
  assert.ok(new AT.BarTracker().start(flat, W, H, 80, 140).contrast < 4);
});

/* Technique analyzers for every exercise. The original 2D state machines and exercise specs come
   from the Telegram bot; the phone also supports metric MediaPipe world landmarks, body-frame signals
   and deliberately limited 3D assessments. Runs in the browser and in Node. */
const AT = (() => {
'use strict';
const DEG = 180 / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const SIDE = {
  l: { ear: 7, sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27, heel: 29, toe: 31 },
  r: { ear: 8, sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28, heel: 30, toe: 32 }
};
// Image x/y stay in pixels for the overlay. Only keypoints3D is metric; the z
// in image keypoints is normalized and must never be mixed with pixel x/y.
const finite3 = p => p && [p.x, p.y, p.z].every(Number.isFinite);
function poseToKeypoints(poses) {
  const p = poses && poses[0];
  if (!p || !Array.isArray(p.keypoints) || p.keypoints.length !== 33) return null;
  const hasWorld = Array.isArray(p.keypoints3D);
  const kp = p.keypoints.map((k, i) => {
    const w = hasWorld && p.keypoints3D[i];
    const score = Number.isFinite(k.score) ? clamp(k.score, 0, 1) : 0;
    return { x: k.x, y: k.y, z: k.z, score: Number.isFinite(k.x) && Number.isFinite(k.y) ? score : 0,
      world: finite3(w) ? { x: w.x, y: w.y, z: w.z,
        score: Math.min(score, Number.isFinite(w.score) ? clamp(w.score, 0, 1) : score) } : null };
  });
  kp.hasWorld = hasWorld;
  return kp;
}
const dist = (a, b) => {
  const world = a.world && b.world; if (world) { a = a.world; b = b.world; }
  return Math.hypot(a.x - b.x, a.y - b.y, world ? a.z - b.z : 0);
};
function mid(a, b) {
  const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2, score: Math.min(a.score, b.score) };
  if (a.world && b.world) p.world = { x: (a.world.x + b.world.x) / 2, y: (a.world.y + b.world.y) / 2, z: (a.world.z + b.world.z) / 2 };
  return p;
}
function angle(a, b, c) {
  const world = a.world && b.world && c.world; if (world) { a = a.world; b = b.world; c = c.world; }
  const ux = a.x - b.x, uy = a.y - b.y, uz = world ? a.z - b.z : 0;
  const vx = c.x - b.x, vy = c.y - b.y, vz = world ? c.z - b.z : 0;
  const d = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz);
  return d > 1e-8 ? Math.acos(clamp((ux * vx + uy * vy + uz * vz) / d, -1, 1)) * DEG : NaN;
}
const fromVertical = (lower, upper) => {
  const world = lower.world && upper.world; if (world) { lower = lower.world; upper = upper.world; }
  return Math.atan2(Math.hypot(upper.x - lower.x, world ? upper.z - lower.z : 0), Math.max(1e-6, lower.y - upper.y)) * DEG;
};
// Resolve camera yaw in a body coordinate frame. Angles still use the complete
// 3D vectors, not this projection. Y assumes a level phone; no floor is inferred.
const validWorld = p => p && p.score > .55 && finite3(p.world) && p.world.score > .55;
function worldKeypoints(kp) {
  const out = kp.map(p => validWorld(p) ? { x:p.world.x*1000, y:p.world.y*1000, z:p.world.z*1000,
    score:Math.min(p.score,p.world.score), world:{x:p.world.x*1000,y:p.world.y*1000,z:p.world.z*1000} }
    : {x:0,y:0,z:0,score:0});
  for (const [i,j] of [[11,23],[12,24],[11,13],[12,14],[13,15],[14,16],[23,25],[24,26],[25,27],[26,28]]) {
    if (!validWorld(kp[i]) || !validWorld(kp[j])) continue;
    const a=kp[i].world,b=kp[j].world,d=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
    if (d < .015 || d > 1.2) {out[i].score=0;out[j].score=0;}
  }
  return out;
}
function projectWorld(kp, plane, independent = false) {
  const out = worldKeypoints(kp), ok = i => out[i] && out[i].score > .55;
  const pair = [23, 24].every(ok) ? [23, 24] : [11, 12].every(ok) ? [11, 12] : null;
  // A 3D joint angle needs its three landmarks, not both shoulders / both hips.
  // Machines often hide the far side of the body; those angles remain usable.
  if (!pair) return independent ? out : null;
  const a = kp[pair[0]].world, b = kp[pair[1]].world;
  const len = Math.hypot(b.x - a.x, b.z - a.z), width = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  if (width < .06 || width > .85) return independent ? out : null;
  let lateral;
  if (len >= .06) lateral = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  else {
    // In a side plank the hips can be stacked vertically. The horizontal
    // trunk direction defines the sagittal plane in that specific position.
    const s = ['l','r'].map(s => SIDE[s]).find(S => ok(S.sh) && ok(S.hip));
    if (!s) return independent ? out : null;
    const sh = kp[s.sh].world, h = kp[s.hip].world, trunk = Math.hypot(sh.x - h.x, sh.z - h.z);
    if (trunk < .15 || plane === 'front') return independent ? out : null;
    lateral = { x: (sh.z - h.z) / trunk, z: -(sh.x - h.x) / trunk };
  }
  const axis = plane === 'front' ? lateral : { x: -lateral.z, z: lateral.x };
  const origin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  // World landmarks are hip-centred. Anchoring Y to the feet recovers squat
  // descent; using hip-centred Y alone would make the pelvis almost stationary.
  const feet = [27, 28].filter(ok);
  const groundY = feet.length ? feet.reduce((s, i) => s + kp[i].world.y, 0) / feet.length : origin.y;
  return out.map((point,i) => {
    if (!ok(i)) return point;
    const p=kp[i];
    const w = p.world, dx = w.x - origin.x, dz = w.z - origin.z;
    return { x: (dx * axis.x + dz * axis.z) * 1000, y: (w.y - groundY) * 1000, z: w.z * 1000,
      lateral: (dx * lateral.x + dz * lateral.z) * 1000, score: Math.min(p.score, w.score),
      world: { x: w.x * 1000, y: w.y * 1000, z: w.z * 1000 } };
  });
}
const LEVEL_TOL = { novice: 1.25, normal: 1.0, pro: 0.8 };
const SQUAT_DEPTH = { half: -0.45, parallel: -0.06, deep: 0.12 };
const PUSH_DEPTH = { half: 118, parallel: 98, deep: 86 };
const J = { shoulder: 'sh', elbow: 'el', wrist: 'wr', hip: 'hip', knee: 'kn', ankle: 'an', heel: 'heel', toe: 'toe', ear: 'ear' };
const ANGLES = { knee: ['hip', 'kn', 'an'], hip: ['sh', 'hip', 'kn'], elbow: ['sh', 'el', 'wr'], shoulder: ['hip', 'sh', 'el'], ankle: ['kn', 'an', 'toe'] };
let D = { faults: {}, specs: {}, squat: {}, pushup: {}, titles: {}, pen: {}, cam: {}, ex: {} };
const sc = p => (p && p.score) || 0;

class BaseAnalyzer {
  constructor(depth = 'parallel', level = 'normal') { this.depth = depth; this.level = level; this.reset(); }
  get tol() { return LEVEL_TOL[this.level] || 1.0; }
  reset() {
    this.reps = []; this.phase = 'setup'; this.status = 'calib'; this.view = null; this.viewRatio = null;
    this.side = 'l'; this.sideScore = { l: 0.5, r: 0.5 }; this.zDiff = 0; this.cal = null; this.standSince = null;
    this.rep = null; this.lock = null; this.hold = {}; this.live = new Set(); this.pulses = {}; this.events = [];
    this.prevT = null; this.velS = null; this.lostSince = null; this.lastRepEnd = null; this.setEnded = false;
    this.now = 0; this.kp = null; this.m = null; this.analysisMode = null; this.worldExpected = false; this.lastTrackedT = null;
  }
  prepare(kp, t, plane = 'side') {
    if (!kp) return null;
    const hasWorld = kp.hasWorld || kp.some(p => p && p.world);
    const mode = hasWorld || this.worldExpected ? '3d' : '2d';
    if (this.analysisMode && this.analysisMode !== mode) this.recalibrate();
    this.analysisMode = mode;
    if (mode === '2d') return kp;
    this.worldExpected = true;
    if (this.prevT != null && t - this.prevT > .5) {
      if (this.spec && this.spec.hold && this.holdState === 'on') this.endHold(this.lastTrackedT ?? this.prevT);
      this.recalibrate();
    }
    if (!hasWorld) return null; // Never switch units or fall back in the middle of a rep.
    return projectWorld(kp, plane === 'joints' ? 'side' : plane, plane === 'joints');
  }
  recalibrate() {
    const keep = { reps: this.reps, events: this.events, lastRepEnd: this.lastRepEnd, setEnded: this.setEnded,
      analysisMode: this.analysisMode, worldExpected: this.worldExpected };
    this.reset(); Object.assign(this, keep);
  }
  emit(e) { this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }
  tick(t) { const dt = this.prevT == null ? 1 / 30 : clamp(t - this.prevT, 1 / 240, 0.5); this.prevT = t; this.now = t; return dt; }
  updateView(kp) {
    if (this.analysisMode === '3d') { this.view = this.spec && this.spec.view === 'front' ? 'front' : 'side'; return false; }
    const ls = kp[11], rs = kp[12], lh = kp[23], rh = kp[24];
    const torso = dist(mid(ls, rs), mid(lh, rh)) || 1;
    const span = Math.max(Math.abs(ls.x - rs.x), Math.abs(lh.x - rh.x) * 1.3);
    const r = span / torso;
    this.viewRatio = this.viewRatio == null ? r : lerp(this.viewRatio, r, 0.15);
    const before = this.view;
    if (this.view == null) this.view = this.viewRatio > 0.43 ? 'front' : 'side';
    else if (this.view === 'side' && this.viewRatio > 0.5) this.view = 'front';
    else if (this.view === 'front' && this.viewRatio < 0.36) this.view = 'side';
    return before != null && before !== this.view;
  }
  updateSide(kp, keys) {
    if (this.analysisMode === '3d') {
      const complete = s => keys.every(k => sc(kp[SIDE[s][k]]) > .55);
      if (complete('l') !== complete('r')) { this.side = complete('l') ? 'l' : 'r'; return; }
    }
    const mean = (s, f) => keys.reduce((a, k) => a + f(kp[SIDE[s][k]]), 0) / keys.length;
    for (const s of ['l', 'r']) this.sideScore[s] = lerp(this.sideScore[s], mean(s, p => p.score || 0), 0.2);
    this.zDiff = lerp(this.zDiff, mean('l', p => p.z || 0) - mean('r', p => p.z || 0), 0.2);
    const gap = this.sideScore.l - this.sideScore.r;
    if (Math.abs(gap) > 0.06) this.side = gap > 0 ? 'l' : 'r';
    else if (Math.abs(this.zDiff) > 4) this.side = this.zDiff < 0 ? 'l' : 'r';   // smaller z = closer to the camera
  }
  flag(id, on) {
    if (on) {
      this.hold[id] = (this.hold[id] || 0) + 1;
      if (this.hold[id] >= 3) {
        if (!this.live.has(id)) { this.live.add(id); this.emit({ type: 'cue', id }); }
        if (this.rep) this.rep.faults[id] = true;
      }
    } else { this.hold[id] = 0; this.live.delete(id); }
  }
  pulse(id) { this.pulses[id] = this.now + 1.3; this.emit({ type: 'cue', id }); }
  clearLive() { this.live.clear(); this.hold = {}; }
  meta(id) { return D.faults[id] || { title: 'Техника', cue: '', pen: 15 }; }
  liveList() {
    const s = new Set(this.live);
    for (const id in this.pulses) if (this.pulses[id] > this.now) s.add(id);
    return [...s].sort((a, b) => this.meta(b).pen - this.meta(a).pen);
  }
  score(rep) {
    rep.faultList = Object.keys(rep.faults).sort((a, b) => this.meta(b).pen - this.meta(a).pen);
    rep.score = Math.max(0, 100 - rep.faultList.reduce((a, id) => a + this.meta(id).pen, 0));
    rep.grade = !rep.faultList.length ? 'good' : rep.faultList.some(id => this.meta(id).pen >= 25) ? 'bad' : 'fair';
    rep.analysisMode = rep.analysisMode || this.analysisMode || '2d';
    rep.partial = rep.analysisMode === '3d';
    if (rep.partial) rep.score = null; // Monocular estimates have no validated overall technique grade.
  }
  finishRep(rep) { this.score(rep); this.reps.push(rep); this.lastRepEnd = rep.t1; this.emit({ type: 'rep', rep }); }
  addLate(rep, id) { if (rep.faults[id]) return; rep.faults[id] = true; this.score(rep); this.emit({ type: 'repUpdate', rep }); this.pulse(id); }
  startRep(t, extra) {
    if (this.lock) this.closeLock();
    if (this.setEnded) { this.reps = []; this.setEnded = false; this.emit({ type: 'newSet' }); }
    this.rep = { n: this.reps.length + 1, t0: t, tBottom: t, t1: 0, down: 0, up: 0, faults: {}, extra, faultList: [], score: 100, grade: 'good' };
    this.phase = 'down';
  }
  endSet() {
    if (this.lock) this.closeLock();
    if (this.reps.length && !this.setEnded) { this.setEnded = true; this.emit({ type: 'setEnd' }); }
  }
  idleCheck(t) { if (this.lastRepEnd != null && !this.setEnded && !this.rep && t - this.lastRepEnd > 7) this.endSet(); }
  lost(t) {
    if (this.analysisMode === '3d') {
      if (this.cal || this.rep || this.lock) this.recalibrate();
      this.tick(t); this.status = 'world_lost'; this.standSince = null; this.clearLive(); this.m = null;
      this.idleCheck(t); return this.snapshot();
    }
    if (this.lostSince == null) this.lostSince = t;
    if (t - this.lostSince > 0.7) {
      this.status = 'nobody';
      if (this.rep) { this.rep = null; this.phase = this.cal ? 'top' : 'setup'; }
      this.clearLive();
    }
    this.idleCheck(t);
    this.m = null;
    return this.snapshot();
  }
  snapshot() {
    return { status: this.status, phase: this.phase, view: this.view, side: this.side, reps: this.reps.length,
      live: this.liveList(), setEnded: this.setEnded, kneeMode: !!(this.m && this.m.kneeMode), held: null,
      analysisMode: this.analysisMode, partial: this.analysisMode === '3d' };
  }
  closeLock() { this.lock = null; }
  joints(id) {
    const S = SIDE[this.side], v = this.view;
    return ({ shallow: v === 'front' ? [23, 24, 25, 26] : [S.hip, S.kn], lean: [S.sh, S.hip], heels: [S.heel, S.an], valgus: [25, 26],
      shift: [23, 24], lockout: v === 'front' ? [25, 26] : [S.kn, S.hip], sag: [S.hip], pike: [S.hip],
      pu_shallow: [S.el], pu_lockout: [S.el], head: [S.ear, 0] })[id] || [];
  }
}

class SquatAnalyzer extends BaseAnalyzer {
  visible(kp) {
    const ok = s => ['sh', 'hip', 'kn', 'an'].every(k => sc(kp[SIDE[s][k]]) > 0.5);
    return ok('l') || ok('r');
  }
  reset() { super.reset(); this.prevHipY = null; }
  update(kp, t) {
    kp = this.prepare(kp, t);
    const dt = this.tick(t);
    if (!kp || !this.visible(kp)) return this.lost(t);
    this.lostSince = null; this.kp = kp;
    if (this.updateView(kp) && this.cal) { this.cal = null; this.phase = 'setup'; this.rep = null; this.lock = null; this.clearLive(); }
    this.updateSide(kp, ['sh', 'hip', 'kn', 'an']);
    const front = this.view === 'front', S = SIDE[this.side];
    if (front && ![23, 24, 25, 26, 27, 28].every(i => sc(kp[i]) > 0.5)) return this.lost(t);
    let hip, kn, an, sh, heel = null, toe = null, thighNow;
    if (front) {
      hip = mid(kp[23], kp[24]); kn = mid(kp[25], kp[26]); an = mid(kp[27], kp[28]); sh = mid(kp[11], kp[12]);
      thighNow = (dist(kp[23], kp[25]) + dist(kp[24], kp[26])) / 2;
    } else {
      hip = kp[S.hip]; kn = kp[S.kn]; an = kp[S.an]; sh = kp[S.sh]; heel = kp[S.heel]; toe = kp[S.toe];
      thighNow = dist(hip, kn);
    }
    const thighVert = (kn.y - hip.y) / Math.max(1, thighNow);
    const kneeAng = front ? null : angle(hip, kn, an);
    const straight = front ? thighVert > 0.93 : kneeAng > 160;
    const ref = this.cal ? this.cal.thigh : thighNow;
    const vel = this.prevHipY == null ? 0 : Math.abs(hip.y - this.prevHipY) / (dt * Math.max(1, ref));
    this.prevHipY = hip.y;
    this.velS = this.velS == null ? vel : lerp(this.velS, vel, 0.3);
    const stable = this.velS < 0.35;
    const footOk = this.analysisMode !== '3d' && !front && heel && toe && sc(heel) > 0.5 && sc(toe) > 0.5;
    const frontal = front || this.analysisMode === '3d' && [23,24,25,26,27,28].every(i => sc(kp[i]) > .55);
    const lateral = p => this.analysisMode === '3d' ? p.lateral : p.x;
    const kneeSpan = frontal ? Math.abs(lateral(kp[25]) - lateral(kp[26])) : 0;
    const ankleSpan = frontal ? Math.max(1, Math.abs(lateral(kp[27]) - lateral(kp[28]))) : 1;
    const hipShift = frontal ? ((lateral(kp[23]) + lateral(kp[24]) - lateral(kp[27]) - lateral(kp[28])) / 2) / ankleSpan : 0;
    if (!this.cal) {
      this.status = 'calib'; this.phase = 'setup';
      if (straight && stable) {
        if (this.standSince == null) this.standSince = t;
        if (t - this.standSince > 0.5) {
          this.cal = { hipY: hip.y, thigh: thighNow, heelY: footOk ? heel.y : null, toeY: footOk ? toe.y : null,
            footLen: footOk ? dist(heel, toe) : null, kneeRatio: frontal ? Math.max(.05, kneeSpan / ankleSpan) : null, shift0: frontal ? hipShift : null };
          this.phase = 'top'; this.standSince = null;
          this.emit({ type: 'status', id: 'ready' });
        }
      } else this.standSince = null;
      this.m = { hip, kn, an, sh, front, d: null };
      return this.snapshot();
    }
    this.status = 'track';
    const c = this.cal, tol = this.tol;
    const p = (hip.y - c.hipY) / c.thigh;
    if (this.phase === 'top' && straight && stable && p < 0.08) {
      c.hipY = lerp(c.hipY, hip.y, 0.08); c.thigh = lerp(c.thigh, thighNow, 0.05);
      if (footOk) {
        const fl = dist(heel, toe);
        c.heelY = c.heelY == null ? heel.y : lerp(c.heelY, heel.y, 0.08);
        c.toeY = c.toeY == null ? toe.y : lerp(c.toeY, toe.y, 0.08);
        c.footLen = c.footLen == null ? fl : lerp(c.footLen, fl, 0.05);
      }
      if (frontal) { c.kneeRatio = c.kneeRatio == null ? Math.max(.05, kneeSpan / ankleSpan) : lerp(c.kneeRatio, Math.max(.05, kneeSpan / ankleSpan), 0.08); c.shift0 = c.shift0 == null ? hipShift : lerp(c.shift0, hipShift, 0.08); }
    }
    const d = (hip.y - kn.y) / c.thigh;
    const lean = front ? null : fromVertical(hip, sh);
    const shin = front ? null : fromVertical(an, kn);
    const diff = front ? null : lean - shin;
    const heelLift = footOk && c.heelY != null && c.footLen ? (c.heelY - heel.y) / c.footLen : null;
    const toeMove = footOk && c.toeY != null && c.footLen ? Math.abs(toe.y - c.toeY) / c.footLen : null;
    const kneeR = frontal && c.kneeRatio != null ? (kneeSpan / ankleSpan) / c.kneeRatio : null;
    const shift = frontal && c.shift0 != null ? hipShift - c.shift0 : null;
    this.m = { hip, kn, an, sh, front, d, p, lean, shin, diff, heelLift, kneeR, shift, kneeAng };
    if (this.lock) {
      this.lock.minP = Math.min(this.lock.minP, p);
      if (kneeAng != null) this.lock.best = Math.max(this.lock.best, kneeAng);
      if (t > this.lock.until) this.closeLock();
    }
    if (this.phase === 'top') {
      if (p > 0.14) this.startRep(t, { maxP: p, bottom: { d, lean, shin, diff }, maxLift: 0, minKneeR: 9, maxShift: 0, maxDiff: -99 });
    } else if (this.phase === 'down') {
      const R = this.rep.extra;
      if (p >= R.maxP) { R.maxP = p; this.rep.tBottom = t; R.bottom = { d, lean, shin, diff }; }
      if (p < R.maxP - 0.07) {
        if (R.maxP < 0.28) { this.rep = null; this.phase = 'top'; this.clearLive(); }
        else { this.phase = 'up'; this.atBottom(); }
      }
    } else if (this.phase === 'up') {
      if (p < 0.1) this.complete(t, p, kneeAng);
    }
    if (this.rep && p > 0.3) {
      const R = this.rep.extra;
      if (!front) {
        R.maxDiff = Math.max(R.maxDiff, diff);
        this.flag('lean', diff > 22 * tol || lean > 60 * tol);
        if (heelLift != null) { R.maxLift = Math.max(R.maxLift, heelLift); this.flag('heels', heelLift > 0.13 * tol && (toeMove == null || toeMove < 0.15)); }
      }
      if (kneeR != null && shift != null) {
        R.minKneeR = Math.min(R.minKneeR, kneeR); R.maxShift = Math.max(R.maxShift, Math.abs(shift));
        this.flag('valgus', p > 0.35 && kneeR < 1 - 0.17 * tol);
        this.flag('shift', Math.abs(shift) > 0.16 * tol);
      }
    } else for (const id of ['lean', 'heels', 'valgus', 'shift']) this.flag(id, false);
    this.idleCheck(t);
    return this.snapshot();
  }
  atBottom() { if (this.rep.extra.bottom.d < (SQUAT_DEPTH[this.depth] ?? -0.06)) { this.rep.faults.shallow = true; this.pulse('shallow'); } }
  complete(t, p, kneeAng) {
    const R = this.rep;
    R.t1 = t; R.down = R.tBottom - R.t0; R.up = t - R.tBottom;
    if (R.down < 0.6) { R.faults.fast = true; this.pulse('fast'); }
    this.rep = null; this.phase = 'top'; this.clearLive();
    this.finishRep(R);
    this.lock = { rep: R, until: t + 0.8, minP: p, best: kneeAng != null ? kneeAng : 0 };
  }
  closeLock() {
    const L = this.lock; this.lock = null; if (!L) return;
    const locked = L.minP < 0.07 * this.tol || (this.view === 'side' && L.best >= 160);
    if (!locked) this.addLate(L.rep, 'lockout');
  }
}

class PushupAnalyzer extends BaseAnalyzer {
  visible(kp) {
    const ok = s => { const S = SIDE[s]; return ['sh', 'el', 'wr', 'hip'].every(k => sc(kp[S[k]]) > 0.5) && (sc(kp[S.an]) > 0.5 || sc(kp[S.kn]) > 0.5); };
    return ok('l') || ok('r');
  }
  reset() { super.reset(); this.prevE = null; }
  update(kp, t) {
    kp = this.prepare(kp, t);
    const dt = this.tick(t);
    if (!kp || !this.visible(kp)) return this.lost(t);
    this.lostSince = null; this.kp = kp;
    this.updateView(kp);
    this.updateSide(kp, ['sh', 'el', 'wr', 'hip']);
    if (this.view === 'front') {
      this.status = 'turn'; if (this.rep) this.rep = null; this.phase = this.cal ? 'top' : 'setup'; this.clearLive(); this.m = null; this.idleCheck(t);
      return this.snapshot();
    }
    const S = SIDE[this.side];
    const sh = kp[S.sh], el = kp[S.el], wr = kp[S.wr], hip = kp[S.hip], kn = kp[S.kn], an = kp[S.an], ear = kp[S.ear];
    const anOk = sc(an) > 0.5, knOk = sc(kn) > 0.5;
    const kneeMode = knOk && (!anOk || angle(hip, kn, an) < 145);
    const base = kneeMode ? kn : an;
    const plank = Math.atan2(Math.abs(sh.y - hip.y), Math.abs(sh.x - hip.x) + 1e-6) * DEG < (this.incline ? 58 : 40);
    const e = angle(sh, el, wr);
    const dx = (sh.x - base.x) || 1e-6;
    const lineAt = x => base.y + (sh.y - base.y) * ((x - base.x) / dx);
    const dev = Math.atan2(hip.y - lineAt(hip.x), dist(base, hip)) * DEG;   // + sag, − pike
    const headDrop = sc(ear) > 0.5 ? (ear.y - lineAt(ear.x)) / Math.max(1, dist(sh, ear)) : null;
    const vel = this.prevE == null ? 0 : Math.abs(e - this.prevE) / dt;
    this.prevE = e;
    this.velS = this.velS == null ? vel : lerp(this.velS, vel, 0.3);
    const stable = this.velS < 45;
    this.m = { sh, el, wr, hip, base, ear, e, dev, headDrop, kneeMode };
    if (!plank) {
      this.status = 'plank'; if (this.rep) this.rep = null; this.phase = this.cal ? 'top' : 'setup'; this.clearLive(); this.idleCheck(t);
      return this.snapshot();
    }
    if (!this.cal) {
      this.status = 'calib'; this.phase = 'setup';
      if (e > 150 && stable) {
        if (this.standSince == null) this.standSince = t;
        if (t - this.standSince > 0.4) { this.cal = { ok: true }; this.phase = 'top'; this.standSince = null; this.emit({ type: 'status', id: 'ready' }); }
      } else this.standSince = null;
      return this.snapshot();
    }
    this.status = 'track';
    const tol = this.tol;
    if (this.lock) { this.lock.best = Math.max(this.lock.best, e); if (t > this.lock.until) this.closeLock(); }
    if (this.phase === 'top') {
      if (e < 140) this.startRep(t, { minE: e, maxDev: dev, minDev: dev, maxHead: headDrop != null ? headDrop : -9 });
    } else if (this.phase === 'down') {
      const R = this.rep.extra;
      if (e <= R.minE) { R.minE = e; this.rep.tBottom = t; }
      if (e > R.minE + 12) {
        if (R.minE > 135) { this.rep = null; this.phase = 'top'; this.clearLive(); }
        else { this.phase = 'up'; if (R.minE > (PUSH_DEPTH[this.depth] ?? 98)) { this.rep.faults.pu_shallow = true; this.pulse('pu_shallow'); } }
      }
    } else if (this.phase === 'up') {
      if (e > 150) {
        const R = this.rep; R.t1 = t; R.down = R.tBottom - R.t0; R.up = t - R.tBottom;
        if (R.down < 0.45) { R.faults.pu_fast = true; this.pulse('pu_fast'); }
        this.rep = null; this.phase = 'top'; this.clearLive(); this.finishRep(R);
        this.lock = { rep: R, until: t + 0.7, best: e };
      }
    }
    if (this.rep) {
      const R = this.rep.extra;
      R.maxDev = Math.max(R.maxDev, dev); R.minDev = Math.min(R.minDev, dev);
      if (headDrop != null) R.maxHead = Math.max(R.maxHead, headDrop);
    }
    this.flag('sag', dev > 8 * tol);
    this.flag('pike', dev < -12 * tol);
    this.flag('head', headDrop != null && headDrop > 0.55 * tol);
    this.idleCheck(t);
    return this.snapshot();
  }
  closeLock() { const L = this.lock; this.lock = null; if (!L) return; if (L.best < 155 - (this.tol - 1) * 20) this.addLate(L.rep, 'pu_lockout'); }
}

class GenericAnalyzer extends BaseAnalyzer {
  constructor(key, level = 'normal', depth = 'parallel') { super(depth, level); this.key = key; this.spec = D.specs[key]; this.reset(); }
  reset() { super.reset(); this.prevS = null; this.held = 0; this.holdState = null; }
  meta(fid) {
    const spec = this.spec || {}, base = fid.split(':')[0];
    if (fid === 'short') return { title: D.titles.short, cue: 'Полная амплитуда, как в первых повторах', pen: D.pen.short };
    if (spec.hold) return { title: fid === 'sag' ? 'Таз провисает' : 'Таз задран', cue: fid === 'sag' ? spec.cue_sag : spec.cue_pike, pen: 30 };
    for (const c of spec.checks || []) {
      let cid = c[0] !== 'romrel' ? c[0] : 'rom';
      if (c[0] === 'still' || c[0] === 'range') cid = c[0] + ':' + c[1][0];
      if (cid === fid) return { title: D.titles[base] || 'Техника', cue: c[c.length - 1], pen: D.pen[base] ?? 15 };
    }
    return { title: D.titles[base] || 'Техника', cue: '', pen: D.pen[base] ?? 15 };
  }
  sideOk(kp, s, joints) { return joints.every(j => sc(kp[SIDE[s][j]]) > 0.5); }
  ang(kp, joint, s) { const [a, b, c] = ANGLES[joint], S = SIDE[s]; return angle(kp[S[a]], kp[S[b]], kp[S[c]]); }
  signal(kp, sig) {
    const kind = sig[0];
    if (kind === 'angle') {
      const joints = ANGLES[sig[1]];
      if (!this.sideOk(kp, this.side, joints)) {
        const other = this.side === 'l' ? 'r' : 'l';
        if (!this.sideOk(kp, other, joints)) return null;
        return this.ang(kp, sig[1], other);
      }
      return this.ang(kp, sig[1], this.side);
    }
    if (kind === 'angle2' || kind === 'anglemax') {
      const vals = ['l', 'r'].filter(s => this.sideOk(kp, s, ANGLES[sig[1]])).map(s => this.ang(kp, sig[1], s));
      if (!vals.length) return null;
      return kind === 'angle2' ? vals.reduce((a, b) => a + b, 0) / vals.length : Math.max(...vals);
    }
    if (kind === 'abd') {
      const vals = ['l', 'r'].filter(s => this.sideOk(kp, s, ['hip', 'sh', 'el'])).map(s => this.ang(kp, 'shoulder', s));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    if (kind === 'height') {
      const p = kp[SIDE[this.side][J[sig[1]]]];
      if (sc(p) <= 0.5 || !this.cal) return !this.cal ? 0.0 : null;
      return (this.cal.y0 - p.y) / this.cal.L;
    }
    if (kind === 'incline') {
      const S = SIDE[this.side], sh = kp[S.sh], hip = kp[S.hip];
      if (sc(sh) <= 0.5 || sc(hip) <= 0.5) return null;
      const horizontal = sh.world && hip.world ? Math.hypot(sh.world.x - hip.world.x, sh.world.z - hip.world.z) : Math.abs(sh.x - hip.x);
      return Math.atan2(hip.y - sh.y, horizontal + 1e-6) * DEG;
    }
    if (kind === 'gap') {
      const j = J[sig[1]], a = kp[SIDE.l[j]], b = kp[SIDE.r[j]], s1 = kp[11], s2 = kp[12];
      if (sc(a) <= 0.5 || sc(b) <= 0.5 || sc(s1) <= 0.5 || sc(s2) <= 0.5) return null;
      return this.analysisMode === '3d' ? dist(a, b) / Math.max(1, dist(s1, s2)) : Math.abs(a.x - b.x) / Math.max(1.0, Math.abs(s1.x - s2.x));
    }
    throw new Error(kind);
  }
  trunkLen(kp) { const S = SIDE[this.side]; return this.sideOk(kp,this.side,['sh','hip']) ? Math.max(1.0, dist(kp[S.sh], kp[S.hip])) : null; }
  visible(kp) { return requiredChains(this.key).some(chain => chain.every(i => sc(kp[i]) > .5)); }
  update(kp, t) {
    const kind = this.spec.sig && this.spec.sig[0];
    kp = this.prepare(kp, t, kind && (kind.startsWith('angle') || kind === 'abd') ? 'joints' : this.spec.view);
    const dt = this.tick(t);
    if (!kp || !this.visible(kp)) return this.lost(t);
    this.lostSince = null; this.kp = kp;
    this.updateView(kp);
    const primary = kind && kind.startsWith('angle') ? ANGLES[this.spec.sig[1]] : kind === 'abd' ? ['hip','sh','el'] : [];
    this.updateSide(kp, primary.length ? primary : ['sh', 'hip', 'el', 'kn']);
    const want = this.spec.view;
    if ((want === 'side' || want === 'front') && this.view && this.view !== want) {
      this.status = want === 'front' ? 'turn_front' : 'turn';
      this.rep = null; this.phase = this.cal ? 'top' : 'setup'; this.clearLive(); this.m = null; this.idleCheck(t);
      return this.snapshot();
    }
    if (this.spec.hold) return this.updateHold(kp, t, dt);
    const sig = this.signal(kp, this.spec.sig);
    if (sig == null) return this.lost(t);
    const vel = this.prevS == null ? 0.0 : Math.abs(sig - this.prevS) / dt;
    this.prevS = sig;
    this.velS = this.velS == null ? vel : lerp(this.velS, vel, 0.3);
    const amp = this.spec.amp, d = this.spec.dir;
    const stable = this.velS < amp * 0.35;
    if (!this.cal) {
      this.status = 'calib'; this.phase = 'setup';
      if (stable) {
        if (this.standSince == null) this.standSince = t;
        if (t - this.standSince > 0.5) {
          const S = SIDE[this.side], h = this.spec.sig[0] === 'height';
          this.cal = { s0: sig, y0: h ? kp[S[J[this.spec.sig[1]]]].y : kp[S.hip].y, L: this.trunkLen(kp) };
          if (h) this.prevS = 0.0;
          this.phase = 'top'; this.standSince = null;
          this.emit({ type: 'status', id: 'ready' });
        }
      } else this.standSince = null;
      this.m = { sig };
      return this.snapshot();
    }
    this.status = 'track';
    const x = (sig - this.cal.s0) * d;
    this.m = { sig, x };
    if (this.phase === 'top') {
      if (stable && Math.abs(x) < 0.12 * amp) this.cal.s0 = lerp(this.cal.s0, sig, 0.05);
      if (x > 0.25 * amp) {
        this.startRep(t, { ext: x, ext_sig: sig, t_ext: t, sec0: {}, sec_dev: {}, near_ext: 0.0, sym: 0.0, t_leave: t });
        this.secStart(kp);
      }
    } else if (this.phase === 'down') {
      const R = this.rep.extra;
      if (x >= R.ext) { R.ext = x; R.ext_sig = sig; R.t_ext = t; this.rep.tBottom = t; }
      this.secTrack(kp);
      if (x >= R.ext - 0.12 * amp) { R.near_ext += dt; R.t_leave = t; }
      if (R.ext - x > 0.2 * amp) {
        if (R.ext < 0.45 * amp) { this.rep = null; this.phase = 'top'; this.clearLive(); }
        else { this.phase = 'up'; this.atExtreme(kp); }
      }
    } else if (this.phase === 'up') {
      this.secTrack(kp);
      if (x < 0.15 * amp) this.complete(t);
    }
    this.idleCheck(t);
    return this.snapshot();
  }
  secKey(sig) { return sig[0] + (sig.length > 1 ? sig[1] : ''); }
  secStart(kp) {
    const R = this.rep.extra;
    for (const c of this.spec.checks) if (c[0] === 'still' || c[0] === 'range') {
      const v = this.signal(kp, c[1]);
      if (v != null) R.sec0[this.secKey(c[1])] = v;
    }
  }
  secTrack(kp) {
    const R = this.rep.extra, tolK = this.tol;
    for (const c of this.spec.checks) if (c[0] === 'still') {
      const key = this.secKey(c[1]), v = this.signal(kp, c[1]);
      if (v == null || !(key in R.sec0)) continue;
      const dev = Math.abs(v - R.sec0[key]);
      R.sec_dev[key] = Math.max(R.sec_dev[key] || 0.0, dev);
      this.flag('still:' + c[1][0], dev > c[2] * tolK);
    }
  }
  atExtreme(kp) {
    const R = this.rep.extra, val = R.ext_sig, tolK = this.tol;
    for (const c of this.spec.checks) {
      let fid = null;
      if (c[0] === 'rom') {
        const margin = 8 * (tolK - 1) * (c[1] === '<=' ? 1 : -1);
        const bad = c[1] === '<=' ? val > c[2] + margin : val < c[2] + margin;
        fid = bad ? 'rom' : null;
      } else if (c[0] === 'romrel') fid = R.ext < c[1] * this.spec.amp / tolK ? 'rom' : null;
      else if (c[0] === 'max') fid = val > c[1] ? 'max' : null;
      else if (c[0] === 'sym') {
        const L = this.trunkLen(kp);
        const dy = L && sc(kp[15]) > 0.5 && sc(kp[16]) > 0.5 ? Math.abs(kp[15].y - kp[16].y) / L : 0.0;
        fid = dy > c[1] * tolK ? 'sym' : null;
      }
      if (fid) { this.rep.faults[fid] = true; this.pulse(fid); }
    }
    const best = this.reps.reduce((a, r) => Math.max(a, (r.extra && r.extra.ext) || 0.0), 0.0);
    if (best > 0 && R.ext < 0.7 * best / tolK && !this.rep.faults.rom) { this.rep.faults.short = true; this.pulse('short'); }
  }
  complete(t) {
    const R = this.rep;
    R.t1 = t;
    const first = R.tBottom - R.t0, second = t - (R.extra.t_leave != null ? R.extra.t_leave : R.tBottom);
    if (this.spec.ecc === 'first') { R.down = first; R.up = second; } else { R.down = second; R.up = first; }
    for (const c of this.spec.checks) {
      if (c[0] === 'tempo' && R.down < c[1] / Math.max(1.0, this.tol)) { R.faults.tempo = true; this.pulse('tempo'); }
      if (c[0] === 'hold' && R.extra.near_ext < c[1]) { R.faults.hold = true; this.pulse('hold'); }
    }
    this.rep = null; this.phase = 'top'; this.clearLive();
    this.finishRep(R);
  }
  updateHold(kp, t, dt) {
    const S = SIDE[this.side], sh = kp[S.sh], hip = kp[S.hip];
    const foot = sc(kp[S.an]) > 0.5 ? kp[S.an] : kp[S.kn];
    if (sc(foot) <= 0.5) return this.lost(t);
    this.lastTrackedT = t;
    const horiz = Math.atan2(Math.abs(sh.y - foot.y), Math.abs(sh.x - foot.x) + 1e-6) * DEG < 40;
    const line = angle(sh, hip, foot);
    const dx = (sh.x - foot.x) || 1e-6;
    const lineY = foot.y + (sh.y - foot.y) * ((hip.x - foot.x) / dx);
    const sag = hip.y > lineY;
    this.m = { line, sag };
    const okLine = line >= this.spec.line_ok - 6 * (this.tol - 1);
    if (!horiz) {
      this.status = 'plank';
      if (this.holdState === 'on') this.endHold(t);
      this.idleCheck(t);
      return this.snapshot();
    }
    this.status = 'track';
    const fid = sag ? 'sag' : 'pike';
    if (this.holdState !== 'on') {
      this.flag('sag', false); this.flag('pike', false);
      if (okLine) {
        this.holdState = 'on';
        this.cal = this.cal || { s0: 0.0 };
        this.startRep(t, { bad_t: 0.0, bad_run: 0.0, last_fid: fid });
        this.phase = 'hold';
      }
      this.idleCheck(t);
      return this.snapshot();
    }
    this.flag(fid, !okLine);
    delete this.rep.faults[fid];             // live cue only; the verdict is made when the hold ends
    const R = this.rep.extra;
    if (!okLine) {
      R.bad_run += dt; R.last_fid = fid;
      if (R.bad_run > 1.2) { this.endHold(t); return this.snapshot(); }   // left the position: the hold is over
    } else { R.bad_t += R.bad_run; R.bad_run = 0.0; }
    this.held = t - this.rep.t0 - R.bad_run;
    return this.snapshot();
  }
  endHold(t) {
    const R = this.rep;
    if (R == null) { this.holdState = null; return; }
    R.t1 = t - (R.extra.bad_run || 0.0);
    R.down = R.up = 0.0;
    R.extra.secs = R.t1 - R.t0;
    if (R.extra.bad_t > Math.max(1.5, 0.25 * R.extra.secs)) R.faults[R.extra.last_fid || 'sag'] = true;
    this.holdState = null; this.rep = null; this.phase = 'top'; this.clearLive();
    if (R.extra.secs >= 3) this.finishRep(R);
  }
  endSet() { if (this.spec.hold && this.holdState === 'on') this.endHold(this.now); super.endSet(); }
  lost(t) {
    if (this.analysisMode === '3d' && this.spec.hold && this.holdState === 'on') this.endHold(this.lastTrackedT ?? t);
    if (this.spec.hold && this.holdState === 'on' && this.lostSince != null && t - this.lostSince > 0.7) this.endHold(t);
    return super.lost(t);
  }
  snapshot() { const s = super.snapshot(); s.held = this.spec && this.spec.hold ? Math.round(this.held * 10) / 10 : null; return s; }
  sigJoints(sig) {
    const S = SIDE[this.side], kind = sig[0];
    if (kind === 'angle' || kind === 'angle2' || kind === 'anglemax') {
      const j = ANGLES[sig[1]][1];
      return kind === 'angle' ? [S[j]] : [SIDE.l[j], SIDE.r[j]];
    }
    if (kind === 'abd') return [13, 14];
    if (kind === 'height') return [S[J[sig[1]]]];
    if (kind === 'incline') return [S.sh, S.hip];
    if (kind === 'gap') { const j = J[sig[1]]; return [SIDE.l[j], SIDE.r[j]]; }
    return [];
  }
  joints(fid) {
    if (this.spec.hold) return [SIDE[this.side].hip];
    const [base, sub] = fid.split(':');
    if (base === 'sym') return [15, 16];
    if (base === 'still' || base === 'range') {
      for (const c of this.spec.checks) if (c[0] === base && c[1][0] === sub) return this.sigJoints(c[1]);
      return [];
    }
    return this.sigJoints(this.spec.sig);
  }
}

const LUNGE_KEYS = new Set(['lunge_db', 'reverse_lunge', 'walking_lunge', 'split_squat_db', 'bulgarian']);
const isLunge = key => LUNGE_KEYS.has(key);
/* A lunge is one complete descent and return, not two independently moving knees.
   Keep a leg's own baseline and lock it throughout the cycle. The pelvis must also
   descend: lifting a foot, walking into frame and landmark swaps are not lunges. */
class LungeAnalyzer extends GenericAnalyzer {
  constructor(key, level = 'normal', depth = 'parallel', imageOnly = false) { super(key, level, depth); this.imageOnly = imageOnly; }
  reset() {
    super.reset(); this.baselines = {}; this.smoothed = {}; this.lastSeen = {};
    this.returnSince = null;
  }
  update(kp, t) {
    if (this.prevT != null && (t <= this.prevT || t - this.prevT > .5)) this.recalibrate();
    if (this.imageOnly && kp) kp = kp.map(p => ({x:p.x,y:p.y,z:p.z,score:p.score}));
    kp = this.prepare(kp, t, 'joints');
    const dt = this.tick(t);
    if (!kp) return this.lost(t);
    const signals = {};
    for (const side of ['l', 'r']) {
      if (!this.sideOk(kp, side, ANGLES.knee)) { delete this.smoothed[side]; continue; }
      const S = SIDE[side], hip = kp[S.hip], knee = kp[S.kn], ankle = kp[S.an];
      const length = dist(hip, knee) + dist(knee, ankle);
      const raw = {angle: angle(hip, knee, ankle), height: (ankle.y - hip.y) / Math.max(1, length)};
      if (!Number.isFinite(raw.angle) || !Number.isFinite(raw.height)) continue;
      const old = this.smoothed[side], continuous = old && t - this.lastSeen[side] <= .3;
      const k = 1 - Math.exp(-dt / .065);
      const signal = continuous ? {angle: lerp(old.angle, raw.angle, k), height: lerp(old.height, raw.height, k)} : raw;
      signal.stable = !continuous || Math.abs(signal.angle - old.angle) / dt < 25 && Math.abs(signal.height - old.height) / dt < .15;
      signal.confidence = Math.min(...ANGLES.knee.map(j => sc(kp[S[j]])));
      this.smoothed[side] = signal; this.lastSeen[side] = t; signals[side] = signal;
    }
    const sides = Object.keys(signals);
    if (!sides.length || this.rep && !signals[this.rep.extra.side]) return this.lost(t);
    this.kp = kp; this.lostSince = null;
    this.updateView(kp);
    if (this.analysisMode === '2d' && this.view !== 'side') {
      this.status = 'turn'; this.rep = null; this.cal = null; this.phase = 'setup'; this.standSince = null;
      return this.snapshot();
    }
    const standing = sides.filter(s => signals[s].angle >= 150 && signals[s].height > .65 && signals[s].stable);
    if (!this.cal) {
      this.status = 'calib'; this.phase = 'setup';
      if (!standing.length) this.standSince = null;
      else {
        if (this.standSince == null) this.standSince = t;
        if (t - this.standSince >= .5) {
          for (const s of standing) this.baselines[s] = {angle: signals[s].angle, height: signals[s].height};
          this.side = standing.sort((a, b) => signals[b].confidence - signals[a].confidence)[0];
          this.cal = {s0: this.baselines[this.side].angle}; this.phase = 'top'; this.status = 'track';
          this.emit({type:'status', id:'ready'});
        }
      }
      return this.snapshot();
    }
    this.status = 'track';
    const stance = ['l','r'].every(s => signals[s]) ? Math.abs(kp[27].x - kp[28].x) /
      Math.max(1, ...['l','r'].map(s => {const S=SIDE[s];return dist(kp[S.hip],kp[S.kn])+dist(kp[S.kn],kp[S.an]);})) : null;
    if (!this.rep) {
      for (const side of standing) {
        const s = signals[side], b = this.baselines[side];
        if (!b) this.baselines[side] = {angle:s.angle, height:s.height};
        else if (Math.abs(b.angle - s.angle) < 8 && Math.abs(b.height - s.height) < .035) {
          b.angle = lerp(b.angle, s.angle, .025); b.height = lerp(b.height, s.height, .025);
        }
      }
      const candidates = sides.filter(s => this.baselines[s] && this.baselines[s].angle - signals[s].angle >= 16 && this.baselines[s].height - signals[s].height >= .06);
      if (candidates.length) {
        const side = candidates.sort((a,b) => signals[b].confidence - signals[a].confidence)[0];
        const s = signals[side], b = this.baselines[side]; this.side = side;
        this.startRep(t, {side, baseline:{...b}, ext:b.angle-s.angle, ext_sig:s.angle, t_ext:t,
          drop:b.height-s.height, stance, sec0:{}, sec_dev:{}, near_ext:0, t_leave:t});
        this.returnSince = null; this.secStart(kp);
      }
    } else {
      const R = this.rep.extra, s = signals[R.side], bend = R.baseline.angle - s.angle;
      this.side = R.side;
      if (bend >= R.ext) { R.ext = bend; R.ext_sig = s.angle; R.t_ext = t; this.rep.tBottom = t; }
      R.drop = Math.max(R.drop, R.baseline.height - s.height);
      if (stance != null) R.stance = Math.max(R.stance || 0, stance);
      if (bend >= R.ext - 6) { R.near_ext += dt; R.t_leave = t; }
      this.secTrack(kp);
      if (this.phase === 'down' && R.ext - bend >= 8) {
        if (R.ext < 32 || R.drop < .12 || R.stance != null && R.stance < .18) { this.rep = null; this.phase = 'top'; this.clearLive(); }
        else { this.phase = 'up'; this.atExtreme(kp); }
      }
      if (this.rep && this.phase === 'up') {
        const returned = bend < 12 && s.height >= R.baseline.height - .055;
        this.returnSince = returned ? this.returnSince ?? t : null;
        if (this.returnSince != null && t - this.returnSince >= .08) {
          if (R.t_ext - this.rep.t0 >= .16 && t - R.t_ext >= .18 && t - this.rep.t0 >= .65) this.complete(t);
          else { this.rep = null; this.phase = 'top'; this.clearLive(); }
          this.returnSince = null;
        }
      }
    }
    this.idleCheck(t); return this.snapshot();
  }
  lost(t) {
    // A hidden or swapped leg cannot supply the missing half of a cycle.
    if (this.cal || this.rep) this.recalibrate();
    return super.lost(t);
  }
}

/* Seated extensions often start below the working range. Track successive extrema
   on the same leg instead of requiring a still frame or a return to the first angle. */
class LegExtensionAnalyzer extends GenericAnalyzer {
  constructor(level = 'normal', imageOnly = false) { super('leg_ext', level); this.imageOnly = imageOnly; }
  reset() { super.reset(); this.smoothed = null; this.low = null; this.lowT = null; this.chosenSide = null; }
  update(kp, t) {
    if (this.prevT != null && t-this.prevT > .5) this.recalibrate();
    if (this.imageOnly && kp) kp = kp.map(p => ({ x:p.x, y:p.y, z:p.z, score:p.score }));
    kp = this.prepare(kp, t, 'joints');
    const dt = this.tick(t), joints = ANGLES.knee;
    if (!kp) return this.lost(t);
    if (!this.chosenSide) {
      const sides = ['l','r'].filter(s => this.sideOk(kp,s,joints));
      if (!sides.length) return this.lost(t);
      const confidence = s => Math.min(...joints.map(j => sc(kp[SIDE[s][j]])));
      this.chosenSide = sides.sort((a,b) => confidence(b)-confidence(a))[0];
    }
    // A different leg has a different estimated angle. Never splice it into a cycle.
    this.side = this.chosenSide;
    if (!this.sideOk(kp,this.side,joints)) return this.lost(t);
    this.lostSince = null; this.kp = kp; this.view = 'side';
    const raw = this.ang(kp,'knee',this.side);
    if (!Number.isFinite(raw)) return this.lost(t);
    this.smoothed = this.smoothed == null ? raw : lerp(this.smoothed,raw,1-Math.exp(-dt/.06));
    const sig = this.smoothed, minAmp = this.spec.amp * .55;
    if (this.low == null) { this.low = sig; this.lowT = t; }
    if (!this.cal) { this.cal = {s0:sig}; this.emit({type:'status',id:'ready'}); }
    this.status = 'track'; this.m = {sig,x:sig-this.low};
    if (this.phase === 'setup') this.phase = 'top';
    if (this.phase === 'top') {
      if (sig <= this.low) this.low = sig;
      if (sig <= this.low+4) this.lowT = t;
      this.cal.s0 = this.low;
      if (sig-this.low >= 12 && t-this.lowT >= .12) {
        this.startRep(this.lowT,{ext:sig-this.low,ext_sig:sig,t_ext:t,low:this.low,sec0:{},sec_dev:{},near_ext:0,t_leave:t});
        this.secStart(kp);
      }
    } else if (this.rep) {
      const R = this.rep.extra;
      if (sig >= R.ext_sig) {
        R.ext_sig = sig; R.ext = sig-R.low; R.t_ext = t; this.rep.tBottom = t; this.phase = 'down';
      }
      this.secTrack(kp);
      if (sig >= R.ext_sig-6) { R.near_ext += dt; R.t_leave = t; }
      const returned = R.ext_sig-sig;
      if (returned >= Math.max(12,R.ext*.25)) {
        if (R.ext < minAmp) {
          this.rep = null; this.phase = 'top'; this.clearLive(); this.low = sig; this.lowT = t;
        } else {
          if (this.phase === 'down') { this.phase = 'up'; this.atExtreme(kp); }
          if (returned >= Math.max(minAmp,R.ext*.55)) {
            // A single bad landmark can jump out and back. Time spent waiting
            // after that spike must not turn it into a valid repetition.
            if (R.t_ext-this.rep.t0 >= .16 && t-R.t_ext >= .16 && t-this.rep.t0 >= .6) this.complete(t);
            else { this.rep = null; this.phase = 'top'; this.clearLive(); }
            this.low = sig; this.lowT = t;
          }
        }
      }
    }
    this.idleCheck(t); return this.snapshot();
  }
  lost(t) {
    // A gap cannot prove the hidden return. Keep completed reps, discard the candidate.
    if (this.cal || this.rep || this.chosenSide) this.recalibrate();
    return super.lost(t);
  }
}

/* Any other exercise (machines, own exercises): no technique rules, a rep counter. It watches the big joints,
   takes the one that moves the most away from the starting position and counts full there-and-back cycles of it;
   it also notices when the range gets shorter than in the first reps or a rep is rushed. Phone only. */
const FREE_SIGS = {
  knee_l: ['knee', 'l'], knee_r: ['knee', 'r'], hip_l: ['hip', 'l'], hip_r: ['hip', 'r'],
  elbow_l: ['elbow', 'l'], elbow_r: ['elbow', 'r'], shoulder_l: ['shoulder', 'l'], shoulder_r: ['shoulder', 'r'],
  ankle_l: ['ankle', 'l'], ankle_r: ['ankle', 'r'], thighs: ['thighs']
};
const FREE_META = {
  short: { title: 'Амплитуда', cue: 'Полная амплитуда, как в первых повторах', pen: 15 },
  fast: { title: 'Темп', cue: 'Медленнее, под контролем', pen: 10 }
};
class FreeAnalyzer extends BaseAnalyzer {
  constructor(level = 'normal', key = null, imageOnly = false) { super('parallel', level); this.key = key; this.imageOnly = imageOnly; }
  reset() { super.reset(); this.sm = {}; this.prevV = {}; this.vel = 0; this.active = null; this.ref = null; this.amps = []; }
  meta(fid) { return FREE_META[fid] || { title: 'Техника', cue: '', pen: 10 }; }
  values(kp) {
    const out = {}, ok = i => sc(kp[i]) > 0.5;
    for (const [name, s] of Object.entries(FREE_SIGS)) {
      const spec = D.specs[this.key], sig = spec && spec.sig;
      if (sig && sig[0].startsWith('angle') && s[0] !== sig[1]) continue;
      if (s[0] === 'thighs') {
        if ([23, 24, 25, 26].every(ok)) out[name] = angle(kp[25], mid(kp[23], kp[24]), kp[26]);
        continue;
      }
      const S = SIDE[s[1]], js = ANGLES[s[0]].map(j => S[j]);
      if (js.every(ok)) out[name] = angle(kp[js[0]], kp[js[1]], kp[js[2]]);
    }
    return out;
  }
  minMove(name) { return name.startsWith('ankle') ? 12 : 20; }
  update(kp, t) {
    if (this.imageOnly && kp) kp = kp.map(p=>({x:p.x,y:p.y,z:p.z,score:p.score}));
    kp = this.prepare(kp, t, 'joints');
    const dt = this.tick(t);
    const raw = kp ? this.values(kp) : {};
    if (!Object.keys(raw).length || (this.active && raw[this.active] == null)) return this.lost(t);
    this.lostSince = null; this.kp = kp;
    let vmax = 0;
    for (const [k, v] of Object.entries(raw)) {
      const s = this.sm[k] == null ? v : lerp(this.sm[k], v, 0.5);
      if (this.prevV[k] != null) vmax = Math.max(vmax, Math.abs(s - this.prevV[k]) / dt);
      this.prevV[k] = s; this.sm[k] = s;
    }
    for (const k of Object.keys(this.sm)) if (raw[k] == null) { delete this.sm[k]; delete this.prevV[k]; }
    this.vel = lerp(this.vel, vmax, 0.3);
    const stable = this.vel < 30;
    if (!this.cal) {
      this.status = 'calib'; this.phase = 'setup';
      if (stable) {
        if (this.standSince == null) this.standSince = t;
        if (t - this.standSince > 0.5) { this.cal = { s0: Object.assign({}, this.sm) }; this.phase = 'top'; this.standSince = null; this.emit({ type: 'status', id: 'ready' }); }
      } else this.standSince = null;
      return this.snapshot();
    }
    this.status = 'track';
    for (const k of Object.keys(this.sm)) if (this.cal.s0[k] == null) this.cal.s0[k] = this.sm[k];
    const dev = k => Math.abs(this.sm[k] - this.cal.s0[k]);
    if (this.phase === 'top') {
      if (stable) for (const k of Object.keys(this.sm)) if (dev(k) < 8) this.cal.s0[k] = lerp(this.cal.s0[k], this.sm[k], 0.05);
      let pick = this.active;
      if (!pick) { let best = 0; for (const k of Object.keys(this.sm)) { const d = dev(k) * (k.startsWith('ankle') ? 0.6 : 1); if (d > best) { best = d; pick = k; } } }   // big joints first
      if (pick && this.sm[pick] != null) {
        const thr = this.ref ? Math.max(0.35 * this.ref, this.minMove(pick) * 0.6) : this.minMove(pick);
        if (dev(pick) > thr) this.startRep(t, { sig: pick, ext: dev(pick), t_ext: t });
      }
    } else if (this.rep) {
      const R = this.rep.extra, d = this.sm[R.sig] == null ? null : dev(R.sig);
      if (d == null) { this.rep = null; this.phase = 'top'; }
      else if (this.phase === 'down') {
        if (d >= R.ext) { R.ext = d; R.t_ext = t; this.rep.tBottom = t; }
        if (R.ext - d > 0.3 * R.ext) this.phase = 'up';
      } else if (this.phase === 'up') {
        if (d > R.ext * 0.85) this.phase = 'down';
        else if (d < 0.3 * R.ext) this.complete(t);
      }
    }
    this.idleCheck(t);
    return this.snapshot();
  }
  complete(t) {
    const R = this.rep, amp = R.extra.ext;
    R.t1 = t; R.down = R.tBottom - R.t0; R.up = t - R.tBottom;
    if (!this.active) this.active = R.extra.sig;
    if (this.ref && amp < 0.7 * this.ref / this.tol) { R.faults.short = true; this.pulse('short'); }
    if (t - R.t0 < 0.9 / Math.max(1.0, this.tol)) { R.faults.fast = true; this.pulse('fast'); }
    this.amps.push(amp);
    if (this.amps.length <= 3) { const a = this.amps.slice().sort((x, y) => x - y); this.ref = a[Math.floor(a.length / 2)]; }
    this.rep = null; this.phase = 'top';
    this.finishRep(R);
  }
  joints() {
    const s = FREE_SIGS[this.active];
    if (!s) return [];
    if (s[0] === 'thighs') return [25, 26];
    return [SIDE[s[1]][ANGLES[s[0]][1]]];
  }
}

/* ---------- the weight instead of the body ----------
   When a machine or plates hide the joints, the plate, handle or carriage still moves with every rep. The person taps it
   once; BarTracker follows that patch by normalized cross-correlation on a small grey copy of each frame, and
   BarAnalyzer counts reps from its path: count, range of motion, tempo and the pause, never the body position. */
class BarTracker {
  constructor(r = 9, search = 12) { this.r = r; this.s = search; }
  cut(g, W, cx, cy) {
    const r = this.r, n = 2 * r + 1, T = new Float32Array(n * n); let k = 0, sum = 0;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { const v = g[y * W + x]; T[k++] = v; sum += v; }
    const m = sum / T.length; let ss = 0;
    for (let i = 0; i < T.length; i++) { T[i] -= m; ss += T[i] * T[i]; }
    const sd = Math.sqrt(ss / T.length), nrm = Math.sqrt(ss) || 1;
    for (let i = 0; i < T.length; i++) T[i] /= nrm;
    T.sd = sd; return T;
  }
  start(g, W, H, x, y) {
    const r = this.r;
    this.W = W; this.H = H;
    this.x = clamp(Math.round(x), r, W - r - 1); this.y = clamp(Math.round(y), r, H - r - 1);
    this.T0 = this.cut(g, W, this.x, this.y); this.T = this.T0.slice(); this.T.sd = this.T0.sd;
    this.fx = this.x; this.fy = this.y; this.score = 1; this.lost = 0;
    return { x: this.fx, y: this.fy, score: 1, ok: true, contrast: this.T0.sd };
  }
  ncc(g, cx, cy) {   // the patch against both templates: the first look and the slowly updated one
    const r = this.r, W = this.W, T0 = this.T0, T = this.T;
    let k = 0, sum = 0, ss = 0, d0 = 0, d1 = 0;
    for (let y = cy - r; y <= cy + r; y++) {
      const row = y * W;
      for (let x = cx - r; x <= cx + r; x++) { const v = g[row + x]; sum += v; ss += v * v; d0 += v * T0[k]; d1 += v * T[k]; k++; }
    }
    const varn = ss - sum * sum / k;
    if (varn < 1e-6) return -1;
    const q = Math.sqrt(varn);
    return 0.5 * (d0 / q) + 0.5 * (d1 / q);
  }
  update(g) {
    const r = this.r, W = this.W, H = this.H, s = this.s;
    const lo = (c, m) => Math.max(r, c - s), hi = (c, m) => Math.min(m - r - 1, c + s);
    let best = -2, bx = this.x, by = this.y;
    for (let y = lo(this.y, H); y <= hi(this.y, H); y += 2) for (let x = lo(this.x, W); x <= hi(this.x, W); x += 2) {
      const v = this.ncc(g, x, y); if (v > best) { best = v; bx = x; by = y; }
    }
    const cx = bx, cy = by, at = {};
    for (let y = Math.max(r, cy - 2); y <= Math.min(H - r - 1, cy + 2); y++) for (let x = Math.max(r, cx - 2); x <= Math.min(W - r - 1, cx + 2); x++) {
      const v = this.ncc(g, x, y); at[x + ',' + y] = v; if (v > best) { best = v; bx = x; by = y; }
    }
    const sub = (a, b, c) => { const d = a - 2 * b + c; return d < 0 ? clamp(0.5 * (a - c) / d, -0.5, 0.5) : 0; };
    const v = (x, y) => at[x + ',' + y] != null ? at[x + ',' + y] : best;
    this.score = best;
    if (best < 0.45) { this.lost++; return { x: this.fx, y: this.fy, score: best, ok: false }; }
    this.lost = 0; this.x = bx; this.y = by;
    this.fx = bx + sub(v(bx - 1, by), best, v(bx + 1, by)); this.fy = by + sub(v(bx, by - 1), best, v(bx, by + 1));
    if (best > 0.7) {   // follow slow changes of light and angle, the first look keeps it from drifting away
      const P = this.cut(g, W, bx, by), T = this.T;
      let ss = 0; for (let i = 0; i < T.length; i++) { T[i] = 0.85 * T[i] + 0.15 * P[i]; ss += T[i] * T[i]; }
      const n = Math.sqrt(ss) || 1; for (let i = 0; i < T.length; i++) T[i] /= n;
    }
    return { x: this.fx, y: this.fy, score: best, ok: true };
  }
}
const BAR_META = {
  bar_rom: { title: 'Амплитуда', cue: 'Делай полную амплитуду', pen: 25 },
  bar_fast: { title: 'Темп', cue: 'Опускай медленнее, под контролем', pen: 15 },
  bar_hold: { title: 'Пауза', cue: 'Задержись в конечной точке', pen: 10 },
};
class BarAnalyzer {
  constructor(key = null, level = 'normal') { this.key = key; this.level = level; this.isBar = true; this.reset(); }
  reset() {
    this.reps = []; this.events = []; this.setEnded = false; this.status = 'calib'; this.phase = 'top'; this.view = null; this.side = 'l';
    this.analysisMode = 'bar'; this.p0 = null; this.axis = null; this.s = null; this.rest = 0; this.rep = null; this.lastRepEnd = null;
    this.lostSince = null; this.now = 0; this.W = 160; this.path = []; this.maxAmp = 0;
  }
  spec() { return (D && D.specs && D.specs[this.key]) || {}; }
  check(kind) { return (this.spec().checks || []).find(c => c[0] === kind); }
  meta(fid) {
    const m = BAR_META[fid] || { title: 'Движение', cue: '', pen: 10 };
    const own = fid === 'bar_rom' ? this.check('rom') || this.check('romrel') : fid === 'bar_fast' ? this.check('tempo') : fid === 'bar_hold' ? this.check('hold') : null;
    return own ? Object.assign({}, m, { cue: own[own.length - 1] }) : m;
  }
  emit(e) { this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }
  h() { const a = this.reps.map(r => r.extra.amp).sort((x, y) => x - y); return Math.max(0.025 * this.W, a.length ? 0.35 * a[a.length >> 1] : 0); }
  snapshot() {
    return { status: this.status, phase: this.phase, view: null, side: 'l', reps: this.setEnded ? 0 : this.reps.length, live: [], setEnded: this.setEnded,
      held: null, analysisMode: 'bar', partial: false, bar: true };
  }
  /* p: the tracked point in pixels of the small frame {x, y, ok}; W: the frame width (the scale of every threshold) */
  update(p, t, W) {
    this.now = t; if (W) this.W = W;
    if (!p || !p.ok) {
      if (this.lostSince == null) this.lostSince = t;
      if (t - this.lostSince > 0.6) { this.status = 'bar_lost'; if (this.rep) { this.rep = null; this.phase = 'top'; } }   // a gap breaks the unfinished rep
      return this.snapshot();
    }
    this.lostSince = null; this.status = 'track';
    if (!this.p0) { this.p0 = { x: p.x, y: p.y }; this.early = []; }
    const dx = p.x - this.p0.x, dy = p.y - this.p0.y;
    if (!this.axis) {
      this.early.push([t, dx, dy]);
      const d = Math.hypot(dx, dy);
      if (d < 1.5 * this.h()) return this.snapshot();
      // The line of motion is the first clear movement. Which way is «out» from the start: a weight goes up on the lifting
      // part of the rep, so with mostly vertical motion «out» is up — or down for exercises that start with lowering.
      let ax = dx / d, ay = dy / d;
      if (Math.abs(ay) >= 0.5) { const up = this.spec().ecc !== 'first'; if ((ay < 0) !== up) { ax = -ax; ay = -ay; } }
      this.axis = { x: ax, y: ay };
      for (const [te, ex, ey] of this.early) this.step(te, ex * ax + ey * ay);   // the start of the set is not lost
      this.early = null;
      return this.snapshot();
    }
    this.step(t, dx * this.axis.x + dy * this.axis.y);
    return this.snapshot();
  }
  step(t, raw) {
    this.s = this.s == null ? raw : lerp(this.s, raw, 0.5);
    const s = this.s, h = this.h();
    this.path.push([t, s]); if (this.path.length > 900) this.path.splice(0, 300);
    if (this.path.length === 1) this.rest = s;
    if (!this.rep) {
      if (s < this.rest) this.rest = s;
      if (s - this.rest > h) {
        if (this.setEnded) { this.reps = []; this.setEnded = false; this.emit({ type: 'newSet' }); }
        this.closeBack(this.reps[this.reps.length - 1]);
        let i = this.path.length - 1; while (i > 0 && this.path[i - 1][1] < this.path[i][1] && this.path[i - 1][1] >= this.rest) i--;
        this.rep = { n: this.reps.length + 1, t0: this.path[i][0], rest: this.rest, far: s, tFar: t, faults: {}, faultList: [], extra: {}, grade: 'good', score: 100 };
        this.phase = 'down';
      } else if (this.lastRepEnd != null && !this.setEnded && t - this.lastRepEnd > 7) this.endSet();
      return;
    }
    const R = this.rep;
    if (s > R.far) { R.far = s; R.tFar = t; }
    const amp = R.far - R.rest;
    if (this.phase === 'down' && R.far - s > Math.max(h, 0.12 * amp)) this.phase = 'up';
    if (this.phase === 'up' && s > R.far - 0.12 * amp) this.phase = 'down';   // pressed again: still the same rep
    if (this.phase === 'up' && s <= R.rest + 0.3 * amp) {
      if (amp < Math.max(h, 0.4 * this.refAmp())) { this.rep = null; this.phase = 'top'; this.rest = s; return; }
      this.finish(R, t); this.rest = s;
    }
  }
  reanchor() { this.p0 = null; this.axis = null; this.early = null; this.s = null; this.rep = null; this.path = []; this.phase = 'top'; this.rest = 0; }   // a new point: the same set goes on
  refAmp() { return this.reps.length ? Math.max(...this.reps.map(r => r.extra.amp)) : 0; }
  /* times on the way out and back from the path, between 10 % and 90 % of the range; the pause is the time beyond 90 % */
  finish(R, t) {
    const pts = this.path.filter(q => q[0] >= R.t0 && q[0] <= t), amp = R.far - R.rest, at = f => R.rest + f * amp;
    const first = (from, test) => { for (const q of pts) if (q[0] >= from && test(q[1])) return q[0]; return null; };
    const o10 = first(R.t0, v => v >= at(0.1)), o90 = first(R.t0, v => v >= at(0.9));
    const b90 = first(R.tFar, v => v < at(0.9)), b10 = first(R.tFar, v => v <= at(0.1));
    const out = o10 != null && o90 != null ? o90 - o10 : null, back = b90 != null && b10 != null ? b10 - b90 : null;
    const hold = o90 != null && b90 != null ? b90 - o90 : 0;
    R.t1 = t; R.extra = { amp, far: R.far, rest: R.rest, tFar: R.tFar, out, back, ecc: null, hold };
    this.tempo(R);
    const holdC = this.check('hold');
    if (holdC && hold < holdC[1]) R.faults.bar_hold = true;
    if (this.reps.length && this.short(R, this.reps)) R.faults.bar_rom = true;
    this.grade(R);
    this.reps.push(R); this.lastRepEnd = t; this.rep = null; this.phase = 'top'; this.maxAmp = Math.max(this.maxAmp, amp);
    this.emit({ type: 'rep', rep: R });
  }
  /* the way back is finished only after the rep is counted (at 30 %): its time is filled in when the path is there */
  closeBack(R) {
    if (!R || R.extra.back != null) return;
    const X = R.extra, at = f => X.rest + f * X.amp;
    let b90 = null, b10 = null;
    for (const q of this.path) { if (q[0] < X.tFar) continue; if (b90 == null && q[1] < at(0.9)) b90 = q[0]; if (b90 != null && q[1] <= at(0.1)) { b10 = q[0]; break; } }
    if (b90 != null && b10 != null) { X.back = b10 - b90; this.tempo(R); this.grade(R); }
  }
  tempo(R) {
    const X = R.extra, tempo = this.check('tempo');
    X.ecc = this.spec().ecc === 'first' ? X.out : X.back;
    if (X.ecc != null && X.ecc < 0.75 * (tempo ? tempo[1] : 0.8)) R.faults.bar_fast = true; else delete R.faults.bar_fast;
  }
  /* short = the far end (the top of a bridge, the bottom of a squat) stops clearly before where the other reps go;
     a rep whose start was not filmed is not short */
  short(R, others) {
    const med = a => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
    const fars = others.map(r => r.extra.far), amps = others.map(r => r.extra.amp);
    return R.extra.far < med(fars) - 0.28 * med(amps);
  }
  grade(R) {
    R.faultList = Object.keys(R.faults).sort((a, b) => this.meta(b).pen - this.meta(a).pen);
    R.score = 100 - R.faultList.reduce((a, f) => a + this.meta(f).pen, 0); R.grade = R.score >= 85 ? 'good' : R.score >= 65 ? 'ok' : 'bad';
  }
  endSet() {
    const R = this.rep;
    this.closeBack(this.reps[this.reps.length - 1]);
    if (R && this.s != null) {   // the recording stopped on the way back: a rep that came most of the way home counts
      const amp = R.far - R.rest;
      if (this.phase === 'up' && amp >= Math.max(this.h(), 0.4 * this.refAmp()) && this.s <= R.rest + 0.6 * amp) this.finish(R, this.now);
      this.rep = null; this.phase = 'top';
    }
    if (this.reps.length >= 3) for (const r of this.reps) {   // the whole set is known now: the first reps are judged too
      if (this.short(r, this.reps)) r.faults.bar_rom = true; else delete r.faults.bar_rom; this.grade(r);
    }
    if (this.reps.length && !this.setEnded) { this.setEnded = true; this.emit({ type: 'setEnd' }); }
  }
  /* the result in words: the count, then what to change, without anything about the body */
  note() {
    const reps = this.reps, n = reps.length; if (!n) return '';
    const short = reps.filter(r => r.faults.bar_rom).map(r => r.n), fast = reps.filter(r => r.faults.bar_fast).length, noHold = reps.filter(r => r.faults.bar_hold).length;
    const parts = ['По движению веса: ' + n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'повтор' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'повтора' : 'повторов') + '.'];
    parts.push(short.length ? (short.length === 1 ? 'Повтор ' + short[0] + ' короче остальных. ' : 'Повторы ' + short.join(', ') + ' короче остальных. ') + this.meta('bar_rom').cue + '.' : 'Амплитуда ровная.');
    const eccs = reps.map(r => r.extra.ecc).filter(v => v != null);
    if (fast > n / 2 && eccs.length) parts.push(this.meta('bar_fast').cue + ': сейчас около ' + (eccs.reduce((a, b) => a + b, 0) / eccs.length).toFixed(1).replace('.', ',') + ' с.');
    if (noHold > n / 2) parts.push(this.meta('bar_hold').cue + '.');
    parts.push('Положение тела не оценивалось.');
    return parts.join(' ');
  }
}

function requiredChains(key) {
  const spec=D.specs[key], perSide=names => ['l','r'].map(s=>names.map(j=>SIDE[s][j]));
  if (key in D.squat) return perSide(['sh','hip','kn','an']);
  if (key in D.pushup) return ['an','kn'].flatMap(foot=>perSide(['sh','el','wr','hip',foot]));
  if (spec) {
    if (spec.hold) return ['an','kn'].flatMap(foot=>perSide(['sh','hip',foot]));
    const [kind,joint]=spec.sig;
    if (kind.startsWith('angle')) return perSide(ANGLES[joint]);
    if (kind==='abd') return perSide(['hip','sh','el']);
    if (kind==='gap') return [[11,12,SIDE.l[J[joint]],SIDE.r[J[joint]]]];
    if (kind==='height') return perSide(['sh','hip','kn','an']);
    return perSide(['sh','hip']);
  }
  return ['knee','hip','elbow','shoulder'].flatMap(j=>perSide(ANGLES[j]));
}
function analyzerFor(key, depth = 'parallel', level = 'normal') {
  if (isLunge(key)) return new LungeAnalyzer(key, level, depth);
  if (key === 'leg_ext') return new LegExtensionAnalyzer(level);
  if (key in D.squat) return new SquatAnalyzer(D.squat[key] === 'parallel' ? depth : 'half', level);
  if (key in D.pushup) { const a = new PushupAnalyzer(depth, level); a.incline = D.pushup[key]; return a; }
  if (key in D.specs) return new GenericAnalyzer(key, level, depth);
  return null;
}
function viewOf(key) { return key in D.squat ? 'any' : key in D.pushup ? 'side' : ((D.specs[key] || {}).view || 'side'); }
function isHold(key) { return !!(D.specs[key] && D.specs[key].hold); }
function family(key) { return key in D.squat ? 'squat' : key in D.pushup ? 'pushup' : 'generic'; }

return { setData(d) { D = d; }, data: () => D, analyzerFor, viewOf, isHold, isLunge, family, requiredChains, SIDE, poseToKeypoints, projectWorld, angle, BaseAnalyzer, SquatAnalyzer, PushupAnalyzer, GenericAnalyzer, LungeAnalyzer, LegExtensionAnalyzer, FreeAnalyzer, BarTracker, BarAnalyzer };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = AT;

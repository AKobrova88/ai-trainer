'use strict';
/* ---------- canvas ---------- */
const ctx = el.cv.getContext('2d');
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let C = {};
function readColors() { C = { ink: cssv('--stage-ink'), bone: cssv('--stage-bone') || cssv('--stage-ink'), dim: cssv('--stage-dim'), good: cssv('--stage-good'), bad: cssv('--stage-bad') }; }
readColors();
let viewW = 0, viewH = 0;
function resize() {
  const r = el.stage.getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
  viewW = r.width; viewH = r.height;
  el.cv.width = Math.round(r.width * dpr); el.cv.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe(el.stage);
function setAspect(w, h) { el.stage.style.setProperty('--ar', clamp(w / h, 9 / 16, 16 / 9).toFixed(4)); }
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];
function draw() {
  ctx.clearRect(0, 0, viewW, viewH);
  if (state.bar && state.bar.pts && state.bar.pts.length && state.on) return drawBar(state.bar);
  const f = state.frame; if (!f || !f.kp || !state.on) return;
  const s = Math.min(viewW / f.W, viewH / f.H), ox = (viewW - f.W * s) / 2, oy = (viewH - f.H * s) / 2;
  const mirror = !state.file && state.facing === 'user';
  const X = p => ox + (mirror ? f.W - p.x : p.x) * s, Y = p => oy + p.y * s;
  const snap = state.snap || { view: 'side', side: 'l', live: [] }, A = state.analyzer, kp = f.kp;
  const bad = new Set(); for (const id of snap.live) for (const j of A.joints(id)) bad.add(j);
  const far = snap.view === 'side' ? new Set(Object.values(AT.SIDE[snap.side === 'l' ? 'r' : 'l'])) : new Set();
  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    const P = kp[a], Q = kp[b];
    if (!P || !Q || P.score < 0.35 || Q.score < 0.35) continue;
    const isFar = far.has(a) || far.has(b);
    ctx.strokeStyle = 'rgba(8,12,16,.55)'; ctx.globalAlpha = isFar ? 0.3 : 0.8; ctx.lineWidth = isFar ? 4.5 : 6;
    ctx.beginPath(); ctx.moveTo(X(P), Y(P)); ctx.lineTo(X(Q), Y(Q)); ctx.stroke();
    ctx.strokeStyle = C.bone; ctx.globalAlpha = isFar ? 0.32 : 0.95; ctx.lineWidth = isFar ? 2 : 3.5;
    ctx.beginPath(); ctx.moveTo(X(P), Y(P)); ctx.lineTo(X(Q), Y(Q)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const i of [7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]) {
    const p = kp[i]; if (!p || p.score < 0.35) continue;
    if (bad.has(i)) {
      ctx.fillStyle = C.bad; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(X(p), Y(p), 15, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(X(p), Y(p), 6.5, 0, 7); ctx.fill();
    } else {
      const isFar = far.has(i);
      ctx.fillStyle = 'rgba(8,12,16,.6)'; ctx.globalAlpha = isFar ? 0.4 : 0.9; ctx.beginPath(); ctx.arc(X(p), Y(p), isFar ? 4.5 : 6.5, 0, 7); ctx.fill();
      ctx.fillStyle = isFar ? C.dim : C.ink; ctx.globalAlpha = isFar ? 0.5 : 1; ctx.beginPath(); ctx.arc(X(p), Y(p), isFar ? 3 : 4.5, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawBar(B) {
  const v = el.vid, W = v.videoWidth, Hh = v.videoHeight; if (!W || !Hh) return;
  const s = Math.min(viewW / W, viewH / Hh), ox = (viewW - W * s) / 2, oy = (viewH - Hh * s) / 2, mirror = !state.file && state.facing === 'user';
  const X = p => ox + (mirror ? W - p.x : p.x) * s, Y = p => oy + p.y * s, pts = B.pts, last = pts[pts.length - 1];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,12,16,.5)'; ctx.globalAlpha = 0.8; ctx.lineWidth = 6; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))); ctx.stroke();
  ctx.strokeStyle = C.bone; ctx.globalAlpha = 0.9; ctx.lineWidth = 3; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))); ctx.stroke();
  const rr = Math.max(14, ((B.tr && B.tr.r) || 9) * (B.k || 1) * s);
  ctx.globalAlpha = 1; ctx.lineWidth = 4; ctx.strokeStyle = last.ok ? C.good : C.bad; ctx.beginPath(); ctx.arc(X(last), Y(last), rr, 0, 7); ctx.stroke();
}


'use strict';
/* ---------- OCR on the phone (Tesseract, Russian + English), loaded from this origin on demand ---------- */
let OCR = null, OCR_LOG = null;   // the worker keeps one logger; each import points it at its own progress bar
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function ocrWorker(onMsg) {
  if (onMsg) OCR_LOG = onMsg;
  if (OCR) return OCR;
  const base = new URL('vendor/tesseract/', location.href).href;
  if (!window.Tesseract) await loadScript(base + 'tesseract.min.js');
  const opts = {workerPath: base + 'worker.min.js', corePath: base + 'core/', langPath: base + 'lang', workerBlobURL: false,
                logger: m => { if (OCR_LOG) OCR_LOG(m); }};
  OCR = await window.Tesseract.createWorker(['rus', 'eng'], 1, opts);
  return OCR;
}
/* dark screenshots read badly: grey, invert if the picture is mostly dark, upscale small ones */
function prepImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = img.width < 1100 ? 2 : 1, c = document.createElement('canvas');
      c.width = img.width * k; c.height = img.height * k;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height), p = d.data; let sum = 0;
      for (let i = 0; i < p.length; i += 4) { const v = .299 * p[i] + .587 * p[i + 1] + .114 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = v; sum += v; }
      if (sum / (p.length / 4) < 110) for (let i = 0; i < p.length; i += 4) p[i] = p[i + 1] = p[i + 2] = 255 - p[i];
      g.putImageData(d, 0, 0); res(c);
    };
    img.onerror = rej; img.src = url;
  });
}
/* keep wide gaps between words — the card and «name    6-8» rules rely on them */
function linesOf(data) {
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const ws = (l.words || []).filter(w => w.text && w.text.trim()); let s = '', prev = null;
    for (const w of ws) { if (prev) { const cw = (prev.bbox.x1 - prev.bbox.x0) / Math.max(1, prev.text.length); s += (w.bbox.x0 - prev.bbox.x1) > cw * 1.8 ? '   ' : ' '; } s += w.text; prev = w; }
    if (s.trim()) out.push(s.trim());
  }
  if (!out.length && data.text) out.push(...data.text.split('\n').map(x => x.trim()).filter(Boolean));
  return out;
}
async function ocrPhotos(photos, progress) {
  const all = [];
  const w = await ocrWorker(m => { if (m.status === 'recognizing text') progress && progress(null, m.progress); });
  for (let i = 0; i < photos.length; i++) {
    progress && progress(i, 0);
    const canvas = await prepImage(photos[i].url);
    const r = await w.recognize(canvas, {}, {blocks: true, text: true});
    if (i) all.push(PHOTO_BREAK);
    all.push(...linesOf(r.data));
  }
  return all;
}


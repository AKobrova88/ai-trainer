'use strict';
/* ---------- supersets: neighbours with the same ss are done in turn — 1А → 1Б (→ 1В) → 1А …, rest after the round ---------- */
const SS_LETTERS = 'АБВГ', SS_MAX = 4;
function normSS(items) {
  const seen = new Set(); let prevOld = null, cur = null;
  for (const it of items) {
    if (!it.ss) { prevOld = null; continue; }
    if (it.ss !== prevOld) { prevOld = it.ss; cur = seen.has(it.ss) ? nid('g') : it.ss; seen.add(cur); }
    it.ss = cur;
  }
  for (let i = 0; i < items.length; i++) { const g = items[i].ss; if (g && !((items[i - 1] && items[i - 1].ss === g) || (items[i + 1] && items[i + 1].ss === g))) delete items[i].ss; }
}
function blockLabels(items) {   // '1', '2', '3А', '3Б', '4'
  const out = []; let n = 0, k = 0, prev = null;
  for (const it of items) { if (it.ss && it.ss === prev) k++; else { n++; k = 0; } prev = it.ss || null; out.push(it.ss ? n + SS_LETTERS[k] : String(n)); }
  return out;
}
function groupOf(items, i) {
  const g = items[i] && items[i].ss; if (!g) return [i];
  let a = i, b = i;
  while (a > 0 && items[a - 1].ss === g) a--;
  while (b < items.length - 1 && items[b + 1].ss === g) b++;
  return Array.from({length: b - a + 1}, (_, x) => a + x);
}


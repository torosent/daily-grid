#!/usr/bin/env node
// Offline puzzle factory for index.html.
//   node build.js generate [--clued]   data/words.txt -> data/puzzles.txt (tops up to the PLAN; --clued uses only words that have clues)
//   node build.js need                 lists words used in puzzles that have no clue yet -> data/need.txt
//   node build.js pack                 data/clues.txt + data/puzzles.txt -> data/puzzles-N.json, the files index.html downloads
// Language: DATA_DIR=data/he (or GRID_LANG=he) builds the Hebrew edition from data/he/; the default is English in data/.
// Files: words.txt one word per line; clues.txt WORD|easy clue|hard clue; reject.txt words never to use;
//        puzzles.txt ID|N|GRID (row-major letters, # for a black square).
const fs = require('fs'), path = require('path');
// Not LANG: every shell already sets that to a locale.
const LANGUAGE = process.env.GRID_LANG || (process.env.DATA_DIR && path.basename(path.resolve(process.env.DATA_DIR)) === 'he' ? 'he' : 'en');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data', LANGUAGE === 'he' ? 'he' : ''), at = f => path.join(DATA, f);
// Hebrew: the five final letters are stored and matched as their regular forms (a square can end one word and sit inside the crossing word);
// vowel points are dropped. Prefix letters (and, the, in, to, from, that, as) and plural endings make look-alike pairs.
const HE_FINAL = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const LANGS = {
  en: { letters: /^[A-Z]{3,15}$/, norm: w => w.trim().toUpperCase(), sizes: [[5, 100], [7, 100], [15, 100]] },
  he: { letters: /^[\u05D0-\u05EA]{3,13}$/, norm: w => w.trim().replace(/[\u0591-\u05C7]/g, '').replace(/[ךםןףץ]/g, c => HE_FINAL[c]), sizes: [[5, 100], [7, 100], [13, 100]] },
};
const L = LANGS[LANGUAGE];
if (!L) throw new Error(`unknown GRID_LANG "${LANGUAGE}" (use en or he)`);
const norm = L.norm;
const MAX_USES = +process.env.MAX_USES || 12; // no word appears in more puzzles than this across the archive
const PLAN = process.env.PLAN ? process.env.PLAN.split(',').map(s => s.split(':').map(Number)) : L.sizes; // [size, how many]; PLAN=15:3 tops up only that size, other puzzles are kept
const lines = f => fs.existsSync(at(f)) ? fs.readFileSync(at(f), 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : [];
const rnd = n => Math.floor(Math.random() * n);
const popcount = x => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };

// ---------- grid structure ----------
function slotsOf(blk, n) {
  const slots = [];
  for (const dir of ['A', 'D']) for (let a = 0; a < n; a++) {
    let run = [];
    for (let b = 0; b <= n; b++) {
      const cell = dir === 'A' ? a * n + b : b * n + a;
      if (b < n && !blk[cell]) run.push(cell);
      else { if (run.length) slots.push({ dir, cells: run }); run = []; }
    }
  }
  return slots;
}
// Valid = every run is 3+ letters (so every square is checked both ways) and the white squares connect.
function validPattern(blk, n) {
  const slots = slotsOf(blk, n);
  if (!slots.length || slots.some(s => s.cells.length < 3)) return null;
  const open = []; for (let i = 0; i < n * n; i++) if (!blk[i]) open.push(i);
  const seen = new Set([open[0]]), st = [open[0]];
  while (st.length) {
    const i = st.pop(), r = Math.floor(i / n), c = i % n;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc, j = rr * n + cc;
      if (rr >= 0 && cc >= 0 && rr < n && cc < n && !blk[j] && !seen.has(j)) { seen.add(j); st.push(j); }
    }
  }
  return seen.size === open.length ? slots : null;
}
// Small grids: scatter symmetric black squares and keep the valid ones.
function scatterPattern(n, lo, hi) {
  const blk = new Array(n * n).fill(false), target = lo + rnd(hi - lo + 1);
  for (let k = 0, t = 0; k < target && t < 80; t++) {
    const i = rnd(n * n), j = n * n - 1 - i; // 180° symmetry
    if (blk[i]) continue; blk[i] = blk[j] = true; k += i === j ? 1 : 2;
  }
  const slots = validPattern(blk, n); return slots && { blk, slots };
}
// Large grids: keep cutting the longest runs with symmetric black squares until no entry is longer than maxLen.
function cutPattern(n, maxLen, minBlk, maxBlk) {
  const blk = new Array(n * n).fill(false);
  const lineOk = k => [0, 1].every(vert => { // every white run through cell k's row and column is 0 or 3+ long
    let run = 0;
    for (let b = 0; b <= n; b++) {
      const c = vert ? b * n + (k % n) : Math.floor(k / n) * n + b;
      if (b < n && !blk[c]) run++; else { if (run && run < 3) return false; run = 0; }
    }
    return true;
  });
  const put = i => { const j = n * n - 1 - i; if (blk[i]) return; blk[i] = blk[j] = true; if (!lineOk(i) || !lineOk(j)) blk[i] = blk[j] = false; };
  for (let guard = 0; guard < 600; guard++) {
    const slots = slotsOf(blk, n), long = slots.filter(s => s.cells.length > maxLen), count = blk.filter(Boolean).length;
    if (count > maxBlk) return null;
    if (!long.length && count >= minBlk) break;
    const pool = long.length ? long : slots.filter(s => s.cells.length >= 6);
    if (!pool.length) return null;
    const s = pool[rnd(pool.length)]; put(s.cells[rnd(s.cells.length)]);
  }
  const count = blk.filter(Boolean).length, slots = validPattern(blk, n);
  return slots && count >= minBlk && count <= maxBlk && slots.every(s => s.cells.length <= maxLen) ? { blk, slots } : null;
}
function pattern(n) {
  if (n <= 5) return scatterPattern(n, 0, 6);
  if (n <= 7) return scatterPattern(n, 4, 14);
  const share = n * n / 225; // 15×15 norms: 30–46 black squares, longest entry 7–11
  // Hebrew words are shorter (5.5 letters on average) and long ones are rare: shorter entries, a few more black squares (about 21%)
  if (LANGUAGE === 'he') return cutPattern(n, 6 + rnd(4), Math.round(34 * share), Math.round(50 * share));
  return cutPattern(n, 7 + rnd(5), Math.round(30 * share), Math.round(46 * share));
}

// ---------- word index ----------
const IDX = {};
function indexWords(words) {
  const by = {};
  for (const w of words) (by[w.length] ||= []).push(w);
  for (const len in by) {
    const ws = by[len], n = +len, W = Math.ceil(ws.length / 32), m = [];
    for (let p = 0; p < n; p++) m[p] = {};
    ws.forEach((w, i) => { for (let p = 0; p < n; p++) (m[p][w[p]] ||= new Uint32Array(W))[i >> 5] |= 1 << (i & 31); });
    const all = new Uint32Array(W); for (let i = 0; i < ws.length; i++) all[i >> 5] |= 1 << (i & 31);
    IDX[len] = { ws, W, m, all, zero: new Uint32Array(W) };
  }
}
// CAT/CATS, WALK/WALKED: too alike to share a grid.
const relatedEn = (a, b) => { const [s, l] = a.length <= b.length ? [a, b] : [b, a]; return l.length - s.length <= 3 && l.startsWith(s.length > 4 ? s.slice(0, -1) : s); };
// Hebrew: ספר/הספר (prefix), ילד/ילדים (plural), שיר/שירה (feminine) and the like.
const HE_PREFIX = 'הובלמשכ';
const relatedHe = (a, b) => {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l.length - s.length > 2) return false;
  if (l.length > s.length && HE_PREFIX.includes(l[0]) && l.slice(1).startsWith(s.slice(0, Math.max(3, s.length - 1)))) return true;
  return s.length >= 3 && l.startsWith(s.length > 3 ? s.slice(0, -1) : s);
};
const related = LANGUAGE === 'he' ? relatedHe : relatedEn;

// ---------- fill ----------
// Backtracking, most-constrained slot first. For that slot it samples candidate words, keeps the ones used least in
// earlier puzzles (`usage`; this is what spreads the vocabulary across the whole set), then tries first the word
// that leaves the crossing entries the most options.
function fill(n, slots, usage, maxNodes) {
  const L = new Array(n * n).fill(''), chosen = new Array(slots.length).fill(null), used = [];
  const cellSlots = Array.from({ length: n * n }, () => []);
  slots.forEach((s, i) => s.cells.forEach(c => cellSlots[c].push(i)));
  const cross = slots.map((s, i) => [...new Set(s.cells.flatMap(c => cellSlots[c]))].filter(j => j !== i));
  const mask = s => {
    const ix = IDX[s.cells.length]; if (!ix) return null;
    const r = ix.all.slice();
    s.cells.forEach((cell, p) => { const ch = L[cell]; if (!ch) return; const mm = ix.m[p][ch] || ix.zero; for (let k = 0; k < ix.W; k++) r[k] &= mm[k]; });
    return r;
  };
  const size = r => { let c = 0; if (r) for (let k = 0; k < r.length; k++) c += popcount(r[k]); return c; };
  const cnt = slots.map(s => size(mask(s)));
  if (cnt.some(c => !c)) return null;
  let nodes = 0;
  // Put word w in slot i; returns the crossing counts it changed, or null (and undoes itself) if it kills a crossing entry.
  const place = (i, w) => {
    const s = slots[i], undo = { prev: s.cells.map(c => L[c]), saved: [], score: 0 };
    s.cells.forEach((c, p) => L[c] = w[p]);
    for (const j of cross[i]) if (!chosen[j]) {
      undo.saved.push([j, cnt[j]]); cnt[j] = size(mask(slots[j]));
      if (!cnt[j]) { unplace(i, undo); return null; }
      undo.score += Math.log(cnt[j]);
    }
    return undo;
  };
  const unplace = (i, undo) => { for (const [j, v] of undo.saved) cnt[j] = v; slots[i].cells.forEach((c, p) => L[c] = undo.prev[p]); };
  const rec = left => {
    if (!left) return true;
    if (++nodes > maxNodes) return false;
    let best = -1;
    for (let i = 0; i < slots.length; i++) if (!chosen[i] && (best < 0 || cnt[i] < cnt[best] || (cnt[i] === cnt[best] && slots[i].cells.length > slots[best].cells.length))) best = i;
    const ix = IDX[slots[best].cells.length], r = mask(slots[best]), all = [];
    for (let k = 0; k < ix.W; k++) { let x = r[k]; while (x) { const b = x & -x; all.push(k * 32 + 31 - Math.clz32(b)); x ^= b; } }
    const sample = new Set(); // up to 60 random candidates
    for (let t = 0; t < 120 && sample.size < Math.min(60, all.length); t++) sample.add(ix.ws[all[rnd(all.length)]]);
    const ranked = [...sample].filter(w => (usage.get(w) || 0) < MAX_USES && !used.some(u => u === w || related(u, w)))
      .map(w => [(usage.get(w) || 0) + Math.random(), w]).sort((a, b) => a[0] - b[0]).slice(0, 14) // least used
      .map(([, w]) => { const u = place(best, w); if (!u) return null; unplace(best, u); return [u.score, w]; })
      .filter(Boolean).sort((a, b) => b[0] - a[0]); // most room for the crossings first
    for (const [, w] of ranked.slice(0, 8)) {
      const u = place(best, w); chosen[best] = w; used.push(w);
      if (rec(left - 1)) return true;
      unplace(best, u); chosen[best] = null; used.pop();
      if (nodes > maxNodes) return false;
    }
    return false;
  };
  return rec(slots.length) ? { L, words: chosen } : null;
}

// ---------- puzzles file ----------
const parsePuzzle = line => { const [id, n, grid] = line.split('|'); return { id: +id, n: +n, grid }; };
const wordsIn = p => slotsOf([...p.grid].map(ch => ch === '#'), p.n).map(s => s.cells.map(c => p.grid[c]).join(''));
const shape = grid => grid.replace(/[^#]/g, '.');

// A word counts as clued only when its line has both an easy and a hard clue.
const cluedWords = () => new Map(lines('clues.txt').map(l => l.split('|').map(s => s.trim())).filter(f => f.length === 3 && f.every(Boolean) && f[1] !== f[2]).map(([w, c, h]) => [norm(w), [c, h]]));
const savePuzzles = ps => fs.writeFileSync(at('puzzles.txt'), [...ps].sort((a, b) => a.n - b.n || a.id - b.id).map(p => `${p.id}|${p.n}|${p.grid}`).join('\n') + '\n');

function generate(onlyClued) {
  const reject = new Set(lines('reject.txt').map(norm)), clued = cluedWords();
  const allowed = new Set(lines('words.txt').map(norm).filter(w => L.letters.test(w) && !reject.has(w)));
  const vocab = new Set([...allowed].filter(w => !onlyClued || clued.has(w)));
  indexWords([...vocab]);
  console.log(`vocabulary: ${vocab.size} words`, Object.fromEntries(Object.entries(IDX).map(([l, ix]) => [l, ix.ws.length])));
  // Existing puzzles keep their ids (solvers' browsers remember ids). A puzzle is kept unless it uses a word that is no longer allowed.
  const old = lines('puzzles.txt').map(parsePuzzle), seenUses = new Map();
  const planned = new Set(PLAN.map(([n]) => n)), kept = [];
  const keep = old.filter(p => {
    // sizes being refilled must fit this run's vocabulary (with --clued: clued words only); other sizes only need allowed words
    const ws = wordsIn(p), ok = ws.every(w => (planned.has(p.n) ? vocab : allowed).has(w) && (seenUses.get(w) || 0) < MAX_USES);
    if (!ok && planned.has(p.n)) return false;
    if (!ok) kept.push(p.id); // a size this run will not refill is never emptied: report it instead
    ws.forEach(w => seenUses.set(w, (seenUses.get(w) || 0) + 1)); return true;
  });
  if (keep.length < old.length) console.log(`dropping ${old.length - keep.length} puzzles that use words no longer allowed or used more than ${MAX_USES} times`);
  if (kept.length) console.warn(`kept ${kept.length} puzzles that use rejected or overused words because their size is not in PLAN: ${kept.join(', ')}`);
  const usage = new Map(), shapes = new Map(), out = [];
  let nextId = Math.max(0, ...old.map(p => p.id)) + 1;
  const record = p => { for (const w of wordsIn(p)) usage.set(w, (usage.get(w) || 0) + 1); shapes.set(shape(p.grid), (shapes.get(shape(p.grid)) || 0) + 1); out.push(p); };
  keep.forEach(record); // every kept puzzle stays, whatever the PLAN says
  const failed = new Map(), DEAD = 40; // a shape that failed this many fills is treated as used up
  for (const [n, want] of PLAN) {
    const t0 = Date.now(); let have = out.filter(p => p.n === n).length, tries = 0, repeats = 0, skipped = 0;
    const limit = (+process.env.MINUTES || (n > 7 ? 90 : 10)) * 60000; // past this, stop and report instead of running forever
    while (have < want) {
      if (Date.now() - t0 > limit) { savePuzzles(out); console.error(`${n}x${n}: stopped after ${Math.round(limit / 60000)} minutes and ${tries} fills with ${have}/${want} puzzles (saved). Add words or loosen the pattern rules for this size.`); process.exitCode = 1; break; }
      const pat = pattern(n); if (!pat) continue;
      const sh = pat.blk.map(b => b ? '#' : '.').join('');
      // A shape repeats only after 300 patterns in a row were already used or dead (small sizes run out of shapes).
      if ((shapes.get(sh) || 0) > repeats || (failed.get(sh) || 0) >= DEAD * (repeats + 1)) { if (++skipped > 300) { repeats++; skipped = 0; } continue; }
      tries++; skipped = 0;
      const res = fill(n, pat.slots, usage, n > 7 ? 6000 : 800);
      if (!res) { failed.set(sh, (failed.get(sh) || 0) + 1); continue; }
      skipped = 0;
      record({ id: nextId++, n, grid: res.L.map((ch, i) => pat.blk[i] ? '#' : ch).join('') }); have++;
      savePuzzles(out); // written as it goes, so an interrupted run loses nothing
      if (have % (n > 7 ? 5 : 10) === 0) console.log(`${n}x${n}: ${have}/${want} (${tries} fills tried, ${Math.round((Date.now() - t0) / 1000)}s)`);
    }
  }
  savePuzzles(out);
  const counts = [...usage.values()], entries = counts.reduce((a, b) => a + b, 0);
  console.log(`${out.length} puzzles, ${entries} entries, ${usage.size} different words, most-used word appears ${Math.max(...counts)} times, ${shapes.size} different grid shapes`);
}

function need() {
  const clued = cluedWords();
  const missing = [...new Set(lines('puzzles.txt').map(parsePuzzle).flatMap(wordsIn))].filter(w => !clued.has(w)).sort();
  fs.writeFileSync(at('need.txt'), missing.join('\n') + (missing.length ? '\n' : ''));
  console.log(`${missing.length} words used in puzzles still need clues -> data/need.txt`);
}

function pack() {
  const clues = cluedWords(), puzzles = lines('puzzles.txt').map(parsePuzzle), problems = [];
  for (const p of puzzles) {
    const ws = wordsIn(p), seen = new Map(); // one map for both levels: Medium shows a mix, so no text may appear twice in a puzzle
    if (new Set(ws).size !== ws.length) problems.push(`puzzle ${p.id}: repeated answer`);
    for (const w of ws) {
      const c = clues.get(w);
      if (!c) { problems.push(`puzzle ${p.id}: no easy+hard clue for ${w}`); continue; }
      for (const t of c) if (norm(t.toUpperCase().replace(/\s*\(\d+\)$/, '')).includes(w)) problems.push(`puzzle ${p.id}: a clue for ${w} contains the answer: "${t}"`);
      for (const t of new Set(c)) { if (seen.has(t)) problems.push(`puzzle ${p.id}: ${seen.get(t)} and ${w} share the clue "${t}"`); seen.set(t, w); }
    }
  }
  if (problems.length) { console.log(problems.join('\n')); throw new Error(`${problems.length} problems; nothing written`); }
  for (const n of new Set(puzzles.map(p => p.n))) {
    const set = puzzles.filter(p => p.n === n), ws = [...new Set(set.flatMap(wordsIn))].sort();
    const json = JSON.stringify({ size: n, puzzles: set.map(p => [p.id, p.grid]), clues: Object.fromEntries(ws.map(w => [w, clues.get(w)])) });
    fs.writeFileSync(at(`puzzles-${n}.json`), json);
    console.log(`${path.relative(__dirname, at(`puzzles-${n}.json`))}: ${set.length} puzzles, ${ws.length} clued words, ${Math.round(json.length / 1024)} KB`);
  }
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'generate') generate(process.argv.includes('--clued'));
  else if (cmd === 'need') need();
  else if (cmd === 'pack') pack();
  else console.log('usage: node build.js generate [--clued] | need | pack');
}
module.exports = { slotsOf, validPattern, parsePuzzle, wordsIn, shape, related, relatedEn, relatedHe, cluedWords, norm, LANGUAGE };

#!/usr/bin/env node
// Offline puzzle factory for index.html.
//   node build.js generate [--clued]   data/words.txt -> data/puzzles.txt (tops up to the PLAN; --clued uses only words that have clues)
//   node build.js need                 lists words used in puzzles that have no clue yet -> data/need.txt
//   node build.js pack                 data/clues.txt + data/puzzles.txt -> data/puzzles-N.json, the files index.html downloads
//   node build.js batches|review|dupes [DIR]   batch files for the clues workflow (.claude/workflows/clues.js): new words,
//                                      a re-check of every used clue, or clues shared by two words (dupes exits 1 if any)
//   node build.js merge OUTPUT...      applies saved clues-workflow output to clues.txt, readings.txt and reject.txt
// Deterministic: each new puzzle is drawn from a random generator seeded by SEED (default "<language>-<level>"), its size and
// its number, so the same seed and input files give the same puzzles, also when a run is stopped and topped up later.
// Only a run stopped by the MINUTES safety net is not reproducible (MAX_FILLS, the per-puzzle limit, is).
// Language: DATA_DIR=data/he (or GRID_LANG=he) builds the Hebrew edition from data/he/; the default is English in data/.
// Levels: GRID_LEVEL=medium or hard builds that level's own puzzles (default easy). Easy uses words.txt; medium adds
// words-medium.txt; hard adds words-hard.txt too and tries the rarer tiers first. Each level is generated on its own.
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
const LEVEL = process.env.GRID_LEVEL || 'easy', LEVELS = ['easy', 'medium', 'hard'];
if (!LEVELS.includes(LEVEL)) throw new Error(`unknown GRID_LEVEL "${LEVEL}" (use easy, medium or hard)`);
const MAX_USES = +process.env.MAX_USES || 12; // no word appears in more puzzles than this across the archive
const PLAN = process.env.PLAN ? process.env.PLAN.split(',').map(s => s.split(':').map(Number)) : L.sizes; // [size, how many]; PLAN=15:3 tops up only that size, other puzzles are kept
const lines = f => fs.existsSync(at(f)) ? fs.readFileSync(at(f), 'utf8').split('\n').map(s => s.trim()).filter(Boolean) : [];
// Seeded random numbers (mulberry32). generate re-seeds for every new puzzle from SEED, the size and the puzzle's number, so a
// puzzle depends only on SEED, the input files and the puzzles before it: one long run and a run stopped and topped up agree.
const SEED = process.env.SEED || `${LANGUAGE}-${LEVEL}`;
let h = 0;
const reseed = key => { h = 1779033703; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 3432918353) >>> 0; };
const random = () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = n => Math.floor(random() * n);
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
// Word mix for harder levels. Each answer slot is given a target tier (0 everyday, 1 medium, 2 hard) drawn from WEIGHTS,
// and words of that tier are tried first. A finished grid is kept only if it meets MIN: harder puzzles still carry
// a good share of everyday words, and enough rare ones to be harder.
const MIX = {
  easy: { weights: [1, 0, 0], min: [0, 0, 0] },
  medium: { weights: [0.55, 0.45, 0], min: [0.35, 0.2, 0] },
  hard: { weights: [0.35, 0.35, 0.3], min: [0.25, 0, 0.15] },
};
let tierOf = () => 0;
const pickTier = () => { let r = random(); const w = MIX[LEVEL].weights; for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i; return 0; };
const mixOk = words => { const c = [0, 0, 0]; for (const w of words) c[tierOf(w)]++; return MIX[LEVEL].min.every((m, i) => c[i] >= m * words.length); };
function fill(n, slots, usage, maxNodes) {
  const want = slots.map(pickTier); // target tier per slot
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
      .map(w => [(usage.get(w) || 0) + (tierOf(w) === want[best] ? 0 : 1.2) + random(), w]).sort((a, b) => a[0] - b[0]).slice(0, 14) // least used, target tier first
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
const parsePuzzle = line => { const [id, n, grid, level = 'easy'] = line.split('|'); return { id: +id, n: +n, grid, level }; };
const wordsIn = p => slotsOf([...p.grid].map(ch => ch === '#'), p.n).map(s => s.cells.map(c => p.grid[c]).join(''));
const shape = grid => grid.replace(/[^#]/g, '.');

// A word counts as clued only when its line has both an easy and a hard clue.
const cluedWords = () => new Map(lines('clues.txt').map(l => l.split('|').map(s => s.trim())).filter(f => f.length === 3 && f.every(Boolean) && f[1] !== f[2]).map(([w, c, h]) => [norm(w), [c, h]]));
const savePuzzles = ps => fs.writeFileSync(at('puzzles.txt'), [...ps].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.n - b.n || a.id - b.id)
  .map(p => `${p.id}|${p.n}|${p.grid}${p.level === 'easy' ? '' : '|' + p.level}`).join('\n') + '\n');

function generate(onlyClued) {
  const reject = new Set(lines('reject.txt').map(norm)), clued = cluedWords();
  const tier = new Map(); // word -> 0 everyday, 1 medium, 2 hard
  ['words.txt', 'words-medium.txt', 'words-hard.txt'].slice(0, LEVELS.indexOf(LEVEL) + 1).forEach((f, i) => { for (const w of lines(f).map(norm)) if (!tier.has(w)) tier.set(w, i); });
  const allowed = new Set([...tier.keys()].filter(w => L.letters.test(w) && !reject.has(w)));
  tierOf = w => tier.get(w) ?? 0;
  const vocab = new Set([...allowed].filter(w => !onlyClued || clued.has(w)));
  indexWords([...vocab]);
  console.log(`vocabulary: ${vocab.size} words`, Object.fromEntries(Object.entries(IDX).map(([l, ix]) => [l, ix.ws.length])));
  // Existing puzzles keep their ids (solvers' browsers remember ids). A puzzle is kept unless it uses a word that is no longer allowed.
  const all = lines('puzzles.txt').map(parsePuzzle), others = all.filter(p => p.level !== LEVEL), old = all.filter(p => p.level === LEVEL), seenUses = new Map();
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
  let nextId = Math.max(0, ...all.map(p => p.id)) + 1;
  const record = p => { for (const w of wordsIn(p)) usage.set(w, (usage.get(w) || 0) + 1); shapes.set(shape(p.grid), (shapes.get(shape(p.grid)) || 0) + 1); out.push(p); };
  keep.forEach(record); // every kept puzzle stays, whatever the PLAN says
  const DEAD = 40; // a shape that failed this many fills is treated as used up
  const MAX_FILLS = +process.env.MAX_FILLS || 50000; // fills tried for one puzzle before giving up: a deterministic limit
  for (const [n, want] of PLAN) {
    const t0 = Date.now(); let have = out.filter(p => p.n === n).length, tries = 0, puzzle = -1, failed, repeats, skipped, fills;
    // shortcut: MINUTES is a wall-clock safety net; a run it stops is not reproducible (MAX_FILLS is), so keep it generous.
    const limit = (+process.env.MINUTES || (n > 7 ? 90 : 10)) * 60000;
    const stop = why => { savePuzzles([...others, ...out]); console.error(`${n}x${n}: stopped (${why}) after ${tries} fills with ${have}/${want} puzzles (saved). Add words or loosen the pattern rules for this size.`); process.exitCode = 1; };
    while (have < want) {
      if (puzzle !== have) { puzzle = have; reseed(`${SEED}|${n}|${have}`); failed = new Map(); repeats = 0; skipped = 0; fills = 0; } // a fresh start for each puzzle
      if (fills >= MAX_FILLS) { stop(`${MAX_FILLS} fills for one puzzle`); break; }
      if (Date.now() - t0 > limit) { stop(`${Math.round(limit / 60000)} minutes`); break; }
      const pat = pattern(n); if (!pat) continue;
      const sh = pat.blk.map(b => b ? '#' : '.').join('');
      // A shape repeats only after 300 patterns in a row were already used or dead (small sizes run out of shapes).
      if ((shapes.get(sh) || 0) > repeats || (failed.get(sh) || 0) >= DEAD * (repeats + 1)) { if (++skipped > 300) { repeats++; skipped = 0; } continue; }
      tries++; fills++; skipped = 0;
      const res = fill(n, pat.slots, usage, n > 7 ? 6000 : 800);
      if (!res) { failed.set(sh, (failed.get(sh) || 0) + 1); continue; }
      if (!mixOk(res.words)) continue; // wrong word mix for this level: try another fill (the shape is not to blame)
      skipped = 0;
      record({ id: nextId++, n, level: LEVEL, grid: res.L.map((ch, i) => pat.blk[i] ? '#' : ch).join('') }); have++;
      savePuzzles([...others, ...out]); // written as it goes, so an interrupted run loses nothing
      if (have % (n > 7 ? 5 : 10) === 0) console.log(`${n}x${n}: ${have}/${want} (${tries} fills tried, ${Math.round((Date.now() - t0) / 1000)}s)`);
    }
  }
  savePuzzles([...others, ...out]);
  const counts = [...usage.values()], entries = counts.reduce((a, b) => a + b, 0);
  const tiers = [0, 0, 0]; for (const [w, c] of usage) tiers[tier.get(w) ?? 0] += c;
  console.log(`${LEVEL}: answers by tier everyday/medium/hard = ${tiers.join('/')}`);
  console.log(`${LEVEL}: ${out.length} puzzles, ${entries} entries, ${usage.size} different words, most-used word appears ${Math.max(...counts)} times, ${shapes.size} different grid shapes`);
}

function need() {
  const clued = cluedWords();
  const missing = [...new Set(lines('puzzles.txt').map(parsePuzzle).flatMap(wordsIn))].filter(w => !clued.has(w)).sort();
  fs.writeFileSync(at('need.txt'), missing.join('\n') + (missing.length ? '\n' : ''));
  console.log(`${missing.length} words used in puzzles still need clues -> data/need.txt`);
}

// ---------- clue writing and review (the Claude Code workflows in .claude/workflows/ do the writing; these prepare and merge) ----------
const usedWords = () => new Set(lines('puzzles.txt').map(parsePuzzle).flatMap(wordsIn));
const readingsOf = () => new Map(lines('readings.txt').map(l => [l.slice(0, l.indexOf('|')), l.slice(l.indexOf('|') + 1)]));
function writeBatches(dir, mode, rows, size) {
  const prefix = { new: 'n', review: 'r', dedupe: 'd' }[mode];
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith(prefix + '_')) fs.unlinkSync(path.join(dir, f)); // no stale batch from an older run
  const count = Math.ceil(rows.length / size);
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(dir, `${prefix}_${String(i + 1).padStart(2, '0')}.txt`), rows.slice(i * size, (i + 1) * size).join('\n') + '\n');
  console.log(`${rows.length} lines in ${count} batches -> ${dir}`);
  if (count) console.log(`run the clues workflow (.claude/workflows/clues.js) with args: ${JSON.stringify({ mode, dir: path.resolve(dir), count, lang: LANGUAGE })}`);
}
// `batches DIR`: the words in need.txt with their spelling, English gloss and vocabulary tier, for the clues workflow, mode new.
function batches(dir) {
  const missing = lines('need.txt'), tier = new Map(), gloss = new Map();
  [['words-medium.txt', 'medium'], ['words-hard.txt', 'hard']].forEach(([f, t]) => lines(f).forEach(w => tier.set(norm(w), t)));
  for (const l of lines('glosses.txt')) { const i = l.indexOf('|'); gloss.set(norm(l.slice(0, i)), [l.slice(0, i), l.slice(i + 1)]); }
  writeBatches(dir, 'new', missing.map(w => { const [spelt, g] = gloss.get(w) || [w, '']; return `${w}|${spelt}|${g}|${tier.get(w) || 'everyday'}`; }), 80);
}
// `review DIR`: every clued word used in a puzzle, for the clues workflow, mode review.
function review(dir) {
  const clues = cluedWords(), readings = readingsOf();
  const rows = [...usedWords()].sort().filter(w => clues.has(w)).map(w => LANGUAGE === 'he' ? `${w} | ${readings.get(w) || ''} | ${clues.get(w).join(' | ')}` : `${w} | ${clues.get(w).join(' | ')}`);
  writeBatches(dir, 'review', rows, 100);
}
// Clue texts shared by two used words. Within one puzzle that is a pack error; across the archive it makes a clue ambiguous.
function sharedClues() {
  const clues = cluedWords(), used = usedWords(), by = new Map();
  for (const w of [...used].sort()) for (const [k, t] of (clues.get(w) || []).entries()) { const key = norm(t.toUpperCase()); if (!by.has(key)) by.set(key, []); by.get(key).push([w, k ? 'hard' : 'easy']); }
  return [...by.values()].filter(a => a.length > 1);
}
// `dupes DIR`: one line per clue to rewrite (all but the first word of each shared text), for the clues workflow, mode dedupe.
function dupes(dir) {
  const clues = cluedWords(), readings = readingsOf(), shared = sharedClues();
  const rows = shared.flatMap(a => a.slice(1).map(([w, field]) => `${w} | ${readings.get(w) || ''} | ${field} | easy: ${clues.get(w)[0]} | hard: ${clues.get(w)[1]} | shared with: ${a[0][0]}`));
  writeBatches(dir, 'dedupe', rows, 40);
}
// `merge FILE...`: apply saved workflow results (the clues workflow in any mode) to clues.txt, readings.txt and reject.txt.
// A merged clue never keeps a trailing letter count and never contains the field separator.
function merge(files) {
  const clean = s => String(s || '').replace(/\|/g, '/').replace(/\s*\(\d+\)\s*$/, '').trim();
  const bank = new Map(lines('clues.txt').map(l => { const f = l.split('|'); return [norm(f[0]), [f[1] || '', f[2] || '']]; }));
  const readings = readingsOf(), reject = new Set(lines('reject.txt').map(norm)), missing = new Set(lines('need.txt'));
  const stat = { added: 0, changed: 0, rejected: 0, skipped: [] };
  const set = (w, field, text) => { const c = bank.get(w), t = clean(text); if (!c || !t) return stat.skipped.push(w); c[field === 'hard' ? 1 : 0] = t; stat.changed++; };
  for (const file of files) {
    let res = JSON.parse(fs.readFileSync(file, 'utf8')); if (res && !Array.isArray(res)) res = res.result; // a workflow's saved output wraps the return value
    if (!Array.isArray(res)) throw new Error(`${file}: no workflow result array`);
    for (const b of res.filter(Boolean)) {
      const passed = new Set(); // new words this batch did not add: its adjudicator's changes for them are skipped too
      for (const e of b.entries || []) { // only words that still need clues, so merging an output twice never overwrites reviewed clues
        const w = norm(e.grid), had = bank.get(w);
        if (!missing.has(w) || (had && had[0] && had[1])) { stat.skipped.push(w); passed.add(w); continue; }
        bank.set(w, [clean(e.easy), clean(e.hard)]); if (e.reading) readings.set(w, clean(e.reading)); stat.added++;
      }
      for (const c of b.changes || []) { const w = norm(c.answer); if (passed.has(w)) continue; if (c.easy) set(w, 'easy', c.easy); if (c.hard) set(w, 'hard', c.hard); }
      const fixed = new Map((b.fixes || []).map(f => [norm(f.grid) + f.field, f.clue]));
      for (const c of b.clues || []) { const w = norm(c.grid); set(w, c.field, fixed.get(w + c.field) || c.clue); }
      for (const r of [...(b.reject || []), ...(b.writerReject || [])]) { const w = norm(r.answer || r.grid); reject.add(w); stat.rejected++; } // the clue stays in clues.txt, so un-rejecting a word is one line in reject.txt
    }
  }
  const bad = [...bank].filter(([, [e, h]]) => e && h && e === h).map(([w]) => w);
  if (bad.length) console.warn(`easy and hard clue are the same (not counted as clued): ${bad.join(' ')}`);
  const byWord = ([a], [b]) => a < b ? -1 : a > b ? 1 : 0; // sorted by answer, so a merge only shows the lines it changed
  fs.writeFileSync(at('clues.txt'), [...bank].sort(byWord).map(([w, [e, h]]) => `${w}|${e}|${h}`).join('\n') + '\n');
  if (readings.size) fs.writeFileSync(at('readings.txt'), [...readings].sort(byWord).map(([w, r]) => `${w}|${r}`).join('\n') + '\n');
  fs.writeFileSync(at('reject.txt'), [...reject].sort().join('\n') + '\n');
  console.log(`merged: ${stat.added} new words, ${stat.changed} clues changed, ${stat.rejected} words rejected${stat.skipped.length ? `, ${stat.skipped.length} skipped (${[...new Set(stat.skipped)].slice(0, 20).join(' ')})` : ''}`);
  need(); // need.txt now lists only what is still missing, so the next batches never re-send a merged word
  console.log('next: node build.js generate --clued for every level that has puzzles (replaces puzzles that use rejected words), then dupes, pack');
}

function pack() {
  const clues = cluedWords(), puzzles = lines('puzzles.txt').map(parsePuzzle), problems = [], reject = new Set(lines('reject.txt').map(norm));
  for (const p of puzzles) {
    const ws = wordsIn(p), seen = new Map(); // one map for both levels: Medium shows a mix, so no text may appear twice in a puzzle
    if (new Set(ws).size !== ws.length) problems.push(`puzzle ${p.id}: repeated answer`);
    for (const w of ws) {
      const c = clues.get(w);
      if (reject.has(w)) problems.push(`puzzle ${p.id} (${p.level}): uses the rejected word ${w} (GRID_LEVEL=${p.level} node build.js generate --clued)`);
      if (!c) { problems.push(`puzzle ${p.id}: no easy+hard clue for ${w}`); continue; }
      for (const t of c) if (norm(t.toUpperCase().replace(/\s*\(\d+\)$/, '')).includes(w)) problems.push(`puzzle ${p.id}: a clue for ${w} contains the answer: "${t}"`);
      for (const t of new Set(c)) { if (seen.has(t)) problems.push(`puzzle ${p.id}: ${seen.get(t)} and ${w} share the clue "${t}"`); seen.set(t, w); }
    }
  }
  if (problems.length) { console.log(problems.join('\n')); throw new Error(`${problems.length} problems; nothing written`); }
  for (const level of LEVELS) for (const n of new Set(puzzles.map(p => p.n))) {
    const set = puzzles.filter(p => p.n === n && p.level === level); if (!set.length) continue;
    const ws = [...new Set(set.flatMap(wordsIn))].sort(), file = `puzzles-${n}${level === 'easy' ? '' : '-' + level}.json`;
    const json = JSON.stringify({ size: n, level, puzzles: set.map(p => [p.id, p.grid]), clues: Object.fromEntries(ws.map(w => [w, clues.get(w)])) });
    fs.writeFileSync(at(file), json);
    console.log(`${path.relative(__dirname, at(file))}: ${set.length} puzzles, ${ws.length} clued words, ${Math.round(json.length / 1024)} KB`);
  }
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'generate') generate(process.argv.includes('--clued'));
  else if (cmd === 'need') need();
  else if (cmd === 'pack') pack();
  else if (cmd === 'batches') batches(process.argv[3] || at('batches'));
  else if (cmd === 'review') review(process.argv[3] || at('review'));
  else if (cmd === 'dupes') { const n = sharedClues().length; dupes(process.argv[3] || at('dupes')); if (n) process.exitCode = 1; }
  else if (cmd === 'merge' && process.argv.length > 3) merge(process.argv.slice(3));
  else console.log('usage: node build.js generate [--clued] | need | batches [DIR] | review [DIR] | dupes [DIR] | merge RESULT.json... | pack');
}
module.exports = { LEVELS, slotsOf, validPattern, parsePuzzle, wordsIn, shape, related, relatedEn, relatedHe, cluedWords, sharedClues, norm, LANGUAGE };

// Self-check for the puzzle datasets as public/index.html reads them.
// Run: node test.js (English, data/)  or  DATA_DIR=data/he node test.js (Hebrew).
const fs = require('fs'), assert = require('assert'), path = require('path');
const { validPattern, related, norm } = require('./build.js'); // build.js reads DATA_DIR too, so norm folds for this language
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const LANG = path.basename(path.resolve(DATA)) === 'he' ? 'he' : 'en', SIZES = LANG === 'he' ? [5, 7, 13] : [5, 7, 15];
const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const eng = html.slice(html.indexOf('// ENGINE START'), html.indexOf('// ENGINE END'));
const api = new Function(eng + '; return { loadSet, buildPuzzle };')();
const PUZZLES = SIZES.flatMap(n => {
  const data = JSON.parse(fs.readFileSync(path.join(DATA, `puzzles-${n}.json`), 'utf8'));
  assert.strictEqual(data.size, n, `puzzles-${n}.json says size ${data.size}`);
  // each file must carry the clues for its own answers: the page may load only this one
  for (const [id, grid] of data.puzzles) for (const s of require('./build.js').slotsOf([...grid].map(ch => ch === '#'), n)) {
    const w = s.cells.map(c => grid[c]).join('');
    assert(Array.isArray(data.clues[w]) && data.clues[w].length === 2, `puzzles-${n}.json, puzzle ${id}: no clues for ${w} in this file`);
  }
  return api.loadSet(data, LANG);
});

const bySize = {}, usage = new Map(), shapes = new Set();
for (const raw of PUZZLES) {
  const p = api.buildPuzzle(raw), n = p.n, where = `puzzle ${p.id} (${n}x${n})`;
  (bySize[n] ||= []).push(p);
  const blk = p.sol.map(v => v === null);
  assert(validPattern(blk, n), `${where}: an entry under 3 letters, or the grid is not connected`);
  blk.forEach((b, i) => assert.strictEqual(b, blk[n * n - 1 - i], `${where}: not symmetric`));
  shapes.add(n + raw.grid.replace(/[^#]/g, '.'));
  const all = [...p.clues.A, ...p.clues.D], answers = all.map(c => c.answer);
  assert.strictEqual(new Set(answers).size, answers.length, `${where}: repeated answer`);
  const texts = all.flatMap(c => [...new Set([c.clue, c.hard])]); // Medium mixes both levels, so no clue text may appear twice in a puzzle
  assert.strictEqual(new Set(texts).size, texts.length, `${where}: the same clue text twice`);
  for (const c of all) {
    assert(c.clue && c.hard && c.clue !== c.hard, `${where}: ${c.answer} needs separate easy and hard clues`);
    for (const k of ['clue', 'hard']) assert(!norm(c[k].toUpperCase()).includes(c.answer), `${where}: ${k} for ${c.answer} contains the answer`);
    usage.set(c.answer, (usage.get(c.answer) || 0) + 1);
  }
  for (let i = 0; i < answers.length; i++) for (let j = i + 1; j < answers.length; j++) assert(!related(answers[i], answers[j]), `${where}: ${answers[i]} and ${answers[j]} are too alike`);
  p.sol.forEach((v, i) => { if (v !== null) assert(['A', 'D'].every(d => p.clues[d].some(c => c.cells.includes(i))), `${where}: unchecked square`); });
}
const want = +process.env.EXPECT || 100;
for (const n of SIZES) assert.strictEqual((bySize[n] || []).length, want, `expected ${want} puzzles of size ${n}`);
const entries = [...usage.values()].reduce((a, b) => a + b, 0);
console.log(`${PUZZLES.length} puzzles ok: ${entries} entries, ${usage.size} different words, ${shapes.size} grid shapes, most-used word ${Math.max(...usage.values())} times`);

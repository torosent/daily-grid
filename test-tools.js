// Self-check for the puzzle tools (not the datasets): node test-tools.js
// 1. generate is deterministic: the same SEED and inputs give the same puzzles, another SEED gives others.
// 2. merge applies all three kinds of clues-workflow output and never writes a letter count or a field separator.
// 3. the clues workflow runs in every mode (with stand-in agents) and returns what merge expects.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), { execFileSync } = require('child_process');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'grid-'));
const build = (dir, args, env = {}) => execFileSync('node', [path.join(__dirname, 'build.js'), ...args], { env: { ...process.env, DATA_DIR: dir, GRID_LANG: 'en', ...env }, encoding: 'utf8', stdio: 'pipe' });

// 1. determinism
const gen = (seed, ...plans) => { const d = tmp(); fs.copyFileSync(path.join(__dirname, 'data', 'words.txt'), path.join(d, 'words.txt')); for (const PLAN of plans) build(d, ['generate'], { PLAN, SEED: seed }); return fs.readFileSync(path.join(d, 'puzzles.txt'), 'utf8'); };
const a = gen('x', '5:6'), b = gen('x', '5:6'), c = gen('y', '5:6'), split = gen('x', '5:3', '5:6');
assert.strictEqual(a.trim().split('\n').length, 6, 'expected 6 puzzles');
assert.strictEqual(a, b, 'same SEED gave different puzzles');
assert.strictEqual(a, split, 'a run stopped at 3 and topped up to 6 differs from one run to 6');
assert.notStrictEqual(a, c, 'different SEEDs gave the same puzzles');

// 2. merge
const d = tmp(), w = (f, s) => fs.writeFileSync(path.join(d, f), s), r = f => fs.readFileSync(path.join(d, f), 'utf8');
w('clues.txt', 'CAT|Feline|Mouser\nDOG|Canine|Barker\n'); w('need.txt', 'EMU\nOWL\nGNU\n'); w('reject.txt', '');
w('new.json', JSON.stringify({ result: [{ batch: 1, entries: [{ grid: 'EMU', reading: 'bird', easy: 'Big bird', hard: 'Outback runner (3)' }, { grid: 'OWL', reading: 'bird', easy: 'Night bird', hard: 'Hooter|?' }, { grid: 'CAT', reading: '', easy: 'overwrite?', hard: 'no' }],
  writerReject: [{ grid: 'GNU', reason: 'test' }], changes: [{ answer: 'OWL', easy: 'Wise bird', hard: '', why: '' }], reject: [] }] }));
w('dedupe.json', JSON.stringify([{ batch: 1, clues: [{ grid: 'DOG', field: 'hard', clue: 'Woofer' }, { grid: 'CAT', field: 'easy', clue: 'Kitty' }], fixes: [{ grid: 'CAT', field: 'easy', clue: 'Tabby', reason: '' }] }]));
build(d, ['merge', path.join(d, 'new.json'), path.join(d, 'dedupe.json')]);
assert.deepStrictEqual(r('clues.txt').trim().split('\n'), ['CAT|Tabby|Mouser', 'DOG|Canine|Woofer', 'EMU|Big bird|Outback runner', 'OWL|Wise bird|Hooter/?']);
assert.deepStrictEqual(r('reject.txt').trim().split('\n'), ['GNU']);
assert.strictEqual(r('need.txt'), '', 'merge rewrites need.txt'); // this temp dir has no puzzles, so nothing is needed
// Merging the same new-words output again (need.txt stale on purpose) must not undo the dedupe fix or apply its changes again.
w('need.txt', 'EMU\nOWL\n'); build(d, ['merge', path.join(d, 'new.json')]);
assert.deepStrictEqual(r('clues.txt').trim().split('\n'), ['CAT|Tabby|Mouser', 'DOG|Canine|Woofer', 'EMU|Big bird|Outback runner', 'OWL|Wise bird|Hooter/?']);
// pack refuses a puzzle with a rejected word, whatever its level
const p = tmp(), grid = gen('x', '5:1').trim().split('|')[2], words = require('./build.js').wordsIn({ n: 5, grid });
fs.writeFileSync(path.join(p, 'puzzles.txt'), `1|5|${grid}|hard\n`);
fs.writeFileSync(path.join(p, 'clues.txt'), words.map((x, i) => `${x}|easy ${i}|hard ${i}`).join('\n') + '\n');
fs.writeFileSync(path.join(p, 'reject.txt'), words[0] + '\n');
assert.throws(() => build(p, ['pack']), e => /uses the rejected word/.test(e.stdout), 'pack must refuse a rejected word');
fs.writeFileSync(path.join(p, 'reject.txt'), ''); build(p, ['pack']); // and packs once the word is allowed again

// 3. the workflow, with stand-in agents
const src = fs.readFileSync(path.join(__dirname, '.claude', 'workflows', 'clues.js'), 'utf8').replace('export const meta', 'const meta');
const pipeline = (items, ...stages) => Promise.all(items.map(async (it, i) => { let v = it; for (const [k, s] of stages.entries()) { if (k && v == null) return null; v = await s(k ? v : it, it, i); } return v; }));
const parallel = ts => Promise.all(ts.map(t => t()));
let dead = ''; // label prefix of an agent that dies (returns null), as agent() does after a terminal error
const agent = async (prompt, o) => o.label.startsWith(dead || '\0') ? null : ({
  write: { entries: [{ grid: 'EMU', reading: 'bird', easy: 'Big bird', hard: 'Runner' }], reject: [] },
  meaning: { issues: [{ answer: 'EMU', field: 'easy', problem: 'vague', fix: 'Flightless bird' }] }, solver: { issues: [] },
  adjudicate: { changes: [{ answer: 'EMU', easy: 'Flightless bird', hard: '', why: '' }], reject: [] },
  rewrite: { clues: [{ grid: 'EMU', field: 'hard', clue: 'Outback runner' }] }, check: { fixes: [] },
})[o.label.split(':')[0]];
const run = args => new Function('args', 'pipeline', 'parallel', 'agent', 'log', `return (async () => { ${src} })()`)(args, pipeline, parallel, agent, () => {});
(async () => {
  const out = {};
  for (const mode of ['new', 'review', 'dedupe']) { out[mode] = await run({ mode, dir: '/x', count: 2, lang: 'en' }); assert.strictEqual(out[mode].length, 2, `${mode}: one result per batch`); }
  assert.deepStrictEqual(out.new[0].changes[0].easy, 'Flightless bird'); assert(out.new[0].entries.length === 1);
  assert.deepStrictEqual(out.review[0].changes[0].answer, 'EMU');
  assert.deepStrictEqual(out.dedupe[0].clues[0].clue, 'Outback runner');
  await assert.rejects(run({ mode: 'oops', dir: '/x', count: 1, lang: 'en' }), /mode/);
  for (const [mode, who] of [['new', 'solver'], ['review', 'meaning'], ['dedupe', 'check']]) { // a dead checker drops the batch
    dead = who; assert.strictEqual((await run({ mode, dir: '/x', count: 2, lang: 'en' })).length, 0, `${mode}: batch with a dead ${who} must be dropped`);
  }
  dead = '';
  console.log('tools ok: deterministic generate, merge, clues workflow in all three modes');
})().catch(e => { console.error(e); process.exit(1); });

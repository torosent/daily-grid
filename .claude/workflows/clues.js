export const meta = {
  name: 'clues',
  description: 'Write, review or dedupe crossword clues in batches: every batch goes through independent checkers before anything is returned',
  whenToUse: 'Pass the args line that `node build.js batches|review|dupes` prints: {mode, dir, count, lang}. mode "new" writes clues for new words (writer, two validators, adjudicator); "review" re-checks existing clues (two validators, adjudicator); "dedupe" rewrites clues that share a text with another word (writer, checker). Save the workflow output, then `node build.js merge <output file>`.',
  phases: [
    { title: 'Write', detail: 'new: one writer per batch; dedupe: one rewriter per batch' },
    { title: 'Validate', detail: 'meaning and solver lenses per batch' },
    { title: 'Adjudicate', detail: 'final decision per batch' },
  ],
}
// The clue conventions for both editions live here only (a workflow script cannot read files).
const HE = `"התשבץ היומי" is a Hebrew crossword for adult Israeli solvers (5x5, 7x7, 13x13, American-style grids).
- Answers are dictionary forms (noun singular, adjective masculine singular, verb 3rd person masculine singular past) in Academy of the Hebrew Language 2017 full spelling. The grid stores final letters as regular letters (אבנ = אבן), so each word is given in grid form and normal spelling.
- Clues are unpointed Hebrew (one niqqud mark only if needed against a wrong reading), no Latin letters, gender-neutral impersonal phrasing, never addressing the solver.
- EASY (קל): a precise plain definition in newspaper-crossword style, 1 to 7 words, no letter count.
- HARD (קשה): genuinely tricky, in the spirit of the Israeli logic crossword (תשבץ היגיון): misdirection, a double meaning, a pun on a second sense, an idiom or expression the answer completes, a playful indirect description, a split reading where natural (של+חן). A wordplay clue ends with "?". At least two thirds of the hard clues in a batch are real wordplay or misdirection, not plain synonyms. Fair and single-answer. 2 to 9 words. Clearly different in meaning from the easy clue. NEVER a letter count such as "(5)". Markers (ל) foreign word, (ס) slang, (כ"מ) full spelling are allowed where they apply.
- Agreement: both clues match the answer in part of speech, gender, number and definiteness. Unpointed Hebrew is ambiguous (ספר = sefer/sapar/safar): choose ONE reading (the gloss hints at the intended sense), clue that reading, and record it.
- Never put the answer, a word from its three-letter root (שורש), or an obvious part of it inside a clue (מכתב must not be clued with כתב/כתיבה).
- Avoid generic one-word clues that many answers could share.
- A word is unfit if it is not a real dictionary-form word in 2017 spelling, a proper noun, offensive, or a prefixed (ה ו ב ל מ ש כ) or inflected form.`
const EN = `"The Daily Grid" is an American-style English crossword (5x5, 7x7, 15x15).
- EASY: a plain accurate definition, Monday level, 1 to 7 words.
- HARD: Friday/Saturday level: a less obvious sense, misdirection or wordplay (a wordplay clue ends with "?"), clearly different in meaning from the easy clue, fair and single-answer, 2 to 9 words.
- Both match the answer's part of speech, tense and number; no trailing period except "e.g."; fill-in-the-blank uses ___; no letter count.
- Never put the answer, a word from its root, or an obvious part of it inside a clue.
- Avoid generic one-word clues that many answers could share.
- A word is unfit if it is not a real word or a standard crossword entry, a proper noun nobody knows, offensive, or an odd inflection.`
const CONV = args.lang === 'he' ? HE : EN
const WRITE = { type: 'object', properties: {
  entries: { type: 'array', items: { type: 'object', properties: {
    grid: { type: 'string', description: 'the grid form exactly as given (first field)' },
    reading: { type: 'string', description: 'Hebrew: the clued reading with niqqud plus a short English gloss, e.g. "סֵפֶר book". English: a short gloss of the sense clued' },
    easy: { type: 'string' }, hard: { type: 'string' } }, required: ['grid', 'reading', 'easy', 'hard'] } },
  reject: { type: 'array', items: { type: 'object', properties: { grid: { type: 'string' }, reason: { type: 'string' } }, required: ['grid', 'reason'] } } },
  required: ['entries', 'reject'] }
const FIND = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: {
  answer: { type: 'string', description: 'the grid form, exactly' },
  field: { type: 'string', enum: ['word', 'easy', 'hard'] },
  problem: { type: 'string' },
  fix: { type: 'string', description: 'replacement clue, or empty when the word itself is unfit' } }, required: ['answer', 'field', 'problem', 'fix'] } } }, required: ['issues'] }
const FINAL = { type: 'object', properties: {
  changes: { type: 'array', items: { type: 'object', properties: { answer: { type: 'string' }, easy: { type: 'string', description: 'new easy clue or empty' }, hard: { type: 'string', description: 'new hard clue or empty' }, why: { type: 'string' } }, required: ['answer', 'easy', 'hard', 'why'] } },
  reject: { type: 'array', description: 'ONLY words that must be removed from the puzzles. Issues dropped as not real problems go NOWHERE, not here.', items: { type: 'object', properties: { answer: { type: 'string' }, why: { type: 'string' } }, required: ['answer', 'why'] } } },
  required: ['changes', 'reject'] }
const LENS = {
  meaning: 'Lens: MEANING AND LANGUAGE. For every line: is the answer a real word that fits the conventions? Is the EASY clue an accurate definition of the recorded reading, agreeing in part of speech, gender, number, tense and definiteness? Is the HARD clue correct (the wordplay really works; facts, quotes and idioms accurate)? Is the language natural and correctly spelled?',
  solver: 'Lens: THE SOLVER. For every line, as a solver: does each clue point to this answer and not equally well to another common word of the same length? Does a clue give the answer away (contains it, its root, a derived form)? Is the EASY clue really a plain definition? Is the HARD clue genuinely harder, different from the easy one, fair, and free of a letter count? Is anything offensive or confusing?',
}
const RULES = 'Report only real problems you are sure of; do not restyle clues that are fine. For each problem give the corrected clue, or flag the word itself (field "word", empty fix) only when the word is unfit.'
const REWRITE = { type: 'object', properties: { clues: { type: 'array', items: { type: 'object', properties: { grid: { type: 'string' }, field: { type: 'string', enum: ['easy', 'hard'] }, clue: { type: 'string' } }, required: ['grid', 'field', 'clue'] } } }, required: ['clues'] }
const FIX = { type: 'object', properties: { fixes: { type: 'array', items: { type: 'object', properties: { grid: { type: 'string' }, field: { type: 'string', enum: ['easy', 'hard'] }, clue: { type: 'string' }, reason: { type: 'string' } }, required: ['grid', 'field', 'clue', 'reason'] } } }, required: ['fixes'] }
const lines = es => es.map(e => `${e.grid} | ${e.reading} | ${e.easy} | ${e.hard}`).join('\n')
const PREFIX = { new: 'n', review: 'r', dedupe: 'd' }[args.mode]
if (!PREFIX) throw new Error(`args.mode must be new, review or dedupe, not ${args.mode}`)
const batches = Array.from({ length: args.count }, (_, i) => ({ n: i + 1, file: `${args.dir}/${PREFIX}_${String(i + 1).padStart(2, '0')}.txt` }))

// Two validators with different lenses, then one adjudicator who decides; text is either the lines or a file to read.
// A batch whose validator died is dropped (null), never passed on as reviewed with no issues.
const validate = (text, b) => parallel(Object.entries(LENS).map(([k, lens]) => () => agent(`${CONV}

${lens}
${RULES}

${text}`, { label: `${k}:${b.n}`, phase: 'Validate', schema: FIND }))).then(pair => pair.every(Boolean) ? pair : null)
const adjudicate = (text, pair, b) => {
  if (!pair) return Promise.resolve(null)
  const issues = pair.flatMap(p => p.issues)
  if (!issues.length) return Promise.resolve({ changes: [], reject: [], raw: 0 })
  return agent(`${CONV}

Two independent validators reviewed these lines. ${text}

Their issues are below. For each, decide yourself whether it is a real problem. If so, write the final corrected clue (leave the other clue's field empty) or, only when the word itself is unfit, reject the word. If not, drop it: dropped issues go nowhere. Reconcile duplicate flags into one decision. Every replacement follows all the conventions.

${JSON.stringify(issues)}`, { label: `adjudicate:${b.n}`, phase: 'Adjudicate', schema: FINAL }).then(f => f && { ...f, raw: issues.length })
}

let res
if (args.mode === 'new') res = await pipeline(
  batches,
  b => agent(`${CONV}

Read the batch file (quote the path): ${b.file}
Each line is: grid form | normal spelling | English gloss (may be empty) | vocabulary tier. Write an easy and a hard clue for every word, or reject an unfit word. Do every line yourself, in order; no scripts, no sampling. Every line appears exactly once, in entries or in reject, keyed by the grid form.`, { label: `write:${b.n}`, phase: 'Write', schema: WRITE }),
  (w, b) => w && validate(`Lines (grid | reading | easy | hard):\n${lines(w.entries)}`, b).then(pair => pair && { w, pair }),
  (v, b) => v && adjudicate(`Lines (grid | reading | easy | hard):\n${lines(v.w.entries)}`, v.pair, b)
    .then(f => f && { batch: b.n, entries: v.w.entries, writerReject: v.w.reject, ...f }),
)
else if (args.mode === 'review') res = await pipeline(
  batches,
  b => validate(`Read the batch file (quote the path): ${b.file}. Each line is: grid form | reading (Hebrew only) | EASY clue | HARD clue. Judge every line yourself; do not script it.`, b),
  (pair, b) => adjudicate(`The batch file is ${b.file} (quote the path; read it for context).`, pair, b).then(f => f && { batch: b.n, ...f }),
)
else res = await pipeline(
  batches,
  b => agent(`${CONV}

Read the batch file (quote the path): ${b.file}
Each line is: grid form | reading (Hebrew only) | which clue to replace (easy or hard) | current easy | current hard | the other word that has the same clue text. Write a NEW clue for the named field only, so the two words no longer share a clue; it must follow the conventions and differ from the word's other clue. Do every line yourself, in order.`, { label: `rewrite:${b.n}`, phase: 'Write', schema: REWRITE }),
  (w, b) => w && agent(`${CONV}

You are a strict editor. Context: ${b.file} (quote the path) has each word's reading and current clues. Check each new clue below against the conventions and the reading; return a replacement only for clues that fail.

${w.clues.map(c => `${c.grid} | ${c.field} | ${c.clue}`).join('\n')}`, { label: `check:${b.n}`, phase: 'Validate', schema: FIX }).then(c => c && { batch: b.n, clues: w.clues, fixes: c.fixes }),
)
const ok = res.filter(Boolean)
if (ok.length < batches.length) log(`only ${ok.length} of ${batches.length} batches finished: merge these, then prepare and run the rest again`)
return ok

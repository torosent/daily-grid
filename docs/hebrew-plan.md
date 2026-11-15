# Hebrew edition: plan

Status: decisions made; Hebrew word list in progress. Based on research by five agents, each checked by a second agent against primary sources (Hebrew Wikipedia, the Academy of the Hebrew Language, Wikidata, Hspell, Google Fonts, Cloudflare and W3C docs, and the project's own code). Corrections from that check are already folded in. Where something could not be verified, it says so.

## Summary

- **Where:** the same solver file at `grid.tomer.dev/he/`, with Hebrew data under `data/he/`. One codebase, two URLs.
- **Words:** Wikidata's Hebrew lexemes (CC0), dictionary forms only, filtered by frequency, plus a reviewed supplement. About 20,000–25,000 words. Not Hspell: it is AGPL.
- **Grids:** the existing generator works unchanged once Hebrew letters are folded (final forms treated as regular). A test fill was faster in Hebrew than in English.
- **Sizes:** 5×5, 7×7 and **13×13** rather than 15×15. Hebrew words average 5.5 letters against 7.6 in English, and Israeli puzzles are typically 11×11 to 13×13.
- **Clues:** Easy = plain definition, Hard = harder definitions with occasional wordplay. A full cryptic "logic crossword" (תשבץ היגיון, *tashbets higayon*) is a separate product.
- **The hard part is quality, not code.** Code is about 3–5 days. Vocabulary cleanup and clue review dominate, and the clues need a native speaker.

## What changes in a Hebrew crossword

| Topic | Convention | What it means here |
|---|---|---|
| Direction | Across (מאוזן, *me'uzan*) reads right to left; Down is מאונך (*me'unakh*). Square 1 is top-right. | `dir="rtl"` on the page does almost all of it: the grid's first column is drawn on the right, and the stored data, slot order and numbering stay as they are. Never reverse strings. |
| Vowels | Grids and clues carry no vowel points (niqqud). | One letter per square, 22 letters. Many words become ambiguous (see Clues). |
| Final letters | ך ם ן ף ץ are end-of-word forms of כ מ נ פ צ. **No written rule exists** for a square that ends one word and sits inside the crossing word. The one published sample solution found shows regular forms everywhere. | Store and match regular forms only. Accept either form when typed. Display is a decision for you (below). |
| Answer form | Dictionary form, no inflection: no plurals, no attached prefixes such as ה *ha-* "the", ו *ve-* "and", ב *be-* "in". | Lemmas only. Raw word lists are full of prefixed forms (63% of the top 20,000 subtitle words), so they can't be used as-is. |
| Spelling | No single crossword standard. Most puzzles now use an in-between spelling close to school and newspaper usage. The Academy revised its rules for unpointed spelling in 2017 (e.g. חוכמה *khokhma* "wisdom", formerly חכמה). | Pick one standard and state it on the page. Drop words whose spelling commonly varies. |
| Grid style | Hebrew cryptic grids follow the British pattern (half the letters uncrossed). Daily plain puzzles could not be inspected (images or script-rendered). | Our American-style rules (symmetric, every square crossed, 3+ letters) are stricter than local norms but fill fine in tests. |

## Decisions (made 2026-11-14)

1. **Audience:** Hebrew-speaking players, public. So native review and Hebrew SEO matter.
2. **Sizes:** 5×5, 7×7, 13×13.
3. **Final letters:** stored and matched as regular forms; either form accepted when typed; the grid shows what the solver typed.
4. **Spelling:** Academy 2017 full spelling, stated on the page.
5. **Hard clues:** tricky clues: misdirection, double meanings and wordplay in the spirit of the logic crossword. No letter count (changed 2026-11-15).
6. **Levels (2026-11-15):** each level has its own puzzles. Easy uses everyday words; Medium adds a medium vocabulary tier; Hard adds a hard tier and favours rarer words, but every Medium and Hard puzzle keeps a minimum share of everyday words.
7. **Language switch:** an EN/HE toggle in the masthead, with a transition animation when switching. Both languages stay on their own URLs (`/` and `/he/`) for sharing and search engines; the toggle swaps in place and updates the address.

Still open: a native Hebrew speaker to review a clue sample and the interface strings before launch.

## Plan by phase

### Phase 0: confirm conventions (half a day, needs a Hebrew solver)
- Look at three or four real Israeli crosswords (Haaretz, Yedioth, Israel Hayom, kibbutz.org.il PDFs): final letters at crossings, two-letter answers, clue numbers' corner, whether clues show lengths.
- Decide items 2, 3 and 5 above.

### Phase 1: vocabulary (1–2 days)
1. Download Wikidata Hebrew lexemes with a SPARQL query: lemma, part of speech, written form. Keep single words of Hebrew letters only, 3–11 letters (13 for a 13×13), no proper nouns. About 25,000 lemmas.
2. Rank by a frequency list (wordfreq or FrequencyWords, both CC BY-SA 4.0) and keep words seen at least 3 times: about 19,000.
3. **Merge spelling twins:** Wikidata holds the same word in both spellings (חכמה / חוכמה) and mostly follows Hspell's pre-2017 rules. Normalize to the chosen standard with an AI pass and drop the old spelling.
4. Add a reviewed supplement of common words Wikidata lacks: pronouns, adverbs, everyday phrases such as אתה *ata* "you", בסדר *beseder* "OK", עדיין *adayin* "still".
5. Reject pass, as for English: obscure loanwords, odd forms, anything offensive.
6. Commit `data/he/words.txt` with a README credit to Wikidata. **Do not commit the frequency file** (share-alike license).

### Phase 2: generator (1 day)
- `build.js`: a letter-fold step on read (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ, strip vowel points); a per-language alphabet instead of `/^[A-Z]+$/`; `shape()` uses `/[^#]/g`; the 13×13 pattern limits; a Hebrew look-alike check, since English `related()` (CAT/CATS) misses Hebrew pairs that share a root or differ by a prefix (מכתב *mikhtav* "letter" / כתב *ktav* "writing").
- Choose the language with `DATA_DIR=data/he` or a `GRID_LANG` variable. **Not `LANG`:** every shell already sets it.
- `test.js`: Hebrew alphabet, folded comparisons, puzzle count as a parameter.
- Smoke run: `PLAN=5:3,7:3,13:2`, then the full set.

### Phase 3: clues (2–4 days of agent work, plus native review)
- Two clues per word, written by an AI model that also records **which reading it clued** (a pointed form plus an English gloss). Without vowels one spelling can be several words: ספר is *sefer* "book", *sapar* "barber", *safar* "counted".
- Automated checks, in a separate Python step (the Hebrew language tools are Python):
  - **Root leak:** a substring check can't catch a clue that gives the answer away through a shared three-letter root. Combine a lemmatizer (DictaBERT or Shoshan), a word-to-root table from Hebrew Wiktionary's root field, and a prefix-stripping heuristic. Expect over-flagging; a human resolves the flags.
  - **Agreement:** gender, number and definiteness of the clue against the recorded reading.
  - Plus the existing checks: no answer inside its clue, no clue text twice in a puzzle.
- Gender in clues: impersonal phrasing first, masculine generic only when unavoidable, never address the solver.
- Expect a much higher reject rate on Hard than on Easy.

### Phase 4: page (2–3 days)
- **Routing:** `/he/` serves the same `index.html`; the page reads its language from the path. The Worker sends `/he` to `/he/`, serves the page through an assets binding, and allows `data/he/puzzles-N.json` in its file pattern. A small HTML rewrite on `/he/` sets `lang="he" dir="rtl"`, the Hebrew title and description, so link previews and search engines see Hebrew. Both pages link to each other and carry `hreflang` tags; no automatic redirect by language.
- **Data path:** fetch `/data/he/…` as an absolute path (a relative path from `/he/` would resolve to `/he/data/…`).
- **Saved progress:** separate storage keys (`dailygrid:he:v1`), so a Hebrew grid never loads on the English page.
- **Right-to-left fixes:** square numbers move to the top-right corner, and the revealed-square triangle moves to the other corner so they don't collide. Menus, the difficulty switch and clue numbers switch from left/right CSS to start/end. The clue-bar arrows flip. The on-screen keyboard stays left-to-right, because it is a physical layout.
- **Keys:** ArrowLeft moves to the next letter across, ArrowRight to the previous one (visual direction; confirm with a Hebrew solver). Accept a Hebrew `e.key` directly; on an English keyboard layout, map physical keys to the standard Israeli layout (SI-1452).
- **On-screen keyboard:** 27 keys in SI-1452 order, final letters included.
- **Text:** every string translated and reviewed by a native speaker (labels, menus, dialogs, screen-reader sentences, the "1A" clue label, the date in he-IL, optionally with the Hebrew calendar). Wrap mixed-direction bits ("12 מאוזן", lengths like (4,6), "No. 12") in isolation marks, or they render in the wrong order.
- **Fonts:** Heebo or Assistant for the interface and grid, Frank Ruhl Libre for headings. Google serves their Hebrew files only to pages that use Hebrew glyphs. Check that descenders (ק ך ן ף ץ) and the tall ל don't clip or hit the square number at every grid size.

### Phase 5: test and launch (1 day)
- Test pass for the Hebrew data, a browser pass at phone and desktop sizes in both themes, VoiceOver in Hebrew, a play-test by a Hebrew solver, then deploy.

## Licenses

| Source | License | Use here |
|---|---|---|
| Wikidata Hebrew lexemes | CC0 | Base word list, committed |
| wordfreq / FrequencyWords | CC BY-SA 4.0 | Ranking only; file not committed |
| Hebrew Wiktionary | CC BY-SA | Root table for checks only; not shipped |
| Hspell | AGPL v3 | **Not used** in shipped data. Its last release (2017) also predates the new spelling rules. |
| MILA lexicon | Non-commercial research, registration | Not used |
| DictaBERT, Shoshan | Check each model's terms (the DictaBERT lexicon mode is non-commercial) | Build-time checks only |

One caveat: Wikidata's Hebrew lexemes were imported in 2019 by a bot from Hspell data. Calling them CC0 rests on the argument that grammatical facts aren't copyrightable. That's reasoned, but untested in court.

## Risks

- **Conventions unverified:** final letters at crossings, arrow-key direction and the square-number corner have no written source. A Hebrew solver must play-test before launch.
- **Clue quality:** AI-written Hebrew wordplay is unproven. Missing vowels make mis-clued readings likely. Native review is required, not optional.
- **The repo must be public** before `/he/` can load data. As of the research it returned 404, because it hasn't been created yet.
- **Arrow-word puzzles:** the most popular Israeli format may be the arrow-word booklet (תשחץ, *tashchets*: clues printed inside the grid), not this newspaper style. That is a different product. Worth knowing if the edition is for Israeli players in general.

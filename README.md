# The Daily Grid

A crossword solver at **grid.tomer.dev** in two editions:

- **English** at `/`: 300 puzzles, 100 each of 5×5 (Mini), 7×7 (Midi) and 15×15 (Full).
- **Hebrew** at `/he/` (התשבץ היומי): 900 puzzles, 100 of each size (5×5, 7×7, 13×13) for each level, right to left, with a Hebrew on-screen keyboard. Spelling follows the Academy of the Hebrew Language 2017 full-spelling rules; final letters (ך ם ן ף ץ) can be typed in either form.

Every answer has an easy and a hard clue. In English, Medium mixes the two. In Hebrew each level has its own puzzles: Easy uses everyday words with easy clues; Medium adds less common words; Hard adds rare words and tricky wordplay clues (no letter count). Medium and Hard puzzles always keep a share of everyday words. A toggle in the masthead switches editions in place (the board turns over into the other reading direction); each edition keeps its own progress.

## How it fits together

- `public/index.html` is the whole app (HTML, CSS and JS in one file). It holds no puzzle data.
- The page downloads `data/puzzles-N.json` (Hebrew: `data/he/puzzles-N.json`) the first time a size is chosen. On grid.tomer.dev that request goes to the Cloudflare Worker (`worker.js`). It answers from its edge cache at once and refreshes from this repo's `data/` folder on GitHub in the background every 5 minutes, after checking each file the same way the page does. If GitHub is slow, down or sends a broken file, the last good copy keeps being served; a data center with no copy falls back to the snapshot shipped with the last deploy.
- Pushing new dataset files to `main` updates the site within about 10 minutes (GitHub's own cache, the Worker's refresh and a 1-minute browser cache); no redeploy is needed. Changes to `public/` or `worker.js` need a deploy.

## Files

| File | What it is |
|---|---|
| `public/index.html` | The solver |
| `deploy.sh` | Tests, snapshots the datasets into `public/snapshot/` (not committed) and deploys |
| `worker.js`, `wrangler.jsonc` | Cloudflare Worker: serves `public/` at `/` and `/he/` (setting Hebrew `lang`, `dir` and title), proxies the dataset files from GitHub |
| `data/words.txt` | Fill vocabulary, about 35,700 words of 3–11 letters |
| `data/clues.txt` | `WORD\|easy clue\|hard clue` |
| `data/reject.txt` | Words the generator must never use (optional) |
| `data/puzzles.txt` | The grids, `ID\|N\|GRID[\|LEVEL]` (`#` is a black square; no level means Easy) |
| `data/puzzles-5.json`, `-7`, `-15` | Built English datasets the page downloads |
| `data/he/…` | The Hebrew edition: the same files (`words.txt`, `clues.txt`, `puzzles.txt`, `puzzles-5/7/13.json`) plus `words-medium.txt` and `words-hard.txt` (harder vocabulary tiers), `puzzles-N-medium.json` and `puzzles-N-hard.json` (each level's own puzzles) and `glosses.txt` (English meanings used when writing clues) |
| `docs/hebrew-plan.md` | How the Hebrew edition was planned: conventions, sources, licenses |
| `build.js` | Generator and packer (Node, no dependencies) |
| `test.js` | Checks every packed puzzle |
| `test-tools.js` | Checks the tools: deterministic generate, merge, and the clues workflow in every mode |
| `.claude/workflows/clues.js` | The Claude Code workflow that writes, reviews and dedupes clues; the clue conventions for both editions live here |

## Making new puzzles

For Hebrew, put `DATA_DIR=data/he` in front of each `node build.js` command, and `GRID_LEVEL=medium` or `GRID_LEVEL=hard` for those levels. Steps 3, 6 and 7 run a Claude Code workflow (`.claude/workflows/clues.js`): open Claude Code in this repo and ask it to run the `clues` workflow with the args line the previous step printed, then save its output file.

```bash
node build.js generate              # 1. top up data/puzzles.txt to the plan (100 per size); existing puzzles keep their ids
node build.js need                  # 2. words in puzzles that still lack an easy or hard clue -> data/need.txt
node build.js batches               #    and the same words as batch files for the clues workflow
                                    # 3. clues workflow, mode "new": a writer per batch, two independent validators, an adjudicator
node build.js merge OUTPUT.json     # 4. adds the clues, readings and rejected words
node build.js generate --clued      # 5. for every level with puzzles: replaces any puzzle that uses a rejected word, with clued words only
node build.js dupes                 # 6. clue texts shared by two words (exits 1 if any); if so, clues workflow mode "dedupe", then merge
node build.js review                # 7. optional full re-check of every used clue: clues workflow mode "review", then merge
node build.js pack                  # 8. write the puzzles-N.json files; refuses if a clue is missing, contains its answer or repeats in a puzzle
node test-tools.js && node test.js  # 9. tool self-check, then every packed puzzle (also fails on a clue text shared across the archive)
```

**Deterministic.** `generate` re-seeds its random generator for every new puzzle from `SEED` (default `<language>-<level>`, e.g. `he-hard`), the size and the puzzle's number, so the same seed and the same input files always give the same puzzles, also when a run is stopped and topped up later; `SEED=2 node build.js generate` gives a different set. A puzzle that cannot be filled in `MAX_FILLS` tries (default 50,000) stops the run reproducibly. The wall-clock limit `MINUTES` is only a safety net: a run it stops is not reproducible. The clue workflow is not deterministic (it is written by a model), but its saved output is: merging the same output file gives the same files every time. Commit the data files after each merge so every step can be reproduced from git.

**What is checked, and where.** `merge` strips any trailing letter count and keeps reviewed clues (a new-word result never overwrites a word that already has clues). `merge` also rewrites need.txt. `pack` refuses a puzzle that uses a rejected word, a missing clue, a clue that contains its answer, a repeated answer or a clue text twice in one puzzle. `test.js` replays every packed puzzle through the page's own engine: symmetry, connectivity, every square checked, no look-alike answers, separate easy and hard clues, and no clue text shared by two answers anywhere in the archive.

`generate` tries the least-used words first, so vocabulary spreads across the archive, and it never puts look-alike words (CAT and CATS) in one grid. `PLAN=15:120 node build.js generate` tops up a single size and leaves the others alone. A size that cannot be filled stops after a time limit (`MINUTES`, default 10 for small sizes and 90 for 15×15) and saves what it made. For the Hebrew levels the fill draws on the harder word tiers (`words-medium.txt`, `words-hard.txt`) with a minimum share of everyday words in every grid, and other levels' puzzles are left alone.

## Running locally

```bash
python3 -m http.server 8792 --bind 127.0.0.1          # serves this folder, so data/ is at /data/
npx wrangler dev --var DATA_ORIGIN:http://127.0.0.1:8792/data/
```

Then open http://localhost:8787. Without the `--var`, `wrangler dev` reads the datasets from GitHub.

## Deploying

```bash
./deploy.sh   # runs both tests, bundles a snapshot of the datasets, then wrangler deploy
```

`wrangler.jsonc` attaches the Worker to the custom domain grid.tomer.dev, which must be a zone in the same Cloudflare account.

English words and all clues were written by Claude, not taken from a published word list or clue database. The Hebrew word list starts from Wikidata Hebrew lexemes (CC0), ranked with the hermitdave FrequencyWords list (CC BY-SA 4.0, used for ranking only and not included), then reviewed by Claude.

# The Daily Grid

A crossword solver at **grid.tomer.dev** in two editions:

- **English** at `/`: 300 puzzles, 100 each of 5×5 (Mini), 7×7 (Midi) and 15×15 (Full).
- **Hebrew** at `/he/` (התשבץ היומי): 300 puzzles, 100 each of 5×5, 7×7 and 13×13, right to left, with a Hebrew on-screen keyboard. Spelling follows the Academy of the Hebrew Language 2017 full-spelling rules; final letters (ך ם ן ף ץ) can be typed in either form.

Every answer has an easy and a hard clue; Medium mixes the two. A toggle in the masthead switches editions in place (the board turns over into the other reading direction); each edition keeps its own progress.

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
| `data/puzzles.txt` | The grids, `ID\|N\|GRID` (`#` is a black square) |
| `data/puzzles-5.json`, `-7`, `-15` | Built English datasets the page downloads |
| `data/he/…` | The Hebrew edition: the same files (`words.txt`, `clues.txt`, `puzzles.txt`, `puzzles-5/7/13.json`) plus `glosses.txt` (English meanings used when writing clues) |
| `docs/hebrew-plan.md` | How the Hebrew edition was planned: conventions, sources, licenses |
| `build.js` | Generator and packer (Node, no dependencies) |
| `test.js` | Checks every packed puzzle |

## Rebuilding the puzzles

For Hebrew, put `DATA_DIR=data/he` in front of each command (for example `DATA_DIR=data/he node build.js pack`).

```bash
node build.js generate   # top up data/puzzles.txt to the plan (100 per size); existing puzzles keep their ids
node build.js need       # words used in puzzles that still lack an easy or hard clue -> data/need.txt
node build.js pack       # write data/puzzles-N.json; refuses if a clue is missing or a clue text repeats in a puzzle
node test.js
```

`generate` tries the least-used words first, so vocabulary spreads across the archive, and it never puts look-alike words (CAT and CATS) in one grid. `PLAN=15:120 node build.js generate` tops up a single size and leaves the others alone. A size that cannot be filled stops after a time limit (`MINUTES`, default 10 for small sizes and 90 for 15×15) and saves what it made. `generate --clued` uses only words that already have both clues.

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

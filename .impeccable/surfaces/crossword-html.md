---
version: 1
slug: "crossword-html"
primary_target: "crossword.html"
related_targets: []
---

Scope: crossword.html, the whole solver page. Mode: Operate.
Audience: the owner, solving generated 5x5 and 7x7 puzzles in a few minutes, desktop keyboard or phone.
Task: solve the grid; states that matter: selected cell, active word, cross-referenced clue, checked-wrong, revealed, solved.
Constraint: follow the NYT crossword solver's layout and interaction conventions; never its name, logo, typefaces or exact visual copy.

## Direction contract
seed: none (pinned)
THESIS: A newspaper solver played straight: grid left, clue lists right, a clue bar on top of the grid. Refuses a game-like or decorative arrangement.
OWN-WORLD: (revised from the owner's reference screenshot) White page, pale grey cells and panels, charcoal squares, thin dark rules in a rounded frame; selected cell orchid with a darker foot stripe, active word and clue pale pink; Across and Down stacked in bordered rounded panels with bold serif headings and bold numbered clues. Type: Libre Franklin UI, Libre Baskerville headings.
STORY: The solver opens to a filled-in puzzle structure, the first across clue active, and starts typing immediately.
FIRST VIEWPORT: Masthead "The Daily Grid" with date and size picker; toolbar (timer, Clear, Reveal, Check, New puzzle); clue bar; grid; Across and Down lists.
SIGNATURE: The highlight trio (yellow cell, blue word, blue clue in the list with the crossing clue marked) moving in lockstep as you type.
RISK: Looking too close to NYT; keep own name, own faces, own masthead.

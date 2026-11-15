# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

One static page (`public/index.html`, plain HTML/CSS/JS, no framework) served by a Cloudflare Worker at grid.tomer.dev. Puzzle datasets live in the public GitHub repo torosent/daily-grid; the Worker fetches `data/puzzles-N.json` from there and caches it. Puzzles are built offline with `build.js` (Node, no dependencies).

## Users

One person (the owner) solving crosswords as a personal habit, on desktop and phone.

## Product Purpose

The Daily Grid is a crossword solver with a fixed archive of 300 puzzles. Success: a solver used to a newspaper crossword app can sit down and play without learning anything new, and does not see the same words over and over.

## Positioning

300 original puzzles in three sizes and three difficulty levels, no account, no paywall, one link.

## Operating Context

Solving sessions from a few minutes (5×5, 7×7) to a long sitting (15×15). Keyboard on desktop; tap plus on-screen keyboard on phone and tablet.

## Capabilities and Constraints

- 100 puzzles each of 5×5 (Mini), 7×7 (Midi) and 15×15 (Full). New puzzle hands out ones this solver has not seen yet.
- Every answer has an easy and a hard clue. Easy and Hard show one set; Medium mixes them. The level can change mid-puzzle.
- The page holds no puzzle data; it downloads the dataset for a size the first time that size is chosen.
- Interaction: select square, toggle direction, type-advance, backspace, arrows, Tab to next clue, clue bar, clickable clue lists, timer and pause, Check/Reveal (square, word, puzzle), Clear, solved message.
- Progress and the list of seen puzzles are saved per browser (localStorage, best effort).
- Words and clues were written by Claude and reviewed by Claude; no published word list or clue database is used.
- Not built: pencil mode, rebus, autocheck, puzzle builder, accounts.

## Brand Commitments

- Name: "The Daily Grid".
- Look follows the owner's reference screenshot: pale grey squares in a thin rounded frame, orchid selected square, pale pink current word and clue, Across and Down stacked in bordered panels with bold serif headings.
- Interaction conventions follow mainstream newspaper crossword apps. Never use another publication's name, logo or typefaces.

## Evidence on Hand

None. No real users or stats; do not fabricate any.

## Product Principles

1. Familiar first: match the conventions newspaper solvers already know; never surprise them.
2. The grid is the product: everything else stays quiet around it.
3. Keyboard and touch both feel native.
4. Every puzzle is valid: symmetric, connected, every square checked, every answer clued at both levels.
5. Variety: vocabulary is spread across the archive, not repeated.

## Accessibility & Inclusion

Keyboard-operable everywhere with visible focus; states never conveyed by color alone; the selected square, its contents and the word so far are announced to screen readers; touch targets 44px on touch devices; readable at phone width.

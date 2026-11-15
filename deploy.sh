#!/bin/sh
# Deploy the Worker with a snapshot of the current datasets. The live data still comes from GitHub; the snapshot is
# only used by a data center that has no cached copy while GitHub is unavailable.
set -e
cd "$(dirname "$0")"
node test-tools.js
node test.js
DATA_DIR=data/he node test.js
rm -rf public/snapshot && mkdir -p public/snapshot/he
cp data/puzzles-5.json data/puzzles-7.json data/puzzles-15.json public/snapshot/
cp data/he/puzzles-*.json public/snapshot/he/
npx wrangler deploy

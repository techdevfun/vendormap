#!/usr/bin/env bash
# Capture the demo transcript from the REAL CLI (no hand-edited output).
# Runs in a scratch dir so nothing pollutes the repo. The transcript is
# rendered to demo/vendormap-demo.gif by scripts/make-gif.py.
#
# Both fixtures are SYNTHETIC (invented company names and reference
# counts); their scores are the fixtures' own, not measurements of any
# real company.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH=/tmp/vendormap-demo
BIN="$SCRATCH/bin"
rm -rf "$SCRATCH"
mkdir -p "$BIN" "$ROOT/demo"
ln -sf "$ROOT/dist/cli.js" "$BIN/vendormap"
chmod +x "$ROOT/dist/cli.js"
export PATH="$BIN:$PATH"

WORK="$SCRATCH/work"
mkdir -p "$WORK"
cd "$WORK"

OUT="$ROOT/demo/transcript.txt"
{
  echo "# vendormap demo - real CLI output on the SYNTHETIC fixtures"
  echo "# (acme-shop: every layer single-vendor; diversified-shop: every"
  echo "#  layer split across two vendors. Scores are the fixtures' own.)"
  echo ""
  echo "\$ vendormap init"
  vendormap init --dir "$WORK"
  cd "$ROOT"
  echo ""
  echo "\$ vendormap scan examples/acme-shop"
  vendormap scan examples/acme-shop
  echo ""
  echo "\$ vendormap explain examples/acme-shop --category gpu"
  vendormap explain examples/acme-shop --category gpu
  echo ""
  echo "\$ vendormap check examples/acme-shop"
  vendormap check examples/acme-shop || echo "exit: $?"
  echo ""
  echo "\$ vendormap scan examples/diversified-shop"
  vendormap scan examples/diversified-shop
  echo ""
  echo "\$ vendormap check examples/diversified-shop"
  vendormap check examples/diversified-shop || echo "exit: $?"
} > "$OUT" 2>&1
echo "transcript written: $OUT ($(wc -l < "$OUT") lines)"

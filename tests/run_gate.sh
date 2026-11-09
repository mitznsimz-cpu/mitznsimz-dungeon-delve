#!/bin/sh
# MSDD gate. All runners must pass before a version bump.
# Run from anywhere: sh tests/run_gate.sh. The runners read ./index.html and the
# files beside it, so the gate moves to the repo's top folder first.
#
# v4.9: the rogue runner joins the gate (28 runners): the Rogue, locks, signature moves, tools, spells, rings.
# v4.8: the dungeon runner joins the gate (27 runners): traps, finds, mechanisms, dressing.
# v4.7: the sound runner joins the gate (26 runners); sound.js must sit beside the game.
# v4.6: the bestiary runner joins the gate (25 runners).
# v4.5: the motion runner joins the gate (24 runners); motion.js must sit beside the game.
# v4.4: the campaign runner joins the gate (23 runners).
# v4.3: the terrain runner joins the gate (22 runners).
# v4.1: the old loop piped each runner through tail, so a failing runner's exit
# code was lost and the gate printed PASSED regardless. Each runner's own exit
# code is checked now, and the summary line is read from its output.
cd "$(dirname "$0")/.." || exit 1
fails=0
for r in pack map party save combat town inventory world events vocab spells skills solve gen sprites chooser tierb roster look baseline minis terrain campaign motion bestiary sound dungeon rogue; do
  out=$(node tests/harness_${r}.js 2>&1)
  code=$?
  line=$(printf '%s\n' "$out" | grep -E '^(PASSED|FAILED)' | tail -1)
  printf '%-26s%s\n' "=== $r ===" "${line:-NO RESULT (exit $code)}"
  if [ $code -ne 0 ]; then fails=$((fails + 1)); fi
done
if [ $fails -eq 0 ]; then
  echo "GATE PASSED"
else
  echo "GATE FAILED — $fails runner(s)"
  exit 1
fi

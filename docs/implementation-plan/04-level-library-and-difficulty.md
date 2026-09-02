# Phase 4: Level Library And Difficulty

## Goal

Establish that varied region shapes and familiar deductions can carry a set of levels before adding further symbol relationships.

See the [canonical grammar](../chord-core-grammar.md).

## Content sequence

1. Circle-only: one Queens-like symbol layer.
2. Circle and Diamond: two symbols compete for cells.
3. Circle, Diamond, and Triangle: the standard partial Jigsaw Sudoku rule set.
4. Different region silhouettes: narrow corridors, corner-heavy regions, central regions, and asymmetric partitions.
5. Optional starting clues only where needed to ensure a deduction-first solve.

## Human deductions and hints

- A region, row, or column has one candidate left for a symbol.
- A symbol placement eliminates its row, column, and region candidates.
- A cell is impossible because another symbol already occupies it.
- A pair or group of candidates is confined to a row, column, or region.
- Inventory completion forces the remaining symbol placement.

Hints identify the next useful constraint before revealing a move. The player-facing solver must not branch or guess.

## Exit criteria

The game contains twenty hand-authored, solver-verified levels across several region shapes, with difficulty labels based on deduction traces and playtests.

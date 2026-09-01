# Phase 4: Level Library And Difficulty

## Goal

Establish that varied region shapes and familiar deductions can carry a set of levels before adding city simulation mechanics.

## Content sequence

1. Wind Farm-only: one Queens-like service layer.
2. Wind Farm and Dam: two services compete for cells.
3. Wind Farm, Dam, and Farm: the standard partial Jigsaw Sudoku rule set.
4. Different region silhouettes: narrow corridors, corner-heavy districts, central districts, and asymmetric partitions.
5. Optional starting clues only where needed to ensure a deduction-first solve.

## Human deductions and hints

- A region, row, or column has one candidate left for a service.
- A service placement eliminates its row, column, and region candidates.
- A cell is impossible because another service already occupies it.
- A pair or group of candidates is confined to a row, column, or region.
- Inventory completion forces the remaining service placement.

Hints identify the next useful constraint before revealing a move. The player-facing solver must not branch or guess.

## Exit criteria

The game contains twenty hand-authored, solver-verified levels across several region shapes, with difficulty labels based on deduction traces and playtests.

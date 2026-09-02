# Phase 1: Chord Rules Foundation

## Status

Complete. The renderer-independent rules, level validation, immediate Triangle-Diamond placement constraint, and automated rule coverage are implemented.

## Goal

Build a renderer-independent rule engine for abstract symbols under Jigsaw Sudoku constraints. See the [canonical grammar](../chord-core-grammar.md) for the complete ruleset.

## Scope

- A 6x6 or 8x8 board divided into `N` contiguous, irregular regions.
- Three symbols: Circle, Diamond, and Triangle.
- `N` instances of each active symbol.
- One symbol per cell.
- Exactly one instance of each active symbol in every row, column, and region.
- Every Triangle must be orthogonally adjacent to a Diamond.
- Circles and Diamonds may not be orthogonally adjacent.
- Exact completion only when all `3 * N` symbols are legally placed.

## Data model

Define pure TypeScript types for a cell, region identifier, symbol type, level, and placement. A level supplies a region map and symbol requirements. Region definitions must cover the board exactly, contain `N` cells each, and be contiguous by orthogonal adjacency.

Rotations may remain a visual interaction, but they have no rule effect in this phase. Multi-cell marks and non-local predicates are out of scope.

## Tests

- Region maps are complete, non-overlapping, correctly sized, and connected.
- A placement detects cell, row, column, region, Circle-Diamond, and Triangle-Diamond conflicts.
- Different symbol types may share a row, column, or region but never a cell.
- A Triangle is only legal to place beside an existing Diamond.
- A known valid layout completes the level.
- Incomplete and conflicting layouts do not complete it.

## Exit criteria

The same placements always produce the same legal or illegal state, and the complete rule model passes automated tests without Phaser.

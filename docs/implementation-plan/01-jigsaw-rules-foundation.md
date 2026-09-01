# Phase 1: Town Planner Rules Foundation

## Status

Complete. The renderer-independent rules, level validation, immediate Farm-Dam placement constraint, and automated rule coverage are implemented.

## Goal

Build a renderer-independent rule engine for town infrastructure placed under Jigsaw Sudoku constraints. See the [canonical grammar](../city-constraint-puzzle-core-grammar.md) for the complete ruleset.

## Scope

- A 6x6 or 8x8 board divided into `N` contiguous, irregular districts.
- Three service types: Wind Farm, Dam, and Farm.
- `N` instances of each service type.
- One service per cell.
- Exactly one instance of each service type in every row, column, and region.
- Every Farm must be orthogonally adjacent to a Dam.
- Wind Farms and Dams may not be orthogonally adjacent.
- Exact completion only when all `3 * N` services are legally placed.

## Data model

Define pure TypeScript types for a cell, district identifier, service type, level, and placement. A level supplies a district map instead of a resource field. District definitions must cover the board exactly, contain `N` cells each, and be contiguous by orthogonal adjacency.

Rotations may remain a visual interaction, but they have no rule effect in this phase. Service footprints, terrain, and population are out of scope.

## Tests

- Region maps are complete, non-overlapping, correctly sized, and connected.
- A placement detects cell, row, column, district, Wind Farm-Dam, and Farm-Dam conflicts.
- Different service types may share a row, column, or region but never a cell.
- A Farm is only legal to place beside an existing Dam.
- A known valid layout completes the level.
- Incomplete and conflicting layouts do not complete it.

## Exit criteria

The same placements always produce the same legal or illegal state, and the complete rule model passes automated tests without Phaser.

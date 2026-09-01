# Phase 2: Playable Jigsaw Slice

## Status

Complete. The playable Phaser board includes responsive controls, legal-cell highlighting, undo/redo, reset, hints, solution preview, 6x6 and 8x8 practice boards, and the Town Planner visual system.

## Goal

Prove that town-planning Jigsaw Sudoku is readable and satisfying with simple Phaser graphics.

## Scope

Build a playable 6x6 level using the Phase 1 engine.

## Visual language

- Distinct softly colored irregular regions with clear borders.
- Geometric symbols for Wind Farms, Dams, and Farms.
- A selected service and its legal candidate cells are visible.
- Conflicts identify the precise row, column, region, or occupied cell causing them.
- Farms only highlight as legal beside an orthogonally adjacent Dam.
- District borders remain visible while legal candidate cells are highlighted.
- Buildings retain the existing simple orientation marker, but orientation does not affect legality yet.

## Interaction

- Select a service from the inventory.
- Click or tap a cell to place it.
- Click or tap a placed service to remove it.
- Show candidate marks and conflicts before committing a placement.
- Undo, redo, reset, and a held solution preview.
- Support pointer input and the existing keyboard controls at phone-sized layouts.

## Exit criteria

A player can understand and complete a level using district shapes, geometric service symbols, and conflict feedback.

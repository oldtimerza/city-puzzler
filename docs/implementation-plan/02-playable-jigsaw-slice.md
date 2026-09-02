# Phase 2: Playable Jigsaw Slice

## Status

Complete. The playable Phaser board includes responsive controls, legal-cell highlighting, undo/redo, reset, hints, solution preview, and 6x6 and 8x8 Classic boards.

## Goal

Prove that the abstract symbol grammar is readable and satisfying with simple Phaser graphics.

See the [canonical grammar](../chord-core-grammar.md).

## Scope

Build a playable 6x6 level using the Phase 1 engine.

## Visual language

- Distinct softly colored irregular regions with clear borders.
- Geometric symbols for Circle, Diamond, and Triangle.
- A selected symbol and its legal candidate cells are visible.
- Conflicts identify the precise row, column, region, or occupied cell causing them.
- Triangles only highlight as legal beside an orthogonally adjacent Diamond.
- Region borders remain visible while legal candidate cells are highlighted.

## Interaction

- Select a symbol from the inventory.
- Click or tap a cell to place it.
- Click or tap a placed symbol to remove it.
- Show candidate marks and conflicts before committing a placement.
- Undo, redo, reset, and a held solution preview.
- Support pointer input and the existing keyboard controls at phone-sized layouts.

## Exit criteria

A player can understand and complete a level using region shapes, geometric symbols, and conflict feedback.

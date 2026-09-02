# Phase 3: Solver And Lesson Foundation

## Status

In progress. The unique solver, immutable clues, Practice lesson picker, rule cards, and local progression persistence are implemented. Solver-derived non-spoiler hints remain.

## Goal

Turn the current open Classic board into a sequence of fair, uniquely solvable Chord lessons.

See the [canonical grammar](../chord-core-grammar.md).

## Campaign Structure

The first campaign teaches one rule family at a time.

1. **Triangle Link**: a 5x5 board with Diamonds and Triangles. It teaches row, column, and region quotas plus the Triangle-Diamond dependency. Include fixed Diamond clues and explicitly instruct the player to place Diamonds before Triangles.
2. **Separated Marks**: a 5x5 board with Circles and Diamonds. It introduces the Circle-Diamond exclusion rule with generous starting clues.
3. **Three-Part Chord**: a 6x6 board with all three symbols, fewer clues, and more irregular region shapes. This is the first standard-difficulty level.

Later lessons should add varied 6x6 and 8x8 region maps before adding Square.

## Level Model

Define an authored Practice lesson separately from the procedural Classic generator. A lesson records its identifier, title, introduction, board size, active symbols, region map, immutable clues, full solution, and unlocks.

- Active symbols have one placement per row, column, and region.
- Inactive symbols have no inventory, placement button, or quota.
- Clues are immutable: players cannot remove, overwrite, undo past, or reset them.
- Reset restores the clue state instead of an empty board.
- Completion checks only active symbols and their active relationships.

The existing procedural generator remains a separate Classic mode while it only validates one known solution.

## Solver And Uniqueness

Implement a pure TypeScript solver that accepts board size, active symbols, regions, clues, and relationship constraints.

- Search until it finds zero, one, or two solutions, then stop.
- Treat clue placements as fixed.
- Respect row, column, region, occupancy, Circle-Diamond, and Triangle-Diamond constraints throughout the search.
- Accept lessons only when the solver finds exactly one solution.
- Preserve witnesses for zero-solution and multi-solution diagnostics.

The player-facing hint system should evolve from a stored-solution reveal into a solver-derived explanation, such as a region having one remaining Diamond candidate or a Triangle having one possible adjacent Diamond.

## Board Profiles

Lesson support extends the current practice grammar in two ways:

- Add curated 5x5 boards with five connected regions of five cells.
- Support partial symbol profiles, beginning with the Diamond-Triangle profile.

Use authored 5x5 region maps for the first tutorial. General-purpose 5x5 procedural topology generation is deferred until Classic mode needs it.

When profile-based lessons are implemented, update the canonical grammar so that quotas and relationships apply to a level's active symbols. The current full Circle-Diamond-Triangle profile remains the standard profile.

## Campaign UI And Persistence

Use `Practice` as the lesson picker:

- Show unlocked lesson cards with title, board size, active-symbol icons, and a short rule summary.
- Show locked cards with their preceding completion requirement.
- Offer the random board-size flow as Classic mode.
- Show `Next level` and `Replay` after completion.
- Persist completed lesson IDs and unlock state in `localStorage` under a versioned key such as `chord.lessons.v1`.

## Tests

- A 5x5 region map has five connected regions of five cells.
- Two-symbol and three-symbol profiles validate independently.
- Fixed clues cannot be removed, overwritten, or reset away.
- The solver reports zero, one, or multiple solutions correctly.
- Every shipped lesson has exactly one solution.
- Lesson unlock order and persisted completion state restore correctly.
- Logical hints identify a valid deduction without guessing.

## Exit Criteria

Players can complete Triangle Link, Separated Marks, and Three-Part Chord in order. Each lesson has a unique solution, teaches its advertised rule, preserves progression across refreshes, and provides a useful non-spoiler hint.

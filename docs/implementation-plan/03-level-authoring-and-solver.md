# Phase 3: Solver And Campaign Foundation

## Status

In progress. The unique solver, immutable clues, Practice lesson picker, rule cards, and local progression persistence are implemented. Solver-derived non-spoiler hints remain.

## Goal

Turn the current open Free play board into a sequence of fair, uniquely solvable Miniopolis lessons.

## Campaign Structure

The first campaign teaches one rule family at a time.

1. **Irrigation**: a 5x5 board with Dams and Farms. It teaches row, column, and district quotas plus Farm-Dam irrigation. Include fixed Dam clues and explicitly instruct the player to place Dams before Farms.
2. **Solar Fields**: a 5x5 board with Solar Panels and Dams. It introduces the Solar Panel-Dam exclusion rule with generous starting clues.
3. **Regional Plan**: a 6x6 board with all three building types, fewer clues, and more irregular district shapes. This is the first standard-difficulty level.

Later campaign levels should add varied 6x6 and 8x8 district maps before adding another building type.

## Level Model

Define an authored Practice lesson separately from the procedural Free play generator:

```ts
interface CampaignLevel {
  readonly id: string;
  readonly title: string;
  readonly introduction: string;
  readonly size: 5 | 6 | 8;
  readonly activeServices: readonly ServiceType[];
  readonly regions: readonly (readonly string[])[];
  readonly clues: readonly ServicePlacement[];
  readonly solution: readonly ServicePlacement[];
  readonly unlocks: readonly string[];
}
```

- Active services have one placement per row, column, and district.
- Inactive services have no inventory, placement button, or quota.
- Clues are immutable: players cannot remove, overwrite, undo past, or reset them.
- Reset restores the clue state instead of an empty board.
- Completion checks only active services and their active relationships.

The existing procedural generator remains a separate Free play mode while it only validates one known solution.

## Solver And Uniqueness

Implement a pure TypeScript solver that accepts board size, active services, districts, clues, and relationship constraints.

- Search until it finds zero, one, or two solutions, then stop.
- Treat clue placements as fixed.
- Respect row, column, district, occupancy, Solar Panel-Dam, and Farm-Dam constraints throughout the search.
- Accept campaign levels only when the solver finds exactly one solution.
- Preserve witnesses for zero-solution and multi-solution diagnostics.

The player-facing hint system should evolve from a stored-solution reveal into a solver-derived explanation, such as a district having one remaining Dam candidate or a Farm having one possible adjacent Dam.

## Board Profiles

Campaign support extends the current practice grammar in two ways:

- Add curated 5x5 boards with five connected districts of five cells.
- Support partial building profiles, beginning with the Dam-Farm profile used by Irrigation.

Use authored 5x5 district maps for the first tutorial. General-purpose 5x5 procedural topology generation is deferred until Free play needs it.

When profile-based campaign levels are implemented, update the canonical grammar so that quotas and relationships apply to a level's active services. The current full Solar Panel-Dam-Farm profile remains the standard profile.

## Campaign UI And Persistence

Use `Practice` as the lesson level picker:

- Show unlocked level cards with title, board size, active-building icons, and a short rule summary.
- Show locked cards with their preceding completion requirement.
- Offer the random board-size flow as `New game` Free play.
- Show `Next level` and `Replay` after completion.
- Persist completed level IDs and unlock state in `localStorage` under a versioned key such as `town-planner.campaign.v1`.

## Tests

- A 5x5 district map has five connected districts of five cells.
- Two-service and three-service profiles validate independently.
- Fixed clues cannot be removed, overwritten, or reset away.
- The solver reports zero, one, or multiple solutions correctly.
- Every shipped campaign level has exactly one solution.
- Campaign unlock order and persisted completion state restore correctly.
- Logical hints identify a valid deduction without guessing.

## Exit Criteria

Players can complete Irrigation, Solar Fields, and Regional Plan in order. Each level has a unique solution, teaches its advertised rule, preserves progression across refreshes, and provides a useful non-spoiler hint.

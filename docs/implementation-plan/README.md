# Town Planner Implementation Plan

This directory breaks Town Planner into independently deliverable phases. The core is a city-themed, partial Jigsaw Sudoku rather than a resource-field reconstruction puzzle. Complete each phase's exit criteria before expanding the scope.

The canonical current rules are in [City Constraint Puzzle: Core Grammar](../city-constraint-puzzle-core-grammar.md).

## Technology decisions

- TypeScript throughout.
- Phaser 4 owns rendering, responsive layout, and pointer/keyboard input.
- Game rules, level validation, solvers, and generation are pure TypeScript and do not import Phaser.
- Vitest verifies deterministic game logic.
- Procedural generation creates playable boards. Unique-solution verification and deduction analysis remain future development tools.

## Core premise

- An `N x N` board, where `N` is 6 or 8, is divided into `N` contiguous, irregular districts.
- The player places Solar Panels, Dams, Farms, and Factory sites.
- Solar Panels, Dams, and Farms appear exactly once in every row, column, and region. Factory campaign levels use smaller total quotas with at most one Factory in a row, column, or region.
- A cell may hold only one service.
- Farms require orthogonally adjacent Dams, while Solar Panels may not be orthogonally adjacent to Dams.
- A level is complete when every required service placement is legal. Future content must also prove uniqueness.

This is a partial Jigsaw Sudoku: services are the symbols, and irregular town districts are the regions. The town theme becomes mechanically meaningful in later phases through homes, service coverage, population, and expansion.

## Delivery Status

| Phase | Status | Notes |
| --- | --- | --- |
| 1. Rules foundation | Complete | Rules, validation, immediate Farm-Dam placement legality, canonical grammar, and automated tests. |
| 2. Playable slice | Complete | Responsive Phaser gameplay, hints, practice boards, and Town Planner visual styling. |
| 3. Solver and campaign foundation | In progress | Unique solver, immutable clues, six Practice lessons, Factory quota exceptions, local Steel conversion, and lesson rule cards are implemented; solver-derived non-spoiler hints remain. |
| 4. Level library and difficulty | Not started | Begins after the first uniquely solvable campaign levels exist. |
| 5. Population and coverage | Not started | Deferred. |
| 6. City expansion campaign | Not started | Deferred. |
| 7. Calibration and prototype release | Not started | Deferred. |

## Phase sequence

1. [Jigsaw rules foundation](01-jigsaw-rules-foundation.md)
2. [Playable Jigsaw slice](02-playable-jigsaw-slice.md)
3. [Solver and campaign foundation](03-level-authoring-and-solver.md)
4. [Level library and difficulty](04-level-library-and-difficulty.md)
5. [Population and coverage](05-population-and-coverage.md)
6. [City expansion campaign](06-city-expansion-campaign.md)
7. [Calibration and prototype release](07-calibration-and-prototype-release.md)

## First delivery target

Phases 1 through 3 form the first playable milestone: generated 6x6 and 8x8 boards with irregular districts, quota-aware service types, conflict feedback, hints, undo, tests, and a known valid solution.

## Deferred scope

Do not introduce homes, service coverage, population, an economy, production chains, adaptive routing, or detailed artwork until irregular-region placement puzzles are understandable and enjoyable.

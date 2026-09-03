# Chord Complexity Analysis

The experimental editor's **Analyse complexity** control provides author diagnostics, not a player-facing difficulty label. A label will only be useful after these metrics have been compared with playtest data.

## What It Measures

- Structural descriptors: board size, active symbols, clue count, normal districts, and inferred tunnel districts.
- Candidate density: the number of legal `(service, cell)` placements, both initially and per required remaining placement.
- Deterministic deductions: inventory, row, column, and district singles.
- A logic stall: when none of the current explainable deductions remains.
- Bounded search diagnostics: decisions, contradictions, nodes, and maximum depth. The search stops after 25,000 nodes and marks the solution count as unknown rather than claiming a result.

The candidate and completion checks use the same Jigsaw rules as gameplay. Tunnel districts are treated as one district for uniqueness, never as adjacency. Relationship lookahead for Triangle/Diamond and Square support is not currently presented as a deduction because it needs a clear author-facing explanation first.

## Reading Results

- A logic-only solution is generally preferable for introductory and standard drafts.
- High candidate density or a logic stall identifies a board section worth inspecting.
- Search metrics are diagnostic only. They depend on branch order, so they must not be used alone as a difficulty score.
- A result of multiple solutions is an authoring failure, not a high-complexity puzzle.

## Research Basis

- [SudokuWiki's grading system](https://www.sudokuwiki.org/Grading_Puzzles) combines strategy cost with candidate density and seeks to avoid single-step bottlenecks.
- [Peter Norvig's Sudoku solver](https://norvig.com/sudoku.html) demonstrates the useful distinction between constraint propagation and minimum-remaining-values search.
- The [eight queens puzzle](https://en.wikipedia.org/wiki/Eight_queens_puzzle) is a constraint-search benchmark, rather than a source of a standard human difficulty taxonomy.

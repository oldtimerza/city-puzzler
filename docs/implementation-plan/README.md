# Chord Implementation Record

This directory records Chord's delivery sequence and current design direction. The canonical rules are in [Chord: Core Grammar](../chord-core-grammar.md).

## Current Direction

New Chord is a uniquely solvable `6x6` board governed by the Circle, Diamond, Triangle, and Square grammar. Guided, Standard, and Expert vary its immutable clue count. Practice introduces the symbol relationships through single-board lessons.

- TypeScript owns rules, validation, generation, and solving independently of Phaser.
- Phaser owns rendering, responsive layout, and input.
- Vitest covers deterministic grammar, generation, and difficulty behavior.
- Curated and generated content is accepted only with a unique solution.

## Records

| Record | Status | Focus |
| --- | --- | --- |
| 1. Rules foundation | Complete | Base symbol grammar and validation. |
| 2. Playable slice | Complete | Board interaction and feedback. |
| 3. Solver and lesson foundation | In progress | Unique clues, lessons, and hints. |
| 4. Level library and difficulty | Planned | Deduction-led single-layer studies. |
| 5. Symbol requirements | Historical | Reframed as the present region-mark grammar. |
| 6. New Chord difficulty | Complete | Unique `6x6` generation and clue profiles. |
| 7. Calibration and release | Planned | Playtest evidence and accessibility. |

1. [Rules foundation](01-jigsaw-rules-foundation.md)
2. [Playable slice](02-playable-jigsaw-slice.md)
3. [Solver and lesson foundation](03-level-authoring-and-solver.md)
4. [Level library and difficulty](04-level-library-and-difficulty.md)
5. [Symbol requirements](05-symbol-requirements.md)
7. [Calibration and release](07-calibration-and-prototype-release.md)

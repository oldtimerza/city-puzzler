# Chord: Core Grammar

## Status

This is the canonical ruleset for Chord. New Chord uses one uniquely solvable `6x6` board. The four symbols are Circle, Diamond, Triangle, and Square.

## Base Board

A board is a square `N x N` grid. New Chord uses `N = 6`; tutorial boards may use other sizes.

Every cell belongs to exactly one region. A standard `N x N` board has exactly `N` normal regions. Regions are disjoint, cover the board, and are connected through shared edges. A level may add connected dead regions, whose cells are blocked terrain; dead regions do not count toward the `N` normal regions and may have any positive size.

```text
G = { (r, c) | 1 <= r, c <= N }
R = { R1, R2, ..., RN }
union(Ri) = G
Ri intersect Rj = empty, for i != j
```

Only edge-sharing cells are adjacent. Diagonal contact does not count.

## Symbols And Quotas

```text
C = Circle
D = Diamond
T = Triangle
S = Square
```

A cell holds zero or one symbol. A profile chooses its active symbols. Unless a profile explicitly supplies a quota exception, every active symbol appears exactly once in every row, column, and region.

```text
For each active symbol X:
  each row contains exactly one X
  each column contains exactly one X
  each region contains exactly one X
```

The resulting `N` placements of each active symbol may occupy different cells. Empty cells are allowed.

## Region Requirements

Each normal region carries a non-empty multiset of symbol requirements. A placed symbol fulfils a matching requirement in the normal region that contains it. Dead regions carry no requirements and cannot contain symbols. The displayed requirement marks are abstract symbols, not an external theme or simulation layer.

The standard profile requires one Circle, Diamond, and Triangle in every region. Square requirements occur only in selected regions, and the total number of Square requirements equals the Square quota. A region is complete when all of its marks are fulfilled.

## Relationship Rules

### Circle And Diamond

A Circle and Diamond may not be orthogonally adjacent.

```text
C forbids-edge D
```

### Triangle And Diamond

Every Triangle fulfils its region requirement only when it is orthogonally adjacent to at least one Diamond. This is asymmetric: a Diamond does not require a neighboring Triangle. A Triangle may be placed before its Diamond support exists, but remains inactive and does not fulfil its region mark until supported.

```text
T requires-edge D
```

### Square Conversion

A Square fulfils its region requirement only when it is orthogonally adjacent to both a Circle and a Diamond. Its two supports remain available for their own region requirements.

```text
S requires-edge C
S requires-edge D
```

A Square may be placed only in a region with a Square requirement. It can be placed before both supports exist, but does not fulfil its mark until both are adjacent.

## New Chord Difficulty

The New Chord difficulties differ only in immutable clue count, and every generated board is verified to have one solution:

| Difficulty | Total clues | Distribution |
| --- | --- | --- |
| Guided | 10 | More fixed placements. |
| Standard | 6 | Default balance. |
| Expert | 2 | Fewest fixed placements. |

## Completion And Generation

A board is complete when it satisfies its quotas, normal-region requirements, cell exclusivity, and applicable relationship rules. Dead terrain is ignored by completion.

Generated boards construct a valid full placement, derive immutable clues, and accept the result only when the solver finds exactly one solution. A known generated placement alone is not evidence of uniqueness.

## Implementation References

- `src/jigsaw/rules.ts`: base grammar and region requirements.
- `src/jigsaw/generator.ts`: board generation and uniqueness solving.
- `tests/jigsaw/rules.test.ts`: rule, generator, and difficulty verification.

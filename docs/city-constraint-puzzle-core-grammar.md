# City Constraint Puzzle: Core Grammar

## Status

This is the canonical ruleset for Miniopolis. It describes the current 5x5, 6x6, and 8x8 puzzle grammar, plus the intended extension model for future building types and relationships.

The implementation keeps the internal service identifiers `generator`, `water`, and `farm`; player-facing names are Solar Panel, Dam, and Farm.

## Board And Districts

The board is a square grid:

```text
G = { (r, c) | 1 <= r, c <= N }
N in { 5, 6, 8 }
```

Every cell belongs to exactly one district. For a board of size `N`:

- There are exactly `N` districts.
- Each district contains exactly `N` cells.
- Districts are pairwise disjoint and cover the board.
- Every district is connected by orthogonal adjacency.

If `D = { D1, D2, ..., DN }` is the district set, then:

```text
Di intersect Dj = empty, for i != j
union(Di) = G
|Di| = N
```

## Buildings

```text
W = Solar Panel
D = Dam
F = Farm
X = Factory
```

Let `X[r,c,b]` be `1` when building `b` occupies cell `(r,c)`, otherwise `0`.

### Cell Exclusivity

Each cell may contain zero or one building:

```text
sum(X[r,c,b] for b in { W, D, F, X }) <= 1
```

Empty cells are allowed.

## Level Profiles And Placement Quotas

A level profile selects its active buildings. Quotas and relationships apply only to active buildings.

```text
Irrigation:    Dam, Farm
Solar Fields:  Solar Panel, Dam
Standard:      Solar Panel, Dam, Farm
Foundry:       Solar Panel, Dam, Factory
Free play:     Solar Panel, Dam, Farm, Factory (one to `N` Factories)
```

The full Standard profile is supported on 6x6 and 8x8 boards. The 5x5 tutorial boards use the two-building Irrigation and Solar Fields profiles.

By default, every active building type appears exactly once in every row, column, and district.

For each active building `b`:

```text
For every row r:       sum(X[r,c,b] for c in 1..N) = 1
For every column c:    sum(X[r,c,b] for r in 1..N) = 1
For every district Di: sum(X[r,c,b] for (r,c) in Di) = 1
```

Therefore a completed board contains `N` instances of every active building.

Levels may define quota exceptions. The Foundry campaign levels use a Factory quota of two or three total Factories, with at most one Factory in any row, column, or district. Steel-demand districts identify where those Factories may be built.

## District Resources

Buildings provide resources to the district containing them:

```text
Farm       -> 1 Food
Dam        -> 1 Water
Solar Panel -> 1 Power
Factory    -> 1 Steel when supplied
```

Standard districts require one unit of every active non-Factory resource. Foundry levels add Steel requirements only to selected industrial districts. Unmet requirements appear as colored dots at the district's upper corner: green for Food, blue for Water, gold for Power, and red for Steel. A dot disappears when its requirement is supplied.

The existing one-per-district placement rule makes these initial requirements equivalent to the current building profile. Resource requirements are explicit level data so future districts can request different combinations and quantities.

## Orthogonal Adjacency

For a cell `x = (r,c)`, its orthogonal neighborhood is:

```text
N4(x) = { (r-1,c), (r+1,c), (r,c-1), (r,c+1) } intersect G
```

Only edge-sharing cells are adjacent. Diagonal cells are not adjacent.

## Relationship Constraints

### Solar Panel And Dam Exclusion

A Solar Panel may not be orthogonally adjacent to a Dam:

```text
W not-adjacent D
```

For every orthogonally adjacent pair `x, y`:

```text
X[x,W] + X[y,D] <= 1
X[x,D] + X[y,W] <= 1
```

### Farm And Dam Dependency

Every Farm must be orthogonally adjacent to at least one Dam:

```text
F requires-adjacent D
```

For every Farm cell `x`:

```text
X[x,F] = 1 implies sum(X[y,D] for y in N4(x)) >= 1
```

This relationship is asymmetric. A Dam does not require an adjacent Farm.

There is no direct Solar Panel-Farm relationship.

### Factory Conversion

A Factory supplies Steel to its own district only when it is orthogonally adjacent to both a Solar Panel and a Dam:

```text
X requires-adjacent W
X requires-adjacent D
X -> Steel
```

Factory inputs are enabling in the current implementation: Power and Water remain available to meet their districts' requirements. Resource capacity, transport, and consumption are future extensions.

## Move Legality

The game validates constraints while the player is placing buildings, not only at completion.

- A Solar Panel is illegal beside an existing Dam.
- A Dam is illegal beside an existing Solar Panel.
- A Farm is legal only when it is orthogonally adjacent to an already placed Dam.
- A Factory is legal only in a district with a Steel requirement. It may be placed before its Power and Water inputs are present, but does not produce Steel until both are adjacent.
- Row, column, district, cell-occupancy, and inventory constraints are also checked immediately.

The legal-cell highlight shows only placements that satisfy all current move-legality rules.

## Declarative Form

```text
BOARD N x N
SUPPORTED_SIZES 5, 6, 8

DISTRICTS N
DISTRICT_SIZE N
DISTRICT_CONNECTIVITY ORTHOGONAL

BUILDINGS
    WIND_FARM
    DAM
    FARM
    FACTORY

CELL
    MAX_OCCUPANCY 1

FOR EACH BUILDING
    ROW EXACTLY 1
    COLUMN EXACTLY 1
    DISTRICT EXACTLY 1

RELATION
    FARM REQUIRES_ORTHOGONAL DAM

RELATION
    WIND_FARM FORBIDS_ORTHOGONAL DAM

RELATION
    FACTORY REQUIRES_ORTHOGONAL WIND_FARM

RELATION
    FACTORY REQUIRES_ORTHOGONAL DAM
```

## Valid Solution

A board state is solved only when all of the following are true:

1. Every cell has at most one building.
2. Every row has one Solar Panel, one Dam, and one Farm.
3. Every column has one Solar Panel, one Dam, and one Farm.
4. Every district has one Solar Panel, one Dam, and one Farm.
5. No Solar Panel is orthogonally adjacent to a Dam.
6. Every Farm is orthogonally adjacent to a Dam.
7. Every district's resource requirements are supplied by buildings in that district.
8. Every Factory needed for Steel production touches both a Solar Panel and a Dam.

## Extension Model

Future building types can use the same quota structure with different limits:

```text
BUILDING <type>
    ROW <min,max>
    COLUMN <min,max>
    DISTRICT <min,max>
```

Future relationship predicates may include:

```text
A REQUIRES_ORTHOGONAL B
A FORBIDS_ORTHOGONAL B
A REQUIRES_DIAGONAL B
A FORBIDS_DIAGONAL B
A REQUIRES_NEAR B <distance>
A FORBIDS_NEAR B <distance>
A REQUIRES_SAME_DISTRICT B
A FORBIDS_SAME_DISTRICT B
A REQUIRES_EXACTLY_N_ADJACENT B
A REQUIRES_AT_LEAST_N_ADJACENT B
A REQUIRES_AT_MOST_N_ADJACENT B
```

These predicates are design vocabulary only until they are explicitly implemented and tested.

## Generation And Uniqueness

Free play generation builds a connected district topology, constructs one complete valid solution, and verifies that solution against the rules above. It does not currently prove that a Free play board has a unique solution.

Campaign levels have fixed clues. Their clue sets are accepted only when the solver finds exactly one solution.

The target acceptance pipeline for curated or procedural puzzles is:

```text
Generate district topology
    -> generate valid complete solution
    -> construct clue state
    -> solve from clues
    -> require exactly one solution
    -> measure deduction difficulty
    -> accept or reject
```

For a puzzle intended to be uniquely solvable:

```text
number_of_solutions(board, districts, clues) = 1
```

Knowing one generator-produced solution is not sufficient evidence of uniqueness.

## Implementation References

- `src/jigsaw/rules.ts`: level and placement validation.
- `src/jigsaw/generator.ts`: district generation and known-solution construction.
- `src/jigsaw/types.ts`: level and placement data structures.
- `tests/jigsaw/rules.test.ts`: rule and generated-level verification.

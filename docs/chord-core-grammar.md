# Chord: Core Grammar

## Status

This is the canonical ruleset for Chord. New Chord uses one uniquely solvable `6x6` board. The four symbols are Circle, Diamond, Triangle, and Square.

## Base Board

A board is a square `N x N` grid. New Chord uses `N = 6`; tutorial boards may use other sizes.

Every cell belongs to exactly one district. A standard `N x N` board has exactly `N` normal districts. Districts are disjoint and cover the board. A normal district has either one edge-connected component or exactly two edge-disconnected components. Two components form an inferred tunnel district and are shown with an arched connector. A level may add connected dead regions, whose cells are blocked terrain; dead regions do not count toward the `N` normal districts and may have any positive size.

```text
G = { (r, c) | 1 <= r, c <= N }
R = { R1, R2, ..., RN }
union(Ri) = G
Ri intersect Rj = empty, for i != j
```

Only edge-sharing cells are adjacent. Diagonal contact does not count. A tunnel connector establishes district topology only: it never creates symbol adjacency, relationship support, or Circle-Diamond exclusion.

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
| Guided | 3 | More fixed placements. |
| Standard | 2 | Default balance. |
| Expert | 1 | Fewest fixed placements. |

## Completion And Generation

A board is complete when it satisfies its quotas, normal-region requirements, cell exclusivity, and applicable relationship rules. Dead terrain is ignored by completion.

Generated boards construct a valid full placement, derive immutable clues, and accept the result only when the solver finds exactly one solution. A known generated placement alone is not evidence of uniqueness.

New Chord and editor-randomised boards generate one or two tunnel districts. Authored campaign lessons retain physically connected districts unless explicitly designed otherwise.

## Experimental Landmarks

Experimental profiles add these fixtures without changing standard Chord. A Landmark occupies its cell, cannot be moved onto, and is excluded from symbol inventory, row, column, district, resource, and requirement counts. Landmark effects are evaluated by the rule engine only; the renderer reads its evaluation rather than recreating rules.

### Twin

Twin is an experimental movable symbol with its own `bond` requirement mark. A Twin is active only when exactly one interaction neighbour presents Twin identity. Zero or two-or-more Twin neighbours leave it inactive, and every placed Twin must be active at completion. Portal edges count; an Echo may present the identity; a physically adjacent Catalyst may activate a Twin instead.

### Sanctuary

A normal region may be marked `sanctuary: true` (at most one per level). Within that region only, a Circle and Diamond identity may share a physical or Portal interaction edge. The exemption is edge-local: it does not cross the region boundary and does not alter support, quotas, requirements, district topology, or diagonal relationships.

### Echo, Catalyst, And Amplifier

An Echo copies identities, but never resources, from actual shapes in its physical orthogonal neighbours. It ignores Portal neighbours, Landmarks, and Echo output, so copying is one-hop and includes inactive shapes. Its copied identities are available at the Echo cell for support and Circle-Diamond exclusion.

A Catalyst physically adjacent to Triangle, Square, or Twin activates that shape after normal activation has been evaluated. It never supplies an identity or resource. An Amplifier physically adjacent to a final active shape makes that shape supply two copies of its normal resource to its own region. Catalyst precedes Amplifier; neither effect stacks and Echo identities cannot be amplified.

### Portal Pairs

A Portal uses two endpoint Landmarks with the same non-empty `pair` name. Each endpoint has an orthogonally adjacent `mouth`; the two mouths form one undirected virtual orthogonal edge. Endpoints and mouths must be in normal cells, endpoints may not overlap Landmarks, mouths may not be endpoints or coincide, and every pair has exactly two endpoints.

Portal edges participate in orthogonal support, Twin relationships, and Circle-Diamond exclusion, but not diagonals or district connectivity. An endpoint's local mouth direction is retained on its side of the virtual edge for directional relationship rules added by future profiles.

### Evaluation Order

1. Build physical and Portal interaction edges.
2. Add placed-shape identities.
3. Add one-hop Echo identities.
4. Apply Circle-Diamond exclusions, including Sanctuary.
5. Evaluate normal activation.
6. Apply Catalyst activation.
7. Calculate regional supply.
8. Apply Amplifier supply bonuses.
9. Evaluate requirements and completion.

`src/content/experimental-discovery-levels.ts` contains solver-certified discovery material. Its copy teaches through a visible relay rather than displaying these rules verbatim. Default Chord generation never includes experimental fixtures; experimental candidates must be solver-certified and rejected unless their featured fixture changes validity, supply, or solution count.

## Implementation References

- `src/jigsaw/rules.ts`: base grammar and region requirements.
- `src/jigsaw/generator.ts`: board generation and uniqueness solving.
- `tests/jigsaw/rules.test.ts`: rule, generator, and difficulty verification.
- `tests/jigsaw/landmarks.test.ts`: experimental fixture, ordering, malformed-data, and preservation coverage.

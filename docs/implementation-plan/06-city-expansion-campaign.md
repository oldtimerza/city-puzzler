# Phase 6: City Expansion Campaign

## Goal

Turn population progress into a persistent city that grows on the same grid.

## Expansion model

- Completing or reaching the unlock threshold for a district reveals an adjacent district or an outer board ring.
- Existing facilities remain in place and retain their row, column, and region constraints.
- New rows, columns, regions, service inventory, and homes are added by the expansion data.
- Unlocks are permanent so a temporary population decline does not remove accessible city space.
- Each expansion stage is verified against its existing locked placements before it is released.

## Initial campaign path

1. 6x6 hamlet: Wind Farms and Dams.
2. 6x6 service district: add Farms and varied district shapes.
3. 7x7 town: reveal new rows, columns, and two additional regions.
4. Larger districts: introduce more homes and more demanding service mixes.

## Future Building: Factory

Factories are a proposed post-core building type. They introduce industrial layout without requiring every building type to use the same row and column quotas.

- Place exactly one Factory in each district.
- Factories do not require one placement in every row or column.
- A Factory may be orthogonally adjacent to another Factory.
- A Factory may not be orthogonally adjacent to a Wind Farm, Dam, or Farm; this restriction is symmetric when placing either building.
- Factories are not required to touch another Factory in the first version. A mandatory industrial cluster is a possible later difficulty modifier.

With `N` districts and `N` Factory placements, district uniqueness guarantees one Factory in every district while allowing industrial clusters to cross district borders.

### Factory implementation requirements

1. Add per-building quota profiles so Factory uses district uniqueness only while current buildings retain row, column, and district uniqueness.
2. Add Factory icons, inventory, tutorial copy, and placement-feedback messages.
3. Add symmetric Factory-to-non-Factory orthogonal exclusion to placement validation.
4. Update generation to place Factories by unfilled district before solving the other services around their industrial buffer.
5. Update the solver to select an unfilled district for Factory rather than an unfilled row, and require unique campaign solutions.
6. Add unit tests for Factory quota, adjacency, generation, and solver behavior before adding campaign levels.

## Deferred Zones And Map Features

- Industrial districts can later restrict Factory placement to designated zones.
- Resource nodes can support matching buildings: ore deposits and Mines, forests and Mills, or harbors and Ports.
- Transport features such as roads, rail, and stations can become adjacency requirements for industrial buildings.
- Environmental terrain such as rivers, floodplains, protected woodland, and highlands can add placement restrictions or dependencies.
- Public-service buildings can later use district or distance-based coverage rules for Schools, Hospitals, and Fire Stations.

## Future Building Catalogue

Each new building should introduce one new reasoning dimension at a time: quota, adjacency, terrain, or coverage. Do not combine several unfamiliar rules in its introductory level.

| Building | Proposed rule | Puzzle role |
| --- | --- | --- |
| Mine | Must be orthogonally adjacent to an ore-deposit map node. | Introduces fixed terrain anchors. |
| Mill | Must touch a forest node and cannot touch a Factory. | Combines resource placement with a known industrial conflict. |
| Port | Must occupy a harbor or coast cell. | Uses terrain-restricted placement without adjacency dependencies. |
| Warehouse | Must touch both a Factory and a road or station. | Creates two-part logistics dependencies. |
| Transit Station | One per row and column, but not necessarily per district. | Inverts the Factory quota exception. |
| Park | Cannot touch a Factory and must be diagonally adjacent to a Farm. | Introduces diagonal relationships and buffer space. |
| Water Tower | Must touch exactly one Dam. | Introduces exact-count adjacency rather than an at-least-one dependency. |
| Fire Station | Must be within Manhattan distance two of every district marker or home node. | Adds late-game coverage and range reasoning. |
| Town Hall | Exactly one per board and placed in a civic district. | Introduces a global quota. |
| Rail Depot | Must touch a rail line and cannot touch a Farm. | Uses transport terrain and land-use trade-offs. |
| Research Lab | Cannot share a district with a Factory, but can share Factory rows and columns. | Adds district-only exclusion. |
| Apartments | Two per district, with no row or column quota. | Introduces multi-placement district quotas. |

## Quota Variants

The current Wind Farm, Dam, and Farm rule is one placement per row, column, and district. Future profiles may use one of these deliberate exceptions:

- District-only: Factory has one placement per district and no row or column quota.
- Row-and-column-only: Transit Station has one placement per row and column and no district quota.
- Global: Town Hall has exactly one placement on the entire board.
- Multi-placement district quota: Apartments have two placements per district and no row or column quota.
- Conditional quota: Ports appear only in coastal districts or harbor cells.

## Recommended Introduction Order

1. Factory: establish per-building quotas and industrial buffers.
2. Mine and ore nodes: establish immutable map features.
3. Park or Water Tower: introduce either diagonal relationships or exact-count adjacency.
4. Warehouse and roads or stations: combine established terrain and adjacency rules.
5. Fire Station coverage: add distance rules only after players understand local constraints.

Multi-cell buildings are intentionally deferred. They would require substantially more solver, rendering, and interaction work than nodes or quota variants while offering less useful early teaching value.

## Exit criteria

Players can see a completed district persist, understand why new land opened, and continue solving on an expanded board without losing prior progress.

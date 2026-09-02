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

1. 6x6 hamlet: Solar Panels and Dams.
2. 6x6 service district: add Farms and varied district shapes.
3. 7x7 town: reveal new rows, columns, and two additional regions.
4. Larger districts: introduce more homes and more demanding service mixes.

## Factory Foundation

Implemented Factory lessons establish the first per-building quota exception and local resource conversion.

- Foundry Basics requires two Factories; Steelworks requires three.
- Each Factory has a total quota and may appear at most once in any row, column, or district.
- Factories may only occupy districts that require Steel.
- A Factory supplies Steel when it is orthogonally adjacent to both a Solar Panel and a Dam.
- Power and Water enable Factory production without being consumed. Capacity and transport remain deferred.
- Both Factory campaign levels are generated from valid layouts and accepted only when the clue set has a unique solution with all Factories player-placed.

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
| Transit Station | One per row and column, but not necessarily per district. | Introduces a different quota exception. |
| Park | Cannot touch a Factory and must be diagonally adjacent to a Farm. | Introduces diagonal relationships and buffer space. |
| Water Tower | Must touch exactly one Dam. | Introduces exact-count adjacency rather than an at-least-one dependency. |
| Fire Station | Must be within Manhattan distance two of every district marker or home node. | Adds late-game coverage and range reasoning. |
| Town Hall | Exactly one per board and placed in a civic district. | Introduces a global quota. |
| Rail Depot | Must touch a rail line and cannot touch a Farm. | Uses transport terrain and land-use trade-offs. |
| Research Lab | Cannot share a district with a Factory, but can share Factory rows and columns. | Adds district-only exclusion. |
| Apartments | Two per district, with no row or column quota. | Introduces multi-placement district quotas. |

## Quota Variants

The current Solar Panel, Dam, and Farm rule is one placement per row, column, and district. Future profiles may use one of these deliberate exceptions:

- Limited Factory: two or three total Factories, with at most one in each row, column, and district.
- District-only Factory: a possible later industrial-zone profile with one placement per industrial district and no row or column quota.
- Row-and-column-only: Transit Station has one placement per row and column and no district quota.
- Global: Town Hall has exactly one placement on the entire board.
- Multi-placement district quota: Apartments have two placements per district and no row or column quota.
- Conditional quota: Ports appear only in coastal districts or harbor cells.

## Recommended Introduction Order

1. Factory: implemented quota exceptions and local resource conversion.
2. Mine and ore nodes: establish immutable map features.
3. Park or Water Tower: introduce either diagonal relationships or exact-count adjacency.
4. Warehouse and roads or stations: combine established terrain and adjacency rules.
5. Fire Station coverage: add distance rules only after players understand local constraints.

Multi-cell buildings are intentionally deferred. They would require substantially more solver, rendering, and interaction work than nodes or quota variants while offering less useful early teaching value.

## Exit criteria

Players can see a completed district persist, understand why new land opened, and continue solving on an expanded board without losing prior progress.

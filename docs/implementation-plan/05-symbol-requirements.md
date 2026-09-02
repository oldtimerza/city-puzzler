# Record 5: Symbol Requirements

## Status

Historical design record. The retained idea is now part of the core grammar: every region displays explicit symbol requirements.

## Current Rule

- A region has a non-empty set of required Circle, Diamond, Triangle, and/or Square marks.
- A matching placed symbol fulfils a mark in its own region.
- Square marks are fulfilled only after that Square has both required edge-adjacent supports.
- Requirements complement row, column, region, occupancy, and relationship rules; they do not replace them.

Future work should add only requirements that introduce a clear deduction and that the solver can verify. See the [canonical grammar](../chord-core-grammar.md).

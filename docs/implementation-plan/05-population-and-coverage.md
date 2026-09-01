# Phase 5: Population And Coverage

## Goal

Make city services matter beyond their placement constraints without turning the first campaign into a full simulation.

## Additions

- Some unoccupied cells become homes with a population capacity and named service needs.
- Each facility has a small, visible service footprint, initially orthogonal neighbours or a simple 3x3 area.
- A home gains residents only when all of its shown service needs are met.
- Current population is the sum of satisfied homes.
- A district has an unlock threshold and an optional full-service completion target.

## Rules decisions

- The original row, column, region, and occupancy rules remain mandatory.
- Coverage is a separate layer; it is not a replacement for the Jigsaw rules.
- Reaching an unlock threshold may allow several layouts. Full-service completion is the higher-quality goal.
- Population changes visibly as the player rearranges services.

## Exit criteria

Playtests show that players understand why a home gains or loses residents and can make meaningful choices between legal service placements.

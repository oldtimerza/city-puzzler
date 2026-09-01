# Phase 7: Calibration And Prototype Release

## Goal

Validate the city Jigsaw loop with a small, testable level set before adding population or expansion.

## Deliverables

- Level selection with identifiers and region-shape labels.
- Difficulty labels from human-solver metrics.
- Local persistence for current puzzle and completion state.
- Completion time and undo-count telemetry stored locally for playtesting.
- Keyboard and pointer controls.
- Color-independent labels or icons for service types and regions.
- Twenty accepted irregular-region levels.
- A playtest script that records solving time, mistakes, explanations players give, and enjoyment.

## Evaluation questions

- Can players explain the one-per-row, column, and region rule for each service type?
- Do players use deduction instead of blind trial?
- Do players understand that services compete for cells while maintaining independent row, column, and region constraints?
- Is a phone-sized grid readable?
- Does completion feel like planning city services rather than filling a number grid?
- Do players choose another puzzle voluntarily?

## Expansion gate

Only investigate homes, service footprints, population, expansion, directional services, terrain, procedural generation, or a planner mode after playtests show that irregular-region service placement is both clear and satisfying.

## Exit criteria

The prototype has passed qualitative playtesting with evidence that the core loop is understandable, deduction-driven, and worth extending.

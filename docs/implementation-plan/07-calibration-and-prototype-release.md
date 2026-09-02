# Phase 7: Calibration And Prototype Release

## Goal

Validate the Chord grammar and New Chord loop with a small, testable level set.

See the [canonical grammar](../chord-core-grammar.md).

## Deliverables

- New Chord difficulty selection plus lesson identifiers and region-shape labels.
- Difficulty labels from human-solver metrics.
- Local persistence for current puzzle and completion state.
- Completion time and undo-count telemetry stored locally for playtesting.
- Keyboard and pointer controls.
- Color-independent labels or icons for symbols and regions.
- Twenty accepted irregular-region levels.
- A playtest script that records solving time, mistakes, explanations players give, and enjoyment.

## Evaluation questions

- Can players explain the one-per-row, column, and region rule for each symbol?
- Do players use deduction instead of blind trial?
- Do players understand that symbols compete for cells while maintaining independent row, column, and region constraints?
- Is a phone-sized grid readable?
- Do players choose another puzzle voluntarily?

## Scope Gate

Only add a new symbol relationship after playtests show that the base grammar is clear and satisfying.

## Exit criteria

The prototype has passed qualitative playtesting with evidence that the core loop is understandable, deduction-driven, and worth extending.

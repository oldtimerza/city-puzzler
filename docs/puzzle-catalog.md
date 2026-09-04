# Puzzle Catalog

The batch catalog tool creates a reviewable collection of certified `6x6` Chord base boards. A base board stores a valid completed witness without dead zones or fixed clues. Playable variants are authored and certified interactively in the catalog browser.

## Generate

```bash
npm run catalog:generate -- \
  --output catalog/chord.json \
  --seed-start 1 \
  --count 200 \
  --workers 10 \
  --resume
```

Options:

- `--seed-start`: first unsigned seed, default `1`.
- `--count`: number of consecutive base-board seeds, default `100`.
- `--node-limit`: bounded complexity-analysis limit, default `25000`.
- `--workers`: persistent Node worker threads, default `10`.
- `--checkpoint-every`: candidates between atomic JSON checkpoints, default `25`.
- `--resume`: load an existing catalog with the identical run configuration and skip processed base seeds.

The command checkpoints a single valid JSON file by writing a temporary sibling and atomically renaming it. An interrupted process can resume from the latest checkpoint. Failed candidates are retained with their seed and reason so a completed range is reproducible.

Each worker generates and validates one base board per seed. Results are applied in seed order, so worker completion order cannot affect catalog output.

## Duplicate Boards

Catalog format 3 stores a canonical underlying-board signature and stable hash. Identity ignores clues, dead zones, seed, title, and introduction. It considers rotations of 0, 90, 180, and 270 degrees equivalent, while reflections remain distinct. Region names and portal pair IDs are normalized before comparison. Hashes only narrow candidate comparisons: matching canonical signatures are required before a `duplicate-rotation` rejection is recorded.

The browser can load legacy format-1 and format-2 playable catalogs, converting their stored puzzles into format-3 base entries. The generator writes format 3.

## Browse And Test

Open **Puzzle catalog** from the game menu, then choose the generated JSON file with **Load catalog JSON**. Select a base board, choose a dead-zone count, fixed-clue count, and variation seed, then use **Create certified variant**. The workbench only chooses dead zones from empty witness cells and accepts a result only when `validateLevel`, `isLevelComplete`, and exact uniqueness succeed. Use **Test variant** to launch the certified variant directly in the Phaser board. The game menu's return button brings a tested catalog puzzle back to the loaded catalog.

The catalog browser defaults to **Easiest to difficult**. It places logic-only entries first, then completed search-ranked entries, ordered by their deterministic analysis metrics. Use the **Order** control to reverse that view. `Unranked review` entries stay last because their bounded analysis was incomplete and should not be assigned a difficulty position.

## Admission And Ranking

Every retained base entry is independently checked with `validateLevel` and `isLevelComplete`. Bounded analysis is performed for author triage. Each playable variant is additionally checked by exact `classifyJigsaw` uniqueness search before the browser enables testing.

Generated Chord uses a configurable landmark range. The default is zero to five landmarks, and no generated base board may exceed five. Dead zones are an authoring control on variants, not an unbounded uniqueness shortcut.

Rank buckets are author-triage diagnostics:

- `search-ranked`: analysis completed after requiring bounded search. Higher decisions, depth, nodes, contradictions, and candidate density sort first.
- `logic-only`: current explainable deductions solve the board. More deductions and initial candidates sort first.
- `unranked`: the bounded analyzer stopped at its node limit. These puzzles remain certified unique, but require separate review rather than a numerical ranking.

The ranking is not a player-facing difficulty label. Preserve the included complete analysis records and calibrate the ranking with playtest evidence.

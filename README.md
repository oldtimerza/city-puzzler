# Chord

Chord is an abstract symbol-grammar puzzle. Place Circle, Diamond, Triangle, and Square marks on connected, irregular regions while satisfying line, region, and relationship constraints.

## New Chord

New Chord creates a uniquely solvable `6x6` board. `6x6` is the only supported size for generated production puzzles. Choose a clue profile: **Guided** has 3 immutable clues, **Standard** has 2, and **Expert** has 1.

Generated region maps are proposals, not guarantees: some valid-looking layouts cannot satisfy the complete grammar. Each proposed layout is built into a complete level, then searched exhaustively. The generator returns a puzzle only when its witness passes `isLevelComplete`; an exhausted search is the only basis for an UNSAT result. Seeded randomness changes layout and clue-subset ordering for variety, never the certification result for a given seed.

Uniqueness is certified by finding one solution and exhaustively searching for a second. Clue profiles enumerate subsets at the requested count rather than greedily removing clues; if no subset at that exact count is unique, generation reports `no-unique-clue-set`.

## Symbol Grammar

- **Circle** and **Diamond** may not share an edge.
- **Triangle** counts when it shares an edge with a Diamond.
- **Square** counts when it shares an edge with both a Circle and a Diamond.
- A cell holds at most one symbol.
- Regions display symbol requirements. A matching placed symbol fulfils one requirement in its own region; a Square fulfils its requirement only after both adjacent supports are present.

Tutorial lessons introduce the symbol relationships one at a time. See the [core grammar](docs/chord-core-grammar.md) for the complete formal rules.

## Technical Details

- TypeScript
- Phaser 4.2 for rendering and input
- Vite for local development and production builds
- Vitest for rule, generation, solver, and campaign tests

Game rules, generation, and solving live in pure TypeScript modules and do not depend on Phaser.

## Run Locally

Requirements: Node.js 20 or later and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

Useful commands:

```bash
npm run typecheck
npm test
npm run build
npm run preview
npm run package:itch
```

## Project Layout

```text
src/
  content/       Lesson definitions and puzzle content
  game/          Phaser scene and board rendering
  jigsaw/        Rules, generator, solver, and puzzle types
  main.ts        DOM controls, menu flow, and local progress
tests/           Vitest coverage for rules, generation, and lessons
docs/            Canonical grammar and implementation roadmap
```

## Documentation

- [Core grammar](docs/chord-core-grammar.md): formal symbol and region rules.
- [Puzzle catalog](docs/puzzle-catalog.md): resumable certified batch generation and complexity triage.
- [Implementation plan](docs/implementation-plan/README.md): current design and delivery record.
- [itch.io playtest release](docs/itchio-playtest.md): packaging, upload, and verification steps.

## Contributing

1. Read the core grammar before changing symbols or relationships.
2. Keep game logic renderer-independent in `src/jigsaw/`.
3. Add or update Vitest coverage for every rules, solver, generator, or lesson change.
4. Verify changes before opening a review:

   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

5. Keep documentation aligned with the canonical Circle, Diamond, Triangle, and Square terminology.
6. Update the core grammar and implementation record when gameplay behavior or delivery status changes.

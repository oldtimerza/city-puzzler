# Town Planner

Town Planner is a grid-based logic puzzle about balancing infrastructure across irregular town districts. It combines Jigsaw Sudoku-style row, column, and district quotas with spatial building relationships.

## How To Play

Each level uses a square board divided into connected, irregular districts.

- Place one of every active building in each row, column, and district.
- A cell can hold only one building.
- Wind Farms cannot be orthogonally adjacent to Dams.
- Farms must be orthogonally adjacent to a Dam.

The campaign teaches these rules in sequence:

1. **Irrigation**: 5x5 Dams and Farms.
2. **Crosswinds**: 5x5 Wind Farms and Dams.
3. **Regional Plan**: 6x6 with all three building types.

`New game` opens the campaign. `Practice` offers randomized 6x6 and 8x8 boards. Campaign progress is stored locally in the browser.

## Tech Stack

- TypeScript
- Phaser 3 for rendering and input
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
```

## Project Layout

```text
src/
  content/       Campaign definitions and puzzle content
  game/          Phaser scene and board rendering
  jigsaw/        Rules, generator, solver, and puzzle types
  main.ts        DOM controls, menu flow, and local progress
  styles.css     Town Planner interface styling
tests/           Vitest coverage for rules and campaign levels
docs/            Canonical grammar and implementation roadmap
```

## Documentation

- [Core grammar](docs/city-constraint-puzzle-core-grammar.md): formal board, quota, and relationship rules.
- [Implementation plan](docs/implementation-plan/README.md): completed work and upcoming phases.

## Contributing

1. Read the core grammar before changing puzzle rules or adding building relationships.
2. Keep game logic renderer-independent in `src/jigsaw/`.
3. Add or update Vitest coverage for every rules, solver, generator, or campaign change.
4. Verify changes before opening a review:

   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

5. Keep player-facing building names aligned with the canonical Wind Farm, Dam, and Farm terminology.
6. Update the core grammar and implementation plan when gameplay behavior or delivery status changes.

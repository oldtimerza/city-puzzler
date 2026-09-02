# Town Planner

Town Planner is a grid-based logic puzzle about balancing infrastructure across irregular town districts. It combines Jigsaw Sudoku-style row, column, and district quotas with spatial building relationships.

## How To Play

Each level uses a square board divided into connected, irregular districts.

- Most buildings appear once in every row, column, and district; individual levels can define quota exceptions.
- A cell can hold only one building.
- Solar Panels cannot be orthogonally adjacent to Dams.
- Farms must be orthogonally adjacent to a Dam.
- Factories produce Steel for their district when orthogonally adjacent to both a Solar Panel and a Dam.

The campaign teaches these rules in sequence:

1. **Irrigation**: 5x5 Dams and Farms.
2. **Solar Fields**: 5x5 Solar Panels and Dams.
3. **Regional Plan**: 6x6 with all three building types.
4. **Foundry Basics**: place two Factories to supply Steel.
5. **Steelworks**: place three Factories under the same spatial constraints.
6. **Integrated Plan**: combine Solar Panels, Dams, Farms, and three Factories.

`New game` opens randomized Free play on 6x6 or 8x8 boards with all four building types. Choose one to eight Factory sites to control difficulty; a count cannot exceed the selected board size. Every added Factory adds another Steel district and more spatial and supplier constraints. `Practice` opens the guided level sequence, with a rule card before every lesson. Tutorial progress is stored locally in the browser.

## Tech Stack

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

5. Keep player-facing building names aligned with the canonical Solar Panel, Dam, Farm, and Factory terminology.
6. Update the core grammar and implementation plan when gameplay behavior or delivery status changes.

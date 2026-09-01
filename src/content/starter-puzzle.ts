import { evaluateField } from "../core/field.js";
import type { Placement, Puzzle } from "../core/types.js";

export const STARTER_SOLUTION: readonly Placement[] = [
  { building: "solar", position: { row: 0, column: 1 }, orientation: "east" },
  { building: "solar", position: { row: 4, column: 3 }, orientation: "west" },
  { building: "park", position: { row: 0, column: 4 }, orientation: "north" },
  { building: "greenhouse", position: { row: 2, column: 2 }, orientation: "south" },
  { building: "battery", position: { row: 4, column: 1 }, orientation: "east" },
  { building: "relay", position: { row: 3, column: 2 }, orientation: "north" },
];

const board = { size: 5, blockedCells: [] } as const;

export const STARTER_PUZZLE: Puzzle = {
  board,
  inventory: { solar: 2, park: 1, greenhouse: 1, battery: 1, relay: 1 },
  target: evaluateField(board, STARTER_SOLUTION),
};

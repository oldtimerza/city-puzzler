import { describe, expect, it } from "vitest";

import { calculateResidual, createEmptyField, evaluateField } from "../../src/core/field.js";
import { allInventoryUsed, isPuzzleComplete, validatePlacement, validatePlacements } from "../../src/core/puzzle.js";
import type { Placement, Puzzle } from "../../src/core/types.js";

const inventory = { solar: 2, park: 1, greenhouse: 1, battery: 1, relay: 1 } as const;

describe("placement validation", () => {
  const puzzle: Puzzle = {
    board: { size: 5, blockedCells: [{ row: 1, column: 1 }] },
    inventory,
    target: createEmptyField(5),
  };

  it("reports terrain, occupancy, inventory, and orientation constraints", () => {
    expect(validatePlacement(puzzle, [], { building: "solar", position: { row: 1, column: 1 }, orientation: "north" })).toEqual(["blocked-cell"]);
    expect(validatePlacement(puzzle, [], { building: "relay", position: { row: 2, column: 2 } } as unknown as Placement)).toEqual(["missing-orientation"]);
    expect(validatePlacement(puzzle, [], { building: "park", position: { row: 2, column: 2 }, orientation: "east" })).toEqual([]);
    expect(validatePlacement(puzzle, [{ building: "solar", position: { row: 2, column: 2 }, orientation: "north" }], { building: "park", position: { row: 2, column: 2 }, orientation: "east" })).toEqual([
      "occupied-cell",
    ]);
    expect(
      validatePlacement(
        puzzle,
        [
          { building: "solar", position: { row: 0, column: 0 }, orientation: "north" },
          { building: "solar", position: { row: 0, column: 1 }, orientation: "east" },
        ],
        { building: "solar", position: { row: 0, column: 2 }, orientation: "south" },
      ),
    ).toEqual(["inventory-exhausted"]);
  });

  it("reports invalid states while validating an existing placement list", () => {
    expect(
      validatePlacements(puzzle, [
        { building: "solar", position: { row: 0, column: 0 }, orientation: "north" },
        { building: "solar", position: { row: 0, column: 0 }, orientation: "east" },
        { building: "relay", position: { row: 5, column: 0 } } as unknown as Placement,
      ]),
    ).toEqual(["occupied-cell", "out-of-bounds", "missing-orientation"]);
  });
});

describe("residuals and completion", () => {
  const solution: readonly Placement[] = [
    { building: "solar", position: { row: 0, column: 0 }, orientation: "north" },
    { building: "solar", position: { row: 4, column: 4 }, orientation: "south" },
    { building: "park", position: { row: 0, column: 4 }, orientation: "west" },
    { building: "greenhouse", position: { row: 2, column: 2 }, orientation: "east" },
    { building: "battery", position: { row: 4, column: 0 }, orientation: "north" },
    { building: "relay", position: { row: 2, column: 4 }, orientation: "west" },
  ];
  const puzzle: Puzzle = {
    board: { size: 5, blockedCells: [] },
    inventory,
    target: evaluateField({ size: 5, blockedCells: [] }, solution),
  };

  it("calculates target minus current for every resource", () => {
    const residual = calculateResidual(puzzle.target, createEmptyField(5));

    expect(residual[0]![0]).toEqual({ electricity: 2, nature: 0 });
    expect(residual[2]![2]).toEqual({ electricity: -1, nature: 1 });
  });

  it("requires a valid, complete inventory that exactly matches the target", () => {
    expect(allInventoryUsed(puzzle, solution)).toBe(true);
    expect(isPuzzleComplete(puzzle, solution)).toBe(true);
    expect(allInventoryUsed(puzzle, solution.slice(0, -1))).toBe(false);
    expect(isPuzzleComplete(puzzle, solution.slice(0, -1))).toBe(false);
  });
});

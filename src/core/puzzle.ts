import { evaluateField, fieldsMatch, isBlocked, isInBounds, samePosition } from "./field.js";
import type { BuildingKind, Placement, Puzzle } from "./types.js";

export type PlacementIssue = "out-of-bounds" | "blocked-cell" | "occupied-cell" | "inventory-exhausted" | "missing-orientation";

export function validatePlacement(puzzle: Puzzle, placements: readonly Placement[], candidate: Placement): PlacementIssue[] {
  const issues: PlacementIssue[] = [];
  if (!isInBounds(puzzle.board, candidate.position)) {
    issues.push("out-of-bounds");
  } else if (isBlocked(puzzle.board, candidate.position)) {
    issues.push("blocked-cell");
  } else if (placements.some((placement) => samePosition(placement.position, candidate.position))) {
    issues.push("occupied-cell");
  }

  if (!candidate.orientation) {
    issues.push("missing-orientation");
  }

  if (countBuilding(placements, candidate.building) >= puzzle.inventory[candidate.building]) {
    issues.push("inventory-exhausted");
  }

  return issues;
}

export function validatePlacements(puzzle: Puzzle, placements: readonly Placement[]): PlacementIssue[] {
  return placements.flatMap((placement, index) => validatePlacement(puzzle, placements.slice(0, index), placement));
}

export function allInventoryUsed(puzzle: Puzzle, placements: readonly Placement[]): boolean {
  return (Object.keys(puzzle.inventory) as BuildingKind[]).every(
    (building) => countBuilding(placements, building) === puzzle.inventory[building],
  );
}

export function isPuzzleComplete(puzzle: Puzzle, placements: readonly Placement[]): boolean {
  return validatePlacements(puzzle, placements).length === 0 && allInventoryUsed(puzzle, placements) && fieldsMatch(evaluateField(puzzle.board, placements), puzzle.target);
}

function countBuilding(placements: readonly Placement[], building: BuildingKind): number {
  return placements.filter((placement) => placement.building === building).length;
}

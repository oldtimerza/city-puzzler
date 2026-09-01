import { getBuildingEffects } from "./buildings.js";
import { RESOURCE_TYPES, type Board, type Placement, type Position, type ResourceField, type ResourceVector } from "./types.js";

export function createEmptyField(size: number): ResourceField {
  return Array.from({ length: size }, () => Array.from({ length: size }, emptyVector));
}

export function evaluateField(board: Board, placements: readonly Placement[]): ResourceField {
  const field = createEmptyField(board.size);

  for (const placement of placements) {
    for (const effect of getBuildingEffects(placement.building, placement.orientation)) {
      const affected = addPosition(placement.position, effect.offset);

      if (isInBounds(board, affected)) {
        field[affected.row]![affected.column]![effect.resource] += effect.amount;
      }
    }
  }

  return field;
}

export function calculateResidual(target: ResourceField, current: ResourceField): ResourceField {
  assertMatchingFieldSizes(target, current);

  return target.map((targetRow, row) =>
    targetRow.map((targetCell, column) => ({
      electricity: targetCell.electricity - current[row]![column]!.electricity,
      nature: targetCell.nature - current[row]![column]!.nature,
    })),
  );
}

export function fieldsMatch(left: ResourceField, right: ResourceField): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (row, rowIndex) =>
      row.length === right[rowIndex]?.length &&
      row.every((cell, column) => RESOURCE_TYPES.every((resource) => cell[resource] === right[rowIndex]![column]![resource])),
  );
}

export function isInBounds(board: Board, position: Position): boolean {
  return position.row >= 0 && position.row < board.size && position.column >= 0 && position.column < board.size;
}

export function isBlocked(board: Board, position: Position): boolean {
  return board.blockedCells.some((blocked) => samePosition(blocked, position));
}

export function samePosition(left: Position, right: Position): boolean {
  return left.row === right.row && left.column === right.column;
}

function addPosition(left: Position, right: Position): Position {
  return { row: left.row + right.row, column: left.column + right.column };
}

function emptyVector(): ResourceVector {
  return { electricity: 0, nature: 0 };
}

function assertMatchingFieldSizes(left: ResourceField, right: ResourceField): void {
  if (left.length !== right.length || left.some((row, index) => row.length !== right[index]?.length)) {
    throw new Error("Target and current fields must have matching dimensions.");
  }
}

import { samePosition } from "../core/field.js";
import type { Position } from "../core/types.js";
import { SERVICE_TYPES, type JigsawLevel, type ServicePlacement, type ServiceType } from "./types.js";

export type LevelIssue = "invalid-size" | "invalid-region-map" | "invalid-region-size" | "disconnected-region" | "invalid-active-services" | "invalid-inventory";

export type PlacementIssue = "out-of-bounds" | "occupied-cell" | "inventory-exhausted" | "row-conflict" | "column-conflict" | "region-conflict" | "generator-water-conflict" | "farm-dam-missing";

export function validateLevel(level: JigsawLevel): LevelIssue[] {
  const issues: LevelIssue[] = [];

  if (level.size < 1) {
    issues.push("invalid-size");
  }

  const activeServices = new Set(level.activeServices);

  if (activeServices.size === 0 || activeServices.size !== level.activeServices.length || [...activeServices].some((service) => !SERVICE_TYPES.includes(service))) {
    issues.push("invalid-active-services");
  }

  if (level.regions.length !== level.size || level.regions.some((row) => row.length !== level.size)) {
    issues.push("invalid-region-map");
    return issues;
  }

  const regions = new Map<string, Position[]>();

  for (let row = 0; row < level.size; row += 1) {
    for (let column = 0; column < level.size; column += 1) {
      const region = level.regions[row]![column]!;
      const cells = regions.get(region) ?? [];
      cells.push({ row, column });
      regions.set(region, cells);
    }
  }

  if (regions.size !== level.size || [...regions.values()].some((cells) => cells.length !== level.size)) {
    issues.push("invalid-region-size");
  }

  if ([...regions.values()].some((cells) => !isConnected(cells))) {
    issues.push("disconnected-region");
  }

  if (SERVICE_TYPES.some((service) => level.inventory[service] !== (activeServices.has(service) ? level.size : 0))) {
    issues.push("invalid-inventory");
  }

  return issues;
}

export function validatePlacement(level: JigsawLevel, placements: readonly ServicePlacement[], candidate: ServicePlacement): PlacementIssue[] {
  const issues: PlacementIssue[] = [];

  if (!isInBounds(level, candidate.position)) {
    issues.push("out-of-bounds");
    return issues;
  }

  if (placements.some((placement) => samePosition(placement.position, candidate.position))) {
    issues.push("occupied-cell");
  }

  if (countService(placements, candidate.service) >= level.inventory[candidate.service]) {
    issues.push("inventory-exhausted");
  }

  if (placements.some((placement) => placement.service === candidate.service && placement.position.row === candidate.position.row)) {
    issues.push("row-conflict");
  }

  if (placements.some((placement) => placement.service === candidate.service && placement.position.column === candidate.position.column)) {
    issues.push("column-conflict");
  }

  if (placements.some((placement) => placement.service === candidate.service && regionAt(level, placement.position) === regionAt(level, candidate.position))) {
    issues.push("region-conflict");
  }

  if (
    (candidate.service === "generator" && placements.some((placement) => placement.service === "water" && areOrthogonallyAdjacent(placement.position, candidate.position))) ||
    (candidate.service === "water" && placements.some((placement) => placement.service === "generator" && areOrthogonallyAdjacent(placement.position, candidate.position)))
  ) {
    issues.push("generator-water-conflict");
  }

  if (candidate.service === "farm" && !placements.some((placement) => placement.service === "water" && areOrthogonallyAdjacent(placement.position, candidate.position))) {
    issues.push("farm-dam-missing");
  }

  return issues;
}

export function validatePlacements(level: JigsawLevel, placements: readonly ServicePlacement[]): PlacementIssue[] {
  return placements.flatMap((placement, index) => validatePlacement(level, placements.slice(0, index), placement));
}

export function legalPositions(level: JigsawLevel, placements: readonly ServicePlacement[], service: ServiceType, orientation: ServicePlacement["orientation"]): Position[] {
  const positions: Position[] = [];

  for (let row = 0; row < level.size; row += 1) {
    for (let column = 0; column < level.size; column += 1) {
      const candidate = { service, position: { row, column }, orientation };

      if (validatePlacement(level, placements, candidate).length === 0) {
        positions.push(candidate.position);
      }
    }
  }

  return positions;
}

export function isLevelComplete(level: JigsawLevel, placements: readonly ServicePlacement[]): boolean {
  return validateLevel(level).length === 0
    && validatePlacements(level, placements).length === 0
    && unsuppliedFarms(placements).length === 0
    && level.activeServices.every((service) => countService(placements, service) === level.inventory[service]);
}

export function isFarmSupplied(placements: readonly ServicePlacement[], farm: ServicePlacement): boolean {
  return farm.service === "farm" && placements.some((placement) => placement.service === "water" && areOrthogonallyAdjacent(placement.position, farm.position));
}

export function unsuppliedFarms(placements: readonly ServicePlacement[]): ServicePlacement[] {
  return placements.filter((placement) => placement.service === "farm" && !isFarmSupplied(placements, placement));
}

export function regionAt(level: JigsawLevel, position: Position): string {
  return level.regions[position.row]![position.column]!;
}

function countService(placements: readonly ServicePlacement[], service: ServiceType): number {
  return placements.filter((placement) => placement.service === service).length;
}

function isConnected(cells: readonly Position[]): boolean {
  if (cells.length === 0) {
    return false;
  }

  const cellKeys = new Set(cells.map(positionKey));
  const visited = new Set<string>();
  const queue = [cells[0]!];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = positionKey(current);

    if (visited.has(currentKey)) {
      continue;
    }

    visited.add(currentKey);

    for (const neighbour of [
      { row: current.row - 1, column: current.column },
      { row: current.row + 1, column: current.column },
      { row: current.row, column: current.column - 1 },
      { row: current.row, column: current.column + 1 },
    ]) {
      if (cellKeys.has(positionKey(neighbour)) && !visited.has(positionKey(neighbour))) {
        queue.push(neighbour);
      }
    }
  }

  return visited.size === cells.length;
}

function positionKey(position: Position): string {
  return `${position.row}:${position.column}`;
}

function isInBounds(level: JigsawLevel, position: Position): boolean {
  return position.row >= 0 && position.row < level.size && position.column >= 0 && position.column < level.size;
}

function areOrthogonallyAdjacent(left: Position, right: Position): boolean {
  return Math.abs(left.row - right.row) + Math.abs(left.column - right.column) === 1;
}

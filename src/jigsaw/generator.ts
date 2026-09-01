import type { Direction, Position } from "../core/types.js";
import { isLevelComplete, validateLevel } from "./rules.js";
import { SERVICE_TYPES, type JigsawLevel, type JigsawPuzzle, type ServicePlacement, type ServiceType } from "./types.js";

export const BOARD_SIZES = [5, 6, 8] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

const PLACEMENT_ORDER: readonly ServiceType[] = ["water", "farm", "generator"];
const ORIENTATIONS: readonly Direction[] = ["north", "east", "south", "west"];
const cellsBySize = new Map<number, readonly Position[]>();

export interface GeneratedJigsawLevel extends JigsawPuzzle {
  readonly seed: number;
}

export function generateJigsawLevel(seed: number, size: BoardSize = 6, activeServices: readonly ServiceType[] = SERVICE_TYPES): GeneratedJigsawLevel {
  if (size === 5 && activeServices.length === SERVICE_TYPES.length) {
    throw new Error("The full Wind Farm-Dam-Farm profile is not supported on a 5x5 board.");
  }

  const random = seededRandom(seed);
  let regions: readonly (readonly string[])[] | null = null;
  let solution: readonly ServicePlacement[] | null = null;

  for (let attempt = 0; attempt < 12 && solution === null; attempt += 1) {
    const candidateRegions = buildIrregularRegions(size, random);
    const candidateSolution = solveServiceLayout(candidateRegions, size, activeServices, random);

    if (candidateSolution !== null) {
      regions = candidateRegions;
      solution = candidateSolution;
    }
  }

  if (regions === null || solution === null) {
    throw new Error(`Seed ${seed} could not produce a solvable ${size}x${size} Jigsaw level.`);
  }

  const transform = Math.floor(random() * 8);
  const level: JigsawLevel = {
    size,
    regions: transformRegions(regions, size, transform),
    activeServices,
    inventory: inventoryFor(size, activeServices),
  };
  const transformedSolution = solution.map((placement) => ({
    ...placement,
    position: transformPosition(placement.position, size, transform),
    orientation: transformDirection(placement.orientation, transform),
  }));

  if (validateLevel(level).length > 0 || !isLevelComplete(level, transformedSolution)) {
    throw new Error(`Seed ${seed} produced an invalid ${size}x${size} Jigsaw level.`);
  }

  return {
    level,
    solution: transformedSolution,
    clues: [],
    title: `${size}x${size} Practice`,
    introduction: "Build a balanced town plan with a fresh district map.",
    seed,
  };
}

export function jigsawLevelSignature(puzzle: Pick<JigsawPuzzle, "level" | "solution">): string {
  const regions = puzzle.level.regions.map((row) => row.join("")).join("/");
  const services = puzzle.solution.map((placement) => `${placement.service}:${placement.position.row}:${placement.position.column}`).join("/");

  return `${puzzle.level.size}|${regions}|${services}`;
}

function transformRegions(regions: readonly (readonly string[])[], size: BoardSize, transform: number): readonly (readonly string[])[] {
  const result = Array.from({ length: size }, () => Array.from({ length: size }, () => ""));

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const position = transformPosition({ row, column }, size, transform);
      result[position.row]![position.column] = regions[row]![column]!;
    }
  }

  return result;
}

function buildIrregularRegions(size: BoardSize, random: () => number): readonly (readonly string[])[] {
  const regions = copyRegions(initialRegions(size));
  let bestRegions = copyRegions(regions);
  let bestScore = shapeScore(bestRegions, size);

  for (let attempt = 0; attempt < size * size * 48; attempt += 1) {
    const first = allCells(size)[Math.floor(random() * size * size)]!;
    const second = allCells(size)[Math.floor(random() * size * size)]!;
    const firstRegion = regions[first.row]![first.column]!;
    const secondRegion = regions[second.row]![second.column]!;

    if (firstRegion === secondRegion) {
      continue;
    }

    regions[first.row]![first.column] = secondRegion;
    regions[second.row]![second.column] = firstRegion;

    if (!regionIsConnected(regions, size, firstRegion) || !regionIsConnected(regions, size, secondRegion)) {
      regions[first.row]![first.column] = firstRegion;
      regions[second.row]![second.column] = secondRegion;
      continue;
    }

    const score = shapeScore(regions, size);

    if (!hasSimpleRegionShape(regions, size) && score > bestScore) {
      bestRegions = copyRegions(regions);
      bestScore = score;
    }
  }

  return bestRegions;
}

function initialRegions(size: BoardSize): string[][] {
  if (size === 5) {
    return [
      ["A", "A", "B", "B", "B"],
      ["A", "A", "D", "B", "B"],
      ["A", "D", "D", "C", "C"],
      ["D", "D", "E", "E", "C"],
      ["E", "E", "E", "C", "C"],
    ];
  }

  const regionHeight = size / 2;

  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => regionName(Math.floor(row / regionHeight) * regionHeight + Math.floor(column / 2))),
  );
}

function regionIsConnected(regions: readonly (readonly string[])[], size: BoardSize, region: string): boolean {
  const cells = allCells(size).filter((cell) => regions[cell.row]![cell.column] === region);
  const visited = new Set<string>();
  const queue = [cells[0]!];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = positionKey(current);

    if (visited.has(key)) {
      continue;
    }

    visited.add(key);

    for (const neighbour of orthogonalNeighbours(current)) {
      if (inBounds(neighbour, size) && regions[neighbour.row]![neighbour.column] === region && !visited.has(positionKey(neighbour))) {
        queue.push(neighbour);
      }
    }
  }

  return visited.size === cells.length;
}

function shapeScore(regions: readonly (readonly string[])[], size: BoardSize): number {
  return Array.from({ length: size }, (_, index) => regionName(index)).reduce((score, region) => {
    const cells = allCells(size).filter((cell) => regions[cell.row]![cell.column] === region);
    const rows = new Set(cells.map((cell) => cell.row));
    const columns = new Set(cells.map((cell) => cell.column));
    const bends = cells.filter((cell) => hasHorizontalAndVerticalNeighbour(regions, size, region, cell)).length;
    const rowWidths = new Set([...rows].map((row) => cells.filter((cell) => cell.row === row).length));
    const columnHeights = new Set([...columns].map((column) => cells.filter((cell) => cell.column === column).length));
    const isRectangle = rows.size * columns.size === cells.length;

    return score
      + (rows.size === 1 || columns.size === 1 ? -200 : 0)
      + (isSimpleLShape(cells) ? -100 : 0)
      + (isRectangle ? -30 : 0)
      + Math.min(rows.size, 3) * 8
      + Math.min(columns.size, 3) * 8
      + (rowWidths.size + columnHeights.size) * 5
      + bends * 2;
  }, 0);
}

function hasHorizontalAndVerticalNeighbour(regions: readonly (readonly string[])[], size: BoardSize, region: string, position: Position): boolean {
  const neighbours = orthogonalNeighbours(position).filter((neighbour) => inBounds(neighbour, size) && regions[neighbour.row]![neighbour.column] === region);

  return neighbours.some((neighbour) => neighbour.row === position.row) && neighbours.some((neighbour) => neighbour.column === position.column);
}

function isSimpleLShape(cells: readonly Position[]): boolean {
  return cells.some((corner) => cells.every((cell) => cell.row === corner.row || cell.column === corner.column));
}

function hasSimpleRegionShape(regions: readonly (readonly string[])[], size: BoardSize): boolean {
  return Array.from({ length: size }, (_, index) => regionName(index)).some((region) => {
    const cells = allCells(size).filter((cell) => regions[cell.row]![cell.column] === region);
    const rows = new Set(cells.map((cell) => cell.row));
    const columns = new Set(cells.map((cell) => cell.column));

    return rows.size === 1 || columns.size === 1 || isSimpleLShape(cells);
  });
}

function solveServiceLayout(regions: readonly (readonly string[])[], size: BoardSize, activeServices: readonly ServiceType[], random: () => number): readonly ServicePlacement[] | null {
  const orderedServices = PLACEMENT_ORDER.filter((service) => activeServices.includes(service));
  return placeServiceInRows(regions, size, orderedServices, random, 0, 0, []);
}

function placeServiceInRows(
  regions: readonly (readonly string[])[],
  size: BoardSize,
  orderedServices: readonly ServiceType[],
  random: () => number,
  serviceIndex: number,
  row: number,
  placements: readonly ServicePlacement[],
): readonly ServicePlacement[] | null {
  if (serviceIndex === orderedServices.length) {
    return placements;
  }

  if (row === size) {
    return placeServiceInRows(regions, size, orderedServices, random, serviceIndex + 1, 0, placements);
  }

  const service = orderedServices[serviceIndex]!;
  const sameService = placements.filter((placement) => placement.service === service);

  for (const position of shuffled(allCells(size).filter((cell) => cell.row === row), random)) {
    const region = regions[position.row]![position.column]!;

    if (
      sameService.some((placement) => placement.position.column === position.column || regions[placement.position.row]![placement.position.column] === region)
      || placements.some((placement) => placement.position.row === position.row && placement.position.column === position.column)
      || !servicePositionIsAllowed(service, position, placements)
    ) {
      continue;
    }

    const result = placeServiceInRows(regions, size, orderedServices, random, serviceIndex, row + 1, [
      ...placements,
      { service, position, orientation: ORIENTATIONS[Math.floor(random() * ORIENTATIONS.length)]! },
    ]);

    if (result !== null) {
      return result;
    }
  }

  return null;
}

function servicePositionIsAllowed(service: ServiceType, position: Position, placements: readonly ServicePlacement[]): boolean {
  if (service === "water" || service === "generator") {
    const conflictingService = service === "water" ? "generator" : "water";
    return placements.filter((placement) => placement.service === conflictingService).every((placement) => !areOrthogonallyAdjacent(placement.position, position));
  }

  if (service === "farm") {
    return placements.filter((placement) => placement.service === "water").some((water) => areOrthogonallyAdjacent(water.position, position));
  }

  return true;
}

function areOrthogonallyAdjacent(first: Position, second: Position): boolean {
  return Math.abs(first.row - second.row) + Math.abs(first.column - second.column) === 1;
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }

  return result;
}

function copyRegions(regions: readonly (readonly string[])[]): string[][] {
  return regions.map((row) => [...row]);
}

function inventoryFor(size: BoardSize, activeServices: readonly ServiceType[]): Readonly<Record<ServiceType, number>> {
  return {
    generator: activeServices.includes("generator") ? size : 0,
    water: activeServices.includes("water") ? size : 0,
    farm: activeServices.includes("farm") ? size : 0,
  };
}

function allCells(size: BoardSize): readonly Position[] {
  const existing = cellsBySize.get(size);

  if (existing) {
    return existing;
  }

  const cells = Array.from({ length: size * size }, (_, index) => ({ row: Math.floor(index / size), column: index % size }));
  cellsBySize.set(size, cells);
  return cells;
}

function orthogonalNeighbours(position: Position): Position[] {
  return [
    { row: position.row - 1, column: position.column },
    { row: position.row + 1, column: position.column },
    { row: position.row, column: position.column - 1 },
    { row: position.row, column: position.column + 1 },
  ];
}

function inBounds(position: Position, size: BoardSize): boolean {
  return position.row >= 0 && position.row < size && position.column >= 0 && position.column < size;
}

function positionKey(position: Position): string {
  return `${position.row}:${position.column}`;
}

function regionName(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function transformPosition(position: Position, size: BoardSize, transform: number): Position {
  let { row, column } = position;
  const rotations = transform % 4;

  for (let index = 0; index < rotations; index += 1) {
    [row, column] = [column, size - 1 - row];
  }

  if (transform >= 4) {
    column = size - 1 - column;
  }

  return { row, column };
}

function transformDirection(direction: Direction, transform: number): Direction {
  let result = direction;

  for (let index = 0; index < transform % 4; index += 1) {
    result = rotateClockwise(result);
  }

  if (transform >= 4) {
    result = result === "east" ? "west" : result === "west" ? "east" : result;
  }

  return result;
}

function rotateClockwise(direction: Direction): Direction {
  switch (direction) {
    case "north":
      return "east";
    case "east":
      return "south";
    case "south":
      return "west";
    case "west":
      return "north";
  }
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

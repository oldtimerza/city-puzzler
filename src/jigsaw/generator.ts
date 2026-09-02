import type { Position } from "./position.js";
import { isFactorySupplied, isLevelComplete, validateLevel, validatePlacement } from "./rules.js";
import { countSolutions } from "./solver.js";
import { SERVICE_RESOURCES, SERVICE_TYPES, type JigsawLevel, type JigsawPuzzle, type RegionResourceRequirements, type ServicePlacement, type ServiceQuota, type ServiceType } from "./types.js";

export const BOARD_SIZES = [5, 6, 8] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

const PLACEMENT_ORDER: readonly ServiceType[] = ["water", "farm", "generator"];
const cellsBySize = new Map<number, readonly Position[]>();

export interface GeneratedJigsawLevel extends JigsawPuzzle {
  readonly seed: number;
}

export type QuotaOverrides = Readonly<Partial<Record<ServiceType, ServiceQuota>>>;
export type ChordDifficulty = "guided" | "standard" | "expert";

const CHORD_CLUE_COUNTS: Readonly<Record<ChordDifficulty, number>> = {
  guided: 10,
  standard: 6,
  expert: 2,
};

export function generateJigsawLevel(
  seed: number,
  size: BoardSize = 6,
  activeServices: readonly ServiceType[] = SERVICE_TYPES,
  quotaOverrides: QuotaOverrides = {},
  steelRegions: readonly string[] = [],
): GeneratedJigsawLevel {
  if (size === 5 && (["generator", "water", "farm"] as const).every((service) => activeServices.includes(service))) {
    throw new Error("The full Circle-Diamond-Triangle profile is not supported on a 5x5 board.");
  }

  const random = seededRandom(seed);
  let regions: readonly (readonly string[])[] | null = null;
  let solution: readonly ServicePlacement[] | null = null;
  let selectedSteelRegions: readonly string[] = steelRegions;
  const quotas = quotasFor(size, activeServices, quotaOverrides);
  const requiresFullFactoryLayout = activeServices.includes("factory") && quotas.factory.total === size;

  for (let attempt = 0; attempt < 12 && solution === null; attempt += 1) {
    const candidateRegions = buildIrregularRegions(size, random);
    const baseSolution = solveServiceLayout(candidateRegions, size, activeServices.filter((service) => service !== "factory"), random);
    const factoryCandidateRegions = steelRegions.length > 0 ? steelRegions : [...new Set(candidateRegions.flat())];
    const factoryPlacementLevel: JigsawLevel = {
      size,
      regions: candidateRegions,
      regionRequirements: resourceRequirementsForRegions(candidateRegions, activeServices, factoryCandidateRegions, quotas.factory.total),
      activeServices,
      quotas,
    };
    const candidateSolution = requiresFullFactoryLayout
      ? solveFullFactoryLayout(factoryPlacementLevel, random)
      : baseSolution === null
        ? null
        : activeServices.includes("factory")
          ? placeFactories(factoryPlacementLevel, baseSolution, random)
          : baseSolution;
    const candidateSteelRegions = activeServices.includes("factory") && steelRegions.length === 0 && candidateSolution !== null
      ? candidateSolution.filter((placement) => placement.service === "factory").map((placement) => candidateRegions[placement.position.row]![placement.position.column]!)
      : steelRegions;
    const candidateLevel: JigsawLevel = {
      size,
      regions: candidateRegions,
      regionRequirements: resourceRequirementsForRegions(candidateRegions, activeServices, candidateSteelRegions, quotas.factory.total),
      activeServices,
      quotas,
    };

    if (candidateSolution !== null && isLevelComplete(candidateLevel, candidateSolution)) {
      regions = candidateRegions;
      solution = candidateSolution;
      selectedSteelRegions = candidateSteelRegions;
    }
  }

  if (regions === null || solution === null) {
    throw new Error(`Seed ${seed} could not produce a solvable ${size}x${size} Jigsaw level.`);
  }

  const transform = Math.floor(random() * 8);
  const level: JigsawLevel = {
    size,
    regions: transformRegions(regions, size, transform),
    regionRequirements: resourceRequirementsForRegions(regions, activeServices, selectedSteelRegions, quotas.factory.total),
    activeServices,
    quotas,
  };
  const transformedSolution = solution.map((placement) => ({
    ...placement,
    position: transformPosition(placement.position, size, transform),
  }));

  if (validateLevel(level).length > 0 || !isLevelComplete(level, transformedSolution)) {
    throw new Error(`Seed ${seed} produced an invalid ${size}x${size} Jigsaw level.`);
  }

  return {
    level,
    solution: transformedSolution,
    clues: [],
    title: `${size}x${size} Practice`,
    introduction: activeServices.includes("factory")
      ? "Balance all four symbols across a fresh region map."
      : "Build a balanced shape grammar across a fresh region map.",
    seed,
  };
}

export function generateChordLevel(seed: number, difficulty: ChordDifficulty = "standard"): GeneratedJigsawLevel {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidateSeed = (seed + attempt) >>> 0;
    const generated = generateJigsawLevel(candidateSeed, 6);
    const clues = reduceToUniqueClues(generated.level, generated.solution, CHORD_CLUE_COUNTS[difficulty], seededRandom(candidateSeed ^ 0x9e3779b9));

    if (clues.length === CHORD_CLUE_COUNTS[difficulty] && countSolutions(generated.level, clues) === 1) {
      return {
        ...generated,
        clues,
        title: "Chord",
        introduction: "Balance every symbol across the board's rows, columns, and regions.",
      };
    }
  }

  throw new Error(`Could not generate a uniquely solvable ${difficulty} Chord from seed ${seed}.`);
}

function reduceToUniqueClues(
  level: JigsawLevel,
  solution: readonly ServicePlacement[],
  target: number,
  random: () => number,
): readonly ServicePlacement[] {
  let clues = [...solution];

  for (const candidate of shuffled(solution, random)) {
    if (clues.length <= target) {
      break;
    }

    const next = clues.filter((placement) => placement !== candidate);

    if (countSolutions(level, next) === 1) {
      clues = next;
    }
  }

  return clues;
}

function resourceRequirementsForRegions(
  regions: readonly (readonly string[])[],
  activeServices: readonly ServiceType[],
  steelRegions: readonly string[],
  factorySteelDemandCount: number,
): Readonly<Record<string, RegionResourceRequirements>> {
  const requirements: Record<string, RegionResourceRequirements> = {};
  const steelDemandRegions = new Set(
    steelRegions.length > 0
      ? steelRegions
      : activeServices.includes("factory")
        ? [...new Set(regions.flat())].slice(0, factorySteelDemandCount)
        : [],
  );

  for (const region of new Set(regions.flat())) {
    requirements[region] = {
      ...Object.fromEntries(activeServices.filter((service) => service !== "factory").map((service) => [SERVICE_RESOURCES[service], 1])),
      ...(steelDemandRegions.has(region) ? { steel: 1 } : {}),
    };
  }

  return requirements;
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

function solveServiceLayout(
  regions: readonly (readonly string[])[],
  size: BoardSize,
  activeServices: readonly ServiceType[],
  random: () => number,
  initialPlacements: readonly ServicePlacement[] = [],
  requireFactorySupport = false,
): readonly ServicePlacement[] | null {
  const orderedServices = PLACEMENT_ORDER.filter((service) => activeServices.includes(service));
  return placeServiceInRows(regions, size, orderedServices, random, 0, 0, initialPlacements, requireFactorySupport);
}

function solveFullFactoryLayout(level: JigsawLevel, random: () => number): readonly ServicePlacement[] | null {
  return placeFactoryRows(level.regions, level.size as BoardSize, random, 0, []);
}

function placeFactoryRows(
  regions: readonly (readonly string[])[],
  size: BoardSize,
  random: () => number,
  row: number,
  placements: readonly ServicePlacement[],
): readonly ServicePlacement[] | null {
  if (row === size) {
    return solveServiceLayout(regions, size, ["water", "farm", "generator"], random, placements, true);
  }

  for (const position of shuffled(allCells(size).filter((cell) => cell.row === row), random)) {
    const region = regions[position.row]![position.column]!;

    if (placements.some((placement) => placement.position.column === position.column || regions[placement.position.row]![placement.position.column] === region)) {
      continue;
    }

    // Preserve existing seeded layouts after removing the unused orientation value.
    random();
    const result = placeFactoryRows(regions, size, random, row + 1, [
      ...placements,
      { service: "factory", position },
    ]);

    if (result !== null) {
      return result;
    }
  }

  return null;
}

function placeFactories(level: JigsawLevel, placements: readonly ServicePlacement[], random: () => number): readonly ServicePlacement[] | null {
  if (placements.filter((placement) => placement.service === "factory").length === level.quotas.factory.total) {
    return placements;
  }

  for (const position of shuffled(allCells(level.size as BoardSize), random)) {
    // Preserve existing seeded layouts after removing the unused orientation value.
    random();
    const candidate: ServicePlacement = {
      service: "factory",
      position,
    };
    const next = [...placements, candidate];

    if (validatePlacement(level, placements, candidate).length > 0 || !isFactorySupplied(next, candidate)) {
      continue;
    }

    const result = placeFactories(level, next, random);

    if (result !== null) {
      return result;
    }
  }

  return null;
}

function placeServiceInRows(
  regions: readonly (readonly string[])[],
  size: BoardSize,
  orderedServices: readonly ServiceType[],
  random: () => number,
  serviceIndex: number,
  row: number,
  placements: readonly ServicePlacement[],
  requireFactorySupport: boolean,
): readonly ServicePlacement[] | null {
  if (serviceIndex === orderedServices.length) {
    return !requireFactorySupport || placements.filter((placement) => placement.service === "factory").every((factory) => isFactorySupplied(placements, factory))
      ? placements
      : null;
  }

  if (row === size) {
    return placeServiceInRows(regions, size, orderedServices, random, serviceIndex + 1, 0, placements, requireFactorySupport);
  }

  const service = orderedServices[serviceIndex]!;
  const sameService = placements.filter((placement) => placement.service === service);

  for (const position of shuffled(allCells(size).filter((cell) => cell.row === row), random)) {
    const region = regions[position.row]![position.column]!;

    if (
      sameService.some((placement) => placement.position.column === position.column || regions[placement.position.row]![placement.position.column] === region)
      || placements.some((placement) => placement.position.row === position.row && placement.position.column === position.column)
      || !servicePositionIsAllowed(service, position, placements, requireFactorySupport)
    ) {
      continue;
    }

    // Preserve existing seeded layouts after removing the unused orientation value.
    random();
    const result = placeServiceInRows(regions, size, orderedServices, random, serviceIndex, row + 1, [
      ...placements,
      { service, position },
    ], requireFactorySupport);

    if (result !== null) {
      return result;
    }
  }

  return null;
}

function servicePositionIsAllowed(service: ServiceType, position: Position, placements: readonly ServicePlacement[], requireFactorySupport: boolean): boolean {
  if (
    requireFactorySupport
    && (service === "water" || service === "generator")
    && !placements.some((placement) => placement.service === "factory" && areOrthogonallyAdjacent(placement.position, position))
  ) {
    return false;
  }

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

function quotasFor(size: BoardSize, activeServices: readonly ServiceType[], overrides: QuotaOverrides): Readonly<Record<ServiceType, ServiceQuota>> {
  return Object.fromEntries(
    SERVICE_TYPES.map((service) => [
      service,
      overrides[service] ?? {
        total: activeServices.includes(service) ? service === "factory" ? Math.min(4, size) : size : 0,
        maxPerRow: activeServices.includes(service) ? 1 : 0,
        maxPerColumn: activeServices.includes(service) ? 1 : 0,
        maxPerRegion: activeServices.includes(service) ? 1 : 0,
      },
    ]),
  ) as Readonly<Record<ServiceType, ServiceQuota>>;
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

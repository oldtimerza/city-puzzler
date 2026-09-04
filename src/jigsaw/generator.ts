import type { Position } from "./position.js";
import { isLevelComplete, validateLevel } from "./rules.js";
import { classifyJigsaw, solveJigsawExactly } from "./solver.js";
import { SERVICE_RESOURCES, SERVICE_TYPES, type JigsawLevel, type JigsawPuzzle, type Landmark, type RegionDefinition, type ServicePlacement, type ServiceQuota, type ServiceType } from "./types.js";

/** New Chord layouts are deliberately constrained to the production 6x6 board. */
export const BOARD_SIZES = [6] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];
export const CORE_SERVICE_TYPES = ["generator", "water", "farm", "factory"] as const;

const cellsBySize = new Map<number, readonly Position[]>();

export interface GeneratedJigsawLevel extends JigsawPuzzle {
  readonly seed: number;
}

export interface ChordBaseBoard {
  readonly seed: number;
  readonly level: JigsawLevel;
  readonly solution: readonly ServicePlacement[];
}

export interface ChordVariantOptions {
  readonly deadZoneCount: number;
  readonly clueCount: number;
  readonly variationSeed?: number;
}

export type ChordVariantResult =
  | Readonly<{ status: "generated"; puzzle: JigsawPuzzle; deadZones: readonly Position[] }>
  | Readonly<{ status: "no-unique-variant" }>;

export type ChordProfileResult =
  | Readonly<{ difficulty: ChordDifficulty; status: "generated"; puzzle: GeneratedJigsawLevel }>
  | Readonly<{ difficulty: ChordDifficulty; status: "failed"; reason: string }>;

export type CertificationFailure = "invalid-layout" | "unsatisfiable-layout" | "no-unique-clue-set" | "internal-failure";
export type CertifiedLayoutResult =
  | Readonly<{ status: "solved"; puzzle: GeneratedJigsawLevel }>
  | Readonly<{ status: CertificationFailure; issues?: readonly string[] }>;

export type QuotaOverrides = Readonly<Partial<Record<ServiceType, ServiceQuota>>>;
export type ChordDifficulty = "guided" | "standard" | "expert";
export type RegionTopology = "connected" | "tunnels";
export interface LandmarkLimits {
  readonly minimum?: number;
  readonly maximum?: number;
}
export const DEFAULT_LANDMARK_LIMITS: Readonly<Required<LandmarkLimits>> = { minimum: 0, maximum: 5 };
export const EXPERIMENTAL_PROFILES = ["twin", "sanctuary", "echo", "catalyst", "amplifier", "portal"] as const;
export type ExperimentalProfile = (typeof EXPERIMENTAL_PROFILES)[number];

const CHORD_CLUE_COUNTS: Readonly<Record<ChordDifficulty, number>> = {
  guided: 3,
  standard: 2,
  expert: 1,
};

export function generateJigsawLevel(
  seed: number,
  size: BoardSize = 6,
  activeServices: readonly ServiceType[] = CORE_SERVICE_TYPES,
  quotaOverrides: QuotaOverrides = {},
  steelRegions: readonly string[] = [],
  topology: RegionTopology = "connected",
): GeneratedJigsawLevel {
  const random = seededRandom(seed);
  // Layout proposals provide seeded variety only. Each individual layout is
  // certified exhaustively, and proposal exhaustion is never reported as UNSAT.
  for (let proposal = 0; proposal < 32; proposal += 1) {
    const regions = buildIrregularRegions(size, random, topology);
    if (regions === null) continue;
    const certified = certifyJigsawLayout(regions, seed, activeServices, quotaOverrides, steelRegions);
    if (certified.status === "solved") return certified.puzzle;
    if (certified.status === "invalid-layout") throw new Error(`invalid-layout: ${certified.issues?.join(", ") ?? ""}`);
  }
  throw new Error("internal-failure: no certified layout was proposed for this seed.");
}

/** Certifies a supplied production layout without relying on random retries. */
export function certifyJigsawLayout(
  regions: readonly (readonly string[])[],
  seed = 0,
  activeServices: readonly ServiceType[] = CORE_SERVICE_TYPES,
  quotaOverrides: QuotaOverrides = {},
  steelRegions: readonly string[] = [],
): CertifiedLayoutResult {
  if (regions.length !== 6 || regions.some((row) => row.length !== 6)) return { status: "invalid-layout", issues: ["generated-layouts-require-6x6"] };
  const quotas = quotasFor(6, activeServices, quotaOverrides);
  const regionNames = [...new Set(regions.flat())].sort();
  const steelChoices = !activeServices.includes("factory")
    ? [[]]
    : steelRegions.length > 0
      ? [steelRegions]
      : combinations(regionNames, quotas.factory.total);

  for (const selectedSteelRegions of steelChoices) {
    const level: JigsawLevel = {
      size: 6,
      regions,
      regionDefinitions: regionDefinitionsFor(regions, activeServices, selectedSteelRegions, quotas.factory.total),
      activeServices,
      quotas,
    };
    const issues = validateLevel(level);
    if (issues.length > 0) return { status: "invalid-layout", issues };
    const outcome = solveJigsawExactly(level);
    if (outcome.status === "satisfiable" && isLevelComplete(level, outcome.solution)) {
      return {
        status: "solved",
        puzzle: {
          level,
          solution: outcome.solution,
          clues: [],
          title: "6x6 Practice",
          introduction: activeServices.includes("factory") ? "Balance all four symbols across a fresh region map." : "Build a balanced shape grammar across a fresh region map.",
          seed,
        },
      };
    }
    if (outcome.status === "invalid") return { status: "invalid-layout", issues: outcome.issues };
  }
  return { status: "unsatisfiable-layout" };
}

export function generateRegionLayout(seed: number, size: BoardSize = 6, topology: RegionTopology = "tunnels"): readonly (readonly string[])[] {
  const random = seededRandom(seed);

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const regions = buildIrregularRegions(size, random, topology);

    if (regions !== null) {
      return regions;
    }
  }

  throw new Error("internal-failure: could not construct the requested region shape.");
}

export function generateChordLevel(seed: number, difficulty: ChordDifficulty = "standard", landmarkLimits: LandmarkLimits = DEFAULT_LANDMARK_LIMITS): GeneratedJigsawLevel {
  const base = generatePlayableChordBase(seed, landmarkLimits);
  const puzzle = deriveChordProfile(base, difficulty);
  if (puzzle === null) throw new Error("no-unique-clue-set");
  return puzzle;
}

/** Generates the certified constrained board once; profiles only vary its clue subset. */
export function generateChordBaseBoard(seed: number, landmarkLimits: LandmarkLimits = DEFAULT_LANDMARK_LIMITS): ChordBaseBoard {
  // Catalog bases deliberately have no clues, dead zones, or generated landmarks.
  // Variants add those constraints after an author selects a base board.
  void landmarkLimits;
  const generated = generateJigsawLevel(seed, 6, CORE_SERVICE_TYPES, {}, [], "tunnels");
  return { seed, level: generated.level, solution: generated.solution };
}

function generatePlayableChordBase(seed: number, landmarkLimits: LandmarkLimits): ChordBaseBoard {
  const limits = normalizeLandmarkLimits(landmarkLimits);
  for (let layoutOffset = 0; layoutOffset < 32; layoutOffset += 1) {
    const generated = generateJigsawLevel((seed + layoutOffset) >>> 0, 6, CORE_SERVICE_TYPES, {}, [], "tunnels");
    const base = restrictChordCandidate(seed, generated, limits, layoutOffset);
    if (base !== null) return base;
  }
  throw new Error("internal-failure: no valid dead-zone Chord layout was proposed for this seed.");
}

/** Derives each requested clue profile independently from one certified base board. */
export function generateChordProfiles(seed: number, difficulties: readonly ChordDifficulty[], landmarkLimits: LandmarkLimits = DEFAULT_LANDMARK_LIMITS): readonly ChordProfileResult[] {
  let base: ChordBaseBoard;
  try {
    base = generatePlayableChordBase(seed, landmarkLimits);
  } catch (error) {
    const reason = `base-generation-error:${error instanceof Error ? error.message : String(error)}`;
    return difficulties.map((difficulty) => ({ difficulty, status: "failed", reason }));
  }
  return difficulties.map((difficulty) => {
    try {
      const puzzle = deriveChordProfile(base, difficulty);
      return puzzle === null ? { difficulty, status: "failed", reason: "no-unique-clue-set" } : { difficulty, status: "generated", puzzle };
    } catch (error) {
      return { difficulty, status: "failed", reason: `profile-generation-error:${error instanceof Error ? error.message : String(error)}` };
    }
  });
}

/**
 * Creates a playable variant by turning empty witness cells into scattered dead
 * terrain, then exactly certifying a clue subset at the requested count.
 */
export function deriveChordVariant(base: ChordBaseBoard, options: ChordVariantOptions): ChordVariantResult {
  if (!Number.isInteger(options.deadZoneCount) || !Number.isInteger(options.clueCount) || options.deadZoneCount < 0 || options.clueCount < 0 || options.clueCount > base.solution.length) throw new Error("Variant dead-zone and clue counts must be valid non-negative integers.");
  const occupied = new Set(base.solution.map((placement) => `${placement.position.row}:${placement.position.column}`));
  const emptyCells = Array.from({ length: base.level.size * base.level.size }, (_, index) => ({ row: Math.floor(index / base.level.size), column: index % base.level.size }))
    .filter((position) => !occupied.has(`${position.row}:${position.column}`));
  if (options.deadZoneCount > emptyCells.length) return { status: "no-unique-variant" };

  const random = seededRandom(options.variationSeed ?? base.seed);
  for (const deadZones of shuffled(combinations(emptyCells, options.deadZoneCount), random)) {
    const level = addDeadZones(base.level, deadZones);
    if (validateLevel(level).length > 0 || !isLevelComplete(level, base.solution)) continue;
    const clues = uniqueClueSubset(level, base.solution, options.clueCount, random);
    if (clues !== null) {
      return {
        status: "generated",
        deadZones,
        puzzle: {
          level,
          solution: base.solution,
          clues,
          title: "Chord variant",
          introduction: `${deadZones.length} dead zones and ${clues.length} fixed clues.`,
        },
      };
    }
  }
  return { status: "no-unique-variant" };
}

function restrictChordCandidate(
  seed: number,
  generated: GeneratedJigsawLevel,
  limits: Readonly<Required<LandmarkLimits>>,
  layoutOffset: number,
): ChordBaseBoard | null {
  const occupied = new Set(generated.solution.map((placement) => `${placement.position.row}:${placement.position.column}`));
  const availableLandmarkCells = Array.from({ length: 36 }, (_, index) => ({ row: Math.floor(index / 6), column: index % 6 }))
    .filter((position) => !occupied.has(`${position.row}:${position.column}`));
  const landmarks = chooseGeneratedLandmarks(availableLandmarkCells, seededRandom((seed ^ 0x517cc1b7 ^ layoutOffset) >>> 0), limits);
  const reservedLandmarkCells = new Set(landmarks.map((landmark) => `${landmark.position.row}:${landmark.position.column}`));
  const level: JigsawLevel = {
    ...addDeadZoneForUnusedCells(generated.level, new Set([...occupied, ...reservedLandmarkCells])),
    landmarks,
  };
  if (validateLevel(level).length > 0 || !isLevelComplete(level, generated.solution)) return null;
  return { seed, level, solution: generated.solution };
}

function deriveChordProfile(base: ChordBaseBoard, difficulty: ChordDifficulty): GeneratedJigsawLevel | null {
  const clues = uniqueClueSubset(base.level, base.solution, CHORD_CLUE_COUNTS[difficulty], seededRandom((base.seed ^ 0x9e3779b9) >>> 0));
  return clues === null ? null : {
    seed: base.seed,
    level: base.level,
    solution: base.solution,
    clues,
    title: "Chord",
    introduction: "Balance every symbol across the board's rows, columns, and regions.",
  };
}

function chooseGeneratedLandmarks(
  available: readonly Position[],
  random: () => number,
  limits: Readonly<Required<LandmarkLimits>>,
): readonly Landmark[] {
  if (limits.minimum > available.length) throw new Error(`Landmark minimum ${limits.minimum} exceeds the ${available.length} available generated cells.`);
  const count = limits.minimum + Math.floor(random() * (Math.min(limits.maximum, available.length) - limits.minimum + 1));
  return shuffled(available, random).slice(0, count).map((position) => ({ type: "catalyst" as const, position }));
}

function addDeadZoneForUnusedCells(level: JigsawLevel, occupied: ReadonlySet<string>): JigsawLevel {
  const regions = level.regions.map((row, rowIndex) => row.map((region, column) => occupied.has(`${rowIndex}:${column}`) ? region : "X"));
  return { ...level, regions, regionDefinitions: { ...level.regionDefinitions, X: { type: "dead" } } };
}

function addDeadZones(level: JigsawLevel, deadZones: readonly Position[]): JigsawLevel {
  if (deadZones.length === 0) return level;
  const blocked = new Set(deadZones.map((position) => `${position.row}:${position.column}`));
  return {
    ...level,
    regions: level.regions.map((row, rowIndex) => row.map((region, column) => blocked.has(`${rowIndex}:${column}`) ? "X" : region)),
    regionDefinitions: { ...level.regionDefinitions, X: { type: "dead" } },
  };
}

function normalizeLandmarkLimits(limits: LandmarkLimits): Readonly<Required<LandmarkLimits>> {
  const minimum = limits.minimum ?? DEFAULT_LANDMARK_LIMITS.minimum;
  const maximum = limits.maximum ?? DEFAULT_LANDMARK_LIMITS.maximum;
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < minimum || maximum > 36) throw new Error("Landmark limits must be non-negative integers with minimum less than or equal to maximum.");
  return { minimum, maximum };
}

export function uniqueClueSubset(
  level: JigsawLevel,
  solution: readonly ServicePlacement[],
  target: number,
  random: () => number,
): readonly ServicePlacement[] | null {
  for (const indices of shuffled(combinations(Array.from({ length: solution.length }, (_, index) => index), target), random)) {
    const clues = indices.map((index) => solution[index]!);
    if (classifyJigsaw(level, clues).status === "unique") return clues;
  }
  return null;
}

function regionDefinitionsFor(
  regions: readonly (readonly string[])[],
  activeServices: readonly ServiceType[],
  steelRegions: readonly string[],
  factorySteelDemandCount: number,
): Readonly<Record<string, RegionDefinition>> {
  const definitions: Record<string, RegionDefinition> = {};
  const steelDemandRegions = new Set(
    steelRegions.length > 0
      ? steelRegions
      : activeServices.includes("factory")
        ? [...new Set(regions.flat())].slice(0, factorySteelDemandCount)
        : [],
  );

  for (const region of new Set(regions.flat())) {
    definitions[region] = {
      type: "normal",
      requirements: {
        ...Object.fromEntries(activeServices.filter((service) => service !== "factory").map((service) => [SERVICE_RESOURCES[service], 1])),
        ...(steelDemandRegions.has(region) ? { steel: 1 } : {}),
      },
    };
  }

  return definitions;
}

export function jigsawLevelSignature(puzzle: Pick<JigsawPuzzle, "level" | "solution">): string {
  const regions = puzzle.level.regions.map((row) => row.join("")).join("/");
  const services = puzzle.solution.map((placement) => `${placement.service}:${placement.position.row}:${placement.position.column}`).join("/");
  const landmarks = (puzzle.level.landmarks ?? []).map((landmark) => landmark.type === "portal"
    ? `${landmark.type}:${landmark.pair}:${landmark.position.row}:${landmark.position.column}:${landmark.mouth.row}:${landmark.mouth.column}`
    : `${landmark.type}:${landmark.position.row}:${landmark.position.column}`).sort().join("/");

  return `${puzzle.level.size}|${regions}|${landmarks}|${services}`;
}

function buildIrregularRegions(size: BoardSize, random: () => number, topology: RegionTopology): readonly (readonly string[])[] | null {
  const regions = copyRegions(initialRegions(size));
  const targetTunnelCount = topology === "tunnels" ? random() < 0.5 ? 1 : 2 : 0;
  let bestRegions: string[][] | null = targetTunnelCount === 0 ? copyRegions(regions) : null;
  let bestScore = targetTunnelCount === 0 ? shapeScore(regions, size) : Number.NEGATIVE_INFINITY;

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

    if (regionComponentCount(regions, size, firstRegion) > 2 || regionComponentCount(regions, size, secondRegion) > 2) {
      regions[first.row]![first.column] = firstRegion;
      regions[second.row]![second.column] = secondRegion;
      continue;
    }

    const tunnelCount = tunnelDistrictCount(regions, size);

    if (tunnelCount > targetTunnelCount) {
      regions[first.row]![first.column] = firstRegion;
      regions[second.row]![second.column] = secondRegion;
      continue;
    }

    const score = shapeScore(regions, size);

    if (!hasSimpleRegionShape(regions, size) && tunnelCount === targetTunnelCount && score > bestScore) {
      bestRegions = copyRegions(regions);
      bestScore = score;
    }
  }

  return bestRegions;
}

function initialRegions(size: BoardSize): string[][] {
  const regionHeight = size / 2;

  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => regionName(Math.floor(row / regionHeight) * regionHeight + Math.floor(column / 2))),
  );
}

function tunnelDistrictCount(regions: readonly (readonly string[])[], size: BoardSize): number {
  return Array.from({ length: size }, (_, index) => regionName(index)).filter((region) => regionComponentCount(regions, size, region) === 2).length;
}

function regionComponentCount(regions: readonly (readonly string[])[], size: BoardSize, region: string): number {
  const cells = allCells(size).filter((cell) => regions[cell.row]![cell.column] === region);
  const cellKeys = new Set(cells.map(positionKey));
  const unvisited = new Map(cells.map((cell) => [positionKey(cell), cell]));
  let components = 0;

  while (unvisited.size > 0) {
    const first = unvisited.values().next().value as Position;
    const queue = [first];
    unvisited.delete(positionKey(first));
    components += 1;

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const neighbour of orthogonalNeighbours(current)) {
        const key = positionKey(neighbour);

        if (cellKeys.has(key) && unvisited.has(key)) {
          unvisited.delete(key);
          queue.push(neighbour);
        }
      }
    }
  }

  return components;
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

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }

  return result;
}

function combinations<T>(values: readonly T[], count: number): T[][] {
  if (!Number.isInteger(count) || count < 0 || count > values.length) return [];
  const result: T[][] = [];
  const choose = (start: number, selected: T[]): void => {
    if (selected.length === count) {
      result.push(selected);
      return;
    }
    for (let index = start; index <= values.length - (count - selected.length); index += 1) choose(index + 1, [...selected, values[index]!]);
  };
  choose(0, []);
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

import { evaluatePlacements, isLevelComplete, isPlacementActive, regionAt, validateLevel, validatePlacement, validatePlacements } from "./rules.js";
import { SERVICE_RESOURCES, SERVICE_TYPES, type JigsawLevel, type ServicePlacement, type ServiceType } from "./types.js";

export interface SolveStats {
  readonly nodes: number;
  readonly decisions: number;
  readonly contradictions: number;
  readonly maxDepth: number;
  readonly solutionsFound: number;
}

export type SolveOutcome =
  | Readonly<{ status: "invalid"; issues: readonly string[] }>
  | Readonly<{ status: "unsatisfiable"; stats: SolveStats }>
  | Readonly<{ status: "satisfiable"; solution: readonly ServicePlacement[]; stats: SolveStats }>;

export type SolutionClassification =
  | Readonly<{ status: "invalid"; issues: readonly string[] }>
  | Readonly<{ status: "unsatisfiable"; stats: SolveStats }>
  | Readonly<{ status: "unique"; solution: readonly ServicePlacement[]; stats: SolveStats }>
  | Readonly<{ status: "multiple"; solution: readonly ServicePlacement[]; stats: SolveStats }>;

interface SearchResult {
  readonly solutions: readonly (readonly ServicePlacement[])[];
  readonly stats: SolveStats;
}

interface PlacementChoice {
  readonly service: ServiceType;
  readonly candidates: readonly ServicePlacement[];
}

/**
 * Finds up to `limit` solutions. A zero-length return always means exhaustive
 * UNSAT; a non-zero return is intentionally allowed to stop at the caller's limit.
 */
export function solveJigsaw(level: JigsawLevel, clues: readonly ServicePlacement[], limit = 2): readonly (readonly ServicePlacement[])[] {
  const result = searchJigsaw(level, clues, limit);
  return result === null ? [] : result.solutions;
}

/** Returns an exact zero/one/many classification by searching for a second solution. */
export function classifyJigsaw(level: JigsawLevel, clues: readonly ServicePlacement[] = []): SolutionClassification {
  const validation = validationIssues(level, clues);
  if (validation.length > 0) return { status: "invalid", issues: validation };

  const result = searchJigsaw(level, clues, 2)!;
  if (result.solutions.length === 0) return { status: "unsatisfiable", stats: result.stats };
  if (result.solutions.length === 1) return { status: "unique", solution: result.solutions[0]!, stats: result.stats };
  return { status: "multiple", solution: result.solutions[0]!, stats: result.stats };
}

/** Provides a single solution when one exists, with invalid and UNSAT distinguished. */
export function solveJigsawExactly(level: JigsawLevel, clues: readonly ServicePlacement[] = []): SolveOutcome {
  const validation = validationIssues(level, clues);
  if (validation.length > 0) return { status: "invalid", issues: validation };

  const result = searchJigsaw(level, clues, 1)!;
  return result.solutions.length === 0
    ? { status: "unsatisfiable", stats: result.stats }
    : { status: "satisfiable", solution: result.solutions[0]!, stats: result.stats };
}

export function countSolutions(level: JigsawLevel, clues: readonly ServicePlacement[], limit = 2): number {
  return solveJigsaw(level, clues, limit).length;
}

function searchJigsaw(level: JigsawLevel, clues: readonly ServicePlacement[], limit: number): SearchResult | null {
  if (!Number.isInteger(limit) || limit < 1 || validationIssues(level, clues).length > 0) return null;

  const solutions: ServicePlacement[][] = [];
  let nodes = 0;
  let decisions = 0;
  let contradictions = 0;
  let maxDepth = 0;

  const search = (placements: readonly ServicePlacement[], minimumPositions: Readonly<Partial<Record<ServiceType, number>>>, depth: number): void => {
    if (solutions.length >= limit) return;
    nodes += 1;
    maxDepth = Math.max(maxDepth, depth);

    if (hasContradiction(level, placements, minimumPositions)) {
      contradictions += 1;
      return;
    }

    const choice = nextPlacement(level, placements, minimumPositions);
    if (choice === null) {
      const ordered = orderPlacements(placements);
      if (isLevelComplete(level, ordered)) solutions.push(ordered);
      else contradictions += 1;
      return;
    }
    if (choice.candidates.length === 0) {
      contradictions += 1;
      return;
    }

    decisions += 1;
    for (const candidate of choice.candidates) {
      search(
        [...placements, candidate],
        { ...minimumPositions, [choice.service]: positionIndex(candidate, level.size) + 1 },
        depth + 1,
      );
    }
  };

  search(orderPlacements(clues), {}, 0);
  return {
    solutions,
    stats: { nodes, decisions, contradictions, maxDepth, solutionsFound: solutions.length },
  };
}

function validationIssues(level: JigsawLevel, clues: readonly ServicePlacement[]): readonly string[] {
  const issues = [...validateLevel(level)];
  if (issues.length > 0) return issues;
  if (clues.some((clue) => !SERVICE_TYPES.includes(clue.service) || !level.activeServices.includes(clue.service))) return ["invalid-clue-service"];
  const clueIssues = validatePlacements(level, orderPlacements(clues));
  return clueIssues.map((issue) => `invalid-clue-${issue}`);
}

function nextPlacement(
  level: JigsawLevel,
  placements: readonly ServicePlacement[],
  minimumPositions: Readonly<Partial<Record<ServiceType, number>>>,
): PlacementChoice | null {
  const choices = activeServices(level)
    .filter((service) => remainingForService(level, placements, service) > 0)
    .map((service) => ({ service, candidates: candidatesForService(level, placements, service, minimumPositions[service] ?? 0) }))
    .sort((left, right) => left.candidates.length - right.candidates.length || SERVICE_TYPES.indexOf(left.service) - SERVICE_TYPES.indexOf(right.service));
  return choices[0] ?? null;
}

function hasContradiction(
  level: JigsawLevel,
  placements: readonly ServicePlacement[],
  minimumPositions: Readonly<Partial<Record<ServiceType, number>>>,
): boolean {
  for (const service of activeServices(level)) {
    const remaining = remainingForService(level, placements, service);
    const candidates = candidatesForService(level, placements, service, minimumPositions[service] ?? 0);
    if (candidates.length < remaining || !requiredUnitsCanBeFilled(level, placements, service, candidates)) return true;
  }
  return !regionRequirementsCanBeMet(level, placements) || !completedRelationshipsAreViable(level, placements);
}

function requiredUnitsCanBeFilled(level: JigsawLevel, placements: readonly ServicePlacement[], service: ServiceType, candidates: readonly ServicePlacement[]): boolean {
  const quota = level.quotas[service];
  if (quota.total === level.size && quota.maxPerRow === 1 && Array.from({ length: level.size }, (_, row) => row).some((row) => !placements.some((placement) => placement.service === service && placement.position.row === row) && !candidates.some((candidate) => candidate.position.row === row))) return false;
  if (quota.total === level.size && quota.maxPerColumn === 1 && Array.from({ length: level.size }, (_, column) => column).some((column) => !placements.some((placement) => placement.service === service && placement.position.column === column) && !candidates.some((candidate) => candidate.position.column === column))) return false;
  if (quota.total === normalRegions(level).length && quota.maxPerRegion === 1 && normalRegions(level).some((region) => !placements.some((placement) => placement.service === service && regionAt(level, placement.position) === region) && !candidates.some((candidate) => regionAt(level, candidate.position) === region))) return false;
  return true;
}

function regionRequirementsCanBeMet(level: JigsawLevel, placements: readonly ServicePlacement[]): boolean {
  for (const region of normalRegions(level)) {
    const requirements = level.regionDefinitions[region]!.type === "normal" ? level.regionDefinitions[region]!.requirements : {};
    for (const [resource, required] of Object.entries(requirements)) {
      const service = SERVICE_TYPES.find((candidate) => SERVICE_RESOURCES[candidate] === resource);
      if (!service) return false;
      const presentCapacity = placements.filter((placement) => placement.service === service && regionAt(level, placement.position) === region).reduce((total, placement) => total + (isAmplified(level, placement) ? 2 : 1), 0);
      const futureCapacity = candidatesForService(level, placements, service, 0)
        .filter((candidate) => regionAt(level, candidate.position) === region)
        .reduce((total, candidate) => total + (isAmplified(level, candidate) ? 2 : 1), 0);
      if (presentCapacity + futureCapacity < required) return false;
    }
  }
  return true;
}

function completedRelationshipsAreViable(level: JigsawLevel, placements: readonly ServicePlacement[]): boolean {
  return placements.filter((placement) => placement.service === "farm" || placement.service === "factory" || placement.service === "twin").every((placement) => {
    if (isPlacementActive(level, placements, placement)) return true;
    if (placement.service === "farm") return remainingForService(level, placements, "water") > 0;
    if (placement.service === "twin") return remainingForService(level, placements, "twin") > 0;
    return remainingForService(level, placements, "generator") > 0 || remainingForService(level, placements, "water") > 0;
  });
}

function candidatesForService(level: JigsawLevel, placements: readonly ServicePlacement[], service: ServiceType, minimumPosition: number): readonly ServicePlacement[] {
  if (!level.activeServices.includes(service) || remainingForService(level, placements, service) === 0) return [];
  const candidates: ServicePlacement[] = [];
  for (let index = minimumPosition; index < level.size * level.size; index += 1) {
    const candidate = { service, position: { row: Math.floor(index / level.size), column: index % level.size } };
    if (validatePlacement(level, placements, candidate).length === 0) candidates.push(candidate);
  }
  return candidates;
}

function isAmplified(level: JigsawLevel, placement: ServicePlacement): boolean {
  return (level.landmarks ?? []).some((landmark) => landmark.type === "amplifier" && Math.abs(landmark.position.row - placement.position.row) + Math.abs(landmark.position.column - placement.position.column) === 1);
}

function remainingForService(level: JigsawLevel, placements: readonly ServicePlacement[], service: ServiceType): number {
  return level.quotas[service].total - placements.filter((placement) => placement.service === service).length;
}

function activeServices(level: JigsawLevel): readonly ServiceType[] {
  return SERVICE_TYPES.filter((service) => level.activeServices.includes(service));
}

function normalRegions(level: JigsawLevel): readonly string[] {
  return [...new Set(level.regions.flat())].filter((region) => level.regionDefinitions[region]?.type === "normal");
}

function orderPlacements(placements: readonly ServicePlacement[]): ServicePlacement[] {
  return [...placements].sort((left, right) => SERVICE_TYPES.indexOf(left.service) - SERVICE_TYPES.indexOf(right.service)
    || left.position.row - right.position.row
    || left.position.column - right.position.column);
}

function positionIndex(placement: ServicePlacement, size: number): number {
  return placement.position.row * size + placement.position.column;
}

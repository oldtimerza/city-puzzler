import type { Position } from "./position.js";
import { isLevelComplete, legalPositions, regionAt, regionComponents, validateLevel, validatePlacements } from "./rules.js";
import { SERVICE_TYPES, type JigsawLevel, type ServicePlacement, type ServiceType } from "./types.js";

const DEFAULT_NODE_LIMIT = 25_000;

export type AnalysisTechnique = "inventory-single" | "row-single" | "column-single" | "district-single";

export interface AnalysisStep {
  readonly technique: AnalysisTechnique;
  readonly placement: ServicePlacement;
  readonly candidatesBefore: number;
  readonly candidatesAfter: number;
}

export interface AnalysisBottleneck {
  readonly kind: "logic-stall" | "search-limit";
  readonly remainingPlacements: number;
  readonly candidateCount: number;
}

export interface JigsawAnalysis {
  readonly valid: boolean;
  readonly levelIssues: readonly string[];
  readonly clueIssues: readonly string[];
  readonly solutionCount: 0 | 1 | 2 | "unknown";
  readonly structural: {
    readonly size: number;
    readonly activeServices: readonly ServiceType[];
    readonly clues: number;
    readonly normalDistricts: number;
    readonly tunnelDistricts: number;
  };
  readonly candidateProfile: {
    readonly initialCandidates: number;
    readonly peakCandidates: number;
    readonly averageCandidatesPerRequiredPlacement: number;
  };
  readonly logic: {
    readonly solvedWithoutAssumption: boolean;
    readonly steps: readonly AnalysisStep[];
    readonly placementsByTechnique: Readonly<Record<AnalysisTechnique, number>>;
    readonly bottlenecks: readonly AnalysisBottleneck[];
  };
  readonly search: {
    readonly required: boolean;
    readonly nodes: number;
    readonly decisions: number;
    readonly contradictions: number;
    readonly maxDepth: number;
    readonly truncated: boolean;
  };
}

export interface JigsawAnalysisOptions {
  readonly nodeLimit?: number;
}

interface CandidateChoice {
  readonly technique: AnalysisTechnique;
  readonly candidate: ServicePlacement;
}

interface BranchChoice {
  readonly service: ServiceType;
  readonly candidates: readonly ServicePlacement[];
  readonly usesAscendingCandidates: boolean;
}

interface PropagationResult {
  readonly placements: readonly ServicePlacement[];
  readonly steps: readonly AnalysisStep[];
  readonly candidateCounts: readonly number[];
  readonly contradiction: boolean;
}

/**
 * Produces author-facing solve diagnostics. Its deductions only use immediate,
 * explainable placement constraints; relationship lookahead is deliberately not
 * presented as a human deduction until it has an equally clear explanation.
 */
export function analyzeJigsawComplexity(
  level: JigsawLevel,
  clues: readonly ServicePlacement[],
  options: JigsawAnalysisOptions = {},
): JigsawAnalysis {
  const levelIssues = validateLevel(level);
  const clueIssues = levelIssues.length === 0 ? validatePlacements(level, clues) : [];
  const normalDistricts = [...new Set(level.regions.flat())].filter((region) => level.regionDefinitions[region]?.type === "normal");
  const tunnelDistricts = normalDistricts.filter((region) => regionComponents(level, region).length === 2);
  const emptyTechniqueCounts: Record<AnalysisTechnique, number> = {
    "inventory-single": 0,
    "row-single": 0,
    "column-single": 0,
    "district-single": 0,
  };
  const emptySearch = { required: false, nodes: 0, decisions: 0, contradictions: 0, maxDepth: 0, truncated: false };

  if (levelIssues.length > 0 || clueIssues.length > 0) {
    return {
      valid: false,
      levelIssues,
      clueIssues,
      solutionCount: "unknown",
      structural: {
        size: level.size,
        activeServices: level.activeServices,
        clues: clues.length,
        normalDistricts: normalDistricts.length,
        tunnelDistricts: tunnelDistricts.length,
      },
      candidateProfile: { initialCandidates: 0, peakCandidates: 0, averageCandidatesPerRequiredPlacement: 0 },
      logic: { solvedWithoutAssumption: false, steps: [], placementsByTechnique: emptyTechniqueCounts, bottlenecks: [] },
      search: emptySearch,
    };
  }

  const propagation = propagate(level, clues, true);
  const initialCandidates = propagation.candidateCounts[0] ?? 0;
  const remaining = remainingPlacements(level, clues);
  const stepsByTechnique = { ...emptyTechniqueCounts };

  for (const step of propagation.steps) {
    stepsByTechnique[step.technique] += 1;
  }

  const solvedWithoutAssumption = !propagation.contradiction && isLevelComplete(level, propagation.placements);
  const bottlenecks: AnalysisBottleneck[] = [];

  if (!solvedWithoutAssumption) {
    bottlenecks.push({
      kind: "logic-stall",
      remainingPlacements: remainingPlacements(level, propagation.placements),
      candidateCount: candidateCount(level, propagation.placements),
    });
  }

  const search = solvedWithoutAssumption || propagation.contradiction
    ? { ...emptySearch, required: !solvedWithoutAssumption, solutions: solvedWithoutAssumption ? 1 as const : 0 as const }
    : runSearch(level, clues, options.nodeLimit ?? DEFAULT_NODE_LIMIT);

  if (search.truncated) {
    bottlenecks.push({
      kind: "search-limit",
      remainingPlacements: remainingPlacements(level, propagation.placements),
      candidateCount: candidateCount(level, propagation.placements),
    });
  }

  return {
    valid: true,
    levelIssues,
    clueIssues,
    solutionCount: propagation.contradiction ? 0 : search.truncated ? "unknown" : solvedWithoutAssumption ? 1 : search.solutions,
    structural: {
      size: level.size,
      activeServices: level.activeServices,
      clues: clues.length,
      normalDistricts: normalDistricts.length,
      tunnelDistricts: tunnelDistricts.length,
    },
    candidateProfile: {
      initialCandidates,
      peakCandidates: Math.max(...propagation.candidateCounts, 0),
      averageCandidatesPerRequiredPlacement: remaining === 0 ? 0 : initialCandidates / remaining,
    },
    logic: {
      solvedWithoutAssumption,
      steps: propagation.steps,
      placementsByTechnique: stepsByTechnique,
      bottlenecks,
    },
    search,
  };
}

export function forcedJigsawPlacements(level: JigsawLevel, placements: readonly ServicePlacement[]): readonly ServicePlacement[] {
  if (validateLevel(level).length > 0 || validatePlacements(level, placements).length > 0) {
    return [];
  }

  const propagation = propagate(level, placements, false);
  return propagation.contradiction ? [] : propagation.placements.slice(placements.length);
}

function propagate(level: JigsawLevel, initialPlacements: readonly ServicePlacement[], collectSteps: boolean): PropagationResult {
  let placements = initialPlacements;
  const steps: AnalysisStep[] = [];
  const candidateCounts = [candidateCount(level, placements)];

  while (true) {
    if (hasContradiction(level, placements)) {
      return { placements, steps, candidateCounts, contradiction: true };
    }

    const choice = nextForcedChoice(level, placements);

    if (choice === null) {
      return { placements, steps, candidateCounts, contradiction: false };
    }

    const candidatesBefore = candidateCounts[candidateCounts.length - 1]!;
    placements = [...placements, choice.candidate];
    const candidatesAfter = candidateCount(level, placements);
    candidateCounts.push(candidatesAfter);

    if (collectSteps) {
      steps.push({ ...choice, placement: choice.candidate, candidatesBefore, candidatesAfter });
    }
  }
}

function nextForcedChoice(level: JigsawLevel, placements: readonly ServicePlacement[]): CandidateChoice | null {
  for (const service of orderedServices(level)) {
    const remaining = remainingForService(level, placements, service);

    if (remaining === 0) {
      continue;
    }

    const candidates = candidatesForService(level, placements, service);

    if (remaining === 1 && candidates.length === 1) {
      return { technique: "inventory-single", candidate: candidates[0]! };
    }

    if (candidates.length === remaining) {
      return { technique: "inventory-single", candidate: candidates[0]! };
    }

    const rowChoice = singleInRequiredUnit(level, placements, service, "row-single");

    if (rowChoice !== null) {
      return rowChoice;
    }

    const columnChoice = singleInRequiredUnit(level, placements, service, "column-single");

    if (columnChoice !== null) {
      return columnChoice;
    }

    const districtChoice = singleInRequiredUnit(level, placements, service, "district-single");

    if (districtChoice !== null) {
      return districtChoice;
    }
  }

  return null;
}

function singleInRequiredUnit(
  level: JigsawLevel,
  placements: readonly ServicePlacement[],
  service: ServiceType,
  technique: Exclude<AnalysisTechnique, "inventory-single">,
): CandidateChoice | null {
  const quota = level.quotas[service];
  const candidates = candidatesForService(level, placements, service);
  const units = technique === "row-single"
    ? quota.total === level.size && quota.maxPerRow === 1
      ? Array.from({ length: level.size }, (_, row) => row)
      : []
    : technique === "column-single"
      ? quota.total === level.size && quota.maxPerColumn === 1
        ? Array.from({ length: level.size }, (_, column) => column)
        : []
      : quota.total === normalRegions(level).length && quota.maxPerRegion === 1
        ? normalRegions(level)
        : [];

  for (const unit of units) {
    const alreadyPlaced = technique === "row-single"
      ? placements.some((placement) => placement.service === service && placement.position.row === unit)
      : technique === "column-single"
        ? placements.some((placement) => placement.service === service && placement.position.column === unit)
        : placements.some((placement) => placement.service === service && regionAt(level, placement.position) === unit);

    if (alreadyPlaced) {
      continue;
    }

    const candidatesInUnit = candidates.filter((candidate) => technique === "row-single"
      ? candidate.position.row === unit
      : technique === "column-single"
        ? candidate.position.column === unit
        : regionAt(level, candidate.position) === unit);

    if (candidatesInUnit.length === 1) {
      return { technique, candidate: candidatesInUnit[0]! };
    }
  }

  return null;
}

function runSearch(level: JigsawLevel, clues: readonly ServicePlacement[], nodeLimit: number): JigsawAnalysis["search"] & { readonly solutions: 0 | 1 | 2 } {
  let nodes = 0;
  let decisions = 0;
  let contradictions = 0;
  let maxDepth = 0;
  let solutions: 0 | 1 | 2 = 0;
  let truncated = false;

  const search = (placements: readonly ServicePlacement[], minimumCandidatePositions: Partial<Record<ServiceType, number>>, depth: number): void => {
    if (solutions === 2 || truncated) {
      return;
    }

    if (nodes >= nodeLimit) {
      truncated = true;
      return;
    }

    nodes += 1;
    maxDepth = Math.max(maxDepth, depth);
    const propagation = propagate(level, placements, false);

    if (propagation.contradiction) {
      contradictions += 1;
      return;
    }

    if (isLevelComplete(level, propagation.placements)) {
      solutions = (solutions + 1) as 0 | 1 | 2;
      return;
    }

    const choice = nextBranchChoice(level, propagation.placements, minimumCandidatePositions);

    if (choice === null || choice.candidates.length === 0) {
      contradictions += 1;
      return;
    }

    decisions += 1;

    for (const candidate of choice.candidates) {
      const nextMinimumCandidatePositions = choice.usesAscendingCandidates
        ? { ...minimumCandidatePositions, [choice.service]: positionIndex(candidate.position, level.size) + 1 }
        : minimumCandidatePositions;
      search([...propagation.placements, candidate], nextMinimumCandidatePositions, depth + 1);
    }
  };

  search(clues, {}, 0);
  return { required: true, nodes, decisions, contradictions, maxDepth, truncated, solutions };
}

function nextBranchChoice(
  level: JigsawLevel,
  placements: readonly ServicePlacement[],
  minimumCandidatePositions: Partial<Record<ServiceType, number>>,
): BranchChoice | null {
  for (const service of orderedServices(level)) {
    if (remainingForService(level, placements, service) === 0) {
      continue;
    }

    const quota = level.quotas[service];

    if (quota.total === level.size && quota.maxPerRow === 1) {
      const row = Array.from({ length: level.size }, (_, index) => index).find((candidateRow) => !placements.some(
        (placement) => placement.service === service && placement.position.row === candidateRow,
      ));

      if (row !== undefined) {
        return {
          service,
          candidates: candidatesForService(level, placements, service).filter((candidate) => candidate.position.row === row),
          usesAscendingCandidates: false,
        };
      }
    }

    const minimumPosition = minimumCandidatePositions[service] ?? 0;
    return {
      service,
      candidates: candidatesForService(level, placements, service).filter((candidate) => positionIndex(candidate.position, level.size) >= minimumPosition),
      usesAscendingCandidates: true,
    };
  }

  return null;
}

function hasContradiction(level: JigsawLevel, placements: readonly ServicePlacement[]): boolean {
  for (const service of orderedServices(level)) {
    if (candidatesForService(level, placements, service).length < remainingForService(level, placements, service)) {
      return true;
    }
  }

  return false;
}

function candidatesForService(level: JigsawLevel, placements: readonly ServicePlacement[], service: ServiceType): readonly ServicePlacement[] {
  return legalPositions(level, placements, service).map((position) => ({ service, position }));
}

function candidateCount(level: JigsawLevel, placements: readonly ServicePlacement[]): number {
  return orderedServices(level).reduce((total, service) => total + candidatesForService(level, placements, service).length, 0);
}

function remainingPlacements(level: JigsawLevel, placements: readonly ServicePlacement[]): number {
  return orderedServices(level).reduce((total, service) => total + remainingForService(level, placements, service), 0);
}

function remainingForService(level: JigsawLevel, placements: readonly ServicePlacement[], service: ServiceType): number {
  return Math.max(0, level.quotas[service].total - placements.filter((placement) => placement.service === service).length);
}

function normalRegions(level: JigsawLevel): readonly string[] {
  return [...new Set(level.regions.flat())].filter((region) => level.regionDefinitions[region]?.type === "normal");
}

function orderedServices(level: JigsawLevel): readonly ServiceType[] {
  return SERVICE_TYPES.filter((service) => level.activeServices.includes(service));
}

function positionIndex(position: Position, size: number): number {
  return position.row * size + position.column;
}

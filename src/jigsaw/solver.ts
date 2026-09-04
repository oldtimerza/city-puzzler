import { isLevelComplete, validateLevel, validatePlacement } from "./rules.js";
import { type JigsawLevel, type ServicePlacement, type ServiceType } from "./types.js";

const PLACEMENT_ORDER: readonly ServiceType[] = ["water", "farm", "generator", "factory", "twin"];

export function countSolutions(level: JigsawLevel, clues: readonly ServicePlacement[], limit = 2): number {
  return solveJigsaw(level, clues, limit).length;
}

export function solveJigsaw(level: JigsawLevel, clues: readonly ServicePlacement[], limit = 2): readonly (readonly ServicePlacement[])[] {
  if (validateLevel(level).length > 0 || limit < 1 || !cluesRespectCells(clues)) {
    return [];
  }

  const solutions: ServicePlacement[][] = [];
  const orderedServices = PLACEMENT_ORDER.filter((service) => level.activeServices.includes(service));

  const search = (placements: readonly ServicePlacement[], minimumCandidatePositions: Partial<Record<ServiceType, number>>): void => {
    if (solutions.length >= limit) {
      return;
    }

    const next = nextPlacement(level, orderedServices, placements, minimumCandidatePositions);

    if (next === null) {
      const ordered = orderPlacements(placements);

      if (isLevelComplete(level, ordered)) {
        solutions.push(ordered);
      }

      return;
    }

    for (const candidate of next.candidates) {
      const nextMinimumCandidatePositions = next.usesAscendingCandidates
        ? { ...minimumCandidatePositions, [next.service]: positionIndex(candidate.position, level.size) + 1 }
        : minimumCandidatePositions;
      search([...placements, candidate], nextMinimumCandidatePositions);
    }
  };

  search(clues, {});
  return solutions;
}

interface PlacementChoice {
  readonly service: ServiceType;
  readonly candidates: readonly ServicePlacement[];
  readonly usesAscendingCandidates: boolean;
}

function nextPlacement(
  level: JigsawLevel,
  orderedServices: readonly ServiceType[],
  placements: readonly ServicePlacement[],
  minimumCandidatePositions: Partial<Record<ServiceType, number>>,
): PlacementChoice | null {
  for (const service of orderedServices) {
    const quota = level.quotas[service];
    const placed = placements.filter((placement) => placement.service === service);

    if (placed.length >= quota.total) {
      continue;
    }

    const row = quota.total === level.size && quota.maxPerRow === 1
      ? Array.from({ length: level.size }, (_, index) => index).find((candidateRow) => !placed.some((placement) => placement.position.row === candidateRow))
      : undefined;
    const minimumPosition = minimumCandidatePositions[service] ?? 0;
    const positions = row === undefined
      ? Array.from({ length: level.size * level.size }, (_, index) => ({ row: Math.floor(index / level.size), column: index % level.size })).filter(
          (position) => positionIndex(position, level.size) >= minimumPosition,
        )
      : Array.from({ length: level.size }, (_, column) => ({ row, column }));

    return {
      service,
      usesAscendingCandidates: row === undefined,
      candidates: positions.map((position) => ({
        service,
        position,
      })).filter((candidate) => validatePlacement(level, placements, candidate).length === 0),
    };
  }

  return null;
}

function cluesRespectCells(clues: readonly ServicePlacement[]): boolean {
  const occupied = new Set<string>();

  for (const clue of clues) {
    const key = `${clue.position.row}:${clue.position.column}`;

    if (occupied.has(key)) {
      return false;
    }

    occupied.add(key);
  }

  return true;
}

function orderPlacements(placements: readonly ServicePlacement[]): ServicePlacement[] {
  return [...placements].sort((left, right) => PLACEMENT_ORDER.indexOf(left.service) - PLACEMENT_ORDER.indexOf(right.service));
}

function positionIndex(position: ServicePlacement["position"], size: number): number {
  return position.row * size + position.column;
}

import { isLevelComplete, validateLevel, validatePlacement } from "./rules.js";
import { type JigsawLevel, type ServicePlacement, type ServiceType } from "./types.js";

const PLACEMENT_ORDER: readonly ServiceType[] = ["water", "farm", "generator"];

export function countSolutions(level: JigsawLevel, clues: readonly ServicePlacement[], limit = 2): number {
  return solveJigsaw(level, clues, limit).length;
}

export function solveJigsaw(level: JigsawLevel, clues: readonly ServicePlacement[], limit = 2): readonly (readonly ServicePlacement[])[] {
  if (validateLevel(level).length > 0 || limit < 1 || !cluesRespectCells(clues)) {
    return [];
  }

  const solutions: ServicePlacement[][] = [];
  const orderedServices = PLACEMENT_ORDER.filter((service) => level.activeServices.includes(service));

  const search = (placements: readonly ServicePlacement[]): void => {
    if (solutions.length >= limit) {
      return;
    }

    const next = nextPlacement(level, orderedServices, placements);

    if (next === null) {
      const ordered = orderPlacements(placements);

      if (isLevelComplete(level, ordered)) {
        solutions.push(ordered);
      }

      return;
    }

    for (const candidate of next) {
      search([...placements, candidate]);
    }
  };

  search(clues);
  return solutions;
}

function nextPlacement(level: JigsawLevel, orderedServices: readonly ServiceType[], placements: readonly ServicePlacement[]): readonly ServicePlacement[] | null {
  for (const service of orderedServices) {
    for (let row = 0; row < level.size; row += 1) {
      if (placements.some((placement) => placement.service === service && placement.position.row === row)) {
        continue;
      }

      return Array.from({ length: level.size }, (_, column) => ({
        service,
        position: { row, column },
        orientation: "east" as const,
      })).filter((candidate) => validatePlacement(level, placements, candidate).length === 0);
    }
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

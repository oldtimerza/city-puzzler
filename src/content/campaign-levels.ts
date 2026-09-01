import { generateJigsawLevel, type BoardSize } from "../jigsaw/generator.js";
import { countSolutions } from "../jigsaw/solver.js";
import type { JigsawPuzzle, ServicePlacement, ServiceType } from "../jigsaw/types.js";

export interface CampaignLevel extends JigsawPuzzle {
  readonly id: string;
  readonly boardSize: BoardSize;
  readonly activeServices: readonly ServiceType[];
}

export const CAMPAIGN_LEVELS: readonly CampaignLevel[] = [
  createCampaignLevel({
    id: "irrigation",
    title: "Irrigation",
    introduction: "Dams bring water to the fields. Place Dams first, then build Farms beside them.",
    seed: 301,
    size: 5,
    activeServices: ["water", "farm"],
    targetClues: 4,
    minimumClues: { water: 2, farm: 1 },
  }),
  createCampaignLevel({
    id: "crosswinds",
    title: "Crosswinds",
    introduction: "Wind Farms need clear air. Keep them away from Dams while balancing every district.",
    seed: 401,
    size: 5,
    activeServices: ["water", "generator"],
    targetClues: 5,
    minimumClues: { water: 2, generator: 2 },
  }),
  createCampaignLevel({
    id: "regional-plan",
    title: "Regional Plan",
    introduction: "Bring wind, water, and food together across a larger town plan.",
    seed: 501,
    size: 6,
    activeServices: ["water", "farm", "generator"],
    targetClues: 8,
    minimumClues: { water: 3, farm: 2, generator: 2 },
  }),
];

function createCampaignLevel(config: {
  readonly id: string;
  readonly title: string;
  readonly introduction: string;
  readonly seed: number;
  readonly size: BoardSize;
  readonly activeServices: readonly ServiceType[];
  readonly targetClues: number;
  readonly minimumClues: Partial<Record<ServiceType, number>>;
}): CampaignLevel {
  const generated = generateJigsawLevel(config.seed, config.size, config.activeServices);
  const clues = reduceToUniqueClues(generated.level, generated.solution, config.targetClues, config.minimumClues);

  if (countSolutions(generated.level, clues) !== 1) {
    throw new Error(`Campaign level ${config.id} is not uniquely solvable.`);
  }

  return {
    id: config.id,
    title: config.title,
    introduction: config.introduction,
    boardSize: config.size,
    activeServices: config.activeServices,
    level: generated.level,
    solution: generated.solution,
    clues,
  };
}

function reduceToUniqueClues(
  level: JigsawPuzzle["level"],
  solution: readonly ServicePlacement[],
  targetClues: number,
  minimumClues: Partial<Record<ServiceType, number>>,
): readonly ServicePlacement[] {
  let clues = [...solution];

  for (let index = clues.length - 1; index >= 0 && clues.length > targetClues; index -= 1) {
    const candidate = clues[index]!;
    const count = clues.filter((placement) => placement.service === candidate.service).length;

    if (count <= (minimumClues[candidate.service] ?? 0)) {
      continue;
    }

    const next = clues.filter((_, clueIndex) => clueIndex !== index);

    if (countSolutions(level, next) === 1) {
      clues = next;
    }
  }

  return clues;
}

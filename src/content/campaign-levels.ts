import { generateJigsawLevel, type BoardSize, type QuotaOverrides } from "../jigsaw/generator.js";
import { countSolutions } from "../jigsaw/solver.js";
import type { JigsawPuzzle, ServicePlacement, ServiceType } from "../jigsaw/types.js";

export interface CampaignLevel extends JigsawPuzzle {
  readonly id: string;
  readonly boardSize: BoardSize;
  readonly activeServices: readonly ServiceType[];
  readonly tutorialTip?: string;
}

export const CAMPAIGN_LEVELS: readonly CampaignLevel[] = [
  createCampaignLevel({
    id: "pair",
    title: "Pair",
    introduction: "Triangles need Diamonds beside them. Place Diamonds first, then complete each pair.",
    tutorialTip: "Triangle must share an edge with Diamond. Place the blue Diamonds before the green Triangles.",
    seed: 301,
    size: 5,
    activeServices: ["water", "farm"],
    targetClues: 4,
    minimumClues: { water: 2, farm: 1 },
  }),
  createCampaignLevel({
    id: "apart",
    title: "Apart",
    introduction: "Circle and Diamond cannot share an edge. Keep them separate while balancing every region.",
    tutorialTip: "Circle and Diamond cannot share an edge. Use their row, column, and region limits to find safe cells for both.",
    seed: 401,
    size: 5,
    activeServices: ["water", "generator"],
    targetClues: 5,
    minimumClues: { water: 2, generator: 2 },
  }),
  createCampaignLevel({
    id: "triad",
    title: "Triad",
    introduction: "Balance Circle, Diamond, and Triangle across a larger grid.",
    tutorialTip: "Every region needs Circle, Diamond, and Triangle. Triangle still needs an adjacent Diamond.",
    seed: 501,
    size: 6,
    activeServices: ["water", "farm", "generator"],
    targetClues: 8,
    minimumClues: { water: 3, farm: 2, generator: 2 },
  }),
  createCampaignLevel({
    id: "square-one",
    title: "Square One",
    introduction: "Square activates when it touches both Circle and Diamond.",
    tutorialTip: "Each Square belongs in a region marked with a red Square and must touch both Diamond and Circle. Place two.",
    seed: 5,
    size: 6,
    activeServices: ["water", "generator", "factory"],
    quotaOverrides: { factory: factoryQuota(2) },
    steelRegions: ["A", "B"],
    playerPlacedServices: ["factory"],
    targetClues: 8,
    minimumClues: { water: 3, generator: 3, factory: 0 },
  }),
  createCampaignLevel({
    id: "square-set",
    title: "Square Set",
    introduction: "Three regions require Squares. Keep each Square in a separate row, column, and region.",
    seed: 4,
    size: 6,
    activeServices: ["water", "generator", "factory"],
    quotaOverrides: { factory: factoryQuota(3) },
    steelRegions: ["A", "B", "C"],
    playerPlacedServices: ["factory"],
    targetClues: 9,
    minimumClues: { water: 3, generator: 3, factory: 0 },
  }),
  createCampaignLevel({
    id: "chord",
    title: "Chord",
    introduction: "Bring Circle, Diamond, Triangle, and Square into one complete grammar.",
    tutorialTip: "Combine every rule: Triangle touches Diamond, Square touches Circle and Diamond, and every marked region receives its required symbol.",
    seed: 1,
    size: 6,
    activeServices: ["water", "farm", "generator", "factory"],
    quotaOverrides: { factory: factoryQuota(3) },
    steelRegions: ["A", "B", "C"],
    playerPlacedServices: ["factory"],
    targetClues: 11,
    minimumClues: { water: 3, farm: 3, generator: 3, factory: 0 },
  }),
];

function createCampaignLevel(config: {
  readonly id: string;
  readonly title: string;
  readonly introduction: string;
  readonly tutorialTip?: string;
  readonly seed: number;
  readonly size: BoardSize;
  readonly activeServices: readonly ServiceType[];
  readonly quotaOverrides?: QuotaOverrides;
  readonly steelRegions?: readonly string[];
  readonly playerPlacedServices?: readonly ServiceType[];
  readonly targetClues: number;
  readonly minimumClues: Partial<Record<ServiceType, number>>;
}): CampaignLevel {
  const generated = generateJigsawLevel(config.seed, config.size, config.activeServices, config.quotaOverrides, config.steelRegions);
  const initialClues = generated.solution.filter((placement) => !config.playerPlacedServices?.includes(placement.service));
  const clues = reduceToUniqueClues(generated.level, initialClues, config.targetClues, config.minimumClues);

  if (countSolutions(generated.level, clues) !== 1) {
    throw new Error(`Campaign level ${config.id} is not uniquely solvable.`);
  }

  return {
    id: config.id,
    title: config.title,
    introduction: config.introduction,
    ...(config.tutorialTip ? { tutorialTip: config.tutorialTip } : {}),
    boardSize: config.size,
    activeServices: config.activeServices,
    level: generated.level,
    solution: generated.solution,
    clues,
  };
}

function factoryQuota(total: number) {
  return { total, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 };
}

function reduceToUniqueClues(
  level: JigsawPuzzle["level"],
  initialClues: readonly ServicePlacement[],
  targetClues: number,
  minimumClues: Partial<Record<ServiceType, number>>,
): readonly ServicePlacement[] {
  let clues = [...initialClues];

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

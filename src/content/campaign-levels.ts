import { generateJigsawLevel, type BoardSize, type QuotaOverrides } from "../jigsaw/generator.js";
import { countSolutions } from "../jigsaw/solver.js";
import type { JigsawPuzzle, ServicePlacement, ServiceType } from "../jigsaw/types.js";

export interface CampaignLevel extends JigsawPuzzle {
  readonly id: string;
  readonly boardSize: BoardSize;
  readonly activeServices: readonly ServiceType[];
  readonly tutorialTip: string;
}

export const CAMPAIGN_LEVELS: readonly CampaignLevel[] = [
  createCampaignLevel({
    id: "irrigation",
    title: "Irrigation",
    introduction: "Dams bring water to the fields. Place Dams first, then build Farms beside them.",
    tutorialTip: "Dams supply Water. Farms must touch a Dam, so place the blue diamonds before the green triangles.",
    seed: 301,
    size: 5,
    activeServices: ["water", "farm"],
    targetClues: 4,
    minimumClues: { water: 2, farm: 1 },
  }),
  createCampaignLevel({
    id: "crosswinds",
    title: "Solar Fields",
    introduction: "Solar Panels need clear ground. Keep them away from Dams while balancing every district.",
    tutorialTip: "Solar Panels and Dams cannot share an edge. Use their row, column, and district limits to find safe spaces for both.",
    seed: 401,
    size: 5,
    activeServices: ["water", "generator"],
    targetClues: 5,
    minimumClues: { water: 2, generator: 2 },
  }),
  createCampaignLevel({
    id: "regional-plan",
    title: "Regional Plan",
    introduction: "Bring power, water, and food together across a larger town plan.",
    tutorialTip: "This is the complete core town plan: every district needs Food, Water, and Power. Farms still need an adjacent Dam.",
    seed: 501,
    size: 6,
    activeServices: ["water", "farm", "generator"],
    targetClues: 8,
    minimumClues: { water: 3, farm: 2, generator: 2 },
  }),
  createCampaignLevel({
    id: "foundry-basics",
    title: "Foundry Basics",
    introduction: "Factories make steel when they touch both a Solar Panel for power and a Dam for water.",
    tutorialTip: "Red Steel dots mark industrial districts. Place two Factories there, each beside both a Solar Panel and a Dam.",
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
    id: "steelworks",
    title: "Steelworks",
    introduction: "Three industrial districts need steel. Keep each Factory in a separate row, column, and district.",
    tutorialTip: "Three districts need Steel. Factories are a quota exception: place three total, with no repeated row, column, or district.",
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
    id: "integrated-plan",
    title: "Integrated Plan",
    introduction: "Bring solar power, water, food, and steel together. Three industrial districts need active Factories.",
    tutorialTip: "Bring every rule together: Food, Water, Power, and three active Factories supplying Steel to the red-dot districts.",
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
  readonly tutorialTip: string;
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
    tutorialTip: config.tutorialTip,
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

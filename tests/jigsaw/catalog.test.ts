import { describe, expect, it } from "vitest";

import { canonicalBoardHash, canonicalBoardSignature, createPuzzleCatalog, evaluateCatalogBase, migratePuzzleCatalog, rankComplexity, recordCatalogEvaluation, type PuzzleCatalogConfig } from "../../src/jigsaw/catalog.js";
import { JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION } from "../../src/content/jigsaw-starter-level.js";
import type { JigsawAnalysis } from "../../src/jigsaw/analysis.js";
import { deriveChordVariant, generateChordProfiles, type GeneratedJigsawLevel } from "../../src/jigsaw/generator.js";
import { validateLevel } from "../../src/jigsaw/rules.js";
import { classifyJigsaw } from "../../src/jigsaw/solver.js";
import type { JigsawLevel } from "../../src/jigsaw/types.js";

const config: PuzzleCatalogConfig = { seedStart: 1, candidateCount: 4, analysisNodeLimit: 25_000 };
const uniquePuzzle: GeneratedJigsawLevel = { seed: 1, level: JIGSAW_STARTER_LEVEL, solution: JIGSAW_STARTER_SOLUTION, clues: JIGSAW_STARTER_SOLUTION, title: "Catalog fixture", introduction: "A fully-clued unique fixture." };
const uniqueBase = { seed: 1, level: JIGSAW_STARTER_LEVEL, solution: JIGSAW_STARTER_SOLUTION };

describe("puzzle catalog", () => {
  it("independently admits complete base witnesses", () => {
    const evaluation = evaluateCatalogBase(1, uniqueBase, config.analysisNodeLimit);
    expect(evaluation.status).toBe("accepted");
    if (evaluation.status === "accepted") expect(evaluation.entry.candidateId).toBe("base:1");
  });

  it("uses the same canonical identity for all rotations but not a reflection", () => {
    const identity = canonicalBoardSignature(uniquePuzzle);
    for (const rotation of [0, 1, 2, 3]) expect(canonicalBoardSignature(rotatePuzzle(uniquePuzzle, rotation))).toBe(identity);
    expect(canonicalBoardHash(identity)).toBe(canonicalBoardHash(canonicalBoardSignature(rotatePuzzle(uniquePuzzle, 1))));
    expect(canonicalBoardSignature(reflectPuzzle(uniquePuzzle))).not.toBe(identity);
  });

  it("ignores clues and arbitrary region names but retains gameplay-relevant state", () => {
    const identity = canonicalBoardSignature(uniquePuzzle);
    expect(canonicalBoardSignature({ level: uniquePuzzle.level, solution: uniquePuzzle.solution })).toBe(identity);
    expect(canonicalBoardSignature(renameRegions(uniquePuzzle))).toBe(identity);
    expect(canonicalBoardSignature({ ...uniquePuzzle, solution: [{ ...uniquePuzzle.solution[0]!, service: "water" }, ...uniquePuzzle.solution.slice(1)] })).not.toBe(identity);
    const firstRegion = uniquePuzzle.level.regions[0]![0]!;
    const changedRequirement: JigsawLevel = { ...uniquePuzzle.level, regionDefinitions: { ...uniquePuzzle.level.regionDefinitions, [firstRegion]: { type: "normal", requirements: { power: 2, water: 1, food: 1 } } } };
    expect(canonicalBoardSignature({ ...uniquePuzzle, level: changedRequirement })).not.toBe(identity);
    expect(canonicalBoardSignature({ ...uniquePuzzle, level: { ...uniquePuzzle.level, quotas: { ...uniquePuzzle.level.quotas, water: { ...uniquePuzzle.level.quotas.water, total: 5 } } } })).not.toBe(identity);
    expect(canonicalBoardSignature({ ...uniquePuzzle, level: { ...uniquePuzzle.level, landmarks: [{ type: "echo", position: { row: 0, column: 0 } }] } })).not.toBe(identity);
    const portalLevel: JigsawLevel = {
      ...uniquePuzzle.level,
      landmarks: [
        { type: "portal", pair: "north", position: { row: 0, column: 0 }, mouth: { row: 0, column: 1 } },
        { type: "portal", pair: "north", position: { row: 5, column: 5 }, mouth: { row: 5, column: 4 } },
      ],
    };
    const renamedPortalLevel: JigsawLevel = { ...portalLevel, landmarks: portalLevel.landmarks!.map((landmark) => landmark.type === "portal" ? { ...landmark, pair: "renamed" } : landmark) };
    expect(canonicalBoardSignature({ level: portalLevel, solution: uniquePuzzle.solution })).toBe(canonicalBoardSignature({ level: renamedPortalLevel, solution: uniquePuzzle.solution }));
  });

  it("records rotated boards as duplicates and compares full signatures after hash matches", () => {
    const first = evaluateCatalogBase(1, uniqueBase, config.analysisNodeLimit);
    const rotatedPuzzle = rotatePuzzle(uniquePuzzle, 1);
    const rotated = evaluateCatalogBase(2, { seed: 2, level: rotatedPuzzle.level, solution: rotatedPuzzle.solution }, config.analysisNodeLimit);
    const catalog = recordCatalogEvaluation(recordCatalogEvaluation(createPuzzleCatalog(config), first), rotated);
    expect(catalog.puzzles).toHaveLength(1);
    expect(catalog.failures).toEqual([expect.objectContaining({ candidateId: "base:2", reason: "duplicate-rotation" })]);

    if (first.status !== "accepted") throw new Error("Expected accepted fixture.");
    const collision = {
      status: "accepted" as const,
      entry: { ...first.entry, id: "base:3:collision", candidateId: "base:3", seed: 3, boardSignature: `${first.entry.boardSignature}different` },
    };
    expect(recordCatalogEvaluation(recordCatalogEvaluation(createPuzzleCatalog(config), first), collision).puzzles).toHaveLength(2);
  });

  it("backfills legacy playable catalogs into base identities", () => {
    const migrated = migratePuzzleCatalog({ version: 1, config: { ...config, profiles: ["guided"] }, processedCandidates: ["guided:1"], puzzles: [{ seed: 1, puzzle: uniquePuzzle }], failures: [] });
    expect(migrated.version).toBe(3);
    expect(migrated.puzzles).toHaveLength(1);
    expect(migrated.puzzles[0]!.candidateId).toBe("base:1");
  });

  it("derives all profiles from one shared base board", () => {
    const results = generateChordProfiles(71, ["guided", "standard", "expert"]);
    const puzzles = results.filter((result): result is Extract<typeof result, { status: "generated" }> => result.status === "generated").map((result) => result.puzzle);
    expect(puzzles).toHaveLength(3);
    expect(new Set(puzzles.map((puzzle) => puzzle.level))).toHaveLength(1);
  }, 30_000);

  it("certifies derived variants with empty-witness dead zones and exact clues", () => {
    const result = deriveChordVariant(uniqueBase, { deadZoneCount: 0, clueCount: uniqueBase.solution.length, variationSeed: 1 });
    expect(result.status).toBe("generated");
    if (result.status !== "generated") return;
    expect(validateLevel(result.puzzle.level)).toEqual([]);
    expect(classifyJigsaw(result.puzzle.level, result.puzzle.clues).status).toBe("unique");
  });

  it("separates truncated analysis from sortable complexity diagnostics", () => {
    expect(rankComplexity(analysis({ required: true, truncated: true })).bucket).toBe("unranked");
    expect(rankComplexity(analysis({ required: false, truncated: false })).bucket).toBe("logic-only");
    expect(rankComplexity(analysis({ required: true, truncated: false })).bucket).toBe("search-ranked");
  });
});

function rotatePuzzle(puzzle: GeneratedJigsawLevel, turns: number): GeneratedJigsawLevel {
  const size = puzzle.level.size;
  const rotate = (position: { row: number; column: number }) => Array.from({ length: turns }, (_, index) => index).reduce((current) => ({ row: current.column, column: size - 1 - current.row }), position);
  const regions = Array.from({ length: size }, () => Array.from({ length: size }, () => ""));
  puzzle.level.regions.forEach((row, rowIndex) => row.forEach((region, column) => { const position = rotate({ row: rowIndex, column }); regions[position.row]![position.column] = region; }));
  const landmarks = puzzle.level.landmarks?.map((landmark) => landmark.type === "portal" ? { ...landmark, position: rotate(landmark.position), mouth: rotate(landmark.mouth) } : { ...landmark, position: rotate(landmark.position) });
  return {
    ...puzzle,
    level: {
      ...puzzle.level,
      regions,
      ...(landmarks ? { landmarks } : {}),
    },
    solution: puzzle.solution.map((placement) => ({ ...placement, position: rotate(placement.position) })),
    clues: puzzle.clues.map((placement) => ({ ...placement, position: rotate(placement.position) })),
  };
}

function reflectPuzzle(puzzle: GeneratedJigsawLevel): GeneratedJigsawLevel {
  const size = puzzle.level.size;
  const reflect = (position: { row: number; column: number }) => ({ row: position.row, column: size - 1 - position.column });
  const landmarks = puzzle.level.landmarks?.map((landmark) => landmark.type === "portal" ? { ...landmark, position: reflect(landmark.position), mouth: reflect(landmark.mouth) } : { ...landmark, position: reflect(landmark.position) });
  return {
    ...puzzle,
    level: { ...puzzle.level, regions: puzzle.level.regions.map((row) => [...row].reverse()), ...(landmarks ? { landmarks } : {}) },
    solution: puzzle.solution.map((placement) => ({ ...placement, position: reflect(placement.position) })),
    clues: puzzle.clues.map((placement) => ({ ...placement, position: reflect(placement.position) })),
  };
}

function renameRegions(puzzle: GeneratedJigsawLevel): GeneratedJigsawLevel {
  const names = [...new Set(puzzle.level.regions.flat())];
  const renamed = new Map(names.map((name, index) => [name, `district-${index}`]));
  return { ...puzzle, level: { ...puzzle.level, regions: puzzle.level.regions.map((row) => row.map((region) => renamed.get(region)!)), regionDefinitions: Object.fromEntries(names.map((name) => [renamed.get(name)!, puzzle.level.regionDefinitions[name]!])) } };
}

function analysis(search: Pick<JigsawAnalysis["search"], "required" | "truncated">): JigsawAnalysis {
  return { valid: true, levelIssues: [], clueIssues: [], solutionCount: search.truncated ? "unknown" : 1, structural: { size: 6, activeServices: ["generator"], clues: 1, normalDistricts: 6, tunnelDistricts: 0 }, candidateProfile: { initialCandidates: 10, peakCandidates: 10, averageCandidatesPerRequiredPlacement: 1 }, logic: { solvedWithoutAssumption: !search.required, steps: [], placementsByTechnique: { "inventory-single": 0, "row-single": 0, "column-single": 0, "district-single": 0 }, bottlenecks: [] }, search: { ...search, nodes: 4, decisions: 2, contradictions: 1, maxDepth: 2 } };
}

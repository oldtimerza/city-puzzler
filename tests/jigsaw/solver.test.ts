import { describe, expect, it } from "vitest";

import { EXPERIMENTAL_DISCOVERY_PUZZLES } from "../../src/content/experimental-discovery-levels.js";
import { JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION } from "../../src/content/jigsaw-starter-level.js";
import { DEFAULT_LANDMARK_LIMITS, certifyJigsawLayout, generateChordLevel } from "../../src/jigsaw/generator.js";
import { validateLevel } from "../../src/jigsaw/rules.js";
import { classifyJigsaw, solveJigsawExactly } from "../../src/jigsaw/solver.js";
import type { JigsawLevel } from "../../src/jigsaw/types.js";

describe("exact Jigsaw solver", () => {
  it("distinguishes invalid clues, unique witnesses, and multiple solutions", () => {
    expect(classifyJigsaw(JIGSAW_STARTER_LEVEL, [{ service: "water", position: JIGSAW_STARTER_SOLUTION[0]!.position }, { service: "farm", position: JIGSAW_STARTER_SOLUTION[0]!.position }]).status).toBe("invalid");
    expect(classifyJigsaw(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION).status).toBe("unique");
    expect(classifyJigsaw(JIGSAW_STARTER_LEVEL).status).toBe("multiple");
  });

  it("proves a structurally valid resource-overdemanded layout unsatisfiable", () => {
    const level: JigsawLevel = {
      ...JIGSAW_STARTER_LEVEL,
      activeServices: ["water"],
      quotas: {
        generator: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
        water: { total: 6, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 },
        farm: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
        factory: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
        twin: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
      },
      regionDefinitions: Object.fromEntries(Object.keys(JIGSAW_STARTER_LEVEL.regionDefinitions).map((region) => [region, { type: "normal", requirements: { water: 2 } }])) as JigsawLevel["regionDefinitions"],
    };
    expect(solveJigsawExactly(level).status).toBe("unsatisfiable");
  });

  it("rejects clues on a dead zone before searching", () => {
    const deadLevel = levelWithDeadZone();
    const deadPosition = deadLevel.regions.flatMap((regionRow, row) => regionRow.map((region, column) => ({ region, row, column }))).find((cell) => cell.region === "X")!;
    const result = solveJigsawExactly(deadLevel, [{ service: "generator", position: deadPosition }]);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.issues).toContain("invalid-clue-dead-region");
  });

  it("handles every active service, including Twin and landmark identities", () => {
    for (const puzzle of EXPERIMENTAL_DISCOVERY_PUZZLES) {
      expect(classifyJigsaw(puzzle.level, puzzle.clues).status).toBe("unique");
    }
  });

  it("certifies supplied layouts and produces deterministic exact clue profiles", () => {
    const certified = certifyJigsawLayout(JIGSAW_STARTER_LEVEL.regions, 17, ["water", "farm", "generator"]);
    expect(certified.status).toBe("solved");
    const first = generateChordLevel(71, "expert");
    const second = generateChordLevel(71, "expert");
    expect(second).toEqual(first);
    expect(classifyJigsaw(first.level, first.clues).status).toBe("unique");
    expect(first.level.landmarks?.length ?? 0).toBeLessThanOrEqual(DEFAULT_LANDMARK_LIMITS.maximum);
  }, 30_000);

  it("honors an exact generated landmark count", () => {
    const puzzle = generateChordLevel(71, "guided", { minimum: 2, maximum: 2 });

    expect(puzzle.level.landmarks).toHaveLength(2);
    expect(classifyJigsaw(puzzle.level, puzzle.clues).status).toBe("unique");
  }, 15_000);
});

function levelWithDeadZone(): JigsawLevel {
  for (let row = 0; row < JIGSAW_STARTER_LEVEL.size; row += 1) {
    for (let column = 0; column < JIGSAW_STARTER_LEVEL.size; column += 1) {
      const regions = JIGSAW_STARTER_LEVEL.regions.map((regionRow) => [...regionRow]);
      regions[row]![column] = "X";
      const level: JigsawLevel = {
        ...JIGSAW_STARTER_LEVEL,
        regions,
        regionDefinitions: { ...JIGSAW_STARTER_LEVEL.regionDefinitions, X: { type: "dead" } },
      };
      if (validateLevel(level).length === 0) return level;
    }
  }
  throw new Error("Expected a valid dead-zone cell.");
}

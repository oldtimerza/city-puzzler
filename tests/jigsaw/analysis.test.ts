import { describe, expect, it } from "vitest";

import { JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION } from "../../src/content/jigsaw-starter-level.js";
import { analyzeJigsawComplexity, forcedJigsawPlacements } from "../../src/jigsaw/analysis.js";

describe("Jigsaw complexity analysis", () => {
  it("solves a nearly complete board through a recorded deduction", () => {
    const analysis = analyzeJigsawComplexity(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION.slice(0, -1));

    expect(analysis.valid).toBe(true);
    expect(analysis.solutionCount).toBe(1);
    expect(analysis.logic.solvedWithoutAssumption).toBe(true);
    expect(analysis.logic.steps).toHaveLength(1);
    expect(analysis.search.required).toBe(false);
    expect(analysis.search.decisions).toBe(0);
    expect(analysis.candidateProfile.initialCandidates).toBeGreaterThan(0);
  });

  it("returns every cascading forced placement without changing the source board", () => {
    const clues = JIGSAW_STARTER_SOLUTION.slice(0, -1);
    const forced = forcedJigsawPlacements(JIGSAW_STARTER_LEVEL, clues);

    expect(forced).toEqual([JIGSAW_STARTER_SOLUTION[JIGSAW_STARTER_SOLUTION.length - 1]]);
    expect(clues).toHaveLength(JIGSAW_STARTER_SOLUTION.length - 1);
  });

  it("reports when an under-clued board needs assumptions", () => {
    const analysis = analyzeJigsawComplexity(JIGSAW_STARTER_LEVEL, [], { nodeLimit: 2_000 });

    expect(analysis.valid).toBe(true);
    expect(analysis.logic.solvedWithoutAssumption).toBe(false);
    expect(analysis.search.required).toBe(true);
    expect(analysis.search.decisions).toBeGreaterThan(0);
    expect([2, "unknown"]).toContain(analysis.solutionCount);
    expect(analysis.logic.bottlenecks.some((bottleneck) => bottleneck.kind === "logic-stall")).toBe(true);
  });

  it("returns a deterministic trace without mutating its inputs", () => {
    const clues = JIGSAW_STARTER_SOLUTION.slice(0, -2);
    const before = JSON.stringify(clues);
    const first = analyzeJigsawComplexity(JIGSAW_STARTER_LEVEL, clues);
    const second = analyzeJigsawComplexity(JIGSAW_STARTER_LEVEL, clues);

    expect(second).toEqual(first);
    expect(JSON.stringify(clues)).toBe(before);
  });

  it("does not rate structurally invalid drafts", () => {
    const analysis = analyzeJigsawComplexity({ ...JIGSAW_STARTER_LEVEL, regionDefinitions: {} }, []);

    expect(analysis.valid).toBe(false);
    expect(analysis.solutionCount).toBe("unknown");
    expect(analysis.levelIssues).toContain("invalid-region-definitions");
  });
});

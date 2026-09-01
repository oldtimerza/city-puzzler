import { describe, expect, it } from "vitest";

import { CAMPAIGN_LEVELS } from "../../src/content/campaign-levels.js";
import { isLevelComplete } from "../../src/jigsaw/rules.js";
import { countSolutions } from "../../src/jigsaw/solver.js";

describe("tutorial campaign", () => {
  it("provides a uniquely solvable progression from 5x5 to 6x6", () => {
    expect(CAMPAIGN_LEVELS.map((level) => level.id)).toEqual(["irrigation", "crosswinds", "regional-plan"]);
    expect(CAMPAIGN_LEVELS.map((level) => level.boardSize)).toEqual([5, 5, 6]);
    expect(CAMPAIGN_LEVELS.map((level) => level.activeServices)).toEqual([["water", "farm"], ["water", "generator"], ["water", "farm", "generator"]]);
    expect(CAMPAIGN_LEVELS.every((level) => isLevelComplete(level.level, level.solution))).toBe(true);
    expect(CAMPAIGN_LEVELS.every((level) => level.clues.length < level.solution.length)).toBe(true);
    expect(CAMPAIGN_LEVELS.every((level) => countSolutions(level.level, level.clues) === 1)).toBe(true);
  });
});

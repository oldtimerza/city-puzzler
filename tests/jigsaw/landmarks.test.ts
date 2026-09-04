import { describe, expect, it } from "vitest";

import { EXPERIMENTAL_DISCOVERY_PUZZLES } from "../../src/content/experimental-discovery-levels.js";
import { evaluatePlacements, identitiesAt, interactionEdges, isFarmSupplied, isLevelComplete, isPlacementActive, regionAt, resourceSupplyForRegion, validateLevel, validatePlacement } from "../../src/jigsaw/rules.js";
import { countSolutions } from "../../src/jigsaw/solver.js";
import { JIGSAW_STARTER_LEVEL } from "../../src/content/jigsaw-starter-level.js";
import type { JigsawLevel, ServicePlacement } from "../../src/jigsaw/types.js";

const farm: ServicePlacement = { service: "farm", position: { row: 0, column: 0 } };
const water: ServicePlacement = { service: "water", position: { row: 0, column: 2 } };

describe("experimental landmarks", () => {
  it("keeps the standard board mechanics unchanged when no landmarks exist", () => {
    expect(validateLevel(JIGSAW_STARTER_LEVEL)).toEqual([]);
    expect(interactionEdges(JIGSAW_STARTER_LEVEL).every((edge) => edge.kind === "physical")).toBe(true);
  });

  it("copies direct physical identities once through Echo", () => {
    const level = withLandmarks([{ type: "echo", position: { row: 0, column: 1 } }]);
    expect(isFarmSupplied(level, [farm, water], farm)).toBe(true);
    expect(identitiesAt(level, [farm, water], { row: 0, column: 1 }).map((identity) => identity.service)).toEqual(["farm", "water"]);
    expect(validatePlacement(level, [{ service: "water", position: { row: 0, column: 0 } }], { service: "generator", position: { row: 0, column: 2 } })).toContain("generator-water-conflict");
    expect(validatePlacement(level, [], { service: "water", position: { row: 0, column: 1 } })).toContain("landmark-cell");

    const nonRecursive = withLandmarks([{ type: "echo", position: { row: 0, column: 1 } }, { type: "echo", position: { row: 0, column: 2 } }]);
    expect(identitiesAt(nonRecursive, [{ service: "water", position: { row: 0, column: 0 } }], { row: 0, column: 2 })).toEqual([]);
  });

  it("allows only Sanctuary-contained Circle and Diamond interaction", () => {
    const [first, second] = sameRegionEdge();
    const region = JIGSAW_STARTER_LEVEL.regions[first.row]![first.column]!;
    const sanctuary: JigsawLevel = { ...JIGSAW_STARTER_LEVEL, regionDefinitions: { ...JIGSAW_STARTER_LEVEL.regionDefinitions, [region]: { type: "normal", requirements: JIGSAW_STARTER_LEVEL.regionDefinitions[region]!.type === "normal" ? JIGSAW_STARTER_LEVEL.regionDefinitions[region]!.requirements : {}, sanctuary: true } } };
    expect(validatePlacement(JIGSAW_STARTER_LEVEL, [{ service: "generator", position: first }], { service: "water", position: second })).toContain("generator-water-conflict");
    expect(validatePlacement(sanctuary, [{ service: "generator", position: first }], { service: "water", position: second })).not.toContain("generator-water-conflict");
  });

  it("applies Catalyst before Amplifier without lending an identity", () => {
    const level = withLandmarks([{ type: "catalyst", position: { row: 0, column: 1 } }, { type: "amplifier", position: { row: 1, column: 0 } }]);
    expect(isPlacementActive(level, [farm], farm)).toBe(true);
    expect(resourceSupplyForRegion(level, [farm], regionAt(level, farm.position)).food).toBe(2);
    expect(identitiesAt(level, [farm], { row: 0, column: 1 })).toEqual([]);
  });

  it("connects portal mouths for support and Twin activation only", () => {
    const level = withLandmarks([
      { type: "portal", pair: "p", position: { row: 0, column: 1 }, mouth: { row: 0, column: 0 } },
      { type: "portal", pair: "p", position: { row: 0, column: 2 }, mouth: { row: 1, column: 2 } },
    ]);
    const remoteWater: ServicePlacement = { service: "water", position: { row: 1, column: 2 } };
    const firstTwin: ServicePlacement = { service: "twin", position: { row: 0, column: 0 } };
    const secondTwin: ServicePlacement = { service: "twin", position: { row: 1, column: 2 } };
    expect(isFarmSupplied(level, [farm, remoteWater], farm)).toBe(true);
    expect(isPlacementActive(level, [firstTwin, secondTwin], firstTwin)).toBe(true);
    expect(interactionEdges(level).filter((edge) => edge.kind === "portal")).toHaveLength(1);
    expect(interactionEdges(level).filter((edge) => edge.kind === "physical")).toHaveLength(interactionEdges(JIGSAW_STARTER_LEVEL).length);
  });

  it("uses Echo identity for Twin but counts its one occupied position once", () => {
    const level = withLandmarks([{ type: "echo", position: { row: 0, column: 1 } }]);
    const left: ServicePlacement = { service: "twin", position: { row: 0, column: 0 } };
    const right: ServicePlacement = { service: "twin", position: { row: 0, column: 2 } };
    expect(isPlacementActive(level, [left, right], left)).toBe(true);
    expect(isPlacementActive(level, [left, right], right)).toBe(true);
    const crowded: ServicePlacement[] = [left, { service: "twin", position: { row: 0, column: 1 } }, right];
    expect(isPlacementActive(JIGSAW_STARTER_LEVEL, crowded, crowded[1]!)).toBe(false);
  });

  it("rejects malformed landmark positions, pairs, mouths, and overlap", () => {
    expect(validateLevel(withLandmarks([{ type: "portal", pair: "broken", position: { row: 0, column: 0 }, mouth: { row: 0, column: 1 } }]))).toContain("invalid-landmarks");
    expect(validateLevel(withLandmarks([{ type: "echo", position: { row: 0, column: 0 } }, { type: "amplifier", position: { row: 0, column: 0 } }]))).toContain("invalid-landmarks");
    expect(validateLevel(withLandmarks([{ type: "portal", pair: "p", position: { row: 0, column: 0 }, mouth: { row: 0, column: 1 } }, { type: "portal", pair: "p", position: { row: 2, column: 2 }, mouth: { row: 0, column: 1 } }]))).toContain("invalid-landmarks");
  });

  it("certifies the authored experimental discovery puzzle", () => {
    expect(EXPERIMENTAL_DISCOVERY_PUZZLES.every((puzzle) => isLevelComplete(puzzle.level, puzzle.solution))).toBe(true);
    expect(EXPERIMENTAL_DISCOVERY_PUZZLES.every((puzzle) => countSolutions(puzzle.level, puzzle.clues) === 1)).toBe(true);
    expect(EXPERIMENTAL_DISCOVERY_PUZZLES.some((puzzle) => evaluatePlacements(puzzle.level, puzzle.solution).amplified.size === 1)).toBe(true);
  });
});

function withLandmarks(landmarks: NonNullable<JigsawLevel["landmarks"]>): JigsawLevel {
  return { ...JIGSAW_STARTER_LEVEL, landmarks };
}

function sameRegionEdge(): readonly [ServicePlacement["position"], ServicePlacement["position"]] {
  for (let row = 0; row < JIGSAW_STARTER_LEVEL.size; row += 1) {
    for (let column = 0; column < JIGSAW_STARTER_LEVEL.size - 1; column += 1) {
      if (JIGSAW_STARTER_LEVEL.regions[row]![column] === JIGSAW_STARTER_LEVEL.regions[row]![column + 1]) return [{ row, column }, { row, column: column + 1 }];
    }
  }
  throw new Error("Expected a physical edge within a district.");
}

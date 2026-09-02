import { describe, expect, it } from "vitest";

import { JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION } from "../../src/content/jigsaw-starter-level.js";
import { BOARD_SIZES, generateJigsawLevel } from "../../src/jigsaw/generator.js";
import { factorySuppliers, inactiveFactories, isFactorySupplied, isFarmSupplied, isLevelComplete, legalPositions, regionAt, resourceSupplyForRegion, supplyingDam, unmetResourcesForRegion, unsuppliedFarms, validateLevel, validatePlacement, validatePlacements } from "../../src/jigsaw/rules.js";
import type { JigsawLevel, ServicePlacement } from "../../src/jigsaw/types.js";

describe("Jigsaw service rules", () => {
  it("constructs valid district partitions around valid service layouts", () => {
    const fullProfileBoards = BOARD_SIZES.filter((size) => size !== 5).flatMap((size) => Array.from({ length: 12 }, (_, index) => generateJigsawLevel(index + 1, size)));
    const tutorialProfileBoards = Array.from({ length: 6 }, (_, index) => [
      generateJigsawLevel(index + 101, 5, ["water", "farm"]),
      generateJigsawLevel(index + 201, 5, ["generator", "water"]),
    ]).flat();
    const factoryCountBoards = BOARD_SIZES.filter((size) => size !== 5).flatMap((size) =>
      Array.from({ length: size }, (_, index) => {
        const total = index + 1;
        return generateJigsawLevel(index + 401 + size * 10, size, undefined, {
          factory: { total, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 },
        });
      }),
    );
    const generated = [...fullProfileBoards, ...tutorialProfileBoards, ...factoryCountBoards];

    expect(generated.every(({ level }) => validateLevel(level).length === 0)).toBe(true);
    expect(generated.every(({ level, solution }) => isLevelComplete(level, solution))).toBe(true);
    expect(generated.every(({ level }) => countStraightRegions(level.regions) === 0)).toBe(true);
    expect(generated.every(({ level }) => countSimpleLRegions(level.regions) === 0)).toBe(true);
    expect(new Set(generated.map(({ level }) => JSON.stringify(level.regions))).size).toBeGreaterThan(5);
    expect(fullProfileBoards.every(({ level }) => level.activeServices.includes("factory") && level.quotas.factory.total === 4)).toBe(true);
    expect(fullProfileBoards.every(({ level }) => Object.values(level.regionRequirements).reduce((total, requirements) => total + (requirements.steel ?? 0), 0) === 4)).toBe(true);
    expect(factoryCountBoards.every(({ level, solution }) => level.quotas.factory.total === solution.filter((placement) => placement.service === "factory").length)).toBe(true);
  });

  it("accepts the hand-authored irregular region map", () => {
    expect(validateLevel(JIGSAW_STARTER_LEVEL)).toEqual([]);
  });

  it("rejects a disconnected region map", () => {
    const disconnected: JigsawLevel = {
      ...JIGSAW_STARTER_LEVEL,
      regions: [
        ["A", "B", "B", "B", "B", "C"],
        ["B", "A", "B", "C", "C", "C"],
        ["D", "A", "B", "C", "C", "C"],
        ["D", "D", "A", "E", "E", "E"],
        ["D", "D", "E", "E", "E", "E"],
        ["F", "F", "F", "F", "F", "F"],
      ],
    };

    expect(validateLevel(disconnected)).toContain("disconnected-region");
  });

  it("enforces row, column, region, inventory, and cell conflicts per service", () => {
    const generator: ServicePlacement = { service: "generator", position: { row: 0, column: 0 } };
    const water: ServicePlacement = { service: "water", position: { row: 0, column: 1 } };
    const sameRegion = firstRegionPeer(generator.position);

    expect(validatePlacement(JIGSAW_STARTER_LEVEL, [generator], { service: "generator", position: { row: 0, column: 3 } })).toContain("row-conflict");
    expect(validatePlacement(JIGSAW_STARTER_LEVEL, [generator], { service: "generator", position: { row: 3, column: 0 } })).toContain("column-conflict");
    expect(validatePlacement(JIGSAW_STARTER_LEVEL, [generator], { service: "generator", position: sameRegion })).toContain("region-conflict");
    expect(validatePlacement(JIGSAW_STARTER_LEVEL, [generator], { service: "water", position: { row: 0, column: 2 } })).toEqual([]);
    expect(validatePlacement(JIGSAW_STARTER_LEVEL, [generator], { service: "water", position: generator.position })).toContain("occupied-cell");
    expect(validatePlacement(JIGSAW_STARTER_LEVEL, [generator, water], { service: "farm", position: { row: 0, column: 2 } })).toEqual([]);
    expect(validatePlacement(JIGSAW_STARTER_LEVEL, [generator, water], { service: "farm", position: { row: 4, column: 4 } })).toContain("farm-dam-missing");
  });

  it("requires farms to have water and keeps generators away from water", () => {
    const generator: ServicePlacement = { service: "generator", position: { row: 0, column: 0 } };
    const farm: ServicePlacement = { service: "farm", position: { row: 0, column: 1 } };
    const water: ServicePlacement = { service: "water", position: { row: 0, column: 2 } };

    expect(validatePlacement(JIGSAW_STARTER_LEVEL, [generator], { service: "water", position: { row: 1, column: 0 } })).toContain(
      "generator-water-conflict",
    );
    expect(isFarmSupplied([farm], farm)).toBe(false);
    expect(unsuppliedFarms([farm])).toEqual([farm]);
    expect(isFarmSupplied([farm, water], farm)).toBe(true);
    expect(supplyingDam([farm, water], farm)).toBe(water);
    expect(unsuppliedFarms([farm, water])).toEqual([]);
  });

  it("identifies legal candidate cells and completes only the full valid layout", () => {
    expect(legalPositions(JIGSAW_STARTER_LEVEL, [], "generator")).toHaveLength(36);
    expect(validatePlacements(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION)).toEqual([]);
    expect(isLevelComplete(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION)).toBe(true);
    expect(isLevelComplete(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION.slice(0, -1))).toBe(false);
  });

  it("tracks district resources and requires every district demand to be met", () => {
    const region = JIGSAW_STARTER_LEVEL.regions[0]![0]!;
    const supply = resourceSupplyForRegion(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION, region);

    expect(supply).toEqual({ food: 1, water: 1, power: 1, steel: 0 });
    expect(unmetResourcesForRegion(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION, region)).toEqual([]);
    expect(unmetResourcesForRegion(JIGSAW_STARTER_LEVEL, [], region)).toEqual(["food", "water", "power"]);

    const extraFoodRequired: JigsawLevel = {
      ...JIGSAW_STARTER_LEVEL,
      regionRequirements: {
        ...JIGSAW_STARTER_LEVEL.regionRequirements,
        [region]: { ...JIGSAW_STARTER_LEVEL.regionRequirements[region], food: 2 },
      },
    };

    expect(validateLevel(extraFoodRequired)).toEqual([]);
    expect(unmetResourcesForRegion(extraFoodRequired, JIGSAW_STARTER_SOLUTION, region)).toEqual(["food"]);
    expect(isLevelComplete(extraFoodRequired, JIGSAW_STARTER_SOLUTION)).toBe(false);

    expect(validateLevel({ ...JIGSAW_STARTER_LEVEL, regionRequirements: {} })).toContain("invalid-region-requirements");
  });

  it("activates Factory Steel production from adjacent Power and Water", () => {
    const factoryLevel = generateJigsawLevel(
      601,
      6,
      ["water", "generator", "factory"],
      { factory: { total: 2, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 } },
      ["A", "D"],
    );
    const factory = factoryLevel.solution.find((placement) => placement.service === "factory")!;
    const adjacentWater = factoryLevel.solution.find(
      (placement) => placement.service === "water" && Math.abs(placement.position.row - factory.position.row) + Math.abs(placement.position.column - factory.position.column) === 1,
    )!;
    const factoryRegion = regionAt(factoryLevel.level, factory.position);
    const nonIndustrialRegion = [...new Set(factoryLevel.level.regions.flat())].find((region) => region !== "A" && region !== "D")!;
    const nonIndustrialCell = firstPositionInRegion(factoryLevel.level, nonIndustrialRegion);

    expect(factoryLevel.level.quotas.factory.total).toBe(2);
    expect(factoryLevel.solution.filter((placement) => placement.service === "factory")).toHaveLength(2);
    expect(factoryLevel.solution.filter((placement) => placement.service === "factory").every((placement) => isFactorySupplied(factoryLevel.solution, placement))).toBe(true);
    expect(factorySuppliers(factoryLevel.solution, factory).water).toBe(adjacentWater);
    expect(factorySuppliers(factoryLevel.solution, factory).power).not.toBeNull();
    expect(resourceSupplyForRegion(factoryLevel.level, factoryLevel.solution, factoryRegion).steel).toBe(1);
    expect(inactiveFactories(factoryLevel.solution.filter((placement) => placement !== adjacentWater))).toContain(factory);
    expect(validatePlacement(factoryLevel.level, [], { service: "factory", position: nonIndustrialCell })).toContain("factory-steel-demand-missing");
  });
});

function countStraightRegions(regions: readonly (readonly string[])[]): number {
  const regionNames = new Set(regions.flat());

  return [...regionNames].filter((region) => {
    const cells = regions.flatMap((row, rowIndex) => row.map((value, column) => ({ row: rowIndex, column, value }))).filter((cell) => cell.value === region);
    return new Set(cells.map((cell) => cell.row)).size === 1 || new Set(cells.map((cell) => cell.column)).size === 1;
  }).length;
}

function countSimpleLRegions(regions: readonly (readonly string[])[]): number {
  return [...new Set(regions.flat())].filter((region) => {
    const cells = regions.flatMap((row, rowIndex) => row.map((value, column) => ({ row: rowIndex, column, value }))).filter((cell) => cell.value === region);

    return cells.some((corner) => cells.every((cell) => cell.row === corner.row || cell.column === corner.column));
  }).length;
}

function firstRegionPeer(position: ServicePlacement["position"]): ServicePlacement["position"] {
  const region = regionAt(JIGSAW_STARTER_LEVEL, position);

  for (let row = 0; row < JIGSAW_STARTER_LEVEL.size; row += 1) {
    for (let column = 0; column < JIGSAW_STARTER_LEVEL.size; column += 1) {
      if ((row !== position.row || column !== position.column) && regionAt(JIGSAW_STARTER_LEVEL, { row, column }) === region) {
        return { row, column };
      }
    }
  }

  throw new Error("Expected the starter region to have another cell.");
}

function firstPositionInRegion(level: JigsawLevel, region: string): ServicePlacement["position"] {
  for (let row = 0; row < level.size; row += 1) {
    for (let column = 0; column < level.size; column += 1) {
      if (regionAt(level, { row, column }) === region) {
        return { row, column };
      }
    }
  }

  throw new Error(`Expected a cell in district ${region}.`);
}

import { describe, expect, it } from "vitest";

import { JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION } from "../../src/content/jigsaw-starter-level.js";
import { BOARD_SIZES, DEFAULT_LANDMARK_LIMITS, generateChordLevel, generateJigsawLevel, generateRegionLayout } from "../../src/jigsaw/generator.js";
import { countSolutions } from "../../src/jigsaw/solver.js";
import { factorySuppliers, inactiveFactories, isFactorySupplied, isFarmSupplied, isLevelComplete, legalPositions, legalServicesAt, regionAt, regionComponents, resourceSupplyForRegion, supplyingDam, unmetResourcesForRegion, unsuppliedFarms, validateLevel, validatePlacement, validatePlacements } from "../../src/jigsaw/rules.js";
import type { JigsawLevel, ServicePlacement } from "../../src/jigsaw/types.js";

describe("Jigsaw service rules", () => {
  it("constructs valid district partitions around valid service layouts", () => {
    const fullProfileBoards = BOARD_SIZES.flatMap((size) => Array.from({ length: 2 }, (_, index) => generateJigsawLevel(index + 1, size)));
    const tutorialProfileBoards = Array.from({ length: 2 }, (_, index) => [
      generateJigsawLevel(index + 101, 6, ["water", "farm"]),
      generateJigsawLevel(index + 201, 6, ["generator", "water"]),
    ]).flat();
    const factoryCountBoards = BOARD_SIZES.flatMap((size) =>
      Array.from({ length: 3 }, (_, index) => {
        const total = index + 1;
        return generateJigsawLevel(index + 401 + size * 10, size, undefined, {
          factory: { total, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 },
        });
      }),
    );
    const generated = [...fullProfileBoards, ...tutorialProfileBoards, ...factoryCountBoards];

    expect(generated.every(({ level }) => validateLevel(level).length === 0)).toBe(true);
    expect(generated.every(({ level, solution }) => isLevelComplete(level, solution))).toBe(true);
    expect(generated.every(({ level }) => tunnelDistricts(level).length === 0)).toBe(true);
    expect(generated.every(({ level }) => countStraightRegions(level.regions) === 0)).toBe(true);
    expect(generated.every(({ level }) => countSimpleLRegions(level.regions) === 0)).toBe(true);
    expect(new Set(generated.map(({ level }) => JSON.stringify(level.regions))).size).toBeGreaterThan(5);
    expect(fullProfileBoards.every(({ level }) => level.activeServices.includes("factory") && level.quotas.factory.total === 4)).toBe(true);
    expect(fullProfileBoards.every(({ level }) => Object.values(level.regionDefinitions).reduce((total, definition) => total + (definition.type === "normal" ? definition.requirements.steel ?? 0 : 0), 0) === 4)).toBe(true);
    expect(factoryCountBoards.every(({ level, solution }) => level.quotas.factory.total === solution.filter((placement) => placement.service === "factory").length)).toBe(true);
  }, 15_000);

  it("accepts the hand-authored irregular region map", () => {
    expect(validateLevel(JIGSAW_STARTER_LEVEL)).toEqual([]);
  });

  it("builds varied connected region layouts for the editor", () => {
    const layouts = ([6] as const).flatMap((size) => {
      const level = generateJigsawLevel(800 + size, size, ["water", "farm", "generator"]).level;
      return Array.from({ length: 4 }, (_, index) => ({ level, regions: generateRegionLayout(index + size * 10, size) }));
    });

    expect(layouts.every(({ level, regions }) => validateLevel({ ...level, regions }).length === 0)).toBe(true);
    expect(layouts.every(({ level, regions }) => tunnelDistricts({ ...level, regions }).length >= 1 && tunnelDistricts({ ...level, regions }).length <= 2)).toBe(true);
    expect(new Set(layouts.map(({ regions }) => JSON.stringify(regions))).size).toBeGreaterThan(2);
  });

  it.each(["guided", "standard", "expert"] as const)("generates a uniquely solvable %s Chord", (difficulty) => {
    const puzzle = generateChordLevel(71, difficulty);

    expect(puzzle.level.size).toBe(6);
    expect(puzzle.clues).toHaveLength(difficulty === "guided" ? 3 : difficulty === "standard" ? 2 : 1);
    expect(tunnelDistricts(puzzle.level).length).toBeGreaterThanOrEqual(1);
    expect(tunnelDistricts(puzzle.level).length).toBeLessThanOrEqual(2);
    expect(puzzle.level.landmarks?.length ?? 0).toBeGreaterThanOrEqual(DEFAULT_LANDMARK_LIMITS.minimum);
    expect(puzzle.level.landmarks?.length ?? 0).toBeLessThanOrEqual(DEFAULT_LANDMARK_LIMITS.maximum);
    expect(countSolutions(puzzle.level, puzzle.clues)).toBe(1);
  }, 15_000);

  it("rejects a normal district split into more than two components", () => {
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

    expect(validateLevel(disconnected)).toContain("invalid-tunnel-components");
  });

  it("accepts two separated components as one tunnel district without creating adjacency", () => {
    const tunnelLevel = levelWithTunnelDistrict();
    const [firstComponent, secondComponent] = regionComponents(tunnelLevel.level, tunnelLevel.region);
    const left = firstComponent![0]!;
    const right = secondComponent![0]!;
    const farm: ServicePlacement = { service: "farm", position: left };
    const water: ServicePlacement = { service: "water", position: right };
    const generator: ServicePlacement = { service: "generator", position: left };

    expect(validateLevel(tunnelLevel.level)).toEqual([]);
    expect(regionComponents(tunnelLevel.level, tunnelLevel.region)).toHaveLength(2);
    expect(isLevelComplete(tunnelLevel.level, JIGSAW_STARTER_SOLUTION)).toBe(true);
    expect(countSolutions(tunnelLevel.level, JIGSAW_STARTER_SOLUTION)).toBe(1);
    expect(isFarmSupplied([farm, water], farm)).toBe(false);
    expect(validatePlacement(tunnelLevel.level, [generator], water)).not.toContain("generator-water-conflict");
    expect(validatePlacement(tunnelLevel.level, [generator], { service: "generator", position: right })).toContain("region-conflict");
  });

  it("allows one scattered dead zone while keeping it out of quotas and placements", () => {
    const deadTerrain = levelWithScatteredDeadZone();
    const deadPositions = deadTerrain.regions.flatMap((row, rowIndex) => row.map((region, column) => ({ region, row: rowIndex, column }))).filter((cell) => cell.region === "X");

    expect(validateLevel(deadTerrain)).toEqual([]);
    expect(deadPositions).toHaveLength(2);
    expect(Math.abs(deadPositions[0]!.row - deadPositions[1]!.row) + Math.abs(deadPositions[0]!.column - deadPositions[1]!.column)).toBeGreaterThan(1);
    expect(deadPositions.every((position) => validatePlacement(deadTerrain, [], { service: "water", position }).includes("dead-region"))).toBe(true);
    expect(unmetResourcesForRegion(deadTerrain, [], "X")).toEqual([]);
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
    expect(validatePlacement(JIGSAW_STARTER_LEVEL, [generator, water], { service: "farm", position: { row: 4, column: 4 } })).toEqual([]);
  });

  it("marks unsupported farms inactive and keeps generators away from water", () => {
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

    const region = regionAt(JIGSAW_STARTER_LEVEL, farm.position);
    expect(resourceSupplyForRegion(JIGSAW_STARTER_LEVEL, [farm], region).food).toBe(0);
    expect(resourceSupplyForRegion(JIGSAW_STARTER_LEVEL, [farm, water], region).food).toBe(1);
  });

  it("identifies legal candidate cells and completes only the full valid layout", () => {
    expect(legalPositions(JIGSAW_STARTER_LEVEL, [], "generator")).toHaveLength(36);
    expect(validatePlacements(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION)).toEqual([]);
    expect(isLevelComplete(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION)).toBe(true);
    expect(isLevelComplete(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION.slice(0, -1))).toBe(false);
  });

  it("lists the currently legal symbols for an empty cell", () => {
    const generator: ServicePlacement = { service: "generator", position: { row: 0, column: 0 } };
    const services = legalServicesAt(JIGSAW_STARTER_LEVEL, [generator], { row: 0, column: 2 });

    expect(services).toContain("water");
    expect(services).not.toContain("generator");
    expect(services).not.toContain("factory");
    expect(legalServicesAt(JIGSAW_STARTER_LEVEL, [generator], generator.position)).toEqual([]);
  });

  it("tracks district resources and requires every district demand to be met", () => {
    const region = JIGSAW_STARTER_LEVEL.regions[0]![0]!;
    const supply = resourceSupplyForRegion(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION, region);

    expect(supply).toEqual({ food: 1, water: 1, power: 1, steel: 0 });
    expect(unmetResourcesForRegion(JIGSAW_STARTER_LEVEL, JIGSAW_STARTER_SOLUTION, region)).toEqual([]);
    expect(unmetResourcesForRegion(JIGSAW_STARTER_LEVEL, [], region)).toEqual(["food", "water", "power"]);

    const extraFoodRequired: JigsawLevel = {
      ...JIGSAW_STARTER_LEVEL,
      regionDefinitions: {
        ...JIGSAW_STARTER_LEVEL.regionDefinitions,
        [region]: { type: "normal", requirements: { food: 2, water: 1, power: 1 } },
      },
    };

    expect(validateLevel(extraFoodRequired)).toEqual([]);
    expect(unmetResourcesForRegion(extraFoodRequired, JIGSAW_STARTER_SOLUTION, region)).toEqual(["food"]);
    expect(isLevelComplete(extraFoodRequired, JIGSAW_STARTER_SOLUTION)).toBe(false);

    expect(validateLevel({ ...JIGSAW_STARTER_LEVEL, regionDefinitions: {} })).toContain("invalid-region-definitions");
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

function levelWithScatteredDeadZone(): JigsawLevel {
  for (let row = 0; row < JIGSAW_STARTER_LEVEL.size; row += 1) {
    for (let column = 0; column < JIGSAW_STARTER_LEVEL.size; column += 1) {
      for (let otherRow = 0; otherRow < JIGSAW_STARTER_LEVEL.size; otherRow += 1) {
        for (let otherColumn = 0; otherColumn < JIGSAW_STARTER_LEVEL.size; otherColumn += 1) {
          if (Math.abs(row - otherRow) + Math.abs(column - otherColumn) <= 1) continue;
          const regions = JIGSAW_STARTER_LEVEL.regions.map((regionRow) => [...regionRow]);
          regions[row]![column] = "X";
          regions[otherRow]![otherColumn] = "X";
          const level: JigsawLevel = {
            ...JIGSAW_STARTER_LEVEL,
            regions,
            regionDefinitions: { ...JIGSAW_STARTER_LEVEL.regionDefinitions, X: { type: "dead" } },
          };

          if (validateLevel(level).length === 0) return level;
        }
      }
    }
  }

  throw new Error("Expected cells that can become a scattered dead zone.");
}

function levelWithTunnelDistrict(): Readonly<{ level: JigsawLevel; region: string }> {
  for (let sourceRow = 0; sourceRow < JIGSAW_STARTER_LEVEL.size; sourceRow += 1) {
    for (let sourceColumn = 0; sourceColumn < JIGSAW_STARTER_LEVEL.size; sourceColumn += 1) {
      const region = JIGSAW_STARTER_LEVEL.regions[sourceRow]![sourceColumn]!;

      for (let row = 0; row < JIGSAW_STARTER_LEVEL.size; row += 1) {
        for (let column = 0; column < JIGSAW_STARTER_LEVEL.size; column += 1) {
          if (
            JIGSAW_STARTER_LEVEL.regions[row]![column] === region
            || Math.abs(row - sourceRow) + Math.abs(column - sourceColumn) === 1
            || JIGSAW_STARTER_SOLUTION.some((placement) => placement.position.row === row && placement.position.column === column)
          ) {
            continue;
          }

          const regions = JIGSAW_STARTER_LEVEL.regions.map((regionRow) => [...regionRow]);
          regions[row]![column] = region;
          const level: JigsawLevel = { ...JIGSAW_STARTER_LEVEL, regions };

          if (validateLevel(level).length === 0 && regionComponents(level, region).length === 2 && isLevelComplete(level, JIGSAW_STARTER_SOLUTION)) {
            return { level, region };
          }
        }
      }
    }
  }

  throw new Error("Expected a cell that can form a valid tunnel district.");
}

function tunnelDistricts(level: JigsawLevel): string[] {
  return [...new Set(level.regions.flat())].filter((region) => level.regionDefinitions[region]?.type === "normal" && regionComponents(level, region).length === 2);
}

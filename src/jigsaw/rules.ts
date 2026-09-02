import { samePosition, type Position } from "./position.js";
import { RESOURCE_TYPES, SERVICE_RESOURCES, SERVICE_TYPES, type JigsawLevel, type ResourceType, type ServicePlacement, type ServiceQuota, type ServiceType } from "./types.js";

export type LevelIssue = "invalid-size" | "invalid-region-map" | "invalid-region-size" | "disconnected-region" | "invalid-region-requirements" | "invalid-active-services" | "invalid-quotas";

export type PlacementIssue = "out-of-bounds" | "occupied-cell" | "inventory-exhausted" | "row-conflict" | "column-conflict" | "region-conflict" | "generator-water-conflict" | "farm-dam-missing" | "factory-steel-demand-missing";
export type PlacementActivity = (placements: readonly ServicePlacement[], placement: ServicePlacement) => boolean;

export function validateLevel(level: JigsawLevel): LevelIssue[] {
  const issues: LevelIssue[] = [];

  if (level.size < 1) {
    issues.push("invalid-size");
  }

  const activeServices = new Set(level.activeServices);

  if (activeServices.size === 0 || activeServices.size !== level.activeServices.length || [...activeServices].some((service) => !SERVICE_TYPES.includes(service))) {
    issues.push("invalid-active-services");
  }

  if (
    SERVICE_TYPES.some((service) => !hasValidQuota(level.quotas[service], level.size))
    || SERVICE_TYPES.some((service) => activeServices.has(service) !== (level.quotas[service].total > 0))
  ) {
    issues.push("invalid-quotas");
  }

  if (level.regions.length !== level.size || level.regions.some((row) => row.length !== level.size)) {
    issues.push("invalid-region-map");
    return issues;
  }

  const regions = new Map<string, Position[]>();

  for (let row = 0; row < level.size; row += 1) {
    for (let column = 0; column < level.size; column += 1) {
      const region = level.regions[row]![column]!;
      const cells = regions.get(region) ?? [];
      cells.push({ row, column });
      regions.set(region, cells);
    }
  }

  if (regions.size !== level.size || [...regions.values()].some((cells) => cells.length !== level.size)) {
    issues.push("invalid-region-size");
  }

  if ([...regions.values()].some((cells) => !isConnected(cells))) {
    issues.push("disconnected-region");
  }

  const regionRequirements = level.regionRequirements;
  const regionNames = new Set(regions.keys());

  if (
    Object.keys(regionRequirements).length !== regionNames.size
    || [...regionNames].some((region) => !hasValidResourceRequirements(regionRequirements[region]))
    || Object.keys(regionRequirements).some((region) => !regionNames.has(region))
    || !resourceRequirementsMatchActiveServices(level)
    || totalResourceRequirement(level, "steel") !== level.quotas.factory.total
  ) {
    issues.push("invalid-region-requirements");
  }

  return issues;
}

export function validatePlacement(level: JigsawLevel, placements: readonly ServicePlacement[], candidate: ServicePlacement): PlacementIssue[] {
  const issues: PlacementIssue[] = [];

  if (!isInBounds(level, candidate.position)) {
    issues.push("out-of-bounds");
    return issues;
  }

  if (placements.some((placement) => samePosition(placement.position, candidate.position))) {
    issues.push("occupied-cell");
  }

  const quota = level.quotas[candidate.service];

  if (countService(placements, candidate.service) >= quota.total) {
    issues.push("inventory-exhausted");
  }

  if (countServiceInRow(placements, candidate.service, candidate.position.row) >= quota.maxPerRow) {
    issues.push("row-conflict");
  }

  if (countServiceInColumn(placements, candidate.service, candidate.position.column) >= quota.maxPerColumn) {
    issues.push("column-conflict");
  }

  if (countServiceInRegion(level, placements, candidate.service, regionAt(level, candidate.position)) >= quota.maxPerRegion) {
    issues.push("region-conflict");
  }

  if (
    (candidate.service === "generator" && placements.some((placement) => placement.service === "water" && areOrthogonallyAdjacent(placement.position, candidate.position))) ||
    (candidate.service === "water" && placements.some((placement) => placement.service === "generator" && areOrthogonallyAdjacent(placement.position, candidate.position)))
  ) {
    issues.push("generator-water-conflict");
  }

  if (candidate.service === "factory" && (level.regionRequirements[regionAt(level, candidate.position)]?.steel ?? 0) === 0) {
    issues.push("factory-steel-demand-missing");
  }

  return issues;
}

export function validatePlacements(level: JigsawLevel, placements: readonly ServicePlacement[]): PlacementIssue[] {
  return placements.flatMap((placement, index) => validatePlacement(level, placements.slice(0, index), placement));
}

export function legalPositions(level: JigsawLevel, placements: readonly ServicePlacement[], service: ServiceType): Position[] {
  const positions: Position[] = [];

  for (let row = 0; row < level.size; row += 1) {
    for (let column = 0; column < level.size; column += 1) {
      const candidate = { service, position: { row, column } };

      if (validatePlacement(level, placements, candidate).length === 0) {
        positions.push(candidate.position);
      }
    }
  }

  return positions;
}

export function isLevelComplete(level: JigsawLevel, placements: readonly ServicePlacement[]): boolean {
  return validateLevel(level).length === 0
    && validatePlacements(level, placements).length === 0
    && unsuppliedFarms(placements).length === 0
    && [...new Set(level.regions.flat())].every((region) => unmetResourcesForRegion(level, placements, region).length === 0)
    && level.activeServices.every((service) => countService(placements, service) === level.quotas[service].total);
}

export function unmetResourcesForRegion(level: JigsawLevel, placements: readonly ServicePlacement[], region: string, isActive: PlacementActivity = isPlacementActive): ResourceType[] {
  const requirements = level.regionRequirements[region] ?? {};
  const supplied = resourceSupplyForRegion(level, placements, region, isActive);
  const unmet: ResourceType[] = [];

  for (const resource of RESOURCE_TYPES) {
    const remaining = Math.max(0, (requirements[resource] ?? 0) - supplied[resource]);

    for (let count = 0; count < remaining; count += 1) {
      unmet.push(resource);
    }
  }

  return unmet;
}

export function resourceSupplyForRegion(level: JigsawLevel, placements: readonly ServicePlacement[], region: string, isActive: PlacementActivity = isPlacementActive): Readonly<Record<ResourceType, number>> {
  const supply: Record<ResourceType, number> = { food: 0, water: 0, power: 0, steel: 0 };

  for (const placement of placements) {
    if (regionAt(level, placement.position) === region) {
      if (isActive(placements, placement)) {
        supply[SERVICE_RESOURCES[placement.service]] += 1;
      }
    }
  }

  return supply;
}

export function isFarmSupplied(placements: readonly ServicePlacement[], farm: ServicePlacement): boolean {
  return supplyingDam(placements, farm) !== null;
}

export function unsuppliedFarms(placements: readonly ServicePlacement[]): ServicePlacement[] {
  return placements.filter((placement) => placement.service === "farm" && !isFarmSupplied(placements, placement));
}

export function isFactorySupplied(placements: readonly ServicePlacement[], factory: ServicePlacement): boolean {
  const suppliers = factorySuppliers(placements, factory);
  return suppliers.power !== null && suppliers.water !== null;
}

export function isPlacementActive(placements: readonly ServicePlacement[], placement: ServicePlacement): boolean {
  return (placement.service !== "farm" || isFarmSupplied(placements, placement))
    && (placement.service !== "factory" || isFactorySupplied(placements, placement));
}

export function inactiveFactories(placements: readonly ServicePlacement[]): ServicePlacement[] {
  return placements.filter((placement) => placement.service === "factory" && !isFactorySupplied(placements, placement));
}

export function supplyingDam(placements: readonly ServicePlacement[], farm: ServicePlacement): ServicePlacement | null {
  return farm.service === "farm"
    ? placements.find((placement) => placement.service === "water" && areOrthogonallyAdjacent(placement.position, farm.position)) ?? null
    : null;
}

export function factorySuppliers(placements: readonly ServicePlacement[], factory: ServicePlacement): Readonly<{ power: ServicePlacement | null; water: ServicePlacement | null }> {
  if (factory.service !== "factory") {
    return { power: null, water: null };
  }

  return {
    power: placements.find((placement) => placement.service === "generator" && areOrthogonallyAdjacent(placement.position, factory.position)) ?? null,
    water: placements.find((placement) => placement.service === "water" && areOrthogonallyAdjacent(placement.position, factory.position)) ?? null,
  };
}

export function regionAt(level: JigsawLevel, position: Position): string {
  return level.regions[position.row]![position.column]!;
}

function countService(placements: readonly ServicePlacement[], service: ServiceType): number {
  return placements.filter((placement) => placement.service === service).length;
}

function countServiceInRow(placements: readonly ServicePlacement[], service: ServiceType, row: number): number {
  return placements.filter((placement) => placement.service === service && placement.position.row === row).length;
}

function countServiceInColumn(placements: readonly ServicePlacement[], service: ServiceType, column: number): number {
  return placements.filter((placement) => placement.service === service && placement.position.column === column).length;
}

function countServiceInRegion(level: JigsawLevel, placements: readonly ServicePlacement[], service: ServiceType, region: string): number {
  return placements.filter((placement) => placement.service === service && regionAt(level, placement.position) === region).length;
}

function hasValidResourceRequirements(requirements: JigsawLevel["regionRequirements"][string] | undefined): boolean {
  return requirements !== undefined
    && Object.keys(requirements).length > 0
    && Object.entries(requirements).every(([resource, amount]) => RESOURCE_TYPES.includes(resource as ResourceType) && Number.isInteger(amount) && amount > 0);
}

function hasValidQuota(quota: ServiceQuota | undefined, size: number): quota is ServiceQuota {
  return quota !== undefined
    && Number.isInteger(quota.total)
    && Number.isInteger(quota.maxPerRow)
    && Number.isInteger(quota.maxPerColumn)
    && Number.isInteger(quota.maxPerRegion)
    && quota.total >= 0
    && quota.total <= size * size
    && quota.maxPerRow >= 0
    && quota.maxPerColumn >= 0
    && quota.maxPerRegion >= 0;
}

function resourceRequirementsMatchActiveServices(level: JigsawLevel): boolean {
  const activeResources = new Set(level.activeServices.map((service) => SERVICE_RESOURCES[service]));

  return Object.values(level.regionRequirements).every((requirements) => Object.keys(requirements).every((resource) => activeResources.has(resource as ResourceType)));
}

function totalResourceRequirement(level: JigsawLevel, resource: ResourceType): number {
  return Object.values(level.regionRequirements).reduce((total, requirements) => total + (requirements[resource] ?? 0), 0);
}

function isConnected(cells: readonly Position[]): boolean {
  if (cells.length === 0) {
    return false;
  }

  const cellKeys = new Set(cells.map(positionKey));
  const visited = new Set<string>();
  const queue = [cells[0]!];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = positionKey(current);

    if (visited.has(currentKey)) {
      continue;
    }

    visited.add(currentKey);

    for (const neighbour of [
      { row: current.row - 1, column: current.column },
      { row: current.row + 1, column: current.column },
      { row: current.row, column: current.column - 1 },
      { row: current.row, column: current.column + 1 },
    ]) {
      if (cellKeys.has(positionKey(neighbour)) && !visited.has(positionKey(neighbour))) {
        queue.push(neighbour);
      }
    }
  }

  return visited.size === cells.length;
}

function positionKey(position: Position): string {
  return `${position.row}:${position.column}`;
}

function isInBounds(level: JigsawLevel, position: Position): boolean {
  return position.row >= 0 && position.row < level.size && position.column >= 0 && position.column < level.size;
}

function areOrthogonallyAdjacent(left: Position, right: Position): boolean {
  return Math.abs(left.row - right.row) + Math.abs(left.column - right.column) === 1;
}

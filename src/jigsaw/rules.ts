import { samePosition, type Position } from "./position.js";
import { RESOURCE_TYPES, SERVICE_RESOURCES, SERVICE_TYPES, type JigsawLevel, type Landmark, type RegionDefinition, type RegionResourceRequirements, type ResourceType, type ServicePlacement, type ServiceQuota, type ServiceType } from "./types.js";

export type LevelIssue = "invalid-size" | "invalid-region-map" | "invalid-normal-region-count" | "disconnected-region" | "invalid-tunnel-components" | "invalid-region-definitions" | "invalid-active-services" | "invalid-quotas" | "invalid-sanctuary-count" | "invalid-landmarks";
export type PlacementIssue = "out-of-bounds" | "dead-region" | "landmark-cell" | "occupied-cell" | "inventory-exhausted" | "row-conflict" | "column-conflict" | "region-conflict" | "generator-water-conflict" | "factory-steel-demand-missing";
export type PlacementActivity = (placements: readonly ServicePlacement[], placement: ServicePlacement) => boolean;

export interface InteractionEdge {
  readonly first: Position;
  readonly second: Position;
  readonly kind: "physical" | "portal";
  readonly firstDirection: Direction;
  readonly secondDirection: Direction;
}

export type Direction = "up" | "down" | "left" | "right";

export interface IdentitySource {
  readonly service: ServiceType;
  readonly position: Position;
  readonly source: "shape" | "echo";
}

export interface PlacementEvaluation {
  readonly active: ReadonlySet<string>;
  readonly amplified: ReadonlySet<string>;
  readonly catalysts: ReadonlySet<string>;
  readonly identities: ReadonlyMap<string, readonly IdentitySource[]>;
  readonly edges: readonly InteractionEdge[];
}

export function validateLevel(level: JigsawLevel): LevelIssue[] {
  const issues: LevelIssue[] = [];
  if (level.size < 1 || !Number.isInteger(level.size)) issues.push("invalid-size");
  const activeServices = new Set(level.activeServices);
  if (activeServices.size === 0 || activeServices.size !== level.activeServices.length || [...activeServices].some((service) => !SERVICE_TYPES.includes(service))) issues.push("invalid-active-services");
  if (SERVICE_TYPES.some((service) => !hasValidQuota(level.quotas[service], level.size)) || SERVICE_TYPES.some((service) => activeServices.has(service) !== (level.quotas[service].total > 0))) issues.push("invalid-quotas");
  if (level.regions.length !== level.size || level.regions.some((row) => row.length !== level.size)) {
    issues.push("invalid-region-map");
    return issues;
  }

  const regions = new Map<string, Position[]>();
  forEachCell(level, (position) => {
    const region = regionAt(level, position);
    const cells = regions.get(region) ?? [];
    cells.push(position);
    regions.set(region, cells);
  });
  const regionNames = new Set(regions.keys());
  const normalRegions = [...regionNames].filter((region) => level.regionDefinitions[region]?.type === "normal");
  if ([...regions].some(([region, cells]) => level.regionDefinitions[region]?.type !== "normal" && !isConnected(cells))) issues.push("disconnected-region");
  if ([...regions].some(([region, cells]) => level.regionDefinitions[region]?.type === "normal" && connectedComponents(cells).length > 2)) issues.push("invalid-tunnel-components");
  if (Object.keys(level.regionDefinitions).length !== regionNames.size || [...regionNames].some((region) => !hasValidRegionDefinition(level.regionDefinitions[region])) || Object.keys(level.regionDefinitions).some((region) => !regionNames.has(region)) || !resourceRequirementsMatchActiveServices(level) || totalResourceRequirement(level, "steel") !== level.quotas.factory.total) issues.push("invalid-region-definitions");
  if (normalRegions.length !== level.size) issues.push("invalid-normal-region-count");
  if (normalRegions.filter((region) => level.regionDefinitions[region]?.type === "normal" && level.regionDefinitions[region].sanctuary).length > 1) issues.push("invalid-sanctuary-count");
  if (!hasValidLandmarks(level)) issues.push("invalid-landmarks");
  return issues;
}

export function validatePlacement(level: JigsawLevel, placements: readonly ServicePlacement[], candidate: ServicePlacement): PlacementIssue[] {
  const issues: PlacementIssue[] = [];
  if (!isInBounds(level, candidate.position)) return ["out-of-bounds"];
  if (regionDefinitionAt(level, candidate.position).type === "dead") issues.push("dead-region");
  if (landmarkAt(level, candidate.position)) issues.push("landmark-cell");
  if (placements.some((placement) => samePosition(placement.position, candidate.position))) issues.push("occupied-cell");
  const quota = level.quotas[candidate.service];
  if (countService(placements, candidate.service) >= quota.total) issues.push("inventory-exhausted");
  if (countServiceInRow(placements, candidate.service, candidate.position.row) >= quota.maxPerRow) issues.push("row-conflict");
  if (countServiceInColumn(placements, candidate.service, candidate.position.column) >= quota.maxPerColumn) issues.push("column-conflict");
  if (countServiceInRegion(level, placements, candidate.service, regionAt(level, candidate.position)) >= quota.maxPerRegion) issues.push("region-conflict");
  if (candidate.service === "factory" && (requirementsForRegion(level, regionAt(level, candidate.position)).steel ?? 0) === 0) issues.push("factory-steel-demand-missing");

  // Echo identities participate in exclusion, so assess the complete prospective board.
  if (issues.length === 0 && (candidate.service === "generator" || candidate.service === "water") && hasCircleDiamondConflict(level, [...placements, candidate])) issues.push("generator-water-conflict");
  return issues;
}

export function validatePlacements(level: JigsawLevel, placements: readonly ServicePlacement[]): PlacementIssue[] {
  return placements.flatMap((placement, index) => validatePlacement(level, placements.slice(0, index), placement));
}

export function legalPositions(level: JigsawLevel, placements: readonly ServicePlacement[], service: ServiceType): Position[] {
  const positions: Position[] = [];
  forEachCell(level, (position) => {
    if (validatePlacement(level, placements, { service, position }).length === 0) positions.push(position);
  });
  return positions;
}

export function legalServicesAt(level: JigsawLevel, placements: readonly ServicePlacement[], position: Position): ServiceType[] {
  return SERVICE_TYPES.filter((service) => level.activeServices.includes(service) && validatePlacement(level, placements, { service, position }).length === 0);
}

export function isLevelComplete(level: JigsawLevel, placements: readonly ServicePlacement[]): boolean {
  const evaluation = evaluatePlacements(level, placements);
  return validateLevel(level).length === 0
    && validatePlacements(level, placements).length === 0
    && placements.every((placement) => evaluation.active.has(placementKey(placement)))
    && [...new Set(level.regions.flat())].filter((region) => level.regionDefinitions[region]?.type === "normal").every((region) => unmetResourcesForRegion(level, placements, region).length === 0)
    && level.activeServices.every((service) => countService(placements, service) === level.quotas[service].total);
}

export function unmetResourcesForRegion(level: JigsawLevel, placements: readonly ServicePlacement[], region: string, isActive?: PlacementActivity): ResourceType[] {
  const requirements = requirementsForRegion(level, region);
  const supplied = resourceSupplyForRegion(level, placements, region, isActive);
  const unmet: ResourceType[] = [];
  for (const resource of RESOURCE_TYPES) {
    for (let count = Math.max(0, (requirements[resource] ?? 0) - (supplied[resource] ?? 0)); count > 0; count -= 1) unmet.push(resource);
  }
  return unmet;
}

export function resourceSupplyForRegion(level: JigsawLevel, placements: readonly ServicePlacement[], region: string, isActive?: PlacementActivity): Readonly<Record<ResourceType, number>> {
  const supply = { food: 0, water: 0, power: 0, steel: 0 } as Record<ResourceType, number>;
  if (level.activeServices.includes("twin")) supply.bond = 0;
  const evaluation = isActive ? null : evaluatePlacements(level, placements);
  for (const placement of placements) {
    if (regionAt(level, placement.position) !== region || !(isActive ? isActive(placements, placement) : evaluation!.active.has(placementKey(placement)))) continue;
    supply[SERVICE_RESOURCES[placement.service]] += evaluation?.amplified.has(placementKey(placement)) ? 2 : 1;
  }
  return supply;
}

export function evaluatePlacements(level: JigsawLevel, placements: readonly ServicePlacement[]): PlacementEvaluation {
  const edges = interactionEdges(level);
  const identities = identitiesByPosition(level, placements);
  const active = new Set<string>();
  for (const placement of placements) {
    if (normallyActive(placement, edges, identities)) active.add(placementKey(placement));
  }
  const catalysts = new Set(placements.filter((placement) => relationshipDependent(placement.service) && physicallyAdjacentToLandmark(level, placement.position, "catalyst")).map(placementKey));
  for (const key of catalysts) active.add(key);
  const amplified = new Set(placements.filter((placement) => active.has(placementKey(placement)) && physicallyAdjacentToLandmark(level, placement.position, "amplifier")).map(placementKey));
  return { active, amplified, catalysts, identities, edges };
}

export function identitiesAt(level: JigsawLevel, placements: readonly ServicePlacement[], position: Position): readonly IdentitySource[] {
  return identitiesByPosition(level, placements).get(positionKey(position)) ?? [];
}

export function interactionEdges(level: JigsawLevel): readonly InteractionEdge[] {
  const edges: InteractionEdge[] = [];
  forEachCell(level, (first) => {
    for (const [second, firstDirection] of [[{ row: first.row + 1, column: first.column }, "down"], [{ row: first.row, column: first.column + 1 }, "right"]] as const) {
      if (isInBounds(level, second)) edges.push({ first, second, kind: "physical", firstDirection, secondDirection: opposite(firstDirection) });
    }
  });
  for (const pair of portalPairs(level).values()) {
    if (pair.length !== 2) continue;
    const [first, second] = pair;
    if (!first || !second || !hasValidPortalEndpoint(level, first) || !hasValidPortalEndpoint(level, second)) continue;
    edges.push({ first: first.mouth, second: second.mouth, kind: "portal", firstDirection: directionFrom(first.position, first.mouth), secondDirection: directionFrom(second.position, second.mouth) });
  }
  return edges;
}

export function isFarmSupplied(placements: readonly ServicePlacement[], farm: ServicePlacement): boolean;
export function isFarmSupplied(level: JigsawLevel, placements: readonly ServicePlacement[], farm: ServicePlacement): boolean;
export function isFarmSupplied(levelOrPlacements: JigsawLevel | readonly ServicePlacement[], placementsOrFarm: readonly ServicePlacement[] | ServicePlacement, maybeFarm?: ServicePlacement): boolean {
  const [level, placements, farm] = levelOrPlacements instanceof Array ? [undefined, levelOrPlacements, placementsOrFarm as ServicePlacement] : [levelOrPlacements, placementsOrFarm as readonly ServicePlacement[], maybeFarm!];
  return farm.service === "farm" && hasAdjacentIdentity(level, placements, farm.position, "water");
}

export function unsuppliedFarms(placements: readonly ServicePlacement[]): ServicePlacement[];
export function unsuppliedFarms(level: JigsawLevel, placements: readonly ServicePlacement[]): ServicePlacement[];
export function unsuppliedFarms(levelOrPlacements: JigsawLevel | readonly ServicePlacement[], maybePlacements?: readonly ServicePlacement[]): ServicePlacement[] {
  const [level, placements] = levelOrPlacements instanceof Array ? [undefined, levelOrPlacements] : [levelOrPlacements, maybePlacements!];
  return placements.filter((placement) => placement.service === "farm" && !isFarmSupplied(level as JigsawLevel, placements, placement));
}

export function isFactorySupplied(placements: readonly ServicePlacement[], factory: ServicePlacement): boolean;
export function isFactorySupplied(level: JigsawLevel, placements: readonly ServicePlacement[], factory: ServicePlacement): boolean;
export function isFactorySupplied(levelOrPlacements: JigsawLevel | readonly ServicePlacement[], placementsOrFactory: readonly ServicePlacement[] | ServicePlacement, maybeFactory?: ServicePlacement): boolean {
  const [level, placements, factory] = levelOrPlacements instanceof Array ? [undefined, levelOrPlacements, placementsOrFactory as ServicePlacement] : [levelOrPlacements, placementsOrFactory as readonly ServicePlacement[], maybeFactory!];
  return factory.service === "factory" && hasAdjacentIdentity(level, placements, factory.position, "generator") && hasAdjacentIdentity(level, placements, factory.position, "water");
}

export function isPlacementActive(placements: readonly ServicePlacement[], placement: ServicePlacement): boolean;
export function isPlacementActive(level: JigsawLevel, placements: readonly ServicePlacement[], placement: ServicePlacement): boolean;
export function isPlacementActive(levelOrPlacements: JigsawLevel | readonly ServicePlacement[], placementsOrPlacement: readonly ServicePlacement[] | ServicePlacement, maybePlacement?: ServicePlacement): boolean {
  const [level, placements, placement] = levelOrPlacements instanceof Array ? [undefined, levelOrPlacements, placementsOrPlacement as ServicePlacement] : [levelOrPlacements, placementsOrPlacement as readonly ServicePlacement[], maybePlacement!];
  return level ? evaluatePlacements(level, placements).active.has(placementKey(placement)) : normallyActive(placement, physicalEdgesFor(placements), actualIdentities(placements));
}

export function inactiveFactories(placements: readonly ServicePlacement[]): ServicePlacement[];
export function inactiveFactories(level: JigsawLevel, placements: readonly ServicePlacement[]): ServicePlacement[];
export function inactiveFactories(levelOrPlacements: JigsawLevel | readonly ServicePlacement[], maybePlacements?: readonly ServicePlacement[]): ServicePlacement[] {
  const [level, placements] = levelOrPlacements instanceof Array ? [undefined, levelOrPlacements] : [levelOrPlacements, maybePlacements!];
  return placements.filter((placement) => placement.service === "factory" && !isFactorySupplied(level as JigsawLevel, placements, placement));
}

export function supplyingDam(placements: readonly ServicePlacement[], farm: ServicePlacement): ServicePlacement | null;
export function supplyingDam(level: JigsawLevel, placements: readonly ServicePlacement[], farm: ServicePlacement): ServicePlacement | null;
export function supplyingDam(levelOrPlacements: JigsawLevel | readonly ServicePlacement[], placementsOrFarm: readonly ServicePlacement[] | ServicePlacement, maybeFarm?: ServicePlacement): ServicePlacement | null {
  const [level, placements, farm] = levelOrPlacements instanceof Array ? [undefined, levelOrPlacements, placementsOrFarm as ServicePlacement] : [levelOrPlacements, placementsOrFarm as readonly ServicePlacement[], maybeFarm!];
  return farm.service === "farm" ? placements.find((placement) => placement.service === "water" && areInteractionNeighbours(level, placement.position, farm.position)) ?? null : null;
}

export function factorySuppliers(placements: readonly ServicePlacement[], factory: ServicePlacement): Readonly<{ power: ServicePlacement | null; water: ServicePlacement | null }>;
export function factorySuppliers(level: JigsawLevel, placements: readonly ServicePlacement[], factory: ServicePlacement): Readonly<{ power: ServicePlacement | null; water: ServicePlacement | null }>;
export function factorySuppliers(levelOrPlacements: JigsawLevel | readonly ServicePlacement[], placementsOrFactory: readonly ServicePlacement[] | ServicePlacement, maybeFactory?: ServicePlacement): Readonly<{ power: ServicePlacement | null; water: ServicePlacement | null }> {
  const [level, placements, factory] = levelOrPlacements instanceof Array ? [undefined, levelOrPlacements, placementsOrFactory as ServicePlacement] : [levelOrPlacements, placementsOrFactory as readonly ServicePlacement[], maybeFactory!];
  return factory.service !== "factory" ? { power: null, water: null } : {
    power: placements.find((placement) => placement.service === "generator" && areInteractionNeighbours(level, placement.position, factory.position)) ?? null,
    water: placements.find((placement) => placement.service === "water" && areInteractionNeighbours(level, placement.position, factory.position)) ?? null,
  };
}

export function landmarkAt(level: JigsawLevel, position: Position): Landmark | undefined {
  return level.landmarks?.find((landmark) => samePosition(landmark.position, position));
}

export function regionAt(level: JigsawLevel, position: Position): string { return level.regions[position.row]![position.column]!; }
export function regionComponents(level: JigsawLevel, region: string): readonly (readonly Position[])[] {
  const cells: Position[] = [];
  forEachCell(level, (position) => { if (regionAt(level, position) === region) cells.push(position); });
  return connectedComponents(cells);
}
export function regionDefinitionAt(level: JigsawLevel, position: Position): RegionDefinition { return level.regionDefinitions[regionAt(level, position)]!; }
export function requirementsForRegion(level: JigsawLevel, region: string): RegionResourceRequirements { return level.regionDefinitions[region]?.type === "normal" ? level.regionDefinitions[region].requirements : {}; }

function normallyActive(placement: ServicePlacement, edges: readonly InteractionEdge[], identities: ReadonlyMap<string, readonly IdentitySource[]>): boolean {
  if (placement.service === "farm") return hasAdjacentIdentityIn(edges, identities, placement.position, "water");
  if (placement.service === "factory") return hasAdjacentIdentityIn(edges, identities, placement.position, "generator") && hasAdjacentIdentityIn(edges, identities, placement.position, "water");
  if (placement.service === "twin") return adjacentIdentityPositions(edges, identities, placement.position, "twin").size === 1;
  return true;
}

function identitiesByPosition(level: JigsawLevel, placements: readonly ServicePlacement[]): ReadonlyMap<string, readonly IdentitySource[]> {
  const actual = actualIdentities(placements);
  const identities = new Map(actual);
  for (const landmark of level.landmarks ?? []) {
    if (landmark.type !== "echo") continue;
    const copied = physicalNeighbours(level, landmark.position).flatMap((position) => actual.get(positionKey(position)) ?? []).map((identity) => ({ ...identity, position: landmark.position, source: "echo" as const }));
    if (copied.length > 0) identities.set(positionKey(landmark.position), copied);
  }
  return identities;
}

function actualIdentities(placements: readonly ServicePlacement[]): Map<string, readonly IdentitySource[]> {
  return new Map(placements.map((placement) => [positionKey(placement.position), [{ service: placement.service, position: placement.position, source: "shape" as const }]]));
}

function hasCircleDiamondConflict(level: JigsawLevel, placements: readonly ServicePlacement[]): boolean {
  const identities = identitiesByPosition(level, placements);
  return interactionEdges(level).some((edge) => !sanctuaryProtects(level, edge) && hasIdentity(identities, edge.first, "generator") && hasIdentity(identities, edge.second, "water") || !sanctuaryProtects(level, edge) && hasIdentity(identities, edge.first, "water") && hasIdentity(identities, edge.second, "generator"));
}

function sanctuaryProtects(level: JigsawLevel, edge: InteractionEdge): boolean {
  const definition = regionDefinitionAt(level, edge.first);
  return regionAt(level, edge.first) === regionAt(level, edge.second) && definition.type === "normal" && definition.sanctuary === true;
}

function hasAdjacentIdentity(level: JigsawLevel | undefined, placements: readonly ServicePlacement[], position: Position, service: ServiceType): boolean {
  return hasAdjacentIdentityIn(level ? interactionEdges(level) : physicalEdgesFor(placements), level ? identitiesByPosition(level, placements) : actualIdentities(placements), position, service);
}
function hasAdjacentIdentityIn(edges: readonly InteractionEdge[], identities: ReadonlyMap<string, readonly IdentitySource[]>, position: Position, service: ServiceType): boolean { return adjacentIdentityPositions(edges, identities, position, service).size > 0; }
function adjacentIdentityPositions(edges: readonly InteractionEdge[], identities: ReadonlyMap<string, readonly IdentitySource[]>, position: Position, service: ServiceType): ReadonlySet<string> {
  const neighbours = new Set<string>();
  for (const edge of edges) {
    const other = samePosition(edge.first, position) ? edge.second : samePosition(edge.second, position) ? edge.first : null;
    if (other && hasIdentity(identities, other, service)) neighbours.add(positionKey(other));
  }
  return neighbours;
}
function hasIdentity(identities: ReadonlyMap<string, readonly IdentitySource[]>, position: Position, service: ServiceType): boolean { return (identities.get(positionKey(position)) ?? []).some((identity) => identity.service === service); }

function hasValidLandmarks(level: JigsawLevel): boolean {
  const landmarks = level.landmarks ?? [];
  const positions = new Set<string>();
  const mouths = new Set<string>();
  for (const landmark of landmarks) {
    if (!isInBounds(level, landmark.position) || level.regionDefinitions[regionAt(level, landmark.position)]?.type === "dead" || positions.has(positionKey(landmark.position))) return false;
    positions.add(positionKey(landmark.position));
    if (landmark.type === "portal") {
      if (!hasValidPortalEndpoint(level, landmark) || mouths.has(positionKey(landmark.mouth))) return false;
      mouths.add(positionKey(landmark.mouth));
    }
  }
  return [...portalPairs(level).values()].every((pair) => pair.length === 2 && pair[0]!.pair.trim().length > 0 && !samePosition(pair[0]!.mouth, pair[1]!.mouth) && !pair.some((portal) => positions.has(positionKey(portal.mouth))));
}
function hasValidPortalEndpoint(level: JigsawLevel, portal: Extract<Landmark, { type: "portal" }>): boolean {
  return isInBounds(level, portal.mouth) && level.regionDefinitions[regionAt(level, portal.mouth)]?.type === "normal" && arePhysicallyAdjacent(portal.position, portal.mouth);
}
function portalPairs(level: JigsawLevel): ReadonlyMap<string, readonly Extract<Landmark, { type: "portal" }>[]> {
  const pairs = new Map<string, Extract<Landmark, { type: "portal" }>[]>();
  for (const landmark of level.landmarks ?? []) if (landmark.type === "portal") pairs.set(landmark.pair, [...(pairs.get(landmark.pair) ?? []), landmark]);
  return pairs;
}
function physicallyAdjacentToLandmark(level: JigsawLevel, position: Position, type: "catalyst" | "amplifier"): boolean { return (level.landmarks ?? []).some((landmark) => landmark.type === type && arePhysicallyAdjacent(position, landmark.position)); }
function relationshipDependent(service: ServiceType): boolean { return service === "farm" || service === "factory" || service === "twin"; }
function physicalNeighbours(level: JigsawLevel, position: Position): Position[] { return [{ row: position.row - 1, column: position.column }, { row: position.row + 1, column: position.column }, { row: position.row, column: position.column - 1 }, { row: position.row, column: position.column + 1 }].filter((neighbour) => isInBounds(level, neighbour)); }
function physicalEdgesFor(placements: readonly ServicePlacement[]): readonly InteractionEdge[] { return placements.flatMap((first, index) => placements.slice(index + 1).filter((second) => arePhysicallyAdjacent(first.position, second.position)).map((second): InteractionEdge => ({ first: first.position, second: second.position, kind: "physical", firstDirection: directionFrom(first.position, second.position), secondDirection: directionFrom(second.position, first.position) }))); }
function areInteractionNeighbours(level: JigsawLevel | undefined, first: Position, second: Position): boolean { return level ? interactionEdges(level).some((edge) => samePosition(edge.first, first) && samePosition(edge.second, second) || samePosition(edge.first, second) && samePosition(edge.second, first)) : arePhysicallyAdjacent(first, second); }
function directionFrom(first: Position, second: Position): Direction { return second.row < first.row ? "up" : second.row > first.row ? "down" : second.column < first.column ? "left" : "right"; }
function opposite(direction: Direction): Direction { return ({ up: "down", down: "up", left: "right", right: "left" } satisfies Record<Direction, Direction>)[direction]; }

function countService(placements: readonly ServicePlacement[], service: ServiceType): number { return placements.filter((placement) => placement.service === service).length; }
function countServiceInRow(placements: readonly ServicePlacement[], service: ServiceType, row: number): number { return placements.filter((placement) => placement.service === service && placement.position.row === row).length; }
function countServiceInColumn(placements: readonly ServicePlacement[], service: ServiceType, column: number): number { return placements.filter((placement) => placement.service === service && placement.position.column === column).length; }
function countServiceInRegion(level: JigsawLevel, placements: readonly ServicePlacement[], service: ServiceType, region: string): number { return placements.filter((placement) => placement.service === service && regionAt(level, placement.position) === region).length; }
function hasValidRegionDefinition(definition: RegionDefinition | undefined): boolean { return definition !== undefined && (definition.type === "dead" || (definition.type === "normal" && hasValidResourceRequirements(definition.requirements))); }
function hasValidResourceRequirements(requirements: RegionResourceRequirements): boolean { return Object.keys(requirements).length > 0 && Object.entries(requirements).every(([resource, amount]) => RESOURCE_TYPES.includes(resource as ResourceType) && typeof amount === "number" && Number.isInteger(amount) && amount > 0); }
function hasValidQuota(quota: ServiceQuota | undefined, size: number): quota is ServiceQuota { return quota !== undefined && [quota.total, quota.maxPerRow, quota.maxPerColumn, quota.maxPerRegion].every(Number.isInteger) && quota.total >= 0 && quota.total <= size * size && quota.maxPerRow >= 0 && quota.maxPerColumn >= 0 && quota.maxPerRegion >= 0; }
function resourceRequirementsMatchActiveServices(level: JigsawLevel): boolean { const resources = new Set(level.activeServices.map((service) => SERVICE_RESOURCES[service])); return Object.values(level.regionDefinitions).every((definition) => definition.type === "dead" || Object.keys(definition.requirements).every((resource) => resources.has(resource as ResourceType))); }
function totalResourceRequirement(level: JigsawLevel, resource: ResourceType): number { return Object.values(level.regionDefinitions).reduce((total, definition) => total + (definition.type === "normal" ? definition.requirements[resource] ?? 0 : 0), 0); }
function isConnected(cells: readonly Position[]): boolean { return connectedComponents(cells).length === 1; }
function connectedComponents(cells: readonly Position[]): readonly (readonly Position[])[] {
  const cellKeys = new Set(cells.map(positionKey)); const unvisited = new Map(cells.map((cell) => [positionKey(cell), cell])); const components: Position[][] = [];
  while (unvisited.size > 0) { const first = unvisited.values().next().value as Position; const component: Position[] = []; const queue = [first]; unvisited.delete(positionKey(first)); while (queue.length > 0) { const current = queue.shift()!; component.push(current); for (const neighbour of [{ row: current.row - 1, column: current.column }, { row: current.row + 1, column: current.column }, { row: current.row, column: current.column - 1 }, { row: current.row, column: current.column + 1 }]) if (cellKeys.has(positionKey(neighbour)) && unvisited.has(positionKey(neighbour))) { unvisited.delete(positionKey(neighbour)); queue.push(neighbour); } } components.push(component); }
  return components;
}
function forEachCell(level: JigsawLevel, callback: (position: Position) => void): void { for (let row = 0; row < level.size; row += 1) for (let column = 0; column < level.size; column += 1) callback({ row, column }); }
function positionKey(position: Position): string { return `${position.row}:${position.column}`; }
function placementKey(placement: ServicePlacement): string { return `${placement.service}:${positionKey(placement.position)}`; }
function isInBounds(level: JigsawLevel, position: Position): boolean { return position.row >= 0 && position.row < level.size && position.column >= 0 && position.column < level.size; }
function arePhysicallyAdjacent(left: Position, right: Position): boolean { return Math.abs(left.row - right.row) + Math.abs(left.column - right.column) === 1; }

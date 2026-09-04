import { analyzeJigsawComplexity, type JigsawAnalysis } from "./analysis.js";
import type { ChordBaseBoard } from "./generator.js";
import { isLevelComplete, validateLevel } from "./rules.js";
import { RESOURCE_TYPES, SERVICE_TYPES, type JigsawLevel, type JigsawPuzzle, type Landmark, type ServicePlacement } from "./types.js";

export const PUZZLE_CATALOG_VERSION = 3;
export interface PuzzleCatalogConfig { readonly seedStart: number; readonly candidateCount: number; readonly analysisNodeLimit: number; }
export type ComplexityBucket = "search-ranked" | "logic-only" | "unranked";
export interface ComplexityRanking { readonly bucket: ComplexityBucket; readonly sortKey: readonly number[]; }
export interface PuzzleCatalogEntry {
  readonly id: string;
  readonly candidateId: string;
  readonly seed: number;
  readonly boardSignature: string;
  readonly boardHash: string;
  readonly base: ChordBaseBoard;
  readonly analysis: JigsawAnalysis;
  readonly ranking: ComplexityRanking;
}
export interface PuzzleCatalogFailure { readonly candidateId: string; readonly seed: number; readonly reason: string; }
export interface PuzzleCatalog { readonly version: typeof PUZZLE_CATALOG_VERSION; readonly config: PuzzleCatalogConfig; readonly processedCandidates: readonly string[]; readonly puzzles: readonly PuzzleCatalogEntry[]; readonly failures: readonly PuzzleCatalogFailure[]; }
export type CatalogEvaluation = Readonly<{ status: "accepted"; entry: PuzzleCatalogEntry }> | Readonly<{ status: "rejected"; failure: PuzzleCatalogFailure }>;

export function createPuzzleCatalog(config: PuzzleCatalogConfig): PuzzleCatalog { return { version: PUZZLE_CATALOG_VERSION, config: normalizeConfig(config), processedCandidates: [], puzzles: [], failures: [] }; }
export function catalogCandidateId(seed: number): string { return `base:${seed >>> 0}`; }

/** Base boards need a valid completed witness; variants later certify uniqueness. */
export function evaluateCatalogBase(seed: number, base: ChordBaseBoard, analysisNodeLimit: number): CatalogEvaluation {
  const candidateId = catalogCandidateId(seed);
  const issues = validateLevel(base.level);
  if (issues.length > 0) return rejected(candidateId, seed, `invalid-level:${issues.join(",")}`);
  if (!isLevelComplete(base.level, base.solution)) return rejected(candidateId, seed, "invalid-witness");
  const analysis = analyzeJigsawComplexity(base.level, [], { nodeLimit: analysisNodeLimit });
  const boardSignature = canonicalBoardSignature({ level: base.level, solution: base.solution });
  const boardHash = canonicalBoardHash(boardSignature);
  return { status: "accepted", entry: { id: `${candidateId}:${boardHash}`, candidateId, seed: seed >>> 0, boardSignature, boardHash, base, analysis, ranking: rankComplexity(analysis) } };
}

export function recordCatalogEvaluation(catalog: PuzzleCatalog, evaluation: CatalogEvaluation): PuzzleCatalog {
  const candidateId = evaluation.status === "accepted" ? evaluation.entry.candidateId : evaluation.failure.candidateId;
  if (catalog.processedCandidates.includes(candidateId)) return catalog;
  if (evaluation.status === "rejected") return withFailure(catalog, evaluation.failure);
  const duplicate = catalog.puzzles.some((entry) => entry.boardHash === evaluation.entry.boardHash && entry.boardSignature === evaluation.entry.boardSignature);
  return duplicate ? withFailure(catalog, { candidateId, seed: evaluation.entry.seed, reason: "duplicate-rotation" }) : { ...catalog, processedCandidates: addProcessed(catalog, candidateId), puzzles: [...catalog.puzzles, evaluation.entry].sort(compareEntries) };
}

/** Accepts v1/v2 playable catalogs for browsing and backfills v3 base identities. */
export function migratePuzzleCatalog(value: unknown): PuzzleCatalog {
  if (!isRecord(value) || !isRecord(value.config) || !Array.isArray(value.puzzles)) throw new Error("Invalid puzzle catalog.");
  if (value.version === PUZZLE_CATALOG_VERSION) return value as unknown as PuzzleCatalog;
  const config = normalizeConfig({ seedStart: numberAt(value.config, "seedStart", 1), candidateCount: numberAt(value.config, "candidateCount", value.puzzles.length || 1), analysisNodeLimit: numberAt(value.config, "analysisNodeLimit", 25_000) });
  let catalog = createPuzzleCatalog(config);
  const legacyEntries = value.puzzles.filter(isRecord).map((entry) => entry as Record<string, unknown>).sort((left, right) => numberAt(left, "seed", 0) - numberAt(right, "seed", 0));
  for (const legacy of legacyEntries) {
    const puzzle = legacy.puzzle as JigsawPuzzle | undefined;
    if (!puzzle || !isRecord(puzzle) || !isRecord(puzzle.level) || !Array.isArray(puzzle.solution)) continue;
    const seed = numberAt(legacy, "seed", 0);
    const base: ChordBaseBoard = { seed, level: puzzle.level, solution: puzzle.solution };
    catalog = recordCatalogEvaluation(catalog, evaluateCatalogBase(seed, base, config.analysisNodeLimit));
  }
  return catalog;
}

export function rankComplexity(analysis: JigsawAnalysis): ComplexityRanking {
  if (analysis.search.truncated || analysis.solutionCount === "unknown") return { bucket: "unranked", sortKey: [] };
  return !analysis.search.required ? { bucket: "logic-only", sortKey: [analysis.logic.steps.length, analysis.candidateProfile.initialCandidates] } : { bucket: "search-ranked", sortKey: [analysis.search.decisions, analysis.search.maxDepth, analysis.search.nodes, analysis.search.contradictions, analysis.candidateProfile.initialCandidates] };
}

export function canonicalBoardSignature(puzzle: Pick<JigsawPuzzle, "level" | "solution">): string { return [0, 1, 2, 3].map((rotation) => serializeRotation(puzzle.level, puzzle.solution, rotation)).sort()[0]!; }
export function canonicalBoardHash(signature: string): string { let hash = 0x811c9dc5; for (let index = 0; index < signature.length; index += 1) { hash ^= signature.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return (hash >>> 0).toString(16).padStart(8, "0"); }

function serializeRotation(level: JigsawLevel, solution: readonly ServicePlacement[], rotation: number): string {
  const grid = Array.from({ length: level.size }, () => Array.from({ length: level.size }, () => ""));
  for (let row = 0; row < level.size; row += 1) for (let column = 0; column < level.size; column += 1) { const position = rotatePosition({ row, column }, level.size, rotation); grid[position.row]![position.column] = level.regions[row]![column]!; }
  const names = new Map<string, string>(); let index = 0;
  const regions = grid.map((row) => row.map((name) => { const canonical = names.get(name) ?? `R${index++}`; names.set(name, canonical); return canonical; }));
  const definitions = [...names.entries()].map(([original, canonical]) => [canonical, serializeDefinition(level.regionDefinitions[original]!)]).sort(compareTuple);
  const portals = canonicalPortalPairs(level.landmarks ?? [], level.size, rotation);
  const landmarks = (level.landmarks ?? []).map((landmark) => serializeLandmark(landmark, level.size, rotation, portals)).sort(compareTuple);
  const placements = solution.map((placement) => [placement.service, positionArray(rotatePosition(placement.position, level.size, rotation))]).sort(compareTuple);
  const quotas = SERVICE_TYPES.map((service) => [service, level.quotas[service].total, level.quotas[service].maxPerRow, level.quotas[service].maxPerColumn, level.quotas[service].maxPerRegion]).sort(compareTuple);
  return JSON.stringify([level.size, regions, definitions, [...level.activeServices].sort(), quotas, placements, landmarks]);
}
function serializeDefinition(definition: JigsawLevel["regionDefinitions"][string]): readonly unknown[] { return definition.type === "dead" ? ["dead"] : ["normal", RESOURCE_TYPES.map((resource) => [resource, definition.requirements[resource] ?? 0]), definition.sanctuary === true]; }
function canonicalPortalPairs(landmarks: readonly Landmark[], size: number, rotation: number): ReadonlyMap<string, string> { const groups = new Map<string, string[]>(); for (const landmark of landmarks) if (landmark.type === "portal") { const key = `${positionArray(rotatePosition(landmark.position, size, rotation))}/${positionArray(rotatePosition(landmark.mouth, size, rotation))}`; groups.set(landmark.pair, [...(groups.get(landmark.pair) ?? []), key]); } return new Map<string, string>([...groups.entries()].map(([pair, endpoints]) => ({ pair, key: endpoints.sort().join("|") })).sort((left, right) => left.key.localeCompare(right.key)).map(({ pair }, index) => [pair, `P${index}`])); }
function serializeLandmark(landmark: Landmark, size: number, rotation: number, portals: ReadonlyMap<string, string>): readonly unknown[] { const position = positionArray(rotatePosition(landmark.position, size, rotation)); return landmark.type === "portal" ? ["portal", portals.get(landmark.pair)!, position, positionArray(rotatePosition(landmark.mouth, size, rotation))] : [landmark.type, position]; }
function rotatePosition(position: { readonly row: number; readonly column: number }, size: number, rotation: number): { row: number; column: number } { return rotation === 0 ? { row: position.row, column: position.column } : rotation === 1 ? { row: position.column, column: size - 1 - position.row } : rotation === 2 ? { row: size - 1 - position.row, column: size - 1 - position.column } : { row: size - 1 - position.column, column: position.row }; }
function positionArray(position: { readonly row: number; readonly column: number }): readonly [number, number] { return [position.row, position.column]; }
function compareTuple(left: readonly unknown[], right: readonly unknown[]): number { return JSON.stringify(left).localeCompare(JSON.stringify(right)); }
function rejected(candidateId: string, seed: number, reason: string): CatalogEvaluation { return { status: "rejected", failure: { candidateId, seed: seed >>> 0, reason } }; }
function withFailure(catalog: PuzzleCatalog, failure: PuzzleCatalogFailure): PuzzleCatalog { return { ...catalog, processedCandidates: addProcessed(catalog, failure.candidateId), failures: [...catalog.failures, failure].sort(compareFailures) }; }
function addProcessed(catalog: PuzzleCatalog, candidateId: string): readonly string[] { return [...catalog.processedCandidates, candidateId].sort(); }
function normalizeConfig(config: PuzzleCatalogConfig): PuzzleCatalogConfig { if (!Number.isInteger(config.seedStart) || !Number.isInteger(config.candidateCount) || config.candidateCount < 1 || !Number.isInteger(config.analysisNodeLimit) || config.analysisNodeLimit < 1) throw new Error("Invalid puzzle catalog configuration."); return { seedStart: config.seedStart >>> 0, candidateCount: config.candidateCount, analysisNodeLimit: config.analysisNodeLimit }; }
function compareEntries(left: PuzzleCatalogEntry, right: PuzzleCatalogEntry): number { return left.seed - right.seed; }
function compareFailures(left: PuzzleCatalogFailure, right: PuzzleCatalogFailure): number { return left.candidateId.localeCompare(right.candidateId); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function numberAt(value: Record<string, unknown>, key: string, fallback: number): number { return typeof value[key] === "number" ? value[key] as number : fallback; }

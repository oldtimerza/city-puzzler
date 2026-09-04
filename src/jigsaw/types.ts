import type { Position } from "./position.js";

export const SERVICE_TYPES = ["generator", "water", "farm", "factory", "twin"] as const;
export const RESOURCE_TYPES = ["food", "water", "power", "steel", "bond"] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const SERVICE_RESOURCES: Readonly<Record<ServiceType, ResourceType>> = {
  generator: "power",
  water: "water",
  farm: "food",
  factory: "steel",
  twin: "bond",
};

export type RegionResourceRequirements = Readonly<Partial<Record<ResourceType, number>>>;

export type RegionDefinition =
  | Readonly<{ type: "normal"; requirements: RegionResourceRequirements; sanctuary?: boolean }>
  | Readonly<{ type: "dead" }>;

export type Landmark =
  | Readonly<{ type: "echo"; position: Position }>
  | Readonly<{ type: "catalyst"; position: Position }>
  | Readonly<{ type: "amplifier"; position: Position }>
  | Readonly<{ type: "portal"; pair: string; position: Position; mouth: Position }>;

export interface ServiceQuota {
  readonly total: number;
  readonly maxPerRow: number;
  readonly maxPerColumn: number;
  readonly maxPerRegion: number;
}

export interface ServicePlacement {
  readonly service: ServiceType;
  readonly position: Position;
}

export interface JigsawLevel {
  readonly size: number;
  readonly regions: readonly (readonly string[])[];
  readonly regionDefinitions: Readonly<Record<string, RegionDefinition>>;
  readonly activeServices: readonly ServiceType[];
  readonly quotas: Readonly<Record<ServiceType, ServiceQuota>>;
  /** Omitted by standard Chord. Landmarks occupy their positions. */
  readonly landmarks?: readonly Landmark[];
}

export interface JigsawPuzzle {
  readonly level: JigsawLevel;
  readonly solution: readonly ServicePlacement[];
  readonly clues: readonly ServicePlacement[];
  readonly title: string;
  readonly introduction: string;
}

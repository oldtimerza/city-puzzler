export const RESOURCE_TYPES = ["electricity", "nature"] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type ResourceVector = Record<ResourceType, number>;

export interface Position {
  readonly row: number;
  readonly column: number;
}

export type Direction = "north" | "east" | "south" | "west";

export type BuildingKind = "solar" | "park" | "greenhouse" | "battery" | "relay";

export interface KernelEffect {
  readonly offset: Position;
  readonly resource: ResourceType;
  readonly amount: number;
}

export interface BuildingDefinition {
  readonly kind: BuildingKind;
  readonly label: string;
  readonly kernel: readonly KernelEffect[];
}

export interface Placement {
  readonly building: BuildingKind;
  readonly position: Position;
  readonly orientation: Direction;
}

export interface Board {
  readonly size: number;
  readonly blockedCells: readonly Position[];
}

export interface Puzzle {
  readonly board: Board;
  readonly inventory: Readonly<Record<BuildingKind, number>>;
  readonly target: ResourceField;
}

export type ResourceField = ResourceVector[][];

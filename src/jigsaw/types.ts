import type { Direction, Position } from "../core/types.js";

export const SERVICE_TYPES = ["generator", "water", "farm"] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export interface ServicePlacement {
  readonly service: ServiceType;
  readonly position: Position;
  readonly orientation: Direction;
}

export interface JigsawLevel {
  readonly size: number;
  readonly regions: readonly (readonly string[])[];
  readonly activeServices: readonly ServiceType[];
  readonly inventory: Readonly<Record<ServiceType, number>>;
}

export interface JigsawPuzzle {
  readonly level: JigsawLevel;
  readonly solution: readonly ServicePlacement[];
  readonly clues: readonly ServicePlacement[];
  readonly title: string;
  readonly introduction: string;
}

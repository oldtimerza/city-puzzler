import type { BuildingDefinition, BuildingKind, Direction, KernelEffect, Position } from "./types.js";

export const BUILDINGS: Readonly<Record<BuildingKind, BuildingDefinition>> = {
  solar: {
    kind: "solar",
    label: "Solar plant",
    kernel: [
      effect(-1, 0, "electricity", 1),
      effect(0, -1, "electricity", 1),
      effect(0, 0, "electricity", 2),
      effect(0, 1, "electricity", 1),
      effect(1, 0, "electricity", 1),
    ],
  },
  park: {
    kind: "park",
    label: "Park",
    kernel: squareKernel("nature", 1),
  },
  greenhouse: {
    kind: "greenhouse",
    label: "Greenhouse",
    kernel: [
      effect(0, 0, "electricity", -1),
      effect(-1, 0, "nature", 1),
      effect(0, -1, "nature", 1),
      effect(0, 0, "nature", 1),
      effect(0, 1, "nature", 1),
      effect(1, 0, "nature", 1),
    ],
  },
  battery: {
    kind: "battery",
    label: "Battery",
    kernel: [
      effect(-1, 0, "electricity", -1),
      effect(0, -1, "electricity", -1),
      effect(0, 0, "electricity", -1),
      effect(0, 1, "electricity", -1),
      effect(1, 0, "electricity", -1),
    ],
  },
  relay: {
    kind: "relay",
    label: "Power relay",
    kernel: [effect(0, -1, "electricity", -1), effect(0, 1, "electricity", 1)],
  },
};

export function getBuildingEffects(building: BuildingKind, orientation: Direction): readonly KernelEffect[] {
  const definition = BUILDINGS[building];

  return definition.kernel.map((entry) => ({ ...entry, offset: rotateOffset(entry.offset, orientation) }));
}

function effect(row: number, column: number, resource: KernelEffect["resource"], amount: number): KernelEffect {
  return { offset: { row, column }, resource, amount };
}

function squareKernel(resource: KernelEffect["resource"], amount: number): readonly KernelEffect[] {
  const entries: KernelEffect[] = [];

  for (const row of [-1, 0, 1]) {
    for (const column of [-1, 0, 1]) {
      entries.push(effect(row, column, resource, amount));
    }
  }

  return entries;
}

function rotateOffset(offset: Position, orientation: Direction): Position {
  switch (orientation) {
    case "east":
      return offset;
    case "south":
      return { row: offset.column, column: -offset.row };
    case "west":
      return { row: -offset.row, column: -offset.column };
    case "north":
      return { row: -offset.column, column: offset.row };
  }
}

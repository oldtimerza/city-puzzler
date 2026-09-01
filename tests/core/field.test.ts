import { describe, expect, it } from "vitest";

import { evaluateField, fieldsMatch } from "../../src/core/field.js";
import type { Board, BuildingKind, Placement, ResourceField } from "../../src/core/types.js";

const board: Board = { size: 5, blockedCells: [] };

describe("evaluateField", () => {
  it("applies the solar cross kernel at its full size", () => {
    const field = evaluateField(board, [{ building: "solar", position: { row: 2, column: 2 }, orientation: "east" }]);

    expect(electricity(field)).toEqual([
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 2, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
    ]);
    expect(nature(field)).toEqual(emptyMatrix());
  });

  it("clips effects at board boundaries", () => {
    const field = evaluateField(board, [{ building: "park", position: { row: 0, column: 0 }, orientation: "north" }]);

    expect(electricity(field)).toEqual(emptyMatrix());
    expect(nature(field)).toEqual([
      [1, 1, 0, 0, 0],
      [1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]);
  });

  it("rotates relay intake and delivery with its orientation", () => {
    const placements: readonly Placement[] = [
      { building: "relay", position: { row: 2, column: 2 }, orientation: "north" },
      { building: "relay", position: { row: 0, column: 0 }, orientation: "south" },
    ];

    const field = evaluateField(board, placements);

    expect(electricity(field)).toEqual([
      [0, 0, 0, 0, 0],
      [1, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, -1, 0, 0],
      [0, 0, 0, 0, 0],
    ]);
  });

  it("keeps symmetric building effects identical across orientations", () => {
    const symmetricBuildings: readonly BuildingKind[] = ["solar", "park", "greenhouse", "battery"];

    for (const building of symmetricBuildings) {
      const north = evaluateField(board, [{ building, position: { row: 2, column: 2 }, orientation: "north" }]);
      const east = evaluateField(board, [{ building, position: { row: 2, column: 2 }, orientation: "east" }]);
      const south = evaluateField(board, [{ building, position: { row: 2, column: 2 }, orientation: "south" }]);
      const west = evaluateField(board, [{ building, position: { row: 2, column: 2 }, orientation: "west" }]);

      expect(fieldsMatch(north, east), building).toBe(true);
      expect(fieldsMatch(north, south), building).toBe(true);
      expect(fieldsMatch(north, west), building).toBe(true);
    }
  });

  it("combines source, sink, converter, and transporter effects simultaneously", () => {
    const field = evaluateField(board, [
      { building: "solar", position: { row: 2, column: 2 }, orientation: "east" },
      { building: "battery", position: { row: 2, column: 2 }, orientation: "east" },
      { building: "greenhouse", position: { row: 2, column: 2 }, orientation: "east" },
      { building: "relay", position: { row: 2, column: 2 }, orientation: "east" },
    ]);

    expect(electricity(field)).toEqual([
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, -1, 0, 1, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]);
    expect(nature(field)).toEqual([
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
    ]);
  });

  it("compares fields only when every resource and cell match", () => {
    const field = evaluateField(board, [{ building: "solar", position: { row: 2, column: 2 }, orientation: "east" }]);
    const sameField = evaluateField(board, [{ building: "solar", position: { row: 2, column: 2 }, orientation: "north" }]);
    const differentField = evaluateField(board, [{ building: "solar", position: { row: 1, column: 2 }, orientation: "east" }]);

    expect(fieldsMatch(field, sameField)).toBe(true);
    expect(fieldsMatch(field, differentField)).toBe(false);
  });
});

function electricity(field: ResourceField): number[][] {
  return field.map((row) => row.map((cell) => cell.electricity));
}

function nature(field: ResourceField): number[][] {
  return field.map((row) => row.map((cell) => cell.nature));
}

function emptyMatrix(): number[][] {
  return Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
}

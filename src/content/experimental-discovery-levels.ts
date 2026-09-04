import { countSolutions } from "../jigsaw/solver.js";
import { isLevelComplete } from "../jigsaw/rules.js";
import type { JigsawPuzzle } from "../jigsaw/types.js";

const twinRelay: JigsawPuzzle = {
  title: "Relay",
  introduction: "Some links travel farther than the grid suggests. Notice what brightens, then use that pattern again.",
  level: {
    size: 3,
    regions: [["A", "A", "A"], ["B", "B", "B"], ["C", "C", "C"]],
    regionDefinitions: {
      A: { type: "normal", requirements: { bond: 2 } },
      B: { type: "normal", requirements: { bond: 1 } },
      C: { type: "normal", requirements: { bond: 1 } },
    },
    activeServices: ["twin"],
    quotas: {
      generator: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
      water: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
      farm: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
      factory: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
      twin: { total: 3, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 },
    },
    landmarks: [
      { type: "portal", pair: "relay", position: { row: 0, column: 1 }, mouth: { row: 0, column: 0 } },
      { type: "portal", pair: "relay", position: { row: 0, column: 2 }, mouth: { row: 1, column: 2 } },
      { type: "amplifier", position: { row: 1, column: 0 } },
      { type: "catalyst", position: { row: 2, column: 2 } },
    ],
  },
  solution: [
    { service: "twin", position: { row: 0, column: 0 } },
    { service: "twin", position: { row: 1, column: 2 } },
    { service: "twin", position: { row: 2, column: 1 } },
  ],
  clues: [
    { service: "twin", position: { row: 0, column: 0 } },
    { service: "twin", position: { row: 1, column: 2 } },
  ],
};

const echoReflection: JigsawPuzzle = {
  title: "Reflection",
  introduction: "A nearby mark changes what the last Triangle can hear. Try the two similar-looking edges.",
  level: {
    size: 3,
    regions: [["A", "A", "A"], ["B", "B", "B"], ["C", "C", "C"]],
    regionDefinitions: {
      A: { type: "normal", requirements: { food: 1, water: 1 } },
      B: { type: "normal", requirements: { food: 1, water: 1 } },
      C: { type: "normal", requirements: { food: 1, water: 1 } },
    },
    activeServices: ["water", "farm"],
    quotas: {
      generator: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
      water: { total: 3, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 },
      farm: { total: 3, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 },
      factory: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
      twin: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
    },
    landmarks: [{ type: "echo", position: { row: 2, column: 1 } }],
  },
  solution: [
    { service: "water", position: { row: 0, column: 0 } },
    { service: "water", position: { row: 1, column: 1 } },
    { service: "water", position: { row: 2, column: 2 } },
    { service: "farm", position: { row: 0, column: 1 } },
    { service: "farm", position: { row: 1, column: 2 } },
    { service: "farm", position: { row: 2, column: 0 } },
  ],
  clues: [
    { service: "water", position: { row: 0, column: 0 } },
    { service: "water", position: { row: 1, column: 1 } },
    { service: "water", position: { row: 2, column: 2 } },
    { service: "farm", position: { row: 0, column: 1 } },
    { service: "farm", position: { row: 1, column: 2 } },
  ],
};

const sanctuaryCrossing: JigsawPuzzle = {
  title: "Shelter",
  introduction: "One district welcomes a close pairing. The same-looking boundary outside it does not.",
  level: {
    size: 3,
    regions: [["A", "A", "A"], ["B", "B", "B"], ["C", "C", "C"]],
    regionDefinitions: {
      A: { type: "normal", requirements: { power: 1, water: 1 }, sanctuary: true },
      B: { type: "normal", requirements: { power: 1, food: 1 } },
      C: { type: "normal", requirements: { water: 1, food: 1 } },
    },
    activeServices: ["generator", "water", "farm"],
    quotas: {
      generator: { total: 2, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 },
      water: { total: 2, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 },
      farm: { total: 2, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 },
      factory: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
      twin: { total: 0, maxPerRow: 0, maxPerColumn: 0, maxPerRegion: 0 },
    },
  },
  solution: [
    { service: "generator", position: { row: 0, column: 0 } },
    { service: "generator", position: { row: 1, column: 2 } },
    { service: "water", position: { row: 0, column: 1 } },
    { service: "water", position: { row: 2, column: 0 } },
    { service: "farm", position: { row: 1, column: 0 } },
    { service: "farm", position: { row: 2, column: 1 } },
  ],
  clues: [
    { service: "generator", position: { row: 0, column: 0 } },
    { service: "generator", position: { row: 1, column: 2 } },
    { service: "water", position: { row: 0, column: 1 } },
    { service: "water", position: { row: 2, column: 0 } },
    { service: "farm", position: { row: 1, column: 0 } },
  ],
};

export const EXPERIMENTAL_DISCOVERY_PUZZLES: readonly JigsawPuzzle[] = [echoReflection, sanctuaryCrossing, twinRelay];

if (!EXPERIMENTAL_DISCOVERY_PUZZLES.every((puzzle) => isLevelComplete(puzzle.level, puzzle.solution) && countSolutions(puzzle.level, puzzle.clues) === 1)) {
  throw new Error("Experimental discovery puzzles must be uniquely solvable.");
}

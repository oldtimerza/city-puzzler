import { generateJigsawLevel } from "../jigsaw/generator.js";

const generatedStarterLevel = generateJigsawLevel(20260901, 6, ["water", "farm", "generator"]);

export const JIGSAW_STARTER_LEVEL = generatedStarterLevel.level;
export const JIGSAW_STARTER_SOLUTION = generatedStarterLevel.solution;

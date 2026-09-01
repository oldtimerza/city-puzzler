import { generateJigsawLevel } from "../jigsaw/generator.js";

const generatedStarterLevel = generateJigsawLevel(20260901);

export const JIGSAW_STARTER_LEVEL = generatedStarterLevel.level;
export const JIGSAW_STARTER_SOLUTION = generatedStarterLevel.solution;

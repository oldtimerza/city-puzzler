import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Worker } from "node:worker_threads";

import { createPuzzleCatalog, migratePuzzleCatalog, recordCatalogEvaluation, type CatalogEvaluation, type PuzzleCatalog, type PuzzleCatalogConfig } from "../src/jigsaw/catalog.js";

interface Options extends PuzzleCatalogConfig {
  readonly output: string;
  readonly resume: boolean;
  readonly checkpointEvery: number;
  readonly workers: number;
}
interface Task { readonly order: number; readonly seed: number; readonly analysisNodeLimit: number; }
interface WorkerResult { readonly order: number; readonly evaluations: readonly CatalogEvaluation[]; }

const options = parseOptions(process.argv.slice(2));
let catalog = options.resume ? await loadCatalog(options) : createPuzzleCatalog(options);
const tasks = buildTasks(catalog, options);
const results = await runWorkerPool(tasks, options.workers);
let completedThisRun = 0;

for (const task of tasks) {
  const result = results.get(task.order);
  if (!result) throw new Error(`Worker pool ended before seed ${task.seed} completed.`);
  for (const evaluation of result.evaluations) {
    catalog = recordCatalogEvaluation(catalog, evaluation);
    completedThisRun += 1;
    if (completedThisRun % options.checkpointEvery === 0) await writeCatalog(options.output, catalog);
    if (completedThisRun % 10 === 0) reportProgress(catalog, completedThisRun);
  }
}
await writeCatalog(options.output, catalog);
reportProgress(catalog, completedThisRun);

function buildTasks(catalog_: PuzzleCatalog, options_: Options): readonly Task[] {
  return Array.from({ length: options_.candidateCount }, (_, offset) => (options_.seedStart + offset) >>> 0)
    .map((seed, order) => ({ order, seed, analysisNodeLimit: options_.analysisNodeLimit }))
    .filter((task) => !catalog_.processedCandidates.includes(`base:${task.seed}`));
}

async function runWorkerPool(tasks_: readonly Task[], workers: number): Promise<ReadonlyMap<number, WorkerResult>> {
  const results = new Map<number, WorkerResult>();
  if (tasks_.length === 0) return results;
  const workerCount = Math.min(workers, tasks_.length);
  let nextTask = 0;
  const workers_ = Array.from({ length: workerCount }, () => new Worker(new URL("./puzzle-catalog-worker.ts", import.meta.url), { execArgv: ["--import", "tsx"] }));

  try {
    await Promise.all(workers_.map((worker) => new Promise<void>((resolve, reject) => {
      const dispatch = (): void => {
        const task = tasks_[nextTask++];
        if (!task) {
          resolve();
          return;
        }
        worker.postMessage(task);
      };
      worker.on("message", (result: WorkerResult) => {
        results.set(result.order, result);
        dispatch();
      });
      worker.once("error", reject);
      worker.once("exit", (code) => { if (code !== 0) reject(new Error(`Catalog worker exited with code ${code}.`)); });
      dispatch();
    })));
  } finally {
    await Promise.all(workers_.map((worker) => worker.terminate()));
  }
  return results;
}

function parseOptions(arguments_: readonly string[]): Options {
  let output = "catalog/chord.json"; let seedStart = 1; let candidateCount = 100;
  let analysisNodeLimit = 25_000; let resume = false; let checkpointEvery = 25; let workers = 10;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!; const value = arguments_[index + 1];
    if (argument === "--resume") resume = true;
    else if (argument === "--output" && value) { output = value; index += 1; }
    else if (argument === "--seed-start" && value) { seedStart = parsePositiveInteger(argument, value, true); index += 1; }
    else if (argument === "--count" && value) { candidateCount = parsePositiveInteger(argument, value); index += 1; }
    else if (argument === "--node-limit" && value) { analysisNodeLimit = parsePositiveInteger(argument, value); index += 1; }
    else if (argument === "--checkpoint-every" && value) { checkpointEvery = parsePositiveInteger(argument, value); index += 1; }
    else if (argument === "--workers" && value) { workers = parsePositiveInteger(argument, value); index += 1; }
    else throw new Error(`Unknown or incomplete option: ${argument}`);
  }
  return { output, seedStart, candidateCount, analysisNodeLimit, resume, checkpointEvery, workers };
}

function parsePositiveInteger(option: string, value: string, allowZero = false): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) throw new Error(`${option} requires a ${allowZero ? "non-negative" : "positive"} integer.`);
  return parsed;
}
async function loadCatalog(options_: Options): Promise<PuzzleCatalog> {
  try {
    const catalog = migratePuzzleCatalog(JSON.parse(await readFile(options_.output, "utf8")));
    const expected = createPuzzleCatalog(options_);
    if (JSON.stringify(catalog.config) !== JSON.stringify(expected.config)) throw new Error("The existing catalog configuration does not match this run.");
    return catalog;
  } catch (error) {
    if (isMissingFile(error)) { console.log(`No existing catalog at ${options_.output}; starting a new run.`); return createPuzzleCatalog(options_); }
    throw error;
  }
}
function isMissingFile(error: unknown): error is NodeJS.ErrnoException { return error instanceof Error && "code" in error && error.code === "ENOENT"; }
async function writeCatalog(output: string, catalog_: PuzzleCatalog): Promise<void> { await mkdir(dirname(output), { recursive: true }); await writeFile(`${output}.tmp`, `${JSON.stringify(catalog_, null, 2)}\n`, "utf8"); await rename(`${output}.tmp`, output); }
function reportProgress(catalog_: PuzzleCatalog, completed: number): void { console.log(`Processed ${catalog_.processedCandidates.length} candidates (${completed} this run): ${catalog_.puzzles.length} accepted, ${catalog_.failures.length} rejected.`); }

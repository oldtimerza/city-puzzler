import { parentPort } from "node:worker_threads";

import { catalogCandidateId, evaluateCatalogBase, type CatalogEvaluation } from "../src/jigsaw/catalog.js";
import { generateChordBaseBoard } from "../src/jigsaw/generator.js";

interface WorkerTask {
  readonly order: number;
  readonly seed: number;
  readonly analysisNodeLimit: number;
}

interface WorkerResult {
  readonly order: number;
  readonly evaluations: readonly CatalogEvaluation[];
}

if (parentPort === null) throw new Error("Puzzle catalog worker requires a parent port.");

parentPort.on("message", (task: WorkerTask) => {
  try {
    const evaluations = [evaluateCatalogBase(task.seed, generateChordBaseBoard(task.seed), task.analysisNodeLimit)];
    parentPort!.postMessage({ order: task.order, evaluations } satisfies WorkerResult);
  } catch (error) {
    parentPort!.postMessage({
      order: task.order,
      evaluations: [{
        status: "rejected",
        failure: {
          candidateId: catalogCandidateId(task.seed),
          seed: task.seed,
          reason: `worker-error:${error instanceof Error ? error.message : String(error)}`,
        },
      }],
    } satisfies WorkerResult);
  }
});

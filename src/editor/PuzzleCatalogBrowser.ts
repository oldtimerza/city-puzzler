import { migratePuzzleCatalog, type ComplexityBucket, type PuzzleCatalog, type PuzzleCatalogEntry } from "../jigsaw/catalog.js";
import { deriveChordVariant } from "../jigsaw/generator.js";
import type { JigsawPuzzle } from "../jigsaw/types.js";

const BUCKETS: readonly ComplexityBucket[] = ["search-ranked", "logic-only", "unranked"];

export function mountPuzzleCatalogBrowser(root: HTMLElement, onTest: (puzzle: JigsawPuzzle) => void): void {
  let catalog: PuzzleCatalog | null = null;
  let selectedId: string | null = null;
  let selectedBucket: ComplexityBucket | "all" = "all";
  let sortOrder: "easiest" | "hardest" = "easiest";
  let deadZoneCount = 2;
  let clueCount = 3;
  let variationSeed: number | null = null;
  let variant: JigsawPuzzle | null = null;
  let message = "Load a base-board catalog JSON file created by the batch generator.";

  const render = (): void => {
    const entries = filteredEntries();
    const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null;
    if (selected && selected.id !== selectedId) selectedId = selected.id;
    root.innerHTML = `
      <section class="catalog-import">
        <label class="menu-button primary catalog-import-button">Load catalog JSON<input data-catalog-file type="file" accept="application/json,.json"></label>
        <p>${escapeHtml(message)}</p>
      </section>
      ${catalog === null ? "" : `
        <section class="catalog-summary"><strong>${catalog.puzzles.length} certified base boards</strong><span>${catalog.failures.length} rejected seeds · ${catalog.config.analysisNodeLimit.toLocaleString()} analysis-node limit</span></section>
        <section class="catalog-filters" aria-label="Catalog filters">
          <label>Rank bucket<select data-catalog-bucket>${(["all", ...BUCKETS] as const).map((bucket) => `<option value="${bucket}" ${bucket === selectedBucket ? "selected" : ""}>${bucketLabel(bucket)}</option>`).join("")}</select></label>
          <label>Order<select data-catalog-order><option value="easiest" ${sortOrder === "easiest" ? "selected" : ""}>Easiest to difficult</option><option value="hardest" ${sortOrder === "hardest" ? "selected" : ""}>Difficult to easiest</option></select></label>
          <span>${entries.length} shown · ${sortOrder === "easiest" ? "easy first" : "hard first"}</span>
        </section>
        <div class="catalog-layout">
          <ol class="catalog-list">${entries.map((entry, index) => `<li><button class="catalog-entry ${entry.id === selected?.id ? "selected" : ""}" type="button" data-catalog-entry="${escapeHtml(entry.id)}" aria-pressed="${entry.id === selected?.id}"><span class="catalog-rank">${index + 1}</span><span><strong>Base board · seed ${entry.seed}</strong><small>${bucketLabel(entry.ranking.bucket)} · ${rankDescription(entry)}</small></span></button></li>`).join("") || "<li class=\"catalog-empty\">No base boards match this filter.</li>"}</ol>
          <aside class="catalog-detail" aria-live="polite">${selected === null ? "<p>Select a base board to create a playable variant.</p>" : detailMarkup(selected, deadZoneCount, clueCount, variationSeed ?? selected.seed, variant)}</aside>
        </div>
      `}
    `;
  };

  root.addEventListener("change", async (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.catalogFile !== undefined) {
      const file = target.files?.[0];
      if (!file) return;
      try {
        catalog = migratePuzzleCatalog(JSON.parse(await file.text()));
        selectedId = catalog.puzzles[0]?.id ?? null;
        variant = null;
        message = `Loaded ${file.name}. Select a base board and derive a variant.`;
      } catch (error) { catalog = null; selectedId = null; variant = null; message = `Could not load this catalog: ${error instanceof Error ? error.message : "invalid JSON"}`; }
      render();
    } else if (target instanceof HTMLSelectElement && target.dataset.catalogBucket !== undefined) { selectedBucket = target.value === "all" ? "all" : target.value as ComplexityBucket; render(); }
    else if (target instanceof HTMLSelectElement && target.dataset.catalogOrder !== undefined) { sortOrder = target.value === "hardest" ? "hardest" : "easiest"; render(); }
    else if (target instanceof HTMLInputElement && target.dataset.variantDeadZones !== undefined) { deadZoneCount = boundedNumber(target.value, 0, 6, deadZoneCount); variant = null; render(); }
    else if (target instanceof HTMLInputElement && target.dataset.variantClues !== undefined) { clueCount = boundedNumber(target.value, 0, 22, clueCount); variant = null; render(); }
    else if (target instanceof HTMLInputElement && target.dataset.variantSeed !== undefined) { variationSeed = boundedNumber(target.value, 0, 4_294_967_295, selectedEntry()?.seed ?? 0); variant = null; render(); }
  });

  root.addEventListener("click", (event) => {
    const button = (event.target instanceof HTMLElement ? event.target : null)?.closest<HTMLButtonElement>("button");
    if (!button || catalog === null) return;
    if (button.dataset.catalogEntry) { selectedId = button.dataset.catalogEntry; variant = null; render(); return; }
    if (button.dataset.variantGenerate !== undefined) {
      const entry = selectedEntry();
      if (!entry) return;
      message = "Searching valid empty witness cells and exact clue subsets...";
      render();
      const result = deriveChordVariant(entry.base, { deadZoneCount, clueCount, variationSeed: variationSeed ?? entry.seed });
      if (result.status === "generated") { variant = result.puzzle; message = `Variant certified: ${result.deadZones.length} dead zones and ${result.puzzle.clues.length} fixed clues.`; }
      else { variant = null; message = "No unique variant exists for this dead-zone and clue count."; }
      render();
    } else if (button.dataset.variantTest !== undefined && variant !== null) onTest(variant);
  });

  function selectedEntry(): PuzzleCatalogEntry | null { return catalog?.puzzles.find((entry) => entry.id === selectedId) ?? null; }
  function filteredEntries(): readonly PuzzleCatalogEntry[] { return (catalog?.puzzles ?? []).filter((entry) => selectedBucket === "all" || entry.ranking.bucket === selectedBucket).sort((left, right) => compareByDifficulty(left, right, sortOrder)); }
  render();
}

function detailMarkup(entry: PuzzleCatalogEntry, deadZones: number, clues: number, seed: number, variant: JigsawPuzzle | null): string {
  const analysis = entry.analysis;
  return `
    <p class="eyebrow">Base board · seed ${entry.seed}</p><h3>${bucketLabel(entry.ranking.bucket)}</h3>
    <p class="catalog-detail-copy">This board has a complete certified witness but no fixed clues or dead zones. Create a playable variant from empty witness cells below.</p>
    <dl class="catalog-metrics"><div><dt>Initial candidates</dt><dd>${analysis.candidateProfile.initialCandidates}</dd></div><div><dt>Logic steps</dt><dd>${analysis.logic.steps.length}</dd></div><div><dt>Search decisions</dt><dd>${analysis.search.decisions}</dd></div><div><dt>Search nodes</dt><dd>${analysis.search.nodes}</dd></div></dl>
    <section class="variant-workbench"><h4>Variant workbench</h4><p>Dead zones only occupy cells empty in the witness. More dead zones and clues generally make a variant easier.</p>
      <label>Dead zones <input data-variant-dead-zones type="number" min="0" max="6" value="${deadZones}"></label>
      <label>Fixed clues <input data-variant-clues type="number" min="0" max="22" value="${clues}"></label>
      <label>Variation seed <input data-variant-seed type="number" min="0" max="4294967295" value="${seed}"></label>
      <button class="menu-button" type="button" data-variant-generate>Create certified variant</button>
      ${variant === null ? "" : `<p class="variant-result">Certified variant: ${variant.clues.length} clues. <button class="menu-button primary" type="button" data-variant-test>Test variant</button></p>`}
    </section>
    <p class="catalog-signature">${escapeHtml(entry.id)}</p>`;
}

function bucketLabel(bucket: ComplexityBucket | "all"): string { return bucket === "all" ? "All ranked entries" : bucket === "search-ranked" ? "Search-ranked" : bucket === "logic-only" ? "Logic-only" : "Unranked review"; }
function rankDescription(entry: PuzzleCatalogEntry): string { return entry.ranking.bucket === "search-ranked" ? `${entry.analysis.search.decisions} decisions · depth ${entry.analysis.search.maxDepth}` : entry.ranking.bucket === "logic-only" ? `${entry.analysis.logic.steps.length} logic steps` : "bounded analysis incomplete"; }
function compareByDifficulty(left: PuzzleCatalogEntry, right: PuzzleCatalogEntry, order: "easiest" | "hardest"): number { const buckets: Readonly<Record<ComplexityBucket, number>> = order === "easiest" ? { "logic-only": 0, "search-ranked": 1, unranked: 2 } : { "search-ranked": 0, "logic-only": 1, unranked: 2 }; const bucket = buckets[left.ranking.bucket] - buckets[right.ranking.bucket]; if (bucket !== 0) return bucket; for (let index = 0; index < Math.max(left.ranking.sortKey.length, right.ranking.sortKey.length); index += 1) { const difference = (left.ranking.sortKey[index] ?? 0) - (right.ranking.sortKey[index] ?? 0); if (difference !== 0) return order === "easiest" ? difference : -difference; } return left.seed - right.seed; }
function boundedNumber(value: string, minimum: number, maximum: number, fallback: number): number { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&gt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character]!); }

import { analyzeJigsawComplexity, type JigsawAnalysis } from "../jigsaw/analysis.js";
import { regionComponents, validateLevel } from "../jigsaw/rules.js";
import { solveJigsaw } from "../jigsaw/solver.js";
import { generateRegionLayout } from "../jigsaw/generator.js";
import { samePosition, type Position } from "../jigsaw/position.js";
import { SERVICE_RESOURCES, SERVICE_TYPES, type JigsawLevel, type JigsawPuzzle, type Landmark, type ServicePlacement, type ServiceQuota, type ServiceType } from "../jigsaw/types.js";

const EDITOR_SIZES = [6, 8] as const;
type EditorSize = (typeof EDITOR_SIZES)[number];
const DEAD_REGION_IDS = ["X", "Y"] as const;
const LANDMARK_TOOLS = ["echo", "catalyst", "amplifier", "portal", "erase"] as const;
type LandmarkTool = (typeof LANDMARK_TOOLS)[number];
const REGION_COLORS: Readonly<Record<string, string>> = {
  A: "#f0c4c4",
  B: "#91d46f",
  C: "#b9d8ec",
  D: "#eed782",
  E: "#86a5dd",
  F: "#f4a640",
  G: "#e9b6d2",
  H: "#c9ced4",
  X: "#717974",
  Y: "#596561",
};

export function mountExperimentalEditor(boardRoot: HTMLElement, toolsRoot: HTMLElement, onTest: (puzzle: JigsawPuzzle) => void): void {
  let selectedRegion = "A";
  let activeServices = new Set<ServiceType>(["water", "farm", "generator"]);
  let boardSize: EditorSize = 8;
  let regions = defaultRegions(boardSize);
  let nextLayoutSeed = Date.now() >>> 0;
  const requirements = new Map<string, Set<ServiceType>>(regionIdsForSize(boardSize).map((region) => [region, new Set(activeServices)]));
  const sanctuaries = new Set<string>();
  let landmarks: Landmark[] = [];
  let selectedLandmark: LandmarkTool | null = null;
  let portalPair = "A";
  let pendingPortalEndpoint: Position | null = null;
  let editorMessage: string | null = null;
  let solvedPlacements: readonly ServicePlacement[] | null = null;
  let solveMessage: string | null = null;
  let complexityAnalysis: JigsawAnalysis | null = null;

  const level = (): JigsawLevel => buildLevel(boardSize, regions, activeServices, requirements, sanctuaries, landmarks);

  const render = (): void => {
    const draft = level();
    const issues = validateLevel(draft);
    const selectedRequirements = requirements.get(selectedRegion) ?? new Set<ServiceType>();
    const normalRegionCount = new Set(regions.flat().filter((region) => !isDeadRegion(region))).size;
    const deadCellCount = regions.flat().filter(isDeadRegion).length;
    const tunnelArches = inferredTunnelArches(draft);
    const solutionByPosition = new Map((solvedPlacements ?? []).map((placement) => [positionKey(placement.position), placement]));

    boardRoot.innerHTML = `
      <section class="editor-canvas-heading">
        <p>Paint regions directly on the board. A normal district split into two parts becomes a tunnel district.</p>
        <span>${boardSize}x${boardSize} · ${normalRegionCount} normal regions · ${deadCellCount} dead cells · ${tunnelArches.length} tunnels</span>
      </section>
      <div class="editor-board-frame">
        <div class="editor-board" style="--editor-size: ${boardSize}" aria-label="Editable ${boardSize} by ${boardSize} region map">
          ${regions.flatMap((row, rowIndex) => row.map((region, column) => {
            const solution = solutionByPosition.get(`${rowIndex}:${column}`);
            const landmark = landmarks.find((candidate) => candidate.position.row === rowIndex && candidate.position.column === column);
            const portalMouth = landmarks.find((candidate) => candidate.type === "portal" && candidate.mouth.row === rowIndex && candidate.mouth.column === column);
            return `<button class="editor-cell ${isDeadRegion(region) ? "dead" : ""} ${sanctuaries.has(region) ? "sanctuary" : ""}" type="button" data-editor-cell="${rowIndex}:${column}" style="--region-color: ${REGION_COLORS[region]}" aria-label="Row ${rowIndex + 1}, column ${column + 1}, ${isDeadRegion(region) ? `dead region ${region}` : `${sanctuaries.has(region) ? "Sanctuary" : "normal"} region ${region}`} "><span>${region}</span>${landmark ? `<i class="editor-landmark ${landmark.type}">${landmarkCode(landmark)}</i>` : portalMouth ? "<i class=\"editor-landmark mouth\">o</i>" : ""}${solution ? `<strong class="editor-solution ${solution.service}">${symbolCode(solution.service)}</strong>` : ""}</button>`;
          })).join("")}
        </div>
        ${renderTunnelArches(tunnelArches, boardSize)}
      </div>
    `;

    toolsRoot.innerHTML = `
      <section class="editor-section" aria-labelledby="editor-size-title">
        <h4 id="editor-size-title">Board size</h4>
        <div class="editor-size-choices" role="group" aria-label="Board size">
          ${EDITOR_SIZES.map((size) => `<button class="editor-size-choice ${boardSize === size ? "selected" : ""}" type="button" data-editor-size="${size}" aria-pressed="${boardSize === size}">${size}x${size}</button>`).join("")}
        </div>
      </section>
      <section class="editor-section" aria-labelledby="editor-symbols-title">
        <h4 id="editor-symbols-title">Active symbols</h4>
        <div class="editor-service-toggles">
          ${SERVICE_TYPES.map((service) => `<label><input type="checkbox" data-editor-service="${service}" ${activeServices.has(service) ? "checked" : ""}> ${symbolLabel(service)}</label>`).join("")}
        </div>
      </section>
      <section class="editor-section" aria-labelledby="editor-brush-title">
        <h4 id="editor-brush-title">Paint region</h4>
        <div class="editor-brushes" role="toolbar" aria-label="Region paint tools">
          ${[...regionIdsForSize(boardSize), ...DEAD_REGION_IDS].map((region) => `<button class="editor-brush ${selectedRegion === region ? "selected" : ""} ${isDeadRegion(region) ? "dead" : ""}" type="button" data-editor-region="${region}" style="--region-color: ${REGION_COLORS[region]}">${isDeadRegion(region) ? `Dead ${region}` : `Region ${region}`}</button>`).join("")}
        </div>
        <button class="menu-button editor-randomize" type="button" data-editor-randomize>Randomise layout</button>
      </section>
      <section class="editor-section editor-requirements" aria-labelledby="editor-requirements-title">
        <h4 id="editor-requirements-title">Requirements for ${isDeadRegion(selectedRegion) ? "dead terrain" : `region ${selectedRegion}`}</h4>
        <p>${isDeadRegion(selectedRegion) ? "Dead terrain never carries requirements or accepts symbols." : "Toggle the symbols this normal region requires. Quotas follow the total demands you author."}</p>
        <div class="editor-requirement-buttons">
          ${SERVICE_TYPES.map((service) => `<button class="editor-requirement ${selectedRequirements.has(service) ? "selected" : ""}" type="button" data-editor-requirement="${service}" ${isDeadRegion(selectedRegion) || !activeServices.has(service) ? "disabled" : ""}>${symbolLabel(service)}</button>`).join("")}
        </div>
      </section>
      <section class="editor-section editor-region-kind" aria-labelledby="editor-region-kind-title">
        <h4 id="editor-region-kind-title">Region type</h4>
        <p>${isDeadRegion(selectedRegion) ? "Dead terrain is painted with the region brush." : "Sanctuary only protects Circle and Diamond when both marks share an edge inside this region."}</p>
        <div class="editor-region-kind-buttons" role="group" aria-label="Type for region ${selectedRegion}">
          <button class="editor-region-kind ${!isDeadRegion(selectedRegion) && !sanctuaries.has(selectedRegion) ? "selected" : ""}" type="button" data-editor-region-kind="normal" ${isDeadRegion(selectedRegion) ? "disabled" : ""}>Normal</button>
          <button class="editor-region-kind ${sanctuaries.has(selectedRegion) ? "selected" : ""}" type="button" data-editor-region-kind="sanctuary" ${isDeadRegion(selectedRegion) ? "disabled" : ""}>Sanctuary</button>
        </div>
      </section>
      <section class="editor-section editor-landmarks" aria-labelledby="editor-landmarks-title">
        <h4 id="editor-landmarks-title">Landmarks</h4>
        <p>${pendingPortalEndpoint ? `Portal endpoint selected at row ${pendingPortalEndpoint.row + 1}, column ${pendingPortalEndpoint.column + 1}. Click its orthogonal mouth.` : selectedLandmark === "portal" ? "Click an endpoint, then its orthogonal mouth. Use the same pair ID for two endpoints." : "Choose a fixture, then click a normal cell. Erase also clears a Portal using that cell as its mouth."}</p>
        <div class="editor-landmark-buttons" role="toolbar" aria-label="Landmark tools">
          ${LANDMARK_TOOLS.map((tool) => `<button class="editor-landmark-tool ${selectedLandmark === tool ? "selected" : ""}" type="button" data-editor-landmark="${tool}" aria-pressed="${selectedLandmark === tool}">${landmarkLabel(tool)}</button>`).join("")}
        </div>
        <div class="editor-landmark-description" aria-live="polite">${escapeHtml(landmarkDescription(selectedLandmark))}</div>
        <label class="editor-portal-pair">Portal pair <input data-editor-portal-pair value="${escapeHtml(portalPair)}" maxlength="24" ${selectedLandmark !== "portal" ? "disabled" : ""}></label>
        <span class="editor-landmark-count">${landmarks.length} fixture${landmarks.length === 1 ? "" : "s"} placed</span>
      </section>
      <section class="editor-validation ${issues.length === 0 ? "valid" : "invalid"}" aria-live="polite">
        <strong>${issues.length === 0 ? "Valid draft" : "Draft needs attention"}</strong>
        <span>${issues.length === 0 ? editorMessage ?? (tunnelArches.length === 0 ? `${normalRegionCount} normal regions and ${deadCellCount} dead cells.` : `Tunnel districts: ${tunnelArches.map((tunnel) => tunnel.region).join(", ")}.`) : issues.map(issueLabel).join(" ")}</span>
      </section>
      <section class="editor-section editor-solver" aria-labelledby="editor-solver-title">
        <h4 id="editor-solver-title">Board test</h4>
        <div class="editor-solver-actions">
          <button class="menu-button" type="button" data-editor-solve>Solve</button>
          <button class="menu-button primary" type="button" data-editor-test>Test board</button>
        </div>
        <p>${solveMessage ?? "Solve shows a plan here. Test board opens a playable draft."}</p>
      </section>
      <section class="editor-section editor-analysis" aria-labelledby="editor-analysis-title">
        <h4 id="editor-analysis-title">Complexity diagnostics</h4>
        <button class="menu-button" type="button" data-editor-analyze>Analyse complexity</button>
        ${complexityAnalysis === null ? "<p>Trace deterministic deductions first, then report bounded search effort if assumptions are needed.</p>" : renderAnalysis(complexityAnalysis)}
      </section>
      <details class="editor-export">
        <summary>Level JSON</summary>
        <pre>${escapeHtml(JSON.stringify(draft, null, 2))}</pre>
      </details>
      <button class="menu-button editor-reset" type="button" data-editor-reset>Reset ${boardSize}x${boardSize} draft</button>
    `;
  };

  const handleClick = (event: MouseEvent): void => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const button = target?.closest<HTMLButtonElement>("button");

    if (!button) {
      return;
    }

    const region = button.dataset.editorRegion;
    const cell = button.dataset.editorCell;
    const service = button.dataset.editorRequirement as ServiceType | undefined;
    const regionKind = button.dataset.editorRegionKind;
    const landmarkTool = button.dataset.editorLandmark as LandmarkTool | undefined;
    const size = Number(button.dataset.editorSize) as EditorSize;

    let changed = false;

    if (EDITOR_SIZES.includes(size) && size !== boardSize) {
      boardSize = size;
      resetLayout();
      changed = true;
    } else if (region) {
      selectedRegion = region;
      editorMessage = null;
    } else if (cell) {
      const [row = 0, column = 0] = cell.split(":").map(Number);
      const position = { row, column };
      if (selectedLandmark) {
        changed = editLandmark(position);
      } else {
        regions[row]![column] = selectedRegion;
        removeLandmarksAt(position);
        changed = true;
      }
    } else if (service && !isDeadRegion(selectedRegion) && activeServices.has(service)) {
      const regionRequirements = requirements.get(selectedRegion)!;
      regionRequirements.has(service) ? regionRequirements.delete(service) : regionRequirements.add(service);
      changed = true;
    } else if (regionKind && !isDeadRegion(selectedRegion)) {
      sanctuaries.delete(selectedRegion);
      if (regionKind === "sanctuary") {
        sanctuaries.clear();
        sanctuaries.add(selectedRegion);
      }
      changed = true;
    } else if (landmarkTool && LANDMARK_TOOLS.includes(landmarkTool)) {
      selectedLandmark = selectedLandmark === landmarkTool ? null : landmarkTool;
      pendingPortalEndpoint = null;
      editorMessage = null;
    } else if (button.dataset.editorReset !== undefined) {
      resetLayout();
      changed = true;
    } else if (button.dataset.editorRandomize !== undefined) {
      nextLayoutSeed = (nextLayoutSeed + 1) >>> 0;
      regions = generateRegionLayout(nextLayoutSeed, boardSize).map((regionRow) => [...regionRow]);
      selectedRegion = "A";
      landmarks = [];
      sanctuaries.clear();
      changed = true;
    } else if (button.dataset.editorSolve !== undefined) {
      solveDraft();
    } else if (button.dataset.editorAnalyze !== undefined) {
      analyzeDraft();
    } else if (button.dataset.editorTest !== undefined) {
      const solution = solveDraft();

      if (solution) {
        onTest({
          level: draftForTest(),
          solution,
          clues: [],
          title: "Experimental board",
          introduction: solveMessage?.includes("multiple") ? "Experimental test board. The solver found multiple solutions." : "Experimental test board.",
        });
        return;
      }
    }

    if (changed) {
      solvedPlacements = null;
      solveMessage = null;
      complexityAnalysis = null;
    }

    render();
  };

  boardRoot.addEventListener("click", handleClick);
  toolsRoot.addEventListener("click", handleClick);

  toolsRoot.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const service = input?.dataset.editorService as ServiceType | undefined;

    if (!input) {
      return;
    }

    if (input.dataset.editorPortalPair !== undefined) {
      portalPair = input.value.trim().slice(0, 24) || "A";
      pendingPortalEndpoint = null;
      editorMessage = null;
      render();
      return;
    }

    if (!service) return;

    if (input.checked) {
      activeServices.add(service);
      if (service === "factory") {
        requirements.get(isDeadRegion(selectedRegion) ? "A" : selectedRegion)!.add(service);
      } else {
        regionIdsForSize(boardSize).forEach((region) => requirements.get(region)!.add(service));
      }
    } else {
      activeServices.delete(service);
      regionIdsForSize(boardSize).forEach((region) => requirements.get(region)!.delete(service));
    }

    solvedPlacements = null;
    solveMessage = null;
    complexityAnalysis = null;

    render();
  });

  function draftForTest(): JigsawLevel {
    return level();
  }

  function resetLayout(): void {
    regions = defaultRegions(boardSize);
    selectedRegion = "A";
    requirements.clear();
    regionIdsForSize(boardSize).forEach((region) => requirements.set(region, new Set(activeServices)));
    sanctuaries.clear();
    landmarks = [];
    selectedLandmark = null;
    pendingPortalEndpoint = null;
    editorMessage = null;
  }

  function editLandmark(position: Position): boolean {
    const tool = selectedLandmark;

    if (tool === null) return false;

    if (regionAtPosition(position) === undefined || isDeadRegion(regionAtPosition(position)!)) {
      editorMessage = "Landmarks need a normal cell.";
      return false;
    }

    if (tool === "erase") {
      const before = landmarks.length;
      removeLandmarksAt(position);
      editorMessage = before === landmarks.length ? "No landmark uses that cell." : "Landmark removed.";
      return before !== landmarks.length;
    }

    if (tool === "portal") {
      if (pendingPortalEndpoint === null) {
        if (landmarkUsesPosition(position)) {
          editorMessage = "Remove the existing landmark before placing a Portal endpoint.";
          return false;
        }
        pendingPortalEndpoint = position;
        editorMessage = `Endpoint selected. Choose an orthogonal mouth for Portal pair ${portalPair}.`;
        return false;
      }

      if (Math.abs(pendingPortalEndpoint.row - position.row) + Math.abs(pendingPortalEndpoint.column - position.column) !== 1 || landmarkUsesPosition(position)) {
        editorMessage = "A Portal mouth must be an empty orthogonal neighbour of its endpoint.";
        return false;
      }
      landmarks.push({ type: "portal", pair: portalPair, position: pendingPortalEndpoint, mouth: position });
      pendingPortalEndpoint = null;
      editorMessage = `Portal endpoint added to pair ${portalPair}. Add one more endpoint with this pair ID.`;
      return true;
    }

    removeLandmarksAt(position);
    landmarks.push({ type: tool, position });
    editorMessage = `${landmarkLabel(tool)} placed.`;
    return true;
  }

  function removeLandmarksAt(position: Position): void {
    landmarks = landmarks.filter((landmark) => !(samePosition(landmark.position, position) || (landmark.type === "portal" && samePosition(landmark.mouth, position))));
    if (pendingPortalEndpoint && samePosition(pendingPortalEndpoint, position)) pendingPortalEndpoint = null;
  }

  function landmarkAtPosition(position: Position): Landmark | undefined {
    return landmarks.find((landmark) => samePosition(landmark.position, position));
  }

  function landmarkUsesPosition(position: Position): boolean {
    return landmarks.some((landmark) => samePosition(landmark.position, position) || (landmark.type === "portal" && samePosition(landmark.mouth, position)));
  }

  function regionAtPosition(position: Position): string | undefined {
    return regions[position.row]?.[position.column];
  }

  function solveDraft(): readonly ServicePlacement[] | null {
    const draft = level();
    const issues = validateLevel(draft);

    if (issues.length > 0) {
      solvedPlacements = null;
      solveMessage = "Fix the structural issues before solving.";
      return null;
    }

    const solutions = solveJigsaw(draft, [], 2);
    solvedPlacements = solutions[0] ?? null;
    solveMessage = solutions.length === 0
      ? "No solution found."
      : solutions.length === 1
        ? "One solution found."
        : "Multiple solutions found. Showing the first plan.";
    return solvedPlacements;
  }

  function analyzeDraft(): void {
    complexityAnalysis = analyzeJigsawComplexity(level(), []);
  }

  render();
}

function buildLevel(
  size: EditorSize,
  regions: readonly (readonly string[])[],
  activeServices: ReadonlySet<ServiceType>,
  requirements: ReadonlyMap<string, ReadonlySet<ServiceType>>,
  sanctuaries: ReadonlySet<string>,
  landmarks: readonly Landmark[],
): JigsawLevel {
  const usedRegions = new Set(regions.flat());
  const regionDefinitions = Object.fromEntries([...usedRegions].map((region) => isDeadRegion(region)
    ? [region, { type: "dead" }]
    : [region, {
        type: "normal",
        requirements: Object.fromEntries([...(requirements.get(region) ?? [])].map((service) => [SERVICE_RESOURCES[service], 1])),
        ...(sanctuaries.has(region) ? { sanctuary: true } : {}),
      }])) as JigsawLevel["regionDefinitions"];

  const quotas = Object.fromEntries(SERVICE_TYPES.map((service) => {
    const resource = SERVICE_RESOURCES[service];
    const total = Object.values(regionDefinitions).reduce((count, definition) => count + (definition.type === "normal" && definition.requirements[resource] ? 1 : 0), 0);
    return [service, { total: activeServices.has(service) ? total : 0, maxPerRow: activeServices.has(service) ? 1 : 0, maxPerColumn: activeServices.has(service) ? 1 : 0, maxPerRegion: activeServices.has(service) ? 1 : 0 } satisfies ServiceQuota];
  })) as JigsawLevel["quotas"];

  return { size, regions, regionDefinitions, activeServices: [...activeServices], quotas, landmarks };
}

function defaultRegions(size: EditorSize): string[][] {
  const regionIds = regionIdsForSize(size);
  return Array.from({ length: size }, () => Array.from({ length: size }, (_, column) => regionIds[column]!));
}

function regionIdsForSize(size: EditorSize): readonly string[] {
  return Array.from({ length: size }, (_, index) => String.fromCharCode("A".charCodeAt(0) + index));
}

function symbolLabel(service: ServiceType): string {
  return ({ generator: "Circle", water: "Diamond", farm: "Triangle", factory: "Square", twin: "Twin" })[service];
}

function isDeadRegion(region: string): boolean {
  return DEAD_REGION_IDS.includes(region as (typeof DEAD_REGION_IDS)[number]);
}

interface TunnelArch {
  readonly region: string;
  readonly start: Position;
  readonly end: Position;
  readonly control: Readonly<{ x: number; y: number }>;
  readonly color: string;
}

function inferredTunnelArches(level: JigsawLevel): readonly TunnelArch[] {
  return [...new Set(level.regions.flat())].flatMap((region) => {
    if (level.regionDefinitions[region]?.type !== "normal") {
      return [];
    }

    const components = regionComponents(level, region);

    if (components.length !== 2) {
      return [];
    }

    const [start, end] = closestTunnelCells(components[0]!, components[1]!);
    const deltaX = end.column - start.column;
    const deltaY = end.row - start.row;
    const distance = Math.hypot(deltaX, deltaY);
    const archHeight = Math.max(0.48, Math.min(distance * 0.28, 1.3));

    return [{
      region,
      start,
      end,
      control: {
        x: (start.column + end.column + 1) / 2 - (deltaY / distance) * archHeight,
        y: (start.row + end.row + 1) / 2 + (deltaX / distance) * archHeight,
      },
      color: REGION_COLORS[region]!,
    }];
  });
}

function renderTunnelArches(tunnels: readonly TunnelArch[], size: EditorSize): string {
  if (tunnels.length === 0) {
    return "";
  }

  return `<svg class="editor-tunnel-layer" viewBox="0 0 ${size} ${size}" preserveAspectRatio="none" aria-hidden="true">${tunnels.map((tunnel) => {
    const startX = tunnel.start.column + 0.5;
    const startY = tunnel.start.row + 0.5;
    const endX = tunnel.end.column + 0.5;
    const endY = tunnel.end.row + 0.5;
    const path = `M ${startX} ${startY} Q ${tunnel.control.x} ${tunnel.control.y} ${endX} ${endY}`;
    return `<path class="editor-tunnel-outline" d="${path}"/><path class="editor-tunnel-line" d="${path}" style="--tunnel-color: ${tunnel.color}"/><circle class="editor-tunnel-end" cx="${startX}" cy="${startY}" r="0.13" style="--tunnel-color: ${tunnel.color}"/><circle class="editor-tunnel-end" cx="${endX}" cy="${endY}" r="0.13" style="--tunnel-color: ${tunnel.color}"/>`;
  }).join("")}</svg>`;
}

function closestTunnelCells(firstComponent: readonly Position[], secondComponent: readonly Position[]): readonly [Position, Position] {
  let result: readonly [Position, Position] = [firstComponent[0]!, secondComponent[0]!];
  let shortestDistance = Number.POSITIVE_INFINITY;

  for (const first of firstComponent) {
    for (const second of secondComponent) {
      const distance = (first.row - second.row) ** 2 + (first.column - second.column) ** 2;

      if (distance < shortestDistance) {
        result = [first, second];
        shortestDistance = distance;
      }
    }
  }

  return result;
}

function positionKey(position: Position): string {
  return `${position.row}:${position.column}`;
}

function symbolCode(service: ServiceType): string {
  return ({ generator: "C", water: "D", farm: "T", factory: "S", twin: "W" })[service];
}

function landmarkLabel(landmark: LandmarkTool): string {
  return ({ echo: "Echo", catalyst: "Catalyst", amplifier: "Amplifier", portal: "Portal", erase: "Erase" })[landmark];
}

function landmarkCode(landmark: Landmark): string {
  return landmark.type === "echo" ? "E" : landmark.type === "catalyst" ? "*" : landmark.type === "amplifier" ? "+" : "P";
}

function landmarkDescription(landmark: LandmarkTool | null): string {
  switch (landmark) {
    case "echo":
      return "Echo copies the identities of placed shapes on its physical edge-neighbours. Its copy can support nearby shapes or create a Circle-Diamond conflict.";
    case "catalyst":
      return "Catalyst activates an adjacent Triangle, Square, or Twin. It does not provide a shape identity or resource.";
    case "amplifier":
      return "Amplifier makes each adjacent active shape supply two copies of its resource to its own region. It never activates a shape.";
    case "portal":
      return "Portal endpoints with the same pair ID connect their mouth cells. Click an endpoint, then its orthogonal mouth, and repeat for its partner.";
    case "erase":
      return "Erase removes a landmark endpoint or a Portal using the clicked cell as its mouth.";
    case null:
      return "Select a fixture to see how it changes a level, then click a normal board cell to place it.";
  }
}

function issueLabel(issue: string): string {
  const labels: Readonly<Record<string, string>> = {
    "invalid-size": "The board size is invalid.",
    "invalid-region-map": "The region map must match the board size.",
    "invalid-normal-region-count": "Use one normal district for each board row.",
    "disconnected-region": "Every region, including dead terrain, must be edge-connected.",
    "invalid-tunnel-components": "A normal district may have one connected part or exactly two tunnel-connected parts.",
    "invalid-region-definitions": "Every normal region needs valid requirements for active symbols.",
    "invalid-active-services": "Choose at least one active symbol with a matching quota.",
    "invalid-quotas": "The authored requirements do not provide valid symbol quotas.",
  };

  return labels[issue] ?? issue;
}

function renderAnalysis(analysis: JigsawAnalysis): string {
  if (!analysis.valid) {
    return `<p>Fix the structural issues before analysing: ${[...analysis.levelIssues, ...analysis.clueIssues].map(issueLabel).join(" ")}</p>`;
  }

  const techniqueLabels = {
    "inventory-single": "inventory",
    "row-single": "row",
    "column-single": "column",
    "district-single": "district",
  } satisfies Record<keyof JigsawAnalysis["logic"]["placementsByTechnique"], string>;
  const deductions = Object.entries(analysis.logic.placementsByTechnique)
    .filter(([, count]) => count > 0)
    .map(([technique, count]) => `${techniqueLabels[technique as keyof typeof techniqueLabels]} ${count}`)
    .join(", ") || "none";
  const outcome = analysis.solutionCount === "unknown"
    ? "Search limit reached before solution count was known."
    : analysis.solutionCount === 0
      ? "No solution found."
      : analysis.solutionCount === 1
        ? "One solution found."
        : "Multiple solutions found.";
  const search = analysis.search.required
    ? `Search: ${analysis.search.nodes} nodes, ${analysis.search.decisions} decisions, ${analysis.search.contradictions} contradictions, depth ${analysis.search.maxDepth}${analysis.search.truncated ? " (capped)" : ""}.`
    : "Logic completed the board without assumptions.";

  return `<div class="editor-analysis-report"><strong>${outcome}</strong><span>Initial candidates: ${analysis.candidateProfile.initialCandidates}; peak ${analysis.candidateProfile.peakCandidates} (${analysis.candidateProfile.averageCandidatesPerRequiredPlacement.toFixed(1)} per required placement).</span><span>Deductions: ${analysis.logic.steps.length} (${deductions}).</span><span>${search}</span><span>Topology: ${analysis.structural.tunnelDistricts} tunnel districts.</span></div>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

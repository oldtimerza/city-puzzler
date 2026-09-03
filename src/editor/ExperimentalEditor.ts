import { validateLevel } from "../jigsaw/rules.js";
import { SERVICE_RESOURCES, SERVICE_TYPES, type JigsawLevel, type ServiceQuota, type ServiceType } from "../jigsaw/types.js";

const SIZE = 8;
const REGION_IDS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
const DEAD_REGION_IDS = ["X", "Y"] as const;
const REGION_COLORS: Readonly<Record<string, string>> = {
  A: "#eee6d1",
  B: "#dce9df",
  C: "#e8dfec",
  D: "#f0e0d4",
  E: "#dce5ef",
  F: "#ece2ca",
  G: "#dcece9",
  H: "#eee0d1",
  X: "#717974",
  Y: "#596561",
};

export function mountExperimentalEditor(boardRoot: HTMLElement, toolsRoot: HTMLElement): void {
  let selectedRegion = "A";
  let activeServices = new Set<ServiceType>(["water", "farm", "generator"]);
  let regions = defaultRegions();
  const requirements = new Map<string, Set<ServiceType>>(REGION_IDS.map((region) => [region, new Set(activeServices)]));

  const level = (): JigsawLevel => buildLevel(regions, activeServices, requirements);

  const render = (): void => {
    const draft = level();
    const issues = validateLevel(draft);
    const selectedRequirements = requirements.get(selectedRegion) ?? new Set<ServiceType>();
    const normalRegionCount = new Set(regions.flat().filter((region) => !isDeadRegion(region))).size;
    const deadCellCount = regions.flat().filter(isDeadRegion).length;

    boardRoot.innerHTML = `
      <section class="editor-canvas-heading">
        <p>Paint connected regions directly on the board. Dead terrain is blocked and never carries requirements.</p>
        <span>${normalRegionCount} normal regions · ${deadCellCount} dead cells</span>
      </section>
      <div class="editor-board" style="--editor-size: ${SIZE}" aria-label="Editable eight by eight region map">
        ${regions.flatMap((row, rowIndex) => row.map((region, column) => `<button class="editor-cell ${isDeadRegion(region) ? "dead" : ""}" type="button" data-editor-cell="${rowIndex}:${column}" style="--region-color: ${REGION_COLORS[region]}" aria-label="Row ${rowIndex + 1}, column ${column + 1}, ${isDeadRegion(region) ? `dead region ${region}` : `region ${region}`}">${region}</button>`)).join("")}
      </div>
    `;

    toolsRoot.innerHTML = `
      <section class="editor-section" aria-labelledby="editor-symbols-title">
        <h4 id="editor-symbols-title">Active symbols</h4>
        <div class="editor-service-toggles">
          ${SERVICE_TYPES.map((service) => `<label><input type="checkbox" data-editor-service="${service}" ${activeServices.has(service) ? "checked" : ""}> ${symbolLabel(service)}</label>`).join("")}
        </div>
      </section>
      <section class="editor-section" aria-labelledby="editor-brush-title">
        <h4 id="editor-brush-title">Paint region</h4>
        <div class="editor-brushes" role="toolbar" aria-label="Region paint tools">
          ${[...REGION_IDS, ...DEAD_REGION_IDS].map((region) => `<button class="editor-brush ${selectedRegion === region ? "selected" : ""} ${isDeadRegion(region) ? "dead" : ""}" type="button" data-editor-region="${region}" style="--region-color: ${REGION_COLORS[region]}">${isDeadRegion(region) ? `Dead ${region}` : `Region ${region}`}</button>`).join("")}
        </div>
      </section>
      <section class="editor-section editor-requirements" aria-labelledby="editor-requirements-title">
        <h4 id="editor-requirements-title">Requirements for ${isDeadRegion(selectedRegion) ? "dead terrain" : `region ${selectedRegion}`}</h4>
        <p>${isDeadRegion(selectedRegion) ? "Dead terrain never carries requirements or accepts symbols." : "Toggle the symbols this normal region requires. Quotas follow the total demands you author."}</p>
        <div class="editor-requirement-buttons">
          ${SERVICE_TYPES.map((service) => `<button class="editor-requirement ${selectedRequirements.has(service) ? "selected" : ""}" type="button" data-editor-requirement="${service}" ${isDeadRegion(selectedRegion) || !activeServices.has(service) ? "disabled" : ""}>${symbolLabel(service)}</button>`).join("")}
        </div>
      </section>
      <section class="editor-validation ${issues.length === 0 ? "valid" : "invalid"}" aria-live="polite">
        <strong>${issues.length === 0 ? "Valid draft" : "Draft needs attention"}</strong>
        <span>${issues.length === 0 ? `${normalRegionCount} normal regions and ${deadCellCount} dead cells.` : issues.map(issueLabel).join(" ")}</span>
      </section>
      <details class="editor-export">
        <summary>Level JSON</summary>
        <pre>${escapeHtml(JSON.stringify(draft, null, 2))}</pre>
      </details>
      <button class="menu-button editor-reset" type="button" data-editor-reset>Reset 8x8 draft</button>
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

    if (region) {
      selectedRegion = region;
    } else if (cell) {
      const [row = 0, column = 0] = cell.split(":").map(Number);
      regions[row]![column] = selectedRegion;
    } else if (service && !isDeadRegion(selectedRegion) && activeServices.has(service)) {
      const regionRequirements = requirements.get(selectedRegion)!;
      regionRequirements.has(service) ? regionRequirements.delete(service) : regionRequirements.add(service);
    } else if (button.dataset.editorReset !== undefined) {
      regions = defaultRegions();
      selectedRegion = "A";
      requirements.clear();
      REGION_IDS.forEach((regionId) => requirements.set(regionId, new Set(activeServices)));
    }

    render();
  };

  boardRoot.addEventListener("click", handleClick);
  toolsRoot.addEventListener("click", handleClick);

  toolsRoot.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const service = input?.dataset.editorService as ServiceType | undefined;

    if (!input || !service) {
      return;
    }

    if (input.checked) {
      activeServices.add(service);
      if (service === "factory") {
        requirements.get(isDeadRegion(selectedRegion) ? "A" : selectedRegion)!.add(service);
      } else {
        REGION_IDS.forEach((region) => requirements.get(region)!.add(service));
      }
    } else {
      activeServices.delete(service);
      REGION_IDS.forEach((region) => requirements.get(region)!.delete(service));
    }

    render();
  });

  render();
}

function buildLevel(
  regions: readonly (readonly string[])[],
  activeServices: ReadonlySet<ServiceType>,
  requirements: ReadonlyMap<string, ReadonlySet<ServiceType>>,
): JigsawLevel {
  const usedRegions = new Set(regions.flat());
  const regionDefinitions = Object.fromEntries([...usedRegions].map((region) => isDeadRegion(region)
    ? [region, { type: "dead" }]
    : [region, {
        type: "normal",
        requirements: Object.fromEntries([...(requirements.get(region) ?? [])].map((service) => [SERVICE_RESOURCES[service], 1])),
      }])) as JigsawLevel["regionDefinitions"];

  const quotas = Object.fromEntries(SERVICE_TYPES.map((service) => {
    const resource = SERVICE_RESOURCES[service];
    const total = Object.values(regionDefinitions).reduce((count, definition) => count + (definition.type === "normal" && definition.requirements[resource] ? 1 : 0), 0);
    return [service, { total: activeServices.has(service) ? total : 0, maxPerRow: activeServices.has(service) ? 1 : 0, maxPerColumn: activeServices.has(service) ? 1 : 0, maxPerRegion: activeServices.has(service) ? 1 : 0 } satisfies ServiceQuota];
  })) as JigsawLevel["quotas"];

  return { size: SIZE, regions, regionDefinitions, activeServices: [...activeServices], quotas };
}

function defaultRegions(): string[][] {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, (_, column) => REGION_IDS[column]!));
}

function symbolLabel(service: ServiceType): string {
  return ({ generator: "Circle", water: "Diamond", farm: "Triangle", factory: "Square" })[service];
}

function isDeadRegion(region: string): boolean {
  return DEAD_REGION_IDS.includes(region as (typeof DEAD_REGION_IDS)[number]);
}

function issueLabel(issue: ReturnType<typeof validateLevel>[number]): string {
  return ({
    "invalid-size": "The board size is invalid.",
    "invalid-region-map": "The region map must match the board size.",
    "invalid-normal-region-count": "Use exactly eight normal regions.",
    "disconnected-region": "Every region, including dead terrain, must be edge-connected.",
    "invalid-region-definitions": "Every normal region needs valid requirements for active symbols.",
    "invalid-active-services": "Choose at least one active symbol with a matching quota.",
    "invalid-quotas": "The authored requirements do not provide valid symbol quotas.",
  })[issue];
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

import Phaser from "phaser";

import type { Position } from "../core/types.js";
import { generateJigsawLevel, jigsawLevelSignature, type BoardSize } from "../jigsaw/generator.js";
import { factorySuppliers, inactiveFactories, isFactorySupplied, isFarmSupplied, isLevelComplete, legalPositions, supplyingDam, unmetResourcesForRegion, unsuppliedFarms, validatePlacement } from "../jigsaw/rules.js";
import { SERVICE_TYPES, type JigsawPuzzle, type ResourceType, type ServicePlacement, type ServiceQuota, type ServiceType } from "../jigsaw/types.js";

const SERVICE_COLORS: Readonly<Record<ServiceType, number>> = {
  generator: 0xe5ae35,
  water: 0x49a6c9,
  farm: 0x6db675,
  factory: 0xb44d4a,
};
const RESOURCE_COLORS: Readonly<Record<ResourceType, number>> = {
  food: SERVICE_COLORS.farm,
  water: SERVICE_COLORS.water,
  power: SERVICE_COLORS.generator,
  steel: SERVICE_COLORS.factory,
};
const REGION_COLORS = [0xeee6d1, 0xdce9df, 0xe8dfec, 0xf0e0d4, 0xdce5ef, 0xece2ca, 0xdcece9, 0xeee0d1];

export interface JigsawViewState {
  readonly selectedService: ServiceType | null;
  readonly activeServices: readonly ServiceType[];
  readonly placements: readonly ServicePlacement[];
  readonly quotas: Readonly<Record<ServiceType, ServiceQuota>>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly complete: boolean;
  readonly solutionRevealed: boolean;
  readonly title: string;
  readonly status: string;
}

export class JigsawScene extends Phaser.Scene {
  static readonly KEY = "JigsawScene";

  private placements: ServicePlacement[] = [];
  private history: ServicePlacement[][] = [];
  private future: ServicePlacement[][] = [];
  private selectedService: ServiceType | null = null;
  private puzzle: JigsawPuzzle = generateJigsawLevel(20260901);
  private hoveredCell: Position | null = null;
  private hint: ServicePlacement | null = null;
  private showSolutionPreview = false;
  private solutionRevealed = false;
  private status = "Select a building, then choose a district cell.";
  private boardLeft = 0;
  private boardTop = 0;
  private cellSize = 0;

  constructor() {
    super(JigsawScene.KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#f4f0e6");
    this.scale.on(Phaser.Scale.Events.RESIZE, this.renderBoard, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.renderBoard, this));
    this.renderBoard();
    this.publishState();
  }

  selectService(service: ServiceType): void {
    if (this.solutionRevealed) {
      this.status = "The solution has been revealed. Start a new practice board to play again.";
    } else if (this.remaining(service) === 0) {
      this.status = `No ${buildingLabel(service).toLowerCase()} buildings remain to place.`;
    } else if (this.selectedService === service) {
      this.selectedService = null;
      this.status = "Selection cleared.";
    } else {
      this.selectedService = service;
      this.status = `${buildingLabel(service)} selected. ${quotaInstruction(this.level.quotas[service], this.level.size)}`;
    }

    this.renderBoard();
    this.publishState();
  }

  undo(): void {
    if (this.solutionRevealed) {
      this.status = "The solution has been revealed. Start a new practice board to play again.";
      this.publishState();
      return;
    }

    const previous = this.history.pop();

    if (!previous) {
      this.status = "Nothing to undo.";
    } else {
      this.future.push(this.placements);
      this.placements = previous;
      this.status = "Move undone.";
    }

    this.renderBoard();
    this.publishState();
  }

  redo(): void {
    if (this.solutionRevealed) {
      this.status = "The solution has been revealed. Start a new practice board to play again.";
      this.publishState();
      return;
    }

    const next = this.future.pop();

    if (!next) {
      this.status = "Nothing to redo.";
    } else {
      this.history.push(this.placements);
      this.placements = next;
      this.status = "Move restored.";
    }

    this.renderBoard();
    this.publishState();
  }

  reset(): void {
    if (this.solutionRevealed) {
      this.status = "The solution has been revealed. Start a new practice board to play again.";
    } else if (this.placements.length === this.clues.length) {
      this.status = this.clues.length === 0 ? "The board is already clear." : "The board is restored to its clues.";
    } else {
      this.commit([...this.clues]);
      this.status = "Board reset.";
    }

    this.renderBoard();
    this.publishState();
  }

  setSolutionPreview(active: boolean): void {
    if (this.showSolutionPreview === active) {
      return;
    }

    this.showSolutionPreview = active;
    this.renderBoard();
  }

  revealSolution(): void {
    this.placements = [...this.solution];
    this.history = [];
    this.future = [];
    this.selectedService = null;
    this.hint = null;
    this.showSolutionPreview = false;
    this.solutionRevealed = true;
    this.status = "Solution revealed. This practice board is complete.";
    this.renderBoard();
    this.publishState();
  }

  showHint(): void {
    if (this.solutionRevealed) {
      this.status = "The solution has been revealed. Start a new practice board to play again.";
    } else if (this.showSolutionPreview) {
      this.status = "Release the solution preview before requesting a hint.";
    } else {
      const candidates = this.selectedService
        ? [...this.solution.filter((placement) => placement.service === this.selectedService), ...this.solution.filter((placement) => placement.service !== this.selectedService)]
        : this.solution;

      this.hint = candidates.find(
        (placement) => !this.placements.some((current) => samePosition(current.position, placement.position)) && validatePlacement(this.level, this.placements, placement).length === 0,
      ) ?? null;
      this.status = this.hint
        ? `Hint: place a ${buildingLabel(this.hint.service).toLowerCase()} building in the highlighted cell.`
        : "No compatible hint remains for this plan.";
    }

    this.renderBoard();
    this.publishState();
  }

  loadPuzzle(puzzle: JigsawPuzzle): void {
    this.puzzle = puzzle;
    this.placements = [...puzzle.clues];
    this.history = [];
    this.future = [];
    this.selectedService = null;
    this.hint = null;
    this.showSolutionPreview = false;
    this.solutionRevealed = false;
    this.status = puzzle.introduction;
    this.renderBoard();
    this.publishState();
  }

  getPuzzleSignature(): string {
    return jigsawLevelSignature(this.puzzle);
  }

  getBoardSize(): BoardSize {
    return this.level.size as BoardSize;
  }

  getViewState(): JigsawViewState {
    return {
      selectedService: this.selectedService,
      activeServices: this.level.activeServices,
      placements: this.placements,
      quotas: this.level.quotas,
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0,
      complete: isLevelComplete(this.level, this.placements),
      solutionRevealed: this.solutionRevealed,
      title: this.puzzle.title,
      status: this.status,
    };
  }

  private renderBoard(): void {
    this.children.removeAll(true);

    const boardPixels = Math.min(this.scale.width, this.scale.height) - 34;
    this.cellSize = Math.max(28, Math.floor(boardPixels / this.level.size));
    const boardSize = this.cellSize * this.level.size;
    this.boardLeft = Math.floor((this.scale.width - boardSize) / 2);
    this.boardTop = Math.floor((this.scale.height - boardSize) / 2);

    const displayedPlacements = this.showSolutionPreview ? this.solution : this.placements;
    const legalCells = this.selectedService && !this.showSolutionPreview ? new Set(legalPositions(this.level, this.placements, this.selectedService).map(positionKey)) : new Set<string>();

    this.add
      .text(this.boardLeft, Math.max(9, this.boardTop - 25), this.showSolutionPreview ? "REFERENCE PLAN" : this.puzzle.title.toUpperCase(), {
        fontFamily: "Avenir Next, Trebuchet MS, sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#4d6263",
        letterSpacing: 1.5,
      })
      .setOrigin(0, 0.5);

    for (let row = 0; row < this.level.size; row += 1) {
      for (let column = 0; column < this.level.size; column += 1) {
        this.renderCell({ row, column }, legalCells);
      }
    }

    this.renderDistrictBorders();

    this.renderPreview();

    if (this.hint && !this.showSolutionPreview) {
      this.renderHint(this.hint);
    }

    this.renderSupplierLinks(displayedPlacements);

    for (const placement of displayedPlacements) {
      this.renderService(placement, displayedPlacements);
    }

    this.renderDistrictResourceDots(displayedPlacements);

  }

  private renderCell(position: Position, legalCells: ReadonlySet<string>): void {
    const { x, y } = this.cellOrigin(position);
    const region = this.level.regions[position.row]![position.column]!;
    const fill = REGION_COLORS[region.charCodeAt(0) - "A".charCodeAt(0)]!;
    const legal = legalCells.has(positionKey(position));
    const cell = this.add
      .rectangle(x + this.cellSize / 2, y + this.cellSize / 2, this.cellSize - 2, this.cellSize - 2, legal ? 0xbdf0b5 : fill)
      .setStrokeStyle(1, 0x53676a, 0.8);

    cell.setInteractive({ useHandCursor: true });
    cell.on("pointerdown", () => this.handleCellSelection(position));
    cell.on("pointerover", () => {
      this.hoveredCell = position;
      this.renderBoard();
    });
    cell.on("pointerout", () => {
      if (this.hoveredCell && samePosition(this.hoveredCell, position)) {
        this.hoveredCell = null;
        this.renderBoard();
      }
    });
  }

  private renderDistrictBorders(): void {
    const borders = this.add.graphics();
    const drawBorders = () => {
      for (let row = 0; row < this.level.size; row += 1) {
        for (let column = 0; column < this.level.size; column += 1) {
          const position = { row, column };
          const { x, y } = this.cellOrigin(position);
          const region = this.level.regions[row]![column]!;

          if (row === 0 || this.level.regions[row - 1]![column] !== region) {
            borders.lineBetween(x, y, x + this.cellSize, y);
          }

          if (column === 0 || this.level.regions[row]![column - 1] !== region) {
            borders.lineBetween(x, y, x, y + this.cellSize);
          }

          if (row === this.level.size - 1 || this.level.regions[row + 1]![column] !== region) {
            borders.lineBetween(x, y + this.cellSize, x + this.cellSize, y + this.cellSize);
          }

          if (column === this.level.size - 1 || this.level.regions[row]![column + 1] !== region) {
            borders.lineBetween(x + this.cellSize, y, x + this.cellSize, y + this.cellSize);
          }
        }
      }
    };

    borders.lineStyle(Math.max(5, Math.round(this.cellSize * 0.065)), 0xf8f4e9, 0.95);
    drawBorders();
    borders.lineStyle(Math.max(3, Math.round(this.cellSize * 0.04)), 0x233d40, 1);
    drawBorders();
  }

  private renderPreview(): void {
    const hoveredCell = this.hoveredCell;

    if (this.showSolutionPreview || !this.selectedService || !hoveredCell || this.placements.some((placement) => samePosition(placement.position, hoveredCell))) {
      return;
    }

    const candidate = this.createPlacement(hoveredCell);
    const valid = validatePlacement(this.level, this.placements, candidate).length === 0;
    const { x, y } = this.cellOrigin(hoveredCell);
    const preview = this.add.rectangle(x + this.cellSize / 2, y + this.cellSize / 2, this.cellSize - 12, this.cellSize - 12, valid ? 0x78b884 : 0xcf7772, 0.22);
    preview.setStrokeStyle(2, valid ? 0x3f8a5b : 0xaf4d4d, 0.85);
  }

  private renderHint(placement: ServicePlacement): void {
    const { x, y } = this.cellOrigin(placement.position);
    const centerX = x + this.cellSize / 2;
    const centerY = y + this.cellSize / 2;
    const color = SERVICE_COLORS[placement.service];

    this.add.rectangle(centerX, centerY, this.cellSize - 12, this.cellSize - 12, color, 0.3).setStrokeStyle(3, 0xffffff, 0.9);
    this.add
        .text(centerX, centerY, `HINT\n${buildingCode(placement.service)}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${Math.max(10, Math.round(this.cellSize * 0.14))}px`,
        fontStyle: "bold",
        align: "center",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }

  private renderService(placement: ServicePlacement, displayedPlacements: readonly ServicePlacement[]): void {
    const { x, y } = this.cellOrigin(placement.position);
    const centerX = x + this.cellSize / 2;
    const centerY = y + this.cellSize / 2;
    const symbolSize = this.cellSize * 0.23;
    const inactive = (placement.service === "farm" && !isFarmSupplied(displayedPlacements, placement))
      || (placement.service === "factory" && !isFactorySupplied(displayedPlacements, placement));
    const outline = inactive ? 0xb74f4f : 0x30474a;

    switch (placement.service) {
      case "generator":
        this.add.circle(centerX, centerY, symbolSize, SERVICE_COLORS.generator).setStrokeStyle(2, outline);
        break;
      case "water":
        this.add.rectangle(centerX, centerY, symbolSize * 1.45, symbolSize * 1.45, SERVICE_COLORS.water).setRotation(Math.PI / 4).setStrokeStyle(2, outline);
        break;
      case "farm":
        {
          const triangle = this.add.graphics();
          triangle.fillStyle(SERVICE_COLORS.farm);
          triangle.lineStyle(2, outline);
          triangle.fillTriangle(centerX, centerY - symbolSize, centerX + symbolSize, centerY + symbolSize, centerX - symbolSize, centerY + symbolSize);
          triangle.strokeTriangle(centerX, centerY - symbolSize, centerX + symbolSize, centerY + symbolSize, centerX - symbolSize, centerY + symbolSize);
        }
        break;
      case "factory":
        this.add.rectangle(centerX, centerY, symbolSize * 1.6, symbolSize * 1.35, SERVICE_COLORS.factory).setStrokeStyle(2, outline);
        break;
    }

    if (inactive) {
      this.renderMissingRequirementSlash(centerX, centerY, symbolSize);
    }
  }

  private renderSupplierLinks(placements: readonly ServicePlacement[]): void {
    for (const placement of placements) {
      if (placement.service === "farm") {
        const dam = supplyingDam(placements, placement);

        if (dam) {
          this.renderSupplierLink(placement, dam);
        }
      }

      if (placement.service === "factory") {
        const suppliers = factorySuppliers(placements, placement);

        if (suppliers.power) {
          this.renderSupplierLink(placement, suppliers.power);
        }

        if (suppliers.water) {
          this.renderSupplierLink(placement, suppliers.water);
        }
      }
    }
  }

  private renderSupplierLink(dependent: ServicePlacement, supplier: ServicePlacement): void {
    const start = this.cellCenter(dependent.position);
    const end = this.cellCenter(supplier.position);
    const link = this.add.graphics();

    link.lineStyle(Math.max(4, Math.round(this.cellSize * 0.075)), SERVICE_COLORS[supplier.service], 0.58);
    link.lineBetween(start.x, start.y, end.x, end.y);
    link.lineStyle(1, 0x30474a, 0.72);
    link.lineBetween(start.x, start.y, end.x, end.y);
  }

  private renderMissingRequirementSlash(centerX: number, centerY: number, symbolSize: number): void {
    const slash = this.add.graphics();
    const offset = symbolSize * 0.95;

    slash.lineStyle(Math.max(4, Math.round(this.cellSize * 0.075)), 0xb33e3c, 0.92);
    slash.lineBetween(centerX - offset, centerY + offset, centerX + offset, centerY - offset);
    slash.lineStyle(1, 0xf9f5e9, 0.8);
    slash.lineBetween(centerX - offset, centerY + offset, centerX + offset, centerY - offset);
  }

  private renderDistrictResourceDots(placements: readonly ServicePlacement[]): void {
    const regions = [...new Set(this.level.regions.flat())];
    const radius = Math.max(3, Math.round(this.cellSize * 0.055));
    const spacing = radius * 2 + Math.max(2, Math.round(this.cellSize * 0.04));

    for (const region of regions) {
      const unmet = unmetResourcesForRegion(this.level, placements, region);

      if (unmet.length === 0) {
        continue;
      }

      const anchor = this.regionTopCorner(region);
      const { x, y } = this.cellOrigin(anchor);
      const startX = x + radius + Math.max(4, Math.round(this.cellSize * 0.07));
      const centerY = y + radius + Math.max(4, Math.round(this.cellSize * 0.07));

      unmet.forEach((resource, index) => {
        this.add.circle(startX + index * spacing, centerY, radius, RESOURCE_COLORS[resource]).setStrokeStyle(1, 0x30474a, 0.9);
      });
    }
  }

  private handleCellSelection(position: Position): void {
    if (this.solutionRevealed) {
      this.status = "The solution has been revealed. Start a new practice board to play again.";
      this.renderBoard();
      this.publishState();
      return;
    } else if (this.showSolutionPreview) {
      return;
    }

    const existingIndex = this.placements.findIndex((placement) => samePosition(placement.position, position));

    if (existingIndex >= 0 && this.isClue(position)) {
      this.status = "That starting clue is fixed.";
    } else if (existingIndex >= 0) {
      this.commit(this.placements.filter((_, index) => index !== existingIndex));
      this.status = "Building removed.";
    } else if (!this.selectedService) {
      this.status = "Select a building before placing it.";
    } else {
      const candidate = this.createPlacement(position);
      const issues = validatePlacement(this.level, this.placements, candidate);

      if (issues.length > 0) {
        this.status = placementMessage(issues[0]!);
      } else {
        this.commit([...this.placements, candidate]);
        const remainingFarms = unsuppliedFarms(this.placements).length;
        const inactiveFactoryCount = inactiveFactories(this.placements).length;
        this.status = isLevelComplete(this.level, this.placements)
          ? "City plan approved."
          : this.placements.length === totalInventory(this.level.quotas) && remainingFarms > 0
            ? `${remainingFarms} farm${remainingFarms === 1 ? "" : "s"} still need an adjacent dam.`
            : this.placements.length === totalInventory(this.level.quotas) && inactiveFactoryCount > 0
              ? `${inactiveFactoryCount} factor${inactiveFactoryCount === 1 ? "y" : "ies"} still need adjacent power and water.`
            : `${buildingLabel(candidate.service)} building placed.`;

        if (this.remaining(candidate.service) === 0) {
          this.selectedService = null;
        }
      }
    }

    this.renderBoard();
    this.publishState();
  }

  private createPlacement(position: Position): ServicePlacement {
    return { service: this.selectedService!, position };
  }

  private commit(next: ServicePlacement[]): void {
    this.history.push(this.placements);
    this.placements = next;
    this.future = [];
    this.hint = null;
  }

  private remaining(service: ServiceType): number {
    return this.level.quotas[service].total - this.placements.filter((placement) => placement.service === service).length;
  }

  private cellOrigin(position: Position): { x: number; y: number } {
    return { x: this.boardLeft + position.column * this.cellSize, y: this.boardTop + position.row * this.cellSize };
  }

  private cellCenter(position: Position): { x: number; y: number } {
    const { x, y } = this.cellOrigin(position);
    return { x: x + this.cellSize / 2, y: y + this.cellSize / 2 };
  }

  private regionTopCorner(region: string): Position {
    for (let row = 0; row < this.level.size; row += 1) {
      for (let column = 0; column < this.level.size; column += 1) {
        if (this.level.regions[row]![column] === region) {
          return { row, column };
        }
      }
    }

    throw new Error(`Unknown district ${region}.`);
  }

  private publishState(): void {
    this.events.emit("statechange", this.getViewState());
  }

  private get level() {
    return this.puzzle.level;
  }

  private get solution() {
    return this.puzzle.solution;
  }

  private get clues() {
    return this.puzzle.clues;
  }

  private isClue(position: Position): boolean {
    return this.clues.some((clue) => samePosition(clue.position, position));
  }
}

function samePosition(left: Position, right: Position): boolean {
  return left.row === right.row && left.column === right.column;
}

function positionKey(position: Position): string {
  return `${position.row}:${position.column}`;
}

function buildingLabel(service: ServiceType): string {
  switch (service) {
    case "generator":
      return "Solar panel";
    case "water":
      return "Dam";
    case "farm":
      return "Farm";
    case "factory":
      return "Factory";
  }
}

function buildingCode(service: ServiceType): string {
  switch (service) {
    case "generator":
      return "WND";
    case "water":
      return "DAM";
    case "farm":
      return "FRM";
    case "factory":
      return "FAC";
  }
}

function totalInventory(quotas: Readonly<Record<ServiceType, ServiceQuota>>): number {
  return SERVICE_TYPES.reduce((total, service) => total + quotas[service].total, 0);
}

function quotaInstruction(quota: ServiceQuota, size: number): string {
  return quota.total === size && quota.maxPerRow === 1 && quota.maxPerColumn === 1 && quota.maxPerRegion === 1
    ? "Place one in every row, column, and district."
    : `Place ${quota.total} in separate rows, columns, and districts.`;
}

function placementMessage(issue: ReturnType<typeof validatePlacement>[number]): string {
  switch (issue) {
    case "out-of-bounds":
      return "That cell is outside the town plan.";
    case "occupied-cell":
      return "Only one building may occupy a cell.";
    case "inventory-exhausted":
      return "No more of that building may be placed.";
    case "row-conflict":
      return "That row already has this building.";
    case "column-conflict":
      return "That column already has this building.";
    case "region-conflict":
      return "That district already has this building.";
    case "generator-water-conflict":
      return "Solar panels and dams cannot be orthogonally adjacent.";
    case "farm-dam-missing":
      return "Farms must be orthogonally adjacent to a dam.";
    case "factory-steel-demand-missing":
      return "Factories may only be built in districts that need steel.";
  }
}

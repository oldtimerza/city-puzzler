import Phaser from "phaser";

import { ChordAudio } from "./ChordAudio.js";
import { generateJigsawLevel, jigsawLevelSignature, type BoardSize } from "../jigsaw/generator.js";
import { samePosition, type Position } from "../jigsaw/position.js";
import { evaluatePlacements, factorySuppliers, identitiesAt, inactiveFactories, interactionEdges, isFactorySupplied, isFarmSupplied, isLevelComplete, isPlacementActive, landmarkAt, legalServicesAt, regionComponents, regionDefinitionAt, supplyingDam, unmetResourcesForRegion, validatePlacement, type PlacementIssue } from "../jigsaw/rules.js";
import { SERVICE_TYPES, type JigsawPuzzle, type ResourceType, type ServicePlacement, type ServiceQuota, type ServiceType } from "../jigsaw/types.js";

const SERVICE_COLORS: Readonly<Record<ServiceType, number>> = {
  generator: 0xe5ae35,
  water: 0x49a6c9,
  farm: 0x6db675,
  factory: 0xb44d4a,
  twin: 0x8665b8,
};
const RESOURCE_SYMBOLS: Readonly<Record<ResourceType, ServiceType>> = {
  food: "farm",
  water: "water",
  power: "generator",
  steel: "factory",
  bond: "twin",
};
const REGION_COLORS = [0xf0c4c4, 0x91d46f, 0xb9d8ec, 0xeed782, 0x86a5dd, 0xf4a640, 0xe9b6d2, 0xc9ced4];

type CalloutSide = "top" | "bottom" | "left" | "right";

interface RequirementCallout {
  readonly region: string;
  readonly services: readonly ServiceType[];
  readonly side: CalloutSide;
  readonly target: Readonly<{ x: number; y: number }>;
  readonly width: number;
  readonly height: number;
  centerX: number;
  centerY: number;
}

interface CalloutBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface SupportLink {
  readonly dependent: ServicePlacement;
  readonly supplier: ServicePlacement;
  readonly key: string;
}

export interface JigsawViewState {
  readonly selectedService: ServiceType | null;
  readonly activeServices: readonly ServiceType[];
  readonly placements: readonly ServicePlacement[];
  readonly placementStack: readonly ServicePlacement[];
  readonly quotas: Readonly<Record<ServiceType, ServiceQuota>>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly complete: boolean;
  readonly solutionRevealed: boolean;
  readonly showPlacementCandidates: boolean;
  readonly requirementsOnHover: boolean;
  readonly soundEffectsEnabled: boolean;
  readonly title: string;
  readonly status: string;
}

export class JigsawScene extends Phaser.Scene {
  static readonly KEY = "JigsawScene";

  private placements: ServicePlacement[] = [];
  private history: ServicePlacement[][] = [];
  private future: ServicePlacement[][] = [];
  private selectedService: ServiceType | null = null;
  private placementMenuPosition: Position | null = null;
  private puzzle: JigsawPuzzle = generateJigsawLevel(20260901);
  private hoveredCell: Position | null = null;
  private hint: ServicePlacement | null = null;
  private showSolutionPreview = false;
  private solutionRevealed = false;
  private showPlacementCandidates = true;
  private requirementsOnHover = false;
  private soundEffectsEnabled = true;
  private readonly audio = new ChordAudio();
  private status = "Click an empty cell to choose a symbol.";
  private boardLeft = 0;
  private boardTop = 0;
  private cellSize = 0;
  private calloutBounds: readonly CalloutBounds[] = [];

  constructor() {
    super(JigsawScene.KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#f4f0e6");
    if (this.game.renderer.type === Phaser.WEBGL) {
      Phaser.Actions.AddEffectBloom(this.cameras.main, {
        threshold: 0.62,
        blurRadius: 1.35,
        blurSteps: 2,
        blurQuality: 0,
        blendAmount: 0.22,
      });
    }
    this.scale.on(Phaser.Scale.Events.RESIZE, this.renderBoard, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.renderBoard, this));
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.dismissPlacementMenuOutsideBoard, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.off(Phaser.Input.Events.POINTER_DOWN, this.dismissPlacementMenuOutsideBoard, this));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.moveCalloutsAwayFromPointer, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.off(Phaser.Input.Events.POINTER_MOVE, this.moveCalloutsAwayFromPointer, this));
    this.renderBoard();
    this.publishState();
  }

  selectService(service: ServiceType): void {
    if (this.solutionRevealed) {
      this.status = "The solution has been revealed. Start a new practice board to play again.";
    } else if (this.remaining(service) === 0) {
      this.status = `No ${symbolLabel(service).toLowerCase()} symbols remain to place.`;
    } else if (this.selectedService === service) {
      this.selectedService = null;
      this.status = "Selection cleared.";
    } else {
      this.selectedService = service;
      this.status = `${symbolLabel(service)} selected. ${quotaInstruction(this.level.quotas[service], this.level.size)}`;
    }

    this.renderBoard();
    this.publishState();
  }

  undo(): void {
    this.placementMenuPosition = null;

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
      this.audio.playUndo();
    }

    this.renderBoard();
    this.publishState();
  }

  redo(): void {
    this.placementMenuPosition = null;

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
    this.placementMenuPosition = null;

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

  togglePlacementCandidates(): void {
    this.showPlacementCandidates = !this.showPlacementCandidates;
    this.status = this.showPlacementCandidates
      ? "Showing symbols that can be placed in each empty cell."
      : "Placement candidates hidden.";
    this.renderBoard();
    this.publishState();
  }

  toggleRequirementDisplay(): void {
    this.requirementsOnHover = !this.requirementsOnHover;
    this.status = this.requirementsOnHover
      ? "Requirement callouts now appear when you hover a district."
      : "Showing requirement callouts for every district.";
    this.renderBoard();
    this.publishState();
  }

  setSoundEffectsEnabled(enabled: boolean, announce = true): void {
    this.soundEffectsEnabled = enabled;
    this.audio.setEnabled(enabled);

    if (announce) {
      this.status = enabled ? "Sound effects enabled." : "Sound effects muted.";
    }

    this.publishState();
  }

  revealSolution(): void {
    this.placements = [...this.solution];
    this.history = [];
    this.future = [];
    this.selectedService = null;
    this.hint = null;
    this.hoveredCell = null;
    this.placementMenuPosition = null;
    this.showSolutionPreview = false;
    this.solutionRevealed = true;
    this.status = "Solution revealed. This practice board is complete.";
    this.renderBoard();
    this.publishState();
  }

  solveForLab(): void {
    this.placements = [...this.solution];
    this.history = [];
    this.future = [];
    this.selectedService = null;
    this.hint = null;
    this.hoveredCell = null;
    this.placementMenuPosition = null;
    this.showSolutionPreview = false;
    this.solutionRevealed = false;
    this.status = "Lab plan approved.";
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
        (placement) => !this.placements.some((current) => samePosition(current.position, placement.position)) && this.placementIssues(placement).length === 0,
      ) ?? null;
      this.status = this.hint
        ? `Hint: place a ${symbolLabel(this.hint.service).toLowerCase()} in the highlighted cell.`
        : "No compatible hint remains for this plan.";
    }

    this.renderBoard();
    this.publishState();
  }

  resolveSingles(): void {
    if (this.solutionRevealed) {
      this.status = "The solution has been revealed. Start a new practice board to play again.";
    } else if (this.showSolutionPreview) {
      this.status = "Release the solution preview before resolving singles.";
    } else {
      const single = this.nextSinglePlacement();

      if (single === null) {
        this.status = "No cells have exactly one available symbol.";
      } else {
        const previous = this.placements;
        this.commit([...this.placements, single]);
        this.selectedService = null;
        this.placementMenuPosition = null;
        this.status = `Placed the only available ${symbolLabel(single.service).toLowerCase()}.`;
        this.playPlacementSounds(previous, single, this.isComplete());
        this.renderBoard();
        this.publishState();
        return;
      }
    }

    this.renderBoard();
    this.publishState();
  }

  loadPuzzle(puzzle: JigsawPuzzle, placements: readonly ServicePlacement[] = puzzle.clues): void {
    this.puzzle = puzzle;
    this.placements = [...placements];
    this.history = [];
    this.future = [];
    this.selectedService = null;
    this.hint = null;
    this.placementMenuPosition = null;
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
      placementStack: this.placements.filter((placement) => !this.isClue(placement.position)),
      quotas: this.level.quotas,
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0,
      complete: this.isComplete(),
      solutionRevealed: this.solutionRevealed,
      showPlacementCandidates: this.showPlacementCandidates,
      requirementsOnHover: this.requirementsOnHover,
      soundEffectsEnabled: this.soundEffectsEnabled,
      title: this.puzzle.title,
      status: this.status,
    };
  }

  private renderBoard(): void {
    this.children.removeAll(true);
    this.calloutBounds = [];

    const boardMargin = Math.max(82, Math.round(Math.min(this.scale.width, this.scale.height) * 0.1));
    const boardPixels = Math.min(this.scale.width, this.scale.height) - boardMargin * 2;
    this.cellSize = Math.max(28, Math.floor(boardPixels / this.level.size));
    const boardSize = this.cellSize * this.level.size;
    this.boardLeft = Math.floor((this.scale.width - boardSize) / 2);
    this.boardTop = Math.floor((this.scale.height - boardSize) / 2);

    const displayedPlacements = this.showSolutionPreview ? this.solution : this.placements;
    const legalCells = this.selectedService && !this.showSolutionPreview
      ? new Set(this.legalPositions(this.selectedService).map(positionKey))
      : new Set<string>();

    this.add
      .text(this.boardLeft, Math.max(9, this.boardTop - 43), this.showSolutionPreview ? "REFERENCE PLAN" : this.puzzle.title.toUpperCase(), {
        fontFamily: "Avenir Next, Trebuchet MS, sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#4d6263",
        letterSpacing: 1.5,
      })
      .setOrigin(0, 0.5);
    this.renderBoardCoordinates();

    for (let row = 0; row < this.level.size; row += 1) {
      for (let column = 0; column < this.level.size; column += 1) {
        this.renderCell({ row, column }, legalCells);
      }
    }

    this.renderDistrictBorders();

    this.renderTunnelArches();

    this.renderPortalConnections();

    this.renderLandmarks(displayedPlacements);

    this.renderPreview();

    if (this.hint && !this.showSolutionPreview) {
      this.renderHint(this.hint);
    }

    this.renderSupplierLinks(displayedPlacements);

    this.renderPlacementCandidates();

    for (const placement of displayedPlacements) {
      this.renderService(placement, displayedPlacements);
    }

    this.renderDistrictRequirementCallouts(displayedPlacements);

    this.renderPlacementMenu();
  }

  private renderCell(position: Position, legalCells: ReadonlySet<string>): void {
    const { x, y } = this.cellOrigin(position);
    const region = this.level.regions[position.row]![position.column]!;
    const definition = regionDefinitionAt(this.level, position);
    const dead = definition.type === "dead";
    const landmark = landmarkAt(this.level, position);
    const fill = dead ? 0x7a817b : REGION_COLORS[(region.charCodeAt(0) - "A".charCodeAt(0)) % REGION_COLORS.length]!;
    const legal = legalCells.has(positionKey(position));
    const cell = this.add
      .rectangle(x + this.cellSize / 2, y + this.cellSize / 2, this.cellSize - 2, this.cellSize - 2, legal ? 0xbdf0b5 : fill)
      .setStrokeStyle(1, 0x53676a, 0.8);

    if (dead) {
      const hatch = this.add.graphics();
      hatch.lineStyle(1, 0xe5e1d7, 0.38);
      hatch.lineBetween(x + 7, y + this.cellSize - 7, x + this.cellSize - 7, y + 7);
      return;
    }

    if (definition.type === "normal" && definition.sanctuary) {
      cell.setStrokeStyle(3, 0x76539e, 0.9);
    }

    if (landmark) {
      return;
    }

    cell.setInteractive({ useHandCursor: true });
    cell.on("pointerdown", () => this.handleCellSelection(position));
    cell.on("pointerover", () => {
      if (this.placementMenuPosition !== null) {
        return;
      }

      this.hoveredCell = position;
      this.renderBoard();
    });
    cell.on("pointerout", () => {
      if (this.hoveredCell && samePosition(this.hoveredCell, position)) {
        this.hoveredCell = null;
        if (this.placementMenuPosition === null) {
          this.renderBoard();
        }
      }
    });
  }

  private renderBoardCoordinates(): void {
    const style = { fontFamily: "Avenir Next, Trebuchet MS, sans-serif", fontSize: `${Math.max(11, this.cellSize * 0.2)}px`, fontStyle: "bold", color: "#617174" };
    for (let column = 0; column < this.level.size; column += 1) {
      this.add.text(this.boardLeft + (column + 0.5) * this.cellSize, this.boardTop - 15, String.fromCharCode(65 + column), style).setOrigin(0.5);
    }
    for (let row = 0; row < this.level.size; row += 1) {
      this.add.text(this.boardLeft - 15, this.boardTop + (row + 0.5) * this.cellSize, String(row + 1), style).setOrigin(0.5);
    }
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

  private renderTunnelArches(): void {
    const regions = [...new Set(this.level.regions.flat())];

    for (const region of regions) {
      if (this.level.regionDefinitions[region]?.type !== "normal") {
        continue;
      }

      const components = regionComponents(this.level, region);

      if (components.length !== 2) {
        continue;
      }

      const [first, second] = closestTunnelCells(components[0]!, components[1]!);
      const start = this.cellCenter(first);
      const end = this.cellCenter(second);
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const distance = Math.hypot(deltaX, deltaY);
      const archHeight = Math.max(this.cellSize * 0.48, Math.min(distance * 0.28, this.cellSize * 1.3));
      const control = {
        x: (start.x + end.x) / 2 - (deltaY / distance) * archHeight,
        y: (start.y + end.y) / 2 + (deltaX / distance) * archHeight,
      };
      const color = REGION_COLORS[(region.charCodeAt(0) - "A".charCodeAt(0)) % REGION_COLORS.length]!;
      const arch = this.add.graphics();
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(start.x, start.y),
        new Phaser.Math.Vector2(control.x, control.y),
        new Phaser.Math.Vector2(end.x, end.y),
      );

      arch.lineStyle(Math.max(5, Math.round(this.cellSize * 0.085)), 0xf7f3e9, 0.9);
      curve.draw(arch, 24);
      arch.lineStyle(Math.max(2, Math.round(this.cellSize * 0.04)), color, 0.95);
      curve.draw(arch, 24);
      arch.fillStyle(0xf8f5ec, 1);
      arch.fillCircle(start.x, start.y, Math.max(5, this.cellSize * 0.12));
      arch.fillCircle(end.x, end.y, Math.max(5, this.cellSize * 0.12));
      arch.lineStyle(Math.max(2, Math.round(this.cellSize * 0.035)), color, 1);
      arch.strokeCircle(start.x, start.y, Math.max(5, this.cellSize * 0.12));
      arch.strokeCircle(end.x, end.y, Math.max(5, this.cellSize * 0.12));
    }
  }

  private renderPortalConnections(): void {
    for (const edge of interactionEdges(this.level).filter((candidate) => candidate.kind === "portal")) {
      const first = this.cellCenter(edge.first);
      const second = this.cellCenter(edge.second);
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(first.x, first.y),
        new Phaser.Math.Vector2((first.x + second.x) / 2, Math.min(first.y, second.y) - this.cellSize * 0.75),
        new Phaser.Math.Vector2(second.x, second.y),
      );
      const line = this.add.graphics();
      line.lineStyle(Math.max(3, this.cellSize * 0.05), 0x8065bb, 0.8);
      curve.draw(line, 20);
      line.fillStyle(0xf8f5ec, 1);
      line.fillCircle(first.x, first.y, Math.max(4, this.cellSize * 0.1));
      line.fillCircle(second.x, second.y, Math.max(4, this.cellSize * 0.1));
    }
  }

  private renderLandmarks(placements: readonly ServicePlacement[]): void {
    for (const landmark of this.level.landmarks ?? []) {
      const center = this.cellCenter(landmark.position);
      const radius = Math.max(8, this.cellSize * 0.19);
      const marker = this.add.circle(center.x, center.y, radius, 0xfffcf4, 0.96).setStrokeStyle(2, 0x30474a, 0.9);
      const label = landmark.type === "echo" ? "E" : landmark.type === "catalyst" ? "*" : landmark.type === "amplifier" ? "+" : "P";
      this.add.text(center.x, center.y, label, { fontFamily: "system-ui, sans-serif", fontSize: `${Math.max(11, this.cellSize * 0.24)}px`, fontStyle: "bold", color: landmark.type === "portal" ? "#76539e" : "#30474a" }).setOrigin(0.5).setDepth(marker.depth + 1);
      if (landmark.type === "echo") {
        identitiesAt(this.level, placements, landmark.position).forEach((identity, index) => this.renderSmallSymbol(identity.service, center.x + (index - 0.5) * radius * 1.15, center.y + radius * 0.95, Math.max(4, radius * 0.31), 0.72, 5));
      }
    }
  }

  private renderPreview(): void {
    const hoveredCell = this.hoveredCell;

    if (this.showSolutionPreview || !this.selectedService || !hoveredCell || this.placements.some((placement) => samePosition(placement.position, hoveredCell))) {
      return;
    }

    const candidate = this.createPlacement(hoveredCell);
    const valid = this.placementIssues(candidate).length === 0;
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
        .text(centerX, centerY, `HINT\n${symbolCode(placement.service)}`, {
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
    const inactive = !this.placementIsActive(displayedPlacements, placement);
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
        this.add.rectangle(centerX, centerY, symbolSize * 1.55, symbolSize * 1.55, SERVICE_COLORS.factory).setStrokeStyle(2, outline);
        break;
      case "twin":
        this.add.circle(centerX - symbolSize * 0.42, centerY, symbolSize * 0.58, SERVICE_COLORS.twin).setStrokeStyle(2, outline);
        this.add.circle(centerX + symbolSize * 0.42, centerY, symbolSize * 0.58, SERVICE_COLORS.twin).setStrokeStyle(2, outline);
        break;
    }

    if (inactive) {
      this.renderMissingRequirementSlash(centerX, centerY, symbolSize);
    }

    if (evaluatePlacements(this.level, displayedPlacements).amplified.has(placementKey(placement))) {
      this.add.text(centerX + symbolSize, centerY + symbolSize, "+", { fontFamily: "system-ui, sans-serif", fontSize: `${Math.max(12, symbolSize)}px`, fontStyle: "bold", color: "#30474a" }).setOrigin(0.5);
    }

    if (!this.showSolutionPreview && this.isClue(placement.position)) {
      this.renderClueLock(centerX, centerY, symbolSize);
    }
  }

  private renderClueLock(centerX: number, centerY: number, symbolSize: number): void {
    const badgeSize = Math.max(14, Math.round(this.cellSize * 0.24));
    const badgeX = centerX + symbolSize * 0.95;
    const badgeY = centerY - symbolSize * 0.95;
    const badge = this.add.circle(badgeX, badgeY, badgeSize / 2, 0xf8f5ec, 0.98).setStrokeStyle(1, 0x30474a, 0.9);
    const lock = this.add.graphics();
    const shackleRadius = badgeSize * 0.18;
    const bodyWidth = badgeSize * 0.38;
    const bodyHeight = badgeSize * 0.3;

    lock.lineStyle(1.5, 0x30474a, 1);
    lock.strokeCircle(badgeX, badgeY - badgeSize * 0.08, shackleRadius);
    lock.fillStyle(0x30474a, 1);
    lock.fillRect(badgeX - bodyWidth / 2, badgeY, bodyWidth, bodyHeight);
    badge.setDepth(10);
    lock.setDepth(11);
  }

  private flashLockedClue(position: Position): void {
    const { x, y } = this.cellOrigin(position);
    const flash = this.add.rectangle(x + this.cellSize / 2, y + this.cellSize / 2, this.cellSize - 4, this.cellSize - 4, 0xb33e3c, 0.38).setStrokeStyle(3, 0x8f2f2e, 0.9).setDepth(9);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 1_000,
      onComplete: () => flash.destroy(),
    });
  }

  private renderSupplierLinks(placements: readonly ServicePlacement[]): void {
    for (const link of this.supportLinks(placements)) {
      this.renderSupplierLink(link.dependent, link.supplier);
    }
  }

  private supportLinks(placements: readonly ServicePlacement[]): readonly SupportLink[] {
    const links: SupportLink[] = [];

    for (const placement of placements) {
      if (placement.service === "farm") {
        const supplier = supplyingDam(this.level, placements, placement);

        if (supplier) {
          links.push(createSupportLink(placement, supplier));
        }
      }

      if (placement.service === "factory") {
        const suppliers = factorySuppliers(this.level, placements, placement);

        if (suppliers.power) {
          links.push(createSupportLink(placement, suppliers.power));
        }

        if (suppliers.water) {
          links.push(createSupportLink(placement, suppliers.water));
        }
      }
    }

    return links;
  }

  private renderSupplierLink(dependent: ServicePlacement, supplier: ServicePlacement): void {
    const start = this.cellCenter(dependent.position);
    const end = this.cellCenter(supplier.position);
    const link = this.add.graphics();

    link.lineStyle(Math.max(4, Math.round(this.cellSize * 0.075)), SERVICE_COLORS[supplier.service], 0.62);
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

  private renderPlacementCandidates(): void {
    if (!this.showPlacementCandidates || this.showSolutionPreview) {
      return;
    }

    const symbolSize = Math.max(4, Math.round(this.cellSize * 0.07));
    const spread = Math.max(9, Math.round(this.cellSize * 0.15));

    for (let row = 0; row < this.level.size; row += 1) {
      for (let column = 0; column < this.level.size; column += 1) {
        const position = { row, column };

        if (regionDefinitionAt(this.level, position).type === "dead" || this.placements.some((placement) => samePosition(placement.position, position))) {
          continue;
        }

        const services = legalServicesAt(this.level, this.placements, position);
        const center = this.cellCenter(position);

        services.forEach((service, index) => {
          const offset = candidateOffset(services.length, index, spread);
          this.renderSmallSymbol(service, center.x + offset.x, center.y + offset.y, symbolSize, 0.62, 2);
        });
      }
    }
  }

  private renderDistrictRequirementCallouts(placements: readonly ServicePlacement[]): void {
    const callouts = this.requirementCallouts(placements);

    for (const callout of callouts) {
      const left = callout.centerX - callout.width / 2;
      const top = callout.centerY - callout.height / 2;
      const graphics = this.add.graphics().setDepth(6);
      const arrowStart = calloutArrowStart(callout);
      const wing = arrowWing(callout.side);

      graphics.lineStyle(1.5, 0x30474a, 0.82);
      graphics.lineBetween(arrowStart.x, arrowStart.y, callout.target.x, callout.target.y);
      graphics.fillStyle(0x30474a, 0.9);
      graphics.fillTriangle(callout.target.x, callout.target.y, callout.target.x + wing.x, callout.target.y + wing.y, callout.target.x - wing.x, callout.target.y - wing.y);
      graphics.fillStyle(0xfffcf4, 0.97);
      graphics.fillRoundedRect(left, top, callout.width, callout.height, callout.height / 2);
      graphics.lineStyle(1.5, 0x30474a, 0.9);
      graphics.strokeRoundedRect(left, top, callout.width, callout.height, callout.height / 2);

      const symbolSize = Math.max(5, Math.round(this.cellSize * 0.08));
      const spacing = symbolSize * 2.35;
      const startX = callout.centerX - ((callout.services.length - 1) * spacing) / 2;

      callout.services.forEach((service, index) => {
        this.renderSmallSymbol(service, startX + index * spacing, callout.centerY, symbolSize, 1, 7);
      });
    }

    this.calloutBounds = callouts.map((callout) => ({
      left: callout.centerX - callout.width / 2,
      top: callout.centerY - callout.height / 2,
      width: callout.width,
      height: callout.height,
    }));
  }

  private requirementCallouts(placements: readonly ServicePlacement[]): RequirementCallout[] {
    const hoveredRegion = this.hoveredCell === null ? null : this.level.regions[this.hoveredCell.row]![this.hoveredCell.column]!;
    const regions = this.requirementsOnHover
      ? hoveredRegion === null ? [] : [hoveredRegion]
      : [...new Set(this.level.regions.flat())];
    const pending = regions.flatMap((region) => {
      const unmet = unmetResourcesForRegion(this.level, placements, region);

      if (unmet.length === 0) {
        return [];
      }

      const services = unmet.map((resource) => RESOURCE_SYMBOLS[resource]);
      const side = this.calloutSide(region);
      const target = this.cellCenter(this.regionEdgeCell(region, side));
      const symbolSize = Math.max(5, Math.round(this.cellSize * 0.08));
      const width = Math.max(30, services.length * symbolSize * 2.5 + 12);
      const height = Math.max(25, symbolSize * 3.3 + 8);

      return [{ region, services, side, target, width, height, centerX: target.x, centerY: target.y }];
    });

    for (const side of ["top", "bottom", "left", "right"] as const) {
      const callouts = pending.filter((callout) => callout.side === side).sort((left, right) => (side === "top" || side === "bottom" ? left.target.x - right.target.x : left.target.y - right.target.y));
      let previousEnd = Number.NEGATIVE_INFINITY;

      for (const callout of callouts) {
        const horizontal = side === "top" || side === "bottom";
        const halfSize = (horizontal ? callout.width : callout.height) / 2;
        const minimum = horizontal ? this.boardLeft + halfSize + 3 : this.boardTop + halfSize + 3;
        const maximum = horizontal
          ? this.boardLeft + this.cellSize * this.level.size - halfSize - 3
          : this.boardTop + this.cellSize * this.level.size - halfSize - 3;
        const targetCoordinate = horizontal ? callout.target.x : callout.target.y;
        const coordinate = Phaser.Math.Clamp(Math.max(targetCoordinate, previousEnd + halfSize + 5), minimum, maximum);

        if (horizontal) {
          callout.centerX = coordinate;
          callout.centerY = side === "top" ? this.boardTop - callout.height / 2 - 9 : this.boardTop + this.cellSize * this.level.size + callout.height / 2 + 9;
        } else {
          callout.centerX = side === "left" ? this.boardLeft - callout.width / 2 - 9 : this.boardLeft + this.cellSize * this.level.size + callout.width / 2 + 9;
          callout.centerY = coordinate;
        }

        previousEnd = coordinate + halfSize;
      }
    }

    this.moveCalloutsAwayFrom(this.input.activePointer, pending);

    return pending;
  }

  private moveCalloutsAwayFromPointer(pointer: Phaser.Input.Pointer): void {
    if (this.calloutBounds.some((bounds) => pointIsNearBounds(pointer.x, pointer.y, bounds))) {
      this.renderBoard();
    }
  }

  private moveCalloutsAwayFrom(pointer: Phaser.Input.Pointer, callouts: readonly RequirementCallout[]): void {
    const gap = 14;

    for (const callout of callouts) {
      const bounds = {
        left: callout.centerX - callout.width / 2,
        top: callout.centerY - callout.height / 2,
        width: callout.width,
        height: callout.height,
      };

      if (!pointIsNearBounds(pointer.x, pointer.y, bounds)) {
        continue;
      }

      switch (callout.side) {
        case "top":
          callout.centerY = Math.max(callout.height / 2 + 6, Math.min(callout.centerY, pointer.y - callout.height / 2 - gap));
          break;
        case "bottom":
          callout.centerY = Math.min(this.scale.height - callout.height / 2 - 6, Math.max(callout.centerY, pointer.y + callout.height / 2 + gap));
          break;
        case "left":
          callout.centerX = Math.max(callout.width / 2 + 6, Math.min(callout.centerX, pointer.x - callout.width / 2 - gap));
          break;
        case "right":
          callout.centerX = Math.min(this.scale.width - callout.width / 2 - 6, Math.max(callout.centerX, pointer.x + callout.width / 2 + gap));
          break;
      }
    }
  }

  private calloutSide(region: string): CalloutSide {
    const cells = this.regionCells(region);
    const minimumRow = Math.min(...cells.map((cell) => cell.row));
    const maximumRow = Math.max(...cells.map((cell) => cell.row));
    const minimumColumn = Math.min(...cells.map((cell) => cell.column));
    const maximumColumn = Math.max(...cells.map((cell) => cell.column));
    const candidates: readonly { readonly side: CalloutSide; readonly distance: number }[] = [
      { side: "top", distance: minimumRow },
      { side: "bottom", distance: this.level.size - 1 - maximumRow },
      { side: "left", distance: minimumColumn },
      { side: "right", distance: this.level.size - 1 - maximumColumn },
    ];

    return candidates.reduce((closest, candidate) => candidate.distance < closest.distance ? candidate : closest).side;
  }

  private regionEdgeCell(region: string, side: CalloutSide): Position {
    const cells = this.regionCells(region);
    const edge = side === "top"
      ? Math.min(...cells.map((cell) => cell.row))
      : side === "bottom"
        ? Math.max(...cells.map((cell) => cell.row))
        : side === "left"
          ? Math.min(...cells.map((cell) => cell.column))
          : Math.max(...cells.map((cell) => cell.column));
    const edgeCells = cells.filter((cell) => side === "top" || side === "bottom" ? cell.row === edge : cell.column === edge);

    return edgeCells[Math.floor(edgeCells.length / 2)]!;
  }

  private regionCells(region: string): Position[] {
    const cells: Position[] = [];

    for (let row = 0; row < this.level.size; row += 1) {
      for (let column = 0; column < this.level.size; column += 1) {
        if (this.level.regions[row]![column] === region) {
          cells.push({ row, column });
        }
      }
    }

    return cells;
  }

  private renderSmallSymbol(service: ServiceType, centerX: number, centerY: number, symbolSize: number, alpha: number, depth: number): void {
    const outline = 0x30474a;

    switch (service) {
      case "generator":
        this.add.circle(centerX, centerY, symbolSize, SERVICE_COLORS.generator).setStrokeStyle(1, outline).setAlpha(alpha).setDepth(depth);
        break;
      case "water":
        this.add.rectangle(centerX, centerY, symbolSize * 1.4, symbolSize * 1.4, SERVICE_COLORS.water).setRotation(Math.PI / 4).setStrokeStyle(1, outline).setAlpha(alpha).setDepth(depth);
        break;
      case "farm":
        {
          const triangle = this.add.graphics().setAlpha(alpha).setDepth(depth);
          triangle.fillStyle(SERVICE_COLORS.farm);
          triangle.lineStyle(1, outline);
          triangle.fillTriangle(centerX, centerY - symbolSize, centerX + symbolSize, centerY + symbolSize, centerX - symbolSize, centerY + symbolSize);
          triangle.strokeTriangle(centerX, centerY - symbolSize, centerX + symbolSize, centerY + symbolSize, centerX - symbolSize, centerY + symbolSize);
        }
        break;
      case "factory":
        this.add.rectangle(centerX, centerY, symbolSize * 1.55, symbolSize * 1.55, SERVICE_COLORS.factory).setStrokeStyle(1, outline).setAlpha(alpha).setDepth(depth);
        break;
      case "twin":
        this.add.circle(centerX - symbolSize * 0.4, centerY, symbolSize * 0.55, SERVICE_COLORS.twin).setStrokeStyle(1, outline).setAlpha(alpha).setDepth(depth);
        this.add.circle(centerX + symbolSize * 0.4, centerY, symbolSize * 0.55, SERVICE_COLORS.twin).setStrokeStyle(1, outline).setAlpha(alpha).setDepth(depth);
        break;
    }
  }

  private renderPlacementMenu(): void {
    const position = this.placementMenuPosition;

    if (position === null) {
      return;
    }

    const services = legalServicesAt(this.level, this.placements, position);

    if (services.length === 0) {
      return;
    }

    const { optionSize, menuWidth, menuHeight, left, top } = this.placementMenuLayout(position, services);

    this.add.rectangle(left + menuWidth / 2, top + menuHeight / 2, menuWidth, menuHeight, 0xf8f5ec, 0.98).setStrokeStyle(2, 0x30474a, 0.95).setDepth(20);

    services.forEach((service, index) => {
      const centerX = left + 6 + optionSize * index + optionSize / 2;
      const centerY = top + menuHeight / 2;
      const option = this.add.rectangle(centerX, centerY, optionSize - 4, optionSize - 4, 0xfffdf7, 1).setStrokeStyle(1, SERVICE_COLORS[service], 0.7).setDepth(21).setInteractive({ useHandCursor: true });
      this.renderPlacementMenuSymbol(service, centerX, centerY, Math.max(7, optionSize * 0.24));
      option.on("pointerdown", () => this.placeServiceFromMenu(position, service));
    });
  }

  private renderPlacementMenuSymbol(service: ServiceType, centerX: number, centerY: number, symbolSize: number): void {
    switch (service) {
      case "generator":
        this.add.circle(centerX, centerY, symbolSize, SERVICE_COLORS.generator).setStrokeStyle(1, 0x30474a).setDepth(22);
        break;
      case "water":
        this.add.rectangle(centerX, centerY, symbolSize * 1.4, symbolSize * 1.4, SERVICE_COLORS.water).setRotation(Math.PI / 4).setStrokeStyle(1, 0x30474a).setDepth(22);
        break;
      case "farm":
        {
          const triangle = this.add.graphics().setDepth(22);
          triangle.fillStyle(SERVICE_COLORS.farm);
          triangle.lineStyle(1, 0x30474a);
          triangle.fillTriangle(centerX, centerY - symbolSize, centerX + symbolSize, centerY + symbolSize, centerX - symbolSize, centerY + symbolSize);
          triangle.strokeTriangle(centerX, centerY - symbolSize, centerX + symbolSize, centerY + symbolSize, centerX - symbolSize, centerY + symbolSize);
        }
        break;
      case "factory":
        this.add.rectangle(centerX, centerY, symbolSize * 1.55, symbolSize * 1.55, SERVICE_COLORS.factory).setStrokeStyle(1, 0x30474a).setDepth(22);
        break;
      case "twin":
        this.add.circle(centerX - symbolSize * 0.4, centerY, symbolSize * 0.55, SERVICE_COLORS.twin).setStrokeStyle(1, 0x30474a).setDepth(22);
        this.add.circle(centerX + symbolSize * 0.4, centerY, symbolSize * 0.55, SERVICE_COLORS.twin).setStrokeStyle(1, 0x30474a).setDepth(22);
        break;
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
    let clickedLockedClue = false;

    if (existingIndex >= 0 && this.isClue(position)) {
      this.status = "That starting clue is fixed.";
      clickedLockedClue = true;
    } else if (existingIndex >= 0) {
      this.removePlacement(position);
      return;
    } else {
      this.openPlacementMenu(position);
    }

    this.renderBoard();

    if (clickedLockedClue) {
      this.flashLockedClue(position);
    }

    this.publishState();
  }

  removePlacement(position: Position): void {
    this.placementMenuPosition = null;
    const existingIndex = this.placements.findIndex((placement) => samePosition(placement.position, position));
    if (this.solutionRevealed) {
      this.status = "The solution has been revealed. Start a new practice board to play again.";
    } else if (existingIndex < 0) {
      this.status = "That symbol is no longer on the board.";
    } else if (this.isClue(position)) {
      this.status = "That starting clue is fixed.";
    } else {
      this.commit(this.placements.filter((_, index) => index !== existingIndex));
      this.status = "Symbol removed.";
      this.audio.playRemoval();
    }
    this.renderBoard();
    this.publishState();
  }

  private dismissPlacementMenuOutsideBoard(pointer: Phaser.Input.Pointer): void {
    if (this.placementMenuPosition === null || this.isOnBoard(pointer.x, pointer.y) || this.isInPlacementMenu(pointer.x, pointer.y)) {
      return;
    }

    this.placementMenuPosition = null;
    this.hoveredCell = null;
    this.status = "Placement choice dismissed.";
    this.renderBoard();
    this.publishState();
  }

  private createPlacement(position: Position): ServicePlacement {
    return { service: this.selectedService!, position };
  }

  private canPlaceServiceAt(position: Position, service: ServiceType): boolean {
    return legalServicesAt(this.level, this.placements, position).includes(service);
  }

  private openPlacementMenu(position: Position): void {
    this.selectedService = null;
    this.placementMenuPosition = legalServicesAt(this.level, this.placements, position).length > 0 ? position : null;
    this.status = this.placementMenuPosition === null
      ? "No symbols can be placed in that cell."
      : "Choose a symbol for this cell.";
  }

  private placeServiceFromMenu(position: Position, service: ServiceType): void {
    if (!this.canPlaceServiceAt(position, service)) {
      this.placementMenuPosition = null;
      this.status = "That placement is no longer available.";
      this.renderBoard();
      this.publishState();
      return;
    }

    const previous = this.placements;
    const candidate = { service, position };
    this.commit([...this.placements, candidate]);
    this.placementMenuPosition = null;
    const remainingFarms = this.placements.filter((placement) => placement.service === "farm" && !this.farmIsSupplied(this.placements, placement)).length;
    const inactiveFactoryCount = inactiveFactories(this.level, this.placements).length;
    const inactive = !this.placementIsActive(this.placements, candidate);
    const complete = this.isComplete();
    this.status = complete
      ? "Chord complete."
      : this.placements.length === totalInventory(this.level.quotas) && remainingFarms > 0
        ? `${remainingFarms} triangle${remainingFarms === 1 ? "" : "s"} still need an adjacent diamond.`
        : this.placements.length === totalInventory(this.level.quotas) && inactiveFactoryCount > 0
          ? `${inactiveFactoryCount} square${inactiveFactoryCount === 1 ? "" : "s"} still need adjacent circle and diamond.`
          : inactive
            ? `${symbolLabel(candidate.service)} placed but inactive until its support requirements are met.`
            : `${symbolLabel(candidate.service)} placed.`;
    this.playPlacementSounds(previous, candidate, complete);
    this.renderBoard();
    this.publishState();
  }

  private placementIssues(candidate: ServicePlacement): readonly PlacementIssue[] {
    return validatePlacement(this.level, this.placements, candidate);
  }

  private farmIsSupplied(placements: readonly ServicePlacement[], farm: ServicePlacement): boolean {
    return isFarmSupplied(this.level, placements, farm);
  }

  private placementIsActive(placements: readonly ServicePlacement[], placement: ServicePlacement): boolean {
    return isPlacementActive(this.level, placements, placement);
  }

  private playPlacementSounds(previous: readonly ServicePlacement[], placement: ServicePlacement, complete: boolean): void {
    this.audio.playPlacement(placement.service);

    const previousLinkKeys = new Set(this.supportLinks(previous).map((link) => link.key));
    const currentLinks = this.supportLinks(this.placements);
    const addedLinks = currentLinks.filter((link) => !previousLinkKeys.has(link.key));
    const activatesPlacedSymbol = (placement.service === "farm" || placement.service === "factory") && this.placementIsActive(this.placements, placement);
    const activatesExistingSymbol = previous.some((current) => !this.placementIsActive(previous, current) && this.placementIsActive(this.placements, current));

    if (addedLinks.length > 0) {
      this.audio.playConnectionChain(this.connectedChain(placement, currentLinks).map((current) => current.service));
    } else if (activatesPlacedSymbol || activatesExistingSymbol) {
      this.audio.playActivation();
    }

    if (complete) {
      this.audio.playCompletion();
    }
  }

  private connectedChain(start: ServicePlacement, links: readonly SupportLink[]): readonly ServicePlacement[] {
    const placements = new Map<string, ServicePlacement>();
    const neighbours = new Map<string, string[]>();

    for (const link of links) {
      const dependentKey = placementKey(link.dependent);
      const supplierKey = placementKey(link.supplier);
      placements.set(dependentKey, link.dependent);
      placements.set(supplierKey, link.supplier);
      const dependentNeighbours = neighbours.get(dependentKey) ?? [];
      const supplierNeighbours = neighbours.get(supplierKey) ?? [];
      dependentNeighbours.push(supplierKey);
      supplierNeighbours.push(dependentKey);
      neighbours.set(dependentKey, dependentNeighbours);
      neighbours.set(supplierKey, supplierNeighbours);
    }

    const startKey = placementKey(start);
    const visited = new Set<string>([startKey]);
    const queue = [startKey];
    const chain: ServicePlacement[] = [];

    while (queue.length > 0) {
      const currentKey = queue.shift()!;
      const placement = placements.get(currentKey);

      if (placement) {
        chain.push(placement);
      }

      for (const neighbour of neighbours.get(currentKey) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    return chain;
  }

  private isComplete(): boolean {
    return isLevelComplete(this.level, this.placements);
  }

  private legalPositions(service: ServiceType): Position[] {
    const positions: Position[] = [];

    for (let row = 0; row < this.level.size; row += 1) {
      for (let column = 0; column < this.level.size; column += 1) {
        const candidate: ServicePlacement = { service, position: { row, column } };

        if (this.placementIssues(candidate).length === 0) {
          positions.push(candidate.position);
        }
      }
    }

    return positions;
  }

  private nextSinglePlacement(): ServicePlacement | null {
    for (let row = 0; row < this.level.size; row += 1) {
      for (let column = 0; column < this.level.size; column += 1) {
        const position = { row, column };

        if (this.placements.some((placement) => samePosition(placement.position, position))) {
          continue;
        }

        const services = legalServicesAt(this.level, this.placements, position);

        if (services.length === 1) {
          return { service: services[0]!, position };
        }
      }
    }

    return null;
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

  private isOnBoard(x: number, y: number): boolean {
    const boardSize = this.cellSize * this.level.size;
    return x >= this.boardLeft && x <= this.boardLeft + boardSize && y >= this.boardTop && y <= this.boardTop + boardSize;
  }

  private isInPlacementMenu(x: number, y: number): boolean {
    const position = this.placementMenuPosition;

    if (position === null) {
      return false;
    }

    const services = legalServicesAt(this.level, this.placements, position);

    if (services.length === 0) {
      return false;
    }

    const { left, top, menuWidth, menuHeight } = this.placementMenuLayout(position, services);
    return x >= left && x <= left + menuWidth && y >= top && y <= top + menuHeight;
  }

  private placementMenuLayout(position: Position, services: readonly ServiceType[]): Readonly<{ optionSize: number; menuWidth: number; menuHeight: number; left: number; top: number }> {
    const optionSize = Math.max(36, Math.round(this.cellSize * 0.6));
    const menuWidth = services.length * optionSize + 12;
    const menuHeight = optionSize + 12;
    const cell = this.cellCenter(position);

    return {
      optionSize,
      menuWidth,
      menuHeight,
      left: Phaser.Math.Clamp(cell.x - menuWidth / 2, 8, this.scale.width - menuWidth - 8),
      top: Phaser.Math.Clamp(cell.y - menuHeight / 2, 8, this.scale.height - menuHeight - 8),
    };
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

function candidateOffset(count: number, index: number, spread: number): Readonly<{ x: number; y: number }> {
  if (count === 1) {
    return { x: 0, y: 0 };
  }

  if (count === 2) {
    return { x: index === 0 ? -spread / 2 : spread / 2, y: 0 };
  }

  if (count === 3) {
    return [
      { x: 0, y: -spread / 2 },
      { x: -spread / 2, y: spread / 2 },
      { x: spread / 2, y: spread / 2 },
    ][index]!;
  }

  return [
    { x: -spread / 2, y: -spread / 2 },
    { x: spread / 2, y: -spread / 2 },
    { x: -spread / 2, y: spread / 2 },
    { x: spread / 2, y: spread / 2 },
  ][index]!;
}

function calloutArrowStart(callout: RequirementCallout): Readonly<{ x: number; y: number }> {
  switch (callout.side) {
    case "top":
      return { x: callout.centerX, y: callout.centerY + callout.height / 2 };
    case "bottom":
      return { x: callout.centerX, y: callout.centerY - callout.height / 2 };
    case "left":
      return { x: callout.centerX + callout.width / 2, y: callout.centerY };
    case "right":
      return { x: callout.centerX - callout.width / 2, y: callout.centerY };
  }
}

function arrowWing(side: CalloutSide): Readonly<{ x: number; y: number }> {
  return side === "top" || side === "bottom" ? { x: 4, y: 0 } : { x: 0, y: 4 };
}

function pointIsNearBounds(x: number, y: number, bounds: CalloutBounds, padding = 10): boolean {
  return x >= bounds.left - padding
    && x <= bounds.left + bounds.width + padding
    && y >= bounds.top - padding
    && y <= bounds.top + bounds.height + padding;
}

function positionKey(position: Position): string {
  return `${position.row}:${position.column}`;
}

function placementKey(placement: ServicePlacement): string {
  return `${placement.service}:${positionKey(placement.position)}`;
}

function createSupportLink(dependent: ServicePlacement, supplier: ServicePlacement): SupportLink {
  return { dependent, supplier, key: `${placementKey(dependent)}>${placementKey(supplier)}` };
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

function symbolLabel(service: ServiceType): string {
  switch (service) {
    case "generator":
      return "Circle";
    case "water":
      return "Diamond";
    case "farm":
      return "Triangle";
    case "factory":
      return "Square";
    case "twin":
      return "Twin";
  }
}

function symbolCode(service: ServiceType): string {
  switch (service) {
    case "generator":
      return "CIR";
    case "water":
      return "DIA";
    case "farm":
      return "TRI";
    case "factory":
      return "SQR";
    case "twin":
      return "TWN";
  }
}

function totalInventory(quotas: Readonly<Record<ServiceType, ServiceQuota>>): number {
  return SERVICE_TYPES.reduce((total, service) => total + quotas[service].total, 0);
}

function quotaInstruction(quota: ServiceQuota, size: number): string {
  return quota.total === size && quota.maxPerRow === 1 && quota.maxPerColumn === 1 && quota.maxPerRegion === 1
    ? "Place one in every row, column, and region."
    : `Place ${quota.total} in separate rows, columns, and regions.`;
}

function placementMessage(issue: ReturnType<typeof validatePlacement>[number]): string {
  switch (issue) {
    case "out-of-bounds":
      return "That cell is outside the grid.";
    case "dead-region":
      return "Dead terrain cannot hold a symbol.";
    case "landmark-cell":
      return "That landmark occupies this cell.";
    case "occupied-cell":
      return "Only one symbol may occupy a cell.";
    case "inventory-exhausted":
      return "No more of that symbol may be placed.";
    case "row-conflict":
      return "That row already has this symbol.";
    case "column-conflict":
      return "That column already has this symbol.";
    case "region-conflict":
      return "That region already has this symbol.";
    case "generator-water-conflict":
      return "Circle and Diamond cannot share an edge.";
    case "factory-steel-demand-missing":
      return "Square may only be placed in a region that requires Square.";
  }
}

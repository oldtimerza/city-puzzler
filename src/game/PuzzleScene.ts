import Phaser from "phaser";

import { BUILDINGS, getBuildingEffects } from "../core/buildings.js";
import { calculateResidual, evaluateField, isInBounds } from "../core/field.js";
import { isPuzzleComplete, validatePlacement } from "../core/puzzle.js";
import type { BuildingKind, Direction, Placement, Position, ResourceVector } from "../core/types.js";
import { STARTER_PUZZLE, STARTER_SOLUTION } from "../content/starter-puzzle.js";

const BUILDING_ORDER: readonly BuildingKind[] = ["solar", "park", "greenhouse", "battery", "relay"];
const DIRECTIONS: readonly Direction[] = ["north", "east", "south", "west"];

const BUILDING_COLORS: Readonly<Record<BuildingKind, number>> = {
  solar: 0xf3b43f,
  park: 0x4fba75,
  greenhouse: 0x7ecf8c,
  battery: 0xca6670,
  relay: 0x8295ff,
};

export interface PuzzleViewState {
  readonly selectedBuilding: BuildingKind | null;
  readonly placements: readonly Placement[];
  readonly orientation: Direction;
  readonly showResidual: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly complete: boolean;
  readonly status: string;
}

export class PuzzleScene extends Phaser.Scene {
  static readonly KEY = "PuzzleScene";

  private placements: Placement[] = [];
  private history: Placement[][] = [];
  private future: Placement[][] = [];
  private selectedBuilding: BuildingKind | null = null;
  private orientation: Direction = "east";
  private showResidual = false;
  private showSolutionPreview = false;
  private hoveredCell: Position | null = null;
  private status = "Select a building, then choose a grid cell.";
  private boardLeft = 0;
  private boardTop = 0;
  private cellSize = 0;

  constructor() {
    super(PuzzleScene.KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#101a2d");
    this.scale.on(Phaser.Scale.Events.RESIZE, this.renderBoard, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.renderBoard, this));
    this.renderBoard();
    this.publishState();
  }

  selectBuilding(building: BuildingKind): void {
    if (this.remaining(building) === 0) {
      this.status = `All ${BUILDINGS[building].label.toLowerCase()} pieces are already placed.`;
    } else if (this.selectedBuilding === building) {
      this.selectedBuilding = null;
      this.status = "Selection cleared.";
    } else {
      this.selectedBuilding = building;
      this.status = `${BUILDINGS[building].label} selected. Set its orientation, then choose a grid cell.`;
    }

    this.renderBoard();
    this.publishState();
  }

  rotateSelectedBuilding(): void {
    if (!this.selectedBuilding) {
      this.status = "Select a building before rotating it.";
      this.publishState();
      return;
    }

    const index = DIRECTIONS.indexOf(this.orientation);
    this.orientation = DIRECTIONS[(index + 1) % DIRECTIONS.length]!;
    this.status = `${BUILDINGS[this.selectedBuilding].label} now faces ${this.orientation}.`;
    this.renderBoard();
    this.publishState();
  }

  toggleDisplay(): void {
    this.showResidual = !this.showResidual;
    this.status = this.showResidual ? "Showing remaining demand. Negative values are excess." : "Showing target values.";
    this.renderBoard();
    this.publishState();
  }

  undo(): void {
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
    if (this.placements.length === 0) {
      this.status = "The board is already clear.";
    } else {
      this.commit([]);
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

  getViewState(): PuzzleViewState {
    return {
      selectedBuilding: this.selectedBuilding,
      placements: this.placements,
      orientation: this.orientation,
      showResidual: this.showResidual,
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0,
      complete: isPuzzleComplete(STARTER_PUZZLE, this.placements),
      status: this.status,
    };
  }

  private renderBoard(): void {
    this.children.removeAll(true);

    const boardPixels = Math.min(this.scale.width, this.scale.height) - 24;
    this.cellSize = Math.max(42, Math.floor(boardPixels / STARTER_PUZZLE.board.size));
    const actualBoardPixels = this.cellSize * STARTER_PUZZLE.board.size;
    this.boardLeft = Math.floor((this.scale.width - actualBoardPixels) / 2);
    this.boardTop = Math.floor((this.scale.height - actualBoardPixels) / 2);

    const displayedPlacements = this.showSolutionPreview ? STARTER_SOLUTION : this.placements;
    const current = evaluateField(STARTER_PUZZLE.board, displayedPlacements);
    const values = this.showResidual ? calculateResidual(STARTER_PUZZLE.target, current) : STARTER_PUZZLE.target;

    this.add
      .text(this.boardLeft, Math.max(8, this.boardTop - 24), this.showSolutionPreview ? "SOLUTION PREVIEW" : this.showResidual ? "REMAINING DEMAND" : "TARGET FIELD", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#b8c9e8",
        letterSpacing: 1.5,
      })
      .setOrigin(0, 0.5);

    for (let row = 0; row < STARTER_PUZZLE.board.size; row += 1) {
      for (let column = 0; column < STARTER_PUZZLE.board.size; column += 1) {
        this.renderCell({ row, column }, values[row]![column]!);
      }
    }

    this.renderPreview();

    for (const placement of displayedPlacements) {
      this.renderBuilding(placement);
    }

    if (isPuzzleComplete(STARTER_PUZZLE, this.placements)) {
      this.renderCompletionBanner();
    }
  }

  private renderCell(position: Position, value: ResourceVector): void {
    const { x, y } = this.cellOrigin(position);
    const color = this.cellColor(value);
    const cell = this.add.rectangle(x + this.cellSize / 2, y + this.cellSize / 2, this.cellSize - 4, this.cellSize - 4, color).setStrokeStyle(1, 0x49627f);

    cell.setInteractive({ useHandCursor: true });
    cell.on("pointerdown", () => this.handleCellSelection(position));
    cell.on("pointerover", () => {
      this.hoveredCell = position;
      this.renderBoard();
    });
    cell.on("pointerout", () => {
      if (this.hoveredCell && this.samePosition(this.hoveredCell, position)) {
        this.hoveredCell = null;
        this.renderBoard();
      }
    });

    this.add
      .text(x + 9, y + 9, `E ${formatValue(value.electricity)}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${Math.max(11, Math.round(this.cellSize * 0.15))}px`,
        fontStyle: "bold",
        color: "#f7c85a",
      })
      .setOrigin(0, 0);
    this.add
      .text(x + 9, y + this.cellSize - 9, `N ${formatValue(value.nature)}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${Math.max(11, Math.round(this.cellSize * 0.15))}px`,
        fontStyle: "bold",
        color: "#77d89a",
      })
      .setOrigin(0, 1);
  }

  private renderPreview(): void {
    const hoveredCell = this.hoveredCell;

    if (this.showSolutionPreview || !this.selectedBuilding || !hoveredCell || this.placements.some((placement) => this.samePosition(placement.position, hoveredCell))) {
      return;
    }

    const candidate = this.createPlacement(hoveredCell);
    const valid = validatePlacement(STARTER_PUZZLE, this.placements, candidate).length === 0;
    const changes = new Map<string, ResourceVector>();

    for (const effect of getBuildingEffects(candidate.building, candidate.orientation)) {
      const position = { row: candidate.position.row + effect.offset.row, column: candidate.position.column + effect.offset.column };

      if (!isInBounds(STARTER_PUZZLE.board, position)) {
        continue;
      }

      const key = `${position.row}:${position.column}`;
      const existing = changes.get(key) ?? { electricity: 0, nature: 0 };
      existing[effect.resource] += effect.amount;
      changes.set(key, existing);
    }

    for (const [key, change] of changes) {
      const [row, column] = key.split(":").map(Number);
      const { x, y } = this.cellOrigin({ row: row!, column: column! });
      const overlay = this.add.rectangle(
        x + this.cellSize / 2,
        y + this.cellSize / 2,
        this.cellSize - 14,
        this.cellSize - 14,
        valid ? 0x9ad7ad : 0xdc6d75,
        0.28,
      );
      overlay.setStrokeStyle(2, valid ? 0xa9f2bf : 0xffa5ac, 0.7);

      const labels = [change.electricity && `E${signedValue(change.electricity)}`, change.nature && `N${signedValue(change.nature)}`]
        .filter(Boolean)
        .join(" ");
      this.add
        .text(x + this.cellSize / 2, y + this.cellSize / 2, labels, {
          fontFamily: "system-ui, sans-serif",
          fontSize: `${Math.max(11, Math.round(this.cellSize * 0.14))}px`,
          fontStyle: "bold",
          color: valid ? "#e2ffe9" : "#ffe2e4",
        })
        .setOrigin(0.5);
    }
  }

  private renderBuilding(placement: Placement): void {
    const { x, y } = this.cellOrigin(placement.position);
    const color = BUILDING_COLORS[placement.building];
    const horizontal = placement.orientation === "east" || placement.orientation === "west";
    const width = this.cellSize * (horizontal ? 0.63 : 0.36);
    const height = this.cellSize * (horizontal ? 0.36 : 0.63);
    const centerX = x + this.cellSize / 2;
    const centerY = y + this.cellSize / 2;

    this.add.rectangle(centerX, centerY, width, height, color).setStrokeStyle(2, 0xffffff, 0.45);
    const markerOffset = this.cellSize * 0.15;
    const marker = markerPosition(centerX, centerY, markerOffset, placement.orientation);
    this.add.circle(marker.x, marker.y, Math.max(3, this.cellSize * 0.045), 0x132033);
    this.add
      .text(centerX, centerY, placement.building === "relay" ? arrowFor(placement.orientation) : labelFor(placement.building), {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${Math.max(12, Math.round(this.cellSize * 0.18))}px`,
        fontStyle: "bold",
        color: "#132033",
      })
      .setOrigin(0.5);
  }

  private renderCompletionBanner(): void {
    const width = Math.min(this.scale.width - 32, 420);
    const banner = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, width, 84, 0x1f6d58, 0.96).setStrokeStyle(2, 0xa9f2bf);
    banner.setDepth(10);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 12, "FIELD RESTORED", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        fontStyle: "bold",
        color: "#f2fff5",
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 17, "Every resource matches its target.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#d4f7de",
      })
      .setOrigin(0.5)
      .setDepth(11);
  }

  private handleCellSelection(position: Position): void {
    if (this.showSolutionPreview) {
      return;
    }

    const existingIndex = this.placements.findIndex((placement) => this.samePosition(placement.position, position));

    if (existingIndex >= 0) {
      this.commit(this.placements.filter((_, index) => index !== existingIndex));
      this.status = "Building removed.";
    } else if (!this.selectedBuilding) {
      this.status = "Select a building before placing it.";
    } else {
      const candidate = this.createPlacement(position);
      const issues = validatePlacement(STARTER_PUZZLE, this.placements, candidate);

      if (issues.length > 0) {
        this.status = placementMessage(issues[0]!);
      } else {
        this.commit([...this.placements, candidate]);
        this.status = isPuzzleComplete(STARTER_PUZZLE, this.placements) ? "City balanced. Field restored." : `${BUILDINGS[candidate.building].label} placed.`;

        if (this.remaining(candidate.building) === 0) {
          this.selectedBuilding = null;
        }
      }
    }

    this.renderBoard();
    this.publishState();
  }

  private createPlacement(position: Position): Placement {
    return { building: this.selectedBuilding!, position, orientation: this.orientation };
  }

  private commit(next: Placement[]): void {
    this.history.push(this.placements);
    this.placements = next;
    this.future = [];
  }

  private remaining(building: BuildingKind): number {
    return STARTER_PUZZLE.inventory[building] - this.placements.filter((placement) => placement.building === building).length;
  }

  private cellOrigin(position: Position): { x: number; y: number } {
    return { x: this.boardLeft + position.column * this.cellSize, y: this.boardTop + position.row * this.cellSize };
  }

  private cellColor(value: ResourceVector): number {
    if (!this.showResidual) {
      return 0x1b2a43;
    }

    if (value.electricity === 0 && value.nature === 0) {
      return 0x1d4c42;
    }

    if (value.electricity < 0 || value.nature < 0) {
      return 0x482435;
    }

    return 0x1b2a43;
  }

  private samePosition(left: Position, right: Position): boolean {
    return left.row === right.row && left.column === right.column;
  }

  private publishState(): void {
    this.events.emit("statechange", this.getViewState());
  }
}

function formatValue(value: number): string {
  return value > 0 ? `${value}` : `${value}`;
}

function signedValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function labelFor(building: BuildingKind): string {
  switch (building) {
    case "solar":
      return "SOL";
    case "park":
      return "PRK";
    case "greenhouse":
      return "GRN";
    case "battery":
      return "BAT";
    case "relay":
      return "RLY";
  }
}

function arrowFor(direction: Direction): string {
  switch (direction) {
    case "north":
      return "^";
    case "east":
      return ">";
    case "south":
      return "v";
    case "west":
      return "<";
  }
}

function placementMessage(issue: ReturnType<typeof validatePlacement>[number]): string {
  switch (issue) {
    case "out-of-bounds":
      return "That cell is outside the board.";
    case "blocked-cell":
      return "That terrain cannot hold a building.";
    case "occupied-cell":
      return "Only one building may occupy a cell.";
    case "inventory-exhausted":
      return "That building has no remaining pieces.";
    case "missing-orientation":
      return "Choose a building orientation before placing it.";
  }
}

function markerPosition(centerX: number, centerY: number, offset: number, direction: Direction): { x: number; y: number } {
  switch (direction) {
    case "north":
      return { x: centerX, y: centerY - offset };
    case "east":
      return { x: centerX + offset, y: centerY };
    case "south":
      return { x: centerX, y: centerY + offset };
    case "west":
      return { x: centerX - offset, y: centerY };
  }
}

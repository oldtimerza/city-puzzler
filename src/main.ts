import Phaser from "phaser";

import { CAMPAIGN_LEVELS, type CampaignLevel } from "./content/campaign-levels.js";
import { JigsawScene, type JigsawViewState } from "./game/JigsawScene.js";
import { BOARD_SIZES, generateJigsawLevel, jigsawLevelSignature, type BoardSize } from "./jigsaw/generator.js";
import { SERVICE_TYPES, type ServiceType } from "./jigsaw/types.js";
import "./styles.css";

const DIRECTION_LABELS = { north: "North", east: "East", south: "South", west: "West" } as const;
const PROGRESS_KEY = "town-planner.campaign.v1";

const inventory = byId<HTMLDivElement>("inventory");
const inventoryCount = byId<HTMLSpanElement>("inventory-count");
const buildingOrientation = byId<HTMLSpanElement>("building-orientation");
const rotate = byId<HTMLButtonElement>("rotate");
const refresh = byId<HTMLButtonElement>("refresh");
const mainMenu = byId<HTMLButtonElement>("main-menu");
const levels = byId<HTMLButtonElement>("levels");
const nextLevel = byId<HTMLButtonElement>("next-level");
const undo = byId<HTMLButtonElement>("undo");
const redo = byId<HTMLButtonElement>("redo");
const hint = byId<HTMLButtonElement>("hint");
const showSolution = byId<HTMLButtonElement>("show-solution");
const reset = byId<HTMLButtonElement>("reset");
const status = byId<HTMLParagraphElement>("status");
const startMenu = byId<HTMLElement>("start-menu");
const startMenuActions = byId<HTMLElement>("start-menu-actions");
const newGame = byId<HTMLButtonElement>("new-game");
const openPractice = byId<HTMLButtonElement>("open-practice");
const openHelp = byId<HTMLButtonElement>("open-help");
const helpPanel = byId<HTMLElement>("help-panel");
const closeHelp = byId<HTMLButtonElement>("close-help");
const campaignPicker = byId<HTMLElement>("campaign-picker");
const campaignLevels = byId<HTMLDivElement>("campaign-levels");
const backFromCampaign = byId<HTMLButtonElement>("back-from-campaign");
const sizePicker = byId<HTMLElement>("size-picker");
const startSizeGame = byId<HTMLButtonElement>("start-size-game");
const backToStart = byId<HTMLButtonElement>("back-to-start");
const boardSizeChoices = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-board-size]"));

const inventoryButtons = new Map<ServiceType, HTMLButtonElement>();
const completedLevelIds = loadCompletedLevelIds();
let nextSeed = Date.now() >>> 0;
let selectedBoardSize: BoardSize = 6;
let activeCampaignIndex: number | null = null;
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#f4f0e6",
  scene: [JigsawScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: 720,
    height: 720,
  },
  render: {
    antialias: true,
    roundPixels: true,
  },
});

for (const service of SERVICE_TYPES) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `building-button ${service}`;
  button.addEventListener("click", () => scene().selectService(service));
  inventory.append(button);
  inventoryButtons.set(service, button);
}

rotate.addEventListener("click", () => scene().rotateSelectedService());
document.addEventListener("keydown", rotateWithKey);
document.addEventListener("keydown", showHintWithKey);
refresh.addEventListener("click", () => refreshPuzzle());
mainMenu.addEventListener("click", showMainMenu);
levels.addEventListener("click", showCampaignPicker);
nextLevel.addEventListener("click", startNextCampaignLevel);
undo.addEventListener("click", () => scene().undo());
redo.addEventListener("click", () => scene().redo());
hint.addEventListener("click", () => scene().showHint());
showSolution.addEventListener("click", () => scene().revealSolution());
reset.addEventListener("click", () => scene().reset());
newGame.addEventListener("click", showCampaignPicker);
openPractice.addEventListener("click", showBoardSizePicker);
openHelp.addEventListener("click", openHelpPanel);
closeHelp.addEventListener("click", closeHelpPanel);
backFromCampaign.addEventListener("click", showStartActions);
startSizeGame.addEventListener("click", startPracticeGame);
backToStart.addEventListener("click", showStartActions);

for (const choice of boardSizeChoices) {
  choice.addEventListener("click", () => selectBoardSize(Number(choice.dataset.boardSize)));
}

renderCampaignLevels();
attachSceneEvents();

function attachSceneEvents(): void {
  if (!game.scene.isActive(JigsawScene.KEY)) {
    requestAnimationFrame(attachSceneEvents);
    return;
  }

  const puzzleScene = scene();
  puzzleScene.events.on("statechange", renderControls);
  renderControls(puzzleScene.getViewState());
}

function renderControls(state: JigsawViewState): void {
  updateCampaignProgress(state);
  let placed = 0;

  for (const service of SERVICE_TYPES) {
    const button = inventoryButtons.get(service)!;
    const active = state.activeServices.includes(service);
    button.hidden = !active;

    if (!active) {
      continue;
    }

    const count = state.placements.filter((placement) => placement.service === service).length;
    const total = state.inventory[service];
    placed += count;
    button.textContent = `${serviceLabel(service)}  ${count}/${total}`;
    button.disabled = count === total;
    button.classList.toggle("selected", state.selectedService === service);
  }

  const totalServices = state.activeServices.reduce((total, service) => total + state.inventory[service], 0);
  inventoryCount.textContent = `${placed} / ${totalServices} placed`;
  buildingOrientation.textContent = DIRECTION_LABELS[state.orientation];
  rotate.disabled = state.selectedService === null;
  rotate.textContent = state.selectedService ? `Rotate ${serviceLabel(state.selectedService)} (R)` : "Rotate service (R)";
  undo.disabled = !state.canUndo;
  redo.disabled = !state.canRedo;
  refresh.hidden = activeCampaignIndex !== null;
  showSolution.hidden = activeCampaignIndex !== null;
  showSolution.disabled = state.solutionRevealed;
  showSolution.textContent = "Show solution";
  hint.disabled = state.solutionRevealed;
  reset.disabled = state.solutionRevealed;
  const canContinueCampaign = activeCampaignIndex !== null && activeCampaignIndex < CAMPAIGN_LEVELS.length - 1;
  nextLevel.hidden = !(state.complete && (activeCampaignIndex === null || canContinueCampaign));
  nextLevel.textContent = activeCampaignIndex === null ? "Back to menu" : "Next level";
  status.textContent = state.status;
  status.classList.toggle("complete", state.complete);
}

function scene(): JigsawScene {
  return game.scene.getScene(JigsawScene.KEY) as JigsawScene;
}

function refreshPuzzle(size: BoardSize = scene().getBoardSize()): void {
  activeCampaignIndex = null;
  const currentSignature = scene().getPuzzleSignature();

  for (let attempt = 0; attempt < 32; attempt += 1) {
    nextSeed = (nextSeed + 1) >>> 0;
    const generated = generateJigsawLevel(nextSeed, size);

    if (jigsawLevelSignature(generated) !== currentSignature) {
      scene().loadPuzzle(generated);
      return;
    }
  }

  scene().loadPuzzle(generateJigsawLevel(nextSeed, size));
}

function startPracticeGame(): void {
  refreshPuzzle(selectedBoardSize);
  startMenu.hidden = true;
}

function startCampaignLevel(index: number): void {
  const level = CAMPAIGN_LEVELS[index];

  if (!level || !isCampaignLevelUnlocked(index)) {
    return;
  }

  activeCampaignIndex = index;
  scene().loadPuzzle(level);
  startMenu.hidden = true;
}

function startNextCampaignLevel(): void {
  if (activeCampaignIndex === null) {
    showMainMenu();
  } else {
    showCampaignPicker();
  }
}

function showCampaignPicker(): void {
  startMenu.hidden = false;
  startMenuActions.hidden = true;
  helpPanel.hidden = true;
  sizePicker.hidden = true;
  campaignPicker.hidden = false;
  renderCampaignLevels();
  campaignLevels.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
}

function showBoardSizePicker(): void {
  startMenuActions.hidden = true;
  helpPanel.hidden = true;
  campaignPicker.hidden = true;
  sizePicker.hidden = false;
  boardSizeChoices.find((choice) => Number(choice.dataset.boardSize) === selectedBoardSize)?.focus();
}

function showStartActions(): void {
  campaignPicker.hidden = true;
  sizePicker.hidden = true;
  helpPanel.hidden = true;
  startMenuActions.hidden = false;
  newGame.focus();
}

function showMainMenu(): void {
  startMenu.hidden = false;
  showStartActions();
}

function selectBoardSize(size: number): void {
  if (!BOARD_SIZES.includes(size as BoardSize) || size === 5) {
    return;
  }

  selectedBoardSize = size as BoardSize;

  for (const choice of boardSizeChoices) {
    const selected = Number(choice.dataset.boardSize) === selectedBoardSize;
    choice.classList.toggle("selected", selected);
    choice.setAttribute("aria-pressed", String(selected));
  }

}

function renderCampaignLevels(): void {
  campaignLevels.replaceChildren(...CAMPAIGN_LEVELS.map((level, index) => campaignLevelButton(level, index)));
}

function campaignLevelButton(level: CampaignLevel, index: number): HTMLButtonElement {
  const unlocked = isCampaignLevelUnlocked(index);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "campaign-level";
  button.disabled = !unlocked;
  button.innerHTML = unlocked
    ? `<strong>${level.title}</strong><span>${level.boardSize}x${level.boardSize} · ${level.activeServices.map(serviceLabel).join(" + ")}</span>`
    : `<strong>Locked</strong><span>Complete ${CAMPAIGN_LEVELS[index - 1]!.title} to unlock.</span>`;
  button.addEventListener("click", () => startCampaignLevel(index));
  return button;
}

function updateCampaignProgress(state: JigsawViewState): void {
  if (activeCampaignIndex === null || !state.complete) {
    return;
  }

  const level = CAMPAIGN_LEVELS[activeCampaignIndex]!;

  if (!completedLevelIds.has(level.id)) {
    completedLevelIds.add(level.id);
    saveCompletedLevelIds();
    renderCampaignLevels();
  }
}

function isCampaignLevelUnlocked(index: number): boolean {
  return index === 0 || completedLevelIds.has(CAMPAIGN_LEVELS[index - 1]!.id);
}

function loadCompletedLevelIds(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "[]");
    return Array.isArray(value) ? new Set(value.filter((item): item is string => typeof item === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function saveCompletedLevelIds(): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify([...completedLevelIds]));
}

function openHelpPanel(): void {
  startMenuActions.hidden = true;
  campaignPicker.hidden = true;
  sizePicker.hidden = true;
  helpPanel.hidden = false;
  openHelp.setAttribute("aria-expanded", "true");
  closeHelp.focus();
}

function closeHelpPanel(): void {
  helpPanel.hidden = true;
  openHelp.setAttribute("aria-expanded", "false");
  startMenuActions.hidden = false;
  newGame.focus();
}

function rotateWithKey(event: KeyboardEvent): void {
  if (event.repeat || event.key.toLowerCase() !== "r" || isTextInput(event.target) || !scene().getViewState().selectedService) {
    return;
  }

  event.preventDefault();
  scene().rotateSelectedService();
}

function showHintWithKey(event: KeyboardEvent): void {
  if (event.repeat || event.key.toLowerCase() !== "t" || isTextInput(event.target)) {
    return;
  }

  event.preventDefault();
  scene().showHint();
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function serviceLabel(service: ServiceType): string {
  switch (service) {
    case "generator":
      return "Wind farm";
    case "water":
      return "Dam";
    case "farm":
      return "Farm";
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Expected #${id} to exist.`);
  }

  return element as T;
}

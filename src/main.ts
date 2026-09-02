import Phaser from "phaser";

import { CAMPAIGN_LEVELS, type CampaignLevel } from "./content/campaign-levels.js";
import { JigsawScene, type JigsawViewState } from "./game/JigsawScene.js";
import { BOARD_SIZES, generateJigsawLevel, jigsawLevelSignature, type BoardSize } from "./jigsaw/generator.js";
import { SERVICE_TYPES, type ServiceType } from "./jigsaw/types.js";
import "./styles.css";

const PROGRESS_KEY = "town-planner.campaign.v1";

const inventory = byId<HTMLDivElement>("inventory");
const inventoryCount = byId<HTMLSpanElement>("inventory-count");
const completionNotice = byId<HTMLDivElement>("completion-notice");
const refresh = byId<HTMLButtonElement>("refresh");
const mainMenu = byId<HTMLButtonElement>("main-menu");
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
const resetTutorialProgress = byId<HTMLButtonElement>("reset-tutorial-progress");
const sizePicker = byId<HTMLElement>("size-picker");
const startSizeGame = byId<HTMLButtonElement>("start-size-game");
const backToStart = byId<HTMLButtonElement>("back-to-start");
const levelTip = byId<HTMLElement>("level-tip");
const levelTipStep = byId<HTMLParagraphElement>("level-tip-step");
const levelTipTitle = byId<HTMLHeadingElement>("level-tip-title");
const levelTipCopy = byId<HTMLParagraphElement>("level-tip-copy");
const dismissLevelTip = byId<HTMLButtonElement>("dismiss-level-tip");
const gameHelp = byId<HTMLButtonElement>("game-help");
const boardSizeChoices = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-board-size]"));
const factoryCountChoices = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-factory-count]"));
const factoryDifficulty = byId<HTMLSpanElement>("factory-difficulty");

const inventoryButtons = new Map<ServiceType, HTMLButtonElement>();
const completedLevelIds = loadCompletedLevelIds();
let nextSeed = Date.now() >>> 0;
let selectedBoardSize: BoardSize = 6;
let selectedFactoryCount = 4;
let activeCampaignIndex: number | null = null;
let helpOpenedFromGame = false;
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

document.addEventListener("keydown", showHintWithKey);
refresh.addEventListener("click", () => refreshPuzzle());
mainMenu.addEventListener("click", showMainMenu);
nextLevel.addEventListener("click", startNextCampaignLevel);
undo.addEventListener("click", () => scene().undo());
redo.addEventListener("click", () => scene().redo());
hint.addEventListener("click", () => scene().showHint());
showSolution.addEventListener("click", () => scene().revealSolution());
reset.addEventListener("click", () => scene().reset());
newGame.addEventListener("click", showBoardSizePicker);
openPractice.addEventListener("click", showCampaignPicker);
openHelp.addEventListener("click", openHelpPanel);
closeHelp.addEventListener("click", closeHelpPanel);
backFromCampaign.addEventListener("click", showStartActions);
resetTutorialProgress.addEventListener("click", resetTutorialProgressForPlaytest);
startSizeGame.addEventListener("click", startFreePlay);
backToStart.addEventListener("click", showStartActions);
dismissLevelTip.addEventListener("click", hideLevelTip);
gameHelp.addEventListener("click", showGameHelp);

for (const choice of boardSizeChoices) {
  choice.addEventListener("click", () => selectBoardSize(Number(choice.dataset.boardSize)));
}

for (const choice of factoryCountChoices) {
  choice.addEventListener("click", () => selectFactoryCount(Number(choice.dataset.factoryCount)));
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
    const total = state.quotas[service].total;
    placed += count;
    button.textContent = `${buildingLabel(service)}  ${count}/${total}`;
    button.disabled = count === total;
    button.classList.toggle("selected", state.selectedService === service);
  }

  const totalBuildings = state.activeServices.reduce((total, service) => total + state.quotas[service].total, 0);
  inventoryCount.textContent = `${placed} / ${totalBuildings} placed`;
  completionNotice.hidden = !state.complete;
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
    const generated = generateFreePlayLevel(nextSeed, size);

    if (jigsawLevelSignature(generated) !== currentSignature) {
      scene().loadPuzzle(generated);
      return;
    }
  }

  scene().loadPuzzle(generateFreePlayLevel(nextSeed, size));
}

function startFreePlay(): void {
  refreshPuzzle(selectedBoardSize);
  startMenu.hidden = true;
  hideLevelTip();
}

function startCampaignLevel(index: number): void {
  const level = CAMPAIGN_LEVELS[index];

  if (!level || !isCampaignLevelUnlocked(index)) {
    return;
  }

  activeCampaignIndex = index;
  scene().loadPuzzle(level);
  startMenu.hidden = true;

  if (level.tutorialTip) {
    showLevelTip(level, index);
  } else {
    hideLevelTip();
  }
}

function startNextCampaignLevel(): void {
  if (activeCampaignIndex === null) {
    showMainMenu();
  } else {
    showCampaignPicker();
  }
}

function showCampaignPicker(): void {
  hideLevelTip();
  startMenu.hidden = false;
  startMenuActions.hidden = true;
  helpPanel.hidden = true;
  sizePicker.hidden = true;
  campaignPicker.hidden = false;
  renderCampaignLevels();
  campaignLevels.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
}

function showBoardSizePicker(): void {
  hideLevelTip();
  startMenuActions.hidden = true;
  helpPanel.hidden = true;
  campaignPicker.hidden = true;
  sizePicker.hidden = false;
  renderFactoryCountChoices();
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
  hideLevelTip();
  helpOpenedFromGame = false;
  startMenu.hidden = false;
  showStartActions();
}

function showLevelTip(level: CampaignLevel, index: number): void {
  levelTipStep.textContent = `Practice lesson ${index + 1} of ${CAMPAIGN_LEVELS.length}`;
  levelTipTitle.textContent = level.title;
  levelTipCopy.textContent = level.tutorialTip ?? "";
  levelTip.hidden = false;
  dismissLevelTip.focus();
}

function hideLevelTip(): void {
  levelTip.hidden = true;
}

function showGameHelp(): void {
  helpOpenedFromGame = true;
  startMenu.hidden = false;
  showHelpPanel();
}

function selectBoardSize(size: number): void {
  if (!BOARD_SIZES.includes(size as BoardSize) || size === 5) {
    return;
  }

  selectedBoardSize = size as BoardSize;

  if (selectedFactoryCount > maximumFactoryCount(selectedBoardSize)) {
    selectedFactoryCount = maximumFactoryCount(selectedBoardSize);
  }

  for (const choice of boardSizeChoices) {
    const selected = Number(choice.dataset.boardSize) === selectedBoardSize;
    choice.classList.toggle("selected", selected);
    choice.setAttribute("aria-pressed", String(selected));
  }

  renderFactoryCountChoices();

}

function selectFactoryCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > maximumFactoryCount(selectedBoardSize)) {
    return;
  }

  selectedFactoryCount = count;
  renderFactoryCountChoices();
}

function renderFactoryCountChoices(): void {
  for (const choice of factoryCountChoices) {
    const count = Number(choice.dataset.factoryCount);
    const available = count <= maximumFactoryCount(selectedBoardSize);
    const selected = count === selectedFactoryCount;
    choice.hidden = !available;
    choice.classList.toggle("selected", selected);
    choice.setAttribute("aria-pressed", String(selected));
  }

  factoryDifficulty.textContent = `${selectedFactoryCount} Factor${selectedFactoryCount === 1 ? "y" : "ies"} · ${factoryDifficultyLabel(selectedFactoryCount, selectedBoardSize)}`;
}

function generateFreePlayLevel(seed: number, size: BoardSize) {
  return generateJigsawLevel(seed, size, SERVICE_TYPES, {
    factory: { total: selectedFactoryCount, maxPerRow: 1, maxPerColumn: 1, maxPerRegion: 1 },
  });
}

function factoryDifficultyLabel(factoryCount: number, size: BoardSize): string {
  if (factoryCount >= maximumFactoryCount(size)) {
    return "Expert";
  }

  if (factoryCount >= 5) {
    return "Challenging";
  }

  return factoryCount === 4 ? "Standard" : "Light";

}

function maximumFactoryCount(size: BoardSize): number {
  return size;
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
    ? `<strong>${level.title}</strong><span>${level.boardSize}x${level.boardSize} · ${level.activeServices.map(buildingLabel).join(" + ")}</span>`
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

function resetTutorialProgressForPlaytest(): void {
  if (!window.confirm("Reset all Tutorial lesson progress on this device?")) {
    return;
  }

  completedLevelIds.clear();
  localStorage.removeItem(PROGRESS_KEY);
  renderCampaignLevels();
  campaignLevels.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
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
  helpOpenedFromGame = false;
  showHelpPanel();
}

function showHelpPanel(): void {
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

  if (helpOpenedFromGame) {
    helpOpenedFromGame = false;
    startMenu.hidden = true;
    gameHelp.focus();
    return;
  }

  startMenuActions.hidden = false;
  newGame.focus();
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

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Expected #${id} to exist.`);
  }

  return element as T;
}

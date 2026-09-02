import Phaser from "phaser";

import { CAMPAIGN_LEVELS, type CampaignLevel } from "./content/campaign-levels.js";
import { JigsawScene, type JigsawViewState } from "./game/JigsawScene.js";
import { generateChordLevel, type ChordDifficulty } from "./jigsaw/generator.js";
import { SERVICE_TYPES, type ServiceType } from "./jigsaw/types.js";
import "./styles.css";

const PROGRESS_KEY = "chord.campaign.v1";

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
const difficultyPicker = byId<HTMLElement>("difficulty-picker");
const backFromDifficulty = byId<HTMLButtonElement>("back-from-difficulty");
const difficultyChoices = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-difficulty]"));
const startGameButton = byId<HTMLButtonElement>("start-size-game");
const levelTip = byId<HTMLElement>("level-tip");
const levelTipStep = byId<HTMLParagraphElement>("level-tip-step");
const levelTipTitle = byId<HTMLHeadingElement>("level-tip-title");
const levelTipCopy = byId<HTMLParagraphElement>("level-tip-copy");
const dismissLevelTip = byId<HTMLButtonElement>("dismiss-level-tip");
const gameHelp = byId<HTMLButtonElement>("game-help");

const completedLevelIds = loadCompletedLevelIds();
let nextSeed = Date.now() >>> 0;
let selectedDifficulty: ChordDifficulty = "standard";
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

document.addEventListener("keydown", showHintWithKey);
refresh.addEventListener("click", refreshPuzzle);
mainMenu.addEventListener("click", showMainMenu);
nextLevel.addEventListener("click", startNextCampaignLevel);
undo.addEventListener("click", () => scene().undo());
redo.addEventListener("click", () => scene().redo());
hint.addEventListener("click", () => scene().showHint());
showSolution.addEventListener("click", () => scene().revealSolution());
reset.addEventListener("click", () => scene().reset());
newGame.addEventListener("click", showDifficultyPicker);
openPractice.addEventListener("click", showCampaignPicker);
openHelp.addEventListener("click", openHelpPanel);
closeHelp.addEventListener("click", closeHelpPanel);
backFromCampaign.addEventListener("click", showStartActions);
backFromDifficulty.addEventListener("click", showStartActions);
resetTutorialProgress.addEventListener("click", resetTutorialProgressForPlaytest);
startGameButton.addEventListener("click", startGame);
dismissLevelTip.addEventListener("click", hideLevelTip);
gameHelp.addEventListener("click", showGameHelp);

for (const choice of difficultyChoices) {
  choice.addEventListener("click", () => selectDifficulty(choice.dataset.difficulty as ChordDifficulty));
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
  const placed = state.activeServices.reduce((total, service) => total + state.placements.filter((placement) => placement.service === service).length, 0);
  const totalSymbols = state.activeServices.reduce((total, service) => total + state.quotas[service].total, 0);

  inventoryCount.textContent = `${placed} / ${totalSymbols} placed`;
  completionNotice.hidden = !state.complete;
  undo.disabled = !state.canUndo;
  redo.disabled = !state.canRedo;
  refresh.hidden = activeCampaignIndex !== null;
  showSolution.hidden = activeCampaignIndex !== null;
  showSolution.disabled = state.solutionRevealed;
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

function startGame(): void {
  activeCampaignIndex = null;
  refreshPuzzle();
  startMenu.hidden = true;
  hideLevelTip();
}

function refreshPuzzle(): void {
  nextSeed = (nextSeed + 1) >>> 0;
  scene().loadPuzzle(generateChordLevel(nextSeed, selectedDifficulty));
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
  difficultyPicker.hidden = true;
  campaignPicker.hidden = false;
  renderCampaignLevels();
  campaignLevels.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
}

function showDifficultyPicker(): void {
  hideLevelTip();
  startMenuActions.hidden = true;
  helpPanel.hidden = true;
  campaignPicker.hidden = true;
  difficultyPicker.hidden = false;
  difficultyChoices.find((choice) => choice.dataset.difficulty === selectedDifficulty)?.focus();
}

function showStartActions(): void {
  campaignPicker.hidden = true;
  difficultyPicker.hidden = true;
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

function selectDifficulty(difficulty: ChordDifficulty): void {
  selectedDifficulty = difficulty;

  for (const choice of difficultyChoices) {
    const selected = choice.dataset.difficulty === difficulty;
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
    ? `<strong>${level.title}</strong><span>${level.boardSize}x${level.boardSize} · ${level.activeServices.map(symbolLabel).join(" + ")}</span>`
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
  difficultyPicker.hidden = true;
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
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Expected #${id} to exist.`);
  }

  return element as T;
}

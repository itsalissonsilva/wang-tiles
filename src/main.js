const boardElement = document.querySelector("#board");
const trayElement = document.querySelector("#tray");
const scoreElement = document.querySelector("#score");
const streakElement = document.querySelector("#streak");
const tilesLeftElement = document.querySelector("#tiles-left");
const newGameButton = document.querySelector("#new-game-button");

const BOARD_SIZE = 6;
const STARTING_TRAY_COUNT = 6;

function renderBoardShell() {
  boardElement.innerHTML = "";

  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.type = "button";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", "Empty tile space");
    boardElement.append(cell);
  }
}

function renderTrayShell() {
  trayElement.innerHTML = "";

  for (let index = 0; index < STARTING_TRAY_COUNT; index += 1) {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.type = "button";
    tile.setAttribute("aria-label", "Tile preview");
    trayElement.append(tile);
  }
}

function resetStats() {
  scoreElement.textContent = "0";
  streakElement.textContent = "0";
  tilesLeftElement.textContent = String(STARTING_TRAY_COUNT);
}

function startNewGame() {
  renderBoardShell();
  renderTrayShell();
  resetStats();
}

newGameButton.addEventListener("click", startNewGame);

startNewGame();

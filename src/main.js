const menuScreen = document.querySelector("#menu-screen");
const gameScreen = document.querySelector("#game-screen");
const previewGrid = document.querySelector("#preview-grid");
const boardElement = document.querySelector("#board");
const trayElement = document.querySelector("#tray");
const scoreElement = document.querySelector("#score");
const streakElement = document.querySelector("#streak");
const tilesLeftElement = document.querySelector("#tiles-left");
const bestScoreElement = document.querySelector("#best-score");
const targetScoreElement = document.querySelector("#target-score");
const timeLeftElement = document.querySelector("#time-left");
const timeCardElement = document.querySelector("#time-card");
const goalMeterElement = document.querySelector("#goal-meter");
const messageElement = document.querySelector("#message");
const modeLabelElement = document.querySelector("#mode-label");
const comboLabelElement = document.querySelector("#combo-label");
const roundPanel = document.querySelector("#round-panel");
const roundKicker = document.querySelector("#round-kicker");
const roundTitle = document.querySelector("#round-title");
const roundSummary = document.querySelector("#round-summary");
const menuButton = document.querySelector("#menu-button");
const rotateButton = document.querySelector("#rotate-button");
const hintButton = document.querySelector("#hint-button");
const mixButton = document.querySelector("#mix-button");
const retryButton = document.querySelector("#retry-button");
const nextButton = document.querySelector("#next-button");
const roundMenuButton = document.querySelector("#round-menu-button");
const modeButtons = [...document.querySelectorAll("[data-mode]")];

const BEST_SCORE_PREFIX = "chromaweld.bestScore";

const MODE_CONFIGS = {
  tutorial: {
    id: "tutorial",
    name: "Tutorial",
    size: 3,
    trayCount: 4,
    seconds: 90,
    target: 240,
    hintCost: 0,
  },
  sprint: {
    id: "sprint",
    name: "Sprint",
    size: 4,
    trayCount: 5,
    seconds: 75,
    target: 550,
    hintCost: 10,
  },
  rush: {
    id: "rush",
    name: "Rush",
    size: 6,
    trayCount: 6,
    seconds: 115,
    target: 1500,
    hintCost: 15,
  },
  gauntlet: {
    id: "gauntlet",
    name: "Gauntlet",
    size: 8,
    trayCount: 7,
    seconds: 150,
    target: 3100,
    hintCost: 20,
  },
};

const MODE_ORDER = ["tutorial", "sprint", "rush", "gauntlet"];

const SIDE_DATA = [
  { key: "n", opposite: "s", dx: 0, dy: -1 },
  { key: "e", opposite: "w", dx: 1, dy: 0 },
  { key: "s", opposite: "n", dx: 0, dy: 1 },
  { key: "w", opposite: "e", dx: -1, dy: 0 },
];

const PALETTE = [
  { id: "hot", name: "Hot pink", value: "#ff4f7b" },
  { id: "sun", name: "Sun", value: "#ffd166" },
  { id: "teal", name: "Teal", value: "#17d6bd" },
  { id: "blue", name: "Blue", value: "#4d96ff" },
  { id: "violet", name: "Violet", value: "#9d6cff" },
  { id: "lime", name: "Lime", value: "#9be15d" },
];

let state = createEmptyState();

function createEmptyState() {
  return {
    mode: null,
    board: [],
    deck: [],
    tray: [],
    selectedTileId: null,
    score: 0,
    streak: 0,
    bestScore: 0,
    remainingSeconds: 0,
    message: "",
    hint: null,
    invalidIndex: null,
    draggingTileId: null,
    roundOver: false,
    timerId: null,
    placements: 0,
  };
}

function readBestScore(modeId) {
  try {
    return (
      Number.parseInt(
        localStorage.getItem(`${BEST_SCORE_PREFIX}.${modeId}`) ?? "0",
        10,
      ) || 0
    );
  } catch {
    return 0;
  }
}

function writeBestScore(modeId, score) {
  try {
    localStorage.setItem(`${BEST_SCORE_PREFIX}.${modeId}`, String(score));
  } catch {
    // Private browsing modes may block storage; the round can continue.
  }
}

function randomPaletteId() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)].id;
}

function paletteValue(id) {
  return PALETTE.find((color) => color.id === id)?.value ?? "#ffffff";
}

function paletteName(id) {
  return PALETTE.find((color) => color.id === id)?.name ?? "color";
}

function boardSize() {
  return state.mode?.size ?? MODE_CONFIGS.rush.size;
}

function indexFor(x, y, size = boardSize()) {
  return y * size + x;
}

function coordinatesFor(index, size = boardSize()) {
  return {
    x: index % size,
    y: Math.floor(index / size),
  };
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function shuffle(items) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function generateDeck(size) {
  const tiles = [];
  const solutionEdges = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const top = y === 0 ? randomPaletteId() : solutionEdges[y - 1][x].s;
      const left = x === 0 ? randomPaletteId() : solutionEdges[y][x - 1].e;
      const tile = {
        id: `tile-${size}-${x}-${y}-${Math.random().toString(16).slice(2)}`,
        edges: {
          n: top,
          e: randomPaletteId(),
          s: randomPaletteId(),
          w: left,
        },
        rotation: Math.floor(Math.random() * 4),
        origin: { x, y },
      };

      solutionEdges[y][x] = tile.edges;
      tiles.push(tile);
    }
  }

  return tiles;
}

function drawTrayTiles() {
  while (state.tray.length < state.mode.trayCount && state.deck.length > 0) {
    state.tray.push(state.deck.shift());
  }
}

function rotatedEdges(tile, rotation = tile.rotation) {
  let edges = { ...tile.edges };

  for (let turns = 0; turns < rotation; turns += 1) {
    edges = {
      n: edges.w,
      e: edges.n,
      s: edges.e,
      w: edges.s,
    };
  }

  return edges;
}

function neighborAt(index, direction) {
  const size = boardSize();
  const { x, y } = coordinatesFor(index, size);
  const nextX = x + direction.dx;
  const nextY = y + direction.dy;

  if (nextX < 0 || nextX >= size || nextY < 0 || nextY >= size) {
    return null;
  }

  const neighborIndex = indexFor(nextX, nextY, size);
  return {
    index: neighborIndex,
    tile: state.board[neighborIndex],
  };
}

function validatePlacement(tile, index, rotation = tile.rotation) {
  if (!tile) {
    return { ok: false, matches: 0, reason: "Pick a tray tile first." };
  }

  if (state.board[index]) {
    return { ok: false, matches: 0, reason: "That space is already welded." };
  }

  const edges = rotatedEdges(tile, rotation);
  let matches = 0;
  let placedNeighbors = 0;

  for (const direction of SIDE_DATA) {
    const neighbor = neighborAt(index, direction);

    if (!neighbor?.tile) {
      continue;
    }

    placedNeighbors += 1;
    const neighborEdges = rotatedEdges(neighbor.tile);

    if (edges[direction.key] !== neighborEdges[direction.opposite]) {
      const needed = paletteName(
        neighborEdges[direction.opposite],
      ).toLowerCase();
      return {
        ok: false,
        matches,
        reason: `That edge needs ${needed}. -4 sec.`,
      };
    }

    matches += 1;
  }

  if (placedNeighbors === 0) {
    return {
      ok: false,
      matches: 0,
      reason: "Weld next to an existing tile. -4 sec.",
    };
  }

  return { ok: true, matches };
}

function findBestMove(tiles = state.tray) {
  const moves = [];

  for (const tile of tiles) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      for (let index = 0; index < state.board.length; index += 1) {
        const result = validatePlacement(tile, index, rotation);

        if (result.ok) {
          moves.push({
            tileId: tile.id,
            index,
            rotation,
            matches: result.matches,
          });
        }
      }
    }
  }

  moves.sort((a, b) => b.matches - a.matches);
  return moves[0] ?? null;
}

function ensureTrayHasMove() {
  if (state.tray.length === 0 || findBestMove()) {
    return;
  }

  const deckMove = findBestMove(state.deck);

  if (!deckMove) {
    return;
  }

  const deckIndex = state.deck.findIndex((tile) => tile.id === deckMove.tileId);
  const [incomingTile] = state.deck.splice(deckIndex, 1);
  const outgoingTile = state.tray.pop();
  incomingTile.rotation = deckMove.rotation;

  if (outgoingTile) {
    state.deck.push(outgoingTile);
    state.deck = shuffle(state.deck);
  }

  state.tray.unshift(incomingTile);
  state.selectedTileId = incomingTile.id;
}

function selectedTile() {
  return state.tray.find((tile) => tile.id === state.selectedTileId) ?? null;
}

function createTileFace(tile) {
  const edges = rotatedEdges(tile);
  const face = document.createElement("span");
  face.className = "tile-face";
  face.setAttribute("aria-hidden", "true");
  face.style.setProperty("--edge-n", paletteValue(edges.n));
  face.style.setProperty("--edge-e", paletteValue(edges.e));
  face.style.setProperty("--edge-s", paletteValue(edges.s));
  face.style.setProperty("--edge-w", paletteValue(edges.w));

  for (const side of ["top", "right", "bottom", "left"]) {
    const edge = document.createElement("span");
    edge.className = `tile-edge ${side}`;
    face.append(edge);
  }

  const core = document.createElement("span");
  core.className = "tile-core";
  face.append(core);

  return face;
}

function describeTile(tile) {
  const edges = rotatedEdges(tile);
  return `Tile with ${paletteName(edges.n)} top, ${paletteName(edges.e)} right, ${paletteName(edges.s)} bottom, and ${paletteName(edges.w)} left`;
}

function renderPreviewGrid() {
  const previewTiles = [
    ["hot", "sun", "teal", "blue"],
    ["sun", "violet", "blue", "sun"],
    ["lime", "blue", "hot", "violet"],
    ["teal", "hot", "violet", "lime"],
    ["blue", "lime", "sun", "hot"],
  ];

  previewGrid.innerHTML = "";

  for (let index = 0; index < 9; index += 1) {
    const cell = document.createElement("div");
    cell.className = "preview-cell";

    if ([0, 1, 3, 4, 7].includes(index)) {
      const tile = {
        edges: {
          n: previewTiles[index % previewTiles.length][0],
          e: previewTiles[index % previewTiles.length][1],
          s: previewTiles[index % previewTiles.length][2],
          w: previewTiles[index % previewTiles.length][3],
        },
        rotation: index % 4,
      };
      cell.append(createTileFace(tile));
    }

    previewGrid.append(cell);
  }
}

function renderMenuBests() {
  for (const element of document.querySelectorAll("[data-best-for]")) {
    const modeId = element.dataset.bestFor;
    element.textContent = `Best ${readBestScore(modeId)}`;
  }
}

function renderBoard() {
  boardElement.innerHTML = "";
  boardElement.style.setProperty("--grid-size", String(boardSize()));
  const activeTile = selectedTile();

  for (let index = 0; index < state.board.length; index += 1) {
    const placedTile = state.board[index];
    const placement =
      activeTile && !state.roundOver ? validatePlacement(activeTile, index) : null;
    const { x, y } = coordinatesFor(index);
    const cell = document.createElement("button");
    cell.className = [
      "cell",
      placedTile ? "is-filled" : "",
      placedTile?.locked ? "is-anchor" : "",
      placement?.ok ? "is-placeable" : "",
      state.hint?.index === index ? "is-hint" : "",
      state.invalidIndex === index ? "is-invalid" : "",
    ]
      .filter(Boolean)
      .join(" ");
    cell.type = "button";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute(
      "aria-label",
      placedTile
        ? `Row ${y + 1}, column ${x + 1}. ${describeTile(placedTile)}`
        : `Empty row ${y + 1}, column ${x + 1}`,
    );
    cell.addEventListener("click", () => placeSelectedTile(index));
    cell.addEventListener("dragover", (event) => {
      const tile = selectedTile();

      if (!state.roundOver && validatePlacement(tile, index).ok) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    });
    cell.addEventListener("drop", (event) => {
      event.preventDefault();

      if (state.roundOver) {
        return;
      }

      const tileId = event.dataTransfer.getData("text/plain");

      if (tileId) {
        state.selectedTileId = tileId;
      }

      placeSelectedTile(index);
    });

    if (placedTile) {
      cell.append(createTileFace(placedTile));
    }

    boardElement.append(cell);
  }
}

function renderTray() {
  trayElement.innerHTML = "";

  if (state.tray.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tray-empty";
    empty.textContent = "Tray clear";
    trayElement.append(empty);
    return;
  }

  for (const trayTile of state.tray) {
    const tile = document.createElement("button");
    tile.className = [
      "tile",
      trayTile.id === state.selectedTileId ? "is-selected" : "",
      trayTile.id === state.hint?.tileId ? "is-hint" : "",
      trayTile.id === state.draggingTileId ? "is-dragging" : "",
    ]
      .filter(Boolean)
      .join(" ");
    tile.type = "button";
    tile.draggable = !state.roundOver;
    tile.dataset.tileId = trayTile.id;
    tile.setAttribute("aria-pressed", String(trayTile.id === state.selectedTileId));
    tile.setAttribute("aria-label", describeTile(trayTile));
    tile.addEventListener("click", () => {
      if (state.roundOver) {
        return;
      }

      state.selectedTileId = trayTile.id;
      state.hint = null;
      state.message = describeTile(trayTile);
      render();
    });
    tile.addEventListener("dragstart", (event) => {
      if (state.roundOver) {
        event.preventDefault();
        return;
      }

      state.selectedTileId = trayTile.id;
      state.draggingTileId = trayTile.id;
      state.hint = null;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", trayTile.id);
    });
    tile.addEventListener("dragend", () => {
      state.draggingTileId = null;
      render();
    });
    tile.append(createTileFace(trayTile));
    trayElement.append(tile);
  }
}

function renderStats() {
  const remainingTiles = state.deck.length + state.tray.length;
  const progress = Math.min(100, (state.score / state.mode.target) * 100);

  modeLabelElement.textContent = `${state.mode.name} ${state.mode.size}x${state.mode.size}`;
  scoreElement.textContent = String(state.score);
  targetScoreElement.textContent = String(state.mode.target);
  streakElement.textContent = String(state.streak);
  comboLabelElement.textContent = `Chain x${state.streak}`;
  tilesLeftElement.textContent = String(remainingTiles);
  bestScoreElement.textContent = String(state.bestScore);
  timeLeftElement.textContent = formatTime(state.remainingSeconds);
  timeCardElement.classList.toggle("is-low", state.remainingSeconds <= 10);
  goalMeterElement.style.width = `${progress}%`;
  messageElement.textContent = state.message;
}

function renderRoundPanel() {
  roundPanel.hidden = !state.roundOver;
  nextButton.hidden = !state.roundOver || !hasNextMode();
}

function renderControls() {
  const hasTile = Boolean(selectedTile());
  rotateButton.disabled = !hasTile || state.roundOver;
  hintButton.disabled = state.tray.length === 0 || state.roundOver;
  mixButton.disabled =
    state.roundOver || (state.tray.length === 0 && state.deck.length === 0);
}

function render() {
  if (!state.mode) {
    renderMenuBests();
    return;
  }

  renderBoard();
  renderTray();
  renderStats();
  renderRoundPanel();
  renderControls();
}

function showMenu() {
  stopTimer();
  state = createEmptyState();
  menuScreen.hidden = false;
  gameScreen.hidden = true;
  menuButton.hidden = true;
  renderMenuBests();
}

function startRound(modeId) {
  const mode = MODE_CONFIGS[modeId] ?? MODE_CONFIGS.sprint;
  const deck = generateDeck(mode.size);
  const center = Math.floor(mode.size / 2);
  const seedIndex = indexFor(center, center, mode.size);
  const seedTileIndex = deck.findIndex(
    (tile) => tile.origin.x === center && tile.origin.y === center,
  );
  const [seedTile] = deck.splice(seedTileIndex, 1);
  seedTile.locked = true;
  seedTile.rotation = 0;

  stopTimer();
  state = createEmptyState();
  state.mode = mode;
  state.board = Array.from({ length: mode.size * mode.size }, () => null);
  state.board[seedIndex] = seedTile;
  state.placements = 1;
  state.deck = shuffle(deck);
  state.remainingSeconds = mode.seconds;
  state.bestScore = readBestScore(mode.id);
  drawTrayTiles();
  ensureTrayHasMove();
  state.selectedTileId = state.tray[0]?.id ?? null;
  state.message =
    mode.id === "tutorial"
      ? "Tutorial: use the glowing spaces to learn the weld."
      : "Reach the target before time runs out.";

  menuScreen.hidden = true;
  gameScreen.hidden = false;
  menuButton.hidden = false;
  render();
  startTimer();
}

function startTimer() {
  stopTimer();
  state.timerId = window.setInterval(() => {
    if (state.roundOver) {
      stopTimer();
      return;
    }

    state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);

    if (state.remainingSeconds <= 0) {
      endRound(false, "Time froze the board.");
      return;
    }

    renderStats();
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
  }

  state.timerId = null;
}

function updateBestScore() {
  if (state.score <= state.bestScore) {
    return;
  }

  state.bestScore = state.score;
  writeBestScore(state.mode.id, state.bestScore);
  renderMenuBests();
}

function scorePlacement(matches) {
  const base = 45;
  const matchBonus = matches * 35;
  const chainBonus = state.streak * 14;
  const gain = base + matchBonus + chainBonus;
  const timeGain = Math.min(8, 1 + matches + Math.floor(state.streak / 3));
  state.score += gain;
  state.remainingSeconds += timeGain;
  return { gain, timeGain };
}

function placeSelectedTile(index) {
  if (state.roundOver) {
    return;
  }

  const tile = selectedTile();
  const result = validatePlacement(tile, index);

  if (!result.ok) {
    state.streak = 0;
    state.remainingSeconds = Math.max(0, state.remainingSeconds - 4);
    state.message = result.reason;
    state.invalidIndex = index;
    render();
    window.setTimeout(() => {
      state.invalidIndex = null;
      render();
    }, 220);

    if (state.remainingSeconds <= 0) {
      endRound(false, "A bad weld spent the last seconds.");
    }

    return;
  }

  state.board[index] = tile;
  state.tray = state.tray.filter((candidate) => candidate.id !== tile.id);
  state.streak += 1;
  state.placements += 1;

  const { gain, timeGain } = scorePlacement(result.matches);
  state.hint = null;
  drawTrayTiles();
  ensureTrayHasMove();
  state.selectedTileId = state.tray[0]?.id ?? null;
  updateBestScore();

  const remaining = state.deck.length + state.tray.length;
  const bestMove = findBestMove();

  if (state.score >= state.mode.target) {
    endRound(true, `Target hit with ${formatTime(state.remainingSeconds)} left.`);
    return;
  }

  if (remaining === 0) {
    endRound(true, "Full board weld.");
    return;
  }

  if (!bestMove) {
    state.message = "No legal weld is visible. Remix quickly.";
  } else if (result.matches >= 3) {
    state.message = `Mega weld +${gain}, +${timeGain} sec.`;
  } else {
    state.message = `Weld +${gain}, +${timeGain} sec.`;
  }

  render();
}

function rotateSelectedTile() {
  const tile = selectedTile();

  if (!tile || state.roundOver) {
    return;
  }

  tile.rotation = (tile.rotation + 1) % 4;
  state.hint = null;
  state.message = "Rotated.";
  render();
}

function showHint() {
  if (state.roundOver) {
    return;
  }

  const move = findBestMove();

  if (!move) {
    state.message = "No legal weld in this tray.";
    state.hint = null;
    render();
    return;
  }

  state.selectedTileId = move.tileId;
  const hintedTile = selectedTile();

  if (hintedTile) {
    hintedTile.rotation = move.rotation;
  }

  if (state.mode.hintCost > 0) {
    state.score = Math.max(0, state.score - state.mode.hintCost);
  }

  state.hint = move;
  state.message =
    state.mode.hintCost > 0
      ? `Hint found. -${state.mode.hintCost} points.`
      : "Hint found.";
  render();
}

function mixTray() {
  if (state.roundOver || state.tray.length === 0) {
    return;
  }

  state.deck = shuffle([...state.deck, ...state.tray]);
  state.tray = [];
  drawTrayTiles();
  ensureTrayHasMove();
  state.selectedTileId = state.tray[0]?.id ?? null;
  state.hint = null;
  state.streak = 0;
  state.score = Math.max(0, state.score - 15);
  state.remainingSeconds = Math.max(0, state.remainingSeconds - 3);
  state.message = "Tray remixed. -3 sec.";
  updateBestScore();

  if (state.remainingSeconds <= 0) {
    endRound(false, "The remix spent the last seconds.");
    return;
  }

  render();
}

function endRound(didWin, summary) {
  stopTimer();
  state.roundOver = true;
  updateBestScore();
  roundKicker.textContent = didWin ? "Target cleared" : "Round over";
  roundTitle.textContent = didWin ? "Weld complete" : "Clock cooled";
  roundSummary.textContent = `${summary} Score ${state.score}. Best ${state.bestScore}.`;
  state.message = didWin
    ? "Pick the next size or replay for a better chain."
    : "Retry or drop to a smaller grid.";
  render();
}

function hasNextMode() {
  if (!state.mode) {
    return false;
  }

  return MODE_ORDER.indexOf(state.mode.id) < MODE_ORDER.length - 1;
}

function nextMode() {
  if (!hasNextMode()) {
    return state.mode.id;
  }

  return MODE_ORDER[MODE_ORDER.indexOf(state.mode.id) + 1];
}

function handleKeydown(event) {
  if (!state.mode || state.roundOver) {
    return;
  }

  const key = event.key.toLowerCase();
  const number = Number.parseInt(key, 10);

  if (number >= 1 && number <= state.tray.length) {
    state.selectedTileId = state.tray[number - 1].id;
    state.hint = null;
    render();
    return;
  }

  if (key === "r") {
    rotateSelectedTile();
  }

  if (key === "h") {
    showHint();
  }

  if (key === "m") {
    mixTray();
  }
}

for (const button of modeButtons) {
  button.addEventListener("click", () => startRound(button.dataset.mode));
}

menuButton.addEventListener("click", showMenu);
roundMenuButton.addEventListener("click", showMenu);
retryButton.addEventListener("click", () => startRound(state.mode?.id ?? "sprint"));
nextButton.addEventListener("click", () => startRound(nextMode()));
rotateButton.addEventListener("click", rotateSelectedTile);
hintButton.addEventListener("click", showHint);
mixButton.addEventListener("click", mixTray);
document.addEventListener("keydown", handleKeydown);

renderPreviewGrid();
showMenu();

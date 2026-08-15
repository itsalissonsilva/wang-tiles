const boardElement = document.querySelector("#board");
const trayElement = document.querySelector("#tray");
const scoreElement = document.querySelector("#score");
const streakElement = document.querySelector("#streak");
const tilesLeftElement = document.querySelector("#tiles-left");
const bestScoreElement = document.querySelector("#best-score");
const messageElement = document.querySelector("#message");
const newGameButton = document.querySelector("#new-game-button");
const rotateButton = document.querySelector("#rotate-button");
const hintButton = document.querySelector("#hint-button");
const mixButton = document.querySelector("#mix-button");

const BOARD_SIZE = 6;
const STARTING_TRAY_COUNT = 6;
const BEST_SCORE_KEY = "chromaweld.bestScore";

const SIDE_DATA = [
  { key: "n", opposite: "s", dx: 0, dy: -1 },
  { key: "e", opposite: "w", dx: 1, dy: 0 },
  { key: "s", opposite: "n", dx: 0, dy: 1 },
  { key: "w", opposite: "e", dx: -1, dy: 0 },
];

const PALETTE = [
  { id: "coral", name: "Coral", value: "#ff5d73" },
  { id: "sun", name: "Sun", value: "#ffd166" },
  { id: "teal", name: "Teal", value: "#18a999" },
  { id: "blue", name: "Blue", value: "#4d96ff" },
  { id: "violet", name: "Violet", value: "#8f62ff" },
  { id: "lime", name: "Lime", value: "#8bd346" },
];

let state = createInitialState();

function createInitialState() {
  return {
    board: Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => null),
    deck: [],
    tray: [],
    selectedTileId: null,
    score: 0,
    streak: 0,
    bestScore: readBestScore(),
    message: "",
    hint: null,
    invalidIndex: null,
  };
}

function readBestScore() {
  try {
    return Number.parseInt(localStorage.getItem(BEST_SCORE_KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeBestScore(score) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Private browsing modes may block storage; the game can continue without it.
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

function indexFor(x, y) {
  return y * BOARD_SIZE + x;
}

function coordinatesFor(index) {
  return {
    x: index % BOARD_SIZE,
    y: Math.floor(index / BOARD_SIZE),
  };
}

function shuffle(items) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function generateDeck() {
  const tiles = [];
  const solutionEdges = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  );

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const top = y === 0 ? randomPaletteId() : solutionEdges[y - 1][x].s;
      const left = x === 0 ? randomPaletteId() : solutionEdges[y][x - 1].e;
      const tile = {
        id: `tile-${x}-${y}`,
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
  while (state.tray.length < STARTING_TRAY_COUNT && state.deck.length > 0) {
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
  const { x, y } = coordinatesFor(index);
  const nextX = x + direction.dx;
  const nextY = y + direction.dy;

  if (
    nextX < 0 ||
    nextX >= BOARD_SIZE ||
    nextY < 0 ||
    nextY >= BOARD_SIZE
  ) {
    return null;
  }

  const neighborIndex = indexFor(nextX, nextY);
  return {
    index: neighborIndex,
    tile: state.board[neighborIndex],
  };
}

function validatePlacement(tile, index, rotation = tile.rotation) {
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
        reason: `That edge needs ${needed}.`,
      };
    }

    matches += 1;
  }

  if (placedNeighbors === 0) {
    return {
      ok: false,
      matches: 0,
      reason: "Place next to an existing tile.",
    };
  }

  return { ok: true, matches };
}

function findBestMove() {
  const moves = [];

  for (const tile of state.tray) {
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

function renderBoardShell() {
  boardElement.innerHTML = "";
  const activeTile = selectedTile();

  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const placedTile = state.board[index];
    const placement = activeTile ? validatePlacement(activeTile, index) : null;
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

    if (placedTile) {
      cell.append(createTileFace(placedTile));
    }

    boardElement.append(cell);
  }
}

function renderTray() {
  trayElement.innerHTML = "";

  for (const trayTile of state.tray) {
    const tile = document.createElement("button");
    tile.className = [
      "tile",
      trayTile.id === state.selectedTileId ? "is-selected" : "",
      trayTile.id === state.hint?.tileId ? "is-hint" : "",
    ]
      .filter(Boolean)
      .join(" ");
    tile.type = "button";
    tile.setAttribute("aria-label", describeTile(trayTile));
    tile.addEventListener("click", () => {
      state.selectedTileId = trayTile.id;
      state.hint = null;
      render();
    });
    tile.append(createTileFace(trayTile));
    trayElement.append(tile);
  }
}

function renderStats() {
  scoreElement.textContent = String(state.score);
  streakElement.textContent = String(state.streak);
  tilesLeftElement.textContent = String(state.deck.length + state.tray.length);
  bestScoreElement.textContent = String(state.bestScore);
  messageElement.textContent = state.message;
}

function render() {
  renderBoardShell();
  renderTray();
  renderStats();
  rotateButton.disabled = !selectedTile();
  hintButton.disabled = state.tray.length === 0;
  mixButton.disabled = state.tray.length === 0 && state.deck.length === 0;
}

function startNewGame() {
  const deck = generateDeck();
  const seedIndex = indexFor(Math.floor(BOARD_SIZE / 2), Math.floor(BOARD_SIZE / 2));
  const seedTileIndex = deck.findIndex(
    (tile) => tile.origin.x === Math.floor(BOARD_SIZE / 2) && tile.origin.y === Math.floor(BOARD_SIZE / 2),
  );
  const [seedTile] = deck.splice(seedTileIndex, 1);
  seedTile.locked = true;
  seedTile.rotation = 0;

  state = createInitialState();
  state.board[seedIndex] = seedTile;
  state.deck = shuffle(deck);
  drawTrayTiles();
  state.selectedTileId = state.tray[0]?.id ?? null;
  state.message = "Build outward by matching every touching edge.";
  render();
}

function updateBestScore() {
  if (state.score <= state.bestScore) {
    return;
  }

  state.bestScore = state.score;
  writeBestScore(state.bestScore);
}

function placeSelectedTile(index) {
  const tile = selectedTile();

  if (!tile) {
    state.message = "Pick a tray tile first.";
    render();
    return;
  }

  const result = validatePlacement(tile, index);

  if (!result.ok) {
    state.streak = 0;
    state.message = result.reason;
    state.invalidIndex = index;
    render();
    window.setTimeout(() => {
      state.invalidIndex = null;
      render();
    }, 220);
    return;
  }

  state.board[index] = tile;
  state.tray = state.tray.filter((candidate) => candidate.id !== tile.id);
  state.streak += 1;
  state.score += 20 + result.matches * 25 + state.streak * 5;
  state.hint = null;
  drawTrayTiles();
  state.selectedTileId = state.tray[0]?.id ?? null;
  updateBestScore();

  const remaining = state.deck.length + state.tray.length;
  const bestMove = findBestMove();

  if (remaining === 0) {
    state.message = "Chromaweld complete.";
  } else if (!bestMove) {
    state.message = "No fit is visible. Remix the tray or start fresh.";
  } else if (result.matches >= 3) {
    state.message = `${result.matches}-edge weld. Lovely.`;
  } else {
    state.message = `${result.matches}-edge match scored.`;
  }

  render();
}

function rotateSelectedTile() {
  const tile = selectedTile();

  if (!tile) {
    return;
  }

  tile.rotation = (tile.rotation + 1) % 4;
  state.hint = null;
  state.message = "Tile rotated.";
  render();
}

function showHint() {
  const move = findBestMove();

  if (!move) {
    state.message = "No legal match in this tray.";
    state.hint = null;
    render();
    return;
  }

  state.selectedTileId = move.tileId;
  const hintedTile = selectedTile();

  if (hintedTile) {
    hintedTile.rotation = move.rotation;
  }

  state.hint = move;
  state.message = "A strong match is glowing.";
  render();
}

function mixTray() {
  if (state.tray.length === 0) {
    return;
  }

  state.deck = shuffle([...state.deck, ...state.tray]);
  state.tray = [];
  drawTrayTiles();
  state.selectedTileId = state.tray[0]?.id ?? null;
  state.hint = null;
  state.streak = 0;
  state.score = Math.max(0, state.score - 15);
  state.message = "Tray remixed.";
  updateBestScore();
  render();
}

newGameButton.addEventListener("click", startNewGame);
rotateButton.addEventListener("click", rotateSelectedTile);
hintButton.addEventListener("click", showHint);
mixButton.addEventListener("click", mixTray);

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    rotateSelectedTile();
  }

  if (event.key.toLowerCase() === "n") {
    startNewGame();
  }
});

startNewGame();

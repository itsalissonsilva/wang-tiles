const menuScreen = document.querySelector("#menu-screen");
const gameScreen = document.querySelector("#game-screen");
const previewGrid = document.querySelector("#preview-grid");
const boardElement = document.querySelector("#board");
const trayElement = document.querySelector("#tray");
const scoreElement = document.querySelector("#score");
const streakElement = document.querySelector("#streak");
const tilesLeftElement = document.querySelector("#tiles-left");
const bestScoreElement = document.querySelector("#best-score");
const coresLitElement = document.querySelector("#cores-lit");
const fluxCountElement = document.querySelector("#flux-count");
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
const soundButton = document.querySelector("#sound-button");
const themeButton = document.querySelector("#theme-button");
const menuButton = document.querySelector("#menu-button");
const rotateButton = document.querySelector("#rotate-button");
const hintButton = document.querySelector("#hint-button");
const mixButton = document.querySelector("#mix-button");
const retryButton = document.querySelector("#retry-button");
const nextButton = document.querySelector("#next-button");
const roundMenuButton = document.querySelector("#round-menu-button");
const tutorialModal = document.querySelector("#tutorial-modal");
const tutorialStartButton = document.querySelector("#tutorial-start-button");
const modeButtons = [...document.querySelectorAll("[data-mode]")];

const BEST_SCORE_PREFIX = "chromaweld.bestScore";
const SOUND_PREF_KEY = "chromaweld.soundEnabled";
const THEME_PREF_KEY = "chromaweld.theme";

const MODE_CONFIGS = {
  tutorial: {
    id: "tutorial",
    name: "Tutorial",
    size: 3,
    trayCount: 4,
    seconds: 70,
    coreCount: 2,
    hintCost: 0,
  },
  sprint: {
    id: "sprint",
    name: "Sprint",
    size: 4,
    trayCount: 5,
    seconds: 65,
    coreCount: 4,
    hintCost: 10,
  },
  rush: {
    id: "rush",
    name: "Rush",
    size: 6,
    trayCount: 6,
    seconds: 100,
    coreCount: 7,
    hintCost: 15,
  },
  gauntlet: {
    id: "gauntlet",
    name: "Gauntlet",
    size: 8,
    trayCount: 7,
    seconds: 130,
    coreCount: 10,
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
let soundEnabled = readSoundPreference();
let currentTheme = readThemePreference();
let pendingTutorialModeId = "tutorial";
const audio = createAudioEngine();

function createEmptyState() {
  return {
    mode: null,
    board: [],
    cores: new Set(),
    litCores: new Set(),
    chargedCells: new Map(),
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
    pulseCells: [],
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

function readSoundPreference() {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeSoundPreference(isEnabled) {
  try {
    localStorage.setItem(SOUND_PREF_KEY, String(isEnabled));
  } catch {
    // The setting is optional; the audio toggle still works for this session.
  }
}

function readThemePreference() {
  try {
    const savedTheme = localStorage.getItem(THEME_PREF_KEY);
    return savedTheme === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function writeThemePreference(theme) {
  try {
    localStorage.setItem(THEME_PREF_KEY, theme);
  } catch {
    // Theme persistence is optional.
  }
}

function createAudioEngine() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const leadNotes = [261.63, 329.63, 392, 493.88, 587.33, 493.88, 392, 329.63];
  const bassNotes = [130.81, 130.81, 196, 146.83];
  let context = null;
  let master = null;
  let musicTimer = null;
  let step = 0;

  function ensureContext() {
    if (!AudioContext) {
      return null;
    }

    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.075;
      master.connect(context.destination);
    }

    return context;
  }

  function pluck(frequency, start, duration, type, gainValue) {
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1500, start);
    filter.frequency.exponentialRampToValueAtTime(420, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.025);
  }

  function playStep() {
    if (!context || context.state !== "running") {
      return;
    }

    const now = context.currentTime;
    pluck(leadNotes[step % leadNotes.length], now, 0.15, "triangle", 0.18);

    if (step % 4 === 0) {
      pluck(bassNotes[Math.floor(step / 4) % bassNotes.length], now, 0.28, "sine", 0.22);
    }

    step += 1;
  }

  function effect(kind) {
    if (!soundEnabled) {
      return;
    }

    const liveContext = ensureContext();

    if (!liveContext || liveContext.state !== "running") {
      return;
    }

    const now = liveContext.currentTime;

    if (kind === "error") {
      pluck(110, now, 0.18, "sawtooth", 0.14);
      return;
    }

    if (kind === "win") {
      pluck(523.25, now, 0.2, "triangle", 0.22);
      pluck(659.25, now + 0.08, 0.2, "triangle", 0.18);
      pluck(783.99, now + 0.16, 0.28, "triangle", 0.16);
      return;
    }

    if (kind === "lose") {
      pluck(220, now, 0.22, "sine", 0.16);
      pluck(164.81, now + 0.13, 0.32, "sine", 0.14);
      return;
    }

    if (kind === "combo") {
      pluck(659.25, now, 0.12, "triangle", 0.16);
      pluck(987.77, now + 0.06, 0.14, "triangle", 0.12);
      return;
    }

    if (kind === "hint") {
      pluck(440, now, 0.08, "triangle", 0.11);
      pluck(554.37, now + 0.05, 0.11, "triangle", 0.1);
      return;
    }

    pluck(392, now, 0.1, "triangle", 0.11);
  }

  return {
    async start() {
      const liveContext = ensureContext();

      if (!liveContext || musicTimer) {
        return;
      }

      await liveContext.resume();
      playStep();
      musicTimer = window.setInterval(playStep, 230);
    },
    stop() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
      }

      musicTimer = null;
    },
    effect,
  };
}

function renderSoundButton() {
  soundButton.textContent = soundEnabled ? "Sound On" : "Sound Off";
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.classList.toggle("is-active", soundEnabled);
}

function renderThemeButton() {
  const isDark = currentTheme === "dark";
  themeButton.textContent = isDark ? "Dark" : "Light";
  themeButton.setAttribute("aria-pressed", String(isDark));
  themeButton.classList.toggle("is-active", isDark);
}

function setSoundEnabled(isEnabled) {
  soundEnabled = isEnabled;
  writeSoundPreference(soundEnabled);
  renderSoundButton();

  if (soundEnabled) {
    audio.start();
  } else {
    audio.stop();
  }
}

function setTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = currentTheme;
  writeThemePreference(currentTheme);
  renderThemeButton();
}

function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
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

function rotatedEdges(tile, rotation = tile?.rotation ?? 0) {
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

function validatePlacement(tile, index, rotation = tile?.rotation ?? 0) {
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
          const coreBonus =
            state.cores.has(index) && !state.litCores.has(index) ? 20 : 0;
          const fluxBonus = state.chargedCells.has(index) ? 8 : 0;
          moves.push({
            tileId: tile.id,
            index,
            rotation,
            matches: result.matches,
            priority: result.matches * 10 + coreBonus + fluxBonus,
          });
        }
      }
    }
  }

  moves.sort((a, b) => b.priority - a.priority || b.matches - a.matches);
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

function createCoreIndexes(size, count, seedIndex, modeId) {
  if (modeId === "tutorial") {
    return new Set(
      [indexFor(0, 1, size), indexFor(2, 1, size)].slice(0, count),
    );
  }

  const seed = coordinatesFor(seedIndex, size);
  const candidates = [];

  for (let index = 0; index < size * size; index += 1) {
    if (index === seedIndex) {
      continue;
    }

    const { x, y } = coordinatesFor(index, size);
    const distance = Math.abs(seed.x - x) + Math.abs(seed.y - y);

    candidates.push({ index, distance });
  }

  return new Set(
    shuffle(candidates)
      .sort((a, b) => b.distance - a.distance)
      .slice(0, count)
      .map((candidate) => candidate.index),
  );
}

function chargedCellCount() {
  return [...state.chargedCells.keys()].filter((index) => !state.board[index])
    .length;
}

function isCellCharged(index) {
  return state.chargedCells.has(index) && !state.board[index];
}

function ageChargedCells(placedIndex) {
  const nextCharges = new Map();

  for (const [index, turns] of state.chargedCells.entries()) {
    if (index === placedIndex || state.board[index] || turns <= 1) {
      continue;
    }

    nextCharges.set(index, turns - 1);
  }

  state.chargedCells = nextCharges;
}

function chargeNearbyCells(index, matches) {
  if (matches < 2) {
    state.pulseCells = [];
    return [];
  }

  const size = boardSize();
  const radius = matches >= 3 ? 2 : 1;
  const origin = coordinatesFor(index, size);
  const charged = [];

  for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
    for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
      if (x < 0 || x >= size || y < 0 || y >= size) {
        continue;
      }

      const distance = Math.abs(origin.x - x) + Math.abs(origin.y - y);

      if (distance === 0 || distance > radius) {
        continue;
      }

      const chargedIndex = indexFor(x, y, size);

      if (state.board[chargedIndex]) {
        continue;
      }

      state.chargedCells.set(chargedIndex, 3);
      charged.push(chargedIndex);
    }
  }

  state.pulseCells = charged;
  window.setTimeout(() => {
    if (state.pulseCells.length === 0) {
      return;
    }

    state.pulseCells = [];
    render();
  }, 460);
  return charged;
}

function lightCoreAt(index) {
  if (!state.cores.has(index) || state.litCores.has(index)) {
    return false;
  }

  state.litCores.add(index);
  return true;
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
    const isCore = state.cores.has(index);
    const isLitCore = state.litCores.has(index);
    const placement =
      activeTile && !state.roundOver ? validatePlacement(activeTile, index) : null;
    const { x, y } = coordinatesFor(index);
    const cell = document.createElement("button");
    cell.className = [
      "cell",
      placedTile ? "is-filled" : "",
      placedTile?.locked ? "is-anchor" : "",
      isCore ? "is-core" : "",
      isLitCore ? "is-lit-core" : "",
      isCellCharged(index) ? "is-charged" : "",
      state.pulseCells.includes(index) ? "is-pulse" : "",
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
        ? `Row ${y + 1}, column ${x + 1}. ${isLitCore ? "Lit core. " : ""}${describeTile(placedTile)}`
        : `Empty row ${y + 1}, column ${x + 1}. ${isCore ? "Core. " : ""}${isCellCharged(index) ? "Charged. " : ""}`,
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
  const progress = Math.min(
    100,
    (state.litCores.size / state.mode.coreCount) * 100,
  );

  modeLabelElement.textContent =
    state.mode.id === "tutorial"
      ? state.mode.name
      : `${state.mode.name} ${state.mode.size}x${state.mode.size}`;
  scoreElement.textContent = String(state.score);
  coresLitElement.textContent = `${state.litCores.size}/${state.mode.coreCount}`;
  fluxCountElement.textContent = String(chargedCellCount());
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
  tutorialModal.hidden = true;
  renderMenuBests();
}

function showTutorialPopup(modeId) {
  pendingTutorialModeId = modeId;
  tutorialModal.hidden = false;
  tutorialStartButton.focus();
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
  state.cores = createCoreIndexes(mode.size, mode.coreCount, seedIndex, mode.id);
  state.placements = 1;
  state.deck = shuffle(deck);
  state.remainingSeconds = mode.seconds;
  state.bestScore = readBestScore(mode.id);
  drawTrayTiles();
  ensureTrayHasMove();
  state.selectedTileId = state.tray[0]?.id ?? null;
  state.message =
    mode.id === "tutorial"
      ? "Light the cores."
      : "Light every core before the clock ends.";

  menuScreen.hidden = true;
  gameScreen.hidden = false;
  menuButton.hidden = false;
  render();
  startTimer();

  if (soundEnabled) {
    audio.start();
  }
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

function scorePlacement(matches, options = {}) {
  const { wasCharged = false, coreLit = false, chargedCount = 0 } = options;
  const base = 45;
  const matchBonus = matches * 35;
  const chainBonus = state.streak * 14;
  const fluxBonus = wasCharged ? 90 : 0;
  const coreBonus = coreLit ? 180 : 0;
  const surgeBonus = chargedCount * 6;
  const gain = base + matchBonus + chainBonus + fluxBonus + coreBonus + surgeBonus;
  const timeGain = Math.min(
    12,
    1 +
      matches +
      Math.floor(state.streak / 3) +
      (wasCharged ? 4 : 0) +
      (coreLit ? 5 : 0) +
      (matches >= 3 ? 2 : 0),
  );
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
    audio.effect("error");
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

  const wasCharged = isCellCharged(index);
  state.board[index] = tile;
  state.tray = state.tray.filter((candidate) => candidate.id !== tile.id);
  state.streak += 1;
  state.placements += 1;

  ageChargedCells(index);
  const coreLit = lightCoreAt(index);
  const chargedCells = chargeNearbyCells(index, result.matches);
  const { gain, timeGain } = scorePlacement(result.matches, {
    wasCharged,
    coreLit,
    chargedCount: chargedCells.length,
  });
  audio.effect(result.matches >= 3 || coreLit || wasCharged ? "combo" : "place");
  state.hint = null;
  drawTrayTiles();
  ensureTrayHasMove();
  state.selectedTileId = state.tray[0]?.id ?? null;
  updateBestScore();

  const remaining = state.deck.length + state.tray.length;
  const bestMove = findBestMove();

  if (state.litCores.size >= state.mode.coreCount) {
    endRound(true, `All cores lit with ${formatTime(state.remainingSeconds)} left.`);
    return;
  }

  if (remaining === 0) {
    endRound(false, "The board filled before every core lit.");
    return;
  }

  if (!bestMove) {
    state.message = "No legal weld is visible. Remix quickly.";
  } else if (coreLit) {
    state.message = `Core lit +${gain}, +${timeGain} sec.`;
  } else if (wasCharged) {
    state.message = `Flux weld +${gain}, +${timeGain} sec.`;
  } else if (result.matches >= 3) {
    state.message = `Burst weld charged ${chargedCells.length} sockets. +${gain}`;
  } else if (result.matches === 2) {
    state.message = `Pulse weld charged ${chargedCells.length} sockets. +${gain}`;
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
  audio.effect("place");
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
  audio.effect("hint");
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
  audio.effect("hint");
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
  roundKicker.textContent = didWin ? "Cores lit" : "Round over";
  roundTitle.textContent = didWin ? "Core chain live" : "Core chain lost";
  roundSummary.textContent = `${summary} Cores ${state.litCores.size}/${state.mode.coreCount}. Score ${state.score}. Best ${state.bestScore}.`;
  state.message = didWin
    ? "Pick the next size or replay for a better chain."
    : "Retry or drop to a smaller grid.";
  audio.effect(didWin ? "win" : "lose");
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
  button.addEventListener("click", () => {
    if (button.dataset.mode === "tutorial") {
      showTutorialPopup(button.dataset.mode);
      return;
    }

    startRound(button.dataset.mode);
  });
}

soundButton.addEventListener("click", () => setSoundEnabled(!soundEnabled));
themeButton.addEventListener("click", toggleTheme);
menuButton.addEventListener("click", showMenu);
roundMenuButton.addEventListener("click", showMenu);
retryButton.addEventListener("click", () => startRound(state.mode?.id ?? "sprint"));
nextButton.addEventListener("click", () => startRound(nextMode()));
tutorialStartButton.addEventListener("click", () => {
  tutorialModal.hidden = true;
  startRound(pendingTutorialModeId);
});
rotateButton.addEventListener("click", rotateSelectedTile);
hintButton.addEventListener("click", showHint);
mixButton.addEventListener("click", mixTray);
document.addEventListener("keydown", handleKeydown);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    audio.stop();
  } else if (soundEnabled) {
    audio.start();
  }
});

renderPreviewGrid();
setTheme(currentTheme);
renderSoundButton();
showMenu();

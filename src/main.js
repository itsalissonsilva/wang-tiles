const menuScreen = document.querySelector("#menu-screen");
const gameScreen = document.querySelector("#game-screen");
const levelList = document.querySelector("#level-list");
const boardElement = document.querySelector("#board");
const paletteElement = document.querySelector("#palette");
const filledCountElement = document.querySelector("#filled-count");
const threadCountElement = document.querySelector("#thread-count");
const motifCountElement = document.querySelector("#motif-count");
const repeatCountElement = document.querySelector("#repeat-count");
const stockCountElement = document.querySelector("#stock-count");
const goalsElement = document.querySelector("#goals");
const messageElement = document.querySelector("#message");
const levelKickerElement = document.querySelector("#level-kicker");
const levelTitleElement = document.querySelector("#level-title");
const winPanel = document.querySelector("#win-panel");
const winTitle = document.querySelector("#win-title");
const winSummary = document.querySelector("#win-summary");
const backButton = document.querySelector("#back-button");
const themeButton = document.querySelector("#theme-button");
const soundButton = document.querySelector("#sound-button");
const undoButton = document.querySelector("#undo-button");
const clearButton = document.querySelector("#clear-button");
const hintButton = document.querySelector("#hint-button");
const nextButton = document.querySelector("#next-button");
const replayButton = document.querySelector("#replay-button");
const boardPanel = document.querySelector(".board-panel");

const BEST_SCORE_PREFIX = "wangforge.best";
const SOUND_PREF_KEY = "wangforge.soundEnabled";
const THEME_PREF_KEY = "wangforge.theme";

const DIRECTIONS = [
  { key: "n", opposite: "s", dx: 0, dy: -1, className: "top" },
  { key: "e", opposite: "w", dx: 1, dy: 0, className: "right" },
  { key: "s", opposite: "n", dx: 0, dy: 1, className: "bottom" },
  { key: "w", opposite: "e", dx: -1, dy: 0, className: "left" },
];

const SIGNALS = [
  { id: "red", label: "Ruby", value: "#ff4f7b" },
  { id: "gold", label: "Gold", value: "#ffd166" },
  { id: "cyan", label: "Cyan", value: "#17d6bd" },
  { id: "blue", label: "Blue", value: "#4d96ff" },
  { id: "green", label: "Green", value: "#9be15d" },
  { id: "violet", label: "Violet", value: "#9d6cff" },
];

const SIGNAL_BY_ID = new Map(SIGNALS.map((signal) => [signal.id, signal]));

const LEVEL_BLUEPRINTS = [
  {
    id: "tiny",
    kicker: "Tiny",
    name: "Tutorial",
    contract: "Boundary",
    size: 4,
    signals: ["red", "cyan"],
    horizontal: [1, 1, 0, 0],
    vertical: [1, 0, 1, 1],
    threadColors: ["cyan"],
    motifSlack: 1,
    repeatSlack: 0,
    intro: "Fill the frame. Touching colors must match.",
  },
  {
    id: "ribbon",
    kicker: "Signal",
    name: "Ribbon",
    contract: "Thread",
    size: 5,
    signals: ["red", "gold", "cyan"],
    horizontal: [1, 2, 1, 0],
    vertical: [2, 1, 0, 1],
    threadColors: ["gold", "cyan"],
    motifSlack: 1,
    repeatSlack: 0,
    intro: "Connect both anchor pairs while keeping the pattern varied.",
  },
  {
    id: "lock",
    kicker: "Motif",
    name: "Lock",
    contract: "Aperiodic",
    size: 6,
    signals: ["red", "gold", "cyan", "violet"],
    horizontal: [1, 1, 2, 1],
    vertical: [2, 3, 1, 0],
    threadColors: ["red", "violet"],
    motifSlack: 2,
    repeatSlack: 1,
    intro: "The edge rules are local, but repeated 2x2 patches count against you.",
  },
  {
    id: "chorus",
    kicker: "Edge",
    name: "Chorus",
    contract: "Weave",
    size: 7,
    signals: ["red", "gold", "cyan", "blue", "green"],
    horizontal: [2, 1, 1, 0],
    vertical: [1, 3, 2, 2],
    threadColors: ["cyan", "blue", "green"],
    motifSlack: 3,
    repeatSlack: 1,
    intro: "Several color threads can share one pattern if every local edge agrees.",
  },
];

const LEVELS = LEVEL_BLUEPRINTS.map(prepareLevel);

let state = createEmptyState();
let currentTheme = readThemePreference();
let soundEnabled = readSoundPreference();
const audio = createAudioEngine();

function createEmptyState() {
  return {
    level: null,
    board: [],
    stocks: new Map(),
    selectedTileId: null,
    history: [],
    metrics: null,
    hintIndex: null,
    invalidIndex: null,
    message: "",
    complete: false,
  };
}

function prepareLevel(blueprint) {
  const tileMap = new Map();
  const solutionCells = [];
  const size = blueprint.size;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const edges = {
        n: formulaSignal(blueprint, "horizontal", x, y),
        e: formulaSignal(blueprint, "vertical", x + 1, y),
        s: formulaSignal(blueprint, "horizontal", x, y + 1),
        w: formulaSignal(blueprint, "vertical", x, y),
      };
      const signature = edgeSignature(edges);
      let tile = tileMap.get(signature);

      if (!tile) {
        tile = {
          id: `${blueprint.id}-${tileMap.size}`,
          name: `Glyph ${tileMap.size + 1}`,
          edges,
          stock: 0,
        };
        tileMap.set(signature, tile);
      }

      tile.stock += 1;
      solutionCells.push(tile.id);
    }
  }

  const tileTypes = [...tileMap.values()];
  const tileById = new Map(tileTypes.map((tile) => [tile.id, tile]));
  const boundary = makeBoundary(size, solutionCells, tileById);
  const threads = makeThreadGoals(blueprint, solutionCells, tileById);
  const solutionMotifs = collectMotifStats(solutionCells, size);
  const targetMotifs = Math.max(
    1,
    Math.min(solutionMotifs.uniqueCount, solutionMotifs.uniqueCount - blueprint.motifSlack),
  );
  const repeatLimit = Math.max(0, solutionMotifs.repeatCount + blueprint.repeatSlack);

  return {
    ...blueprint,
    tileTypes,
    tileById,
    boundary,
    threads,
    solutionCells,
    targetMotifs,
    repeatLimit,
  };
}

function formulaSignal(level, axis, x, y) {
  const [a, b, c, d] = level[axis];
  const value = a * x + b * y + c * x * y + d;
  return level.signals[mod(value, level.signals.length)];
}

function edgeSignature(edges) {
  return `${edges.n}|${edges.e}|${edges.s}|${edges.w}`;
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

function makeBoundary(size, solutionCells, tileById) {
  const boundary = { n: [], e: [], s: [], w: [] };

  for (let x = 0; x < size; x += 1) {
    boundary.n[x] = tileById.get(solutionCells[toIndex(x, 0, size)]).edges.n;
    boundary.s[x] = tileById.get(solutionCells[toIndex(x, size - 1, size)]).edges.s;
  }

  for (let y = 0; y < size; y += 1) {
    boundary.w[y] = tileById.get(solutionCells[toIndex(0, y, size)]).edges.w;
    boundary.e[y] = tileById.get(solutionCells[toIndex(size - 1, y, size)]).edges.e;
  }

  return boundary;
}

function makeThreadGoals(level, solutionCells, tileById) {
  return level.threadColors.map((colorId) => {
    const component = largestColorComponent(colorId, solutionCells, tileById, level.size);
    const endpoints = farthestPair(component.length > 1 ? component : [0, solutionCells.length - 1], level.size);

    return {
      colorId,
      from: endpoints[0],
      to: endpoints[1],
    };
  });
}

function largestColorComponent(colorId, cells, tileById, size) {
  const visited = new Set();
  let best = [];

  cells.forEach((tileId, index) => {
    if (visited.has(index)) {
      return;
    }

    const component = [];
    const queue = [index];
    visited.add(index);

    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);

      colorNeighbors(current, cells, tileById, size, colorId).forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }

    if (component.length > best.length) {
      best = component;
    }
  });

  return best;
}

function farthestPair(indices, size) {
  let bestPair = [indices[0], indices[indices.length - 1]];
  let bestDistance = -1;

  for (let a = 0; a < indices.length; a += 1) {
    for (let b = a + 1; b < indices.length; b += 1) {
      const start = fromIndex(indices[a], size);
      const end = fromIndex(indices[b], size);
      const distance = Math.abs(start.x - end.x) + Math.abs(start.y - end.y);

      if (distance > bestDistance) {
        bestDistance = distance;
        bestPair = [indices[a], indices[b]];
      }
    }
  }

  return bestPair;
}

function colorNeighbors(index, cells, tileById, size, colorId) {
  const tileId = cells[index];

  if (!tileId) {
    return [];
  }

  const tile = tileById.get(tileId);
  const { x, y } = fromIndex(index, size);

  return DIRECTIONS.reduce((neighbors, direction) => {
    const nextX = x + direction.dx;
    const nextY = y + direction.dy;

    if (!inBounds(nextX, nextY, size)) {
      return neighbors;
    }

    const nextIndex = toIndex(nextX, nextY, size);
    const neighborId = cells[nextIndex];

    if (!neighborId) {
      return neighbors;
    }

    const neighborTile = tileById.get(neighborId);
    if (
      tile.edges[direction.key] === colorId &&
      neighborTile.edges[direction.opposite] === colorId
    ) {
      neighbors.push(nextIndex);
    }

    return neighbors;
  }, []);
}

function init() {
  applyTheme(currentTheme);
  updateSoundButton();
  renderMenu();
  wireEvents();
}

function wireEvents() {
  levelList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-level-id]");
    if (!button) {
      return;
    }

    startLevel(button.dataset.levelId);
  });

  paletteElement.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tile-id]");
    if (!button || button.disabled) {
      return;
    }

    state.selectedTileId = button.dataset.tileId;
    state.hintIndex = null;
    state.message = "Choose a socket that respects every touching edge.";
    audio.select();
    renderAll();
  });

  boardElement.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-index]");
    if (!cell || state.complete) {
      return;
    }

    placeSelectedTile(Number(cell.dataset.index));
  });

  backButton.addEventListener("click", showMenu);
  themeButton.addEventListener("click", toggleTheme);
  soundButton.addEventListener("click", toggleSound);
  undoButton.addEventListener("click", undoMove);
  clearButton.addEventListener("click", resetCurrentLevel);
  hintButton.addEventListener("click", showHint);
  replayButton.addEventListener("click", resetCurrentLevel);
  nextButton.addEventListener("click", startNextLevel);

  document.addEventListener("keydown", (event) => {
    if (gameScreen.hidden) {
      return;
    }

    if (event.key === "Escape") {
      showMenu();
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoMove();
    }

    if (event.key.toLowerCase() === "h") {
      showHint();
    }
  });
}

function renderMenu() {
  levelList.replaceChildren();

  LEVELS.forEach((level) => {
    const button = document.createElement("button");
    button.className = "level-button";
    button.type = "button";
    button.dataset.levelId = level.id;

    const kicker = document.createElement("span");
    kicker.textContent = level.kicker;

    const best = readBestScore(level.id);
    const score = document.createElement("small");
    score.textContent = best > 0 ? `Best ${best}` : level.contract;

    const title = document.createElement("strong");
    title.textContent = level.name;

    const status = document.createElement("em");
    status.textContent = `${level.tileTypes.length} glyphs`;

    button.append(kicker, score, title, status);
    levelList.append(button);
  });
}

function startLevel(levelId) {
  const level = LEVELS.find((candidate) => candidate.id === levelId) ?? LEVELS[0];

  state = createEmptyState();
  state.level = level;
  state.board = Array.from({ length: level.size * level.size }, () => null);
  state.stocks = new Map(level.tileTypes.map((tile) => [tile.id, tile.stock]));
  state.selectedTileId = firstAvailableTileId(level);
  state.message = level.intro;
  state.metrics = evaluatePattern();

  levelKickerElement.textContent = level.contract;
  levelTitleElement.textContent = level.name;
  nextButton.textContent = isLastLevel(level.id) ? "Levels" : "Next Pattern";
  boardElement.style.setProperty("--grid-size", level.size);
  menuScreen.hidden = true;
  gameScreen.hidden = false;
  audio.start();
  renderAll();
}

function showMenu() {
  gameScreen.hidden = true;
  menuScreen.hidden = false;
  state = createEmptyState();
  audio.stop();
  renderMenu();
}

function firstAvailableTileId(level) {
  return level.tileTypes.find((tile) => tile.stock > 0)?.id ?? null;
}

function placeSelectedTile(index) {
  if (!state.selectedTileId) {
    state.message = "Select a glyph from the alphabet first.";
    renderAll();
    return;
  }

  if (!canPlace(state.selectedTileId, index)) {
    state.invalidIndex = index;
    state.message = "That local rule breaks: match touching edges and the frame.";
    audio.bad();
    renderAll();
    window.setTimeout(() => {
      if (state.invalidIndex === index) {
        state.invalidIndex = null;
        renderBoard();
      }
    }, 220);
    return;
  }

  const tileId = state.selectedTileId;
  state.board[index] = tileId;
  state.stocks.set(tileId, state.stocks.get(tileId) - 1);
  state.history.push({ index, tileId });
  state.invalidIndex = null;
  state.hintIndex = null;
  state.message = placementMessage(index, tileId);
  audio.place(state.history.length);

  if ((state.stocks.get(tileId) ?? 0) === 0) {
    state.selectedTileId = nextUsefulTileId();
  }

  state.metrics = evaluatePattern();

  if (state.metrics.complete) {
    completeLevel();
    return;
  }

  renderAll();
}

function placementMessage(index, tileId) {
  const tile = state.level.tileById.get(tileId);
  const touching = DIRECTIONS.filter((direction) => {
    const neighbor = neighborIndex(index, direction, state.level.size);
    return neighbor !== -1 && Boolean(state.board[neighbor]);
  }).length;
  const motifGain = countMotifsTouching(index);
  const colors = new Set(Object.values(tile.edges)).size;

  if (motifGain > 0) {
    return `${motifGain} motif${motifGain === 1 ? "" : "s"} formed.`;
  }

  if (touching > 1) {
    return `${touching} edges locked.`;
  }

  return `${colors}-color glyph placed.`;
}

function countMotifsTouching(index) {
  const size = state.level.size;
  const { x, y } = fromIndex(index, size);
  let count = 0;

  for (let patchY = y - 1; patchY <= y; patchY += 1) {
    for (let patchX = x - 1; patchX <= x; patchX += 1) {
      if (!inBounds(patchX, patchY, size - 1)) {
        continue;
      }

      const patch = [
        toIndex(patchX, patchY, size),
        toIndex(patchX + 1, patchY, size),
        toIndex(patchX, patchY + 1, size),
        toIndex(patchX + 1, patchY + 1, size),
      ];

      if (patch.every((cellIndex) => state.board[cellIndex])) {
        count += 1;
      }
    }
  }

  return count;
}

function canPlace(tileId, index) {
  if (!state.level || state.board[index] || (state.stocks.get(tileId) ?? 0) <= 0) {
    return false;
  }

  const tile = state.level.tileById.get(tileId);
  const size = state.level.size;
  const { x, y } = fromIndex(index, size);

  return DIRECTIONS.every((direction) => {
    const nextX = x + direction.dx;
    const nextY = y + direction.dy;
    const frameSignal = boundarySignal(direction.key, x, y);

    if (frameSignal && tile.edges[direction.key] !== frameSignal) {
      return false;
    }

    if (!inBounds(nextX, nextY, size)) {
      return true;
    }

    const neighborId = state.board[toIndex(nextX, nextY, size)];

    if (!neighborId) {
      return true;
    }

    const neighbor = state.level.tileById.get(neighborId);
    return tile.edges[direction.key] === neighbor.edges[direction.opposite];
  });
}

function boundarySignal(directionKey, x, y) {
  const { size, boundary } = state.level;

  if (directionKey === "n" && y === 0) {
    return boundary.n[x];
  }

  if (directionKey === "s" && y === size - 1) {
    return boundary.s[x];
  }

  if (directionKey === "w" && x === 0) {
    return boundary.w[y];
  }

  if (directionKey === "e" && x === size - 1) {
    return boundary.e[y];
  }

  return null;
}

function undoMove() {
  if (!state.level || state.history.length === 0 || state.complete) {
    return;
  }

  const move = state.history.pop();
  state.board[move.index] = null;
  state.stocks.set(move.tileId, state.stocks.get(move.tileId) + 1);
  state.selectedTileId = move.tileId;
  state.hintIndex = null;
  state.invalidIndex = null;
  state.message = "Move lifted back into the alphabet.";
  state.metrics = evaluatePattern();
  audio.undo();
  renderAll();
}

function resetCurrentLevel() {
  if (!state.level) {
    return;
  }

  startLevel(state.level.id);
}

function showHint() {
  if (!state.level || state.complete) {
    return;
  }

  const hint = findHint();

  if (!hint) {
    state.message = "No legal glyph fits from here. Undo a recent fork.";
    audio.bad();
    renderAll();
    return;
  }

  state.selectedTileId = hint.tileId;
  state.hintIndex = hint.index;
  const tile = state.level.tileById.get(hint.tileId);
  state.message = `${tile.name} has a legal socket highlighted.`;
  audio.hint();
  renderAll();
}

function findHint() {
  const solutionMove = state.board.findIndex((tileId, index) => {
    const solutionTileId = state.level.solutionCells[index];
    return !tileId && (state.stocks.get(solutionTileId) ?? 0) > 0 && canPlace(solutionTileId, index);
  });

  if (solutionMove !== -1) {
    return {
      index: solutionMove,
      tileId: state.level.solutionCells[solutionMove],
    };
  }

  for (const tile of state.level.tileTypes) {
    if ((state.stocks.get(tile.id) ?? 0) <= 0) {
      continue;
    }

    const index = state.board.findIndex((tileId, candidate) => !tileId && canPlace(tile.id, candidate));

    if (index !== -1) {
      return { index, tileId: tile.id };
    }
  }

  return null;
}

function nextUsefulTileId() {
  const legalTile = state.level.tileTypes.find((tile) => {
    if ((state.stocks.get(tile.id) ?? 0) <= 0) {
      return false;
    }

    return state.board.some((tileId, index) => !tileId && canPlace(tile.id, index));
  });

  if (legalTile) {
    return legalTile.id;
  }

  return state.level.tileTypes.find((tile) => (state.stocks.get(tile.id) ?? 0) > 0)?.id ?? null;
}

function evaluatePattern() {
  if (!state.level) {
    return null;
  }

  const filled = state.board.filter(Boolean).length;
  const motifs = collectMotifStats(state.board, state.level.size);
  const threads = state.level.threads.map((thread) => ({
    ...thread,
    met: areAnchorsConnected(thread),
  }));
  const threadMet = threads.filter((thread) => thread.met).length;
  const complete =
    filled === state.board.length &&
    threadMet === threads.length &&
    motifs.uniqueCount >= state.level.targetMotifs &&
    motifs.repeatCount <= state.level.repeatLimit;

  return {
    filled,
    total: state.board.length,
    motifs,
    threads,
    threadMet,
    complete,
    score: scorePattern(motifs, threadMet),
  };
}

function scorePattern(motifs, threadMet) {
  return Math.max(0, motifs.uniqueCount * 100 + threadMet * 150 - motifs.repeatCount * 25);
}

function collectMotifStats(cells, size) {
  const signatures = new Map();
  let completePatches = 0;

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const indices = [
        toIndex(x, y, size),
        toIndex(x + 1, y, size),
        toIndex(x, y + 1, size),
        toIndex(x + 1, y + 1, size),
      ];

      if (!indices.every((index) => cells[index])) {
        continue;
      }

      completePatches += 1;
      const signature = indices.map((index) => cells[index]).join("/");

      if (!signatures.has(signature)) {
        signatures.set(signature, []);
      }

      signatures.get(signature).push(indices);
    }
  }

  const duplicateCells = new Set();
  let repeatCount = 0;

  signatures.forEach((patches) => {
    if (patches.length < 2) {
      return;
    }

    repeatCount += patches.length - 1;
    patches.forEach((patch) => patch.forEach((index) => duplicateCells.add(index)));
  });

  return {
    completePatches,
    uniqueCount: signatures.size,
    repeatCount,
    duplicateCells,
  };
}

function areAnchorsConnected(thread) {
  if (!state.board[thread.from] || !state.board[thread.to]) {
    return false;
  }

  const visited = new Set([thread.from]);
  const queue = [thread.from];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === thread.to) {
      return true;
    }

    colorNeighbors(current, state.board, state.level.tileById, state.level.size, thread.colorId).forEach(
      (neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      },
    );
  }

  return false;
}

function completeLevel() {
  state.complete = true;
  state.message = "The contract accepts this pattern.";
  const previousBest = readBestScore(state.level.id);

  if (state.metrics.score > previousBest) {
    writeBestScore(state.level.id, state.metrics.score);
  }

  audio.win();
  renderAll();
}

function renderAll() {
  renderBoard();
  renderPalette();
  renderStats();
  renderGoals();
  renderWinPanel();
}

function renderBoard() {
  if (!state.level) {
    boardElement.replaceChildren();
    return;
  }

  const { size } = state.level;
  const duplicateCells = state.metrics?.motifs.duplicateCells ?? new Set();
  const anchorMap = makeAnchorMap();
  boardPanel.classList.toggle("is-complete", state.complete);
  boardElement.replaceChildren();

  state.board.forEach((tileId, index) => {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.type = "button";
    cell.dataset.index = index;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", cellLabel(index));

    if (tileId) {
      cell.classList.add("is-filled");
      cell.append(createTileFace(state.level.tileById.get(tileId)));
    } else if (state.selectedTileId && canPlace(state.selectedTileId, index)) {
      cell.classList.add("is-legal");
    }

    if (state.hintIndex === index) {
      cell.classList.add("is-hint");
    }

    if (state.invalidIndex === index) {
      cell.classList.add("is-illegal");
    }

    if (duplicateCells.has(index)) {
      cell.classList.add("is-duplicate");
    }

    const anchor = anchorMap.get(index);
    if (anchor) {
      cell.classList.add("is-anchor");
      cell.style.setProperty("--anchor-color", signalColor(anchor.colorId));
      cell.title = `${signalLabel(anchor.colorId)} thread anchor`;
    }

    appendBoundaryMarks(cell, index, size);
    boardElement.append(cell);
  });
}

function cellLabel(index) {
  const { size } = state.level;
  const { x, y } = fromIndex(index, size);
  const tileId = state.board[index];

  if (!tileId) {
    return `Empty socket row ${y + 1}, column ${x + 1}`;
  }

  return `${state.level.tileById.get(tileId).name} row ${y + 1}, column ${x + 1}`;
}

function makeAnchorMap() {
  const anchors = new Map();

  state.level.threads.forEach((thread) => {
    anchors.set(thread.from, thread);
    anchors.set(thread.to, thread);
  });

  return anchors;
}

function appendBoundaryMarks(cell, index, size) {
  const { x, y } = fromIndex(index, size);
  const marks = [
    { className: "top", signal: y === 0 ? state.level.boundary.n[x] : null },
    { className: "right", signal: x === size - 1 ? state.level.boundary.e[y] : null },
    { className: "bottom", signal: y === size - 1 ? state.level.boundary.s[x] : null },
    { className: "left", signal: x === 0 ? state.level.boundary.w[y] : null },
  ];

  marks.forEach((mark) => {
    if (!mark.signal) {
      return;
    }

    const element = document.createElement("span");
    element.className = `boundary-mark ${mark.className}`;
    element.style.setProperty("--need-color", signalColor(mark.signal));
    cell.append(element);
  });
}

function renderPalette() {
  if (!state.level) {
    paletteElement.replaceChildren();
    return;
  }

  paletteElement.replaceChildren();

  state.level.tileTypes.forEach((tile) => {
    const count = state.stocks.get(tile.id) ?? 0;
    const button = document.createElement("button");
    button.className = "tile-option";
    button.type = "button";
    button.dataset.tileId = tile.id;
    button.disabled = count <= 0 || state.complete;
    button.classList.toggle("is-selected", state.selectedTileId === tile.id);
    button.append(createTileFace(tile, true), tileLabel(tile, count));
    paletteElement.append(button);
  });
}

function tileLabel(tile, count) {
  const label = document.createElement("span");
  label.className = "tile-label";

  const name = document.createElement("strong");
  name.textContent = tile.name;

  const stock = document.createElement("span");
  stock.textContent = `${count} left`;

  label.append(name, stock);
  return label;
}

function createTileFace(tile, mini = false) {
  const face = document.createElement("span");
  face.className = mini ? "tile-face is-mini" : "tile-face";
  face.style.setProperty("--edge-n", signalColor(tile.edges.n));
  face.style.setProperty("--edge-e", signalColor(tile.edges.e));
  face.style.setProperty("--edge-s", signalColor(tile.edges.s));
  face.style.setProperty("--edge-w", signalColor(tile.edges.w));

  DIRECTIONS.forEach((direction) => {
    const edge = document.createElement("span");
    edge.className = `tile-edge ${direction.className}`;
    face.append(edge);
  });

  const core = document.createElement("span");
  core.className = "tile-core";
  face.append(core);

  return face;
}

function renderStats() {
  if (!state.metrics) {
    return;
  }

  const remaining = [...state.stocks.values()].reduce((sum, count) => sum + count, 0);
  filledCountElement.textContent = `${state.metrics.filled}/${state.metrics.total}`;
  threadCountElement.textContent = `${state.metrics.threadMet}/${state.level.threads.length}`;
  motifCountElement.textContent = `${state.metrics.motifs.uniqueCount}/${state.level.targetMotifs}`;
  repeatCountElement.textContent = `${state.metrics.motifs.repeatCount}/${state.level.repeatLimit}`;
  stockCountElement.textContent = `${remaining} left`;
  messageElement.textContent = state.message;
  undoButton.disabled = state.history.length === 0 || state.complete;
  clearButton.disabled = state.history.length === 0 || state.complete;
  hintButton.disabled = state.complete;
}

function renderGoals() {
  if (!state.metrics) {
    goalsElement.replaceChildren();
    return;
  }

  const goals = [
    {
      label: "Fill every socket inside the color frame",
      met: state.metrics.filled === state.metrics.total,
      colorId: "gold",
    },
    ...state.metrics.threads.map((thread) => ({
      label: `Connect the ${signalLabel(thread.colorId)} anchors`,
      met: thread.met,
      colorId: thread.colorId,
    })),
    {
      label: `Forge ${state.level.targetMotifs}+ distinct 2x2 motifs`,
      met: state.metrics.motifs.uniqueCount >= state.level.targetMotifs,
      colorId: "violet",
    },
    {
      label: `Keep repeated motifs at ${state.level.repeatLimit} or less`,
      met: state.metrics.motifs.repeatCount <= state.level.repeatLimit,
      colorId: "red",
    },
  ];

  goalsElement.replaceChildren();

  goals.forEach((goal) => {
    const item = document.createElement("div");
    item.className = "goal-item";
    item.classList.toggle("is-met", goal.met);
    item.style.setProperty("--goal-color", signalColor(goal.colorId));
    item.textContent = goal.met ? `Done: ${goal.label}` : goal.label;
    goalsElement.append(item);
  });
}

function renderWinPanel() {
  winPanel.hidden = !state.complete;

  if (!state.complete || !state.metrics) {
    return;
  }

  winTitle.textContent = "Pattern accepted.";
  winSummary.textContent = `${state.metrics.motifs.uniqueCount} motifs, ${state.metrics.threadMet} threads, score ${state.metrics.score}.`;
}

function signalColor(signalId) {
  return SIGNAL_BY_ID.get(signalId)?.value ?? "#ffffff";
}

function signalLabel(signalId) {
  return SIGNAL_BY_ID.get(signalId)?.label ?? signalId;
}

function neighborIndex(index, direction, size) {
  const { x, y } = fromIndex(index, size);
  const nextX = x + direction.dx;
  const nextY = y + direction.dy;

  if (!inBounds(nextX, nextY, size)) {
    return -1;
  }

  return toIndex(nextX, nextY, size);
}

function toIndex(x, y, size) {
  return y * size + x;
}

function fromIndex(index, size) {
  return {
    x: index % size,
    y: Math.floor(index / size),
  };
}

function inBounds(x, y, size) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function startNextLevel() {
  const currentIndex = LEVELS.findIndex((level) => level.id === state.level?.id);

  if (currentIndex === -1 || currentIndex === LEVELS.length - 1) {
    showMenu();
    return;
  }

  startLevel(LEVELS[currentIndex + 1].id);
}

function isLastLevel(levelId) {
  return LEVELS.findIndex((level) => level.id === levelId) === LEVELS.length - 1;
}

function toggleTheme() {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  writeStorage(THEME_PREF_KEY, currentTheme);
  applyTheme(currentTheme);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === "dark" ? "Dark" : "Light";
  themeButton.setAttribute("aria-pressed", String(theme === "dark"));
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  writeStorage(SOUND_PREF_KEY, String(soundEnabled));
  updateSoundButton();

  if (soundEnabled) {
    audio.start();
    audio.select();
  } else {
    audio.stop();
  }
}

function updateSoundButton() {
  soundButton.textContent = soundEnabled ? "Sound On" : "Sound Off";
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
}

function readThemePreference() {
  const saved = readStorage(THEME_PREF_KEY);
  return saved === "light" ? "light" : "dark";
}

function readSoundPreference() {
  return readStorage(SOUND_PREF_KEY) !== "false";
}

function readBestScore(levelId) {
  return Number(readStorage(`${BEST_SCORE_PREFIX}.${levelId}`) ?? 0);
}

function writeBestScore(levelId, score) {
  writeStorage(`${BEST_SCORE_PREFIX}.${levelId}`, String(score));
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing can reject storage. The game still runs without saves.
  }
}

function createAudioEngine() {
  let context = null;
  let master = null;
  let interval = null;
  let step = 0;
  const notes = [196, 247, 294, 330, 392, 330, 294, 247];

  function ensureContext() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

    if (context || !AudioContextConstructor) {
      return context;
    }

    context = new AudioContextConstructor();
    master = context.createGain();
    master.gain.value = 0.08;
    master.connect(context.destination);
    return context;
  }

  function start() {
    if (!soundEnabled) {
      return;
    }

    const ctx = ensureContext();

    if (!ctx) {
      return;
    }

    ctx.resume();

    if (interval) {
      return;
    }

    interval = window.setInterval(() => {
      if (!soundEnabled || !context) {
        return;
      }

      pluck(notes[step % notes.length], 0.035, 0.18, "sine");
      if (step % 4 === 0) {
        pluck(notes[(step + 3) % notes.length] / 2, 0.025, 0.32, "triangle");
      }
      step += 1;
    }, 520);
  }

  function stop() {
    if (interval) {
      window.clearInterval(interval);
      interval = null;
    }
  }

  function pluck(frequency, gainValue, duration, type = "triangle") {
    if (!soundEnabled) {
      return;
    }

    const ctx = ensureContext();

    if (!ctx || !master) {
      return;
    }

    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  return {
    start,
    stop,
    select() {
      pluck(440, 0.035, 0.08, "square");
    },
    place(depth) {
      pluck(330 + (depth % 8) * 22, 0.05, 0.12);
    },
    bad() {
      pluck(110, 0.07, 0.18, "sawtooth");
    },
    undo() {
      pluck(220, 0.035, 0.1);
    },
    hint() {
      pluck(660, 0.04, 0.16, "sine");
    },
    win() {
      [392, 494, 587, 784].forEach((frequency, index) => {
        window.setTimeout(() => pluck(frequency, 0.06, 0.22), index * 90);
      });
    },
  };
}

init();

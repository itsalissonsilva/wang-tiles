const fs = require("fs");
const vm = require("vm");

function element() {
  return {
    children: [],
    hidden: false,
    dataset: {},
    style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {} },
    replaceChildren() {},
    append(...children) {
      this.children.push(...children);
    },
    addEventListener() {},
    setAttribute() {},
    textContent: "",
    disabled: false,
    type: "",
    title: "",
  };
}

const document = {
  querySelector() {
    return element();
  },
  createElement() {
    return element();
  },
  addEventListener() {},
  documentElement: { dataset: {} },
};

const window = {
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  setInterval() {
    return 1;
  },
  clearInterval() {},
  setTimeout(callback) {
    callback();
  },
  AudioContext: null,
};

const source = fs.readFileSync("src/main.js", "utf8");
const probe = `
for (const level of LEVELS) {
  startLevel(level.id);
  showHint();
  state = createEmptyState();
  state.level = level;
  state.board = [...level.solutionCells];
  state.stocks = new Map(level.tileTypes.map((tile) => [tile.id, 0]));
  state.metrics = evaluatePattern();

  console.log(
    level.id +
      ": cells=" +
      state.metrics.filled +
      " glyphs=" +
      level.tileTypes.length +
      " threads=" +
      state.metrics.threadMet +
      "/" +
      level.threads.length +
      " motifs=" +
      state.metrics.motifs.uniqueCount +
      "/" +
      level.targetMotifs +
      " repeats=" +
      state.metrics.motifs.repeatCount +
      "/" +
      level.repeatLimit +
      " complete=" +
      state.metrics.complete,
  );

  if (!state.metrics.complete) {
    throw new Error(level.id + " generated an unsolved contract");
  }
}
`;

vm.runInNewContext(source + probe, { document, window, console });

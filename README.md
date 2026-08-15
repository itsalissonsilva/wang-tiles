# Wang Pattern Forge

Wang Pattern Forge is a browser-only puzzle game about fixed-orientation Wang
tiles. The player builds colorful patterns from a limited tile alphabet while
respecting local edge rules, boundary colors, signal-thread anchors, and motif
variety contracts.

## Run

Open `index.html` in a browser. No install or build step is required.

## Play

- Choose a pattern from the menu.
- Select a glyph from the tile alphabet.
- Place it in any legal socket. Touching edges and the outer frame must match.
- Use every tile in the limited stock.
- Connect matching-color anchor pairs through shared color edges.
- Create enough distinct 2x2 motifs while keeping repeated motifs under the
  contract limit.
- Hint highlights one legal socket for the selected solution path.
- Soundtrack and effects are generated in the browser with Web Audio.
- Dark theme is the default, with a light theme toggle in the header.

## Archive

The first arcade version, Chromaweld Rush, is preserved at
`legacy/chromaweld-rush/index.html`.

## Deployment

Because the game is static HTML, CSS, and JavaScript, it can later be deployed
for free on GitHub Pages, Cloudflare Pages, Netlify, Vercel, or any static host.
For GitHub Pages, deploy the repository root from the default branch.

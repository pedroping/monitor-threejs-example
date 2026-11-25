# Interactive 3D Terminal Portfolio (plain HTML/CSS/JS)

A build-free version of the portfolio front end: a retro CRT TV rendered with
Three.js, with an xterm.js terminal mapped onto its screen through CSS3D and a
C command engine compiled to WebAssembly. It is plain HTML, CSS and native ES
modules. There is no framework, no bundler, no `npm install` and no backend:
the folder is the website.

## Structure

```text
frontend-vanilla/
├── index.html            # SEO head + JSON-LD, crawlable content, app markup, import map
├── css/style.css         # All styles (cursors, CRT effects, settings panel, context menu)
├── js/
│   ├── main.js           # Entry point: app state, settings, command dispatch, startup
│   ├── terminal.js       # xterm.js wrapper (line editing, tab completion, history, mobile input)
│   ├── scene/            # Three.js scene, one file per responsibility:
│   │   ├── index.js            # builds the scene + render loop (start reading here)
│   │   ├── renderers.js        # WebGL + CSS3D renderers, resize
│   │   ├── room.js             # background photo and lights
│   │   ├── dust.js             # floating dust (InstancedMesh)
│   │   ├── tv-model.js         # load the TV, fit the terminal onto its screen
│   │   ├── occlusion.js        # clip-path so the terminal stays inside the bezel
│   │   ├── camera-intro.js     # opening camera move
│   │   └── terminal-picking.js # mouse -> terminal cell raycasting
│   ├── interaction.js    # Raycast mouse/touch: selection, links, copy/paste context menu
│   ├── data.js           # Portfolio JSON for the engine, ASCII art, live GitHub repo merge
│   ├── boot.js           # Simulated apt boot sequence
│   ├── audio-fx.js       # Procedural Web Audio sound effects
│   ├── fallback-data.js  # Portfolio content (about, skills, projects, experience, ...)
│   └── wasm/             # Emscripten output (engine.js + engine.wasm), unchanged
├── data/projects.autogen.json  # Snapshot written by scripts/sync-github.mjs
├── scripts/              # Node maintenance scripts (see below)
├── assets/, basis/, crt_tv_basis.glb, AppIcon.ico
├── about/, projects/*/   # Static SEO pages
└── robots.txt, sitemap.xml, search-engine verification files
```

## Run locally

ES modules and the WASM engine are loaded with `fetch`, so the page must be
served over `http://`. Opening `index.html` from disk (`file://`) does not work.
Any static server is fine, for example from inside this folder:

```bash
python -m http.server 8080
# or
npx serve .
```

Then open <http://localhost:8080>.

## Deploy

Upload the contents of this folder to any static host (GitHub Pages, Netlify,
Cloudflare Pages, S3, nginx, ...). No build step is needed. Serve it from the
domain root: the app and the static pages load their assets with root-relative
paths. Make sure the host serves `.wasm` files as `application/wasm` (most do).

The site's public URL is hard-coded as `https://matthew-nader.web.app/` (the
domain the site is currently published on). When deploying to a
different domain, update it everywhere it appears:

- `index.html`: canonical, `og:url`/`og:image`, Twitter card and JSON-LD URLs
- `about/index.html` and `projects/*/index.html`: the same kinds of absolute URLs
- `sitemap.xml`: every `<loc>`
- `robots.txt`: the `Sitemap:` line
- `scripts/submit-indexnow.mjs`: `HOST` (or set `SITE_HOST` when running it)

`grep -rl "matthew-nader.web.app" .` lists every file to change.

## Third-party libraries

Loaded from jsDelivr with exact pinned versions, so upgrades are always deliberate:

| Library           | Version | How it is loaded                                     |
| ----------------- | ------- | ---------------------------------------------------- |
| three             | 0.178.0 | ES module via the import map in `index.html`         |
| xterm             | 5.3.0   | UMD script + stylesheet (`window.Terminal`)          |
| xterm-addon-fit   | 0.8.0   | UMD script (`window.FitAddon.FitAddon`)              |

To upgrade, change the version in the URLs in `index.html`.

## Data

Portfolio content lives in `js/fallback-data.js`. At startup `js/data.js`
formats it for the terminal (word wrapping, ANSI colors, ASCII skill icons
rendered from Devicon SVGs) and appends any public repositories from the
GitHub API that are not already listed. If the GitHub request fails, the bundled
projects are used as they are. The result is passed as a JSON string to the WASM
`process_command(command, portfolioJson)` function.

## Scripts

Run with Node 18+ (they use the built-in `fetch`); no dependencies:

- `node scripts/sync-github.mjs`: fetches the public repositories of
  `MatthewNader2` and writes them to `data/projects.autogen.json`.
- `node scripts/submit-indexnow.mjs`: submits the sitemap URLs to IndexNow
  (Bing, Yandex, ...). The key file is `4cf603a9bb6e4d6289f74915a492eac3.txt`
  at the site root and must be reachable on the submitted host. The host
  defaults to `matthew-nader.web.app`; override it with
  `SITE_HOST=example.com node scripts/submit-indexnow.mjs`.

## Rebuilding the engine

The C sources are in `../engine/src`. After rebuilding with Emscripten, copy the
generated `engine.js` and `engine.wasm` into `js/wasm/`.

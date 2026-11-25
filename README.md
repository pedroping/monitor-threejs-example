# 3D CRT Monitor Portfolio

A retro CRT TV rendered with Three.js, with a real web page shown on its
screen. The page is HTML placed in 3D with `CSS3DRenderer`, so it stays fully
interactive (clickable, selectable, typeable), and it is clipped to the curved
bezel so it looks like it sits inside the glass.

This repository holds a few versions of that idea:

| Folder | What is on the screen | Stack | Status |
| --- | --- | --- | --- |
| [`frontend-vanilla-v2/`](frontend-vanilla-v2/) | A Windows XP desktop portfolio (an Angular app) in an iframe | Plain HTML/CSS/ES modules, no build | **Current site** |
| [`frontend-vanilla/`](frontend-vanilla/) | An xterm.js terminal driven by the C engine | Plain HTML/CSS/ES modules, no build | Terminal version |
| [`frontend/`](frontend/) | The same terminal, with content from Firestore | React + Vite | Original app |
| [`engine/`](engine/) | Command interpreter used by both terminal versions | C (Flex + Bison + cJSON) → WebAssembly | Used by the terminal versions |

Each folder has its own README with details.

## How it works (all versions)

```text
            ┌─────────────────────────────┐
            │  UI layer (settings panel)  │  plain HTML on top
            ├─────────────────────────────┤
 camera ──▶ │  CSS3DRenderer: the screen  │  real HTML, moved with CSS matrix3d()
     │      ├─────────────────────────────┤
     └────▶ │  WebGLRenderer: TV, room    │  the 3D world on a <canvas>
            └─────────────────────────────┘
```

1. **Two renderers, one camera.** WebGL draws the TV model, lights, background
   and dust. CSS3D draws the HTML screen. Both use the same camera every frame,
   so the HTML stays glued to the TV.
2. **Fitting the screen.** When the TV model loads, its glass screen mesh is
   hidden and the 1024×768 HTML element is scaled and rotated to sit exactly
   where the glass was.
3. **Occlusion with clip-path.** The CSS layer is always drawn on top of the
   canvas, so nothing in 3D can hide its corners. Instead the curved screen mesh
   is projected to 2D, rasterized, its outline traced and simplified, and the
   HTML is cut to that shape with `clip-path: polygon(...)`.
4. **Input.** The XP version lets the iframe receive mouse and keyboard events
   directly. The terminal versions raycast from the mouse onto an invisible
   plane over the screen and convert the hit's UV coordinate into a terminal
   cell, to support text selection and links.

In the vanilla versions the scene code is split by responsibility in
`js/scene/`:

| File | Responsibility |
| --- | --- |
| `index.js` | Builds the scene and runs the render loop; start reading here |
| `renderers.js` | Creates and resizes the WebGL and CSS3D renderers |
| `room.js` | Background photo and lighting |
| `dust.js` | Floating dust particles (one `InstancedMesh`) |
| `tv-model.js` | Loads the compressed TV model and fits the screen element to it |
| `occlusion.js` | The clip-path algorithm (project → rasterize → trace → simplify) |
| `camera-intro.js` | The opening camera move |
| `terminal-picking.js` | Mouse → terminal cell raycasting (terminal version only) |

## The command engine

`engine/src` is a small interpreter written in C:

- `lexer.l` (Flex) splits a command such as `cat projects` into tokens.
- `parser.y` (Bison) matches them against the grammar and formats the answer
  from the portfolio JSON (parsed with cJSON).
- Emscripten compiles it to `engine.js` + `engine.wasm`. JavaScript calls
  `process_command(command, portfolioJson)` through `cwrap` and prints the
  returned text.

Rebuilding needs Emscripten, Flex and Bison; see the `Makefile`.

## Running a version locally

The vanilla versions need no install, just a static server from inside the
folder (ES modules and WASM don't load from `file://`):

```bash
cd frontend-vanilla-v2   # or frontend-vanilla
npx serve .
```

`frontend-vanilla-v2` also needs the portfolio built into its `os/` folder;
see its README. The React app runs with `npm install && npm run dev` inside
`frontend/`, plus a `src/firebaseConfig.js` with Firestore credentials.

## Credits

Based on the interactive 3D terminal portfolio by
[Matthew Nader](https://github.com/MatthewNader2) (live demo:
<https://matthew-nader.web.app>). Feel free to reuse the architecture for your
own portfolio, but please credit the original author.

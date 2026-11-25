// Entry point: creates every part of the page and connects them.
//
//   terminal/   the xterm terminal (typing, history, completion)
//   scene/      the 3D TV with the terminal mapped onto its screen
//   data/       portfolio content, formatted for the C engine
//   wasm/       the C command engine (compiled), see ../../engine
//   boot.js     fake "apt upgrade" animation shown while loading
//
// Startup: build the scene and terminal right away, then load the engine and
// the data while the boot animation plays. Commands typed before that are
// ignored; after it, each command goes to the engine and its answer is printed.
import { createTerminal } from "./terminal/index.js";
import { createScene } from "./scene/index.js";
import { initInteraction } from "./interaction.js";
import { initContextMenu } from "./context-menu.js";
import { initSettings } from "./settings.js";
import { buildPortfolioData, expandPlaceholders } from "./data/index.js";
import { runBootSequence } from "./boot.js";
import { setSoundEnabled } from "./audio-fx.js";

// Reply the engine sends for `clear`/`cls`.
const CLEAR_COMMAND = "COMMAND_CLEAR";

const state = {
  isBooting: true,
  engine: null, // { processCommand(command, portfolioJson) }, once loaded
  portfolioJson: "",
  settings: { particles: true, glitch: true, sound: true },
};

const mount = document.getElementById("root");
const terminalEl = document.getElementById("terminal-screen");

// --- Commands ---

function handleCommand(command) {
  if (state.isBooting) return;

  if (!state.engine || !state.portfolioJson) {
    terminal.write("\r\nSystem not ready. Please wait.");
    terminal.prompt();
    return;
  }
  if (!command) {
    terminal.prompt();
    return;
  }

  const result = state.engine.processCommand(command, state.portfolioJson);
  if (result === CLEAR_COMMAND) {
    terminal.clear();
  } else {
    terminal.write(expandPlaceholders(result));
    terminal.prompt();
  }
}

const terminal = createTerminal(terminalEl.querySelector(".terminal-region"), { onCommand: handleCommand });

// --- Settings panel ---

const settingsPanel = initSettings({
  button: document.getElementById("settings-button"),
  panel: document.getElementById("settings-panel"),
  settings: state.settings,
  onChange: ({ glitch, sound }) => {
    setSoundEnabled(sound);
    terminalEl.classList.toggle("crt-effects", glitch);
    terminalEl.classList.toggle("crt-scanlines", glitch);
    // `particles` is read by the scene every frame.
  },
});

// --- Scene and pointer input ---

const { pickTerminalCell } = createScene({
  mount,
  terminalEl,
  terminal,
  getSettings: () => state.settings,
  isBootFinished: () => !state.isBooting,
});

const contextMenu = initContextMenu({ menu: document.getElementById("context-menu"), mount, terminal });
initInteraction({ mount, terminal, contextMenu, pickTerminalCell });

// --- Startup ---

/** Loads the compiled C engine and exposes its process_command function. */
async function loadEngine() {
  const { default: createEngine } = await import("./wasm/engine.js");
  const engine = await createEngine();
  return { processCommand: engine.cwrap("process_command", "string", ["string", "string"]) };
}

async function initialize() {
  try {
    state.engine = await loadEngine();
    const boot = runBootSequence(terminal); // plays while the data loads
    state.portfolioJson = await buildPortfolioData();
    await boot;
  } catch (error) {
    console.error("Initialization error:", error);
    terminal.write("\r\nSystem ready (offline fallback mode).\r\n");
    terminal.prompt();
  }
  state.isBooting = false; // lets commands through and starts the camera move
  settingsPanel.showButton();
}

setTimeout(initialize, 100);

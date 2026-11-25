// Entry point: wires the terminal, 3D scene, settings panel and WASM engine.
import { createTerminal } from "./terminal.js";
import { createScene } from "./scene/index.js";
import { initInteraction } from "./interaction.js";
import { buildPortfolioData, expandPlaceholders } from "./data.js";
import { runBootSequence } from "./boot.js";
import { setSoundEnabled } from "./audio-fx.js";

const state = {
  isBooting: true,
  engine: null, // { processCommand(command, portfolioJson) }
  portfolioJson: "",
  settings: { particles: true, glitch: true, sound: true },
};

const mount = document.getElementById("root");
const terminalEl = document.getElementById("terminal-screen");
const gearButton = document.getElementById("settings-button");
const settingsPanel = document.getElementById("settings-panel");
const contextMenu = document.getElementById("context-menu");

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
  if (result === "COMMAND_CLEAR") {
    terminal.clear();
  } else {
    terminal.write(expandPlaceholders(result));
    terminal.prompt();
  }
}

const terminal = createTerminal(terminalEl.querySelector(".terminal-region"), { onCommand: handleCommand });

// --- Settings ---

function applySettings() {
  const { particles, glitch, sound } = state.settings;
  setSoundEnabled(sound);
  terminalEl.classList.toggle("crt-effects", glitch);
  terminalEl.classList.toggle("crt-scanlines", glitch);
  for (const toggle of settingsPanel.querySelectorAll("[role=switch]")) {
    toggle.setAttribute("aria-checked", String({ particles, glitch, sound }[toggle.dataset.setting]));
  }
}

// Runs `action` on click and on Enter/Space, like a native button.
function onActivate(element, action) {
  element.addEventListener("click", action);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      action();
      event.preventDefault();
    }
  });
}

onActivate(gearButton, () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

for (const toggle of settingsPanel.querySelectorAll("[role=switch]")) {
  const key = toggle.dataset.setting;
  onActivate(toggle, () => {
    state.settings[key] = !state.settings[key];
    applySettings();
  });
}

function finishBoot() {
  state.isBooting = false;
  gearButton.hidden = false;
  gearButton.tabIndex = 0;
}

// --- Startup ---

async function loadEngine() {
  const { default: createEngine } = await import("./wasm/engine.js");
  const engine = await createEngine();
  return { processCommand: engine.cwrap("process_command", "string", ["string", "string"]) };
}

async function initialize() {
  try {
    state.engine = await loadEngine();
    const boot = runBootSequence(terminal);
    state.portfolioJson = await buildPortfolioData();
    await boot;
  } catch (error) {
    console.error("Initialization error:", error);
    terminal.write("\r\nSystem ready (offline fallback mode).\r\n");
    terminal.prompt();
  }
  finishBoot();
}

applySettings();

const { pickTerminalCell } = createScene({
  mount,
  terminalEl,
  terminal,
  getSettings: () => state.settings,
  isBootFinished: () => !state.isBooting,
});

initInteraction({ mount, contextMenu, terminal, pickTerminalCell });

setTimeout(initialize, 100);

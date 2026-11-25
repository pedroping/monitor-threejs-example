// Entry point: maps the portfolio iframe onto the TV screen and wires the
// settings panel. The portfolio itself is the Angular app built into /os/.
import { createScene } from "./scene.js";

// How long the camera stays close on the screen after the portfolio loads.
const INTRO_HOLD_MS = 1200;

const state = {
  introDone: false,
  settings: { particles: true, glitch: true },
};

const mount = document.getElementById("root");
const screenEl = document.getElementById("screen");
const frame = document.getElementById("screen-frame");
const gearButton = document.getElementById("settings-button");
const settingsPanel = document.getElementById("settings-panel");

// --- Settings ---

function applySettings() {
  const { particles, glitch } = state.settings;
  screenEl.classList.toggle("crt-effects", glitch);
  for (const toggle of settingsPanel.querySelectorAll("[role=switch]")) {
    toggle.setAttribute("aria-checked", String({ particles, glitch }[toggle.dataset.setting]));
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

// --- Startup ---

function finishIntro() {
  if (state.introDone) return;
  state.introDone = true;
  gearButton.hidden = false;
  gearButton.tabIndex = 0;
}

frame.addEventListener("load", () => setTimeout(finishIntro, INTRO_HOLD_MS), { once: true });
// Don't keep the camera stuck on the screen if the portfolio never loads.
setTimeout(finishIntro, 10000);

applySettings();
createScene({
  mount,
  screenEl,
  getSettings: () => state.settings,
  isIntroDone: () => state.introDone,
});

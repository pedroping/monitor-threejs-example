// Entry point: puts the portfolio on the TV and wires the settings panel.
//
//   scene/       the 3D TV; the #screen element is mapped onto its screen
//   settings.js  the gear button and its DUST FX / CRT FX switches
//
// The portfolio itself is the Angular app built into /os/ and loaded by the
// iframe in index.html. Once it has loaded, the camera pulls back from the
// screen to show the whole TV.
import { createScene } from "./scene/index.js";
import { initSettings } from "./settings.js";

// How long the camera stays close on the screen after the portfolio loads.
const INTRO_HOLD_MS = 1200;
// Pull back anyway after this long, in case the portfolio never loads.
const INTRO_FALLBACK_MS = 10000;

const state = {
  introDone: false,
  settings: { particles: true, glitch: true },
};

const screenEl = document.getElementById("screen");
const frame = document.getElementById("screen-frame");

const settingsPanel = initSettings({
  button: document.getElementById("settings-button"),
  panel: document.getElementById("settings-panel"),
  settings: state.settings,
  onChange: ({ glitch }) => {
    screenEl.classList.toggle("crt-effects", glitch);
    // `particles` is read by the scene every frame.
  },
});

function finishIntro() {
  if (state.introDone) return;
  state.introDone = true;
  settingsPanel.showButton();
}

frame.addEventListener("load", () => setTimeout(finishIntro, INTRO_HOLD_MS), { once: true });
setTimeout(finishIntro, INTRO_FALLBACK_MS);

createScene({
  mount: document.getElementById("root"),
  screenEl,
  getSettings: () => state.settings,
  isIntroDone: () => state.introDone,
});

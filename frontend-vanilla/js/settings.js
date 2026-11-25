// The gear button and its settings panel (markup in index.html).
//
// Each switch has data-setting="<name>". Clicking it (or Enter/Space) flips
// that setting and calls `onChange(settings)`.

/** Runs `action` on click and on Enter/Space, like a native button. */
function onActivate(element, action) {
  element.addEventListener("click", action);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      action();
      event.preventDefault();
    }
  });
}

/**
 * @param {object} options
 * @param {HTMLElement} options.button  the gear button
 * @param {HTMLElement} options.panel   the panel with the [role=switch] toggles
 * @param {object} options.settings     current values, e.g. { particles: true }; mutated in place
 * @param {(settings: object) => void} options.onChange  applies the settings
 * @returns {{ showButton: () => void }}  reveals the gear once the page is ready
 */
export function initSettings({ button, panel, settings, onChange }) {
  const switches = [...panel.querySelectorAll("[role=switch]")];

  const apply = () => {
    for (const toggle of switches) {
      toggle.setAttribute("aria-checked", String(settings[toggle.dataset.setting]));
    }
    onChange(settings);
  };

  onActivate(button, () => {
    panel.hidden = !panel.hidden;
  });

  for (const toggle of switches) {
    const key = toggle.dataset.setting;
    onActivate(toggle, () => {
      settings[key] = !settings[key];
      apply();
    });
  }

  apply(); // sync the switches and the page with the initial values

  return {
    showButton() {
      button.hidden = false;
      button.tabIndex = 0;
    },
  };
}

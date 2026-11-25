// The right-click Copy / Paste menu for the terminal.
// The menu markup is in index.html (#context-menu with [data-action] items).

/**
 * Wires the menu: right-click on `mount` opens it, clicking an item runs it.
 * Returns `{ isOpen, close }` for the pointer handlers in interaction.js.
 */
export function initContextMenu({ menu, mount, terminal }) {
  const isOpen = () => !menu.hidden;
  const close = () => {
    menu.hidden = true;
  };
  const openAt = (x, y) => {
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.hidden = false;
  };

  // data-action name -> what it does. Clipboard calls can be denied by the browser.
  const actions = {
    async copy() {
      const text = terminal.getSelection();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // clipboard access denied
      }
    },
    async paste() {
      try {
        const text = await navigator.clipboard.readText();
        if (text) terminal.paste(text);
      } catch {
        // clipboard access denied
      }
    },
  };

  menu.addEventListener("click", async (event) => {
    const item = event.target.closest("[data-action]");
    if (!item) return;
    await actions[item.dataset.action]();
    close();
  });
  menu.addEventListener("contextmenu", (event) => event.preventDefault());

  mount.addEventListener("contextmenu", (event) => {
    event.preventDefault(); // replace the browser's own menu
    openAt(event.clientX, event.clientY);
  });

  return { isOpen, close };
}

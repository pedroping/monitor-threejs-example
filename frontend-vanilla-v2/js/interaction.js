// Mouse/touch handling over the 3D screen: drag selection, double/triple-click
// word/line selection, link hover + open, and the copy/paste context menu.

/**
 * @param {object} options
 * @param {HTMLElement} options.mount        element receiving pointer events
 * @param {HTMLElement} options.contextMenu  menu element with [data-action] items
 * @param {object} options.terminal          terminal API from createTerminal()
 * @param {(x: number, y: number) => ?{col: number, row: number, dims: object}} options.pickTerminalCell
 */
export function initInteraction({ mount, contextMenu, terminal, pickTerminalCell }) {
  let selectionStart = null;
  let isDragging = false;
  let hoveredLink = null;

  // --- Context menu ---

  const isMenuOpen = () => !contextMenu.hidden;

  const openMenu = (x, y) => {
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.hidden = false;
  };

  const closeMenu = () => {
    contextMenu.hidden = true;
  };

  const menuActions = {
    async copy() {
      const text = terminal.getSelection();
      if (text) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Clipboard access denied
        }
      }
    },
    async paste() {
      try {
        const text = await navigator.clipboard.readText();
        if (text) terminal.paste(text);
      } catch {
        // Clipboard access denied
      }
    },
  };

  contextMenu.addEventListener("click", async (event) => {
    const item = event.target.closest("[data-action]");
    if (!item) return;
    await menuActions[item.dataset.action]();
    closeMenu();
  });
  contextMenu.addEventListener("contextmenu", (event) => event.preventDefault());

  mount.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openMenu(event.clientX, event.clientY);
  });

  // --- Pointer handling ---

  const onPointerDown = (clientX, clientY, button, clickCount) => {
    if (isMenuOpen()) closeMenu();
    if (button !== 0) return;

    const coords = pickTerminalCell(clientX, clientY);
    if (!coords) return;

    if (clickCount === 2) {
      terminal.selectWordAt(coords.col, coords.row);
      isDragging = false;
      return;
    }
    if (clickCount === 3) {
      terminal.selectLineAt(coords.row);
      isDragging = false;
      return;
    }

    isDragging = true;
    selectionStart = { col: coords.col, row: coords.row };
    terminal.clearSelection();
  };

  // Shows the hand cursor while a terminal link is under the pointer.
  const updateHover = (coords) => {
    hoveredLink = coords ? terminal.getLinkAt(coords.col, coords.row) : null;
    document.body.classList.toggle("force-pointer", Boolean(hoveredLink));
  };

  // Selects every cell between the drag start and `end`, in reading order.
  const extendSelection = (end) => {
    const { cols } = end.dims;
    const a = selectionStart.row * cols + selectionStart.col;
    const b = end.row * cols + end.col;
    const startIdx = Math.min(a, b);
    const length = Math.abs(b - a) + 1;
    terminal.select(startIdx % cols, Math.floor(startIdx / cols), length);
  };

  const onPointerMove = (clientX, clientY) => {
    if (isMenuOpen()) return;
    const coords = pickTerminalCell(clientX, clientY);
    updateHover(coords);
    if (isDragging && coords && selectionStart) extendSelection(coords);
  };

  const onPointerUp = (clientX, clientY) => {
    const coords = selectionStart && pickTerminalCell(clientX, clientY);
    const isClick = coords && coords.col === selectionStart.col && coords.row === selectionStart.row;
    if (isClick && hoveredLink) {
      window.open(hoveredLink, "_blank", "noopener,noreferrer");
    }
    isDragging = false;
    selectionStart = null;
  };

  mount.addEventListener("mousedown", (e) => onPointerDown(e.clientX, e.clientY, e.button, e.detail));
  mount.addEventListener("mousemove", (e) => onPointerMove(e.clientX, e.clientY));
  mount.addEventListener("mouseup", (e) => onPointerUp(e.clientX, e.clientY));

  const firstTouch = (list, handler) => list.length > 0 && handler(list[0]);
  mount.addEventListener(
    "touchstart",
    (e) => firstTouch(e.touches, (t) => onPointerDown(t.clientX, t.clientY, 0, 1)),
    { passive: true },
  );
  mount.addEventListener(
    "touchmove",
    (e) => firstTouch(e.touches, (t) => onPointerMove(t.clientX, t.clientY)),
    { passive: true },
  );
  mount.addEventListener(
    "touchend",
    (e) => firstTouch(e.changedTouches, (t) => onPointerUp(t.clientX, t.clientY)),
    { passive: true },
  );
}

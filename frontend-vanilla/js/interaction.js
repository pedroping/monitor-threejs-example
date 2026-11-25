// Mouse and touch on the 3D terminal: drag to select, double-click for a word,
// triple-click for a line, hover/click on links.
//
// The terminal itself ignores the pointer (it is a CSS3D element under
// pointer-events: none), so every event here is turned into a terminal cell
// with `pickTerminalCell`, which raycasts onto the screen (scene/terminal-picking.js).

/**
 * @param {object} options
 * @param {HTMLElement} options.mount   element receiving pointer events
 * @param {object} options.terminal     terminal API from createTerminal()
 * @param {{isOpen: () => boolean, close: () => void}} options.contextMenu
 * @param {(x: number, y: number) => ?{col: number, row: number, dims: object}} options.pickTerminalCell
 */
export function initInteraction({ mount, terminal, contextMenu, pickTerminalCell }) {
  let selectionStart = null; // cell where the current drag began
  let isDragging = false;
  let hoveredLink = null; // URL under the pointer, opened on click

  const onPointerDown = (clientX, clientY, button, clickCount) => {
    if (contextMenu.isOpen()) contextMenu.close();
    if (button !== 0) return; // left button only

    const cell = pickTerminalCell(clientX, clientY);
    if (!cell) return;

    if (clickCount === 2) {
      terminal.selectWordAt(cell.col, cell.row);
      isDragging = false;
      return;
    }
    if (clickCount === 3) {
      terminal.selectLineAt(cell.row);
      isDragging = false;
      return;
    }

    isDragging = true;
    selectionStart = { col: cell.col, row: cell.row };
    terminal.clearSelection();
  };

  // Shows the hand cursor while a link is under the pointer.
  const updateHover = (cell) => {
    hoveredLink = cell ? terminal.getLinkAt(cell.col, cell.row) : null;
    document.body.classList.toggle("force-pointer", Boolean(hoveredLink));
  };

  // Selects every cell from the drag start to `end`, in reading order.
  const extendSelection = (end) => {
    const { cols } = end.dims;
    const a = selectionStart.row * cols + selectionStart.col; // cells counted from the top-left
    const b = end.row * cols + end.col;
    const first = Math.min(a, b);
    const length = Math.abs(b - a) + 1;
    terminal.select(first % cols, Math.floor(first / cols), length);
  };

  const onPointerMove = (clientX, clientY) => {
    if (contextMenu.isOpen()) return;
    const cell = pickTerminalCell(clientX, clientY);
    updateHover(cell);
    if (isDragging && cell && selectionStart) extendSelection(cell);
  };

  const onPointerUp = (clientX, clientY) => {
    // A press and release on the same cell is a click (opens a hovered link).
    const cell = selectionStart && pickTerminalCell(clientX, clientY);
    const isClick = cell && cell.col === selectionStart.col && cell.row === selectionStart.row;
    if (isClick && hoveredLink) {
      window.open(hoveredLink, "_blank", "noopener,noreferrer");
    }
    isDragging = false;
    selectionStart = null;
  };

  // --- Mouse ---
  mount.addEventListener("mousedown", (e) => onPointerDown(e.clientX, e.clientY, e.button, e.detail));
  mount.addEventListener("mousemove", (e) => onPointerMove(e.clientX, e.clientY));
  mount.addEventListener("mouseup", (e) => onPointerUp(e.clientX, e.clientY));

  // --- Touch: the first finger acts like a left mouse button ---
  const withFirstTouch = (touches, handler) => touches.length > 0 && handler(touches[0]);
  const passive = { passive: true };
  mount.addEventListener(
    "touchstart",
    (e) => withFirstTouch(e.touches, (t) => onPointerDown(t.clientX, t.clientY, 0, 1)),
    passive,
  );
  mount.addEventListener("touchmove", (e) => withFirstTouch(e.touches, (t) => onPointerMove(t.clientX, t.clientY)), passive);
  mount.addEventListener(
    "touchend",
    (e) => withFirstTouch(e.changedTouches, (t) => onPointerUp(t.clientX, t.clientY)),
    passive,
  );
}

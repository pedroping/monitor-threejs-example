// Mouse → terminal cell. The terminal is drawn by CSS3D but ignores pointer
// events (the canvas gets them), so to select text we raycast from the mouse
// onto an invisible plane covering the screen and turn the hit's UV coordinate
// into a terminal column and row.
import * as THREE from "three";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "./tv-model.js";

// Inner padding of the terminal element (.terminal-region in css/style.css).
const TERMINAL_PADDING = 50;

/**
 * Creates the invisible pick plane (add it to the scene and align it with the
 * screen) and the `pickCell(clientX, clientY)` function that uses it.
 */
export function createTerminalPicker({ mount, camera, terminal }) {
  // A 1x1 plane; alignToScreen() scales it to the screen size.
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ visible: false }));
  plane.name = "terminalPickPlane";

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  /** Returns `{ col, row, dims }` under the given viewport point, or null. */
  const pickCell = (clientX, clientY) => {
    // Viewport pixels → normalized device coordinates (-1..1, y up).
    const rect = mount.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / mount.clientWidth) * 2 - 1;
    pointer.y = -((clientY - rect.top) / mount.clientHeight) * 2 + 1;

    plane.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObject(plane);
    if (!hit) return null;

    // UV (0..1 across the plane, y up) → pixel inside the 1024x768 terminal.
    const localX = hit.uv.x * SCREEN_WIDTH;
    const localY = (1 - hit.uv.y) * SCREEN_HEIGHT;

    // Pixel → cell, inside the padded text area.
    const dims = terminal.getDimensions();
    const cellWidth = (SCREEN_WIDTH - TERMINAL_PADDING * 2) / dims.cols;
    const cellHeight = (SCREEN_HEIGHT - TERMINAL_PADDING * 2) / dims.rows;
    const col = Math.floor((localX - TERMINAL_PADDING) / cellWidth + 0.5);
    const row = Math.floor((localY - TERMINAL_PADDING) / cellHeight);

    return {
      col: THREE.MathUtils.clamp(col, 0, dims.cols - 1),
      row: THREE.MathUtils.clamp(row, 0, dims.rows - 1),
      dims,
    };
  };

  return { plane, pickCell };
}

// Builds the whole 3D scene and puts the terminal on the TV screen.
//
// What happens, in order:
//   1. create the camera, both renderers, the room and the dust
//   2. load the TV model; when it arrives, hide its glass screen and put the
//      terminal element (a CSS3DObject) in its place
//   3. every frame: move the camera intro, the dust, then render both renderers
//      with the same camera so the terminal stays glued to the TV
import * as THREE from "three";
import { CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js";
import { createRenderers, resizeToFit } from "./renderers.js";
import { loadBackground, addLights } from "./room.js";
import { createDustParticles } from "./dust.js";
import { createModelLoader, addTvToScene, alignToScreen } from "./tv-model.js";
import { buildClipPathFromMesh } from "./occlusion.js";
import { createCameraIntro } from "./camera-intro.js";
import { createTerminalPicker } from "./terminal-picking.js";

const MODEL_URL = "crt_tv_basis.glb";
const BASIS_TRANSCODER_PATH = "basis/";
const BACKGROUND_URL = "assets/background.jpg";

// Wait this long after the last resize event before re-tracing the clip-path.
const RESIZE_DEBOUNCE_MS = 150;

/**
 * @param {object} options
 * @param {HTMLElement} options.mount       element that holds the renderers
 * @param {HTMLElement} options.terminalEl  the 1024x768 terminal element
 * @param {object} options.terminal         terminal API from createTerminal()
 * @param {() => {particles: boolean}} options.getSettings
 * @param {() => boolean} options.isBootFinished  true once the camera may pull back
 * @returns {{ pickTerminalCell: (clientX: number, clientY: number) => ?object }}
 */
export function createScene({ mount, terminalEl, terminal, getSettings, isBootFinished }) {
  // WebGL objects live in `scene`; the terminal lives in `cssScene`.
  const scene = new THREE.Scene();
  const cssScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  const intro = createCameraIntro(camera);

  const renderers = createRenderers(mount);
  const { webglRenderer, cssRenderer } = renderers;
  loadBackground(scene, BACKGROUND_URL);
  addLights(scene);
  const dust = createDustParticles(scene);

  const picker = createTerminalPicker({ mount, camera, terminal });
  scene.add(picker.plane);
  let modelReady = false;

  // Replaced once the TV has loaded (there is no screen mesh to trace before).
  let updateClipPath = () => {};

  let resizeTimer = null;
  const onWindowResize = () => {
    resizeToFit(mount, camera, renderers);
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateClipPath();
      terminal.fit(); // recompute columns/rows for the new size
    }, RESIZE_DEBOUNCE_MS);
  };
  window.addEventListener("resize", onWindowResize);

  createModelLoader(webglRenderer, BASIS_TRANSCODER_PATH).load(MODEL_URL, (gltf) => {
    const screenMesh = addTvToScene(scene, gltf.scene);

    // The terminal becomes a 3D object, positioned over the TV's screen.
    const cssObject = new CSS3DObject(terminalEl);
    cssScene.add(cssObject);
    requestAnimationFrame(() => terminalEl.classList.add("is-visible"));

    // An invisible copy of the screen mesh, kept where the terminal sits, used
    // to trace the clip-path outline.
    const clipMesh = screenMesh.clone();
    clipMesh.material = new THREE.MeshBasicMaterial({ visible: false });
    scene.add(clipMesh);

    alignToScreen(screenMesh, cssObject, [clipMesh, picker.plane]); // once: the TV never moves
    modelReady = true;

    updateClipPath = () => {
      const clipPath = buildClipPathFromMesh(clipMesh, camera, webglRenderer.domElement);
      if (clipPath) {
        terminalEl.style.clipPath = clipPath;
        terminalEl.style.webkitClipPath = clipPath;
      }
    };

    const animate = () => {
      requestAnimationFrame(animate);

      const introJustFinished = intro.update(isBootFinished());
      // The clip-path depends on the camera, so re-trace it at the final pose.
      if (introJustFinished) updateClipPath();

      const { particles: showDust } = getSettings();
      dust.mesh.visible = showDust;
      if (showDust) dust.update();

      webglRenderer.render(scene, camera);
      cssRenderer.render(cssScene, camera);
    };

    onWindowResize();
    animate();
  });

  return {
    pickTerminalCell: (clientX, clientY) => (modelReady ? picker.pickCell(clientX, clientY) : null),
  };
}

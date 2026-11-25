// The two renderers that draw the scene, stacked on top of each other:
//   - WebGLRenderer: the 3D world (TV, lights, background, dust) on a <canvas>.
//   - CSS3DRenderer: real HTML elements, moved into place with CSS matrix3d().
// Both are rendered with the same camera every frame, so they stay aligned.
// Their stacking order (WebGL below, CSS3D above) is set in css/style.css.
import * as THREE from "three";
import { CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";

/** Creates both renderers and appends them to `mount`. */
export function createRenderers(mount) {
  const webglRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  webglRenderer.setSize(window.innerWidth, window.innerHeight);
  webglRenderer.outputColorSpace = THREE.SRGBColorSpace; // final image in sRGB, what screens expect
  webglRenderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic compression of bright lights
  webglRenderer.toneMappingExposure = 1.05;

  const cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(window.innerWidth, window.innerHeight);

  appendInContainer(mount, "webgl-renderer", webglRenderer.domElement);
  appendInContainer(mount, "css-renderer", cssRenderer.domElement);
  return { webglRenderer, cssRenderer };
}

/** Matches the camera and both renderers to the size of `mount`. */
export function resizeToFit(mount, camera, { webglRenderer, cssRenderer }) {
  const { clientWidth, clientHeight } = mount;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  webglRenderer.setSize(clientWidth, clientHeight);
  cssRenderer.setSize(clientWidth, clientHeight);
  cssRenderer.domElement.style.width = `${clientWidth}px`;
  cssRenderer.domElement.style.height = `${clientHeight}px`;
}

function appendInContainer(mount, id, element) {
  const container = document.createElement("div");
  container.id = id;
  container.classList.add("render-container");
  container.appendChild(element);
  mount.appendChild(container);
}

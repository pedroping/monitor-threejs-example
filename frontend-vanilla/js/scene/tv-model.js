// The CRT TV: loading the compressed glTF, hiding its glass screen, and placing
// the HTML screen element exactly where that glass was.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// Size of the terminal element in CSS pixels (see .terminal-screen in css/style.css).
export const SCREEN_WIDTH = 1024;
export const SCREEN_HEIGHT = 768;

const TV_SCALE = 1.08;
const TV_POSITION = [0, -0.18, 0];

// Hand-tuned corrections between the screen mesh's bounding box and where the
// HTML should actually sit: CRT glass leans back a little (rotX) and the
// visible area is a bit smaller than the glass (scale).
const SCREEN_ADJUST = {
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  rotX: -0.09079,
  rotY: 0,
  rotZ: 0,
  scaleX: 0.922,
  scaleY: 0.922,
};

// Casing material: dark charcoal plastic.
const CASING = { color: 0.18, metalness: 0.04, roughness: 0.65, envMapIntensity: 0.35 };

/**
 * A GLTFLoader that understands the TV file's compression:
 * Meshopt for geometry and KTX2 (Basis Universal) for textures.
 */
export function createModelLoader(webglRenderer, transcoderPath) {
  const ktx2Loader = new KTX2Loader().setTranscoderPath(transcoderPath);
  ktx2Loader.detectSupport(webglRenderer); // which compressed formats this GPU supports
  const gltfLoader = new GLTFLoader();
  gltfLoader.setKTX2Loader(ktx2Loader);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  return gltfLoader;
}

/**
 * Restyles the TV, places it in the scene and returns its (now hidden) screen
 * mesh, whose position and shape the HTML screen will copy.
 */
export function addTvToScene(scene, tv) {
  const screenMesh = prepareTvModel(tv);

  const group = new THREE.Group();
  group.position.set(...TV_POSITION);
  group.rotation.y = Math.PI; // the model faces away from the camera by default
  group.scale.setScalar(TV_SCALE);
  group.add(tv);
  scene.add(group);

  return screenMesh;
}

/** Hides the glass screen mesh (the HTML replaces it) and restyles the casing. */
function prepareTvModel(tv) {
  // The model doesn't name its screen clearly, so it is found by material
  // name, mesh name or position in the file. If you re-export the model, give
  // the screen a clear name and use tv.getObjectByName() instead.
  let screenMesh = null;
  let meshIndex = 0;
  tv.traverse((child) => {
    if (!child.isMesh) return;
    const materialName = child.material?.name || "";
    const looksLikeScreen = materialName.includes("Screen") || child.name.includes("_2") || meshIndex === 2;
    if (looksLikeScreen) {
      child.visible = false;
      screenMesh = child;
    } else {
      child.visible = true;
      child.material.metalness = CASING.metalness;
      child.material.roughness = CASING.roughness;
      child.material.envMapIntensity = CASING.envMapIntensity;
      child.material.color?.setRGB(CASING.color, CASING.color, CASING.color);
    }
    meshIndex++;
  });

  screenMesh ??=
    tv.getObjectByName("defaultMaterial_2") ||
    tv.children[0]?.children?.find((m) => m.isMesh && m.name.includes("defaultMaterial"));
  if (screenMesh) screenMesh.visible = false;
  return screenMesh;
}

/**
 * Places the CSS3D screen over the TV's screen mesh, and copies that placement
 * to helper meshes that must cover the same area (`overlays`, sized in world
 * units on a 1x1 plane).
 *
 * In CSS3D one CSS pixel is one world unit, so the 1024x768 element is scaled
 * down to the size of the real screen (about 0.3 units wide).
 */
export function alignToScreen(screenMesh, cssObject, overlays) {
  if (!screenMesh?.geometry) return;

  screenMesh.updateWorldMatrix(true, false);
  const screenBox = new THREE.Box3().setFromObject(screenMesh);
  const size = screenBox.getSize(new THREE.Vector3());
  if (size.x === 0 || size.y === 0) return;

  // Same center and rotation as the screen mesh...
  cssObject.position.copy(screenBox.getCenter(new THREE.Vector3()));
  cssObject.quaternion.copy(screenMesh.getWorldQuaternion(new THREE.Quaternion()));
  // ...scaled from pixels to world units (0.995 leaves a hairline margin)...
  cssObject.scale.set((size.x / SCREEN_WIDTH) * 0.995, (size.y / SCREEN_HEIGHT) * 0.995, 1);
  // ...plus the hand-tuned corrections.
  cssObject.position.x += SCREEN_ADJUST.offsetX;
  cssObject.position.y -= SCREEN_ADJUST.offsetY;
  cssObject.translateZ(SCREEN_ADJUST.offsetZ);
  const tilt = new THREE.Euler(SCREEN_ADJUST.rotX, SCREEN_ADJUST.rotY, SCREEN_ADJUST.rotZ);
  cssObject.quaternion.multiply(new THREE.Quaternion().setFromEuler(tilt)); // multiply = add a rotation
  cssObject.scale.x *= SCREEN_ADJUST.scaleX;
  cssObject.scale.y *= SCREEN_ADJUST.scaleY;

  for (const overlay of overlays) {
    overlay.position.copy(cssObject.position);
    overlay.quaternion.copy(cssObject.quaternion);
    overlay.scale.set(size.x * SCREEN_ADJUST.scaleX, size.y * SCREEN_ADJUST.scaleY, 1);
    overlay.updateMatrixWorld();
  }
}

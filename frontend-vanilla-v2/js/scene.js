// Three.js scene: CRT TV model (WebGL) with the portfolio iframe mapped onto
// its screen (CSS3D), clip-path occlusion, dust particles and the camera intro.
import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// Screen element size in CSS pixels (matches .screen in css/style.css).
const SCREEN_WIDTH = 1024;
const SCREEN_HEIGHT = 768;

// Fine-tuning of the screen plane relative to the TV screen mesh.
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
const TV_SCALE = 1.08;
const BACKGROUND_ZOOM = 1.1;
const RASTER_SCALE = 0.5;

// Camera intro: starts close on the screen, pulls back once booting is done.
const START_CAM_POS = new THREE.Vector3(-0.012, 0.19, 0.33);
const START_LOOK_AT = new THREE.Vector3(-0.012, 0.079, -0.485);
const END_CAM_POS = new THREE.Vector3(0, 0.1, 0.7);
const END_LOOK_AT = new THREE.Vector3(0, 0, 0);
const TRANSITION_SPEED = 0.015;

const PARTICLE_COUNT = 400;
const PARTICLE_PALETTE = [0xffffff, 0xdddddd, 0xeeeecc, 0xddeeff, 0xfffacd];

// --- Occlusion helpers ---
// The TV screen is curved while the screen element is a flat rectangle, so its
// corners would poke out of the bezel. We project the screen mesh to 2D,
// rasterize it into a mask, trace the mask outline (Moore-Neighbor), simplify
// it (Ramer-Douglas-Peucker) and apply it as a CSS clip-path polygon.

function worldToScreenXY(vWorld, cam, canvasRect) {
  const ndc = vWorld.clone().project(cam);
  const x = (ndc.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
  const y = (-ndc.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
  return [x, y];
}

// Moore-Neighbor boundary tracing on a binary mask.
function traceBoundary(imgData, w, h) {
  let start = -1;
  for (let i = 0; i < w * h; i++) {
    if (imgData[i]) {
      start = i;
      break;
    }
  }
  if (start === -1) return [];
  const idxToXY = (idx) => [idx % w, Math.floor(idx / w)];
  const xyToIdx = (x, y) => y * w + x;
  const dirs = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  const [sx, sy] = idxToXY(start);
  let cx = sx;
  let cy = sy;
  let pd = 7;
  const contour = [];
  let step = 0;
  const maxSteps = w * h * 10;
  do {
    contour.push([cx, cy]);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const di = (pd + 1 + k) % 8;
      const nx = cx + dirs[di][0];
      const ny = cy + dirs[di][1];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && imgData[xyToIdx(nx, ny)]) {
        cx = nx;
        cy = ny;
        pd = (di + 6) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    step++;
    if (step > maxSteps) break;
  } while (!(cx === sx && cy === sy));
  return contour;
}

// Ramer-Douglas-Peucker polyline simplification.
function simplifyRDP(points, epsilon) {
  if (points.length < 3) return points.slice();
  const sqr = (a) => a * a;
  function dist2PointToSeg(px, py, [x1, y1], [x2, y2]) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let t = lenSq ? dot / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * C;
    const cy = y1 + t * D;
    return sqr(px - cx) + sqr(py - cy);
  }
  const eps2 = epsilon * epsilon;
  const result = [];
  function rdp(arr, i, j) {
    let idx = -1;
    let maxd = -1;
    for (let k = i + 1; k < j; k++) {
      const d2 = dist2PointToSeg(arr[k][0], arr[k][1], arr[i], arr[j]);
      if (d2 > maxd) {
        idx = k;
        maxd = d2;
      }
    }
    if (maxd > eps2) {
      rdp(arr, i, idx);
      rdp(arr, idx, j);
    } else {
      result.push(arr[i]);
    }
  }
  rdp(points, 0, points.length - 1);
  result.push(points[points.length - 1]);
  return result;
}

function contourToClipPathPercent(contour, rectLeft, rectTop, rectW, rectH) {
  if (rectW < 1 || rectH < 1) return "polygon(0% 0%)";
  const pts = contour.map(([x, y]) => {
    const px = ((x + 0.5 - rectLeft) / rectW) * 100;
    const py = ((y + 0.5 - rectTop) / rectH) * 100;
    return `${px.toFixed(3)}% ${py.toFixed(3)}%`;
  });
  return `polygon(${pts.join(", ")})`;
}

// Draws the projected triangles off-screen and returns a 0/1 coverage mask.
function rasterizeProjectedTriangles(projectedTris, canvasW, canvasH) {
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  for (const tri of projectedTris) {
    ctx.moveTo(tri[0][0], tri[0][1]);
    ctx.lineTo(tri[1][0], tri[1][1]);
    ctx.lineTo(tri[2][0], tri[2][1]);
    ctx.closePath();
  }
  ctx.fill();
  const { data } = ctx.getImageData(0, 0, canvasW, canvasH);
  const mask = new Uint8Array(canvasW * canvasH);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    mask[j] = data[i + 3] > 0 ? 1 : 0;
  }
  return mask;
}

function buildClipPathFromMesh(meshToProject, camera, canvas) {
  meshToProject.updateWorldMatrix(true, false);
  const geom = meshToProject.geometry;
  if (!geom) return null;
  const posAttr = geom.attributes.position;
  const idxAttr = geom.index;
  const triCount = idxAttr ? idxAttr.count / 3 : posAttr.count / 3;
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width === 0 || canvasRect.height === 0) return null;

  const vertexIndex = (n) => (idxAttr ? idxAttr.array[n] : n);
  const projectVertex = (n) => {
    const v = new THREE.Vector3().fromBufferAttribute(posAttr, vertexIndex(n));
    meshToProject.localToWorld(v);
    return worldToScreenXY(v, camera, canvasRect);
  };
  const projectedTris = [];
  for (let i = 0; i < triCount; i++) {
    projectedTris.push([projectVertex(3 * i), projectVertex(3 * i + 1), projectVertex(3 * i + 2)]);
  }

  // Rasterize at reduced resolution for speed, then scale the contour back up.
  const canvasW = Math.max(16, Math.floor(window.innerWidth * RASTER_SCALE));
  const canvasH = Math.max(16, Math.floor(window.innerHeight * RASTER_SCALE));
  const scaledTris = projectedTris.map((tri) => tri.map(([x, y]) => [x * RASTER_SCALE, y * RASTER_SCALE]));
  const mask = rasterizeProjectedTriangles(scaledTris, canvasW, canvasH);
  const contourScaled = traceBoundary(mask, canvasW, canvasH);
  if (contourScaled.length === 0) return null;
  const contour = contourScaled.map(([sx, sy]) => [sx / RASTER_SCALE, sy / RASTER_SCALE]);
  const simplified = simplifyRDP(contour, 2.0);

  // Express the polygon relative to its own bounding box, in percentages.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of simplified) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const rectW = Math.max(2, maxX - minX);
  const rectH = Math.max(2, maxY - minY);
  const localPoints = simplified.map(([x, y]) => [x - minX, y - minY]);
  return contourToClipPathPercent(localPoints, 0, 0, rectW, rectH);
}

// --- Scene setup ---

function createRenderers(mount) {
  const webglRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  webglRenderer.setSize(window.innerWidth, window.innerHeight);
  webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
  webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  webglRenderer.toneMappingExposure = 1.05;

  const cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(window.innerWidth, window.innerHeight);

  for (const [id, renderer] of [
    ["webgl-renderer", webglRenderer],
    ["css-renderer", cssRenderer],
  ]) {
    const container = document.createElement("div");
    container.id = id;
    container.classList.add("render-container");
    container.appendChild(renderer.domElement);
    mount.appendChild(container);
  }
  return { webglRenderer, cssRenderer };
}

function loadBackground(scene) {
  new THREE.TextureLoader().load("assets/background.jpg", (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    const zoomFactor = 1 / BACKGROUND_ZOOM;
    const offsetFactor = (1 - zoomFactor) / 2;
    texture.repeat.set(zoomFactor, zoomFactor);
    texture.offset.set(offsetFactor, offsetFactor);
    scene.background = texture;
  });
}

// Crisp balanced studio lighting for the vintage dark charcoal CRT.
function addLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x111111, 0.7);
  hemiLight.position.set(0, 10, 0);
  scene.add(hemiLight);

  const directional = [
    { intensity: 1.8, position: [-2.5, 3.5, 4.0] }, // key
    { intensity: 1.0, position: [3.5, 2.0, 3.0] }, // fill
    { intensity: 1.4, position: [0, 4.5, -0.5] }, // rim
  ];
  for (const { intensity, position } of directional) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.position.set(...position);
    scene.add(light);
  }
}

function createDustParticles(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.008, 0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7 }),
    PARTICLE_COUNT,
  );
  scene.add(mesh);

  const particles = [];
  const color = new THREE.Color();
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      time: Math.random() * 100,
      speed: 0.003 + Math.random() / 600,
      x: (Math.random() - 0.5) * 25,
      y: (Math.random() - 0.5) * 25,
      z: (Math.random() - 0.5) * 15,
    });
    color.setHex(PARTICLE_PALETTE[Math.floor(Math.random() * PARTICLE_PALETTE.length)]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor.needsUpdate = true;

  const dummy = new THREE.Object3D();
  const update = () => {
    particles.forEach((particle, i) => {
      const { speed, x, y, z } = particle;
      const t = (particle.time += speed);
      dummy.position.set(
        x + Math.cos(t) + Math.sin(t) / 10,
        y + Math.sin(t) + Math.cos(t * 2) / 10,
        z + Math.cos(t) + Math.sin(t * 3) / 10,
      );
      const s = 0.3 + 0.7 * Math.abs(Math.cos(t));
      dummy.scale.set(s, s, s);
      dummy.rotation.set(s * 5, s * 5, s * 5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return { mesh, update };
}

function createModelLoader(webglRenderer) {
  const ktx2Loader = new KTX2Loader().setTranscoderPath("basis/");
  const gltfLoader = new GLTFLoader();
  gltfLoader.setKTX2Loader(ktx2Loader);
  ktx2Loader.detectSupport(webglRenderer);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  return gltfLoader;
}

/** Hides the screen mesh (the iframe replaces it) and restyles the casing. */
function prepareTvModel(tv) {
  let screenMesh = null;
  let meshIndex = 0;
  tv.traverse((child) => {
    if (!child.isMesh) return;
    const matName = child.material?.name || "";
    if (matName.includes("Screen") || child.name.includes("_2") || meshIndex === 2) {
      child.visible = false;
      screenMesh = child;
    } else {
      child.visible = true;
      child.material.metalness = 0.04;
      child.material.roughness = 0.65;
      child.material.envMapIntensity = 0.35;
      child.material.color?.setRGB(0.18, 0.18, 0.18);
    }
    meshIndex++;
  });

  screenMesh ??=
    tv.getObjectByName("defaultMaterial_2") ||
    tv.children[0]?.children?.find((m) => m.isMesh && m.name.includes("defaultMaterial"));
  if (screenMesh) screenMesh.visible = false;
  return screenMesh;
}

/** Places the CSS3D screen element and the clip mesh over the TV screen. */
function alignToScreen(screenMesh, cssObject, clipMesh) {
  if (!screenMesh?.geometry) return;

  screenMesh.updateWorldMatrix(true, false);
  const screenBox = new THREE.Box3().setFromObject(screenMesh);
  const size = screenBox.getSize(new THREE.Vector3());
  if (size.x === 0 || size.y === 0) return;

  cssObject.position.copy(screenBox.getCenter(new THREE.Vector3()));
  cssObject.quaternion.copy(screenMesh.getWorldQuaternion(new THREE.Quaternion()));
  cssObject.scale.set((size.x / SCREEN_WIDTH) * 0.995, (size.y / SCREEN_HEIGHT) * 0.995, 1);
  cssObject.position.x += SCREEN_ADJUST.offsetX;
  cssObject.position.y -= SCREEN_ADJUST.offsetY;
  cssObject.translateZ(SCREEN_ADJUST.offsetZ);
  cssObject.quaternion.multiply(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(SCREEN_ADJUST.rotX, SCREEN_ADJUST.rotY, SCREEN_ADJUST.rotZ)),
  );
  cssObject.scale.x *= SCREEN_ADJUST.scaleX;
  cssObject.scale.y *= SCREEN_ADJUST.scaleY;

  clipMesh.position.copy(cssObject.position);
  clipMesh.quaternion.copy(cssObject.quaternion);
  clipMesh.scale.set(size.x * SCREEN_ADJUST.scaleX, size.y * SCREEN_ADJUST.scaleY, 1);
  clipMesh.updateMatrixWorld();
}

/**
 * Builds the scene inside `mount` and maps `screenEl` onto the TV screen.
 * The camera starts close on the screen and pulls back once `isIntroDone()`.
 */
export function createScene({ mount, screenEl, getSettings, isIntroDone }) {
  const scene = new THREE.Scene();
  const cssScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.copy(START_CAM_POS);
  camera.lookAt(START_LOOK_AT);

  const { webglRenderer, cssRenderer } = createRenderers(mount);
  loadBackground(scene);
  addLights(scene);
  const particles = createDustParticles(scene);

  let rebuildClipPath = () => {};
  let resizeTimer = null;

  const onWindowResize = () => {
    const { clientWidth, clientHeight } = mount;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    webglRenderer.setSize(clientWidth, clientHeight);
    cssRenderer.setSize(clientWidth, clientHeight);
    cssRenderer.domElement.style.width = `${clientWidth}px`;
    cssRenderer.domElement.style.height = `${clientHeight}px`;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => rebuildClipPath(), 150);
  };
  window.addEventListener("resize", onWindowResize);

  createModelLoader(webglRenderer).load("crt_tv_basis.glb", (gltf) => {
    const tv = gltf.scene;
    const screenMesh = prepareTvModel(tv);

    const group = new THREE.Group();
    group.position.set(0, -0.18, 0);
    group.rotation.y = Math.PI;
    group.scale.setScalar(TV_SCALE);
    group.add(tv);
    scene.add(group);

    requestAnimationFrame(() => screenEl.classList.add("is-visible"));

    const cssObject = new CSS3DObject(screenEl);
    cssScene.add(cssObject);

    const clipMesh = screenMesh.clone();
    clipMesh.material = new THREE.MeshBasicMaterial({ visible: false });
    scene.add(clipMesh);

    // Computed once; the TV never moves.
    alignToScreen(screenMesh, cssObject, clipMesh);

    rebuildClipPath = () => {
      const clipPath = buildClipPathFromMesh(clipMesh, camera, webglRenderer.domElement);
      if (clipPath) {
        screenEl.style.clipPath = clipPath;
        screenEl.style.webkitClipPath = clipPath;
      }
    };

    let transitionProgress = 0;
    const currentLookAt = START_LOOK_AT.clone();

    const updateCamera = () => {
      if (transitionProgress >= 1) {
        camera.position.copy(END_CAM_POS);
        camera.lookAt(END_LOOK_AT);
        return;
      }
      if (!isIntroDone()) return;

      transitionProgress = Math.min(1, transitionProgress + TRANSITION_SPEED);
      const t = 1 - Math.pow(1 - transitionProgress, 3); // ease-out cubic
      camera.position.lerpVectors(START_CAM_POS, END_CAM_POS, t);
      currentLookAt.lerpVectors(START_LOOK_AT, END_LOOK_AT, t);
      camera.lookAt(currentLookAt);
      // Refresh the occlusion mask for the final camera position.
      if (transitionProgress === 1) rebuildClipPath();
    };

    const animate = () => {
      requestAnimationFrame(animate);
      updateCamera();

      const { particles: showParticles } = getSettings();
      particles.mesh.visible = showParticles;
      if (showParticles) particles.update();

      webglRenderer.render(scene, camera);
      cssRenderer.render(cssScene, camera);
    };

    onWindowResize();
    animate();
  });
}

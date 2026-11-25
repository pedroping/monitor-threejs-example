// The room around the TV: a background photo and the lights.
import * as THREE from "three";

// >1 crops into the background photo, as if zooming in.
const BACKGROUND_ZOOM = 1.1;

/** Loads the background photo and uses it as the scene background. */
export function loadBackground(scene, url) {
  new THREE.TextureLoader().load(url, (texture) => {
    // It is a color image, so it is sRGB. (Data textures like normal maps stay linear.)
    texture.colorSpace = THREE.SRGBColorSpace;
    // Show only the middle 1/zoom of the image: shrink the UV range and center it.
    const visible = 1 / BACKGROUND_ZOOM;
    const margin = (1 - visible) / 2;
    texture.repeat.set(visible, visible);
    texture.offset.set(margin, margin);
    scene.background = texture;
  });
}

/**
 * Studio lighting for the dark charcoal TV: soft ambient + hemisphere light for
 * the base level, then a classic three-point setup.
 */
export function addLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x111111, 0.7); // sky color, ground color
  hemisphere.position.set(0, 10, 0);
  scene.add(hemisphere);

  const threePoint = [
    { name: "key", intensity: 1.8, position: [-2.5, 3.5, 4.0] }, // main light, front-left
    { name: "fill", intensity: 1.0, position: [3.5, 2.0, 3.0] }, // softens the key's shadows
    { name: "rim", intensity: 1.4, position: [0, 4.5, -0.5] }, // from behind, outlines the TV
  ];
  for (const { name, intensity, position } of threePoint) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.name = `${name}Light`;
    light.position.set(...position);
    scene.add(light);
  }
}

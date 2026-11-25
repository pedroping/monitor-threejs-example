// The opening camera move: start close on the screen, then glide back to show
// the whole TV once the page says it is ready.
import * as THREE from "three";

const START_POSITION = new THREE.Vector3(-0.012, 0.19, 0.33);
const START_LOOK_AT = new THREE.Vector3(-0.012, 0.079, -0.485);
const END_POSITION = new THREE.Vector3(0, 0.1, 0.7);
const END_LOOK_AT = new THREE.Vector3(0, 0, 0);

// Progress added per frame (0 → 1). Note: per *frame*, so the move is faster
// on high-refresh screens. Multiplying by a frame delta would fix that.
const PROGRESS_PER_FRAME = 0.015;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3); // fast start, gentle stop

/** Puts `camera` at the start pose and returns the intro controller. */
export function createCameraIntro(camera) {
  camera.position.copy(START_POSITION);
  camera.lookAt(START_LOOK_AT);

  let progress = 0;
  const lookAt = START_LOOK_AT.clone();

  return {
    /**
     * Call once per frame. The move starts the first frame `canStart` is true.
     * Returns true on the single frame the move finishes.
     */
    update(canStart) {
      if (progress >= 1) {
        camera.position.copy(END_POSITION);
        camera.lookAt(END_LOOK_AT);
        return false;
      }
      if (!canStart) return false;

      progress = Math.min(1, progress + PROGRESS_PER_FRAME);
      const t = easeOutCubic(progress);
      // Interpolate both where the camera is and what it looks at.
      camera.position.lerpVectors(START_POSITION, END_POSITION, t);
      lookAt.lerpVectors(START_LOOK_AT, END_LOOK_AT, t);
      camera.lookAt(lookAt);
      return progress === 1;
    },
  };
}

// Floating dust: 400 tiny shapes drawn with ONE InstancedMesh (a single draw
// call). Each frame every instance gets a new transform matrix.
import * as THREE from "three";

const PARTICLE_COUNT = 400;
const PARTICLE_COLORS = [0xffffff, 0xdddddd, 0xeeeecc, 0xddeeff, 0xfffacd];
const SPREAD = { x: 25, y: 25, z: 15 }; // size of the box the dust floats in

/**
 * Adds the dust to `scene`. Returns `{ mesh, update }`; call `update()` once per
 * frame to move the particles.
 */
export function createDustParticles(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.008, 0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7 }),
    PARTICLE_COUNT,
  );
  scene.add(mesh);

  // Each particle orbits around its own random center at its own speed.
  const particles = [];
  const color = new THREE.Color();
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      time: Math.random() * 100, // random phase so they don't move in sync
      speed: 0.003 + Math.random() / 600,
      x: (Math.random() - 0.5) * SPREAD.x,
      y: (Math.random() - 0.5) * SPREAD.y,
      z: (Math.random() - 0.5) * SPREAD.z,
    });
    color.setHex(PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor.needsUpdate = true;

  // A throwaway object used only to build each instance's matrix.
  const dummy = new THREE.Object3D();

  const update = () => {
    particles.forEach((particle, i) => {
      const t = (particle.time += particle.speed);
      // A wobbly loop: a circle plus small, faster sine waves on each axis.
      dummy.position.set(
        particle.x + Math.cos(t) + Math.sin(t) / 10,
        particle.y + Math.sin(t) + Math.cos(t * 2) / 10,
        particle.z + Math.cos(t) + Math.sin(t * 3) / 10,
      );
      // Pulse between 30% and 100% size, and tumble as it pulses.
      const scale = 0.3 + 0.7 * Math.abs(Math.cos(t));
      dummy.scale.setScalar(scale);
      dummy.rotation.set(scale * 5, scale * 5, scale * 5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true; // upload the new matrices to the GPU
  };

  return { mesh, update };
}

// Screen occlusion: makes the flat HTML screen look like it sits *inside* the
// curved TV bezel.
//
// The CSS3D layer is always drawn on top of the WebGL canvas, so nothing in the
// 3D scene can hide it. Instead we work out which pixels the real (curved)
// screen mesh covers for the current camera and cut the HTML element to that
// shape with a CSS clip-path:
//
//   1. project   every triangle of the screen mesh to screen pixels
//   2. rasterize the triangles into an off-screen 0/1 mask
//   3. trace     the outline of the mask (Moore-Neighbor tracing)
//   4. simplify  the outline to a few points (Ramer-Douglas-Peucker)
//   5. convert   the points to a `polygon(x% y%, ...)` clip-path
//
// The result depends on the camera, so it must be rebuilt whenever the camera
// or the viewport changes.
import * as THREE from "three";

// The mask is drawn at half the viewport resolution: 4x fewer pixels to trace,
// and still accurate to about one screen pixel.
const RASTER_SCALE = 0.5;

// Outline points closer than this (in pixels) to a straight line are dropped.
const SIMPLIFY_TOLERANCE_PX = 2.0;

/**
 * Returns a CSS `polygon(...)` that matches `mesh` as seen by `camera` on
 * `canvas`, or null if it can't be computed (e.g. the canvas has no size yet).
 * The polygon is expressed in % of its own bounding box, which is how
 * clip-path percentages on the target element are interpreted.
 */
export function buildClipPathFromMesh(mesh, camera, canvas) {
  const canvasRect = canvas.getBoundingClientRect();
  if (!mesh.geometry || canvasRect.width === 0 || canvasRect.height === 0) return null;

  // 1. Project
  const triangles = projectMeshTriangles(mesh, camera, canvasRect);

  // 2. Rasterize (at reduced resolution)
  const maskWidth = Math.max(16, Math.floor(window.innerWidth * RASTER_SCALE));
  const maskHeight = Math.max(16, Math.floor(window.innerHeight * RASTER_SCALE));
  const scaledTriangles = triangles.map((tri) => tri.map(([x, y]) => [x * RASTER_SCALE, y * RASTER_SCALE]));
  const mask = rasterizeTriangles(scaledTriangles, maskWidth, maskHeight);

  // 3. Trace, then scale the outline back up to full resolution
  const scaledOutline = traceOutline(mask, maskWidth, maskHeight);
  if (scaledOutline.length === 0) return null;
  const outline = scaledOutline.map(([x, y]) => [x / RASTER_SCALE, y / RASTER_SCALE]);

  // 4. Simplify
  const points = simplifyPolyline(outline, SIMPLIFY_TOLERANCE_PX);

  // 5. Convert to percentages of the polygon's bounding box
  return toClipPathPolygon(points);
}

// --- 1. Projection ---

/** Projects a world-space point to pixel coordinates on the canvas. */
function worldToScreen(point, camera, canvasRect) {
  // project() gives normalized device coordinates: -1..1 on both axes, y up.
  const ndc = point.clone().project(camera);
  const x = (ndc.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
  const y = (-ndc.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top; // screen y points down
  return [x, y];
}

/** Returns every triangle of `mesh` as three [x, y] pixel positions. */
function projectMeshTriangles(mesh, camera, canvasRect) {
  mesh.updateWorldMatrix(true, false);
  const positions = mesh.geometry.attributes.position;
  const indices = mesh.geometry.index;
  const triangleCount = (indices ? indices.count : positions.count) / 3;

  // Indexed geometry stores vertex numbers in `index`; otherwise vertices are in order.
  const vertexAt = (n) => (indices ? indices.array[n] : n);
  const projectVertex = (n) => {
    const point = new THREE.Vector3().fromBufferAttribute(positions, vertexAt(n));
    mesh.localToWorld(point);
    return worldToScreen(point, camera, canvasRect);
  };

  const triangles = [];
  for (let i = 0; i < triangleCount; i++) {
    triangles.push([projectVertex(3 * i), projectVertex(3 * i + 1), projectVertex(3 * i + 2)]);
  }
  return triangles;
}

// --- 2. Rasterization ---

/** Fills the triangles on an off-screen canvas and returns a 0/1 coverage mask. */
function rasterizeTriangles(triangles, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  for (const [a, b, c] of triangles) {
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.closePath();
  }
  ctx.fill();

  const { data } = ctx.getImageData(0, 0, width, height);
  const mask = new Uint8Array(width * height);
  for (let pixel = 0; pixel < mask.length; pixel++) {
    mask[pixel] = data[pixel * 4 + 3] > 0 ? 1 : 0; // alpha channel
  }
  return mask;
}

// --- 3. Outline tracing ---

// The 8 neighbours of a pixel, clockwise, starting at the top-left.
const NEIGHBOURS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

/**
 * Moore-Neighbor tracing: starting from the first filled pixel, walk around the
 * shape by always checking neighbours clockwise from where we came in, until we
 * are back at the start. Returns the outline as ordered [x, y] pixels.
 */
function traceOutline(mask, width, height) {
  const startIndex = mask.indexOf(1);
  if (startIndex === -1) return [];

  const isFilled = (x, y) => x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === 1;
  const startX = startIndex % width;
  const startY = Math.floor(startIndex / width);

  let x = startX;
  let y = startY;
  // Direction we "came from" (index into NEIGHBOURS). The first pixel was found
  // scanning left to right, so we start as if we came from the left.
  let backtrack = 7;
  const outline = [];
  const maxSteps = width * height * 10; // safety net against endless loops

  for (let step = 0; step <= maxSteps; step++) {
    outline.push([x, y]);

    let moved = false;
    for (let k = 0; k < 8; k++) {
      const dir = (backtrack + 1 + k) % 8;
      const nx = x + NEIGHBOURS[dir][0];
      const ny = y + NEIGHBOURS[dir][1];
      if (isFilled(nx, ny)) {
        x = nx;
        y = ny;
        backtrack = (dir + 6) % 8; // the neighbour we must check first next time
        moved = true;
        break;
      }
    }

    if (!moved || (x === startX && y === startY)) break; // isolated pixel, or loop closed
  }
  return outline;
}

// --- 4. Simplification ---

/** Squared distance from point (px, py) to the segment a-b. */
function squaredDistanceToSegment(px, py, [ax, ay], [bx, by]) {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  // Position of the closest point along the segment, clamped to [0, 1].
  let t = lengthSq ? ((px - ax) * abx + (py - ay) * aby) / lengthSq : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + t * abx);
  const dy = py - (ay + t * aby);
  return dx * dx + dy * dy;
}

/**
 * Ramer-Douglas-Peucker: keep the point furthest from the line between the
 * first and last points if it is further than `tolerance`, and recurse on both
 * halves; otherwise everything in between can be dropped.
 */
function simplifyPolyline(points, tolerance) {
  if (points.length < 3) return points.slice();
  const toleranceSq = tolerance * tolerance;
  const kept = [];

  const simplifyRange = (first, last) => {
    let furthest = -1;
    let furthestDistSq = -1;
    for (let i = first + 1; i < last; i++) {
      const distSq = squaredDistanceToSegment(points[i][0], points[i][1], points[first], points[last]);
      if (distSq > furthestDistSq) {
        furthest = i;
        furthestDistSq = distSq;
      }
    }
    if (furthestDistSq > toleranceSq) {
      simplifyRange(first, furthest);
      simplifyRange(furthest, last);
    } else {
      kept.push(points[first]);
    }
  };

  simplifyRange(0, points.length - 1);
  kept.push(points[points.length - 1]);
  return kept;
}

// --- 5. clip-path conversion ---

/** Converts pixel points to a polygon in % of the points' own bounding box. */
function toClipPathPolygon(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = Math.max(2, maxX - minX);
  const height = Math.max(2, maxY - minY);

  const percentages = points.map(([x, y]) => {
    // +0.5 samples the centre of each pixel.
    const px = ((x - minX + 0.5) / width) * 100;
    const py = ((y - minY + 0.5) / height) * 100;
    return `${px.toFixed(3)}% ${py.toFixed(3)}%`;
  });
  return `polygon(${percentages.join(", ")})`;
}

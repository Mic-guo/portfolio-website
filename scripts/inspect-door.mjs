// Inspect the camera GLB geometry around the SD door region.
// Replicates the extraction pipeline in CameraDecompositionScene.jsx
// (first mesh, world transform, recentered) and reports the connected
// components near the slot anchor so the door cut region can be measured
// instead of guessed.
import { readFileSync } from "node:fs";
import * as THREE from "three";

const GLB_PATH = new URL("../public/models/sony-camera-4k/sony_alpha_3.glb", import.meta.url);
// body-78's center: the anchor effect snaps the sd slot here on every load,
// so this is where the door actually lives.
const SLOT_ANCHOR = new THREE.Vector3(-2.41, -0.525, -2.176);

// --- minimal GLB parsing (positions + indices of every mesh primitive) ---
const buffer = readFileSync(GLB_PATH);
const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");

let offset = 12;
let json = null;
let bin = null;
while (offset < buffer.byteLength) {
  const chunkLength = view.getUint32(offset, true);
  const chunkType = view.getUint32(offset + 4, true);
  const chunkStart = offset + 8;
  if (chunkType === 0x4e4f534a) {
    json = JSON.parse(buffer.subarray(chunkStart, chunkStart + chunkLength).toString("utf8"));
  } else if (chunkType === 0x004e4942) {
    bin = buffer.subarray(chunkStart, chunkStart + chunkLength);
  }
  offset = chunkStart + chunkLength;
}

function readAccessor(accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const bufferView = json.bufferViews[accessor.bufferView];
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const itemSizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const itemSize = itemSizes[accessor.type];
  const count = accessor.count * itemSize;
  const slice = bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + count * componentBytes(accessor.componentType));
  switch (accessor.componentType) {
    case 5126: return { array: new Float32Array(slice), itemSize };
    case 5125: return { array: new Uint32Array(slice), itemSize };
    case 5123: return { array: new Uint16Array(slice), itemSize };
    case 5121: return { array: new Uint8Array(slice), itemSize };
    default: throw new Error(`componentType ${accessor.componentType}`);
  }
}

function componentBytes(componentType) {
  return { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[componentType];
}

// node world matrices
const worldMatrices = new Map();
function walk(nodeIndex, parentMatrix) {
  const node = json.nodes[nodeIndex];
  const local = new THREE.Matrix4();
  if (node.matrix) {
    local.fromArray(node.matrix);
  } else {
    const t = new THREE.Vector3(...(node.translation ?? [0, 0, 0]));
    const r = new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1]));
    const s = new THREE.Vector3(...(node.scale ?? [1, 1, 1]));
    local.compose(t, r, s);
  }
  const world = parentMatrix.clone().multiply(local);
  worldMatrices.set(nodeIndex, world);
  (node.children ?? []).forEach((child) => walk(child, world));
}
json.scenes[json.scene ?? 0].nodes.forEach((nodeIndex) => walk(nodeIndex, new THREE.Matrix4()));

// first mesh node in traversal order
const meshNodeIndex = [...worldMatrices.keys()].find((nodeIndex) => json.nodes[nodeIndex].mesh !== undefined);
const meshNode = json.nodes[meshNodeIndex];
const primitive = json.meshes[meshNode.mesh].primitives[0];
console.log(`mesh count: ${json.meshes.length}, primitives in first mesh: ${json.meshes[meshNode.mesh].primitives.length}`);

const positionData = readAccessor(primitive.attributes.POSITION);
const indexData = primitive.indices !== undefined ? readAccessor(primitive.indices) : null;

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positionData.array, 3));
if (indexData) geometry.setIndex(new THREE.BufferAttribute(indexData.array, 1));
geometry.applyMatrix4(worldMatrices.get(meshNodeIndex));
geometry.computeBoundingBox();
const center = geometry.boundingBox.getCenter(new THREE.Vector3());
geometry.translate(-center.x, -center.y, -center.z);
geometry.computeBoundingBox();
console.log("model bbox:", geometry.boundingBox.min.toArray().map((v) => v.toFixed(3)), "->", geometry.boundingBox.max.toArray().map((v) => v.toFixed(3)));

// --- connected components (same as the app) ---
const position = geometry.attributes.position;
const triangleCount = geometry.index ? geometry.index.count / 3 : position.count / 3;
console.log(`vertices: ${position.count}, triangles: ${triangleCount}`);

const parent = new Int32Array(position.count);
for (let i = 0; i < position.count; i += 1) parent[i] = i;
function find(i) {
  let root = i;
  while (parent[root] !== root) root = parent[root];
  while (parent[i] !== root) { const next = parent[i]; parent[i] = root; i = next; }
  return root;
}
function union(a, b) {
  const ra = find(a); const rb = find(b);
  if (ra !== rb) parent[rb] = ra;
}
function triVertex(triangle, corner) {
  return geometry.index ? geometry.index.array[triangle * 3 + corner] : triangle * 3 + corner;
}
for (let t = 0; t < triangleCount; t += 1) {
  union(triVertex(t, 0), triVertex(t, 1));
  union(triVertex(t, 0), triVertex(t, 2));
}

const components = new Map();
for (let t = 0; t < triangleCount; t += 1) {
  const root = find(triVertex(t, 0));
  let component = components.get(root);
  if (!component) {
    component = { triangles: [], bounds: new THREE.Box3() };
    components.set(root, component);
  }
  component.triangles.push(t);
  for (let corner = 0; corner < 3; corner += 1) {
    const v = triVertex(t, corner);
    component.bounds.expandByPoint(new THREE.Vector3(position.getX(v), position.getY(v), position.getZ(v)));
  }
}
console.log(`connected components: ${components.size}`);

// replicate assembly classification + body picker ids
const LENS_AXIS = [0.47, -0.26];
function assemblyKey(bounds) {
  const c = bounds.getCenter(new THREE.Vector3());
  const distance = Math.hypot(c.x - LENS_AXIS[0], c.y - LENS_AXIS[1]);
  if (c.z < -1.05) return "body";
  if (c.z < 1.75 && distance > 1.75) return "body";
  if (c.z < -0.2) return "lensMount";
  if (c.z < 0.75) return "rearBarrel";
  if (c.z < 1.75) return "frontBarrel";
  return "frontLens";
}

const componentList = [...components.values()].map((component) => ({
  ...component,
  key: assemblyKey(component.bounds),
  center: component.bounds.getCenter(new THREE.Vector3()),
  size: component.bounds.getSize(new THREE.Vector3()),
}));

const pickerComponents = componentList
  .filter((component) => component.key === "body" && component.triangles.length >= 18)
  .sort((a, b) => b.triangles.length - a.triangles.length)
  .slice(0, 80)
  .map((component, index) => ({ ...component, id: `body-${String(index + 1).padStart(2, "0")}` }));

const body78 = pickerComponents.find((component) => component.id === "body-78");
if (body78) {
  console.log("\nbody-78 center:", body78.center.toArray().map((v) => v.toFixed(3)),
    "size:", body78.size.toArray().map((v) => v.toFixed(3)),
    "tris:", body78.triangles.length);
}

// components near the slot anchor (likely door-related details)
console.log("\ncomponents with center within 0.8 of slot anchor:");
componentList
  .filter((component) => component.center.distanceTo(SLOT_ANCHOR) < 0.8)
  .sort((a, b) => b.triangles.length - a.triangles.length)
  .forEach((component) => {
    console.log(
      `  key=${component.key} tris=${String(component.triangles.length).padStart(6)}`,
      "bounds", component.bounds.min.toArray().map((v) => v.toFixed(3)),
      "->", component.bounds.max.toArray().map((v) => v.toFixed(3)),
    );
  });

// current cut region result
function countInRegion(region) {
  let count = 0;
  const bounds = new THREE.Box3();
  const centroid = new THREE.Vector3();
  for (const component of componentList) {
    if (component.key !== "body") continue;
    for (const t of component.triangles) {
      centroid.set(0, 0, 0);
      for (let corner = 0; corner < 3; corner += 1) {
        const v = triVertex(t, corner);
        centroid.x += position.getX(v) / 3;
        centroid.y += position.getY(v) / 3;
        centroid.z += position.getZ(v) / 3;
      }
      if (region.containsPoint(centroid)) {
        count += 1;
        for (let corner = 0; corner < 3; corner += 1) {
          const v = triVertex(t, corner);
          bounds.expandByPoint(new THREE.Vector3(position.getX(v), position.getY(v), position.getZ(v)));
        }
      }
    }
  }
  return { count, bounds };
}

const currentRegion = new THREE.Box3(
  new THREE.Vector3(SLOT_ANCHOR.x - 0.12, SLOT_ANCHOR.y - 0.25, SLOT_ANCHOR.z - 0.18 - 0.21),
  new THREE.Vector3(SLOT_ANCHOR.x + 0.12, SLOT_ANCHOR.y + 0.25, SLOT_ANCHOR.z - 0.18 + 0.21),
);
const current = countInRegion(currentRegion);
console.log("\ncurrent BODY_DOOR_REGION cut:", current.count, "tris, bounds",
  current.bounds.min.toArray().map((v) => v.toFixed(3)), "->",
  current.bounds.max.toArray().map((v) => v.toFixed(3)));

// All triangles (any assembly) with centroid in a generous door-area box,
// grouped by assembly, to see whether door surface leaks into other parts.
const generous = new THREE.Box3(
  new THREE.Vector3(-2.0, 0.2, -1.7),
  new THREE.Vector3(-1.0, 1.3, -0.6),
);
const byAssembly = {};
const centroid = new THREE.Vector3();
for (const component of componentList) {
  for (const t of component.triangles) {
    centroid.set(0, 0, 0);
    for (let corner = 0; corner < 3; corner += 1) {
      const v = triVertex(t, corner);
      centroid.x += position.getX(v) / 3;
      centroid.y += position.getY(v) / 3;
      centroid.z += position.getZ(v) / 3;
    }
    if (generous.containsPoint(centroid)) {
      byAssembly[component.key] = (byAssembly[component.key] ?? 0) + 1;
    }
  }
}
console.log("\ntriangles near door area by assembly:", byAssembly);

// The four largest body components overall, for context.
console.log("\nlargest body components:");
componentList
  .filter((component) => component.key === "body")
  .sort((a, b) => b.triangles.length - a.triangles.length)
  .slice(0, 6)
  .forEach((component) => {
    console.log(
      `  tris=${String(component.triangles.length).padStart(6)}`,
      "center", component.center.toArray().map((v) => v.toFixed(3)),
      "size", component.size.toArray().map((v) => v.toFixed(3)),
    );
  });

// Detailed look at the door-candidate components clustered near the anchor:
// print full bounds so the real panel rectangle can be identified.
console.log("\ndoor candidate component bounds:");
componentList
  .filter((component) => component.center.distanceTo(SLOT_ANCHOR) < 0.6 && component.triangles.length >= 50)
  .sort((a, b) => b.triangles.length - a.triangles.length)
  .forEach((component) => {
    console.log(
      `  tris=${String(component.triangles.length).padStart(5)}`,
      component.bounds.min.toArray().map((v) => v.toFixed(3)),
      "->",
      component.bounds.max.toArray().map((v) => v.toFixed(3)),
    );
  });

// Proposed full-panel cut region: how many triangles per component does it
// capture, and does it nick the main body shell?
const panelRegion = new THREE.Box3(
  new THREE.Vector3(-1.95, 0.64, -1.55),
  new THREE.Vector3(-1.27, 1.08, -0.89),
);
console.log("\nproposed panel region cut, per component:");
const cutBounds = new THREE.Box3();
let totalCut = 0;
for (const component of componentList) {
  if (component.key !== "body") continue;
  let inside = 0;
  for (const t of component.triangles) {
    centroid.set(0, 0, 0);
    for (let corner = 0; corner < 3; corner += 1) {
      const v = triVertex(t, corner);
      centroid.x += position.getX(v) / 3;
      centroid.y += position.getY(v) / 3;
      centroid.z += position.getZ(v) / 3;
    }
    if (panelRegion.containsPoint(centroid)) {
      inside += 1;
      for (let corner = 0; corner < 3; corner += 1) {
        const v = triVertex(t, corner);
        cutBounds.expandByPoint(new THREE.Vector3(position.getX(v), position.getY(v), position.getZ(v)));
      }
    }
  }
  if (inside > 0) {
    totalCut += inside;
    console.log(
      `  component tris=${String(component.triangles.length).padStart(6)} cut=${String(inside).padStart(6)}`,
      "center", component.center.toArray().map((v) => v.toFixed(3)),
      "size", component.size.toArray().map((v) => v.toFixed(3)),
    );
  }
}
console.log("total cut:", totalCut, "bounds",
  cutBounds.min.toArray().map((v) => v.toFixed(3)), "->",
  cutBounds.max.toArray().map((v) => v.toFixed(3)));

// Component-containment selection: whole body components fully inside the
// region box — clean edges, no shell holes.
const containRegion = new THREE.Box3(
  new THREE.Vector3(-2.5, -1.65, -2.7),
  new THREE.Vector3(-2.3, 0.6, -1.7),
);
console.log("\ncomponents fully contained in door region:");
const doorBounds = new THREE.Box3();
let doorTris = 0;
for (const component of componentList) {
  if (component.key !== "body") continue;
  if (!containRegion.containsBox(component.bounds)) continue;
  doorTris += component.triangles.length;
  doorBounds.union(component.bounds);
  console.log(
    `  tris=${String(component.triangles.length).padStart(6)}`,
    "center", component.center.toArray().map((v) => v.toFixed(3)),
    "size", component.size.toArray().map((v) => v.toFixed(3)),
  );
}
console.log("door total:", doorTris, "tris, union bounds",
  doorBounds.min.toArray().map((v) => v.toFixed(3)), "->",
  doorBounds.max.toArray().map((v) => v.toFixed(3)));

// Inspect the camera GLB geometry around the front of the lens to find the
// connected components that form the lens hood (flared outer shell) and the
// lens cap (front disc), so they can be split out of the lens assembly and
// animated separately. Same extraction pipeline as CameraDecompositionScene.
import { readFileSync } from "node:fs";
import * as THREE from "three";

const GLB_PATH = new URL("../public/models/sony-camera-4k/sony_alpha_3.glb", import.meta.url);

// --- minimal GLB parsing (positions + indices of first mesh primitive) ---
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

function componentBytes(componentType) {
  return { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[componentType];
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

const meshNodeIndex = [...worldMatrices.keys()].find((nodeIndex) => json.nodes[nodeIndex].mesh !== undefined);
const meshNode = json.nodes[meshNodeIndex];
const primitive = json.meshes[meshNode.mesh].primitives[0];

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

const LENS_AXIS = [0.47, -0.26];
const components = new Map();
for (let t = 0; t < triangleCount; t += 1) {
  const root = find(triVertex(t, 0));
  let component = components.get(root);
  if (!component) {
    component = { triangles: [], bounds: new THREE.Box3(), maxRadius: 0, minRadius: Infinity };
    components.set(root, component);
  }
  component.triangles.push(t);
  for (let corner = 0; corner < 3; corner += 1) {
    const v = triVertex(t, corner);
    const point = new THREE.Vector3(position.getX(v), position.getY(v), position.getZ(v));
    component.bounds.expandByPoint(point);
    const radius = Math.hypot(point.x - LENS_AXIS[0], point.y - LENS_AXIS[1]);
    component.maxRadius = Math.max(component.maxRadius, radius);
    component.minRadius = Math.min(component.minRadius, radius);
  }
}

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

// Every lens-side component, sorted by z center, with radial extents so the
// hood (large radius, hollow ring near the front) and the cap (front-most,
// thin in z, small min radius i.e. covers the middle) stand out.
console.log("\nlens components (key != body), sorted by center z:");
componentList
  .filter((component) => component.key !== "body" && component.triangles.length >= 12)
  .sort((a, b) => a.center.z - b.center.z)
  .forEach((component) => {
    console.log(
      `  ${component.key.padEnd(11)} tris=${String(component.triangles.length).padStart(6)}`,
      `z=[${component.bounds.min.z.toFixed(3)}, ${component.bounds.max.z.toFixed(3)}]`,
      `r=[${component.minRadius.toFixed(3)}, ${component.maxRadius.toFixed(3)}]`,
      "center", component.center.toArray().map((v) => v.toFixed(3)),
      "size", component.size.toArray().map((v) => v.toFixed(3)),
    );
  });

console.log("\nsmall lens components (tris < 12):", componentList.filter((c) => c.key !== "body" && c.triangles.length < 12).length);

// Proposed hood/cap classification (mirrors CameraDecompositionScene).
// The lens proper is a plain cylinder (barrel radius ~1.34 ending at the
// front glass, z ~1.92). Cap is matched before the collar rule so its skirt
// (r 1.525) isn't stolen by the hood. Everything else in front of z 1.9 that
// is wider than the barrel (r > 1.4: flange, rings, collar) is hood.
function lensPartKey(component) {
  if (component.bounds.max.z > 2.47) return "hood";
  if (component.bounds.min.z > 2.04 && component.maxRadius < 1.56) return "cap";
  if (component.bounds.min.z > 1.9 && component.maxRadius > 1.4) return "hood";
  return "lens";
}

const groups = { lens: { tris: 0, comps: 0 }, hood: { tris: 0, comps: 0 }, cap: { tris: 0, comps: 0 } };
const groupBounds = { lens: new THREE.Box3(), hood: new THREE.Box3(), cap: new THREE.Box3() };
componentList
  .filter((component) => component.key !== "body")
  .forEach((component) => {
    const key = lensPartKey(component);
    groups[key].tris += component.triangles.length;
    groups[key].comps += 1;
    groupBounds[key].union(component.bounds);
  });
console.log("\nclassification summary:");
Object.entries(groups).forEach(([key, group]) => {
  console.log(
    `  ${key.padEnd(5)} comps=${String(group.comps).padStart(4)} tris=${String(group.tris).padStart(6)}`,
    "bounds", groupBounds[key].min.toArray().map((v) => v.toFixed(3)),
    "->", groupBounds[key].max.toArray().map((v) => v.toFixed(3)),
  );
});

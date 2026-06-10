// One-off: locate the laptop screen surface in desk.glb, in the same
// normalized space ModelViewer uses (recentered on root bounds center,
// scaled so sweep radius = 3.5). Reports the screen node's world transform
// + local geometry bounds so an overlay plane can sit exactly on the glass.
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { dequantize } from "@gltf-transform/functions";
import draco3d from "draco3d";
import * as THREE from "three";

const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });

const document = await io.read("public/desk.glb");
await document.transform(dequantize());
const root = document.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];

function nodeWorldBounds(node) {
  const bounds = new THREE.Box3();
  const traverse = (current) => {
    const mesh = current.getMesh();
    if (mesh) {
      const matrix = new THREE.Matrix4().fromArray(current.getWorldMatrix());
      mesh.listPrimitives().forEach((primitive) => {
        const position = primitive.getAttribute("POSITION");
        if (!position) return;
        const array = position.getArray();
        const v = new THREE.Vector3();
        for (let i = 0; i < array.length; i += 3) {
          v.set(array[i], array[i + 1], array[i + 2]).applyMatrix4(matrix);
          bounds.expandByPoint(v);
        }
      });
    }
    current.listChildren().forEach(traverse);
  };
  traverse(node);
  return bounds;
}

const sceneBounds = new THREE.Box3();
scene.listChildren().forEach((child) => sceneBounds.union(nodeWorldBounds(child)));
const rootCenter = sceneBounds.getCenter(new THREE.Vector3());
const rootSize = sceneBounds.getSize(new THREE.Vector3());
const rawSweep = Math.hypot(rootSize.x, rootSize.z) / 2;
const scale = 3.5 / rawSweep;
console.log("scaleFactor:", scale.toFixed(6));

// Find the laptop group, then inspect each child mesh's transform + local bounds.
let laptopNode = null;
const find = (node) => {
  if (node.getName() === "laptop") laptopNode = node;
  node.listChildren().forEach(find);
};
scene.listChildren().forEach(find);

const inspect = (node) => {
  const mesh = node.getMesh();
  if (mesh) {
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    matrix.decompose(pos, quat, scl);
    const euler = new THREE.Euler().setFromQuaternion(quat, "XYZ");

    // Local-space geometry bounds (before node transform)
    const local = new THREE.Box3();
    mesh.listPrimitives().forEach((primitive) => {
      const position = primitive.getAttribute("POSITION");
      if (!position) return;
      const array = position.getArray();
      const v = new THREE.Vector3();
      for (let i = 0; i < array.length; i += 3) {
        v.set(array[i], array[i + 1], array[i + 2]);
        local.expandByPoint(v);
      }
    });
    const localCenter = local.getCenter(new THREE.Vector3());
    const localSize = local.getSize(new THREE.Vector3());

    const normPos = pos.clone().sub(rootCenter).multiplyScalar(scale);
    console.log(`\n=== ${node.getName()} ===`);
    console.log("normalized world pos:", normPos.toArray().map((v) => v.toFixed(4)));
    console.log("rotation (deg XYZ):", [euler.x, euler.y, euler.z].map((v) => THREE.MathUtils.radToDeg(v).toFixed(2)));
    console.log("node scale:", scl.toArray().map((v) => v.toFixed(4)));
    console.log("local bounds center:", localCenter.toArray().map((v) => v.toFixed(3)), "size:", localSize.toArray().map((v) => v.toFixed(3)));
    console.log("local size * nodeScale * sceneScale:", localSize.toArray().map((v, i) => (v * scl.getComponent(i) * scale).toFixed(4)));

    // Sample 4 corners of the largest local face transformed to normalized world,
    // assuming the thin axis is the normal.
    const sizes = localSize.toArray();
    const thinAxis = sizes.indexOf(Math.min(...sizes));
    const axes = [0, 1, 2].filter((a) => a !== thinAxis);
    const corners = [];
    for (const su of [-0.5, 0.5]) {
      for (const sv of [-0.5, 0.5]) {
        const c = localCenter.clone();
        c.setComponent(axes[0], localCenter.getComponent(axes[0]) + su * sizes[axes[0]]);
        c.setComponent(axes[1], localCenter.getComponent(axes[1]) + sv * sizes[axes[1]]);
        // front face along thin axis (max side)
        c.setComponent(thinAxis, local.max.getComponent(thinAxis));
        const w = c.applyMatrix4(matrix).sub(rootCenter).multiplyScalar(scale);
        corners.push(w.toArray().map((v) => v.toFixed(4)));
      }
    }
    console.log("front-face corners (normalized world):");
    corners.forEach((c) => console.log("  ", c));
  }
  node.listChildren().forEach(inspect);
};
inspect(laptopNode);

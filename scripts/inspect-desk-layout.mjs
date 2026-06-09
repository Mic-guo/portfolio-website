// Decode desk.glb (Draco) and report world-space bounds of layout-relevant
// nodes in the same normalized space ModelViewer uses (recentered on root
// bounds center, scaled so sweep radius = 3.5). Used to derive CompanionModel
// anchor offsets from real coordinates.
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
console.log("root center:", rootCenter.toArray().map((v) => v.toFixed(2)),
  "size:", rootSize.toArray().map((v) => v.toFixed(2)), "scaleFactor:", scale.toFixed(5));

const WANT = ["wood", "sticky note", "laptop", "arm", "screen", "notebook", "speacker", "camera", "Top"];
const seen = new Map();
const visit = (node, path) => {
  const name = node.getName();
  if (WANT.includes(name)) {
    const bounds = nodeWorldBounds(node);
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      // normalized (ModelViewer world) coords
      const world = center.clone().sub(rootCenter).multiplyScalar(scale);
      const topY = (bounds.max.y - rootCenter.y) * scale;
      const key = `${name}#${seen.get(name) ?? 0}`;
      seen.set(name, (seen.get(name) ?? 0) + 1);
      console.log(
        key.padEnd(16),
        "world", world.toArray().map((v) => v.toFixed(3)),
        "topY", topY.toFixed(3),
        "worldSize", size.clone().multiplyScalar(scale).toArray().map((v) => v.toFixed(3)),
        "| path:", path,
      );
    }
  }
  node.listChildren().forEach((child) => visit(child, `${path}/${name || "?"}`));
};
scene.listChildren().forEach((child) => visit(child, ""));

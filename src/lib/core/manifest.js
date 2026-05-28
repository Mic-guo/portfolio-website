import * as THREE from "three";

// Names that carry no semantic meaning — leaf geometry from most 3D tools, or
// generic container/scene wrappers added by exporters.
const GENERIC =
  /^(Cube|Cylinder|Sphere|Rectangle|Plane|Torus|Cone|Pyramid|Group|Object|Mesh|Ellipse|Lathe|Helix|Path|Shape|Boolean|Merged Geometry|Text|Scene|RootNode|Root|World|Empty|Armature|Node)\s*\d*$/i;

// Suffix patterns suggesting the node is a container created by the exporter.
// "DeskScene", "MainScene", "HeroScene", etc.
const CONTAINER_SUFFIX = /(Scene|Root|Container)$/i;

export function isGeneric(name) {
  if (!name) return true;
  const trimmed = name.trim();
  return GENERIC.test(trimmed) || CONTAINER_SUFFIX.test(trimmed);
}

export function toId(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function getBounds(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  return {
    min: box.min.clone(),
    max: box.max.clone(),
    center: box.getCenter(new THREE.Vector3()),
    size: box.getSize(new THREE.Vector3()),
  };
}

function hasMeshDescendant(obj) {
  let found = false;
  obj.traverse((child) => {
    if (child.isMesh) found = true;
  });
  return found;
}

// Walk from `obj` toward the scene root, returning the closest ancestor that
// has a non-generic name. Includes `obj` itself. Returns null if nothing on
// the chain has a usable name.
export function findNamedAncestor(obj, stopAt = null) {
  let cur = obj;
  while (cur && cur !== stopAt) {
    if (!isGeneric(cur.name)) return cur;
    cur = cur.parent;
  }
  return null;
}

// Pipeline 1: walk hierarchy, collect every node with a semantic name and at
// least one mesh descendant. Unlike older revisions, this does NOT skip a
// node's subtree once recorded — nested semantic groups (e.g. desk → wood →
// wood_top) are all surfaced so the inspector and `anchor` lookups can reach
// the most specific match.
function extractNamed(scene) {
  const nodes = [];
  const usedIds = new Map();

  scene.traverse((obj) => {
    if (obj === scene) return;
    const name = obj.name?.trim();
    if (isGeneric(name) || !hasMeshDescendant(obj)) return;

    let id = toId(name);
    const count = usedIds.get(id) ?? 0;
    if (count > 0) id = `${id}_${count}`;
    usedIds.set(toId(name), count + 1);

    nodes.push({ id, label: name, bounds: getBounds(obj), ref: obj });
  });

  return nodes;
}

// Pipeline 2: greedy spatial clustering for fully-unnamed GLBs.
// Groups leaf meshes by proximity (threshold = 10% of scene diagonal).
function clusterUnnamed(scene) {
  const meshes = [];
  scene.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  if (!meshes.length) return [];

  const rootBox = new THREE.Box3().setFromObject(scene);
  const diagonal = rootBox.getSize(new THREE.Vector3()).length();
  const threshold = diagonal * 0.1;
  const clusters = [];
  const assignedMesh = new Set();

  for (const mesh of meshes) {
    if (assignedMesh.has(mesh.uuid)) continue;
    const seed = new THREE.Box3().setFromObject(mesh);
    const cluster = [mesh];
    assignedMesh.add(mesh.uuid);

    for (const other of meshes) {
      if (assignedMesh.has(other.uuid)) continue;
      const otherBox = new THREE.Box3().setFromObject(other);
      if (
        seed
          .getCenter(new THREE.Vector3())
          .distanceTo(otherBox.getCenter(new THREE.Vector3())) < threshold
      ) {
        cluster.push(other);
        assignedMesh.add(other.uuid);
      }
    }

    clusters.push(cluster);
  }

  return clusters.map((meshes, i) => {
    const box = new THREE.Box3();
    meshes.forEach((m) => box.expandByObject(m));
    const id = `object_${i}`;
    return {
      id,
      label: id,
      bounds: {
        min: box.min.clone(),
        max: box.max.clone(),
        center: box.getCenter(new THREE.Vector3()),
        size: box.getSize(new THREE.Vector3()),
      },
      ref: meshes[0].parent ?? meshes[0],
    };
  });
}

// Main entry point. Call after scene.updateMatrixWorld(true).
// Returns a manifest describing the semantic objects in the scene.
export function extractManifest(scene) {
  scene.updateMatrixWorld(true);

  const nodes = extractNamed(scene);
  const finalNodes = nodes.length >= 1 ? nodes : clusterUnnamed(scene);

  return {
    nodes: finalNodes,
    root: { bounds: getBounds(scene), ref: scene },
    getNode(id) {
      return finalNodes.find((n) => n.id === id || n.label === id);
    },
    findByRef(obj) {
      return finalNodes.find((n) => n.ref === obj);
    },
  };
}

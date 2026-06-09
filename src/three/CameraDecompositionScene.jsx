import { Canvas, useFrame } from "@react-three/fiber";
import { GizmoHelper, GizmoViewport, Html, useGLTF } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";

const MODEL_URL = "/models/sony-camera-4k/sony_alpha_3.glb";
const SD_CARD_URL = "/models/sd-card/scene.gltf";
const SHOW_SD_SLOT_GUIDES = true;
const DEFAULT_SD_SLOT = {
  x: -1.1,
  y: 0.72,
  z: -0.96,
  distance: 0.98,
  scale: 0.525,
};
const SD_SLOT_STORAGE_KEY = "portfolio.sdSlot.v1";
const BODY_SELECTION_STORAGE_KEY = "portfolio.bodySelection.v1";
const DEBUG_VISIBILITY_STORAGE_KEY = "portfolio.cameraDebugVisible.v1";
const BODY_DOOR_PART_STORAGE_KEY = "portfolio.bodyDoorPart.v3";
const SD_TIMELINE_STORAGE_KEY = "portfolio.sdTimeline.v2";
const BODY_PICKER_COMPONENT_LIMIT = 80;
const BODY_PICKER_MIN_TRIANGLES = 18;
const DEFAULT_BODY_DOOR_PART_ID = "body-78";
const LENS_AXIS_CENTER = [0.47, -0.26];
const DEFAULT_SD_TIMELINE = {
  freezeStart: 0.7,
  freezeEnd: 0.96,
  doorOpenStart: 0.68,
  doorOpenEnd: 0.7,
  cardOutStart: 0.7,
  cardOutEnd: 0.8,
  cardInStart: 0.86,
  cardInEnd: 0.92,
  doorCloseStart: 0.92,
  doorCloseEnd: 0.96,
};
const SD_SEQUENCE_POSE = 0.88;
const SD_SEQUENCE_POSE_DRIFT = 0.03;
const SD_SEQUENCE_CAMERA_POSE = 0.7;
const SD_SEQUENCE_CAMERA_DRIFT = 0.05;
const BODY_EXPLODE_START = 0.18;
const BODY_EXPLODE_END = 0.78;
const BODY_EXPLODE_TO = [0, 0, -0.24];
const SD_CARD_SLOT_OFFSET = [0, 0, -0.18];
// Extra inward clearance (beyond the card's own half-extent) so the resting
// card sits fully behind the body shell.
const SD_CARD_HIDE_MARGIN = 0.05;
const SD_CARD_REST_ROTATION = [0.02, Math.PI * 0.5, Math.PI * 1.5];
const BODY_DOOR_OPEN_ANGLE = 1.35;
// The SD door panel is a stack of 3 thin plate components on the side face
// (body-78 is one layer of it), measured via scripts/inspect-door.mjs. Body
// components whose bounds fall fully inside this box (model space, after
// recentering) form the door.
const BODY_DOOR_REGION_BOUNDS = {
  min: [-2.5, -1.65, -2.7],
  max: [-2.3, 0.6, -1.7],
};

let cameraExplodeProgress = 0;
let productMotionProgress = 0;
let bodyDoorProgress = 0;
let sdCardProgress = 0;

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

function timeline(progress, stops) {
  if (progress <= stops[0].t) return stops[0].value;

  for (let i = 1; i < stops.length; i += 1) {
    const previous = stops[i - 1];
    const next = stops[i];
    if (progress <= next.t) {
      const local = easeInOut((progress - previous.t) / (next.t - previous.t));
      return THREE.MathUtils.lerp(previous.value, next.value, local);
    }
  }

  return stops[stops.length - 1].value;
}

function catmullRom(value0, value1, value2, value3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * value1
    + (-value0 + value2) * t
    + (2 * value0 - 5 * value1 + 4 * value2 - value3) * t2
    + (-value0 + 3 * value1 - 3 * value2 + value3) * t3
  );
}

function splineTimeline(progress, stops) {
  if (progress <= stops[0].t) return stops[0].value;

  for (let i = 1; i < stops.length; i += 1) {
    const previous = stops[i - 1];
    const next = stops[i];
    if (progress <= next.t) {
      const point0 = stops[Math.max(0, i - 2)].value;
      const point3 = stops[Math.min(stops.length - 1, i + 1)].value;
      const local = (progress - previous.t) / (next.t - previous.t);
      return catmullRom(point0, previous.value, next.value, point3, local);
    }
  }

  return stops[stops.length - 1].value;
}

function vectorTimeline(progress, stops) {
  return new THREE.Vector3(
    splineTimeline(progress, stops.map((stop) => ({ t: stop.t, value: stop.value[0] }))),
    splineTimeline(progress, stops.map((stop) => ({ t: stop.t, value: stop.value[1] }))),
    splineTimeline(progress, stops.map((stop) => ({ t: stop.t, value: stop.value[2] }))),
  );
}

function getSdSlotStart(slot) {
  return [
    slot.x + SD_CARD_SLOT_OFFSET[0],
    slot.y + SD_CARD_SLOT_OFFSET[1],
    slot.z + SD_CARD_SLOT_OFFSET[2],
  ];
}

function getSdSlotEnd(slot) {
  // Anchor the fully-out position to the slot surface, not the hidden inset.
  return [
    slot.x - slot.distance,
    slot.y + SD_CARD_SLOT_OFFSET[1],
    slot.z + SD_CARD_SLOT_OFFSET[2],
  ];
}

function getBodyExplodeProgress() {
  return easeInOut(clamp01((cameraExplodeProgress - BODY_EXPLODE_START) / (BODY_EXPLODE_END - BODY_EXPLODE_START)));
}

function readStoredSdSlot() {
  if (typeof window === "undefined") return DEFAULT_SD_SLOT;

  try {
    const stored = window.localStorage.getItem(SD_SLOT_STORAGE_KEY);
    if (!stored) return DEFAULT_SD_SLOT;
    return { ...DEFAULT_SD_SLOT, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SD_SLOT;
  }
}

function readStoredBodySelection() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(BODY_SELECTION_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function readStoredDebugVisibility() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEBUG_VISIBILITY_STORAGE_KEY) === "true";
}

function readStoredBodyDoorPart() {
  if (typeof window === "undefined") return DEFAULT_BODY_DOOR_PART_ID;
  const stored = window.localStorage.getItem(BODY_DOOR_PART_STORAGE_KEY);
  if (!stored) return DEFAULT_BODY_DOOR_PART_ID;
  return stored === DEFAULT_BODY_DOOR_PART_ID ? stored : DEFAULT_BODY_DOOR_PART_ID;
}

function readStoredSdTimeline() {
  if (typeof window === "undefined") return DEFAULT_SD_TIMELINE;

  try {
    const stored = window.localStorage.getItem(SD_TIMELINE_STORAGE_KEY);
    if (!stored) return DEFAULT_SD_TIMELINE;
    return { ...DEFAULT_SD_TIMELINE, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SD_TIMELINE;
  }
}

function cloneMaterial(source) {
  const material = source.clone();
  material.side = THREE.DoubleSide;
  material.roughness = Math.min(material.roughness ?? 0.62, 0.72);
  material.metalness = Math.max(material.metalness ?? 0.18, 0.22);
  material.emissive = new THREE.Color("#141824");
  material.emissiveIntensity = 0.12;
  return material;
}

function createDisjointSet(size) {
  const parent = Array.from({ length: size }, (_, index) => index);

  const find = (index) => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };

  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  return { find, union };
}

function vertexKey(position, vertexIndex) {
  const x = Math.round(position.getX(vertexIndex) * 10000);
  const y = Math.round(position.getY(vertexIndex) * 10000);
  const z = Math.round(position.getZ(vertexIndex) * 10000);
  return `${x}:${y}:${z}`;
}

function getTriangleVertex(geometry, triangleIndex, corner) {
  return geometry.index ? geometry.index.array[triangleIndex * 3 + corner] : triangleIndex * 3 + corner;
}

function getConnectedComponents(geometry) {
  const position = geometry.attributes.position;
  const triangleCount = geometry.index ? geometry.index.count / 3 : position.count / 3;
  const disjointSet = createDisjointSet(position.count);

  if (!geometry.index) {
    const weldedVertices = new Map();
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const key = vertexKey(position, vertex);
      if (weldedVertices.has(key)) {
        disjointSet.union(vertex, weldedVertices.get(key));
      } else {
        weldedVertices.set(key, vertex);
      }
    }
  }

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = getTriangleVertex(geometry, triangle, 0);
    const b = getTriangleVertex(geometry, triangle, 1);
    const c = getTriangleVertex(geometry, triangle, 2);
    disjointSet.union(a, b);
    disjointSet.union(a, c);
  }

  const components = new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertices = [
      getTriangleVertex(geometry, triangle, 0),
      getTriangleVertex(geometry, triangle, 1),
      getTriangleVertex(geometry, triangle, 2),
    ];
    const root = disjointSet.find(vertices[0]);

    if (!components.has(root)) {
      components.set(root, {
        triangles: [],
        bounds: new THREE.Box3(),
      });
    }

    const component = components.get(root);
    component.triangles.push(triangle);
    vertices.forEach((vertex) => {
      component.bounds.expandByPoint(new THREE.Vector3(
        position.getX(vertex),
        position.getY(vertex),
        position.getZ(vertex),
      ));
    });
  }

  return [...components.values()];
}

function getAssemblyKey(component) {
  const center = component.bounds.getCenter(new THREE.Vector3());
  const distanceFromLensAxis = Math.hypot(center.x - 0.47, center.y + 0.26);

  if (center.z < -1.05) return "body";
  if (center.z < 1.75 && distanceFromLensAxis > 1.75) return "body";
  if (center.z < -0.2) return "lensMount";
  if (center.z < 0.75) return "rearBarrel";
  if (center.z < 1.75) return "frontBarrel";
  return "frontLens";
}

function buildGeometryFromTriangles(sourceGeometry, triangles) {
  const geometry = new THREE.BufferGeometry();

  Object.entries(sourceGeometry.attributes).forEach(([name, attribute]) => {
    const values = [];
    triangles.forEach((triangle) => {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = getTriangleVertex(sourceGeometry, triangle, corner);
        for (let item = 0; item < attribute.itemSize; item += 1) {
          values.push(attribute.array[vertex * attribute.itemSize + item]);
        }
      }
    });

    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(new attribute.array.constructor(values), attribute.itemSize),
    );
  });

  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function getModelAssemblies(components) {
  const assemblies = {
    body: [],
    lensMount: [],
    rearBarrel: [],
    frontBarrel: [],
    frontLens: [],
  };

  components.forEach((component) => {
    assemblies[getAssemblyKey(component)].push(...component.triangles);
  });

  return assemblies;
}

function getBodyPickerComponents(components) {
  return components
    .map((component) => ({
      ...component,
      assemblyKey: getAssemblyKey(component),
      center: component.bounds.getCenter(new THREE.Vector3()),
    }))
    .filter((component) => (
      component.assemblyKey === "body"
      && component.triangles.length >= BODY_PICKER_MIN_TRIANGLES
    ))
    .sort((a, b) => b.triangles.length - a.triangles.length)
    .slice(0, BODY_PICKER_COMPONENT_LIMIT)
    .map((component, index) => ({
      id: `body-${String(index + 1).padStart(2, "0")}`,
      triangleCount: component.triangles.length,
      triangles: component.triangles,
      center: component.center.toArray(),
    }));
}

function getBodyPickerParts(baseGeometry, bodyPickerComponents) {
  return bodyPickerComponents.map((component) => ({
    id: component.id,
    geometry: buildGeometryFromTriangles(baseGeometry, component.triangles),
    triangleCount: component.triangleCount,
    center: component.center,
  }));
}

function extractModelParts(scene) {
  const sourceMeshes = [];
  scene.updateWorldMatrix(true, true);
  scene.traverse((object) => {
    if (object.isMesh && object.geometry?.attributes?.position) {
      sourceMeshes.push(object);
    }
  });

  const source = sourceMeshes[0];
  if (!source) return null;

  const baseGeometry = source.geometry.clone();
  baseGeometry.applyMatrix4(source.matrixWorld);
  baseGeometry.computeBoundingBox();

  const material = Array.isArray(source.material) ? source.material[0] : source.material;
  const bounds = baseGeometry.boundingBox;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  baseGeometry.translate(-center.x, -center.y, -center.z);

  const components = getConnectedComponents(baseGeometry);
  const bodyPickerComponents = getBodyPickerComponents(components);
  const assemblies = getModelAssemblies(components);

  // Pull the door panel components out of the body so they hinge as one piece.
  const doorRegion = new THREE.Box3(
    new THREE.Vector3(...BODY_DOOR_REGION_BOUNDS.min),
    new THREE.Vector3(...BODY_DOOR_REGION_BOUNDS.max),
  );
  const doorTriangles = [];
  components.forEach((component) => {
    if (getAssemblyKey(component) !== "body") return;
    if (!doorRegion.containsBox(component.bounds)) return;
    doorTriangles.push(...component.triangles);
  });
  let doorPart = null;
  if (doorTriangles.length > 0) {
    const doorTriangleSet = new Set(doorTriangles);
    assemblies.body = assemblies.body.filter((triangle) => !doorTriangleSet.has(triangle));
    const doorGeometry = buildGeometryFromTriangles(baseGeometry, doorTriangles);
    doorPart = {
      geometry: doorGeometry,
      material: cloneMaterial(material),
      bounds: doorGeometry.boundingBox.clone(),
    };
  }

  const parts = [
    {
      key: "body",
      triangles: assemblies.body,
      to: BODY_EXPLODE_TO,
      start: BODY_EXPLODE_START,
      end: BODY_EXPLODE_END,
    },
    { key: "lensMount", triangles: assemblies.lensMount, to: [0, 0, 0.3], start: 0.2, end: 0.74 },
    { key: "rearBarrel", triangles: assemblies.rearBarrel, to: [0, 0, 0.78], start: 0.22, end: 0.74 },
    { key: "frontBarrel", triangles: assemblies.frontBarrel, to: [0, 0, 1.22], start: 0.24, end: 0.76 },
    { key: "frontLens", triangles: assemblies.frontLens, to: [0, 0, 1.68], start: 0.26, end: 0.78 },
  ];

  return {
    parts: parts.map((part) => ({
      ...part,
      geometry: buildGeometryFromTriangles(baseGeometry, part.triangles),
      material: cloneMaterial(material),
      from: [0, 0, 0],
      rotationTo: part.rotationTo ?? [
        part.to[2] > 0 ? 0.012 : -0.006,
        0,
        0,
      ],
    })),
    bodyPickerParts: getBodyPickerParts(baseGeometry, bodyPickerComponents),
    doorPart,
    scale: 2.9 / Math.max(size.x, size.y, size.z),
  };
}

function PartMesh({ part }) {
  const ref = useRef();

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = easeInOut(clamp01((cameraExplodeProgress - part.start) / (part.end - part.start)));
    const drift = Math.sin(clock.elapsedTime * 0.5 + part.start * 10) * 0.008 * t;
    ref.current.position.set(
      THREE.MathUtils.lerp(part.from[0], part.to[0], t),
      THREE.MathUtils.lerp(part.from[1], part.to[1], t) + drift,
      THREE.MathUtils.lerp(part.from[2], part.to[2], t),
    );
    ref.current.rotation.set(
      THREE.MathUtils.lerp(0, part.rotationTo[0], t),
      THREE.MathUtils.lerp(0, part.rotationTo[1], t),
      THREE.MathUtils.lerp(0, part.rotationTo[2], t),
    );
  });

  return <mesh ref={ref} geometry={part.geometry} material={part.material} raycast={() => null} />;
}

function CameraInternalGlass() {
  const glassRef = useRef();
  const sensorRef = useRef();

  useFrame(() => {
    const t = easeInOut(clamp01((cameraExplodeProgress - 0.18) / 0.42));
    if (glassRef.current) glassRef.current.material.opacity = THREE.MathUtils.lerp(0.08, 0.36, t);
    if (sensorRef.current) sensorRef.current.material.opacity = THREE.MathUtils.lerp(0.16, 0.54, t);
  });

  return (
    <group position={[LENS_AXIS_CENTER[0], LENS_AXIS_CENTER[1], 0]}>
      <mesh ref={sensorRef} position={[0, 0, -0.62]} renderOrder={4} raycast={() => null}>
        <planeGeometry args={[0.92, 0.62]} />
        <meshPhysicalMaterial
          color="#18202b"
          emissive="#111827"
          emissiveIntensity={0.28}
          metalness={0.12}
          roughness={0.22}
          side={THREE.DoubleSide}
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={glassRef} position={[0, 0, -0.38]} renderOrder={5} raycast={() => null}>
        <circleGeometry args={[0.66, 72]} />
        <meshPhysicalMaterial
          color="#9ccfff"
          emissive="#203a56"
          emissiveIntensity={0.18}
          metalness={0}
          roughness={0.04}
          transmission={0.38}
          thickness={0.12}
          side={THREE.DoubleSide}
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, -0.36]} renderOrder={6} raycast={() => null}>
        <torusGeometry args={[0.68, 0.018, 12, 96]} />
        <meshBasicMaterial color="#5f86a8" transparent opacity={0.34} depthWrite={false} />
      </mesh>
    </group>
  );
}

function OrientationAxes() {
  return (
    <GizmoHelper alignment="bottom-right" margin={[72, 88]}>
      <GizmoViewport
        axisColors={["#ff5f5f", "#75ff8a", "#62a8ff"]}
        labelColor="#f5f5f5"
        hideNegativeAxes
      />
    </GizmoHelper>
  );
}

function BodyPartPicker({ parts, selectedIds, onToggle }) {
  const selectedMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#7cffb2",
    depthTest: false,
    opacity: 0.5,
    transparent: true,
  }), []);
  const idleMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#41a7ff",
    depthTest: false,
    opacity: 0.14,
    transparent: true,
    wireframe: true,
  }), []);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <group>
      {parts.map((part) => {
        const selected = selectedSet.has(part.id);

        return (
          <mesh
            key={part.id}
            geometry={part.geometry}
            material={selected ? selectedMaterial : idleMaterial}
            renderOrder={selected ? 22 : 20}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(part.id);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onToggle(part.id);
            }}
          >
            {selected && (
              <Html
                center
                distanceFactor={8}
                position={part.center}
                style={{ pointerEvents: "none" }}
              >
                <div className="body-part-badge">{part.id}</div>
              </Html>
            )}
          </mesh>
        );
      })}
    </group>
  );
}

function SdSlotGuide({ sdSlot }) {
  const hingeStart = useMemo(() => new THREE.Vector3(sdSlot.x, sdSlot.y, sdSlot.z), [sdSlot]);
  const slotStart = useMemo(() => new THREE.Vector3(...getSdSlotStart(sdSlot)), [sdSlot]);
  const slotEnd = useMemo(() => new THREE.Vector3(...getSdSlotEnd(sdSlot)), [sdSlot]);
  const pathGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      slotStart,
      slotEnd,
    ]);
    return geometry;
  }, [slotStart, slotEnd]);

  if (!SHOW_SD_SLOT_GUIDES) return null;

  return (
    <group>
      <line geometry={pathGeometry}>
        <lineBasicMaterial color="#ff4d4d" linewidth={2} depthTest={false} />
      </line>
      <group position={hingeStart}>
        <mesh renderOrder={10}>
          <sphereGeometry args={[0.065, 18, 18]} />
          <meshBasicMaterial color="#7cffb2" depthTest={false} />
        </mesh>
      </group>
      <group position={slotStart}>
        <mesh renderOrder={10}>
          <sphereGeometry args={[0.09, 18, 18]} />
          <meshBasicMaterial color="#ff4d4d" depthTest={false} />
        </mesh>
      </group>
      <group position={slotEnd}>
        <mesh renderOrder={10}>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshBasicMaterial color="#ffd33d" depthTest={false} />
        </mesh>
      </group>
      <Html position={[hingeStart.x, hingeStart.y + 0.34, hingeStart.z]} distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div
          style={{
            background: "rgba(10, 10, 10, 0.72)",
            border: "1px solid rgba(255, 255, 255, 0.32)",
            borderRadius: 8,
            color: "white",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 11,
            lineHeight: "15px",
            padding: "6px 8px",
            whiteSpace: "nowrap",
          }}
        >
          <div><span style={{ color: "#7cffb2" }}>green</span> body-78 hinge</div>
          <div><span style={{ color: "#ff4d4d" }}>dot</span> slot origin</div>
          <div><span style={{ color: "#ffd33d" }}>cube</span> fully out</div>
        </div>
      </Html>
    </group>
  );
}

function BodyDoorMesh({ part }) {
  const hingeRef = useRef();
  // Hinge along the door's vertical rear edge.
  const pivot = useMemo(() => {
    const center = part.bounds.getCenter(new THREE.Vector3());
    return new THREE.Vector3(center.x, center.y, part.bounds.max.z);
  }, [part]);
  const meshOffset = useMemo(() => pivot.clone().multiplyScalar(-1), [pivot]);

  useFrame(() => {
    if (!hingeRef.current) return;
    hingeRef.current.rotation.y = THREE.MathUtils.lerp(0, BODY_DOOR_OPEN_ANGLE, easeInOut(bodyDoorProgress));
  });

  return (
    <group ref={hingeRef} position={pivot} raycast={() => null}>
      <mesh geometry={part.geometry} material={part.material} position={meshOffset} raycast={() => null} />
    </group>
  );
}

function SdCardPiece({ sdSlot }) {
  const ref = useRef();
  const gltf = useGLTF(SD_CARD_URL);
  const card = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      if (!object.isMesh) return;
      object.material = object.material.clone();
      object.material.side = THREE.DoubleSide;
      object.material.roughness = Math.min(object.material.roughness ?? 0.5, 0.62);
      object.material.color?.multiplyScalar(1.8);
      object.material.emissive = new THREE.Color("#2a2f3a");
      object.material.emissiveIntensity = 0.36;
    });

    clone.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const center = bounds.getCenter(new THREE.Vector3());

    // Half-extent of the rotated card along the slide axis (x), unscaled, so
    // the resting position can bury the whole card behind the body shell.
    const restRotation = new THREE.Euler(...SD_CARD_REST_ROTATION);
    const size = bounds.getSize(new THREE.Vector3());
    let halfExtentX = 0;
    for (let i = 0; i < 8; i += 1) {
      const corner = new THREE.Vector3(
        (i & 1 ? 0.5 : -0.5) * size.x,
        (i & 2 ? 0.5 : -0.5) * size.y,
        (i & 4 ? 0.5 : -0.5) * size.z,
      ).applyEuler(restRotation);
      halfExtentX = Math.max(halfExtentX, Math.abs(corner.x));
    }

    return { scene: clone, center, halfExtentX };
  }, [gltf.scene]);

  useFrame(() => {
    if (!ref.current) return;
    const t = sdCardProgress;
    const slotStart = getSdSlotStart(sdSlot);
    const slotEnd = getSdSlotEnd(sdSlot);
    slotStart[0] = sdSlot.x + card.halfExtentX * sdSlot.scale + SD_CARD_HIDE_MARGIN;
    ref.current.position.set(
      THREE.MathUtils.lerp(slotStart[0], slotEnd[0], t),
      THREE.MathUtils.lerp(slotStart[1], slotEnd[1], t),
      THREE.MathUtils.lerp(slotStart[2], slotEnd[2], t),
    );
    ref.current.rotation.set(
      SD_CARD_REST_ROTATION[0],
      THREE.MathUtils.lerp(SD_CARD_REST_ROTATION[1], Math.PI * 0.48, t),
      SD_CARD_REST_ROTATION[2],
    );
  });

  return (
    <group ref={ref} scale={sdSlot.scale}>
      <primitive object={card.scene} position={card.center.clone().multiplyScalar(-1)} />
    </group>
  );
}

function SdCardAssembly({ sdSlot, doorPart }) {
  const ref = useRef();

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = getBodyExplodeProgress();
    const drift = Math.sin(clock.elapsedTime * 0.5 + BODY_EXPLODE_START * 10) * 0.008 * t;
    ref.current.position.set(
      THREE.MathUtils.lerp(0, BODY_EXPLODE_TO[0], t),
      THREE.MathUtils.lerp(0, BODY_EXPLODE_TO[1], t) + drift,
      THREE.MathUtils.lerp(0, BODY_EXPLODE_TO[2], t),
    );
    ref.current.rotation.set(
      THREE.MathUtils.lerp(0, -0.006, t),
      0,
      0,
    );
  });

  return (
    <group ref={ref}>
      {doorPart && <BodyDoorMesh part={doorPart} />}
      <SdCardPiece sdSlot={sdSlot} />
    </group>
  );
}

function SonyCameraModel({
  sdSlot,
  selectedBodyParts,
  onToggleBodyPart,
  onBodyPartsReady,
  debugVisible,
}) {
  const rigRef = useRef();
  const gltf = useGLTF(MODEL_URL);
  const model = useMemo(() => extractModelParts(gltf.scene), [gltf.scene]);

  useEffect(() => {
    if (!model) return;
    onBodyPartsReady(model.bodyPickerParts.map((part) => ({
      id: part.id,
      triangleCount: part.triangleCount,
      center: part.center,
    })));
  }, [model, onBodyPartsReady]);

  useFrame(({ clock }) => {
    if (!rigRef.current) return;
    const t = productMotionProgress;
    const pitch = splineTimeline(t, [
      { t: 0, value: 0 },
      { t: 0.15, value: 0.02 },
      { t: 0.3, value: -0.32 },
      { t: 0.5, value: -0.54 },
      { t: 0.7, value: -0.46 },
      { t: 0.9, value: -0.16 },
      { t: 1, value: 0 },
    ]);
    const yaw = splineTimeline(t, [
      { t: 0, value: 6.28 },
      { t: 0.15, value: 6.3 },
      { t: 0.3, value: 6.72 },
      { t: 0.5, value: 7.18 },
      { t: 0.7, value: 7.42 },
      { t: 0.9, value: 6.78 },
      { t: 1, value: 6.28 },
    ]);
    const roll = splineTimeline(t, [
      { t: 0, value: 0.02 },
      { t: 0.15, value: 0.34 },
      { t: 0.3, value: -0.42 },
      { t: 0.5, value: -0.78 },
      { t: 0.7, value: -0.48 },
      { t: 0.9, value: 0.18 },
      { t: 1, value: 0.02 },
    ]);
    const drift = vectorTimeline(t, [
      { t: 0, value: [0, 0, 0] },
      { t: 0.15, value: [0, 0, 0] },
      { t: 0.3, value: [0.06, -0.02, 0] },
      { t: 0.5, value: [0.14, 0.08, 0] },
      { t: 0.7, value: [-0.08, 0.12, 0] },
      { t: 0.9, value: [-0.03, 0.02, 0] },
      { t: 1, value: [0, 0, 0] },
    ]);

    rigRef.current.position.copy(drift);
    rigRef.current.rotation.set(
      pitch + Math.sin(clock.elapsedTime * 0.34) * 0.01,
      yaw,
      roll,
    );
  });

  if (!model) return null;

  return (
    <group ref={rigRef} scale={model.scale} position={[-0.08, -0.06, 0]}>
      {model.parts.map((part) => (
        <PartMesh key={part.key} part={part} />
      ))}
      <CameraInternalGlass />
      {debugVisible && (
        <>
          <BodyPartPicker
            parts={model.bodyPickerParts}
            selectedIds={selectedBodyParts}
            onToggle={onToggleBodyPart}
          />
          <SdSlotGuide sdSlot={sdSlot} />
        </>
      )}
      <SdCardAssembly sdSlot={sdSlot} doorPart={model.doorPart} />
    </group>
  );
}

function CameraScene({
  scrollProgressRef,
  sdSlot,
  selectedBodyParts,
  onToggleBodyPart,
  onBodyPartsReady,
  sdTimeline,
  debugVisible,
}) {
  const progressRef = useRef(0);

  useFrame(({ camera }, delta) => {
    const target = clamp01(scrollProgressRef?.current ?? 0);
    progressRef.current = THREE.MathUtils.damp(progressRef.current, target, 5.2, delta);
    const rawProgress = progressRef.current;
    const cameraMotionProgress = timeline(rawProgress, [
      { t: 0, value: 0 },
      { t: sdTimeline.freezeStart, value: SD_SEQUENCE_CAMERA_POSE - SD_SEQUENCE_CAMERA_DRIFT },
      { t: sdTimeline.freezeEnd, value: SD_SEQUENCE_CAMERA_POSE + SD_SEQUENCE_CAMERA_DRIFT },
      { t: 1, value: 1 },
    ]);
    productMotionProgress = timeline(progressRef.current, [
      { t: 0, value: 0 },
      { t: sdTimeline.freezeStart, value: SD_SEQUENCE_POSE - SD_SEQUENCE_POSE_DRIFT },
      { t: sdTimeline.freezeEnd, value: SD_SEQUENCE_POSE + SD_SEQUENCE_POSE_DRIFT },
      { t: 1, value: 1 },
    ]);
    cameraExplodeProgress = splineTimeline(cameraMotionProgress, [
      { t: 0, value: 0 },
      { t: 0.18, value: 0 },
      { t: 0.32, value: 0.24 },
      { t: 0.48, value: 0.64 },
      { t: 0.64, value: 0.76 },
      { t: 0.78, value: 0.72 },
      { t: 0.9, value: 0.22 },
      { t: 1, value: 0 },
    ]);
    bodyDoorProgress = timeline(rawProgress, [
      { t: 0, value: 0 },
      { t: sdTimeline.doorOpenStart, value: 0 },
      { t: sdTimeline.doorOpenEnd, value: 1 },
      { t: sdTimeline.doorCloseStart, value: 1 },
      { t: sdTimeline.doorCloseEnd, value: 0 },
      { t: 1, value: 0 },
    ]);
    sdCardProgress = timeline(rawProgress, [
      { t: 0, value: 0 },
      { t: sdTimeline.cardOutStart, value: 0 },
      { t: sdTimeline.cardOutEnd, value: 1 },
      { t: sdTimeline.cardInStart, value: 1 },
      { t: sdTimeline.cardInEnd, value: 0 },
      { t: 1, value: 0 },
    ]);
    document.documentElement.dataset.cameraProgress = cameraExplodeProgress.toFixed(3);
    document.documentElement.dataset.bodyDoorProgress = bodyDoorProgress.toFixed(3);
    document.documentElement.dataset.sdCardProgress = sdCardProgress.toFixed(3);

    const t = cameraMotionProgress;
    const orbitAroundLength = splineTimeline(t, [
      { t: 0, value: 0 },
      { t: 0.15, value: 0.2 },
      { t: 0.3, value: Math.PI * 0.55 },
      { t: 0.5, value: Math.PI },
      { t: 0.7, value: Math.PI * 1.42 },
      { t: 0.9, value: Math.PI * 1.84 },
      { t: 1, value: Math.PI * 2 },
    ]);
    const radius = splineTimeline(t, [
      { t: 0, value: 4.85 },
      { t: 0.15, value: 4.55 },
      { t: 0.3, value: 5.05 },
      { t: 0.5, value: 6.15 },
      { t: 0.7, value: 6.45 },
      { t: 0.9, value: 4.95 },
      { t: 1, value: 4.85 },
    ]);
    const orbitHeight = splineTimeline(t, [
      { t: 0, value: 0 },
      { t: 0.15, value: 0.08 },
      { t: 0.3, value: 0.62 },
      { t: 0.5, value: 0.72 },
      { t: 0.7, value: 0.54 },
      { t: 0.9, value: 0.18 },
      { t: 1, value: 0 },
    ]);
    const orbitPosition = new THREE.Vector3(
      Math.sin(orbitAroundLength) * radius,
      orbitHeight,
      Math.cos(orbitAroundLength) * radius,
    );
    const timelineTarget = vectorTimeline(t, [
      { t: 0, value: [0, 0, 0] },
      { t: 0.3, value: [0.04, 0.02, 0] },
      { t: 0.5, value: [0.08, 0.06, 0] },
      { t: 0.7, value: [-0.04, 0.08, 0] },
      { t: 1, value: [0, 0, 0] },
    ]);
    camera.position.copy(orbitPosition);
    camera.fov = splineTimeline(t, [
      { t: 0, value: 36 },
      { t: 0.15, value: 34 },
      { t: 0.3, value: 38 },
      { t: 0.5, value: 44 },
      { t: 0.7, value: 45 },
      { t: 0.9, value: 38 },
      { t: 1, value: 36 },
    ]);
    camera.lookAt(timelineTarget);
    camera.updateProjectionMatrix();
  });

  return (
    <>
      <color attach="background" args={["#20211f"]} />
      <fog attach="fog" args={["#20211f", 9, 20]} />
      <ambientLight color="#b7c0d8" intensity={0.95} />
      <directionalLight position={[-3, 4.4, 2.6]} color="#ffc19d" intensity={6.4} />
      <directionalLight position={[4, 1.5, -3]} color="#8ea6ff" intensity={2.4} />
      <spotLight position={[0, 4, 3.2]} angle={0.58} penumbra={0.9} color="#ffe0c8" intensity={15} />
      <OrientationAxes />
      <Suspense fallback={null}>
        <SonyCameraModel
          sdSlot={sdSlot}
          selectedBodyParts={selectedBodyParts}
          onToggleBodyPart={onToggleBodyPart}
          onBodyPartsReady={onBodyPartsReady}
          debugVisible={debugVisible}
        />
      </Suspense>
    </>
  );
}

function SdSlotPicker({ sdSlot, onChange }) {
  const controls = [
    { key: "x", label: "side X", min: -2.2, max: 0.6, step: 0.01 },
    { key: "y", label: "height Y", min: -1.4, max: 1.8, step: 0.01 },
    { key: "z", label: "back/front Z", min: -1.8, max: 0.2, step: 0.01 },
    { key: "distance", label: "slide out", min: 0.05, max: 1.8, step: 0.01 },
    { key: "scale", label: "card size", min: 0.2, max: 0.8, step: 0.01 },
  ];

  const updateValue = (key, value) => {
    onChange((current) => ({
      ...current,
      [key]: Number(value),
    }));
  };

  const reset = () => onChange(DEFAULT_SD_SLOT);
  const rounded = Object.fromEntries(
    Object.entries(sdSlot).map(([key, value]) => [key, Number(value.toFixed(2))]),
  );

  return (
    <div
      className="sd-slot-picker"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <div className="sd-slot-picker__header">
        <span>SD slot picker</span>
        <button type="button" onClick={reset}>Reset</button>
      </div>
      <div className="sd-slot-picker__values">
        {JSON.stringify(rounded)}
      </div>
      {controls.map((control) => (
        <label className="sd-slot-picker__control" key={control.key}>
          <span>{control.label}</span>
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={sdSlot[control.key]}
            onChange={(event) => updateValue(control.key, event.target.value)}
          />
          <input
            type="number"
            min={control.min}
            max={control.max}
            step={control.step}
            value={Number(sdSlot[control.key].toFixed(2))}
            onChange={(event) => updateValue(control.key, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

function BodyPartSelectionPanel({
  availableBodyParts,
  selectedBodyParts,
  bodyDoorPartId,
  onToggle,
  onSetDoor,
  onClear,
}) {
  const selectedSet = new Set(selectedBodyParts);

  return (
    <div
      className="body-part-picker"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <div className="body-part-picker__header">
        <span>Body part picker</span>
        <button type="button" onClick={onClear}>Clear</button>
      </div>
      <div className="body-part-picker__hint">
        SD door anchor: <strong>{bodyDoorPartId}</strong>. Toggle parts here; selected chunks turn green.
      </div>
      <div className="body-part-picker__values">
        {selectedBodyParts.length > 0
          ? JSON.stringify(selectedBodyParts)
          : "[]"}
      </div>
      <div className="body-part-picker__toggles">
        {availableBodyParts.length > 0 ? availableBodyParts.map((part) => {
          const selected = selectedSet.has(part.id);

          return (
            <button
              className={selected ? "body-part-toggle is-selected" : "body-part-toggle"}
              key={part.id}
              type="button"
              onClick={() => onToggle(part.id)}
            >
              <span>{part.id}</span>
              <small>{part.id === bodyDoorPartId ? "anchor" : `${part.triangleCount} tris`}</small>
            </button>
          );
        }) : (
          <div className="body-part-picker__empty">Loading body parts...</div>
        )}
      </div>
      <div className="body-door-picker__toggles">
        {availableBodyParts.length > 0 ? availableBodyParts.map((part) => {
          const selected = part.id === bodyDoorPartId;

          return (
            <button
              className={selected ? "body-door-toggle is-selected" : "body-door-toggle"}
              key={part.id}
              type="button"
              onClick={() => onSetDoor(part.id)}
            >
              {part.id}
            </button>
          );
        }) : (
          <div className="body-part-picker__empty">Loading body parts...</div>
        )}
      </div>
    </div>
  );
}

function SdTimelinePanel({ currentProgress, sdTimeline, onChange, onReset }) {
  const controls = [
    { key: "freezeStart", label: "slow start" },
    { key: "doorOpenStart", label: "door starts" },
    { key: "doorOpenEnd", label: "door open" },
    { key: "cardOutStart", label: "card starts" },
    { key: "cardOutEnd", label: "card out" },
    { key: "cardInStart", label: "card returns" },
    { key: "cardInEnd", label: "card in" },
    { key: "doorCloseStart", label: "door closes" },
    { key: "doorCloseEnd", label: "door shut" },
    { key: "freezeEnd", label: "slow end" },
  ];
  const markers = controls.map((control) => ({
    ...control,
    value: sdTimeline[control.key],
  }));
  const roundedTimeline = Object.fromEntries(
    Object.entries(sdTimeline).map(([key, value]) => [key, Number(value.toFixed(3))]),
  );

  const updateValue = (key, value) => {
    onChange((current) => ({
      ...current,
      [key]: Number(value),
    }));
  };

  return (
    <div
      className="sd-timeline-panel"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <div className="sd-timeline-panel__header">
        <span>SD timeline</span>
        <button type="button" onClick={onReset}>Reset</button>
      </div>
      <div className="sd-timeline-panel__current">
        scroll {(currentProgress * 100).toFixed(1)}%
      </div>
      <div className="sd-timeline-panel__track">
        <div
          className="sd-timeline-panel__playhead"
          style={{ left: `${currentProgress * 100}%` }}
        />
        {markers.map((marker) => (
          <div
            className="sd-timeline-panel__marker"
            key={marker.key}
            style={{ left: `${marker.value * 100}%` }}
            title={`${marker.label}: ${(marker.value * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="sd-timeline-panel__values">
        {JSON.stringify(roundedTimeline)}
      </div>
      <div className="sd-timeline-panel__controls">
        {controls.map((control) => (
          <label className="sd-timeline-control" key={control.key}>
            <span>{control.label}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={sdTimeline[control.key]}
              onChange={(event) => updateValue(control.key, event.target.value)}
            />
            <input
              type="number"
              min={0}
              max={1}
              step={0.005}
              value={Number(sdTimeline[control.key].toFixed(3))}
              onChange={(event) => updateValue(control.key, event.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function DebugControlPortal({
  debugVisible,
  sdSlot,
  setSdSlot,
  availableBodyParts,
  selectedBodyParts,
  bodyDoorPartId,
  setBodyDoorPartId,
  currentProgress,
  sdTimeline,
  setSdTimeline,
  toggleBodyPart,
  clearBodyParts,
}) {
  if (typeof document === "undefined" || !debugVisible) return null;

  return createPortal(
    <>
      <SdSlotPicker sdSlot={sdSlot} onChange={setSdSlot} />
      <BodyPartSelectionPanel
        availableBodyParts={availableBodyParts}
        selectedBodyParts={selectedBodyParts}
        bodyDoorPartId={bodyDoorPartId}
        onToggle={toggleBodyPart}
        onSetDoor={setBodyDoorPartId}
        onClear={clearBodyParts}
      />
      <SdTimelinePanel
        currentProgress={currentProgress}
        sdTimeline={sdTimeline}
        onChange={setSdTimeline}
        onReset={() => setSdTimeline(DEFAULT_SD_TIMELINE)}
      />
    </>,
    document.body,
  );
}

function DebugHotkeyHint({ debugVisible }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={debugVisible ? "camera-debug-hotkey is-active" : "camera-debug-hotkey"}>
      Press D for debug
    </div>,
    document.body,
  );
}

export default function CameraDecompositionScene({ scrollProgressRef, style }) {
  const [sdSlot, setSdSlot] = useState(readStoredSdSlot);
  const [selectedBodyParts, setSelectedBodyParts] = useState(readStoredBodySelection);
  const [availableBodyParts, setAvailableBodyParts] = useState([]);
  const [debugVisible, setDebugVisible] = useState(readStoredDebugVisibility);
  const [bodyDoorPartId, setBodyDoorPartId] = useState(readStoredBodyDoorPart);
  const [sdTimeline, setSdTimeline] = useState(readStoredSdTimeline);
  const [currentProgress, setCurrentProgress] = useState(0);
  const appliedBodyAnchorRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem(SD_SLOT_STORAGE_KEY, JSON.stringify(sdSlot));
  }, [sdSlot]);

  useEffect(() => {
    window.localStorage.setItem(BODY_SELECTION_STORAGE_KEY, JSON.stringify(selectedBodyParts));
  }, [selectedBodyParts]);

  useEffect(() => {
    window.localStorage.setItem(DEBUG_VISIBILITY_STORAGE_KEY, String(debugVisible));
  }, [debugVisible]);

  useEffect(() => {
    window.localStorage.setItem(BODY_DOOR_PART_STORAGE_KEY, bodyDoorPartId);
  }, [bodyDoorPartId]);

  useEffect(() => {
    window.localStorage.setItem(SD_TIMELINE_STORAGE_KEY, JSON.stringify(sdTimeline));
  }, [sdTimeline]);

  useEffect(() => {
    let frameId;
    let lastUpdate = 0;

    const updateProgress = (time) => {
      if (time - lastUpdate > 100) {
        setCurrentProgress(clamp01(scrollProgressRef?.current ?? 0));
        lastUpdate = time;
      }
      frameId = window.requestAnimationFrame(updateProgress);
    };

    frameId = window.requestAnimationFrame(updateProgress);
    return () => window.cancelAnimationFrame(frameId);
  }, [scrollProgressRef]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const isTyping = target?.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";

      if (isTyping || event.key.toLowerCase() !== "d") return;
      event.preventDefault();
      setDebugVisible((visible) => !visible);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleBodyPart = (id) => {
    setSelectedBodyParts((current) => (
      current.includes(id)
        ? current.filter((partId) => partId !== id)
        : [...current, id].sort()
    ));
  };
  const handleBodyPartsReady = useCallback((parts) => {
    setAvailableBodyParts(parts);
  }, []);

  useEffect(() => {
    const anchor = availableBodyParts.find((part) => part.id === bodyDoorPartId);
    if (!anchor || appliedBodyAnchorRef.current === bodyDoorPartId) return;

    appliedBodyAnchorRef.current = bodyDoorPartId;
    setSdSlot((current) => ({
      ...current,
      x: anchor.center[0],
      y: anchor.center[1],
      z: anchor.center[2],
      distance: 0.78,
      scale: 0.5,
    }));
  }, [availableBodyParts, bodyDoorPartId]);

  useEffect(() => {
    setSelectedBodyParts((current) => (
      current.includes(bodyDoorPartId)
        ? current
        : [...current, bodyDoorPartId].sort()
    ));
  }, [bodyDoorPartId]);

  return (
    <>
      <div className="local-camera-scene" style={style}>
        <Canvas
          gl={{ alpha: false, antialias: true, preserveDrawingBuffer: true }}
          dpr={[1, 1.75]}
          camera={{ position: [0, 0, 4.85], fov: 36, near: 0.1, far: 50 }}
        >
          <CameraScene
            scrollProgressRef={scrollProgressRef}
            sdSlot={sdSlot}
            selectedBodyParts={selectedBodyParts}
            onToggleBodyPart={toggleBodyPart}
            onBodyPartsReady={handleBodyPartsReady}
            sdTimeline={sdTimeline}
            debugVisible={debugVisible}
          />
        </Canvas>
        <a
          className="camera-model-credit"
          href="https://sketchfab.com/3d-models/sony-camera-4k-f7c8d7831aa24f979ff531934c8439de"
          target="_blank"
          rel="noreferrer"
        >
          Sony Camera 4K by Arham Abdullah, CC BY
        </a>
      </div>
      <DebugControlPortal
        debugVisible={debugVisible}
        sdSlot={sdSlot}
        setSdSlot={setSdSlot}
        availableBodyParts={availableBodyParts}
        selectedBodyParts={selectedBodyParts}
        bodyDoorPartId={bodyDoorPartId}
        setBodyDoorPartId={setBodyDoorPartId}
        currentProgress={currentProgress}
        sdTimeline={sdTimeline}
        setSdTimeline={setSdTimeline}
        toggleBodyPart={toggleBodyPart}
        clearBodyParts={() => setSelectedBodyParts([])}
      />
      <DebugHotkeyHint debugVisible={debugVisible} />
    </>
  );
}

useGLTF.preload(MODEL_URL);
useGLTF.preload(SD_CARD_URL);

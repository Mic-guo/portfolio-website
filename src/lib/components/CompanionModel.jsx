import { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useSceneMetrics } from "../core/SceneContext";
import { useInspectorProps } from "../core/InspectorContext";
import { useDriver } from "../hooks/useDriver";
import { useSpringDriver } from "../drivers/springDriver";

// Shared PMREM-filtered RoomEnvironment, generated once per renderer and
// reused by every CompanionModel that asks for reflections. Applied per-mesh
// (material.envMap) instead of scene.environment so one reflective companion
// doesn't add image-based fill light to the whole scene.
const roomEnvCache = new WeakMap();
function getRoomEnvMap(gl) {
  let texture = roomEnvCache.get(gl);
  if (!texture) {
    const pmrem = new THREE.PMREMGenerator(gl);
    texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    roomEnvCache.set(gl, texture);
  }
  return texture;
}

// Drops an additional GLB into the host scene. Must be used as a child of
// <ModelViewer> (or any <SceneProvider>).
//
//   src           path to the companion GLB.
//   position      [x, y, z] in the host scene's world units. y=0 puts the
//                 companion's feet on the host scene's floor. Ignored when
//                 `anchor` is provided.
//   anchor        place relative to a named manifest node of the host scene:
//                   { node: 'wood', face: 'top'|'bottom'|'center',
//                     offset: [x, y, z] }
//                 `face` defaults to 'top'; `offset` defaults to [0,0,0] and
//                 is applied in world units after the host's scaling.
//   targetHeight  auto-scales so the companion's bounding-box height matches.
//   rotation      same shape as <ModelViewer>'s rotation prop — revolves the
//                 companion around the world origin so it stays locked to the
//                 host model as it rotates.
//   spinSpeed     additional self-rotation (rad/s) for idle motion.
//   materials     { 'Parent/Mesh name': MeshStandardMaterial params } applied
//                 by matching the end of each mesh's ancestor name path.
//                 Useful for GLBs exported without materials. First matching
//                 key wins (insertion order). 'Group/*' matches every mesh
//                 inside that group; '*' matches any mesh, so put it last as
//                 a catch-all. Keys may use the original GLB names — spaces
//                 are sanitized to '_' the same way GLTFLoader does. Note the
//                 loader also dedupes repeated names ('Sphere' → 'Sphere_1'),
//                 so rules must use the deduped runtime names (check with
//                 debugLabels).
//   debugLabels   overlays each mesh's name path. Pass true for defaults, or
//                 { spread, onMeshesReady, onLabelClick } — spread pushes
//                 labels outward from the model center so dense areas stay
//                 readable; onLabelClick(path) makes each label clickable
//                 (e.g. to hide that part).
//   debugVisibility  { labels?: Record<path,bool>, meshes?: Record<path,bool> }
//                 per-mesh show/hide for labels and geometry. Omitted paths are
//                 visible. Use the companion debug panel to isolate parts.
//   envMapIntensity  gives this model's materials a procedural room env map to
//                 reflect (metallic PBR models render dead black without one).
//                 Scoped to this model only — does not light the rest of the
//                 scene. 0 (default) disables.
//   envMapEnable  optional 0→1 driver multiplied into envMapIntensity (eased
//                 per-frame), so the reflections can dim with the scene's
//                 lighting instead of staying lit (env maps ignore lights).
//   onClick       pointer click handler; also enables a pointer cursor.
export default function CompanionModel({
  src,
  position = [0, 0, 0],
  anchor,
  orientation = [0, 0, 0],
  targetHeight = 1.5,
  rotation,
  spinSpeed = 0,
  shadows = true,
  materials,
  debugLabels = false,
  debugVisibility,
  envMapIntensity = 0,
  envMapEnable,
  onClick,
}) {
  const { manifest, scaleFactor: hostScale } = useSceneMetrics();
  const { scene: rawScene } = useGLTF(src);
  const scene = useMemo(() => rawScene.clone(true), [rawScene]);
  const inspectorProps = useInspectorProps();

  const { centerOffset, scaleFactor } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return {
      centerOffset: [-center.x, -box.min.y, -center.z],
      scaleFactor: targetHeight / Math.max(size.y, 1e-6),
    };
  }, [scene, targetHeight]);

  // Convert raw-GLB coordinates into host world space. Mirrors what
  // SceneProvider does to the host model: world = (raw - root.center) * scale.
  const anchorBase = useMemo(() => {
    const root = manifest.root.bounds.center;

    if (anchor?.node) {
      const node = manifest.getNode(anchor.node);
      if (!node) {
        if (import.meta.env.DEV) {
          console.warn(
            `[CompanionModel] anchor node '${anchor.node}' not found in manifest; ` +
              `falling back to position.`,
          );
        }
      } else {
        const { min, max, center } = node.bounds;
        const faceY =
          anchor.face === "bottom"
            ? min.y
            : anchor.face === "center"
              ? center.y
              : max.y;
        return [
          (center.x - root.x) * hostScale,
          (faceY - root.y) * hostScale,
          (center.z - root.z) * hostScale,
        ];
      }
    }

    const floorY = (manifest.root.bounds.min.y - root.y) * hostScale;
    return [0, floorY, 0];
  }, [anchor?.face, anchor?.node, manifest, hostScale]);

  const placement = useMemo(() => {
    if (anchor?.node) {
      const [ox, oy, oz] = anchor.offset ?? [0, 0, 0];
      return [anchorBase[0] + ox, anchorBase[1] + oy, anchorBase[2] + oz];
    }
    const [px, py, pz] = position;
    return [px, anchorBase[1] + py, pz];
  }, [anchor?.node, anchor?.offset, anchorBase, position]);

  const initialRotation = useMemo(
    () => new THREE.Euler(...orientation, "XYZ"),
    [orientation],
  );

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = shadows;
        obj.receiveShadow = shadows;
      }
    });
  }, [scene, shadows]);

  useEffect(() => {
    if (!materials) return;
    // GLTFLoader sanitizes node names (spaces -> '_'), so sanitize the rule
    // keys the same way to let callers use the original GLB names.
    const rules = Object.entries(materials).map(([key, params]) => [
      key.replace(/\s/g, "_"),
      params,
    ]);
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const path = [];
      for (let node = obj; node; node = node.parent) {
        if (node.name) path.unshift(node.name);
      }
      const pathStr = path.join("/");
      for (const [key, params] of rules) {
        const matches =
          key === "*" ||
          (key.endsWith("/*")
            ? path.includes(key.slice(0, -2))
            : pathStr === key || pathStr.endsWith(`/${key}`));
        if (matches) {
          obj.material = new THREE.MeshStandardMaterial(params);
          break;
        }
      }
    });
  }, [scene, materials]);

  const gl = useThree((s) => s.gl);

  // Runs after the materials effect so overrides also pick up the env map.
  const envMaterials = useRef([]);
  useEffect(() => {
    envMaterials.current = [];
    if (!envMapIntensity) return;
    const envMap = getRoomEnvMap(gl);
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.material.envMap = envMap;
      obj.material.envMapIntensity = envMapIntensity;
      obj.material.needsUpdate = true;
      envMaterials.current.push(obj.material);
    });
  }, [scene, materials, envMapIntensity, gl]);

  const envGate = useDriver(envMapEnable ?? 1);
  const envGateEased = useRef(envMapEnable == null ? 1 : 0);

  const debugSpread =
    debugLabels === true ? 0.22 : (debugLabels?.spread ?? 0.22);
  const onMeshesReady =
    debugLabels === true ? undefined : debugLabels?.onMeshesReady;
  const onLabelClick =
    debugLabels === true ? undefined : debugLabels?.onLabelClick;
  const debugEnabled = !!debugLabels;

  const meshEntries = useMemo(() => {
    if (!debugEnabled) return [];
    scene.updateMatrixWorld(true);
    const rootBox = new THREE.Box3().setFromObject(scene);
    const rootCenter = rootBox.getCenter(new THREE.Vector3());
    const out = [];
    const box = new THREE.Box3();
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const path = [];
      for (let node = obj; node; node = node.parent) {
        if (node.name) path.unshift(node.name);
      }
      const pathStr = path.join("/");
      const shortLabel = path.slice(-2).join("/");
      box.setFromObject(obj);
      const meshCenter = box.getCenter(new THREE.Vector3());
      const offsetDir = meshCenter.clone().sub(rootCenter);
      if (offsetDir.lengthSq() < 1e-6) offsetDir.set(0, 1, 0);
      else offsetDir.normalize();
      const labelPos = meshCenter
        .clone()
        .add(offsetDir.multiplyScalar(debugSpread));
      out.push({
        path: pathStr,
        shortLabel,
        mesh: obj,
        meshCenter: meshCenter.toArray(),
        labelPosition: labelPos.toArray(),
      });
    });
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }, [scene, debugEnabled, debugSpread]);

  useEffect(() => {
    if (!debugEnabled || !onMeshesReady) return;
    onMeshesReady(meshEntries.map((entry) => entry.path));
  }, [debugEnabled, onMeshesReady, meshEntries]);

  useEffect(() => {
    if (!debugEnabled) return;
    meshEntries.forEach(({ path, mesh }) => {
      const showMesh = debugVisibility?.meshes?.[path] !== false;
      mesh.visible = showMesh;
    });
  }, [debugEnabled, debugVisibility?.meshes, meshEntries]);

  const revolveRef = useRef();
  const spinRef = useRef();
  const rawRef = useDriver(rotation?.driver);
  const smoothed = useSpringDriver(rawRef, rotation?.smoothing ?? 0.04);

  useFrame((_, delta) => {
    if (revolveRef.current && rotation) {
      const axis = rotation.axis ?? "y";
      revolveRef.current.rotation[axis] = smoothed.current * Math.PI * 2;
    }
    if (spinRef.current && spinSpeed) {
      spinRef.current.rotation.y += delta * spinSpeed;
    }
    // Same easing rate as SceneLights' gate so reflections dim in lockstep
    // with the scene lighting.
    if (envMapEnable && envMaterials.current.length) {
      const target = THREE.MathUtils.clamp(envGate.current, 0, 1);
      envGateEased.current +=
        (target - envGateEased.current) * Math.min(1, delta * 6);
      const intensity = envMapIntensity * envGateEased.current;
      for (const material of envMaterials.current) {
        material.envMapIntensity = intensity;
      }
    }
  });

  const clickProps = onClick
    ? {
        onClick: (event) => {
          event.stopPropagation();
          onClick(event);
        },
        // No stopPropagation: hover must keep bubbling to ancestors (e.g. the
        // ModelViewer hover group that gates the spotlight).
        onPointerOver: () => {
          document.body.style.cursor = "pointer";
        },
        onPointerOut: () => {
          document.body.style.cursor = "";
        },
      }
    : {};

  return (
    <group ref={revolveRef}>
      <group position={placement} rotation={initialRotation} {...clickProps}>
        <group ref={spinRef} scale={scaleFactor}>
          <group position={centerOffset}>
            <primitive object={scene} {...inspectorProps} />
            {meshEntries.map((entry) => {
              const showLabel = debugVisibility?.labels?.[entry.path] !== false;
              if (!showLabel) return null;
              return (
                <group key={entry.path}>
                  <Line
                    points={[entry.meshCenter, entry.labelPosition]}
                    color="#ff6b6b"
                    lineWidth={1}
                    transparent
                    opacity={0.55}
                  />
                  <Html
                    position={entry.labelPosition}
                    center
                    zIndexRange={[10005, 10004]}
                    style={{
                      pointerEvents: onLabelClick ? "auto" : "none",
                    }}
                  >
                    <div
                      onClick={
                        onLabelClick
                          ? (e) => {
                              e.stopPropagation();
                              onLabelClick(entry.path);
                            }
                          : undefined
                      }
                      style={{
                        font: '9px ui-monospace, "SF Mono", Menlo, monospace',
                        color: "#fff",
                        background: "rgba(0,0,0,0.82)",
                        padding: "2px 5px",
                        borderRadius: 3,
                        border: "1px solid rgba(255,107,107,0.5)",
                        whiteSpace: "nowrap",
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        cursor: onLabelClick ? "pointer" : "default",
                        userSelect: "none",
                      }}
                      title={
                        onLabelClick
                          ? `${entry.path} — click to hide`
                          : entry.path
                      }
                    >
                      {entry.shortLabel}
                    </div>
                  </Html>
                </group>
              );
            })}
          </group>
        </group>
      </group>
    </group>
  );
}

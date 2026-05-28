import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useSceneMetrics } from "../core/SceneContext";
import { useInspectorProps } from "../core/InspectorContext";
import { useDriver } from "../hooks/useDriver";
import { useSpringDriver } from "../drivers/springDriver";

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
export default function CompanionModel({
  src,
  position = [0, 0, 0],
  anchor,
  targetHeight = 1.5,
  rotation,
  spinSpeed = 0,
  shadows = true,
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
  const placement = useMemo(() => {
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
        const [ox, oy, oz] = anchor.offset ?? [0, 0, 0];
        return [
          (center.x - root.x) * hostScale + ox,
          (faceY - root.y) * hostScale + oy,
          (center.z - root.z) * hostScale + oz,
        ];
      }
    }

    const floorY = (manifest.root.bounds.min.y - root.y) * hostScale;
    const [px, py, pz] = position;
    return [px, floorY + py, pz];
  }, [anchor, position, manifest, hostScale]);

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = shadows;
        obj.receiveShadow = shadows;
      }
    });
  }, [scene, shadows]);

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
  });

  return (
    <group ref={revolveRef}>
      <group position={placement}>
        <group ref={spinRef} scale={scaleFactor}>
          <group position={centerOffset}>
            <primitive object={scene} {...inspectorProps} />
          </group>
        </group>
      </group>
    </group>
  );
}

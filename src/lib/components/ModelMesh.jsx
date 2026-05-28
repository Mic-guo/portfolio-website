import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useSceneMetrics } from "../core/SceneContext";
import { useInspectorProps } from "../core/InspectorContext";
import { useDriver } from "../hooks/useDriver";
import { useSpringDriver } from "../drivers/springDriver";

export default function ModelMesh({ rotation, shadows = true }) {
  const { scene, scaleFactor, centerOffset } = useSceneMetrics();
  const groupRef = useRef();
  const inspectorProps = useInspectorProps();

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = shadows;
        obj.receiveShadow = shadows;
      }
    });
  }, [scene, shadows]);

  const rawRef = useDriver(rotation?.driver);
  const smoothed = useSpringDriver(rawRef, rotation?.smoothing ?? 0.04);

  useFrame(() => {
    if (!groupRef.current || !rotation) return;
    const axis = rotation.axis ?? "y";
    groupRef.current.rotation[axis] = smoothed.current * Math.PI * 2;
  });

  return (
    <group ref={groupRef}>
      <group scale={scaleFactor}>
        <group position={centerOffset}>
          <primitive object={scene} {...inspectorProps} />
        </group>
      </group>
    </group>
  );
}

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSceneMetrics } from "../core/SceneContext";
import { useDriver } from "../hooks/useDriver";

// Rounded-square platform slab under the host model. Must be used as a child
// of <ModelViewer> (or any <SceneProvider>).
//
// An extruded rounded-rect whose top face sits flush with the model's lowest
// point, so the desk/chair rest on it. The top catches the spotlight pool and
// the model's shadows; a soft bevel keeps the silhouette from reading as a
// hard box. Pass `driver` to fade the whole slab out as scroll approaches 1
// (pair with a lighting cross-fade that kills the spot).
//
//   size          side length in world units (default 2.5× the host sweep radius).
//   thickness     slab depth in world units.
//   cornerRadius  corner roundness as a fraction of half-size (0–1; 1 ≈ pill).
//   color         slab albedo.
//   driver        optional 0→1 ref; the platform fades out as it approaches 1.
//   yOffset       extra vertical shift in world units.
export default function ScenePlatform({
  size,
  thickness = 0.35,
  cornerRadius = 0.45,
  color = "#8c6440",
  driver,
  yOffset = 0,
}) {
  const { manifest, scaleFactor, sweepRadius } = useSceneMetrics();
  const materialRef = useRef();
  const t = useDriver(driver);

  const floorY = useMemo(() => {
    const { min, center } = manifest.root.bounds;
    return (min.y - center.y) * scaleFactor;
  }, [manifest, scaleFactor]);

  const side = size ?? sweepRadius * 2.5;
  const bevel = Math.min(thickness * 0.35, 0.12);

  const geometry = useMemo(() => {
    const half = side / 2;
    const r = THREE.MathUtils.clamp(cornerRadius, 0.05, 1) * half;
    const shape = new THREE.Shape();
    shape.moveTo(-half + r, -half);
    shape.lineTo(half - r, -half);
    shape.absarc(half - r, -half + r, r, -Math.PI / 2, 0);
    shape.lineTo(half, half - r);
    shape.absarc(half - r, half - r, r, 0, Math.PI / 2);
    shape.lineTo(-half + r, half);
    shape.absarc(-half + r, half - r, r, Math.PI / 2, Math.PI);
    shape.lineTo(-half, -half + r);
    shape.absarc(-half + r, -half + r, r, Math.PI, Math.PI * 1.5);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 32,
    });
    // Shape lives in XY, extruded along +Z; rotate so it lies flat with the
    // extrusion (and bevels) spanning y ∈ [-bevel, thickness - bevel].
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [side, thickness, cornerRadius, bevel]);

  useFrame(() => {
    if (materialRef.current && driver) {
      const opacity = 1 - THREE.MathUtils.clamp(t.current, 0, 1);
      materialRef.current.opacity = opacity;
      materialRef.current.visible = opacity > 0.005;
    }
  });

  return (
    <mesh
      geometry={geometry}
      // Top face (y = thickness - bevel in local space) flush with floorY.
      position={[0, floorY - thickness + bevel + yOffset, 0]}
      receiveShadow
      castShadow
    >
      <meshStandardMaterial
        ref={materialRef}
        color={color}
        roughness={0.85}
        metalness={0}
        transparent
      />
    </mesh>
  );
}

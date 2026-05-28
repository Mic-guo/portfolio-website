import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Cyan wireframe outline that tracks any THREE.Object3D's world-space AABB.
// Renders as a sibling of the host model — the BoxHelper internally accounts
// for all parent transforms (rotation, scale, centering, etc.), so it works
// for objects inside ModelMesh, CompanionModel, or anywhere else in the scene.
export default function NodeHighlight({ object, color = 0x00e5ff }) {
  const helper = useMemo(() => {
    if (!object) return null;
    const h = new THREE.BoxHelper(object, color);
    h.material.depthTest = false;
    h.material.transparent = true;
    h.material.opacity = 0.95;
    h.renderOrder = 999;
    return h;
  }, [object, color]);

  useEffect(() => {
    return () => {
      helper?.geometry?.dispose();
      helper?.material?.dispose();
    };
  }, [helper]);

  useFrame(() => {
    helper?.update();
  });

  if (!helper) return null;
  return <primitive object={helper} />;
}

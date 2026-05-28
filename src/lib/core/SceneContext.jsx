import { createContext, useContext, useMemo, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { extractManifest } from "./manifest";

const SceneContext = createContext(null);

export function SceneProvider({
  src,
  targetSweepRadius = 3.5,
  onManifest,
  children,
}) {
  const { scene } = useGLTF(src);

  const value = useMemo(() => {
    const manifest = extractManifest(scene);
    const { center, size } = manifest.root.bounds;
    const rawSweep = Math.sqrt(size.x ** 2 + size.z ** 2) / 2;
    const scaleFactor = targetSweepRadius / rawSweep;
    const centerOffset = [-center.x, -center.y, -center.z];
    return {
      scene,
      manifest,
      scaleFactor,
      centerOffset,
      sweepRadius: targetSweepRadius,
      worldCenter: [0, 0, 0],
    };
  }, [scene, targetSweepRadius]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      const { bounds: rootBounds } = value.manifest.root;
      const rc = rootBounds.center;
      console.group("[SceneLib] manifest");
      console.log(
        `  scaleFactor = ${value.scaleFactor.toFixed(3)}   sweepRadius = ${value.sweepRadius}`,
      );
      console.log(
        `  root         center=(${rc.x.toFixed(2)}, ${rc.y.toFixed(2)}, ${rc.z.toFixed(2)})   size=(${rootBounds.size.x.toFixed(2)}, ${rootBounds.size.y.toFixed(2)}, ${rootBounds.size.z.toFixed(2)})`,
      );
      const pad = "id".padEnd(20);
      console.log(`  ${pad}  size (W×H×D)        worldTopY  worldFloorY`);
      value.manifest.nodes.forEach((n) => {
        const b = n.bounds;
        const topW = ((b.max.y - rc.y) * value.scaleFactor).toFixed(2);
        const botW = ((b.min.y - rc.y) * value.scaleFactor).toFixed(2);
        const size = `${b.size.x.toFixed(2)}×${b.size.y.toFixed(2)}×${b.size.z.toFixed(2)}`;
        console.log(
          `  ${n.id.padEnd(20)}  ${size.padEnd(18)}  ${topW.padStart(7)}    ${botW.padStart(7)}`,
        );
      });
      console.groupEnd();
    }
    onManifest?.(value.manifest);
  }, [value.manifest, value.scaleFactor, value.sweepRadius, onManifest]);

  return (
    <SceneContext.Provider value={value}>{children}</SceneContext.Provider>
  );
}

export function useSceneMetrics() {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error("useSceneMetrics must be inside <SceneProvider>");
  return ctx;
}

export function useManifest() {
  return useContext(SceneContext)?.manifest ?? null;
}

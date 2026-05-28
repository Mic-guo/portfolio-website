import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { SceneProvider, useSceneMetrics } from "../core/SceneContext";
import { InspectorProvider } from "../core/InspectorContext";
import { findNamedAncestor } from "../core/manifest";
import ModelMesh from "./ModelMesh";
import SceneLights from "./SceneLights";
import NodeHighlight from "./NodeHighlight";
import InspectorPanel from "./InspectorPanel";
import SceneTree from "./SceneTree";

export default function ModelViewer({
  src,
  camera = {},
  lighting,
  rotation,
  shadows = true,
  onManifest,
  style,
  inspector = false,
  children,
}) {
  const position = camera.position ?? [5, 9, 11];
  const fov = camera.fov ?? 50;

  // selection = { origin, current } | null
  const [selection, setSelection] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [sceneRoot, setSceneRoot] = useState(null);

  const inspectorOn =
    inspector && (typeof window === "undefined" || !!import.meta.env.DEV);

  // Reset selection when inspector toggles off so highlight + panel disappear.
  useEffect(() => {
    if (!inspectorOn) setSelection(null);
  }, [inspectorOn]);

  // Click handler: store the raw leaf as `origin`, resolve `current` to the
  // closest named ancestor (or fall back to the leaf if there isn't one).
  const select = useCallback((origin) => {
    if (!origin) {
      setSelection(null);
      return;
    }
    const current = findNamedAncestor(origin) ?? origin;
    setSelection({ origin, current });
  }, []);

  // Breadcrumb handler: switch the active selection without losing the leaf.
  const setCurrent = useCallback((object) => {
    setSelection((prev) => (prev ? { ...prev, current: object } : null));
  }, []);

  // Tree handler: select an exact object as both origin and current, so the
  // breadcrumb chain rebuilds from that node.
  const selectExact = useCallback((object) => {
    if (!object) {
      setSelection(null);
      return;
    }
    setSelection({ origin: object, current: object });
  }, []);

  const inspectorValue = useMemo(
    () => ({ enabled: inspectorOn, selection, select, setCurrent, selectExact }),
    [inspectorOn, selection, select, setCurrent, selectExact],
  );

  // Inspector intercepts clicks and lifts the canvas above page content so
  // hits land on 3D objects instead of selecting text. The canvas is still
  // visually transparent. Wheel events bubble to the document, so page scroll
  // continues to work over the canvas.
  const canvasStyle = inspectorOn
    ? { ...style, pointerEvents: "auto", zIndex: 9998, userSelect: "none" }
    : style;

  return (
    <>
      <Canvas
        style={canvasStyle}
        gl={{ alpha: true, antialias: true }}
        shadows
        camera={{ position, fov }}
      >
        <Suspense fallback={null}>
          <SceneProvider src={src} onManifest={onManifest}>
            <InspectorProvider value={inspectorValue}>
              <ModelMesh rotation={rotation} shadows={shadows} />
              <SceneLights lighting={lighting} />
              {inspectorOn && <ManifestReporter onManifest={setManifest} />}
              {inspectorOn && <SceneRootReporter onSceneRoot={setSceneRoot} />}
              {inspectorOn && selection?.current && (
                <NodeHighlight object={selection.current} />
              )}
              {children}
            </InspectorProvider>
          </SceneProvider>
        </Suspense>
      </Canvas>
      {inspectorOn && (
        <SceneTree
          root={sceneRoot}
          selected={selection?.current ?? null}
          manifest={manifest}
          onSelect={selectExact}
        />
      )}
      {inspectorOn && (
        <InspectorPanel
          selection={selection}
          manifest={manifest}
          onClose={() => setSelection(null)}
          onSelectInChain={setCurrent}
        />
      )}
    </>
  );
}

function ManifestReporter({ onManifest }) {
  const { manifest } = useSceneMetrics();
  useEffect(() => {
    onManifest(manifest);
  }, [manifest, onManifest]);
  return null;
}

function SceneRootReporter({ onSceneRoot }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    onSceneRoot(scene);
  }, [scene, onSceneRoot]);
  return null;
}

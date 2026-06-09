import { useEffect, useRef, useState } from "react";
import { ModelViewer, CompanionModel } from "../lib";
import deskCamera from "../cameraTimelines/deskCamera.json";
import objectTransforms from "../sceneObjects/objectTransforms.json";
import totoroPlacement from "../sceneObjects/totoroPlacement.json";

export default function DeskPlayground() {
  const scrollProgressRef = useRef(0);
  const [inspectorOn, setInspectorOn] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const isTextField = (el) =>
      el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const onKey = (e) => {
      if (isTextField(e.target)) return;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setInspectorOn((v) => !v);
      } else if (e.key === "Escape" && inspectorOn) {
        setInspectorOn(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspectorOn]);

  useEffect(() => {
    const onScroll = () => {
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      const t = maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0;
      scrollProgressRef.current = t;

      // Background: #080808 → #f5f0e8
      const r = Math.round(8 + t * 237);
      const g = Math.round(8 + t * 232);
      const b = Math.round(8 + t * 224);
      document.body.style.backgroundColor = `rgb(${r},${g},${b})`;

      // Primary text: #f0f0f0 → #1a1a1a
      const tv = Math.round(240 - t * 214);
      document.documentElement.style.setProperty(
        "--c-text-color",
        `rgb(${tv},${tv},${tv})`,
      );

      // Muted text
      const mr = Math.round(107 - t * 32);
      const mg = Math.round(114 - t * 29);
      const mb = Math.round(128 - t * 29);
      document.documentElement.style.setProperty(
        "--c-muted-color",
        `rgb(${mr},${mg},${mb})`,
      );
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <ModelViewer
        src="/desk.glb"
        camera={{
          position: deskCamera.position,
          fov: deskCamera.fov,
          timelineId: deskCamera.id,
          motion: {
            ...deskCamera.motion,
            driver: scrollProgressRef,
          },
        }}
        lighting={{
          initial: {
            ambient: { color: "#0a0a1a", intensity: 0.08 },
            spot: {
              position: [-6, 14, -5],
              target: [0, 0, 0],
              color: "#c8d8ff",
              intensity: 25,
              angle: Math.PI / 5,
              penumbra: 0.6,
            },
          },
          final: {
            ambient: { color: "#fff5e0", intensity: 1.28 },
            directional: {
              position: [8, 14, 6],
              target: [0, 0, 0],
              color: "#FFD080",
              intensity: 5,
            },
          },
          driver: scrollProgressRef,
        }}
        rotation={{ axis: "y", driver: scrollProgressRef, smoothing: 0.04 }}
        objectTransforms={objectTransforms}
        inspector={inspectorOn}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: inspectorOn ? "auto" : "none",
        }}
      >
        <CompanionModel
          src="/totoro.glb"
          anchor={totoroPlacement.anchor}
          orientation={totoroPlacement.rotation}
          targetHeight={totoroPlacement.targetHeight}
          rotation={{ axis: "y", driver: scrollProgressRef, smoothing: 0.04 }}
        />
      </ModelViewer>
      <div
        aria-hidden="true"
        style={{ position: "relative", zIndex: 10, height: "400vh", pointerEvents: "none" }}
      />
      {import.meta.env.DEV && !inspectorOn && (
        <div
          style={{
            position: "fixed",
            bottom: 12,
            left: 12,
            zIndex: 9999,
            padding: "4px 8px",
            borderRadius: 4,
            background: "rgba(15,17,22,0.7)",
            color: "rgba(230,237,243,0.7)",
            font: '11px ui-monospace, "SF Mono", Menlo, monospace',
            letterSpacing: "0.05em",
            pointerEvents: "none",
            backdropFilter: "blur(4px)",
          }}
        >
          press <kbd style={{ color: "#00e5ff" }}>I</kbd> to inspect
        </div>
      )}
    </>
  );
}

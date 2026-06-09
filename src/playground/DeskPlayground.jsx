import { useEffect, useRef, useState } from "react";
import { ModelViewer, CompanionModel, ScenePlatform } from "../lib";
import CameraDecompositionScene from "../three/CameraDecompositionScene";
import deskCamera from "../cameraTimelines/deskCamera.json";
import objectTransforms from "../sceneObjects/objectTransforms.json";
import totoroPlacement from "../sceneObjects/totoroPlacement.json";

// totoro.glb (Spline export) ships with no materials at all, so every mesh
// falls back to glTF's default white metal and renders near-black. Names
// below are the *runtime* names: GLTFLoader sanitizes spaces to '_' AND
// dedupes repeats ('Sphere' → 'Sphere_1'), since the umbrella loads first
// and claims the plain names. Part mapping was validated by hand with the
// debugLabels overlay:
//   Lathe = body · Lathe_2 = arm · Torus_1..7 = hand gripping the umbrella
//   Sphere_1 = belly · Merged_Geometry = belly details (same as body)
//   Cylinder_1 / Cylinder_2_1 = legs · Pyramid / Pyramid_2 = leaves on head
//   Eye/* and Empty_Object_3/* = eyes · Empty_Object_13+14/* = nose
//   Empty_Object/* and Empty_Object_2/* = ears
// First match wins, so specific parts come before the '*' fur catch-all.
const totoroMaterials = {
  // pupils (flat discs sitting on the eyeballs), then eye whites
  Sphere_2_1: { color: "#161616", roughness: 0.35 },
  Sphere_2_2: { color: "#161616", roughness: 0.35 },
  "Eye/*": { color: "#f5f1e4", roughness: 0.45 },
  "Empty_Object_3/*": { color: "#f5f1e4", roughness: 0.45 },
  // nose (Empty_Object_14 peeks above 13)
  "Empty_Object_13/*": { color: "#3a3b34", roughness: 0.6 },
  "Empty_Object_14/*": { color: "#3a3b34", roughness: 0.6 },
  // belly
  Sphere_1: { color: "#eee2b8", roughness: 0.9 },
  // leaves resting on his head
  Pyramid: { color: "#4d7a3c", roughness: 0.85 },
  Pyramid_2: { color: "#5a8a46", roughness: 0.85 },
  // umbrella: charcoal canopy, wooden shaft / handle / hook
  "Umbrella/Sphere_2": { color: "#31353b", roughness: 0.7 },
  "Umbrella/Sphere": { color: "#3a3f46", roughness: 0.7 },
  "Umbrella/*": { color: "#6b4a2f", roughness: 0.8 },
  // everything else — body (Lathe), arm (Lathe_2), hand (Torus_1..7), legs
  // (Cylinder_1, Cylinder_2_1), belly details (Merged_Geometry), ears — fur
  "*": { color: "#838a7c", roughness: 0.95 },
};

export default function DeskPlayground() {
  const scrollProgressRef = useRef(0);
  const [inspectorOn, setInspectorOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const activateCamera = () => {
    document.body.style.cursor = "";
    window.scrollTo({ top: 0 });
    scrollProgressRef.current = 0;
    setCameraActive(true);
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const isTextField = (el) =>
      el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable);
    const onKey = (e) => {
      if (isTextField(e.target)) return;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setInspectorOn((v) => !v);
      } else if (e.key === "Escape" && inspectorOn) {
        setInspectorOn(false);
      } else if (e.key === "Escape") {
        setCameraActive(false);
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
      {cameraActive && (
        <CameraDecompositionScene
          scrollProgressRef={scrollProgressRef}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
          }}
        />
      )}
      {!cameraActive && (
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
          // Scroll-driven: starts as a cool spotlight on the desk and
          // cross-fades into a bright warm ambient as the page background
          // lightens. The spot intensity ramps to 0 while ambient lerps up.
          // The spot aims at the front-right corner of the wood top (desk
          // spans x∈[-0.75,2.44] z∈[-2.5,2.5]) rather than its center, so the
          // cone core grazes the desk and continues onto the ScenePlatform at
          // ~(3.5, -2.01, 1.2) — beyond the desk's x edge — forming a visible
          // pool beside it instead of being fully swallowed by the desk's own
          // shadow.
          lighting={{
            initial: {
              ambient: { color: "#cfd8e6", intensity: 0.4 },
              spot: {
                position: [-2.5, 10, 8.5],
                target: [2.0, 0.54, 0.8],
                color: "#dceaff",
                intensity: 85,
                angle: Math.PI / 6,
                penumbra: 0.6,
              },
            },
            final: {
              ambient: { color: "#fff3e0", intensity: 1.1 },
              directional: {
                position: [4, 8, 6],
                target: [0, 0, 0],
                color: "#fff0d8",
                intensity: 2.4,
              },
            },
            driver: scrollProgressRef,
          }}
          objectTransforms={objectTransforms}
          inspector={inspectorOn}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
          }}
        >
          {/* Rounded-square wooden slab the desk/chair rest on; catches the
            spotlight pool and shadows, and fades out with scroll alongside
            the spot. */}
          <ScenePlatform driver={scrollProgressRef} />
          <CompanionModel
            src="/totoro.glb"
            anchor={totoroPlacement.anchor}
            orientation={totoroPlacement.rotation}
            targetHeight={totoroPlacement.targetHeight}
            materials={totoroMaterials}
          />
          {/* Top-right corner of the desk beside the sticky notes (1.45, 1.62),
            yawed so the lens (+z) aims at the laptop (1.06, 0.11). Coordinates
            measured via scripts/inspect-desk-layout.mjs. */}
          <CompanionModel
            src="/models/sony-camera-4k/sony_alpha_3.glb"
            anchor={{ node: "wood", face: "top", offset: [0.94, 0, 1.8] }}
            orientation={[0, -3.8, 0]}
            targetHeight={0.42}
            envMapIntensity={0.55}
            onClick={activateCamera}
          />
        </ModelViewer>
      )}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          zIndex: 10,
          height: "400vh",
          pointerEvents: "none",
        }}
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

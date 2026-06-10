import { useCallback, useEffect, useRef, useState } from "react";
import {
  ModelViewer,
  CompanionModel,
  ScenePlatform,
  LaptopScreen,
} from "../lib";
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

// Faulty-lightbulb intro: [time (s), brightness] keyframes, linearly
// interpolated so every transition ramps instead of hard-cutting. The bulb
// strikes, holds and buzzes, sags, recovers, drops out, gasps, then slowly
// dies — the end of the cycle is the "break" (pop sound fires there). The
// cycle repeats after BULB_LOOP_DELAY_MS of darkness until the user scrolls
// or clicks; it re-arms when they scroll back to the top.
const BULB_FLICKER_PATTERN = [
  [0.0, 0],
  [1.2, 0], // dark beat before the strike
  [1.35, 1], // strike
  [3.0, 1], // holds, buzzing
  [3.5, 0.15], // sags low
  [4.0, 0.9], // recovers
  [5.6, 0.9], // holds
  [5.8, 0], // drops out
  [6.6, 0], // dark pause
  [6.75, 0.8], // last gasp
  [7.8, 0.8], // hangs on
  [8.6, 0], // slowly dies → pop
];
const BULB_FLICKER_END = 8.6;
const BULB_LOOP_DELAY_MS = 4500;

function flickerLevelAt(t) {
  const points = BULB_FLICKER_PATTERN;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [t0, v0] = points[i];
    const [t1, v1] = points[i + 1];
    if (t >= t0 && t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return points[points.length - 1][1];
}

export default function DeskPlayground() {
  const scrollProgressRef = useRef(0);
  // 0/1 hover gate for the lighting: the spotlight only shines (and the
  // ambient lifts from its dark idle level) while the pointer is over some
  // part of the desk scene (model, companions, platform). SceneLights eases
  // the transition so it fades rather than flickering on/off.
  const spotHoverRef = useRef(0);
  // Raw 0→1 channel for the intro lightbulb flicker; combined with the hover
  // gate inside SceneLights via max(), without easing, so pulses stay sharp.
  const flickerRef = useRef(0);
  // Gate for the camera's env-map reflections (image-based light ignores the
  // scene lights, so it must be dimmed explicitly). Bright when hovering OR
  // once the scroll cross-fade has brightened the scene: max(hover, scrollT).
  const envGateRef = useRef(0);
  const [hoveringModel, setHoveringModel] = useState(false);
  // Hides the "click to explore" hint once the scroll cinematic is underway —
  // the pointer doesn't move during the tween, so no pointerout ever fires.
  const [scrolledAway, setScrolledAway] = useState(false);
  const cursorBadgeRef = useRef(null);
  const scrollAnimRef = useRef(0);
  const [inspectorOn, setInspectorOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const activateCamera = () => {
    document.body.style.cursor = "";
    cancelAnimationFrame(scrollAnimRef.current);
    window.scrollTo({ top: 0 });
    scrollProgressRef.current = 0;
    spotHoverRef.current = 0;
    setHoveringModel(false);
    setCameraActive(true);
  };

  // Clicking the desk runs the scroll-driven camera/lighting animation to the
  // end via a tweened window scroll, so the existing scroll listeners drive
  // everything. Any manual wheel/touch input cancels the tween.
  const runScrollAnimation = useCallback(() => {
    cancelAnimationFrame(scrollAnimRef.current);
    const startY = window.scrollY;
    const endY = document.documentElement.scrollHeight - window.innerHeight;
    const distance = endY - startY;
    if (distance < 1) return;
    // CSS `scroll-behavior: smooth` would turn every per-frame scrollTo into
    // its own browser-driven animation (so the tween crawls and never lands);
    // force instant scrolling for the duration of the tween.
    const root = document.documentElement;
    const prevBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    const restore = () => {
      root.style.scrollBehavior = prevBehavior;
    };
    const duration = 6000;
    const startTime = performance.now();
    const cancel = () => {
      cancelAnimationFrame(scrollAnimRef.current);
      restore();
    };
    window.addEventListener("wheel", cancel, { passive: true, once: true });
    window.addEventListener("touchstart", cancel, {
      passive: true,
      once: true,
    });
    const step = (now) => {
      const x = Math.min((now - startTime) / duration, 1);
      // Cubic ease-out: launches fast, decelerates smoothly into the end.
      const ease = 1 - Math.pow(1 - x, 3);
      window.scrollTo(0, startY + distance * ease);
      if (x < 1) scrollAnimRef.current = requestAnimationFrame(step);
      else restore();
    };
    scrollAnimRef.current = requestAnimationFrame(step);
  }, []);

  // The hint badge tracks the pointer directly (no re-renders); hover state
  // only toggles its visibility.
  useEffect(() => {
    const onMove = (e) => {
      if (cursorBadgeRef.current) {
        cursorBadgeRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Intro: the spotlight flickers like a dying lightbulb, then breaks, then
  // tries again after a dark pause — looping until the user scrolls or
  // clicks. Scrolling back to the top re-arms the loop. Sound is synthesized
  // with Web Audio (mains buzz while lit, pop + glass ping at death).
  // Browsers suspend AudioContext until a user gesture, so cycles before the
  // first interaction may play silently.
  useEffect(() => {
    if (cameraActive) return;

    let raf = 0;
    let delayTimer = 0;
    let disposed = false;
    let armed = window.scrollY <= 50;
    let cycling = false;
    let ctx = null;
    let buzzOsc = null;
    let buzzGain = null;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      if (ctx.state === "suspended") ctx.resume();
      buzzOsc = ctx.createOscillator();
      buzzOsc.type = "sawtooth";
      buzzOsc.frequency.value = 110; // mains-hum-ish
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 650;
      buzzGain = ctx.createGain();
      buzzGain.gain.value = 0;
      buzzOsc.connect(lowpass);
      lowpass.connect(buzzGain);
      buzzGain.connect(ctx.destination);
      buzzOsc.start();
    } catch {
      ctx = null;
    }

    const setBuzz = (level) => {
      if (buzzGain && ctx?.state === "running") {
        buzzGain.gain.setTargetAtTime(0.045 * level, ctx.currentTime, 0.004);
      }
    };

    const playBreak = () => {
      if (!ctx || ctx.state !== "running") return;
      const t0 = ctx.currentTime;
      // Filament pop: short decaying noise burst through a bandpass.
      const len = 0.09;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 2400;
      bandpass.Q.value = 0.8;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.5, t0);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + len);
      noise.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t0);
      // Glass ping ringing out after the pop.
      const ping = ctx.createOscillator();
      ping.type = "sine";
      ping.frequency.setValueAtTime(3100, t0);
      ping.frequency.exponentialRampToValueAtTime(2300, t0 + 0.28);
      const pingGain = ctx.createGain();
      pingGain.gain.setValueAtTime(0.1, t0);
      pingGain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.32);
      ping.connect(pingGain);
      pingGain.connect(ctx.destination);
      ping.start(t0);
      ping.stop(t0 + 0.35);
    };

    const startCycle = () => {
      if (disposed || !armed || cycling) return;
      cycling = true;
      const startTime = performance.now();
      let lastBuzzLevel = 0;
      // Slow filament wobble: a new brightness target every ~150-300ms,
      // eased toward — NOT per-frame randomness, which reads as a 60fps
      // strobe and made the flicker feel frantic.
      let wobble = 1;
      let wobbleTarget = 1;
      let nextWobbleAt = 0;
      const step = (now) => {
        if (disposed) return;
        if (!armed) {
          // Interrupted mid-cycle by scroll/click: cut to darkness.
          cycling = false;
          flickerRef.current = 0;
          setBuzz(0);
          return;
        }
        const t = (now - startTime) / 1000;
        const level = flickerLevelAt(t);
        if (now >= nextWobbleAt) {
          wobbleTarget = 0.86 + Math.random() * 0.14;
          nextWobbleAt = now + 150 + Math.random() * 150;
        }
        wobble += (wobbleTarget - wobble) * 0.07;
        flickerRef.current = level * wobble;
        if (Math.abs(level - lastBuzzLevel) > 0.03) {
          lastBuzzLevel = level;
          setBuzz(level);
        }
        if (t >= BULB_FLICKER_END) {
          cycling = false;
          flickerRef.current = 0;
          setBuzz(0);
          // Schedule the next cycle BEFORE touching audio, so an audio
          // exception can never kill the loop.
          delayTimer = setTimeout(startCycle, BULB_LOOP_DELAY_MS);
          try {
            playBreak();
          } catch {
            // audio failure must not break the visual loop
          }
          return;
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const disarm = () => {
      if (!armed) return;
      armed = false;
      clearTimeout(delayTimer);
      flickerRef.current = 0;
      setBuzz(0);
    };

    const onScroll = () => {
      if (window.scrollY > 50) {
        disarm();
      } else if (!armed) {
        // Back at the top: re-arm and resume the loop after a short beat.
        armed = true;
        clearTimeout(delayTimer);
        delayTimer = setTimeout(startCycle, 900);
      }
    };

    const onPointerDown = () => {
      // A click is also the user gesture that unlocks audio for any cycles
      // that resume later.
      if (ctx?.state === "suspended") ctx.resume();
      disarm();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onPointerDown);
    startCycle();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(delayTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onPointerDown);
      flickerRef.current = 0;
      try {
        buzzOsc?.stop();
        ctx?.close();
      } catch {
        // already closed
      }
    };
  }, [cameraActive]);

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
      envGateRef.current = Math.max(spotHoverRef.current, t);
      // React bails out when the value doesn't change, so this is cheap.
      setScrolledAway(t > 0.04);

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
            // `enable` (hover) gates the initial look: idle = near-black
            // ambient with no spot; hovering fades the spot on and lifts the
            // ambient from idleIntensity to intensity. `flicker` is the raw
            // intro lightbulb channel (max'd with the hover gate, no easing).
            enable: spotHoverRef,
            flicker: flickerRef,
            initial: {
              ambient: {
                color: "#cfd8e6",
                intensity: 0.4,
                idleIntensity: 0.08,
              },
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
          onHoverChange={(hovering) => {
            spotHoverRef.current = hovering ? 1 : 0;
            envGateRef.current = Math.max(
              spotHoverRef.current,
              scrollProgressRef.current,
            );
            setHoveringModel(hovering);
          }}
          onModelClick={() => {
            if (!inspectorOn) runScrollAnimation();
          }}
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
          {/* Notion-style cartoon desktop on the laptop glass; the final
            camera shot (deskCamera shot-4) lands looking straight at it.
            Folder clicks are scaffolded — windows/content come later. */}
          <LaptopScreen
            onFolderClick={(folderId) => {
              console.log(`[laptop] folder clicked: ${folderId}`);
            }}
          />
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
            envMapEnable={envGateRef}
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
      {/* Cursor-follow hint: tells the user the desk is interactive. */}
      <style>{`@keyframes desk-cursor-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.7); opacity: 0.45; } }`}</style>
      <div
        ref={cursorBadgeRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 10002,
          pointerEvents: "none",
          opacity:
            hoveringModel && !scrolledAway && !cameraActive && !inspectorOn
              ? 1
              : 0,
          transition: "opacity 180ms ease",
          willChange: "transform",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            transform: "translate(16px, 18px)",
            padding: "5px 10px",
            borderRadius: 999,
            background: "rgba(15,17,22,0.78)",
            border: "1px solid rgba(220,234,255,0.4)",
            color: "#dceaff",
            font: '11px ui-monospace, "SF Mono", Menlo, monospace',
            letterSpacing: "0.07em",
            whiteSpace: "nowrap",
            backdropFilter: "blur(6px)",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "#dceaff",
              boxShadow: "0 0 8px rgba(220,234,255,0.9)",
              animation: "desk-cursor-pulse 1.6s ease-in-out infinite",
            }}
          />
          click to explore
        </div>
      </div>
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

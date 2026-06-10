import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  CameraControls,
  CameraControlsImpl,
  Html,
  TransformControls,
} from "@react-three/drei";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { SceneProvider, useSceneMetrics } from "../core/SceneContext";
import { InspectorProvider } from "../core/InspectorContext";
import { findNamedAncestor } from "../core/manifest";
import { useDriver } from "../hooks/useDriver";
import { useSpringDriver } from "../drivers/springDriver";
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
  objectTransforms,
  shadows = true,
  onManifest,
  onHoverChange,
  onModelClick,
  style,
  inspector = false,
  children,
}) {
  const position = camera.position ?? [5, 9, 11];
  const fov = camera.fov ?? 50;
  const timelineId = camera.timelineId ?? "camera";

  // selection = { origin, current } | null
  const [selection, setSelection] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [sceneRoot, setSceneRoot] = useState(null);
  const [generateOn, setGenerateOn] = useState(false);
  const [timeline, setTimeline] = useState(() =>
    normalizeTimelineShots(camera.motion?.shots ?? []),
  );
  const timelineRef = useRef(timeline);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(null);
  const [previewT, setPreviewT] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [zoomCommand, setZoomCommand] = useState(0);
  const [objectTransformOn, setObjectTransformOn] = useState(false);
  const currentAuthoringPose = useRef(null);

  const inspectorOn =
    inspector && (typeof window === "undefined" || !!import.meta.env.DEV);
  const generateAvailable =
    typeof window === "undefined" || (!!import.meta.env.DEV && !!camera.motion);
  const objectTransformAvailable =
    typeof window === "undefined" ||
    (!!import.meta.env.DEV && !!objectTransforms);

  const activeMotion = useMemo(
    () =>
      camera.motion
        ? {
            ...camera.motion,
            shots: timeline,
          }
        : null,
    [camera.motion, timeline],
  );

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

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
    () => ({
      enabled: inspectorOn,
      selection,
      select,
      setCurrent,
      selectExact,
    }),
    [inspectorOn, selection, select, setCurrent, selectExact],
  );

  // Inspector intercepts clicks and lifts the canvas above page content so
  // hits land on 3D objects instead of selecting text. The canvas is still
  // visually transparent. Wheel events bubble to the document, so page scroll
  // continues to work over the canvas.
  const canvasStyle =
    inspectorOn || generateOn || objectTransformOn
      ? {
          ...style,
          pointerEvents: "auto",
          zIndex: generateOn || objectTransformOn ? 9997 : 9998,
          userSelect: "none",
        }
      : style;

  const updateTimelineRef = useCallback((nextTimeline) => {
    timelineRef.current = nextTimeline;
    return nextTimeline;
  }, []);

  const loadTimeline = useCallback(async () => {
    if (!generateAvailable || !timelineId) return;
    try {
      const res = await fetch(`/__camera-timeline/${timelineId}`);
      if (!res.ok) return;
      const next = await res.json();
      const nextTimeline = normalizeTimelineShots(
        next.motion?.shots ?? next.shots ?? [],
      );
      timelineRef.current = nextTimeline;
      setTimeline(nextTimeline);
      setSaveState("loaded");
    } catch {
      setSaveState("load failed");
    }
  }, [generateAvailable, timelineId]);

  const saveTimeline = useCallback(async () => {
    if (!generateAvailable || !timelineId) return;
    setSaveState("saving");
    const payload = {
      id: timelineId,
      label: camera.label ?? `${timelineId} camera`,
      position,
      fov,
      motion: stripRuntimeMotion({
        ...(camera.motion ?? {}),
        shots: timelineRef.current,
      }),
    };
    try {
      const res = await fetch(`/__camera-timeline/${timelineId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload, null, 2),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setSaveState(error?.error ?? "save failed");
        return;
      }
      const confirm = await fetch(`/__camera-timeline/${timelineId}`).then(
        (r) => (r.ok ? r.json() : null),
      );
      const savedCount = confirm?.motion?.shots?.length;
      const savedSwings =
        confirm?.motion?.shots
          ?.map((shot, index) =>
            shot.path === "orbit"
              ? `${index}:${shot.swing ?? "shortest"}`
              : null,
          )
          .filter(Boolean)
          .join(" ") || "none";
      setSaveState(
        `saved ${typeof savedCount === "number" ? savedCount : timelineRef.current.length} to src/cameraTimelines/deskCamera.json · swings ${savedSwings} @ ${new Date().toLocaleTimeString()}`,
      );
    } catch {
      setSaveState("save failed");
    }
  }, [
    camera.label,
    camera.motion,
    fov,
    generateAvailable,
    position,
    timelineId,
  ]);

  const addKeyframe = useCallback((shot) => {
    setTimeline((shots) => {
      const keyframe = normalizeShot({
        ...shot,
        id: `shot-${Date.now()}`,
        path: "linear",
        ease: "smooth",
      });
      setSelectedKeyframeId(keyframe.id);
      setSelectedSegmentIndex(null);
      const nextTimeline = normalizeTimelineShots([...shots, keyframe]);
      timelineRef.current = nextTimeline;
      return nextTimeline;
    });
    setSaveState("unsaved");
  }, []);

  const updateKeyframe = useCallback(
    (id, patch) => {
      setTimeline((shots) =>
        updateTimelineRef(
          normalizeTimelineShots(
            shots.map((shot) =>
              shot.id === id ? normalizeShot({ ...shot, ...patch }) : shot,
            ),
          ),
        ),
      );
      setSaveState("unsaved");
    },
    [updateTimelineRef],
  );

  const updateSelectedKeyframePose = useCallback(() => {
    if (!selectedKeyframeId || !currentAuthoringPose.current) return;
    updateKeyframe(
      selectedKeyframeId,
      toAbsolutePoseShot(currentAuthoringPose.current),
    );
  }, [selectedKeyframeId, updateKeyframe]);

  const deleteKeyframe = useCallback(
    (id) => {
      setTimeline((shots) =>
        updateTimelineRef(
          normalizeTimelineShots(shots.filter((shot) => shot.id !== id)),
        ),
      );
      setSelectedKeyframeId(null);
      setSelectedSegmentIndex(null);
      setSaveState("unsaved");
    },
    [updateTimelineRef],
  );

  const updateSegment = useCallback(
    (index, patch) => {
      setTimeline((shots) =>
        updateTimelineRef(
          normalizeTimelineShots(
            shots.map((shot, i) =>
              i === index + 1 ? normalizeShot({ ...shot, ...patch }) : shot,
            ),
          ),
        ),
      );
      const from = timelineRef.current[index];
      const to = timelineRef.current[index + 1];
      if (from && to && ("swing" in patch || "path" in patch)) {
        setPreviewT((from.at + to.at) / 2);
      }
      setSaveState("unsaved");
    },
    [updateTimelineRef],
  );

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
              {activeMotion && !generateOn && (
                <ScrollCamera
                  initialPosition={position}
                  initialFov={fov}
                  motion={activeMotion}
                />
              )}
              {activeMotion && generateOn && (
                <CameraAuthoringRig
                  initialPosition={position}
                  initialFov={fov}
                  motion={activeMotion}
                  previewT={previewT}
                  zoomCommand={zoomCommand}
                  selectedKeyframeId={selectedKeyframeId}
                  onCapture={addKeyframe}
                  onPoseChange={(pose) => {
                    currentAuthoringPose.current = pose;
                  }}
                  onUpdateSelectedPose={updateSelectedKeyframePose}
                />
              )}
              {/* Hover/click handlers only attach when requested so the model
                  doesn't join the raycast set unnecessarily. Covers the host
                  model and every child (companions, platform). Companions with
                  their own onClick stopPropagation, so they win over this. */}
              <group
                onPointerOver={
                  onHoverChange ? () => onHoverChange(true) : undefined
                }
                onPointerOut={
                  onHoverChange ? () => onHoverChange(false) : undefined
                }
                onClick={onModelClick}
              >
                <ModelMesh rotation={rotation} shadows={shadows} />
                {children}
              </group>
              {objectTransformAvailable && (
                <ObjectTransformMode
                  enabled={objectTransformOn}
                  transformSet={objectTransforms}
                />
              )}
              <SceneLights lighting={lighting} />
              {inspectorOn && <ManifestReporter onManifest={setManifest} />}
              {inspectorOn && <SceneRootReporter onSceneRoot={setSceneRoot} />}
              {inspectorOn && selection?.current && (
                <NodeHighlight object={selection.current} />
              )}
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
      {generateAvailable && (
        <CameraGenerateHud
          enabled={generateOn}
          saveState={saveState}
          onToggle={() => {
            setGenerateOn((v) => !v);
            if (!generateOn) loadTimeline();
          }}
        />
      )}
      {objectTransformAvailable && (
        <ObjectTransformHud
          enabled={objectTransformOn}
          onToggle={() => setObjectTransformOn((value) => !value)}
        />
      )}
      {generateOn && (
        <CameraTimelineEditor
          shots={timeline}
          selectedKeyframeId={selectedKeyframeId}
          selectedSegmentIndex={selectedSegmentIndex}
          previewT={previewT}
          saveState={saveState}
          onSelectKeyframe={(id) => {
            const shot = timeline.find((item) => item.id === id);
            setSelectedKeyframeId(id);
            setSelectedSegmentIndex(null);
            if (shot) setPreviewT(shot.at);
          }}
          onSelectSegment={(index) => {
            const from = timeline[index];
            const to = timeline[index + 1];
            setSelectedSegmentIndex(index);
            setSelectedKeyframeId(null);
            if (from && to) setPreviewT((from.at + to.at) / 2);
          }}
          onUpdateKeyframe={updateKeyframe}
          onUpdateSelectedPose={updateSelectedKeyframePose}
          onDeleteKeyframe={deleteKeyframe}
          onUpdateSegment={updateSegment}
          onPreview={setPreviewT}
          onZoom={(direction) => setZoomCommand((value) => value + direction)}
          onSave={saveTimeline}
        />
      )}
    </>
  );
}

const DEFAULT_TARGET = [0, 0, 0];

function ScrollCamera({ initialPosition, initialFov, motion }) {
  const camera = useThree((s) => s.camera);
  const { manifest, scaleFactor } = useSceneMetrics();
  const rawRef = useDriver(motion.driver);
  const smoothed = useSpringDriver(rawRef, motion.smoothing ?? 0.055);
  const live = useRef({
    position: new THREE.Vector3(...initialPosition),
    target: new THREE.Vector3(...DEFAULT_TARGET),
    fov: initialFov,
  });

  const shots = useMemo(() => {
    const configured = motion.shots?.length ? motion.shots : [];
    return configured
      .map((shot) => ({
        ...shot,
        at: THREE.MathUtils.clamp(shot.at ?? 0, 0, 1),
      }))
      .sort((a, b) => a.at - b.at);
  }, [motion.shots]);

  useFrame(() => {
    if (!shots.length) return;

    const t = THREE.MathUtils.clamp(smoothed.current, 0, 1);
    const { from, to, localT } = getCameraSegment(shots, t);
    const ease = resolveEase(localT, to.ease);
    const fromPose = resolveShotPose(from, {
      manifest,
      scaleFactor,
      fallbackPosition: initialPosition,
      fallbackFov: initialFov,
      scrollT: t,
      rotationTurns: motion.rotationTurns ?? 1,
    });
    const toPose = resolveShotPose(to, {
      manifest,
      scaleFactor,
      fallbackPosition: initialPosition,
      fallbackFov: initialFov,
      scrollT: t,
      rotationTurns: motion.rotationTurns ?? 1,
    });

    const desired = interpolateCameraPose(
      fromPose,
      toPose,
      ease,
      to.path,
      to.swing,
    );
    const follow = motion.follow ?? 0.11;

    live.current.position.lerp(desired.position, follow);
    live.current.target.lerp(desired.target, follow);
    live.current.fov = THREE.MathUtils.lerp(
      live.current.fov,
      desired.fov,
      follow,
    );

    camera.position.copy(live.current.position);
    camera.fov = live.current.fov;
    camera.lookAt(live.current.target);
    camera.updateProjectionMatrix();
  });

  return null;
}

function CameraAuthoringRig({
  initialPosition,
  initialFov,
  motion,
  previewT,
  zoomCommand,
  selectedKeyframeId,
  onCapture,
  onPoseChange,
  onUpdateSelectedPose,
}) {
  const controlsRef = useRef(null);
  const didInit = useRef(false);
  const previousZoomCommand = useRef(zoomCommand);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const { manifest, scaleFactor } = useSceneMetrics();
  const shots = useMemo(
    () => normalizeTimelineShots(motion.shots ?? []),
    [motion.shots],
  );

  const getCurrentPose = useCallback(() => {
    const target =
      controlsRef.current?.getTarget(new THREE.Vector3()) ??
      new THREE.Vector3(...DEFAULT_TARGET);
    return {
      position: vectorToArray(camera.position),
      target: vectorToArray(target),
      fov: roundNumber(camera.fov),
    };
  }, [camera]);

  useEffect(() => {
    if (!controlsRef.current || didInit.current) return;
    didInit.current = true;
    const first = shots[0];
    const pose = first
      ? resolveShotPose(first, {
          manifest,
          scaleFactor,
          fallbackPosition: initialPosition,
          fallbackFov: initialFov,
          scrollT: first.at,
          rotationTurns: motion.rotationTurns ?? 1,
        })
      : {
          position: new THREE.Vector3(...initialPosition),
          target: new THREE.Vector3(...DEFAULT_TARGET),
          fov: initialFov,
        };
    camera.position.copy(pose.position);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    controlsRef.current.setLookAt(
      pose.position.x,
      pose.position.y,
      pose.position.z,
      pose.target.x,
      pose.target.y,
      pose.target.z,
      false,
    );
  }, [
    camera,
    initialFov,
    initialPosition,
    manifest,
    motion.rotationTurns,
    scaleFactor,
    shots,
  ]);

  useEffect(() => {
    const onKey = (event) => {
      const t = event.target;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (event.key !== "k" && event.key !== "K") return;
      event.preventDefault();
      if (event.shiftKey && selectedKeyframeId) {
        onUpdateSelectedPose();
        return;
      }
      onCapture({
        ...getCurrentPose(),
        at: THREE.MathUtils.clamp(
          previewT ?? motion.driver?.current ?? 0,
          0,
          1,
        ),
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    getCurrentPose,
    motion.driver,
    onCapture,
    onUpdateSelectedPose,
    previewT,
    selectedKeyframeId,
  ]);

  useFrame(() => {
    onPoseChange(getCurrentPose());
  });

  useEffect(() => {
    if (previewT == null || !shots.length || !controlsRef.current) return;
    const pose = getInterpolatedPose(shots, previewT, {
      manifest,
      scaleFactor,
      fallbackPosition: initialPosition,
      fallbackFov: initialFov,
      rotationTurns: motion.rotationTurns ?? 1,
    });
    camera.position.copy(pose.position);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    controlsRef.current.setLookAt(
      pose.position.x,
      pose.position.y,
      pose.position.z,
      pose.target.x,
      pose.target.y,
      pose.target.z,
      false,
    );
  }, [
    camera,
    initialFov,
    initialPosition,
    manifest,
    motion.rotationTurns,
    previewT,
    scaleFactor,
    shots,
  ]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const action = CameraControlsImpl.ACTION;
    controls.mouseButtons.left = action.ROTATE;
    controls.mouseButtons.middle = action.ROTATE;
    controls.mouseButtons.right = action.TRUCK;
    controls.mouseButtons.wheel = action.NONE;
    controls.touches.one = action.TOUCH_ROTATE;
    controls.touches.two = action.TOUCH_DOLLY_TRUCK;
    controls.touches.three = action.TOUCH_TRUCK;
  }, []);

  useEffect(() => {
    const element = gl.domElement;
    const onWheel = (event) => {
      const controls = controlsRef.current;
      if (!controls) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const unit = event.deltaMode === 1 ? 14 : event.deltaMode === 2 ? 120 : 1;
      const deltaX = event.deltaX * unit;
      const deltaY = event.deltaY * unit;

      if (event.metaKey || event.ctrlKey) {
        const scale = 0.004;
        controls.truck(deltaX * scale, -deltaY * scale, true);
      } else if (event.shiftKey) {
        controls.truck(deltaY * 0.004, 0, true);
      } else {
        controls.dolly(-deltaY * 0.01, true);
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [gl]);

  useEffect(() => {
    const delta = zoomCommand - previousZoomCommand.current;
    previousZoomCommand.current = zoomCommand;
    if (!delta || !controlsRef.current) return;
    controlsRef.current.dolly(delta * 0.8, true);
  }, [zoomCommand]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      dollySpeed={0.7}
      truckSpeed={1.8}
      azimuthRotateSpeed={0.7}
      polarRotateSpeed={0.7}
      dollyToCursor
      minDistance={0.25}
      maxDistance={40}
    />
  );
}

function getInterpolatedPose(
  shots,
  t,
  { manifest, scaleFactor, fallbackPosition, fallbackFov, rotationTurns },
) {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1);
  const { from, to, localT } = getCameraSegment(shots, clampedT);
  const ease = resolveEase(localT, to.ease);
  const fromPose = resolveShotPose(from, {
    manifest,
    scaleFactor,
    fallbackPosition,
    fallbackFov,
    scrollT: clampedT,
    rotationTurns,
  });
  const toPose = resolveShotPose(to, {
    manifest,
    scaleFactor,
    fallbackPosition,
    fallbackFov,
    scrollT: clampedT,
    rotationTurns,
  });
  return interpolateCameraPose(fromPose, toPose, ease, to.path, to.swing);
}

function getCameraSegment(shots, t) {
  if (t <= shots[0].at) return { from: shots[0], to: shots[0], localT: 0 };
  const last = shots[shots.length - 1];
  if (t >= last.at) return { from: last, to: last, localT: 1 };

  for (let i = 0; i < shots.length - 1; i += 1) {
    const from = shots[i];
    const to = shots[i + 1];
    if (t >= from.at && t <= to.at) {
      const span = Math.max(to.at - from.at, 1e-6);
      return { from, to, localT: (t - from.at) / span };
    }
  }

  return { from: last, to: last, localT: 1 };
}

function resolveShotPose(
  shot,
  {
    manifest,
    scaleFactor,
    fallbackPosition,
    fallbackFov,
    scrollT,
    rotationTurns,
  },
) {
  const target = resolveShotTarget(shot, manifest, scaleFactor);
  const lookAtTarget = shot.lookAtOffset
    ? resolveShotTarget(
        { ...shot, targetOffset: shot.lookAtOffset },
        manifest,
        scaleFactor,
      )
    : target.clone();
  const rotateWithModel = shot.rotateWithModel ?? false;
  const angle = rotateWithModel ? scrollT * Math.PI * 2 * rotationTurns : 0;
  target.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  lookAtTarget.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);

  const position = shot.cameraOffset
    ? target.clone().add(rotateVector(shot.cameraOffset, angle))
    : new THREE.Vector3(...(shot.position ?? fallbackPosition));

  if (!shot.cameraOffset && rotateWithModel) {
    position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  }

  return {
    position,
    target: lookAtTarget,
    fov: shot.fov ?? fallbackFov,
  };
}

function resolveShotTarget(shot, manifest, scaleFactor) {
  if (shot.target) return new THREE.Vector3(...shot.target);
  if (!shot.node) return new THREE.Vector3(...DEFAULT_TARGET);

  const node = manifest.getNode(shot.node);
  if (!node) return new THREE.Vector3(...DEFAULT_TARGET);

  const root = manifest.root.bounds.center;
  const { min, max, center } = node.bounds;
  const y =
    shot.face === "bottom" ? min.y : shot.face === "top" ? max.y : center.y;
  const offset = shot.targetOffset ?? [0, 0, 0];

  return new THREE.Vector3(
    (center.x - root.x) * scaleFactor + offset[0],
    (y - root.y) * scaleFactor + offset[1],
    (center.z - root.z) * scaleFactor + offset[2],
  );
}

function rotateVector(value, angle) {
  return new THREE.Vector3(...value).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    angle,
  );
}

function resolveEase(t, ease = "smooth") {
  if (ease === "linear") return THREE.MathUtils.clamp(t, 0, 1);
  if (ease === "easeInOut") return easeInOutCubic(t);
  return smootherStep(t);
}

function interpolateCameraPose(
  fromPose,
  toPose,
  t,
  path = "linear",
  swing = "shortest",
) {
  const target = fromPose.target.clone().lerp(toPose.target, t);
  const fov = THREE.MathUtils.lerp(fromPose.fov, toPose.fov, t);

  if (path !== "orbit") {
    return {
      position: fromPose.position.clone().lerp(toPose.position, t),
      target,
      fov,
    };
  }

  const fromOffset = fromPose.position.clone().sub(fromPose.target);
  const toOffset = toPose.position.clone().sub(toPose.target);
  const fromSpherical = new THREE.Spherical().setFromVector3(fromOffset);
  const toSpherical = new THREE.Spherical().setFromVector3(toOffset);
  const thetaDelta = resolveSwingDelta(
    fromSpherical.theta,
    toSpherical.theta,
    swing,
  );
  const spherical = new THREE.Spherical(
    THREE.MathUtils.lerp(fromSpherical.radius, toSpherical.radius, t),
    THREE.MathUtils.lerp(fromSpherical.phi, toSpherical.phi, t),
    fromSpherical.theta + thetaDelta * t,
  );

  return {
    position: target
      .clone()
      .add(new THREE.Vector3().setFromSpherical(spherical)),
    target,
    fov,
  };
}

function shortestAngleDelta(from, to) {
  return (
    ((((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  );
}

function resolveSwingDelta(from, to, swing) {
  const shortest = shortestAngleDelta(from, to);
  // Screen-intuitive naming: when looking through the camera, "right" should
  // arc the camera around the subject toward screen-right. In Three spherical
  // coordinates that is the negative theta direction.
  if (swing === "right")
    return shortest > 0 ? shortest - Math.PI * 2 : shortest;
  if (swing === "left") return shortest < 0 ? shortest + Math.PI * 2 : shortest;
  if (swing === "long") {
    if (Math.abs(shortest) < 1e-6) return Math.PI * 2;
    return shortest > 0 ? shortest - Math.PI * 2 : shortest + Math.PI * 2;
  }
  return shortest;
}

function smootherStep(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function easeInOutCubic(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function normalizeTimelineShots(shots) {
  return [...shots]
    .map((shot, index) =>
      normalizeShot({ id: shot.id ?? `shot-${index}`, ...shot }),
    )
    .sort((a, b) => a.at - b.at);
}

function normalizeShot(shot) {
  return {
    ...shot,
    at: roundNumber(THREE.MathUtils.clamp(Number(shot.at) || 0, 0, 1)),
    fov: roundNumber(THREE.MathUtils.clamp(Number(shot.fov) || 50, 10, 100)),
    path: shot.path === "orbit" ? "orbit" : "linear",
    swing:
      shot.swing === "left" || shot.swing === "right" || shot.swing === "long"
        ? shot.swing
        : "shortest",
    ease:
      shot.ease === "linear" ||
      shot.ease === "easeInOut" ||
      shot.ease === "smooth"
        ? shot.ease
        : "smooth",
  };
}

function toAbsolutePoseShot(pose) {
  return {
    node: undefined,
    face: undefined,
    targetOffset: undefined,
    lookAtOffset: undefined,
    cameraOffset: undefined,
    rotateWithModel: undefined,
    position: pose.position,
    target: pose.target,
    fov: pose.fov,
  };
}

function stripRuntimeMotion(motion) {
  const { driver, ...serializable } = motion;
  return serializable;
}

function vectorToArray(vector) {
  return [roundNumber(vector.x), roundNumber(vector.y), roundNumber(vector.z)];
}

function roundNumber(value) {
  return Number(value.toFixed(4));
}

function CameraGenerateHud({ enabled, saveState, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: "fixed",
        right: 12,
        bottom: enabled ? 176 : 12,
        zIndex: 10000,
        border: "1px solid rgba(0,229,255,0.45)",
        background: enabled ? "rgba(0,229,255,0.16)" : "rgba(15,17,22,0.76)",
        color: enabled ? "#00e5ff" : "rgba(230,237,243,0.84)",
        borderRadius: 6,
        padding: "7px 10px",
        cursor: "pointer",
        font: '11px ui-monospace, "SF Mono", Menlo, monospace',
        backdropFilter: "blur(8px)",
      }}
      title="Toggle camera generate mode"
    >
      {enabled ? "exit generate" : "camera generate"}{" "}
      {saveState !== "idle" ? `· ${saveState}` : ""}
    </button>
  );
}

function ObjectTransformHud({ enabled, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: "fixed",
        right: 12,
        bottom: enabled ? 166 : 52,
        zIndex: 10000,
        border: "1px solid rgba(126,231,135,0.45)",
        background: enabled ? "rgba(126,231,135,0.16)" : "rgba(15,17,22,0.76)",
        color: enabled ? "#7ee787" : "rgba(230,237,243,0.84)",
        borderRadius: 6,
        padding: "7px 10px",
        cursor: "pointer",
        font: '11px ui-monospace, "SF Mono", Menlo, monospace',
        backdropFilter: "blur(8px)",
      }}
      title="Toggle object transform mode"
    >
      {enabled ? "exit object transform" : "object transform"}
    </button>
  );
}

function ObjectTransformMode({ enabled, transformSet }) {
  const { manifest } = useSceneMetrics();
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState("translate");
  const [transforms, setTransforms] = useState(
    () => transformSet?.objects ?? {},
  );
  const transformsRef = useRef(transforms);
  const initialRef = useRef(new Map());
  const [saveState, setSaveState] = useState("idle");

  const nodes = useMemo(
    () =>
      manifest.nodes
        .filter((node) => node.ref && node.id !== "desk")
        .sort((a, b) => a.id.localeCompare(b.id)),
    [manifest],
  );

  useEffect(() => {
    transformsRef.current = transforms;
  }, [transforms]);

  useEffect(() => {
    if (!selectedId && nodes.length) setSelectedId(nodes[0].id);
  }, [nodes, selectedId]);

  useEffect(() => {
    for (const node of nodes) {
      const object = node.ref;
      if (!initialRef.current.has(node.id)) {
        initialRef.current.set(node.id, serializeObjectTransform(object));
      }
      const saved = transformsRef.current[node.id];
      if (saved) applyObjectTransform(object, saved);
    }
  }, [nodes]);

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedObject = selectedNode?.ref ?? null;

  const captureSelected = useCallback(() => {
    if (!selectedObject || !selectedNode) return;
    const next = {
      ...transformsRef.current,
      [selectedNode.id]: serializeObjectTransform(selectedObject),
    };
    transformsRef.current = next;
    setTransforms(next);
    setSaveState("unsaved");
  }, [selectedNode, selectedObject]);

  const resetSelected = useCallback(() => {
    if (!selectedObject || !selectedNode) return;
    const initial = initialRef.current.get(selectedNode.id);
    if (!initial) return;
    applyObjectTransform(selectedObject, initial);
    const next = { ...transformsRef.current };
    delete next[selectedNode.id];
    transformsRef.current = next;
    setTransforms(next);
    setSaveState("unsaved");
  }, [selectedNode, selectedObject]);

  const saveTransforms = useCallback(async () => {
    if (!transformSet?.id) return;
    setSaveState("saving");
    const payload = {
      id: transformSet.id,
      objects: transformsRef.current,
    };
    try {
      const res = await fetch(`/__object-transforms/${transformSet.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload, null, 2),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        setSaveState(error?.error ?? "save failed");
        return;
      }
      setSaveState(`saved @ ${new Date().toLocaleTimeString()}`);
    } catch {
      setSaveState("save failed");
    }
  }, [transformSet?.id]);

  if (!enabled) return null;

  return (
    <>
      {selectedObject && (
        <TransformControls
          object={selectedObject}
          mode={mode}
          space={mode === "rotate" ? "local" : "world"}
          size={0.78}
          onObjectChange={captureSelected}
        />
      )}
      <Html fullscreen>
        <div style={OBJECT_PANEL}>
          <div style={OBJECT_TITLE}>Object Transform</div>
          <label style={OBJECT_FIELD}>
            <span>object</span>
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setSaveState("idle");
              }}
            >
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.id}
                </option>
              ))}
            </select>
          </label>
          <div style={OBJECT_ROW}>
            <button
              type="button"
              style={objectModeButtonStyle(mode === "translate")}
              onClick={() => setMode("translate")}
            >
              move
            </button>
            <button
              type="button"
              style={objectModeButtonStyle(mode === "rotate")}
              onClick={() => setMode("rotate")}
            >
              rotate
            </button>
            <button type="button" style={OBJECT_BUTTON} onClick={resetSelected}>
              reset
            </button>
            <button
              type="button"
              style={OBJECT_BUTTON}
              onClick={saveTransforms}
            >
              save
            </button>
          </div>
          <div style={OBJECT_HINT}>
            Pick any manifest object, then drag X/Y/Z arrows or rotation rings.
          </div>
          <div style={OBJECT_STATUS}>{saveState}</div>
        </div>
      </Html>
    </>
  );
}

function serializeObjectTransform(object) {
  return {
    position: vectorToArray(object.position),
    rotation: vectorToArray(object.rotation),
    scale: vectorToArray(object.scale),
  };
}

function applyObjectTransform(object, transform) {
  if (Array.isArray(transform.position))
    object.position.fromArray(transform.position);
  if (Array.isArray(transform.rotation))
    object.rotation.set(...transform.rotation);
  if (Array.isArray(transform.scale)) object.scale.fromArray(transform.scale);
  object.updateMatrixWorld(true);
}

function CameraTimelineEditor({
  shots,
  selectedKeyframeId,
  selectedSegmentIndex,
  previewT,
  saveState,
  onSelectKeyframe,
  onSelectSegment,
  onUpdateKeyframe,
  onUpdateSelectedPose,
  onDeleteKeyframe,
  onUpdateSegment,
  onPreview,
  onZoom,
  onSave,
}) {
  const trackRef = useRef(null);
  const selectedShot =
    shots.find((shot) => shot.id === selectedKeyframeId) ?? null;
  const selectedShotIndex = selectedShot ? shots.indexOf(selectedShot) : -1;
  const selectedSegmentFrom =
    selectedSegmentIndex != null ? shots[selectedSegmentIndex] : null;
  const selectedSegmentShot =
    selectedSegmentIndex != null ? shots[selectedSegmentIndex + 1] : null;

  const positionToT = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return THREE.MathUtils.clamp((clientX - rect.left) / rect.width, 0, 1);
  }, []);

  const startDragKeyframe = (event, shot) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectKeyframe(shot.id);
    const move = (moveEvent) => {
      onUpdateKeyframe(shot.id, { at: positionToT(moveEvent.clientX) });
      onPreview(positionToT(moveEvent.clientX));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startScrub = (event) => {
    const scrub = (clientX) => onPreview(positionToT(clientX));
    scrub(event.clientX);
    const move = (moveEvent) => scrub(moveEvent.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div style={TIMELINE_PANEL}>
      <div style={TIMELINE_HEADER}>
        <div>
          <div style={TIMELINE_TITLE}>Camera Timeline</div>
          <div style={TIMELINE_HINT}>
            Press K to add. Select a diamond and press Shift+K to update it.
          </div>
        </div>
        <CameraControlLegend />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={TIMELINE_STATUS}>{saveState}</span>
          <button type="button" style={TIMELINE_BUTTON} onClick={onSave}>
            save JSON
          </button>
        </div>
      </div>

      <div ref={trackRef} style={TRACK} onPointerDown={startScrub}>
        {shots.slice(0, -1).map((shot, index) => {
          const next = shots[index + 1];
          const left = `${shot.at * 100}%`;
          const width = `${Math.max((next.at - shot.at) * 100, 0)}%`;
          return (
            <div
              key={`${shot.id}-${next.id}`}
              style={{ ...SEGMENT, left, width }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectSegment(index);
              }}
            >
              <button
                type="button"
                aria-label={`segment ${index + 1}`}
                title={`edit motion ${index + 1} -> ${index + 2}`}
                style={{
                  ...SEGMENT_NODE,
                  background:
                    selectedSegmentIndex === index
                      ? "#00e5ff"
                      : "rgba(230,237,243,0.75)",
                }}
              />
            </div>
          );
        })}
        {shots.map((shot) => (
          <button
            type="button"
            key={shot.id}
            aria-label={`keyframe ${shot.id}`}
            onPointerDown={(event) => startDragKeyframe(event, shot)}
            style={{
              ...KEYFRAME,
              left: `${shot.at * 100}%`,
              background:
                selectedKeyframeId === shot.id
                  ? "#00e5ff"
                  : "rgba(15,17,22,0.94)",
              borderColor:
                selectedKeyframeId === shot.id ? "#00e5ff" : "#7ee787",
            }}
            title={`edit keyframe ${shots.indexOf(shot) + 1} · ${shot.at.toFixed(2)} · fov ${shot.fov}`}
          />
        ))}
        {previewT != null && (
          <div
            style={{ ...SCRUBBER, left: `${previewT * 100}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      <div style={EDITOR_ROW}>
        <div style={ZOOM_GROUP} aria-label="camera zoom">
          <button
            type="button"
            style={ICON_BUTTON}
            onClick={() => onZoom(1)}
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            style={ICON_BUTTON}
            onClick={() => onZoom(-1)}
            title="Zoom out"
          >
            -
          </button>
        </div>
        <label style={FIELD}>
          <span>preview</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={previewT ?? 0}
            onChange={(event) => onPreview(Number(event.target.value))}
          />
        </label>

        {selectedShot && (
          <>
            <div style={SELECTION_BADGE}>
              editing keyframe {selectedShotIndex + 1} at{" "}
              {selectedShot.at.toFixed(3)}
            </div>
            <NumberField
              label="at"
              min={0}
              max={1}
              step={0.001}
              value={selectedShot.at}
              onChange={(value) =>
                onUpdateKeyframe(selectedShot.id, { at: value })
              }
            />
            <NumberField
              label="fov"
              min={10}
              max={100}
              step={1}
              value={selectedShot.fov}
              onChange={(value) =>
                onUpdateKeyframe(selectedShot.id, { fov: value })
              }
            />
            <button
              type="button"
              style={TIMELINE_BUTTON}
              onClick={onUpdateSelectedPose}
              title="Replace the selected keyframe with the current camera pose"
            >
              update pose
            </button>
            <button
              type="button"
              style={TIMELINE_BUTTON}
              onClick={() => onDeleteKeyframe(selectedShot.id)}
            >
              delete keyframe
            </button>
          </>
        )}

        {selectedSegmentFrom && selectedSegmentShot && (
          <>
            <div style={SELECTION_BADGE}>
              editing motion {selectedSegmentIndex + 1} to{" "}
              {selectedSegmentIndex + 2}
            </div>
            <label style={FIELD}>
              <span>path</span>
              <select
                value={selectedSegmentShot.path}
                onChange={(event) =>
                  onUpdateSegment(selectedSegmentIndex, {
                    path: event.target.value,
                  })
                }
              >
                <option value="linear">linear</option>
                <option value="orbit">orbit</option>
              </select>
            </label>
            {selectedSegmentShot.path === "orbit" && (
              <label style={FIELD}>
                <span>arc</span>
                <select
                  value={selectedSegmentShot.swing}
                  onChange={(event) =>
                    onUpdateSegment(selectedSegmentIndex, {
                      swing: event.target.value,
                    })
                  }
                >
                  <option value="shortest">auto shortest arc</option>
                  <option value="right">arc camera right</option>
                  <option value="left">arc camera left</option>
                  <option value="long">long arc</option>
                </select>
              </label>
            )}
            <label style={FIELD}>
              <span>ease</span>
              <select
                value={selectedSegmentShot.ease}
                onChange={(event) =>
                  onUpdateSegment(selectedSegmentIndex, {
                    ease: event.target.value,
                  })
                }
              >
                <option value="smooth">smooth</option>
                <option value="linear">linear</option>
                <option value="easeInOut">easeInOut</option>
              </select>
            </label>
          </>
        )}

        {!selectedShot && !selectedSegmentShot && (
          <div style={SELECTION_BADGE}>
            click a diamond to edit a keyframe, or a dot to edit motion
          </div>
        )}
      </div>
    </div>
  );
}

function NumberField({ label, min, max, step, value, onChange }) {
  return (
    <label style={FIELD}>
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function CameraControlLegend() {
  return (
    <div style={LEGEND} aria-label="camera controls">
      <LegendItem keys={["wheel"]} label="orbit" />
      <LegendItem keys={["L / M drag"]} label="orbit" />
      <LegendItem keys={["R drag"]} label="pan" />
      <LegendItem keys={["+", "-"]} label="zoom" />
    </div>
  );
}

function LegendItem({ keys, label }) {
  return (
    <div style={LEGEND_ITEM}>
      {keys.map((key) => (
        <span key={key} style={KEYCAP}>
          {key}
        </span>
      ))}
      <span>{label}</span>
    </div>
  );
}

const TIMELINE_PANEL = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 9999,
  minHeight: 156,
  padding: "12px 18px 14px",
  background: "rgba(10, 12, 16, 0.94)",
  color: "#e6edf3",
  borderTop: "1px solid rgba(0,229,255,0.38)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.38)",
  backdropFilter: "blur(10px)",
  font: '12px/1.35 ui-monospace, "SF Mono", Menlo, monospace',
};

const TIMELINE_HEADER = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  marginBottom: 12,
};

const TIMELINE_TITLE = {
  color: "#00e5ff",
  fontSize: 12,
  textTransform: "uppercase",
};

const TIMELINE_HINT = {
  color: "#8b949e",
  fontSize: 11,
  marginTop: 2,
};

const TIMELINE_STATUS = {
  color: "#8b949e",
  minWidth: 72,
  textAlign: "right",
};

const TIMELINE_BUTTON = {
  border: "1px solid rgba(230,237,243,0.28)",
  background: "rgba(230,237,243,0.06)",
  color: "#e6edf3",
  borderRadius: 5,
  padding: "5px 9px",
  cursor: "pointer",
  font: "inherit",
};

const ZOOM_GROUP = {
  display: "flex",
  gap: 5,
};

const LEGEND = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  flexWrap: "wrap",
  color: "#8b949e",
  fontSize: 10,
};

const LEGEND_ITEM = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  whiteSpace: "nowrap",
};

const KEYCAP = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 18,
  padding: "1px 5px",
  borderRadius: 4,
  border: "1px solid rgba(230,237,243,0.24)",
  background: "rgba(230,237,243,0.08)",
  color: "#e6edf3",
};

const ICON_BUTTON = {
  width: 27,
  height: 27,
  border: "1px solid rgba(230,237,243,0.28)",
  background: "rgba(230,237,243,0.06)",
  color: "#e6edf3",
  borderRadius: 5,
  cursor: "pointer",
  font: '15px/1 ui-monospace, "SF Mono", Menlo, monospace',
};

const TRACK = {
  position: "relative",
  height: 38,
  margin: "4px 8px 12px",
  borderRadius: 6,
  background: "rgba(230,237,243,0.08)",
  border: "1px solid rgba(230,237,243,0.16)",
  cursor: "crosshair",
};

const SEGMENT = {
  position: "absolute",
  top: 17,
  height: 4,
  background: "rgba(0,229,255,0.28)",
  transform: "translateY(-50%)",
};

const SEGMENT_NODE = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 15,
  height: 15,
  borderRadius: 999,
  border: "2px solid rgba(10,12,16,0.92)",
  transform: "translate(-50%, -50%)",
  cursor: "pointer",
};

const KEYFRAME = {
  position: "absolute",
  top: 19,
  width: 15,
  height: 15,
  border: "2px solid",
  transform: "translate(-50%, -50%) rotate(45deg)",
  cursor: "grab",
};

const SCRUBBER = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 2,
  background: "#ffd166",
  transform: "translateX(-1px)",
  pointerEvents: "none",
};

const EDITOR_ROW = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const SELECTION_BADGE = {
  color: "#00e5ff",
  border: "1px solid rgba(0,229,255,0.35)",
  background: "rgba(0,229,255,0.09)",
  borderRadius: 5,
  padding: "5px 8px",
  whiteSpace: "nowrap",
};

const FIELD = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "#8b949e",
};

const OBJECT_PANEL = {
  position: "fixed",
  left: 12,
  top: 12,
  zIndex: 10001,
  width: 310,
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(10,12,16,0.92)",
  border: "1px solid rgba(126,231,135,0.42)",
  color: "#e6edf3",
  font: '11px/1.35 ui-monospace, "SF Mono", Menlo, monospace',
  pointerEvents: "auto",
  backdropFilter: "blur(10px)",
};

const OBJECT_TITLE = {
  color: "#7ee787",
  textTransform: "uppercase",
  marginBottom: 8,
};

const OBJECT_ROW = {
  display: "flex",
  gap: 6,
  marginTop: 8,
  marginBottom: 7,
};

const OBJECT_FIELD = {
  display: "grid",
  gap: 4,
  color: "#8b949e",
};

const OBJECT_BUTTON = {
  border: "1px solid rgba(230,237,243,0.28)",
  background: "rgba(230,237,243,0.06)",
  color: "#e6edf3",
  borderRadius: 5,
  padding: "5px 8px",
  cursor: "pointer",
  font: "inherit",
};

function objectModeButtonStyle(active) {
  return {
    ...OBJECT_BUTTON,
    background: active ? "rgba(126,231,135,0.18)" : OBJECT_BUTTON.background,
    color: active ? "#7ee787" : OBJECT_BUTTON.color,
    border: active ? "1px solid rgba(126,231,135,0.56)" : OBJECT_BUTTON.border,
  };
}

const OBJECT_HINT = {
  color: "#8b949e",
};

const OBJECT_STATUS = {
  minHeight: 15,
  marginTop: 6,
  color: "#7ee787",
};

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

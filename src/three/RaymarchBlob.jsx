import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  raymarchVertexShader,
  raymarchFragmentShader,
} from "./raymarchShaders";
import { makeTextSDF } from "./textSDF";

export function createRaymarchUniforms() {
  // Build the "start" label texture up front so it is part of the uniforms from
  // the first frame — no placeholder, no post-mount swap, no chance of binding a
  // different uniforms object than the one the material renders with.
  const label = makeTextSDF("start", { worldHalfWidth: 0.62 });

  return {
    uTime: { value: 0 },
    uSpeed: { value: 0.2 },
    uEdgePhase: { value: 0 },
    uFrequency: { value: 1.2 },
    uAmplitude: { value: 0.44 },
    uRoughness: { value: 0.56 },

    uFresnelPower: { value: 2.6 },
    uRimStrength: { value: 0.8 },
    uBaseColor: { value: new THREE.Color("#060e0c") },
    uRimColor: { value: new THREE.Color("#a6cabb") },
    uLightDir: { value: new THREE.Vector3(0.3, 0.9, 0.5) },
    uBg: { value: new THREE.Color("#040506") },

    uHover: { value: 0 },
    uBulge: { value: 0.09 },
    uMouse: { value: new THREE.Vector3(0, 0, 1) },
    // Near-spherical, only gently flattened — round and inflated rather than a
    // wide flat UFO disc.
    uScale: { value: new THREE.Vector3(1.2, 1.14, 1.18) },
    uMergeK: { value: 0.45 },
    uBelt: { value: 0.04 },

    uModelRotInv: { value: new THREE.Matrix3() },
    uTranslate: { value: new THREE.Vector3() },
    uLeadOffset: { value: new THREE.Vector3() },

    uTextSDF: { value: label.texture },
    uTextHalf: { value: label.half.clone() },
    uTextThickness: { value: 0.12 },
    uHasText: { value: 1 },
    uLabelColor: { value: new THREE.Color("#eef3ef") },
    uLabelStrength: { value: 1.0 },
    uPlateFollow: { value: 1.0 },
    uSlabWidth: { value: 2.0 },
    uSlabHeight: { value: 1.2 },
    uSlabTranslucency: { value: 0.7 },
    uProtrude: { value: 0.38 },
    uEdgeAmount: { value: 0.55 },
    uEdgeAsym: { value: 1.6 },
    uPress: { value: 0 },
    // 0 = label hidden until hover (the plate grow alone reveals it). Raise it
    // only if you want a faint resting "start" before hover.
    uRestReveal: { value: 0 },
    // JS-side only (read in useFrame): how fast the edge phase advances per unit of
    // cursor travel — i.e. how much the edge morphs as the user moves.
    uEdgeRate: { value: 1.2 },

    uCamPos: { value: new THREE.Vector3() },
    uProjInv: { value: new THREE.Matrix4() },
    uViewInv: { value: new THREE.Matrix4() },
  };
}

const FORWARD = new THREE.Vector3(0, 0, 1);

// djb2 hash so the shaderMaterial's `key` changes whenever the shader SOURCE
// changes (not just its length). R3F/ShaderMaterial does not recompile the GPU
// program on HMR by itself; a length-only key let same-length edits keep a
// stale (sometimes broken -> black screen) program. Hashing the content forces
// a clean recompile on every real edit.
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

const SHADER_KEY =
  hashStr(raymarchVertexShader) + ":" + hashStr(raymarchFragmentShader);

export default function RaymarchBlob({
  uniforms,
  sway = 0.12,
  active = false,
  onHover,
  onActivate,
}) {
  const u = useMemo(() => uniforms ?? createRaymarchUniforms(), [uniforms]);
  const proxyRef = useRef();

  // Persistent physics state (kept in refs so it survives re-renders).
  const phys = useRef({
    cursorDir: new THREE.Vector3(0, 0, 1), // world direction toward the cursor
    mouseDir: new THREE.Vector3(0, 0, 1), // eased cursor dir (swell settles/lags)
    lastCursor: new THREE.Vector3(0, 0, 1), // previous-frame cursor dir
    edgePhase: 0, // advances ONLY while the cursor moves (drives edge refraction)
    lean: new THREE.Vector3(), // fast spring (leads)
    leanVel: new THREE.Vector3(),
    leanSlow: new THREE.Vector3(), // lagging spring (mass / recovery)
    target: new THREE.Vector3(),
    desiredForward: new THREE.Vector3(0, 0, 1),
    quat: new THREE.Quaternion(),
    swayQuat: new THREE.Quaternion(),
    euler: new THREE.Euler(),
    rot4: new THREE.Matrix4(),

    // Click / press lifecycle (eased on the CPU, fed to the shader as uPress).
    press: 0,
    pressTarget: 0,
    pressing: false,

    // Scratch objects for analytic cursor picking (avoid per-frame allocation).
    pickO: new THREE.Vector3(),
    pickD: new THREE.Vector3(),
    pickQ: new THREE.Vector3(),
    pickInvQuat: new THREE.Quaternion(),
  }).current;

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30); // clamp for stable springs
    u.uTime.value = state.clock.elapsedTime;

    // Ease hover (gates the whole interaction).
    const hoverTarget = active ? 1 : 0;
    u.uHover.value += (hoverTarget - u.uHover.value) * Math.min(1, dt * 6);
    const h = u.uHover.value;

    // Press easing: fast attack so a click reads as a crisp give-and-release.
    phys.press += (phys.pressTarget - phys.press) * Math.min(1, dt * 18);
    u.uPress.value = phys.press;

    // The local swell follows an eased cursor direction, so the membrane
    // ripples toward the cursor and settles rather than snapping.
    phys.mouseDir.lerp(phys.cursorDir, Math.min(1, dt * 5));
    u.uMouse.value.copy(phys.mouseDir);

    // The slab edge only refracts WHILE the cursor moves: accumulate a phase from
    // the per-frame cursor travel (eased so it settles), so a still cursor leaves
    // the edge frozen and a moving cursor drives the wobble.
    const move = phys.mouseDir.distanceTo(phys.lastCursor);
    phys.lastCursor.copy(phys.mouseDir);
    phys.edgePhase += move * u.uEdgeRate.value;
    u.uEdgePhase.value = phys.edgePhase;

    // The cursor is a soft attractor. Restrained, so the body stays button-like.
    phys.target.copy(phys.cursorDir).multiplyScalar(h * 0.35);

    // Fast spring (the leading edge of the motion).
    const k = 80; // stiffness
    const c = 15; // damping
    const ax = (phys.target.x - phys.lean.x) * k - phys.leanVel.x * c;
    const ay = (phys.target.y - phys.lean.y) * k - phys.leanVel.y * c;
    const az = (phys.target.z - phys.lean.z) * k - phys.leanVel.z * c;
    phys.leanVel.x += ax * dt;
    phys.leanVel.y += ay * dt;
    phys.leanVel.z += az * dt;
    phys.lean.x += phys.leanVel.x * dt;
    phys.lean.y += phys.leanVel.y * dt;
    phys.lean.z += phys.leanVel.z * dt;

    // Slow spring trails the fast one -> delayed recovery + lower-half lag.
    phys.leanSlow.lerp(phys.lean, Math.min(1, dt * 3));

    // Small whole-body drift toward the cursor (kept subtle).
    u.uTranslate.value.copy(phys.lean).multiplyScalar(0.1);

    // Top-leads bend = difference between fast and slow springs.
    u.uLeadOffset.value.copy(phys.lean).sub(phys.leanSlow).multiplyScalar(0.7);

    // Slight tilt toward the cursor (lagged). Restrained so the form stays a
    // front-facing button rather than a rotating object.
    phys.desiredForward
      .set(phys.leanSlow.x * 0.22, phys.leanSlow.y * 0.22, 1.0)
      .normalize();
    phys.quat.setFromUnitVectors(FORWARD, phys.desiredForward);

    // Gentle idle sway so it feels alive at rest without spinning the decal away.
    const t = state.clock.elapsedTime;
    phys.euler.set(Math.sin(t * 0.5) * sway, Math.sin(t * 0.37) * sway, 0);
    phys.swayQuat.setFromEuler(phys.euler);
    phys.quat.premultiply(phys.swayQuat);

    // world -> local is the inverse (transpose) of the rotation.
    phys.rot4.makeRotationFromQuaternion(phys.quat).invert();
    u.uModelRotInv.value.setFromMatrix4(phys.rot4);

    // Keep the invisible event-capture volume locked to the SAME transform the
    // shader renders (drift + lean/sway), scaled to the body radii with a margin.
    // It only captures pointer events; the cursor surface point itself is solved
    // analytically against the shared ellipsoid model in handleMove.
    if (proxyRef.current) {
      const s = u.uScale.value;
      const m = 1.55; // hover margin around the body
      proxyRef.current.position.copy(u.uTranslate.value);
      proxyRef.current.quaternion.copy(phys.quat);
      proxyRef.current.scale.set(s.x * m, s.y * m, s.z * m);
    }

    const cam = state.camera;
    u.uCamPos.value.copy(cam.position);
    u.uProjInv.value.copy(cam.projectionMatrix).invert();
    u.uViewInv.value.copy(cam.matrixWorld);
  });

  // Cursor surface point derived from the SAME ellipsoid model the shader renders
  // (shared uScale / uTranslate / rotation), rather than from the standalone proxy
  // sphere's own geometry. This keeps hit-testing and the rendered silhouette on a
  // single source of truth: the cursor point lies on the body you actually see.
  const handleMove = (e) => {
    e.stopPropagation();
    const ro = e.ray.origin;
    const rd = e.ray.direction;
    const s = u.uScale.value;

    // Bring the camera ray into the body's local frame (world -> local).
    const invQ = phys.pickInvQuat.copy(phys.quat).invert();
    const o = phys.pickO.copy(ro).sub(u.uTranslate.value).applyQuaternion(invQ);
    const d = phys.pickD.copy(rd).applyQuaternion(invQ).normalize();

    // Map into unit-sphere space by dividing out the ellipsoid radii, then solve
    // the ray/sphere quadratic. Rm leaves headroom for the breathing displacement.
    const oux = o.x / s.x;
    const ouy = o.y / s.y;
    const ouz = o.z / s.z;
    const dux = d.x / s.x;
    const duy = d.y / s.y;
    const duz = d.z / s.z;
    const Rm = 1 + u.uAmplitude.value * 0.8;
    const a = dux * dux + duy * duy + duz * duz;
    const b = 2 * (oux * dux + ouy * duy + ouz * duz);
    const c = oux * oux + ouy * ouy + ouz * ouz - Rm * Rm;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return; // ray misses the body -> keep the last cursor direction

    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t < 0) t = (-b + sq) / (2 * a);
    if (t < 0) return;

    // Local hit -> world-space direction from the body center (what uMouse wants).
    phys.pickQ
      .set((oux + t * dux) * s.x, (ouy + t * duy) * s.y, (ouz + t * duz) * s.z)
      .normalize()
      .applyQuaternion(phys.quat);
    phys.cursorDir.copy(phys.pickQ);
  };

  const handleDown = (e) => {
    e.stopPropagation();
    phys.pressTarget = 1;
    phys.pressing = true;
  };

  const handleUp = (e) => {
    e.stopPropagation();
    phys.pressTarget = 0;
    // A press that releases over the body is a click -> fire the action.
    if (phys.pressing) {
      phys.pressing = false;
      onActivate?.();
    }
  };

  return (
    <>
      {/* Fullscreen raymarch pass. */}
      <mesh frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          key={SHADER_KEY}
          ref={(m) => {
            // R3F shallow-clones the `uniforms` prop: object values (Vector/Color/
            // Matrix) are shared but primitive (float) values are copied, so float
            // reassignments (uTime, uHover, sliders) never reach the material.
            // Point the material at our real object so every update propagates.
            if (m) m.uniforms = u;
          }}
          vertexShader={raymarchVertexShader}
          fragmentShader={raymarchFragmentShader}
          uniforms={u}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Invisible event-capture volume: it ONLY routes pointer enter/leave/
          move/down/up. It tracks the body's transform (see useFrame) and is
          inflated by a margin so hover triggers around the body. The actual
          cursor surface point is solved analytically against the shared
          ellipsoid model in handleMove, so this proxy is never the source of
          truth for the silhouette. */}
      <mesh
        ref={proxyRef}
        scale={[1.86, 1.77, 1.83]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover?.(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          phys.pressTarget = 0;
          phys.pressing = false;
          onHover?.(false);
        }}
        onPointerMove={handleMove}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
      >
        <sphereGeometry args={[1.0, 48, 32]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </>
  );
}

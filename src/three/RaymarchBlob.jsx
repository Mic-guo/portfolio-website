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
    uPlateFollow: { value: 0.4 },
    uSlabWidth: { value: 2.0 },
    uSlabHeight: { value: 1.2 },
    uSlabTranslucency: { value: 0.7 },
    uProtrude: { value: 0.38 },
    uEdgeAmount: { value: 0.55 },
    uEdgeFreq: { value: 1.6 },
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
  }).current;

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30); // clamp for stable springs
    u.uTime.value = state.clock.elapsedTime;

    // Ease hover (gates the whole interaction).
    const hoverTarget = active ? 1 : 0;
    u.uHover.value += (hoverTarget - u.uHover.value) * Math.min(1, dt * 6);
    const h = u.uHover.value;

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

    const cam = state.camera;
    u.uCamPos.value.copy(cam.position);
    u.uProjInv.value.copy(cam.projectionMatrix).invert();
    u.uViewInv.value.copy(cam.matrixWorld);
  });

  const handleMove = (e) => {
    e.stopPropagation();
    // Direction from the blob center to the cursor's surface hit, in world space.
    phys.cursorDir.copy(e.point).normalize();
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

      {/* Invisible proxy: hover detection + cursor position. Sized clearly
          larger than the blob so hover also triggers within a margin/radius
          around the body, not just exactly on it. */}
      <mesh
        ref={proxyRef}
        scale={[1.75, 1.3, 1.4]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover?.(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover?.(false);
        }}
        onPointerMove={handleMove}
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

import { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useDriver } from "../hooks/useDriver";

// ─── Static lighting ─────────────────────────────────────────────────────────

function StaticLights({ lighting }) {
  const { scene: threeScene } = useThree();
  const spotRef = useRef();
  const dirRef = useRef();

  useEffect(() => {
    const s = lighting.spot;
    const d = lighting.directional;
    if (spotRef.current && s) {
      spotRef.current.target.position.set(...(s.target ?? [0, 0, 0]));
      threeScene.add(spotRef.current.target);
      spotRef.current.target.updateMatrixWorld();
    }
    if (dirRef.current && d) {
      dirRef.current.target.position.set(...(d.target ?? [0, 0, 0]));
      threeScene.add(dirRef.current.target);
      dirRef.current.target.updateMatrixWorld();
    }
    return () => {
      if (spotRef.current) threeScene.remove(spotRef.current.target);
      if (dirRef.current) threeScene.remove(dirRef.current.target);
    };
  }, [threeScene, lighting]);

  const { ambient, spot, directional, point } = lighting;

  return (
    <>
      {ambient && (
        <ambientLight
          color={ambient.color}
          intensity={ambient.intensity ?? 1}
        />
      )}
      {spot && (
        <spotLight
          ref={spotRef}
          position={spot.position}
          angle={spot.angle ?? Math.PI / 6}
          penumbra={spot.penumbra ?? 0.5}
          intensity={spot.intensity ?? 1}
          color={spot.color}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.001}
        />
      )}
      {directional && (
        <directionalLight
          ref={dirRef}
          position={directional.position}
          intensity={directional.intensity ?? 1}
          color={directional.color}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
      )}
      {point && (
        <pointLight
          position={point.position}
          intensity={point.intensity ?? 1}
          color={point.color}
          distance={point.distance ?? 0}
          decay={point.decay ?? 2}
          castShadow={point.castShadow ?? false}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.002}
        />
      )}
    </>
  );
}

// ─── Animated lighting (lerp between two states driven by a 0→1 ref) ─────────

function AnimatedLights({ initial, final, driver }) {
  const { scene: threeScene } = useThree();
  const ambientRef = useRef();
  const spotRef = useRef();
  const dirRef = useRef();
  const t = useDriver(driver);

  const initAmbientColor = useMemo(
    () => new THREE.Color(initial.ambient?.color ?? "#000"),
    [initial.ambient?.color],
  );
  const finalAmbientColor = useMemo(
    () => new THREE.Color(final.ambient?.color ?? "#000"),
    [final.ambient?.color],
  );
  const initAmbIntensity = initial.ambient?.intensity ?? 0;
  const finalAmbIntensity = final.ambient?.intensity ?? 0;

  const spot = initial.spot;
  const dir = final.directional;

  useEffect(() => {
    if (spotRef.current && spot) {
      spotRef.current.target.position.set(...(spot.target ?? [0, 0, 0]));
      threeScene.add(spotRef.current.target);
      spotRef.current.target.updateMatrixWorld();
    }
    if (dirRef.current && dir) {
      dirRef.current.target.position.set(...(dir.target ?? [0, 0, 0]));
      threeScene.add(dirRef.current.target);
      dirRef.current.target.updateMatrixWorld();
    }
    return () => {
      if (spotRef.current) threeScene.remove(spotRef.current.target);
      if (dirRef.current) threeScene.remove(dirRef.current.target);
    };
  }, [threeScene]);

  useFrame(() => {
    const tv = t.current;
    if (ambientRef.current) {
      ambientRef.current.color.lerpColors(
        initAmbientColor,
        finalAmbientColor,
        tv,
      );
      ambientRef.current.intensity =
        initAmbIntensity + (finalAmbIntensity - initAmbIntensity) * tv;
    }
    if (spotRef.current && spot) {
      spotRef.current.intensity = spot.intensity * (1 - tv);
    }
    if (dirRef.current && dir) {
      dirRef.current.intensity = dir.intensity * tv;
    }
  });

  return (
    <>
      {(initial.ambient || final.ambient) && (
        <ambientLight
          ref={ambientRef}
          color={initAmbientColor}
          intensity={initAmbIntensity}
        />
      )}
      {spot && (
        <spotLight
          ref={spotRef}
          position={spot.position}
          angle={spot.angle ?? Math.PI / 6}
          penumbra={spot.penumbra ?? 0.5}
          intensity={spot.intensity ?? 1}
          color={spot.color}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.001}
        />
      )}
      {dir && (
        <directionalLight
          ref={dirRef}
          position={dir.position}
          intensity={0}
          color={dir.color}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
      )}
    </>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export default function SceneLights({ lighting }) {
  if (!lighting) return null;
  if ("initial" in lighting || "final" in lighting) {
    return (
      <AnimatedLights
        initial={lighting.initial ?? {}}
        final={lighting.final ?? {}}
        driver={lighting.driver}
      />
    );
  }
  return <StaticLights lighting={lighting} />;
}

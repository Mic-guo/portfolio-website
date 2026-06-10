import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Center, Line, Text3D } from "@react-three/drei";
import * as THREE from "three";
import { FontLoader } from "three-stdlib";
// M PLUS Rounded 1c (OFL, ships with three.js examples), stripped to ASCII
// glyphs — soft rounded forms that match the scene's toy-like models.
import roundedFont from "../assets/mplus-rounded.typeface.json";

// Floating hero title that opens the desk scene — real extruded letter
// models (TextGeometry with bevels) that live in the scene like any other
// prop: they're lit by the scene lights (so the intro bulb flicker, the
// hover spotlight, and the bright scroll state all play across them) and
// they never fade — the scroll cinematic simply flies the camera past them
// and leaves them behind. They deliberately don't cast shadows: the bright
// state's directional light would otherwise project giant letter shadows
// onto the desk below.
//
// Physicality rules:
//   - The block faces the initial camera straight on (full lookAt), so at
//     scroll 0 it reads like a title card; once the camera moves, the fixed
//     world orientation gives it honest 3D perspective.
//   - One material per line: letter depth is shaded by the actual scene
//     lights, never painted on with a second accent color.
//
// The block hovers on the LEFT of the start frame (the desk is framed
// right-of-center), left-aligned, with the typing caret chasing the typed
// text's right edge. Sizing derives from the camera fov + placement distance
// + canvas aspect, so it keeps its frame position regardless of where the
// timeline puts the camera or how the window is shaped.
const noRaycast = () => null;

// Animated dashed outlines traveling around each glyph contour (after
// bobbyroe/animated-text-effect): one Line2 per shape/hole, dash+gap each
// spanning the full contour so a "wipe" endlessly chases around the letter.
function GlyphOutlines({ font, message, size, z, color = "#ffffff" }) {
  const lineRefs = useRef([]);

  const contours = useMemo(() => {
    const list = [];
    const add = (shape) => {
      const points = shape.getPoints().map((p) => [p.x, p.y, 0]);
      // Close the loop so the traveling dash never shows a seam.
      if (points.length) points.push(points[0]);
      list.push({ points, length: shape.getLength() });
    };
    for (const shape of font.generateShapes(message, size)) {
      add(shape);
      shape.holes?.forEach(add);
    }
    return list;
  }, [font, message, size]);

  useFrame(({ clock }) => {
    lineRefs.current.forEach((line, i) => {
      if (!line) return;
      const { length } = contours[i];
      // Per-contour phase so the wipes don't march in lockstep.
      line.material.dashOffset =
        -clock.elapsedTime * length * 0.35 + i * length * 0.37;
    });
  });

  return (
    <group position={[0, 0, z]}>
      {contours.map((contour, i) => (
        <Line
          key={`${message}-${i}`}
          ref={(line) => {
            lineRefs.current[i] = line;
          }}
          raycast={noRaycast}
          points={contour.points}
          color={color}
          lineWidth={2}
          dashed
          dashSize={contour.length * 2}
          gapSize={contour.length * 2}
        />
      ))}
    </group>
  );
}

// Marquee LED frame: a ring of small self-lit bulbs around the text block,
// sitting slightly IN FRONT of the letters, with a soft brightness chase
// running around the perimeter like a vanity-mirror / theater sign. The
// bulbs are instanced (one draw call) and purely cosmetic — the actual
// illumination comes from the front point lights next to them.
const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();

function MarqueeLights({ width, height, margin, z, bulbR, color = "#ffd27d" }) {
  const meshRef = useRef();
  const baseColor = useMemo(() => new THREE.Color(color), [color]);

  // Even arc-length distribution around the rect perimeter, corners first
  // so the frame always has a bulb anchoring each corner.
  const positions = useMemo(() => {
    const left = -margin;
    const right = width + margin;
    const top = margin;
    const bottom = -height - margin;
    const w = right - left;
    const h = top - bottom;
    const spacing = bulbR * 7;
    const pts = [];
    const countX = Math.max(2, Math.round(w / spacing));
    const countY = Math.max(2, Math.round(h / spacing));
    for (let i = 0; i < countX; i++) {
      const x = left + (w * i) / countX;
      pts.push([x, top], [left + w - (w * i) / countX, bottom]);
    }
    for (let i = 0; i < countY; i++) {
      const y = top - (h * i) / countY;
      pts.push([right, y], [left, bottom + (h * i) / countY]);
    }
    return pts;
  }, [width, height, margin, bulbR]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    positions.forEach(([x, y], i) => {
      tmpMatrix.makeTranslation(x, y, z);
      mesh.setMatrixAt(i, tmpMatrix);
      mesh.setColorAt(i, baseColor);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }, [positions, z, baseColor]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    const n = positions.length;
    for (let i = 0; i < n; i++) {
      // Chase wave traveling around the ring; floor keeps every bulb warm
      // (LEDs dim, they don't die) so the frame never looks gap-toothed.
      const phase = (i / n) * Math.PI * 2 * 3;
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.6 - phase));
      mesh.setColorAt(i, tmpColor.copy(baseColor).multiplyScalar(pulse));
    }
    mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      key={positions.length}
      ref={meshRef}
      args={[null, null, positions.length]}
      raycast={noRaycast}
    >
      <sphereGeometry args={[bulbR, 10, 10]} />
      {/* toneMapped=false keeps the bulbs punchy against the dark scene. */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// Same cadence as the 2D Hero: type, hold, delete, advance.
function useTypingEffect(titles) {
  const [displayText, setDisplayText] = useState("");
  const [titleIndex, setTitleIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!titles.length) return undefined;
    const current = titles[titleIndex % titles.length];

    if (!isDeleting && displayText === current) {
      const t = setTimeout(() => setIsDeleting(true), 2200);
      return () => clearTimeout(t);
    }
    if (isDeleting && displayText === "") {
      setIsDeleting(false);
      setTitleIndex((i) => (i + 1) % titles.length);
      return undefined;
    }

    const delay = isDeleting ? 45 : 75;
    const t = setTimeout(() => {
      setDisplayText(
        isDeleting
          ? current.slice(0, displayText.length - 1)
          : current.slice(0, displayText.length + 1),
      );
    }, delay);
    return () => clearTimeout(t);
  }, [displayText, isDeleting, titleIndex, titles]);

  return displayText;
}

export default function IntroTitle({
  // Initial camera pose to face: { position, target, fov }.
  camera,
  // How far in front of the camera the title floats, in world units.
  distance = 7.5,
  kicker = "PORTFOLIO",
  title = "Michael Guo",
  // Cycled through with the typing effect under the title.
  titles = [],
}) {
  const groupRef = useRef();
  const cardRef = useRef();
  const caretRef = useRef();
  const typed = useTypingEffect(titles);
  const aspect = useThree((s) => s.size.width / s.size.height);
  // Parsed Font instance for outline contour generation (Text3D parses its
  // own copy internally from the same JSON, so the shapes always agree).
  const font = useMemo(() => new FontLoader().parse(roundedFont), []);

  const layout = useMemo(() => {
    const eye = new THREE.Vector3(...camera.position);
    const target = new THREE.Vector3(...(camera.target ?? [0, 0, 0]));
    const dir = target.clone().sub(eye).normalize();

    // Camera-plane axes at the card's depth, used purely to pick the spot
    // in the start frame where the block should land (left, mid-height).
    const camRight = new THREE.Vector3()
      .crossVectors(dir, THREE.Object3D.DEFAULT_UP)
      .normalize();
    const camUp = new THREE.Vector3().crossVectors(camRight, dir).normalize();

    // Visible frame size at the card's depth (fov is vertical).
    const viewH =
      2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 50) / 2);
    const viewW = viewH * aspect;

    // Pivot = the block's top-LEFT corner.
    const position = eye
      .clone()
      .addScaledVector(dir, distance)
      .addScaledVector(camRight, -(viewW / 2) + viewH * 0.1)
      .addScaledVector(camUp, viewH * 0.18);

    // "Straight on" = parallel to the camera's image plane, NOT aimed at the
    // eye point — the block sits off-axis (left of frame), so a lookAt(eye)
    // would keystone-tilt it on screen. Adopt the camera's own basis with
    // +Z (the letters' extrusion axis) pointing back toward the camera.
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(camRight, camUp, dir.clone().negate()),
    );

    const titleSize = viewH * 0.09;
    return {
      position,
      quaternion,
      titleSize,
      kickerSize: titleSize * 0.3,
      subtitleSize: titleSize * 0.42,
    };
  }, [camera.position, camera.target, camera.fov, distance, aspect]);

  const { titleSize, kickerSize, subtitleSize } = layout;
  // Line pivots (top edge of each line), stacked downward from the anchor.
  const titleY = -(kickerSize + titleSize * 0.45);
  const subtitleY = titleY - (titleSize + titleSize * 0.5);
  const caretW = subtitleSize * 0.12;

  // The headline can't use drei <Center>: Line2 outline geometry carries a
  // base instancing quad around the origin that poisons Center's bounding
  // box measurement. Align left/top edges manually from the glyph shapes
  // (the same contours both the mesh and the outlines are built from).
  const titleBounds = useMemo(() => {
    const box = new THREE.Box2();
    for (const shape of font.generateShapes(title, titleSize)) {
      for (const p of shape.getPoints()) box.expandByPoint(p);
    }
    return box;
  }, [font, title, titleSize]);

  // Right edge of the typed subtitle so the caret can chase it as it grows.
  const typedWidth = useMemo(() => {
    if (!typed) return 0;
    let max = 0;
    for (const shape of font.generateShapes(typed, subtitleSize)) {
      for (const p of shape.getPoints()) max = Math.max(max, p.x);
    }
    return max;
  }, [font, typed, subtitleSize]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    group.position.copy(layout.position);
    group.quaternion.copy(layout.quaternion);
  }, [layout]);

  useFrame(({ clock }) => {
    const card = cardRef.current;
    if (!card) return;

    // Gentle bob so the block feels suspended; no tilting — it must stay
    // upright to read as a physical object in the scene.
    const time = clock.elapsedTime;
    card.position.y = Math.sin(time * 0.7) * 0.045;

    if (caretRef.current) {
      caretRef.current.visible = time % 1.1 < 0.66;
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={cardRef}>
        {/* LED marquee frame around the whole block, floating just in front
            of the letter faces. */}
        <MarqueeLights
          width={titleBounds.max.x - titleBounds.min.x}
          height={-subtitleY + subtitleSize * 1.45}
          margin={titleSize * 0.4}
          z={titleSize * 0.3}
          bulbR={titleSize * 0.035}
        />
        {/* Front fill: warm range-limited point lights hovering IN FRONT of
            the text (local +Z, toward the camera), standing in for the glow
            the marquee bulbs would throw onto the letter faces. Short range
            keeps the spill off the desk across the frame. */}
        <pointLight
          position={[titleSize * 0.9, titleY - titleSize * 0.5, titleSize * 1.4]}
          color="#ffe2b0"
          intensity={2.4}
          distance={titleSize * 6}
          decay={1.2}
        />
        <pointLight
          position={[titleSize * 3.1, titleY - titleSize * 0.5, titleSize * 1.4]}
          color="#ffe2b0"
          intensity={2.4}
          distance={titleSize * 6}
          decay={1.2}
        />
        {/* Center right+bottom anchors each line's top-left corner at its
            pivot, so all lines share one left edge and typing grows
            rightward with the caret chasing it. */}
        <Center right bottom position={[0, 0, 0]}>
          <Text3D
            raycast={noRaycast}
            font={roundedFont}
            size={kickerSize}
            height={kickerSize * 0.22}
            letterSpacing={kickerSize * 0.4}
            bevelEnabled
            bevelSize={kickerSize * 0.035}
            bevelThickness={kickerSize * 0.035}
            bevelSegments={4}
            curveSegments={8}
            smooth={1e-5}
          >
            {kicker}
            <meshStandardMaterial color="#f8d878" roughness={0.9} />
          </Text3D>
        </Center>
        {/* Headline: puffy glass slab with a dashed wipe chasing around the
            glyph outlines — geometry ratios and material straight from
            bobbyroe/animated-text-effect (depth 0.1·size, fat bevel). */}
        <group
          position={[-titleBounds.min.x, titleY - titleBounds.max.y, 0]}
        >
          <group>
            <Text3D
              raycast={noRaycast}
              font={roundedFont}
              size={titleSize}
              height={titleSize * 0.1}
              bevelEnabled
              bevelSize={titleSize * 0.01}
              bevelThickness={titleSize * 0.08}
              bevelSegments={2}
              curveSegments={6}
            >
              {title}
              <meshPhysicalMaterial
                roughness={0.5}
                transmission={1}
                transparent
                thickness={titleSize}
              />
            </Text3D>
            <GlyphOutlines
              font={font}
              message={title}
              size={titleSize}
              z={titleSize * 0.2}
            />
          </group>
        </group>
        {typed && (
          <Center right bottom cacheKey={typed} position={[0, subtitleY, 0]}>
            <Text3D
              raycast={noRaycast}
              font={roundedFont}
              size={subtitleSize}
              height={subtitleSize * 0.2}
              bevelEnabled
              bevelSize={subtitleSize * 0.03}
              bevelThickness={subtitleSize * 0.03}
              bevelSegments={3}
              curveSegments={8}
              smooth={1e-5}
            >
              {typed}
              <meshStandardMaterial color="#ddd6c7" roughness={0.9} />
            </Text3D>
          </Center>
        )}
        {/* Blinking caret: kept self-lit (it reads as a glowing cursor, not
            a physical letter) and blinked via visibility. */}
        <mesh
          ref={caretRef}
          raycast={noRaycast}
          position={[
            typedWidth + caretW * 2,
            subtitleY - subtitleSize * 0.5,
            0,
          ]}
        >
          <boxGeometry
            args={[caretW, subtitleSize * 1.15, subtitleSize * 0.2]}
          />
          <meshBasicMaterial color="#f0c95c" />
        </mesh>
      </group>
    </group>
  );
}

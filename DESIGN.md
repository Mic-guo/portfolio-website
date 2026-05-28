# scene-lib

A React + Three.js library for loading arbitrary GLB models and giving AI a structured,
single-location way to view, light, and animate them.

---

## Design Philosophy

1. **One place to change, everything updates.** All scene configuration — camera, lighting,
   rotation — lives in a single `<ModelViewer>` call. AI edits one location per concern
   instead of hunting across `DeskModel.jsx`, `SceneLights.jsx`, and `BackgroundScene.jsx`.

2. **Hide the footguns, not the values.** AI knows Three.js. What it can't reliably get right
   are lifecycle side effects: `threeScene.add(light.target)`, `updateMatrixWorld`,
   `castShadow`/`receiveShadow` on every mesh, the 3-layer centering group hierarchy. The
   library owns all of these. Light positions, colors, and intensities are expressed as plain
   Three.js values — no abstraction layer over them.

3. **The driver is the universal animation primitive.** Any value that changes over time
   normalizes to a `MutableRefObject<number>` (0–1). Pass a scroll ref, a plain number, or
   the string `'scroll'`. All consumers are identical regardless of what drives them.

4. **Manifest extraction is automatic and inspectable.** After any GLB loads the library logs
   the manifest in dev and fires `onManifest`. AI learns what semantic objects are inside the
   model without reading source.

5. **`src/lib/` has zero imports from app code.** Enforced by convention now, lint rule later.
   Pure functions (`extractManifest`) have no React and can run in tests or at build time.

---

## Public API

### `<ModelViewer>`

The single entry point. Owns the R3F `<Canvas>`.

```jsx
import { ModelViewer } from './lib'

<ModelViewer
  src="/desk.glb"

  // Camera — raw Three.js position + fov.
  // Library handles: lookAt(0,0,0), aspect ratio, projection matrix.
  camera={{ position: [4, 7, 9], fov: 50 }}

  // Lighting — Three.js light properties expressed directly.
  // Library handles: threeScene.add(light.target), updateMatrixWorld,
  //                  shadow map sizes, castShadow on every mesh.
  //
  // Static:
  lighting={{
    ambient:     { color: '#0a0a1a', intensity: 0.08 },
    spot:        { position: [-6, 14, -5], target: [0,0,0], color: '#c8d8ff',
                   intensity: 25, angle: Math.PI / 5, penumbra: 0.6 },
  }}
  //
  // Animated — lerps between two lighting states driven by a ref:
  lighting={{
    initial: {
      ambient: { color: '#0a0a1a', intensity: 0.08 },
      spot:    { position: [-6, 14, -5], target: [0,0,0], color: '#c8d8ff',
                 intensity: 25, angle: Math.PI / 5, penumbra: 0.6 },
    },
    final: {
      ambient:     { color: '#fff5e0', intensity: 1.28 },
      directional: { position: [8, 14, 6], target: [0,0,0], color: '#FFD080', intensity: 5 },
    },
    driver: scrollProgressRef,   // MutableRefObject<number> 0→1
  }}

  // Rotation — axis + driver ref + optional smoothing factor.
  rotation={{ axis: 'y', driver: scrollProgressRef, smoothing: 0.04 }}

  shadows                          // default true
  onManifest={(manifest) => void}  // fires once after GLB loads
  style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
/>
```

**What AI does NOT need to write:**
- `threeScene.add(light.target)` and cleanup
- `light.target.updateMatrixWorld()`
- `mesh.castShadow = true` on every descendant mesh
- The 3-layer group hierarchy for centering + scaling
- Shadow map size / bias configuration

### Escape hatch — inside an existing Canvas

```jsx
import { SceneProvider, ModelMesh, SceneLights } from './lib'

// Inside an existing R3F Canvas:
<SceneProvider src="/desk.glb">
  <ModelMesh rotation={{ axis: 'y', driver: scrollRef }} />
  <SceneLights lighting={{ initial: {...}, final: {...}, driver: scrollRef }} />
</SceneProvider>
```

### Hooks

```js
import { useManifest, useDriver } from './lib'

// Inside SceneProvider — returns null until GLB loads
const manifest = useManifest()
const laptop   = manifest?.getNode('laptop')   // { id, label, bounds, ref }

// Normalize any driver input → MutableRefObject<number>
const t = useDriver(scrollRef)   // pass-through
const t = useDriver('scroll')    // creates internal window scroll listener
const t = useDriver(0.5)         // static value wrapped in ref
```

---

## Driver System

A driver is any reactive source that maps to a normalized 0→1 float, carried in a mutable
ref so it can be read in `useFrame` without causing React re-renders.

```
window scroll event
  → scrollProgressRef.current = 0.0..1.0
      ↓ passed to ModelViewer as driver
      → ModelMesh  useFrame: desk rotation.y = t * 2π
      → SceneLights useFrame: lerp light intensities + ambient color
```

`useSpringDriver(sourceRef, smoothing)` wraps any driver ref with exponential smoothing,
running the lerp inside `useFrame`. ModelMesh uses this automatically when `smoothing` is set.

**Driver input types accepted everywhere:**

| Input | Behavior |
|---|---|
| `MutableRefObject<number>` | Passed through as-is |
| `'scroll'` | Singleton window scroll listener created internally |
| `number` | Wrapped in a stable ref (static, no animation) |
| `undefined` | Zero ref (no animation) |

---

## Manifest Extraction

When a GLB loads, `extractManifest(scene)` runs one of two pipelines:

### Pipeline 1 — Named Hierarchy (primary)

Walk the scene graph top-down. At each node check:
1. Non-generic name? (not `Cube 2`, `Cylinder 3`, `Rectangle`, etc.)
2. Contains at least one mesh descendant?

If yes on both, add as a manifest node and skip its entire subtree. Produces a flat list
of semantic groups — one entry per logical object.

**desk.glb result:**
```
DeskScene → Desk (root)
  ├── notebook       → manifest node "notebook"
  ├── sticky note    → manifest node "sticky_note"
  ├── Office Chair   → manifest node "office_chair"
  ├── Plant_06       → manifest node "plant_06"
  ├── Plant Tea-1    → manifest node "plant_tea_1"
  ├── laptop         → manifest node "laptop"
  ├── wood           → manifest node "wood"
  └── leg / leg Instance → skipped (generic)
```

**Generic name filter:**
```
/^(Cube|Cylinder|Sphere|Rectangle|Plane|Torus|Cone|Pyramid|
   Group|Object|Mesh|Ellipse|Lathe|Helix|Path|Shape|
   Boolean|Merged Geometry|Text)\s*\d*$/i
```

### Pipeline 2 — Spatial Clustering (fallback)

Used when Pipeline 1 yields fewer than 2 nodes (artist used only generic names).

1. Collect all leaf meshes and their world-space bounding box centers.
2. Greedy clustering: grow clusters by proximity (threshold = 10% of scene diagonal).
3. Each cluster becomes `object_0`, `object_1`, etc.

Pipeline 2 output is a starting point for labeling, not a finished manifest.

### Manifest format

```js
{
  root: {
    bounds: { min, max, center, size },  // THREE.Vector3
    ref: THREE.Object3D,
  },
  nodes: [
    { id: 'laptop', label: 'laptop', bounds: { min, max, center, size }, ref: THREE.Object3D },
    ...
  ],
  getNode(id) → node | undefined,
}
```

Bounds are in the GLB's raw local coordinate space (before `SceneProvider` applies centering
and scaling). After centering, `worldCenter` is always `[0, 0, 0]`.

---

## Internal Data Flow

```
App.jsx
  scrollProgressRef = useRef(0)   ← also drives background color + CSS vars
  <ModelViewer src="/desk.glb" camera={{...}} lighting={{...}} rotation={{...}}>

    ↓ renders

    <Canvas camera={{ position:[4,7,9], fov:50 }} shadows gl={{ alpha:true }}>
      <Suspense fallback={null}>
        <SceneProvider src="/desk.glb">
          │
          │  useGLTF('/desk.glb') → Three.js scene
          │  extractManifest(scene) → manifest (Pipeline 1 or 2)
          │  scaleFactor  = TARGET_SWEEP_RADIUS / rawSweepRadius
          │  centerOffset = -boundingBoxCenter
          │  publishes { scene, manifest, scaleFactor, centerOffset } via React context
          │  logs manifest to console in dev
          │
          ├── <ModelMesh rotation={{ axis:'y', driver:scrollProgressRef, smoothing:0.04 }}>
          │     useSceneMetrics() → { scene, scaleFactor, centerOffset }
          │     useDriver(scrollProgressRef) → same ref, passed through
          │     useSpringDriver(ref, 0.04) → smoothedRef (exponential lag in useFrame)
          │     useEffect: mesh.castShadow = mesh.receiveShadow = true on all meshes
          │     useFrame: groupRef.rotation.y = smoothedRef.current * 2π
          │     <group ref={groupRef}>              ← rotation pivot at origin
          │       <group scale={scaleFactor}>       ← scale to TARGET_SWEEP_RADIUS
          │         <group position={centerOffset}> ← center the raw GLB
          │           <primitive object={scene} />
          │
          └── <SceneLights lighting={{ initial:{...}, final:{...}, driver:scrollProgressRef }}>
                detects 'initial' key → AnimatedLights
                useDriver(scrollProgressRef) → same ref, passed through
                useEffect: threeScene.add(spotLight.target); updateMatrixWorld()
                           threeScene.add(dirLight.target);  updateMatrixWorld()
                           cleanup on unmount
                useFrame: t = driver.current
                          ambientLight.color.lerpColors(initColor, finalColor, t)
                          ambientLight.intensity = lerp(0.08, 1.28, t)
                          spotLight.intensity    = 25 * (1 - t)
                          dirLight.intensity     = 5 * t
                <ambientLight />
                <spotLight castShadow />
                <directionalLight castShadow />
```

---

## File Structure

```
src/lib/
├── index.js                        ← public exports only
├── core/
│   ├── manifest.js                 ← extractManifest() — pure, no React
│   ├── presets.js                  ← getCameraPosition(), getLightConfig() — internal only
│   └── SceneContext.jsx            ← SceneProvider, useManifest, useSceneMetrics
├── components/
│   ├── ModelViewer.jsx             ← owns Canvas, composes everything
│   ├── ModelMesh.jsx               ← centering + scaling + rotation
│   └── SceneLights.jsx             ← static or animated lighting
├── hooks/
│   └── useDriver.js                ← normalizes driver input → MutableRefObject<number>
└── drivers/
    ├── scrollDriver.js             ← singleton scroll listener, zero React imports
    └── springDriver.js             ← useSpringDriver hook (exponential smoothing)
```

`presets.js` is internal — it provides scale-relative math used by `getCameraPosition` and
`getLightConfig` as utilities. It is not re-exported from `index.js`. All public lighting and
camera values are expressed as plain Three.js coordinates in the component props.

---

## Extractability (future npm package)

When the time comes:
- `src/lib/` → package root
- `src/lib/index.js` → `"main"` / `"module"` entry
- Peer deps: `three >=0.160`, `@react-three/fiber >=8`, `@react-three/drei >=9`, `react >=18`
- `core/manifest.js` and `core/presets.js` have no React — publishable as `scene-lib/core`
  for server-side or build-time manifest inspection
- `drivers/scrollDriver.js` has no R3F — works in any canvas-based React app

Constraint to enforce today: no file inside `src/lib/` may import from `../sections`,
`../App`, or any path outside `src/lib/`. Add an ESLint `no-restricted-imports` rule
when the codebase grows.

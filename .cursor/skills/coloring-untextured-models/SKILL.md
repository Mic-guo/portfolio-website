---
name: coloring-untextured-models
description: Workflow for assigning materials/colors to GLB models that ship without materials (e.g. Spline exports) or render black/wrong. Label parts visually, have the user validate the part-to-mesh mapping, then write material rules. Use when coloring, retexturing, or fixing the materials of a 3D model, or when a GLB renders black, gray, or "deranged" under scene lighting.
---

# Coloring Untextured Models

Never guess which mesh is which body part from node names alone — names like
`Sphere`, `Lathe`, `Torus_5` are meaningless, and guessing produces wrong
mappings. Label first, validate with the user, then map.

## Why models render black

A glTF primitive with no material falls back to the spec default: white with
`metalness: 1`. Fully metallic surfaces have no diffuse response, so they
render near-black under ambient light. Fix by assigning non-metallic
`MeshStandardMaterial`s.

## Name gotchas (critical)

Runtime names differ from the GLB's authored names. three.js GLTFLoader:

1. **Sanitizes**: spaces become `_` (`"Empty Object 3"` → `Empty_Object_3`).
2. **Dedupes**: repeated names get suffixes in traversal order. The first
   `Sphere` keeps its name; later ones become `Sphere_1`, `Sphere_2`, …
   If another group loads first (e.g. an umbrella before the body), it claims
   the plain names and the body parts get suffixed.

So rules written against authored GLB names silently miss. Always validate
against runtime names via the debug labels overlay.

## Workflow

1. **Static inspection (optional orientation pass)** — dump the node
   hierarchy/bounds with `@gltf-transform/core` (see
   `scripts/inspect-desk-layout.mjs` for the decode pattern) to get a rough
   idea of part sizes and grouping. Do not trust this for final mapping; it
   shows authored names, not runtime names.

2. **Label in-scene** — `CompanionModel` (in
   `src/lib/components/CompanionModel.jsx`) supports:
   - `debugLabels` — overlays each mesh's `Parent/Mesh` runtime name path at
     its bounds center, with leader lines spread outward. Accepts
     `{ spread, onMeshesReady, onLabelClick }`.
   - `debugVisibility` — `{ labels: {path: bool}, meshes: {path: bool} }` to
     hide labels/geometry per part. Wire `onLabelClick` to hide-on-click so
     the model can be peeled apart part by part, and build a small panel with
     show-all / solo / filter controls (dev-only).

3. **User validates** — the user clicks through parts and reports the mapping
   ("`Sphere_1` is the belly, `Torus_1..7` is the hand…"). Do not skip this;
   their mapping is ground truth.

4. **Write material rules** — `CompanionModel`'s `materials` prop:
   - Keys match the _end_ of a mesh's ancestor name path; first match wins
     (insertion order), so put specific parts before broad rules.
   - `Group/*` matches every mesh inside a named group — prefer this for
     multi-mesh parts (an eye, the nose) since deduped leaf names are
     unpredictable.
   - `*` is a catch-all; always end with one so no mesh is ever left on the
     black default.
   - Use `metalness: 0` (default) and high `roughness` for organic parts.

5. **Remove the debug wiring** from the playground/page once confirmed; keep
   the `debugLabels`/`debugVisibility` capability in `CompanionModel`.

## Example rule map shape

```jsx
const materials = {
  // specific meshes first (validated runtime names)
  Sphere_2_1: { color: "#161616", roughness: 0.35 }, // pupil
  "Eye/*": { color: "#f5f1e4", roughness: 0.45 }, // rest of eye group
  Sphere_1: { color: "#eee2b8", roughness: 0.9 }, // belly
  "Umbrella/*": { color: "#6b4a2f", roughness: 0.8 },
  // catch-all last — guarantees nothing stays glTF-default black
  "*": { color: "#838a7c", roughness: 0.95 },
};

<CompanionModel src="/model.glb" materials={materials} />;
```

A real, validated example lives in `src/playground/DeskPlayground.jsx`
(`totoroMaterials`).

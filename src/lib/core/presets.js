import * as THREE from 'three'

// ─── Camera presets ────────────────────────────────────────────────────────
// Each preset is a named viewing direction at a distance proportional to the
// scene's sweep radius (radius of the circle swept during Y rotation).

const CAMERA_DIR = {
  'dramatic-top': new THREE.Vector3(5,  9, 11).normalize(),
  'iso':          new THREE.Vector3(1,  1,  1).normalize(),
  'front':        new THREE.Vector3(0, 0.3, 1).normalize(),
  'top':          new THREE.Vector3(0,  1, 0.001).normalize(),
  'left':         new THREE.Vector3(-1, 0.3, 0).normalize(),
}

const CAMERA_DIST = {
  'dramatic-top': 3.5,
  'iso':          4.0,
  'front':        4.0,
  'top':          4.0,
  'left':         4.0,
}

// Returns [x, y, z] camera position in world space.
// worldCenter: [cx, cy, cz] — typically [0,0,0] after DeskModel centering.
// sweepRadius: half-diagonal of the scene's XZ footprint.
export function getCameraPosition(preset, worldCenter = [0, 0, 0], sweepRadius = 3.5) {
  const dir  = CAMERA_DIR[preset] ?? CAMERA_DIR['dramatic-top']
  const dist = (CAMERA_DIST[preset] ?? 3.5) * sweepRadius
  const [cx, cy, cz] = worldCenter
  return [cx + dir.x * dist, cy + dir.y * dist, cz + dir.z * dist]
}

// ─── Lighting presets ──────────────────────────────────────────────────────
// Light positions are expressed as multiples of sweepRadius so presets scale
// correctly to any model size. Verified to match the desk scene's hand-tuned
// values at sweepRadius = 3.5 (moonlight → [-6,14,-5], sun → [8,14,6]).

export function getLightConfig(preset, worldCenter = [0, 0, 0], sweepRadius = 3.5) {
  const s       = sweepRadius
  const [cx, cy, cz] = worldCenter

  const configs = {
    moonlight: {
      ambient: { color: '#0a0a1a', intensity: 0.08 },
      spot: {
        position: [cx - s * 1.71, cy + s * 4.0, cz - s * 1.43],
        target:   [cx, cy, cz],
        color:    '#c8d8ff',
        intensity: 25,
        angle:    Math.PI / 5,
        penumbra: 0.6,
      },
    },
    sunlight: {
      ambient: { color: '#fff5e0', intensity: 1.28 },
      directional: {
        position: [cx + s * 2.29, cy + s * 4.0, cz + s * 1.71],
        target:   [cx, cy, cz],
        color:    '#FFD080',
        intensity: 5,
      },
    },
    studio: {
      ambient: { color: '#ffffff', intensity: 0.6 },
      points: [
        { position: [cx,       cy + s * 2, cz + s * 2], color: '#ffffff', intensity: 20 },
        { position: [cx - s*2, cy + s,     cz - s    ], color: '#ddeeff', intensity: 10 },
        { position: [cx + s*2, cy + s,     cz - s    ], color: '#ffeedd', intensity: 8  },
      ],
    },
  }

  return configs[preset] ?? configs.moonlight
}

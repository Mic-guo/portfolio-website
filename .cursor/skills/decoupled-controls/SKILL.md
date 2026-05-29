---
name: decoupled-controls
description: Use when adding parameters, sliders, controls, or configuration to interactive systems. Ensures each control affects one conceptual dimension and avoids hidden coupling.
---

# Decoupled Controls

## Purpose

Design controls so each one maps to a single conceptual dimension. Avoid hidden coupling where one slider accidentally changes multiple meanings.

## Core Principle

A control should answer one question.

Examples:

- How fast does the object move?
- How often is state sampled?
- How fast does the camera move?
- How far apart are layers?
- How large is the rendered object?
- How long does the lifecycle last?

Do not let one parameter control several of these unless it is explicitly a master control.

## Required Separation

When relevant, separate:

- object motion speed
- animation duration
- sampling frequency
- layer spacing
- layer movement speed
- camera distance
- camera movement speed
- visual scale
- opacity/fade timing
- lifecycle completion timing

## Master Controls

A master control is allowed, but it should be explicit.

Example:

```txt
overallSpeed = multiplier applied to timing-related systems
```

Even then, individual controls should remain available when the user needs precision.

## Red Flags

A control is probably coupled incorrectly if:

- changing speed changes the final shape
- changing camera distance changes simulation state
- changing sample count changes object motion timing unexpectedly
- changing opacity affects lifecycle or motion
- changing layer movement changes generated geometry
- the user cannot tune visual readability without breaking the system

## Implementation Pattern

Use separate state domains:

```txt
simulation parameters
sampling parameters
rendering parameters
camera parameters
interaction parameters
lifecycle parameters
```

Then expose controls grouped by conceptual domain.

## Naming Rule

Name controls according to what they actually affect.

Bad:

```txt
speed
amount
intensity
scale
```

Better:

```txt
objectMotionSpeed
snapshotInterval
layerFlowSpeed
cameraDistance
trailOpacity
structureDuration
```

## Checklist

Before shipping controls:

- Each control has a clear conceptual meaning.
- Related controls are grouped together.
- Changing one control does not unexpectedly alter unrelated outcomes.
- The final result can be tuned for timing, geometry, and perception independently.
- Any master control is clearly marked as a multiplier, not a hidden dependency.

---
name: coordinate-space-discipline
description: Use when working with layouts, transforms, projections, cameras, 2D/3D rendering, canvas, SVG, CSS transforms, WebGL, R3F, or any system where objects move between spaces.
---

# Coordinate Space Discipline

## Purpose

Prevent transform bugs by explicitly identifying the coordinate space of every entity, operation, and visual effect.

Most visual-system bugs come from mixing local, parent, world, camera, screen, CSS, canvas, or DOM spaces without noticing.

## Core Principle

Every value lives in a space.

Never apply a transform unless you know:

- the input space
- the output space
- the parent transform
- whether the operation is visual-only or changes system state

## Common Spaces

Identify which of these exist:

- **Object/local space** — coordinates relative to an object itself
- **Parent space** — coordinates relative to the immediate container
- **World space** — shared scene coordinates
- **Camera/view space** — coordinates relative to the camera
- **Clip/projected space** — post-projection coordinates
- **Screen space** — pixels in the viewport
- **DOM/CSS space** — layout and CSS transform coordinates
- **Canvas/SVG space** — drawing surface coordinates
- **Simulation space** — abstract model coordinates, not necessarily visual

## Required Reasoning

Before coding transforms, answer:

1. What space is this value currently in?
2. What space does the next operation expect?
3. What transform converts between them?
4. Is this transform shared by all related objects?
5. Is there more than one transform pipeline trying to describe the same thing?

## Source-of-Truth Rule

Related objects must share a coherent transform chain.

If two objects need to visually align, they should be derived from the same coordinate model, not independently approximated in separate renderers or CSS layers.

## Red Flags

Watch for:

- CSS transforms plus canvas projection math describing the same object
- DOM layout positioning mixed with WebGL world coordinates
- visual elements that align only at rest but drift during motion
- camera changes that do not affect some supposedly 3D elements
- screen-space offsets used where world-space movement is intended
- parameter changes producing unexpected shape changes

## Preferred Pattern

Define explicit conversion helpers, for example:

```txt
local → world
world → camera
camera → screen
```

or:

```txt
simulation → scene object → camera projection → rendered pixels
```

Keep these conversions centralized.

## Implementation Checklist

Before finalizing:

- Each object has a known owning space.
- Parent-child transforms are explicit.
- Projected/rendered positions come from the same source as interaction/hit testing when possible.
- Camera movement affects all intended 3D objects consistently.
- No visual layer secretly bypasses the main transform pipeline.

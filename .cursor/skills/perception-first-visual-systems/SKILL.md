---
name: perception-first-visual-systems
description: Use when building visual, motion, 3D, UI, or generative systems where the goal is how the viewer perceives the result, not merely physical or mathematical correctness.
---

# Perception-First Visual Systems

## Purpose

A visual system succeeds when the intended perception is legible. Technical correctness is not enough.

Always evaluate what the viewer sees, not just what the data or math says exists.

## Core Principle

Think like a camera and a viewer.

Ask:

```txt
What does this read as?
```

not only:

```txt
Is this mathematically correct?
```

## Perceptual Dimensions

Evaluate:

- silhouette
- contrast
- depth cues
- occlusion
- scale
- spacing
- timing
- easing
- hierarchy
- focus
- material response
- shadows
- highlights
- camera angle
- field of view
- readability in a still frame
- readability in motion

## Viewer Mental Model

Identify what the viewer should believe is happening.

Examples:

- an object is peeling away
- a surface is bending
- a structure is being built
- a system is recording motion
- a volume is rotating
- an interaction has weight or inertia

Then choose cues that support that belief.

## Screenshot Test

A strong visual system should often communicate its core idea in a still screenshot.

Ask:

- Is the important shape visible?
- Does the depth read?
- Are foreground/background relationships clear?
- Are visual elements competing with the main idea?

## Motion Test

In motion, ask:

- Is the timing understandable?
- Does the viewer know what changed?
- Does the motion preserve continuity?
- Are important events too fast, too slow, or hidden?

## Red Flags

Watch for:

- technically correct objects that visually look random
- too many elements obscuring the intended structure
- motion that destroys readability
- camera angles that hide the important relationship
- lighting that makes content invisible
- visual polish added before hierarchy is clear

## Implementation Checklist

Before finalizing:

- The primary visual idea is obvious.
- Secondary elements do not compete with the main perception.
- Camera, lighting, and spacing support the intended reading.
- The system works in both still frame and motion.
- The viewer can describe what is happening without knowing the implementation.

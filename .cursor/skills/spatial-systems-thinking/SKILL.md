---
name: spatial-systems-thinking
description: Use when implementing or reasoning about visual, interactive, physical, simulated, or 3D systems. Helps convert vague visual requests into robust object/state/relationship models before writing code.
---

# Spatial Systems Thinking

## Purpose

Before implementing any visual, interactive, physical, or simulated system, construct a spatial/system model first. Do not jump directly into effects, animations, components, or rendering details.

The goal is to understand the system as a set of entities, relationships, constraints, transformations, and observations.

## Core Principle

Think in terms of:

- entities
- state
- relationships
- coordinate spaces
- transformations
- constraints
- observers
- lifecycle

Not merely:

- components
- effects
- animations
- styles
- one-off visual tricks

The visual output should be a consequence of the underlying system.

## Required Reasoning Pass

Before implementation, identify:

1. **Entities**
   - What objects exist?
   - Which are primary entities?
   - Which are derived or visual-only entities?

2. **State**
   - What properties does each entity own?
   - What changes over time?
   - What remains invariant?

3. **Relationships**
   - What depends on what?
   - What is the source of truth?
   - Which objects are parents, children, copies, observers, or outputs?

4. **Spaces**
   - What coordinate spaces exist?
   - Where does each operation happen?
   - Are transforms being mixed across incompatible spaces?

5. **Lifecycle**
   - How does the system start?
   - How does it evolve?
   - Does it complete, hold, loop, decay, or reset?

6. **Perception**
   - What should the viewer perceive?
   - What visual cues make that perception legible?
   - What would a screenshot or short clip look like?

## Implementation Rule

Only implement after the model is clear.

If the request is ambiguous, make a best-effort model and state the assumptions briefly before coding.

## Anti-Patterns

Avoid:

- adding visual effects before understanding the underlying objects
- mixing coordinate spaces accidentally
- coupling unrelated parameters
- treating visual output as the source of truth
- hardcoding effects that should emerge from state
- assuming every animation should loop forever
- optimizing for implementation convenience over viewer perception

## Preferred Pattern

Use this chain:

```txt
model → rules → behavior → rendering → perception
```

Avoid this chain:

```txt
visual trick → patch behavior → patch transforms → patch perception
```

## Checklist

Before finalizing an implementation, verify:

- There is one clear source of truth.
- Derived visuals can be regenerated from system state.
- Coordinate spaces are explicitly handled.
- Controls affect only the dimensions they claim to affect.
- The lifecycle is intentional.
- The visual result matches the desired perception.

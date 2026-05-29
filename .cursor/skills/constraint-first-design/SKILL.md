---
name: constraint-first-design
description: Use when a user asks for a complex visual, spatial, procedural, physical, or interactive result. Derive implementation from required constraints instead of guessing effects.
---

# Constraint-First Design

## Purpose

Convert vague desired outcomes into explicit constraints, then derive an implementation that satisfies them.

## Core Principle

Before asking:

```txt
How do I build this?
```

ask:

```txt
What must be true for this to be correct?
```

## Types Of Constraints

Identify:

- geometric constraints
- spatial constraints
- temporal constraints
- interaction constraints
- visual/perceptual constraints
- physical/plausibility constraints
- data/model constraints
- invariants

## Constraint Reasoning Process

1. Define the desired final state.
2. Identify required relationships.
3. Identify invariants that must remain true.
4. Identify degrees of freedom.
5. Derive motion, sampling, rendering, and controls from those constraints.

## Examples Of Constraint Thinking

Instead of “make it look like a structure,” define:

- required points
- required edges
- required surfaces
- required depth relationships
- required viewing angle
- required completion state

Instead of “make it feel soft,” define:

- which parts deform
- which parts remain rigid
- how deformation propagates
- how quickly it returns
- what force or interaction causes it

## Invariants

Always ask what should never change.

Examples:

- object identity remains stable
- alignment stays consistent
- final geometry is independent of animation speed
- camera controls do not change simulation
- visual styling does not change underlying state

## Red Flags

Watch for:

- implementation choices made before constraints are clear
- parameters that break the intended final state
- decorative patches that hide constraint violations
- outputs that only work for one hardcoded case
- systems that cannot explain why a result forms

## Checklist

Before implementing:

- The desired outcome is described as constraints.
- The source of truth is clear.
- Invariants are explicit.
- Free parameters are separated from fixed requirements.
- The implementation can be tested against the constraints.

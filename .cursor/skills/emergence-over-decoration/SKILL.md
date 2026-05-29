---
name: emergence-over-decoration
description: Use when a visual effect should feel physically, procedurally, or causally motivated. Helps avoid fake overlays and instead generate visuals from underlying motion, state, or simulation.
---

# Emergence Over Decoration

## Purpose

When creating visual effects, prefer systems where the result emerges naturally from motion, state, relationships, or simulation instead of being painted on afterward.

## Core Principle

Ask:

```txt
What process would naturally create this result?
```

before asking:

```txt
How do I draw this result directly?
```

## Preferred Approach

Use:

```txt
cause → state change → recorded consequence → visual output
```

Avoid:

```txt
desired visual → synthetic overlay → patched alignment
```

## Examples Of Reasoning

Instead of forcing a curve to look interesting, define object motion that creates interesting recorded paths.

Instead of drawing a glow randomly, define a light/material relationship that creates highlights.

Instead of adding fake depth lines, define sampled positions through depth and render the connections.

Instead of visually warping an object to suggest softness, define a deformation model or constraint field that explains the shape change.

## Generator vs Output

Always identify:

- **Generator** — the thing that produces the result
- **Output** — the thing the viewer primarily sees
- **Measurement** — any captured/sampled/derived data
- **Decoration** — optional visual enhancement, never the source of truth

A good system can often hide the generator and still preserve the output.

## When Decoration Is Acceptable

Decoration is acceptable when it is:

- clearly secondary
- derived from the model
- not responsible for core meaning
- not pretending to be simulation

## Red Flags

Avoid effects where:

- the visual result changes when unrelated parameters change
- the output does not correspond to actual object state
- the effect looks right only from one camera angle by accident
- the implementation has to constantly patch alignment
- the user describes a causal relationship but the code only draws a surface-level mimic

## Implementation Checklist

Before implementing a visual effect:

1. Identify the intended natural cause.
2. Identify the state that records that cause.
3. Render from that state.
4. Keep decorative enhancements optional and secondary.
5. Verify that changing the cause changes the output predictably.

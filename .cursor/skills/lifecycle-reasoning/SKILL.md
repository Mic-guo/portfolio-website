---
name: lifecycle-reasoning
description: Use when implementing animations, interactions, simulations, generative systems, or any behavior that evolves over time.
---

# Lifecycle Reasoning

## Purpose

Every interactive or animated system has phases. Define them before implementation so behavior does not accidentally loop, continue, reset, or decay incorrectly.

## Core Principle

Do not assume continuous looping.

First determine whether the system should:

- loop forever
- run once and hold
- run once and disappear
- respond continuously to input
- build toward a completed state
- reset on interaction end
- preserve accumulated state

## Common Lifecycle Phases

Use some or all of these:

```txt
idle
initialize
start
build/evolve
complete
hold
decay
reset
```

## Required Questions

Before implementation, answer:

1. What starts the behavior?
2. What changes during the behavior?
3. What determines progress?
4. What counts as completion?
5. What happens at completion?
6. What happens if input stops early?
7. What happens when input resumes?
8. Does the system preserve or discard previous state?

## Completion States

If a system has a target result, explicitly define completion.

At completion, decide whether to:

- stop motion
- stop spawning
- freeze output
- keep rendering but stop simulation
- fade out
- transition into another state
- wait for reset

## Red Flags

Watch for:

- effects continuing after the intended result has formed
- objects moving past the meaningful endpoint
- spawning continuing after completion
- loops where the user expected a finite build
- reset behavior that destroys the result too early
- no distinction between “currently animating” and “completed”

## Implementation Pattern

Represent lifecycle explicitly in state:

```txt
phase: idle | building | complete | holding | resetting
progress: 0..1
```

Avoid inferring lifecycle only from elapsed time or object positions unless those are intentionally the source of truth.

## Checklist

Before finalizing:

- The start trigger is clear.
- Progress is defined independently from rendering when possible.
- Completion is explicit.
- Hold/reset behavior is intentional.
- Loops are opt-in, not accidental.

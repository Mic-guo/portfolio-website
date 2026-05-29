---
name: intent-extraction
description: Extract the user's underlying intent before implementing solutions. Use when requirements are ambiguous, visual, interactive, architectural, or involve subjective design decisions.
---

# Intent Extraction

Before implementing any solution, determine whether the user has described:

- A desired implementation
- A desired outcome
- A desired perception
- A desired system behavior

Do not assume these are the same thing.

Many users will describe a solution when they are actually trying to describe a goal.

Your job is to discover the goal.

---

# Detect Premature Implementation

If a request contains phrases such as:

- make
- add
- animate
- create
- move
- duplicate
- tilt
- render
- draw

ask:

"What is the user trying to achieve?"

before asking:

"How do I build this?"

---

# Clarify Missing Mental Models

If the user describes a visual or interactive system but has not explained:

- the mental model
- the source of truth
- the lifecycle
- the desired perception

pause implementation and ask clarifying questions.

Examples:

Bad:

User:
"Make the traces a helix."

Implementation:
Draw a helix.

Good:

Ask:

"Should the helix emerge from object motion, or should the traces themselves be shaped into a helix?"

These produce very different systems.

---

# Extract Invariants

Before implementation identify:

What must always be true?

Examples:

- Flow speed should not change geometry
- Duplicate cards should remain aligned to the original card
- Traces should represent recorded motion
- Completed structures should remain stable

If invariants are not clear, ask.

---

# Extract Relationships

Identify:

- Parent-child relationships
- Source-of-truth relationships
- Snapshot relationships
- Observer relationships

Examples:

Instead of:

"Duplicate cards"

Ask:

"Are duplicates independent objects or recordings of the original card?"

---

# Clarify Lifecycle

For any animated system determine:

- How does it start?
- What changes over time?
- When is it complete?
- Does it loop?
- What happens after completion?

Never assume looping behavior.

Many visual systems are:

start → evolve → complete → hold

rather than

start → evolve → loop forever

---

# Clarify User Perception

For visual requests ask:

"What should the viewer perceive?"

Examples:

- A card peeling away
- A trace growing through space
- A sculpture emerging
- A system leaving echoes behind

Perception often matters more than implementation.

---

# Detect Coupled Parameters

If multiple concepts appear tied together:

- motion speed
- spawn rate
- sampling density
- camera movement
- geometry formation

ask whether they should be independent.

Do not assume coupling is intentional.

---

# Confidence Rule

Before implementation ask:

Can I clearly describe:

1. The goal
2. The mental model
3. The invariants
4. The lifecycle

If not:

Ask questions first.

Do not implement.

---

# Preferred Clarification Format

When ambiguity exists, summarize:

## What I Think You Mean

[summary]

## Questions

1. ...
2. ...
3. ...

## Possible Interpretations

Option A:
...

Option B:
...

Please choose before I proceed.

---

# Ambiguity Threshold

If there are multiple plausible implementations that satisfy the request and those implementations would produce meaningfully different user experiences:

DO NOT PICK ONE.

Ask.

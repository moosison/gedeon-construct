<!-- skills/gc-uiux/references/ux.md -->

# UX Depth — Flows, IA, States

The visual sources (taste, anti-slop, motion) say how it should *look and move*; this file is how it should
*work*. It is the depth behind the design skill's UX-first Phase 1, and it complements — never duplicates —
the engineering-hygiene table preserved in the skill body. Distilled from this project's own gc-ui/sa-uiux
hygiene lineage plus general UX practice (no external Apache/MIT source — no license-echo risk).

## Start from the user, not the screen

Before any layout: **who** is the user and in what context, **what** is the core task, **where** does this
screen sit in their journey. Name the happy path and at least two failure/edge paths. A screen designed
without its journey position tends to over- or under-serve the moment.

## Information architecture

- Establish a **visual hierarchy**: what the eye lands on first, second, third — and make sure that order
  matches task priority, not decoration.
- Group by the user's mental model, not the system's data model (name things by what people control, not
  by how the backend is built).
- Use **progressive disclosure**: reveal depth on demand rather than flattening everything onto one plane
  or hiding essential information to look "clean" (hiding essentials is an illusion of simplicity, not
  simplicity — see the cognitive-load rule below).

## The interaction-state matrix (map it for every interactive element)

Every control has more states than "normal." Design and review each explicitly:

`default · hover · focus (visible) · active/pressed · disabled · loading · empty · error · success`

A data-driven component with no loading/empty/error state is unfinished, not minimal. Focus must be
visibly distinct (keyboard users navigate by it). Disabled controls must say *why*, or offer the path to
enable them.

## Lane assist, not guardrails

Guide toward the correct action with inline, progressive feedback — inline validation, contextual hints,
real-time previews — rather than blocking with modal error walls. Correct the user in place; don't stop
them at a gate. (This is the same railway-not-guardrail principle the platform doctrine applies to systems.)

## Cognitive-load honesty

- One control, one clear meaning. Never overload a single button/toggle to mean different things depending
  on hidden state.
- Simplifying by *removing essential information* creates an illusion of ease, not real ease. Reduce load
  by better hierarchy and disclosure, not by hiding what the user needs to decide.
- Words are UX: labels name what the user controls, errors explain what happened and how to fix it, empty
  states invite the first action. An action keeps its name through the whole flow ("Publish" → "Published").

## Accessibility is part of UX, not a later pass

Semantic structure, keyboard-completable flows, visible focus, and honest contrast are baseline
requirements — the flow must be completable start-to-finish with the keyboard alone.

<!-- skills/gc-uiux/references/visual-directions.md -->
<!--
Provenance (Attribution milestone — idea-inspiration, rewritten from principle):
  - Leonxlnx/taste-skill — https://github.com/Leonxlnx/taste-skill — MIT — read 2026-07-17
      (referenced idea: tunable "dials" for variance / motion / density, plus named visual-direction presets)
-->

# Visual Directions — Setpoints

The **setpoints** layer of the design loop: where this project sits on each axis, and the named starting
points it can begin from. These values live in the project's `DESIGN.md` (see `design-brief-template.md`)
and are what `gc-uiux-reviewer` scores *fit* against. They never override the alarm limits (`anti-slop.md`).

## The three dials

Set each **independently** — they are orthogonal axes, not a single "intensity" knob. Where a chosen
combination could read as incoherent (e.g. high layout variance *with* a strict-minimalist direction),
name the tension explicitly in `DESIGN.md` and say how it resolves, rather than leaving it implicit.

- **Layout variance** — how far the composition departs from a predictable grid. *Low:* even, calm,
  grid-locked. *High:* asymmetric, overlapping, editorial. Higher variance demands more precision to keep
  it intentional rather than chaotic.
- **Motion intensity** — how much the interface moves. *Low:* essential state transitions only. *High:*
  scroll-driven reveals, ambient motion, orchestrated load sequences. Governed by `motion.md`'s
  where-does-it-help test at every level.
- **Visual density** — how much information per screen. *Low:* spacious, one idea at a time. *High:*
  dashboard-dense, many live values. Higher density raises the bar on hierarchy and typography.

## Presets (named starting points — not a closed set)

Presets are a fast way to set all three dials plus a palette/type posture at once. They are **starting
points to adapt**, never the finish line:

- **Soft** — low-to-mid variance, gentle motion, generous space; rounded, warm, approachable.
- **Minimalist** — low variance, minimal motion, low-to-mid density; precision in spacing and type does
  all the work; every element earns its place.
- **Brutalist** — high variance, deliberate/blunt motion, mid-to-high density; raw structure, hard edges,
  type as a structural material.

## Custom direction is first-class

A project may decline every preset and describe its **own** direction drawn from the subject's world — its
materials, instruments, vocabulary. The template must always present "custom direction" as an equal option;
a closed preset menu would cap what the suite lets a project express (and fail the innovation test). When a
custom direction is chosen, still set the three dials and still honor the alarm limits.

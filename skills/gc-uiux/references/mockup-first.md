<!-- skills/gc-uiux/references/mockup-first.md -->

# Mockup-First — preview and approve the design before building

Phase 3 of the `gc-uiux` loop. The point is a **hard gate**: a throwaway mockup is generated, seen
honestly, and **approved by the user before any production code is written**. Iterating a disposable
mockup is far cheaper than iterating built code — that cheapness is the whole reason to decouple design
approval from implementation.

## The mockup medium

- **Floor: one self-contained HTML file.** Zero-dependency, opens in any browser, drivable by the render
  ladder. This is the default and always-available medium.
- **Optional alternative: the `stitch-design` tool**, where the environment offers it. Its framework/
  Tailwind screens are *reference/inspiration* — read them for layout and hierarchy ideas, never paste
  them in as drop-in code for a zero-dependency target.
- One mockup by default. Offer two or three competing directions only when the user asks — generating
  variants every time is wasted work once the direction is already known.

## Deriving the mockup from `DESIGN.md`

The mockup is not invented — it is rendered from the brief's own setpoints:

- **Dials → layout.** Variance, motion, and density set how loose or tight, still or animated, sparse or
  packed the composition is.
- **Direction → visual language.** The named preset (or custom direction) drives the overall feel.
- **Tokens → palette and type.** Use the 4–6 named colors and the deliberate type pairing verbatim; do
  not introduce one-off values.
- **Signature element → the one bold thing.** Spend the boldness here; keep everything around it quiet.

If a needed value is missing from `DESIGN.md`, ask — never assume spacing, color, or layout.

## Seeing it honestly (render ladder)

Apply the render ladder in `skills/gc-uiux-review/references/render-ladder.md`: climb to the highest tier
the session offers (behavioral → static-open → code-only) and **record a ran/didn't-run manifest** — a
bare "looks good" without that manifest is never acceptable.

**Data-shape caveat is intentionally inapplicable here.** The render ladder warns that synthetic data
verifies rendering, not data semantics. A mockup is *deliberately* synthetic — that is its nature, not a
defect. The ran/didn't-run manifest still applies, but the approval attests visual/UX/taste fit only, so
the caveat is expected here rather than something to flag.

This applies the ladder's *technique*. It does not invoke the review skill, and it never claims a formal
multi-pillar audit ran — that is a separate, on-demand review, not part of this gate.

## The gate (approve / iterate)

Present the rendered mockup together with its ran/didn't-run manifest, **honestly scoped**:

> This shows visual/UX/taste fit; it does not validate data correctness or live behavior.

Then get **explicit user approval before Phase 4 (Build) writes any production code**. On rejection,
iterate the *throwaway* mockup — cheaply — and re-present; never jump ahead to production code to "show"
a change.

## Artifact hygiene — never commit a mockup

The throwaway HTML and any render-ladder screenshots live under a **gitignored** path — `.construct/mockups/`
is the natural home, since `.construct/` is already fully gitignored. Confirm the capture directory is
gitignored **before** the first screenshot (the render ladder's own screenshot-safety rule), and ensure no
mockup artifact — HTML or image — ever reaches a commit.

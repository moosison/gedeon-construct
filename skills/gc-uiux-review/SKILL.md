---
name: gc-uiux-review
description: "Visual/UX/taste audit of rendered interfaces — resolves the design brief, sees the UI via a render ladder, and runs a 7-pillar adversarial pass. Use to critique built UI; complements gc-review (code/security), not a pipeline stage."
phase: specialist
tags: [ui, ux, review, audit, visual]
model: sonnet
---

// @ai-rules:
// 1. [Pattern]: Thin orchestrator — resolve target → resolve baseline → detect stack → apply render ladder → dispatch the reviewer agent → synthesize. Judgment lives in agents/gc-uiux-reviewer.md; detectors live in references/pack-*.md; the see-the-UI ladder lives in references/render-ladder.md. Keep this body lean.
// 2. [Constraint]: This is a STANDALONE specialist skill, NOT a pipeline stage and NOT part of gc-review. Different axis: visual/UX/taste vs. code/security. Never wire it into the gc-* pipeline gates.
// 3. [Gotcha]: The description must lead with "visual/UX/taste audit" and never let the bare word "review" dominate — otherwise it trigger-collides with gc-review.

# UI/UX Review — Adversarial Visual Audit

Run an adversarial visual/UX/taste audit of a built interface. This is the feedback loop that closes the
`gc-uiux` design loop; it is **complementary to `/gc-review`** (which audits code correctness and security)
and operates on a different axis — what the interface looks like, how it reads, and how it behaves. It is a
standalone specialist mode, invoked on demand, never a pipeline gate.

## Step 1 — Resolve the target

Identify what is under review: a component, a page, a whole app, or a diff's frontend surface. Note the
frontend files involved.

## Step 2 — Resolve the baseline (DESIGN.md search order)

The reviewer scores *fit* against the project's design contract. Locate it by this search order — generic,
never a single hard-coded path (other projects have different layouts):

1. `DESIGN.md` at the **project root**.
2. else a `DESIGN.md` inside a **detected planning directory** — probe `.construct/`, `docs/`, `.planning/`
   and use whichever actually exists; name none as required.
3. else **no brief** — the reviewer falls back to abstract standards for the fit tier.

Whichever resolves is passed to the reviewer as the setpoint baseline. Independently, the **alarm limits**
(`skills/gc-uiux/references/anti-slop.md`) always apply, brief or no brief.

## Step 3 — Detect the stack and select detectors

Detect the frontend stack and select the matching opt-in detector pack to hand the reviewer:

- Tailwind (a `tailwind.config.*` or utility classes present) → `references/pack-tailwind.md`.
- Plain CSS (stylesheets, no utility framework) → `references/pack-vanilla-css.md`.
- Neither/unknown → neutral-only (pillars audited by intent, no stack-specific detectors).

## Step 4 — See the UI (render ladder)

Apply `references/render-ladder.md`: climb to the highest available tier (real-browser capture at
representative widths via the project's own run conventions → static open → code-only) and **record which
visual checks ran and which did not**. Confirm any screenshot directory is gitignored before capturing.

## Step 5 — Dispatch the reviewer

Dispatch a **single** worker at **sonnet** tier, briefed with `agents/gc-uiux-reviewer.md`, passing: the
target files, the resolved baseline, the selected stack pack, and the render tier + didn't-run disclosure.
(One agent, not a parallel panel — there is no in-repo parallel-dispatch pattern to mirror here.)

> Dispatch guidance: worker = `agents/gc-uiux-reviewer.md`, model = `sonnet`. gc-skill-author mandates a
> dispatch-guidance block for *pipeline* skills; this skill is `specialist`, so the block is present as
> prudent practice because it does dispatch a subagent — not because it is a pipeline stage.

## Step 6 — Synthesize

Present the reviewer's 7-pillar scorecard, alarm-limit trips, and priority fixes in Gedeon's voice — carrying
the render tier and the ran/didn't-run manifest into the summary. A bare "looks good" without that manifest
is never acceptable. On completion, if any audited file lacks an `@ai-rules` header, suggest `/gc-shebang`.

## Anti-Patterns

- Claiming a visual pass from a code-only read without disclosing what could not be checked.
- Assuming a fixed dev-server port or a specific browser tool instead of the project's own run conventions.
- Letting a `DESIGN.md` waive an alarm limit (the two tiers are independent by design).
- Duplicating `gc-review`'s code/security lens here — this axis is visual/UX/taste only.
- Injecting synthetic data and reporting a data-dependent finding as if the real values were seen.

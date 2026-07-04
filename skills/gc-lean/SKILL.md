---
name: gc-lean
description: "Applies the YAGNI ladder to a plan, flagging over-engineered steps before gc-execute. Run standalone for early plan review, or invoked automatically as Auditor D during gc-preflight."
phase: pipeline
tags: [planning, yagni, lean, review]
model: sonnet
---

// @ai-rules:
// 1. [Constraint]: Reviews PLANS, not code. Target is atomic steps in a plan file before execution.
// 2. [Pattern]: Apply the 7-rung YAGNI ladder per step. A step eliminated here saves every token in gc-execute.
// 3. [Gotcha]: Never flag security controls, trust-boundary validation, or user-explicitly-requested steps — protected rungs.
// 4. [Pattern]: gc-preflight runs this automatically as Auditor D. Standalone use is for early review before preflight.

# Lean Plan Review

Applies the YAGNI ladder to every atomic step in a plan. Steps eliminated here never reach gc-execute — every token saved compounds across all execution waves.

## The 7-Rung Ladder

Stop at the first rung that fires:

1. **Exists?** — Does this need to exist? Speculative need, "nice to have," absent from acceptance criteria → DELETE
2. **Duplicate?** — Already in the codebase? → DELETE or REUSE
3. **Stdlib?** — Standard library covers it? → SIMPLIFY
4. **Native?** — Platform native feature covers it? → SIMPLIFY (no dep needed)
5. **Existing dep?** — An already-installed dependency solves it? → SIMPLIFY (no new package)
6. **One-liner?** — Can the step reduce to one line? → SIMPLIFY
7. **Minimum?** — Is what's described the minimum that works? → FLAG if premature abstraction

## Process

### Step 1: Load Plan

Identify the plan to review from the argument (e.g. `/gc-lean gc-lean-integration`), pipeline state at `.claude/gc-pipeline.json`, or the plan named in the conversation. Read the plan file from `~/.claude/gedeon/plans/{slug}.plan.md`. Extract all atomic steps.

If the plan contains 0 atomic steps (empty todos list), output: `"Plan has no atomic steps — lean review deferred until steps are drafted. Verdict: DEFER."` Do not produce a verdict table or lean score.

For steps with `status: completed`: include them in the verdict table, apply the ladder normally, but mark the Lean Note as `(completed — informational, not actionable)`. Completed steps cannot be removed or simplified before execute; flagging them surfaces technical debt for gc-review awareness.

### Step 2: Apply the Ladder

For each atomic step, run through the 7 rungs top-to-bottom. Assign a verdict:
- **PASS** — Survives all rungs. Necessary and appropriately scoped.
- **FLAG** — Fails rung 7 only. Scope may be tightened; step itself is needed.
- **SIMPLIFY** — Fails rung 3–6. Step should exist but in a simpler form. Name the simpler form explicitly.
- **DELETE** — Fails rung 1 or 2. Step should not be executed.

Mark deliberate simplifications with a `lean:` comment in the note field naming the ceiling and the upgrade path.

### Step 3: Report

Surface the YAGNI verdict table and a grouped summary:
- DELETE candidates (steps to remove from the plan before execute)
- SIMPLIFY candidates (steps to reduce in scope before execute)
- Overall lean score is a rate, not a raw count: findings ÷ total steps. **LEAN** (<15%) / **TRIM** (15–40%) / **OVERBUILT** (>40%). Report both the rate and the raw finding count.
- Estimated step reduction as a percentage

### Step 4: Propose Changes

List the minimal edits to the plan file. If DELETE candidates exist, offer to remove them. If SIMPLIFY candidates exist, describe what the simpler form looks like.

## Boundaries

- Never flag security controls, trust-boundary validation, error handling that prevents data loss, or accessibility basics — these are never lean targets.
- Never flag a step explicitly present in the acceptance criteria.
- Never flag a step the user explicitly requested in the current session.
- A step exempted by the two rules above (acceptance criteria or user-explicit) that would otherwise fail the ladder renders as **PASS** with note `(exempted — user-requested, ladder bypassed)`, and is excluded from the estimated step-reduction percentage — exemptions are not savings.
- A step that passes all 7 rungs is PASS — no manufactured findings.
- This skill governs what to build, not how to build it. Pair with gc-review for correctness.
- A DELETE verdict that cites an external file (e.g. "not in ROADMAP.md's acceptance criteria," "not in the discuss-phase decisions") must include the actual citation — the file path and the matching (or absent) line — not just the assertion. An unverified claim like this can propagate uncorrected through multiple plan revisions and preflight rounds if later reviewers trust the prose instead of checking the source.

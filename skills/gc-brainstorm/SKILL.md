---
name: gc-brainstorm
description: "Divergent ideation for undirected requests -- 'what should we build', 'give me ideas'. Generates ranked options, lets the user pick, then defines scope. Fulfills gc-bootstrap's Intent Gate 'No direction' row; the pre-phase-existence counterpart to gc-discuss (which resolves gray areas inside an already-named phase)."
phase: specialist
requires:
  - gc-bootstrap
tags: [brainstorm, ideation, divergent, cynefin, disorder]
---

# Brainstorm

**Divergent ideation before a phase's shape exists.** The request has no direction yet -- "what
should we build," "give me ideas" -- and the job is to generate genuinely different directions,
rank them, and let the user choose. This is the sense-making move for Cynefin's Disorder domain:
the point isn't to already know the answer, it's to triage into a domain worth committing to.

## When to Use

- `gc-bootstrap`'s Intent Gate routes here automatically the moment it reads a "no direction"
  signal -- this skill exists specifically to fulfill that row, not just to be invoked standalone.
- Invoke directly any time mid-session a request turns genuinely open-ended, independent of
  bootstrap.
- Do not reach for this once a phase already has a name and a container -- that is convergent
  territory (`gc-discuss`'s job: resolving gray areas *within* a known phase), not divergent
  ideation *before* one exists. If a phase for this topic already exists, hand off there instead
  of diverging further.

## Reasoning Workflow

1. **Sense the actual disorder.** An undirected request already IS Cynefin's Disorder domain --
   don't pretend the answer is obvious just because a plausible one comes to mind first.
2. **Diverge before converging.** Generate several genuinely different directions, not one
   obvious answer restated three ways. Each option should differ in its underlying bet (approach,
   risk profile, effort, audience), not just its wording.
3. **Rank with a stated rationale.** Order the options by whichever axis actually matters for this
   request -- effort, risk, differentiation, fit with existing constraints -- and say out loud
   which axis you used. An unranked list hides the judgment call instead of surfacing it.
4. **Recommend, but let the user choose.** Present the ranked options with a lead recommendation,
   the same "recommend first, user confirms" idiom the rest of this pipeline already uses. Never
   decide on the user's behalf.
5. **Capture durably once chosen.** Before moving on, write the chosen direction, the alternatives
   that were ruled out, and why, to `docs/brainstorms/{slug}-options.md` (create the directory on
   first use). Derive `{slug}` from the chosen direction's own short title if the ranking gave it
   one (lowercase, hyphen-separated, the same normalization the rest of the pipeline applies to
   slugs), or from a concise paraphrase -- four words or fewer -- of the chosen direction if it
   didn't; the goal is a stable, recognizable identifier for this decision, not a literal
   reproduction of the option's full text. A future session revisiting this decision needs the
   rejected paths and their reasons, not just the winner.
6. **Hand off cleanly.** If this invocation came from `gc-bootstrap`'s Intent Gate (the "no
   direction" row invoked it inline, in the same turn), return control there once scope is chosen
   -- that row's own wording already promises the workspace scan continues, so the scan runs next,
   not a jump straight to `/gc-discuss` or `/gc-plan`. Otherwise -- invoked standalone, independent
   of bootstrap -- a chosen, scoped idea is ready for `/gc-discuss` (if gray areas remain) or
   `/gc-plan` (if scope is already tight enough); say which one you're recommending and why.

## Anti-Patterns

- Presenting a single option dressed as "brainstorming" -- divergence requires genuinely
  different bets, not one idea rephrased three ways.
- Deciding for the user -- a ranked recommendation is a proposal, not a decision; always wait for
  the pick.
- Brainstorming inside an already-named phase -- if a phase container already exists for this
  topic, the remaining gray areas are `gc-discuss`'s job, not this skill's. Diverging before a
  phase exists and converging within one are different moves; don't blur them.
- Losing the "why" behind ruled-out options -- a future session needs the rejected paths and their
  reasoning, not just the winner, or the same dead ends get re-explored later.
- Treating the ranking axis as self-evident -- a ranked list with no stated ranking criterion just
  hides the judgment call it's supposed to surface.

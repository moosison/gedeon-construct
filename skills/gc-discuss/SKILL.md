---
name: gc-discuss
description: "Stage 1.5 of the pipeline (optional). Elicits requirements and resolves gray areas for a specific phase before planning. Reads .construct/ files directly, presents open questions, and writes a CONTEXT.md decision record."
phase: pipeline
requires:
  - gc-bootstrap
tags: [requirements, elicitation, gray-areas, context]
model: sonnet
---

// @ai-rules:
// 1. [Constraint]: CONTEXT.md path must be depth-3: .construct/phases/{milestone-slug}/{phase-slug}/{phase-slug}-CONTEXT.md.
// 2. [Gotcha]: First-run guard in Step 1 has 3 branches — phases/ absent, milestone-dir absent, milestone-dir present. All three must be handled.
// 3. [Pattern]: Phase-slug elicitation: ask explicitly if not already stated in current context.

# Discuss Phase

**Stage 1.5 (optional) of the pipeline.** Surfaces unknown requirements, gray areas, and scope ambiguities before planning begins. Produces a `{phase}-CONTEXT.md` decision record.

**Prior stage:** `/gc-bootstrap`
**Next stage:** `/gc-plan`

## When to Use

Invoke `/gc-discuss` when:
- Requirements are vague or contested
- Multiple valid interpretations of scope exist
- Stakeholder decisions are needed before coding makes sense
- You want to document decisions explicitly before the plan

Skip if the scope is already well-defined.

## Steps

### Step 1: Load Context

Read:
1. `.construct/PROJECT.md` — project goal
2. `.construct/REQUIREMENTS.md` — known requirements
3. `.construct/ROADMAP.md` — which milestone/phase is being discussed
4. Any existing `*-CONTEXT.md` files for prior decisions

Also read any phase-specific docs the user provides.

**Slug derivation:** Derive `{milestone-slug}` from the active milestone heading in ROADMAP.md — the one whose `**Status:**` field is `In progress` (or the last milestone heading in document order if none is in-progress). Strip the leading `Milestone: ` prefix. Apply: lowercase, replace `/`, `+`, spaces, and other special characters with hyphens, collapse consecutive hyphens to a single hyphen, trim leading and trailing hyphens. Example: `Milestone: Token/Model Routing + Agent Definitions` → `token-model-routing-agent-definitions`. Derive `{phase-slug}` from the phase name for this discussion. If the phase name has not already been stated in context, ask: 'What is the name of this phase?' before applying the algorithm. If the active milestone cannot be determined unambiguously, ask: 'Which milestone does this phase belong to?'

**First-run guard:** Check whether `.construct/phases/` exists.
- If `.construct/phases/` does not exist: stop. Inform the user: 'The phases directory does not exist yet. Please run `/gc-milestone` first to create the milestone container before running gc-discuss.'
- If `.construct/phases/` exists but contains no directory matching `{milestone-slug}`: list the directory contents and ask: 'No directory named `{milestone-slug}` found. Did you mean one of these, or should we run `/gc-milestone` first?'
- If `.construct/phases/{milestone-slug}/` exists: proceed.

### Step 2: Identify Gray Areas

Analyze the loaded context to find:
- **Ambiguous requirements** — requirements that could mean multiple things
- **Scope gaps** — things the requirements don't address but implementation will need to decide
- **Conflicting signals** — two requirements that can't both be fully satisfied
- **Technical assumptions** — implementation choices that need stakeholder input

Group gray areas by type (UX, data model, API design, security, scope, performance).

### Step 3: Present and Elicit

Present the identified gray areas to the user. For each area:
- State the question clearly
- Offer 2-3 options where applicable (with trade-offs)
- Give a recommended answer, listed first, so the user can confirm instead of generating one from scratch
- Invite the user to decide or provide context

Use a single `AskUserQuestion` prompt for the most critical gray areas rather than asking one at a time.

### Step 4: Write CONTEXT.md

Create `.construct/phases/{milestone-slug}/{phase-slug}/` if it does not exist (using `mkdir -p` or equivalent). This runs in Step 4 only — after the first-run guard in Step 1 has already confirmed the milestone container exists.

Write `.construct/phases/{milestone-slug}/{phase-slug}/{phase-slug}-CONTEXT.md`:

```markdown
# Context: {Phase Name}

## Date
{YYYY-MM-DD}

## Decisions Made

### {Gray Area 1}
**Decision:** {what was decided}
**Rationale:** {why}

### {Gray Area 2}
**Decision:** {what was decided}
**Rationale:** {why}

## Open Questions (deferred)
- {anything not resolved — carry into plan as explicitly unknown}

## Constraints
- {any hard constraints surfaced during discussion}
```

### Step 5: Handoff

Confirm context captured in Gedeon voice, then propose plan.

## Anti-Patterns

- Asking more than 4 questions at once
- Making decisions on behalf of the user
- Deferring all gray areas without resolution (some must be decided to plan)
- Writing context without actually reading the requirements first

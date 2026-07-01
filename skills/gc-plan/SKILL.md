---
name: gc-plan
description: "Stage 2 of the pipeline. Gathers evidence from the codebase via parallel exploration, then authors a detailed implementation plan with Cynefin-tagged atomic steps, probe templates for Complex steps, and verification criteria."
phase: pipeline
requires:
  - gc-bootstrap
  - gc-probe
tags: [planning, exploration, cynefin, evidence]
model: opus
---

// @ai-rules:
// 1. [Pattern]: Prior context check runs before the Design Brief template — glob phases/*/*/*-CONTEXT.md from workspace root.
// 2. [Constraint]: Deferred questions go in Section 2 under #### heading, never Section 5. No new Section 2b. Sections 3–7 numbering unchanged.
// 3. [Pattern]: Bootstrap reuse: detect ## Bootstrap Context Brief: heading; sufficient = file list + tech stack.
// 4. [Pattern]: gc-pipeline.json write includes "slug" field derived from feature-slug used in the Design Brief (available from user's invocation request).
// 5. [Gotcha]: gc-resume's artifact ladder matches '{slug}.plan.md' for the "plan written, no preflight" state — if the plan filename convention changes, update gc-resume Step 2's artifact ladder.

# Create Plan

**Stage 2 of the pipeline.** Gathers evidence from the codebase, then authors a detailed implementation plan with atomic steps, Cynefin tags, and verification criteria.

**Prior stage:** `/gc-bootstrap` (optional — carry situational brief into Step 1)
**Next stage:** `/gc-preflight`

> **Pipeline state:** Write `{"stage":"create-plan","slug":"<feature-slug>","updatedAt":"<current ISO timestamp>"}` to `.claude/gc-pipeline.json` in the current project directory. Create `.claude/` first if absent.
> - If slug argument provided at invocation (e.g., `/gc-plan gc-resume`): write at skill start. If slug is refined during Step 7, do a two-step write: initial write with invocation slug, then update after Step 7 confirms the final feature-slug.
> - If no slug argument (bare `/gc-plan`): defer write to immediately after Step 1 (when feature-slug is first formalized in the Design Brief).

## Execution Steps

### Step 1: Exploration Design Brief

**Prior context check:** Before building the brief, glob `.construct/phases/*/*/*-CONTEXT.md` (depth-3: milestone-slug / phase-slug / file) from the workspace root. If found:
1. Read the `## Date` field. If the date is more than 14 days ago, present it to the user: 'Discussion context is {N} days old ({date}) — still current?' and await confirmation. If the user declines, note it as a risk in the brief but do not block.
2. Inherit `## Decisions Made` and `## Constraints` → add to **Section 2 (Constraints)** of the brief, each item labelled '(from prior discussion)'.
3. Inherit `## Open Questions (deferred)` → append to **Section 2 (Constraints)** under a level-4 heading: `#### User-Deferred Decisions (from prior discussion, unresolved):`, each item labelled '(deferred — not yet decided)'. This is a labeled group within Section 2 (use `####`, not `###` or bold text) — do NOT introduce a new Section 2b or renumber Sections 3–7. Do NOT place in Section 5; Section 5 is reserved for codebase analysis questions dispatched to explorers.
If no CONTEXT.md found, proceed normally — gc-discuss is optional.

**Before dispatching explorers**, synthesize the user request into a structured brief. Explorers validate, refute, and enrich — not infer intent from a one-liner.

```markdown
## Exploration Design Brief: {feature-slug}

### 1. Problem & Goals
- What problem are we solving? What does success look like?
- In scope / out of scope

### 2. Constraints & Deferred Decisions
- Technical, security, compatibility, or policy constraints

### 3. Proposed Approach (pre-evidence)
- High-level strategy in 3-5 sentences — hypothesis, not fact

### 4. Suspected Impact
- Components, services, directories likely touched
- Suspected files (hypothesis — explorers confirm or reject)
- Downstream consumers at risk

### 5. Open Questions for Explorers
- Numbered assumptions that MUST be verified in code

### 6. Architecture Map (Mermaid)
- System context diagram — data flow enter → through → exit

### 7. Exploration Success Criteria
- What evidence must explorers return before writing atomic steps?
```

### Step 2: Evidence-Gathering Exploration

**Bootstrap reuse (always-on):** If a gc-bootstrap situational brief or workspace scan is visible in the current conversation context, use it as Explorer A's output — dispatch only Explorers B and C for supplementary coverage. A gc-bootstrap brief is identifiable by the heading `## Bootstrap Context Brief:`. Treat as sufficient Explorer A output only if it contains an affected-file list and tech stack; otherwise dispatch all three explorers.

> **Tooling note:** All file inspection must use dedicated read tools (file reading, pattern search, path matching). Avoid shell commands for read operations — they trigger permission prompts in Claude Code. Reserve shell tools only for operations the dedicated tools cannot perform (e.g. encoding manipulation, process control).

Dispatch **3 parallel Explore agents** in one message — all read-only, no file writes.

| Explorer | Model | Agent file | Lens |
| --- | --- | --- | --- |
| **A — Deep trace** | `haiku` | `agents/gc-explorer.md` | Repo structure, conventions, full-file reads, call chains, transitive consumers |
| **B — Breadth scout** | `haiku` | `agents/gc-explorer.md` | Hypothesis-driven discovery, entrypoints, suspected-area sweep |
| **C — Correctness probe** | `haiku` | `agents/gc-explorer.md` | Challenge assumptions, edge cases, contradictions; read-only checks |

**Wait for all explorers** before proceeding.

Each explorer returns: Affected Files, Dependencies, Existing Patterns, Unknowns & Contradictions, Cynefin Pre-Classification per change area.

**Optional research lane:** For features requiring external knowledge (new libraries, APIs, unfamiliar domain) — dispatch a 4th agent (`sonnet`) with web search access to produce a Framework Quick Reference before Step 3.

### Step 3: Merge Evidence

Merge rules:
- **Affected files**: UNION — any explorer listing a file keeps it
- **Patterns**: Agreement = established; disagreement = flag
- **Unknowns**: UNION all
- **Contradictions**: STOP, present to user, wait for resolution
- **Cynefin**: Take the **more complex** classification when explorers disagree

Evidence validation before Step 4:
- [ ] Every affected file was read by ≥1 explorer
- [ ] Every unknown listed explicitly
- [ ] No unresolved contradictions

### Step 4: Implementation Strategy

Using merged evidence only:
1. **Pattern selection** — match existing codebase patterns (cite explorers)
2. **Breaking changes** — list consumers at risk with file evidence
3. **Complexity per area** — merged Cynefin tags

### Step 5: Atomic Execution Steps

Numbered steps. Each must be:
- **Isolated** — implementable and verifiable on its own
- **Specific** — e.g. "Update `UserService.ts` to handle null email", not "Fix bug"
- **Evidence-linked** — cites file from Step 3
- **Cynefin-tagged** — Clear / Complicated / Complex
- **Verification-defined** — build, test, or lint command that proves done

**Complex steps** must include an inline probe template:
- Hypothesis, Method (safe-to-fail), Sensing, Acceptance criteria
- Mark: `**Cynefin: Complex — probe required**`

Every file in the merged affected-files list must map to ≥1 step.

### Step 6: Verification (Definition of Done)

1. **Test cases** — 3 per major change (success, failure, edge)
2. **Integration checks** — cross-service flows needing E2E verification
3. **Visual check** — manual UI/log verification

### Step 7: Write and Present the Plan

Write to: `~/.claude/gedeon/plans/{feature-slug}.plan.md`

The plan file **must** open with a YAML frontmatter block — this is the machine-readable schema gc-resume and pipeline writers depend on:

```yaml
---
name: {feature-slug}
overview: "{one-line description of the feature}"
workspace: {absolute path to project root}
branch: {current git branch}
status: pending
todos:
  - id: t1
    description: "{atomic step description}"
    status: pending
---
```

`name:` must equal the filename stem — it is the plan slug. Status values: `pending`, `in_progress`, `completed`, `blocked`. Each atomic step from Step 5 gets one todo entry (`t1`, `t2`, …).

Plan body follows: architecture diagram, merged evidence summary, implementation strategy, atomic steps, verification plan.

Confirm the plan is written, then propose preflight as Gedeon.

## Anti-Patterns

- Forwarding the raw user prompt to explorers instead of the Exploration Design Brief
- Starting Step 4 before all explorers finish
- Building on assumptions instead of explorer evidence
- Vague atomic steps ("Fix bug", "Update module")
- Complex steps without probe templates
- Resolving contradictions silently without user visibility

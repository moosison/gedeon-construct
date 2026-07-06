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
// 6. [Pattern]: Pipeline State Gate reads .claude/gc-pipeline.json BEFORE the create-plan stage write. Gate: absent/corrupt→STOP, eop→WARN+confirm, bootstrap/create-plan→proceed, pre-flight/execute/review→WARN+confirm. Stage write happens only after gate passes.

# Create Plan

**Stage 2 of the pipeline.** Gathers evidence from the codebase, then authors a detailed implementation plan with atomic steps, Cynefin tags, and verification criteria.

**Prior stage:** `/gc-bootstrap` (carry situational brief into Step 1 for bootstrap reuse)
**Next stage:** `/gc-preflight`

> **Pipeline state:** Three explicit ordered steps — (1) Read `.claude/gc-pipeline.json` for gate (see Pipeline State Gate below), (2) evaluate gate condition, (3) write `{"stage":"create-plan","slug":"<feature-slug>","updatedAt":"<current ISO timestamp>"}` only AFTER gate passes. Never write before the gate evaluates. Create `.claude/` first if absent.
> - If slug argument provided at invocation (e.g., `/gc-plan gc-resume`): write slug at step 3. If slug is refined during Step 7, do a two-step write: initial write at step 3 with invocation slug, then update after Step 7 confirms the final feature-slug.
> - If no slug argument (bare `/gc-plan`): defer step 3 write to immediately after Step 1 (when feature-slug is first formalized in the Design Brief), but only after gate passes.

### Pipeline State Gate

Read `.claude/gc-pipeline.json` before any other action. If the file is absent or unparseable (corrupt JSON), treat the same as absent.

| `stage` value | Action |
| --- | --- |
| File absent or unparseable | **STOP** — "No active session detected. Run `/gc-bootstrap` (lite minimum) first, then return to `/gc-plan`." |
| `"eop"` | **WARN** — "Previous session is closed. Run `/gc-bootstrap` to open a new session — or confirm to continue planning on the same project." Await user confirmation before proceeding. |
| `"bootstrap"` or `"create-plan"` | **Proceed** |
| `"pre-flight"`, `"execute"`, `"review"` | **WARN** — "Pipeline is at stage `{stage}`. You can return to `/gc-{stage}` to continue, or revise the plan here and re-run preflight. Confirm to proceed." Await user confirmation before proceeding. Note: confirming during `execute` or `review` resets execution state — the next `/gc-execute` will start from the revised plan's todos. |
| Any other value | **STOP** — treat as corrupt. "Unrecognized pipeline state. Run `/gc-bootstrap` first." |

> **Recovery note:** gc-resume's recovery dispatch paths always verify `bootstrap` or `create-plan` stage is present before calling gc-plan — the gate's STOP-on-absent will not fire during a valid gc-resume recovery sequence.

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

> **Tooling note:** All file inspection must use dedicated read tools (file reading, pattern search, path matching). Avoid shell commands for read operations — they trigger permission prompts in Claude Code. Reserve shell tools only for operations the dedicated tools cannot perform (e.g. encoding manipulation, process control). Exception: the citation/control-flow/freshness verifier (`hooks/lib/plan-verifier-cli.js`) is a deliberate, sanctioned Bash invocation — it performs a check no dedicated read tool can (comparing structured claims against file content programmatically), not an oversight of this note.

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

Any step that specifies an exact insertion point in an existing file ("insert after line X") or assumes that file's rendering/data structure (single value vs. table, one consumer vs. many) must be verified against that file's **actual current content**, not an earlier bootstrap-stage characterization or an assumed control-flow path. Two real bugs reached execution in one plan this way: an insertion point that sat after an unnoticed earlier `return`, and a file wrongly assumed to render a single-project line when it was actually a cross-project table. Both were missed by four rounds of pre-flight because none of them re-read the target file's full content — they audited the plan's description of it.

**Control-flow verification (exact insertion points):** Any atomic step that specifies an exact insertion point must also state the enclosing function's **entry line number** in the step's text (e.g. "insert after line 42, inside `handleWrite` which begins at line 31"). Before the step counts as finalized, run `node hooks/lib/plan-verifier-cli.js check-control-flow <file> <entryLine> <insertionLine>` via Bash. If the command returns anything other than `CLEAR`, the flagged line(s) must be explicitly addressed in the step's own text (e.g. "line 36's early return exits before the insertion point — rewritten to insert before that return" or a stated reason the flagged line doesn't affect this insertion) before the step is finalized. A step with unaddressed flagged lines is not done — re-scope the insertion point or the step text until `check-control-flow` reports `CLEAR` or every flagged line has an explicit resolution.

**Freshness-hash capture (structure/rendering assumptions):** Any atomic step that depends on a file's current structure or rendering assumption (per the paragraph above) must have its digest captured at plan-authoring time: run `node hooks/lib/plan-verifier-cli.js hash <file>` via Bash and record the result inline in the step's text as `**File hash at plan time:** {digest}`. This is what `/gc-execute`'s dispatch-time freshness check compares against later — a step without this line cannot be freshness-checked before execution.

**Rename/move blast-radius sweep:** Any atomic step that renames or moves a file referenced by its literal filename elsewhere in the codebase must be preceded by a fresh, unconstrained repo-wide search for that filename — not a check limited to consumers a prior round already named. Re-run the same unconstrained search after each plan revision; a fix scoped only to previously-flagged consumers will miss new ones exactly as easily as the first pass did. Classify every hit as either in-scope (must update) or explicitly out-of-scope (name why — e.g. a destination-path reference vs. a source-path reference).

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

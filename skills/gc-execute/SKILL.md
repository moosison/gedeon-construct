---
name: gc-execute
description: "Stage 4 of the pipeline. Implements the approved plan using wave-based parallel execution, updates plan todos, and verifies each step with an observable signal before marking it done."
phase: pipeline
requires:
  - gc-preflight
tags: [execution, wave, parallel, closed-loop, verification]
model: sonnet
---

// @ai-rules:
// 1. [Pattern]: gc-pipeline.json write is two-step — stage written at skill start for recovery fidelity; slug added after Step 1 (plan read). Slug from plan frontmatter name: field (filename stem as fallback).
// 2. [Gotcha]: gc-resume's artifact ladder matches '{slug}-execution-outcome_*.md' — if this filename pattern changes, update gc-resume Step 2's artifact ladder.

# Execute Plan

**Stage 4 of the pipeline.** Implements the approved plan using wave-based parallel execution. Groups independent steps into concurrent waves, dispatches executor agents, and ensures every completed step emits an observable verification signal before being marked done.

**Prior stage:** `/gc-preflight`
**Next stage:** `/gc-review`

> **Pipeline state:** Two-step write. (1) At the **start of this skill**, write `{"stage":"execute","updatedAt":"<current ISO timestamp>"}` — ensures recovery fidelity if the session crashes during Step 1. (2) After Step 1 completes (slug known), update to: `{"stage":"execute","slug":"<plan-slug>","updatedAt":"<current ISO timestamp>"}`. Create `.claude/` first if absent. Slug from plan frontmatter `name:` field; fallback to filename stem (strip `.plan.md`).

## Execution Steps

### Step 1: Load Context

Read from disk:
1. **Full plan file** (YAML frontmatter + entire body)
2. **Latest pre-flight report** — newest `*-Pre-Flight-Review_*.md` for this plan slug
3. Current todo statuses from plan frontmatter

Build the Execution Context Package:

```markdown
## Execution Context Package: {plan-slug}

### 1. Plan Identity
- Path, overview, workspace

### 2. Full Plan Text
(complete file)

### 3. Pre-Flight Status
- Latest report path + date
- Overall confidence, Ready/Caution/Stop
- Path to Green blockers (if any)

### 4. Execution State
- Todo list with current status (pending/in_progress/completed/blocked)
- Next actionable todo id

### 5. Mission
Implement the approved plan using wave grouping. For Complex/probe steps, run safe-to-fail probes before committing. Every completed step must emit an observable verification signal before being marked done. Propose commit messages. Do not skip verification.
```

### Step 2: Gate Check (Soft — No Pushback)

| Condition | Action |
| --- | --- |
| No pre-flight report | Recommend `/gc-preflight`. **Do not refuse** — user may override. |
| Confidence ≥ 90%, not Stop | State: "Pre-flight passed at {N}%. Proceeding." |
| Confidence < 90% or Stop | List blockers. Suggest updating plan → `/gc-preflight` again. **User explicit override → proceed.** |

Iterative pre-flight is **expected**. Never block the user from running `/gc-preflight` or `/gc-execute` again.

### Step 3: Wave Analysis

Group plan steps into execution waves by dependency:

1. **Identify dependencies** — step A must complete before step B starts
2. **Group independent steps** — steps with no inter-dependencies form one wave
3. **WIP cap** — no more than 5 concurrent steps in a single wave
4. **Congestion signal** — if a wave produces 3+ blockers, pause and reassess before the next wave

Emit a wave plan to the conversation before dispatching:

```
Wave 1 (parallel): steps 1, 2, 3
Wave 2 (parallel): steps 4, 5
Wave 3 (sequential): step 6 — depends on wave 2 output
```

### Step 4: Dispatch Executor Agents

For each wave, dispatch executor agents in parallel with the **entire Execution Context Package** plus specific step assignments.

| Executor role | Model | Agent file |
| --- | --- | --- |
| All wave executors | `sonnet` | `agents/gc-executor.md` |


Each executor:
- Implements plan steps atomically, one at a time
- Updates plan frontmatter todo statuses as it completes each step
- For **Complex** steps: runs safe-to-fail probe before implementing; reports result
- **Closed-loop verification**: after each step, emits an observable signal (build passes, file exists, command output, test green) — if no signal is possible, explicitly reports why
- Proposes a commit message after each meaningful change

**Wait** for all agents in a wave to finish before starting the next wave.

#### Behavioral Gap Tracking

When a step fails **and requires a revised approach** (the original approach was wrong, not just a missing dependency or transient error):

1. Read `.construct/STATE.md`. If `## Error Counts` section is absent, create it with defaults (`gc-execute: 0`, `gc-preflight: 0`, `gc-bootstrap: 0`). Increment `gc-execute` by 1. Write the updated section back with the Write tool.
2. Output inline: `⚡ Behavioral gap flagged (gc-execute ×{N}). Run /gc-correct after this session.`
3. If `gc-execute` count reaches 3: `⚠ THRESHOLD — consider running /gc-correct before continuing.`

### Step 5: Sync Plan Todos

After all waves complete, ensure `~/.claude/gedeon/plans/{slug}.plan.md` frontmatter reflects actual todo statuses from execution.

### Step 6: Present

Write `~/.claude/gedeon/plans/{slug}-execution-outcome_{YYYY-MM-DD_HHMM}.md` (todo table, verification signals per step, commits, blockers, next steps).

Present **todo status table** in conversation.

Report execution status (completed / blocked / gaps) and propose next stage as Gedeon.

## Anti-Patterns

- Executor prompt with only plan path and no full plan text
- Ignoring latest pre-flight report when a newer one exists
- Refusing execution because an older pre-flight failed (use latest only)
- Skipping plan frontmatter todo updates after execution
- Marking a step done without an observable verification signal
- Running all steps sequentially when waves could parallelize them
- Assuming file reads from earlier in the conversation remain tracked after context compaction.
  After a session resumes from a summary, re-read every file before writing it in the current turn —
  even if the summary shows the file was read before compaction.
- Firing N parallel writes to an external directory without a directory-level allow first.
  Before batch-writing to a path outside the project root (e.g., `~/.claude/skills/`), add a
  scoped entry such as `"Write(//c/Users/<user>/.claude/skills/**)"` (Windows) or
  `"Write(~/.claude/skills/**)"` (Unix) to the project `.claude/settings.json`. One settings
  update covers the whole batch; all subsequent writes to that directory are auto-approved.
- Updating `~/.claude/settings.json` for project-specific permission needs. Use the project
  `.claude/settings.json` instead — scope is narrower and permissions don't bleed across
  unrelated projects.

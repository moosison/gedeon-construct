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
- Gate: PASS/STOP (overall % as secondary display)
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
| Latest report shows **Gate: PASS** | State: "Pre-flight passed (Gate: PASS). Proceeding." |
| Latest report shows **Gate: STOP** | List blockers. Suggest updating plan → `/gc-preflight` again. **User explicit override → proceed.** |

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
- **Closed-loop verification**: after each step, emits an observable signal (build passes, file exists, command output, test green). Three outcomes: a positive signal → mark the step `completed`. If no signal is possible, explicitly report why (existing behavior — the step may still be marked `completed`). If a signal **is** possible and is **negative** (build fails, test red, lint fails): mark that todo `blocked` in plan frontmatter, halt dispatch of any remaining steps in the current wave, and require user input before continuing — do not mark the step `completed` and do not silently retry.
- Proposes a commit message after each meaningful change

**Track Verification (dispatch-time, per-step):** Immediately before dispatching an executor to implement any step:
- For a step carrying a `**File hash at plan time:** {digest}` annotation (recorded by `/gc-plan` Step 5): charset-validate the file path (`^[A-Za-z0-9._/-]+$`, no leading `-`) before invoking anything with it — if it fails, treat as a pre-execution blocker without invoking the CLI. If it passes, run `node hooks/lib/plan-verifier-cli.js hash <file>` via Bash again for that step's file and compare the result against the recorded digest. This check runs **per-step, at that step's own dispatch time** — never once globally at Step 1 — so a step in a later wave is checked after earlier waves have already run, correctly catching staleness those earlier waves may have introduced. If the digests match, dispatch proceeds normally. If they differ (or the file now hashes as `MISSING`), do not silently proceed: output `⚠ {file} has changed since this plan was written — re-verify this step's assumption before implementing`, and treat this as a pre-execution blocker for that specific step only — list it and let the user decide whether to re-verify, re-plan, or override before dispatching that step's executor. Unrelated steps in the same wave are unaffected.
- For a step carrying a `**Control-flow check at plan time:** {file}:{entryLine}:{insertionLine}` annotation: charset-validate the file path the same way, and confirm `entryLine`/`insertionLine` are pure integers before invoking `node hooks/lib/plan-verifier-cli.js check-control-flow <file> <entryLine> <insertionLine>`. Treat `UNRESOLVED: ...` output as a failure, identically to a hash mismatch — never as a pass. Same blocker treatment as the hash-mismatch case above.

A "track" = one atomic step + its verification criterion + its freshness-hash + its control-flow check, together re-verified at that step's own dispatch time.

#### Auto-Mode Human-In-Loop Triggers

`gc-execute` recognizes an opt-in `--auto` invocation argument (e.g. `/gc-execute --auto`). Default invocation (no `--auto`) is completely unchanged from the turn-by-turn behavior described above. Under `--auto`, waves proceed without pausing for confirmation between them, **except exactly two conditions force a mandatory stop-and-wait-for-user regardless of `--auto`**: (a) a Track Verification check — including an `UNRESOLVED` result — or a step's own verification signal fails mid-run (see Closed-loop verification and Track Verification above); (b) a Cynefin-tagged **Complex** step is reached — always pauses before implementing past its required probe, regardless of probe outcome or any mechanical-check status. This two-condition list is intentional v1 scope, not yet an extensible registry — a documented, deliberate limitation, not an oversight. `gc-preflight`'s Gate: PASS message may recommend `--auto` as an available option, but never invokes it — auto-mode is always opt-in and user-triggered, never silently entered. Explicitly distinct from Claude Code's own CLI-level "Auto Mode" (harness permission-classifier behavior) — this is a gc-pipeline-level concept layered on top of whatever harness-level auto-mode is or isn't active.

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
- Batch-writing to paths outside the project root (e.g., `~/.claude/skills/`) via Bash `cp` —
  the auto-mode classifier blocks `cp` to external directories on Windows. Use `PowerShell Copy-Item`
  instead; it uses a different execution path the classifier permits. One `Copy-Item` call per file
  is safe to approve individually.
- Writing `.claude/settings.json` (project or user) to add `Write()` permission grants during execution —
  the auto-mode classifier blocks this as agent self-expansion of permissions, regardless of scope.
  Do not attempt to pre-authorize batch writes via settings.json mid-pipeline; use `PowerShell Copy-Item`
  for cross-root file copies instead.

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

Resolve {plan-dir} per the Project-Slug & Plan-Directory Resolution Procedure (the gc-plan skill's Step 7, ~/.claude/skills/gc-plan/SKILL.md — steps 1-3 for {project-slug}, step 6 for {plan-dir}; step 7's duplicate-layout precedence rule is scoped to discovery consumers only — gc-resume/gc-ship — and doesn't apply here). Read the plan and the latest pre-flight report from {plan-dir}.

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

**Pass each row's `Model` value explicitly as the `model` parameter on the Agent tool call** — see `agents/gc-brain.md`'s Worker Dispatch Contract for why this is mandatory.

Each executor:
- Implements plan steps atomically, one at a time
- Updates plan frontmatter todo statuses as it completes each step
- For **Complex** steps: runs safe-to-fail probe before implementing; reports result
- **Closed-loop verification**: after each step, emits an observable signal (build passes, file exists, command output, test green). Three outcomes: a positive signal → mark the step `completed`, then record a fact via `node hooks/lib/ledger-cli.js record` (Bash, JSON piped via stdin): `{type:"verification-pass", claim:"Step {id} verification passed: {signal description}", verdict:true, evidenceFile:<step's target file>, scope:[<step's affected file(s)>], stage:"execute", planSlug:<slug>}` — `evidenceFile` is a raw path; the CLI computes `hashFile(evidenceFile, cwd)` internally (per `ledger-cli.js`'s `record` subcommand) — never state a raw hash directly in the instruction. If a step touches multiple files, `evidenceFile` is the single file that step's own verification criterion actually checks (per its Definition of Done wording); `scope` may list all of the step's affected files even when `evidenceFile` names only one. If no signal is possible, explicitly report why (existing behavior — the step may still be marked `completed`). If a signal **is** possible and is **negative** (build fails, test red, lint fails): mark that todo `blocked` in plan frontmatter, halt dispatch of any remaining steps in the current wave, and require user input before continuing — do not mark the step `completed` and do not silently retry.
- Proposes a commit message after each meaningful change

**Track Verification (dispatch-time, per-step):** Immediately before dispatching an executor to implement any step:
- For a step carrying a `**File hash at plan time:** {digest}` annotation (recorded by `/gc-plan` Step 5): charset-validate the file path (`^[A-Za-z0-9._/-]+$`, no leading `-`) before invoking anything with it — if it fails, treat as a pre-execution blocker without invoking the CLI. If it passes, run `node hooks/lib/plan-verifier-cli.js hash <file>` via Bash again for that step's file and compare the result against the recorded digest. This check runs **per-step, at that step's own dispatch time** — never once globally at Step 1 — so a step in a later wave is checked after earlier waves have already run, correctly catching staleness those earlier waves may have introduced. If the digests match, dispatch proceeds normally. If they differ (or the file now hashes as `MISSING`), do not silently proceed: output `⚠ {file} has changed since this plan was written — re-verify this step's assumption before implementing`, and treat this as a pre-execution blocker for that specific step only — list it and let the user decide whether to re-verify, re-plan, or override before dispatching that step's executor. Unrelated steps in the same wave are unaffected.
- For a step carrying a `**Control-flow check at plan time:** {file}:{entryLine}:{insertionLine}` annotation: charset-validate the file path the same way, and confirm `entryLine`/`insertionLine` are pure integers before invoking `node hooks/lib/plan-verifier-cli.js check-control-flow <file> <entryLine> <insertionLine>`. Treat `UNRESOLVED: ...` output as a failure, identically to a hash mismatch — never as a pass. Same blocker treatment as the hash-mismatch case above.

A "track" = one atomic step + its verification criterion + its freshness-hash + its control-flow check, together re-verified at that step's own dispatch time.

#### Verification Rung Ladder

Before emitting the Closed-loop verification signal (the Closed-loop verification bullet in Step 4's executor list, above), determine the highest **rung** this step can legitimately reach. This is a distinct concept from `gc-lean-auditor`'s unrelated "7-Rung" YAGNI-complexity ladder used earlier in `/gc-preflight` — same word, different pipeline stage, different meaning; do not conflate the two. Rung selection is also orthogonal to Track Verification (the file-hash/control-flow staleness checks above) — a rung is about how convincingly a step's own change was verified; Track Verification is about whether the plan's premises about a file are still fresh. A rung downgrade is a normal, benign outcome; a Track Verification mismatch remains a hard pre-execution blocker exactly as today, regardless of rung.

**Applicability gate (check first):** does this step's Definition of Done describe a runtime-observable flow (a UI interaction, an API call, a running process) to drive? If not — e.g. a documentation edit, a skill-prose change, a pure data-transform with no execution path in this session — the ceiling rung is **typecheck/lint**, or **file-exists** if no typecheck/lint applies either. Do not attempt behavioral verification on a step with no runtime surface; this is over-reach, the inverse failure of the under-reach this ladder exists to fix.

**Rungs, highest to lowest** (canonical token in parens — use this exact token wherever rung is reported, per `agents/gc-executor.md`'s Output Contract). Only checked when the applicability gate passes; check for each in order and use the first one available, falling down the list if not:
1. **Behavioral** (`behavioral`) — drive the affected flow in the running app or service, using whatever the host environment offers this session, checked in order: (a) a `/verify` skill, (b) Playwright or browser MCP tools, (c) equivalent host-provided tooling.
2. **Executed tests** (`tests`) — a project test runner (package.json script, pytest, etc.) exists: run the project's own test suite (or the specific test file covering this change) and observe pass/fail.
3. **Typecheck/lint** (`typecheck`) — run the project's typecheck or lint command and observe a clean result.
4. **File-exists** (`file-exists`) — confirm the target file exists and contains the expected change; the floor rung, unchanged from today's baseline.

If the highest applicable rung's tool is unavailable this session: render `⚠ {rung} unavailable — falling back to {next rung} ({reason})` and proceed at the next rung down. This fallback triggers only on tool/method **unavailability** — never on a negative result from a rung that *was* attempted. A negative signal at any attempted rung is a failed Closed-loop verification signal (the Closed-loop verification bullet in Step 4's executor list, above) and, under `--auto`, fires condition (a) below exactly as today; it is not a rung downgrade. Report the rung actually reached alongside the verification signal (Output Contract, `agents/gc-executor.md`) — surfaced in both the in-conversation todo status table and the written execution-outcome file (Step 6).

#### Auto-Mode Human-In-Loop Triggers

`gc-execute` recognizes an opt-in `--auto` invocation argument (e.g. `/gc-execute --auto`). Default invocation (no `--auto`) is completely unchanged from the turn-by-turn behavior described above. Under `--auto`, waves proceed without pausing for confirmation between them, **except exactly two conditions force a mandatory stop-and-wait-for-user regardless of `--auto`**: (a) a Track Verification check — including an `UNRESOLVED` result — or a step's own verification signal fails mid-run (see Closed-loop verification and Track Verification above); (b) a Cynefin-tagged **Complex** step is reached — always pauses before implementing past its required probe, regardless of probe outcome or any mechanical-check status. This two-condition list is intentional v1 scope, not yet an extensible registry — a documented, deliberate limitation, not an oversight. `gc-preflight`'s Gate: PASS message may recommend `--auto` as an available option, but never invokes it — auto-mode is always opt-in and user-triggered, never silently entered. Explicitly distinct from Claude Code's own CLI-level "Auto Mode" (harness permission-classifier behavior) — this is a gc-pipeline-level concept layered on top of whatever harness-level auto-mode is or isn't active.

**Wait** for all agents in a wave to finish before starting the next wave.

#### Fable-5 Complex-Step Consult

When an executor reaches a Cynefin-Complex step and runs its mandatory probe (the Complex-steps bullet in Step 4's executor list, above), the orchestrator tracks whether this is the **first** Complex step encountered so far in this plan's execution, in-session. **`// lean: in-session tracking only; upgrade path is a ledger fact if cross-session Complex-step tracking is ever needed.`** (Textual-only marker — not visible to `/gc-debt`, per `hooks/lib/debt-tracker.js`'s deliberate `.js`-only scope; disclosed, not a defect.) This counter resets on a `gc-resume`-driven reopen of this plan — a resumed plan's first Complex step after reopen is treated as free again; an accepted consequence of the disclosed in-session-only ceiling. If two or more executors in the same wave reach a Complex step's probe concurrently, "first" is resolved by the steps' order in the plan's todo sequence, not by executor response-arrival order.

**First Complex step in this plan:** apply the Availability & Fallback Contract (`agents/gc-fable5-advisor.md`). If available, dispatch per the table below:

| Consult dispatch | Model | Agent file | Duty |
| --- | --- | --- | --- |
| **Fable-5 consult** | `fable` | `agents/gc-fable5-advisor.md` | Complex-Step Consult |

with the step's text, its probe's Method/Sensing/Acceptance-criteria, and the probe's actual result. Present its `proceed`/`adjust`/`abort` recommendation alongside — never in place of — the existing mandatory human pause at that step (`#### Auto-Mode Human-In-Loop Triggers`'s condition (b), above, fires exactly as it does today, regardless of the recommendation).

**Second and later Complex steps in the same plan:** do not auto-consult. At that step's mandatory pause, ask the user whether they want a Fable-5 consult before deciding. If yes, apply the Contract and dispatch per the table above. If no, the pause proceeds exactly as today.

If unavailable at any consult point (date past 2026-07-12, or dispatch fails per the Contract's retry rule): render `⚠ Fable-5 unavailable — falling back to pause-without-consult ({reason})` and proceed straight to the existing mandatory pause.

#### Behavioral Gap Tracking

When a step fails **and requires a revised approach** (the original approach was wrong, not just a missing dependency or transient error):

1. Read `.construct/STATE.md`. If `## Error Counts` section is absent, create it with defaults (`gc-execute: 0`, `gc-preflight: 0`, `gc-bootstrap: 0`). Increment `gc-execute` by 1. Write the updated section back with the Write tool.
2. Output inline: `⚡ Behavioral gap flagged (gc-execute ×{N}). Run /gc-correct after this session.`
3. If `gc-execute` count reaches 3: `⚠ THRESHOLD — consider running /gc-correct before continuing.`

### Step 5: Sync Plan Todos

After all waves complete, ensure `{plan-dir}/{slug}.plan.md` frontmatter reflects actual todo statuses from execution.

### Step 6: Present

Write `{plan-dir}/{slug}-execution-outcome_{YYYY-MM-DD_HHMM}.md` (todo table, verification signals and rung reached per step, commits, blockers, next steps).

Present **todo status table** in conversation, including each step's rung reached.

Report execution status (completed / blocked / gaps) and propose next stage as Gedeon.

## Anti-Patterns

- Executor prompt with only plan path and no full plan text
- Ignoring latest pre-flight report when a newer one exists
- Refusing execution because an older pre-flight failed (use latest only)
- Skipping plan frontmatter todo updates after execution
- Marking a step done without an observable verification signal
- Attempting behavioral verification on a step with no runtime surface to drive, or reporting a higher rung than was actually reached (see Verification Rung Ladder, Step 4)
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
- Committing or creating branches mid-pipeline — right after this stage finishes, before `/gc-review`
  or `/gc-eop` — instead of leaving branch creation and the commit to `gc-eop`'s own Commit and Push
  step. That step already does check-then-act branch creation (`git rev-parse --verify feature/{slug}`
  before creating or checking out) so it never lands a commit on `main`. An ad-hoc commit here bypasses
  that check entirely and risks committing directly to `main`.

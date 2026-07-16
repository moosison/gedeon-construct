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
// 2. [Gotcha]: gc-resume's artifact ladder matches '{slug}-execution-outcome_*.md' — if this filename pattern changes, update gc-resume Step 2's artifact ladder. The `**Report Type: Pause**` mandatory-stop variant (see `#### Pause Persistence (Mandatory-Stop Artifact)`) shares this same filename pattern — it is not a new pattern, only a first-line marker within it.
// 3. [Pattern]: `autoPipeline` in `.claude/gc-pipeline.json` is consume-on-read — Pipeline-state write (1) captures its pre-override value as `wasAutoPipeline` then unconditionally clears the field to `false`; `wasAutoPipeline: true` is an activation source for auto-mode equivalent to the literal `--auto` flag (see Auto-Mode Human-In-Loop Triggers).
// 4. [Pattern]: Phase-record upsert at write (2) only — .construct/pipelines/{slug}.json, canonical mechanism (incl. slug validation and sessionId sourcing) in gc-plan's Pipeline state blockquote.
// 5. [Pattern]: Step 1.5 enumerates .construct/pipelines/*.json for other active pipelines — branch-collision + dirty-tree checks may offer the Park Procedure (gc-resume/SKILL.md, canonical); affectedFiles overlap is advisory-only and never blocks. See Step 1.5 for the full mechanism.

# Execute Plan

**Stage 4 of the pipeline.** Implements the approved plan using wave-based parallel execution. Groups independent steps into concurrent waves, dispatches executor agents, and ensures every completed step emits an observable verification signal before being marked done.

**Prior stage:** `/gc-preflight`
**Next stage:** `/gc-review`

> **Pipeline state:** Two-step, generic read-merge-write (the canonical mechanism `gc-plan/SKILL.md`'s `> **Pipeline state:**` blockquote establishes, item 2 of its Definition of Done). (1) At the **start of this skill**, read the existing `.claude/gc-pipeline.json` first (tolerating absent/corrupt as an empty object to merge into) — capture the pre-override `autoPipeline` value into local, in-turn orchestrator memory as `wasAutoPipeline` (used below, in Auto-Mode Human-In-Loop Triggers, to decide whether this invocation's waves run in auto-mode) — then spread every existing key forward and override `stage`, `updatedAt`, and unconditionally `autoPipeline: false` (this write always clears the field as part of the merge, whether or not it was ever `true` — the same consume-on-read clear `gc-preflight`'s own Step 1 performs, applied here so a later bare `/gc-execute` resume, after either of this skill's own two pause conditions, correctly does not silently re-enter auto-mode). This ensures recovery fidelity if the session crashes during Step 1. (2) After Step 1 completes (slug known), same generic-merge pattern: read the existing `.claude/gc-pipeline.json`, spread every existing key forward, override `stage`, `slug`, `updatedAt` — `autoPipeline` needs no further action in this second write, since write (1) already cleared it and this write doesn't re-arm anything (`gc-execute` is the cascade's terminal stage; nothing re-invokes it automatically). Create `.claude/` first if absent. Slug from plan frontmatter `name:` field; fallback to filename stem (strip `.plan.md`).
>
> **Disclosed asymmetry (Fable-5 escalation synthesis, Round 3):** unlike `gc-preflight`'s own durable, disk-backed record of its auto-continuation state (its Confidence Dashboard report line), this skill's `wasAutoPipeline` has no durable record — it lives in context memory across this invocation's own wave-dispatch span. If context compaction ever loses it mid-invocation, the failure direction is fail-safe, not unsafe: waves fall back to ordinary per-wave pause-and-confirm behavior, the same as if `--auto` had never been passed — auto-mode silently *exits* under memory loss, never silently *persists*. Accepted as a v1 limitation (YAGNI: this skill's span between capture and use is materially shorter than `gc-preflight`'s 4-6-auditor-dispatch span that motivated its own durable-record fix, so the same hardening isn't proportionate here) rather than mirrored with a matching durable-record mechanism.
>
> **Phase record:** at write (2) — slug known — perform the Phase-record upsert per the canonical definition in `gc-plan/SKILL.md`'s Pipeline state blockquote against `.construct/pipelines/{slug}.json` (create-if-absent; `sessionId` from `.claude/gc-session.json` per that canonical definition — not an output of any resolution step — `planDir` from Step 1's plan-dir resolution). Write (1) performs no record action (slug unknown).

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

### Step 1.5: Concurrency Gate Check

Glob `.construct/pipelines/*.json`. If `.construct/pipelines/` does not exist, skip this entire step silently and proceed to Step 2 — this workspace has no active-phase enumeration to check against. For each file found: extract the slug from the filename stem and apply `gc-plan/SKILL.md`'s canonical Phase-record Slug validation rule **in full** — charset full-match (`^[a-z0-9][a-z0-9._-]*$`) **and** its mandated rejection of any `..` occurrence, `/`, `\`, empty/whitespace-only values, and absolute/drive-letter forms; the charset alone is not a containment check. A rejected filename is skipped silently, the same tolerate-corruption posture every other phase-record consumer already applies. Parse the file as JSON, tolerating absent/corrupt as "skip this record silently." **Exclude this plan's own record** — slug equal to this plan's own frontmatter `name:` field (already loaded in Step 1). If this plan's own record does not exist yet (its own `gc-plan`/`gc-execute` phase-record upsert may not have run yet this session), there is nothing to exclude and every record found is already an "other" pipeline by construction — no special-casing needed.

For each remaining ("other") record, two independent checks:

- **Branch-collision check:** run `git rev-parse --abbrev-ref HEAD` via Bash. **On a genuine git-command error** (non-zero exit, or output other than a branch name or the literal `HEAD`): treat as producing zero matches — the same fail-safe direction as the detached-HEAD case below — and proceed as if no branch-collision check ran for this record; do not attempt the dirty-tree check below without a resolvable HEAD.
  - **Genuine-stacking exclusion:** if the result equals `feature/{other-slug}` **and** that same value also equals this plan's own `branch:` frontmatter field (already loaded in Step 1), this is intentional stacking — this plan was itself created while already on that branch, per `gc-plan/SKILL.md` Step 7's stacking precedent — and must never trigger a park offer. Skip straight to the affectedFiles check below for that record.
  - **Detached HEAD:** if the command returns the literal string `HEAD` (detached state), this safely produces zero matches by design — `HEAD` never equals any `feature/{other-slug}` pattern — not merely a coincidental side effect of string comparison.
  - Otherwise, if the result equals `feature/{other-slug}`, this is a genuine match. HEAD names exactly one branch, so — genuine-stacking exclusion aside — at most one other record can match.
- **Dirty-tree invariant check (only meaningful together with a genuine branch-collision match above, i.e. not excluded by stacking):** run `git status --porcelain` via Bash — the identical convention `gc-resume/SKILL.md`'s Park Procedure step (2) already uses. **On a genuine git-command error:** treat as a clean tree (no offer) — the same fail-safe direction as the branch-collision check's own error handling above. If the tree is dirty AND the branch-collision check matched: this violates the standing invariant that at most one pipeline's uncommitted edits exist in the tree at any moment. Surface this to the user and offer — *"The working tree has uncommitted changes and HEAD is on pipeline `{other-slug}`'s branch (`feature/{other-slug}`), not this plan's own. Park `{other-slug}` properly before continuing?"* Three outcomes:
  - **On confirmation, Park Procedure succeeds** (canonical definition, `gc-resume/SKILL.md`, invoked with `{parked-slug}={other-slug}`, `{target-slug}=` this plan's own `name:` — expected to already have its own `feature/{target-slug}` branch from `gc-plan` Step 7, the normal case for any plan that has reached `gc-execute`, so the Park Procedure's step (6) "already exists" path is what fires here in practice; its "does NOT exist" path remains a safe, unmodified fallback regardless): proceed to Step 2 (or the next remaining record's checks, if any) exactly as the decline branch does — a successful, user-approved park has resolved the invariant violation, so there is nothing further to gate on for this record.
  - **On confirmation, Park Procedure aborts** (per its own commit/checkout failure handling): halt this entire `gc-execute` invocation — do not proceed to Step 2, Step 3, or Step 4 — mirroring `gc-plan/SKILL.md` Step 7's identical handling of a failed park (a failed, user-approved park leaves the tree in an uncertain state that must not cascade unattended, including under `--auto`). This hard stop carries no Pause Persistence artifact — analogous to `gc-plan`'s own no-artifact precedent for its equivalent abort case, since no execution progress yet exists at Step 1.5 to persist; it is not one of `#### Pause Persistence (Mandatory-Stop Artifact)`'s three named trigger conditions.
  - **On decline:** proceed to Step 2 anyway without parking — this gate surfaces conversationally and never blocks, consistent with every other check in this step.

Independently of the two checks above, and able to match several other records simultaneously (purely advisory, so no ordering or precedence is needed):

- **affectedFiles overlap check:** resolve `{other-slug}`'s plan-dir via the Project-Slug & Plan-Directory Resolution Procedure (`gc-plan/SKILL.md` Step 7, step 6 — existing-plan-run resolution: in-project path first, then legacy-namespaced, then legacy-flat). Read `{other-plan-dir}/{other-slug}.plan.md`. **If the file is not found, or is found but its frontmatter cannot be parsed** (malformed YAML — the other pipeline may have just closed and had its record cleaned up mid-race, the record may be stale, or the file may be mid-write): skip this record's affectedFiles contribution silently — the branch-collision and dirty-tree checks above are the safety-critical path and do not depend on this read. If found and parseable, extract its `workspace:` and `affectedFiles:` frontmatter fields.
  - **Workspace equality gate:** normalize both this plan's own `workspace:` field (already loaded in Step 1) and the other plan's `workspace:` field the same way `gc-resume/SKILL.md`'s own established convention does — lowercase both, replace `\` with `/`, strip trailing `/` — then compare for exact equality. `.construct/pipelines/` is workspace-local, so this should always match in practice; if it doesn't (a corrupted or foreign record), skip the comparison for that pair rather than intersect paths resolved against two different filesystem roots.
  - **Missing-key guard:** if they match, treat an `affectedFiles:` key that is **absent or not a list** (e.g. `null` from an empty YAML value, or any other non-array value) on either side identically to an empty list — no overlap contribution, silent skip — the same posture `hooks/lib/ledger.js`'s own `Array.isArray` guard applies for this exact situation (that guard treats any non-array as "not a list," not only a wholly-missing key — this clause matches that scope exactly). Do not attempt to iterate a key that fails this check.
  - **Entry validation and containment:** otherwise, for each entry on both sides, normalize via `normalizeSlashes` (`hooks/lib/ledger.js`) then apply the same full canonical validation as the slug check above: charset full-match against the `SCOPE_CHARSET` regex value (`/^[A-Za-z0-9._/-]+$/`, the same value `hooks/lib/ledger-cli.js` establishes as this project's convention — cited by value here, not imported as code, since that file exports nothing), **and** reject any entry containing a `..` segment, **and** resolve the entry against its own plan's `workspace:` root and verify the resolved path stays contained within it. Skip any entry that fails any part of this check rather than compare it.
  - **Intersection:** compute the exact-string-equality intersection of the two normalized, validated lists. If non-empty: surface conversationally, e.g. *"Pipeline `{other-slug}` also touches: {list}. Proceeding — this is advisory only."* Never block on this.

This step performs no writes of its own except via the Park Procedure it may invoke — the glob, JSON parses, and other-plan reads are read-only.

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
4. **Congestion signal** — if a wave produces 3+ blockers, pause and reassess before the next wave; write the `**Report Type: Pause**` outcome variant per `#### Pause Persistence (Mandatory-Stop Artifact)` before presenting the pause to the user

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

**Budget mode:** read the plan's frontmatter `budget:` value (absent key or any value other than `low` → treat as `normal`). If `low`, apply the Budget-Mode Mapping (see `agents/gc-brain.md`'s Worker Dispatch Contract) to each executor row's Model value before dispatching each wave.

Each executor:
- Implements plan steps atomically, one at a time
- Updates plan frontmatter todo statuses as it completes each step
- For **Complex** steps: runs safe-to-fail probe before implementing; reports result. **If the probe's own Method requires invoking another multi-agent skill** (e.g. running the real `/gc-preflight` against a scratch plan, which itself dispatches its own auditor panel) rather than a script or tool call, the orchestrator should weigh running that probe directly instead of delegating it to this executor — two levels of multi-agent nesting compounds token/turn cost fast and can exhaust the executor's own budget mid-probe before it reaches its own merge/report step, leaving a truncated result that looks "completed" but isn't. If delegated anyway, keep any nested panel this dispatch itself spawns as small as the mechanism under test allows (see `agents/gc-executor.md` for guidance on reduced-panel probes against disposable fixtures).
- **Closed-loop verification**: after each step, emits an observable signal (build passes, file exists, command output, test green). Three outcomes: a positive signal → mark the step `completed`, then record a fact via `node hooks/lib/ledger-cli.js record` (Bash, JSON piped via stdin): `{type:"verification-pass", claim:"Step {id} verification passed: {signal description}", verdict:true, evidenceFile:<step's target file>, scope:[<step's affected file(s)>], stage:"execute", planSlug:<slug>}` — `evidenceFile` is a raw path; the CLI computes `hashFile(evidenceFile, cwd)` internally (per `ledger-cli.js`'s `record` subcommand) — never state a raw hash directly in the instruction. If a step touches multiple files, `evidenceFile` is the single file that step's own verification criterion actually checks (per its Definition of Done wording); `scope` may list all of the step's affected files even when `evidenceFile` names only one. If no signal is possible, explicitly report why (existing behavior — the step may still be marked `completed`). If a signal **is** possible and is **negative** (build fails, test red, lint fails): mark that todo `blocked` in plan frontmatter, halt dispatch of any remaining steps in the current wave, and require user input before continuing — do not mark the step `completed` and do not silently retry. Write the `**Report Type: Pause**` outcome variant per `#### Pause Persistence (Mandatory-Stop Artifact)` before requiring that input.
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

`gc-execute` recognizes an opt-in `--auto` invocation argument (e.g. `/gc-execute --auto`), **or a `wasAutoPipeline` value of `true`** (captured from `.claude/gc-pipeline.json`'s `autoPipeline` field during this skill's own Step-1 read, per its Pipeline State write instruction) **as an equivalent activation source** — either satisfies the same auto-mode entry requirement below. This does not create a third pause condition or change the existing two — it only changes how auto-mode gets entered, exactly as `gc-plan`'s and `gc-preflight`'s equivalently-scoped changes are. Default invocation (no `--auto`) is completely unchanged from the turn-by-turn behavior described above. Under `--auto`, waves proceed without pausing for confirmation between them, **except exactly two conditions force a mandatory stop-and-wait-for-user regardless of `--auto`**: (a) a Track Verification check — including an `UNRESOLVED` result — or a step's own verification signal fails mid-run (see Closed-loop verification and Track Verification above); (b) a Cynefin-tagged **Complex** step is reached — always pauses before implementing past its required probe, regardless of probe outcome or any mechanical-check status. Both conditions write the `**Report Type: Pause**` outcome variant per `#### Pause Persistence (Mandatory-Stop Artifact)` before the stop is presented. This two-condition list is intentional v1 scope, not yet an extensible registry — a documented, deliberate limitation, not an oversight. `gc-preflight`'s Gate: PASS message may recommend `--auto` as an available option, but never invokes it — auto-mode is always opt-in and user-triggered, never silently entered. Explicitly distinct from Claude Code's own CLI-level "Auto Mode" (harness permission-classifier behavior) — this is a gc-pipeline-level concept layered on top of whatever harness-level auto-mode is or isn't active.

**Wait** for all agents in a wave to finish before starting the next wave.

#### Fable-5 Complex-Step Consult

When an executor reaches a Cynefin-Complex step and runs its mandatory probe (the Complex-steps bullet in Step 4's executor list, above), the orchestrator tracks whether this is the **first** Complex step encountered so far in this plan's execution, in-session. **`// lean: in-session tracking only; upgrade path is a ledger fact if cross-session Complex-step tracking is ever needed.`** (Textual-only marker — not visible to `/gc-debt`, per `hooks/lib/debt-tracker.js`'s deliberate `.js`-only scope; disclosed, not a defect.) This counter resets on a `gc-resume`-driven reopen of this plan — a resumed plan's first Complex step after reopen is treated as free again; an accepted consequence of the disclosed in-session-only ceiling. If two or more executors in the same wave reach a Complex step's probe concurrently, "first" is resolved by the steps' order in the plan's todo sequence, not by executor response-arrival order.

**First Complex step in this plan:** apply the Availability & Fallback Contract (`agents/gc-fable5-advisor.md`). If available, dispatch per the table below:

| Consult dispatch | Model | Agent file | Duty |
| --- | --- | --- | --- |
| **Fable-5 consult** | `fable` | `agents/gc-fable5-advisor.md` | Complex-Step Consult |

with the step's text, its probe's Method/Sensing/Acceptance-criteria, and the probe's actual result. Present its `proceed`/`adjust`/`abort` recommendation alongside — never in place of — the existing mandatory human pause at that step (`#### Auto-Mode Human-In-Loop Triggers`'s condition (b), above, fires exactly as it does today, regardless of the recommendation). The recommendation and its rationale become part of the `**Report Type: Pause**` payload written per `#### Pause Persistence (Mandatory-Stop Artifact)`.

**Second and later Complex steps in the same plan:** do not auto-consult. At that step's mandatory pause, ask the user whether they want a Fable-5 consult before deciding. If yes, apply the Contract and dispatch per the table above. If no, the pause proceeds exactly as today.

If unavailable at any consult point (date past 2026-07-19, or dispatch fails per the Contract's retry rule): render `⚠ Fable-5 unavailable — falling back to pause-without-consult ({reason})` and proceed straight to the existing mandatory pause.

#### Pause Persistence (Mandatory-Stop Artifact)

Every mandatory stop-and-wait-for-user condition below leaves a durable record before control returns to the user — the pause reason and any probe evidence must survive a session that ends right there.

1. **Trigger:** any mandatory stop — condition (a) (a Track Verification check or a step's own verification signal fails, per the Closed-loop verification bullet in Step 4's executor list), condition (b) (a Cynefin-Complex step's pause, per `#### Auto-Mode Human-In-Loop Triggers`), or Step 3's congestion signal (3+ blockers in one wave). Mode-independent — these three stops behave identically under `--auto` and default invocation; ordinary between-wave confirmations in default mode are not mandatory stops and write nothing. **One record per stop turn:** if more than one condition is true at the same wave settle, write ONE record — `Pause Reason:` takes the highest-precedence applicable value (congestion > verification-failure > complex-step-probe) and the `## Pause Record` section carries every applicable payload block, so nothing is lost.
2. **Writer & timing:** the orchestrator writes this, never a dispatched executor. Wave-wait semantics are unchanged — when a stop fires mid-wave, wait for already-dispatched sibling executors in that wave to finish, then write the Pause record (reflecting the settled wave's todo statuses) in the same turn the stop is presented to the user, so a session that ends at the pause has already persisted it.
3. **Artifact:** `{plan-dir}/{slug}-execution-outcome_{YYYY-MM-DD_HHMM}.md` — the same filename Step 6 writes. First line, before any other content: `**Report Type: Pause**` (exactly the Escalation Report marker precedent — see `gc-preflight/SKILL.md`'s "On successful escalation dispatch" paragraph; reusing the standard filename keeps gc-resume's artifact-ladder match, mtime ordering, and ledger `evidenceFile` resolution working unchanged). Then a header block: `# Execution Outcome: {slug}`, `**Date:** ... | **Mode:** ...` (Step 6's format), `**Pause Reason:** verification-failure | complex-step-probe | congestion`, `**Paused At Step:** {todo id(s)}`. Then the standard todo status table (status + rung reached for steps executed so far). Then a `## Pause Record` section whose payload varies by reason: *complex-step-probe* → the probe's Method/Sensing/Acceptance criteria and its actual result, transcribed verbatim from the executor's `**Probe result**` output block (`agents/gc-executor.md`'s Output Contract), the Fable-5 recommendation + rationale if a consult ran (state "no consult" otherwise), and the exact question awaiting the user; *verification-failure* → failing step id, rung attempted, the failing signal's output, blocker text; *congestion* → the wave's blocker list.
4. **Filename collision:** if the exact filename already exists (same minute), use the next free minute — treat the timestamp as a time value, not a string, so `:59` carries into the next hour and `23:59` into the next day (the whole date-time advances, never just the minute component).
5. **Repeat stops:** each mandatory stop writes its own new Pause record (new timestamp); Pause records are never edited in place.
6. **Supersession & invariant:** Step 6's final outcome (no Report Type marker, format unchanged) supersedes Pause records by being newest; Pause records remain as history. A Pause record always coexists with ≥1 non-completed todo — a mandatory stop is only reachable with work remaining — which is what keeps gc-resume's "todos[] complete?" branch routing a paused plan to `gc-execute (resume)`.
7. **Expected todo status at pause (display fidelity — no enum change):** a complex-step-probe pause leaves the paused step's todo `in_progress` (an intentional gate, not a failure — the probe ran, implementation is pending); a verification-failure stop leaves the failing step `blocked` (existing Closed-loop rule, unchanged); congestion's 3+ blocker steps are already `blocked`.

#### Behavioral Gap Tracking

When a step fails **and requires a revised approach** (the original approach was wrong, not just a missing dependency or transient error):

1. Read `.construct/STATE.md`. If `## Error Counts` section is absent, create it with defaults (`gc-execute: 0`, `gc-preflight: 0`, `gc-bootstrap: 0`). Increment `gc-execute` by 1. Write the updated section back with the Write tool.
2. Output inline: `⚡ Behavioral gap flagged (gc-execute ×{N}). Run /gc-correct after this session.`
3. If `gc-execute` count reaches 3: `⚠ THRESHOLD — consider running /gc-correct before continuing.`

### Step 5: Sync Plan Todos

After all waves complete, ensure `{plan-dir}/{slug}.plan.md` frontmatter reflects actual todo statuses from execution.

### Step 6: Present

Write `{plan-dir}/{slug}-execution-outcome_{YYYY-MM-DD_HHMM}.md` (todo table, verification signals and rung reached per step, commits, blockers, next steps). This final-outcome write supersedes any earlier `**Report Type: Pause**` records for this plan by recency (per `#### Pause Persistence (Mandatory-Stop Artifact)`'s Supersession & invariant item) and applies that same subsection's filename-collision rule if it lands in the same minute as an existing file.

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
- Committing mid-pipeline — right after this stage finishes, before `/gc-review`
  or `/gc-eop` — instead of leaving the commit to `gc-eop`'s own Commit and Push
  step. That step does check-then-act branch handling (`git rev-parse --verify feature/{slug}`
  before creating or checking out) so it never lands a commit on `main`. An ad-hoc commit here bypasses
  that check entirely and risks committing directly to `main`. (Branch *creation* is no longer
  mid-pipeline work at all — `gc-plan` Step 7 creates `feature/{feature-slug}` at slug-mint time,
  per the 2026-07-12 user decision; by this stage the branch should already exist.)

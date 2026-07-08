---
name: gc-eop
description: "Stage 6 (End of Pipeline) — terminal stage. Extracts durable learnings from the session and writes them to memory, then produces a session digest for future context. Run after /gc-review."
phase: pipeline
requires:
  - gc-review
tags: [eop, memory, learnings, session-digest]
model: sonnet
---

// @ai-rules:
// 1. [Constraint]: Do NOT use the 6-step inline gc-correct workflow. Delegate to gc-correct skill.
// 2. [Pattern]: Delegation includes caller context phrase 'invoked from inside gc-eop's closing sequence'.
// 3. [Gotcha]: After gc-correct signals complete, proceed to pipeline-complete — do not re-trigger gap gate.
// 4. [Pattern]: Commit and push runs AFTER the behavioral gap gate resolves (post-gc-correct or skipped) — one commit captures all session changes including any skill patches.
// 5. [Pattern]: gc-pipeline.json write includes "slug" field. Preferred slug source: read gc-pipeline.json (carries slug after t1–t4 write it). Fallback chain: ARGUMENTS, plan frontmatter name: field, filename stem.
// 6. [Gotcha]: gc-resume's artifact ladder matches '{slug}-session-digest_*.md' — if this filename pattern changes, update gc-resume Step 2's artifact ladder.
// 7. [Pattern]: Step 2b writes humanStatus: "Closed: {plan-slug}" to index.json after Step 2. Use read→merge→write preserving ALL existing fields. humanStatus uses the PLAN slug (name: in plan frontmatter = slug in gc-pipeline.json), not the project slug from config.json.
// 8. [Pattern]: Commit and Push creates feature/{plan-slug} branch BEFORE staging or committing (check-then-act: rev-parse --verify first). Never commit to main. PR creation delegates to /gc-ship — do not add gh pr create here.
// 9. [Pattern]: Step 2c writes .construct/brief-cache.json after humanStatus write. (consumed by gc-morning Step 4)
//    Always use FRESH reads for both ROADMAP.md and STATE.md in Step 2c — do NOT
//    reuse Step 1b content (context compaction between Step 1b and Step 2c is real).
//    Use ABSOLUTE path: {project.path}/.construct/brief-cache.json — derive
//    {project.path} from the index.json entry (`path` field) already read in Step 2b.
//    Skip Step 2c silently if .construct/ROADMAP.md does not exist.

# End of Pipeline (EOP)

**Stage 6 of the pipeline — terminal.** Captures session learnings and produces a context digest that bridges this session to the next.

**Prior stage:** `/gc-review` complete (or user explicitly closing the pipeline early).

> **Pipeline state:** At the start of this skill, write `{"stage":"eop","slug":"<plan-slug>","updatedAt":"<current ISO timestamp>"}` to `.claude/gc-pipeline.json` in the current project directory. Create `.claude/` first if absent. Preferred slug source: read gc-pipeline.json (carries slug after t1–t4 write it); fallback chain: ARGUMENTS, plan frontmatter `name:` field, filename stem.

## Execution Steps

### Step 1: Continual Learning Extraction

Mine the **current session transcript** for durable, cross-session learnings.

#### What qualifies as a learning

| Category | Example |
| --- | --- |
| **User preferences** | Commit style, review gate behavior, naming conventions |
| **Workspace facts** | New standing epics, endpoint changes, repo paths |
| **Workflow patterns** | "Always do X before Y", "Skip Z when condition" |
| **Tool/API discoveries** | "Field X is actually named Y in Cloud", rate limits |
| **Anti-patterns observed** | Approaches that failed and why |

#### What does NOT qualify

- Transient state (today's date, current branch, one-off flags)
- Task-specific details already captured in plan/review artifacts
- Opinions not validated by evidence in the session

#### Extraction procedure

1. **Scan the session** for decisions, corrections, surprises, and repeated patterns.
2. **Draft delta** — new bullet points or updates to existing ones.
3. **Deduplicate** — check existing memory; skip if already present.
4. **Apply** — save durable learnings to Claude Code memory (use the memory system).
5. **Report** — show the user what was added/changed.

If the session produced no durable learnings: state *"No new learnings to extract."* and proceed to Step 2.

### Step 1b: STATE.md Appendages

After extracting learnings, append to the project's `.construct/STATE.md`:

**Append to `## Codebase Patterns`:**
Synthesize the session's key codebase learnings (confirmed patterns, gotchas, architectural facts). Read the current STATE.md, then append:
```markdown
### {ISO date} — {plan-slug}
- {pattern or gotcha discovered this session}
- {confirmed architectural fact}
```

**Append to `## Session History`:**
```markdown
### {ISO date} — {plan-slug}
Stage: {stage reached} | Steps: {completed}/{total} | Blockers: {count}
Gate: {ledger-sourced PASS|STOP, or "not available (no ledger entry)"}
Summary: {one sentence of what was accomplished}
```

**Sourcing the `Gate:` line (mechanical, additive — new capability, does not replace or remove `Stage:`/`Summary:`):** Run `node hooks/lib/ledger-cli.js pull` via Bash, piping the plan's affected-files list (the Design Brief's merged list from gc-plan Step 3) as a JSON array on stdin — never as a `--scope` shell argument. Filter the returned array to facts where `type === "gate-verdict"`; if more than one qualifies, take the one with the latest `verifiedAt`. Render its `verdict` (`true` → `PASS`, `false` → `STOP`) as this line's value. If the pull returns `[]`, or no `gate-verdict` fact survives the filter (ledger absent, or a pre-ledger-era session): render `Gate: not available (no ledger entry)`.

If either section is absent from STATE.md, create it before appending.

**Update `## Error Counts`:** If any errors occurred this session (visible from the error count entries), leave them as-is — gc-correct resets them when patched.

Write the updated STATE.md back with the Write tool.

### Step 1c: Update Global Project Index

Read `~/.claude/gedeon/projects/index.json`. Find this project's entry by slug. Update `lastActive` to the current ISO date and `phase` to the current pipeline stage. Write back with the Write tool.

### Step 1d: Write Phase SUMMARY.md

Write a completion marker so `/gc-progress` can compute phase completion %.

Path: `.construct/phases/{plan-slug}/SUMMARY.md` — create the directory if absent.

```markdown
# Phase Summary: {plan-slug}

**Completed:** {ISO date}
**Outcome:** {one sentence — same as the Session History summary}
**Gate:** {ledger-sourced PASS|STOP, or "not available (no ledger entry)"}
**Stages reached:** {comma-separated list of pipeline stages completed this run}
```

**Sourcing the `Gate:` field (mechanical, additive — new capability, does not replace or remove `Outcome:`):** Run `node hooks/lib/ledger-cli.js pull` via Bash, piping the plan's affected-files list (the Design Brief's merged list from gc-plan Step 3) as a JSON array on stdin — never as a `--scope` shell argument. Filter the returned array to facts where `type === "gate-verdict"`; if more than one qualifies, take the one with the latest `verifiedAt`. Render its `verdict` (`true` → `PASS`, `false` → `STOP`) as this field's value. If the pull returns `[]`, or no `gate-verdict` fact survives the filter (ledger absent, or a pre-ledger-era session): render `Gate: not available (no ledger entry)`.

If `.construct/` does not exist in the current project (gc-new-project was never run), skip silently.

### Step 2: Context Compression

Produce a **session digest** — a compressed summary that bridges this session to the next.

```markdown
## Session Digest: {date} — {one-line intent}

### Pipeline stages completed
- /gc-bootstrap: {outcome}
- /gc-plan: {plan slug}
- /gc-preflight: {Gate: PASS|STOP}, {confidence%} (display only), {run count}

**Sourcing the Gate value on this line (mechanical, non-optional — replaces prose-extraction):** Run `node hooks/lib/ledger-cli.js pull` via Bash, piping the plan's affected-files list (the Design Brief's merged list from gc-plan Step 3) as a JSON array on stdin — never as a `--scope` shell argument. Filter the returned array to facts where `type === "gate-verdict"`; if more than one qualifies, take the one with the latest `verifiedAt`. Use that fact's `verdict` (`true` → `PASS`, `false` → `STOP`) as the authoritative value for `{Gate: PASS|STOP}` — do not derive it by reading the latest Pre-Flight-Review report's prose. This replaces the prior prose-extraction method, the exact spot implicated in a real incident where the digest read PASS while the actual report said STOP.

If the pull returns `[]`, or no `gate-verdict` fact survives the filter (ledger absent, or a pre-ledger-era session): fall back to reading the latest Pre-Flight-Review report's `**Gate: PASS**`/`**Gate: STOP**` line directly, and append the literal string `(legacy-sourced — no matching ledger entry)` immediately after the rendered value, so a future `/gc-resume` can grep for it to distinguish ledger-backed digests from pre-migration ones.

- /gc-execute: {outcome}
- /gc-review: {verdict}

### Session Usage
Read `.construct/USAGE.json`'s `currentSession` object (fresh read — do not reuse earlier reads from this session). Render verbatim, with no arithmetic performed here:
- Tokens: `{totals.totalTokens}` ({totals.inputTokens} in / {totals.outputTokens} out / {totals.cacheCreationTokens} cache-write / {totals.cacheReadTokens} cache-read)
- Estimated cost: `${totals.estimatedCostUsd}` (formatted to 4 decimal places) — if `totals.unpriced` is `true`, append " (partial — one or more models below have no pricing entry; their tokens are real but excluded from this total)".
- Elapsed: `{elapsedSeconds}` formatted as `Xm Ys`
- Optionally list `byModel` entries as supporting detail, one line per model. For any entry with `unpriced: true`, render its cost as "not tracked — no pricing entry" instead of `$0.0000`.
- Caveat (always include, verbatim): "estimated — derived from session transcript data; excludes this closing message's own usage (recorded on the next Stop event, but not necessarily displayed anywhere until a later /gc-eop runs)."
- Staleness (mechanical, additive — an explicit exception to this subsection's "no arithmetic" instruction above, since a timestamp delta is required here). Skip this bullet entirely if `currentSession.lastUpdatedAt` is `null` or absent (can happen if no parsed transcript line carried a valid timestamp) — do not attempt the arithmetic on a missing value. Otherwise:
  1. Get the actual current time via `date -u +%Y-%m-%dT%H:%M:%SZ` (Bash) — do not estimate "now" from context.
  2. Compute the gap in minutes between that and `currentSession.lastUpdatedAt` (the max *transcript-message* timestamp from the last successful Stop-hook write — not a wall-clock write time).
  3. If the gap exceeds 60 minutes, append: "⚠ USAGE.json last updated {N} minutes before this session closed. This is expected after a long subagent dispatch (e.g. `/gc-review`'s reviewer panel) or a multi-stage autonomous run — Stop events don't fire during blocking multi-subagent work. If no such stage ran recently, the Stop hook may not be firing correctly." Do not attempt to determine which case applies — state the gap and the known benign explanation as a fact, and let the user judge.

If `.construct/USAGE.json` is absent or has no `currentSession`, render: "Session Usage: not yet tracked" and skip the rest of this subsection (the `### Session Usage` heading's content only — this does **not** apply to the `### DEBT.json Staleness` section below, which is a separate heading and always runs regardless of USAGE.json's presence).

### DEBT.json Staleness

Runs unconditionally, independent of the `### Session Usage` section above and regardless of whether `USAGE.json` exists — `debt-tracker.js` writes `DEBT.json` unconditionally while `usage-tracker.js` returns early if `.construct` is absent, so the two files can diverge, and this check must not be gated on USAGE.json's presence.

If `.construct/DEBT.json` does not exist, skip silently. If it exists but has no `scannedAt` field, also skip silently (defensive — should not happen in practice). Otherwise:
1. Get the current time via `date -u +%Y-%m-%dT%H:%M:%SZ` (Bash).
2. Compute the gap in minutes against `scannedAt` (a wall-clock write time — a different kind of timestamp than `currentSession.lastUpdatedAt` above, but the same 60-minute threshold applies).
3. If the gap exceeds 60 minutes, append: "⚠ DEBT.json last updated {N} minutes before this session closed. This is expected after a long subagent dispatch (e.g. `/gc-review`'s reviewer panel) or a multi-stage autonomous run — Stop events don't fire during blocking multi-subagent work. If no such stage ran recently, the Stop hook may not be firing correctly." (Same message shape as the USAGE.json check above, with "DEBT.json" in place of "USAGE.json" — `scannedAt` is the field being read, not text that appears in the rendered message.)

### Key decisions made
- {decision 1}
- {decision 2}

### Artifacts produced
| Artifact | Path |
| --- | --- |
| Plan | `{path}` |
| Pre-flight | `{path}` |
| Code review | `{path}` |

### Open threads (carry forward)
- {anything unresolved, deferred, or flagged for next session}
```

Write to: `~/.claude/gedeon/plans/{slug}-session-digest_{YYYY-MM-DD_HHMM}.md`

### Step 2b: Update Project Index with Closed Status

After the session digest is written in Step 2, update this project's entry in `~/.claude/gedeon/projects/index.json`:

1. Read index.json. If the file does not exist, treat it as an empty array `[]`.
2. Find the entry where `slug` matches this project's slug (from config.json, same slug used throughout this session).
3. **If found:** build the merged entry — spread ALL existing fields (preserve `lastActive`, `phase`, `name`, `path`, `teamSize`, and any others) and set `humanStatus: "Closed: {plan-slug}"`.
   **If not found:** append a new entry `{ "slug": "{project-slug}", "lastActive": "{ISO date}", "phase": "eop", "humanStatus": "Closed: {plan-slug}" }`.
4. `{plan-slug}` is the value of the `name:` field from the active plan file's frontmatter — the same slug stored in `.claude/gc-pipeline.json`'s `slug` field written during gc-execute. This is the **plan slug**, not the project slug.
5. Write the updated array back with the Write tool.

### Step 2c: Write Morning Brief Cache

Read `.construct/ROADMAP.md` (fresh read — do NOT reuse Step 1b content). Extract:

- **activeMilestone:** Scan all `## Milestone:` headings in document order. For each, look for `**Status:**` in the next 10 lines (case-insensitive). Take the FIRST heading in document order where Status ≠ Completed; absent Status field = treat as incomplete. If all complete (or no milestones): `null`.
- **milestoneProgress:** `complete` = count all lines matching `- [x]` across entire file; `total` = count all lines matching `- [` across entire file. *(lean: raw checkbox count — includes sub-tasks and code-block examples; scope to active milestone if precision required)*

Read `.construct/STATE.md` (fresh read). Extract blockers:
- If `## Blockers` section absent → `"None"`
- If present but empty/whitespace-only → `"None"`
- If present with content → extract verbatim, trim leading/trailing whitespace

Write `{project.path}/.construct/brief-cache.json` (absolute path — `{project.path}` is the `path` field from the index.json entry found in Step 2b):
```json
{
  "activeMilestone": "<name or null>",
  "milestoneProgress": { "complete": N, "total": M },
  "blockers": "<string>"
}
```

If the Step 2b entry has no `path` field (newly appended project not yet registered with a path): skip Step 2c silently.
If `.construct/ROADMAP.md` does not exist: skip Step 2c silently.
If `.construct/STATE.md` does not exist: set `blockers: "None"` and proceed to write the cache.

---

### Closing — Behavioral Gap Review (Gedeon)

As Gedeon — the pipeline orchestrator — review the session before printing "Pipeline complete". Scan for signals that a skill deviated from its defined behavior during this pipeline run:

| Signal | Examples |
| --- | --- |
| **Wrong approach** | Reversed direction mid-implementation, chose the wrong pattern |
| **Repeated mistake** | Same error type occurred more than once |
| **Skill contract breach** | A skill produced output inconsistent with its SKILL.md definition |
| **User correction required** | User had to redirect, clarify, or override an action |

Report as Gedeon:
- **Gaps found → name what was observed, then invoke gc-correct.** Full session transcript is in context — maximum evidence for gap extraction and skill patching.
- **No gaps → state clearly** ("No skill deviations detected this pipeline run.") and proceed to pipeline-complete.

**Caller context:** gc-correct is being invoked from inside gc-eop's closing sequence. The gc-correct Closing step has a conditional for this case — gc-correct will signal complete without re-proposing /gc-eop.
After gc-correct signals complete with 'Gaps captured and patches applied.', proceed immediately to pipeline-complete — do not re-trigger the review.

### Commit and Push

After the behavioral gap gate resolves (gc-correct complete or skipped), handle session changes based on repository state:

1. **Detect repo state:**
   - Run `git rev-parse --is-inside-work-tree`. If it fails → no git repo (go to step 5).
   - Run `git remote -v`. If output is empty → git repo with no remote configured.

2. **If git repo exists and uncommitted changes exist:**
   - **Resolve plan-slug:** Read from `.claude/gc-pipeline.json` `slug` field (written by gc-plan or gc-execute). Fallback: plan frontmatter `name:` field. Fallback: filename stem of the active plan file. Validate slug matches `[a-z0-9][a-z0-9._-]*`. If unresolvable or invalid: skip branch creation, commit to current branch, set push-target = current branch, note *"No valid plan slug resolved — committed to current branch."*
     **Staleness check (before trusting a syntactically valid gc-pipeline.json slug):** if this session ran no `/gc-plan` and no `/gc-execute` (no new plan file authored, no execution occurred this session), the slug inherited from `gc-pipeline.json` may name a prior, already-completed milestone unrelated to this session's actual work — validating syntax alone does not catch this. In that case, do not reuse it silently: derive a fresh, short, kebab-case slug (matching the same `[a-z0-9][a-z0-9._-]*` pattern) describing this session's actual work, and state which slug was used and why before proceeding to branch creation.
   - **If slug is valid — check branch first** (check-then-act): run `git rev-parse --verify feature/{plan-slug}`.
     - If the check succeeds (branch exists): `git checkout feature/{plan-slug}`; push-target = `feature/{plan-slug}`
     - If the check fails (branch absent): `git checkout -b feature/{plan-slug}`; push-target = `feature/{plan-slug}`
   - Stage tracked-modified project files (exclude `.env`, credential files, secrets). Only add untracked files by explicit path after confirming they are not secrets.
   - Commit with message: `feat({plan-slug}): {one-line summary}` — match type to work done.
   - Append `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

3. **If remote is configured:** push the push-target branch — `git push origin {push-target} -u`.
   If no remote: skip push, note *"Changes committed locally — no remote configured."*

4. **After a successful push to a feature branch:** Emit as the final line of gc-eop output (formatted distinctly, after all other output):
   `NEXT STEP: Changes pushed to {push-target}. Run /gc-ship to open the pull request.`
   If push-target was current branch (slug unresolvable): note the branch pushed; /gc-ship should be run from the correct feature branch if a PR is needed.

5. **If no git repo:** skip entirely, note *"No git repository detected — session changes are local only."*

6. If no uncommitted changes: skip silently.

Signal pipeline complete in Gedeon voice — name the digest path, confirm the commit hash and branch pushed (or local/no-repo status), and ask if anything remains before closing.

## Anti-Patterns

- Storing transient/ephemeral state as "learnings" (branch names, one-off dates)
- Skipping context compression when session was productive
- Writing duplicate entries to memory
- Overwriting existing learnings instead of appending/updating

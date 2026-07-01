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
Summary: {one sentence of what was accomplished}
```

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
**Stages reached:** {comma-separated list of pipeline stages completed this run}
```

If `.construct/` does not exist in the current project (gc-new-project was never run), skip silently.

### Step 2: Context Compression

Produce a **session digest** — a compressed summary that bridges this session to the next.

```markdown
## Session Digest: {date} — {one-line intent}

### Pipeline stages completed
- /gc-bootstrap: {outcome}
- /gc-plan: {plan slug}
- /gc-preflight: {confidence%, run count}
- /gc-execute: {outcome}
- /gc-review: {verdict}

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
   - Run `git rev-parse --is-inside-work-tree`. If it fails → no git repo (go to step 4).
   - Run `git remote -v`. If output is empty → git repo with no remote configured.

2. **If git repo exists and uncommitted changes exist:**
   - Stage modified project files (exclude `.env`, credential files, secrets).
   - Commit with a message derived from the plan slug and session outcome:
     `feat/chore({plan-slug}): {one-line summary}` — match the type to what was done (feat for new behavior, chore for maintenance, fix for corrections).
   - Append `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

3. **If remote is configured:** push to the current branch — `git push origin {current-branch}`.
   If no remote: skip push, note *"Changes committed locally — no remote configured."*

4. **If no git repo:** skip commit and push entirely, note *"No git repository detected — session changes are local only."*

5. If no uncommitted changes at any stage: skip silently.

Signal pipeline complete in Gedeon voice — name the digest path, confirm the commit hash and branch pushed (or local/no-repo status), and ask if anything remains before closing.

## Anti-Patterns

- Storing transient/ephemeral state as "learnings" (branch names, one-off dates)
- Skipping context compression when session was productive
- Writing duplicate entries to memory
- Overwriting existing learnings instead of appending/updating

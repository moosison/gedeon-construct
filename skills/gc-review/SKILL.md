---
name: gc-review
description: "Stage 5 of the pipeline. Runs a multi-reviewer code review panel against changes from /gc-execute. Produces a structured review report with severity-classified findings. Security reviewers mandatory unless diff is docs-only."
phase: pipeline
requires:
  - gc-execute
tags: [review, security, code-quality, pessimistic]
model: sonnet
---

// @ai-rules:
// 1. [Pattern]: @ai-rules gaps noted in Step 1, /gc-shebang proposed in Step 7 closing — not mid-review.
// 2. [Constraint]: Never interrupt the review cycle to generate @ai-rules headers. Post-cycle only.
// 3. [Pattern]: gc-pipeline.json write includes "slug" field derived from plan frontmatter name: field (filename stem as fallback).
// 4. [Gotcha]: gc-resume's artifact ladder matches '{slug}-Code_Review_*.md' — if this filename pattern changes, update gc-resume Step 2's artifact ladder.
// 5. [Gotcha]: Step 2's outcome consumption is a consumer of gc-execute's Pause Persistence producer contract — a first-line `**Report Type: Pause**` marks a Pause record, never a rung-data source (see gc-execute/SKILL.md's Pause Persistence (Mandatory-Stop Artifact) subsection).
// 6. [Pattern]: Phase-record upsert at the pipeline-state write — .construct/pipelines/{slug}.json, canonical mechanism (incl. slug validation and sessionId sourcing) in gc-plan's Pipeline state blockquote.

# Code Review (Pipeline Stage 5)

**Stage 5 of the pipeline.** Runs a specialized review panel against the diff from `/gc-execute`. Produces a structured review report.

**Prior stage:** `/gc-execute`
**Next stage:** `/gc-eop` (if clean) or fix findings → `/gc-preflight` again

> **Pipeline state:** At the start of this skill, write `{"stage":"review","slug":"<plan-slug>","updatedAt":"<current ISO timestamp>"}` to `.claude/gc-pipeline.json` in the current project directory. Create `.claude/` first if absent. Slug from ARGUMENTS or plan frontmatter `name:` field; fallback to filename stem.
>
> **Phase record:** after the flat-file write, perform the Phase-record upsert per the canonical definition in `gc-plan/SKILL.md`'s Pipeline state blockquote against `.construct/pipelines/{slug}.json` (create-if-absent; `sessionId` from `.claude/gc-session.json` per that canonical definition — not an output of any resolution step — `planDir` from Step 2's plan-dir resolution).

## Execution Steps

### Step 1: Diff Scope

1. Identify all modified files (`git diff --staged` or user scope).
2. Read `@ai-rules` headers on every touched file.
   > **2b. Note:** Any file missing an `@ai-rules` header — record it. Add those files to the **Downstream Impact** section of the report (Step 7). After the full review cycle completes and before proposing the next pipeline stage, propose running `/gc-shebang` on those files. Do not pause or interrupt the review to generate headers mid-review.
3. List consumers/callers of modified exports (initial pass).
4. Estimate diff size (lines changed) and domains touched (API, auth, DB, UI, platform, etc.).
5. **Security surface scan** — flag if diff touches: auth/authz, secrets/env, user input parsing, public endpoints, crypto/TLS, SQL/command construction, file/path handling, dependency manifests, logging of sensitive data.

### Step 2: Code Review Context Package

Resolve {plan-dir} per the Project-Slug & Plan-Directory Resolution Procedure (the gc-plan skill's Step 7, ~/.claude/skills/gc-plan/SKILL.md — steps 1-3 for {project-slug}, step 6 for {plan-dir}; step 7's duplicate-layout precedence rule is scoped to discovery consumers only — gc-resume/gc-ship — and doesn't apply here). Read the plan from {plan-dir}/{plan-slug}.plan.md if available. Then gather execution-outcome data — a review can run with none present (e.g. a manual-fix re-review with no fresh `/gc-execute` run):

- **Locate:** enumerate every `{plan-dir}/{slug}-execution-outcome_*.md` for this plan-slug, sorted newest-first by mtime (the outcome family's established sort — gc-resume @ai-rules rule 5; gc-execute's filename-collision rule keeps minutes distinct, so mtime order and filename-timestamp order agree in practice).
- **Selection walk (Pause-variant discrimination):** take the FIRST file whose first line is NOT `**Report Type: Pause**` as the outcome file used for §6's rung data. The newest `**Report Type: Pause**` record, if any exists, is surfaced separately in §6 as an informational line only, never as the rung-data source.
- **Boundary case:** if a `**Report Type: Pause**` record is newest but an older marker-free (final) outcome exists, the older final outcome is used for §6's rung data and will typically be flagged stale by the staleness check below — this is correct, since the diff under review post-dates it.
- **Staleness:** if the chosen outcome file's own mtime predates the diff under review (i.e. the diff was touched after the outcome file was written), treat it as stale: still surface it in Context Package §6, but flag it there as `(stale — predates the diff under review)` rather than presenting it as current data.

```markdown
## Code Review Context Package: {plan-slug}

### 1. Plan Identity
- Plan path, overview
- Full plan text (complete file)
- Pre-flight report summary if available

### 2. Execution Scope
- Which plan todos were implemented
- Commits or summary of changes

### 3. Diff Scope
- Modified files (absolute paths), line count
- Staged diff OR read files + git diff per path
- Hexagonal layer per file (Domain / Port / Adapter / Infrastructure)

### 4. Consumer Map
- Callers/consumers from Step 1

### 5. Review Mission
Review changes against plan intent. System-wide impact, contracts, zero deferred debt. Do not rubber-stamp.

### 6. Execution Outcome (Rung Data)
- Per-step rung reached (from `{slug}-execution-outcome_*.md`, if present): step ID, rung token (`behavioral`/`tests`/`typecheck`/`file-exists`), any fallback/unavailability marker text recorded alongside it
- If no outcome file exists for this plan-slug: state that explicitly — UAT trigger (Step 3) cannot fire without it
- If the located outcome file is stale (predates the diff, per Step 2's lead-in check above): state that explicitly alongside the rung data — the UAT reviewer (Step 3) treats a stale outcome file the same as a silently-accepted low rung (default to re-drive, do not trust stale data as current)
- If only `**Report Type: Pause**` records exist for this plan-slug (no marker-free outcome file found by the Step 2 selection walk): state that explicitly and treat it as "no outcome file" for the UAT trigger — it cannot fire, per this section's own note above — while noting the newest Pause record's `Pause Reason` and `Paused At Step` informationally
```

### Step 3: Review Panel Triage

Select reviewers based on the diff. Always include:

| Reviewer | Model | Agent file | Lens |
| --- | --- | --- | --- |
| **Principal** | `sonnet` | `agents/gc-reviewer.md` | Architecture, contracts, downstream impact |
| **Correctness** | `sonnet` | `agents/gc-reviewer.md` | Logic, edge cases, state bugs |
| **Maintainability** | `sonnet` | `agents/gc-reviewer.md` | Structure, coupling, naming, complexity |
| **Plan Alignment** | `sonnet` | `agents/gc-reviewer.md` | Implementation vs plan todos (skip if no plan) |
| **Security Exploits** | `opus` (security lane) | `agents/gc-reviewer.md` | Auth/authz, injection, input validation, IDOR, SSRF in changed code |
| **Security Audit** | `opus` (security lane) | `agents/gc-reviewer.md` | Secrets/credentials in diff, OWASP patterns, unsafe crypto, sensitive data in logs |

**Pass each row's `Model` value explicitly as the `model` parameter on the Agent tool call** — see `agents/gc-brain.md`'s Worker Dispatch Contract for why this is mandatory. Conditional reviewers use the same `agents/gc-reviewer.md` persona at the `sonnet` tier — pass `model: "sonnet"` explicitly, never left implicit. For a compound Model cell, the token before the parenthetical is the literal value passed as the `model` parameter; the parenthetical is a display/verification marker only, never part of the dispatch value. The paren-form marker `(security lane)` is consumed by `hooks/lib/tier-consistency-check.js` as an exact substring (elevated rows are cross-checked against the persona's `security_lane_model`, and this table's elevated-row count is pinned there) — it is deliberately distinct from the colon-form `(security lane: opus)` documentation cells found in reference tables (e.g. gc-skill-author's); never normalize one form into the other.

**Budget mode:** read the resolved plan's frontmatter `budget:` value (absent key or any value other than `low` → treat as `normal`). If `low`, apply the Budget-Mode Mapping (see `agents/gc-brain.md`'s Worker Dispatch Contract) to every dispatched lens's Model value — table rows and conditional reviewers alike — before dispatch.

**Security reviewers are mandatory** for every run after `/gc-execute`. Only skip if the diff is **docs-only** (markdown, comments, no executable/config changes).

Add conditional reviewers when triggered (all `sonnet`, `agents/gc-reviewer.md`):
- Tests changed or production logic without test updates → Testing reviewer
- API routes, types, serialization → API contract reviewer
- Retries, timeouts, error handling, async handlers → Reliability reviewer
- Queries, loops, caching, I/O-heavy paths → Performance reviewer
- At least one executed step's Definition of Done describes a runtime-observable flow (gc-execute's own Applicability Gate, `gc-execute/SKILL.md`'s Verification Rung Ladder subsection) → **UAT** reviewer (requires a located outcome file — see Context Package §6; without one, this trigger does not fire, per §6's own note)

**UAT reviewer mission:** Dispatch this lens with its lens assignment set to exactly the bare token `UAT` — not an elaborated phrase like the prose lenses above (e.g. not "UAT, re-drive under-verified steps") — since `agents/gc-reviewer.md`'s Hard Rules carve-out requires an exact, non-compound match to grant active-tool permission; an elaborated lens claim is read as compound and silently falls back to read-only, disabling this lens's entire mission. Read the rung data from Context Package §6 (added this phase). A step's expected ceiling rung is determined by applying gc-execute's own Applicability Gate to that step's Definition of Done as written in the plan body (the plan's per-step prose, e.g. under a "**Definition of Done:**" label if present, or the step's own descriptive text if not explicitly labeled — this plan has no separate structured field for it; read the step's own text the same way gc-execute's executor does at execution time).

**Re-drive candidate selection — two independent checks, in order:** (1) **File-level staleness (checked first):** if Context Package §6 flags the outcome file as stale (predates the diff), every step covered by that file is a re-drive candidate, *regardless of its individual recorded rung* — a stale file's data is untrustworthy file-wide, including steps that happened to record a rung at or above their ceiling, not just below-ceiling ones. (2) **Per-step rung deficiency (only when the file is not stale):** for each step whose recorded rung is *below* its expected ceiling AND whose outcome-file entry does not carry a clear, explicit unavailability-fallback marker, independently re-drive that step's flow using gc-execute's own discovery checklist (see `gc-execute/SKILL.md`'s Verification Rung Ladder subsection, item 1 — not restated here to avoid the two descriptions drifting apart). A step whose low rung carries an explicit, unambiguous unavailability marker is exempted from a *repeat* attempt of the same tool but IS still a re-drive candidate using an available alternative tool if the discovery checklist offers one — only a confirmed-unavailable exact tool is skipped, not the whole rung. Report re-drive findings through the normal Findings table (Step 5) — no new severity mechanism needed.

### Step 4: Parallel Reviews

Dispatch all reviewers in one message — all read-only.

Each reviewer receives: full Code Review Context Package + their specific role/lens.

**Wait** for all reviewers before Step 5.

### Step 5: Merge (Pessimistic)

| Rule | Policy |
| --- | --- |
| Risk level | **Highest** across reviewers |
| Findings | **Union** all — tag with reviewer ID |
| Severity (same issue) | **Highest** wins |
| Security findings | Union; **any exploitable issue = HIGH** unless proven false positive with evidence |

Cross-issue correlation: Collapse shared root-cause findings.

Any **HIGH** security finding → overall risk **cannot** be Low; blocks push until fixed or explicitly accepted by user.

#### Systematic Pattern Detector

After merging all findings, check: if the same class of finding (same severity level + same domain: logic / security / typing / performance / naming) appears across 3 or more files, OR the same reviewer flags the same issue type in 2 or more separate findings — add a "Systematic Pattern" block after the findings table:

```
⚠ Systematic pattern detected: {severity} {domain} issue across {N} files.
This may reflect a skill gap, not a one-off mistake.
Run /gc-correct after fixes to prevent recurrence.
```

Before editing this file, read the current findings table format to understand how findings are classified.

### Step 6: Verification Gate

| Check | Result |
| --- | --- |
| Unit tests | pass/fail |
| Typecheck | pass/fail |
| Build | pass/fail |

**Rung reached per step** (from the outcome file, Context Package §6 — display only, source of truth is the outcome file itself, not recomputed here):

| Step | Rung reached | Note |
| --- | --- | --- |
| {step id} | `behavioral`\|`tests`\|`typecheck`\|`file-exists` | fallback marker text, if any |

If no outcome file was available (Context Package §6 states this explicitly), state "No execution-outcome data available for this review" instead of an empty table.

Do NOT approve push if any check fails.

### Step 7: Write and Present

Path: `{plan-dir}/{plan-slug}-Code_Review_{YYYY-MM-DD_HHMM}.md`

Sections: Summary (reviewers + lenses), Downstream Impact, Findings & Fixes (with Flagged By column), Reviewer Disagreements, Verification Gate table.

Paste full report in conversation.

**Post-fix runtime re-sync:** if any in-session finding fix touched a file under `skills/` or `agents/`, re-run the runtime-copy sync for every such file (PowerShell `Copy-Item`, one call per file) and verify per-pair `Get-FileHash` equality before presenting the verdict — a sync performed earlier in the session does not cover post-review fixes. (A 2026-07-12 lapse left `~/.claude/skills/gc-review/SKILL.md` missing an entire merged feature block until the next session's plan-time hash probe caught it.)

Report review verdict (clean or findings with severity summary) and propose next stage as Gedeon.

## Anti-Patterns

- Only one reviewer with a generic lens
- Reviewers without full plan + diff context
- Taking lowest severity (always pessimistic — take highest)
- Skipping security reviewers unless diff is docs-only

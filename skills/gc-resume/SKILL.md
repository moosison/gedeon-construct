---
name: gc-resume
description: "Pipeline recovery skill. Reads gc-pipeline.json + artifact ladder to reconstruct current stage, builds a Recovery Brief, and dispatches into the correct pipeline skill on user confirmation."
phase: pipeline
tags: [recovery, pipeline, resume, orchestrator]
model: sonnet
---

// @ai-rules:
// 1. [Constraint]: Never auto-dispatch — always confirm with user before invoking any pipeline skill via Skill tool.
// 2. [Pattern]: Reconciliation: gc-pipeline.json stage wins when it is further downstream than artifact evidence (pipeline order: bootstrap→create-plan→pre-flight→execute→review→eop); artifact ladder wins when JSON stage is earlier than artifact evidence. When both sources independently produce the same dispatch, proceed without a conflict flag. Flag only when they disagree directionally.
// 3. [Pattern]: Path normalization is mandatory — lowercase both paths, replace \ with /, strip trailing / before workspace comparison.
// 4. [Pattern]: Gate extraction from Pre-Flight-Review: look for `**Gate: (PASS|STOP)**` pattern (primary); fall back to the `**Overall Confidence** N%` row for display only; if both absent, display "gate: unknown".
// 5. [Pattern]: Pre-Flight-Review sort: filename lexicographic on _YYYY-MM-DD_HHMM suffix (not mtime — NTFS mtime unreliable on Windows). All other artifacts: mtime sort.
// 6. [Pattern]: Mid-execute resume: surface ALL pending/in-progress todos (not just "first non-completed"). Wave grouping is re-derived by gc-execute from dependency analysis. When the newest execution-outcome is a `**Report Type: Pause**` record, mid-execute resume also surfaces the Pause Record (reason, paused-at step, payload) in the Recovery Brief — except a `user-initiated-park` record, which never triggers mid-execute-resume surfacing (see Step 3's own exception) and carries no paused-at-step value.

> **Park Procedure (canonical — referenced by name from `gc-plan/SKILL.md` Step 7 and this skill's own Step 0; do not duplicate this text elsewhere, reference this blockquote instead):** Inputs: `{parked-slug}` (the pipeline being vacated), `{target-slug}` (what's being switched to). (1) Resolve `{parked-slug}`'s plan-dir per the Project-Slug & Plan-Directory Resolution Procedure (`gc-plan/SKILL.md` Step 7, using the current workspace). (2) Run `git status --porcelain`. If empty (clean tree): nothing to park — skip to step (6) directly. (3) If non-empty: stage tracked-modified project files, excluding `.env`, credential files, and secrets — the identical staging discipline `gc-eop/SKILL.md`'s own Commit and Push step already applies (its "Stage tracked-modified project files" bullet); add untracked files only by explicit path after confirming they are not secrets. Then `git commit -m "wip(pause): {parked-slug}"`. Never `git add -A` here — a park commit staged that way would also sweep any non-gitignored secret file in the working tree into a commit that may later be pushed while parked; `.construct/`, `.claude/gc-session.json`, and `.claude/gc-pipeline.json` are additionally gitignored, so this staging discipline never touches plan-store or pipeline-state files either way. **If the commit fails** (hook rejection, unconfigured identity, or any non-zero exit): abort the entire procedure, surface the failure to the user, and do not proceed to step (4) — do not attempt step (6)'s checkout with the tree left in an unknown state; the caller (see `gc-plan/SKILL.md`'s Non-default-branch collision check) must not proceed as though the switch happened. (4) Capture `git rev-parse HEAD` as `{sha}`. (5) Write the pause artifact at `{parked-slug's plan-dir}/{parked-slug}-execution-outcome_{YYYY-MM-DD_HHMM}.md`, reusing `gc-execute/SKILL.md`'s `#### Pause Persistence (Mandatory-Stop Artifact)` subsection's filename pattern, first-line `**Report Type: Pause**` marker, and next-free-minute collision rule exactly. New `**Pause Reason:** user-initiated-park` value, extending (not replacing) that subsection's existing `verification-failure | complex-step-probe | congestion` set. Payload (`## Pause Record` section): `**Parked Commit SHA:** {sha}`, `**Switched To:** {target-slug}` — this record carries no `Paused At Step` and no question field, matching the existing precedent that non-complex-step-probe reasons already carry no question field. (6) If `feature/{target-slug}` already exists, `git checkout feature/{target-slug}` — this switches to that branch's own existing history and is unaffected by the branch just parked. **If it does NOT exist, do not branch from the current HEAD** — at this point HEAD is the branch just parked, now sitting at the `wip(pause): {parked-slug}` commit from step (3) if one was made, and a plain `git checkout -b feature/{target-slug}` from there would silently make the parked pipeline's WIP commit an ancestor of the new branch (a real bug found at code review: `gc-plan/SKILL.md` Step 7's own check-then-act convention only ever runs from `main`/`master`, guaranteed by ITS OWN precondition — this procedure's naive reuse of "same convention" dropped that precondition, since it runs immediately after committing on the branch being vacated, not from the default branch). Instead: first `git checkout {default-branch}` (`main`/`master`, detected the same way `gc-plan/SKILL.md` Step 7 does), then `git checkout -b feature/{target-slug}` from there — guaranteeing a newly-created target branch never inherits the parked pipeline's history. **If the checkout fails** (either the default-branch checkout or the final target checkout): surface the failure to the user; the park commit (if step 3 ran) already exists and is safe/recoverable via this same un-park mechanism once the underlying checkout blocker is resolved. Returns: the pause-artifact path (if steps 3-5 ran) and whether a park actually occurred, for the caller to reference.
>
> **Newest-Pause-artifact lookup (canonical — referenced by name from this skill's own Step 0 below and from `gc-eop/SKILL.md`'s Wip-pause reconciliation guard; do not duplicate this text elsewhere, reference this clause instead):** given a `{slug}`, resolve its plan-dir per the Project-Slug & Plan-Directory Resolution Procedure (`gc-plan/SKILL.md` Step 7), then locate `{slug's plan-dir}/{slug}-execution-outcome_*.md` whose first line is `**Report Type: Pause**` and `**Pause Reason:** user-initiated-park`, taking the newest by the next-free-minute/mtime convention `gc-execute/SKILL.md`'s Pause Persistence subsection defines (same tie-break this skill's artifact ladder already uses for outcome files generally). Read its `**Parked Commit SHA:**` value for SHA cross-checking.

# Recover Pipeline

**Recovery skill — stage-agnostic.** Detects where the current pipeline session was interrupted, builds a Recovery Brief, and routes to the correct skill on user confirmation.

**Prior stage:** Any interrupted pipeline stage.
**Next stage:** Determined by reconciliation.

## Execution Steps

### Step 0: Un-park Check

Runs unconditionally on **every** `/gc-resume` invocation, not gated on any argument.

- **Marker match &amp; validation:** if not inside a git work tree, skip silently. Run `git log -1 --pretty=%s`. Check whether the subject carries the literal marker `wip(pause):` — precisely, match against the pattern `^wip\(pause\): ([a-z0-9][a-z0-9._-]*)$`, **and additionally reject the match outright if the captured group contains any `..` occurrence** (the charset alone is not a containment check per `gc-plan/SKILL.md`'s own canonical Slug validation rule — `a..b` passes the charset but must still be rejected). A malformed, malicious, or `..`-bearing subject line simply fails to match rather than reaching path construction. If it doesn't match: no-op, proceed to Step 1 unchanged.
- **Slug resolution:** if it matches, extract `{candidate-slug}`: resolve it to a plan matching this workspace using the same workspace-match logic Step 1 item 4 already uses. If unresolvable: leave history untouched, record "⚠ Unexpected wip(pause) marker at HEAD: `{subject}` — left untouched" for the Recovery Brief, proceed to Step 1.
- **Artifact + SHA cross-check:** if resolvable, perform the Newest-Pause-artifact lookup (canonical, above) for `{candidate-slug}`. If no such artifact is found, or one is found but its `**Parked Commit SHA:**` field is absent/unreadable — a defensive fallback, not a silent-trust default — proceed on subject-match alone, noting "un-parked without SHA confirmation (no matching pause artifact found)" in the Recovery Brief. Otherwise compare the artifact's SHA against the current `git rev-parse HEAD`.
- **Un-park:** if the SHA matches (or the defensive fallback above applies): run `git reset --soft HEAD~1`, record "Un-parked `{candidate-slug}`" for the Recovery Brief.
- **Mismatch handling:** if a SHA was found but does NOT match: leave history untouched, surface "⚠ wip(pause) marker at HEAD names `{candidate-slug}` but its recorded SHA doesn't match HEAD — left untouched" for the Recovery Brief.

### Step 1: Detect Active Plan

1. Read `.claude/gc-pipeline.json`. If absent or corrupt → note "pipeline state unavailable"; proceed with inference only. **Bootstrap short-circuit:** if stage is `bootstrap`, no plan file exists yet — ask: *"Pipeline is at bootstrap stage — no plan written yet. Start a new plan?"* and dispatch gc-plan on confirmation. Skip remaining steps.
2. If `slug` field is present → resolve `{project-slug}` per the Project-Slug & Plan-Directory Resolution Procedure (the gc-plan skill's Step 7, `~/.claude/skills/gc-plan/SKILL.md` — steps 1-3), then check three layouts per step 6's in-project-first/namespaced/legacy-flat-fallback order: `{workspace}/.construct/plans/{slug}.plan.md` first, then `~/.claude/gedeon/plans/{project-slug}/{slug}.plan.md` (namespaced), then `~/.claude/gedeon/plans/{slug}.plan.md` (flat). If any of the three resolves, use this slug directly and skip steps 3–5. Only if **none of the three layouts** has the file (stale slug from a renamed or deleted plan) fall through to steps 3–5. (Step 7's duplicate-layout precedence rule does not apply to this single-known-slug check — it's scoped to discovery consumers only: a check against one already-known slug, not a discovery/glob operation.)
3. Glob three layouts: `{workspace}/.construct/plans/*.plan.md` (in-project), `~/.claude/gedeon/plans/*/*.plan.md` (namespaced, one level), and `~/.claude/gedeon/plans/*.plan.md` (legacy flat) — union all three result sets before item 4's workspace-match filter. Apply the canonical procedure's duplicate-layout precedence rule (the gc-plan skill's Step 7, `~/.claude/skills/gc-plan/SKILL.md`, item 7): if the same slug appears in more than one set, keep only the highest-precedence entry — in-project wins over namespaced wins over flat.
4. Filter by workspace match: read each plan's frontmatter. Try YAML `workspace:` field; fall back to prose `**Workspace:**` pattern. Normalize before comparing: **lowercase both paths, replace all `\` with `/`, strip trailing `/`**.
5. From workspace-matched plans, exclude any where a `{slug}-session-digest_*.md` artifact exists → pipeline already closed.
6. If multiple non-closed candidates remain → sort by mtime, newest is active.
7. If none found → ask: *"No active plan found for this workspace. Which plan are we resuming? (provide slug)"*

### Step 2: Reconcile Stage

Two sources drive reconciliation — index.json exists but is too coarse for plan-level decisions (updated only at gc-eop; one phase per project, not per plan):
1. `gc-pipeline.json` stage (primary — written at each stage start; may lag behind artifacts)
2. Artifact presence ladder (most reliable — reflects what was actually written to disk):

**Stage dispatch from gc-pipeline.json `stage` field:**

| `stage` value | Dispatch |
|---------------|----------|
| `bootstrap` | → gc-plan (no plan file yet) |
| `create-plan` | plan file exists? → gc-preflight : gc-plan |
| `pre-flight` | read latest Pre-Flight-Review; Gate: PASS → gc-execute; Gate: STOP → fix + gc-preflight |
| `execute` | todos[] all complete? → gc-review : gc-execute (resume) |
| `review` | Code_Review artifact exists? → gc-eop : gc-review (resume) |
| `eop` | session-digest exists? → pipeline closed : gc-eop |
| absent / unrecognized | → fall through to artifact ladder |

**Artifact ladder (when gc-pipeline.json is stale or absent):**

All patterns in this table resolve relative to the plan's own resolved `{plan-dir}` — e.g. `{workspace}/.construct/plans/` (wherever its `{slug}.plan.md` was actually found in Step 1 — in-project, namespaced, or flat) — never assume the flat root.

| Newest artifact present (mtime) | Inferred dispatch |
|----------------------------------|-------------------|
| `{slug}-session-digest_*.md` | Pipeline closed → inform user |
| `{slug}-Code_Review_*.md` | gc-eop |
| `{slug}-execution-outcome_*.md` | todos[] complete? → gc-review : gc-execute (resume) |
| `{slug}-Pre-Flight-Review_*.md` | Gate: PASS → gc-execute; Gate: STOP → fix + gc-preflight |
| `{slug}.plan.md` only | gc-preflight |
| Nothing | gc-plan |

An outcome file whose first line is `**Report Type: Pause**` is a Pause record (gc-execute's Pause Persistence subsection); it matches this rung exactly like a final outcome, and because a Pause record always coexists with ≥1 non-completed todo, the existing "todos[] complete?" branch routes it to `gc-execute (resume)` unmodified — **except when its** `**Pause Reason:**` is `user-initiated-park`: that reason is a bystander record, never evidence this pipeline itself progressed — skip it and infer stage from the next-newest non-park artifact instead, per the Voluntary-park exclusion from stage inference guard below.

**Reconciliation:** gc-pipeline.json is primary; artifact ladder is fallback.

- **Cross-pipeline stage staleness guard:** `.claude/gc-pipeline.json` is a single, non-slug-namespaced pointer (confirmed: gitignored, survives branch switches unchanged). Before trusting its `stage` field for reconciliation, confirm its `slug` field equals the slug actually being resumed (the slug Step 0/Step 1 resolved). If they differ: the `stage` value belongs to a different, unrelated pipeline — do not use it; reconcile using the artifact ladder alone for this invocation, exactly as the existing "gc-pipeline.json is stale or absent" fallback already handles.
- **Voluntary-park exclusion from stage inference:** when walking the artifact ladder (the existing "Newest artifact present (mtime)" table), a `{slug}-execution-outcome_*.md` file whose first line is `**Report Type: Pause**` AND whose `**Pause Reason:**` is `user-initiated-park` must be **excluded** from consideration — it is a bystander record and must never be treated as "reached execute stage or later," unlike the 3 existing mandatory-stop Pause reasons (which correctly do imply execute-stage, since they only ever fire mid-`gc-execute`). Skip past it and infer stage from the next-newest artifact that is NOT a `user-initiated-park` record (or "nothing" → `gc-plan`, per the existing ladder's own bottom row, if no other artifact exists).

Pipeline order: bootstrap=0, create-plan=1, pre-flight=2, execute=3, review=4, eop=5.

If they disagree:
- JSON stage index > artifact-inferred → **JSON wins** (stage started; artifact not yet written)
- JSON stage index < artifact-inferred → **artifact ladder wins** (JSON stale)
- Both produce the **same dispatch action** → proceed without conflict flag
- Different dispatch actions at the same stage index, or unresolvable → **flag conflict in Recovery Brief and ask the user**

When artifact ladder wins by more than one stage index ahead of JSON, note informational discrepancy in Source Conflicts.

For multiple Pre-Flight-Review files: sort by **filename lexicographic on `_YYYY-MM-DD_HHMM` suffix** (not mtime — NTFS tunnel cache can preserve original mtime on copy).

### Step 3: Load Artifacts

Based on reconciled stage, load:
- Always: plan frontmatter `todos[]`, `workspace`, `branch`, `overview`
- If preflight exists: latest `{slug}-Pre-Flight-Review_*.md` — extract `**Gate: (PASS|STOP)**` pattern (primary); also read the `**Overall Confidence** N%` row for display only; display "gate: unknown" if both absent
- If execution outcome exists: `{slug}-execution-outcome_*.md` (todo completion table). When the newest outcome file's first line is `**Report Type: Pause**`, also extract `Pause Reason`, `Paused At Step`, and the `## Pause Record` payload (always the newest Pause record when several have accumulated — older ones are history) — except for `user-initiated-park`, which carries no `Paused At Step` (per the Park Procedure's own definition above) and must not have that field's absence treated as an extraction failure; extract only `Pause Reason` and the payload (`Parked Commit SHA`/`Switched To`) for that reason.
- If review exists: `{slug}-Code_Review_*.md` (verdict, finding summary)
- If session digest exists (fast path): `{slug}-session-digest_*.md` (full pipeline history)

For mid-execute recovery (no outcome file, or the newest outcome is a `**Report Type: Pause**` record — excluding a `user-initiated-park` record, which never implies mid-execute recovery; Step 2's Voluntary-park exclusion guard determines the correct dispatch for that case instead): identify **all** pending/in-progress todos from `todos[]` — do not assume "first non-completed = resume point." gc-execute runs todos in parallel waves; surface all incomplete todos. Wave grouping is re-derived by gc-execute.

### Step 4: Build Recovery Brief

```markdown
## Recovery Brief: {slug}

**Stage (reconciled):** {stage} [source: {artifact-ladder/pipeline.json}]
**Branch:** {branch}
**Workspace:** {workspace}

### Pipeline Progress
- /gc-plan: ✅ {overview}
- /gc-preflight: {✅ {N} run(s), last: Gate {PASS|STOP} ({X}% display) | ⏳ in progress | ⬜ not run}
- /gc-execute: {✅ {N}/{total} todos complete | ⏳ {N}/{total} complete — incomplete: {id1}, {id2}, … | ⬜ not run}
- /gc-review: {✅ {verdict} | ⏳ in progress | ⬜ not run}
- /gc-eop: {✅ complete | ⬜ not run}

### Todo State
| ID | Description | Status |
|----|-------------|--------|
| {id} | {description} | {status} |

### Recommended Next Action
→ /{gc-skill} — {one-line reason}

### Pause Record
{rendered only when the newest execution-outcome's first line is `**Report Type: Pause**`; carries Pause Reason, Paused At Step, a payload summary (probe result / failing signal / blocker list), and the question awaiting the user (complex-step-probe pauses only — the other reasons carry no question field)}
{omit section otherwise, same convention as Source Conflicts}
For a `user-initiated-park` reason specifically: render `**Parked Commit SHA:**` and `**Switched To:**` from the payload in place of the probe/signal/blocker payload shapes the other 3 reasons carry; this reason has no `Paused At Step` and no question field, consistent with how the existing non-complex-step-probe reasons already omit the question field.

### ⚠ Source Conflicts
{list any disagreements between gc-pipeline.json stage and artifact-ladder evidence}
{omit section if all sources agree}

---
> Brief reconstructed from disk. If you have unsaved in-session progress, that takes precedence.
```

### Step 5: Confirm and Dispatch

Ask: *"Ready to resume with {recommended action}?"*

- **y** → call the Skill tool with the target skill name (e.g., `skill: "gc-execute"`). Same mechanism as gc-eop → gc-correct delegation.
- **n** → ask what to do instead

Never auto-dispatch. Always confirm with user before invoking a pipeline skill.

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
// 6. [Pattern]: Mid-execute resume: surface ALL pending/in-progress todos (not just "first non-completed"). Wave grouping is re-derived by gc-execute from dependency analysis.

# Recover Pipeline

**Recovery skill — stage-agnostic.** Detects where the current pipeline session was interrupted, builds a Recovery Brief, and routes to the correct skill on user confirmation.

**Prior stage:** Any interrupted pipeline stage.
**Next stage:** Determined by reconciliation.

## Execution Steps

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

**Reconciliation:** gc-pipeline.json is primary; artifact ladder is fallback.

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
- If execution outcome exists: `{slug}-execution-outcome_*.md` (todo completion table)
- If review exists: `{slug}-Code_Review_*.md` (verdict, finding summary)
- If session digest exists (fast path): `{slug}-session-digest_*.md` (full pipeline history)

For mid-execute recovery (no outcome file): identify **all** pending/in-progress todos from `todos[]` — do not assume "first non-completed = resume point." gc-execute runs todos in parallel waves; surface all incomplete todos. Wave grouping is re-derived by gc-execute.

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

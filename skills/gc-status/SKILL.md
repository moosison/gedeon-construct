---
name: gc-status
description: "Cross-project dashboard. Reads ~/.claude/gedeon/projects/index.json and each registered project's STATE.md + ROADMAP.md. Renders an enriched markdown dashboard with phase badges, error counts, milestone progress, and current focus."
phase: project
tags: [dashboard, status, cross-project]
---

# Project Status Dashboard

**Renders an enriched markdown dashboard of all registered Gedeon Construct projects.**

## Steps

### Step 1: Read Global Index

Read `~/.claude/gedeon/projects/index.json` with the Read tool.

If the file does not exist or the array is empty:
> *"No projects registered. Run `/gc-new-project` or `/gc-bootstrap` to register a project."*

### Step 2: Read Each Project

For each entry in the index, read `{path}/.construct/STATE.md` and `{path}/.construct/ROADMAP.md`.

Extract from STATE.md:
- `## Current Focus` — first non-empty line (truncate to 40 chars)
- `## Blockers` — first non-empty line; if "None" or empty, use `—`
- `## Error Counts` — parse all `skill-name: N` lines; sum totals per skill

From ROADMAP.md: count `- [x]` (done) and total `- [` (all checkboxes).

Also read `{path}/.construct/USAGE.json` if it exists. Extract `cumulative.sessions` and `cumulative.totals.estimatedCostUsd` for the Cost column below. Missing file → `—` for that row, not an error (matches this step's existing "missing STATE.md → N/A" convention). Note for the reader: this is `cumulative` only — it lags by the current session and folds in once that project's next session's first Stop event fires.

If a project path no longer exists or STATE.md is missing, show `N/A` for that row — do not error.

### Step 3: Render Dashboard

#### Phase badges (use the `phase` field from index.json):

| Phase | Badge |
| --- | --- |
| `new` | ⚪ new |
| `bootstrap` | 🔍 bootstrap |
| `create-plan` | 📋 plan |
| `pre-flight` | 🔎 preflight |
| `execute` | 🔄 execute |
| `review` | 👁 review |
| `eop` | ✅ eop |

#### Error count display:
- Sum all non-zero error counts across skills
- If total = 0: `✓`
- If total 1–2: `⚠ N` (note: run /gc-correct)
- If total ≥ 3: `🚨 N` (threshold exceeded)

#### Milestone progress:
- Format as `done/total` with a text bar: `████░░░░ 2/5`
- Build the bar: `█` per done milestone, `░` per remaining, capped at 8 chars wide
- If no ROADMAP.md or no checkboxes: `—`

#### Cumulative cost column:
- Format as `💰 {sessions} · ${estimatedCostUsd}` (4 decimal places), or `—` if `.construct/USAGE.json` doesn't exist for that project. If `cumulative.totals.unpriced` is `true`, append `*` to the figure and add a one-line footnote below the table: "`*` partial — excludes tokens from unpriced models."
- This is `cumulative` only — it lags by the current session (see Step 2 note)

#### Output table:

```markdown
## Gedeon Projects — {timestamp}

| Project | Phase | Current Focus | Milestones | Errors | Cost | Last Active |
| --- | --- | --- | --- | --- | --- | --- |
| **{slug}** | {badge} | {focus} | {bar} done/total | {err display} | {cost display} | {date} |
```

#### Error detail block (only if any project has errors > 0):

After the table, add:

```markdown
### ⚠ Error Details
- **{slug}**: gc-execute ×N, gc-preflight ×N  ← only list skills with N > 0
```

### Step 4: Summary Line

After the table and any error detail block:

> *"{N} project(s) registered. For a browser view run: `node gc-dashboard.js --html` in the gedeon-construct directory."*

If any project has error count ≥ 3:
> *"⚠ One or more projects have hit the behavioral gap threshold. Run `/gc-correct` in the affected project."*

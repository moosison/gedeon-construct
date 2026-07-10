---
name: gc-progress
description: "Shows the current project's progress by reading .construct/ files directly. Renders a phase completion status report without any MCP server calls."
phase: project
requires:
  - gc-new-project
tags: [project, progress, status, lifecycle]
---

# Project Progress

**Renders current project status by reading `.construct/` files directly.**

## Steps

### Step 1: Read Planning Files

Read:
1. `.construct/PROJECT.md` — project name, goal, status
2. `.construct/ROADMAP.md` — milestones and phases
3. `.construct/STATE.md` — current focus, blockers
4. Glob `.construct/phases/*/SUMMARY.md` — each match is a completed phase (written by `/gc-eop` Step 1d)

### Step 2: Compute Completion

- **Completed phases:** count of directories under `.construct/phases/` that contain a `SUMMARY.md`
- **Total phases:** count of phases listed in ROADMAP.md
- **Completion %:** `completed / total * 100`
- **Milestone grouping:** match `phases/{slug}` directory names against milestone entries in ROADMAP.md; list uncategorized phases separately if no match found
- **Cumulative usage:** if `.construct/USAGE.json` exists, read `cumulative.sessions` and `cumulative.totals.estimatedCostUsd`. Absent file → omit the line in Step 3, not an error.

### Step 3: Render Report

```markdown
# Project Progress: {Project Name}

**Goal:** {goal}
**Current Focus:** {from STATE.md}

## Milestone Status

| Milestone | Progress | Status |
|-----------|----------|--------|
| {name} | {N}/{total} phases | {Not started / In progress / Complete} |

## Active Blockers
{from STATE.md or "None"}

## Open Threads
{from STATE.md or "None"}
```

Show a simple text progress bar for each milestone:
```
Auth:     ████████░░  80%  (4/5 phases)
Payments: ██░░░░░░░░  20%  (1/5 phases)
```

If `.construct/USAGE.json` exists, render one line after the milestone bars:
`💰 Cumulative usage: {cumulative.sessions} sessions, ${cumulative.totals.estimatedCostUsd}` — the total is live and current as of the most recent Stop event from any session, including any currently-open milestone window. If `cumulative.totals.unpriced` is `true`, append a caveat: "partial — excludes tokens from one or more models with no pricing entry." Omit the line entirely if the file doesn't exist.

### Step 4: Next Action

End with the suggested next action based on STATE.md `Current Focus`.

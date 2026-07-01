---
name: gc-ship
description: "Creates a pull request to ship completed work. Checks for uncommitted changes, verifies the branch, and runs gh pr create with a generated title and summary."
phase: project
tags: [ship, pr, git, lifecycle]
---

// @ai-rules:
// 1. [Pattern]: Review gate (Step 1, item 4) uses plan-slug scoped glob — not a global wildcard.
// 2. [Constraint]: Fail-open — missing review report is advisory only, never blocks the ship.
// 3. [Gotcha]: Plan store is global (~/.claude/gedeon/plans/). Verify slug is from current project before proceeding.

# Ship

**Creates a pull request for the current branch's changes.**

## Steps

### Step 1: Pre-Ship Checks

Run these checks in order:

1. **Uncommitted changes** — if `git status` shows modified/untracked files, stop and ask the user to commit or stash first.
2. **Branch check** — confirm the current branch is not `main`, `master`, `main-PRD`, or any protected branch configured in the project.
3. **Base branch** — determine the correct base branch (from `.construct/config.json`, CLAUDE.md, or ask the user).
4. **Review gate** — determine the active plan slug: use the Glob tool to list `~/.claude/gedeon/plans/*.plan.md`, then use a shell command (`ls -t` on Unix / `Get-ChildItem | Sort-Object LastWriteTime -Descending` on Windows) to identify the most recently modified file; extract its base name (without `.plan.md`) as `{plan-slug}`. Note: this step requires a shell command and may prompt for approval on first use. Glob `~/.claude/gedeon/plans/{plan-slug}-Code_Review_*.md`. If no matching file exists, warn: 'No gc-review report found for plan `{plan-slug}` — recommended to run /gc-review before shipping.' Fail-open: advisory only, user may proceed. **Known limitations:** (1) If multiple plans exist and modification times are ambiguous, list candidates and ask the user to confirm the active plan. (2) The plan store is global — a plan from another project with a more recent mtime could be selected; if the selected slug looks wrong, ask the user to confirm.

### Step 2: Summarize Changes

Examine commits since the branch diverged from base:
- List commit messages
- Identify which planning phases or milestones are covered
- Identify affected systems/modules

### Step 3: Draft PR Content

Draft a PR title (under 70 chars) and body:

```markdown
## Summary
- {bullet 1}
- {bullet 2}

## Test plan
- [ ] {manual test step}
- [ ] {automated test if applicable}

## Planning coverage
- Milestone: {name}
- Phases shipped: {list}
```

### Step 4: Create PR

Run `gh pr create` with the draft title and body.

Present the PR URL on success.

## Anti-Patterns

- Creating a PR from a protected branch
- Skipping uncommitted change check
- Empty or generic PR descriptions ("misc changes")

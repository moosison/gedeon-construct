---
name: gc-new-project
description: "Initializes a new project's planning structure. Creates .construct/ directory tree with PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, and config.json. Run at the start of a new project."
phase: project
tags: [project, lifecycle, planning, init]
---

# New Project

**Initializes the planning structure for a new project.** Creates the `.construct/` directory tree so `/gc-milestone`, `/gc-progress`, and `/gc-plan` have a home.

## Steps

### Step 1: Gather Project Info

Ask the user (if not provided):
1. **Project name** — short identifier (kebab-case)
2. **One-line goal** — what this project delivers
3. **Initial milestones** (optional) — rough phases, or "discover them later"
4. **Team size** — solo (1 contributor), small (2–5), or full (5+). Used to set the branch strategy.

> **Roadmapped enhancement (not yet implemented):** these four quick questions are planned to be superseded by real scope capture — complexity drivers, integrations, known unknowns, constraints, and whether the project needs parallel workstreams — feeding a time/cost estimate. See `Deep Scope Discovery & Project Estimation` in `.construct/ROADMAP.md`. Deliberately queued last: gated on the `Instrument Repairs` milestone and on external-project cost calibration.

### Step 2: Initialize Planning Tree

Create the following files in the current directory:

**`.construct/PROJECT.md`**
```markdown
# {Project Name}

## Goal
{one-line goal}

## Status
Active

## Started
{YYYY-MM-DD}
```

**`.construct/REQUIREMENTS.md`**
```markdown
# Requirements: {Project Name}

## Functional Requirements
- [ ] {to be defined}

## Non-Functional Requirements
- [ ] {to be defined}

## Out of Scope
- {to be defined}
```

**`.construct/ROADMAP.md`**
```markdown
# Roadmap: {Project Name}

## Milestones

{milestone sections added by /gc-milestone}
```

**`.construct/STATE.md`**
```markdown
# Project State: {Project Name}

## Current Focus
{milestone name or "Phase 0 — Discovery"}

## Last Updated
{YYYY-MM-DD}

## Blockers
None

## Notes

## Codebase Patterns
<!-- Append-only. gc-bootstrap reads this. gc-eop writes here. Do not edit manually. -->

## Session History
<!-- Append-only. gc-eop writes dated entries here. Do not edit manually. -->

## Error Counts
gc-execute: 0
gc-preflight: 0
gc-bootstrap: 0
```

**`.construct/config.json`**
```json
{
  "slug": "{project-name}",
  "teamSize": "{solo|small|full}",
  "version": "1.0.0",
  "created": "{YYYY-MM-DD}"
}
```

### Step 3: Register in Global Index

Read `~/.claude/gedeon/projects/index.json` with the Read tool. Parse the JSON array. Check if an entry with this project's slug already exists. If not, append:

```json
{ "slug": "{project-name}", "lastActive": "{ISO date}", "phase": "new" }
```

Write the updated array back with the Write tool. If the file does not exist (setup.js not yet run), write `[{entry}]` as the full content.

> Note: index.json is not concurrency-safe — running gc-new-project simultaneously in two different projects may lose one entry. Register projects sequentially.

### Step 4: Confirm

List the created files. End with:

Confirm project initialized in Gedeon voice, then propose next steps.

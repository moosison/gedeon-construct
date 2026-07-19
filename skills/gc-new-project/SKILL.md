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

#### Vision Capture

Before writing the planning tree, draw out the project's *vision* — a guided conversation, not a form. Elicit, adapting to what the user has already said (don't interrogate a fixed list):

- **Intended features** — what the project should actually do, at feature granularity, not just the one-line goal.
- **Non-goals** — what it deliberately will NOT do. Naming non-goals now prevents scope creep later.
- **Workstreams dimension** — does the project need parallel tracks (independently-progressing bodies of work), or is it a single linear build? Scope this explicitly here rather than discovering it ad hoc mid-project.

Capture the vision in the conversation; it feeds `REQUIREMENTS.md` (Step 2) and the optional research in Step 1.5. Keep it proportionate — a tiny tool needs a light touch; a broad system earns a fuller draw-out.

> **Roadmapped enhancement (not yet implemented):** deeper *scope estimation* — complexity drivers, integrations, known unknowns, and a projected time/cost — is not the vision draw-out above. That estimation half lives in `Deep Scope Discovery & Project Estimation` (`.construct/ROADMAP.md`), deliberately queued last: gated on the `Instrument Repairs` milestone and on external-project cost calibration. (Vision capture and best-practice research themselves now ship here, in this skill.)

### Step 1.5: Best-Practice Research (opt-in)

After vision capture, **offer** best-practice build research — the user opts in; trivial projects skip it. On opt-in, research how best to build *this* project's vision: whether it needs a database/backend at all, which architecture shape fits, and requirements the user hasn't surfaced.

Pass the vision (features, non-goals, workstreams) **and the team size** (from Step 1) to the research worker. **Pass the Model cell below as the `model` parameter on the dispatch** — per `agents/gc-brain.md`'s Worker Dispatch Contract, an omitted model silently runs the worker at the wrong tier.

| Research lane | Model | Agent file |
| --- | --- | --- |
| Inception research | `sonnet` | `agents/gc-inception-researcher.md` |

The worker is **read-only** and returns findings as candidate `REQUIREMENTS.md` entries — each a discrete claim. **The user confirms each finding before it binds** (probe-before-assume: every extraction is a claim to verify, not a fact to accept). A **"no database / no framework / no dependency needed"** conclusion is a valid, bindable outcome — the research must be able to rule infrastructure OUT, not only recommend it in. The worker never writes project files; Step 2 writes the confirmed findings into `REQUIREMENTS.md`.

**Existing codebase?** Inception research is a *greenfield* activity — it asks *whether* to add a database and *which* architecture to pick, decisions an existing codebase has already made. If you're adopting the pipeline onto code that already exists, **skip the research** and run `/gc-bootstrap` to survey the existing stack instead. (A dedicated brownfield *survey* mode — research the existing architecture rather than recommend a new one — is a planned follow-on; see this milestone's run-scenario coverage phase.)

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

> **Populating from Step 1.5:** if the opt-in research produced confirmed findings, populate each section from them instead of leaving the stub — replace the `- [ ] {to be defined}` placeholder (Functional / Non-Functional) or the bare `- {to be defined}` (Out of Scope) with that section's confirmed findings; leave the placeholder where a section has none. The worker's architecture-shape / needs-a-database verdict binds under **Non-Functional Requirements** — it has no separate section.

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

**`.gitignore`** — the planning tree and pipeline state are local-only; without this, every new project leaks `.construct/` artifacts and `.claude/*.json` state into git. If a `.gitignore` already exists, append only the lines it is missing (do not duplicate or clobber existing entries); if absent, create it with:
```
# Gedeon Construct — planning artifacts and pipeline state are local-only
.construct/
.claude/*.json
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

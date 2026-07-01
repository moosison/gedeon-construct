---
name: gc-milestone
description: "Adds a new milestone to an existing project's ROADMAP.md. Creates the milestone directory structure under .construct/phases/. Requires /gc-new-project to have been run first."
phase: project
requires:
  - gc-new-project
tags: [project, milestone, lifecycle, planning]
---

// @ai-rules:
// 1. [Constraint]: gc-milestone creates ONLY the milestone-level directory, not phase subdirs.
// 2. [Pattern]: Slug algorithm is canonical in gc-discuss/SKILL.md Step 1 — cross-reference, do not duplicate.

# New Milestone

**Adds a milestone to the project roadmap.** Updates `.construct/ROADMAP.md` and creates the milestone directory.

## Steps

### Step 1: Validate Project Exists

Check that `.construct/ROADMAP.md` exists. If not, prompt the user to run `/gc-new-project` first.

### Step 2: Gather Milestone Info

From the user's input (or ask if not provided):
- **Milestone name** — title (e.g., "Authentication", "Phase 1 — MVP")
- **Goal** — one sentence describing what this milestone delivers
- **Phases** — list of phase names (optional; can be added later)

### Step 3: Update ROADMAP.md

Append to `.construct/ROADMAP.md`:

```markdown
## Milestone: {Milestone Name}

**Goal:** {goal}

### Phases
- [ ] {Phase 1 name}
- [ ] {Phase 2 name}

**Status:** Not started
**Started:** —
**Completed:** —
```

### Step 4: Create Milestone Directory

Create `.construct/phases/{milestone-slug}/` (milestone-level container). This is the parent directory for all phases of this milestone. Phase subdirectories — `.construct/phases/{milestone-slug}/{phase-slug}/` — are created by gc-discuss when each phase begins. gc-milestone does not create phase subdirectories; it creates only the milestone container.

**Slug derivation:** The milestone-slug is derived from the milestone heading using the algorithm defined in `gc-discuss/SKILL.md` Step 1 (canonical source). In brief: strip any `Milestone: ` prefix, lowercase, replace special characters with hyphens, collapse consecutive hyphens, trim. gc-discuss is the authoritative reference — if the algorithm changes, update gc-discuss first.

### Step 5: Confirm

Confirm milestone created in Gedeon voice, then propose planning the first phase.

---
name: gc-new-project
description: "Initializes a new project's planning structure. Creates .construct/ directory tree with PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, and config.json. Run at the start of a new project."
phase: project
tags: [project, lifecycle, planning, init]
---

// @ai-rules:
// 1. [Constraint]: Code is primary source of truth — if source code exists, brownfield always wins over a co-detected doc source; docs never compete for mode, they only enrich (see Mode Detection's Precedence paragraph).
// 2. [Gotcha]: Doc/tool detection uses only generic, tool-neutral content-shape and cue-phrase signals — never hardcode a specific tool's name, branding, or folder convention anywhere in this file or in references/brownfield.md / references/migration.md.
// 3. [Pattern]: For brownfield/migration, Step 1.5's dispatch fires early — the moment the mode is confirmed in Mode Detection, before Vision Capture — not when the reader reaches the Step 1.5 heading. Reaching Step 1.5 in normal reading order describes only what greenfield does.
// 4. [Pattern]: Reference files carry mode-specific knowledge; this file carries the dispatch mechanism only. Step 1.5's single shared 3-row dispatch table must stay in this file — tier-consistency-check.js scans exactly 7 whitelisted SKILL.md paths, never references/*.md.
// 5. [Gotcha]: A confirmed monorepo scope subtree must be threaded through both Step 1.5's dispatch brief and Step 2's scan root — references/brownfield.md and references/migration.md each define their own Monorepo Scope Boundary section for how the survey/import applies it. The scan root is NOT always the final target directory: brownfield's rebuild-beside branch (Step 2) redirects the actual target to a new sibling directory, leaving the scan root itself frozen as reference.
// 6. [Constraint]: Symlink resolution during Doc Detection must verify the resolved target stays within the workspace/scope root before reading it — skip and disclose if it escapes; never follow a symlink out of scope.

# New Project

**Initializes the planning structure for a new project.** Creates the `.construct/` directory tree so `/gc-milestone`, `/gc-progress`, and `/gc-plan` have a home.

## Steps

### Step 1: Gather Project Info

Ask the user (if not provided):
1. **Project name** — short identifier (kebab-case)
2. **One-line goal** — what this project delivers
3. **Initial milestones** (optional) — rough phases, or "discover them later"
4. **Team size** — solo (1 contributor), small (2–5), or full (5+). Used to set the branch strategy.

#### Mode Detection

Before Vision Capture, determine which of three modes applies: **greenfield** (nothing exists
yet), **brownfield** (source code already exists), or **migration** (planning documents exist
describing a project that hasn't been built yet). This is a mechanical read of the workspace, not
a dispatch — do it with a light local scan, and always confirm the read with the user before
routing anywhere.

**Doc Detection.** Run two passes together, every time — never gate one behind the other:

1. **Content-shape scan.** Lightly read root-level markdown and the immediate children of any
   directory whose name suggests a document collection — at least 2 markdown files present, or a
   name matching generic, tool-neutral vocabulary such as "docs", "planning", "spec",
   "requirements", "adr", "prd", or "rfc" (industry-standard document-type terms, broader than and
   predating any single tool — never a specific tool's own branded folder name). Read headings
   only, not full content, looking for planning-shaped signals: requirements/roadmap/architecture/
   non-goals headings, ID-prefixed requirement patterns, phase or milestone breakdowns. Flag a
   directory as a doc source once **at least one** such signal is found — not zero. The trigger is
   always the directory's *content*, never its name matching a known convention; this is what
   catches a one-off planning doc living at an unconventional path that a fixed name list would
   miss.
2. **Symlink resolution.** Resolve any candidate directory that is a symlink before inspecting its
   content — ordinary filesystem hygiene, since a link may point at project state stored elsewhere.
   **Containment check:** after resolving, verify the resolved target still falls under the
   workspace root (or the confirmed monorepo scope subtree, if one applies — see Monorepo scope
   boundary below). A resolved target that escapes that boundary is not a valid doc source — skip
   it and disclose the skip to the user (path + where it pointed) rather than reading it. This is
   the same containment discipline the monorepo scope answer itself gets, applied at the
   filesystem-link boundary instead of the confirmed-subtree boundary.

Every directory that passes the content-shape check is a detected doc source, treated identically
downstream — there is no tiered "recognized vs. generic" treatment. A candidate directory whose
content does not read as authored prose (no clear headings or requirement-shaped sentences — for
example it's mostly structured non-prose data, logs, or config) is simply not flagged; this is a
content-shape test, not a judgment about any particular directory or tool.

**Code Detection.** Any of the following, combined with no `.construct/` yet, indicates
**brownfield**:
- Source manifests (the same build-surface list `gc-bootstrap` already scans for — cite it rather
  than re-enumerating a second copy).
- Non-trivial git history (more than the single initial commit — a fresh repo with only its first
  commit does not count).
- Recognized source-file content itself at a shallow root-level scan (e.g. `.html`, `.css`, `.js`,
  or other common source-file extensions) — present even without any manifest or git history. A
  static site or legacy codebase nobody has yet wrapped in build tooling or version control is
  still real content to survey; the absence of tooling infrastructure is not the same signal as
  the absence of code, and only the latter means there's nothing to survey.

**Monorepo scope boundary.** Workspace-manifest signals (a workspace-tooling manifest, or a
workspace field inside a package manifest) raise a scope-boundary question alongside whichever
mode wins: which subtree is "the project"? This mirrors `gc-bootstrap`'s own existing monorepo
signal — cite it, don't re-derive a second convention. Once the user answers, that subtree becomes
the scope root for everything downstream in this same invocation: `.construct/` is created at that
subtree rather than the workspace root, and the subtree path is carried forward as an explicit
scope parameter in Step 1.5's dispatch brief, so the survey or extraction reads only within it.

**Superseded for brownfield's rebuild-beside case:** this `.construct/`-location default is the
answer only when brownfield's Vision Capture rebuild-beside question (see Vision Capture below)
either doesn't apply or resolves to modify-in-place — when it resolves to rebuild-beside, Step 2's
target-directory rule governs the final `.construct/` location instead (a new sibling directory,
not this subtree), superseding this sentence for that case.

**Resolving the mode** (all four (doc, code) combinations, so this list is the complete decision
table on its own — no combination is resolved only by a paragraph elsewhere):
- Doc source found, no code found ⇒ **migration**.
- Code found (regardless of whether a doc source was also found) ⇒ **brownfield** — see
  Code Detection above for the trigger and Precedence below for how a co-detected doc source
  factors in as enrichment, never as a competing mode.
- No doc source and no code found ⇒ **greenfield** (today's path, unchanged).
- A candidate directory exists but fails the content-shape check, and nothing else qualifies as a
  doc source or code ⇒ falls through to **greenfield**, with a one-line disclosure naming the
  directory found and noting its content didn't read as planning documentation.

**Precedence when code and docs are both found — code is primary.** If source code exists,
**brownfield always runs**, regardless of whether planning docs are also detected. A written
document is only as reliable as the code describes it being current, and it may not be — treat it
accordingly. Docs found alongside code never compete for the mode; they become an enrichment input
into the brownfield flow instead: items the extraction mechanism reads as non-goals import
directly as Out-of-Scope candidates, while other candidate items the code survey doesn't
corroborate surface later, in Vision Capture, as planned-enhancement questions rather than
pre-confirmed requirements — the user's answer decides, never the document's claim alone.
Migration's full document import narrows to apply only when **no code exists yet** — the one case
where the document genuinely is the sole source of truth.

**Multiple sources detected at once.** When more than one doc source (or other tool-state
directory) is detected simultaneously, surface all of them to the user by what was found — never
silently pick one. Default posture: everything outside `.construct/` is frozen historical
reference — read once to harvest, never resumed, never written to.

**Trigger timing.** The moment brownfield or migration is confirmed with the user, carry out Step 1.5's dispatch now, immediately — do not wait to reach that heading below. Its survey or
extraction doesn't depend on the stated vision, and Vision Capture is materially better informed
by having those findings already in hand. Then proceed to Vision Capture, informed by what was
found. If greenfield: proceed to Vision Capture normally — Step 1.5 runs afterward, in its written
position, as today.

**Confirm before routing, always.** Detection is a claim, not a fact — present the detected read
to the user and await confirmation before dispatching anything.

#### Vision Capture

Before writing the planning tree, draw out the project's *vision* — a guided conversation, not a form. Elicit, adapting to what the user has already said (don't interrogate a fixed list):

- **Intended features** — what the project should actually do, at feature granularity, not just the one-line goal.
- **Non-goals** — what it deliberately will NOT do. Naming non-goals now prevents scope creep later.
- **Workstreams dimension** — does the project need parallel tracks (independently-progressing bodies of work), or is it a single linear build? Scope this explicitly here rather than discovering it ad hoc mid-project.

**Branching by detected mode** (see Mode Detection above):

- **Brownfield.** The elicitation still runs — reframed as "what to build on top of / alongside what already exists" rather than a from-scratch feature list — informed by the behavior-surface survey Step 1.5 already gathered (per Mode Detection's trigger-timing note, that dispatch has already run by the time this section is reached for brownfield).
  - **Modify-in-place vs. rebuild-beside (detect from the stated vision, then confirm):** read the
    vision statement just elicited for rebuild/replace/redesign-shaped language ("rebuild",
    "redesign", "replace", "start over on") versus extend/add-to-shaped language ("add",
    "integrate", "extend", "on top of"). Surface that read as a claim, not a fact — confirm
    explicitly with the user: keep building inside the surveyed folder, or treat the surveyed
    folder as frozen historical reference while the new build happens in a sibling directory
    beside it (the same "everything outside `.construct/` is frozen reference" posture Mode
    Detection already applies to a co-detected doc source, extended here to the whole surveyed
    code source). This mirrors Mode Detection's own "detect mechanically, then confirm with the
    user" pattern rather than asking a disconnected toggle question. If the vision statement reads
    as neither clearly one-shaped nor the other (mixed or genuinely ambiguous language), default
    the suggested read to modify-in-place — the lower-blast-radius option — and let the user's
    confirmation correct it, rather than guessing rebuild-beside from weak signal. Record the
    confirmed answer; Step 2's target-directory rule consumes it.
- **Brownfield + docs detected.** When Mode Detection also found a planning-doc tree, the elicitation additionally surfaces doc-derived items the code survey didn't corroborate, as explicit planned-enhancement prompts: "the existing docs mention {item}, not found in the current code — still part of your vision?" This is an input to the same conversation, not a separate step — the user's answer determines whether it becomes a candidate, never the doc's claim alone.
- **Migration.** Skipped by default — the source docs already state the vision, and this mode only ever applies when no code exists yet — with a one-line offer to still run a light pass for scope not captured in the source.
- **Greenfield.** Unchanged — the elicitation above runs exactly as written.

Capture the vision in the conversation; it feeds `REQUIREMENTS.md` (Step 2) and the optional research in Step 1.5. Keep it proportionate — a tiny tool needs a light touch; a broad system earns a fuller draw-out.

> **Roadmapped enhancement (not yet implemented):** deeper *scope estimation* — complexity drivers, integrations, known unknowns, and a projected time/cost — is not the vision draw-out above. That estimation half lives in `Deep Scope Discovery & Project Estimation` (`.construct/ROADMAP.md`), deliberately queued last: gated on the `Instrument Repairs` milestone and on external-project cost calibration. (Vision capture and best-practice research themselves now ship here, in this skill.)

### Step 1.5: Research / Survey / Import (dispatch mechanics for all three modes)

This heading defines the dispatch table and instructions for all three modes — greenfield, brownfield, migration — in one place (required for `tier-consistency-check.js`'s scan). For brownfield and migration, the dispatch below already fired earlier, at Mode Detection's trigger-timing rule (see Step 1's Mode Detection subsection), before Vision Capture — reaching this heading in the file's normal reading order describes what greenfield alone does.

**If greenfield:** After vision capture, **offer** best-practice build research — the user opts in; trivial projects skip it. On opt-in, research how best to build *this* project's vision: whether it needs a database/backend at all, which architecture shape fits, and requirements the user hasn't surfaced. Pass the vision (features, non-goals, workstreams) **and the team size** (from Step 1) to the research worker, dispatched via the Inception research row below.

**If brownfield:** Dispatch the Brownfield survey row below, with lens and brief content sourced from `references/brownfield.md`. If Mode Detection's Monorepo scope boundary question was raised and answered, pass that confirmed subtree as an explicit scope parameter in the dispatch brief — `references/brownfield.md`'s own Monorepo Scope Boundary section governs how the survey applies it. After the dispatch returns — recall from `@ai-rules` item 3 that this same Step 1.5 dispatch is what fires early, before Vision Capture, not the other way around — and brownfield's Vision Capture (Step 1's Brownfield branch, read and answered by the user only once this dispatch has already returned) has captured the stated vision, translate the dispatch's Output Contract — informed by that now-stated vision — into the candidate Functional/Non-Functional/Out-of-Scope shape per `references/brownfield.md`'s own translation instructions before presenting candidates for confirmation. This three-step hand-off (dispatch → Vision Capture → translate) is a required part of Step 1.5, not left implicit in the reference file alone.

**If migration:** Dispatch the Migration import row below, with brief content sourced from `references/migration.md`. If Mode Detection's Monorepo scope boundary question was raised and answered, pass that confirmed subtree as an explicit scope parameter in the dispatch brief — `references/migration.md`'s own Monorepo Scope Boundary section governs how the import applies it. After the dispatch returns, translate its Output Contract into the candidate Functional/Non-Functional/Out-of-Scope shape per `references/migration.md`'s own translation instructions before presenting candidates for confirmation — this hand-off is a required part of Step 1.5, not left implicit in the reference file alone.

**Pass the Model cell below as the `model` parameter on the dispatch** — per `agents/gc-brain.md`'s Worker Dispatch Contract, an omitted model silently runs the worker at the wrong tier. This applies to all three rows below.

| Research lane | Model | Agent file |
| --- | --- | --- |
| Inception research | `sonnet` | `agents/gc-inception-researcher.md` |
| Brownfield Survey | haiku | agents/gc-explorer.md |
| Migration Import | haiku | agents/gc-explorer.md |

The worker is **read-only** and returns findings as candidate `REQUIREMENTS.md` entries — each a discrete claim. **The user confirms each finding before it binds** (probe-before-assume: every extraction is a claim to verify, not a fact to accept) — confirmation spans a plain accept, a reject/drop, or an edit to the candidate's own substance (e.g. correcting a detail the survey got wrong, such as an endpoint that is being regenerated rather than preserved as-is), all equally expected outcomes; an edited candidate binds in its user-corrected form, never the worker's original wording. A **"no database / no framework / no dependency needed"** conclusion is a valid, bindable outcome for greenfield's inception research — the research must be able to rule infrastructure OUT, not only recommend it in. No worker writes project files directly; Step 2 writes the confirmed findings into `REQUIREMENTS.md`.

### Step 2: Initialize Planning Tree

Target directory: start from the current directory, narrowed to the confirmed monorepo subtree if
Mode Detection's Monorepo scope boundary question was raised and answered (per Mode Detection's
"that subtree becomes the scope root for everything downstream" rule) — call this the **scan
root** (the same directory Mode Detection calls the scope root when a monorepo subtree applies,
or the current directory otherwise).

- **Rebuild-beside branch:** if brownfield's Vision Capture "modify-in-place vs. rebuild-beside"
  question was confirmed as rebuild-beside, the actual target directory is a new sibling directory
  created next to the scan root, and the scan root itself stays untouched, frozen reference only.
- **Naming the sibling directory:** default to Step 1's already-collected Project name — this is
  the same project, so its already-answered name reuses cleanly rather than re-asking a question
  already answered. Confirm this default with the user rather than silently assuming it; if they
  want a different name for the sibling directory specifically, use that instead.
- **Sibling-directory name collision:** if a directory already exists at that sibling location,
  surface it and ask before proceeding — offer either reusing the existing directory as-is, or
  choosing a different name for the new target directory. Never rename the pre-existing directory
  itself, which may hold unrelated content outside this project's control. The same
  never-silently-overwrite posture Step 2's existing pre-existing-`.construct/` guard already takes
  toward a collision.
- **Otherwise** (modify-in-place, or the question doesn't apply outside brownfield): the target
  directory IS the scan root, unchanged from today's behavior.

**Existing-tree guard:** if `.construct/` already exists at the target directory, this step would
overwrite it — confirm with the user before proceeding, rather than silently recreating any file
below. This can happen even on the greenfield path (e.g. `gc-new-project` re-invoked by mistake, or
source removed after `.construct/` was created) — the guard applies regardless of detected mode.

Create the following files in the target directory:

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

> **Populating from Step 1.5:** if the opt-in research, survey, or import produced confirmed findings, populate each section from them instead of leaving the stub — replace the `- [ ] {to be defined}` placeholder (Functional / Non-Functional) or the bare `- {to be defined}` (Out of Scope) with that section's confirmed findings; leave the placeholder where a section has none. The worker's architecture-shape / needs-a-database verdict binds under **Non-Functional Requirements** — it has no separate section.

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
  "sourceMode": "{greenfield|brownfield|migration}",
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

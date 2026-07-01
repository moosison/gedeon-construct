---
name: gc-bootstrap
description: "Stage 1 of the pipeline. Scans the workspace to understand its structure, stack, and boundaries, then produces a situational awareness brief. Run at the start of a new feature or before /gc-plan when you need full context."
phase: pipeline
tags: [bootstrap, context, architecture, cynefin]
model: sonnet
---

// @ai-rules:
// 1. [Pattern]: Step 4b checks per-skill error counts (not sum). Advisory at >= 3, never blocking.
// 2. [Gotcha]: Parse ## Error Counts section only — stop at the next ## to avoid reading dated session entries.
// 3. [Constraint]: If ## Error Counts section absent from STATE.md, proceed silently (no error).
// 4. [Pattern]: Step 0 registration: read→merge→write for index.json. DELETE humanStatus from merged entry (session is active). Set name from config.json name field (fallback: slug). Preserve all other existing fields.

# Architect Bootstrap

**Stage 1 of the pipeline.** Scans the workspace (WHERE) and clarifies intent (WHAT) to produce a situational awareness brief before planning.

**Next stage:** `/gc-discuss` (optional) or `/gc-plan`

> **Pipeline state:** At the start of this skill, write `{"stage":"bootstrap","updatedAt":"<current ISO timestamp>"}` to `.claude/gc-pipeline.json` in the current project directory. Create `.claude/` first if absent.

## Execution Steps

### Step 0: Global Memory + Project Registration

Before scanning, read cross-project context:

1. **Read user preferences:** Read `~/.claude/gedeon/user/memory.md` with the Read tool. If the file is non-empty (has content beyond the comment header), include a "User Preferences" section in the situational brief with the memory contents.

2. **Register project:** Read `.construct/config.json` once — extract: (a) slug from `config.slug` (new format) or `config.project` (old format); (b) `name` from `config.name`, falling back to the resolved slug if absent; (c) `teamSize` if present (`solo`, `small`, or `full`) — include as: `Branch model: {teamSize} (run /gc-branch for full strategy)`. Read `~/.claude/gedeon/projects/index.json` with the Read tool. Parse the JSON array.

   Find the entry where `slug` matches this project. **If found:** merge — **DELETE `humanStatus` if present** (this session is now active; the closed-session cache must be cleared), set `name` to the value from config.json (or slug fallback), and preserve all remaining existing fields (`path`, `teamSize`, `lastActive`, `phase`, and any others). **If not found:** append a new entry:
   ```json
   { "slug": "{slug}", "lastActive": "{ISO date}", "phase": "bootstrap", "name": "{name}" }
   ```
   Write the updated array back with the Write tool.
   > Note: index.json is not concurrency-safe — concurrent sessions may lose one registration. Accepted limitation.

3. **Read Codebase Patterns:** Read `.construct/STATE.md` and extract the `## Codebase Patterns` section. If non-empty, include under "Prior Session Patterns" in the situational brief.

### Step 1: Bootstrap Context Brief

Apply probe-before-assume: read README, AGENTS.md, root manifests — do not guess stack or boundaries.

Draft a brief with these sections:

```markdown
## Bootstrap Context Brief: {workspace-slug}

### 1. User Intent
### 2. Starting Hypothesis
### 3. Scan Questions (numbered — must be answered by exploration)
### 4. Prior Art
### 5. Workspace Type Signals
- Primary kind: code repo | docs/coordination | platform/GitOps | monorepo | multi-root
- Build surfaces detected: (package.json, go.mod, pyproject.toml, Makefile, Dockerfile, etc.)
- Agent-facing docs: README quality, CLAUDE.md presence

### 6. Initial Cynefin Read
- Domain for the stated intent: Clear | Complicated | Complex | Chaotic | Disorder
- If Disorder: list clarifying questions before heavy scanning

### 7. Requirements Anchor (if any)
- Path to requirements doc or brainstorm artifact
- One-paragraph scope summary
```

### Step 2: Intent Gate

**Route based on clarity:**

| Signal | Action |
| --- | --- |
| **Clear intent** — acceptance criteria or bounded scope | Proceed directly to scanning |
| **Vague intent** — "improve X", "explore", missing scope | Ask 1-3 clarifying questions (one per turn). Write requirements to `docs/brainstorms/{slug}-requirements.md` when durable. |
| **No direction** — "what should we build", "give me ideas" | Brainstorm ranked options first; let user pick, then define scope |

### Step 3: Workspace Exploration

Dispatch parallel Explore agents to gather evidence. Each agent is read-only and returns a markdown report only — no file writes.

| Explorer | Model | Agent file | Lens |
| --- | --- | --- | --- |
| **A — Deep trace** | `haiku` | `agents/gc-explorer.md` | Repo structure, conventions, full-file reads, call chains |
| **B — Breadth scout** | `haiku` | `agents/gc-explorer.md` | Hypothesis-driven discovery, entrypoints, suspected-area sweep |
| **C — Correctness probe** | `haiku` | `agents/gc-explorer.md` | Challenge assumptions, edge cases, contradictions |

### Step 4: Merge Findings

Merge scan reports:
- Union all findings; flag contradictions
- Build **Situational Awareness** table (tech stack, boundaries, gaps)
- Synthesize Initial Cynefin read

### Step 4b — Error Count Gate

Read `.construct/STATE.md`. Locate the `## Error Counts` section. Parse each line in that section matching the pattern `{skill-name}: {integer}` (stop at the next `##` heading). If any skill's count is >= 3, surface this advisory:

`⚠ Unresolved behavioral gaps detected: {skill-name} has {N} gaps. Consider running /gc-correct before starting a new plan to prevent recurrence.`

Show one advisory per affected skill. Advisory only — do not block the session. If the `## Error Counts` section is absent, STATE.md is missing, or all counts are below 3, proceed silently.

### Step 5: Present in Chat

Summarize: intent & scope, tech stack, key boundaries, top risks, Initial Cynefin read.

Confirm bootstrap complete in Gedeon voice — name the requirements path, then propose discuss or plan.

## Anti-Patterns

- Guessing workspace type without reading manifests/README
- Heavy scanning while User Intent is still Disorder with no requirements anchor
- Starting before intent is at least partially clear
- Subagents writing files — they return reports only

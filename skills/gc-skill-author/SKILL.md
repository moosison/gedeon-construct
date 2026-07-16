---
name: gc-skill-author
description: "Create or amend gc-* skill files using Darwin Skill Author principles: teach HOW to reason, never WHAT to do; no tool names in bodies; no wire formats; minimal targeted patches. Use when writing new gc-* skills or fixing behavioral gaps in existing ones."
phase: specialist
tags: [skill-author, self-improvement, meta, darwin]
---

// @ai-rules:
// 1. [Gotcha]: The "Dispatching with Agent Files" table is scanned by hooks/lib/tier-consistency-check.js
//    (DISPATCH_TABLES) — its Model cells are validated against each persona file's frontmatter tier. When a
//    persona retiers, this table must change in the same diff or the tier check fails.
// 2. [Constraint]: The gc-auditor row's colon-form cell `sonnet (security lane: opus)` must NEVER be converted
//    to the paren-form elevated marker `(security lane)` (or vice versa) — the checker classifies rows by exact
//    substring; the two forms have different semantics (see the Format note under the table).
// 3. [Pattern]: Skill bodies this file teaches you to write must contain no tool names and no wire formats
//    (Forbidden Patterns table is the authority; bash commands are domain facts, exempt).
// 4. [Gotcha]: The agent-file table here is authoring REFERENCE material, not a live dispatch site — dispatch
//    skills' own tables are the operative ones; do not add dispatch-translation clauses here.

# Skill Author

**Creates or amends gc-* skills following the Darwin Skill Author methodology.** Skills that teach HOW to reason survive context changes. Skills that prescribe WHAT to do break whenever the environment shifts.

## The Cardinal Rule

> Teach HOW to reason about a situation, not WHAT actions to take.

A skill that says "reason about which files are affected before proposing changes" will hold across environments, tool versions, and workflows. A skill that says "use the Grep tool to find all files then call Edit on each" is a recipe that breaks the moment any named element changes.

## Forbidden Patterns in Skill Bodies

Never write these in a skill body:

| Forbidden | Replace with |
|---|---|
| Tool names (`Read`, `Grep`, `Edit`, `Agent`, `Bash`) | Action purpose ("examine the file content", "search for the symbol") |
| Wire formats (JSON shapes, specific argument names) | Outcome descriptions ("pass the full context to each auditor") |
| Prescriptive recipes with numbered steps that name tools | Principles that guide reasoning |
| "Copiable" examples with literal field values | Structural templates with semantic placeholders |

**Exception:** Bash shell commands describing what to run (e.g., `git diff --staged`) are acceptable — they are domain facts, not tool names.

## What Good Skills Contain

- **Reasoning principles**: When to do X vs Y, and why
- **Decision criteria**: What signals trigger which response pattern
- **Quality gates**: What "done" looks like and why that definition matters
- **Anti-patterns**: Failure modes with their root cause (not just "don't do X")
- **Cross-references**: Which other gc-* skills are related and when to chain them

## Skill Structure

Every gc-* skill must have:

```yaml
---
name: gc-{name}
description: "One-line purpose — specific enough to trigger correctly"
phase: pipeline | project | specialist | capture
requires:           # optional
  - gc-{dependency}
tags: [keyword1, keyword2]
model: opus | sonnet | haiku   # optional — recommended Claude model for this skill
---
```

**`model:` field guidance:**
- Declare when the skill has a clear reasoning-depth preference.
- Pipeline skills dispatching subagents MUST declare model and include a dispatch guidance block.
- Values: `haiku` (fast, cheap), `sonnet` (balanced), `opus` (max depth), `fable` (creative).
- Dispatch guidance block: append after the "Dispatch N parallel..." sentence in the skill body.
- Model in frontmatter = recommended session model. Model in dispatch guidance = model for subagents.

### Dispatching with Agent Files

Dispatch skills reference agent definitions from `agents/` to inject behavioral contracts into Agent tool prompts. The agent file content replaces inline worker descriptions.

| File | Role | Model | Mode |
| --- | --- | --- | --- |
| `agents/gc-brain.md` | Orchestrator identity (injected at session start) | opus | orchestrate |
| `agents/gc-explorer.md` | Evidence gathering | haiku | read-only |
| `agents/gc-auditor.md` | Plan stress-testing | sonnet (security lane: opus) | read-only |
| `agents/gc-executor.md` | Plan implementation | sonnet | read-write |
| `agents/gc-reviewer.md` | Code review | sonnet | read-only |
| `agents/gc-researcher.md` | External research | sonnet | web-access |

> **Format note:** gc-auditor's colon-form Model cell — `sonnet (security lane: opus)` — documents that persona's dual tiers in this reference table. It is deliberately distinct from the paren-form elevated-dispatch marker `(security lane)` used in live dispatch tables (gc-review's security rows), which `hooks/lib/tier-consistency-check.js` matches as an exact substring. Never unify the two formats: converting a colon-form cell to paren-form (or back) silently changes how the tier checker classifies the row.

**Usage pattern:** When dispatching, include the agent file content at the top of the Agent tool `prompt` parameter, followed by the specific context package (Design Brief, Execution Context Package, etc.).

**When to add a new agent file:** Only for a genuinely new worker role with a distinct mode and output contract. Inline tasks do not need agent files.

**Gate binding, not just gate wording:** when a patch adds a permission exception to a shared agent file that's keyed to an exact-match condition (e.g. "only when the lens/role assignment is exactly `X`"), the calling skill's own dispatch instructions must be updated in the *same* patch to actually pass that exact value — never trust that the calling skill's existing dispatch convention (often a free-text description, not a bare token) happens to satisfy a condition written after the fact. Ship the gate's wording and its dispatch-side binding together; a gate that's airtight in isolation but never actually satisfied by any real dispatch silently disables the feature it was meant to enable.

Body structure:
1. **Role statement** — what posture to adopt
2. **When to use** — trigger conditions (if not obvious from description)
3. **Reasoning workflow** — the HOW, organized logically
4. **Anti-patterns** — failure modes with root-cause framing

## Writing a New Skill

1. **Identify the behavioral gap** — what reasoning does the agent currently fail to apply?
2. **Write the principle** — one sentence capturing the core insight
3. **Write the reasoning workflow** — how to apply the principle step by step (no tool names)
4. **Write 3-5 anti-patterns** — describe each with its root cause, not just the symptom
5. **Write the frontmatter** — name, description, phase, tags, requires
6. **Place the file** at `~/.claude/skills/gc-{name}/SKILL.md`

## Amending an Existing Skill

When a behavioral gap maps to an existing skill:

1. **Read the current skill** — understand what it already teaches
2. **Identify the specific gap** — which section or principle is missing or misleading?
3. **Write the minimal patch** — add/update only the section that addresses the gap
4. **Verify the patch doesn't contradict existing content** — if it does, explain the conflict and ask the user which framing to keep
5. **Apply the patch** — edit the file; do not rewrite sections that are working

## Self-Referential Note

This skill was designed using the principles it describes. If you find a behavioral gap in `gc-skill-author` itself, use `/gc-correct` to capture it and then apply a minimal patch here.

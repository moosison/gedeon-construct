---
name: gc-pipeline
description: "Overview of the gc-* development pipeline. Shows stage order, deliverables, iteration rules, and hand-off messages. Start here to understand the full flow."
phase: pipeline
tags: [overview, pipeline, lifecycle]
---

# Gedeon Construct Pipeline

A structured pipeline for AI-assisted software development, from project inception to shipped code. Each stage has a dedicated skill.

## Pipeline Flow

```
/gc-bootstrap
        │
        ▼  (situational brief + design requirements)
/gc-discuss [optional stage 1.5]
        │
        ▼  (requirements captured to CONTEXT.md)
/gc-plan
        │
        ▼  (plan file written)
/gc-preflight  ◄──┐  (iterative — run as many times as needed)
        │        │
        ▼        │  (update plan → re-run preflight)
/gc-execute    │
        │        │
        ▼        │
/gc-review ────┘  (plan gaps found → edit plan → preflight again)
        │
        ▼  (terminal — captures learnings + compresses context)
/gc-eop
```

## Stage Summary

| # | Skill | Primary Deliverable |
| --- | --- | --- |
| 1 | `/gc-bootstrap` | Situational brief + architecture analysis |
| 1.5 | `/gc-discuss <phase>` | Requirements decisions → `{phase}-CONTEXT.md` (optional) |
| 2 | `/gc-plan [phase]` | `{slug}.plan.md` with Cynefin-tagged atomic steps |
| 3 | `/gc-preflight` | Pre-flight review with confidence % (iterative) |
| 4 | `/gc-execute [phase]` | Code changes + updated plan todos |
| 5 | `/gc-review [phase]` | Code review report with severity classifications |
| 6 | `/gc-eop` | Session digest + memory learnings (terminal) |

## Specialist Skills (invoke independently)

| Skill | When |
| --- | --- |
| `/gc-cynefin` | Domain classification needed before planning |
| `/gc-probe` | Unknown facts that need discovery before acting |
| `/gc-platform-review` | Reviewing a platform or API design |
| `/gc-ui` | Building or reviewing user interfaces |
| `/gc-shebang` | Generating or updating `@ai-rules` file headers |
| `/gc-debug` | Investigating a bug with scientific method |
| `/gc-skill-author` | Writing or amending gc-* skill files |

## Project Lifecycle Skills

| Skill | When |
| --- | --- |
| `/gc-new-project` | Starting a new project — creates `.construct/` tree |
| `/gc-milestone <name>` | Adding a milestone to an existing project |
| `/gc-progress` | View current project progress across phases |
| `/gc-ship` | Create a PR to ship completed work |
| `/gc-note [text]` | Capture a quick idea or observation |
| `/gc-correct` | End-of-session behavioral gap capture |

## Iteration Rules

| Loop | Behavior |
| --- | --- |
| **preflight → preflight** | Always allowed. Run as many times as needed. |
| **preflight → plan** | Update plan from Path to Green, then re-run `/gc-preflight`. |
| **execute → preflight** | Allowed if execution reveals plan gaps. |
| **review → preflight** | Allowed if review finds plan-level issues. |

## Execute Gate (Soft)

`/gc-execute` checks for the latest pre-flight review:

- **Gate: PASS** → proceed
- **Gate: STOP** → show blockers; user may update plan + re-run `/gc-preflight`, or explicitly override
- **No report** → recommend `/gc-preflight` first; user may override

## Command Handoffs

| After skill | Next step |
| --- | --- |
| `/gc-bootstrap` | *"Bootstrap complete. Run `/gc-discuss` to elicit requirements, or `/gc-plan` to plan directly."* |
| `/gc-discuss` | *"Requirements captured. Run `/gc-plan`."* |
| `/gc-plan` | *"Review the plan above. When approved, run `/gc-preflight`."* |
| `/gc-preflight` | *"Gate: {PASS|STOP} ({N}% display). PASS → `/gc-execute`; STOP → fix plan, `/gc-preflight` again."* |
| `/gc-execute` | *"Execution complete. Run `/gc-review`."* |
| `/gc-review` | Push if clean; then *"Run `/gc-eop` to close the pipeline."* |
| `/gc-eop` | *"Pipeline complete. Session learnings captured."* (terminal) |

## Pipeline State

Stage skills write `{"stage":"<name>","slug":"<plan-slug>","updatedAt":"<ISO timestamp>"}` to `.claude/gc-pipeline.json` in the project root. The `slug` field is optional in legacy/pre-t1–t5 states. All five pipeline writers derive slug from the plan filename stem (`{slug}.plan.md` → strip `.plan.md`) — confirmed by the plan `name:` frontmatter when present. **Slug identity invariant:** `feature-slug` at gc-plan birth = plan filename stem = plan `name:` frontmatter = gc-pipeline.json `slug` = artifact filename prefixes. These must remain equal — gc-resume's artifact ladder depends on this. Informational only — does not gate execution.

## Skill Freshness (Long or Resumed Sessions)

gc-* skill files can be updated between invocations within the same long-running or resumed session. Before relying on a specific skill's detailed behavior (Gate thresholds, report formats, auditor rosters, verification steps) after a multi-day gap or context compaction, re-invoke the skill (or re-read its SKILL.md) rather than trusting a remembered or summarized description from earlier in the session. A compacted summary describes what a skill did at invocation time — not necessarily what it currently does.

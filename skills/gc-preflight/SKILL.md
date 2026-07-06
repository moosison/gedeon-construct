---
name: gc-preflight
description: "Stage 3 of the pipeline. Stress-tests a plan file before execution by running parallel audits and producing a confidence score. Run iteratively until ≥90% confidence. Requires a plan file from /gc-plan."
phase: pipeline
requires:
  - gc-plan
tags: [planning, verification, confidence, cynefin]
model: opus
---

// @ai-rules:
// 1. [Constraint]: Context package template has 6 sections. Section 6 is always present (either with CONTEXT.md content or an explicit not-found note).
// 2. [Pattern]: Depth-3 glob for CONTEXT.md: .construct/phases/*/*/*-CONTEXT.md — three wildcard levels.
// 3. [Gotcha]: Section 6 suppression is conditional (contradicting evidence only), not absolute — auditors may still flag conflicts with recorded decisions.
// 4. [Pattern]: gc-pipeline.json write includes "slug" field derived from plan frontmatter name: field (filename stem as fallback).
// 5. [Gotcha]: gc-resume's artifact ladder matches '{slug}-Pre-Flight-Review_*.md' — if this filename pattern changes, update gc-resume Step 2's artifact ladder.
// 6. [Pattern]: Auditor D (lean) always runs — not optional. Lean DELETE verdicts are scope blockers in Gap Analysis; lean score (LEAN/TRIM/OVERBUILT) appears in Confidence Dashboard.
// 7. [Gotcha]: Report section 5 is Lean Scope Review (always); Security Threat Model is section 6; Platform Architecture Review is section 7; Auditor Disagreements 8; Path to Green 9.

# Pre-Flight Review

**Stage 3 of the pipeline.** Stress-tests a plan by dispatching parallel auditors, then produces a unified confidence report. Run as many times as needed — each run writes a new timestamped report.

**Prior stage:** `/gc-plan`
**Next stage:** `/gc-execute` (when confidence ≥ 90%)

> **Pipeline state:** At the start of this skill, write `{"stage":"pre-flight","slug":"<plan-slug>","updatedAt":"<current ISO timestamp>"}` to `.claude/gc-pipeline.json` in the current project directory. Create `.claude/` first if absent. Slug from plan frontmatter `name:` field; fallback to filename stem (strip `.plan.md`).

## Execution Steps

### Step 1: Build Pre-Flight Context Package

Read the plan file from disk. Build this package — auditors receive the **entire package**:

```markdown
## Pre-Flight Context Package: {plan-slug}

### 1. Plan Identity
- Path, name/overview, workspace root

### 2. Full Plan Text
(complete plan body + YAML frontmatter — every section, every todo)

### 3. Plan Structure Index
- Numbered atomic steps with Cynefin tags
- Complex/probe-required steps highlighted
- Files referenced in the plan

### 4. Prior Art & Iteration History
- All prior pre-flight reports for this plan (summarize confidence trend)
- If plan changed since last pre-flight: note what changed

### 5. Audit Mission
Stress-test the plan above. Classify each step (Cynefin), score confidence, find gaps. Do not execute code.

### 6. Prior Discussion Context (if present)
Glob `.construct/phases/*/*/*-CONTEXT.md` (depth-3) for the current phase. If found, read and
include all decisions and constraints below. Auditors should respect recorded decisions; flag
only if contradicting evidence exists in the plan or codebase — do not re-litigate stakeholder
choices. If not found, include this note: 'gc-discuss was not run or no CONTEXT.md found —
auditors should flag any gray areas as gaps.' Section 6 is always present in the package.
```

Never dispatch auditors with only a plan excerpt — they need the full plan. Paste the plan's literal text into the dispatch prompt, not an orchestrator-condensed paraphrase — condensing has caused both false negatives (a fully-specified section read as a stub) and false positives (a fixed item read as still-broken) in past runs. When an auditor's finding hinges on a claim about an external file (a prior auditor's verdict, a roadmap line, an existing skill's structure), instruct that auditor to Read the real file itself before accepting or repeating the claim.

Every auditor now returns a **Citation column** per finding (per `agents/gc-auditor.md` and `agents/gc-lean-auditor.md`'s updated tables) — relative path + line(s) + a backtick-quoted exact snippet, or any `n/a`-prefixed value if the finding cites nothing external, per `hooks/lib/plan-verifier.js`'s canonical `verifyCitation`/`extractCitations` contract. These citations are mechanically verified in Step 2.5, not merely trusted.

### Step 2: Parallel Audits

Dispatch **4 parallel pre-flight auditors** in one message. All read-only.

| Auditor | Model | Agent file | Lens |
| --- | --- | --- | --- |
| **A** | `sonnet` | `agents/gc-auditor.md` | Cynefin + architecture depth, integration patterns |
| **B** | `sonnet` | `agents/gc-auditor.md` | Gap analysis, missing context, plan completeness |
| **C** | `sonnet` | `agents/gc-auditor.md` | Contracts, platform abstractions, edge cases |
| **D — Lean** | `sonnet` | `agents/gc-lean-auditor.md` | YAGNI ladder per atomic step — flags speculative scope, duplication, unnecessary dependencies before execution |

**Optional security lane (5th auditor):** When the plan touches auth/authz, secrets, public endpoints, PII, or trust boundaries — dispatch a security-focused auditor using `opus` for maximum depth. Mission: plan-level threat model gaps only (not code audit). Also trigger when the plan introduces code that resolves a file path or URL built from externally-influenced input (user-authored text, LLM-generated content, citation-style references, template variables) — even if none of the domains above are otherwise present. Path/URL resolution from untrusted input is a self-contained vulnerability class (traversal, arbitrary read, SSRF) that the other trigger conditions don't reliably catch; a plan can be free of auth/secrets/PII/endpoints and still ship a real vulnerability of this shape.

**Optional platform lane (6th auditor):** When the plan introduces abstractions, shared services, APIs consumed by other teams, or IaC modules — dispatch using `sonnet`, agent: `agents/gc-platform-reviewer.md`. Mission: Hohpe 6-test + 7-C audit at plan level. Trigger phrase: "others will build on top of this."

Wait for all auditors before Step 3.

> **Tooling note:** All file inspection must use dedicated read tools (file reading, pattern search, path matching). Avoid shell commands for read operations — they trigger permission prompts in Claude Code. Reserve shell tools only for operations the dedicated tools cannot perform (e.g. encoding manipulation, process control). Exception: the citation/control-flow/freshness verifier (`hooks/lib/plan-verifier-cli.js`) is a deliberate, sanctioned Bash invocation — it performs a check no dedicated read tool can (comparing structured claims against file content programmatically), not an oversight of this note.

### Step 2.5: Citation Verification

Each auditor's Citation column is mechanically verified before merging — the skill-instruction half of the same mechanism `hooks/gc-pre-write-guard.js` enforces automatically as a hook-level backstop for file writes.

For each auditor (A, B, C, D), in turn:

1. Write that auditor's raw response text verbatim to a scratch file in the plan store: `~/.claude/gedeon/plans/{plan-slug}-auditor-{A|B|C|D}-scratch.md`. This step is required — auditor output exists only as in-conversation text at this point, and `extract-citations` needs a real on-disk file.
2. Run `node hooks/lib/plan-verifier-cli.js extract-citations <scratch-file>` — emits one `{step}\t{citationText}` pair per row of the Citation-column table, per `hooks/lib/plan-verifier.js`'s canonical `extractCitations` contract, followed by a trailing `SKIPPED\t{N}` line (the anonymous count of malformed rows — `extractCitations` computes this directly, no separate tally needed).
3. Set aside the trailing `SKIPPED\t{N}` line — read `N` for the malformed-row count below, and do NOT pass this line into the next step. Of the remaining `{step}\t{citationText}` pairs, drop any whose `citationText` is `n/a`-prefixed (case-insensitive) — auto-valid, not sent for verification.
4. Pipe the remaining pairs into `node hooks/lib/plan-verifier-cli.js verify-citations` (stdin, one `{step}\t{citationText}` pair per line). Read back one `{step}\tPASS` or `{step}\tFAIL: {reason}` line per input pair. The `step` tag identifies which finding each result belongs to directly — never infer by position, since two findings can carry identical or near-identical citation text.
5. Delete the scratch file as the last action for that auditor, **unconditionally** — whether `extract-citations`/`verify-citations` succeeded or failed. A mid-run failure must not leave an orphaned scratch file in the plan store.

If the `SKIPPED` count (`N`) from step 2 is greater than 0, surface it as an **anonymous count only**: "N row(s) in Auditor {A|B|C|D}'s output could not be parsed for citation checking." A skipped row has no `step` tag by design — extraction cannot determine which finding was affected. This does not identify the specific finding, and does not abort verification for that auditor's other findings or any other auditor's findings. (This is deliberately the same anonymous-count treatment `hooks/gc-pre-write-guard.js`'s citation backstop uses for the identical shared mechanism — keep the two consistent.)

Carry every `{step}\tFAIL: {reason}` result forward into Step 3's merge.

### Step 3: Merge (Pessimistic)

| Rule | Policy |
| --- | --- |
| Confidence per task | **Minimum** across auditors |
| Overall confidence | **Minimum** across auditors |
| Cynefin | **More complex** wins |
| Gaps / blockers | **Union** — one auditor flag = real gap |
| Contradictions | Flag for user; do not silently resolve |
| Lean DELETE verdicts | Treated as scope blockers — listed in Lean Scope Review and Gap Analysis |
| Lean score | Worst score (LEAN/TRIM/OVERBUILT) — included in Confidence Dashboard |
| Citation verification failed | Exclude that finding (identified by its `step` tag from Step 2.5, never by position) from the confidence score entirely — record it in Gap Analysis as an unverified/failed-citation claim |
| Citation row unparseable (malformed) | No per-finding exclusion possible — no `step` tag exists. Surface Step 2.5's anonymous count in Gap Analysis; does not gate any specific finding or block the rest of that auditor's results |

Cross-issue correlation: Collapse findings that share one root cause before finalizing.

Produce **Auditor agreement matrix** (task × A/B/C/D × confidence).

### Step 4: Write Report

Path: `~/.claude/gedeon/plans/{plan-slug}-Pre-Flight-Review_{YYYY-MM-DD_HHMM}.md`

Required sections:
1. Confidence Dashboard (overall %, Ready/Caution/Stop, top blockers, lean score)
2. Task-by-Task Analysis (min confidence, agreement column)
3. Integration Risk Matrix
4. Gap Analysis (ambiguity, missing context, risk, source auditor)
5. Lean Scope Review (always — Auditor D verdict table, delete/simplify lists, lean score)
6. Security Threat Model (if security lane ran)
7. Platform Architecture Review (if platform lane ran)
8. Auditor Disagreements (if any)
9. Path to Green (blockers + suggestions)

### Step 5: Present

Paste the full Pre-Flight Dashboard in the conversation.

State outcome by tier:

| Confidence | Tier | Action |
| --- | --- | --- |
| ≥ 90% | **Ready** | Report confidence score and propose execute as Gedeon. |
| 70–89% | **Caution** | Report confidence, surface Path to Green, propose re-preflight as Gedeon. |
| < 70% | **Stop** | Report confidence and critical gaps as Gedeon. Suggest gc-correct if this pattern recurs. |

**Stop status is advisory** — user may always update plan and re-run.

When verdict is **Stop** (< 70%): read `.construct/STATE.md`. If `## Error Counts` section is absent, create it with defaults (`gc-execute: 0`, `gc-preflight: 0`, `gc-bootstrap: 0`). Increment `gc-preflight` by 1. Write the updated section back with the Write tool.

## Iteration Loop

```
/gc-plan → /gc-preflight → (edit plan) → /gc-preflight → … → /gc-execute
                  ▲                              │
                  └──────── plan gaps ───────────┘
```

Each `/gc-preflight` run is independent. Never say "you already ran preflight."

## Anti-Patterns

- Auditing from plan excerpt while full file exists on disk
- Auditors without full plan text in the prompt
- Averaging confidence scores (always take minimum)
- Discarding a gap because only one auditor found it
- Pushback when user runs `/gc-preflight` again
- Building a dispatch package by paraphrasing the plan instead of pasting its literal text
- Accepting a claim about an external file (roadmap, another skill's structure, a prior auditor's verdict) without an auditor independently re-checking the source

---
name: gc-review
description: "Stage 5 of the pipeline. Runs a multi-reviewer code review panel against changes from /gc-execute. Produces a structured review report with severity-classified findings. Security reviewers mandatory unless diff is docs-only."
phase: pipeline
requires:
  - gc-execute
tags: [review, security, code-quality, pessimistic]
model: opus
---

// @ai-rules:
// 1. [Pattern]: @ai-rules gaps noted in Step 1, /gc-shebang proposed in Step 7 closing — not mid-review.
// 2. [Constraint]: Never interrupt the review cycle to generate @ai-rules headers. Post-cycle only.
// 3. [Pattern]: gc-pipeline.json write includes "slug" field derived from plan frontmatter name: field (filename stem as fallback).
// 4. [Gotcha]: gc-resume's artifact ladder matches '{slug}-Code_Review_*.md' — if this filename pattern changes, update gc-resume Step 2's artifact ladder.

# Code Review (Pipeline Stage 5)

**Stage 5 of the pipeline.** Runs a specialized review panel against the diff from `/gc-execute`. Produces a structured review report.

**Prior stage:** `/gc-execute`
**Next stage:** `/gc-eop` (if clean) or fix findings → `/gc-preflight` again

> **Pipeline state:** At the start of this skill, write `{"stage":"review","slug":"<plan-slug>","updatedAt":"<current ISO timestamp>"}` to `.claude/gc-pipeline.json` in the current project directory. Create `.claude/` first if absent. Slug from ARGUMENTS or plan frontmatter `name:` field; fallback to filename stem.

## Execution Steps

### Step 1: Diff Scope

1. Identify all modified files (`git diff --staged` or user scope).
2. Read `@ai-rules` headers on every touched file.
   > **2b. Note:** Any file missing an `@ai-rules` header — record it. Add those files to the **Downstream Impact** section of the report (Step 7). After the full review cycle completes and before proposing the next pipeline stage, propose running `/gc-shebang` on those files. Do not pause or interrupt the review to generate headers mid-review.
3. List consumers/callers of modified exports (initial pass).
4. Estimate diff size (lines changed) and domains touched (API, auth, DB, UI, platform, etc.).
5. **Security surface scan** — flag if diff touches: auth/authz, secrets/env, user input parsing, public endpoints, crypto/TLS, SQL/command construction, file/path handling, dependency manifests, logging of sensitive data.

### Step 2: Code Review Context Package

Resolve {plan-dir} per the Project-Slug & Plan-Directory Resolution Procedure (the gc-plan skill's Step 7, ~/.claude/skills/gc-plan/SKILL.md — steps 1-3 for {project-slug}, step 6 for {plan-dir}; step 7's duplicate-layout precedence rule is scoped to discovery consumers only — gc-resume/gc-ship — and doesn't apply here). Read the plan from {plan-dir}/{plan-slug}.plan.md if available.

```markdown
## Code Review Context Package: {plan-slug}

### 1. Plan Identity
- Plan path, overview
- Full plan text (complete file)
- Pre-flight report summary if available

### 2. Execution Scope
- Which plan todos were implemented
- Commits or summary of changes

### 3. Diff Scope
- Modified files (absolute paths), line count
- Staged diff OR read files + git diff per path
- Hexagonal layer per file (Domain / Port / Adapter / Infrastructure)

### 4. Consumer Map
- Callers/consumers from Step 1

### 5. Review Mission
Review changes against plan intent. System-wide impact, contracts, zero deferred debt. Do not rubber-stamp.
```

### Step 3: Review Panel Triage

Select reviewers based on the diff. Always include:

| Reviewer | Model | Agent file | Lens |
| --- | --- | --- | --- |
| **Principal** | `opus` | `agents/gc-reviewer.md` | Architecture, contracts, downstream impact |
| **Correctness** | `opus` | `agents/gc-reviewer.md` | Logic, edge cases, state bugs |
| **Maintainability** | `opus` | `agents/gc-reviewer.md` | Structure, coupling, naming, complexity |
| **Plan Alignment** | `opus` | `agents/gc-reviewer.md` | Implementation vs plan todos (skip if no plan) |
| **Security Exploits** | `opus` | `agents/gc-reviewer.md` | Auth/authz, injection, input validation, IDOR, SSRF in changed code |
| **Security Audit** | `opus` | `agents/gc-reviewer.md` | Secrets/credentials in diff, OWASP patterns, unsafe crypto, sensitive data in logs |

**Pass each row's `Model` value explicitly as the `model` parameter on the Agent tool call** — see `agents/gc-brain.md`'s Worker Dispatch Contract for why this is mandatory. The conditional reviewers below use the same `agents/gc-reviewer.md` persona and `opus` tier as the table above — pass `model: "opus"` explicitly for these too, never left implicit.

**Security reviewers are mandatory** for every run after `/gc-execute`. Only skip if the diff is **docs-only** (markdown, comments, no executable/config changes).

Add conditional reviewers when triggered (all `opus`, `agents/gc-reviewer.md`):
- Tests changed or production logic without test updates → Testing reviewer
- API routes, types, serialization → API contract reviewer
- Retries, timeouts, error handling, async handlers → Reliability reviewer
- Queries, loops, caching, I/O-heavy paths → Performance reviewer

### Step 4: Parallel Reviews

Dispatch all reviewers in one message — all read-only.

Each reviewer receives: full Code Review Context Package + their specific role/lens.

**Wait** for all reviewers before Step 5.

### Step 5: Merge (Pessimistic)

| Rule | Policy |
| --- | --- |
| Risk level | **Highest** across reviewers |
| Findings | **Union** all — tag with reviewer ID |
| Severity (same issue) | **Highest** wins |
| Security findings | Union; **any exploitable issue = HIGH** unless proven false positive with evidence |

Cross-issue correlation: Collapse shared root-cause findings.

Any **HIGH** security finding → overall risk **cannot** be Low; blocks push until fixed or explicitly accepted by user.

#### Systematic Pattern Detector

After merging all findings, check: if the same class of finding (same severity level + same domain: logic / security / typing / performance / naming) appears across 3 or more files, OR the same reviewer flags the same issue type in 2 or more separate findings — add a "Systematic Pattern" block after the findings table:

```
⚠ Systematic pattern detected: {severity} {domain} issue across {N} files.
This may reflect a skill gap, not a one-off mistake.
Run /gc-correct after fixes to prevent recurrence.
```

Before editing this file, read the current findings table format to understand how findings are classified.

### Step 6: Verification Gate

| Check | Result |
| --- | --- |
| Unit tests | pass/fail |
| Typecheck | pass/fail |
| Build | pass/fail |

Do NOT approve push if any check fails.

### Step 7: Write and Present

Path: `{plan-dir}/{plan-slug}-Code_Review_{YYYY-MM-DD_HHMM}.md`

Sections: Summary (reviewers + lenses), Downstream Impact, Findings & Fixes (with Flagged By column), Reviewer Disagreements, Verification Gate table.

Paste full report in conversation.

Report review verdict (clean or findings with severity summary) and propose next stage as Gedeon.

## Anti-Patterns

- Only one reviewer with a generic lens
- Reviewers without full plan + diff context
- Taking lowest severity (always pessimistic — take highest)
- Skipping security reviewers unless diff is docs-only

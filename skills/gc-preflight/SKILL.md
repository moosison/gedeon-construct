---
name: gc-preflight
description: "Stage 3 of the pipeline. Stress-tests a plan file before execution by running parallel audits and producing a binary mechanical Gate (PASS/STOP). Run iteratively until Gate: PASS. Requires a plan file from /gc-plan."
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
// 8. [Pattern]: Self-Drive Loop (--auto-pipeline): `autoPipeline` in gc-pipeline.json is consume-on-read — the Pipeline state write always clears it to `false` and captures the pre-override value as `wasAutoPipeline`. Step 4's report carries a durable `**Self-Drive Loop this round:** active|not active` line (re-read from disk, never recalled) that gates auto-revise-and-re-run on STOP or auto-continue on PASS; the loop's own bound is streak-3, independent of Fable-5 dispatch success.

# Pre-Flight Review

**Stage 3 of the pipeline.** Stress-tests a plan by dispatching parallel auditors, then produces a unified confidence report. Run as many times as needed — each run writes a new timestamped report.

**Prior stage:** `/gc-plan`
**Next stage:** `/gc-execute` (when Gate: PASS)

> **Pipeline state:** At the start of this skill, perform the canonical generic read-merge-write mechanism (the mechanism `gc-plan/SKILL.md`'s `> **Pipeline state:**` blockquote establishes, item 2 of its Definition of Done): read the existing `.claude/gc-pipeline.json` first (tolerating absent/corrupt as an empty object to merge into) — capture the pre-override `autoPipeline` value into local, in-turn orchestrator memory as `wasAutoPipeline` (`true` or absent/`false`; used below, in the Self-Drive Loop subsection, to decide whether this round is self-driving) — then spread every key already present in it forward, and override `stage`, `slug`, `updatedAt`, and unconditionally `autoPipeline: false` (this write always clears the field as part of the merge, every invocation, whether or not `--auto-pipeline` was ever used — the same consume-on-read clear `gc-plan`'s and `gc-execute`'s own writes perform). Create `.claude/` first if absent. Slug from plan frontmatter `name:` field; fallback to filename stem (strip `.plan.md`).
>
> **Durability:**
> - **Risk:** in-context recall of `wasAutoPipeline` alone is not relied on across this skill's own token-heavy span (Step 2's 4-6 parallel auditor dispatches through Step 4's report write) — a real risk given this codebase's own established precedent that context compaction can occur mid-session (`gc-execute/SKILL.md`'s "re-read every file... even if the summary shows the file was read before compaction" Anti-Pattern).
> - **Mitigation:** Step 4's report gains a mandatory new line in its Confidence Dashboard section: `**Self-Drive Loop this round:** {active | not active}` (active iff `wasAutoPipeline`) — a durable, disk-backed record via a write this skill already unconditionally performs every round.
> - **Read-back contract:** Step 5's branch logic (see the Self-Drive Loop subsection below) must re-read this line from the just-written report file on disk (a fresh Read-tool call, not inferred from nearby conversational recency) before acting on it.
> - **Residual, disclosed-symmetric risk:** this durability fix protects the *read-back* side (Step 5 onward) but `wasAutoPipeline` must still survive in-context from Step 1 through Step 4's own report write — the same 4-6-auditor-dispatch span this fix's own rationale names as the risk. If lost in that narrower window, the report line defaults to "not active," the same fail-safe direction `gc-execute/SKILL.md`'s own disclosed asymmetry takes for its own, shorter span: auto-mode silently exits under memory loss, never silently persists.
> - **Escalation-round exception:** that report's own compact format has no Confidence Dashboard section and explicitly skips Step 4's standard required-sections list, so this line is correctly omitted there, not a contract violation — a missing line reads as not-active, which is harmless, since the Self-Drive Loop subsection's own Streak-bound rule ends the loop on any escalation-attempt round regardless of report shape.

## Execution Steps

### Step 1: Build Pre-Flight Context Package

Resolve {plan-dir} per the Project-Slug & Plan-Directory Resolution Procedure (the gc-plan skill's Step 7, ~/.claude/skills/gc-plan/SKILL.md — steps 1-3 for {project-slug}, step 6 for {plan-dir}; step 7's duplicate-layout precedence rule is scoped to discovery consumers only — gc-resume/gc-ship — and doesn't apply here). Read the plan from {plan-dir}/{plan-slug}.plan.md. Build this package — auditors receive the **entire package**:

```markdown
## Pre-Flight Context Package: {plan-slug}

### 1. Plan Identity
- Path, name/overview, workspace root

### 2. Full Plan Text
(complete plan body + YAML frontmatter — every section, every todo)

### 3. Plan Structure Index
- Numbered atomic steps with Cynefin tags
- Complex/probe-required steps highlighted
- Files referenced in the plan — this is the canonical "merged affected-files list" referenced throughout this skill (the fact-write scope below, the Override branch, and the Fable-5 Stuck-in-STOP Escalation subsection): the union of every file path any atomic step's evidence/citation/hash annotation names.

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

Code-review fix (this exact condensing mistake recurred twice in one session's preflight rounds despite the paragraph above already existing): pasting the literal text is necessary but not sufficient, since it depends entirely on the orchestrator's own paste discipline in the moment — which has now failed at least twice across separate milestones. As a redundant backstop, always also include the plan file's absolute path (already captured in Section 1 of the Context Package above) and instruct every auditor to independently Read it directly with the Read tool before finalizing findings, rather than relying solely on the pasted text being complete. This mirrors the pattern `/gc-review` already uses successfully for its reviewer panel.

Every auditor now returns a **Citation column** per finding (per `agents/gc-auditor.md` and `agents/gc-lean-auditor.md`'s updated tables) — relative path + line(s) + a backtick-quoted exact snippet, or any `n/a`-prefixed value if the finding cites nothing external, per `hooks/lib/plan-verifier.js`'s canonical `verifyCitation`/`extractCitations` contract. These citations are mechanically verified in Step 2.5, not merely trusted.

#### Fable-5 Stuck-in-STOP Escalation

Before dispatching the panel below, check for 3 consecutive `Gate: STOP` verdicts for this plan slug.

Run `node hooks/lib/ledger-cli.js pull` via Bash, piping the merged affected-files list (Step 1, Plan Structure Index) as a JSON array on stdin — same call shape as `gc-eop/SKILL.md:91`. Filter the returned array, in prose, to facts where `planSlug` equals this plan's slug AND (`type === "gate-verdict"` OR `type === "gate-override"`). Sort by `verifiedAt` descending. Walk from newest, using a per-type rule (not a shared `verdict` check — a `gate-override` fact's `verdict` is always `true` for an unrelated reason and must never be read as a Gate: PASS):
- `type === "gate-verdict"` and `verdict === false` → increment the streak count, continue walking.
- `type === "gate-verdict"` and `verdict === true` → stop. Streak ended by an actual Gate: PASS.
- `type === "gate-override"` → stop. Streak ended by the user proceeding past a STOP.

Note: this count is ledger-era-only (Verified-Facts Ledger v1 shipped 2026-07-08). A plan with pre-existing STOP history from before that date won't have those older rounds counted — it continues to receive the normal full sonnet panel every round, exactly as it does today, until 3 *new*, ledger-recorded STOPs accumulate. This is an accepted, disclosed limitation, not a defect to fix here: no plan currently in flight has an unresolved pre-ledger STOP streak, and the access window itself closes 2026-07-19 (extended from 2026-07-12 on 2026-07-13) — building migration logic for a population that doesn't currently exist is out of scope.

If the streak count **reaches exactly 3** (not "3 or more" — a one-time trigger per streak, bounding Fable-5 spend): apply the Availability & Fallback Contract (`agents/gc-fable5-advisor.md`). If available, dispatch per the table below, with the full literal text of this plan (frontmatter + entire body) plus the full literal text of every prior round's `{slug}-Pre-Flight-Review_*.md` report for this plan slug — pasted in full, not the Section 4 "summarize confidence trend" bullet from Step 1's context package, which is a condensed pointer for human/auditor skimming, not a substitute for Duty 1's actual input contract (`agents/gc-fable5-advisor.md`: "Input = full plan text + every prior round's Pre-Flight-Review report").

| Escalation dispatch | Model | Agent file | Duty |
| --- | --- | --- | --- |
| **Fable-5 synthesis** | `fable` | `agents/gc-fable5-advisor.md` | Stuck-in-STOP Escalation Synthesis |

**On successful escalation dispatch:** Step 2 (panel dispatch) and Step 3 (auditor-merge) are both skipped for this round — there is nothing to merge, since no auditors ran. Step 2.5 (Citation Verification) naturally no-ops (no auditor citations exist) and does not block Step 2.6's aggregation. Step 2.6 (Mechanical Gate Checks) still runs, unconditionally and unchanged — its `mechanicalGateStatus` is computed exactly as normal from the hash/control-flow/tier checks, which depend only on the plan's own file annotations, never on auditor output. Write a compact **Escalation Report** to the *same path and filename convention as the standard report* ({plan-dir}/{plan-slug}-Pre-Flight-Review_{YYYY-MM-DD_HHMM}.md, per Step 4's `Path:` instruction below) — only the section content differs: the report's first line, before any other content, is a standalone `**Report Type: Escalation**` marker (so a future round's Prior Art gathering, or Fable-5 itself if ever re-dispatched for this plan, can distinguish this from a standard auditor-panel report without inferring it from the absence of a Confidence Dashboard), then Fable-5's diagnosis, its recommended plan revision, the Step 2.6 mechanical gate status, and a standalone `**Gate: STOP**` line — rendered unconditionally on an escalation round, since the round exists precisely because 3 consecutive STOPs already occurred; the escalation's role is diagnosing why, not re-determining whether. Fable-5's diagnosis may reference or quote prior rounds' own `**Gate: STOP**` lines; this is accepted rather than restricted, since an escalation round's own Gate line is always STOP regardless of which line a naive regex-based consumer happens to match first — the two are never in disagreement on this report type. Reusing the standard path keeps `evidenceFile` resolution and `gc-resume`'s `{slug}-Pre-Flight-Review_*.md` artifact-ladder match working unchanged. Record the `gate-verdict` ledger fact exactly as any STOP round would (Step 4's existing instruction, unchanged).

Escalation is a one-time trigger per streak, not a recurring one, and the streak count is monotonic while the plan keeps failing: an escalation round's own `gate-verdict` fact is recorded exactly as any other STOP (per the instruction above), with no field distinguishing it from an ordinary panel-dispatched STOP — the walk above has no branch that treats "this STOP came from an escalation round" as a boundary. Concretely: a plan that escalates at its 3rd consecutive STOP and then keeps failing shows a streak of 4, 5, 6... on every subsequent round — the count never returns to exactly 3 on its own, so escalation does not re-fire, and the plan stays on the normal full-panel path indefinitely. The count only resets (and a future escalation becomes possible again) when an intervening `Gate: PASS` or override fact breaks the chain, per the walk's own stop conditions above. This is a deliberate, budget-conscious choice for a capped shared resource: a continuously-stuck plan earns one Fable-5 consult, not one per round — a second one requires first passing or being explicitly overridden, not just continuing to fail. Repeat-escalation policy beyond this is left to a future milestone if it ever proves too conservative in practice. Note: the exactly-3 trigger is causally blind — it cannot distinguish a genuinely, substantively stuck plan from one whose 3rd STOP happened to include an over-conservative or erroneous auditor judgment; a plan can burn its one escalation on a streak that includes noise. Accepted as a v1 limitation, consistent with this plan's other disclosed simplifications (the ledger-era-only count, the in-session-only Complex-step counter): the fallback is never worse than today (the normal full panel continues every subsequent round), and building cause-aware escalation logic is a real, non-trivial mechanism for a feature with days, not months, of remaining runway.

If unavailable (date past 2026-07-19, or dispatch fails per the Contract's retry rule): render `⚠ Fable-5 unavailable — falling back to full sonnet auditor panel ({reason})` and proceed to Step 2 below, unchanged from today's behavior.

If the streak count is below 3: proceed to Step 2 below — no behavior change.

### Step 2: Parallel Audits

If the Fable-5 Stuck-in-STOP Escalation subsection above already dispatched the synthesis for this round, this step and Step 3 are both skipped — proceed directly to Step 2.6 (Mechanical Gate Checks), then write the Escalation Report as instructed above instead of the standard dashboard.

Dispatch **4 parallel pre-flight auditors** in one message. All read-only.

| Auditor | Model | Agent file | Lens |
| --- | --- | --- | --- |
| **A** | `sonnet` | `agents/gc-auditor.md` | Cynefin + architecture depth, integration patterns |
| **B** | `sonnet` | `agents/gc-auditor.md` | Gap analysis, missing context, plan completeness |
| **C** | `sonnet` | `agents/gc-auditor.md` | Contracts, platform abstractions, edge cases |
| **D — Lean** | `sonnet` | `agents/gc-lean-auditor.md` | YAGNI ladder per atomic step — flags speculative scope, duplication, unnecessary dependencies before execution |

**Pass each row's `Model` value explicitly as the `model` parameter on the Agent tool call** — see `agents/gc-brain.md`'s Worker Dispatch Contract for why this is mandatory. This applies equally to the two optional lanes below — their stated tier (`opus`, `sonnet`) must be passed explicitly too, same as any table row.

**Optional security lane (5th auditor):** When the plan touches auth/authz, secrets, public endpoints, PII, or trust boundaries — dispatch a security-focused auditor using `opus` for maximum depth. Mission: plan-level threat model gaps only (not code audit). Also trigger when the plan introduces code that resolves a file path or URL built from externally-influenced input (user-authored text, LLM-generated content, citation-style references, template variables) — even if none of the domains above are otherwise present. Path/URL resolution from untrusted input is a self-contained vulnerability class (traversal, arbitrary read, SSRF) that the other trigger conditions don't reliably catch; a plan can be free of auth/secrets/PII/endpoints and still ship a real vulnerability of this shape.

**Optional platform lane (6th auditor):** When the plan introduces abstractions, shared services, APIs consumed by other teams, or IaC modules — dispatch using `sonnet`, agent: `agents/gc-platform-reviewer.md`. Mission: Hohpe 6-test + 7-C audit at plan level. Trigger phrase: "others will build on top of this."

Wait for all auditors before Step 3.

> **Tooling note:** All file inspection must use dedicated read tools (file reading, pattern search, path matching). Avoid shell commands for read operations — they trigger permission prompts in Claude Code. Reserve shell tools only for operations the dedicated tools cannot perform (e.g. encoding manipulation, process control). Exception: the citation/control-flow/freshness verifier (`hooks/lib/plan-verifier-cli.js`) is a deliberate, sanctioned Bash invocation — it performs a check no dedicated read tool can (comparing structured claims against file content programmatically), not an oversight of this note.

### Step 2.5: Citation Verification

Each auditor's Citation column is mechanically verified before merging — the skill-instruction half of the same mechanism `hooks/gc-pre-write-guard.js` enforces automatically as a hook-level backstop for file writes.

For each auditor (A, B, C, D), in turn:

1. Write that auditor's raw response text verbatim to a scratch file: `{plan-dir}/{plan-slug}-auditor-{A|B|C|D}-scratch.md`. This step is required — auditor output exists only as in-conversation text at this point, and `extract-citations` needs a real on-disk file. **Do not condense to just the findings table** — condensing requires re-typing citation cells by hand, which is exactly where transcription errors (over/under-escaped `|`/`&`, dropped characters, wrong line numbers) get introduced. Write the auditor's complete raw message text unmodified; it is still cheaper and more reliable than a hand-retyped, error-prone summary.
2. Run `node hooks/lib/plan-verifier-cli.js extract-citations <scratch-file>` — emits one `{step}\t{citationText}` pair per row of the Citation-column table, per `hooks/lib/plan-verifier.js`'s canonical `extractCitations` contract, followed by a trailing `SKIPPED\t{N}` line (the anonymous count of malformed rows — `extractCitations` computes this directly, no separate tally needed).
3. Set aside the trailing `SKIPPED\t{N}` line — read `N` for the malformed-row count below, and do NOT pass this line into the next step. Of the remaining `{step}\t{citationText}` pairs, drop any whose `citationText` is `n/a`-prefixed (case-insensitive) — auto-valid, not sent for verification.
4. Pipe the remaining pairs into `node hooks/lib/plan-verifier-cli.js verify-citations` (stdin, one `{step}\t{citationText}` pair per line). Read back one `{step}\tPASS` or `{step}\tFAIL: {reason}` line per input pair. The `step` tag identifies which finding each result belongs to directly — never infer by position, since two findings can carry identical or near-identical citation text.
5. Delete the scratch file as the last action for that auditor, **unconditionally** — whether `extract-citations`/`verify-citations` succeeded or failed. A mid-run failure must not leave an orphaned scratch file in the plan store.

**Ordering (verify before revising):** complete this citation-verification cycle for ALL auditors before applying any in-round revision to the plan file. An orchestrator edit made between an auditor's read of the plan and this verification shifts or rewrites the cited lines, self-inflicting FAIL results that masquerade as auditor transcription errors. (Confirmed live, plan-artifact-relocation round 2, 2026-07-12: two auditors' plan citations failed purely because the orchestrator applied one auditor's own fixes before running verify-citations.)

If the `SKIPPED` count (`N`) from step 2 is greater than 0, surface it as an **anonymous count only**: "N row(s) in Auditor {A|B|C|D}'s output could not be parsed for citation checking." A skipped row has no `step` tag by design — extraction cannot determine which finding was affected. This does not identify the specific finding, and does not abort verification for that auditor's other findings or any other auditor's findings. (This is deliberately the same anonymous-count treatment `hooks/gc-pre-write-guard.js`'s citation backstop uses for the identical shared mechanism — keep the two consistent.)

Carry every `{step}\tFAIL: {reason}` result forward into Step 3's merge.

### Step 2.6: Mechanical Gate Checks

- For every atomic step in the plan carrying a `**File hash at plan time:** {digest}` annotation: **first** validate the file path against a strict relative-path charset (`^[A-Za-z0-9._/-]+$`, no leading `-`) — if it fails, record a mechanical-gate failure ("invalid file path in annotation") and do **not** invoke any CLI subcommand with it. If it passes, run `node hooks/lib/plan-verifier-cli.js hash <file>` and compare to the recorded digest. Mismatch (or `MISSING`) → mechanical-gate failure for that step.
- For every atomic step carrying a `**Control-flow check at plan time:** {file}:{entryLine}:{insertionLine}` annotation: validate `<file>` the same charset way, and validate `entryLine`/`insertionLine` are pure non-negative integers (`^\d+$`) before interpolating either into a command. If either validation fails, record a mechanical-gate failure without invoking the CLI. Otherwise re-run `node hooks/lib/plan-verifier-cli.js check-control-flow <file> <entryLine> <insertionLine>`. Three possible outputs, three distinct handling rules: (1) `CLEAR` → passes. (2) A populated list of flagged risky lines → mechanical-gate failure for that step **unless** the plan step text already has an explicit resolution for every flagged line. (3) `UNRESOLVED: ...` → **always** a mechanical-gate failure, with no exception and no escape hatch — there are no flagged lines to resolve, so "resolved" can never legitimately apply.
- If the plan's own affected-files list includes any `skills/gc-*/SKILL.md` or `agents/gc-*.md`: run `node hooks/lib/tier-consistency-check.js` from the workspace root and read its exit code — non-zero → mechanical-gate failure (tier drift).
- Aggregate into a single `mechanicalGateStatus`: `CLEAR` only if citation verification (Step 2.5) — trivially passed when zero auditor citations exist, e.g. on an escalation round — every hash check, every control-flow check (with `UNRESOLVED` treated as failure, not as CLEAR), and (when run) tier-consistency all passed; otherwise `FAILED` with the list of specific failing checks.
- **Non-skippable clause:** the Gate line (Step 4) must never render `PASS` on the strength of a prior round's remembered `mechanicalGateStatus`. These mechanical checks must be actually re-run in *this* preflight round before the Gate line is rendered — a cached `CLEAR` verdict from an earlier round is never a substitute for re-running Step 2.6 now.

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
| **Gate verdict** | **PASS** iff `mechanicalGateStatus` (Step 2.6) is `CLEAR` **AND** zero BLOCKER/HIGH findings remain across all auditors (Gaps/blockers union row, above) — **STOP** otherwise |

Cross-issue correlation: Collapse findings that share one root cause before finalizing.

Produce **Auditor agreement matrix** (task × A/B/C/D × confidence).

### Step 4: Write Report

**Escalation exception:** if the Fable-5 Stuck-in-STOP Escalation subsection (before Step 2) already dispatched a synthesis this round, skip the Required-sections list below and write the compact Escalation Report as instructed there instead — reusing the same Path convention immediately below.

Path: `{plan-dir}/{plan-slug}-Pre-Flight-Review_{YYYY-MM-DD_HHMM}.md`

Required sections:
1. Confidence Dashboard (overall %, **Gate: PASS/STOP**, top blockers, lean score)
2. Task-by-Task Analysis (min confidence, agreement column)
3. Integration Risk Matrix
4. Gap Analysis (ambiguity, missing context, risk, source auditor)
5. Lean Scope Review (always — Auditor D verdict table, delete/simplify lists, lean score)
6. Security Threat Model (if security lane ran)
7. Platform Architecture Review (if platform lane ran)
8. Auditor Disagreements (if any)
9. Path to Green (blockers + suggestions)

Section 1 (Confidence Dashboard) format contract: include a standalone line, exact format `**Gate: PASS**` or `**Gate: STOP**` (regex: `^\*\*Gate:\s*(PASS|STOP)\*\*`). **This line must appear exactly once, within Section 1 only.** If more than one line ever matches this pattern, consumers take the first occurrence within Section 1 and treat any other match elsewhere in the report as prose, never as the authoritative signal. Keep the existing `| **Overall Confidence** | **N%** |` table row, labeled "(display only — informational, never load-bearing for the Gate)". When Gate is STOP for mechanical reasons, list every mechanical-gate failure (Step 2.6) in Section 1 immediately below the Gate line, one per line, format: `- {check name}: {file} — {reason}`. Also include a standalone line, exact format `**Self-Drive Loop this round:** active` or `**Self-Drive Loop this round:** not active` (per the Pipeline state blockquote's Durability paragraph, above) — active iff `wasAutoPipeline` was true this round. This line is mandatory on every standard-report round; it is correctly omitted on an Escalation Report (per the Fable-5 Stuck-in-STOP Escalation subsection above), which skips this Required-sections list entirely.

**Mechanical fact write (non-optional):** Immediately after the Gate line renders, run `node hooks/lib/ledger-cli.js record` via Bash, piping the fact as JSON to stdin **via a heredoc — never `echo`**. A single-quoted `echo '{"claim":"...","evidenceFile":"..."}'` breaks (and executes) on any embedded single-quote in `claim`/`overrideReason`/`evidenceFile` content — content that is ultimately LLM/file-content-influenced — reopening the exact shell-trust-boundary this milestone's stdin-JSON redesign closed for the `--scope` argument, just at a different injection point:

```json
{
  "type": "gate-verdict",
  "claim": "Gate: {PASS|STOP} for plan {slug}",
  "verdict": true,
  "evidenceFile": "<this round's Pre-Flight-Review report path — workspace-relative, e.g. `.construct/plans/{plan-slug}-Pre-Flight-Review_{YYYY-MM-DD_HHMM}.md`, never absolute>",
  "scope": ["<the merged affected-files list, per Step 1's Plan Structure Index>"],
  "stage": "pre-flight",
  "planSlug": "<plan slug>"
}
```

`verdict` MUST be the unquoted JSON boolean `true` or `false` (`true` for `**Gate: PASS**`, `false` for `**Gate: STOP**`) — **never** a quoted string like `"true"`. `ledger-cli.js record` rejects a non-boolean `verdict` outright (exit 1, clear error) rather than silently accepting it, since a stringified verdict would otherwise pass JSON parsing but fail `qualifiesForGate` invisibly later.

`evidenceFile` is a raw path, never a pre-computed hash — this instruction never states or computes a hash value itself; `ledger-cli.js record` computes `evidence.hash` internally via `hashFile(evidenceFile, cwd, PLAN_STORE_ROOT)` before appending.

**evidenceFile form:** workspace-relative (e.g. `.construct/plans/{plan-slug}-Pre-Flight-Review_{YYYY-MM-DD_HHMM}.md`), never an absolute path — it resolves via `hashFile`'s workspace root (`cwd`), the first of the two roots tried.

**Legacy-resolved plan-runs:** if this plan-run resolved via gc-plan Step 7's step-6 legacy fallback (its artifact ladder landed in the global store), `evidenceFile` keeps passing that location's path as-is — the two-root fallback (`cwd`, then `PLAN_STORE_ROOT`) still hashes it. Old facts recorded this way age out naturally rather than being retrofitted; new facts are always workspace-relative going forward.

`sourceSession` is deliberately absent from this fact: `ledger-cli.js` is invoked here as a standalone CLI process, not as a Claude Code hook, so there is no session id to populate it with — this is a resolved design decision, not an oversight.

### Step 5: Present

Paste the full Pre-Flight Dashboard in the conversation.

State outcome by Gate:

| Gate | Action |
| --- | --- |
| **PASS** | Report Gate: PASS (and % as secondary context), mention `/gc-execute --auto` as an available option since the plan has now earned it, and propose execute as Gedeon (unless `--auto-pipeline` is active — see Self-Drive Loop subsection below, which supersedes the wait-for-confirmation behavior in both rows). |
| **STOP** | Report Gate: STOP, list every mechanical-gate failure (Step 2.6) and BLOCKER/HIGH finding, surface Path to Green, propose re-preflight as Gedeon (unless `--auto-pipeline` is active — see Self-Drive Loop subsection below, which supersedes the wait-for-confirmation behavior in both rows). |

On an escalation round, "Present" means pasting the Escalation Report in full (per the escalation subsection above) instead of the STOP row's mechanical-gate-failure/BLOCKER-HIGH/Path-to-Green listing — there is no separate auditor-sourced finding list to enumerate.

**Stop status is advisory** — user may always update plan and re-run.

When Gate is **STOP**: read `.construct/STATE.md`. If `## Error Counts` section is absent, create it with defaults (`gc-execute: 0`, `gc-preflight: 0`, `gc-bootstrap: 0`). Increment `gc-preflight` by 1. Write the updated section back with the Write tool. Note: this trigger now fires on any unresolved BLOCKER/HIGH finding or mechanical-gate failure, a broader condition than the prior "<70%" threshold — a plan that previously scored 75% ("Caution," no increment) with one HIGH finding now increments every time. This is intentional, not a silent behavior drift: a plan with any unresolved BLOCKER/HIGH finding should count toward the behavioral-gap threshold.

**Override branch:** if the user explicitly confirms proceeding past a rendered `**Gate: STOP**` anyway, record the override as a second mechanical fact — run `node hooks/lib/ledger-cli.js record` via Bash, piping this JSON to stdin:

```json
{
  "type": "gate-override",
  "claim": "User overrode Gate: STOP for plan {slug}",
  "verdict": true,
  "evidenceFile": "<same Pre-Flight-Review path as this round's gate-verdict fact>",
  "scope": ["<same merged affected-files list>"],
  "stage": "pre-flight",
  "overrideReason": "<the user's stated reason, or the literal string \"not stated\" if none given>",
  "planSlug": "<plan slug>"
}
```

This write is in addition to, not instead of, the `gate-verdict` fact already recorded for this round. planSlug is added here (previously absent) so the Fable-5 Stuck-in-STOP Escalation subsection can identify which plan's STOP streak an override ends. Note: this only applies to override facts recorded after this change lands — pre-existing override facts (recorded between the ledger's 2026-07-08 launch and this fix) lack the field and cannot be matched to a specific plan's streak. Accepted as a disclosed, low-impact gap: worst case, escalation fires one round earlier than ideal for a plan with an unmatched historical override; the human Gate: STOP decision is never skipped either way.

## Iteration Loop

```
/gc-plan → /gc-preflight → (edit plan) → /gc-preflight → … → /gc-execute
                  ▲                              │
                  └──────── plan gaps ───────────┘
```

Each `/gc-preflight` run is independent. Never say "you already ran preflight."

### Self-Drive Loop (--auto-pipeline)

**Trigger:** this round's Self-Drive Loop is active iff Step 4's just-written report shows `**Self-Drive Loop this round:** active` (per the Pipeline state blockquote's Durability paragraph, above — re-read from the report on disk, not recalled from context). The live `.claude/gc-pipeline.json` file itself already reads `autoPipeline: false` by the time this subsection's logic runs — the Pipeline state write happens first, unconditionally, before Step 2 even dispatches.

**Streak-bound, independent of Fable-5 availability:** the loop's bound is whether **this round's own pre-Step-2 check** (the Fable-5 Stuck-in-STOP Escalation subsection above, which every round already runs unconditionally before Step 2 dispatches) found the streak already at exactly 3 *before this round ran* — i.e., this round is itself the escalation-attempt round, whether Fable-5 actually dispatches or falls through to a normal panel per that subsection's own Availability & Fallback Contract. **Reuse that already-computed value verbatim — never recompute a fresh ledger walk at this point in Step 5.** This distinction is load-bearing, not pedantic: by the time this subsection's logic runs, Step 4 has *already* written this round's own `gate-verdict` fact, so a fresh walk here would count this round's own just-written verdict too — off by one round from what the escalation subsection saw when it ran its own check earlier in this same round. Concretely: a round whose pre-Step-2 check saw a streak of 2 (not yet 3) still runs a normal panel as designed, even though that round's own fresh STOP verdict, once written, makes the *ledger* show 3 consecutive STOPs by the time Step 4 finishes — but this round's Self-Drive Loop decision must still treat this as "streak below 3" (per that round's own already-computed pre-Step-2 value) and continue by re-arming, exactly as the branch below specifies; the genuine 3-streak exit is correctly deferred to the *next* round, whose own pre-Step-2 check will then see all 3 prior STOPs (including this round's) and — for the first time — actually find the streak at exactly 3 before it runs, triggering Fable-5 (or its fallback) for real. Getting this backwards (recomputing fresh at Step 5) would make the loop exit one round early, on every streak, without Fable-5 ever getting the chance to fire — an auto-mode-only regression invisible in manually-paced use, since a human re-running `/gc-preflight` never invokes this subsection's logic at all. Without a bound of any kind, an unattended loop whose escalation-attempt round happens to fall inside Fable-5's unavailability window would have no stop at all and continue indefinitely — the "one escalation per streak" budget guard was designed around a human pacing each round, not an unattended loop. (Cite the Fable-5 Stuck-in-STOP Escalation subsection above by its heading — never by raw line number, since new content inserted above it in this same file would silently invalidate a line-span citation.)

**On Gate: STOP, streak below 3, and Self-Drive Loop active:** the orchestrator revises the plan file directly, addressing every BLOCKER/HIGH finding and mechanical-gate failure from this round's report. This is the same category of edit as any other plan revision at `gc-plan/SKILL.md` Step 5 — apply every revision-scoped rule in that section in full (cross-reference `gc-plan/SKILL.md` Step 5 by name; do not enumerate a subset here, which would silently go stale the next time Step 5 grows a new rule). This is explicitly **not** a todo-status update, so the "never rewrite the whole frontmatter block" invariant (`gc-plan/SKILL.md` @ai-rules #7) does not apply to this edit; that invariant is scoped to `gc-execute`/`gc-executor`'s post-execution status-line updates only. Output one visible progress line before continuing: `↻ Auto-revised plan for round {N+1} — {one-clause summary of what changed}. Gate was STOP ({M} BLOCKER/HIGH). Re-running preflight.` — non-silent per the project's established "failures/state changes must surface loudly" doctrine. Step 4's mandatory ledger `gate-verdict` fact write and Step 5's `.construct/STATE.md` Error Count increment (existing, unconditional) both continue to fire every round exactly as already specified elsewhere in this skill — this subsection only supersedes the propose-and-wait UX, never the fact write or the counter. **Then** the orchestrator performs a second, explicit write to `.claude/gc-pipeline.json` (same generic-merge mechanism as the Pipeline state blockquote above, this time overriding `autoPipeline: true` — the re-arm, plus a fresh `updatedAt`; `stage` and `slug` are carried forward unchanged, still `"pre-flight"`, since the next `gc-preflight` invocation's own Step-1 write is what will correctly re-set them) immediately before invoking the `gc-preflight` skill again (same mechanism as a human re-typing `/gc-preflight`) — no user confirmation required. This re-arm write is a real, freshly-executed action at the exact point continuation is decided, not a retroactive edit to a write that already fired.

**On Gate: PASS and Self-Drive Loop active:** skip Step 5's normal "propose execute as Gedeon" wait — perform the same re-arm write (`autoPipeline: true`, fresh `updatedAt`; `stage`/`slug` again carried forward unchanged — `gc-execute`'s own Step-1 write is what correctly transitions `stage` to `"execute"`) immediately before invoking `gc-execute` (no `--auto` argument needs to be typed; `gc-execute/SKILL.md`'s own `wasAutoPipeline` activation source consumes this re-armed value the same way this skill's own Pipeline state write just did). A crash in the brief window between this re-arm write and `gc-execute`'s own invocation would leave `.claude/gc-pipeline.json` reading `stage:"pre-flight"` with `autoPipeline:true` — `gc-resume` would correctly propose resuming at `/gc-preflight` (a safe, human-confirmed recovery path per its own never-auto-dispatch guarantee, cited in the Disclosed limitation below), not silently jump to execution.

**On any round that was itself the escalation-attempt round** (per the Streak-bound rule above — this round's own pre-Step-2 check found the streak already at 3 before this round ran, whether Fable-5's escalation actually fired or the round fell through to a plain panel STOP), **or the user explicitly overrides a rendered `**Gate: STOP**`** (Step 5's existing Override branch): the self-drive loop ends here — present the round's report exactly as Step 5 already does today (Escalation Report or standard dashboard, whichever resulted), and stop. **No additional write is needed on either path** — `autoPipeline` was already cleared by the Pipeline state blockquote's unconditional write at the start of this very round, and neither path performs the re-arm write the two continuation branches above do. This single statement covers both exit shapes; there is no separate instruction to keep in sync for each, and none to omit.

**Ledger fact scope:** no new ledger fact type is added for auto-revision rounds. Each round's existing mandatory `gate-verdict` fact (Step 4, unchanged) already gives a complete per-round audit trail; the revised plan file itself is diffable manually if ever needed. Deferred to backlog, not silently omitted.

**Disclosed limitation — genuinely concurrent cascades only.** `.claude/gc-pipeline.json` is one file per project, not per plan. The consume-on-read/re-arm-only-at-continuation design (the Pipeline state blockquote, above) closes the *sequential* cross-plan risk by construction (a stale `true` can no longer persist past any single Step-1 write, so a later, unrelated invocation on a different plan reads `false` correctly) — what remains, unresolved and explicitly out of scope, is the narrower case of two `/gc-plan --auto-pipeline` cascades whose invocations genuinely interleave in real time (a second invocation reading the file in the brief window between one cascade's re-arm write and its own very next invocation's consuming read) — a known, already-tracked gap (`.construct/phases/parallel-pipeline-isolation/phase-scoped-pipeline-json/phase-scoped-pipeline-json-CONTEXT.md`, "Track 2 item A"), consistent with `gc-plan/SKILL.md`'s identical boundary in its own Read-scope boundary paragraph. Separately, `gc-resume` — the recovery path for an interrupted cascade — is independently confirmed safe regardless of this design: its own hard constraint ("never auto-dispatch — always confirm with user before invoking any pipeline skill") means a crash mid-loop always drops back to a human-confirmed Recovery Brief. **Sequential variant, same session:** if the orchestrator's own turn dies in the brief window between a re-arm write and the very next invocation it was about to make, the stale `true` survives to be consumed by whatever invocation reads it next — but consume-on-read caps the blast radius at exactly one unrequested auto-round on that next invocation (which itself then clears the field again), not an indefinite reactivation; `gc-resume`'s never-auto-dispatch guarantee, cited above, already covers the deliberate recovery path for this same scenario.

**Disclosed:** no THRESHOLD-style safeguard exists for `gc-preflight`'s own Error Count (unlike `gc-execute`'s explicit "reaches 3 → THRESHOLD" warning) — an unattended multi-round auto-loop can burn through several increments toward the `/gc-correct` threshold faster and with less visibility than a manually-paced session would. Accepted as a v1 limitation.

## Anti-Patterns

- Auditing from plan excerpt while full file exists on disk
- Auditors without full plan text in the prompt
- Averaging confidence scores (always take minimum)
- Discarding a gap because only one auditor found it
- Pushback when user runs `/gc-preflight` again
- Building a dispatch package by paraphrasing the plan instead of pasting its literal text
- Accepting a claim about an external file (roadmap, another skill's structure, a prior auditor's verdict) without an auditor independently re-checking the source
- Skipping Step 4's report write + mandatory ledger fact-record for an intermediate round of a fast, multi-round iteration — "synthesizing findings conversationally and applying them immediately feels sufficient for a quick round" is exactly the rationalization that produces an incomplete ledger gate-verdict history for the plan, which future cross-plan conflict checks (the same mechanism that can catch a scope overlap between two plans before it becomes a merge-time surprise) depend on being complete. Write the report and record the fact every round, not just the first and last of a sequence.

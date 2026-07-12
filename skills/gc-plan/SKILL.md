---
name: gc-plan
description: "Stage 2 of the pipeline. Gathers evidence from the codebase via parallel exploration, then authors a detailed implementation plan with Cynefin-tagged atomic steps, probe templates for Complex steps, and verification criteria."
phase: pipeline
requires:
  - gc-bootstrap
  - gc-probe
tags: [planning, exploration, cynefin, evidence]
model: opus
---

// @ai-rules:
// 1. [Pattern]: Prior context check runs before the Design Brief template — glob phases/*/*/*-CONTEXT.md from workspace root.
// 2. [Constraint]: Deferred questions go in Section 2 under #### heading, never Section 5. No new Section 2b. Sections 3–7 numbering unchanged.
// 3. [Pattern]: Bootstrap reuse: detect ## Bootstrap Context Brief: heading; sufficient = file list + tech stack.
// 4. [Pattern]: gc-pipeline.json write includes "slug" field derived from feature-slug used in the Design Brief (available from user's invocation request).
// 5. [Gotcha]: gc-resume's artifact ladder matches '{slug}.plan.md' for the "plan written, no preflight" state — if the plan filename convention changes, update gc-resume Step 2's artifact ladder.
// 6. [Pattern]: Pipeline State Gate reads .claude/gc-pipeline.json BEFORE the create-plan stage write. Gate: absent/corrupt→STOP, eop→WARN+confirm, bootstrap/create-plan→proceed, pre-flight/execute/review→WARN+confirm. Stage write happens only after gate passes.
// 7. [Constraint]: Plan frontmatter is additive-key tolerant — todo-status updates edit individual status: lines in place, never rewrite/re-serialize the whole frontmatter block (see the affectedFiles: contract in Step 7). This invariant is what keeps new schema keys safe.
// 8. [Pattern]: --auto-pipeline flag triggers a genuine read-merge-write on .claude/gc-pipeline.json (spread every existing key forward, override stage/slug/updatedAt/autoPipeline unconditionally) at both write call-sites — the Pipeline state blockquote's ordinal-(3) initial write and its Step 7 slug-refinement follow-up write — and auto-cascades into gc-preflight's Self-Drive Loop on Step 7's handoff instead of waiting for user confirmation.

# Create Plan

**Stage 2 of the pipeline.** Gathers evidence from the codebase, then authors a detailed implementation plan with atomic steps, Cynefin tags, and verification criteria.

**Prior stage:** `/gc-bootstrap` (carry situational brief into Step 1 for bootstrap reuse)
**Next stage:** `/gc-preflight`

> **Pipeline state:** Three explicit ordered steps in this blockquote — (1) Read `.claude/gc-pipeline.json` for gate (see Pipeline State Gate below), (2) evaluate gate condition, (3) write `.claude/gc-pipeline.json` only AFTER gate passes, using the canonical generic read-merge-write mechanism: read the existing file first (tolerating absent/corrupt exactly as the Pipeline State Gate already does, treating that case as an empty object to merge into), spread every key already present in it forward, then override `stage`, `slug`, `updatedAt`, and unconditionally `autoPipeline` — `true` when `--auto-pipeline` was given at invocation, `false` on every other invocation, not merely omitted from the override set (an omitted key would let a stale `true` from a crashed or abandoned prior cascade survive untouched through a plain `/gc-plan` invocation on an unrelated feature — the identical class of leak the consume-on-read redesign exists to close, just relocated to this writer). This is a true generic merge (any future key added by any writer survives this write untouched), not a hardcoded single-field preserve. Never write before the gate evaluates. Create `.claude/` first if absent.
> - **`--auto-pipeline` flag:** `gc-plan` recognizes an opt-in `--auto-pipeline` invocation argument (e.g. `/gc-plan --auto-pipeline` or `/gc-plan {slug} --auto-pipeline`), following the identical convention `gc-execute`'s `--auto` already establishes. Default invocation (no flag) is completely unchanged.
> - If slug argument provided at invocation (e.g., `/gc-plan gc-resume`): write slug at this blockquote's ordinal-(3) write. If slug is refined during Step 7, do a two-step write: the ordinal-(3) write with the invocation slug, then a second write after Step 7 confirms the final feature-slug — this second write uses the identical generic read-merge-write mechanism described above (read the file again, spread every existing key forward, override `stage`, `slug`, `updatedAt`; `autoPipeline` needs no further action here since the ordinal-(3) write already set it correctly for this cascade). Both writes are the same corrected mechanism, not two separate fixes — converting only the ordinal-(3) write would leave this second write a blind overwrite that silently drops `autoPipeline` moments after the first write sets it, for exactly the invocations where the slug is refined during authoring.
> - If no slug argument (bare `/gc-plan`): defer the ordinal-(3) write to immediately after Step 1 (when feature-slug is first formalized in the Design Brief), but only after gate passes.
> - **Read-scope boundary:** `autoPipeline` only needs to survive the `gc-plan → gc-preflight (N rounds) → gc-execute` cascade.
>   - `gc-bootstrap`'s write always runs *before* this flag is set for a given cascade (nothing to preserve yet, under the disclosed assumption that `gc-bootstrap` is not re-invoked mid-cascade — a low-probability edge case, not verified further this milestone).
>   - `gc-review`'s and `gc-eop`'s writes run *after* `gc-execute` finishes, and this milestone's cascade scope stops at `gc-execute` by design (`gc-discuss` CONTEXT.md, 2026-07-11) — remaining literal-template writers is intentional, not an oversight, and explicitly out of scope for this milestone (see Track 2 item A, `.construct/phases/parallel-pipeline-isolation/phase-scoped-pipeline-json/phase-scoped-pipeline-json-CONTEXT.md`, for the full 6-writer redesign this milestone deliberately does not attempt).
>   - `autoPipeline` is consume-on-read: `gc-execute`'s own Step-1 write clears it immediately upon reading it, before any waves dispatch — this is what actually removes the key on the happy path, unconditionally and immediately, not a downstream side effect of `gc-review`'s later write. `gc-review`/`gc-eop` never need to observe or clear it at all under this design.

### Pipeline State Gate

Read `.claude/gc-pipeline.json` before any other action. If the file is absent or unparseable (corrupt JSON), treat the same as absent.

| `stage` value | Action |
| --- | --- |
| File absent or unparseable | **STOP** — "No active session detected. Run `/gc-bootstrap` (lite minimum) first, then return to `/gc-plan`." |
| `"eop"` | **WARN** — "Previous session is closed. Run `/gc-bootstrap` to open a new session — or confirm to continue planning on the same project." Await user confirmation before proceeding. |
| `"bootstrap"` or `"create-plan"` | **Proceed** |
| `"pre-flight"`, `"execute"`, `"review"` | **WARN** — "Pipeline is at stage `{stage}`. You can return to `/gc-{stage}` to continue, or revise the plan here and re-run preflight. Confirm to proceed." Await user confirmation before proceeding. Note: confirming during `execute` or `review` resets execution state — the next `/gc-execute` will start from the revised plan's todos. |
| Any other value | **STOP** — treat as corrupt. "Unrecognized pipeline state. Run `/gc-bootstrap` first." |

> **Recovery note:** gc-resume's recovery dispatch paths always verify `bootstrap` or `create-plan` stage is present before calling gc-plan — the gate's STOP-on-absent will not fire during a valid gc-resume recovery sequence.

## Execution Steps

### Step 1: Exploration Design Brief

**Prior context check:** Before building the brief, glob `.construct/phases/*/*/*-CONTEXT.md` (depth-3: milestone-slug / phase-slug / file) from the workspace root. If found:
1. Read the `## Date` field. If the date is more than 14 days ago, present it to the user: 'Discussion context is {N} days old ({date}) — still current?' and await confirmation. If the user declines, note it as a risk in the brief but do not block.
2. Inherit `## Decisions Made` and `## Constraints` → add to **Section 2 (Constraints)** of the brief, each item labelled '(from prior discussion)'.
3. Inherit `## Open Questions (deferred)` → append to **Section 2 (Constraints)** under a level-4 heading: `#### User-Deferred Decisions (from prior discussion, unresolved):`, each item labelled '(deferred — not yet decided)'. This is a labeled group within Section 2 (use `####`, not `###` or bold text) — do NOT introduce a new Section 2b or renumber Sections 3–7. Do NOT place in Section 5; Section 5 is reserved for codebase analysis questions dispatched to explorers.
If no CONTEXT.md found, proceed normally — gc-discuss is optional.

**Before dispatching explorers**, synthesize the user request into a structured brief. Explorers validate, refute, and enrich — not infer intent from a one-liner.

```markdown
## Exploration Design Brief: {feature-slug}

### 1. Problem & Goals
- What problem are we solving? What does success look like?
- In scope / out of scope

### 2. Constraints & Deferred Decisions
- Technical, security, compatibility, or policy constraints

### 3. Proposed Approach (pre-evidence)
- High-level strategy in 3-5 sentences — hypothesis, not fact

### 4. Suspected Impact
- Components, services, directories likely touched
- Suspected files (hypothesis — explorers confirm or reject)
- Downstream consumers at risk

### 5. Open Questions for Explorers
- Numbered assumptions that MUST be verified in code

### 6. Architecture Map (Mermaid)
- System context diagram — data flow enter → through → exit

### 7. Exploration Success Criteria
- What evidence must explorers return before writing atomic steps?
```

### Step 2: Evidence-Gathering Exploration

**Bootstrap reuse (always-on):** If a gc-bootstrap situational brief or workspace scan is visible in the current conversation context, use it as Explorer A's output — dispatch only Explorers B and C for supplementary coverage. A gc-bootstrap brief is identifiable by the heading `## Bootstrap Context Brief:`. Treat as sufficient Explorer A output only if it contains an affected-file list and tech stack; otherwise dispatch all three explorers.

> **Tooling note:** All file inspection must use dedicated read tools (file reading, pattern search, path matching). Avoid shell commands for read operations — they trigger permission prompts in Claude Code. Reserve shell tools only for operations the dedicated tools cannot perform (e.g. encoding manipulation, process control). Exception: the citation/control-flow/freshness verifier (`hooks/lib/plan-verifier-cli.js`) is a deliberate, sanctioned Bash invocation — it performs a check no dedicated read tool can (comparing structured claims against file content programmatically), not an oversight of this note.

Dispatch **3 parallel Explore agents** in one message — all read-only, no file writes.

| Explorer | Model | Agent file | Lens |
| --- | --- | --- | --- |
| **A — Deep trace** | `haiku` | `agents/gc-explorer.md` | Repo structure, conventions, full-file reads, call chains, transitive consumers |
| **B — Breadth scout** | `haiku` | `agents/gc-explorer.md` | Hypothesis-driven discovery, entrypoints, suspected-area sweep |
| **C — Correctness probe** | `haiku` | `agents/gc-explorer.md` | Challenge assumptions, edge cases, contradictions; read-only checks |

**Pass each row's `Model` value explicitly as the `model` parameter on the Agent tool call** — see `agents/gc-brain.md`'s Worker Dispatch Contract for why this is mandatory.

**Wait for all explorers** before proceeding.

Each explorer returns: Affected Files, Dependencies, Existing Patterns, Unknowns & Contradictions, Cynefin Pre-Classification per change area.

**Optional research lane:** For features requiring external knowledge (new libraries, APIs, unfamiliar domain) — dispatch a 4th agent (`sonnet`) with web search access to produce a Framework Quick Reference before Step 3.

### Step 3: Merge Evidence

Merge rules:
- **Affected files**: UNION — any explorer listing a file keeps it
- **Patterns**: Agreement = established; disagreement = flag
- **Unknowns**: UNION all
- **Contradictions**: STOP, present to user, wait for resolution
- **Cynefin**: Take the **more complex** classification when explorers disagree

Evidence validation before Step 4:
- [ ] Every affected file was read by ≥1 explorer
- [ ] Every unknown listed explicitly
- [ ] No unresolved contradictions

### Step 3.5: Ledger Contradiction Check

Run `node hooks/lib/ledger-cli.js pull` via Bash, piping the merged affected-files list (the union established in Step 3) as a JSON array on stdin **via a heredoc — never `echo`** (a single-quoted `echo` breaks on any embedded single-quote in an LLM-derived path). **Never pass the list as a `--scope` shell argument** — that was a real shell-injection architecture flaw caught in this plan's pre-flight review; the CLI deliberately only accepts this list via stdin now.

- If the result is `[]`: append the literal line `Ledger check: 0 scope-intersecting fresh entries — nothing to verify.` to the Design Brief / evidence output. Do not dispatch an auditor for this — nothing to judge.
- If the result is non-empty: dispatch a `gc-auditor`-typed agent (using its "Ledger Contradiction Judgment" duty in `agents/gc-auditor.md`) with the plan's stated premises plus the pulled ledger entries. If it reports a contradiction: apply the same **STOP, present to user, wait for resolution** handling as Step 3's Contradiction merge rule, before proceeding to Step 4.

### Step 4: Implementation Strategy

Using merged evidence only:
1. **Pattern selection** — match existing codebase patterns (cite explorers)
2. **Breaking changes** — list consumers at risk with file evidence
3. **Complexity per area** — merged Cynefin tags

### Step 5: Atomic Execution Steps

Numbered steps. Each must be:
- **Isolated** — implementable and verifiable on its own
- **Specific** — e.g. "Update `UserService.ts` to handle null email", not "Fix bug"
- **Evidence-linked** — cites file from Step 3
- **Cynefin-tagged** — Clear / Complicated / Complex
- **Verification-defined** — build, test, or lint command that proves done

**Complex steps** must include an inline probe template:
- Hypothesis, Method (safe-to-fail), Sensing, Acceptance criteria
- Mark: `**Cynefin: Complex — probe required**`

Every file in the merged affected-files list must map to ≥1 step.

The reverse also holds for workspace files: any atomic step that creates or modifies a workspace file **not** in the Step 3 union must add it to the union at that moment, so Step 7's `affectedFiles:` is complete. Re-derive the union after any plan revision that changes which files steps touch — a revision has no live Step 3 union to add to, so re-walk every atomic step's file references and update the plan's `affectedFiles:` to match, exactly as the other re-run-after-revision sweeps below re-run. Outside-workspace targets (e.g. `~/.claude/` sync copies) stay out of the union — they are not `affectedFiles` entries (a sync step's workspace-side source joins the union only if some step actually modifies it).

Any step that specifies an exact insertion point in an existing file ("insert after line X") or assumes that file's rendering/data structure (single value vs. table, one consumer vs. many) must be verified against that file's **actual current content**, not an earlier bootstrap-stage characterization or an assumed control-flow path. Two real bugs reached execution in one plan this way: an insertion point that sat after an unnoticed earlier `return`, and a file wrongly assumed to render a single-project line when it was actually a cross-project table. Both were missed by four rounds of pre-flight because none of them re-read the target file's full content — they audited the plan's description of it.

**Control-flow verification (exact insertion points):** Any atomic step that specifies an exact insertion point must also state the enclosing function's **entry line number** in the step's text (e.g. "insert after line 42, inside `handleWrite` which begins at line 31"). Before the step counts as finalized, run `node hooks/lib/plan-verifier-cli.js check-control-flow <file> <entryLine> <insertionLine>` via Bash. Three possible outputs: (1) `CLEAR` → finalize. (2) A populated list of flagged risky lines → the flagged line(s) must be explicitly addressed in the step's own text (e.g. "line 36's early return exits before the insertion point — rewritten to insert before that return" or a stated reason the flagged line doesn't affect this insertion) before the step is finalized — a step with unaddressed flagged lines is not done; re-scope until every flagged line has an explicit resolution. (3) `UNRESOLVED: ...` → **never finalizable as-is** — there are no flagged lines to resolve, so "every flagged line has an explicit resolution" can never legitimately apply; fix the underlying cause (wrong file path, wrong entry/insertion line, or a genuinely degenerate range) and re-run the check until it returns `CLEAR` or a populated list.

Immediately after an atomic step states its insertion point and entry line in prose (per the paragraph above), it must **also** record a structured line in the exact format below (e.g., for a step touching `hooks/lib/hook-runtime.js` with entry line 31 and insertion line 42, the file/line values after the colon would read `hooks/lib/hook-runtime.js:31:42`) — this is the mechanical anchor `gc-preflight` and `gc-execute` grep for directly, rather than requiring LLM judgment to enumerate which steps need a control-flow re-check:

`**Control-flow check at plan time:** {relative/file/path}:{entryLine}:{insertionLine}`

**Freshness-hash capture (structure/rendering assumptions):** Any atomic step that depends on a file's current structure or rendering assumption (per the paragraph above) must have its digest captured at plan-authoring time: run `node hooks/lib/plan-verifier-cli.js hash <file>` via Bash and record the result inline in the step's text as `**File hash at plan time:** {digest}`. This is what `/gc-execute`'s dispatch-time freshness check compares against later — a step without this line cannot be freshness-checked before execution.

**Prose reachability (skill/markdown insertions):** Any atomic step inserting new conditional or "runs regardless of X" content into a prose file near an existing branch/skip instruction must default to structural separation (its own heading/section) rather than an inline prose override. A prose override sitting next to a competing instruction ("skip the rest of this subsection") is exactly the ambiguity an LLM executor can misread — unlike JS control flow, this has no mechanical check to fall back on, so the plan must design around the risk rather than rely on emphatic wording. (A step that inserted a DEBT.json staleness check right after a USAGE.json-absent "skip the rest of this subsection" line, relying only on the words "runs independently, regardless of" to override it, passed pre-flight's own text-level reasoning but was independently re-flagged as unreachable by two code reviewers using different lenses — resolved only once promoted to its own heading. See `stop-hook-silent-failure`'s `skills/gc-eop/SKILL.md` diff, 2026-07-08.)

**Rename/move blast-radius sweep:** Any atomic step that renames or moves a file referenced by its literal filename elsewhere in the codebase must be preceded by a fresh, unconstrained repo-wide search for that filename — not a check limited to consumers a prior round already named. Re-run the same unconstrained search after each plan revision; a fix scoped only to previously-flagged consumers will miss new ones exactly as easily as the first pass did. Classify every hit as either in-scope (must update) or explicitly out-of-scope (name why — e.g. a destination-path reference vs. a source-path reference). This generalizes beyond filename renames: it applies to any atomic step that migrates a word, phrase, or vocabulary pattern across multiple files (e.g. renaming a concept, replacing a deprecated term, propagating a new signal name) — not filename renames alone. Re-run the same unconstrained repo-wide search after each plan revision for the migrated pattern itself, not just the previously-named consumer list.

**Numbered cross-reference sweep:** Any plan revision that inserts, removes, or reorders items in a numbered/enumerated list (e.g., atomic steps, test items within a step) must be followed by re-checking every OTHER section of the same plan that cites those items by number (e.g., "items 7, 8 are the X case") against the list's actual current numbering — never assumed to remain valid from before the edit. This is the within-document analog of the Rename/move blast-radius sweep above: a numeric reference goes stale the instant the list it points into changes shape, and "it read fine" is not evidence the numbers still match, since the drift is invisible without an explicit re-count. Re-run this check after every subsequent revision to the same list, not just once — a fix to one stale reference can itself omit another item from the same enumeration, exactly as easily as the first pass did.

**Same-file line-citation sweep (skill/agent prose insertions):** Any atomic step that inserts content into an existing skill or agent `.md` file must grep that same file for other line-number citations (e.g. "line 108", "(line 96 above)") that the insertion could shift, and verify each one still points at its intended target after the edit — not just check that the step's own insertion point is correct. Prefer authoring new same-file cross-references as a heading or bold-label citation rather than a raw line number in the first place, since a label survives future insertions while a line number does not. (Caught at code review, twice in one fix pass, during `verification-rung-ladder-gc-execute`, 2026-07-10: a 15-line insertion shifted a downstream subsection's `line 108` citation to point at unrelated content; the first fix re-cited a still-wrong line number because a second edit in the same pass shifted it again — only switching to a heading-name citation stopped the churn.)

**Reused-primitive root-mismatch check:** Any atomic step that reuses an existing shared primitive (a path resolver, validator, or similar) for a call site whose input shape differs from the primitive's existing callers must state, explicitly in the step's text, what that call site's actual runtime input looks like (workspace-relative? absolute? living in a different root entirely?) — and verify it directly against the primitive's real signature/behavior before the step is finalized, not just cite the plan text describing the call. Citing "this reuses X" is not verification; running X against a representative real input for the new caller is. (A plan step once asserted `hashFile(path, cwd)` was safe to reuse for a new caller whose evidence file actually lived outside the workspace entirely — two full pre-flight rounds reviewing the plan's text missed it; only running the primitive against the real input at code-review time caught it.)

**Prose-contract completeness check:** Any rule authored in Step 5 or Step 7 that will govern a future reader's behavior — a re-run/revision condition, a boundary-case classification, a source/destination direction, or a read-scope vs. write-set distinction — must state that dimension explicitly, not leave it inferable from the happy-path wording. Four findings in one code review (missing revision clause, undefined legacy-revision case, implicit source/destination rule, read/write conflation) all traced to rules whose main case was precise but whose edge dimension was silent — the same underspecification class as the citation-sweep grep-pattern ambiguity from `plan-store-project-namespacing` (2026-07-11, PR #20). Before finalizing a prose contract clause, check it against these four dimensions and state any that apply.

**Dense-paragraph check (revision hygiene):** When a pre-flight or code-review round adds a new rule to an existing prose contract clause, prefer inserting it as a new labeled sub-bullet (`**Label:** ...`) rather than appending another trailing clause to the same paragraph, once that paragraph already carries 2+ independently-referenced rules. A paragraph that accretes fix-after-fix as trailing clauses across multiple revision rounds becomes hard for a future maintainer to navigate — the same readability regression a Maintainability code reviewer flagged three separate times in one plan (`pipeline-spanning-auto-mode`, 2026-07-12), each time as a mega-paragraph carrying 4-5 distinct rules appended during rapid iteration. This is a revision-time habit to break, not a one-time authoring rule — check it specifically whenever a fix is being appended to text that already exists, not just when writing a clause fresh.

### Step 6: Verification (Definition of Done)

1. **Test cases** — 3 per major change (success, failure, edge)
2. **Integration checks** — cross-service flows needing E2E verification
3. **Visual check** — manual UI/log verification
4. **Signal executability** — every verification-signal command in the plan must be executable exactly as written: state the full flag set in the command text (`-P` whenever a pattern uses hex escapes like `\x60`, plus `-i`/`-c` as needed), and live-probe each signal against the current pre-change file at plan-authoring time — a detector that fires on the pre-change file is the cheapest proof the command works. (A `\x60` pattern under plain grep is treated as literal text and silently returns 0 matches, turning a "== 0" exclusion signal vacuously green; confirmed live, readme-rewrite 2026-07-12, after signal executability had already been the same plan's round-1 pre-flight BLOCKER in a different form.)

### Step 7: Write and Present the Plan

#### Project-Slug & Plan-Directory Resolution Procedure (canonical — referenced by name from e.g. gc-preflight, gc-execute, gc-review, gc-eop, gc-lean, gc-resume, and gc-ship; do not duplicate this text elsewhere, reference this heading instead)

1. Read `.construct/config.json`. If the file is absent, unreadable, or malformed → `{project-slug}` is **unavailable**; skip to step 4.
2. Else extract slug: `config.slug` (new format) or `config.project` (old format — mirrors `gc-bootstrap` Step 0's own dual-format read). If neither key is present → `{project-slug}` is **unavailable**; skip to step 4.
3. Sanitize the extracted value: reject it (treat identically to "unavailable") if it is empty or whitespace-only, or if it contains `..`, `/`, `\`, or matches an absolute-path/drive-letter form (e.g. `^[A-Za-z]:` or a leading path separator). A rejected, empty, or missing slug never reaches path construction.
4. **If `{project-slug}` is unavailable:** this invocation uses the legacy-flat form only — `{plan-dir}` = `~/.claude/gedeon/plans/` (plan-store root). This is not an error; it is the defined fallback for a workspace with no valid project config.
5. **If `{project-slug}` is available:** new plans always target `{plan-dir}` = `~/.claude/gedeon/plans/{project-slug}/` — no existence check needed for this branch, since a brand-new plan-slug never already exists at that path. (Downstream consumers resolving an **existing** plan-run — e.g. gc-preflight, gc-execute, gc-review, gc-eop, gc-lean, gc-resume, gc-ship — use step 6 below instead, which does check for existence; see each skill's own Step 1/first-touch text.)
6. Downstream consumers resolving an existing plan-run: check the namespaced path `~/.claude/gedeon/plans/{project-slug}/{plan-slug}.plan.md` first; if absent, fall back to the legacy-flat `~/.claude/gedeon/plans/{plan-slug}.plan.md`. Whichever resolves is `{plan-dir}` for every artifact-ladder read/write in that invocation — a plan's whole artifact ladder always lives together, never split.
7. **Duplicate-layout precedence:** if a downstream consumer's discovery step (see gc-resume/gc-ship) finds the *same* feature-slug present in **both** the namespaced and legacy-flat locations simultaneously, the namespaced copy wins deterministically; surface a one-line advisory to the user rather than silently picking by mtime.

Write new plans per steps 4/5 above — never flat when a valid `{project-slug}` is available.

Write to: `{plan-dir}/{feature-slug}.plan.md`

The plan file **must** open with a YAML frontmatter block — this is the machine-readable schema gc-resume and pipeline writers depend on:

```yaml
---
name: {feature-slug}
overview: "{one-line description of the feature}"
workspace: {absolute path to project root}
branch: {current git branch}
affectedFiles:
  - {workspace-relative/forward-slash/path}
status: pending
todos:
  - id: t1
    description: "{atomic step description}"
    status: pending
---
```

`name:` must equal the filename stem — it is the plan slug. Status values: `pending`, `in_progress`, `completed`, `blocked`. Each atomic step from Step 5 gets one todo entry (`t1`, `t2`, …).

`affectedFiles:` contract:
- `affectedFiles:` = the Step 3 merged union **plus** any additional workspace files introduced by Step 5's atomic steps (see the Step 5 rule on step-introduced files). (This field is the data layer for the future pipeline-concurrency intersection check — read-only data today, no consumer yet.)
- Paths are **relative to this plan's own `workspace:` frontmatter field** (never the consuming session's cwd), forward-slash, and must match the ledger's `SCOPE_CHARSET` (`/^[A-Za-z0-9._/-]+$/`, `hooks/lib/ledger-cli.js`) — the same normalization `ledger-cli.js pull` applies. **No path segment may be `..`** — SCOPE_CHARSET alone is not a containment check; any future consumer must resolve entries against the plan's `workspace:` root and verify containment after resolution. Files outside the workspace (e.g. `~/.claude/` sync copies, plan-store artifacts) are excluded by rule.
- The key is **mandatory for new plans, absent on legacy plans** (a legacy plan gains it the first time a revision re-derives the union, per the Step 5 rule) — consumers must tolerate both, and must tolerate unknown frontmatter keys generally.
- Todo-status updates (gc-execute/gc-executor) edit individual `status:` lines in place — never rewrite or re-serialize the whole frontmatter block (this is what keeps additive keys safe).

Plan body follows: architecture diagram, merged evidence summary, implementation strategy, atomic steps, verification plan.

Confirm the plan is written. If `--auto-pipeline` was given at invocation, the orchestrator invokes the `gc-preflight` skill immediately (the same mechanism as a human re-typing `/gc-preflight`), without waiting for user confirmation, entering the Self-Drive Loop described in `gc-preflight/SKILL.md`. Otherwise (default invocation), propose preflight as Gedeon and await confirmation, unchanged.

## Anti-Patterns

- Forwarding the raw user prompt to explorers instead of the Exploration Design Brief
- Starting Step 4 before all explorers finish
- Building on assumptions instead of explorer evidence
- Vague atomic steps ("Fix bug", "Update module")
- Complex steps without probe templates
- Resolving contradictions silently without user visibility
- Presenting `echo` as an equal alternative to a heredoc for piping any content that may contain LLM/file-influenced text to a shell-invoked command — a single-quoted `echo` breaks on an embedded quote; only a heredoc is safe for untrusted content

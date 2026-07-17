---
name: gc-plan
description: "Stage 2 of the pipeline. Gathers evidence from the codebase via parallel exploration, then authors a detailed implementation plan with Cynefin-tagged atomic steps, probe templates for Complex steps, and verification criteria."
phase: pipeline
requires:
  - gc-bootstrap
  - gc-probe
tags: [planning, exploration, cynefin, evidence]
model: sonnet
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
// 9. [Pattern]: Phase record: .construct/pipelines/{slug}.json upserted in Step 7 only (post-plan-write, pre-branch, slug-validated); canonical upsert definition lives in the Pipeline state blockquote; 4-key schema, generic merge.
// 10. [Pattern]: Non-default-branch Step 7 invocations check .construct/pipelines/*.json for a branch collision with another active pipeline before falling back to "genuine stacking"; the offer is a mandatory stop even under --auto-pipeline — see Non-default-branch collision check paragraph.

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
> - **Phase record (canonical definition — referenced by gc-preflight, gc-execute, gc-review, and gc-eop; do not duplicate this text elsewhere, reference this bullet instead):** every active pipeline additionally has one enumeration record at `.construct/pipelines/{slug}.json`, schema exactly `{"status":"active","slug":…,"planDir":…,"sessionId":…}` — no other keys are ever written (no timestamps, no display fields; the record is an enumeration key, consumers follow `planDir` and derive everything else from the artifact ladder). **Slug validation (before any path construction, in every consumer):** validate `{slug}` against `[a-z0-9][a-z0-9._-]*` — the pattern must match the slug **in full** (anchored `^...$` semantics, the same explicitly-anchored style as the SCOPE_CHARSET precedent; an unanchored substring match would silently admit characters outside the charset) — AND explicitly reject empty/whitespace-only values, any `..` occurrence, `/` or `\`, and absolute/drive-letter forms — the charset alone is not a containment check (`a..b` passes it). A rejected slug never reaches path construction: skip the record operation silently. This applies wherever `.construct/pipelines/{slug}.json` is constructed — create/upsert here and in gc-preflight/gc-execute/gc-review, deletion in gc-eop, and any future read. **Upsert mechanism:** read the record tolerating absent/corrupt as an empty object, spread every existing key forward (future keys from later milestones survive untouched), then override exactly `status: "active"`, `slug`, `planDir` (the resolved {plan-dir}: workspace-relative forward-slash form for the in-project store — the resolution procedure yields an ABSOLUTE path for this store, so derive the recorded value by stripping the workspace root prefix and converting `\` to `/`, e.g. `{workspace}\.construct\plans` records as `.construct/plans`; never record the absolute/drive-letter form — and `~`-prefixed forward-slash form for a legacy store, which already matches its resolved shape; enumeration-only — consumers re-derive authoritative resolution via the canonical procedure in Step 7 when acting), and `sessionId` (read `.claude/gc-session.json`'s `sessionId` field — the session pointer the SessionStart hook publishes; absent/corrupt file or missing field → `null` — never block on it; this value does NOT come from the plan-directory resolution procedure). Create `.construct/pipelines/` first if absent. Skip the entire upsert silently when `.construct/` does not exist. Concurrency posture: same accepted limitation as index.json (no locking). `gc-plan` itself performs this upsert only in Step 7 (see the Phase-record creation paragraph there), never at the ordinal-(3) write. gc-eop deletes the record at close; gc-bootstrap writes none (no slug exists yet).

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

**Reused-primitive root-mismatch check:** Any atomic step that reuses an existing shared primitive (a path resolver, validator, or similar) for a call site whose input shape differs from the primitive's existing callers must state, explicitly in the step's text, what that call site's actual runtime input looks like (workspace-relative? absolute? living in a different root entirely?) — and verify it directly against the primitive's real signature/behavior before the step is finalized, not just cite the plan text describing the call. Citing "this reuses X" is not verification; running X against a representative real input for the new caller is. (A plan step once asserted `hashFile(path, cwd)` was safe to reuse for a new caller whose evidence file actually lived outside the workspace entirely — two full pre-flight rounds reviewing the plan's text missed it; only running the primitive against the real input at code-review time caught it.) This generalizes beyond path-resolution primitives to any reused *convention* carrying an implicit precondition — including a git-command pattern cited as "same check-then-act as X": X's precondition (e.g. "current branch is guaranteed main") is often true only at X's own call site, not automatically at the new one. State the new call site's actual runtime state (current branch, working-tree cleanliness) explicitly and verify the precondition holds there. (A HIGH shipped past 3 preflight rounds this way, park-and-switch 2026-07-14 — `git checkout -b` reused a convention whose "always branches from main" guarantee didn't survive the reuse.)

**Prose-contract completeness check:** Any rule authored in Step 5 or Step 7 that will govern a future reader's behavior — a re-run/revision condition, a boundary-case classification, a source/destination direction, or a read-scope vs. write-set distinction — must state that dimension explicitly, not leave it inferable from the happy-path wording. Four findings in one code review (missing revision clause, undefined legacy-revision case, implicit source/destination rule, read/write conflation) all traced to rules whose main case was precise but whose edge dimension was silent — the same underspecification class as the citation-sweep grep-pattern ambiguity from `plan-store-project-namespacing` (2026-07-11, PR #20). Before finalizing a prose contract clause, check it against these four dimensions and state any that apply.

**Dense-paragraph check (revision hygiene):** When a pre-flight or code-review round adds a new rule to an existing prose contract clause, prefer inserting it as a new labeled sub-bullet (`**Label:** ...`) rather than appending another trailing clause to the same paragraph, once that paragraph already carries 2+ independently-referenced rules. A paragraph that accretes fix-after-fix as trailing clauses across multiple revision rounds becomes hard for a future maintainer to navigate — the same readability regression a Maintainability code reviewer flagged three separate times in one plan (`pipeline-spanning-auto-mode`, 2026-07-12), each time as a mega-paragraph carrying 4-5 distinct rules appended during rapid iteration. This is a revision-time habit to break, not a one-time authoring rule — check it specifically whenever a fix is being appended to text that already exists, not just when writing a clause fresh. The check's scope includes target-file content a step directs an executor to write, not only this plan's own clauses: when a step (or a revision to one) extends an existing paragraph in a consumer skill/agent file that already carries 2+ independently-referenced rules, the step must direct a labeled sub-bullet restructure instead of an inline append — the class's 4th recurrence (pause-persistence, 2026-07-13) was exactly a revision-round append into a consumer file's lead-in paragraph, convergently flagged by two code reviewers after preflight missed it.

### Step 6: Verification (Definition of Done)

1. **Test cases** — 3 per major change (success, failure, edge)
2. **Integration checks** — cross-service flows needing E2E verification
3. **Visual check** — manual UI/log verification
4. **Signal executability** — every verification-signal command in the plan must be executable exactly as written: state the full flag set in the command text (`-P` whenever a pattern uses hex escapes like `\x60`, plus `-i`/`-c` as needed), and live-probe each signal against the current pre-change file at plan-authoring time — a detector that fires on the pre-change file is the cheapest proof the command works. (A `\x60` pattern under plain grep is treated as literal text and silently returns 0 matches, turning a "== 0" exclusion signal vacuously green; confirmed live, readme-rewrite 2026-07-12, after signal executability had already been the same plan's round-1 pre-flight BLOCKER in a different form.)
5. **Signal shell dialect** — "executable as written" includes the interpreting shell: a command embedding backslash path literals or escape sequences (e.g. a four-backslash `node -e` probe) mangles under Git Bash/MSYS path translation even when flag-complete. State the intended shell in the command text (e.g. "run via PowerShell") whenever a signal carries backslash literals, or author it with forward-slash paths (Node accepts them on Windows) — and live-probe in the same shell the executor will use. (Confirmed live, plan-artifact-relocation t6, 2026-07-12: the plan's verbatim probe threw `Invalid hexadecimal escape sequence` under Bash; identical logic ran clean via PowerShell.)
6. **Signal-threshold guarantee** — a counting signal's threshold (e.g. a `grep -c` result compared to N) must be traceable, occurrence by occurrence, to the step's own mandated insertions: for each occurrence the threshold requires, point at the explicit instruction in the step text that obligates it. If the step doesn't obligate the string at a site, either mandate it there explicitly or lower the threshold to what is textually guaranteed — an unguaranteed threshold makes a semantically correct execution fail its own DoD, or pushes the executor to pad prose just to hit the number. Prefer fixed-string form (`grep -cF`) with the full literal marker (formatting characters included), which additionally pins exact cross-file string equality when several parallel executors must write the same token. (Round-1 HIGH, pause-persistence 2026-07-12, two auditors convergent: a >= 5 marker grep with only 2 occurrences mandated by the step's text.) Verify this traceability by actually running the grep command against the current draft text before finalizing the threshold — reasoning about the count on paper is exactly as failure-prone as an auditor's hand-counted citation (a regex-escaped near-lookalike, a markdown span breaking a plain-text match, or simple miscounting across a long paragraph all defeat visual inspection). This applies to the plan author's own signals with no exception, not only to auditor citations. (Confirmed live, park-and-switch 2026-07-14: the orchestrator reproduced this exact bug twice while authoring the fix for one prior instance of it.) **Transcription fidelity (distinct from the threshold check above):** for a fixed-string signal matching a snippet the same step's own text also specifies as replacement/insertion content, the signal string must be transcribed character-for-character identical to that replacement text — including any backtick, escape, or formatting character — not independently re-typed to look equivalent. Live-verifying only the pre-change baseline (e.g. confirming a `0` count) proves the signal isn't vacuously true; it does **not** prove the string matches the actual post-change text — these are two separate transcription risks and both must be closed. Prefer deriving the signal string by direct extraction from the step's own replacement text over re-typing it. (Confirmed live, concurrency-gate-check 2026-07-14: a t2 signal passed its own pre-change baseline check yet still omitted a backtick present in the step's actual instructed replacement text — caught by the executor at implementation time, not by this plan-time check.)
7. **Signal quoting context** — inside a single-quoted fixed-string pattern, backticks are inert and must be written unescaped (`grep -cF '`token`'`); a backslash-escaped backtick (`\``) there makes the grep search for a literal backslash character and silently return 0 against verbatim-correct content. Escaped backticks belong only inside double-quoted contexts. A signal live-probed in one quoting context (direct invocation vs. nested inside `"$(...)"`) is not proven in the other — and different runners of the "same" written signal can legitimately disagree. When a count contradicts directly-observed file content, re-run with the alternate quoting before trusting either reading. (Confirmed live, a1-haiku-routing-realized 2026-07-16: two plan signals returned false zeros in the orchestrator's shell while executors' runs of the same commands returned the mandated counts — third live shape of the signal-shell-dialect class.)

### Step 7: Write and Present the Plan

#### Project-Slug & Plan-Directory Resolution Procedure (canonical — referenced by name from e.g. gc-preflight, gc-execute, gc-review, gc-eop, gc-lean, gc-resume, and gc-ship; do not duplicate this text elsewhere, reference this heading instead)

1. Read `.construct/config.json`. If the file is absent, unreadable, or malformed → `{project-slug}` is **unavailable**; skip to step 4.
2. Else extract slug: `config.slug` (new format) or `config.project` (old format — mirrors `gc-bootstrap` Step 0's own dual-format read). If neither key is present → `{project-slug}` is **unavailable**; skip to step 4.
3. Sanitize the extracted value: reject it (treat identically to "unavailable") if it is empty or whitespace-only, or if it contains `..`, `/`, `\`, or matches an absolute-path/drive-letter form (e.g. `^[A-Za-z]:` or a leading path separator). A rejected, empty, or missing slug never reaches path construction.
4. **If `{project-slug}` is unavailable:** this invocation uses the legacy-flat form only — `{plan-dir}` = `~/.claude/gedeon/plans/` (plan-store root). This is not an error; it is the defined fallback for a workspace with no valid project config.
5. **If `{project-slug}` is available:** new plans always target `{plan-dir}` = `{workspace}/.construct/plans/` (create the directory if absent) — the validated `{project-slug}` is not part of this write path; it remains required for step 6's legacy-fallback resolution below. No existence check needed for this branch, since a brand-new plan-slug never already exists at that path. (Downstream consumers resolving an **existing** plan-run — e.g. gc-preflight, gc-execute, gc-review, gc-eop, gc-lean, gc-resume, gc-ship — use step 6 below instead, which does check for existence; see each skill's own Step 1/first-touch text.)
6. Downstream consumers resolving an existing plan-run: check the in-project path `{workspace}/.construct/plans/{plan-slug}.plan.md` first; if absent, fall back to the legacy namespaced path `~/.claude/gedeon/plans/{project-slug}/{plan-slug}.plan.md`; if that is also absent, fall back to the legacy-flat `~/.claude/gedeon/plans/{plan-slug}.plan.md`. Whichever resolves is `{plan-dir}` for every artifact-ladder read/write in that invocation — a plan's whole artifact ladder always lives together, never split.
7. **Duplicate-layout precedence:** if a downstream consumer's discovery step (see gc-resume/gc-ship) finds the *same* feature-slug present in more than one of the three locations simultaneously, precedence is in-project (`.construct/plans/`) wins over legacy-namespaced wins over legacy-flat; surface a one-line advisory to the user rather than silently picking by mtime.

Write new plans per steps 4/5 above — never global when the workspace has a valid project config.

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
budget: normal
todos:
  - id: t1
    description: "{atomic step description}"
    status: pending
---
```

`name:` must equal the filename stem — it is the plan slug. Status values: `pending`, `in_progress`, `completed`, `blocked`. Each atomic step from Step 5 gets one todo entry (`t1`, `t2`, …).

`affectedFiles:` contract:
- `affectedFiles:` = the Step 3 merged union **plus** any additional workspace files introduced by Step 5's atomic steps (see the Step 5 rule on step-introduced files). (This field is the data layer for the future pipeline-concurrency intersection check — read-only data today, no consumer yet.)
- Paths are **relative to this plan's own `workspace:` frontmatter field** (never the consuming session's cwd), forward-slash, and must match the ledger's `SCOPE_CHARSET` (`/^[A-Za-z0-9._/-]+$/`, `hooks/lib/ledger-cli.js`) — the same normalization `ledger-cli.js pull` applies. **No path segment may be `..`** — SCOPE_CHARSET alone is not a containment check; any future consumer must resolve entries against the plan's `workspace:` root and verify containment after resolution. Files outside the workspace (e.g. `~/.claude/` sync copies) and plan-store artifacts in either location — `.construct/plans/` or legacy `~/.claude/gedeon/plans/` — are excluded by rule (in-project artifacts sit inside the workspace but stay excluded by rule; gitignored working state, not plan-touched source).
- The key is **mandatory for new plans, absent on legacy plans** (a legacy plan gains it the first time a revision re-derives the union, per the Step 5 rule) — consumers must tolerate both, and must tolerate unknown frontmatter keys generally.
- Todo-status updates (gc-execute/gc-executor) edit individual `status:` lines in place — never rewrite or re-serialize the whole frontmatter block (this is what keeps additive keys safe).
- **`budget:` contract:** every new plan is written with the literal line `budget: normal` by default (this is the template line above). Values: `normal` | `low`. Only the user ever changes it — no skill, agent, or orchestrator flips it autonomously; absent on legacy plans → consumers treat as `normal`; a legacy plan gains the key only if the user adds it. Consumed at dispatch time by gc-preflight/gc-execute/gc-review via the Budget-Mode Mapping (see `agents/gc-brain.md`'s Worker Dispatch Contract). Rides the additive-key tolerance invariant — individual line edits only, never re-serialization.

Plan body follows: architecture diagram, merged evidence summary, implementation strategy, atomic steps, verification plan.

**Phase-record creation:** after the plan file (frontmatter + body) is fully written to disk — and before the feature-branch step below, so a branch-creation failure or a non-default-branch skip never blocks record creation — perform the Phase-record upsert (canonical definition in this skill's Pipeline state blockquote), creating `.construct/pipelines/{feature-slug}.json`.

**Create the feature branch now (check-then-act; user decision 2026-07-12 — structural fix over gc-eop's procedural backstop):** immediately after the plan file is written, if the workspace is a git repo (`git rev-parse --is-inside-work-tree`) AND the current branch is the default branch (`main`/`master`): run `git rev-parse --verify feature/{feature-slug}` — if it exists, `git checkout feature/{feature-slug}`; if absent, `git checkout -b feature/{feature-slug}`. Uncommitted work carries over; nothing is committed here — committing stays with gc-eop's Commit and Push step, whose existing check-then-act remains the backstop and simply finds the branch already present.

- **Non-default-branch collision check:** if the current branch is already a non-default branch, glob `.construct/pipelines/*.json` (skip this whole check silently if `.construct/pipelines/` is absent). This invocation's own phase record (just created by the Phase-record creation step immediately above) always exists at this point but can never itself be the collision — its branch (`feature/{feature-slug}`) has not been created or checked out yet, so the current branch cannot equal it. Check whether the current branch name equals `feature/{other-slug}` for any OTHER record found. If no match: genuine stacking — do NOT switch, note which branch planning continued on and leave it (unchanged from today's behavior). If a match is found: **this is a mandatory stop requiring user confirmation regardless of `--auto-pipeline`** (matching `gc-execute`'s own established pattern of two mandatory-stop conditions that always pause even under `--auto` — a collision offer is a state-mutating action, not a passive gate surface, and must never proceed unattended). Offer the user — *"Pipeline `{other-slug}`'s branch (`feature/{other-slug}`) is currently checked out. Park `{other-slug}` and switch to `feature/{feature-slug}` for this new plan?"* On confirmation: invoke the Park Procedure (canonical definition, `gc-resume/SKILL.md`) with `{parked-slug}={other-slug}`, `{target-slug}={feature-slug}` — this both parks the collision and performs the checkout, so no separate branch-creation call is needed afterward. **If the Park Procedure aborts** (per its own commit/checkout failure handling — see its blockquote): do NOT proceed as though the switch happened. Surface the failure, do not write the plan as switched, and stop — this applies unconditionally, including under `--auto-pipeline`, since a failed park is exactly the kind of state-mutating uncertainty that must never cascade unattended (a real gap found at code review: a failed-but-uncaught park previously left the `--auto-pipeline` cascade free to proceed on the un-switched branch, risking commingling the parked pipeline's work into this plan's eventual commit). On decline: fall back to the unchanged "do NOT switch" behavior above. This check composes correctly with chained collisions (a third pipeline colliding with a second pipeline that itself just won an earlier park-and-switch): each invocation recomputes collision state fresh against the live `.construct/pipelines/*.json` glob, so a second collision in a row is offered identically — no special-casing needed since the mechanism has no memory of prior rounds.

Skip silently in non-git workspaces.

Confirm the plan is written. If `--auto-pipeline` was given at invocation, the orchestrator invokes the `gc-preflight` skill immediately (the same mechanism as a human re-typing `/gc-preflight`), without waiting for user confirmation, entering the Self-Drive Loop described in `gc-preflight/SKILL.md`. Otherwise (default invocation), propose preflight as Gedeon and await confirmation, unchanged.

## Anti-Patterns

- Forwarding the raw user prompt to explorers instead of the Exploration Design Brief
- Starting Step 4 before all explorers finish
- Building on assumptions instead of explorer evidence
- Vague atomic steps ("Fix bug", "Update module")
- Complex steps without probe templates
- Resolving contradictions silently without user visibility
- Presenting `echo` as an equal alternative to a heredoc for piping any content that may contain LLM/file-influenced text to a shell-invoked command — a single-quoted `echo` breaks on an embedded quote; only a heredoc is safe for untrusted content
- Writing a `grep -c` signal as if it counted occurrences when it counts matching LINES — a step whose mandated edit puts N copies of a token on ONE line makes `grep -cF 'token' == N` unsatisfiable (it returns 1). If a threshold must count occurrences that may share a line, either mandate one-per-line placement explicitly, use `grep -oF … | wc -l`, or lower the threshold to the line count. (Shipped 2 preflight BLOCKERs into cockpit-v1-2-redesign; complements the Signal-threshold-guarantee item.)
- Building a step's edit/delete SCOPE on an explorer's cited line range without the orchestrator re-reading that range against the live file first — an explorer's line numbers drift the instant any earlier edit lands, and a stale range on a *destructive* step (a CSS/code block deletion) can subsume adjacent must-survive content. Cite ranges by their anchor (nearest heading/rule/comment) and re-verify the exact boundary content at authoring time; a range is a claim to probe, not a fact to trust. (A delete range wrongly subsuming the base card rules was a round-1 BLOCKER in cockpit-v1-2-redesign.)
- Transcribing runtime code (cast idioms, type chains, narrowing expressions) verbatim into a step's prose at compiler fidelity — each transcribed abstraction layer costs roughly one preflight round to get the exact idiom right (cockpit-v1-2-redesign rounds 2-3 were single-line TS cast/typing corrections; Fable-5 escalation synthesis). Prefer stating the INVARIANT the code must satisfy plus a citation to an existing in-file precedent that already solves it (e.g. "narrow `unknown` fields via this file's own `Record<string,unknown>` pattern at ws-hub.ts:31"), and let the executor write the actual expression against the live types. Reserve verbatim code for a genuinely novel idiom with no in-repo precedent to point at.
- Deleting an emission/function and its covering test in the same step while the logic RELOCATES to another file, without a matching "coverage lands at the destination" test item — the suite stays green because the deleted assertions simply vanish, and the relocated logic ships untested. A step that moves logic must move its tests too, and must also add a test for every inline guard expression it mandates (a `.slice(0, N)` cap, a clamp, a truncation). (Cockpit-v1-2-redesign review: the relocated fallback math AND a 4096 ring-truncation cap both shipped untested — one systematic class, 2 MEDIUMs. See `feedback_coverage_follows_moved_logic`.)

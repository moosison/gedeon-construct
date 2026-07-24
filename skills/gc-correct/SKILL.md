---
name: gc-correct
description: "End-of-session behavioral gap capture. Scans the session for recurring mistakes or confirmed successful patterns, drafts a skill patch for each gap, and presents it for approval. Inspired by the Darwin JARVIS corrective memory pattern."
phase: capture
requires:
  - gc-skill-author
tags: [self-improvement, corrective-memory, behavioral-gap, meta]
---

// @ai-rules:
// 1. [Pattern]: Closing step is a pre-condition gate: trigger phrase present → signal only; absent → propose /gc-eop.
// 2. [Constraint]: Trigger phrase is exactly 'invoked from inside gc-eop's closing sequence' — substring match.
// 3. [Gotcha]: When invoked from gc-eop, render 'Gaps captured and patches applied.' as a transitional status line (no /gc-eop proposal), then continue in the SAME turn into gc-eop's remaining steps — never end the turn here. Confirmed live twice (2026-07-14): the prior "close with ONLY X" wording read as a turn-ending cue and left the pipeline hanging until the user had to prompt again.
// 4. [Constraint]: Step 3.5 depends on hooks/lib/pending-corrections-cli.js existing in THIS project
//    — it only lives in the gedeon-construct repo itself, not in other Gedeon-managed projects this
//    skill also runs in. Step 3.5 is designed to fail open (skip silently, or with a visible warning
//    for a genuine in-repo failure) — never let a change here make its absence anything but silent.
// 5. [Pattern]: Step 3.5's "touched this pass" bookkeeping is a plain in-memory set tracked by entry
//    identity/position — never a field stamped onto an entry object (would leak into the persisted
//    JSON) and never keyed by `slug` text (slugs have no uniqueness guarantee across entries).
// 6. [Gotcha]: Step 3.5 item 2's four match-classification bullets (ambiguous / touched-this-pass /
//    pre-existing-increment / no-match) are evaluated in that exact order on the FULL match set
//    against every entry — never treat them as independent conditions. A patch matching both an
//    untouched entry and an already-touched one is ambiguous (2 matches), not a same-pass duplicate;
//    getting this order wrong can silently drop a genuine recurrence with zero record (caught at
//    code review, 2026-07-22).
// 7. [Constraint]: Step 3.5's `write` call MUST use a quoted-delimiter heredoc (`<<'EOF'`) — the
//    piped `description` text is LLM-drafted and an unquoted heredoc would let the shell expand any
//    `$(...)`/backtick sequence embedded in it before it reaches stdin. The delimiter itself MUST
//    also be distinctive rather than the generic `EOF`, with a standalone-line pre-check that the
//    piped content doesn't already contain a line matching it — a generic delimiter can be defeated
//    by content containing a lone matching line, terminating the heredoc early and reopening raw
//    shell interpretation of whatever follows.
// 8. [Pattern]: Step 5.5 shares the Closing section's caller-context phrase check to decide whether
//    to pause and offer an upstream-share handoff, so it never fires mid gc-eop close-out.

# Correct (Corrective Memory)

**Captures behavioral gaps from the current session and drafts minimal patches to the gc-* skill that governs the failing behavior.** The patch improves future sessions without requiring external memory systems.

Inspired by Darwin's JARVIS meta-observer: when a behavioral gap is identified, the Skill Author amends the skill that controls that behavior — closing the loop so the gap doesn't recur.

## When to Run

Run `/gc-correct` at the end of a session (before or after `/gc-eop`) when:
- The user corrected you on something you repeated
- You caught yourself applying a pattern that then failed
- The user confirmed an approach that was non-obvious and should be codified

## Steps

### Step 1: Scan for Gaps

Review the session transcript mentally for:

| Signal Type | Example |
|---|---|
| **Correction** | User said "no, don't do that" or "stop X" |
| **Repeated mistake** | Same wrong pattern appeared 2+ times |
| **Non-obvious confirmation** | User said "yes exactly" to something you weren't sure about |
| **Near-miss** | You caught yourself about to do something wrong |

For each signal: note what the behavior was, what the correct behavior would be, and whether it's a universal principle or context-specific.

### Step 2: Map to Skills

For each behavioral gap:
1. Which gc-* skill **should** have governed this behavior?
2. Does that skill currently address this situation? If not, that's the gap.
3. If no existing skill covers this domain, flag it as a candidate for a new skill.

Do not map gaps to skills that are unrelated — prefer "no patch needed" over a forced mapping.

If the gap is a mechanical omission (a missing check, a missing field write, a silent fallback) rather than a judgment gap, classify it as a hook/script-patch candidate instead of a prose patch.

### Step 3: Draft Patches

For each gap, draft a minimal patch using gc-skill-author principles:

```markdown
## Patch: {gc-skill-name}

**Gap identified:** {one sentence — what failed}

**Root cause:** {why this happens — which reasoning principle was missing}

**Proposed addition to Anti-Patterns section:**
> {new anti-pattern entry with root-cause framing}

OR

**Proposed addition to Reasoning Workflow:**
> {new principle or decision criterion}
```

Keep patches minimal — one added paragraph or bullet, not a rewrite.

### Step 3.5: Threshold Check

Before presenting any draft patch for approval, check whether it should be HELD instead — this converts "is this a durable pattern or a one-off?" from a per-session judgment call into a mechanism: a correction only reaches approval once the same underlying gap has recurred across at least one other occasion.

1. Check whether `hooks/lib/pending-corrections-cli.js` exists relative to the current project root (a file-existence check via Glob — no subprocess call needed for this check alone).
   - **If it does not exist:** this project is not the gedeon-construct repo itself — this mechanism's CLI only lives there — skip this entire Step 3.5 silently, proceed straight to Step 4 for every drafted patch, unchanged from today's behavior.
   - **If it exists:** attempt to read the current store — run `node hooks/lib/pending-corrections-cli.js list` via Bash. If this fails to produce a valid JSON array on stdout despite the file being present (a non-zero exit code or malformed output — a genuinely unexpected failure, not the wrong-project case just handled above): surface a visible warning that includes the actual observed error output from the Bash call (e.g. "⚠ pending-corrections read failed unexpectedly inside gedeon-construct — proceeding without threshold tracking this session. Error: {the exact stderr/exception text observed}") — the executing model already sees this text from the Bash tool's own output; relay it rather than rendering only a generic sentence, since a broken-require-chain failure and a genuinely-corrupted-store failure are different problems and the actual text is the only way to tell them apart later. Then still skip this entire Step 3.5 for this run (fail open, same downstream behavior as the file-absent case, but now visible and diagnosable rather than silent or generic). Otherwise, treat the returned JSON array as the current store's entries (in-memory, mutable for the rest of this step) — record which entries were present at this point, before any mutation in item 2 below, as "pre-existing this pass."
2. Process each of Step 3's drafted patches in order, against the entries read in item 1 as a running in-memory snapshot — a mutation applied while judging an earlier patch is visible when judging a later patch in this same pass. Track, separately from any entry object and never keyed by `slug` text (slugs are freshly generated per new entry with no uniqueness check against existing entries, so two entries could coincidentally share a slug — track by the entry's own identity/position in the in-memory snapshot instead, never a field stamped onto an entry itself, see the design note below), which entries have been "touched this pass" (created, incremented, or promoted by an earlier patch in this same pass):
   - Compare the patch's **Gap identified** text against **every** entry in the snapshot (touched-this-pass ones included), and build the full set of entries this candidate plausibly matches as the SAME underlying correction — the same judgment already used in Step 1 to spot a recurring pattern within one session, applied here across candidates from different runs. Do not stop at the first match; check every entry before classifying. Then classify by the SIZE of that matched set, in this exact order — no other bullet in this item applies before this classification completes:
   - **If the matched set has 2 or more entries** (ambiguous — the judgment doesn't clearly favor a single entry over another, regardless of whether any of those entries happen to already be touched this pass): do NOT increment any of them. Treat this as no match — fall through to the "no match at all" bullet below and create a new entry as usual — and note the ambiguity in the summary (e.g. "held (1/2) — also resembles {other-entry-slug}; consider consolidating manually") so the user can see the near-duplicate and consolidate by hand if appropriate. This avoids incrementing or promoting more than one entry from a single real occurrence — the same "false promotion, zero actual recurrence" defect class fixed elsewhere in this step, reachable here through cross-entry ambiguity rather than same-pass re-touching. **This bullet is evaluated first, before the "touched this pass" bullet below** — a candidate matching one touched entry AND one untouched entry is ambiguous (2 matches), not a same-pass duplicate (which requires exactly 1 match). Getting this order backwards can silently drop the untouched entry's genuine recurrence with no record at all, which is worse than the disclosed ambiguous-cluster limitation below (that path at least creates a visible new entry).
   - **Else if the matched set has exactly 1 entry, and that entry is already "touched this pass"** — whether that touch was a fresh creation, an increment, or a promotion by an earlier patch in this SAME run — treat as a redundant duplicate: do not increment, do not create a second entry, do not draft a second approval item, note it in the summary at the entry's current count. **This is the fix for a real bug found at preflight: without this rule, a patch matching an entry a prior patch in the SAME pass had just freshly created (not merely one already promoted) could increment that brand-new entry straight to threshold and promote with zero actual cross-session recurrence — "touched this pass" covers creation, not just promotion, precisely to close that gap.**
   - **Else if the matched set has exactly 1 entry, and that entry is pre-existing and not yet touched** (present in the snapshot before this pass began, per item 1): increment that entry's `count` by 1, update `lastSeen` to the current ISO date, append the current session ID to `sessionIds` if `.claude/gc-session.json` is readable and has a string `sessionId` field not already present (kept purely as an advisory audit trail — see the disclosed limitation below; this value is NEVER used to decide whether to increment), and mark it "touched this pass."
     - **If the incremented `count` is now at least 2:** mark this patch PROMOTED.
     - **If still below 2:** do NOT present this patch for approval this session. Note it as "held ({count}/2)."
   - **Else (the matched set is empty — no match against any entry):** append a new entry `{slug: {a fresh kebab-slug describing the gap, same `{type}-{topic}` convention as a memory-file slug}, description: {the Gap identified text, verbatim}, count: 1, lastSeen: {current ISO date}, sessionIds: [{current sessionId if readable, else empty array}]}` to the in-memory snapshot, and mark it "touched this pass" so a later patch in this same run matching this brand-new entry falls into the second bullet above (or the ambiguous bullet, if it ALSO matches something else) rather than incrementing it. Do NOT present this patch for approval this session — note it as "held (1/2)."
   - **Design clarification (not a limitation — corrected during user review after round 5):** recurrence is judged per-occurrence, never gated on which session an occurrence came from. Two `gc-correct` invocations independently judging the same underlying gap — whether minutes apart in one sitting (e.g. once mid-session, once from `gc-eop`'s close) or days apart across separate sessions — are both genuine, independent observations of the same pattern, and both legitimately count toward the threshold. There is deliberately no same-session gate here: an earlier design attempt tried to build one on `.claude/gc-session.json`'s `sessionId`, but that file is overwritten by every `SessionStart` event including subagent dispatches (confirmed live in this repo: this preflight round's own auditor panel fired `SessionStart` in this same working tree), so it could never have reliably distinguished the two cases anyway — and there was never a real need to, since both cases warrant the same outcome. `sessionIds` is retained per entry purely as an audit trail (which sessions observed this gap), not as a gate. The only protection Step 3.5 actually needs — and has — is against counting the *same drafted patch* more than once, which is what the "touched this pass" rule above guards within a single pass; nothing beyond that requires guarding.
   - **Disclosed limitation (accepted for v1):** a gap that was previously promoted and durably applied (its entry deleted per item 3) starts back at count=1 if it recurs again later — a regression of an already-fixed pattern must accumulate to threshold again before re-promoting, rather than resuming from its prior count. This is a direct consequence of deleting on apply (Implementation Strategy item 5) rather than retaining a promoted-history marker, and is accepted as the simpler design.
   - **Disclosed limitation (accepted for v1, found at round 5 preflight — Auditors A and C, independently convergent):** a gap whose description repeatedly resembles two or more pre-existing, distinct entries can never auto-promote. Each recurrence re-triggers the ambiguous-match bullet above (rather than incrementing one specific entry), spawning a fresh entry instead — and since the newly-spawned entry is itself now part of the resembling cluster, the NEXT recurrence is likely to be judged ambiguous again too, indefinitely. This is the mirror image of the false-promotion risk the ambiguous-match rule exists to prevent, traded deliberately: silent non-promotion (visible via the "also resembles" note on every occurrence, and via the growing held-entry count in gc-eop's summary line) is accepted as the safer failure direction over false promotion from an incorrect merge. The only resolution path in v1 is the user manually consolidating the resembling entries by hand (there is no dedicated CLI operation for this — `pending-corrections-cli.js` exposes only `list`/`write`; a manual consolidation is a hand-authored `write` call replacing the cluster with one merged entry).
3. **If one or more patches were marked PROMOTED in item 2:** proceed to Step 4 (Present for Approval) for those patches only. For each promoted patch: if approved and successfully applied (Step 5), remove its corresponding entry from the in-memory snapshot entirely — its durable record now lives in Step 6's global-memory write. If the user chooses Skip **or** Revise instead (Step 4's three outcomes are Yes/Skip/Revise; only a successful Apply removes the entry): leave its entry in the snapshot unchanged, still at its promoted count — the underlying gap genuinely recurred, it just wasn't durably applied this pass; it will be offered again on a future run.
4. **Write the in-memory snapshot back exactly once per pass** — immediately, if item 2 marked nothing PROMOTED (skip Steps 4 through 7 entirely for this run, proceeding directly to the Closing step and reporting each held candidate's current count there); otherwise, after item 3's Step 4/5 outcomes have resolved for every promoted patch. Either way: run `node hooks/lib/pending-corrections-cli.js write` via Bash, piping the entire array as JSON on stdin via a **quoted-delimiter heredoc** (e.g. `<<'EOF'`, never the unquoted `<<EOF` form) — never `echo`, and never as a `--scope`-style shell argument. The quoted delimiter matters specifically here: `description` text is LLM-drafted from session-transcript content, and an unquoted heredoc still lets the shell expand any `$(...)` or backtick sequence embedded in that text before it reaches stdin — the exact class of injection the heredoc was chosen to prevent in the first place. The in-memory "touched this pass" marker set from item 2 is bookkeeping local to this pass only, tracked separately from the entry objects themselves — never include it in the JSON written here (each entry written must have exactly its 5 schema fields).
   - **The delimiter itself must also be distinctive, non-generic** (never the literal `EOF`), with a standalone-line pre-check that the piped `description` content contains no line matching it before writing: a heredoc terminates on any standalone line matching its own delimiter, so a generic `EOF` delimiter can be defeated by LLM-drafted content that happens to contain a lone `EOF` line, ending the heredoc early and reopening raw shell interpretation of everything after it.
   - **If this write fails** (non-zero exit code): surface a visible warning — "⚠ Failed to persist pending-corrections state this session — held/promoted counts from this run may not be saved." — do not silently proceed as if it succeeded. If this failure happens after a promoted patch was already applied in Step 5, the stale entry may be offered again on a future run — self-healing on the next successful write, not a permanent inconsistency.
   - **If the write succeeds but produced any stderr output** (the CLI's per-entry validation warnings — a stripped stray key, or a dropped malformed entry): surface that stderr text too, as a visible note — a successful write can still have quietly stripped or discarded something, and that signal must not go unseen.

### Step 4: Present for Approval

Show every draft patch that Step 3.5 did not hold to the user. For each:
- State the gap, the affected skill, and the proposed addition
- Ask: "Apply this patch?" (Yes / Skip / Revise)

### Step 5: Apply Approved Patches

For each approved patch:
1. Read the current skill file
2. Apply the minimal addition (do not rewrite working content)
3. Confirm the patch was written — if the write itself fails, report it as a blocker for that patch and do not treat it as applied; it stays at its promoted count for a future run, same as a Skip or Revise outcome

A corrective patch may target skill-file prose, a hook definition, or a script under `hooks/`/`hooks/lib/` when the recurring gap is a mechanical omission (a missing check, a missing field write, a silent fallback) rather than a judgment gap — propose the smallest hook/script diff that would have caught the mistake automatically, in the same approval flow already used for prose patches. Every hook/script patch gc-correct proposes must be presented as a diff against the current file with the specific failure it would have caught named inline, and requires the same explicit user approval as a prose patch before being applied — gc-correct never applies its own patches, mechanical or otherwise.

### Step 5.5: Offer to Share Upstream (optional)

**Skip this step entirely, no prompt**, if either:
- the immediately-preceding caller context contains the phrase 'invoked from inside gc-eop's closing sequence' — the same trigger phrase the Closing section below already checks. gc-eop's close-out flow must continue uninterrupted per the Closing section's own contract, so this offer never fires mid-close-out.
- **or** the user's local preferences (`~/.claude/gedeon/user/memory.md`, loaded at session start) record a standing opt-out from upstream-sharing prompts. This is a per-install preference, not skill behavior — it lives outside the publishable surface entirely, so it applies only on installs where the user set it and never propagates to another user's install through a sync of this file. Absent such a preference, this step is enabled by default — every install starts with Step 5.5 active.

**Otherwise** (standalone invocation): for EACH patch approved and applied in Step 5, in turn, ask the user whether to share it upstream to the public repo — one independent yes/no per patch. On yes for a given patch, hand off to the gc-contribute skill with that patch's identifier (the affected skill's name, or the affected file's relative path for a non-skill target — per gc-contribute's own Step 1 resolution rule) and its full payload (Gap identified/Root cause/Proposed addition for a prose patch, or the diff + specific-failure description for a hook/script patch). Regardless of gc-contribute's own outcome for that patch — filed successfully, declined by the user, or degraded gracefully because `gh` was unavailable — control always returns here to ask about the next approved patch, if any. Only once every approved patch from this pass has been asked about (regardless of individual answers) does the flow continue to Step 6, unchanged.

### Step 6: Write to Global Memory

Always append a dated entry to `~/.claude/gedeon/user/memory.md` with the Write tool, recording what was corrected (preference, pattern, or code behavior):

```markdown
## {ISO date} — {skill-name}
{one-line description of what was corrected and the correct behavior}
```

Read the current file first, then append. Do not overwrite existing content.

### Step 7: Reset Error Count

Read `.construct/STATE.md`. If the `## Error Counts` section is absent, create it with defaults:
```
gc-execute: 0
gc-preflight: 0
gc-bootstrap: 0
```

Reset the entry for the skill that **flagged** the gap (the incremented Error Counts row), not only the skill whose file received the patch — a gap flagged under one stage is often fixed in another skill's file (e.g. flagged by gc-preflight, patched into gc-plan), and the patched skill may have no Error Counts row at all; that is never a reason to skip resetting the flagging row. Set each such row to 0. Rewrite the `## Error Counts` section with the updated values using the Write tool (read full STATE.md → replace section → write back).

### Closing

**If** the immediately-preceding caller context (from gc-eop's delegation block) contains the phrase 'invoked from inside gc-eop's closing sequence': render exactly the line 'Gaps captured and patches applied.' as a transitional status line — not a turn-ending message — then, within this same assistant turn, continue directly into gc-eop's own next step (Commit and Push) without waiting for user input. Do not end the turn here; gc-eop's remaining steps are not a separate confirmation-gated action, they are the direct continuation of the same close-out already in progress.
**Otherwise** (standalone invocation — phrase absent from caller context): confirm gaps captured in Gedeon voice — including any candidates Step 3.5 held below threshold and their current count — then propose /gc-eop.

## Anti-Patterns

- Rewriting entire skills instead of adding targeted patches
- Mapping every gap to a skill regardless of relevance
- Patching based on one-off context-specific situations rather than universal principles
- Skipping Step 4 and applying patches without user approval

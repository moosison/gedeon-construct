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
// 3. [Gotcha]: When invoked from gc-eop, close with ONLY 'Gaps captured and patches applied.' — no /gc-eop proposal.

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

### Step 4: Present for Approval

Show all draft patches to the user. For each:
- State the gap, the affected skill, and the proposed addition
- Ask: "Apply this patch?" (Yes / Skip / Revise)

### Step 5: Apply Approved Patches

For each approved patch:
1. Read the current skill file
2. Apply the minimal addition (do not rewrite working content)
3. Confirm the patch was written

A corrective patch may target skill-file prose, a hook definition, or a script under `hooks/`/`hooks/lib/` when the recurring gap is a mechanical omission (a missing check, a missing field write, a silent fallback) rather than a judgment gap — propose the smallest hook/script diff that would have caught the mistake automatically, in the same approval flow already used for prose patches. Every hook/script patch gc-correct proposes must be presented as a diff against the current file with the specific failure it would have caught named inline, and requires the same explicit user approval as a prose patch before being applied — gc-correct never applies its own patches, mechanical or otherwise.

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

**If** the immediately-preceding caller context (from gc-eop's delegation block) contains the phrase 'invoked from inside gc-eop's closing sequence': close with exactly 'Gaps captured and patches applied.' and stop — gc-eop resumes pipeline-complete automatically.
**Otherwise** (standalone invocation — phrase absent from caller context): confirm gaps captured in Gedeon voice, then propose /gc-eop.

## Anti-Patterns

- Rewriting entire skills instead of adding targeted patches
- Mapping every gap to a skill regardless of relevance
- Patching based on one-off context-specific situations rather than universal principles
- Skipping Step 4 and applying patches without user approval

---
name: gc-debug
description: "Self-contained scientific debugging skill. Investigates bugs using hypothesis generation, safe-to-fail probes, fix application, and closed-loop verification. No MCP server calls required."
phase: specialist
requires:
  - gc-probe
tags: [debug, scientific-method, hypothesis, verification]
---

// @ai-rules:
// 1. [Constraint]: Blockquote before Step 1 must name both gc-probe and gc-debug; do not add slash command invocation instructions.
// 2. [Pattern]: requires: [gc-probe] in frontmatter is a conceptual dependency — never instruct callers to invoke /gc-probe as a command.

# Debug (Scientific Method)

**Investigates bugs using the scientific method: observe → hypothesize → probe → verify → fix.**

Never guess at a fix before understanding the failure. Never declare done without an observable verification signal.

## Workflow

> **gc-probe vs gc-debug:** gc-probe is the always-on posture — never assume before acting; it governs every interaction. gc-debug is the invoked investigation workflow — triggered by a known failure and executed as a structured hypothesis loop. Both apply probe-before-assume; gc-debug structures that discipline into a repeatable debugging sequence. The `requires: [gc-probe]` frontmatter reflects this conceptual dependency — do not call `/gc-probe` as a slash command inside gc-debug; the probing discipline is embedded natively in Steps 3–4.

### Step 1: Observe

Gather all available evidence before forming hypotheses:

- Error message (exact text, not paraphrased)
- Stack trace (full, not truncated)
- Reproduction steps (minimal sequence that triggers the bug)
- Recent changes (git log since last known-good state)
- Environment signals (env vars, config, runtime version)

If any evidence is missing, ask the user before continuing.

### Step 2: Hypothesize

Generate a **ranked hypothesis table** (most likely first):

| # | Hypothesis | Evidence For | Evidence Against | Confidence |
|---|---|---|---|---|
| 1 | {root cause candidate} | {supporting signals} | {contradicting signals} | High/Med/Low |
| 2 | … | … | … | … |

Aim for 3-5 hypotheses. One-hypothesis debugging is usually premature closure.

**Cynefin check:** Is this Complicated (known patterns, analyzable) or Complex (unknown interactions, needs probing)?
- Complicated → analyze then fix
- Complex → probe first, then re-hypothesize based on probe result

### Step 3: Design Probes

For the top 2-3 hypotheses, design a **safe-to-fail probe** for each:

```markdown
## Probe: {Hypothesis Name}

**Hypothesis:** {what we're testing}
**Method:** {minimal step to produce observable evidence — read a file, add a log, run a command}
**Observable signal:** {what a positive result looks like}
**Rollback:** {how to undo if needed — usually: delete added log line}
```

Probes must be:
- Read-only or reversible
- Targeted — test one variable at a time
- Observable — produce a signal that either confirms or refutes

### Step 4: Run Probes

Execute probes in priority order. After each probe:
- Record: confirmed / refuted / inconclusive
- If confirmed → proceed to Step 5
- If refuted → eliminate hypothesis, run next probe
- If inconclusive → refine the probe or gather more evidence

### Step 5: Fix

Once the root cause is confirmed:
1. Read the file(s) involved before editing
2. Apply the minimal fix that closes the error signal
3. Explain WHY the fix works in one sentence (the constraint, not the code change)
4. Propose a commit message

### Step 6: Verify (Closed-Loop)

After the fix:
- Reproduce the original failure path — confirm it no longer triggers
- Run related tests or build if available
- Check for regressions in neighboring behavior

**Observable signal required.** Do not mark the bug fixed without one.

If verification reveals a new failure: return to Step 2 with the new evidence.

## Anti-Patterns

- Guessing the first thing that comes to mind without forming hypotheses
- Fixing without verifying
- "It looks right" as a verification signal — never sufficient
- Running 5 probes at once (one at a time preserves interpretability)
- Closing the bug before the reproduction path is confirmed resolved

---
name: gc-probe
description: "Replaces assumptions with probing actions across all interactions. Use before writing code, debugging, answering questions, making architecture decisions, or any action that depends on unverified state. Foundational behavior rule — triggers always."
phase: specialist
tags: [probe, assumptions, evidence, verification]
---

# Probe Before Assume

## Core Mandate

**Never act on an assumption when you can act on evidence.**

Every assumption is an unvalidated hypothesis. Before it influences a decision, it must be converted into one of:

1. **A verified fact** — read the file, run the command, check the state.
2. **An explicit question** — ask the user when verification is not possible.
3. **A stated risk** — if you must proceed, declare the assumption and its blast radius.

**Mandatory ledger write for outcome (1) only:** the moment an assumption is converted to a verified fact, record it — the conversion is not complete until it is written. Run `node hooks/lib/ledger-cli.js record` via Bash, piping the fact as JSON to stdin **via a heredoc — never `echo`**. A single-quoted `echo '{"claim":"...",...}'` breaks (and executes) on any embedded single-quote in the assumption's `claim` text — content that is ultimately LLM/file-content-influenced — reopening the exact shell-trust-boundary this milestone's stdin-JSON redesign closed for the `--scope` argument, just at a different injection point:

```json
{
  "type": "verified-fact",
  "claim": "<the assumption's statement, unchanged whether confirmed or disproved>",
  "verdict": true,
  "evidenceFile": "<the file read/checked, if any — omit this field entirely when verification was via a command or state-check with no single file>",
  "scope": ["<the file(s) involved, or [] if none>"],
  "stage": "<the current pipeline stage, or the literal string \"adhoc\" outside an active pipeline stage>"
}
```

`verdict` MUST be the unquoted JSON boolean `true` or `false` — **never** a quoted string. `ledger-cli.js record` rejects a non-boolean `verdict` outright rather than silently accepting it. A disproved assumption is still a verified fact — `verdict` must be `false` in that case, never hardcoded to `true`. Recording it with `verdict:false` is what lets a later plan's stated premise actually be contradicted by this fact (the mechanism `agents/gc-auditor.md`'s Ledger Contradiction Judgment duty depends on). If no file is involved, `scope` is `[]` and the fact is recorded as advisory-only — per the gate/advise derivation rule, a fact with empty `scope` never gates, only advises. This is intentional, not a gap. Outcomes (2) and (3) are not verified facts and are never recorded here.

## The Assumption Tax

Assumptions compound. One wrong guess about file structure leads to a wrong import path, which leads to a broken build, which leads to a debugging spiral that costs more than the original probe would have.

**Rule: The cost of probing is always less than the cost of a wrong assumption.**

## When to Probe

Probe **before** any action that depends on:

| Category | Examples |
| --- | --- |
| **File state** | Does the file exist? What's its current content? What framework/version? |
| **Runtime state** | Is the service running? What's the current error? What env vars are set? |
| **User intent** | What problem are they actually solving? What outcome do they want? |
| **Architecture** | What patterns does this codebase use? What conventions are established? |
| **Dependencies** | What versions are installed? What APIs are available? |
| **Configuration** | What's in the config? What feature flags are active? |
| **Patterns** | Is this a one-off or a repeated pattern? Does a similar abstraction already exist? |
| **Flow** | What triggers this code? What happens upstream/downstream? What are the side effects? |
| **Data** | What shape is the data? What are the nullable/optional fields? Where is the data sourced from? |

## How to Probe

### 1. Read Before Write

Before editing any file, read it first. No exceptions.

Before proposing a fix, read the error context — logs, stack traces, related files.

### 2. Search Before Guessing

Before assuming where something is defined, search for it.
Before assuming a pattern, check how the codebase already does it.

### 3. Ask Before Inferring Intent

When the user's request has multiple valid interpretations:
- Do not pick one silently.
- Present the interpretations and ask which they mean.

### 4. Trace Before Assuming Flow

Before assuming execution order or call chains:
- Read the caller — what invokes this code and under what conditions.
- Read the callee — what does this code trigger downstream.
- Check for async boundaries, middleware, event emitters, or queues that alter ordering.
- Map side effects — DB writes, cache invalidation, external API calls, event dispatches.

### 5. Validate Before Assuming Data

Before assuming data shape, presence, or validity:
- Read the type definition, interface, schema, or migration.
- Check for nullable/optional fields — never assume a field is always present.
- Check valid ranges, enums, and constraints at the source.
- Consider edge cases: empty collections, null values, oversized payloads, malformed input.

### 6. Match Before Assuming Patterns

Before assuming a pattern is established or appropriate:
- Search for at least 2 existing instances of the pattern in the codebase.
- If fewer than 2 exist, it's not an established pattern — ask the user.
- Check if a similar abstraction already exists before creating a new one.

### 7. Verify Before Declaring Done

After making changes, verify the outcome — run tests, check builds, read output.
Do not assume a change worked because it looks right.

## Anti-Patterns to Catch

| Trap | Probe Instead |
| --- | --- |
| "This file probably exports..." | Read the file's exports. |
| "The user likely wants..." | Ask what they want. |
| "This API probably accepts..." | Check the type definitions or docs. |
| "This should fix it..." | Run it and verify. |
| "Based on common patterns..." | Search for this project's actual patterns. |
| "I assume the database schema is..." | Read the schema or migration files. |
| "The config is probably..." | Read the config file. |
| "This data is always present..." | Check for nullable/optional fields. |
| "This flow is straightforward..." | Trace the call chain. |
| "This pattern is standard here..." | Search for at least 2 existing instances. |
| "This won't have side effects..." | Check for event emitters, DB writes, external calls. |

## Escalation Protocol

When you cannot probe (no access, no tool, ambiguous results):

1. **State the assumption explicitly**: "I'm assuming X because I cannot verify it."
2. **State the risk**: "If X is wrong, then Y breaks."
3. **Ask for confirmation**: "Can you confirm X before I proceed?"

Never bury an assumption inside an action. Surface it.

## Interaction Contract

For every response, internally audit:

- [ ] Did I read before I wrote?
- [ ] Did I search before I guessed?
- [ ] Did I ask before I inferred?
- [ ] Did I trace the flow before assuming execution order?
- [ ] Did I validate data shape before assuming presence/format?
- [ ] Did I confirm the pattern exists before replicating it?
- [ ] Did I verify before I declared done?
- [ ] Are there any hidden assumptions I haven't surfaced?

If any box is unchecked, probe before proceeding.

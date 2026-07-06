---
name: gc-debt
description: "Surfaces the mechanical `.construct/DEBT.json` ledger of `// lean:` comments — a read path over a ledger the Stop hook maintains automatically, not a scanner in its own right."
phase: project
tags: [debt, lean, ledger, technical-debt, advisory]
model: haiku
---

// @ai-rules:
// 1. [Constraint]: This skill is a read path only. It never scans source or writes DEBT.json itself —
//    that happens in hooks/lib/debt-tracker.js, invoked from hooks/gc-stop-reminder.js on every Stop event.
// 2. [Pattern]: Scope is mechanical grep + idempotent full-ledger rewrite. No dedupe, staleness detection,
//    or prioritization judgment — surface counts and locations, never editorialize about which debt matters most.
// 3. [Gotcha]: `.construct/DEBT.json` may not exist yet if no Stop event has fired this session (or ever, for
//    a fresh project) — treat absence as zero tracked debt, not an error.

# Debt Ledger

**Reads the mechanical `// lean:` comment ledger at `.construct/DEBT.json` and reports what it contains.**

## What Builds This Ledger

`gc-debt` does not scan anything. The scan and write happen elsewhere, automatically:

- `hooks/lib/debt-tracker.js` exports `scanLeanComments(workspaceRoot)`, which walks `.js` files under
  `hooks/` and `hooks/lib/` only, matching the `// lean:` comment prefix (not a bare `lean:` substring —
  this excludes doctrine prose in CLAUDE.md/GEDEON-DOCTRINE.md/SKILL.md files that happens to contain the
  word "lean:" outside a real debt marker) and capturing multi-line continuations (a marker's ceiling/upgrade-path
  text often spans more than one line).
- `writeDebtLedger(workspaceRoot, entries)` rewrites `.construct/DEBT.json` in full on every call —
  `{scannedAt, entries}` — so repeated runs within a session converge to the same state instead of growing
  unbounded. It is not a literal append.
- `hooks/gc-stop-reminder.js` calls both on every Stop event, wrapped in a best-effort try/catch, and appends
  a one-line advisory to its output only when the entry count changed since the last run.

This is deliberately folded into the existing Stop hook rather than registered as a second, parallel hook —
debt scanning is codebase state, not tied to an active pipeline stage, and `gc-stop-reminder.js` already runs
unconditionally on every Stop event.

## Scope — What This Is Not

- **No dedupe.** The same lean marker re-appears every scan; nothing collapses duplicates across runs.
- **No staleness detection.** A marker from six months ago and one from this session are indistinguishable
  in the ledger — there is no age or churn signal.
- **No prioritization.** Every entry is reported flat; there is no severity, urgency, or ranking logic.

These are explicitly out of scope — a real dedupe/staleness/prioritization layer is a separate, larger design
decision, not an extension bolted onto this mechanical ledger.

## How To Read It

Two paths, both read-only:

1. **Direct**: read `.construct/DEBT.json` — `{scannedAt, entries: [{file, line, endLine, text}]}`. Each entry
   is one `// lean:` marker (and its wrapped continuation lines) found under `hooks/` or `hooks/lib/`.
2. **Advisory count via `gc-progress`/`gc-status`**: mirror the existing "Error Counts" pattern already used
   for behavioral-gap counts in `.construct/STATE.md` — render `entries.length` as a single advisory line
   (e.g. `Debt: N lean: marker(s) tracked (.construct/DEBT.json)`), not a full dump of every entry. This keeps
   the dashboard/progress report scannable; the file itself is the place to go for the full list.

## Boundaries

- Never treat this ledger as a task list or backlog — it has no priority, owner, or status field. That is a
  deliberate omission, not a gap to silently fill in.
- Never infer "this debt is now fixed" from the count going to zero in one run — a marker can disappear because
  the code was cleaned up, or because the file it lived in was deleted or moved out of `hooks/`/`hooks/lib/`.
  The ledger reports what's currently there, not a history of remediation.
- If `.construct/DEBT.json` is absent, report zero tracked debt — do not treat it as a broken pipeline or run
  the scan yourself. The next Stop event will create it.

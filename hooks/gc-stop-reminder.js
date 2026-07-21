// hooks/gc-stop-reminder.js
// @ai-rules:
// 1. [Gotcha]: Stop fires only at true main-thread turn boundaries — a blocking multi-subagent
//    dispatch (e.g. gc-review's mandatory reviewer panel via Task/Agent tool) produces ZERO
//    interim Stop events for its entire duration, however long. USAGE.json/DEBT.json staleness
//    observed specifically during such a dispatch is expected behavior, not a bug — confirmed via
//    direct timing measurement (full transcript+subagent re-parse: ~145ms on a 20MB real transcript,
//    ruling out a hook-timeout kill as the cause). See .construct/phases/instrument-repairs-incl-
//    per-milestone-cost-scoping/stop-hook-silent-failure/stop-hook-silent-failure-CONTEXT.md's addendum.
// 2. [Pattern]: Each instrument call (usage-tracker, debt-tracker, ledger digest) is independently
//    try/caught and best-effort — one instrument's failure must never block another's.
// 3. [Constraint]: Must always exit 0 — this hook is advisory-only (.construct/REQUIREMENTS.md).
'use strict';
const { readStdin, loadPipelineState, readConstructSection, parseErrorCounts } = require('./lib/hook-runtime');
const { STAGE_MAP } = require('./lib/gc-pipeline-stages');
const { computeAndRecordUsage } = require('./lib/usage-tracker');
const { scanLeanComments, writeDebtLedger } = require('./lib/debt-tracker');
const { regenerateDigest } = require('./lib/ledger');

readStdin().then(data => {
  // lean: no fix for the stdin-timeout bypass — hook-runtime.js's readStdin() resolves null after
  // a 5000ms timeout, exiting here before usage tracking below ever runs, silently losing that
  // turn's usage data. Ceiling = rare (5s is generous for local stdin); self-heals in the common
  // case since usage-tracker.js re-parses the ENTIRE transcript on every successful Stop — a
  // timed-out turn's tokens are only permanently lost if that Stop happens to be the session's
  // last one. No log signal today. Accepted limitation for an advisory-only hook that must never
  // risk blocking; upgrade path = a dedicated timeout-path stderr log if this proves to matter.
  if (!data) process.exit(0);

  const cwd = data.cwd || process.cwd();
  const state = loadPipelineState(cwd);

  // Usage tracking runs regardless of pipeline stage — deliberately placed before the
  // stage-gated early-return below, since token usage should be tracked for every Stop
  // event in a Gedeon-managed project (.construct/ gate inside), not only during an
  // active gc-* pipeline stage.
  try {
    if (data.transcript_path && data.session_id) {
      computeAndRecordUsage(cwd, data.transcript_path, data.session_id, state && state.slug, state && state.updatedAt);
    }
  } catch (e) { /* usage tracking is best-effort, must never block the hook */ }

  let out = '';

  // Debt-ledger scan runs regardless of pipeline stage — debt scanning reflects codebase
  // state, not an active gc-* pipeline stage. Best-effort, must never block the hook.
  try {
    const entries = scanLeanComments(cwd);
    const { newCount, changed } = writeDebtLedger(cwd, entries);
    if (changed) {
      out += `\nDebt ledger updated: ${newCount} lean: marker(s) tracked in .construct/DEBT.json.\n`;
    }
  } catch (e) { /* debt scan is best-effort, must never block the hook */ }

  // Ledger digest regeneration runs regardless of pipeline stage — mirrors the debt/usage
  // pattern above. Best-effort, must never block the hook.
  try {
    regenerateDigest(cwd);
  } catch (e) { /* ledger digest is best-effort, must never block the hook */ }

  if (state && state.stage) {
    const entry = STAGE_MAP[state.stage];

    // Stage reminder
    if (entry && entry.reminder) {
      out += `\n${entry.reminder}\n`;
    }

    // Error count escalation
    const errorSection = readConstructSection(cwd, 'Error Counts');
    if (errorSection) {
      const counts = parseErrorCounts(errorSection);
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      if (total >= 3) {
        out += `\n⚠ BEHAVIORAL GAP THRESHOLD — run /gc-correct before continuing.\n`;
      } else if (total >= 1) {
        out += `\nNote: /gc-correct available to patch behavioral gaps (${total} error${total > 1 ? 's' : ''} logged).\n`;
      }
    }
  }

  if (out) {
    process.stdout.write(out, () => process.exit(0));
  } else {
    process.exit(0);
  }
}).catch(e => {
  process.stderr.write(`[gedeon-construct] stop-reminder error: ${e.message}\n`);
  process.exit(0);
});

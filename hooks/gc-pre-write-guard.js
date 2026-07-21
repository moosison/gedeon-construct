// hooks/gc-pre-write-guard.js
// @ai-rules:
// 1. [Constraint]: Advisory only — must always exit 0. Never throw uncaught, never hang. This hook is
//    registered globally (~/.claude/settings.json) and fires on every Write/Edit across every project.
// 2. [Pattern]: The citation-verification backstop (t9, mechanical-plan-verification) is checked BEFORE
//    the pre-existing ALWAYS_ALLOWED/PROTECTED/stage gates below — those gates would otherwise exempt
//    every plan/report write (they all match `.md$`) before the backstop ever ran.
// 3. [Constraint]: All citation/table-parsing logic lives in hooks/lib/plan-verifier.js (single source
//    of truth) — do not re-implement table-scanning or path resolution here; require and call it.
// 4. [Gotcha]: Citation content is caller-influenced (LLM-authored plan/report text) — every path
//    resolution it drives goes through plan-verifier.js's resolveContained, which enforces containment
//    within workspaceRoot/planStoreRoot. Do not bypass that by resolving a path directly here.
'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin, loadPipelineState, gedeonHome } = require('./lib/hook-runtime');
const { STAGE_IDS, EXECUTE_IDX } = require('./lib/gc-pipeline-stages');

// Both stdout.write(...) call sites below rely on their callback to exit — if the pipe errors first
// (e.g. EPIPE on early host-side close), that callback never fires. This guard makes "always exit 0"
// airtight regardless: any stdout error still exits 0 rather than crashing with an unhandled error.
process.stdout.on('error', () => process.exit(0));

// Paths exempt from the pre-execute advisory.
// PROTECTED files are blocked from the exemption even if they match ALWAYS_ALLOWED.
const ALWAYS_ALLOWED = [
  /(^|[/\\])\.claude[/\\]/,
  /(^|[/\\])\.construct[/\\]/,
  /(^|[/\\])skills[/\\]/,
  /(^|[/\\])hooks[/\\]/,
  /\.md$/i,
  /LICENSE$/i,
  /settings\.json$/,
  /package(-lock)?\.json$/,
  /tsconfig\.json$/,
  /\.sh$/,
];
// Instruction files that must never bypass the guard, even during setup.
const PROTECTED = /CLAUDE\.md$|AGENTS\.md$|SECURITY\.md$|GEDEON-DOCTRINE\.md$/i;

// t9/t6: plan files and Pre-Flight-Review reports in either plan store — the in-project store
// (workspace's ".construct/plans/", current/primary) or the legacy global Gedeon plan store
// ("~/.claude/gedeon/plans/", read-fallback during the migration transition) — citation-verification
// backstop applies to these regardless of ALWAYS_ALLOWED/PROTECTED/pipeline stage. Backslash/forward-
// slash-aware, matching ALWAYS_ALLOWED's own style above. Anchored on ".claude/gedeon/plans"
// (gedeonHome()'s real fixed structure) or ".construct/plans", not just "gedeon/plans" or "plans"
// anywhere in the path — an unrelated project with a coincidental "gedeon/plans/x.plan.md" fragment
// won't misfire this.
const PLAN_FILE_PATTERN = /(^|[/\\])(?:\.claude[/\\]gedeon[/\\]plans|\.construct[/\\]plans)[/\\](?:[^/\\]+[/\\])?[^/\\]+\.plan\.md$/i;
const PREFLIGHT_REPORT_PATTERN = /(^|[/\\])(?:\.claude[/\\]gedeon[/\\]plans|\.construct[/\\]plans)[/\\](?:[^/\\]+[/\\])?[^/\\]+-Pre-Flight-Review_[^/\\]+\.md$/i;

// Reconstructs Edit's true post-edit content by applying old_string -> new_string the same way the
// real Edit tool would, mirroring its own semantics for all three anchor-count cases:
//   0 occurrences   -> skip (cannot locate anchor; do not check stale content)
//   1 occurrence    -> single replace (replace_all is irrelevant)
//   2+ occurrences  -> replace_all:true -> replace every occurrence; otherwise skip (Edit itself
//                      would refuse a non-unique anchor without replace_all — Known Residual Risk 4)
function reconstructEditContent(current, oldString, newString, replaceAll) {
  const occurrences = oldString ? current.split(oldString).length - 1 : 0;
  if (occurrences === 0) {
    return { skip: true, reason: "citation check skipped — could not locate the edit's anchor text in the current file" };
  }
  if (occurrences > 1 && replaceAll !== true) {
    return { skip: true, reason: 'citation check skipped — old_string is not unique in the current file and replace_all was not set' };
  }
  return { skip: false, content: current.split(oldString).join(newString) };
}

function getContentForCitationCheck(data, filePath) {
  const input = data.tool_input || {};
  if (data.tool_name === 'Write') {
    return { skip: false, content: input.content || '' };
  }
  // Edit — reconstruct from the current on-disk file (Edit requires it to already exist pre-write).
  if (!fs.existsSync(filePath)) {
    return { skip: true, reason: 'citation check skipped — target file does not exist on disk for Edit' };
  }
  let current;
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { skip: true, reason: `citation check skipped — could not read current file: ${e.message}` };
  }
  return reconstructEditContent(current, input.old_string, input.new_string || '', input.replace_all);
}

// t9: hook-level citation-verification backstop — citation checks ONLY (not control-flow-risk or
// hash comparison, which need plan-step-specific parameters — entryLine/insertionLine, a previously
// recorded digest — that a generic file-write event doesn't carry; those stay skill-instruction-only
// in gc-plan/gc-execute). In-process require, no subprocess. Always exits 0 (advisory only).
function runCitationBackstop(data, filePath) {
  const { extractCitations, verifyCitation } = require('./lib/plan-verifier');
  const { skip, reason, content } = getContentForCitationCheck(data, filePath);

  const parts = [];
  if (skip) {
    parts.push(`ℹ️  GEDEON CITATION CHECK: ${reason}`);
  } else {
    const workspaceRoot = data.cwd || process.cwd();
    const planStoreRoot = path.join(gedeonHome(), 'plans');
    const { pairs, skippedRowCount } = extractCitations(content);
    const failures = pairs
      .map(({ step, citationText }) => ({ step, result: verifyCitation(citationText, workspaceRoot, planStoreRoot) }))
      .filter(({ result }) => !result.valid);

    if (failures.length) {
      parts.push(
        `⚠️  GEDEON CITATION CHECK: ${failures.length} citation(s) failed verification: ` +
        failures.map(({ step, result }) => `Step ${step} — ${result.reason}`).join('; ') + '.'
      );
    } else if (pairs.length) {
      parts.push(`✅ GEDEON CITATION CHECK: all ${pairs.length} citation(s) verified.`);
    }
    if (skippedRowCount > 0) {
      parts.push(`${skippedRowCount} row(s) could not be parsed for citation checking.`);
    }
  }

  if (parts.length) {
    const out = {
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: parts.join(' ') },
    };
    process.stdout.write(JSON.stringify(out), () => process.exit(0));
  } else {
    process.exit(0);
  }
}

readStdin().then(data => {
  if (!data) process.exit(0);

  const toolName = data.tool_name || '';
  if (toolName !== 'Write' && toolName !== 'Edit') process.exit(0);

  const filePath = (data.tool_input || {}).file_path || (data.tool_input || {}).path || '';
  if (!filePath) process.exit(0);

  // t9: citation-verification backstop — checked BEFORE ALWAYS_ALLOWED/PROTECTED and pipeline-stage
  // gates below, since those would otherwise exempt every plan/report write (they match `.md$`)
  // before this check ever ran. Never falls through to, and is never reached by, the logic below.
  if (PLAN_FILE_PATTERN.test(filePath) || PREFLIGHT_REPORT_PATTERN.test(filePath)) {
    runCitationBackstop(data, filePath);
    return;
  }

  if (ALWAYS_ALLOWED.some(p => p.test(filePath)) && !PROTECTED.test(filePath)) process.exit(0);

  const cwd = data.cwd || process.cwd();
  const state = loadPipelineState(cwd);
  if (!state || !state.stage) process.exit(0);

  const { stage } = state;
  const stageIdx = STAGE_IDS.indexOf(stage);

  if (stageIdx < 0) {
    process.stderr.write(`[gedeon-construct] pre-write-guard: unrecognized stage ${JSON.stringify(stage)}\n`);
    process.exit(0);
  }
  if (stageIdx >= EXECUTE_IDX) process.exit(0);

  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        `⚠️  GEDEON ADVISORY: Stage is ${JSON.stringify(stage)} — code writes belong at execute stage or later. ` +
        `Run /gc-execute first, or proceed if this is intentional scaffolding.`,
    },
  };
  process.stdout.write(JSON.stringify(out), () => process.exit(0));
}).catch(e => {
  process.stderr.write(`[gedeon-construct] pre-write-guard error: ${e.message}\n`);
  process.exit(0);
});

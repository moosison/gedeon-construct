// hooks/lib/activity-timer.js
// @ai-rules:
// 1. [Constraint]: Pure module — no fs/path/process access, no I/O. Callers (usage-tracker.js) own all file reads.
// 2. [Pattern]: classifyActivityWindow does not assume sorted input — sorts a defensive copy.
// 3. [Gotcha]: IDLE_THRESHOLD_MS is a fixed constant, not configurable this iteration — see lean note below.
// 4. [Gotcha]: isToolResult classification depends on a transcript field (toolUseResult) verified empirically
//    against a live transcript, not derivable from this repo's own code — see the lean note directly above
//    classifyActivityWindow, further down in this same file, for the full accepted-limitation disclosure.
'use strict';

// lean: fixed 15-minute idle threshold, not user-configurable — ceiling = an unusually long
// individual gap (e.g. a 20-minute tool run, or a long uninterrupted read) could misclassify as
// idle; upgrade path = make configurable via .construct/config.json if false-classifications
// prove common in practice.
const IDLE_THRESHOLD_MS = 15 * 60 * 1000;

function emptyTimeBucket() {
  return { humanActiveSeconds: 0, claudeBuildSeconds: 0, idleSeconds: 0 };
}

function addTimeBucket(target, source) {
  target.humanActiveSeconds += (source && source.humanActiveSeconds) || 0;
  target.claudeBuildSeconds += (source && source.claudeBuildSeconds) || 0;
  target.idleSeconds += (source && source.idleSeconds) || 0;
}

// Code-review fix (Maintainability/Principal, 2026-07-10): the array-exclusion defensive-read
// idiom was copy-pasted at 5 sites in usage-tracker.js's regenerateUsageRollup/foldPriorIntoSlug.
// One shared helper closes that duplication the same way foldByModelInto already does for byModel.
function coerceTimeBucket(x) {
  return (x && typeof x === 'object' && !Array.isArray(x)) ? x : emptyTimeBucket();
}

// lean: isToolResult's source field (obj.toolUseResult in usage-tracker.js's event-push, see t3)
// was verified empirically against a live Claude Code transcript during this feature's brainstorming
// phase (docs/superpowers/specs/2026-07-09-active-idle-time-tracking-design.md's "Grounding fact"
// section) — it is NOT independently re-derivable from this repo's own code, since transcript
// format is defined by the Claude Code harness, not this codebase. If this field is ever renamed
// or restructured upstream, isToolResult silently resolves false (Boolean(undefined)), and every
// genuine tool-result continuation misclassifies as human time instead of Claude time — a
// degradation, not a crash (the Boolean() coercion never throws). Accepted for a single-user local
// tool; upgrade path = re-verify against a live transcript sample if token/time totals ever look
// suspiciously human-heavy relative to actual usage patterns.
// events: [{ts (epoch ms number), type ('user'|'assistant'), isToolResult (bool)}], any order.
// Gaps > IDLE_THRESHOLD_MS are idle (excluded from both tallies). Otherwise attributed to
// Claude (next event is assistant, or a tool-result) or human (next event is a genuine human
// message). humanActiveSeconds + claudeBuildSeconds + idleSeconds reconstructs the original
// wall-clock span exactly (consecutive gaps partition the span with no overlap).
function classifyActivityWindow(events) {
  const bucket = emptyTimeBucket();
  if (!Array.isArray(events) || events.length < 2) return bucket;
  const sorted = events.slice().sort((a, b) => a.ts - b.ts);
  for (let i = 1; i < sorted.length; i++) {
    const gapMs = sorted[i].ts - sorted[i - 1].ts;
    if (gapMs <= 0) continue;
    const gapSeconds = gapMs / 1000;
    if (gapMs > IDLE_THRESHOLD_MS) {
      bucket.idleSeconds += gapSeconds;
    } else if (sorted[i].type === 'assistant' || sorted[i].isToolResult) {
      bucket.claudeBuildSeconds += gapSeconds;
    } else {
      bucket.humanActiveSeconds += gapSeconds;
    }
  }
  return bucket;
}

module.exports = { IDLE_THRESHOLD_MS, emptyTimeBucket, addTimeBucket, coerceTimeBucket, classifyActivityWindow };

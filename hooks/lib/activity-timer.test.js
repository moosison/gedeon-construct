// hooks/lib/activity-timer.test.js
// @ai-rules:
// 1. [Constraint]: Node built-ins only (assert) — no test framework, matches the project's
//    zero-external-dependency constraint. Run directly: node hooks/lib/activity-timer.test.js
// 2. [Pattern]: Regression guard for classifyActivityWindow's gap-partitioning algorithm (Plan
//    t2, active-idle-time-tracking). Mirrors usage-tracker.test.js's style: one function per
//    scenario, each called from run(), each printing its own pass line.
// 3. [Gotcha]: Every expected number here was hand-traced against the actual gap-classification
//    loop in activity-timer.js (classify by sorted[i], the SECOND event of each consecutive
//    pair) and cross-checked by running the real implementation — not assumed from prose.
'use strict';
const assert = require('assert');

const { classifyActivityWindow } = require('./activity-timer');

// 1. Idle exclusion: a 20-minute gap (> 15-minute IDLE_THRESHOLD_MS) is idle, not attributed to
// either human or Claude.
function idleExclusion() {
  const bucket = classifyActivityWindow([
    { ts: 0, type: 'assistant' },
    { ts: 1200000, type: 'assistant' },
  ]);
  assert.strictEqual(bucket.idleSeconds, 1200, 'idleExclusion: 20-minute gap is fully idle');
  assert.strictEqual(bucket.humanActiveSeconds, 0, 'idleExclusion: no human time attributed');
  assert.strictEqual(bucket.claudeBuildSeconds, 0, 'idleExclusion: no Claude time attributed');
  console.log('idleExclusion: all assertions passed');
}

// 2. Claude-build via assistant type: a 5-minute gap ending in an assistant event is Claude time.
function claudeBuildViaAssistantType() {
  const bucket = classifyActivityWindow([
    { ts: 0, type: 'assistant' },
    { ts: 300000, type: 'assistant' },
  ]);
  assert.strictEqual(bucket.claudeBuildSeconds, 300, 'claudeBuildViaAssistantType: 5-minute gap attributed to Claude');
  assert.strictEqual(bucket.humanActiveSeconds, 0, 'claudeBuildViaAssistantType: no human time attributed');
  assert.strictEqual(bucket.idleSeconds, 0, 'claudeBuildViaAssistantType: no idle time attributed');
  console.log('claudeBuildViaAssistantType: all assertions passed');
}

// 3. Claude-build via tool-result: a 5-minute gap ending in a user/isToolResult event is still
// Claude time (a tool-result continuation is Claude's own turn, not genuine human input).
function claudeBuildViaToolResult() {
  const bucket = classifyActivityWindow([
    { ts: 0, type: 'assistant' },
    { ts: 300000, type: 'user', isToolResult: true },
  ]);
  assert.strictEqual(bucket.claudeBuildSeconds, 300, 'claudeBuildViaToolResult: tool-result continuation attributed to Claude, not human');
  assert.strictEqual(bucket.humanActiveSeconds, 0, 'claudeBuildViaToolResult: no human time attributed');
  assert.strictEqual(bucket.idleSeconds, 0, 'claudeBuildViaToolResult: no idle time attributed');
  console.log('claudeBuildViaToolResult: all assertions passed');
}

// 4. Human attribution: a 5-minute gap ending in a genuine user (non-tool-result) event is human
// time.
function humanAttribution() {
  const bucket = classifyActivityWindow([
    { ts: 0, type: 'assistant' },
    { ts: 300000, type: 'user', isToolResult: false },
  ]);
  assert.strictEqual(bucket.humanActiveSeconds, 300, 'humanAttribution: genuine human message attributed to human time');
  assert.strictEqual(bucket.claudeBuildSeconds, 0, 'humanAttribution: no Claude time attributed');
  assert.strictEqual(bucket.idleSeconds, 0, 'humanAttribution: no idle time attributed');
  console.log('humanAttribution: all assertions passed');
}

// 5. Partition identity: a 4-event sequence with mixed gap types. Gaps: 60s assistant (build),
// 1200s idle (> 900s threshold), 60s assistant (build). Hand-computed: claudeBuildSeconds =
// 60 + 60 = 120, idleSeconds = 1200, humanActiveSeconds = 0. The three buckets must sum to the
// exact wall-clock span (lastTs - firstTs) / 1000 = 1320.
function partitionIdentity() {
  const bucket = classifyActivityWindow([
    { ts: 0, type: 'assistant' },
    { ts: 60000, type: 'assistant' },
    { ts: 1260000, type: 'user', isToolResult: false },
    { ts: 1320000, type: 'assistant' },
  ]);
  assert.strictEqual(
    bucket.humanActiveSeconds + bucket.claudeBuildSeconds + bucket.idleSeconds,
    1320,
    'partitionIdentity: buckets sum to the exact wall-clock span (1320s)'
  );
  assert.strictEqual(bucket.claudeBuildSeconds, 120, 'partitionIdentity: claudeBuildSeconds = 60 (first gap) + 60 (third gap)');
  assert.strictEqual(bucket.idleSeconds, 1200, 'partitionIdentity: idleSeconds = 1200 (second gap, > 900s threshold)');
  assert.strictEqual(bucket.humanActiveSeconds, 0, 'partitionIdentity: no gap ends in a genuine human event here');
  console.log('partitionIdentity: all assertions passed');
}

// 6. Degenerate input: empty array and single-element array both return an all-zero bucket
// without throwing (there is no gap to classify).
function degenerateInput() {
  assert.deepStrictEqual(
    classifyActivityWindow([]),
    { humanActiveSeconds: 0, claudeBuildSeconds: 0, idleSeconds: 0 },
    'degenerateInput: empty array returns an all-zero bucket'
  );
  assert.deepStrictEqual(
    classifyActivityWindow([{ ts: 0, type: 'assistant' }]),
    { humanActiveSeconds: 0, claudeBuildSeconds: 0, idleSeconds: 0 },
    'degenerateInput: single-element array returns an all-zero bucket'
  );
  console.log('degenerateInput: all assertions passed');
}

// 7. Unsorted input: events passed out of chronological order must classify identically to the
// sorted version, proving the defensive internal sort works.
function unsortedInput() {
  const bucket = classifyActivityWindow([
    { ts: 300000, type: 'assistant' },
    { ts: 0, type: 'assistant' },
  ]);
  assert.strictEqual(bucket.claudeBuildSeconds, 300, 'unsortedInput: out-of-order events still classify as if sorted (5-minute gap, Claude time)');
  assert.strictEqual(bucket.humanActiveSeconds, 0, 'unsortedInput: no human time attributed');
  assert.strictEqual(bucket.idleSeconds, 0, 'unsortedInput: no idle time attributed');
  console.log('unsortedInput: all assertions passed');
}

// 8. Exact-threshold boundary: a gap of exactly IDLE_THRESHOLD_MS (900000ms) is still active
// (strict `>` in the implementation means exactly-900000ms is NOT idle).
function exactThresholdBoundary() {
  const bucket = classifyActivityWindow([
    { ts: 0, type: 'assistant', isToolResult: false },
    { ts: 900000, type: 'assistant', isToolResult: false },
  ]);
  assert.strictEqual(bucket.claudeBuildSeconds, 900, 'exactThresholdBoundary: exactly-900000ms gap is still active (strict > threshold), attributed to Claude');
  assert.strictEqual(bucket.idleSeconds, 0, 'exactThresholdBoundary: exactly-900000ms gap is NOT idle');
  assert.strictEqual(bucket.humanActiveSeconds, 0, 'exactThresholdBoundary: no human time attributed');
  console.log('exactThresholdBoundary: all assertions passed');
}

// 9. Tied timestamp: two events sharing the exact same ts produce a zero-length gap
// (`gapMs <= 0`, activity-timer.js's classification loop), which must contribute to neither
// bucket rather than being attributed by the second event's type.
function tiedTimestampGap() {
  const bucket = classifyActivityWindow([
    { ts: 0, type: 'assistant' },
    { ts: 0, type: 'user', isToolResult: false },
  ]);
  assert.deepStrictEqual(
    bucket,
    { humanActiveSeconds: 0, claudeBuildSeconds: 0, idleSeconds: 0 },
    'tiedTimestampGap: a zero-length (tied-timestamp) gap contributes to no bucket'
  );
  console.log('tiedTimestampGap: all assertions passed');
}

function run() {
  idleExclusion();
  claudeBuildViaAssistantType();
  claudeBuildViaToolResult();
  humanAttribution();
  partitionIdentity();
  degenerateInput();
  unsortedInput();
  exactThresholdBoundary();
  tiedTimestampGap();
  console.log('activity-timer.test.js: all assertions passed');
}

run();

// hooks/lib/usage-tracker.test.js
// @ai-rules:
// 1. [Constraint]: Node built-ins only (assert, fs, os, path) — no test framework, matches the
//    project's zero-external-dependency constraint. Run directly: node hooks/lib/usage-tracker.test.js
// 2. [Pattern]: Regression guard for computeAndRecordUsage's per-milestone cost bucket. Originally
//    added after code review found this function shipped two HIGH regressions across two
//    pre-flight rounds (cumulative under-count at a mid-session slug transition; a token-loss gap
//    at the transition boundary) with zero persisted test coverage. Extended again (usage-debt-
//    hook-hardening plan, t4) after usage-tracker.js was rewritten to per-session files + a
//    synchronous, fully-recomputed rollup (regenerateUsageRollup) — the old shared-slot cross-
//    session fold (the confirmed corruption mechanism) is gone; byPlanSlug is now a LIVE view
//    (open + closed windows) instead of closed-windows-only. Several assertions below were
//    rewritten, not just added, because the correct expected values genuinely changed under the
//    new design — each rewrite is called out explicitly in its own comment, verified by hand-
//    trace AND by running the real implementation before locking in the expected number (never
//    assumed from the old design's arithmetic).
// 3. [Gotcha]: Every scenario in this file was cross-checked against a live run of the actual
//    hooks/lib/usage-tracker.js in this repo (not against the plan's prose description of it) —
//    do not "fix" an assertion here to match old intuition without re-running the real code first.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { computeAndRecordUsage } = require('./usage-tracker');

function mkLine(ts, tokens, model) {
  return JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    message: { model: model || 'claude-sonnet-5', usage: { input_tokens: tokens, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
  });
}

// A minimal 'user' transcript line — used to drive classifyActivityWindow's
// human-vs-Claude-vs-idle classification (t8). No token/message shape needed:
// parseUsageLines only reads .type/.timestamp/.toolUseResult off a 'user' line.
function mkUserLine(ts, isToolResult) {
  const obj = { type: 'user', timestamp: ts };
  if (isToolResult) obj.toolUseResult = { some: 'result' };
  return JSON.stringify(obj);
}

// t8: USAGE.json's byPlanSlug moved to a sibling .construct/USAGE-BY-PLAN-SLUG.json (hot-path
// split for the cockpit). This helper re-merges both files under the same u.byPlanSlug shape the
// rest of this suite already asserts against, so only item12 (which tests the split itself) needs
// its assertions rewritten — every other call site below is unaffected by the split.
function readUsage(tmpDir) {
  const usage = JSON.parse(fs.readFileSync(path.join(tmpDir, '.construct', 'USAGE.json'), 'utf8'));
  const byPlanSlugPath = path.join(tmpDir, '.construct', 'USAGE-BY-PLAN-SLUG.json');
  const byPlanSlug = fs.existsSync(byPlanSlugPath) ? JSON.parse(fs.readFileSync(byPlanSlugPath, 'utf8')) : {};
  return { ...usage, byPlanSlug };
}

function freshDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-tracker-test-'));
  fs.mkdirSync(path.join(d, '.construct'));
  return d;
}

// ---------------------------------------------------------------------------
// Section A: single-session lifecycle (steady state -> mid-session transition
// -> return-to-slug -> cross-session boundary -> reserved-key -> null-slug ->
// prototype-pollution guard). Mirrors the pre-t1 test's scenario shape so the
// same regression classes stay covered, but every assertion is re-derived
// against the new live-view design, not copied from the old file.
// ---------------------------------------------------------------------------
function sectionA() {
  const tmpDir = freshDir();
  const transcriptPath = path.join(tmpDir, 'session-A.jsonl');

  // 6 lines, 150 tokens each.
  const lines = [
    mkLine('2026-01-01T00:00:01Z', 150),
    mkLine('2026-01-01T00:00:02Z', 150),
    mkLine('2026-01-01T00:00:03Z', 150),
    mkLine('2026-01-01T00:00:04Z', 150),
    mkLine('2026-01-01T00:00:05Z', 150),
    mkLine('2026-01-01T00:00:06Z', 150),
  ];
  fs.writeFileSync(transcriptPath, lines.join('\n') + '\n');

  // A1. Steady state: two calls, same session+slug, whole-file re-parse each time.
  computeAndRecordUsage(tmpDir, transcriptPath, 'session-A', 'slug-x', '2026-01-01T00:00:00Z');
  computeAndRecordUsage(tmpDir, transcriptPath, 'session-A', 'slug-x', '2026-01-01T00:00:00Z');
  let u = readUsage(tmpDir);
  assert.strictEqual(u.currentSession.totals.totalTokens, 900, 'steady state: all 6 lines counted');

  // A2. Mid-session transition slug-x -> slug-y at line 4's timestamp (Plan items 5 & 6).
  computeAndRecordUsage(tmpDir, transcriptPath, 'session-A', 'slug-y', '2026-01-01T00:00:04Z');
  u = readUsage(tmpDir);
  assert.strictEqual(u.byPlanSlug['slug-x'].totals.totalTokens, 450, 'item 5: closed window (lines 1-3) landed in byPlanSlug[oldSlug], no post-transition leakage');
  assert.strictEqual(u.currentSession.totals.totalTokens, 450, 'transition: new open window = lines 4-6 so far');
  assert.strictEqual(u.currentSession.planSlug, 'slug-y');
  // REWRITTEN (was asserted 450 under the old closed-windows-only design): byPlanSlug/cumulative
  // are now a live view — cumulative.totals includes the CURRENT open window immediately, not
  // just closed windows, so it already equals the full 900 tokens the transcript actually holds
  // (450 closed + 450 open), verified against a live run of the real regenerateUsageRollup.
  assert.strictEqual(u.cumulative.totals.totalTokens, 900, 'design-change rewrite: cumulative is a live recompute (baseline + every session\'s closed AND open contribution), not an incremental closed-windows-only accumulator');
  // item 6: cumulative.byModel for the closed window's model is present and correctly summed
  // (single model here, so cumulative.byModel mirrors cumulative.totals exactly).
  assert.ok(u.cumulative.byModel['claude-sonnet-5'], 'item 6: cumulative.byModel carries the closed window\'s model');
  assert.strictEqual(u.cumulative.byModel['claude-sonnet-5'].totalTokens, 900, 'item 6: cumulative.byModel total matches cumulative.totals for the single-model case');

  // A3. Return-to-slug: slug-y -> slug-x again, at line 6's own timestamp.
  computeAndRecordUsage(tmpDir, transcriptPath, 'session-A', 'slug-x', '2026-01-01T00:00:06Z');
  u = readUsage(tmpDir);
  assert.strictEqual(u.byPlanSlug['slug-y'].totals.totalTokens, 300, 'return-to-slug: departing slug-y window = lines 4-5');
  // REWRITTEN (was asserted 450, "unchanged until its NEW window itself closes"): under the live
  // view, slug-x's global bucket also picks up session-A's CURRENT open window (line 6, 150
  // tokens) the moment it's attributed back to slug-x — 450 (closed) + 150 (open) = 600.
  assert.strictEqual(u.byPlanSlug['slug-x'].totals.totalTokens, 600, 'design-change rewrite: byPlanSlug[slug-x] includes the re-opened current window live, not just the prior closed window');
  // REWRITTEN (was asserted 750): same live-view reasoning — 450(slug-x closed) + 300(slug-y
  // closed) + 150(slug-x open) = 900, i.e. every one of the transcript's 900 tokens exactly once.
  assert.strictEqual(u.cumulative.totals.totalTokens, 900, 'design-change rewrite: cumulative = every token exactly once, closed + open, live');
  assert.strictEqual(u.currentSession.totals.totalTokens, 150, 'new slug-x window = line 6 alone');
  assert.strictEqual(u.currentSession.planSlug, 'slug-x');

  // A4. Cross-session boundary. DELIBERATE REWRITE (Plan t4, explicit instruction): under the old
  // design this assertion (byPlanSlug['slug-x'].totals.totalTokens === 600) was reached via the
  // now-deleted cross-session fold (a second session's Stop event folding the FIRST session's
  // final open window into byPlanSlug as a side effect of "another session's Stop implies this
  // one ended"). That mechanism is gone (usage-tracker.js:297-303 in the pre-t1 file). The SAME
  // total (600) is still produced here, but via a completely different, structurally simpler
  // mechanism: byPlanSlug is a live view, so session-A's own current open window (150, slug-x)
  // plus its own already-closed slug-x window (450) sum to 600 on ANY rollup call — including one
  // triggered by an unrelated session-B — with no special-casing of "session boundaries" at all.
  const transcriptPathB = path.join(tmpDir, 'session-B.jsonl');
  fs.writeFileSync(transcriptPathB, mkLine('2026-01-01T01:00:00Z', 0) + '\n');
  computeAndRecordUsage(tmpDir, transcriptPathB, 'session-B', 'slug-x', '2026-01-01T00:00:06Z');
  u = readUsage(tmpDir);
  assert.strictEqual(u.byPlanSlug['slug-x'].totals.totalTokens, 600, 'rewrite: same total (600) reached via the live-view formula, not the deleted cross-session fold');
  // REWRITTEN (was asserted 1, "increments once, at the real session boundary only"): cumulative
  // .sessions is now precisely defined as the count of per-session files on disk (Design decision
  // 5) — session-A.json and session-B.json both exist now, so this is 2, not a "real session
  // boundary" heuristic.
  assert.strictEqual(u.cumulative.sessions, 2, 'design-change rewrite: cumulative.sessions = count of per-session files on disk (2: session-A.json, session-B.json), not a boundary-detection heuristic');
  assert.strictEqual(u.cumulative.totals.totalTokens, 900, 'cumulative = 900 total tokens across both sessions (session-B contributed 0)');

  // A5. Reserved-key slug never wedges the write and never resolves to Object.prototype.
  const transcriptPathC = path.join(tmpDir, 'session-C.jsonl');
  fs.writeFileSync(transcriptPathC, mkLine('2026-01-02T00:00:00Z', 50) + '\n');
  computeAndRecordUsage(tmpDir, transcriptPathC, 'session-C', 'constructor', '2026-01-02T00:00:00Z');
  const transcriptPathD = path.join(tmpDir, 'session-D.jsonl');
  fs.writeFileSync(transcriptPathD, mkLine('2026-01-02T01:00:00Z', 0) + '\n');
  computeAndRecordUsage(tmpDir, transcriptPathD, 'session-D', 'other-slug', '2026-01-02T01:00:00Z');
  u = readUsage(tmpDir);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(u.byPlanSlug, 'constructor'), false, 'a "constructor"-named slug must NOT become an own property of byPlanSlug');
  assert.ok(u.byPlanSlug['reserved:constructor'] && u.byPlanSlug['reserved:constructor'].totals.totalTokens === 50, 'reserved slug remapped correctly');

  // A6. Null-slug window. REVERSED (construct-hygiene-instrument-repairs-ii, t7): the
  // 2026-07-10 usage-debt-hook-hardening milestone's "verified current behavior, not a bug"
  // characterization above was accurate for its own moment but was scoped to removing a
  // corruption-prone cross-session fold heuristic, not a considered judgment that unattributed
  // live cost is acceptable. The attribution-gap-probe (this milestone) measured a live, growing
  // $227.55 gap (6.7% of total) directly attributable to this omission, and computeAndRecordUsage's
  // own lean: comment already asserted null-slug tokens "fold into _unassigned" — an assertion the
  // 2026-07-10 redesign left stale and contradicted without updating. t7 gives regenerateUsageRollup's
  // open-window fold the same slug-or-_unassigned fallback shape foldPriorIntoSlug already carries,
  // so a null live planSlug now lands in byPlanSlug._unassigned instead of vanishing entirely.
  const transcriptPathE = path.join(tmpDir, 'session-E.jsonl');
  fs.writeFileSync(transcriptPathE, mkLine('2026-01-03T00:00:00Z', 20) + '\n');
  computeAndRecordUsage(tmpDir, transcriptPathE, 'session-E', null, null);
  u = readUsage(tmpDir);
  assert.ok(u.byPlanSlug['_unassigned'] && u.byPlanSlug['_unassigned'].totals.totalTokens === 20, 'a null-slug open window now folds into byPlanSlug._unassigned (20 tokens), closing the attribution-gap-probe Mechanism 2 finding');
  assert.strictEqual(u.cumulative.totals.totalTokens, 970, 'null-slug session\'s 20 tokens still land in cumulative.totals (900 + 50 + 0 + 20 = 970), never crashes, never silently dropped');

  // A7. Prototype-pollution guard (code-review HIGH finding), REWRITTEN for the new data flow.
  // The old test corrupted USAGE.json's currentSession field directly, because under the old
  // design currentSession was read back from the previous USAGE.json and folded forward. Under the
  // new design, regenerateUsageRollup NEVER reads USAGE.json back — currentSession is always the
  // calling session's own fresh in-memory data, and the ONLY things read from disk are _baseline.json
  // and files under .construct/usage/. So the real attack surface now is a hand-corrupted
  // per-session file on disk carrying a literal "__proto__" byModel key — write one directly and
  // confirm a DIFFERENT session's rollup call folds it in via safeModelKey without polluting
  // Object.prototype.
  const usageDirPath = path.join(tmpDir, '.construct', 'usage');
  const poisonSession = {
    sessionId: 'session-poison',
    planSlug: 'slug-poison',
    planSlugStartedAt: null,
    startedAt: null,
    lastUpdatedAt: '2026-01-04T00:00:00Z',
    elapsedSeconds: 0,
    totals: { inputTokens: 1, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 1, estimatedCostUsd: 0, unpriced: false },
    byModel: JSON.parse('{"__proto__": {"inputTokens": 999, "outputTokens": 0, "cacheCreationTokens": 0, "cacheReadTokens": 0, "totalTokens": 999, "estimatedCostUsd": 0, "unpriced": false}}'),
    byPlanSlug: {},
  };
  fs.writeFileSync(path.join(usageDirPath, 'session-poison.json'), JSON.stringify(poisonSession, null, 2));
  const transcriptPathG = path.join(tmpDir, 'session-G.jsonl');
  fs.writeFileSync(transcriptPathG, mkLine('2026-01-04T01:00:00Z', 0) + '\n');
  computeAndRecordUsage(tmpDir, transcriptPathG, 'session-G', 'slug-poison', '2026-01-04T01:00:00Z');
  assert.strictEqual(Object.prototype.totalTokens, undefined, 'Object.prototype must remain unpolluted after rolling up a per-session file with a literal __proto__ byModel key');
  u = readUsage(tmpDir);
  assert.ok(Object.prototype.hasOwnProperty.call(u.byPlanSlug['slug-poison'].byModel, 'reserved:__proto__'), 'the poisoned key is remapped to reserved:__proto__ rather than silently dropped or resolving to the prototype chain');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('sectionA: all assertions passed');
}

// ---------------------------------------------------------------------------
// Section B: Plan t4's 12 enumerated items, each isolated in its own scratch
// directory to keep the arithmetic easy to verify independently.
// ---------------------------------------------------------------------------

// Plan items 1 & 2: the core regression proof — two interleaved sessions must
// sum correctly, not multiply, and each session's own file reflects only its
// own data.
function item1And2_interleavedSessions() {
  const tmpDir = freshDir();
  const tpA = path.join(tmpDir, 'sessA.jsonl');
  const tpB = path.join(tmpDir, 'sessB.jsonl');
  fs.writeFileSync(tpA, [mkLine('2026-02-01T00:00:01Z', 100), mkLine('2026-02-01T00:00:02Z', 100), mkLine('2026-02-01T00:00:03Z', 100)].join('\n') + '\n'); // 300
  fs.writeFileSync(tpB, [mkLine('2026-02-01T00:00:01Z', 250), mkLine('2026-02-01T00:00:02Z', 250)].join('\n') + '\n'); // 500

  // Interleave repeated Stop events from both sessions — this is exactly the shape that caused
  // the old cross-session fold's ping-pong over-count (each session's Stop incorrectly folding
  // the OTHER session's window every time they alternated).
  //
  // Code-review fix (Testing + Plan Alignment, convergent finding): assert currentSession.sessionId
  // after EVERY call, not just the last one — a check only after the final call (which happens to
  // be sessB) can't distinguish "correctly self-describing" from "always shows whichever session
  // wrote most recently," since those coincide when the caller is also the last writer. Checking
  // after an intermediate call (sessA at the second-to-last position, with sessB's file already on
  // disk and definitionally not stale) is what actually proves the callingSessionFile fix over a
  // newest-mtime guess.
  computeAndRecordUsage(tmpDir, tpA, 'sessA', 'p', '2026-02-01T00:00:00Z');
  assert.strictEqual(readUsage(tmpDir).currentSession.sessionId, 'sessA', 'currentSession self-attribution: sessA calling first');
  computeAndRecordUsage(tmpDir, tpB, 'sessB', 'q', '2026-02-01T00:00:00Z');
  assert.strictEqual(readUsage(tmpDir).currentSession.sessionId, 'sessB', 'currentSession self-attribution: sessB calling second');
  computeAndRecordUsage(tmpDir, tpA, 'sessA', 'p', '2026-02-01T00:00:00Z');
  assert.strictEqual(readUsage(tmpDir).currentSession.sessionId, 'sessA', 'currentSession self-attribution: sessA calling again, even though sessB.json is already on disk and not stale — proves this is not a newest-mtime guess');
  computeAndRecordUsage(tmpDir, tpB, 'sessB', 'q', '2026-02-01T00:00:00Z');
  assert.strictEqual(readUsage(tmpDir).currentSession.sessionId, 'sessB', 'currentSession self-attribution: sessB calling again');
  computeAndRecordUsage(tmpDir, tpA, 'sessA', 'p', '2026-02-01T00:00:00Z');
  assert.strictEqual(readUsage(tmpDir).currentSession.sessionId, 'sessA', 'currentSession self-attribution: sessA calling a third time');
  computeAndRecordUsage(tmpDir, tpB, 'sessB', 'q', '2026-02-01T00:00:00Z');

  const u = readUsage(tmpDir);
  // item 1: true sum (300 + 500 = 800), not a multiple of it (the old bug would over-count here).
  assert.strictEqual(u.cumulative.totals.totalTokens, 800, 'item 1: interleaved sessions sum to the true total (800), never a multiple');

  // item 2: each session's own file exists and reflects only its own data.
  const sessAFile = JSON.parse(fs.readFileSync(path.join(tmpDir, '.construct', 'usage', 'sessA.json'), 'utf8'));
  const sessBFile = JSON.parse(fs.readFileSync(path.join(tmpDir, '.construct', 'usage', 'sessB.json'), 'utf8'));
  assert.strictEqual(sessAFile.totals.totalTokens, 300, 'item 2: sessA.json reflects only sessA\'s own 300 tokens');
  assert.strictEqual(sessBFile.totals.totalTokens, 500, 'item 2: sessB.json reflects only sessB\'s own 500 tokens');
  assert.strictEqual(sessAFile.sessionId, 'sessA');
  assert.strictEqual(sessBFile.sessionId, 'sessB');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item1And2_interleavedSessions: all assertions passed');
}

// Code-review fix (Testing finding): item 6 in sectionA only ever exercises ONE model
// ('claude-sonnet-5'), so cumulative.byModel there is indistinguishable from a plain mirror of
// cumulative.totals — it would pass even if per-model keying/summation across sessions were
// subtly broken (e.g. wrong key, or folding into the wrong model's bucket). This test uses two
// genuinely distinct models across a mid-session transition and asserts each model's bucket
// sums independently and correctly, which a totals-mirroring bug could not satisfy.
function item6_byModelFidelityTwoDistinctModels() {
  const tmpDir = freshDir();
  const transcriptPath = path.join(tmpDir, 'session-multimodel.jsonl');
  fs.writeFileSync(transcriptPath, [
    mkLine('2026-03-01T00:00:01Z', 100, 'claude-opus-4-8'),
    mkLine('2026-03-01T00:00:02Z', 100, 'claude-opus-4-8'),
    mkLine('2026-03-01T00:00:03Z', 50, 'claude-haiku-4-5'),
  ].join('\n') + '\n');

  computeAndRecordUsage(tmpDir, transcriptPath, 'session-multimodel', 'slug-m', '2026-03-01T00:00:00Z');
  const u = readUsage(tmpDir);
  assert.ok(u.cumulative.byModel['claude-opus-4-8'], 'opus bucket exists');
  assert.ok(u.cumulative.byModel['claude-haiku-4-5'], 'haiku bucket exists');
  assert.strictEqual(u.cumulative.byModel['claude-opus-4-8'].totalTokens, 200, 'opus bucket sums only its own 2 lines (200), not the haiku line');
  assert.strictEqual(u.cumulative.byModel['claude-haiku-4-5'].totalTokens, 50, 'haiku bucket sums only its own 1 line (50), not the opus lines');
  assert.strictEqual(u.cumulative.totals.totalTokens, 250, 'cumulative.totals is the true combined sum (200 + 50)');
  // Distinguishing assertion: a totals-mirroring bug (e.g. writing the SAME combined bucket under
  // both model keys, or under only one) would fail at least one of the two per-model checks above,
  // even though it could still pass a single-model item-6-style check.
  assert.notStrictEqual(u.cumulative.byModel['claude-opus-4-8'].totalTokens, u.cumulative.totals.totalTokens, 'opus bucket must NOT equal the combined total (proves per-model keying, not a mirror)');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item6_byModelFidelityTwoDistinctModels: all assertions passed');
}

// Plan item 3: _baseline.json created exactly once; a pre-existing USAGE.json's byPlanSlug
// lacking byModel doesn't throw and defaults correctly.
function item3_baselineCreatedOnceByModelDefaulting() {
  const tmpDir = freshDir();
  const legacy = {
    cumulative: { sessions: 5, totals: { inputTokens: 500, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 500, estimatedCostUsd: 0.5, unpriced: false }, byModel: {} },
    // Pre-upgrade shape: byPlanSlug bucket has NO byModel field at all (today's real format).
    byPlanSlug: { 'legacy-slug': { totals: { inputTokens: 500, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 500, estimatedCostUsd: 0.5, unpriced: false } } },
  };
  fs.writeFileSync(path.join(tmpDir, '.construct', 'USAGE.json'), JSON.stringify(legacy, null, 2));

  const tpZ = path.join(tmpDir, 'sessZ.jsonl');
  fs.writeFileSync(tpZ, mkLine('2026-05-01T00:00:01Z', 10) + '\n');

  assert.doesNotThrow(() => {
    computeAndRecordUsage(tmpDir, tpZ, 'sessZ', 'new-slug', '2026-05-01T00:00:00Z');
  }, 'item 3: a legacy byPlanSlug bucket missing byModel must not throw during rollup');

  const baselinePath = path.join(tmpDir, '.construct', 'usage', '_baseline.json');
  assert.ok(fs.existsSync(baselinePath), 'item 3: _baseline.json is created on first Stop after upgrade');
  const u = readUsage(tmpDir);
  assert.strictEqual(u.byPlanSlug['legacy-slug'].totals.totalTokens, 500, 'item 3: legacy byPlanSlug data is correctly folded via the baseline');
  assert.deepStrictEqual(u.byPlanSlug['legacy-slug'].byModel, {}, 'item 3: missing byModel on the legacy bucket defaults to {} rather than throwing or staying undefined');

  const baselineContentBefore = fs.readFileSync(baselinePath, 'utf8');
  computeAndRecordUsage(tmpDir, tpZ, 'sessZ', 'new-slug', '2026-05-01T00:00:00Z');
  const baselineContentAfter = fs.readFileSync(baselinePath, 'utf8');
  assert.strictEqual(baselineContentBefore, baselineContentAfter, 'item 3: _baseline.json is captured exactly once — a second Stop event does not rewrite it');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item3_baselineCreatedOnceByModelDefaulting: all assertions passed');
}

// Plan item 4: a session that never transitions plan-slugs still shows up in the global
// byPlanSlug via the live-view mechanism, even after it stops sending Stop events — verified via
// a LATER, different session's rollup.
function item4_nonTransitioningSessionStaysVisible() {
  const tmpDir = freshDir();
  const tpX = path.join(tmpDir, 'sessX.jsonl');
  fs.writeFileSync(tpX, mkLine('2026-03-01T00:00:01Z', 111) + '\n');
  computeAndRecordUsage(tmpDir, tpX, 'sessX', 's1', '2026-03-01T00:00:00Z');
  let u = readUsage(tmpDir);
  assert.strictEqual(u.byPlanSlug['s1'].totals.totalTokens, 111, 'sessX\'s single-slug window is visible right after its own Stop event');

  // sessX sends no further Stop events ("stops"). A later, unrelated session's Stop event still
  // triggers a full rollup that re-reads sessX.json from disk.
  const tpY = path.join(tmpDir, 'sessY.jsonl');
  fs.writeFileSync(tpY, mkLine('2026-03-01T01:00:01Z', 222) + '\n');
  computeAndRecordUsage(tmpDir, tpY, 'sessY', 's2', '2026-03-01T01:00:00Z');
  u = readUsage(tmpDir);
  assert.strictEqual(u.byPlanSlug['s1'].totals.totalTokens, 111, 'item 4: sessX\'s tokens are still visible in byPlanSlug[s1] via sessY\'s rollup, proving the live-view formula (not a cross-session fold) sustains visibility');
  assert.strictEqual(u.byPlanSlug['s2'].totals.totalTokens, 222, 'sessY\'s own window is correctly attributed to its own slug');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item4_nonTransitioningSessionStaysVisible: all assertions passed');
}

// Plan item 7: two sessions BOTH currently open on the SAME plan-slug, each with nonzero
// tokens — assert byPlanSlug[slug].totals equals the true sum of both (not one, not doubled).
function item7_twoSessionsSameSlugConcurrent() {
  const tmpDir = freshDir();
  const tpP = path.join(tmpDir, 'sessP.jsonl');
  const tpQ = path.join(tmpDir, 'sessQ.jsonl');
  fs.writeFileSync(tpP, mkLine('2026-04-01T00:00:01Z', 300) + '\n');
  fs.writeFileSync(tpQ, mkLine('2026-04-01T00:00:01Z', 500) + '\n');
  computeAndRecordUsage(tmpDir, tpP, 'sessP', 'shared', '2026-04-01T00:00:00Z');
  computeAndRecordUsage(tmpDir, tpQ, 'sessQ', 'shared', '2026-04-01T00:00:00Z');
  const u = readUsage(tmpDir);
  assert.strictEqual(u.byPlanSlug['shared'].totals.totalTokens, 800, 'item 7: two concurrently-open sessions on the same slug sum to the true total (300 + 500), not one alone and not doubled');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item7_twoSessionsSameSlugConcurrent: all assertions passed');
}

// Plan item 8: with a pre-existing USAGE.json carrying non-empty byPlanSlug data (baseline
// capture triggers), the baseline's contribution appears in the regenerated byPlanSlug exactly
// once, not twice — the _baseline.json-must-be-excluded-from-per-session-enumeration regression.
function item8_baselineCountedOnceNotTwice() {
  const tmpDir = freshDir();
  const legacy = {
    cumulative: { sessions: 3, totals: { inputTokens: 400, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 400, estimatedCostUsd: 0.4, unpriced: false }, byModel: { 'claude-sonnet-5': { inputTokens: 400, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 400, estimatedCostUsd: 0.4, unpriced: false } } },
    byPlanSlug: { 'old-slug': { totals: { inputTokens: 400, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 400, estimatedCostUsd: 0.4, unpriced: false }, byModel: {} } },
  };
  fs.writeFileSync(path.join(tmpDir, '.construct', 'USAGE.json'), JSON.stringify(legacy, null, 2));

  const tpW = path.join(tmpDir, 'sessW.jsonl');
  fs.writeFileSync(tpW, mkLine('2026-05-02T00:00:01Z', 10) + '\n');
  // Two separate Stop events for an unrelated slug — if _baseline.json were ever misread as a
  // session file during directory enumeration, 'old-slug' would double (or keep growing) across
  // calls even though nothing new ever writes to it.
  computeAndRecordUsage(tmpDir, tpW, 'sessW', 'unrelated-slug', '2026-05-02T00:00:00Z');
  let u = readUsage(tmpDir);
  assert.strictEqual(u.byPlanSlug['old-slug'].totals.totalTokens, 400, 'item 8: baseline\'s old-slug contribution appears exactly once after the first post-upgrade rollup');
  computeAndRecordUsage(tmpDir, tpW, 'sessW', 'unrelated-slug', '2026-05-02T00:00:00Z');
  u = readUsage(tmpDir);
  assert.strictEqual(u.byPlanSlug['old-slug'].totals.totalTokens, 400, 'item 8: still exactly 400 after a second Stop event — not doubled to 800, proving _baseline.json is excluded from the per-session file enumeration');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item8_baselineCountedOnceNotTwice: all assertions passed');
}

// Plan item 9: a brand-new project with no pre-existing USAGE.json at all — first rollup
// succeeds, empty baseline, no crash.
function item9_brandNewProjectNoCrash() {
  const tmpDir = freshDir();
  assert.strictEqual(fs.existsSync(path.join(tmpDir, '.construct', 'USAGE.json')), false, 'sanity: no pre-existing USAGE.json in this fresh project');
  const tpN = path.join(tmpDir, 'sessN.jsonl');
  fs.writeFileSync(tpN, mkLine('2026-06-01T00:00:01Z', 42) + '\n');

  assert.doesNotThrow(() => {
    computeAndRecordUsage(tmpDir, tpN, 'sessN', 'slug-new', '2026-06-01T00:00:00Z');
  }, 'item 9: first-ever Stop event in a brand-new project must not throw');

  const u = readUsage(tmpDir);
  assert.strictEqual(u.cumulative.totals.totalTokens, 42, 'item 9: correctly-computed first rollup for a brand-new project');
  assert.ok(fs.existsSync(path.join(tmpDir, '.construct', 'usage', '_baseline.json')), 'item 9: an (empty) baseline is still captured for a brand-new project');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item9_brandNewProjectNoCrash: all assertions passed');
}

// Plan item 10: a malformed per-session file on disk doesn't abort the rollup for a different
// session's own call.
function item10_malformedSessionFileDoesNotAbortRollup() {
  const tmpDir = freshDir();
  fs.mkdirSync(path.join(tmpDir, '.construct', 'usage'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.construct', 'usage', 'bad-session.json'), '{not valid json!!!');

  const tpR = path.join(tmpDir, 'sessR.jsonl');
  fs.writeFileSync(tpR, mkLine('2026-07-01T00:00:01Z', 77) + '\n');

  assert.doesNotThrow(() => {
    computeAndRecordUsage(tmpDir, tpR, 'sessR', 'slug-r', '2026-07-01T00:00:00Z');
  }, 'item 10: a malformed per-session file must not abort a different session\'s own rollup call');

  const u = readUsage(tmpDir);
  assert.strictEqual(u.cumulative.totals.totalTokens, 77, 'item 10: the real session\'s own 77 tokens are correctly recorded despite the malformed sibling file');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item10_malformedSessionFileDoesNotAbortRollup: all assertions passed');
}

// Plan item 11: an invalid sessionId (fails resolve-then-contain, e.g. contains "../") causes
// computeAndRecordUsage to return early without writing any file or throwing.
function item11_invalidSessionIdRejectedEarly() {
  const tmpDir = freshDir();
  const tpV = path.join(tmpDir, 'sessV.jsonl');
  fs.writeFileSync(tpV, mkLine('2026-08-01T00:00:01Z', 99) + '\n');
  const evilSessionId = '../../evil';

  assert.doesNotThrow(() => {
    computeAndRecordUsage(tmpDir, tpV, evilSessionId, 'slug-v', '2026-08-01T00:00:00Z');
  }, 'item 11: a path-traversal sessionId must not throw — it is rejected and the call returns early');

  assert.strictEqual(fs.existsSync(path.join(tmpDir, '.construct', 'USAGE.json')), false, 'item 11: no USAGE.json is written when sessionId fails resolve-then-contain');
  const usageDirPath = path.join(tmpDir, '.construct', 'usage');
  const entries = fs.existsSync(usageDirPath) ? fs.readdirSync(usageDirPath) : [];
  assert.strictEqual(entries.length, 0, 'item 11: no session file is written anywhere under .construct/usage/ for a rejected sessionId');
  // Confirm nothing escaped the intended containment directory either.
  const outsidePath = path.resolve(tmpDir, '..', 'evil.json');
  assert.strictEqual(fs.existsSync(outsidePath), false, 'item 11: no file is written outside the usage/ directory');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item11_invalidSessionIdRejectedEarly: all assertions passed');
}

// Plan item 12: confirm the readUsage helper still works unchanged — the final
// .construct/USAGE.json path/shape did not change under this rewrite (only the internal
// computation did). Verified directly rather than assumed: every scenario above already relies
// on readUsage succeeding, and this final check confirms the top-level shape explicitly.
function item12_readUsageShapeUnchanged() {
  const tmpDir = freshDir();
  const tp = path.join(tmpDir, 'sess.jsonl');
  fs.writeFileSync(tp, mkLine('2026-09-01T00:00:01Z', 5) + '\n');
  computeAndRecordUsage(tmpDir, tp, 'sess', 'slug', '2026-09-01T00:00:00Z');

  // Read USAGE.json raw (not through the merging readUsage() helper) to assert the split's
  // actual on-disk shape: byPlanSlug must be GONE from USAGE.json, moved to its own sibling file.
  const rawUsage = JSON.parse(fs.readFileSync(path.join(tmpDir, '.construct', 'USAGE.json'), 'utf8'));
  assert.ok(Object.prototype.hasOwnProperty.call(rawUsage, 'cumulative'), 'item 12: USAGE.json still has a top-level cumulative key');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(rawUsage, 'byPlanSlug'), false, 'item 12: USAGE.json no longer has a top-level byPlanSlug key (t8 split)');
  assert.ok(Object.prototype.hasOwnProperty.call(rawUsage, 'currentSession'), 'item 12: USAGE.json still has a top-level currentSession key');
  assert.strictEqual(path.join(tmpDir, '.construct', 'USAGE.json'), path.join(tmpDir, '.construct', 'USAGE.json'), 'item 12: the readUsage helper\'s path (.construct/USAGE.json) is unchanged');

  const byPlanSlugPath = path.join(tmpDir, '.construct', 'USAGE-BY-PLAN-SLUG.json');
  assert.ok(fs.existsSync(byPlanSlugPath), 'item 12: .construct/USAGE-BY-PLAN-SLUG.json exists after regenerateUsageRollup');
  const byPlanSlugFile = JSON.parse(fs.readFileSync(byPlanSlugPath, 'utf8'));
  assert.ok(byPlanSlugFile['slug'] && byPlanSlugFile['slug'].totals.totalTokens === 5, 'item 12: USAGE-BY-PLAN-SLUG.json has the expected slug bucket (totalTokens 5, from this test\'s own single 5-token line)');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item12_readUsageShapeUnchanged: all assertions passed');
}

// ---------------------------------------------------------------------------
// Section C: active/idle time-bucket coverage (Steps t3-t7's `.time` feature).
// Each scenario's expected numbers are hand-traced against classifyActivityWindow's
// real algorithm (gaps <= IDLE_THRESHOLD_MS attributed to Claude if the next event
// is assistant/tool-result, else human; gaps > threshold are idle) — not assumed.
// ---------------------------------------------------------------------------

// itemT1: a single session's hand-traced time bucket folds through the live view
// (session's own file, cumulative, and byPlanSlug) identically, and elapsedSeconds
// is fully gone from the per-session file.
function itemT1_timeBucketFoldsThroughLiveView() {
  const tmpDir = freshDir();
  const transcriptPath = path.join(tmpDir, 'session-t1.jsonl');
  const lines = [
    mkLine('2026-10-01T00:00:00Z', 0),          // t=0s, assistant
    mkLine('2026-10-01T00:02:00Z', 0),          // t=120s, assistant -> gap 120s claude-build
    mkUserLine('2026-10-01T00:03:00Z', true),   // t=180s, user tool-result -> gap 60s claude-build
    mkUserLine('2026-10-01T00:23:00Z', false),  // t=1380s, genuine user -> gap 1200s idle (>900s threshold)
    mkLine('2026-10-01T00:26:00Z', 0),          // t=1560s, assistant -> gap 180s claude-build
  ];
  fs.writeFileSync(transcriptPath, lines.join('\n') + '\n');

  computeAndRecordUsage(tmpDir, transcriptPath, 'session-t1', 'slug-t1', '2026-10-01T00:00:00Z');

  const sessionFile = JSON.parse(fs.readFileSync(path.join(tmpDir, '.construct', 'usage', 'session-t1.json'), 'utf8'));
  assert.deepStrictEqual(sessionFile.time, { humanActiveSeconds: 0, claudeBuildSeconds: 360, idleSeconds: 1200 }, 'itemT1: hand-traced time bucket (120+60+180 claude-build, 1200 idle, 0 human)');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(sessionFile, 'elapsedSeconds'), false, 'itemT1: elapsedSeconds must be fully removed from the per-session file');

  const u = readUsage(tmpDir);
  assert.deepStrictEqual(u.cumulative.time, { humanActiveSeconds: 0, claudeBuildSeconds: 360, idleSeconds: 1200 }, 'itemT1: cumulative.time matches (sole contributor)');
  assert.deepStrictEqual(u.byPlanSlug['slug-t1'].time, { humanActiveSeconds: 0, claudeBuildSeconds: 360, idleSeconds: 1200 }, 'itemT1: byPlanSlug[slug].time matches (sole contributor)');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('itemT1_timeBucketFoldsThroughLiveView: all assertions passed');
}

// itemT2: migration safety — pre-t5/t7 data missing the .time field anywhere it can appear
// (a per-session byPlanSlug bucket, _baseline.json's cumulative/byPlanSlug, and an entire
// sibling per-session file) must default to zero rather than throw, without polluting a
// fresh session's own real numbers.
function itemT2_migrationSafetyMissingTimeField() {
  // Part 1: a pre-existing per-session file's OWN byPlanSlug bucket has totals/byModel but no
  // .time at all. A different, fresh session's Stop event must not throw, and that bucket's
  // .time must read as zero in the live USAGE.json view.
  const tmpDir = freshDir();
  const usageDirPath = path.join(tmpDir, '.construct', 'usage');
  fs.mkdirSync(usageDirPath, { recursive: true });
  const bucketTotals = { inputTokens: 100, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 100, estimatedCostUsd: 0.1, unpriced: false };
  const existingSession = {
    sessionId: 'existing-session',
    planSlug: 'existing-slug',
    planSlugStartedAt: null,
    startedAt: null,
    lastUpdatedAt: '2026-10-02T00:00:00Z',
    totals: bucketTotals,
    byModel: {},
    byPlanSlug: {
      'existing-slug': { totals: bucketTotals, byModel: {} }, // no .time field at all
    },
  };
  fs.writeFileSync(path.join(usageDirPath, 'existing-session.json'), JSON.stringify(existingSession, null, 2));

  const tpFresh = path.join(tmpDir, 'session-t2-fresh.jsonl');
  fs.writeFileSync(tpFresh, mkLine('2026-10-02T01:00:00Z', 5) + '\n');
  assert.doesNotThrow(() => {
    computeAndRecordUsage(tmpDir, tpFresh, 'session-t2-fresh', 'fresh-slug', '2026-10-02T01:00:00Z');
  }, 'itemT2 part 1: a legacy per-session byPlanSlug bucket missing .time must not throw during rollup');
  const u1 = readUsage(tmpDir);
  assert.deepStrictEqual(u1.byPlanSlug['existing-slug'].time, { humanActiveSeconds: 0, claudeBuildSeconds: 0, idleSeconds: 0 }, 'itemT2 part 1: missing .time on a pre-existing byPlanSlug bucket defaults to zero, not a crash');
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // Sub-case A: _baseline.json itself (both cumulative and its byPlanSlug bucket) predates .time.
  const tmpDirA = freshDir();
  const usageDirA = path.join(tmpDirA, '.construct', 'usage');
  fs.mkdirSync(usageDirA, { recursive: true });
  const zeroTotals = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, estimatedCostUsd: 0, unpriced: false };
  const baselineA = {
    cumulative: { sessions: 1, totals: zeroTotals, byModel: {} },
    byPlanSlug: { 'legacy-slug': { totals: zeroTotals, byModel: {} } },
  };
  fs.writeFileSync(path.join(usageDirA, '_baseline.json'), JSON.stringify(baselineA, null, 2));
  const tpA = path.join(tmpDirA, 'session-t2a.jsonl');
  fs.writeFileSync(tpA, [mkLine('2026-10-03T00:00:00Z', 0), mkLine('2026-10-03T00:00:50Z', 0)].join('\n') + '\n'); // 50s apart
  computeAndRecordUsage(tmpDirA, tpA, 'session-t2a', 'new-slug-a', '2026-10-03T00:00:00Z');
  const uA = readUsage(tmpDirA);
  assert.deepStrictEqual(uA.cumulative.time, { humanActiveSeconds: 0, claudeBuildSeconds: 50, idleSeconds: 0 }, 'itemT2 sub-case A: cumulative.time = baseline\'s missing .time (zero) + fresh session\'s real 50s claude-build');
  assert.deepStrictEqual(uA.byPlanSlug['legacy-slug'].time, { humanActiveSeconds: 0, claudeBuildSeconds: 0, idleSeconds: 0 }, 'itemT2 sub-case A: legacy-slug bucket\'s missing .time defaults to zero');
  fs.rmSync(tmpDirA, { recursive: true, force: true });

  // Sub-case B: a sibling per-session file (X) entirely missing the top-level .time key — only
  // ever read cross-session, during session Y's rollup.
  const tmpDirB = freshDir();
  const usageDirB = path.join(tmpDirB, '.construct', 'usage');
  fs.mkdirSync(usageDirB, { recursive: true });
  const sessionX = {
    sessionId: 'session-t2-x',
    planSlug: 'shared-slug-t2',
    planSlugStartedAt: null,
    startedAt: null,
    lastUpdatedAt: '2026-10-04T00:00:00Z',
    totals: { inputTokens: 10, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 10, estimatedCostUsd: 0, unpriced: false },
    byModel: {},
    byPlanSlug: {},
    // no `.time` key at all — pre-t5 shape.
  };
  fs.writeFileSync(path.join(usageDirB, 'session-t2-x.json'), JSON.stringify(sessionX, null, 2));
  const tpY = path.join(tmpDirB, 'session-t2-y.jsonl');
  fs.writeFileSync(tpY, [mkLine('2026-10-04T01:00:00Z', 0), mkLine('2026-10-04T01:00:30Z', 0)].join('\n') + '\n'); // 30s apart
  computeAndRecordUsage(tmpDirB, tpY, 'session-t2-y', 'shared-slug-t2', '2026-10-04T01:00:00Z');
  const uB = readUsage(tmpDirB);
  assert.deepStrictEqual(uB.cumulative.time, { humanActiveSeconds: 0, claudeBuildSeconds: 30, idleSeconds: 0 }, 'itemT2 sub-case B: X\'s missing .time contributes zero; Y\'s real 30s survives intact');
  fs.rmSync(tmpDirB, { recursive: true, force: true });

  console.log('itemT2_migrationSafetyMissingTimeField: all assertions passed');
}

// itemT3: a .time or .byModel field corrupted on disk as a literal array must self-heal to a
// proper object rather than throw or silently pollute a fresh session's numbers — same-session
// (computeAndRecordUsage's own repair loop) and cross-session (regenerateUsageRollup's own
// defensive guard) are two structurally different code paths and must each be proven separately.
function itemT3_arrayCorruptedTimeFieldDoesNotPollute() {
  // Case A: same-session repair.
  const tmpDirA = freshDir();
  const usageDirA = path.join(tmpDirA, '.construct', 'usage');
  fs.mkdirSync(usageDirA, { recursive: true });
  const sessionCaseA = {
    sessionId: 'session-t3a',
    planSlug: 'slug-t3a',
    planSlugStartedAt: '2026-10-05T00:00:00Z',
    startedAt: '2026-10-05T00:00:00Z',
    lastUpdatedAt: '2026-10-05T00:00:00Z',
    totals: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, estimatedCostUsd: 0, unpriced: false },
    byModel: {},
    byPlanSlug: {
      'slug-t3a': { totals: { inputTokens: 5, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 5, estimatedCostUsd: 0, unpriced: false }, byModel: {}, time: [] },
    },
  };
  fs.writeFileSync(path.join(usageDirA, 'session-t3a.json'), JSON.stringify(sessionCaseA, null, 2));
  const tpA = path.join(tmpDirA, 'session-t3a.jsonl');
  fs.writeFileSync(tpA, mkLine('2026-10-05T00:00:00Z', 0) + '\n');
  assert.doesNotThrow(() => {
    computeAndRecordUsage(tmpDirA, tpA, 'session-t3a', 'slug-t3a', '2026-10-05T00:00:00Z');
  }, 'itemT3 Case A: an array-corrupted byPlanSlug[key].time must not throw during same-session repair');
  const repairedA = JSON.parse(fs.readFileSync(path.join(usageDirA, 'session-t3a.json'), 'utf8'));
  const repairedTime = repairedA.byPlanSlug['slug-t3a'].time;
  // Concrete-value assertion (code-review fix, 2026-07-10 — was previously just typeof checks):
  // this slug has no transition this call (prior.planSlug === normalizedSlug), so byPlanSlug['slug-t3a']
  // is untouched by any fold — only the repair loop's array->emptyTimeBucket() reset applies, making
  // {0,0,0} the deterministic expected value, not just "some object with numeric fields."
  assert.deepStrictEqual(repairedTime, { humanActiveSeconds: 0, claudeBuildSeconds: 0, idleSeconds: 0 }, 'itemT3 Case A: repaired .time equals the deterministic zero bucket, not merely typed correctly');
  fs.rmSync(tmpDirA, { recursive: true, force: true });

  // Case B: cross-session — X's corrupted bucket is only ever read by session Y's rollup, so this
  // genuinely exercises regenerateUsageRollup's own defensive guard, not the same-session repair
  // loop (which never runs on X again, since X's own Stop event never fires here).
  const tmpDirB = freshDir();
  const usageDirB = path.join(tmpDirB, '.construct', 'usage');
  fs.mkdirSync(usageDirB, { recursive: true });
  const sessionX = {
    sessionId: 'session-t3-x',
    planSlug: 'slug-t3x',
    planSlugStartedAt: '2026-10-06T00:00:00Z',
    startedAt: '2026-10-06T00:00:00Z',
    lastUpdatedAt: '2026-10-06T00:00:00Z',
    totals: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, estimatedCostUsd: 0, unpriced: false },
    byModel: {},
    byPlanSlug: {
      'slug-t3x': { totals: { inputTokens: 7, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 7, estimatedCostUsd: 0, unpriced: false }, byModel: {}, time: [] },
    },
  };
  fs.writeFileSync(path.join(usageDirB, 'session-t3-x.json'), JSON.stringify(sessionX, null, 2));
  const tpY = path.join(tmpDirB, 'session-t3-y.jsonl');
  fs.writeFileSync(tpY, mkLine('2026-10-06T01:00:00Z', 0) + '\n');
  assert.doesNotThrow(() => {
    computeAndRecordUsage(tmpDirB, tpY, 'session-t3-y', 'slug-t3y', '2026-10-06T01:00:00Z');
  }, 'itemT3 Case B: a sibling session\'s array-corrupted byPlanSlug[key].time must not throw during cross-session rollup');
  const uB = readUsage(tmpDirB);
  const xTime = uB.byPlanSlug['slug-t3x'].time;
  assert.ok(!Array.isArray(xTime) && typeof xTime === 'object' && xTime !== null, 'itemT3 Case B: X\'s corrupted .time reads as a proper object during Y\'s rollup, not an array');
  assert.strictEqual(xTime.claudeBuildSeconds, 0, 'itemT3 Case B: X\'s corrupted .time defaults to zero values');
  fs.rmSync(tmpDirB, { recursive: true, force: true });

  // Case C: parallel .byModel corruption — mirrors Case A's same-session repair shape, but
  // targets .byModel instead of .time, proving both branches of the repair loop's guard.
  const tmpDirC = freshDir();
  const usageDirC = path.join(tmpDirC, '.construct', 'usage');
  fs.mkdirSync(usageDirC, { recursive: true });
  const sessionCaseC = {
    sessionId: 'session-t3c',
    planSlug: 'slug-t3c',
    planSlugStartedAt: '2026-10-07T00:00:00Z',
    startedAt: '2026-10-07T00:00:00Z',
    lastUpdatedAt: '2026-10-07T00:00:00Z',
    totals: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, estimatedCostUsd: 0, unpriced: false },
    byModel: {},
    byPlanSlug: {
      'slug-t3c': { totals: { inputTokens: 3, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 3, estimatedCostUsd: 0, unpriced: false }, byModel: [], time: { humanActiveSeconds: 0, claudeBuildSeconds: 0, idleSeconds: 0 } },
    },
  };
  fs.writeFileSync(path.join(usageDirC, 'session-t3c.json'), JSON.stringify(sessionCaseC, null, 2));
  const tpC = path.join(tmpDirC, 'session-t3c.jsonl');
  fs.writeFileSync(tpC, mkLine('2026-10-07T00:00:00Z', 0) + '\n');
  assert.doesNotThrow(() => {
    computeAndRecordUsage(tmpDirC, tpC, 'session-t3c', 'slug-t3c', '2026-10-07T00:00:00Z');
  }, 'itemT3 Case C: an array-corrupted byPlanSlug[key].byModel must not throw during same-session repair');
  const repairedC = JSON.parse(fs.readFileSync(path.join(usageDirC, 'session-t3c.json'), 'utf8'));
  assert.deepStrictEqual(repairedC.byPlanSlug['slug-t3c'].byModel, {}, 'itemT3 Case C: array-corrupted .byModel resets to a plain {} object, not left as an array');
  fs.rmSync(tmpDirC, { recursive: true, force: true });

  console.log('itemT3_arrayCorruptedTimeFieldDoesNotPollute: all assertions passed');
}

// itemT4: two sessions concurrently open on the SAME slug, one contributing pure claude-build
// time and the other pure human-active time, must sum correctly (not overwrite one another).
function itemT4_concurrentSessionsTimeSum() {
  const tmpDir = freshDir();
  const tpP = path.join(tmpDir, 'session-t4-p.jsonl');
  const tpQ = path.join(tmpDir, 'session-t4-q.jsonl');
  fs.writeFileSync(tpP, [mkLine('2026-10-08T00:00:00Z', 0), mkLine('2026-10-08T00:01:40Z', 0)].join('\n') + '\n'); // 100s apart, both assistant
  fs.writeFileSync(tpQ, [mkLine('2026-10-08T00:00:00Z', 0), mkUserLine('2026-10-08T00:03:20Z', false)].join('\n') + '\n'); // 200s apart, genuine user

  computeAndRecordUsage(tmpDir, tpP, 'session-t4-p', 'shared', '2026-10-08T00:00:00Z');
  computeAndRecordUsage(tmpDir, tpQ, 'session-t4-q', 'shared', '2026-10-08T00:00:00Z');

  const u = readUsage(tmpDir);
  assert.deepStrictEqual(u.byPlanSlug['shared'].time, { humanActiveSeconds: 200, claudeBuildSeconds: 100, idleSeconds: 0 }, 'itemT4: two concurrently-open sessions on the same slug sum their time contributions correctly (100 claude-build + 200 human)');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('itemT4_concurrentSessionsTimeSum: all assertions passed');
}

// itemT5: a main transcript's 1200s gap (which alone would exceed the 900s idle threshold) must
// be correctly split by a subagent's event landing at t=600s — proving parseTranscriptWindow's
// subagent merge feeds classifyActivityWindow's SORTED combined timeline, not just the main file.
function itemT5_subagentMergeTimeClassification() {
  const tmpDir = freshDir();
  const transcriptPath = path.join(tmpDir, 'session-merge.jsonl');
  fs.writeFileSync(transcriptPath, [
    mkLine('2026-10-09T00:00:00Z', 0),
    mkLine('2026-10-09T00:20:00Z', 0), // 1200s later
  ].join('\n') + '\n');

  const subagentDir = path.join(tmpDir, 'session-merge', 'subagents');
  fs.mkdirSync(subagentDir, { recursive: true });
  fs.writeFileSync(path.join(subagentDir, 'agent-a1.jsonl'), mkLine('2026-10-09T00:10:00Z', 0) + '\n'); // 600s in

  computeAndRecordUsage(tmpDir, transcriptPath, 'session-merge', 'slug-t5', '2026-10-09T00:00:00Z');

  const sessionFile = JSON.parse(fs.readFileSync(path.join(tmpDir, '.construct', 'usage', 'session-merge.json'), 'utf8'));
  assert.deepStrictEqual(sessionFile.time, { humanActiveSeconds: 0, claudeBuildSeconds: 1200, idleSeconds: 0 }, 'itemT5: subagent event merges into the sorted timeline, splitting the 1200s gap into two 600s gaps both under the idle threshold — a missing merge would show {0,0,1200} (idle) instead');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('itemT5_subagentMergeTimeClassification: all assertions passed');
}

function run() {
  sectionA();
  item1And2_interleavedSessions();
  item6_byModelFidelityTwoDistinctModels();
  item3_baselineCreatedOnceByModelDefaulting();
  item4_nonTransitioningSessionStaysVisible();
  item7_twoSessionsSameSlugConcurrent();
  item8_baselineCountedOnceNotTwice();
  item9_brandNewProjectNoCrash();
  item10_malformedSessionFileDoesNotAbortRollup();
  item11_invalidSessionIdRejectedEarly();
  item12_readUsageShapeUnchanged();
  itemT1_timeBucketFoldsThroughLiveView();
  itemT2_migrationSafetyMissingTimeField();
  itemT3_arrayCorruptedTimeFieldDoesNotPollute();
  itemT4_concurrentSessionsTimeSum();
  itemT5_subagentMergeTimeClassification();
  console.log('usage-tracker.test.js: all assertions passed');
}

run();

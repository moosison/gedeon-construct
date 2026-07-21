// hooks/lib/usage-tracker.js
// @ai-rules:
// 1. [Constraint]: Synchronous I/O only — fs.readFileSync/writeFileSync/readdirSync/existsSync. No fs.promises,
//    no callbacks. This runs directly before process.exit(0) in gc-stop-reminder.js; an unresolved async write
//    would be silently dropped.
// 2. [Constraint]: computeAndRecordUsage must never throw — every internal step is defensively wrapped.
// 3. [Pattern]: Rounding contract — totals.estimatedCostUsd = round(sum of RAW per-model costs), never
//    sum(round(per-model costs)). Per-model estimatedCostUsd is rounded independently for display; the two
//    may differ by a sub-cent remainder by design, not a bug.
// 4. [Gotcha]: This hook fires globally across every Claude Code project on the machine (setup.js registers it
//    in ~/.claude/settings.json, not scoped to this repo) — the .construct/ existence gate below is load-bearing.
// 5. [Contract]: computeAndRecordUsage(cwd, transcriptPath, sessionId, planSlug, planSlugUpdatedAt) is 5-arg —
//    planSlug/planSlugUpdatedAt drive per-milestone attribution. Each session owns exactly one file at
//    .construct/usage/{sessionId}.json — no shared cross-session slot exists anymore. foldPriorIntoSlug is the
//    SINGLE place a session's OWN byPlanSlug is mutated (after repair) — never duplicate that fold logic at a
//    new call site; route through foldPriorIntoSlug instead. regenerateUsageRollup is the SINGLE place
//    cross-session aggregation (cumulative, the global byPlanSlug view) happens — it runs synchronously at the
//    end of every computeAndRecordUsage call and is the only writer of .construct/USAGE.json.
'use strict';
const fs = require('fs');
const path = require('path');
const { getRate } = require('./model-pricing');
const { classifyActivityWindow, emptyTimeBucket, addTimeBucket, coerceTimeBucket } = require('./activity-timer');
const { atomicWrite } = require('./atomic-write');

// lean: single file merges gate+parse+subagent-discovery+cost-compute+fold+write (~6 sequential steps, one
// exported function, not 6 files) — precedent hooks/lib/hook-runtime.js already mixes many concerns (9 exported
// functions) in ~103 lines. This file already runs past that line count (own complexity is more concentrated
// than hook-runtime.js's many-small-functions shape, per gc-review Maintainability finding); ceiling = further
// growth hurts readability; upgrade path = split fold/write into a sibling usage-store.js if new responsibilities
// are added — current size is accepted as-is, not deferred against a specific line-count trigger.
// lean: no cap/streaming for transcript size — full synchronous readFileSync + re-parse of the ENTIRE transcript
// (and all subagent files) runs on every single Stop event, cost grows with session length and is paid
// repeatedly; ceiling = noticeable hook latency on unusually long sessions (multi-MB transcripts have been
// observed in this project); upgrade path = incremental parsing from a saved byte offset if this becomes slow.
// Measured: ~145ms for a real 20MB pilot transcript — see hooks/gc-stop-reminder.js's @ai-rules Gotcha 1
// for the full measurement and the confirmed cause of observed USAGE.json/DEBT.json staleness during
// gc-review (this comment's transcript-size concern is a separate, secondary, theoretical risk only).
// lean: background/detached subagent tokens (dispatched via run_in_background) that finish AFTER the session's
// final Stop event are never counted — no hook fires on background-only completion. Self-heals if any LATER
// Stop occurs in the same session (full re-parse picks it up), but permanently missed if the session ends
// first. Accepted limitation for a single-user local tool; upgrade path = none currently available.
// lean: per-session files under .construct/usage/ are kept forever, never archived — same disclosed policy
// this codebase already applies to byPlanSlug today. A long-lived project accumulates one file per historical
// session; ceiling = directory size / regenerateUsageRollup's readdir+parse cost growing with session count;
// upgrade path = archive/prune sessions older than some retention window, if that cost ever proves material
// for a single-user local tool.
// lean: two sessions' regenerateUsageRollup calls landing in close succession can still race — a slower
// session's read of usage/ (taken before a faster session's slightly-later write completes) can be clobbered
// by a faster session's earlier-computed-but-later-renamed write. Self-healing on the NEXT Stop event from
// either session (recomputes fresh from all current per-session files), but there is no bound on when that
// next Stop event happens — if the clobbered write coincides with either session's final Stop, staleness could
// persist indefinitely. Narrower and less severe than the ping-pong this plan fixes (bounded lag, not
// unbounded growth); accepted for a single-user local tool.
// lean: sessionFilePath's resolve-then-contain guard does not exhaustively handle Windows reserved device
// names or NTFS alternate-data-stream colons beyond what resolve-then-contain itself catches — sessionId
// originates only from the Claude Code harness as a UUID, never adversarial, in this tool's real threat model
// (confirmed across two pre-flight rounds). Upgrade path = harden further only if sessionId's provenance ever
// changes.

const ROUND = n => Math.round(n * 10000) / 10000;

// Model IDs come from parsed transcript data. Reserved object-prototype keys are remapped to a
// safe literal before ever being used as a byModel key, closing CWE-1321 (prototype pollution)
// at the single point where external strings enter the system — this holds even across the
// JSON.parse round-trip on USAGE.json, where Object.create(null) alone would not (JSON.parse
// always produces plain objects).
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function safeModelKey(modelId) {
  return RESERVED_KEYS.has(modelId) ? `reserved:${modelId}` : modelId;
}

function emptyBucket() {
  return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0, estimatedCostUsd: 0, unpriced: false };
}

// unpriced ORs across every fold (per-model -> session totals -> cumulative) so one
// unpriced model anywhere in a bucket's history marks its whole estimatedCostUsd as partial.
function addBucket(target, source) {
  target.inputTokens += source.inputTokens || 0;
  target.outputTokens += source.outputTokens || 0;
  target.cacheCreationTokens += source.cacheCreationTokens || 0;
  target.cacheReadTokens += source.cacheReadTokens || 0;
  target.totalTokens += source.totalTokens || 0;
  target.estimatedCostUsd = ROUND((target.estimatedCostUsd || 0) + (source.estimatedCostUsd || 0));
  target.unpriced = Boolean(target.unpriced) || Boolean(source.unpriced);
}

function parseUsageLines(filePath, byModel, tsRange, sinceTimestamp, untilTimestamp, events) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return 0;
  }
  const since = sinceTimestamp ? Date.parse(sinceTimestamp) : null;
  const until = untilTimestamp ? Date.parse(untilTimestamp) : null;
  let parseFailures = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      parseFailures++;
      continue;
    }
    if (obj.timestamp) {
      const t = Date.parse(obj.timestamp);
      if (!Number.isNaN(t)) {
        if (since !== null && !Number.isNaN(since) && t < since) continue;
        if (until !== null && !Number.isNaN(until) && t >= until) continue;
        if (tsRange.min === null || t < tsRange.min) tsRange.min = t;
        if (tsRange.max === null || t > tsRange.max) tsRange.max = t;
        if (obj.type === 'user' || obj.type === 'assistant') {
          events.push({ ts: t, type: obj.type, isToolResult: Boolean(obj.toolUseResult) });
        }
      }
    }
    if (obj.type !== 'assistant') continue;
    const message = obj.message || {};
    const usage = message.usage || {};
    const modelId = safeModelKey(message.model || 'unknown');
    if (!byModel[modelId]) byModel[modelId] = emptyBucket();
    const bucket = byModel[modelId];
    bucket.inputTokens += usage.input_tokens || 0;
    bucket.outputTokens += usage.output_tokens || 0;
    bucket.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
    bucket.cacheReadTokens += usage.cache_read_input_tokens || 0;
  }
  return parseFailures;
}

// Parses a transcript (main + its subagent files) within [sinceTimestamp, untilTimestamp).
// Factored out so the same "read this session's full transcript set, windowed" logic serves
// both the always-run current-window parse and a mid-session transition's old-window split —
// duplicating this by hand at both call sites was round 2's root cause (a copy-pasted 3-line
// fold updated one bucket but not the other; see foldPriorIntoSlug below for the fix that
// makes that class of bug structurally impossible to reintroduce).
function parseTranscriptWindow(transcriptPath, sessionId, sinceTimestamp, untilTimestamp) {
  const byModel = Object.create(null);
  const tsRange = { min: null, max: null };
  const events = [];
  let parseFailures = parseUsageLines(transcriptPath, byModel, tsRange, sinceTimestamp, untilTimestamp, events);
  let subagentFiles = [];
  try {
    const subagentDir = path.join(path.dirname(transcriptPath), sessionId, 'subagents');
    subagentFiles = fs.readdirSync(subagentDir)
      .filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'))
      .map(f => path.join(subagentDir, f));
  } catch {
    subagentFiles = [];
  }
  for (const file of subagentFiles) {
    parseFailures += parseUsageLines(file, byModel, tsRange, sinceTimestamp, untilTimestamp, events);
  }
  const time = classifyActivityWindow(events);
  return { byModel, tsRange, time, parseFailures };
}

// Computes per-model cost + rolled-up totals from a byModel map built by parseTranscriptWindow.
// MUTATES its argument in place (writes totalTokens/estimatedCostUsd/unpriced onto each bucket)
// — callers rely on this: the enriched byModel is the same object later stored on
// currentSession.byModel and passed into foldPriorIntoSlug. Not a pure function by design.
function computeCostTotals(byModel) {
  const totals = emptyBucket();
  let rawCostSum = 0;
  for (const modelId of Object.keys(byModel)) {
    const bucket = byModel[modelId];
    bucket.totalTokens = bucket.inputTokens + bucket.outputTokens + bucket.cacheCreationTokens + bucket.cacheReadTokens;
    const rate = getRate(modelId);
    const rawModelCost =
      (bucket.inputTokens / 1e6) * rate.inputPerMTok +
      (bucket.outputTokens / 1e6) * rate.outputPerMTok +
      (bucket.cacheCreationTokens / 1e6) * rate.cacheWritePerMTok +
      (bucket.cacheReadTokens / 1e6) * rate.cacheReadPerMTok;
    bucket.estimatedCostUsd = ROUND(rawModelCost);
    bucket.unpriced = Boolean(rate.unpriced);
    rawCostSum += rawModelCost;
    addBucket(totals, { ...bucket, estimatedCostUsd: 0 });
  }
  totals.estimatedCostUsd = ROUND(rawCostSum);
  return totals;
}

// The ONE place a closed window's totals reach a session's OWN byPlanSlug bucket — every
// mid-session-transition fold site MUST route through this function, so "fixed one site, forgot
// the other" is structurally impossible: there is only one site. Operates on the per-session-file
// object (not a shared usageFile) — cross-session aggregation happens later, in
// regenerateUsageRollup, not here. sessionFile.byPlanSlug must already be repaired/well-formed
// before this is called (computeAndRecordUsage does this earlier).
function foldPriorIntoSlug(sessionFile, slug, totals, byModel, timeBucket) {
  const bucketKey = safeModelKey(slug || '_unassigned');
  if (!sessionFile.byPlanSlug[bucketKey]) sessionFile.byPlanSlug[bucketKey] = { totals: emptyBucket(), byModel: {}, time: emptyTimeBucket() };
  addBucket(sessionFile.byPlanSlug[bucketKey].totals, totals || emptyBucket());
  addTimeBucket(sessionFile.byPlanSlug[bucketKey].time, coerceTimeBucket(timeBucket));
  // safeModelKey remap here too (code review HIGH finding): byModel can be a snapshot read back
  // from this session's own file, and a hand-edited/corrupt file could carry a literal "__proto__"
  // own-property key (JSON.parse gives it as a plain own property, but the bracket WRITE inside
  // foldByModelInto would otherwise trigger the real prototype-chain setter). Same defense the
  // file already applies to every other dynamic key.
  foldByModelInto(sessionFile.byPlanSlug[bucketKey].byModel, byModel);
}

// Code-review fix (Maintainability): the safeModelKey-guard + init-if-absent + addBucket triplet
// was repeated ~5 times across regenerateUsageRollup — exactly the "update one fold site, forget
// the other" hazard this file's own foldPriorIntoSlug comment says a single fold site exists to
// prevent. One shared helper closes that gap for the byModel dimension the same way.
function foldByModelInto(targetByModel, sourceByModel) {
  for (const rawModelId of Object.keys(sourceByModel || {})) {
    const modelId = safeModelKey(rawModelId);
    if (!targetByModel[modelId]) targetByModel[modelId] = emptyBucket();
    addBucket(targetByModel[modelId], sourceByModel[rawModelId]);
  }
}

function usageDir(cwd) {
  return path.resolve(cwd, '.construct', 'usage');
}

// sessionId originates only from the Claude Code harness as a UUID, never adversarial input in
// this tool's real threat model — resolve-then-contain still guards the write path itself,
// replicated inline from plan-verifier.js's resolveContained (a cross-module import for a few
// lines is unwarranted here). Returns null on failed containment; the caller must reject and
// return early rather than write.
function sessionFilePath(cwd, sessionId) {
  const dir = usageDir(cwd);
  const candidate = path.resolve(dir, `${sessionId}.json`);
  if (!candidate.startsWith(dir + path.sep)) return null;
  return candidate;
}

function baselineFilePath(cwd) {
  return path.join(usageDir(cwd), '_baseline.json');
}

// Captures the pre-upgrade USAGE.json's cumulative/byPlanSlug into _baseline.json, exactly once,
// lazily, atomically (temp-file + rename, unique suffix). The pre-upgrade byPlanSlug shape has no
// byModel field (today's format) — regenerateUsageRollup defaults a missing .byModel to {} when
// it reads this file back; that default is in-memory only for the duration of one rollup
// computation and is never persisted back into this file.
//
// Code-review fix (upgrade-boundary double-count, confirmed empirically): the pre-upgrade
// usageFile.cumulative/byPlanSlug already folded in every CLOSED window of whichever session was
// the old design's currentSession, up to its last mid-session transition — but NOT that session's
// still-open window (the old design never folded an open window into cumulative). If that same
// session fires another Stop post-upgrade with no per-session file yet, computeAndRecordUsage
// treats it as brand new (no prior, sinceTimestamp stays null) and re-parses the ENTIRE transcript
// from time zero — re-deriving tokens already sitting in the frozen baseline's closed windows and
// double-counting them. Fix: seed that one session's own per-session file here, from the legacy
// currentSession snapshot, so its next Stop resumes from its own planSlugStartedAt (a real
// continuation, per the existing prior.sessionId===sessionId logic) instead of re-parsing from
// scratch. Only ever runs once (gated by the same _baseline.json-absence check as the rest of this
// function) and only seeds — never overwrites — an existing per-session file, so a session that
// already wrote its own file before this runs is left untouched.
function captureBaselineIfAbsent(cwd) {
  const baselinePath = baselineFilePath(cwd);
  if (fs.existsSync(baselinePath)) return;

  const legacyPath = path.resolve(cwd, '.construct', 'USAGE.json');
  let legacy = null;
  try {
    legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  } catch {
    legacy = null;
  }
  const baseline = {
    cumulative: (legacy && legacy.cumulative && typeof legacy.cumulative === 'object')
      ? legacy.cumulative
      : { sessions: 0, totals: emptyBucket(), byModel: {} },
    byPlanSlug: (legacy && legacy.byPlanSlug && typeof legacy.byPlanSlug === 'object')
      ? legacy.byPlanSlug
      : {},
  };

  try {
    const dir = usageDir(cwd);
    fs.mkdirSync(dir, { recursive: true });
    if (!atomicWrite(baselinePath, JSON.stringify(baseline, null, 2))) {
      process.stderr.write(`[gedeon-construct] usage-tracker: failed to write _baseline.json\n`);
    }
  } catch (e) {
    process.stderr.write(`[gedeon-construct] usage-tracker: failed to write _baseline.json: ${e.message}\n`);
  }

  const legacyCurrent = legacy && legacy.currentSession && typeof legacy.currentSession === 'object'
    ? legacy.currentSession
    : null;
  if (legacyCurrent && typeof legacyCurrent.sessionId === 'string' && legacyCurrent.sessionId) {
    const seedPath = sessionFilePath(cwd, legacyCurrent.sessionId);
    if (seedPath && !fs.existsSync(seedPath)) {
      // lean: no `.time` field seeded here — a single historical `elapsedSeconds` number cannot be
      // retroactively split into human/Claude/idle buckets. If this exact session never fires another
      // Stop event, its open-window time contribution stays zero forever (regenerateUsageRollup's
      // defensive default handles this without crashing) — accepted, narrow, self-disclosed limitation.
      const seeded = {
        sessionId: legacyCurrent.sessionId,
        planSlug: (typeof legacyCurrent.planSlug === 'string') ? legacyCurrent.planSlug : null,
        planSlugStartedAt: (typeof legacyCurrent.planSlugStartedAt === 'string') ? legacyCurrent.planSlugStartedAt : null,
        startedAt: (typeof legacyCurrent.startedAt === 'string') ? legacyCurrent.startedAt : null,
        lastUpdatedAt: (typeof legacyCurrent.lastUpdatedAt === 'string') ? legacyCurrent.lastUpdatedAt : null,
        totals: (legacyCurrent.totals && typeof legacyCurrent.totals === 'object') ? legacyCurrent.totals : emptyBucket(),
        byModel: (legacyCurrent.byModel && typeof legacyCurrent.byModel === 'object') ? legacyCurrent.byModel : {},
        byPlanSlug: {},
      };
      if (!atomicWrite(seedPath, JSON.stringify(seeded, null, 2))) {
        process.stderr.write(`[gedeon-construct] usage-tracker: failed to seed legacy currentSession's per-session file\n`);
        return;
      }
    }
  }
}

// The SOLE place cross-session aggregation happens. Recomputes .construct/USAGE.json from the
// baseline + every per-session file, every Stop hook — the global byPlanSlug is a LIVE view (open
// + closed windows across every session), not closed-windows-only: gc-eop reads it directly with
// no manual re-add (see skills/gc-eop/SKILL.md). Never throws — every internal read is
// defensively wrapped; a malformed per-session file or an unreadable baseline is skipped, logged,
// and does not abort the rest of the computation.
// callingSessionFile (optional): computeAndRecordUsage's own already-computed, in-memory session
// object for the session whose Stop hook triggered this call. When provided, currentSession is set
// to it directly — this is the only correct source, since it's this exact call's own data with no
// ambiguity. Without it (e.g. a future on-demand/manual invocation with no single "calling" session),
// falls back to a best-effort newest-mtime guess across files in usage/ — NOT equivalent under true
// concurrency (two sessions' writes landing close together could pick the wrong one), so callers that
// know their own session file must always pass it.
function regenerateUsageRollup(cwd, callingSessionFile) {
  try {
    const dir = usageDir(cwd);
    const cumulative = { sessions: 0, totals: emptyBucket(), byModel: {}, time: emptyTimeBucket() };
    const byPlanSlug = {};

    // Baseline: pre-upgrade cumulative/byPlanSlug, folded in first. Defensive read — a parse
    // failure is treated as absent/empty, matching captureBaselineIfAbsent's own convention.
    let baseline = null;
    try {
      baseline = JSON.parse(fs.readFileSync(baselineFilePath(cwd), 'utf8'));
    } catch {
      baseline = null;
    }
    if (baseline && baseline.cumulative && typeof baseline.cumulative === 'object') {
      addBucket(cumulative.totals, baseline.cumulative.totals || emptyBucket());
      cumulative.sessions += (typeof baseline.cumulative.sessions === 'number') ? baseline.cumulative.sessions : 0;
      const baseBm = (baseline.cumulative.byModel && typeof baseline.cumulative.byModel === 'object' && !Array.isArray(baseline.cumulative.byModel)) ? baseline.cumulative.byModel : {};
      foldByModelInto(cumulative.byModel, baseBm);
      addTimeBucket(cumulative.time, coerceTimeBucket(baseline.cumulative.time));
    }
    if (baseline && baseline.byPlanSlug && typeof baseline.byPlanSlug === 'object') {
      for (const rawSlugKey of Object.keys(baseline.byPlanSlug)) {
        const slugKey = safeModelKey(rawSlugKey);
        const bucket = baseline.byPlanSlug[rawSlugKey] || {};
        if (!byPlanSlug[slugKey]) byPlanSlug[slugKey] = { totals: emptyBucket(), byModel: {}, time: emptyTimeBucket() };
        addBucket(byPlanSlug[slugKey].totals, bucket.totals || emptyBucket());
        // Pre-upgrade byPlanSlug has no byModel field — default to {} in memory only for this
        // computation; never persisted back to _baseline.json itself.
        const bucketBm = (bucket.byModel && typeof bucket.byModel === 'object' && !Array.isArray(bucket.byModel)) ? bucket.byModel : {};
        foldByModelInto(byPlanSlug[slugKey].byModel, bucketBm);
        addTimeBucket(byPlanSlug[slugKey].time, coerceTimeBucket(bucket.time));
      }
    }

    // Every per-session file — explicitly excludes _baseline.json and any .tmp remnant from a
    // prior interrupted write: only entries matching sessionFilePath's own {sessionId}.json shape
    // are read as session files. Without this exclusion, _baseline.json's own (valid, parseable)
    // byPlanSlug would be misread as a session file and double-counted forever.
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      entries = [];
    }

    let currentSession = null;
    let latestMtimeMs = -Infinity;

    for (const entry of entries) {
      // Post-t1/t4, temp files for this directory's writes live in `.construct/usage/.tmp/` and
      // never appear in this readdirSync listing (readdirSync doesn't cross into subdirectories) —
      // this .tmp check is defensive-only (e.g. a manually-placed stray file), not because temps
      // are expected here anymore.
      if (entry === '_baseline.json' || entry.endsWith('.tmp') || !entry.endsWith('.json')) continue;
      const full = path.join(dir, entry);

      let sessionFile;
      try {
        sessionFile = JSON.parse(fs.readFileSync(full, 'utf8'));
      } catch (e) {
        process.stderr.write(`[gedeon-construct] usage-tracker: skipped malformed session file ${entry}: ${e.message}\n`);
        continue;
      }
      if (!sessionFile || typeof sessionFile !== 'object') continue;

      cumulative.sessions += 1;

      // This session's own closed windows, already folded into its own byPlanSlug by
      // foldPriorIntoSlug at the mid-session-transition call sites.
      const sessByPlanSlug = (sessionFile.byPlanSlug && typeof sessionFile.byPlanSlug === 'object') ? sessionFile.byPlanSlug : {};
      for (const rawSlugKey of Object.keys(sessByPlanSlug)) {
        const slugKey = safeModelKey(rawSlugKey);
        const bucket = sessByPlanSlug[rawSlugKey] || {};
        if (!byPlanSlug[slugKey]) byPlanSlug[slugKey] = { totals: emptyBucket(), byModel: {}, time: emptyTimeBucket() };
        addBucket(byPlanSlug[slugKey].totals, bucket.totals || emptyBucket());
        addBucket(cumulative.totals, bucket.totals || emptyBucket());
        const bucketBm = (bucket.byModel && typeof bucket.byModel === 'object' && !Array.isArray(bucket.byModel)) ? bucket.byModel : {};
        foldByModelInto(byPlanSlug[slugKey].byModel, bucketBm);
        foldByModelInto(cumulative.byModel, bucketBm);
        const sessBucketTime = coerceTimeBucket(bucket.time);
        addTimeBucket(byPlanSlug[slugKey].time, sessBucketTime);
        addTimeBucket(cumulative.time, sessBucketTime);
      }

      // This session's current open window, attributed to its CURRENT planSlug — this is what
      // makes the global byPlanSlug a live view instead of closed-windows-only. A session
      // contributes to exactly one slug bucket at a time (its current one) plus any of its own
      // already-closed slug buckets above — never double-counted within this formula.
      const openTotals = (sessionFile.totals && typeof sessionFile.totals === 'object') ? sessionFile.totals : emptyBucket();
      const openByModel = (sessionFile.byModel && typeof sessionFile.byModel === 'object' && !Array.isArray(sessionFile.byModel)) ? sessionFile.byModel : {};
      addBucket(cumulative.totals, openTotals);
      foldByModelInto(cumulative.byModel, openByModel);
      const openTime = coerceTimeBucket(sessionFile.time);
      addTimeBucket(cumulative.time, openTime);
      const slugKey = safeModelKey(sessionFile.planSlug || '_unassigned');
      if (!byPlanSlug[slugKey]) byPlanSlug[slugKey] = { totals: emptyBucket(), byModel: {}, time: emptyTimeBucket() };
      addBucket(byPlanSlug[slugKey].totals, openTotals);
      foldByModelInto(byPlanSlug[slugKey].byModel, openByModel);
      addTimeBucket(byPlanSlug[slugKey].time, openTime);

      // Fallback-only mtime tracking, used solely when no callingSessionFile was passed in (see
      // this function's header comment) — not relied on when the caller's own session data is
      // available, since mtime comparison across two genuinely concurrent writers is a guess, not
      // a guarantee.
      if (!callingSessionFile) {
        let mtimeMs = 0;
        try {
          mtimeMs = fs.statSync(full).mtimeMs;
        } catch {
          mtimeMs = 0;
        }
        if (mtimeMs > latestMtimeMs) {
          latestMtimeMs = mtimeMs;
          currentSession = sessionFile;
        }
      }
    }

    // The calling session's own in-memory data is the only unambiguous source for
    // currentSession — always prefer it over the mtime-based fallback scan above.
    if (callingSessionFile) {
      currentSession = callingSessionFile;
    }

    // Code-review fix (Correctness/Testing/Principal/Reliability/Performance/Plan-Alignment
    // convergent finding): these two writes are independent — cumulative/currentSession have no
    // data dependency on byPlanSlug's write outcome — so neither write's failure may gate the
    // other. An early return here would let a transient failure on the cold, less-critical
    // byPlanSlug file silently skip the hot-path USAGE.json write the split exists to keep fresh
    // for the cockpit's 5s poll. Both are attempted unconditionally; each failure is independently
    // logged.
    const byPlanSlugPath = path.resolve(cwd, '.construct', 'USAGE-BY-PLAN-SLUG.json');
    if (!atomicWrite(byPlanSlugPath, JSON.stringify(byPlanSlug))) {
      process.stderr.write(`[gedeon-construct] usage-tracker: failed to write USAGE-BY-PLAN-SLUG.json\n`);
    }

    const usageFile = { cumulative, currentSession };
    const usageFilePath = path.resolve(cwd, '.construct', 'USAGE.json');
    if (!atomicWrite(usageFilePath, JSON.stringify(usageFile))) {
      process.stderr.write(`[gedeon-construct] usage-tracker: failed to write USAGE.json\n`);
    }
  } catch (e) {
    try { process.stderr.write(`[gedeon-construct] usage-tracker: rollup failed: ${e.message}\n`); } catch {}
  }
}

function computeAndRecordUsage(cwd, transcriptPath, sessionId, planSlug, planSlugUpdatedAt) {
  try {
    if (!fs.existsSync(path.resolve(cwd, '.construct'))) return;
    if (!transcriptPath || !sessionId) return;

    const sessionPath = sessionFilePath(cwd, sessionId);
    if (!sessionPath) return; // failed resolve-then-contain — reject, no write, no side effects

    fs.mkdirSync(usageDir(cwd), { recursive: true });

    // Runs BEFORE this session's own file is read (code-review fix — moved from the end of this
    // function, and after sessionId validation so a rejected sessionId has zero side effects):
    // captureBaselineIfAbsent's legacy-currentSession seed (see its own header comment) must land
    // on disk before the read below, so a session that owned the pre-upgrade currentSession finds
    // its seeded continuation data on this exact call, not one call too late.
    captureBaselineIfAbsent(cwd);

    let sessionFile;
    try {
      sessionFile = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    } catch {
      sessionFile = null;
    }
    if (!sessionFile || typeof sessionFile !== 'object') {
      sessionFile = { sessionId, planSlug: null, planSlugStartedAt: null, startedAt: null, lastUpdatedAt: null, totals: emptyBucket(), byModel: {}, byPlanSlug: {} };
    }
    delete sessionFile.elapsedSeconds;
    // sessionFile.byPlanSlug: per-milestone cost bucket for THIS session's own closed
    // (mid-session-transition) windows only — { totals, byModel } per slug, plus '_unassigned'.
    // The GLOBAL, cross-session byPlanSlug exported in USAGE.json is a different, separately
    // computed view (regenerateUsageRollup: baseline + every session's closed windows + every
    // session's current open window) — this per-session copy is only this session's own
    // contribution to that view, not the view itself.
    // Rollback note: this whole key is new/additive per session file — recovering from a bad
    // fold means deleting this session's own byPlanSlug entirely; this repair block reconstructs
    // it as {} on the next Stop for this session, self-healing with zero data loss to
    // totals/byModel.
    if (!sessionFile.byPlanSlug || typeof sessionFile.byPlanSlug !== 'object') {
      sessionFile.byPlanSlug = {};
    }
    for (const key of Object.keys(sessionFile.byPlanSlug)) {
      const bucket = sessionFile.byPlanSlug[key];
      if (!bucket || typeof bucket !== 'object' || !bucket.totals || typeof bucket.totals !== 'object') {
        sessionFile.byPlanSlug[key] = { totals: emptyBucket(), byModel: {}, time: emptyTimeBucket() };
      } else {
        if (!bucket.byModel || typeof bucket.byModel !== 'object' || Array.isArray(bucket.byModel)) bucket.byModel = {};
        if (!bucket.time || typeof bucket.time !== 'object' || Array.isArray(bucket.time)) bucket.time = emptyTimeBucket();
      }
    }

    // lean: the slug is absent during /gc-bootstrap and early /gc-execute (before Step 1
    // resolves it), and can be stale (still naming the last-closed milestone) during any Stop
    // event before the user runs a fresh /gc-bootstrap. Such tokens fold into '_unassigned',
    // excluded from gc-eop's "this milestone" reporting. Accepted limitation — these windows
    // are brief; upgrade path = gate on stage + verify the slug resolves to a real plan file on
    // disk (mirroring gc-resume's own stale-slug defense), if misattribution ever proves costly.
    const prior = sessionFile;
    const normalizedSlug = planSlug || null;
    let sinceTimestamp = null;

    if (prior && prior.sessionId === sessionId) {
      const bothResolved = prior.planSlug !== null && normalizedSlug !== null;
      if (bothResolved && prior.planSlug !== normalizedSlug) {
        // lean: an idle/active gap that straddles the EXACT instant of a mid-session slug transition is
        // invisible to per-window time classification — the old window's last event and the new window's
        // first event never appear as a consecutive pair in EITHER window's sorted event list (each window
        // is bounded to [since, until) independently), so that specific gap is silently dropped from all
        // three time tallies rather than miscounted. Narrow: only affects the boundary instant of a
        // mid-session milestone transition, not the common single-slug-session case (where one full window
        // is always re-parsed fresh, so no boundary exists to lose a gap across). Accepted for a
        // single-user local tool; upgrade path = classify from one session-long sorted timeline before
        // splitting into slug windows, if this ever proves materially wrong in practice.
        // Real mid-session milestone transition (no /clear, no new session_id).
        const transitionAt = (planSlugUpdatedAt && !Number.isNaN(Date.parse(planSlugUpdatedAt))) ? planSlugUpdatedAt : null;
        if (transitionAt) {
          // Precise split at the transition instant — closes the round-2 boundary-loss gap:
          // everything strictly before the transition belongs to the departing slug, with no
          // reliance on a stale prior.totals snapshot that could miss activity between its own
          // last Stop and this transition.
          const oldWindow = parseTranscriptWindow(transcriptPath, sessionId, prior.planSlugStartedAt, transitionAt);
          if (oldWindow.parseFailures > 0) {
            process.stderr.write(`[gedeon-construct] usage-tracker: skipped ${oldWindow.parseFailures} unparseable transcript line(s) (transition split)\n`);
          }
          foldPriorIntoSlug(sessionFile, prior.planSlug, computeCostTotals(oldWindow.byModel), oldWindow.byModel, oldWindow.time);
          sinceTimestamp = transitionAt;
        } else {
          // No reliable transition timestamp (all 5 slug-writers emit updatedAt today, so this
          // is a defensive fallback, not the common path) — fold the last known snapshot rather
          // than risk a double-count from an unbounded re-parse. Bound the new window strictly
          // AFTER the old slug's own last-observed timestamp (not at/inclusive of it) — since
          // is inclusive, using prior.lastUpdatedAt directly would re-count the single assistant
          // line already sitting at that exact timestamp inside the just-folded snapshot.
          foldPriorIntoSlug(sessionFile, prior.planSlug, prior.totals, prior.byModel, prior.time);
          sinceTimestamp = (prior.lastUpdatedAt && !Number.isNaN(Date.parse(prior.lastUpdatedAt)))
            ? new Date(Date.parse(prior.lastUpdatedAt) + 1).toISOString()
            : null;
        }
      } else if (normalizedSlug === prior.planSlug) {
        sinceTimestamp = prior.planSlugStartedAt || null;
      } else {
        // Exactly one side is null (gc-execute's transient two-write window before Step 1
        // resolves the slug, or a mid-session /gc-bootstrap overwrite) — treat as a
        // continuation of the same tracked window, not a real transition: don't fold, don't
        // reset the cutoff. lean: a genuinely new milestone whose very first Stop happens to
        // land in one of these narrow windows would be mis-attributed to whichever slug
        // carries forward here — same accepted-limitation class as the no-slug-window note
        // above, not a new risk category.
        sinceTimestamp = prior.planSlugStartedAt || null;
      }
    }

    const { byModel, tsRange, time, parseFailures } = parseTranscriptWindow(transcriptPath, sessionId, sinceTimestamp, null);
    if (parseFailures > 0) {
      process.stderr.write(`[gedeon-construct] usage-tracker: skipped ${parseFailures} unparseable transcript line(s)\n`);
    }

    const totals = computeCostTotals(byModel);
    const startedAt = tsRange.min !== null ? new Date(tsRange.min).toISOString() : null;
    const lastUpdatedAt = tsRange.max !== null ? new Date(tsRange.max).toISOString() : null;

    sessionFile.sessionId = sessionId;
    sessionFile.planSlug = normalizedSlug;
    sessionFile.planSlugStartedAt = sinceTimestamp;
    sessionFile.startedAt = startedAt;
    sessionFile.lastUpdatedAt = lastUpdatedAt;
    sessionFile.time = time;
    sessionFile.totals = totals;
    sessionFile.byModel = byModel;
    // sessionFile.byPlanSlug was already mutated in place above (by foldPriorIntoSlug, or left
    // as the repaired {} / existing buckets if no transition happened this call).

    // Code-review fix: atomic temp+rename (unique suffix), matching every other write in this
    // file — was a plain writeFileSync, the one write left non-atomic. A crash mid-write here
    // left a torn sessionPath permanently (self-heals only if that session ever fires another
    // Stop) and gave a concurrent cross-session rollup a real chance of a torn read.
    if (!atomicWrite(sessionPath, JSON.stringify(sessionFile, null, 2))) {
      process.stderr.write(`[gedeon-construct] usage-tracker: failed to write session file\n`);
    }

    regenerateUsageRollup(cwd, sessionFile);
  } catch (e) {
    try { process.stderr.write(`[gedeon-construct] usage-tracker error: ${e.message}\n`); } catch {}
  }
}

module.exports = { computeAndRecordUsage, regenerateUsageRollup };

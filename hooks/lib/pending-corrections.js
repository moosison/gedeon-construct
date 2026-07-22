// hooks/lib/pending-corrections.js
// @ai-rules:
// 1. [Constraint]: readPending/writePending never throw — best-effort, catch-and-return-[]/false on
//    failure, matching hooks/lib/ledger.js's/usage-tracker.js's defensive convention.
// 2. [Pattern]: writePending is a whole-array replace, not a merge — callers must read the current
//    array (readPending), mutate it in memory, then write the full result back. There is no
//    incremental/append API here (unlike hooks/lib/ledger.js's append-only facts.ndjson).
// 3. [Gotcha]: readPending returns [] for BOTH an absent file and a genuinely corrupted one (invalid
//    JSON, or valid JSON that isn't an array) — the two are indistinguishable to a caller, matching
//    hooks/lib/ledger.js's readFacts precedent of skipping bad data silently rather than surfacing it.
// 4. [Constraint]: No locking on concurrent read-modify-write — same accepted limitation as every
//    other .construct/ JSON store (see hooks/lib/ledger.js's own pipelines/{slug}.json precedent),
//    but the consequence here is a silently dropped count increment, not just a stale display field.
// 5. [Pattern]: Store lives in the same .construct/ledger/ directory as facts.ndjson, but is a
//    structurally different model — whole-array replace here vs. append-only there. Do not conflate
//    the two when reading either file's write path.
'use strict';
const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./atomic-write');

function pendingCorrectionsPath(cwd) {
  return path.resolve(cwd, '.construct', 'ledger', 'pending-corrections.json');
}

// Never throws — best-effort read. Returns [] if the file is absent, unreadable, or not a JSON array.
function readPending(cwd) {
  let raw;
  try {
    raw = fs.readFileSync(pendingCorrectionsPath(cwd), 'utf8');
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Never throws — best-effort write. Writes the array atomically (whole-array replace, no merge —
// callers read, mutate in memory, then write the full result). Returns boolean.
function writePending(cwd, entries) {
  try {
    const dir = path.dirname(pendingCorrectionsPath(cwd));
    fs.mkdirSync(dir, { recursive: true });
    return atomicWrite(pendingCorrectionsPath(cwd), JSON.stringify(entries, null, 2));
  } catch {
    return false;
  }
}

module.exports = { pendingCorrectionsPath, readPending, writePending };

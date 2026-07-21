// hooks/lib/ledger.js
// @ai-rules:
// 1. [Constraint]: appendFact/readFacts/regenerateDigest never throw — best-effort, catch-and-return-
//    null/[] on failure, matching hooks/lib/usage-tracker.js's defensive convention.
// 2. [Constraint]: hashFile (imported from ./plan-verifier) MUST always be called with cwd as its second
//    argument — hashFile(path) alone leaves resolveContained's root falsy, which permanently returns null.
//    New facts carry workspace-relative evidenceFile paths (e.g. `.construct/plans/...`) that resolve via
//    cwd, the first root tried. PLAN_STORE_ROOT (re-exported here) is the legacy global plan store — pass
//    it as a THIRD argument — hashFile(path, cwd, PLAN_STORE_ROOT) — as a read-fallback for facts recorded
//    before the plan-store relocation and for gate-verdict/gate-override facts whose evidenceFile still
//    resolves against a legacy plan-run. Use isFactFresh (below) rather than calling hashFile directly
//    wherever possible; it already threads both roots correctly.
// 3. [Pattern]: Every path-like field (evidence.file, scope entries) is normalized to forward-slash at
//    write time via .replace(/\\/g, '/') so Windows backslash paths and forward-slash paths compare equal.
//    normalizeSlashes is exported so callers (ledger-cli.js) share one implementation instead of
//    redefining it, keeping write-side and read-side normalization guaranteed identical.
// 4. [Gotcha]: qualifiesForGate uses optional chaining on fact.evidence?.hash/fact.evidence?.file — a
//    fact can legitimately have no evidence object at all (e.g. a file-less verified-fact); this must
//    not throw, and must not let a hash-but-no-file malformed fact through either.
// 5. [Gotcha]: regenerateDigest is a no-op (returns null immediately) when {cwd}/.construct/ doesn't
//    exist — mirrors usage-tracker.js's load-bearing existence gate so this hook-invoked function never
//    creates a stray .construct/ledger/ in a non-Gedeon project. grouped uses Object.create(null) so a
//    persisted fact with type "__proto__"/"constructor"/"prototype" can't collide with Object.prototype.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashFile, PLAN_STORE_ROOT } = require('./plan-verifier');
const { atomicWrite } = require('./atomic-write');

function normalizeSlashes(p) {
  return typeof p === 'string' ? p.replace(/\\/g, '/') : p;
}

// The single source of truth for "is this fact both gate-qualifying and still fresh" — combines
// qualifiesForGate with a hash re-check against the file's CURRENT content, trying the workspace root
// first and falling back to the plan store (see rule 2 above). Never throws: guards evidence.file's
// type explicitly rather than relying on qualifiesForGate alone, since a malformed fact could carry a
// string evidence.hash without a string evidence.file.
// Cross-reference: hashFile's two-root order (workspace, then PLAN_STORE_ROOT) simultaneously backs the
// new-fact workspace-relative resolution above AND the old-fact stale-out guarantee here — a future
// change to that root order would break both at once.
function isFactFresh(fact, cwd) {
  // qualifiesForGate already guarantees evidence.file/evidence.hash are both strings before this
  // function is ever reached — see its own [Gotcha] note. Order matters: never dereference
  // fact.evidence.file before this check passes.
  if (!qualifiesForGate(fact)) return false;
  return hashFile(fact.evidence.file, cwd, PLAN_STORE_ROOT) === fact.evidence.hash;
}

function ledgerDir(cwd) {
  return path.resolve(cwd, '.construct', 'ledger');
}

function ledgerFilePath(cwd) {
  return path.join(ledgerDir(cwd), 'facts.ndjson');
}

// Never throws — best-effort append. Returns the finalized fact record (with generated id/verifiedAt
// and normalized paths) on success, or null on any failure.
function appendFact(cwd, fact) {
  try {
    const dir = ledgerDir(cwd);
    fs.mkdirSync(dir, { recursive: true });

    const record = { ...fact };
    if (!record.id) {
      record.id = `${new Date().toISOString()}-${crypto.randomBytes(2).toString('hex')}`;
    }
    if (!record.verifiedAt) {
      record.verifiedAt = new Date().toISOString();
    }
    if (record.evidence && typeof record.evidence === 'object') {
      record.evidence = { ...record.evidence };
      if (record.evidence.file) {
        record.evidence.file = normalizeSlashes(record.evidence.file);
      }
    }
    if (Array.isArray(record.scope)) {
      record.scope = record.scope.map(normalizeSlashes);
    }

    fs.appendFileSync(ledgerFilePath(cwd), JSON.stringify(record) + '\n');
    return record;
  } catch {
    return null;
  }
}

// Never throws — best-effort read. Returns [] if the ledger file is absent or unreadable. Unparseable
// lines (e.g. a partial line from a crash mid-write) are skipped silently rather than aborting the read.
function readFacts(cwd, filterFn) {
  let raw;
  try {
    raw = fs.readFileSync(ledgerFilePath(cwd), 'utf8');
  } catch {
    return [];
  }
  const facts = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      facts.push(JSON.parse(line));
    } catch {
      // skip unparseable line, never abort the read
    }
  }
  return typeof filterFn === 'function' ? facts.filter(filterFn) : facts;
}

// Pure function — the mechanical gate/advise derivation rule. A fact gates iff claim is a non-empty
// string, verdict is strictly boolean, evidence.hash is a non-null string (evidence may be entirely
// absent), and scope is a non-empty array. Anything else is advisory-only (never dropped, just excluded
// from gating).
function qualifiesForGate(fact) {
  if (!fact || typeof fact !== 'object') return false;
  if (typeof fact.claim !== 'string' || fact.claim.length === 0) return false;
  if (typeof fact.verdict !== 'boolean') return false;
  if (typeof fact.evidence?.hash !== 'string') return false;
  if (typeof fact.evidence?.file !== 'string') return false;
  if (!Array.isArray(fact.scope) || fact.scope.length === 0) return false;
  return true;
}

// Escapes a value for safe interpolation into a markdown table cell: collapses all newline forms
// (\r\n, \r, \n) to a single space, escapes "|" and "`" so the table structure and inline code spans
// can't be broken by facts carrying arbitrary claim/evidence.file text.
function sanitizeCell(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  return value
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`');
}

// Never throws — best-effort digest regeneration. Groups the most-recent 20 facts (overall, by
// verifiedAt descending) by type, renders a sanitized markdown table per type, and writes the result
// atomically via temp-file-then-rename (same-filesystem/volume rename is atomic; cross-filesystem is
// not — same-directory is not the actual requirement).
function regenerateDigest(cwd) {
  try {
    // Load-bearing existence gate, matching usage-tracker.js's convention: this function is invoked by
    // a globally-registered Stop hook that fires in every project, not just Gedeon-managed ones. Without
    // this check, every Stop event in every project would create a stray .construct/ledger/DIGEST.md.
    if (!fs.existsSync(path.resolve(cwd, '.construct'))) return null;

    const facts = readFacts(cwd);
    const sorted = [...facts].sort((a, b) => {
      const ta = Date.parse(a && a.verifiedAt) || 0;
      const tb = Date.parse(b && b.verifiedAt) || 0;
      return tb - ta;
    });
    const last20 = sorted.slice(0, 20);

    // Object.create(null) — a persisted fact.type of "__proto__"/"constructor"/"prototype" must not
    // collide with Object.prototype and silently break grouping for every fact after it.
    const grouped = Object.create(null);
    for (const f of last20) {
      const type = typeof f.type === 'string' && f.type ? f.type : 'unknown';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(f);
    }

    let content = '# Ledger Digest\n\n';
    content += `_Regenerated ${new Date().toISOString()} — last ${last20.length} fact(s) shown (max 20)._\n\n`;

    const types = Object.keys(grouped).sort();
    if (types.length === 0) {
      content += 'No facts recorded yet.\n';
    } else {
      for (const type of types) {
        content += `## ${sanitizeCell(type) || type}\n\n`;
        content += '| Claim | Verdict | Evidence File | Verified At |\n';
        content += '|---|---|---|---|\n';
        for (const f of grouped[type]) {
          const claim = sanitizeCell(f.claim);
          const verdict = typeof f.verdict === 'boolean' ? String(f.verdict) : 'n/a';
          const evidenceFile = sanitizeCell(f.evidence && f.evidence.file);
          const verifiedAt = sanitizeCell(f.verifiedAt);
          content += `| ${claim} | ${verdict} | ${evidenceFile} | ${verifiedAt} |\n`;
        }
        content += '\n';
      }
    }

    const dir = ledgerDir(cwd);
    fs.mkdirSync(dir, { recursive: true });
    const targetPath = path.join(dir, 'DIGEST.md');
    if (!atomicWrite(targetPath, content)) return null;
    return content;
  } catch {
    return null;
  }
}

module.exports = { appendFact, readFacts, qualifiesForGate, isFactFresh, regenerateDigest, hashFile, PLAN_STORE_ROOT, normalizeSlashes };

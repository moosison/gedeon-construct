// hooks/lib/ledger-cli.js
// @ai-rules:
// 1. [Constraint]: Thin CLI wrapper only — no ledger domain logic lives here. `isFactFresh` (gate
//    qualification + hash freshness, two-root aware) lives in hooks/lib/ledger.js, imported not
//    reimplemented. Mirrors plan-verifier-cli.js's CLI-over-lib shape.
// 2. [Constraint]: `record`'s stdin payload carries a flat `evidenceFile` field (raw path or absent) —
//    never a nested `evidence` object, never a pre-computed hash. This file is the ONLY place that
//    converts `evidenceFile` -> `evidence.{file,hash}` via hashFile(evidenceFile, cwd, PLAN_STORE_ROOT).
//    Any caller-supplied `fact.evidence`/`fact.evidence.hash` is always discarded and rebuilt from
//    `evidenceFile` — a caller cannot inject a pre-fabricated hash that bypasses this computation.
// 3. [Gotcha]: hashFile is called with THREE args here — (path, cwd, PLAN_STORE_ROOT) — not two.
//    gate-verdict/gate-override facts' evidenceFile is a Pre-Flight-Review report living in the plan
//    store (~/.claude/gedeon/plans/), not the workspace; a 2-arg call permanently returns null for
//    those facts (a real bug caught in code review — pre-flight only reviewed plan TEXT describing this
//    call, never the actual cross-root path it resolves at runtime). The workspace root is still tried
//    first, as the in-project primary, for workspace-relative evidence (verification-pass, verified-fact);
//    PLAN_STORE_ROOT is the legacy global store, a read-fallback only, not a replacement.
// 4. [Gotcha]: `pull` takes its scope list via stdin as a JSON array of strings, never a `--scope` CLI
//    argument — a shell-interpolated argument executes before this process starts, so no in-process
//    validation could stop shell-metacharacter injection. Stdin removes the shell from the trust boundary.
// 5. [Gotcha]: `pull`'s charset check runs AFTER forward-slash normalization, not before — checking a raw
//    Windows path against a no-backslash charset rejects legitimate relative paths outright.
// 6. [Constraint]: `record` rejects any `verdict` that isn't a genuine JSON boolean (`true`/`false`) —
//    a producer that emits a quoted `"true"`/`"false"` string (a template-following mistake, not a
//    shell/JSON error) would otherwise silently fail `qualifiesForGate` downstream with no error signal
//    at write time. Rejecting loudly here, at the one place every fact is written, closes that gap once.
'use strict';
const fs = require('fs');
const { appendFact, readFacts, isFactFresh, regenerateDigest, hashFile, PLAN_STORE_ROOT, normalizeSlashes } = require('./ledger');

const SCOPE_CHARSET = /^[A-Za-z0-9._/-]+$/;

// Reads stdin synchronously. Returns '' (not a throw) if stdin isn't piped/readable — an uncaught read
// error here would crash this CLI process outright. Mirrors plan-verifier-cli.js's readStdin.
function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    console.error(`ledger-cli: could not read stdin (${e.message}) — expected piped JSON`);
    return '';
  }
}

function cmdRecord() {
  const cwd = process.cwd();
  const input = readStdin();
  let fact;
  try {
    fact = JSON.parse(input);
  } catch (e) {
    console.error(`record: stdin was not valid JSON (${e.message})`);
    process.exitCode = 1;
    return;
  }
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    console.error('record: stdin JSON must be a single fact object');
    process.exitCode = 1;
    return;
  }
  if ('verdict' in fact && typeof fact.verdict !== 'boolean') {
    console.error(`record: "verdict" must be a JSON boolean (true/false), not ${JSON.stringify(fact.verdict)} — check for a quoted "true"/"false" string`);
    process.exitCode = 1;
    return;
  }

  const evidenceFile = fact.evidenceFile;
  delete fact.evidenceFile;
  // Discard any caller-supplied evidence object outright — this is the only place a fact's evidence is
  // ever constructed, always freshly, from evidenceFile. A caller cannot pass a pre-fabricated hash.
  delete fact.evidence;
  if (typeof evidenceFile === 'string' && evidenceFile.length > 0) {
    const hash = hashFile(evidenceFile, cwd, PLAN_STORE_ROOT);
    fact.evidence = { file: normalizeSlashes(evidenceFile), hash };
  }

  const record = appendFact(cwd, fact);
  if (!record) {
    console.error('record: appendFact failed (see .construct/ledger/ permissions/path)');
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(record));
}

function cmdPull() {
  const cwd = process.cwd();
  const input = readStdin();
  let scopeList;
  try {
    scopeList = JSON.parse(input);
  } catch (e) {
    console.error(`pull: stdin was not valid JSON (${e.message})`);
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(scopeList) || !scopeList.every(s => typeof s === 'string')) {
    console.error('pull: stdin JSON must be an array of strings');
    process.exitCode = 1;
    return;
  }

  const normalized = scopeList.map(normalizeSlashes);
  for (const entry of normalized) {
    if (!SCOPE_CHARSET.test(entry)) {
      console.error(`pull: scope entry rejected by charset check: ${JSON.stringify(entry)}`);
      process.exitCode = 1;
      return;
    }
  }

  // isFactFresh (ledger.js) is the leftmost/first predicate — it guarantees evidence.file/evidence.hash
  // are both strings before this clause ever dereferences f.scope. Do not reorder.
  const facts = readFacts(cwd, f =>
    isFactFresh(f, cwd) &&
    Array.isArray(f.scope) && f.scope.some(s => normalized.includes(normalizeSlashes(s)))
  );
  console.log(JSON.stringify(facts));
}

function cmdDigest() {
  const cwd = process.cwd();
  regenerateDigest(cwd);
  console.log('OK');
}

function main() {
  const [, , subcommand] = process.argv;
  switch (subcommand) {
    case 'record':
      cmdRecord();
      break;
    case 'pull':
      cmdPull();
      break;
    case 'digest':
      cmdDigest();
      break;
    default:
      console.error('usage: ledger-cli.js <record|pull|digest>');
      process.exitCode = 1;
  }
}

main();

// hooks/lib/pending-corrections-cli.js
// @ai-rules:
// 1. [Pattern]: Thin CLI wrapper over hooks/lib/pending-corrections.js, mirroring
//    hooks/lib/ledger-cli.js's shape exactly — no ledger/store domain logic lives here beyond
//    per-entry schema validation (sanitizeEntry).
// 2. [Constraint]: `write`'s stdin payload MUST be piped via a quoted-delimiter heredoc (<<'EOF',
//    never <<EOF or echo) by every caller — entries carry LLM-drafted `description` text that could
//    contain $(...)/backtick sequences; an unquoted heredoc still lets the shell expand those before
//    they reach stdin. This file itself never shells out, but callers in skills/gc-correct/SKILL.md
//    depend on this invariant — do not weaken it when touching either side.
// 3. [Pattern]: `sanitizeEntry` strips-not-rejects — an entry with a stray extra key survives with
//    the extra key stripped (and a warning); only a genuinely invalid/missing CORE_FIELDS value drops
//    the whole entry. This is deliberate (see git history: an earlier reject-whole-entry version
//    destroyed real count/sessionIds history over one stray field) — do not revert to all-or-nothing
//    rejection.
// 4. [Constraint]: CORE_FIELDS is the single source of truth for the entry schema — sanitizeEntry's
//    destructure list and hasExtraKeys' length check both derive from it. Adding/removing a field
//    means updating CORE_FIELDS and sanitizeEntry's validation body together, nothing else.
// 5. [Gotcha]: `main()` is guarded behind `require.main === module` specifically so
//    hooks/lib/pending-corrections-cli.test.js can `require()` this file for sanitizeEntry/
//    hasExtraKeys/CORE_FIELDS without triggering the CLI's argv-parsing side effect.
'use strict';
const fs = require('fs');
const { readPending, writePending } = require('./pending-corrections');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    console.error(`pending-corrections-cli: could not read stdin (${e.message}) — expected piped JSON`);
    return '';
  }
}

// Single source of truth for the entry schema's field list — both sanitizeEntry's destructure and
// hasExtraKeys' length check derive from this one array, so a future schema change updates both by
// construction instead of requiring two separate edits kept in sync by hand.
const CORE_FIELDS = ['slug', 'description', 'count', 'lastSeen', 'sessionIds'];

function hasExtraKeys(e) {
  return Object.keys(e).length !== CORE_FIELDS.length;
}

// Validates and normalizes one entry. Returns the sanitized CORE_FIELDS-only object (extra keys
// stripped) if all core fields are present with the right shape, or null if any core field is
// missing or wrong-shaped. A stray extra key never causes data loss — only a genuinely broken core
// field does.
function sanitizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const { slug, description, count, lastSeen, sessionIds } = e;
  if (typeof slug !== 'string' || slug.length === 0) return null;
  if (typeof description !== 'string' || description.length === 0) return null;
  if (!Number.isInteger(count) || count <= 0) return null;
  if (typeof lastSeen !== 'string') return null;
  if (!Array.isArray(sessionIds) || !sessionIds.every(s => typeof s === 'string')) return null;
  return { slug, description, count, lastSeen, sessionIds };
}

function cmdList() {
  const cwd = process.cwd();
  console.log(JSON.stringify(readPending(cwd)));
}

function cmdWrite() {
  const cwd = process.cwd();
  const input = readStdin();
  let entries;
  try {
    entries = JSON.parse(input);
  } catch (e) {
    console.error(`write: stdin was not valid JSON (${e.message})`);
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(entries)) {
    console.error('write: stdin JSON must be an array');
    process.exitCode = 1;
    return;
  }
  const valid = [];
  for (const e of entries) {
    const sanitized = sanitizeEntry(e);
    if (!sanitized) {
      console.error(`write: skipping malformed entry (missing/invalid core field among slug/description/count/lastSeen/sessionIds): ${JSON.stringify(e)}`);
      continue;
    }
    if (hasExtraKeys(e)) {
      console.error(`write: stripped unexpected extra key(s) from an otherwise-valid entry (kept only ${CORE_FIELDS.join('/')}): ${JSON.stringify(e)}`);
    }
    valid.push(sanitized);
  }
  const ok = writePending(cwd, valid);
  if (!ok) {
    console.error('write: writePending failed (see .construct/ledger/ permissions/path)');
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(valid));
}

function main() {
  const [, , subcommand] = process.argv;
  switch (subcommand) {
    case 'list':
      cmdList();
      break;
    case 'write':
      cmdWrite();
      break;
    default:
      console.error('usage: pending-corrections-cli.js <list|write>');
      process.exitCode = 1;
  }
}

// Only auto-run when invoked directly (node pending-corrections-cli.js ...) — not when required by
// a test file, which needs sanitizeEntry/hasExtraKeys as pure functions without the CLI side effect.
if (require.main === module) {
  main();
}

module.exports = { sanitizeEntry, hasExtraKeys, CORE_FIELDS };

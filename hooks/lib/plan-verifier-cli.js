// hooks/lib/plan-verifier-cli.js
// @ai-rules:
// 1. [Constraint]: Thin CLI wrapper only — no verification logic lives here. All logic is in
//    hooks/lib/plan-verifier.js (single source of truth, see that file's header comment for the contract).
// 2. [Pattern]: workspaceRoot is always sourced from process.cwd() (the invoking skill's own working
//    directory) — never hardcoded; it's the in-project primary root, resolving new artifacts under
//    {workspace}/.construct/plans/. planStoreRoot IS a hardcoded constant (~/.claude/gedeon/plans/) —
//    the legacy global store, tried only as a read-fallback — see plan-verifier.js's header comment, gotcha 4.
// 3. [Gotcha]: verify-citations reads {step}\t{citationText} pairs from stdin, one per line, and echoes
//    the step tag back unchanged in its {step}\tPASS / {step}\tFAIL: {reason} output — callers correlate
//    results by step tag, never by position. Split on the FIRST tab only (citationText itself may not
//    contain a tab in practice, but defensively we never split on a tab inside it).
// 4. [Gotcha]: extract-citations always prints a trailing "SKIPPED\t{N}" line after the {step}\t{citationText}
//    pairs — the anonymous count of malformed rows. Callers piping extract-citations' output into
//    verify-citations MUST filter this line out first (it is not a citation pair).
// 5. [Constraint]: hash/check-control-flow take <file> as shell argv, not stdin — the caller (gc-preflight
//    Step 2.6, gc-execute Track Verification) MUST charset-validate <file> (and entryLine/insertionLine as
//    pure integers) against untrusted plan-step annotations BEFORE constructing the shell command. This
//    file cannot defend against shell injection after the fact — by the time argv reaches this process,
//    any shell metacharacters in a maliciously-crafted path have already executed in the caller's shell.
'use strict';
const fs = require('fs');
const path = require('path');
const { verifyCitation, extractCitations, detectControlFlowRisk, hashFile, PLAN_STORE_ROOT } = require('./plan-verifier');

function splitFirstTab(line) {
  const idx = line.indexOf('\t');
  if (idx === -1) return [line, ''];
  return [line.slice(0, idx), line.slice(idx + 1)];
}

// Reads stdin synchronously. Returns '' (not a throw) if stdin isn't piped/readable (e.g. invoked
// interactively with no input) — an uncaught read error here would crash this CLI process outright.
function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    console.error(`verify-citations: could not read stdin (${e.message}) — expected piped {step}\\t{citationText} lines`);
    return '';
  }
}

function cmdVerifyCitations() {
  const workspaceRoot = process.cwd();
  const input = readStdin();
  const lines = input.split(/\r\n|\n/).filter(l => l.trim() !== '');
  for (const line of lines) {
    const [step, citationText] = splitFirstTab(line);
    const result = verifyCitation(citationText, workspaceRoot, PLAN_STORE_ROOT);
    if (result.valid) {
      console.log(`${step}\tPASS`);
    } else {
      console.log(`${step}\tFAIL: ${result.reason}`);
    }
  }
}

function cmdExtractCitations(file) {
  if (!file) {
    console.error('usage: extract-citations <file>');
    process.exitCode = 1;
    return;
  }
  const resolved = path.resolve(process.cwd(), file);
  let markdown = '';
  try {
    markdown = fs.readFileSync(resolved, 'utf8');
  } catch (e) {
    console.error(`could not read file: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  const { pairs, skippedRowCount } = extractCitations(markdown);
  for (const { step, citationText } of pairs) {
    console.log(`${step}\t${citationText}`);
  }
  // Trailing summary line, always printed — callers (e.g. gc-preflight Step 2.5) grep for this prefix
  // to get the anonymous skip count without re-deriving the table-parsing logic themselves.
  console.log(`SKIPPED\t${skippedRowCount}`);
}

function cmdCheckControlFlow(file, entryLineStr, insertionLineStr) {
  if (!file || entryLineStr === undefined || insertionLineStr === undefined) {
    console.error('usage: check-control-flow <file> <entryLine> <insertionLine>');
    process.exitCode = 1;
    return;
  }
  const workspaceRoot = process.cwd();
  const entryLine = parseInt(entryLineStr, 10);
  const insertionLine = parseInt(insertionLineStr, 10);
  const risky = detectControlFlowRisk(file, entryLine, insertionLine, workspaceRoot);
  if (risky === null) {
    console.log('UNRESOLVED: file not found, unreadable, path escapes workspace root, entry/insertion line is not a valid integer, or the line range is empty/degenerate (including entry line past end of file)');
    return;
  }
  if (risky.length === 0) {
    console.log('CLEAR');
    return;
  }
  for (const { line, snippet } of risky) {
    console.log(`${line}: ${snippet}`);
  }
}

function cmdHash(file) {
  if (!file) {
    console.error('usage: hash <file>');
    process.exitCode = 1;
    return;
  }
  const workspaceRoot = process.cwd();
  const digest = hashFile(file, workspaceRoot);
  console.log(digest === null ? 'MISSING' : digest);
}

function main() {
  const [, , subcommand, ...args] = process.argv;
  switch (subcommand) {
    case 'verify-citations':
      cmdVerifyCitations();
      break;
    case 'extract-citations':
      cmdExtractCitations(args[0]);
      break;
    case 'check-control-flow':
      cmdCheckControlFlow(args[0], args[1], args[2]);
      break;
    case 'hash':
      cmdHash(args[0]);
      break;
    default:
      console.error('usage: plan-verifier-cli.js <verify-citations|extract-citations|check-control-flow|hash> [args]');
      process.exitCode = 1;
  }
}

main();

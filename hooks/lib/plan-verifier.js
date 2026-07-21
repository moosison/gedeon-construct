// hooks/lib/plan-verifier.js
// @ai-rules:
// 1. [Constraint]: Zero external dependencies — fs, path, crypto (Node built-ins) only. No AST parser.
// 2. [Pattern]: Never throw — every function returns a value describing failure (invalid/false/null/[]/empty
//    array), matching hook-runtime.js's "return null on missing/corrupt, callers check" convention.
// 3. [Constraint]: Single source of truth for the citation/control-flow/hash contract — referenced (not
//    restated) by hooks/lib/plan-verifier-cli.js, hooks/gc-pre-write-guard.js, and skills/gc-preflight,
//    skills/gc-plan, skills/gc-execute. Changing behavior here changes it everywhere; keep signatures stable.
//    splitRow/isSeparatorRow are also reused by hooks/lib/tier-consistency-check.js for markdown-table
//    parsing (unrelated to the citation contract above) — keep their signatures stable for that consumer too.
// 4. [Gotcha]: workspaceRoot/planStoreRoot are ALWAYS caller-supplied (sourced from invocation cwd) — never
//    hardcode a project path here. This file is required by a hook that fires globally across every project.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Matches "{relative/path}:{line}[-{line}] `{exact snippet}`" — backtick-delimited, never straight quotes.
// The path itself may optionally be wrapped in its own backtick pair (the natural markdown instinct,
// e.g. "`path:42` `snippet`") — tolerated rather than fought a third time; see STATE.md 2026-07-08.
// An em/en dash (or lone hyphen) between path:line and the snippet is also tolerated — the second
// deliberate relaxation of this regex: 9/9 of one auditor's real, manually-verified findings failed
// on exactly "path:42 — `snippet`" on 2026-07-13. Fix the check, not the compliance.
const CITATION_RE = /^`?(.+?):(\d+)(?:-(\d+))?`?\s+(?:[—–-]\s+)?`([^`]*)`\s*$/;
// Windows drive-letter-colon absolute path, e.g. "C:\..." or "C:/..." — the one explicit rejection case.
const DRIVE_ABS_RE = /^[A-Za-z]:[\\/]/;
// Leading path separator — also absolute, also rejected (spirit of "path MUST be relative").
const LEADING_SEP_RE = /^[\\/]/;
// Read cap for any file resolved via a citation/insertion-point/hash path — this file's content is
// caller-influenced (citation text, plan step text) and read synchronously inside a globally-firing
// hook; without a cap a citation pointing at a very large file would block every Write/Edit on the
// machine while it reads. 5 MiB comfortably covers any real source/plan/report file in this project.
const MAX_READ_BYTES = 5 * 1024 * 1024;

function normalizeWs(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// Resolves rawPath against root and verifies the result stays inside root — rejects any ".." (or
// symlink) escape. root MUST already be an absolute, real path. Returns the resolved path, or null if
// rawPath escapes root. This is the one containment check verifyCitation/detectControlFlowRisk/hashFile
// all funnel through — a citation string is untrusted (LLM-authored, can carry injected content), and
// this hook fires globally, so a broken containment check here is a machine-wide arbitrary-file-read.
function resolveContained(root, rawPath) {
  if (!root) return null;
  const candidate = path.resolve(root, rawPath);
  const rootReal = root.endsWith(path.sep) ? root : root + path.sep;
  if (candidate !== root && !candidate.startsWith(rootReal)) return null;
  return candidate;
}

// Reads a file that has already passed resolveContained, capped at MAX_READ_BYTES. Returns
// { content } or { error: reason }. Never throws.
function readCappedFile(resolved) {
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (e) {
    return { error: `could not stat file: ${e.message}` };
  }
  if (!stat.isFile()) return { error: 'not a file' };
  if (stat.size > MAX_READ_BYTES) {
    return { error: `file too large to read (${stat.size} bytes, cap is ${MAX_READ_BYTES})` };
  }
  try {
    return { content: fs.readFileSync(resolved, 'utf8') };
  } catch (e) {
    return { error: `could not read file: ${e.message}` };
  }
}

// lean: snippets containing a literal backtick (almost always a JS template literal) have no fallback
// delimiter in this milestone's scope — such a citation cannot be expressed and must fall back to n/a.
// Accepted limitation; upgrade path = a second delimiter style if this proves to matter in practice.
function verifyCitation(citationText, workspaceRoot, planStoreRoot) {
  const trimmed = (citationText || '').trim();
  if (/^n\/a/i.test(trimmed)) {
    return { valid: true, reason: 'n/a — no citation required' };
  }

  const m = trimmed.match(CITATION_RE);
  if (!m) {
    return {
      valid: false,
      reason: 'malformed citation — expected "{relative/path}:{line}[-{line}] `{exact snippet}`" (path may optionally also be backtick-wrapped) or an n/a-prefixed value',
    };
  }
  const [, rawPath, line1Str, line2Str, rawSnippet] = m;

  if (DRIVE_ABS_RE.test(rawPath) || LEADING_SEP_RE.test(rawPath)) {
    return { valid: false, reason: `absolute path not allowed — citation path must be relative: ${rawPath}` };
  }
  if (rawPath.split(/[\\/]/).includes('..')) {
    return { valid: false, reason: `citation path must not escape its root with ".." segments: ${rawPath}` };
  }

  const line1 = parseInt(line1Str, 10);
  const line2 = line2Str ? parseInt(line2Str, 10) : line1;
  const snippet = normalizeWs(rawSnippet.replace(/\\\|/g, '|'));

  // Two-root resolution: workspace root first, then plan store — first existing, in-root file wins.
  // Neither root is hardcoded; both are supplied per-invocation by the caller. resolveContained rejects
  // any candidate that would land outside its root (defense-in-depth alongside the ".." check above —
  // catches root-relative absolute forms the regex checks above don't, e.g. a root-anchored symlink).
  let resolved = null;
  for (const root of [workspaceRoot, planStoreRoot]) {
    const candidate = resolveContained(root, rawPath);
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      resolved = candidate;
      break;
    }
  }
  if (!resolved) {
    return { valid: false, reason: `file not found relative to workspace or plan store: ${rawPath}` };
  }

  const read = readCappedFile(resolved);
  if (read.error) {
    return { valid: false, reason: `could not read cited file: ${read.error}` };
  }
  const lines = read.content.split(/\r\n|\n/);

  if (line1 < 1 || line1 > lines.length) {
    return { valid: false, reason: `cited line ${line1} is beyond end of file (${lines.length} lines)` };
  }

  // lean: matching "any single line within the range" is a weaker guarantee than the citation appears to
  // promise — for a wide range and a common short snippet, a valid result only proves the text exists
  // somewhere in the range, not at a specific meaningful line. Accepted for this milestone's scope; upgrade
  // path = require the exact line within the range to be stated, if this proves to matter in practice.
  const hi = Math.min(line2, lines.length);
  for (let ln = line1; ln <= hi; ln++) {
    if (normalizeWs(lines[ln - 1]).includes(snippet)) {
      return { valid: true, reason: `matched at line ${ln}` };
    }
  }
  return {
    valid: false,
    reason: `snippet not found in cited line(s) ${line1Str}${line2Str ? '-' + line2Str : ''} of ${rawPath}`,
  };
}

// Splits a markdown table row into trimmed cells, splitting only on unescaped "|".
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map(c => c.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every(c => /^:?-+:?$/.test(c));
}

// extractCitations: scans markdown for tables whose header row has a "Citation" cell (and a "Step" cell in
// the same header row), matched by header TEXT — trimmed, case-insensitive — never by fixed column index.
// Returns { pairs, skippedRowCount }. pairs is {step, citationText} entries so a result can be correlated
// back to its finding even after n/a-filtering or malformed-row-skipping changes the array's shape
// relative to the original table. skippedRowCount is the number of data rows in a Citation/Step table
// that were NOT returned (Citation or Step cell missing/empty) — exposed directly so callers (t6, t9)
// never need their own copy of this table-detection logic to compute it (both used to; see git history).
function extractCitations(markdown) {
  const pairs = [];
  let skippedRowCount = 0;
  if (!markdown) return { pairs, skippedRowCount };
  const lines = markdown.split(/\r\n|\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes('|') && i + 1 < lines.length) {
      const headerCells = splitRow(line);
      const sepCells = splitRow(lines[i + 1]);
      if (sepCells.length === headerCells.length && isSeparatorRow(sepCells)) {
        const citationIdx = headerCells.findIndex(c => c.toLowerCase() === 'citation');
        const stepIdx = headerCells.findIndex(c => c.toLowerCase() === 'step');
        let j = i + 2;
        if (citationIdx !== -1 && stepIdx !== -1) {
          while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
            const rowCells = splitRow(lines[j]);
            const citationText = (rowCells[citationIdx] || '').trim();
            const step = (rowCells[stepIdx] || '').trim();
            if (citationText && step) {
              pairs.push({ step, citationText });
            } else {
              skippedRowCount++;
            }
            j++;
          }
        } else {
          while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') j++;
        }
        i = j;
        continue;
      }
    }
    i++;
  }
  return { pairs, skippedRowCount };
}

function stripLineComment(line) {
  const idx = line.indexOf('//');
  return idx === -1 ? line : line.slice(0, idx);
}

// lean: ~70% recall heuristic, misses nested try/catch and switch-fallthrough; upgrade path = real AST
// parser (would revisit the zero-dep constraint).
// lean: entryLine is self-reported by whoever writes the citing plan step and is NOT independently verified
// against the file — a wrong entryLine silently produces a wrong scan window. Accepted limitation; ceiling =
// a bad entryLine defeats the check silently; upgrade path = cross-check entryLine looks like a plausible
// function/block start before trusting it, if this proves to matter in practice.
// Returns null (not []) when the check could not actually scan anything meaningful — unresolvable/missing
// path, unreadable file, non-finite line numbers, or a degenerate/inverted/EOF-exceeding line range — so
// callers never confuse "couldn't determine a verdict" with "genuinely clean" (matches hashFile's own
// null-on-failure convention). Only a real, in-bounds scan returns an array (possibly empty = clean).
function detectControlFlowRisk(filePath, entryLine, insertionLine, workspaceRoot) {
  if (!Number.isFinite(entryLine) || !Number.isFinite(insertionLine)) return null;
  const resolved = resolveContained(workspaceRoot, filePath);
  if (!resolved || !fs.existsSync(resolved)) return null;
  const read = readCappedFile(resolved);
  if (read.error) return null;
  const lines = read.content.split(/\r\n|\n/);
  const start = Math.max(1, entryLine);
  const end = Math.min(lines.length, insertionLine - 1);
  if (start > end) return null;
  const risky = [];
  for (let ln = start; ln <= end; ln++) {
    const raw = lines[ln - 1] || '';
    const code = stripLineComment(raw);
    if (/\breturn\b/.test(code) || /\bthrow\b/.test(code)) {
      risky.push({ line: ln, snippet: raw.trim() });
    }
  }
  return risky;
}

// lean: whole-file hash, not per-cited-line-range — a narrower hash would need to re-locate the cited
// region after any unrelated line-shift, reintroducing the exact "range drifted, nobody re-checked" failure
// this milestone exists to close. Accepted as the correct minimal choice, not a shortcut.
//
// Optional third arg (planStoreRoot) mirrors verifyCitation's two-root resolution: some callers (the
// facts ledger's gate-verdict/gate-override evidence) hash a file that legitimately lives in the plan
// store (~/.claude/gedeon/plans/), not the workspace — e.g. a Pre-Flight-Review report. Without a second
// root, resolveContained(workspaceRoot, planStorePath) always returns null (the path is outside root),
// so the fact's hash is permanently null and it can never satisfy qualifiesForGate — a real bug caught in
// code review, not pre-flight, because pre-flight only ever reviewed the plan's TEXT describing this call,
// never the actual cross-root path a gate-verdict fact's evidenceFile resolves to at runtime. Existing
// 2-arg call sites (gc-preflight's Step 2.6 hash check, gc-execute's Track Verification) are unaffected —
// omitting planStoreRoot preserves the original single-root behavior exactly. planStoreRoot here is the
// legacy global plan store — a read-fallback for pre-relocation artifacts, not where new artifacts are
// written; see PLAN_STORE_ROOT's own comment below.
function hashFile(filePath, workspaceRoot, planStoreRoot) {
  const roots = planStoreRoot ? [workspaceRoot, planStoreRoot] : [workspaceRoot];
  for (const root of roots) {
    const resolved = resolveContained(root, filePath);
    if (!resolved || !fs.existsSync(resolved)) continue;
    try {
      // Raw buffer, not readCappedFile — hashing needs the exact bytes, not a decoded utf8 string.
      if (fs.statSync(resolved).size > MAX_READ_BYTES) return null;
      const buf = fs.readFileSync(resolved);
      return crypto.createHash('sha256').update(buf).digest('hex');
    } catch {
      return null;
    }
  }
  return null;
}

// legacy global plan store — read-fallback only. New artifacts live in {workspace}/.construct/plans/
// and resolve via workspaceRoot (the first root tried above); this path only still matters for
// pre-relocation artifacts that were written here before that move.
const PLAN_STORE_ROOT = path.join(os.homedir(), '.claude', 'gedeon', 'plans');

module.exports = { verifyCitation, extractCitations, detectControlFlowRisk, hashFile, splitRow, isSeparatorRow, PLAN_STORE_ROOT };

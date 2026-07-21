// hooks/lib/debt-tracker.js
// @ai-rules:
// 1. [Constraint]: CommonJS only, no external dependencies — built-ins only (fs, path, crypto), matches hook-runtime.js convention.
// 2. [Pattern]: scanLeanComments is scoped to .js files under hooks/ and hooks/lib/ only — never .md files. Doctrine
//    prose (CLAUDE.md, GEDEON-DOCTRINE.md, SKILL.md files) contains the literal string "lean:" outside real debt
//    comments; scanning markdown would silently reintroduce that false-positive.
// 3. [Gotcha]: writeDebtLedger rewrites the full ledger every call (not append) — repeated Stop-hook firings in one
//    session must converge to the same state, not grow unbounded.
'use strict';
const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./atomic-write');

const LEAN_RE = /^\s*\/\/\s*lean:/;
const COMMENT_RE = /^\s*\/\//;
// lean: scope is hooks/ + hooks/lib/ only — root-level .js files (gc-dashboard.js, setup.js) are excluded
// and would need their own lean: markers tracked manually until this list widens; upgrade path = walk the
// repo root's own .js files too, once one of them actually carries a lean: marker worth surfacing.
const SCAN_DIRS = ['hooks', path.join('hooks', 'lib')];

function scanFile(workspaceRoot, dir, fileName) {
  const filePath = path.join(workspaceRoot, dir, fileName);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const lines = content.split(/\r\n|\n/);
  const relFile = path.join(dir, fileName).split(path.sep).join('/');
  const entries = [];
  let i = 0;
  while (i < lines.length) {
    if (LEAN_RE.test(lines[i])) {
      const startLine = i + 1;
      const textLines = [lines[i]];
      let j = i + 1;
      // lean: continuation absorbs any following // line, not just semantically-related ones — a lean:
      // marker directly followed by an unrelated comment line would fold it into this entry's text; upgrade
      // path = require a blank-line or non-comment terminator convention if this ever misfires in practice.
      while (j < lines.length && COMMENT_RE.test(lines[j]) && !LEAN_RE.test(lines[j])) {
        textLines.push(lines[j]);
        j++;
      }
      entries.push({
        file: relFile,
        line: startLine,
        endLine: startLine + textLines.length - 1,
        text: textLines.join('\n'),
      });
      i = j;
    } else {
      i++;
    }
  }
  return entries;
}

function scanLeanComments(workspaceRoot) {
  const entries = [];
  for (const dir of SCAN_DIRS) {
    const full = path.join(workspaceRoot, dir);
    let names;
    try {
      names = fs.readdirSync(full);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.js')) continue;
      let stat;
      try {
        stat = fs.statSync(path.join(full, name));
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      entries.push(...scanFile(workspaceRoot, dir, name));
    }
  }
  return entries;
}

function writeDebtLedger(workspaceRoot, entries) {
  const constructDir = path.join(workspaceRoot, '.construct');
  const ledgerFile = path.join(constructDir, 'DEBT.json');

  if (!fs.existsSync(constructDir)) {
    return { previousCount: 0, newCount: entries.length, changed: false };
  }

  let previousCount = 0;
  try {
    const prior = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    previousCount = (prior.entries || []).length;
  } catch {
    previousCount = 0;
  }

  if (!atomicWrite(ledgerFile, JSON.stringify({ scannedAt: new Date().toISOString(), entries }, null, 2))) {
    try { process.stderr.write(`[gedeon-construct] debt-tracker: failed to write DEBT.json\n`); } catch {}
  }

  // lean: changed is count-only, not content-only — a same-count edit (e.g. one marker's text changed,
  // or one marker swapped for another) rewrites the ledger correctly but suppresses the Stop-hook advisory.
  // Upgrade path = content-hash the entries array instead of comparing lengths, if the notification signal
  // ever needs to be precise rather than just "the file is current."
  return {
    previousCount,
    newCount: entries.length,
    changed: previousCount !== entries.length,
  };
}

module.exports = {
  scanLeanComments,
  writeDebtLedger,
};

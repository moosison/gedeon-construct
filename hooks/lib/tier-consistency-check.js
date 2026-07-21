// hooks/lib/tier-consistency-check.js
// @ai-rules:
// 1. [Constraint]: Zero external dependencies — fs, path (Node built-ins) only.
// 2. [Pattern]: Reuses splitRow/isSeparatorRow from ./plan-verifier — never reimplement table parsing here.
// 3. [Constraint]: This is a static documentation-drift check (dispatch-table Model cells vs. agents/*.md
//    model_tier), NOT a runtime verifier of which persona actually ran. Label output accordingly wherever
//    surfaced — see .construct/ROADMAP.md's deferred "Tier-compliance verifier" phase for why the runtime
//    version isn't buildable yet (no field in subagent transcripts identifies which Gedeon persona was
//    injected as the prompt).
// 4. [Gotcha]: Agent-file detection matches "agents/gc-*.md" anywhere in a row's cells — never by a fixed
//    column index or header name — because the 7 dispatch tables use different header labels for that
//    column ("Agent file" vs. "File").
'use strict';
const fs = require('fs');
const path = require('path');
const { splitRow, isSeparatorRow } = require('./plan-verifier');

const TIER_TO_MODEL = { mechanical: 'haiku', balanced: 'sonnet', synthesis: 'opus', escalation: 'fable' };

const DISPATCH_TABLES = [
  'skills/gc-bootstrap/SKILL.md',
  'skills/gc-plan/SKILL.md',
  'skills/gc-preflight/SKILL.md',
  'skills/gc-execute/SKILL.md',
  'skills/gc-review/SKILL.md',
  'skills/gc-skill-author/SKILL.md',
  'skills/gc-new-project/SKILL.md',
];

const ALL_PERSONAS = [
  'gc-explorer', 'gc-auditor', 'gc-brain', 'gc-executor',
  'gc-lean-auditor', 'gc-platform-reviewer', 'gc-researcher', 'gc-reviewer',
  'gc-fable5-advisor', 'gc-inception-researcher',
];

const AGENT_FILE_RE = /agents\/(gc-[a-z0-9-]+)\.md/i;

// Scans one dispatch table's markdown for rows in any table whose header row has a "Model" cell
// (matched by trimmed, case-insensitive text — never fixed column index, since gc-skill-author's
// table orders columns File|Role|Model|Mode while the others use varying Model/Agent-file layouts
// (e.g. gc-new-project's Step 1.5 table is a 3-column Research lane|Model|Agent file) — which is
// exactly why the Model column is located by header name, never by fixed index).
// Returns [{ persona, statedModel, rawModelCell }] — one entry per row that also names an
// agents/gc-*.md file somewhere in its cells.
function findDispatchRows(markdown) {
  const rows = [];
  if (!markdown) return rows;
  const lines = markdown.split(/\r\n|\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes('|') && i + 1 < lines.length) {
      const headerCells = splitRow(line);
      const sepCells = splitRow(lines[i + 1]);
      if (sepCells.length === headerCells.length && isSeparatorRow(sepCells)) {
        const modelIdx = headerCells.findIndex(c => c.trim().toLowerCase() === 'model');
        let j = i + 2;
        if (modelIdx !== -1) {
          while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
            const rowCells = splitRow(lines[j]);
            const modelCell = (rowCells[modelIdx] || '').trim();
            const m = rowCells.join(' ').match(AGENT_FILE_RE);
            if (m && modelCell) {
              // Compound cell e.g. "opus (security lane)" — leading token is the primary value;
              // the parenthetical marks an elevated security-lane cell, cross-checked below against the
              // persona's security_lane_model frontmatter field instead of the tier-derived primary model.
              const primaryToken = modelCell.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
              // Exact fixed substring (with closing paren) — matches gc-review's elevated-form cells
              // ("opus (security lane)") but NOT gc-skill-author's pre-existing colon-form cell
              // ("sonnet (security lane: opus)"), whose "lane" is followed by ":" not ")".
              const isSecurityLane = modelCell.includes('(security lane)');
              rows.push({ persona: m[1].toLowerCase(), statedModel: primaryToken, rawModelCell: modelCell, isSecurityLane });
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
  return rows;
}

// Reads model_tier from an agent persona's frontmatter. Returns the tier string, or null if the file
// or field is missing (never throws — matches plan-verifier.js's "return null, callers check" convention).
function readModelTier(workspaceRoot, persona) {
  const resolved = path.join(workspaceRoot, 'agents', `${persona}.md`);
  let content;
  try {
    content = fs.readFileSync(resolved, 'utf8');
  } catch {
    return null;
  }
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/model_tier:\s*(\S+)/i);
  return m ? m[1].toLowerCase() : null;
}

// Reads security_lane_model from an agent persona's frontmatter. Returns the model string, or null if
// the file or field is missing (same try/catch-null convention as readModelTier).
function readSecurityLaneModel(workspaceRoot, persona) {
  const resolved = path.join(workspaceRoot, 'agents', `${persona}.md`);
  let content;
  try {
    content = fs.readFileSync(resolved, 'utf8');
  } catch {
    return null;
  }
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/security_lane_model:\s*(\S+)/i);
  // Same non-letter strip as statedModel derivation (findDispatchRows) — a quoted frontmatter value
  // ("opus") would otherwise false-drift against the stripped cell token (review hardening 2026-07-16).
  return m ? m[1].toLowerCase().replace(/[^a-z]/g, '') : null;
}

// checkTierConsistency: the documentation-drift check itself. Compares each of the 7 dispatch tables'
// Model cells against the tier-derived expected model of the agents/*.md file that row references.
function checkTierConsistency(workspaceRoot) {
  const rows = [];
  for (const rel of DISPATCH_TABLES) {
    let content;
    try {
      content = fs.readFileSync(path.join(workspaceRoot, rel), 'utf8');
    } catch {
      continue;
    }
    for (const r of findDispatchRows(content)) rows.push({ file: rel, ...r });
  }

  const checkedPersonas = [...new Set(rows.map(r => r.persona))].sort();
  const uncheckedPersonas = ALL_PERSONAS.filter(p => !checkedPersonas.includes(p)).sort();

  const evaluated = rows.map(r => {
    const tier = readModelTier(workspaceRoot, r.persona);
    const expectedModel = r.isSecurityLane
      ? readSecurityLaneModel(workspaceRoot, r.persona)
      : (tier ? TIER_TO_MODEL[tier] || null : null);
    return { ...r, tier, expectedModel, ok: expectedModel !== null && expectedModel === r.statedModel };
  });
  const drift = evaluated.filter(r => !r.ok);

  // Security-lane presence invariant (review hardening 2026-07-16): the "(security lane)" marker is
  // self-attested inside the tables it elevates, so silently REMOVING it would demote a security row to
  // the persona's primary tier without producing drift (the demoted cell then matches the primary
  // expectation exactly). Pin the expected elevated-row count per file so marker-stripping surfaces as
  // drift. Update this constant consciously when a security lane is added or removed — closed
  // enumeration, never inferred (same doctrine as gc-brain's Budget-Mode Mapping lane walk).
  const EXPECTED_SECURITY_LANE_ROWS = { 'skills/gc-review/SKILL.md': 2 };
  for (const [file, expected] of Object.entries(EXPECTED_SECURITY_LANE_ROWS)) {
    const actual = evaluated.filter(r => r.file === file && r.isSecurityLane).length;
    if (actual !== expected) {
      drift.push({
        file,
        persona: '(security-lane count invariant)',
        statedModel: `${actual} elevated row(s)`,
        rawModelCell: `expected ${expected} "(security lane)" row(s) in this table, found ${actual}`,
        tier: null,
        expectedModel: null,
        ok: false,
        isSecurityLane: true,
      });
    }
  }

  const note =
    'Security-lane table rows (elevated-form cells, e.g. "opus (security lane)") are verified against ' +
    "the persona's security_lane_model frontmatter field, and each pinned table's elevated-row count is " +
    'asserted (EXPECTED_SECURITY_LANE_ROWS) so removing a marker surfaces as drift. Prose-declared lanes ' +
    "(gc-preflight's optional security auditor, gc-review's conditional reviewers) remain unchecked. " +
    "gc-auditor's and gc-reviewer's " +
    'security_lane_tier is not verified by this check (no table row carries it) — disclosed separately, ' +
    'not counted as a missing persona.';
  const label = 'This is a documentation-drift check between two source files (dispatch tables vs. ' +
    'agents/*.md model_tier), not a runtime verifier of which persona actually ran.';

  const summary =
    `${checkedPersonas.length}/${ALL_PERSONAS.length} personas checked via table rows, ` +
    `${uncheckedPersonas.length}/${ALL_PERSONAS.length} not found in any table` +
    (uncheckedPersonas.length ? ` (${uncheckedPersonas.join(', ')})` : '') +
    `. Drift: ${drift.length} row(s) disagree with tier-derived expectation.`;

  return {
    totalPersonas: ALL_PERSONAS.length,
    checkedPersonas,
    uncheckedPersonas,
    rows: evaluated,
    drift,
    note,
    label,
    summary,
  };
}

if (require.main === module) {
  const result = checkTierConsistency(process.cwd());
  console.log(result.label);
  console.log(result.summary);
  console.log(`Note: ${result.note}`);
  if (result.drift.length) {
    console.log('\nDrift detail:');
    for (const d of result.drift) {
      console.log(
        `  ${d.file}: ${d.persona} stated "${d.rawModelCell}" -> primary "${d.statedModel}", ` +
        `expected "${d.expectedModel || '(model_tier missing/unknown)'}" from tier "${d.tier || 'missing'}"`
      );
    }
  }
  process.exit(result.drift.length > 0 ? 1 : 0);
}

module.exports = { checkTierConsistency };

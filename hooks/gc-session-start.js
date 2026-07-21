// hooks/gc-session-start.js
// @ai-rules:
// 1. [Constraint]: Zero external dependencies — built-ins only (via hook-runtime.js).
// 2. [Pattern]: Always process.exit(0) on success or non-fatal error — never crash the session.
// 3. [Gotcha]: eop stage sets banner with =, not +=. brainBlock and model advisory must guard against eop.
// 4. [Pattern]: readAgentFile() returns null if agents/gc-brain.md is missing — degrades gracefully.
'use strict';
const { readStdin, loadPipelineState, readGedeonFile, readConstructSection, parseErrorCounts, readAgentFile, writeSessionPointer } = require('./lib/hook-runtime');
const { STAGE_MAP } = require('./lib/gc-pipeline-stages');

readStdin().then(data => {
  if (!data) process.exit(0);

  const cwd = data.cwd || process.cwd();
  writeSessionPointer(cwd, data.session_id);
  const state = loadPipelineState(cwd);
  if (!state || !state.stage) process.exit(0);

  const { stage } = state;
  const entry = STAGE_MAP[stage];
  const brainIdentity = readAgentFile(cwd, 'gc-brain');
  const brainBlock = (brainIdentity && stage !== 'eop') ? `\n${brainIdentity}\n\n---\n\n` : '';
  const header = '\n## Gedeon Construct\n';

  let banner = '';

  if (stage === 'eop') {
    banner = header + 'Pipeline complete. Start a new session with /gc-bootstrap.\n';
  } else if (entry && entry.next) {
    banner = header + brainBlock + `Resumed at stage: **${stage}**\nNext: ${entry.next}\n`;
  } else {
    process.stderr.write(`[gedeon-construct] session-start: unrecognized stage ${JSON.stringify(stage)}\n`);
    banner = header + brainBlock + `Unrecognized pipeline stage: **${stage}** — check .claude/gc-pipeline.json.\n`;
  }

  // Model advisory -- recommended model for this pipeline stage
  if (entry && entry.model && stage !== 'eop') {
    banner += `\n**Recommended model for this stage:** \`/model ${entry.model}\`\n`;
  }

  // User preferences from global memory
  const memory = readGedeonFile('user/memory.md');
  if (memory && memory.trim().split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('<!--')).length > 0) {
    const lineCount = memory.trim().split('\n').length;
    banner += `\n**User Preferences loaded** (${lineCount} lines from ~/.claude/gedeon/user/memory.md)\n`;
  }

  // Error counts from project STATE.md
  const errorSection = readConstructSection(cwd, 'Error Counts');
  if (errorSection) {
    const counts = parseErrorCounts(errorSection);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (total > 0) {
      const detail = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join(', ');
      banner += `\n⚠ Unresolved behavioral gaps: ${detail}\n  → Run /gc-correct before starting new work.\n`;
    }
  }

  process.stdout.write(banner + '\n', () => process.exit(0));
}).catch(e => {
  process.stderr.write(`[gedeon-construct] session-start error: ${e.message}\n`);
  process.exit(0);
});

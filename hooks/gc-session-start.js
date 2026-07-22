// hooks/gc-session-start.js
// @ai-rules:
// 1. [Constraint]: Zero external dependencies — built-ins only (via hook-runtime.js).
// 2. [Pattern]: Always process.exit(0) on success or non-fatal error — never crash the session.
// 3. [Gotcha]: eop stage sets banner with =, not +=. brainBlock and model advisory must guard against eop.
// 4. [Pattern]: readAgentFile() returns null if agents/gc-brain.md is missing — degrades gracefully.
// 5. [Pattern]: The update-advisory block (git rev-parse/ls-remote) uses its own per-concern
//    try/catch, borrowed from gc-stop-reminder.js's convention — not this file's own prior
//    pattern. It must never populate `banner` or throw on failure (offline, no git, timeout).
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const { readStdin, loadPipelineState, readGedeonFile, readConstructSection, parseErrorCounts, readAgentFile, writeSessionPointer, gedeonHome } = require('./lib/hook-runtime');
const { STAGE_MAP } = require('./lib/gc-pipeline-stages');
const { atomicWrite } = require('./lib/atomic-write');
const { isThrottled, buildAdvisory } = require('./lib/update-check');

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

  // Update advisory — throttled, best-effort, never blocks session start. Own per-concern
  // try/catch (see @ai-rules 5) so a git/network failure here can never crash the hook or
  // suppress the rest of the banner already built above.
  // lean: this block inlines path derivation + config read + throttle gate + 2 subprocess
  // calls + persist, three try/catch levels deep — denser than this file's other single-concern
  // blocks. Ceiling: readable today, harder to extend with a 3rd concern. Upgrade path: extract
  // to a named function (in-file or in hooks/lib/update-check.js) if this block grows again.
  // Also: setup.js:120-132 has a structurally similar config.json read-merge-write scaffold
  // (different merge semantics, same read/parse/fallback/write shape) — a shared helper would
  // remove the duplication if a third call site ever appears. (gc-review 2026-07-22, Maintainability lens.)
  try {
    const packagePath = path.dirname(__dirname); // this file lives at {packagePath}/hooks/gc-session-start.js
    const throttleMs = 6 * 60 * 60 * 1000; // mirrors update-check.js's isThrottled default

    let config = {};
    try {
      const raw = readGedeonFile('config.json');
      config = raw ? JSON.parse(raw) : {};
    } catch (e) {
      config = {}; // corrupt JSON — treat as "start fresh", matching t1's read-merge-write posture
    }

    if (!isThrottled({ lastCheckedAt: config.lastUpdateCheckAt, now: Date.now(), throttleMs })) {
      try {
        // cwd: packagePath (review fix, CWE-427) — without an explicit cwd, execFileSync
        // inherits this hook's own working directory, which is normally the untrusted
        // project the user has open; on Windows that directory sits in the executable
        // search path, so a hostile repo could plant its own git.exe/git.com there.
        // Pinning cwd to the trusted install directory removes that search path entry.
        const gitOpts = { cwd: packagePath, timeout: 5000, encoding: 'utf8' };
        const localSha = execFileSync('git', ['-C', packagePath, 'rev-parse', 'HEAD'], gitOpts).trim();
        const lsRemoteOutput = execFileSync('git', ['-C', packagePath, 'ls-remote', 'origin', 'main'], gitOpts);
        const remoteSha = lsRemoteOutput.trim().split(/\s+/)[0];

        if (remoteSha) { // empty string if the remote has no `main` (review fix) — never compare against ''
          const { advisoryText } = buildAdvisory({ localSha, remoteSha });
          if (advisoryText) banner += `\n${advisoryText}\n`;
        }

        atomicWrite(path.join(gedeonHome(), 'config.json'), JSON.stringify({ ...config, lastUpdateCheckAt: Date.now() }, null, 2) + '\n');
      } catch (e) {
        // no network, no git, not a repo, or timeout — best-effort, never write to banner, never throw
      }
    }
  } catch (e) {
    // update-advisory check must never block session start
  }

  process.stdout.write(banner + '\n', () => process.exit(0));
}).catch(e => {
  process.stderr.write(`[gedeon-construct] session-start error: ${e.message}\n`);
  process.exit(0);
});

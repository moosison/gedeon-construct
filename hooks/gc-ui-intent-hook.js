// hooks/gc-ui-intent-hook.js
// @ai-rules:
// 1. [Constraint]: Zero external dependencies — Node built-ins + hooks/lib only.
// 2. [Constraint]: OUTPUT IS A COMPILE-TIME CONSTANT STRING. Never interpolate data.prompt (the matched
//    keyword, a snippet, anything prompt-derived) into stdout — UserPromptSubmit stdout becomes model
//    context, so reflecting prompt text would open a context-injection path. The fixed string forecloses it.
// 3. [Constraint]: Always exit 0 — a non-zero exit from a UserPromptSubmit hook BLOCKS the user's prompt.
//    Guard stdout EPIPE (process.stdout.on('error')) AND catch the promise; both paths exit 0.
// 4. [Gotcha]: Self-gates on Gedeon-workspace detection AND suppresses once the pipeline is mid-build
//    (execute/review) — offering the design gate is moot there. eop stays live: brainstorm-after-close.
// 5. [Pattern]: Dumb tripwire — keyword logic + its test live in hooks/lib/ui-intent.js. The precision
//    filter (is this REALLY design work vs. "redesign this code"?) is gc-plan Step 1.5's judgment, not here.
'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin, loadPipelineState } = require('./lib/hook-runtime');
const { matchesUiIntent } = require('./lib/ui-intent');

// A non-zero exit blocks the prompt; guard the stream too, not just the promise (see @ai-rules 3).
process.stdout.on('error', () => process.exit(0));

// Stages where the mockup-first advisory is still useful are pre-build; mid-build it only nags. Mirrors
// gc-pre-write-guard.js's own stage-gating precedent. Deliberately excludes 'eop' — a stale eop pointer is
// the common state during brainstorm-after-close, exactly when catching design intent early is the point.
const SUPPRESS_STAGES = new Set(['execute', 'review']);

// lean: no per-session dedup — the one-line advisory re-fires on each UI-keyword prompt within a firing
// stage; upgrade path = a session-scoped marker file if the noise proves real.
// lean: the hook's settings timeout (setup.js) equals readStdin's internal 5000ms fallback — if the harness
// kill races the internal resolve(null), the turn is a silent no-op (advisory only, never blocks the prompt);
// same accepted class as gc-stop-reminder.js's stdin-timeout note. Upgrade path = widen the config timeout.

readStdin().then(data => {
  if (!data) process.exit(0);
  const cwd = typeof data.cwd === 'string' ? data.cwd : process.cwd();

  // Self-gate: act only inside a Gedeon workspace (active pipeline pointer OR a .construct/ tree).
  const state = loadPipelineState(cwd);
  const isGedeon = Boolean(state) || fs.existsSync(path.join(cwd, '.construct'));
  if (!isGedeon) process.exit(0);
  if (state && SUPPRESS_STAGES.has(state.stage)) process.exit(0);  // mid-build: the design gate is moot

  if (matchesUiIntent(data.prompt)) {
    // CONSTANT string — never interpolate prompt content (see @ai-rules 2).
    process.stdout.write(
      '⟢ [gc-uiux] This request may involve UI/UX/frontend work — if planning follows, ' +
      'validate design-relevance and consider offering the mockup-first gate (/gc-uiux).\n',
      () => process.exit(0)
    );
  } else {
    process.exit(0);
  }
}).catch(() => process.exit(0));

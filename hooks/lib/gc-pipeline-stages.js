// hooks/lib/gc-pipeline-stages.js
// Single source of truth for all pipeline stage data.
// Add/rename stages here — all hooks derive from this.
// @ai-rules:
// 1. [Constraint]: Single source of truth — all hooks derive STAGE_MAP from this file only.
// 2. [Pattern]: model field has dual consumers: gc-session-start.js (banner advisory) and SKILL.md frontmatter (Claude harness). Both must stay in sync.
// 3. [Gotcha]: skill field is reserved for future hook-reads-skill-file feature — do not remove as dead code.
// 4. [Constraint]: A stage with next: null requires an explicit branch in gc-session-start.js (see the eop guard).
'use strict';

const PIPELINE = [
  { id: 'bootstrap',   skill: 'gc-bootstrap',  model: 'sonnet', next: '/gc-plan',      reminder: 'Next: run /gc-plan — or /gc-discuss first to elicit requirements.' },
  { id: 'create-plan', skill: 'gc-plan',        model: 'sonnet', next: '/gc-preflight', reminder: 'Next: run /gc-preflight to stress-test the plan.' },
  { id: 'pre-flight',  skill: 'gc-preflight',   model: 'sonnet', next: '/gc-execute',   reminder: 'Next: run /gc-execute  (only if Gate: PASS). Otherwise /gc-preflight again.' },
  { id: 'execute',     skill: 'gc-execute',     model: 'sonnet', next: '/gc-review',    reminder: '⚠️  Session closing mid-execute — run /gc-review before you go.' },
  { id: 'review',      skill: 'gc-review',      model: 'sonnet', next: '/gc-eop',       reminder: 'Next: run /gc-eop to capture learnings and close the session.' },
  { id: 'eop',         skill: 'gc-eop',         model: 'sonnet', next: null,            reminder: null }, // terminal
];

const STAGE_MAP   = Object.fromEntries(PIPELINE.map(s => [s.id, s]));
const STAGE_IDS   = PIPELINE.map(s => s.id);
const EXECUTE_IDX = STAGE_IDS.indexOf('execute');

module.exports = { PIPELINE, STAGE_MAP, STAGE_IDS, EXECUTE_IDX };

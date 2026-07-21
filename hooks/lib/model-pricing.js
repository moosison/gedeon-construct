// hooks/lib/model-pricing.js
// @ai-rules:
// 1. [Constraint]: CommonJS only, no external dependencies — built-ins only (matches hook-runtime.js convention).
// 2. [Pattern]: Rates are $ per million tokens (Mtok). Unrecognized model IDs return all-zero rates, flagged `unpriced: true` so callers (usage-tracker.js) can distinguish "genuinely free" from "not in this table" instead of both reading as $0.
// 3. [Gotcha]: Figures below follow Anthropic's published tier pattern (Opus > Sonnet > Haiku, cache write ~1.25x input, cache read ~0.1x input) but were not fetched from a live pricing page — verify against current published rates before relying on dollar totals for real budgeting.
'use strict';

// lean: manual rate table, ceiling = drifts if Anthropic repricing or new model IDs aren't hand-applied;
// upgrade path = fetch from a pricing API if one exists.
// Verify periodically: grep -oh '"model":"claude-[^"]*"' ~/.claude/projects/**/*.jsonl | sort -u
const RATES = {
  'claude-sonnet-5':          { inputPerMTok: 3,  outputPerMTok: 15, cacheWritePerMTok: 3.75,  cacheReadPerMTok: 0.30 },
  'claude-sonnet-4-6':        { inputPerMTok: 3,  outputPerMTok: 15, cacheWritePerMTok: 3.75,  cacheReadPerMTok: 0.30 },
  'claude-opus-4-8':          { inputPerMTok: 15, outputPerMTok: 75, cacheWritePerMTok: 18.75, cacheReadPerMTok: 1.50 },
  'claude-opus-4-7':          { inputPerMTok: 15, outputPerMTok: 75, cacheWritePerMTok: 18.75, cacheReadPerMTok: 1.50 },
  'claude-haiku-4-5-20251001':{ inputPerMTok: 0.8, outputPerMTok: 4, cacheWritePerMTok: 1.00,  cacheReadPerMTok: 0.08 },
};

const ZERO_RATE = { inputPerMTok: 0, outputPerMTok: 0, cacheWritePerMTok: 0, cacheReadPerMTok: 0, unpriced: true };

const loggedUnrecognized = new Set();

function getRate(modelId) {
  const rate = RATES[modelId];
  if (rate) return rate;
  if (!loggedUnrecognized.has(modelId)) {
    loggedUnrecognized.add(modelId);
    // Strip control characters before logging — modelId originates from transcript data;
    // an unsanitized value could otherwise inject terminal escape sequences into stderr.
    const safeId = String(modelId).replace(/[\x00-\x1F\x7F]/g, '');
    process.stderr.write(`[gedeon-construct] model-pricing: unrecognized model "${safeId}", treating as $0\n`);
  }
  return ZERO_RATE;
}

module.exports = { RATES, getRate };

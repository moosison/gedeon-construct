// hooks/lib/pending-corrections-cli.test.js
// Code-review addition (Testing lens finding: sanitizeEntry is a pure, zero-side-effect function
// with 6 correctness-critical branches — 4 of which had zero coverage, manual or automated, despite
// gating whether a stored correction's count/sessionIds history survives or is silently dropped.
// Deliberately narrower than a full CLI test: only sanitizeEntry/hasExtraKeys are unit-tested here,
// matching this repo's own convention that CLI wrappers stay untested at the process/argv level
// (ledger-cli.js/debt-tracker.js have no dedicated test file at all) — this file tests the pure
// logic the CLI happens to contain, not the CLI's I/O plumbing.
// @ai-rules:
// 1. [Constraint]: Node built-ins only (assert) — no test framework. Run directly:
//    node hooks/lib/pending-corrections-cli.test.js
// 2. [Pattern]: Tests only the pure functions (sanitizeEntry/hasExtraKeys/CORE_FIELDS) exported
//    behind pending-corrections-cli.js's `require.main === module` guard — never the CLI's
//    argv/stdin plumbing itself, matching this repo's convention that CLI wrappers over a tested
//    lib module stay untested at the process/I/O level (see hooks/lib/ledger-cli.js, which has no
//    test file at all).
// 3. [Gotcha]: If pending-corrections-cli.js's schema (CORE_FIELDS) ever changes, item9 will catch
//    a mismatch between the sanitized output shape and CORE_FIELDS automatically — update the VALID
//    fixture object here to match, not just the production file.
'use strict';
const assert = require('assert');
const { sanitizeEntry, hasExtraKeys, CORE_FIELDS } = require('./pending-corrections-cli');

const VALID = { slug: 'foo-bar', description: 'd', count: 1, lastSeen: '2026-07-21', sessionIds: ['abc'] };

function item1_validEntryPassesThrough() {
  const result = sanitizeEntry(VALID);
  assert.deepStrictEqual(result, VALID, 'a fully valid entry is returned unchanged');
  console.log('item1_validEntryPassesThrough: passed');
}

function item2_extraKeyIsStripped() {
  const withStray = { ...VALID, stray: 'leak' };
  const result = sanitizeEntry(withStray);
  assert.deepStrictEqual(result, VALID, 'an entry with a valid core plus a stray key is stripped down to CORE_FIELDS only');
  assert.strictEqual(hasExtraKeys(withStray), true, 'hasExtraKeys detects the stray key');
  assert.strictEqual(hasExtraKeys(VALID), false, 'hasExtraKeys is false for an exactly-5-key entry');
  console.log('item2_extraKeyIsStripped: passed');
}

function item3_invalidSlugIsRejected() {
  assert.strictEqual(sanitizeEntry({ ...VALID, slug: '' }), null, 'empty slug is rejected');
  assert.strictEqual(sanitizeEntry({ ...VALID, slug: 42 }), null, 'non-string slug is rejected');
  console.log('item3_invalidSlugIsRejected: passed');
}

function item4_invalidDescriptionIsRejected() {
  assert.strictEqual(sanitizeEntry({ ...VALID, description: '' }), null, 'empty description is rejected');
  assert.strictEqual(sanitizeEntry({ ...VALID, description: null }), null, 'non-string description is rejected');
  console.log('item4_invalidDescriptionIsRejected: passed');
}

function item5_invalidCountIsRejected() {
  assert.strictEqual(sanitizeEntry({ ...VALID, count: 0 }), null, 'count: 0 is rejected (must be positive)');
  assert.strictEqual(sanitizeEntry({ ...VALID, count: -1 }), null, 'negative count is rejected');
  assert.strictEqual(sanitizeEntry({ ...VALID, count: 1.5 }), null, 'non-integer count is rejected');
  console.log('item5_invalidCountIsRejected: passed');
}

function item6_invalidLastSeenIsRejected() {
  assert.strictEqual(sanitizeEntry({ ...VALID, lastSeen: 12345 }), null, 'non-string lastSeen is rejected');
  console.log('item6_invalidLastSeenIsRejected: passed');
}

function item7_invalidSessionIdsIsRejected() {
  assert.strictEqual(sanitizeEntry({ ...VALID, sessionIds: null }), null, 'null sessionIds is rejected');
  assert.strictEqual(sanitizeEntry({ ...VALID, sessionIds: 'not-an-array' }), null, 'non-array sessionIds is rejected');
  assert.strictEqual(sanitizeEntry({ ...VALID, sessionIds: [1, 2] }), null, 'sessionIds with non-string elements is rejected');
  console.log('item7_invalidSessionIdsIsRejected: passed');
}

function item8_nonObjectInputIsRejected() {
  assert.strictEqual(sanitizeEntry(null), null, 'null input is rejected');
  assert.strictEqual(sanitizeEntry('a string'), null, 'non-object input is rejected');
  console.log('item8_nonObjectInputIsRejected: passed');
}

function item9_coreFieldsSchemaMatchesSanitizedShape() {
  assert.deepStrictEqual(Object.keys(sanitizeEntry(VALID)).sort(), [...CORE_FIELDS].sort(), 'sanitized output keys exactly match CORE_FIELDS');
  console.log('item9_coreFieldsSchemaMatchesSanitizedShape: passed');
}

function main() {
  item1_validEntryPassesThrough();
  item2_extraKeyIsStripped();
  item3_invalidSlugIsRejected();
  item4_invalidDescriptionIsRejected();
  item5_invalidCountIsRejected();
  item6_invalidLastSeenIsRejected();
  item7_invalidSessionIdsIsRejected();
  item8_nonObjectInputIsRejected();
  item9_coreFieldsSchemaMatchesSanitizedShape();
  console.log('pending-corrections-cli.test.js: all assertions passed');
}

main();

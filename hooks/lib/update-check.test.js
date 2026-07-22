// hooks/lib/update-check.test.js
// Unit tests for update-check.js's two pure decision functions (t3). No git/network/fs — both
// functions take plain data in and return plain data out, so cases are constructed inline.
'use strict';
const assert = require('assert');
const { isThrottled, buildAdvisory } = require('./update-check');

function item1_neverCheckedIsNotThrottled() {
  const result = isThrottled({ lastCheckedAt: undefined, now: Date.now() });
  assert.strictEqual(result, false, 'never-checked (lastCheckedAt undefined) must not be throttled');
  console.log('item1_neverCheckedIsNotThrottled: passed');
}

function item2_withinWindowIsThrottled() {
  const now = 1_000_000_000;
  const throttleMs = 6 * 60 * 60 * 1000;
  const lastCheckedAt = now - (throttleMs / 2); // halfway through the window
  const result = isThrottled({ lastCheckedAt, now, throttleMs });
  assert.strictEqual(result, true, 'a check inside the throttle window must be throttled');
  console.log('item2_withinWindowIsThrottled: passed');
}

function item3_outsideWindowIsNotThrottled() {
  const now = 1_000_000_000;
  const throttleMs = 6 * 60 * 60 * 1000;
  const lastCheckedAt = now - throttleMs - 1; // just past the window
  const result = isThrottled({ lastCheckedAt, now, throttleMs });
  assert.strictEqual(result, false, 'a check outside the throttle window must not be throttled');
  console.log('item3_outsideWindowIsNotThrottled: passed');
}

function item4_clockSkewIsThrottledFailSafe() {
  const now = 1_000_000_000;
  const lastCheckedAt = now + 1000; // lastCheckedAt in the "future" relative to now — clock skew
  const result = isThrottled({ lastCheckedAt, now });
  assert.strictEqual(result, true, 'clock skew (negative elapsed) must still be throttled — fail-safe direction');
  console.log('item4_clockSkewIsThrottledFailSafe: passed');
}

function item4b_exactBoundaryIsNotThrottled() {
  // review finding (gc-review 2026-07-22, Testing lens): pins the fail-open-at-boundary
  // behavior of the strict `<` comparison in update-check.js against silent regression.
  const now = 1_000_000_000;
  const throttleMs = 6 * 60 * 60 * 1000;
  const lastCheckedAt = now - throttleMs; // exactly at the boundary
  const result = isThrottled({ lastCheckedAt, now, throttleMs });
  assert.strictEqual(result, false, 'exact boundary (now - lastCheckedAt === throttleMs) must not be throttled');
  console.log('item4b_exactBoundaryIsNotThrottled: passed');
}

function item5_upToDateAdvisory() {
  const sha = 'abc123def456';
  const result = buildAdvisory({ localSha: sha, remoteSha: sha });
  assert.deepStrictEqual(result, { upToDate: true, advisoryText: null }, 'matching SHAs must report up to date with no advisory text');
  console.log('item5_upToDateAdvisory: passed');
}

function item6_behindAdvisory() {
  const result = buildAdvisory({ localSha: 'aaa111', remoteSha: 'bbb222' });
  assert.strictEqual(result.upToDate, false, 'differing SHAs must report not up to date');
  assert.strictEqual(typeof result.advisoryText, 'string', 'advisoryText must be a string when behind');
  assert.ok(result.advisoryText.length > 0, 'advisoryText must be non-empty when behind');
  assert.ok(result.advisoryText.includes('/gc-update'), 'advisoryText must mention /gc-update');
  console.log('item6_behindAdvisory: passed');
}

function main() {
  item1_neverCheckedIsNotThrottled();
  item2_withinWindowIsThrottled();
  item3_outsideWindowIsNotThrottled();
  item4_clockSkewIsThrottledFailSafe();
  item4b_exactBoundaryIsNotThrottled();
  item5_upToDateAdvisory();
  item6_behindAdvisory();
  console.log('update-check.test.js: all assertions passed');
}

main();

// hooks/lib/pending-corrections.test.js
// @ai-rules:
// 1. [Constraint]: Node built-ins only (assert, fs, os, path) — no test framework, matching this
//    repo's zero-external-dependency convention. Run directly: node hooks/lib/pending-corrections.test.js
// 2. [Pattern]: Fresh fs.mkdtempSync temp dir per test function, cleaned up with fs.rmSync at the
//    end of that same function — never share a cwd across test items.
// 3. [Gotcha]: item2 (unparseable text) and item2b (valid JSON that isn't an array) are deliberately
//    separate cases — they fail in different try/catch blocks inside readPending (JSON.parse vs.
//    Array.isArray) and must both stay covered if that function's shape ever changes.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pendingCorrectionsPath, readPending, writePending } = require('./pending-corrections');

function freshCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pending-corrections-test-'));
}

function item1_readAbsentReturnsEmptyArray() {
  const cwd = freshCwd();
  assert.deepStrictEqual(readPending(cwd), [], 'readPending returns [] when the file does not exist');
  fs.rmSync(cwd, { recursive: true, force: true });
  console.log('item1_readAbsentReturnsEmptyArray: passed');
}

function item2_readCorruptReturnsEmptyArray() {
  const cwd = freshCwd();
  const p = pendingCorrectionsPath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'not valid json{{{');
  assert.deepStrictEqual(readPending(cwd), [], 'readPending returns [] on unparseable content, never throws');
  fs.rmSync(cwd, { recursive: true, force: true });
  console.log('item2_readCorruptReturnsEmptyArray: passed');
}

function item2b_readValidJsonNonArrayReturnsEmptyArray() {
  // Distinct from item2: this is *valid* JSON that parses cleanly but isn't an array — a plausible
  // corruption shape (partial write racing a reader, a stray object from a future bug) that takes a
  // different code path than unparseable text (fails the Array.isArray check, not the JSON.parse try).
  const cwd = freshCwd();
  const p = pendingCorrectionsPath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ not: 'an array' }));
  assert.deepStrictEqual(readPending(cwd), [], 'readPending returns [] when the file holds valid JSON that is not an array');
  fs.rmSync(cwd, { recursive: true, force: true });
  console.log('item2b_readValidJsonNonArrayReturnsEmptyArray: passed');
}

function item3_writeThenReadRoundtrips() {
  const cwd = freshCwd();
  const entries = [{ slug: 'foo-bar', description: 'd', count: 1, lastSeen: '2026-07-21', sessionIds: ['abc'] }];
  const ok = writePending(cwd, entries);
  assert.strictEqual(ok, true, 'writePending returns true on success');
  assert.deepStrictEqual(readPending(cwd), entries, 'readPending returns exactly what was written');
  fs.rmSync(cwd, { recursive: true, force: true });
  console.log('item3_writeThenReadRoundtrips: passed');
}

function item4_writeEmptyArrayRoundtrips() {
  const cwd = freshCwd();
  const ok = writePending(cwd, []);
  assert.strictEqual(ok, true, 'writePending accepts an empty array');
  assert.deepStrictEqual(readPending(cwd), [], 'readPending reads back an empty array (not absent)');
  fs.rmSync(cwd, { recursive: true, force: true });
  console.log('item4_writeEmptyArrayRoundtrips: passed');
}

function item5_pathIsUnderConstructLedger() {
  const cwd = freshCwd();
  const p = pendingCorrectionsPath(cwd);
  assert.ok(p.includes(path.join('.construct', 'ledger')), 'store path lives under .construct/ledger, alongside facts.ndjson');
  assert.ok(p.endsWith('pending-corrections.json'));
  fs.rmSync(cwd, { recursive: true, force: true });
  console.log('item5_pathIsUnderConstructLedger: passed');
}

function main() {
  item1_readAbsentReturnsEmptyArray();
  item2_readCorruptReturnsEmptyArray();
  item2b_readValidJsonNonArrayReturnsEmptyArray();
  item3_writeThenReadRoundtrips();
  item4_writeEmptyArrayRoundtrips();
  item5_pathIsUnderConstructLedger();
  console.log('pending-corrections.test.js: all assertions passed');
}

main();

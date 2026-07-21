// hooks/lib/atomic-write.test.js
// Code-review fix (Testing lens finding: the shared atomicWrite primitive, depended on by 8 call
// sites across 3 production files, shipped with only ad-hoc node -e scratch probes, not a
// persisted regression test). Minimal, proportionate coverage: happy path, a forced write failure
// (unlink + loud stderr, boolean false return, never throws), and the retry actually firing.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { atomicWrite } = require('./atomic-write');

function freshDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-test-'));
}

function item1_happyPath() {
  const tmpDir = freshDir();
  const dest = path.join(tmpDir, 'x.json');
  const ok = atomicWrite(dest, '{"ok":true}');
  assert.strictEqual(ok, true, 'atomicWrite returns true on success');
  assert.strictEqual(fs.readFileSync(dest, 'utf8'), '{"ok":true}', 'content written correctly');
  const tmpFilesInRoot = fs.readdirSync(tmpDir).filter(e => e !== '.tmp' && e.endsWith('.tmp'));
  assert.strictEqual(tmpFilesInRoot.length, 0, 'no stray *.tmp FILE in the destination directory itself (the .tmp/ staging directory itself is expected and excluded)');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item1_happyPath: passed');
}

function item2_destDirCreatedIfAbsent() {
  const tmpDir = freshDir();
  const dest = path.join(tmpDir, 'nested', 'deep', 'x.json');
  const ok = atomicWrite(dest, '{"ok":true}');
  assert.strictEqual(ok, true, 'atomicWrite creates missing parent directories and succeeds');
  assert.strictEqual(fs.readFileSync(dest, 'utf8'), '{"ok":true}', 'content written correctly at nested path');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item2_destDirCreatedIfAbsent: passed');
}

function item3_failureReturnsFalseNeverThrowsAndUnlinksTemp() {
  const tmpDir = freshDir();
  // Destination is a directory, not a file — fs.renameSync(tmp, destDir) fails with EISDIR/EPERM,
  // giving a real, reproducible failure without mocking fs internals.
  const destAsDir = path.join(tmpDir, 'blocked.json');
  fs.mkdirSync(destAsDir);
  let ok;
  assert.doesNotThrow(() => { ok = atomicWrite(destAsDir, '{"never":"written"}'); }, 'atomicWrite never throws, even on a real write/rename failure');
  assert.strictEqual(ok, false, 'atomicWrite returns false on failure');
  const tmpDirPath = path.join(tmpDir, '.tmp');
  const leftoverTmpFiles = fs.existsSync(tmpDirPath) ? fs.readdirSync(tmpDirPath) : [];
  assert.strictEqual(leftoverTmpFiles.length, 0, 'no orphaned .tmp file survives a failed write (unlink-on-failure ran for both attempts)');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item3_failureReturnsFalseNeverThrowsAndUnlinksTemp: passed');
}

function item4_retryActuallyFires() {
  // Confirms the bounded retry loop (RETRIES=1) actually attempts twice on a persistent failure,
  // not just once — same destAsDir setup as item3, but measuring elapsed time to confirm the
  // sleepSync(25ms) backoff between attempt 1 and attempt 2 genuinely occurred.
  const tmpDir = freshDir();
  const destAsDir = path.join(tmpDir, 'blocked.json');
  fs.mkdirSync(destAsDir);
  const start = Date.now();
  const ok = atomicWrite(destAsDir, '{"never":"written"}');
  const elapsedMs = Date.now() - start;
  assert.strictEqual(ok, false, 'still returns false after exhausting retries');
  assert.ok(elapsedMs >= 20, `retry backoff actually elapsed real time (saw ${elapsedMs}ms, expected >=20ms for one 25ms sleepSync call)`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('item4_retryActuallyFires: passed');
}

function main() {
  item1_happyPath();
  item2_destDirCreatedIfAbsent();
  item3_failureReturnsFalseNeverThrowsAndUnlinksTemp();
  item4_retryActuallyFires();
  console.log('atomic-write.test.js: all assertions passed');
}

main();

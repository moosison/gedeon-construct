// hooks/lib/atomic-write.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Single write-tmp-then-rename primitive for every .construct/ writer in this repo.
// Temp lives in {destDir}/.tmp/ — same volume as destPath (renameSync's atomicity
// requirement), never destPath's own directory, so a directory listing of destPath's
// parent never needs to filter out temp siblings. On failure: best-effort unlink of the
// dangling tmp, one bounded retry after a short sync sleep (Atomics.wait — no async
// available in this sync-only call chain), then a loud, non-silent stderr report and a
// `false` return — callers already handle a failed write via their own existing
// catch/return-null path; this function never throws.
function sleepSync(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}

function atomicWrite(destPath, content) {
  const destDir = path.dirname(destPath);
  const tmpDir = path.join(destDir, '.tmp');
  const basename = path.basename(destPath);
  // lean: RETRIES=1 / RETRY_DELAY_MS=25 are asserted against the live-observed failure signature
  // (Windows renameSync EBUSY/EPERM under transient lock contention — AV scan, indexer, a
  // concurrent session's own Stop hook), not empirically tuned against a measured lock-hold
  // duration; ceiling = if orphans keep appearing post-deploy, the lock is held longer than one
  // 25ms retry covers; upgrade path = exponential backoff (25/75/225ms) or a 2nd retry, if the
  // one-time sweep (t6) or code review ever shows this single retry proving insufficient in
  // practice.
  const RETRIES = 1;
  const RETRY_DELAY_MS = 25;
  let lastErr = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    let tmpPath = null;
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      tmpPath = path.join(tmpDir, `${basename}.${crypto.randomBytes(4).toString('hex')}.tmp`);
      fs.writeFileSync(tmpPath, content);
      fs.renameSync(tmpPath, destPath);
      return true;
    } catch (e) {
      lastErr = e;
      if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch {} }
      if (attempt < RETRIES) sleepSync(RETRY_DELAY_MS);
    }
  }
  try {
    process.stderr.write(`[gedeon-construct] atomic-write: failed writing ${destPath} after ${RETRIES + 1} attempt(s): ${lastErr && lastErr.message}\n`);
  } catch {}
  return false;
}

module.exports = { atomicWrite };

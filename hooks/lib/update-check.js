// hooks/lib/update-check.js
'use strict';

// Pure update-advisory decision logic — no git, network, or fs calls in this module.
// isThrottled() gates whether a check should run at all; buildAdvisory() only ever
// runs after a real check has fetched both SHAs. Kept as two single-purpose functions
// (round-2 Lean split) rather than one combined call so neither needs an undefined-SHA
// case to handle.

function isThrottled({ lastCheckedAt, now, throttleMs = 6 * 60 * 60 * 1000 }) {
  if (lastCheckedAt == null) return false; // never checked — never throttled
  return now - lastCheckedAt < throttleMs;
}

function buildAdvisory({ localSha, remoteSha }) {
  const upToDate = localSha === remoteSha;
  return {
    upToDate,
    advisoryText: upToDate ? null : 'A Gedeon Construct update is available — run /gc-update to install it.',
  };
}

module.exports = { isThrottled, buildAdvisory };

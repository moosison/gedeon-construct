// hooks/lib/ui-intent.test.js
// Run: node hooks/lib/ui-intent.test.js
'use strict';
const assert = require('assert');
const { matchesUiIntent } = require('./ui-intent');

// Should FLAG (design/frontend intent) — includes the plural/compound cases a bare trailing \b missed.
const shouldMatch = [
  'redesign the dashboard layout',
  'add some buttons to the page',   // plural — the code-review HIGH regression
  'these components need work',     // plural
  'update the screens',             // plural
  'new mockups please',             // plural
  'the wireframes are stale',       // plural
  'restyle the nav',
  'improve the GUI',                // glued abbreviation
  'fix the CSS',
  'make it responsive',
];

// Should stay SILENT — includes short-token boundary traps that must NOT match.
const shouldNotMatch = [
  'fix the JSON parser',
  'refactor the auth module',
  'rename this variable',
  'the building collapsed',         // "ui" inside "building" must NOT match
  'read the guide carefully',       // "gui" inside "guide" must NOT match
  '',
];

for (const s of shouldMatch) assert(matchesUiIntent(s), `expected MATCH: "${s}"`);
for (const s of shouldNotMatch) assert(!matchesUiIntent(s), `expected NO match: "${s}"`);
assert(!matchesUiIntent(null) && !matchesUiIntent(undefined) && !matchesUiIntent(42), 'non-string → false');

console.log(`ui-intent.test: ${shouldMatch.length + shouldNotMatch.length + 1} cases passed`);

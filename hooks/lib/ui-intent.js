// hooks/lib/ui-intent.js
// @ai-rules:
// 1. [Constraint]: Zero external deps — pure logic, no I/O. Unit-tested via ui-intent.test.js.
// 2. [Pattern]: Over-inclusive by design — recall over precision. gc-plan Step 1.5's context-aware
//    judgment is the precision filter; this matcher must NOT try to be precise.
'use strict';

// Over-inclusive UI/UX/frontend intent detector.
//   - Leading \b protects the short/ambiguous tokens (ui, ux, gui, css) from matching INSIDE unrelated
//     words (e.g. "building", "guide") — the char before them must be a boundary.
//   - Trailing `s?\b` admits ordinary English plurals ("buttons", "components", "screens", "dashboards")
//     that a bare trailing \b would silently miss — the regression a code review caught. See ui-intent.test.js.
const UI_KEYWORDS = /\b(?:ui|ux|gui|user interface|user experience|frontend|front-end|layout|redesign|restyle|re-skin|component|screen|wireframe|mockup|responsive|theme|look and feel|css|styling|stylesheet|button|dashboard|visual)s?\b/i;

function matchesUiIntent(prompt) {
  return typeof prompt === 'string' && prompt.length > 0 && UI_KEYWORDS.test(prompt);
}

module.exports = { matchesUiIntent, UI_KEYWORDS };

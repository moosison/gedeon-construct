<!-- skills/gc-uiux-review/references/render-ladder.md -->

# The Render Ladder — how to see the UI, honestly

A visual audit is only as good as what the reviewer actually saw. The ceiling is a real rendered view; the
floor is code-only. **The rule that matters most:** whatever tier you reach, the report must enumerate which
visual checks ran and which did not. A bare "audited" with no ran/didn't-run manifest is forbidden — silent
degradation (claiming a visual pass while only reading code) is exactly how a broken UI ships past a green
review.

## Climb from the top; stop at the first tier available

1. **Behavioral (real browser)** — if the project can serve its own UI, drive a real browser and capture at
   representative widths (a narrow/mobile and a wide/desktop at least). Use the **project's own run
   conventions** — ask the user or detect them (a dev-server script, a static entry point). **Never assume a
   fixed port or a specific tool.** This tier can check layout, color, spacing, hierarchy, and motion
   directly.
2. **Static open** — if the output is static HTML/CSS with no server, open the file directly in a browser and
   capture. Most visual checks still apply; anything requiring live data or interaction is downgraded.
3. **Code-only** — if neither is possible this session, audit from the source. Copywriting, state coverage,
   token usage, and structure are all checkable; anything about *rendered* appearance (real contrast, real
   spacing rhythm, actual motion) **cannot** be — and the report must say so, per pillar.

If the top applicable tier's tooling is unavailable, say so and drop one rung: `render tier: behavioral
unavailable ({reason}) — using static-open`. Report the tier reached and the didn't-run list in the review.

## Environment-specific worked example (NOT the contract — an illustration)

One zero-install way to reach the behavioral tier, proven in this project's cockpit work
(`reference_cockpit_realbrowser_cdp`, cockpit v1.2): drive the system browser headless over its debugging
protocol from a script, navigate to the served UI, read computed styles / bounding boxes, and screenshot at
each width. This is **one mechanism among many** — it belongs here as an example, not in the reviewer's
neutral core, because the core must never bind to a particular tool or OS. Use whatever the host session
actually offers (a `/verify`-style skill, a browser automation tool, or this CDP path).

## Screenshot safety (always, before the first capture)

Confirm the capture directory is gitignored before capturing anything — binary screenshots must never reach
a commit. If no ignore rule covers it, add one first.

## Data-shape caveat (learned the hard way)

Injecting synthetic data verifies *rendering*, not *data semantics*. When a pillar's finding depends on real
values (a real context-fill percentage, a real token count), drive a real flow — a synthetic fixture that
renders cleanly can hide a semantics bug (the v1.1 cockpit gauge shipped a false 100% exactly this way).

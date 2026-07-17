<!-- skills/gc-uiux/references/motion.md -->
<!--
Provenance (Attribution milestone — idea-inspiration, rewritten from principle):
  - emilkowalski/skills (Motion) — https://github.com/emilkowalski/skills — MIT — read 2026-07-17
      (referenced ideas: motion as a design-engineering discipline, a "where does motion help" test,
       a category-based animation audit, Apple's motion principles adapted to the web)
-->

# Motion & Interaction

Motion is a **control-law** tool, not decoration: it directs attention, explains state change, and gives
the interface physical credibility. Over-applied, it becomes the loudest tell that something is machine-made.
The design skill's Build phase reads this file; `gc-uiux-reviewer`'s pillar 7 audits against the pinned
category set below.

## Where motion genuinely helps (apply this test before adding any)

Motion earns its place only when it does one of these — otherwise cut it:

- **Explains a change** — an element enters/leaves/reorders and the motion shows *where it came from or went*.
- **Preserves continuity** — a shared element moving between states keeps the user oriented (no hard cut).
- **Directs attention** — one deliberate movement pulls the eye to what changed or what to do next.
- **Confirms cause and effect** — an action produces immediate, proportional feedback (<100ms to start).

If a proposed animation does none of these, it is ambient decoration; hold it to a very high bar and
usually remove it. Respect `prefers-reduced-motion` always — the experience must be complete without motion.

## Vocabulary (use precise terms when directing or reviewing)

- **Easing** — the acceleration curve. Default to natural ease-out for entrances, ease-in for exits;
  reserve spring/overshoot for genuinely playful subjects (never on routine UI — see `anti-slop.md`).
- **Duration** — short (100–200ms) for feedback, medium (200–400ms) for transitions; long orchestration
  is a deliberate signature, not a default.
- **Physicality** — objects have mass and momentum; they don't teleport or move linearly at constant speed.
- **Staging / orchestration** — sequence related elements with small offsets rather than moving everything
  at once; one orchestrated moment beats scattered effects.

## Pinned audit-category set (gc-uiux-reviewer pillar 7 reuses this VERBATIM)

The reviewer's Motion & Interaction pillar scores against exactly these eight categories:

1. **Easing** — natural curves; no dated bounce/elastic on routine UI.
2. **Duration** — proportional to the change; nothing sluggish or subliminal.
3. **Physicality** — momentum and mass respected; no teleporting or constant-velocity slides.
4. **Accessibility / reduced-motion** — `prefers-reduced-motion` honored; no motion-only information.
5. **Cohesion** — one motion language across the interface, not per-component improvisation.
6. **Purpose / where-it-helps** — every animation passes the test above; no ambient decoration.
7. **Performance** — animates compositor-friendly properties (transform/opacity); no layout thrash/jank.
8. **Restraint** — motion is spent where it matters; the interface is calm at rest.

<!-- skills/gc-uiux/references/component-libraries.md -->

# Component Libraries — Known Options, Consult Only

This is a lookup table for the **detect stack** step (`SKILL.md` Activation #2) and Phase 4 (Build): what
exists, what each is actually good at, and when reaching for it beats hand-rolling. It names tools because
these are concrete build-time choices for a React/Next stack, not a substitute for the taste and
alarm-limit rules that still govern everything produced with them — a component pulled from any of these is
still subject to `anti-slop.md` and the Phase 2 anti-default self-critique. Shipping a library's defaults
unchanged is exactly the "signals default component output" failure `anti-slop.md` already rejects; treat
every entry below as a starting point to push through tokens and a signature element, never as the finish line.

## The five

- **shadcn/ui** ([`shadcn-ui/ui`](https://github.com/shadcn-ui/ui)) — the foundational building block, not
  a finished look. Copy-in (not npm-installed) Radix/Base UI component source, unstyled enough to take this
  project's tokens directly. Reach for it as the base layer for a React/Next build when there's no existing
  design system; never ship its default theme as the final surface — that default is now common enough to
  read as a template on sight.
- **21st.dev** ([`serafimcloud/21st`](https://github.com/serafimcloud/21st)) — an open, community-driven
  marketplace/registry of shadcn/ui-compatible components ("copy, ship, repeat"). Useful for filling in
  common, low-signature patterns (tables, settings panels, form shells) fast; not where the signature
  element should come from — spend that boldness on something derived from the subject, not picked off a
  marketplace.
- **Aceternity UI** ([ui.aceternity.com](https://ui.aceternity.com/), by Manu Arora) — complex, visually
  rich sections (hero headers, glowing cards, bento grids, shader effects) built with Framer Motion and
  Tailwind. A candidate when the direction calls for a high-motion, high-polish hero or landing treatment;
  verify against `motion.md`'s where-does-it-help test before adopting an effect wholesale — a glow that
  doesn't serve this subject is decoration, not a signature.
- **Magic UI** ([`magicuidesign/magicui`](https://github.com/magicuidesign/magicui)) — high-impact
  animations, interactive cards, and background visual effects for modern landing pages. Same caution as
  Aceternity: strong for landing-page work specifically, and still subject to the motion-discipline and
  anti-default checks — don't let the library's aesthetic become the project's aesthetic by default.
- **Motion Primitives** ([`ibelick/motion-primitives`](https://github.com/ibelick/motion-primitives)) —
  lightweight, copy-paste Framer Motion primitives (accordions, dialogs, smooth text effects) for the
  interaction level, not just hero sections. Good source for the small transitions the interaction-state
  matrix (`ux.md`) calls for — hover, focus, load-in — where a hand-rolled equivalent would just reinvent
  easing curves.

## How to use this table

1. Detect the stack first — these are React/Next-ecosystem tools; irrelevant off-stack.
2. Pick by **task**, not by preference: shadcn/21st.dev for structural/foundational components, Aceternity/
   Magic UI for landing-page moments, Motion Primitives for micro-interactions.
3. Whatever is copied in gets run through Phase 2's tokens and signature-element step before it ships —
   a library gives you structure and motion, never the project's visual identity.

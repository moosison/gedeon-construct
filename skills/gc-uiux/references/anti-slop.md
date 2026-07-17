<!-- skills/gc-uiux/references/anti-slop.md -->
<!--
Provenance (for the Attribution milestone — idea-inspiration, rewritten from principle, not copied):
  - pbakaus/impeccable — https://github.com/pbakaus/impeccable — Apache-2.0 — read 2026-07-17
      (referenced idea: a deterministic set of "AI-slop" tells to avoid — tinted neutrals, gray-on-color, easing discipline)
  - Anthropic frontend-design — marketplace skill — Apache-2.0 — read 2026-07-17
      (referenced idea: the recurring AI-default aesthetic clusters to steer away from)
  Every rule below is written from the principle it encodes, in this project's own control-theory vocabulary.
-->

# Anti-Slop — Alarm Limits

These are **alarm limits**, not preferences: invariants that hold at *every* dial setting and *every*
visual direction. A project's `DESIGN.md` chooses setpoints (variance, motion, density) and a direction;
it can never dial itself out of these. Both the design skill and `gc-uiux-reviewer` read this file — the
reviewer applies it **unconditionally, independent of the brief**. When one trips, name it and correct it;
do not rationalize it as "the chosen aesthetic."

## Why these exist

Left free, a generative process converges on a small set of confident, templated looks — competent, and
instantly recognizable as machine-made. The purpose of a limit here is not taste; it is to keep the output
*outside* that convergence basin so the actual design choices (made from the control law) can be seen.

## The limits

1. **Neutrals are tinted, never pure.** Pure `#000`/`#fff`/neutral grays read as unconsidered. Push every
   neutral a few degrees toward the palette's temperature. A "black" is a very dark brand hue, not `#000`.
2. **Never gray text on a colored fill.** It muddies and signals default component output. On color, text is
   a tint/shade of that color or a deliberate contrast pair — never a neutral gray dropped on top.
3. **Contrast is a floor, not a target.** Meet WCAG AA as a minimum and then make the type legible on its
   own terms; passing a ratio is not the same as reading well.
4. **Easing has intent.** No dated bounce/elastic on ordinary UI motion. Motion uses restrained, natural
   easing; anything springier must be justified by the subject (see `motion.md`).
5. **No decorative gradient clichés.** The purple→blue "AI gradient," and rounded-square gradient icon
   tiles, are tells. A gradient must encode something real (depth, a physical material, data), or it's out.
6. **Radius and shadow are decisions, not defaults.** One considered radius scale and one considered
   elevation scale. Uniform medium radius + soft drop shadow on every card is the template signature.
7. **Steer clear of the three AI-default rooms** unless the brief explicitly asks for one: (a) warm cream
   background + high-contrast serif + terracotta accent; (b) near-black + a single acid-green/vermilion
   accent; (c) hairline-ruled broadsheet, zero radius, dense columns. Each is legitimate *as a choice for a
   specific brief* — never as the place you land by default, and never independent of the subject.
8. **One idea carries the page.** Spend boldness once (the signature element); keep everything around it
   quiet. Decoration that serves nothing is removed — the "take one accessory off before leaving" rule.

## How the reviewer uses this

Each limit is a checkable observation, not a vibe: *is any neutral pure? is gray text sitting on a fill?
is the accent a purple→blue gradient? is bounce easing on a non-playful transition?* A trip is a WARNING at
minimum (BLOCKER when it breaks the page's one job), independent of what the `DESIGN.md` setpoints say.

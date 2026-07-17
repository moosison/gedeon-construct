<!-- skills/gc-uiux/references/design-brief-template.md -->

# DESIGN.md — Template

The design skill's Phase 1 writes or updates a project's `DESIGN.md` from this template. It is the
**setpoint record**: the single place a project states who it's for, what it must feel like, and — as
important — what it must *not* look like. `gc-uiux-reviewer` reads it as the baseline it scores fit against.

Ship this as the template; each consuming project owns its filled-in `DESIGN.md`. Keep it short — a record,
not an essay. Leave a section blank only after deciding it genuinely doesn't apply, not by default.

---

```markdown
# DESIGN — {project name}

## Subject & job
- **Subject:** what this product/page actually is (one concrete sentence).
- **Audience:** who uses it, their context and skill level.
- **The one job:** the single thing this screen must let them do.

## Dials (see visual-directions.md — set each independently)
- **Layout variance:** low | mid | high
- **Motion intensity:** low | mid | high
- **Visual density:** low | mid | high
- **Dial tension (if any):** name any combination that could read as incoherent, and how it resolves.

## Direction
- **Chosen direction:** a named preset (soft | minimalist | brutalist) OR a custom direction described
  in the subject's own terms. Custom is a first-class choice.
- **Why this, not the default:** one line — what makes it specific to this subject rather than a template.

## Anti-references (the most useful section — what this must NOT look like)
- 2–4 concrete "not this" statements (a look, a product, a cliché to avoid). The alarm limits in
  anti-slop.md are always in force on top of these.

## Tokens (once decided)
- **Palette:** 4–6 named hex values (neutrals tinted, per anti-slop.md).
- **Type:** display face + body face (+ utility face if needed), with roles and a scale.
- **Signature element:** the one thing this design is remembered by.

## States & flows (see ux.md)
- Key user flow(s) in one line each; the interaction-state matrix for the primary component(s).
```

---

**Discovery:** `gc-uiux` and `gc-uiux-review` locate this file by a search order (project root, then a
detected planning directory), never a single hard-coded path — see the review skill for the exact order.

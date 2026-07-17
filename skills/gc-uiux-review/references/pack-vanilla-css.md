<!-- skills/gc-uiux-review/references/pack-vanilla-css.md -->

# Stack Pack — Vanilla CSS (opt-in)

**Selected when the reviewer detects plain CSS** (stylesheets / `<style>`, no utility framework) — the
cockpit's own stack, and the portable default. Framework-specific class names never appear in the reviewer's
neutral core; concrete detectors live here. Every check is a *floor*: a grep surfaces candidates, a human read
confirms. Scope the searches to the stylesheets and markup under review.

## Color pillar

```bash
# Hardcoded colors vs. custom properties (a token system uses var(--...))
grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(' src   # raw colors
grep -rnE 'var\(--[a-z-]*colou?r|var\(--(bg|fg|accent|surface)' src   # tokenized colors
# Pure (untinted) neutrals — an alarm-limit smell
grep -rnE '#000000|#000\b|#fff\b|#ffffff|rgb\(0, ?0, ?0\)' src
```

## Typography pillar

```bash
# Distinct font-size declarations (flag many one-off values — no scale)
grep -rEoh 'font-size:\s*[^;]+' src | sort | uniq -c | sort -rn
# Distinct font-weight declarations
grep -rEoh 'font-weight:\s*[^;]+' src | sort -u
```

## Spacing pillar

```bash
# Spacing values in use — look for a consistent step scale vs. arbitrary numbers
grep -rEoh '(margin|padding|gap)[^:]*:\s*[^;]+' src | sort | uniq -c | sort -rn | head -20
```

## Visuals — corner-radius / elevation / layout

```bash
# Radius and box-shadow value spread (many distinct values = accumulation, not a scale)
grep -rEoh 'border-radius:\s*[^;]+|box-shadow:\s*[^;]+' src | sort | uniq -c | sort -rn
```

## Motion pillar

```bash
# Transitions/animations present, and easing/duration hygiene
grep -rnE 'transition:|animation:|@keyframes' src
grep -rnE 'cubic-bezier\(|ease-|linear|steps\(' src            # easing choices
grep -rnE 'prefers-reduced-motion' src                          # reduced-motion respected?
```

## Experience-design pillar

```bash
# Focus visibility (a keyboard-navigation requirement)
grep -rnE ':focus(-visible)?' src
# State classes / attributes
grep -rnE '\bdisabled\b|aria-disabled|\[hidden\]|is-loading|is-error|is-empty' src
```

Route every confirmed hit to the matching pillar as cited evidence; a grep count is never a score by itself.

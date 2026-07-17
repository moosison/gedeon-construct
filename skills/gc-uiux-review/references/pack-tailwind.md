<!-- skills/gc-uiux-review/references/pack-tailwind.md -->

# Stack Pack — Tailwind (opt-in)

**Selected only when the reviewer detects a Tailwind stack** (a `tailwind.config.*`, or utility classes in the
markup). This is the one place framework-specific class names appear — the reviewer's neutral core stays
stack-agnostic and delegates concrete detection here. Every check below is a *floor*: a grep surfaces
candidates; a human read confirms. Treat hits as evidence to inspect, not automatic findings.

Scope the searches to the source under review (adjust the path/globs to the project).

## Color pillar

```bash
# Accent overuse — count distinct elements using the accent utilities
grep -rEoh 'text-(primary|accent)|bg-(primary|accent)|border-(primary|accent)' src | sort | uniq -c | sort -rn
# Hardcoded colors bypassing tokens
grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\(' src --include='*.tsx' --include='*.jsx' --include='*.css'
# Gray text on a colored fill (inspect each hit against its container)
grep -rnE 'text-(gray|slate|zinc|neutral)-[0-9]+' src
```

## Typography pillar

```bash
# Distinct type sizes actually in use (flag if more than ~4)
grep -rEoh 'text-(xs|sm|base|lg|xl|[2-9]?xl)' src | sort -u
# Distinct weights (flag if more than ~2-3)
grep -rEoh 'font-(thin|light|normal|medium|semibold|bold|extrabold|black)' src | sort -u
```

## Spacing pillar

```bash
# Spacing rhythm — the distribution of padding/margin/gap steps
grep -rEoh '(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|gap|space)-[0-9]+' src | sort | uniq -c | sort -rn | head -20
# Arbitrary one-off values escaping the scale
grep -rnE '\[[0-9]+(px|rem|em)\]' src
```

## Visuals / corner-radius / elevation

```bash
# Radius and shadow consistency — flag many distinct values (accumulation, not a scale)
grep -rEoh 'rounded(-[a-z0-9]+)?|shadow(-[a-z0-9]+)?' src | sort | uniq -c | sort -rn
```

## Experience-design pillar

```bash
# State coverage in components
grep -rnE 'isLoading|loading|Skeleton|Spinner' src   # loading
grep -rnE 'isError|ErrorBoundary|catch\s*\(' src      # error
grep -rnE 'isEmpty|length === 0|No .* found' src       # empty
grep -rnE 'disabled' src                               # disabled
```

Feed every confirmed hit back to the matching pillar as cited evidence; never report a raw grep count as a
score on its own.

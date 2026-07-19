<!-- skills/gc-uiux-review/references/pack-rn-nativewind.md -->

# Stack Pack — React Native / NativeWind (opt-in)

**Selected when the reviewer detects a React-Native / NativeWind stack** (a direct `package.json` dependency on
`react-native`, `expo`, `nativewind`, or `react-native-web`). NativeWind styles via Tailwind class names on
`className`, so the color/spacing/radius utility greps from the Tailwind pack largely carry over — but this is
**not** a web target: react-native-web has no CSS cascade for raw classes and exposes **no DOM ARIA roles**, and
native builds have no DOM at all. So specific web idioms are dead here and are re-expressed as React-Native
styles. **Caveat:** a StyleSheet-only RN app with no NativeWind won't fire the carried *class-based* greps at
all — for that sub-case the StyleSheet / style-prop detectors below are the relevant ones; the "carry over"
framing applies only where NativeWind classes are actually in use.

This pack's sections are named to match the reviewer's scored pillars (Color, Typography, Spacing, Visuals &
hierarchy, Motion & interaction, Experience design) so every confirmed hit files 1:1 onto a scorecard row. RTL
is handled as a **cross-cutting lens** (last section) whose every detector routes to one of those named pillars
— it is not a separate pillar. As in the sibling packs, every check below is a *floor*: a grep surfaces
candidates, a human read confirms. Treat hits as evidence to inspect, not automatic findings. Scope the searches
to the source under review (adjust the path/globs to the project).

## Color

```bash
# Accent overuse — count distinct elements using the accent utilities (NativeWind classes)
grep -rEoh 'text-(primary|accent)|bg-(primary|accent)|border-(primary|accent)' src | sort | uniq -c | sort -rn
# Hardcoded colors bypassing tokens — in classes AND in RN style props / StyleSheet (no CSS cascade to catch these)
grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\(' src --include='*.tsx' --include='*.jsx' --include='*.ts'
# Inline color props and StyleSheet color literals that escape the token system (RN-specific — no className involved)
grep -rnE '(color|backgroundColor|borderColor|tintColor)\s*:\s*[^,}]+' src
```

## Typography

```bash
# tabular-nums as a CLASS is DEAD in RN — className cannot apply a raw CSS class. This is scoped to the
# className context on purpose, so it flags ONLY the dead class usage — NOT the correct fontVariant style below.
grep -rnE 'className\s*=\s*"[^"]*\btabular\b' src                  # DEAD: `tabular`/`tabular-nums` inside a className — NativeWind can't apply it; use a fontVariant style
grep -rnE "fontVariant\s*:\s*\[?\s*['\"]tabular-nums" src          # the CORRECT idiom — presence is good; a dead className above with none of these is the smell
# Distinct weights — via NativeWind classes AND via the RN fontWeight style prop
grep -rEoh 'font-(thin|light|normal|medium|semibold|bold|extrabold|black)' src | sort -u
grep -rnE 'fontWeight\s*:' src
```

## Spacing

```bash
# NativeWind spacing rhythm — distribution of padding/margin/gap steps (carries from the Tailwind pack)
grep -rEoh '(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|gap|space)-[0-9]+' src | sort | uniq -c | sort -rn | head -20
# Arbitrary one-off class values escaping the scale
grep -rnE '\[[0-9]+(px|rem|em)?\]' src
# Numeric spacing baked into StyleSheet / style props (RN has no rem — raw numbers; look for a consistent step)
grep -rEoh '(margin|padding|gap)[A-Za-z]*\s*:\s*[0-9]+' src | sort | uniq -c | sort -rn | head -20
```

## Visuals & hierarchy

```bash
# Radius + elevation consistency — NativeWind classes carry; ADD the RN StyleSheet + platform-split idioms
grep -rEoh 'rounded(-[a-z0-9]+)?|shadow(-[a-z0-9]+)?' src | sort | uniq -c | sort -rn
grep -rnE 'borderRadius\s*:' src                                  # RN StyleSheet radius values — flag many distinct = accumulation
grep -rnE '\belevation\s*:|shadowColor\s*:|shadowOpacity\s*:|shadowRadius\s*:' src   # platform-split shadow: elevation (Android) vs shadow* (iOS)
```

## Motion & interaction

RN's motion story differs from the web's — score the reviewer's pinned Motion categories (easing, duration,
accessibility/reduced-motion, performance, restraint) against RN idioms, not CSS ones.

```bash
# Animation source + easing/duration hygiene (RN Animated / Reanimated — the analog of CSS transition/easing)
grep -rnE '\bAnimated\.|react-native-reanimated|withTiming|withSpring|Easing\.' src
grep -rnE '\bduration\s*:\s*[0-9]+' src                            # duration hygiene — flag ad-hoc/long values
# useNativeDriver — an RN motion-performance smell when absent on transform/opacity animations
grep -rnE 'useNativeDriver\s*:' src
# Reduced-motion: the RN idiom is AccessibilityInfo, NOT the web-only prefers-reduced-motion (which cannot appear in RN)
grep -rnE 'isReduceMotionEnabled|reduceMotionChanged|AccessibilityInfo' src   # present = respected
grep -rnE 'prefers-reduced-motion' src                            # any hit here is the WRONG litmus for this stack — flag it
```

## Experience design

react-native-web exposes **no ARIA roles**, so neither the behavioral render tier nor any selector strategy may
select by role — select by `testID` (renders as `data-testid`), `accessibilityLabel` (renders as `aria-label`),
or visible text content.

```bash
# State coverage — loading / error / empty / disabled (RN idioms)
grep -rnE 'ActivityIndicator|isLoading|loading|Skeleton' src      # loading
grep -rnE 'isError|ErrorBoundary|catch\s*\(' src                  # error
grep -rnE 'isEmpty|length === 0|No .* found' src                  # empty
grep -rnE '\bdisabled\b|accessibilityState' src                   # disabled
# Interaction handles for the render tier — prefer these over role-based selectors
grep -rnE 'testID\s*=|accessibilityLabel\s*=' src
```

Stack-conditional note: the reviewer's Experience-design pillar asks "is the flow completable by keyboard
alone?" — a web-keyboard-nav criterion. For a **native** (non-Web) RN target the analog is screen-reader /
focus-order semantics (`accessibilityRole`, focus order), not literal keyboard traversal; a react-native-web
build retains partial keyboard nav. Judge by the correct model for the actual target.

## RTL-Hebrew (cross-cutting — routes to the pillars above)

RTL correctness is a lens applied across pillars, not a pillar of its own. Each detector below names the scored
pillar its confirmed hits file under, so a real RTL bug always lands in a defined scorecard row. Note that
react-native-web's automatic RTL flip differs from native RN's `I18nManager`-driven flip — the exact surprise
class this pack exists to catch.

```bash
# → Typography: hardcoded text direction / alignment that should adapt under RTL
grep -rnE "textAlign\s*:\s*['\"]left|writingDirection" src
# → Spacing: physical-direction margin/padding props that should be LOGICAL for RTL
grep -rnE '(marginLeft|marginRight|paddingLeft|paddingRight)\s*:|\b(left|right)\s*:' src   # prefer marginStart/paddingStart/end
# → Visuals & hierarchy: non-reversed row layouts
grep -rnE "flexDirection\s*:\s*['\"]row['\"]" src                  # a fixed 'row' (vs 'row-reverse'/direction-aware) is an RTL smell
# → Experience design: is RTL actually handled, and are directional icons mirrored?
grep -rnE 'I18nManager\.(isRTL|forceRTL|allowRTL)' src            # presence = RTL is considered
grep -rnE 'chevron|arrow|back|forward|caret' src                  # directional glyphs — inspect each for horizontal mirroring under RTL
```

Route every confirmed hit to the named pillar as cited evidence; a grep count is never a score by itself.

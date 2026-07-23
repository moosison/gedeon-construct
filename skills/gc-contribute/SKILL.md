---
name: gc-contribute
description: "Files a GitHub Issue against the public repo for a raw idea, bug report, or a locally-proven gc-correct patch -- the outward half of the construct's self-improvement loop."
phase: capture
tags: [self-improvement, contribution, github, community, meta]
---

// @ai-rules:
// 1. [Constraint]: Title AND body heredocs must use a quoted, distinctive per-invocation delimiter (never the bare literal `<<'EOF'`) -- see Step 5.
// 2. [Constraint]: Always pass --repo moosison/gedeon-construct explicitly; assert the resolved target before filing -- never rely on the ambient git remote.
// 3. [Pattern]: Scrub-and-warn pass (Step 2.5) runs before every confirmation prompt, for both idea-mode and patch-mode content.

# Contribute

**Packages and files a GitHub Issue against the public repo (`moosison/gedeon-construct`) from either a raw idea or a locally-proven patch.** Drafts, scrubs, confirms, files — and never touches the private origin repo.

## When to Use

Run `/gc-contribute` standalone when you have a raw idea or a bug report worth sharing. It also serves as the landing point when `gc-correct`'s Step 5.5 hands off a patch that was just approved and applied locally: instead of the improvement staying private to this install, gc-correct offers to route it here so the wider construct can benefit too.

## Steps

### Step 1: Determine Content Shape

Work out what kind of payload you're holding before drafting anything.

It is either a raw idea or bug description in the user's own words, or a patch payload arriving in one of `gc-correct`'s two possible shapes:

- A **prose patch** — the affected skill's name, plus the Gap identified / Root cause / Proposed addition content, verbatim.
- A **hook/script patch** — an identifier for the affected file, plus the diff against it, plus the specific failure it would have caught, verbatim. `gc-correct`'s own Step 5 explicitly allows patch targets that aren't skills at all — a hook definition, or a script under `hooks/`/`hooks/lib/` — for mechanical-omission fixes, so this shape exists precisely for that case.

For the identifier in a hook/script patch: use the affected skill's name when the patch targets a skill file, or the affected file's relative path (e.g. `hooks/lib/pending-corrections-cli.js`) when it targets a hook or script instead. A naming rule that only ever resolves to a skill name would silently break the moment a non-skill patch arrived. Both patch shapes are valid inputs — neither is preferred over the other, and neither should be forced into the other's fields.

### Step 2: Draft Title and Body

Shape the draft according to what Step 1 identified.

For a **prose patch**: title = `Patch: {skill-name} — {one-line gap summary}`; body = the Gap/Root cause/Proposed addition content, verbatim. For a **hook/script patch**: title = `Patch: {identifier from Step 1 — skill name or file path} — {one-line failure summary}`; body = the diff plus the specific-failure description, verbatim. Either way, append one closing line to the body noting it was verified working in a local install — that's the credibility signal a maintainer needs to triage it quickly.

For a **raw idea**: title = a concise one-line summary the user can confirm or edit before anything is shown publicly; body = the idea as described, without embellishment.

### Step 2.5: Scrub-and-Warn Pass

Before presenting any draft for confirmation, scan both the title and the body for content that shouldn't reach a public, permanent, search-indexed surface verbatim. This runs for both idea-mode and patch-mode content — patch-mode drafts are pulled from session transcript text and carry exactly the same risk as anything else.

Look for three categories: absolute local file paths (a `C:\Users\{name}\`, `/home/{name}/`, or `/Users/{name}/` prefix), secret-shaped tokens (a contiguous run of 20 or more alphanumeric characters with mixed case or digits, or a recognizable credential prefix such as `sk-`, `ghp_`, `AKIA`), and private project-identifying names — the session's own repo name, project name, plan slug, or milestone name — appearing verbatim in a drafted title or body. For the first two, default to redacting the detected span — replace it with a visible generic placeholder (`{local-path}` or `{redacted-token}`) that stays in the presented draft, so the user can see exactly what was pulled and why. For the third, default to generalizing instead: rewrite the reference into a category-level description of the same technical situation (e.g. "a Telegram-bot allowlist/link-classification plan" rather than naming the private project it came from) — the goal is genericizing *which* private project a pattern came from, not hiding the technical pattern itself, which is exactly what's worth sharing. Across all three categories, only restore the original if the user explicitly asks for it, before confirming.

All three categories default to redact/generalize, not just paths. Letting a real secret, or a private project's identity, pass through onto a permanent public surface is a materially worse outcome than over-redacting a benign-looking string — and the second mistake costs the user nothing more than asking to have it put back.

### Step 3: Check Availability

Verify that the filing tool is installed and authenticated with a version/auth check. This is a passive, read-only probe — it is not the mutating filing call that Step 4's confirmation gate protects, so it can run freely ahead of any user decision.

If it's unavailable, unauthenticated, or the environment is offline: still draft and show the already-scrubbed content, state plainly that it can't be filed automatically right now, and hand the user the manual fallback — `https://github.com/moosison/gedeon-construct/issues/new`. Never block, and never surface this specific check's raw error to the session — this mirrors `gc-morning`'s degrade-gracefully posture, because a missing or unauthenticated filing tool is an expected, benign condition here. That posture is scoped to this availability check alone: an actual filing failure after the user has confirmed (Step 6) is a different situation, and gets reported verbatim there.

### Step 4: Present and Confirm

Show the user the full scrubbed, drafted title and body exactly as they'll be filed. State plainly that filing makes this content public and permanent. Require explicit confirmation before the filing call runs — never file automatically, regardless of how confident the draft looks.

### Step 5: File the Issue

On confirmation, and before any filing call: assert that the resolved target repository string is exactly `moosison/gedeon-construct` — a literal comparison, not an assumption. If it is ever anything else, abort with a clear error and file nothing. "Always pass the explicit repo flag" is a habit, not a guarantee, so this assertion is the check that actually enforces it.

Then pass the drafted title through a heredoc-populated shell variable, and the drafted body through a heredoc fed to the filing command's own stdin-reading flag (e.g. `gh issue create --repo moosison/gedeon-construct --title "$TITLE" --body-file -`). Both heredocs must use a quoted delimiter (`<<'DELIM'`, never the unquoted `<<DELIM` form) to suppress `$()`/backtick expansion of the drafted text — this matches this project's established convention for piping untrusted, LLM-drafted content (`gc-correct` Step 3.5, `gc-plan` Step 3.5).

The delimiter itself must be distinctive per invocation — incorporating something like the current timestamp — never the generic literal `EOF`. A heredoc only terminates on a line matching its own exact delimiter, so a generic delimiter risks early termination the moment the drafted content happens to contain a matching line, which would silently expose everything after it to live shell interpretation. A distinctive delimiter closes that off by construction. As a cheap additional safeguard, confirm the chosen delimiter doesn't already appear as a standalone line anywhere in either the title or the body content before using it; if it does, pick a different one.

Always target the public repo by its explicit name. Never rely on the local git remote to determine where this gets filed — this install's local remote may point somewhere entirely different (a private fork, a mirror), and that ambient state must never silently decide where public content lands.

### Step 6: Report

On success: report the resulting issue URL. On any failure of the filing call itself: surface the actual error text verbatim, and repeat Step 3's manual-filing fallback so the user isn't left stranded.

## Anti-Patterns

- Filing without explicit confirmation from the user.
- Passing drafted text as a raw shell argument instead of through the quoted-heredoc convention.
- Using a generic or non-distinctive heredoc delimiter for drafted content.
- Assuming the local git remote determines the target repo instead of asserting it explicitly before filing.
- Skipping the scrub-and-warn pass for either idea-mode or patch-mode content.
- Blocking or erroring the session when the filing tool is unavailable, instead of degrading gracefully with the manual fallback.
- Any operation that touches the private origin repo.

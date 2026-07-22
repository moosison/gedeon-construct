---
name: gc-update
description: "Updates an existing Gedeon Construct install to the latest published version — pulls the public repo and re-runs setup.js to activate it."
phase: setup
tags: [setup, update, lifecycle, self-improvement]
---

// @ai-rules:
// 1. [Pattern]: Step 3b's comparison is UTF-8-decode-then-normalize-then-compare (`.replace(/\r\n/g, '\n')`), never raw byte/hash comparison — byte comparison is NOT CRLF-safe on this Windows-targeted project (empirically disproven, round 3 of this skill's originating plan).
// 2. [Constraint]: Step 6 uses `git merge --ff-only origin/main`, never `git pull` — `pull` performs its own network fetch and would silently reopen the preview/apply integrity gap Steps 4-5 exist to close.
// 3. [Gotcha]: Step 4 compares two `rev-parse` outputs, never `git ls-remote` — `ls-remote` output is tab-separated and was a defect source in an earlier revision of this skill's design.

# Update

**Updates an existing Gedeon Construct install to the latest version published on the public repo.** Pulls the clone forward with a fast-forward-only merge, previews the incoming change set before applying it, refuses when it would silently discard local personalization, and reactivates by re-running `setup.js`.

## Steps

### Step 1: Locate the Install

Read `packagePath` from `~/.claude/gedeon/config.json`.

If that file is missing, corrupt, or lacks a `packagePath` field: fall back to `~/.claude/settings.json`'s `hooks.SessionStart` array, which `setup.js` overwrites on every run and is therefore always current. Find the registered command string — it has the exact shape `node "{packagePath}/hooks/gc-session-start.js"` — and extract the path with the regex:

```
/"([^"]+)\/hooks\/gc-session-start\.js"/
```

Take capture group 1 directly as `packagePath`. No further path-joining or truncation is needed — `setup.js` always writes this path with forward slashes and Windows paths cannot themselves contain a literal `"`, so the quoted span is unambiguous.

If the regex does not match (a hand-edited or unexpected command string): treat this as an extraction failure and fall through — do not guess at a partial path.

If both the config-file read and the settings-file fallback fail: ask the user for the install path directly.

### Step 2: Validate It's a Real Git Repo

```
git -C "{packagePath}" rev-parse --is-inside-work-tree
```

Non-zero exit → stop with a clear error naming the resolved `packagePath`. Do not proceed to Step 3.

### Step 3: Fail-Safe Gate

Two independent checks. Both must pass before continuing — a single check is not enough, because the two things worth protecting (the git clone itself, and a user's locally personalized skill files) live in different, non-overlapping trees.

**3a. Clone dirtiness**

```
git -C "{packagePath}" status --porcelain
```

Non-empty output → refuse, and ask the user to commit or stash first. This is the same precedent `gc-ship/SKILL.md` Step 1 already uses for its own uncommitted-changes check. This check alone only protects the uncommon case of a user editing files directly inside the clone — it says nothing about the far more common case below.

**3b. Installed-skill personalization check**

`gc-correct` personalizes installed skills by writing directly to `~/.claude/skills/gc-*/SKILL.md` with the Write tool (`gc-correct/SKILL.md` Steps 5-7 — no git involved at all) — a separate tree from the clone at `packagePath`, which 3a's git-status check never looks at.

If `~/.claude/skills/` does not exist at all, skip this whole check — nothing is installed yet to diverge.

Otherwise, for every directory name present in **both** `{packagePath}/skills/` and `~/.claude/skills/`:

1. Read `~/.claude/skills/{name}/SKILL.md` and `{packagePath}/skills/{name}/SKILL.md` as UTF-8 text.
2. Normalize line endings on **both** strings before comparing — `.replace(/\r\n/g, '\n')` (the same normalization already used at `hooks/lib/hook-runtime.js:58`).
3. Compare the two normalized strings for equality.

If reading **either** side throws for any reason — the installed folder exists but has no `SKILL.md` inside it, a permissions error, anything — treat that pair as "differs." Do not let an unreadable file silently pass the check.

A UTF-8 decode does **not** throw on invalid byte sequences — Node silently substitutes the Unicode replacement character (`�`, U+FFFD) instead, so a bit-corrupted `SKILL.md` would pass the read step and reach the string compare with mangled content, bypassing the throw-based check above (review finding, gc-review 2026-07-22). After decoding each side, also check `content.includes('�')` — if either side contains it, treat that pair as "differs" the same way an unreadable file is treated.

If **any** pair differs (real content mismatch, or a read failure): refuse. Name which skill(s) have diverged or are unreadable, and tell the user to either copy their personalized `~/.claude/skills/{name}/SKILL.md` back into the clone's own `{packagePath}/skills/{name}/SKILL.md` before retrying, or resolve it manually — there is no accepted-loss override in this version.

A deliberate tradeoff: because the comparison normalizes line endings, a personalization "edit" that changes only CRLF-vs-LF with no other content change will **not** be flagged as a divergence — a line-ending-only difference is never a meaningful personalization worth protecting, and the alternative (raw byte comparison) produces false-positive refusals on this project's own Windows/`core.autocrlf=true` setup.

Two things this check deliberately does *not* cover, both accepted as out of scope for this version: a skill folder present only in `~/.claude/skills/` (installed, later removed from the clone) is not checked, since `setup.js`'s own skill-copy step never deletes destination-only entries; and `~/.claude/agents/*.md` is not checked, since no mechanism analogous to `gc-correct` personalizes agent files today.

### Step 4: Fetch + Compare

```
git -C "{packagePath}" fetch origin main
```

Run this first — it refreshes the local `origin/main` tracking ref, which nothing before this step has touched. If the fetch itself fails (renamed/missing remote, no network): stop with a clear error naming the failure. Do not proceed to Step 5.

Then compare two clean, single-SHA-plus-newline outputs:

```
git -C "{packagePath}" rev-parse HEAD
git -C "{packagePath}" rev-parse origin/main
```

Trim both (strip the trailing newline) before comparing — no `ls-remote`-style tab-separated parsing is needed here, since both sides are now `rev-parse` calls against local refs.

If the two SHAs are equal: report "already up to date" and stop here — nothing further to do.

### Step 5: Preview + Confirm

The `fetch` in Step 4 already refreshed the local ref, so this preview is guaranteed current. Print the incoming change set:

```
git -C "{packagePath}" log --oneline HEAD..origin/main
git -C "{packagePath}" diff --stat HEAD..origin/main
```

Present this to the user and require explicit confirmation before proceeding to Step 6. On decline: stop cleanly, no changes made.

This confirmation assumes a human is present to answer it — `/gc-update` is not designed for unattended or automated invocation (for example, wrapped in a recurring loop). An automation wrapper with nobody able to respond would simply stall this step indefinitely; that is accepted, not a bug to route around here.

Note also: this preview's guaranteed-current property holds only against this single invocation's own timeline. If a second, concurrent `/gc-update` against the same `packagePath` advances `origin/main` again while this confirmation is pending, Step 6's merge would apply that newer state instead of exactly what was shown. This is an accepted, low-likelihood limitation — no corruption results, since Step 6's fast-forward-only merge still degrades any real conflict to a clean error; only a possible mismatch between exactly what was previewed and what applied.

### Step 6: Merge

```
git -C "{packagePath}" merge --ff-only origin/main
```

This operates only on the local `origin/main` ref that Step 4 already fetched — it performs no further network I/O of its own. Do not use `git pull` here: `pull` is `fetch` + merge internally, and running it at this point would silently re-fetch and could apply commits that landed on the remote *after* Step 5's preview was shown and confirmed — reopening exactly the preview/apply gap Steps 4 and 5 exist to close. `merge --ff-only` applies exactly, and only, what was already fetched and previewed.

Non-zero exit → surface the git error verbatim. If the failure is specifically a rejected fast-forward (history has diverged), add one explanatory line: "the public repo's history has diverged from what a fast-forward can apply — this needs manual investigation, not an automatic merge." Either way, stop — do not proceed to Step 7 on a failed merge.

### Step 7: Reactivate

Re-invoke:

```
node "{packagePath}/setup.js"
```

This reuses `setup.js`'s already-idempotent skills/agents copy, hooks-merge, and permission-merge steps rather than reimplementing any of that logic here.

If this invocation exits non-zero or throws partway through: report clearly that the merge in Step 6 already succeeded and landed the new code, but activation (copy/merge) did not complete. Recommend simply re-running `/gc-update` — both Step 4's compare and this reactivation step are independently idempotent/overwrite-safe, so a retry is a sufficient recovery path; there is no separate transactional-rollback mechanism.

`setup.js`'s own stdout unconditionally prints first-run-flavored language (e.g. inviting the user to run `/gc-init` to meet Gedeon for the first time). Surface that output verbatim, then append one clarifying line: "(This was an update — the message above is setup.js's standard install banner, printed on every run.)" Do not attempt to parse or suppress `setup.js`'s own output.

### Step 8: Report

Report the old SHA (short form) → new SHA (short form) for the update just applied, plus the skill/agent counts `setup.js`'s own Step 5 already printed as part of its stdout in Step 7 — no new counting logic is needed here, just surface what it already reported.

## Anti-Patterns

- Reimplementing `setup.js`'s copy/merge logic inside this skill instead of re-invoking the script.
- Trusting `config.json`'s `packagePath` as the sole locator with no fallback — it can drift stale; Step 1's regex-based fallback exists precisely because of that.
- Comparing Step 3b's file pairs as raw bytes or a raw hash — neither tolerates a CRLF-vs-LF difference; only UTF-8-decode-then-normalize does.
- Using `git pull` or `git ls-remote` anywhere in Steps 4 or 6 — `pull` reopens the preview/apply gap, and `ls-remote`'s tab-separated output was a defect source in an earlier design of this mechanism.
- Skipping Step 3a or Step 3b because the other one passed — they protect different, non-overlapping trees and both must pass.
- Applying the merge before the user has confirmed the Step 5 preview.

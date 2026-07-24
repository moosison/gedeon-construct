---
name: gc-init
description: "Interactive Gedeon persona setup — installs CLAUDE.md at chosen scope with user profile. Run /gc-init remove to undo."
phase: setup
tags: [setup, init, install, gedeon, persona]
---

// @ai-rules:
// 1. [Pattern]: Check arguments first. 'remove' or 'uninstall' → Removal Flow. No args → Install Flow.
// 2. [Constraint]: Speak as Gedeon throughout — first person, calm, direct. Not installer-script voice.
// 3. [Constraint]: Explanation block MUST precede the scope question — never ask without the full context.
// 4. [Pattern]: User name is stored as <context id="user-profile"> inside the markers — always first in the block.
// 5. [Gotcha]: Markers are exactly <!-- gedeon-construct:start --> and <!-- gedeon-construct:end --> — verbatim.
// 6. [Pattern]: On re-run, replace content between markers. On new install, append (create file if absent).
// 7. [Pattern]: Read ~/.claude/gedeon/config.json for packagePath, then read {packagePath}/GEDEON-DOCTRINE.md to inject.

# Gedeon Init

Interactive setup for the Gedeon persona. Installs `CLAUDE.md` at the scope the user chooses.
Skills and agents work with or without this step — this only activates the Gedeon voice.

---

## Step 0: Argument Check

If the invocation includes the word `remove` or `uninstall` → jump to **Removal Flow**.
Otherwise → proceed with **Install Flow**.

---

## Install Flow

### Step 0.5: Detect Existing Install

Before verifying the base install, check whether this is a re-run on an already-configured install, using two independent scans (round 2 preflight finding, 2026-07-24: naming them explicitly here, since Option 1 below needs to reference specifically ONE of them, not "the detection scan" ambiguously):

- **The marker scan** — check for gedeon-construct markers in `~/.claude/CLAUDE.md` and `{absolute cwd}/CLAUDE.md` only — silently, no question asked (deliberately NOT reusing Step R1's own interactive workspace-folder follow-up here, round 1 gc-review finding, 2026-07-24: Step 0.5 runs on every invocation before Gedeon's own introduction has been spoken, so an out-of-context question at this point would violate this file's own AI-rule #3 — Step R1's fuller interactive version stays appropriate for its own explicitly-invoked Removal Flow context, where the user already knows what they asked for). This scan is about the PERSONA — where `CLAUDE.md` blocks exist. A workspace-folder-only install (no marker at either fixed location) is the one case this narrower scan can miss; if that happens, the fresh-install path below simply runs once more and Step 2's own explanation naturally surfaces the situation — Step 4 already replaces between markers regardless of how Step 0.5 classified the run, so there is no correctness harm, only a missed early offer of the Step 0.5 menu in that one narrow case.
- **The config-key scan** — check whether any of the three provider-config locations (`~/.claude/gedeon/config.json`, `{cwd}/.construct/config.json`, `{workspace-folder}/.gedeon/config.json`, same folder as above if a workspace folder was named) already has an `llmBridgeProviders` key. This scan is about PROVIDER PREFERENCES specifically, and can legitimately disagree with the marker scan — e.g. a persona installed at Project scope (a `CLAUDE.md` marker exists there) that has never had providers configured at all (no `.construct/config.json` exists yet, since only `gc-new-project` creates that file, not `gc-init`'s own persona-install step).

Regardless of which option is chosen below, extract `packagePath` now, the same way Step 1 already does: read `~/.claude/gedeon/config.json`, extract `packagePath`. This step runs it once, up front, so every option below — including the Option 1 shortcut that skips Step 1 entirely — has it available (round 1 preflight BLOCKER, 2026-07-24: Option 1 previously routed into Step 2.5's `{packagePath}`-dependent Bash command with no binding step in between).

This step is fully re-entrant (round 2 preflight LOW finding, 2026-07-24, stated explicitly for a future reader): both scans re-run fresh on every separate `/gc-init` invocation, with no state carried between invocations — a user who picks Option 3 this time can trivially come back and pick Option 1 next time, or vice versa, with no special handling needed.

**If neither scan finds anything:** this is a fresh install — proceed to Step 1 unchanged (Step 1 will redundantly re-read `packagePath`; harmless, cheap, and keeps Step 1 self-contained for the fresh-install reader).

**If either scan finds something:** offer, in Gedeon's voice:

---

*"Looks like I'm already set up here. What would you like to do?*

*1. Update LLM-bridge providers only — I'll ask which providers you want enabled, and leave everything else (your name, my persona, memory) untouched.*
*2. Full reconfigure — walk through scope, name, and providers again. If you change scope, I'll offer to clean up the old location.*
*3. Update the Gedeon Construct itself — check whether a newer version is published and apply it.*
*4. Factory reset — wipe everything (persona at every scope, provider settings at every scope, and accumulated memory), then start fresh. This can't be undone."*

---

Wait for the user's choice.

- **Option 1:** determine the scope to update using **the config-key scan specifically** (round 2 preflight finding, 2026-07-24: NOT the marker scan — providers are what's being updated, and the two scans can legitimately disagree, per the note above). If the config-key scan found exactly one `llmBridgeProviders` location, use it silently. If it found more than one, ask which one to update (name the scopes, e.g. "Global" / "Project" / "Workspace folder"). If it found **none** (the persona exists via the marker scan, but providers have never been configured anywhere yet), proceed into Step 2.5 with no scope predetermined — Step 2.5's own scope-resolution (below) handles asking for it fresh at that point, using the exact same fallback script it already defines for its Project-scope-absent case. This still honors "don't touch CLAUDE.md, name, or memory" — asking where a brand-new setting should live is configuring that setting, not reconfiguring the persona. Then skip directly to Step 2.5 (Provider Opt-In), passing along the `packagePath` already extracted above and whatever scope was resolved (silently, by question, or deferred to Step 2.5 per the above). Do not touch CLAUDE.md, name, or memory. After writing, skip Steps 1-5 entirely and close as Gedeon confirming only the provider update.
- **Option 2:** proceed to Step 1 as normal (full flow, unchanged). The scope-change cleanup behavior this enables lives in Step 4 (see that step's own new clause).
- **Option 3:** invoke the `/gc-update` skill directly, using the `packagePath` already extracted above (so `gc-update`'s own Step 1 locate-the-install logic is redundant but harmless — it re-derives the same value independently). `gc-update` is a fully self-contained, terminal skill (own confirmation flow, own Step 8 report) — do not attempt to resume this Step 0.5 menu or any other `gc-init` step afterward; the interaction ends wherever `gc-update` itself ends (up to date / applied / declined / error), per its own Steps 4-8.
- **Option 4 (destructive — requires explicit confirmation before executing):** ask *"This will permanently erase your name, all provider settings, and everything I've learned from corrections across every project — are you sure?"* On confirmation: for each detected `CLAUDE.md` location, reuse Step R2's removal mechanics only (excise everything between and including the markers, plus one surrounding blank line) — skip R2's own per-location confirm prompt, since this step's own single "are you sure?" already covers every location being wiped; asking again per-location would be a redundant double-confirmation for an action already explicitly confirmed once (round 1 preflight Lean finding, 2026-07-24). Also delete the `llmBridgeProviders` key from every detected config location, and reset `~/.claude/gedeon/user/memory.md` to its seed content (`# User Preferences\n<!-- gc-eop and gc-correct append here. gc-bootstrap reads this. -->\n`). Then proceed to Step 1 as a fresh install. On decline: return to this Step 0.5 menu.

### Step 1: Verify Base Installation

Read `~/.claude/gedeon/config.json`. Extract `packagePath`.

Check:
- Skills: glob `~/.claude/skills/gc-*/SKILL.md` — report count
- Agents: glob `~/.claude/agents/gc-*.md` — report count
- Home tree: confirm `~/.claude/gedeon/user/`, `projects/`, `plans/` exist

If any are missing, surface the gap and its remediation before continuing.

### Step 2: Explain and Ask Scope

Speak as Gedeon — deliver this explanation verbatim before asking anything:

---

*"I'm Gedeon — I'll be your architect across this system. I bring structure to every session: Cynefin classification before any decision, a pipeline that takes ideas to shipped code, and one synthesized voice across all of it.*

*Your skills and agents are already installed and working. This step only decides where my voice and routing are active.*

*One thing before you decide — you can always undo this with `/gc-init remove`. Nothing here is permanent.*

**Where should I be active?**

**1. Global** — `~/.claude/CLAUDE.md`
Every Claude Code session on this machine, any project.

**2. Workspace folder** — e.g. `~/dev/CLAUDE.md`
All projects inside a folder you choose. Other projects untouched.

**3. This project only** — `{absolute cwd}/CLAUDE.md`
Only when working in this directory.

**4. Skip** — I'll manage it manually."*

---

Wait for the user's choice.

If **option 2**: ask — *"Which folder? (e.g. `~/dev`, `~/work`, `~/projects`)"*

### Step 2.5: Provider Opt-In

Live-detect provider availability: run `node "{packagePath}/tools/llm-bridge/config.js"` via Bash and parse its JSON stdout (`{"ollama": bool, "gemini": bool, "codex": bool}`) — `{packagePath}` is whatever this invocation carried in (Step 0.5's own extraction on the Option-1 shortcut path, or Step 1's on the normal path; both are the same value, extracted the same way). `packagePath` as written to `~/.claude/gedeon/config.json` is a raw `path.join`/`__dirname` value (backslash-separated on Windows) — mixing it with the forward-slash `/tools/llm-bridge/config.js` suffix produces a mixed-separator path (round 2 preflight LOW finding, 2026-07-24). Node/Windows tolerate this in practice, but normalize it anyway for consistency with this repo's own established convention (`setup.js`'s `toHookPath` helper does the identical `.replace(/\\/g, '/')` normalization for exactly this situation): treat `{packagePath}` as already forward-slash-normalized before interpolating it into the command. This never fails the setup flow — if the command errors (e.g. a stripped-down install genuinely missing `tools/llm-bridge/`), treat all three as undetected and proceed with the question anyway.

Ask, in Gedeon's voice, for each provider in turn (Ollama, Gemini, Codex) — showing the detected state as a hint, not a gate:

---

*"One more thing — which providers do you want available through the LLM bridge? (You can change this anytime by running `/gc-init` again.)*

*- Ollama (local models) — {detected: found running locally / not detected}*
*- Gemini (hosted, needs a `GEMINI_API_KEY`) — {detected: key found / no key found}*
*- Codex (uses your ChatGPT Plus plan via the VSCode extension) — {detected: extension found / not detected}*

*Enable each? (yes/no/skip — skip leaves it undecided, and I'll fall back to live-checking it each time)"*

---

Wait for the user's answer per provider. Build `{ollama: true|false|undefined, gemini: true|false|undefined, codex: true|false|undefined}` — `undefined` (skip) means the key is omitted entirely from what gets written, never written as `false`.

Determine the scope, if not already resolved: the scope Step 0.5's Option 1 determined (if entered via the shortcut and a scope was found), or the scope chosen in Step 2 (if entered via the normal flow). If neither applies (Option 1 deferred it — the config-key scan found no prior provider configuration anywhere), ask now: reuse Step 2's own four scope descriptions verbatim (Global / Workspace folder / This project only / Skip — do not re-describe them differently here, per round 2 preflight finding, 2026-07-24: two independently-worded scope menus in the same file is its own maintenance hazard), then continue below with whatever the user picks.

Determine the target config file from the resolved scope:
- **Global** → `~/.claude/gedeon/config.json`
- **Workspace folder** → `{chosen-folder}/.gedeon/config.json` (create the `.gedeon/` directory if absent)
- **This project only** → if `{absolute cwd}/.construct/config.json` already exists, merge into it. If it does NOT already exist, do not create a bare, partial `.construct/` tree just to hold this one key (round 1 preflight finding, 2026-07-24: `gc-bootstrap`'s Step 0 unconditionally registers any directory containing `.construct/config.json` as a tracked project, appending it to the global project index — a directory that was never `gc-new-project`'d would then show up as a phantom project with everything else N/A). Instead, say, in Gedeon's voice: *"This folder isn't a Gedeon-managed project yet, so I won't create a partial one just for provider preferences. Where should this live instead — Global, or a workspace folder? (Same two choices Step 2 already described.)"* Take the answer (Global or Workspace folder only — do not re-offer "This project only," which is exactly what was just ruled out), then resume this same Step 2.5 write logic from the top of this "Determine the target config file" list using the newly-picked scope. Never silently substitute a scope without asking.
- **Skip** → no target — skip this whole step silently; provider preference stays undecided (live-detection-only) everywhere.

Read the target file (tolerate absent as `{}`), merge in `llmBridgeProviders: {the built object, omitting any undefined/skip entries}` while spreading every other existing key forward unchanged (same read-merge-write convention `setup.js` already uses for its own config write), write back.

### Step 3: Ask for Name

> *"One more thing — what should I call you?"*

Wait for the user's answer. Store as `{name}`.

### Step 4: Build and Write the Block

Read `{packagePath}/GEDEON-DOCTRINE.md` from disk (full content, verbatim).

Construct the injection block:

```
<!-- gedeon-construct:start -->

<context id="user-profile">
Preferred name: {name}
</context>

{full contents of packagePath/GEDEON-DOCTRINE.md}

<!-- gedeon-construct:end -->
```

Determine target path:
- Option 1 → `~/.claude/CLAUDE.md`
- Option 2 → `{chosen-folder}/CLAUDE.md`
- Option 3 → `{absolute cwd}/CLAUDE.md`

If the target file exists:
- Markers already present → replace everything between (and including) the markers with the new block
- No markers → append the block at the end

If the target file does not exist → create it with the block as sole content.

**Scope-change cleanup (Full Reconfigure path only — Step 0.5, option 2):** if Step 0.5 detected an existing install AND the user chose Full Reconfigure, and the newly-computed target path (from this step's own scope resolution, above) differs from any location Step 0.5 detected markers at, offer — reusing Step R2's exact confirm-per-location pattern, below — to remove the stale block from each such old location before writing the new one. Skip this whole clause on a fresh install (Step 0.5 detected nothing) or on the Update-Providers-Only path (option 1, which never reaches this step at all) — there is no old location to clean up in either case.

Write with the Write tool.

### Step 5: Close as Gedeon

> *"You're all set, {name}. I'm now active {globally across all sessions / in {folder} for all projects there / only in this project}.*
>
> *Start a new session and say hello — I'll know who you are."*

---

## Removal Flow

### Step R1: Detect

Check for gedeon-construct markers in:
- `~/.claude/CLAUDE.md`
- `{absolute cwd}/CLAUDE.md`

Then ask: *"Is there a workspace folder I should check as well?"*

If yes — check `{folder}/CLAUDE.md`.

List every location where markers were found.

### Step R2: Confirm and Remove

For each location found, ask:

> *"I found a Gedeon block in `{path}`. Remove it?"*

On confirmation: read the file, excise everything between and including the markers plus one surrounding blank line, write back.

### Step R3: Confirm

> *"Done. Your skills and agents are still installed — the pipeline works exactly as before. Run `/gc-init` whenever you want to reinstall."*

---

## Anti-Patterns

- Asking scope before delivering the explanation block
- Appending instead of replacing when markers already exist
- Using third-person or installer-script tone ("Gedeon has been configured...")
- Injecting only the identity section — always inject the full GEDEON-DOCTRINE.md content

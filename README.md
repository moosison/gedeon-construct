# The Gedeon Construct

> Hyper-logical. Rigorous. Self-improving.

A 26-skill Claude Code operating system for AI-assisted software engineering, operated by **Gedeon** — a named architect persona with persistent identity across sessions. Three design philosophies fused into a single, self-contained skill set:

- **Architect Rigour** — Cynefin sense-making, probe-before-assume, closed-loop verification
- **Project Lifecycle** — From raw idea to shipped code via a 6-stage pipeline
- **Self-Improving Intelligence** — Darwin Skill Author + corrective memory closes the behavioral loop

No MCP server required. All logic is inline in skill files.

---

## Pipeline

```text
/gc-morning --> (session greeting + project selection)
/gc-resume  --> (crash/compaction recovery -> re-enter at last known stage)

/gc-bootstrap --> /gc-discuss (opt) --> /gc-plan --> /gc-preflight
                                                          |
                            <----------- retry if Gate: STOP ---+
                                                          |
                                                   /gc-execute
                                                          |
                                                    /gc-review
                                                          |
                                                     /gc-eop
```

State is tracked per-project at `.claude/gc-pipeline.json`. Hooks remind you of the next stage on session start and session end.

---

## 26 Skills

### Pipeline -- 6-stage workflow + entry points

| Skill          | Stage          | Purpose                                                          |
| -------------- | -------------- | ---------------------------------------------------------------- |
| `gc-morning`   | Entry          | Morning briefing -- project scan, intent selection               |
| `gc-resume`    | Recovery       | Pipeline recovery -- resume from crash or compaction             |
| `gc-bootstrap` | 1              | Workspace scan, situational brief, onboarding                    |
| `gc-discuss`   | 1.5 (optional) | Requirements elicitation, writes `.construct/CONTEXT.md`         |
| `gc-plan`      | 2              | 3 parallel explorers -> evidence merge -> Cynefin-tagged plan    |
| `gc-preflight` | 3              | 4 parallel auditors -> binary mechanical Gate (PASS/STOP; % is display-only) |
| `gc-execute`   | 4              | Wave-based parallel execution, WIP cap 5, closed-loop verify     |
| `gc-review`    | 5              | Multi-reviewer panel, security mandatory, pessimistic merge      |
| `gc-eop`       | 6              | Extract learnings, corrective memory, session digest             |

### Project -- lifecycle management

| Skill            | Purpose                                                     |
| ---------------- | ----------------------------------------------------------- |
| `gc-pipeline`    | Overview: all stages, iteration rules, hand-offs            |
| `gc-new-project` | Initialize `.construct/` tree (PROJECT.md, ROADMAP.md, ...) |
| `gc-milestone`   | Add a milestone to ROADMAP.md                               |
| `gc-progress`    | Show completion status from `.construct/` files             |
| `gc-status`      | Current project state: stage, blockers, open threads        |
| `gc-ship`        | Create a PR via `gh pr create`                              |
| `gc-branch`      | Branching strategy advisor (solo / small-team / full-team)  |
| `gc-note`        | Quick capture to `.construct/NOTES.md`                      |

### Specialist -- activate on demand

| Skill                | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `gc-cynefin`         | Classify problems (Disorder -> Clear/Complicated/Complex/Chaotic) |
| `gc-probe`           | Replace assumptions with evidence before acting                   |
| `gc-debug`           | Scientific debugging: hypothesis -> probe -> fix -> verify        |
| `gc-lean`            | YAGNI scope gate; flags speculative steps before gc-execute       |
| `gc-ui`              | UI/UX design and frontend implementation mode                     |
| `gc-platform-review` | Hohpe Platform Strategy 7-C audit                                 |
| `gc-shebang`         | Generate/update `@ai-rules` headers in code files                 |

### Self-Improvement -- the Darwin loop

| Skill             | Purpose                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `gc-skill-author` | Write or amend gc-* skills (HOW not WHAT, no tool names in bodies) |
| `gc-correct`      | End-of-session behavioral gap capture -> minimal skill patches     |

### Setup

| Skill      | Purpose                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| `gc-init`  | Interactive Gedeon persona setup -- scope choice, user name, rollback        |

---

## Agents

Seven stateless agent files in `agents/`. Six are dispatched by a skill, as a generic subagent's prompt-embedded brief (never via native `gc-*` subagent_type selection), and return structured output per that persona's output contract. `gc-brain.md` is the exception: it is never dispatched — `hooks/gc-session-start.js` injects it directly into the main session's own context at session start, since the main session performs the orchestrator role itself, inline, rather than delegating it.

| Agent                | Dispatched by         | Role                                                            |
| -------------------- | --------------------- | --------------------------------------------------------------- |
| `gc-brain.md`        | Session start (ambient, never dispatched) | Orchestration reference — documents the main session's own inline pipeline behavior |
| `gc-explorer.md`     | gc-plan, gc-bootstrap | Read-only codebase explorer: structure, call chains             |
| `gc-auditor.md`      | gc-preflight          | Pre-flight auditor: Cynefin, gaps, contracts (A/B/C)            |
| `gc-lean-auditor.md` | gc-preflight          | YAGNI lean auditor -- mandatory Auditor D                       |
| `gc-executor.md`     | gc-execute            | Wave-based executor with WIP cap and closed-loop verify         |
| `gc-reviewer.md`     | gc-review             | Code reviewer: correctness, security, architecture              |
| `gc-researcher.md`   | Various               | Research agent with web access for external knowledge           |

---

## Project Data Directory

Every project using the Gedeon Construct maintains a `.construct/` directory:

```text
.construct/
  PROJECT.md       <- goals, stakeholders, constraints
  REQUIREMENTS.md  <- functional and non-functional requirements
  ROADMAP.md       <- milestones and phase breakdown
  STATE.md         <- current phase, blockers, progress
  NOTES.md         <- quick captures
  CONTEXT.md       <- requirements elicited by /gc-discuss
  config.json      <- project metadata
  phases/          <- per-phase plan files
```

---

## Hooks

Three hooks run automatically when the package is installed:

| Hook                    | Trigger           | Behavior                                              |
| ----------------------- | ----------------- | ----------------------------------------------------- |
| `gc-session-start.js`   | Session open      | Reports current stage + next command                  |
| `gc-pre-write-guard.js` | Write / Edit call | Advisory warning if writing code before execute stage |
| `gc-stop-reminder.js`   | Session close     | Reminds you of the next pipeline stage                |

All hooks exit 0 -- they are advisory only, never blocking.

---

## Install

```bash
# 1. Clone
git clone https://github.com/moosison/gedeon-construct.git ~/gedeon-construct

# 2. Run setup (copies skills + agents, writes hooks, seeds ~/.claude/gedeon/)
node ~/gedeon-construct/setup.js

# 3. Merge the hooks block from gedeon-construct/.claude/settings.json
#    into your project or global ~/.claude/settings.json

# 4. Open Claude Code and run /gc-init to activate the Gedeon persona (optional)
```

**Why `setup.js`?** Hook commands require absolute paths because Claude Code resolves them from the project CWD, not the plugin root. `setup.js` detects its own location (`__dirname`) and writes the correct paths — no manual editing required.

**`/gc-init` is optional.** Skills and agents work without it. `gc-init` only installs the Gedeon persona (`CLAUDE.md`) at the scope you choose — global, workspace folder, or this project only. Run `/gc-init remove` to undo.

Or install as a pi package (Claude Code plugin):

```bash
pi install moosison/gedeon-construct
node ~/.claude/pi/gedeon-construct/setup.js
```

---

## Skill Patching Note

Skills patched via `/gc-correct` are written to `~/.claude/skills/gc-*/SKILL.md`. The package copy at `gedeon-construct/skills/gc-*/` does **not** auto-update. To propagate improvements back to the package:

```bash
cp ~/.claude/skills/gc-{skill-name}/SKILL.md \
   ~/gedeon-construct/skills/gc-{skill-name}/SKILL.md
```

This divergence is intentional -- live skills stay fast-iteration, the package stays stable.

---

## Persona

**Gedeon** is the Construct's always-active session identity — hyper-logical, rigorous, permanently present. Defined in `GEDEON-DOCTRINE.md` via semantic identity rules (`<rule>`, `<protocol>`, `<mode>`) inspired by the Blackboard/FRIDAY pattern: Gedeon is never summoned, never dismissed. Every session IS Gedeon.

- Every request is classified into a Cynefin domain before a solution is offered
- Every assumption is converted to a probe, a verified fact, or an explicit risk
- Every executed step must emit an observable signal before being marked done
- Behavioral gaps from each session are captured and patched into the skills themselves
- Pipeline work is dispatched to gc-brain; Gedeon synthesizes results into one voice

> "I run the engine room, not the boardroom. Clarity, not comfort."

Greet Gedeon with `"Good morning Gedeon"` at session start — triggers a morning intelligence brief across all registered projects.

---

## Architecture Principles

This package embeds (and requires) the following engineering mandates. Add the `GEDEON-DOCTRINE.md` content to your `~/.claude/CLAUDE.md` to activate them globally:

- Cynefin sense-making as the default entry to every problem
- YAGNI -- the best code is code never written; stop at the first rung that holds
- Probe-before-assume -- convert all assumptions to evidence or explicit risks
- Hexagonal (Ports & Adapters) architecture
- Pessimistic merge -- highest severity wins in all review panels
- Darwin Skill Author -- skills teach HOW to reason, never WHAT to do

---

## License

MIT (c) 2025 moosison

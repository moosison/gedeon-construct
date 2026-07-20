---
name: gc-brain
role: orchestrator
model: opus
model_tier: synthesis
mode: orchestrate
---
// @ai-rules:
// 1. [Constraint]: Reference document, not a dispatch target — the main session performs this role directly, inline, in its own context. Never invoked via `subagent_type: gc-brain`.
// 2. [Constraint]: Not the persona source. Identity is ambient via CLAUDE.md (Gedeon). This file documents Gedeon's own orchestration behavior; there is no separate hand-off — one voice throughout.
// 3. [Pattern]: Cynefin-first on every request. Classify before responding. Never answer from Disorder.
// 4. [Gotcha]: Probe-before-assume — every "probably" is a probe request, not a fact to build on.

# GC Brain — Orchestration Reference (Main-Session Behavior)

**Not a dispatched agent.** Verified by transcript audit (8th Fable-5 consult, 2026-07-11, `.construct/advisories/ADVISORY-fable5-2026-07-11-gc-persona-dispatch-architecture.md`): zero dispatches of `subagent_type: gc-brain` exist across this project's history. The main Claude Code session performs the orchestrator role directly and inline — it classifies intent, runs pipeline-stage skills (`gc-bootstrap`, `gc-plan`, `gc-preflight`, `gc-execute`, `gc-review`, `gc-eop`) one after another in its own context, and dispatches workers for isolated sub-tasks as generic-typed subagents (`subagent_type: claude`/`general-purpose`, never a native `gc-*` slot) briefed with a persona `.md` file's content (`agents/gc-*.md`) as a prompt-embedded brief — confirmed at 150+ real dispatches across `gc-auditor`, `gc-reviewer`, `gc-lean-auditor`, `gc-executor`, `gc-explorer`. This file exists to document that behavior precisely, not to describe a cold-start orchestrator that fires — one was never built because it would strand pipeline state (`.construct/`, plan, ledger) behind a re-briefing boundary for zero isolation benefit; workers already run isolated, which is the isolation that matters.

**Pipeline (run inline by the main session, not by a dispatched orchestrator):** `gc-bootstrap → gc-discuss? → gc-plan → gc-preflight → gc-execute → gc-review → gc-eop`

## Hard Rules

These govern the main session directly — there is no separate orchestrator to delegate them to.

- **Cynefin-first:** Classify every new request before responding. Never answer from Disorder.
- **Probe-before-assume:** Verify before building. Convert every assumption to a verified fact, explicit question, or stated risk.
- **Never skip preflight:** Gate: STOP → improve the plan, then `/gc-preflight` again. Pre-flight is a loop, not a gate.
- **Minimum wins:** Merge auditor and reviewer scores by taking the minimum. Never average.
- **Smallest batch first:** Dispatch wave 1, evaluate results, then dispatch wave 2. No cross-wave speculation.
- **Observable close:** Every completed step must emit a verification signal before being marked done.

## Worker Dispatch Contract

Workers are generic-typed subagents briefed with a persona file's content (`agents/gc-*.md`) — never selected via a native `gc-*` subagent_type slot (those registration slots exist but are never chosen; the skill dispatch tables name the persona file by path instead). Each worker executes within its persona's declared mode (read-only or read-write) and returns structured output per that persona's own output contract. After each worker returns, the main session reassesses the Cynefin classification before dispatching the next wave — domain can shift when new evidence arrives.

**Every worker dispatch — whether listed in a skill's dispatch table or introduced as a named optional/conditional lane — must pass that persona's designed tier explicitly as the `model` parameter on the Agent tool call.** Never omit it and let the harness default apply: an omitted `model` silently runs the dispatch at the parent session's own (typically pricier) tier instead of the persona's designed one. This is the canonical statement of the rule — skill dispatch tables point back here rather than repeating it.

**Session-open trigger:** When the user's first message is a greeting ("Good morning Gedeon", "Good evening Gedeon", any direct address with no pipeline context), invoke `/gc-morning` inline — do not enter the pipeline.

**Budget-Mode Mapping:** dispatch-table Model values are normal-mode tiers. When the resolved plan's frontmatter carries `budget: low`, map each dispatched worker's tier one step down at dispatch time — `opus`→`sonnet`, `sonnet`→`haiku` — subject to the floors below. `haiku` rows and `fable` escalation dispatches are unaffected.

- Normalize the raw value before comparing — trim leading/trailing whitespace, strip a trailing inline `#` comment (everything from an unquoted `#` onward, then re-trim), strip surrounding single/double quotes, compare case-insensitively — `low`, `Low`, `LOW`, `'low'`, `"low"`, and `low  # temporary` all mean low. An absent key or any OTHER value (after that full normalization) means `normal`. Only the user ever sets or changes this field — no skill, agent, or orchestrator flips it.
- Floored at `sonnet` (never haiku): every security lane (gc-review's two `(security lane)` rows, gc-preflight's optional security auditor — these map `opus`→`sonnet`), and gc-preflight's Auditor A (its lens includes Cynefin classification). Deliberately NOT floored (map `sonnet`→`haiku` under low — reduced depth is the explicit meaning of the user's own low-budget choice): gc-preflight Auditors B, C, and D-Lean; gc-preflight's optional platform lane (Hohpe/7-C review — architecture judgment, but not one of the three ratified floor categories); gc-plan's optional research lane (gc-researcher — external knowledge gathering); gc-new-project's optional inception-research lane (gc-inception-researcher — external knowledge gathering; documentation-only, since it dispatches pre-plan so the mapping never attaches); gc-review's four non-security lenses and its conditional reviewers; gc-execute's wave executors. The executor consequence — code written by haiku-tier workers — is deliberate, not an oversight: the user marks a pipeline low-budget precisely when its stakes don't justify full depth. Explorers (gc-plan and gc-bootstrap) are already `haiku` in normal mode and are unaffected; `fable` escalation dispatches are exempt. This walk enumerates every dispatch lane existing at authoring time — a future lane must be added to one of these two lists when it is created, never left to inference.
- Visibility rule: applying this mapping is never silent — every dispatch site that maps a worker's tier down under `budget: low` announces it in user-facing output at dispatch time (e.g. *Budget mode: LOW — security lanes floored at `sonnet`, other lanes mapped one step down*), so a tier downgrade is always a visible event the user can veto, never a quiet frontmatter side effect. (Review hardening 2026-07-16: the user-only-mutation rule above is prose-enforced; visibility is its backstop.)
- This mapping is stated only here — dispatch sites reference it by the name Budget-Mode Mapping and never restate the tier table.

## Output Contract

Governs how the main session communicates as Gedeon. Structure every result for synthesis into Gedeon's voice:

1. **Outcome** — what happened, what was found, what changed (2-3 sentences)
2. **Next stage** — proposed continuation as a question, not a bare `/gc-*` command
3. **Decision points** — flag before dispatching irreversible or genuinely optional next steps; proceed on natural continuations

**Forbidden patterns:**
- *"Run `/gc-eop` to close the pipeline."*
- *"Fix HIGH findings. For MEDIUM/LOW — fix now or track as debt."*
- *"Review the plan above. When approved, run `/gc-preflight`."*

**Allowed patterns:**
- *"Review is clean — one MEDIUM finding fixed. Shall we close the pipeline?"*
- *"Preflight: Gate: PASS (94% display). Shall I kick off the execute wave now?"*
- *"Plan is written. Looks solid — want me to stress-test it with preflight?"*

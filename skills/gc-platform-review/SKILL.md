---
name: gc-platform-review
description: "Reviews platform designs, abstractions, and proposals against Hohpe's Platform Strategy principles. Use when reviewing platform designs, APIs, IaC modules, or evaluating whether an abstraction is a real platform or a basket."
phase: specialist
tags: [platform, abstraction, review, architecture, hohpe]
---

# Platform Design Review

Structured review of platform designs, abstractions, APIs, or proposals using principles from Gregor Hohpe's *Platform Strategy* and his DDD Europe 2025 talk *Platform Engineering is Domain Driven Design*.

## Trigger Phrases

- "review platform design"
- "evaluate platform abstraction"
- "platform architecture review"
- "is this a real platform"
- "check my abstraction"
- "platform review"

## Workflow

### Step 1: Gather the Artifact

Collect from the user:

- **Design document, API spec, IaC module, or proposal** to review
- **Context**: What cloud/infra does it layer on top of? What business domain?
- **Intended users**: Who builds on top of this platform? What are they building?

If no document exists, ask the user to describe the platform in terms of:

1. What it abstracts (cloud services, infrastructure, internal systems)
2. What vocabulary it introduces (API names, resource types, CLI commands)
3. How users interact with it (self-service, tickets, CLI, portal, GitOps)

### Step 2: Apply the Six Tests

Run each test and record a **Pass / Warn / Fail** verdict with evidence.

#### Test 1: Innovation Test (Double Pyramid)

> "If people built something you did not anticipate, that is the mark of a platform."

- Can users build things the platform team did not anticipate?
- Is the top of the pyramid wide (diverse use cases) or narrow (restricted)?
- Is there a "just configure" / "no-code" urge that shrinks the innovation layer?

**Fail indicator**: Users can only do what the platform team pre-planned.

#### Test 2: Cadillac Cimarron Test

> Resist the urge to shrink the top of the pyramid.

- Is the differentiation layer meaningful, or is it "options on a Chevy"?
- Does removing the platform wrapper and using cloud directly produce the same result?

**Fail indicator**: The platform adds options/defaults to cloud services but no new value proposition.

#### Test 3: Abstraction vs Illusion

> "Making things simpler than they are works against you."

- Does the platform introduce a **new domain vocabulary**, or passthrough cloud service names?
- Are hidden settings truly independent, or do they have inter-relationships?
- Does the interface use expressive types, or collapse meaning into overloaded strings/integers?
- Are distributed system realities (backpressure, retry, TTL, ordering, failure modes) surfaced or hidden?

**Fail indicator**: "Lambda-SQS-Lambda" naming; single parameters hiding 30 pages of documentation; no domain language.

#### Test 4: Railway or Guardrail

> "Wherever there's a guardrail, you also want lane assist."

- Are controls self-centering (feedback, transparency, real-time visibility)?
- Are guardrails emergency-only, or are they the primary steering mechanism?
- Do users get rapid feedback (cost, build results, compliance) so they self-correct?

**Fail indicator**: Big guardrails, no pavement. Users hit walls instead of receiving guidance.

#### Test 5: Physical Property Honesty

> "Abstractions cannot hide physical properties."

- Are latency, cost, quotas, and failure modes surfaced in the API/docs?
- Does a "cloud-neutral" abstraction hide fundamentally different physical characteristics?

**Fail indicator**: Queue abstraction that maps to SQS and Pub/Sub without exposing TTL, ordering, or pricing differences.

#### Test 6: Stack Trace / Traceability

> "Like compilers have line number tables, platforms need traceability."

- Can users trace errors from platform-level to infrastructure-level?
- Is cost attributed from platform resources back to cloud spend?

**Fail indicator**: "Platform error 500" with no visibility into which underlying service failed.

### Step 3: Apply the 7 C's Scorecard

Score each dimension (1-5) against the design:

| Quality | Score | Evidence |
| --- | --- | --- |
| Cohesion | | |
| Closure | | |
| Completeness | | |
| Consistency | | |
| Commensurate Value | | |
| Connectedness | | |
| Captivity | | |

Note conscious trade-offs vs accidental gaps.

### Step 4: Loop Position Check

Verify the platform team's position relative to the developer loop:

- Is the platform team IN the deployment cycle (tickets, approvals, "let me show you")?
- Or is the team the axle/bearing that makes the loop spin faster?
- Warning signs: team calendar full of "helping teams" meetings, manual approval steps, "self-service portal" with manual backend.

### Step 5: Generate Review Report

Output a structured review:

```markdown
# Platform Design Review: <Name>

## Summary Verdict: <Pass / Conditional Pass / Fail>

## Test Results

| Test | Verdict | Key Finding |
| --- | --- | --- |
| Innovation (Double Pyramid) | Pass/Warn/Fail | <one-line> |
| Cimarron | Pass/Warn/Fail | <one-line> |
| Abstraction vs Illusion | Pass/Warn/Fail | <one-line> |
| Railway or Guardrail | Pass/Warn/Fail | <one-line> |
| Physical Property Honesty | Pass/Warn/Fail | <one-line> |
| Stack Trace / Traceability | Pass/Warn/Fail | <one-line> |

## 7 C's Scorecard

<table from Step 3>

## Loop Position

<findings from Step 4>

## Recommendations

### HIGH Severity
- <actionable recommendation>

### MEDIUM Severity
- <actionable recommendation>

### LOW Severity
- <actionable recommendation>

## Domain Language Assessment

| Platform Term | Business Concept | Technical Reality | Verdict |
| --- | --- | --- | --- |
| <term> | <business meaning> | <cloud/infra mapping> | New vocabulary / Passthrough / Overloaded |
```

### Step 6: Present for Discussion

Present the review to the user. For each HIGH finding, propose a concrete remediation. For MEDIUM/LOW — fix now if in the current change; never defer technical debt post review.

## References

- Hohpe, G. — *Platform Strategy* — architectelevator.com
- Hohpe, G. — *Platform Engineering is DDD* (DDD Europe 2025)

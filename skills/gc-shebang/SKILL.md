---
name: gc-shebang
description: "Generates or updates AI Shebang headers (@ai-rules) at the top of code files. The header captures file-specific constraints, patterns, and gotchas for future AI edits. Invoke on the current file or files specified by the user."
phase: specialist
tags: [shebang, headers, constraints, patterns]
---

# Generate AI Shebangs

**Trigger:** `/gc-shebang`

## Instructions

1. Look at the currently open file (or the files specified by the user).
2. Analyze the code to understand its specific responsibilities, edge cases, and architectural patterns.
3. Generate a concise but strict "AI Shebang" (block comment) at the top of the file.
4. If a header already exists, strictly review it. Remove outdated rules and add new ones based on the current code logic.
5. Do not modify the actual code logic — only the comment header.

## Format

```typescript
// @ai-rules:
// 1. [Constraint]: Only use React.memo for components in this file.
// 2. [Pattern]: All API calls must pass through the `useSecureFetch` hook.
// 3. [Gotcha]: This file runs on the server edge; do not use `window` object.
```

Use `// @ai-rules:` for TypeScript/JavaScript/Go/Java/C#/PHP/Shell files.
Use `# @ai-rules:` for Python/Ruby files.
Use `/* @ai-rules: ... */` when a multi-line block comment is more appropriate.

## What to Capture

Good shebang entries cover:
- **Constraints**: "No external dependencies", "Pure functions only", "Immutable data structures"
- **Patterns**: "All errors returned as Result<T>", "Use `logger.debug()` not `console.log()`"
- **Gotchas**: "This module is imported server-side only", "Runs in a Web Worker — no DOM access"
- **Dependencies**: "Requires Redis connection from `lib/cache.ts`", "Expects `FEATURE_FLAG_X` env var"
- **Conventions**: "`snake_case` for DB columns, `camelCase` for JS properties throughout"

## When to Auto-Apply

When you edit a file and notice it lacks an `@ai-rules` header, or the header is stale relative to the current code, generate or update it as part of your edit. Do not modify actual logic — header only.

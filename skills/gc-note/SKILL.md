---
name: gc-note
description: "Appends a quick note or idea to .construct/NOTES.md. If no .construct/ directory exists, appends to a session scratchpad instead. Use for capturing fleeting ideas without disrupting flow."
phase: capture
tags: [note, capture, idea, quick]
---

# Quick Note

**Captures a thought without disrupting the current workflow.**

## Steps

### Step 1: Determine Target

- If `.construct/NOTES.md` exists → append there
- If `.construct/` exists but no `NOTES.md` → create `.construct/NOTES.md` then append
- If no `.construct/` exists → append to `~/.claude/notes-scratchpad.md` with a timestamp

### Step 2: Format and Append

Append to the target file:

```markdown
---
**{YYYY-MM-DD HH:MM}** — {note text}
```

If the user's input is empty, ask: "What would you like to note?"

### Step 3: Confirm

Confirm the note was saved with the file path. No further action.

## Notes

- Never reformat or summarize the user's note — append verbatim.
- Never interrupt planning or execution to process the note further.
- Notes in `.construct/NOTES.md` are reviewed during `/gc-eop` as potential session learnings.

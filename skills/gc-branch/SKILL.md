---
name: gc-branch
description: "GitHub branching strategy advisor. Detects team size and prescribes solo/small-team/full-team model, naming conventions, PR workflow, branch protection, hotfix flows, and commit conventions."
tags: [github, branching, workflow, git]
---

# GitHub Branching Strategy

## Step 1 — Detect Team Size

Before recommending a workflow, determine the team size. Check `.construct/config.json` for a `teamSize` field first — if present and non-empty, use that. Otherwise ask:

> "How many people actively commit to this repository?"

| Size       | Contributors |
|------------|--------------|
| Solo       | 1            |
| Small team | 2–5          |
| Full team  | 5+           |

Then refer to the matching reference file:
- Solo → `references/solo.md`
- Small team → `references/small-team.md`
- Full team → `references/full-team.md`

---

## Branch Models by Team Size

### Solo (1 contributor)
```
feature/* ──► main
```
- No dev or staging branch needed.
- PRs are still required (enables CI checks and a reviewable diff).
- See `references/solo.md` for full details.

### Small Team (2–5 contributors)
```
feature/* ──► staging ──► main
hotfix/*  ──► main  (then backmerge to staging)
```
- `staging` acts as the integration and QA branch.
- See `references/small-team.md` for full details.

### Full Team (5+ contributors)
```
feature/* ──► dev ──► staging ──► main
hotfix/*  ──► main (then backmerge to staging and dev)
release/* ──► main
```
- `dev` is the daily integration target; `staging` is pre-production.
- See `references/full-team.md` for full details.

---

## Branch Protection Rules (always apply to `main`)

These rules must be enforced on `main` regardless of team size:

- **Require a pull request** before merging — no direct pushes, ever.
- **Require at least 1 approving review** (2 reviews for full teams).
- **Require status checks to pass** before merging (CI, linting, tests).
- **Dismiss stale reviews** when new commits are pushed.
- **Restrict who can push** to `main` (admins only via PR merge).

Configure in: **Settings → Branches → Branch protection rules**.

---

## Naming Conventions

| Purpose   | Pattern                   | Example                    |
|-----------|---------------------------|----------------------------|
| Feature   | `feature/short-description` | `feature/user-auth`       |
| Hotfix    | `hotfix/issue-or-description` | `hotfix/login-crash`    |
| Release   | `release/vX.Y.Z`          | `release/v2.4.0`           |
| Chore     | `chore/description`       | `chore/upgrade-deps`       |
| Bug fix   | `fix/description`         | `fix/null-pointer`         |
| Docs      | `docs/description`        | `docs/api-reference`       |

Rules:
- All lowercase, hyphens only (no underscores or spaces).
- Keep descriptions short and meaningful (3–5 words max).
- Include ticket/issue number when available: `feature/PROJ-42-user-auth`.

---

## Hotfix Flow

Hotfixes bypass the normal merge train to ship critical fixes fast:

```
1. Branch off main:     git checkout -b hotfix/description main
2. Apply the fix and commit.
3. Open PR → main.
4. After merge, tag the release: git tag -a v1.2.1 -m "hotfix: description"
5. Backmerge to dev/staging:
     git checkout dev && git merge main && git push
```

**Never** branch hotfixes off `dev` or `staging` — they may contain unreleased code.

---

## Commit Message Format (Conventional Commits)

```
type(scope): short description

[optional body]

[optional footer: Closes #123]
```

| Type       | When to use                              |
|------------|------------------------------------------|
| `feat`     | New feature                              |
| `fix`      | Bug fix                                  |
| `hotfix`   | Critical production fix                  |
| `chore`    | Maintenance, tooling, dependency updates |
| `docs`     | Documentation only                       |
| `refactor` | Code restructure, no behavior change     |
| `test`     | Adding or updating tests                 |

Examples:
```
feat(auth): add OAuth2 login support
fix(api): handle null response from /users endpoint
hotfix(payments): prevent double-charge on retry
chore: upgrade eslint to v9
```

---

## PR Checklist

Output this template when a user asks for a PR checklist or is about to open a PR:

```markdown
## PR Checklist

- [ ] Branch named correctly (`feature/`, `fix/`, `hotfix/`, etc.)
- [ ] Conventional commit messages used throughout
- [ ] No direct pushes to `main` (branch protection enforced)
- [ ] Linked issue or ticket in description (Closes #N)
- [ ] Self-reviewed the diff before requesting review
- [ ] All CI status checks pass
- [ ] Tests added or updated where applicable
```

---

## GitHub Actions — Branch Protection Enforcement (Optional)

Offer to generate this snippet when the user wants automated enforcement:

```yaml
# .github/workflows/branch-protection.yml
name: Branch Protection

on:
  pull_request:
    branches: [main, staging, dev]

jobs:
  check-branch-name:
    runs-on: ubuntu-latest
    steps:
      - name: Validate branch name
        run: |
          BRANCH="${{ github.head_ref }}"
          if ! echo "$BRANCH" | grep -qE '^(feature|fix|hotfix|release|chore|docs|refactor|test)/.+'; then
            echo "Branch name '$BRANCH' does not follow naming conventions."
            echo "Expected: feature/*, fix/*, hotfix/*, release/*, chore/*, docs/*"
            exit 1
          fi

  check-commit-messages:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Lint commit messages
        uses: wagoid/commitlint-github-action@v6
```

Add a `commitlint.config.js` at the repo root to enforce Conventional Commits:

```js
// commitlint.config.js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

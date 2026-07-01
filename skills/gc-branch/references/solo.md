# Solo Branching Reference

**Team size:** 1 contributor

---

## Branch Model

```
feature/* ──► main
fix/*     ──► main
hotfix/*  ──► main
```

No `dev` or `staging` branch. You are the only reviewer, so a lightweight model avoids unnecessary overhead while still keeping `main` stable.

---

## Why PRs Still Matter (Even Solo)

- CI runs on every PR, catching regressions before they land on `main`.
- The diff gives you a structured self-review moment before merging.
- History is clean and readable — each feature is a single merge commit or squash.
- Mirrors team habits so onboarding a second contributor is frictionless.

---

## Recommended Workflow

```bash
# 1. Start a new feature
git checkout -b feature/my-feature main

# 2. Work and commit
git add .
git commit -m "feat(scope): add my feature"

# 3. Push and open a PR
git push -u origin feature/my-feature
# Open PR on GitHub → merge into main → delete branch

# 4. Pull main locally
git checkout main && git pull
```

---

## Branch Protection Settings for `main`

| Setting                        | Value   |
|-------------------------------|---------|
| Require pull request          | Yes     |
| Required approving reviews    | 0 (self-merge allowed) |
| Require status checks         | Yes     |
| No direct pushes              | Yes     |

> Setting required reviews to 0 lets you self-merge but still enforces CI. Increase to 1 the moment a second contributor joins.

---

## Hotfix Flow (Solo)

```bash
git checkout -b hotfix/critical-bug main
# fix, commit
git push -u origin hotfix/critical-bug
# Open PR → merge → tag
git tag -a v1.0.1 -m "hotfix: critical-bug"
git push origin v1.0.1
```

---

## Commit Conventions

Use Conventional Commits for a clean `git log`:

```
feat(scope): short description
fix(scope): short description
hotfix(scope): short description
chore: upgrade dependencies
docs: update README
```

---

## When to Graduate to Small Team

Move to the small-team model when:
- A second contributor is added (even temporarily).
- You want a persistent staging environment for testing before production.
- Deploys are automated and you need a gate before `main`.

# Full Team Branching Reference

**Team size:** 5+ contributors

---

## Branch Model

```
feature/* ──► dev ──► staging ──► main
fix/*     ──► dev
hotfix/*  ──► main  (then backmerge → staging → dev)
release/* ──► main
```

Three long-lived integration branches provide clear separation between active development, pre-production QA, and production.

---

## Persistent Branches

| Branch    | Purpose                                          | Direct pushes? |
|-----------|--------------------------------------------------|----------------|
| `main`    | Production. Only release/* and hotfix/* land here. | Never        |
| `staging` | Pre-production / UAT. Promoted from `dev`.       | Never          |
| `dev`     | Daily integration. All feature work targets here. | Never         |

All other branches (`feature/*`, `fix/*`, `hotfix/*`, `release/*`) are short-lived and deleted after merge.

---

## Recommended Workflow

### Feature Development

```bash
# 1. Branch off dev
git checkout -b feature/PROJ-123-checkout-redesign dev

# 2. Work and commit with Conventional Commits
git commit -m "feat(checkout): redesign payment step UI"

# 3. Push and open PR → dev
git push -u origin feature/PROJ-123-checkout-redesign
# 2 approvals + CI required → squash-merge → delete branch
```

### Promoting to Staging

```bash
# When dev is stable and ready for QA
# Open a promotion PR: dev → staging
# No new code — this is a gate review only
# QA team signs off → 2 approvals → merge
```

### Releasing to Production

```bash
# 1. Cut a release branch from staging
git checkout -b release/v2.5.0 staging

# 2. Bump version, update changelog, final tweaks only
git commit -m "chore(release): bump version to 2.5.0"

# 3. PR: release/v2.5.0 → main (2 approvals, full CI)
# 4. After merge, tag
git tag -a v2.5.0 -m "release: v2.5.0"
git push origin v2.5.0

# 5. Backmerge release branch into staging and dev
git checkout staging && git merge main && git push
git checkout dev && git merge main && git push
```

---

## Hotfix Flow

```bash
# 1. Branch off main — never off dev or staging
git checkout -b hotfix/PROJ-999-session-expiry main

# 2. Fix, test, commit
git commit -m "hotfix(auth): fix premature session expiry"

# 3. PR → main (2 approvals, CI required, expedited review)
git push -u origin hotfix/PROJ-999-session-expiry

# 4. Merge → tag
git tag -a v2.5.1 -m "hotfix: fix premature session expiry"
git push origin v2.5.1

# 5. Backmerge in order: main → staging → dev
git checkout staging && git merge main && git push
git checkout dev && git merge staging && git push
```

---

## Branch Protection Settings

### `main`

| Setting                        | Value           |
|-------------------------------|-----------------|
| Require pull request          | Yes             |
| Required approving reviews    | 2               |
| Dismiss stale reviews         | Yes             |
| Require status checks         | Yes (all)       |
| No direct pushes              | Yes             |
| Restrict who can merge        | Release manager / lead |
| Require linear history        | Yes (squash or rebase) |

### `staging`

| Setting                        | Value   |
|-------------------------------|---------|
| Require pull request          | Yes     |
| Required approving reviews    | 2       |
| Require status checks         | Yes     |
| No direct pushes              | Yes     |

### `dev`

| Setting                        | Value   |
|-------------------------------|---------|
| Require pull request          | Yes     |
| Required approving reviews    | 1       |
| Require status checks         | Yes     |
| No direct pushes              | Yes     |

---

## Naming Conventions

```
feature/PROJ-123-checkout-redesign
fix/PROJ-88-broken-pagination
hotfix/PROJ-999-session-expiry
release/v2.5.0
chore/upgrade-node-20
docs/PROJ-200-api-reference
refactor/PROJ-150-extract-auth-service
```

---

## PR Checklist

```markdown
- [ ] Branch targets `dev` (or `main` for hotfixes, `main` for releases)
- [ ] Branch named correctly with ticket number
- [ ] Conventional commit messages throughout
- [ ] Linked issue/ticket (Closes #N)
- [ ] Self-reviewed diff before requesting review
- [ ] All CI status checks pass
- [ ] 2 team members have approved
- [ ] No unresolved review threads
- [ ] Release notes / changelog updated (for release/* branches)
```

---

## Commit Message Format

```
feat(checkout): redesign payment step UI
fix(auth): handle expired JWT on refresh
hotfix(auth): fix premature session expiry
chore(deps): upgrade eslint to v9
docs(api): document /v2/users endpoint
refactor(auth): extract token validation to service
test(checkout): add unit tests for payment step
```

---

## GitHub Actions — Branch Enforcement

```yaml
# .github/workflows/branch-protection.yml
name: Branch Protection

on:
  pull_request:
    branches: [main, staging, dev]

jobs:
  validate-branch:
    runs-on: ubuntu-latest
    steps:
      - name: Validate branch name
        run: |
          BRANCH="${{ github.head_ref }}"
          if ! echo "$BRANCH" | grep -qE '^(feature|fix|hotfix|release|chore|docs|refactor|test)/.+'; then
            echo "ERROR: Branch '$BRANCH' does not follow naming conventions."
            exit 1
          fi

  validate-target:
    runs-on: ubuntu-latest
    steps:
      - name: Validate merge target
        run: |
          BASE="${{ github.base_ref }}"
          HEAD="${{ github.head_ref }}"
          if echo "$HEAD" | grep -q "^hotfix/" && [ "$BASE" != "main" ]; then
            echo "ERROR: hotfix/* branches must target main, not $BASE."
            exit 1
          fi
          if echo "$HEAD" | grep -q "^release/" && [ "$BASE" != "main" ]; then
            echo "ERROR: release/* branches must target main, not $BASE."
            exit 1
          fi
```

---

## Merge Strategy Recommendations

| Branch target | Merge strategy        | Why                                      |
|---------------|-----------------------|------------------------------------------|
| `dev`         | Squash merge          | Clean history, one commit per feature    |
| `staging`     | Merge commit          | Preserve promotion audit trail           |
| `main`        | Merge commit          | Explicit release marker in history       |

---

## Semantic Versioning Quick Reference

```
v MAJOR . MINOR . PATCH
         │       │       └── hotfix (backwards-compatible bug fix)
         │       └────────── feature (backwards-compatible new functionality)
         └────────────────── breaking change
```

Tag every merge to `main`: `git tag -a vX.Y.Z -m "release: vX.Y.Z"`

# Small Team Branching Reference

**Team size:** 2–5 contributors

---

## Branch Model

```
feature/* ──► staging ──► main
fix/*     ──► staging ──► main
hotfix/*  ──► main  (then backmerge → staging)
```

`staging` is the integration branch — all work lands here first, gets tested, then promotes to `main` as a release.

---

## Persistent Branches

| Branch    | Purpose                                      | Direct pushes? |
|-----------|----------------------------------------------|----------------|
| `main`    | Production. Tagged releases only.            | Never          |
| `staging` | QA / integration. Merged features accumulate here. | Never (PR only) |

All other branches (`feature/*`, `fix/*`, `hotfix/*`) are short-lived and deleted after merge.

---

## Recommended Workflow

```bash
# 1. Branch off staging (or main for hotfixes)
git checkout -b feature/PROJ-42-user-auth staging

# 2. Work and commit
git commit -m "feat(auth): add OAuth2 login"

# 3. Push and open PR → staging
git push -u origin feature/PROJ-42-user-auth
# Review, CI must pass, 1 approval required → merge

# 4. When staging is tested and stable, open PR → main
# This is a release promotion PR; no new code here.
```

---

## Branch Protection Settings

### `main`

| Setting                        | Value   |
|-------------------------------|---------|
| Require pull request          | Yes     |
| Required approving reviews    | 1       |
| Require status checks         | Yes     |
| No direct pushes              | Yes     |
| Restrict who can merge        | Lead(s) only |

### `staging`

| Setting                        | Value   |
|-------------------------------|---------|
| Require pull request          | Yes     |
| Required approving reviews    | 1       |
| Require status checks         | Yes     |
| No direct pushes              | Yes     |

---

## Hotfix Flow

Critical bugs that cannot wait for the next staging cycle:

```bash
# 1. Branch off main — NOT staging
git checkout -b hotfix/payment-crash main

# 2. Fix and commit
git commit -m "hotfix(payments): prevent double-charge on retry"

# 3. PR → main (1 approval, CI must pass)
git push -u origin hotfix/payment-crash

# 4. After merge, tag the release
git checkout main && git pull
git tag -a v1.3.1 -m "hotfix: prevent double-charge on retry"
git push origin v1.3.1

# 5. Backmerge into staging so it doesn't fall behind
git checkout staging && git merge main && git push
```

---

## Naming Conventions

```
feature/PROJ-42-user-auth
fix/broken-search-pagination
hotfix/payment-crash
chore/upgrade-node-18
docs/api-endpoints
```

---

## PR Checklist

```markdown
- [ ] Branch targets `staging` (or `main` for hotfixes)
- [ ] Branch named correctly (feature/, fix/, hotfix/)
- [ ] Conventional commit messages
- [ ] Linked issue/ticket (Closes #N)
- [ ] Self-reviewed diff
- [ ] CI status checks pass
- [ ] 1 team member has approved
```

---

## Release Cadence Suggestion

- Merge features into `staging` continuously (trunk-based).
- Promote `staging` → `main` on a schedule (weekly, or after QA sign-off).
- Tag every `main` merge with a version: `v1.4.0`.

---

## When to Graduate to Full Team

Move to the full-team model when:
- PRs to `staging` create merge conflicts regularly.
- You need a dedicated `dev` branch for experimental or in-progress work.
- The team grows beyond 5 active contributors.
- You adopt a release manager or formal sprint cadence.

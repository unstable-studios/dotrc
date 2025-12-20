# Branch Protection Rules

To enforce code quality and release discipline, configure these branch protection rules on `main`:

## Steps in GitHub

1. Go to **Settings** → **Branches** → **Branch protection rules** → **Add rule** for `main`
2. Enable:
   - ✅ **Require status checks to pass before merging**
     - CI (Rust tests)
     - Validate PR Title (conventional commits)
     - Release Please (automated workflow; runs on push to `main`, not a PR status check)
   - ✅ **Require branches to be up to date before merging**
   - ✅ **Require pull request reviews before merging** (optional, 1 approval recommended)
   - ✅ **Require conversation resolution before merging**
   - ✅ **Require status checks to pass** (select: `CI`, `validate-pr-title`)
   - ✅ **Require code reviews from code owners** (if using CODEOWNERS)
   - ✅ **Allow auto-merge** (optional, for convenience)

## What This Enforces

- All commits follow conventional format (feat, fix, docs, chore, etc.)
- All tests pass before merge
- Release Please PR can merge (version bump + changelog ready)
- At least one approval (if you set that)

## Release Workflow With These Rules

1. Developer makes commits with `feat:`, `fix:`, `docs:` prefixes
2. Opens PR with title matching the format (auto-checked)
3. CI runs tests
4. Validates PR title format
5. If all pass, PR can be merged
6. Release Please detects the merge, opens a **release PR** with version bump + changelog
7. Merge the release PR
8. GitHub creates release + tag
9. Build artifacts attach to release

## Notes

- Branch protection rules are per-repository in GitHub UI
- Can't be committed to repo (they're admin settings)
- Recommended scopes: `core`, `wasm`, `server`, `worker`, `web`, `sdk`, `docs`
- `requireScope: false` means scope is optional (e.g., `docs: update readme` works fine)

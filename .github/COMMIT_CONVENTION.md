# Commit Message Convention

DotRC uses [Conventional Commits](https://www.conventionalcommits.org/) for automatic versioning and changelog generation.

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Types

- `feat:` - New feature (bumps minor version)
- `fix:` - Bug fix (bumps patch version)
- `perf:` - Performance improvement
- `docs:` - Documentation changes
- `style:` - Code style changes (whitespace, formatting, missing semicolons)
- `refactor:` - Code refactoring (no functional change)
- `test:` - Test additions/changes
- `build:` - Build system or dependency changes
- `chore:` - Maintenance tasks
- `ci:` - CI/CD configuration changes

## Breaking Changes

Add `!` after type or `BREAKING CHANGE:` in footer to bump major version:

```
feat!: change command interface

BREAKING CHANGE: create_link now takes LinkGrants struct instead of separate arguments
```

## Scopes (optional)

Scope is optional — commits like `docs: update readme` are valid. When provided, scope must be one of:

- `repo` - repository-wide configs and maintenance
- `infra` - CI/CD, workflows, deployment scripts
- `core` - dotrc-core crate
- `wasm` - dotrc-core-wasm
- `server` - dotrc-server
- `worker` - dotrc-worker
- `web` - dotrc-web UI app
- `sdk` - dotrc-sdk TypeScript client
- `docs` - documentation

## Examples

```
feat(core): add support for no_std mode

Enables dotrc-core to run in embedded and WASM environments
without the Rust standard library.

feat(core): introduce LinkGrants struct

Reduces create_link argument count by bundling grants.
```

```
fix(core): prevent duplicate links in validation

Validates that identical links aren't created twice.
```

```
chore(infra): pin release-please action by SHA

Improve supply-chain safety by pinning third-party action commit.
```

```
docs: expand data model documentation

Add entity relationship diagram and detailed field descriptions
for all domain entities.
```

## Release Process

1. Commit changes using conventional format
2. Push to main
3. Release Please opens a PR with:
   - Version bump in Cargo.toml
   - Updated CHANGELOG.md
   - All changes since last release
4. Review and merge the release PR
5. GitHub creates release + builds artifacts

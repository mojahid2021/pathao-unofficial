# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-13

First stable production release. Includes critical bug fixes, dead-code removal, and code-quality improvements over the 0.1.x series.

### Added
- GitHub Packages publishing support (`@mojahid2021/pathao-unofficial`).
- **npmjs.com auto-publish**: the publish workflow now publishes to **both npmjs.com** (via `NPM_TOKEN` secret) **and GitHub Packages** (via `GITHUB_TOKEN`) in parallel when a GitHub Release is created.
- GitHub Actions CI workflow: runs tests against Node.js 18, 20, and 22 on every push and pull request.
- GitHub Actions publish workflow: three-job pipeline — `test` gate, then `publish-npm` (npmjs.com) and `publish-gpr` (GitHub Packages) run in parallel.
- `CHANGELOG.md` following the Keep a Changelog format.
- `exports` field in `package.json` for standards-compliant ESM resolution.
- New regression test `runIssueTokenBodyTest` validating the refresh-token request body.

### Fixed
- **Critical:** `issueToken` never included `refresh_token` in the request body for `refresh_token` grants — the field was destructured but excluded from `requestBody`, causing all token refresh calls to fail with 400 Bad Request.
- `createAuthTables` used the SQLite-specific `AUTOINCREMENT` keyword, which caused a SQL syntax error on MySQL (`AUTO_INCREMENT`) and PostgreSQL (`SERIAL`). The function is now adapter-aware.
- Off-by-one error in `fetchWithRetry`: retryable HTTP errors used `<= maxAttempts` while network errors used `< maxAttempts`, giving HTTP errors one unintended extra retry. Both paths now use `<`.
- `SQLiteAdapter.close()` fired the underlying callback-based `database.close()` without awaiting completion, so callers that `await adapter.close()` would continue before the connection was actually released. Now properly promisified.
- `sqlite.verbose()` was unconditionally enabled, flooding production logs. Verbose mode is now opt-in via `SQLITE_VERBOSE=1`.

### Changed
- Scoped package name from `pathao-unofficial` to `@mojahid2021/pathao-unofficial` for GitHub Packages compatibility.
- Extracted shared `makeAuthenticatedPost` helper to eliminate ~30 lines of duplicated boilerplate between `calculatePrice` and `createOrder`.
- `estimateDelivery` is no longer `async` (it performs no I/O); the redundant inner function is removed.
- `buildAdapterConfig` no longer redundantly calls `.toLowerCase()` on a type already normalised by the caller.
- `normalizeQueryResult` in `location.js` dropped its unused `adapter` parameter.

### Removed
- Dead `REQUIRED_PATHAO_ENV_VARS` constant in `env.js` (declared but never used).
- Dead `SUPPORTED` import in `schema.js` (imported but never referenced).
- Dead `fetchJson` wrapper in `sync.js` (single-line pass-through with no added value).

## [0.1.0] - 2025-01-01

Initial release.

### Added
- `PathaoClient` class with `estimateDelivery` and `version` methods.
- OAuth token management: `issueToken`, `saveToken`, `getLatestToken`, `refreshToken`, `getAndSaveTokenFromEnv`, `refreshAndSaveTokenFromDb`.
- Delivery API: `calculatePrice`, `createOrder`.
- Location API: `getCities`, `getZones`, `getAreas`, `getLocationHierarchy`, `seedLocationData`.
- Location sync: `syncLocationsOnce`, `triggerLocationSync` (background polling with exponential backoff).
- Database adapters for SQLite, PostgreSQL, MySQL, and MongoDB.
- Schema helpers: `createLocationTables`, `dropLocationTables`, `createAuthTables`, `dropAuthTables`.
- Environment helper: `getPathaoConfigFromEnv` with dotenv fallback.

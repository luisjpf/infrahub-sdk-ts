# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-03-03

### Added
- CODE_OF_CONDUCT.md (Contributor Covenant v2.1)
- CONTRIBUTING.md with development setup and PR process
- SECURITY.md with vulnerability reporting instructions
- GitHub Actions CI workflow (Node 20/22, build, lint, test with coverage)
- 90% coverage thresholds enforced via vitest (lines, branches, functions, statements)
- `examples/` directory with `basic-crud.ts` and `codegen-workflow.ts`
- `InfrahubNode.setAttribute()` convenience method
- `isNodeSchema`, `getAttributeNames`, `getRelationshipNames`, `getRelationshipByName` exported from public API
- `InfrahubTransport.address` getter for the configured server address
- LRU cache eviction for `SchemaManager` branch caches (`maxCacheBranches`, default 20)

### Changed
- **BREAKING**: `InfrahubTransport.login()` now throws `AuthenticationError` when no credentials are configured (previously silently returned)
- **BREAKING**: `GraphQLError` message format changed to `GraphQL error: <messages> (query: <preview>)` with query truncation at 200 characters
- `package.json` license corrected from MIT to Apache-2.0
- `package.json` author set to OpsMill, repository/bugs/homepage URLs added
- `ProxyHttpClient` now uses per-request undici dispatcher instead of process-wide `NODE_TLS_REJECT_UNAUTHORIZED` (fixes TLS race condition)
- `SchemaManager.buildBaseUrl()` uses `transport.address` instead of URL string replacement
- `cli.ts` reads version dynamically from `package.json` instead of hardcoded `"0.1.0"`
- `cli.ts` uses `import.meta.url` comparison for direct-execution detection

### Fixed
- `isNodeSchema` type guard now uses both negative (`used_by`) and positive (`default_filter`, `inherit_from`, `hierarchy`, `human_friendly_id`) discriminants
- `SchemaManager.setCache()` now participates in LRU eviction tracking
- `Math.max(120, 60)` no-op replaced with literal `120` in schema load/check timeouts
- `examples/basic-crud.ts` no longer calls non-existent `setAttribute()` method

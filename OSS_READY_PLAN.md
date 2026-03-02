# Open-Source Release Readiness Plan

Prioritized checklist for preparing `infrahub-sdk` (TypeScript) for public release.

## P0 — Must Have (Blockers)

- [x] **LICENSE** — Add Apache-2.0 license file (align with Python SDK)
- [x] **package.json license field** — Change `"license": "MIT"` → `"license": "Apache-2.0"`
- [x] **package.json metadata** — Add `repository`, `bugs`, `homepage` fields
- [x] **README.md overhaul** — Badges, install, quickstart, CLI, codegen, testing, support links
- [x] **CONTRIBUTING.md** — Dev setup, coding standards, PR process
- [x] **SECURITY.md** — Vulnerability reporting instructions
- [x] **CODE_OF_CONDUCT.md** — Contributor Covenant v2.1
- [x] **.gitignore hardening** — Exclude `.claude/`, `.env*`, editor configs
- [x] **Secrets scan** — Verify no API tokens, internal URLs, or credentials in source
- [x] **CI workflow** — GitHub Actions: build + test + lint on push/PR

## P1 — Should Have (Pre-Launch)

- [x] **examples/ directory** — At least 2 runnable examples (basic CRUD, codegen workflow)
- [x] **Docker E2E workflow** — GitHub Actions workflow behind `workflow_dispatch` trigger
- [ ] **CHANGELOG.md** — At least an initial `0.1.0` entry
- [ ] **npm publish workflow** — GitHub Actions: publish to npm on tag/release
- [ ] **Issue & PR templates** — `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] **TypeDoc setup** — `typedoc.json` config, `npm run docs` script, plan for hosting

## P2 — Nice to Have (Post-Launch)

- [ ] **Dependabot config** — `.github/dependabot.yml` for dependency updates
- [ ] **Branch protection rules** — Require CI pass, review approval
- [ ] **Codecov / coverage badge** — Integrate coverage reporting in CI
- [ ] **Prefetch relationships** — Outstanding feature from Phase 2
- [ ] **API documentation site** — TypeDoc-generated, hosted on GitHub Pages
- [ ] **Example projects** — More examples: branches, batch ops, IP allocation, recording/playback
- [ ] **Scoped package** — Consider `@opsmill/infrahub-sdk` if publishing under org

## Files to Create

| File | Priority | Notes |
|------|----------|-------|
| `LICENSE` | P0 | Apache-2.0 full text |
| `CONTRIBUTING.md` | P0 | Dev setup, standards, PR process |
| `CODE_OF_CONDUCT.md` | P0 | Contributor Covenant v2.1 |
| `SECURITY.md` | P0 | Vulnerability reporting |
| `.github/workflows/ci.yml` | P0 | Build + test + lint |
| `.github/workflows/docker-e2e.yml` | P1 | Manual trigger, Docker-based E2E |
| `examples/basic-crud.ts` | P1 | Basic CRUD operations example |
| `examples/codegen-workflow.ts` | P1 | Code generation usage example |

## Files to Modify

| File | Priority | Changes |
|------|----------|---------|
| `package.json` | P0 | License, repository, bugs, homepage, keywords, author |
| `README.md` | P0 | Badges, expanded sections, support links |
| `.gitignore` | P0 | Add `.claude/`, `.env*`, editor configs |

## Files to Delete

| File | Priority | Reason |
|------|----------|--------|
| `PLAN.md` | P1 | Internal implementation plan; move to `docs/` or remove |

## Notes

- The Python SDK uses Apache-2.0; this SDK should align for consistency.
- TypeDoc is recommended over a custom doc site — plan the config but don't build the full site now.
- The `author` field in package.json should reference the maintainer or organization, not just a first name.
- No secrets, internal URLs, or credentials were found in the codebase.
- All 379 unit tests pass. No TODOs remain in source code.

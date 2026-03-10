# Claude instructions for contributors

Build
  npm ci
  npm run build

Test
  npm test
  npm run test:coverage

Lint
  npm run lint  # if available

CLI
  npx ts-node --files ./bin/infrahub-sdk or use the npm script 'npm run cli' if present

Examples
  See ./examples for runnable TypeScript examples (basic-crud, codegen-workflow)

Notes
  - For codegen: see README codegen section.
  - Avoid committing editor-specific settings; .claude/ is ignored.

## Feature Delivery Workflow

Default loop for delivering features and non-trivial changes:

  1. Project overview  — what and why (optional for small follow-ups/bug fixes)
  2. Tech spec         — approach, decisions, affected areas (use docs/decision-records/ for significant changes)
  3. Quality spec      — definition of done: tests, perf, compatibility
  4. Tasks             — break into concrete units, roughly one PR each
  5. PRs               — implement and open pull requests
  6. Review PR         — check correctness, style, tests, consistency
  7. Fix all issues    — address feedback; repeat review+fix up to 3 times
  8. Human review      — maintainer gives final approval (never skipped)
  9. Merge

If issues persist after 3 fix cycles, stop and discuss the approach with the maintainer.

See docs/ai-workflow.md for the full workflow description and AI_POLICY.md for AI usage rules.

# AI-Assisted Development Workflow

This document describes the end-to-end workflow for delivering features and changes using AI assistance in this repository.

## The Delivery Loop

```
project overview → tech spec → quality spec → tasks → PRs → review PR → fix issues (up to 3 passes) → human review → merge
```

### Steps

1. **Project overview** — Define what you're building and why. For small follow-ups or bug fixes, this can be skipped.

2. **Tech spec** — Write a brief technical specification covering the approach, key decisions, and affected areas. Lives in `docs/decision-records/` for significant changes.

3. **Quality spec** — Define what "done" looks like: test coverage expectations, performance constraints, API compatibility requirements.

4. **Tasks** — Break the work into concrete, reviewable units. Each task should map to roughly one PR.

5. **PRs** — Implement and open pull requests. AI can draft code, but the contributor owns the result.

6. **Review PR** — Review for correctness, style, test coverage, and consistency with existing code. AI can assist with review.

7. **Fix issues (up to 3 passes)** — Address review feedback. If issues remain after 3 fix-and-review cycles, escalate to the maintainer for a design discussion — the approach may need rethinking.

8. **Human review** — A human maintainer gives final approval. This step is never skipped.

9. **Merge** — Squash or merge per the project's convention.

## Where Things Live

| Artifact | Location |
|----------|----------|
| Decision records | `docs/decision-records/DR-NNN.md` |
| AI policy | `AI_POLICY.md` (repo root) |
| Contribution guide | `CONTRIBUTING.md` (repo root) |
| PR template | `.github/pull_request_template.md` |
| Claude agent instructions | `CLAUDE.md` (repo root) |
| This workflow doc | `docs/ai-workflow.md` |

## Principles

- **AI is a tool, not an authority.** Every merged change has a human behind it.
- **Transparency over secrecy.** Disclose AI usage in PRs. No one will judge you for using tools effectively.
- **Validate everything.** AI output must pass CI, tests, and review — same as human code.
- **Keep it practical.** Specs and docs should be useful, not ceremonial. Skip what doesn't add value for a given change.

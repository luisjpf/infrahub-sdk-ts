# AI Policy

This document covers how AI tools (LLMs, code assistants, agents) are used in this repository.

## Allowed Usage

- **Code generation and editing** — drafting implementations, refactoring, writing tests.
- **Documentation** — generating and improving docs, decision records, and comments.
- **Code review assistance** — AI can flag issues, suggest improvements, and check consistency.
- **Research and exploration** — understanding codebases, APIs, and design trade-offs.
- **Commit messages and PR descriptions** — drafting with human review before submission.

## Prohibited Usage

- **Secrets and credentials** — never pass API tokens, passwords, private keys, or `.env` contents to AI tools. Never let AI generate or commit secrets.
- **Blind merges** — AI-generated code must not be merged without human review. No exceptions.
- **Final security decisions** — AI can assist with security analysis, but a human must make the final call on vulnerability assessments, disclosure timelines, and security architecture.
- **Final legal decisions** — license compliance, data privacy assessments, and legal interpretations require human judgment.
- **Skipping validation** — AI output must pass the same CI checks, tests, and review standards as human-written code.

## Human Accountability

Every change merged into this repository has a human accountable for it. AI is a tool, not an author of record. The person who opens the PR owns the code — they are responsible for understanding it, testing it, and standing behind it.

If AI-generated code causes a bug or regression, the human who approved the merge is responsible for the fix.

## PR Disclosure

When AI tools contributed meaningfully to a PR (beyond autocomplete or trivial suggestions):

1. Check the AI disclosure box in the PR template.
2. Briefly note which parts were AI-assisted.
3. Include `Co-Authored-By` trailers in commits where applicable.

This is about transparency, not gatekeeping. AI-assisted PRs are welcome and go through the same review process as any other PR.

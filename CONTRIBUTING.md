# Contributing to infrahub-sdk

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- npm >= 9

### Getting Started

```bash
git clone https://github.com/opsmill/infrahub-sdk-ts.git
cd infrahub-sdk-ts
npm install
```

### Build

```bash
npm run build          # Compile TypeScript → dist/
npm run clean          # Remove dist/
```

### Test

```bash
npm test               # Run unit tests (vitest)
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
npm run test:e2e       # Run Docker-based E2E tests (requires Docker)
```

### Lint

```bash
npm run lint           # TypeScript type-checking (tsc --noEmit)
```

## Making Changes

1. **Fork** the repository and create a branch from `main`.
2. **Write tests** for any new functionality or bug fixes.
3. **Run the full test suite** (`npm test`) and ensure all tests pass.
4. **Run the linter** (`npm run lint`) and fix any type errors.
5. **Keep commits focused** — one logical change per commit.

## Pull Request Process

1. Update documentation if your change affects the public API or CLI.
2. Ensure all CI checks pass.
3. Write a clear PR description explaining *what* and *why*.
4. PRs require at least one review before merging.

## Code Style

- TypeScript strict mode is enabled — no `any` unless absolutely necessary.
- Use `async`/`await` over raw Promises.
- Prefer named exports over default exports.
- Keep dependencies minimal — add a new dependency only when clearly justified.

## Reporting Issues

- Use [GitHub Issues](https://github.com/opsmill/infrahub-sdk-ts/issues) for bug reports and feature requests.
- Include reproduction steps, expected behavior, and actual behavior.
- For security vulnerabilities, see [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](./LICENSE).

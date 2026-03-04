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

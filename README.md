# infrahub-sdk

[![CI](https://github.com/opsmill/infrahub-sdk-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/opsmill/infrahub-sdk-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/infrahub-sdk)](https://www.npmjs.com/package/infrahub-sdk)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

TypeScript SDK for [Infrahub](https://github.com/opsmill/infrahub) — an infrastructure management platform that provides a unified API for network and infrastructure data.

## Installation

```bash
npm install infrahub-sdk
```

## Quick Start

```typescript
import { InfrahubClient } from "infrahub-sdk";

const client = new InfrahubClient({
  address: "http://localhost:8000",
  apiToken: "your-api-token",
});

// Create a node
const device = await client.create("InfraDevice", {
  name: "router1",
  role: "spine",
});
await client.save(device);

// Fetch all nodes of a kind
const devices = await client.all("InfraDevice");

// Get a single node by ID
const site = await client.get("InfraSite", { id: "site-uuid" });

// Filter nodes
const active = await client.filters("InfraDevice", {
  role__value: "spine",
});

// Count nodes
const total = await client.count("InfraDevice");

// Delete a node
await client.delete("InfraDevice", device.id!);
```

## Code Generation

Generate typed TypeScript interfaces from your Infrahub schema for compile-time safety.

### 1. Export your schema

```bash
npx infrahub-sdk schema export \
  --address http://localhost:8000 \
  --api-token your-token \
  --output schema.json
```

### 2. Generate types

```bash
npx infrahub-sdk codegen --schema schema.json --output src/generated
```

This produces one file per schema kind plus an index and typed-client helper:

```
src/generated/
├── infra-device.ts        # InfraDevice, InfraDeviceCreate, InfraDeviceData
├── infra-site.ts          # InfraSite, InfraSiteCreate, InfraSiteData
├── typed-client.ts        # TypedInfrahubClient, createTypedClient
└── index.ts               # Barrel exports
```

### 3. Use the typed client

```typescript
import { InfrahubClient } from "infrahub-sdk";
import { createTypedClient } from "./generated/index.js";

const client = new InfrahubClient({ address: "http://localhost:8000" });
const typed = createTypedClient(client);

// Type-safe CRUD — IDE autocompletion for fields
const device = await typed.device.create({
  name: "router1",
  description: "Core router",
  site: { id: "site-uuid" },
});

const allDevices = await typed.device.all();
const site = await typed.site.get({ id: "site-uuid" });
await typed.device.delete("device-uuid");
```

## CLI Reference

```bash
npx infrahub-sdk --help
```

| Command | Description |
|---------|-------------|
| `codegen -s <file> [-o <dir>]` | Generate TypeScript types from schema JSON |
| `schema export [-a <url>] [-o <file>]` | Export schema from a running Infrahub server |

### Examples

```bash
# Export schema from a running server
npx infrahub-sdk schema export \
  --address http://localhost:8000 \
  --branch main \
  --output schema.json

# Generate types from the exported schema
npx infrahub-sdk codegen \
  --schema schema.json \
  --output src/generated

# Generate without generic schemas
npx infrahub-sdk codegen \
  --schema schema.json \
  --output src/generated \
  --no-generics
```

## Features

- **CRUD operations** — create, get, all, filters, count, delete
- **Branch management** — create, merge, rebase, delete
- **Relationships** — cardinality one/many with mutation tracking
- **Batch operations** — concurrent execution with configurable concurrency
- **IP pool allocation** — allocate next IP address/prefix
- **Group context** — tracking mode for automatic group membership
- **Schema management** — fetch, cache, load, check, export
- **Object store** — file upload/download
- **Request recording** — record/playback for testing
- **TLS/proxy support** — custom CA, insecure mode, HTTP proxy
- **Configurable retry** — exponential backoff with jitter
- **Code generation** — typed interfaces and typed client from schema
- **CLI tool** — codegen and schema export commands

## Configuration

```typescript
const client = new InfrahubClient({
  // Connection
  address: "http://localhost:8000",   // or INFRAHUB_ADDRESS env var
  apiToken: "your-token",            // or INFRAHUB_API_TOKEN env var

  // Branch
  defaultBranch: "main",

  // Timeouts & concurrency
  timeout: 60,
  maxConcurrentExecution: 5,
  paginationSize: 50,

  // Retry policy
  retryOnFailure: false,
  retryDelay: 5,
  retryBackoff: "exponential",       // "constant" | "exponential"
  retryMaxDelay: 60,
  retryJitter: true,

  // TLS / proxy
  proxyUrl: "http://proxy:3128",
  tlsInsecure: false,
  tlsCaFile: "/path/to/ca.pem",
});
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage (enforces 90% thresholds)
npm run test:coverage

# Type-check without emitting
npm run lint
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.7 (for development)

## License

[Apache-2.0](LICENSE)

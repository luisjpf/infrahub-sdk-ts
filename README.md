# infrahub-sdk-ts

TypeScript SDK for [Infrahub](https://github.com/opsmill/infrahub) — an infrastructure management platform.

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

// Fetch nodes
const devices = await client.all("InfraDevice");
const site = await client.get("InfraSite", { id: "site-uuid" });

// Branch operations
await client.branch.create("feature-branch");
const branchedClient = client.clone("feature-branch");
```

## Code Generation

Generate typed TypeScript interfaces from your Infrahub schema for compile-time safety.

### 1. Export your schema

```bash
# From a running Infrahub server
npx infrahub-sdk schema export --address http://localhost:8000 --output schema.json

# Or with API token and specific branch
npx infrahub-sdk schema export \
  --address http://localhost:8000 \
  --api-token your-token \
  --branch main \
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

### 3. Use typed client

```typescript
import { InfrahubClient } from "infrahub-sdk";
import { createTypedClient } from "./generated/index.js";

const client = new InfrahubClient({ address: "http://localhost:8000" });
const typed = createTypedClient(client);

// Type-safe CRUD — IDE autocompletion for fields
const device = await typed.device.create({
  name: "router1",     // required: string
  description: "...",  // optional: string
  site: { id: "..." }, // relationship reference
});

const allDevices = await typed.device.all();
const site = await typed.site.get({ id: "site-uuid" });
await typed.device.delete("device-uuid");
```

## CLI Reference

```bash
npx infrahub-sdk --help
npx infrahub-sdk codegen --help
npx infrahub-sdk schema export --help
```

| Command | Description |
|---------|-------------|
| `codegen -s <file> [-o <dir>]` | Generate types from schema JSON |
| `schema export [-a <url>] [-o <file>]` | Export schema from server |

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
- **Code generation** — typed interfaces from schema
- **CLI tool** — codegen and schema export commands

## Configuration

```typescript
const client = new InfrahubClient({
  address: "http://localhost:8000",  // or INFRAHUB_ADDRESS env var
  apiToken: "your-token",           // or INFRAHUB_API_TOKEN env var
  defaultBranch: "main",
  timeout: 60,
  maxConcurrentExecution: 5,
  retryOn: [502, 503, 504],
  retryDelay: 1000,
  retryBackoff: "exponential",
  retryMaxDelay: 30000,
  retryJitter: true,
});
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.7 (for development)

## License

MIT

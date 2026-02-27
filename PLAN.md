# Infrahub TypeScript SDK — Implementation Plan

## 1. Architecture Overview

The TypeScript SDK mirrors the Python SDK's layered architecture, adapted for TypeScript idioms (async/await, strong generics, interfaces over inheritance).

```
┌─────────────────────────────────────────────────────┐
│                   User Application                  │
├─────────────────────────────────────────────────────┤
│              InfrahubClient (Public API)             │
│  create() · get() · all() · filters() · delete()    │
│  executeGraphQL() · branch · schema                 │
├──────────┬──────────────┬───────────────────────────┤
│  Branch  │    Schema    │      Node System           │
│  Manager │    Manager   │  InfrahubNode · Attribute  │
│          │              │  RelatedNode · Relationship│
├──────────┴──────────────┴───────────────────────────┤
│              GraphQL Query Builder                   │
│         Query · Mutation · Renderers                 │
├─────────────────────────────────────────────────────┤
│               Transport Layer (HTTP)                 │
│         fetch/axios · auth · retry · headers         │
├─────────────────────────────────────────────────────┤
│                Configuration                        │
│           InfrahubConfig · validation                │
├─────────────────────────────────────────────────────┤
│                  Error Types                        │
│  InfrahubError hierarchy (typed, structured)         │
└─────────────────────────────────────────────────────┘
```

### Key Principles
- **Clean architecture**: strict separation of transport / schema / model / client layers
- **No business logic in transport layer**: transport only handles HTTP, auth, headers, retry
- **Full TypeScript types**: no `any` unless absolutely necessary
- **Extensible**: adding new node types requires minimal code (schema-driven)
- **Testable**: all layers mockable/injectable via interfaces
- **Async-first**: TypeScript is inherently async; no sync variant needed (unlike Python)

## 2. Module Breakdown

### `src/config.ts` — Configuration
- `InfrahubConfig` interface with all settings (address, auth, timeout, pagination, branch, etc.)
- `createConfig()` factory with defaults and validation
- Environment variable support (`INFRAHUB_ADDRESS`, `INFRAHUB_API_TOKEN`, etc.)

### `src/errors.ts` — Error Hierarchy
- `InfrahubError` (base class extending Error)
- `ServerNotReachableError`, `ServerNotResponsiveError`
- `GraphQLError` (carries query, variables, errors array)
- `AuthenticationError`, `NodeNotFoundError`, `SchemaNotFoundError`
- `BranchNotFoundError`, `ValidationError`

### `src/transport.ts` — HTTP Transport
- `HttpClient` interface (injectable for testing)
- `FetchHttpClient` default implementation using native `fetch`
- Handles: headers, auth tokens (`X-INFRAHUB-KEY` / Bearer), retry logic, timeout
- Token refresh on 401 "Expired Signature"
- No business logic — pure HTTP concerns

### `src/graphql/` — GraphQL Query Building
- `query.ts`: `GraphQLQuery` and `GraphQLMutation` classes
- `renderer.ts`: Render query/mutation dicts to GraphQL strings
- Mirrors Python's dict-based query building approach

### `src/schema/` — Schema Management
- `types.ts`: `NodeSchema`, `AttributeSchema`, `RelationshipSchema` interfaces
- `manager.ts`: `SchemaManager` — fetch, cache (per-branch), get by kind
- Fetches schemas from `/api/schema/` REST endpoint
- Cache invalidation on branch switch

### `src/node/` — Node System
- `node.ts`: `InfrahubNode` — dynamic, schema-driven node representation
- `attribute.ts`: `Attribute` class (value, metadata, mutation tracking)
- `related-node.ts`: `RelatedNode` for cardinality-one relationships
- `relationship-manager.ts`: `RelationshipManager` for cardinality-many
- Nodes track dirty state for optimized mutations

### `src/branch.ts` — Branch Management
- `BranchManager` class
- `BranchData` interface
- Operations: `create()`, `delete()`, `merge()`, `rebase()`, `get()`, `all()`

### `src/store.ts` — Node Store
- In-memory cache for retrieved nodes
- Indexed by id, hfid, custom keys
- Used for relationship resolution

### `src/client.ts` — Main Client (Public API)
- `InfrahubClient` class — main entry point
- Aggregates: SchemaManager, BranchManager, NodeStore, HttpClient
- Public methods: `create()`, `get()`, `all()`, `filters()`, `delete()`, `count()`
- `executeGraphQL()` for raw queries
- `clone()` for branch-specific clients

### `src/index.ts` — Public Exports
- Re-exports: `InfrahubClient`, `InfrahubConfig`, all error types, `InfrahubNode`

## 3. TypeScript-Idiomatic Design Decisions

| Concern | Python SDK | TypeScript SDK |
|---------|-----------|---------------|
| Async pattern | Dual async + sync classes | Async-only (Promises) — TS has no sync HTTP |
| Config validation | Pydantic BaseSettings | Zod schemas with env parsing |
| Type safety | Runtime-only (mostly) | Compile-time generics + runtime Zod validation |
| Node attributes | `__getattr__` / `__setattr__` magic | Proxy-based dynamic access or typed getter/setter |
| Error hierarchy | Class inheritance | Class inheritance (same pattern works in TS) |
| HTTP client | httpx built-in | Interface + fetch implementation (injectable) |
| Serialization | Pydantic models | Zod schemas + TypeScript interfaces |
| GraphQL building | Dict-based with renderers | Same dict-based approach (works well in TS) |
| Dependency injection | Constructor params | Constructor params with interfaces |

### Key TypeScript Adaptations

1. **No sync variant needed**: TypeScript/Node.js is inherently async. We provide async-only API.

2. **Proxy-based nodes**: Instead of Python's `__getattr__`, use ES6 Proxy for dynamic attribute access on nodes, while maintaining type safety through generics.

3. **Zod for validation**: Replace Pydantic with Zod for runtime config validation and schema parsing.

4. **Interface-first design**: Every injectable dependency has a corresponding interface (HttpClient, Logger, etc.).

5. **Generic client methods**: `client.get<T>()` returns typed nodes when schema type is known.

## 4. File/Folder Structure

```
infrahub-sdk-ts/
├── src/
│   ├── index.ts                 # Public API exports
│   ├── client.ts                # InfrahubClient main class
│   ├── config.ts                # Configuration types + validation
│   ├── errors.ts                # Error class hierarchy
│   ├── store.ts                 # NodeStore (in-memory cache)
│   ├── transport.ts             # HTTP transport layer
│   ├── branch.ts                # BranchManager + BranchData
│   ├── types.ts                 # Shared type definitions
│   ├── graphql/
│   │   ├── index.ts             # Re-exports
│   │   ├── query.ts             # Query + Mutation builders
│   │   └── renderer.ts          # Dict → GraphQL string renderer
│   ├── schema/
│   │   ├── index.ts             # Re-exports
│   │   ├── types.ts             # Schema type definitions
│   │   └── manager.ts           # SchemaManager (fetch, cache)
│   └── node/
│       ├── index.ts             # Re-exports
│       ├── node.ts              # InfrahubNode class
│       ├── attribute.ts         # Attribute class
│       ├── related-node.ts      # RelatedNode (cardinality one)
│       └── relationship-manager.ts  # RelationshipManager (cardinality many)
├── tests/
│   ├── unit/
│   │   ├── config.test.ts
│   │   ├── transport.test.ts
│   │   ├── client.test.ts
│   │   ├── branch.test.ts
│   │   ├── store.test.ts
│   │   ├── graphql/
│   │   │   ├── query.test.ts
│   │   │   └── renderer.test.ts
│   │   ├── schema/
│   │   │   └── manager.test.ts
│   │   └── node/
│   │       ├── node.test.ts
│   │       └── attribute.test.ts
│   └── fixtures/
│       └── schemas.ts           # Test schema fixtures
├── docs/
│   └── decision-records/
│       └── DR-001.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── PLAN.md
└── README.md
```

## 5. Testing Strategy

### Unit Tests (vitest)
- **Transport**: Mock fetch, verify headers, auth, retry, error mapping
- **GraphQL**: Query/Mutation rendering, variable handling
- **Schema**: Schema parsing, caching, branch-scoped cache
- **Node**: Attribute mutation tracking, input data generation, query data generation
- **Branch**: All operations with mocked GraphQL execution
- **Client**: CRUD operations with mocked transport
- **Config**: Defaults, env vars, validation

### Integration Tests (future)
- Requires running Infrahub instance
- Full CRUD cycle on test branch
- Schema fetch and node creation
- Branch create/merge/delete lifecycle

### Test Patterns
- **Dependency injection**: All tests inject mock implementations
- **Fixtures**: Reusable schema/node fixtures in `tests/fixtures/`
- **No network calls in unit tests**: Transport layer fully mocked

## 6. Phased Delivery

### Phase 1 — MVP (Current)
- [x] Project scaffolding (tsconfig, package.json, vitest)
- [x] Configuration system with validation
- [x] Error hierarchy
- [x] HTTP transport layer with auth
- [x] GraphQL query/mutation builder
- [x] Schema types and SchemaManager
- [x] Node model (InfrahubNode, Attribute)
- [x] Basic CRUD: create, get, all, delete
- [x] Branch management (create, get, all, delete, merge)
- [x] InfrahubClient public API
- [x] Comprehensive unit tests
- [x] NodeStore

### Phase 2 — Enhanced Features
- [x] `filters()` with full filter support
- [x] `count()` operation
- [x] Relationship support (RelatedNode, RelationshipManager)
- [x] Pagination (automatic cursor-based)
- [x] `clone()` for branch-scoped clients
- [x] Batch operations
- [x] Query include/exclude fields
- [ ] Prefetch relationships

### Phase 3 — Advanced
- [ ] Tracking mode (group context)
- [ ] Schema load/check/export
- [ ] Object store
- [ ] Request recording/playback for testing
- [ ] Custom logger support
- [ ] Retry with configurable backoff
- [ ] TLS/proxy configuration
- [ ] IP address/prefix pool allocation

### Phase 4 — Developer Experience
- [ ] Code generation from schema (typed node classes)
- [ ] CLI tool (infrahubctl equivalent)
- [ ] Published npm package
- [ ] Full API documentation
- [ ] Example projects

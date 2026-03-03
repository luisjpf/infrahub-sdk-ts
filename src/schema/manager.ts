import { SchemaNotFoundError, ValidationError } from "../errors.js";
import type { InfrahubTransport } from "../transport.js";
import { isNodeSchema } from "./types.js";
import type { GenericSchema, NodeSchema, SchemaType } from "./types.js";

/** Response shape from /api/schema?branch=X */
interface SchemaAPIResponse {
  nodes: NodeSchema[];
  generics: GenericSchema[];
}

/** Response from /api/schema/load */
export interface SchemaLoadResponse {
  hash: string;
  previous_hash: string;
  errors: Record<string, unknown>;
  warnings: SchemaWarning[];
  schema_updated: boolean;
}

/** Warning from schema load/check */
export interface SchemaWarning {
  type: string;
  kinds: SchemaWarningKind[];
  message: string;
}

/** Kind reference in a schema warning */
export interface SchemaWarningKind {
  kind: string;
  field?: string;
}

/** Response from /api/schema/check */
export interface SchemaCheckResponse {
  valid: boolean;
  diff: Record<string, unknown>;
  errors: Record<string, unknown>;
}

/** Exported schema organized by namespace */
export interface SchemaExport {
  namespaces: Record<string, NamespaceExport>;
}

/** Single namespace in a schema export */
export interface NamespaceExport {
  nodes: NodeSchema[];
  generics: GenericSchema[];
}

/** Namespaces excluded from export by default (internal system namespaces). */
const RESTRICTED_NAMESPACES = new Set([
  "Account", "Branch", "Builtin", "Core", "Deprecated", "Diff",
  "Infrahub", "Internal", "Lineage", "Schema", "Profile", "Template",
]);

/**
 * SchemaManager — fetches, caches, and provides schema definitions.
 * Maintains a per-branch cache to avoid redundant API calls.
 * Mirrors Python SDK's `InfrahubSchema`.
 */
export class SchemaManager {
  private readonly transport: InfrahubTransport;
  private readonly defaultBranch: string;

  /** Per-branch schema cache: branch → (kind → schema) */
  private cache: Map<string, Map<string, SchemaType>> = new Map();
  /** Insertion-order tracking for LRU eviction of branch caches. */
  private cacheOrder: string[] = [];
  /** Maximum number of branch caches to retain (0 = unlimited). */
  private readonly maxCacheBranches: number;

  constructor(transport: InfrahubTransport, defaultBranch: string, maxCacheBranches: number = 20) {
    this.transport = transport;
    this.defaultBranch = defaultBranch;
    this.maxCacheBranches = maxCacheBranches;
  }

  /**
   * Get a schema by kind string. Fetches from server if not cached.
   */
  async get(kind: string, branch?: string): Promise<SchemaType> {
    const branchName = branch ?? this.defaultBranch;

    // Check cache first
    const branchCache = this.cache.get(branchName);
    if (branchCache) {
      const cached = branchCache.get(kind);
      if (cached) {
        return cached;
      }
    }

    // Cache miss — fetch all schemas for this branch
    await this.fetchAll(branchName);

    const updatedCache = this.cache.get(branchName);
    const schema = updatedCache?.get(kind);
    if (!schema) {
      throw new SchemaNotFoundError(kind);
    }

    return schema;
  }

  /**
   * Get all schemas for a branch. Fetches from server if not cached.
   */
  async all(branch?: string): Promise<Map<string, SchemaType>> {
    const branchName = branch ?? this.defaultBranch;

    if (!this.cache.has(branchName)) {
      await this.fetchAll(branchName);
    }

    return this.cache.get(branchName) ?? new Map();
  }

  /**
   * Fetch all schemas from the API for a given branch and populate the cache.
   */
  private async fetchAll(branch: string): Promise<void> {
    const url = `${this.buildBaseUrl()}/api/schema?branch=${encodeURIComponent(branch)}`;
    const response = await this.transport.get(url);

    const data = response.data as SchemaAPIResponse;
    const branchCache = new Map<string, SchemaType>();

    if (data.nodes) {
      for (const node of data.nodes) {
        branchCache.set(node.kind, node);
      }
    }

    if (data.generics) {
      for (const generic of data.generics) {
        branchCache.set(generic.kind, generic);
      }
    }

    this.cache.set(branch, branchCache);
    this.touchCacheOrder(branch);
  }

  /** Manually set a schema in the cache (useful for testing). */
  setCache(kind: string, schema: SchemaType, branch?: string): void {
    const branchName = branch ?? this.defaultBranch;
    if (!this.cache.has(branchName)) {
      this.cache.set(branchName, new Map());
    }
    this.cache.get(branchName)!.set(kind, schema);
    this.touchCacheOrder(branchName);
  }

  /** Clear the cache for a specific branch or all branches. */
  clearCache(branch?: string): void {
    if (branch) {
      this.cache.delete(branch);
      this.cacheOrder = this.cacheOrder.filter((b) => b !== branch);
    } else {
      this.cache.clear();
      this.cacheOrder = [];
    }
  }

  /** Check if a schema is cached for a given kind and branch. */
  hasCached(kind: string, branch?: string): boolean {
    const branchName = branch ?? this.defaultBranch;
    return this.cache.get(branchName)?.has(kind) ?? false;
  }

  /**
   * Load schemas into the Infrahub server.
   * This sends schema definitions to the server for registration.
   *
   * @param schemas - Array of schema definition objects to load
   * @param branch - Target branch (defaults to defaultBranch)
   * @returns SchemaLoadResponse with hash info and any warnings/errors
   */
  async load(
    schemas: Record<string, unknown>[],
    branch?: string,
  ): Promise<SchemaLoadResponse> {
    if (schemas.length === 0) {
      throw new ValidationError("schemas", "At least one schema must be provided");
    }

    const branchName = branch ?? this.defaultBranch;
    const url = `${this.buildBaseUrl()}/api/schema/load?branch=${encodeURIComponent(branchName)}`;

    // Schema loads can take a while — enforce a 2-minute minimum timeout
    const response = await this.transport.post(
      url,
      { schemas },
      undefined,
      120,
    );

    if (response.status === 401 || response.status === 403) {
      throw new ValidationError("schemas", "Not authorized to load schemas");
    }

    const data = response.data as Record<string, unknown>;

    if (response.status === 422 || response.status === 400) {
      return {
        hash: "",
        previous_hash: "",
        errors: data,
        warnings: [],
        schema_updated: false,
      };
    }

    // Invalidate cache for this branch since schema may have changed
    this.clearCache(branchName);

    const hash = (data.hash as string) ?? "";
    const previousHash = (data.previous_hash as string) ?? "";
    const warnings = (data.warnings as SchemaWarning[]) ?? [];

    return {
      hash,
      previous_hash: previousHash,
      errors: {},
      warnings,
      schema_updated: hash !== previousHash,
    };
  }

  /**
   * Check schemas against the server without loading them.
   * Returns whether the schemas are valid and any diff/error details.
   *
   * @param schemas - Array of schema definition objects to validate
   * @param branch - Target branch (defaults to defaultBranch)
   * @returns Tuple of [isValid, responseData]
   */
  async check(
    schemas: Record<string, unknown>[],
    branch?: string,
  ): Promise<[boolean, Record<string, unknown> | null]> {
    if (schemas.length === 0) {
      throw new ValidationError("schemas", "At least one schema must be provided");
    }

    const branchName = branch ?? this.defaultBranch;
    const url = `${this.buildBaseUrl()}/api/schema/check?branch=${encodeURIComponent(branchName)}`;

    const response = await this.transport.post(
      url,
      { schemas },
      undefined,
      120,
    );

    const data = response.data as Record<string, unknown> | null;

    if (response.status === 202) {
      return [true, data];
    }

    if (response.status === 422) {
      return [false, data];
    }

    return [false, null];
  }

  /**
   * Export user-defined schemas, organized by namespace.
   * Excludes internal/system namespaces by default.
   *
   * @param branch - Branch to export from (defaults to defaultBranch)
   * @param namespaces - Optional list of specific namespaces to include
   * @returns SchemaExport object organized by namespace
   */
  async export(branch?: string, namespaces?: string[]): Promise<SchemaExport> {
    const branchName = branch ?? this.defaultBranch;

    // Ensure schemas are fetched
    await this.fetchAll(branchName);

    const branchCache = this.cache.get(branchName) ?? new Map<string, SchemaType>();
    const result: SchemaExport = { namespaces: {} };

    for (const schema of branchCache.values()) {
      const ns = schema.namespace;

      // Filter by requested namespaces if provided
      if (namespaces && namespaces.length > 0) {
        if (!namespaces.includes(ns)) {
          continue;
        }
      } else {
        // Exclude restricted namespaces by default
        if (RESTRICTED_NAMESPACES.has(ns)) {
          continue;
        }
      }

      if (!result.namespaces[ns]) {
        result.namespaces[ns] = { nodes: [], generics: [] };
      }

      const nsExport = result.namespaces[ns]!;

      if (isNodeSchema(schema)) {
        nsExport.nodes.push(schema);
      } else {
        nsExport.generics.push(schema as GenericSchema);
      }
    }

    return result;
  }

  /** Build the base API URL from the transport's configured address. */
  private buildBaseUrl(): string {
    return this.transport.address;
  }

  /** Update LRU order for a branch and evict oldest if over limit. */
  private touchCacheOrder(branch: string): void {
    this.cacheOrder = this.cacheOrder.filter((b) => b !== branch);
    this.cacheOrder.push(branch);

    if (this.maxCacheBranches > 0) {
      while (this.cacheOrder.length > this.maxCacheBranches) {
        const oldest = this.cacheOrder.shift();
        if (oldest) {
          this.cache.delete(oldest);
        }
      }
    }
  }
}

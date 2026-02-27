import { SchemaNotFoundError } from "../errors.js";
import type { InfrahubTransport } from "../transport.js";
import type { GenericSchema, NodeSchema, SchemaType } from "./types.js";

/** Response shape from /api/schema/?branch=X */
interface SchemaAPIResponse {
  nodes: NodeSchema[];
  generics: GenericSchema[];
}

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

  constructor(transport: InfrahubTransport, defaultBranch: string) {
    this.transport = transport;
    this.defaultBranch = defaultBranch;
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
    const url = `${this.transport.buildGraphQLUrl().replace("/graphql", "")}/api/schema/?branch=${encodeURIComponent(branch)}`;
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
  }

  /** Manually set a schema in the cache (useful for testing). */
  setCache(kind: string, schema: SchemaType, branch?: string): void {
    const branchName = branch ?? this.defaultBranch;
    if (!this.cache.has(branchName)) {
      this.cache.set(branchName, new Map());
    }
    this.cache.get(branchName)!.set(kind, schema);
  }

  /** Clear the cache for a specific branch or all branches. */
  clearCache(branch?: string): void {
    if (branch) {
      this.cache.delete(branch);
    } else {
      this.cache.clear();
    }
  }

  /** Check if a schema is cached for a given kind and branch. */
  hasCached(kind: string, branch?: string): boolean {
    const branchName = branch ?? this.defaultBranch;
    return this.cache.get(branchName)?.has(kind) ?? false;
  }
}

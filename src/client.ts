import { InfrahubBatch } from "./batch.js";
import { BranchManager } from "./branch.js";
import type { InfrahubConfig, InfrahubConfigInput } from "./config.js";
import { createConfig } from "./config.js";
import {
  AuthenticationError,
  GraphQLError,
  NodeNotFoundError,
  URLNotFoundError,
} from "./errors.js";
import { GraphQLMutation, GraphQLQuery } from "./graphql/query.js";
import type { IPAddressAllocationOptions, IPAllocationResult, IPPrefixAllocationOptions } from "./ip-pool.js";
import {
  buildIPAddressAllocationMutation,
  buildIPPrefixAllocationMutation,
  parseAllocationResponse,
} from "./ip-pool.js";
import { InfrahubNode } from "./node/node.js";
import { ObjectStore } from "./object-store.js";
import { SchemaManager } from "./schema/manager.js";
import { isNodeSchema } from "./schema/types.js";
import { NodeStore } from "./store.js";
import { InfrahubTransport } from "./transport.js";
import type { HttpClient, Logger } from "./types.js";

/**
 * Main client for interacting with the Infrahub API.
 * Provides CRUD operations on nodes, branch management, schema access,
 * and raw GraphQL execution.
 *
 * Mirrors the Python SDK's `InfrahubClient`.
 */
export class InfrahubClient {
  readonly config: InfrahubConfig;
  readonly transport: InfrahubTransport;
  readonly schema: SchemaManager;
  readonly branch: BranchManager;
  readonly store: NodeStore;
  readonly objectStore: ObjectStore;
  readonly defaultBranch: string;

  constructor(
    config?: InfrahubConfigInput,
    options?: {
      httpClient?: HttpClient;
      logger?: Logger;
    },
  ) {
    this.config = createConfig(config ?? {});
    this.defaultBranch = this.config.defaultBranch;

    this.transport = new InfrahubTransport(
      this.config,
      options?.httpClient,
      options?.logger,
    );

    this.schema = new SchemaManager(this.transport, this.defaultBranch);
    this.store = new NodeStore(this.defaultBranch);
    this.branch = new BranchManager(this.executeGraphQL.bind(this));
    this.objectStore = new ObjectStore(this.transport);
  }

  /**
   * Return a cloned client scoped to a different branch.
   * Shares the same config (except defaultBranch).
   */
  clone(branch?: string): InfrahubClient {
    const configInput: InfrahubConfigInput = {
      address: this.config.address,
      apiToken: this.config.apiToken,
      username: this.config.username,
      password: this.config.password,
      defaultBranch: branch ?? this.config.defaultBranch,
      timeout: this.config.timeout,
      paginationSize: this.config.paginationSize,
      maxConcurrentExecution: this.config.maxConcurrentExecution,
      retryOnFailure: this.config.retryOnFailure,
      retryDelay: this.config.retryDelay,
      maxRetryDuration: this.config.maxRetryDuration,
    };
    return new InfrahubClient(configInput);
  }

  /**
   * Create a new batch for concurrent task execution.
   */
  createBatch(options?: {
    maxConcurrentExecution?: number;
    returnExceptions?: boolean;
  }): InfrahubBatch {
    return new InfrahubBatch({
      maxConcurrentExecution: options?.maxConcurrentExecution ?? this.config.maxConcurrentExecution,
      returnExceptions: options?.returnExceptions,
    });
  }

  /**
   * Authenticate with the server (username/password auth).
   * Not needed when using API token authentication.
   */
  async login(): Promise<void> {
    await this.transport.login();
  }

  /**
   * Create a new (unsaved) node instance.
   * The node exists only locally until `save()` is called.
   */
  async create(
    kind: string,
    data: Record<string, unknown> = {},
    branch?: string,
  ): Promise<InfrahubNode> {
    const branchName = branch ?? this.defaultBranch;
    const schema = await this.schema.get(kind, branchName);
    return new InfrahubNode({ schema, branch: branchName, data });
  }

  /**
   * Save a node to the server (create or update).
   * New nodes are created; existing nodes are updated.
   */
  async save(node: InfrahubNode, timeout?: number): Promise<void> {
    if (node.isExisting) {
      await this.update(node, timeout);
    } else {
      await this.createOnServer(node, timeout);
    }
    this.store.set(node);
  }

  /**
   * Get a single node by ID or filter criteria.
   */
  async get(
    kind: string,
    options: {
      id?: string;
      hfid?: string[];
      branch?: string;
      timeout?: number;
      populateStore?: boolean;
      [key: string]: unknown;
    } = {},
  ): Promise<InfrahubNode> {
    const { id, hfid, branch, timeout, populateStore = true, ...filters } = options;
    const branchName = branch ?? this.defaultBranch;
    const schema = await this.schema.get(kind, branchName);

    const queryFilters: Record<string, unknown> = { ...filters };

    if (id) {
      // Check if it's a UUID or a default filter value
      if (isNodeSchema(schema) && schema.default_filter && !isUUID(id)) {
        queryFilters[schema.default_filter] = id;
      } else {
        queryFilters["ids"] = [id];
      }
    }

    if (hfid) {
      queryFilters["hfid"] = hfid;
    }

    if (Object.keys(queryFilters).length === 0) {
      throw new Error("At least one filter must be provided to get()");
    }

    const results = await this.all(kind, {
      branch: branchName,
      timeout,
      filters: queryFilters,
      populateStore,
    });

    if (results.length === 0) {
      throw new NodeNotFoundError({
        identifier: queryFilters,
        nodeType: kind,
        branchName,
      });
    }

    if (results.length > 1) {
      throw new Error("More than 1 node returned");
    }

    return results[0]!;
  }

  /**
   * Retrieve all nodes of a given kind with automatic pagination.
   * If neither offset nor limit is provided, all pages are fetched automatically.
   */
  async all(
    kind: string,
    options: {
      branch?: string;
      timeout?: number;
      offset?: number;
      limit?: number;
      filters?: Record<string, unknown>;
      populateStore?: boolean;
      includeRelationships?: boolean;
      partialMatch?: boolean;
    } = {},
  ): Promise<InfrahubNode[]> {
    const {
      branch, timeout, offset, limit, filters,
      populateStore = true, includeRelationships, partialMatch,
    } = options;
    const branchName = branch ?? this.defaultBranch;
    const schema = await this.schema.get(kind, branchName);

    // If explicit offset/limit supplied, do a single-page fetch
    if (offset !== undefined || limit !== undefined) {
      return this.fetchPage(schema, branchName, {
        filters, offset, limit, timeout, populateStore,
        includeRelationships, partialMatch,
      });
    }

    // Automatic pagination: fetch all pages
    const paginationSize = this.config.paginationSize;
    const allNodes: InfrahubNode[] = [];
    let pageNumber = 0;
    let hasMore = true;

    while (hasMore) {
      const pageOffset = pageNumber * paginationSize;
      const pageNodes = await this.fetchPage(schema, branchName, {
        filters,
        offset: pageOffset,
        limit: paginationSize,
        timeout,
        populateStore,
        includeRelationships,
        partialMatch,
        returnCount: true,
      });

      allNodes.push(...pageNodes);

      // Check if there are more pages
      if (pageNodes.length < paginationSize) {
        hasMore = false;
      } else {
        pageNumber++;
      }
    }

    return allNodes;
  }

  /**
   * Query nodes with the full filter DSL.
   * Filters are passed as keyword-style arguments mirroring the Python SDK.
   *
   * @example
   * ```ts
   * const results = await client.filters("TestPerson", {
   *   name__value: "John",
   *   status__values: ["active", "pending"],
   *   partialMatch: true,
   * });
   * ```
   */
  async filters(
    kind: string,
    options: {
      branch?: string;
      timeout?: number;
      offset?: number;
      limit?: number;
      populateStore?: boolean;
      partialMatch?: boolean;
      includeRelationships?: boolean;
      [key: string]: unknown;
    } = {},
  ): Promise<InfrahubNode[]> {
    const {
      branch, timeout, offset, limit, populateStore = true,
      partialMatch, includeRelationships,
      ...filterArgs
    } = options;
    const branchName = branch ?? this.defaultBranch;

    const filters: Record<string, unknown> = { ...filterArgs };

    return this.all(kind, {
      branch: branchName,
      timeout,
      offset,
      limit,
      filters,
      populateStore,
      partialMatch,
      includeRelationships,
    });
  }

  /**
   * Return the count of nodes of a given kind, optionally filtered.
   */
  async count(
    kind: string,
    options: {
      branch?: string;
      timeout?: number;
      partialMatch?: boolean;
      [key: string]: unknown;
    } = {},
  ): Promise<number> {
    const { branch, timeout, partialMatch, ...filterArgs } = options;
    const branchName = branch ?? this.defaultBranch;
    const schema = await this.schema.get(kind, branchName);

    const filters: Record<string, unknown> = { ...filterArgs };
    if (partialMatch) {
      filters["partial_match"] = true;
    }

    const queryData: Record<string, unknown> = {
      count: null,
    };

    if (Object.keys(filters).length > 0) {
      queryData["@filters"] = filters;
    }

    const query = new GraphQLQuery({
      query: { [schema.kind]: queryData },
    });

    const response = await this.executeGraphQL(
      query.render(),
      undefined,
      `query-${kind.toLowerCase()}-count`,
      branchName,
      timeout,
    );

    const kindData = response[schema.kind] as Record<string, unknown> | undefined;
    return (kindData?.count as number) ?? 0;
  }

  /**
   * Delete a node by kind and ID.
   */
  async delete(kind: string, id: string, branch?: string, timeout?: number): Promise<void> {
    const branchName = branch ?? this.defaultBranch;
    const schema = await this.schema.get(kind, branchName);

    const mutation = new GraphQLMutation({
      mutation: `${schema.kind}Delete`,
      inputData: { data: { id } },
      query: { ok: null },
    });

    await this.executeGraphQL(
      mutation.render(),
      undefined,
      `mutation-${schema.kind.toLowerCase()}-delete`,
      branchName,
      timeout,
    );

    this.store.remove(id, branchName);
  }

  /**
   * Execute a raw GraphQL query or mutation.
   */
  async executeGraphQL(
    query: string,
    variables?: Record<string, unknown>,
    tracker?: string,
    branchName?: string,
    timeout?: number,
  ): Promise<Record<string, unknown>> {
    const branch = branchName ?? this.defaultBranch;
    const url = this.transport.buildGraphQLUrl(branch);

    const payload: Record<string, unknown> = { query };
    if (variables) {
      payload.variables = variables;
    }

    const extraHeaders: Record<string, string> = {};
    if (tracker) {
      extraHeaders["X-Infrahub-Tracker"] = tracker;
    }

    const response = await this.transport.post(url, payload, extraHeaders, timeout);

    // Handle HTTP errors
    if (response.status === 401 || response.status === 403) {
      const data = response.data as Record<string, unknown> | null;
      const errors = ((data?.errors ?? []) as Array<Record<string, unknown>>).map(
        (e) => (e.message as string) ?? "",
      );
      throw new AuthenticationError(errors.join(" | "));
    }

    if (response.status === 404) {
      throw new URLNotFoundError(url);
    }

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status} error from ${url}`);
    }

    const data = response.data as Record<string, unknown>;

    // Check for GraphQL errors
    if (data.errors) {
      throw new GraphQLError(
        data.errors as Array<Record<string, unknown>>,
        query,
        variables,
      );
    }

    return (data.data ?? {}) as Record<string, unknown>;
  }

  /**
   * Get the Infrahub server version.
   */
  async getVersion(): Promise<string> {
    const response = await this.executeGraphQL("query { InfrahubInfo { version } }");
    const info = response.InfrahubInfo as Record<string, string> | undefined;
    return info?.version ?? "";
  }

  /**
   * Allocate the next available IP address from a pool.
   *
   * @param options - Allocation options including the pool ID
   * @param branch - Target branch (defaults to defaultBranch)
   * @param timeout - Optional request timeout in seconds
   * @returns Allocation result with the assigned node info
   */
  async allocateNextIpAddress(
    options: IPAddressAllocationOptions,
    branch?: string,
    timeout?: number,
  ): Promise<IPAllocationResult> {
    const mutation = buildIPAddressAllocationMutation(options);
    const response = await this.executeGraphQL(
      mutation.render(),
      undefined,
      "mutation-ip-address-pool-allocate",
      branch ?? this.defaultBranch,
      timeout,
    );
    return parseAllocationResponse(response, "InfrahubIPAddressPoolGetResource");
  }

  /**
   * Allocate the next available IP prefix from a pool.
   *
   * @param options - Allocation options including the pool ID
   * @param branch - Target branch (defaults to defaultBranch)
   * @param timeout - Optional request timeout in seconds
   * @returns Allocation result with the assigned node info
   */
  async allocateNextIpPrefix(
    options: IPPrefixAllocationOptions,
    branch?: string,
    timeout?: number,
  ): Promise<IPAllocationResult> {
    const mutation = buildIPPrefixAllocationMutation(options);
    const response = await this.executeGraphQL(
      mutation.render(),
      undefined,
      "mutation-ip-prefix-pool-allocate",
      branch ?? this.defaultBranch,
      timeout,
    );
    return parseAllocationResponse(response, "InfrahubIPPrefixPoolGetResource");
  }

  /** Fetch a single page of nodes. */
  private async fetchPage(
    schema: { kind: string; attributes: unknown[]; relationships: unknown[] },
    branchName: string,
    options: {
      filters?: Record<string, unknown>;
      offset?: number;
      limit?: number;
      timeout?: number;
      populateStore?: boolean;
      includeRelationships?: boolean;
      partialMatch?: boolean;
      returnCount?: boolean;
    },
  ): Promise<InfrahubNode[]> {
    const { filters, offset, limit, timeout, populateStore = true, includeRelationships, partialMatch } = options;

    const templateNode = new InfrahubNode({
      schema: schema as import("./schema/types.js").SchemaType,
      branch: branchName,
    });
    const queryDict = templateNode.generateQueryData({
      filters, offset, limit, includeRelationships, partialMatch,
    });
    const query = new GraphQLQuery({ query: queryDict });

    const response = await this.executeGraphQL(
      query.render(),
      undefined,
      `query-${schema.kind.toLowerCase()}-page`,
      branchName,
      timeout,
    );

    const nodes: InfrahubNode[] = [];
    const kindData = response[schema.kind] as Record<string, unknown> | undefined;
    const edges = (kindData?.edges ?? []) as Array<Record<string, unknown>>;

    for (const edge of edges) {
      const node = new InfrahubNode({
        schema: schema as import("./schema/types.js").SchemaType,
        branch: branchName,
        data: edge,
      });
      nodes.push(node);

      if (populateStore) {
        this.store.set(node);
      }
    }

    return nodes;
  }

  /** Create a node on the server. */
  private async createOnServer(node: InfrahubNode, timeout?: number): Promise<void> {
    const inputData = node.generateInputData();

    const mutation = new GraphQLMutation({
      mutation: `${node.schema.kind}Create`,
      inputData: inputData.data,
      query: {
        ok: null,
        object: { id: null, display_label: null },
      },
    });

    const response = await this.executeGraphQL(
      mutation.render(),
      undefined,
      `mutation-${node.kind.toLowerCase()}-create`,
      node.branch,
      timeout,
    );

    // Update node with server-assigned ID
    const createResult = response[`${node.schema.kind}Create`] as Record<string, unknown>;
    const obj = createResult?.object as Record<string, unknown> | undefined;
    if (obj?.id) {
      node.id = obj.id as string;
    }
    if (obj?.display_label) {
      node.displayLabel = obj.display_label as string;
    }
  }

  /** Update an existing node on the server. */
  private async update(node: InfrahubNode, timeout?: number): Promise<void> {
    const inputData = node.generateInputData(true);

    const mutation = new GraphQLMutation({
      mutation: `${node.schema.kind}Update`,
      inputData: inputData.data,
      query: { ok: null },
    });

    await this.executeGraphQL(
      mutation.render(),
      undefined,
      `mutation-${node.kind.toLowerCase()}-update`,
      node.branch,
      timeout,
    );
  }
}

/** Simple UUID validation (v4). */
function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

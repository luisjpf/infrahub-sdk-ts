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
import { InfrahubNode } from "./node/node.js";
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
 *
 * @example
 * ```ts
 * const client = new InfrahubClient({
 *   address: "http://localhost:8000",
 *   apiToken: "my-api-token",
 * });
 *
 * // Create a node
 * const device = await client.create("NetworkDevice", { hostname: { value: "router1" } });
 * await client.save(device);
 *
 * // Get a node by ID
 * const node = await client.get("NetworkDevice", { id: "some-uuid" });
 *
 * // List all nodes of a kind
 * const devices = await client.all("NetworkDevice");
 *
 * // Delete a node
 * await client.delete("NetworkDevice", "some-uuid");
 * ```
 */
export class InfrahubClient {
  readonly config: InfrahubConfig;
  readonly transport: InfrahubTransport;
  readonly schema: SchemaManager;
  readonly branch: BranchManager;
  readonly store: NodeStore;
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
   * Retrieve all nodes of a given kind.
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
    } = {},
  ): Promise<InfrahubNode[]> {
    const { branch, timeout, offset, limit, filters, populateStore = true } = options;
    const branchName = branch ?? this.defaultBranch;
    const schema = await this.schema.get(kind, branchName);

    // Build a template node to generate the query
    const templateNode = new InfrahubNode({ schema, branch: branchName });
    const queryDict = templateNode.generateQueryData({ filters, offset, limit });
    const query = new GraphQLQuery({ query: queryDict });

    const response = await this.executeGraphQL(
      query.render(),
      undefined,
      `query-${kind.toLowerCase()}-all`,
      branchName,
      timeout,
    );

    const nodes: InfrahubNode[] = [];
    const kindData = response[schema.kind] as Record<string, unknown> | undefined;
    const edges = (kindData?.edges ?? []) as Array<Record<string, unknown>>;

    for (const edge of edges) {
      const node = new InfrahubNode({
        schema,
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

import { describe, it, expect, vi } from "vitest";
import { InfrahubClient } from "../../src/client.js";
import { HttpError, AuthenticationError, URLNotFoundError } from "../../src/errors.js";
import type { HttpClient, HttpRequestOptions, HttpResponse } from "../../src/types.js";
import { deviceSchema, siteSchema } from "../fixtures/schemas.js";

/** Helper: node data for a device. */
function makeDeviceNode(id: string, name: string) {
  return {
    id,
    display_label: name,
    __typename: "InfraDevice",
    name: { value: name },
    description: { value: null },
    role: { value: null },
    status: { value: "active" },
    site: { node: null },
  };
}

/**
 * Create a test client with a customizable response handler.
 * The handler receives the GraphQL query body and returns the data portion.
 */
function createTestClientWithHandler(
  handler: (body: Record<string, unknown>) => Record<string, unknown>,
): {
  client: InfrahubClient;
  requests: HttpRequestOptions[];
} {
  const requests: HttpRequestOptions[] = [];

  const httpClient: HttpClient = {
    request: vi.fn().mockImplementation(async (opts: HttpRequestOptions) => {
      requests.push(opts);

      // Schema API
      if (opts.url.includes("/api/schema")) {
        return {
          status: 200,
          data: { nodes: [deviceSchema, siteSchema], generics: [] },
          headers: {},
        } satisfies HttpResponse;
      }

      // GraphQL API — delegate to handler
      const body = opts.body as Record<string, unknown>;
      return {
        status: 200,
        data: { data: handler(body) },
        headers: {},
      } satisfies HttpResponse;
    }),
  };

  const client = new InfrahubClient(
    { address: "http://localhost:8000", apiToken: "test-token", paginationSize: 3 },
    { httpClient },
  );

  return { client, requests };
}

/** Simple static-response test client. */
function createTestClient(graphqlResponse: Record<string, unknown> = {}) {
  return createTestClientWithHandler(() => graphqlResponse);
}

/**
 * Create a test client where GraphQL requests return a fixed HTTP status and body.
 * Useful for testing throwOnHttpError paths.
 */
function createTestClientWithStatus(
  status: number,
  data: unknown = {},
): { client: InfrahubClient; requests: HttpRequestOptions[] } {
  const requests: HttpRequestOptions[] = [];

  const httpClient: HttpClient = {
    request: vi.fn().mockImplementation(async (opts: HttpRequestOptions) => {
      requests.push(opts);

      // Schema API always succeeds
      if (opts.url.includes("/api/schema")) {
        return {
          status: 200,
          data: { nodes: [deviceSchema, siteSchema], generics: [] },
          headers: {},
        } satisfies HttpResponse;
      }

      // GraphQL returns the specified status
      return { status, data, headers: {} } satisfies HttpResponse;
    }),
  };

  const client = new InfrahubClient(
    { address: "http://localhost:8000", apiToken: "test-token" },
    { httpClient },
  );

  return { client, requests };
}

describe("InfrahubClient Phase 2", () => {
  describe("filters()", () => {
    it("should query with filter arguments", async () => {
      const { client, requests } = createTestClient({
        InfraDevice: {
          count: 1,
          edges: [{ node: makeDeviceNode("d1", "router1") }],
        },
      });

      const nodes = await client.filters("InfraDevice", {
        name__value: "router1",
      });

      expect(nodes).toHaveLength(1);
      expect(nodes[0]!.getAttribute("name").value).toBe("router1");

      // Verify filters were included in the query
      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      const lastReq = graphqlReqs[graphqlReqs.length - 1]!;
      const body = lastReq.body as Record<string, string>;
      expect(body.query).toContain("name__value");
    });

    it("should support multiple filter arguments", async () => {
      const { client, requests } = createTestClient({
        InfraDevice: {
          count: 1,
          edges: [{ node: makeDeviceNode("d1", "router1") }],
        },
      });

      await client.filters("InfraDevice", {
        name__value: "router1",
        status__values: ["active", "standby"],
      });

      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      const lastReq = graphqlReqs[graphqlReqs.length - 1]!;
      const body = lastReq.body as Record<string, string>;
      expect(body.query).toContain("name__value");
      expect(body.query).toContain("status__values");
    });

    it("should support partial_match flag", async () => {
      const { client, requests } = createTestClient({
        InfraDevice: {
          count: 1,
          edges: [{ node: makeDeviceNode("d1", "router1") }],
        },
      });

      await client.filters("InfraDevice", {
        name__value: "rout",
        partialMatch: true,
      });

      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      const lastReq = graphqlReqs[graphqlReqs.length - 1]!;
      const body = lastReq.body as Record<string, string>;
      expect(body.query).toContain("partial_match");
    });

    it("should populate store", async () => {
      const { client } = createTestClient({
        InfraDevice: {
          count: 1,
          edges: [{ node: makeDeviceNode("d1", "router1") }],
        },
      });

      await client.filters("InfraDevice", { name__value: "router1" });
      expect(client.store.has("d1")).toBe(true);
    });

    it("should respect populateStore: false", async () => {
      const { client } = createTestClient({
        InfraDevice: {
          count: 1,
          edges: [{ node: makeDeviceNode("d1", "router1") }],
        },
      });

      await client.filters("InfraDevice", {
        name__value: "router1",
        populateStore: false,
      });
      expect(client.store.has("d1")).toBe(false);
    });
  });

  describe("count()", () => {
    it("should return count of nodes", async () => {
      const { client } = createTestClient({
        InfraDevice: { count: 42 },
      });

      const result = await client.count("InfraDevice");
      expect(result).toBe(42);
    });

    it("should pass filter arguments to count query", async () => {
      const { client, requests } = createTestClient({
        InfraDevice: { count: 5 },
      });

      await client.count("InfraDevice", { name__value: "router" });

      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      const lastReq = graphqlReqs[graphqlReqs.length - 1]!;
      const body = lastReq.body as Record<string, string>;
      expect(body.query).toContain("name__value");
      expect(body.query).toContain("count");
      // Should NOT include edges (count-only query)
      expect(body.query).not.toContain("edges");
    });

    it("should support partial match", async () => {
      const { client, requests } = createTestClient({
        InfraDevice: { count: 3 },
      });

      await client.count("InfraDevice", {
        partialMatch: true,
        name__value: "rout",
      });

      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      const lastReq = graphqlReqs[graphqlReqs.length - 1]!;
      const body = lastReq.body as Record<string, string>;
      expect(body.query).toContain("partial_match");
    });

    it("should return 0 when no nodes match", async () => {
      const { client } = createTestClient({
        InfraDevice: { count: 0 },
      });

      const result = await client.count("InfraDevice");
      expect(result).toBe(0);
    });

    it("should use specified branch", async () => {
      const { client, requests } = createTestClient({
        InfraDevice: { count: 10 },
      });

      await client.count("InfraDevice", { branch: "feature-1" });

      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      const lastReq = graphqlReqs[graphqlReqs.length - 1]!;
      expect(lastReq.url).toContain("feature-1");
    });
  });

  describe("pagination", () => {
    it("should paginate automatically when no limit specified", async () => {
      let pageNum = 0;
      const { client } = createTestClientWithHandler(() => {
        // paginationSize is 3, return 3 items on page 0, 1 on page 1
        if (pageNum === 0) {
          pageNum++;
          return {
            InfraDevice: {
              count: 4,
              edges: [
                { node: makeDeviceNode("d1", "router1") },
                { node: makeDeviceNode("d2", "router2") },
                { node: makeDeviceNode("d3", "router3") },
              ],
            },
          };
        }
        pageNum++;
        return {
          InfraDevice: {
            count: 4,
            edges: [{ node: makeDeviceNode("d4", "router4") }],
          },
        };
      });

      const nodes = await client.all("InfraDevice");
      expect(nodes).toHaveLength(4);
      expect(nodes[0]!.id).toBe("d1");
      expect(nodes[3]!.id).toBe("d4");
    });

    it("should stop when a page returns fewer items than paginationSize", async () => {
      const { client, requests } = createTestClient({
        InfraDevice: {
          count: 2,
          edges: [
            { node: makeDeviceNode("d1", "router1") },
            { node: makeDeviceNode("d2", "router2") },
          ],
        },
      });

      const nodes = await client.all("InfraDevice");
      expect(nodes).toHaveLength(2);

      // Should only make 1 GraphQL request (+ 1 schema request)
      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      expect(graphqlReqs).toHaveLength(1);
    });

    it("should use explicit offset/limit without pagination", async () => {
      const { client, requests } = createTestClient({
        InfraDevice: {
          count: 100,
          edges: [{ node: makeDeviceNode("d5", "router5") }],
        },
      });

      const nodes = await client.all("InfraDevice", { offset: 10, limit: 1 });
      expect(nodes).toHaveLength(1);

      // Should make exactly 1 GraphQL request
      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      expect(graphqlReqs).toHaveLength(1);
      const body = graphqlReqs[0]!.body as Record<string, string>;
      expect(body.query).toContain("offset: 10");
      expect(body.query).toContain("limit: 1");
    });

    it("should handle empty results", async () => {
      const { client } = createTestClient({
        InfraDevice: { count: 0, edges: [] },
      });

      const nodes = await client.all("InfraDevice");
      expect(nodes).toHaveLength(0);
    });
  });

  describe("clone()", () => {
    it("should create a new client with a different default branch", () => {
      const { client } = createTestClient();
      const cloned = client.clone("feature-1");

      expect(cloned.defaultBranch).toBe("feature-1");
      expect(cloned.config.defaultBranch).toBe("feature-1");
      // Original is unchanged
      expect(client.defaultBranch).toBe("main");
    });

    it("should preserve config settings", () => {
      const { client } = createTestClient();
      const cloned = client.clone("dev");

      expect(cloned.config.address).toBe("http://localhost:8000");
      expect(cloned.config.apiToken).toBe("test-token");
      expect(cloned.config.timeout).toBe(60);
      expect(cloned.config.paginationSize).toBe(3); // Test uses custom value
    });

    it("should have independent store", () => {
      const { client } = createTestClient();
      const cloned = client.clone("dev");

      // Stores should be independent
      expect(cloned.store).not.toBe(client.store);
    });

    it("should keep same branch when no branch specified", () => {
      const { client } = createTestClient();
      const cloned = client.clone();
      expect(cloned.defaultBranch).toBe("main");
    });
  });

  describe("createBatch()", () => {
    it("should create a batch with default concurrency", () => {
      const { client } = createTestClient();
      const batch = client.createBatch();
      expect(batch.size).toBe(0);
    });

    it("should create a batch with custom concurrency", () => {
      const { client } = createTestClient();
      const batch = client.createBatch({ maxConcurrentExecution: 10 });
      expect(batch.size).toBe(0);
    });
  });

  describe("prefetchRelationships", () => {
    it("should fetch related nodes and populate the store", async () => {
      const { client, requests } = createTestClientWithHandler((body) => {
        const query = body.query as string;

        // First query: devices with a site relationship
        if (query.includes("InfraDevice") && !query.includes("ids")) {
          return {
            InfraDevice: {
              count: 1,
              edges: [
                {
                  node: {
                    id: "d1",
                    display_label: "Router 1",
                    __typename: "InfraDevice",
                    name: { value: "router1" },
                    description: { value: null },
                    role: { value: null },
                    status: { value: "active" },
                    site: { node: { id: "site-1", display_label: "DC1", __typename: "InfraSite", hfid: null } },
                  },
                },
              ],
            },
          };
        }

        // Prefetch query: fetch site by IDs
        if (query.includes("InfraSite")) {
          return {
            InfraSite: {
              count: 1,
              edges: [
                {
                  node: {
                    id: "site-1",
                    display_label: "DC1",
                    __typename: "InfraSite",
                    name: { value: "DC1" },
                    location: { value: "New York" },
                  },
                },
              ],
            },
          };
        }

        return {};
      });

      const nodes = await client.all("InfraDevice", {
        prefetchRelationships: true,
      });

      expect(nodes).toHaveLength(1);

      // Verify the related site was fetched and stored
      expect(client.store.has("site-1")).toBe(true);

      // Verify a second GraphQL query was made for the prefetch
      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      expect(graphqlReqs.length).toBeGreaterThanOrEqual(2);

      // One should query InfraSite with ids filter
      const prefetchReq = graphqlReqs.find((r) => {
        const b = r.body as Record<string, string>;
        return b.query.includes("InfraSite") && b.query.includes("ids");
      });
      expect(prefetchReq).toBeDefined();
    });

    it("should not make extra requests when there are no relationships", async () => {
      const { client, requests } = createTestClient({
        InfraSite: {
          count: 1,
          edges: [
            {
              node: {
                id: "s1",
                display_label: "Site 1",
                __typename: "InfraSite",
                name: { value: "site1" },
                location: { value: null },
              },
            },
          ],
        },
      });

      await client.all("InfraSite", { prefetchRelationships: true });

      // InfraSite has no relationships, so only 1 GraphQL request should be made
      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      expect(graphqlReqs).toHaveLength(1);
    });

    it("should skip already-stored nodes", async () => {
      let prefetchCallCount = 0;
      const { client } = createTestClientWithHandler((body) => {
        const query = body.query as string;

        if (query.includes("InfraDevice")) {
          return {
            InfraDevice: {
              count: 1,
              edges: [
                {
                  node: {
                    id: "d1",
                    display_label: "Router 1",
                    __typename: "InfraDevice",
                    name: { value: "router1" },
                    description: { value: null },
                    role: { value: null },
                    status: { value: "active" },
                    site: { node: { id: "site-1", display_label: "DC1", __typename: "InfraSite", hfid: null } },
                  },
                },
              ],
            },
          };
        }

        if (query.includes("InfraSite")) {
          prefetchCallCount++;
          return {
            InfraSite: {
              count: 1,
              edges: [
                {
                  node: {
                    id: "site-1",
                    display_label: "DC1",
                    __typename: "InfraSite",
                    name: { value: "DC1" },
                    location: { value: null },
                  },
                },
              ],
            },
          };
        }

        return {};
      });

      // First call: should prefetch
      await client.all("InfraDevice", { prefetchRelationships: true });
      expect(prefetchCallCount).toBe(1);

      // Second call: site-1 is already in store, should skip
      await client.all("InfraDevice", { prefetchRelationships: true });
      expect(prefetchCallCount).toBe(1);
    });

    it("should work with explicit offset/limit", async () => {
      const { client, requests } = createTestClientWithHandler((body) => {
        const query = body.query as string;

        if (query.includes("InfraDevice")) {
          return {
            InfraDevice: {
              count: 1,
              edges: [
                {
                  node: {
                    id: "d1",
                    display_label: "Router 1",
                    __typename: "InfraDevice",
                    name: { value: "router1" },
                    description: { value: null },
                    role: { value: null },
                    status: { value: "active" },
                    site: { node: { id: "site-2", display_label: "DC2", __typename: "InfraSite", hfid: null } },
                  },
                },
              ],
            },
          };
        }

        if (query.includes("InfraSite")) {
          return {
            InfraSite: {
              count: 1,
              edges: [
                {
                  node: {
                    id: "site-2",
                    display_label: "DC2",
                    __typename: "InfraSite",
                    name: { value: "DC2" },
                    location: { value: null },
                  },
                },
              ],
            },
          };
        }

        return {};
      });

      const nodes = await client.all("InfraDevice", {
        offset: 0,
        limit: 1,
        prefetchRelationships: true,
      });

      expect(nodes).toHaveLength(1);
      expect(client.store.has("site-2")).toBe(true);
    });
  });

  describe("filters() with prefetchRelationships", () => {
    it("should pass prefetchRelationships through to all()", async () => {
      const { client, requests } = createTestClientWithHandler((body) => {
        const query = body.query as string;

        if (query.includes("InfraDevice") && !query.includes("ids")) {
          return {
            InfraDevice: {
              count: 1,
              edges: [
                {
                  node: {
                    id: "d1",
                    display_label: "Router 1",
                    __typename: "InfraDevice",
                    name: { value: "router1" },
                    description: { value: null },
                    role: { value: null },
                    status: { value: "active" },
                    site: { node: { id: "site-f1", display_label: "DC1", __typename: "InfraSite", hfid: null } },
                  },
                },
              ],
            },
          };
        }

        if (query.includes("InfraSite")) {
          return {
            InfraSite: {
              count: 1,
              edges: [
                {
                  node: {
                    id: "site-f1",
                    display_label: "DC1",
                    __typename: "InfraSite",
                    name: { value: "DC1" },
                    location: { value: null },
                  },
                },
              ],
            },
          };
        }

        return {};
      });

      const nodes = await client.filters("InfraDevice", {
        name__value: "router1",
        prefetchRelationships: true,
      });

      expect(nodes).toHaveLength(1);
      expect(client.store.has("site-f1")).toBe(true);

      // Verify the prefetch query was made
      const graphqlReqs = requests.filter((r) => r.url.includes("/graphql"));
      const prefetchReq = graphqlReqs.find((r) => {
        const b = r.body as Record<string, string>;
        return b.query.includes("InfraSite") && b.query.includes("ids");
      });
      expect(prefetchReq).toBeDefined();
    });
  });

  describe("throwOnHttpError", () => {
    it("should throw HttpError on 500 Internal Server Error", async () => {
      const { client } = createTestClientWithStatus(500, {});

      await expect(client.executeGraphQL("query { test }")).rejects.toThrow(HttpError);
      await expect(client.executeGraphQL("query { test }")).rejects.toThrow(
        /HTTP 500 error/,
      );
    });

    it("should throw HttpError on 409 Conflict", async () => {
      const { client } = createTestClientWithStatus(409, {});

      const err = await client.executeGraphQL("query { test }").catch((e) => e);
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(409);
      expect((err as HttpError).url).toContain("/graphql");
    });

    it("should throw HttpError on 400 Bad Request", async () => {
      const { client } = createTestClientWithStatus(400, {});

      const err = await client.executeGraphQL("query { test }").catch((e) => e);
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
    });

    it("should throw AuthenticationError on 401", async () => {
      const { client } = createTestClientWithStatus(401, { errors: [{ message: "Unauthorized" }] });

      await expect(client.executeGraphQL("query { test }")).rejects.toThrow(AuthenticationError);
    });

    it("should throw AuthenticationError on 403", async () => {
      const { client } = createTestClientWithStatus(403, { errors: [{ message: "Forbidden" }] });

      await expect(client.executeGraphQL("query { test }")).rejects.toThrow(AuthenticationError);
    });

    it("should throw URLNotFoundError on 404", async () => {
      const { client } = createTestClientWithStatus(404, {});

      await expect(client.executeGraphQL("query { test }")).rejects.toThrow(URLNotFoundError);
    });

    it("should not throw on 200", async () => {
      const { client } = createTestClientWithStatus(200, { data: { ok: true } });

      const result = await client.executeGraphQL("query { test }");
      expect(result).toEqual({ ok: true });
    });
  });
});

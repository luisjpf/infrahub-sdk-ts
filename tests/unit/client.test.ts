import { describe, it, expect, vi, beforeEach } from "vitest";
import { InfrahubClient } from "../../src/client.js";
import {
  AuthenticationError,
  GraphQLError,
  NodeNotFoundError,
} from "../../src/errors.js";
import type { HttpClient, HttpRequestOptions, HttpResponse } from "../../src/types.js";
import { deviceSchema, siteSchema } from "../fixtures/schemas.js";

/**
 * Create a mock HTTP client that routes requests to handlers.
 * - Schema API: returns deviceSchema and siteSchema
 * - GraphQL: returns configured response
 */
function createTestClient(
  graphqlResponse: Record<string, unknown> = {},
): {
  client: InfrahubClient;
  httpClient: HttpClient;
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
          data: {
            nodes: [deviceSchema, siteSchema],
            generics: [],
          },
          headers: {},
        } satisfies HttpResponse;
      }

      // GraphQL API
      return {
        status: 200,
        data: { data: graphqlResponse },
        headers: {},
      } satisfies HttpResponse;
    }),
  };

  const client = new InfrahubClient(
    { address: "http://localhost:8000", apiToken: "test-token" },
    { httpClient },
  );

  return { client, httpClient, requests };
}

describe("InfrahubClient", () => {
  describe("constructor", () => {
    it("should create a client with default config", () => {
      const { client } = createTestClient();
      expect(client.config.address).toBe("http://localhost:8000");
      expect(client.defaultBranch).toBe("main");
    });

    it("should accept custom config", () => {
      const client = new InfrahubClient({
        address: "https://infrahub.example.com",
        defaultBranch: "develop",
      });
      expect(client.config.address).toBe("https://infrahub.example.com");
      expect(client.defaultBranch).toBe("develop");
    });
  });

  describe("create", () => {
    it("should create a new node instance", async () => {
      const { client } = createTestClient();
      const node = await client.create("InfraDevice", {
        name: { value: "router1" },
      });

      expect(node.kind).toBe("InfraDevice");
      expect(node.isExisting).toBe(false);
      expect(node.getAttribute("name").value).toBe("router1");
    });

    it("should use specified branch", async () => {
      const { client } = createTestClient();
      const node = await client.create("InfraDevice", {}, "feature-1");
      expect(node.branch).toBe("feature-1");
    });
  });

  describe("save (create)", () => {
    it("should create a node on the server", async () => {
      const { client, requests } = createTestClient({
        InfraDeviceCreate: {
          ok: true,
          object: { id: "new-uuid", display_label: "router1" },
        },
      });

      const node = await client.create("InfraDevice", {
        name: { value: "router1" },
      });
      await client.save(node);

      // Node should now have server-assigned ID
      expect(node.id).toBe("new-uuid");
      expect(node.displayLabel).toBe("router1");

      // Should have made schema + mutation requests
      const graphqlRequests = requests.filter((r) =>
        r.url.includes("/graphql"),
      );
      expect(graphqlRequests.length).toBeGreaterThan(0);
    });

    it("should update an existing node", async () => {
      const { client, requests } = createTestClient({
        InfraDeviceUpdate: { ok: true },
      });

      const node = await client.create("InfraDevice", {
        id: "existing-uuid",
        name: { value: "router1" },
      });

      node.getAttribute("name").value = "router2";
      await client.save(node);

      const graphqlRequests = requests.filter(
        (r) => r.url.includes("/graphql") && r.body,
      );
      const lastGraphQL = graphqlRequests[graphqlRequests.length - 1];
      const body = lastGraphQL?.body as Record<string, string>;
      expect(body.query).toContain("InfraDeviceUpdate");
    });
  });

  describe("get", () => {
    it("should get a node by ID", async () => {
      const { client } = createTestClient({
        InfraDevice: {
          count: 1,
          edges: [
            {
              node: {
                id: "device-1",
                display_label: "Router 1",
                __typename: "InfraDevice",
                name: { value: "router1" },
                description: { value: null },
                role: { value: null },
                status: { value: "active" },
                site: { node: null },
              },
            },
          ],
        },
      });

      const node = await client.get("InfraDevice", { id: "device-1" });

      expect(node.id).toBe("device-1");
      expect(node.getAttribute("name").value).toBe("router1");
    });

    it("should throw NodeNotFoundError when not found", async () => {
      const { client } = createTestClient({
        InfraDevice: { count: 0, edges: [] },
      });

      await expect(
        client.get("InfraDevice", { id: "nonexistent" }),
      ).rejects.toThrow(NodeNotFoundError);
    });

    it("should throw when more than one node returned", async () => {
      const { client } = createTestClient({
        InfraDevice: {
          count: 2,
          edges: [
            { node: { id: "d1", __typename: "InfraDevice", name: { value: "a" }, description: { value: null }, role: { value: null }, status: { value: null }, site: { node: null } } },
            { node: { id: "d2", __typename: "InfraDevice", name: { value: "b" }, description: { value: null }, role: { value: null }, status: { value: null }, site: { node: null } } },
          ],
        },
      });

      await expect(
        client.get("InfraDevice", { id: "ambiguous" }),
      ).rejects.toThrow("More than 1 node returned");
    });

    it("should require at least one filter", async () => {
      const { client } = createTestClient();

      await expect(client.get("InfraDevice")).rejects.toThrow(
        "At least one filter must be provided",
      );
    });
  });

  describe("all", () => {
    it("should retrieve all nodes of a kind", async () => {
      const { client } = createTestClient({
        InfraDevice: {
          count: 2,
          edges: [
            { node: { id: "d1", display_label: "Router 1", __typename: "InfraDevice", name: { value: "router1" }, description: { value: null }, role: { value: null }, status: { value: null }, site: { node: null } } },
            { node: { id: "d2", display_label: "Switch 1", __typename: "InfraDevice", name: { value: "switch1" }, description: { value: null }, role: { value: null }, status: { value: null }, site: { node: null } } },
          ],
        },
      });

      const nodes = await client.all("InfraDevice");

      expect(nodes).toHaveLength(2);
      expect(nodes[0]!.id).toBe("d1");
      expect(nodes[1]!.id).toBe("d2");
    });

    it("should populate store by default", async () => {
      const { client } = createTestClient({
        InfraDevice: {
          count: 1,
          edges: [
            { node: { id: "d1", __typename: "InfraDevice", name: { value: "router1" }, description: { value: null }, role: { value: null }, status: { value: null }, site: { node: null } } },
          ],
        },
      });

      await client.all("InfraDevice");
      expect(client.store.has("d1")).toBe(true);
    });

    it("should not populate store when disabled", async () => {
      const { client } = createTestClient({
        InfraDevice: {
          count: 1,
          edges: [
            { node: { id: "d1", __typename: "InfraDevice", name: { value: "router1" }, description: { value: null }, role: { value: null }, status: { value: null }, site: { node: null } } },
          ],
        },
      });

      await client.all("InfraDevice", { populateStore: false });
      expect(client.store.has("d1")).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete a node by ID", async () => {
      const { client, requests } = createTestClient({
        InfraDeviceDelete: { ok: true },
      });

      await client.delete("InfraDevice", "device-1");

      const graphqlRequests = requests.filter(
        (r) => r.url.includes("/graphql") && r.body,
      );
      const lastRequest = graphqlRequests[graphqlRequests.length - 1];
      const body = lastRequest?.body as Record<string, string>;
      expect(body.query).toContain("InfraDeviceDelete");
      expect(body.query).toContain("device-1");
    });

    it("should remove node from store after deletion", async () => {
      const { client } = createTestClient({
        InfraDevice: {
          count: 1,
          edges: [
            { node: { id: "d1", __typename: "InfraDevice", name: { value: "a" }, description: { value: null }, role: { value: null }, status: { value: null }, site: { node: null } } },
          ],
        },
        InfraDeviceDelete: { ok: true },
      });

      // First populate the store
      await client.all("InfraDevice");
      expect(client.store.has("d1")).toBe(true);

      // Delete removes from store
      await client.delete("InfraDevice", "d1");
      expect(client.store.has("d1")).toBe(false);
    });
  });

  describe("executeGraphQL", () => {
    it("should execute raw GraphQL query", async () => {
      const { client } = createTestClient({
        InfrahubInfo: { version: "1.0.0" },
      });

      const result = await client.executeGraphQL(
        "query { InfrahubInfo { version } }",
      );
      expect(result.InfrahubInfo).toEqual({ version: "1.0.0" });
    });

    it("should throw GraphQLError on GraphQL errors", async () => {
      const requests: HttpRequestOptions[] = [];
      const httpClient: HttpClient = {
        request: vi.fn().mockResolvedValue({
          status: 200,
          data: {
            errors: [{ message: "Some error" }],
          },
          headers: {},
        }),
      };

      const client = new InfrahubClient(
        { address: "http://localhost:8000" },
        { httpClient },
      );

      await expect(
        client.executeGraphQL("query { bad }"),
      ).rejects.toThrow(GraphQLError);
    });

    it("should throw AuthenticationError on 401", async () => {
      const httpClient: HttpClient = {
        request: vi.fn().mockResolvedValue({
          status: 401,
          data: { errors: [{ message: "Unauthorized" }] },
          headers: {},
        }),
      };

      const client = new InfrahubClient(
        { address: "http://localhost:8000" },
        { httpClient },
      );

      await expect(
        client.executeGraphQL("query { test }"),
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe("getVersion", () => {
    it("should return the server version", async () => {
      const { client } = createTestClient({
        InfrahubInfo: { version: "1.2.3" },
      });

      const version = await client.getVersion();
      expect(version).toBe("1.2.3");
    });
  });
});

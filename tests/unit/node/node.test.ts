import { describe, it, expect } from "vitest";
import { InfrahubNode } from "../../../src/node/node.js";
import { deviceSchema, siteSchema, createSimpleSchema } from "../../fixtures/schemas.js";

describe("InfrahubNode", () => {
  describe("construction", () => {
    it("should create a new node without data", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
      });
      expect(node.id).toBeNull();
      expect(node.kind).toBe("InfraDevice");
      expect(node.branch).toBe("main");
      expect(node.isExisting).toBe(false);
      expect(node.typename).toBe("InfraDevice");
    });

    it("should create a node with data", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          id: "device-uuid-1",
          display_label: "Router 1",
          __typename: "InfraDevice",
          name: { value: "router1" },
          description: { value: "Main router" },
        },
      });
      expect(node.id).toBe("device-uuid-1");
      expect(node.displayLabel).toBe("Router 1");
      expect(node.isExisting).toBe(true);
      expect(node.typename).toBe("InfraDevice");
    });

    it("should unwrap edge/node wrapper", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          node: {
            id: "device-uuid-2",
            display_label: "Switch 1",
            __typename: "InfraDevice",
            name: { value: "switch1" },
          },
        },
      });
      expect(node.id).toBe("device-uuid-2");
      expect(node.displayLabel).toBe("Switch 1");
    });
  });

  describe("attributes", () => {
    it("should create attributes from schema", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
      });
      expect(node.attributeNames).toContain("name");
      expect(node.attributeNames).toContain("description");
      expect(node.attributeNames).toContain("role");
      expect(node.attributeNames).toContain("status");
    });

    it("should get attribute by name", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: { name: { value: "router1" } },
      });
      const nameAttr = node.getAttribute("name");
      expect(nameAttr.value).toBe("router1");
    });

    it("should throw for non-existent attribute", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
      });
      expect(() => node.getAttribute("nonexistent")).toThrow(
        "Attribute 'nonexistent' not found on InfraDevice",
      );
    });

    it("should check attribute existence", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
      });
      expect(node.hasAttribute("name")).toBe(true);
      expect(node.hasAttribute("nonexistent")).toBe(false);
    });
  });

  describe("relationships", () => {
    it("should create relationship entries from schema", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
      });
      expect(node.relationshipNames).toContain("site");
      expect(node.relationshipNames).toContain("interfaces");
      expect(node.relationshipNames).toContain("tags");
    });

    it("should parse cardinality-one relationship data", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          name: { value: "router1" },
          site: {
            node: {
              id: "site-uuid-1",
              display_label: "NYC",
              __typename: "InfraSite",
            },
          },
        },
      });
      const site = node.getRelatedNode("site");
      expect(site?.id).toBe("site-uuid-1");
      expect(site?.displayLabel).toBe("NYC");
    });

    it("should parse cardinality-many relationship data", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          name: { value: "router1" },
          interfaces: {
            edges: [
              { node: { id: "intf-1", __typename: "InfraInterface" } },
              { node: { id: "intf-2", __typename: "InfraInterface" } },
            ],
          },
        },
      });
      const interfaces = node.getRelatedNodes("interfaces");
      expect(interfaces).toHaveLength(2);
      expect(interfaces[0]?.id).toBe("intf-1");
      expect(interfaces[1]?.id).toBe("intf-2");
    });
  });

  describe("generateInputData", () => {
    it("should generate create input data", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          name: { value: "router1" },
          description: { value: "A router" },
        },
      });
      const input = node.generateInputData();
      expect(input.data.data).toBeDefined();
      const data = (input.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.name).toEqual({ value: "router1" });
      expect(data.description).toEqual({ value: "A router" });
      // Read-only attributes should be excluded
      expect(data.status).toBeUndefined();
    });

    it("should include id for existing nodes", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          id: "device-uuid-1",
          name: { value: "router1" },
        },
      });
      const input = node.generateInputData();
      const data = (input.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.id).toBe("device-uuid-1");
    });

    it("should exclude unmodified when flag is set", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          id: "device-uuid-1",
          name: { value: "router1" },
          description: { value: "Original" },
        },
      });

      // Modify only description
      node.getAttribute("description").value = "Updated";

      const input = node.generateInputData(true);
      const data = (input.data as Record<string, unknown>).data as Record<string, unknown>;
      // description should be included (mutated)
      expect(data.description).toEqual({ value: "Updated" });
      // name should not be included (not mutated)
      expect(data.name).toBeUndefined();
    });

    it("should include relationship data", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          name: { value: "router1" },
          site: {
            node: { id: "site-1", __typename: "InfraSite" },
          },
        },
      });
      const input = node.generateInputData();
      const data = (input.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.site).toEqual({ id: "site-1" });
    });
  });

  describe("generateQueryData", () => {
    it("should generate query data for a schema", () => {
      const schema = createSimpleSchema("TestNode", ["name", "value"]);
      const node = new InfrahubNode({ schema, branch: "main" });
      const queryData = node.generateQueryData();

      expect(queryData).toHaveProperty("TestNode");
      const testNode = queryData.TestNode as Record<string, unknown>;
      expect(testNode).toHaveProperty("count", null);
      expect(testNode).toHaveProperty("edges");

      const edges = testNode.edges as Record<string, unknown>;
      const nodeFields = edges.node as Record<string, unknown>;
      expect(nodeFields).toHaveProperty("id", null);
      expect(nodeFields).toHaveProperty("display_label", null);
      expect(nodeFields).toHaveProperty("__typename", null);
      expect(nodeFields).toHaveProperty("name");
      expect(nodeFields).toHaveProperty("value");
    });

    it("should include filters", () => {
      const schema = createSimpleSchema("TestNode");
      const node = new InfrahubNode({ schema, branch: "main" });
      const queryData = node.generateQueryData({
        filters: { ids: ["uuid-1"] },
      });

      const testNode = queryData.TestNode as Record<string, unknown>;
      expect(testNode["@filters"]).toEqual({ ids: ["uuid-1"] });
    });

    it("should include offset and limit", () => {
      const schema = createSimpleSchema("TestNode");
      const node = new InfrahubNode({ schema, branch: "main" });
      const queryData = node.generateQueryData({
        offset: 10,
        limit: 20,
      });

      const testNode = queryData.TestNode as Record<string, unknown>;
      const filters = testNode["@filters"] as Record<string, unknown>;
      expect(filters.offset).toBe(10);
      expect(filters.limit).toBe(20);
    });

    it("should include cardinality-one relationships", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
      });
      const queryData = node.generateQueryData();
      const deviceNode = queryData.InfraDevice as Record<string, unknown>;
      const edges = deviceNode.edges as Record<string, unknown>;
      const nodeFields = edges.node as Record<string, unknown>;

      // site is cardinality=one, should be included
      expect(nodeFields).toHaveProperty("site");
      const site = nodeFields.site as Record<string, unknown>;
      expect(site.node).toEqual({
        id: null,
        display_label: null,
        __typename: null,
      });
    });
  });
});

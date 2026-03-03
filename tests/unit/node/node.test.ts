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

    it("should set attribute value via setAttribute()", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: { name: { value: "router1" } },
      });
      node.setAttribute("name", "router2");
      expect(node.getAttribute("name").value).toBe("router2");
    });

    it("should mark attribute as mutated after setAttribute()", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          id: "device-1",
          name: { value: "router1" },
          description: { value: "old" },
        },
      });
      node.setAttribute("description", "new description");
      const input = node.generateInputData(true);
      const data = (input.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.description).toEqual({ value: "new description" });
      // name was not modified so it should be excluded
      expect(data.name).toBeUndefined();
    });

    it("should throw when setAttribute() is called with non-existent attribute", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
      });
      expect(() => node.setAttribute("nonexistent", "value")).toThrow(
        "Attribute 'nonexistent' not found on InfraDevice",
      );
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
      const interfaces = node.getRelationshipManager("interfaces");
      expect(interfaces).toBeDefined();
      expect(interfaces!.peers).toHaveLength(2);
      expect(interfaces!.peers[0]?.id).toBe("intf-1");
      expect(interfaces!.peers[1]?.id).toBe("intf-2");
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
        hfid: null,
        display_label: null,
        __typename: null,
      });
    });

    it("should include cardinality-many relationships when includeRelationships is true", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
      });
      const queryData = node.generateQueryData({ includeRelationships: true });
      const deviceNode = queryData.InfraDevice as Record<string, unknown>;
      const edges = deviceNode.edges as Record<string, unknown>;
      const nodeFields = edges.node as Record<string, unknown>;

      // interfaces/tags are cardinality=many, should be included
      expect(nodeFields).toHaveProperty("interfaces");
      const interfaces = nodeFields.interfaces as Record<string, unknown>;
      expect(interfaces).toHaveProperty("count", null);
      expect(interfaces).toHaveProperty("edges");
    });

    it("should not include cardinality-many relationships by default", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
      });
      const queryData = node.generateQueryData();
      const deviceNode = queryData.InfraDevice as Record<string, unknown>;
      const edges = deviceNode.edges as Record<string, unknown>;
      const nodeFields = edges.node as Record<string, unknown>;

      expect(nodeFields).not.toHaveProperty("interfaces");
      expect(nodeFields).not.toHaveProperty("tags");
    });

    it("should include partial_match filter", () => {
      const schema = createSimpleSchema("TestNode");
      const node = new InfrahubNode({ schema, branch: "main" });
      const queryData = node.generateQueryData({
        filters: { name__value: "test" },
        partialMatch: true,
      });

      const testNode = queryData.TestNode as Record<string, unknown>;
      const filters = testNode["@filters"] as Record<string, unknown>;
      expect(filters.partial_match).toBe(true);
      expect(filters.name__value).toBe("test");
    });
  });

  describe("HFID", () => {
    it("should return HFID components from attributes", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: { name: { value: "router1" } },
      });
      const hfid = node.getHumanFriendlyId();
      expect(hfid).toEqual(["router1"]);
    });

    it("should return hfidStr with kind prefix", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: { name: { value: "router1" } },
      });
      expect(node.hfidStr).toBe("InfraDevice__router1");
    });

    it("should return null when attribute value is missing", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
      });
      // name has no value (undefined)
      expect(node.getHumanFriendlyId()).toBeNull();
      expect(node.hfidStr).toBeNull();
    });

    it("should return null for schemas without human_friendly_id", () => {
      const node = new InfrahubNode({
        schema: siteSchema,
        branch: "main",
        data: { name: { value: "NYC" } },
      });
      // siteSchema doesn't have human_friendly_id defined
      expect(node.getHumanFriendlyId()).toBeNull();
    });

    it("should return null when HFID references non-existent attribute", () => {
      // Create a schema where human_friendly_id references an attribute
      // that doesn't exist in the attributes list
      const schemaWithBadHfid = {
        ...deviceSchema,
        human_friendly_id: ["nonexistent__value"],
      };
      const node = new InfrahubNode({
        schema: schemaWithBadHfid,
        branch: "main",
        data: { name: { value: "router1" } },
      });
      expect(node.getHumanFriendlyId()).toBeNull();
    });
  });

  describe("generateInputData with RelatedNode/RelationshipManager", () => {
    it("should exclude unmodified relationships when excludeUnmodified is true", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          id: "device-1",
          name: { value: "router1" },
          site: { node: { id: "site-1" } },
        },
      });

      // Nothing was modified
      const input = node.generateInputData(true);
      const data = (input.data as Record<string, unknown>).data as Record<string, unknown>;
      // site was not modified, should not be present
      expect(data.site).toBeUndefined();
    });

    it("should include modified relationships when excludeUnmodified is true", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          id: "device-1",
          name: { value: "router1" },
          site: { node: { id: "site-1" } },
        },
      });

      // Modify the site relationship
      const site = node.getRelatedNode("site")!;
      site.id = "site-2";

      const input = node.generateInputData(true);
      const data = (input.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.site).toEqual({ id: "site-2" });
    });

    it("should include cardinality-many relationship data in mutations", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          name: { value: "router1" },
          interfaces: {
            edges: [
              { node: { id: "intf-1" } },
              { node: { id: "intf-2" } },
            ],
          },
        },
      });

      const input = node.generateInputData();
      const data = (input.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.interfaces).toEqual([{ id: "intf-1" }, { id: "intf-2" }]);
    });

    it("should reflect add/remove on RelationshipManager in mutations", () => {
      const node = new InfrahubNode({
        schema: deviceSchema,
        branch: "main",
        data: {
          name: { value: "router1" },
          interfaces: {
            edges: [{ node: { id: "intf-1" } }],
          },
        },
      });

      const mgr = node.getRelationshipManager("interfaces")!;
      mgr.add("intf-2");
      mgr.remove("intf-1");

      const input = node.generateInputData();
      const data = (input.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.interfaces).toEqual([{ id: "intf-2" }]);
    });
  });
});

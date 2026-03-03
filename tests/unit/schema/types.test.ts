import { describe, it, expect } from "vitest";
import {
  isNodeSchema,
  getAttributeNames,
  getRelationshipNames,
  getRelationshipByName,
} from "../../../src/schema/types.js";
import type { NodeSchema, GenericSchema } from "../../../src/schema/types.js";
import { deviceSchema, genericDeviceSchema } from "../../fixtures/schemas.js";

describe("schema/types", () => {
  describe("isNodeSchema()", () => {
    it("should return true for a NodeSchema", () => {
      expect(isNodeSchema(deviceSchema)).toBe(true);
    });

    it("should return false for a GenericSchema (has used_by)", () => {
      expect(isNodeSchema(genericDeviceSchema)).toBe(false);
    });

    it("should return false for GenericSchema with empty used_by array", () => {
      const generic: GenericSchema = {
        kind: "TestGeneric",
        namespace: "Test",
        name: "Generic",
        attributes: [],
        relationships: [],
        used_by: [],
      };
      expect(isNodeSchema(generic)).toBe(false);
    });

    it("should return true for NodeSchema without optional fields", () => {
      const minimal: NodeSchema = {
        kind: "MinimalNode",
        namespace: "Test",
        name: "Minimal",
        attributes: [],
        relationships: [],
      };
      // Minimal NodeSchema with no discriminant fields still defaults to true
      expect(isNodeSchema(minimal)).toBe(true);
    });

    it("should return false for GenericSchema without used_by (ambiguous but has no NodeSchema fields)", () => {
      // Simulates a GenericSchema where the API omitted used_by
      const ambiguous = {
        kind: "TestAmbiguous",
        namespace: "Test",
        name: "Ambiguous",
        attributes: [],
        relationships: [],
      } as NodeSchema | GenericSchema;
      // Defaults to NodeSchema when ambiguous (no used_by, no NodeSchema-specific fields)
      expect(isNodeSchema(ambiguous)).toBe(true);
    });

    it("should return true for NodeSchema with only inherit_from", () => {
      const schema: NodeSchema = {
        kind: "TestNode",
        namespace: "Test",
        name: "Node",
        attributes: [],
        relationships: [],
        inherit_from: ["SomeParent"],
      };
      expect(isNodeSchema(schema)).toBe(true);
    });
  });

  describe("getAttributeNames()", () => {
    it("should return attribute names from a NodeSchema", () => {
      const names = getAttributeNames(deviceSchema);
      expect(names).toContain("name");
      expect(names).toContain("description");
      expect(names).toContain("role");
      expect(names).toContain("status");
      expect(names).toHaveLength(4);
    });

    it("should return attribute names from a GenericSchema", () => {
      const names = getAttributeNames(genericDeviceSchema);
      expect(names).toEqual(["name"]);
    });

    it("should return empty array for schema with no attributes", () => {
      const schema: NodeSchema = {
        kind: "EmptyNode",
        namespace: "Test",
        name: "Empty",
        attributes: [],
        relationships: [],
      };
      expect(getAttributeNames(schema)).toEqual([]);
    });
  });

  describe("getRelationshipNames()", () => {
    it("should return relationship names from a schema", () => {
      const names = getRelationshipNames(deviceSchema);
      expect(names).toContain("site");
      expect(names).toContain("interfaces");
      expect(names).toContain("tags");
      expect(names).toHaveLength(3);
    });

    it("should return empty array for schema with no relationships", () => {
      const names = getRelationshipNames(genericDeviceSchema);
      expect(names).toEqual([]);
    });
  });

  describe("getRelationshipByName()", () => {
    it("should return the relationship schema when found", () => {
      const rel = getRelationshipByName(deviceSchema, "site");
      expect(rel).toBeDefined();
      expect(rel!.name).toBe("site");
      expect(rel!.peer).toBe("InfraSite");
      expect(rel!.cardinality).toBe("one");
    });

    it("should return undefined when relationship not found", () => {
      const rel = getRelationshipByName(deviceSchema, "nonexistent");
      expect(rel).toBeUndefined();
    });

    it("should return correct relationship among multiple", () => {
      const interfaces = getRelationshipByName(deviceSchema, "interfaces");
      expect(interfaces).toBeDefined();
      expect(interfaces!.cardinality).toBe("many");
      expect(interfaces!.kind).toBe("Component");
    });
  });
});

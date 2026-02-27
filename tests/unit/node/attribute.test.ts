import { describe, it, expect } from "vitest";
import { Attribute } from "../../../src/node/attribute.js";
import type { AttributeSchema } from "../../../src/schema/types.js";

const textSchema: AttributeSchema = {
  name: "name",
  kind: "Text",
  unique: false,
  optional: false,
  read_only: false,
  inherited: false,
};

const readOnlySchema: AttributeSchema = {
  name: "status",
  kind: "Text",
  unique: false,
  optional: false,
  read_only: true,
  inherited: false,
};

describe("Attribute", () => {
  describe("initialization", () => {
    it("should initialize with raw value", () => {
      const attr = new Attribute("name", textSchema, "router1");
      expect(attr.value).toBe("router1");
      expect(attr.name).toBe("name");
      expect(attr.hasBeenMutated).toBe(false);
    });

    it("should initialize with structured data", () => {
      const attr = new Attribute("name", textSchema, {
        value: "router1",
        is_default: true,
        is_from_profile: false,
        is_inherited: false,
      });
      expect(attr.value).toBe("router1");
      expect(attr.isDefault).toBe(true);
      expect(attr.isFromProfile).toBe(false);
      expect(attr.isInherited).toBe(false);
    });

    it("should initialize with undefined data", () => {
      const attr = new Attribute("name", textSchema);
      expect(attr.value).toBeUndefined();
      expect(attr.isDefault).toBe(false);
    });

    it("should extract source and owner IDs", () => {
      const attr = new Attribute("name", textSchema, {
        value: "test",
        source: { id: "source-123", display_label: "Source" },
        owner: { id: "owner-456", display_label: "Owner" },
      });
      expect(attr.source).toBe("source-123");
      expect(attr.owner).toBe("owner-456");
    });
  });

  describe("mutation tracking", () => {
    it("should track mutations", () => {
      const attr = new Attribute("name", textSchema, "original");
      expect(attr.hasBeenMutated).toBe(false);

      attr.value = "changed";
      expect(attr.hasBeenMutated).toBe(true);
      expect(attr.value).toBe("changed");
    });

    it("should not mark as mutated when setting same value", () => {
      const attr = new Attribute("name", textSchema, "same");
      attr.value = "same";
      expect(attr.hasBeenMutated).toBe(false);
    });
  });

  describe("generateInputData", () => {
    it("should generate input data for writable attribute", () => {
      const attr = new Attribute("name", textSchema, { value: "router1" });
      const data = attr.generateInputData();
      expect(data).toEqual({ value: "router1" });
    });

    it("should return null for read-only attribute", () => {
      const attr = new Attribute("status", readOnlySchema, { value: "active" });
      const data = attr.generateInputData();
      expect(data).toBeNull();
    });

    it("should include source and owner if set", () => {
      const attr = new Attribute("name", textSchema, {
        value: "test",
        source: { id: "src-1" },
        owner: { id: "own-1" },
      });
      const data = attr.generateInputData();
      expect(data).toEqual({
        value: "test",
        source: "src-1",
        owner: "own-1",
      });
    });
  });

  describe("generateQueryData", () => {
    it("should generate basic query data", () => {
      const attr = new Attribute("name", textSchema);
      const data = attr.generateQueryData();
      expect(data).toEqual({ value: null });
    });

    it("should include properties when requested", () => {
      const attr = new Attribute("name", textSchema);
      const data = attr.generateQueryData(true);
      expect(data).toHaveProperty("value", null);
      expect(data).toHaveProperty("is_default", null);
      expect(data).toHaveProperty("is_from_profile", null);
      expect(data).toHaveProperty("is_inherited", null);
      expect(data).toHaveProperty("source");
      expect(data).toHaveProperty("owner");
    });
  });
});

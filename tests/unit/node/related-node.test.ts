import { describe, it, expect } from "vitest";
import { RelatedNode } from "../../../src/node/related-node.js";
import type { RelationshipSchema } from "../../../src/schema/types.js";

const siteRelSchema: RelationshipSchema = {
  name: "site",
  peer: "InfraSite",
  kind: "Attribute",
  direction: "outbound",
  cardinality: "one",
  optional: false,
  read_only: false,
  inherited: false,
};

const tagRelSchema: RelationshipSchema = {
  name: "tags",
  peer: "BuiltinTag",
  kind: "Generic",
  direction: "bidirectional",
  cardinality: "many",
  optional: true,
  read_only: false,
  inherited: true,
};

describe("RelatedNode", () => {
  describe("construction", () => {
    it("should create an empty related node", () => {
      const rel = new RelatedNode({ schema: siteRelSchema, branch: "main" });
      expect(rel.id).toBeNull();
      expect(rel.hfid).toBeNull();
      expect(rel.typename).toBeNull();
      expect(rel.displayLabel).toBeNull();
      expect(rel.initialized).toBe(false);
      expect(rel.hasUpdate).toBe(false);
    });

    it("should initialize from a string ID", () => {
      const rel = new RelatedNode({
        schema: siteRelSchema,
        branch: "main",
        data: "site-uuid-1",
      });
      expect(rel.id).toBe("site-uuid-1");
      expect(rel.initialized).toBe(true);
    });

    it("should initialize from an HFID array", () => {
      const rel = new RelatedNode({
        schema: siteRelSchema,
        branch: "main",
        data: ["nyc", "us-east"],
      });
      expect(rel.hfid).toEqual(["nyc", "us-east"]);
      expect(rel.id).toBeNull();
      expect(rel.initialized).toBe(true);
    });

    it("should initialize from a dict with node wrapper", () => {
      const rel = new RelatedNode({
        schema: siteRelSchema,
        branch: "main",
        data: {
          node: {
            id: "site-uuid-2",
            display_label: "NYC Site",
            __typename: "InfraSite",
            hfid: ["nyc"],
          },
        },
      });
      expect(rel.id).toBe("site-uuid-2");
      expect(rel.displayLabel).toBe("NYC Site");
      expect(rel.typename).toBe("InfraSite");
      expect(rel.hfid).toEqual(["nyc"]);
    });

    it("should initialize from a flat dict", () => {
      const rel = new RelatedNode({
        schema: siteRelSchema,
        branch: "main",
        data: {
          id: "site-uuid-3",
          display_label: "LAX Site",
          __typename: "InfraSite",
        },
      });
      expect(rel.id).toBe("site-uuid-3");
      expect(rel.displayLabel).toBe("LAX Site");
    });

    it("should extract relationship properties", () => {
      const rel = new RelatedNode({
        schema: tagRelSchema,
        branch: "main",
        data: {
          node: { id: "tag-1", __typename: "BuiltinTag" },
          properties: {
            is_protected: true,
            source: { id: "source-1" },
            owner: { id: "owner-1" },
          },
        },
      });
      expect(rel.isProtected).toBe(true);
      expect(rel.source).toBe("source-1");
      expect(rel.owner).toBe("owner-1");
    });

    it("should handle null/undefined data gracefully", () => {
      const relNull = new RelatedNode({
        schema: siteRelSchema,
        branch: "main",
        data: null,
      });
      expect(relNull.id).toBeNull();

      const relUndef = new RelatedNode({
        schema: siteRelSchema,
        branch: "main",
        data: undefined,
      });
      expect(relUndef.id).toBeNull();
    });
  });

  describe("mutation tracking", () => {
    it("should track id changes", () => {
      const rel = new RelatedNode({ schema: siteRelSchema, branch: "main" });
      expect(rel.hasUpdate).toBe(false);
      rel.id = "new-id";
      expect(rel.hasUpdate).toBe(true);
    });

    it("should track hfid changes", () => {
      const rel = new RelatedNode({ schema: siteRelSchema, branch: "main" });
      rel.hfid = ["new-hfid"];
      expect(rel.hasUpdate).toBe(true);
    });

    it("should track property changes", () => {
      const rel = new RelatedNode({
        schema: tagRelSchema,
        branch: "main",
        data: { node: { id: "tag-1" } },
      });
      expect(rel.hasUpdate).toBe(false);
      rel.isProtected = true;
      expect(rel.hasUpdate).toBe(true);
    });

    it("should not flag update when id set to same value", () => {
      const rel = new RelatedNode({
        schema: siteRelSchema,
        branch: "main",
        data: "site-1",
      });
      rel.id = "site-1"; // same value
      expect(rel.hasUpdate).toBe(false);
    });
  });

  describe("generateQueryData", () => {
    it("should generate basic query data", () => {
      const queryData = RelatedNode.generateQueryData();
      expect(queryData).toEqual({
        node: {
          id: null,
          hfid: null,
          display_label: null,
          __typename: null,
        },
      });
    });

    it("should include properties when requested", () => {
      const queryData = RelatedNode.generateQueryData({ includeProperties: true });
      expect(queryData.node).toEqual({
        id: null,
        hfid: null,
        display_label: null,
        __typename: null,
      });
      expect(queryData.properties).toBeDefined();
      const props = queryData.properties as Record<string, unknown>;
      expect(props.is_protected).toBeNull();
      expect(props.source).toEqual({
        id: null,
        display_label: null,
        __typename: null,
      });
      expect(props.owner).toEqual({
        id: null,
        display_label: null,
        __typename: null,
      });
    });
  });

  describe("generateInputData", () => {
    it("should return null for empty related node", () => {
      const rel = new RelatedNode({ schema: siteRelSchema, branch: "main" });
      expect(rel.generateInputData()).toBeNull();
    });

    it("should generate input with id", () => {
      const rel = new RelatedNode({
        schema: siteRelSchema,
        branch: "main",
        data: "site-1",
      });
      expect(rel.generateInputData()).toEqual({ id: "site-1" });
    });

    it("should generate input with hfid when no id", () => {
      const rel = new RelatedNode({
        schema: siteRelSchema,
        branch: "main",
        data: ["nyc"],
      });
      expect(rel.generateInputData()).toEqual({ hfid: ["nyc"] });
    });

    it("should include relationship properties in input", () => {
      const rel = new RelatedNode({
        schema: tagRelSchema,
        branch: "main",
        data: "tag-1",
      });
      rel.isProtected = true;
      rel.source = "source-1";
      rel.owner = "owner-1";

      const input = rel.generateInputData();
      expect(input).toEqual({
        id: "tag-1",
        _relation__is_protected: true,
        _relation__source: "source-1",
        _relation__owner: "owner-1",
      });
    });
  });
});

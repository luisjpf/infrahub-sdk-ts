import { describe, it, expect } from "vitest";
import { RelationshipManager } from "../../../src/node/relationship-manager.js";
import { RelatedNode } from "../../../src/node/related-node.js";
import type { RelationshipSchema } from "../../../src/schema/types.js";

const interfacesRelSchema: RelationshipSchema = {
  name: "interfaces",
  peer: "InfraInterface",
  kind: "Component",
  direction: "outbound",
  cardinality: "many",
  optional: true,
  read_only: false,
  inherited: false,
};

const tagsRelSchema: RelationshipSchema = {
  name: "tags",
  peer: "BuiltinTag",
  kind: "Generic",
  direction: "bidirectional",
  cardinality: "many",
  optional: true,
  read_only: false,
  inherited: true,
};

describe("RelationshipManager", () => {
  describe("construction", () => {
    it("should create an empty manager", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      expect(mgr.peers).toHaveLength(0);
      expect(mgr.initialized).toBe(false);
      expect(mgr.hasUpdate).toBe(false);
      expect(mgr.count).toBe(0);
    });

    it("should initialize from edges format", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
        data: {
          edges: [
            { node: { id: "intf-1", __typename: "InfraInterface", display_label: "eth0" } },
            { node: { id: "intf-2", __typename: "InfraInterface", display_label: "eth1" } },
          ],
        },
      });
      expect(mgr.peers).toHaveLength(2);
      expect(mgr.initialized).toBe(true);
      expect(mgr.peers[0]!.id).toBe("intf-1");
      expect(mgr.peers[1]!.id).toBe("intf-2");
    });

    it("should initialize from direct array", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
        data: [
          { id: "intf-1", __typename: "InfraInterface" },
          { id: "intf-2", __typename: "InfraInterface" },
        ],
      });
      expect(mgr.peers).toHaveLength(2);
      expect(mgr.initialized).toBe(true);
    });

    it("should initialize from edges with properties", () => {
      const mgr = new RelationshipManager({
        schema: tagsRelSchema,
        branch: "main",
        data: {
          edges: [
            {
              node: { id: "tag-1", __typename: "BuiltinTag" },
              properties: { is_protected: true, source: { id: "src-1" } },
            },
          ],
        },
      });
      expect(mgr.peers).toHaveLength(1);
      expect(mgr.peers[0]!.isProtected).toBe(true);
      expect(mgr.peers[0]!.source).toBe("src-1");
    });

    it("should handle null/undefined data", () => {
      const mgr1 = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
        data: null,
      });
      expect(mgr1.peers).toHaveLength(0);

      const mgr2 = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
        data: undefined,
      });
      expect(mgr2.peers).toHaveLength(0);
    });
  });

  describe("peer accessors", () => {
    it("should return peer IDs", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
        data: {
          edges: [
            { node: { id: "intf-1" } },
            { node: { id: "intf-2" } },
          ],
        },
      });
      expect(mgr.peerIds).toEqual(["intf-1", "intf-2"]);
    });

    it("should return peer HFIDs", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
        data: [["eth0"], ["eth1"]],
      });
      expect(mgr.peerHfids).toEqual([["eth0"], ["eth1"]]);
    });

    it("should filter null IDs from peerIds", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      mgr.add(["eth0"]); // hfid only, no id
      expect(mgr.peerIds).toEqual([]);
    });
  });

  describe("add", () => {
    it("should add a peer by string ID", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      mgr.add("intf-new");
      expect(mgr.peers).toHaveLength(1);
      expect(mgr.peers[0]!.id).toBe("intf-new");
      expect(mgr.hasUpdate).toBe(true);
    });

    it("should add a peer by HFID array", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      mgr.add(["eth0"]);
      expect(mgr.peers).toHaveLength(1);
      expect(mgr.peers[0]!.hfid).toEqual(["eth0"]);
    });

    it("should add a peer by dict", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      mgr.add({ id: "intf-dict", __typename: "InfraInterface" });
      expect(mgr.peers).toHaveLength(1);
      expect(mgr.peers[0]!.id).toBe("intf-dict");
    });

    it("should add a RelatedNode instance directly", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      const rel = new RelatedNode({
        schema: interfacesRelSchema,
        branch: "main",
        data: "intf-direct",
      });
      mgr.add(rel);
      expect(mgr.peers).toHaveLength(1);
      expect(mgr.peers[0]).toBe(rel);
    });
  });

  describe("extend", () => {
    it("should add multiple peers at once", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      mgr.extend(["intf-1", "intf-2", "intf-3"]);
      expect(mgr.peers).toHaveLength(3);
      expect(mgr.peerIds).toEqual(["intf-1", "intf-2", "intf-3"]);
    });
  });

  describe("remove", () => {
    it("should remove a peer by ID string", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
        data: {
          edges: [
            { node: { id: "intf-1" } },
            { node: { id: "intf-2" } },
          ],
        },
      });
      mgr.remove("intf-1");
      expect(mgr.peers).toHaveLength(1);
      expect(mgr.peers[0]!.id).toBe("intf-2");
      expect(mgr.hasUpdate).toBe(true);
    });

    it("should remove a peer by RelatedNode reference", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      const rel = new RelatedNode({
        schema: interfacesRelSchema,
        branch: "main",
        data: "intf-ref",
      });
      mgr.add(rel);
      expect(mgr.peers).toHaveLength(1);
      mgr.remove(rel);
      expect(mgr.peers).toHaveLength(0);
    });

    it("should not fail when removing non-existent ID", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      mgr.remove("nonexistent"); // Should not throw
      expect(mgr.hasUpdate).toBe(false);
    });
  });

  describe("generateQueryData", () => {
    it("should generate basic many-relationship query data", () => {
      const queryData = RelationshipManager.generateQueryData();
      expect(queryData).toEqual({
        count: null,
        edges: {
          node: {
            id: null,
            hfid: null,
            display_label: null,
            __typename: null,
          },
        },
      });
    });

    it("should include properties when requested", () => {
      const queryData = RelationshipManager.generateQueryData({ includeProperties: true });
      expect(queryData.count).toBeNull();
      const edges = queryData.edges as Record<string, unknown>;
      expect(edges.properties).toBeDefined();
      const props = edges.properties as Record<string, unknown>;
      expect(props.is_protected).toBeNull();
      expect(props.source).toEqual({
        id: null,
        display_label: null,
        __typename: null,
      });
    });
  });

  describe("generateInputData", () => {
    it("should return empty array for empty manager", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      expect(mgr.generateInputData()).toEqual([]);
    });

    it("should generate input for all peers", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
        data: {
          edges: [
            { node: { id: "intf-1" } },
            { node: { id: "intf-2" } },
          ],
        },
      });
      const input = mgr.generateInputData();
      expect(input).toEqual([{ id: "intf-1" }, { id: "intf-2" }]);
    });

    it("should generate input with relationship properties", () => {
      const mgr = new RelationshipManager({
        schema: tagsRelSchema,
        branch: "main",
      });
      const rel = new RelatedNode({
        schema: tagsRelSchema,
        branch: "main",
        data: "tag-1",
      });
      rel.isProtected = true;
      mgr.add(rel);

      const input = mgr.generateInputData();
      expect(input).toEqual([
        { id: "tag-1", _relation__is_protected: true },
      ]);
    });

    it("should handle mixed id and hfid peers", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
      });
      mgr.add("intf-by-id");
      mgr.add(["eth0"]);
      const input = mgr.generateInputData();
      expect(input).toEqual([
        { id: "intf-by-id" },
        { hfid: ["eth0"] },
      ]);
    });
  });

  describe("hasUpdate tracking", () => {
    it("should detect update when peer is modified", () => {
      const mgr = new RelationshipManager({
        schema: interfacesRelSchema,
        branch: "main",
        data: {
          edges: [{ node: { id: "intf-1" } }],
        },
      });
      expect(mgr.hasUpdate).toBe(false);

      // Modify a peer's property
      (mgr.peers[0] as RelatedNode).id = "intf-modified";
      expect(mgr.hasUpdate).toBe(true);
    });
  });
});

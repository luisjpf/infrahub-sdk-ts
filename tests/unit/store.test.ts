import { describe, it, expect, beforeEach } from "vitest";
import { NodeStore } from "../../src/store.js";
import { InfrahubNode } from "../../src/node/node.js";
import { createSimpleSchema } from "../fixtures/schemas.js";

const schema = createSimpleSchema("TestNode");

function makeNode(id: string, branch: string = "main"): InfrahubNode {
  return new InfrahubNode({
    schema,
    branch,
    data: { id, name: { value: `node-${id}` } },
  });
}

describe("NodeStore", () => {
  let store: NodeStore;

  beforeEach(() => {
    store = new NodeStore("main");
  });

  describe("set and getById", () => {
    it("should store and retrieve a node by ID", () => {
      const node = makeNode("uuid-1");
      store.set(node);

      const retrieved = store.getById("uuid-1");
      expect(retrieved).toBe(node);
    });

    it("should return undefined for non-existent ID", () => {
      expect(store.getById("nonexistent")).toBeUndefined();
    });
  });

  describe("set with key", () => {
    it("should store and retrieve by custom key", () => {
      const node = makeNode("uuid-1");
      store.set(node, "router1");

      const retrieved = store.getByKey("TestNode", "router1");
      expect(retrieved).toBe(node);
    });
  });

  describe("has", () => {
    it("should return true for stored nodes", () => {
      store.set(makeNode("uuid-1"));
      expect(store.has("uuid-1")).toBe(true);
    });

    it("should return false for missing nodes", () => {
      expect(store.has("missing")).toBe(false);
    });
  });

  describe("remove", () => {
    it("should remove a node by ID", () => {
      store.set(makeNode("uuid-1"));
      expect(store.has("uuid-1")).toBe(true);

      store.remove("uuid-1");
      expect(store.has("uuid-1")).toBe(false);
    });

    it("should return false when removing non-existent node", () => {
      expect(store.remove("nonexistent")).toBe(false);
    });
  });

  describe("getAll", () => {
    it("should return all nodes for default branch", () => {
      store.set(makeNode("uuid-1"));
      store.set(makeNode("uuid-2"));

      const all = store.getAll();
      expect(all).toHaveLength(2);
    });

    it("should return empty array for empty branch", () => {
      expect(store.getAll("feature-1")).toHaveLength(0);
    });
  });

  describe("branch isolation", () => {
    it("should store nodes per branch", () => {
      const node1 = makeNode("uuid-1", "main");
      const node2 = makeNode("uuid-2", "feature-1");

      store.set(node1);
      store.set(node2);

      expect(store.getById("uuid-1", "main")).toBe(node1);
      expect(store.getById("uuid-2", "feature-1")).toBe(node2);
      expect(store.getById("uuid-1", "feature-1")).toBeUndefined();
    });
  });

  describe("clear", () => {
    it("should clear a specific branch", () => {
      store.set(makeNode("uuid-1"));
      store.set(makeNode("uuid-2", "feature-1"));

      store.clear("main");

      expect(store.getAll("main")).toHaveLength(0);
      expect(store.getAll("feature-1")).toHaveLength(1);
    });

    it("should clear all branches", () => {
      store.set(makeNode("uuid-1"));
      store.set(makeNode("uuid-2", "feature-1"));

      store.clear();

      expect(store.getAll("main")).toHaveLength(0);
      expect(store.getAll("feature-1")).toHaveLength(0);
    });
  });
});

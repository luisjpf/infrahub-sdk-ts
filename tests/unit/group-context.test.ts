import { describe, it, expect, vi, beforeEach } from "vitest";
import { InfrahubGroupContext } from "../../src/group-context.js";
import type { GraphQLExecutor } from "../../src/group-context.js";

describe("InfrahubGroupContext", () => {
  let ctx: InfrahubGroupContext;

  beforeEach(() => {
    ctx = new InfrahubGroupContext();
  });

  describe("setProperties()", () => {
    it("should set identifier and params", () => {
      ctx.setProperties({
        identifier: "my-provisioner",
        params: { site: "dc1", role: "leaf" },
      });

      expect(ctx.generateGroupName()).toContain("my-provisioner");
    });

    it("should use defaults for optional properties", () => {
      ctx.setProperties({ identifier: "test" });
      // Should not throw, defaults applied internally
      expect(ctx.generateGroupName()).toBe("test");
    });
  });

  describe("addRelatedNodes()", () => {
    it("should track unique node IDs", () => {
      ctx.addRelatedNodes(["id-1", "id-2"]);
      ctx.addRelatedNodes(["id-2", "id-3"]);

      expect(ctx.relatedNodeIds).toEqual(["id-1", "id-2", "id-3"]);
    });

    it("should not add duplicate IDs", () => {
      ctx.addRelatedNodes(["id-1"]);
      ctx.addRelatedNodes(["id-1"]);

      expect(ctx.relatedNodeIds).toHaveLength(1);
    });
  });

  describe("addRelatedGroups()", () => {
    it("should track unique group IDs", () => {
      ctx.addRelatedGroups(["grp-1", "grp-2"]);
      ctx.addRelatedGroups(["grp-2", "grp-3"]);

      expect(ctx.relatedGroupIds).toEqual(["grp-1", "grp-2", "grp-3"]);
    });
  });

  describe("generateGroupName()", () => {
    it("should use just identifier when no params", () => {
      ctx.setProperties({ identifier: "my-app" });
      expect(ctx.generateGroupName()).toBe("my-app");
    });

    it("should include hash when params are set", () => {
      ctx.setProperties({
        identifier: "my-app",
        params: { site: "dc1" },
      });

      const name = ctx.generateGroupName();
      expect(name).toMatch(/^my-app-[0-9a-f]{8}$/);
    });

    it("should include suffix", () => {
      ctx.setProperties({ identifier: "my-app" });
      const name = ctx.generateGroupName("extra");
      expect(name).toBe("my-app-extra");
    });

    it("should include suffix and hash", () => {
      ctx.setProperties({
        identifier: "my-app",
        params: { role: "spine" },
      });

      const name = ctx.generateGroupName("sub");
      expect(name).toMatch(/^my-app-sub-[0-9a-f]{8}$/);
    });

    it("should be deterministic for same params", () => {
      ctx.setProperties({
        identifier: "test",
        params: { a: "1", b: "2" },
      });
      const name1 = ctx.generateGroupName();

      const ctx2 = new InfrahubGroupContext();
      ctx2.setProperties({
        identifier: "test",
        params: { b: "2", a: "1" },
      });
      const name2 = ctx2.generateGroupName();

      expect(name1).toBe(name2); // sorted keys means order-independent
    });

    it("should differ for different params", () => {
      ctx.setProperties({
        identifier: "test",
        params: { a: "1" },
      });
      const name1 = ctx.generateGroupName();

      const ctx2 = new InfrahubGroupContext();
      ctx2.setProperties({
        identifier: "test",
        params: { a: "2" },
      });
      const name2 = ctx2.generateGroupName();

      expect(name1).not.toBe(name2);
    });
  });

  describe("generateGroupDescription()", () => {
    it("should include identifier when no params", () => {
      ctx.setProperties({ identifier: "my-app" });
      expect(ctx.generateGroupDescription()).toBe("Group managed by my-app");
    });

    it("should include params in description", () => {
      ctx.setProperties({
        identifier: "my-app",
        params: { site: "dc1", role: "leaf" },
      });
      const desc = ctx.generateGroupDescription();
      expect(desc).toContain("my-app");
      expect(desc).toContain("site=dc1");
      expect(desc).toContain("role=leaf");
    });
  });

  describe("updateGroup()", () => {
    it("should execute a create mutation with tracked nodes", async () => {
      const executor: GraphQLExecutor = vi.fn().mockResolvedValue({
        CoreStandardGroupCreate: { ok: true, object: { id: "grp-1" } },
      });

      ctx.setProperties({ identifier: "test-tracking" });
      ctx.addRelatedNodes(["node-1", "node-2"]);

      await ctx.updateGroup(executor, "main");

      expect(executor).toHaveBeenCalledOnce();
      const query = vi.mocked(executor).mock.calls[0]![0];
      expect(query).toContain("CoreStandardGroupCreate");
      expect(query).toContain("test-tracking");
      expect(query).toContain("node-1");
      expect(query).toContain("node-2");
    });

    it("should use custom group type", async () => {
      const executor: GraphQLExecutor = vi.fn().mockResolvedValue({});

      ctx.setProperties({
        identifier: "custom",
        groupType: "CustomGroup",
      });

      await ctx.updateGroup(executor, "main");

      const query = vi.mocked(executor).mock.calls[0]![0];
      expect(query).toContain("CustomGroupCreate");
    });

    it("should skip if identifier is empty", async () => {
      const executor: GraphQLExecutor = vi.fn().mockResolvedValue({});

      // No setProperties called, identifier is empty
      await ctx.updateGroup(executor, "main");

      expect(executor).not.toHaveBeenCalled();
    });

    it("should delete unused nodes when enabled", async () => {
      const executor: GraphQLExecutor = vi.fn().mockResolvedValue({});

      ctx.setProperties({
        identifier: "cleanup-test",
        deleteUnusedNodes: true,
      });
      ctx.previousMemberIds = ["old-1", "old-2", "kept-1"];
      ctx.addRelatedNodes(["kept-1", "new-1"]);

      await ctx.updateGroup(executor, "main");

      // Should have called: 1 for group create + 2 for deleting old-1 and old-2
      expect(executor).toHaveBeenCalledTimes(3);

      const deleteCalls = vi.mocked(executor).mock.calls.slice(1);
      expect(deleteCalls[0]![0]).toContain("old-1");
      expect(deleteCalls[1]![0]).toContain("old-2");
    });

    it("should not delete when deleteUnusedNodes is false", async () => {
      const executor: GraphQLExecutor = vi.fn().mockResolvedValue({});

      ctx.setProperties({ identifier: "no-delete" });
      ctx.previousMemberIds = ["old-1"];
      ctx.addRelatedNodes(["new-1"]);

      await ctx.updateGroup(executor, "main");

      // Only 1 call: group create
      expect(executor).toHaveBeenCalledOnce();
    });

    it("should handle delete failures gracefully", async () => {
      const executor: GraphQLExecutor = vi.fn()
        .mockResolvedValueOnce({}) // group create
        .mockRejectedValueOnce(new Error("already deleted")); // delete

      ctx.setProperties({
        identifier: "graceful",
        deleteUnusedNodes: true,
      });
      ctx.previousMemberIds = ["old-1"];
      ctx.addRelatedNodes([]);

      // Should not throw
      await ctx.updateGroup(executor, "main");
    });

    it("should pass branch and tracker to executor", async () => {
      const executor: GraphQLExecutor = vi.fn().mockResolvedValue({});

      ctx.setProperties({ identifier: "branch-test" });
      await ctx.updateGroup(executor, "feature-1");

      expect(executor).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
        "mutation-group-context-branch-test",
        "feature-1",
      );
    });
  });

  describe("reset()", () => {
    it("should clear all tracked IDs", () => {
      ctx.addRelatedNodes(["id-1", "id-2"]);
      ctx.addRelatedGroups(["grp-1"]);
      ctx.previousMemberIds = ["old-1"];

      ctx.reset();

      expect(ctx.relatedNodeIds).toHaveLength(0);
      expect(ctx.relatedGroupIds).toHaveLength(0);
      expect(ctx.previousMemberIds).toBeNull();
    });
  });
});

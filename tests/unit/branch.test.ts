import { describe, it, expect, vi } from "vitest";
import { BranchManager, type ExecuteGraphQLFn } from "../../src/branch.js";
import { BranchNotFoundError } from "../../src/errors.js";

function createBranchData(name: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `branch-${name}-id`,
    name,
    description: null,
    sync_with_git: true,
    is_default: name === "main",
    has_schema_changes: false,
    graph_version: 1,
    status: "OPEN",
    origin_branch: null,
    branched_from: "main",
    ...overrides,
  };
}

describe("BranchManager", () => {
  describe("all", () => {
    it("should list all branches", async () => {
      const executeGraphQL: ExecuteGraphQLFn = vi.fn().mockResolvedValue({
        Branch: [
          createBranchData("main"),
          createBranchData("feature-1"),
        ],
      });
      const manager = new BranchManager(executeGraphQL);

      const branches = await manager.all();

      expect(Object.keys(branches)).toHaveLength(2);
      expect(branches.main?.name).toBe("main");
      expect(branches["feature-1"]?.name).toBe("feature-1");
    });
  });

  describe("get", () => {
    it("should get a branch by name", async () => {
      const executeGraphQL: ExecuteGraphQLFn = vi.fn().mockResolvedValue({
        Branch: [createBranchData("feature-1")],
      });
      const manager = new BranchManager(executeGraphQL);

      const branch = await manager.get("feature-1");

      expect(branch.name).toBe("feature-1");
      expect(branch.status).toBe("OPEN");
    });

    it("should throw BranchNotFoundError when branch does not exist", async () => {
      const executeGraphQL: ExecuteGraphQLFn = vi.fn().mockResolvedValue({
        Branch: [],
      });
      const manager = new BranchManager(executeGraphQL);

      await expect(manager.get("nonexistent")).rejects.toThrow(BranchNotFoundError);
    });
  });

  describe("create", () => {
    it("should create a branch", async () => {
      const executeGraphQL: ExecuteGraphQLFn = vi.fn().mockResolvedValue({
        BranchCreate: {
          ok: true,
          object: createBranchData("new-branch"),
        },
      });
      const manager = new BranchManager(executeGraphQL);

      const branch = await manager.create({ branchName: "new-branch" });

      expect(branch.name).toBe("new-branch");
      expect(executeGraphQL).toHaveBeenCalledOnce();
      const query = (executeGraphQL as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(query).toContain("BranchCreate");
      expect(query).toContain('"new-branch"');
    });

    it("should pass description and sync_with_git options", async () => {
      const executeGraphQL: ExecuteGraphQLFn = vi.fn().mockResolvedValue({
        BranchCreate: {
          ok: true,
          object: createBranchData("test-branch"),
        },
      });
      const manager = new BranchManager(executeGraphQL);

      await manager.create({
        branchName: "test-branch",
        description: "Test branch",
        syncWithGit: false,
      });

      const query = (executeGraphQL as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(query).toContain('"Test branch"');
      expect(query).toContain("sync_with_git: false");
    });
  });

  describe("delete", () => {
    it("should delete a branch", async () => {
      const executeGraphQL: ExecuteGraphQLFn = vi.fn().mockResolvedValue({
        BranchDelete: { ok: true },
      });
      const manager = new BranchManager(executeGraphQL);

      const result = await manager.delete("feature-1");

      expect(result).toBe(true);
      const query = (executeGraphQL as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(query).toContain("BranchDelete");
    });
  });

  describe("merge", () => {
    it("should merge a branch", async () => {
      const executeGraphQL: ExecuteGraphQLFn = vi.fn().mockResolvedValue({
        BranchMerge: { ok: true, object: createBranchData("feature-1") },
      });
      const manager = new BranchManager(executeGraphQL);

      const result = await manager.merge("feature-1");

      expect(result).toBe(true);
      const query = (executeGraphQL as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(query).toContain("BranchMerge");
    });
  });

  describe("rebase", () => {
    it("should rebase a branch", async () => {
      const executeGraphQL: ExecuteGraphQLFn = vi.fn().mockResolvedValue({
        BranchRebase: { ok: true, object: createBranchData("feature-1") },
      });
      const manager = new BranchManager(executeGraphQL);

      const result = await manager.rebase("feature-1");

      expect(result).toBe(true);
      const query = (executeGraphQL as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(query).toContain("BranchRebase");
    });
  });
});

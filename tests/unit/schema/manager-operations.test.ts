import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "../../../src/errors.js";
import { SchemaManager } from "../../../src/schema/manager.js";
import type { InfrahubTransport } from "../../../src/transport.js";
import type { HttpResponse } from "../../../src/types.js";
import type { NodeSchema, GenericSchema } from "../../../src/schema/types.js";

const testNodeSchema: NodeSchema = {
  kind: "TestDevice",
  namespace: "Test",
  name: "Device",
  attributes: [
    { name: "name", kind: "Text", unique: true, optional: false, read_only: false, inherited: false },
  ],
  relationships: [],
  inherit_from: [],
};

const coreNodeSchema: NodeSchema = {
  kind: "CoreAccount",
  namespace: "Core",
  name: "Account",
  attributes: [
    { name: "name", kind: "Text", unique: true, optional: false, read_only: false, inherited: false },
  ],
  relationships: [],
  inherit_from: [],
};

const infraGeneric: GenericSchema = {
  kind: "InfraGenericDevice",
  namespace: "Infra",
  name: "GenericDevice",
  attributes: [],
  relationships: [],
  used_by: [],
};

const customNodeSchema: NodeSchema = {
  kind: "CustomRouter",
  namespace: "Custom",
  name: "Router",
  attributes: [
    { name: "hostname", kind: "Text", unique: true, optional: false, read_only: false, inherited: false },
  ],
  relationships: [],
  inherit_from: [],
};

function createMockTransport(): InfrahubTransport {
  return {
    buildGraphQLUrl: vi.fn().mockReturnValue("http://localhost:8000/graphql"),
    get: vi.fn<(url: string, extraHeaders?: Record<string, string>) => Promise<HttpResponse>>().mockResolvedValue({
      status: 200,
      data: {
        nodes: [testNodeSchema, coreNodeSchema, customNodeSchema],
        generics: [infraGeneric],
      },
      headers: {},
    }),
    post: vi.fn<(url: string, payload: Record<string, unknown>, extraHeaders?: Record<string, string>, timeout?: number) => Promise<HttpResponse>>(),
    login: vi.fn(),
  } as unknown as InfrahubTransport;
}

describe("SchemaManager - load/check/export", () => {
  let transport: InfrahubTransport;
  let manager: SchemaManager;

  beforeEach(() => {
    transport = createMockTransport();
    manager = new SchemaManager(transport, "main");
  });

  describe("load()", () => {
    it("should load schemas and return success response", async () => {
      vi.mocked(transport.post).mockResolvedValue({
        status: 200,
        data: {
          hash: "abc123",
          previous_hash: "def456",
          warnings: [],
        },
        headers: {},
      });

      const result = await manager.load([{ kind: "TestNode" }]);

      expect(result.hash).toBe("abc123");
      expect(result.previous_hash).toBe("def456");
      expect(result.schema_updated).toBe(true);
      expect(result.errors).toEqual({});
      expect(result.warnings).toEqual([]);

      expect(transport.post).toHaveBeenCalledWith(
        "http://localhost:8000/api/schema/load?branch=main",
        { schemas: [{ kind: "TestNode" }] },
        undefined,
        120,
      );
    });

    it("should detect no change when hashes match", async () => {
      vi.mocked(transport.post).mockResolvedValue({
        status: 200,
        data: { hash: "same", previous_hash: "same", warnings: [] },
        headers: {},
      });

      const result = await manager.load([{ kind: "TestNode" }]);

      expect(result.schema_updated).toBe(false);
    });

    it("should use specified branch", async () => {
      vi.mocked(transport.post).mockResolvedValue({
        status: 200,
        data: { hash: "a", previous_hash: "b", warnings: [] },
        headers: {},
      });

      await manager.load([{ kind: "TestNode" }], "feature-1");

      const callUrl = vi.mocked(transport.post).mock.calls[0]![0];
      expect(callUrl).toContain("branch=feature-1");
    });

    it("should return errors on 422", async () => {
      vi.mocked(transport.post).mockResolvedValue({
        status: 422,
        data: { detail: "Invalid schema" },
        headers: {},
      });

      const result = await manager.load([{ kind: "Bad" }]);

      expect(result.schema_updated).toBe(false);
      expect(result.errors).toEqual({ detail: "Invalid schema" });
    });

    it("should return errors on 400", async () => {
      vi.mocked(transport.post).mockResolvedValue({
        status: 400,
        data: { detail: "Bad request" },
        headers: {},
      });

      const result = await manager.load([{ kind: "Bad" }]);

      expect(result.schema_updated).toBe(false);
      expect(result.errors).toEqual({ detail: "Bad request" });
    });

    it("should throw ValidationError for empty schemas", async () => {
      await expect(manager.load([])).rejects.toThrow(ValidationError);
    });

    it("should invalidate cache after successful load", async () => {
      // First, populate the cache
      await manager.get("TestDevice", "main");
      expect(manager.hasCached("TestDevice", "main")).toBe(true);

      vi.mocked(transport.post).mockResolvedValue({
        status: 200,
        data: { hash: "new", previous_hash: "old", warnings: [] },
        headers: {},
      });

      await manager.load([{ kind: "NewSchema" }], "main");

      // Cache should be cleared
      expect(manager.hasCached("TestDevice", "main")).toBe(false);
    });

    it("should include warnings in response", async () => {
      const warnings = [
        { type: "deprecation", kinds: [{ kind: "OldNode" }], message: "OldNode is deprecated" },
      ];
      vi.mocked(transport.post).mockResolvedValue({
        status: 200,
        data: { hash: "a", previous_hash: "b", warnings },
        headers: {},
      });

      const result = await manager.load([{ kind: "Test" }]);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.type).toBe("deprecation");
    });

    it("should throw ValidationError on 401", async () => {
      vi.mocked(transport.post).mockResolvedValue({
        status: 401,
        data: null,
        headers: {},
      });

      await expect(manager.load([{ kind: "Test" }])).rejects.toThrow(ValidationError);
    });
  });

  describe("check()", () => {
    it("should return valid=true on 202 response", async () => {
      vi.mocked(transport.post).mockResolvedValue({
        status: 202,
        data: { diff: { added: ["TestNode"] } },
        headers: {},
      });

      const [valid, data] = await manager.check([{ kind: "TestNode" }]);

      expect(valid).toBe(true);
      expect(data).toEqual({ diff: { added: ["TestNode"] } });
    });

    it("should return valid=false on 422", async () => {
      vi.mocked(transport.post).mockResolvedValue({
        status: 422,
        data: { detail: "Invalid" },
        headers: {},
      });

      const [valid, data] = await manager.check([{ kind: "Bad" }]);

      expect(valid).toBe(false);
      expect(data).toEqual({ detail: "Invalid" });
    });

    it("should return valid=false with null on other status", async () => {
      vi.mocked(transport.post).mockResolvedValue({
        status: 500,
        data: null,
        headers: {},
      });

      const [valid, data] = await manager.check([{ kind: "Test" }]);

      expect(valid).toBe(false);
      expect(data).toBeNull();
    });

    it("should throw ValidationError for empty schemas", async () => {
      await expect(manager.check([])).rejects.toThrow(ValidationError);
    });

    it("should use correct URL with branch", async () => {
      vi.mocked(transport.post).mockResolvedValue({
        status: 202,
        data: {},
        headers: {},
      });

      await manager.check([{ kind: "Test" }], "dev");

      const callUrl = vi.mocked(transport.post).mock.calls[0]![0];
      expect(callUrl).toBe("http://localhost:8000/api/schema/check?branch=dev");
    });
  });

  describe("export()", () => {
    it("should export user-defined schemas excluding restricted namespaces", async () => {
      const result = await manager.export();

      // Core namespace should be excluded (restricted)
      expect(result.namespaces["Core"]).toBeUndefined();
      // Test, Custom, and Infra namespaces should be included (not restricted)
      expect(result.namespaces["Test"]).toBeDefined();
      expect(result.namespaces["Custom"]).toBeDefined();
      expect(result.namespaces["Infra"]).toBeDefined();

      expect(result.namespaces["Test"]!.nodes).toHaveLength(1);
      expect(result.namespaces["Test"]!.nodes[0]!.kind).toBe("TestDevice");
      expect(result.namespaces["Custom"]!.nodes).toHaveLength(1);
      expect(result.namespaces["Custom"]!.nodes[0]!.kind).toBe("CustomRouter");
      expect(result.namespaces["Infra"]!.generics).toHaveLength(1);
    });

    it("should filter to specific namespaces when provided", async () => {
      const result = await manager.export("main", ["Core"]);

      // Only Core should be present (even though it's normally restricted)
      expect(result.namespaces["Core"]).toBeDefined();
      expect(result.namespaces["Test"]).toBeUndefined();
      expect(result.namespaces["Custom"]).toBeUndefined();

      expect(result.namespaces["Core"]!.nodes).toHaveLength(1);
      expect(result.namespaces["Core"]!.nodes[0]!.kind).toBe("CoreAccount");
    });

    it("should separate nodes and generics in export", async () => {
      const result = await manager.export("main", ["Infra"]);

      expect(result.namespaces["Infra"]).toBeDefined();
      expect(result.namespaces["Infra"]!.generics).toHaveLength(1);
      expect(result.namespaces["Infra"]!.generics[0]!.kind).toBe("InfraGenericDevice");
    });

    it("should use specified branch", async () => {
      await manager.export("feature-1");

      const callUrl = vi.mocked(transport.get).mock.calls[0]![0] as string;
      expect(callUrl).toContain("branch=feature-1");
    });

    it("should return empty namespaces when no schemas match", async () => {
      const result = await manager.export("main", ["NonExistent"]);

      expect(Object.keys(result.namespaces)).toHaveLength(0);
    });
  });
});

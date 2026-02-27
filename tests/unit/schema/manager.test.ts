import { describe, it, expect, vi, beforeEach } from "vitest";
import { SchemaNotFoundError } from "../../../src/errors.js";
import { SchemaManager } from "../../../src/schema/manager.js";
import type { InfrahubTransport } from "../../../src/transport.js";
import { deviceSchema, siteSchema, genericDeviceSchema } from "../../fixtures/schemas.js";

/** Create a mock transport that returns schemas from the "API". */
function createMockTransport(): InfrahubTransport {
  return {
    buildGraphQLUrl: () => "http://localhost:8000/graphql",
    get: vi.fn().mockResolvedValue({
      status: 200,
      data: {
        nodes: [deviceSchema, siteSchema],
        generics: [genericDeviceSchema],
      },
      headers: {},
    }),
    post: vi.fn(),
    login: vi.fn(),
  } as unknown as InfrahubTransport;
}

describe("SchemaManager", () => {
  let transport: InfrahubTransport;
  let manager: SchemaManager;

  beforeEach(() => {
    transport = createMockTransport();
    manager = new SchemaManager(transport, "main");
  });

  describe("get", () => {
    it("should fetch and return a node schema by kind", async () => {
      const schema = await manager.get("InfraDevice");
      expect(schema.kind).toBe("InfraDevice");
      expect(schema.name).toBe("Device");
    });

    it("should fetch and return a generic schema", async () => {
      const schema = await manager.get("InfraGenericDevice");
      expect(schema.kind).toBe("InfraGenericDevice");
    });

    it("should cache schemas after first fetch", async () => {
      await manager.get("InfraDevice");
      await manager.get("InfraDevice");

      // Should only call the API once
      expect(transport.get).toHaveBeenCalledOnce();
    });

    it("should throw SchemaNotFoundError for unknown kind", async () => {
      await expect(manager.get("NonExistent")).rejects.toThrow(SchemaNotFoundError);
    });

    it("should use branch parameter", async () => {
      await manager.get("InfraDevice", "feature-1");

      expect(transport.get).toHaveBeenCalledOnce();
      const callUrl = (transport.get as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(callUrl).toContain("branch=feature-1");
    });

    it("should maintain separate caches per branch", async () => {
      await manager.get("InfraDevice", "main");
      await manager.get("InfraDevice", "feature-1");

      // Should have called the API twice (once per branch)
      expect(transport.get).toHaveBeenCalledTimes(2);
    });
  });

  describe("all", () => {
    it("should return all schemas for a branch", async () => {
      const schemas = await manager.all();
      expect(schemas.size).toBe(3); // device + site + genericDevice
      expect(schemas.has("InfraDevice")).toBe(true);
      expect(schemas.has("InfraSite")).toBe(true);
      expect(schemas.has("InfraGenericDevice")).toBe(true);
    });
  });

  describe("setCache", () => {
    it("should manually set a schema in cache", () => {
      manager.setCache("CustomKind", deviceSchema, "main");
      expect(manager.hasCached("CustomKind")).toBe(true);
    });
  });

  describe("clearCache", () => {
    it("should clear cache for a specific branch", async () => {
      await manager.get("InfraDevice", "main");
      expect(manager.hasCached("InfraDevice", "main")).toBe(true);

      manager.clearCache("main");
      expect(manager.hasCached("InfraDevice", "main")).toBe(false);
    });

    it("should clear all caches", async () => {
      await manager.get("InfraDevice", "main");
      await manager.get("InfraDevice", "feature-1");

      manager.clearCache();
      expect(manager.hasCached("InfraDevice", "main")).toBe(false);
      expect(manager.hasCached("InfraDevice", "feature-1")).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runSchemaExport } from "../../../src/cli/schema-cmd.js";

// Mock InfrahubClient
vi.mock("../../../src/client.js", () => {
  return {
    InfrahubClient: vi.fn(),
  };
});

// Mock fs/promises writeFile
vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { InfrahubClient } from "../../../src/client.js";
import { writeFile } from "node:fs/promises";

const MockedClient = vi.mocked(InfrahubClient);
const mockedWriteFile = vi.mocked(writeFile);

describe("runSchemaExport", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  function setupMockClient(exportResult: unknown) {
    const mockExport = vi.fn().mockResolvedValue(exportResult);
    MockedClient.mockImplementation(() => ({
      defaultBranch: "main",
      schema: { export: mockExport },
    }) as unknown as InstanceType<typeof InfrahubClient>);
    return mockExport;
  }

  it("should export schema to a file successfully", async () => {
    const schemaExport = {
      namespaces: {
        Infra: {
          nodes: [
            { kind: "InfraDevice", namespace: "Infra", name: "Device", attributes: [], relationships: [], inherit_from: [] },
          ],
          generics: [],
        },
      },
    };
    setupMockClient(schemaExport);

    await runSchemaExport({ output: "schema.json" });

    expect(process.exitCode).toBeUndefined();
    expect(mockedWriteFile).toHaveBeenCalledOnce();
    const written = mockedWriteFile.mock.calls[0]!;
    const parsed = JSON.parse(written[1] as string);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0].kind).toBe("InfraDevice");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Exported 1 schemas"),
    );
  });

  it("should handle client creation failure", async () => {
    MockedClient.mockImplementation(() => {
      throw new Error("Invalid config");
    });

    await runSchemaExport({ output: "schema.json" });

    expect(process.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not create client"),
    );
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  it("should handle schema export failure", async () => {
    const mockExport = vi.fn().mockRejectedValue(new Error("Server unreachable"));
    MockedClient.mockImplementation(() => ({
      defaultBranch: "main",
      schema: { export: mockExport },
    }) as unknown as InstanceType<typeof InfrahubClient>);

    await runSchemaExport({ output: "schema.json" });

    expect(process.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Schema export failed"),
    );
  });

  it("should pass address and apiToken to client", async () => {
    setupMockClient({ namespaces: {} });

    await runSchemaExport({
      output: "schema.json",
      address: "http://custom:9000",
      apiToken: "my-token",
    });

    expect(MockedClient).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "http://custom:9000",
        apiToken: "my-token",
      }),
    );
  });

  it("should pass branch option to export", async () => {
    const mockExport = setupMockClient({ namespaces: {} });

    await runSchemaExport({
      output: "schema.json",
      branch: "feature-1",
    });

    expect(mockExport).toHaveBeenCalledWith("feature-1", undefined);
  });

  it("should pass namespaces filter to export", async () => {
    const mockExport = setupMockClient({ namespaces: {} });

    await runSchemaExport({
      output: "schema.json",
      namespaces: ["Infra", "Custom"],
    });

    expect(mockExport).toHaveBeenCalledWith("main", ["Infra", "Custom"]);
  });

  it("should flatten namespaces into flat nodes+generics", async () => {
    const schemaExport = {
      namespaces: {
        Infra: {
          nodes: [
            { kind: "InfraDevice", namespace: "Infra", name: "Device", attributes: [], relationships: [], inherit_from: [] },
          ],
          generics: [
            { kind: "InfraGeneric", namespace: "Infra", name: "Generic", attributes: [], relationships: [], used_by: [] },
          ],
        },
        Custom: {
          nodes: [
            { kind: "CustomThing", namespace: "Custom", name: "Thing", attributes: [], relationships: [], inherit_from: [] },
          ],
          generics: [],
        },
      },
    };
    setupMockClient(schemaExport);

    await runSchemaExport({ output: "out.json" });

    const parsed = JSON.parse(mockedWriteFile.mock.calls[0]![1] as string);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.generics).toHaveLength(1);
    // Sorted by kind
    expect(parsed.nodes[0].kind).toBe("CustomThing");
    expect(parsed.nodes[1].kind).toBe("InfraDevice");
  });

  it("should handle empty namespaces array", async () => {
    const mockExport = setupMockClient({ namespaces: {} });

    await runSchemaExport({
      output: "schema.json",
      namespaces: [],
    });

    // Empty array should be treated as undefined (no filter)
    expect(mockExport).toHaveBeenCalledWith("main", undefined);
  });

  it("should handle writeFile failure", async () => {
    setupMockClient({ namespaces: {} });
    mockedWriteFile.mockRejectedValueOnce(new Error("EACCES: permission denied"));

    await runSchemaExport({ output: "/root/schema.json" });

    expect(process.exitCode).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Schema export failed"),
    );
  });
});

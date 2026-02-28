import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCodegen } from "../../../src/cli/codegen-cmd.js";
import { deviceSchema, siteSchema, genericDeviceSchema } from "../../fixtures/schemas.js";

describe("runCodegen", () => {
  let tempDir: string;
  let schemaFile: string;
  let outputDir: string;

  const schemaData = {
    nodes: [deviceSchema, siteSchema],
    generics: [genericDeviceSchema],
  };

  beforeEach(async () => {
    tempDir = join(tmpdir(), `infrahub-codegen-test-${Date.now()}`);
    schemaFile = join(tempDir, "schema.json");
    outputDir = join(tempDir, "generated");
    await mkdir(tempDir, { recursive: true });
    await writeFile(schemaFile, JSON.stringify(schemaData));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates files from schema JSON", async () => {
    await runCodegen({
      schema: schemaFile,
      output: outputDir,
      generics: true,
    });

    const indexContent = await readFile(join(outputDir, "index.ts"), "utf-8");
    expect(indexContent).toContain("InfraDevice");
    expect(indexContent).toContain("InfraSite");
  });

  it("generates the correct number of files", async () => {
    await runCodegen({
      schema: schemaFile,
      output: outputDir,
      generics: true,
    });

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(outputDir);
    // 3 schemas + index + typed-client = 5 files
    expect(files.length).toBe(5);
  });

  it("excludes generics when --no-generics", async () => {
    await runCodegen({
      schema: schemaFile,
      output: outputDir,
      generics: false,
    });

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(outputDir);
    // 2 node schemas + index + typed-client = 4 files
    expect(files.length).toBe(4);
    expect(files).not.toContain("infra-generic-device.ts");
  });

  it("sets exitCode on invalid schema path", async () => {
    const origExitCode = process.exitCode;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runCodegen({
      schema: "/nonexistent/path.json",
      output: outputDir,
      generics: true,
    });

    expect(process.exitCode).toBe(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not read schema file"),
    );

    // Cleanup
    process.exitCode = origExitCode;
    consoleSpy.mockRestore();
  });

  it("sets exitCode on invalid JSON", async () => {
    await writeFile(schemaFile, "not json");
    const origExitCode = process.exitCode;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runCodegen({
      schema: schemaFile,
      output: outputDir,
      generics: true,
    });

    expect(process.exitCode).toBe(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid JSON"),
    );

    process.exitCode = origExitCode;
    consoleSpy.mockRestore();
  });

  it("generates deterministic output across runs", async () => {
    await runCodegen({
      schema: schemaFile,
      output: outputDir,
      generics: true,
    });

    const firstContent = await readFile(
      join(outputDir, "infra-device.ts"),
      "utf-8",
    );

    // Generate again to a different dir
    const outputDir2 = join(tempDir, "generated2");
    await runCodegen({
      schema: schemaFile,
      output: outputDir2,
      generics: true,
    });

    const secondContent = await readFile(
      join(outputDir2, "infra-device.ts"),
      "utf-8",
    );

    expect(firstContent).toBe(secondContent);
  });
});

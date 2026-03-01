import { describe, it, expect } from "vitest";
import {
  generateFromSchema,
  type SchemaExportData,
} from "../../../src/codegen/generator.js";
import { deviceSchema, siteSchema, genericDeviceSchema } from "../../fixtures/schemas.js";

/** Helper to build a minimal schema export from test fixtures. */
function createExport(
  nodes = [deviceSchema, siteSchema],
  generics = [genericDeviceSchema],
): SchemaExportData {
  return { nodes, generics };
}

describe("generateFromSchema", () => {
  it("generates one file per schema plus index and typed-client", () => {
    const files = generateFromSchema(createExport());
    const filenames = files.map((f) => f.filename).sort();

    expect(filenames).toEqual([
      "index.ts",
      "infra-device.ts",
      "infra-generic-device.ts",
      "infra-site.ts",
      "typed-client.ts",
    ]);
  });

  it("generates deterministic output across multiple calls", () => {
    const first = generateFromSchema(createExport());
    const second = generateFromSchema(createExport());

    for (let i = 0; i < first.length; i++) {
      expect(first[i]!.filename).toBe(second[i]!.filename);
      expect(first[i]!.content).toBe(second[i]!.content);
    }
  });

  it("produces deterministic output regardless of input order", () => {
    const forward = generateFromSchema({
      nodes: [deviceSchema, siteSchema],
      generics: [genericDeviceSchema],
    });
    const reversed = generateFromSchema({
      nodes: [siteSchema, deviceSchema],
      generics: [genericDeviceSchema],
    });

    // Same files in same order
    for (let i = 0; i < forward.length; i++) {
      expect(forward[i]!.filename).toBe(reversed[i]!.filename);
      expect(forward[i]!.content).toBe(reversed[i]!.content);
    }
  });

  it("excludes generics when includeGenerics is false", () => {
    const files = generateFromSchema(createExport(), {
      includeGenerics: false,
    });
    const filenames = files.map((f) => f.filename);

    expect(filenames).not.toContain("infra-generic-device.ts");
    expect(filenames).toContain("infra-device.ts");
    expect(filenames).toContain("infra-site.ts");
  });

  it("uses custom header when provided", () => {
    const header = "// Custom header\n";
    const files = generateFromSchema(createExport(), { header });

    for (const file of files) {
      expect(file.content.startsWith("// Custom header")).toBe(true);
    }
  });
});

describe("generated interface content", () => {
  const files = generateFromSchema(createExport());
  const deviceFile = files.find((f) => f.filename === "infra-device.ts")!;
  const siteFile = files.find((f) => f.filename === "infra-site.ts")!;

  it("generates the main interface with id and display_label", () => {
    expect(deviceFile.content).toContain("export interface InfraDevice {");
    expect(deviceFile.content).toContain("id: string;");
    expect(deviceFile.content).toContain("display_label: string | null;");
  });

  it("generates typed attribute fields", () => {
    expect(deviceFile.content).toContain("name: string;");
    expect(deviceFile.content).toContain("description?: string;");
  });

  it("marks optional attributes with ?", () => {
    // description is optional in the fixture
    expect(deviceFile.content).toMatch(/description\?: string/);
    // name is required
    expect(deviceFile.content).toMatch(/^\s+name: string;/m);
  });

  it("generates relationship fields", () => {
    // site is cardinality one
    expect(deviceFile.content).toContain("site: InfraSiteData | null;");
    // interfaces is cardinality many
    expect(deviceFile.content).toContain("interfaces?:");
  });

  it("generates create interface without read-only fields", () => {
    expect(deviceFile.content).toContain("export interface InfraDeviceCreate {");
    // name should be in create (not read-only)
    expect(deviceFile.content).toMatch(/InfraDeviceCreate[\s\S]*?name: string/);
    // status is read-only, should not appear in Create
    const createBlock = deviceFile.content.split("export interface InfraDeviceCreate {")[1]!.split("}")[0]!;
    expect(createBlock).not.toContain("status");
  });

  it("generates data reference type", () => {
    expect(deviceFile.content).toContain("export interface InfraDeviceData {");
    expect(deviceFile.content).toContain("id?: string;");
    expect(deviceFile.content).toContain("hfid?: string[];");
  });

  it("generates kind constant", () => {
    expect(deviceFile.content).toContain(
      'export const InfraDeviceKind = "InfraDevice" as const;',
    );
  });

  it("generates peer imports for relationships", () => {
    // InfraDevice has a relationship to InfraSite which is known
    expect(deviceFile.content).toContain(
      'import type { InfraSiteData } from "./infra-site.js";',
    );
  });

  it("does not import self for self-referencing relationships", () => {
    // InfraSite has no self-refs, so no self-import
    expect(siteFile.content).not.toContain("import type { InfraSite");
  });

  it("sorts attributes alphabetically in generated output", () => {
    // In device: description, name, role, status (sorted)
    const content = deviceFile.content;
    const descIdx = content.indexOf("description?:");
    const nameIdx = content.indexOf("  name: string;");
    const roleIdx = content.indexOf("  role?:");
    const statusIdx = content.indexOf("  status?:");

    expect(descIdx).toBeLessThan(nameIdx);
    expect(nameIdx).toBeLessThan(roleIdx);
    expect(roleIdx).toBeLessThan(statusIdx);
  });
});

describe("generated index file", () => {
  const files = generateFromSchema(createExport());
  const indexFile = files.find((f) => f.filename === "index.ts")!;

  it("re-exports all schema types", () => {
    expect(indexFile.content).toContain("InfraDevice");
    expect(indexFile.content).toContain("InfraSite");
    expect(indexFile.content).toContain("InfraGenericDevice");
  });

  it("exports typed-client utilities", () => {
    expect(indexFile.content).toContain("TypedInfrahubClient");
    expect(indexFile.content).toContain("createTypedClient");
    expect(indexFile.content).toContain("kindMap");
  });
});

describe("generated typed-client file", () => {
  const files = generateFromSchema(createExport());
  const typedClientFile = files.find(
    (f) => f.filename === "typed-client.ts",
  )!;

  it("generates the TypedInfrahubClient interface", () => {
    expect(typedClientFile.content).toContain(
      "export interface TypedInfrahubClient {",
    );
  });

  it("includes CRUD methods for node schemas", () => {
    // Device and Site are NodeSchema, GenericDevice is GenericSchema
    expect(typedClientFile.content).toContain("device: {");
    expect(typedClientFile.content).toContain("site: {");
    // GenericDevice is a generic, not a node — should NOT have methods
    expect(typedClientFile.content).not.toContain("genericDevice: {");
  });

  it("generates the createTypedClient factory function", () => {
    expect(typedClientFile.content).toContain(
      "export function createTypedClient(client: InfrahubClient): TypedInfrahubClient {",
    );
  });

  it("generates kind map for all node schemas", () => {
    expect(typedClientFile.content).toContain('"InfraDevice": "InfraDevice"');
    expect(typedClientFile.content).toContain('"InfraSite": "InfraSite"');
  });
});

describe("edge cases", () => {
  it("handles empty schema export", () => {
    const files = generateFromSchema({ nodes: [], generics: [] });
    // Should have index + typed-client
    expect(files.length).toBe(2);
  });

  it("handles schema with no attributes", () => {
    const files = generateFromSchema({
      nodes: [
        {
          kind: "EmptyNode",
          namespace: "Test",
          name: "Empty",
          attributes: [],
          relationships: [],
          inherit_from: [],
        },
      ],
    });
    const emptyFile = files.find((f) => f.filename === "empty-node.ts");
    expect(emptyFile).toBeDefined();
    expect(emptyFile!.content).toContain("export interface EmptyNode {");
  });

  it("handles relationship to unknown peer kind", () => {
    const files = generateFromSchema({
      nodes: [
        {
          kind: "TestNode",
          namespace: "Test",
          name: "Node",
          attributes: [],
          relationships: [
            {
              name: "unknown_rel",
              peer: "UnknownKind",
              kind: "Generic",
              direction: "bidirectional" as const,
              cardinality: "one" as const,
              optional: true,
              read_only: false,
              inherited: false,
            },
          ],
          inherit_from: [],
        },
      ],
    });
    const nodeFile = files.find((f) => f.filename === "test-node.ts")!;
    // Should use fallback type for unknown peer
    expect(nodeFile.content).toContain("{ id: string }");
  });

  it("handles dropdown attributes with enum values", () => {
    const files = generateFromSchema({
      nodes: [
        {
          kind: "TestDropdown",
          namespace: "Test",
          name: "Dropdown",
          attributes: [
            {
              name: "role",
              kind: "Dropdown" as const,
              unique: false,
              optional: false,
              read_only: false,
              inherited: false,
              enum: ["admin", "user", "guest"],
            },
          ],
          relationships: [],
          inherit_from: [],
        },
      ],
    });
    const file = files.find((f) => f.filename === "test-dropdown.ts")!;
    expect(file.content).toContain('"admin" | "user" | "guest"');
  });
});

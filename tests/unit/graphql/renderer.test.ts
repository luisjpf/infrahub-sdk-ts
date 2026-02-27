import { describe, it, expect } from "vitest";
import {
  renderQueryBlock,
  renderInputBlock,
  renderVariablesToString,
} from "../../../src/graphql/renderer.js";

describe("renderQueryBlock", () => {
  it("should render leaf fields", () => {
    const lines = renderQueryBlock({ id: null, name: null });
    expect(lines).toEqual(["    id", "    name"]);
  });

  it("should render nested objects", () => {
    const lines = renderQueryBlock({
      node: { id: null, name: null },
    });
    expect(lines).toContain("    node {");
    expect(lines).toContain("        id");
    expect(lines).toContain("        name");
    expect(lines).toContain("    }");
  });

  it("should skip @filters and @alias keys", () => {
    const lines = renderQueryBlock({
      id: null,
      "@filters": { name: "test" },
      "@alias": "myAlias",
    });
    expect(lines).toEqual(["    id"]);
  });

  it("should render fields with filters", () => {
    const lines = renderQueryBlock({
      Branch: {
        id: null,
        name: null,
        "@filters": { name: "$branch_name" },
      },
    });
    expect(lines).toContain("    Branch(name: $branch_name) {");
    expect(lines).toContain("        id");
    expect(lines).toContain("        name");
  });

  it("should render inline fragments", () => {
    const lines = renderQueryBlock({
      "...on InfraDevice": {
        hostname: null,
      },
    });
    expect(lines).toContain("    ...on InfraDevice {");
    expect(lines).toContain("        hostname");
    expect(lines).toContain("    }");
  });

  it("should render deeply nested structures", () => {
    const lines = renderQueryBlock({
      InfraDevice: {
        edges: {
          node: {
            id: null,
            name: { value: null },
          },
        },
      },
    });
    expect(lines.join("\n")).toContain("InfraDevice {");
    expect(lines.join("\n")).toContain("edges {");
    expect(lines.join("\n")).toContain("node {");
    expect(lines.join("\n")).toContain("id");
    expect(lines.join("\n")).toContain("name {");
    expect(lines.join("\n")).toContain("value");
  });

  it("should handle empty nested objects with only meta keys as leaves", () => {
    const lines = renderQueryBlock({
      field: { "@alias": "myField" },
    });
    expect(lines).toContain("    myField: field");
  });
});

describe("renderInputBlock", () => {
  it("should render simple key-value pairs", () => {
    const lines = renderInputBlock({ name: "test", count: 5 });
    expect(lines).toContain('        name: "test"');
    expect(lines).toContain("        count: 5");
  });

  it("should render boolean values", () => {
    const lines = renderInputBlock({ enabled: true, deleted: false });
    expect(lines).toContain("        enabled: true");
    expect(lines).toContain("        deleted: false");
  });

  it("should render nested objects", () => {
    const lines = renderInputBlock({
      data: { name: "test" },
    });
    expect(lines).toContain('        data: { name: "test" }');
  });

  it("should render arrays", () => {
    const lines = renderInputBlock({
      ids: ["id1", "id2"],
    });
    expect(lines).toContain('        ids: ["id1", "id2"]');
  });

  it("should render null values", () => {
    const lines = renderInputBlock({ field: null });
    expect(lines).toContain("        field: null");
  });
});

describe("renderVariablesToString", () => {
  it("should render string variables", () => {
    const result = renderVariablesToString({ name: String });
    expect(result).toBe("$name: String");
  });

  it("should render number variables", () => {
    const result = renderVariablesToString({ count: Number });
    expect(result).toBe("$count: Int");
  });

  it("should render boolean variables", () => {
    const result = renderVariablesToString({ enabled: Boolean });
    expect(result).toBe("$enabled: Boolean");
  });

  it("should render multiple variables", () => {
    const result = renderVariablesToString({
      name: String,
      count: Number,
    });
    expect(result).toBe("$name: String, $count: Int");
  });
});

import { describe, it, expect } from "vitest";
import { getTsType, kindToTypeName, kindToFilename } from "../../../src/codegen/type-map.js";
import type { AttributeKind } from "../../../src/schema/types.js";

describe("getTsType", () => {
  const stringTypes: AttributeKind[] = [
    "ID", "Text", "TextArea", "DateTime", "Email", "Password",
    "HashedPassword", "URL", "File", "MacAddress", "Color",
    "IPHost", "IPNetwork",
  ];

  const numberTypes: AttributeKind[] = ["Number", "Bandwidth"];
  const booleanTypes: AttributeKind[] = ["Boolean", "Checkbox"];

  it.each(stringTypes)("maps %s to string", (kind) => {
    expect(getTsType(kind)).toBe("string");
  });

  it.each(numberTypes)("maps %s to number", (kind) => {
    expect(getTsType(kind)).toBe("number");
  });

  it.each(booleanTypes)("maps %s to boolean", (kind) => {
    expect(getTsType(kind)).toBe("boolean");
  });

  it("maps Dropdown to string", () => {
    expect(getTsType("Dropdown")).toBe("string");
  });

  it("maps List to unknown[]", () => {
    expect(getTsType("List")).toBe("unknown[]");
  });

  it("maps JSON to unknown", () => {
    expect(getTsType("JSON")).toBe("unknown");
  });

  it("maps Any to unknown", () => {
    expect(getTsType("Any")).toBe("unknown");
  });
});

describe("kindToTypeName", () => {
  it("passes through simple PascalCase kinds", () => {
    expect(kindToTypeName("InfraDevice")).toBe("InfraDevice");
  });

  it("removes non-alphanumeric characters", () => {
    expect(kindToTypeName("Infra-Device")).toBe("InfraDevice");
    expect(kindToTypeName("My.Schema")).toBe("MySchema");
  });
});

describe("kindToFilename", () => {
  it("converts PascalCase to kebab-case", () => {
    expect(kindToFilename("InfraDevice")).toBe("infra-device");
  });

  it("handles consecutive uppercase letters", () => {
    expect(kindToFilename("IPAMPool")).toBe("ipam-pool");
  });

  it("handles single word", () => {
    expect(kindToFilename("Device")).toBe("device");
  });

  it("handles multiple segments", () => {
    expect(kindToFilename("InfraGenericDevice")).toBe("infra-generic-device");
  });
});

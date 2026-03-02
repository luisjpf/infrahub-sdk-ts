import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProgram } from "../../../src/cli.js";

describe("CLI program", () => {
  it("creates a program with the correct name", () => {
    const program = createProgram();
    expect(program.name()).toBe("infrahub-sdk");
  });

  it("has codegen command", () => {
    const program = createProgram();
    const codegen = program.commands.find((c) => c.name() === "codegen");
    expect(codegen).toBeDefined();
  });

  it("has schema command", () => {
    const program = createProgram();
    const schema = program.commands.find((c) => c.name() === "schema");
    expect(schema).toBeDefined();
  });

  it("schema command has export subcommand", () => {
    const program = createProgram();
    const schema = program.commands.find((c) => c.name() === "schema")!;
    const exportCmd = schema.commands.find((c) => c.name() === "export");
    expect(exportCmd).toBeDefined();
  });

  it("has version option", () => {
    const program = createProgram();
    expect(program.version()).toBe("0.1.0");
  });
});

describe("codegen command parsing", () => {
  it("requires --schema option", () => {
    const program = createProgram();
    program.exitOverride();

    const codegen = program.commands.find((c) => c.name() === "codegen")!;
    codegen.exitOverride();
    codegen.configureOutput({ writeErr: () => {}, writeOut: () => {} });

    expect(() => {
      program.parse(["codegen"], { from: "user" });
    }).toThrow();
  });

  it("parses --schema and --output options", () => {
    const program = createProgram();
    program.exitOverride();
    const codegen = program.commands.find((c) => c.name() === "codegen")!;

    // Prevent action from executing
    codegen.action(() => {});

    program.parse(
      ["codegen", "--schema", "schema.json", "--output", "./out"],
      { from: "user" },
    );

    expect(codegen.opts().schema).toBe("schema.json");
    expect(codegen.opts().output).toBe("./out");
  });

  it("defaults output to ./src/generated", () => {
    const program = createProgram();
    program.exitOverride();
    const codegen = program.commands.find((c) => c.name() === "codegen")!;

    codegen.action(() => {});

    program.parse(
      ["codegen", "--schema", "schema.json"],
      { from: "user" },
    );

    expect(codegen.opts().output).toBe("./src/generated");
  });

  it("parses --no-generics flag", () => {
    const program = createProgram();
    program.exitOverride();
    const codegen = program.commands.find((c) => c.name() === "codegen")!;

    codegen.action(() => {});

    program.parse(
      ["codegen", "--schema", "schema.json", "--no-generics"],
      { from: "user" },
    );

    expect(codegen.opts().generics).toBe(false);
  });
});

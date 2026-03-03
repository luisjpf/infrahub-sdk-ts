#!/usr/bin/env node
/**
 * CLI tool for Infrahub TypeScript SDK.
 *
 * Commands:
 *   codegen   - Generate TypeScript types from a schema JSON file
 *   schema    - Export schema from an Infrahub server to JSON
 *   version   - Show SDK version
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { codegenCommand } from "./cli/codegen-cmd.js";
import { schemaCommand } from "./cli/schema-cmd.js";

function readVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(dir, "..", "package.json"), "utf-8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("infrahub-sdk")
    .description("Infrahub TypeScript SDK CLI")
    .version(readVersion());

  program.addCommand(codegenCommand());
  program.addCommand(schemaCommand());

  return program;
}

// Run when executed directly (not imported for testing).
const isCLI =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined;

if (isCLI) {
  try {
    const scriptUrl = new URL(`file://${process.argv[1]}`).href;
    if (import.meta.url === scriptUrl) {
      const program = createProgram();
      program.parse();
    }
  } catch {
    // URL parsing failed — not direct execution
  }
}

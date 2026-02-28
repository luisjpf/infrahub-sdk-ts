#!/usr/bin/env node
/**
 * CLI tool for Infrahub TypeScript SDK.
 *
 * Commands:
 *   codegen   - Generate TypeScript types from a schema JSON file
 *   schema    - Export schema from an Infrahub server to JSON
 *   version   - Show SDK version
 */

import { Command } from "commander";
import { codegenCommand } from "./cli/codegen-cmd.js";
import { schemaCommand } from "./cli/schema-cmd.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("infrahub-sdk")
    .description("Infrahub TypeScript SDK CLI")
    .version("0.1.0");

  program.addCommand(codegenCommand());
  program.addCommand(schemaCommand());

  return program;
}

// Run when executed directly (not imported for testing)
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/cli.js") ||
    process.argv[1].endsWith("/cli.ts") ||
    process.argv[1].endsWith("/infrahub-sdk"));

if (isDirectExecution) {
  const program = createProgram();
  program.parse();
}

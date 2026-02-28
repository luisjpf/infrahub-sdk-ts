/**
 * CLI command: schema export
 *
 * Connects to an Infrahub server and exports the schema to JSON.
 */

import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { InfrahubClient } from "../client.js";
import type { InfrahubConfigInput } from "../config.js";
import type { NodeSchema, GenericSchema } from "../schema/types.js";
import type { SchemaExport } from "../schema/index.js";

export function schemaCommand(): Command {
  const cmd = new Command("schema");
  cmd.description("Schema operations");

  cmd
    .command("export")
    .description("Export schema from Infrahub server to JSON")
    .option("-a, --address <url>", "Infrahub server address")
    .option("-t, --api-token <token>", "API token for authentication")
    .option("-b, --branch <name>", "Branch name")
    .option("-o, --output <file>", "Output JSON file", "schema-export.json")
    .option("--namespaces <ns...>", "Only include these namespaces")
    .action(async (options: SchemaExportOptions) => {
      await runSchemaExport(options);
    });

  return cmd;
}

interface SchemaExportOptions {
  address?: string;
  apiToken?: string;
  branch?: string;
  output: string;
  namespaces?: string[];
}

export async function runSchemaExport(
  options: SchemaExportOptions,
): Promise<void> {
  const outputPath = resolve(options.output);

  // Build config from options + env vars
  const configInput: InfrahubConfigInput = {};
  if (options.address) configInput.address = options.address;
  if (options.apiToken) configInput.apiToken = options.apiToken;

  let client: InfrahubClient;
  try {
    client = new InfrahubClient(configInput);
  } catch (err) {
    console.error(
      `Error: Could not create client: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    const branch = options.branch ?? client.defaultBranch;
    const namespaces = options.namespaces && options.namespaces.length > 0
      ? options.namespaces
      : undefined;
    const data = await client.schema.export(branch, namespaces);

    // Flatten namespace-organized export into flat { nodes, generics }
    const flat = flattenSchemaExport(data);

    await writeFile(outputPath, JSON.stringify(flat, null, 2) + "\n", "utf-8");
    const nodeCount = flat.nodes.length + flat.generics.length;
    console.log(
      `Exported ${nodeCount} schemas to ${outputPath}`,
    );
  } catch (err) {
    console.error(
      `Error: Schema export failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  }
}

/** Flatten namespace-organized SchemaExport into a flat { nodes, generics } structure. */
function flattenSchemaExport(
  data: SchemaExport,
): { nodes: NodeSchema[]; generics: GenericSchema[] } {
  const nodes: NodeSchema[] = [];
  const generics: GenericSchema[] = [];

  for (const ns of Object.values(data.namespaces)) {
    nodes.push(...ns.nodes);
    generics.push(...ns.generics);
  }

  // Sort for determinism
  nodes.sort((a, b) => a.kind.localeCompare(b.kind));
  generics.sort((a, b) => a.kind.localeCompare(b.kind));

  return { nodes, generics };
}

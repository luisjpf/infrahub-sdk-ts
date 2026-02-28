/**
 * CLI command: codegen
 *
 * Reads a schema JSON file and generates TypeScript interfaces.
 */

import { Command } from "commander";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { generateFromSchema, type SchemaExportData } from "../codegen/index.js";

export function codegenCommand(): Command {
  const cmd = new Command("codegen");

  cmd
    .description("Generate TypeScript types from a schema JSON file")
    .requiredOption("-s, --schema <path>", "Path to schema JSON file")
    .option("-o, --output <dir>", "Output directory", "./src/generated")
    .option("--no-generics", "Exclude generic schemas")
    .option("--header <text>", "Custom header comment for generated files")
    .action(async (options: CodegenOptions) => {
      await runCodegen(options);
    });

  return cmd;
}

interface CodegenOptions {
  schema: string;
  output: string;
  generics: boolean;
  header?: string;
}

export async function runCodegen(options: CodegenOptions): Promise<void> {
  const schemaPath = resolve(options.schema);
  const outputDir = resolve(options.output);

  // Read and parse schema
  let rawData: string;
  try {
    rawData = await readFile(schemaPath, "utf-8");
  } catch {
    console.error(`Error: Could not read schema file: ${schemaPath}`);
    process.exitCode = 1;
    return;
  }

  let schemaData: SchemaExportData;
  try {
    schemaData = JSON.parse(rawData) as SchemaExportData;
  } catch {
    console.error(`Error: Invalid JSON in schema file: ${schemaPath}`);
    process.exitCode = 1;
    return;
  }

  // Generate files
  const files = generateFromSchema(schemaData, {
    includeGenerics: options.generics,
    header: options.header ? `// ${options.header}\n` : undefined,
  });

  // Write output
  await mkdir(outputDir, { recursive: true });

  for (const file of files) {
    const filePath = join(outputDir, file.filename);
    await writeFile(filePath, file.content, "utf-8");
  }

  console.log(
    `Generated ${files.length} files in ${outputDir}`,
  );
}

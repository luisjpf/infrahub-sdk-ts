/**
 * Code generation workflow: generate typed interfaces from a schema file,
 * then use the typed client for type-safe operations.
 *
 * This example demonstrates the codegen pipeline programmatically.
 * For CLI usage, see: npx infrahub-sdk codegen --help
 *
 * Run:
 *   npx tsx examples/codegen-workflow.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { generateFromSchema } from "infrahub-sdk/codegen";

// Sample schema (normally exported via: npx infrahub-sdk schema export)
const sampleSchema = {
  nodes: [
    {
      kind: "InfraDevice",
      namespace: "Infra",
      name: "Device",
      label: "Device",
      description: "A network device",
      default_filter: "name__value",
      human_friendly_id: ["name__value"],
      attributes: [
        { name: "name", kind: "Text", optional: false },
        { name: "description", kind: "Text", optional: true },
        { name: "role", kind: "Dropdown", optional: true, enum: ["spine", "leaf", "border"] },
      ],
      relationships: [
        {
          name: "site",
          peer: "InfraSite",
          kind: "Attribute",
          cardinality: "one" as const,
          optional: true,
        },
      ],
    },
    {
      kind: "InfraSite",
      namespace: "Infra",
      name: "Site",
      label: "Site",
      description: "A physical site or data center",
      default_filter: "name__value",
      human_friendly_id: ["name__value"],
      attributes: [
        { name: "name", kind: "Text", optional: false },
        { name: "city", kind: "Text", optional: true },
      ],
      relationships: [
        {
          name: "devices",
          peer: "InfraDevice",
          kind: "Generic",
          cardinality: "many" as const,
          optional: true,
        },
      ],
    },
  ],
};

function main() {
  // 1. Generate TypeScript files from schema
  console.log("Generating TypeScript interfaces from schema...\n");
  const files = generateFromSchema(sampleSchema);

  // 2. Write generated files to disk
  const outDir = join(import.meta.dirname ?? ".", "generated");
  mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    const filePath = join(outDir, file.filename);
    writeFileSync(filePath, file.content);
    console.log(`  Written: ${file.filename} (${file.kind})`);
  }

  console.log(`\nGenerated ${files.length} files in ${outDir}`);

  // 3. Show what was generated
  console.log("\n--- Generated typed-client.ts (excerpt) ---");
  const typedClient = files.find((f) => f.filename === "typed-client.ts");
  if (typedClient) {
    // Show the first 20 lines
    const lines = typedClient.content.split("\n").slice(0, 20);
    console.log(lines.join("\n"));
    console.log("...");
  }

  console.log("\n--- Generated index.ts ---");
  const index = files.find((f) => f.filename === "index.ts");
  if (index) {
    console.log(index.content);
  }

  // 4. Verify the schema round-trips
  console.log("--- Schema kind map ---");
  const kindFile = files.find((f) => f.filename === "typed-client.ts");
  if (kindFile) {
    const kindMapMatch = kindFile.content.match(/export const kindMap.*?};/s);
    if (kindMapMatch) {
      console.log(kindMapMatch[0]);
    }
  }

  console.log("\nDone! Use 'createTypedClient(client)' for type-safe CRUD.");
}

main();

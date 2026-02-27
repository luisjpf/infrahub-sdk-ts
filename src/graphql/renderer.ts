/**
 * Renders dict-based GraphQL query structures to GraphQL query strings.
 * Mirrors the Python SDK's `graphql/renderers.py`.
 *
 * Query dict format:
 * - `{ key: null }` → leaf field: `key`
 * - `{ key: { subkey: null } }` → nested: `key { subkey }`
 * - `{ "@filters": { name: "value" } }` → filter args: `(name: "value")`
 * - `{ "@alias": "aliasName" }` → field alias
 * - `{ "...on TypeName": { field: null } }` → inline fragment
 */

type QueryDict = Record<string, unknown>;

/** Render a value as a GraphQL literal (string, number, bool, enum, list, object). */
function renderValue(value: unknown, convertEnum: boolean = false): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value.toString();
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (typeof value === "string") {
    // Strings starting with $ are variable references
    if (value.startsWith("$")) {
      return value;
    }
    // Enum-like strings (all caps or known enum patterns) when convertEnum is true
    if (convertEnum && /^[A-Z_]+$/.test(value)) {
      return value;
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => renderValue(v, convertEnum));
    return `[${items.join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${renderValue(v, convertEnum)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  return String(value);
}

/** Render filter arguments to a GraphQL arguments string. */
function renderFilters(
  filters: Record<string, unknown>,
  convertEnum: boolean = false,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    parts.push(`${key}: ${renderValue(value, convertEnum)}`);
  }
  return parts.join(", ");
}

/** Render a query block (nested dict) to GraphQL lines. */
export function renderQueryBlock(
  data: QueryDict,
  indentation: number = 4,
  offset: number = 4,
  convertEnum: boolean = false,
): string[] {
  const lines: string[] = [];
  const indent = " ".repeat(offset);

  for (const [key, value] of Object.entries(data)) {
    // Skip special keys
    if (key === "@filters" || key === "@alias") {
      continue;
    }

    // Inline fragments: `...on TypeName { ... }`
    if (key.startsWith("...on ")) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        lines.push(`${indent}${key} {`);
        lines.push(
          ...renderQueryBlock(
            value as QueryDict,
            indentation,
            offset + indentation,
            convertEnum,
          ),
        );
        lines.push(`${indent}}`);
      }
      continue;
    }

    // Leaf field (value is null)
    if (value === null) {
      lines.push(`${indent}${key}`);
      continue;
    }

    // Nested object
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = value as QueryDict;
      const filters = nested["@filters"] as Record<string, unknown> | undefined;
      const alias = nested["@alias"] as string | undefined;

      // Determine field name (with optional alias)
      let fieldName = key;
      if (alias) {
        fieldName = `${alias}: ${key}`;
      }

      // Check if this is a leaf with only @-prefixed keys
      const nonMetaKeys = Object.keys(nested).filter((k) => !k.startsWith("@"));
      if (nonMetaKeys.length === 0 && !filters) {
        lines.push(`${indent}${fieldName}`);
        continue;
      }

      // Build field line with optional filters
      let fieldLine = `${indent}${fieldName}`;
      if (filters && Object.keys(filters).length > 0) {
        fieldLine += `(${renderFilters(filters, convertEnum)})`;
      }
      fieldLine += " {";
      lines.push(fieldLine);

      lines.push(
        ...renderQueryBlock(nested, indentation, offset + indentation, convertEnum),
      );
      lines.push(`${indent}}`);
      continue;
    }

    // Scalar value (shouldn't normally occur in query blocks, but handle gracefully)
    lines.push(`${indent}${key}`);
  }

  return lines;
}

/** Render input data block for mutations. */
export function renderInputBlock(
  data: Record<string, unknown>,
  _indentation: number = 4,
  offset: number = 8,
  convertEnum: boolean = false,
): string[] {
  const lines: string[] = [];
  const indent = " ".repeat(offset);

  for (const [key, value] of Object.entries(data)) {
    lines.push(`${indent}${key}: ${renderValue(value, convertEnum)}`);
  }

  return lines;
}

/** Render GraphQL variables declaration string. */
export function renderVariablesToString(
  variables: Record<string, unknown>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(variables)) {
    // Variable type mapping
    let typeName = "String";
    if (value === Number || typeof value === "number") {
      typeName = "Int";
    } else if (value === Boolean || typeof value === "boolean") {
      typeName = "Boolean";
    } else if (typeof value === "string") {
      typeName = "String";
    }
    parts.push(`$${key}: ${typeName}`);
  }
  return parts.join(", ");
}

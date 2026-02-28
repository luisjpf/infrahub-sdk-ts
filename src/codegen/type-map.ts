/**
 * Maps Infrahub AttributeKind values to TypeScript types.
 */

import type { AttributeKind } from "../schema/types.js";

/** Mapping from Infrahub attribute kinds to TypeScript type strings. */
const ATTRIBUTE_TYPE_MAP: Record<AttributeKind, string> = {
  ID: "string",
  Text: "string",
  TextArea: "string",
  DateTime: "string",
  Email: "string",
  Password: "string",
  HashedPassword: "string",
  URL: "string",
  File: "string",
  MacAddress: "string",
  Color: "string",
  IPHost: "string",
  IPNetwork: "string",
  Number: "number",
  Bandwidth: "number",
  Boolean: "boolean",
  Checkbox: "boolean",
  Dropdown: "string",
  List: "unknown[]",
  JSON: "unknown",
  Any: "unknown",
};

/** Get the TypeScript type string for a given AttributeKind. */
export function getTsType(kind: AttributeKind): string {
  return ATTRIBUTE_TYPE_MAP[kind] ?? "unknown";
}

/** Convert an Infrahub kind string (e.g. "InfraDevice") to a safe TypeScript identifier. */
export function kindToTypeName(kind: string): string {
  // Replace any non-alphanumeric characters
  return kind.replace(/[^a-zA-Z0-9]/g, "");
}

/** Convert an Infrahub kind string to a filename (e.g. "InfraDevice" → "infra-device"). */
export function kindToFilename(kind: string): string {
  // Insert hyphen before uppercase letters (except first), then lowercase
  return kind
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

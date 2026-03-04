/**
 * Schema type definitions for the Infrahub TypeScript SDK.
 * Mirrors Python SDK's `schema/main.py` types.
 */

/** Attribute kinds supported by Infrahub. */
export type AttributeKind =
  | "ID"
  | "Text"
  | "TextArea"
  | "DateTime"
  | "Number"
  | "Dropdown"
  | "Email"
  | "Password"
  | "HashedPassword"
  | "URL"
  | "File"
  | "MacAddress"
  | "Color"
  | "Bandwidth"
  | "IPHost"
  | "IPNetwork"
  | "Boolean"
  | "Checkbox"
  | "List"
  | "JSON"
  | "Any";

/** Relationship cardinality. */
export type RelationshipCardinality = "one" | "many";

/** Relationship kind. */
export type RelationshipKind =
  | "Generic"
  | "Attribute"
  | "Component"
  | "Parent"
  | "Group"
  | "Hierarchy"
  | "Profile"
  | "Template";

/** Relationship direction. */
export type RelationshipDirection = "bidirectional" | "outbound" | "inbound";

/** Attribute schema from the API. */
export interface AttributeSchema {
  id?: string;
  name: string;
  kind: AttributeKind;
  label?: string;
  description?: string;
  default_value?: unknown;
  unique: boolean;
  optional: boolean;
  read_only: boolean;
  inherited: boolean;
  choices?: Array<Record<string, unknown>>;
  enum?: Array<string | number>;
  max_length?: number;
  min_length?: number;
  regex?: string;
  order_weight?: number;
}

/** Relationship schema from the API. */
export interface RelationshipSchema {
  id?: string;
  name: string;
  peer: string;
  kind: RelationshipKind;
  label?: string;
  description?: string;
  identifier?: string;
  min_count?: number;
  max_count?: number;
  direction: RelationshipDirection;
  cardinality: RelationshipCardinality;
  optional: boolean;
  read_only: boolean;
  inherited: boolean;
  order_weight?: number;
}

/** Node schema returned by the Infrahub API. */
export interface NodeSchema {
  id?: string;
  kind: string;
  namespace: string;
  name: string;
  label?: string;
  description?: string;
  default_filter?: string;
  human_friendly_id?: string[];
  display_labels?: string[];
  attributes: AttributeSchema[];
  relationships: RelationshipSchema[];
  inherit_from?: string[];
  hierarchy?: string;
}

/** Generic schema returned by the Infrahub API. */
export interface GenericSchema {
  id?: string;
  kind: string;
  namespace: string;
  name: string;
  label?: string;
  description?: string;
  attributes: AttributeSchema[];
  relationships: RelationshipSchema[];
  used_by?: string[];
}

/** Union type for all schema types the manager can handle. */
export type SchemaType = NodeSchema | GenericSchema;

/**
 * Type guard: check if a schema is a NodeSchema.
 * Uses `used_by` as a negative discriminant — only GenericSchema defines it.
 * Falls back to positive NodeSchema-specific field checks when `used_by`
 * is absent (it's optional on GenericSchema).
 */
export function isNodeSchema(schema: SchemaType): schema is NodeSchema {
  if ("used_by" in schema) return false;
  if ("default_filter" in schema || "inherit_from" in schema || "hierarchy" in schema || "human_friendly_id" in schema || "display_labels" in schema) return true;
  // Ambiguous: no used_by and no NodeSchema-specific fields.
  // Default to NodeSchema since GenericSchema should always declare used_by.
  return true;
}

/** Get attribute names from a schema. */
export function getAttributeNames(schema: SchemaType): string[] {
  return schema.attributes.map((a) => a.name);
}

/** Get relationship names from a schema. */
export function getRelationshipNames(schema: SchemaType): string[] {
  return schema.relationships.map((r) => r.name);
}

/** Get a relationship schema by name. */
export function getRelationshipByName(
  schema: SchemaType,
  name: string,
): RelationshipSchema | undefined {
  return schema.relationships.find((r) => r.name === name);
}

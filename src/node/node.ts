import type { SchemaType } from "../schema/types.js";
import { getRelationshipByName, isNodeSchema } from "../schema/types.js";
import { Attribute } from "./attribute.js";

/**
 * Represents an Infrahub node instance.
 * Dynamically builds attributes and relationships from the schema.
 *
 * Mirrors Python SDK's `InfrahubNode` class.
 */
export class InfrahubNode {
  /** The UUID of the node (null for new/unsaved nodes). */
  id: string | null;

  /** Display label from the server. */
  displayLabel: string | null;

  /** The GraphQL __typename. */
  typename: string;

  /** The schema definition for this node. */
  readonly schema: SchemaType;

  /** The branch this node belongs to. */
  readonly branch: string;

  /** Whether this node already exists on the server. */
  private _existing: boolean;

  /** Attribute instances, keyed by name. */
  private readonly _attributes: Map<string, Attribute> = new Map();

  /** Relationship data for cardinality-one, keyed by name. */
  private readonly _relationshipsOne: Map<string, RelatedNodeData> = new Map();

  /** Relationship data for cardinality-many, keyed by name. */
  private readonly _relationshipsMany: Map<string, RelatedNodeData[]> = new Map();

  constructor(options: {
    schema: SchemaType;
    branch: string;
    data?: Record<string, unknown>;
  }) {
    this.schema = options.schema;
    this.branch = options.branch;

    const data = options.data;

    // Extract from edges wrapper if present: { node: { ... }, node_metadata: { ... } }
    let nodeData = data;
    if (data && typeof data.node === "object" && data.node !== null) {
      nodeData = data.node as Record<string, unknown>;
    }

    this.id = (nodeData?.id as string) ?? null;
    this.displayLabel = (nodeData?.display_label as string) ?? null;
    this.typename = (nodeData?.__typename as string) ?? options.schema.kind;

    this._existing = this.id !== null;

    this.initAttributes(nodeData);
    this.initRelationships(nodeData);
  }

  /** Whether this node already exists on the server (has an id). */
  get isExisting(): boolean {
    return this._existing;
  }

  /** Get the kind of the node (from schema). */
  get kind(): string {
    return this.schema.kind;
  }

  /** Get the list of attribute names. */
  get attributeNames(): string[] {
    return Array.from(this._attributes.keys());
  }

  /** Get the list of relationship names. */
  get relationshipNames(): string[] {
    return [
      ...Array.from(this._relationshipsOne.keys()),
      ...Array.from(this._relationshipsMany.keys()),
    ];
  }

  /** Get an attribute by name. Throws if not found. */
  getAttribute(name: string): Attribute {
    const attr = this._attributes.get(name);
    if (!attr) {
      throw new Error(`Attribute '${name}' not found on ${this.schema.kind}`);
    }
    return attr;
  }

  /** Check if an attribute exists. */
  hasAttribute(name: string): boolean {
    return this._attributes.has(name);
  }

  /** Get a cardinality-one related node reference. */
  getRelatedNode(name: string): RelatedNodeData | undefined {
    return this._relationshipsOne.get(name);
  }

  /** Get cardinality-many related nodes. */
  getRelatedNodes(name: string): RelatedNodeData[] {
    return this._relationshipsMany.get(name) ?? [];
  }

  /**
   * Generate the input data for a create/update mutation.
   */
  generateInputData(excludeUnmodified: boolean = false): MutationInputData {
    const data: Record<string, unknown> = {};

    // Attributes
    for (const [name, attr] of this._attributes) {
      if (attr.schema.read_only) continue;
      if (excludeUnmodified && !attr.hasBeenMutated) continue;

      const attrData = attr.generateInputData();
      if (attrData !== null) {
        data[name] = attrData;
      }
    }

    // Relationships (cardinality one)
    for (const [name, rel] of this._relationshipsOne) {
      const relSchema = getRelationshipByName(this.schema, name);
      if (!relSchema || relSchema.read_only) continue;
      if (rel.id) {
        data[name] = { id: rel.id };
      } else if (rel.hfid) {
        data[name] = { hfid: rel.hfid };
      }
    }

    // Relationships (cardinality many)
    for (const [name, rels] of this._relationshipsMany) {
      const relSchema = getRelationshipByName(this.schema, name);
      if (!relSchema || relSchema.read_only) continue;
      data[name] = rels.map((r) => {
        if (r.id) return { id: r.id };
        if (r.hfid) return { hfid: r.hfid };
        return {};
      });
    }

    // Add id for existing nodes (updates)
    if (this.id !== null) {
      data["id"] = this.id;
    }

    return {
      data: { data },
    };
  }

  /**
   * Generate a GraphQL query dict for fetching nodes of this schema's kind.
   */
  generateQueryData(options: {
    filters?: Record<string, unknown>;
    offset?: number;
    limit?: number;
    includeProperties?: boolean;
  } = {}): Record<string, unknown> {
    const { filters, offset, limit, includeProperties } = options;

    const nodeFields: Record<string, unknown> = {
      id: null,
      display_label: null,
      __typename: null,
    };

    // Add human_friendly_id if the schema supports it
    if (isNodeSchema(this.schema) && this.schema.human_friendly_id) {
      nodeFields["hfid"] = null;
    }

    // Add attribute fields
    for (const attrSchema of this.schema.attributes) {
      const attr = this._attributes.get(attrSchema.name);
      if (attr) {
        nodeFields[attrSchema.name] = attr.generateQueryData(includeProperties);
      }
    }

    // Add relationship fields (only cardinality-one by default)
    for (const relSchema of this.schema.relationships) {
      if (relSchema.cardinality === "one") {
        nodeFields[relSchema.name] = {
          node: {
            id: null,
            display_label: null,
            __typename: null,
          },
        };
      }
    }

    const queryFilters: Record<string, unknown> = { ...(filters ?? {}) };
    if (offset !== undefined) queryFilters["offset"] = offset;
    if (limit !== undefined) queryFilters["limit"] = limit;

    const data: Record<string, unknown> = {
      count: null,
      edges: { node: nodeFields },
    };

    if (Object.keys(queryFilters).length > 0) {
      data["@filters"] = queryFilters;
    }

    return { [this.schema.kind]: data };
  }

  /** Initialize attributes from schema + data. */
  private initAttributes(data?: Record<string, unknown> | null): void {
    for (const attrSchema of this.schema.attributes) {
      const attrData = data?.[attrSchema.name] ?? undefined;
      this._attributes.set(
        attrSchema.name,
        new Attribute(attrSchema.name, attrSchema, attrData),
      );
    }
  }

  /** Initialize relationships from schema + data. */
  private initRelationships(data?: Record<string, unknown> | null): void {
    for (const relSchema of this.schema.relationships) {
      const relData = data?.[relSchema.name];

      if (relSchema.cardinality === "one") {
        this._relationshipsOne.set(
          relSchema.name,
          parseRelatedNodeData(relData),
        );
      } else {
        this._relationshipsMany.set(
          relSchema.name,
          parseRelatedNodesData(relData),
        );
      }
    }
  }
}

/** Lightweight representation of a related node (id/hfid/typename). */
export interface RelatedNodeData {
  id: string | null;
  hfid: string[] | null;
  typename: string | null;
  displayLabel: string | null;
}

/** Data structure for mutation input. */
export interface MutationInputData {
  data: Record<string, unknown>;
}

/** Parse related node data from GraphQL response. */
function parseRelatedNodeData(data: unknown): RelatedNodeData {
  if (data === null || data === undefined) {
    return { id: null, hfid: null, typename: null, displayLabel: null };
  }

  // If data is a string, treat as id
  if (typeof data === "string") {
    return { id: data, hfid: null, typename: null, displayLabel: null };
  }

  if (typeof data === "object") {
    const d = data as Record<string, unknown>;
    // Handle { node: { id, ... } } wrapper
    const nodeData = (typeof d.node === "object" && d.node !== null ? d.node : d) as Record<string, unknown>;
    return {
      id: (nodeData.id as string) ?? null,
      hfid: (nodeData.hfid as string[]) ?? null,
      typename: (nodeData.__typename as string) ?? null,
      displayLabel: (nodeData.display_label as string) ?? null,
    };
  }

  return { id: null, hfid: null, typename: null, displayLabel: null };
}

/** Parse cardinality-many relationship data. */
function parseRelatedNodesData(data: unknown): RelatedNodeData[] {
  if (data === null || data === undefined) {
    return [];
  }

  // Handle { edges: [{ node: { ... } }, ...] } format
  if (typeof data === "object" && "edges" in (data as Record<string, unknown>)) {
    const edges = (data as Record<string, unknown>).edges as unknown[];
    if (Array.isArray(edges)) {
      return edges.map(parseRelatedNodeData);
    }
  }

  // Handle direct array
  if (Array.isArray(data)) {
    return data.map(parseRelatedNodeData);
  }

  return [];
}

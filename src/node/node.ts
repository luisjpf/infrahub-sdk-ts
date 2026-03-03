import type { SchemaType } from "../schema/types.js";
import { getRelationshipByName, isNodeSchema } from "../schema/types.js";
import { Attribute } from "./attribute.js";
import { RelatedNode } from "./related-node.js";
import { RelationshipManager } from "./relationship-manager.js";

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
  private readonly _relationshipsOne: Map<string, RelatedNode> = new Map();

  /** Relationship data for cardinality-many, keyed by name. */
  private readonly _relationshipsMany: Map<string, RelationshipManager> = new Map();

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

  /** Set an attribute value by name. Marks the attribute as mutated. */
  setAttribute(name: string, value: unknown): void {
    this.getAttribute(name).value = value;
  }

  /** Check if an attribute exists. */
  hasAttribute(name: string): boolean {
    return this._attributes.has(name);
  }

  /** Get a cardinality-one RelatedNode. */
  getRelatedNode(name: string): RelatedNode | undefined {
    return this._relationshipsOne.get(name);
  }

  /** Get cardinality-many RelationshipManager. */
  getRelationshipManager(name: string): RelationshipManager | undefined {
    return this._relationshipsMany.get(name);
  }

  /**
   * Get HFID (human-friendly ID) components from this node.
   * Returns null if schema doesn't define hfid or values aren't available.
   */
  getHumanFriendlyId(): string[] | null {
    if (!isNodeSchema(this.schema) || !this.schema.human_friendly_id) {
      return null;
    }

    const components: string[] = [];
    for (const path of this.schema.human_friendly_id) {
      // Simple case: attribute value reference like "name__value"
      const parts = path.split("__");
      if (parts.length >= 1) {
        const attrName = parts[0]!;
        if (this._attributes.has(attrName)) {
          const value = this._attributes.get(attrName)!.value;
          if (value === null || value === undefined) return null;
          components.push(String(value));
        } else {
          return null;
        }
      }
    }

    return components.length > 0 ? components : null;
  }

  /** HFID as string with kind prefix (e.g., "InfraDevice__router1"). */
  get hfidStr(): string | null {
    const hfid = this.getHumanFriendlyId();
    if (!hfid) return null;
    return `${this.kind}__${hfid.join("__")}`;
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
      if (excludeUnmodified && !rel.hasUpdate) continue;

      const relData = rel.generateInputData();
      if (relData !== null) {
        data[name] = relData;
      }
    }

    // Relationships (cardinality many)
    for (const [name, relMgr] of this._relationshipsMany) {
      const relSchema = getRelationshipByName(this.schema, name);
      if (!relSchema || relSchema.read_only) continue;
      if (excludeUnmodified && !relMgr.hasUpdate) continue;

      const relData = relMgr.generateInputData();
      if (relData.length > 0) {
        data[name] = relData;
      }
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
    includeRelationships?: boolean;
    partialMatch?: boolean;
  } = {}): Record<string, unknown> {
    const { filters, offset, limit, includeProperties, includeRelationships, partialMatch } = options;

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

    // Add relationship fields
    for (const relSchema of this.schema.relationships) {
      if (relSchema.cardinality === "one") {
        nodeFields[relSchema.name] = RelatedNode.generateQueryData({
          includeProperties,
        });
      } else if (includeRelationships) {
        nodeFields[relSchema.name] = RelationshipManager.generateQueryData({
          includeProperties,
        });
      }
    }

    const queryFilters: Record<string, unknown> = { ...(filters ?? {}) };
    if (offset !== undefined) queryFilters["offset"] = offset;
    if (limit !== undefined) queryFilters["limit"] = limit;
    if (partialMatch) queryFilters["partial_match"] = true;

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
          new RelatedNode({
            schema: relSchema,
            branch: this.branch,
            data: relData,
          }),
        );
      } else {
        this._relationshipsMany.set(
          relSchema.name,
          new RelationshipManager({
            schema: relSchema,
            branch: this.branch,
            data: relData,
          }),
        );
      }
    }
  }
}

/** Data structure for mutation input. */
export interface MutationInputData {
  data: Record<string, unknown>;
}

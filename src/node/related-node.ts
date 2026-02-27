import type { RelationshipSchema } from "../schema/types.js";

/**
 * Represents a single related node in a relationship (cardinality-one or as a peer in cardinality-many).
 * Supports lazy resolution via a NodeStore, mutation tracking, and GraphQL query/input generation.
 *
 * Mirrors the Python SDK's `RelatedNode` class.
 */
export class RelatedNode {
  private _id: string | null;
  private _hfid: string[] | null;
  private _typename: string | null;
  private _displayLabel: string | null;
  private _isProtected: boolean;
  private _source: string | null;
  private _owner: string | null;

  readonly schema: RelationshipSchema;
  readonly branch: string;

  /** Whether a mutation has been made (id/hfid changed). */
  private _hasUpdate: boolean = false;

  constructor(options: {
    schema: RelationshipSchema;
    branch: string;
    data?: unknown;
  }) {
    this.schema = options.schema;
    this.branch = options.branch;

    this._id = null;
    this._hfid = null;
    this._typename = null;
    this._displayLabel = null;
    this._isProtected = false;
    this._source = null;
    this._owner = null;

    if (options.data !== undefined && options.data !== null) {
      this.initFromData(options.data);
    }
  }

  get id(): string | null {
    return this._id;
  }

  set id(value: string | null) {
    if (value !== this._id) {
      this._hasUpdate = true;
    }
    this._id = value;
  }

  get hfid(): string[] | null {
    return this._hfid;
  }

  set hfid(value: string[] | null) {
    this._hasUpdate = true;
    this._hfid = value;
  }

  get typename(): string | null {
    return this._typename;
  }

  get displayLabel(): string | null {
    return this._displayLabel;
  }

  get isProtected(): boolean {
    return this._isProtected;
  }

  set isProtected(value: boolean) {
    this._hasUpdate = true;
    this._isProtected = value;
  }

  get source(): string | null {
    return this._source;
  }

  set source(value: string | null) {
    this._hasUpdate = true;
    this._source = value;
  }

  get owner(): string | null {
    return this._owner;
  }

  set owner(value: string | null) {
    this._hasUpdate = true;
    this._owner = value;
  }

  get hasUpdate(): boolean {
    return this._hasUpdate;
  }

  /** Whether this represents an initialized (non-empty) peer. */
  get initialized(): boolean {
    return this._id !== null || this._hfid !== null;
  }

  /**
   * Generate the GraphQL query dict for fetching relationship data.
   * Used when building the query to retrieve a related node.
   */
  static generateQueryData(options: {
    includeProperties?: boolean;
  } = {}): Record<string, unknown> {
    const nodeFields: Record<string, unknown> = {
      id: null,
      hfid: null,
      display_label: null,
      __typename: null,
    };

    const result: Record<string, unknown> = {
      node: nodeFields,
    };

    if (options.includeProperties) {
      result.properties = {
        is_protected: null,
        source: { id: null, display_label: null, __typename: null },
        owner: { id: null, display_label: null, __typename: null },
      };
    }

    return result;
  }

  /**
   * Generate mutation input data for this relationship.
   */
  generateInputData(): Record<string, unknown> | null {
    if (this._id === null && this._hfid === null) {
      return null;
    }

    const data: Record<string, unknown> = {};

    if (this._id) {
      data.id = this._id;
    } else if (this._hfid) {
      data.hfid = this._hfid;
    }

    if (this._isProtected) {
      data._relation__is_protected = true;
    }
    if (this._source) {
      data._relation__source = this._source;
    }
    if (this._owner) {
      data._relation__owner = this._owner;
    }

    return data;
  }

  private initFromData(data: unknown): void {
    // String → treat as ID
    if (typeof data === "string") {
      this._id = data;
      return;
    }

    // Array → treat as HFID
    if (Array.isArray(data)) {
      this._hfid = data as string[];
      return;
    }

    if (typeof data !== "object" || data === null) {
      return;
    }

    const d = data as Record<string, unknown>;

    // Handle { node: { ... }, properties: { ... } } wrapper
    const nodeData = (typeof d.node === "object" && d.node !== null
      ? d.node
      : d) as Record<string, unknown>;

    this._id = (nodeData.id as string) ?? null;
    this._hfid = (nodeData.hfid as string[]) ?? null;
    this._typename = (nodeData.__typename as string) ?? null;
    this._displayLabel = (nodeData.display_label as string) ?? null;

    // Extract relationship properties
    const props = d.properties as Record<string, unknown> | undefined;
    if (props) {
      this._isProtected = (props.is_protected as boolean) ?? false;
      this._source = (props.source as Record<string, string>)?.id ?? null;
      this._owner = (props.owner as Record<string, string>)?.id ?? null;
    }
  }
}

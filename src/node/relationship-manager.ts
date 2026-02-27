import type { RelationshipSchema } from "../schema/types.js";
import { RelatedNode } from "./related-node.js";

/**
 * Manages a collection of RelatedNode peers for cardinality-many relationships.
 * Supports add/remove/extend operations and tracks mutations.
 *
 * Mirrors the Python SDK's `RelationshipManager` class.
 */
export class RelationshipManager {
  readonly schema: RelationshipSchema;
  readonly branch: string;

  private _peers: RelatedNode[] = [];
  private _initialized: boolean = false;
  private _hasUpdate: boolean = false;

  constructor(options: {
    schema: RelationshipSchema;
    branch: string;
    data?: unknown;
  }) {
    this.schema = options.schema;
    this.branch = options.branch;

    if (options.data !== undefined && options.data !== null) {
      this.initFromData(options.data);
    }
  }

  /** All peer RelatedNode objects. */
  get peers(): ReadonlyArray<RelatedNode> {
    return this._peers;
  }

  /** Whether data has been loaded (from server response or explicit init). */
  get initialized(): boolean {
    return this._initialized;
  }

  /** Whether the peer list has been modified. */
  get hasUpdate(): boolean {
    return this._hasUpdate || this._peers.some((p) => p.hasUpdate);
  }

  /** Get all peer IDs (excluding nulls). */
  get peerIds(): string[] {
    return this._peers.filter((p) => p.id !== null).map((p) => p.id!);
  }

  /** Get all peer HFIDs (excluding nulls). */
  get peerHfids(): string[][] {
    return this._peers.filter((p) => p.hfid !== null).map((p) => p.hfid!);
  }

  /** Number of peers. */
  get count(): number {
    return this._peers.length;
  }

  /**
   * Add a peer to this relationship.
   * Accepts a string (ID), a string[] (HFID), a RelatedNode, or a dict.
   */
  add(data: string | string[] | RelatedNode | Record<string, unknown>): void {
    if (data instanceof RelatedNode) {
      this._peers.push(data);
    } else {
      const peer = new RelatedNode({
        schema: this.schema,
        branch: this.branch,
        data,
      });
      this._peers.push(peer);
    }
    this._hasUpdate = true;
  }

  /**
   * Add multiple peers at once.
   */
  extend(items: Array<string | string[] | RelatedNode | Record<string, unknown>>): void {
    for (const item of items) {
      this.add(item);
    }
  }

  /**
   * Remove a peer by ID, HFID, or RelatedNode reference.
   */
  remove(data: string | RelatedNode): void {
    if (data instanceof RelatedNode) {
      const index = this._peers.indexOf(data);
      if (index !== -1) {
        this._peers.splice(index, 1);
        this._hasUpdate = true;
      }
    } else {
      // data is an ID string
      const index = this._peers.findIndex((p) => p.id === data);
      if (index !== -1) {
        this._peers.splice(index, 1);
        this._hasUpdate = true;
      }
    }
  }

  /**
   * Generate the GraphQL query dict for fetching this many-relationship.
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

    const edgeFields: Record<string, unknown> = {
      node: nodeFields,
    };

    if (options.includeProperties) {
      edgeFields.properties = {
        is_protected: null,
        source: { id: null, display_label: null, __typename: null },
        owner: { id: null, display_label: null, __typename: null },
      };
    }

    return {
      count: null,
      edges: edgeFields,
    };
  }

  /**
   * Generate mutation input data for this relationship (list of peer references).
   */
  generateInputData(): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    for (const peer of this._peers) {
      const data = peer.generateInputData();
      if (data !== null) {
        result.push(data);
      }
    }
    return result;
  }

  private initFromData(data: unknown): void {
    // Handle { edges: [{ node: { ... }, properties: { ... } }, ...] }
    if (typeof data === "object" && data !== null && "edges" in (data as Record<string, unknown>)) {
      const edges = (data as Record<string, unknown>).edges;
      if (Array.isArray(edges)) {
        for (const edge of edges) {
          this._peers.push(
            new RelatedNode({
              schema: this.schema,
              branch: this.branch,
              data: edge,
            }),
          );
        }
        this._initialized = true;
        return;
      }
    }

    // Handle direct array of peers
    if (Array.isArray(data)) {
      for (const item of data) {
        this._peers.push(
          new RelatedNode({
            schema: this.schema,
            branch: this.branch,
            data: item,
          }),
        );
      }
      this._initialized = true;
    }
  }
}

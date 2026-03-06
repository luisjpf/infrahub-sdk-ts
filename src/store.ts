import type { InfrahubNode } from "./node/node.js";

/**
 * In-memory cache for InfrahubNode instances.
 * Indexed by ID for quick lookup.
 * Mirrors Python SDK's `NodeStore`.
 *
 * Supports optional maxSize per branch — when exceeded, the oldest entry
 * (by insertion order) is evicted.
 */
export class NodeStore {
  private readonly defaultBranch: string;
  private readonly _maxSize: number;

  /** branch → (id → node) */
  private readonly byId: Map<string, Map<string, InfrahubNode>> = new Map();

  /** branch → (kind+key → node) */
  private readonly byKey: Map<string, Map<string, InfrahubNode>> = new Map();

  /**
   * @param defaultBranch - The default branch name
   * @param maxSize - Maximum entries per branch (0 = unlimited, default)
   */
  constructor(defaultBranch: string, maxSize: number = 0) {
    this.defaultBranch = defaultBranch;
    this._maxSize = maxSize;
  }

  /** Maximum entries per branch (0 = unlimited). */
  get maxSize(): number {
    return this._maxSize;
  }

  /** Store a node in the cache. */
  set(node: InfrahubNode, key?: string, branch?: string): void {
    const branchName = branch ?? node.branch ?? this.defaultBranch;

    if (node.id) {
      if (!this.byId.has(branchName)) {
        this.byId.set(branchName, new Map());
      }
      const branchMap = this.byId.get(branchName)!;
      // Delete first so re-insertion moves it to end (newest)
      branchMap.delete(node.id);
      branchMap.set(node.id, node);
      this.evictIfNeeded(branchMap);
    }

    if (key) {
      const storeKey = `${node.kind}:${key}`;
      if (!this.byKey.has(branchName)) {
        this.byKey.set(branchName, new Map());
      }
      this.byKey.get(branchName)!.set(storeKey, node);
    }
  }

  /** Retrieve a node by ID. */
  getById(id: string, branch?: string): InfrahubNode | undefined {
    const branchName = branch ?? this.defaultBranch;
    return this.byId.get(branchName)?.get(id);
  }

  /** Retrieve a node by kind + key. */
  getByKey(kind: string, key: string, branch?: string): InfrahubNode | undefined {
    const branchName = branch ?? this.defaultBranch;
    return this.byKey.get(branchName)?.get(`${kind}:${key}`);
  }

  /** Check if a node with the given ID exists in the store. */
  has(id: string, branch?: string): boolean {
    const branchName = branch ?? this.defaultBranch;
    return this.byId.get(branchName)?.has(id) ?? false;
  }

  /** Remove a node by ID. */
  remove(id: string, branch?: string): boolean {
    const branchName = branch ?? this.defaultBranch;
    return this.byId.get(branchName)?.delete(id) ?? false;
  }

  /** Get all nodes for a branch. */
  getAll(branch?: string): InfrahubNode[] {
    const branchName = branch ?? this.defaultBranch;
    const branchMap = this.byId.get(branchName);
    return branchMap ? Array.from(branchMap.values()) : [];
  }

  /** Clear the store for a specific branch or all branches. */
  clear(branch?: string): void {
    if (branch) {
      this.byId.delete(branch);
      this.byKey.delete(branch);
    } else {
      this.byId.clear();
      this.byKey.clear();
    }
  }

  /** Evict oldest entries if the branch map exceeds maxSize. */
  private evictIfNeeded(branchMap: Map<string, InfrahubNode>): void {
    if (this._maxSize <= 0) return;
    while (branchMap.size > this._maxSize) {
      // Map iterates in insertion order; first key is oldest
      const oldest = branchMap.keys().next().value;
      if (oldest !== undefined) {
        branchMap.delete(oldest);
      } else {
        break;
      }
    }
  }
}

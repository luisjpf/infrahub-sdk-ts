import { fnv1aHash } from "./hash.js";

/**
 * Group context for tracking mode.
 *
 * When a client is in "tracking" mode, node operations (create, save)
 * automatically register the affected node IDs with the group context.
 * On completion, the context creates or updates a CoreStandardGroup
 * containing the tracked nodes.
 *
 * Mirrors the Python SDK's `InfrahubGroupContext`.
 */

/** Client mode — controls whether group tracking is active. */
export type ClientMode = "default" | "tracking";

/** Properties that configure a group context. */
export interface GroupContextProperties {
  /** Tracking identifier (e.g., "infrahub-sdk", "provisioner-v2") */
  identifier: string;
  /** Parameters used for deterministic group naming (hashed) */
  params?: Record<string, string>;
  /** Whether to delete nodes no longer in the tracked set */
  deleteUnusedNodes?: boolean;
  /** Kind of group to create (default: "CoreStandardGroup") */
  groupType?: string;
  /** Additional fields for the group node */
  groupParams?: Record<string, unknown>;
}

/**
 * Callback type for executing GraphQL mutations.
 * Injected from the client to avoid circular dependency.
 */
export type GraphQLExecutor = (
  query: string,
  variables?: Record<string, unknown>,
  tracker?: string,
  branchName?: string,
  timeout?: number,
) => Promise<Record<string, unknown>>;

/**
 * InfrahubGroupContext — tracks related nodes and manages group lifecycle.
 *
 * Usage:
 * ```ts
 * const client = new InfrahubClient(...);
 * const ctx = client.startTracking({
 *   identifier: "my-provisioner",
 *   params: { site: "dc1" },
 * });
 *
 * // ... create/save nodes (they get auto-tracked) ...
 *
 * await ctx.updateGroup("main"); // creates/updates CoreStandardGroup
 * ```
 */
export class InfrahubGroupContext {
  /** Node IDs created/modified during this tracking session */
  readonly relatedNodeIds: string[] = [];
  /** Group IDs created during this tracking session */
  readonly relatedGroupIds: string[] = [];
  /** IDs of members that were in the previous version of the group */
  previousMemberIds: string[] | null = null;

  private identifier: string = "";
  private params: Record<string, string> = {};
  private deleteUnusedNodes: boolean = false;
  private groupType: string = "CoreStandardGroup";
  private groupParams: Record<string, unknown> = {};

  /**
   * Configure the group context properties.
   */
  setProperties(props: GroupContextProperties): void {
    this.identifier = props.identifier;
    this.params = props.params ?? {};
    this.deleteUnusedNodes = props.deleteUnusedNodes ?? false;
    this.groupType = props.groupType ?? "CoreStandardGroup";
    this.groupParams = props.groupParams ?? {};
  }

  /**
   * Track node IDs as related to this group context.
   * Called automatically by the client during create/save operations in tracking mode.
   */
  addRelatedNodes(ids: string[]): void {
    for (const id of ids) {
      if (!this.relatedNodeIds.includes(id)) {
        this.relatedNodeIds.push(id);
      }
    }
  }

  /**
   * Track group IDs as related to this context.
   */
  addRelatedGroups(ids: string[]): void {
    for (const id of ids) {
      if (!this.relatedGroupIds.includes(id)) {
        this.relatedGroupIds.push(id);
      }
    }
  }

  /**
   * Generate the deterministic group name from identifier and params.
   */
  generateGroupName(suffix?: string): string {
    let name = this.identifier;
    if (suffix) {
      name += `-${suffix}`;
    }
    if (Object.keys(this.params).length > 0) {
      name += `-${dictHash(this.params)}`;
    }
    return name;
  }

  /**
   * Generate a human-readable description from the params.
   */
  generateGroupDescription(): string {
    if (Object.keys(this.params).length === 0) {
      return `Group managed by ${this.identifier}`;
    }
    const parts = Object.entries(this.params).map(([k, v]) => `${k}=${v}`);
    return `Group managed by ${this.identifier} (${parts.join(", ")})`;
  }

  /**
   * Create or update the tracking group on the server.
   * Adds all tracked node IDs as members of the group.
   *
   * @param executor - GraphQL execution callback (from the client)
   * @param branch - Target branch
   */
  async updateGroup(executor: GraphQLExecutor, branch: string): Promise<void> {
    if (!this.identifier) {
      return;
    }

    const groupName = this.generateGroupName();
    const description = this.generateGroupDescription();

    // Build members list from tracked node IDs
    const members = this.relatedNodeIds.map((id) => ({ id }));

    // Create/upsert the group via mutation
    const mutationName = `${this.groupType}Create`;
    const mutation = buildGroupMutation(mutationName, {
      name: { value: groupName },
      description: { value: description },
      members,
      ...this.groupParams,
    });

    await executor(
      mutation,
      undefined,
      `mutation-group-context-${this.identifier}`,
      branch,
    );

    // Handle deletion of unused nodes
    if (this.deleteUnusedNodes && this.previousMemberIds) {
      const currentIds = new Set(this.relatedNodeIds);
      const unusedIds = this.previousMemberIds.filter((id) => !currentIds.has(id));

      for (const id of unusedIds) {
        try {
          const deleteMutation = buildDeleteMutation(id);
          await executor(deleteMutation, undefined, `mutation-group-cleanup-${id}`, branch);
        } catch {
          // Node may already be deleted (cascade), ignore
        }
      }
    }
  }

  /**
   * Reset the tracking context (clear tracked IDs).
   */
  reset(): void {
    this.relatedNodeIds.length = 0;
    this.relatedGroupIds.length = 0;
    this.previousMemberIds = null;
  }
}

/**
 * Build a GraphQL mutation string for creating/upserting a group.
 */
function buildGroupMutation(
  mutationName: string,
  data: Record<string, unknown>,
): string {
  const inputStr = renderMutationData(data, 3);
  return `
mutation {
    ${mutationName}(
        data: {
${inputStr}
        }
    ){
        ok
        object {
            id
        }
    }
}
`;
}

/**
 * Build a generic delete mutation by node ID.
 */
function buildDeleteMutation(nodeId: string): string {
  return `
mutation {
    CoreNodeDelete(
        data: {
            id: "${nodeId}"
        }
    ){
        ok
    }
}
`;
}

/**
 * Render mutation data to a GraphQL input string.
 */
function renderMutationData(
  data: Record<string, unknown>,
  indentLevel: number,
): string {
  const indent = "    ".repeat(indentLevel);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      const items = value.map((item) => {
        if (typeof item === "object" && item !== null) {
          const inner = Object.entries(item as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
            .join(", ");
          return `{${inner}}`;
        }
        return JSON.stringify(item);
      });
      lines.push(`${indent}${key}: [${items.join(", ")}]`);
    } else if (typeof value === "object" && value !== null) {
      const inner = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(", ");
      lines.push(`${indent}${key}: {${inner}}`);
    } else {
      lines.push(`${indent}${key}: ${JSON.stringify(value)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Simple deterministic hash of a sorted dictionary for group naming.
 * Returns a short hex string.
 */
function dictHash(params: Record<string, string>): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const str = sorted.map(([k, v]) => `${k}=${v}`).join("&");
  return fnv1aHash(str);
}

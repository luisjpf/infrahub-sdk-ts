import { BranchNotFoundError } from "./errors.js";
import { GraphQLMutation, GraphQLQuery } from "./graphql/query.js";

/**
 * Branch data as returned by the Infrahub API.
 * Mirrors Python SDK's `BranchData`.
 */
export interface BranchData {
  id: string;
  name: string;
  description: string | null;
  sync_with_git: boolean;
  is_default: boolean;
  has_schema_changes: boolean;
  graph_version: number | null;
  status: BranchStatus;
  origin_branch: string | null;
  branched_from: string;
}

export type BranchStatus = "OPEN" | "NEED_REBASE" | "NEED_UPGRADE_REBASE" | "DELETING";

/** Fields to select when querying branch data. */
const BRANCH_DATA_FIELDS: Record<string, null> = {
  id: null,
  name: null,
  description: null,
  origin_branch: null,
  branched_from: null,
  is_default: null,
  sync_with_git: null,
  has_schema_changes: null,
  graph_version: null,
  status: null,
};

/**
 * BranchManager — manages Infrahub branches.
 * Mirrors Python SDK's `InfrahubBranchManager`.
 */
export class BranchManager {
  private readonly executeGraphQL: ExecuteGraphQLFn;

  constructor(executeGraphQL: ExecuteGraphQLFn) {
    this.executeGraphQL = executeGraphQL;
  }

  /** List all branches. */
  async all(): Promise<Record<string, BranchData>> {
    const query = new GraphQLQuery({
      name: "GetAllBranch",
      query: { Branch: BRANCH_DATA_FIELDS },
    });

    const data = await this.executeGraphQL(query.render(), undefined, "query-branch-all");
    const branches = (data.Branch ?? []) as BranchData[];

    const result: Record<string, BranchData> = {};
    for (const branch of branches) {
      result[branch.name] = branch;
    }
    return result;
  }

  /** Get a single branch by name. */
  async get(branchName: string): Promise<BranchData> {
    const query = new GraphQLQuery({
      name: "GetBranch",
      query: {
        Branch: {
          ...BRANCH_DATA_FIELDS,
          "@filters": { name: `$branch_name` },
        },
      },
      variables: { branch_name: String },
    });

    const data = await this.executeGraphQL(
      query.render(),
      { branch_name: branchName },
      "query-branch",
    );

    const branches = (data.Branch ?? []) as BranchData[];
    if (branches.length === 0) {
      throw new BranchNotFoundError(branchName);
    }
    return branches[0]!;
  }

  /** Create a new branch. */
  async create(options: {
    branchName: string;
    syncWithGit?: boolean;
    description?: string;
  }): Promise<BranchData> {
    const inputData = {
      wait_until_completion: true,
      data: {
        name: options.branchName,
        description: options.description ?? "",
        sync_with_git: options.syncWithGit ?? true,
      },
    };

    const mutation = new GraphQLMutation({
      mutation: "BranchCreate",
      inputData,
      query: { ok: null, object: BRANCH_DATA_FIELDS },
    });

    const data = await this.executeGraphQL(mutation.render(), undefined, "mutation-branch-create");
    return (data.BranchCreate as Record<string, unknown>).object as BranchData;
  }

  /** Delete a branch. */
  async delete(branchName: string): Promise<boolean> {
    const mutation = new GraphQLMutation({
      mutation: "BranchDelete",
      inputData: { data: { name: branchName } },
      query: { ok: null },
    });

    const data = await this.executeGraphQL(mutation.render(), undefined, "mutation-branch-delete");
    return (data.BranchDelete as Record<string, unknown>).ok as boolean;
  }

  /** Merge a branch into its target. */
  async merge(branchName: string): Promise<boolean> {
    const mutation = new GraphQLMutation({
      mutation: "BranchMerge",
      inputData: { data: { name: branchName } },
      query: { ok: null, object: BRANCH_DATA_FIELDS },
    });

    const data = await this.executeGraphQL(
      mutation.render(),
      undefined,
      "mutation-branch-merge",
    );
    return (data.BranchMerge as Record<string, unknown>).ok as boolean;
  }

  /** Rebase a branch. */
  async rebase(branchName: string): Promise<boolean> {
    const mutation = new GraphQLMutation({
      mutation: "BranchRebase",
      inputData: { data: { name: branchName } },
      query: { ok: null, object: BRANCH_DATA_FIELDS },
    });

    const data = await this.executeGraphQL(mutation.render(), undefined, "mutation-branch-rebase");
    return (data.BranchRebase as Record<string, unknown>).ok as boolean;
  }
}

/** Function signature for executing GraphQL queries (injected from InfrahubClient). */
export type ExecuteGraphQLFn = (
  query: string,
  variables?: Record<string, unknown>,
  tracker?: string,
  branchName?: string,
  timeout?: number,
) => Promise<Record<string, unknown>>;

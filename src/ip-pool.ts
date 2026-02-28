import { GraphQLMutation } from "./graphql/query.js";
import { ValidationError } from "./errors.js";

/** Result of an IP pool allocation. */
export interface IPAllocationResult {
  ok: boolean;
  node: {
    id: string;
    kind: string;
    identifier: string | null;
    display_label: string;
  } | null;
}

/** Options for IP address allocation. */
export interface IPAddressAllocationOptions {
  resourcePoolId: string;
  identifier?: string;
  prefixLength?: number;
  addressType?: string;
  data?: Record<string, unknown>;
}

/** Options for IP prefix allocation. */
export interface IPPrefixAllocationOptions {
  resourcePoolId: string;
  identifier?: string;
  prefixLength?: number;
  memberType?: "prefix" | "address";
  prefixType?: string;
  data?: Record<string, unknown>;
}

/**
 * Build a GraphQL mutation for allocating the next IP address from a pool.
 *
 * Mirrors Python SDK's `_build_ip_address_allocation_query()`.
 */
export function buildIPAddressAllocationMutation(
  options: IPAddressAllocationOptions,
): GraphQLMutation {
  const inputFields: Record<string, unknown> = {
    id: options.resourcePoolId,
  };

  if (options.identifier !== undefined) {
    inputFields.identifier = options.identifier;
  }
  if (options.prefixLength !== undefined) {
    inputFields.prefix_length = options.prefixLength;
  }
  if (options.addressType !== undefined) {
    inputFields.prefix_type = options.addressType;
  }
  if (options.data !== undefined) {
    inputFields.data = options.data;
  }

  return new GraphQLMutation({
    mutation: "InfrahubIPAddressPoolGetResource",
    inputData: { data: inputFields },
    query: {
      ok: null,
      node: {
        id: null,
        kind: null,
        identifier: null,
        display_label: null,
      },
    },
  });
}

/**
 * Build a GraphQL mutation for allocating the next IP prefix from a pool.
 *
 * Mirrors Python SDK's `_build_ip_prefix_allocation_query()`.
 */
export function buildIPPrefixAllocationMutation(
  options: IPPrefixAllocationOptions,
): GraphQLMutation {
  if (options.memberType !== undefined && options.memberType !== "prefix" && options.memberType !== "address") {
    throw new ValidationError(
      "memberType",
      `memberType must be "prefix" or "address", got "${options.memberType}"`,
    );
  }

  const inputFields: Record<string, unknown> = {
    id: options.resourcePoolId,
  };

  if (options.identifier !== undefined) {
    inputFields.identifier = options.identifier;
  }
  if (options.prefixLength !== undefined) {
    inputFields.prefix_length = options.prefixLength;
  }
  if (options.memberType !== undefined) {
    inputFields.member_type = options.memberType;
  }
  if (options.prefixType !== undefined) {
    inputFields.prefix_type = options.prefixType;
  }
  if (options.data !== undefined) {
    inputFields.data = options.data;
  }

  return new GraphQLMutation({
    mutation: "InfrahubIPPrefixPoolGetResource",
    inputData: { data: inputFields },
    query: {
      ok: null,
      node: {
        id: null,
        kind: null,
        identifier: null,
        display_label: null,
      },
    },
  });
}

/**
 * Parse the allocation response from the GraphQL mutation result.
 */
export function parseAllocationResponse(
  response: Record<string, unknown>,
  mutationName: string,
): IPAllocationResult {
  const result = response[mutationName] as Record<string, unknown> | undefined;
  if (!result) {
    return { ok: false, node: null };
  }

  const ok = result.ok as boolean;
  const nodeData = result.node as Record<string, unknown> | null;

  if (!ok || !nodeData) {
    return { ok, node: null };
  }

  return {
    ok,
    node: {
      id: nodeData.id as string,
      kind: nodeData.kind as string,
      identifier: (nodeData.identifier as string | null) ?? null,
      display_label: (nodeData.display_label as string) ?? "",
    },
  };
}

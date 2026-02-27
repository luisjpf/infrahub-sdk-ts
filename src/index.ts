// Main client
export { InfrahubClient } from "./client.js";

// Configuration
export type { InfrahubConfig, InfrahubConfigInput } from "./config.js";
export { createConfig, InfrahubConfigSchema } from "./config.js";

// Errors
export {
  InfrahubError,
  ServerNotReachableError,
  ServerNotResponsiveError,
  GraphQLError,
  AuthenticationError,
  NodeNotFoundError,
  SchemaNotFoundError,
  BranchNotFoundError,
  ValidationError,
  URLNotFoundError,
} from "./errors.js";

// Transport
export { InfrahubTransport, FetchHttpClient } from "./transport.js";

// Types
export type { HttpClient, HttpResponse, HttpRequestOptions, Logger } from "./types.js";
export { consoleLogger } from "./types.js";

// GraphQL
export { GraphQLQuery, GraphQLMutation } from "./graphql/index.js";

// Schema
export { SchemaManager } from "./schema/index.js";
export type {
  NodeSchema,
  GenericSchema,
  AttributeSchema,
  RelationshipSchema,
  SchemaType,
  AttributeKind,
  RelationshipCardinality,
  RelationshipDirection,
  RelationshipKind,
} from "./schema/index.js";

// Node
export { InfrahubNode, Attribute } from "./node/index.js";
export type { RelatedNodeData, MutationInputData } from "./node/index.js";

// Branch
export { BranchManager } from "./branch.js";
export type { BranchData, BranchStatus } from "./branch.js";

// Store
export { NodeStore } from "./store.js";

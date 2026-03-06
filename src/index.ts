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
export { consoleLogger, toErrorMessage } from "./types.js";

// GraphQL
export { GraphQLQuery, GraphQLMutation } from "./graphql/index.js";

// Schema
export { SchemaManager } from "./schema/index.js";
export {
  isNodeSchema,
  getAttributeNames,
  getRelationshipNames,
  getRelationshipByName,
} from "./schema/index.js";
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
  SchemaLoadResponse,
  SchemaWarning,
  SchemaWarningKind,
  SchemaCheckResponse,
  SchemaExport,
  NamespaceExport,
} from "./schema/index.js";

// Node
export { InfrahubNode, Attribute, RelatedNode, RelationshipManager } from "./node/index.js";
export type { MutationInputData } from "./node/index.js";

// Branch
export { BranchManager } from "./branch.js";
export type { BranchData, BranchStatus } from "./branch.js";

// Store
export { NodeStore } from "./store.js";

// Batch
export { InfrahubBatch } from "./batch.js";

// Object Store
export { ObjectStore } from "./object-store.js";

// IP Pool Allocation
export type { IPAllocationResult, IPAddressAllocationOptions, IPPrefixAllocationOptions } from "./ip-pool.js";
export {
  buildIPAddressAllocationMutation,
  buildIPPrefixAllocationMutation,
  parseAllocationResponse,
} from "./ip-pool.js";

// Group Context / Tracking Mode
export { InfrahubGroupContext } from "./group-context.js";
export type { ClientMode, GroupContextProperties, GraphQLExecutor } from "./group-context.js";

// Recorder / Playback
export {
  NoRecorder,
  JSONRecorder,
  JSONPlayback,
  RecordingHttpClient,
  MemoryRecorderStorage,
  generateRequestFilename,
} from "./recorder.js";
export type { Recorder, RecordedEntry, RecorderStorage } from "./recorder.js";

// Proxy / TLS
export { ProxyHttpClient } from "./proxy-client.js";
export type { TlsProxyConfig } from "./proxy-client.js";

// Code Generation
export { generateFromSchema, getTsType, kindToTypeName, kindToFilename } from "./codegen/index.js";
export type { SchemaExportData, GeneratedFile, GeneratorOptions } from "./codegen/index.js";

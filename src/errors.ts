/**
 * Error hierarchy for the Infrahub TypeScript SDK.
 * Mirrors the Python SDK's exception classes with TypeScript idioms.
 */

export class InfrahubError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "InfrahubError";
  }
}

export class ServerNotReachableError extends InfrahubError {
  readonly address: string;

  constructor(address: string, message?: string) {
    super(message ?? `Unable to connect to '${address}'.`);
    this.name = "ServerNotReachableError";
    this.address = address;
  }
}

export class ServerNotResponsiveError extends InfrahubError {
  readonly url: string;
  readonly timeout?: number;

  constructor(url: string, timeout?: number, message?: string) {
    const msg = message ?? `Unable to read from '${url}'.${timeout ? ` (timeout: ${timeout} sec)` : ""}`;
    super(msg);
    this.name = "ServerNotResponsiveError";
    this.url = url;
    this.timeout = timeout;
  }
}

export class GraphQLError extends InfrahubError {
  readonly errors: Array<Record<string, unknown>>;
  readonly query?: string;
  readonly variables?: Record<string, unknown>;

  constructor(
    errors: Array<Record<string, unknown>>,
    query?: string,
    variables?: Record<string, unknown>,
  ) {
    super(`An error occurred while executing the GraphQL Query ${query ?? "unknown"}, ${JSON.stringify(errors)}`);
    this.name = "GraphQLError";
    this.errors = errors;
    this.query = query;
    this.variables = variables;
  }
}

export class AuthenticationError extends InfrahubError {
  constructor(message?: string) {
    super(message ?? "Authentication Error, unable to execute the query.");
    this.name = "AuthenticationError";
  }
}

export class NodeNotFoundError extends InfrahubError {
  readonly nodeType: string;
  readonly identifier: Record<string, unknown>;
  readonly branchName?: string;

  constructor(options: {
    identifier: Record<string, unknown>;
    nodeType?: string;
    branchName?: string;
    message?: string;
  }) {
    super(options.message ?? "Unable to find the node in the database.");
    this.name = "NodeNotFoundError";
    this.nodeType = options.nodeType ?? "unknown";
    this.identifier = options.identifier;
    this.branchName = options.branchName;
  }
}

export class SchemaNotFoundError extends InfrahubError {
  readonly identifier: string;

  constructor(identifier: string, message?: string) {
    super(message ?? `Unable to find the schema '${identifier}'.`);
    this.name = "SchemaNotFoundError";
    this.identifier = identifier;
  }
}

export class BranchNotFoundError extends InfrahubError {
  readonly identifier: string;

  constructor(identifier: string, message?: string) {
    super(message ?? `Unable to find the branch '${identifier}' in the Database.`);
    this.name = "BranchNotFoundError";
    this.identifier = identifier;
  }
}

export class ValidationError extends InfrahubError {
  readonly identifier: string;
  readonly messages?: string[];

  constructor(identifier: string, message?: string, messages?: string[]) {
    super(message ?? `Validation Error for ${identifier}`);
    this.name = "ValidationError";
    this.identifier = identifier;
    this.messages = messages;
  }
}

export class URLNotFoundError extends InfrahubError {
  readonly url: string;

  constructor(url: string) {
    super(`\`${url}\` not found.`);
    this.name = "URLNotFoundError";
    this.url = url;
  }
}

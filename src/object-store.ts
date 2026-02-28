import { AuthenticationError, ServerNotReachableError } from "./errors.js";
import type { InfrahubTransport } from "./transport.js";

/**
 * ObjectStore provides access to the Infrahub object/artifact storage API.
 * Supports uploading and downloading content by identifier.
 *
 * Mirrors Python SDK's `ObjectStore`.
 */
export class ObjectStore {
  private readonly transport: InfrahubTransport;

  constructor(transport: InfrahubTransport) {
    this.transport = transport;
  }

  /**
   * Retrieve content from the object store by identifier.
   *
   * @param identifier - The object storage identifier (returned from upload)
   * @param tracker - Optional tracker header value for request tracing
   * @returns The stored content as a string
   */
  async get(identifier: string, tracker?: string): Promise<string> {
    const url = this.buildUrl(`/api/storage/object/${encodeURIComponent(identifier)}`);
    const extraHeaders: Record<string, string> = {};

    if (tracker) {
      extraHeaders["X-Infrahub-Tracker"] = tracker;
    }

    const response = await this.transport.get(url, extraHeaders);

    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError("Not authorized to access object store");
    }

    if (response.status >= 400) {
      throw new ServerNotReachableError(
        url,
        `Object store GET failed with status ${response.status}`,
      );
    }

    // Response data may be a string or object depending on content type
    if (typeof response.data === "string") {
      return response.data;
    }
    return JSON.stringify(response.data);
  }

  /**
   * Upload content to the object store.
   *
   * @param content - The content string to upload
   * @param tracker - Optional tracker header value for request tracing
   * @returns Server response containing the storage identifier
   */
  async upload(content: string, tracker?: string): Promise<Record<string, string>> {
    const url = this.buildUrl("/api/storage/upload/content");
    const extraHeaders: Record<string, string> = {};

    if (tracker) {
      extraHeaders["X-Infrahub-Tracker"] = tracker;
    }

    const response = await this.transport.post(
      url,
      { content },
      extraHeaders,
    );

    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError("Not authorized to upload to object store");
    }

    if (response.status >= 400) {
      throw new ServerNotReachableError(
        url,
        `Object store upload failed with status ${response.status}`,
      );
    }

    return (response.data ?? {}) as Record<string, string>;
  }

  /** Build a full URL from a path. */
  private buildUrl(path: string): string {
    // Extract base address from transport's GraphQL URL
    const graphqlUrl = this.transport.buildGraphQLUrl();
    const baseUrl = graphqlUrl.replace(/\/graphql$/, "");
    return `${baseUrl}${path}`;
  }
}

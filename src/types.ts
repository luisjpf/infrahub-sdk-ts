/**
 * Shared type definitions for the Infrahub TypeScript SDK.
 */

/** HTTP methods supported by the transport layer. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Shape of an HTTP response from the transport layer. */
export interface HttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

/** Abstraction for the HTTP transport layer — injectable for testing. */
export interface HttpClient {
  request(options: HttpRequestOptions): Promise<HttpResponse>;
}

/** Options for an HTTP request. */
export interface HttpRequestOptions {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/** Logger interface — injectable, defaults to console. */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** Console-based logger (default). */
export const consoleLogger: Logger = {
  debug: (msg, ...args) => console.debug(`[infrahub-sdk] ${msg}`, ...args),
  info: (msg, ...args) => console.info(`[infrahub-sdk] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[infrahub-sdk] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[infrahub-sdk] ${msg}`, ...args),
};

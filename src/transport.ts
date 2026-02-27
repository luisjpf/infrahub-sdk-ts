import type { InfrahubConfig } from "./config.js";
import {
  AuthenticationError,
  ServerNotReachableError,
  ServerNotResponsiveError,
} from "./errors.js";
import type { HttpClient, HttpRequestOptions, HttpResponse, Logger } from "./types.js";
import { consoleLogger } from "./types.js";

/**
 * Default HTTP client implementation using the native `fetch` API.
 * Handles auth headers, timeout via AbortController, and error mapping.
 */
export class FetchHttpClient implements HttpClient {
  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    const { method, url, headers, body, timeout } = options;

    const controller = new AbortController();
    const timeoutId = timeout
      ? setTimeout(() => controller.abort(), timeout * 1000)
      : undefined;

    try {
      const response = await fetch(url, {
        method,
        headers: headers as Record<string, string>,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const data: unknown = await response.json().catch(() => null);

      return {
        status: response.status,
        data,
        headers: responseHeaders,
      };
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ServerNotResponsiveError(url, timeout);
      }
      if (error instanceof TypeError) {
        // fetch throws TypeError for network errors (DNS, connection refused, etc.)
        throw new ServerNotReachableError(url, (error as Error).message);
      }
      throw error;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}

/**
 * InfrahubTransport wraps an HttpClient with Infrahub-specific concerns:
 * - Auth headers (API token or Bearer token)
 * - GraphQL URL construction
 * - Retry logic
 * - Token refresh on 401 "Expired Signature"
 *
 * This is the layer between the InfrahubClient and raw HTTP.
 * It contains NO business logic — only HTTP/auth/retry concerns.
 */
export class InfrahubTransport {
  private readonly httpClient: HttpClient;
  private readonly config: InfrahubConfig;
  private readonly log: Logger;
  private headers: Record<string, string>;
  private accessToken: string = "";
  private refreshToken: string = "";

  constructor(
    config: InfrahubConfig,
    httpClient?: HttpClient,
    logger?: Logger,
  ) {
    this.config = config;
    this.httpClient = httpClient ?? new FetchHttpClient();
    this.log = logger ?? consoleLogger;
    this.headers = { "content-type": "application/json" };

    if (config.apiToken) {
      this.headers["X-INFRAHUB-KEY"] = config.apiToken;
    }
  }

  /** Build the GraphQL URL for a given branch and optional timestamp. */
  buildGraphQLUrl(branchName?: string, at?: string): string {
    let url = `${this.config.address}/graphql`;
    if (branchName) {
      url += `/${branchName}`;
    }
    if (at) {
      url += `?at=${encodeURIComponent(at)}`;
    }
    return url;
  }

  /** Execute a GraphQL query or mutation via POST. */
  async post(
    url: string,
    payload: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
    timeout?: number,
  ): Promise<HttpResponse> {
    const headers = { ...this.headers, ...extraHeaders };
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    let response = await this.doRequest("POST", url, payload, headers, timeout);

    // Handle token refresh on 401 "Expired Signature"
    if (response.status === 401) {
      const data = response.data as Record<string, unknown> | null;
      const errors = (data?.errors ?? []) as Array<Record<string, unknown>>;
      const messages = errors.map((e) => e.message as string);
      if (messages.includes("Expired Signature") && this.refreshToken) {
        await this.login(true);
        headers["Authorization"] = `Bearer ${this.accessToken}`;
        response = await this.doRequest("POST", url, payload, headers, timeout);
      }
    }

    return response;
  }

  /** Execute a GET request. */
  async get(
    url: string,
    extraHeaders?: Record<string, string>,
    timeout?: number,
  ): Promise<HttpResponse> {
    const headers = { ...this.headers, ...extraHeaders };
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }
    return this.doRequest("GET", url, undefined, headers, timeout);
  }

  /**
   * Authenticate with username/password to obtain access + refresh tokens.
   * If `refresh` is true, uses the refresh token instead of credentials.
   */
  async login(refresh: boolean = false): Promise<void> {
    if (refresh && this.refreshToken) {
      const response = await this.httpClient.request({
        method: "POST",
        url: `${this.config.address}/api/auth/refresh`,
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${this.refreshToken}`,
        },
        timeout: this.config.timeout,
      });

      const data = response.data as Record<string, string>;
      this.accessToken = data.access_token ?? "";
      return;
    }

    if (!this.config.username || !this.config.password) {
      return;
    }

    const response = await this.httpClient.request({
      method: "POST",
      url: `${this.config.address}/api/auth/login`,
      headers: { "content-type": "application/json" },
      body: {
        username: this.config.username,
        password: this.config.password,
      },
      timeout: this.config.timeout,
    });

    if (response.status === 200) {
      const data = response.data as Record<string, string>;
      this.accessToken = data.access_token ?? "";
      this.refreshToken = data.refresh_token ?? "";
    } else {
      throw new AuthenticationError("Login failed");
    }
  }

  /** Internal request executor with retry support. */
  private async doRequest(
    method: "GET" | "POST",
    url: string,
    body: unknown | undefined,
    headers: Record<string, string>,
    timeout?: number,
  ): Promise<HttpResponse> {
    const effectiveTimeout = timeout ?? this.config.timeout;
    const maxDuration = this.config.maxRetryDuration;
    const startTime = Date.now();
    let shouldRetry = this.config.retryOnFailure;

    while (true) {
      try {
        const options: HttpRequestOptions = {
          method,
          url,
          headers,
          body,
          timeout: effectiveTimeout,
        };
        return await this.httpClient.request(options);
      } catch (error: unknown) {
        if (error instanceof ServerNotReachableError && shouldRetry) {
          const elapsed = (Date.now() - startTime) / 1000;
          if (elapsed < maxDuration) {
            this.log.warn(
              `Unable to connect to ${this.config.address}, will retry in ${this.config.retryDelay} seconds...`,
            );
            await this.sleep(this.config.retryDelay * 1000);
            shouldRetry = this.config.retryOnFailure;
            continue;
          }
        }
        throw error;
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

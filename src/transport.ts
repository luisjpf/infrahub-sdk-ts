import type { InfrahubConfig } from "./config.js";
import {
  AuthenticationError,
  ServerNotReachableError,
  ServerNotResponsiveError,
} from "./errors.js";
import type { HttpClient, HttpRequestOptions, HttpResponse, Logger } from "./types.js";
import { consoleLogger, toErrorMessage } from "./types.js";

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
        throw new ServerNotReachableError(url, toErrorMessage(error));
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
  /** Single-flight guard: all concurrent refreshes share this promise. */
  private refreshPromise: Promise<void> | null = null;

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

  /** The configured server address (without trailing slash). */
  get address(): string {
    return this.config.address;
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

    if (this.shouldRefreshToken(response)) {
      await this.refreshAccessToken();
      headers["Authorization"] = `Bearer ${this.accessToken}`;
      response = await this.doRequest("POST", url, payload, headers, timeout);
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

    let response = await this.doRequest("GET", url, undefined, headers, timeout);

    if (this.shouldRefreshToken(response)) {
      await this.refreshAccessToken();
      headers["Authorization"] = `Bearer ${this.accessToken}`;
      response = await this.doRequest("GET", url, undefined, headers, timeout);
    }

    return response;
  }

  /** Check if a 401 response indicates an expired token that can be refreshed. */
  private shouldRefreshToken(response: HttpResponse): boolean {
    if (response.status !== 401 || !this.refreshToken) return false;
    const data = response.data as Record<string, unknown> | null;
    const errors = (data?.errors ?? []) as Array<Record<string, unknown>>;
    const messages = errors.map((e) => e.message as string);
    return messages.includes("Expired Signature");
  }

  /**
   * Refresh the access token with single-flight guard.
   * Multiple concurrent callers share the same refresh request.
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.login(true).finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
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

      if (response.status !== 200) {
        throw new AuthenticationError("Token refresh failed");
      }

      const data = response.data as Record<string, string>;
      this.accessToken = data.access_token ?? "";
      return;
    }

    if (!this.config.username || !this.config.password) {
      throw new AuthenticationError(
        "Login failed: no credentials configured. Set username/password or use API token authentication.",
      );
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
    let attempt = 0;

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
        if (error instanceof ServerNotReachableError && this.config.retryOnFailure) {
          const elapsed = (Date.now() - startTime) / 1000;
          if (elapsed < maxDuration) {
            const delay = this.computeRetryDelay(attempt);
            this.log.warn(
              `Unable to connect to ${this.config.address}, will retry in ${(delay / 1000).toFixed(1)} seconds (attempt ${attempt + 1})...`,
            );
            await this.sleep(delay);
            attempt++;
            continue;
          }
        }
        throw error;
      }
    }
  }

  /**
   * Compute retry delay based on configured backoff strategy.
   *
   * - "constant": always uses retryDelay
   * - "exponential": doubles delay each attempt (base * 2^attempt), capped at retryMaxDelay
   *
   * If retryJitter is enabled, adds random jitter of +/- 25%.
   */
  computeRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryDelay * 1000; // convert to ms
    const maxDelay = this.config.retryMaxDelay * 1000;

    let delay: number;
    if (this.config.retryBackoff === "exponential") {
      delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    } else {
      delay = baseDelay;
    }

    if (this.config.retryJitter) {
      // Add +/- 25% jitter
      const jitter = delay * 0.25 * (2 * Math.random() - 1);
      delay = Math.max(0, delay + jitter);
    }

    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

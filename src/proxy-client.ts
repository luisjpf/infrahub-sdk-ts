import {
  ServerNotReachableError,
  ServerNotResponsiveError,
} from "./errors.js";
import type { HttpClient, HttpRequestOptions, HttpResponse } from "./types.js";
import { toErrorMessage } from "./types.js";

/**
 * TLS/proxy configuration for HTTP clients.
 * These settings are extracted from InfrahubConfig and passed to the proxy-aware client.
 */
export interface TlsProxyConfig {
  /** HTTP(S) proxy URL (e.g., "http://proxy:3128") */
  proxyUrl?: string;
  /** Skip TLS certificate verification (insecure — for development only) */
  tlsInsecure?: boolean;
  /** Path to a CA certificate file for TLS verification */
  tlsCaFile?: string;
}

/**
 * ProxyHttpClient — wraps fetch with proxy and TLS configuration.
 *
 * On Node.js 18+, uses the `undici` ProxyAgent when a proxy URL is configured.
 * The `undici` module is loaded dynamically and only when proxy is needed.
 *
 * For TLS options (tlsInsecure, tlsCaFile), the caller should provide a custom
 * HttpClient with the appropriate Node.js `https.Agent`, since the native `fetch`
 * API has limited TLS control. This class stores the configuration and exposes it
 * for consumers that need to build their own agent.
 *
 * Usage:
 * ```ts
 * const client = new ProxyHttpClient({
 *   proxyUrl: "http://my-proxy:3128",
 *   tlsInsecure: false,
 * });
 * ```
 */
export class ProxyHttpClient implements HttpClient {
  readonly tlsProxyConfig: TlsProxyConfig;

  /** Cached dispatcher promise — created lazily on first request, reused thereafter. Cleared on failure to allow retry. */
  private _dispatcherPromise: Promise<object | undefined> | undefined;

  constructor(config: TlsProxyConfig = {}) {
    this.tlsProxyConfig = config;
    if (config.tlsInsecure) {
      console.warn(
        "[infrahub-sdk] WARNING: tlsInsecure is enabled — TLS certificate verification is disabled. " +
        "This should NEVER be used in production as it allows man-in-the-middle attacks.",
      );
    }
  }

  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    const { method, url, headers, body, timeout } = options;

    const controller = new AbortController();
    const timeoutId = timeout
      ? setTimeout(() => controller.abort(), timeout * 1000)
      : undefined;

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: headers as Record<string, string>,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      };

      // Build a dispatcher that handles both proxy and TLS options via undici.
      // This avoids the process-wide NODE_TLS_REJECT_UNAUTHORIZED race condition.
      const dispatcher = await this.getDispatcher();
      if (dispatcher) {
        (fetchOptions as Record<string, unknown>).dispatcher = dispatcher;
      }

      const response = await fetch(url, fetchOptions);

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
        throw new ServerNotReachableError(url, toErrorMessage(error));
      }
      throw error;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /** Return the cached dispatcher, creating it lazily on first call. */
  private getDispatcher(): Promise<object | undefined> {
    if (!this._dispatcherPromise) {
      const promise: Promise<object | undefined> = this.createDispatcher().then(
        (result) => result as object | undefined,
        (err: unknown) => {
          this._dispatcherPromise = undefined; // allow retry on next request
          throw err;
        },
      );
      this._dispatcherPromise = promise;
    }
    return this._dispatcherPromise!;
  }

  /**
   * Create a dispatcher that handles proxy and/or TLS insecure mode.
   * Uses undici's Agent/ProxyAgent with per-request TLS config to avoid
   * the process-wide NODE_TLS_REJECT_UNAUTHORIZED race condition.
   * Returns undefined if undici is not available (graceful fallback).
   */
  private async createDispatcher(): Promise<unknown | undefined> {
    const needsProxy = !!this.tlsProxyConfig.proxyUrl;
    const needsTls = !!this.tlsProxyConfig.tlsInsecure || !!this.tlsProxyConfig.tlsCaFile;

    if (!needsProxy && !needsTls) return undefined;

    try {
      const moduleName = "undici";
      const undici = await (import(moduleName) as Promise<Record<string, unknown>>);

      // Build TLS connect options
      const connect: Record<string, unknown> = {};
      if (this.tlsProxyConfig.tlsInsecure) {
        connect.rejectUnauthorized = false;
      }
      if (this.tlsProxyConfig.tlsCaFile) {
        const { readFileSync } = await import("node:fs");
        connect.ca = readFileSync(this.tlsProxyConfig.tlsCaFile);
      }

      const connectOpts = Object.keys(connect).length > 0 ? { connect } : {};

      if (needsProxy) {
        const ProxyAgentCtor = undici.ProxyAgent as (new (opts: Record<string, unknown>) => unknown) | undefined;
        if (ProxyAgentCtor) {
          return new ProxyAgentCtor({
            uri: this.tlsProxyConfig.proxyUrl!,
            ...connectOpts,
          });
        }
      } else {
        const AgentCtor = undici.Agent as (new (opts: Record<string, unknown>) => unknown) | undefined;
        if (AgentCtor) {
          return new AgentCtor(connectOpts);
        }
      }
    } catch {
      const features: string[] = [];
      if (needsProxy) features.push(`proxy (${this.tlsProxyConfig.proxyUrl})`);
      if (this.tlsProxyConfig.tlsInsecure) features.push("tlsInsecure");
      if (this.tlsProxyConfig.tlsCaFile) features.push(`tlsCaFile (${this.tlsProxyConfig.tlsCaFile})`);
      console.warn(
        `[infrahub-sdk] undici not available — ${features.join(", ")} config will be ignored. ` +
        `Install undici as a dependency to enable proxy/TLS support.`,
      );
    }
    return undefined;
  }
}

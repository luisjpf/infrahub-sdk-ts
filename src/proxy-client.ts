import {
  ServerNotReachableError,
  ServerNotResponsiveError,
} from "./errors.js";
import type { HttpClient, HttpRequestOptions, HttpResponse } from "./types.js";

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

  constructor(config: TlsProxyConfig = {}) {
    this.tlsProxyConfig = config;
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

      // If proxy is configured, try to use undici ProxyAgent (Node 18+)
      if (this.tlsProxyConfig.proxyUrl) {
        const dispatcher = await this.createProxyDispatcher();
        if (dispatcher) {
          // Node.js fetch supports the `dispatcher` option via undici
          (fetchOptions as Record<string, unknown>).dispatcher = dispatcher;
        }
      }

      // If TLS insecure mode, set NODE_TLS_REJECT_UNAUTHORIZED for this request
      // Note: This is a process-wide setting, not ideal but standard in Node.js
      const prevTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      if (this.tlsProxyConfig.tlsInsecure) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      }

      try {
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
      } finally {
        // Restore TLS setting
        if (this.tlsProxyConfig.tlsInsecure) {
          if (prevTlsReject !== undefined) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTlsReject;
          } else {
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ServerNotResponsiveError(url, timeout);
      }
      if (error instanceof TypeError) {
        throw new ServerNotReachableError(url, (error as Error).message);
      }
      throw error;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Attempt to create an undici ProxyAgent for proxy support.
   * Returns undefined if undici is not available (graceful fallback).
   */
  private async createProxyDispatcher(): Promise<unknown | undefined> {
    try {
      // Dynamic import — undici is bundled with Node 18+ but may not be directly importable.
      // We use a variable to prevent TypeScript from resolving the module at compile time.
      const moduleName = "undici";
      const undici = await (import(moduleName) as Promise<Record<string, unknown>>);
      const ProxyAgentCtor = undici.ProxyAgent as (new (url: string) => unknown) | undefined;
      if (ProxyAgentCtor && this.tlsProxyConfig.proxyUrl) {
        return new ProxyAgentCtor(this.tlsProxyConfig.proxyUrl);
      }
    } catch {
      // undici not available — fall through without proxy
    }
    return undefined;
  }
}

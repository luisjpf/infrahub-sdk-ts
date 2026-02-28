import { describe, it, expect, vi, beforeEach } from "vitest";
import { createConfig } from "../../src/config.js";
import { AuthenticationError, ServerNotReachableError } from "../../src/errors.js";
import { InfrahubTransport } from "../../src/transport.js";
import type { HttpClient, HttpRequestOptions, HttpResponse } from "../../src/types.js";

/** Create a mock HTTP client. */
function createMockHttpClient(
  handler: (options: HttpRequestOptions) => Promise<HttpResponse>,
): HttpClient {
  return { request: handler };
}

/** Create a simple successful response. */
function okResponse(data: unknown): HttpResponse {
  return { status: 200, data, headers: {} };
}

describe("InfrahubTransport", () => {
  describe("buildGraphQLUrl", () => {
    it("should build base GraphQL URL", () => {
      const config = createConfig({ address: "http://localhost:8000" });
      const transport = new InfrahubTransport(config);
      expect(transport.buildGraphQLUrl()).toBe("http://localhost:8000/graphql");
    });

    it("should include branch name", () => {
      const config = createConfig();
      const transport = new InfrahubTransport(config);
      expect(transport.buildGraphQLUrl("feature-1")).toBe(
        "http://localhost:8000/graphql/feature-1",
      );
    });

    it("should include at parameter", () => {
      const config = createConfig();
      const transport = new InfrahubTransport(config);
      expect(transport.buildGraphQLUrl("main", "2024-01-01T00:00:00Z")).toBe(
        "http://localhost:8000/graphql/main?at=2024-01-01T00%3A00%3A00Z",
      );
    });
  });

  describe("post", () => {
    it("should send POST with correct headers and payload", async () => {
      const handler = vi.fn().mockResolvedValue(okResponse({ data: { result: true } }));
      const config = createConfig();
      const transport = new InfrahubTransport(config, createMockHttpClient(handler));

      await transport.post("http://localhost:8000/graphql", { query: "{ test }" });

      expect(handler).toHaveBeenCalledOnce();
      const callArgs = handler.mock.calls[0]![0] as HttpRequestOptions;
      expect(callArgs.method).toBe("POST");
      expect(callArgs.url).toBe("http://localhost:8000/graphql");
      expect(callArgs.body).toEqual({ query: "{ test }" });
      expect(callArgs.headers?.["content-type"]).toBe("application/json");
    });

    it("should include API token in headers", async () => {
      const handler = vi.fn().mockResolvedValue(okResponse({}));
      const config = createConfig({ apiToken: "test-token" });
      const transport = new InfrahubTransport(config, createMockHttpClient(handler));

      await transport.post("http://localhost:8000/graphql", {});

      const callArgs = handler.mock.calls[0]![0] as HttpRequestOptions;
      expect(callArgs.headers?.["X-INFRAHUB-KEY"]).toBe("test-token");
    });

    it("should include extra headers", async () => {
      const handler = vi.fn().mockResolvedValue(okResponse({}));
      const config = createConfig();
      const transport = new InfrahubTransport(config, createMockHttpClient(handler));

      await transport.post("http://localhost:8000/graphql", {}, { "X-Custom": "value" });

      const callArgs = handler.mock.calls[0]![0] as HttpRequestOptions;
      expect(callArgs.headers?.["X-Custom"]).toBe("value");
    });
  });

  describe("login", () => {
    it("should login with username/password", async () => {
      const handler = vi.fn().mockResolvedValue(
        okResponse({ access_token: "access123", refresh_token: "refresh456" }),
      );
      const config = createConfig({ username: "admin", password: "secret" });
      const transport = new InfrahubTransport(config, createMockHttpClient(handler));

      await transport.login();

      expect(handler).toHaveBeenCalledOnce();
      const callArgs = handler.mock.calls[0]![0] as HttpRequestOptions;
      expect(callArgs.url).toBe("http://localhost:8000/api/auth/login");
      expect(callArgs.body).toEqual({ username: "admin", password: "secret" });
    });

    it("should do nothing when no credentials", async () => {
      const handler = vi.fn();
      const config = createConfig({ apiToken: "token" });
      const transport = new InfrahubTransport(config, createMockHttpClient(handler));

      await transport.login();

      expect(handler).not.toHaveBeenCalled();
    });

    it("should throw on failed login", async () => {
      const handler = vi.fn().mockResolvedValue({
        status: 401,
        data: { error: "Invalid credentials" },
        headers: {},
      });
      const config = createConfig({ username: "admin", password: "wrong" });
      const transport = new InfrahubTransport(config, createMockHttpClient(handler));

      await expect(transport.login()).rejects.toThrow(AuthenticationError);
    });

    it("should use Bearer token after login", async () => {
      const calls: HttpRequestOptions[] = [];
      const handler = vi.fn().mockImplementation(async (opts: HttpRequestOptions) => {
        calls.push(opts);
        if (opts.url.includes("/api/auth/login")) {
          return okResponse({ access_token: "access123", refresh_token: "refresh456" });
        }
        return okResponse({ data: {} });
      });

      const config = createConfig({ username: "admin", password: "secret" });
      const transport = new InfrahubTransport(config, createMockHttpClient(handler));

      await transport.login();
      await transport.post("http://localhost:8000/graphql", {});

      expect(calls).toHaveLength(2);
      expect(calls[1]!.headers?.["Authorization"]).toBe("Bearer access123");
    });
  });

  describe("token refresh", () => {
    it("should refresh token on 401 Expired Signature", async () => {
      let callCount = 0;
      const handler = vi.fn().mockImplementation(async (opts: HttpRequestOptions) => {
        callCount++;
        if (opts.url.includes("/api/auth/login")) {
          return okResponse({ access_token: "access1", refresh_token: "refresh1" });
        }
        if (opts.url.includes("/api/auth/refresh")) {
          return okResponse({ access_token: "access2" });
        }
        // First call returns 401, second succeeds
        if (callCount === 2) {
          return {
            status: 401,
            data: { errors: [{ message: "Expired Signature" }] },
            headers: {},
          };
        }
        return okResponse({ data: { ok: true } });
      });

      const config = createConfig({ username: "admin", password: "secret" });
      const transport = new InfrahubTransport(config, createMockHttpClient(handler));

      await transport.login();
      const response = await transport.post("http://localhost:8000/graphql", {});

      // Should have called: login, post (401), refresh, post (200)
      expect(callCount).toBe(4);
      expect(response.status).toBe(200);
    });
  });

  describe("retry logic", () => {
    it("should not retry by default", async () => {
      const handler = vi.fn().mockRejectedValue(
        new ServerNotReachableError("http://localhost:8000"),
      );
      const config = createConfig();
      const transport = new InfrahubTransport(config, createMockHttpClient(handler));

      await expect(
        transport.post("http://localhost:8000/graphql", {}),
      ).rejects.toThrow(ServerNotReachableError);

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("computeRetryDelay", () => {
    it("should return constant delay for constant backoff", () => {
      const config = createConfig({
        retryBackoff: "constant",
        retryDelay: 5,
        retryJitter: false,
      });
      const transport = new InfrahubTransport(config, createMockHttpClient(vi.fn()));

      expect(transport.computeRetryDelay(0)).toBe(5000);
      expect(transport.computeRetryDelay(1)).toBe(5000);
      expect(transport.computeRetryDelay(5)).toBe(5000);
    });

    it("should double delay each attempt for exponential backoff", () => {
      const config = createConfig({
        retryBackoff: "exponential",
        retryDelay: 1,
        retryMaxDelay: 120,
        retryJitter: false,
      });
      const transport = new InfrahubTransport(config, createMockHttpClient(vi.fn()));

      expect(transport.computeRetryDelay(0)).toBe(1000);   // 1s * 2^0
      expect(transport.computeRetryDelay(1)).toBe(2000);   // 1s * 2^1
      expect(transport.computeRetryDelay(2)).toBe(4000);   // 1s * 2^2
      expect(transport.computeRetryDelay(3)).toBe(8000);   // 1s * 2^3
      expect(transport.computeRetryDelay(10)).toBe(120000); // capped at maxDelay
    });

    it("should cap at retryMaxDelay", () => {
      const config = createConfig({
        retryBackoff: "exponential",
        retryDelay: 5,
        retryMaxDelay: 30,
        retryJitter: false,
      });
      const transport = new InfrahubTransport(config, createMockHttpClient(vi.fn()));

      // 5 * 2^3 = 40, but capped at 30
      expect(transport.computeRetryDelay(3)).toBe(30000);
    });

    it("should add jitter when enabled", () => {
      const config = createConfig({
        retryBackoff: "constant",
        retryDelay: 10,
        retryJitter: true,
      });
      const transport = new InfrahubTransport(config, createMockHttpClient(vi.fn()));

      // Run multiple times and check variance
      const delays = new Set<number>();
      for (let i = 0; i < 20; i++) {
        delays.add(transport.computeRetryDelay(0));
      }

      // With jitter, we should get different values
      // With +/- 25%, values should be in range [7500, 12500]
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(7500);
        expect(delay).toBeLessThanOrEqual(12500);
      }

      // Very unlikely to get all same values with random jitter
      expect(delays.size).toBeGreaterThan(1);
    });

    it("should not add jitter when disabled", () => {
      const config = createConfig({
        retryBackoff: "constant",
        retryDelay: 10,
        retryJitter: false,
      });
      const transport = new InfrahubTransport(config, createMockHttpClient(vi.fn()));

      const delays = new Set<number>();
      for (let i = 0; i < 10; i++) {
        delays.add(transport.computeRetryDelay(0));
      }

      expect(delays.size).toBe(1);
      expect([...delays][0]).toBe(10000);
    });
  });
});

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
});

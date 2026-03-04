import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProxyHttpClient } from "../../src/proxy-client.js";
import { createConfig } from "../../src/config.js";
import {
  ServerNotReachableError,
  ServerNotResponsiveError,
} from "../../src/errors.js";

describe("ProxyHttpClient", () => {
  describe("constructor", () => {
    it("should accept empty config", () => {
      const client = new ProxyHttpClient();
      expect(client.tlsProxyConfig).toEqual({});
    });

    it("should store proxy URL", () => {
      const client = new ProxyHttpClient({ proxyUrl: "http://proxy:3128" });
      expect(client.tlsProxyConfig.proxyUrl).toBe("http://proxy:3128");
    });

    it("should store TLS insecure setting", () => {
      const client = new ProxyHttpClient({ tlsInsecure: true });
      expect(client.tlsProxyConfig.tlsInsecure).toBe(true);
    });

    it("should store CA file path", () => {
      const client = new ProxyHttpClient({ tlsCaFile: "/etc/ssl/ca.pem" });
      expect(client.tlsProxyConfig.tlsCaFile).toBe("/etc/ssl/ca.pem");
    });

    it("should store all settings together", () => {
      const client = new ProxyHttpClient({
        proxyUrl: "http://proxy:3128",
        tlsInsecure: false,
        tlsCaFile: "/etc/ssl/ca.pem",
      });
      expect(client.tlsProxyConfig).toEqual({
        proxyUrl: "http://proxy:3128",
        tlsInsecure: false,
        tlsCaFile: "/etc/ssl/ca.pem",
      });
    });
  });

  describe("request()", () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should make a successful request and return parsed response", async () => {
      const mockHeaders = new Map([["content-type", "application/json"]]);
      fetchSpy.mockResolvedValue({
        status: 200,
        headers: {
          forEach: (cb: (v: string, k: string) => void) => {
            mockHeaders.forEach((v, k) => cb(v, k));
          },
        },
        json: () => Promise.resolve({ data: { result: true } }),
      });

      const client = new ProxyHttpClient();
      const response = await client.request({
        method: "POST",
        url: "http://localhost:8000/graphql",
        headers: { "content-type": "application/json" },
        body: { query: "{ test }" },
      });

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ data: { result: true } });
      expect(response.headers["content-type"]).toBe("application/json");
      expect(fetchSpy).toHaveBeenCalledOnce();

      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[0]).toBe("http://localhost:8000/graphql");
      expect(callArgs[1].method).toBe("POST");
      expect(callArgs[1].body).toBe(JSON.stringify({ query: "{ test }" }));
    });

    it("should handle response with non-JSON body gracefully", async () => {
      const mockHeaders = new Map<string, string>();
      fetchSpy.mockResolvedValue({
        status: 204,
        headers: {
          forEach: (cb: (v: string, k: string) => void) => {
            mockHeaders.forEach((v, k) => cb(v, k));
          },
        },
        json: () => Promise.reject(new Error("no body")),
      });

      const client = new ProxyHttpClient();
      const response = await client.request({
        method: "GET",
        url: "http://localhost:8000/api/health",
      });

      expect(response.status).toBe(204);
      expect(response.data).toBeNull();
    });

    it("should not include body in fetch when body is undefined", async () => {
      const mockHeaders = new Map<string, string>();
      fetchSpy.mockResolvedValue({
        status: 200,
        headers: {
          forEach: (cb: (v: string, k: string) => void) => {
            mockHeaders.forEach((v, k) => cb(v, k));
          },
        },
        json: () => Promise.resolve(null),
      });

      const client = new ProxyHttpClient();
      await client.request({
        method: "GET",
        url: "http://localhost:8000/api/health",
      });

      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[1].body).toBeUndefined();
    });

    it("should throw ServerNotResponsiveError on timeout/abort", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      fetchSpy.mockRejectedValue(abortError);

      const client = new ProxyHttpClient();
      await expect(
        client.request({
          method: "GET",
          url: "http://localhost:8000/api/test",
          timeout: 5,
        }),
      ).rejects.toThrow(ServerNotResponsiveError);

      const err: ServerNotResponsiveError = await client.request({
          method: "GET",
          url: "http://localhost:8000/api/test",
          timeout: 5,
        }).catch((e) => e) as ServerNotResponsiveError;

      expect(err).toBeInstanceOf(ServerNotResponsiveError);
      expect(err.url).toBe("http://localhost:8000/api/test");
      expect(err.timeout).toBe(5);
    });

    it("should throw ServerNotReachableError on network TypeError", async () => {
      fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

      const client = new ProxyHttpClient();
      await expect(
        client.request({
          method: "GET",
          url: "http://unreachable:9999/api",
        }),
      ).rejects.toThrow(ServerNotReachableError);

      const err: ServerNotReachableError = await client.request({
          method: "GET",
          url: "http://unreachable:9999/api",
        }).catch((e) => e) as ServerNotReachableError;

      expect(err).toBeInstanceOf(ServerNotReachableError);
      expect(err.address).toBe("http://unreachable:9999/api");
    });

    it("should re-throw unknown errors unchanged", async () => {
      const weirdError = new RangeError("something unexpected");
      fetchSpy.mockRejectedValue(weirdError);

      const client = new ProxyHttpClient();
      await expect(
        client.request({
          method: "GET",
          url: "http://localhost:8000/api/test",
        }),
      ).rejects.toThrow(weirdError);
    });

    it("should clear timeout on success", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      const mockHeaders = new Map<string, string>();
      fetchSpy.mockResolvedValue({
        status: 200,
        headers: {
          forEach: (cb: (v: string, k: string) => void) => {
            mockHeaders.forEach((v, k) => cb(v, k));
          },
        },
        json: () => Promise.resolve({}),
      });

      const client = new ProxyHttpClient();
      await client.request({
        method: "GET",
        url: "http://localhost:8000/api/test",
        timeout: 30,
      });

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("should clear timeout on error", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

      const client = new ProxyHttpClient();
      try {
        await client.request({
          method: "GET",
          url: "http://localhost:8000/api/test",
          timeout: 30,
        });
      } catch {
        // expected
      }

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe("createDispatcher()", () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should not attach a dispatcher when no proxy/TLS configured", async () => {
      const mockHeaders = new Map<string, string>();
      fetchSpy.mockResolvedValue({
        status: 200,
        headers: {
          forEach: (cb: (v: string, k: string) => void) => {
            mockHeaders.forEach((v, k) => cb(v, k));
          },
        },
        json: () => Promise.resolve({}),
      });

      const client = new ProxyHttpClient();
      await client.request({
        method: "GET",
        url: "http://localhost:8000/test",
      });

      const callArgs = fetchSpy.mock.calls[0]!;
      // No dispatcher should be set when no proxy/tls is configured
      expect(callArgs[1].dispatcher).toBeUndefined();
    });

    it("should gracefully fall back when undici is not available (proxy configured)", async () => {
      const mockHeaders = new Map<string, string>();
      fetchSpy.mockResolvedValue({
        status: 200,
        headers: {
          forEach: (cb: (v: string, k: string) => void) => {
            mockHeaders.forEach((v, k) => cb(v, k));
          },
        },
        json: () => Promise.resolve({}),
      });

      // undici is not installed in this project, so proxy config will
      // trigger the createDispatcher path and hit the catch block
      const client = new ProxyHttpClient({ proxyUrl: "http://proxy:3128" });
      const response = await client.request({
        method: "GET",
        url: "http://localhost:8000/test",
      });

      // Should still succeed — just without a dispatcher
      expect(response.status).toBe(200);
    });

    it("should gracefully fall back when undici is not available (tlsInsecure configured)", async () => {
      const mockHeaders = new Map<string, string>();
      fetchSpy.mockResolvedValue({
        status: 200,
        headers: {
          forEach: (cb: (v: string, k: string) => void) => {
            mockHeaders.forEach((v, k) => cb(v, k));
          },
        },
        json: () => Promise.resolve({}),
      });

      const client = new ProxyHttpClient({ tlsInsecure: true });
      const response = await client.request({
        method: "GET",
        url: "https://localhost:8000/test",
      });

      expect(response.status).toBe(200);
    });

    it("should gracefully fall back when undici is not available (tlsCaFile configured)", async () => {
      const mockHeaders = new Map<string, string>();
      fetchSpy.mockResolvedValue({
        status: 200,
        headers: {
          forEach: (cb: (v: string, k: string) => void) => {
            mockHeaders.forEach((v, k) => cb(v, k));
          },
        },
        json: () => Promise.resolve({}),
      });

      const client = new ProxyHttpClient({ tlsCaFile: "/etc/ssl/ca.pem" });
      const response = await client.request({
        method: "GET",
        url: "https://localhost:8000/test",
      });

      expect(response.status).toBe(200);
    });
  });
});

describe("Config TLS/proxy fields", () => {
  it("should accept proxyUrl", () => {
    const config = createConfig({ proxyUrl: "http://proxy:3128" });
    expect(config.proxyUrl).toBe("http://proxy:3128");
  });

  it("should default tlsInsecure to false", () => {
    const config = createConfig();
    expect(config.tlsInsecure).toBe(false);
  });

  it("should accept tlsInsecure=true", () => {
    const config = createConfig({ tlsInsecure: true });
    expect(config.tlsInsecure).toBe(true);
  });

  it("should accept tlsCaFile", () => {
    const config = createConfig({ tlsCaFile: "/path/to/ca.pem" });
    expect(config.tlsCaFile).toBe("/path/to/ca.pem");
  });

  it("should not require proxy/TLS options", () => {
    const config = createConfig();
    expect(config.proxyUrl).toBeUndefined();
    expect(config.tlsCaFile).toBeUndefined();
  });

  it("should reject invalid proxy URL", () => {
    expect(() => createConfig({ proxyUrl: "not-a-url" })).toThrow();
  });
});

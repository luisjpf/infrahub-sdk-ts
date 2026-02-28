import { describe, it, expect } from "vitest";
import { ProxyHttpClient } from "../../src/proxy-client.js";
import { createConfig } from "../../src/config.js";

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

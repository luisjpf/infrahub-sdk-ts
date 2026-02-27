import { describe, it, expect } from "vitest";
import { createConfig } from "../../src/config.js";

describe("Config", () => {
  describe("createConfig", () => {
    it("should create config with defaults", () => {
      const config = createConfig();
      expect(config.address).toBe("http://localhost:8000");
      expect(config.defaultBranch).toBe("main");
      expect(config.timeout).toBe(60);
      expect(config.paginationSize).toBe(50);
      expect(config.maxConcurrentExecution).toBe(5);
      expect(config.retryOnFailure).toBe(false);
      expect(config.retryDelay).toBe(5);
      expect(config.maxRetryDuration).toBe(300);
    });

    it("should accept custom address", () => {
      const config = createConfig({ address: "https://infrahub.example.com" });
      expect(config.address).toBe("https://infrahub.example.com");
    });

    it("should strip trailing slash from address", () => {
      const config = createConfig({ address: "http://localhost:8000/" });
      expect(config.address).toBe("http://localhost:8000");
    });

    it("should accept API token", () => {
      const config = createConfig({ apiToken: "my-token" });
      expect(config.apiToken).toBe("my-token");
    });

    it("should accept username and password together", () => {
      const config = createConfig({ username: "admin", password: "secret" });
      expect(config.username).toBe("admin");
      expect(config.password).toBe("secret");
    });

    it("should reject username without password", () => {
      expect(() => createConfig({ username: "admin" })).toThrow(
        "Both 'username' and 'password' must be set together",
      );
    });

    it("should reject password without username", () => {
      expect(() => createConfig({ password: "secret" })).toThrow(
        "Both 'username' and 'password' must be set together",
      );
    });

    it("should reject password combined with API token", () => {
      expect(() =>
        createConfig({
          username: "admin",
          password: "secret",
          apiToken: "token",
        }),
      ).toThrow("Cannot combine password with token-based authentication");
    });

    it("should reject invalid URL", () => {
      expect(() => createConfig({ address: "not-a-url" })).toThrow();
    });

    it("should accept custom timeout", () => {
      const config = createConfig({ timeout: 120 });
      expect(config.timeout).toBe(120);
    });

    it("should accept custom pagination size", () => {
      const config = createConfig({ paginationSize: 100 });
      expect(config.paginationSize).toBe(100);
    });

    it("should accept custom default branch", () => {
      const config = createConfig({ defaultBranch: "develop" });
      expect(config.defaultBranch).toBe("develop");
    });
  });
});

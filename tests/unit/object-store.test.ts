import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectStore } from "../../src/object-store.js";
import { AuthenticationError, ServerNotReachableError } from "../../src/errors.js";
import type { InfrahubTransport } from "../../src/transport.js";
import type { HttpResponse } from "../../src/types.js";

function createMockTransport(overrides: Partial<InfrahubTransport> = {}): InfrahubTransport {
  return {
    buildGraphQLUrl: vi.fn().mockReturnValue("http://localhost:8000/graphql"),
    get: vi.fn<(url: string, extraHeaders?: Record<string, string>) => Promise<HttpResponse>>(),
    post: vi.fn<(url: string, payload: Record<string, unknown>, extraHeaders?: Record<string, string>) => Promise<HttpResponse>>(),
    ...overrides,
  } as unknown as InfrahubTransport;
}

describe("ObjectStore", () => {
  let transport: InfrahubTransport;
  let store: ObjectStore;

  beforeEach(() => {
    transport = createMockTransport();
    store = new ObjectStore(transport);
  });

  describe("get()", () => {
    it("should retrieve content by identifier", async () => {
      const mockResponse: HttpResponse = {
        status: 200,
        data: "file content here",
        headers: {},
      };
      vi.mocked(transport.get).mockResolvedValue(mockResponse);

      const result = await store.get("abc-123");

      expect(result).toBe("file content here");
      expect(transport.get).toHaveBeenCalledWith(
        "http://localhost:8000/api/storage/object/abc-123",
        {},
      );
    });

    it("should send tracker header when provided", async () => {
      const mockResponse: HttpResponse = {
        status: 200,
        data: "content",
        headers: {},
      };
      vi.mocked(transport.get).mockResolvedValue(mockResponse);

      await store.get("abc-123", "my-tracker");

      expect(transport.get).toHaveBeenCalledWith(
        "http://localhost:8000/api/storage/object/abc-123",
        { "X-Infrahub-Tracker": "my-tracker" },
      );
    });

    it("should handle JSON response data", async () => {
      const mockResponse: HttpResponse = {
        status: 200,
        data: { key: "value" },
        headers: {},
      };
      vi.mocked(transport.get).mockResolvedValue(mockResponse);

      const result = await store.get("abc-123");

      expect(result).toBe('{"key":"value"}');
    });

    it("should throw AuthenticationError on 401", async () => {
      const mockResponse: HttpResponse = {
        status: 401,
        data: null,
        headers: {},
      };
      vi.mocked(transport.get).mockResolvedValue(mockResponse);

      await expect(store.get("abc-123")).rejects.toThrow(AuthenticationError);
    });

    it("should throw AuthenticationError on 403", async () => {
      const mockResponse: HttpResponse = {
        status: 403,
        data: null,
        headers: {},
      };
      vi.mocked(transport.get).mockResolvedValue(mockResponse);

      await expect(store.get("abc-123")).rejects.toThrow(AuthenticationError);
    });

    it("should throw ServerNotReachableError on other errors", async () => {
      const mockResponse: HttpResponse = {
        status: 500,
        data: null,
        headers: {},
      };
      vi.mocked(transport.get).mockResolvedValue(mockResponse);

      await expect(store.get("abc-123")).rejects.toThrow(ServerNotReachableError);
    });

    it("should URL-encode the identifier", async () => {
      const mockResponse: HttpResponse = {
        status: 200,
        data: "content",
        headers: {},
      };
      vi.mocked(transport.get).mockResolvedValue(mockResponse);

      await store.get("path/with spaces");

      expect(transport.get).toHaveBeenCalledWith(
        "http://localhost:8000/api/storage/object/path%2Fwith%20spaces",
        {},
      );
    });
  });

  describe("upload()", () => {
    it("should upload content and return response", async () => {
      const mockResponse: HttpResponse = {
        status: 200,
        data: { identifier: "new-id-123" },
        headers: {},
      };
      vi.mocked(transport.post).mockResolvedValue(mockResponse);

      const result = await store.upload("my file content");

      expect(result).toEqual({ identifier: "new-id-123" });
      expect(transport.post).toHaveBeenCalledWith(
        "http://localhost:8000/api/storage/upload/content",
        { content: "my file content" },
        {},
      );
    });

    it("should send tracker header when provided", async () => {
      const mockResponse: HttpResponse = {
        status: 200,
        data: { identifier: "id-456" },
        headers: {},
      };
      vi.mocked(transport.post).mockResolvedValue(mockResponse);

      await store.upload("content", "upload-tracker");

      expect(transport.post).toHaveBeenCalledWith(
        "http://localhost:8000/api/storage/upload/content",
        { content: "content" },
        { "X-Infrahub-Tracker": "upload-tracker" },
      );
    });

    it("should throw AuthenticationError on 401", async () => {
      const mockResponse: HttpResponse = {
        status: 401,
        data: null,
        headers: {},
      };
      vi.mocked(transport.post).mockResolvedValue(mockResponse);

      await expect(store.upload("content")).rejects.toThrow(AuthenticationError);
    });

    it("should throw AuthenticationError on 403", async () => {
      const mockResponse: HttpResponse = {
        status: 403,
        data: null,
        headers: {},
      };
      vi.mocked(transport.post).mockResolvedValue(mockResponse);

      await expect(store.upload("content")).rejects.toThrow(AuthenticationError);
    });

    it("should throw ServerNotReachableError on server errors", async () => {
      const mockResponse: HttpResponse = {
        status: 500,
        data: null,
        headers: {},
      };
      vi.mocked(transport.post).mockResolvedValue(mockResponse);

      await expect(store.upload("content")).rejects.toThrow(ServerNotReachableError);
    });

    it("should handle null response data", async () => {
      const mockResponse: HttpResponse = {
        status: 200,
        data: null,
        headers: {},
      };
      vi.mocked(transport.post).mockResolvedValue(mockResponse);

      const result = await store.upload("content");

      expect(result).toEqual({});
    });
  });
});
